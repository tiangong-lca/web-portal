import { CatalogSearchInput } from "@/features/catalog/catalog-search-input";
import { CatalogSearchTeaser } from "./catalog-search-teaser";
import { KeywordSearchForm } from "@/features/catalog/keyword-search-form";
import { CatalogEntryLink as Link } from "@/features/catalog/catalog-entry-link";
import { getTranslations } from "next-intl/server";
import { ArrowUpRight, ChevronDown, Database, MapPin, Shapes } from "lucide-react";
import { localePath, type PortalLocale } from "@/i18n/routing";
import { SectionEyebrow } from "./section-eyebrow";
import "./brand-home.css";

/**
 * Shared catalog discovery entry for the homepage and initial search state.
 * @import import { CatalogSearchEntry } from "@/components/brand/catalog-search-entry";
 */
export async function CatalogSearchEntry({
  locale,
  number,
  kind = "process",
  counts,
}: {
  locale: PortalLocale;
  number?: string;
  kind?: "process" | "flow";
  counts?: { process: number; flow: number } | null;
}) {
  const t = await getTranslations({ locale, namespace: "BrandHome" });
  const common = await getTranslations({ locale, namespace: "Common" });
  const catalog = await getTranslations({ locale, namespace: "Home" });
  const navigation = await getTranslations({ locale, namespace: "Navigation" });
  const Heading = number ? "h2" : "h1";
  const dimensions = [
    ["process", "browseProcess", "browseProcessDescription", Database],
    ["flow", "browseFlow", "browseFlowDescription", Shapes],
    ["region", "browseRegion", "browseRegionDescription", MapPin],
    ["source", "browseSource", "browseSourceDescription", Database],
  ] as const;
  return (
    <div className="catalog-search-entry">
      <div className="brand-section-heading">
        <div>
          {number && <SectionEyebrow number={number}>{t("catalogKicker")}</SectionEyebrow>}
          <Heading id="explore-title">{t("catalogTitle")}</Heading>
        </div>
        <p>{t("catalogDescription")}</p>
      </div>
      {number ? (
        <CatalogSearchTeaser
          href={`${localePath(locale, "search")}?v=1`}
          label={t("searchEntryAction")}
          examples={[t("searchExample1"), t("searchExample2"), t("searchExample3")]}
        />
      ) : (
        <search className="brand-search" aria-label={catalog("searchLabel")}>
          <KeywordSearchForm action={localePath(locale, "search")}>
            <input name="v" type="hidden" value="1" />
            <input name="kind" type="hidden" value={kind} />
            <label className="sr-only" htmlFor="catalog-entry-query">
              {catalog("searchLabel")}
            </label>
            <CatalogSearchInput
              submitLabel={catalog("searchButton")}
              clearLabel={common("clear")}
              autoComplete="off"
              id="catalog-entry-query"
              name="q"
              maxLength={512}
              placeholder={catalog("searchPlaceholder")}
            />
          </KeywordSearchForm>
        </search>
      )}
      <nav className="brand-catalog-index" aria-label={catalog("browseTitle")}>
        {dimensions.map(([dimension, label, description, Icon]) => (
          <Link
            href={`${localePath(locale, "search")}?v=1&explore=${dimension}`}
            scroll={false}
            prefetch={false}
            key={dimension}
            className="brand-catalog-link"
          >
            <Icon aria-hidden="true" />
            <span>
              <strong>{catalog(label)}</strong>
              {(dimension === "process" || dimension === "flow") && (
                <span>
                  {counts
                    ? navigation("versions", { count: counts[dimension] })
                    : navigation("countUnavailable")}
                </span>
              )}
              <span>{catalog(description)}</span>
            </span>
            {number ? <ArrowUpRight aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          </Link>
        ))}
      </nav>
      {!number && (
        <Link
          className="catalog-explore-toggle"
          scroll={false}
          href={`${localePath(locale, "search")}?v=1&explore=process`}
        >
          <span>{catalog("exploreCatalog")}</span>
          <span className="catalog-explore-arrow" aria-hidden="true">
            <ChevronDown />
          </span>
        </Link>
      )}
    </div>
  );
}
