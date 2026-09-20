---
lastReviewedAt: 2026-09-20
lastReviewedCommit: 64daa3c8c117ce077ad2c1977193629228a9f0f0
title: Portal development workflow
docType: guide
scope: repo
status: active
authoritative: true
owner: tiangong-lca-portal
language: en
lastReviewedNote: "Reviewed for Portal #103: compact control grouping, responsive regional map insets and genuine delayed navigation feedback preserve four-locale, no-JavaScript, privacy, count and public-data boundaries. Twelve page families were visually audited; source delivery and final hosted readback remain tracked in the PR."
whenToUse:
  - when setting up Portal, choosing local checks, or using Storybook MCP and project skills
  - when changing repository tooling or documentation governance
whenToUpdate:
  - when setup, local validation, component tooling, or documentation ownership changes
checkPaths:
  - docs/development.md
  - AGENTS.md
  - README.md
  - .docpact/config.yaml
  - package.json
  - skills-lock.json
  - .storybook/**
  - scripts/**
  - .github/workflows/**
related:
  - AGENTS.md
  - docs/ui-system.md
  - .docpact/config.yaml
---

# Portal development workflow

## Setup and repository roots

Use the Node version in [.node-version](../.node-version) and the package manager and engines in [package.json](../package.json). [The toolchain check](../scripts/validate-build-toolchain.mjs) owns executable version validation. Run package commands from the Portal repository root:

```bash
pnpm check:toolchain
pnpm install --frozen-lockfile
pnpm dev
```

Resolve paths from inside the Portal checkout. In a workspace submodule, use the workspace Docpact wrapper; an independent checkout uses the repository's own wrapper:

```bash
portal_root="$(git rev-parse --show-toplevel)"
portal_workspace="$(git rev-parse --show-superproject-working-tree)"
portal_docpact="${portal_workspace:-$portal_root}/scripts/docpact"
"$portal_docpact" route --root "$portal_root" --paths src/components/ui/button.tsx --format json
```

Replace the example input with the paths being changed. These variables are reused in the checks below. An independent checkout can run local development and Docpact without a workspace. For tracked delivery, locate the configured workspace and read its root `AGENTS.md`, branch policy and delivery skill; the standalone Portal repository does not contain the workspace controller.

Use that workspace's `scripts/workspace-ops` for task creation/start, durable updates, PR submission and completion. Follow each returned next command. Keep implementation in Portal; its `main` PR must merge before a separate root task can integrate the exact eligible commit. Hosted release acceptance is a separate responsibility described by the [product plan](design-plan.md#17-edgeone-makers-部署).

## Choose local checks

Run the checks that demonstrate the changed behavior before committing or pushing. A passing check remains evidence for an unchanged diff; repeat it when code, inputs or relevant configuration change, or when investigating a failure. Use the scripts in [package.json](../package.json), and record the actual commands and results in the PR.

| Change | Local evidence |
| --- | --- |
| Documentation only | Format the touched Markdown/YAML, verify changed links and command examples, and run Docpact on the explicit changed paths. Product compilation and browser tests are unnecessary unless the edit changes an executable example or a runtime requirement. |
| Documentation routing | Add strict config, `doctor`, `coverage`, and representative `route` checks. Confirm both focused routes and retained security/deployment obligations. |
| Shared UI, styles or stories | Formatting, lint, typecheck and relevant behavior tests; `pnpm build:storybook`, `pnpm test:storybook`, and rendered keyboard/accessibility/theme/viewport review. Check affected product flows with `pnpm test:e2e -- <spec>` when the component participates in page behavior. |
| Pages, navigation or feature behavior | Formatting, lint, typecheck, relevant unit/integration tests, `pnpm build`, and the affected production browser specifications. Check all affected dictionaries and responsive states. |
| Server, DTO or security behavior | Relevant contract and negative-path tests, typecheck, build and the applicable production integration/browser checks. Include `pnpm check:database-contracts` when consuming the generated snapshot. |
| Dependencies, runtime/build configuration or deployment | Frozen install and affected tooling/build checks. Read the [runtime/deployment plan](design-plan.md#17-edgeone-makers-部署) and [compatibility matrix](r0/compatibility-matrix.md) when the change affects hosted behavior. |

`pnpm check` is the aggregate static, unit, build and bundle command when the change warrants that breadth. [CI](../.github/workflows/ci.yml) retains the complete required checks on PRs and `main`, including production browser and Storybook checks. If an expected event produces no run, its manual trigger can run the same complete workflow on the reviewed branch; verify the run's exact head before treating it as evidence. Focused local verification does not waive CI or the [release acceptance requirements](design-plan.md#194-发布门).

Unit tests rendering shared localized client components must use `NextIntlClientProvider` with the test locale dictionary. Production browser checks open the shortlist add disclosure and filter drawer before interacting with their controls. For constrained local machines, use `--workers=2` for the multi-locale UI suite.

Normal tests use fixtures and never contact Production. The read-only live probe is explicitly enabled with `PORTAL_LIVE_PROBE=true`; missing live credentials must remain a reported skip, not an inferred production pass.

## Storybook and MCP

Read the [UI standards](ui-system.md) before changing components. Storybook runs production components against synthetic data; the guide owns fixture, accessibility and visual review requirements.

```bash
pnpm storybook
pnpm build:storybook
pnpm exec playwright install chromium
pnpm test:storybook
```

Reuse a running server only after confirming it serves this Portal checkout. The repository script binds loopback port 6006 and fails if that exact port is occupied. Keep a server used for the delivered review available for the user. Static output is `storybook-static/`; it does not provide the development/test MCP endpoint or become an EdgeOne artifact.

Once the server is running, connect the local agent:

```bash
codex mcp add portal_storybook --url http://localhost:6006/mcp
codex mcp get portal_storybook
```

The connection is machine-local. If the current agent session has not loaded MCP tools, use the installed CLI from the same Portal directory:

```bash
STORYBOOK_FEATURE_AI_CLI=1 pnpm exec storybook ai --help
```

Read the current top-level and selected command help before forming payloads. Discover component documentation, inspect actual props/source, edit the component and stories, find affected stories, run interaction tests with accessibility enabled, then present a curated review. Use returned story IDs and review links. The installed CLI/MCP help owns current tool names and payloads.

Use existing pnpm scripts and `pnpm exec` for installed binaries when an upstream skill shows generic `npm` or `npx` examples. Do not initialize an existing Storybook or upgrade dependencies as a side effect of ordinary UI work. Permission requests follow the active environment and existing user authorization; a generic skill's sandbox guidance does not override them.

If MCP is unavailable, use the CLI. If that interface is also unavailable, continue applicable checks through repository scripts and inspect the rendered Storybook or product UI in the browser; report the unavailable review interface. A passing build alone does not prove visual quality or replace interaction/accessibility checks.

Portal-based interaction checks query the current dialog inside their bounded visibility wait. Locale/viewport changes and opening animations can replace or temporarily hide portal content; keep the actual control/text visibility assertions and avoid retaining an early dialog element across that transition.

`Catalog/Pagination` covers the first-page, middle-page and mobile dark last-page states of the shared keyword/browse pager. Keep `Catalog/Progressive search` as the control for the separate additive “load more” behavior, so a pagination style change does not silently move or stretch that single action.

The brand homepage and isolated catalog references import locked Fontsource variable-font build dependencies. Next and Vite emit their Unicode-range assets locally; only the homepage adopts the new font scope in production. The `@font-face` definitions themselves are owned by `src/app/globals.css` alone, which every product layout and the Storybook preview load: component, feature and shell CSS must not import the fontsource packages again, because each entry CSS would otherwise carry its own copy of the same 108 blocks. The emitted build therefore contains one 98,365-byte font payload instead of five identical copies. The matching upstream OFL notices are retained in `.storybook/public/fonts/` and `public/brand/fonts/`; both preview and production distributions retain them. When updating these fonts, refresh their notices from the reviewed packages and verify the dependency license check, emitted assets and rendered Chinese/Latin metrics.

### Team content and portraits

`src/features/team/team-data.ts` is the Portal-owned snapshot of the public TianGong Wix Team page. Keep people in the source page's rendered reading order: top to bottom and left to right within each row. Do not use Wix repeater DOM order because Wix stores the three visual columns independently. Production Team and Storybook import this one array. The Team page remains the complete source-ordered roster, while the approved ensemble stays available as an isolated Storybook design asset.

Portraits live in `public/team/portraits/` as optimized WebP files and do not depend on Wix at runtime. `public/team/NOTICE.txt` retains the source page, Wix site ID, retrieval date and original media identifiers. When the Wix page changes, re-read the rendered page, update data and images together, preserve the notice, then review the Team page and ensemble stories in light, dark, mobile and reduced-motion modes.

`src/features/team/community-data.ts` is the corresponding checked-in snapshot for the public Wix Domain Experts and Contributors collections plus the partner institution workbook. Preserve Wix ordering for the first two arrays and workbook row ordering for institutions. The source workbook contains private contact and operational columns; only institution names and matching Logo attachments are allowed into Portal. Expert portraits and partner marks live under `public/community/`, and `public/community/NOTICE.txt` records their source boundary. Reconcile data and assets together when Wix or the workbook changes, then run the `Brand/Community` and `Brand/Team` stories in light, dark and mobile modes. The disclosure interaction must still expose the complete lists to keyboard and assistive technology users.

### Brand sculpture assets

The accepted lifecycle renderer lives in `src/components/brand/lifecycle/` and is retained by the standalone `Brand Explorations/Lifecycle Sculpture` stories. `.storybook/brand-exploration/` retains modeling tools, the editable Blender source and reference comparisons. The assembly and focused part stories share the actual glass, node network, energy, factory, product and map-cell geometry. Optical materials, studio lighting, hover response and color transitions are computed at runtime. Reference PNGs are only used by `ReferenceComparison`; never use them as scene textures or an image underlay.

`.storybook/brand-exploration/modeling/build_models.py` owns the energy, factory and product authoring functions. Regenerate the editable `.blend` source and the optimized, texture-free GLB with Blender 5.1:

```bash
blender --background --python-exit-code 1 --python .storybook/brand-exploration/modeling/build_models.py
```

The authoring file retains individual equipment parts; the GLB merges meshes by material within each model group and preserves the animated turbine rotors. Model groups retain their base footprints as metadata for analytic contact shading, which is computed by a shader without a baked shadow image. `src/components/brand/lifecycle/components/` owns the shared optical primitives, per-layer junction graph and procedural components. Asset provenance is retained in the asset `NOTICE.txt`.

Energy and factory structural materials use optical transmission against the study's theme background; keep the renderer background synchronized when changing themes. Factory enclosure panes use alpha blending to retain visibility of nested translucent frames and services, which the renderer's opaque-only transmission pass would omit. Their four-sided glazing, thin floors and piers, internal service panels and shared equipment decks remain editable geometry. Factory edge and façade finishes are calibrated separately for each theme. Product clearcoat and area lights preserve the shaded faces instead of flattening them into bright reflections. Thin cylinder geometry gives the network connections a stable physical width on high-density displays, including the connections within each layer. The network has stronger core links and lighter peripheral connections. Node materials add a continuous rim from the surface normal and view direction, while limiting fragmented environment highlights.

The world-map component uses 810 authored solid cells in `src/components/brand/lifecycle/map-points.json`. Their positions follow the selected board's decorative motif, rather than a cartographic lattice. `modeling/trace_map.py` locates cell centers inside authored regions of the light reference, validates the source checksum, and projects the centers onto the real lower platform. The offline authoring script requires Python 3 and Pillow; regenerate with `python3 .storybook/brand-exploration/modeling/trace_map.py`, then format the JSON with the repository's Prettier command. Its calibration follows the assembly camera, layer compensation and comparison crop; refit these together if the composition changes. Marks that would overhang the plate are excluded.

Only model-space positions and cell sizes enter the runtime. All cells share one instanced mesh, so their solid faces and foreshortening follow the platform under pointer movement and in the focused map view. This artistic motif is not a dataset coverage claim or a geographic projection for measurement. Dispose the instanced mesh as well as its geometry and material so Three.js releases the instance matrix and color buffers.

`components/layer-junctions.ts` owns the per-layer node positions, sizes and weighted connections. Suspended junctions continue through the product layer's side columns, while the central connection passes behind the appliance before meeting its display grid. The map's central terminal is a horizontal torus on a raised stem, with a small anchor on the map plane. Moving light traces choose from each layer's authored connections instead of assuming matching node indexes. These shapes share the ordinary hover, palette, motion and disposal lifecycle.

The assembly camera uses a shallow perspective calibrated against the visible platform edges in the reference. Keep the camera distance, elevation and layer spacing together: changing elevation alone can match one layer while changing the depth of the other four. Focused part cameras remain independent. Platforms overlap in projection. Their surfaces, cut edges and outlines are clipped by the upper platform's camera volume so the lower rear corner stays behind it. This clipping follows the actual animated geometry and camera; it does not hide the translucent network or require a screen-space mask image.

Glass sheen rises toward the front corner, with per-layer dark gains and a separate display-plinth finish. The dark ground glow and light ground shadow use independent color, opacity and placement. Calibrate these across the complete assembly as well as the focused glass story; a brighter isolated surface alone does not establish the correct overlap or ground depth.

Finite area lights shape the product's metallic highlights. Equipment and network reflections use mirrored cameras and live geometry, including animated child transforms. Each visible reflected layer has one target capped at 768 pixels on its longer edge; the assembly uses four targets and focused part views render only their own reflection. Network reflections use a narrower blur than equipment reflections, and exclude view-facing glow sprites. The product's display plinth meets the outer platform's front corner, with its own light/dark sheen and small grid junctions. These passes share the existing animation loop and stop with it. Reflection clones share the mounted scene's geometry and materials, while their render targets are disposed separately before the owning scene is released.

The original light/dark boards are served from `.storybook/public/brand-exploration/`. `artwork.json` owns their dimensions, comparison crop, source paths and SHA-256 receipts. Keep those values and asset notices synchronized when deliberately replacing a selected reference. The public model lives at `public/brand/lifecycle/lifecycle-models.glb`; production and Storybook serve the same bytes. Three.js is an exact runtime dependency. Reference boards are never included in production assets or renderer requests. Authoring scripts write the GLB and map JSON to these production-owned paths, while keeping the editable `.blend` under Storybook.

Review individual parts at full size before reviewing the combined composition in both themes. Also verify independent color modes, desktop/mobile layout, pointer response, keyboard/touch activation, pause/reduced motion and failure recovery. Story loaders prepare an independent model template before mounting. Rendering starts when the complete geometry is ready, avoiding the cost of compiling an intermediate scene during loading. A prepared template still draws its first real geometry frame synchronously so Storybook’s frozen review thumbnails do not capture a loading placeholder. Canvas resizing also repaints immediately because resizing clears the WebGL buffer while the embedded preview may already have frozen animation callbacks. Pixel ratio follows the display between 1x and 2x; 1x displays do not incur forced supersampling. Short windows keep the whole sculpture within the viewport; `CompactViewport` covers this layout. Standalone mounts retain asynchronous loading and failure recovery. Motion tests observe actual frame progression and wait for the main-thread adapter's `data-render-pending="false"` signal before verifying that drawing stops. This signal tracks the render queue, including GPU-fence polling; a color-transition deadline or a quiet frame counter alone cannot prove that queued work has finished. Reduced-motion color changes also wait for this signal and must produce a new frame before remaining static. Resuming motion uses a bounded wait for a new rendered frame, including under software WebGL. Pre-optimizing the imported Three.js modules prevents dependency discovery from reloading a running browser test. Passing checks does not establish user visual acceptance; record fidelity differences and acceptance in the delivery Issue.

Palette interpolation follows elapsed wall time. Pausing retains the existing color-transition deadline, and the renderer checks that deadline after drawing before scheduling another frame. This keeps slow software-rendered frames from extending the paused animation queue.

Animation frames poll the previous GPU submission with a zero-timeout WebGL fence before submitting more drawing. This bounds software-rendering backlog without blocking JavaScript or reducing model, material or reflection quality. Initial rendering and frozen-preview resizing still draw synchronously, and disposal deletes the outstanding fence.

Ordinary local Storybook tests run at most two files concurrently in `vitest.config.ts`. CI remains sequential with one worker: the hosted two-worker experiment failed cinematic-frame and visibility assertions, despite the successful local comparison. The local speedup does not establish a CI or Windows performance guarantee. The explicit `PORTAL_WEBGL_TESTS=1` lane stays sequential with one worker in every environment. `PORTAL_STORYBOOK_SOFTWARE_WEBGL=1` selects the renderer without selecting the WebGL lane or disabling ordinary local parallelism. `tests/unit/storybook-lanes.test.ts` resolves the actual Vitest configuration to verify these boundaries. The Playwright provider uses `channel: "chromium"` for Chromium's current headless mode, which follows the full browser's rendering path. The existing `playwright install chromium` setup installs this browser in local development and CI. Its 30-second test deadline includes cold shader compilation and the complete interaction flow. Keep bounded waits for observable motion and pause checks; the deadline does not replace a rendered performance check or affect the unit-test runner.

`vitest.config.ts` exports shared launch options for the runner and CI's renderer probe. CI explicitly selects [Chromium's SwiftShader OpenGL driver](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md) for GPU-less hosts and logs the actual browser/WebGL identity. Reproduce that path locally with `PORTAL_STORYBOOK_SOFTWARE_WEBGL=1 pnpm test:storybook`. The flag affects the component test browser only; local previews keep their normal rendering path.

### Production homepage

`src/app/[locale]/page.tsx` loads the existing public summary and renders `BrandHome`. Its search form and all links remain server-rendered. The first section is the `ScrollCinematicHero` client island in every supported locale; the former lifecycle sculpture is no longer part of the production homepage.

The cinematic hero scrubs 226 same-origin WebP frames from `public/brand/cinematic-v4/`. The first frame is requested eagerly and decoded before the loading curtain fades. The remaining frames are on demand: nothing else is fetched on entry, and after the reader stops scrolling the component warms at most the two adjacent frames with low fetch priority and asynchronous decoding. Reduced-motion readers preload no further frames at all. Measured Core Web Vitals for the current deployment, including its frame loading, remain the pre-change baseline until this work is deployed; this paragraph describes behaviour, not a performance result. Two image buffers swap only after a requested frame has decoded, which prevents blank flashes while the user scrolls. The media surface fills the available width, preserves the 16:9 source, and extends missing height with a blurred ambient copy so narrow and tall viewports do not expose hard side boundaries or empty bands.

The sequence is sticky directly beneath the measured site header and its visible height is `viewport - header`. Scroll progress controls the image frames only: all three localized text scenes occupy the same fixed content position and crossfade without translating. The first wheel or touch movement advances the sequence immediately. Reduced-motion mode keeps a representative static frame and exposes the same text and contrast treatment without scroll animation.

`Brand/Homepage` covers four languages, both themes, mobile and panoramic layouts, loading, reduced motion and missing summary. Keep the standalone lifecycle sculpture stories working as an independent visual study; they no longer describe the production route. Verify the actual frame requests, image-transfer cost, accessibility, production browser behavior and the existing bundle/Core Web Vitals budgets. The homepage remains usable when animation is unavailable, and hosted performance/CSP evidence belongs to the exact deployed commit rather than a local Storybook pass.

## Project skills

For component work, read `.agents/skills/storybook-stories/SKILL.md`. Restore the generated skills when missing or when their committed lock changes, rather than reinstalling for every component edit:

```bash
pnpm skills:install
```

[skills-lock.json](../skills-lock.json) records the upstream commits, paths and hashes; [pnpm-lock.yaml](../pnpm-lock.yaml) locks the Skills CLI. Installation requires Git and GitHub network access. [The installer](../scripts/install-skills.mjs) restores into a temporary directory, verifies all original hashes, then installs `.agents/skills/storybook-{init,setup,stories,upgrade}/` with project names, cross references, LICENSE and UPSTREAM.md. The generated directories remain ignored; normal dependency installation, builds and CI do not download skills.

Restoration preserves the committed lock and existing skills on failure. Successful restoration replaces local edits in the four managed directories and preserves unrelated skills. Make persistent adaptations in the installer, not in generated files. [The license copy](../scripts/licenses/storybook-mcp.txt) and the lock retain upstream provenance.

For an intentional upstream update, review the source and license, then use its full commit SHA:

```bash
pnpm skills:update <40-character-storybook-commit-sha>
git diff -- skills-lock.json
```

The update command verifies the new installation before writing the lock. Commit the reviewed lock so other contributors can restore it. Update the Skills CLI itself with an exact reviewed dev dependency and commit the resulting package/lock changes. Recheck restoration after changes to the CLI, installer, source lock or license.

## Documentation ownership and checks

Keep provider-issued site ownership files byte-identical to the downloaded proof. The canonical www Baidu file in `public/baidu_verify_codeva-TdxNc4b0Uq.html` has one exact `.prettierignore` entry so formatting does not alter its contents. Verify its production URL returns the file directly with status 200; verification acceptance is a separate provider-side check.

| Source | Owns |
| --- | --- |
| [AGENTS.md](../AGENTS.md) | Standing repository rules, orientation and task entrypoints. |
| This guide | Setup, local validation, Storybook/MCP/skills procedures and documentation workflow. |
| [UI standards](ui-system.md) | Shared visual, component, localization and isolated-review requirements. |
| [Product and technical plan](design-plan.md) | Feature behavior, data access, privacy, rendering and deployment requirements. |
| [Compatibility matrix](r0/compatibility-matrix.md) and [CSP/ISR evidence](r0/csp-isr-spike.md) | Hosted verification, retained platform defects and release evidence. |
| [.docpact/config.yaml](../.docpact/config.yaml) | Machine-readable ownership, routing, coverage and review obligations. |
| Package/configuration files, generated manifests and receipts | Executable versions, defaults, source commits and byte identities. |
| GitHub Issues and PRs | Delivery scope, decisions, validation, blockers and integration state. |

State current rules in their owning document and link there from summaries. Keep deployment IDs, resolved incidents and delivery chronology out of the standing agent instructions. Move still-useful evidence to its existing evidence record; remove obsolete narrative. Preserve meaningful behavior, limits and exceptions when condensing. Keep Next's marked block in `AGENTS.md` exactly as its installed generator writes it.

After editing, choose one explicit lint input (`--files`, `--staged`, `--worktree`, or a commit comparison). For example, after changing this guide:

```bash
"$portal_docpact" validate-config --root "$portal_root" --strict --format json
"$portal_docpact" lint --root "$portal_root" --files docs/development.md --mode enforce --format json --output /tmp/portal-docpact-review.json
```

For routing changes, also run `list-rules`, `doctor`, `coverage` and `route` with the same explicit root. Use the smallest relevant documents; a component-only change should not require hosted compatibility evidence. Inspect any uncovered path or diagnostic before changing rules. Use `review mark` only after the associated review is complete, then repeat lint with the same input. [The pre-push gate](../scripts/docpact-gate.sh) validates committed changes against `origin/main`; [the manual documentation workflow](../.github/workflows/ai-doc-lint.yml) runs the same gate in GitHub.

## CI validation boundaries

The static, production browser and Storybook jobs run independently; the required `validate` job succeeds only when all three succeed. New commits cancel superseded runs. Production Playwright uses two workers and one retry in CI. Storybook owns the full component theme, locale and viewport matrix; production UI smoke covers one desktop light and one mobile dark layout while retaining routing, SSR/no-JavaScript, BFF, private sharing, CSP, numeric identity and performance checks. Browser failures must be fixed, not bypassed by reducing assertions or removing security gates.

The static CI gate sets `SITE_URL=http://localhost:3000` explicitly for its production-mode fixture build. The browser lane uses the existing runner origin and a nonproduction Baidu marker, so neither lane needs deployment secrets or repository variables to prove its metadata contract.

### SEO evidence lane

`pnpm test:e2e` runs the shared SEO checker and the ownership-marker proof against the fixture-backed server the runner already builds, so the lane adds no second build, no extra runtime and no indexing change. Both specs skip themselves unless their environment is present, and the production smoke keeps running separately.

The checker is a **generated public snapshot**. Its authoritative source is `tiangong-lca/workspace`, which is private, so this repository consumes an exported copy at [`scripts/vendor/workspace-seo/`](../scripts/vendor/workspace-seo/) instead of checking the workspace out. The export carries a manifest (`schema`, `source_repository`, `source_commit`, `source_path`, `sha256`) and the snapshot is verified two ways:

```bash
python3 scripts/verify-vendored-seo.py   # standard library, also run as a CI step
```

`tests/unit/vendored-seo.test.ts` repeats the digest and identity checks with `node:crypto`, and `.gitattributes` pins the vendored files to LF so the digest cannot drift with a developer's platform. The vendored bytes are **read-only**: update them only by re-running the workspace export (`scripts/seo/export.py`) and committing its output, never by editing the copy. A local digest match proves the committed bytes are intact; it is **not** origin proof, which only the private integration job can give by hashing the Git blob at the recorded commit.

| Variable | Contract |
| --- | --- |
| `SITE_URL` | Public origin. Production must set it; a missing or non-origin value fails closed, while an explicit loopback value stays valid for local and CI fixtures |
| `BAIDU_SITE_VERIFICATION` | Optional public ownership code; the marker spec asserts it verbatim on all four locale homes, and asserts no marker when unset |
| `PORTAL_SEO_EVIDENCE` | `1` enables the marker spec |
| `SEO_CHECKER_PATH` | Path to the vendored checker; enables the checker spec |

The checker runs in its `--loopback-preview` mode with explicit sitemap paths:

```bash
python3 scripts/vendor/workspace-seo/check.py --origin http://127.0.0.1:4317 --loopback-preview \
  --sitemap /sitemap.xml --sitemap /catalog-process-sitemap.xml \
  --sitemap /catalog-flow-sitemap.xml --sample 12 --output /tmp/portal-preview-seo.json
```

That mode is accepted only for loopback origins without an artifact root, requires those explicit sitemap paths, asserts `Disallow` and per-page `noindex`, and labels the report `loopback-preview`; it cannot downgrade a public-host production check. CI verifies the snapshot, runs the lane inside the existing browser job, and uploads the report with `if: always()`, so failures still fail the job while leaving evidence.

### Optional WebGL verification

Ordinary CI skips the `webgl`-tagged lifecycle/brand-home stories and the homepage WebGL CWV sampler; the skipped tests must not be reported as WebGL acceptance. Other Storybook tests, real-page homepage navigation/accessibility/no-JavaScript smoke, and non-WebGL performance checks remain required. Rendering readiness, color/mouse interactions and GPU-dependent performance belong to the manually dispatched `WebGL manual verification` workflow. Locally, set `PORTAL_WEBGL_TESTS=1` and run `pnpm test:storybook` for only tagged stories, or `pnpm test:e2e -- --grep "home stays inside the local Core Web Vitals guard"` for homepage performance. Run these when reviewing sculpture/renderer changes; a manual run can fail without changing ordinary PR status.

### Hierarchical catalog and map assets

Run `pnpm check:maps` after changing `scripts/maps/**`, the geography dictionary or generated map assets. It verifies offline regeneration, source receipts, content hashes and the per-layer 150 KiB gzip budget. `mapshaper` is a pinned build-only dependency. The unused, lazily loaded GeoPackage plugin is removed through a scoped pnpm override, avoiding its legacy image parser and native SQLite stack; this pipeline supports only GeoJSON input and SVG-path output. The ZIP reader is pinned to patched `adm-zip` 0.6.1 for GHSA-7q85-xj36-vmfc. Optional native acceleration builds remain disabled. Re-run the supply-chain audit and byte-identical map regeneration after changing these overrides. Use `node scripts/maps/build-region-maps.mjs --fetch` only for an intentional reviewed upstream refresh. Runtime assets must stay layer-separated and the browser must never fetch raw sources.

Navigation and Search/Facets V3 changes additionally require the generated Database snapshot check, `catalog-navigation.test.ts`, the production navigation journeys and the `Catalog/Hierarchical navigation` Storybook scenarios. Preserve V2/Hybrid regression checks and four-locale dictionary parity.

### Portrait composition studio

`Brand/Team Ensemble/Composition Studio` is a local Storybook-only editor. Drag face handles or use the Person, Depth, X, Bottom, Size and Layer controls; arrow keys nudge the selected portrait. Undo restores the previous edit. Desktop and mobile previews share the same 16:9 composition; the toggle only changes preview width. Crop top/right/bottom/left controls trim the image bounds in percentages without rescaling the face or editing the source file; opposite edges cannot exceed 99% in total. Crop settings scale with the fixed composition. Keep exposed silhouettes intact and hide straight crop edges behind overlapping portraits. Export layout reveals JSON for `src/features/team/team-ensemble-layout.json`; export does not write to disk. Preview enables the real profile interactions. This editor is not imported by public routes. Visual review must assess gaps and source-image crop edges as well as face visibility; passing interaction tests does not approve the composition.

Geographic explorer changes require the pending-navigation, history, mobile map persistence, map failure and no-JavaScript zero-region journeys in `tests/e2e/catalog-navigation.spec.ts`. The Pacific-centered world uses Robinson at 150°E with an offline projection seam at 30°W; geometry regression tests check orientation and seam rings, while `check:maps` verifies receipts and unchanged reproducible layers. Selection is local, and drilldown uses the existing RSC navigation with no bulk prefetch or extra data endpoint.

The control-layout audit uses `tests/e2e/control-layout.spec.ts` for twelve page families at desktop/mobile widths, regional map insets, effective 200% reflow, slow links/search and feedback after a filter drawer closes. `ui-navigation-feedback.test.tsx` covers the 150ms delay, cancellation and concurrent/unmounted operations. Shared feedback uses Next's `useLinkStatus` and real transitions; keep native href/GET behavior and reduced-motion tests. Use the Storybook navigation-feedback and region-controls scenarios alongside detail, shortlist and comparison consumers for visual review.
