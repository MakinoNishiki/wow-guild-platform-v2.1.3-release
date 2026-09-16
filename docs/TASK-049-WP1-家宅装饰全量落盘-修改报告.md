# 任务书 #49 WP1 修改报告：WoWButlerDecor v0.2 全量落盘（REQ-137）

> 日期：2026-09-17 ｜ 范围：仅 `addon/WoWButlerDecor/` 双件（toc+lua）迭代
> 纪律：完工送审，**未 commit 未 push**；git 提交由运营执行（commit 物料见文末）。
> 性质：纯只读不变——未调用任何写类 Housing API，全部 Housing 调用仍在既有 pcall 包裹内；无 js/css/html/sql/版本串改动，WoWButlerExporter 零触碰。
> 前置事实（任务书原文采信）：v0.1.1 真机二跑判绿（run 20260916-203500），totalCount=2062、逐条取字段零失败、sourceText 非空 96.4%、中文无乱码、`{recordID,entryType,variantIdentifier}` 新形态确认。

---

## 一、实现要点（对照任务书 §WP1 需求逐条）

| 任务书要求 | 落实 |
|---|---|
| ①枚举链路只调用不改写 | `doScan` 守卫链 / `tryEnumerate` 容错链（直取→显式空搜索→`C_Timer.After(0.5)`×3）/ `toEntryID` 双形态 / 逐条 `pcall(GetCatalogEntryInfo)` / 能力探测 / pairs 扫面 / diag 逐步留痕——**逐 hunk diff 核对零改动**（见 §三） |
| ②items 全量落盘 | 采集循环内在 stats/samples 之外追加 `items[#items+1] = copyCatalogFields(info, entryID)`；落盘 `WoWButlerDecorDB.items`（数组 1..N） |
| ③保留字段集 | 白名单 16 键（itemID/name/iconTexture/asset/uiModelSceneID/quality/size/placementCost/categoryIDs/subcategoryIDs/sourceText/dataTagsByID/isAllowedIndoors/isAllowedOutdoors/canCustomize/firstAcquisitionBonus）深拷贝 + recordID/entryType（新形态取自结构体；旧形态纯数字记入 recordID、entryType 留空，转换层兼容）；sourceText 原始带格式串不清洗 |
| ④剔除玩家态字段 | totalNumStored/totalNumPlaced/numPlaced/quantity/showQuantity/remainingRedeemable/destroyableInstanceCount/dyeSlots/entryID 均不在白名单、不进 items（注释钉死清单） |
| ⑤回归对照件保留 | stats / samples(30) / diag 原样；`runMeta` 增加 `dataset = "full"` |
| ⑥黄字提示 | 完成时追加一行：`[wbd] 全量采集 N 件已暂存，/reload 后写入 SavedVariables（文件约 X.X MB）`，X=`approxSerializedLen(items)/1048576` 近似估算（任务书允许不准不追究） |
| ⑦防重跑叠加 | `doScan()` 开扫即 `WoWButlerDecorDB.items = nil`（同时提前释放上轮 2062 件内存；成功/失败路径本来就整表覆盖，此为双保险+内存考量） |
| ⑧版本双同步 | toc `## Version: 0.2.0` + lua `ADDON_VERSION = "0.2.0"`；toc Notes 年代标注顺带订正为「v0.2 全量落盘」（规范 6.3 防过时，非新增字段） |
| ⑨只读红线 | 新增代码零 API 调用（纯表拷贝/计数）；失败红字 + diag 路径未动 |

新增局部函数仅两个：`copyCatalogFields`（白名单深拷贝）、`approxSerializedLen`（体积粗估），均不触 Housing API。

## 二、残留申报

1. `approxSerializedLen` 为逐键值递归粗估（字符串 #v+6、标量 12 字节），仅服务聊天提示的 MB 数字，非精确序列化长度——任务书明示「不准不追究」。
2. 旧形态（纯数字 entryID）下 items 的 `entryType` 为空——国服真机已证实为新形态结构体，此分支仅为双形态兼容兜底，WP2 转换层按空值容忍处理。
3. 单件 `GetCatalogEntryInfo` 失败时该件不进 items（failCount 计数不变）——items 件数 = totalCount - failCount，验收口径以真机 failCount=0 为前提（v0.1.1 二跑已实证零失败）。

## 三、验证输出（原样附）

luaparse 语法检查（luaparse@latest 临时目录安装，仓库外执行，未往 repo 加文件；luaVersion=5.1）：

```
$ node check.js addon/WoWButlerDecor/WoWButlerDecor.lua
SYNTAX OK: addon/WoWButlerDecor/WoWButlerDecor.lua
```

块配对复核（AST 计数法——luaparse 解析后统计需 `end` 闭合的块节点数，对比剥离注释/字符串后的 `end` token 数；v0.1.1 基线与 v0.2 同一工具口径）：

```
$ node blockcheck.js <v0.1.1 基线>
AST blocks needing 'end': function=16 if=32 while=0 do=0 forNum=0 forGen=6 => total=54
stripped 'end' tokens = 54 ; repeat=0 until=0
BLOCK PAIRING PASS

$ node blockcheck.js addon/WoWButlerDecor/WoWButlerDecor.lua
AST blocks needing 'end': function=18 if=37 while=0 do=0 forNum=0 forGen=8 => total=63
stripped 'end' tokens = 63 ; repeat=0 until=0
BLOCK PAIRING PASS
```

增量自洽：function +2（copyCatalogFields/approxSerializedLen）、if +5（白名单判空 1 + entryID 形态 1 + 体积估算 2 + 开扫清空 1）、forGen +2、end +9=2+5+2——与新增代码一一对应，无计划外块。

说明：#48 报告中的 `tools/luacheck/` 双件不在本 release 快照内（其 16/31/6/53 口径与本文 AST 口径计数法不同），本次以 luaparse 全真解析 + AST 块计数复刻同等验证，基线/新版同一工具，结论可对照。

对照 v0.1.1 diff 评审（任务书 WP1 验收②）：

```
$ git diff --stat
 addon/WoWButlerDecor/WoWButlerDecor.lua | 57 +++++++++++++++++++++++++++++++--
 addon/WoWButlerDecor/WoWButlerDecor.toc |  4 +--
 2 files changed, 56 insertions(+), 5 deletions(-)
```

逐 hunk 核对结论：9 个 hunk 全部为「头部注释 3 行 / 版本号 2 处 / buildMeta dataset / 新增两函数 40 行 / items 收集与落盘 5 行 / 黄字 2 行 / 开扫清空 2 行 / toc 版本+Notes」；`tryEnumerate`、`toEntryID`、`saveFailure`、`doScan` 守卫与探测段、retry 容错链、stats/samples 统计段**零行改动**。

git 改动范围自查：

```
$ git status --short
 M addon/WoWButlerDecor/WoWButlerDecor.lua
 M addon/WoWButlerDecor/WoWButlerDecor.toc
?? docs/TASK-049-WP1-家宅装饰全量落盘-修改报告.md
```

未跑项申报：真机 `/wbd scan` 三跑为运营验收步骤（任务书 §WP1 验收③），本工作包无法代跑；无伴随 JS，无需 `node --check`。

## 四、台账与文档

- REQ-137 已登记在案（#48 补登），本 WP 属同一需求 v0.2 迭代，**无新增编号**；台账状态行与更新日志四维补录按纪律属提交前门禁，留待真机判绿、运营执行 commit 时一并更新（建议口径见 §六）。
- AGENTS.md 未动：沿用 #48 决议「待 v0.2 真机判绿后再议是否补录插件条目」。
- 运营验收提示：参照 REQ-121 同款纪律，真机前先 diff 游戏目录 `Interface\AddOns\WoWButlerDecor` 与本目录，版本不一致先同步再跑。

## 五、送审件清单

| 件 | 路径 |
|---|---|
| 插件 lua | addon/WoWButlerDecor/WoWButlerDecor.lua（v0.2.0，345 行） |
| 插件 toc | addon/WoWButlerDecor/WoWButlerDecor.toc（Version 0.2.0） |
| 修改报告 | docs/TASK-049-WP1-家宅装饰全量落盘-修改报告.md（本件） |

运营真机三跑步骤（任务书原文）：勾好插件 → `/reload` → `/wbd scan` → 见黄字「全量采集 N 件已暂存」→ `/reload` → 复制 `WTF/Account/<账号>/SavedVariables/WoWButlerDecor.lua` 上传顾问。顾问复核口径：items 件数 = totalCount = 2062±50、字段集齐、中文无乱码、无玩家态字段混入。

## 六、commit 物料建议（运营执行，顾问审查通过后）

标题：

```
任务书#49-WP1：WoWButlerDecor v0.2 全量落盘（REQ-137）
```

描述（三段式）：

```
【改了什么】/wbd scan 升级全量采集：枚举/容错/diag 链路原样复用 v0.1.1 零改动，
采集循环追加目录字段白名单拷贝进 WoWButlerDecorDB.items（16 键+recordID/
entryType，玩家态 9 字段剔除，sourceText 原样不清洗），runMeta.dataset="full"，
开扫清上轮 items 防重跑叠加，完成黄字报件数与文件体积估算；版本双同步 0.2.0
（toc+lua），toc Notes 年代标注订正。
【范围】仅 addon/WoWButlerDecor/ 双件 + docs/ 修改报告 + 台账 REQ-137 状态行；
零 js/css/html/sql/版本串改动，WoWButlerExporter 零触碰，不调任何写类 Housing API。
【验证】luaparse(5.1) SYNTAX OK；AST 块配对基线/新版双 PASS
（function 16→18、if 32→37、forGen 6→8、end 54→63，增量与新增代码一一对应）；
逐 hunk diff 核对枚举/容错/diag 零改动。真机三跑+SavedVariables 顾问复核
（件数 2062±50/字段集/中文/无玩家态）由运营按任务书验收步骤执行。
```
