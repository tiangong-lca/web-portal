import { expect, test, type Page } from "@playwright/test";

const processRef = "11111111-1111-1111-1111-111111111111@01.00.000";
const sampleCount = 4;
const artworkReadyTimeout = 15_000;

type Vitals = {
  cls: number;
  inp: number;
  interactionObserved: boolean;
  inpSupported: boolean;
  lcp: number;
  ttfb: number;
};

async function installVitalsObserver(page: Page) {
  await page.addInitScript(() => {
    const values = {
      cls: 0,
      inp: 0,
      interactionObserved: false,
      inpSupported:
        PerformanceObserver.supportedEntryTypes.includes("event") &&
        PerformanceObserver.supportedEntryTypes.includes("first-input"),
      lcp: 0,
    };
    (window as unknown as { __portalVitals: typeof values }).__portalVitals = values;
    localStorage.setItem("tiangong.portal.theme.v1", "light");

    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const latest = entries.at(-1);
      if (latest) values.lcp = latest.startTime;
    }).observe({ buffered: true, type: "largest-contentful-paint" });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
        if (!shift.hadRecentInput) values.cls += shift.value ?? 0;
      }
    }).observe({ buffered: true, type: "layout-shift" });

    if (values.inpSupported) {
      const recordInteraction = (entry: PerformanceEntry, includeWithoutInteractionId = false) => {
        const interaction = entry as PerformanceEntry & { interactionId?: number };
        if (!includeWithoutInteractionId && (interaction.interactionId ?? 0) === 0) return;
        values.interactionObserved = true;
        values.inp = Math.max(values.inp, entry.duration);
      };

      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) recordInteraction(entry);
      }).observe({ durationThreshold: 16, type: "event" } as PerformanceObserverInit);

      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) recordInteraction(entry, true);
      }).observe({ buffered: true, type: "first-input" });
    }
  });
}

async function collectVitals(page: Page, route: string): Promise<Vitals> {
  await page.goto(route);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  if (route === "/en") {
    // Measure input responsiveness with the complete runtime artwork rendering. The home page
    // renders the cinematic hero, and the lifecycle sculpture that this wait used to name is not
    // mounted by any route, so waiting for it could only ever time out. The hero publishes its own
    // readiness once its media is decoded; the timeout and every metric below are unchanged.
    await expect(page.locator(".brand-cinematic-hero")).toHaveAttribute("data-media", "ready", {
      timeout: artworkReadyTimeout,
    });
  }
  // A visible heading can precede its first painted frame. LCP stops after the first input,
  // so wait for a real paint receipt before exercising the theme control.
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __portalVitals: Omit<Vitals, "ttfb"> }).__portalVitals.lcp,
      ),
    )
    .toBeGreaterThan(0);
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  const darkTheme = page.getByRole("radio", { name: "Dark" });
  await darkTheme.click();
  await expect(darkTheme).toBeChecked();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __portalVitals: Omit<Vitals, "ttfb"> }).__portalVitals
            .interactionObserved,
      ),
    )
    .toBe(true);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as
      PerformanceNavigationTiming | undefined;
    const values = (window as unknown as { __portalVitals: Omit<Vitals, "ttfb"> }).__portalVitals;
    return {
      ...values,
      ttfb: navigation ? navigation.responseStart - navigation.startTime : Number.POSITIVE_INFINITY,
    };
  });
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * fraction) - 1] ?? Number.POSITIVE_INFINITY;
}

for (const { label, route, ttfbBudget } of [
  { label: "home", route: "/en", ttfbBudget: 800 },
  { label: "cached Process detail", route: `/en/process/${processRef}`, ttfbBudget: 800 },
]) {
  test(`${label} stays inside the local Core Web Vitals guard`, async ({ page }) => {
    test.skip(
      route === "/en" && process.env.PORTAL_WEBGL_TESTS !== "1",
      "WebGL performance is opt-in; ordinary CI validates homepage navigation separately.",
    );
    // Each navigation creates a new GPU context. Allow all four bounded samples
    // to finish on software WebGL; the per-load wait and CWV limits stay fixed.
    if (route === "/en") test.setTimeout(sampleCount * (artworkReadyTimeout + 5000));
    await installVitalsObserver(page);
    const samples: Vitals[] = [];
    for (let sample = 0; sample < sampleCount; sample += 1) {
      console.info(`${label} local CWV sample ${sample + 1}/${sampleCount}`);
      const started = Date.now();
      samples.push(await collectVitals(page, route));
      console.info(`${label} sample completed in ${Date.now() - started} ms`);
    }

    const evidence = {
      clsP75: percentile(
        samples.map(({ cls }) => cls),
        0.75,
      ),
      inpP75: percentile(
        samples.map(({ inp }) => inp),
        0.75,
      ),
      lcpP75: percentile(
        samples.map(({ lcp }) => lcp),
        0.75,
      ),
      ttfbP75: percentile(
        samples.map(({ ttfb }) => ttfb),
        0.75,
      ),
    };
    console.info(`${label} local CWV p75 ${JSON.stringify(evidence)}`);

    expect(samples.every(({ inpSupported }) => inpSupported)).toBe(true);
    expect(samples.every(({ interactionObserved }) => interactionObserved)).toBe(true);
    expect(evidence.lcpP75, JSON.stringify(evidence)).toBeGreaterThan(0);
    expect(evidence.lcpP75, JSON.stringify(evidence)).toBeLessThanOrEqual(2500);
    expect(evidence.inpP75, JSON.stringify(evidence)).toBeLessThanOrEqual(200);
    expect(evidence.clsP75, JSON.stringify(evidence)).toBeLessThanOrEqual(0.1);
    expect(evidence.ttfbP75, JSON.stringify(evidence)).toBeLessThanOrEqual(ttfbBudget);
  });
}
