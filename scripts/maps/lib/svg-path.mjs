/**
 * Projected GeoJSON -> preprojected SVG path strings.
 *
 * The browser never reprojects: every emitted layer is already in a flat,
 * integer coordinate space whose `viewBox` is emitted with it. A layer family
 * (Chinese administrative levels) shares one projection and one fit, so a
 * province sublayer's `viewBox` is a literal window into the parent space.
 */

/**
 * Iterate every `[x, y]` position of a Polygon or MultiPolygon without
 * recursing through intermediate arrays more than once per level.
 */
export function* positions(geometry) {
  if (!geometry) return;
  const { type, coordinates } = geometry;
  if (type === "Polygon") {
    for (const ring of coordinates) for (const point of ring) yield point;
  } else if (type === "MultiPolygon") {
    for (const polygon of coordinates)
      for (const ring of polygon) for (const point of ring) yield point;
  } else {
    throw new Error(`Unsupported geometry type for a filled region: ${type}`);
  }
}

export function boundingBox(geometries) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const geometry of geometries) {
    for (const [x, y] of positions(geometry)) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (!Number.isFinite(x0)) throw new Error("Empty geometry set; cannot fit a coordinate space.");
  return { x0, y0, x1, y1 };
}

/**
 * Uniform (aspect-preserving) fit of a bounding box into an integer coordinate
 * space whose largest dimension is `units`. SVG y grows downward, so the
 * projected y axis is flipped here.
 */
export function fitTransform(box, units) {
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  const scale = units / Math.max(width, height);
  return { scale, x0: box.x0, y1: box.y1 };
}

export function viewBoxOf(box, transform) {
  const width = Math.round((box.x1 - box.x0) * transform.scale);
  const height = Math.round((box.y1 - box.y0) * transform.scale);
  return `0 0 ${width} ${height}`;
}

function ringToPath(ring, transform) {
  const points = [];
  for (const [x, y] of ring) {
    const px = Math.round((x - transform.x0) * transform.scale);
    const py = Math.round((transform.y1 - y) * transform.scale);
    const previous = points[points.length - 1];
    if (previous && previous[0] === px && previous[1] === py) continue;
    points.push([px, py]);
  }
  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) points.pop();
  }
  return points;
}

/**
 * One SVG path per source feature. Rings of the same feature are concatenated,
 * and even-odd/nonzero winding is preserved from the source, so holes render
 * as holes without any extra metadata.
 *
 * Returns `{ path, rings, dropped }`; `dropped` counts rings that collapsed
 * below three distinct integer points and therefore cannot be filled.
 */
export function featureToPath(geometry, transform) {
  const { type, coordinates } = geometry;
  const polygons = type === "Polygon" ? [coordinates] : coordinates;
  const parts = [];
  let rings = 0;
  let dropped = 0;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      const points = ringToPath(ring, transform);
      if (points.length < 3) {
        dropped += 1;
        continue;
      }
      parts.push(`M${points.map(([x, y]) => `${x} ${y}`).join("L")}Z`);
      rings += 1;
    }
  }
  return { path: parts.join(""), rings, dropped };
}

/** Bounding box of an already-projected feature, in the shared coordinate space. */
export function projectedBounds(geometries, transform) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const geometry of geometries) {
    for (const [x, y] of positions(geometry)) {
      const px = Math.round((x - transform.x0) * transform.scale);
      const py = Math.round((transform.y1 - y) * transform.scale);
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;
    }
  }
  if (!Number.isFinite(x0)) throw new Error("Empty geometry set; cannot compute a window.");
  return { x0, y0, x1, y1 };
}

/**
 * A window into the shared space with a small padding, so a stroked province
 * outline is not clipped at the viewBox edge. The window is clamped to the
 * parent space: a border province keeps its padding on the interior side
 * instead of pushing the window past the edge of `geo:cn`.
 */
export function windowViewBox(bounds, padding, space) {
  const x = Math.max(0, bounds.x0 - padding);
  const y = Math.max(0, bounds.y0 - padding);
  const width = Math.min(space.width - x, Math.round(bounds.x1 - bounds.x0 + padding * 2));
  const height = Math.min(space.height - y, Math.round(bounds.y1 - bounds.y0 + padding * 2));
  return `${x} ${y} ${width} ${height}`;
}

/** Integer width and height of a fitted viewBox string. */
export function viewBoxSize(viewBox) {
  const [, , width, height] = viewBox.split(" ").map(Number);
  return { width, height };
}
