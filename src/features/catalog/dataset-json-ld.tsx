import type { PublicDatasetEnvelope } from "@/server/contracts/portal";
import type { PortalLocale } from "@/i18n/routing";

import { localizedText } from "./map-public-data";

/** Google's documented Dataset description bounds; outside them the rich result is ineligible. */
export const minimumDatasetDescriptionLength = 50;
export const maximumDatasetDescriptionLength = 5000;

/**
 * The public description for a dataset's structured data, taken from the same `generalComment` the
 * record page renders and the page metadata advertises, so the markup never describes something a
 * reader cannot see.
 *
 * Missing input is omitted rather than replaced with the identifier or invented prose, and long
 * input is truncated at a word boundary instead of being summarized. Short input is emitted exactly
 * as written: `minimumDatasetDescriptionLength` states the documented eligibility floor, and
 * padding up to it would fabricate content. Rich-result eligibility is therefore deliberately
 * separate from whether the page may be indexed.
 */
export function datasetJsonLdDescription(
  dataset: PublicDatasetEnvelope,
  locale: PortalLocale,
): string | undefined {
  const visible = localizedText(dataset.metadata.generalComment, locale);
  if (!visible) return undefined;
  const normalized = visible.replace(/\s+/gu, " ").trim();
  if (normalized.length === 0) return undefined;
  if (normalized.length <= maximumDatasetDescriptionLength) return normalized;
  const clipped = normalized.slice(0, maximumDatasetDescriptionLength);
  const boundary = clipped.lastIndexOf(" ");
  return boundary > 0 ? clipped.slice(0, boundary) : clipped;
}

export function DatasetJsonLd({
  canonicalUrl,
  dataset,
  locale,
}: {
  canonicalUrl: string;
  dataset: PublicDatasetEnvelope;
  locale: PortalLocale;
}) {
  const metadata = dataset.metadata;
  const provider = localizedText(metadata.source.providerName, locale);
  const description = datasetJsonLdDescription(dataset, locale);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    dateModified: dataset.modifiedAt,
    ...(provider ? { creator: { "@type": "Organization", name: provider } } : {}),
    ...(description ? { description } : {}),
    identifier: `${dataset.key.id}@${dataset.key.version}`,
    inLanguage: locale,
    ...(metadata.source.licenseUrl ? { license: metadata.source.licenseUrl } : {}),
    name: localizedText(metadata.names, locale) ?? `${dataset.key.id}@${dataset.key.version}`,
    ...(metadata.kind === "process" && metadata.referenceYear !== null
      ? { temporalCoverage: metadata.referenceYear.toString() }
      : {}),
    ...(metadata.kind === "process"
      ? {
          spatialCoverage:
            localizedText(metadata.geography.label, locale) ?? metadata.geography.code ?? undefined,
        }
      : {}),
    url: canonicalUrl,
    version: dataset.key.version,
  };

  return (
    <script
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replaceAll("<", "\\u003c") }}
      type="application/ld+json"
    />
  );
}
