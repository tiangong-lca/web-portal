import type { Metadata } from "next";
import { FeedbackLink as Link } from "@/components/shell/feedback-link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { safePublicCursor } from "@/features/catalog/cursor";
import { ExchangesPanel } from "@/features/catalog/exchanges-panel";
import { mapDataset, mapExchangePage } from "@/features/catalog/map-public-data";
import { resolvePublicDataset } from "@/features/catalog/resolve-public-dataset";
import { isPortalLocale, localePath } from "@/i18n/routing";
import { absolutePortalUrl, localizedMetadata } from "@/lib/seo";
import { listPublicProcessExchanges } from "@/server/data/catalog";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; ref: string }>;
  searchParams: Promise<{ cursor?: string | string[] }>;
}): Promise<Metadata> {
  const { locale, ref } = await params;
  if (!isPortalLocale(locale)) return {};
  const dataset = await resolvePublicDataset("process", locale, ref);
  const record = mapDataset(
    dataset,
    locale,
    absolutePortalUrl(`/${locale}/process/${dataset.key.id}@${dataset.key.version}/exchanges`),
  );
  const t = await getTranslations({ locale, namespace: "Detail" });
  return localizedMetadata({
    description: t("exchangesDescription"),
    index: !safePublicCursor((await searchParams).cursor),
    locale,
    path: `process/${record.ref}/exchanges`,
    title: `${t("exchangesTitle")} · ${record.name}`,
  });
}

export default async function ProcessExchangesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; ref: string }>;
  searchParams: Promise<{ cursor?: string | string[] }>;
}) {
  const { locale, ref } = await params;
  if (!isPortalLocale(locale)) return null;
  const cursor = safePublicCursor((await searchParams).cursor);
  const dataset = await resolvePublicDataset("process", locale, ref);
  const page = dataset.capabilities.exchangesVisible
    ? await listPublicProcessExchanges({
        cursor,
        exchangeKind: "all",
        limit: 50,
        processId: dataset.key.id,
        processVersion: dataset.key.version,
      })
    : null;
  const rows = page
    ? mapExchangePage(page, locale, `${dataset.key.id}@${dataset.key.version}`)
    : [];
  const [t, common] = await Promise.all([
    getTranslations({ locale, namespace: "Detail" }),
    getTranslations({ locale, namespace: "Common" }),
  ]);

  return (
    <section aria-labelledby="exchanges-title" className="flex flex-col gap-4">
      <header>
        <h2 className="font-heading text-2xl font-semibold" id="exchanges-title">
          {t("exchangesTitle")}
        </h2>
        <p className="text-muted-foreground">{t("exchangesDescription")}</p>
      </header>
      <ExchangesPanel
        locale={locale}
        caption={t("exchangesDescription")}
        emptyDescription={t("exchangesEmpty")}
        emptyTitle={t("exchangesTitle")}
        labels={{
          amount: t("value"),
          context: t("exchangeContext"),
          direction: t("direction"),
          flow: t("relatedFlow"),
          functionalUnit: t("functionalUnit"),
          kind: t("exchangeKind"),
          no: t("no"),
          policy: t("policyVersion"),
          process: common("process"),
          quantitativeReference: t("quantitativeReference"),
          yes: t("yes"),
        }}
        rows={rows}
      />
      {page?.nextCursor ? (
        <nav aria-label={common("next")} className="flex justify-end">
          <Button asChild variant="outline">
            <Link
              href={`${localePath(locale, `process/${dataset.key.id}@${dataset.key.version}/exchanges`)}?cursor=${encodeURIComponent(page.nextCursor)}`}
            >
              {common("next")}
            </Link>
          </Button>
        </nav>
      ) : null}
    </section>
  );
}
