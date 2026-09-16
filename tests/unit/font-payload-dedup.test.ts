import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

/**
 * The consolidated build must define each font once. These fixtures run the real check against an
 * emitted-chunk tree, so they prove the detector on actual CSS files rather than restating which
 * modules import which package. Real font files stay listed in the product code; only the emitted
 * declarations matter here.
 */
const script = resolve("scripts/check-font-payload-dedup.mjs");

const fontFace = ({ family, range, weight }: { family: string; range: string; weight: number }) =>
  `@font-face{font-family:${family};font-style:normal;font-weight:${weight};` +
  `src:url(/fonts/${family}-${weight}.woff2) format("woff2");unicode-range:${range};}`;

const sourceSans = [
  fontFace({ family: "Source Sans 3", range: "U+0000-00FF", weight: 400 }),
  fontFace({ family: "Source Sans 3", range: "U+0100-024F", weight: 400 }),
];
const notoSansSc = [fontFace({ family: "Noto Sans SC", range: "U+4E00-9FFF", weight: 700 })];

describe("emitted font payload deduplication", () => {
  const temporaryRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
    );
  });

  async function runAgainst(chunks: Record<string, string>) {
    const root = await mkdtemp(join(tmpdir(), "portal-font-payload-"));
    temporaryRoots.push(root);
    const chunkRoot = join(root, ".next", "static", "chunks");
    await mkdir(chunkRoot, { recursive: true });

    for (const [name, css] of Object.entries(chunks)) {
      await writeFile(join(chunkRoot, name), css);
    }

    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
    return { status: result.status, stderr: result.stderr, stdout: result.stdout };
  }

  it("rejects two chunks that ship the same font definitions", async () => {
    const payload = [...sourceSans, ...notoSansSc].join("");
    const result = await runAgainst({ "a.css": payload, "b.css": payload, "c.css": "" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Identical font definitions");
    expect(result.stderr).toContain("a.css");
    expect(result.stderr).toContain("b.css");
    expect(result.stderr).toContain("globals.css");
  });

  it("rejects a duplicate that differs only in formatting", async () => {
    const payload = [...sourceSans, ...notoSansSc].join("");
    const reformatted = payload.replace(/;/gu, ";\n  ");
    const result = await runAgainst({ "a.css": payload, "b.css": reformatted });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Identical font definitions");
  });

  it("accepts distinct variants, separate subsets and chunks without fonts", async () => {
    const result = await runAgainst({
      "regular.css": sourceSans.join(""),
      "bold.css": fontFace({ family: "Source Sans 3", range: "U+0000-00FF", weight: 700 }),
      "cjk.css": notoSansSc.join(""),
      "layout.css": ".hero{color:red}",
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("4 emitted CSS chunks");
    expect(result.stdout).toContain("3 of 4");
  });

  it("accepts one chunk carrying the whole payload", async () => {
    const result = await runAgainst({ "globals.css": [...sourceSans, ...notoSansSc].join("") });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("1 of 1");
  });

  it("preserves meaningful whitespace in quoted font families and asset URLs", async () => {
    const result = await runAgainst({
      "spaced.css": '@font-face{font-family:"Font A";src:url("/same.woff2");}',
      "compact.css": '@font-face{font-family:"FontA";src:url("/same.woff2");}',
      "url-space.css": '@font-face{font-family:"Other";src:url("/a b}.woff2");}',
      "url-compact.css": '@font-face{font-family:"Other";src:url("/ab}.woff2");}',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("4 of 4");
  });
});
