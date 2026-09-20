import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, waitFor } from "storybook/test";
import { http, HttpResponse } from "msw";
import { CatalogResultsToolbar } from "@/features/catalog/catalog-results-toolbar";
import { CatalogKindSwitch } from "@/features/catalog/catalog-kind-switch";
import { Button } from "@/components/ui/button";
import { ResponsiveFacets } from "@/features/catalog/responsive-facets";
import { CatalogNavigation } from "@/features/catalog/catalog-navigation";
import { RegionExplorer } from "@/features/catalog/region-explorer";
import { RegionMap } from "@/features/catalog/region-map";
import { dictionaries, mobileGlobals, storyLocale } from "../fixtures";
import mapManifest from "@/features/catalog/region-map-manifest.generated.json";
import { geographyName } from "@/i18n/geography";

const meta = {
  title: "Catalog/Hierarchical navigation",
  component: CatalogNavigation,
  subcomponents: {
    RegionExplorer,
    RegionMap,
    CatalogResultsToolbar,
    CatalogKindSwitch,
    ResponsiveFacets,
    Button,
  },
  tags: ["!autodocs"],
  args: {
    unavailable: false,
    compact: false,
    title: "Regions",
    countDescription: "Public versions",
    entries: [],
    breadcrumbs: [],
    breadcrumbLabel: "Path",
    unavailableLabel: "Unavailable",
    emptyLabel: "No children",
  },
  parameters: {
    msw: {
      handlers: [
        http.get("*/maps/story.json", () =>
          HttpResponse.json({
            viewBox: "0 0 100 70",
            features: [
              { boundaryId: "synthetic-china", nodeId: "geo:cn", path: "M10 10H60V50H10Z" },
              { boundaryId: "synthetic-other", nodeId: null, path: "M70 10H90V50H70Z" },
            ],
          }),
        ),
      ],
    },
  },
  render: (args, { globals, parameters }) => {
    const locale = storyLocale(globals);
    const t = dictionaries[locale].Navigation;
    const entries = args.entries.length
      ? args.entries
      : [
          {
            nodeId: "geo:cn",
            label: geographyName("CN", locale)!,
            code: "CN",
            count: 142,
            countLabel: t.versions.replace("{count}", "142"),
            hasChildren: true,
            href: `/${locale}/search?explore=region&geoNode=geo:cn`,
          },
          {
            nodeId: "geo:aq",
            label: geographyName("AQ", locale) ?? "AQ",
            code: "AQ",
            count: 0,
            countLabel: t.versions.replace("{count}", "0"),
            hasChildren: false,
            href: `/${locale}/search?geoNode=geo:aq`,
          },
        ];
    const localizedEntries = entries.map((entry) => ({
      ...entry,
      label: geographyName(entry.code, locale) ?? entry.label,
      countLabel: t.versions.replace("{count}", entry.count.toLocaleString(locale)),
      href: entry.href.replace(/^\/(en|zh-CN|de|fr)\//u, `/${locale}/`),
    }));
    return (
      <div className="mx-auto max-w-5xl p-6">
        <RegionExplorer
          mapUrl={parameters.regionMapUrl ?? "/maps/story.json"}
          entries={localizedEntries}
          labels={{
            title: t.geography,
            showMap: t.showMap,
            hideMap: t.hideMap,
            loading: t.mapLoading,
            unavailable: t.mapUnavailable,
            legend: t.mapLegend,
            selectRegion: t.selectRegion,
            exploreRegion: t.exploreRegion,
            viewData: t.viewData,
            clearSelection: t.clearSelection,
            navigating: t.navigating,
            zeroRegions: t.zeroRegions,
          }}
          navigation={{
            ...args,
            title: t.geography,
            countDescription: t.counts,
            entries: localizedEntries,
            breadcrumbs: [{ label: t.world, href: `/${locale}/search?explore=region` }],
            breadcrumbLabel: t.path,
            currentLabel: parameters.regionMapUrl ? undefined : geographyName("CN", locale),
            unavailableLabel: t.unavailable,
            emptyLabel: t.empty,
            all: parameters.regionMapUrl
              ? undefined
              : {
                  label: t.all.replace("{count}", "142"),
                  href: `/${locale}/search?geoNode=geo:cn`,
                },
            direct: parameters.regionMapUrl
              ? undefined
              : {
                  label: t.direct.replace("{count}", "12"),
                  href: `/${locale}/search?geoNode=geo:cn&geoScope=direct`,
                },
          }}
        />
      </div>
    );
  },
} satisfies Meta<typeof CatalogNavigation>;
export default meta;
type Story = StoryObj<typeof meta>;
export const World: Story = {
  parameters: { regionMapUrl: mapManifest.layers.world.url },
  args: {
    entries: [
      { code: "CN", count: 13765, hasChildren: true },
      { code: "US", count: 1840 },
      { code: "DE", count: 922 },
      { code: "AU", count: 438 },
      { code: "BR", count: 370 },
      { code: "IN", count: 655 },
      { code: "JP", count: 288 },
      { code: "ZA", count: 110 },
      { code: "CA", count: 312 },
      { code: "FR", count: 531 },
      { code: "GLO", count: 2267 },
      { code: "AQ", count: 0 },
    ].map(({ code, count, hasChildren }) => ({
      nodeId: `geo:${code.toLowerCase()}`,
      code,
      count,
      label: geographyName(code, "en") ?? code,
      countLabel: `${count.toLocaleString("en")} public versions`,
      hasChildren: !!hasChildren,
      href: `/en/search?explore=${hasChildren ? "region" : "process"}&geoNode=geo:${code.toLowerCase()}`,
    })),
  },
};
export const ChinaMap: Story = {
  render: (args, { globals, parameters }) => {
    const locale = storyLocale(globals);
    const t = dictionaries[locale].Navigation;
    const provincial = parameters.mapLayer === "geo:cn-ah";
    const layerKey = provincial ? "geo:cn-ah" : "geo:cn";
    const entries = (
      provincial
        ? [{ code: "CN-AH-HFE", count: 142 }]
        : [
            { code: "CN-AH", count: 142 },
            { code: "CN-GD", count: 328 },
            { code: "CN-SD", count: 211 },
          ]
    ).map(({ code, count }) => ({
      nodeId: `geo:${code.toLowerCase()}`,
      code,
      count,
      label: geographyName(code, locale)!,
      countLabel: t.versions.replace("{count}", String(count)),
      hasChildren: !provincial,
      href: `/${locale}/search?explore=${provincial ? "process" : "region"}&geoNode=geo:${code.toLowerCase()}`,
    }));
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
        {parameters.fullControls && (
          <div className="catalog-control-bar">
            <CatalogResultsToolbar
              title={dictionaries[locale].Common.catalogCompact}
              hideTitle
              titleId="region-results"
              scope={
                <CatalogKindSwitch
                  value="region"
                  label={t.geography}
                  labels={{
                    process: dictionaries[locale].Common.process,
                    flow: dictionaries[locale].Common.flow,
                    region: t.geography,
                  }}
                  hrefs={{
                    process: `/${locale}/search?kind=process`,
                    flow: `/${locale}/search?kind=flow`,
                    region: `/${locale}/search?explore=region`,
                  }}
                />
              }
              actions={
                <ResponsiveFacets
                  drawer
                  labels={{
                    title: dictionaries[locale].Search.facets,
                    description: dictionaries[locale].Search.filtersDescription,
                    close: dictionaries[locale].Common.close,
                  }}
                >
                  <p>{dictionaries[locale].Search.region}</p>
                </ResponsiveFacets>
              }
            />
            <div className="catalog-applied-filters">
              <Button variant="outline">
                {dictionaries[locale].Search.region}: {geographyName("CN", locale)}
              </Button>
              <Button variant="ghost">{dictionaries[locale].Search.clearFilters}</Button>
            </div>
          </div>
        )}

        <RegionExplorer
          mapUrl={mapManifest.layers[layerKey].url}
          entries={entries}
          labels={{
            title: t.geography,
            showMap: t.showMap,
            hideMap: t.hideMap,
            loading: t.mapLoading,
            unavailable: t.mapUnavailable,
            legend: t.mapLegend,
            selectRegion: t.selectRegion,
            exploreRegion: t.exploreRegion,
            viewData: t.viewData,
            clearSelection: t.clearSelection,
            navigating: t.navigating,
            zeroRegions: t.zeroRegions,
            noMap: t.noMap,
            skipMap: t.skipMap,
          }}
          navigation={{
            ...args,
            title: t.geography,
            countDescription: t.counts,
            entries: entries,
            breadcrumbs: [
              { label: t.world, href: `/${locale}/search?explore=region` },
              ...(provincial
                ? [
                    {
                      label: geographyName("CN", locale)!,
                      href: `/${locale}/search?explore=region&geoNode=geo:cn`,
                    },
                  ]
                : []),
            ],
            breadcrumbLabel: t.path,
            currentLabel: geographyName(provincial ? "CN-AH" : "CN", locale),
            all: {
              label: t.all.replace("{count}", "681"),
              href: `/${locale}/search?geoNode=${layerKey}`,
              active: true,
            },
            direct: {
              label: t.direct.replace("{count}", "12"),
              href: `/${locale}/search?geoNode=${layerKey}&geoScope=direct`,
            },
            unavailableLabel: t.unavailable,
            emptyLabel: t.empty,
          }}
        />
      </div>
    );
  },
};
export const ChinaMobile: Story = { ...ChinaMap, globals: { ...mobileGlobals, locale: "zh-CN" } };
export const Unavailable: Story = { args: { unavailable: true } };
export const DarkFrench: Story = {
  globals: { theme: "dark", locale: "fr" },
  play: async ({ canvas, userEvent }) => {
    const zero = canvas.getByText(/Régions sans données correspondantes/);
    const link = canvas.getByRole("link", { name: /Antarctique/, hidden: true });
    await expect(link).not.toBeVisible();
    await userEvent.click(zero);
    await expect(canvas.getByRole("link", { name: /Antarctique/ })).toBeVisible();
  },
};
export const MobileChinese: Story = {
  globals: { ...mobileGlobals, locale: "zh-CN" },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole("button", { name: "显示地图" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await userEvent.click(canvas.getByRole("button", { name: "显示地图" }));
    await expect(canvas.getByRole("button", { name: "收起地图" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(await canvas.findByRole("group", { name: "按地区浏览" })).toBeVisible();
    const china = canvas.getByRole("link", { name: "中国: 142 个公开版本" });
    await userEvent.click(china);
    const action = canvas.getByRole("link", { name: "浏览下级地区" });
    await expect(action).toBeVisible();
    await expect(action).toHaveFocus();
    await userEvent.click(canvas.getByRole("button", { name: "取消选择" }));
    await expect(canvas.queryByRole("link", { name: "浏览下级地区" })).not.toBeInTheDocument();
    await expect(china).toHaveAttribute("href", "/zh-CN/search?explore=region&geoNode=geo:cn");
  },
};
export const MapFailure: Story = {
  parameters: {
    msw: {
      handlers: [http.get("*/maps/story.json", () => HttpResponse.json({}, { status: 503 }))],
    },
  },
  play: async ({ canvas, globals }) => {
    const t = dictionaries[storyLocale(globals)].Navigation;
    await expect(await canvas.findByText(t.mapUnavailable)).toBeVisible();
    await expect(canvas.getByRole("navigation", { name: t.path })).toBeVisible();
  },
};

export const UnmappedLocations: Story = {
  globals: { locale: "zh-CN" },
  render: (args, { globals }) => {
    const locale = storyLocale(globals);
    const t = dictionaries[locale].Navigation;
    return (
      <div className="max-w-xl p-6">
        <CatalogNavigation
          {...args}
          title={t.geography}
          countDescription={t.counts}
          breadcrumbLabel={t.path}
          breadcrumbs={[
            {
              label: geographyName("CN", locale)!,
              href: `/${locale}/search?explore=region&geoNode=geo:cn`,
            },
          ]}
          currentLabel={geographyName("CN-AH", locale)}
          entries={[
            {
              nodeId: "geo:~example",
              code: "CN-AH-ZX",
              label: "CN-AH-ZX",
              description: t.ambiguousRegion,
              count: 2,
              countLabel: t.versions.replace("{count}", "2"),
              hasChildren: false,
              href: `/${locale}/search?geo=CN-AH-ZX`,
            },
          ]}
        />
      </div>
    );
  },
  play: async ({ canvas, globals }) => {
    const t = dictionaries[storyLocale(globals)].Navigation;
    await expect(canvas.getByText(t.ambiguousRegion)).toBeVisible();
    await expect(canvas.getByRole("link", { name: /CN-AH-ZX/ })).toHaveAttribute(
      "href",
      "/zh-CN/search?geo=CN-AH-ZX",
    );
  },
};

export const RegionControls: Story = { ...ChinaMap, parameters: { fullControls: true } };
export const RegionControlsMobile: Story = {
  ...RegionControls,
  globals: { ...mobileGlobals, locale: "zh-CN" },
};
export const RegionControlsGerman: Story = { ...RegionControls, globals: { locale: "de" } };

export const ProvinceBasemap: Story = { ...ChinaMap, parameters: { mapLayer: "geo:cn-ah" } };
export const ProvinceBasemapDark: Story = {
  ...ProvinceBasemap,
  globals: { theme: "dark", locale: "fr" },
};
export const ChinaBasemapDark: Story = { ...ChinaMap, globals: { theme: "dark", locale: "zh-CN" } };

export const ContinuousZoom: Story = {
  globals: { locale: "zh-CN" },
  render: function ZoomJourney(_args, { globals }) {
    const [level, setLevel] = useState<"world" | "geo:cn" | "geo:cn-ah">("world");
    const locale = storyLocale(globals);
    const t = dictionaries[locale].Navigation;
    const steps = [
      { key: "world" as const, label: t.world },
      { key: "geo:cn" as const, label: geographyName("CN", locale)! },
      { key: "geo:cn-ah" as const, label: geographyName("CN-AH", locale)! },
    ];
    const code = level === "world" ? "CN" : level === "geo:cn" ? "CN-AH" : "CN-AH-HFE";
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
        <div className="flex flex-wrap gap-2">
          {steps.map((step) => (
            <Button
              key={step.key}
              variant={level === step.key ? "default" : "outline"}
              aria-pressed={level === step.key}
              onClick={() => setLevel(step.key)}
            >
              {step.label}
            </Button>
          ))}
        </div>
        <RegionMap
          url={mapManifest.layers[level].url}
          title={t.geography}
          loadingLabel={t.mapLoading}
          unavailableLabel={t.mapUnavailable}
          legend={t.mapLegend}
          selectLabel={t.selectRegion}
          exploreLabel={t.exploreRegion}
          viewDataLabel={t.viewData}
          clearLabel={t.clearSelection}
          entries={[
            {
              nodeId: `geo:${code.toLowerCase()}`,
              code,
              label: geographyName(code, locale)!,
              count: 142,
              countLabel: t.versions.replace("{count}", "142"),
              hasChildren: level !== "geo:cn-ah",
              href: `/${locale}/search?explore=region&geoNode=geo:${code.toLowerCase()}`,
            },
          ]}
        />
      </div>
    );
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      await canvas.findByRole("link", { name: /^中国:/ }, { timeout: 5000 }),
    ).toBeVisible();
    const svg = canvasElement.querySelector("svg")!;
    const settled = async (level: "world" | "geo:cn" | "geo:cn-ah") => {
      // Data links deliberately leave the accessibility tree while the camera moves.
      // Wait for both geometry and animation before querying them, including on cold CI.
      await waitFor(
        async () => {
          await expect(svg).toHaveAttribute("data-layer-url", mapManifest.layers[level].url);
          await expect(svg).not.toHaveAttribute("data-camera-moving");
        },
        { timeout: 5000 },
      );
    };
    const worldWindow = svg.getAttribute("viewBox");
    await userEvent.click(canvas.getByRole("button", { name: /^中国$/ }));
    await settled("geo:cn");
    await expect(canvas.getByRole("link", { name: /安徽/ })).toBeVisible();
    await expect(canvasElement.querySelector("svg")).toBe(svg);
    await expect(svg.getAttribute("viewBox")).not.toBe(worldWindow);
    await userEvent.click(canvas.getByRole("button", { name: /安徽/ }));
    await settled("geo:cn-ah");
    await expect(canvas.getByRole("link", { name: /合肥/ })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: /^世界$/ }));
    await settled("world");
    await expect(canvas.getByRole("link", { name: /^中国:/ })).toBeVisible();
    await expect(svg).toHaveAttribute("viewBox", worldWindow!);
  },
};
