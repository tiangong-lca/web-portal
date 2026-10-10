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

  it("defaults missing configuration to Tiangong independently of presentation and public inputs", () => {
    const explicit = readPortalDataBrandScope({ PORTAL_DATA_BRANDS: "tiangong_lca" });
    for (const visual of [undefined, "tiangong", "atlas"]) {
      const environment = {
        PORTAL_BRAND: visual,
        NEXT_PUBLIC_PORTAL_DATA_BRANDS: "bafu,uslci,worldsteel",
      };
      expect(readPortalDataBrandScope(environment)).toEqual(explicit);
      expect(assertPortalDataBrandScopeMatches(explicit.identity, environment)).toEqual(explicit);
    }
    const multi = readPortalDataBrandScope({ PORTAL_DATA_BRANDS: "tiangong_lca,bafu" });
    expect(() => assertPortalDataBrandScopeMatches(multi.identity, {})).toThrow(
      "rebuild and redeploy",
    );
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
    let message = "";
    try {
      readPortalDataBrandScope({ PORTAL_DATA_BRANDS: "private-value" });
    } catch (error) {
      message = String(error);
    }
    expect(message).not.toContain("private-value");
  });
});
