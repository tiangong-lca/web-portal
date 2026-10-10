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
lastReviewedAt: 2026-10-10
lastReviewedCommit: 24a39abcf8e830bd5c23288f144d4b4566fc07ff
lastReviewedNote: "Portal #139: reviewed exact Database contract snapshot, deployment-scope parser and routing; approved display policy is documented, with live cutover still pending."
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

- **数据库使用入口**：`/:locale/lca-database` 介绍记录种类、数据选择、版本引用与获取条件，并连接使用文档、TIDAS、PCR 和 ILCD 分发节点。
- **搜索与浏览优先**：按名称、UUID、CAS 号、分类、对象类型、地区或来源进入公开目录。
- **使用背景完整**：记录页同时提供版本、适用范围、来源、许可、方法、质量与可用结果，缺失内容不补写或补零。
- **匿名只读**：无需注册即可使用公共查询、详情、比较、引用与本地候选清单；浏览器不持有 Supabase 或 HMAC 凭据。
- **谨慎比较**：只有现有公开字段中的功能单位、方法、地区、时间和 publication 背景满足条件时，才并列展示数值；系统边界与研究适用性仍需使用者核对，不能把字段一致当作科学审查结论。

## 技术形态

旧中文首页的两个精确入口由 `edge-functions/zh/index.ts` 处理永久跳转，保留查询参数。构建与实际托管路由验收遵循 [开发流程](docs/development.md) 和 [部署兼容性契约](docs/r0/compatibility-matrix.md)。

Next.js App Router 前后端同构，React Server Components 优先，部署到 EdgeOne Makers。终端用户没有登录态；EdgeOne 后端以 Portal 专用 HMAC 请求签名调用专用 Supabase Edge Functions（如 `portal_hybrid_search_v1`）。数据库读取使用 server-only 的公共只读契约，不使用 service-role；MVP 分享只使用 URL fragment 与 JSON，不写 Redis。默认浅色/深色主色与 `tiangong-lca-next` 一致，其余颜色遵循 shadcn/ui + Tailwind v4 最佳实践，并支持部署级主色、Logo 与 favicon 替换。

## 开发入口

同一代码库支持 `tiangong` 和 `atlas` 两套独立展示层。构建前设置 `PORTAL_BRAND=atlas` 即可选择 Atlas 的 Logo、首页、导航、目录卡片和详情布局；默认仍为 TianGong。两者共享四语路由、公开数据契约与业务操作，可将同一提交分别构建部署。详细边界和部署环境覆盖规则见下列开发指南与 UI 规范。

在 `web-portal` 项目目录中，使用 [.node-version](.node-version) 指定的 Node 版本并安装依赖。启动前，在项目根目录的 `.env.local` 中填写现有后端的连接配置（示例值需要替换）：

```dotenv
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_<your-key>
```

这两项用于公开目录、关键词搜索与记录读取，两套 UI 共用同一配置。`.env.example` 只是模板，不会自动加载；只设置品牌变量可以显示页面，但无法加载搜索数据。`.env.local` 已被 Git 忽略，不要提交实际密钥。

`pnpm dev` 不会加载 `.env.production`。本地预览需要连接正式后端时，将该后端的上述两项配置填入 `.env.local`；不要通过修改 `NODE_ENV` 来切换数据环境。在本工作区中，Platform 的正式连接配置位于 `../platform/.env`，共享开发配置位于 `../platform/.env.development`；只复用上述两项，不要整份复制环境文件。

描述搜索（Hybrid）和 LCIA 结果还需要对应后端环境的 `PORTAL_EDGE_KEY_ID`、`PORTAL_EDGE_HMAC_SECRET`；Edge 服务位于不同域名时再设置 `PORTAL_EDGE_ENDPOINT`。签名凭据需与服务端匹配，具体要求见[服务端配置](docs/design-plan.md#101-portal-服务端客户端)。

配置完成后，选择一条命令启动：

```bash
# TianGong UI
PORTAL_BRAND=tiangong SITE_URL=http://localhost:3000 pnpm dev
```

```bash
# Atlas UI
PORTAL_BRAND=atlas SITE_URL=http://localhost:3000 pnpm dev
```

启动后访问 [中文首页](http://localhost:3000/zh-CN) 或 [英文首页](http://localhost:3000/en)。切换品牌时先按 `Ctrl+C` 停止服务，再运行另一条命令。同一目录共用生成的品牌 CSS 和 `.next`，同时运行两套站点需要独立 checkout/worktree 和不同端口。

使用 Atlas 默认外观时，请删除或注释环境配置中显式填写的 TianGong 主色、Logo、favicon、分享图和品牌名称覆盖项，保留后端连接配置。

- [开发指南](docs/development.md)：工具链与工作目录、按改动选择检查、Storybook/MCP、项目 skills 恢复与更新。
- [UI 与组件规范](docs/ui-system.md)：视觉、共享控件、四语、无障碍和隔离场景要求。
- [Agent 入口](AGENTS.md)：仓库边界、任务导航和 workspace 交付要求。

常用本地校验与 vendored 资源：

```bash
pnpm check                               # 静态、单测、构建、体积与产物字体去重门
python3 scripts/verify-vendored-seo.py   # 校验共享 SEO checker 快照的字节与来源字段
```

`scripts/vendor/workspace-seo/` 是 `tiangong-lca/workspace`（私有库）导出的生成快照：只按导出脚本更新、绝不手工编辑；摘要一致只证明字节完整，来源证明由私有集成任务按 Git blob 完成。

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
