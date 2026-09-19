---
lastReviewedAt: 2026-09-19
lastReviewedCommit: 08d4d08fef2d9fc4ab5ec641299dc2a1a176546f
title: Portal UI and component standards
docType: contract
scope: repo
status: active
authoritative: true
owner: tiangong-lca-portal
language: zh-CN
lastReviewedNote: "Reviewed for Portal #95 against 08d4d08: public generator, owner and declared use terms stay distinct; untyped authors and absent license URLs are not invented. Existing four-locale, capability, runtime and delivery boundaries remain unchanged. Local static/build, 292 tests and 65 browser checks pass; source delivery and production verification remain pending."
whenToUse:
  - when changing shared UI, branding, localization, accessibility or Storybook scenarios
whenToUpdate:
  - when visual, component, dictionary or isolated-review requirements change
checkPaths:
  - docs/ui-system.md
  - src/components/**
  - src/config/brand*
  - src/app/globals.css
  - src/i18n/**
  - public/brand/**
  - .storybook/**
related:
  - AGENTS.md
  - docs/development.md
  - docs/design-plan.md
---

# Portal UI 与组件规范

本文拥有共享视觉、组件、无障碍、国际化和隔离场景的要求。[开发指南](development.md#storybook-and-mcp)拥有 Storybook/MCP/skills 的启动、操作与验证步骤；[产品方案](design-plan.md#7-页面与交互)拥有搜索、详情、比较与清单的业务行为。修改组合场景时，按涉及的业务读取对应章节。

## 设计方向

公开首页采用“精密科技”品牌方向：以滚动驱动的抽象工业影像建立 Tiangong LCA 识别，用明确标题和连续分区连接数据与产品平台。搜索、详情、浏览与清单继续采用“专业科学数据目录”：信息结构稳定、留白克制、分隔清楚、检索优先。品牌首页不覆盖这些数据任务页面的布局。

可识别的核心元素是连续目录索引：Process、Flow、地区与来源共享一个表面与统一行结构，帮助访问者建立数据空间坐标。首页不把 provenance 状态做成装饰性证据轨；版本、来源、许可、方法、质量和 publication 等信任信息只在目录概览、结果行或记录页的实际使用位置出现。

品牌紫只用于主要行动、链接、焦点和少量导航信号；Source Sans 3 承担正文与标题，IBM Plex Mono 只用于 UUID、版本、日期、计数和确有必要的技术标识。Card、Table、Alert、Empty、Input Group、Button 与 Separator 使用 shadcn/ui 语义 token，浅色与深色分别校准。目录任务页面不加入渐变英雄区、装饰插画、伪统计、悬浮玻璃卡或与数据任务无关的品牌口号。品牌首页的几何与专属材质按下述已采纳组件要求实现；任何页面都不编造统计或产品能力。开发阶段的 `R1/R2`、`LEXICAL/HYBRID`、`POST`、`LIVE · 5 MIN`、`LOCALSTORAGE`、rank、score、reason code、schema、BFF、façade、telemetry 等标签不得出现在公众 UI。

公众文字遵循“用户先于实现”的顺序：先说明能做什么、看到什么、下一步是什么，再在必要位置解释限制。按钮使用可预期动作；错误同时说明状态与恢复方式；空态提供下一步；不把内部安全/缓存/发布结构当作卖点。首页首屏通过三幕连续叙事建立 Tiangong LCA 品牌识别，数据与平台入口放在后续实际内容区；Search 只显示完成检索所需的字段，完整技术与质量原文进入详情页。

术语冲突按以下顺序收敛：

1. TIDAS/ILCD glossary 拥有 Process、Flow、Exchange、functional unit、reference flow、LCI/LCIA、review/validation/compliance 等领域概念；
2. `tiangong-lca-next` 当前 locale style guide 拥有四语 UI 语气、按钮、错误和产品术语（例如法语普通产品文案使用 `ÉICV`）；
3. `tiangong-lca-next-docs` 当前四语内容提供公众任务表达与帮助链接；
4. Portal 只在匿名只读场景下缩短说明，不改变领域含义；无法本地化的上游数据值显示来源语言，不伪装成本地翻译。

信息架构参考同类公开数据服务的成熟做法：Federal LCA Commons 以仓库与数据集发现为中心；GBIF 在首屏给出直接价值陈述与主搜索；NASA Earthdata 把搜索、主题浏览和工具入口分层；European Platform on LCA / LCDN 在记录语境中强调提供方、版本、方法、质量和文档。Portal 只借鉴这些任务层级与信息边界，不复制其视觉资产、文案或品牌。

常规 Button、Input、Select、InputGroup 和 Toggle 使用 44px 高度（多行按钮为最小高度）；`sm` 为 32px 紧凑尺寸，Button 的 `xs` 24px 仅用于有明确密度需求的内嵌操作，`lg` 为 48px。Button/Select/Toggle 使用 `size`，Input/InputGroup 使用 `controlSize`，保留原生 Input 的 `size` 字符宽度属性。Sheet 关闭按钮使用 44px。`ActionGroup` 在窄屏按两列等宽排列，同一行控件拉齐；长本地化标签完整换行。

Toggle 的选中态具有持续的边框、浅色背景和下划线；比较选择以勾选图标标明状态，保留稳定的可访问名称和 pressed/checked 语义。禁用态只作用于控件，组内仍需阅读的说明保留正常对比度。InputGroup 附加区域将焦点转给相应的可用 Input 或 Textarea，按钮保留自己的操作。

输入输出表主要显示流、方向、类型、原始数量与单位及定量参考意义。数量右对齐并与单位保持同行，禁止转换为浮点数或改变精度。逐行原生展开项保留 Flow/Process 精确版本、功能单位和展示依据，支持键盘；移动端使用相同信息层级。

## 默认主色：与 `tiangong-lca-next` 一致

只对齐 `tiangong-lca-next/config/branding.ts` 当前两套主色，不复制 Ant Design 的完整 token 或算法：

| Theme | Portal `--brand-primary` / `--primary` 默认值 |
| ----- | --------------------------------------------- |
| Light | `#5C246A`                                     |
| Dark  | `#9E3FFD`                                     |

背景、surface、文字、muted、border、popover、sidebar、状态色和图表色使用 Portal 自身的 Radix + shadcn Nova + Tailwind v4 semantic CSS variables，并遵守以下原则：

- 使用 OKLCH 与 `@theme inline`；组件只消费 semantic token；
- Light/Dark 不做简单反相，各自保证层级、可读性和 Focus Ring；
- success、warning、danger、info 是独立语义色，不由品牌主色派生；
- 所有前景/背景组合满足 WCAG 2.2 AA；
- 不引入 Ant Design 依赖，也不追随其非主色 token 漂移。

默认 Logo 与 Next 同源：浅色 `/brand/logo.svg` 对应 Next `/logo.svg`，深色 `/brand/logo-dark.svg` 对应 Next `/logo_dark.svg`，favicon 对应 `/favicon.ico`。Portal 首次引入时复制 exact reviewed assets，并保存来源 repo、commit 与 SHA-256 receipt；运行时不依赖 sibling repo 路径。

## 可替换主色配置

品牌色是部署级配置，不是用户偏好或数据库数据。支持：

- `PORTAL_LIGHT_PRIMARY`，默认 `#5C246A`；
- `PORTAL_DARK_PRIMARY`，默认 `#9E3FFD`；
- `PORTAL_BRAND_VERSION`，用于 cache、视觉证据和回滚标识。

约束：

1. Zod 只接受规范化 `#RRGGBB`；非法配置使 build/boot fail closed；
2. 以浅/深 seed 在 OKLCH 中生成 50–950 primitive scale，并计算 primary/hover/active/subtle/foreground/ring/sidebar-primary；
3. success、warning、danger、info 使用 Portal UI 框架的独立语义色，不随主色变化；
4. `globals.css` 用 Tailwind v4 `@theme inline` 将 `--color-primary` 等映射到运行时 CSS variables；组件只使用 `bg-primary`、`text-primary-foreground`、`ring-ring` 等 semantic utilities；
5. Root Server Layout 输出已转义、已验证的 light/dark CSS variables；不拼接动态 Tailwind class；
6. 主题组合必须通过 WCAG 2.2 AA 对比度、focus ring 和 forced-colors 检查，否则部署失败；
7. 配置变化产生新 deployment，不允许运行中跨请求切品牌，避免 CDN/ISR cache 混色。

## Logo 与 favicon 替换

支持部署变量：

- `PORTAL_LIGHT_LOGO`，默认 `/brand/logo.svg`；
- `PORTAL_DARK_LOGO`，默认 `/brand/logo-dark.svg`；
- `PORTAL_LOGO_MARK`，移动端/窄导航可选，默认复用当前主题 Logo；
- `PORTAL_FAVICON`，默认 `/brand/favicon.ico`；
- `PORTAL_LOGO_ALT_ZH` / `PORTAL_LOGO_ALT_EN`；
- `PORTAL_LOGO_WIDTH` / `PORTAL_LOGO_HEIGHT`，默认按源文件 `170.08 × 170.08` 比例；
- `PORTAL_SOCIAL_IMAGE`，链接预览用社交卡片，默认 `/brand/social-card.png`（仓库内由 `public/brand/logo.svg` 离线生成的 1200 × 630 PNG，见同目录 `.NOTICE.txt`）；
- `PORTAL_SOCIAL_WIDTH` / `PORTAL_SOCIAL_HEIGHT`，默认 `1200` / `630`，必须与卡片实际像素一致（`tests/unit/brand-assets.test.ts` 会读取 PNG 头校验）。

规则：

- 首选同源 `/brand/**` 资产；允许远端时只接受 HTTPS 和 `PORTAL_BRAND_ASSET_ORIGIN` allowlist；
- SVG 以 `<img>`/`next/image` 外部资源方式呈现，不把未受信 SVG inline 注入 DOM；
- 必须声明 width/height 或 aspect ratio，避免 CLS；加载失败回退默认 Logo 与文本品牌名；
- 社交卡片必须是位图（SVG 标记不被链接预览渲染）；同上受 `PORTAL_BRAND_ASSET_ORIGIN` 约束；
- Light/Dark/System 切换同步选择对应 Logo；在 `<html>` 水合前用带 SRI 的同源外部主题脚本恢复 localStorage 偏好，System 模式使用 `prefers-color-scheme`，避免 Logo 与主题 hydration flash；
- Header、移动导航、favicon、manifest icons、Open Graph image/brand metadata 使用同一 `BrandConfig`；
- Alt 文本本地化；旁边已有可见品牌文字时纯图形 mark 使用 `alt=""`；
- Logo/主色替换不提供匿名上传或管理 API。通过 EdgeOne 环境变量或受审查的 `public/brand/**` 资产修改，重新部署后生效。

## 字体与密度

- 西文/数字：`Source Sans 3`；
- CJK：`Noto Sans SC` / `PingFang SC` / `Microsoft YaHei` 回退；
- UUID、版本、数值：`IBM Plex Mono`，启用 tabular numerals；
- 正文 14px 起，主要结果行触达高度不低于 44px；
- 8px 布局网格，6px 基础圆角，细边框优先于阴影；
- 字体从站点自身提供或使用可靠系统回退，不依赖运行时访问 Google Fonts；
- `@font-face` 定义由 `src/app/globals.css` 单独拥有：产品布局与 Storybook 预览都经它加载，`src/features/**`、`src/components/**` 与 shell CSS 不再各自 `@import` fontsource 包——否则同一批 108 个 `@font-face` 会在每个入口 CSS 中重复（见 `docs/development.md`）。

## shadcn/ui

目标基线为 Radix primitives + Nova 风格。实现时先用当前 shadcn CLI 获取项目 context，再从官方 `@shadcn` registry 选择组件；不未经选择引入第三方 registry。

优先组合：

- InputGroup、Command、Dialog：统一搜索和命令面板；
- Sidebar/Sheet、Accordion、Checkbox：分面；
- Table、Card、Badge、Tooltip、HoverCard：结果与详情；
- Tabs 只用于局部状态，详情主内容使用路由；
- Resizable、ScrollArea：三栏桌面布局；
- Empty、Alert、Skeleton、Spinner、Sonner：空态、错误和反馈；
- ToggleGroup：密度、主题和比较视图切换。

规则：

- `className` 只做布局，颜色/字体通过 semantic token 与 variant；
- 不写 raw `dark:` 颜色覆盖；
- 不用 `space-x/y`，使用 flex/grid + gap；
- Dialog/Sheet/Drawer 必须有可访问 Title；
- Select 菜单有可访问名称，展开时背景使用原生 `inert` 隔离焦点，关闭或卸载后恢复既有属性与触发器焦点；
- Badge、Empty、Alert、Skeleton、Separator 使用官方组件，不手搓同类 markup；
- 业务组件组合 shadcn primitives，`components/ui` 保持可追踪上游差异。

## 无障碍、国际化与响应式

### 无障碍

基线升级为 WCAG 2.2 AA：

- 状态不只靠颜色；
- 全站键盘可达、焦点清晰、顺序稳定；
- 200% zoom 不丢内容或操作；
- 触控目标满足 WCAG 2.2；
- 尊重 `prefers-reduced-motion`；
- 快捷键在 input、textarea、select、contenteditable 和组合控件中禁用；
- 表格有 caption、行列 header 和可理解的排序状态；
- 图表提供精确数据表，地图提供等价可筛选列表；
- Field origin 标记有文字、图标、`aria-label` 和解释。
- 人工发布验收不设置 VoiceOver/屏幕阅读器走查门；语义 HTML/ARIA、自动 WCAG、纯键盘、焦点、缩放、reduced motion、主题与响应式要求保持不变。

### 国际化

- 正式公开 `zh-CN`、`en`、`de` 与 `fr`，URL 段与 html lang 分别保持这四个规范值；与 Docs/TIDAS 的 `/de`、`/fr` 公共路径一致，不把 Next 内部 `de-DE`/`fr-FR` adapter tag 暴露为 Portal URL；
- 使用 `next-intl` 的 locale segment 与 Server Component 消息加载；
- 日期、数字、单位和复数规则本地化；
- 四份消息字典具有完全相同的闭合 key topology；缺 key、整段英语复制、未翻译开发标签或跨语言 UI fallback 均使构建/测试失败；
- UI 语言与数据内容语言分离；
- 数据字段回退到其他语言时明确标记来源，不伪装成本地化原文；
- 切换语言保留同一对象、版本、查询和分面。

### 响应式

- `>=1280px`：三栏完整工作区；
- `768–1279px`：分面 Sheet + 收起托盘；
- `<768px`：单列、以查询和阅读为主；比较保留已选候选，按字段组织卡片与定义列表，候选数量遵守[比较功能要求](design-plan.md#74-比较)；
- 地图移动端默认表格视图；
- 高密度表格在窄屏改为定义列表，不横向压缩关键信息。

## Storybook 场景与审阅

[Storybook 配置](../.storybook/main.ts)使用 Next.js Vite framework，CSF stories 与合成 fixture 留在 `.storybook/`。场景直接导入已有基础组件及业务组合，预览复用生产 CSS、生成的品牌 token、字体栈和四套实际字典；工具栏同步 document 的主题、语言和视口。MSW 的 `mockServiceWorker.js` 只生成到 `.storybook/public/`，不进入 Portal 的公开资产或 EdgeOne 产物。

服务端展示组件在 loader 中执行；Vite alias 仅替代请求级翻译和服务端品牌配置，避免引入 Next 请求运行时。搜索页与场景共用 FacetsPanel。MSW 拦截同源 API，fixture 通过实际请求 schema 校验输入；主题和清单场景初始化并恢复专用存储键，不接触线上数据或生产凭据。

每个变化覆盖相关正常、空、加载、失败、禁用、选中、缺失字段、长文本或窄屏状态。交互使用 `play` 验证用户可观察行为，按请求显式释放响应，不依赖固定延时。保留 Hybrid 早期结果与选择、显式应用更新、旧请求取消、迟到结果、失败/过期续页，以及清单导入预览/确认/取消、备注分享确认和容量限制等回归场景。

无障碍检查统一为 `error`，展开后的 Select 也必须检查。实际浏览器复核焦点恢复、键盘、浅深主题、四语长标签和窄屏；原生锚点、默认键盘行为、页面布局与跨页导航继续由生产 E2E 验证。Storybook 的自动检查不等于视觉设计通过，也不建立截图差异基线。

组件及组合提供准确的 `component` / `subcomponents` 与 `@import` 模块引用。[manifest 检查](../scripts/check-storybook-manifest.mjs)验证覆盖、真实导入与关键 Props。Autodocs 和 Component Meta 的编译器适配由[精确包 hook](../scripts/pnpm-hooks.cjs)管理，版本以脚本和锁文件为准；升级时重新验证实际 API 文档、MCP 协议和场景。

比较先显示需要关注的字段，并保留展开查看所有字段；LCIA 数值和单位保持原样，数据集/方法的精确版本可展开。目录覆盖与通过测试不能替代面向数据使用者的视觉审阅。

### 品牌首页与滚动影像

`src/components/brand/` 拥有实际首页与 `ScrollCinematicHero` 轻量客户端岛。`Brand/Homepage` 场景复用生产页面与四语字典；`Brand Explorations/Lifecycle Sculpture` 继续保留为独立部件、姿态与参考对照研究，不再进入生产首页。

首屏由 226 帧同源 WebP 图像组成三幕连续叙事：生命周期智能、数字孪生、可追溯证据。三幕标题、说明与章节标签使用四语字典，位置、宽度和标签样式一致；文字层在滚动期间固定，只交叉淡入淡出，不跟随页面向上平移。首幕不放操作按钮，实际目录和平台入口由后续内容区承担。画面在 Header 下方顶格铺满可用宽度，高度固定为视口减去 Header；16:9 主画面完整按宽度展示，纵向不足由同帧模糊环境层上下延展，避免硬边、留白或裁掉主体。

首帧解码前显示与画面明暗兼容的加载幕，完成后以短暂淡化过渡进入序列，不瞬间闪切。滚动从第一个输入增量开始映射帧进度；加载中的帧不得替换当前已解码画面，避免闪屏。减少动态效果时显示代表性静帧并保留完整文字、对比度和阅读顺序。亮暗主题共享影像素材，通过遮罩与文字颜色分别校准。

首页使用 Source Sans 3 Variable 与 Noto Sans SC Variable 的同源字体资产，标题、说明、正文和辅助文字分别设定角色。首屏文字与 Header、后续章节沿同一内容容器和响应式左右边距对齐，最大宽度为 1440px；主标题宽度受容器约束，不能越过导航或后续内容边界。搜索区域用独立中性表面区分，品牌紫用于标题强调和主要操作。加载或动画不可用时，首屏仍保持稳定尺寸、代表性画面与可读文本。

Header 与 Footer 的容器宽度、响应式边距及字体由 `src/components/shell/site-shell.css` 统一拥有，所有实际路由复用同一规则；品牌首页不按页面存在与否覆盖 shell 的尺寸或字体，避免导航时横向位移。

### Team 品牌页

`src/features/team/` 拥有 Team 页面组合与从 Wix 公开页面核对的成员数据，优化后的头像保存在 `public/team/portraits/`，`NOTICE.txt` 记录来源页面、站点和媒体标识。生产页面与 `Brand/Team` Storybook 场景复用相同组件、四语字典与图片，不在场景中重建一套人物卡片。

页面采用编辑式人物名录而非通用卡片墙，同时复用 `site-shell-container` 的 1440px 最大宽度、居中规则和响应式左右边距。开场只保留一个接近常规 Portal 页面的“认识天工团队”标题和简短介绍，不展示成员/机构计数、重复的团队标题或名录口号；人物内容紧接开场进入。创始人作为唯一重点条目，其余成员不显示序号或排名，保持 Wix 页面从上到下、同一行从左到右的视觉阅读顺序并使用统一网格。成员单元展示英文职位 Title、姓名、本地化机构及紧凑邮件图标；职位作为个人身份信息不随界面语言翻译，没有公开邮箱时不渲染空操作。头像采用轻度降低饱和度的静态基线，悬停和键盘焦点只增强品牌色与交互边界，不改变人物身份信息。手机改为单列并保留完整文本，亮暗主题不切换头像资产，减少动态效果时关闭缩放与颜色过渡。Storybook Team 页面场景包含生产共用的 Header 与 Footer，避免孤立组件预览掩盖页面边界问题。

团队名录之后使用紧凑的社区入口，链接至独立的 `/:locale/community` 页面。Community 页与 Team 页共用字体、1440px 容器、Header、Footer 和亮暗主题，但独立承载长目录，顺序固定为领域专家、合作高校与机构、贡献者。领域专家保留 Wix 公开顺序、头像、机构、研究领域和公开邮件入口；合作高校与机构按工作表原始行序呈现名称与 Logo；贡献者采用更紧凑的三列目录，只展示姓名、机构和贡献主题。组标题不使用数量标记，每组先显示代表性首批内容，再通过同一套带 `aria-expanded` 的展开控件显示完整目录；展开后控件移至新增内容末尾、改为明确的收起动作。69 家机构均使用透明背景且统一可视边界的本地 Logo；Logo 墙不使用卡片底色和外框，让标志直接落在页面背景上，暗色模式统一提升亮度并降低饱和度。`Brand/Community` 独立页面场景负责验证共享 Shell、内容顺序、展开与收起行为、亮暗主题和手机布局；`Brand/Team` 验证核心成员和社区入口。

`TeamEnsemble` 是由 `Brand/Team Ensemble` 场景独立审阅的分层人物群像设计资产。全部 23 位已核对成员按后景 8 人、中景 8 人和前景 7 人形成三段视觉景深；每段沿弧线逐人定位并错开头部高度，Ming Xu 是中心锚点，前景向两侧递减，肩部在不遮挡五官的前提下自然交叠。每个人物保留与脸部匹配的可聚焦热区，悬停或键盘聚焦只增强局部清晰度并显示姓名与英文 Title，不提升人物层级或显著改变尺寸。点击后通过底部紧凑资料条展示姓名、职位、机构与可用邮件入口，周围人物轻度退后，Escape 或关闭按钮收起。桌面与窄屏共享唯一的 16:9 构图，人物坐标、比例、层级与裁剪整体等比缩放；窄屏只调整资料卡布局，不单独排人。人物层使用原始 Wix 肖像生成的确定性前景蒙版，只将背景替换为 alpha 透明度；统一色调、景深对比和整组底部光雾将素材融入同一个场景。桌面前景人物延伸至共同裁切基线，由整组蒙版统一收口，不逐张提前淡出身体；后景与短胸像仅在躯干末端柔化原始照片的截断边缘。第二排优先使用 Si Zhang、Ayazhan、Jiayi 等半身素材，保留躯干至前景肩部后方；后排中央使用 Yi Cao 的完整躯干衔接中景。短胸像安排在有邻近肩部承接的位置，不依靠提前渐隐制造排间空白。不使用会重绘面部、服装或姿态的生成式替代素材。构图参考保存在 `docs/design-references/team-ensemble-composition-v2.png`，仅用于指导真实透明肖像的排布。

真实搜索与样板共用 `CatalogResultsToolbar`，查询/类型与筛选/排序在同一行；结果区域采用全宽列表，筛选统一由抽屉打开。结果行字号由共享 CSS 明确拥有，不再由样板专用变量改变。真实排序仅提供服务端支持的 relevance、modified_desc、name_asc，不冒充按参考年份排序；匹配依据放入辅助展开区域。

`CatalogSearchInput` 与 `CatalogSearchLayout` 分别统一实际路由和设计样板的输入控件及筛选/结果网格；样板仅提供合成数据和交互适配。关键词和描述模式保持挂载，切换保留各自草稿；模式菜单显示当前选项并支持键盘。

`CatalogResultRow` 是设计样板和真实关键词/描述结果共同使用的行组件，拥有标题、版本/公开内容标签、选择位置、右侧操作及元信息布局。`Design References/Catalog pages` 不再单独拥有结果行 CSS；真实数据仅显示已提供的字段，不使用样板描述补齐。版本和公开内容复用 `DatasetVersionTag`、`PublicContentTag`。

搜索工作区以 `search-workspace.css` 统一模式切换、关键词结果和描述匹配结果的视觉层级：模式由搜索按钮旁的 `SearchModeControl` 图标菜单选择，过程/流为轻量下划线切换，结果页标题收紧，结果采用连续分隔行与共享的标题、元信息、引用及操作样式。检索类型、筛选、候选清单及比较行为保持原有数据契约；描述匹配的理解和更新状态为额外辅助区域，不另建结果卡片体系。

关键词结果及复用该结果页的过程/流浏览使用同一 `CatalogPagination` 分页栏，上一页与下一页始终占据左右稳定位置，首尾不可用操作明确禁用。页面链接只原样携带服务返回的 opaque cursor，并附带有数量与 URL 长度上限的游标历史来构造可分享、可前后移动的结果页；新查询、类型、筛选或排序会清除该历史。描述需求搜索继续使用保留现有结果的“加载更多”，不混用替换页式分页。

`CatalogSearchEntry` 统一首页第二屏与搜索初始态的标题、搜索区域轮廓和四个浏览入口。首页使用 `CatalogSearchTeaser` 原生链接，短暂演示示例文字后停住，悬停、聚焦、离屏及页面隐藏时暂停，减少动态效果时静态显示；整块入口进入空白搜索页，不提交示例。搜索初始页使用真实输入框，去掉章节编号和目录统计。支持时用原生跨文档 View Transition 将演示入口过渡到输入框，减少动态效果或不支持时正常导航。有关键词、游标、有效筛选或无效输入时保留结果/错误路径，不显示探索介绍；描述搜索入口继续可用。搜索表单使用原生 GET 作为回退，客户端导航保留查询与数据集类型。

品牌首页三个章节统一使用 `SectionEyebrow`（`Brand/Section Eyebrow`）放在标题上方，编号为装饰性的阅读顺序，不作为分页进度。组件统一编号、分隔符、字号、亮暗颜色与标题前间距；标签使用所属页面的四语字典，长文本在标签列换行。首屏不再重复展示底部章节进度。该组件用于品牌章节，不扩展到目录功能页面或独立 Team 页。

首页的 `BrandHome` 复用实际公共目录摘要，不将合成 fixture 引入生产；Storybook 场景必须明确其摘要是合成输入。示例计数仅在目录概览区域出现。滚动影像使用生产同源帧序列；基础脚本预算、首帧传输和完整序列传输需要分别记录，不能以脚本预算代替页面全部下载量。验证首页响应速度时必须等待真实首帧完成解码，不能以加载幕作为性能通过的证据。

### 完整页面设计样板

尚未采纳的页面设计可放在 `.storybook/catalog-reference/`，由 `Design references/Catalog pages` 的完整场景独立审阅。样板复用正式基础组件、品牌、语义 token 与四语字典；页面布局和样板状态只存在于 Storybook，公开路由不得导入这些模块或样式。通过设计审阅后，再以独立交付将选定的组合模式接入实际页面和服务端数据契约。

样板使用明确标注的合成身份、记录、匹配说明和计数。交互覆盖查找、筛选、选择、打开详情、返回、候选清单与引用，状态只保留在当前预览中。示例数值保持精度，缺失信息保持缺失，字段对齐不提供科学可比性结论。该样板不验证真实排名、动态分面、线上许可或公开能力。

搜索样板以连续记录、对齐的地区/时间/单位和可读的匹配片段为核心；详情样板先展示参考产品、单位、地区和时间，再展开范围、输入输出、证据与精确版本。设计验收需要完整页面的桌面、窄屏、浅深主题与长文本审阅；自动测试通过不代表该提案已经成为正式设计基线。

样板通过开发依赖随站点提供 Source Sans 3 与 Noto Sans SC 可变字体，仅在样板及其弹层作用域内使用。辅助说明、正文、长文阅读、记录标题和页面标题采用明确的字号角色；中文标题保留自然字距，西文标题只做轻微收紧。搜索结果按标题与身份标签、地区/时间/单位、匹配摘要连续排列；详情阅读列与侧栏共同决定列宽，不再在宽列中另加脱离网格的正文宽度限制。主要搜索保留 44px 控件，详情和行内操作使用 32px 紧凑尺寸，手机的详情操作与逐行收藏恢复至少 44px。字体大小、字重、圆角与密度的这些调整属于待审样板，不能据此覆盖全站正式组件。

搜索样板在分面侧栏收起时，将筛选入口与排序放在同一结果工具栏；手机上这组操作排到结果数量下方，触控高度至少 44px。搜索结果与详情中的独立版本号统一使用 24px 高、13px 字号、4px 圆角的中性标签，采用正文字体与等宽数字，保留 `v` 前缀和原始版本字符串；标签是文本，不提供操作。完整 UUID@version 与精确数量仍保留技术字体。结果中的版本标签与公开内容图标采用一致的 24px 浅底、细边框和小圆角，整体跟随标题，空间不足时一起换行，不再在摘要下固定占一行。图标的可视尺寸与手机 44px 实际触控区域分开处理，并与相邻标题和收藏操作保持分离。公开内容状态使用图标，悬停、键盘聚焦和点击均可查看说明，支持 Escape、移出焦点和点击外部关闭；手机图标触控区域至少 44px。筛选选项与详情仍显示“含输入输出”或“仅数据说明”的四语文字，不用勾号暗示审核、质量或许可结论。

样板搜索框下不再重复展示搜索模式或隐私提示；这不改变真实搜索与分享流程的隐私要求。合成数据说明在页面底部统一展示。样板未提供逐条来源名称，列表和标题区不补造统一来源，详情来源显示“未提供”，示例引用只组合已有的名称、年份和精确版本标识。

### Catalog 共享业务组件

`src/features/catalog/dataset-tags.tsx` 统一拥有 `DatasetVersionTag` 与 `PublicContentTag`，旁置 CSS 拥有标签尺寸与说明弹层样式。组件只接收精确版本、公开内容状态和本地化文案，不依赖 Storybook fixture、整条记录或页面 CSS。`components/ui` 继续拥有通用 Badge、Button 等基础组件；页面负责标签的位置、分组和换行。`Catalog/Dataset tags` 提供独立的图标、文字、浅深主题、窄屏和键盘说明场景。搜索与详情样板、正式详情的 `DetailHeader` 共用这些标签；其他正式页面仍按各自组合评审。

`ResultsContinuation` 统一拥有游标列表底部的加载更多、加载中、失败重试与末尾展示；调用方传入已本地化的进度说明，不要求服务返回总数。搜索样板使用六条一批的合成分页来展示交互，不改变实际搜索的分页上限或游标契约。追加结果保留已选内容，将焦点交给首条新增记录；进入详情再返回保留已加载结果。新查询、分面或排序重置续页并忽略迟到响应；空结果不显示续页控件。稳定状态场景与重试、返回和请求隔离的交互场景分别保留。

### 详情页与样板面板的布局

正式 `DetailHeader` 使用 28px 桌面标题和 24px 手机标题，长名称自然换行；种类、独立版本和显式公开能力组成紧凑身份行。顶部只保留一个引用按钮，点击打开居中弹窗，正文中不再重复引用折叠入口。弹窗包含引用正文、精确标识及复制操作，支持 Escape 和关闭按钮，关闭后焦点返回顶部入口；既有 `#citation` 链接在客户端就绪后打开同一弹窗，关闭时清除该 hash。桌面操作按内容宽度排列，手机触控目标至少 44px；复制失败保留可手动复制的内容。详情子页面继续使用原生链接。

正式 `OverviewPanel` 首先展示使用背景：Process 的参考产品、功能单位、地区和参考年；Flow 的 CAS、类型和参考流属性。说明与技术正文在阅读列，来源、数据生成方、数据所有权方、声明的许可类型、访问与使用限制和证据在侧栏（生成方、所有权方、访问限制仅非空时显示），窄屏按阅读顺序堆叠。仅展示已提供的原始名称与说明，缺失字段不从其他类型推断。

样板的候选清单保留完整名称、精确版本、地区/时间/单位和独立移除操作；空态提供返回目录入口。核对面板桌面按字段对齐，窄屏先列候选名称与版本，再按字段展示带稳定候选序号的值。核对中的版本使用中性辅助文字，保留 `v` 前缀和原始字符串；UUID 作为独立字段与其他值对齐展示，不再增加单独的标识折叠区。字段对齐不作科学可比性结论。打开面板时焦点位于标题并保持顶部阅读起点。稳定空态、多条记录、浅深主题、长本地化文字及移除/打开详情的交互分别保留场景。

搜索样板和真实结果共同使用 `CatalogResultList`、`CatalogResultRow` 与 `CatalogResultSummary`，统一列表边界、单条结果及真实摘要；数据适配器保留各自支持的操作与分页契约。关键词表单不常驻隐私提示，描述搜索的共享确认不变。清空按钮为 44px 方形图标按钮，提交按钮单独设置最小宽度。

目录条目按标题与能力图标、元信息、两行真实摘要排列，摘要来自公开搜索契约的 `summary`，不额外请求详情或虚构缺失描述。精确标识由图标复制，完整 UUID 在详情中展示；条目不再有 UUID 折叠区或重复详情按钮。引用复制与收藏为紧凑图标操作。过程/流浏览复用搜索页面实现；需求描述复用结果行、类型切换、工具栏与分页外观，排序仍遵守各检索接口能力。选择操作条仅在选中条目后出现，不足两项不能比较。

顶层导航以数据目录统一搜索与浏览，不再单列浏览。目录初始页的过程、流、地区和来源入口通过 `explore` 参数进入紧凑结果布局，搜索框以原生 View Transition 过渡，减少动态效果时直接导航。结果工具栏保留四个维度；地区与来源使用相同查询和筛选的公开聚合接口，不从当前页结果计算。点击聚合值回到带条件的数据列表。旧浏览 URL 保持兼容。

数据说明与候选清单使用 `PortalPage` 统一容器、标题与说明排版。数据说明为章节导航与阅读正文，候选清单复用目录记录行，清单信息与手动添加默认收起，导入、备份与分享集中于工具栏，状态和备注保留在记录内；导入、分享及本地存储错误处理保持原行为。页头导航使用跟随鼠标悬停和键盘焦点的低强调品牌底色，离开后回到当前页面，减少动态效果偏好下禁用过渡，页脚使用品牌标识与低强调链接，不再重复记录核对提示。Storybook 直接使用数据说明组件及候选清单页面视图，Shell 场景同时展示页头与页脚。

生产页面仅保留代表性桌面亮色和手机暗色的集成巡检，完整组件主题、语言、尺寸与状态组合由 Storybook 覆盖。真实路由、SSR、无 JavaScript、隐私分享及安全检查不因组件覆盖而省略。

生命周期雕塑的 WebGL 渲染就绪与图形交互属于独立研究场景的手动专项验证。品牌首页滚动影像不标记为 `webgl`，普通自动化需要覆盖首帧、滚动进度、四语文本、响应式、可访问性和减少动态效果；实际清晰度、过渡连续性与移动端构图仍需视觉审阅。

人物群像校色保留原始透明肖像，通过组件内逐人 RGB 通道增益、曝光与饱和度参数修正拍摄光线差异；未单独校正的照片使用共同基础色调。亮暗模式共享校色，暗色只轻微补偿亮度，悬停与选择不能覆盖基础校色或恢复原图高饱和度。构图位置与校色参数独立维护。

### 层级分类与地区地图

目录按 ISIC、CPC 和基本流词表的实际层级浏览，节点数量为匹配的公开版本数；同一版本的重复分类路径不重复计数。桌面保留分类导航与结果的并列阅读顺序，手机使用原生可展开面板。每层提供路径、返回、包含后代和仅本级数据入口，状态进入 URL，变化重置结果游标。词法目录的层级条件不静默传入或丢弃于描述检索；切换时显示显式清除入口。

地区地图是地区列表的渐进增强：桌面默认显示，手机由按钮展开；无 JavaScript、地图失败和无法定位的范围仍可通过文字链接进入结果及精确版本详情。颜色仅表示匹配公开版本数，未载入不代表零；跨区、历史范围与歧义编码不强配行政边界。浏览器只获取当前层的预投影 SVG 路径，不载入全世界城市、不请求第三方地图服务。地图来源、边界映射、简化参数和不能定位的条目均绑定资源 receipt。现有主题语义色、焦点、四语、44px 触控和减少动态效果规范继续适用。
