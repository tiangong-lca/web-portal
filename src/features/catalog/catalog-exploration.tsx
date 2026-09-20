import { FeedbackLink as Link } from "@/components/shell/feedback-link";
import { getTranslations } from "next-intl/server";
import { getPublicFacets, searchPublicFlows, searchPublicProcesses } from "@/server/data/catalog";
import { PortalDataError } from "@/server/data/supabase-rpc";
import { mapSearchItem, localizedText } from "./map-public-data";
import { SearchResults, type SearchResultLabels } from "./search-results";
import { localePath, type PortalLocale } from "@/i18n/routing";
import { formatGeographyCode } from "@/i18n/geography";
import { Button } from "@/components/ui/button";
export async function CatalogExploration({
  dimension,
  locale,
  labels,
}: {
  dimension: string;
  locale: PortalLocale;
  labels: SearchResultLabels;
}) {
  const t = await getTranslations({ locale, namespace: "Search" });
  const b = await getTranslations({ locale, namespace: "Browse" });
  const common = await getTranslations({ locale, namespace: "Common" });

  if (dimension === "process" || dimension === "flow") {
    const page = await (dimension === "process" ? searchPublicProcesses : searchPublicFlows)({
      cursor: null,
      filters: {},
      limit: 10,
      query: "",
      sort: "name_asc",
    }).catch(publicDataFailure);
    if (!page) return <output>{t("unavailableDescription")}</output>;
    return (
      <>
        <SearchResults
          items={page.items.map((item) => mapSearchItem(item, locale))}
          labels={labels}
          locale={locale}
          selectable
          siteOrigin={process.env.SITE_URL ?? "http://localhost:3000"}
        />
        <div className="catalog-explore-more">
          <Button asChild variant="outline">
            <Link href={`${localePath(locale, "search")}?v=1&kind=${dimension}&sort=name_asc`}>
              {common("catalog")} <span aria-hidden="true">→</span>
            </Link>
          </Button>
        </div>
      </>
    );
  }
  const facets = await getPublicFacets({ filters: {}, kind: "all", query: "" }).catch(
    publicDataFailure,
  );
  if (!facets) return <output>{t("unavailableDescription")}</output>;
  const ids = dimension === "region" ? ["region", "geography"] : ["source", "database"];
  const group = facets.groups.find((g) => ids.some((id) => g.id.toLowerCase().includes(id)));
  return (
    <div className="catalog-explore-facets">
      {group?.values.length ? (
        group.values.map((value) => (
          <Link
            key={value.value}
            href={`${localePath(locale, "search")}?v=1&${dimension === "region" ? "geo" : "source"}=${encodeURIComponent(value.value)}`}
          >
            <span>
              {dimension === "region"
                ? (formatGeographyCode(value.value, locale) ?? value.value)
                : (localizedText(value.label, locale) ?? value.value)}
            </span>
            <span>{b("countVersions", { count: value.count })}</span>
          </Link>
        ))
      ) : (
        <p>{b("emptyDescription")}</p>
      )}
    </div>
  );
}

function publicDataFailure(error: unknown) {
  if (!(error instanceof PortalDataError)) throw error;
  return null;
}
