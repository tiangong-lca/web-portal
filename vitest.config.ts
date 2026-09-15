import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";

const webGLTests = process.env.PORTAL_WEBGL_TESTS === "1";
const parallelFiles = !webGLTests && !process.env.CI;
const softwareWebGL =
  Boolean(process.env.CI) || process.env.PORTAL_STORYBOOK_SOFTWARE_WEBGL === "1";

/** Browser settings; opt-in WebGL runs may use software rendering. */
export const storybookBrowserLaunchOptions = {
  channel: "chromium",
  // Select Chromium's software OpenGL driver explicitly on GPU-less test hosts.
  args: softwareWebGL ? ["--use-gl=angle", "--use-angle=swiftshader"] : [],
};

export default defineConfig({
  plugins: [
    storybookTest({
      configDir: fileURLToPath(new URL("./.storybook", import.meta.url)),
      tags: webGLTests ? { include: ["webgl"] } : { skip: ["webgl"] },
    }),
  ],
  test: {
    name: "storybook",
    // Local ordinary stories may overlap; hosted rendering and WebGL remain serial.
    fileParallelism: parallelFiles,
    maxWorkers: parallelFiles ? 2 : 1,
    // Software WebGL shader compilation shares the deadline with the full interaction flow.
    testTimeout: 30000,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ launchOptions: storybookBrowserLaunchOptions }),
      instances: [{ browser: "chromium" }],
    },
  },
});
