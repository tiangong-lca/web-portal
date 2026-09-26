import "server-only";
import { cache } from "react";
import {
  browseSearchInputSchema,
  navigationInputSchema,
  publicNavigationSchema,
} from "@/server/contracts/navigation";
import { publicFacetsSchema, publicSearchPageSchema } from "@/server/contracts/portal";
import { createPortalRpcClient, PortalDataError, type PortalRpcClient } from "./supabase-rpc";
import type { z } from "zod";

const publicCache = {
  mode: "revalidate",
  seconds: 30,
  tags: ["portal:catalog-navigation"],
} as const;

export type PortalNavigationReadOptions = {
  /**
   * `"bounded"` (default) uses the coordinated read path. Statically rendered
   * callers must pass `"legacy"`: the bounded origin request is `no-store` and
   * would opt their route out of static generation.
   */
  readonly boundary?: "bounded" | "legacy";
};

function cachePolicy(writeSchema: z.ZodType<unknown>, boundary: "bounded" | "legacy" = "bounded") {
  return { ...publicCache, tags: [...publicCache.tags], boundary, writeSchema };
}

async function readNavigation(
  input: z.input<typeof navigationInputSchema>,
  client: PortalRpcClient,
  options?: PortalNavigationReadOptions,
) {
  const value = navigationInputSchema.safeParse(input);
  if (!value.success) throw new PortalDataError("invalid_request");
  const parsed = value.data;
  const schema = publicNavigationSchema.refine(
    (page) =>
      page.kind === parsed.kind &&
      page.dimension === parsed.dimension &&
      (page.parent?.nodeId ?? null) === parsed.parentNodeId &&
      page.nodes.every((node) => node.parentNodeId === parsed.parentNodeId),
  );
  return client.call(
    "portal_navigation_v1",
    {
      p_kind: parsed.kind,
      p_query: parsed.query,
      p_filters: parsed.filters,
      p_dimension: parsed.dimension,
      p_parent_node_id: parsed.parentNodeId,
      p_cursor: parsed.cursor,
      p_limit: parsed.limit,
    },
    schema,
    cachePolicy(publicNavigationSchema, options?.boundary),
  );
}

// React request memoization is explicit: native POST fetch is not request-deduplicated.
const readCachedNavigation = cache((serialized: string) =>
  readNavigation(JSON.parse(serialized), createPortalRpcClient()),
);
export async function getPublicNavigation(
  input: z.input<typeof navigationInputSchema>,
  client?: PortalRpcClient,
  options?: PortalNavigationReadOptions,
) {
  if (client) return readNavigation(input, client, options);
  if (options?.boundary === "legacy")
    return readNavigation(input, createPortalRpcClient(), options);
  return readCachedNavigation(JSON.stringify(input));
}

export async function searchPublicBrowse(
  input: z.input<typeof browseSearchInputSchema>,
  client = createPortalRpcClient(),
) {
  const value = browseSearchInputSchema.safeParse(input);
  if (!value.success) throw new PortalDataError("invalid_request");
  const parsed = value.data;
  return client.call(
    parsed.kind === "process" ? "portal_search_processes_v3" : "portal_search_flows_v3",
    {
      p_query: parsed.query,
      p_filters: parsed.filters,
      p_sort: parsed.sort,
      p_cursor: parsed.cursor,
      p_limit: parsed.limit,
    },
    publicSearchPageSchema.refine(
      (page) =>
        page.kind === parsed.kind && page.items.every((item) => item.key.kind === parsed.kind),
    ),
    cachePolicy(publicSearchPageSchema),
  );
}

export async function getPublicBrowseFacets(
  input: Pick<z.input<typeof navigationInputSchema>, "kind" | "query" | "filters">,
  client = createPortalRpcClient(),
  _options?: { cache?: "no-store" | "short-public" },
) {
  const value = navigationInputSchema.safeParse({ ...input, dimension: "classification" });
  if (!value.success) throw new PortalDataError("invalid_request");
  const parsed = value.data;
  return client.call(
    "portal_facets_v3",
    { p_kind: parsed.kind, p_query: parsed.query, p_filters: parsed.filters },
    publicFacetsSchema.refine((page) => page.kind === parsed.kind),
    cachePolicy(publicFacetsSchema),
  );
}
