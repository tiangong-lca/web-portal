import type { Metadata } from "next";

/* oxlint-disable next/no-sync-scripts -- The same-origin theme bootstrap must run before first paint and contains no inline code. */

import type { PortalLocale } from "@/i18n/routing";
import { publicSiteUrl, siteVerificationMetadata } from "@/lib/seo";
import { brandConfig } from "@/server/brand";

import { themeInitIntegrity } from "./theme-integrity.generated";

export const portalMetadata: Metadata = {
  metadataBase: publicSiteUrl(),
  ...siteVerificationMetadata(),
  title: {
    default: "天工 LCA 数据门户",
    template: "%s · 天工 LCA",
  },
  description: "匿名搜索、理解、比较和引用公开生命周期评价数据。",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: brandConfig.favicon,
  },
  openGraph: {
    description: "匿名搜索、理解、比较和引用公开生命周期评价数据。",
    images: [
      {
        // A raster social card, not the SVG mark: link previews need a stable raster at the
        // documented 1200x630 size, and the declared dimensions are checked against the asset.
        alt: brandConfig.alt["zh-CN"],
        height: brandConfig.socialHeight,
        url: brandConfig.socialImage,
        width: brandConfig.socialWidth,
      },
    ],
    siteName: "天工 LCA 数据门户",
    title: "天工 LCA 数据门户",
    type: "website",
  },
};

type RootDocumentProps = Readonly<{
  children: React.ReactNode;
  lang: PortalLocale;
}>;

export function RootDocument({ children, lang }: RootDocumentProps) {
  return (
    <html data-brand-version={brandConfig.version} lang={lang} suppressHydrationWarning>
      <head>
        <script crossOrigin="anonymous" integrity={themeInitIntegrity} src="/brand/theme-init.js" />
      </head>
      <body className="flex min-h-screen flex-col">{children}</body>
    </html>
  );
}
