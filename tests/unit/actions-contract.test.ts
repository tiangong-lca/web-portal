// @vitest-environment node
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const setupNode = "actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0";
const artifact = "actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2";

describe("reviewed Actions inputs", () => {
  it.each([
    [".github/workflows/ci.yml", 3],
    [".github/workflows/webgl.yml", 1],
  ] as const)("preserves exact Node and pnpm setup in %s", (path, count) => {
    const workflow = read(path);
    const setupSteps = [
      ...workflow.matchAll(/      - name: Set up Node\n([\s\S]*?)(?=\n      - name:)/g),
    ];
    expect(setupSteps).toHaveLength(count);
    for (const [, step] of setupSteps) {
      expect(step.trim()).toBe(
        `uses: ${setupNode}\n        with:\n          node-version-file: .node-version`,
      );
    }
    expect(
      workflow.match(/corepack enable\n          corepack prepare pnpm@11\.24\.0 --activate/g),
    ).toHaveLength(count);
    expect(workflow.match(/run: pnpm install --frozen-lockfile\n/g)).toHaveLength(count);
    expect(workflow).not.toMatch(
      /pnpm\/action-setup@|cache:|registry-url:|NODE_AUTH_TOKEN|ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION/,
    );
  });

  it("keeps the selected application runtime separate from the action runtime", () => {
    const manifest = JSON.parse(read("package.json"));
    expect(read(".node-version").trim()).toBe("24.18.0");
    expect(manifest.engines.node).toBe(">=24.18.0 <25");
    expect(manifest.packageManager).toBe("pnpm@11.24.0");
    expect(manifest.engines.pnpm).toBe("11.24.0");
    expect(manifest.devEngines?.packageManager).toBeUndefined();
  });

  it("preserves the failure-report artifact identity and defaults", () => {
    const workflow = read(".github/workflows/ci.yml");
    const step = workflow.match(
      /      - name: Upload shared SEO checker report\n([\s\S]*?)(?=\n      - name:)/,
    )?.[1];
    expect(step?.trim()).toBe(
      `if: always()\n        uses: ${artifact}\n        with:\n          name: portal-seo-checker-report\n          path: test-results/**/seo-report.json\n          if-no-files-found: warn`,
    );
    expect(workflow.match(/uses: actions\/upload-artifact@/g)).toHaveLength(1);
  });
});
