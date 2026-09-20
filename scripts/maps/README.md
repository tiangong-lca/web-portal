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
| `public/maps/<layer>.<sha16>.json` | Browser asset. `{ coordinateSpace, viewBox, features: [{ boundaryId, nodeId, path }], basemap }`. |
| `src/features/catalog/region-map-manifest.generated.json` | Browser manifest: layer URL/hash/gzip size, source receipts, licences, thresholds, counts. |
| `scripts/maps/coverage-report.json` | Full audit trail: per-code reasons, shapes without a node, dropped rings, source receipts. Not bundled. |
| `scripts/maps/sources/manifest.json` | Receipt for the vendored raw bytes. Not bundled. |
| `scripts/maps/sources/*.json.gz` | Vendored raw sources. Build inputs, never browser assets. |

## Layers

| Layer key | Contents | Projection |
| --- | --- | --- |
| `world` | 265 Natural Earth Admin-0 map units | `mapshaper -proj "+proj=robin +lon_0=150"` |
| `geo:cn` | 34 province-level divisions + the nine-dash line inset | same projection and transform |
| `geo:cn-xx` | The prefectures of province `xx` (27 provinces) | same projection and transform |

**All 29 layers are windows into one map.** They share one projection _and_ one affine transform, declared as `coordinateSpace: "pacific-robinson-v1"` on every layer, so the world, each country and each province are consecutive zoom levels of the same picture: any layer's `viewBox` is literally a rectangle inside the world's. The renderer interpolates a camera between them and needs no projection, SDK or extra request at runtime.

The world layer is Pacific-centred: Robinson with its central meridian at 150°E, so the seam falls at 30°W in the mid-Atlantic and Asia, Australia and the Americas all sit inside the frame. `180°` was rejected because there the seam runs through Greenwich and slices England, France, Spain and four West African countries across both map edges; at 150°E the only landmasses the seam touches are Greenland, South Georgia, the Azores and Antarctica.

The seam is cut by the projection engine, not by shifting projected coordinates. `mapshaper -proj` splits every ring that crosses the projection's own seam and inserts the seam edge — Greenland goes from 17 to 19 parts — which a post-hoc translation cannot reproduce; a translated map draws each straddling feature as one ring crossing the whole frame. `tests/unit/region-map-assets.test.ts` rejects both that signature and any seam that would slice a populated continent.

The world's bounding box is fitted to `COORDINATE_UNITS` integer units, and every other layer is a window into that one space. The value is set by the smallest window the product shows: a city layer is roughly 1/300 of the world width, and 400 000 units still leaves it sub-pixel integer precision while every layer stays under the gzip budget.

`nodeId` resolves a node to its layer without an index: `world` holds the two-letter codes, `geo:cn` holds `geo:cn-xx` plus the existing `geo:tw`, `geo:hk`, `geo:mo` nodes, `geo:cn-xx` holds `geo:cn-xx-yyy`. Codes that have no drawable shape are listed in the manifest's `unmapped` array with the layer they would have appeared in. Codes outside those three families (regions such as `AFR`, economic groupings such as `EU-25`) are never mapped to a boundary.

## Basemap

Each layer carries an optional `basemap` with the faded geographic context behind its foreground. Every path is projected by the same pinned mapshaper release, with the same projection string and the same fitted transform as the layer's foreground, so a context vertex and a foreground vertex at the same longitude/latitude land on exactly the same coordinate.

| Field | Meaning |
| --- | --- |
| `land` | Faded neighbouring landmass (Natural Earth). Empty on `world`, whose foreground _is_ the land. |
| `borders` | The province outlines the foreground does not already draw. Omitted on `world` and `geo:cn`. |
| `graticule` | Latitude/longitude grid. 30° on `world`, otherwise the finest rung of `[10, 5, 2, 1]` that still puts at least three lines in view; the interval used is recorded per layer in `coverage-report.json`. |
| `frame` | `world` only: the projection's own silhouette, for an ocean neatline. |

Context is re-derived from sources the layer already depends on — nothing is downloaded, and each layer ships only the part of that context inside its own window. Two details are load-bearing:

- **The graticule stops at ±85° latitude**, so no grid line sits exactly on the pole edge; Robinson itself is finite at the poles, so context needs no polar cut.
- **The frame cannot be a lon/lat polygon.** Both sides of a Pacific-centred seam are the _same_ meridian, so such a polygon is a 0.002° sliver that mapshaper collapses; the silhouette is built from one projected seam meridian mirrored about the central meridian.

The world window is the **union of the foreground box and that silhouette**, plus two coordinate units of slack, and the graticule is cut to that window. The projection outline is therefore visible in full — the ocean neatline keeps its curved sides instead of being cut into straight vertical edges — and no basemap field overflows the viewBox it ships with.

### `viewBox` and `basemap.viewBox`

Each layer reports two windows:

- **`viewBox`** — the preferred camera: the foreground box grown by `viewBoxExtension` (10%).
- **`basemap.viewBox`** — the window the background actually covers: the smallest centred box containing the preferred window at **every canvas aspect ratio in `aspectRange` (0.75–4)**, i.e. `bgW = max(W, 4H)` and `bgH = max(H, W / 0.75)`. All background fields are clipped to it, so a canvas anywhere in that range is filled edge to edge instead of showing a narrow strip of land behind false open sea.

`world` is the one exception: its background _is_ the map, so `basemap.viewBox === viewBox` and the renderer letterboxes rather than asking for context that does not exist.

Background simplification is **graded** (`contextSimplify`), because a covered window can be several times the preferred one while the foreground must keep its scientific detail:

| Layer | `contextSimplify` | Why |
| --- | --- | --- |
| `geo:cn` | `5%` | Its declared window is a 4:1 canvas, several times the country itself. |
| `geo:cn-xx` | `35%` | Small windows do not need the extra compression, and at 5% coastlines triangulated and province borders became long straight chords. |

Both `land` and `borders` use their layer's value. The shared context is pre-cut to the union of every declared background window (recorded as `contextWindow` in `coverage-report.json`), so a layer can never declare a window wider than the context it was cut from.

## Interaction grouping

A feature may carry `navigationNodeId`: an **interaction entry only** that never replaces `nodeId`. The renderer groups shapes by `navigationNodeId ?? nodeId`, so several paths can share one `Link`, one hover, one focus and one `href`, and it reads that entry's count **once** instead of summing the shapes.

The world layer answers to a single `geo:cn` entry through six shapes:

| Shape | `nodeId` | `navigationNodeId` | Where its path comes from |
| --- | --- | --- | --- |
| `ne50m:CHN` (mainland) | `geo:cn` | — (already the entry) | the world source |
| `ne50m:TWN` (island of Taiwan) | `geo:tw` | `geo:cn` | the world source, unchanged |
| `ne50m:HKG` (Hong Kong) | `geo:hk` | `geo:cn` | the world source, unchanged |
| `ne50m:MAC` (Macao) | `geo:mo` | `geo:cn` | the world source, unchanged |
| `cnprov:100000_JD` (nine-dash inset) | `null` | `geo:cn` | copied byte for byte from `geo:cn` |
| `datav:460300` (三沙市) | `null` | `geo:cn` | copied byte for byte from `geo:cn-hi` |

The two borrowed shapes are **not new data**: the nine-dash line is the `adchar="JD"` feature of `china-province-100000-full`, and 三沙市 is adcode `460300` in `datav-460000`. Both were already projected into this same Pacific Robinson space by the layers that own them, so the world layer copies their emitted paths verbatim — nothing is redrawn or guessed from a latitude.

Both stay `nodeId: null` because the **current** location dictionary holds no matching code. That is a statement about this mapping, not a claim that the places have no public records: a dictionary revision that adds a matching code must revisit them. The world layer therefore depends transitively on those two sources; no source is fetched, added or modified outside them.

`coverage-report.json` reports the world layer's emitted `shapes` (265 source shapes + 2 borrowed = 267), with `sourceShapes` and `supplementShapes` broken out so the borrowed ones are never mistaken for source geometry.

## Resolution rules

A shape receives a `nodeId` only when the source itself asserts a code the Portal location dictionary already contains, and only when that assertion is unique. Nothing is guessed from a similar name, a neighbouring boundary, a successor administration or a historic predecessor; an unresolved shape keeps `nodeId: null` and is recorded in the audit trail.

- **World.** The first of Natural Earth's `ISO_A2` and `ISO_A2_EH` that is a dictionary key. `ISO_A2_EH` is required: Natural Earth leaves `ISO_A2` as `-99` on map units that are parts of a sovereign state (England, Madeira, Zanzibar, Réunion) and records the state code in `ISO_A2_EH`. Result: 261 of 265 shapes resolved; only Somaliland, Kosovo, Northern Cyprus and the Siachen Glacier stay null, because the source asserts no code for them.
- **Provinces.** Exact, unique Chinese name match against the `CN-*` dictionary entries. The three additional existing codes `TW`, `HK`, `MO` bind explicitly to GeoAtlas adcodes 710000, 810000, 820000. Each requires the pinned Database node to state parent `geo:cn` and the unique source feature to state its reviewed name, province level and parent adcode 100000; a failed required binding stops the build. Result: 34 of 35 shapes resolved. The build receipt records the exact Database snapshot commit and vocabulary digest; no runtime contract fetch or extra region-count request is added.
- **Prefectures.** Exact, unique Chinese name match against that province's `CN-xx-*` entries, inside that province only. Result: 317 of 333 codes resolved across 27 sublayers.

## Known exceptions

These are deliberate, and each one is recorded in `coverage-report.json`.

**Codes with no boundary (19).** Historic or renamed names that have no shape in today's boundaries: `geo:cn-ah-cah` (巢湖市, abolished 2011), `geo:cn-sd-lws` (莱芜市, merged into济南 2019), `geo:cn-hb-xfn` (襄樊市, renamed 襄阳市 2010), `geo:cn-gz-bjd` and `geo:cn-gz-trd` (毕节/铜仁 地区, now 市), `geo:cn-qh-hdd` (海东地区, now 海东市), the five 西藏 地区 codes (`geo:cn-xz-nad/nyd/qad/snd/xid`), the four 新疆 地区 codes (`geo:cn-xj-hmd/tud/ksi/tcd`), and the parenthesised `geo:cn-nm-cfs` (赤峰（乌兰哈达）市). Also `geo:bv`, `geo:gi`, `geo:um`, which have no shape in the 1:50m world source. These are **not** snapped onto their successors.

**Shapes with no node (51 source shapes).** 4 in `world` (Somaliland, Kosovo, Northern Cyprus, Siachen Glacier) and 46 in the prefecture layers, which are the 省直辖县级行政区划 and 兵团 cities (济源市, 仙桃市, 石河子市 …) plus the successor cities of the renamed 地区 above; they are drawn so their province has no holes.

In `geo:cn`, only `cnprov:100000_JD` remains without a data-node assignment. The world layer additionally carries two borrowed shapes with no raw node, described above; both use the country interaction entry.

**Dropped rings (none).** A ring that rounds to fewer than three integer points cannot be filled, so it is dropped and recorded here. The shared 400 000-unit space loses no ring at all: the two sub-resolution islets that the previous 80 000-unit space lost (one in 湖南省, one in 怀化市) now survive, as does every small island in the world layer.

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
