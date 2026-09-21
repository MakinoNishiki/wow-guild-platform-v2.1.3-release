# 任务书 #52 WP1 修改报告：导航两组式（REQ-137 一期收尾）

> 日期：2026-09-19 ｜ 状态：**送审，未 commit 未 push** ｜ 前置：侦察闸 2026-09-19 过（docs/TASK-052-侦察送审.md，4 点定夺在案）
> 范围纪律：仅 index.html / css/main.css / js/app.js（限顾问授权的 applyNavOrder / refreshNavDraggable / initNavDragSort 三函数）+ 版本串三壳同步 + 新增 verify 脚本；零触碰 decorData.js/decor-public.css/decorDict.js；decor.html/data.html 仅版本串递增。

---

## 一、改动清单

### index.html（侧边栏结构归组，行号以改后计）
- `.nav-menu`（index.html:115-175）重排为：组头「公会团队管理」→ 9 项（仪表盘/成员/考勤/装备/心愿/报表/数据管理/数据中心/副本掉落，各加 `data-nav-group="guild"`，**组内维持现 DOM 相对序**）→ 组头「家宅」→ 家宅图鉴（`data-nav-group="home"`）→ **小宠物图鉴预留位** → 更新日志（顾问闸①：移出分组沉底至用户中心之上）→ 用户中心（原位最末）。
- **预留位** `<div class="nav-item-disabled" id="navPets" title="数据侦察中，敬请期待" aria-disabled="true">🐾 小宠物图鉴`：无 data-page/data-navkey/onclick，注释标明「REQ-137 二期预留，数据线另立」；窄屏底部 Tab 独立 DOM 不加预留位（闸③）。
- **全部 data-page id / onclick / 显隐逻辑 / 角色权限规则零改动**（纯结构归组）；数据中心内联 `display:none` 与超管显隐链原样跟随。
- 版本串 20260919.67→**20260919.68**（顶部注释 + 全部 14 处 ?v=）。

### css/main.css
- `.sidebar-title` font-weight 600→**700**（审计发现①，顾问闸④批准并入；对齐 v2 §3「侧边栏标题 16/700 金」）。
- 新增 `.nav-group-label`（main.css:102-113）：11px（降一档）+ `--text-muted`（降一级）+ `letter-spacing:0.08em`（v2 §3 小标签可放宽）+ 上间距 14px 分组（`:first-child` 免顶距）+ cursor default + user-select none。
- `.nav-item` 布局规则扩展为 `.nav-item, .nav-item-disabled` 共用（几何同版零漂移），新增 `.nav-item-disabled` 覆盖规则：muted 色 + opacity 0.55 + cursor default（无 hover 响应，无 .nav-item 类故 switchPage/拖拽天然不波及）。

### js/app.js（限授权三函数，最小适配）
- `applyNavOrder()`（app.js:2260-2284）：重排循环后新增组头/预留位重定位段——组头 `insertBefore` 至该组（`data-nav-group` 匹配）当前首个 .nav-item 之前；`#navPets` 紧跟 decor 项之后。组头/预留位无 key、不入 nav_order 数组、写库/回滚链路零变更。
- `refreshNavDraggable()`（app.js:2290-2296）：防御性钉死组头/预留位 `draggable=false`（本就无 .nav-item 类不被赋值，双保险）。
- `initNavDragSort()` dragend（app.js:2329-2336）：落定后先 `applyNavOrder(currentNavOrder())`（forced=当前序，项序不变、仅组头即时归位）再 `persistNavOrder()`；persistNavOrder 本体零触碰。

### 版本串同步（开发规范第五章第 6 条 + 闸②「两壳递增义务」）
- decor.html：.67→.68（注释 + 4 处 ?v=，本任务其内容零改动）；data.html：.65→.68（注释 + 6 处 ?v=，原滞后两档一并拉齐）。

### scripts/verify-task52-wp1.js（新增，A 静态 24 项 + B 浏览器 16 项 + C 清零 3 项）
- 覆盖任务书 WP1 验收全部口径 + 闸②回归证据四条（拖拽换序→刷新保持 / 换账号序不串 BUG-078 / ≤768 拖拽禁用 / 超管与编辑各过一遍）。

## 二、验证（真浏览器实测，playwright chromium headless 自起服务器 :15052）

**verify-task52-wp1.js：43/43 全绿**（输出全文存档见会话，脚本可复跑）。

主链路实测明细（页面/交互/结果）：
- **导航切换回归**：owner 登录后逐一点击 10 个页签（成员/考勤/装备/心愿/报表/数据/更新日志/副本掉落/家宅图鉴/仪表盘），每次 `.nav-item.active` 与 `#page-*` 同步切换正常；副本掉落/家宅图鉴懒挂载内容真实渲染（`.dh-card` 可见）；用户中心弹窗开合正常。
- **拖拽换序→刷新保持**：心愿单拖至成员管理前→落定后组头即时归位（公会组头仍在首位、家宅组头在 decor 前、预留位紧跟 decor）→ 刷新后序保持（nav_order 持久化读回一致）。
- **换账号序不串（BUG-078）**：同浏览器退出 A(owner) 登录 B(editor)→导航回默认快照序、组头归位、B 桌面拖拽可用。
- **≤768**：resize 390px 全项 draggable=false；侧栏 display:none + 底部 Tab 在（已知取舍-封存，v2 §8）；769px 组头宽度≤200 不破位。
- **超管**：C（app_metadata superadmin）登录见数据中心，位于数据管理与副本掉落之间（公会组内）；编辑/超管各过一遍。
- **零 JS 错误、零 4xx/5xx**（白名单：user_profiles 409 首登竞态既有先例 + assets/icons/items/* 404=物品图标缺素材 onerror 隐藏既定行为 REQ-092）。
- **测试数据自清理**：三用户/两公会/偏好行删除后复核为零（C1-C3）。

截图证据（backup/2026-09-19-task52-wp1/）：
- `01-sidebar-desktop.png` 桌面两组态（含预留位灰态、changelog 沉底）
- `02-narrow-390.png` 390px（侧栏隐藏+底部 Tab，已知取舍）
- `03-after-drag.png` 拖拽落定后组头归位
- `04-sidebar-769.png` 769px 组头不破位
- `05-sidebar-superadmin.png` 超管含数据中心两组态
- 任务书验收条「768px 窄屏展开态」与现实冲突：768px 侧栏 display:none 无展开态可言（侦察§4 已测，v2 §8 封存），以 390+769 两图替代说明。

## 三、遗留与登记

1. 审计发现③（规范 §4.1 登记名 btn-secondary vs 代码现实 btn-ghost）：顾问闸④定=规范更名另走回写流程，本任务不动；index.html:702/705 两处 btn-secondary 无定义残留类名已登记小尾巴，不归本任务修。
2. 跨组拖拽后的视觉归属：组头按静态 `data-nav-group` 归属随组走，用户若把公会组项拖到家宅组区域，项仍属公会组（组头位置不动）——组头仅标注默认语义分组，自由排序优先；已在代码注释声明，属闸②批准策略的既定语义。
3. 更新日志（应用内 changelog 页）四维补录：按开发规范 5.5 属提交前门禁，本任务不 commit，待 WP2 收官一并补录。
4. WP2（首页双入口 + 登录墙公示链接 + 无公会遮罩主次调换）未开工，等 WP1 送审通过。
