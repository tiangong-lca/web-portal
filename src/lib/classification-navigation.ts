import { z } from "zod";
import { locales, type PortalLocale } from "@/i18n/routing";
import type { BrowseFilters, BrowseSearchInput } from "@/server/contracts/navigation";
import { hierarchyFilters } from "@/features/catalog/navigation-links";

const nodeId = z
  .string()
  .min(3)
  .max(128)
  .regex(/^class:[!-~]{1,96}$/u);
const identity = z.strictObject({
  nodeId,
  parentNodeId: nodeId.nullable(),
  code: z.string().min(1).max(4096),
  label: z.string().min(1).max(4096),
});
export const classificationNodeSchema = identity
  .extend({
    count: z.number().int().nonnegative().safe(),
    directCount: z.number().int().nonnegative().safe(),
    hasChildren: z.boolean(),
  })
  .refine((node) => node.directCount <= node.count);
export const classificationPageSchema = z
  .strictObject({
    schemaVersion: z.literal("portal.classification-branch.v1"),
    locale: z.enum(locales),
    countBasis: z.literal("public_versions"),
    kind: z.enum(["process", "flow"]),
    parent: classificationNodeSchema.nullable(),
    ancestors: z.array(identity).max(32),
    nodes: z.array(classificationNodeSchema).max(50),
    nextCursor: z
      .string()
      .min(1)
      .max(4096)
      .regex(/^[A-Za-z0-9_-]+$/u)
      .nullable(),
  })
  .refine((page) => new Set(page.nodes.map((node) => node.nodeId)).size === page.nodes.length);

export type ClassificationNode = z.infer<typeof classificationNodeSchema>;
export type ClassificationPage = z.infer<typeof classificationPageSchema>;
export type ClassificationContext = {
  locale: PortalLocale;
  kind: "process" | "flow";
  query: string;
  filters: BrowseFilters;
};
export type ClassificationRequest = ClassificationContext & {
  parentNodeId: string | null;
  cursor: string | null;
};
export type ClassificationSeed = {
  parentNodeId: string | null;
  cursor?: string | null;
  page: ClassificationPage | null;
};

export function classificationContext(
  locale: PortalLocale,
  input: BrowseSearchInput,
): ClassificationContext {
  return {
    locale,
    kind: input.kind,
    query: input.query,
    filters: hierarchyFilters(input, "classification"),
  };
}

export function classificationContextKey(context: ClassificationContext): string {
  return JSON.stringify([
    context.locale,
    context.kind,
    context.query,
    Object.entries(context.filters).sort(([left], [right]) => left.localeCompare(right)),
  ]);
}

export function classificationBranchKey(parentNodeId: string | null): string {
  return parentNodeId ?? "root";
}

export function classificationPageMatches(
  page: ClassificationPage,
  input: ClassificationRequest,
): boolean {
  return (
    page.locale === input.locale &&
    page.kind === input.kind &&
    (page.parent?.nodeId ?? null) === input.parentNodeId &&
    page.nodes.every((node) => node.parentNodeId === input.parentNodeId)
  );
}

export function mergeClassificationNodes(
  current: ClassificationNode[],
  incoming: ClassificationNode[],
): ClassificationNode[] {
  const nodes = new Map(current.map((node) => [node.nodeId, node]));
  for (const node of incoming) nodes.set(node.nodeId, node);
  return [...nodes.values()];
}
