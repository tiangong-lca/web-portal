import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const vocabularyPath = "contracts/database-engine/portal/navigation-vocabulary.json";
const supplementPath = "src/i18n/location-supplements.json";
const sourceBytes = readFileSync(vocabularyPath);
const supplementBytes = readFileSync(supplementPath);
const vocabulary = JSON.parse(sourceBytes);
const supplements = JSON.parse(supplementBytes);
const base = JSON.parse(readFileSync("src/i18n/locations.generated.json"));
const names = {};
for (const node of vocabulary.nodes) {
  if (node.dimension !== "geography" || node.code === "ALL" || node.code === "NULL") continue;
  const code = node.code.trim().toUpperCase();
  const values = Object.fromEntries(Object.entries(node.labels).filter(([, value]) => value));
  if (Object.keys(values).length) {
    if (!Object.hasOwn(base, code)) names[code] = values;
    for (const alias of node.aliasCodes ?? []) {
      if (!Object.hasOwn(base, alias.toUpperCase())) names[alias.toUpperCase()] = values;
    }
  }
}
for (const [code, entry] of Object.entries(supplements.entries)) {
  const values = entry.aliasOf ? base[entry.aliasOf] : entry.names;
  if (!values || Object.keys(values).length !== 4)
    throw new Error(`Incomplete display supplement ${code}`);
  names[code] = values;
}
const result = {
  sourceSha256: createHash("sha256").update(sourceBytes).digest("hex"),
  supplementsSha256: createHash("sha256").update(supplementBytes).digest("hex"),
  names: Object.fromEntries(
    Object.entries(names).sort(([left], [right]) => left.localeCompare(right, "en")),
  ),
};
const output = `${JSON.stringify(result, null, 2)}\n`;
const destination = "src/i18n/navigation-locations.generated.json";
if (process.argv.includes("--check")) {
  if (readFileSync(destination, "utf8") !== output)
    throw new Error("Navigation geography labels drifted; run pnpm generate:navigation-locations.");
} else writeFileSync(destination, output);
console.log(`Verified ${Object.keys(names).length} supplementary geography display labels.`);
