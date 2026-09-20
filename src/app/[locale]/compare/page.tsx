import { KeywordSearchForm } from "@/features/catalog/keyword-search-form";
import type { Metadata } from "next";
import { FeedbackLink as Link } from "@/components/shell/feedback-link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { parseExactDatasetRef } from "@/features/catalog/exact-ref";
import { mapCompareCandidate, mapLciaPage } from "@/features/catalog/map-public-data";
import { AddCompareVersion } from "@/features/compare/add-version";
import { CompareSelectionSeed } from "@/features/compare/selection";
import {
  applyComparableLcia,
  shouldRequestComparableLcia,
} from "@/features/compare/comparable-lcia";
import {
  CompareWorkbench,
  type ComparableLciaPresentation,
} from "@/features/compare/compare-workbench";
import type { CompareCandidate } from "@/features/compare/compatibility";
import { parseCompareIds, parseImpactCategoryId } from "@/features/compare/input";
import { isPortalLocale, localePath } from "@/i18n/routing";
import { localizedMetadata } from "@/lib/seo";
import { getPublicDataset } from "@/server/data/catalog";
import { PortalDataError } from "@/server/data/supabase-rpc";
import { getComparablePublishedLciaValues } from "@/server/lcia/compare";
import { queryPublishedLcia } from "@/server/lcia/client";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/compare">): Promise<Metadata> {
  const { locale } = await params;
  if (!isPortalLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "Compare" });
  return localizedMetadata({
    locale,
    path: "compare",
    title: t("title"),
    description: t("description"),
    index: false,
  });
}

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    ids?: string | string[];
    impactCategoryId?: string | string[];
  }>;
}) {
  const { locale } = await params;
  if (!isPortalLocale(locale)) notFound();
  setRequestLocale(locale);
  const query = await searchParams;
  const ids = parseCompareIds(query.ids);
  const impactCategoryId = parseImpactCategoryId(query.impactCategoryId);
  const datasets = await Promise.all(
    ids.map(async (ref) => {
      const parsed = parseExactDatasetRef(ref);
      if (!parsed) return null;
      try {
        return await getPublicDataset({ kind: "process", ...parsed });
      } catch (error) {
        if (error instanceof PortalDataError) return null;
        throw error;
      }
    }),
  );
  let candidates: CompareCandidate[] = ids.map((ref, index) => {
    const dataset = datasets[index];
    return dataset ? mapCompareCandidate(dataset, locale) : { name: ref, ref };
  });
  let numericContext: ComparableLciaPresentation | undefined;
  let impactOptions: { id: string; name: string }[] = [];
  let moreImpacts = false;
  // This discovery read supplies labels only; numerical alignment still passes
  // the independent, exact-version/publication compatibility gate below.
  const firstDataset = datasets[0];
  if (ids.length >= 2 && firstDataset?.capabilities.lciaVisible) {
    const response = await queryPublishedLcia({
      mode: "process_all_impacts",
      processRefs: [{ id: firstDataset.key.id, version: firstDataset.key.version }],
      impactCategoryId: null,
      cursor: null,
      limit: 50,
    });
    if (response.status === "available") {
      const mapped = mapLciaPage(response.data, locale, ids[0]!);
      if (mapped.status === "available") {
        impactOptions = [
          ...new Map(
            mapped.rows.map((row) => [row.impactId, { id: row.impactId, name: row.impactName }]),
          ).values(),
        ];
        moreImpacts = Boolean(response.data.nextCursor);
      }
    }
  }
  if (impactCategoryId && shouldRequestComparableLcia(impactCategoryId, candidates, datasets)) {
    const processRefs = datasets.map((dataset) => ({
      id: dataset!.key.id,
      version: dataset!.key.version,
    }));
    const lcia = await getComparablePublishedLciaValues({ impactCategoryId, processRefs });
    if (lcia.status === "available") {
      const mapped = applyComparableLcia(candidates, datasets, lcia.data, locale);
      if (mapped) {
        candidates = mapped.candidates;
        numericContext = mapped.context;
      }
    }
  }

  const [t, common, detail] = await Promise.all([
    getTranslations({ locale, namespace: "Compare" }),
    getTranslations({ locale, namespace: "Common" }),
    getTranslations({ locale, namespace: "Detail" }),
  ]);

  return (
    <main
      className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8"
      id="main-content"
    >
      <header className="flex max-w-4xl flex-col gap-3">
        <h1 className="font-heading text-3xl font-semibold sm:text-5xl">{t("title")}</h1>
        <p className="text-muted-foreground text-lg leading-8">{t("description")}</p>
      </header>
      <CompareSelectionSeed items={candidates.map(({ name, ref }) => ({ name, ref }))} />
      <section aria-label={t("openComparison")} className="flex flex-col gap-4">
        <ul className="grid gap-3 sm:grid-cols-2">
          {candidates.map((candidate) => (
            <li className="flex min-w-0 flex-col gap-2 rounded-xl border p-4" key={candidate.ref}>
              <Link
                className="font-medium break-words"
                href={localePath(locale, `process/${encodeURIComponent(candidate.ref)}`)}
                prefetch={false}
              >
                {candidate.name}
              </Link>
              <p className="text-muted-foreground font-mono text-xs break-all">{candidate.ref}</p>
              <Button
                asChild
                className="h-auto min-h-11 self-start whitespace-normal"
                variant="ghost"
              >
                <Link
                  href={`${localePath(locale, "compare")}?${new URLSearchParams({ v: "1", ids: ids.filter((id) => id !== candidate.ref).join(",") })}`}
                  prefetch={false}
                >
                  {t("removeSelection")}
                </Link>
              </Button>
            </li>
          ))}
        </ul>
        <div className="compare-member-actions">
          <AddCompareVersion
            ids={ids}
            locale={locale}
            labels={{
              title: t("addVersion"),
              hint: t("addVersionHint"),
              invalid: t("invalidRef"),
              add: t("addVersion"),
            }}
          />
          <Button asChild className="h-auto min-h-11 whitespace-normal" variant="outline">
            <Link href={localePath(locale, "search?kind=process")}>{t("continueSelecting")}</Link>
          </Button>
        </div>
      </section>
      {ids.length >= 2 ? (
        <section aria-label={t("impactCategory")}>
          {impactOptions.length > 0 ? (
            <search>
              <KeywordSearchForm action={localePath(locale, "compare")}>
                <input name="v" type="hidden" value="1" />
                <input name="ids" type="hidden" value={ids.join(",")} />
                <label className="font-medium" htmlFor="impact-category-id">
                  {t("impactCategory")}
                </label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    className="border-input bg-background h-11 w-full min-w-0 rounded-lg border px-3 text-sm"
                    defaultValue={
                      impactCategoryId &&
                      impactOptions.some((option) => option.id === impactCategoryId)
                        ? impactCategoryId
                        : ""
                    }
                    id="impact-category-id"
                    name="impactCategoryId"
                    required
                  >
                    <option disabled value="">
                      {t("chooseImpact")}
                    </option>
                    {impactOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                  <Button className="h-auto min-h-11 whitespace-normal" type="submit">
                    {t("numericTitle")}
                  </Button>
                </div>
              </KeywordSearchForm>
              {moreImpacts ? (
                <p className="text-muted-foreground mt-2 text-sm">{t("moreImpactOptions")}</p>
              ) : null}
            </search>
          ) : (
            <p className="text-muted-foreground text-sm">{t("noImpactOptions")}</p>
          )}
        </section>
      ) : null}
      <CompareWorkbench
        candidates={candidates}
        labels={{
          dimension: t("dimension"),
          evidenceNotice: t("evidenceNotice"),
          resultStatus: t("resultStatus"),
          attentionFields: t("attentionFields", { count: "{count}" }),
          emptyDescription: t("emptyDescription"),
          emptyTitle: t("emptyTitle"),
          matrix: t("matrix"),
          member: (index) => t("member", { index }),
          metadataOnly: t("metadataOnly"),
          notProvided: common("notProvided"),
          numericContext: t("numericContext"),
          numericTitle: t("numericTitle"),
          impactCategory: t("impactCategory"),
          method: detail("methodVersion"),
          publication: detail("publication"),
          package: detail("package"),
          evidence: detail("verificationCode"),
          unit: detail("unit"),
          value: detail("value"),
          status: {
            converted: t("statusConverted"),
            direct: t("statusDirect"),
            incompatible: t("statusIncompatible"),
            insufficient: t("statusInsufficient"),
            reference_only: t("statusReference"),
          },
        }}
        locale={locale}
        numericContext={numericContext}
      />
    </main>
  );
}
