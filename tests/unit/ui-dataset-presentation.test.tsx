import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import messages from "@/i18n/messages/en.json";
import de from "@/i18n/messages/de.json";
import fr from "@/i18n/messages/fr.json";
import zh from "@/i18n/messages/zh-CN.json";
import { locales } from "@/i18n/routing";
import fixture from "../fixtures/portal/catalog-v1.json";
import { publicDatasetEnvelopeSchema } from "@/server/contracts/portal";
import { mapDataset } from "@/features/catalog/map-public-data";

vi.mock("next-intl/server", () => ({
  getTranslations:
    async ({ namespace, locale = "en" }: { namespace: string; locale?: string }) =>
    (key: string) => {
      const dictionaries: Record<string, typeof messages> = { en: messages, de, fr, "zh-CN": zh };
      const value = (dictionaries[locale] as Record<string, Record<string, unknown>>)[namespace]?.[
        key
      ];
      if (typeof value !== "string")
        throw new Error(`Missing test translation: ${namespace}.${key}`);
      return value;
    },
}));

import { OverviewPanel } from "@/features/catalog/overview-panel";
import { AvailabilityBadges } from "@/features/catalog/availability-badges";

afterEach(cleanup);

describe("dataset-aware public presentation", () => {
  it("shows Flow metadata without Process-only placeholders or a false open-data label", async () => {
    const record = mapDataset(
      publicDatasetEnvelopeSchema.parse(fixture.datasetFlow),
      "en",
      "https://portal.example/en/flow/example",
    );
    render(await OverviewPanel({ locale: "en", record }));
    expect(screen.getByText("124-38-9")).toBeVisible();
    expect(screen.getByText("Reference flow property")).toBeVisible();
    expect(screen.getByText("Mass")).toBeVisible();
    expect(screen.queryByText("Functional unit")).not.toBeInTheDocument();
    expect(screen.queryByText("Reference year")).not.toBeInTheDocument();
    expect(screen.queryByText("supply")).not.toBeInTheDocument();
    expect(screen.queryByText(messages.Common.public)).not.toBeInTheDocument();
    expect(screen.getByText(messages.Detail.availabilityHelp)).toBeVisible();
  });

  it("shows only the exact capabilities supplied with a dataset", () => {
    const labels = {
      exchanges: messages.Common.exchangesAvailable,
      lcia: messages.Common.lciaAvailable,
      metadata: messages.Common.metadataOnly,
    };
    const view = render(
      <div data-testid="availability">
        <AvailabilityBadges
          capabilities={{ exchangesVisible: false, lciaVisible: false }}
          labels={labels}
        />
      </div>,
    );
    expect(within(screen.getByTestId("availability")).getByText(labels.metadata)).toBeVisible();
    expect(screen.queryByText(labels.lcia)).not.toBeInTheDocument();
    view.rerender(
      <AvailabilityBadges
        capabilities={{ exchangesVisible: true, lciaVisible: false }}
        labels={labels}
      />,
    );
    expect(screen.getByText(labels.exchanges)).toBeVisible();
    expect(screen.queryByText(labels.metadata)).not.toBeInTheDocument();
    expect(screen.queryByText(labels.lcia)).not.toBeInTheDocument();
  });
});

describe("truthful public attribution and license declarations", () => {
  const dictionaries = { en: messages, de, fr, "zh-CN": zh };
  for (const locale of locales) {
    it(`keeps generator, owner and use conditions distinct in ${locale}`, async () => {
      const dataset = publicDatasetEnvelopeSchema.parse(fixture.datasetProcess);
      dataset.metadata.administration.dataGenerator.name = [
        { language: "en", value: "Research team" },
      ];
      dataset.metadata.administration.owner.name = [{ language: "en", value: "Dataset owner" }];
      dataset.metadata.administration.dataEntryBy.name = [
        { language: "en", value: "Input operator" },
      ];
      dataset.metadata.administration.accessRestrictions = [
        { language: "en", value: "Permission required for commercial reuse." },
      ];
      dataset.metadata.administration.licenseType =
        "Free of charge for some user types or use types";
      dataset.metadata.source.licenseId = "DO NOT TREAT THIS AS A LICENSE CATEGORY";
      dataset.metadata.source.licenseUrl = null;
      const record = mapDataset(dataset, locale, "https://example.com/dataset");
      render(await OverviewPanel({ locale, record }));
      const labels = dictionaries[locale].Detail;
      const valueFor = (label: string) =>
        screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent;
      const suffix = locale === "en" ? "" : " [en]";
      expect(valueFor(labels.dataGenerator)).toBe(`Research team${suffix}`);
      expect(valueFor(labels.dataOwner)).toBe(`Dataset owner${suffix}`);
      expect(valueFor(labels.licenseType)).toBe(dataset.metadata.administration.licenseType);
      expect(valueFor(labels.accessRestrictions)).toBe(
        `Permission required for commercial reuse.${suffix}`,
      );
      expect(screen.queryByText("Input operator")).not.toBeInTheDocument();
      expect(screen.queryByText("DO NOT TREAT THIS AS A LICENSE CATEGORY")).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: labels.viewLicense })).not.toBeInTheDocument();
    });
  }
  it("does not promote source/provider, entry operator or licenseId into missing declarations", async () => {
    const dataset = publicDatasetEnvelopeSchema.parse(fixture.datasetFlow);
    dataset.metadata.source.providerName = [{ language: "en", value: "Source only" }];
    dataset.metadata.source.licenseId = "Unverified license name";
    dataset.metadata.administration.dataEntryBy.name = [{ language: "en", value: "Operator only" }];
    const record = mapDataset(dataset, "en", "https://example.com/flow");
    expect(record.dataGenerator).toBeUndefined();
    expect(record.dataOwner).toBeUndefined();
    expect(record.licenseType).toBeUndefined();
    render(await OverviewPanel({ locale: "en", record }));
    expect(screen.queryByText(messages.Detail.dataGenerator)).not.toBeInTheDocument();
    expect(screen.queryByText(messages.Detail.dataOwner)).not.toBeInTheDocument();
    expect(screen.getByText(messages.Detail.licenseType).nextElementSibling).toHaveTextContent(
      messages.Common.notProvided,
    );
  });
  it("renders authored restrictions as text and preserves an explicitly supplied license link", async () => {
    const dataset = publicDatasetEnvelopeSchema.parse(fixture.datasetProcess);
    const restriction = '</dd><script>alert("not markup")</script>';
    dataset.metadata.administration.accessRestrictions = [{ language: "en", value: restriction }];
    render(
      await OverviewPanel({
        locale: "en",
        record: mapDataset(dataset, "en", "https://example.com/process"),
      }),
    );
    expect(screen.getByText(restriction)).toBeVisible();
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByRole("link", { name: messages.Detail.viewLicense })).toHaveAttribute(
      "href",
      "https://example.com/license",
    );
  });
});
