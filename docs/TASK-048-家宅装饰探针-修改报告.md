# 任务书 #48 修改报告：WoWButlerDecor v0.1 家宅装饰探针插件（REQ-137 数据切片）

> 日期：2026-09-16 ｜ 范围：纯新增 `addon/WoWButlerDecor/` 双件（toc+lua）+ 台账 REQ-137 补登
> 纪律：完工送审，**未 commit 未 push**；git 提交由运营执行（commit 物料见文末）。
> 性质：纯只读探针——只调 Get/Search/Create 类查询 API，未调用任何写类 Housing API，未向游戏内做任何写入；无 js/css/html/版本串改动，WoWButlerExporter 零触碰。

---

## 一、调研依据（任务书 #48 原文保留，硬约束）

| 项 | 来源 | 结论 |
|---|---|---|
| `C_HousingCatalog.CreateCatalogSearcher()` | warcraft.wiki.gg《World of Warcraft API》HousingCatalogUI 系统 | 创建目录搜索器对象，为目录枚举入口 |
| `C_HousingCatalog.GetCatalogEntryInfo(entryID)` | warcraft.wiki.gg 同上 | 按 entryID 返回目录条目详情表：name/iconTexture(或 iconAtlas)/categoryIDs/subcategoryIDs/placementCost(1~5)/sourceText/size/quality/totalNumStored/totalNumPlaced/firstAcquisitionBonus 等 |
|  Housing API 官方开放 | 暴雪官方论坛 2025-12-19 公告（Housing API 插件+REST 双层） | 本探针所用 API 属官方支持面 |
| 可行性先例 | WoWDB「Dump Decor」插件（CurseForge/Wago） | 同类导出路径已跑通 |
| 全量基数 | housing.wowdb.com（12.1 数据） | 3158 件，作总数判据参照（±500 容差覆盖版本差与国服差异） |

**任务书外补充调研（任务书允许范围：warcraft.wiki.gg HousingCatalogUI 系统文档页）**——任务书未写明搜索器具体方法名，补查如下，逐条标注来源页：

| 补充项 | 来源 | 结论 |
|---|---|---|
| `HousingCatalogSearcher:RunSearch()` | [API:HousingCatalogSearcher RunSearch](https://warcraft.wiki.gg/wiki/API:HousingCatalogSearcher_RunSearch) | 按当前参数执行搜索（搜索为异步） |
| `HousingCatalogSearcher:GetCatalogSearchResults()` | [API:HousingCatalogSearcher GetCatalogSearchResults](https://warcraft.wiki.gg/wiki/API:HousingCatalogSearcher_GetCatalogSearchResults) | 取最近搜索结果；**12.0.5 起返回 `matchingEntryVariantIDs`，元素为 `{recordID, entryType, variantIdentifier}` 结构体**（旧形态 `matchingEntryIDs` 元素为纯数字 entryID）——本插件两种形态都兼容（`toEntryID` 归一化），实测形态记入 diag |
| `HousingCatalogSearcher:SetSearchText([searchText])` | [API:HousingCatalogSearcher SetSearchText](https://warcraft.wiki.gg/wiki/API:HousingCatalogSearcher_SetSearchText) | 搜索参数；空串=显式空搜索条件，nil=清除 |
| `GetCatalogEntryInfo` 入参形态 | [API:C_HousingCatalog.GetCatalogEntryInfo](https://warcraft.wiki.gg/wiki/API:C_HousingCatalog.GetCatalogEntryInfo) | entryID 为 `HousingCatalogEntryID` 结构体 `{recordID, entryType}`——与搜索结果元素前两键一致，`toEntryID` 取该两键构造入参 |
| `HousingCatalogSearcher:GetSearchCount()` | [API:HousingCatalogSearcher GetSearchCount](https://warcraft.wiki.gg/wiki/API:HousingCatalogSearcher_GetSearchCount) | 返回最近搜索结果的拥有实例总数（本切片不使用，仅列入能力探测候选） |

上述方法均为查询/搜索参数类，落在任务书「只允许 Get/Search/Create 类查询 API」边界内；`IsSearchInProgress` 为未证实候选，仅做 type() 探测、不调用。除上表外未使用任务书调研依据节之外的任何 API。

## 二、残留不确定点（任务书原文，如实申报）

1. **搜索器是否需要显式设置过滤条件才返回全量**——容错分支已覆盖（直取为空→显式 `SetSearchText("")` 空搜索条件再取→`C_Timer.After(0.5)` 重试至多 3 次），diag 会记录每步真实返回形态（`GetCatalogSearchResults ok/shape` 逐步留痕），真机一跑即见分晓。
2. **国服客户端 API 可用性**——若国服阉割，本探针第一次真机跑就会暴露（failCount=总数 或 枚举 0 结果），如实回报不绕路：命名空间/查询函数缺失与 CreateCatalogSearcher 异常均有独立红字分支，diag 落盘后正常结束，不静默。

另补充一条代码面如实申报（非任务书两条之外的新风险，属①的子形态）：搜索结果 12.0.5 起为 variant 结构体数组而非纯数字 entryID 数组，本插件按结构体取 `recordID/entryType` 构造入参；若实机返回纯数字旧形态，`toEntryID` 原样透传，pcall 兜底，`diag.firstResultShape` 会记录真实元素形态。

## 三、实现要点（对照任务书 §1.2 逐条）

- **枚举通道**：`pcall(C_HousingCatalog.CreateCatalogSearcher)` 建搜索器 → `RunSearch` → `GetCatalogSearchResults` 取 entryID 集；容错链=直取为空 → 显式空搜索条件（`SetSearchText("")`）再取 → `C_Timer.After(0.5)` 异步重试至多 3 次 → 仍空红字「目录枚举失败：搜索器 0 结果（重试 N 次仍空）」+ diag 落盘正常结束。
- **逐条取字段**：`pcall(C_HousingCatalog.GetCatalogEntryInfo, entryID)` 单条包裹，失败记 `failCount` 续跑不中断。
- **能力探测**：候选方法清单 type() 判 function 记入 `diag.probedMethods`；另对搜索器做 pcall(pairs) 全量扫面记入 `diag.pairsSweep`（实测方法集一跑尽知）。
- **WoWButlerDecorDB 落盘结构**：`runMeta`（插件版本/GetBuildInfo 四值/时间戳/run_id）、`totalCount`、`failCount`、`stats`（sourceText 空/非空、placementCost 1~5/空/其他形态分布、category 聚合计数+字段形态如实记录（categoryIDs/category 键名+type，多形态并存拼接记录）、iconTexture 数字 fileID vs 其他形态 vs 缺失、size/quality 非空计数）、`samples`（前 30 条返回表全键值原样深拷贝+本条 entryID，深度上限 8 层防呆）、`diag`（返回形态 enumShape/firstResultShape、重试次数 retries、逐步耗时 steps、totalElapsedSec）。
- **聊天框**：开始一条进度黄字；结束摘要黄字（总数/sourceText 空非空/failCount/「数据已写入 SavedVariables，/reload 后取文件」）；总数 <100 或 >10000 加打「数量异常，可能枚举通道不符预期（判据参照 3000±500）——数据照常落盘」；失败路径红字。全程不刷屏。
- **风格**：msg/err 双通道（`|cffffd200[wbd]|r` / `|cffff4040[wbd]|r`）、SavedVariables 直写全局表、SLASH_WBD1/SlashCmdList 注册，与 WoWButlerExporter 同款；Lua 5.1 语法（luaparse 口径）。

## 四、验证输出（原样附）

luaparse 语法检查（tools/luacheck/check.js）：

```
$ node tools/luacheck/check.js addon/WoWButlerDecor/WoWButlerDecor.lua
SYNTAX OK: addon/WoWButlerDecor/WoWButlerDecor.lua
```

块配对自查（tools/luacheck/block-pair-check.js）：

```
$ node tools/luacheck/block-pair-check.js addon/WoWButlerDecor/WoWButlerDecor.lua
function=16 if=31 do=6 => f+i+d=53 ; end=53
repeat=0 until=0
BLOCK PAIRING PASS
```

git 改动范围自查（仅新增插件目录 + 台账补登；`tasks/任务书48-…` 为任务书下发件，非本工作包改动）：

```
$ git status --short
 M "docs/问题与需求清单.md"
?? addon/WoWButlerDecor/
?? "docs/TASK-048-家宅装饰探针-修改报告.md"
?? "tasks/任务书48-家宅装饰探针插件.md"
```

未跑项申报：真机 `/wbd scan` 为运营验收步骤（任务书 §运营验收步骤 3-4），本工作包无法代跑；无伴随 JS，无需 `node --check`。

## 五、台账与文档

- REQ-137 原未登记，已按既有格式补登于 `docs/问题与需求清单.md` 四、需求类（P2），状态=「🔧 已实现待真机回验（任务书 #48 已送审/待真机：…）」。
- AGENTS.md 未动：本切片为独立新插件目录、不改平台任何功能面；待 v0.2 真机判绿后再议是否补录插件条目。

## 六、送审件清单

| 件 | 路径 |
|---|---|
| 插件 toc | addon/WoWButlerDecor/WoWButlerDecor.toc（Interface 120000 照抄 Exporter；字段严格按任务书 §1.1） |
| 插件 lua | addon/WoWButlerDecor/WoWButlerDecor.lua（单文件全实现，约 260 行） |
| 修改报告 | docs/TASK-048-家宅装饰探针-修改报告.md（本件） |
| 台账 | docs/问题与需求清单.md（REQ-137 补登行） |

## 七、commit 物料建议（运营执行，顾问审查通过后）

标题（任务书红线节原文）：

```
任务书#48：WoWButlerDecor v0.1 家宅装饰探针（REQ-137 数据切片）
```

描述（三段式）：

```
【改了什么】新建纯只读探针插件 addon/WoWButlerDecor（toc+单文件 lua）：
/wbd scan 走 C_HousingCatalog.CreateCatalogSearcher 枚举家宅装饰目录、
逐条 pcall GetCatalogEntryInfo 取全字段，统计（sourceText 空/非空、
placementCost 分布、category 聚合、iconTexture 形态、尺寸/品质非空率）+
前 30 条全字段样本+枚举路径 diag 落 SavedVariables WoWButlerDecorDB；
容错链=显式空搜索条件再取→C_Timer.After(0.5) 重试至多 3 次→仍空红字+
diag 落盘不静默。台账补登 REQ-137。
【范围】纯新增 addon/WoWButlerDecor/ 双件 + docs/问题与需求清单.md REQ-137 行；
零 js/css/html/版本串改动，WoWButlerExporter 零触碰，不调任何写类 Housing API。
【验证】luaparse 语法 SYNTAX OK；块配对 f+i+d=53=end、repeat=until=0 PASS；
git status 确认改动范围。真机验收（/wbd scan→/reload→取 SavedVariables
发顾问判读三问）由运营按任务书验收步骤执行。
```
