import "server-only";

import type { PortalHybridSearchRequest } from "@/lib/hybrid-request";
import {
  portalHybridBffResponseSchema,
  type PortalHybridFallbackReason,
} from "@/server/hybrid/contracts";
import {
  parsePortalHybridRequestBody,
  PortalHybridInputError,
  queryPortalHybridRaw,
  type PortalHybridQueryResult,
} from "@/server/hybrid/client";
import type { PublicSearchPage } from "@/server/contracts/portal";
import { searchPublicFlows, searchPublicProcesses } from "@/server/data/catalog";
import { PortalDataError } from "@/server/data/supabase-rpc";
import {
  createPortalCorrelationId,
  defaultPortalTelemetryLogger,
  emitPortalTelemetry,
  portalLatencyMilliseconds,
  type PortalTelemetryEvent,
  type PortalTelemetryLogger,
} from "@/server/telemetry/logger";

const maximumBodyBytes = 32 * 1024;

class PortalBodyTooLargeError extends Error {}

async function readBoundedBody(request: Request): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBodyBytes) {
        try {
          await reader.cancel();
        } catch {
          // The bounded read has already failed closed.
        }
        throw new PortalBodyTooLargeError();
      }
      const stableChunk = new Uint8Array(value.byteLength);
      stableChunk.set(value);
      chunks.push(stableChunk);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function expectedOrigin(request: Request): string | null {
  const configuredSiteUrl = process.env.SITE_URL;
  try {
    if (configuredSiteUrl) {
      const siteUrl = new URL(configuredSiteUrl);
      const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(siteUrl.hostname);
      if (
        (siteUrl.protocol !== "https:" && !(siteUrl.protocol === "http:" && loopback)) ||
        siteUrl.username !== "" ||
        siteUrl.password !== ""
      ) {
        return null;
      }
      return siteUrl.origin;
    }
    return new URL(request.url).origin;
  } catch {
    return null;
  }
}

function jsonResponse(body: Record<string, unknown>, status: number, correlationId: string) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-portal-correlation-id": correlationId,
    },
  });
}

async function defaultLexicalFallback(input: PortalHybridSearchRequest): Promise<PublicSearchPage> {
  const searchInput = {
    query: input.query,
    filters: input.filters,
    sort: "relevance" as const,
    cursor: input.schemaVersion === "portal.hybrid-search-request.v2" ? input.cursor : null,
    limit: input.limit,
  };
  return input.kind === "process"
    ? searchPublicProcesses(searchInput)
    : searchPublicFlows(searchInput);
}

type PortalHybridRouteDependencies = {
  lexicalOnly?: boolean;
  logger?: PortalTelemetryLogger;
  query?: typeof queryPortalHybridRaw;
  lexicalFallback?: typeof defaultLexicalFallback;
  correlationId?: () => string;
  now?: () => number;
  telemetryEnvironment?: Record<string, string | undefined>;
};

export function createPortalHybridPostHandler(dependencies: PortalHybridRouteDependencies = {}) {
  const logger = dependencies.logger ?? defaultPortalTelemetryLogger;
  const query = dependencies.query ?? queryPortalHybridRaw;
  const lexicalFallback = dependencies.lexicalFallback ?? defaultLexicalFallback;
  const now = dependencies.now ?? (() => performance.now());
  const telemetryEnvironment = dependencies.telemetryEnvironment ?? process.env;

  return async function portalHybridPost(request: Request): Promise<Response> {
    const startedAt = now();
    const correlationId = createPortalCorrelationId(
      request.headers.get("x-portal-correlation-id") ?? undefined,
      dependencies.correlationId,
    );
    const respond = (
      body: Record<string, unknown>,
      httpStatus: number,
      status: PortalTelemetryEvent["status"],
      errorCode: PortalTelemetryEvent["errorCode"],
      rowCount: number | null,
      backend: PortalTelemetryEvent["backend"],
    ) => {
      emitPortalTelemetry(
        logger,
        {
          correlationId,
          routeFamily: "hybrid_bff",
          rpcName: null,
          cachePolicy: "no-store",
          cacheHit: "unknown",
          backend,
          latencyMs: portalLatencyMilliseconds(startedAt, now()),
          rowCount,
          status,
          errorCode,
        },
        telemetryEnvironment,
      );
      return jsonResponse(body, httpStatus, correlationId);
    };

    const origin = request.headers.get("origin");
    if (origin !== null) {
      const allowedOrigin = expectedOrigin(request);
      try {
        if (!allowedOrigin || new URL(origin).origin !== allowedOrigin) {
          return respond(
            { code: "cross_origin_request" },
            403,
            "rejected",
            "cross_origin_request",
            0,
            "portal_bff",
          );
        }
      } catch {
        return respond(
          { code: "cross_origin_request" },
          403,
          "rejected",
          "cross_origin_request",
          0,
          "portal_bff",
        );
      }
    }

    const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "application/json") {
      return respond(
        { code: "invalid_request" },
        415,
        "rejected",
        "unsupported_media_type",
        0,
        "portal_bff",
      );
    }

    const declaredLength = request.headers.get("content-length");
    if (
      declaredLength !== null &&
      /^\d+$/u.test(declaredLength) &&
      Number(declaredLength) > maximumBodyBytes
    ) {
      return respond(
        { code: "body_too_large" },
        413,
        "rejected",
        "body_too_large",
        0,
        "portal_bff",
      );
    }

    let rawBody: Uint8Array;
    let input: PortalHybridSearchRequest;
    try {
      rawBody = await readBoundedBody(request);
      input = parsePortalHybridRequestBody(rawBody);
    } catch (error) {
      if (error instanceof PortalBodyTooLargeError) {
        return respond(
          { code: "body_too_large" },
          413,
          "rejected",
          "body_too_large",
          0,
          "portal_bff",
        );
      }
      return respond(
        { code: "invalid_request" },
        400,
        "rejected",
        "invalid_request",
        0,
        "portal_bff",
      );
    }

    let edgeResult: PortalHybridQueryResult;
    const versioned = input.schemaVersion === "portal.hybrid-search-request.v2";
    if (dependencies.lexicalOnly) {
      if (!versioned)
        return respond(
          { code: "invalid_request" },
          400,
          "rejected",
          "invalid_request",
          0,
          "portal_bff",
        );
      try {
        const page = await lexicalFallback(input);
        const payload = portalHybridBffResponseSchema.parse({
          schemaVersion: "portal.hybrid-bff.v2",
          mode: "lexical",
          kind: page.kind,
          queryFingerprint: page.queryFingerprint,
          fallbackReason: null,
          interpretation: null,
          items: page.items,
          nextCursor: page.nextCursor,
        });
        if (page.kind !== input.kind || page.items.length > input.limit)
          throw new PortalDataError("invalid_response");
        return respond(payload, 200, "ok", null, page.items.length, "supabase_data_api");
      } catch {
        return respond(
          { code: "upstream_unavailable" },
          503,
          "temporarily_unavailable",
          "upstream_unavailable",
          null,
          "portal_bff",
        );
      }
    }
    try {
      edgeResult = await query(rawBody, { correlationId, signal: request.signal });
    } catch (error) {
      if (error instanceof PortalHybridInputError) {
        return respond(
          { code: "invalid_request" },
          400,
          "rejected",
          "invalid_request",
          0,
          "portal_bff",
        );
      }
      edgeResult = { status: "fallback", reason: "internal_error" };
    }

    if (edgeResult.status === "available") {
      const payload = portalHybridBffResponseSchema.safeParse({
        schemaVersion: versioned ? "portal.hybrid-bff.v2" : "portal.hybrid-bff.v1",
        mode: "hybrid",
        kind: edgeResult.data.kind,
        queryFingerprint: edgeResult.data.queryFingerprint,
        fallbackReason: null,
        interpretation: edgeResult.data.interpretation,
        items: edgeResult.data.items,
        ...(versioned && edgeResult.data.schemaVersion === "portal.hybrid-search-page.v3"
          ? {
              candidateCount: edgeResult.data.candidateCount,
              datasetCount: edgeResult.data.datasetCount,
              versionGroups: edgeResult.data.versionGroups,
              nextCursor: edgeResult.data.nextCursor,
            }
          : {}),
      });
      if (
        !payload.success ||
        edgeResult.data.kind !== input.kind ||
        edgeResult.data.items.length > input.limit
      ) {
        edgeResult = { status: "fallback", reason: "contract_failure" };
      } else {
        return respond(
          payload.data,
          200,
          "ok",
          null,
          payload.data.items.length,
          "portal_edge_hybrid",
        );
      }
    }

    const fallbackReason = edgeResult.reason as PortalHybridFallbackReason;
    if (request.signal.aborted) {
      return respond(
        { code: "hybrid_upstream_unavailable" },
        499,
        "unavailable",
        "hybrid_upstream_unavailable",
        0,
        "portal_bff",
      );
    }
    // A failed ranked cursor must never become lexical page one or reorder existing results.
    if (input.schemaVersion === "portal.hybrid-search-request.v2" && input.cursor !== null) {
      return respond(
        {
          code:
            fallbackReason === "invalid_request"
              ? "hybrid_cursor_expired"
              : "hybrid_page_unavailable",
        },
        fallbackReason === "invalid_request" ? 409 : 503,
        "temporarily_unavailable",
        fallbackReason,
        null,
        "portal_edge_hybrid",
      );
    }
    try {
      const page = await lexicalFallback(input);
      const payload = portalHybridBffResponseSchema.safeParse({
        schemaVersion: versioned ? "portal.hybrid-bff.v2" : "portal.hybrid-bff.v1",
        mode: "lexical_fallback",
        kind: page.kind,
        queryFingerprint: page.queryFingerprint,
        fallbackReason,
        interpretation: null,
        items: page.items,
        ...(versioned ? { nextCursor: page.nextCursor } : {}),
      });
      if (!payload.success || page.kind !== input.kind)
        throw new PortalDataError("invalid_response");
      return respond(
        payload.data,
        200,
        "fallback",
        fallbackReason,
        payload.data.items.length,
        "portal_edge_hybrid",
      );
    } catch (error) {
      if (!(error instanceof PortalDataError)) {
        // Unexpected fallback errors are still collapsed to one public failure.
      }
      return respond(
        { code: "hybrid_fallback_unavailable" },
        503,
        "temporarily_unavailable",
        "hybrid_fallback_unavailable",
        null,
        "portal_bff",
      );
    }
  };
}
