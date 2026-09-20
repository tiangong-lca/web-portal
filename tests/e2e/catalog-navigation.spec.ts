import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import manifest from "../../src/features/catalog/region-maplibre-manifest.generated.json" with { type: "json" };

/** Production asset paths and reviewed hashes; a renamed or missing asset must fail loudly. */
const WORLD = manifest.layers.world;
const CHINA = manifest.layers["geo:cn"];
const WORKER = manifest.renderer.worker;
const NOTICE = manifest.renderer.notice;

type Bounds = [number, number, number, number];
type FeatureProperties = {
  boundaryId: string;
  nodeId: string | null;
  navigationNodeId?: string;
  bounds: Bounds;
};
type Feature = {
  properties: FeatureProperties;
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
};
type Collection = { features: Feature[] };

/** Reviewed identity: the world layer aliases Taiwan, Hong Kong and Macao to the China entry. */
function identityOf(properties: FeatureProperties) {
  return properties.navigationNodeId ?? properties.nodeId ?? "";
}

/** A projected target smaller than this cannot be hit honestly, so those regions use the
 * production small-region shortcuts instead of a pointer guess. */
const MIN_POINTER_TARGET = 12;

const collections = new Map<string, Collection>();
/** Downloaded reviewed geometry: the same bytes the browser renders, read through the HTTP API. */
async function geometry(page: Page, url: string): Promise<Collection> {
  const cached = collections.get(url);
  if (cached) return cached;
  const response = await page.request.get(url);
  expect(response.ok(), `geometry ${url}`).toBe(true);
  const collection = (await response.json()) as Collection;
  collections.set(url, collection);
  return collection;
}

function polygons(geometry: Feature["geometry"]): number[][][][] {
  return geometry.type === "Polygon"
    ? [geometry.coordinates as number[][][]]
    : (geometry.coordinates as number[][][][]);
}

/** Even-odd ray casting, the bounded check the reviewed outlines need. */
function insideRing(point: [number, number], ring: number[][]) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi! > y !== yj! > y && x < ((xj! - xi!) * (y - yi!)) / (yj! - yi!) + xi!) inside = !inside;
  }
  return inside;
}

/** The reviewed polygon a pointer can actually hit: its interior point plus that polygon's own
 * extent, so a gate and its target never describe different shapes. Bounded: 144 candidates. */
function target(collection: Collection, nodeId: string) {
  let best: { ring: number[][]; holes: number[][][] } | null = null;
  let area = 0;
  for (const shape of collection.features) {
    if (identityOf(shape.properties) !== nodeId) continue;
    for (const polygon of polygons(shape.geometry)) {
      const ring = polygon[0];
      if (!ring?.length) continue;
      const xs = ring.map(([lng]) => lng!);
      const ys = ring.map(([, lat]) => lat!);
      const candidate = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
      if (candidate > area) {
        area = candidate;
        best = { ring, holes: polygon.slice(1) };
      }
    }
  }
  if (!best) return null;
  const xs = best.ring.map(([lng]) => lng!);
  const ys = best.ring.map(([, lat]) => lat!);
  const west = Math.min(...xs);
  const east = Math.max(...xs);
  const south = Math.min(...ys);
  const north = Math.max(...ys);
  for (let row = 1; row <= 12; row++)
    for (let column = 1; column <= 12; column++) {
      const point: [number, number] = [
        west + ((east - west) * column) / 13,
        south + ((north - south) * row) / 13,
      ];
      if (insideRing(point, best.ring) && !best.holes.some((hole) => insideRing(point, hole)))
        return { point, bounds: [west, south, east, north] as Bounds };
    }
  return null;
}

type View = {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
  lng: number;
  lat: number;
  originX: number;
  originY: number;
};

/** The production idle camera receipts, which describe a real settled frame. */
async function view(page: Page): Promise<View> {
  const host = page.locator(".region-maplibre-canvas");
  await expect(host).toBeVisible();
  const box = await host.boundingBox();
  expect(box, "canvas host box").not.toBeNull();
  const data = await host.evaluate((element) => {
    const { cameraZoom, cameraLongitude, cameraLatitude, cameraOriginX, cameraOriginY } = (
      element as HTMLElement
    ).dataset;
    return { cameraZoom, cameraLongitude, cameraLatitude, cameraOriginX, cameraOriginY };
  });
  const receipt = (name: string) => {
    const parsed = Number(data[name as keyof typeof data]);
    expect(Number.isFinite(parsed), `receipt ${name}`).toBe(true);
    return parsed;
  };
  return {
    x: box!.x,
    y: box!.y,
    width: box!.width,
    height: box!.height,
    zoom: receipt("cameraZoom"),
    lng: receipt("cameraLongitude"),
    lat: receipt("cameraLatitude"),
    originX: receipt("cameraOriginX"),
    originY: receipt("cameraOriginY"),
  };
}

/** Waits for two identical readings with no camera movement, so a pointer target cannot drift. */
async function settledView(page: Page) {
  const scene = page.locator(".region-maplibre-scene");
  await expect(scene).toHaveAttribute("data-state", "ready", { timeout: 20_000 });
  let previous = JSON.stringify(await view(page));
  for (let attempt = 0; attempt < 40; attempt++) {
    await page.waitForTimeout(100);
    const serialized = JSON.stringify(await view(page));
    const moving = await scene.getAttribute("data-moving");
    if (serialized === previous && moving === null) return JSON.parse(serialized) as View;
    previous = serialized;
  }
  throw new Error("Camera receipts never settled");
}

const worldSize = (zoom: number) => 512 * 2 ** zoom;
const mercatorX = (lng: number, size: number) => ((lng + 180) / 360) * size;
const mercatorY = (lat: number, size: number) =>
  ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) /
    2) *
  size;

/** Independent Web Mercator projection of a source coordinate, using only the DOM receipts. */
function project(point: [number, number], current: View) {
  const size = worldSize(current.zoom);
  const [lng, lat] = point;
  // Longitude may pass 180 on a wrapped camera: use the world copy nearest the camera centre.
  const copy = Math.round((current.lng - lng) / 360);
  return {
    x:
      current.x +
      current.originX +
      mercatorX(lng + copy * 360, size) -
      mercatorX(current.lng, size),
    y: current.y + current.originY + mercatorY(lat, size) - mercatorY(current.lat, size),
  };
}

/** Shortest projected side of the polygon the pointer would hit, in canvas pixels. */
function targetSize(hit: { bounds: Bounds }, current: View) {
  const [west, south, east, north] = hit.bounds;
  if (east - west > 180) return 0;
  const left = project([west, (south + north) / 2], current).x;
  const right = project([east, (south + north) / 2], current).x;
  const top = project([(west + east) / 2, north], current).y;
  const bottom = project([(west + east) / 2, south], current).y;
  return Math.min(Math.abs(right - left), Math.abs(bottom - top));
}

async function previewNames(page: Page, expected: string | RegExp, timeout = 700) {
  try {
    await expect(page.locator(".region-maplibre-selection-summary strong")).toHaveText(expected, {
      timeout,
    });
    return true;
  } catch {
    return false;
  }
}

/** Real pointer hover at a reviewed interior coordinate. The receipts are re-read on every
 * attempt, so a camera that settled late cannot move the target; no synthetic pointer events. */
async function hoverRegion(
  page: Page,
  collection: Collection,
  nodeId: string,
  expected: string | RegExp,
) {
  await page.locator(".region-maplibre-scene").scrollIntoViewIfNeeded();
  const hit = target(collection, nodeId);
  expect(hit, `reviewed polygon for ${nodeId}`).not.toBeNull();
  for (let attempt = 0; attempt < 6; attempt++) {
    const current = await view(page);
    const point = project(hit!.point, current);
    await page.mouse.move(point.x, point.y);
    if (await previewNames(page, expected)) return point;
    await page.waitForTimeout(120);
  }
  throw new Error(`Real pointer never previewed ${nodeId}`);
}

async function selectRegion(
  page: Page,
  collection: Collection,
  nodeId: string,
  expected: string | RegExp,
) {
  const point = await hoverRegion(page, collection, nodeId, expected);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator(".region-maplibre")).toHaveAttribute("data-selected-node", nodeId);
}

/** Flat mode is deterministic Web Mercator, which is what the independent projection models. */
async function showFlatMap(page: Page, name = "Flat") {
  await page.getByRole("radio", { name, exact: true }).click();
  const scene = page.locator(".region-maplibre-scene");
  await expect(scene).toHaveAttribute("data-state", "ready", { timeout: 20_000 });
  await settledView(page);
}

async function expectLevel(page: Page, layer: string) {
  const scene = page.locator(".region-maplibre-scene");
  await expect(scene).toHaveAttribute("data-layer", layer, { timeout: 20_000 });
  await expect(scene).toHaveAttribute("data-state", "ready", { timeout: 20_000 });
  await expect(page.locator(".region-maplibre")).toHaveAttribute("data-map-ready", "true");
}

/** Map asset paths a level is allowed to fetch, plus the single bundled worker. */
function expectedAssets(...urls: string[]) {
  return [...new Set([...urls, WORKER.url])].sort();
}

function mapAssetPaths(page: Page) {
  const paths = new Set<string>();
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/maps/")) paths.add(path);
  });
  return paths;
}

test("mainland, Taiwan and South China Sea share real pointer, keyboard and navigation behavior", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/en/search?explore=region");
  await showFlatMap(page);
  const world = await geometry(page, WORLD.url);

  // The reviewed world layer answers one China entry through its mainland shape and five aliases:
  // Taiwan, Hong Kong, Macao, the nine-dash inset and 三沙市. That grouping is a property of the
  // downloaded production geometry, so it is verified from the bytes the browser renders.
  const aliases = [
    "ne50m:CHN",
    "ne50m:TWN",
    "ne50m:HKG",
    "ne50m:MAC",
    "datav:460300",
    "cnprov:100000_JD",
  ];
  for (const boundaryId of aliases) {
    const shape = world.features.find((feature) => feature.properties.boundaryId === boundaryId);
    expect(shape, `world geometry ${boundaryId}`).toBeDefined();
    expect(identityOf(shape!.properties), `${boundaryId} presents one China target`).toBe("geo:cn");
  }

  // The overview frames a 515px world, so the mainland is a fair pointer target here while the
  // sub-pixel aliases are verified from the downloaded geometry above.
  const current = await view(page);
  const mainland = target(world, "geo:cn");
  expect(mainland).not.toBeNull();
  expect(targetSize(mainland!, current)).toBeGreaterThanOrEqual(MIN_POINTER_TARGET);
  await selectRegion(page, world, "geo:cn", "China");
  const action = page.getByRole("link", { name: "Explore subregions", exact: true });
  await expect(action).toBeFocused();
  expect(
    new URL((await action.getAttribute("href"))!, page.url()).searchParams.get("geoNode"),
  ).toBe("geo:cn");
  expect(page.url()).toContain("explore=region");
  await page
    .locator(".region-maplibre")
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await expect(page.locator(".region-maplibre")).toHaveAttribute("data-selected-node", "");
  await expect(page.locator(".region-maplibre-selection-hint")).toBeVisible();

  // Keyboard browsing stays with the ordinary hierarchy links, and one map instance survives the
  // level change back and forth.
  const instance = await page.locator(".region-maplibre-scene").getAttribute("data-scene-instance");
  const list = page.locator(".catalog-navigation-list");
  await list.getByRole("link", { name: /China/ }).focus();
  await list.getByRole("link", { name: /China/ }).press("Enter");
  await expect(page).toHaveURL(/geoNode=geo%3Acn/);
  await expectLevel(page, "geo:cn");
  await expect(list.getByRole("link", { name: /Anhui/ })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/explore=region/);
  await expectLevel(page, "world");
  expect(await page.locator(".region-maplibre-scene").getAttribute("data-scene-instance")).toBe(
    instance,
  );
});

for (const width of [1440, 390]) {
  test(`China drilldown selects Taiwan and other zero-count regions at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const assets = mapAssetPaths(page);
    await page.goto("/en/search?explore=region&geoNode=geo:cn");
    await showFlatMap(page);
    await expectLevel(page, "geo:cn");
    const china = await geometry(page, CHINA.url);
    const originalUrl = page.url();

    for (const [boundaryId, nodeId, name] of [
      ["cnprov:540000", "geo:cn-xz", "Xizang"],
      ["cnprov:810000", "geo:hk", "Hongkong"],
      ["cnprov:820000", "geo:mo", "Macau"],
      ["cnprov:710000", "geo:tw", "Taiwan"],
    ] as const) {
      const shape = china.features.find((feature) => feature.properties.boundaryId === boundaryId);
      expect(shape, `china geometry ${boundaryId}`).toBeDefined();
      expect(shape!.properties.nodeId, `${boundaryId} node`).toBe(nodeId);
      const hit = target(china, nodeId);
      expect(hit, `reviewed polygon for ${nodeId}`).not.toBeNull();
      const current = await view(page);
      const measurable = targetSize(hit!, current) >= MIN_POINTER_TARGET;
      if (measurable) {
        // A province-sized region is a fair pointer target at this zoom.
        await selectRegion(page, china, nodeId, new RegExp(name));
      } else {
        // Macao is under two pixels here, so the reviewed shortcut is the honest route: it is an
        // ordinary 44px button, and the pointer path stays covered at the wider viewport.
        const shortcut = page.locator(`[data-region-shortcut="${nodeId}"]`);
        await expect(shortcut, `${nodeId} shortcut`).toBeVisible();
        await shortcut.click();
        await expect(page.locator(".region-maplibre")).toHaveAttribute(
          "data-selected-node",
          nodeId,
        );
      }
      const summary = page.locator(".region-maplibre-selection-summary");
      await expect(summary).toContainText(name);
      await expect(summary).toContainText("0 public versions");
      expect(page.url(), "selection stays local").toBe(originalUrl);
      // Clearing also returns the camera to this level, so the next reviewed target is in frame.
      await page
        .locator(".region-maplibre")
        .getByRole("button", { name: "Clear selection", exact: true })
        .click();
      await expect(page.locator(".region-maplibre")).toHaveAttribute("data-selected-node", "");
      await settledView(page);
    }

    // Clear restores focus to whatever triggered the selection: the shortcut button.
    const shortcut = page.locator('[data-region-shortcut="geo:tw"]');
    await shortcut.click();
    await expect(page.locator(".region-maplibre-selection-actions")).toBeVisible();
    await page
      .locator(".region-maplibre")
      .getByRole("button", { name: "Clear selection", exact: true })
      .click();
    await expect(shortcut).toBeFocused();

    // A zero-count region still offers its data, and coming back restores this exact level.
    await page.locator('[data-region-shortcut="geo:tw"]').click();
    await page.getByRole("link", { name: "View data", exact: true }).click();
    await expect(page).toHaveURL(/geoNode=geo%3Atw(?:&|$)/);
    await expect(page).toHaveURL(/explore=process/);
    await page.goBack();
    await expect(page).toHaveURL(originalUrl);
    await showFlatMap(page);
    await expect(page.locator('[data-region-shortcut="geo:tw"]')).toBeVisible();

    // Only the current level's reviewed geometry is fetched: no province previews, no repeats.
    expect([...assets].sort()).toEqual(expectedAssets(WORLD.url, CHINA.url));
  });
}

test("China zero-count administrative entries remain native links without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/en/search?explore=region&geoNode=geo:cn");
    const zero = page.locator(".catalog-zero-regions");
    await zero.locator("summary").click();
    for (const name of [/Taiwan/, /Hongkong/, /Macau/, /Xizang/]) {
      await expect(zero.getByRole("link", { name })).toBeVisible();
    }
    await zero.getByRole("link", { name: /Taiwan/ }).click();
    await expect(page).toHaveURL(/geoNode=geo%3Atw(?:&|$)/);
  } finally {
    await context.close();
  }
});

test("drills from world to a Chinese city and opens an exact public version", async ({ page }) => {
  const assets = mapAssetPaths(page);
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
  // Browsing loads the levels it shows and never an unrelated province's geometry.
  expect(
    [...assets].some((path) => path.includes("geo-cn-gd.") || path.includes("geo-cn-xj.")),
  ).toBe(false);
});

test("ordinary catalog does not fetch maps and hierarchy constraints are explicit before description search", async ({
  page,
}) => {
  const assets = mapAssetPaths(page);
  await page.goto("/en");
  await expect(page.locator("main")).toBeVisible();
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
  // Neither the home page nor an ordinary search pulls the worker or any map geometry.
  expect([...assets]).toEqual([]);
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
  await expectLevel(page, "world");
  const scene = page.locator(".region-maplibre-scene");
  const instance = await scene.getAttribute("data-scene-instance");
  const world = await settledView(page);

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**${CHINA.url}`, async (route) => {
    await gate;
    await route.continue();
  });
  await page.locator(".catalog-navigation-list").getByRole("link", { name: /China/ }).click();
  await expect(page).toHaveURL(/geoNode=geo%3Acn/);
  // A previous geographic canvas survives, but it does not masquerade as China data: it stays
  // loading, it holds no selection, and the same map instance is reused.
  await expect(scene).toHaveAttribute("data-state", "loading");
  await expect(page.locator(".region-maplibre")).toHaveAttribute("data-selected-node", "");
  await expect(page.locator(".region-maplibre-status")).toBeVisible();
  expect(await scene.getAttribute("data-scene-instance")).toBe(instance);
  release();
  await expect(scene).toHaveAttribute("data-moving", "true");
  await expect(scene).not.toHaveAttribute("data-moving");
  await expectLevel(page, "geo:cn");
  const china = await settledView(page);
  expect(china.zoom).toBeGreaterThan(world.zoom);
  expect(china.lng).not.toBeCloseTo(world.lng, 0);

  await page.locator(".catalog-navigation-list").getByRole("link", { name: /Anhui/ }).click();
  await expect(page).toHaveURL(/geoNode=geo%3Acn-ah/);
  await expectLevel(page, "geo:cn-ah");
  const province = await settledView(page);
  expect(province.zoom).toBeGreaterThan(china.zoom);
  expect(await scene.getAttribute("data-scene-instance")).toBe(instance);
  await page.goBack();
  await expect(page).toHaveURL(/geoNode=geo%3Acn(?:&|$)/);
  await expectLevel(page, "geo:cn");
  const returned = await settledView(page);
  expect(returned.zoom).toBeCloseTo(china.zoom, 1);
  await page.goBack();
  await expect(page).toHaveURL(/explore=region/);
  await expectLevel(page, "world");
  const home = await settledView(page);
  expect(home.zoom).toBeCloseTo(world.zoom, 1);

  // Reduced motion frames instantly: the camera is already in place when the level reports ready.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator(".catalog-navigation-list").getByRole("link", { name: /China/ }).click();
  await expectLevel(page, "geo:cn");
  await expect(scene).not.toHaveAttribute("data-moving");
  const instant = await view(page);
  expect(instant.zoom).toBeCloseTo(china.zoom, 1);
});

test("loads only the visible map level and serves the hashed map assets immutably", async ({
  page,
  request,
}) => {
  const assets = mapAssetPaths(page);
  await page.goto("/en/search?explore=region");
  await expectLevel(page, "world");
  await expect(page.locator(".region-maplibre-selection-hint")).toBeVisible();
  // The world level shows one reviewed layer: its own geometry, coalesced into a single request,
  // plus the bundled worker. Nothing is prefetched for other levels.
  expect([...assets].sort()).toEqual(expectedAssets(WORLD.url));

  for (const [asset, sha256] of [
    [WORLD, WORLD.sha256],
    [WORKER, WORKER.sha256],
  ] as const) {
    const response = await request.get(asset.url);
    expect(response.ok(), asset.url).toBe(true);
    expect(response.headers()["cache-control"]).toContain("immutable");
    expect(
      createHash("sha256")
        .update(await response.body())
        .digest("hex"),
    ).toBe(sha256);
  }
  // The worker must arrive as JavaScript, or a module worker cannot be constructed from it.
  const worker = await request.get(WORKER.url);
  expect(worker.headers()["content-type"]).toMatch(/javascript/u);
  // Same-origin only: no map request leaves the Portal's own origin while the canvas renders.
  const foreign: string[] = [];
  page.on("request", (originRequest) => {
    if (new URL(originRequest.url()).origin !== new URL(page.url()).origin)
      foreign.push(originRequest.url());
  });
  await page.getByRole("radio", { name: "Flat", exact: true }).click();
  await settledView(page);
  expect(foreign).toEqual([]);
});

test("legend, sources and explanation stay responsive while the map is shown", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/en/search?explore=region&geoNode=geo:cn");
    await showFlatMap(page);
    const information = page.locator(".map-information");
    await expect(information).toContainText("Matching public versions");
    await expect(information).toContainText("Fewer");
    await expect(information).toContainText("More");
    await expect(
      information.getByRole("link", { name: "Natural Earth", exact: true }),
    ).toBeVisible();
    await expect(
      information.getByRole("link", { name: "DataV GeoAtlas", exact: true }),
    ).toBeVisible();
    await information.getByRole("button", { name: "Map information", exact: true }).click();
    await expect(information).toContainText("zero matches remain selectable");
    await expect(information.getByRole("link", { name: "MapLibre", exact: true })).toHaveAttribute(
      "href",
      NOTICE.url,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      `${width}px overflow`,
    ).toBeLessThanOrEqual(1);
  }
});

test("map previews locally, keeps the explorer during drilldown, and restores URL history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const assets = mapAssetPaths(page);
  await page.goto("/en/search?explore=region&kind=process");
  await showFlatMap(page);
  await expectLevel(page, "world");
  const explorer = page.locator(".catalog-region-explorer");
  const world = await geometry(page, WORLD.url);
  // The selection itself does not navigate or fetch another level.
  const original = page.url();
  await selectRegion(page, world, "geo:cn", "China");
  await expect(page.getByRole("link", { name: "Explore subregions", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore subregions", exact: true })).toBeInViewport({
    ratio: 1,
  });
  expect(page.url()).toBe(original);
  expect([...assets].sort()).toEqual(expectedAssets(WORLD.url));
  await explorer.evaluate((element) =>
    element.setAttribute("data-persistence-probe", "same-frame"),
  );
  const instance = await page.locator(".region-maplibre-scene").getAttribute("data-scene-instance");

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
  // The same map canvas survives the transition instead of being replaced by a placeholder.
  await expect(page.locator(".region-maplibre-canvas")).toBeVisible();
  release();
  await expect(page).toHaveURL(/geoNode=geo%3Acn/);
  await expect(explorer).not.toHaveAttribute("data-pending", "true");
  await expect(explorer).toHaveAttribute("data-persistence-probe", "same-frame");
  await expectLevel(page, "geo:cn");
  // The new level starts with no selection: the old one does not follow the reader.
  await expect(page.locator(".region-maplibre")).toHaveAttribute("data-selected-node", "");
  expect(await page.locator(".region-maplibre-scene").getAttribute("data-scene-instance")).toBe(
    instance,
  );
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
    // The mobile default is the hierarchy list, and the map is an explicit opt-in.
    await expect(page.locator(".region-maplibre")).toHaveCount(0);
    await expect(page.getByRole("radio", { name: "地区列表", exact: true })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.getByRole("radio", { name: "平面", exact: true }).click();
    await expectLevel(page, "world");
    // A failing level keeps the list and offers the production retry instead of a blank canvas.
    await page.route(`**${CHINA.url}`, (route) =>
      route.fulfill({ status: 503, body: "unavailable" }),
    );
    await page.locator(".catalog-navigation-list").getByRole("link", { name: /中国/ }).click();
    await expect(page).toHaveURL(/geoNode=geo%3Acn/);
    const scene = page.locator(".region-maplibre-scene");
    await expect(scene).toHaveAttribute("data-state", "failed", { timeout: 20_000 });
    await expect(page.locator(".region-maplibre-status")).toContainText("地区列表");
    const instance = await scene.getAttribute("data-scene-instance");
    const retry = page.locator(".region-maplibre-retry").getByRole("button", {
      name: "重新加载地图",
    });
    await expect(retry).toBeVisible();
    await expect(
      page.locator(".catalog-navigation-list").getByRole("link", { name: /安徽/ }),
    ).toBeVisible();
    // Retry really restarts the install instead of repainting the failure.
    await retry.click();
    await expect(scene).toHaveAttribute("data-state", "failed", { timeout: 20_000 });
    await expect
      .poll(async () => page.locator(".region-maplibre-scene").getAttribute("data-scene-instance"))
      .not.toBe(instance);
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
  // A scope with no administrative map keeps its list and says so instead of showing a canvas.
  await expect(page.locator(".region-maplibre")).toHaveCount(0);
  await expect(page.getByText("no administrative map")).toBeVisible();
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
  await showFlatMap(page);
  await expectLevel(page, "world");
  const world = await geometry(page, WORLD.url);
  await selectRegion(page, world, "geo:cn", "China");
  const action = page.getByRole("link", { name: "Explore subregions", exact: true });
  await expect(action).toBeFocused();
  await expect(action).toBeInViewport({ ratio: 1 });
  const bounds = await action.boundingBox();
  const tray = await page.locator("[data-compare-tray]").boundingBox();
  const header = await page.locator("[data-portal-header]").boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
  expect(bounds!.y + bounds!.height).toBeLessThan(tray!.y);
  await page
    .locator(".region-maplibre")
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await expect(page.locator(".region-maplibre")).toHaveAttribute("data-selected-node", "");
  await expect(page.locator(".region-maplibre-selection-hint")).toBeVisible();
  // Clearing never strands focus outside the map region it belongs to.
  expect(
    await page.evaluate(() => document.activeElement?.closest(".region-maplibre") !== null),
  ).toBe(true);
});

test("lazy map modules keep a visible loading frame until the renderer arrives", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/search?explore=region");
  let release!: () => void;
  let deferred = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/_next/static/chunks/*.js", async (route) => {
    const response = await route.fetch();
    const body = await response.body();
    // The small view module can render its frame while the large, lazily requested SDK waits.
    if (body.byteLength > 300 * 1024) {
      deferred++;
      await gate;
    }
    await route.fulfill({ response, body });
  });
  try {
    await page.getByRole("radio", { name: "Flat", exact: true }).click();
    await expect.poll(() => deferred).toBeGreaterThan(0);
    const frame = page.locator(".region-maplibre .region-maplibre-scene");
    await expect(frame.getByRole("status")).toContainText(/Loading/i);
    expect((await frame.boundingBox())!.height).toBeGreaterThanOrEqual(380);
    await expect(page.locator(".region-maplibre canvas")).toHaveCount(0);
  } finally {
    release();
  }
  await expectLevel(page, "world");
  expect(
    (await page.locator(".region-maplibre-canvas").boundingBox())!.height,
  ).toBeGreaterThanOrEqual(380);
});
