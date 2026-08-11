# 任务书 #36 修改报告：REQ-103 主页用户/公会入口整合（用户中心页唯一入口·双卡同页）

> 日期：2026-08-11 ｜ 执行：Kimi Code ｜ 版本串：20260811.46 → **20260811.47**（index.html 10 处 + data.html 6 处全量同步）
> 流程：前置侦察五项先行送审（§1），两请示点（通知点迁 nav / task29 C4·C5 裁定驱动更新）经运营放行后施工。
> 红线自查：零依赖、零 schema 变更；仅显示层与入口归位；测试数据自清理复核为零；**未 commit 未 push**。

---

## 〇、前置侦察结论（已送审放行，要点留存）

1. **头像菜单**：触发行（头像/昵称/身份徽章/▾）+ 下拉（REQ-094 头部 + 用户中心/切换公会/分隔线/退出登录）；消费者 userMenuAction 三分支 + updateCloudUI 头部渲染块。
2. **侧栏公会行**：guildBarName+guildRole+👤（含 .notif-dot 未读点宿主）+⚙；切换公会触发点在头像菜单不在此行；⚙→guildSettingsModal。
3. **左上角公会卡**：无任何 click/hover 交互（现状即纯展示，WP3 零改动）；显示真源=BUG-073 归一 guildDisplayName。
4. **用户中心**：模态框 modal-body = 玩家ID卡 → 五 tab；渲染链 openUserCenter→loadUserProfile 等；公会卡插入点=modal-body 顶部。
5. **引用扫描**：openGuildSwitcher/openGuildSettings 各仅一处调用（菜单项/⚙）；openUserCenter 三处（菜单项/👤/nav）；无快捷键、无空态引导指向被删入口；移动端 bottom-nav 零牵连。

## 一、修改文件清单

| 文件 | 位置 | 改动 |
|---|---|---|
| index.html | userCenterModal modal-body 顶部 | WP1：新增 #ucGuildCard 公会卡（名称 #ucGuildCardName + 角色徽标 #ucGuildCardRole +「公会设置」「切换公会」两按钮复用现有 modal） |
| index.html | 头像菜单下拉 | WP2：移除 REQ-094 头部 + 用户中心/切换公会项 + 分隔线，只留「🚪 退出登录」 |
| index.html | 侧栏 | WP4：.guild-bar 整行移除；nav「用户中心」项加 #navNotifDot（通知点新宿主）；顺带清除死元素 #sidebarUser（无任何写入点的空 div） |
| js/app.js | 新增 `renderUcGuildCard()` + loadUserProfile 接入 | WP1：名称走 guildDisplayName 真源、角色徽标复用 roleLabels/着色 |
| js/app.js | `updateCloudUI()` | WP2/WP4 清理：guildBar 显隐、guildBarName、guildRole、userMenuHead 渲染块全部移除（元素已不存在）；userMenu 昵称/头像、userRoleBadge、#guildName 保留 |
| js/app.js | `userMenuAction()` | WP2：只留 logout 分支（center/switch 分支移除，零残留） |
| js/app.js | loadNotifications 通知点选择器 | WP4 附加（运营放行）：`.user-center-btn .notif-dot` → `#navNotifDot`，显隐条件与数据源零变化只换宿主 |
| js/cloud.js | `updateGuildUI()` | WP4 清理：guildBarName（task35 所加）与 guildRole 写入移除；#guildName（BUG-073 真源）与 #userInfo 保留 |
| css/main.css | 新增 .uc-guild-card 族 + .nav-item .notif-dot | WP1 卡片族样式（沿用 uc-playerid-card 规格，全宽，窄屏 wrap）；通知点新宿主定位（.nav-item 本有 position:relative） |
| css/main.css | 清理 | .guild-bar* 族（含 role 着色）/.user-center-btn 族（含旧通知点规则）/.user-menu-head*/.user-menu-divider 全部移除，零残留 |
| js/app.js | changelogData 顶部 | 补录「功能优化」REQ-103 |
| scripts/verify-task29-wp1.js | C4/C5 | **裁定驱动更新（运营确认，非放宽）**：C4 改断言「下拉仅退出登录一项+头部不存在+trigger 高度不变」；C5 改断言「trigger 昵称跟随改名」（玩家ID卡由 C2 兜底）；注释引用任务书 #36 |
| scripts/verify-task35.js | A1 | **裁定驱动适配**：#guildBarName 已移除，20 次采样断言改 #guildName 单点 + 元素不存在断言；注释引用任务书 #36 |
| scripts/verify-task36.js | 新建 | 10 项：WP3 纯展示 / WP4 移除零残留+通知点 / WP2 菜单精简+交互 / WP1 公会卡置顶+computed+两入口走通 |
| index.html / data.html | 版本串 | 20260811.46 → 20260811.47（10 + 6 处） |
| docs/问题与需求清单.md | **仓库副本**台账 | 登记 REQ-103 |

`node --check` js/app.js、js/cloud.js、三个 verify 脚本均通过；全站 grep 零残留（guildBar/guildRole/user-center-btn/userMenuHead/user-menu-head/user-menu-divider 仅存在于注释说明）。

## 二、验证（真浏览器实测，scripts/verify-task36.js，10/10 PASS）

- **C1 WP3 左上角纯展示**：品牌+「T36A公会 （无尽之海）」文本在、header/guildName 零 onclick、computed cursor 均 auto（非 pointer）。
- **D1 WP4 移除零残留**：guildBar/guildBarName/guildRole/.user-center-btn 四元素全不存在；nav「用户中心」在；通知点已在 nav 内。**D2 通知点新宿主生效**：未读 1 条 → #navNotifDot .show（computed display=block）——显隐条件与数据源零变化。
- **B1 WP2 菜单**：userMenuHead 不存在、下拉仅「退出登录」一项；trigger 昵称/身份徽章不动；**B2 点外关闭交互不变**。
- **A1 WP1 公会卡**：modal-body 首元素（玩家ID卡次之）、名称=「T36A公会 （无尽之海）」（guildDisplayName 真源）、会长徽标 role-owner 着色、两按钮 onclick 复用 openGuildSettings/openGuildSwitcher；**A2 §2 computed**：卡片族背景 rgb(28,33,40)/圆角 8px/flex。**A3 两入口走通**：公会设置/切换公会 modal 经 modalStack 叠开于用户中心之上，关闭后用户中心仍在。
- 截图 `a-uc-guild-card.png`（公会卡置顶双卡同页）、`b-avatar-menu.png`、`a3-card-modals.png`（已抽看）。
- 全程零 JS 报错；测试数据清零复核全 0（guilds/notifications/profiles/auth）。

## 三、回归十组全绿

| 项 | 结果 |
|---|---|
| verify-task36（本包） | **10/10** |
| verify-task27-wp1 / wp2 / patch | **8/8 · 27/27 · 24/24** |
| verify-task29-wp1 | **27/27，SKIP 0**（C4/C5 裁定驱动更新后全绿） |
| verify-task32 | **16/16** |
| verify-bug071（task33） | **15/15** |
| verify-task34 | **18/18** |
| verify-task35 | **13/13**（A1 裁定驱动适配后全绿） |
| npm test（server-security） | **5/5** |
| SEC-001（verify-authz.js） | **34/34** |

各组测试数据清零复核均为 0（T36A 前缀全 0；task27/task29/task32/bug071/task34/task35 各前缀复核全 0）。

## 四、§1 副作用审计单（移除项影响面逐项）

| 移除/变更项 | 影响面 | 验证方式 | 结论 |
|---|---|---|---|
| 头像菜单 REQ-094 头部 + 用户中心/切换公会项 | **菜单开关/点外/ESC 交互**不动；trigger（昵称/头像/身份徽章/▾）不动；玩家ID主展示=用户中心卡（C2 回归兜底） | B1/B2 + task29 C4/C5 更新后回归 | 无 |
| updateCloudUI 头部渲染块移除 | **改名即时刷新（BUG-072）**：topbar 昵称/头像仍由本函数刷；玩家ID卡由 loadUserProfile 刷 | task29 C5 更新后断言 | 无 |
| userMenuAction center/switch 分支 | **两功能入口迁移**：新唯一调用点=公会卡按钮；函数本身保留（logout） | A3 走通 + 引用扫描 | 无 |
| 侧栏公会行整行移除 | **updateCloudUI/cloud.js updateGuildUI 引用**同步清理；角色展示迁公会卡徽标+trigger 徽章（未丢信息）；布局自然收拢（nav 上移贴顶） | D1 零残留断言 + 截图 | 无 |
| .guild-bar*/.user-center-btn/.user-menu-head*/.user-menu-divider CSS 族 | **零使用方残留**（markup 已同步移除）；.role-badge（trigger/公会卡在用）与 .guild-bar-role 是两套，未误删 | grep 零残留 + 截图视觉 | 无 |
| notif-dot 迁 nav | **显隐条件/数据源零变化**（同一 loadNotifications 同一 unreadCount），仅宿主与定位样式 | D2 computed 断言 | 无（运营放行附加项） |
| #sidebarUser 死元素移除 | 无任何写入点（updateCloudUI 原为死读），空 div 无渲染 | grep + 截图 | 无 |
| 左上角公会卡 | **WP3 零改动**：侦察即确认无交互；#guildName 仍走 BUG-073 真源 | C1 + task35 A1 采样回归 | 无 |
| task29/task35 断言更新 | **裁定驱动非放宽**：C4/C5/A1 新口径断言更贴近现行规格（菜单仅退出、trigger 昵称跟随、采样单点恒定） | 两脚本复跑全绿 | 无 |

## 五、§4 数据样本前提声明

- **样本**：T36A 前缀单公会（带 server_name 无尽之海）owner 账号 + 未读通知 1 条（通知点断言）。**多公会账号切换场景样本：本包未单独构造**（如实标注）——切换公会 modal 走通已由 A3 覆盖（弹窗叠开机制），公会名切换路径的 20 次采样稳定性由 task35 A1（双公会样本）持续兜底。
- **存量真实数据**：线上真实公会/账号只读未动；T36A 前缀自清理复核为零。

## 六、遗留与后续

- 无新增遗留。B 表 5 项（运营手工）随批交付。
- 台账（**仓库副本** docs/问题与需求清单.md）已登记 REQ-103；changelog「功能优化」已补录。
- **未 commit 未 push**，报告 + 审计单送审。
