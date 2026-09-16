# 任务书 #49 WP2 修改报告：decor_catalog 目录表 + 转换脚本 + 种子（REQ-137）

> 日期：2026-09-17 ｜ 范围：`sql/30_task049_decor_catalog.sql`（新增）、`scripts/decor/convert_decor.py`（新增）、`tasks/任务书49-WP2-…`（存档）、`docs/问题与需求清单.md` REQ-137 行、`.gitignore` 两行
> 纪律：完工送审，**未 commit 未 push**；迁移 SQL 未执行（运营侧 SSH 动作，顾问终审后另行通知）。
> 环境申报：本机无可用 Python（WindowsApps 商店占位 stub），经 winget 用户级安装 Python 3.12.10（`%LOCALAPPDATA%\Programs\Python\Python312`，可卸载不动系统目录）+ pip 安装 lupa 2.8（转换钦定依赖）；sqlglot 仅作 SQL 语法验证工具一次性使用，非交付依赖。

---

## 一、侦察小结（任务书「先侦察再定案」三点）

**① sql/ 编号与命名**：现存 01~29（缺 18），最大编号 29；同号批次后缀并存（24/25/26/27/28/29 各两枚，格式 `NN_<tag>_<slug>.sql`，tag ∈ req/bug/task/s2 批次）。→ **本迁移取 30**：`sql/30_task049_decor_catalog.sql`。文件风格沿袭：头部 banner（增量号/日期/内容/执行方式/执行前备份/回滚说明）、幂等可重复执行（`IF NOT EXISTS` / `DROP POLICY IF EXISTS`）、文末 `NOTIFY pgrst, 'reload schema';`、文件头回滚注释 `DROP TABLE decor_catalog;`（任务书硬性要求）。

**② 掉落库表字段风格**：boss_loot/dungeon_loot 均 UUID 主键（`gen_random_uuid()`）+ FK 引用字典 + `created_at/updated_at`；简单词表数组用 **text[]**（primary_stats/secondary_stats），结构化/动态键数据用 **jsonb**（primary_values/primary_tiers，sql/19、20）。→ 本表 `category_ids/subcategory_ids`（jsonb 数组）与 `tags`（jsonb 对象，tagID 动态键只能用 jsonb）与数值档先例一致。**主键风格差异说明**：任务书定案 `record_id integer PRIMARY KEY`（游戏内目录天然主键、采集侧已实证全唯一 1~28350、种子 ON CONFLICT 匹配键），与字典表 UUID 风格不同——属任务书明确设计且本表无 FK 依赖、纯公开目录，**沿袭任务书未改**。**RLS 现状做法**：`ENABLE ROW LEVEL SECURITY` + 三策略——`master_read`（authenticated SELECT true）、`master_read_anon`（anon SELECT true，sql/16 公示页读取路径）、`master_write`（authenticated 且 `app_metadata.role='superadmin'`）。→ decor_catalog 同为公开目录数据，**三策略全建**，与 boss_loot/dungeon_loot 完全同风格。

**③ scripts/ 现状**：顶层一排 JS 工具（verify-*/diagnose-*/validate-export.js 等）；Python 转换管道先例 = `scripts/wjdc_convert.py` + `scripts/wjdc/`（README + mock 三件套 + out* 产物目录，out* 已入 .gitignore 不入库）。→ 本 WP 按任务书钦定路径建 `scripts/decor/convert_decor.py`；产物目录 `scripts/decor/out/` 沿用 wjdc 惯例**产物不入库**（.gitignore 补一行），生成物（decor_catalog.json 2.0MB / decor_seed.sql 963KB）随送审交付文件本身，运营/顾问可直接复核，需要时一条命令可再生。

**与任务书设计的偏差**：零。表名 `decor_catalog`、列设计、映射规则全部按定案原文落实。

## 二、实测对数差异申报（红线：先报告不擅改）

任务书 WP2 前置状态称「entryType=2 户型条目 **2 件**（recordID 291/113）」，**真机数据实为 39 件**（recordID 291/113 确在其中，且这两件为英文内部占位名 `Full_Layout_Rugged_Prn`/`Full_Layout_Prefab_S`，其余 37 件为中文房间名——方形/八边形/L形/T形/十字形房间、楼梯间、暴风城/奥格瑞玛/银月城/贝拉梅斯各功能室等）。39 件共性：无 itemID、无 sourceText、无 tags、无 categoryIDs（转换层空值容忍，entry_type=2 正常落库）。

**影响判定**：仅为件数描述出入，不触碰任何设计——entry_type smallint 容 2、可空列全容忍、count=2062 验收口径不变、name NOT NULL 仍全员满足（占位名非空）。未改设计，特此申报，请运营订正口径。

其余对数全部吻合：items=2062=totalCount、failCount=0；icon 缺 41（2021/2062）、sourceText 非空 1987/2062、quality/size 全非空——与 WP1 顾问判读逐字吻合。

## 三、实现要点

- **`scripts/decor/convert_decor.py`**：lupa `LuaRuntime` 执行整个 SavedVariables chunk 取 `WoWButlerDecorDB` 全局表（零正则零文本猜测；实施坑：lupa 表自带 dict 风格 `items()` 方法，`db.items` 属性访问撞名返回方法对象，一律 `[]` 索引取值）；Lua 双精度浮点整数值归一 int；表递归转原生结构（1..n 连续键→list，其余→dict 键转字符串）；`dataTagsByID`→tags jsonb 对象（空表归一 `{}` 非 `[]`）；`sourceText` 原样透传不清洗（`|cFFFFD200…|r|n|T…|t` 色码/换行/贴图代码全保留）；runMeta.client/run_id 每行随行落。内置护栏：items 缺失/recordID 重复/name 为空（NOT NULL 列）即报错退出非零。
- **`sql/30_task049_decor_catalog.sql`**：列设计按任务书原文逐字；RLS 三策略同 boss_loot/dungeon_loot；幂等可重复执行；文件头回滚注释 `DROP TABLE decor_catalog;`；文末 `NOTIFY pgrst, 'reload schema';`。
- **种子 `decor_seed.sql`（产物）**：`BEGIN;` + 5 条 INSERT（500 行/批，远低于 PG 65535 参数上限）+ `COMMIT;` 单事务；每条 `ON CONFLICT (record_id) DO UPDATE SET` 19 列（不含主键 record_id、不含 collected_at——重跑保留首次入库时间）；字符串 `''` 双写转义、jsonb 列 `'…'::jsonb` 显式标注、中文 UTF-8 直写。
- **明确不做**（任务书 §5）：图标文件提取/sourceText 结构化解析/前端页面，零触碰。

## 四、验证输出（原样附）

转换运行摘要（输入 = 运营传真机件 `WoWButlerDecor.lua`，run 20260917-010800）：

```
runMeta：addon=0.2.0 client=12.1.0 run_id=20260917-010800 dataset=full
items=2062 totalCount=2062 failCount=0 （吻合）
entryType 分布：{1: 2023, 2: 39}
字段非空率：item_id=2023/2062；icon_file_id=2021/2062；source_text=1987/2062；
  tags=2023/2062；category_ids=2010/2062；subcategory_ids=2010/2062；
  quality=2062/2062；size=2062/2062；placement_cost=2062/2062
抽查 recordID=28350：暴雪嘉年华门垫（entryType=1 itemID=281107）
  tags={"66": "小号", "169": "蓝色", "110": "至暗之夜"}
  source_text=|cFFFFD200商城|r|n|n|cFFFFD200商人出售：|r世界商人|n…（含「商城」「世界商人」✓）
抽查 recordID=27973：月溪镇旧式夜景窗 —— 双商人双地区 ✓
  （“丹恩”夜影/烈风海岸 + 费奥蕊·月行者/创始者之角，full source_text 复核）
抽查 recordID=27043：“受枷者的狂怒”壁画 —— 掉落来源 ✓（掉落：乌拉特克/烈毒之渊）
```

种子结构校验（文件侧，全部通过）：

```
行字面量数 = 2062（应 2062）
INSERT 语句数 = 5（应 5 = ceil(2062/500)）　ON CONFLICT 子句数 = 5
BEGIN = 1  COMMIT = 1　首行顶层逗号 = 19（20 列应 = 19）
UPDATE SET 列数 = 19 不含 record_id: True 不含 collected_at: True
json 件数 = 2062  record_id 唯一 = 2062　乱码替换符记录数 = 0　无 NUL 字节
```

SQL 语法校验（sqlglot postgres 方言逐语句解析）：

```
sql/30_task049_decor_catalog.sql 解析通过语句数 = 8（RLS 策略语句以 Command 模式通过；
  NOTIFY 为 sqlglot 不支持的有效 PG 语句——sql/16/21 同款先例，已在生产执行过，工具限制非错误）
scripts/decor/out/decor_seed.sql 解析通过语句数 = 7（BEGIN + 5×INSERT + COMMIT） 失败 = 0
```

git 改动范围自查：

```
 M .gitignore（+scripts/decor/out/、+/WoWButlerDecor.lua）
 M docs/问题与需求清单.md（仅 REQ-137 行状态格）
?? sql/30_task049_decor_catalog.sql
?? scripts/decor/convert_decor.py
?? tasks/任务书49-WP2-转换脚本与decor目录表.md
?? docs/TASK-049-WP2-decor目录表与转换脚本-修改报告.md
```

未跑项申报（均属任务书划给运营/顾问的动作）：迁移执行（备份→SSH docker exec→单事务→reload schema）、REST 复核（count=2062 / 三件抽查 / tags 可读 / **幂等重跑** / 零触碰清单行数前后比对）、`python --check` 类校验不适用（转换已真跑成功即语法实证）。本机无 PostgreSQL，种子未能本地真库预演——结构校验 + sqlglot 全真解析代替，最终生死以运营侧执行为准。

## 五、送审件清单

| 件 | 路径 |
|---|---|
| 迁移 SQL | sql/30_task049_decor_catalog.sql |
| 转换脚本 | scripts/decor/convert_decor.py（头注释含用法与 `pip install lupa` 依赖） |
| 种子产物 | scripts/decor/out/decor_seed.sql（963336 字节，产物目录 gitignore 不入库） |
| JSON 留档 | scripts/decor/out/decor_catalog.json（2062 件，调试/留档） |
| 任务书存档 | tasks/任务书49-WP2-转换脚本与decor目录表.md |
| 台账 | docs/问题与需求清单.md REQ-137 行（已按任务书口径更新，其余条目零触碰） |
| 修改报告 | docs/TASK-049-WP2-decor目录表与转换脚本-修改报告.md（本件） |

运营执行顺序（顾问终审通过后）：`sql/30_task049_decor_catalog.sql` → `decor_seed.sql` →（种子已含于单事务，迁移文末已 NOTIFY）REST 复核按任务书 §WP2 验收逐项；幂等验证 = 种子重跑一次 count 不变无报错。

## 六、commit 物料建议（运营执行，顾问终审通过后）

标题：

```
任务书#49-WP2：decor_catalog 目录表 + 转换脚本 + 种子入库（REQ-137）
```

描述（三段式）：

```
【改了什么】新增 sql/30_task049_decor_catalog.sql（decor_catalog 表：record_id 整型
主键=游戏内目录天然主键，21 列含 jsonb category_ids/subcategory_ids/tags，RLS 三策略
同 boss_loot/dungeon_loot 公开表风格，含回滚注释+NOTIFY reload schema）；新增
scripts/decor/convert_decor.py（lupa 全真解析 WoWButlerDecor SavedVariables →
decor_catalog.json 留档 + decor_seed.sql 单事务种子，ON CONFLICT (record_id)
DO UPDATE 幂等，source_text 原样不解析）；任务书 #49 WP2 存档 tasks/；台账 REQ-137
口径更新（探针切片判定通过 + v0.2 全量采集判绿 2062 件）；.gitignore 补产物目录与
根目录 SavedVariables 输入件。
【范围】sql/30 + scripts/decor/ + tasks/ + 台账 REQ-137 行 + .gitignore；
零 js/css/html 改动，零既有表触碰，迁移未执行（运营侧 SSH 动作）。
【验证】真机 SavedVariables（run 20260917-010800）实跑转换：items=2062=totalCount、
failCount=0、recordID 全唯一、三件抽查（28350 商城/世界商人、27973 双商人双地区、
27043 掉落来源）与 tags jsonb 全对、非空率与 WP1 顾问判读逐字吻合；种子结构校验
9 项全过；sqlglot postgres 方言逐语句解析迁移+种子零失败（NOTIFY 为工具不支持项、
有效 PG 语句有 sql/16/21 先例）。实测对数差异已申报：entryType=2 户型实为 39 件
（任务书称 2 件），不触碰设计。REST 复核与幂等重跑属运营执行后顾问终审。
```
