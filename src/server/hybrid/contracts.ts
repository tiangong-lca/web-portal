import "server-only";

import { z } from "zod";
import { portalHybridCursorSchema } from "@/lib/hybrid-request";

import {
  localizedTextSchema,
  portalAccessLevelSchema,
  portalDateTimeSchema,
  portalDatasetKindSchema,
  portalNullableYearSchema,
  portalNullableCursorSchema,
  portalSha256Schema,
  publicCapabilitiesSchema,
  publicCardContextSchema,
  publicDatasetKeySchema,
  publicBrandSchema,
  publicSearchItemSchema,
  geographySchema,
} from "@/server/contracts/portal";

const nonNegativeCanonicalDecimalPattern =
  /^(?=(?:[^0-9]*[0-9]){1,38}[^0-9]*$)(?:0|(?:[1-9]\d*(?:\.\d*[1-9])?|0\.\d*[1-9]))$/u;

const hybridReasonCodeSchema = z.enum(["lexical_public_projection", "semantic_public_projection"]);

const hybridEvidenceSchema = z
  .strictObject({
    lexicalRank: z.number().int().min(1).nullable(),
    semanticRank: z.number().int().min(1).nullable(),
    semanticDistance: z.string().regex(nonNegativeCanonicalDecimalPattern).nullable(),
  })
  .refine(
    (value) => (value.semanticRank === null) === (value.semanticDistance === null),
    "semantic rank and distance must be present together",
  );

function hybridMatchSchema(algorithmVersion: "portal-hybrid-rank-v1" | "portal-hybrid-rank-v2") {
  return z
    .strictObject({
      kind: z.literal("hybrid"),
      algorithmVersion: z.literal(algorithmVersion),
      score: z.number().min(0).max(1),
      reasonCodes: z
        .array(hybridReasonCodeSchema)
        .min(1)
        .max(2)
        .refine((values) => new Set(values).size === values.length, "reasonCodes must be unique"),
      evidence: hybridEvidenceSchema,
    })
    .superRefine((value, context) => {
      if (
        algorithmVersion === "portal-hybrid-rank-v2" &&
        ((value.evidence.lexicalRank ?? 0) > 200 || (value.evidence.semanticRank ?? 0) > 200)
      ) {
        context.addIssue({
          code: "custom",
          message: "each recall rank must be within 200",
          path: ["evidence"],
        });
      }
      const lexicalReason = value.reasonCodes.includes("lexical_public_projection");
      const semanticReason = value.reasonCodes.includes("semantic_public_projection");
      if (lexicalReason !== (value.evidence.lexicalRank !== null)) {
        context.addIssue({
          code: "custom",
          message: "lexical evidence and reason code must correspond",
          path: ["reasonCodes"],
        });
      }
      if (
        semanticReason !==
        (value.evidence.semanticRank !== null && value.evidence.semanticDistance !== null)
      ) {
        context.addIssue({
          code: "custom",
          message: "semantic evidence and reason code must correspond",
          path: ["reasonCodes"],
        });
      }
    });
}

export const portalPublicHybridMatchSchema = hybridMatchSchema("portal-hybrid-rank-v1");
export const portalPublicHybridMatchV2Schema = hybridMatchSchema("portal-hybrid-rank-v2");

export const portalPublicHybridCandidateSchema = z.strictObject({
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
  match: portalPublicHybridMatchSchema,
});

export const portalPublicHybridCandidateV2Schema = portalPublicHybridCandidateSchema.extend({
  match: portalPublicHybridMatchV2Schema,
});

export const portalHybridInterpretationSchema = z.strictObject({
  source: z.literal("model_generated"),
  advisory: z.literal(true),
  semanticQuery: z.string().min(1).max(512),
  terms: z
    .array(
      z.strictObject({
        language: z.enum(["en", "zh-CN"]),
        value: z.string().min(1).max(512),
      }),
    )
    .min(1)
    .max(12)
    .refine(
      (values) =>
        new Set(values.map((value) => `${value.language}\u0000${value.value}`)).size ===
        values.length,
      "interpretation terms must be unique",
    ),
});

export const portalHybridSearchPageV1Schema = z
  .strictObject({
    schemaVersion: z.literal("portal.hybrid-search-page.v1"),
    kind: portalDatasetKindSchema,
    queryFingerprint: portalSha256Schema,
    interpretation: portalHybridInterpretationSchema,
    items: z.array(portalPublicHybridCandidateSchema).max(20),
  })
  .superRefine((value, context) => {
    const candidateKeys = value.items.map(
      (item) => `${item.key.kind}:${item.key.id}@${item.key.version}`,
    );
    if (new Set(candidateKeys).size !== candidateKeys.length) {
      context.addIssue({
        code: "custom",
        message: "candidate identities must be unique",
        path: ["items"],
      });
    }
    value.items.forEach((item, index) => {
      if (item.key.kind !== value.kind) {
        context.addIssue({
          code: "custom",
          message: "candidate kind must match page kind",
          path: ["items", index, "key", "kind"],
        });
      }
    });
  });

const versionPageBaseSchema = z.strictObject({
  kind: portalDatasetKindSchema,
  queryFingerprint: portalSha256Schema,
  items: z.array(portalPublicHybridCandidateV2Schema).max(20),
  candidateCount: z.number().int().min(0).max(400),
  datasetCount: z.number().int().min(0).max(400),
  versionGroups: z
    .array(
      z.strictObject({
        key: publicDatasetKeySchema,
        matches: z
          .array(
            z.strictObject({
              key: publicDatasetKeySchema,
              brand: publicBrandSchema.nullable(),
              match: portalPublicHybridMatchV2Schema,
            }),
          )
          .min(1)
          .max(400),
      }),
    )
    .max(20),
  nextCursor: portalHybridCursorSchema.nullable(),
});

function validateVersionPage(
  value: z.infer<typeof versionPageBaseSchema>,
  context: z.RefinementCtx,
) {
  const issue = (message: string) =>
    context.addIssue({ code: "custom", message, path: ["versionGroups"] });
  if (
    value.items.length !== value.versionGroups.length ||
    value.items.length > value.datasetCount ||
    value.datasetCount > value.candidateCount ||
    (value.datasetCount === 0) !== (value.candidateCount === 0) ||
    (value.candidateCount === 0 && value.nextCursor !== null)
  ) {
    issue("version group counts must match the bounded candidate page");
  }
  const datasetIds = new Set<string>();
  let memberCount = 0;
  value.versionGroups.forEach((group, index) => {
    const item = value.items[index];
    const first = group.matches[0];
    if (
      !item ||
      !first ||
      group.key.kind !== value.kind ||
      group.key.id !== item.key.id ||
      group.key.version !== item.key.version ||
      item.key.kind !== value.kind ||
      first.key.version !== group.key.version ||
      JSON.stringify(first.match) !== JSON.stringify(item.match) ||
      datasetIds.has(group.key.id)
    ) {
      issue("each representative must be the best exact-version match of one unique dataset");
    }
    datasetIds.add(group.key.id);
    const previousItem = value.items[index - 1];
    if (
      item &&
      previousItem &&
      (item.match.score > previousItem.match.score ||
        (item.match.score === previousItem.match.score &&
          (item.key.id < previousItem.key.id ||
            (item.key.id === previousItem.key.id && item.key.version > previousItem.key.version))))
    ) {
      issue(
        "representatives must be ordered by score descending, id ascending, version descending",
      );
    }
    const versions = new Set<string>();
    group.matches.forEach((member, memberIndex) => {
      if (
        member.key.kind !== group.key.kind ||
        member.key.id !== group.key.id ||
        versions.has(member.key.version)
      ) {
        issue("members must be unique exact versions of their dataset");
      }
      versions.add(member.key.version);
      const previous = group.matches[memberIndex - 1];
      if (
        previous &&
        (previous.match.score < member.match.score ||
          (previous.match.score === member.match.score &&
            previous.key.version < member.key.version))
      ) {
        issue("versions must be ordered by their own score, then descending version");
      }
    });
    memberCount += group.matches.length;
  });
  if (
    memberCount > value.candidateCount ||
    (value.datasetCount === value.items.length && memberCount !== value.candidateCount)
  ) {
    issue("visible version groups must cover their bounded candidate pool");
  }
}

export const portalHybridSearchPageV2Schema = versionPageBaseSchema
  .extend({
    schemaVersion: z.literal("portal.hybrid-search-page.v3"),
    interpretation: portalHybridInterpretationSchema,
  })
  .superRefine(validateVersionPage);

export const portalHybridSearchPageSchema = z.union([
  portalHybridSearchPageV1Schema,
  portalHybridSearchPageV2Schema,
]);

export const portalHybridFallbackReasonSchema = z.enum([
  "method_not_allowed",
  "request_too_large",
  "portal_auth_unavailable",
  "portal_auth_failed",
  "hybrid_disabled",
  "guard_unavailable",
  "replay_rejected",
  "budget_exhausted",
  "concurrency_exhausted",
  "circuit_open",
  "invalid_request",
  "hybrid_timeout",
  "hybrid_upstream_unavailable",
  "contract_failure",
  "internal_error",
]);

export const portalHybridErrorPayloadSchema = z.strictObject({
  code: portalHybridFallbackReasonSchema,
  message: z.string().min(1).max(256),
});

const hybridBffSuccessSchema = z.strictObject({
  schemaVersion: z.literal("portal.hybrid-bff.v1"),
  mode: z.literal("hybrid"),
  kind: portalDatasetKindSchema,
  queryFingerprint: portalSha256Schema,
  fallbackReason: z.null(),
  interpretation: portalHybridInterpretationSchema,
  items: z
    .array(z.union([portalPublicHybridCandidateSchema, portalPublicHybridCandidateV2Schema]))
    .max(20),
});

const hybridBffFallbackSchema = z.strictObject({
  schemaVersion: z.literal("portal.hybrid-bff.v1"),
  mode: z.literal("lexical_fallback"),
  kind: portalDatasetKindSchema,
  queryFingerprint: portalSha256Schema,
  fallbackReason: portalHybridFallbackReasonSchema,
  interpretation: z.null(),
  items: z.array(publicSearchItemSchema).max(20),
});

const portalHybridBffResponseV1Schema = z
  .discriminatedUnion("mode", [hybridBffSuccessSchema, hybridBffFallbackSchema])
  .superRefine((value, context) => {
    value.items.forEach((item, index) => {
      if (item.key.kind !== value.kind) {
        context.addIssue({
          code: "custom",
          message: "item kind must match response kind",
          path: ["items", index, "key", "kind"],
        });
      }
    });
  });

const versionBffSuccessSchema = versionPageBaseSchema
  .extend({
    schemaVersion: z.literal("portal.hybrid-bff.v2"),
    mode: z.literal("hybrid"),
    fallbackReason: z.null(),
    interpretation: portalHybridInterpretationSchema,
  })
  .superRefine(validateVersionPage);

const lexicalBffFields = {
  schemaVersion: z.literal("portal.hybrid-bff.v2"),
  kind: portalDatasetKindSchema,
  queryFingerprint: portalSha256Schema,
  interpretation: z.null(),
  items: z.array(publicSearchItemSchema).max(20),
  nextCursor: portalNullableCursorSchema,
};

export const portalHybridBffResponseV2Schema = z
  .discriminatedUnion("mode", [
    versionBffSuccessSchema,
    z.strictObject({ ...lexicalBffFields, mode: z.literal("lexical"), fallbackReason: z.null() }),
    z.strictObject({
      ...lexicalBffFields,
      mode: z.literal("lexical_fallback"),
      fallbackReason: portalHybridFallbackReasonSchema,
    }),
  ])
  .superRefine((value, context) => {
    const keys = value.items.map((item) => `${item.key.kind}:${item.key.id}@${item.key.version}`);
    if (
      new Set(keys).size !== keys.length ||
      value.items.some((item) => item.key.kind !== value.kind)
    ) {
      context.addIssue({
        code: "custom",
        message: "items must have unique exact keys of the response kind",
        path: ["items"],
      });
    }
  });

export const portalHybridBffResponseSchema = z.union([
  portalHybridBffResponseV1Schema,
  portalHybridBffResponseV2Schema,
]);

export type PortalHybridCandidate =
  | z.infer<typeof portalPublicHybridCandidateSchema>
  | z.infer<typeof portalPublicHybridCandidateV2Schema>;
export type PortalHybridSearchPage = z.infer<typeof portalHybridSearchPageSchema>;
export type PortalHybridFallbackReason = z.infer<typeof portalHybridFallbackReasonSchema>;
export type PortalHybridBffResponse = z.infer<typeof portalHybridBffResponseSchema>;
export type PortalHybridBffVersionResponse = z.infer<typeof portalHybridBffResponseV2Schema>;
