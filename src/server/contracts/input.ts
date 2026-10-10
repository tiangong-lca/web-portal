import "server-only";

import { z } from "zod";

import {
  exactDatasetIdentitySchema,
  portalCursorSchema,
  portalDatasetKindSchema,
  portalUuidSchema,
  portalVersionSchema,
} from "@/server/contracts/portal";

const textEncoder = new TextEncoder();
export const publicSearchUrlDefaultLimit = 10;
const cursorInputSchema = portalCursorSchema.regex(/^[A-Za-z0-9_-]+$/);
const boundedFilterTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .transform((value) => value.toLowerCase());

const boundedQuerySchema = z
  .string()
  .trim()
  .refine((value) => Array.from(value).length <= 512, "Query exceeds 512 Unicode code points")
  .refine((value) => textEncoder.encode(value).byteLength <= 2048, "Query exceeds 2048 bytes")
  .refine(
    (value) =>
      !Array.from(value).some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159);
      }),
    "Query contains control characters",
  );

export const publicSearchFiltersSchema = z
  .strictObject({
    brand: z.enum(["tiangong_lca", "bafu", "uslci", "worldsteel"]).optional(),
    accessLevel: z.enum(["open", "metadata_only"]).optional(),
    geography: boundedFilterTextSchema.optional(),
    classification: boundedFilterTextSchema.optional(),
    referenceYearFrom: z.number().int().min(0).max(9999).optional(),
    referenceYearTo: z.number().int().min(0).max(9999).optional(),
    processSubtype: boundedFilterTextSchema.optional(),
    source: boundedFilterTextSchema.optional(),
  })
  .refine(
    (value) =>
      value.referenceYearFrom === undefined ||
      value.referenceYearTo === undefined ||
      value.referenceYearFrom <= value.referenceYearTo,
    { message: "referenceYearFrom must not exceed referenceYearTo" },
  )
  .refine(
    (value) => textEncoder.encode(JSON.stringify(value)).byteLength <= 4096,
    "Search filters exceed 4096 bytes",
  );

export const catalogSearchInputSchema = z
  .strictObject({
    kind: portalDatasetKindSchema,
    query: boundedQuerySchema,
    filters: publicSearchFiltersSchema.default({}),
    sort: z.enum(["relevance", "modified_desc", "name_asc"]).default("relevance"),
    cursor: cursorInputSchema.nullable().default(null),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .refine((value) => value.kind === "process" || value.filters.processSubtype === undefined, {
    message: "processSubtype is only valid for Process searches",
    path: ["filters", "processSubtype"],
  });

export const datasetReferenceInputSchema = z.strictObject({
  kind: portalDatasetKindSchema,
  id: portalUuidSchema,
  version: portalVersionSchema,
});

export const versionListInputSchema = z.strictObject({
  kind: portalDatasetKindSchema,
  id: portalUuidSchema,
  cursor: cursorInputSchema.nullable().default(null),
  limit: z.number().int().min(1).max(50).default(20),
});

export const exchangeListInputSchema = z.strictObject({
  processId: portalUuidSchema,
  processVersion: portalVersionSchema,
  exchangeKind: z.enum(["all", "technosphere", "elementary", "waste"]).default("all"),
  cursor: cursorInputSchema.nullable().default(null),
  limit: z.number().int().min(1).max(50).default(20),
});

export const facetInputSchema = z
  .strictObject({
    kind: z.enum(["all", "process", "flow"]),
    query: boundedQuerySchema,
    filters: publicSearchFiltersSchema.default({}),
  })
  .refine((value) => value.kind !== "flow" || value.filters.processSubtype === undefined, {
    message: "processSubtype is not valid for Flow facets",
    path: ["filters", "processSubtype"],
  });

export const sitemapInputSchema = z.strictObject({
  kind: z.enum(["all", "process", "flow"]).default("all"),
  cursor: cursorInputSchema.nullable().default(null),
  limit: z.number().int().min(1).max(1000).default(1000),
});

export const publishedLciaInputSchema = z
  .strictObject({
    mode: z.enum(["process_all_impacts", "processes_one_impact", "ranked_processes_one_impact"]),
    processRefs: z.array(exactDatasetIdentitySchema).min(1).max(50),
    impactCategoryId: z.string().trim().min(1).max(512).nullable().default(null),
    cursor: cursorInputSchema.nullable().default(null),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .superRefine((value, context) => {
    const uniqueReferences = new Set(value.processRefs.map((item) => `${item.id}@${item.version}`));

    if (uniqueReferences.size !== value.processRefs.length) {
      context.addIssue({
        code: "custom",
        message: "processRefs must be unique",
        path: ["processRefs"],
      });
    }

    if (value.mode === "process_all_impacts") {
      if (value.processRefs.length !== 1) {
        context.addIssue({
          code: "custom",
          message: "process_all_impacts requires exactly one Process",
          path: ["processRefs"],
        });
      }
      if (value.impactCategoryId !== null) {
        context.addIssue({
          code: "custom",
          message: "process_all_impacts does not accept an impact category",
          path: ["impactCategoryId"],
        });
      }
    } else if (value.impactCategoryId === null) {
      context.addIssue({
        code: "custom",
        message: "This mode requires an impact category",
        path: ["impactCategoryId"],
      });
    }
  });

export class PortalInputError extends Error {
  readonly code = "invalid_portal_input";

  constructor(message = "Invalid Portal input") {
    super(message);
    this.name = "PortalInputError";
  }
}

export type PortalSearchUrlInput = z.infer<typeof catalogSearchInputSchema>;
export type PublishedLciaInput = z.infer<typeof publishedLciaInputSchema>;

type SearchParameterRecord = Record<string, string | string[] | undefined>;

function firstParameter(
  parameters: URLSearchParams | SearchParameterRecord,
  name: string,
): string | undefined {
  if (parameters instanceof URLSearchParams) {
    return parameters.get(name) ?? undefined;
  }

  const value = parameters[name];
  return Array.isArray(value) ? value[0] : value;
}

function decodedInputSize(parameters: URLSearchParams | SearchParameterRecord): number {
  const entries =
    parameters instanceof URLSearchParams
      ? [...parameters.entries()]
      : Object.entries(parameters).flatMap(([key, value]) =>
          Array.isArray(value)
            ? value.map((item) => [key, item] as const)
            : [[key, value ?? ""] as const],
        );

  return textEncoder.encode(entries.map(([key, value]) => `${key}\u0000${value}`).join("\u0000"))
    .byteLength;
}

function safeEnum<T extends string>(
  value: string | undefined,
  values: readonly T[],
  fallback: T,
): T {
  return value !== undefined && values.includes(value as T) ? (value as T) : fallback;
}

function safeInteger(
  value: string | undefined,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (!value || !/^\d+$/.test(value)) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function optionalFilterText(value: string | undefined): string | undefined {
  const parsed = boundedFilterTextSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function parsePortalSearchUrl(
  parameters: URLSearchParams | SearchParameterRecord,
): PortalSearchUrlInput {
  if (decodedInputSize(parameters) > 8192) {
    throw new PortalInputError("Decoded query string exceeds 8 KB");
  }

  const queryResult = boundedQuerySchema.safeParse(firstParameter(parameters, "q") ?? "");
  if (!queryResult.success) {
    throw new PortalInputError(queryResult.error.issues[0]?.message);
  }

  const kind = safeEnum(firstParameter(parameters, "kind"), ["process", "flow"], "process");
  const cursorResult = cursorInputSchema.safeParse(firstParameter(parameters, "cursor"));
  const yearFrom = safeInteger(firstParameter(parameters, "yearFrom"), 0, 9999, -1);
  const yearTo = safeInteger(firstParameter(parameters, "yearTo"), 0, 9999, -1);
  const access = safeEnum(firstParameter(parameters, "access"), ["open", "metadata_only", ""], "");
  const geography = optionalFilterText(firstParameter(parameters, "geo"));
  const classification = optionalFilterText(firstParameter(parameters, "classification"));
  const processSubtype = optionalFilterText(firstParameter(parameters, "subtype"));
  const brandValue = firstParameter(parameters, "brand");
  const parsedBrand = publicSearchFiltersSchema.shape.brand.safeParse(brandValue);
  if (!parsedBrand.success) throw new PortalInputError();
  const brand = parsedBrand.data;
  const source = optionalFilterText(firstParameter(parameters, "source"));
  const filters = {
    ...(brand ? { brand } : {}),
    ...(access ? { accessLevel: access } : {}),
    ...(geography ? { geography } : {}),
    ...(classification ? { classification } : {}),
    ...(yearFrom >= 0 && (yearTo < 0 || yearFrom <= yearTo) ? { referenceYearFrom: yearFrom } : {}),
    ...(yearTo >= 0 && (yearFrom < 0 || yearFrom <= yearTo) ? { referenceYearTo: yearTo } : {}),
    ...(kind === "process" && processSubtype ? { processSubtype } : {}),
    ...(source ? { source } : {}),
  };

  return catalogSearchInputSchema.parse({
    kind,
    query: queryResult.data,
    filters,
    sort: safeEnum(
      firstParameter(parameters, "sort"),
      ["relevance", "modified_desc", "name_asc"],
      "relevance",
    ),
    cursor: cursorResult.success ? cursorResult.data : null,
    limit: safeInteger(firstParameter(parameters, "limit"), 1, 50, publicSearchUrlDefaultLimit),
  });
}

export function parseExactDatasetReference(kind: unknown, reference: unknown) {
  if (typeof reference !== "string") {
    throw new PortalInputError();
  }

  const separatorIndex = reference.lastIndexOf("@");
  const result = datasetReferenceInputSchema.safeParse({
    kind,
    id: separatorIndex > 0 ? reference.slice(0, separatorIndex) : "",
    version: separatorIndex > 0 ? reference.slice(separatorIndex + 1) : "",
  });

  if (!result.success) {
    throw new PortalInputError();
  }

  return result.data;
}
