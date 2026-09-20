export type MapFeature = {
  boundaryId: string;
  nodeId: string | null;
  /** A receipted presentation target, separate from the source geography/data identity. */
  navigationNodeId?: string;
  path: string;
};

/** One link owns all of a target's polygons, so pointer and keyboard interaction agree. */
export function groupMapInteractions(features: readonly MapFeature[]) {
  const groups = new Map<string, { key: string; nodeId: string | null; features: MapFeature[] }>();
  features.forEach((feature, index) => {
    const nodeId = feature.navigationNodeId ?? feature.nodeId;
    const key = nodeId === null ? `shape:${feature.boundaryId}:${index}` : `node:${nodeId}`;
    const group = groups.get(key);
    if (group) group.features.push(feature);
    else groups.set(key, { key, nodeId, features: [feature] });
  });
  return [...groups.values()];
}
