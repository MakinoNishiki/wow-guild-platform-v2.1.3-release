# 任务书 #46 修改报告｜插件 1.0.9 四合一（REQ-088/REQ-110③/REQ-089/REQ-092）

> 施工日期：2026-08-13。仓库副本：tasks/任务书46-插件1.0.9-四合一.md（任务书原文已在库）。
> 红线执行：§1 审计单先行（侦察双代理全覆盖）；零依赖；DB-first；版本串 20260811.57→.58 两壳 16 引用+2 头部注释；T46 前缀测试数据终清理复核为零；不 commit 不 push。
> ✅ **sql/29 已执行**（2026-08-13 随 sql/28 同批：备份→SSH+docker exec→NOTIFY pgrst×2→复核——boss_loot 190/dungeon_loot 221 行数零漂移、icon_id 存量全 NULL、RPC 每行透出 icon_id 键、308/104/204 基线零漂移）。迁移后 verify-task46.js 全量 **27/27**（C2 RPC 透出 + C3 图标 404 隐藏回退双态解锁实测）。REQ-089 **未施工**（规则表送审，基线红线见 §5）。

---

## §1 审计单（开工前置，侦察结论）

1. **REQ-088 根因定论**：`parseStatLines()` 对特效行用 `^（装备：` 行首硬锚定；Lua pattern 语义下换行/多段落形态被排他（首行命中即非空，与「39 件空串」矛盾）；同版本 1.0.6 有 3 件采到（sql/23 背景注释）证明色码是个体级——**唯一自洽形态=行首内联颜色码 `|cff1eff00装备：…|r`**。仓库内无真实导出样本，真机终验走 Probe 全行 dump（本批已具备该能力）。
2. **插件现状**：1.0.7（lua:18/toc:4，1.0.8 未实施跳号）；readTipLines 只读 TextLeft；GetItemInfo 第 10 返回值=icon fileID 未取。
3. **converter 现状**：文首冻结声明实为 **v2**（任务书误写 v3，以实为基）；effect 已映射，venomcurse/iconID 零映射；_CMP_FIELDS 六键；mock 三件套齐备。
4. **REQ-089 数据源**：boss_loot 兑换物仅 1 行（slot=item_type=套装兑换物）；tier_sets 无套装装备清单——展开须静态规则预制，且 308/104/204 基线必变（任务书明令送审+禁止静默改基线）。
5. **素材管道**：仓库零 BLP/CASC 工具链；REQ-069 先例=运营供源图+零依赖脚本落盘，照此口径。
6. **图标渲染插点**：itemCard 双壳同源（dataPublic.js:575-617）；.dp-item-inner 非 positioned 需加锚点；缺图回退/懒加载有 :781 先例。

## §2 修改清单（实际改动点）

| 文件 | 改动 |
|---|---|
| addon/WoWButlerExporter/WoWButlerExporter.lua | 版本 1.0.9+沿革注释（1.0.8 跳号）；stripLineCodes()（行首空白/图标码/开色码/收色码循环剥离，纯文本零影响）；parseStatLines effect/使用 行走剥离后文本（首条命中守卫保留）；毒咒行识别（剥码后整行恰为「毒咒」→ d.venomcurse）；getItemBasics 取第 10 返回值→loot 行加 iconID/venomcurse |
| addon/.../WoWButlerExporter.toc | ## Version: 1.0.9 |
| addon/.../WoWButlerExporter_Probe.lua | 物品级诊断加 tooltip 全行原样 dump（\|c 码转义可见+剥离对照），解析结果补 effect/venomcurse 输出 |
| scripts/wjdc_convert.py | 冻结声明 v2→v4（四合一三字段口径）；norm_items/build_load_rows 透传 venomcurse（空→None）/iconID（→icon_id 整型，非整→None）；_CMP_FIELDS 六键→八键 |
| scripts/wjdc/mock 三件套 + README | mock 版本 1.0.9、全件 iconID、毒咒样本（守望者指环）、剥码特效样本（影纹披风，主代理复核修正为 1.0.9 真实导出形态=纯文本）；README 产物口径同步 |
| sql/29_req092_icon_id.sql（新） | 两表 icon_id int 可空+COMMENT；RPC 两分支白名单各加 'icon_id' 一行（与 sql/26 函数体 diff 仅此两行+复核段）；回滚/复核/NOTIFY×2 |
| js/dataPublic.js | itemCard：icon_id 纯数字校验非空才渲染 img.dp-item-icon（规则路径 assets/icons/items/{id}.png，loading=lazy，onerror 隐藏，空值/失败不渲染不占位） |
| css/data-public.css | .dp-item-inner position:relative 锚点；.dp-item-icon absolute 右上 22×22 圆角；.dp-item-name padding-right 防压图 |
| js/app.js | 数据中心双掉落表单 fields+payload 加 icon_id（**仅非空携带**=PGRST204 迁移窗口防护，主代理加固）、双列表图标ID 列、批量录入第 7 列（纯数字校验报行号）；changelog 三条 |
| scripts/import-item-icons.js（新） | 素材管道：零依赖，数字命名校验/PNG 魔数+尺寸校验/幂等覆盖/计数报告；assets/icons/items/.gitkeep 落位 |
| docs/REQ-089-兑换物展开规则表-送审.md（新） | 纯送审稿：12 格待确认+展开基数+数据源+基线红线+签核栏，零施工内容 |
| scripts/verify-task46.js（新） | 27 断言（见 §3） |
| docs/问题与需求清单.md | REQ-088/089/092/110③ 四行更新（注明仓库副本路径） |

语法门禁：luacheck 双 lua OK；py_compile OK；node --check 涉及 js 全过。

## §3 验证（verify-task46.js 27/27）

- A 组静态+基线：版本串 .58 两壳 16+2 ✓；插件 1.0.9 双串+采集位落码 ✓；converter v4 八键 ✓；sql/29 白名单 ✓；REQ-089 送审件含「禁止静默改基线」✓；PGRST204 防护落码 ✓；luacheck ✓；**308/104/204 基线零漂移实测** ✓
- B 组 converter mock 端到端（tools/python 便携运行时）：主 mock 转换零报错、load rows（boss 5+dungeon 2）三字段键齐、毒咒样本行透出、iconID 全件整型透传、特效剥码纯文本、八键对账零丢失（变更行仅既有预期 1 条）、values/tiers 双 mock 回归 ✓
- C 组迁移探测双模式：**sql/29 已执行，全量解锁**——C2 RPC 白名单透出 icon_id ✓；C3 T46 样本行（icon_id=999999 无素材）图标 img 渲染→404 自动隐藏不占位不破版 ✓；兼容态（列未就绪时零图标零报错）为迁移前窗口期记录在案 ✓
- D 组素材管道冒烟：真实 PNG fixture 入库、非数字命名跳过、幂等覆盖计数 ✓（fixture 与产物已自清，items/ 仅 .gitkeep）
- 全程零 JS 报错零 404；T46 前缀数据清零复核 ✓

## §4 样本声明

mock 样本：守望者指环（毒咒行）、影纹披风（剥码特效行）、全 7 件 iconID；特效非空率真机前后对比属游戏内链路——并入 B 表 B1/B2 运营实测（本机无客户端，如实申报未做真机导出）。图标命中率=0/N（素材首库待运营供源图，管道已就位）。

## §5 基线红线执行情况（REQ-089）

**未施工、未动任何基线断言**。送审件 docs/REQ-089-兑换物展开规则表-送审.md 已列 12 个待确认格；展开上界约 65 行将改变 308/104/204 与 190/221 全部基线——待运营确认新基线后方可施工并同步更新 verify-task37/39/40/43/46 的基线常量。

## §6 回归（红线清单，2026-08-13 全绿；sql/28+sql/29 迁移执行后同口径复跑同绿）

| 套件 | 结果 |
|---|---|
| 主数据敏感串行：task27-patch / task37 / task39 / task40 / task43 | ✅ 24/24、25/25、18/18、21/21、27/27 |
| verify-smart-import / task27-wp1 / wp2 / task29-wp1 / task31 / task32 | ✅ 39（24+15）、8/8、27/27、27/27、16/16、16/16 |
| bug071 / task34 / 35 / 36 / 38 / 41 | ✅ 15/15、18/18、13/13、10/10、17/17、17/17 |
| task42 / task44 / task45 | ✅ 24/24、27/27、13/13（降级模式） |
| verify-authz（SEC-001）/ npm test | ✅ 34/34、通过 |
| verify-task46 本包 | ✅ 27/27 |

注：task37/39/40/43 与 task27-patch 均读写主数据基线，并行互踩有前科（#44/#45 回归期两起），本批起固化「主数据敏感件串行单链」执行口径；全部首跑失败项归因均经串行复跑实证与产品无关。

## §7 B 表（运营手工，5 项，任务书 §五原表照录+施工侧注）

| # | 操作 | 预期 |
|---|---|---|
| B1 | 游戏内 /reload 后用 1.0.9 插件导出，converter 转换 | 转换零报错；导出含特效/毒咒/iconID 字段（前置：插件文件入 Interface/AddOns） |
| B2 | 智能导入该文件→数据中心抽查 3 件饰品 | 特效文本正确显示（REQ-088 真机终验点）；毒咒装备带毒咒字段 |
| B3 | 公示页找一件毒咒装备+一件普通饰品 | 毒咒卡有绿徽标；两件卡右上角有物品图标（前置：sql/29 执行+素材入库） |
| B4 | 找兑换物对应 BOSS | 该 BOSS 下落池出现展开的职业套装装备——**REQ-089 送审确认后才可验，当前未施工** |
| B5 | 弱网/无图场景慢速刷新公示页 | 图标懒加载不卡首屏；无图装备不破版（施工侧已实测 404 隐藏路径的代码分支，真图待素材） |

## §8 遗留申报

1. ~~sql/29 待运营执行~~ **已执行**（2026-08-13 随 sql/28 同批）；C2/C3 已全量实测。
2. **REQ-088 真机终验**：修复经代码级排他论证+mock 实证，真机导出特效非空率对比待运营游戏内执行（Probe 全行 dump 已就位）。
3. **数据中心「清空既有图标ID」**：迁移窗口防护口径下 icon_id 仅非空携带，清空需 sql/29 执行后处理（影响≈0，登记）。
4. **素材首库**：约 300 枚 PNG 待运营供源图后跑 import-item-icons.js 入库；产物不占版本串（规则路径直拼，无映射表）。
5. 大秘境批量录入（mdDungeonLootBatchParse 8 列格式）未扩 icon_id 列，如需属后续增补（任务书未列）。
