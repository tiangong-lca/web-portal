"use client";

import {
  Component,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import { ArrowLeftIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackLink as Link } from "@/components/shell/feedback-link";
import type { PortalLocale } from "@/i18n/routing";
import type { NavigationEntry } from "./catalog-navigation";
import type { RegionMapAssets } from "./region-maplibre-types";
import { RegionMapLoading } from "./region-map-loading";
import { MapInformation, type MapInformationLabels } from "./map-information";
import "./region-maplibre.css";

const Scene = dynamic(
  () => import("./region-maplibre-scene").then((module) => module.RegionMapScene),
  { ssr: false, loading: () => <RegionMapLoading /> },
);
export type RegionMapLabels = {
  title: string;
  loading: string;
  unavailable: string;
  select: string;
  explore: string;
  viewData: string;
  clear: string;
  reset: string;
  back: string;
  retry: string;
  smallRegions: string;
  shortcutNames: { TW: string; HK: string; MO: string };
  gestureWindows: string;
  gestureMac: string;
  gestureMobile: string;
  information: MapInformationLabels;
};

class MapBoundary extends Component<
  { children: ReactNode; unavailable: string; retry: string },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? (
      <div className="region-maplibre-scene">
        <div className="region-maplibre-status" role="alert">
          <p>{this.props.unavailable}</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            {this.props.retry}
          </Button>
        </div>
      </div>
    ) : (
      this.props.children
    );
  }
}

function resultsHref(href: string) {
  const url = new URL(href, "https://portal.invalid");
  url.searchParams.set("explore", url.searchParams.get("kind") === "flow" ? "flow" : "process");
  url.searchParams.delete("cursor");
  url.searchParams.delete("navCursor");
  url.searchParams.delete("pageTrail");
  return `${url.pathname}${url.search}${url.hash}`;
}

function revealAction(panel: HTMLElement, action: HTMLElement) {
  const header = document.querySelector("[data-portal-header]")?.getBoundingClientRect();
  const tray = document.querySelector("[data-compare-tray]")?.getBoundingClientRect();
  const top = Math.max(0, header?.bottom ?? 0) + 16;
  const bottom = Math.min(window.innerHeight, tray?.top ?? window.innerHeight) - 16;
  const panelBounds = panel.getBoundingClientRect();
  const bounds = panelBounds.height > bottom - top ? action.getBoundingClientRect() : panelBounds;
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

/** Production map uses current navigation counts, with ordinary HTML actions and small-target shortcuts.
 * @import import { RegionMapLibre } from "@/features/catalog/region-maplibre";
 */
export function RegionMapLibre({
  assets,
  entries,
  locale,
  globe,
  labels,
  parentHref,
  reducedMotion,
  unavailable,
}: {
  assets: RegionMapAssets;
  entries: NavigationEntry[];
  locale: PortalLocale;
  globe: boolean;
  labels: RegionMapLabels;
  parentHref?: string;
  reducedMotion?: boolean;
  unavailable?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const action = useRef<HTMLAnchorElement>(null);
  const selectionTrigger = useRef<HTMLElement | null>(null);
  const [choice, setChoice] = useState<{ layer: string; nodeId: string } | null>(null);
  const [hover, setHover] = useState<{ layer: string; nodeId: string } | null>(null);
  const [camera, setCamera] = useState({
    layer: assets.layer,
    nodeId: null as string | null,
    sequence: 0,
  });
  const [readiness, setReadiness] = useState({ layer: assets.layer, ready: false });
  const [phase, setPhase] = useState({
    layer: assets.layer,
    value: "loading" as "loading" | "ready" | "failed",
  });
  const [attempt, setAttempt] = useState(0);
  const selected =
    choice?.layer === assets.layer
      ? entries.find((entry) => entry.nodeId === choice.nodeId)
      : undefined;
  const hovered =
    hover?.layer === assets.layer
      ? entries.find((entry) => entry.nodeId === hover.nodeId)
      : undefined;
  const preview = selected ?? hovered;
  const cameraRequest = useMemo(
    () => ({
      nodeId: camera.layer === assets.layer ? camera.nodeId : null,
      sequence: camera.sequence,
    }),
    [camera, assets.layer],
  );
  const select = useCallback(
    (nodeId: string) => {
      if (!entries.some((entry) => entry.nodeId === nodeId)) return;
      selectionTrigger.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setChoice({ layer: assets.layer, nodeId });
      setHover(null);
      setCamera((previous) => ({ layer: assets.layer, nodeId, sequence: previous.sequence + 1 }));
    },
    [entries, assets.layer],
  );
  const onHover = useCallback(
    (nodeId: string | null) => setHover(nodeId ? { layer: assets.layer, nodeId } : null),
    [assets.layer],
  );
  const onReady = useCallback(
    (ready: boolean) => setReadiness({ layer: assets.layer, ready }),
    [assets.layer],
  );
  const onStatus = useCallback(
    (value: "loading" | "ready" | "failed") => setPhase({ layer: assets.layer, value }),
    [assets.layer],
  );
  const reset = () => {
    setChoice(null);
    setHover(null);
    setCamera((previous) => ({
      layer: assets.layer,
      nodeId: null,
      sequence: previous.sequence + 1,
    }));
  };
  const revealChosen = useEffectEvent(() => {
    if (selected && action.current) {
      action.current.focus({ preventScroll: true });
      revealAction(
        action.current.closest(".region-maplibre-selection") ?? action.current,
        action.current,
      );
    }
  });
  useEffect(() => {
    revealChosen();
  }, [choice, assets.layer]);
  const shortcuts =
    assets.layer === "geo:cn"
      ? entries.filter((entry) => ["TW", "HK", "MO"].includes(entry.code.toUpperCase()))
      : [];
  const ready = readiness.layer === assets.layer && readiness.ready;
  return (
    <div
      ref={root}
      className="region-maplibre"
      data-map-ready={ready}
      data-selected-node={selected?.nodeId ?? ""}
    >
      <figure className="region-maplibre-figure">
        <div className="region-maplibre-map">
          <MapBoundary
            key={`${locale}:${attempt}`}
            unavailable={labels.unavailable}
            retry={labels.retry}
          >
            <Scene
              assets={assets}
              entries={entries}
              globe={globe}
              locale={locale}
              selected={selected?.nodeId ?? null}
              cameraRequest={cameraRequest}
              labels={labels}
              reducedMotion={reducedMotion}
              unavailable={unavailable}
              onSelect={select}
              onHover={onHover}
              onReady={onReady}
              onStatus={onStatus}
            />
          </MapBoundary>
          <div className="region-maplibre-controls">
            <Button variant="outline" size="icon" onClick={reset} aria-label={labels.reset}>
              <RotateCcwIcon aria-hidden="true" />
            </Button>
            {parentHref && (
              <Button asChild variant="outline" size="icon">
                <Link prefetch={false} href={parentHref} aria-label={labels.back}>
                  <ArrowLeftIcon aria-hidden="true" />
                </Link>
              </Button>
            )}
          </div>
          {shortcuts.length > 0 && ready && (
            <fieldset className="region-maplibre-shortcuts" aria-label={labels.smallRegions}>
              {shortcuts.map((entry) => (
                <Button
                  key={entry.nodeId}
                  variant="outline"
                  onClick={() => select(entry.nodeId)}
                  aria-pressed={selected?.nodeId === entry.nodeId}
                  title={`${entry.label}: ${entry.countLabel}`}
                  data-region-shortcut={entry.nodeId}
                >
                  {labels.shortcutNames[entry.code as keyof typeof labels.shortcutNames]}
                </Button>
              ))}
            </fieldset>
          )}
          {phase.layer === assets.layer && phase.value === "failed" && (
            <div className="region-maplibre-retry">
              <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>
                {labels.retry}
              </Button>
            </div>
          )}
        </div>
        <MapInformation labels={labels.information} noticeUrl={assets.noticeUrl} />
      </figure>
      <output className="sr-only">
        {selected ? `${selected.label}: ${selected.countLabel}` : ""}
      </output>
      <div className="region-maplibre-selection">
        {preview ? (
          <div className="region-maplibre-selection-summary">
            <strong>{preview.label}</strong>
            <span>{preview.countLabel}</span>
          </div>
        ) : (
          <p className="region-maplibre-selection-hint">{labels.select}</p>
        )}
        {selected && (
          <div className="region-maplibre-selection-actions">
            {selected.hasChildren && (
              <Button asChild>
                <Link ref={action} prefetch={false} href={selected.href}>
                  {labels.explore}
                </Link>
              </Button>
            )}
            <Button asChild variant={selected.hasChildren ? "outline" : "default"}>
              <Link
                ref={selected.hasChildren ? undefined : action}
                prefetch={false}
                href={resultsHref(selected.href)}
              >
                {labels.viewData}
              </Link>
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                reset();
                const target = selectionTrigger.current;
                if (target?.isConnected) target.focus({ preventScroll: true });
                else root.current?.querySelector("canvas")?.focus();
              }}
            >
              {labels.clear}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
