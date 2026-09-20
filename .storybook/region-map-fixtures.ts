import { dictionaries } from "./fixtures";
import snapshot from "./maplibre-reference/counts.generated.json";
import type { PortalLocale } from "@/i18n/routing";
import type { RegionMapLabels } from "@/features/catalog/region-maplibre";
import type { NavigationEntry } from "@/features/catalog/catalog-navigation";

export function regionMapLabels(locale: PortalLocale): RegionMapLabels {
  const t = dictionaries[locale].Navigation;
  return {
    title: t.interactiveMap,
    loading: t.mapLoading,
    unavailable: t.mapUnavailable,
    select: t.selectRegion,
    explore: t.exploreRegion,
    viewData: t.viewData,
    clear: t.clearSelection,
    reset: t.mapReset,
    back: t.mapBack,
    retry: t.mapRetry,
    smallRegions: t.mapSmallRegions,
    shortcutNames: { TW: t.mapTaiwan, HK: t.mapHongKong, MO: t.mapMacao },
    gestureWindows: t.mapGestureWindows,
    gestureMac: t.mapGestureMac,
    gestureMobile: t.mapGestureMobile,
    information: {
      count: t.counts,
      lower: t.mapFewer,
      higher: t.mapMore,
      information: t.mapInformation,
      explanation: t.mapExplanation,
      sources: t.mapSources,
    },
  };
}
export function regionMapEntries(locale: PortalLocale, layer: string): NavigationEntry[] {
  const branches: Record<
    string,
    {
      entries: {
        nodeId: string;
        code: string;
        count: number;
        labels: Partial<Record<PortalLocale, string>>;
        hasChildren: boolean;
        dataUrl: string;
      }[];
    }
  > = snapshot.branches;
  return branches[layer]!.entries.map((entry) => {
    const url = new URL(entry.dataUrl);
    url.pathname = `/${locale}/search`;
    return {
      nodeId: entry.nodeId,
      code: entry.code,
      label: entry.labels[locale] ?? entry.code,
      count: entry.count,
      countLabel: dictionaries[locale].Navigation.versions.replace(
        "{count}",
        entry.count.toLocaleString(locale),
      ),
      hasChildren: entry.hasChildren,
      href: `${url.pathname}${url.search}`,
    };
  });
}
