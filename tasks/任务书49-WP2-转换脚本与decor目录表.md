# 任务书 #49 WP2：转换脚本 + decor 目录表 + 种子入库

> 执行方：Kimi Code ｜ 开工前先读《开发规范》，本任务书外不顺手加功能。
> 密钥：涉及（service_role 只在服务端环境变量；迁移 SQL 由运营侧 SSH 执行，Code 不执行）。
> 前置状态（已实测确认，直接采信）：
> - WP1 已判绿（run 20260917-010800，顾问 lupa 复核）：WoWButlerDecor v0.2.0 真机采集
>   **items 2062 = totalCount，failCount=0**；白名单 16 键+recordID/entryType 齐；
>   recordID 全唯一（1~28350）；中文全净；与 v0.1.1 stats 逐字吻合；玩家态字段零混入。
> - 实测锚点（对数用）：entryType=2 户型条目 2 件（recordID 291/113，无 itemID/
>   sourceText，转换层容忍空值）；抽查基准三件 recordID 28350（暴雪嘉年华门垫）/
>   27973（月溪镇旧式夜景窗）/27043（"受枷者的狂怒"壁画）。
> - SavedVariables 真机文件由运营转发，作为转换输入。
> - 缺陷清单：①数据未转换成可入库格式；②无 decor 目录表。

## 先侦察再定案（动手改码前）

先出半页侦察小结（写进送审回报），确认三点：
①`sql/` 目录现有迁移编号最大值与文件命名风格；
②现有掉落库表（boss_loot/dungeon_loot）的字段风格（数组/JSON 字段用 jsonb 还是
数组类型、主键风格、RLS 怎么开的）；
③repo 内是否已有 scripts/ 类工具目录。
下述设计为**定案倾向**，与现状冲突的按现状风格调整并在送审回报中说明；
冲突大到需要改设计的，先报告运营定夺。

## 需求

1. **转换脚本 `scripts/decor/convert_decor.py`**（Python + lupa）
   - 输入：WoWButlerDecor SavedVariables 文件路径；用 lupa `LuaRuntime` 全真解析，
     禁止正则/文本猜测。
   - 输出两份：
     - `decor_catalog.json`：全量 2062 件字典数组（调试/留档用）；
     - `decor_seed.sql`：单事务种子文件，
       `INSERT ... ON CONFLICT (record_id) DO UPDATE`——匹配键 = record_id 主键，
       天然幂等，重跑不插重。
   - 字段映射：Lua 字段 → snake_case 列；`categoryIDs/subcategoryIDs` → jsonb 数组；
     `dataTagsByID` → jsonb 对象（键为 tagID 字符串，值为中文标签）；布尔/数值直映射；
     `sourceText` 原样存 `source_text`（**本批不做结构化解析**——raw 保留，
     图鉴页设计时再定解析规则，免重采）。
   - 脚本头注释写明用法与依赖（`pip install lupa`）。

2. **schema 迁移 `sql/<下一版本号>_decor_catalog.sql`**（含文件头回滚注释
   `DROP TABLE decor_catalog;`）
   - 表名倾向 `decor_catalog`（侦察后定），列设计倾向：
     ```sql
     record_id        integer PRIMARY KEY,
     entry_type       smallint NOT NULL DEFAULT 1,
     item_id          integer,
     name             text NOT NULL,
     icon_file_id     bigint,
     asset_id         bigint,
     model_scene_id   integer,
     quality          smallint,
     size             smallint,
     placement_cost   smallint,
     category_ids     jsonb,
     subcategory_ids  jsonb,
     source_text      text,
     tags             jsonb,
     indoors          boolean,
     outdoors         boolean,
     can_customize    boolean,
     first_acquisition_bonus smallint,
     client_version   text,      -- 采集客户端版本，如 12.1.0
     run_id           text,      -- 采集批次，如 20260917-010800
     collected_at     timestamptz DEFAULT now()
     ```
   - 本表为**公开目录数据**（无公会维度、无用户数据），RLS 策略按现有公开表
     （如 boss_loot 公示页读取路径）同风格处理，侦察小结里写明现状做法再沿袭。

3. **迁移 SQL 不由 Code 执行**。交付物 = 迁移文件 + 种子文件 + 脚本；
   执行（备份→SSH docker exec→单事务→`NOTIFY pgrst, 'reload schema';`→REST 复核）
   是运营侧动作，顾问终审通过后另行通知。

4. **随本 WP 一并提交**：
   - 任务书 #49 存档进 repo `tasks/` 目录；
   - `docs/问题与需求清单.md` REQ-137 行口径更新为「探针切片判定通过 +
     v0.2 全量采集判绿（2062 件），图鉴/方案单/社区三期未启动」，其余条目零触碰。

5. **明确不做**（防顺手加功能）：图标文件提取不做（icon_file_id 已存，后续专项）；
   sourceText 结构化解析不做；前端页面不做。

## WP2 验收

- 侦察小结在送审回报中，三点问题有明确答案；
- 迁移执行后 REST 复核（顾问终审直连复核，不凭送审口径）：
  - `select count(*)` = 2062；
  - 抽查 3 条逐字段对齐采集原件：record_id=28350（source_text 含「商城」「世界商人」）、
    27973（双商人双地区）、27043（掉落来源）；
  - tags jsonb 可读（如 28350 含「至暗之夜」「小号」「蓝色」）；
  - **幂等验证**：种子 SQL 重跑一次，count 不变、无报错；
  - 零触碰清单：boss_loot/dungeon_loot 等现有表行数前后不变。

## 红线

- schema 变更只走 `sql/` 带版本号增量 SQL，禁止直接改库；
- 不动任何密钥与 .env；不 commit 不 push（等顾问终审出物料）；
- commit 规范：「任务书#49-WP2：…」，描述按【改了什么】【范围】【验证】三段式；
- 发现与本文档冲突的现实，**先报告运营定夺，不擅自改设计**。
