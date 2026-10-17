# WoWButler 插件全家桶源码提取（任务书 #76）

> 提取日期：2026-10-15 ｜ 用途：合并统一工具箱（WoWButlerToolkit）前的源码结构与接口分析
> 提取方式：仓库 `addon/` 逐字节复制（sha256 校验一致），关键注释/API 调用点/数据格式定义全保留
> 清单：4 个目标插件，**3 个在场完整提取，1 个缺失申报（WoWButlerHandbook）**

## 缺失申报

**WoWButlerHandbook（首领手册，0.1.3）——源码未找到**，三处核查均无：
1. 仓库 `addon/`（仅 Exporter/Decor/Collector 三目录）
2. 全仓库文件名检索（`**/WoWButlerHandbook*` 零命中）
3. 游戏目录 `C:\Azeroth\World of Warcraft\_retail_\Interface\AddOns\`（无 Handbook；另有 WoWButlerEJ / WoWButlerDecorDumper 两个非目标目录在场）

如需 Handbook 参与合并，请提供其源码位置或历史副本。

## 一、WoWButler Data Exporter（v1.0.27）

**路径**：`docs/plugin-sources/WoWButlerExporter/`（源：`addon/WoWButlerExporter/`）

| 文件 | 行数 | 说明 |
|---|---|---|
| WoWButlerExporter.toc | 5 | Interface 120000 / Version 1.0.27 / SavedVariables |
| WoWButlerExporter.lua | **1633** | 主逻辑（EJ 静态字典采集：团本/大秘境掉落、四档数值、毒咒、ilvl_tiers 等） |
| WoWButlerExporter_Probe.lua | 345 | 探针（双通道 tooltip dump/取证） |
| README.md | — | 使用说明 |
| 运营测试步骤卡.md | — | 真机验收判据（V1-V17） |

- **持久化/导出**：SavedVariables 全局表 `WJDCDump`（含 `meta`（run_id/timestamps/partial/smoke 等）+ `me`（角色档案）+ 分段数据（raids/dungeons → instances → bosses → loot 行））；1.0.13 起按段提交（断链零留存修复）
- **关键 API**：`C_EncounterJournal.*`（EJ_SelectInstance/SelectEncounter/GetLootInfoByIndex 等）、`C_Item.GetItemInfo/GetItemStats`、`GameTooltip` 双通道（SetItemByID / SetHyperlink）、`C_Timer.After`（异步链防 C 栈溢出，1.0.14 根治）
- **数据格式**：loot 行 = name/itemID/iconID（数字 fileID）/ilvl/type/slot/effect/venomcurse/primary_stats/secondary_stats + primary_tiers/secondary_tiers/ilvl_tiers 四档键（lfr/normal/heroic/mythic）
- **sha256**（主文件）：`f356a7c2f996b3e9d30655098d3b5b72c7ed21705ca800af1f5bc99aec3691a6`

## 二、WoWButlerDecor（家宅装饰，v0.2.0）

**路径**：`docs/plugin-sources/WoWButlerDecor/`（源：`addon/WoWButlerDecor/`）

| 文件 | 行数 | 说明 |
|---|---|---|
| WoWButlerDecor.toc | 7 | Interface 120000 / Version 0.2.0 / SavedVariables: WoWButlerDecorDB |
| WoWButlerDecor.lua | **345** | 主逻辑（家宅装饰目录全量采集 + 诊断 err/msg 输出） |

- **持久化/导出**：SavedVariables 全局表 `WoWButlerDecorDB`（/reload 或退出游戏写盘）；`/wbd scan` 触发全量采集（文件注释：约 MB 级）
- **下游**：`scripts/decor/convert_decor.py` 转 `decor_catalog` 表（2062 行）；tags 为暴雪官方 dataTagsByID 原值（BUG-108 勘定）
- **sha256**（主文件）：`e11e1c9a5715ea9c8ef4859286c85f53a4be137c5f085e0fba60e60264a5d74d`

## 三、WoWButlerCollector（拾取记录，v1.0.0，任务书 #75 Day1 新建）

**路径**：`docs/plugin-sources/WoWButlerCollector/`（源：`addon/WoWButlerCollector/`）

| 文件 | 行数 | 说明 |
|---|---|---|
| WoWButlerCollector.toc | 7 | Interface 120105 / Version 1.0.0 / SavedVariables: WoWButlerCollectorDB |
| core.lua | **246** | 主逻辑（拾取事件监听 + 过滤 + 记录 + /wbc 命令） |
| locales/zhCN.lua | 16 | 中文文案包（先于 core 加载） |

- **事件/API**：`CHAT_MSG_LOOT`（locale-safe 全局格式串 LOOT_ITEM_SELF/LOOT_ITEM 转 Lua 模式）、`ENCOUNTER_END`（180 秒首领归属窗）、`GetItemInfo`（第 10 返回值=图标 fileID）、`GetDetailedItemLevelInfo`、`GetInstanceInfo`
- **过滤**：品质 ≥4（史诗/传说）+ classID 数字排除表（0 消耗品/5 材料/7 商业货品/12 任务）
- **持久化/导出**：SavedVariables 全局表 `WoWButlerCollectorDB`（数组，字段 = itemName/itemID/iconID/quality/ilvl/slot(INVTYPE_*)/itemType/bossName/instanceName/difficulty/difficultyID/timestamp/playerName）；2000 条容量护栏 + 2 秒防抖
- **下游**：`scripts/export-collector-to-json.js` 转 JSON → 前端导入页 → `loot_drops` 表（sql/42）
- **sha256**（主文件）：`9a44bcca20098509183d95b648048962ddeb00c920466f8cabe53d53fbab147b`

## 合并工具箱接口差异速览（合并设计时需注意）

| 维度 | Exporter | Decor | Collector |
|---|---|---|---|
| 采集触发 | 手动命令全量扫描（EJ） | 手动 /wbd scan（Housing） | 事件被动监听（拾取） |
| 持久化变量 | `WJDCDump` | `WoWButlerDecorDB` | `WoWButlerCollectorDB` |
| 导出节奏 | 按段提交（partial 标记） | 一次性全量 | 持续追加（容量护栏） |
| 数据形态 | 实例→首领→掉落 三层嵌套 | 装饰目录平铺 | 拾取事件平铺数组 |
| 转换器 | wjdc_convert / validate-export.js | convert_decor.py | export-collector-to-json.js |

> 源码为提取时刻工作区版本（#75 Day2 完工态）。Exporter/Decor 自任务书 #49/#26 起未再改动，Collector 为 #75 新建。
