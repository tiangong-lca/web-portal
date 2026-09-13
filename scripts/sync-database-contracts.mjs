import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destinationRoot = resolve(repositoryRoot, "contracts/database-engine/portal");
const manifestPath = resolve(destinationRoot, "manifest.json");
const canonicalRepository = "tiangong-lca/database";
const contractNames = [
  "portal.common-types.v1",
  "portal.hybrid-database-input.v1",
  "portal.hybrid-database-input.v2",
  "portal.public-catalog-summary.v1",
  "portal.public-dataset.v1",
  "portal.public-exchange-page.v1",
  "portal.public-facets.v1",
  "portal.public-facets.v2",
  "portal.public-hybrid-candidate-page.v1",
  "portal.public-hybrid-candidate-page.v2",
  "portal.public-search-page.v1",
  "portal.public-search-page.v2",
  "portal.public-sitemap-manifest.v1",
  "portal.public-sitemap-page.v1",
  "portal.public-sitemap-shard.v1",
  "portal.public-version-page.v1",
  "portal.published-lcia-page.v1",
];
const sourcePaths = contractNames.flatMap((name) => [
  `contracts/portal/${name}.schema.json`,
  `contracts/portal/generated/${name}.d.ts`,
]);

function fail(message) {
  throw new Error(message);
}

function parseArguments(argv) {
  const options = {
    check: false,
    write: false,
    databaseRoot: undefined,
    databaseCommit: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--check") options.check = true;
    else if (argument === "--write") options.write = true;
    else if (argument === "--database-root") options.databaseRoot = argv[++index];
    else if (argument === "--database-commit") options.databaseCommit = argv[++index];
    else fail(`Unknown argument: ${argument}`);
  }
  if (options.check === options.write) fail("Choose exactly one of --check or --write.");
  options.databaseRoot ??= process.env.DATABASE_ENGINE_ROOT;
  options.databaseCommit ??= process.env.DATABASE_ENGINE_COMMIT;
  return options;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function destinationPath(sourcePath) {
  return resolve(destinationRoot, sourcePath.replace(/^contracts\/portal\//u, ""));
}

function readGitBlob(databaseRoot, commit, sourcePath) {
  return execFileSync("git", ["-C", databaseRoot, "show", `${commit}:${sourcePath}`], {
    encoding: null,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function resolveCommit(databaseRoot, revision) {
  const commit = execFileSync("git", ["-C", databaseRoot, "rev-parse", `${revision}^{commit}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  if (!/^[0-9a-f]{40}$/u.test(commit)) fail("Database contract commit did not resolve exactly.");
  return commit;
}

function expectedDestinationPaths() {
  return sourcePaths.map((sourcePath) =>
    relative(destinationRoot, destinationPath(sourcePath)).replaceAll("\\", "/"),
  );
}

function listedFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(relative(root, path).replaceAll("\\", "/"));
      else fail("Database contract snapshot contains a non-file entry.");
    }
  };
  visit(root);
  return files.sort((left, right) => left.localeCompare(right));
}

function manifestFrom(databaseRoot, sourceCommit) {
  const files = sourcePaths.map((sourcePath) => {
    const bytes = readGitBlob(databaseRoot, sourceCommit, sourcePath);
    const path = relative(destinationRoot, destinationPath(sourcePath)).replaceAll("\\", "/");
    return { path, sourcePath, bytes: bytes.byteLength, sha256: sha256(bytes) };
  });
  return {
    schemaVersion: "portal.database-contract-snapshot.v1",
    sourceRepository: canonicalRepository,
    sourceCommit,
    files,
  };
}

function writeSnapshot(options) {
  if (!options.databaseRoot || !options.databaseCommit) {
    fail(
      "--write requires --database-root and --database-commit (or matching environment values). ",
    );
  }
  const databaseRoot = resolve(options.databaseRoot);
  const sourceCommit = resolveCommit(databaseRoot, options.databaseCommit);
  const manifest = manifestFrom(databaseRoot, sourceCommit);
  for (const file of manifest.files) {
    const bytes = readGitBlob(databaseRoot, sourceCommit, file.sourcePath);
    const path = resolve(destinationRoot, file.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
  }
  mkdirSync(destinationRoot, { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Synced ${manifest.files.length} Database Portal contract files at ${sourceCommit}.`);
}

function validateManifest(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.schemaVersion !== "portal.database-contract-snapshot.v1" ||
    value.sourceRepository !== canonicalRepository ||
    typeof value.sourceCommit !== "string" ||
    !/^[0-9a-f]{40}$/u.test(value.sourceCommit) ||
    !Array.isArray(value.files)
  ) {
    fail("Database contract manifest is invalid.");
  }
  const expected = expectedDestinationPaths();
  const actual = value.files.map((file) => file?.path);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail("Database contract manifest file inventory is incomplete or out of order.");
  }
  for (const [index, file] of value.files.entries()) {
    if (
      !file ||
      file.sourcePath !== sourcePaths[index] ||
      typeof file.bytes !== "number" ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 1 ||
      typeof file.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/u.test(file.sha256)
    ) {
      fail(`Database contract manifest entry ${index} is invalid.`);
    }
  }
  return value;
}

function checkSnapshot(options) {
  const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
  const expectedFiles = [...expectedDestinationPaths(), "manifest.json"].sort((left, right) =>
    left.localeCompare(right),
  );
  const actualFiles = listedFiles(destinationRoot);
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    fail("Database contract snapshot contains missing or unexpected files.");
  }

  for (const file of manifest.files) {
    const path = resolve(destinationRoot, file.path);
    const bytes = readFileSync(path);
    if (
      !statSync(path).isFile() ||
      bytes.byteLength !== file.bytes ||
      sha256(bytes) !== file.sha256
    ) {
      fail(`Database contract snapshot drifted: ${file.path}`);
    }
  }

  if (options.databaseRoot || options.databaseCommit) {
    if (!options.databaseRoot) fail("Upstream comparison requires --database-root.");
    const databaseRoot = resolve(options.databaseRoot);
    const sourceCommit = resolveCommit(
      databaseRoot,
      options.databaseCommit ?? manifest.sourceCommit,
    );
    if (sourceCommit !== manifest.sourceCommit) {
      fail("Requested Database commit does not match the committed contract manifest.");
    }
    for (const file of manifest.files) {
      const upstream = readGitBlob(databaseRoot, sourceCommit, file.sourcePath);
      if (upstream.byteLength !== file.bytes || sha256(upstream) !== file.sha256) {
        fail(`Vendored contract is not byte-identical to Database: ${file.sourcePath}`);
      }
    }
  }

  console.log(
    `Verified ${manifest.files.length} byte-identical Database Portal contract files at ${manifest.sourceCommit}.`,
  );
}

const options = parseArguments(process.argv.slice(2));
if (options.write) writeSnapshot(options);
else checkSnapshot(options);
