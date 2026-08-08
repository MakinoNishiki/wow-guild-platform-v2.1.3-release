# TASK-028 WP2 修改报告 —— 公示页过滤器重构（筛选规范 v2.0）

- 任务：tasks/任务书28-数据公示页改版v2.md §WP2
- 施工日期：2026-08-08
- 状态：**完工待验收，未 commit / 未 push**（git 纪律：运营验收通过前不提交）

## 一、执行口径（§0 五条裁定，已全部落地）

| # | 裁定 | 落地 |
|---|------|------|
| ① | 区头标题层级分类；部位/类型细粒度彻底取消，由来源单选取代；228px mockup 方案 | ✔ |
| ② | 来源四值（团本/大秘境/副本任务/专业制造），当季无数据 chip 不渲染 | ✔（副本任务/专业制造无数据源恒不渲染，预留值不写死） |
| ③ | 五子项 = 全部+四值五枚 chip | ✔（当前实际渲染：全部/团本/大秘境） |
| ④ | 动画两者并存（筛选器展开收起 + 卡片入场 fade），150–250ms ease-out 只动 transform/opacity | ✔ |
| ⑤ | 基线施工时重锚，任务书 341 旧口径作废 | ✔ 实测口径 = 排杂后动态计算（施工时 343，见「五、数据漂移说明」） |

## 二、实际改动点

### 1. 规范文档
- `docs/公示页筛选系统设计规范.md`：全文替换为 **v2.0 正式版**，文首标注取代 v1.0、v1.0 废止。
- `docs/筛选条设计规范v2.0-送审稿.md`：评审件留存（新增文件，未跟踪）。
- `docs/魔兽管家UI设计规范v2.md` §5：筛选规范指针同步 v2.0。

### 2. `data.html`（筛选条 DOM 重构）
- 新结构：`#dpFilterBar > #dpFilterToggle + #dpFilterRows`；rows 内 = `.dp-top-row`（搜索框 `#dpSearch`+清除钮+`#dpResetFilters`「重置筛选」按钮）→ 三个 `.dp-group`（`.dp-group-head` 区头标题+`.dp-group-note` 注释 + `.dp-chips`：主属性 `#dpPrimaryChips` / 副属性 `#dpSecondaryChips` / 来源 `#dpSourceChips`，来源组外壳 `#dpSourceGroup`）。
- 删除：部位 `#dpSlotChips`、类型 `#dpTypeChips` 两排、「排除杂项」整块（开关+问号帮助 `#dpExcludeMisc`/`#dpMiscHelp`）。
- 版本串双头递增 `20260807.22 → 20260808.23`（data.html 6 处 + index.html 8 处，旧串零残留）。

### 3. `css/data-public.css`
- 新增：`.dp-filter-rows`/`.dp-top-row`/`.dp-search-wrap`/`.dp-reset-btn`/`.dp-group`/`.dp-group-head`/`.dp-group-note`。
- 动画：`@keyframes dpRowsIn`（≤768px 展开时 translateY(-6px)+fade）、`.dp-filter-rows.closing`（收起 0.2s ease-out，仅 opacity/transform）、`.dp-item.dp-enter`+`@keyframes dpCardIn`（卡片入场 0.2s ease-out both，translateY(6px)+fade）；`prefers-reduced-motion` 媒体查询三处全部降级。
- 删除：`.dp-chip-row`/`.dp-chip-label`/`.dp-chip-group-label`/`.dp-misc-row`/`.dp-search-row`/`.dp-misc-toggle`/`.dp-help`/`.dp-help-pop`/`.dp-filterbar .form-select`；保留 `.dp-chips`/`.dp-chip-sub`/`.dp-chip-divider`/`.dp-chip(.active)`。

### 4. `js/dataPublic.js`（逻辑重构）
- state：删 `slots`/`types`/`excludeMisc`，新增 `source: ''`；新增 `SOURCE_DEFS`（raid/dungeon/quest/profession）+ `sourceHasData(key)`（raid 经 season→raids→bosses→loot 链路、dungeon 经 season→dungeons→dungeonLoot 判定，quest/profession 恒 false）。
- 数据装载层排杂：`state.loot`/`state.dungeonLoot` 装载时过滤 `slot='杂项'` 并打 `_src` 行标记（raid/dungeon）——杂项页面零渲染、筛选零入口。
- 新增 `renderSourceChips()`：全部 chip + 当季有数据的来源值，单选互斥（点已选中值回全部），`state.source` 不在当季值域时回落 `''`（赛季切换安全）。
- `resetFilters()`：清搜索/主副/来源/套装三维 + DOM 同步，赛季切换与「重置筛选」按钮共用。
- `matchItem()`：删部位/类型/排除杂项三分支，加来源等值过滤；`hasLootFilter()` 同步新维度。
- `render(enterAnim)`：筛选交互（搜索/chip/重置）走 `render(true)` 给卡片加 `.dp-enter`；视图切换/折叠/套装筛选走 `render()` 无入场动画。
- 移动端 toggle 重写：收起走 `.closing` 退出动画 200ms 后移除 `filters-open`，防连点，reduced-motion 直收。
- 删除 `buildGroupedChips` 及 `SLOT_GROUPS`/`TYPE_GROUPS`/`groupOrder`（全文件 grep 零残留）。

### 5. 回归脚本锚点重写（只改失效锚点，无关断言未动）
- `scripts/verify-task23-patch.js`：参照集排杂动态化；赛季切换重置用例的部位 chip 换来源 chip（用例意图保留）。**33/33 PASS**。
- `scripts/verify-task23-patch3.js`：四维组合→三维组合（来源+主+副，期望值动态）；部位/类型模板排序断言删除（v1.0 特性 abolish）；「杂项沉底」→「杂项零渲染」；排除杂项开关用段→DOM 不存在+零渲染+默认全集基线三条。**28/28 PASS**。
- `scripts/verify-task23-patch4.js`：行序断言改 v2.0（top-row→主属性→副属性→来源，区头+注记逐字）；chip 规格改锚 `#dpPrimaryChips`；来源单选全流程互斥断言；新增「重置筛选」还原、动画三条（`.dp-enter`/`.closing` 200ms/reduced-motion 直收）+CSS 文本断言（时长与属性白名单）；1920 档与移动端折叠改锚 `.dp-filter-rows`/`.dp-group`。**45/45 PASS**。

## 三、验证逐项

| 项 | 结果 |
|---|---|
| `node --check js/dataPublic.js` | ✔ |
| `npm test`（test/server-security.test.js） | ✔ 5/5 |
| SEC-001 代理鉴权回归 `scripts/verify-authz.js` | ✔ 34/34，测试用户/公会已删除零残留 |
| `scripts/verify-task23-patch.js` | ✔ 33/33，T23X 测试数据零残留（掉落=0 BOSS=0 赛季=0） |
| `scripts/verify-task23-patch3.js` | ✔ 28/28（只读零写入） |
| `scripts/verify-task23-patch4.js` | ✔ 45/45 |

### 真浏览器实测点（playwright chromium，本机自起 server，1366×768 / 1920×1080 两档）
- 页面 `/data.html`，筛选条 `#dpFilterBar`：首行搜索框（置顶加宽）+「重置筛选」按钮，其下三个区头标题组（主属性·多选 / 副属性·多选 / 来源·单选·值域随赛季数据驱动）——截图 `backup/2026-08-08-task28-wp2/impl-filterbar-{1366,1920}.png`。
- 来源组点「团本」chip：单选互斥高亮、全部失活、页面只剩团本区块有卡——截图 `impl-filterbar-raid-{1366,1920}.png`（patch4 脚本含再点回全部、切大秘境的全流程断言）。
- 「重置筛选」按钮：在筛选+搜索词状态下一键还原全集（patch4 断言覆盖）。
- 移动端 ≤768px：「筛选 ▾」展开/收起，收起 `.closing` 动画 200ms 后隐藏，reduced-motion 直收（patch4 断言覆盖）。
- 杂项零渲染：全页 `.dp-tag` 无「杂项」文本（patch3/patch4 双脚本断言）。
- 全程零 JS 报错、零 404（三脚本控制台/请求监听断言）。

## 四、改动文件清单（git status）
```
M  css/data-public.css
M  data.html
M  docs/公示页筛选系统设计规范.md      （全文替换 v2.0 正式版）
M  docs/魔兽管家UI设计规范v2.md        （§5 指针同步）
M  index.html                          （仅版本串）
M  js/dataPublic.js
M  scripts/verify-task23-patch.js
M  scripts/verify-task23-patch3.js
M  scripts/verify-task23-patch4.js
?? docs/筛选条设计规范v2.0-送审稿.md    （评审件留存）
```
`backup/2026-08-08-task28-wp2/` 截图与一次性脚本不入库（backup/ 已 gitignore）。

## 五、数据漂移说明（基线口径）
施工时实测排杂基线 343（boss_loot 190 含杂项 51+兑换物 1；dungeon_loot 221 含杂项 17）。验收跑脚本时库内数据已变为 boss_loot 188 / 页面 341（力量 103/爆击 168）——系运营侧数据中心正常录入变动。三个脚本期望值已全部改为从 REST 实抓数据动态计算（过滤 slot=杂项），基线漂移不影响断言有效性；任务书 341 旧口径按裁定⑤作废。

## 六、遗留
- 无阻塞遗留。副本任务/专业制造两值为预留：将来数据模型引入对应来源时，只需在 `sourceHasData()` 补判定链路 + 装载层 `_src` 标记，chip 自动出现，无需改 DOM。
- 台账（REQ/BUG 编号）与 changelog 四维补录：按惯例随下次统一更新入库，本 WP 未动。
- **未 commit、未 push**，等运营验收。
