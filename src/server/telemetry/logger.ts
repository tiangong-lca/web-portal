import "server-only";

import { randomBytes } from "node:crypto";
import { z } from "zod";

const immutableBuildSha = process.env.PORTAL_BUILD_SHA;
const instanceMarkerKey = Symbol.for("tiangong.portal.telemetry.instance.v1");
const runtimeMarkers = globalThis as unknown as Record<symbol, string | undefined>;
const instanceMarker = runtimeMarkers[instanceMarkerKey] ?? randomBytes(4).toString("hex");
runtimeMarkers[instanceMarkerKey] = instanceMarker;

const correlationIdSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const deploymentShaSchema = z.union([
  z.literal("local"),
  z.string().regex(/^[0-9a-f]{40}$/),
  z.literal("unknown"),
]);

const telemetryEventSchema = z.strictObject({
  correlationId: correlationIdSchema,
  routeFamily: z.enum([
    "catalog_search",
    "catalog_summary",
    "catalog_facets",
    "dataset_detail",
    "dataset_versions",
    "dataset_exchanges",
    "sitemap",
    "lcia_bff",
    "hybrid_bff",
  ]),
  rpcName: z
    .enum([
      "portal_search_processes_v2",
      "portal_search_flows_v2",
      "portal_catalog_summary_v1",
      "portal_get_dataset_v1",
      "portal_list_versions_v1",
      "portal_list_process_exchanges_v1",
      "portal_facets_v2",
      "portal_facets_v3",
      "portal_navigation_v1",
      "portal_search_processes_v3",
      "portal_search_flows_v3",
      "portal_sitemap_entries_v1",
      "portal_sitemap_manifest_v1",
      "portal_sitemap_shard_v1",
    ])
    .nullable(),
  cachePolicy: z.enum(["no-store", "revalidate"]),
  /** `"unknown"` means the read path cannot observe cache state; bounded reads report a boolean. */
  cacheHit: z.union([z.literal("unknown"), z.boolean()]),
  /** Distinguishes the request that answered a consumer from the real origin load. */
  eventKind: z.enum(["consumer", "origin"]).optional(),
  cacheOutcome: z.enum(["origin", "coalesced", "cache"]).optional(),
  cacheSource: z.enum(["runtime", "instance"]).optional(),
  instanceMarker: z.string().regex(/^[a-f0-9]{8}$/),
  dedupeShared: z.boolean().optional(),
  loadedAtAgeMs: z.number().int().min(0).max(86_400_000).optional(),
  gateQueuedMs: z.number().int().min(0).max(120_000).optional(),
  /** Short random correlation token for one origin load; never derived from data. */
  originMarker: z.string().min(1).max(16).optional(),
  /**
   * Closed-vocabulary read shape. These fields exist so hosted logs can tell an
   * expensive empty browse from a targeted identifier read without ever
   * recording the query, a filter value, a cursor, or an identifier.
   */
  queryShape: z.enum(["empty", "identifier", "text"]).optional(),
  hasFilters: z.boolean().optional(),
  hasCursor: z.boolean().optional(),
  sort: z.enum(["relevance", "modified_desc", "name_asc", "other"]).optional(),
  backend: z.enum(["supabase_data_api", "portal_edge_lcia", "portal_edge_hybrid", "portal_bff"]),
  latencyMs: z.number().int().min(0).max(120_000),
  rowCount: z.number().int().min(0).max(4096).nullable(),
  status: z.enum(["ok", "fallback", "unavailable", "temporarily_unavailable", "rejected", "error"]),
  errorCode: z
    .enum([
      "invalid_request",
      "upstream_unavailable",
      "invalid_response",
      "cross_origin_request",
      "unsupported_media_type",
      "body_too_large",
      "lcia_temporarily_unavailable",
      "method_not_allowed",
      "request_too_large",
      "portal_auth_unavailable",
      "portal_auth_failed",
      "hybrid_disabled",
      "guard_unavailable",
      "replay_rejected",
      "budget_exhausted",
      "concurrency_exhausted",
      "circuit_open",
      "hybrid_timeout",
      "hybrid_upstream_unavailable",
      "contract_failure",
      "internal_error",
      "hybrid_fallback_unavailable",
      // Instance-local shedding. These never describe the Edge Redis guard,
      // which keeps its own `concurrency_exhausted` code.
      "local_capacity_shed",
      "local_cooldown_shed",
    ])
    .nullable(),
  locale: z.enum(["zh-CN", "en", "de", "fr"]).optional(),
  deploymentSha: deploymentShaSchema,
});

export type PortalTelemetryEvent = z.infer<typeof telemetryEventSchema>;
export type PortalTelemetryEventInput = Omit<
  PortalTelemetryEvent,
  "deploymentSha" | "instanceMarker"
>;
export type PortalTelemetryLogger = (event: Readonly<PortalTelemetryEvent>) => void | Promise<void>;
export type PortalTelemetryLocale = "zh-CN" | "en" | "de" | "fr";

export const defaultPortalTelemetryLogger: PortalTelemetryLogger = (event) => {
  // Hosted runtimes capture console output for the Node server; one JSON object
  // per line keeps the events grep-able without a logging dependency.
  console.log(JSON.stringify(event));
};

export function createPortalCorrelationId(
  candidate?: string,
  generate: () => string = () => crypto.randomUUID(),
): string {
  const validatedCandidate = validatePortalCorrelationId(candidate);
  if (validatedCandidate) {
    return validatedCandidate;
  }

  try {
    const generated = correlationIdSchema.safeParse(generate());
    return generated.success ? generated.data : crypto.randomUUID();
  } catch {
    return crypto.randomUUID();
  }
}

export function validatePortalCorrelationId(candidate?: string): string | undefined {
  const parsed = correlationIdSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

export function readPortalDeploymentSha(
  environment: Record<string, string | undefined> = process.env,
): PortalTelemetryEvent["deploymentSha"] {
  const nodeEnvironment = environment.NODE_ENV;
  const configured =
    environment.PORTAL_BUILD_SHA ?? immutableBuildSha ?? environment.PORTAL_DEPLOYMENT_SHA;
  if (configured === undefined || configured === "") {
    return nodeEnvironment === "development" || nodeEnvironment === "test" ? "local" : "unknown";
  }
  if (configured === "local") {
    return nodeEnvironment === "development" || nodeEnvironment === "test" ? "local" : "unknown";
  }

  const parsed = deploymentShaSchema.safeParse(configured);
  return parsed.success ? parsed.data : "unknown";
}

export function portalLatencyMilliseconds(start: number, end: number): number {
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return 0;
  }
  return Math.min(120_000, Math.max(0, Math.round(end - start)));
}

export function emitPortalTelemetry(
  logger: PortalTelemetryLogger,
  input: PortalTelemetryEventInput,
  environment: Record<string, string | undefined> = process.env,
): void {
  try {
    const parsed = telemetryEventSchema.safeParse({
      ...input,
      deploymentSha: readPortalDeploymentSha(environment),
      instanceMarker,
    });
    if (!parsed.success) {
      return;
    }

    const result = logger(Object.freeze(parsed.data));
    if (result && typeof (result as PromiseLike<unknown>).then === "function") {
      void Promise.resolve(result).catch(() => undefined);
    }
  } catch {
    // Telemetry must never change the user-visible response.
  }
}
