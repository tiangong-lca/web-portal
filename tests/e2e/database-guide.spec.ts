import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { locales } from "../../src/i18n/routing";
import en from "../../src/i18n/messages/en.json" with { type: "json" };
import zh from "../../src/i18n/messages/zh-CN.json" with { type: "json" };
import de from "../../src/i18n/messages/de.json" with { type: "json" };
import fr from "../../src/i18n/messages/fr.json" with { type: "json" };

const dictionaries = { "zh-CN": zh, en, de, fr };

for (const locale of locales) {
  test(`database guide provides real public entry points and readable ${locale} content`, async ({
    page,
    request,
  }) => {
    const { DatabaseGuide: text } = dictionaries[locale];
    const response = await request.get(`/${locale}/lca-database`);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain(text.title);
    expect(html).toContain(`/${locale}/browse/process`);
    expect(html).toContain("https://lcdn.tiangong.earth/");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${locale}/lca-database`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(text.title);
    await expect(page).toHaveTitle(
      `${text.title} · ${locale === "zh-CN" ? "天工 LCA" : "TianGong LCA"}`,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      new RegExp(`/${locale}/lca-database$`),
    );
    for (const alternate of locales) {
      await expect(page.locator(`link[rel="alternate"][hreflang="${alternate}"]`)).toHaveAttribute(
        "href",
        new RegExp(`/${alternate}/lca-database$`),
      );
    }
    await expect(
      page.getByRole("link", { name: text.distributionAction, exact: true }),
    ).toHaveAttribute("href", "https://lcdn.tiangong.earth/");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await page
      .getByRole("combobox", { name: dictionaries[locale].Common.theme, exact: true })
      .click();
    await page
      .getByRole("option", { name: dictionaries[locale].Common.themeDark, exact: true })
      .click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(
      page.getByRole("listbox", { name: dictionaries[locale].Common.theme, exact: true }),
    ).not.toBeVisible();
    await page.evaluate(async () => {
      await Promise.allSettled(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
          .map((animation) => animation.finished),
      );
    });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  });
}

test("database discovery works without JavaScript and site identity does not replace dataset metadata", async ({
  browser,
  request,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: `http://127.0.0.1:${process.env.PORTAL_E2E_PORT ?? "4317"}`,
  });
  try {
    const page = await context.newPage();
    for (const locale of locales) {
      const text = dictionaries[locale].DatabaseGuide;
      await page.goto(`/${locale}/lca-database`);
      const main = page.getByRole("main");
      for (const content of [
        text.definitionBody,
        text.inventoryBody,
        text.impactBody,
        text.factorBody,
      ]) {
        await expect(main.getByText(content, { exact: true })).toBeVisible();
      }
      await expect(main.getByRole("link", { name: text.checkAction, exact: true })).toHaveAttribute(
        "href",
        `/${locale}/methodology`,
      );
      await expect(main.getByRole("link", { name: text.citeAction, exact: true })).toHaveAttribute(
        "href",
        `/${locale}/collections`,
      );
    }
    await page.goto("/en/lca-database");
    await page.getByRole("link", { name: en.DatabaseGuide.processAction, exact: true }).click();
    await expect(page).toHaveURL(/\/en\/browse\/process$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  } finally {
    await context.close();
  }
  const home = await (await request.get("/en")).text();
  expect(home).toContain('"@type":"WebSite"');
  expect(home).toContain('"@type":"Organization"');
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const locale of locales) expect(sitemap).toContain(`/${locale}/lca-database`);
});
