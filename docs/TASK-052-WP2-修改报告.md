# 任务书 #52 WP2 修改报告：首页双入口耦合 + 登录墙公示链接 + 无公会遮罩主次调换（REQ-137 一期收尾 / REQ-138）

> 日期：2026-09-19 ｜ 状态：**送审，未 commit 未 push** ｜ 前置：WP1 线上终审全绿（顾问钉点全过）
> 范围纪律：仅 index.html / css/main.css / js/app.js（仅 changelogData 补录两条，零逻辑变更）+ 版本串三壳同步 + 新增 verify 脚本 + 台账登记；零触碰 decorData.js/decor-public.css/decorDict.js；decor.html/data.html 仅版本串递增。

---

## 一、改动清单

### 1. dashboard 顶部双入口大卡（index.html `#page-dashboard`，插于 `#statsGrid` 之前）
- `.entry-cards` 容器内两张 `.card .entry-card`（**复用 .card 体系，不新建并行体系**）：
  - 左「⚔️ 公会团队管理」——「考勤、装备、心愿单——团长每晚的行政工作，十分钟打完」→ `switchPage('attendance')`（侦察后定：dashboard 即落地页，公会线主入口跳考勤页，任务书口径）；
  - 右「🏠 家宅」——「2062 件家宅装饰全量目录，来源筛选一键到位」→ `switchPage('decor')`（decor 懒挂载 ensureDecorMounted 经 switchPage 正常触发，实测在案）。
- 既有 stats-grid/dashboard-grid 两区块零改动，实测统计卡 4 张不受影响（verify B4a）。
- 样式（main.css `.entry-cards` 段，约 :884-921）：桌面双列 grid、≤768 纵排；hover 底色亮一档（`--bg-tertiary`，深色浮层纪律）+ 边框提亮；`:active scale(0.97) 100ms` 按下即反馈（v2 §4.1/§7）；全角色可见（viewer 实测在案）。

### 2. 未登录登录墙公示链接行（index.html `#authOverlay`，`#authError` 之后容器底部）
- `无需登录：<a href="decor.html">家宅图鉴公示</a> · <a href="data.html">副本掉落公示</a>`（.auth-public-links：12px/muted/居中，链接弱色 hover 金色——样式降一级，登录表单视觉优先级不动摇，截图 03 实证）。
- **新 Tab 打开**（`target="_blank" rel="noopener"`）：登录页驻留不丢输入态，公示页看完后关 Tab 即回登录页——两壳行为一致，均为新 Tab。

### 3. 无公会遮罩主次调换（REQ-138，index.html `#authGuildForm`，纯结构与文案，handleCreateGuild/handleJoinGuild 零逻辑变更）
- a. **邀请码加入提为主路径**：移为第一区块，label 上方引导「团员请向会长索取 8 位邀请码」（新增 .auth-field-hint 小字级），按钮升 `btn-primary`（顺手销账审计发现②「加入公会裸 .btn 无级别类」）；
- b. **创建公会降次级**：置于「或者」分隔线后，引导「你是会长？创建新公会」，公会名/区域/服务器三字段原样跟随（id/oninput/onfocus/onblur 全保留），按钮降 `btn-ghost`；
- c. 顶部提示语改「加入公会后即可使用全部功能」；
- d. 「返回登录」btn-ghost 原位保留；
- e. 区块零 emoji（verify A3e 正则断言）。

### 4. 版本串三壳 20260919.68→**20260919.69**（index 14 处 / decor 5 处 / data 7 处，旧串零残留）

### 5. 应用内 changelog 四维补录（任务书 #52 整包收官，js/app.js changelogData 顶部两条）
- `v3.2.0-task52-home-entry`（新增功能）：双卡+公示链接+遮罩调换；
- `v3.2.0-task52-nav-groups`（模块调整）：WP1 导航两组式+预留位+字修订。

### 6. 台账说明
- REQ-138 编号由运营侧提出（2026-09-18 拍板并入 WP2）；**《问题与需求清单》归顾问侧维护，本包零触碰**——REQ-138 行登记与 REQ-137 行状态更新请顾问侧补录（建议措辞可取自本报告 §一.3 与 changelog 条目）。

### 7. scripts/verify-task52-wp2.js（新增，A 静态 22 项 + B 浏览器 17 项 + C 清零 3 项）

## 二、验证（真浏览器实测，playwright chromium headless 自起服务器 :15053）

**verify-task52-wp2.js：42/42 全绿**（复跑输出存档 backup/2026-09-19-task52-wp2/verify-output.txt）。

主链路实测明细（页面/按钮/交互/结果）：
- **遮罩主路径（真注册路径 D 用户，无公会）**：登录 → 遮罩新主次态（第一区块=邀请码+引导、加入公会 btn-primary 金钮、创建公会 btn-ghost 次级、提示语新文案，截图 04）→ 输错误邀请码点「加入公会」→ 提示「邀请码无效」+遮罩不关+数据未入 → 输正确邀请码 → **加入成功进 dashboard，公会名正确**（主链路全真走通）；
- **建会次级路径回归（H 用户）**：遮罩 → 填公会名 → 「创建公会」→ 建会成功进 dashboard（不回归不破）；
- **双卡真点击**：owner 登录 dashboard → 点「公会团队管理」卡 → 考勤页 active+导航高亮同步；回首页点「家宅」卡 → decor 页签 active + 懒挂载真实渲染（.dh-card 可见）；
- **768 窄屏**：390px 视口双卡纵排断言（上下堆叠左缘对齐）+截图；
- **三角色各一张**：owner（01）/editor（05）/viewer（06，viewer-mode 类在）双卡全角色可见；
- **登录墙**：未登录态链接行可见、两枚 href/target 断言（截图 03）；
- 零 JS 错误、零 4xx/5xx（白名单同 WP1：user_profiles 409 首登竞态 + 物品图标 404 缺素材 onerror 隐藏）；
- 测试数据自清理：5 用户/2 公会/偏好行删除后复核为零（C1-C3）。

截图证据（backup/2026-09-19-task52-wp2/）：01-dashboard-cards-desktop / 02-dashboard-cards-390 / 03-loginwall-links / 04-guild-overlay-new / 05-dashboard-cards-editor / 06-dashboard-cards-viewer。

## 三、遗留

1. 遮罩「创建公会」降 btn-ghost 后与「返回登录」同级的观感已截图送审（04），如需再降档（btn-text）属规范层决策，另行裁定。
2. 审计发现③（btn-secondary 规范更名）与 index.html:702/705 残留类名小尾巴维持 WP1 报告登记，另走流程。
3. REQ-137 二期（小宠物图鉴数据线）未启动，预留位已立（WP1）。

## 四、任务书 #52 整包状态

WP1 ✅ 线上终审全绿（已 commit d2c7b1b）；WP2 本报告送审。整包文件面：index.html / css/main.css / js/app.js（三函数+changelogData）/ decor.html / data.html（仅版本串）/ scripts/verify-task52-wp1.js / scripts/verify-task52-wp2.js / docs 三件（侦察送审、WP1/WP2 报告）。待验收通过后按 commit 规范「任务书#52-WP2」单包提交（当前未 commit 未 push）。
