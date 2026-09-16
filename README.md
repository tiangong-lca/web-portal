---
title: tiangong-lca-portal
docType: guide
scope: repo
status: active
authoritative: false
owner: tiangong-lca-portal
language: zh-CN
whenToUse:
  - when entering the Portal repository
  - when checking the concise product boundary and primary implementation plan
whenToUpdate:
  - when repository purpose, non-goals, implementation status, or primary documentation changes
checkPaths:
  - README.md
  - AGENTS.md
  - docs/design-plan.md
  - package.json
lastReviewedAt: 2026-09-16
lastReviewedCommit: 188c6f127c59bc768d7d6b00d2224d8f8b3f6c5e
lastReviewedNote: "Reviewed for Portal #85 SEO Plan v2: `Dataset` JSON-LD now carries the public `generalComment` description with explicit missing/short/over-long handling (rich-result eligibility stays separate from indexability), the base sitemap lists all 32 canonical language URLs with reciprocal alternates and a same-content `x-default`, and page metadata shares the single `PORTAL_PUBLIC_INDEXING` gate with robots.txt. The new SEO regression suites are registered in the Docpact coverage map; public DTO/version, shard sitemap, CSP and permission boundaries are unchanged. Shared checker and production samples remain integration/release items."
related:
  - docs/development.md
  - docs/ui-system.md
  - AGENTS.md
  - docs/design-plan.md
---

# tiangong-lca-portal

天工 LCA 公共数据门户 —— 面向生命周期评价研究与实践的匿名、只读数据目录。

## 定位

Portal 以数据发现为首要任务：

- **搜索与浏览优先**：按名称、UUID、CAS 号、分类、对象类型、地区或来源进入公开目录。
- **使用背景完整**：记录页同时提供版本、适用范围、来源、许可、方法、质量与可用结果，缺失内容不补写或补零。
- **匿名只读**：无需注册即可使用公共查询、详情、比较、引用与本地候选清单；浏览器不持有 Supabase 或 HMAC 凭据。
- **谨慎比较**：只有现有公开字段中的功能单位、方法、地区、时间和 publication 背景满足条件时，才并列展示数值；系统边界与研究适用性仍需使用者核对，不能把字段一致当作科学审查结论。

## 技术形态

Next.js App Router 前后端同构，React Server Components 优先，部署到 EdgeOne Makers。终端用户没有登录态；EdgeOne 后端以 Portal 专用 HMAC 请求签名调用专用 Supabase Edge Functions（如 `portal_hybrid_search_v1`）。数据库读取使用 server-only 的公共只读契约，不使用 service-role；MVP 分享只使用 URL fragment 与 JSON，不写 Redis。默认浅色/深色主色与 `tiangong-lca-next` 一致，其余颜色遵循 shadcn/ui + Tailwind v4 最佳实践，并支持部署级主色、Logo 与 favicon 替换。

## 开发入口

- [开发指南](docs/development.md)：工具链与工作目录、按改动选择检查、Storybook/MCP、项目 skills 恢复与更新。
- [UI 与组件规范](docs/ui-system.md)：视觉、共享控件、四语、无障碍和隔离场景要求。
- [Agent 入口](AGENTS.md)：仓库边界、任务导航和 workspace 交付要求。

Storybook 展示真实基础组件与业务组合，支持语言、主题和视口切换。组件场景使用合成数据，开发工具独立于公众产品；新增或修改 UI 时按开发指南验证实际交互与呈现。

## 非目标（与其他项目的边界）

| 不做                                | 归属                                          |
| ----------------------------------- | --------------------------------------------- |
| 数据导入 / 转换 / 规范化生产        | tiangong-lca-cli · tiangong-lca-data-foundry  |
| 过程规范化合并的政策与人工复核队列  | 上游管线，portal 仅透明呈现聚合结果           |
| 登录体系、购买交易闭环              | 不在本项目范围                                |
| 开发者 API / GraphQL / MCP / Skills | 登录后的 tiangong-lca-next 及既有机器调用项目 |
| 桌面应用 / 文档站                   | tiangong-lca-release · tiangong-lca-next-docs |

## 文档

- [产品与技术方案](docs/design-plan.md) —— 产品、UI、权限、数据契约、SEO、EdgeOne、测试、跨仓交付与仓库 onboarding 的主方案。
- [R0 compatibility matrix](docs/r0/compatibility-matrix.md) 与 [strict CSP/ISR evidence](docs/r0/csp-isr-spike.md) —— 当前发布门及可复现的平台兼容性证据。

## 发布与来源

[兼容矩阵](docs/r0/compatibility-matrix.md)记录已验证的托管版本、运行时、发布检查和平台问题。[产品方案](docs/design-plan.md)说明当前功能与发布要求；GitHub Issue/PR 记录交付和 workspace integration 状态。仓库级 CI 与本地浏览器检查不单独证明线上发布。

公开 Database 契约的精确来源和完整性由 [manifest](contracts/database-engine/portal/manifest.json)记录；品牌与词表来源保留在各自的生成 receipt 中。
