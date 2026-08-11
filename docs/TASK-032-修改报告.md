# 任务书 #32 修改报告：仪表盘「最近活动」优化（REQ-100）

> 日期：2026-08-11 ｜ 执行：Kimi Code ｜ 版本串：20260811.42 → **20260811.43**（index.html 10 处 + data.html 6 处全量同步）
> 范围：仪表盘「最近活动」显示层 + 点击跳转链路。只动显示与跳转，考勤业务逻辑/数据表/RLS 零改动，零依赖。
> 流程：前置侦察三项结论先行送审，两点决策（当次筛选态/当次列表视图不落记忆键）经运营放行后施工。
> 红线自查：**未 commit 未 push**；测试数据自清理复核为零。

---

## 〇、前置侦察结论（已送审放行，要点留存）

1. **数据源与刷新链**：最近活动 = `renderDashboard()` 直读 `appData.activities`（app.js:2363），按日期降序取前 5，无独立缓存；删除链（单个 cloudCrud / 批量统一 reload）完整，`switchPage('dashboard')` 必重渲——**删除后条目不残留，无断环**，F1「删除联动消失」现状已满足，本包以 B 组实测闭环（含 F5）。
2. **取消状态字段**：既有 `activities.status`（'normal'/'cancelled'，REQ-020），cloud.js:802 加载映射直达 appData，dashboard 可读，**未新造状态语义**。
3. **条目交互清单**：条目无任何操作按钮，唯一交互 = 整条 `onclick="openAttendanceDetail()"` 开考勤详情弹窗。F2 落点 = 该 onclick 改跳转，区域即纯预览。现状截图 `backup/2026-08-11-task32-recon/dashboard-full-before.png`（正常/已取消条目零区分）。

**运营放行决策**：① 跳转当次自动勾选「含已取消」+ 清空其余筛选（只动当次筛选态）；跳转成功不弹 toast；「该活动已被删除」toast 严格限定 appData 真不存在。② 当次强制列表视图渲染定位，不落记忆键、不改写用户视图偏好（BUG-023 记忆逻辑零改动）；用户事后手动切日历行为如常。

## 一、修改文件清单

| 文件 | 位置 | 改动 |
|---|---|---|
| js/app.js | `renderDashboard()` 最近活动 | F1：条目加状态徽标（正常=tag-green / 已取消=recent-status-cancelled 实色高对比），已取消条目加 `recent-cancelled` 类（灰化降饱和）；F2：整条 onclick `openAttendanceDetail` → `gotoActivityInAttendance` |
| js/app.js | 新增 `gotoActivityInAttendance()` | F2 跳转：真不存在 → 落 tab 顶部 + toast「该活动已被删除」（严格限定）；存在 → 当次筛选复位+含已取消（DOM 经 attFilterChange 同步）→ 当次强制列表视图（不碰记忆键）→ scrollIntoView + 高亮 1.8s |
| js/app.js | `renderActivityList()` 卡片 | 加 `data-activity-id` 属性（定位标识，纯增量） |
| js/app.js | changelogData 顶部 | 补录「功能优化」条目（REQ-100） |
| css/main.css | .recent-* 区块 | F1：.recent-cancelled 灰化（opacity .55 + saturate(.5)）+ .recent-status-cancelled 实色徽标；F2：.activity-jump-highlight 金色描影（复用 .activity-item 既有 transition: all 0.2s，出现/消退双向同路径） |
| index.html / data.html | 版本串 | 20260811.42 → 20260811.43（10 + 6 处） |
| scripts/verify-task32.js | 新建 | A 徽标生效值 3 项 / B 删除联动 3 项 / C 跳转定位 8 项 / C0 样本与主链路 2 项 + 清零复核 |
| docs/问题与需求清单.md | 台账 | 登记 REQ-100 |

`node --check` js/app.js、scripts/verify-task32.js 均通过。

## 二、实现说明

**F1 徽标一级可见**：判定来源 = `a.status === 'cancelled'`（既有字段）。正常条目挂 `.tag.tag-green`「正常」（ computed color rgb(63,185,80)）；已取消条目挂 `.tag.recent-status-cancelled`「已取消」（实色 --danger rgb(248,81,73) 底 + 白字，高对比）且整条 `opacity:.55 + filter:saturate(.5)` 灰化降饱和、hover 不位移——一眼可辨，无需点进活动。

**F2 只读预览 + 跳转定位**：条目内零按钮零链接（断言 `innerBtns===0`）。`gotoActivityInAttendance(id)`：
- 真删除（appData 无此 id）→ `switchPage('attendance')` + `mainContent.scrollTop=0` + toast「该活动已被删除」——严格限定此场景；
- 存在 → 当次筛选态复位（成员/状态/时间范围清空 + 「含已取消」勾选，DOM 与 attFilter 对象经既有 `attFilterChange()` 同步，保证目标卡片必渲染，含已取消活动）→ 当次强制列表视图显隐（不调 `getAttendanceView`、不写 `attendanceView:{userId}:{guildId}` 记忆键）→ 卡片 `scrollIntoView` 居中 + `activity-jump-highlight` 1.8s 后移除。高亮复用 `.activity-item` 既有 `transition: all 0.2s`，加/去类走同一过渡路径，双向对称，零新增 JS 动画。跳转成功全程零 toast。

## 三、验证（真浏览器实测，scripts/verify-task32.js，16/16 PASS）

**A F1（§2 生效值断言，getComputedStyle 实测非类名）**：A1 正常条目徽标 computed color=rgb(63,185,80)、条目 opacity=1/filter=none；A2 已取消徽标 computed bg=rgb(248,81,73)+白字、条目 opacity=0.55/filter=saturate(0.5)；A3 条目内零按钮零链接、onclick 为 gotoActivityInAttendance。截图 `a-dashboard-badges.png`（已抽看：正常绿标/已取消红实色标+灰化条目对比清晰）。

**B 删除联动（主链路）**：考勤 tab → 点活动卡 → 详情弹窗「删除活动」→ confirm → toast「活动已删除」→ 切回 dashboard 条目消失（其余两条在）→ F5 仍不残留 → DB 0 行（B1/B2/B3）。

**C F2 跳转**：C1 点正常条目 → 考勤 tab active + 列表视图强制显示 + 目标卡 `activity-jump-highlight` 且在视口内 + 含已取消已勾选/范围全部/成员清空；C1b 跳转成功零 toast；截图 `c1-jump-highlight.png`（已抽看：金框高亮卡 + 含已取消勾选 + 已取消卡灰化在列）。**C2 §3 双向连帧**：rAF 全程采样 computed boxShadow 2.4s——出现期 19 帧/13 distinct 逐帧过渡到 rgba(240,192,96,…) 描影，消退期 37 帧/13 distinct 逐帧回落、末帧严格 `none`。C3 点已取消条目 → 定位高亮 + 列表灰化样式在 + 零 toast（决策①闭环：默认筛选隐藏已取消，跳转当次自动放开）。C4 已删除 id → 落 tab 顶部（scrollTop=0）+ toast「该活动已被删除」。C5 记忆键预置 calendar → 跳转后键仍 calendar（零改动），手动 `switchAttendanceView('calendar')` 日历正常显示（用户行为如常）。

全程零 JS 报错；测试数据清零复核全 0（guilds/activities/profiles/auth 404）。

## 四、回归五组全绿

| 项 | 结果 |
|---|---|
| verify-task32（本包） | **16/16** |
| verify-task27-wp1 | **8/8** |
| verify-task27-wp2 | **27/27** |
| verify-task27-patch | **24/24** |
| verify-task29-wp1 | **27/27，SKIP 0** |
| npm test（server-security） | **5/5** |
| SEC-001（verify-authz.js） | **34/34** |

各组测试数据清零复核均为 0（T32A 前缀 guilds/activities/profiles/auth 404；task27/task29 各前缀复核全 0）。

## 五、§1 修复副作用审计单（刷新链/取消状态语义/跳转定位逐项）

| 链路环节 | 可能影响的既有行为 | 验证方式 | 结论 |
|---|---|---|---|
| renderDashboard 最近活动条目改版 | **dashboard 其他区块**：统计卡/Top5 排行同函数渲染，数据源未动；recentList innerHTML 仅本区块 | A 组 + B/C 组全程 dashboard 多次重渲、回归全绿 | 无 |
| 取消状态语义 | **禁新造语义**：判定唯一来源 activities.status（REQ-020 既有字段），与考勤列表/统计口径同源 | A2 computed 断言 + 与考勤列表灰化同字段实证（C3 cancelledStyle） | 无 |
| 删除联动 | **刷新链未改**：删除链路与 dashboard 重渲链零改动，仅实测闭环 | B1/B2/B3（UI 删除 → 消失 → F5 → DB 0 行） | 无（现状已满足） |
| 跳转当次筛选复位 | **考勤筛选条**：跳转后筛选控件值被复位 + 含已取消勾选——只动当次 DOM/对象态，不写存储；用户后续手动改筛选走既有 attFilterChange 不受影响 | C1 断言筛选态 + C5 后续手动切视图正常 | 无（决策①放行口径） |
| 当次强制列表视图 | **BUG-023 视图偏好**：不落记忆键、不改 switchAttendanceView/getAttendanceView；下次进考勤页仍按记忆渲染 | C5：预置 calendar 键 → 跳转后键值不变 + 手动切日历正常 | 无（决策②放行口径） |
| 卡片加 data-activity-id | **考勤列表渲染**：纯增量属性，onclick/样式/批量勾选（REQ-017-B）逻辑不变 | C1/C3 定位 + task27 三组回归全绿 | 无 |
| 高亮类加/去 | **.activity-item 既有 transition**：复用同一路径，无新增动画/JS 定时器外副作用；1.8s setTimeout 仅去类 | C2 双向连帧断言 | 无 |
| openAttendanceDetail 不再被 dashboard 调用 | **考勤详情弹窗**：考勤列表/日历点击等既有入口保持原样可用 | B 组删除主链路（经详情弹窗）+ 回归全绿 | 无 |

## 六、§4 数据样本前提声明（三态）

- **正常样本**：1 个（T32A正常活动/虚影尖塔/今日）——A1/C1/C2 实测。
- **已取消样本**：1 个（T32A取消活动/梦境裂隙/昨日，status='cancelled'）——A2/C3 实测。
- **已删除样本**：1 个（T32A待删活动/进军奎尔丹纳斯，UI 主链路真删除）——B1-B3/C4 实测。
- 三态样本齐全，无「无样本」项。样本构造：UI 注册建会（主链路）+ service key 直插活动（显示层验证不依赖创建链路，创建/取消链路已有任务书 #12 回归覆盖）。
- **存量真实数据**：线上真实公会/活动只读未动；测试数据（T32A 前缀）自清理复核为零。

## 七、遗留与后续

- 无新增遗留。B 表 5 项（运营手工）待验收。
- 台账 REQ-100 已登记；changelog「功能优化」已补录。
- **未 commit 未 push**，报告 + 审计单送审。
