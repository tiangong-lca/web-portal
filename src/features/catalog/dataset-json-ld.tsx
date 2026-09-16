import type { PublicDatasetEnvelope } from "@/server/contracts/portal";
import type { PortalLocale } from "@/i18n/routing";

import { localizedText } from "./map-public-data";

/** Google's documented Dataset description bounds; outside them the rich result is ineligible. */
export const minimumDatasetDescriptionLength = 50;
export const maximumDatasetDescriptionLength = 5000;

/** Deterministic eligibility outcome. Reasons are reportable and carry no telemetry. */
export type DatasetJsonLdEligibility =
  | { eligible: true; reason: "eligible"; description: string }
  | { eligible: false; reason: "missing-description" | "short-description" | "missing-name" };

/** Length in Unicode characters, so astral characters count once and are never split. */
function characterCount(value: string): number {
  return Array.from(value).length;
}

/**
 * Trim to the documented maximum without splitting a surrogate pair. The word-boundary cut is used
 * only when it still leaves a usable description: an early run of whitespace must not collapse a
 * long comment down to a few characters.
 */
function clampDescription(normalized: string): string {
  const characters = Array.from(normalized);
  if (characters.length <= maximumDatasetDescriptionLength) return normalized;
  const clipped = characters.slice(0, maximumDatasetDescriptionLength).join("");
  const boundary = clipped.lastIndexOf(" ");
  const wordSafe = boundary > 0 ? clipped.slice(0, boundary) : "";
  return characterCount(wordSafe) >= minimumDatasetDescriptionLength ? wordSafe : clipped;
}

/**
 * Whether this record can carry a truthful `Dataset` description, and why not when it cannot.
 *
 * The text is the same public `generalComment` the record page renders and the page metadata
 * advertises, so the markup never describes something a reader cannot see. A record without a
 * displayable comment or without a real name is ineligible: the component then emits no script at
 * all rather than an invalid `Dataset`, and nothing is padded, summarized or invented to qualify.
 * Eligibility is deliberately unrelated to whether the page may be indexed.
 */
export function datasetJsonLdEligibility(
  dataset: PublicDatasetEnvelope,
  locale: PortalLocale,
): DatasetJsonLdEligibility {
  if (!localizedText(dataset.metadata.names, locale))
    return { eligible: false, reason: "missing-name" };
  const visible = localizedText(dataset.metadata.generalComment, locale);
  if (!visible) return { eligible: false, reason: "missing-description" };
  const normalized = visible.replace(/\s+/gu, " ").trim();
  if (normalized.length === 0) return { eligible: false, reason: "missing-description" };
  const description = clampDescription(normalized);
  if (characterCount(description) < minimumDatasetDescriptionLength)
    return { eligible: false, reason: "short-description" };
  return { eligible: true, reason: "eligible", description };
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
  const eligibility = datasetJsonLdEligibility(dataset, locale);
  if (!eligibility.eligible) return null;

  const metadata = dataset.metadata;
  const provider = localizedText(metadata.source.providerName, locale);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    dateModified: dataset.modifiedAt,
    ...(provider ? { creator: { "@type": "Organization", name: provider } } : {}),
    description: eligibility.description,
    identifier: `${dataset.key.id}@${dataset.key.version}`,
    inLanguage: locale,
    ...(metadata.source.licenseUrl ? { license: metadata.source.licenseUrl } : {}),
    name: localizedText(metadata.names, locale),
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
