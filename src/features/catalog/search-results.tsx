import { Badge } from "@/components/ui/badge";
import { CatalogCopyIdentity } from "./catalog-copy-identity";
import { CatalogResultRow, CatalogResultList, CatalogResultSummary } from "./catalog-result-row";
import { DatasetVersionTag, PublicContentTag } from "./dataset-tags";
import "./search-workspace.css";
import { BookmarkPlusIcon } from "lucide-react";
import { FeedbackLink as Link } from "@/components/shell/feedback-link";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import type { CatalogResultViewModel } from "@/features/catalog/view-model";
import { localePath, type PortalLocale } from "@/i18n/routing";
import { formatDatasetCitation } from "@/i18n/domain-vocabulary";
import { CompareChoice } from "@/features/compare/selection";
import { buildMemberFragment } from "@/features/collections/storage-v2";

import { CitationCopy } from "./citation-copy";
import { groupSearchResults } from "./search-version-groups";
import { AvailabilityBadges } from "./availability-badges";

export type SearchResultLabels = {
  publicContentLabels?: {
    publicContent: string;
    availabilityExchanges: string;
    availabilityMetadata: string;
    exchangesHelp: string;
    metadataHelp: string;
  };
  collect: string;
  compare: string;
  copied: string;
  copyCitation: string;
  copyFailure: string;
  details: string;
  emptyDescription: string;
  emptyTitle: string;
  functionalUnit: string;
  geography: string;
  match: string;
  metadataOnly: string;
  flow: string;
  process: string;
  public: string;
  quality: string;
  reference: string;
  referenceYear: string;
  selectForCompare: string;
  source: string;
  technology: string;
  matchingVersions: string;
  version: string;
  referenceFlowProperty: string;
  exchangesAvailable: string;
  lciaAvailable: string;
};

/** @import import { SearchResults } from "@/features/catalog/search-results"; */
export function SearchResults({
  items,
  labels,
  locale,
  selectable = false,
  siteOrigin,
  query,
}: {
  items: CatalogResultViewModel[];
  labels: SearchResultLabels;
  locale: PortalLocale;
  selectable?: boolean;
  siteOrigin: string;
  query?: string;
}) {
  if (items.length === 0) {
    return (
      <Empty className="min-h-72">
        <EmptyHeader>
          <EmptyTitle>{labels.emptyTitle}</EmptyTitle>
          <EmptyDescription>{labels.emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <CatalogResultList>
      {groupSearchResults(items).map((item) => {
        const detailHref = localePath(locale, `${item.kind}/${encodeURIComponent(item.ref)}`);
        const citation = formatDatasetCitation(locale, {
          name: item.name,
          ref: item.ref,
          url: new URL(detailHref, siteOrigin).toString(),
        });
        const context = [
          {
            label: item.kind === "flow" ? labels.referenceFlowProperty : labels.reference,
            value: item.kind === "flow" ? item.referenceFlowProperty : item.referenceProduct,
          },
          { label: labels.functionalUnit, value: item.functionalUnit },
          { label: labels.geography, value: item.geography },
          { label: labels.referenceYear, value: item.referenceYear },
          { label: labels.source, value: item.source },
          { label: labels.match, value: item.match },
        ].filter((entry): entry is { label: string; value: string } => Boolean(entry.value));

        return (
          <CatalogResultRow
            key={`${item.kind}:${item.ref}`}
            title={
              <Link href={detailHref} prefetch={false}>
                {item.name}
              </Link>
            }
            selection={
              selectable && item.kind === "process" ? (
                <CompareChoice
                  checkbox
                  item={{ name: item.name, ref: item.ref }}
                  label={labels.selectForCompare}
                  locale={locale}
                />
              ) : undefined
            }
            tags={
              <>
                {item.ref.includes("@") && (
                  <DatasetVersionTag version={item.ref.split("@")[1]!} label={labels.version} />
                )}
                {labels.publicContentLabels ? (
                  <PublicContentTag
                    compact
                    content={item.capabilities?.exchangesVisible ? "exchanges" : "metadata"}
                    labels={labels.publicContentLabels}
                  />
                ) : (
                  <AvailabilityBadges
                    capabilities={item.capabilities}
                    labels={{
                      exchanges: labels.exchangesAvailable,
                      lcia: labels.lciaAvailable,
                      metadata: labels.metadataOnly,
                    }}
                  />
                )}
                {labels.publicContentLabels && item.capabilities?.lciaVisible && (
                  <PublicContentTag
                    compact
                    content="lcia"
                    label={labels.lciaAvailable}
                    labels={labels.publicContentLabels}
                  />
                )}
              </>
            }
            action={
              <div className="catalog-result-actions">
                <CatalogCopyIdentity reference={item.ref} />
                <CitationCopy
                  iconOnly
                  showText={false}
                  citation={citation}
                  copiedLabel={labels.copied}
                  copyLabel={labels.copyCitation}
                  failureLabel={labels.copyFailure}
                />
                <Button asChild variant="ghost" size="icon">
                  <Link
                    aria-label={`${labels.collect}: ${item.name}`}
                    title={labels.collect}
                    href={`${localePath(locale, "collections")}${buildMemberFragment(item)}`}
                  >
                    <BookmarkPlusIcon aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            }
          >
            <dl className="cr-row-meta">
              {context
                .filter((entry) => entry.label !== labels.match)
                .map(({ label, value }) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
            </dl>
            <CatalogResultSummary text={item.description} query={query} />

            {item.matchingVersions && item.matchingVersions.length > 0 ? (
              <Accordion collapsible type="single">
                <AccordionItem value="versions">
                  <AccordionTrigger className="min-h-11" type="button">
                    <span>
                      {labels.matchingVersions}{" "}
                      <Badge className="ml-2" variant="secondary">
                        {item.matchingVersions.length}
                      </Badge>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="flex flex-col gap-3">
                      {item.matchingVersions.map((version) => (
                        <li
                          className="bg-muted/40 grid grid-cols-1 gap-3 rounded-lg p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                          key={version.ref}
                        >
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <Link
                              className="text-sm font-medium break-words"
                              href={localePath(
                                locale,
                                `${item.kind}/${encodeURIComponent(version.ref)}`,
                              )}
                            >
                              {version.name ?? `${labels.version} ${version.version}`}
                            </Link>
                            {version.name ? (
                              <span className="text-muted-foreground font-mono text-xs">
                                {labels.version} {version.version}
                              </span>
                            ) : null}
                            {version.match ? (
                              <span className="text-muted-foreground text-xs">{version.match}</span>
                            ) : null}
                          </div>
                          {selectable && item.kind === "process" ? (
                            <CompareChoice
                              checkbox
                              item={{ name: version.name ?? item.name, ref: version.ref }}
                              label={labels.selectForCompare}
                              locale={locale}
                            />
                          ) : item.kind === "process" ? (
                            <CompareChoice
                              item={{ name: version.name ?? item.name, ref: version.ref }}
                              label={labels.compare}
                              locale={locale}
                            />
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            ) : null}
          </CatalogResultRow>
        );
      })}
    </CatalogResultList>
  );
}
