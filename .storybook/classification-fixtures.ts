import { dictionaries } from "./fixtures";
import type { PortalLocale } from "@/i18n/routing";
import type {
  ClassificationNode,
  ClassificationPage,
  ClassificationSeed,
} from "@/lib/classification-navigation";

const words = {
  "zh-CN": { branch: "示例行业", other: "其他行业", item: "分类" },
  en: { branch: "Example industry", other: "Other industry", item: "Category" },
  de: { branch: "Beispielbranche", other: "Weitere Branche", item: "Kategorie" },
  fr: { branch: "Secteur d’exemple", other: "Autre secteur", item: "Catégorie" },
};
export function classificationFixtureNode(locale: PortalLocale, id: string): ClassificationNode {
  const parts = id.split(":");
  const root = parts.length === 2;
  const n = Number(parts.at(-1));
  const text = words[locale];
  return {
    nodeId: id,
    parentNodeId: root ? null : parts.slice(0, -1).join(":"),
    code: root ? "ALL" : parts.at(-1)!,
    label: root
      ? dictionaries[locale].Navigation[id === "class:isic" ? "isic" : "cpc"]
      : parts.length === 3
        ? n === 0
          ? text.branch
          : text.other
        : `${text.item} ${n}`,
    count: root ? 415 : parts.length === 3 ? 193 : n % 7,
    directCount: root ? 50 : parts.length === 3 ? 35 : n % 7,
    hasChildren: parts.length < 4,
  };
}
export function classificationFixturePage(
  locale: PortalLocale,
  kind: "process" | "flow",
  parentNodeId: string | null = null,
  cursor: string | null = null,
): ClassificationPage {
  const root = kind === "process" ? "class:isic" : "class:cpc";
  const parent = parentNodeId ? classificationFixtureNode(locale, parentNodeId) : null;
  const from = cursor === "page50" ? 50 : cursor === "page100" ? 100 : 0;
  const ids =
    parentNodeId === null
      ? [root]
      : parentNodeId === root
        ? [`${root}:0`, `${root}:1`]
        : parentNodeId.split(":").length === 3
          ? Array.from(
              { length: Math.min(50, 121 - from) },
              (_, i) => `${parentNodeId}:${from + i}`,
            )
          : [];
  const ancestors: ClassificationPage["ancestors"] = [];
  for (let id = parent?.parentNodeId; id; id = classificationFixtureNode(locale, id).parentNodeId) {
    const node = classificationFixtureNode(locale, id);
    ancestors.unshift({
      nodeId: node.nodeId,
      parentNodeId: node.parentNodeId,
      code: node.code,
      label: node.label,
    });
  }
  return {
    schemaVersion: "portal.classification-branch.v1",
    countBasis: "public_versions",
    locale,
    kind,
    parent,
    ancestors,
    nodes: ids.map((id) => classificationFixtureNode(locale, id)),
    nextCursor:
      parentNodeId?.split(":").length === 3 && from < 100
        ? from === 0
          ? "page50"
          : "page100"
        : null,
  };
}
export function classificationFixtureSeeds(
  locale: PortalLocale,
  kind: "process" | "flow",
  selected?: string,
): ClassificationSeed[] {
  const page = classificationFixturePage(locale, kind, selected ?? null);
  return [...new Set([null, ...page.ancestors.map((node) => node.nodeId), selected ?? null])].map(
    (parentNodeId) => ({
      parentNodeId,
      page: classificationFixturePage(locale, kind, parentNodeId),
    }),
  );
}
