import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

import { wcagContrast } from "culori";
import { describe, expect, it } from "vitest";

import { readBrandConfig, renderBrandCss } from "@/config/brand";

describe("Portal brand config", () => {
  it("uses the reviewed TianGong light and dark primary colors", () => {
    const config = readBrandConfig({});

    expect(config.lightPrimary).toBe("#5C246A");
    expect(config.darkPrimary).toBe("#9E3FFD");
    expect(config.lightLogo).toBe("/brand/logo.svg");
    expect(config.darkLogo).toBe("/brand/logo-dark.svg");
    expect(config.logoMark).toBeUndefined();
    expect(Object.keys(config.palette.light.scale)).toHaveLength(11);
    expect(Object.keys(config.palette.dark.scale)).toHaveLength(11);
    expect(
      wcagContrast(config.palette.light.primary, config.palette.light.foreground),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      wcagContrast(config.palette.dark.primary, config.palette.dark.foreground),
    ).toBeGreaterThanOrEqual(4.5);
    expect(wcagContrast(config.palette.light.link, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(wcagContrast(config.palette.dark.link, "#18181B")).toBeGreaterThanOrEqual(4.5);
  });

  it("normalizes custom primary colors and dimensions", () => {
    const config = readBrandConfig({
      PORTAL_LIGHT_PRIMARY: "#006699",
      PORTAL_DARK_PRIMARY: "#b65cff",
      PORTAL_LOGO_MARK: "/brand/logo-raster.png",
      PORTAL_LOGO_WIDTH: "256",
      PORTAL_LOGO_HEIGHT: "128",
    });

    expect(config.lightPrimary).toBe("#006699");
    expect(config.darkPrimary).toBe("#B65CFF");
    expect(config.width).toBe(256);
    expect(config.height).toBe(128);
    expect(config.logoMark).toBe("/brand/logo-raster.png");
  });

  it.each([
    ["PORTAL_LOGO_ALT_ZH", "zh-CN"],
    ["PORTAL_LOGO_ALT_EN", "en"],
    ["PORTAL_LOGO_ALT_DE", "de"],
    ["PORTAL_LOGO_ALT_FR", "fr"],
  ] as const)("bounds %s to 100 Unicode code points after trimming", (variable, locale) => {
    const astralBoundary = "😀".repeat(100);
    const asciiBoundary = "a".repeat(100);

    expect(readBrandConfig({ [variable]: `  ${astralBoundary}  ` }).alt[locale]).toBe(
      astralBoundary,
    );
    expect(() => readBrandConfig({ [variable]: `${astralBoundary}😀` })).toThrow(
      "<=100 characters",
    );
    expect(readBrandConfig({ [variable]: asciiBoundary }).alt[locale]).toBe(asciiBoundary);
    expect(() => readBrandConfig({ [variable]: `${asciiBoundary}a` })).toThrow("<=100 characters");
    expect(() => readBrandConfig({ [variable]: "   " })).toThrow(">=1 characters");
  });

  it("fails closed for malformed colors", () => {
    expect(() => readBrandConfig({ PORTAL_LIGHT_PRIMARY: "purple" })).toThrow(
      "Expected a color in #RRGGBB format",
    );
  });

  it("fails closed when a primary surface disappears into its theme background", () => {
    expect(() => readBrandConfig({ PORTAL_LIGHT_PRIMARY: "#FFFFFF" })).toThrow(
      "Brand light primary surface contrast is below 3:1",
    );
    expect(() => readBrandConfig({ PORTAL_DARK_PRIMARY: "#000000" })).toThrow(
      "Brand dark primary surface contrast is below 3:1",
    );
  });

  it("fails closed when an extreme seed collapses the scale or interactive states", () => {
    expect(() => readBrandConfig({ PORTAL_LIGHT_PRIMARY: "#000000" })).toThrow(
      "Brand light scale must contain 11 distinct colors",
    );
    expect(() => readBrandConfig({ PORTAL_DARK_PRIMARY: "#FFFFFF" })).toThrow(
      "Brand dark scale must contain 11 distinct colors",
    );
  });

  it("requires an exact HTTPS allowlist origin for remote assets", () => {
    expect(() => readBrandConfig({ PORTAL_LIGHT_LOGO: "https://assets.example/logo.svg" })).toThrow(
      "outside PORTAL_BRAND_ASSET_ORIGIN",
    );

    const config = readBrandConfig({
      PORTAL_BRAND_ASSET_ORIGIN: "https://assets.example",
      PORTAL_LIGHT_LOGO: "https://assets.example/logo.svg",
    });

    expect(config.lightLogo).toBe("https://assets.example/logo.svg");

    expect(() =>
      readBrandConfig({
        PORTAL_BRAND_ASSET_ORIGIN: "https://assets.example/path",
      }),
    ).toThrow("credential-free HTTPS origin");

    expect(() =>
      readBrandConfig({
        PORTAL_BRAND_ASSET_ORIGIN: "https://assets.example",
        PORTAL_LIGHT_LOGO: "https://user@assets.example/logo.svg",
      }),
    ).toThrow("outside PORTAL_BRAND_ASSET_ORIGIN");
  });

  it("rejects traversal-like same-origin asset paths", () => {
    expect(() => readBrandConfig({ PORTAL_LIGHT_LOGO: "/brand/../secret.svg" })).toThrow(
      "Invalid same-origin brand asset path",
    );
  });

  it("renders deployment colors into a standalone CSS artifact", () => {
    const css = renderBrandCss(
      readBrandConfig({
        PORTAL_LIGHT_PRIMARY: "#006699",
        PORTAL_DARK_PRIMARY: "#B65CFF",
      }),
    );

    expect(css).toContain("--brand-light-primary: #006699");
    expect(css).toContain("--brand-dark-primary: #B65CFF");
    expect(css).toContain("--brand-light-50:");
    expect(css).toContain("--brand-light-950:");
    expect(css).toContain("--brand-dark-primary-foreground:");
    expect(css).toContain("--brand-dark-link:");
  });

  it("keeps hash-prefixed colors intact in the checked-in env example", () => {
    const envExample = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");
    const parsed = parseEnv(envExample);

    expect(parsed.PORTAL_LIGHT_PRIMARY).toBe("#5C246A");
    expect(parsed.PORTAL_DARK_PRIMARY).toBe("#9E3FFD");
  });
});
