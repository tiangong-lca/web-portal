import { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  ChevronRightIcon,
  Globe2Icon,
  MapIcon,
  RotateCcwIcon,
  SearchIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PortalLocale } from "@/i18n/routing";
import boundaryManifest from "./boundaries.generated.json";
import snapshot from "./counts.generated.json";
import { messages } from "./messages";
import { MapScene } from "./map-scene";
import { regionLabel, type MapMode, type NavigationBranch, type RegionEntry } from "./types";
import "./prototype.css";

const branches: Record<string, NavigationBranch> = snapshot.branches;
const layers: Record<string, { url: string }> = boundaryManifest.layers;
const index = new Map(
  Object.values(branches)
    .flatMap((branch) => branch.entries)
    .map((entry) => [entry.nodeId, entry]),
);

/** Human-review prototype using public count snapshots and the production boundary sources.
 * @import import { MapLibreExplorer } from ".storybook/maplibre-reference/explorer";
 */
export function MapLibreExplorer({
  locale = "zh-CN",
  dark = false,
  initialLevel = "world",
  initialMode,
  unavailable = false,
  reducedMotion = false,
}: {
  locale?: PortalLocale;
  dark?: boolean;
  initialLevel?: string;
  initialMode?: MapMode;
  unavailable?: boolean;
  reducedMotion?: boolean;
}) {
  const t = messages[locale];
  const searchId = useId();
  const [trail, setTrail] = useState(() =>
    initialLevel === "world"
      ? ["world"]
      : initialLevel === "geo:cn"
        ? ["world", "geo:cn"]
        : ["world", "geo:cn", initialLevel],
  );
  const [mode, setMode] = useState<MapMode>(
    () =>
      initialMode ?? (typeof window !== "undefined" && window.innerWidth < 640 ? "list" : "globe"),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [ready, setReady] = useState(false);
  const [camera, setCamera] = useState({ nodeId: null as string | null, sequence: 0 });
  const level = trail.at(-1)!;
  const branch = branches[level]!;
  const entries = branch.entries;
  const choose = useCallback((nodeId: string) => {
    setSelected(nodeId);
    setHovered(null);
    setCamera((previous) => ({ nodeId, sequence: previous.sequence + 1 }));
  }, []);
  const hover = useCallback((nodeId: string | null) => setHovered(nodeId), []);
  const onReady = useCallback((value: boolean) => setReady(value), []);
  const navigate = useCallback((next: string[]) => {
    setTrail(next);
    setSelected(null);
    setHovered(null);
    setQuery("");
    window.history.pushState(
      { portalGlobe: next },
      "",
      `#globe=${encodeURIComponent(next.at(-1)!)}`,
    );
  }, []);
  useEffect(() => {
    const back = (event: PopStateEvent) => {
      const next = event.state?.portalGlobe as unknown;
      const valid =
        Array.isArray(next) &&
        next.length &&
        next.every((key) => typeof key === "string" && branches[key]);
      setTrail(valid ? next : ["world"]);
      setSelected(null);
      setHovered(null);
      setQuery("");
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);

  const preview = entries.find((entry) => entry.nodeId === (selected ?? hovered));
  const filtered = useMemo(
    () =>
      entries
        .filter((entry) =>
          `${regionLabel(entry, locale)} ${entry.code}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
        )
        .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
    [entries, locale, query],
  );
  const positive = filtered.filter((entry) => entry.count > 0);
  const zero = filtered.filter((entry) => entry.count === 0);
  const canExplore = Boolean(
    preview?.hasChildren && layers[preview.nodeId] && branches[preview.nodeId],
  );
  const title = level === "world" ? t.world : regionLabel(index.get(level)!, locale);
  const dataUrl = (entry: RegionEntry) => {
    const url = new URL(entry.dataUrl);
    url.pathname = `/${locale}/search`;
    url.searchParams.set("explore", "process");
    return url.href;
  };
  const reset = () => {
    setSelected(null);
    setHovered(null);
    setCamera((previous) => ({ nodeId: null, sequence: previous.sequence + 1 }));
  };
  const renderEntries = (items: RegionEntry[]) => (
    <ul className="globe-regions">
      {items.map((entry) => (
        <li key={entry.nodeId}>
          <button
            type="button"
            data-node-id={entry.nodeId}
            aria-pressed={selected === entry.nodeId}
            onClick={() => choose(entry.nodeId)}
          >
            <span>
              <strong>{regionLabel(entry, locale)}</strong>
              <small>{entry.code}</small>
            </span>
            <span className="globe-region-number">
              {entry.count.toLocaleString(locale)}
              <ChevronRightIcon aria-hidden="true" size={14} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div
      className="globe-prototype"
      data-level={level}
      data-mode={mode}
      data-selected-node={selected ?? ""}
      data-map-ready={ready}
    >
      <header className="globe-intro">
        <div>
          <span className="globe-eyebrow">
            {t.prototype} <span aria-hidden="true">/</span> MAPLIBRE
          </span>
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
        <div className="globe-snapshot">
          <span>{t.process}</span>
          <strong>{t.snapshot}</strong>
          <small>
            {t.asOf}{" "}
            {new Date(snapshot.capturedAt).toLocaleString(locale, {
              timeZone: "Asia/Shanghai",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}{" "}
            UTC+8
          </small>
        </div>
      </header>
      <section className="globe-panel" aria-label={t.title}>
        <div className="globe-toolbar">
          <nav aria-label={t.childList}>
            <ol>
              {trail.map((key, i) => (
                <li key={key}>
                  {i > 0 && <ChevronRightIcon size={14} aria-hidden="true" />}
                  <button
                    type="button"
                    aria-current={i === trail.length - 1 ? "location" : undefined}
                    onClick={() => navigate(trail.slice(0, i + 1))}
                  >
                    {key === "world" ? t.world : regionLabel(index.get(key)!, locale)}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <fieldset className="globe-view-switch" aria-label={t.mapLabel}>
            {(["globe", "flat", "list"] as const).map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={mode === value}
                onClick={() => {
                  setMode(value);
                  setHovered(null);
                }}
              >
                {value === "globe" ? (
                  <Globe2Icon size={15} aria-hidden="true" />
                ) : value === "flat" ? (
                  <MapIcon size={15} aria-hidden="true" />
                ) : null}
                {t[value]}
              </button>
            ))}
          </fieldset>
        </div>
        {(mode === "globe" || mode === "flat") && (
          <div className="globe-map-wrap">
            <MapScene
              key={locale}
              layer={level}
              layerUrl={layers[level]!.url}
              worldUrl={layers.world!.url}
              chinaUrl={layers["geo:cn"]!.url}
              chinaBounds={
                boundaryManifest.layers["geo:cn"].bounds as [number, number, number, number]
              }
              globe={mode === "globe"}
              locale={locale}
              dark={dark}
              entries={entries}
              selected={selected}
              cameraRequest={camera}
              reducedMotion={reducedMotion}
              unavailable={unavailable}
              label={t.mapLabel}
              loadingLabel={t.loading}
              gestures={{ windows: t.gestureWindows, mac: t.gestureMac, mobile: t.gestureMobile }}
              unavailableLabel={t.unavailable}
              onSelect={choose}
              onHover={hover}
              onReady={onReady}
            />
            <div className="globe-map-controls">
              <Button variant="outline" size="icon" onClick={reset} aria-label={t.reset}>
                <RotateCcwIcon size={17} />
              </Button>
              {trail.length > 1 && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => navigate(trail.slice(0, -1))}
                  aria-label={t.back}
                >
                  <ArrowLeftIcon size={17} />
                </Button>
              )}
            </div>
            <span className="globe-map-location">{title}</span>
          </div>
        )}
        {mode !== "list" && (
          <div className="globe-map-meta">
            <span>
              {t.legend}
              <i className="globe-color-ramp" aria-hidden="true" />
              {t.lower} — {t.higher}
            </span>
            <span>
              <a href="https://www.naturalearthdata.com/">Natural Earth</a> ·{" "}
              <a href="https://datav.aliyun.com/portal/school/atlas/area_selector">
                DataV GeoAtlas
              </a>{" "}
              ·{" "}
              <a href="/maplibre-reference/NOTICE.txt" target="_blank" rel="noreferrer">
                MapLibre
              </a>
            </span>
          </div>
        )}
        <output className="sr-only">
          {selected && preview
            ? `${regionLabel(preview, locale)} · ${preview.count.toLocaleString(locale)} ${t.count}`
            : ""}
        </output>
        <div className="globe-selection">
          <div>
            <span className="globe-selection-label">
              {preview ? regionLabel(preview, locale) : t.select}
            </span>
            {preview ? (
              <span className="globe-selection-count">
                <strong>{preview.count.toLocaleString(locale)}</strong> {t.count}
              </span>
            ) : (
              <span className="globe-selection-hint">{t.hint}</span>
            )}
          </div>
          {preview && (
            <div className="globe-selection-actions">
              {canExplore && (
                <Button onClick={() => navigate([...trail, preview.nodeId])}>
                  {t.explore}
                  <ChevronRightIcon size={15} />
                </Button>
              )}
              <Button asChild variant={canExplore ? "outline" : "default"}>
                <a href={dataUrl(preview)} target="_blank" rel="noreferrer">
                  {t.data}
                  <ArrowUpRightIcon size={15} />
                </a>
              </Button>
              <Button variant="ghost" onClick={reset}>
                {t.clear}
              </Button>
            </div>
          )}
        </div>
      </section>
      <section className="globe-directory" aria-label={t.childList}>
        <div className="globe-directory-header">
          <h2>
            {title}
            <span>{entries.length}</span>
          </h2>
          <label htmlFor={searchId} className="globe-find">
            <SearchIcon size={16} aria-hidden="true" />
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.find}
              aria-label={t.find}
            />
          </label>
        </div>
        {positive.length > 0 && renderEntries(positive)}
        {zero.length > 0 && (
          <details className="globe-zero" open={query ? true : undefined}>
            <summary>
              {t.zero} <span>{zero.length}</span>
            </summary>
            {renderEntries(zero)}
          </details>
        )}
      </section>
      <footer className="globe-provenance">
        <p>{t.snapshotNote}</p>
        <p>
          {t.source}: Natural Earth · DataV GeoAtlas. {t.asOf}{" "}
          {snapshot.capturedAt.replace("T", " ").replace(/\.\d+Z$/u, " UTC")}
        </p>
      </footer>
    </div>
  );
}
