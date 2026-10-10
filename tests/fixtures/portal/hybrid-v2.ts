import catalog from "./catalog-v1.json";

export function hybridVersionPage() {
  const item = {
    ...structuredClone(catalog.search.items[0]!),
    match: {
      kind: "hybrid" as const,
      algorithmVersion: "portal-hybrid-rank-v2" as const,
      score: 0.9,
      reasonCodes: ["lexical_public_projection" as const, "semantic_public_projection" as const],
      evidence: { lexicalRank: 1, semanticRank: 1, semanticDistance: "0.125" },
    },
  };
  return {
    schemaVersion: "portal.hybrid-search-page.v3" as const,
    kind: "process" as const,
    queryFingerprint: "a".repeat(64),
    interpretation: {
      source: "model_generated" as const,
      advisory: true as const,
      semanticQuery: "low carbon steel production",
      terms: [{ language: "en" as const, value: "steel production" }],
    },
    items: [item],
    candidateCount: 2,
    datasetCount: 1,
    nextCursor: null as string | null,
    versionGroups: [
      {
        key: item.key,
        matches: [
          { key: item.key, brand: item.brand, match: item.match },
          {
            key: { ...item.key, version: "00.99.999" },
            brand: item.brand,
            match: { ...item.match, score: 0.7 },
          },
        ],
      },
    ],
  };
}
