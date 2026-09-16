import type { Metadata } from "next";

import { defaultLocale, localePath, locales, type PortalLocale } from "@/i18n/routing";
import { brandConfig } from "@/server/brand";

const openGraphLocales: Record<PortalLocale, string> = {
  "zh-CN": "zh_CN",
  en: "en_US",
  de: "de_DE",
  fr: "fr_FR",
};

/**
 * The origin every public URL is published from.
 *
 * A production deployment must name its public origin: a missing, blank or non-origin value fails
 * closed instead of silently publishing loopback URLs, which is how a wrong canonical or sitemap
 * would otherwise reach search engines unnoticed. An explicit loopback origin stays valid, because
 * local runs, CI fixtures and the fixture-backed E2E lane deliberately serve from their own host;
 * the returned origin never carries a path or credentials.
 */
export function publicSiteUrl(env: Record<string, string | undefined> = process.env): URL {
  const raw = env.SITE_URL?.trim();
  if (!raw) {
    if (env.NODE_ENV === "production") {
      throw new Error("SITE_URL must name the public origin in production; it is unset.");
    }
    return new URL("http://localhost:3000");
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`SITE_URL must be an absolute http(s) origin; received ${raw}`);
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error(`SITE_URL must be a credential-free http(s) origin; received ${raw}`);
  }
  return new URL(parsed.origin);
}

/**
 * Provider ownership verification for the canonical public origin, published only when the
 * deployment supplies the code. The token is a public value but stays in the environment, so an
 * unset value publishes no marker at all rather than a stale or placeholder one.
 */
export function siteVerificationMetadata(
  env: Record<string, string | undefined> = process.env,
): Pick<Metadata, "verification"> {
  const baidu = env.BAIDU_SITE_VERIFICATION?.trim();
  return baidu ? { verification: { other: { "baidu-site-verification": baidu } } } : {};
}

/**
 * Single source of truth for the public indexing gate, read by `src/app/robots.ts` and by every
 * page's robots directive. Page metadata is defense-in-depth beside the crawl rules, never a
 * replacement for them: while robots.txt disallows a path, a crawler does not fetch it, so a
 * `noindex` there cannot be read and its presence is not proof of removal.
 */
export function publicIndexingEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.PORTAL_PUBLIC_INDEXING === "enabled";
}

/**
 * Same-content default-language URL. `/` only redirects to `/zh-CN`, so an `x-default` pointing at
 * `/` would advertise a redirect; every path, including the site root, resolves to its real page.
 */
export function defaultLanguagePath(path: string): string {
  return localePath(defaultLocale, path.replace(/^\/+/, ""));
}

type LocalizedMetadataInput = {
  locale: PortalLocale;
  path?: string;
  title: string;
  description: string;
  index?: boolean;
  follow?: boolean;
};

export function localizedMetadata({
  description,
  follow = true,
  index,
  locale,
  path = "",
  title,
}: LocalizedMetadataInput): Metadata {
  const normalizedPath = path.replace(/^\/+/, "");
  const languages = Object.fromEntries(
    locales.map((candidate) => [candidate, localePath(candidate, normalizedPath)]),
  );

  return {
    alternates: {
      canonical: localePath(locale, normalizedPath),
      languages: {
        ...languages,
        "x-default": defaultLanguagePath(normalizedPath),
      },
    },
    description,
    openGraph: {
      description,
      images: [
        {
          alt: brandConfig.alt[locale],
          height: brandConfig.height,
          url: brandConfig.lightLogo,
          width: brandConfig.width,
        },
      ],
      locale: openGraphLocales[locale],
      title,
      type: "website",
    },
    robots: {
      follow,
      // The global gate wins over an explicit `index: true`; a page may still opt out on its own.
      index: publicIndexingEnabled() && index !== false,
    },
    title,
  };
}

export function absolutePortalUrl(path: string): string {
  return new URL(path, publicSiteUrl()).toString();
}
