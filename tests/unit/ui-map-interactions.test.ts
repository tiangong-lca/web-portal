import { describe, expect, it } from "vitest";
import { groupMapInteractions, type MapFeature } from "@/features/catalog/map-interactions";

describe("map interaction targets", () => {
  it("joins mainland, Taiwan and South China Sea shapes without changing their source identities", () => {
    const features: readonly MapFeature[] = Object.freeze([
      Object.freeze({ boundaryId: "ne50m:CHN", nodeId: "geo:cn", path: "M0 0H4V4Z" }),
      Object.freeze({
        boundaryId: "ne50m:TWN",
        nodeId: "geo:tw",
        navigationNodeId: "geo:cn",
        path: "M5 0H6V2Z",
      }),
      Object.freeze({
        boundaryId: "datav:460300",
        nodeId: null,
        navigationNodeId: "geo:cn",
        path: "M2 7H3V8Z",
      }),
      Object.freeze({
        boundaryId: "cnprov:100000_JD",
        nodeId: null,
        navigationNodeId: "geo:cn",
        path: "M4 5H5V6Z",
      }),
    ]);
    const groups = groupMapInteractions(features);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.nodeId).toBe("geo:cn");
    expect(groups[0]!.features).toEqual(features);
    expect(features[1]!.nodeId).toBe("geo:tw");
    expect(features[2]!.nodeId).toBeNull();
  });

  it("gives multipart regions one link while keeping different provinces independent", () => {
    const groups = groupMapInteractions([
      { boundaryId: "part-a", nodeId: "geo:gb", path: "a" },
      { boundaryId: "part-b", nodeId: "geo:gb", path: "b" },
      { boundaryId: "province-a", nodeId: "geo:cn-ah", path: "c" },
      { boundaryId: "province-b", nodeId: "geo:cn-gd", path: "d" },
    ]);
    expect(groups.map(({ nodeId, features }) => [nodeId, features.length])).toEqual([
      ["geo:gb", 2],
      ["geo:cn-ah", 1],
      ["geo:cn-gd", 1],
    ]);
  });

  it("leaves unassigned geometry without a navigation target and accepts older assets", () => {
    const groups = groupMapInteractions([
      { boundaryId: "unknown-a", nodeId: null, path: "a" },
      { boundaryId: "unknown-b", nodeId: null, path: "b" },
      { boundaryId: "ordinary", nodeId: "geo:fr", path: "c" },
    ]);
    expect(groups.map(({ nodeId }) => nodeId)).toEqual([null, null, "geo:fr"]);
    expect(new Set(groups.map(({ key }) => key)).size).toBe(3);
  });
});
