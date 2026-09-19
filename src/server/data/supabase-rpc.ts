import "server-only";

import type { ZodType } from "zod";

import { readPortalDataEnvironment, type PortalDataEnvironment } from "@/server/data/environment";
import {
  createPortalCorrelationId,
  defaultPortalTelemetryLogger,
  emitPortalTelemetry,
  portalLatencyMilliseconds,
  type PortalTelemetryEvent,
  type PortalTelemetryLocale,
  type PortalTelemetryLogger,
} from "@/server/telemetry/logger";

const defaultMaximumResponseBytes = 512 * 1024;
const sitemapShardMaximumResponseBytes = 2 * 1024 * 1024;
const rpcNames = new Set([
  "portal_search_processes_v2",
  "portal_search_processes_v3",
  "portal_search_flows_v3",
  "portal_facets_v3",
  "portal_navigation_v1",
  "portal_search_flows_v2",
  "portal_catalog_summary_v1",
  "portal_get_dataset_v1",
  "portal_list_versions_v1",
  "portal_list_process_exchanges_v1",
  "portal_facets_v2",
  "portal_sitemap_entries_v1",
  "portal_sitemap_manifest_v1",
  "portal_sitemap_shard_v1",
]);

export type PortalRpcName =
  | "portal_search_processes_v2"
  | "portal_search_processes_v3"
  | "portal_search_flows_v3"
  | "portal_facets_v3"
  | "portal_navigation_v1"
  | "portal_search_flows_v2"
  | "portal_catalog_summary_v1"
  | "portal_get_dataset_v1"
  | "portal_list_versions_v1"
  | "portal_list_process_exchanges_v1"
  | "portal_facets_v2"
  | "portal_sitemap_entries_v1"
  | "portal_sitemap_manifest_v1"
  | "portal_sitemap_shard_v1";

export type PortalFetchCachePolicy =
  { mode: "no-store" } | { mode: "revalidate"; seconds: number; tags: string[] };

export type PortalDataErrorCode = "invalid_request" | "upstream_unavailable" | "invalid_response";

export class PortalDataError extends Error {
  readonly code: PortalDataErrorCode;

  constructor(code: PortalDataErrorCode) {
    super(
      code === "invalid_request"
        ? "The Portal request is invalid."
        : "The public data service is temporarily unavailable.",
    );
    this.name = "PortalDataError";
    this.code = code;
  }
}

type NextFetchInit = RequestInit & {
  next?: {
    revalidate?: number;
    tags?: string[];
  };
};

export type PortalRpcClient = {
  call<T>(
    name: PortalRpcName,
    arguments_: Record<string, unknown>,
    responseSchema: ZodType<T>,
    cachePolicy: PortalFetchCachePolicy,
  ): Promise<T>;
};

type PortalRpcClientOptions = {
  environment?: PortalDataEnvironment;
  fetchImplementation?: typeof fetch;
  logger?: PortalTelemetryLogger;
  correlationId?: () => string;
  now?: () => number;
  locale?: PortalTelemetryLocale;
  telemetryEnvironment?: Record<string, string | undefined>;
};

function routeFamily(name: PortalRpcName): PortalTelemetryEvent["routeFamily"] {
  switch (name) {
    case "portal_search_processes_v3":
    case "portal_search_flows_v3":
    case "portal_search_processes_v2":
    case "portal_search_flows_v2":
      return "catalog_search";
    case "portal_catalog_summary_v1":
      return "catalog_summary";
    case "portal_get_dataset_v1":
      return "dataset_detail";
    case "portal_list_versions_v1":
      return "dataset_versions";
    case "portal_list_process_exchanges_v1":
      return "dataset_exchanges";
    case "portal_facets_v3":
    case "portal_navigation_v1":
    case "portal_facets_v2":
      return "catalog_facets";
    case "portal_sitemap_entries_v1":
    case "portal_sitemap_manifest_v1":
    case "portal_sitemap_shard_v1":
      return "sitemap";
  }
}

function maximumResponseBytes(name: PortalRpcName): number {
  if (name === "portal_navigation_v1") return 64 * 1024;
  return name === "portal_sitemap_shard_v1"
    ? sitemapShardMaximumResponseBytes
    : defaultMaximumResponseBytes;
}

function responseRowCount(payload: unknown): number | null {
  if (payload === null) {
    return 0;
  }
  if (Array.isArray(payload)) {
    return payload.length;
  }
  if (typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  for (const key of ["rows", "items", "groups", "shards"] as const) {
    if (Array.isArray(record[key])) {
      return record[key].length;
    }
  }
  return 1;
}

function cacheInit(policy: PortalFetchCachePolicy): Pick<NextFetchInit, "cache" | "next"> {
  if (policy.mode === "no-store") {
    return { cache: "no-store" };
  }

  return {
    cache: "force-cache",
    next: {
      revalidate: policy.seconds,
      tags: policy.tags,
    },
  };
}

async function readBoundedResponseBytes(
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  if (
    contentLength !== null &&
    /^\d+$/u.test(contentLength) &&
    Number(contentLength) > maximumBytes
  ) {
    try {
      await response.body?.cancel();
    } catch {
      // The response has already failed the declared-size bound.
    }
    throw new PortalDataError("invalid_response");
  }

  if (!response.body) {
    return new Uint8Array();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        try {
          await reader.cancel();
        } catch {
          // The bounded read has already failed closed.
        }
        throw new PortalDataError("invalid_response");
      }

      const stableChunk = new Uint8Array(value.byteLength);
      stableChunk.set(value);
      chunks.push(stableChunk);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function parseBoundedJson(response: Response, maximumBytes: number): Promise<unknown> {
  const bytes = await readBoundedResponseBytes(response, maximumBytes);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new PortalDataError("invalid_response");
  }
}

export function createPortalRpcClient(options: PortalRpcClientOptions = {}): PortalRpcClient {
  let environment: PortalDataEnvironment;
  try {
    environment = options.environment ?? readPortalDataEnvironment();
  } catch {
    throw new PortalDataError("upstream_unavailable");
  }
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const logger = options.logger ?? defaultPortalTelemetryLogger;
  const now = options.now ?? (() => performance.now());
  const telemetryEnvironment = options.telemetryEnvironment ?? process.env;

  return {
    async call<T>(
      name: PortalRpcName,
      arguments_: Record<string, unknown>,
      responseSchema: ZodType<T>,
      cachePolicy: PortalFetchCachePolicy,
    ): Promise<T> {
      if (!rpcNames.has(name)) {
        throw new PortalDataError("invalid_request");
      }

      const startedAt = now();
      const correlationId = createPortalCorrelationId(undefined, options.correlationId);
      const recordTelemetry = (
        status: PortalTelemetryEvent["status"],
        errorCode: PortalDataErrorCode | null,
        rowCount: number | null,
      ) => {
        emitPortalTelemetry(
          logger,
          {
            correlationId,
            routeFamily: routeFamily(name),
            rpcName: name,
            cachePolicy: cachePolicy.mode,
            cacheHit: "unknown",
            backend: "supabase_data_api",
            latencyMs: portalLatencyMilliseconds(startedAt, now()),
            rowCount,
            status,
            errorCode,
            ...(options.locale ? { locale: options.locale } : {}),
          },
          telemetryEnvironment,
        );
      };

      const target = new URL(`/rest/v1/rpc/${name}`, environment.supabaseUrl);
      const init: NextFetchInit = {
        method: "POST",
        body: JSON.stringify(arguments_),
        headers: {
          accept: "application/json",
          "accept-profile": "api",
          apikey: environment.publishableKey,
          "content-profile": "api",
          "content-type": "application/json",
        },
        redirect: "error",
        signal: AbortSignal.timeout(environment.timeoutMilliseconds),
        ...cacheInit(cachePolicy),
      };

      let response: Response;
      try {
        response = await fetchImplementation(target, init);
      } catch (error) {
        if (error instanceof PortalDataError) {
          recordTelemetry("error", error.code, null);
          throw error;
        }
        const dataError = new PortalDataError("upstream_unavailable");
        recordTelemetry("error", dataError.code, null);
        throw dataError;
      }

      if (!response.ok) {
        const dataError = new PortalDataError(
          response.status === 400 ? "invalid_request" : "upstream_unavailable",
        );
        recordTelemetry("error", dataError.code, null);
        throw dataError;
      }

      let payload: unknown;
      try {
        payload = await parseBoundedJson(response, maximumResponseBytes(name));
      } catch (error) {
        if (error instanceof PortalDataError) {
          recordTelemetry("error", error.code, null);
          throw error;
        }
        const dataError = new PortalDataError("invalid_response");
        recordTelemetry("error", dataError.code, null);
        throw dataError;
      }

      const parsed = responseSchema.safeParse(payload);
      if (!parsed.success) {
        const dataError = new PortalDataError("invalid_response");
        recordTelemetry("error", dataError.code, null);
        throw dataError;
      }

      recordTelemetry("ok", null, responseRowCount(parsed.data));
      return parsed.data;
    },
  };
}
