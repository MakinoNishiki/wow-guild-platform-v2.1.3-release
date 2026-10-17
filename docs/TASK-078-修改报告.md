# 任务书 #78 修改报告：12.1.5 副本掉落入库（基希克斯破封 + 8 大米本）

> 日期：2026-10-17 ｜ 执行：Kimi Code ｜ 类型：纯数据入库（零代码变更，不 bump 版本串）
> 结果：**基希克斯破封 10 件 + 大米 207 件 upsert 全部完成并复核**；字典新建 game_raids/game_bosses 各 1 行；2 件与 sql/29 既有裁定冲突的装备已按原裁定再删。

## 一、输入与管道

- 输入：Exporter 1.0.28 `/wjdc all` 落盘 `WoWButlerExporter.lua`（2026-10-17 16:14，312KB）
- 管道：`wjdc_convert.py`（--dict/--existing 由 DB 实时导出）→ `scripts/import-boss-loot-batch.js`（字典先查后插 → 范围过滤 → 入库 → 复核 → 幂等重跑）
- 非装备过滤：装饰/垃圾/宠物小伙伴/装饰品/配方/裁缝/附魔/制皮/锻造/珠宝加工/环境对应兑换物（基希克斯剔 2、大米剔 17）；至暗之夜不在本批数据集内

## 二、schema 前提勘误（通知三处与实表不符，已按实证修正）

1. **无 `bosses` 表**：实际字典 = `game_raids` / `game_bosses`（本批新建：game_raids「基希克斯破封」（type=raid，season=S2，open_date=2026-10-15，sort_order=6）+ game_bosses「基希克斯」（boss_order=1））。
2. **`on_conflict=official_item_id` 两表均不可用**：
   - `boss_loot` 只有 pkey，**无业务唯一索引** → 改「先查后插」幂等（新 boss 全量新行，重跑应插数=0）；
   - `dungeon_loot` 真实唯一索引 = `uq_dungeon_loot_item(dungeon_id,boss_id,item_name) NULLS NOT DISTINCT` → upsert 改 `on_conflict=dungeon_id,boss_id,item_name` + merge-duplicates。
3. **大米掉落归 `dungeon_loot`**（通知全按 boss_loot 写是错的）， raid 归 `boss_loot`，分表执行。

## 三、验证清单逐项

| # | 检查项 | 实测 |
|---|---|---|
| 1 | 基线 | boss_loot=273 / dungeon_loot=427 |
| 2 | 字典 | 基希克斯破封/基希克斯 先查后插成功（新建 2 行；重跑则复用） |
| 3 | 入库 | 基希克斯 10 件插入（剔除非装备 2）；大米 upsert 返回 207 行（剔除非装备 17） |
| 4 | 增长 | boss_loot 273→**283**；dungeon_loot 427→430→（按 sql/29 再删 2 件）→**428** |
| 5 | 幂等 | boss 重跑应插数=0；dungeon 重跑返回 207 行 merge-update、总数不变 |
| 6 | 抽查 | 露瑟拉玛，圣光之裁 / 圣洁骑士的凰刃 / 日蚀临世之印：effect 完整、primary_tiers 四档数值齐全、icon_id 在列（**ilvl 列=null**：本次扫描未产出装等值，见申报） |

**基希克斯破封在库 10 件全名单**：侵蚀巨怪罩帽 / 具象恐惧护胸 / 圣光使者之盾碎片 / 圣洁骑士的凰刃 / 扭曲恐兽触须 / 日蚀临世之印 / 畸变指挥官护手 / 虚空编织者护腿 / 虫群召唤者指环 / 露瑟拉玛，圣光之裁。

## 四、sql/29 冲突件的处置（重要申报）

大米 upsert 净增 3 件中有 2 件是 **sql/29（BUG-101 残项订正）已裁定删除**的装备，本次新扫描使其复活。逐件复核后**按原裁定再删**（证据与原始判决一致，无新证据支持翻案）：

| 装备 | 新扫描证据 | 处置 |
|---|---|---|
| 黎明之刃的战刃（258045） | effect=「使用：将此外观添加到你的战团收藏中。」 | 外观解锁件，与 sql/29 判决一致 → 再删（204） |
| 防咬手套（159437） | primary_tiers 仅 normal 单档（力量/智力 10） | 普通难度专属非大米池，与 sql/29 判决一致 → 再删（204） |
| 抛光的光木引导匕首（273778） | normal/heroic/mythic 三档 + 实战特效 | 合法大米装备 → 保留（本批唯一净增大米件） |

 dungeon_loot 净增因此 = +1（抛光匕首），终值 428。

## 五、申报

1. **ilvl 列**：基希克斯 10 件 ilvl=null（本次扫描未产出装等值；effect/四档数值/icon_id 齐全）。装等显示档与数值同档绑定纪律下，留空优于错填；待后续 ilvl_tiers 副轨或人工复核补录。
2. 大米 207 件中 204 件为 merge-update（12.1.5 数据刷新既有行），净新增仅抛光匕首 1 件。
3. 产物：`scripts/import-boss-loot-batch.js`（可重跑幂等）+ `backup/2026-10-17-task78/`（dict/existing/转换产物全留档）。
4. 台账：REQ-166 登记。
