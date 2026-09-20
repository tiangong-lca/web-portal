// Synthetic, public-only navigation fixture. This module is never imported by product code.
type Node = {
  nodeId: string;
  parentNodeId: string | null;
  code: string;
  taxonomy: string;
  dimension: string;
  count: number;
  directCount: number;
  hasChildren: boolean;
};
const nodes: Node[] = [
  ...["TW", "HK", "MO", "CN-XZ"].map((code) => ({
    nodeId: `geo:${code.toLowerCase()}`,
    parentNodeId: "geo:cn",
    code,
    taxonomy: "ilcd-locations",
    dimension: "geography",
    count: 0,
    directCount: 0,
    hasChildren: code === "CN-XZ",
  })),
  {
    nodeId: "geo:aq",
    parentNodeId: null,
    code: "AQ",
    taxonomy: "ilcd-locations",
    dimension: "geography",
    count: 0,
    directCount: 0,
    hasChildren: false,
  },
  {
    nodeId: "geo:cn",
    parentNodeId: null,
    code: "CN",
    taxonomy: "ilcd-locations",
    dimension: "geography",
    count: 2,
    directCount: 1,
    hasChildren: true,
  },
  {
    nodeId: "geo:cn-ah",
    parentNodeId: "geo:cn",
    code: "CN-AH",
    taxonomy: "ilcd-locations",
    dimension: "geography",
    count: 1,
    directCount: 0,
    hasChildren: true,
  },
  {
    nodeId: "geo:cn-ah-hfe",
    parentNodeId: "geo:cn-ah",
    code: "CN-AH-HFE",
    taxonomy: "ilcd-locations",
    dimension: "geography",
    count: 1,
    directCount: 1,
    hasChildren: false,
  },
  {
    nodeId: "geo:special",
    parentNodeId: null,
    code: "ALL",
    taxonomy: "database-virtual",
    dimension: "geography",
    count: 1,
    directCount: 0,
    hasChildren: true,
  },
  {
    nodeId: "geo:row",
    parentNodeId: "geo:special",
    code: "RoW",
    taxonomy: "ilcd-locations",
    dimension: "geography",
    count: 1,
    directCount: 1,
    hasChildren: false,
  },
  {
    nodeId: "class:isic",
    parentNodeId: null,
    code: "ALL",
    taxonomy: "isic",
    dimension: "classification",
    count: 2,
    directCount: 0,
    hasChildren: true,
  },
  {
    nodeId: "class:isic:0",
    parentNodeId: "class:isic",
    code: "A",
    taxonomy: "isic",
    dimension: "classification",
    count: 2,
    directCount: 0,
    hasChildren: true,
  },
  {
    nodeId: "class:isic:0.0",
    parentNodeId: "class:isic:0",
    code: "01",
    taxonomy: "isic",
    dimension: "classification",
    count: 2,
    directCount: 2,
    hasChildren: false,
  },
  {
    nodeId: "class:cpc",
    parentNodeId: null,
    code: "ALL",
    taxonomy: "cpc",
    dimension: "classification",
    count: 1,
    directCount: 0,
    hasChildren: true,
  },
  {
    nodeId: "class:cpc:0",
    parentNodeId: "class:cpc",
    code: "0",
    taxonomy: "cpc",
    dimension: "classification",
    count: 1,
    directCount: 1,
    hasChildren: false,
  },
];

function dto(node: Node) {
  const { dimension: _dimension, ...rest } = node;
  return rest;
}

export function navigationFixture(arguments_: Record<string, unknown>) {
  const dimension = arguments_.p_dimension;
  const parentId = arguments_.p_parent_node_id ?? null;
  const parent = nodes.find((node) => node.nodeId === parentId);
  const ancestors: Pick<Node, "nodeId" | "parentNodeId" | "code" | "taxonomy">[] = [];
  let previous = parent?.parentNodeId;
  while (previous) {
    const ancestor = nodes.find((node) => node.nodeId === previous);
    if (!ancestor) break;
    ancestors.unshift({
      nodeId: ancestor.nodeId,
      parentNodeId: ancestor.parentNodeId,
      code: ancestor.code,
      taxonomy: ancestor.taxonomy,
    });
    previous = ancestor.parentNodeId;
  }
  const children = nodes.filter(
    (node) =>
      node.dimension === dimension &&
      node.parentNodeId === parentId &&
      (dimension === "geography" ||
        arguments_.p_kind === "all" ||
        (arguments_.p_kind === "process" ? node.taxonomy === "isic" : node.taxonomy === "cpc")),
  );
  return {
    schemaVersion: "portal.public-navigation.v1",
    countBasis: "public_versions",
    dimension,
    kind: arguments_.p_kind,
    totals: { process: 2, flow: 1 },
    parent: parent ? dto(parent) : null,
    ancestors,
    nodes: children.map(dto),
    nextCursor: null,
  };
}

export function filterNavigationFixture<T extends { items: unknown[] }>(
  page: T,
  arguments_: Record<string, unknown>,
): T {
  const filters = arguments_.p_filters as Record<string, unknown> | undefined;
  if (nodes.some((node) => node.nodeId === filters?.geographyNodeId && node.count === 0))
    return { ...page, items: [] };
  if (filters?.geographyNodeId === "geo:cn-ah" || filters?.geographyNodeId === "geo:cn-ah-hfe") {
    return {
      ...page,
      items:
        filters.geographyScope === "direct" && filters.geographyNodeId === "geo:cn-ah"
          ? []
          : page.items.slice(0, 1),
    };
  }
  if (filters?.geographyNodeId === "geo:cn" && filters.geographyScope === "direct")
    return { ...page, items: page.items.slice(1, 2) };
  return page;
}
