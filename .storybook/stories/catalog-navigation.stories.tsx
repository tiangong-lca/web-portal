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
  render: (args, { globals }) => {
    const locale = storyLocale(globals);
    const t = dictionaries[locale].Navigation;
    const entries = [
      {
        nodeId: "geo:cn",
        label: geographyName("CN", locale)!,
        code: "CN",
        count: 142,
        countLabel: t.versions.replace("{count}", "142"),
        hasChildren: true,
        href: `/${locale}/search?explore=region&geoNode=geo:cn`,
      },
    ];
    return (
      <div className="mx-auto max-w-5xl p-6">
        <RegionExplorer
          mapUrl="/maps/story.json"
          entries={entries}
          labels={{
            title: t.geography,
            showMap: t.showMap,
            hideMap: t.hideMap,
            loading: t.mapLoading,
            unavailable: t.mapUnavailable,
            legend: t.mapLegend,
          }}
        >
          <CatalogNavigation
            {...args}
            title={t.geography}
            countDescription={t.counts}
            entries={entries}
            breadcrumbs={[{ label: t.world, href: `/${locale}/search?explore=region` }]}
            breadcrumbLabel={t.path}
            currentLabel={locale === "zh-CN" ? "中国" : "China"}
            unavailableLabel={t.unavailable}
            emptyLabel={t.empty}
            all={{
              label: t.all.replace("{count}", "142"),
              href: `/${locale}/search?geoNode=geo:cn`,
            }}
            direct={{
              label: t.direct.replace("{count}", "12"),
              href: `/${locale}/search?geoNode=geo:cn&geoScope=direct`,
            }}
          />
        </RegionExplorer>
      </div>
    );
  },
} satisfies Meta<typeof CatalogNavigation>;
export default meta;
type Story = StoryObj<typeof meta>;
export const World: Story = {};
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
            noMap: t.noMap,
            skipMap: t.skipMap,
          }}
        >
          <CatalogNavigation
            {...args}
            title={t.geography}
            countDescription={t.counts}
            entries={entries}
            breadcrumbs={[{ label: t.world, href: `/${locale}/search?explore=region` }]}
            breadcrumbLabel={t.path}
            currentLabel={geographyName("CN", locale)}
            unavailableLabel={t.unavailable}
            emptyLabel={t.empty}
          />
        </RegionExplorer>
      </div>
    );
  },
};
export const ChinaMobile: Story = { ...ChinaMap, globals: { ...mobileGlobals, locale: "zh-CN" } };
export const Unavailable: Story = { args: { unavailable: true } };
export const DarkFrench: Story = { globals: { theme: "dark", locale: "fr" } };
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
    await expect(canvas.getByRole("link", { name: "中国: 142 个公开版本" })).toHaveAttribute(
      "href",
      "/zh-CN/search?explore=region&geoNode=geo:cn",
    );
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
