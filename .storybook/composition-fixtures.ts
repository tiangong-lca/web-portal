import type { ComponentProps } from "react";
import type { PortalLocale } from "../src/i18n/routing";
import type { DatasetDetailViewModel, LciaViewModel } from "../src/features/catalog/view-model";
import type { LciaPanel } from "../src/features/catalog/lcia-panel";
import type { PublicFacets } from "../src/server/contracts/portal";
import type { PortalSearchUrlInput } from "../src/server/contracts/input";
import { catalogItems, dictionaries, refs, sampleNames } from "./fixtures";

export function detailRecord(
  locale: PortalLocale,
  kind: "process" | "flow",
): DatasetDetailViewModel {
  return {
    ...catalogItems(locale)[kind === "process" ? 0 : 2]!,
    classifications: "C · 35.11 · Storybook fixture",
    licenseType: "Free of charge for all users and uses",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    citation: `${sampleNames[locale][kind === "process" ? 0 : 2]} · Storybook · ${refs[kind === "process" ? 0 : 2]}`,
    ...(kind === "flow"
      ? { casNumber: "124-38-9", flowType: "Elementary flow", referenceFlowProperty: "Mass · kg" }
      : {}),
  };
}

export function lciaLabels(locale: PortalLocale): ComponentProps<typeof LciaPanel>["labels"] {
  const { Detail: d, Common: c } = dictionaries[locale];
  return {
    unavailableTitle: d.lciaEmptyTitle,
    failureTitle: d.lciaFailureTitle,
    functionalUnit: d.functionalUnit,
    geography: d.geography,
    guardUnavailable: d.lciaGuardUnavailable,
    impact: d.impact,
    method: d.methodVersion,
    package: d.package,
    process: c.process,
    publication: d.publication,
    published: d.published,
    referenceYear: d.referenceYear,
    releaseDetails: d.releaseDetails,
    context: d.lciaContext,
    unavailable: d.lciaUnavailable,
    unit: d.unit,
    value: d.value,
    verificationCode: d.verificationCode,
  };
}

const impactNames = {
  "zh-CN": ["气候变化", "淡水富营养化", "矿产和金属资源使用"],
  en: ["Climate change", "Freshwater eutrophication", "Mineral and metal resource use"],
  de: ["Klimawandel", "Süßwassereutrophierung", "Ressourcennutzung, Mineralien und Metalle"],
  fr: [
    "Changement climatique",
    "Eutrophisation des eaux douces",
    "Utilisation des ressources minérales et métalliques",
  ],
};

export function lciaResult(locale: PortalLocale): Extract<LciaViewModel, { status: "available" }> {
  return {
    status: "available",
    publication: {
      publicationId: "storybook-publication-2026-01",
      packageId: "storybook-lcia-package",
      packageVersion: "01.00.000",
      publishedAt: "2026-01-01T00:00:00Z",
      evidenceHash: "abcdef0123456789".repeat(4),
    },
    rows: impactNames[locale].map((impactName, index) => ({
      impactId: refs[index]!,
      impactName,
      value: ["123456.789012345", "0.000000012345", "-0.005"][index]!,
      unit: ["kg CO₂ eq", "kg P eq", "kg Sb eq"][index]!,
      processRef: refs[0],
      methodRef: refs[4],
      functionalUnit: "1 kWh",
      geography: "CN",
      referenceYear: "2022",
      evidenceStatus: "verified",
    })),
  };
}

export const facetSearch: PortalSearchUrlInput = {
  kind: "process",
  query: "electricity",
  limit: 10,
  sort: "relevance",
  cursor: "old_page",
  filters: {
    source: "storybook",
    geography: "cn",
    processSubtype: "unit process, single operation",
  },
};

export function populatedFacets(locale: PortalLocale): PublicFacets {
  const m = dictionaries[locale].Search;
  const groups: [string, string, string[]][] = [
    [
      "geography",
      m.region,
      [
        "CN",
        "DE",
        "FR",
        "US",
        "GB",
        "JP",
        "CA",
        "IN",
        "BR",
        "ZA",
        "AU",
        "AT",
        "BE",
        "IT",
        "NL",
        "NO",
        "ES",
        "SE",
      ],
    ],
    ["accessLevel", m.access, ["open", "metadata_only"]],
    ["processSubtype", m.processSubtype, ["unit process, single operation", "LCI result"]],
    ["source", m.source, [sampleNames[locale][0]!, sampleNames[locale][1]!]],
  ];
  return {
    schemaVersion: "portal.public-facets.v2",
    kind: "process",
    queryFingerprint: "a".repeat(64),
    groups: groups.map(([id, label, values]) => ({
      id,
      hasMore: false,
      label: [{ language: locale, value: label }],
      values: values.map((value, index) => ({
        value,
        label: [{ language: locale, value }],
        count: 1200 - index * 13,
      })),
    })),
  };
}
