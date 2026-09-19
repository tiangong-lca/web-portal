import { CatalogFacetResults } from "@/features/catalog/catalog-facet-results";
import { CatalogKindSwitch } from "@/features/catalog/catalog-kind-switch";
import { CatalogResultsToolbar } from "@/features/catalog/catalog-results-toolbar";
import { CatalogSearchInput } from "@/features/catalog/catalog-search-input";
import { dictionaries } from "../fixtures";
import { SearchResults } from "@/features/catalog/search-results";
import { catalogItems, resultLabels } from "../fixtures";
import { expect } from "storybook/test";
import { CatalogSearchTeaser } from "@/components/brand/catalog-search-teaser";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CatalogSearchEntry } from "@/components/brand/catalog-search-entry";
import { mobileGlobals, storyLocale } from "../fixtures";

const meta = {
  title: "Brand/Catalog Search Entry",
  component: CatalogSearchEntry,
  subcomponents: {
    CatalogSearchTeaser,
    CatalogKindSwitch,
    CatalogFacetResults,
    CatalogResultsToolbar,
    CatalogSearchInput,
    SearchResults,
  },
  args: { locale: "zh-CN", counts: { process: 17299, flow: 83012 } },
  parameters: { pageLayout: true },
  play: async ({ args, canvasElement }) => {
    if (args.number) {
      const entry = canvasElement.querySelector(".catalog-search-teaser");
      await expect(entry).toHaveAttribute("href", expect.stringContaining("/search?v=1"));
      await expect(canvasElement.querySelector("input[type=search]")).toBeNull();
    } else {
      await expect(canvasElement.querySelector("input[type=search]")).toBeVisible();
    }
  },
  loaders: [
    async ({ args, globals }) => ({
      entry: await CatalogSearchEntry({ ...args, locale: storyLocale(globals) }),
    }),
  ],
  render: (args, { loaded, globals }) => (
    <main
      className="brand-home catalog-search-initial catalog-search-page"
      lang={storyLocale(globals)}
    >
      <div className="brand-container">{loaded.entry}</div>
    </main>
  ),
} satisfies Meta<typeof CatalogSearchEntry>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Homepage: Story = { args: { number: "02" } };
export const InitialSearch: Story = {};
export const CountsUnavailable: Story = { args: { counts: null } };
export const Dark: Story = { args: { number: "02" }, globals: { theme: "dark" } };
export const MobileGerman: Story = {
  args: { number: "02" },
  globals: { ...mobileGlobals, locale: "de" },
};

export const ExploringProcesses: Story = {
  render: (_, { globals }) => {
    const locale = storyLocale(globals);
    const m = dictionaries[locale];
    return (
      <main className="brand-home catalog-search-results catalog-search-page">
        <div className="brand-container">
          <header className="catalog-results-intro">
            <h1>{m.Common.catalog}</h1>
          </header>
          <search className="brand-search">
            <CatalogSearchInput submitLabel={m.Home.searchButton} aria-label={m.Home.searchLabel} />
          </search>
          <CatalogResultsToolbar
            titleId="exploring-title"
            title={m.Common.catalog}
            scope={
              <CatalogKindSwitch
                value="process"
                label={m.Search.objectType}
                labels={{
                  process: m.Common.process,
                  flow: m.Common.flow,
                  region: m.Search.region,
                  source: m.Search.source,
                }}
                hrefs={{
                  process: "?explore=process",
                  flow: "?explore=flow",
                  region: "?explore=region",
                  source: "?explore=source",
                }}
              />
            }
            actions={null}
          />
          <SearchResults
            items={catalogItems(locale).filter((item) => item.kind === "process")}
            labels={resultLabels(locale)}
            locale={locale}
            siteOrigin="https://portal.example"
          />
        </div>
      </main>
    );
  },
};
export const ExploringMobile: Story = { ...ExploringProcesses, globals: mobileGlobals };

export const MatchingRegions: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link")).toHaveAttribute(
      "href",
      expect.stringContaining("q=electricity"),
    );
  },
  render: (_, { globals }) => (
    <CatalogFacetResults
      dimension="region"
      locale={storyLocale(globals)}
      emptyLabel={dictionaries[storyLocale(globals)].Search.emptyDescription}
      input={{
        kind: "process",
        query: "electricity",
        filters: {},
        sort: "relevance",
        cursor: null,
        limit: 10,
      }}
      facets={{
        schemaVersion: "portal.public-facets.v2",
        kind: "all",
        queryFingerprint: "0".repeat(64),
        groups: [
          {
            id: "geography",
            label: [],
            hasMore: false,
            values: [{ value: "CN", label: [], count: 12 }],
          },
        ],
      }}
    />
  ),
};
