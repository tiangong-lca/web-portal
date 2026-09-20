import { CatalogFacetResults } from "@/features/catalog/catalog-facet-results";
import { CatalogKindSwitch } from "@/features/catalog/catalog-kind-switch";
import { CatalogPagination } from "@/features/catalog/catalog-pagination";
import { CatalogSort } from "@/features/catalog/catalog-sort";
import { CatalogResultsToolbar } from "@/features/catalog/catalog-results-toolbar";
import { CatalogSearchLayout } from "@/features/catalog/catalog-search-layout";
import { CatalogSearchInput } from "@/features/catalog/catalog-search-input";
import { ArrowLeftIcon, ArrowRightIcon, SearchIcon, XIcon } from "lucide-react";
import { FeedbackLink as Link } from "@/components/shell/feedback-link";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { CatalogSearchEntry } from "@/components/brand/catalog-search-entry";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { KeywordSearchForm } from "@/features/catalog/keyword-search-form";
import { SearchModes } from "@/features/catalog/search-modes";
import { ResponsiveFacets } from "@/features/catalog/responsive-facets";
import { CompareSelectionForm } from "@/features/compare/selection";
import {
  facetHref,
  hasCatalogQuery,
  nextSearchPageHref,
  parseSearchCursorTrail,
  previousSearchPageHref,
  searchHref,
  searchParameters,
} from "@/features/catalog/search-links";
import { formatGeographyCode } from "@/i18n/geography";
import { localizeProcessSubtype } from "@/i18n/domain-vocabulary";
import { mapSearchItem } from "@/features/catalog/map-public-data";
import { FacetsPanel } from "@/features/catalog/facets-panel";
import { HybridSearchPanel } from "@/features/catalog/hybrid-search-panel";
import { SearchResults } from "@/features/catalog/search-results";
import { isPortalLocale, localePath } from "@/i18n/routing";
import { localizedMetadata } from "@/lib/seo";
import { PortalInputError } from "@/server/contracts/input";
import { getPublicFacets, searchPublicFlows, searchPublicProcesses } from "@/server/data/catalog";
import { PortalDataError } from "@/server/data/supabase-rpc";
import {
  parsePortalBrowseUrl,
  hasNavigationFilters,
  type PublicNavigation,
} from "@/server/contracts/navigation";
import {
  getPublicNavigation,
  searchPublicBrowse,
  getPublicBrowseFacets,
} from "@/server/data/navigation";
import { hierarchyFilters } from "@/features/catalog/navigation-links";
import { CatalogNavigation } from "@/features/catalog/catalog-navigation";
import { navigationView } from "@/features/catalog/navigation-view";
import { RegionExplorer } from "@/features/catalog/region-explorer";
import mapManifest from "@/features/catalog/region-map-manifest.generated.json";
import { navigationLabel } from "@/server/navigation-labels";

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/search">): Promise<Metadata> {
  const { locale } = await params;
  if (!isPortalLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "Search" });
  return localizedMetadata({
    description: t("description"),
    index: false,
    locale,
    path: "search",
    title: t("title"),
  });
}

export default async function SearchPage({
  params,
  searchParams,
  browseKind,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
  browseKind?: "process" | "flow";
}) {
  const { locale } = await params;
  if (!isPortalLocale(locale)) notFound();
  setRequestLocale(locale);

  const rawSearchParams = await searchParams;
  const cursorTrail = parseSearchCursorTrail(rawSearchParams);
  let parsedSearch: ReturnType<typeof parsePortalBrowseUrl>;
  let inputInvalid = false;
  try {
    parsedSearch = parsePortalBrowseUrl(rawSearchParams);
  } catch (error) {
    if (!(error instanceof PortalInputError)) throw error;
    parsedSearch = parsePortalBrowseUrl({});
    inputInvalid = true;
  }

  const dimension =
    typeof rawSearchParams.explore === "string" &&
    ["process", "flow", "region", "source"].includes(rawSearchParams.explore)
      ? rawSearchParams.explore
      : parsedSearch.kind;
  if (dimension === "process" || dimension === "flow")
    parsedSearch = { ...parsedSearch, kind: dimension };
  const aggregateView = dimension === "region" || dimension === "source";
  const query = parsedSearch.query;
  const hasQuery =
    Boolean(
      rawSearchParams.explore &&
      ["process", "flow", "region", "source"].includes(String(rawSearchParams.explore)),
    ) ||
    Boolean(browseKind) ||
    rawSearchParams.kind === "process" ||
    rawSearchParams.kind === "flow" ||
    hasCatalogQuery(parsedSearch);
  const [t, hybrid, detail, common, reference] = await Promise.all([
    getTranslations({ locale, namespace: "Search" }),
    getTranslations({ locale, namespace: "Hybrid" }),
    getTranslations({ locale, namespace: "Detail" }),
    getTranslations({ locale, namespace: "Common" }),
    getTranslations({ locale, namespace: "CatalogReference" }),
  ]);
  const home = await getTranslations({ locale, namespace: "Home" });
  const navigationT = await getTranslations({ locale, namespace: "Navigation" });
  const hierarchyDimension = dimension === "region" ? "geography" : "classification";
  const parentNodeId =
    hierarchyDimension === "geography"
      ? (parsedSearch.filters.geographyNodeId ?? null)
      : (parsedSearch.filters.classificationNodeId ?? null);
  const rawNavCursor = rawSearchParams.navCursor;
  const navCursor =
    typeof rawNavCursor === "string" && /^[A-Za-z0-9_-]{1,4096}$/u.test(rawNavCursor)
      ? rawNavCursor
      : null;
  const navigationPromise: Promise<PublicNavigation | null> =
    inputInvalid || dimension === "source"
      ? Promise.resolve(null)
      : getPublicNavigation({
          kind: hasQuery ? parsedSearch.kind : "all",
          query: parsedSearch.query,
          filters: hierarchyFilters(parsedSearch, hierarchyDimension),
          dimension: hierarchyDimension,
          parentNodeId,
          cursor: navCursor,
          limit: hierarchyDimension === "geography" ? 500 : 50,
        }).catch((error: unknown) => {
          if (error instanceof PortalDataError) return null;
          throw error;
        });

  let dataUnavailable = false;
  let nextCursor: string | null = null;
  let results: ReturnType<typeof mapSearchItem>[] = [];
  let facets: Awaited<ReturnType<typeof getPublicFacets>> | null = null;
  const resultLabels = {
    publicContentLabels: {
      publicContent: reference("publicContent"),
      availabilityExchanges: reference("availabilityExchanges"),
      availabilityMetadata: reference("availabilityMetadata"),
      exchangesHelp: reference("exchangesHelp"),
      metadataHelp: reference("metadataHelp"),
    },
    exchangesAvailable: common("exchangesAvailable"),
    lciaAvailable: common("lciaAvailable"),
    referenceFlowProperty: detail("referenceFlowProperty"),
    collect: detail("collect"),
    compare: detail("compare"),
    copied: detail("citationCopied"),
    copyCitation: detail("copyCitation"),
    copyFailure: detail("copyFailed"),
    details: common("details"),
    emptyDescription: t("emptyDescription"),
    emptyTitle: t("emptyTitle"),
    flow: common("flow"),
    functionalUnit: detail("functionalUnit"),
    geography: detail("geography"),
    match: t("matchEvidence"),
    metadataOnly: common("metadataOnly"),
    process: common("process"),
    public: common("public"),
    quality: detail("quality"),
    reference: detail("referenceProduct"),
    referenceYear: detail("referenceYear"),
    selectForCompare: t("selectForCompare"),
    matchingVersions: t("matchingVersions"),
    version: t("version"),
    source: detail("sourceDatabase"),
    technology: detail("technology"),
  };

  if (hasQuery && !inputInvalid) {
    try {
      const { kind: _kind, ...searchInput } = parsedSearch;
      const [page, facetPage] = await Promise.all([
        aggregateView
          ? Promise.resolve(null)
          : hasNavigationFilters(parsedSearch.filters)
            ? searchPublicBrowse(parsedSearch)
            : parsedSearch.kind === "process"
              ? searchPublicProcesses(searchInput, undefined, { cache: "short-public" })
              : searchPublicFlows(searchInput, undefined, { cache: "short-public" }),
        (hasNavigationFilters(parsedSearch.filters) ? getPublicBrowseFacets : getPublicFacets)(
          {
            filters: parsedSearch.filters,
            kind:
              dimension === "source" && !parsedSearch.filters.processSubtype
                ? "all"
                : parsedSearch.kind,
            query,
          },
          undefined,
          { cache: "short-public" },
        ),
      ]);
      results = page?.items.map((item) => mapSearchItem(item, locale)) ?? [];
      nextCursor = page?.nextCursor ?? null;
      facets = facetPage;
    } catch (error) {
      if (!(error instanceof PortalDataError)) throw error;
      dataUnavailable = true;
    }
  }

  const navigation = await navigationPromise;
  const navigationProps = await navigationView(
    locale,
    parsedSearch,
    hierarchyDimension,
    navigation,
  );
  const { layers } = mapManifest as { layers: Record<string, { url: string }> };
  const mapUrl = layers[parentNodeId ?? "world"]?.url;
  const preserveNavigationPage = (href: string | null) =>
    href && navCursor ? `${href}&navCursor=${encodeURIComponent(navCursor)}` : href;
  if (navigationProps.more && navigation?.nextCursor) {
    const p = searchParameters(parsedSearch);
    p.set("explore", dimension);
    p.set("navCursor", navigation.nextCursor);
    if (typeof rawSearchParams.pageTrail === "string" && cursorTrail.length > 0)
      p.set("pageTrail", rawSearchParams.pageTrail);
    navigationProps.more.href = `${localePath(locale, "search")}?${p}`;
  }
  const appliedNodeLabel = (nodeId: string, code: string) => {
    const virtual: Record<
      string,
      "isic" | "cpc" | "elementary" | "special" | "unmapped" | "uncategorized"
    > = {
      "class:isic": "isic",
      "class:cpc": "cpc",
      "class:elementary": "elementary",
      "geo:special": "special",
      "geo:unmapped": "unmapped",
      "class:unmapped": "uncategorized",
      "class:unclassified": "uncategorized",
    };
    return virtual[nodeId]
      ? navigationT(virtual[nodeId]!)
      : navigationLabel({ nodeId, code }, locale);
  };
  const noHierarchyFilters = { ...parsedSearch.filters };
  delete noHierarchyFilters.classificationNodeId;
  delete noHierarchyFilters.classificationScope;
  delete noHierarchyFilters.geographyNodeId;
  delete noHierarchyFilters.geographyScope;
  const filterSummary = [
    {
      keys: ["classNode", "classScope", "classification"],
      label: navigationT("classApplied"),
      value: parsedSearch.filters.classificationNodeId
        ? appliedNodeLabel(
            parsedSearch.filters.classificationNodeId,
            parsedSearch.filters.classification ?? parsedSearch.filters.classificationNodeId,
          )
        : undefined,
    },
    {
      keys: ["geoNode", "geoScope", "geo"],
      label: navigationT("geoApplied"),
      value: parsedSearch.filters.geographyNodeId
        ? appliedNodeLabel(
            parsedSearch.filters.geographyNodeId,
            parsedSearch.filters.geography ?? parsedSearch.filters.geographyNodeId,
          )
        : undefined,
    },

    {
      keys: ["access"],
      label: t("access"),
      value: parsedSearch.filters.accessLevel
        ? common(parsedSearch.filters.accessLevel === "open" ? "public" : "metadataOnly")
        : undefined,
    },
    {
      keys: ["geo"],
      label: t("region"),
      value: parsedSearch.filters.geographyNodeId
        ? undefined
        : formatGeographyCode(parsedSearch.filters.geography, locale),
    },
    {
      keys: ["classification"],
      label: t("classification"),
      value: parsedSearch.filters.classificationNodeId
        ? undefined
        : parsedSearch.filters.classification,
    },
    {
      keys: ["yearFrom", "yearTo"],
      label: t("year"),
      value:
        parsedSearch.filters.referenceYearFrom !== undefined ||
        parsedSearch.filters.referenceYearTo !== undefined
          ? `${parsedSearch.filters.referenceYearFrom ?? "…"}–${parsedSearch.filters.referenceYearTo ?? "…"}`
          : undefined,
    },
    {
      keys: ["subtype"],
      label: t("processSubtype"),
      value: localizeProcessSubtype(parsedSearch.filters.processSubtype, locale),
    },
    { keys: ["source"], label: t("source"), value: parsedSearch.filters.source },
  ].filter((entry): entry is { keys: string[]; label: string; value: string } =>
    Boolean(entry.value),
  );
  const initialEntry = !hasQuery && !inputInvalid;
  const clearFiltersHref = searchHref(locale, { ...parsedSearch, filters: {} }, null);
  const previousPageHref = preserveNavigationPage(
    previousSearchPageHref(locale, parsedSearch, cursorTrail),
  );
  const nextPageHref = nextCursor
    ? preserveNavigationPage(nextSearchPageHref(locale, parsedSearch, nextCursor, cursorTrail))
    : null;
  const facetContent = await FacetsPanel({ locale, parsedSearch, facets, dataUnavailable });

  return (
    <main
      className={`brand-home catalog-search-page ${initialEntry ? "catalog-search-initial" : "catalog-search-results"}`}
      lang={locale}
      data-search-query={query}
      data-search-view={initialEntry ? "initial" : dimension}
      id="main-content"
    >
      <noscript>
        <style>{"@view-transition{navigation:none}"}</style>
      </noscript>
      <div className="brand-container catalog-search-content">
        {!initialEntry && (
          <header className="catalog-results-intro">
            <h1 className="font-heading text-2xl font-semibold">{reference("catalog")}</h1>
          </header>
        )}

        <SearchModes
          key={JSON.stringify({
            kind: parsedSearch.kind,
            query,
            filters:
              dimension === "region"
                ? {
                    ...parsedSearch.filters,
                    geography: undefined,
                    geographyNodeId: undefined,
                    geographyScope: undefined,
                  }
                : parsedSearch.filters,
            dimension,
          })}
          descriptionBlocked={
            hasNavigationFilters(parsedSearch.filters)
              ? {
                  message: navigationT("hybridBlocked"),
                  label: navigationT("clearHierarchy"),
                  href: `${searchHref(locale, { ...parsedSearch, filters: noHierarchyFilters }, null)}#description`,
                }
              : undefined
          }
          labels={{
            mode: t("searchMode"),
            keyword: t("keywordMode"),
            description: t("descriptionMode"),
          }}
          keyword={
            initialEntry ? (
              <CatalogSearchEntry
                locale={locale}
                kind={parsedSearch.kind}
                counts={navigation?.totals ?? null}
              />
            ) : (
              <>
                <search className="brand-search catalog-results-query">
                  <KeywordSearchForm action={localePath(locale, "search")} key={query}>
                    {Array.from(searchParameters(parsedSearch, null))
                      .filter(([key]) => key !== "q")
                      .map(([key, value]) => (
                        <input key={key} name={key} type="hidden" value={value} />
                      ))}
                    <label className="sr-only" htmlFor="catalog-query">
                      {t("label")}
                    </label>
                    <CatalogSearchInput
                      submitLabel={t("submit")}
                      clearLabel={common("clear")}
                      defaultValue={query}
                      id="catalog-query"
                      maxLength={512}
                      name="q"
                      placeholder={t("placeholder")}
                    />
                  </KeywordSearchForm>
                </search>

                <CatalogSearchLayout>
                  <div className="catalog-control-bar">
                    <CatalogResultsToolbar
                      hideTitle={!query}
                      titleId="results-heading"
                      title={query ? `“${query}”` : reference("catalog")}
                      scope={
                        <>
                          {" "}
                          <CatalogKindSwitch
                            value={dimension}
                            label={t("objectType")}
                            labels={{
                              process: common("process"),
                              flow: common("flow"),
                              region: t("region"),
                              source: home("browseSource"),
                            }}
                            hrefs={{
                              process: facetHref(locale, parsedSearch, "kind", "process")!,
                              flow: facetHref(locale, parsedSearch, "kind", "flow")!,
                              region: `${searchHref(locale, parsedSearch, null)}&explore=region`,
                              source: `${searchHref(locale, parsedSearch, null)}&explore=source`,
                            }}
                          />
                        </>
                      }
                      actions={
                        <>
                          {" "}
                          <ResponsiveFacets
                            drawer
                            labels={{
                              title: t("facets"),
                              description: t("filtersDescription"),
                              close: common("close"),
                            }}
                          >
                            {facetContent}
                          </ResponsiveFacets>
                          {!aggregateView && (
                            <CatalogSort
                              value={parsedSearch.sort}
                              label={reference("sort")}
                              options={(
                                [
                                  ["relevance", "sortRelevance"],
                                  ["modified_desc", "sortModified"],
                                  ["name_asc", "sortName"],
                                ] as const
                              ).map(([value, label]) => ({
                                value,
                                label: t(label),
                                href: preserveNavigationPage(
                                  searchHref(locale, { ...parsedSearch, sort: value }, null),
                                )!,
                              }))}
                            />
                          )}
                        </>
                      }
                    />
                    {filterSummary.length > 0 ? (
                      <div aria-label={t("appliedFilters")} className="catalog-applied-filters">
                        {filterSummary.map((entry) => {
                          const params = searchParameters(parsedSearch, null);
                          entry.keys.forEach((key) => params.delete(key));
                          return (
                            <Button
                              asChild
                              className="h-auto min-h-11 whitespace-normal"
                              key={entry.keys[0]}
                              variant="outline"
                            >
                              <Link
                                aria-label={`${common("clear")}: ${entry.label}`}
                                href={`${localePath(locale, "search")}?${params}`}
                                prefetch={false}
                              >
                                <span>
                                  {entry.label}: {entry.value}
                                </span>
                                <XIcon data-icon="inline-end" />
                              </Link>
                            </Button>
                          );
                        })}
                        <Button asChild variant="ghost">
                          <Link href={clearFiltersHref} prefetch={false}>
                            {t("clearFilters")}
                          </Link>
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <div className={!aggregateView ? "catalog-hierarchy-layout" : ""}>
                    {!aggregateView && (
                      <details className="catalog-classification-panel" open>
                        <summary>{navigationT("classification")}</summary>
                        <CatalogNavigation {...navigationProps} />
                      </details>
                    )}
                    <section
                      aria-labelledby="results-heading"
                      aria-live="polite"
                      className="min-w-0"
                    >
                      {!hasQuery ? (
                        <Empty className="min-h-80">
                          <EmptyHeader>
                            <EmptyMedia variant="icon">
                              <SearchIcon aria-hidden="true" />
                            </EmptyMedia>
                            <EmptyTitle>{t("initialTitle")}</EmptyTitle>
                            <EmptyDescription>{t("initialDescription")}</EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      ) : inputInvalid || dataUnavailable ? (
                        <Alert variant={inputInvalid ? "destructive" : "default"}>
                          <AlertDescription>
                            {inputInvalid ? t("emptyDescription") : t("unavailableDescription")}
                          </AlertDescription>
                        </Alert>
                      ) : dimension === "region" ? (
                        <RegionExplorer
                          mapUrl={navigation ? mapUrl : undefined}
                          entries={navigationProps.entries}
                          navigation={navigationProps}
                          labels={{
                            title: navigationT("geography"),
                            showMap: navigationT("showMap"),
                            hideMap: navigationT("hideMap"),
                            loading: navigationT("mapLoading"),
                            unavailable: navigationT("mapUnavailable"),
                            legend: navigationT("mapLegend"),
                            noMap: navigationT("noMap"),
                            skipMap: navigationT("skipMap"),
                            selectRegion: navigationT("selectRegion"),
                            exploreRegion: navigationT("exploreRegion"),
                            viewData: navigationT("viewData"),
                            clearSelection: navigationT("clearSelection"),
                            navigating: navigationT("navigating"),
                            zeroRegions: navigationT("zeroRegions"),
                          }}
                        >
                          {!navigation && facets && (
                            <CatalogFacetResults
                              dimension="region"
                              facets={facets}
                              locale={locale}
                              input={parsedSearch}
                              emptyLabel={t("emptyDescription")}
                              moreLabel={navigationT("partialRegions")}
                            />
                          )}
                        </RegionExplorer>
                      ) : aggregateView ? (
                        <CatalogFacetResults
                          dimension={dimension}
                          facets={facets}
                          locale={locale}
                          input={parsedSearch}
                          emptyLabel={t("emptyDescription")}
                          moreLabel={t("filtersDescription")}
                        />
                      ) : (
                        <CompareSelectionForm action={localePath(locale, "compare")}>
                          <input name="v" type="hidden" value="1" />
                          <SearchResults
                            query={query}
                            items={results}
                            labels={resultLabels}
                            locale={locale}
                            selectable
                            siteOrigin={process.env.SITE_URL ?? "http://localhost:3000"}
                          />
                          <noscript>
                            {" "}
                            {results.some((item) => item.kind === "process") ? (
                              <Button
                                className="h-auto min-h-11 max-w-full self-start whitespace-normal"
                                type="submit"
                              >
                                {t("compareSelected")}
                              </Button>
                            ) : null}
                          </noscript>
                        </CompareSelectionForm>
                      )}
                      {!aggregateView && (previousPageHref || nextPageHref) ? (
                        <CatalogPagination label={`${common("previous")} / ${common("next")}`}>
                          {previousPageHref ? (
                            <Button asChild variant="outline">
                              <Link href={previousPageHref} prefetch={false}>
                                <ArrowLeftIcon aria-hidden="true" />
                                {common("previous")}
                              </Link>
                            </Button>
                          ) : (
                            <Button disabled variant="outline">
                              <ArrowLeftIcon aria-hidden="true" />
                              {common("previous")}
                            </Button>
                          )}
                          {nextPageHref ? (
                            <Button asChild variant="outline">
                              <Link href={nextPageHref} prefetch={false}>
                                {common("next")}
                                <ArrowRightIcon aria-hidden="true" />
                              </Link>
                            </Button>
                          ) : (
                            <Button disabled variant="outline">
                              {common("next")}
                              <ArrowRightIcon aria-hidden="true" />
                            </Button>
                          )}
                        </CatalogPagination>
                      ) : null}
                    </section>
                  </div>
                </CatalogSearchLayout>
              </>
            )
          }
          description={
            <HybridSearchPanel
              key={JSON.stringify({ kind: parsedSearch.kind, filters: parsedSearch.filters })}
              initialFilters={parsedSearch.filters}
              initialKind={parsedSearch.kind}
              labels={{
                activeFilters: hybrid("activeFilters"),
                clearFilters: hybrid("clearFilters"),
                technicalPreview: hybrid("technicalPreview"),
                filterAccess: hybrid("filterAccess"),
                filterClassification: hybrid("filterClassification"),
                filterGeography: hybrid("filterGeography"),
                filterSource: hybrid("filterSource"),
                filterSubtype: hybrid("filterSubtype"),
                filterYearFrom: hybrid("filterYearFrom"),
                filterYearTo: hybrid("filterYearTo"),
                advisoryDescription: hybrid("advisoryDescription"),
                advisoryTitle: hybrid("advisoryTitle"),
                compareSelected: t("compareSelected"),
                description: hybrid("description"),
                emptyDescription: hybrid("emptyDescription"),
                emptyTitle: hybrid("emptyTitle"),
                error: hybrid("error"),
                fallbackDescription: hybrid("fallbackDescription"),
                fallbackTitle: hybrid("fallbackTitle"),
                flow: hybrid("flow"),
                flowPlaceholder: hybrid("flowPlaceholder"),
                kind: hybrid("kind"),
                privacy: hybrid("privacy"),
                process: hybrid("process"),
                queryLabel: hybrid("queryLabel"),
                queryPlaceholder: hybrid("queryPlaceholder"),
                resultsTitle: hybrid("resultsTitle"),
                running: hybrid("running"),
                initialDescription: hybrid("initialDescription"),
                optimizing: hybrid("optimizing"),
                optimizingDescription: hybrid("optimizingDescription"),
                updateTitle: hybrid("updateTitle"),
                updateDescription: hybrid("updateDescription"),
                showUpdated: hybrid("showUpdated"),
                optimized: hybrid("optimized"),
                noMatchesTitle: hybrid("noMatchesTitle"),
                noMatchesDescription: hybrid("noMatchesDescription"),
                loadMore: hybrid("loadMore"),
                loadingMore: hybrid("loadingMore"),
                pageError: hybrid("pageError"),
                cursorExpired: hybrid("cursorExpired"),
                restart: hybrid("restart"),
                semanticQuery: hybrid("semanticQuery"),
                shareCancel: hybrid("shareCancel"),
                shareConfirm: hybrid("shareConfirm"),
                shareDisclosure: hybrid("shareDisclosure"),
                sharePreview: hybrid("sharePreview"),
                shareQuery: hybrid("shareQuery"),
                shared: hybrid("shared"),
                submit: hybrid("submit"),
                terms: hybrid("terms"),
                title: hybrid("title"),
              }}
              locale={locale}
              resultLabels={resultLabels}
              siteOrigin={process.env.SITE_URL ?? "http://localhost:3000"}
            />
          }
        />
      </div>
    </main>
  );
}
