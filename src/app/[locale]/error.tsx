"use client";

import { useLocale, useTranslations } from "next-intl";
import { FeedbackLink as Link } from "@/components/shell/feedback-link";
import { isPortalLocale, localePath } from "@/i18n/routing";

import { Button } from "@/components/ui/button";

export default function LocaleErrorPage({ reset }: { reset: () => void }) {
  const t = useTranslations("Common");
  const requestedLocale = useLocale();
  const locale = isPortalLocale(requestedLocale) ? requestedLocale : "en";

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-12 sm:px-6 lg:px-8"
      id="main-content"
    >
      <h1 className="font-heading text-3xl font-semibold">{t("errorTitle")}</h1>
      <p className="text-muted-foreground">{t("errorDescription")}</p>
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-11 w-fit" onClick={reset} variant="outline">
          {t("retry")}
        </Button>
        <Button asChild className="min-h-11">
          <Link href={localePath(locale, "search")}>{t("search")}</Link>
        </Button>
      </div>
    </main>
  );
}
