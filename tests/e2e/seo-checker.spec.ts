import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

/**
 * Runs the pinned shared SEO checker against the fixture-backed server that Playwright already
 * started, so the lane adds no build and no second runtime. Opt-in through SEO_CHECKER_PATH; the
 * origin must be indexable because the checker's HTTP mode verifies a production-shaped surface,
 * which the SEO evidence lane configures for the fixture host.
 */
const checkerPath = process.env.SEO_CHECKER_PATH?.trim() ?? "";

test.skip(
  checkerPath.length === 0,
  "Opt-in shared SEO checker (SEO_CHECKER_PATH) runs against the fixture origin.",
);

test("the pinned shared checker reports no findings for the fixture origin", async ({
  page,
}, testInfo) => {
  const origin = testInfo.project.use.baseURL;
  if (typeof origin !== "string" || origin.length === 0) {
    throw new Error("The SEO checker lane requires the Playwright baseURL origin.");
  }
  // The fixture-backed server must already answer before the checker samples it.
  expect((await page.goto("/"))?.status()).toBe(200);
  const report = testInfo.outputPath("seo-report.json");
  let failure = "";
  try {
    await promisify(execFile)(
      "python3",
      [checkerPath, "--origin", origin, "--sample", "12", "--output", report],
      { timeout: 180_000, maxBuffer: 8 * 1024 * 1024 },
    );
  } catch (error) {
    failure =
      String((error as { stdout?: string; stderr?: string }).stdout ?? "") +
      String((error as { stderr?: string }).stderr ?? "");
  }

  const parsed = JSON.parse(await fs.readFile(report, "utf8")) as {
    complete?: boolean;
    findings?: unknown[];
  };
  expect(parsed.complete, failure).toBe(true);
  expect(parsed.findings, failure).toEqual([]);
});
