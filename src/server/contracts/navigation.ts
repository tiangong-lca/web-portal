import "server-only";

import { z } from "zod";
import type { TianGongPortalPublicNavigationPageV1 } from "../../../contracts/database-engine/portal/generated/portal.public-navigation.v1";
import {
  catalogSearchInputSchema,
  parsePortalSearchUrl,
  PortalInputError,
  publicSearchFiltersSchema,
} from "./input";
import { portalCursorSchema } from "./portal";

export const navigationNodeIdSchema = z
  .string()
  .min(3)
  .max(128)
  .regex(/^[a-z][a-z0-9-]*:[!-~]{1,96}$/u);
const scopeSchema = z.enum(["subtree", "direct"]);

// Keep the V2/Hybrid allowlist unchanged; only the explicit V3 boundary admits nodes.
export const browseFiltersSchema = z
  .strictObject({
    ...publicSearchFiltersSchema.shape,
    classificationNodeId: navigationNodeIdSchema.optional(),
    geographyNodeId: navigationNodeIdSchema.optional(),
    classificationScope: scopeSchema.optional(),
    geographyScope: scopeSchema.optional(),
  })
  .superRefine((filters, context) => {
    const {
      classificationNodeId,
      geographyNodeId,
      classificationScope,
      geographyScope,
      ...legacy
    } = filters;
    if (!publicSearchFiltersSchema.safeParse(legacy).success) {
      context.addIssue({ code: "custom", message: "Invalid catalog filters" });
    }
    if ((classificationScope && !classificationNodeId) || (geographyScope && !geographyNodeId)) {
      context.addIssue({ code: "custom", message: "A node is required for a navigation scope" });
    }
    if (classificationNodeId && !classificationNodeId.startsWith("class:")) {
      context.addIssue({ code: "custom", message: "Invalid classification node" });
    }
    if (geographyNodeId && !geographyNodeId.startsWith("geo:")) {
      context.addIssue({ code: "custom", message: "Invalid geography node" });
    }
  });

export const browseSearchInputSchema = catalogSearchInputSchema.safeExtend({
  filters: browseFiltersSchema,
});
export type BrowseSearchInput = z.infer<typeof browseSearchInputSchema>;
export type BrowseFilters = z.infer<typeof browseFiltersSchema>;
export type NavigationDimension = "classification" | "geography";

export const navigationInputSchema = z
  .strictObject({
    kind: z.enum(["all", "process", "flow"]),
    query: catalogSearchInputSchema.shape.query,
    filters: browseFiltersSchema,
    dimension: z.enum(["classification", "geography"]),
    parentNodeId: navigationNodeIdSchema.nullable().default(null),
    cursor: portalCursorSchema
      .regex(/^[A-Za-z0-9_-]+$/u)
      .nullable()
      .default(null),
    limit: z.number().int().min(1).max(500).default(100),
  })
  .superRefine((input, context) => {
    if (input.kind === "flow" && input.filters.processSubtype !== undefined) {
      context.addIssue({ code: "custom", message: "Process subtype is not valid for flows" });
    }
    if (
      input.parentNodeId &&
      !input.parentNodeId.startsWith(input.dimension === "geography" ? "geo:" : "class:")
    ) {
      context.addIssue({
        code: "custom",
        message: "Navigation parent belongs to a different dimension",
      });
    }
  });

export const navigationIdentitySchema = z.strictObject({
  nodeId: navigationNodeIdSchema,
  parentNodeId: navigationNodeIdSchema.nullable(),
  code: z.string().min(1),
  taxonomy: z.enum([
    "isic",
    "cpc",
    "elementary",
    "ilcd-locations",
    "tiangong-lca-archive-locations-v1",
    "database-virtual",
    "unmapped",
    "unclassified",
  ]),
});
export const navigationNodeSchema = navigationIdentitySchema
  .extend({
    count: z.number().int().nonnegative().safe(),
    directCount: z.number().int().nonnegative().safe(),
    hasChildren: z.boolean(),
  })
  .refine((node) => node.directCount <= node.count);

export const publicNavigationSchema = z
  .strictObject({
    schemaVersion: z.literal("portal.public-navigation.v1"),
    countBasis: z.literal("public_versions"),
    dimension: z.enum(["classification", "geography"]),
    kind: z.enum(["all", "process", "flow"]),
    totals: z.strictObject({
      process: z.number().int().nonnegative().safe(),
      flow: z.number().int().nonnegative().safe(),
    }),
    parent: navigationNodeSchema.nullable(),
    ancestors: z.array(navigationIdentitySchema).max(32),
    nodes: z.array(navigationNodeSchema).max(500),
    nextCursor: portalCursorSchema.regex(/^[A-Za-z0-9_-]+$/u).nullable(),
  })
  .refine(
    (page) => new Set(page.nodes.map((node) => node.nodeId)).size === page.nodes.length,
  ) satisfies z.ZodType<TianGongPortalPublicNavigationPageV1>;
export type PublicNavigation = z.infer<typeof publicNavigationSchema>;
export type NavigationNode = z.infer<typeof navigationNodeSchema>;

export function hasNavigationFilters(filters: BrowseFilters): boolean {
  return Boolean(filters.classificationNodeId || filters.geographyNodeId);
}

export function parsePortalBrowseUrl(
  parameters: Record<string, string | string[] | undefined>,
): BrowseSearchInput {
  const base = parsePortalSearchUrl(parameters);
  const filters: Record<string, unknown> = { ...base.filters };
  const fields = {
    classNode: "classificationNodeId",
    geoNode: "geographyNodeId",
    classScope: "classificationScope",
    geoScope: "geographyScope",
  } as const;
  for (const [parameter, field] of Object.entries(fields)) {
    const value = parameters[parameter];
    if (value !== undefined) {
      if (typeof value !== "string") throw new PortalInputError();
      filters[field] = value;
    }
  }
  const result = browseSearchInputSchema.safeParse({ ...base, filters });
  if (!result.success) throw new PortalInputError();
  return result.data;
}
