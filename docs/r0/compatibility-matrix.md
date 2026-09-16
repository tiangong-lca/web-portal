---
title: Portal R0 Compatibility Matrix
docType: validation
scope: repo
status: active
authoritative: true
owner: tiangong-lca-portal
language: en
whenToUse:
  - when deciding whether R0 bootstrap can exit
  - when reviewing local or EdgeOne main/Production compatibility evidence
whenToUpdate:
  - when a compatibility probe, platform result, deployment SHA, or blocker changes
checkPaths:
  - docs/r0/compatibility-matrix.md
  - edgeone.json
  - next.config.ts
  - src/app/[locale]/layout.tsx
  - src/server/routing/**
  - src/app/r0-compat/**
  - tests/e2e/r0-compat.spec.ts
  - tests/fixtures/hmac/**
lastReviewedAt: 2026-09-16
lastReviewedCommit: 188c6f127c59bc768d7d6b00d2224d8f8b3f6c5e
lastReviewedNote: "Portal #85 SEO Plan v2（B 轮，按 root 的 loopback-preview checker 收口）：公开规范来源收口到 `https://www.tiangong.earth`；production 缺失/非法 `SITE_URL` 时 fail closed，显式 loopback 取值保留给本地与 CI fixture。可选 `BAIDU_SITE_VERIFICATION` 由部署环境提供，配置时经共享 root document 元数据在四语言首页输出该标记，未配置时不输出。共享 SEO checker 以固定提交 `109ca8b2` 的 `--loopback-preview` 模式在既有 preview fixture 服务上运行：同一浏览器 job、无第二次构建、无 production fixture 切换、索引语义不变，报告以 `if: always()` 上传；提交失败仍失败该 job。apex 与 portal.tiangong.earth 的别名重定向仍由 provider/CDN 承担，Portal 不部署 Next proxy/middleware；公共 DTO、CSP、HMAC、分片 sitemap 与权限边界不变。"
related:
  - ../design-plan.md
  - ../../AGENTS.md
  - csp-isr-spike.md
---

# Portal R0 Compatibility Matrix

R0 exit requires the exact selected Portal `main` commit and EdgeOne Production deployment on `portal.tiangong.earth` to pass every non-excepted row below. The table retains the exact historical platform-qualification receipts, including public indexing and the cacheable enforcing performance CSP at `bf97795512480dc00f680521cbf36aeab113ecfe`. A real 404/noindex/unchanged-URL EdgeOne generic raw document for unknown first segments remains the accepted platform disposition. New Portal #48 release acceptance must verify the final Main marker on the canonical public origin `https://www.tiangong.earth` (with apex and `portal.tiangong.earth` redirecting to it), four-language user workflows, public-data boundaries, cache/headers and the controlled lexical payload/latency checks; historical receipts are not a substitute for that exact rollout.

| Capability | Local production evidence | EdgeOne main/Production evidence | Gate |
| --- | --- | --- | --- |
| Node 24.18 build + pnpm 11 | `check:toolchain`, frozen install, production build pass | `dpdgfqylc0dw` logs `Switching node version` to `v24.18.0`; managed SSR reports `v20.19.3`. The settings UI offers 24.18 but its API rejects it and allows only through 24.11, so the repository `.node-version`/engine-strict source remains authoritative | Pass; EdgeOne settings defect recorded |
| Next 16 / React 19 / TypeScript 7 | type-aware lint, `next typegen`, `tsc`, build pass | Exact deployment passed Next 16.3.3 without a Proxy/Middleware artifact | Pass |
| RSC/static shell | `/` and `/r0-compat` prerender | `/` is real 302 to `/zh-CN`; `/r0-compat` is 200 with native routing evidence | Pass |
| SSR runtime | `/r0-compat/ssr` reports local `process.version` | 200, `v20.19.3`, private/no-store on exact deployment | Pass |
| ISR | `/r0-compat/isr` emits `s-maxage=60` and stable cached body | Regenerated from `05:47:10.931Z` to `05:48:21.109Z`, then byte-identical hits with increasing Age | Pass |
| Streaming | Dynamic Suspense route passes under the enforcing performance CSP | 200/private/no-store; five chunks with completion marker 88 ms after initial chunks | Pass |
| EdgeOne routing | No Next Proxy/middleware artifact; native root/header contract and bounded query-preserving Route Handlers pass locally | Root/native headers and relative 307/no-store Search/Compare/Browse/Process/Flow redirects preserve ordered query values on exact `bf97795` | Pass |
| Route Handler | dynamic JSON contract, redirects and no-store pass | R0 handler reports exact `bf97795`, production, `v20.19.3`; LCIA BFF is same-origin, correlation-bound and no-store | Pass |
| Image Optimization | raster brand probe resolves through `/_next/image` locally | EdgeOne emits valid `image/webp` via native `imageMogr2` transformation | Pass |
| locale document / 404 / robots / noindex | zh-CN/en/de/fr raw HTML and hydrated DOM use exact `lang`; local invalid-locale/global 404 is branded | Exact `bf97795` returns four-locale `lang`, reciprocal hreflang, localized hydration, public robots/sitemaps and private-route noindex. Raw unknown-first-segment remains a real 404/noindex with generic `__next_error__`; Portal #28 tracks upstream repair | Pass; raw defect accepted |
| Brand defaults/assets/fallback | unit SHA receipt, env parse, production browser fallback pass | Custom `dpx9m06806fi` and exact default rollback `dpzbmb1u15np` passed color/logo/favicon/metadata/no-JS/axe/CLS/visual gates | Pass |
| HMAC WebCrypto signer | deterministic `portal-hmac-v1` fixture passes | Main current rotated with previous absent; direct current 404, replay 403, tamper/unknown/expiry 401; EdgeOne `dppeqhecdjax` BFF returns expected 200/unavailable | Pass |
| Redis NX/EX + Lua | Not owned by Portal | Production replay rejection and prior exact `portal:main:v1` TTL/namespace proof pass; guard remains fail closed | Pass |
| Deployment model | Local marker only | One `main`-tracked Production environment serves TDD/release; `PORTAL_PUBLIC_INDEXING=enabled` on exact `bf97795` after SEO/security preflight | Pass |
| Enforcing CSP + hydration + ISR | Performance profile passes all 50 production Playwright tests with enforcing CSP, Next inline script/style allowed, `unsafe-eval` forbidden, and ISR still static | Exact `bf97795` returns enforcing CSP, no report-only header, required inline allowance, no `unsafe-eval`, working theme/locale events, Streaming completion and cacheable ISR | Pass |
| Strict no-inline CSP research | Exact enforce command at `b94451c` passes 13/19; executable inline Flight blocks break hydration-dependent paths | No supported renderer-level solution; see [retained spike](csp-isr-spike.md) | Non-blocking upstream follow-up |
| Rollback/cold start/latency | Local controlled CWV remains inside budgets; production test proves repeated identical Search HTML stays private/no-store while its Search/facet public RPC receipts remain one each under the 30-second Data Cache | Rollback evidence remains `dpldjwibrtb4`/`dppeqhecdjax`. Hosted home p75: LCP 284 ms, INP 16 ms, CLS 0, TTFB 118 ms; cached detail TTFB p75 509 ms. Exact `bf97795` default Search is 355,891 bytes and therefore passes the 512 KiB payload budget; 20 controlled pre-fix samples on 2026-08-30 measured TTFB p95 2.20 s, above the 2 s gate | Search payload/local cache contract pass; exact hosted Search latency recheck open; Portal #37 RUM cancelled |

## Portal #44 version-aware discovery proof

The local production build at source `32f221bb97f243bc178c5f86bf1c231bba473a2d` passed all 52 Playwright checks, including real same-origin BFF/HMAC fixture round trips, late-result selection preservation, mobile keyboard version expansion, exact references, fallback, no-JavaScript keyword discovery, four-locale/SEO/CSP/cache boundaries, and serious/critical accessibility checks. Unit/integration proof has 163 passing tests with the explicitly credentialed Production probe still skipped. Release regressions also reject cross-group ranking drift and preserve useful lexical results/cursors when Hybrid returns empty in either response order. The client bundle scan and route budgets pass; the search route is 147,524 gzip bytes against its existing 256,000-byte bound.

These are controlled local fixture results, not a new EdgeOne frontend release or production relevance/SLA claim. Only the paired Database/Edge search increment is already live under the one-time exception in workspace #963; its exact backend readback evidence is linked from the design contract. Hosted validation of this frontend remains pending its reviewed release. No RUM collector or seven-day observation will be added.

## Portal #46 initial-state proof

Portal #46 additionally verifies the untouched/failed/successful sidebar states with three typed server-page unit tests. At code `07b6a89c369b6db6bd837b6ce7156d2f55470f0a`, the complete check passed 166 tests (one optional live probe skipped), the production build and unchanged bundle budgets; the 52-test fixture browser suite passed again. This changes only initial-state copy selection, not data calls or search results.

## Portal #48 visual and data-user workflow proof

Source `d8216506bd7f0e37b27ddfa64cd5bd3f12e4042c` passes 223 unit/integration tests (one explicitly credentialed live probe skipped), typecheck, strict lint, and all 64 fixture-backed production browser checks. The browser matrix covers zh-CN/en/de/fr, 320/390/768/1024/1440 px, light/dark, keyboard and forced colors, 200% text enlargement, header pointer hits and citation offsets, mobile filter stacking, cross-page exact-version selection, import confirmation and notes-sharing disclosure. Automated all-severity WCAG checks pass on the added visual matrix. Human screenshot review also checks alignment and clipped labels; automated viewport and text-enlargement evidence alone must not be described as real browser-zoom proof.

The existing enforcing performance CSP, SSG/ISR route classification and native routing remain unchanged. There is no new Proxy, authentication, RUM or observation period. The internal summary route remains a bounded public-only read, and the 34-file Database contract snapshot is byte-identical to promoted Main `521741a064f402c9b674583ef69a5947d1b5885f`. Location labels have a reproducible receipt from released Next `82fd0bf6b96fbeca7c178d71832b475ebbdc07f3`.

Native Edge browser zoom was separately verified on the French shortlist: the browser toolbar reported 200%, viewport width changed from 1,912 to 956 CSS px and devicePixelRatio from 2 to 4, with zero horizontal overflow and readable controls/header. This was a real browser zoom, not a font-size or device-scale simulation. The browser was restored to 100%, width 1,912 and DPR 2 after inspection.

Bundle checks pass without raising limits: home 72,263/122,880 gzip bytes, detail 71,825/184,320, Search 176,072/256,000. The private-marker scan passes. Independent read-only review found no P1; the two P2 findings (capacity misreported as a bad link, and merge preview not reflecting retained local fields) were corrected and regression-tested before this source checkpoint.

Portal #49 subsequently merged and published exact Main `91ba3c5ab49f1b92e7a4d8a1f9210f5cabba5af7`; PR and Main CI passed. Independent hosted readback confirmed the production marker and Node 20.19.3, four locale-correct enforcing-CSP homepages, real exact-version Process/Flow pages, the no-store summary helper, 403 cross-origin / 400 private-field rejection, private-route noindex and real 404. Nine real document views plus one same-document shortlist fragment view across four locales and light/dark layouts had zero horizontal overflow, page errors or WCAG findings; header z-index was 40. One network-idle wait timed out; reinspection found the page fully rendered with no outstanding requests, and the live pass used visible UI readiness with bounded network settling instead.

The release records actual performance separately from functional success: twenty lexical requests had p95 TTFB 2,155 ms and 386,046-byte HTML, so the historical 2-second target is **not** claimed met. Process Hybrid returned 20 rows in 9,850 ms and a disjoint 20-row continuation in 2,461 ms. Flow first returned explicit timeout fallback after 26,053 ms; one warm follow-up returned genuine Hybrid in 21,201 ms and a disjoint continuation in 3,632 ms. [Database #603](https://github.com/tiangong-lca/database-engine/issues/603#issuecomment-5520081063) retains this pre-existing cold-read work. No runtime budget, index, source data or performance gate was changed; the user's correctness-first acceptance and no-RUM decision remain in [workspace #963](https://github.com/tiangong-lca/workspace/issues/963).

The hosted copy review identified the remaining raw Process subtype labels, now owned by [Portal #50](https://github.com/tiangong-lca/portal/issues/50). That display-only follow-up and the final exact root integration remain required before the overall user request is closed out.

## CSP disposition

Next App Router emits inline `self.__next_f.push(...)` Flight scripts. Next SRI adds integrity to external assets but does not authorize those inline scripts; a global nonce forces dynamic rendering and disables ISR. The user selected performance and SEO over the no-inline research requirement. Public Production therefore uses an enforcing CSP that permits Next-required inline scripts/styles, forbids `unsafe-eval`, and retains strict object/base/form/frame/source restrictions. Report-only is not release proof; the exact public deployment must return the enforcing header and pass hydration, Streaming and real ISR together.

The retained strict profile is still proven with `PORTAL_CSP_MODE=enforce` and `PORTAL_EXPECT_STRICT_CSP=1`; its known hydration failures remain useful upstream evidence but no longer block the public performance profile. Public hosted proof uses `PORTAL_CSP_MODE=enforce`, `PORTAL_CSP_PROFILE=performance`, and `PORTAL_EXPECT_STRICT_CSP=0`.

The retained [strict CSP and ISR spike](csp-isr-spike.md) records the exact reproduction, released Next source boundary, failed candidate matrix, ISR regeneration evidence, and conditions required to revisit the stronger future profile.

## Raw 404 disposition

Portal #33 retested a `dynamicParams=true` application candidate. It branded nested unknown-locale paths locally but could not fix a single unknown first segment such as `/es`; fixing that remaining case requires a root-layout/route-tree migration that would sacrifice locale-correct initial HTML or the reviewed ISR boundary. The candidate was withdrawn. Public release requires true HTTP 404, `noindex`, unchanged URL/query, no 5xx, and no soft redirect; the raw EdgeOne document may remain generic until Portal #28 receives an upstream-compatible fix.

## Authoritative references

- [Next.js Content Security Policy](https://nextjs.org/docs/app/guides/content-security-policy)
- [Next.js `dynamicParams`](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#dynamicparams)
- [Next.js `NoFallbackError` diagnostic issue](https://github.com/vercel/next.js/issues/87738)
- [Next.js SRI inline Flight limitation](https://github.com/vercel/next.js/issues/95354)
- [Next.js CSP documentation correction](https://github.com/vercel/next.js/pull/96281)
- [EdgeOne `edgeone.json` redirects and headers](https://pages.edgeone.ai/document/edgeone-json)
- [EdgeOne Build Guide](https://pages.edgeone.ai/document/build-guide)
- [EdgeOne Cloud Functions](https://pages.edgeone.ai/document/cloud-functions)
