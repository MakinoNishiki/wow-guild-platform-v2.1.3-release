# 任务书 #51 WP2 修改报告：家宅图鉴公示页双壳（REQ-137 一期）

> 日期：2026-09-18 ｜ 执行：Kimi Code ｜ 性质：纯前端只读（零 schema/零数据写入、零依赖零构建）
> 前置：WP1 已入库（HEAD=3227fec）；运营更新口径——WP2 做**独立 decor.html**（非 data.html 内嵌版块），以 brief 为准
> 验收脚本：`scripts/verify-task51-wp2.js` **39/39 全绿**；截图 `backup/2026-09-18-task51-wp2/`（5 张）

---

## 一、修改文件清单

| 文件 | 改动 | 原因 |
|---|---|---|
| `decor.html` | **新建**（39 行） | 家宅图鉴公开壳：`body.data-decor-body` 自动挂载；只引用 decorDict.js/decorData.js/decor-public.css 三件套 + main.css 暗色基底（data.html 同款先例），零数据逻辑/常量内嵌；页头品牌+「副本掉落公示」互链 + 页脚；版本串 20260918.65×5 |
| `css/decor-public.css` | 追加 WP2 公开壳外壳段（53 行） | `.data-decor-body` 作用域（登录壳零影响）：1100px 版心页头/筛选栏/主区/页脚，镜像 .dp-header/.dp-footer 公示同款观感；768px 收 padding |
| `data.html` | 头部互链一行「🏠 家宅图鉴公示」（复用 .btn .btn-secondary，零 CSS 触碰）+ 版本串 20260816.64→20260918.65（7 处） | 双向互链；版本串同步递增；diff 可证此外零触碰（verify B4 锁） |
| `server.js` | `PUBLIC_STATIC_FILES` 白名单加 decor.html（1 行+注释） | SEC-002 静态边界——不放行则 decor.html 404，本 WP 不可能交付；与 data.html 同级放行同款先例 |
| `test/server-security.test.js` | 静态放行断言加 decor.html 一行 | 沿袭既有测试模式锁定新放行面 |
| `js/decorData.js` | 搜索 oninput/clearSearch 两处补 `refreshCount()`（2 处各 1 调用） | **WP1 遗留缺陷顺手修**：搜索后网格已过滤但计数条滞留「共 2062 件」（搜索链路漏调 refreshCount）；公示页计数条恒显为验收口径，必修；双壳共用层同修，应用内页同受益 |
| `scripts/verify-task51-wp2.js` | **新建**（39 项） | WP2 验收自动化（命名理由见 §五） |
| `AGENTS.md` | 目录结构加 decor.html 行、decorData.js 注释、功能模块 13 更新 WP2 落地态 | 文档纪律 6.3（同任务更新不留以后） |

**未触碰**：index.html / js/app.js / 导航分组（#52 范围）、css/data-public.css / js/dataPublic.js、首页、任何 sql/数据表（零写入）。

## 二、关键实现决策

1. **双壳形态**：独立 decor.html（运营更新口径），与 data.html 平级互链而非内嵌版块——两公示页各自 URL 可分享、各自独立文件零交叉加载。
2. **同源硬约束落地**：decor.html 骨架刻意极简（页头/互链/页脚 + `#dhFilterBar`/`#dhMain` 两空容器），筛选栏结构全部由 decorData.js 生成——与登录壳 `#page-decor` 骨架逐字同构（verify A8 锁）；全部数据/渲染/词表逻辑只存在 js/decorData.js + js/decorDict.js 一份。
3. **main.css 属第四引用但合规**：「三件套」约束的对象是图鉴数据逻辑/常量（dict/data/css 组件层）；main.css 是公示暗色体系基底（CSS 变量 + .btn/.search-input 控件类），data.html 同款先例，且为纯引用非内嵌复制——verify A4/A5 双断言锁定「只引用不内嵌」。
4. **server.js 白名单属必要最小改动**：SEC-002 静态边界只放行 index.html/data.html，decor.html 不放行即 404；已加注释标明任务书来源，测试断言同步。
5. **搜索计数条修复（WP1 遗留）**：实测发现搜索后计数条不刷新（`oninput` 只调 render 未调 refreshCount），公示页「命中 X 件 · N 项生效」恒显口径下属主链路缺陷；最小修复=搜索/清除两处补 refreshCount()，不动任何其他逻辑。

## 三、UI 审计问题清单（开工前置，improve-ui 口径：契约/运行时/修正三证）

审计面：参照面 = data.html 公示壳 + WP1 应用内图鉴页（#page-decor + decorData.js/decor-public.css）。

| # | 问题 | 证据 | 处置 |
|---|---|---|---|
| 1 | `.dh-chip`/`.dh-pager button` 无 `:focus-visible` 显式样式（仅 UA 默认；`.dh-card` 已有） | decor-public.css 全文无 `.dh-chip:focus`；状态矩阵（UI 工作方法 §三）键盘焦点态缺项 | **登记不施工**——属 WP1 产物改动且影响应用内页，WP2 红线不顺手扩；建议另案 |
| 2 | 搜索后计数条滞留「共 2062 件」（命中数不刷新） | decorData.js oninput 链路缺 refreshCount()；真浏览器实测复现（搜索「暴雪嘉年华门垫」网格 1 卡但计数条 2062） | **已修**（本 WP 施工，见 §二.5） |
| 3 | 公开壳外壳（页头/版心/页脚）在 decor-public.css 缺位 | WP1 只交付登录壳 | 非缺陷，即本 WP 施工内容（已落地） |

**已知取舍（不计入问题清单）**：移动端封存/桌面优先（docs/魔兽管家UI设计规范v2.md §8）、禁动画库（§9）、390px 单列回归不适用（768px 断点为项目口径）；「组头注记复用 .dh-chip-n」视觉无矛盾，证据不足判缺陷，审计 vet 轮丢弃。

## 四、验证（真浏览器实测，verify-task51-wp2.js 39/39）

**主链路实测**（Playwright Chromium 151 无痕上下文=未登录，`node server.js` 本地起服，anon 直连 PostgREST）：

- **三态齐全**：加载中态（DOM 就绪即见 .dh-loading）；空结果态（搜「绝不存在的装饰xyz123」→「没有符合条件的装饰」+重置引导→还原 2062）；失败重试态（route 拦截 decor_catalog 请求→错误文案+重试钮→放行→点重试→恢复「共 2062 件」）；
- **2062 对账**：页面「共 2062 件」= anon REST count=exact 库内对照 2062（装饰 2023 + 房间 39 三分口径全等）；首页 60 卡 + 「第 1/35 页 · 共 2062 件」；首页占位图 39 = 库内前 60 件缺图标计算值；
- **基准六件逐件核对方式**：anon REST 按 record_id 取行得名称 → 页面搜索名称 → 点卡开详情弹窗 → 断言来源区文本片段（25546 额外断言 sources 空 + .dh-src-raw 渲染 = source_text 同规则剥离后原文首行「地区：烈风海岸」且非「来源未知」）——六件全过：28350「商城购买+商人：世界商人 · 500 金」/ 27973「20 × 社区礼券」×2 双商人 / 27043「掉落：乌拉特克（烈毒之渊）」/ 675「2000 × 职业大厅资源 + 1000 金 · 织梦者 - 崇拜」双商人 / 25546 原文兜底 / 8176「任务：密报：突击索克雷萨高地（影月谷）」；
- **筛选/翻页**：「房间/户型」命中 39、「可放宠物」命中 11（=库内 jsonb 包含对照，cs=[53]）、重置还原；第 2 页首卡 rid=487 = 库内第 61 件；
- **双向互链真点击**：decor.html 页头「副本掉落公示」→ 落地 data.html（标题「副本掉落」）→ data.html 头部「🏠 家宅图鉴公示」可见 → 点击回跳 decor.html；
- **双壳同源断言**（A/B/C 组 19 项，grep/diff 可证）：decor.html 仅两外联脚本（decorDict+decorData）、零内联脚本/事件属性、零数据逻辑内嵌（无 fetch/表名/词表键/渲染函数）、版本串 5 处全 20260918.65；data.html 互链仅 1 处、版本串 7 处全新值无旧串残留、零 decor 三件套引用、git diff 逐行锁「互链+版本串之外零触碰」；
- **桌面 + 768px 窄屏实测**：768px 筛选栏折叠（.dh-filter-rows 隐藏、「筛选 ▾」按钮可见）↔ 展开双向生效；网格降列（列宽 166.7px→116.7px、图标 72px→56px 媒体查询收小）；两态截图；
- 全程零 JS 报错、零 ≥400 响应；`node --check` decorDict/decorData/server/verify 四文件全过；`node --test test/server-security.test.js` 全过（含新 decor.html 放行断言）。

**截图**（backup/2026-09-18-task51-wp2/）：01 桌面网格+筛选栏+页头互链 / 02 桌面详情弹窗 28350（含「命中 1 件 · 1 项生效」计数条修复实证）/ 03 窄屏折叠 / 04 窄屏展开 / 05 data.html 头部互链位。

## 五、verify 脚本命名

`scripts/verify-task51-wp2.js`——任务书编号仍为 #51（WP2 是其子包），顺延 WP1 的 verify-task51.js 命名加 -wp2 后缀区分；不命名 verify-task52.js：#52 是导航分组重构另一任务书，避免占位混淆。

## 六、报运营确认事项

1. **WP1 验收脚本实件异常**：`scripts/verify-task51.js` 在 HEAD=3227fec 中仅 7 字节（内容 `index.h`，疑似被重定向截断误写），WP1 报告声称的 28/28 脚本本体已不可考；本 WP 未触碰该文件（不属 WP2 范围），请运营定夺是否由 WP2 顺带重建或另案。
2. UI 审计发现 #1（chips/分页钮 focus-visible 缺显式样式）登记未施工，建议另案。

## 七、遗留问题

- 导航两组式重构与首页双入口耦合属 #52 范围，本 WP 未碰。
- 应用内「家宅图鉴」activate() 维持对称占位（只读目录无脏标记链路，WP1 设计）。

**零写入声明**：本次改动未触碰任何表结构与数据（无 schema 变更、无 UPDATE/INSERT；verify 全程 anon 只读对照，未建测试用户/公会/数据）；不 commit、不 push。

## 八、commit 物料（待顾问终审后另发）

```
任务书#51-WP2：家宅图鉴公示页双壳（REQ-137）

【改了什么】新建 decor.html 独立公示页（body.data-decor-body 自动挂载，只引用
decorDict/decorData/decor-public 三件套+main.css 暗色基底，零数据逻辑内嵌；页头
品牌+「副本掉落公示」互链+页脚）；css/decor-public.css 追加 .data-decor-body
公开壳外壳段（1100px 版心页头/页脚，登录壳零影响）；data.html 头部互链一行
「🏠 家宅图鉴公示」+版本串同步 20260918.65（此外零触碰，diff 断言锁）；
server.js 静态白名单放行 decor.html（SEC-002 边界必要放行）+安全测试断言；
顺手修 WP1 遗留：搜索后计数条不刷新（decorData.js 两处补 refreshCount()，
双壳同受益）；AGENTS.md 同步。
【范围】纯前端只读，零 schema 零数据写入；index.html/app.js/导航分组零触碰
（#52 范围）；data-public.css/dataPublic.js 零触碰；零依赖零构建；未 commit
未 push。
【验证】scripts/verify-task51-wp2.js 真浏览器 39/39 全绿：无痕免登录三态
（加载中/空结果/拦截失败重试）；2062=库内 anon 对照（2023+39）；基准六件
28350/27973/27043/675/25546原文兜底/8176 详情逐件断言；占位图 39=库内计算值；
房间 39/宠物 11 筛选对库；翻页首卡 rid=487=库内第 61 件；双向互链真点击往返；
768px 折叠↔展开+网格降列（图标 72→56）；双壳同源 19 项静态断言（decor.html
零内嵌/data.html diff 行锁）；全程零 JS 报错零 ≥400；node --check 四文件+
server-security 测试全过；截图 backup/2026-09-18-task51-wp2/（5 张）。
```
