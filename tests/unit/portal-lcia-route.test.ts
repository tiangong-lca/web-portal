import { describe, expect, it, vi } from "vitest";

import fixture from "../fixtures/portal/catalog-v1.json";

import { createPortalLciaPostHandler } from "@/app/internal/lcia/route";
import { queryPublishedLciaRaw, type PublishedLciaResult } from "@/server/lcia/client";
import type { PortalTelemetryEvent } from "@/server/telemetry/logger";

const POST = createPortalLciaPostHandler({ logger: () => undefined });
const correlationId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function request(body: string, headers: HeadersInit = {}) {
  return new Request("https://portal.example/internal/lcia", {
    method: "POST",
    body,
    headers,
  });
}

describe("Portal LCIA same-origin Route Handler", () => {
  it("rejects cross-origin browser posts before signing", async () => {
    const response = await POST(
      request("{}", { "content-type": "application/json", origin: "https://attacker.example" }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: "cross_origin_request" });
  });

  it("requires JSON and a bounded request body", async () => {
    const wrongType = await POST(request("{}", { "content-type": "text/plain" }));
    expect(wrongType.status).toBe(415);

    const oversized = await POST(
      request("{}", {
        "content-length": String(16 * 1024 + 1),
        "content-type": "application/json",
      }),
    );
    expect(oversized.status).toBe(413);
  });

  it("cancels a chunked body immediately after crossing the 16 KiB limit", async () => {
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(8192));
        controller.enqueue(new Uint8Array(8192));
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() {
        canceled = true;
      },
    });
    const query = vi.fn<typeof queryPublishedLciaRaw>();
    const handler = createPortalLciaPostHandler({ logger: () => undefined, query });
    const chunkedRequest = new Request("https://portal.example/internal/lcia", {
      method: "POST",
      body: stream,
      headers: { "content-type": "application/json" },
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    const response = await handler(chunkedRequest);

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ code: "body_too_large" });
    expect(canceled).toBe(true);
    expect(query).not.toHaveBeenCalled();
  });

  it("returns a generic 400 for malformed LCIA JSON without requiring secrets", async () => {
    const response = await POST(request("not-json", { "content-type": "application/json" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "invalid_request" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("emits safe available telemetry and returns the correlation ID", async () => {
    const events: PortalTelemetryEvent[] = [];
    const query = vi.fn<typeof queryPublishedLciaRaw>(
      async () => ({ status: "available", data: fixture.lcia }) as PublishedLciaResult,
    );
    const handler = createPortalLciaPostHandler({
      logger: (event) => {
        events.push(event);
      },
      query,
      now: (() => {
        const values = [10, 14];
        return () => values.shift() ?? 14;
      })(),
      telemetryEnvironment: { PORTAL_DEPLOYMENT_SHA: "d".repeat(40) },
    });
    const rawBody = JSON.stringify({
      mode: "process_all_impacts",
      processRefs: [{ id: "11111111-1111-1111-1111-111111111111", version: "01.00.000" }],
      impactCategoryId: null,
      cursor: null,
      limit: 20,
    });
    const response = await handler(
      request(rawBody, {
        "content-type": "application/json",
        "x-portal-correlation-id": correlationId,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-portal-correlation-id")).toBe(correlationId);
    expect(query).toHaveBeenCalledWith(expect.any(Uint8Array), { correlationId });
    expect(events).toEqual([
      {
        correlationId,
        routeFamily: "lcia_bff",
        rpcName: null,
        cachePolicy: "no-store",
        cacheHit: "unknown",
        backend: "portal_edge_lcia",
        latencyMs: 4,
        rowCount: 1,
        status: "ok",
        errorCode: null,
        deploymentSha: "d".repeat(40),
        instanceMarker: expect.stringMatching(/^[a-f0-9]{8}$/),
      },
    ]);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("11111111-1111-1111-1111-111111111111");
    expect(serialized).not.toContain("bodyHash");
    expect(serialized).not.toContain("keyId");
  });

  it("keeps the route response stable when the telemetry sink throws", async () => {
    const handler = createPortalLciaPostHandler({
      logger: () => {
        throw new Error("telemetry sink failed");
      },
      query: async () => ({ status: "unavailable", data: null }),
      correlationId: () => correlationId,
    });
    const response = await handler(
      request(
        JSON.stringify({
          mode: "process_all_impacts",
          processRefs: [{ id: "11111111-1111-1111-1111-111111111111", version: "01.00.000" }],
          impactCategoryId: null,
          cursor: null,
          limit: 20,
        }),
        { "content-type": "application/json" },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "unavailable", data: null });
  });
});
