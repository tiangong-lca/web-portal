import { describe, expect, it } from "vitest";
import { geographyName, formatGeographyCode } from "@/i18n/geography";
import { locales } from "@/i18n/routing";
import { parsePortalBrowseUrl } from "@/server/contracts/navigation";
import { navigationHref } from "@/features/catalog/navigation-links";

describe("receipted geography display", () => {
  it("keeps residual and global regions distinct in every locale", () => {
    for (const locale of locales) {
      expect(geographyName("RoW", locale)).toBeTruthy();
      expect(geographyName("RoW", locale)).not.toBe(geographyName("GLO", locale));
    }
  });
  it("translates the evidenced Anqing alias without replacing its authored filter code", () => {
    expect(formatGeographyCode("CN-AH-AQ", "zh-CN")).toBe("中国,安徽省,安庆市 (CN-AH-AQ)");
    expect(parsePortalBrowseUrl({ geo: "CN-AH-AQ" }).filters.geography).toBe("cn-ah-aq");
  });
  it("shows known parent context for an ambiguous raw code without inventing a city", () => {
    expect(geographyName("CN-AH-ZX", "zh-CN")).toBeUndefined();
    expect(formatGeographyCode("CN-AH-ZX", "zh-CN")).toBe("中国,安徽省 · CN-AH-ZX");
    expect(formatGeographyCode("unmapped", "zh-CN")).toBe("unmapped");
  });
  it("keeps raw codes alongside opaque node filters through navigation", () => {
    const href = new URL(
      navigationHref("zh-CN", parsePortalBrowseUrl({}), "geography", "geo:~1234", {
        code: "CN-AH-ZX",
        results: true,
      }),
      "https://portal.test",
    );
    expect(href.searchParams.get("geo")).toBe("CN-AH-ZX");
    expect(href.searchParams.get("geoNode")).toBe("geo:~1234");
  });
});
