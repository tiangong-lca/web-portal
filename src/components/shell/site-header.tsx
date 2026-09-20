import { NavigationRail } from "./navigation-rail";
import "./site-shell.css";
import { ExternalLinkIcon } from "lucide-react";
import { FeedbackLink as Link } from "@/components/shell/feedback-link";
import { getTranslations } from "next-intl/server";

import { BrandLogo } from "@/components/brand/brand-logo";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { localePath, type PortalLocale } from "@/i18n/routing";

import { LocaleSwitcher } from "./locale-switcher";
import { HeaderOffset } from "./header-offset";
import { NavigationLink } from "./navigation-link";
import { ThemeToggle } from "./theme-toggle";

type SiteHeaderProps = {
  locale: PortalLocale;
};

/** @import import { SiteHeader } from "@/components/shell/site-header"; */
export async function SiteHeader({ locale }: SiteHeaderProps) {
  const t = await getTranslations({ locale, namespace: "Common" });
  const homeHref = localePath(locale);

  const links = [
    [localePath(locale, "search?v=1"), t("catalog"), t("catalogCompact")],
    [localePath(locale, "methodology"), t("methodology"), t("methodologyCompact")],
    [localePath(locale, "team"), t("team"), t("teamCompact")],
    [localePath(locale, "community"), t("community"), t("communityCompact")],
    [localePath(locale, "collections"), t("collections"), t("collectionsCompact")],
  ] as const;

  return (
    <header className="site-header bg-background sticky top-0 z-40 border-b" data-portal-header>
      <HeaderOffset />
      <a
        className="bg-primary text-primary-foreground focus-visible:ring-ring sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-4 focus:z-50 focus:flex focus:min-h-11 focus:items-center focus:rounded-b-lg focus:px-3 focus:py-2 focus-visible:ring-3"
        href="#main-content"
      >
        {t("skipToContent")}
      </a>
      <div className="site-shell-container mx-auto grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 xl:grid-cols-[auto_minmax(0,1fr)_auto]">
        <Link className="flex min-h-11 items-center gap-3" href={homeHref} prefetch={false}>
          <BrandLogo locale={locale} priority />
          <span className="font-heading text-lg leading-tight font-semibold tracking-tight sm:text-xl">
            {t("productFamily")}
          </span>
        </Link>

        <nav
          aria-label={t("brandName")}
          className="order-3 col-span-2 min-w-0 overflow-x-auto xl:order-none xl:col-span-1"
        >
          <NavigationRail>
            {links.map(([href, label, compactLabel]) => (
              <li key={href}>
                <NavigationLink
                  compactLabel={compactLabel}
                  href={href}
                  matchPrefix={
                    href === localePath(locale, "browse/process")
                      ? localePath(locale, "browse")
                      : undefined
                  }
                >
                  {label}
                </NavigationLink>
              </li>
            ))}
            <li aria-hidden="true" className="hidden xl:block">
              <Separator className="mx-1 h-5" orientation="vertical" />
            </li>
            <li className="hidden xl:block">
              <Button asChild className="min-h-11" size="lg" variant="ghost">
                <a href="https://lca.tiangong.earth">
                  {t("externalLca")}
                  <ExternalLinkIcon data-icon="inline-end" />
                </a>
              </Button>
            </li>
          </NavigationRail>
        </nav>

        <div className="order-2 ml-auto flex min-w-0 items-center gap-2 xl:order-none">
          <ThemeToggle
            labels={{
              dark: t("themeDark"),
              group: t("theme"),
              light: t("themeLight"),
              system: t("themeSystem"),
            }}
          />
          <LocaleSwitcher currentLocale={locale} label={t("language")} />
        </div>
      </div>
    </header>
  );
}
