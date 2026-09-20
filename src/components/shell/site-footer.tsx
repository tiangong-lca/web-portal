import "./site-shell.css";
import { BrandLogo } from "@/components/brand/brand-logo";
import { ExternalLinkIcon } from "lucide-react";
import { FeedbackLink as Link } from "@/components/shell/feedback-link";
import { getTranslations } from "next-intl/server";

import { Separator } from "@/components/ui/separator";
import { localePath, type PortalLocale } from "@/i18n/routing";

/** @import import { SiteFooter } from "@/components/shell/site-footer"; */
export async function SiteFooter({ locale }: { locale: PortalLocale }) {
  const t = await getTranslations({ locale, namespace: "Common" });

  return (
    <footer className="site-footer site-shell-container mx-auto mt-auto w-full pb-8">
      <Separator />
      <div className="grid gap-8 py-8 sm:grid-cols-[minmax(0,1.4fr)_minmax(10rem,0.6fr)_minmax(12rem,0.7fr)]">
        <div className="flex max-w-md flex-col gap-2">
          <Link href={localePath(locale)} className="site-footer-brand">
            <BrandLogo locale={locale} />
            <span>{t("productFamily")}</span>
          </Link>
          <p className="text-muted-foreground text-sm leading-6">{t("footerDescription")}</p>
        </div>
        <nav aria-label={t("footerExplore")} className="flex flex-col gap-2 text-sm">
          <p className="font-medium">{t("footerExplore")}</p>
          {(
            [
              [localePath(locale, "search?v=1"), t("catalog")],
              [localePath(locale, "methodology"), t("methodology")],
              [localePath(locale, "team"), t("team")],
              [localePath(locale, "community"), t("community")],
              [localePath(locale, "collections"), t("collections")],
            ] as const
          ).map(([href, label]) => (
            <Link className="site-footer-link" href={href} key={href}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-col gap-2 text-sm">
          <p className="font-medium">{t("footerProducts")}</p>
          <a
            className="site-footer-link inline-flex items-center gap-2"
            href="https://lca.tiangong.earth"
          >
            {t("externalLcaAction")}
            <ExternalLinkIcon aria-hidden="true" className="size-4" />
          </a>
        </div>
      </div>
    </footer>
  );
}
