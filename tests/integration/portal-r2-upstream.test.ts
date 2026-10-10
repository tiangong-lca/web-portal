import { afterAll, beforeAll, describe, expect, it } from "vitest";

import environmentFixture from "../fixtures/portal/r1-environments.json";

import { createPortalHybridPostHandler } from "@/server/hybrid/handler";
import type { PortalHybridSearchRequest } from "@/lib/hybrid-request";
import { searchPublicFlows, searchPublicProcesses } from "@/server/data/catalog";
import { createPortalRpcClient } from "@/server/data/supabase-rpc";
import { queryPortalHybridRaw } from "@/server/hybrid/client";
import {
  startPortalR1FixtureServer,
  type PortalR1FixtureServer,
} from "../../scripts/portal-r1-fixture-server";

let fixture: PortalR1FixtureServer;

beforeAll(async () => {
  fixture = await startPortalR1FixtureServer({ environment: "preview" });
});

afterAll(async () => {
  await fixture.close();
});

function input(query: string): PortalHybridSearchRequest {
  return {
    schemaVersion: "portal.hybrid-search-request.v1",
    kind: "process",
    query,
    filters: {},
    limit: 10,
  };
}

function routeRequest(query: string) {
  return new Request("http://portal.test/internal/hybrid", {
    method: "POST",
    body: JSON.stringify(input(query)),
    headers: { "content-type": "application/json" },
  });
}

function createFixtureHandler() {
  const environment = {
    supabaseUrl: fixture.origin,
    publishableKey: environmentFixture.preview.publishableKey,
    timeoutMilliseconds: 2000,
    dataBrandScope: {
      allowedBrandCodes: ["tiangong_lca"] as const,
      identity: "portal-display-scope.v1:tiangong_lca",
    },
    edgeOrigin: fixture.origin,
    keyId: environmentFixture.preview.keyId,
    secret: environmentFixture.preview.hmacSecret,
    edgeTimeoutMilliseconds: 2000,
  };
  const rpcClient = createPortalRpcClient({
    environment,
    logger: () => undefined,
  });
  return createPortalHybridPostHandler({
    query: (rawBody, options) => queryPortalHybridRaw(rawBody, { ...options, environment }),
    lexicalFallback: (request) => {
      const searchInput = {
        query: request.query,
        filters: request.filters,
        sort: "relevance" as const,
        cursor: null,
        limit: request.limit,
      };
      return request.kind === "process"
        ? searchPublicProcesses(searchInput, rpcClient)
        : searchPublicFlows(searchInput, rpcClient);
    },
    logger: () => undefined,
  });
}

describe("Portal R2 isolated upstream fixture", () => {
  it("signs a successful Hybrid request and returns exhaustive advisory cards", async () => {
    const query = "private natural language must not be echoed";
    const response = await createFixtureHandler()(routeRequest(query));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      schemaVersion: "portal.hybrid-bff.v1",
      mode: "hybrid",
      fallbackReason: null,
      interpretation: { source: "model_generated", advisory: true },
    });
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({
      context: { reference: {}, source: {}, quality: {} },
    });
    expect(JSON.stringify(body)).not.toContain(query);
    expect(fixture.receipts.hybridAccepted).toBe(1);
    expect(fixture.receipts.lastHybrid).toMatchObject({
      keyId: environmentFixture.preview.keyId,
      bodyBytes: expect.any(Number),
      bodySha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
  });

  it("turns a fixed Edge guard rejection into real lexical results", async () => {
    const beforeRpc = fixture.receipts.rpcByName.portal_search_processes_v4 ?? 0;
    const response = await createFixtureHandler()(routeRequest("fixture:guard_unavailable"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      mode: "lexical_fallback",
      fallbackReason: "guard_unavailable",
      interpretation: null,
    });
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({ match: { kind: "lexical" }, context: {} });
    expect(fixture.receipts.rpcByName.portal_search_processes_v4).toBe(beforeRpc + 1);
  });
});
