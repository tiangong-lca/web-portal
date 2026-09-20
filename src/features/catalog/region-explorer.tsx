"use client";

import { PendingFeedback } from "@/components/shell/navigation-feedback";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { isPortalLocale, defaultLocale } from "@/i18n/routing";
import { RegionMapLoading } from "./region-map-loading";
import type { RegionMapAssets } from "./region-maplibre-types";
import "./region-maplibre.css";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
  type MouseEvent,
} from "react";
import {
  CatalogNavigation,
  type CatalogNavigationProps,
  type NavigationEntry,
} from "./catalog-navigation";

const Map = dynamic(() => import("./region-maplibre").then((module) => module.RegionMapLibre), {
  ssr: false,
  loading: () => <RegionMapLoading whole />,
});
function subscribe(callback: () => void) {
  const query = window.matchMedia("(min-width: 768px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const desktop = () => window.matchMedia("(min-width: 768px)").matches;

/** A persistent map canvas with native navigation and an equivalent server-rendered list.
 * @import import { RegionExplorer } from "@/features/catalog/region-explorer";
 */
export function RegionExplorer({
  children,
  mapAssets,
  entries,
  navigation,
  labels,
}: {
  children?: ReactNode;
  mapAssets?: RegionMapAssets;
  entries: NavigationEntry[];
  navigation?: CatalogNavigationProps;
  labels: {
    title: string;
    showMap: string;
    hideMap: string;
    loading: string;
    unavailable: string;
    legend: string;
    noMap?: string;
    skipMap?: string;
    selectRegion: string;
    exploreRegion: string;
    viewData: string;
    clearSelection: string;
    navigating: string;
    zeroRegions: string;
  };
}) {
  const router = useRouter();
  const t = useTranslations("Navigation");
  const language = useLocale();
  const locale = isPortalLocale(language) ? language : defaultLocale;
  const isDesktop = useSyncExternalStore(subscribe, desktop, () => false);
  const [choice, setChoice] = useState<"globe" | "flat" | "list" | null>(null);
  const [pending, startTransition] = useTransition();
  const focusAfterNavigation = useRef(false);
  const frame = useRef<HTMLDivElement>(null);
  const listId = useId();
  const mode = choice ?? (isDesktop ? "globe" : "list");
  const visible = Boolean(mapAssets && mode !== "list");

  // Native links remain intact (including modified clicks and no-JS). Only region-to-region
  // navigation is enhanced, using the existing RSC request/cache instead of a second API.
  function navigate(event: MouseEvent<HTMLElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a");
    if (
      !anchor ||
      anchor.closest("svg") ||
      anchor.hasAttribute("download") ||
      anchor.getAttribute("target")
    )
      return;
    const href = anchor.getAttribute("href");
    if (!href) return;
    const url = new URL(href, window.location.href);
    if (
      url.origin !== window.location.origin ||
      !/^\/(zh-CN|en|de|fr)\/search$/u.test(url.pathname) ||
      url.searchParams.get("explore") !== "region"
    )
      return;
    event.preventDefault();
    if (url.href === window.location.href) {
      frame.current?.querySelector("h2")?.focus({ preventScroll: true });
      return;
    }
    focusAfterNavigation.current = true;
    startTransition(() =>
      router.push(`${url.pathname}${url.search}${url.hash}`, { scroll: false }),
    );
  }
  useEffect(() => {
    if (!pending && focusAfterNavigation.current) {
      focusAfterNavigation.current = false;
      frame.current?.querySelector("h2")?.focus({ preventScroll: true });
      // A region near the bottom of a long list should return to the new level's path/map.
      if (frame.current && frame.current.getBoundingClientRect().top < 0)
        frame.current.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }, [pending]);

  const controls = (
    <div className="catalog-map-toolbar">
      {mapAssets && (
        <ToggleGroup
          className="catalog-map-mode"
          type="single"
          variant="outline"
          value={mode}
          aria-label={t("mapView")}
          onValueChange={(value) => {
            if (value === "globe" || value === "flat" || value === "list") setChoice(value);
          }}
        >
          <ToggleGroupItem value="globe">{t("mapGlobe")}</ToggleGroupItem>
          <ToggleGroupItem value="flat">{t("mapFlat")}</ToggleGroupItem>
          <ToggleGroupItem value="list">{t("mapList")}</ToggleGroupItem>
        </ToggleGroup>
      )}
      <span className="catalog-region-progress sr-only">{pending ? labels.navigating : ""}</span>
    </div>
  );
  const visual = (
    <div className="catalog-region-visual">
      {!mapAssets && (
        <p className="text-muted-foreground text-sm">{labels.noMap ?? labels.unavailable}</p>
      )}
      {visible && mapAssets && labels.skipMap && (
        <a className="sr-only focus:not-sr-only" href={`#${listId}`}>
          {labels.skipMap}
        </a>
      )}
      {visible && mapAssets && (
        <Map
          assets={mapAssets}
          entries={entries}
          locale={locale}
          globe={mode === "globe"}
          parentHref={navigation?.breadcrumbs.at(-1)?.href}
          labels={{
            title: t("interactiveMap"),
            loading: labels.loading,
            unavailable: labels.unavailable,
            select: labels.selectRegion,
            explore: labels.exploreRegion,
            viewData: labels.viewData,
            clear: labels.clearSelection,
            reset: t("mapReset"),
            back: t("mapBack"),
            retry: t("mapRetry"),
            smallRegions: t("mapSmallRegions"),
            shortcutNames: { TW: t("mapTaiwan"), HK: t("mapHongKong"), MO: t("mapMacao") },
            gestureWindows: t("mapGestureWindows"),
            gestureMac: t("mapGestureMac"),
            gestureMobile: t("mapGestureMobile"),
            information: {
              count: t("counts"),
              lower: t("mapFewer"),
              higher: t("mapMore"),
              information: t("mapInformation"),
              explanation: t("mapExplanation"),
              sources: t("mapSources"),
            },
          }}
        />
      )}
      {!visible && choice === null && mapAssets && (
        <div className="region-maplibre-placeholder hidden md:block" aria-hidden="true" />
      )}
      <PendingFeedback pending={pending} />
      <span id={listId} tabIndex={-1} />
    </div>
  );
  return (
    <div
      ref={frame}
      className="catalog-region-explorer"
      onClickCapture={navigate}
      data-pending={pending || undefined}
    >
      {navigation ? (
        <CatalogNavigation
          {...navigation}
          actions={controls}
          pathAsHeading
          headingLabel={
            navigation.currentLabel ? `${labels.title}: ${navigation.currentLabel}` : labels.title
          }
          zeroCountLabel={labels.zeroRegions}
          visual={visual}
        />
      ) : (
        <>
          {controls}
          {visual}
        </>
      )}
      {children}
      <noscript>
        <style>{".catalog-map-mode,.region-maplibre-placeholder{display:none}"}</style>
      </noscript>
    </div>
  );
}
