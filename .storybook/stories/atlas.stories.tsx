import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import { usePathname } from "@storybook/nextjs-vite/navigation.mock";
import { AtlasHome } from "@/sites/atlas/home";
import { AtlasHeader, AtlasFooter, AtlasLogo } from "@/sites/atlas/shell";
import { AtlasCatalogRecord } from "@/sites/atlas/catalog-record";
import { PresentationProvider } from "@/sites/presentation";
import { DetailFrame } from "@/sites/detail-frame";
import { SiteHome } from "@/sites/home";
import { TiangongHeader } from "@/sites/tiangong/site-header";
import { TiangongFooter } from "@/sites/tiangong/site-footer";
import { SearchResults } from "../../src/features/catalog/search-results";
import { CompareSelectionProvider } from "../../src/features/compare/selection";
import { atlasCopy } from "@/sites/atlas/copy";
import {
  dictionaries,
  catalogItems,
  resultLabels,
  selectionLabels,
  storyLocale,
} from "../fixtures";

const meta = {
  title: "Brand/Atlas",
  component: AtlasHome,
  subcomponents: {
    AtlasHeader,
    AtlasFooter,
    AtlasLogo,
    AtlasCatalogRecord,
    SearchResults,
    CompareSelectionProvider,
    PresentationProvider,
    DetailFrame,
    SiteHome,
    TiangongHeader,
    TiangongFooter,
  },
  tags: ["!autodocs"],
  parameters: { pageLayout: true },
  globals: { site: "atlas", locale: "en", viewport: { value: "desktop", isRotated: false } },
  args: { locale: "en", summary: null, counts: { process: 12480, flow: 3860 } },
  beforeEach({ globals }) {
    usePathname.mockReturnValue(`/${storyLocale(globals)}`);
    return () => usePathname.mockReset();
  },
  loaders: [
    async ({ globals }) => {
      const locale = storyLocale(globals);
      return { header: await AtlasHeader({ locale }), footer: await AtlasFooter({ locale }) };
    },
  ],
  render: (args, { loaded, globals }) => (
    <>
      {loaded.header}
      <AtlasHome {...args} locale={storyLocale(globals)} />
      {loaded.footer}
    </>
  ),
  play: async ({ canvas, canvasElement, globals }) => {
    const locale = storyLocale(globals);
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent(
      atlasCopy[locale].title,
    );
    await expect(canvas.getByRole("link", { name: atlasCopy[locale].explore })).toHaveAttribute(
      "href",
      `/${locale}/search?v=1`,
    );
    await expect(canvasElement.querySelector(".brand-cinematic-hero")).toBeNull();
    await expect(
      canvas.getByRole("link", { name: dictionaries[locale].Common.databases }),
    ).toHaveAttribute("href", `/${locale}/lca-database`);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);
  },
} satisfies Meta<typeof AtlasHome>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Homepage: Story = {};
export const Dark: Story = { globals: { theme: "dark" } };
export const Chinese: Story = { globals: { locale: "zh-CN" } };
export const MobileFrench: Story = {
  globals: { locale: "fr", viewport: { value: "mobile", isRotated: false } },
};
export const German: Story = { globals: { locale: "de" } };
export const CountsUnavailable: Story = { args: { counts: null } };
export const CatalogRecords: Story = {
  render: (_, { globals, loaded }) => {
    const locale = storyLocale(globals);
    return (
      <>
        {loaded.header}
        <main id="main-content" className="site-shell-container portal-page">
          <h1 className="mb-8 text-3xl">{atlasCopy[locale].explore}</h1>
          <h2 className="sr-only">{dictionaries[locale].Hybrid.resultsTitle}</h2>
          <CompareSelectionProvider locale={locale} labels={selectionLabels(locale)}>
            <SearchResults
              items={catalogItems(locale).map((item, index) => ({
                ...item,
                brand: ["Tiangong LCA", "BAFU", "USLCI"][index]!,
              }))}
              labels={resultLabels(locale)}
              locale={locale}
              selectable
              siteOrigin="https://atlas.example"
            />
          </CompareSelectionProvider>
        </main>
        {loaded.footer}
      </>
    );
  },
  play: async ({ canvas, userEvent, canvasElement }) => {
    await expect(canvasElement.querySelectorAll(".atlas-record")).toHaveLength(3);
    const checkbox = canvas.getAllByRole("checkbox")[0]!;
    const label = checkbox.closest("label")!;
    // A full selection label must fit a compact control, never a vertical gutter.
    await expect(label.getBoundingClientRect().height).toBeLessThanOrEqual(48);
    const actions = canvasElement.querySelector(".atlas-record .catalog-result-actions")!;
    await expect(actions.getBoundingClientRect().height).toBeLessThanOrEqual(48);
    await userEvent.click(checkbox);
    await expect(checkbox).toBeChecked();
    await userEvent.keyboard("[Space]");
    await expect(checkbox).not.toBeChecked();
    await userEvent.click(label);
    await expect(checkbox).toBeChecked();
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};
export const MobileRecords: Story = {
  ...CatalogRecords,
  globals: { locale: "de", viewport: { value: "mobile", isRotated: false } },
};
export const ChineseRecords: Story = {
  ...CatalogRecords,
  globals: { locale: "zh-CN" },
};
export const ChineseMobileRecords: Story = {
  ...CatalogRecords,
  globals: { locale: "zh-CN", viewport: { value: "mobile", isRotated: false } },
};
export const FrenchDarkRecords: Story = {
  ...CatalogRecords,
  globals: { locale: "fr", theme: "dark" },
};
