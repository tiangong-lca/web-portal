import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { atlasInformation, lifeCycleInitiativeUrl } from "../../src/sites/atlas/information";
import { catalogCoverage } from "../../src/config/catalog-coverage";
import { readPortalDataBrandScope } from "../../src/config/data-brands";
import { siteMessages } from "../../src/sites/messages";
import { atlasCopy } from "../../src/sites/atlas/copy";
import { locales } from "../../src/i18n/routing";
import en from "../../src/i18n/messages/en.json" with { type: "json" };
import zh from "../../src/i18n/messages/zh-CN.json" with { type: "json" };
import de from "../../src/i18n/messages/de.json" with { type: "json" };
import fr from "../../src/i18n/messages/fr.json" with { type: "json" };
const dictionaries = { en, "zh-CN": zh, de, fr };
import { readSiteId } from "../../src/sites/config";

const site = readSiteId();
const processRef = "11111111-1111-1111-1111-111111111111@01.00.000";

test.describe("site presentation", () => {
  for (const locale of locales) {
    test(`${site} ${locale} catalog entry includes scope coverage`, async ({ page }, testInfo) => {
      await page.goto(`/${locale}/search?v=1`);
      const coverage = catalogCoverage(readPortalDataBrandScope(process.env));
      const index = page.locator(".brand-catalog-index");
      await expect(index.getByRole("link")).toHaveCount(3);
      await expect(page.locator('a[href*="explore=source"], a[href*="browse/source"]')).toHaveCount(
        0,
      );
      for (const dimension of ["region"] as const) {
        const card = index.locator(`a[href$="explore=${dimension}"]`);
        await expect(card).toHaveAttribute("href", `/${locale}/search?v=1&explore=${dimension}`);
        // The shared component story already supplies coverage; this must exercise the route.
        if (coverage) {
          await expect(card).toContainText(
            dictionaries[locale].BrandHome["regionCount"].replace(
              "{count}",
              new Intl.NumberFormat(locale).format(coverage[dimension]),
            ),
          );
        }
      }
      if (coverage) await expect(page.getByText(coverage.asOf, { exact: false })).toHaveCount(0);
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
        if (locale === "en") {
          await page.screenshot({
            path: testInfo.outputPath(`${site}-catalog-${width}.png`),
            fullPage: true,
          });
        }
      }
    });
  }

  for (const locale of locales) {
    test(`${site} ${locale} identity, routes and responsive themes`, async ({ page }, testInfo) => {
      await page.goto(`/${locale}`);
      await expect(page.locator("html")).toHaveAttribute("data-site", site);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      const identity = site === "atlas" ? "Atlas" : "TianGong";
      const metadata = await page.locator('meta[property="og:site_name"]').getAttribute("content");
      expect(metadata).toBeTruthy();
      if (site === "atlas") {
        await expect(page).toHaveTitle(atlasCopy[locale].metadataTitle);
        await expect(page.getByRole("heading", { level: 1 })).toContainText(
          atlasCopy[locale].title,
        );
        await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
          "href",
          "/brand/atlas/logo.png",
        );
        const structured = await page.locator('script[type="application/ld+json"]').textContent();
        expect(structured).toContain('"name":"Atlas"');
        expect(structured).not.toContain('"@type":"Organization"');
        await expect(page.locator(".brand-cinematic-hero")).toHaveCount(0);
      }
      const coverage = catalogCoverage(readPortalDataBrandScope(process.env));
      if (coverage) {
        await expect(page.getByText(coverage.asOf, { exact: false })).toHaveCount(0);
        const index = page.locator(site === "atlas" ? ".atlas-index-grid" : ".brand-catalog-index");
        for (const dimension of ["region"] as const) {
          await expect(index.locator(`a[href$="explore=${dimension}"]`)).toContainText(
            String(coverage[dimension]),
          );
        }
      }
      const manifest = await (await page.request.get("/manifest.webmanifest")).json();
      expect(manifest.name).toContain(identity);
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of ["light", "dark"] as const) {
          const labels = dictionaries[locale].Common;
          const label = theme === "light" ? labels.themeLight : labels.themeDark;
          if (width < 640) {
            await page.getByRole("combobox", { name: labels.theme, exact: true }).click();
            await page.getByRole("option", { name: label, exact: true }).click();
            await expect(page.getByRole("listbox")).toBeHidden();
          } else {
            await page.getByRole("radio", { name: label, exact: true }).click();
          }
          await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
          // Contrast is assessed after theme-color transitions, not midway between palettes.
          await page.evaluate(async () => {
            await Promise.all(
              document
                .getAnimations()
                .filter(
                  (animation) => animation.effect?.getComputedTiming().iterations !== Infinity,
                )
                .map((animation) => animation.finished.catch(() => undefined)),
            );
          });
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          ).toBe(true);
          const violations = (
            await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()
          ).violations;
          expect(violations).toEqual([]);
          if (site === "atlas" && locale === "en" && theme === "light")
            await page.screenshot({
              path: testInfo.outputPath(`atlas-${width}.png`),
              fullPage: true,
            });
        }
      }
    });
  }

  for (const locale of locales) {
    test(`${site} ${locale} informational pages retain their own identity`, async ({
      page,
    }, testInfo) => {
      const messages = siteMessages(dictionaries[locale], locale, site);
      for (const path of ["team", "community", "methodology", "lca-database"]) {
        await page.goto(`/${locale}/${path}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        if (path === "lca-database") {
          const brand =
            site === "atlas" ? "Atlas" : locale === "zh-CN" ? "天工 LCA" : "TianGong LCA";
          await expect(page).toHaveTitle(`${messages.DatabaseGuide.title} · ${brand}`);
          await expect(
            page
              .getByRole("main")
              .getByText(messages.DatabaseGuide.definitionBody, { exact: true }),
          ).toBeVisible();
        }
        if (site === "atlas") {
          await expect(page.locator("body")).not.toContainText(/tiangong|天工|\bGLAD\b/i);
          await expect(
            page.locator('a[href*="tiangong"], a[href^="mailto:"], img[src*="team"]'),
          ).toHaveCount(0);
          await expect(
            page.getByRole("contentinfo").getByRole("link", { name: /Life Cycle Initiative/ }),
          ).toHaveAttribute("href", lifeCycleInitiativeUrl);
          if (path === "team")
            await expect(page.getByRole("heading", { level: 1 })).toHaveText(
              atlasInformation[locale].team.title,
            );
        } else if (path === "team") {
          await expect(page.locator('a[href="mailto:contact@tiangong.earth"]')).toBeVisible();
          await expect(page.getByRole("heading", { level: 1 })).toHaveText(messages.Team.kicker);
        }
        for (const width of [390, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          ).toBe(true);
          if (locale === "en")
            await page.screenshot({
              path: testInfo.outputPath(`${site}-${path}-${width}.png`),
              fullPage: true,
            });
        }
        expect(
          (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
            .violations,
        ).toEqual([]);
      }
    });
  }

  test(`${site} exports a collection under its own brand`, async ({ page }) => {
    await page.goto("/en/collections");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Saved datasets");
    await page.locator(".collection-add-shell > summary").click();
    await page.getByPlaceholder("uuid@version").fill(processRef);
    await page.getByRole("button", { name: "Save dataset", exact: true }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export saved datasets", exact: true }).click();
    expect((await downloadPromise).suggestedFilename()).toBe(`${site}-collection.json`);
  });

  test(`${site} preserves public exact-version detail and catalog actions`, async ({ page }) => {
    await page.goto("/en/search?v=1&kind=process&q=electricity");
    await expect(page.getByRole("button", { name: "Smart matching" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByText("Electricity, medium voltage", { exact: true })).toBeVisible();
    if (site === "atlas") await expect(page.locator(".atlas-record").first()).toBeVisible();
    await page
      .getByRole("link", { name: "Electricity, medium voltage", exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(
      (url) => decodeURIComponent(url.pathname) === `/en/process/${processRef}`,
    );
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Electricity, medium voltage");
    await expect(page.getByText("1 kWh", { exact: true })).toBeVisible();
    if (site === "atlas") await expect(page.locator(".atlas-detail-header")).toBeVisible();
    await page.getByRole("button", { name: "Citation", exact: true }).click();
    await expect(page.getByRole("dialog").getByText(processRef, { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.goto("/en/compare");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.goto("/en/collections");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test(`${site} keeps discovery and record content available without JavaScript`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      const origin = `http://127.0.0.1:${process.env.PORTAL_E2E_PORT ?? "4317"}`;
      await page.goto(`${origin}/en/search?v=1&kind=process&q=electricity`);
      await expect(page.getByText("Electricity, medium voltage", { exact: true })).toBeVisible();
      await page
        .getByRole("link", { name: "Electricity, medium voltage", exact: true })
        .first()
        .click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Electricity, medium voltage",
      );
    } finally {
      await context.close();
    }
  });
});

for (const locale of locales) {
  test(`${site} ${locale} retires source discovery`, async ({ page, request }) => {
    await page.goto(`/${locale}/browse/source`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/search\\?v=1$`));
    await page.goto(`/${locale}/search?v=1&explore=source&kind=flow&source=legacy-source`);
    await expect(page).not.toHaveURL(/explore=source/);
    await expect(page).toHaveURL(/kind=flow/);
    await expect(page).toHaveURL(/source=legacy-source/);
    const removeSource = page.getByRole("link", {
      name: `${dictionaries[locale].Common.clear}: ${dictionaries[locale].Search.source}`,
      exact: true,
    });
    await expect(removeSource).toContainText("legacy-source");
    await removeSource.click();
    await expect(page).not.toHaveURL(/source=/);
    await expect(page).toHaveURL(/kind=flow/);
    await expect(page.locator(".catalog-kind-switch a")).toHaveCount(3);
    await page.getByRole("button", { name: dictionaries[locale].Search.facets }).click();
    await expect(
      page.getByRole("dialog").getByText(dictionaries[locale].Search.source, { exact: true }),
    ).toHaveCount(0);
    const sitemap = await request.get("/sitemap.xml");
    expect(await sitemap.text()).not.toContain("/browse/source");
  });
}
