#!/usr/bin/env node
/**
 * Portal production MapLibre map assets.
 *
 * Modes:
 *   node scripts/maps/build-maplibre-maps.mjs          build assets (default)
 *   node scripts/maps/build-maplibre-maps.mjs --check  verify, write nothing
 *
 * This is the production promotion of the reviewed Storybook prototype. It emits
 * two things the Portal serves itself:
 *
 *   public/maps/gl/<layer>.<sha16>.json        EPSG:4326 boundary layers
 *   public/maps/gl/maplibre-gl-worker.<sha16>.js one self-contained worker
 *   public/maps/gl/maplibre-NOTICE.<sha16>.txt    third-party license notices
 *   src/features/catalog/region-maplibre-manifest.generated.json
 *
 * Relationship to the existing SVG pipeline: `build-region-maps.mjs` stays the
 * source of the reviewed node assignment and of the `public/maps/*.json` layers.
 * This script reads those emitted layers as an input, so the boundary-to-node
 * mapping is never re-derived here: `nodeId` and `navigationNodeId` are copied
 * from the reviewed result and joined to source geometry on `boundaryId`, and a
 * one-sided match in either direction fails the build.
 *
 * Nothing outside this repository is fetched. Every boundary source is a
 * vendored, hashed gzip under `scripts/maps/sources/`; the worker is bundled
 * offline from the pinned `maplibre-gl` package that is already installed.
 *
 * Determinism: no timestamp is emitted, and every output byte is a pure function
 * of the vendored sources, the reviewed emitted layers, `lib/config.mjs` and the
 * installed `maplibre-gl` and `vite` versions. Raw geometry bytes and their
 * hashes are canonical. gzip length is NOT: it varies by a few bytes between
 * Node/zlib builds, so it is reported as validation output and never stored in
 * the manifest, while the fixed per-layer budget is still enforced.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { MAPSHAPER_VERSION, SIMPLIFY } from "./lib/config.mjs";
import { loadNavigationContract } from "./lib/contract.mjs";
import { resolveMapshaper } from "./lib/mapshaper.mjs";
import { BASE_SOURCES, datavSource, loadSources, sha256Hex, stableJson } from "./lib/sources.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const MANIFEST_PATH = "src/features/catalog/region-maplibre-manifest.generated.json";
const ASSET_DIR = "public/maps/gl";
/** Served by the Portal itself; the SVG pipeline keeps `/maps`. */
const ASSET_URL_PREFIX = "/maps/gl";
const NOTICE_SOURCE = "scripts/maps/maplibre-NOTICE.txt";
const SCHEMA_VERSION = "portal.maplibre-map-assets.v1";

/** The renderer this asset set is built for, pinned exactly. */
const RENDERER = { name: "maplibre-gl", version: "6.10.0" };
/**
 * `dist/maplibre-gl-worker.mjs` is a thin entry that imports
 * `dist/maplibre-gl-shared.mjs`, so copying it alone would emit a worker that
 * cannot load. It is bundled into one self-contained module instead.
 */
const WORKER_ENTRY = `node_modules/${RENDERER.name}/dist/maplibre-gl-worker.mjs`;
const WORKER_FILE_STEM = "maplibre-gl-worker";

/** Hard per-layer budget, the same one the SVG pipeline enforces. */
const LAYER_GZIP_BUDGET_BYTES = 150 * 1024;

/**
 * Coordinate precision handed to mapshaper, in decimal degrees. The world layer
 * is an overview that is never zoomed far, and 0.001 (about 110 m) is below one
 * screen pixel at any world-scale framing. The Chinese layers are drilled into,
 * and 0.00001 (about 1 m) keeps a prefecture outline clean at city scale.
 */
const PRECISION = { world: 0.001, china: 0.00001 };

/** Simplification reuses the reviewed production percentage for each family. */
const SIMPLIFY_PERCENT = {
  world: SIMPLIFY.world,
  province: SIMPLIFY.chinaProvince,
  city: SIMPLIFY.chinaCity,
};

/**
 * The world layer borrows the nine-dash inset and Sansha from Chinese layers
 * that already carry them, exactly as the SVG world layer borrows their emitted
 * paths. Copying the emitted ring coordinates keeps both pipelines adding the
 * same two shapes from the same source rows instead of redrawing them.
 * `boundaryId` and the interaction alias are the ones the SVG world layer
 * already publishes for these two shapes.
 */
const WORLD_SUPPLEMENTS = [
  { boundaryId: "cnprov:100000_JD", from: "geo:cn" },
  { boundaryId: "datav:460300", from: "geo:cn-hi" },
];

/**
 * Every occurrence of a remote URL or a `blob:` string in the bundled worker
 * must be one of these two MapLibre-internal texts, and nothing else. Both are
 * data, not fetch targets: the first is the text of a diagnostic message and the
 * second is a protocol comparison. Recording them by exact value keeps the
 * bundle assertion fail-closed: an upstream change that introduces a real remote
 * dependency has to be reviewed rather than silently shipped.
 */
const WORKER_EXPECTED_URL = "https://github.com/mapbox/mapbox-gl-js/issues/2907";
const WORKER_BLOB_COMPARISON = '=== "blob:"';

function readJson(path) {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8"));
}

function write(path, bytes) {
  const target = join(ROOT, path);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, bytes);
}

/**
 * Resolve one emitted layer's source id back to its definition, so `loadSources`
 * can verify every vendored byte and reject a source set that no longer matches
 * the layers it feeds.
 */
function sourceDefinition(id) {
  const base = BASE_SOURCES.find((source) => source.id === id);
  if (base) return base;
  const match = /^datav-(\d{6})$/u.exec(id);
  if (!match) throw new Error(`Unknown region-map source id: ${id}`);
  return datavSource(match[1]);
}

/* ------------------------------------------------------------- geometry --- */

/** Simplify one source in longitude/latitude space, without reprojecting it. */
function simplifySource(mapshaper, sourceId, geojson, percent, precision, workDir, planar = false) {
  const input = join(workDir, `${sourceId}.in.json`);
  const output = join(workDir, `${sourceId}.out.geojson`);
  writeFileSync(input, JSON.stringify(geojson));
  execFileSync(
    mapshaper.command,
    [
      ...mapshaper.args,
      input,
      "-simplify",
      percent,
      // The spherical world metric amplifies platform-dependent trigonometric rounding.
      // Use the official planar metric for this overview; preserve reviewed China layers.
      ...(planar ? ["planar"] : []),
      "keep-shapes",
      "-o",
      output,
      "format=geojson",
      `precision=${precision}`,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const simplified = JSON.parse(readFileSync(output, "utf8"));
  if (simplified.features.length !== geojson.features.length) {
    throw new Error(
      `${sourceId}: mapshaper returned ${simplified.features.length} features for ${geojson.features.length} source features.`,
    );
  }
  return simplified;
}

function polygonsOf(geometry) {
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  throw new Error(
    `Unexpected geometry type ${geometry.type}; only polygonal boundaries are mapped.`,
  );
}

/** Shoelace sum over a ring; negative means counter-clockwise in lon/lat. */
function ringSum(ring) {
  let sum = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    sum += (x2 - x1) * (y2 + y1);
  }
  return sum;
}

/**
 * Ring winding. RFC 7946 puts exterior rings counter-clockwise and holes
 * clockwise, which is also what MapLibre's triangulator needs to nest a hole
 * inside its polygon. The pinned mapshaper release already normalises winding,
 * so this normally rewrites nothing; it is asserted rather than assumed because
 * a silent winding flip would fill a lake in as land.
 */
function orientRings(geometry) {
  let fixed = 0;
  const polygons = polygonsOf(geometry).map((polygon) =>
    polygon.map((ring, index) => {
      const wantCounterClockwise = index === 0;
      if (ringSum(ring) < 0 === wantCounterClockwise) return ring;
      fixed += 1;
      return [...ring].reverse();
    }),
  );
  return {
    geometry: {
      type: geometry.type,
      coordinates: geometry.type === "Polygon" ? polygons[0] : polygons,
    },
    fixed,
  };
}

/**
 * The shortest longitude arc covering every vertex.
 *
 * A feature can straddle the antimeridian, and its naive `[min, max]` box would
 * then span the planet. The covering arc is the complement of the largest empty
 * gap between consecutive longitudes, which is correct both for a contained
 * feature (whose largest gap is the one that wraps) and for a straddling one.
 * The result is `[west, south, east, north]` with `west > east` exactly when the
 * arc crosses the antimeridian, which is the form MapLibre's `LngLatBounds`
 * accepts.
 */
function longitudeArc(longitudes) {
  const sorted = [...new Set(longitudes)].sort((a, b) => a - b);
  if (sorted.length <= 1) {
    const only = sorted[0] ?? 0;
    return { west: only, east: only };
  }
  let widestGap = -1;
  let gapIndex = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    const from = sorted[index];
    const to = sorted[(index + 1) % sorted.length];
    const span = index === sorted.length - 1 ? to + 360 - from : to - from;
    if (span > widestGap) {
      widestGap = span;
      gapIndex = index;
    }
  }
  const naive = sorted[sorted.length - 1] - sorted[0];
  const west = sorted[(gapIndex + 1) % sorted.length];
  const east = sorted[gapIndex];
  const wrapped = (east + 360 - west) % 360;
  if (naive <= wrapped) return { west: sorted[0], east: sorted[sorted.length - 1] };
  return { west, east };
}

function positionsOf(geometry) {
  const out = [];
  for (const polygon of polygonsOf(geometry)) for (const ring of polygon) out.push(...ring);
  return out;
}

/** Five decimals is about one metre and keeps emitted bytes stable. */
function round(value) {
  return Number(value.toFixed(5));
}

/** Wrap-aware bounding box of one feature. */
function geometryBounds(geometry) {
  const positions = positionsOf(geometry);
  if (positions.length === 0) throw new Error("Empty geometry; cannot compute bounds.");
  const arc = longitudeArc(positions.map(([longitude]) => longitude));
  let south = Infinity;
  let north = -Infinity;
  for (const [, latitude] of positions) {
    if (latitude < south) south = latitude;
    if (latitude > north) north = latitude;
  }
  return [round(arc.west), round(south), round(arc.east), round(north)];
}

/** Naive union box for a layer window; no layer window straddles the seam. */
function collectionBounds(geometries) {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const geometry of geometries) {
    for (const [longitude, latitude] of positionsOf(geometry)) {
      if (longitude < west) west = longitude;
      if (longitude > east) east = longitude;
      if (latitude < south) south = latitude;
      if (latitude > north) north = latitude;
    }
  }
  if (!Number.isFinite(west)) throw new Error("Empty layer; cannot compute bounds.");
  return [round(west), round(south), round(east), round(north)];
}

/** Camera centre of a box, unwrapping a seam-crossing box. */
function boundsCenter(bounds) {
  const [west, south, east, north] = bounds;
  const span = east < west ? east + 360 - west : east - west;
  const middle = west + span / 2;
  return [round(middle > 180 ? middle - 360 : middle), round((south + north) / 2)];
}

/* --------------------------------------------------------------- worker --- */

/**
 * Bundle the worker into one self-contained ES module.
 *
 * `configFile: false` and `envDir: false` keep this build away from the app
 * configuration and any `.env` file, and `publicDir: false` keeps it from
 * copying the public tree. Nothing is written by the bundler: the returned bytes
 * are hashed and emitted by this script, so `--check` never touches the tree.
 */
async function bundleWorker(root) {
  const installed = readJson(`node_modules/${RENDERER.name}/package.json`).version;
  if (installed !== RENDERER.version) {
    throw new Error(
      `Installed ${RENDERER.name} is ${installed}; this pipeline is pinned to ${RENDERER.version}.`,
    );
  }
  const viteVersion = readJson("node_modules/vite/package.json").version;
  const { build } = await import("vite");
  const result = await build({
    configFile: false,
    envDir: false,
    publicDir: false,
    logLevel: "silent",
    build: {
      write: false,
      sourcemap: false,
      target: "es2022",
      lib: {
        entry: join(root, WORKER_ENTRY),
        formats: ["es"],
        fileName: WORKER_FILE_STEM,
      },
    },
  });
  const chunks = (Array.isArray(result) ? result : [result])
    .flatMap((entry) => entry.output ?? [])
    .filter((output) => output.type === "chunk");
  if (chunks.length !== 1) {
    throw new Error(`Worker bundling produced ${chunks.length} chunks; expected exactly one.`);
  }
  const code = chunks[0].code;
  assertSelfContainedWorker(code);
  return { code, viteVersion };
}

/**
 * Fail closed unless the worker can run without loading anything else.
 *
 * The two allowed non-code strings are MapLibre's own: a diagnostic message
 * that happens to contain a GitHub URL, and a `window.location.protocol`
 * comparison against `"blob:"`. If either changes, or if any module specifier,
 * `require`, `new Function` or `eval` appears, this throws so the bundle is
 * reviewed instead of shipped.
 */
function assertSelfContainedWorker(code) {
  const problems = [];
  const specifiers = [
    ...code.matchAll(/^\s*import\s[^;]*?from\s*["']([^"']+)["']/gmu),
    ...code.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/gu),
    ...code.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/gu),
  ].map((match) => match[1]);
  if (specifiers.length) problems.push(`module specifiers: ${specifiers.join(", ")}`);
  const requires = code.match(/\brequire\(/gu) ?? [];
  if (requires.length) problems.push(`${requires.length} require( call(s)`);
  const dynamicCode = [
    ...(code.match(/\bnew Function\(/gu) ?? []),
    ...(code.match(/[^.\w$]eval\(/gu) ?? []),
  ];
  if (dynamicCode.length) problems.push(`${dynamicCode.length} dynamic code evaluation(s)`);
  const remoteUrls = [...new Set([...code.matchAll(/https?:\/\/[^\s"'`)]+/gu)].map((m) => m[0]))];
  if (remoteUrls.length !== 1 || remoteUrls[0] !== WORKER_EXPECTED_URL) {
    problems.push(`remote URL references: ${remoteUrls.join(", ") || "none"}`);
  }
  const blobMentions = code.match(/blob:/gu) ?? [];
  if (blobMentions.length !== 1 || !code.includes(WORKER_BLOB_COMPARISON)) {
    problems.push(`${blobMentions.length} blob: mention(s) outside the protocol comparison`);
  }
  if (problems.length) {
    throw new Error(
      `The bundled MapLibre worker is not self-contained:\n  ${problems.join("\n  ")}`,
    );
  }
}

/* ---------------------------------------------------------------- build --- */

async function build() {
  const production = readJson("src/features/catalog/region-map-manifest.generated.json");
  const contract = loadNavigationContract(ROOT);
  const layerEntries = production.coverage.layers;
  const { manifest: sourceManifest, sources } = loadSources(
    ROOT,
    layerEntries.map((entry) => sourceDefinition(entry.source)),
  );
  const sourceSha = new Map(sourceManifest.sources.map((entry) => [entry.id, entry.sha256]));

  const mapshaper = resolveMapshaper(ROOT);
  if (mapshaper.origin !== `project mapshaper@${MAPSHAPER_VERSION}`) {
    throw new Error(`Unexpected mapshaper origin: ${mapshaper.origin}`);
  }

  // The reviewed assignment: what each emitted SVG shape answers to. Read from
  // the emitted layers rather than re-derived, so this pipeline cannot disagree
  // with the map the Portal already ships.
  const assignment = new Map();
  for (const entry of layerEntries) {
    const layer = readJson(
      join("public/maps", production.layers[entry.layer].url.replace(/^\/maps\//u, "")),
    );
    const byBoundaryId = new Map();
    for (const feature of layer.features) {
      if (byBoundaryId.has(feature.boundaryId)) {
        throw new Error(`${entry.layer}: duplicate emitted boundaryId ${feature.boundaryId}.`);
      }
      byBoundaryId.set(feature.boundaryId, {
        nodeId: feature.nodeId ?? null,
        navigationNodeId: feature.navigationNodeId ?? null,
      });
    }
    assignment.set(entry.layer, byBoundaryId);
  }

  const supplemental = new Set(WORLD_SUPPLEMENTS.map((supplement) => supplement.boundaryId));
  const workDir = mkdtempSync(join(tmpdir(), "portal-maplibre-maps-"));
  const evidence = { ringFixes: 0, seamCrossing: [], gzip: [] };
  try {
    const layers = new Map();
    const simplifiedBySource = new Map();
    const percentFor = (layerKey) =>
      layerKey === "world"
        ? SIMPLIFY_PERCENT.world
        : layerKey === "geo:cn"
          ? SIMPLIFY_PERCENT.province
          : SIMPLIFY_PERCENT.city;
    const precisionFor = (layerKey) => (layerKey === "world" ? PRECISION.world : PRECISION.china);

    for (const entry of layerEntries) {
      const simplified =
        simplifiedBySource.get(entry.source) ??
        simplifySource(
          mapshaper,
          entry.source,
          sources.get(entry.source),
          percentFor(entry.layer),
          precisionFor(entry.layer),
          workDir,
          entry.layer === "world",
        );
      simplifiedBySource.set(entry.source, simplified);

      const prefix =
        entry.layer === "world" ? "ne50m" : entry.layer === "geo:cn" ? "cnprov" : "datav";
      const rawIdOf = (feature) =>
        entry.layer === "world" ? feature.properties?.GU_A3 : feature.properties?.adcode;
      const expected = assignment.get(entry.layer);
      const features = [];
      const seen = new Set();
      simplified.features.forEach((feature, index) => {
        const raw = rawIdOf(feature);
        if (!raw) throw new Error(`${entry.layer}: source feature ${index} has no boundary id.`);
        const boundaryId = `${prefix}:${raw}`;
        if (seen.has(boundaryId)) throw new Error(`${entry.layer}: duplicate ${boundaryId}.`);
        seen.add(boundaryId);
        const assigned = expected.get(boundaryId);
        if (!assigned) {
          throw new Error(
            `${entry.layer}: source shape ${boundaryId} has no reviewed assignment in ${production.layers[entry.layer].url}.`,
          );
        }
        const oriented = orientRings(feature.geometry);
        evidence.ringFixes += oriented.fixed;
        const bounds = geometryBounds(oriented.geometry);
        if (bounds[0] > bounds[2]) evidence.seamCrossing.push(`${entry.layer}/${boundaryId}`);
        const parentSource = assigned.nodeId ?? assigned.navigationNodeId;
        const parentNodeId = parentSource
          ? (contract.nodeById(parentSource)?.parentNodeId ?? null)
          : null;
        features.push({
          type: "Feature",
          id: boundaryId,
          properties: {
            boundaryId,
            nodeId: assigned.nodeId,
            ...(assigned.navigationNodeId ? { navigationNodeId: assigned.navigationNodeId } : {}),
            ...(parentNodeId ? { parentNodeId } : {}),
            bounds,
          },
          geometry: oriented.geometry,
        });
      });
      const unused = [...expected.keys()].filter(
        (boundaryId) => !seen.has(boundaryId) && !supplemental.has(boundaryId),
      );
      if (unused.length) {
        throw new Error(
          `${entry.layer}: ${production.layers[entry.layer].url} publishes shapes with no source geometry: ${unused.join(", ")}.`,
        );
      }
      features.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      layers.set(entry.layer, features);
    }

    // Add the two borrowed South China Sea shapes, keeping the reviewed id and
    // interaction alias, then restore the layer's deterministic ordering.
    const worldLayer = layers.get("world");
    const worldAssignment = assignment.get("world");
    for (const supplement of WORLD_SUPPLEMENTS) {
      const borrowed = layers
        .get(supplement.from)
        .find((feature) => feature.id === supplement.boundaryId);
      if (!borrowed) {
        throw new Error(
          `World supplement ${supplement.boundaryId} is missing from ${supplement.from}.`,
        );
      }
      if (borrowed.properties.nodeId !== null) {
        throw new Error(
          `World supplement ${supplement.boundaryId} resolved to ${borrowed.properties.nodeId}; the borrow assumes the current dictionary has no matching code.`,
        );
      }
      const assigned = worldAssignment.get(supplement.boundaryId);
      if (!assigned?.navigationNodeId) {
        throw new Error(
          `World supplement ${supplement.boundaryId} has no reviewed interaction alias.`,
        );
      }
      const parentNodeId = contract.nodeById(assigned.navigationNodeId)?.parentNodeId ?? null;
      worldLayer.push({
        type: "Feature",
        id: supplement.boundaryId,
        properties: {
          boundaryId: supplement.boundaryId,
          nodeId: null,
          navigationNodeId: assigned.navigationNodeId,
          ...(parentNodeId ? { parentNodeId } : {}),
          bounds: geometryBounds(borrowed.geometry),
        },
        geometry: borrowed.geometry,
      });
    }
    worldLayer.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    // Emit geometry, then describe it. The URL carries the content hash, so a
    // stale file on disk can never be mistaken for the current one.
    const assets = new Map();
    for (const [layerKey, features] of layers) {
      const bytes = Buffer.from(JSON.stringify({ type: "FeatureCollection", features }), "utf8");
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const gzipBytes = gzipSync(bytes, { level: 9 }).byteLength;
      if (gzipBytes > LAYER_GZIP_BUDGET_BYTES) {
        throw new Error(
          `${layerKey}: ${gzipBytes} gzip bytes exceeds the ${LAYER_GZIP_BUDGET_BYTES} byte layer budget.`,
        );
      }
      evidence.gzip.push({ layer: layerKey, gzipBytes });
      assets.set(layerKey, {
        bytes,
        // Standard JSON MIME enables EdgeOne gzip; the content remains GeoJSON.
        fileName: `${layerKey.replace(/:/gu, "-")}.${sha256.slice(0, 16)}.json`,
        sha256,
      });
    }

    const worker = await bundleWorker(ROOT);
    const workerBytes = Buffer.from(worker.code, "utf8");
    const workerSha256 = createHash("sha256").update(workerBytes).digest("hex");
    const noticeBytes = readFileSync(join(ROOT, NOTICE_SOURCE));
    const noticeSha256 = createHash("sha256").update(noticeBytes).digest("hex");

    const manifest = {
      schemaVersion: SCHEMA_VERSION,
      generator: {
        script: "scripts/maps/build-maplibre-maps.mjs",
        mapshaper: MAPSHAPER_VERSION,
        bundler: `vite@${worker.viteVersion}`,
        boundaryAssignment: "public/maps/*.json (the emitted SVG layers)",
        simplificationPercent: SIMPLIFY_PERCENT,
        planarLayers: ["world"],
        outputPrecisionOption: PRECISION,
        coordinateReferenceSystem: "EPSG:4326",
        note: "Production EPSG:4326 boundary layers and the bundled MapLibre worker. Built offline from the vendored region-map sources and the reviewed emitted node assignment. gzip length is validation output only and is deliberately not stored: it varies between Node/zlib builds, while raw bytes and hashes are canonical.",
      },
      renderer: {
        name: RENDERER.name,
        version: RENDERER.version,
        worker: {
          // EdgeOne infers MIME from the extension; .mjs is served as octet-stream.
          url: `${ASSET_URL_PREFIX}/${WORKER_FILE_STEM}.${workerSha256.slice(0, 16)}.js`,
          sha256: workerSha256,
          bytes: workerBytes.byteLength,
        },
        notice: {
          url: `${ASSET_URL_PREFIX}/maplibre-NOTICE.${noticeSha256.slice(0, 16)}.txt`,
          sha256: noticeSha256,
          bytes: noticeBytes.byteLength,
        },
      },
      boundsConvention:
        "[west, south, east, north] in EPSG:4326. A feature box with west > east crosses the antimeridian; a layer box never does. `center` is the box centre with a seam-crossing box unwrapped.",
      contract: {
        sourceRepository: contract.receipt.sourceRepository,
        sourceCommit: contract.receipt.sourceCommit,
        vocabularySha256: contract.receipt.vocabulary.sha256,
      },
      sources: [...new Set(layerEntries.map((entry) => entry.source))]
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        .map((id) => ({ id, sha256: sourceSha.get(id) })),
      layers: {},
    };
    const emitted = new Map();

    for (const entry of layerEntries) {
      const features = layers.get(entry.layer);
      const asset = assets.get(entry.layer);
      const isWorld = entry.layer === "world";
      const node = isWorld ? null : contract.nodeById(entry.layer);
      if (!isWorld && !node) {
        throw new Error(`The navigation vocabulary has no node ${entry.layer}.`);
      }
      const bounds = collectionBounds(features.map((feature) => feature.geometry));
      manifest.layers[entry.layer] = {
        url: `${ASSET_URL_PREFIX}/${asset.fileName}`,
        sourceId: entry.source,
        nodeId: isWorld ? null : entry.layer,
        code: node?.code ?? null,
        parentNodeId: node?.parentNodeId ?? null,
        sha256: asset.sha256,
        bytes: asset.bytes.byteLength,
        features: features.length,
        bounds,
        center: boundsCenter(bounds),
        ...(isWorld
          ? {
              focus: {
                // Focusing the world layer on China frames the reviewed Chinese
                // administrative layer rather than the Natural Earth China map
                // unit, whose extent mixes in unrelated offshore geometries.
                layer: "geo:cn",
                nodeId: "geo:cn",
                bounds: collectionBounds(layers.get("geo:cn").map((feature) => feature.geometry)),
                note: "Use these bounds when the user opens the China entry on the world layer.",
              },
            }
          : {}),
      };
      emitted.set(`${ASSET_DIR}/${asset.fileName}`, asset.bytes);
    }
    emitted.set(`${ASSET_DIR}/${manifest.renderer.worker.url.split("/").pop()}`, workerBytes);
    emitted.set(`${ASSET_DIR}/${manifest.renderer.notice.url.split("/").pop()}`, noticeBytes);

    return { manifest, emitted, evidence, sourceCount: sourceManifest.sources.length };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

/* ----------------------------------------------------------------- main --- */

async function main() {
  const check = process.argv.includes("--check");
  const { manifest, emitted, evidence, sourceCount } = await build();
  const manifestBytes = Buffer.from(stableJson(manifest), "utf8");
  const layerKeys = Object.keys(manifest.layers);
  const totalGzip = evidence.gzip.reduce((sum, entry) => sum + entry.gzipBytes, 0);
  const totalBytes = layerKeys.reduce((sum, key) => sum + manifest.layers[key].bytes, 0);
  const totalFeatures = layerKeys.reduce((sum, key) => sum + manifest.layers[key].features, 0);
  const largest = evidence.gzip.reduce((worst, entry) =>
    entry.gzipBytes > worst.gzipBytes ? entry : worst,
  );

  if (check) {
    // `loadSources` and the boundaryId join have already re-verified every
    // vendored source and every mapping, so drift surfaces here even when no
    // asset is present on disk.
    const problems = [];
    for (const [path, bytes] of emitted) {
      const absolute = join(ROOT, path);
      if (!existsSync(absolute)) {
        problems.push(`${path}: not generated`);
        continue;
      }
      if (sha256Hex(readFileSync(absolute)) !== sha256Hex(bytes)) {
        problems.push(`${path}: bytes differ from a rebuild`);
      }
    }
    const manifestPath = join(ROOT, MANIFEST_PATH);
    if (!existsSync(manifestPath)) problems.push(`${MANIFEST_PATH}: missing`);
    else if (!readFileSync(manifestPath).equals(manifestBytes)) {
      problems.push(`${MANIFEST_PATH}: bytes differ from a rebuild`);
    }
    // The served directory must contain exactly this build. An extra file is a
    // published asset the manifest does not describe, and hashing alone would
    // never notice it.
    const expectedFiles = new Set([...emitted.keys()].map((path) => path.split("/").pop()));
    for (const name of readdirSync(join(ROOT, ASSET_DIR))) {
      if (!expectedFiles.has(name)) problems.push(`${ASSET_DIR}/${name}: unexpected file`);
    }
    if (problems.length) {
      process.stderr.write(`MapLibre map assets are not current:\n${problems.join("\n")}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      [
        `MapLibre map assets OK: ${layerKeys.length} layers, ${sourceCount} sources, worker and notice verified.`,
        `Canonical bytes: geometry ${totalBytes}, worker ${manifest.renderer.worker.bytes}, notice ${manifest.renderer.notice.bytes}.`,
        `Reported gzip (not canonical): total ${totalGzip}, largest ${largest.layer} ${largest.gzipBytes} of a ${LAYER_GZIP_BUDGET_BYTES} byte budget.`,
        `Features: ${totalFeatures}; ring windings rewritten ${evidence.ringFixes}; seam-crossing feature boxes ${evidence.seamCrossing.length}.`,
      ].join("\n") + "\n",
    );
    return;
  }

  for (const [path, bytes] of emitted) write(path, bytes);
  write(MANIFEST_PATH, manifestBytes);

  process.stdout.write(
    [
      `MapLibre map assets written: ${layerKeys.length} layers, ${emitted.size} files.`,
      `Geometry: ${ASSET_DIR} (generated). Manifest: ${MANIFEST_PATH}.`,
      `Canonical bytes: geometry ${layerKeys.reduce((sum, key) => sum + manifest.layers[key].bytes, 0)}, worker ${manifest.renderer.worker.bytes}, notice ${manifest.renderer.notice.bytes}.`,
      `Reported gzip (not canonical): total ${totalGzip}, largest ${largest.layer} ${largest.gzipBytes} of a ${LAYER_GZIP_BUDGET_BYTES} byte budget.`,
      `World layer: ${manifest.layers.world.features} features, ${manifest.layers.world.bounds.join(",")} bounds.`,
      `Ring windings rewritten: ${evidence.ringFixes}. Seam-crossing feature boxes: ${evidence.seamCrossing.length} (${evidence.seamCrossing.join(", ")}).`,
    ].join("\n") + "\n",
  );
}

await main();
