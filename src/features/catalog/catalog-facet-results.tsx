import Link from "next/link";
import { localizedText } from "./map-public-data";
import { facetHref } from "./search-links";
import { formatGeographyCode } from "@/i18n/geography";
import type { PortalLocale } from "@/i18n/routing";
import type { PortalSearchUrlInput } from "@/server/contracts/input";
import type { getPublicFacets } from "@/server/data/catalog";
/** @import import { CatalogFacetResults } from "@/features/catalog/catalog-facet-results"; */
export function CatalogFacetResults({
  dimension,
  facets,
  locale,
  input,
  emptyLabel,
  moreLabel,
}: {
  dimension: string;
  facets: Awaited<ReturnType<typeof getPublicFacets>> | null;
  locale: PortalLocale;
  input: PortalSearchUrlInput;
  emptyLabel: string;
  moreLabel?: string;
}) {
  const ids = dimension === "region" ? ["region", "geography"] : ["source", "database"];
  const group = facets?.groups.find((g) => ids.some((id) => g.id.toLowerCase().includes(id)));
  return (
    <div className="catalog-explore-facets">
      {group?.hasMore && moreLabel && <output>{moreLabel}</output>}
      {group?.values.length ? (
        group.values.map((value) => (
          <Link key={value.value} href={facetHref(locale, input, group.id, value.value)!}>
            <span>
              {dimension === "region"
                ? (formatGeographyCode(value.value, locale) ?? value.value)
                : (localizedText(value.label, locale) ?? value.value)}
            </span>
            <span>{value.count.toLocaleString(locale)}</span>
          </Link>
        ))
      ) : (
        <p>{emptyLabel}</p>
      )}
    </div>
  );
}
