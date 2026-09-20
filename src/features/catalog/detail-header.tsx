import { BookmarkPlusIcon } from "lucide-react";
import { FeedbackLink as Link } from "@/components/shell/feedback-link";
import { getTranslations } from "next-intl/server";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionGroup } from "@/components/ui/action-group";
import type { DatasetDetailViewModel } from "@/features/catalog/view-model";
import { localePath, type PortalLocale } from "@/i18n/routing";

import { CitationDialog } from "./citation-dialog";
import { NavigationLink } from "@/components/shell/navigation-link";
import { DatasetVersionTag, PublicContentTag } from "./dataset-tags";
import styles from "./detail.module.css";
import { CompareChoice } from "@/features/compare/selection";
import { buildMemberFragment } from "@/features/collections/storage-v2";

type DetailHeaderProps = {
  kind: "process" | "flow";
  locale: PortalLocale;
  record?: DatasetDetailViewModel;
  refValue: string;
};

/** @import import { DetailHeader } from "@/features/catalog/detail-header"; */
export async function DetailHeader({ kind, locale, record, refValue }: DetailHeaderProps) {
  const [t, common, content] = await Promise.all([
    getTranslations({ locale, namespace: "Detail" }),
    getTranslations({ locale, namespace: "Common" }),
    getTranslations({ locale, namespace: "CatalogReference" }),
  ]);
  const basePath = `${kind}/${encodeURIComponent(refValue)}`;
  const navigationItems =
    kind === "process"
      ? [
          [basePath, t("overview")],
          [`${basePath}/method`, t("method")],
          [`${basePath}/exchanges`, t("exchanges")],
          [`${basePath}/lcia`, t("lcia")],
          [`${basePath}/quality`, t("quality")],
          [`${basePath}/provenance`, t("provenance")],
          [`${basePath}/versions`, t("versions")],
        ]
      : [
          [basePath, t("overview")],
          [`${basePath}/versions`, t("versions")],
        ];

  return (
    <header className={styles.header}>
      <div className={styles.heading}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{kind === "process" ? common("process") : common("flow")}</Badge>
          <DatasetVersionTag
            version={refValue.split("@")[1] ?? refValue}
            label={common("exactVersion")}
          />
          {record?.capabilities ? (
            <>
              {record.capabilities.exchangesVisible || !record.capabilities.lciaVisible ? (
                <PublicContentTag
                  content={record.capabilities.exchangesVisible ? "exchanges" : "metadata"}
                  labels={{
                    publicContent: content("publicContent"),
                    availabilityExchanges: content("availabilityExchanges"),
                    availabilityMetadata: content("availabilityMetadata"),
                    exchangesHelp: content("exchangesHelp"),
                    metadataHelp: content("metadataHelp"),
                  }}
                />
              ) : null}
              {record.capabilities.lciaVisible ? (
                <Badge variant="secondary">{common("lciaAvailable")}</Badge>
              ) : null}
            </>
          ) : null}
        </div>
        <h1 className={styles.title}>
          {record?.name ?? (kind === "process" ? t("processTitle") : t("flowTitle"))}
        </h1>
        {record?.source ? (
          <p className={styles.source}>
            {t("sourceDatabase")}: {record.source}
          </p>
        ) : null}
        {!record ? (
          <Alert>
            <AlertDescription>{t("recordPending")}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <ActionGroup className={styles.actions}>
        {kind === "process" ? (
          <CompareChoice
            item={{ ref: refValue, name: record?.name ?? refValue }}
            label={t("compare")}
            locale={locale}
          />
        ) : null}
        <Button asChild variant="outline">
          <Link
            href={`${localePath(locale, "collections")}${buildMemberFragment({ kind, ref: refValue })}`}
          >
            <BookmarkPlusIcon data-icon="inline-start" />
            {t("collect")}
          </Link>
        </Button>
        <CitationDialog
          citation={record?.citation}
          refValue={refValue}
          labels={{
            title: t("citation"),
            close: common("close"),
            unavailable: t("citationUnavailable"),
            exactVersion: common("exactVersion"),
            copyCitation: t("copyCitation"),
            citationCopied: t("citationCopied"),
            copyVersionId: t("copyVersionId"),
            versionCopied: t("versionCopied"),
            copyFailed: t("copyFailed"),
          }}
        />
      </ActionGroup>

      <nav
        aria-label={kind === "process" ? t("processTitle") : t("flowTitle")}
        className={styles.navigation}
      >
        <ul className="flex flex-wrap items-center gap-1">
          {navigationItems.map(([href, label]) => (
            <li key={href}>
              <NavigationLink href={localePath(locale, href)}>{label}</NavigationLink>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
