import type { MetadataRoute } from "next";

import { localePath, locales } from "@/i18n/routing";
import { defaultLanguagePath } from "@/lib/seo";

const staticPaths = [
  "",
  "team",
  "community",
  "methodology",
  "browse/process",
  "browse/flow",
  "browse/region",
  "browse/source",
] as const;

function siteUrl(path: string): string {
  return new URL(path, process.env.SITE_URL ?? "http://localhost:3000").toString();
}

/** Every real language version of one path, each reciprocally naming the others. */
function alternateLanguages(path: string): Record<string, string> {
  return Object.fromEntries([
    ...locales.map((locale) => [locale, siteUrl(localePath(locale, path))]),
    ["x-default", siteUrl(defaultLanguagePath(path))],
  ]);
}

export default function sitemap(): MetadataRoute.Sitemap {
  // One canonical entry per language version, so every indexable URL is listed once.
  return locales.flatMap((locale) =>
    staticPaths.map((path) => ({
      alternates: { languages: alternateLanguages(path) },
      changeFrequency:
        path === "" || path.startsWith("browse/") ? ("daily" as const) : ("monthly" as const),
      priority: path === "" ? 1 : path.startsWith("browse/") ? 0.7 : 0.5,
      url: siteUrl(localePath(locale, path)),
    })),
  );
}
