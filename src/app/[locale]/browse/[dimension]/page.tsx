import SearchPage from "../../search/page";
import { Rows3Icon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FeedbackLink as Link } from "@/components/shell/feedback-link";
import { notFound } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { localizedText } from "@/features/catalog/map-public-data";
import { isPortalLocale, localePath } from "@/i18n/routing";
import { formatGeographyCode } from "@/i18n/geography";
import { localizedMetadata } from "@/lib/seo";
import { getPublicFacets } from "@/server/data/catalog";
import { PortalDataError } from "@/server/data/supabase-rpc";

const dimensions = ["process", "flow", "region", "source"] as const;
type Dimension = (typeof dimensions)[number];

function isDimension(value: string): value is Dimension {
  return dimensions.some((dimension) => dimension === value);
}

export function generateStaticParams() {
  return dimensions.map((dimension) => ({ dimension }));
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ dimension: string; locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const { dimension, locale } = await params;
  if (!isPortalLocale(locale) || !isDimension(dimension)) return {};
  const t = await getTranslations({ locale, namespace: "Browse" });
  return localizedMetadata({
    description: t(
      dimension === "process" || dimension === "flow" ? "catalogDescription" : "description",
    ),
    index: Object.keys(await searchParams).length === 0,
    locale,
    path: `browse/${dimension}`,
    title: t(`${dimension}Title`),
  });
}

export default async function BrowsePage({
  params,
  searchParams,
}: {
  params: Promise<{ dimension: string; locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { dimension, locale } = await params;
  if (!isPortalLocale(locale) || !isDimension(dimension)) notFound();
  setRequestLocale(locale);
  if (["process", "flow", "region"].includes(dimension)) {
    return (
      <SearchPage
        params={Promise.resolve({ locale })}
        browseKind={dimension === "flow" ? "flow" : "process"}
        searchParams={Promise.resolve({
          ...(await searchParams),
          v: "1",
          ...(dimension === "region" ? { explore: "region" } : { kind: dimension }),
        })}
      />
    );
  }

  const [t, searchT, common] = await Promise.all([
    getTranslations({ locale, namespace: "Browse" }),
    getTranslations({ locale, namespace: "Search" }),
    getTranslations({ locale, namespace: "Common" }),
  ]);
  let dataUnavailable = false;
  let facetValues: Array<{ count: number; label: string; value: string }> = [];

  try {
    const facets = await getPublicFacets({ filters: {}, kind: "all", query: "" });
    const expectedIds = dimension === "region" ? ["region", "geography"] : ["source", "database"];
    const group = facets.groups.find((candidate) =>
      expectedIds.some((id) => candidate.id.toLowerCase().includes(id)),
    );
    facetValues =
      group?.values.map((value) => ({
        count: value.count,
        label:
          dimension === "region"
            ? (formatGeographyCode(value.value, locale) ?? value.value)
            : (localizedText(value.label, locale) ?? value.value),
        value: value.value,
      })) ?? [];
  } catch (error) {
    if (!(error instanceof PortalDataError)) throw error;
    dataUnavailable = true;
  }

  return (
    <main
      className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8"
      id="main-content"
    >
      <header className="flex max-w-3xl flex-col gap-3">
        <h1 className="font-heading text-3xl font-semibold sm:text-4xl">
          {t(`${dimension}Title`)}
        </h1>
        <p className="text-muted-foreground leading-7">
          {t(
            dimension === "process" || dimension === "flow" ? "catalogDescription" : "description",
          )}
        </p>
      </header>
      <nav aria-label={common("browse")} className="flex flex-wrap gap-2">
        {dimensions.map((entry) => (
          <Button
            asChild
            className="h-auto min-h-11 whitespace-normal"
            key={entry}
            variant={entry === dimension ? "secondary" : "outline"}
          >
            <Link
              aria-current={entry === dimension ? "page" : undefined}
              href={localePath(locale, `browse/${entry}`)}
              prefetch={false}
            >
              {entry === "process" || entry === "flow" ? common(entry) : searchT(entry)}
            </Link>
          </Button>
        ))}
      </nav>

      {dataUnavailable ? (
        <Alert>
          <AlertDescription>{searchT("unavailableDescription")}</AlertDescription>
        </Alert>
      ) : facetValues.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {facetValues.map((value) => {
            const filterName = dimension === "region" ? "geo" : "source";
            return (
              <Card key={value.value} size="sm">
                <CardHeader>
                  <CardTitle>{value.label}</CardTitle>
                  <CardDescription>{t("countVersions", { count: value.count })}</CardDescription>
                  <div className="flex flex-wrap gap-2">
                    {(["process", "flow"] as const).map((kind) => (
                      <Button asChild key={kind} variant="outline">
                        <Link
                          href={`${localePath(locale, "search")}?v=1&kind=${kind}&${filterName}=${encodeURIComponent(value.value)}`}
                        >
                          {kind === "process" ? common("process") : common("flow")}
                        </Link>
                      </Button>
                    ))}
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      ) : (
        <Empty className="min-h-80">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Rows3Icon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </main>
  );
}
