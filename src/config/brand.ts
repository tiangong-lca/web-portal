import { z } from "zod";

import {
  assertBrandPaletteContrast,
  createBrandThemePalette,
  type BrandThemePalette,
} from "./brand-palette";

const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Expected a color in #RRGGBB format")
  .transform((value) => value.toUpperCase());

const optionalHttpsOriginSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === "" ? undefined : value))
  .pipe(
    z
      .url()
      .refine((value) => {
        const url = new URL(value);

        return (
          url.protocol === "https:" &&
          url.username === "" &&
          url.password === "" &&
          url.pathname === "/" &&
          url.search === "" &&
          url.hash === ""
        );
      }, "Brand asset origin must be a credential-free HTTPS origin")
      .optional(),
  );

const rawBrandConfigSchema = z.object({
  lightPrimary: hexColorSchema.default("#5C246A"),
  darkPrimary: hexColorSchema.default("#9E3FFD"),
  version: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._-]{1,64}$/)
    .default("default-v1"),
  lightLogo: z.string().trim().min(1).default("/brand/logo.svg"),
  darkLogo: z.string().trim().min(1).default("/brand/logo-dark.svg"),
  logoMark: z.string().trim().optional(),
  favicon: z.string().trim().min(1).default("/brand/favicon.ico"),
  altZh: z.string().trim().min(1).max(100).default("天工 LCA"),
  altEn: z.string().trim().min(1).max(100).default("TianGong LCA"),
  altDe: z.string().trim().min(1).max(100).default("TianGong LCA"),
  altFr: z.string().trim().min(1).max(100).default("TianGong LCA"),
  width: z.coerce.number().positive().max(4096).default(170.08),
  height: z.coerce.number().positive().max(4096).default(170.08),
  socialImage: z.string().trim().min(1).default("/brand/social-card.png"),
  socialWidth: z.coerce.number().int().positive().max(4096).default(1200),
  socialHeight: z.coerce.number().int().positive().max(4096).default(630),
  assetOrigin: optionalHttpsOriginSchema,
});

export type BrandConfig = {
  lightPrimary: string;
  darkPrimary: string;
  version: string;
  lightLogo: string;
  darkLogo: string;
  logoMark?: string;
  favicon: string;
  alt: {
    "zh-CN": string;
    en: string;
    de: string;
    fr: string;
  };
  width: number;
  height: number;
  socialImage: string;
  socialWidth: number;
  socialHeight: number;
  palette: {
    dark: BrandThemePalette;
    light: BrandThemePalette;
  };
  assetOrigin?: string;
};

export type BrandEnvironment = Record<string, string | undefined> &
  Partial<
    Record<
      | "PORTAL_LIGHT_PRIMARY"
      | "PORTAL_DARK_PRIMARY"
      | "PORTAL_BRAND_VERSION"
      | "PORTAL_LIGHT_LOGO"
      | "PORTAL_DARK_LOGO"
      | "PORTAL_LOGO_MARK"
      | "PORTAL_FAVICON"
      | "PORTAL_LOGO_ALT_ZH"
      | "PORTAL_LOGO_ALT_EN"
      | "PORTAL_LOGO_ALT_DE"
      | "PORTAL_LOGO_ALT_FR"
      | "PORTAL_LOGO_WIDTH"
      | "PORTAL_LOGO_HEIGHT"
      | "PORTAL_SOCIAL_IMAGE"
      | "PORTAL_SOCIAL_WIDTH"
      | "PORTAL_SOCIAL_HEIGHT"
      | "PORTAL_BRAND_ASSET_ORIGIN",
      string | undefined
    >
  >;

function normalizeAssetReference(value: string, allowedOrigin?: string): string {
  if (value.startsWith("/brand/")) {
    const decodedPath = decodeURIComponent(value);

    if (
      decodedPath.includes("..") ||
      decodedPath.includes("\\") ||
      value.includes("?") ||
      value.includes("#")
    ) {
      throw new Error(`Invalid same-origin brand asset path: ${value}`);
    }

    return value;
  }

  const url = new URL(value);

  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    !allowedOrigin ||
    url.origin !== new URL(allowedOrigin).origin
  ) {
    throw new Error(`Remote brand asset is outside PORTAL_BRAND_ASSET_ORIGIN: ${value}`);
  }

  return url.toString();
}

export function readBrandConfig(environment: BrandEnvironment = process.env): BrandConfig {
  const raw = rawBrandConfigSchema.parse({
    lightPrimary: environment.PORTAL_LIGHT_PRIMARY,
    darkPrimary: environment.PORTAL_DARK_PRIMARY,
    version: environment.PORTAL_BRAND_VERSION,
    lightLogo: environment.PORTAL_LIGHT_LOGO,
    darkLogo: environment.PORTAL_DARK_LOGO,
    logoMark: environment.PORTAL_LOGO_MARK,
    favicon: environment.PORTAL_FAVICON,
    altZh: environment.PORTAL_LOGO_ALT_ZH,
    altEn: environment.PORTAL_LOGO_ALT_EN,
    altDe: environment.PORTAL_LOGO_ALT_DE,
    altFr: environment.PORTAL_LOGO_ALT_FR,
    width: environment.PORTAL_LOGO_WIDTH,
    height: environment.PORTAL_LOGO_HEIGHT,
    socialImage: environment.PORTAL_SOCIAL_IMAGE,
    socialWidth: environment.PORTAL_SOCIAL_WIDTH,
    socialHeight: environment.PORTAL_SOCIAL_HEIGHT,
    assetOrigin: environment.PORTAL_BRAND_ASSET_ORIGIN,
  });

  const lightLogo = normalizeAssetReference(raw.lightLogo, raw.assetOrigin);
  const lightPalette = createBrandThemePalette(raw.lightPrimary, "light");
  const darkPalette = createBrandThemePalette(raw.darkPrimary, "dark");
  assertBrandPaletteContrast(lightPalette, "light");
  assertBrandPaletteContrast(darkPalette, "dark");

  return {
    lightPrimary: raw.lightPrimary,
    darkPrimary: raw.darkPrimary,
    version: raw.version,
    lightLogo,
    darkLogo: normalizeAssetReference(raw.darkLogo, raw.assetOrigin),
    ...(raw.logoMark ? { logoMark: normalizeAssetReference(raw.logoMark, raw.assetOrigin) } : {}),
    favicon: normalizeAssetReference(raw.favicon, raw.assetOrigin),
    alt: {
      "zh-CN": raw.altZh,
      en: raw.altEn,
      de: raw.altDe,
      fr: raw.altFr,
    },
    width: raw.width,
    height: raw.height,
    socialImage: normalizeAssetReference(raw.socialImage, raw.assetOrigin),
    socialWidth: raw.socialWidth,
    socialHeight: raw.socialHeight,
    palette: {
      dark: darkPalette,
      light: lightPalette,
    },
    ...(raw.assetOrigin ? { assetOrigin: raw.assetOrigin } : {}),
  };
}

export function renderBrandCss(config: BrandConfig): string {
  const variables = (["light", "dark"] as const).flatMap((theme) => {
    const palette = config.palette[theme];
    return [
      ...brandScaleVariables(theme, palette),
      `  --brand-${theme}-primary: ${palette.primary};`,
      `  --brand-${theme}-primary-hover: ${palette.hover};`,
      `  --brand-${theme}-primary-active: ${palette.active};`,
      `  --brand-${theme}-primary-subtle: ${palette.subtle};`,
      `  --brand-${theme}-primary-foreground: ${palette.foreground};`,
      `  --brand-${theme}-link: ${palette.link};`,
      `  --brand-${theme}-ring: ${palette.ring};`,
    ];
  });
  return `:root {\n${variables.join("\n")}\n}\n`;
}

function brandScaleVariables(theme: "light" | "dark", palette: BrandThemePalette): string[] {
  return Object.entries(palette.scale).map(
    ([step, color]) => `  --brand-${theme}-${step}: ${color};`,
  );
}
