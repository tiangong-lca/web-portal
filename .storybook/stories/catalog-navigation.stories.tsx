import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import { http, HttpResponse } from "msw";
import { CatalogNavigation } from "@/features/catalog/catalog-navigation";
import { RegionExplorer } from "@/features/catalog/region-explorer";
import { RegionMap } from "@/features/catalog/region-map";
import { dictionaries, mobileGlobals, storyLocale } from "../fixtures";
import mapManifest from "@/features/catalog/region-map-manifest.generated.json";
import { geographyName } from "@/i18n/geography";

const meta = {
  title: "Catalog/Hierarchical navigation",
  component: CatalogNavigation,
  subcomponents: { RegionExplorer, RegionMap },
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
  render: (args, { globals }) => {
    const locale = storyLocale(globals);
    const t = dictionaries[locale].Navigation;
    const entries = [
      { code: "CN-AH", count: 142 },
      { code: "CN-GD", count: 328 },
      { code: "CN-SD", count: 211 },
    ].map(({ code, count }) => ({
      nodeId: `geo:${code.toLowerCase()}`,
      code,
      count,
      label: geographyName(code, locale)!,
      countLabel: t.versions.replace("{count}", String(count)),
      hasChildren: true,
      href: `/${locale}/search?explore=region&geoNode=geo:${code.toLowerCase()}`,
    }));
    return (
      <div className="mx-auto max-w-6xl p-6">
        <RegionExplorer
          mapUrl={mapManifest.layers["geo:cn"].url}
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
            breadcrumbs: [{ label: t.world, href: `/${locale}/search?explore=region` }],
            breadcrumbLabel: t.path,
            currentLabel: geographyName("CN", locale),
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
    await expect(canvas.getByRole("link", { name: "浏览下级地区" })).toBeVisible();
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
