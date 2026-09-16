import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { readBrandConfig } from "@/config/brand";
import { z } from "zod";

const brandConfig = readBrandConfig({});

const receiptSchema = z.object({
  assets: z.array(
    z.object({
      target: z.string(),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
    }),
  ),
});

describe("reviewed brand assets", () => {
  it("match the checked-in SHA-256 receipt", () => {
    const receipt = receiptSchema.parse(
      JSON.parse(readFileSync(resolve(process.cwd(), "public/brand/sources.json"), "utf8")),
    );

    for (const asset of receipt.assets) {
      const bytes = readFileSync(resolve(process.cwd(), asset.target));
      const actual = createHash("sha256").update(bytes).digest("hex");

      expect(actual).toBe(asset.sha256);
    }
  });
});

/**
 * The social card is generated in this repository rather than sourced from the upstream brand
 * repository, so it is not part of the receipt above. It is checked against the declared metadata
 * instead: the shipped PNG header has to agree with the dimensions BrandConfig publishes, and the
 * card has to be a raster, because link previews do not render the SVG mark.
 */
function pngSize(bytes: Buffer): { width: number; height: number } {
  const signature = bytes.subarray(0, 8).toString("hex");
  expect(signature).toBe("89504e470d0a1a0a");
  expect(bytes.subarray(12, 16).toString("ascii")).toBe("IHDR");

  return { height: bytes.readUInt32BE(20), width: bytes.readUInt32BE(16) };
}

describe("generated social card", () => {
  it("is the declared 1200x630 raster, not the SVG mark", () => {
    const socialImage = brandConfig.socialImage;
    expect(socialImage).toBe("/brand/social-card.png");
    expect(socialImage).not.toMatch(/\.svg$/u);
    expect({ width: brandConfig.socialWidth, height: brandConfig.socialHeight }).toEqual({
      height: 630,
      width: 1200,
    });

    const bytes = readFileSync(resolve(process.cwd(), "public", socialImage.replace(/^\//u, "")));
    expect(pngSize(bytes)).toEqual({
      height: brandConfig.socialHeight,
      width: brandConfig.socialWidth,
    });
  });

  it("honours a reviewed override and keeps the asset-origin rule", () => {
    const overridden = readBrandConfig({
      PORTAL_SOCIAL_IMAGE: "https://cdn.example.test/card.png",
      PORTAL_BRAND_ASSET_ORIGIN: "https://cdn.example.test",
      PORTAL_SOCIAL_WIDTH: "1200",
      PORTAL_SOCIAL_HEIGHT: "630",
    });
    expect(overridden.socialImage).toBe("https://cdn.example.test/card.png");

    expect(() =>
      readBrandConfig({ PORTAL_SOCIAL_IMAGE: "https://cdn.example.test/card.png" }),
    ).toThrow(/PORTAL_BRAND_ASSET_ORIGIN/u);

    // Zod reports stable issue codes, so the assertion does not depend on message prose.
    for (const value of ["0", "-1", "4097", "1200.5"]) {
      expect(() => readBrandConfig({ PORTAL_SOCIAL_WIDTH: value })).toThrow(
        /too_small|too_big|invalid_type/u,
      );
    }
  });
});
