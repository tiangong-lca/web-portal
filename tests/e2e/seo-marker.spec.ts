import { expect, test } from "@playwright/test";

/**
 * Provider ownership marker, opt-in through the SEO evidence lane.
 *
 * The locale homes are ISR-prerendered, so the marker has to be present at build and at runtime;
 * the default lane therefore skips this spec and keeps its own fixture build unchanged. When the
 * lane runs without a configured code the same spec proves the opposite: no page publishes one.
 */
const marker = (process.env.BAIDU_SITE_VERIFICATION ?? "").trim();
const homes = ["/zh-CN/", "/en/", "/de/", "/fr/"];

test.skip(
  process.env.PORTAL_SEO_EVIDENCE !== "1",
  "Opt-in SEO evidence lane (PORTAL_SEO_EVIDENCE=1) runs the ownership marker proof.",
);

test("publishes the configured verification marker on every locale home, and none when unset", async ({
  page,
}) => {
  for (const home of homes) {
    await page.goto(home);
    const markers = page.locator('meta[name="baidu-site-verification"]');
    expect(await markers.count(), `${home} marker count`).toBe(marker ? 1 : 0);
    if (marker) await expect(markers).toHaveAttribute("content", marker);
  }
});
