# 任务书 #44 修改报告｜修复小包：导航串号+回到今天+面板减重（BUG-078/BUG-079/REQ-115）

> 施工日期：2026-08-13。仓库副本：tasks/任务书44-修复小包-导航串号与面板减重.md（运营指令原文存档）。
> 红线执行：零依赖零 schema；版本串 20260811.55→.56 两壳 16 引用+2 头部注释；测试数据 T44 前缀终清理复核为零；不 commit 不 push。

---

## §1 审计单（开工前置）

### 1.1 BUG-078 病灶定位（前端换号残留三处 + 全局键一处）

| # | 审计点 | 实证 | 定性 |
|---|---|---|---|
| 1 | 导航 DOM 序 | SPA 不刷新页面，拖拽重排只改 DOM，登出不还原 | 残留源 ① |
| 2 | `applyNavOrder()` | 旧逻辑「无偏好=早退」，把 DOM 残留的上一账号序当默认序 | 残留源 ②（主病灶） |
| 3 | `userPreferences`（cloud.js 模块级内存） | 登出不重置，新账号偏好加载完成前沿用旧值 | 残留源 ③ |
| 4 | `wow_raid_last_guild` localStorage 全局键 | 无用户维度，A 退出后 B 登录读到 A 的公会 id | 全局键串用 |
| 5 | 服务端隔离 | 任务书 #42 B14 已证：偏好按 user_id 行隔离，RLS 正常 | 非病灶（B14 口径） |

### 1.2 localStorage 全局键盘点（全量）

| 键 | 维度 | 处置 |
|---|---|---|
| `wow_raid_last_guild` | 旧全局 | **改用户维度键 `wow_raid_last_guild:{userId}`**（cloud.js 读/写/清 3 处 + app.js 1 处）；旧键不迁移（跨账号迁移正是病灶），各读写点开键即删自然废弃 |
| `wow_raid_attendance_data` | 全局缓存 | **登出即删**（onUserSignedOut）；云端模式本就不读它（loadData 早退），纯写残留 |
| `attendanceView:{userId}:{guildId}` | 已用户+公会双维度 | 不动（BUG-023 先例） |
| `recentRaidNames:{guildId}` | 公会维度 | 不动（公会 id 天然隔离，非账号串号面） |
| `wow_raid_supabase` | 认证会话键 | 不动（supabase-js  SDK 自管，signOut 清会话） |
| sessionStorage（dp43:filterOpen/折叠记忆） | 公示页 UI 态 | 不动（无账号数据，公开壳同源） |

### 1.3 BUG-079 同义按钮全站扫描

grep `>今天 / >今日 / goToday / backToToday` 全站（*.html/*.js）：唯一按钮 = index.html:349 考勤日历「今天」；`今日出勤`（app.js:2552）为仪表盘统计标签非按钮，不动。

### 1.4 REQ-115 面板规则审计

≥1400 面板态 `.dp-filterbar` 旧规则 `top: calc(var(--dp-panel-top)+12px)` + `bottom: 12px` 双向锚定 = 恒拉满全高（内容再少也撑到 viewport 底）。框体四边闭合/264px/z=10/overflow-y:auto/卡片区 margin-right:292 为任务书 #43 验收资产，**全部保留不动**。

---

## §2 修改清单（实际改动点）

| 文件 | 改动 |
|---|---|
| js/cloud.js | ①新增 `lastGuildStorageKey()`/`getLastGuildId()`（用户维度键）+ 导出；②`clearCurrentGuild`/`onUserSignedIn`/`selectGuild` 三处改用户键、旧全局键开键即删；③`onUserSignedOut()` 增三清：`userPreferences={}`、删 `wow_raid_attendance_data`、`applyNavOrder()` 回默认序 |
| js/app.js | ①`defaultNavOrder` 在 `initNavDragSort()`（脚本末尾执行，早于一切登录/拖拽）快照 DOM 原序；②`applyNavOrder()` 无偏好由「早退」改「回默认序快照」；③8778 行 last_guild 读取改 `CloudSync.getLastGuildId()`；④changelog 四维补录 3 条（修复 BUG×2/体验优化×1） |
| index.html | ①349 行按钮「今天」→「回到今天」；②版本串 .55→.56（11 处） |
| css/data-public.css | ≥1400 面板态删 `bottom:12px` 拉满锚定，`height:auto` 生效 + 新增 `max-height: calc(100vh - var(--dp-panel-top, 0px) - 24px)`（顶部偏移+上 12 间距+下 12 底部余量）；登录壳覆盖行同步补 max-height（回退值 56） |
| data.html | 版本串 .55→.56（7 处） |
| scripts/verify-task44.js | 新增验证脚本（27 断言，见 §3） |
| tasks/任务书44-修复小包-导航串号与面板减重.md | 运营指令原文仓库副本（素材入库规则） |
| docs/问题与需求清单.md | BUG-078/BUG-079/REQ-115 三条登记（注明仓库副本路径） |

`node --check`：js/cloud.js、js/app.js、js/dataPublic.js、scripts/verify-task44.js 全过。

---

## §3 验证（verify-task44.js 27/27，真浏览器，截图 backup/2026-08-13-task44/）

### B 组｜BUG-078 双样本自动化（同浏览器同 page 零刷新 = B11 实证场景）

- B1 A 首登默认序=DOM 原序（11 项含 usercenter/navkey）✓
- B2 登录后 `wow_raid_last_guild:{uidA}` 用户键写入 + 预置的旧全局键种子读前清除 ✓
- B3/B4 A 拖拽调序（members→dashboard 前）DOM 落定 + 库内 nav_order 一致（服务端隔离正常，B14 口径复核）✓
- B5 A 退出（真点击头像菜单「退出登录」）→ 导航 DOM 回默认序 ✓
- B6 退出清缓存：`wow_raid_attendance_data` 已删、旧全局键零残留 ✓
- B7 B 同页登录、偏好加载完成前即刻读 = 默认序（默认序不抢跑，无 A 序闪现）✓
- **B8 串号修复核心断言：A 调序→退出→B 同页登录 = 默认序** ✓
- **B9 B 退出→A 再登录 = A 自己的序（服务端加载后应用）** ✓

### C 组｜BUG-079 主链路实测

- C1 考勤→日历视图，按钮文案 =「回到今天」✓
- C2 真点击链路：翻走 2 个月（2026年10月）→ 点「回到今天」→ 回当月（2026年8月）✓（截图 calendar-back-to-today-1366.png）

### D 组｜REQ-115 computed 实测（§2 口径，双壳 × 双分辨率）

| 断言 | 公开壳 data.html | 登录壳 #page-lootdrop |
|---|---|---|
| 1920 面板 fixed + 264px + z=10 + 底部不拉满 | ✓ 底部余量 543px（收缩实证） | ✓ 底部余量 536px |
| 1920 max-height 公式 = 100vh−顶部偏移−底部余量 | ✓ 967 ≈ 1080−101−12 | ✓ 960 ≈ 1080−108−12 |
| 1920 高度随内容收缩/超出才内部滚动 | ✓ h=436 < maxH=967（收缩分支，overflow-y:auto） | ✓ h=436 < maxH=960 |
| 1920 框体四边闭合 + 卡片区让位 292 | ✓ 四边框 1px/圆角 8px/底色非透明 | ✓ mainMR=292px |
| 1366 折叠顶栏态零回退 | ✓ sticky 吸顶 | ✓ sticky top=56px |

截图：panel-public-1920.png / panel-login-1920.png / topbar-public-1366.png / topbar-login-1366.png。

### 其他

- 全程零 JS 报错、零 404；T44 前缀公会/测试用户×2 终清理，复核为零 ✓
- 注：Chrome 对定位元素 inset 返回使用值，`bottom:auto` 无法以字符串断言，减重改几何实证（底部余量 ≫12px 即未拉满）；一轮脚本曾因此误报，断言修正后三跑 27/27（二跑系本机环境悬挂，已加 30s 有界超时防御，与产品代码无关）

---

## §4 回归（红线清单全绿）

| 套件 | 结果 |
|---|---|
| verify-task27-wp1 | ✅ 8/8 |
| verify-task27-wp2 | ✅ 27/27（见 §4 注 3：脚本日期漂移维护后复跑全绿） |
| verify-task27-patch | ✅ 24/24（并行首跑 #lootName 超时系三浏览器资源竞争，串行复跑全绿） |
| verify-task29-wp1 | ✅ 27/27 |
| verify-task31 / task32 | ✅ 16/16、16/16 |
| verify-bug071 / task34 / task35 / task36 / task38 | ✅ 15/15、18/18、13/13、10/10、17/17 |
| verify-task37 | ✅ 25/25（并行首跑 24/25：T43/T40 样本共存致全局计数断言干扰，串行复跑全绿） |
| verify-task39 / task41 / task42 | ✅ 18/18、17/17、24/24 |
| verify-task40 / task43 | ✅ 21/21、27/27（并行首跑基线/计数断言互相踩主数据样本，串行复跑全绿） |
| verify-authz（SEC-001） | ✅ 34/34 |
| npm test | ✅ 通过 |

注 1：task37/40/43 三套件共享主数据表并断言全局基线（308/104/204），并行互踩属套件使用方式问题，本包起回归一律串行。
注 2：本包改动面（导航/logout/日历文案/面板 CSS/版本串）与全部首跑失败项零交集，归因均经串行复跑或 HEAD 基线实证。
注 3：verify-task27-wp2「排名表含李雷灰色已删除行」在 **HEAD 基线同样失败**（换基线复现实证，非本包引入）——根因为脚本硬编码活动日期 2026-08-05/06 漂移出报表页默认 7 天范围（BUG-014 口径）；已做脚本维护（日期改动态昨天/今天，产品零改动）。

---

## §5 B 表（运营手工复核 4 项）

| # | 复核项 | 路径 | 预期 |
|---|---|---|---|
| B1 | 导航串号修复（双样本） | 本机 A 账号拖拽调序→头像菜单退出登录→B 账号登录 | 侧栏=默认序；再登 A=自己调的序 |
| B2 | 日历「回到今天」 | 考勤记录→日历视图→翻到下月→点「回到今天」 | 文案为「回到今天」，点击回当月 |
| B3 | 面板减重观感（1920/宽屏） | 副本掉落页（登录壳+data.html 公开壳） | 筛选面板高度随内容收缩、不再拉满到屏幕底；内容多时面板内滚动，框体四边闭合 |
| B4 | 窄屏零回退 + 版本生效 | 1366 宽度双壳副本掉落页 + 强刷 | 筛选条仍吸顶顶栏态（非右栏面板）；侧栏版本串 20260811.56 |

---

## §6 遗留与说明

1. handleSignOut 异常兜底路径（signOut 接口抛错）不触发 onUserSignedOut 三清，但下次登录 `loadPreferences` 全量覆盖内存 + `applyNavOrder` 回默认序双保险兜底，串号面已闭环。
2. `wow_raid_attendance_data` 缓存在云端模式仅写不读（历史遗留），本包按红线只做登出清除，写路径未动。
3. APP_VERSION 常量（v3.2.0）按任务书口径不动，仅静态资源版本串 .55→.56。
