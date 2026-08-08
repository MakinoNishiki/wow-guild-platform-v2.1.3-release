# 任务书 #28 WP3-v4 体验修订 修改报告（R11–R13，WP3-v3 已签发后的增量）

- 日期：2026-08-08 ｜ 站点版本串：**20260808.27**（双头 index.html 8 处 + data.html 6 处，旧串零残留）
- 范围：运营指令 WP3-v4 增量 3 项（R11 来源行锚底 / R12 hover 续文自然接续 / R13 世界BOSS剔除+巢穴归团本）
- 状态：完工待验收。**未 commit、未 push**

---

## 一、R11 来源行锚底

- 实现：`.dp-item` 改 flex 列布局（内容行顶部堆叠），`.dp-item-src` `margin-top:auto` 锚定卡片底部 + `padding-top:6px` 保底间距（css/data-public.css:206-216, 245）。短卡空白留在末行内容与来源行之间，来源行不随内容上移。
- 证据：verify **WP3-13** 全页 308 张卡 来源行下缘==卡片内容盒下缘（±1px）零漂移；**WP3-13b** 锚点卡「分叉指环」在页、来源行=「魔导师平台 · 吉美尔鲁斯」、与上行间距 ≥6px。
- 截图：`v4-anchor-ring-row-1366.png`——分叉指环（短卡）与三张邻卡同一 grid 行，四卡来源行同底基线对齐，短卡空白在来源行之上。

## 二、R12 hover 续文自然接续

- 实现：展开层改为与预览行**同宽同字体、top:0 原位覆盖**；内部 = 隐藏前缀占位（`.dp-fx-hidden`，与折叠态可见前缀逐字相同）+ 可见续文文本节点，**同一文本流内联接续**（js/dataPublic.js measureEffectOverlays；css/data-public.css `.dp-item-effect-overlay`/`.dp-fx-hidden`）。
  - ①省略号只存在于折叠态：hover 时预览行（含…）被展开层实底遮住，展开层内零省略号；
  - ②续文从省略号原位置接着预览末字生长、自然换行——absolute 不推挤其他卡片；未溢出卡依旧无 hover（R7 不变）。
- 证据：verify ① 三张长特效卡断言升级——折叠截…、展开层无省略号、隐藏前缀==折叠态可见前缀、前缀+续文===数据源全文逐字、**几何断言**续文首字 top 偏移 ≈1×行高（同线续接）或 ≈2×行高（前缀恰满行、自然换行），容差 2px；1920 档同款；R7 全页不变量同步带「展开层无省略号」检查。
- 锚点卡实测数值（艾林先知的凝视）：前缀末字「…施放法术**和**」恰装满 2 行，续文「技能会显化…」自然换行起首——连续文本流、无空白行（诊断截图 `v4-gaze-debug-prefix.png`：前缀显形灰色+续文绿色，一段连续文本）。
- 截图：`v4-gaze-folded-1366.png`（折叠态截…）/ `v4-gaze-hover-1366.png`（展开态无省略号、续文接续生长）。

## 三、R13 实例口径修正（BUG-062：剔除世界BOSS，巢穴归团本）

### a) sql/24（`sql/24_bug062_world_boss_type.sql`，已执行）

迁移纪律同 sql/19–23（备份→SSH+docker exec→NOTIFY pgrst→回滚注释），执行输出：

```
迁移前行数：boss_loot 190 / dungeon_loot 221
迁移前类型分布：至暗之夜|raid（误标），孢陨幽境/潮缚石窟|lair
执行：ALTER TABLE ×2（CHECK 扩值域 raid/lair/world）→ UPDATE 1（至暗之夜→world）→ CREATE FUNCTION → GRANT → NOTIFY
复核：至暗之夜 type=world ✔ ｜ RPC world 零行 ✔ ｜ lair 孢陨幽境 11 件保留 ✔
     S1 基线 308/104/204 ✔ ｜ 跨赛季全集 310（=342−32）✔ ｜ 行数零漂移 190/221 ✔
团本 104 分实例：虚影尖塔 60 + 进军奎尔丹纳斯 25 + 梦境裂隙 8 + 孢陨幽境 11（lair）
```

- RPC 过滤用**黑名单** `gr.type is distinct from 'world'`——非白名单写法，lair 巢穴不误杀（运营禁令遵守）。
- 数据保留：至暗之夜 32 件 boss_loot 一行未删，仅公示层剔除。
- 附带防再误标：数据中心团本类型选项补「世界BOSS（非副本，公示页剔除）」（js/app.js mdEditRaid），typeLabel 补 world。

### b) converter 分类修复（S2 翻牌前置，8.13 前已完成）

- `scripts/wjdc_convert.py`：Dict 新增 `raid_type()` 透传 dict.json 的 `game_raids.type`；核对表团本段分型标注——统计行含「巢穴 X 实例（归团本口径）；世界BOSS X 实例 / X 件（公示页剔除，数据保留入库）」小计，BOSS 头带口径注记；load JSON 照常产出（world 掉落匹配 boss_id 入库）。旧形状 dict.json（无 type）行为同旧版。
- mock 覆盖：`mock_savedvariables.lua` 增至暗之夜（world）+ 孢陨幽境（lair）两实例；`mock_dict.json` raids 带 type。**三回归全过**（base/values/tiers exit=0），核对表实测输出：`统计：3 团本 / 4 BOSS / 6 件——巢穴 1 实例（归团本口径）；世界BOSS 1 实例 / 1 件（公示页剔除，数据保留入库）`。
- `scripts/wjdc/README.md`：dict.json 形状补 type 字段与口径说明。

### c) 基线变更与口径勘误

- **S1 全部 308 / 团本 104 / 大秘境 204**——与运营给定基线逐字一致（RPC 实测 + 顾问复核）。
- 勘误说明：约束中「断言按 297/93/204」与 c)「308/104/204」差 11 = 巢穴孢陨幽境。297/93 系「剔除巢穴」口径，与「巢穴归团本保留展示」裁定冲突，**未采用**；verify 三脚本断言统一按 308/104/204（含巢穴）实测锚定。

### d) 前端计数与 verify 同步

- dataPublic.js 无需改计数逻辑（RPC 服务端剔除，页面自然少 32 行；至暗之夜无掉落行 → renderRaids 空块不渲染）。
- verify 三脚本参照集团本侧增滤 `type !== 'world'`；patch4 新增 **WP3-14**：RPC 零 world 行、页面零至暗之夜实例行、lair 保留——注意 BOSS 名「至暗之夜降临」（进军奎尔丹纳斯）是合法团本内容，断言按「来源行以至暗之夜 · 开头」精确口径，不误伤。

## 四、verify 全绿输出（真浏览器 Playwright，data.html，1366/1920/390 三档）

| 脚本 | 结果 |
|---|---|
| `scripts/verify-task23-patch4.js` | **73/73**（新增 WP3-13/13b 锚底、WP3-14 世界BOSS剔除；①块升级 R12 几何+省略号断言） |
| `scripts/verify-task23-patch.js` | **33/33** |
| `scripts/verify-task23-patch3.js` | **28/28** |
| `npm test` | **5/5** |
| `scripts/verify-authz.js` | **34/34** |

日志：`backup/_pytmp/v4-patch4.log` / `v4-patch.log` / `v4-patch3.log` / `v4-npmtest.log` / `v4-authz.log`。

## 五、台账与文档回写（均标 2026-08-08）

- `docs/问题与需求清单.md`：**BUG-062 登记**（世界BOSS实例类型误标，已修复待验收）。
- `js/app.js` changelog 补录 2 条（功能优化 R11/R12 + 修复BUG R13/BUG-062）。
- `docs/魔兽管家UI设计规范v2.md` §4.4：全信息装备卡条款回写 v4（来源行锚底、续文自然接续、world 剔除基线 308）。
- `docs/公示页筛选系统设计规范.md` §5：世界BOSS剔除口径 + 基线 308=104+204（340 口径作废）；§6 对数基线同步。

## 六、改动文件清单

- `css/data-public.css`（R11 flex 列+锚底 / R12 展开层原位覆盖+.dp-fx-hidden）
- `js/dataPublic.js`（R12 隐藏前缀占位续文；文首注释口径）
- `js/app.js`（changelog 2 条；数据中心团本类型 world 选项+标签）
- `scripts/wjdc_convert.py` + `scripts/wjdc/README.md` + `scripts/wjdc/mock_savedvariables.lua` + `scripts/wjdc/mock_dict.json`（R13b 分类修复+mock）
- `sql/24_bug062_world_boss_type.sql`（已执行）
- `scripts/verify-task23-patch4.js` / `-patch.js` / `-patch3.js`（断言适配 v4）
- `index.html` / `data.html`（版本串 .26→.27，8+6 处）
- `docs/问题与需求清单.md` / `docs/魔兽管家UI设计规范v2.md` / `docs/公示页筛选系统设计规范.md`

**未 commit、未 push，等运营验收。**
