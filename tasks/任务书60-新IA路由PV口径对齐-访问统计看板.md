# 任务书 #60：新 IA 路由 PV 口径对齐——访问统计看板新路由可见

> 执行方：Kimi Code（前端段）｜ 单工作包 WP1 ｜ 密钥：不涉及新密钥（服务器 SSH/psql 走运营既有通道）
> 前置勘定：顾问已完成全链五层勘查（见 §0），本任务书按勘定结论施工，施工中发现与 §0 冲突的现实**先报告运营定夺，不擅自改设计**。

---

## 0. 前置勘定（顾问勘查结论，施工前必读）

任务书 #59 门户化四包收官后，新 IA 路由 PV 链路五层现状：

| 层 | 位置 | 现状 | 结论 |
|---|---|---|---|
| 采集 | js/track.js | WP3 勘定后按实际落地 hash 推导上报（index:home / index:team-guide / index:decor / index:lootdrop / index:decor-plan…） | ✅ 已通 |
| 写入白名单 | server.js `TRACK_PAGE_RE` | `/^(decor|data|index:[a-z-]+)$/`（任务书 #58 WP2-3 已放行连字符） | ✅ 已通 |
| 入库 | analytics_events.page | 无约束，新 page 值已入库 | ✅ 已通 |
| 服务端参数校验 | server.js `ANALYTICS_PAGE_RE` | `/^(all|index|decor|data|index:[a-z-]+)$/`（同上放行） | ✅ 已通 |
| **DB 函数校验** | sql/34 迁移 `analytics_overview` p_page | **旧版 `'^(all|index|decor|data|index:[a-z]+)$'`——不含连字符** | ❌ **断点 A** |
| **看板前端** | js/app.js `mdRenderAnalytics` | 页筛下拉仅 4 项（全部/主站/家宅公示/掉落公示），无单页签入口；`ANX_TAB_LABEL` 为 WP1 前旧键，缺 home/team-guide/decor-plan/community 四键（nav 排行新页签显示原始 key） | ❌ **断点 B** |

**断点 A 的触发条件**：经 `/api/analytics/summary` 传 `page='index:decor-plan'` 等连字符页签时，server.js 放行、SQL 层 raise 400「页面筛选参数无效」。当前 UI 发不出该参数故未暴露；断点 B 一旦补上选项不修 A 即触发。

**page 值口径**（采集/入库统一，施工不得改）：`index:<页签key>`，key 不含 team-/house- 前缀。现行清单：
index:home / index:team-guide / index:members / index:attendance / index:loot / index:wishlist / index:reports / index:data / index:changelog / index:datacenter / index:lootdrop / index:decor / index:decor-plan / index:community（历史遗留值 index:dashboard、index:login 在库中存在，兼容展示）。

---

## WP1：DB regex 对齐 + 看板前端补口

### 需求

1. **SQL 迁移**：新增 `sql/36_task060_analytics_page_re.sql`——`analytics_overview` 的 p_page 校验 regex `index:[a-z]+` → `index:[a-z-]+`，与 server.js 双 RE 同口径。范式硬性照 sql/34 迁移：幂等（CREATE OR REPLACE）、文件头注释（日期/内容/执行方式/回滚说明）、末尾 `NOTIFY pgrst, 'reload schema'`。除该 regex 外函数体**一字不动**。
2. **看板前端**（js/app.js REQ-141 段）：
   - 页筛下拉在现有 4 项（保留不动）基础上补 14 个单页签选项（label 用「主站·××」格式）：index:home 首页、index:team-guide 团队引导、index:members 成员管理、index:attendance 考勤记录、index:loot 装备分配、index:wishlist 心愿单、index:reports 统计报表、index:data 数据管理、index:changelog 更新日志、index:datacenter 数据中心、index:lootdrop 副本掉落、index:decor 家宅图鉴、index:decor-plan 方案单、index:community 家宅社区；
   - `ANX_TAB_LABEL` 补 4 新键（home: '首页'、team-guide: '团队引导'、decor-plan: '方案单'、community: '家宅社区'），旧键原样保留（历史数据显示兼容）。
3. **版本串**：index.html 15 处 .82→.83（改 js/app.js 必打）；decor.html/data.html 本批未触碰，是否追平 .83 按 docs/开发规范.md 第五章第 6 条原文执行，送审报告附三壳实查值。

### 验收

- SQL 迁移文件入库 + 服务器执行后实证：`analytics_overview` 传 p_page='index:decor-plan'/'index:team-guide' 返回 200 数据（不再 400），传旧值 'index:decor'/'all' 照常；
- 看板页筛截图（4 旧项 + 14 新项）；nav 排行中新页签显示中文 label（非原始 key）；
- 回归：既有 verify 重跑零新增失败；track.js 零触碰（采集层冻结）；测试数据不引入。

---

## 红线

- **不动 #58 全链**；不动 track.js（采集层 #59 WP3 勘定后冻结）；不动 server.js（双 RE 已正确）；
- **DB-first**：本批唯一 DB 变更 = 36 号迁移文件；执行方式照 33/34 先例（SSH + docker exec psql，supabase_admin），**执行权属运营**，任务书与代码不含任何密钥；执行后 NOTIFY pgrst 已在迁移文件内；
- **执行顺序**：运营先在服务器执行 36 号迁移并验证 → 顾问终审 → commit+push（前端）。SQL 先于 UI 生效，窗口期内旧 UI 发不出新参数，无风险；
- 埋点向后兼容：旧 page 值查询结果不因本批变化（回归必验）；
- commit 规范：「任务书#60-WP1：…」三段式；不 push（送审制）；版本串批内自打；
- 开工前先读《开发规范》（docs/开发规范.md）。
