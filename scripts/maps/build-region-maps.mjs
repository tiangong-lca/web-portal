#!/usr/bin/env node
/**
 * Portal region-map asset pipeline.
 *
 * Modes:
 *   node scripts/maps/build-region-maps.mjs            build assets (default)
 *   node scripts/maps/build-region-maps.mjs --check    verify assets, write nothing
 *   node scripts/maps/build-region-maps.mjs --fetch    refresh vendored sources
 *
 * The build is offline and reproducible: every input is a vendored, hashed
 * source under `scripts/maps/sources/`, and every output byte is a pure
 * function of those sources, `lib/config.mjs` and the Portal location
 * dictionary. No emitted asset contains a timestamp, so rebuilding unchanged
 * inputs produces identical bytes and identical filenames.
 *
 * Emitted:
 *   public/maps/<layer>.<sha16>.json                        preprojected SVG paths
 *   src/features/catalog/region-map-manifest.generated.json browser manifest
 *   scripts/maps/coverage-report.json                       audit trail
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import {
  COORDINATE_UNITS,
  LAYER_GZIP_BUDGET_BYTES,
  LAYER_URL_PREFIX,
  MAPSHAPER_VERSION,
  OUTPUT,
  PROJECTIONS,
  SCHEMA_VERSION,
  SIMPLIFY,
} from "./lib/config.mjs";
import {
  createWorkDir,
  projectAndSimplify,
  removeWorkDir,
  resolveMapshaper,
} from "./lib/mapshaper.mjs";
import { boundaryIds, nodeIdFor, resolveByName, worldCode } from "./lib/mapping.mjs";
import {
  BASE_SOURCES,
  LICENSES,
  PLATFORM_REPOSITORY,
  datavSource,
  datavSourceId,
  fetchSource,
  loadSources,
  readVendored,
  sha256Hex,
  stableJson,
  writeSourceManifest,
} from "./lib/sources.mjs";
import {
  boundingBox,
  featureToPath,
  fitTransform,
  projectedBounds,
  viewBoxOf,
  viewBoxSize,
  windowViewBox,
} from "./lib/svg-path.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const CITY_VIEWBOX_PADDING_RATIO = 0.02;
const CITY_VIEWBOX_PADDING_MIN = 20;
const PROVINCE_CODE = /^CN-[A-Z]{2}$/;
const CITY_CODE = /^CN-[A-Z]{2}-[A-Z0-9]+$/;
const WORLD_CODE = /^[A-Z]{2}$/;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sorted(values) {
  return [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/* ------------------------------------------------------------ vocabulary --- */

function vocabulary(root) {
  const names = readJson(join(root, OUTPUT.locationDictionary));
  const codes = Object.keys(names);
  return {
    names,
    hasCode: (code) => Object.hasOwn(names, code),
    world: sorted(codes.filter((code) => WORLD_CODE.test(code))),
    provinces: sorted(codes.filter((code) => PROVINCE_CODE.test(code))),
    cities: sorted(codes.filter((code) => CITY_CODE.test(code))),
  };
}

function citiesOf(vocabularyIndex, provinceCode) {
  return vocabularyIndex.cities.filter((code) => code.startsWith(`${provinceCode}-`));
}

/**
 * Resolve dictionary provinces onto province-layer shapes. The rule reads only
 * feature attributes, so the pre-projection and post-projection calls in
 * `currentPlan` and `buildChinaLayer` cannot disagree on the answer.
 */
function provinceResolution(features, vocabularyIndex) {
  const { byCode, unresolved } = resolveByName(
    vocabularyIndex.provinces,
    features,
    vocabularyIndex.names,
    "CN",
  );
  const adcodeOf = new Map();
  for (const [code, feature] of byCode) adcodeOf.set(code, String(feature.properties.adcode));
  return { byCode, unresolved, adcodeOf };
}

/**
 * Which DataV files the current dictionary implies. Only a province that
 * resolves to a province boundary and owns at least one child code can host a
 * city sublayer, so only those files are required.
 */
function datavAdcodes(resolution, vocabularyIndex) {
  const adcodes = [];
  for (const code of resolution.byCode.keys()) {
    if (citiesOf(vocabularyIndex, code).length === 0) continue;
    const adcode = resolution.adcodeOf.get(code);
    if (!adcode || adcode.includes("_")) continue;
    adcodes.push(adcode);
  }
  return sorted(adcodes);
}

function requiredSources(adcodes) {
  return [...BASE_SOURCES, ...adcodes.map((adcode) => datavSource(adcode))];
}

/* --------------------------------------------------- projection helpers --- */

function project(root, source, projection, simplify, workDir) {
  const projected = projectAndSimplify(root, source, { projection, simplify, workDir });
  if (projected.features.length !== source.features.length) {
    throw new Error(
      `mapshaper changed the feature count for a source (${source.features.length} -> ${projected.features.length}); the receipt would no longer describe the source.`,
    );
  }
  return projected;
}

function assertPreservedFeatures(label, before, after) {
  if (before !== after) {
    throw new Error(
      `${label}: mapshaper returned ${after} features for ${before} source features.`,
    );
  }
}

/* ---------------------------------------------------------------- world --- */

function buildWorld(source, vocabularyIndex, workDir, report) {
  const projected = project(ROOT, source, PROJECTIONS.world, SIMPLIFY.world, workDir);
  const box = boundingBox(projected.features.map((feature) => feature.geometry));
  const transform = fitTransform(box, COORDINATE_UNITS);
  const ids = boundaryIds(projected.features, (feature) => feature.properties?.GU_A3, "ne50m");

  const features = [];
  const unresolvedShapes = [];
  projected.features.forEach((feature, index) => {
    const resolved = worldCode(feature.properties, vocabularyIndex.hasCode);
    const { path, rings, dropped } = featureToPath(feature.geometry, transform);
    if (dropped) {
      report.droppedRings.push({ layer: "world", boundaryId: ids[index], rings: dropped });
    }
    if (!rings) return;
    if (!resolved) {
      unresolvedShapes.push({
        boundaryId: ids[index],
        name: feature.properties?.NAME_EN ?? null,
        reason: "no source-asserted ISO alpha-2 code present in the location dictionary",
      });
    }
    features.push({
      boundaryId: ids[index],
      nodeId: resolved ? nodeIdFor(resolved.code) : null,
      path,
    });
  });

  const mappedNodes = new Set(features.map((feature) => feature.nodeId).filter(Boolean));
  const unshapedCodes = vocabularyIndex.world
    .map(nodeIdFor)
    .filter((nodeId) => !mappedNodes.has(nodeId))
    .map((nodeId) => ({
      nodeId,
      reason: "no shape in the world source asserts this code, so it has no boundary to draw",
    }));

  features.sort((a, b) => (a.boundaryId < b.boundaryId ? -1 : a.boundaryId > b.boundaryId ? 1 : 0));
  return {
    layer: { viewBox: viewBoxOf(box, transform), features },
    transform,
    unresolvedShapes,
    unshapedCodes,
  };
}

/* ---------------------------------------------------------------- china --- */

function buildChinaLayer(provinceGeo, vocabularyIndex, workDir, report) {
  const projected = project(ROOT, provinceGeo, PROJECTIONS.china, SIMPLIFY.chinaProvince, workDir);
  const box = boundingBox(projected.features.map((feature) => feature.geometry));
  const transform = fitTransform(box, COORDINATE_UNITS);
  const ids = boundaryIds(projected.features, (feature) => feature.properties?.adcode, "cnprov");
  const resolution = provinceResolution(projected.features, vocabularyIndex);
  const nodeIdByFeature = new Map();
  for (const [code, feature] of resolution.byCode) nodeIdByFeature.set(feature, nodeIdFor(code));

  const features = [];
  const unresolvedShapes = [];
  projected.features.forEach((feature, index) => {
    const nodeId = nodeIdByFeature.get(feature) ?? null;
    const { path, rings, dropped } = featureToPath(feature.geometry, transform);
    if (dropped) {
      report.droppedRings.push({ layer: "geo:cn", boundaryId: ids[index], rings: dropped });
    }
    if (!rings) return;
    if (!nodeId) {
      const name = feature.properties?.name ?? "";
      unresolvedShapes.push({
        boundaryId: ids[index],
        name: feature.properties?.name ?? null,
        adchar: feature.properties?.adchar ?? null,
        reason:
          feature.properties?.adchar === "JD"
            ? "nine-dash line inset: not an administrative region, kept as decoration with nodeId null"
            : `no CN-* dictionary province code carries the exact name "${name}"`,
      });
    }
    features.push({ boundaryId: ids[index], nodeId, path });
  });

  features.sort((a, b) => (a.boundaryId < b.boundaryId ? -1 : a.boundaryId > b.boundaryId ? 1 : 0));
  return {
    layer: { viewBox: viewBoxOf(box, transform), features },
    transform,
    unresolvedShapes,
  };
}

function buildCityLayer(source, provinceCode, vocabularyIndex, transform, space, workDir, report) {
  const projected = project(ROOT, source, PROJECTIONS.china, SIMPLIFY.chinaCity, workDir);
  assertPreservedFeatures(provinceCode, source.features.length, projected.features.length);
  const codes = citiesOf(vocabularyIndex, provinceCode);
  const { byCode, unresolved } = resolveByName(
    codes,
    projected.features,
    vocabularyIndex.names,
    provinceCode,
  );
  const nodeIdByFeature = new Map();
  for (const [code, feature] of byCode) nodeIdByFeature.set(feature, nodeIdFor(code));

  const layerKey = `geo:${provinceCode.toLowerCase()}`;
  const ids = boundaryIds(projected.features, (feature) => feature.properties?.adcode, "datav");
  const features = [];
  const unresolvedShapes = [];
  projected.features.forEach((feature, index) => {
    const nodeId = nodeIdByFeature.get(feature) ?? null;
    const { path, rings, dropped } = featureToPath(feature.geometry, transform);
    if (dropped) {
      report.droppedRings.push({ layer: layerKey, boundaryId: ids[index], rings: dropped });
    }
    if (!rings) return;
    if (!nodeId) {
      unresolvedShapes.push({
        boundaryId: ids[index],
        name: feature.properties?.name ?? null,
        reason: `no ${provinceCode}-* dictionary code carries the exact name "${feature.properties?.name ?? ""}"`,
      });
    }
    features.push({ boundaryId: ids[index], nodeId, path });
  });
  features.sort((a, b) => (a.boundaryId < b.boundaryId ? -1 : a.boundaryId > b.boundaryId ? 1 : 0));

  const bounds = projectedBounds(
    projected.features.map((feature) => feature.geometry),
    transform,
  );
  const padding = Math.max(
    CITY_VIEWBOX_PADDING_MIN,
    Math.round(Math.max(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0) * CITY_VIEWBOX_PADDING_RATIO),
  );
  return {
    layerKey,
    layer: { viewBox: windowViewBox(bounds, padding, space), features },
    unresolved,
    unresolvedShapes,
  };
}

/* ------------------------------------------------------------- assembly --- */

function buildAssets(sources, plan, vocabularyIndex, workDir) {
  const report = { droppedRings: [], layers: [] };
  const layers = {};
  const stats = (entry) => ({
    shapes: entry.layer.features.length,
    mapped: entry.layer.features.filter((feature) => feature.nodeId).length,
  });

  const world = buildWorld(sources.get("world-map-units-50m"), vocabularyIndex, workDir, report);
  layers.world = world.layer;
  report.layers.push({
    layer: "world",
    source: "world-map-units-50m",
    ...stats(world),
    projection: PROJECTIONS.world,
    simplify: SIMPLIFY.world,
    sharesChinaSpace: false,
    unresolvedCodes: [],
    unresolvedShapes: world.unresolvedShapes,
    unshapedCodes: world.unshapedCodes,
  });

  const china = buildChinaLayer(
    sources.get("china-province-100000-full"),
    vocabularyIndex,
    workDir,
    report,
  );
  layers["geo:cn"] = china.layer;
  report.layers.push({
    layer: "geo:cn",
    source: "china-province-100000-full",
    ...stats(china),
    projection: PROJECTIONS.china,
    simplify: SIMPLIFY.chinaProvince,
    sharesChinaSpace: false,
    unresolvedCodes: plan.provinceResolution.unresolved,
    unresolvedShapes: china.unresolvedShapes,
    unshapedCodes: [],
  });

  const provinceCodeByAdcode = new Map();
  for (const [code, adcode] of plan.provinceResolution.adcodeOf) {
    provinceCodeByAdcode.set(adcode, code);
  }

  const chinaSpace = viewBoxSize(china.layer.viewBox);
  for (const adcode of plan.adcodes) {
    const provinceCode = provinceCodeByAdcode.get(adcode);
    const built = buildCityLayer(
      sources.get(datavSourceId(adcode)),
      provinceCode,
      vocabularyIndex,
      china.transform,
      chinaSpace,
      workDir,
      report,
    );
    layers[built.layerKey] = built.layer;
    report.layers.push({
      layer: built.layerKey,
      source: datavSourceId(adcode),
      ...stats(built),
      projection: PROJECTIONS.china,
      simplify: SIMPLIFY.chinaCity,
      sharesChinaSpace: true,
      unresolvedCodes: built.unresolved,
      unresolvedShapes: built.unresolvedShapes,
      unshapedCodes: [],
    });
  }

  return { layers, report };
}

function layerSlug(layerKey) {
  return layerKey.replace(/:/g, "-");
}

function emitLayers(layers) {
  const emitted = {};
  for (const [layerKey, layer] of Object.entries(layers)) {
    const body = stableJson(layer);
    const bytes = Buffer.from(body, "utf8");
    const sha256 = sha256Hex(bytes);
    const gzipBytes = gzipSync(bytes, { level: 9 }).byteLength;
    if (gzipBytes > LAYER_GZIP_BUDGET_BYTES) {
      throw new Error(
        `Layer ${layerKey} is ${gzipBytes} gzip bytes, over the ${LAYER_GZIP_BUDGET_BYTES} byte budget. Lower the SIMPLIFY value for it in scripts/maps/lib/config.mjs.`,
      );
    }
    emitted[layerKey] = {
      file: `${layerSlug(layerKey)}.${sha256.slice(0, 16)}.json`,
      body,
      sha256,
      gzipBytes,
    };
  }
  return emitted;
}

function buildManifest(vendoredManifest, emitted, report, vocabularyIndex) {
  const layers = {};
  for (const [layerKey, layer] of Object.entries(emitted)) {
    layers[layerKey] = {
      url: `${LAYER_URL_PREFIX}/${layer.file}`,
      sha256: layer.sha256,
      gzipBytes: layer.gzipBytes,
    };
  }

  const unmapped = report.layers
    .flatMap((entry) =>
      [...entry.unresolvedCodes, ...entry.unshapedCodes].map((item) => ({
        layer: entry.layer,
        ...item,
      })),
    )
    .sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));

  const sources = vendoredManifest.sources.map((source) => ({
    id: source.id,
    url: source.url,
    sourceCommit: source.sourceCommit,
    sourceCommitDate: source.sourceCommitDate,
    upstream: source.upstream,
    license: source.license,
    features: source.features,
    rawBytes: source.rawBytes,
    gzipBytes: source.gzipBytes,
    sha256: source.sha256,
  }));

  const licenses = {};
  for (const key of sorted(new Set(vendoredManifest.sources.map((source) => source.license)))) {
    licenses[key] = LICENSES[key];
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    generator: {
      script: "scripts/maps/build-region-maps.mjs",
      mapshaper: MAPSHAPER_VERSION,
      sourceRepository: PLATFORM_REPOSITORY,
      locationDictionary: OUTPUT.locationDictionary,
      coordinateUnits: COORDINATE_UNITS,
      nodeIdFormat: "geo:<lowercase location code>",
      layerResolution:
        "a node is drawn in exactly one layer: `world` for a two-letter code, `geo:cn` for `geo:cn-xx`, `geo:cn-xx` for `geo:cn-xx-yyy`. Codes listed in `unmapped` have no drawable shape; codes outside those three families (regions, economic groupings) are never mapped to a boundary.",
      boundaryIdFormat: {
        world: "ne50m:<Natural Earth GU_A3>",
        "geo:cn": "cnprov:<province layer adcode>",
        "geo:cn-*": "datav:<DataV prefecture adcode>",
      },
      note: "Generated by the offline region-map pipeline. Do not edit by hand; rebuild it instead.",
    },
    layers,
    projection: PROJECTIONS,
    simplify: SIMPLIFY,
    sources,
    licenses,
    coverage: {
      vocabulary: OUTPUT.locationDictionary,
      worldCodes: vocabularyIndex.world.length,
      provinceCodes: vocabularyIndex.provinces.length,
      cityCodes: vocabularyIndex.cities.length,
      layers: report.layers.map((entry) => ({
        layer: entry.layer,
        source: entry.source,
        shapes: entry.shapes,
        mapped: entry.mapped,
      })),
      droppedRings: report.droppedRings.reduce((sum, entry) => sum + entry.rings, 0),
      auditTrail: OUTPUT.coverage,
      sourceReceipts: OUTPUT.sourceManifest,
      note: "Counts only. Per-code reasons, shapes without a node and dropped rings live in the audit trail and the source receipts, not in the browser bundle.",
    },
    unmapped,
  };
}

/* ------------------------------------------------------------------ main --- */

function currentPlan(root) {
  const vocabularyIndex = vocabulary(root);
  const provinceGeo = readVendored(root, "china-province-100000-full");
  const resolution = provinceResolution(provinceGeo.features, vocabularyIndex);
  const adcodes = datavAdcodes(resolution, vocabularyIndex);
  return {
    vocabularyIndex,
    provinceResolution: resolution,
    adcodes,
    required: requiredSources(adcodes),
  };
}

async function fetchMode(root) {
  const vocabularyIndex = vocabulary(root);
  const entries = [];
  for (const source of BASE_SOURCES) entries.push(await fetchSource(root, source));
  const provinceGeo = readVendored(root, "china-province-100000-full");
  const resolution = provinceResolution(provinceGeo.features, vocabularyIndex);
  for (const adcode of datavAdcodes(resolution, vocabularyIndex)) {
    entries.push(await fetchSource(root, datavSource(adcode)));
  }
  const manifest = writeSourceManifest(root, entries);
  console.log(`Vendored ${manifest.sources.length} sources into scripts/maps/sources/.`);
}

function layerFilesOnDisk(root) {
  const dir = join(root, OUTPUT.layerDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith(".json"));
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const mode = args.has("--check") ? "check" : args.has("--fetch") ? "fetch" : "build";
  const root = ROOT;

  if (mode === "fetch") await fetchMode(root);

  const plan = currentPlan(root);
  const { manifest: vendoredManifest, sources } = loadSources(root, plan.required);

  const workDir = createWorkDir();
  let built;
  try {
    built = buildAssets(sources, plan, plan.vocabularyIndex, workDir);
  } finally {
    removeWorkDir(workDir);
  }

  const emitted = emitLayers(built.layers);
  const manifest = buildManifest(vendoredManifest, emitted, built.report, plan.vocabularyIndex);
  const manifestBody = stableJson(manifest);
  const coverageBody = stableJson({
    schemaVersion: "portal.region-map-coverage.v1",
    note: "Full audit trail for the region-map pipeline: every dictionary code inside a mapped container, every source shape that received no node, every dropped ring and every source receipt. The browser manifest carries only counts.",
    layers: built.report.layers,
    droppedRings: built.report.droppedRings,
    unmapped: manifest.unmapped,
    sources: vendoredManifest.sources,
    licenses: manifest.licenses,
  });

  if (mode === "check") {
    const drift = [];
    const expectedFiles = new Set(Object.values(emitted).map((layer) => layer.file));
    for (const [layerKey, layer] of Object.entries(emitted)) {
      const path = join(root, OUTPUT.layerDir, layer.file);
      if (!existsSync(path)) drift.push(`${layerKey}: missing public/maps/${layer.file}`);
      else if (readFileSync(path, "utf8") !== layer.body) {
        drift.push(`${layerKey}: public/maps/${layer.file} content differs from a fresh build`);
      }
    }
    for (const name of layerFilesOnDisk(root)) {
      if (!expectedFiles.has(name))
        drift.push(`public/maps/${name}: not referenced by the manifest`);
    }
    for (const [path, expected] of [
      [OUTPUT.manifest, manifestBody],
      [OUTPUT.coverage, coverageBody],
    ]) {
      if (!existsSync(join(root, path))) drift.push(`${path}: missing`);
      else if (readFileSync(join(root, path), "utf8") !== expected)
        drift.push(`${path}: content differs`);
    }
    if (drift.length) {
      console.error("Region-map assets are out of date:");
      for (const item of drift) console.error(`  - ${item}`);
      console.error("Run: node scripts/maps/build-region-maps.mjs");
      process.exitCode = 1;
      return;
    }
    const total = Object.values(emitted).reduce((sum, layer) => sum + layer.gzipBytes, 0);
    console.log(
      `Region-map assets verified: ${Object.keys(emitted).length} layers, ${(total / 1024).toFixed(0)} KiB gzip total, mapshaper ${MAPSHAPER_VERSION} via ${resolveMapshaper(root).origin}.`,
    );
    return;
  }

  const layerDir = join(root, OUTPUT.layerDir);
  mkdirSync(layerDir, { recursive: true });
  const expectedFiles = new Set(Object.values(emitted).map((layer) => layer.file));
  for (const name of layerFilesOnDisk(root)) {
    if (!expectedFiles.has(name)) rmSync(join(layerDir, name));
  }
  for (const layer of Object.values(emitted)) writeFileSync(join(layerDir, layer.file), layer.body);
  writeFileSync(join(root, OUTPUT.manifest), manifestBody);
  writeFileSync(join(root, OUTPUT.coverage), coverageBody);

  console.log(`Wrote ${Object.keys(emitted).length} layers to public/maps/:`);
  for (const [layerKey, layer] of Object.entries(emitted)) {
    console.log(
      `  ${layerKey.padEnd(12)} ${layer.file.padEnd(28)} ${(layer.gzipBytes / 1024).toFixed(1)} KiB gzip`,
    );
  }
  console.log(`Unmapped dictionary codes: ${JSON.parse(manifestBody).unmapped.length}`);
}

await main();
