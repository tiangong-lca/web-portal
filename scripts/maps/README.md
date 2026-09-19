# Region-map assets

Offline generator for the Portal's geography map layers. It turns reviewed boundary sources into preprojected SVG paths so the browser never reprojects, never ships a GeoJSON parser and never calls a tile service.

```bash
# Rebuild the checked-in assets (writes public/maps/**, the manifest and the audit trail).
node scripts/maps/build-region-maps.mjs

# Verify: re-hash the vendored sources, rebuild in memory, compare every byte. Writes nothing.
node scripts/maps/build-region-maps.mjs --check

# Refresh the vendored sources from upstream. The only mode that uses the network.
node scripts/maps/build-region-maps.mjs --fetch
```

`--check` exits non-zero and lists every drifted file, missing file, orphan file and over-budget layer. It fails on "the source set no longer matches the dictionary", which is what a location-vocabulary update looks like.

## Outputs

| Path | Role |
| --- | --- |
| `public/maps/<layer>.<sha16>.json` | Browser asset. `{ viewBox, features: [{ boundaryId, nodeId, path }] }`. |
| `src/features/catalog/region-map-manifest.generated.json` | Browser manifest: layer URL/hash/gzip size, source receipts, licences, thresholds, counts. |
| `scripts/maps/coverage-report.json` | Full audit trail: per-code reasons, shapes without a node, dropped rings, source receipts. Not bundled. |
| `scripts/maps/sources/manifest.json` | Receipt for the vendored raw bytes. Not bundled. |
| `scripts/maps/sources/*.json.gz` | Vendored raw sources. Build inputs, never browser assets. |

## Layers

| Layer key | Contents | Projection |
| --- | --- | --- |
| `world` | 265 Natural Earth Admin-0 map units | `mapshaper -proj robinson` |
| `geo:cn` | 31 province-level divisions + the nine-dash line inset | `mapshaper -proj webmercator` |
| `geo:cn-xx` | The prefectures of province `xx` (27 provinces) | same space as `geo:cn` |

Every Chinese layer shares one projection **and one fitted coordinate space**: the largest dimension of the province layer is fitted to 80 000 integer units, and a province sublayer's `viewBox` is a literal window into that same space. A consumer can therefore zoom a province outline and swap in its prefecture layer without re-projecting or re-fitting, and the two agree pixel for pixel.

`nodeId` resolves a node to its layer without an index: `world` holds the two-letter codes, `geo:cn` holds `geo:cn-xx`, `geo:cn-xx` holds `geo:cn-xx-yyy`. Codes that have no drawable shape are listed in the manifest's `unmapped` array with the layer they would have appeared in. Codes outside those three families (regions such as `AFR`, economic groupings such as `EU-25`) are never mapped to a boundary.

## Resolution rules

A shape receives a `nodeId` only when the source itself asserts a code the Portal location dictionary already contains, and only when that assertion is unique. Nothing is guessed from a similar name, a neighbouring boundary, a successor administration or a historic predecessor; an unresolved shape keeps `nodeId: null` and is recorded in the audit trail.

- **World.** The first of Natural Earth's `ISO_A2` and `ISO_A2_EH` that is a dictionary key. `ISO_A2_EH` is required: Natural Earth leaves `ISO_A2` as `-99` on map units that are parts of a sovereign state (England, Madeira, Zanzibar, Réunion) and records the state code in `ISO_A2_EH`. Result: 261 of 265 shapes resolved; only Somaliland, Kosovo, Northern Cyprus and the Siachen Glacier stay null, because the source asserts no code for them.
- **Provinces.** Exact, unique Chinese name match against the `CN-*` dictionary entries. Result: 31 of 35 shapes resolved.
- **Prefectures.** Exact, unique Chinese name match against that province's `CN-xx-*` entries, inside that province only. Result: 317 of 333 codes resolved across 27 sublayers.

## Known exceptions

These are deliberate, and each one is recorded in `coverage-report.json`.

**Codes with no boundary (19).** Historic or renamed names that have no shape in today's boundaries: `geo:cn-ah-cah` (巢湖市, abolished 2011), `geo:cn-sd-lws` (莱芜市, merged into济南 2019), `geo:cn-hb-xfn` (襄樊市, renamed 襄阳市 2010), `geo:cn-gz-bjd` and `geo:cn-gz-trd` (毕节/铜仁 地区, now 市), `geo:cn-qh-hdd` (海东地区, now 海东市), the five 西藏 地区 codes (`geo:cn-xz-nad/nyd/qad/snd/xid`), the four 新疆 地区 codes (`geo:cn-xj-hmd/tud/ksi/tcd`), and the parenthesised `geo:cn-nm-cfs` (赤峰（乌兰哈达）市). Also `geo:bv`, `geo:gi`, `geo:um`, which have no shape in the 1:50m world source. These are **not** snapped onto their successors.

**Shapes with no node (54).** 4 in `world` (Somaliland, Kosovo, Northern Cyprus, Siachen Glacier) and 46 in the prefecture layers, which are the 省直辖县级行政区划 and 兵团 cities (济源市, 仙桃市, 石河子市 …) plus the successor cities of the renamed 地区 above; they are drawn so their province has no holes.

In `geo:cn`: `cnprov:710000` 台湾省, `cnprov:810000` 香港特别行政区 and `cnprov:820000` 澳门特别行政区 are drawn but unassigned — the dictionary carries Hong Kong, Macao and Taiwan as top-level codes `HK`, `MO` and `TW` (named 香港/澳门/台湾), not as `CN-` subdivisions and not under the source's names, so neither the province rule nor the city rule matches them. `cnprov:100000_JD` is the nine-dash line inset: kept as decoration, and it must never receive a node.

**Dropped rings (2).** Two sub-resolution islets (one in 湖南省, one in 怀化市) round to fewer than three integer points in the 80 000-unit space and cannot be filled. At 10 000 units five rings were lost, including Macao and the Vatican; 80 000 is the smallest tested space that loses none of the world's shapes.

## Toolchain

Simplification and projection use a pinned [mapshaper](https://github.com/mbloch/mapshaper) `0.7.61` (MPL-2.0, Node >= 20.11). It is resolved in this order:

1. `MAPSHAPER_BIN` — an explicit path or command.
2. `scripts/maps/.toolchain/node_modules/.bin/mapshaper` — an optional local, offline install:
   ```bash
   mkdir -p scripts/maps/.toolchain && cd scripts/maps/.toolchain
   npm install --no-audit --no-fund mapshaper@0.7.61
   ```
   (That directory is ignored by git through the repository's `node_modules/` rule.)
3. The locked project `mapshaper` devDependency, invoked through Node. Missing dependencies fail with an installation instruction; generation never downloads tools.

The build itself is offline: `--fetch` is the only mode that opens a socket, and the generated assets contain no timestamp, so rebuilding unchanged sources reproduces identical bytes and identical filenames. `tests/unit/region-map-assets.test.ts` runs `--check` automatically using the locked development dependency.

## Sources and terms

Recorded per source in the manifest and the audit trail, with the exact URL, commit and SHA-256 of the bytes that were vendored.

| Source | Terms |
| --- | --- |
| Natural Earth Admin-0 map units (1:50m), via `tiangong-lca/platform` | Public domain — <https://www.naturalearthdata.com/about/terms-of-use/> |
| DataV.GeoAtlas province boundaries for 100000, via `tiangong-lca/platform` | Provider terms — <https://help.aliyun.com/zh/datav/datav-7-0/user-guide/datav-geoatlas-widgets/> |
| DataV.GeoAtlas prefecture boundaries (`{adcode}_full.json`) | Same provider; no separate data licence is stated on the tool page. Recorded as an unrelicensed upstream reference and flagged for review. |

The upstream release number of the Natural Earth file is not asserted, because the vendored file carries no version field; the identification rests on its `featurecla`, `scalerank`, `NE_ID`, `WIKIDATAID` and `NAME_<lang>` fields.

## Budget

`LAYER_GZIP_BUDGET_BYTES` in `lib/config.mjs` is 150 KiB per layer, enforced during generation and by `--check`. Current worst layer: `world` at 109.4 KiB gzip; the 29 layers total 470 KiB gzip. `SIMPLIFY` and `COORDINATE_UNITS` are the two knobs; both are recorded in the manifest so a renderer can tell which parameters produced a layer.
