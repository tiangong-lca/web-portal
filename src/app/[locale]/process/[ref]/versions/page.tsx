import type { Metadata } from "next";
import { FeedbackLink as Link } from "@/components/shell/feedback-link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { safePublicCursor } from "@/features/catalog/cursor";
import { mapDataset, mapVersions } from "@/features/catalog/map-public-data";
import { resolvePublicDataset } from "@/features/catalog/resolve-public-dataset";
import { VersionsPanel } from "@/features/catalog/versions-panel";
import { isPortalLocale, localePath } from "@/i18n/routing";
import { absolutePortalUrl, localizedMetadata } from "@/lib/seo";
import { listPublicDatasetVersions } from "@/server/data/catalog";

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
    absolutePortalUrl(`/${locale}/process/${dataset.key.id}@${dataset.key.version}/versions`),
  );
  const t = await getTranslations({ locale, namespace: "Detail" });
  return localizedMetadata({
    description: t("versionsDescription"),
    index: !safePublicCursor((await searchParams).cursor),
    locale,
    path: `process/${record.ref}/versions`,
    title: `${t("versionsTitle")} · ${record.name}`,
  });
}

export default async function ProcessVersionsPage({
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
  const page = await listPublicDatasetVersions({
    cursor,
    id: dataset.key.id,
    kind: "process",
    limit: 50,
  });
  const rows = mapVersions(page, locale);
  const [t, common] = await Promise.all([
    getTranslations({ locale, namespace: "Detail" }),
    getTranslations({ locale, namespace: "Common" }),
  ]);
  return (
    <section aria-labelledby="versions-title" className="flex flex-col gap-4">
      <header>
        <h2 className="font-heading text-2xl font-semibold" id="versions-title">
          {t("versionsTitle")}
        </h2>
        <p className="text-muted-foreground">{t("versionsDescription")}</p>
      </header>
      <VersionsPanel
        locale={locale}
        labels={{ view: common("viewVersion"), current: t("currentVersion") }}
        currentRef={`${dataset.key.id}@${dataset.key.version}`}
        emptyDescription={t("versionsEmpty")}
        emptyTitle={t("versionsTitle")}
        rows={rows}
      />
      {page.nextCursor ? (
        <nav aria-label={common("next")} className="flex justify-end">
          <Button asChild variant="outline">
            <Link
              href={`${localePath(locale, `process/${dataset.key.id}@${dataset.key.version}/versions`)}?cursor=${encodeURIComponent(page.nextCursor)}`}
            >
              {common("next")}
            </Link>
          </Button>
        </nav>
      ) : null}
    </section>
  );
}
