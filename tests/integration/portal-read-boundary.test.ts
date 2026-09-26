// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";

import catalogFixture from "../fixtures/portal/catalog-v1.json";
import environmentFixture from "../fixtures/portal/r1-environments.json";

import { searchPublicFlows, searchPublicProcesses } from "@/server/data/catalog";
import { publicSearchPageSchema } from "@/server/contracts/portal";
import {
  createPortalReadCoordinator,
  type PortalCacheBoundary,
  type PortalReadEnvelope,
} from "@/server/data/read-coordinator";
import { createPortalRpcClient, type PortalFetchCachePolicy } from "@/server/data/supabase-rpc";
import type { PortalTelemetryEvent } from "@/server/telemetry/logger";
import {
  startPortalR1FixtureServer,
  type PortalR1FixtureServer,
} from "../../scripts/portal-r1-fixture-server";

const runningServers: PortalR1FixtureServer[] = [];

async function start() {
  const fixture = await startPortalR1FixtureServer({ environment: "preview" });
  runningServers.push(fixture);
  return fixture;
}

afterEach(async () => {
  await Promise.all(runningServers.splice(0).map((fixture) => fixture.close()));
});

function dataEnvironment(
  origin: string,
  publishableKey = environmentFixture.preview.publishableKey,
) {
  return { supabaseUrl: origin, publishableKey, timeoutMilliseconds: 2000 };
}

/** Cold boundary: every consumer runs the loader, as on a cache miss. */
function coldBoundary(): PortalCacheBoundary {
  return {
    async read(_key, _options, loader) {
      return await loader();
    },
  };
}

/** Stateful boundary: stores what the loader produced and serves it while fresh. */
function storeBoundary(): PortalCacheBoundary {
  const entries = new Map<string, { envelope: PortalReadEnvelope; revalidateSeconds: number }>();
  return {
    async read(key, { revalidateSeconds }, loader) {
      const stored = entries.get(key);
      if (
        stored !== undefined &&
        Date.now() - stored.envelope.loadedAtMs <= revalidateSeconds * 1000
      ) {
        return stored.envelope;
      }
      const envelope = await loader();
      entries.set(key, { envelope, revalidateSeconds });
      return envelope;
    },
  };
}

/** Stale boundary: the runtime serves the stored entry without touching origin. */
function staleBoundary(envelope: PortalReadEnvelope): PortalCacheBoundary {
  return {
    async read() {
      return envelope;
    },
  };
}

describe("Portal bounded read boundary against a real origin", () => {
  it("collapses concurrent same-parameter reads into one origin call", async () => {
    const fixture = await start();
    const events: PortalTelemetryEvent[] = [];
    const client = createPortalRpcClient({
      environment: dataEnvironment(fixture.origin),
      cacheBoundary: coldBoundary(),
      readCoordinator: createPortalReadCoordinator({ admissionWaitMs: 200 }),
      logger: (event) => {
        events.push(event);
      },
    });
    const query = `boundary-${crypto.randomUUID()}`;

    const pages = await Promise.all(
      Array.from({ length: 6 }, () =>
        searchPublicProcesses({ query, limit: 5 }, client, { cache: "short-public" }),
      ),
    );

    expect(pages).toHaveLength(6);
    expect(fixture.receipts.rpcByName["portal_search_processes_v2"]).toBe(1);
    const consumerOutcomes = events
      .filter((event) => event.eventKind === "consumer")
      .map((event) => event.cacheOutcome);
    expect(consumerOutcomes.filter((outcome) => outcome === "origin")).toHaveLength(1);
    expect(consumerOutcomes.filter((outcome) => outcome === "coalesced")).toHaveLength(5);
  });

  it("never merges different bodies or different deployments", async () => {
    const fixture = await start();
    // A second origin stands in for a different deployment identity: same key,
    // different origin, so the read keys must not collide.
    const otherFixture = await start();
    const shared = { cacheBoundary: coldBoundary() } as const;
    const first = createPortalRpcClient({
      environment: dataEnvironment(fixture.origin),
      ...shared,
    });
    const otherDeployment = createPortalRpcClient({
      environment: dataEnvironment(otherFixture.origin),
      ...shared,
    });

    await Promise.all([
      searchPublicProcesses({ query: "boundary-alpha" }, first, { cache: "short-public" }),
      searchPublicProcesses({ query: "boundary-beta" }, first, { cache: "short-public" }),
      searchPublicProcesses({ query: "boundary-alpha" }, otherDeployment, {
        cache: "short-public",
      }),
      searchPublicFlows({ query: "boundary-alpha" }, first, { cache: "short-public" }),
    ]);

    const totals = [fixture, otherFixture].map((server) => server.receipts.rpcByName);
    expect(
      totals.reduce(
        (sum, byName) =>
          sum +
          (byName["portal_search_processes_v2"] ?? 0) +
          (byName["portal_search_flows_v2"] ?? 0),
        0,
      ),
    ).toBe(4);
  });

  it("refuses to serve a payload older than the window when the origin is failing", async () => {
    const fixture = await start();
    const events: PortalTelemetryEvent[] = [];
    const client = createPortalRpcClient({
      environment: dataEnvironment(fixture.origin),
      cacheBoundary: staleBoundary({
        envelopeVersion: 1,
        loadedAtMs: Date.now() - 31_000,
        originMarker: "stale001",
        payload: { schemaVersion: "portal.public-search-page.v1", kind: "process", items: [] },
      }),
      fetchImplementation: async () => {
        throw new Error("origin unavailable");
      },
      logger: (event) => {
        events.push(event);
      },
    });

    await expect(
      searchPublicProcesses({ query: "boundary-stale" }, client, { cache: "short-public" }),
    ).rejects.toMatchObject({ code: "upstream_unavailable" });
    expect(events.some((event) => event.status === "error")).toBe(true);
  });

  it("keeps queries, identifiers and credentials out of the hosted log lines", async () => {
    const fixture = await start();
    const events: PortalTelemetryEvent[] = [];
    const client = createPortalRpcClient({
      environment: dataEnvironment(fixture.origin),
      cacheBoundary: coldBoundary(),
      logger: (event) => {
        events.push(event);
      },
    });
    const query = "natural language search text 7804";

    await searchPublicProcesses({ query, limit: 3 }, client, { cache: "short-public" });

    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(query);
    expect(serialized).not.toContain(environmentFixture.preview.publishableKey);
    expect(serialized).not.toContain("sb_publishable");
    const uuidShaped =
      serialized.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? [];
    // Only the per-request correlation token may be UUID shaped.
    expect(uuidShaped.every((value) => events.some((event) => event.correlationId === value))).toBe(
      true,
    );
    expect(uuidShaped.length).toBe(events.length);
  });
  it("derives the read key from the bytes it sends, not from later mutations", async () => {
    const fixture = await start();
    const bodies: string[] = [];
    const client = createPortalRpcClient({
      environment: dataEnvironment(fixture.origin),
      cacheBoundary: coldBoundary(),
      fetchImplementation: async (_target, init) => {
        const body = init?.body;
        bodies.push(typeof body === "string" ? body : "");
        return Response.json(catalogFixture.search);
      },
    });
    const arguments_: Record<string, unknown> = {
      p_query: "boundary-frozen",
      p_filters: {},
      p_sort: "relevance",
      p_cursor: null,
      p_limit: 5,
    };

    const pending = client.call("portal_search_processes_v2", arguments_, publicSearchPageSchema, {
      mode: "no-store",
      writeSchema: publicSearchPageSchema,
    });
    arguments_.p_query = "mutated-after-the-call";
    arguments_.p_limit = 99;
    await pending;

    expect(bodies).toHaveLength(1);
    const sent = JSON.parse(bodies[0]!) as Record<string, unknown>;
    expect(sent.p_query).toBe("boundary-frozen");
    expect(sent.p_limit).toBe(5);
  });

  it("keeps each caller's own schema check independent of the shared payload", async () => {
    const fixture = await start();
    const client = createPortalRpcClient({
      environment: dataEnvironment(fixture.origin),
      cacheBoundary: storeBoundary(),
    });
    const arguments_ = {
      p_query: `boundary-refine-${crypto.randomUUID()}`,
      p_filters: {},
      p_sort: "relevance",
      p_cursor: null,
      p_limit: 5,
    };
    const policy: PortalFetchCachePolicy = {
      mode: "revalidate",
      seconds: 30,
      tags: ["portal:catalog-search:process"],
      boundary: "bounded",
      writeSchema: publicSearchPageSchema,
    };

    // The first caller's own refinement rejects the payload it received.
    await expect(
      client.call(
        "portal_search_processes_v2",
        arguments_,
        publicSearchPageSchema.refine(() => false),
        policy,
      ),
    ).rejects.toMatchObject({ code: "invalid_response" });

    // A second caller with the base schema reuses the same shared entry.
    const page = await client.call(
      "portal_search_processes_v2",
      arguments_,
      publicSearchPageSchema,
      policy,
    );
    expect(page.kind).toBe("process");
    expect(fixture.receipts.rpcByName["portal_search_processes_v2"]).toBe(1);
  });

  it("logs only a closed-vocabulary query shape", async () => {
    const fixture = await start();
    const events: PortalTelemetryEvent[] = [];
    const client = createPortalRpcClient({
      environment: dataEnvironment(fixture.origin),
      cacheBoundary: coldBoundary(),
      logger: (event) => {
        events.push(event);
      },
    });

    await searchPublicProcesses({ query: "", limit: 3 }, client, { cache: "short-public" });
    await searchPublicProcesses({ query: crypto.randomUUID(), limit: 3 }, client, {
      cache: "short-public",
    });

    const shapes = events.filter((event) => event.eventKind === "consumer");
    expect(shapes.some((event) => event.queryShape === "empty")).toBe(true);
    expect(shapes.some((event) => event.queryShape === "identifier")).toBe(true);
    expect(shapes.every((event) => event.sort === "relevance")).toBe(true);
    expect(shapes.every((event) => event.hasFilters === false)).toBe(true);
    expect(shapes.every((event) => event.hasCursor === false)).toBe(true);
    expect(JSON.stringify(events)).not.toContain("natural language");
  });
});
