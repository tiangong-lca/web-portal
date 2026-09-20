import { gzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";

test("drills from world to a Chinese city and opens an exact public version", async ({ page }) => {
  const layers: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/maps/")) layers.push(request.url());
  });
  await page.goto("/zh-CN/search?explore=region");
  await page.locator(".catalog-navigation-list").getByRole("link", { name: /中国/ }).click();
  await expect(page).toHaveURL(/geoNode=geo%3Acn/);
  await page.locator(".catalog-navigation-list").getByRole("link", { name: /安徽/ }).click();
  await expect(page).toHaveURL(/geoNode=geo%3Acn-ah/);
  await page.locator(".catalog-navigation-list").getByRole("link", { name: /合肥/ }).click();
  await expect(page).toHaveURL(/geoNode=geo%3Acn-ah-hfe/);
  await expect(page).toHaveURL(/explore=process/);
  await page.getByRole("link", { name: "Electricity, medium voltage [en]", exact: true }).click();
  await expect(page).toHaveURL(/\/process\/[0-9a-f-]+(?:@|%40)01\.00\.000/);
  await page.goBack();
  await expect(page).toHaveURL(/geoNode=geo%3Acn-ah-hfe/);
  expect(layers.every((url) => !url.includes("geo-cn-gd") && !url.includes("geo-cn-xj"))).toBe(
    true,
  );
});

test("ordinary catalog does not fetch maps and hierarchy constraints are explicit before description search", async ({
  page,
}) => {
  const layers: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/maps/")) layers.push(request.url());
  });
  await page.goto("/en/search?kind=process&classNode=class:isic:0&classScope=subtree");
  await expect(page.getByRole("heading", { name: "Browse categories" })).toBeVisible();
  await page.getByRole("combobox", { name: /Keyword search/ }).click();
  await page.getByRole("option", { name: "Describe your need" }).click();
  await expect(
    page.getByText("To describe your needs, first clear category and region hierarchy selections."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Clear hierarchy selections" })).not.toHaveAttribute(
    "href",
    /classNode/,
  );
  expect(layers).toEqual([]);
});

test("region hierarchy remains usable without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/zh-CN/browse/region");
  await page.locator(".catalog-navigation-list").getByRole("link", { name: /中国/ }).click();
  await expect(page).toHaveURL(/geoNode=geo%3Acn(?:&|$)/);
  await page.waitForLoadState("load");
  await page.locator(".catalog-navigation-list").getByRole("link", { name: /安徽/ }).click();
  await page.getByRole("link", { name: "仅本级数据（0）" }).click();
  await expect(page).toHaveURL(/geoScope=direct/);
  await context.close();
});

test("keeps one geographic camera through world, China, province and Back", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/en/search?explore=region");
  const svg = page.locator(".catalog-region-map svg");
  await expect(svg).toHaveAttribute("data-coordinate-space", "pacific-robinson-v1");
  const world = await svg.getAttribute("viewBox");
  await svg.evaluate((element) => element.setAttribute("data-camera-probe", "persistent"));

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/maps/geo-cn.*.json", async (route) => {
    await gate;
    await route.continue();
  });
  await page.locator(".catalog-navigation-list").getByRole("link", { name: /China/ }).click();
  await expect(page).toHaveURL(/geoNode=geo%3Acn/);
  await expect(page.locator(".catalog-region-map")).toHaveAttribute("aria-busy", "true");
  await expect(svg).toHaveAttribute("data-camera-probe", "persistent");
  // A previous geographic canvas survives, but its counts and links do not masquerade as China data.
  await expect(svg.getByRole("link")).toHaveCount(0);
  await expect(page.locator(".catalog-region-map-status")).toBeVisible();
  release();
  await expect(svg).toHaveAttribute("data-camera-moving", "true");
  await expect(svg).not.toHaveAttribute("data-camera-moving");
  const china = await svg.getAttribute("viewBox");
  expect(china).not.toBe(world);
  await expect(svg.getByRole("link", { name: /Anhui/ })).toBeVisible();

  await page.locator(".catalog-navigation-list").getByRole("link", { name: /Anhui/ }).click();
  await expect(svg).toHaveAttribute("data-camera-moving", "true");
  await expect(svg).not.toHaveAttribute("data-camera-moving");
  await expect(svg).toHaveAttribute("data-camera-probe", "persistent");
  const province = await svg.getAttribute("viewBox");
  expect(Number(province!.split(" ")[2])).toBeLessThan(Number(china!.split(" ")[2]));
  const fitted = await svg.evaluate((element) => {
    const box = (element as SVGSVGElement).viewBox.baseVal;
    return { camera: box.width / box.height, canvas: element.clientWidth / element.clientHeight };
  });
  expect(fitted.camera).toBeCloseTo(fitted.canvas, 2);
  await page.goBack();
  await expect(svg).toHaveAttribute("viewBox", china!);
  await page.goBack();
  await expect(svg).toHaveAttribute("viewBox", world!);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator(".catalog-navigation-list").getByRole("link", { name: /China/ }).click();
  await expect(svg.getByRole("link", { name: /Anhui/ })).toBeVisible();
  await expect(svg).not.toHaveAttribute("data-camera-moving");
});

test("loads only the visible map layer within the additional JavaScript budget", async ({
  browser,
}) => {
  const ordinary = await browser.newPage();
  const region = await browser.newPage();
  const ordinaryScripts = new Set<string>();
  const regionScripts = new Set<string>();
  const layers = new Set<string>();
  ordinary.on("request", (request) => {
    if (request.resourceType() === "script") ordinaryScripts.add(request.url());
  });
  region.on("request", (request) => {
    if (request.resourceType() === "script") regionScripts.add(request.url());
    if (new URL(request.url()).pathname.startsWith("/maps/")) layers.add(request.url());
  });
  try {
    await ordinary.goto("/en/search?kind=process");
    await ordinary.waitForLoadState("networkidle");
    await region.goto("/en/search?explore=region");
    await expect(region.locator(".catalog-region-map svg")).toBeVisible();
    await region.waitForLoadState("networkidle");
    let additionalBytes = 0;
    for (const url of regionScripts) {
      if (ordinaryScripts.has(url)) continue;
      const response = await region.request.get(url);
      expect(response.ok()).toBe(true);
      additionalBytes += gzipSync(await response.body()).byteLength;
    }
    expect(additionalBytes).toBeLessThanOrEqual(30 * 1024);
    expect(layers.size).toBe(1);
    const layer = await region.request.get([...layers][0]!);
    expect(layer.headers()["cache-control"]).toContain("immutable");
  } finally {
    await ordinary.close();
    await region.close();
  }
});

test("map previews locally, keeps the explorer during drilldown, and restores URL history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/en/search?explore=region&kind=process");
  const explorer = page.locator(".catalog-region-explorer");
  const mapChina = page.locator(".catalog-region-map svg").getByRole("link", { name: /^China:/ });
  await expect(mapChina).toBeVisible();
  // The selection itself does not navigate or fetch another layer.
  const original = page.url();
  await mapChina.focus();
  await mapChina.press("Enter");
  await expect(page.getByRole("link", { name: "Explore subregions", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore subregions", exact: true })).toBeInViewport({
    ratio: 1,
  });
  expect(page.url()).toBe(original);
  await expect(mapChina).toHaveAttribute("data-selected", "true");
  await explorer.evaluate((element) =>
    element.setAttribute("data-persistence-probe", "same-frame"),
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/en/search?**", async (route) => {
    if (
      new URL(route.request().url()).searchParams.get("geoNode") === "geo:cn" &&
      route.request().headers().rsc === "1"
    )
      await gate;
    await route.continue();
  });
  await page.getByRole("link", { name: "Explore subregions", exact: true }).click();
  await expect(explorer).toHaveAttribute("data-pending", "true");
  await expect(page.getByText("Loading region…", { exact: true })).toBeVisible();
  await expect(mapChina).toBeVisible();
  release();
  await expect(page).toHaveURL(/geoNode=geo%3Acn/);
  await expect(explorer).not.toHaveAttribute("data-pending", "true");
  await expect(explorer).toHaveAttribute("data-persistence-probe", "same-frame");
  await expect(
    page.locator(".catalog-navigation-list").getByRole("link", { name: /Anhui/ }),
  ).toBeVisible();
  await expect(explorer.getByRole("heading", { name: "Browse regions: China" })).toBeFocused();
  await page.goBack();
  await expect(page).toHaveURL(original);
  await expect(
    page.locator(".catalog-navigation-list").getByRole("link", { name: /China/ }),
  ).toBeVisible();
});

test("zero-count regions stay reachable without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/en/search?explore=region");
    const zero = page.locator(".catalog-zero-regions");
    await expect(zero).not.toHaveAttribute("open");
    await zero.locator("summary").click();
    await zero.getByRole("link", { name: /Antarctica/ }).click();
    await expect(page).toHaveURL(/geoNode=geo%3Aaq/);
  } finally {
    await context.close();
  }
});

test("mobile map stays expanded across levels and map errors keep the region list", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  try {
    const page = await context.newPage();
    await page.goto("/zh-CN/search?explore=region");
    await expect(page.locator(".catalog-region-map")).toHaveCount(0);
    await page.getByRole("button", { name: "显示地图" }).click();
    await expect(page.locator(".catalog-region-map svg")).toBeVisible();
    await page.route("**/maps/geo-cn.*.json", (route) =>
      route.fulfill({ status: 503, body: "unavailable" }),
    );
    await page.locator(".catalog-navigation-list").getByRole("link", { name: /中国/ }).click();
    await expect(page.getByRole("button", { name: "收起地图" })).toBeVisible();
    await expect(page.locator(".catalog-region-map-status")).toContainText("地区列表");
    await expect(
      page.locator(".catalog-navigation-list").getByRole("link", { name: /安徽/ }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("a newer region choice wins while an earlier navigation is waiting", async ({ page }) => {
  await page.goto("/en/search?explore=region");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let intercepted!: () => void;
  const started = new Promise<void>((resolve) => {
    intercepted = resolve;
  });
  await page.route("**/en/search?**", async (route) => {
    if (
      new URL(route.request().url()).searchParams.get("geoNode") === "geo:cn" &&
      route.request().headers().rsc === "1"
    ) {
      intercepted();
      await gate;
    }
    await route.continue();
  });
  await page.locator(".catalog-navigation-list").getByRole("link", { name: /China/ }).click();
  await started;
  await page.locator('.catalog-navigation-list a[href*="geo%3Aspecial"]').click();
  await expect(page).toHaveURL(/geoNode=geo%3Aspecial/);
  release();
  await expect(page.locator(".catalog-region-explorer")).not.toHaveAttribute(
    "data-pending",
    "true",
  );
  await expect(page).toHaveURL(/geoNode=geo%3Aspecial/);
  await expect(
    page.locator(".catalog-navigation-list").getByRole("link", { name: /Rest of World/ }),
  ).toBeVisible();
});

test("mobile reduced-motion map selection stays above the comparison tray", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/en/search?kind=process");
  await page.locator('input[type="checkbox"][name="ids"]').first().check();
  await expect(page.locator("[data-compare-tray]")).toBeVisible();
  await page
    .locator(".catalog-kind-switch")
    .getByRole("link", { name: "Region", exact: true })
    .click();
  await page.getByRole("button", { name: "Show map", exact: true }).click();
  const china = page.locator(".catalog-region-map svg").getByRole("link", { name: /^China:/ });
  await china.click();
  const action = page.getByRole("link", { name: "Explore subregions", exact: true });
  await expect(action).toBeFocused();
  await expect(action).toBeInViewport({ ratio: 1 });
  const bounds = await action.boundingBox();
  const tray = await page.locator("[data-compare-tray]").boundingBox();
  const header = await page.locator("[data-portal-header]").boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
  expect(bounds!.y + bounds!.height).toBeLessThan(tray!.y);
  await page
    .locator(".catalog-map-selection")
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await expect(china).toBeFocused();
  await expect(china).toBeInViewport();
});
