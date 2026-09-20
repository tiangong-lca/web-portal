/**
 * Offline basemap derivation for the region-map layers.
 *
 * A basemap shows the geographic context *around* a layer's foreground: faded
 * neighbouring land, the borders that the foreground does not already draw, a
 * lat/lon graticule and, for the world, the projection outline. Every path is
 * projected by the same pinned mapshaper release, with the same projection
 * string and the same fitted transform as the layer's foreground, so a
 * basemap vertex and a foreground vertex at the same longitude/latitude land on
 * exactly the same coordinate.
 *
 * Nothing here downloads: the context geometry is re-derived from the sources
 * the layer already depends on, and each layer only ever carries the part of
 * that context that falls inside its own (slightly extended) viewBox.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { INTERMEDIATE_PRECISION } from "./config.mjs";
import { resolveMapshaper } from "./mapshaper.mjs";

/** mapshaper is the only projection engine; the pipeline never reprojects itself. */
function run(args, { root, geojson, workDir, tag }) {
  const { command, args: prefix } = resolveMapshaper(root);
  const input = join(workDir, `basemap-${tag}.in.json`);
  const output = join(workDir, `basemap-${tag}.out.json`);
  writeFileSync(input, JSON.stringify(geojson));
  execFileSync(
    command,
    [
      ...prefix,
      input,
      ...args,
      "-o",
      output,
      "format=geojson",
      `precision=${INTERMEDIATE_PRECISION}`,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  return JSON.parse(readFileSync(output, "utf8"));
}

/**
 * Meridians and parallels in lon/lat, densified so that a projection which
 * curves them (Robinson) still renders curves rather than straight chords.
 * Three degrees is the coarsest step that still reads as a curve at every zoom
 * the product shows, and the grid is a large share of a wide background window.
 */
export function graticuleGeoJson(interval, latLimit) {
  const features = [];
  // mapshaper writes a bare GeometryCollection when a layer carries no
  // attributes, so every generated feature keeps a property of its own.
  const feature = (kind, coordinates) => ({
    type: "Feature",
    properties: { kind },
    geometry: { type: "LineString", coordinates },
  });
  for (let lon = -180; lon < 180; lon += interval) {
    const coordinates = [];
    for (let lat = -latLimit; lat <= latLimit; lat += 3) coordinates.push([lon, lat]);
    features.push(feature("meridian", coordinates));
  }
  for (let lat = -latLimit; lat <= latLimit; lat += interval) {
    const coordinates = [];
    for (let lon = -180; lon <= 180; lon += 3) coordinates.push([lon, lat]);
    features.push(feature("parallel", coordinates));
  }
  return { type: "FeatureCollection", features };
}

/**
 * The projection's seam meridian as a line, from the south pole to the north.
 * The seam longitude is the central meridian plus 180° wrapped back into
 * [-180, 180] — mapshaper rejects unwrapped values like 330.
 *
 * The outline cannot be expressed as a lon/lat polygon: the two sides of the
 * seam are the *same* meridian, so such a polygon is a 0.002° sliver that
 * mapshaper collapses instead of projecting into a frame. The silhouette is
 * therefore built from this one projected curve, mirrored about the central
 * meridian, in `silhouettePath` below.
 */
export function seamGeoJson(lon0, latLimit = 90) {
  const seam = ((((lon0 + 180 + 180) % 360) + 360) % 360) - 180;
  const coordinates = [];
  for (let lat = -latLimit; lat <= latLimit; lat += 1) coordinates.push([seam, lat]);
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { kind: "seam" },
        geometry: { type: "LineString", coordinates },
      },
    ],
  };
}

/**
 * The map silhouette: up one side of the projected seam, down its mirror image,
 * closed along the poles. Robinson is symmetric about its central meridian, so
 * mirroring the projected curve in projected space is exact.
 */
export function silhouettePath(projectedSeam, transform) {
  const side = projectedSeam.map((point) => project(point, transform));
  const mirror = projectedSeam.map((point) => project([-point[0], point[1]], transform));
  const points = [...side, ...mirror.reverse()];
  return points.length < 3 ? "" : `M${points.map(([x, y]) => `${x} ${y}`).join("L")}Z`;
}

/**
 * The window a previously emitted path occupies, as a viewBox string. Used to
 * grow the world window to its silhouette so no basemap field has to overflow
 * the layer it belongs to.
 */
export function pathViewBox(path) {
  const numbers = path.match(/-?\d+/g)?.map(Number) ?? [];
  if (numbers.length < 4) throw new Error("Path does not describe an area.");
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let index = 0; index < numbers.length; index += 2) {
    minX = Math.min(minX, numbers[index]);
    maxX = Math.max(maxX, numbers[index]);
    minY = Math.min(minY, numbers[index + 1]);
    maxY = Math.max(maxY, numbers[index + 1]);
  }
  return `${Math.round(minX)} ${Math.round(minY)} ${Math.round(maxX - minX)} ${Math.round(maxY - minY)}`;
}

/**
 * Project a source with the layer family's projection. `latLimit` clips the
 * input in lon/lat *before* projecting: Web Mercator sends the poles to
 * infinity, so a polar-safe cut is mandatory, not cosmetic.
 */
export function projectSource(root, geojson, { projection, latLimit, workDir, tag }) {
  const args = [];
  if (latLimit) args.push("-clip", `bbox=-180,${-latLimit},180,${latLimit}`);
  args.push("-proj", projection);
  return run(args, { root, geojson, workDir, tag });
}

/** Cut an already-projected dataset down to one layer's window and simplify it. */
export function clipToWindow(root, geojson, { clipBox, simplify, workDir, tag }) {
  const args = ["-clip", `bbox=${clipBox.join(",")}`];
  if (simplify) args.push("-simplify", simplify, "keep-shapes");
  return run(args, { root, geojson, workDir, tag });
}

/** The projected rectangle a layer's viewBox covers, for `-clip bbox=`. */
export function projectedClipBox(viewBox, transform) {
  const [vx, vy, vw, vh] = viewBox.split(" ").map(Number);
  const xmin = transform.x0 + vx / transform.scale;
  const xmax = transform.x0 + (vx + vw) / transform.scale;
  const ymax = transform.y1 - vy / transform.scale;
  const ymin = transform.y1 - (vy + vh) / transform.scale;
  return [xmin, ymin, xmax, ymax];
}

function line(points) {
  return points.length < 2 ? "" : `M${points.map(([x, y]) => `${x} ${y}`).join("L")}`;
}

function project(point, transform) {
  const [x, y] = point;
  return [
    Math.round((x - transform.x0) * transform.scale),
    Math.round((transform.y1 - y) * transform.scale),
  ];
}

function dedupe(points) {
  const out = [];
  for (const point of points) {
    const previous = out[out.length - 1];
    if (previous && previous[0] === point[0] && previous[1] === point[1]) continue;
    out.push(point);
  }
  return out;
}

/**
 * Concatenated SVG paths for a basemap geometry set: polygon rings are closed
 * (land, frame), line strings stay open (graticule).
 */
export function basemapPath(geojson, transform) {
  const parts = [];
  for (const feature of geojson.features) {
    const { type, coordinates } = feature.geometry;
    if (type === "LineString") {
      parts.push(line(dedupe(coordinates.map((point) => project(point, transform)))));
    } else if (type === "MultiLineString") {
      for (const part of coordinates) {
        parts.push(line(dedupe(part.map((point) => project(point, transform)))));
      }
    } else if (type === "Polygon") {
      for (const ring of coordinates) {
        const points = dedupe(ring.map((point) => project(point, transform)));
        if (
          points.length > 1 &&
          points[0][0] === points[points.length - 1][0] &&
          points[0][1] === points[points.length - 1][1]
        )
          points.pop();
        if (points.length >= 3) parts.push(`${line(points)}Z`);
      }
    } else if (type === "MultiPolygon") {
      for (const polygon of coordinates) {
        for (const ring of polygon) {
          const points = dedupe(ring.map((point) => project(point, transform)));
          if (
            points.length > 1 &&
            points[0][0] === points[points.length - 1][0] &&
            points[0][1] === points[points.length - 1][1]
          )
            points.pop();
          if (points.length >= 3) parts.push(`${line(points)}Z`);
        }
      }
    } else {
      throw new Error(`Unsupported basemap geometry: ${type}`);
    }
  }
  return parts.filter(Boolean).join("");
}

/**
 * Pick the finest interval from `ladder` that still puts at least `minimum`
 * lines inside the window, so a small province window does not end up with an
 * empty or single-line grid.
 */
export function graticuleInterval(ladder, span, minimum = 3) {
  for (const interval of ladder) {
    if (span / interval >= minimum) return interval;
  }
  return ladder[ladder.length - 1];
}
