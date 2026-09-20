import { describe, expect, it } from "vitest";
import {
  containsViewBox,
  fitViewBox,
  interpolateViewBox,
  parseViewBox,
} from "@/features/catalog/map-viewport";

describe("geographic camera", () => {
  it("rejects malformed, infinite and collapsed windows", () => {
    for (const value of [null, "", "1 2 3", "0 0 Infinity 8", "0 0 -1 8", "0 0 8 0", "0 0 1 2 3"])
      expect(parseViewBox(value)).toBeNull();
    expect(parseViewBox("-5, 10, 2.5, 8")).toEqual([-5, 10, 2.5, 8]);
  });
  it("fits a wide viewport without clipping the province or painting beyond context", () => {
    const result = fitViewBox([40, 30, 20, 40], 3, [-10, 10, 120, 80]);
    expect(result).toEqual([-10, 30, 120, 40]);
    expect(containsViewBox(result, [40, 30, 20, 40])).toBe(true);
  });
  it("preserves the full foreground on portrait screens and bounds unusual ratios", () => {
    expect(fitViewBox([30, 40, 40, 20], 0.5, [0, 10, 100, 80])).toEqual([30, 10, 40, 80]);
    expect(fitViewBox([40, 30, 20, 40], 10, [-10, 10, 120, 80])).toEqual([-10, 30, 120, 40]);
    expect(fitViewBox([0, 0, 40, 20], 3, [5, 5, 10, 10])).toEqual([0, 0, 40, 20]);
  });
  it("keeps a stable center and valid dimensions while moving in either direction", () => {
    const world: [number, number, number, number] = [-100, -50, 200, 100];
    const region: [number, number, number, number] = [20, 10, 20, 10];
    expect(interpolateViewBox(world, region, 0)).toEqual(world);
    expect(interpolateViewBox(world, region, 1)).toEqual(region);
    expect(interpolateViewBox(region, world, 1)).toEqual(world);
    const midway = interpolateViewBox(world, region, 0.5);
    expect(containsViewBox(world, midway)).toBe(true);
    expect(containsViewBox(midway, region)).toBe(true);
  });
});
