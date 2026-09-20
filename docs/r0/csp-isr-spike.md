---
title: Portal R0 Strict CSP and ISR Compatibility Evidence
docType: validation
scope: repo
status: active
authoritative: true
owner: tiangong-lca-portal
language: en
whenToUse:
  - when evaluating strict CSP options for the Portal
  - when deciding whether the R0 CSP, RSC, Streaming, and ISR gate can reopen
whenToUpdate:
  - when Next.js changes its inline Flight delivery contract
  - when EdgeOne adds a renderer-level CSP integration
  - when the product approves a rendering or ISR boundary change
checkPaths:
  - docs/r0/csp-isr-spike.md
  - docs/r0/compatibility-matrix.md
  - next.config.ts
  - edgeone.json
  - src/app/r0-compat/**
  - tests/e2e/r0-compat.spec.ts
lastReviewedAt: 2026-09-21
lastReviewedCommit: c8c3ece4d5da9687014cdf411adcc9c99193806f
lastReviewedNote: "Reviewed for Portal #117: byte-identical GeoJSON now uses standard .json asset URLs so EdgeOne applies HTTP compression. Geometry, UI behavior, data contracts and CSP directives remain unchanged."
related:
  - compatibility-matrix.md
  - ../design-plan.md
---

# Portal R0 Strict CSP and ISR Compatibility Evidence

## Strict-profile finding

With the officially supported Next.js 16.3.3 and EdgeOne Makers/Pages surfaces, no production-supported configuration currently satisfies all of these strict-profile requirements together:

- real ISR regeneration;
- App Router and RSC hydration;
- Streaming;
- an enforcing Content Security Policy; and
- no `unsafe-inline` in `script-src`.

This remains the result of the no-inline research profile. Report-only, broken hydration, or a nonce conversion that removes ISR are not passing strict-profile results.

## Public product decision

The user explicitly selected performance and SEO for the anonymous read-only Portal. Public Production uses a separate enforcing performance profile: Next-required inline script/style is allowed, `unsafe-eval` remains forbidden, all other source/object/base/form/frame directives remain restricted, and the exact EdgeOne deployment must pass hydration, Streaming, ISR, security-header, secret and rollback gates. The current local enforcing run passes all 50 production Playwright tests without converting static/ISR routes to dynamic rendering.

The strict no-inline profile remains available through `PORTAL_EXPECT_STRICT_CSP=1` for future Next/EdgeOne rechecks. Its failure is no longer a public-launch blocker and must not be confused with the enforcing performance profile.

## Reproduction

Evidence commit: `b94451c128a0dd44c664dc6d845e649e5c4daa79`.

```bash
PORTAL_CSP_MODE=enforce \
PORTAL_EXPECT_STRICT_CSP=1 \
pnpm test:e2e -- tests/e2e/r0-compat.spec.ts tests/e2e/product-shell.spec.ts
```

The production build succeeds with Next experimental SRI. Browser enforcement then passes 13 of 19 tests and fails six hydration-dependent paths. Chromium reports two executable inline Flight blocks rejected by `script-src 'self'`. The external theme bootstrap and its generated SRI are not the failing assets.

The generated ISR document contains external chunks with SRI and two executable inline `self.__next_f.push(...)` blocks with neither nonce nor a CSP hash source. Next source locations relevant to this behavior are:

- `next/dist/server/app-render/use-flight-response.js`;
- `next/dist/server/app-render/stream-ops.node.js`; and
- `next/dist/server/app-render/get-script-nonce-from-header.js`.

## Candidate matrix

| Candidate | Result | Evidence |
| --- | --- | --- |
| Next `experimental.sri` | Fail | It protects eligible external chunks; it does not authorize executable inline Flight blocks. |
| Full-site request nonce | Fail | Hydration and Streaming work, but responses become dynamic `private, no-store`; ISR is no longer being tested. |
| Route-specific nonce | Partial | Dynamic Streaming routes pass. The ISR route remains unauthorized. |
| PPR / cache components | Fail | A cached static shell cannot receive the current request nonce. |
| Build-time or two-pass hashes | Fail | Initial prerender can pass; regenerated ISR content changes the inline Flight bytes and invalidates the hashes. |
| EdgeOne static headers | Fail | Static configuration cannot derive trusted hashes from each regenerated HTML response. |
| Generic response transform | Fail | Hashing requires buffering before headers and breaks Streaming; blind nonce/hash insertion has no trusted-script provenance. |
| External Flight loader patch | Fail | A temporary proof improved the strict suite to 16/19 but broke Streaming, 404 rendering, and request deduplication, and introduced a forgeable data-block trust boundary. |

### Route-specific nonce evidence

Two dynamic Streaming requests each attached one distinct nonce to every inline script, and the targeted strict browser test passed. Both responses were `private, no-cache, no-store, max-age=0, must-revalidate`. This proves nonce compatibility for dynamic Streaming and also proves that the route is not ISR.

### ISR hash invalidation evidence

A temporary one-second ISR probe authorized the first prerender's two inline hashes. After real regeneration changed the rendered timestamp, Chromium rejected the new Flight bytes under a different required SHA-256. A build-time hash list therefore cannot remain correct across ISR regeneration.

## Reopen conditions

Re-run this gate only when at least one of these conditions is true:

1. Next emits per-render trusted inline hash sources and atomically stores them with each ISR body and CSP header.
2. Next removes executable inline Flight/Fizz scripts and publishes production browser CSP coverage.
3. EdgeOne and Next provide a supported renderer-level CSP adapter with trusted script provenance.
4. The product explicitly approves removing ISR and serving all interactive HTML through request-nonce dynamic rendering.
5. The product explicitly approves a rendering architecture that does not depend on executable inline hydration scripts.

Any future strict-profile promotion must pass the exact enforcing browser command locally and on one immutable EdgeOne `main` Production deployment while independently proving RSC hydration, Streaming, and real ISR regeneration. It may strengthen the public policy without changing route or cache behavior; it must not regress the already released performance profile.

## Primary references

- [Next.js Content Security Policy guide](https://nextjs.org/docs/app/guides/content-security-policy)
- [Next.js issue #95354: SRI does not satisfy strict CSP](https://github.com/vercel/next.js/issues/95354)
- [Next.js documentation correction PR #96281](https://github.com/vercel/next.js/pull/96281)
- [Next.js inline integrity implementation discussion #95696](https://github.com/vercel/next.js/pull/95696)
- [EdgeOne Next.js support](https://pages.edgeone.ai/document/framework-nextjs)
- [EdgeOne middleware](https://pages.edgeone.ai/document/middleware)
- [EdgeOne configuration headers](https://pages.edgeone.ai/document/edgeone-json)
- [EdgeOne Function response body](https://edgeone.ai/document/52691)
- [EdgeOne Function TransformStream](https://edgeone.ai/document/52698)
