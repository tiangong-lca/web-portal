import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const staticRoot = join(process.cwd(), ".next", "static");

const fontFacePattern = /@font-face\s*\{(?:[^}"']|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')*\}/gu;

function normalizeWhitespace(declaration) {
  // Quoted font names and asset URLs can contain meaningful spaces. Outside strings,
  // collapse whitespace and remove only spacing around declaration punctuation.
  return declaration
    .split(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/gu)
    .map((part, index) =>
      index % 2 ? part : part.replace(/\s+/gu, " ").replace(/\s*([{}:;,])\s*/gu, "$1"),
    )
    .join("")
    .trim();
}

/**
 * One emitted chunk's font payload, or null when the chunk defines no font.
 *
 * Whitespace is normalised before hashing so that a formatter or minifier change cannot hide a
 * duplicate, and the comparison is over the whole payload rather than single rules: two chunks that
 * each carry a different subset are legitimate, while two chunks carrying the same set are the
 * regression this guards. Distinct weights, styles and Unicode ranges therefore stay distinct,
 * because they produce different declarations.
 */
export function fontPayload(css) {
  const declarations = css.match(fontFacePattern);
  if (!declarations || declarations.length === 0) return null;

  const payload = declarations.map(normalizeWhitespace).join("");
  return {
    blocks: declarations.length,
    digest: createHash("sha256").update(payload).digest("hex"),
  };
}

/** Chunks whose font payload is byte-identical to another chunk's, most-duplicated first. */
export function findDuplicatedFontPayloads(chunks) {
  const byDigest = new Map();

  for (const { name, css } of chunks) {
    const payload = fontPayload(css);
    if (!payload) continue;
    const group = byDigest.get(payload.digest) ?? { ...payload, files: [] };
    group.files.push(name);
    byDigest.set(payload.digest, group);
  }

  return [...byDigest.values()]
    .filter((group) => group.files.length > 1)
    .sort((left, right) => right.files.length - left.files.length);
}

async function collectCssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectCssFiles(path)));
    else if (extname(entry.name) === ".css") files.push(path);
  }

  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const paths = await collectCssFiles(staticRoot);
  const chunks = await Promise.all(
    paths.map(async (path) => ({
      name: relative(staticRoot, path),
      css: await readFile(path, "utf8"),
    })),
  );
  const duplicated = findDuplicatedFontPayloads(chunks);
  const carrying = chunks.filter(({ css }) => fontPayload(css) !== null);

  if (duplicated.length > 0) {
    const lines = duplicated.map(
      (group) =>
        `- ${group.files.length} chunks each ship the same ${group.blocks} font declarations ` +
        `(payload ${group.digest.slice(0, 16)}):\n${group.files.map((file) => `    ${file}`).join("\n")}`,
    );
    throw new Error(
      "Identical font definitions are emitted into more than one CSS chunk. Define @font-face once in " +
        `src/app/globals.css, which every product layout and the Storybook preview already load:\n${lines.join("\n")}`,
    );
  }

  console.log(
    `Font payload check OK: ${carrying.length} of ${chunks.length} emitted CSS chunks define fonts, ` +
      "and no two of them ship the same payload.",
  );
}
