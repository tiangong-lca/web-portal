import { expect, test, type Page } from "@playwright/test";

/** The classification panel is a native disclosure above the same server-rendered hierarchy. */
const panel = "details.catalog-classification-panel";

function nav(page: Page) {
  return page.getByRole("navigation", { name: "Browse categories" });
}
function row(page: Page, nodeId: string) {
  return nav(page).locator(`li[data-node-id="${nodeId}"]`);
}
function toggle(page: Page, nodeId: string) {
  return nav(page).locator(
    `li[data-node-id="${nodeId}"] > .classification-row > .classification-toggle`,
  );
}
function link(page: Page, nodeId: string) {
  return nav(page).locator(
    `li[data-node-id="${nodeId}"] > .classification-row > .classification-link`,
  );
}

type BranchQuery = { parentNodeId: string | null; cursor: string | null; kind: string };

/** Records the branch queries the tree sends and the RSC navigations it triggers, so expansion and
 * navigation stay provably separate. */
function observe(page: Page) {
  const branches: BranchQuery[] = [];
  const navigations: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/internal/navigation" && request.method() === "POST") {
      const body = request.postDataJSON() as Partial<BranchQuery>;
      branches.push({
        parentNodeId: body.parentNodeId ?? null,
        cursor: body.cursor ?? null,
        kind: body.kind ?? "",
      });
    }
    if (url.pathname.endsWith("/search") && request.headers().rsc === "1")
      navigations.push(url.search);
  });
  return { branches, navigations };
}

/** Hierarchy navigations only: an unrelated link prefetch must not be mistaken for one. */
function hierarchyNavigations(navigations: string[]) {
  return navigations.filter((search) => search.includes("classNode="));
}

async function expand(page: Page, nodeId: string) {
  await expect(toggle(page, nodeId)).toHaveAttribute("aria-expanded", "false");
  await toggle(page, nodeId).click();
  await expect(toggle(page, nodeId)).toHaveAttribute("aria-expanded", "true");
}

async function collapse(page: Page, nodeId: string) {
  await expect(toggle(page, nodeId)).toHaveAttribute("aria-expanded", "true");
  await toggle(page, nodeId).click();
  await expect(toggle(page, nodeId)).toHaveAttribute("aria-expanded", "false");
}

test("expands a category branch without navigating or changing results", async ({ page }) => {
  const { branches, navigations } = observe(page);
  await page.goto("/en/search?explore=process");
  await expect(row(page, "class:isic")).toBeVisible();
  await expect(row(page, "class:isic")).toContainText("Industry categories (ISIC)");
  // Only the root branch is hydrated: the tree never pulls the vocabulary up front.
  expect(branches).toEqual([]);
  await expect(nav(page).locator("li[data-node-id]")).toHaveCount(1);

  const url = page.url();
  const results = await page.locator("#results-heading").textContent();
  await expand(page, "class:isic");
  await expect(row(page, "class:isic:0")).toContainText("Agriculture, forestry and fishing");
  // A disclosure press is one branch query: no hierarchy navigation, no URL change, same results.
  expect(branches).toEqual([{ parentNodeId: "class:isic", cursor: null, kind: "process" }]);
  expect(hierarchyNavigations(navigations)).toEqual([]);
  expect(page.url()).toBe(url);
  expect(await page.locator("#results-heading").textContent()).toBe(results);
  await expect(link(page, "class:isic:0")).not.toHaveAttribute("aria-current", "page");
});

test("pages a category branch in place, merges the page and reuses the cached branch", async ({
  page,
}) => {
  const { branches, navigations } = observe(page);
  await page.goto("/en/search?explore=process");
  await expand(page, "class:isic");
  await expand(page, "class:isic:0");
  await expect(row(page, "class:isic:0.0")).toContainText("Crop and animal production");
  await expect(row(page, "class:isic:0.1")).toContainText("Forestry and logging");
  await expect(row(page, "class:isic:0.2")).toHaveCount(0);
  expect(branches.map((query) => query.parentNodeId)).toEqual(["class:isic", "class:isic:0"]);

  const url = page.url();
  const results = await page.locator("#results-heading").textContent();
  const more = nav(page).getByRole("link", { name: "Load more categories" });
  await expect(more).toBeVisible();
  // The paging link still carries the real cursor for a reader without JavaScript.
  expect(
    new URL((await more.getAttribute("href"))!, page.url()).searchParams.get("navCursor"),
  ).toBe("isic-a2");
  await more.click();
  await expect(row(page, "class:isic:0.2")).toContainText("Fishing and aquaculture");
  // The next page arrives in place: merged with the first, with no navigation and no URL change.
  await expect(row(page, "class:isic:0.0")).toBeVisible();
  await expect(row(page, "class:isic:0.1")).toBeVisible();
  await expect(nav(page).getByRole("link", { name: "Load more categories" })).toHaveCount(0);
  expect(branches.at(-1)).toEqual({
    parentNodeId: "class:isic:0",
    cursor: "isic-a2",
    kind: "process",
  });
  expect(hierarchyNavigations(navigations)).toEqual([]);
  expect(page.url()).toBe(url);
  expect(await page.locator("#results-heading").textContent()).toBe(results);

  // Collapsing and reopening is served from the branch cache, not another query.
  const queried = branches.length;
  await collapse(page, "class:isic:0");
  await expand(page, "class:isic:0");
  await expect(row(page, "class:isic:0.2")).toBeVisible();
  expect(branches.length).toBe(queried);
});

test("selects a parent and a child by link, and a deep link restores its ancestor path", async ({
  page,
}) => {
  const { branches, navigations } = observe(page);
  await page.goto("/en/search?explore=process");
  await expand(page, "class:isic");
  await expand(page, "class:isic:0");
  const queried = branches.length;

  await link(page, "class:isic:0").click();
  await expect(page).toHaveURL(/classNode=class%3Aisic%3A0(?:&|$)/);
  await expect(page).toHaveURL(/classScope=subtree/);
  await expect(link(page, "class:isic:0")).toHaveAttribute("aria-current", "page");
  // The hierarchy link is a real navigation, and selecting a category is not a reason to re-query
  // the branches that are already open.
  expect(hierarchyNavigations(navigations).length).toBeGreaterThanOrEqual(1);
  expect(branches.length).toBe(queried);

  await link(page, "class:isic:0.1").click();
  await expect(page).toHaveURL(/classNode=class%3Aisic%3A0\.1(?:&|$)/);
  await expect(link(page, "class:isic:0.1")).toHaveAttribute("aria-current", "page");
  await expect(link(page, "class:isic:0")).not.toHaveAttribute("aria-current", "page");

  // A deep link hydrates the whole ancestor path from the server: the tree opens by itself and the
  // client queries nothing for it.
  const queriedBefore = branches.length;
  await page.goto("/en/search?explore=process&classNode=class%3Aisic%3A0.0&classScope=subtree");
  await expect(link(page, "class:isic:0.0")).toHaveAttribute("aria-current", "page");
  await expect(toggle(page, "class:isic")).toHaveAttribute("aria-expanded", "true");
  await expect(toggle(page, "class:isic:0")).toHaveAttribute("aria-expanded", "true");
  await expect(row(page, "class:isic:0.0")).toContainText(
    "Crop and animal production, hunting and related service activities",
  );
  expect(branches.length).toBe(queriedBefore);
});

test("keeps process and flow expansion separate and preserved across the kind switch", async ({
  page,
}) => {
  const { branches } = observe(page);
  await page.goto("/en/search?explore=process");
  await expand(page, "class:isic");
  await expand(page, "class:isic:0");
  await expect(row(page, "class:isic:0.1")).toBeVisible();
  const queried = branches.length;

  await page
    .locator(".catalog-kind-switch")
    .getByRole("link", { name: "Flow", exact: true })
    .click();
  await expect(page).toHaveURL(/kind=flow/);
  const flow = nav(page);
  await expect(flow).toHaveAttribute("data-classification-kind", "flow");
  await expect(row(page, "class:cpc")).toContainText("Product categories (CPC)");
  await expect(row(page, "class:cpc:0")).toHaveCount(0);
  await expect(nav(page).locator('li[data-node-id^="class:isic"]')).toHaveCount(0);
  // The flow tree comes from the server with the new kind: switching kinds queries nothing.
  expect(branches.length).toBe(queried);

  await page
    .locator(".catalog-kind-switch")
    .getByRole("link", { name: "Process", exact: true })
    .click();
  await expect(page).toHaveURL(/kind=process/);
  await expect(nav(page)).toHaveAttribute("data-classification-kind", "process");
  // What was open stays open, and the cached branches answer without another query.
  await expect(toggle(page, "class:isic")).toHaveAttribute("aria-expanded", "true");
  await expect(toggle(page, "class:isic:0")).toHaveAttribute("aria-expanded", "true");
  await expect(row(page, "class:isic:0.1")).toBeVisible();
  expect(branches.length).toBe(queried);
  // No branch query ever crossed kinds: every one of them was a process query.
  expect(branches.every((query) => query.kind === "process")).toBe(true);
});

test("offers the production retry when a branch query fails, then recovers", async ({ page }) => {
  let failed = false;
  await page.route("**/internal/navigation", async (route) => {
    const body = route.request().postDataJSON() as Partial<BranchQuery>;
    if (!failed && body.parentNodeId === "class:isic") {
      failed = true;
      await route.fulfill({ status: 503, body: "unavailable" });
      return;
    }
    await route.continue();
  });
  await page.goto("/en/search?explore=process");
  await expand(page, "class:isic");
  const error = nav(page).locator('li[data-node-id="class:isic"] .classification-error');
  await expect(error).toContainText("This part of the classification is temporarily unavailable.");
  // The failed branch stops loading instead of sitting on its spinner.
  await expect(
    nav(page).locator('li[data-node-id="class:isic"] .classification-status'),
  ).toHaveCount(0);
  await expect(row(page, "class:isic:0")).toHaveCount(0);

  await error.getByRole("button", { name: "Reload categories" }).click();
  await expect(row(page, "class:isic:0")).toContainText("Agriculture, forestry and fishing");
  await expect(error).toHaveCount(0);
});

test("pages a category branch through its native link without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/en/search?explore=process&classNode=class%3Aisic%3A0&classScope=subtree");
    await expect(row(page, "class:isic:0.0")).toContainText("Crop and animal production");
    await expect(row(page, "class:isic:0.1")).toContainText("Forestry and logging");
    // Without JavaScript the disclosure buttons are hidden and only the links remain.
    await expect(toggle(page, "class:isic")).toBeHidden();
    const more = nav(page).getByRole("link", { name: "Load more categories" });
    await expect(more).toBeVisible();
    expect(
      new URL((await more.getAttribute("href"))!, page.url()).searchParams.get("navCursor"),
    ).toBe("isic-a2");
    await more.click();
    await expect(page).toHaveURL(/navCursor=isic-a2/);
    await expect(row(page, "class:isic:0.2")).toContainText("Fishing and aquaculture");
  } finally {
    await context.close();
  }
});

test("keeps category hierarchy and disclosure usable without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    await page.goto("/en/search?explore=process&classNode=class%3Aisic%3A0&classScope=subtree");
    // The panel is a native disclosure, and the hierarchy is a tree of real links.
    const summary = page.locator(`${panel} > summary`);
    await expect(nav(page).locator('li[data-node-id="class:isic"]')).toBeVisible();
    expect(
      new URL(
        (await link(page, "class:isic:0.0").getAttribute("href"))!,
        page.url(),
      ).searchParams.get("classNode"),
    ).toBe("class:isic:0.0");
    await summary.click();
    await expect(page.locator(panel)).not.toHaveAttribute("open");
    await expect(nav(page).locator('li[data-node-id="class:isic"]')).toBeHidden();
    await summary.click();
    await expect(page.locator(panel)).toHaveAttribute("open");

    await link(page, "class:isic:0.0").click();
    await expect(page).toHaveURL(/classNode=class%3Aisic%3A0\.0(?:&|$)/);
    await expect(link(page, "class:isic:0.0")).toHaveAttribute("aria-current", "page");
    await expect(toggle(page, "class:isic:0")).toHaveAttribute("aria-expanded", "true");
  } finally {
    await context.close();
  }
});
