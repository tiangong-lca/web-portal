import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import catalogFixture from "../fixtures/portal/catalog-v1.json";
import {
  DatasetJsonLd,
  datasetJsonLdEligibility,
  maximumDatasetDescriptionLength,
  minimumDatasetDescriptionLength,
} from "@/features/catalog/dataset-json-ld";
import { localizedMetadata } from "@/lib/seo";
import type { LocalizedText, PublicDatasetEnvelope } from "@/server/contracts/portal";

const processDataset = catalogFixture.datasetProcess as unknown as PublicDatasetEnvelope;
const flowDataset = catalogFixture.datasetFlow as unknown as PublicDatasetEnvelope;

/** Longer than the documented minimum, so a comment variant can be eligible. */
const eligibleComment =
  "Electricity, medium voltage, delivered to the local grid from a public generation mix.";
const overLongComment = "public method description ".repeat(250).trim();

/** A valid astral character is a surrogate pair; a lone surrogate is a broken cut. */
const hasLoneSurrogate = (value: string): boolean =>
  /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF]))|(?:(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/u.test(value);

function variant({
  comment,
  names,
}: {
  comment?: LocalizedText;
  names?: LocalizedText;
}): PublicDatasetEnvelope {
  return {
    ...processDataset,
    metadata: {
      ...processDataset.metadata,
      generalComment: comment ?? processDataset.metadata.generalComment,
      names: names ?? processDataset.metadata.names,
    },
  } as PublicDatasetEnvelope;
}

function render(
  dataset: PublicDatasetEnvelope,
  locale: "zh-CN" | "en" | "de" | "fr" = "en",
): string {
  return renderToStaticMarkup(
    <DatasetJsonLd
      canonicalUrl="https://portal.example/en/process/1111@01.00.000"
      dataset={dataset}
      locale={locale}
    />,
  );
}

function structuredData(dataset: PublicDatasetEnvelope): Record<string, unknown> {
  const match = /<script type="application\/ld\+json">([\s\S]*)<\/script>/u.exec(render(dataset));
  if (!match?.[1]) throw new Error("DatasetJsonLd did not render a JSON-LD script");
  return JSON.parse(match[1]) as Record<string, unknown>;
}

describe("Dataset eligibility", () => {
  it("accepts a real public comment of usable length", () => {
    const dataset = variant({ comment: [{ language: "en", value: eligibleComment }] });
    const eligibility = datasetJsonLdEligibility(dataset, "en");

    expect(eligibility.eligible).toBe(true);
    expect(eligibility).toMatchObject({ reason: "eligible", description: eligibleComment });
    expect(structuredData(dataset)).toMatchObject({
      description: eligibleComment,
      name: "Electricity, medium voltage",
    });
  });

  it("reports a missing description instead of emitting an invalid Dataset", () => {
    expect(datasetJsonLdEligibility(flowDataset, "en")).toEqual({
      eligible: false,
      reason: "missing-description",
    });
    expect(render(flowDataset)).toBe("");
  });

  it("accepts the fixture's own public comment as a usable description", () => {
    const eligibility = datasetJsonLdEligibility(processDataset, "en");

    if (!eligibility.eligible) throw new Error("expected eligible");
    expect(Array.from(eligibility.description).length).toBeGreaterThanOrEqual(
      minimumDatasetDescriptionLength,
    );
    expect(structuredData(processDataset)).toMatchObject({
      "@type": "Dataset",
      description: eligibility.description,
    });
  });

  it("reports a too-short description instead of padding it", () => {
    const dataset = variant({ comment: [{ language: "en", value: "Too short to qualify" }] });

    expect(datasetJsonLdEligibility(dataset, "en")).toEqual({
      eligible: false,
      reason: "short-description",
    });
    expect(render(dataset)).toBe("");
  });

  it("reports a missing real name instead of falling back to the identifier", () => {
    const dataset = variant({ comment: [{ language: "en", value: eligibleComment }], names: [] });

    expect(datasetJsonLdEligibility(dataset, "en")).toEqual({
      eligible: false,
      reason: "missing-name",
    });
    expect(render(dataset)).toBe("");
  });

  it("treats blank and undisplayable comments as missing, not as text", () => {
    for (const value of ["   ", "\n\t\n", ""])
      expect(
        datasetJsonLdEligibility(variant({ comment: [{ language: "en", value }] }), "en"),
      ).toEqual({
        eligible: false,
        reason: "missing-description",
      });
  });

  it("keeps the fallback-language marker in the eligible description", () => {
    expect(
      datasetJsonLdEligibility(
        variant({ comment: [{ language: "en", value: eligibleComment }] }),
        "de",
      ),
    ).toEqual({
      eligible: true,
      reason: "eligible",
      description: `${eligibleComment} [en]`,
    });

    const fromFixture = datasetJsonLdEligibility(processDataset, "de");
    if (!fromFixture.eligible) throw new Error("expected eligible");
    expect(fromFixture.description.endsWith("[en]")).toBe(true);
  });
});

describe("description bounds in Unicode characters", () => {
  it("counts astral characters once and keeps them whole", () => {
    const emoji = "🌍".repeat(minimumDatasetDescriptionLength);
    const eligibility = datasetJsonLdEligibility(
      variant({ comment: [{ language: "en", value: emoji }] }),
      "en",
    );

    expect(eligibility).toMatchObject({ eligible: true, reason: "eligible" });
    if (!eligibility.eligible) throw new Error("expected eligible");
    expect(Array.from(eligibility.description)).toHaveLength(minimumDatasetDescriptionLength);
    expect(hasLoneSurrogate(eligibility.description)).toBe(false);
  });

  it("truncates over-long text without splitting surrogate pairs", () => {
    const emoji = "🌍".repeat(maximumDatasetDescriptionLength + 500);
    const eligibility = datasetJsonLdEligibility(
      variant({ comment: [{ language: "en", value: emoji }] }),
      "en",
    );

    if (!eligibility.eligible) throw new Error("expected eligible");
    expect(Array.from(eligibility.description)).toHaveLength(maximumDatasetDescriptionLength);
    expect(hasLoneSurrogate(eligibility.description)).toBe(false);
  });

  it("does not collapse a long comment to fewer than the minimum over early whitespace", () => {
    const earlyWhitespace = `ab ${"x".repeat(maximumDatasetDescriptionLength + 1000)}`;
    const eligibility = datasetJsonLdEligibility(
      variant({ comment: [{ language: "en", value: earlyWhitespace }] }),
      "en",
    );

    if (!eligibility.eligible) throw new Error("expected eligible");
    expect(Array.from(eligibility.description)).toHaveLength(maximumDatasetDescriptionLength);
    expect(earlyWhitespace.startsWith(eligibility.description)).toBe(true);
  });

  it("clips a long comment to the maximum and never adds characters", () => {
    const eligibility = datasetJsonLdEligibility(
      variant({ comment: [{ language: "en", value: overLongComment }] }),
      "en",
    );

    if (!eligibility.eligible) throw new Error("expected eligible");
    const length = Array.from(eligibility.description).length;
    expect(length).toBeLessThanOrEqual(maximumDatasetDescriptionLength);
    expect(length).toBeGreaterThanOrEqual(minimumDatasetDescriptionLength);
    expect(overLongComment.startsWith(eligibility.description)).toBe(true);
    expect(eligibility.description.endsWith(" ")).toBe(false);
  });

  it("collapses layout whitespace from a multi-line comment", () => {
    const multiline = `  first line\n\nsecond   line\t${"padding words ".repeat(6)}`;
    const eligibility = datasetJsonLdEligibility(
      variant({ comment: [{ language: "en", value: multiline }] }),
      "en",
    );

    if (!eligibility.eligible) throw new Error("expected eligible");
    expect(eligibility.description.startsWith("first line second line padding words")).toBe(true);
    expect(eligibility.description).not.toMatch(/\n|\t| {2}/u);
  });
});

describe("page metadata stays independent of Dataset eligibility", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps canonical, robots and description on a page whose Dataset is omitted", () => {
    vi.stubEnv("PORTAL_PUBLIC_INDEXING", "disabled");

    const page = localizedMetadata({
      description: "page description fallback",
      locale: "en",
      path: "process/1111@01.00.000",
      title: "Electricity, medium voltage",
    });

    expect(render(flowDataset)).toBe("");
    expect(page.robots).toEqual({ follow: true, index: false });
    expect(page.alternates?.canonical).toBe("/en/process/1111@01.00.000");
    expect(page.description).toBe("page description fallback");
  });

  it("never lets source text close the script element", () => {
    const hostile = variant({
      comment: [{ language: "en", value: `${eligibleComment} </script><script>alert(1)</script>` }],
    });

    expect(render(hostile)).not.toContain("</script><script>alert(1)");
    expect(structuredData(hostile).description).toContain("</script><script>alert(1)</script>");
  });
});
