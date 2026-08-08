# 任务书 #29-WP1 修改报告：四难度档数据链（插件 1.0.7 + 转换器 + sql/20）

> 日期：2026-08-08 ｜ 执行：Kimi Code ｜ 需求编号：**REQ-087**（台账行随下次统一更新入库）
> 状态：**代码侧完成待运营验收**（未 commit、未 push，git 纪律候验收）；S1 回填等运营上号跑完 1.0.7 导出再执行
> 死线：**8.12 前格式冻结**（冻结声明 v2 见三节），S2（8.13）按此录入

---

## 一、侦察结论：12.x 客户端 EJ 难度档切换可用性

> 方法：桌面研究（warcraft.wiki.gg API 页/结构体页 + 12.0 客户端 Blizzard UI 源码 Gethe/wow-ui-source live 分支交叉验证，2026-08-08）；真机存在性由 1.0.7 运行时探测 + probe 诊断兜底（GetItemStats 同批病害前科在案，不拍脑袋）。

1. **`EJ_SetDifficulty` / `EJ_GetDifficulty` 在 12.x 存活**：wiki 无移除标记、在 12.x API 总表在册；12.0 客户端暴雪 EJ 界面源码（`Blizzard_EncounterJournal.lua` L737/1210/2734）仍在调用。5.4 起吃**标准 DifficultyID**（更早的私有枚举 1–4 已作古）。`C_EncounterJournal` 命名空间**无** SetDifficultyID/GetDifficultyID 等价物——团本切档唯一路径就是这两个老函数。
2. **档位 ID 表（DifficultyID，12.0.1 在册）**：随机团队 **lfr=17** ｜ 普通 **normal=14** ｜ 英雄 **heroic=15** ｜ 史诗 **mythic=16**。`EJ_SetDifficulty(17)` 即切随机档，无需换算。
3. **关键机制（决定采集写法）**：`SetItemByID(itemID)` **不受 EJ 难度影响**——裸 ID 扫四档同值，等于白扫；但 `GetLootInfoByIndex` 返回表的 **`link` 字段由 C++ 按当前手册难度生成**（暴雪 EJ 掉落按钮直接把 `itemInfo.link` 交给 tooltip 显示，自身不做额外换算）。**正确路线 = 切档 → 按同序号重取 link → `SetHyperlink(link)` 重扫**，不需要手搓 bonusID。
4. **回退方案定案**：bonusID 通道不可作盲写回退——10.x 后团本改「缩放+升级轨道」体系，无干净四档 bonusID 常量（AtlasLoot 自己也是靠通用缩放 bonus + ItemBonus.db2 推算，维护成本高、逐小版本漂移）；「tooltip 难度行解析」只标识当前档不提供四档数值。故 1.0.7 的实际回退 = **运行时双条件探测（切档函数 + link 通道），任一缺失自动回退单档采集（tiers 不产出）+ 红字明示 + probe 诊断**，结论待真机首跑证实后迭代。
5. **唯一真机待验证点**：任务书 #26-fix4 真机笔记曾记录 12.x `GetLootInfoByIndex` 返回稀疏表（仅 itemID/encounterID/稀有度标记）——**link 字段是否在场**wiki 结构体（含 link）与真机笔记不一致，首跑 `/wjdc probe 1` 的「四档缩放实证」段一锤定音；次要风险 = link 缩放对饰品特效类动态数值的覆盖度（无书面资料，验收抽查覆盖）。
6. 附带存档：`GetItemStats` 11.0.2 已移除（替代 `C_Item.GetItemStats(itemLink)`，支持带 bonus 段 itemString）；`EJ_DIFFICULTY_UPDATE` 事件、`C_EncounterJournal.SetPreviewMythicPlusLevel`（M+ 层数预览，与本任务无关）存在性已录 probe。

## 二、实际改动点

### 1. 插件 1.0.7 — `addon/WoWButlerExporter/`（WoWButlerExporter.lua / Probe / .toc）

- `ADDON_VERSION` 1.0.6 → **1.0.7**（toc 同步）；
- **四难度档采集**（仅团本段）：`RAID_TIERS = {lfr=17, normal=14, heroic=15, mythic=16}`（档位 key 英文枚举 + 标准 DifficultyID）；`collectTiers(loot)` 逐 BOSS 四档循环——每档 `EJ_SetDifficulty(id)` + `EJ_GetDifficulty()` 读回校验，按 loot 行携带的 `li` 序号**重取** `GetLootInfoByIndex(li)` 拿当档 `link`（带 `itemID == it.id` 一致性校验，防不同难度掉落列表错位串行），`SetHyperlink(link)` 重扫、`parseStatLines` 解析数值，只记有数值的档（无静态属性品类天然空档，与「缺档不记」同口径）；`li` 出库前抹除不进文件；
- **重构零行为变化**：tooltip 行读取抽 `readTipLines()`、属性行解析抽 `parseStatLines()`（原 `parseItemDetail` 主链路逻辑逐行保留，特效提取在 tier 复用时自动跳过）；新增 `scanLink(link)` 走 `SetHyperlink`；
- **运行时自适应回退**：`tierChannelAvailable()` 双条件（EJ 切档函数 + `C_EncounterJournal.GetLootInfoByIndex`）在场才启用；单 BOSS 采集报错/通道异常 → stripTiers 回退单档不拖垮既有数据；连续 2 个 BOSS 异常 → 通道判死，后续 BOSS 不再切档，红字提示截图反馈；导出前保存原难度档、收尾 `EJ_SetDifficulty(origDiff)` 还原不留全局副作用；
- **进度提示**：启用时明示「时长约为单档 4 倍属预期」，逐 BOSS「四档重扫完成（N/M 件带档）」；回退时红字「四档采集通道不可用…tiers 不产出」；`meta.tier_channel = ej-link / unavailable / n/a` 留痕；
- **大秘境不启四档**（口径：无四难度，values 唯一数值来源），`exportInstances(false, …)` 不传 tierOn；
- **probe 诊断增强**：实例探针新增「四难度档通道诊断」段（切档函数存在性 / 试切 LFR(17) 读回 + 还原 Normal(14) / `C_Item.GetItemStats`、`C_TooltipInfo.GetHyperlink` 存档）与「四档缩放实证」段（同一物品 LFR(17) vs 史诗(16) 重取 link 重扫两档值对比，link 缺失即稀疏表现场直击）；`WJDCShared` 增共享 `scanLink`/`parseStatLines`；
- **原字段（含 values 两列）格式零改动、向后兼容**；大秘境导出路径与 `/wjdc me` 零改动。

### 2. 转换器 — `scripts/wjdc_convert.py`

- 新增 `tier_map()` 规整器：档位 key 白名单 `lfr/normal/heroic/mythic`（英文枚举，顺序固定），每档值走既有 `stat_map()`；只记存在的档（无随机档不出 lfr 键）；缺字段/空表/全非法档 → `None`；
- `norm_items` 拍平行新增 `primary_tiers`/`secondary_tiers`；`build_load_rows` 入库 JSON 基座透传两字段（旧格式导出/大秘境 → null 留空，不报错）；
- 核对表属性列带档数标注：`爆击(300)、急速(100)〔4档〕`（`stat_cell` 加可选 tiers 参数，无 tiers 形态与旧版完全一致）；
- 终端输出新增四档统计行（团本 tiers 覆盖率 N/M），**大秘境 tiers 非零即告警**（口径应为 0）；
- 文首冻结声明 v2 入库（见三节）。

### 3. sql/20 — `sql/20_task029_difficulty_tiers.sql`（新建）

`boss_loot` / `dungeon_loot` 各加 `primary_tiers jsonb`、`secondary_tiers jsonb`（均 null 默认）；`ADD COLUMN IF NOT EXISTS` 幂等可重复执行；文首回滚说明（DROP COLUMN ×4 + NOTIFY）；文件末尾 `NOTIFY pgrst, 'reload schema'`。**只加列不改列**，values 两列（sql/19）与全部既有字段零触碰。文首注释写明大秘境口径（tiers 恒 NULL，values 是其唯一数值来源）。

### 4. S1 回填脚本（备妥不执行）— `backup/2026-08-08-task29-wp1/backfill_tiers.py`

照 WP1 模板：定向 PATCH **只写 tiers 两列**，键 `boss_id+item_name` / `dungeon_id+boss_id(可空)+item_name`，`Prefer: return=representation` 逐行校验命中唯一，幂等可重跑，异常行单列报告。大秘境行 PATCH 写 null 保持口径显式一致。**等运营上号跑完 1.0.7 导出并转换后再执行。**

### 5. 文档同步

- `scripts/wjdc/README.md`：load JSON 产物说明补 tiers 两列（含大秘境单档口径）、tiers mock 回归命令、新增「赛季录入 SOP」段（S2 用 1.0.7 四档采集 / 冻结 v2 / 团本 tiers 非空率 ≥95% 判定线）；
- `addon/WoWButlerExporter/README.md`：1.0.7 四难度档说明段（字段样例、4 倍时长预期、回退红字含义、大秘境口径）；
- `addon/WoWButlerExporter/运营测试步骤卡.md`：第 4 步预期补四档进度提示与时长预期、第 6 步预期补 tiers 字段样例（含大秘境无 tiers 断言）。

## 三、转换器输出格式冻结声明 v2（8.13 S2 翻牌依据）

> **冻结声明 v2**：自 2026-08-12 起，`wjdc_convert.py` 入库 JSON 输出格式冻结为：
> 既有字段（item_name/slot/item_type/official_item_id/note/effect/primary_stats/secondary_stats + boss_id 或 dungeon_id+boss_id）
> **+ `primary_values`/`secondary_values`**（jsonb 对象或 null，键=中文属性名，值=整数）
> **+ `primary_tiers`/`secondary_tiers`**（jsonb 对象或 null；`{lfr/normal/heroic/mythic: {属性名: 整数}}`，档位 key 英文枚举，只记存在的档；**大秘境恒 null**——大秘境无四难度（钥石层数缩放），values 两列继续作为其唯一数值口径）。
> 8.13 S2 翻牌录入按此格式执行；冻结期内不再变更字段名、类型与空值口径。旧格式导出（无 values/tiers 字段）照常转换、相应列留 null。插件侧导出格式（1.0.7）同步冻结。
> （同文已写入 `scripts/wjdc_convert.py` 文首 docstring。）

## 四、验证

- **转换器三格式实测**（嵌入式 Python 3.12.10，`backup/_pytmp/`，gitignored）：
  - 1.0.7 新格式 `mock_savedvariables_tiers.lua`（新增，四形态：四档齐全行 / 缺 lfr 档行 / 无 tiers 行 / 大秘境行）：转换通过，boss 3 行 + 秘境 1 行、待匹配 0；逐键断言全过——`织影者头冠` 四档键序 `lfr/normal/heroic/mythic` 值随档递增（智力 480/512/544/576），`残响重锤` 无 lfr 键只记三档，`影纹披风` 与大秘境行 tiers=null 且 values 完好；
  - 旧格式 `mock_savedvariables.lua`（无任何 values/tiers 字段）：转换通过，tiers 列全 null 不报错；
  - 1.0.5 格式 `mock_savedvariables_values.lua`（有 values 无 tiers）：转换通过，values 照常透传、tiers 全 null；
  - 核对表档数标注实测：`爆击(300)、急速(100)〔4档〕` / `精通(288)〔3档〕`，无 tiers 行与旧版形态一致；终端四档统计行「团本 2/3 行带 tiers；大秘境 0 行」；
- `python -m py_compile`：wjdc_convert.py / backfill_tiers.py 均通过；
- **npm test 5/5**；server.js 零改动（SEC-001 鉴权面无回归风险）；零测试数据创建；
- Lua 本机无解释器，插件改动段人工精读复核（语法/配对/作用域），真机语法以运营游戏内加载为准。

## 五、待运营动作（验收闭环）

1. sql/20 迁移执行（SSH + docker exec psql，幂等可重复，执行记录另出迁移报告）；
2. 游戏内覆盖插件 1.0.7 → `/wjdc all`（采集时长约为 1.0.6 的 4 倍，15–20 分钟量级属预期，聊天框有逐档进度提示）→ `/reload` → SavedVariables 发顾问侧；
3. 转换 + S1 回填（定向 PATCH 只写 tiers 两列）；
4. 运营线上复核：四档数值抽查 ≥3 件团本装备（lfr ≤ normal ≤ heroic ≤ mythic，与手册对应档预览逐值一致）、大秘境行 tiers=null + values 完好、tiers 非空率 ≥95%（排除杂项/纯特效饰品口径）、行数 190/221 零漂移、其余字段零触碰。

## 六、遗留与说明

1. **真机待验证项（如实申报）**：① `GetLootInfoByIndex` 返回表 12.x 是否带 `link` 字段——wiki 结构体（含 link）与任务书 #26-fix4 真机稀疏表笔记不一致，1.0.7 双条件探测 + probe「四档缩放实证」段已备好，首跑 `/wjdc probe 1` 一锤定音；若 link 缺席，导出自动回退单档（tiers 不产出），届时迭代方向 = `C_Item.GetItemStats(itemLink)` 通道或 bonusID 数据外购，另立小案；② link 缩放对饰品特效类动态数值的覆盖度无书面资料，靠验收抽查（≥3 件逐值对照手册）实证；③ 不同难度掉落列表若错位（LFR 独有件），`itemID` 一致性校验会丢弃该件当档而非错记——属保守取向，非空率若因此跌破 95% 线会暴露。
2. `_CMP_FIELDS`（对账差异字段集）本次未加 tiers 列——S2 翻牌对账口径不变（同 WP1 对 values 的处置）。
3. 站点版本串不动（任务书红线：站点版本随下次前端改动再递增）；WP2 卡面难度选择器档期在 #28 收尾后另排。
4. commit 未做（git 纪律）。验收通过后建议标题：「任务书#29-WP1：四难度档数据链（插件1.0.7切档采集+转换器透传+sql/20）」。
