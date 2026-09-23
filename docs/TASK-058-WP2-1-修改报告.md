# TASK-058-WP2-1 修改报告：多方案数据层 + 方案单独立页（形态B）

> 执行：Kimi Code ｜ 2026-09-24 ｜ 状态：送审（未 commit / 未 push）
> 任务书：tasks/任务书58-WP2-方案单独立页与图片导出.md（WP2-1 段）

## 一、前置自查

- `git pull` 已对齐 master（顶端 367bf70 #58-补丁）；《开发规范》与任务书全文通读；#57 范围（一级导航/分组/首页）零触碰，本 WP 仅「家宅」组内增量一项。
- 前置侦察锚点：cloud.js reloadDecorPlan/syncDecorPlan（WP1 口径 updated_at 最新）、app.js planBridge/ensureDecorMounted/switchPage、index.html 家宅组、cloudCrud 哨兵（decorPlan 不在校验集合映射内，新操作零干扰）。
- **侦察发现一个任务书未覆盖的现实（先报告口径）**：track.js 页签 PV 上报 `index:<pageName>`，新页签 key `decor-plan` 含连字符，server.js `TRACK_PAGE_RE = /^(decor|data|index:[a-z]+)$/` 不含 `-` → 该页签 PV 会被 204 静默吞掉。本 WP 不动 server.js（红线：白名单属 WP2-3），登记待 WP2-3 一并定夺（扩 regex 为 `index:[a-z-]+` 或页签 key 改名）。

## 二、执行明细（修改 7 + 新增 1 + 物料）

| 文件 | 改动 |
|---|---|
| js/cloud.js | decorPlan 口径改造：`DECOR_PLAN_CURRENT_KEY=wb_decor_plan_current` + `decorPlanResolveCurrentId`（选定 id 失效回退 updated_at 最新）；reloadDecorPlan 拉全量 → `appData.decorPlans`（倒序全量）+ `appData.decorPlan`（当前，WP1 消费方零改动）；syncDecorPlan 扩五操作——save（写当前选定，差集批量不变）/create（INSERT 头+空明细+设为当前）/rename（仅改头名，不 bump updated_at）/delete（≤1 个禁止·级联·删当前则清选定）/switch（仅切 localStorage 不写库） |
| js/app.js | pageTitles 增 `'decor-plan'`；switchPage 增 decor-plan 分支；`ensureDecorPlanPageMounted()` 懒挂载（先 ensureDecorMounted 保证 bridge 与目录数据，幂等）；planBridge 扩 listPlans/currentPlanId/createPlan/renamePlan/deletePlan/switchPlan（全走 cloudCrud 统一入口） |
| index.html | 「家宅」组内「家宅图鉴」之后增「方案单」nav 项（含 `#dhNavPlanBadge` 徽标节点）；新增 `#page-decor-plan` 容器（骨架极简，结构渲染层生成） |
| js/decorData.js | ①草稿分键 `{plans:{[planId\|'anon']}}` + WP1 旧形态迁移 + `planDraftAdoptAnon` 一次性认领（D2 公示壳→登录链路不丢不串）；②`planPullCloud` 云端对齐（三分支合并逻辑不变）；③多方案四动作 planActionSwitch/Create（默认名「我的方案 N」最小未占序号）/Rename（prompt，40 字截断）/Delete（confirm+前后端双守卫）；④批量 planBatchRemove/planBatchInc（单次变更一次 draftSave+render）；⑤独立页渲染层 mountPlanPage/activatePlanPage/planPageRender——页头（下拉切换/新建/重命名/删除/返回图鉴）、全宽表格（图标+品质色名/来源/步进/容量·件/小计/移除）、批量条（全选/批量移除/批量+1/已选 N 件·小计容量）、右侧摘要卡（总件数/容量进度条 2000 标红不阻断/导出/分享方案 disabled「三期社区开放」/云端同步提示）、空态「去图鉴挑装饰」、三态（加载/空/失败重试经 state.loadError）；⑥徽标三处同源（planRender 内同步侧栏徽标，公示壳无节点自动跳过）；⑦埋点挂点 decor_plan_create/switch（白名单扩列属 WP2-3，未扩前 204 静默不报错） |
| css/decor-public.css | 新增 .dh-pp-* 段（表格规范对齐 v2 A.3：文本左/数字右/操作居中、表头金色+底线、斑马纹、悬停亮一档；摘要卡 sticky；768px 摘要卡下移+表格 wrap 横滚+页面零横滚）+ `.dh-nav-plan-badge` 侧栏徽标样式 |
| index.html / decor.html | 版本串 20260923.74 → **20260923.75**（index×15 / decor×6） |
| scripts/verify-task58.js | WP1 门禁跟随新现实：A2a/A2b 锚点改多方案口径、B1①/B1② 草稿读取改 anon 槽、VER=.75 |
| scripts/verify-task58-wp2-1.js | 新增（A 静态 12 + B 实测 11 + C 清零 3 = 32 项） |
| backup/2026-09-23-task58-wp2-1/ | 截图 3 张 + shots.js（gitignore 物料区） |
| diff-task58-wp2-1.txt | 全量 diff 物料 |

**未动红线**：#57 导航/首页结构、图鉴筛选与详情、WP1 抽屉/文字导出既有行为、track.js/server.js/sql/data.html/dataPublic.js/decorDict.js（A9 diff 锁名绿）。

## 三、硬门验证输出

- `node --check`：cloud/app/decorData/verify×2 全过；server-security 5/5。
- **verify-task58-wp2-1.js：32/32 绿**（真浏览器）：
  - B1 直进空态+页头五控件；新建×2→下拉「我的方案 1/2」+库内 2 头 0 明细+当前=方案2；
  - B2 徽标三处同源=2（侧栏/抽屉/页内实时联动）；保存→库内方案1 明细 2 行（行级归属）；
  - B3 方案2 独立组单（库内方案2 一行、方案1 仍 2 行，多方案隔离实证）；
  - B4 批量：全选→批量+1（qty 2|2，已选 2 件·小计容量 10）→容量摘要=手工核算 20→勾一行批量移除→保存后库内 1 行 qty=2（REST 对照一致）；
  - B5 刷新还原：方案1=1 行 qty2 / 方案2=1 行；B6 重命名（prompt）下拉+库内同步；B7 删除级联+当前回退+「仅剩一个方案，禁止删除」双守卫；
  - B8 768px：摘要卡 column 下移实测在主区之下+表格 wrap overflow-x auto+页面零横滚；
  - B9 公示壳零回归（加单→徽标 1+草稿落 anon 槽）；B10 双壳零 JS 报错零意外 4xx；C 段四清零。
- **verify-task58.js（WP1+补丁回归）：48/48 绿**——D2 三红线/DB-first/合并三分支/导出/埋点/键盘止冒泡全量无漂移。
- 截图物料：app-1440-planpage-empty（空态）/ app-1440-planpage-table-batch（表格+批量条+摘要卡+侧栏徽标 4）/ app-768-planpage（摘要卡下移），目视复核合格。

## 四、sha256 物料（diff 后复算）

```
2d6d6e96947f58afaa8a1d34b22ce67ffc57b81aaeeaa04af5ae62b7ce473f21  js/cloud.js
865757068045070fe62e478deb3d73f051b048b5abe476d62f5d221b5c998080  js/app.js
c52dacf08ed8ac399b0882d73fcddc6a3032894cfd646c0b66aa7707ca5f5685  js/decorData.js
45667409bc73f612685259fab3d8db55f462b99eb92b79ae0b0486fd6ea71f19  css/decor-public.css
18e00cd7c783f51e1fba7b49d0fed6c93acc6e0f6a929a67e42988e2010b68dc  index.html
5b2cdbc6b0861b1e510d6e355b0fd47ad6b2b832570d2c127188581b45d4fd50  decor.html
7afb6585248816d7da235bd20ff4d6cafbfdd7a3545f58559a16e68fc7493098  scripts/verify-task58.js
16cd1c308a31b93a64065b740bf3ec6b033f0a04367897ef04a87d0c3c140cf9  scripts/verify-task58-wp2-1.js
f7b69ffd9fe8465c00e1877754ebbaf9b7720b8615de22f53dd337c478660fda  diff-task58-wp2-1.txt
```

## 五、设计决策与遗留

1. **草稿分键 + anon 认领**：多方案下草稿按 planId 分槽防串单；公示壳/旧版 anon 槽由登录态一次性认领迁移（D2 硬验收链路 B1③ 实证不破）。
2. **rename 不 bump updated_at**：当前选定由 id 锚定，排序语义不被重命名扰动。
3. **切换落地可观测**：下拉节点 `data-current` 标记当前方案 id（verify 防异步竞态用，同时是用户侧快速连击的一致性兜底）。
4. **遗留**：①decor-plan 页签 PV 被 TRACK_PAGE_RE 吞（侦察发现，待 WP2-3 定夺）；②decor_plan_create/switch 已挂点待 WP2-3 扩白名单（未扩前 204 静默）；③更新日志四维补录随 release。
