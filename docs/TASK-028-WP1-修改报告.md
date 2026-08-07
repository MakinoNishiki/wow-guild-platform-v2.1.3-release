# 任务书 #28-WP1 修改报告：星标数据链（插件 1.0.5 + 转换器透传 + sql/19）

> 日期：2026-08-07 ｜ 执行：Kimi Code ｜ 需求编号：**REQ-086**（台账行随下次统一更新入库）
> 状态：**代码侧完成待运营验收**（未 commit、未 push，git 纪律候验收）；数值回填走运营通道，待运营上号跑 `/wjdc all`。

---

## 一、实际改动点

### 1. 插件 1.0.5 — `addon/WoWButlerExporter/WoWButlerExporter.lua`（+ .toc）
- `ADDON_VERSION` 1.0.4 → **1.0.5**（toc 同步）；
- 新增 `statValuesFromApi(itemID)`：优先通道 `GetItemStats("item:"..itemID)`（pcall 包裹），返回表的属性常量 key 经 `_G[key]` 解析为本地化短名后对照 PRIMARY/SECONDARY 白名单（力量/敏捷/智力；爆击/急速/精通/全能/吸血/闪避/加速——与既有名表同一集合），只收数值 >0 的项；API 不存在/异常/空表 → 返回 nil；
- `parseItemDetail` 数值采集（回退通道）：匹配模式 `^%+([%d,]+)%s*(.+)$` 同步捕获数值（千分位逗号剥离 `tonumber(num:gsub(",", ""))`），属性名数组 `primary`/`secondary` 提取逻辑零改动；
- 导出装配：API 通道整表优先，不可用回退 tooltip 解析值；loot 行新增 `primary_values` / `secondary_values` 两字段（无数值为空表），**原有字段格式不变（向后兼容）**。

### 2. 转换器透传 — `scripts/wjdc_convert.py`
- 新增 `stat_map()` 规整器：dict 且数值项 → `{名: 整数}`（整值浮点归一为 int）；缺字段/空表/非法项 → `None`；
- `norm_items` 拍平行新增 `primary_values`/`secondary_values`；`build_load_rows` 入库 JSON 基座透传两字段（旧格式导出 → null 留空，不报错）；
- 核对表属性列带值渲染 `stat_cell()`：`爆击(300)、急速(100)`；无数值保持原名表（新旧格式核对表形态一致可读）。

### 3. sql/19 — `sql/19_task028_star_values.sql`（新建）
`boss_loot` / `dungeon_loot` 各加 `primary_values jsonb`、`secondary_values jsonb`（均 null 默认）；`ADD COLUMN IF NOT EXISTS` 幂等可重复执行；文首回滚说明（DROP COLUMN ×4 + NOTIFY）；文件末尾 `NOTIFY pgrst, 'reload schema'`。**只加列不改列**，属性名数组列不动。

### 4. 文档同步
- `addon/WoWButlerExporter/README.md`：1.0.5 属性数值说明段（采集通道、向后兼容、无需额外操作）；
- `addon/WoWButlerExporter/运营测试步骤卡.md`：第 6 步预期补数值字段样例；
- `scripts/wjdc/README.md`：load JSON 产物说明补数值列 + 新 mock 回归命令；
- 版本串 `20260807.21` → **`20260807.22`**（index.html 8 处 + data.html 6 处，总红线「每 WP 版本串递增」）。

## 二、验证

- **转换器双格式实测**（本机无系统 Python，用嵌入式 Python 3.12.10 跑在 `backup/_pytmp/`——gitignored，仅本机工具，回填转换时复用）：
  - 新格式 `mock_savedvariables_values.lua`（新增，覆盖三形态：API 通道齐全行 / tooltip 回退形态 / 本行空表）：转换通过，boss 3 行 + 秘境 1 行、待匹配 0；`织影者头冠` `{"爆击":300,"急速":100}`、`残响重锤` `{"力量":1234}`（千分位剥离正确）、`守望者指环` `{"急速":176,"全能":176}`，空表行 → `null`；
  - 旧格式 `mock_savedvariables.lua`（1.0.0 无 values 字段）：转换通过，数值列全部 `null` 不报错，对账/待匹配/character.json 产物与改动前一致；
  - 核对表带值渲染实测：`智力(512)` / `爆击(300)、急速(100)`，空表行回退原名表；
- **导出字段样例**（新格式 loot 行形态，游戏内实跑待运营）：
  ```lua
  ["primary"] = { "智力" }, ["secondary"] = { "爆击", "急速" },
  ["primary_values"] = { ["智力"] = 512 },
  ["secondary_values"] = { ["爆击"] = 300, ["急速"] = 100 },
  ```
- `python -m py_compile scripts/wjdc_convert.py` 通过；Lua 本机无解释器，改动段人工精读复核（语法/配对/作用域），真机语法以运营游戏内加载为准（插件加载失败会在聊天框直接报错，可即时报回）；
- **npm test 5/5、SEC-001 34/34**；零测试数据创建（SEC-001 自建测试用户/公会后已自清理复核）。

## 三、转换器输出格式冻结声明（8.13 S2 翻牌依据）

> **冻结声明**：自 2026-08-07 起，`wjdc_convert.py` 入库 JSON 输出格式冻结为：
> 既有字段（item_name/slot/item_type/official_item_id/note/effect/primary_stats/secondary_stats + boss_id 或 dungeon_id+boss_id）**+ `primary_values`/`secondary_values`（jsonb 对象或 null，键=中文属性名，值=整数）**。
> 8.13 S2 翻牌录入按此格式执行；冻结期内不再变更字段名、类型与空值口径。插件侧导出格式（1.0.5）同步冻结。

## 四、待运营动作（验收闭环）

1. 游戏内装载插件 1.0.5 → `/wjdc all` → `/reload` → 把 SavedVariables 文件发我（运营测试步骤卡第 6 步已含数值字段预期）；
2. 我转换后交回 load JSON，由服务通道覆盖入库（数值列写入）；
3. sql/19 迁移执行（SSH + docker exec psql，幂等；先备份两表）——执行后 REST 复核：当前赛季装备 `secondary_values` 非空率 ≥95%（玩具/杂项类可空），抽查 5 件与游戏内数值一致（运营截图对照）；
4. 密钥运营私聊给，不落地仓库。

## 五、遗留与说明

1. GetItemStats 的常量 key→中文短名映射依赖 `_G[ITEM_MOD_*]` 全局串，12.x zhCN 客户端为既有机制；若真机出现 key 无对应全局串的边角属性，白名单对照自然丢弃（只收 10 个目标属性），不会污染数据。
2. `_CMP_FIELDS`（对账差异字段集）本次未加数值列——S2 翻牌对账口径不变；如运营希望回填对账含数值比对，另立小改动。
3. 控制台运行转换器时终端中文显示乱码系 GBK 终端显示问题，产物文件 UTF-8 内容正确（已逐字段核对）。
4. commit 未做（git 纪律）。验收通过后建议标题：「任务书#28-WP1：星标数据链（插件1.0.5数值采集+转换器透传+sql/19）」。
