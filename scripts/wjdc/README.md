# WJDC 转换管道（任务书 #26 WP2）

> 把插件（`addon/WoWButlerExporter`）导出的 SavedVariables 转成可审核、可装载的产物。
> **只产文件，不落库**；录入动作由顾问侧走服务通道执行。零第三方依赖，Python 3.8+ 标准库。

## 用法

```bash
python scripts/wjdc_convert.py \
  --input <WoWButlerExporter.lua> \   # 运营游戏内 /wjdc 导出并 /reload 后的 SavedVariables
  --dict  <dict.json> \               # 字典导出（见下）
  --existing <existing.json> \        # 可选：数据中心现存掉落，启用对账
  --outdir <输出目录>
```

产物：

| 文件 | 说明 |
|---|---|
| `核对表.md` | 团本/大秘境分区 BOSS→装备行 + 统计行；缺部位/缺类型/特效为空标黄（`<mark>`）；套装段含 failed 专精标黄 |
| `boss_loot_load.json` | 字段对齐 `boss_loot` 表（boss_id 由 BOSS 名匹配），official_item_id 为整数；1.0.5 导出含 `primary_values`/`secondary_values` 数值表（jsonb，sql/19），旧格式导出两列留空（null）；1.0.7 导出另含 `primary_tiers`/`secondary_tiers` 四难度档数值表（jsonb，sql/20，`{lfr/normal/heroic/mythic: {属性名: 整数}}`，只记存在的档），旧格式导出 tiers 留 null |
| `dungeon_loot_load.json` | 字段对齐 `dungeon_loot` 表（dungeon_id + boss_id），official_item_id 为字符串（该列 text）；数值列同上；**大秘境无四难度（钥石层数缩放），tiers 恒 null**，`primary_values`/`secondary_values`（副本手册预览口径）是其唯一数值来源 |
| `待匹配清单.md` | 匹配不到 game_bosses / game_dungeons 的行单列（含原因），**禁止自动创建字典条目** |
| `对账差异.md` | 仅 `--existing` 时生成：新增 / 变更 / 缺失 三类 |
| `character.json` | 仅导出含 `me` 段时生成，字段对齐用户中心「我的角色」（armory_url 恒空） |

## dict.json / existing.json 怎么来

字典表已开放匿名读（sql/16），直接 PostgREST 导出后按下列形状整理即可：

```json
// dict.json
{
  "raids":    [{ "id": "uuid", "name": "虚影尖塔", "type": "raid" }],
  "dungeons": [{ "id": "uuid", "name": "梦境裂隙" }],
  "bosses":   [{ "id": "uuid", "name": "织影者瓦丝琪", "raid_name": "虚影尖塔", "dungeon_name": null }]
}
// existing.json
{ "boss_loot": [ { "boss_id": "uuid", "item_name": "...", "slot": "...", "item_type": "...",
                   "official_item_id": 240001, "effect": "...", "primary_stats": ["..."],
                   "secondary_stats": ["..."] } ],
  "dungeon_loot": [ { "dungeon_id": "uuid", "boss_id": "uuid 或 null", "item_name": "...", ... } ] }
```

参考导出命令（anon key 即可，9 张字典表 anon 可读）：

- `raids[].type`（R13 / BUG-062，2026-08-08）：透传 `game_raids.type`——`raid` 固定团本 / `lair` 巢穴（归团本口径保留展示）/ `world` 世界BOSS（不属任何副本场景，公示页剔除、**数据保留入库**）。核对表团本段按此分型标注（统计行含巢穴/世界BOSS 小计、BOSS 头带口径注记）；load JSON 照常产出（world 掉落匹配 boss_id 入库）。旧形状 dict.json（无 type 字段）不标注，行为同旧版。导出时 `game_raids` 查询带 `select=id,name,type`。

```bash
curl -s "$SUPABASE_URL/rest/v1/game_bosses?select=id,name,raid:game_raids(name),dungeon:game_dungeons(name)" \
  -H "apikey: $ANON_KEY"
```

## mock 回归

```bash
python scripts/wjdc_convert.py \
  --input scripts/wjdc/mock_savedvariables.lua \
  --dict  scripts/wjdc/mock_dict.json \
  --existing scripts/wjdc/mock_existing.json \
  --outdir scripts/wjdc/out
```

mock 覆盖三态：正常行 / 缺字段行（核对表标黄）/ 未知 BOSS 与未知副本行（进待匹配清单）；
另含套装 failed 专精与 `/wjdc me` 角色档案段。产物目录 `scripts/wjdc/out*` 不入库（.gitignore）。

数值字段回归（任务书 #28 WP1，1.0.5 新格式 + 旧格式兼容双跑）：

```bash
python scripts/wjdc_convert.py \
  --input scripts/wjdc/mock_savedvariables_values.lua \
  --dict  scripts/wjdc/mock_dict.json \
  --outdir scripts/wjdc/out-values
```

`mock_savedvariables_values.lua` 覆盖：数值齐全行（API 通道形态）/ tooltip 回退形态（千分位已剥离整数）/
本行无数值（空表 → load JSON 留 null）；旧 mock（无任何 values 字段）转换不报错、数值列留空。
核对表属性列有数值时带值渲染（`爆击(300)、急速(100)`），无数值保持原名表。

四难度档字段回归（任务书 #29 WP1，1.0.7 新格式）：

```bash
python scripts/wjdc_convert.py \
  --input scripts/wjdc/mock_savedvariables_tiers.lua \
  --dict  scripts/wjdc/mock_dict.json \
  --outdir scripts/wjdc/out-tiers
```

`mock_savedvariables_tiers.lua` 覆盖：四档齐全行 / 缺档行（无 lfr 键，只记存在的档）/ 无 tiers 行（→ 留 null 不报错）/
大秘境行（tiers 恒 null，values 保留）；核对表属性列带档数标注（`爆击(300)、急速(100)〔4档〕`）。
旧 mock（无 tiers 字段）转换 tiers 列全 null 不报错。

## 赛季录入 SOP（任务书 #29 WP1 定稿）

- **S2（8.13 翻牌）起，掉落采集一律用插件 1.0.7 四档采集**：游戏内 `/wjdc all` → `/reload` →
  SavedVariables 发顾问侧 → 本转换器出 load JSON → 服务通道装载/回填。
- 转换器入库 JSON 格式自 **2026-08-12 冻结（冻结声明 v2，见 wjdc_convert.py 文首与任务书 #29 WP1 修改报告）**：
  既有字段 + values 两列 + tiers 两列；冻结期内不变更字段名、类型与空值口径。
- 大秘境 tiers 恒 null 为口径特性而非缺数据；团本 tiers 非空率（排除杂项/纯特效饰品口径）应 ≥95%，
  低于该线先查导出文件的 failed 段与切档回退提示再录入。
