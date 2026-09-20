import { FilterIcon } from "lucide-react";
import { FeedbackLink as Link } from "@/components/shell/feedback-link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { facetHref } from "./search-links";
import { partitionFacetValues } from "./facet-display";
import { localizedText } from "./map-public-data";
import { formatGeographyCode } from "@/i18n/geography";
import { localizeProcessSubtype } from "@/i18n/domain-vocabulary";
import type { PortalLocale } from "@/i18n/routing";
import type { PortalSearchUrlInput } from "@/server/contracts/input";
import type { PublicFacets } from "@/server/contracts/portal";

/** @import import { FacetsPanel } from "@/features/catalog/facets-panel"; */
export async function FacetsPanel({
  locale,
  parsedSearch,
  facets,
  dataUnavailable = false,
}: {
  locale: PortalLocale;
  parsedSearch: PortalSearchUrlInput;
  facets: PublicFacets | null;
  dataUnavailable?: boolean;
}) {
  const [t, common] = await Promise.all([
    getTranslations({ locale, namespace: "Search" }),
    getTranslations({ locale, namespace: "Common" }),
  ]);
  const facetLabels = [t("objectType"), t("access"), t("region"), t("year"), t("source")];
  return (
    <Card size="sm">
      <CardHeader data-facet-intro>
        <FilterIcon aria-hidden="true" />
        <CardTitle>{t("facets")}</CardTitle>
        <CardDescription>
          {facets
            ? t("filtersDescription")
            : dataUnavailable
              ? t("unavailableDescription")
              : t("initialDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {facets
          ? facets.groups.map((group) => {
              const normalizedGroup = group.id.toLowerCase().replaceAll(/[^a-z]/g, "");
              const renderValue = (value: (typeof group.values)[number]) => {
                const href = facetHref(locale, parsedSearch, group.id, value.value);
                const translatedValue =
                  normalizedGroup === "kind" || normalizedGroup === "objecttype"
                    ? value.value === "process"
                      ? common("process")
                      : value.value === "flow"
                        ? common("flow")
                        : value.value
                    : normalizedGroup.includes("access")
                      ? value.value === "open"
                        ? common("public")
                        : value.value === "metadata_only"
                          ? common("metadataOnly")
                          : value.value
                      : normalizedGroup.includes("geography") || normalizedGroup.includes("region")
                        ? (formatGeographyCode(value.value, locale) ?? value.value)
                        : normalizedGroup.includes("subtype")
                          ? localizeProcessSubtype(value.value, locale)
                          : (localizedText(value.label, locale) ?? value.value);
                const label = `${translatedValue} (${new Intl.NumberFormat(locale).format(value.count)})`;
                return href ? (
                  <Button
                    asChild
                    className="h-auto min-h-11 w-full justify-start text-left break-words whitespace-normal"
                    key={value.value}
                    variant="ghost"
                  >
                    <Link href={href} prefetch={false}>
                      {label}
                    </Link>
                  </Button>
                ) : (
                  <span className="text-muted-foreground text-sm" key={value.value}>
                    {label}
                  </span>
                );
              };
              const { disclosed, hiddenCount, visible } = partitionFacetValues(group.values);
              return (
                <div className="flex flex-col gap-2" key={group.id}>
                  <strong>
                    {normalizedGroup === "kind" || normalizedGroup === "objecttype"
                      ? t("objectType")
                      : normalizedGroup.includes("access")
                        ? t("access")
                        : normalizedGroup.includes("geography") ||
                            normalizedGroup.includes("region")
                          ? t("region")
                          : normalizedGroup.includes("year")
                            ? t("year")
                            : normalizedGroup.includes("subtype")
                              ? t("processSubtype")
                              : normalizedGroup.includes("source") ||
                                  normalizedGroup.includes("database")
                                ? t("source")
                                : normalizedGroup.includes("classification")
                                  ? t("classification")
                                  : (localizedText(group.label, locale) ?? group.id)}
                  </strong>
                  {visible.map(renderValue)}
                  {disclosed.length > 0 ? (
                    <details>
                      <summary className="text-link cursor-pointer text-sm">
                        {t("moreFilters", { count: disclosed.length })}
                      </summary>
                      <div className="mt-2 flex flex-col gap-1">
                        {disclosed.map(renderValue)}
                        {hiddenCount > 0 ? (
                          <p className="text-muted-foreground px-2 pt-2 text-xs leading-5">
                            {t("refineMoreFilters", { count: hiddenCount })}
                          </p>
                        ) : null}
                      </div>
                    </details>
                  ) : null}
                </div>
              );
            })
          : facetLabels.map((label) => (
              <Button disabled key={label} variant="ghost">
                {label}
              </Button>
            ))}
        {facets ? (
          <p className="text-muted-foreground text-xs leading-5">{t("countsDescription")}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
