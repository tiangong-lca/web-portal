#!/usr/bin/env node
/**
 * MapLibre reference prototype: offline longitude/latitude boundary assets.
 *
 * Modes:
 *   node .storybook/maplibre-reference/build-assets.mjs          build assets
 *   node .storybook/maplibre-reference/build-assets.mjs --check  verify, write nothing
 *
 * This is a visual prototype input set, not production map output. It shares the
 * reviewed boundary sources and the reviewed node assignment with the production
 * region map, but the two pipelines emit different things on purpose:
 *
 *   production (`scripts/maps/build-region-maps.mjs`)
 *     Robinson-projected integer SVG paths, one window per layer, plus a
 *     basemap/graticule context, sized for the Portal's own renderer.
 *   this prototype
 *     EPSG:4326 GeoJSON for MapLibre, which projects at render time. Source
 *     geometry is therefore simplified in longitude/latitude space and never
 *     reprojected, and every feature carries its own bounds so the map can fit
 *     one region without a layer-wide window.
 *
 * Nothing here matches names afresh. `nodeId` and `navigationNodeId` are read
 * from the emitted production layers in `public/maps/**`, which are the reviewed
 * result; geometry comes from the vendored sources. The two are joined on
 * `boundaryId`, and a one-sided match in either direction fails the build rather
 * than shipping a shape with no entry or an entry with no shape.
 *
 * Emitted (geometry is a generated Storybook asset, the manifest is committed):
 *   .storybook/public/maplibre-reference/geometry/<layer>.<sha16>.geojson
 *   .storybook/maplibre-reference/boundaries.generated.json
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { MAPSHAPER_VERSION, SIMPLIFY } from "../../scripts/maps/lib/config.mjs";
import { loadNavigationContract } from "../../scripts/maps/lib/contract.mjs";
import { resolveMapshaper } from "../../scripts/maps/lib/mapshaper.mjs";
import {
  BASE_SOURCES,
  datavSource,
  loadSources,
  sha256Hex,
  stableJson,
} from "../../scripts/maps/lib/sources.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const MANIFEST_PATH = ".storybook/maplibre-reference/boundaries.generated.json";
const ASSET_DIR = ".storybook/public/maplibre-reference/geometry";
/** Storybook serves `.storybook/public`, so this prefix is not the `/maps` one. */
const ASSET_URL_PREFIX = "/maplibre-reference/geometry";
const PRODUCTION_MANIFEST = "src/features/catalog/region-map-manifest.generated.json";
const PRODUCTION_LAYER_DIR = "public/maps";
const SCHEMA_VERSION = "portal.maplibre-reference-manifest.v1";

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
 * that already carry them, exactly as the production world layer borrows their
 * emitted paths. Copying the emitted ring coordinates keeps both pipelines
 * adding the same two shapes from the same source rows instead of redrawing
 * them. `boundaryId` and the interaction alias are the ones the production world
 * layer already publishes for these two shapes.
 */
const WORLD_SUPPLEMENTS = [
  { boundaryId: "cnprov:100000_JD", from: "geo:cn" },
  { boundaryId: "datav:460300", from: "geo:cn-hi" },
];

function readJson(path) {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8"));
}

function write(path, text) {
  const target = join(ROOT, path);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, text);
}

/**
 * Resolve one production layer's source id back to its definition, so
 * `loadSources` can verify every vendored byte and reject a source set that no
 * longer matches the layers it feeds.
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
function simplifySource(mapshaper, sourceId, geojson, percent, precision, workDir) {
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

/** Last comma-separated segment of a localized name. */
function lastSegment(name) {
  const parts = String(name ?? "").split(",");
  return parts[parts.length - 1].trim();
}

/* ---------------------------------------------------------------- build --- */

function build() {
  const production = readJson(PRODUCTION_MANIFEST);
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

  // The reviewed assignment: what each emitted production shape answers to.
  const assignment = new Map();
  for (const entry of layerEntries) {
    const layer = readJson(
      join(PRODUCTION_LAYER_DIR, production.layers[entry.layer].url.replace(/^\/maps\//u, "")),
    );
    const byBoundaryId = new Map();
    for (const feature of layer.features) {
      if (byBoundaryId.has(feature.boundaryId)) {
        throw new Error(`${entry.layer}: duplicate production boundaryId ${feature.boundaryId}.`);
      }
      byBoundaryId.set(feature.boundaryId, {
        nodeId: feature.nodeId ?? null,
        navigationNodeId: feature.navigationNodeId ?? null,
      });
    }
    assignment.set(entry.layer, byBoundaryId);
  }

  const supplemental = new Set(WORLD_SUPPLEMENTS.map((supplement) => supplement.boundaryId));
  const workDir = mkdtempSync(join(tmpdir(), "portal-maplibre-reference-"));
  const evidence = { ringFixes: 0, seamCrossing: [] };
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
      const text = JSON.stringify({ type: "FeatureCollection", features });
      const buffer = Buffer.from(text, "utf8");
      const sha256 = createHash("sha256").update(buffer).digest("hex");
      assets.set(layerKey, {
        fileName: `${layerKey.replace(/:/gu, "-")}.${sha256.slice(0, 16)}.geojson`,
        text,
        sha256,
        bytes: buffer.byteLength,
      });
    }

    const manifest = {
      schemaVersion: SCHEMA_VERSION,
      generator: {
        script: ".storybook/maplibre-reference/build-assets.mjs",
        mapshaper: MAPSHAPER_VERSION,
        note: "Offline longitude/latitude prototype geometry for MapLibre. Built from the vendored region-map sources and the reviewed production node assignment; not production map output and not a production map source.",
      },
      boundsConvention:
        "[west, south, east, north] in EPSG:4326. A feature box with west > east crosses the antimeridian; a layer box never does. `center` is the box centre with a seam-crossing box unwrapped.",
      contract: {
        sourceRepository: contract.receipt.sourceRepository,
        sourceCommit: contract.receipt.sourceCommit,
        vocabularySha256: contract.receipt.vocabulary.sha256,
      },
      sources: [...new Set(layerEntries.map((entry) => entry.source))]
        .sort((a, b) => a.localeCompare(b))
        .map((id) => ({ id, sha256: sourceSha.get(id) })),
      layers: {},
    };

    for (const entry of layerEntries) {
      const features = layers.get(entry.layer);
      const asset = assets.get(entry.layer);
      const isWorld = entry.layer === "world";
      const node = isWorld ? null : contract.nodeById(entry.layer);
      if (!isWorld && !node)
        throw new Error(`The navigation vocabulary has no node ${entry.layer}.`);
      const bounds = collectionBounds(features.map((feature) => feature.geometry));
      manifest.layers[entry.layer] = {
        url: `${ASSET_URL_PREFIX}/${asset.fileName}`,
        sourceId: entry.source,
        nodeId: isWorld ? null : entry.layer,
        code: node?.code ?? null,
        label: node ? lastSegment(node.labels["zh-CN"]) : null,
        parentNodeId: node?.parentNodeId ?? null,
        sha256: asset.sha256,
        bytes: asset.bytes,
        gzipBytes: gzipSync(Buffer.from(asset.text), { level: 9 }).byteLength,
        features: features.length,
        bounds,
        center: boundsCenter(bounds),
        ...(isWorld
          ? {
              focus: {
                // Focusing the world layer on China frames the reviewed Chinese
                // administrative layer rather than the Natural Earth China map
                // unit, whose extent mixes in unrelated offshore geometries.
                // The box is inlined so the consumer needs no layer lookup.
                layer: "geo:cn",
                nodeId: "geo:cn",
                bounds: collectionBounds(layers.get("geo:cn").map((feature) => feature.geometry)),
                note: "Use these bounds when the user opens the China entry on the world layer.",
              },
            }
          : {}),
      };
    }

    return { manifest, assets, layers, evidence, sourceCount: sourceManifest.sources.length };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

/* ----------------------------------------------------------------- main --- */

function main() {
  const check = process.argv.includes("--check");
  const { manifest, assets, layers, evidence, sourceCount } = build();
  const manifestText = stableJson(manifest);
  const layerKeys = Object.keys(manifest.layers);

  if (check) {
    // `loadSources` has already re-verified every vendored source against its
    // receipt, so a source change surfaces here even when no asset is present.
    const problems = [];
    for (const [layerKey, asset] of assets) {
      const path = join(ROOT, ASSET_DIR, asset.fileName);
      if (!existsSync(path)) {
        problems.push(`${layerKey}: geometry has not been generated yet`);
        continue;
      }
      if (sha256Hex(readFileSync(path)) !== asset.sha256) {
        problems.push(`${layerKey}: geometry bytes differ from a rebuild`);
      }
    }
    const manifestPath = join(ROOT, MANIFEST_PATH);
    if (!existsSync(manifestPath)) problems.push("manifest is missing");
    else if (readFileSync(manifestPath, "utf8") !== manifestText) {
      problems.push("manifest bytes differ from a rebuild");
    }
    if (problems.length) {
      process.stderr.write(`MapLibre reference assets are not current:\n${problems.join("\n")}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      `MapLibre reference assets OK: ${layerKeys.length} layers, ${sourceCount} sources verified.\n`,
    );
    return;
  }

  for (const asset of assets.values()) write(join(ASSET_DIR, asset.fileName), asset.text);
  write(MANIFEST_PATH, manifestText);
  write(
    ".storybook/public/maplibre-reference/NOTICE.txt",
    readFileSync(join(ROOT, ".storybook/maplibre-reference/NOTICE.txt"), "utf8"),
  );

  const totalGzip = layerKeys.reduce((sum, key) => sum + manifest.layers[key].gzipBytes, 0);
  const totalFeatures = layerKeys.reduce((sum, key) => sum + manifest.layers[key].features, 0);
  const aliasTargets = new Set(
    layers
      .get("world")
      .map((feature) => feature.properties.navigationNodeId)
      .filter(Boolean),
  );
  const unresolvedWorldShapes = layers
    .get("world")
    .filter((feature) => !feature.properties.nodeId && !feature.properties.navigationNodeId).length;
  process.stdout.write(
    [
      `MapLibre reference assets written: ${layerKeys.length} layers, ${totalFeatures} features, ${totalGzip} gzip bytes total.`,
      `Geometry: ${ASSET_DIR} (generated, not committed). Manifest: ${MANIFEST_PATH}.`,
      `World layer: ${manifest.layers.world.features} features, ${unresolvedWorldShapes} with no dictionary code, interaction aliases to ${[...aliasTargets].sort((a, b) => a.localeCompare(b)).join(", ")}.`,
      `Ring winding fixed: ${evidence.ringFixes}. Seam-crossing feature boxes: ${evidence.seamCrossing.length}${evidence.seamCrossing.length ? ` (${evidence.seamCrossing.join(", ")})` : ""}.`,
    ].join("\n") + "\n",
  );
}

main();
