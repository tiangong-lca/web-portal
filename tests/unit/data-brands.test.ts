import { describe, expect, it } from "vitest";

import { assertPortalDataBrandScopeMatches, readPortalDataBrandScope } from "@/config/data-brands";

describe("server-owned deployment data brands", () => {
  it("selects one data brand independently of visual presentation", () => {
    for (const visual of ["tiangong", "atlas"]) {
      expect(
        readPortalDataBrandScope({ PORTAL_BRAND: visual, PORTAL_DATA_BRANDS: "bafu" })
          .allowedBrandCodes,
      ).toEqual(["bafu"]);
    }
  });

  it("canonicalizes whitespace, duplicates and ordering to one immutable identity", () => {
    const a = readPortalDataBrandScope({ PORTAL_DATA_BRANDS: " uslci,tiangong_lca,bafu,uslci " });
    const b = readPortalDataBrandScope({ PORTAL_DATA_BRANDS: "bafu,uslci,tiangong_lca" });
    expect(a).toEqual(b);
    expect(a.allowedBrandCodes).toEqual(["bafu", "tiangong_lca", "uslci"]);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.allowedBrandCodes)).toBe(true);
  });

  it.each([
    undefined,
    "",
    " ",
    ",",
    "bafu,",
    ",bafu",
    "bafu,,uslci",
    "*",
    "all",
    "null",
    "Tiangong LCA",
    "BAFU",
    "bafu,unknown",
    "bafu".repeat(300),
  ])("fails closed for invalid configuration %j", (value) => {
    expect(() => readPortalDataBrandScope({ PORTAL_DATA_BRANDS: value })).toThrow(
      "PORTAL_DATA_BRANDS",
    );
  });

  it("has no default from the visual brand or a browser-prefixed variable", () => {
    expect(() =>
      readPortalDataBrandScope({
        PORTAL_BRAND: "tiangong",
        NEXT_PUBLIC_PORTAL_DATA_BRANDS: "tiangong_lca",
      }),
    ).toThrow();
  });

  it("keeps different deployments distinct and rejects runtime/build drift", () => {
    const single = readPortalDataBrandScope({ PORTAL_DATA_BRANDS: "tiangong_lca" });
    const multi = readPortalDataBrandScope({ PORTAL_DATA_BRANDS: "tiangong_lca,bafu" });
    expect(single.identity).not.toBe(multi.identity);
    expect(() =>
      assertPortalDataBrandScopeMatches(single.identity, {
        PORTAL_DATA_BRANDS: "bafu,tiangong_lca",
      }),
    ).toThrow("rebuild and redeploy");
    expect(
      assertPortalDataBrandScopeMatches(multi.identity, {
        PORTAL_DATA_BRANDS: "bafu, tiangong_lca,bafu",
      }),
    ).toEqual(multi);
  });

  it("never includes unrecognized configuration content in errors", () => {
    expect(() => readPortalDataBrandScope({ PORTAL_DATA_BRANDS: "private-value" })).toThrow(
      "unsupported brand code",
    );
    try {
      readPortalDataBrandScope({ PORTAL_DATA_BRANDS: "private-value" });
    } catch (error) {
      expect(String(error)).not.toContain("private-value");
    }
  });
});
