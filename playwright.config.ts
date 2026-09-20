import { defineConfig, devices } from "@playwright/test";

import environmentFixture from "./tests/fixtures/portal/r1-environments.json" with { type: "json" };

function readPort(name: "PORTAL_E2E_PORT" | "PORTAL_FIXTURE_PORT", fallback: number): number {
  const value = process.env[name] ?? String(fallback);

  if (!/^\d+$/u.test(value)) throw new Error(`${name} must be a decimal TCP port.`);
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be between 1 and 65535.`);
  }
  return port;
}

const portalE2ePort = readPort("PORTAL_E2E_PORT", 4317);
const portalFixturePort = readPort("PORTAL_FIXTURE_PORT", 4328);
const portalE2eUrl = `http://127.0.0.1:${String(portalE2ePort)}`;
const portalFixtureUrl = `http://127.0.0.1:${String(portalFixturePort)}`;
const previewFixture = environmentFixture.preview;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: portalE2eUrl,
    launchOptions:
      process.env.CI || process.env.PORTAL_WEBGL_TESTS === "1"
        ? { args: ["--use-gl=angle", "--use-angle=swiftshader"] }
        : undefined,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chromium" },
    },
  ],
  webServer: [
    {
      name: "Portal R1 fixture",
      command: `pnpm fixture:r1 --environment preview --host 127.0.0.1 --port ${String(portalFixturePort)}`,
      url: `${portalFixtureUrl}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    },
    {
      name: "Portal",
      command: `pnpm start --hostname 127.0.0.1 --port ${String(portalE2ePort)}`,
      url: portalE2eUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
      env: {
        SITE_URL: portalE2eUrl,
        PORTAL_SITEMAP_CACHE_MODE: "shared-300",
        SUPABASE_URL: portalFixtureUrl,
        SUPABASE_PUBLISHABLE_KEY: previewFixture.publishableKey,
        PORTAL_SUPABASE_TIMEOUT_MS: "2000",
        PORTAL_EDGE_ENDPOINT: portalFixtureUrl,
        PORTAL_EDGE_KEY_ID: previewFixture.keyId,
        PORTAL_EDGE_HMAC_SECRET: previewFixture.hmacSecret,
        PORTAL_EDGE_TIMEOUT_MS: "2000",
      },
    },
  ],
});
