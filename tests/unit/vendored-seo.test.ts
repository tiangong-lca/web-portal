import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const vendorDir = path.resolve(import.meta.dirname, "../../scripts/vendor/workspace-seo");
const manifest = JSON.parse(fs.readFileSync(path.join(vendorDir, "manifest.json"), "utf8")) as {
  schema?: number;
  generated?: boolean;
  source_repository?: string;
  source_commit?: string;
  source_path?: string;
  sha256?: string;
};
const bytes = fs.readFileSync(path.join(vendorDir, "check.py"));

describe("vendored shared SEO checker", () => {
  it("is a generated snapshot of the authoritative private source", () => {
    expect(manifest.schema).toBe(1);
    expect(manifest.generated).toBe(true);
    expect(manifest.source_repository).toBe("tiangong-lca/workspace");
    expect(manifest.source_path).toBe("scripts/seo/check.py");
    expect(manifest.source_commit).toMatch(/^[0-9a-f]{40}$/u);
  });

  it("matches the digest recorded in its manifest", () => {
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(manifest.sha256);
  });

  it("keeps verbatim line endings so the digest is stable across platforms", () => {
    expect(bytes.toString("utf8")).not.toContain("\r\n");
  });
});
