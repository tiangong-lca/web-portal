import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { DatabaseGuide } from "@/features/catalog/database-guide";
import { localePath } from "@/i18n/routing";
import { publicResources } from "@/lib/public-resources";
import { publicCatalogSummarySchema } from "@/server/contracts/portal";
import { lifeCycleInitiativeUrl } from "@/sites/atlas/information";
import { siteMessages } from "@/sites/messages";
import fixture from "../../tests/fixtures/portal/catalog-v1.json";
import { dictionaries, mobileGlobals, storyLocale } from "../fixtures";

const summary = publicCatalogSummarySchema.parse(fixture.catalogSummary);
const meta = {
  title: "Catalog/LCA database",
  component: DatabaseGuide,
  tags: ["!autodocs"],
  parameters: { pageLayout: true },
  args: {
    site: "tiangong",
    locale: "zh-CN",
    labels: dictionaries["zh-CN"].DatabaseGuide,
    common: dictionaries["zh-CN"].Common,
    summary,
  },
  render: (args, { globals }) => {
    const locale = storyLocale(globals);
    const messages = siteMessages(dictionaries[locale], locale, args.site ?? "tiangong");
    return (
      <DatabaseGuide
        {...args}
        locale={locale}
        labels={messages.DatabaseGuide}
        common={messages.Common}
      />
    );
  },
  play: async ({ args, canvas, canvasElement, globals }) => {
    const locale = storyLocale(globals);
    const labels = siteMessages(
      dictionaries[locale],
      locale,
      args.site ?? "tiangong",
    ).DatabaseGuide;
    await expect(canvas.getByRole("heading", { level: 1, name: labels.title })).toBeVisible();
    await expect(
      canvas.getByRole("heading", { level: 2, name: labels.definitionTitle }),
    ).toBeVisible();
    await expect(canvas.getByText(labels.definitionBody)).toBeVisible();
    for (const key of ["inventory", "impact", "factor"] as const) {
      await expect(canvas.getByText(labels[`${key}Title`])).toBeVisible();
      await expect(canvas.getByText(labels[`${key}Body`])).toBeVisible();
    }
    const workflow = within(canvas.getByRole("region", { name: labels.workflowTitle }));
    await expect(workflow.getAllByRole("listitem")).toHaveLength(3);
    for (const [key, path] of [
      ["find", "browse/process"],
      ["check", "methodology"],
      ["cite", "collections"],
    ] as const) {
      await expect(workflow.getByText(labels[`${key}Body`])).toBeVisible();
      await expect(workflow.getByRole("link", { name: labels[`${key}Action`] })).toHaveAttribute(
        "href",
        localePath(locale, path),
      );
    }
    await expect(workflow.getByRole("link", { name: labels.citeAction })).toHaveAttribute(
      "rel",
      "nofollow",
    );
    await expect(canvas.getByRole("link", { name: labels.processAction })).toHaveAttribute(
      "href",
      localePath(locale, "browse/process"),
    );
    if (args.site === "atlas") {
      await expect(canvasElement.textContent).not.toMatch(/tiangong|天工|LCDN|\bGLAD\b/i);
      await expect(canvasElement.querySelectorAll('a[href*="tiangong"]')).toHaveLength(0);
      await expect(
        canvasElement.querySelector(`a[href="${lifeCycleInitiativeUrl}"]`),
      ).not.toBeNull();
    } else {
      await expect(canvas.getByRole("link", { name: labels.guideAction })).toHaveAttribute(
        "href",
        publicResources(locale).dataGuide,
      );
      await expect(canvas.getByRole("link", { name: labels.distributionAction })).toHaveAttribute(
        "href",
        "https://lcdn.tiangong.earth/",
      );
    }
    await expect(canvasElement.querySelectorAll("main")).toHaveLength(1);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);
  },
} satisfies Meta<typeof DatabaseGuide>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Chinese: Story = {};
export const English: Story = { globals: { locale: "en" } };
export const GermanMobile: Story = { globals: { ...mobileGlobals, locale: "de" } };
export const FrenchDark: Story = { globals: { ...mobileGlobals, locale: "fr", theme: "dark" } };
export const AtlasEnglish: Story = {
  args: { site: "atlas" },
  globals: { site: "atlas", locale: "en" },
};
export const AtlasMobileFrench: Story = {
  args: { site: "atlas" },
  globals: { ...mobileGlobals, site: "atlas", locale: "fr", theme: "dark" },
};
export const UnavailableCounts: Story = {
  args: { summary: null },
  play: async (context) => {
    await meta.play(context);
    await expect(
      context.canvas.getByText(
        dictionaries[storyLocale(context.globals)].DatabaseGuide.countsUnavailable,
      ),
    ).toBeVisible();
  },
};
