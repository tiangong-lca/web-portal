// @vitest-environment node
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const probe = `
  import { resolveConfig } from 'vitest/node';
  const { vitestConfig: config } = await resolveConfig({ config: 'vitest.config.ts' });
  console.log('PORTAL_STORYBOOK_CONFIG:' + JSON.stringify({
    fileParallelism: config.fileParallelism,
    browserFileParallelism: config.browser.fileParallelism,
    maxWorkers: config.maxWorkers,
    testTimeout: config.testTimeout,
    retry: config.retry ?? null,
    isolate: config.isolate,
    headless: config.browser.headless,
    provider: config.browser.provider.name,
    launchOptions: config.browser.provider.options.launchOptions,
  }));
`;

function resolveStorybook(environment: NodeJS.ProcessEnv) {
  const env = { ...process.env };
  for (const key of [
    "CI",
    "PORTAL_WEBGL_TESTS",
    "PORTAL_STORYBOOK_SOFTWARE_WEBGL",
    "VITEST_MAX_WORKERS",
  ]) {
    delete env[key];
  }
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", probe], {
    cwd: process.cwd(),
    env: { ...env, ...environment },
    encoding: "utf8",
    timeout: 15_000,
  });
  expect(result.error).toBeUndefined();
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  const output = result.stdout
    .split("\n")
    .find((line) => line.startsWith("PORTAL_STORYBOOK_CONFIG:"));
  expect(output).toBeDefined();
  return JSON.parse(output!.slice("PORTAL_STORYBOOK_CONFIG:".length));
}

describe("resolved Storybook execution lanes", () => {
  it.each([
    { name: "ordinary local", environment: {}, parallel: true, workers: 2, software: false },
    { name: "ordinary CI", environment: { CI: "1" }, parallel: true, workers: 2, software: true },
    {
      name: "software rendering without the WebGL lane",
      environment: { PORTAL_STORYBOOK_SOFTWARE_WEBGL: "1", PORTAL_WEBGL_TESTS: "0" },
      parallel: true,
      workers: 2,
      software: true,
    },
    {
      name: "explicit WebGL CI",
      environment: { CI: "1", PORTAL_WEBGL_TESTS: "1" },
      parallel: false,
      workers: 1,
      software: true,
    },
  ])(
    "keeps $name within its worker and renderer boundary",
    ({ environment, parallel, workers, software }) => {
      const config = resolveStorybook(environment);
      expect(config).toEqual({
        fileParallelism: parallel,
        browserFileParallelism: parallel,
        maxWorkers: workers,
        testTimeout: 30_000,
        retry: null,
        isolate: true,
        headless: true,
        provider: "playwright",
        launchOptions: {
          channel: "chromium",
          args: software ? ["--use-gl=angle", "--use-angle=swiftshader"] : [],
        },
      });
    },
  );
});
