import { z } from "zod";

const utf8Encoder = new TextEncoder();
// oxlint-disable-next-line no-control-regex -- Edge's wire contract explicitly rejects C0/C1 controls.
const controlCharacterPattern = /[\u0000-\u001f\u007f-\u009f]/u;

function boundedText(options: {
  maximumCodePoints: number;
  maximumBytes: number;
  normalize?: (value: string) => string;
}) {
  return z
    .string()
    .transform((value) => options.normalize?.(value) ?? value.trim())
    .refine((value) => value.length > 0, "value must not be blank")
    .refine(
      (value) => Array.from(value).length <= options.maximumCodePoints,
      "value exceeds code point limit",
    )
    .refine(
      (value) => utf8Encoder.encode(value).byteLength <= options.maximumBytes,
      "value exceeds UTF-8 byte limit",
    )
    .refine((value) => !controlCharacterPattern.test(value), "value contains control characters");
}

export const portalHybridQuerySchema = boundedText({
  maximumCodePoints: 512,
  maximumBytes: 2048,
});

const filterTextSchema = boundedText({
  maximumCodePoints: 128,
  maximumBytes: 1024,
  normalize: (value) => value.trim().toLowerCase(),
});

const yearSchema = z.number().int().min(0).max(9999);

export const portalHybridFiltersSchema = z
  .strictObject({
    brand: z.enum(["tiangong_lca", "bafu", "uslci", "worldsteel"]).optional(),
    accessLevel: z.enum(["open", "metadata_only"]).optional(),
    geography: filterTextSchema.optional(),
    classification: filterTextSchema.optional(),
    referenceYearFrom: yearSchema.optional(),
    referenceYearTo: yearSchema.optional(),
    processSubtype: filterTextSchema.optional(),
    source: filterTextSchema.optional(),
  })
  .superRefine((value, context) => {
    if (
      value.referenceYearFrom !== undefined &&
      value.referenceYearTo !== undefined &&
      value.referenceYearFrom > value.referenceYearTo
    ) {
      context.addIssue({
        code: "custom",
        message: "referenceYearFrom must not exceed referenceYearTo",
        path: ["referenceYearFrom"],
      });
    }
    if (utf8Encoder.encode(JSON.stringify(value)).byteLength > 4096) {
      context.addIssue({
        code: "custom",
        message: "serialized filters exceed UTF-8 byte limit",
      });
    }
  });

const requestFields = {
  kind: z.enum(["process", "flow"]),
  query: portalHybridQuerySchema,
  filters: portalHybridFiltersSchema,
  limit: z.number().int().min(1).max(20),
};

export const portalHybridCursorSchema = z
  .string()
  .min(1)
  .max(4096)
  .regex(/^[A-Za-z0-9_-]+$/u);

export const portalHybridSearchRequestSchema = z
  .discriminatedUnion("schemaVersion", [
    z.strictObject({
      schemaVersion: z.literal("portal.hybrid-search-request.v1"),
      ...requestFields,
    }),
    z.strictObject({
      schemaVersion: z.literal("portal.hybrid-search-request.v2"),
      ...requestFields,
      cursor: portalHybridCursorSchema.nullable(),
    }),
  ])
  .superRefine((value, context) => {
    if (value.kind === "flow" && value.filters.processSubtype !== undefined) {
      context.addIssue({
        code: "custom",
        message: "processSubtype is not valid for Flow search",
        path: ["filters", "processSubtype"],
      });
    }
  });

export type PortalHybridFilters = z.infer<typeof portalHybridFiltersSchema>;
export type PortalHybridSearchRequest = z.infer<typeof portalHybridSearchRequestSchema>;
export type PortalHybridVersionSearchRequest = Extract<
  PortalHybridSearchRequest,
  { schemaVersion: "portal.hybrid-search-request.v2" }
>;
