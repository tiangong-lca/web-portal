import "server-only";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { locales, type PortalLocale } from "@/i18n/routing";
import {
  classificationContext,
  classificationPageSchema,
  type ClassificationPage,
  type ClassificationRequest,
  type ClassificationSeed,
} from "@/lib/classification-navigation";
import {
  navigationInputSchema,
  type BrowseSearchInput,
  type PublicNavigation,
} from "@/server/contracts/navigation";
import { getPublicNavigation } from "@/server/data/navigation";
import { localizedNavigationLabel } from "@/server/navigation-labels";
import { PortalDataError } from "@/server/data/supabase-rpc";

export const classificationRequestSchema = z
  .strictObject({
    locale: z.enum(locales),
    kind: z.enum(["process", "flow"]),
    query: navigationInputSchema.shape.query,
    filters: navigationInputSchema.shape.filters,
    parentNodeId: navigationInputSchema.shape.parentNodeId,
    cursor: navigationInputSchema.shape.cursor,
  })
  .superRefine((input, context) => {
    const { locale: _locale, ...request } = input;
    if (!navigationInputSchema.safeParse({ ...request, dimension: "classification" }).success)
      context.addIssue({ code: "custom", message: "Invalid classification request" });
  });

export async function localizeClassificationPage(
  locale: PortalLocale,
  page: PublicNavigation,
): Promise<ClassificationPage> {
  const translate = await getTranslations({ locale, namespace: "Navigation" });
  const identity = (node: PublicNavigation["ancestors"][number]) => ({
    nodeId: node.nodeId,
    parentNodeId: node.parentNodeId,
    code: node.code,
    label: localizedNavigationLabel(node, locale, false, translate),
  });
  const counted = (node: PublicNavigation["nodes"][number]) => ({
    ...identity(node),
    count: node.count,
    directCount: node.directCount,
    hasChildren: node.hasChildren,
  });
  const result = classificationPageSchema.safeParse({
    schemaVersion: "portal.classification-branch.v1",
    locale,
    countBasis: page.countBasis,
    kind: page.kind,
    parent: page.parent ? counted(page.parent) : null,
    ancestors: page.ancestors.map(identity),
    nodes: page.nodes.map(counted),
    nextCursor: page.nextCursor,
  });
  if (!result.success) throw new PortalDataError("invalid_response");
  return result.data;
}

export async function readClassificationBranch(
  input: ClassificationRequest,
  read = getPublicNavigation,
): Promise<ClassificationPage> {
  const { locale, ...request } = classificationRequestSchema.parse(input);
  // The navigation counts are conditioned on the other dimensions, not its selected node.
  const {
    classificationNodeId: _node,
    classificationScope: _scope,
    classification: _code,
    ...filters
  } = request.filters;
  const page = await read({ ...request, filters, dimension: "classification", limit: 50 });
  return localizeClassificationPage(locale, page);
}

/** Fetch only the root and the selected ancestor chain, never the complete vocabulary. */
export async function classificationSeeds(
  locale: PortalLocale,
  input: BrowseSearchInput,
  current: PublicNavigation | null,
  currentCursor: string | null = null,
  read = getPublicNavigation,
): Promise<ClassificationSeed[]> {
  if (!current) return [{ parentNodeId: null, page: null }];
  const context = classificationContext(locale, input);
  const currentId = current.parent?.nodeId ?? null;
  const ids = [...new Set([null, ...current.ancestors.map((node) => node.nodeId), currentId])];
  return Promise.all(
    ids.map(async (parentNodeId) => {
      try {
        return {
          parentNodeId,
          cursor: parentNodeId === currentId ? currentCursor : null,
          page:
            parentNodeId === currentId
              ? await localizeClassificationPage(locale, current)
              : await readClassificationBranch({ ...context, parentNodeId, cursor: null }, read),
        };
      } catch (error) {
        if (!(error instanceof PortalDataError)) throw error;
        return { parentNodeId, page: null };
      }
    }),
  );
}
