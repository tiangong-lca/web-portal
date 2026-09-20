import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { PortalLocale } from "@/i18n/routing";
import type { NavigationEntry } from "./catalog-navigation";

/**
 * `[west, south, east, north]` in EPSG:4326, the convention of the generated asset manifest. A
 * feature box with `west > east` crosses the antimeridian; a layer box never does.
 */
export type RegionMapBounds = [number, number, number, number];

/** Same-origin, content-hashed assets resolved from `region-maplibre-manifest.generated.json`. */
export type RegionMapAssets = {
  /** The geographic level being shown: `world`, `geo:cn`, or an existing province/city node id. */
  layer: string;
  /** Geometry for `layer`; the world layer is reused as the current level at `world`. */
  url: string;
  worldUrl: string;
  chinaUrl: string;
  /** Reviewed China extent, including the South China Sea. */
  chinaBounds: RegionMapBounds;
  /** The bundled standalone ES-module worker for the pinned MapLibre version. */
  workerUrl: string;
  /** License notices for the renderer and its bundled dependencies. */
  noticeUrl: string;
};

/** Observable scene status: loading until a level is installed and idle, or failed. */
export type RegionMapStatus = "loading" | "ready" | "failed";

/** Localized map text supplied by the surrounding product UI. */
export type RegionMapLabels = {
  title: string;
  loading: string;
  unavailable: string;
  gestureWindows: string;
  gestureMac: string;
  gestureMobile: string;
};

export type RegionMapSceneProps = {
  assets: RegionMapAssets;
  /** The current level's entries; only these ids are interactive, including zero counts. */
  entries: NavigationEntry[];
  /** Globe mode for the world and China levels; province and city views stay flat. */
  globe: boolean;
  locale: PortalLocale;
  selected: string | null;
  /** A new `sequence` requests a camera move to `nodeId` (null frames the whole level). */
  cameraRequest: { nodeId: string | null; sequence: number };
  reducedMotion?: boolean;
  unavailable?: boolean;
  labels: RegionMapLabels;
  onSelect: (nodeId: string) => void;
  onHover: (nodeId: string | null) => void;
  onReady: (ready: boolean) => void;
  /** Every real status transition, so the wrapper can offer a retry after a real failure only. */
  onStatus?: (status: RegionMapStatus) => void;
  onMoving?: (moving: boolean) => void;
};

/** Reviewed per-feature receipts emitted by `scripts/maps/build-maplibre-maps.mjs`. */
export type RegionMapFeatureProperties = {
  boundaryId: string;
  nodeId: string | null;
  /** Set when a shape presents another target, as Taiwan, Hong Kong and Macao do on the world layer. */
  navigationNodeId?: string;
  parentNodeId?: string;
  bounds: RegionMapBounds;
};

export type RegionMapFeature = Feature<Polygon | MultiPolygon, RegionMapFeatureProperties>;
export type RegionMapGeometry = FeatureCollection<
  Polygon | MultiPolygon,
  RegionMapFeatureProperties
>;
