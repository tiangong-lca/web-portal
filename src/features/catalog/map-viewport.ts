export type ViewBox = [number, number, number, number];

export function parseViewBox(value: unknown): ViewBox | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parts = value
    .trim()
    .split(/[\s,]+/u)
    .map(Number);
  if (parts.length !== 4 || !parts.every(Number.isFinite) || parts[2]! <= 0 || parts[3]! <= 0)
    return null;
  return parts as ViewBox;
}

export function containsViewBox(outer: ViewBox, inner: ViewBox) {
  return (
    outer[0] <= inner[0] &&
    outer[1] <= inner[1] &&
    outer[0] + outer[2] >= inner[0] + inner[2] &&
    outer[1] + outer[3] >= inner[1] + inner[3]
  );
}

/** Expand the geographic window, never stretch or crop its foreground. The offline context
 * bounds cap unusual viewport ratios, where SVG's ordinary letterboxing remains available. */
export function fitViewBox(preferred: ViewBox, aspect: number, coverage = preferred): ViewBox {
  if (!Number.isFinite(aspect) || aspect <= 0 || !containsViewBox(coverage, preferred))
    return preferred;
  const [x, y, width, height] = preferred;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const maxWidth = 2 * Math.min(cx - coverage[0], coverage[0] + coverage[2] - cx);
  const maxHeight = 2 * Math.min(cy - coverage[1], coverage[1] + coverage[3] - cy);
  const w = Math.min(maxWidth, Math.max(width, height * aspect));
  const h = Math.min(maxHeight, Math.max(height, width / aspect));
  return [cx - w / 2, cy - h / 2, w, h];
}

export function interpolateViewBox(from: ViewBox, to: ViewBox, progress: number): ViewBox {
  const t = Math.max(0, Math.min(1, progress));
  const eased = 1 - (1 - t) ** 3;
  return from.map((value, i) => value + (to[i]! - value) * eased) as ViewBox;
}
