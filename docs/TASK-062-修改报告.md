# 任务书 #62 修改报告：反馈快赢批——装备分配/考勤修补 + 首页回退

> 日期：2026-09-30 ｜ 执行：Kimi Code ｜ 状态：已实现待验收（**未 commit / 未 push，送审**）
> 性质：纯前端批，零 DB 迁移、零依赖、零业务数据修复；BUG-106 根因在前端（静态写死），未触发停工挂账条件。
> 前置阅读：开发规范（最新版）、问题与需求清单、UI工作方法、DESIGN.md、任务书 #62 全文。

## 一、前置自查表

| 项 | 结论 |
|---|---|
| UI 审计（improve-ui，四页面：装备分配/考勤/首页/掉落） | 按证明门（契约+运行时+修正唯一）源码级核查：六个任务书条目本身即问题清单，**无新增支持性发现**；层级/观感类需渲染证据，本批未请求视觉检查，不报。已知取舍引用：桌面优先移动端封存（v2 §8）、禁动画库（v2 §9）、公示页既有组件复用（#46/#43） |
| §2 根因自查（BUG-106） | **根因在前端**：`index.html` 的 `lootRaidFilter` 选项为静态写死三项（虚影尖塔/梦境裂隙/进军奎尔丹纳斯），写死于主数据层（任务书 #14）上线前；添加装备表单的团本下拉（`lootInitRaidSelect`，app.js:6127）早已动态读 `getGameRaidNames()`，唯独列表筛选漏改，故孢陨幽境等新团本永不入列。**非数据层问题**，前端最小侵入修复 |
| §3 口径冲突自查（BUG-107） | 任务书 #27 WP2 在案硬指标「已删除成员考勤仍计入历史出勤率」与 BUG-107 的「统计剔除」存在口径面——按任务书 §3 锚点精确定界：**只改活动卡统计（renderActivityList）+ 缺席排行两处**；主排名表（getAttendanceRankings includeDeleted）与考勤明细灰显属 #27 WP2 拍板功能，**不动**（申报项 §五.1） |
| §5 缺口勘核（REQ-150 第三处） | 掉落卡片（dataPublic.js `itemCard`，双壳同源）#46 已渲染图标（icon_id 数字校验 + 规则路径 + lazy + onerror 隐藏），**勘核无缺口**；本地 `assets/icons/items/` 目录在案为空（运营源图未供，import 管道在案）——img 触发 404 按 #46 口径隐藏，版式不塌 |
| §6 关系自查（REQ-151） | 浏览态 `renderRaids/renderDungeons` 本就跑 `matchItem` 过滤且分组；平铺态（WP6 F3）才是平铺堆叠。最小侵入 = **并存**：浏览态零改动，平铺态改调同构分组构建器（复用 bossBlockHtml/dp-raid 结构，零新组件零新类名） |

## 二、执行明细（六项逐项）

### §1 BUG-109 首页回退
- **修改点**：`index.html:195`（ia-brand 加 `onclick="iaSwitchTab('home')"` + title）→ 现行 195-196；`index.html:197-200`（一级导航补「首页」tab，`data-ia-tab="home"`，位于团队管理左侧）；`js/app.js` `iaSwitchTab`（home 分支 → `iaSetHash('#/home')`，埋点行不变单次）；`iaPaintRoute`（`effTab = page==='home' ? 'home' : tab`，门户态高亮首页 tab，无公会 tab=null 其余逻辑不动）；`css/main.css` 末 #62 节（`.ia-brand{cursor:pointer}` + hover 名称 `--gold-light` 高亮）。
- **影响范围**：IA 导航层；`iaLastHash` 防环不破（走既有 iaSetHash 通道）；PV 五层链路零改动（#/home 本在 #60 口径内）。

### §2 BUG-106 团本筛选
- **根因**：静态写死（见前置自查表）。
- **修改点**：`index.html` `lootRaidFilter` 硬编码三 option 移除；`js/app.js` `lootRender` 头部动态构建选项 = `getGameRaidNames()`（MasterData 主数据，含当前赛季团本，随字典刷新联动）+ 记录内名单外自定义名（`appData.loots` 去重排序，历史数据可筛），保留当前选择。
- **影响范围**：装备分配列表筛选条；添加装备表单下拉本已动态不受影响。

### §3 BUG-107 考勤统计剔已删除
- **修改点**：`js/app.js` `renderActivityList`（约 4726-4730）出勤/缺席计数改基于 `attActive`（考勤行 `member_id` 命中成员表含离队才计入；id 定位不到或为空=已删除剔除，判定同 #27-补丁2「id 优先、状态回退」）；`renderReports` 缺席榜剔除已删除伪行。
- **补丁（#62 终审裁定，2026-09-30）**：主排名表（报表出勤率排名）同步剔除已删除成员——`renderReports` 改 `getAttendanceRankings(getFilteredActivities())`；`getAttendanceRankings` 移除 `includeDeleted` 参数（唯一 true 调用点即本处），伪行聚合函数 `getDeletedMemberStats` 随裁定移除；排名表/缺席榜渲染中已删除分支（含 BUG-071 `rank-deleted-name` 类挂载）同步清扫为不可达移除；`.rank-deleted-name` CSS 规则保留（失活无害， changelog/历史报告引用在案）。考勤明细灰显「已删除」保留不篡改。
- **影响范围**：考勤列表活动卡三数字（出勤/缺席/出勤率分子）；统计报表出勤率排名表与缺席榜。**不动**：考勤记录与明细灰显「已删除」、getAttendanceStats 唯一算法源。

### §4 REQ-147 成员筛选+搜索
- **修改点**：`index.html` 工具区补 `#lootMemberFilter`（下拉，全部成员+成员列表）与 `#lootMemberSearch`（搜索框）；`js/app.js` `lootRender` 头部动态构建成员选项（按名排序、`memberDisplayName` 消歧、value=id、保留选择，数据源与 `lootInitMemberSelect` 一致=全员含离队）；过滤逻辑 = `character_id === 选中id` 精确 + `(assignedTo||'').includes(关键字)` 模糊，与既有六条件叠加。
- **影响范围**：装备分配列表筛选；同名按 id 区分（#27-补丁2 口径）；无 id 存量行可经搜索框按名字快照命中；无结果走既有空态。

### §5 REQ-150 图标三处
- **修改点**：`js/app.js` 新增 `getItemIconId()`（boss_loot 主数据索引：名字+团本+BOSS 复合优先 → 全库唯一同名回退 → 同名多图标弃用）与 `itemIconImgHtml()`（#46 同口径：规则路径、lazy、空值不渲染、onerror 隐藏）；`lootRender` 装备名单元格与 `wishlistRender` 装备名单元格各前置一处调用；`css/main.css` 末 #62 节 `.loot-item-icon`（20px/圆角 4px）；`DESIGN.md` 新增 #62 登记节（新类注册 + ia-brand 行为变更）。
- **影响范围**：装备分配/心愿单两列表名字列；掉落卡片勘核无缺口未改；无 icon_id 或查不到的行零占位零版式变化。

### §6 REQ-151 筛选分组
- **修改点**：`js/dataPublic.js` 新增 `flatGroupHtml()`（团本→BOSS / 大米→BOSS+整体池两级分组，复用 `bossBlockHtml` 与 dp-raid 结构、collapse id 同源折叠记忆，空组不渲染，遍历内序与 `flatOrderedItems` 完全一致）；`render()` flat 分支由平铺网格改调 `flatGroupHtml()`（命中计数/空态/重置引导不变）。
- **影响范围**：副本掉落页筛选态（双壳同源一处改动）；浏览态零改动；数据流零触碰（纯展示层）。

## 三、版本串实查（批内自打 .84；data.html/decor.html 声明）

| 壳 | 20260923.84 | .83/.82 残留 | 说明 |
|---|---|---|---|
| index.html | **15**（注释 1 + `?v=` 14） | 0/0 | 任务书明定 |
| data.html | **8** | 0/0 | **声明**：本批改了 `js/dataPublic.js`（§6）与共用的 `css/main.css`，两资源均被 data.html 引用——按 #61 壳注释新规（本壳引用资源变更才随批递增）整壳追平 |
| decor.html | **5** | 0/0 | **声明**：共用 `css/main.css` 变更，同理追平 |

## 四、验证

### 4.1 verify 全量
| 脚本 | 结果 |
|---|---|
| `scripts/verify-task62.js`（本批新增，26 项静态锚点：六项逐项锚点 + 版本串 + node --check + server-security + 冻结反钉 + PV 五层零改动） | **26/26 全绿**（补丁后：A3b 改钉主排名表同口径剔除 + A3c 新增明细灰显保留锚点，断言数 25→26 不减） |
| verify-task55.js | **63/63 全绿**（A3 版本钉同步 .84；全文 `backup/task55-rerun-t62.log`） |
| verify-task58-wp2-3.js | **14/14 全绿**（A6 版本钉同步 .84；A7 冻结清单 css/ 出列——#62 起 main.css 经 DESIGN.md 登记合法变更，守卫核心收敛为采集三件套 track.js/decorData.js/cloud.js；`backup/task58wp23-rerun-t62.log`） |
| verify-task60.js | **13/13 全绿**（A5 版本钉同步三壳 .84） |

### 4.2 真浏览器实测（scripts/shot-task62.js，16/16 全绿，零 JS 报错；测试公会/成员/活动/装备/心愿造数用后自清理，复核零残留）
实测路径：playwright Chromium + 本地 server(:15662) 连真实库，owner 登录测试公会（成员 测试甲/测试乙；活动含已删路人 NULL-id 缺席快照行；装备行一有一无 icon_id；心愿行一条）。

- **§1**：`#/team/dashboard` 点 logo → `#/home` 且首页 tab 高亮（截图 `backup/2026-09-30-task62/s1-home-tab.png`）；点首页 tab → `#/home`；`/api/track` 插桩（sendBeacon 包装法）实证 tab_click level:1 key:'home' 两次点击各一发不双发。
- **§2**：`#/team/loot` 团本筛选项 = 四团本（虚影尖塔/梦境裂隙/进军奎尔丹纳斯/**孢陨幽境**）+ 记录内自定义名「其他自定义本」全在列。
- **§3**：活动卡 出勤 **1** / 缺席 **1** / 出勤率 50%（3 考勤行含已删路人缺席行，剔除后对得上；截图 s4-attendance-card.png）；缺席榜含「测试乙」不含「已删路人」；**补丁裁定实证**：主排名表（s5-reports-absent.png）仅测试甲/测试乙两行、无已删路人伪行，考勤明细弹窗（s5b-attendance-detail-deleted.png）已删路人行灰显「已删除」保留、明细统计行同口径只计 2 人。
- **§4**：成员下拉选测试甲 → 仅其装备行；清空后搜索「测试乙」→ 仅其行；搜「不存在的人」→ 空态；清空恢复全量（截图 s2-loot-page.png）。
- **§5**：装备分配列表 icon 行渲染 `img.loot-item-icon` 且 `src=assets/icons/items/7956747.png` 规则路径（守护者的躁动核心/烈毒之渊/陵寝哨兵，复合命中）；心愿单列表同（s3-wishlist-icon.png）；无 icon_id 行（无图标测试件）零 img 零占位。
- **§6**：`#/team/lootdrop` 搜索装备名 → 筛选态呈「烈毒之渊 → 2号·陵寝哨兵」两级分组（非平铺），分组头件数与命中计数一致，空组不渲染（截图 s6-lootdrop-grouped.png）；切换/清空筛选分组实时刷新。

### 4.3 红线核对
- DB 零迁移零数据修复；track.js / server.js / sql/ 零触碰（git 变更集反钉）；derivePage/TRACK_PAGE_RE/ANALYTICS_PAGE_RE/analytics_overview 五层零改动；零依赖零动画库；样式全走 CSS 变量深色主题。

## 五、申报项与遗留

1. **§3 申报①已裁定落地（补丁）**：#62 终审裁定主排名表同步剔除已删除成员，已随本批施工完毕——`renderReports` 调用点、`getAttendanceRankings` 签名（includeDeleted 移除）、`getDeletedMemberStats` 移除、排名表/缺席榜已删除渲染分支清扫（`.rank-deleted-name` CSS 失活保留）；考勤明细灰显「已删除」保留不篡改。自验：verify-task62 26/26（A3b/A3c 锚点更新+新增）、shot-task62 16/16（§3c 主排名表无伪行 + §3d 明细灰显保留，截图 s5/s5b）、既有三 verify 复跑全绿（55=63/63、58=14/14、60=13/13）。
2. **§5 图源缺口（非本批引入）**：`assets/icons/items/` 本地在案为空（运营源图未供，#46 import 管道在案）——图标 img 现按 #46 口径 404 隐藏，源图入库后三处即时生效零改动。
3. **版本锚点连带适配 4 处**（verify-task55 A3 / task58-wp2-3 A6+A7 / task60 A5）：均为版本串递增与 css 合法变更的同构漂移，理由已逐条写进各脚本注释与本报告 §四.1。
4. **台账登记**：BUG-106/107/109 入《问题与需求清单》§一、REQ-147/150/151 入 §四（编号纪律）。
5. **changelog 四维补录随 release**（前批同口径）。
6. **commit 物料**：待顾问终审后另发；建议标题「任务书#62：反馈快赢批——首页回退/装备筛选当前团本/考勤剔已删除统计/成员筛选搜索/图标补全/掉落筛选分组」，三段式【改了什么】六项 + 版本串三壳 .84 + 台账/DESIGN 登记【范围】index.html、js/app.js、js/dataPublic.js、css/main.css、decor.html、data.html、DESIGN.md、docs 台账/报告、verify/shot 脚本【验证】verify-task62 25/25 + 三既有 verify 全绿 + 六项真浏览器实测 15/15。
