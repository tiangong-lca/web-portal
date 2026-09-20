import { mkdir } from "node:fs/promises";
import { expect, test, type Locator } from "@playwright/test";
const first = "11111111-1111-1111-1111-111111111111@01.00.000";
const second = "77777777-7777-7777-7777-777777777777@01.00.000";
const flow = "22222222-2222-2222-2222-222222222222@01.00.000";

/** Generated `::after` content; `"none"` proves the element draws no local underline. */
function pseudoAfterContent(locator: Locator) {
  return locator.evaluate((element) => getComputedStyle(element, "::after").content);
}

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
          const scene = page.locator(".region-maplibre-scene");
          await expect(scene).toHaveAttribute("data-state", "ready", { timeout: 20_000 });
          const geometry = await page.locator(".region-maplibre-canvas").boundingBox();
          expect(geometry!.height).toBeGreaterThanOrEqual(380);
          const caption = page.locator(".map-information");
          await expect(caption).toHaveCSS("font-size", "12px");
          const note = await caption.boundingBox();
          const selection = await page.locator(".region-maplibre-selection").boundingBox();
          expect(note!.y).toBeGreaterThanOrEqual(geometry!.y + geometry!.height);
          expect(note!.y + note!.height).toBeLessThanOrEqual(selection!.y);
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
  // The pending link draws no local progress underline: the global bar is the
  // only loading visual. The kind switch keeps its own selected-tab border, which
  // is state rather than progress, so it is transparent while pending and
  // emphasized once this link is the current one.
  expect(await pseudoAfterContent(flowLink)).toBe("none");
  await expect(flowLink).toHaveCSS("border-bottom-color", "rgba(0, 0, 0, 0)");
  await expect(page.getByRole("heading", { name: "Browse categories" })).toBeVisible();
  release();
  await expect(page).toHaveURL(/kind=flow/);
  await expect(page.locator(".portal-route-progress")).not.toHaveAttribute("data-pending", "true");
  await expect(flowLink).toHaveAttribute("aria-current", "page");
  await expect(flowLink).not.toHaveCSS("border-bottom-color", "rgba(0, 0, 0, 0)");
});

test("the header brand link keeps pending feedback in the global bar only", async ({ page }) => {
  await page.goto("/en/search?kind=process");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => url.pathname === "/en",
    async (route) => {
      await gate;
      await route.continue();
    },
  );
  const brand = page.locator("[data-portal-header] a[href='/en']");
  await brand.click();
  await expect(brand.locator(".portal-pending-mark")).toHaveAttribute("data-pending", "true");
  await expect(page.locator(".portal-route-progress")).toHaveAttribute("data-pending", "true");
  expect(await pseudoAfterContent(brand)).toBe("none");
  release();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator(".portal-route-progress")).not.toHaveAttribute("data-pending", "true");
  await expect(brand.locator(".portal-pending-mark")).not.toHaveAttribute("data-pending", "true");
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

test("offline map keeps geographic context through China and province views", async ({ page }) => {
  // Three cold software-rendered levels plus four visual captures share this deadline.
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mkdir("/tmp/portal113-visual", { recursive: true });
  const layers = new Set<string>();
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/maps/gl/") && path.endsWith(".geojson")) layers.add(path);
  });
  await page.goto("/en/search?explore=region");
  const scene = page.locator(".region-maplibre-scene");
  for (const [layer, name, link] of [
    ["world", "world", null],
    ["geo:cn", "china", /China/],
    ["geo:cn-ah", "anhui", /Anhui/],
  ] as const) {
    if (link)
      await page.locator(".catalog-navigation-list").getByRole("link", { name: link }).click();
    await expect(scene).toHaveAttribute("data-layer", layer, { timeout: 20_000 });
    await expect(scene).toHaveAttribute("data-state", "ready", { timeout: 20_000 });
    await expect(scene).not.toHaveAttribute("data-moving", { timeout: 10_000 });
    await expect(page.getByRole("link", { name: "Natural Earth", exact: true })).toBeVisible();
    await page
      .locator(".region-maplibre")
      .screenshot({ path: `/tmp/portal113-visual/${name}.png` });
  }
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page
    .locator(".region-maplibre")
    .screenshot({ path: "/tmp/portal113-visual/anhui-dark.png" });
  expect(layers.size).toBe(3);
});
