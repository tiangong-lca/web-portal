import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import en from "../../src/i18n/messages/en.json" with { type: "json" };

const processId = "11111111-1111-1111-1111-111111111111";
const processRef = `${processId}@01.00.000`;
const flowId = "22222222-2222-2222-2222-222222222222";
const flowRef = `${flowId}@01.00.000`;
const portalE2eOrigin = `http://127.0.0.1:${process.env.PORTAL_E2E_PORT ?? "4317"}`;

test("serves localized anonymous discovery with persistent theme and SEO alternates", async ({
  context,
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/zh-CN$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("看见完整的生命周期。");
  await expect(page.getByRole("link", { name: "天工 LCA 平台" }).first()).toHaveAttribute(
    "href",
    "https://lca.tiangong.earth",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/zh-CN$/);
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
    "href",
    /\/en$/,
  );
  await expect(page.locator('link[rel="alternate"][hreflang="de"]')).toHaveAttribute(
    "href",
    /\/de$/,
  );
  await expect(page.locator('link[rel="alternate"][hreflang="fr"]')).toHaveAttribute(
    "href",
    /\/fr$/,
  );
  const themeScript = await page.request.get("/brand/theme-init.js");
  const expectedIntegrity = `sha256-${createHash("sha256")
    .update(await themeScript.body())
    .digest("base64")}`;
  await expect(page.locator('script[src="/brand/theme-init.js"]')).toHaveAttribute(
    "integrity",
    expectedIntegrity,
  );

  await page.getByRole("radio", { name: "深色" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("[data-brand-dark-logo]").first()).toBeVisible();
  await expect(page.locator("[data-brand-light-logo]").first()).toBeHidden();
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.getByRole("combobox", { name: "语言" }).click();
  await page.getByRole("option", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("See the whole life cycle.");
  const englishHtml = await (await page.request.get("/en")).text();
  expect(englishHtml).toMatch(/<html[^>]*\slang="en"/u);
  await expect(page.getByText("Catalog overview", { exact: true })).toBeVisible();
  await expect(page.getByText("Process datasets", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Flow datasets", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Total", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /UUID Electricity, medium voltage/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /CAS Carbon dioxide/ })).toBeVisible();
  await page.getByRole("combobox", { name: "Language" }).click();
  await page.getByRole("option", { name: "Deutsch" }).click();
  await expect(page).toHaveURL(/\/de$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Den ganzen Lebenszyklus sehen.",
  );

  await page.getByRole("combobox", { name: "Sprache" }).click();
  await page.getByRole("option", { name: "Français" }).click();
  await expect(page).toHaveURL(/\/fr$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Voir tout le cycle de vie.");
  await expect(page.getByRole("contentinfo")).not.toContainText(
    /lecture seule|aucun compte requis/i,
  );
  expect(await context.cookies()).toEqual([]);
});

test("renders public search, exact details, numeric context, versions, and latest redirects", async ({
  page,
  request,
}) => {
  await page.goto("/en/search?v=1&kind=process&q=electricity");
  await expect(page.getByRole("heading", { name: "Data catalog", level: 1 })).toBeVisible();
  await expect(page.getByText("Electricity, medium voltage", { exact: true })).toBeVisible();
  await expect(page.locator(`a[href*="${encodeURIComponent(processRef)}"]`).first()).toBeVisible();
  await expect(page.getByText("Reference product", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Electricity", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Functional unit", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("1 kWh", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("TianGong", { exact: true }).first()).toBeVisible();

  await expect(page.getByRole("link", { name: "Next" })).toHaveAttribute(
    "href",
    /cursor=eyJ2IjoxfQ/,
  );
  await expect(page.getByRole("link", { name: "Next" })).toHaveAttribute("href", /limit=10/);

  await page.goto(`/en/process/${processRef}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Electricity, medium voltage");
  await expect(page.getByText("1 kWh", { exact: true })).toBeVisible();
  const datasetJsonLd = await page.locator('script[type="application/ld+json"]').textContent();
  expect(datasetJsonLd).toContain('"@type":"Dataset"');
  const datasetDescription = JSON.parse(datasetJsonLd ?? "{}").description as string;
  expect(Array.from(datasetDescription).length).toBeGreaterThanOrEqual(50);
  expect(Array.from(datasetDescription).length).toBeLessThanOrEqual(5000);

  await page.goto(`/en/process/${processRef}/exchanges`);
  await expect(page.getByRole("cell", { name: "1.25 kg" })).toBeVisible();
  const exchangeContext = page
    .locator("summary:visible")
    .filter({ hasText: "Identifiers and display context" })
    .first();
  await exchangeContext.click();
  await expect(exchangeContext.locator("..").getByText("1 kWh", { exact: true })).toBeVisible();
  await expect(
    exchangeContext.locator("..").getByText("portal-capability-policy.v1", { exact: true }),
  ).toBeVisible();

  await page.goto(`/en/process/${processRef}/lcia`);
  await expect(page.getByRole("cell", { name: "12.5 kg CO2-Eq" })).toBeVisible();
  const resultContext = page
    .locator("summary:visible")
    .filter({ hasText: "Dataset and method versions" })
    .first();
  await resultContext.focus();
  await page.keyboard.press("Enter");
  await expect(resultContext.locator("..")).toHaveAttribute("open");
  await expect(resultContext.locator("..").getByText(processRef, { exact: true })).toBeVisible();
  await page.getByText("Release and verification details", { exact: true }).click();
  await expect(page.getByText("55555555-5555-5555-5555-555555555555@release-2026.1")).toBeVisible();

  await page.goto(`/en/process/${processRef}/versions`);
  await page.getByRole("button", { name: en.Detail.citation, exact: true }).click();
  await expect(page.getByRole("dialog").getByText(processRef, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto(`/en/flow/${flowRef}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Carbon dioxide");
  // The flow record has no public comment, so it must publish no Dataset rather than an invalid one,
  // while the page itself stays a normal indexable page.
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/en\/flow\//);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /\S/u);

  const flowVersions = await request.get(`/en/flow/${flowRef}/versions`);
  expect(flowVersions.ok()).toBe(true);
  expect(await flowVersions.text()).toContain(flowRef);
  await page.goto(`/en/flow/${flowRef}/versions`);
  await expect(page.getByRole("heading", { name: "Version history" })).toBeVisible();
  await expect(page.getByText(flowRef, { exact: true }).first()).toBeVisible();

  const latest = await request.get(`/en/process/${processId}`, { maxRedirects: 0 });
  expect(latest.status()).toBe(307);
  expect(latest.headers().location).toContain(`/en/process/${processRef}`);

  const latestFlow = await request.get(`/en/flow/${flowId}`, { maxRedirects: 0 });
  expect(latestFlow.status()).toBe(307);
  expect(latestFlow.headers().location).toContain(`/en/flow/${flowRef}`);

  const missing = await request.get("/en/process/99999999-9999-9999-9999-999999999999@01.00.000");
  expect(missing.status()).toBe(404);
  const missingFlow = await request.get("/en/flow/99999999-9999-9999-9999-999999999999@01.00.000");
  expect(missingFlow.status()).toBe(404);
});

test("completes the HTML-first search to two-member comparison path", async ({ page }) => {
  await page.goto("/en/search?v=1&kind=process&q=electricity&sort=relevance");
  const candidates = page.getByRole("checkbox", { name: "Select for comparison" });
  await expect(candidates).toHaveCount(2);
  await candidates.nth(0).check();
  await candidates.nth(1).check();

  await page.getByRole("button", { name: "Refine results" }).click();
  const processFacet = page.getByRole("link", { name: /Process \(\d+\)/ });
  await expect(processFacet).toHaveAttribute("href", /q=electricity/);
  await expect(processFacet).toHaveAttribute("href", /kind=process/);
  await expect(processFacet).toHaveAttribute("href", /sort=relevance/);
  await expect(processFacet).not.toHaveAttribute("href", /cursor=/);

  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Compare selected versions", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/compare\?/);
  await expect(page.getByRole("heading", { name: "Compare Process datasets" })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Electricity, medium voltage" }),
  ).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Electricity, low voltage" })).toBeVisible();

  await page.getByRole("combobox", { name: "Impact category" }).selectOption("climate-change");
  await page.getByRole("button", { name: "Published impact results" }).click();
  await expect(page.getByRole("heading", { name: "Published impact results" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "12.5" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "9.75" })).toBeVisible();
  await expect(page.getByText(/55555555-5555-5555-5555-555555555555@release-2026.1/)).toBeVisible();
});

test("renders Browse in initial HTML and keeps private work surfaces out of the index", async ({
  page,
  request,
}) => {
  const browse = await request.get("/en/browse/process");
  expect(await browse.text()).toContain("Electricity, medium voltage");

  for (const path of ["/en/search?v=1&q=electricity", "/en/compare", "/en/collections"]) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  }

  const sitemap = await request.get("/sitemap.xml");
  const sitemapBody = await sitemap.text();
  expect(sitemap.ok()).toBe(true);
  expect(sitemapBody).toContain("hreflang");

  const processIndex = await request.get("/catalog-process-sitemap.xml");
  const processIndexBody = await processIndex.text();
  expect(processIndex.ok()).toBe(true);
  expect(processIndex.headers()["content-type"]).toBe("application/xml; charset=utf-8");
  expect(processIndex.headers()["cache-control"]).toBe(
    "public, max-age=0, s-maxage=300, must-revalidate",
  );
  expect(processIndexBody.match(/<sitemap>/gu)).toHaveLength(256);
  const processShardLocations = await page.evaluate((xml) => {
    const document_ = new DOMParser().parseFromString(xml, "application/xml");
    return [...document_.querySelectorAll("sitemap > loc")].map((item) => item.textContent);
  }, processIndexBody);
  expect(processShardLocations).toEqual(
    Array.from({ length: 64 }, (_, shardIndex) =>
      Array.from(
        { length: 4 },
        (_, partIndex) =>
          `${portalE2eOrigin}/catalog-process-sitemap.xml?shard=${shardIndex}&part=${partIndex}`,
      ),
    ).flat(),
  );
  expect(processIndexBody).not.toContain("portal-sitemap-v1-");

  const processShard = await request.get("/catalog-process-sitemap.xml?shard=0&part=0");
  const processShardBody = await processShard.text();
  expect(processShard.ok()).toBe(true);
  expect(processShardBody).toContain("<urlset");
  expect(processShardBody).toContain("/zh-CN/process/");
  expect(processShardBody).toContain("/en/process/");
  expect(processShardBody).toContain("/de/process/");
  expect(processShardBody).toContain("/fr/process/");
  expect(processShardBody.match(/<url>/gu)).toHaveLength(4);
  expect(processShardBody).toContain('hreflang="en"');
  expect(processShardBody).not.toContain("/flow/");
  expect(processShardBody).not.toContain("portal-sitemap-v1-");
  expect(
    await page.evaluate((xml) => {
      const document_ = new DOMParser().parseFromString(xml, "application/xml");
      return document_.querySelector("parsererror") === null;
    }, processShardBody),
  ).toBe(true);

  const invalidShard = await request.get("/catalog-process-sitemap.xml?shard=01&part=0");
  expect(invalidShard.status()).toBe(404);
  expect(invalidShard.headers()["cache-control"]).toBe("no-store");

  const queryVariant = await request.get("/catalog-process-sitemap.xml?shard=0&part=0&bust=1");
  expect(queryVariant.status()).toBe(404);
  expect(queryVariant.headers()["cache-control"]).toBe("no-store");
});

test("keeps the local collection local and shares member IDs only", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/en/collections");
  await page.locator(".collection-add-shell > summary").click();
  await page.getByLabel("Add by version ID").fill(processRef);
  await page.getByRole("button", { name: "Add to shortlist" }).click();
  await page.getByLabel("Notes or selection rationale").fill("private local note");
  await page.reload();
  await expect(page.getByRole("button", { name: "Copy version ID" })).toBeVisible();
  await expect(page.getByLabel("Notes or selection rationale")).toHaveValue("private local note");

  await page.getByRole("button", { name: "Copy shortlist link" }).click();
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  expect(shared).toContain("#collection=");
  expect(shared).not.toContain("private local note");
  expect(await context.cookies()).toEqual([]);
});

test("quarantines corrupt local collection data until the user explicitly clears it", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("tiangong.portal.collections.v1", "{corrupt-json");
  });
  await page.goto("/en/collections");
  await expect(
    page.getByRole("button", { name: "Export raw shortlist data for recovery" }),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("tiangong.portal.collections.v1"))).toBe(
    "{corrupt-json",
  );
  await page.getByRole("button", { name: "Clear the unreadable local shortlist" }).click();
  expect(await page.evaluate(() => localStorage.getItem("tiangong.portal.collections.v1"))).toBe(
    "{corrupt-json",
  );
  await page.getByRole("button", { name: "Confirm clearing saved content" }).click();
  await expect(
    page.getByRole("button", { name: "Export raw shortlist data for recovery" }),
  ).toBeHidden();
});

test("keeps core controls available at mobile width and 200 percent text zoom", async ({
  page,
}) => {
  await page.setViewportSize({ height: 667, width: 375 });
  await page.goto("/en");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect(page.locator(".catalog-search-teaser")).toBeVisible();
  await expect(page.locator('header a[href="https://lca.tiangong.earth"]')).toBeHidden();
  await expect(
    page.getByRole("contentinfo").getByRole("link", { name: "Open the LCA platform" }),
  ).toBeVisible();
  const layout = await page.evaluate(async () => {
    const root = document.documentElement;
    const initialClientWidth = root.clientWidth;
    const initialInnerWidth = window.innerWidth;
    const initialScrollWidth = root.scrollWidth;
    const viewportRight = Math.max(root.clientWidth, window.innerWidth);
    const offenders = Array.from(document.body.querySelectorAll<HTMLElement>("*"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);

        return {
          className: element.className.toString().slice(0, 160),
          clientWidth: element.clientWidth,
          fontFamily: style.fontFamily,
          left: Math.round(rect.left * 10) / 10,
          overflowWrap: style.overflowWrap,
          right: Math.round(rect.right * 10) / 10,
          scrollWidth: element.scrollWidth,
          tagName: element.tagName.toLowerCase(),
          text: element.textContent?.trim().replace(/\s+/g, " ").slice(0, 120) ?? "",
          width: Math.round(rect.width * 10) / 10,
          wordBreak: style.wordBreak,
        };
      })
      .filter(({ left, right }) => left < -1 || right > viewportRight + 1)
      .sort((left, right) => right.right - viewportRight - (left.right - viewportRight))
      .slice(0, 12);

    const previousY = window.scrollY;
    window.scrollTo(Number.MAX_SAFE_INTEGER, previousY);
    const immediateScrollX = window.scrollX;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    window.scrollTo(Number.MAX_SAFE_INTEGER, previousY);
    const settledScrollX = window.scrollX;
    const maximumScrollX = Math.max(immediateScrollX, settledScrollX);
    window.scrollTo(0, previousY);

    return {
      bodyScrollWidth: document.body.scrollWidth,
      clientWidth: root.clientWidth,
      fontStatus: document.fonts.status,
      initialClientWidth,
      initialInnerWidth,
      initialOverflow: initialScrollWidth - initialClientWidth,
      initialScrollWidth,
      immediateScrollX,
      innerWidth: window.innerWidth,
      maximumScrollX,
      offenders,
      settledScrollX,
      settledOverflow: root.scrollWidth - root.clientWidth,
      scrollWidth: root.scrollWidth,
    };
  });
  expect(
    layout.maximumScrollX,
    `Zoomed viewport layout: ${JSON.stringify(layout)}`,
  ).toBeLessThanOrEqual(1);

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
});
