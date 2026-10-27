---
title: Portal dependency updates
docType: guide
scope: repo
status: active
authoritative: false
owner: tiangong-lca-portal
language: en
whenToUse:
  - when reviewing dependency proposals or changing monitoring configuration
whenToUpdate:
  - when monitoring scope, cadence, grouping or acceptance requirements change
checkPaths:
  - .github/dependabot.yml
  - docs/dependency-updates.md
lastReviewedAt: 2026-10-16
lastReviewedCommit: 2f77c58eb89ae64ae83a4b7d8520eadb167886bd
lastReviewedNote: "Portal #159: bounded npm/Actions discovery reuses all four existing CI jobs and preserves runtime, dependency-policy, generated-contract and hosted-release boundaries."
related:
  - development.md
  - ../AGENTS.md
---

# Dependency updates

Dependabot monitors the single root pnpm graph on Thursdays at 05:00 and GitHub Actions at 05:20, in Asia/Shanghai. Both entries use a seven-day version cooldown. The initial limits are two npm proposals and one Actions proposal. Related Next/React, Storybook/MSW, browser-testing, styling and Oxlint patch/minor updates are grouped. Package majors and other packages remain individually visible; pre-1.0 minor updates still need compatibility review. Preserve existing full-SHA Actions references when updating them.

To match the approved Node 24 LTS runtime, npm ignores `@types/node` versions `>=25.0.0` while retaining Node 24 updates; revisit this bound only with explicit approval for a future Node major.

The configuration reuses `ci.yml` unchanged. Its `static`, `browser`, `components` and `validate` jobs remain required on the supported existing events. The aggregate requires every other job to succeed. Static validation includes the full dependency audit; browser and component jobs use existing fixtures and public sentinel values, without deployment credentials. Discovery adds no job, platform, general local command or privileged bot execution.

Review the actual manifest and lockfile diff and apply the existing [local check matrix](development.md#choose-local-checks). Keep Next and `@next/env` aligned, the React/Storybook peer graph compatible, and `@types/node` on the reviewed Node 24 line. Preserve `scripts/pnpm-hooks.cjs`, its exact docgen package matches and private TS 6 boundary, the application TS 7 compiler, pnpm overrides, optional dependency/build policy and exact release-age exceptions. A proposal that outgrows those contracts needs explicit compatibility work; do not bypass a hook or broaden an override merely to make installation pass.

The existing audit still fails on high or critical advisories. Retain licence, generated Database/SEO contract bytes, map/worker receipts, bundle budgets and the applicable browser/component checks. Renderer changes may additionally need the existing separately gated WebGL evidence; ordinary CI does not establish it. Monitoring does not regenerate assets, change UI or scientific contracts, or grant deployment authority.

Lock-only resolution maintenance requires the development workflow and this guide to exist, without manufactured documentation metadata edits. Human review of the resolved graph and existing checks remain required. Manifests, runtime selectors, pnpm policy, hooks, source and mixed changes retain their separate semantic documentation requirements.

Configuration activates from `main`. Inspect the first actual updater run and candidate lockfile, and verify dependency graph/security settings separately. A merged configuration, an absent proposal or a local pass is not updater-success evidence. Keep the current Node selectors unless observed updater/runtime evidence justifies a separately qualified change. Security triage remains separate from the weekly version queue and cooldown.

Automatic merging is disabled for this rollout. Accept reviewed same-repository proposals through the workspace controller's existing-PR preview and bound continuation, preserving useful proposal context and direct Issue ownership. Do not create a duplicate PR to work around intake. Before association, establish that any independent merger is disabled or enforces a live Dependabot exclusion, including queued work; native GitHub merge state alone is insufficient. Repository delivery, exact workspace integration and hosted release remain separate.

Reference: [Dependabot options](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).
