# 任务书 #75 Day1 修改报告：WoWButlerCollector 插件 + 转换脚本 + loot_drops 建表

> 日期：2026-10-15 ｜ 执行：Kimi Code ｜ 范围：修正版任务书 Day 1（A1 插件 + A2 转换脚本 + sql/42）
> 前置：.95 批次已确认 commit+push（958184b，origin 同步），本批独立开工
> 验证：`scripts/verify-task75-day1.js` **18/18 全绿**（A 静态 15 + B 转换端到端 3）
> 版本串：Day1 零前端 js/css 变更，不 bump；A3 前端导入页（Day2）落地时独立 bump
> **未 commit 未 push**：改动在工作区待开核

---

## 一、任务书前提修正记录（先查证再断言，修正版已采纳前两条）

1. **「插件直写 JSON 文件」物理不可能**：WoW 沙盒无任意写文件 API。本批按修正版落地 SavedVariables 路线（/reload 落盘 Lua 表 → 仓库脚本转 JSON，REQ-121 工作流同源）。
2. **拾取记录不入公共字典**：落点 = 新表 `loot_drops`（公会私有流水），与 boss_loot/dungeon_loot（EJ 采集全站共享字典）严格分离。
3. **icon 口径修正（本批新勘）**：通知修正版仍写 `iconName = GetItemIcon(itemID)`（注释「或从 itemLink 解析」）——WoW API **只能拿到图标 fileID 数字**，字符串 icon_name 无任何插件 API 可采（WoWButlerExporter REQ-092 采的同样是数字 iconID）。故字段定 `iconID`（数字），下游接既有 `assets/icons/items/{iconID}.png` 本地管道（REQ-092/150），字符串 icon_name 回补不在插件能力面。
4. **sql 编号撞车修正**：通知原案的 sql/39 已被占用（39_decor_source_36items），本批用 **sql/42**。
5. **目录约定修正**：`plugins/` → `addon/WoWButlerCollector/`（与 Exporter 同级）。
6. **toc 加载序修正**：通知 toc 把 core.lua 列在 locales 之前——locales 必须先加载（core 引用 WBC_LOCALE），已调整。

## 二、实际改动点

| 文件 | 内容 |
|---|---|
| addon/WoWButlerCollector/WoWButlerCollector.toc | Interface 120105、SavedVariables 声明、locales→core 加载序 |
| addon/WoWButlerCollector/core.lua | 事件监听（CHAT_MSG_LOOT / ENCOUNTER_END / PLAYER_LOGIN）+ 过滤 + 记录 + /wbc 命令 |
| addon/WoWButlerCollector/locales/zhCN.lua | 中文文案包 |
| scripts/export-collector-to-json.js | SavedVariables Lua → JSON 转换器（零依赖） |
| sql/42_task075_loot_drops.sql | loot_drops 建表（待运营执行） |
| server.js | 代理白名单 loot_drops 两处（行归属联查 + 业务表分支） |
| .gitignore | /export/（转换产物不入库） |
| docs/问题与需求清单.md | REQ-163 登记 |
| AGENTS.md | 插件真机验收工作流节补记 |
| scripts/verify-task75-day1.js | 验证脚本 |

### core.lua 设计要点（超出通知伪代码的实证加固，均已注释钉死）
- **locale-safe 聊天解析**：用客户端全局格式串 LOOT_ITEM_SELF/LOOT_ITEM（及 MULTIPLE 变体）转 Lua 模式，不硬编码中文句式；他人拾取仅团队场景记录（IsInRaid 隔离世界频道噪声），拾取者名剥服务器后缀
- **过滤**：品质 ≥4（史诗/传说）+ classID **数字**排除表（0 消耗品/5 材料/7 商业货品/12 任务，客户端语言无关——不比对本地化字符串，修正通知伪代码的中文串比对）
- **首领归属**：ENCOUNTER_END 击杀事件 180 秒归属窗（UnitName("target") 拾取瞬间不可靠，通知口径修正），窗口外回退已死亡目标名，均无则留空不编值
- **装等**：GetDetailedItemLevelInfo(itemLink) 优先（实际掉落装等），回退 GetItemInfo 基础装等
- **护栏**：2000 条容量上限（超丢最旧）+ 1000 条上线提醒 + 同物品同拾取者 2 秒防抖 + /wbc clear 二次确认

### 转换脚本
- Lua 解析器与 `scripts/validate-export.js` 同一实现口径（WoW 序列化子集：字符串转义/数字/布尔/嵌套表）
- INVTYPE_* → 中文部位映射（与 js/lootTaxonomy.js 词表口径对齐）
- 输出 `export/wowbutler_collector_<时间戳>.json`（含 timestampISO）+ 摘要（记录数/iconID 覆盖率/品质分布/副本分布/缺损告警）

### sql/42
- 字段族含 `official_item_id BIGINT`（与 sql/37 口径同型）、`icon_id INTEGER`（数字口径）、`slot/slot_cn` 双轨
- **幂等闸**：`uq_loot_drops_event(guild_id, player_name, official_item_id, timestamp) NULLS NOT DISTINCT`——同公会同人同物品同秒=同一拾取事件，重复导入不翻倍
- RLS：公会成员可读（is_guild_member）；写走 server.js 代理（service_role，公会级鉴权在代理层）
- 回滚说明在文件头（DROP TABLE 即可）

## 三、验证（18/18）

- **A 静态 15/15**：toc/文件结构/六组机制锚点、转换脚本锚点、.gitignore、sql/42 锚点、白名单双落点、node --check 全量、台账+AGENTS 登记。
- **B 端到端 3/3**：合成 WoW 序列化样本（2 条记录，含缺 iconID/bossName 容差例）→ 转换跑通 → JSON 字段族逐一断言（itemID/iconID/slotCN 胸部·武器/timestampISO/playerName）→ 覆盖统计打印 → 产物清理。

## 四、验证缺口申报（不掩饰）

1. **插件 Lua 未做语法/行为实测**：本机无 Lua VM（项目历史 proof 用 fengari，但 fengari 不在 node_modules，新增依赖需评审）无游戏客户端。真机验证走 REQ-121 运营真机流程：diff 插件目录 → 装游戏 → 打本 → /reload → 跑转换脚本 → 核对 JSON。建议运营真机步骤卡：/wbc 无报错、获得史诗装备后 /wbc count +1、材料/金币不计数、/reload 后 SavedVariables 有行、转换 JSON 字段齐。
2. **sql/42 待运营执行**（本机无执行通道）；执行后 Day2 导入页联调。
3. **A3 前端导入页 = Day2 范围**，本批未动工；版本串届时随前端变更独立 bump。
4. **子任务 B（icon_name 回补）**按既有终案（REQ-155/157/092）零 schema 零渲染层改动；待运营供图入 `scripts/import-item-icons.js` 管道——供图动作在运营侧。
