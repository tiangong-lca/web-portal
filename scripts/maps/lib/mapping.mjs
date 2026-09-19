/**
 * Canonical node resolution for the region-map layers.
 *
 * The rules are deliberately narrow. A shape only receives a `nodeId` when the
 * source itself asserts a code that the Portal location dictionary already
 * contains, and only when that assertion is unique inside its container. Any
 * shape that cannot be resolved keeps `nodeId: null`; nothing is guessed from a
 * similar name, a neighbouring boundary, or a historic predecessor.
 *
 * Canonical ids follow the Portal navigation contract: `geo:<lowercase code>`,
 * where `<code>` is an exact key of `src/i18n/locations.generated.json`.
 */

/** `geo:<lowercase code>` for a dictionary key. */
export function nodeIdFor(code) {
  return `geo:${code.toLowerCase()}`;
}

/** Last comma-separated segment of a localized location name. */
export function shortName(zhName) {
  const name = typeof zhName === "string" ? zhName.trim() : "";
  const segments = name.split(",");
  return segments[segments.length - 1].trim();
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * World rule: take the first source-declared ISO alpha-2 assertion — `ISO_A2`
 * then `ISO_A2_EH` — and accept it only when the dictionary contains that exact
 * code. Natural Earth leaves `ISO_A2` as `-99` for map units that are parts of
 * a sovereign state (England, Madeira, Zanzibar) and records the state code in
 * `ISO_A2_EH`; using both fields is therefore a source assertion, not a guess.
 * Units with no asserted code (Somaliland, Kosovo, Northern Cyprus, Siachen
 * Glacier) stay unresolved.
 */
export function worldCode(properties, hasCode) {
  for (const field of ["ISO_A2", "ISO_A2_EH"]) {
    const candidate = text(properties[field]);
    if (!candidate || candidate === "-99") continue;
    if (hasCode(candidate)) return { code: candidate, field };
  }
  return null;
}

/**
 * Chinese administrative rule: exact, unique, same-container Chinese name.
 *
 * `codes` are the dictionary keys to place (provinces under `CN`, or one
 * province's child codes). `features` are the source features for the same
 * container. A code resolves only when its exact short name matches exactly one
 * feature *and* no other code in the container carries the same short name.
 * Historic names (巢湖市, 莱芜市, 襄樊市, 日喀则地区 …) and parenthesised names
 * (赤峰（乌兰哈达）市) therefore stay unresolved instead of being snapped onto a
 * modern boundary.
 */
export function resolveByName(codes, features, names, containerLabel) {
  const byName = new Map();
  for (const feature of features) {
    const name = text(feature.properties?.name);
    if (!name) continue;
    const bucket = byName.get(name);
    if (bucket) bucket.push(feature);
    else byName.set(name, [feature]);
  }

  const nameCounts = new Map();
  for (const code of codes) {
    const name = shortName(names[code]?.["zh-CN"]);
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }

  const byCode = new Map();
  const unresolved = [];
  const used = new Set();
  for (const code of codes) {
    const name = shortName(names[code]?.["zh-CN"]);
    if (!name) {
      unresolved.push({ nodeId: nodeIdFor(code), reason: "dictionary entry has no zh-CN name" });
      continue;
    }
    if (nameCounts.get(name) > 1) {
      unresolved.push({
        nodeId: nodeIdFor(code),
        reason: `ambiguous code: ${nameCounts.get(name)} codes in ${containerLabel} share the name "${name}"`,
      });
      continue;
    }
    const matches = byName.get(name) ?? [];
    if (matches.length === 0) {
      unresolved.push({
        nodeId: nodeIdFor(code),
        reason: `no exact boundary named "${name}" in ${containerLabel}`,
      });
      continue;
    }
    if (matches.length > 1) {
      unresolved.push({
        nodeId: nodeIdFor(code),
        reason: `ambiguous boundary: ${matches.length} shapes named "${name}" in ${containerLabel}`,
      });
      continue;
    }
    byCode.set(code, matches[0]);
    used.add(matches[0]);
  }
  return { byCode, unresolved, used };
}

/**
 * Attach a stable, source-derived `boundaryId` to every feature. Duplicates are
 * a hard failure: a silent fallback would make the receipt unverifiable.
 */
export function boundaryIds(features, idOf, prefix) {
  const seen = new Map();
  return features.map((feature) => {
    const raw = idOf(feature);
    const boundaryId = `${prefix}:${raw}`;
    if (!raw) throw new Error(`Source feature has no boundary identity (${prefix}).`);
    if (seen.has(boundaryId)) {
      throw new Error(
        `Duplicate boundaryId ${boundaryId}: ${seen.get(boundaryId)} and ${JSON.stringify(feature.properties)}.`,
      );
    }
    seen.set(boundaryId, JSON.stringify(feature.properties));
    return boundaryId;
  });
}
