import { getLocale, getTranslations } from "next-intl/server";
import { FeedbackLink as Link } from "@/components/shell/feedback-link";
import { Button } from "@/components/ui/button";
import { isPortalLocale, localePath } from "@/i18n/routing";

export default async function LocaleNotFound() {
  const t = await getTranslations("Common");
  const requestedLocale = await getLocale();
  const locale = isPortalLocale(requestedLocale) ? requestedLocale : "en";

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-4 py-12 sm:px-6 lg:px-8"
      id="main-content"
    >
      <h1 className="font-heading text-3xl font-semibold">{t("notFoundTitle")}</h1>
      <p className="text-muted-foreground">{t("notFoundDescription")}</p>
      <div className="flex flex-wrap gap-2">
        <Button asChild className="min-h-11">
          <Link href={localePath(locale, "search")}>{t("search")}</Link>
        </Button>
        <Button asChild className="min-h-11" variant="outline">
          <Link href={localePath(locale)}>{t("home")}</Link>
        </Button>
      </div>
    </main>
  );
}
