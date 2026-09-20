import type { ReactNode } from "react";
import { FeedbackLink as Link } from "@/components/shell/feedback-link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CatalogSearchEntry } from "./catalog-search-entry";
import { localizedText } from "@/features/catalog/map-public-data";
import { localePath, type PortalLocale } from "@/i18n/routing";
import type { PublicCatalogSummary } from "@/server/contracts/portal";
import { SectionEyebrow } from "./section-eyebrow";
import { ScrollCinematicHero } from "./scroll-cinematic-hero";

import "./brand-home.css";

export type BrandHomeProps = {
  locale: PortalLocale;
  summary: PublicCatalogSummary | null;
  counts?: { process: number; flow: number } | null;
  /** Optional isolated-review replacement for the production first-screen hero. */
  hero?: ReactNode;
};

/**
 * The public brand entrance, with server-rendered search, catalog and product navigation.
 * @import import { BrandHome } from "@/components/brand/brand-home";
 */
export async function BrandHome({ locale, summary, hero, counts }: BrandHomeProps) {
  const [t, catalog] = await Promise.all([
    getTranslations({ locale, namespace: "BrandHome" }),
    getTranslations({ locale, namespace: "Home" }),
  ]);
  const count = new Intl.NumberFormat(locale);
  const latest = summary?.latestModifiedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(
        new Date(summary.latestModifiedAt),
      )
    : null;
  const resolvedHero = hero ?? (
    <ScrollCinematicHero
      eyebrow={t("eyebrow")}
      titleLead={t("titleLead")}
      titleFocus={t("titleFocus")}
      titleSeparator={locale === "zh-CN" ? "" : " "}
      description={t("description")}
      chapterTwoLabel={t("chapterTwoLabel")}
      chapterTwoTitle={t("chapterTwoTitle")}
      chapterTwoDescription={t("chapterTwoDescription")}
      chapterThreeLabel={t("chapterThreeLabel")}
      chapterThreeTitle={t("chapterThreeTitle")}
      chapterThreeDescription={t("chapterThreeDescription")}
    />
  );

  return (
    <main id="main-content" className="brand-home" lang={locale}>
      {resolvedHero}

      <section
        className="brand-catalog-section"
        id="explore"
        tabIndex={-1}
        aria-labelledby="explore-title"
      >
        <div className="brand-container">
          {await CatalogSearchEntry({ locale, number: "02", counts })}

          <div className="brand-catalog-summary" aria-label={catalog("scaleTitle")}>
            <div>
              <h3>{catalog("scaleTitle")}</h3>
              <p>
                {latest ? catalog("latestModified", { date: latest }) : catalog("scaleDescription")}
              </p>
            </div>
            {summary ? (
              <dl>
                {(
                  [
                    ["processCount", summary.counts.process],
                    ["flowCount", summary.counts.flow],
                    ["totalCount", summary.counts.total],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt>{catalog(label)}</dt>
                    <dd>{count.format(value)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p>{catalog("scaleUnavailable")}</p>
            )}
          </div>
          {summary && summary.examples.length > 0 && (
            <div className="brand-examples">
              <p>{catalog("examplesTitle")}</p>
              <div>
                {summary.examples.map((example) => {
                  const params = new URLSearchParams({
                    kind: example.datasetKind,
                    q: example.query,
                    v: "1",
                  });
                  const label = localizedText(example.label, locale) ?? example.query;
                  const kind =
                    example.queryKind === "uuid"
                      ? "exampleUuid"
                      : example.queryKind === "cas"
                        ? "exampleCas"
                        : "exampleClass";
                  return (
                    <Link
                      key={`${example.queryKind}:${example.query}`}
                      href={`${localePath(locale, "search")}?${params}`}
                      prefetch={false}
                    >
                      <span>{catalog(kind)}</span>
                      {label}
                      <ArrowUpRight aria-hidden="true" />
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      <section
        className="brand-understanding brand-container"
        aria-labelledby="understanding-title"
      >
        <div className="brand-section-heading">
          <div>
            <SectionEyebrow number="03">{t("understandingKicker")}</SectionEyebrow>
            <h2 id="understanding-title">{t("understandingTitle")}</h2>
          </div>
          <p>{t("understandingDescription")}</p>
        </div>
        <div className="brand-understanding-grid">
          <div className="brand-reading">
            <div className="brand-reading-title">
              <span className="brand-section-symbol" aria-hidden="true">
                ↗
              </span>
              <h3>{catalog("useTitle")}</h3>
            </div>
            <dl>
              {(
                [
                  ["railMetadataTitle", "railMetadataBody"],
                  ["railVersionTitle", "railVersionBody"],
                  ["railValuesTitle", "railValuesBody"],
                ] as const
              ).map(([title, description], index) => (
                <div key={title}>
                  <dt>
                    <span aria-hidden="true">0{index + 1}</span>
                    {catalog(title)}
                  </dt>
                  <dd>{catalog(description)}</dd>
                </div>
              ))}
            </dl>
            <Button asChild variant="outline">
              <Link href={localePath(locale, "methodology")}>
                {catalog("useLink")}
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </div>
          <div className="brand-platform">
            <div className="brand-platform-grid" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <p className="brand-kicker">Tiangong LCA</p>
            <h3>{t("platformTitle")}</h3>
            <p>{t("platformDescription")}</p>
            <div>
              <Button asChild size="lg">
                <a href="https://lca.tiangong.earth">
                  {t("platformAction")}
                  <ArrowUpRight data-icon="inline-end" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
