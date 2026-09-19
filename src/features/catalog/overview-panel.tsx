import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import type { DatasetDetailViewModel } from "@/features/catalog/view-model";
import type { PortalLocale } from "@/i18n/routing";
import styles from "./detail.module.css";

/** @import import { OverviewPanel } from "@/features/catalog/overview-panel"; */
export async function OverviewPanel({
  locale,
  record,
}: {
  locale: PortalLocale;
  record?: DatasetDetailViewModel;
}) {
  const [t, common] = await Promise.all([
    getTranslations({ locale, namespace: "Detail" }),
    getTranslations({ locale, namespace: "Common" }),
  ]);
  const context =
    record?.kind === "flow"
      ? [
          [t("casNumber"), record.casNumber],
          [t("flowType"), record.flowType],
          [t("referenceFlowProperty"), record.referenceFlowProperty],
          ...(record.geography ? [[t("supplyLocation"), record.geography]] : []),
        ]
      : [
          [t("referenceProduct"), record?.referenceProduct],
          [t("functionalUnit"), record?.functionalUnit],
          [t("geography"), record?.geography],
          [t("referenceYear"), record?.referenceYear],
        ];
  const identity = [
    ...(record?.originalName && record.originalName !== record.name
      ? [[t("originalName"), record.originalName]]
      : []),
    ...(record?.kind === "flow" ? [[t("synonyms"), record.synonyms]] : []),
    [t("classification"), record?.classifications],
  ];
  const evidence = [
    [t("sourceDatabase"), record?.source],
    ...(record?.dataGenerator ? [[t("dataGenerator"), record.dataGenerator]] : []),
    ...(record?.dataOwner ? [[t("dataOwner"), record.dataOwner]] : []),
    [t("licenseType"), record?.licenseType],
    ...(record?.accessRestrictions ? [[t("accessRestrictions"), record.accessRestrictions]] : []),
    [t("availability"), record?.evidence],
  ];
  return (
    <section aria-label={t("overview")} className={styles.overview}>
      <dl
        aria-label={t("context")}
        className={styles.summary}
        data-kind={record?.kind ?? "process"}
      >
        {context.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value || common("notProvided")}</dd>
          </div>
        ))}
      </dl>
      <div className={styles.columns}>
        <div className={styles.reading}>
          {[
            [t("description"), record?.description],
            [t("technology"), record?.technology],
            [t("geographyDescription"), record?.geographyDescription],
          ]
            .filter((entry): entry is [string, string] => Boolean(entry[1]))
            .map(([label, value]) => (
              <section className={styles.section} key={label}>
                <h2>{label}</h2>
                <p>{value}</p>
              </section>
            ))}
          <section className={styles.section}>
            <h2>{t("identity")}</h2>
            <dl className={styles.facts}>
              {identity.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value || common("notProvided")}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
        <aside className={styles.section} aria-label={t("evidence")}>
          <h2>{t("evidence")}</h2>
          <dl className={styles.facts}>
            {evidence.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value || common("notProvided")}</dd>
              </div>
            ))}
          </dl>
          <div className={styles.evidenceHelp}>
            <p>{t("availabilityHelp")}</p>
            {record?.licenseUrl ? (
              <Button asChild size="sm" variant="outline">
                <a href={record.licenseUrl} rel="noopener noreferrer" target="_blank">
                  {t("viewLicense")}
                </a>
              </Button>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
}
