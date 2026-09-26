import "server-only";

import type { ZodType } from "zod";

import { portalNextDataCacheBoundary } from "@/server/data/cache-boundary";
import { readPortalDataEnvironment, type PortalDataEnvironment } from "@/server/data/environment";
import { PortalDataError, type PortalDataErrorCode } from "@/server/data/portal-data-error";
import {
  createPortalReadCoordinator,
  PortalLocalShedError,
  type PortalReadCoordinatorOptions,
  portalReadIdentity,
  portalReadKey,
  type PortalCacheBoundary,
  type PortalReadCoordinator,
  type PortalReadResult,
} from "@/server/data/read-coordinator";
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

export { PortalDataError };
export type { PortalDataErrorCode };

/**
 * `boundary: "bounded"` routes an expensive public read through local admission
 * control, same-parameter coalescing and the freshness envelope, and requires a
 * write schema so a shared payload is validated before it is cached. `"legacy"`
 * keeps the previous fetch-cache path; statically rendered call sites must use
 * it, because the bounded path issues a `no-store` origin request that would
 * otherwise opt the route out of static generation.
 */
export type PortalFetchCachePolicy =
  | { mode: "no-store"; writeSchema?: ZodType<unknown> }
  | {
      mode: "revalidate";
      seconds: number;
      tags: string[];
      boundary?: "bounded" | "legacy";
      writeSchema?: ZodType<unknown>;
    };

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
  wallClockNow?: () => number;
  locale?: PortalTelemetryLocale;
  telemetryEnvironment?: Record<string, string | undefined>;
  cacheBoundary?: PortalCacheBoundary;
  readCoordinator?: PortalReadCoordinator;
  maximumConcurrentOrigins?: number;
  admissionWaitMs?: number;
  cooldownMs?: number;
};

/** Route families whose reads are expensive enough to need the bounded path. */
const boundedFamilies = new Set<PortalTelemetryEvent["routeFamily"]>([
  "catalog_search",
  "catalog_facets",
]);

function emitOriginTelemetry(
  record: Parameters<NonNullable<PortalReadCoordinatorOptions["onOrigin"]>>[0],
  logger: PortalTelemetryLogger,
  locale: PortalTelemetryLocale | undefined,
  environment: Record<string, string | undefined>,
): void {
  emitPortalTelemetry(
    logger,
    {
      correlationId: createPortalCorrelationId(),
      eventKind: "origin",
      routeFamily: record.family as PortalTelemetryEvent["routeFamily"],
      rpcName: record.rpcName as PortalTelemetryEvent["rpcName"],
      cachePolicy: "no-store",
      cacheHit: false,
      backend: "supabase_data_api",
      latencyMs: portalLatencyMilliseconds(0, record.durationMs),
      rowCount: null,
      status: record.status === "ok" ? "ok" : "error",
      errorCode:
        record.status === "ok"
          ? null
          : record.reason === "capacity"
            ? "local_capacity_shed"
            : record.reason === "cooldown"
              ? "local_cooldown_shed"
              : "upstream_unavailable",
      gateQueuedMs: record.gateWaitMs,
      originMarker: record.marker,
      ...(locale ? { locale } : {}),
    },
    environment,
  );
}

/**
 * One coordinator per process: same-parameter coalescing only works when every
 * request of this instance shares the in-flight table. It is deliberately not
 * a global limit — with several instances the ceiling scales with them.
 */
let sharedReadCoordinator: PortalReadCoordinator | null = null;

function sharedOrDefaultCoordinator(): PortalReadCoordinator {
  sharedReadCoordinator ??= createPortalReadCoordinator({
    onOrigin: (record) => {
      emitOriginTelemetry(record, defaultPortalTelemetryLogger, undefined, process.env);
    },
  });
  return sharedReadCoordinator;
}

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

const identifierShapedQuery =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9]{2,7}-[0-9]{2}-[0-9])$/u;
const catalogSortValues = new Set(["relevance", "modified_desc", "name_asc"]);

/**
 * A closed-vocabulary description of a catalog read for hosted logs. It never
 * carries the query text, a filter value, a cursor, or an identifier.
 */
function describeCatalogRead(
  name: PortalRpcName,
  arguments_: Record<string, unknown>,
): Pick<PortalTelemetryEvent, "queryShape" | "hasFilters" | "hasCursor" | "sort"> | undefined {
  const family = routeFamily(name);
  if (family !== "catalog_search" && family !== "catalog_facets") {
    return undefined;
  }

  const rawQuery = arguments_.p_query;
  const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
  const queryShape =
    query === ""
      ? ("empty" as const)
      : identifierShapedQuery.test(query)
        ? ("identifier" as const)
        : ("text" as const);

  const filters = arguments_.p_filters;
  const hasFilters =
    filters !== null &&
    typeof filters === "object" &&
    !Array.isArray(filters) &&
    Object.keys(filters as Record<string, unknown>).length > 0;

  const rawCursor = arguments_.p_cursor;
  const hasCursor = typeof rawCursor === "string" && rawCursor.length > 0;

  const rawSort = arguments_.p_sort;
  const sort =
    typeof rawSort === "string" ? (catalogSortValues.has(rawSort) ? rawSort : "other") : undefined;

  return {
    queryShape,
    hasFilters,
    hasCursor,
    ...(sort === undefined ? {} : { sort: sort as PortalTelemetryEvent["sort"] }),
  };
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
  const wallClockNow = options.wallClockNow ?? (() => Date.now());
  const telemetryEnvironment = options.telemetryEnvironment ?? process.env;
  const cacheBoundary = options.cacheBoundary ?? portalNextDataCacheBoundary;
  const readCoordinator =
    options.readCoordinator ??
    (options.logger === undefined &&
    options.maximumConcurrentOrigins === undefined &&
    options.admissionWaitMs === undefined &&
    options.cooldownMs === undefined
      ? sharedOrDefaultCoordinator()
      : createPortalReadCoordinator({
          now: wallClockNow,
          onOrigin: (record) => {
            emitOriginTelemetry(record, logger, options.locale, telemetryEnvironment);
          },
          ...(options.maximumConcurrentOrigins === undefined
            ? {}
            : { maximumConcurrentOrigins: options.maximumConcurrentOrigins }),
          ...(options.admissionWaitMs === undefined
            ? {}
            : { admissionWaitMs: options.admissionWaitMs }),
          ...(options.cooldownMs === undefined ? {} : { cooldownMs: options.cooldownMs }),
        }));
  const readIdentity = portalReadIdentity(environment.supabaseUrl, environment.publishableKey);

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

      // Serialized once and reused, so the read key, the request body and the
      // payload stay consistent even if the caller mutates its arguments later.
      const requestBody = JSON.stringify(arguments_);
      const readArguments = JSON.parse(requestBody) as Record<string, unknown>;
      const readShape = describeCatalogRead(name, readArguments);
      const startedAt = now();
      const correlationId = createPortalCorrelationId(undefined, options.correlationId);
      const recordTelemetry = (
        status: PortalTelemetryEvent["status"],
        errorCode: PortalDataErrorCode | PortalTelemetryEvent["errorCode"],
        rowCount: number | null,
        consumer?: PortalReadResult["consumer"],
      ) => {
        emitPortalTelemetry(
          logger,
          {
            correlationId,
            routeFamily: routeFamily(name),
            rpcName: name,
            cachePolicy: cachePolicy.mode,
            // Bounded reads report an empirical outcome; everything else keeps
            // the honest "unknown" placeholder.
            cacheHit: consumer === undefined ? "unknown" : consumer.outcome === "cache",
            backend: "supabase_data_api",
            latencyMs: portalLatencyMilliseconds(startedAt, now()),
            rowCount,
            status,
            errorCode,
            ...(consumer === undefined
              ? {}
              : {
                  eventKind: "consumer" as const,
                  cacheOutcome: consumer.outcome,
                  dedupeShared: consumer.dedupeShared,
                  loadedAtAgeMs: consumer.loadedAtAgeMs,
                  gateQueuedMs: consumer.gateWaitMs,
                  originMarker: consumer.originMarker,
                }),
            // A closed-vocabulary description only: never the query text, a
            // filter value, an identifier, or a token.
            ...readShape,
            ...(options.locale ? { locale: options.locale } : {}),
          },
          telemetryEnvironment,
        );
      };

      const target = new URL(`/rest/v1/rpc/${name}`, environment.supabaseUrl);
      const maximumBytes = maximumResponseBytes(name);
      const requestInit = (signal: AbortSignal, policy: PortalFetchCachePolicy): NextFetchInit => ({
        method: "POST",
        body: requestBody,
        headers: {
          accept: "application/json",
          "accept-profile": "api",
          apikey: environment.publishableKey,
          "content-profile": "api",
          "content-type": "application/json",
        },
        redirect: "error",
        signal,
        ...cacheInit(policy),
      });

      // Origin reads always carry their own timeout; a consumer's own deadline
      // only bounds that consumer's wait and never cancels a shared load.
      const loadOrigin = async (
        signal: AbortSignal,
        policy: PortalFetchCachePolicy,
      ): Promise<unknown> => {
        let response: Response;
        try {
          response = await fetchImplementation(target, requestInit(signal, policy));
        } catch (error) {
          if (error instanceof PortalDataError) throw error;
          throw new PortalDataError("upstream_unavailable");
        }

        if (!response.ok) {
          throw new PortalDataError(
            response.status === 400 ? "invalid_request" : "upstream_unavailable",
          );
        }

        try {
          return await parseBoundedJson(response, maximumBytes);
        } catch (error) {
          if (error instanceof PortalDataError) throw error;
          throw new PortalDataError("invalid_response");
        }
      };

      const family = routeFamily(name);
      const deadlineMs = wallClockNow() + environment.timeoutMilliseconds;
      const writeSchema = cachePolicy.writeSchema;
      const bounded =
        cachePolicy.mode === "revalidate" &&
        cachePolicy.boundary !== "legacy" &&
        boundedFamilies.has(family) &&
        writeSchema !== undefined;
      const coalesced =
        cachePolicy.mode === "no-store" && boundedFamilies.has(family) && writeSchema !== undefined;

      let payload: unknown;
      let consumer: PortalReadResult["consumer"] | undefined;
      try {
        if (bounded && cachePolicy.mode === "revalidate") {
          const outcome = await readCoordinator.runBounded({
            key: portalReadKey({
              identity: readIdentity,
              rpcName: name,
              arguments_: readArguments,
              timeoutMs: environment.timeoutMilliseconds,
              policy: {
                mode: "revalidate",
                seconds: cachePolicy.seconds,
                tags: cachePolicy.tags,
              },
            }),
            family,
            rpcName: name,
            revalidateSeconds: cachePolicy.seconds,
            tags: cachePolicy.tags,
            timeoutMs: environment.timeoutMilliseconds,
            deadlineMs,
            boundary: cacheBoundary,
            validate: (candidate) => writeSchema.safeParse(candidate).success,
            load: (signal) => loadOrigin(signal, { mode: "no-store" }),
          });
          payload = outcome.payload;
          consumer = outcome.consumer;
        } else if (coalesced && cachePolicy.mode === "no-store" && writeSchema !== undefined) {
          const outcome = await readCoordinator.runCoalesced({
            key: portalReadKey({
              identity: readIdentity,
              rpcName: name,
              arguments_: readArguments,
              timeoutMs: environment.timeoutMilliseconds,
              policy: { mode: "no-store" },
            }),
            family,
            rpcName: name,
            timeoutMs: environment.timeoutMilliseconds,
            deadlineMs,
            validate: (candidate) => writeSchema.safeParse(candidate).success,
            load: (signal) => loadOrigin(signal, { mode: "no-store" }),
          });
          payload = outcome.payload;
          consumer = outcome.consumer;
        } else {
          payload = await loadOrigin(
            AbortSignal.timeout(environment.timeoutMilliseconds),
            cachePolicy,
          );
        }
      } catch (error) {
        const localShed = error instanceof PortalLocalShedError ? error.reason : null;
        const code: PortalDataErrorCode | PortalTelemetryEvent["errorCode"] =
          localShed === "capacity"
            ? "local_capacity_shed"
            : localShed === "cooldown"
              ? "local_cooldown_shed"
              : error instanceof PortalDataError
                ? error.code
                : "upstream_unavailable";
        recordTelemetry("error", code, null, consumer);
        throw error instanceof PortalDataError
          ? error
          : new PortalDataError("upstream_unavailable");
      }

      const parsed = responseSchema.safeParse(payload);
      if (!parsed.success) {
        recordTelemetry("error", "invalid_response", null, consumer);
        throw new PortalDataError("invalid_response");
      }

      recordTelemetry("ok", null, responseRowCount(parsed.data), consumer);
      return parsed.data;
    },
  };
}
