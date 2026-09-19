import { describe, expect, it, vi } from "vitest";
import {
  parsePortalBrowseUrl,
  browseFiltersSchema,
  publicNavigationSchema,
} from "@/server/contracts/navigation";
import { publicSearchFiltersSchema } from "@/server/contracts/input";
import { hierarchyFilters, navigationHref } from "@/features/catalog/navigation-links";
import { facetHref, searchParameters } from "@/features/catalog/search-links";
import { getPublicNavigation } from "@/server/data/navigation";
import type { PortalRpcClient } from "@/server/data/supabase-rpc";

const node = {
  nodeId: "geo:cn",
  parentNodeId: null,
  taxonomy: "ilcd-locations",
  code: "CN",
  count: 4,
  directCount: 1,
  hasChildren: true,
};
const response = {
  schemaVersion: "portal.public-navigation.v1",
  countBasis: "public_versions",
  dimension: "geography",
  kind: "process",
  totals: { process: 4, flow: 2 },
  parent: null,
  ancestors: [],
  nodes: [node],
  nextCursor: null,
};

describe("hierarchical catalog navigation", () => {
  it("keeps hierarchy filters out of V2/Hybrid", () => {
    expect(publicSearchFiltersSchema.safeParse({ geographyNodeId: "geo:cn" }).success).toBe(false);
    const input = parsePortalBrowseUrl({
      v: "1",
      geoNode: "geo:cn",
      geoScope: "direct",
      classNode: "class:isic:0.0",
      source: "database",
    });
    expect(input.filters).toEqual({
      geographyNodeId: "geo:cn",
      geographyScope: "direct",
      classificationNodeId: "class:isic:0.0",
      source: "database",
    });
    expect(searchParameters(input).get("classNode")).toBe("class:isic:0.0");
  });
  it("rejects malformed nodes, repeated parameters, cross-dimension ids and orphan scopes", () => {
    for (const input of [
      { geoNode: "https://host" },
      { geoNode: ["geo:cn", "geo:de"] },
      { geoNode: "class:cpc" },
      { geoScope: "direct" },
    ]) {
      expect(() => parsePortalBrowseUrl(input)).toThrow(/invalid|Invalid|custom/);
    }
    expect(browseFiltersSchema.safeParse({ geographyNodeId: "geo:~a1b2c3" }).success).toBe(true);
  });
  it("replaces exact geography with subtree selection, preserving other filters and clearing pagination", () => {
    const input = parsePortalBrowseUrl({
      geo: "cn",
      source: "test",
      classNode: "class:isic:0",
      q: "steel",
      cursor: "old",
    });
    const href = new URL(
      navigationHref("zh-CN", input, "geography", "geo:cn-ah"),
      "https://portal.test",
    );
    expect(href.searchParams.get("geo")).toBeNull();
    expect(href.searchParams.get("cursor")).toBeNull();
    expect(href.searchParams.get("geoNode")).toBe("geo:cn-ah");
    expect(href.searchParams.get("classNode")).toBe("class:isic:0");
    expect(href.searchParams.get("source")).toBe("test");
    expect(href.searchParams.get("explore")).toBe("region");
    expect(hierarchyFilters(input, "classification")).toEqual({ geography: "cn", source: "test" });
  });
  it("uses direct scope only on explicit direct entry and drops incompatible categories on type switch", () => {
    const input = parsePortalBrowseUrl({
      kind: "process",
      classNode: "class:isic:0",
      geoNode: "geo:cn",
      subtype: "unit process",
    });
    const direct = new URL(
      navigationHref("en", input, "geography", "geo:cn", { results: true, scope: "direct" }),
      "https://portal.test",
    );
    expect(direct.searchParams.get("geoScope")).toBe("direct");
    expect(direct.searchParams.get("explore")).toBe("process");
    const flow = new URL(facetHref("en", input, "kind", "flow")!, "https://portal.test");
    expect(flow.searchParams.get("classNode")).toBeNull();
    expect(flow.searchParams.get("subtype")).toBeNull();
    expect(flow.searchParams.get("geoNode")).toBe("geo:cn");
  });
  it("binds a one-layer RPC to the requested parent and uses a 30-second cache", async () => {
    const client: PortalRpcClient = {
      call: async (_name, _args, schema) => schema.parse(response),
    };
    const call = vi.spyOn(client, "call");
    await expect(
      getPublicNavigation(
        { kind: "process", dimension: "geography", filters: {}, query: "" },
        client,
      ),
    ).resolves.toMatchObject({ countBasis: "public_versions" });
    expect(call).toHaveBeenCalledWith(
      "portal_navigation_v1",
      expect.objectContaining({ p_parent_node_id: null, p_limit: 100 }),
      expect.anything(),
      expect.objectContaining({ seconds: 30 }),
    );
    call.mockImplementation(async (_name, _args, schema) =>
      schema.parse({ ...response, nodes: [{ ...node, parentNodeId: "geo:de" }] }),
    );
    await expect(
      getPublicNavigation(
        { kind: "process", dimension: "geography", filters: {}, query: "" },
        client,
      ),
    ).rejects.toThrow(/invalid|Invalid|custom/);
  });
  it("rejects inconsistent direct counts and duplicate child identities", () => {
    expect(
      publicNavigationSchema.safeParse({ ...response, nodes: [{ ...node, directCount: 5 }] })
        .success,
    ).toBe(false);
    expect(publicNavigationSchema.safeParse({ ...response, nodes: [node, node] }).success).toBe(
      false,
    );
  });
});

describe("unknown classification navigation", () => {
  it("selects raw-group containers without filtering by their synthetic code", () => {
    for (const taxonomy of ["isic", "cpc", "elementary"]) {
      const input = parsePortalBrowseUrl({
        kind: taxonomy === "isic" ? "process" : "flow",
        q: "water",
        classification: "previous",
        geoNode: "geo:cn",
        cursor: "old-result-page",
        navCursor: "old-navigation-page",
      });
      const nodeId = `class:${taxonomy}:~raw`;
      const url = new URL(
        navigationHref("en", input, "classification", nodeId, {
          code: "~",
          results: true,
        }),
        "https://portal.test",
      );
      expect(url.searchParams.get("classNode")).toBe(nodeId);
      expect(url.searchParams.get("classification")).toBeNull();
      expect(url.searchParams.get("geoNode")).toBe("geo:cn");
      expect(url.searchParams.get("q")).toBe("water");
      expect(url.searchParams.get("cursor")).toBeNull();
      expect(url.searchParams.get("navCursor")).toBeNull();
    }
  });
  it("keeps an authored code alongside an opaque raw classification leaf", () => {
    const input = parsePortalBrowseUrl({ kind: "flow", classification: "~" });
    const url = new URL(
      navigationHref("en", input, "classification", "class:elementary:~a1b2", {
        code: "Raw code 42",
        results: true,
      }),
      "https://portal.test",
    );
    expect(url.searchParams.get("classNode")).toBe("class:elementary:~a1b2");
    expect(url.searchParams.get("classification")).toBe("Raw code 42");
  });
});

it("repairs old virtual-container bookmarks without changing genuine tilde filters", () => {
  const repaired = parsePortalBrowseUrl({
    kind: "flow",
    classNode: "class:elementary:~raw",
    classification: "~",
    geoNode: "geo:cn",
    q: "water",
    cursor: "old-result-page",
  });
  expect(repaired.filters).toEqual({
    classificationNodeId: "class:elementary:~raw",
    geographyNodeId: "geo:cn",
  });
  expect(repaired.query).toBe("water");
  expect(repaired.cursor).toBeNull();
  for (const classNode of [undefined, "class:elementary:~a1b2"]) {
    const original = parsePortalBrowseUrl({
      kind: "flow",
      classNode,
      classification: "~",
      cursor: "old-result-page",
    });
    expect(original.filters.classification).toBe("~");
    expect(original.cursor).toBe("old-result-page");
  }
});
