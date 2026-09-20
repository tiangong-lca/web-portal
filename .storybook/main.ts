import type { StorybookConfig } from "@storybook/nextjs-vite";
import { fileURLToPath } from "node:url";

const config: StorybookConfig = {
  stories: ["./stories/**/*.stories.tsx"],
  staticDirs: ["./public", "../public"],
  framework: "@storybook/nextjs-vite",
  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "@storybook/addon-vitest",
    "@storybook/addon-mcp",
  ],
  core: { disableTelemetry: true },
  features: {
    componentsManifest: true,
    changeDetection: true,
    experimentalReview: true,
    experimentalReactComponentMeta: true,
  },
  typescript: {
    reactDocgen: "react-docgen-typescript",
    reactDocgenTypescriptOptions: {
      include: ["src/**/*.tsx", ".storybook/**/*.tsx"],
      shouldExtractLiteralValuesFromEnum: true,
      shouldRemoveUndefinedFromOptional: true,
    },
  },
  async viteFinal(config) {
    const { mergeConfig } = await import("vite");
    return mergeConfig(config, {
      // staticDirs owns both asset roots. Vite's second copy races the same output
      // directory on CI (EEXIST for storybook-static/maps).
      publicDir: false,
      optimizeDeps: {
        include: [
          "three",
          "three/addons/loaders/GLTFLoader.js",
          "three/addons/lights/RectAreaLightUniformsLib.js",
        ],
      },
      resolve: {
        alias: {
          "next-intl/server": fileURLToPath(new URL("./intl-server.mock.ts", import.meta.url)),
          "@/server/brand": fileURLToPath(new URL("./brand.mock.ts", import.meta.url)),
        },
      },
    });
  },
};

export default config;
