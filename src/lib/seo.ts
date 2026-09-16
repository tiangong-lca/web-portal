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
 * Single source of truth for the public indexing gate. `src/app/robots.ts` and every page's
 * robots directive read it, so crawl rules and page metadata can never disagree.
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
      index: index ?? publicIndexingEnabled(),
    },
    title,
  };
}

export function absolutePortalUrl(path: string): string {
  return new URL(path, process.env.SITE_URL ?? "http://localhost:3000").toString();
}
