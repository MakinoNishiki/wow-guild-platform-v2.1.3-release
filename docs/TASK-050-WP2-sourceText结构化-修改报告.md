# 任务书 #50 WP2 修改报告：sourceText 来源结构化 + sql/31 草案（REQ-137 一期）

> 日期：2026-09-17 ｜ 范围：`scripts/decor/parse_source.py`（新增）、`sql/31_task050_decor_sources.sql`（新增草案）、`scripts/decor/out/` 三件产物（decor_sources.json / decor_sources.sql / parse_source_report.txt）
> 纪律：完工送审，**未 commit 未 push**；sql/31 草案与 UPDATE 产物**均未执行**（schema 变更纪律：顾问确认后方可执行，运营侧 SSH 动作）。
> 台账说明：REQ-137 在 docs/问题与需求清单.md 的登记运营已定稿，本 WP 不动台账，仅此注明。
> 工具申报：sqlglot 30.18.0 仅作 SQL 语法验证工具一次性 pip 安装使用（同 #49 先例），非交付依赖；parse_source.py 零第三方依赖。

---

## 一、文法采信声明

任务书 #50 WP2 文法规格（顾问全量语料实测归纳 2062/2062）**直接采信，未自行另立文法**。实现上以「色标键令牌流」落实规格：每个类型首键（`|cFFFFD200{键}{可选冒号}|r`）开启一个新来源元素，字段键（地区/价格/阵营/分类/名望）归属当前元素。该模型天然覆盖规格的条目分隔兼容要求（`|n|n`/真实 `\r\n`/`\n`/`|n` 混合）与实测同段多首键形态（成就+商人同段如 25307、事件+宝藏同段如 674）、跨行组合价（价格值含 `|n` 折行如 17523）、真实换行混入（4 件）——均为规格框架内的实测形态，非新文法。

**与规格的出入共 6 类，全部逐条在案（见第四节），不吞并不擅改，请顾问定夺**——其中影响 schema 的 3 类（名望定位、物品价、裸贴图价）已按信息保真原则给出暂行表达并落进 UPDATE 产物，顾问改判后重跑脚本即可再生，零手工编辑。

## 二、实现要点

- **`scripts/decor/parse_source.py`**：标准库零依赖。输入 decor_catalog.json 留档件；令牌化 `\|cFFFFD200([^|]*)\|r`（值=到下一键或文本结尾，天然兼容多行值与混合分隔符）；10 类首键映射 type 枚举 vendor/quest/achievement/drop/profession/treasure/renown/event/shop/festival_note；价格按出现顺序扫描三态令牌（`N|Hcurrency:ID|h…` 货币 / `N|Hitem:ID|h…` 物品 / `N|T…贴图…|t` 金币·银币·裸贴图），金币→`{"gold":N}`、货币→`{"currency_id":N,"amount":M}`、组合价=多元素数组（含 17 个双货币值、91 个货币+金币值，全保序不丢件）。
- **护栏（脚本内置硬门，任一不过退出码 1）**：键计数逐一对齐任务书全清单；清单外新键即红；价格零残差；基准四件全字段相等断言；空 75 件 sources=[]；生成 SQL 自查（UPDATE=2062、BEGIN/COMMIT 各 1、record_id 覆盖全唯一）。
- **产出物**：`decor_sources.json`（record_id→sources 复核留档）、`decor_sources.sql`（单事务 BEGIN + 2062×UPDATE + COMMIT，475337 字节）、`parse_source_report.txt`（干跑报告落盘副本）。

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
  OK renown 0/0（名望 6 次实测为条目内字段，偏差①）
  元素总数=3052

--- 解析异常 ---
  record_id=25546: 悬空地区键: 烈风海岸/创始者之角
  record_id=8176: 地区键前置挂入随后元素

--- 空 source_text 75 件 entry_type 分布 ---
  entry_type=1: 36 件    entry_type=2: 39 件（预期大头 39 件房间/户型 ✓，
  另 36 件 entry_type=1 无来源装饰——插件侧本就无 sourceText，sources=[] 合理落法）

--- 价格形态普查（2003 个价格值，合计 1053+786+91+23+20+17+9+2+2=2003 ✓） ---
  1053 × 纯金币          786 × 纯货币          91 × 货币+金币组合
   23 × 纯物品价          20 × 纯裸贴图价        17 × 双货币组合
    9 × 物品+金币组合       2 × 双物品+金币组合    2 × 金+银（record 1482 两条目各一）

--- 生成 SQL 自查 ---
  UPDATE 语句数=2062（应 2062）  BEGIN=1  COMMIT=1
  record_id 覆盖=2062 唯一=2062  与输入全集一致=True
  sources 非空=1986（=1987−无法归类1）  空=76（=75 空+1 无法归类）

硬门总判：全部通过（实测偏差 6 类逐条在案，待顾问定夺）
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

## 五、实测偏差逐条清单（红线：逐条贴出，不擅自改设计，请顾问定夺）

1. **名望定位**：任务书列「名望」为首键（type renown），实测 6 次**全部出现在商人出售条目内部**（地区与价格之间），非首键。暂行处理：落为 vendor 元素 `renown` 字段（如 `{"renown":"仪式场地等级3"}`），type 枚举 renown 未实例化。涉及 6 件：`[21598, 22143, 22181, 22182, 22183, 22388]`（全为莱阿娜/银月城，名望等级3/7）。
2. **物品价（清单外价格形态）**：`N|Hitem:ID|h|贴图|t|h`（物品作货币，如 37829 好运符、137642 荣耀印记、166846 备用零件）。任务书仅列金币/`Hcurrency` 两形态。暂行表达 `{"item_id":N,"amount":M}`。涉及 30 件：`[1277, 1326, 2241, 2322, 2323, 2326, 2327, 2337, 2338, 2339, 2341, 2343, 2430, 2433, 2435, 2437, 2466, 2467, 2470, 3900, 3902, 3903, 3905, 3906, 3907, 10888, 25666, 25672, 25673, 25674]`。
3. **裸贴图价（清单外价格形态）**：`100|TInterface\ICONS\Ability_TitanKeeper_CorruptionDot.blp:0|t`——无超链接、无 id 可取，20 件全为同一腐化贴图且 amount 全=100。暂行表达 `{"texture":"Ability_TitanKeeper_CorruptionDot","amount":100}`。涉及 20 件：`[1430, 1907, 1909, 8990, 9289, 9627, 10862, 10896, 11140, 11285, 12145, 15286, 18796, 18880, 18960, 20332, 21873, 21886, 26492, 26494]`。
4. **金+银合并价**：任务书金币形态之外实测银币贴图 UI-SILVERICON，仅 1 件 `1482`（两个商人条目各「2 金 50 银」）。暂行表达合并单元素 `{"gold":2,"silver":50}`。
5. **地区键前置**：仅 `8176`，原文 `地区：影月谷` 先于 `任务：` 键出现，挂入随后的任务元素（zones=["影月谷"]），信息无损。
6. **无法归类**：仅 `25546 佩佩`，原文仅两个地区、无任何类型首键，sources=[] 在案（未吞并），请运营查游戏内该件来源后定夺（补数据或维持空数组）。

## 六、sql/31 草案全文（只送审不执行）

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
- **SQL 语法级自查**（sqlglot 30.18.0 postgres 方言逐语句解析 + 载荷 JSON 校验 + 确定性重跑）：

```
sql/31 非空语句数 = 2 (ALTER + NOTIFY 应 2；NOTIFY 为 sqlglot 不支持的有效 PG 语句，sql/16/21/30 先例)
decor_sources.sql 语句数 = 2064 解析通过 = 2064（BEGIN + 2062×UPDATE + COMMIT）失败 = 0
重跑字节一致（确定性/幂等生成）: True
jsonb 载荷 JSON 合法行数 = 2062
总判: PASS
```

- **loot 双表零触碰**：本 WP 全部动作仅读 decor_catalog.json 留档件、写 scripts/decor/out/ 与 sql/31 新文件，不连数据库；boss_loot/dungeon_loot 无任何代码路径触及（执行后复核口径沿用任务书：boss_loot=269 / dungeon_loot=426）。
- **git 改动范围自查**：`?? scripts/decor/parse_source.py`、`?? sql/31_task050_decor_sources.sql`、本报告新增；产物目录 scripts/decor/out/ gitignore 不入库（#49 在案）；零 js/css/html 改动，零既有文件改动，不 commit 不 push。
- **未跑项申报**（均属顾问终审后运营/顾问动作）：sql/31 与 decor_sources.sql 执行（备份→SSH docker exec→NOTIFY）、REST 复核（sources 非空=1986 / 空 76 / 抽 10 件 jsonb 可读 / 幂等重跑计数不变 / loot 双表行数比对）。本机无 PostgreSQL，未真库预演——sqlglot 全真解析 + 载荷 JSON 校验代替，最终生死以运营侧执行为准。

## 八、送审件清单

| 件 | 路径 |
|---|---|
| 解析脚本 | scripts/decor/parse_source.py（零依赖，头注释含用法与文法说明） |
| 迁移草案 | sql/31_task050_decor_sources.sql（ADD COLUMN + 回滚注释 + NOTIFY，未执行） |
| 数据落库产物 | scripts/decor/out/decor_sources.sql（475337 字节，单事务 2062 UPDATE，产物目录 gitignore） |
| 结构化留档 | scripts/decor/out/decor_sources.json（2062 件 record_id→sources，复核用） |
| 干跑报告 | scripts/decor/out/parse_source_report.txt（与本报告第三节一致） |
| 修改报告 | docs/TASK-050-WP2-sourceText结构化-修改报告.md（本件） |

## 九、commit 物料建议（运营执行，顾问终审通过后）

标题：

```
任务书#50-WP2：sourceText 来源结构化 + sql/31 草案（REQ-137）
```

描述（三段式）：

```
【改了什么】新增 scripts/decor/parse_source.py——decor_catalog.source_text 来源
结构化解析器（任务书 #50 WP2 文法规格直接采信，色标键令牌流模型：10 类首键→
type 枚举 vendor/quest/achievement/drop/profession/treasure/renown/event/shop/
festival_note，价格拆 金币{"gold"}/货币{"currency_id","amount"}/组合多元素数组，
内置护栏硬门：键计数对齐全清单、价格零残差、基准四件断言、SQL 自查）；新增
sql/31_task050_decor_sources.sql 草案（decor_catalog 加 sources jsonb 派生列，
含回滚注释+NOTIFY reload schema，未执行）；数据落库产物 decor_sources.sql
（单事务 2062 UPDATE 幂等覆盖写）随送审交付于 scripts/decor/out/（gitignore）。
【范围】scripts/decor/parse_source.py + sql/31 + scripts/decor/out/ 三件产物 +
本报告；零 js/css/html 改动，零既有文件/既有表列触碰，loot 双表零触碰，
未 commit 未 push，迁移未执行（schema 变更纪律：顾问确认后运营 SSH 执行）。
【验证】全量 2062 件干跑退出码 0：非空 1987/1987 逐条处理（归类 1986 +
无法归类 1 件 25546 在案），键计数 17 项与任务书全清单逐项吻合、清单外新键 0，
类型分布元素级 10 项全对齐，基准四件（28350/27973/27043/675 组合价）全字段
断言 OK，空 75 件 entry_type 分布 39 房间+36 无来源装饰，价格 2003 值九形态
普查合计吻合；sqlglot postgres 方言解析 sql/31 两句 + decor_sources.sql
2064 句零失败，jsonb 载荷 2062 行 JSON 全合法，重跑产物字节一致。实测偏差
6 类（名望定位 6 件/物品价 30 件/裸贴图价 20 件/金银合并 1 件/地区前置 1 件/
无法归类 1 件）逐条在案待顾问定夺。REST 复核与迁移执行属终审后运营动作。
```
