export type CompatibilityStatus =
  "direct" | "converted" | "reference_only" | "incompatible" | "insufficient";

export type CompareCandidate = {
  brand?: string | null;
  ref: string;
  name: string;
  functionalUnit?: string;
  referenceProduct?: string;
  referenceUnit?: string;
  allocationMethod?: string;
  modelingApproach?: string;
  geography?: string;
  geographyPrecision?: string;
  referenceYear?: string;
  technology?: string;
  cutoffRule?: string;
  lciaMethodRef?: string;
  publicationRef?: string;
  conversion?: { contractRef: string; dimension: string };
  lciaValue?: { value: string; unit: string };
};

export const compatibilityDimensions = [
  "referenceProduct",
  "functionalUnit",
  "referenceUnit",
  "allocationMethod",
  "modelingApproach",
  "geography",
  "geographyPrecision",
  "referenceYear",
  "technology",
  "cutoffRule",
  "lciaMethodRef",
  "publicationRef",
] as const;

export type CompatibilityDimension = (typeof compatibilityDimensions)[number];

export type CompatibilityRow = {
  dimension: CompatibilityDimension;
  status: CompatibilityStatus;
  values: Array<string | undefined>;
};

const severity: Record<CompatibilityStatus, number> = {
  direct: 0,
  converted: 1,
  reference_only: 2,
  insufficient: 3,
  incompatible: 4,
};

function evaluateDimension(
  candidates: CompareCandidate[],
  dimension: CompatibilityDimension,
): CompatibilityStatus {
  const values = candidates.map((candidate) => candidate[dimension]);
  if (values.some((value) => !value)) return "insufficient";
  if (new Set(values).size === 1) return "direct";

  if (dimension === "functionalUnit" || dimension === "referenceUnit") {
    const conversions = candidates.map((candidate) => candidate.conversion);
    if (
      conversions.every(Boolean) &&
      new Set(conversions.map((conversion) => conversion?.contractRef)).size === 1 &&
      new Set(conversions.map((conversion) => conversion?.dimension)).size === 1
    ) {
      return "converted";
    }
    return "incompatible";
  }

  if (dimension === "lciaMethodRef" || dimension === "referenceProduct") return "incompatible";
  return "reference_only";
}

export function evaluateCompatibility(candidates: CompareCandidate[]): {
  status: CompatibilityStatus;
  rows: CompatibilityRow[];
  canAlignLcia: boolean;
} {
  if (candidates.length < 2 || candidates.length > 4) {
    return { status: "insufficient", rows: [], canAlignLcia: false };
  }

  const rows = compatibilityDimensions.map((dimension) => ({
    dimension,
    status: evaluateDimension(candidates, dimension),
    values: candidates.map((candidate) => candidate[dimension]),
  }));
  const status = rows.reduce<CompatibilityStatus>(
    (current, row) => (severity[row.status] > severity[current] ? row.status : current),
    "direct",
  );
  const values = candidates.map((candidate) => candidate.lciaValue);
  const canAlignLcia =
    (status === "direct" || status === "converted") &&
    values.every(Boolean) &&
    new Set(values.map((value) => value?.unit)).size === 1;

  return { canAlignLcia, rows, status };
}
