import "server-only";
import vocabulary from "../../contracts/database-engine/portal/navigation-vocabulary.json";
import { formatGeographyCode } from "@/i18n/geography";
import type { PortalLocale } from "@/i18n/routing";
import type { NavigationNode } from "./contracts/navigation";

type VocabularyNode = {
  nodeId: string;
  parentNodeId: string | null;
  code: string;
  labels: Partial<Record<PortalLocale, string>>;
  labelStrategy?: Partial<Record<PortalLocale, string>>;
};
const nodes = new Map<string, VocabularyNode>(
  (vocabulary.nodes as VocabularyNode[]).map((node) => [node.nodeId, node]),
);

export type NavigationVirtualLabel =
  "isic" | "cpc" | "elementary" | "special" | "unmapped" | "uncategorized";
const virtualLabels: Record<string, NavigationVirtualLabel> = {
  "class:isic": "isic",
  "class:cpc": "cpc",
  "class:elementary": "elementary",
  "geo:special": "special",
  "geo:unmapped": "unmapped",
  "class:unmapped": "uncategorized",
  "class:unclassified": "uncategorized",
};

export function localizedNavigationLabel(
  node: Pick<NavigationNode, "nodeId" | "code">,
  locale: PortalLocale,
  compact: boolean,
  translate: (key: NavigationVirtualLabel) => string,
): string {
  const virtual = node.nodeId.endsWith(":~raw") ? "uncategorized" : virtualLabels[node.nodeId];
  return virtual ? translate(virtual) : navigationLabel(node, locale, compact);
}

export function navigationLabel(
  node: Pick<NavigationNode, "nodeId" | "code">,
  locale: PortalLocale,
  compact = false,
): string {
  const entry = nodes.get(node.nodeId);
  const label = entry?.labels[locale];
  if (label) {
    const strategy = entry?.labelStrategy?.[locale] ?? "";
    const display =
      compact && entry?.parentNodeId && node.nodeId.startsWith("geo:cn-")
        ? (locale === "zh-CN" ? label.split(",").at(-1)! : label.split(",")[0]!).trim()
        : label;
    return /fallback|english|source-language/u.test(strategy) && locale !== "en"
      ? `${display} [en]`
      : display;
  }
  if (node.nodeId.startsWith("geo:")) return formatGeographyCode(node.code, locale) ?? node.code;
  return node.code;
}
