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
  return new URL(path, process.env.SITE_URL ?? "http://localhost:3000").toString();
}
