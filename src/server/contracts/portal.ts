import "server-only";

import { z } from "zod";

import type {
  CasExample as DatabaseCatalogCasExample,
  ClassificationExample as DatabaseCatalogClassificationExample,
  TianGongPortalPublicCatalogSummaryV1 as DatabasePublicCatalogSummary,
  UuidExample as DatabaseCatalogUuidExample,
} from "../../../contracts/database-engine/portal/generated/portal.public-catalog-summary.v1";
import type { TianGongPortalPublicSearchPageV3 as DatabasePublicSearchPage } from "../../../contracts/database-engine/portal/generated/portal.public-search-page.v3";

export type PublicCatalogSummary = Omit<DatabasePublicCatalogSummary, "examples"> & {
  examples: Array<
    DatabaseCatalogUuidExample | DatabaseCatalogCasExample | DatabaseCatalogClassificationExample
  >;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const versionPattern = /^\d{2}\.\d{2}\.\d{3}$/;
const realPattern =
  /^(?=(?:[^0-9]*[0-9]){1,38}[^0-9]*$)(?:0|-?(?:[1-9]\d*(?:\.\d*[1-9])?|0\.\d*[1-9]))$/;
const publicHttpsUriPattern = /^https:\/\/[^/?#@\s]+(?:\/[^?#\s]*)?$/;
const languagePattern = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

function excludesC0C1Controls(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) return false;
  }
  return true;
}

export const portalUuidSchema = z.string().regex(uuidPattern);
export const portalVersionSchema = z.string().regex(versionPattern);
export const portalRealSchema = z.string().regex(realPattern);
export const portalSha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
export const portalDateTimeSchema = z.iso.datetime({ offset: true });
export const portalNonEmptyStringSchema = z.string().min(1);
export const portalNullableNonEmptyStringSchema = portalNonEmptyStringSchema.nullable();
export const portalPublicHttpsUriSchema = z.url().regex(publicHttpsUriPattern);
export const portalDatasetKindSchema = z.enum(["process", "flow"]);
export const portalAccessLevelSchema = z.enum(["open", "metadata_only"]);
export const portalGeographyPrecisionSchema = z.enum([
  "country",
  "province",
  "city",
  "other",
  "unknown",
]);
export const portalYearSchema = z.number().int().min(0).max(9999);
export const portalNullableYearSchema = portalYearSchema.nullable();
export const portalCursorSchema = z.string().min(1).max(4096);
export const portalNullableCursorSchema = portalCursorSchema.nullable();
export const portalSitemapShardCursorSchema = portalCursorSchema.regex(/^[A-Za-z0-9_-]+$/);

export const localizedTextItemSchema = z.strictObject({
  language: z.string().min(2).max(35).regex(languagePattern),
  value: z.string(),
});
export const localizedTextSchema = z.array(localizedTextItemSchema);

export const publicDatasetKeySchema = z.strictObject({
  kind: portalDatasetKindSchema,
  id: portalUuidSchema,
  version: portalVersionSchema,
});
export const exactDatasetIdentitySchema = z.strictObject({
  id: portalUuidSchema,
  version: portalVersionSchema,
});
export const exactNamedDatasetIdentitySchema = exactDatasetIdentitySchema.extend({
  name: localizedTextSchema,
});
export const classificationSchema = z.strictObject({
  system: portalNonEmptyStringSchema,
  code: portalNonEmptyStringSchema,
  label: localizedTextSchema,
});
export const geographySchema = z.strictObject({
  code: portalNullableNonEmptyStringSchema,
  label: localizedTextSchema,
  precision: portalGeographyPrecisionSchema,
});
export const functionalUnitSchema = z.strictObject({
  amount: portalRealSchema.nullable(),
  unit: portalNullableNonEmptyStringSchema,
  description: localizedTextSchema,
});
export const completeFunctionalUnitSchema = z.strictObject({
  amount: portalRealSchema,
  unit: portalNonEmptyStringSchema,
  description: localizedTextSchema,
});

export const publicCapabilitiesSchema = z.strictObject({
  metadataVisible: z.literal(true),
  exchangesVisible: z.boolean(),
  lciaVisible: z.boolean(),
  publicArtifactVisible: z.boolean(),
  citationVisible: z.literal(true),
  policyVersion: portalNonEmptyStringSchema,
  reasonCodes: z
    .array(portalNonEmptyStringSchema)
    .refine((values) => new Set(values).size === values.length, "reasonCodes must be unique"),
});
export const fieldOriginSchema = z.strictObject({
  path: portalNonEmptyStringSchema,
  kind: z.enum(["original", "normalized", "derived", "ai_inferred"]),
  ruleId: portalNullableNonEmptyStringSchema,
  ruleVersion: portalNullableNonEmptyStringSchema,
  confidence: z.enum(["high", "medium", "low"]).nullable(),
  reason: localizedTextSchema,
});
export const publicSourceSchema = z.strictObject({
  databaseId: portalNullableNonEmptyStringSchema,
  databaseVersion: portalNullableNonEmptyStringSchema,
  sourceRecordId: portalNullableNonEmptyStringSchema,
  providerName: localizedTextSchema,
  licenseId: portalNullableNonEmptyStringSchema,
  licenseUrl: portalPublicHttpsUriSchema.nullable(),
});
export const publicCardReferenceSchema = z.strictObject({
  kind: z.enum(["reference_product", "reference_flow_property"]),
  name: localizedTextSchema,
});
export const publicCardQualitySchema = z.strictObject({
  reviewStatus: portalNullableNonEmptyStringSchema,
});
export const publicCardContextSchema = z.strictObject({
  reference: publicCardReferenceSchema,
  functionalUnit: completeFunctionalUnitSchema.nullable(),
  technology: localizedTextSchema,
  source: publicSourceSchema,
  quality: publicCardQualitySchema,
});

const publicNamedReferencePresentSchema = z.strictObject({
  id: portalUuidSchema,
  version: portalVersionSchema,
  name: localizedTextSchema,
});
const publicNamedReferenceAbsentSchema = z.strictObject({
  id: z.null(),
  version: z.null(),
  name: localizedTextSchema,
});
export const publicNamedReferenceSchema = z.union([
  publicNamedReferencePresentSchema,
  publicNamedReferenceAbsentSchema,
]);
export const publicComplianceDeclarationSchema = z.strictObject({
  system: publicNamedReferenceSchema,
  overall: portalNullableNonEmptyStringSchema,
  nomenclature: portalNullableNonEmptyStringSchema,
  methodological: portalNullableNonEmptyStringSchema,
  review: portalNullableNonEmptyStringSchema,
  documentation: portalNullableNonEmptyStringSchema,
  quality: portalNullableNonEmptyStringSchema,
});
export const publicAdministrationSchema = z.strictObject({
  workflowStatus: portalNullableNonEmptyStringSchema,
  copyright: z.boolean().nullable(),
  owner: publicNamedReferenceSchema,
  commissioner: publicNamedReferenceSchema,
  dataGenerator: publicNamedReferenceSchema,
  dataEntryBy: publicNamedReferenceSchema,
  project: localizedTextSchema,
  intendedApplications: localizedTextSchema,
  accessRestrictions: localizedTextSchema,
  licenseType: portalNullableNonEmptyStringSchema,
  registrationNumber: portalNullableNonEmptyStringSchema,
  lastRevisionAt: portalDateTimeSchema.nullable(),
  permanentDataSetUri: portalPublicHttpsUriSchema.nullable(),
  precedingVersion: publicNamedReferenceSchema,
});

export const publicQualitySchema = z.strictObject({
  reviewStatus: portalNullableNonEmptyStringSchema,
  timeRepresentativeness: portalNullableNonEmptyStringSchema,
  geographyRepresentativeness: portalNullableNonEmptyStringSchema,
  technologyRepresentativeness: portalNullableNonEmptyStringSchema,
  completeness: portalNullableNonEmptyStringSchema,
  uncertainty: portalNullableNonEmptyStringSchema,
});
export const publicProcessMetadataSchema = z.strictObject({
  kind: z.literal("process"),
  names: localizedTextSchema,
  generalComment: localizedTextSchema,
  referenceProduct: localizedTextSchema,
  functionalUnit: functionalUnitSchema,
  classifications: z.array(classificationSchema),
  geography: geographySchema,
  referenceYear: portalNullableYearSchema,
  validUntilYear: portalNullableYearSchema,
  technology: localizedTextSchema,
  dataSetType: portalNullableNonEmptyStringSchema,
  allocationAndModeling: localizedTextSchema,
  cutoffRules: localizedTextSchema,
  quality: publicQualitySchema,
  source: publicSourceSchema,
  compliance: z.array(publicComplianceDeclarationSchema),
  administration: publicAdministrationSchema,
});
export const publicFlowMetadataSchema = z.strictObject({
  kind: z.literal("flow"),
  names: localizedTextSchema,
  synonyms: localizedTextSchema,
  generalComment: localizedTextSchema,
  casNumber: z
    .string()
    .regex(/^[0-9]{2,7}-[0-9]{2}-[0-9]$/)
    .nullable(),
  flowType: z.enum(["product", "elementary", "waste", "other", "unknown"]),
  classifications: z.array(classificationSchema),
  locationOfSupply: z.strictObject({
    code: portalNullableNonEmptyStringSchema,
    label: localizedTextSchema,
  }),
  referenceFlowProperty: exactNamedDatasetIdentitySchema.nullable(),
  source: publicSourceSchema,
  compliance: z.array(publicComplianceDeclarationSchema),
  administration: publicAdministrationSchema,
});
export const publicProvenanceSchema = z.strictObject({
  importBatchId: portalNullableNonEmptyStringSchema,
  normalizationRuleVersion: portalNullableNonEmptyStringSchema,
  fieldOrigins: z.array(fieldOriginSchema),
});
export const publicPublicationSchema = z.strictObject({
  publicationId: portalUuidSchema,
  packageId: portalUuidSchema,
  packageVersion: portalNonEmptyStringSchema,
  publishedAt: portalDateTimeSchema,
  lciaMethods: z
    .array(exactDatasetIdentitySchema)
    .refine(
      (values) =>
        new Set(values.map((value) => `${value.id}@${value.version}`)).size === values.length,
      "lciaMethods must be unique",
    ),
});
export const publicBrandSchema = z.discriminatedUnion("code", [
  z.strictObject({ code: z.literal("tiangong_lca"), name: z.literal("Tiangong LCA") }),
  z.strictObject({ code: z.literal("bafu"), name: z.literal("BAFU") }),
  z.strictObject({ code: z.literal("uslci"), name: z.literal("USLCI") }),
  z.strictObject({ code: z.literal("worldsteel"), name: z.literal("World steel") }),
]);
export const publicDatasetEnvelopeSchema = z
  .strictObject({
    schemaVersion: z.literal("portal.public-dataset.v2"),
    key: publicDatasetKeySchema,
    brand: publicBrandSchema.nullable(),
    accessLevel: portalAccessLevelSchema,
    capabilities: publicCapabilitiesSchema,
    metadata: z.discriminatedUnion("kind", [publicProcessMetadataSchema, publicFlowMetadataSchema]),
    provenance: publicProvenanceSchema,
    publication: publicPublicationSchema.nullable(),
    modifiedAt: portalDateTimeSchema,
  })
  .refine((value) => value.key.kind === value.metadata.kind, {
    message: "Dataset key and metadata kinds must match",
    path: ["metadata", "kind"],
  });

export const publicExchangeRowSchema = z.strictObject({
  internalId: z.string().regex(/^(0|[1-9]\d{0,5})$/),
  kind: z.enum(["technosphere", "elementary", "waste"]),
  direction: z.enum(["input", "output"]),
  flow: exactNamedDatasetIdentitySchema,
  classification: classificationSchema.nullable(),
  amount: portalRealSchema,
  unit: portalNonEmptyStringSchema,
  isQuantitativeReference: z.boolean(),
  uncertainty: z
    .strictObject({
      type: portalNonEmptyStringSchema,
      minimum: portalRealSchema.nullable(),
      maximum: portalRealSchema.nullable(),
    })
    .nullable(),
  origin: z.array(fieldOriginSchema),
});
export const publicExchangePageSchema = z.strictObject({
  schemaVersion: z.literal("portal.public-exchange-page.v1"),
  process: exactDatasetIdentitySchema,
  processContext: z.strictObject({
    functionalUnit: functionalUnitSchema,
    capabilityPolicyVersion: portalNonEmptyStringSchema,
  }),
  rows: z.array(publicExchangeRowSchema).max(50),
  nextCursor: portalNullableCursorSchema,
});

export const searchMatchSchema = z.strictObject({
  kind: z.enum(["identifier", "lexical"]),
  score: z.number().min(0).max(1),
  reasonCodes: z
    .array(z.enum(["exact_id", "name", "classification", "cas", "full_text"]))
    .refine((values) => new Set(values).size === values.length, "reasonCodes must be unique"),
});
export const publicSearchItemSchema = z.strictObject({
  key: publicDatasetKeySchema,
  brand: publicBrandSchema.nullable(),
  accessLevel: portalAccessLevelSchema,
  capabilities: publicCapabilitiesSchema,
  names: localizedTextSchema,
  summary: localizedTextSchema,
  geography: geographySchema,
  referenceYear: portalNullableYearSchema,
  context: publicCardContextSchema,
  modifiedAt: portalDateTimeSchema,
  match: searchMatchSchema,
});
const publicSearchPageRuntimeSchema = z.strictObject({
  schemaVersion: z.literal("portal.public-search-page.v3"),
  kind: portalDatasetKindSchema,
  queryFingerprint: portalSha256Schema,
  items: z.array(publicSearchItemSchema).max(50),
  nextCursor: portalNullableCursorSchema,
});
export const publicSearchPageSchema: z.ZodType<DatabasePublicSearchPage> =
  publicSearchPageRuntimeSchema;

const catalogSummaryLabelItemSchema = z.strictObject({
  language: z.string().min(2).max(35).regex(languagePattern),
  value: z.string().min(1).max(160),
});
const catalogSummaryLabelSchema = z
  .tuple([catalogSummaryLabelItemSchema])
  .rest(catalogSummaryLabelItemSchema)
  .refine((items) => items.length <= 2, "example label must contain at most two items");
const catalogSummaryExampleSchema = z.discriminatedUnion("queryKind", [
  z.strictObject({
    queryKind: z.literal("uuid"),
    datasetKind: portalDatasetKindSchema,
    query: portalUuidSchema,
    label: catalogSummaryLabelSchema,
  }),
  z.strictObject({
    queryKind: z.literal("cas"),
    datasetKind: z.literal("flow"),
    query: z
      .string()
      .max(12)
      .regex(/^[0-9]{2,7}-[0-9]{2}-[0-9]$/),
    label: catalogSummaryLabelSchema,
  }),
  z.strictObject({
    queryKind: z.literal("classification"),
    datasetKind: portalDatasetKindSchema,
    query: z
      .string()
      .min(1)
      .max(128)
      .refine(excludesC0C1Controls, "classification example contains a control character"),
    label: catalogSummaryLabelSchema,
  }),
]);
const publicCatalogSummaryRuntimeSchema = z.strictObject({
  schemaVersion: z.literal("portal.public-catalog-summary.v1"),
  counts: z
    .strictObject({
      process: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
      flow: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
      total: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    })
    .refine((counts) => counts.process + counts.flow === counts.total, {
      message: "catalog count total must equal process plus flow",
      path: ["total"],
    }),
  latestModifiedAt: portalDateTimeSchema.nullable(),
  examples: z
    .array(catalogSummaryExampleSchema)
    .max(3)
    .refine(
      (examples) => new Set(examples.map((example) => example.queryKind)).size === examples.length,
      "catalog example kinds must be unique",
    )
    .refine(
      (examples) =>
        new Set(examples.map((example) => JSON.stringify(example))).size === examples.length,
      "catalog examples must be unique",
    ),
});
export const publicCatalogSummarySchema: z.ZodType<PublicCatalogSummary> =
  publicCatalogSummaryRuntimeSchema;

export const publicFacetsSchema = z.strictObject({
  schemaVersion: z.literal("portal.public-facets.v3"),
  kind: z.enum(["all", "process", "flow"]),
  queryFingerprint: portalSha256Schema,
  groups: z.array(
    z.strictObject({
      id: portalNonEmptyStringSchema,
      label: localizedTextSchema,
      values: z
        .array(
          z.strictObject({
            value: portalNonEmptyStringSchema.max(128),
            label: localizedTextSchema,
            count: z.number().int().min(0),
          }),
        )
        .max(100),
      hasMore: z.boolean(),
    }),
  ),
});

export const publicVersionPageSchema = z.strictObject({
  schemaVersion: z.literal("portal.public-version-page.v2"),
  dataset: z.strictObject({
    kind: portalDatasetKindSchema,
    id: portalUuidSchema,
  }),
  items: z
    .array(
      z.strictObject({
        key: publicDatasetKeySchema,
        brand: publicBrandSchema.nullable(),
        accessLevel: portalAccessLevelSchema,
        capabilities: publicCapabilitiesSchema,
        modifiedAt: portalDateTimeSchema,
        isLatest: z.boolean(),
      }),
    )
    .max(50),
  nextCursor: portalNullableCursorSchema,
});

export const publicSitemapItemSchema = z.strictObject({
  key: publicDatasetKeySchema,
  modifiedAt: portalDateTimeSchema,
});

export const publicSitemapPageSchema = z.strictObject({
  schemaVersion: z.literal("portal.public-sitemap-page.v1"),
  items: z.array(publicSitemapItemSchema).max(1000),
  nextCursor: portalNullableCursorSchema,
});

export const publicSitemapShardDescriptorSchema = z.strictObject({
  shardCursor: portalSitemapShardCursorSchema,
  maxItems: z.literal(4096),
});

export const publicSitemapManifestSchema = z.strictObject({
  schemaVersion: z.literal("portal.public-sitemap-manifest.v1"),
  shards: z
    .array(publicSitemapShardDescriptorSchema)
    .length(64)
    .refine(
      (shards) => new Set(shards.map((shard) => shard.shardCursor)).size === shards.length,
      "sitemap shard cursors must be unique",
    ),
});

export const publicSitemapShardSchema = z.strictObject({
  schemaVersion: z.literal("portal.public-sitemap-shard.v1"),
  shardCursor: portalSitemapShardCursorSchema,
  items: z
    .array(publicSitemapItemSchema)
    .max(4096)
    .refine(
      (items) =>
        new Set(items.map((item) => `${item.key.kind}:${item.key.id}`)).size === items.length,
      "sitemap shard identities must be unique",
    ),
});

export const publishedLciaPageSchema = z.strictObject({
  schemaVersion: z.literal("portal.published-lcia-page.v1"),
  mode: z.enum(["process_all_impacts", "processes_one_impact", "ranked_processes_one_impact"]),
  publication: z.strictObject({
    publicationId: portalUuidSchema,
    packageId: portalUuidSchema,
    packageVersion: portalNonEmptyStringSchema,
    publishedAt: portalDateTimeSchema,
    evidenceHash: portalSha256Schema,
  }),
  rows: z
    .array(
      z.strictObject({
        process: exactDatasetIdentitySchema,
        functionalUnit: completeFunctionalUnitSchema,
        geography: z.strictObject({
          code: portalNonEmptyStringSchema,
          precision: portalGeographyPrecisionSchema,
        }),
        referenceYear: portalYearSchema,
        method: exactDatasetIdentitySchema,
        impact: z.strictObject({
          id: portalNonEmptyStringSchema,
          name: localizedTextSchema,
        }),
        value: portalRealSchema,
        unit: portalNonEmptyStringSchema,
        evidenceStatus: z.literal("verified"),
      }),
    )
    .max(50),
  nextCursor: portalNullableCursorSchema,
});

export const portalContractSchemas = {
  common: {
    uuid: portalUuidSchema,
    version: portalVersionSchema,
    real: portalRealSchema,
    sha256: portalSha256Schema,
    publicHttpsUri: portalPublicHttpsUriSchema,
    localizedText: localizedTextSchema,
    publicDatasetKey: publicDatasetKeySchema,
    exactDatasetIdentity: exactDatasetIdentitySchema,
    exactNamedDatasetIdentity: exactNamedDatasetIdentitySchema,
    classification: classificationSchema,
    geography: geographySchema,
    functionalUnit: functionalUnitSchema,
    completeFunctionalUnit: completeFunctionalUnitSchema,
    capabilities: publicCapabilitiesSchema,
    fieldOrigin: fieldOriginSchema,
    source: publicSourceSchema,
    cardReference: publicCardReferenceSchema,
    cardQuality: publicCardQualitySchema,
    cardContext: publicCardContextSchema,
    namedReference: publicNamedReferenceSchema,
    compliance: publicComplianceDeclarationSchema,
    administration: publicAdministrationSchema,
  },
  dataset: publicDatasetEnvelopeSchema,
  exchanges: publicExchangePageSchema,
  facets: publicFacetsSchema,
  search: publicSearchPageSchema,
  catalogSummary: publicCatalogSummarySchema,
  sitemap: publicSitemapPageSchema,
  sitemapManifest: publicSitemapManifestSchema,
  sitemapShard: publicSitemapShardSchema,
  versions: publicVersionPageSchema,
  lcia: publishedLciaPageSchema,
} as const;

export type PortalDatasetKind = z.infer<typeof portalDatasetKindSchema>;
export type PublicDatasetKey = z.infer<typeof publicDatasetKeySchema>;
export type LocalizedText = z.infer<typeof localizedTextSchema>;
export type PublicCapabilities = z.infer<typeof publicCapabilitiesSchema>;
export type FieldOrigin = z.infer<typeof fieldOriginSchema>;
export type PublicDatasetEnvelope = z.infer<typeof publicDatasetEnvelopeSchema>;
export type PublicExchangePage = z.infer<typeof publicExchangePageSchema>;
export type PublicSearchPage = z.infer<typeof publicSearchPageSchema>;
export type PublicFacets = z.infer<typeof publicFacetsSchema>;
export type PublicVersionPage = z.infer<typeof publicVersionPageSchema>;
export type PublicSitemapPage = z.infer<typeof publicSitemapPageSchema>;
export type PublicSitemapManifest = z.infer<typeof publicSitemapManifestSchema>;
export type PublicSitemapShard = z.infer<typeof publicSitemapShardSchema>;
export type PublishedLciaPage = z.infer<typeof publishedLciaPageSchema>;

export const publicFlowLinkEligibilitySchema = z
  .array(exactDatasetIdentitySchema.extend({ linkable: z.boolean() }))
  .max(50);
