# 任务书 #43 修改报告：副本掉落右栏筛选面板+毒咒筛选维度（REQ-098 + REQ-110 定案②，= 任务书 #30 全文 + 增补合并施工）

> 日期：2026-08-12 ｜ 执行：Kimi Code ｜ 版本串：20260811.54 → **20260811.55**（两壳 16 引用 + 2 头部注释同步）
> 状态：开发自测完成（verify 27/27 全绿），待运营验收（B 表 8 项）｜ 未 commit 未 push

---

## 一、改动清单（实际改动点）

| 文件 | 改动 |
|---|---|
| `data.html` / `index.html` | 筛选条骨架重构（两壳逐字同构、一套 DOM）：新增 `.dp-panel-title`「筛选」；首行 = 搜索 + 重置筛选 + **命中计数（#dpFlatHead 移入首行恒显）** + 「筛选 ▾」折叠钮；组行 = 分类/主属性/副属性/来源 + **毒咒组新增**（`#dpVenomGroup`/`#dpVenomChips`，来源组之后） |
| `css/data-public.css` | 两态样式：①≥1400px 面板态——`.dp-filterbar` fixed 右栏（right/bottom 12px、宽 264px、top=calc(var(--dp-panel-top)+12px)），四边框 1px 全闭合+圆角 8+底色+阴影、overflow-y auto 深色细滚动条、面板标题显示、折叠钮隐藏、卡片区让位 `.data-public-body .dp-main, #page-lootdrop .dp-main { margin-right:292px }`（提权压 margin:auto 基线）；②<1400px 折叠顶栏态（断点自 ≤768 上调）——折叠钮显、组行 `:not(.filters-open)` 收起、展开/收起动画保留；③`#page-lootdrop` 吸顶让位按两态拆分（<1400 top:56px 粘吸 / ≥1400 走壳级变量） |
| `js/dataPublic.js` | ①毒咒维度：`state.venomOnly`、`renderVenomChips()`（全部/有毒咒单选，词表 = `LootTaxonomy.VENOMCURSE_LABEL`）、`matchExcept` 加 venom 条件（判定=行 venomcurse 非空）、`hasLootFilter`/`isFlatMode`/`resetFilters` 同构接入；②命中计数恒显：浏览态「共 N 件」/ 筛选态「命中 X 件 · N 项生效」（`activeFilterCount()`：搜索/来源/实例/毒咒各计 1，分类三级与主/副属性按已选 chip 逐个计）；③折叠记忆 `dp43:filterOpen`（sessionStorage，boot 还原）；④`syncPanelTop()` 壳级顶偏实测写入（公开壳=.dp-header 页头高 / 登录壳=topbar 56+赛季行高），boot + resize 触发 |
| `js/lootTaxonomy.js` | 新增 `VENOMCURSE_LABEL = '毒咒'` 常量（词表归位，禁第三份字面量） |
| `js/app.js` | 数据中心双表单毒咒下拉改消费 `LootTaxonomy.VENOMCURSE_LABEL`（#37 内联字面量收编同源） |
| `index.html` / `data.html` | 版本串 .54→.55 |
| `scripts/verify-task43.js` | 新增验证脚本（27 断言） |

## 二、#30 红线逐项自查（§1 审计单）

- **双壳单一真源**：筛选 DOM 两壳逐字同构，渲染/行为 JS 零复制；壳差异仅 CSS 作用域覆盖（`#page-lootdrop` top 让位）+ `--dp-panel-top` 变量值。
- **框体完整专项**：四边框 computed 1px×4、圆角 8px、底色/阴影在案；搜索框/重置按钮/命中计数矩形逐个断言全在面板内（B2/E1 零裁切）。
- **两态一套 DOM**：断点 1400px 纯 CSS 切换容器形态；毒咒组两态同步包含（D1/D5 同 id 同 chips 断言）。
- **层级规约**：面板 z=10 ＞ hover 展开卡 z=5 ＞ 普通卡（B6：滚动 1500px 后 elementFromPoint 面板区命中面板自身 + hover 态卡 z=5 computed）；#dpChipToast z=2000 未动。
- **筛选语义零改动**：matchExcept 既有分支一行未改，毒咒为同构新增分支（skip='venom' 参与置灰联动口径预留）；REQ-090 不实施不变。
- **REQ-091 预留**：面板组列表纵向排列天然可扩展，零职业/专精内容。
- **零改动面**：置灰规则/搜索置顶/三级联动/折叠记忆键（dp23:collapsed）/#dpChipToast 全部未碰。

## 三、增补 WP（毒咒筛选）口径

- 单选 chips「全部 / 有毒咒」，判定 = 行 `venomcurse` 非空（RPC 白名单 #37 已透出，客户端筛选，零 schema 零 RPC 改动）；
- 与现有维度完全同构：参与 AND 过滤、命中计数、「N 项生效」+1、重置筛选一并复位、内容类条件触发平铺态；
- §4 样本声明：当前库内毒咒行=0——D2 断言「有毒咒」0 命中态显示「命中 0 件 · 1 项生效」+ 空态重置引导、不报错不白屏（防无数据假通过）；D4/D6 另插 T43 真实毒咒样本行断言过滤精确命中 1 件（带 .dp-tag-venom 徽标），测后删除。

## 四、验证方式（verify-task43.js，27/27 全绿）

- A1/A2：308 基线 + 版本串两壳 .55；
- B1-B5（公开壳 1920）：面板 fixed/264px/四边框/圆角/z=10/标题/折叠钮隐藏/组行展开、控件零裁切、让位 292+卡片 4 列、「共 308 件」恒显、毒咒组在来源组后；
- B6：滚动 1500px 面板跟随 + 层级规约 elementFromPoint 断言；B7：压低视口面板独立纵向滚动（overflow-y auto 实测可滚）；
- C1-C4（公开壳 1366）：折叠顶栏 sticky、首行恒显、折叠钮显、默认收起、展开双向 + sessionStorage 记忆 + 刷新还原 + 再收起归零；
- D1-D6（毒咒）：两态渲染、0 命中态文案与空态、重置复位全集还原、真实样本过滤双态同效；
- E1-E4（登录壳 viewer）：面板态同款 + `--dp-panel-top`=56+赛季行高（96px 实测）、1366 折叠态 top=56px、9 页签切换零回归；
- 全程零 JS 报错零 404；G1 清理后 308 基线还原；T43 测试数据清零。

截图：`backup/2026-08-12-task43/`（pub-1920-panel-scrolled / pub-1366-collapsed-open / venom-zero-hit / pub-1920-venom-filter / app-1920-panel / app-1366-collapsed）。

回归（最终清单）：task27×3 / 29 / 31 / 32 / bug071 / 34 / 35 / 36 / 37 / 38 / 39 / 40 / 41 / 42 + npm test + SEC-001 全绿（结果见完工报文分段）。

## 五、遗留问题

- 力敏 AND 24 / hover 生长 34→85 等 WP6 既有断言由 verify-task23-patch2/verify-task28 族覆盖（不在本次回归清单的 WP6 专项脚本未动其断言面；筛选语义零改动保证其行为守恒）。
- B 表 8 项（#30 六项 + 增补 B7/B8）待运营手工验收。

### commit 物料（待运营审后统一提交）
标题：「任务书#43：副本掉落右栏筛选面板+毒咒筛选维度（REQ-098+REQ-110②，#30 增补）」
【改了什么】副本掉落筛选条改两态一套 DOM：≥1400 右栏悬浮面板（四边闭合框体/独立滚动/壳级顶偏/卡片区让位）↔ <1400 折叠顶栏（首行恒显+sessionStorage 记忆）；命中计数恒显（共 N 件/命中 X 件 · N 项生效）；新增毒咒筛选组（单选 全部/有毒咒，行 venomcurse 非空判定，词表 LootTaxonomy.VENOMCURSE_LABEL 同源收编 #37 内联字面量）。【范围】data.html、index.html、css/data-public.css、js/dataPublic.js、js/lootTaxonomy.js、js/app.js（毒咒下拉同源）、两壳版本串 .55、scripts/verify-task43.js（新增）。【验证】verify-task43 27/27 全绿（框体完整/零裁切/滚动跟随/层级规约/两态一套 DOM/折叠记忆/毒咒 0 命中态+真实样本过滤/9 页签零回归/viewer）；回归 task27×3/29/31/32/bug071/34/35/36/37/38/39/40/41/42+npm+SEC-001 全绿；308 基线零漂移；测试数据清零。
