"use client";

import dynamic from "next/dynamic";
import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { NavigationEntry } from "./catalog-navigation";

const Map = dynamic(() => import("./region-map").then((module) => module.RegionMap));
function subscribe(callback: () => void) {
  const query = window.matchMedia("(min-width: 768px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const desktop = () => window.matchMedia("(min-width: 768px)").matches;

/** The list always remains server-rendered, including mobile and map-error states.
 * @import import { RegionExplorer } from "@/features/catalog/region-explorer";
 */
export function RegionExplorer({
  children,
  mapUrl,
  entries,
  labels,
}: {
  children: ReactNode;
  mapUrl?: string;
  entries: NavigationEntry[];
  labels: {
    title: string;
    showMap: string;
    hideMap: string;
    loading: string;
    unavailable: string;
    legend: string;
    noMap?: string;
    skipMap?: string;
  };
}) {
  const isDesktop = useSyncExternalStore(subscribe, desktop, () => false);
  const [choice, setChoice] = useState<boolean | null>(null);
  const listId = useId();
  const visible = Boolean(mapUrl && (choice ?? isDesktop));
  return (
    <div className="flex flex-col gap-4">
      {mapUrl && (
        <Button
          className="catalog-map-toggle self-start"
          variant="outline"
          type="button"
          aria-expanded={visible}
          onClick={() => setChoice(!visible)}
        >
          {visible ? labels.hideMap : labels.showMap}
        </Button>
      )}
      {!mapUrl && (
        <p className="text-muted-foreground text-sm">{labels.noMap ?? labels.unavailable}</p>
      )}
      {mapUrl && labels.skipMap && (
        <a className="sr-only focus:not-sr-only" href={`#${listId}`}>
          {labels.skipMap}
        </a>
      )}
      <div className={mapUrl && (visible || choice === null) ? "catalog-region-layout" : ""}>
        {visible && mapUrl && (
          <Map
            url={mapUrl}
            entries={entries}
            title={labels.title}
            loadingLabel={labels.loading}
            unavailableLabel={labels.unavailable}
            legend={labels.legend}
          />
        )}
        {!visible && choice === null && mapUrl && (
          <div className="catalog-map-placeholder hidden min-h-80 md:block" aria-hidden="true" />
        )}
        <div id={listId} tabIndex={-1}>
          {children}
        </div>
      </div>
      <noscript>
        <style>
          {
            ".catalog-map-toggle,.catalog-map-placeholder{display:none}.catalog-region-layout{display:block}"
          }
        </style>
      </noscript>
    </div>
  );
}
