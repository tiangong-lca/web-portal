/**
 * Shared constants for the Portal region-map asset pipeline.
 *
 * Everything here is a reviewed, fixed input to generation: changing any value
 * changes the emitted layer bytes, so the `--check` mode in
 * `../build-region-maps.mjs` fails until the assets are regenerated.
 */

/** Schema marker written into the generated manifest. */
export const SCHEMA_VERSION = "portal.region-map-manifest.v1";

/**
 * Pinned mapshaper release. The pipeline never resolves a floating version:
 * the project dependency and optional local toolchain both use this exact
 * version, so simplification output stays byte-stable.
 */
export const MAPSHAPER_VERSION = "0.7.61";

/** Hard per-layer budget from the region-map task (<= 150 KiB gzip). */
export const LAYER_GZIP_BUDGET_BYTES = 150 * 1024;

/**
 * The largest bounding-box dimension of a layer family is fitted to this many
 * integer coordinate units.
 *
 * Every layer is a window into this one space, so the value is set by the
 * smallest window the product shows: a city layer is roughly 1/300 of the world
 * width, and at 400 000 units that still leaves sub-pixel integer precision
 * there while every layer stays under the gzip budget. See
 * `scripts/maps/coverage-report.json` for the measured outcome.
 */
export const COORDINATE_UNITS = 400000;

/**
 * One projection and one affine transform for every layer, so the world, each
 * country and each province are windows into the same map and the UI can
 * interpolate a camera between them without reprojecting anything.
 */
export const PROJECTION = "+proj=robin +lon_0=150";

/** Marker the renderer uses to know it may treat every layer as one camera. */
export const COORDINATE_SPACE = "pacific-robinson-v1";

/**
 * Vertex-retention percentages handed to `mapshaper -simplify <p> keep-shapes`.
 * `keep-shapes` preserves polygon features; quantization losses are recorded;
 * see `scripts/maps/coverage-report.json` for the emitted shape counts.
 *
 * Values are deliberately conservative: the worst layer lands below
 * the gzip budget, leaving room for a source refresh before the gate bites.
 */
export const SIMPLIFY = {
  world: "20%",
  chinaProvince: "50%",
  chinaCity: "50%",
};

/**
 * Basemap parameters: the faded geographic context drawn behind a layer's
 * foreground. All of it is re-derived from sources the layer already depends
 * on, projected by the same locked mapshaper release with the same projection
 * string and fitted transform as the foreground, so basemap and foreground
 * agree coordinate for coordinate.
 */
export const BASEMAP = {
  /** Region windows grow by this fraction on each axis so neighbours are visible. */
  viewBoxExtension: 0.1,
  /**
   * The world window is the union of the foreground box and the projection
   * silhouette, plus this slack in coordinate units, so the whole Robinson
   * outline is visible and a stroke on the edge is not clipped.
   */
  worldWindowSlack: 2,
  /** Latitude the regional graticule stops at, so no grid line sits on the pole edge. */
  graticuleLatitudeLimit: 85,
  /**
   * Canvas aspect ratios the background must cover. A layer's preferred window
   * is grown into the smallest centred box that contains it at every ratio in
   * this range, which is what `basemap.viewBox` reports.
   */
  aspectRange: [0.75, 4],
  /**
   * Context simplification, graded by how much of the world a layer's
   * background window covers. The country layer declares a window several times
   * its own size, so it is simplified hard to stay inside the byte budget; a
   * city window is small, and 5% there visibly triangulated coastlines and
   * turned province borders into long straight chords. Both land and borders
   * use the value for their layer. Measured, not guessed — see
   * coverage-report.json.
   */
  contextSimplify: { country: "5%", city: "35%" },
  /**
   * Graticule density. The world is fixed at 30°; regional windows choose the
   * finest rung of the ladder that still yields `minimumLines` lines in view.
   */
  graticule: { world: 30, regionalLadder: [10, 5, 2, 1], minimumLines: 3 },
};

/** mapshaper writes projected coordinates rounded to this many metres. */
export const INTERMEDIATE_PRECISION = 1;

/** Output paths, relative to the Portal repository root. */
export const OUTPUT = {
  manifest: "src/features/catalog/region-map-manifest.generated.json",
  coverage: "scripts/maps/coverage-report.json",
  layerDir: "public/maps",
  sourceDir: "scripts/maps/sources",
  sourceManifest: "scripts/maps/sources/manifest.json",
  locationDictionary: "src/i18n/locations.generated.json",
};

/** Public URL prefix the emitted layers are served from. */
export const LAYER_URL_PREFIX = "/maps";

/**
 * Chinese administrative parents the pinned Database vocabulary already states,
 * bound to the GeoAtlas feature that asserts the same parenthood.
 *
 * Both halves are evidence and both are required: the canonical node must exist
 * with exactly this id, code and parent, and the GeoAtlas source must hold
 * exactly one feature at this adcode, named this, at province level, whose own
 * `parent.adcode` is 100000. A code like `CN-TW` is never guessed, and a feature
 * that fails a required binding gate fails the build.
 */
export const CHINA_ADMINISTRATIVE_BINDINGS = [
  { nodeId: "geo:tw", code: "TW", adcode: 710000, name: "台湾省", parentNodeId: "geo:cn" },
  { nodeId: "geo:hk", code: "HK", adcode: 810000, name: "香港特别行政区", parentNodeId: "geo:cn" },
  { nodeId: "geo:mo", code: "MO", adcode: 820000, name: "澳门特别行政区", parentNodeId: "geo:cn" },
];
