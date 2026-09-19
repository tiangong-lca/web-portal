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
