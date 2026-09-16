import { expect, test } from "@playwright/test";

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`cinematic images load on demand (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    const frames = new Set<string>();
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (/\/brand\/cinematic-v4\/frame-\d+\.webp$/.test(path)) frames.add(path);
    });
    await page.goto("/en");
    const hero = page.locator(".brand-cinematic-hero");
    await expect(hero).toHaveAttribute("data-media", "ready");
    // The old eager warmer dispatched all 225 remaining frames in ~1.5 seconds.
    // Observe that whole interval so a delayed eager regression cannot pass.
    await page.waitForTimeout(1800);
    expect([...frames]).toEqual(["/brand/cinematic-v4/frame-001.webp"]);
    await page.evaluate(() => window.scrollTo({ top: 500, behavior: "instant" }));
    if (reducedMotion === "reduce") {
      await expect(hero).toHaveAttribute("data-motion", "reduced");
      await page.waitForTimeout(200);
      expect(frames.size).toBe(1);
    } else {
      await expect(hero).not.toHaveAttribute("data-rendered-frame", "1");
      await expect(
        page.locator('img[data-cinematic-layer="foreground"][data-visible="true"]'),
      ).toHaveJSProperty("complete", true);
      await page.waitForTimeout(200);
      expect(frames.size).toBeGreaterThan(1);
      expect(frames.size).toBeLessThanOrEqual(4);
    }
  });
}
