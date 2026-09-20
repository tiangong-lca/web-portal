import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { PortalLocale } from "@/i18n/routing";

export type RegionEntry = {
  nodeId: string;
  code: string;
  labels: Partial<Record<PortalLocale, string>>;
  count: number;
  hasChildren: boolean;
  dataUrl: string;
};
export type NavigationBranch = {
  count: number | null;
  directCount: number | null;
  complete: boolean;
  entries: RegionEntry[];
};
export type Bounds = [number, number, number, number];
export type RegionProperties = {
  boundaryId: string;
  nodeId: string | null;
  navigationNodeId?: string;
  bounds?: Bounds;
  count?: number | null;
};
export type RegionFeature = Feature<Polygon | MultiPolygon, RegionProperties>;
export type RegionGeometry = FeatureCollection<Polygon | MultiPolygon, RegionProperties>;
export type MapMode = "globe" | "flat" | "svg" | "list";

export function regionLabel(entry: RegionEntry, locale: PortalLocale) {
  const label = entry.labels[locale] ?? entry.labels["zh-CN"] ?? entry.code;
  return locale === "zh-CN" ? label.split(",").at(-1)! : label;
}

export function geometryBounds(features: RegionFeature[]): Bounds | null {
  let west = Infinity,
    south = Infinity,
    east = -Infinity,
    north = -Infinity;
  const walk = (coordinates: unknown): void => {
    if (!Array.isArray(coordinates)) return;
    if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
      west = Math.min(west, coordinates[0]);
      east = Math.max(east, coordinates[0]);
      south = Math.min(south, coordinates[1]);
      north = Math.max(north, coordinates[1]);
    } else coordinates.forEach(walk);
  };
  features.forEach((feature) => walk(feature.geometry.coordinates));
  return Number.isFinite(west) ? [west, south, east, north] : null;
}
