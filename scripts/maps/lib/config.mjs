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
 * The value is chosen from `scripts/maps/coverage-report.json`, not by taste: at
 * 10000 units the world layer loses five rings to integer rounding (Vatican
 * City, Tokelau, Macao, Ashmore and Cartier, and one Italian islet), while at
 * 80000 units no ring is lost at all and every layer still fits under the
 * gzip budget. Integer coordinates keep the path strings compact; a larger
 * space costs roughly a quarter more bytes and buys complete shape coverage.
 */
export const COORDINATE_UNITS = 80000;

/**
 * Chinese administrative layers share one projection and one fitted coordinate
 * space, so a province sublayer's `viewBox` is a window into exactly the same
 * space as `geo:cn`. The UI can therefore zoom a province and swap in its city
 * layer without re-projecting or re-fitting.
 */
export const PROJECTIONS = {
  world: "robinson",
  china: "webmercator",
};

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
