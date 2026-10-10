import { CatalogCopyIdentity } from "../../src/features/catalog/catalog-copy-identity";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import {
  CatalogResultList,
  CatalogResultRow,
  CatalogResultSummary,
} from "../../src/features/catalog/catalog-result-row";
import { SearchResults } from "../../src/features/catalog/search-results";
import { CompareSelectionProvider } from "../../src/features/compare/selection";
import {
  catalogItems,
  dictionaries,
  mobileGlobals,
  resultLabels,
  selectionLabels,
  storyLocale,
} from "../fixtures";

const meta = {
  title: "Catalog/Search results",
  component: SearchResults,
  subcomponents: {
    CompareSelectionProvider,
    CatalogCopyIdentity,
    CatalogResultList,
    CatalogResultRow,
    CatalogResultSummary,
  },
  tags: ["!autodocs"],
  argTypes: { items: { control: false }, labels: { control: false }, locale: { control: false } },
  args: {
    items: catalogItems("zh-CN"),
    labels: resultLabels("zh-CN"),
    locale: "zh-CN",
    siteOrigin: "https://portal.example",
    selectable: false,
  },
  parameters: {
    docs: {
      description: {
        component:
          "Live results and design references share the list, result row, and authored summary. Data adapters supply supported actions and pagination.",
      },
    },
  },
  render: (args, { globals, parameters }) => {
    const locale = storyLocale(globals);
    const items = parameters.empty ? [] : catalogItems(locale);
    if (parameters.versions && items[0])
      items[0].matchingVersions = [
        {
          ref: items[0].ref.replace("01.00.000", "02.00.000"),
          version: "02.00.000",
          name: items[0].name,
        },
      ];
    if (parameters.brands)
      items.forEach((item, index) => {
        item.brand = ["Tiangong LCA", "BAFU", "USLCI", "World steel"][index % 4]!;
      });
    if (parameters.missing && items[0]) delete items[0].functionalUnit;
    return (
      <CompareSelectionProvider key={locale} labels={selectionLabels(locale)} locale={locale}>
        <SearchResults {...args} items={items} labels={resultLabels(locale)} locale={locale} />
      </CompareSelectionProvider>
    );
  },
} satisfies Meta<typeof SearchResults>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ProcessAndFlow: Story = {
  play: async ({ canvasElement }) => {
    const controls = canvasElement.querySelectorAll<HTMLElement>(
      ".catalog-result-actions button, .catalog-result-actions a",
    );
    for (const control of controls)
      await expect(control.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await expect(canvasElement.querySelector(".catalog-result-extra")).toBeNull();
  },
};
export const Empty: Story = { parameters: { empty: true } };
export const MissingMetadata: Story = {
  parameters: { missing: true },
  play: async ({ canvas, globals }) => {
    await expect(
      canvas.queryByLabelText(dictionaries[storyLocale(globals)].Common.dataBrand),
    ).toBeNull();
  },
};
export const MatchingVersions: Story = {
  parameters: { versions: true },
  play: async ({ canvas, userEvent, globals }) => {
    await userEvent.click(
      canvas.getByRole("button", {
        name: new RegExp(dictionaries[storyLocale(globals)].Search.matchingVersions),
      }),
    );
    await expect(canvas.getByText("02.00.000", { exact: false })).toBeVisible();
  },
};
export const SelectForComparison: Story = {
  args: { selectable: true },
  play: async ({ canvas, userEvent, globals }) => {
    const checkboxes = canvas.getAllByRole("checkbox");
    await userEvent.click(checkboxes[0]!);
    await userEvent.click(checkboxes[1]!);
    await expect(
      canvas.getByRole("link", { name: dictionaries[storyLocale(globals)].Compare.openComparison }),
    ).toHaveAttribute("href", expect.stringContaining("ids="));
  },
};
export const MobileGerman: Story = {
  ...ProcessAndFlow,
  parameters: { brands: true },
  globals: { ...mobileGlobals, locale: "de" },
};
export const DarkFrench: Story = { globals: { theme: "dark", locale: "fr" } };

export const DisplayBrands: Story = {
  parameters: { brands: true },
  globals: { locale: "zh-CN" },
  play: async ({ canvasElement, canvas, globals }) => {
    const brands = canvas.getAllByLabelText(dictionaries[storyLocale(globals)].Common.dataBrand);
    const actions = canvasElement.querySelectorAll(".catalog-result-actions");
    for (const [index, brand] of brands.entries()) {
      await expect(brand.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        actions[index]!.getBoundingClientRect().bottom,
      );
    }
  },
};
