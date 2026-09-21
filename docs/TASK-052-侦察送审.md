# 任务书 #52 零节侦察报告（送审闸）

> 日期：2026-09-19 ｜ 执行：Kimi Code ｜ 状态：**送审，待顾问一道闸确认后才动 WP1**
> 依据文档：《开发规范》V1.0、《UI工作方法》、《魔兽管家UI设计规范v2》、《问题与需求清单》（REQ-137 行）、任务书 #52
> 开工前提核验：#51-补丁3 已 commit（9a9f0b2，工作区无已跟踪文件改动；仅存两件未跟踪文件=任务书52本文+diff-task51-wp1.txt，非施工面）✅

---

## 一、侦察五项（证据全部为「已测量」=源码直读，行号为当前工作区实测）

### 1. 导航全清单（index.html 侧边栏 `.nav-menu`，index.html:115-159）

| 序 | data-page / data-navkey | 文案 | 图标 | 行号 | 显隐条件 |
|---|---|---|---|---|---|
| 1 | dashboard | 仪表盘 | 📊 | 116 | 全角色；DOM 硬编码 `active`（默认落地页） |
| 2 | members | 成员管理 | 👥 | 119 | 全角色 |
| 3 | attendance | 考勤记录 | 📅 | 122 | 全角色 |
| 4 | loot | 装备分配 | ⚔️ | 125 | 全角色 |
| 5 | wishlist | 心愿单 | 🎯 | 128 | 全角色 |
| 6 | reports | 统计报表 | 📈 | 131 | 全角色 |
| 7 | data | 数据管理 | 💾 | 134 | 全角色 |
| 8 | changelog | 更新日志 | 📝 | 137 | 全角色 |
| 9 | datacenter | 数据中心 | 🗄 | 141 | **仅超管**：内联 `display:none` + `updateCloudUI()` 按 `MasterData.isSuperadmin()` 显隐（js/app.js:2103-2104）+ `switchPage` 守卫拦回（js/app.js:2380-2388） |
| 10 | lootdrop | 副本掉落 | 📖 | 146 | 全角色（只读），#28 WP5 双壳 |
| 11 | decor | 家宅图鉴 | 🏠 | 151 | 全角色（只读），#51 最小入口，注释自述「分组重构属 #52」 |
| 12 | **data-navkey=usercenter**（无 data-page） | 用户中心 | 👤 | 154 | 全角色；**非页签**——onclick=`openUserCenter()` 开 `#userCenterModal` 弹窗（index.html:1748），不切 `.page`；`data-navkey` 仅为参与 REQ-105 拖拽排序（`navKeyOf()` js/app.js:2256 取 `dataset.page \|\| dataset.navkey`） |

- **未读通知红点宿主**：用户中心项内部 `<span class="notif-dot nav-notif-dot" id="navNotifDot">`（index.html:157），显隐 js/app.js:1189-1198，CSS main.css:4465-4475。
- **侧栏公会行已移除**（REQ-103，index.html:113-114 注释），侧栏头部=品牌 logo + `#guildName` 纯展示。
- **侧边栏 footer**（index.html:160-174）：「💬 问题反馈」按钮+QQ 群悬浮卡（.fb-entry，任务书 #41）在版本号**上方**，`#appVersion` 最底；footer 非 `.nav-item`，不参与拖拽排序。
- **REQ-105 拖拽排序机制**（js/app.js:2249-2326）：`applyNavOrder()` 用 `menu.appendChild()` 逐个重排 `.nav-menu .nav-item`；无偏好回 `defaultNavOrder` DOM 快照；≤768px/触屏禁拖。**组头介入后的联动风险见 §四-2。**
- **移动端底部 Tab 是独立第二份 DOM**（index.html:1728-1745，`.bottom-nav` 仅 5 项：dashboard/members/wishlist/loot/data），与侧栏不同源，不含 decor/lootdrop/usercenter——本任务不碰。

### 2. 首页现状

- **默认落地页 = dashboard**：登录链路 `showAppView()`（js/app.js:2031-2046）→ `renderCurrentPage()`（js/app.js:2145-2157）读 `.nav-item.active` 的 data-page，**找不到回退 `'dashboard'`**；初始 `active` 硬编码于 dashboard nav-item（index.html:116）与 `#page-dashboard`（index.html:215）。topbar 标题「仪表盘」同硬编码（index.html:189）。
- **#page-dashboard 区块构成**（index.html:215-237，共两层三块）：
  1. `.stats-grid#statsGrid`——统计卡 ×4（JS 生成）：团员总数（含正式/替补/试用/离队细分副行）、本月活动次数（副行取消数）、平均出勤率、今日出勤（renderDashboard，js/app.js:2568-2645）；
  2. `.dashboard-grid` 左卡「最近活动 / 最近 5 次团本考勤」`#recentList`（已取消灰化+徽标，点击跳考勤 tab）；
  3. `.dashboard-grid` 右卡「出勤率排行 / Top 5」`#rankListTop5`。
- **WP2 双入口卡插入点**：`#page-dashboard` 顶部、`#statsGrid` 之前为天然落点，不触碰既有三区块。

### 3. 未登录态形态

- 全屏遮罩 `#authOverlay`（index.html:18-101，默认 `display:none`，未登录时 js/app.js:1446-1451 置 flex）：logo + 标题「魔兽管家」+ 副标 + 三个互斥表单 + `#authError` 错误槽。
  - **登录表单** `#authLoginForm`（:25-38）：邮箱/密码 + `handleLogin()` + 「立即注册」链接；
  - **注册表单** `#authRegisterForm`（:41-61）：显示名/邮箱/密码（REQ-094 强度条）+ `handleRegister()` + 「返回登录」btn-ghost；**注册不填公会**——实锤任务书 WP2-3 前提；
  - **无公会遮罩表单** `#authGuildForm`（:64-97）：提示语「你还没有加入任何公会，请创建或加入一个」（:65）；**现状主次=创建公会居主位**（公会名 :68 + 区域下拉 :72-79 + 服务器名自动补全 :84-85 → `handleCreateGuild()` btn-primary :88），「或者」分隔线（:89）后才是邀请码 `#joinInviteCode`（maxlength 8，:92）+ `handleJoinGuild()` **裸 `.btn` 无级别类**（:94），再一道「或者」（:95）+「返回登录」btn-ghost（:96）。
- **公示页外链现状：零**。全文件 grep `data.html|decor.html` 仅 4 处注释命中（index.html:145、150、690、740），认证遮罩/侧栏/topbar/正文无任何指向两公示页的 `<a>` 或按钮。未登录访客无法从 index.html 触达公示页。

### 4. 窄屏形态（≤768px）

- 三处 `@media (max-width:768px)` 块：main.css:1798-1806（translateX 滑出残留）、**main.css:2203-2314 主块（`.sidebar{display:none}` :2257-2260、`.menu-toggle{display:none}`、`.bottom-nav{display:flex}`）**、main.css:3498-3500（auth-container 宽度）。
- **结论：≤768px 侧边栏整体不存在**（`:1798` 滑出方案被同特异性且更靠后的 `display:none` 覆盖，汉堡钮同隐藏），唯一导航=底部 Tab 5 项。**新增组头在窄屏 100% 不可见**——引用 v2 §8「移动端审计口径」与 AGENTS.md「真手机侧栏 display:none 属移动封存已知取舍」，组头无需窄屏适配，标注「已知取舍-封存」。
- WP2 首页双卡「窄屏纵排」落点在主内容区而非侧栏，不受侧栏封存影响，需自建一条 ≤768 媒体查询（卡片 grid 纵排）。

### 5. 权限显隐规则

- **导航项层面几乎不按角色显隐**——viewer/editor/owner 看到的侧栏完全一致（除数据中心）。唯一前端权限门 `updatePermissionUI()`（js/app.js:2050-2053）：viewer 时 body 加 `viewer-mode` 类，CSS（main.css:3502-3516、3655-3658）隐藏 `.edit-only`/`.action-btns` 等页内写入口，考勤勾选禁交互但可见。
- 各 nav 项可见性：dashboard/members/attendance/loot/wishlist/reports/data/changelog/lootdrop/decor/usercenter = 三角色全可见；datacenter = 仅超管（双重防线）。**WP1 不动任何显隐逻辑。**
- 最终防线在服务端代理 `authorizeProxyRequest()`，本任务零触碰。

---

## 二、分组明细表（按任务书「定案倾向」填好，闸内确认）

| 组 | 成员（组内维持现 DOM 序） | data-page | 说明 |
|---|---|---|---|
| **公会团队管理** | 仪表盘 📊 | dashboard | 现序 1，默认落地页 |
| | 成员管理 👥 | members | 现序 2 |
| | 考勤记录 📅 | attendance | 现序 3 |
| | 装备分配 ⚔️ | loot | 现序 4 |
| | 心愿单 🎯 | wishlist | 现序 5 |
| | 统计报表 📈 | reports | 现序 6 |
| | 数据管理 💾 | data | 现序 7 |
| | 数据中心 🗄 | datacenter | 现序 9（超管显隐不动）；定案倾向「数据管理/数据中心等」明确归本组 |
| | 副本掉落 📖 | lootdrop | 现序 10；立项决策④在案 |
| **家宅** | 家宅图鉴 🏠 | decor | 现序 11，原位不动 |
| | 小宠物图鉴 🐾 | （无 data-page，无 onclick） | **预留位**：灰态禁用+cursor default，title「数据侦察中，敬请期待」，注释「REQ-137 二期预留，数据线另立」 |
| **不入组（底层）** | 用户中心 👤 | data-navkey=usercenter | 现序 12 最末，原位不动（含通知红点宿主） |
| | 更新日志 📝 | changelog | ⚠️ 见闸内待确认点 1 |

组头：「公会团队管理」「家宅」两枚，纯视觉不可点、不参与路由、独立类名（不用 `.nav-item`，避免被 switchPage 的 active toggle 与拖拽逻辑波及）。

---

## 三、UI 审计问题清单（improve-ui 审计附件）

审计面：侧边栏导航 / #page-dashboard / #authOverlay（登录+注册+无公会遮罩）。设计基准：v2 规范 + DESIGN.md。

| # | 问题 | 证据（已测量） | 修正建议 | 置信 |
|---|---|---|---|---|
| 1 | `.sidebar-title` 字重 600，违规范「侧边栏标题 16/**700** 金」 | 契约=v2 §3 尺度表；实现=main.css:84-88 `font-weight:600`；渲染面=侧栏头部品牌标题 | 600→700（一行 CSS）。**不在任务书范围**，请闸裁定：并入 WP1 顺手修，或另登记 | 高 |
| 2 | 无公会遮罩三出口按钮级别与视觉主次错位：创建=btn-primary 主、**加入=裸 `.btn` 无级别类**（v2 §4.1 四级唯一体系之外）、返回=btn-ghost | index.html:88/94/96；裸 btn 渲染为灰底描边（main.css:342-358），视觉重量反而高于 btn-ghost | **由 WP2-3 主次调换吸收**：邀请码加入升主路径后带 btn-primary，创建公会降级后换次级按钮（btn-ghost）——WP2 施工时一并定级 | 高 |
| 3 | 规范 §4.1 次级按钮登记名 `btn-secondary` 与代码现实不符：main.css 无 `.btn-secondary`，实际次级描边按钮=`.btn-ghost`（main.css:4014-4024，注释自述「次按钮」），index.html 10 处在用 | v2 §4.1 vs 全库 grep | 建议**规范侧更名登记** btn-secondary→btn-ghost（零代码改动）；属文档修订，请闸裁定后另行回写规范，本任务不动 | 中 |

**已知取舍（引用条款标注，不计入问题清单）**：
- ≤768px 侧栏 `display:none`、底部 Tab 仅 5 项不含 decor/lootdrop——v2 §8 移动封存 + AGENTS.md REQ-112 行末口径；
- 侧栏 translateX 滑出链路已死（main.css:1798 vs :2258 覆盖）——同属移动封存，不立项；
- 用户中心项无 data-page 开弹窗——REQ-103/#36 已拍板形态。

审计未采纳项（按 improve-ui 证明闸剔除）：通知红点、auth 链接 `javascript:void(0)` 等属功能/语义层，非视觉发现。

---

## 四、闸内待确认点（冲突即报，按任务书红线）

1. **更新日志落位冲突**：定案倾向「不入组=用户中心、更新日志等元功能，保持原位」，但 changelog 现 DOM 序 8 位于 data 与 datacenter **之间**——严格原位会把「公会团队管理」组从中间截断，两组式不成立；而「不入组（顶层/底层）」的措辞又暗示元功能应出组。**建议：changelog 移出组、落底层「用户中心之上」**（组外尾段，与 usercenter 同属元功能区，移动后相对原位的「数据管理之后」阅读动线基本保持）。备选=严格原位（不推荐，破分组）。请闸定。
2. **组头 × REQ-105 拖拽排序联动（实现要点，需闸认可动 js/app.js）**：`applyNavOrder()` 以 appendChild 重排全部 `.nav-item`，若组头只是 `.nav-menu` 内普通 div，重排后组头全部沉底/错位=已上线功能回归。WP1 拟对 `applyNavOrder()`/`refreshNavDraggable()` 做**最小适配**：重排完成后把两枚组头 `insertBefore` 到各自组内当前首个 nav-item 之前（组头自身无 key 不入 nav_order 持久化）；预留位同理无 key 不参与排序、禁拖。这属「行为保全」而非行为变更，但需动 js/app.js——任务书 WP1 标题写「index.html + main.css」，此处申请扩到 app.js 两函数（用户文件面已含 js/app.js）。若闸不允，则 WP1 只能接受拖拽后组头错位，不可交付。
3. **预留位实现口径**：不带 data-page/data-navkey、无 onclick、`disabled` 灰态（建议类 `.nav-item-disabled` 独立样式，不污染 `.nav-item` 族群）、title「数据侦察中，敬请期待」、注释「REQ-137 二期预留，数据线另立」。请闸确认文案/图标（🐾）与 title 措辞。
4. **审计发现 1/3 是否并入本任务**（见 §三表）。

## 五、WP1/WP2 实现要点预告（施工时遵守，非本次改动）

- WP1：组头样式 `.nav-group-label` 落 main.css（字号降一档≈11px、色 `--text-muted`、letter-spacing 微放宽、上间距分组——对齐 v2 §3「小标签可微放宽」）；`data-page`/onclick/显隐/角色规则零改动；verify 增补组头断言；版本串递增（当前 20260919.67）。
- WP2：双卡插 `#page-dashboard` 顶部 `#statsGrid` 前；复用 `.card` 体系不新建并行；:active 缩放+hover 提亮按 v2 §4.4/§6；登录墙公示链接行落 `.auth-container` 底部（`.auth-switch` 同族降一级样式）；遮罩主次调换零 JS 变更（handleCreateGuild/handleJoinGuild 不动），文案无 emoji。
- 红线自查：零触碰 decorData.js/decor-public.css/decorDict.js/decor.html；不做宠物功能；不做折叠/新排序增强。

---

## 六、结论

侦察五项完毕，分组明细表已按定案倾向填好，4 个闸内待确认点 + 3 条审计发现如上。**请顾问过闸：确认分组表（尤其待确认点 1 的 changelog 落位）与待确认点 2 的 app.js 最小适配授权后，开工 WP1。**
