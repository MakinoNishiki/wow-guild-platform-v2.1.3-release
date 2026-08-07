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
| `boss_loot_load.json` | 字段对齐 `boss_loot` 表（boss_id 由 BOSS 名匹配），official_item_id 为整数；1.0.5 导出含 `primary_values`/`secondary_values` 数值表（jsonb，sql/19），旧格式导出两列留空（null） |
| `dungeon_loot_load.json` | 字段对齐 `dungeon_loot` 表（dungeon_id + boss_id），official_item_id 为字符串（该列 text）；数值列同上 |
| `待匹配清单.md` | 匹配不到 game_bosses / game_dungeons 的行单列（含原因），**禁止自动创建字典条目** |
| `对账差异.md` | 仅 `--existing` 时生成：新增 / 变更 / 缺失 三类 |
| `character.json` | 仅导出含 `me` 段时生成，字段对齐用户中心「我的角色」（armory_url 恒空） |

## dict.json / existing.json 怎么来

字典表已开放匿名读（sql/16），直接 PostgREST 导出后按下列形状整理即可：

```json
// dict.json
{
  "raids":    [{ "id": "uuid", "name": "虚影尖塔" }],
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
