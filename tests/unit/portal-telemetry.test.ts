import { describe, expect, it, vi } from "vitest";

import fixture from "../fixtures/portal/catalog-v1.json";
import environmentFixture from "../fixtures/portal/r1-environments.json";

import { publicSearchPageSchema } from "@/server/contracts/portal";
import { createPortalRpcClient, PortalDataError } from "@/server/data/supabase-rpc";
import {
  createPortalCorrelationId,
  emitPortalTelemetry,
  readPortalDeploymentSha,
  type PortalTelemetryEvent,
  type PortalTelemetryLogger,
} from "@/server/telemetry/logger";

const correlationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const deploymentSha = "c".repeat(40);
const environment = {
  supabaseUrl: "https://project.supabase.co",
  publishableKey: environmentFixture.preview.publishableKey,
  timeoutMilliseconds: 1000,
};

function sequence(...values: number[]) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)]!;
}

describe("Portal structured telemetry", () => {
  it("logs only allowlisted RPC metadata with a deterministic correlation ID", async () => {
    const events: PortalTelemetryEvent[] = [];
    const logger: PortalTelemetryLogger = (event) => {
      events.push(event);
    };
    const fetchImplementation = vi.fn<typeof fetch>(async () => Response.json(fixture.search));
    const client = createPortalRpcClient({
      environment,
      fetchImplementation,
      logger,
      correlationId: () => correlationId,
      now: sequence(100, 107),
      locale: "en",
      telemetryEnvironment: { PORTAL_DEPLOYMENT_SHA: deploymentSha },
    });

    await client.call(
      "portal_search_processes_v2",
      {
        p_query: "fixture-query-must-not-be-logged",
        p_filters: {},
        p_sort: "relevance",
        p_cursor: null,
        p_limit: 20,
      },
      publicSearchPageSchema,
      { mode: "no-store" },
    );

    expect(events).toEqual([
      {
        correlationId,
        routeFamily: "catalog_search",
        rpcName: "portal_search_processes_v2",
        cachePolicy: "no-store",
        cacheHit: "unknown",
        queryShape: "text",
        hasFilters: false,
        hasCursor: false,
        sort: "relevance",
        backend: "supabase_data_api",
        latencyMs: 7,
        rowCount: 1,
        status: "ok",
        errorCode: null,
        locale: "en",
        deploymentSha,
      },
    ]);
    const serialized = JSON.stringify(events);
    for (const forbidden of [
      "fixture-query-must-not-be-logged",
      fixture.datasetProcess.key.id,
      environment.publishableKey,
      environmentFixture.preview.hmacSecret,
      "bodyHash",
      "keyId",
      "locator",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("records generic RPC failures without exposing upstream response content", async () => {
    const events: PortalTelemetryEvent[] = [];
    const client = createPortalRpcClient({
      environment,
      fetchImplementation: vi.fn<typeof fetch>(async () =>
        Response.json(
          { message: "private SQL and locator fixture-query-must-not-be-logged" },
          { status: 503 },
        ),
      ),
      logger: (event) => {
        events.push(event);
      },
      correlationId: () => correlationId,
      now: sequence(1, 3),
      telemetryEnvironment: { PORTAL_DEPLOYMENT_SHA: deploymentSha },
    });

    await expect(
      client.call(
        "portal_search_processes_v2",
        { p_query: "fixture-query-must-not-be-logged" },
        publicSearchPageSchema,
        { mode: "no-store" },
      ),
    ).rejects.toBeInstanceOf(PortalDataError);
    expect(events).toMatchObject([
      {
        status: "error",
        errorCode: "upstream_unavailable",
        rowCount: null,
      },
    ]);
    expect(JSON.stringify(events)).not.toContain("private SQL");
    expect(JSON.stringify(events)).not.toContain("fixture-query-must-not-be-logged");
  });

  it("never lets sync or async logger failures change a successful RPC", async () => {
    for (const logger of [
      () => {
        throw new Error("telemetry sink failed");
      },
      async () => Promise.reject(new Error("async telemetry sink failed")),
    ] satisfies PortalTelemetryLogger[]) {
      const client = createPortalRpcClient({
        environment,
        fetchImplementation: vi.fn<typeof fetch>(async () => Response.json(fixture.search)),
        logger,
        correlationId: () => correlationId,
      });

      await expect(
        client.call(
          "portal_search_processes_v2",
          { p_query: "electricity" },
          publicSearchPageSchema,
          { mode: "no-store" },
        ),
      ).resolves.toMatchObject({ schemaVersion: "portal.public-search-page.v2" });
    }
  });

  it("validates correlation IDs and never emits an unvalidated deployment marker", () => {
    expect(createPortalCorrelationId(correlationId, () => crypto.randomUUID())).toBe(correlationId);
    expect(createPortalCorrelationId("raw-query-as-id", () => correlationId)).toBe(correlationId);
    expect(readPortalDeploymentSha({ PORTAL_DEPLOYMENT_SHA: deploymentSha })).toBe(deploymentSha);
    expect(
      readPortalDeploymentSha({
        PORTAL_BUILD_SHA: "a".repeat(40),
        PORTAL_DEPLOYMENT_SHA: deploymentSha,
      }),
    ).toBe("a".repeat(40));
    expect(readPortalDeploymentSha({ NODE_ENV: "test" })).toBe("local");
    expect(readPortalDeploymentSha({ NODE_ENV: "development" })).toBe("local");
    expect(readPortalDeploymentSha({ NODE_ENV: "production" })).toBe("unknown");
    expect(
      readPortalDeploymentSha({ NODE_ENV: "production", PORTAL_DEPLOYMENT_SHA: "local" }),
    ).toBe("unknown");
    expect(readPortalDeploymentSha({ PORTAL_DEPLOYMENT_SHA: "branch/name with secret" })).toBe(
      "unknown",
    );

    const logger = vi.fn<PortalTelemetryLogger>();
    emitPortalTelemetry(
      logger,
      {
        correlationId,
        routeFamily: "lcia_bff",
        rpcName: null,
        cachePolicy: "no-store",
        cacheHit: "unknown",
        backend: "portal_bff",
        latencyMs: 0,
        rowCount: 0,
        status: "rejected",
        errorCode: "invalid_request",
      },
      { PORTAL_DEPLOYMENT_SHA: "branch/name with secret" },
    );
    expect(logger).toHaveBeenCalledWith(expect.objectContaining({ deploymentSha: "unknown" }));
    expect(JSON.stringify(logger.mock.calls)).not.toContain("branch/name with secret");
  });
});
