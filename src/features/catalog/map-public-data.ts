import type {
  LocalizedText,
  PublishedLciaPage,
  PublicDatasetEnvelope,
  PublicExchangePage,
  PublicSearchPage,
  PublicVersionPage,
} from "@/server/contracts/portal";
import type {
  PortalHybridCandidate,
  PortalHybridBffVersionResponse,
} from "@/server/hybrid/contracts";
import type { PortalLocale } from "@/i18n/routing";
import { formatGeographyCode, geographyName } from "@/i18n/geography";
import {
  formatDatasetCitation,
  localizeGeographyPrecision,
  localizeLatestVersion,
  localizeMatchReasons,
  localizePublicEvidence,
  localizeReviewStatus,
  localizeFlowType,
} from "@/i18n/domain-vocabulary";

import type {
  CatalogResultViewModel,
  DatasetDetailViewModel,
  ExchangeViewModel,
  LciaViewModel,
  VersionViewModel,
} from "./view-model";
import type { CompareCandidate } from "@/features/compare/compatibility";

type Locale = PortalLocale;

export function localizedText(items: LocalizedText, locale: Locale): string | undefined {
  const displayable = items
    .map((item) => ({ ...item, value: item.value.trim() }))
    .filter((item) => item.value.length > 0);
  if (displayable.length === 0) return undefined;
  const exact = displayable.find((item) => item.language.toLowerCase() === locale.toLowerCase());
  if (exact) return exact.value;
  const sameBase = displayable.find(
    (item) =>
      item.language.split("-", 1)[0]?.toLowerCase() === locale.split("-", 1)[0]?.toLowerCase(),
  );
  if (sameBase) return sameBase.value;
  const english = displayable.find((item) => item.language.toLowerCase().startsWith("en"));
  const fallback = english ?? displayable[0];
  if (!fallback) return undefined;
  return fallback.language.toLowerCase() === "und"
    ? fallback.value
    : `${fallback.value} [${fallback.language}]`;
}

function exactRef(id: string, version: string): string {
  return `${id}@${version}`;
}

function formatFunctionalUnit(
  unit: { amount: string | null; unit: string | null; description: LocalizedText },
  locale: Locale,
): string | undefined {
  if (unit.amount && unit.unit) return `${unit.amount} ${unit.unit}`;
  return localizedText(unit.description, locale);
}

function formatGeography(
  geography: { code: string | null; label: LocalizedText; precision: string },
  locale: Locale,
): string {
  return [
    formatGeographyCode(geography.code, locale) ?? localizedText(geography.label, locale),
    localizeGeographyPrecision(geography.precision, locale),
  ]
    .filter(Boolean)
    .join(" · ");
}

function geographyDescription(
  geography: { code: string | null; label: LocalizedText },
  locale: Locale,
): string | undefined {
  const label = localizedText(geography.label, locale);
  if (
    !label ||
    label === geographyName(geography.code, locale) ||
    label.toUpperCase() === geography.code?.toUpperCase()
  )
    return undefined;
  return label;
}

export function mapSearchItem(
  item: PublicSearchPage["items"][number],
  locale: Locale,
): CatalogResultViewModel {
  const context = item.context;
  const source =
    localizedText(context.source.providerName, locale) ??
    [context.source.databaseId, context.source.databaseVersion].filter(Boolean).join(" · ");
  return {
    description: localizedText(item.summary, locale),
    accessLevel: item.accessLevel,
    capabilities: item.capabilities,
    functionalUnit: context.functionalUnit
      ? `${context.functionalUnit.amount} ${context.functionalUnit.unit}`
      : undefined,
    geography: formatGeography(item.geography, locale),
    kind: item.key.kind,
    match: localizeMatchReasons(item.match.reasonCodes, locale),
    name: localizedText(item.names, locale) ?? exactRef(item.key.id, item.key.version),
    quality: localizeReviewStatus(context.quality.reviewStatus, locale),
    ref: exactRef(item.key.id, item.key.version),
    referenceProduct:
      item.key.kind === "process" ? localizedText(context.reference.name, locale) : undefined,
    referenceFlowProperty:
      item.key.kind === "flow" ? localizedText(context.reference.name, locale) : undefined,
    referenceYear: item.referenceYear?.toString(),
    source: source || undefined,
    technology: localizedText(context.technology, locale),
  };
}

export function mapHybridItem(item: PortalHybridCandidate, locale: Locale): CatalogResultViewModel {
  const context = item.context;
  const source =
    localizedText(context.source.providerName, locale) ??
    [context.source.databaseId, context.source.databaseVersion].filter(Boolean).join(" · ");
  return {
    description: localizedText(item.summary, locale),
    accessLevel: item.accessLevel,
    capabilities: item.capabilities,
    functionalUnit: context.functionalUnit
      ? `${context.functionalUnit.amount} ${context.functionalUnit.unit}`
      : undefined,
    geography: formatGeography(item.geography, locale),
    kind: item.key.kind,
    match: localizeMatchReasons(item.match.reasonCodes, locale),
    name: localizedText(item.names, locale) ?? exactRef(item.key.id, item.key.version),
    quality: localizeReviewStatus(context.quality.reviewStatus, locale),
    ref: exactRef(item.key.id, item.key.version),
    referenceProduct:
      item.key.kind === "process" ? localizedText(context.reference.name, locale) : undefined,
    referenceFlowProperty:
      item.key.kind === "flow" ? localizedText(context.reference.name, locale) : undefined,
    referenceYear: item.referenceYear?.toString(),
    source: source || undefined,
    technology: localizedText(context.technology, locale),
  };
}

export function mapProgressiveSearchPage(
  page: PortalHybridBffVersionResponse,
  locale: Locale,
): CatalogResultViewModel[] {
  if (page.mode !== "hybrid") return page.items.map((item) => mapSearchItem(item, locale));
  return page.items.map((item, index) => ({
    ...mapHybridItem(item, locale),
    matchingVersions: page.versionGroups[index]!.matches.slice(1).map((member) => ({
      ref: exactRef(member.key.id, member.key.version),
      version: member.key.version,
      match: localizeMatchReasons(member.match.reasonCodes, locale),
    })),
  }));
}

export function mapDataset(
  dataset: PublicDatasetEnvelope,
  locale: Locale,
  canonicalUrl: string,
): DatasetDetailViewModel {
  const metadata = dataset.metadata;
  const ref = exactRef(dataset.key.id, dataset.key.version);
  const name = localizedText(metadata.names, locale) ?? ref;
  const source =
    localizedText(metadata.source.providerName, locale) ?? metadata.source.databaseId ?? undefined;
  const citation = formatDatasetCitation(locale, {
    name,
    ref,
    url: canonicalUrl,
    provider: localizedText(metadata.source.providerName, locale),
  });
  const common = {
    accessLevel: dataset.accessLevel,
    capabilities: dataset.capabilities,
    canonicalUrl,
    citation,
    classifications:
      metadata.classifications
        .map((entry) =>
          [entry.system, entry.code, localizedText(entry.label, locale)]
            .filter(Boolean)
            .join(" · "),
        )
        .join("; ") || undefined,
    description: localizedText(metadata.generalComment, locale),
    evidence: localizePublicEvidence(dataset.capabilities.reasonCodes, locale),
    // Preserve the declared category; source.licenseId currently echoes it but is not a license.
    licenseType: metadata.administration.licenseType ?? undefined,
    dataGenerator: localizedText(metadata.administration.dataGenerator.name, locale),
    dataOwner: localizedText(metadata.administration.owner.name, locale),
    accessRestrictions: localizedText(metadata.administration.accessRestrictions, locale),
    licenseUrl:
      metadata.source.licenseUrl && /^https?:\/\//iu.test(metadata.source.licenseUrl)
        ? metadata.source.licenseUrl
        : undefined,
    name,
    originalName: name,
    ref,
    source,
  };

  if (metadata.kind === "process") {
    return {
      ...common,
      functionalUnit: formatFunctionalUnit(metadata.functionalUnit, locale),
      geography: formatGeography(metadata.geography, locale),
      geographyDescription: geographyDescription(metadata.geography, locale),
      kind: "process",
      referenceProduct: localizedText(metadata.referenceProduct, locale),
      referenceYear: metadata.referenceYear?.toString(),
      technology: localizedText(metadata.technology, locale),
    };
  }

  return {
    ...common,
    casNumber: metadata.casNumber ?? undefined,
    flowType: localizeFlowType(metadata.flowType, locale),
    synonyms: localizedText(metadata.synonyms, locale),
    geography:
      formatGeographyCode(metadata.locationOfSupply.code, locale) ??
      localizedText(metadata.locationOfSupply.label, locale),
    kind: "flow",
    referenceFlowProperty: metadata.referenceFlowProperty
      ? localizedText(metadata.referenceFlowProperty.name, locale)
      : undefined,
    referenceFlowPropertyRef: metadata.referenceFlowProperty
      ? exactRef(metadata.referenceFlowProperty.id, metadata.referenceFlowProperty.version)
      : undefined,
  };
}

export function mapExchangePage(
  page: PublicExchangePage,
  locale: Locale,
  expectedProcessRef: string,
): ExchangeViewModel[] {
  if (
    exactRef(page.process.id, page.process.version) !== expectedProcessRef ||
    !page.processContext.functionalUnit.amount ||
    !page.processContext.functionalUnit.unit
  ) {
    return [];
  }
  const functionalUnit = `${page.processContext.functionalUnit.amount} ${page.processContext.functionalUnit.unit}`;
  const processRef = exactRef(page.process.id, page.process.version);
  return page.rows.map((row) => ({
    amount: row.amount,
    capabilityPolicyVersion: page.processContext.capabilityPolicyVersion,
    direction: row.direction,
    flowName: localizedText(row.flow.name, locale) ?? exactRef(row.flow.id, row.flow.version),
    flowRef: exactRef(row.flow.id, row.flow.version),
    functionalUnit,
    id: row.internalId,
    isQuantitativeReference: row.isQuantitativeReference,
    kind: row.kind,
    processRef,
    unit: row.unit,
  }));
}

export function mapLciaPage(
  page: PublishedLciaPage,
  locale: Locale,
  expectedProcessRef: string,
): LciaViewModel {
  if (page.mode !== "process_all_impacts" || page.rows.length === 0) {
    return { status: "unavailable" };
  }

  const rows = page.rows.map((row) => ({
    evidenceStatus: row.evidenceStatus,
    functionalUnit: `${row.functionalUnit.amount} ${row.functionalUnit.unit}`,
    geography: `${formatGeographyCode(row.geography.code, locale) ?? row.geography.code} · ${localizeGeographyPrecision(row.geography.precision, locale)}`,
    impactId: row.impact.id,
    impactName: localizedText(row.impact.name, locale) ?? row.impact.id,
    methodRef: exactRef(row.method.id, row.method.version),
    processRef: exactRef(row.process.id, row.process.version),
    referenceYear: row.referenceYear.toString(),
    unit: row.unit,
    value: row.value,
  }));
  const contextKeys = page.rows.map((row) =>
    JSON.stringify([
      row.process.id,
      row.process.version,
      row.functionalUnit.amount,
      row.functionalUnit.unit,
      row.geography.code,
      row.geography.precision,
      row.referenceYear,
    ]),
  );
  if (
    rows.some((row) => row.processRef !== expectedProcessRef) ||
    new Set(contextKeys).size !== 1
  ) {
    return { status: "unavailable" };
  }

  return {
    publication: page.publication,
    rows,
    status: "available",
  };
}

export function mapVersions(page: PublicVersionPage, locale: Locale): VersionViewModel[] {
  return page.items.map((item) => {
    const ref = exactRef(item.key.id, item.key.version);
    return {
      version: item.key.version,
      isLatest: item.isLatest,
      href: `/${locale}/${item.key.kind}/${encodeURIComponent(ref)}`,
      modifiedAt: item.modifiedAt,
      ref,
      summary: item.isLatest ? localizeLatestVersion(locale) : undefined,
    };
  });
}

export function mapCompareCandidate(
  dataset: PublicDatasetEnvelope,
  locale: Locale,
): CompareCandidate {
  const metadata = dataset.metadata;
  const ref = exactRef(dataset.key.id, dataset.key.version);
  if (metadata.kind !== "process") return { name: ref, ref };

  const allocationAndModeling = localizedText(metadata.allocationAndModeling, locale);
  const lciaMethod =
    dataset.publication?.lciaMethods.length === 1 ? dataset.publication.lciaMethods[0] : undefined;

  return {
    allocationMethod: allocationAndModeling,
    referenceProduct: localizedText(metadata.referenceProduct, locale),
    cutoffRule: localizedText(metadata.cutoffRules, locale),
    functionalUnit:
      metadata.functionalUnit.amount && metadata.functionalUnit.unit
        ? `${metadata.functionalUnit.amount} ${metadata.functionalUnit.unit}`
        : undefined,
    geography: metadata.geography.code ?? localizedText(metadata.geography.label, locale),
    geographyPrecision: metadata.geography.precision,
    lciaMethodRef: lciaMethod ? exactRef(lciaMethod.id, lciaMethod.version) : undefined,
    modelingApproach: allocationAndModeling,
    name: localizedText(metadata.names, locale) ?? ref,
    publicationRef: dataset.publication?.publicationId,
    ref,
    referenceUnit: metadata.functionalUnit.unit ?? undefined,
    referenceYear: metadata.referenceYear?.toString(),
    technology: localizedText(metadata.technology, locale),
  };
}
