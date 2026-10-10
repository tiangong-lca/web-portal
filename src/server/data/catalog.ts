import "server-only";

import type { ZodType, z } from "zod";

import {
  catalogSearchInputSchema,
  datasetReferenceInputSchema,
  exchangeListInputSchema,
  facetInputSchema,
  sitemapInputSchema,
  versionListInputSchema,
} from "@/server/contracts/input";
import {
  publicDatasetEnvelopeSchema,
  publicFlowLinkEligibilitySchema,
  publicCatalogSummarySchema,
  publicExchangePageSchema,
  publicFacetsSchema,
  publicSearchPageSchema,
  publicSitemapManifestSchema,
  publicSitemapPageSchema,
  publicSitemapShardSchema,
  publicVersionPageSchema,
  portalSitemapShardCursorSchema,
  type PublicDatasetEnvelope,
  type PublicCatalogSummary,
  type PublicExchangePage,
  type PublicFacets,
  type PublicSearchPage,
  type PublicSitemapManifest,
  type PublicSitemapPage,
  type PublicSitemapShard,
  type PublicVersionPage,
} from "@/server/contracts/portal";
import {
  createPortalRpcClient,
  PortalDataError,
  type PortalFetchCachePolicy,
  type PortalRpcClient,
} from "@/server/data/supabase-rpc";

type CatalogSearchInput = z.input<typeof catalogSearchInputSchema>;
type DatasetReferenceInput = z.input<typeof datasetReferenceInputSchema>;
type VersionListInput = z.input<typeof versionListInputSchema>;
type ExchangeListInput = z.input<typeof exchangeListInputSchema>;
type FacetInput = z.input<typeof facetInputSchema>;
type SitemapInput = z.input<typeof sitemapInputSchema>;
type PublicCatalogReadOptions = { cache?: "no-store" | "short-public" };

const shortPublicCatalogCacheSeconds = 30;

function publicCatalogQueryCachePolicy(
  family: "search" | "facets",
  kind: "all" | "process" | "flow",
  writeSchema: ZodType<unknown>,
  options?: PublicCatalogReadOptions,
): PortalFetchCachePolicy {
  return options?.cache === "short-public"
    ? {
        mode: "revalidate",
        seconds: shortPublicCatalogCacheSeconds,
        tags: [`portal:catalog-${family}:${kind}`],
        // Validated before the shared payload is cached; each caller still runs
        // its own refined schema on the returned value.
        writeSchema,
      }
    : { mode: "no-store", writeSchema };
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new PortalDataError("invalid_request");
  }
  return result.data;
}

function clientOrDefault(client?: PortalRpcClient): PortalRpcClient {
  return client ?? createPortalRpcClient();
}

function requireBoundResponse<T>(value: T, bound: boolean): T {
  if (!bound) {
    throw new PortalDataError("invalid_response");
  }
  return value;
}

async function searchPublicCatalog(
  kind: "process" | "flow",
  input: Omit<CatalogSearchInput, "kind">,
  client?: PortalRpcClient,
  options?: PublicCatalogReadOptions,
): Promise<PublicSearchPage> {
  const parsed = parseInput(catalogSearchInputSchema, { ...input, kind });

  const responseSchema = publicSearchPageSchema.refine(
    (page) => page.kind === kind && page.items.every((item) => item.key.kind === kind),
  );
  const page = await clientOrDefault(client).call(
    kind === "process" ? "portal_search_processes_v4" : "portal_search_flows_v4",
    {
      p_query: parsed.query,
      p_filters: parsed.filters,
      p_sort: parsed.sort,
      p_cursor: parsed.cursor,
      p_limit: parsed.limit,
    },
    responseSchema,
    publicCatalogQueryCachePolicy("search", kind, publicSearchPageSchema, options),
  );
  return requireBoundResponse(
    page,
    page.kind === kind && page.items.every((item) => item.key.kind === kind),
  );
}

export function searchPublicProcesses(
  input: Omit<CatalogSearchInput, "kind">,
  client?: PortalRpcClient,
  options?: PublicCatalogReadOptions,
): Promise<PublicSearchPage> {
  return searchPublicCatalog("process", input, client, options);
}

export function searchPublicFlows(
  input: Omit<CatalogSearchInput, "kind">,
  client?: PortalRpcClient,
  options?: PublicCatalogReadOptions,
): Promise<PublicSearchPage> {
  return searchPublicCatalog("flow", input, client, options);
}

export function getPublicCatalogSummary(client?: PortalRpcClient): Promise<PublicCatalogSummary> {
  return clientOrDefault(client).call("portal_catalog_summary_v2", {}, publicCatalogSummarySchema, {
    mode: "revalidate",
    seconds: 300,
    tags: ["portal:catalog-summary"],
  });
}

export async function getPublicDataset(
  input: DatasetReferenceInput,
  client?: PortalRpcClient,
): Promise<PublicDatasetEnvelope | null> {
  const parsed = parseInput(datasetReferenceInputSchema, input);

  const responseSchema = publicDatasetEnvelopeSchema
    .nullable()
    .refine(
      (dataset) =>
        dataset === null ||
        (dataset.key.kind === parsed.kind &&
          dataset.key.id === parsed.id &&
          dataset.key.version === parsed.version),
    );
  const dataset = await clientOrDefault(client).call(
    "portal_get_dataset_v2",
    {
      p_kind: parsed.kind,
      p_id: parsed.id,
      p_version: parsed.version,
    },
    responseSchema,
    {
      mode: "revalidate",
      seconds: 60,
      tags: [
        `portal:visibility:${parsed.kind}:${parsed.id}:${parsed.version}`,
        `portal:dataset:${parsed.kind}:${parsed.id}:${parsed.version}`,
      ],
    },
  );
  return requireBoundResponse(
    dataset,
    dataset === null ||
      (dataset.key.kind === parsed.kind &&
        dataset.key.id === parsed.id &&
        dataset.key.version === parsed.version),
  );
}

export async function listPublicDatasetVersions(
  input: VersionListInput,
  client?: PortalRpcClient,
): Promise<PublicVersionPage> {
  const parsed = parseInput(versionListInputSchema, input);

  const responseSchema = publicVersionPageSchema.refine(
    (page) =>
      page.dataset.kind === parsed.kind &&
      page.dataset.id === parsed.id &&
      page.items.every((item) => item.key.kind === parsed.kind && item.key.id === parsed.id),
  );
  const page = await clientOrDefault(client).call(
    "portal_list_versions_v2",
    {
      p_kind: parsed.kind,
      p_id: parsed.id,
      p_cursor: parsed.cursor,
      p_limit: parsed.limit,
    },
    responseSchema,
    {
      mode: "revalidate",
      seconds: 300,
      tags: [`portal:versions:${parsed.kind}:${parsed.id}`],
    },
  );
  return requireBoundResponse(
    page,
    page.dataset.kind === parsed.kind &&
      page.dataset.id === parsed.id &&
      page.items.every((item) => item.key.kind === parsed.kind && item.key.id === parsed.id),
  );
}

export async function listPublicProcessExchanges(
  input: ExchangeListInput,
  client?: PortalRpcClient,
): Promise<PublicExchangePage | null> {
  const parsed = parseInput(exchangeListInputSchema, input);

  const responseSchema = publicExchangePageSchema
    .nullable()
    .refine(
      (page) =>
        page === null ||
        (page.process.id === parsed.processId && page.process.version === parsed.processVersion),
    );
  const page = await clientOrDefault(client).call(
    "portal_list_process_exchanges_v2",
    {
      p_process_id: parsed.processId,
      p_process_version: parsed.processVersion,
      p_exchange_kind: parsed.exchangeKind,
      p_cursor: parsed.cursor,
      p_limit: parsed.limit,
    },
    responseSchema,
    {
      mode: "revalidate",
      seconds: 300,
      tags: [`portal:exchanges:${parsed.processId}:${parsed.processVersion}`],
    },
  );
  return requireBoundResponse(
    page,
    page === null ||
      (page.process.id === parsed.processId && page.process.version === parsed.processVersion),
  );
}

export async function getPublicFacets(
  input: FacetInput,
  client?: PortalRpcClient,
  options?: PublicCatalogReadOptions,
): Promise<PublicFacets> {
  const parsed = parseInput(facetInputSchema, input);

  const responseSchema = publicFacetsSchema.refine((facets) => facets.kind === parsed.kind);
  const facets = await clientOrDefault(client).call(
    "portal_facets_v4",
    {
      p_kind: parsed.kind,
      p_query: parsed.query,
      p_filters: parsed.filters,
    },
    responseSchema,
    publicCatalogQueryCachePolicy("facets", parsed.kind, publicFacetsSchema, options),
  );
  return requireBoundResponse(facets, facets.kind === parsed.kind);
}

export async function listPublicSitemapEntries(
  input: SitemapInput = {},
  client?: PortalRpcClient,
): Promise<PublicSitemapPage> {
  const parsed = parseInput(sitemapInputSchema, input);

  const responseSchema = publicSitemapPageSchema.refine(
    (page) => parsed.kind === "all" || page.items.every((item) => item.key.kind === parsed.kind),
  );
  const page = await clientOrDefault(client).call(
    "portal_sitemap_entries_v2",
    {
      p_kind: parsed.kind,
      p_cursor: parsed.cursor,
      p_limit: parsed.limit,
    },
    responseSchema,
    {
      mode: "revalidate",
      seconds: 300,
      tags: [`portal:sitemap:${parsed.kind}`],
    },
  );
  return requireBoundResponse(
    page,
    parsed.kind === "all" || page.items.every((item) => item.key.kind === parsed.kind),
  );
}

export function getPublicSitemapManifest(client?: PortalRpcClient): Promise<PublicSitemapManifest> {
  return clientOrDefault(client).call(
    "portal_sitemap_manifest_v2",
    {},
    publicSitemapManifestSchema,
    { mode: "no-store" },
  );
}

export async function getPublicSitemapShard(
  input: { readonly shardCursor: string },
  client?: PortalRpcClient,
): Promise<PublicSitemapShard> {
  const shardCursor = parseInput(portalSitemapShardCursorSchema, input?.shardCursor);
  const responseSchema = publicSitemapShardSchema.refine(
    (shard) => shard.shardCursor === shardCursor,
  );
  const shard = await clientOrDefault(client).call(
    "portal_sitemap_shard_v2",
    { p_shard_cursor: shardCursor },
    responseSchema,
    { mode: "no-store" },
  );
  return requireBoundResponse(shard, shard.shardCursor === shardCursor);
}

export async function getPublicFlowLinkEligibility(
  refs: Array<{ id: string; version: string }>,
  client?: PortalRpcClient,
): Promise<ReadonlySet<string>> {
  const unique = [...new Map(refs.map((ref) => [`${ref.id}@${ref.version}`, ref])).values()];
  if (unique.length === 0) return new Set();
  const result = await clientOrDefault(client).call(
    "portal_flow_link_eligibility_v1",
    { p_flow_refs: unique },
    publicFlowLinkEligibilitySchema,
    { mode: "no-store" },
  );
  const requested = new Set(unique.map((ref) => `${ref.id}@${ref.version}`));
  if (
    result.length !== unique.length ||
    new Set(result.map((ref) => `${ref.id}@${ref.version}`)).size !== unique.length ||
    result.some((ref) => !requested.has(`${ref.id}@${ref.version}`))
  )
    throw new PortalDataError("invalid_response");
  return new Set(result.filter((ref) => ref.linkable).map((ref) => `${ref.id}@${ref.version}`));
}
