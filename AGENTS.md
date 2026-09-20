---
title: tiangong-lca-portal Repository Contract
docType: contract
scope: repo
status: active
authoritative: true
owner: tiangong-lca-portal
language: en
whenToUse:
  - when entering Portal or choosing the owner, workflow and documentation for a change
whenToUpdate:
  - when standing repository boundaries, task entrypoints or delivery requirements change
checkPaths:
  - AGENTS.md
  - README.md
  - docs/development.md
  - docs/ui-system.md
  - .docpact/config.yaml
lastReviewedAt: 2026-09-21
lastReviewedCommit: 969ed22b4d9336f850ed4fc5e96464e32e8c36a4
lastReviewedNote: "Reviewed for Portal #113: classification DTO/check routing and production MapLibre stay within Portal ownership, anonymous read-only data and the existing reviewed main/integration release policy."
related:
  - docs/development.md
  - docs/ui-system.md
  - docs/design-plan.md
  - .docpact/config.yaml
---

# Portal agent guide

Portal owns the anonymous, read-only LCA discovery UI, same-origin server adapters, branding, SEO, accessibility and EdgeOne configuration. Start with the [development workflow](docs/development.md); read the [UI standards](docs/ui-system.md) for component work and the relevant [product/technical sections](docs/design-plan.md) for feature or server behavior.

## Repository map

| Path | Responsibility |
| --- | --- |
| `src/app/` | Localized pages, root documents and same-origin Route Handlers. |
| `src/features/` | Catalog, comparison and local shortlist behavior. |
| `src/components/` | Shared primitives, shell and brand components. |
| `src/server/` | Server-only public data adapters, HMAC signing and reliability logs. |
| `src/config/`, `src/i18n/` | Validated configuration, dictionaries and receipted vocabulary. |
| `.storybook/`, `tests/` | Isolated component scenarios and product verification. |
| `contracts/database-engine/portal/` | Generated public contracts; exact source and bytes belong to its manifest. |
| `scripts/`, `docs/` | Executable tooling and task-specific guidance. |

## Standing rules

- The shared SEO checker under `scripts/vendor/workspace-seo/` is a generated snapshot of the private `tiangong-lca/workspace` repository: verify it with `python3 scripts/verify-vendored-seo.py`, update it only by re-running that repository's export, and never edit the copy.

- Keep end users anonymous. Add no login, account, user JWT or account-session persistence; explicit local shortlist and theme preferences follow the [browser-state rules](docs/design-plan.md#8-url浏览器状态与分享).
- Keep LCA data read-only and public-only. Database schema/RPC/RLS/index changes belong to `database-engine`; Edge verification/runtime changes belong to `tiangong-lca-edge-functions`. See [ownership](docs/design-plan.md#3-跨项目职责).
- The browser never calls Supabase directly. Keep database and Edge access in `src/server/` with `server-only`; Portal must not hold a Supabase secret/service-role key, global `SERVICE_API_KEY` or ordinary user credential. Sign only dedicated Portal Edge requests using the [HMAC protocol](docs/design-plan.md#103-hmac-signed-hybrid-search).
- Preserve exact dataset kinds/versions, authored values and numeric precision. Do not invent missing fields, capabilities or scientific comparability. [Feature and public-data requirements](docs/design-plan.md) own the detailed limits and behavior.
- UI text belongs to four complete dictionaries (`zh-CN`, `en`, `de`, `fr`). No cross-locale UI fallback; label source-data language fallback. Follow the [UI standards](docs/ui-system.md) for semantic tokens, keyboard/focus behavior and accessibility.
- Keep query text and private notes out of telemetry and implicit persistence. Sharing private text requires disclosure and confirmation; public identifiers remain the default. Follow the [privacy and sharing rules](docs/design-plan.md#8-url浏览器状态与分享). Do not introduce browser RUM collection or an observation period.
- Generated database contracts retain their exact bytes. Use the [snapshot checker](scripts/sync-database-contracts.mjs) and [manifest](contracts/database-engine/portal/manifest.json); never format or manually edit the snapshot.
- Treat local tests, repository delivery, workspace integration and hosted release as distinct evidence. [The compatibility matrix](docs/r0/compatibility-matrix.md) owns hosted results; [the product plan](docs/design-plan.md#17-edgeone-makers-部署) owns runtime/CSP/native-routing and release requirements.

## Start and route work

Use the checked-in [toolchain and package scripts](package.json). Resolve paths from inside Portal; [setup](docs/development.md#setup-and-repository-roots) also explains standalone checkouts and workspace delivery:

```bash
portal_root="$(git rev-parse --show-toplevel)"
portal_workspace="$(git rev-parse --show-superproject-working-tree)"
portal_docpact="${portal_workspace:-$portal_root}/scripts/docpact"
"$portal_docpact" route --root "$portal_root" --paths src/components/ui/button.tsx --format json
```

Replace the example path with the intended files, then read the returned relevant documents. [.docpact/config.yaml](.docpact/config.yaml) owns routing and coverage; package/configuration files and receipts own executable defaults and versions.

For tracked work, load the resolved workspace's root `AGENTS.md`, branch policy and delivery skill. Use its `scripts/workspace-ops` before implementation and for durable GitHub updates, submission and completion; execute the returned next command. Portal's routine branch starts from and targets `main`. Keep Portal commits separate from other repositories and root integration. A merged Portal PR still requires the workspace's exact-commit integration workflow.

## Work by task

| Task | Read/use |
| --- | --- |
| Components, styles, themes, dictionaries or stories | [UI standards](docs/ui-system.md) and [Storybook workflow](docs/development.md#storybook-and-mcp). Read `.agents/skills/storybook-stories/SKILL.md`; restore missing/outdated generated skills through the [project skills procedure](docs/development.md#project-skills). |
| Search, detail, compare, shortlist or browser state | Relevant [feature and sharing sections](docs/design-plan.md#7-页面与交互), plus UI guidance for visual changes. |
| Server, public DTOs or data access | [Data access](docs/design-plan.md#10-数据访问设计) and the exact public contract snapshot. |
| Rendering, CSP, native routing or deployment | [Deployment requirements](docs/design-plan.md#17-edgeone-makers-部署) and [hosted evidence](docs/r0/compatibility-matrix.md). |
| Tooling, documentation or governance | [Development workflow](docs/development.md#documentation-ownership-and-checks) and the relevant Docpact route. |

## Validate and hand off

Use the [local check matrix](docs/development.md#choose-local-checks) for the changed behavior. Keep required CI and release checks intact; a focused local pass does not waive them. UI work needs rendered interaction/accessibility evidence, and server/security changes need contract and negative-path evidence. Normal tests use fixtures; the explicit live probe is read-only and default-skipped.

Record the actual validation, remaining work and merge/integration state in the owning Issue/PR through the controller. Commit validated scoped work, submit it for review, and finish only after the required merge and integration evidence exists.

## Maintain these instructions

Keep standing rules short and link to their owning document. Put procedures in the development guide, UI requirements in UI standards, and feature/runtime requirements in the product plan. Keep delivery chronology and deployment receipts in their evidence records. Preserve existing obligations when relocating detail, update affected links/routes, and retain the Next-managed block below verbatim.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
