import { expect, test, type APIRequestContext } from "@playwright/test";
import { createHash } from "node:crypto";

const processRef = "11111111-1111-1111-1111-111111111111@01.00.000";
const fixtureOrigin = `http://127.0.0.1:${process.env.PORTAL_FIXTURE_PORT ?? "4328"}`;

async function rpcReceiptCount(request: APIRequestContext, name: string, body: object) {
  const bodySha256 = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const response = await request.get(`${fixtureOrigin}/receipts/rpc/${name}/${bodySha256}`);
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { count: number }).count;
}

function parseCacheControl(value: string | undefined): Map<string, string | true> {
  expect(value, "Cache-Control header").toBeTruthy();

  const entries: Array<readonly [string, string | true]> = value!
    .split(",")
    .map((directive) => directive.trim())
    .filter(Boolean)
    .map((directive) => {
      const separator = directive.indexOf("=");
      if (separator === -1) return [directive.toLowerCase(), true] as const;

      return [
        directive.slice(0, separator).trim().toLowerCase(),
        directive
          .slice(separator + 1)
          .trim()
          .replace(/^"|"$/g, ""),
      ] as const;
    });

  return new Map(entries);
}

function numericDirective(directives: Map<string, string | true>, name: string): number {
  const value = directives.get(name);
  expect(typeof value, `${name} cache directive`).toBe("string");
  const parsed = Number(value);
  expect(Number.isFinite(parsed), `${name} cache directive`).toBe(true);
  return parsed;
}

test("keeps anonymous dynamic HTML out of shared caches", async ({ request }) => {
  for (const path of [
    "/en/search?v=1&kind=process&q=electricity",
    `/en/process/${processRef}`,
    `/en/process/${processRef}/lcia`,
  ]) {
    const response = await request.get(path);
    expect(response.ok()).toBe(true);
    const cacheControl = parseCacheControl(response.headers()["cache-control"]);
    expect(cacheControl.get("private")).toBe(true);
    expect(cacheControl.get("no-store")).toBe(true);
    expect(cacheControl.has("public")).toBe(false);
    expect(cacheControl.has("immutable")).toBe(false);
    expect(cacheControl.has("s-maxage")).toBe(false);
    expect(response.headers()["set-cookie"]).toBeUndefined();
  }
});

test("keeps prerendered HTML public and hashed assets immutable", async ({ page, request }) => {
  const home = await request.get("/en");
  expect(home.ok()).toBe(true);
  const homeCacheControl = parseCacheControl(home.headers()["cache-control"]);
  expect(numericDirective(homeCacheControl, "s-maxage")).toBeGreaterThan(0);
  expect(homeCacheControl.has("private")).toBe(false);
  expect(homeCacheControl.has("no-store")).toBe(false);
  expect(home.headers()["set-cookie"]).toBeUndefined();

  await page.goto("/en");
  const assetPath = await page.locator('script[src*="/_next/static/"]').first().getAttribute("src");
  expect(assetPath).toBeTruthy();
  const asset = await request.get(assetPath!);
  expect(asset.ok()).toBe(true);
  const assetCacheControl = parseCacheControl(asset.headers()["cache-control"]);
  expect(assetCacheControl.get("public")).toBe(true);
  expect(assetCacheControl.get("immutable")).toBe(true);
  expect(numericDirective(assetCacheControl, "max-age")).toBeGreaterThan(0);
  expect(assetCacheControl.has("private")).toBe(false);
  expect(assetCacheControl.has("no-store")).toBe(false);
});

test("reuses short public Search data without sharing dynamic HTML", async ({ request }) => {
  const query = `cache-${crypto.randomUUID()}`;
  const path = `/en/search?v=1&kind=process&q=${encodeURIComponent(query)}`;
  const searchBody = {
    p_query: query,
    p_filters: {},
    p_sort: "relevance",
    p_cursor: null,
    p_limit: 10,
  };
  const facetBody = { p_kind: "process", p_query: query, p_filters: {} };

  const first = await request.get(path);
  expect(first.ok()).toBe(true);
  const firstCacheControl = parseCacheControl(first.headers()["cache-control"]);
  expect(firstCacheControl.get("private")).toBe(true);
  expect(firstCacheControl.get("no-store")).toBe(true);
  expect(await rpcReceiptCount(request, "portal_search_processes_v2", searchBody)).toBe(1);
  expect(await rpcReceiptCount(request, "portal_facets_v2", facetBody)).toBe(1);

  const second = await request.get(path);
  expect(second.ok()).toBe(true);
  const secondCacheControl = parseCacheControl(second.headers()["cache-control"]);
  expect(secondCacheControl.get("private")).toBe(true);
  expect(secondCacheControl.get("no-store")).toBe(true);
  expect(await rpcReceiptCount(request, "portal_search_processes_v2", searchBody)).toBe(1);
  expect(await rpcReceiptCount(request, "portal_facets_v2", facetBody)).toBe(1);
});

test("collapses concurrent identical Search reads into one origin call", async ({ request }) => {
  const query = `cache-concurrent-${crypto.randomUUID()}`;
  const path = `/en/search?v=1&kind=process&q=${encodeURIComponent(query)}`;
  const searchBody = {
    p_query: query,
    p_filters: {},
    p_sort: "relevance",
    p_cursor: null,
    p_limit: 10,
  };

  const responses = await Promise.all(Array.from({ length: 4 }, () => request.get(path)));
  for (const response of responses) expect(response.ok()).toBe(true);

  expect(await rpcReceiptCount(request, "portal_search_processes_v2", searchBody)).toBe(1);
});

test("refreshes the short public Search data through the origin once the window expires", async ({
  request,
}) => {
  test.setTimeout(120_000);
  const query = `cache-stale-${crypto.randomUUID()}`;
  const path = `/en/search?v=1&kind=process&q=${encodeURIComponent(query)}`;
  const searchBody = {
    p_query: query,
    p_filters: {},
    p_sort: "relevance",
    p_cursor: null,
    p_limit: 10,
  };

  const fresh = await request.get(path);
  expect(fresh.ok()).toBe(true);
  expect(await rpcReceiptCount(request, "portal_search_processes_v2", searchBody)).toBe(1);

  await new Promise((resolve) => setTimeout(resolve, 32_000));

  const refreshed = await request.get(path);
  expect(refreshed.ok()).toBe(true);
  expect(await rpcReceiptCount(request, "portal_search_processes_v2", searchBody)).toBe(2);

  const settled = await request.get(path);
  expect(settled.ok()).toBe(true);
  expect(await rpcReceiptCount(request, "portal_search_processes_v2", searchBody)).toBe(2);
});
