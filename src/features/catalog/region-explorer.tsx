"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
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
import { Button } from "@/components/ui/button";
import {
  CatalogNavigation,
  type CatalogNavigationProps,
  type NavigationEntry,
} from "./catalog-navigation";

const Map = dynamic(() => import("./region-map").then((module) => module.RegionMap));
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
  mapUrl,
  entries,
  navigation,
  labels,
}: {
  children?: ReactNode;
  mapUrl?: string;
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
  const isDesktop = useSyncExternalStore(subscribe, desktop, () => false);
  const [choice, setChoice] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();
  const focusAfterNavigation = useRef(false);
  const frame = useRef<HTMLDivElement>(null);
  const listId = useId();
  const visible = Boolean(mapUrl && (choice ?? isDesktop));

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

  const visual = (
    <div className="catalog-region-visual">
      <div className="catalog-map-toolbar">
        {mapUrl && (
          <Button
            className="catalog-map-toggle"
            variant="outline"
            type="button"
            aria-expanded={visible}
            onClick={() => setChoice(!visible)}
          >
            {visible ? labels.hideMap : labels.showMap}
          </Button>
        )}
        <output className="catalog-region-progress" aria-live="polite">
          {pending ? labels.navigating : ""}
        </output>
      </div>
      {!mapUrl && (
        <p className="text-muted-foreground text-sm">{labels.noMap ?? labels.unavailable}</p>
      )}
      {mapUrl && labels.skipMap && (
        <a className="sr-only focus:not-sr-only" href={`#${listId}`}>
          {labels.skipMap}
        </a>
      )}
      {visible && mapUrl && (
        <Map
          url={mapUrl}
          entries={entries}
          title={labels.title}
          loadingLabel={labels.loading}
          unavailableLabel={labels.unavailable}
          legend={labels.legend}
          selectLabel={labels.selectRegion}
          exploreLabel={labels.exploreRegion}
          viewDataLabel={labels.viewData}
          clearLabel={labels.clearSelection}
        />
      )}
      {!visible && choice === null && mapUrl && (
        <div className="catalog-map-placeholder hidden min-h-80 md:block" aria-hidden="true" />
      )}
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
          headingLabel={
            navigation.currentLabel ? `${labels.title}: ${navigation.currentLabel}` : labels.title
          }
          zeroCountLabel={labels.zeroRegions}
          visual={visual}
        />
      ) : (
        visual
      )}
      {children}
      <noscript>
        <style>{".catalog-map-toggle,.catalog-map-placeholder{display:none}"}</style>
      </noscript>
    </div>
  );
}
