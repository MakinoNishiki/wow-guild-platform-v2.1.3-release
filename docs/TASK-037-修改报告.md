# 任务书 #37 修改报告：REQ-110 WP1 毒咒（Venomcurse）字段支持——数据模型+录入+卡片展示

> 日期：2026-08-11 ｜ 执行：Kimi Code ｜ 版本串：20260811.47 → **20260811.48**（index.html 10 处 + data.html 6 处，14+2 口径全量同步）
> 流程：§1 前置侦察四项先行送审，配色裁定绿（.dp-tag-venom，与特效绿 #1eff00 同族）后全案放行施工；两处侦察出入（版本串 16→14+2、「可兑换套装」为来源行文本非徽标）运营接受在案。
> 范围外（未做）：插件采集（插件 1.0.9 批次）、毒咒筛选项（任务书 #30 增补）。
> 红线自查：零依赖、未碰 server.js/RLS/密钥；schema 变更走 sql/26 版本号迁移（备份→docker exec→NOTIFY→回滚注释）；测试数据自清理复核为零；**未 commit 未 push**。

---

## 〇、§1 前置侦察审计单（已送审放行，要点留存）

1. **表结构与 RPC**：boss_loot 15 列 / dungeon_loot 16 列（sql/10+11+19+20 / sql/16+19+20 增量累计）；`get_public_loot_detail` 为**显式字段白名单**（jsonb_build_object，sql/24 R13 口径），加列必须 CREATE OR REPLACE；server.js 主数据分支为表级白名单零改动，masterData.js 读侧 select('*') 自动带新列。迁移下一编号 = sql/26。
2. **数据中心写入链**：boss_loot 编辑器 `mdEditLootItem`（js/app.js:12377）与 dungeon_loot 编辑器 `mdEditDungeonLootItem`（:12516）字段数组**复制维护两处**；`type:'select'` 纯下拉天然禁自由输入，mdEditorSave 空串统一转 NULL（:12053），与「无=NULL、毒咒='毒咒'」契合。
3. **卡片结构**：`itemCard()`（js/dataPublic.js:479-520）meta 行现仅 slot/item_type 两枚 `.dp-tag`，条件渲染逐字同构可插；徽标族 `.dp-tag`（css/data-public.css:246-268）几何已并轨 .tag（20px/600/圆角5）；全项目无紫色变量（唯一紫=#a335ee 史诗品质色）→ 裁定绿。风险点：meta 行 overflow:hidden 窄卡截断（已转正为验收断言）。
4. **插件/converter 映射点**（只定位不改）：插件实为 1.0.7（REQ-088/092 的 1.0.8 未实施）；converter 映射两段 = `norm_items()` scripts/wjdc_convert.py:251 + `build_load_rows()` :430 + `_CMP_FIELDS` :469 + 冻结声明 :17-23；app.js「智能导入」=REQ-023 成员导入与本管道无关。

## 一、修改文件清单

| 文件 | 位置 | 改动 |
|---|---|---|
| sql/26_req110_venomcurse.sql | 新建 | boss_loot/dungeon_loot 各 `ADD COLUMN IF NOT EXISTS venomcurse text`（可空默认 NULL）+ 列注释；RPC 照 sql/24 全文 CREATE OR REPLACE 两分支各加一行 `'venomcurse'` 透出；revoke/grant + NOTIFY pgrst；回滚注释（DROP COLUMN×2 + 重执行 sql/24 + NOTIFY）；存量零回填声明 |
| js/app.js | `mdRenderLoot` / `mdEditLootItem` | 字段数组加 `{ key:'venomcurse', label:'毒咒', type:'select', options:[无/毒咒] }`；payload 加 `venomcurse: out.venomcurse`；列表加「毒咒」列 |
| js/app.js | `mdRenderDungeonLoot` / `mdEditDungeonLootItem` | 同上（复制维护两处同步） |
| js/dataPublic.js | `itemCard()` meta 行 | 毒咒徽标条件渲染：`${l.venomcurse ? '<span class="dp-tag dp-tag-venom">' : ''}`（与 slot/item_type 逐字同构，仅非空渲染） |
| css/data-public.css | `.dp-tag` 族 | 新增 `.dp-tag-venom { background: rgba(30,255,0,.12); color: #1eff00; }`（绿色调与特效行同族，几何随 .dp-tag 并轨 .tag 族） |
| js/app.js | changelogData 顶部 | 补录「新增功能」REQ-110 一条 |
| index.html / data.html | 版本串 | 20260811.47 → 20260811.48（10 + 6 处） |
| scripts/verify-task37.js | 新建 | 25 项（见二节） |
| backup/_sshtmp/run-sql26.js | 新建（gitignore 区） | 迁移执行器：快照→备份（全库 pg_dump.gz + 两表转储）→sftp/docker cp/psql -f→NOTIFY→复核 |
| docs/问题与需求清单.md | 台账 | 登记 REQ-110 |

`node --check` js/app.js、js/dataPublic.js、scripts/verify-task37.js、backup/_sshtmp/run-sql26.js 均通过。

## 二、迁移执行实录（迁移纪律：备份 → 执行 → NOTIFY → 复核）

- **备份先行**（落服务器 /tmp）：全库快照 `/tmp/pgdump_full_20260811_sql26.sql.gz`（163,379 字节）+ 两表转储 `/tmp/pgdump_boss_dungeon_loot_20260811_sql26.sql`（120,285 字节）。
- **执行**：sftp 上传 → `docker cp` → `docker exec supabase-db psql -U supabase_admin -d postgres -f`，输出 `ALTER TABLE×2 / COMMENT×2 / CREATE FUNCTION / REVOKE / GRANT / NOTIFY`，exit=0 零 ERROR；文件末尾 NOTIFY 之外单独再发一次。
- **复核全过**：venomcurse 列=2；两表非 NULL 行=0（**存量零回填**，S1 无毒咒装备如实声明）；RPC 缺 venomcurse 键=0、非 null=0；行数零漂移 boss_loot 190→190 / dungeon_loot 221→221 / RPC 310→310（S1 视图 308=104 团本+204 大秘境，另有 2 行属历史赛季口径）。
- 迁移中自查修正一处笔误（dungeon 分支 slot 键名缺失）后再执行，终态如上。

## 三、验证（真浏览器实测，scripts/verify-task37.js，25/25 PASS）

- **A 迁移后结构与 RPC（REST 直连）**：A1 两表列在（select 200）；A2 RPC 每行透出 venomcurse 键（310 行全有）；A3 存量全 null；A4 **308 基线逐值复测** S1 全部/团本/大秘境 = 308/104/204 与基线逐字一致；A5 两壳版本串 .48 无 .47 残留。
- **B 基线零变化（插样本前，逐卡扫）**：B1 公开壳 308 卡、零毒咒徽标；B2 全部 meta 行徽标 ≤2 枚——线上卡片零变化成立。
- **C 徽标渲染（T37 样本×2：团本之刃/大秘境之戒）**：C1 卡数 310、徽标恰 2 枚文本=「毒咒」；C2 §2 computed 几何并轨（20px/600/5px/11px）；C3 §2 computed 色值 rgb(30,255,0)+rgba(30,255,0,.12)；C4 **meta 行三徽标零截断**（1366 档全页扫：scrollWidth+tag 出盒双判据，三徽标卡=2 违规=无）；C5 特效行正常渲染、徽标同卡在位。
- **D 双壳一致（登录壳 viewer）**：D1 徽标 2 枚卡数一致；D2 登录壳零截断复扫通过。
- **E 录入主链路（真浏览器 CRUD，superadmin）**：E1 毒咒控件=SELECT 仅「无/毒咒」两选项、无 _custom 手输框（禁自由输入断言）；E2 掉落池新增选毒咒→toast「已保存」→库内='毒咒'（写读一致）；E2b 列表毒咒列同步展示；E3 编辑带回显「毒咒」→改「无」→库内 NULL；E4 大秘境区块新增毒咒→写读一致。
- **F picker 不受影响**：`getMasterLootItems()` 映射对象零 venomcurse 键，T37 样本正常在列。
- **噪音定性**：409 = POST /rest/v1/user_profiles（REQ-094 ensureTagNum 建行撞 23505 的设计内重试，js/cloud.js:288-308 注释在案），与 406 同类既有噪音，本包零关系；除此之外全程零 JS 报错、零 404。
- **G 清理复核**：T37 前缀掉落/公会全 0；G1 清理后 308 基线还原；G2 RPC 全 null。
- 截图 `backup/2026-08-11-task37/`：public-venom-badges.png（公开壳首屏）、app-venom-badges.png（登录壳首屏）、datacenter-venom-form.png（大秘境列表毒咒列+「已保存」toast 同框）、**venom-badge-closeup.png（毒咒徽标特写：武器/单手剑/毒咒 三徽标零截断，亮绿与特效行同族，已抽看确认）**。

**脚本自身缺陷复盘（如实申报）**：首轮 20/25——toast 残留致等待提前 resolve、REST 读与写入竞态（E3/E4/G2 同源性失败）；二轮 A3 受首轮迟到落库残留污染 + `r.method is not a function` 脚本 bug（Playwright Response 无此方法，应 `r.request().method()`）。修正：保存等待改「先清 toast 容器再等本次 toast」+ REST 轮询落定、setup 前置自清幂等、409 抓 URL 定位后定性。三轮 25/25 全绿。

## 四、回归十一组全绿

| 项 | 结果 |
|---|---|
| verify-task37（本包） | **25/25** |
| verify-task27-wp1 / wp2 / patch | **8/8 · 27/27 · 24/24** |
| verify-task29-wp1 | **27/27，SKIP 0** |
| verify-task32 | **16/16** |
| verify-bug071（task33） | **15/15** |
| verify-task34 | **18/18** |
| verify-task35 | **13/13** |
| verify-task36 | **10/10** |
| npm test（server-security） | **exit 0（270ms，0 取消/跳过）** |
| SEC-001（verify-authz.js） | **34/34** |

各组测试数据清零复核均为 0（T37 前缀全 0；task27/task29/task32/bug071/task34/task35/task36 各前缀复核全 0，task35 含垃圾桶表）。

## 五、§1 副作用审计单（影响面逐项）

| 变更项 | 可能影响的既有行为 | 验证方式 | 结论 |
|---|---|---|---|
| 两表加 venomcurse 列 | **行数/约束/触发器**：可空列不影响唯一索引与 FK；两表无 updated_at 触发器；RLS USING(true) 自动可读 | 迁移复核行数 190/221 零漂移 | 无 |
| RPC CREATE OR REPLACE | **公示页数据口径**：函数体与 sql/24 R13 逐字一致仅白名单加一行；杂项/装饰品/幻化排除、世界BOSS 黑名单、lair 保留不动 | A2/A4 + B1 308 逐值 | 无 |
| 卡片 meta 行加条件徽标 | **存量 308 卡零变化**（venomcurse 全 NULL → 条件渲染不触发）；特效行/hover 生长体系零改动 | B1/B2 逐卡扫 + C4 截断扫 | 无 |
| .dp-tag-venom 新语义色 | **对比度**：#1eff00 亮绿于暗底高对比（特效行同色已在用）；几何随 .dp-tag 并轨 | C2/C3 computed | 无 |
| 双表单字段+payload | **数据中心其余字段链路**：REQ-060 部位↔类型联动、tags 多选、空串→NULL 归一均未动；批量录入格式未扩展（本包范围外） | E1-E4 主链路 + verify-master-data 回归 | 无 |
| 版本串 .48 | **缓存穿透**：两壳 14 引用+2 注释全量同步 | A5 | 无 |

## 六、§4 数据样本前提声明

- **样本（自建自清理）**：T37毒咒测试之刃（boss_loot，当前赛季首 BOSS，slot=武器/item_type=单手剑/毒咒）、T37毒咒测试之戒（dungeon_loot 整体池，手指/戒指/毒咒）、T37表单落库之锤（UI 新增→编辑改无）、T37表单大秘境之戒（UI 新增）；t37-super（superadmin）/t37-user（viewer）两测试用户与 T37毒咒会公会。
- **存量真实数据**：线上 308 卡只读未动；迁移前后 boss_loot 190/dungeon_loot 221/RPC 310 零漂移；T37 前缀终清理复核全 0。
- **基线口径**：308/104/204 取自 sql/24 R13 文件头「排除后基线（顾问已复核）」，A4/G1 两处逐字复测。

## 七、遗留与后续

- **插件 1.0.9 预留定位（范围外已交付侦察）**：采集插点 `parseStatLines()` addon/WoWButlerExporter/WoWButlerExporter.lua:81-99 + 三处模板（:102/:176/:257-262）；converter 两段映射 scripts/wjdc_convert.py:251/:430 + `_CMP_FIELDS`:469 + 冻结声明 :17-23（需解冻升 v3）。
- **批量录入未扩展毒咒列**（任务书未要求）：boss_loot 6 列/dungeon_loot 8 列格式不变；若后续要求，扩展点已定位（js/app.js:12413-12452 / 12554-12603）。
- **meta 行窄卡余量**：1366 档三徽标零截断已断言；若未来第四枚徽标或更长 slot/item_type 文案入场，需按 BUG-071 列预算套路重核。
- B 表 4 项（运营手工）随批交付。
- 台账 REQ-110 已登记；changelog「新增功能」已补录。
- **未 commit 未 push**，报告 + 审计单送审。
