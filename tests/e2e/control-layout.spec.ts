import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
const first = "11111111-1111-1111-1111-111111111111@01.00.000";
const second = "77777777-7777-7777-7777-777777777777@01.00.000";
const flow = "22222222-2222-2222-2222-222222222222@01.00.000";

for (const width of [1440, 390]) {
  test(`control composition and visual page-family audit at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await mkdir("/tmp/portal103-visual", { recursive: true });
    for (const [name, route] of [
      ["catalog", "/en/search"],
      ["process", "/en/search?kind=process"],
      ["flow", "/en/search?kind=flow"],
      ["region", "/en/search?explore=region&geoNode=geo:cn&geoScope=subtree"],
      ["source", "/en/search?explore=source"],
      ["detail", `/en/process/${first}`],
      ["flow-detail", `/en/flow/${flow}`],
      ["compare", `/en/compare?v=1&ids=${encodeURIComponent(`${first},${second}`)}`],
      ["shortlist", "/en/collections"],
      ["guide", "/en/methodology"],
      ["team", "/en/team"],
      ["community", "/en/community"],
    ]) {
      await page.goto(route!, { waitUntil: "networkidle" });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
        `${name} overflow`,
      ).toBeLessThanOrEqual(1);
      if (name === "region") {
        const heading = page.locator(".catalog-navigation-header");
        const bar = await heading.boundingBox();
        if (width > 767) {
          expect(bar!.height).toBeLessThan(130);
          const controls = await page.locator(".catalog-navigation-actions").boundingBox();
          expect(controls!.x).toBeGreaterThan(bar!.x + 200);
          const canvas = page.locator(".catalog-map-canvas");
          const geometry = await page.locator(".catalog-region-map svg").boundingBox();
          const frame = await canvas.boundingBox();
          expect(geometry!.y - frame!.y).toBeGreaterThanOrEqual(24);
          expect(frame!.y + frame!.height - geometry!.y - geometry!.height).toBeGreaterThanOrEqual(
            24,
          );
        }
      }
      const path = `/tmp/portal103-visual/${name}-${width}.png`;
      await page.screenshot({ path, fullPage: true });
      await info.attach(`${name}-${width}`, { path, contentType: "image/png" });
    }
  });
}

test("links show pending feedback without losing content, then clear on completion", async ({
  page,
}) => {
  await page.goto("/en/search?kind=process");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/en/search?**", async (route) => {
    if (
      new URL(route.request().url()).searchParams.get("kind") === "flow" &&
      route.request().headers().rsc === "1"
    )
      await gate;
    await route.continue();
  });
  const flowLink = page
    .locator(".catalog-kind-switch")
    .getByRole("link", { name: "Flow", exact: true });
  await flowLink.click();
  await expect(flowLink.locator(".portal-pending-mark")).toHaveAttribute("data-pending", "true");
  await expect(page.locator(".portal-route-progress")).toHaveAttribute("data-pending", "true");
  await expect(page.getByRole("heading", { name: "Browse categories" })).toBeVisible();
  release();
  await expect(page).toHaveURL(/kind=flow/);
  await expect(page.locator(".portal-route-progress")).not.toHaveAttribute("data-pending", "true");
});

test("search remains live while pending and filter feedback survives closing its drawer", async ({
  page,
}) => {
  await page.goto("/en/search?kind=process");
  let release!: () => void;
  let gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/en/search?**", async (route) => {
    if (route.request().headers().rsc === "1") await gate;
    await route.continue();
  });
  await page.getByRole("searchbox").fill("electricity");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".portal-keyword-form")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".portal-route-progress")).toHaveAttribute("data-pending", "true");
  await page.getByRole("searchbox").fill("editable while waiting");
  release();
  await expect(page).toHaveURL(/q=electricity/);
  await expect(page.locator(".portal-route-progress")).not.toHaveAttribute("data-pending", "true");
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.getByRole("button", { name: "Refine results", exact: true }).click();
  const drawer = page.getByRole("dialog");
  const firstFilter = drawer.locator("a[href]").first();
  const destination = await firstFilter.getAttribute("href");
  await firstFilter.click();
  await expect(drawer).not.toBeVisible();
  await expect(page.locator(".portal-route-progress")).toHaveAttribute("data-pending", "true");
  release();
  await expect(page).toHaveURL(new URL(destination!, page.url()).href);
  await expect(page.locator(".portal-route-progress")).not.toHaveAttribute("data-pending", "true");
});

test("long localized controls reflow at a 200-percent desktop-equivalent width", async ({
  page,
}) => {
  // A 1440px desktop at 200% browser zoom has a 720 CSS-pixel layout viewport.
  await page.setViewportSize({ width: 720, height: 600 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const locale of ["zh-CN", "en", "de", "fr"]) {
    await page.goto(`/${locale}/search?explore=region&geoNode=geo:cn&geoScope=subtree`);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
    const actions = page.locator(".catalog-navigation-actions");
    for (const control of await actions.locator("a,button").all()) {
      const bounds = await control.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(720);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
  }
});
