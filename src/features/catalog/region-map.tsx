"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FeedbackLink } from "@/components/shell/feedback-link";
import { Button } from "@/components/ui/button";
import type { NavigationEntry } from "./catalog-navigation";
import { containsViewBox, parseViewBox } from "./map-viewport";
import { useMapCamera } from "./use-map-camera";

type MapLayer = {
  viewBox: string;
  coordinateSpace?: string;
  basemap?: { viewBox?: string; land: string; graticule: string; borders?: string; frame?: string };
  features: { boundaryId: string; nodeId: string | null; path: string }[];
};

function validContextPath(value: unknown) {
  return typeof value === "string" && /^[MmLlHhVvCcSsQqTtAaZz0-9., eE+\- ]*$/u.test(value);
}

function validLayer(value: unknown): value is MapLayer {
  if (!value || typeof value !== "object") return false;
  const layer = value as Partial<MapLayer>;
  const preferred = parseViewBox(layer.viewBox);
  const coverage = parseViewBox(layer.basemap?.viewBox);
  return (
    preferred !== null &&
    (layer.coordinateSpace === undefined || typeof layer.coordinateSpace === "string") &&
    (layer.basemap === undefined ||
      (layer.basemap !== null &&
        typeof layer.basemap === "object" &&
        (layer.basemap.viewBox === undefined ||
          (coverage !== null && containsViewBox(coverage, preferred))) &&
        validContextPath(layer.basemap.land) &&
        validContextPath(layer.basemap.graticule) &&
        (layer.basemap.frame === undefined || validContextPath(layer.basemap.frame)) &&
        (layer.basemap.borders === undefined || validContextPath(layer.basemap.borders)))) &&
    Array.isArray(layer.features) &&
    layer.features.length <= 1000 &&
    layer.features.every(
      (feature) =>
        feature !== null &&
        typeof feature === "object" &&
        typeof feature.boundaryId === "string" &&
        (feature.nodeId === null || typeof feature.nodeId === "string") &&
        typeof feature.path === "string" &&
        /^[MmLlHhVvCcSsQqTtAaZz0-9., eE+-]+$/u.test(feature.path),
    )
  );
}

function background(layer: MapLayer, includeForeground = false) {
  return (
    <g className="catalog-map-basemap" aria-hidden="true" pointerEvents="none">
      {layer.basemap?.frame && <path className="catalog-map-ocean" d={layer.basemap.frame} />}
      {layer.basemap?.graticule && (
        <path className="catalog-map-graticule" d={layer.basemap.graticule} />
      )}
      {layer.basemap?.land && <path className="catalog-map-context-land" d={layer.basemap.land} />}
      {layer.basemap?.borders && (
        <path className="catalog-map-context-borders" d={layer.basemap.borders} />
      )}
      {includeForeground &&
        layer.features.map((feature, i) => (
          <path
            key={`${feature.boundaryId}:${i}`}
            className="catalog-map-context-land"
            d={feature.path}
          />
        ))}
    </g>
  );
}

function transitionBackground(previous: MapLayer | undefined, next: MapLayer) {
  if (!previous || !next.coordinateSpace || previous.coordinateSpace !== next.coordinateSpace)
    return next;
  const a = parseViewBox(previous.viewBox)!;
  const b = parseViewBox(next.viewBox)!;
  return a[2] * a[3] > b[2] * b[3] ? previous : next;
}

// Reveal only the obscured part of a local selection, keeping the surrounding map in place.
function revealSelection(element: Element, focusTarget: Element = element) {
  const header = document.querySelector("[data-portal-header]")?.getBoundingClientRect();
  const tray = document.querySelector("[data-compare-tray]")?.getBoundingClientRect();
  const top = Math.max(0, header?.bottom ?? 0) + 16;
  const bottom = Math.min(window.innerHeight, tray?.top ?? window.innerHeight) - 16;
  if (bottom <= top) return;
  const panelBounds = element.getBoundingClientRect();
  const bounds =
    panelBounds.height > bottom - top ? focusTarget.getBoundingClientRect() : panelBounds;
  // No scroll can fully reveal a target taller than the unobscured viewport.
  if (bounds.height > bottom - top) return;
  const delta =
    bounds.bottom > bottom ? bounds.bottom - bottom : bounds.top < top ? bounds.top - top : 0;
  if (delta)
    window.scrollBy({
      top: delta,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
}

/** Geometry is fetched only for the visible layer, independent of the complete text navigation.
 * @import import { RegionMap } from "@/features/catalog/region-map";
 */
export function RegionMap({
  url,
  entries,
  title,
  loadingLabel,
  unavailableLabel,
  legend,
  selectLabel,
  exploreLabel,
  viewDataLabel,
  clearLabel,
}: {
  url: string;
  entries: NavigationEntry[];
  title: string;
  loadingLabel: string;
  unavailableLabel: string;
  legend: string;
  selectLabel: string;
  exploreLabel: string;
  viewDataLabel: string;
  clearLabel: string;
}) {
  const action = useRef<HTMLAnchorElement>(null);
  const selectionTrigger = useRef<HTMLAnchorElement | null>(null);
  const [selection, setSelection] = useState<{ url: string; nodeId: string } | null>(null);
  useEffect(() => {
    if (selection && action.current) {
      action.current.focus({ preventScroll: true });
      revealSelection(
        action.current.closest(".catalog-map-selection") ?? action.current,
        action.current,
      );
    }
  }, [selection]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [state, setState] = useState<{
    url: string;
    layer: MapLayer;
    backdrop: MapLayer;
  } | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void (async () => {
      try {
        if (!/^\/maps\/[a-zA-Z0-9_.-]+\.json$/u.test(url)) throw new Error("Invalid layer URL");
        const response = await fetch(url, { signal: controller.signal, credentials: "omit" });
        if (!response.ok) throw new Error("Map unavailable");
        const text = await response.text();
        if (new TextEncoder().encode(text).length > 2 * 1024 * 1024)
          throw new Error("Oversized map");
        const layer: unknown = JSON.parse(text);
        if (!validLayer(layer)) throw new Error("Invalid layer");
        if (active) {
          setState((previous) => ({
            url,
            layer,
            // Retain the broadest loaded context so interrupted zooms still have geography
            // beneath the entire in-flight camera. This does not fetch another map layer.
            backdrop: transitionBackground(previous?.backdrop, layer),
          }));
          setFailedUrl(null);
        }
      } catch {
        if (active && !controller.signal.aborted) setFailedUrl(url);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [url]);
  const current = state?.url === url ? state : null;
  const layer = state?.layer;
  const failed = failedUrl === url;
  const isWorld = (state?.url ?? url).startsWith("/maps/world.");
  const svg = useMapCamera(
    layer?.viewBox,
    layer?.basemap?.viewBox,
    layer?.coordinateSpace,
    isWorld,
  );
  const byNode = new Map((current ? entries : []).map((entry) => [entry.nodeId, entry]));
  const selected = selection?.url === url ? byNode.get(selection.nodeId) : undefined;
  const preview = selected ?? (hovered ? byNode.get(hovered) : undefined);
  const maximum = Math.max(1, ...entries.map((entry) => entry.count));
  // An interactive SVG group contains links; fieldset is not a valid SVG replacement.
  /* oxlint-disable jsx-a11y/prefer-tag-over-role */
  return (
    <figure className="catalog-region-map" aria-busy={!current && !failed}>
      <div className="catalog-map-canvas" data-world={isWorld || undefined}>
        {layer && (
          <svg
            ref={svg}
            viewBox={layer.viewBox}
            role="group"
            aria-label={title}
            data-coordinate-space={layer.coordinateSpace}
            data-layer-url={state.url}
          >
            <g className="catalog-map-transition-context">{background(state.backdrop, true)}</g>
            <g className="catalog-map-current-context">{background(layer)}</g>
            <g className="catalog-map-data">
              {layer.features.map((feature, index) => {
                const entry = feature.nodeId ? byNode.get(feature.nodeId) : undefined;
                const key = `${feature.boundaryId}:${index}`;
                if (!entry)
                  return (
                    <path
                      key={key}
                      className="catalog-map-feature"
                      data-boundary-id={feature.boundaryId}
                      d={feature.path}
                      data-availability="unknown"
                      aria-hidden="true"
                    />
                  );
                const shade =
                  entry.count === 0 ? 0 : Math.max(1, Math.ceil((entry.count / maximum) * 4));
                return (
                  <Link
                    key={key}
                    href={entry.href}
                    prefetch={false}
                    aria-label={`${entry.label}: ${entry.countLabel}`}
                    data-count={shade}
                    data-selected={selected?.nodeId === entry.nodeId || undefined}
                    onMouseEnter={() => setHovered(entry.nodeId)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(entry.nodeId)}
                    onBlur={() => setHovered(null)}
                    onClick={(event) => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                      event.preventDefault();
                      selectionTrigger.current = event.currentTarget;
                      setSelection({ url, nodeId: entry.nodeId });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setSelection(null);
                    }}
                  >
                    <title>
                      {entry.label}: {entry.countLabel}
                    </title>
                    <path
                      className="catalog-map-feature"
                      data-boundary-id={feature.boundaryId}
                      d={feature.path}
                    />
                  </Link>
                );
              })}
            </g>
          </svg>
        )}
        {!current && (
          <output className="catalog-region-map-status" data-over-map={Boolean(layer) || undefined}>
            {failed ? unavailableLabel : loadingLabel}
          </output>
        )}
      </div>
      <div className="catalog-map-selection" aria-live="polite">
        <div className="catalog-map-selection-description">
          {preview ? (
            <>
              <strong>{preview.label}</strong>
              <span>{preview.countLabel}</span>
              {preview.description && <small>{preview.description}</small>}
            </>
          ) : (
            <span>{selectLabel}</span>
          )}
        </div>
        {selected && (
          <div className="catalog-map-selection-actions">
            <Button asChild>
              <FeedbackLink ref={action} href={selected.href} prefetch={false}>
                {selected.hasChildren ? exploreLabel : viewDataLabel}
              </FeedbackLink>
            </Button>
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setSelection(null);
                selectionTrigger.current?.focus({ preventScroll: true });
                if (selectionTrigger.current) revealSelection(selectionTrigger.current);
              }}
            >
              {clearLabel}
            </Button>
          </div>
        )}
      </div>
      <figcaption className="text-muted-foreground flex flex-col gap-2 p-3 text-sm">
        <span>{legend}</span>
        <span className="text-xs">
          <a className="underline underline-offset-2" href="https://www.naturalearthdata.com/">
            Natural Earth
          </a>
          {" · "}
          <a
            className="underline underline-offset-2"
            href="https://datav.aliyun.com/portal/school/atlas/area_selector"
          >
            DataV GeoAtlas
          </a>
        </span>
      </figcaption>
    </figure>
  );
}
