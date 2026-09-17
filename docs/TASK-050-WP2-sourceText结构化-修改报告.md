# 任务书 #50 WP2 修改报告：sourceText 来源结构化 + sql/31 草案（REQ-137 一期）

> 日期：2026-09-17（首轮送审）｜ **2026-09-17 二轮：顾问对六类偏差定夺已全部落地，全量重跑三产物，硬门不走样（见第五节定夺落地记录与第七节新指纹）**
> 范围：`scripts/decor/parse_source.py`、`sql/31_task050_decor_sources.sql`（草案）、`scripts/decor/out/` 三件产物（decor_sources.json / decor_sources.sql / parse_source_report.txt）
> 纪律：首轮送审件已随运营 commit 入库；本轮定夺落地修订**未 commit 未 push**；sql/31 草案与 UPDATE 产物**均未执行**（schema 变更纪律：顾问确认后方可执行，运营侧 SSH 动作）。
> 台账说明：REQ-137 在 docs/问题与需求清单.md 的登记运营已定稿，本 WP 不动台账，仅此注明。
> 工具申报：sqlglot 30.18.0 仅作 SQL 语法验证工具一次性 pip 安装使用（同 #49 先例），非交付依赖；parse_source.py 零第三方依赖。

---

## 一、文法采信声明

任务书 #50 WP2 文法规格（顾问全量语料实测归纳 2062/2062）**直接采信，未自行另立文法**。实现上以「色标键令牌流」落实规格：每个类型首键（`|cFFFFD200{键}{可选冒号}|r`）开启一个新来源元素，字段键（地区/价格/阵营/分类/名望）归属当前元素。该模型天然覆盖规格的条目分隔兼容要求（`|n|n`/真实 `\r\n`/`\n`/`|n` 混合）与实测同段多首键形态（成就+商人同段如 25307、事件+宝藏同段如 674）、跨行组合价（价格值含 `|n` 折行如 17523）、真实换行混入（4 件）——均为规格框架内的实测形态，非新文法。

**与规格的出入共 6 类，首轮全部逐条在案送审；顾问已于 2026-09-17 逐条定夺（见第五节），本版脚本与产物按定夺落地**——影响 schema 的 3 类（名望定位、物品价、裸贴图价）最终表达以第五节定夺为准，改动集中于 parse_source.py 三处代码点，重跑脚本即再生全部产物，零手工编辑。

## 二、实现要点

- **`scripts/decor/parse_source.py`**：标准库零依赖。输入 decor_catalog.json 留档件；令牌化 `\|cFFFFD200([^|]*)\|r`（值=到下一键或文本结尾，天然兼容多行值与混合分隔符）；10 类首键映射 type 枚举 vendor/quest/achievement/drop/profession/treasure/renown/event/shop/festival_note；价格按出现顺序扫描三态令牌（`N|Hcurrency:ID|h…` 货币 / `N|Hitem:ID|h…` 物品 / `N|T…贴图…|t` 金币·银币·裸贴图），金币→`{"gold":N}`、货币→`{"currency_id":N,"amount":M}`、组合价=多元素数组（含 17 个双货币值、91 个货币+金币值，全保序不丢件）。
- **护栏（脚本内置硬门，任一不过退出码 1）**：键计数逐一对齐任务书全清单；清单外新键即红；价格零残差；基准四件全字段相等断言；空 75 件 sources=[]；生成 SQL 自查（UPDATE=2062、BEGIN/COMMIT 各 1、record_id 覆盖全唯一）。
- **产出物**：`decor_sources.json`（record_id→sources 复核留档）、`decor_sources.sql`（单事务 BEGIN + 2062×UPDATE + COMMIT，475173 字节）、`parse_source_report.txt`（干跑报告落盘副本）。

## 三、覆盖率与护栏结果（干跑输出原文）

```
输入：scripts/decor/out/decor_catalog.json  总件数=2062（应 2062）  source_text 非空=1987（应 1987）  空=75（应 75）

--- 覆盖率 ---
非空逐条处理：1987/1987；归类=1986，无法归类=1
  [无法归类] record_id=25546 原文='|cFFFFD200地区：|r烈风海岸|n|cFFFFD200地区：|r创始者之角'

--- 键计数 vs 任务书全清单 ---
  OK 地区: 实测 2693 / 清单 2693      OK 商人出售: 2015/2015    OK 价格: 2003/2003
  OK 专业技能: 330/330   OK 任务: 326/326   OK 成就: 184/184   OK 分类: 184/184
  OK 阵营: 153/153（152 带冒号 + 1 无冒号 record 8192）   OK 掉落: 79/79
  OK 商城: 65/65   OK 商人: 30/30   OK 宝藏: 14/14   OK 名望: 6/6
  OK 只能在美酒节期间获得: 4/4   OK 可在美酒节开始前购买: 2/2   OK 游戏商城: 2/2   OK 事件: 1/1
  清单外新键：0

--- 类型分布（元素级，允许件级多类型） ---
  OK vendor 2045/2045   OK profession 330/330   OK quest 326/326   OK achievement 184/184
  OK drop 79/79   OK shop 67/67   OK treasure 14/14   OK event 1/1   OK festival_note 6/6
  OK renown 0/0（type 枚举保留；名望 6 次按定夺①落 reputation 字段）
  元素总数=3052

--- 解析异常 ---
  record_id=25546: 悬空地区键: 烈风海岸/创始者之角
  record_id=8176: 地区键前置挂入随后元素

--- 空 source_text 75 件 entry_type 分布 ---
  entry_type=1: 36 件    entry_type=2: 39 件（预期大头 39 件房间/户型 ✓，
  另 36 件 entry_type=1 无来源装饰——插件侧本就无 sourceText，sources=[] 合理落法）

--- 实测偏差处置清单（六类顾问定夺已落地，逐条在案） ---
  ① 名望落 vendor 条目内 reputation 字段（type 枚举 renown 保留未实例化），
    6 件：[21598, 22143, 22181, 22182, 22183, 22388]
  ② |Hitem:ID|h 物品价（{"item_id":N,"amount":M}），
    30 件：[1277, 1326, 2241, 2322, 2323, 2326, 2327, 2337, 2338, 2339, 2341, 2343,
           2430, 2433, 2435, 2437, 2466, 2467, 2470, 3900, 3902, 3903, 3905, 3906,
           3907, 10888, 25666, 25672, 25673, 25674]
  ③ 无超链接裸贴图价（{"texture":文件名主干,"amount":N}，实测全为腐化贴图 amount=100），
    20 件：[1430, 1907, 1909, 8990, 9289, 9627, 10862, 10896, 11140, 11285, 12145,
           15286, 18796, 18880, 18960, 20332, 21873, 21886, 26492, 26494]
  ④ 金+银合并价同元素双键（{"gold":G,"silver":S} 不折合），1 件：[1482]
  ⑤ 地区键前置归随后 quest 元素、地区并入 zones：[8176]
  ⑥ 无法归类（原文无类型首键，sources=[] 在案不吞并，运营游戏内核查中）：[25546]

--- 价格形态普查（2003 个价格值，合计 1053+786+91+23+20+17+9+2+2=2003 ✓） ---
  1053 × 纯金币          786 × 纯货币          91 × 货币+金币组合
   23 × 纯物品价          20 × 纯裸贴图价        17 × 双货币组合
    9 × 物品+金币组合       2 × 双物品+金币组合    2 × 金+银（record 1482 两条目各一）

--- 生成 SQL 自查 ---
  UPDATE 语句数=2062（应 2062）  BEGIN=1  COMMIT=1
  record_id 覆盖=2062 唯一=2062  与输入全集一致=True
  sources 非空=1986（=1987−无法归类1）  空=76（=75 空+1 无法归类）

硬门总判：全部通过（实测偏差 6 类顾问定夺已落地，逐条在案见上节）
```

**覆盖率结论：1987/1987 逐条处理；1986 归类 + 1 件无法归类在案（25546，原文无类型首键，sources=[] 未吞并）。**

## 四、基准四件全字段对照（人工核对一致）

**28350 暴雪嘉年华门垫**（商城+商人出售·世界商人·500 金）✓
```json
[{"type":"shop","tag":"商城"},
 {"type":"vendor","vendor":"世界商人","zones":[],"price":[{"gold":500}],"reputation":null}]
```

**27973 月溪镇旧式夜景窗**（双商人双地区不丢条目，各 20×currency:3363）✓
```json
[{"type":"vendor","vendor":"“丹恩”夜影","zones":["烈风海岸"],"price":[{"currency_id":3363,"amount":20}],"reputation":null},
 {"type":"vendor","vendor":"费奥蕊·月行者","zones":["创始者之角"],"price":[{"currency_id":3363,"amount":20}],"reputation":null}]
```

**27043 “受枷者的狂怒”壁画**（掉落 乌拉特克/烈毒之渊）✓
```json
[{"type":"drop","drop":"乌拉特克","zones":["烈毒之渊"]}]
```

**675 塞纳里奥私密屏风**（组合价「2000 currency:1220 + 1000 金」×2 商人不丢件，阵营随行）✓
```json
[{"type":"vendor","vendor":"赛尔弗丽雅·珀林","zones":["瓦尔莎拉"],
  "price":[{"currency_id":1220,"amount":2000},{"gold":1000}],"reputation":"织梦者 - 崇拜"},
 {"type":"vendor","vendor":"西尔维娅·鹿角","zones":["瓦尔莎拉"],
  "price":[{"currency_id":1220,"amount":2000},{"gold":1000}],"reputation":"织梦者 - 崇拜"}]
```

脚本断言四件全字段相等全部 OK。

## 五、六类偏差：顾问定夺落地记录（2026-09-17 二轮）

首轮送审六类偏差，顾问已逐条定夺并全部落地，重跑全量 2062 件。定夺原文 → 代码落点 → 落地效果：

1. **名望 6 件 → vendor 条目内字段，字段名 = reputation（对齐任务书 schema 示例，勿用 renown）；type 枚举 renown 保留不动**。
   落点：`parse_source_text()` 名望分支 `cur["reputation"] = val`；`normalize()` 移除 renown 键逻辑；`SPEC_TYPE_COUNTS["renown"]=0` 注释与类型分布备注同步。落地效果（22388）：
   `{"type":"vendor","vendor":"莱阿娜","zones":["银月城"],"price":[{"currency_id":3405,"amount":8}],"reputation":"仪式场地等级3"}`。全产物已无 renown 键残留（断言复核）。
2. **物品价 → `{"item_id":<id>,"amount":<n>}`**：首轮实现即此形，定夺确认，代码无改动（30 件清单不变）。
3. **裸贴图价 → `{"texture":<贴图文件名主干>,"amount":<n>}`，主干 = 去路径、去尾部 `:0`（并去 `.blp` 扩展名）**。
   落点：`parse_price()` 贴图分支新增 `stem = re.sub(r"\.blp$", "", name, flags=re.I)`。落地效果（1430）：`{"texture":"Ability_TitanKeeper_CorruptionDot","amount":100}`；全产物已无 `.blp` 残留（断言复核）。
4. **金银合并件（1482「2金50银」）→ 同元素双键 `{"gold":2,"silver":50}` 不折合**：首轮实现即此形，定夺确认，代码无改动。
5. **8176 地区键前置 → 归 quest、地区并入 zones**：首轮实现即此形，定夺确认，代码无改动（`{"type":"quest","quest":"密报：突击索克雷萨高地","zones":["影月谷"]}`）。
6. **25546 佩佩 → sources=[] 在案不吞并（运营游戏内核查中）**：维持无法归类清单逐条贴出，无改动。

另有一处报告生成层修订：价格形态普查打印由 frozenset repr 改为排序键元组——frozenset 字符串序受 PYTHONHASHSEED 影响导致 `parse_source_report.txt` 跨进程不一致（decor_sources.sql/json 本就字节一致），修复后三产物连跑两次 sha256 全同（见第七节）。

**首轮暂行表达与定夺的唯一实质差异**：①字段名 renown→reputation、③texture 去 `.blp` 扩展名；②④⑤⑥首轮实现即与定夺一致。

## 六、sql/31 草案全文（只送审不执行）

**本轮变化说明：sql/31 全文零变化**（`git status` 无修改）——六条定夺均落在派生列 jsonb 载荷的表达层，列定义 `sources jsonb`、回滚注释、NOTIFY、执行方式均不受影响，无 diff 可贴。

**事务形式决定及理由**：schema 迁移（sql/31）与数据落库（生成产物 decor_sources.sql）**分两件紧随执行**——沿袭 #49 先例（sql/30 迁移 + out/decor_seed.sql 产物），sql/ 目录保持人读可审的表结构单一事实源，475KB 生成批量件不混入 schema 文件；数据件自带单事务 BEGIN/COMMIT，派生列整体覆盖写，幂等可重跑零漂移。执行顺序：sql/31 → decor_sources.sql → REST 复核。

```sql
-- ============================================================
-- 增量迁移 31：decor_catalog 新增 sources jsonb 派生列（任务书 #50 WP2，REQ-137）
-- 日期：2026-09-17
-- 内容：
--   decor_catalog 新增 sources jsonb 可空列——source_text 来源结构化结果
--   （数组，元素 type ∈ vendor/quest/achievement/drop/profession/treasure/
--   renown/event/shop/festival_note，schema 见任务书 #50 WP2 与
--   scripts/decor/parse_source.py 头注释）；派生列，source_text 原文列与
--   既有 19 列零触碰。
-- 执行方式：SSH + docker exec psql（supabase_admin 角色），幂等可重复执行
-- 执行前：备份 decor_catalog（同迁移纪律）；纯加列零触碰既有数据
-- 执行后：文件末尾 NOTIFY pgrst 重载 schema 缓存；
--   紧随执行数据落库产物 scripts/decor/out/decor_sources.sql
--   （parse_source.py 生成，单事务 BEGIN + 2062×UPDATE + COMMIT，
--   派生列整体覆盖写，幂等可重跑零漂移）——数据与迁移分两件的理由：
--   沿袭 #49 先例（sql/30 迁移 + out/decor_seed.sql 产物），sql/ 目录保持
--   人读可审的结构单一事实源，475KB 生成批量件不混入 schema 文件。
-- 回滚说明：
--   回滚：ALTER TABLE decor_catalog DROP COLUMN sources;
--   NOTIFY pgrst, 'reload schema';
-- ============================================================

ALTER TABLE decor_catalog ADD COLUMN IF NOT EXISTS sources jsonb;

-- 重载 PostgREST schema 缓存
NOTIFY pgrst, 'reload schema';
```

## 七、验证输出（原样附）

- **全量干跑**：`tools/python/python.exe scripts/decor/parse_source.py`，退出码 0，输出原文见第三节（全文同 `scripts/decor/out/parse_source_report.txt`）。
- **定夺落地抽查**（decor_sources.json 直读断言）：22388 reputation="仪式场地等级3" 且无 renown 键；1430 texture="Ability_TitanKeeper_CorruptionDot"（无 .blp）；1482 双条目各 `{"gold":2,"silver":50}`；8176 quest zones=["影月谷"]；全产物断言无 renown 键、无 .blp 残留。
- **SQL 语法级自查**（sqlglot 30.18.0 postgres 方言逐语句解析 + 载荷 JSON 校验）：

```
decor_sources.sql 语句数 = 2064 解析通过 = 2064（BEGIN + 2062×UPDATE + COMMIT）失败 = 0
jsonb 载荷 JSON 合法行数 = 2062
总判: PASS
```

- **重跑字节一致性自证（连跑两次 sha256 全同，stdout 亦逐字节一致）**：

```
dd3f7d3a8abfb5c33c30190d73effb4534d4df14cf228c471afc3da354b3e25e  decor_sources.sql（475173 字节，2064 行）
94a3d29a545fb5537f91ed0009ffdcfb71567e1c802de569b6ce6d2c5b356a85  decor_sources.json（658933 字节）
a573a27e57ebcf5a70c49dca49333f4d24001fba171fc08efd7dd29001debf7b  parse_source_report.txt（6698 字节）
```

- **loot 双表零触碰**：本轮全部动作仅改 parse_source.py、重跑 out/ 产物、修订本报告，不连数据库；boss_loot/dungeon_loot 无任何代码路径触及（执行后复核口径沿用任务书：boss_loot=269 / dungeon_loot=426）。
- **git 改动范围自查**：` M scripts/decor/parse_source.py`（定夺落地修订）+ 本报告修订；sql/31 零变化；产物目录 scripts/decor/out/ gitignore 不入库（#49 在案）；零 js/css/html 改动，不 commit 不 push。
- **未跑项申报**（均属顾问终审后运营/顾问动作）：sql/31 与 decor_sources.sql 执行（备份→SSH docker exec→NOTIFY）、REST 复核（sources 非空=1986 / 空 76 / 抽 10 件 jsonb 可读 / 幂等重跑计数不变 / loot 双表行数比对）。本机无 PostgreSQL，未真库预演——sqlglot 全真解析 + 载荷 JSON 校验代替，最终生死以运营侧执行为准。

## 八、送审件清单

| 件 | 路径 |
|---|---|
| 解析脚本 | scripts/decor/parse_source.py（零依赖，头注释含用法与文法说明；本轮=定夺落地版） |
| 迁移草案 | sql/31_task050_decor_sources.sql（ADD COLUMN + 回滚注释 + NOTIFY，未执行；本轮零变化） |
| 数据落库产物 | scripts/decor/out/decor_sources.sql（475173 字节，单事务 2062 UPDATE，产物目录 gitignore） |
| 结构化留档 | scripts/decor/out/decor_sources.json（2062 件 record_id→sources，复核用） |
| 干跑报告 | scripts/decor/out/parse_source_report.txt（与本报告第三节一致） |
| 修改报告 | docs/TASK-050-WP2-sourceText结构化-修改报告.md（本件） |

## 九、commit 物料建议（运营执行；首轮 WP2 送审件运营已 commit，本轮为定夺落地补丁）

标题：

```
任务书#50-WP2-补丁：sourceText 六类偏差顾问定夺落地（REQ-137）
```

描述（三段式）：

```
【改了什么】scripts/decor/parse_source.py 按顾问六条定夺落地修订（①名望 6 件落
vendor 条目内 reputation 字段勿用 renown、type 枚举 renown 保留；③裸贴图价
texture 改存文件名主干去路径/去":0"/去 .blp；②物品价 {"item_id","amount"}
④金银同元素双键不折合 ⑤8176 归 quest 并入 zones ⑥25546 sources=[] 在案，
首轮实现即与定夺一致，无改动）；价格普查打印去 frozenset 哈希序依赖（报告
跨进程确定性）；sql/31 草案零变化；重跑全量 2062 件再生 decor_sources.sql/
decor_sources.json/parse_source_report.txt 三产物。
【范围】scripts/decor/parse_source.py + 本报告 + scripts/decor/out/ 三件产物；
sql/31 零变化，零 js/css/html 改动，loot 双表零触碰，未 commit 未 push，
迁移未执行（schema 变更纪律：顾问确认后运营 SSH 执行）。
【验证】全量 2062 件干跑退出码 0，硬门不走样：非空 1987/1987 逐条处理
（归类 1986+在案 1），键计数 17 项与类型分布 10 项仍逐项对齐任务书清单，
基准四件全字段断言 OK（675 组合价 2000×currency:1220+1000金 不丢件、
阵营字段 reputation），75 空件 entryType 分布不变；定夺抽查 22388/1430/
1482/8176 落地正确且全产物无 renown 键与 .blp 残留；sqlglot 解析
decor_sources.sql 2064 句零失败，jsonb 载荷 2062 行全合法；连跑两次
三产物 sha256 全同（decor_sources.sql=dd3f7d3a…）。REST 复核与迁移执行
属终审后运营动作。
```
