/**
 * Source definitions and vendored-source IO for the Portal region-map assets.
 *
 * Two kinds of upstream are used:
 *
 *  - Commit-pinned GeoJSON already reviewed inside `tiangong-lca/platform`
 *    (`public/maps/**`). The receipt records the repository, the exact commit
 *    that last touched the path, and the SHA-256 of the fetched bytes.
 *  - Live Aliyun DataV.GeoAtlas prefecture boundaries, one file per province.
 *    A live service has no upstream commit, so the SHA-256 of the fetched bytes
 *    *is* the identity.
 *
 * Raw bytes are vendored gzip-compressed under `scripts/maps/sources/`, which
 * makes the whole pipeline offline-reproducible. They are build inputs, not
 * browser assets.
 *
 * `scripts/maps/sources/manifest.json` records the exact bytes that were
 * vendored. It is written by `--fetch` and verified by `--check`; nothing else
 * writes it.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

export const PLATFORM_REPOSITORY = "tiangong-lca/platform";
export const PLATFORM_RAW_BASE = `https://raw.githubusercontent.com/${PLATFORM_REPOSITORY}`;
export const DATAV_RAW_BASE = "https://geo.datav.aliyun.com/areas_v3/bound";

/**
 * Upstream terms recorded per source. These are receipts, not legal advice: the
 * Portal does not relicense upstream boundaries and keeps the provider's own
 * terms link with every vendored file.
 */
export const LICENSES = {
  naturalEarth: {
    id: "natural-earth-public-domain",
    name: "Natural Earth",
    termsUrl: "https://www.naturalearthdata.com/about/terms-of-use/",
    terms: "Public domain. Natural Earth states that no permission is needed to use the data.",
  },
  datavGeoAtlas: {
    id: "aliyun-datav-geoatlas",
    name: "Aliyun DataV.GeoAtlas administrative boundaries",
    termsUrl: "https://help.aliyun.com/zh/datav/datav-7-0/user-guide/datav-geoatlas-widgets/",
    terms:
      "Provider-published administrative boundary service. The provider states no separate data licence on the tool page; boundaries are used here as an unrelicensed upstream reference and this entry is flagged for review in the handoff report.",
  },
  platformVendored: {
    id: "tiangong-lca-platform-vendored",
    name: "tiangong-lca/platform public/maps snapshot",
    termsUrl: `https://github.com/${PLATFORM_REPOSITORY}`,
    terms:
      "Repository-internal snapshot. The Portal records the exact commit and byte hash and re-derives nothing from a sibling checkout path at runtime.",
  },
};

/** Commit-pinned base layers. */
export const BASE_SOURCES = [
  {
    id: "world-map-units-50m",
    kind: "platform-geojson",
    path: "public/maps/world-map-units-50m.geojson",
    sourceCommit: "297f09843d0974efea6cfa9fba69a998b9f4159d",
    sourceCommitDate: "2026-06-08",
    upstream: "Natural Earth Admin-0 map units (1:50m)",
    upstreamEvidence:
      'featurecla="Admin-0 map unit" plus scalerank / NE_ID / WIKIDATAID / NAME_<lang> fields; upstream release number is not asserted because the file carries no version field.',
    license: "naturalEarth",
  },
  {
    id: "china-province-100000-full",
    kind: "platform-geojson",
    path: "public/maps/china-province-100000-full.geojson",
    sourceCommit: "6c5d02f5cad6a864e290d16b3ce6d3a62c91247b",
    sourceCommitDate: "2026-05-20",
    upstream:
      "Aliyun DataV.GeoAtlas province-level boundaries for 100000, vendored by tiangong-lca/platform",
    upstreamEvidence:
      'Per-feature adcode / name / level="province" / acroutes fields; the trailing feature carries adchar="JD" (nine-dash line).',
    license: "platformVendored",
  },
];

/** Aliyun DataV prefecture layer, one file per province adcode. */
export const DATAV_SOURCE_KIND = "datav-geojson";

export function datavSourceId(adcode) {
  return `datav-${adcode}`;
}

export function datavSource(adcode) {
  return {
    id: datavSourceId(adcode),
    kind: DATAV_SOURCE_KIND,
    adcode: String(adcode),
    path: `${adcode}_full.json`,
    upstream: `Aliyun DataV.GeoAtlas prefecture boundaries for ${adcode}`,
    upstreamEvidence: 'Per-feature adcode / name / level="city" / parent.adcode fields.',
    license: "datavGeoAtlas",
  };
}

export function sourceUrl(source) {
  return source.kind === "platform-geojson"
    ? `${PLATFORM_RAW_BASE}/${source.sourceCommit}/${source.path}`
    : `${DATAV_RAW_BASE}/${source.path}`;
}

export function sourceFile(root, id) {
  return join(root, "scripts/maps/sources", `${id}.json.gz`);
}

export function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Deterministic JSON, shaped like the repository formatter so generated assets
 * can be committed without `pnpm format:check` disagreeing with them: objects
 * break one key per line, an array of primitives stays on one line while it fits
 * the 80-column print width, and everything else breaks like an object. Key
 * order is insertion order, so rebuilding unchanged inputs reproduces the bytes.
 */
export function stableJson(value) {
  return `${writeJson(value, "")}
`;
}

function writeJson(value, indent) {
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (value.every((item) => item === null || typeof item !== "object")) {
      const inline = `[${value.map((item) => JSON.stringify(item)).join(", ")}]`;
      if (indent.length + inline.length <= 80) return inline;
    }
    const inner = `${indent}  `;
    return `[\n${value.map((item) => `${inner}${writeJson(item, inner)}`).join(",\n")}\n${indent}]`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined);
    if (keys.length === 0) return "{}";
    const inner = `${indent}  `;
    return `{\n${keys
      .map((key) => `${inner}${JSON.stringify(key)}: ${writeJson(value[key], inner)}`)
      .join(",\n")}\n${indent}}`;
  }
  return JSON.stringify(value);
}

function readManifest(root) {
  const path = join(root, "scripts/maps/sources/manifest.json");
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Fetch one URL.
 *
 * Node's bundled CA store does not chain every upstream: `geo.datav.aliyun.com`
 * serves an incomplete chain that Node rejects while `curl` resolves it through
 * the platform trust store. The fetch therefore tries Node first and falls back
 * to `curl` only for providers that need it, so a normal environment never
 * shells out.
 */
async function download(url) {
  try {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (!hasCurl()) {
      throw new Error(
        `GET ${url} failed: ${error.message}. Install curl or fix the local trust store.`,
      );
    }
    process.stderr.write(`  retrying ${url} through curl (${error.message})\n`);
    return execFileSync("curl", ["--fail", "--location", "--silent", "--show-error", url], {
      maxBuffer: 256 * 1024 * 1024,
    });
  }
}

function hasCurl() {
  try {
    execFileSync("curl", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Download one source into the vendored directory. Network access happens only
 * here; every other mode reads the vendored bytes.
 */
export async function fetchSource(root, source) {
  const url = sourceUrl(source);
  const raw = await download(url);
  let parsed;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error(`Source ${source.id} is not JSON: ${url}`);
  }
  if (parsed?.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw new Error(`Source ${source.id} is not a GeoJSON FeatureCollection: ${url}`);
  }
  const compressed = gzipSync(raw, { level: 9 });
  const file = sourceFile(root, source.id);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, compressed);
  return {
    id: source.id,
    kind: source.kind,
    url,
    sourceCommit: source.sourceCommit ?? null,
    sourceCommitDate: source.sourceCommitDate ?? null,
    upstream: source.upstream,
    upstreamEvidence: source.upstreamEvidence,
    license: source.license,
    features: parsed.features.length,
    rawBytes: raw.byteLength,
    gzipBytes: compressed.byteLength,
    sha256: sha256Hex(raw),
  };
}

export function writeSourceManifest(root, entries) {
  const manifest = {
    schemaVersion: "portal.region-map-sources.v1",
    note: "Vendored raw source bytes for the Portal region-map pipeline. Offline build inputs; not browser assets.",
    sources: [...entries].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  };
  writeFileSync(join(root, "scripts/maps/sources/manifest.json"), stableJson(manifest));
  return manifest;
}

/** Read one vendored source back from disk, without verifying its receipt. */
export function readVendored(root, id) {
  return JSON.parse(gunzipSync(readFileSync(sourceFile(root, id))).toString("utf8"));
}

export function loadSourceManifest(root) {
  const manifest = readManifest(root);
  if (!manifest) {
    throw new Error(
      "Missing scripts/maps/sources/manifest.json. Run: node scripts/maps/build-region-maps.mjs --fetch",
    );
  }
  return manifest;
}

/**
 * Verify every required source is vendored with the recorded bytes, then return
 * the parsed GeoJSON. `required` is the source definition list the current
 * dictionary and province layer imply, so a dictionary change surfaces here
 * instead of silently producing a smaller map.
 */
export function loadSources(root, required) {
  const manifest = loadSourceManifest(root);
  const recorded = new Map(manifest.sources.map((entry) => [entry.id, entry]));
  const requiredIds = new Set(required.map((source) => source.id));
  const missing = [...requiredIds].filter((id) => !recorded.has(id));
  const stale = manifest.sources.filter((entry) => !requiredIds.has(entry.id)).map((e) => e.id);
  if (missing.length || stale.length) {
    throw new Error(
      [
        "Vendored source set does not match the current dictionary and province layer.",
        missing.length ? `  missing: ${missing.join(", ")}` : null,
        stale.length ? `  no longer required: ${stale.join(", ")}` : null,
        "Run: node scripts/maps/build-region-maps.mjs --fetch",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  const parsed = new Map();
  for (const source of required) {
    const entry = recorded.get(source.id);
    const file = sourceFile(root, source.id);
    if (!existsSync(file)) throw new Error(`Missing vendored source ${source.id}: ${file}`);
    const raw = gunzipSync(readFileSync(file));
    const sha256 = sha256Hex(raw);
    if (sha256 !== entry.sha256) {
      throw new Error(
        `Vendored source ${source.id} does not match its receipt (${sha256} != ${entry.sha256}).`,
      );
    }
    parsed.set(source.id, JSON.parse(raw.toString("utf8")));
  }
  return { manifest, sources: parsed };
}

export function clearSources(root) {
  rmSync(join(root, "scripts/maps/sources"), { recursive: true, force: true });
}
