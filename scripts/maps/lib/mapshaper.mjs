/**
 * Pinned mapshaper runner.
 *
 * Resolution order for the mapshaper binary:
 *   1. `MAPSHAPER_BIN` environment variable (absolute path or command name).
 *   2. `scripts/maps/.toolchain/node_modules/.bin/mapshaper` — an optional
 *      local, offline toolchain (install it with the command in
 *      `scripts/maps/README.md`).
 *   3. The pinned project devDependency (offline; install with pnpm first).
 *
 * mapshaper runs as a subprocess and only ever sees files inside one temporary
 * directory, so it never touches the repository or the vendored sources.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { INTERMEDIATE_PRECISION, MAPSHAPER_VERSION } from "./config.mjs";

export function resolveMapshaper(root) {
  const override = process.env.MAPSHAPER_BIN?.trim();
  if (override) return { command: override, args: [], origin: "MAPSHAPER_BIN" };
  const local = join(root, "scripts/maps/.toolchain/node_modules/.bin/mapshaper");
  if (existsSync(local)) return { command: local, args: [], origin: "scripts/maps/.toolchain" };
  const installed = join(root, "node_modules/mapshaper/bin/mapshaper");
  if (!existsSync(installed))
    throw new Error("Install the locked project devDependencies before generating maps.");
  const metadata = JSON.parse(
    readFileSync(join(root, "node_modules/mapshaper/package.json"), "utf8"),
  );
  if (metadata.version !== MAPSHAPER_VERSION)
    throw new Error("Mapshaper version does not match the receipt.");
  return {
    command: process.execPath,
    args: [installed],
    origin: `project mapshaper@${MAPSHAPER_VERSION}`,
  };
}

/**
 * Reproject and simplify one FeatureCollection.
 *
 * The order is deliberate: project first, then simplify in planar coordinates,
 * so the Visvalingam threshold is measured in the space that is actually
 * drawn. `keep-shapes` protects polygon features from disappearing at aggressive
 * percentages.
 */
export function projectAndSimplify(root, geojson, { projection, simplify, workDir }) {
  const { command, args } = resolveMapshaper(root);
  const input = join(workDir, "input.geojson");
  const output = join(workDir, "output.geojson");
  writeFileSync(input, JSON.stringify(geojson));
  const cli = [input, "-proj", projection];
  if (simplify) cli.push("-simplify", simplify, "keep-shapes");
  cli.push("-o", output, "format=geojson", `precision=${INTERMEDIATE_PRECISION}`);
  execFileSync(command, [...args, ...cli], { stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(readFileSync(output, "utf8"));
}

export function createWorkDir() {
  return mkdtempSync(join(tmpdir(), "portal-region-map-"));
}

export function removeWorkDir(dir) {
  rmSync(dir, { recursive: true, force: true });
}
