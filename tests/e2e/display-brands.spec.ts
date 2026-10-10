import { expect, test } from "@playwright/test";
import { dataBrandNames, readPortalDataBrandScope } from "../../src/config/data-brands";
import en from "../../src/i18n/messages/en.json" with { type: "json" };

const scope = readPortalDataBrandScope(process.env);

test("shows database attribution independently of the site brand", async ({ page }) => {
  await page.goto("/en/process/11111111-1111-1111-1111-111111111111@01.00.000");
  await expect(page.getByLabel(en.Common.dataBrand).first()).toHaveText("Tiangong LCA");
});

test("limits the brand selector to this deployment and hides it for a single brand", async ({
  page,
}) => {
  await page.goto("/en/search?v=1");
  await page.getByRole("combobox", { name: /Search mode/ }).click();
  await page.getByRole("option", { name: "Describe your need" }).click();
  await page.getByRole("button", { name: en.Search.facets, exact: true }).click();
  const selector = page.getByRole("combobox", { name: en.Common.dataBrand });
  if (scope.allowedBrandCodes.length === 1) {
    await expect(selector).toHaveCount(0);
    return;
  }
  await selector.click();
  const options = page.getByRole("option");
  await expect(options).toHaveText([
    en.Common.allDataBrands,
    ...scope.allowedBrandCodes.map((code) => dataBrandNames[code]),
  ]);
  await page.getByRole("option", { name: "BAFU", exact: true }).click();
  await expect(selector).toHaveText("BAFU");
});
