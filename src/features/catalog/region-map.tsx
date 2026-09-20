"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { NavigationEntry } from "./catalog-navigation";

type MapLayer = {
  viewBox: string;
  features: { boundaryId: string; nodeId: string | null; path: string }[];
};

function validLayer(value: unknown): value is MapLayer {
  if (!value || typeof value !== "object") return false;
  const layer = value as Partial<MapLayer>;
  return (
    typeof layer.viewBox === "string" &&
    /^[\d. -]+$/u.test(layer.viewBox) &&
    Array.isArray(layer.features) &&
    layer.features.length <= 1000 &&
    layer.features.every(
      (feature) =>
        typeof feature.boundaryId === "string" &&
        (feature.nodeId === null || typeof feature.nodeId === "string") &&
        typeof feature.path === "string" &&
        /^[MmLlHhVvCcSsQqTtAaZz0-9., eE+-]+$/u.test(feature.path),
    )
  );
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
    if (selection) action.current?.focus({ preventScroll: true });
  }, [selection]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [state, setState] = useState<{
    url: string;
    layer: MapLayer | null;
    failed: boolean;
  } | null>(null);
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
        if (active) setState({ url, layer, failed: false });
      } catch {
        if (active && !controller.signal.aborted) setState({ url, layer: null, failed: true });
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [url]);
  const current = state?.url === url ? state : null;
  const byNode = new Map(entries.map((entry) => [entry.nodeId, entry]));
  const selected = selection?.url === url ? byNode.get(selection.nodeId) : undefined;
  const preview = selected ?? (hovered ? byNode.get(hovered) : undefined);
  const maximum = Math.max(1, ...entries.map((entry) => entry.count));
  // An interactive SVG group contains links; fieldset is not a valid SVG replacement.
  /* oxlint-disable jsx-a11y/prefer-tag-over-role */
  return (
    <figure className="catalog-region-map">
      {current?.layer ? (
        <svg viewBox={current.layer.viewBox} role="group" aria-label={title}>
          {current.layer.features.map((feature, index) => {
            const entry = feature.nodeId ? byNode.get(feature.nodeId) : undefined;
            const key = `${feature.boundaryId}:${index}`;
            if (!entry)
              return (
                <path key={key} d={feature.path} data-availability="unknown" aria-hidden="true" />
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
                <path d={feature.path} />
              </Link>
            );
          })}
        </svg>
      ) : (
        <output className="catalog-region-map-status">
          {current?.failed ? unavailableLabel : loadingLabel}
        </output>
      )}
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
              <Link ref={action} href={selected.href} prefetch={false}>
                {selected.hasChildren ? exploreLabel : viewDataLabel}
              </Link>
            </Button>
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setSelection(null);
                selectionTrigger.current?.focus({ preventScroll: true });
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
