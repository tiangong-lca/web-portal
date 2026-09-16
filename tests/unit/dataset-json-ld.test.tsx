import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import catalogFixture from "../fixtures/portal/catalog-v1.json";
import {
  DatasetJsonLd,
  datasetJsonLdDescription,
  maximumDatasetDescriptionLength,
  minimumDatasetDescriptionLength,
} from "@/features/catalog/dataset-json-ld";
import { localizedText } from "@/features/catalog/map-public-data";
import type { PublicDatasetEnvelope } from "@/server/contracts/portal";

const processDataset = catalogFixture.datasetProcess as unknown as PublicDatasetEnvelope;
const flowDataset = catalogFixture.datasetFlow as unknown as PublicDatasetEnvelope;

function withComment(values: { language: string; value: string }[]): PublicDatasetEnvelope {
  return {
    ...processDataset,
    metadata: { ...processDataset.metadata, generalComment: values },
  } as PublicDatasetEnvelope;
}

function structuredData(
  dataset: PublicDatasetEnvelope,
  locale: "zh-CN" | "en" | "de" | "fr" = "en",
): Record<string, unknown> {
  const html = renderToStaticMarkup(
    <DatasetJsonLd
      canonicalUrl="https://portal.example/en/process/1111@01.00.000"
      dataset={dataset}
      locale={locale}
    />,
  );
  const match = /<script type="application\/ld\+json">([\s\S]*)<\/script>/u.exec(html);
  if (!match?.[1]) throw new Error("DatasetJsonLd did not render a JSON-LD script");
  return JSON.parse(match[1]) as Record<string, unknown>;
}

describe("dataset description source", () => {
  it("uses the same public comment the record page renders", () => {
    const description = datasetJsonLdDescription(processDataset, "en");

    expect(description).toBe("Public process fixture");
    expect(description).toBe(localizedText(processDataset.metadata.generalComment, "en"));
    expect(structuredData(processDataset).description).toBe(description);
  });

  it("marks a language fallback instead of pretending the text is translated", () => {
    const description = datasetJsonLdDescription(processDataset, "de");

    expect(description).toBe("Public process fixture [en]");
    expect(structuredData(processDataset, "de").description).toBe(description);
  });

  it("keeps a short real description as written rather than padding it", () => {
    const description = datasetJsonLdDescription(processDataset, "en") ?? "";

    expect(description.length).toBeLessThan(minimumDatasetDescriptionLength);
    expect(description).toBe("Public process fixture");
  });
});

describe("missing and unusable input", () => {
  it("omits the property when there is no public description", () => {
    expect(datasetJsonLdDescription(flowDataset, "en")).toBeUndefined();

    const data = structuredData(flowDataset);

    expect(data).not.toHaveProperty("description");
    expect(data.name).toBeDefined();
    expect(data.identifier).toBe("22222222-2222-2222-2222-222222222222@01.00.000");
  });

  it("omits the property for blank and undisplayable values without inventing text", () => {
    expect(
      datasetJsonLdDescription(withComment([{ language: "en", value: "   " }]), "en"),
    ).toBeUndefined();
    expect(
      datasetJsonLdDescription(withComment([{ language: "en", value: "\n\t\n" }]), "en"),
    ).toBeUndefined();
    expect(datasetJsonLdDescription(withComment([]), "en")).toBeUndefined();

    const data = structuredData(withComment([]));
    expect(data).not.toHaveProperty("description");
    // The identifier stays an identifier: it is never promoted into the description slot.
    expect(data.identifier).toBe("11111111-1111-1111-1111-111111111111@01.00.000");
  });
});

describe("normalization and bounds", () => {
  it("collapses layout whitespace from multi-line comments", () => {
    const description = datasetJsonLdDescription(
      withComment([{ language: "en", value: "  first line\n\nsecond   line\tthird  " }]),
      "en",
    );

    expect(description).toBe("first line second line third");
  });

  it("truncates an over-long comment at a word boundary without adding characters", () => {
    const sentence = "public method description ";
    const long = sentence.repeat(Math.ceil(6000 / sentence.length)).trim();
    expect(long.length).toBeGreaterThan(maximumDatasetDescriptionLength);

    const description =
      datasetJsonLdDescription(withComment([{ language: "en", value: long }]), "en") ?? "";

    expect(description.length).toBeLessThanOrEqual(maximumDatasetDescriptionLength);
    expect(long.startsWith(description)).toBe(true);
    expect(description.endsWith(" ")).toBe(false);
    expect(description.endsWith("…")).toBe(false);
  });

  it("keeps a comment at exactly the maximum untouched", () => {
    const exact = "x".repeat(maximumDatasetDescriptionLength);

    expect(datasetJsonLdDescription(withComment([{ language: "en", value: exact }]), "en")).toBe(
      exact,
    );
  });
});

describe("structured data safety", () => {
  it("never lets source text close the script element", () => {
    const hostile = withComment([
      { language: "en", value: "Public </script><script>alert(1)</script> comment" },
    ]);
    const html = renderToStaticMarkup(
      <DatasetJsonLd
        canonicalUrl="https://portal.example/en/process/1111@01.00.000"
        dataset={hostile}
        locale="en"
      />,
    );

    expect(html).not.toContain("</script><script>alert(1)");
    expect(structuredData(hostile).description).toBe(
      "Public </script><script>alert(1)</script> comment",
    );
  });
});
