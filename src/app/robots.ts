import type { MetadataRoute } from "next";

import { locales } from "@/i18n/routing";
import { publicIndexingEnabled, publicSiteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = publicSiteUrl();
  if (!publicIndexingEnabled()) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/r0-compat/",
          ...locales.flatMap((locale) =>
            ["search", "compare", "collections"].map((path) => `/${locale}/${path}`),
          ),
        ],
      },
    ],
    sitemap: [
      new URL("/sitemap.xml", siteUrl).toString(),
      new URL("/catalog-process-sitemap.xml", siteUrl).toString(),
      new URL("/catalog-flow-sitemap.xml", siteUrl).toString(),
    ],
  };
}
