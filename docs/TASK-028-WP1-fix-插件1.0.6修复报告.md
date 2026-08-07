# 任务书 #28-WP1-fix 修改报告：插件 1.0.6（真机 BUG 修复）

> 日期：2026-08-07 ｜ 执行：Kimi Code ｜ 关联：WP1 星标数据链（REQ-086）
> 状态：**probe 真机验证已通过**（2026-08-07，见三节）；待运营 `/wjdc all` 全量实跑后进入转换回填（未 commit、未 push）；站点版本串不动（插件不涉前端）。

---

## 一、实际改动点

### 1. 根因修复 — `addon/WoWButlerExporter/WoWButlerExporter.lua:68`
运营实跑 `/wjdc all` 报 `lua:68 bad argument #2 (base out of range)`，团本/大秘境两段中断。
- 根因（顾问定位，复核确认）：`tonumber(num:gsub(",", ""))`——`gsub` 的第二返回值（替换次数）作为 `tonumber` 的第 2 参（base）传入；剥 0 次 → base=0、剥 1 次 → base=1，均越合法 base 范围（2–36），**每件带数值装备必炸**。
- 修复：`tonumber((num:gsub(",", "")))`——括号截断多返回值，只取替换后字符串。

### 2. 全文件 sweep（多返回值函数直接嵌进单参函数）
对两 lua 文件全量排查 `gsub/match/find/pcall/GetItemInfo` 等嵌套调用，逐处复核：
- `stat = stat:gsub("%s", "")`（67 行）/`name = name:gsub(...)`（95 行）：单变量赋值，Lua 赋值截断只取首值——安全；
- `cmd:gsub(...):gsub(...):lower()`（243 行）：方法链中作为调用基表达式，截断首值——安全；
- `d.effect = t:match(...) or t:match(...) or ""`：`or` 链操作数截断首值，整体单变量赋值——安全；
- `local ok, stats = pcall(...)`、`local name, _, _, ilvl, ... = GetItemInfo(...)` 等：多变量接收多返回值，系有意为之——安全；
- Probe 文件 `{ pcall(...) }` 表构造尾位展开、`local ok, x = pcall(...)`：均有意多值接收——安全。
- **结论：与顾问扫描一致，全仓库仅此一处（68 行），已修复。**

### 3. 版本与文档
- `ADDON_VERSION` 与 toc `## Version`：1.0.5 → **1.0.6**；文件头注释补 1.0.6 修复记录；`/wjdc` 用法提示 probe 参数说明补「物品ID」；
- README 数值说明改「1.0.6 起」并注明 1.0.5 真机必炸请直接用 1.0.6；probe 命令行说明补物品 ID 诊断；
- 运营测试步骤卡第 6 步数值字段预期改标 1.0.6。

### 4. probe 物品级诊断（验证链路用，1.0.6 新增）— `WoWButlerExporter_Probe.lua`
`/wjdc probe <物品ID>`（纯数字 ≥100000 走物品分支，与团本序号不撞号；EJ 检查前分流，不依赖副本手册），四段输出：
1. `GetItemStats("item:…")` 原始返回逐项 dump（key / 原始值 / `_G[key]` 中文解析名）——中文短名对照核验；
2. **通道判定**：调用与导出同函数的 `statValuesFromApi`，命中/未命中（含原因：函数不存在/调用报错/空表）直接打印；
3. tooltip 属性相关**原行**逐行输出（含前导「+」有无）——主属性行格式核验（修复要求 #5）；
4. `parseItemDetail` + `statValuesFromApi` 结果对照（primary/secondary 名表 + 两通道数值表）。
主文件末尾将 `scanLines/parseItemDetail/statValuesFromApi` 挂入 `WJDCShared` 供 probe 复用（导出逻辑零改动）。

## 二、验证

- 本机无 Lua 运行时，无法执行真机验证——**坦白说明**：修复为单行语法级修正（括号截断），改动段与 probe 新代码已人工精读复核（配对/作用域/多返回值语义）；
- 转换器零改动，双 mock 回归重跑通过（新格式 NEW-OK / 旧格式 OLD-OK），导出格式冻结声明不受影响（字段名/类型/空值口径未变）；
- npm test / SEC-001 不涉及（纯插件改动，站点零改动）。

## 三、真机验证结果（运营 2026-08-07 `/wjdc probe 251201` 核闪多用仪，已通过）

```
GetItemInfo：name=核闪多用仪 ilvl=28
GetItemStats：函数不存在（API 通道不可用）
通道判定：GetItemStats 未命中（不存在/报错/空表），导出将回退 tooltip 解析
tooltip 属性相关原行：+31 智力 / +6 急速 / +9 精通
parseItemDetail：primary=智力 ｜ secondary=急速, 精通
  tooltip 数值：primary_values={智力=31} secondary_values={急速=6, 精通=9}
```

结论三条：
1. **数值来源通道 = tooltip 解析**：`GetItemStats` 在 12.x 客户端**函数不存在**（与 EJ 系列 API 移除同批病害），API 优先通道不触发但不报错，回退通道工作正常；代码保留 API 通道作未来兼容（若后续版本恢复该函数自动生效）；
2. **数值采集正确**：`primary_values={智力=31}`、`secondary_values={急速=6, 精通=9}`，中文属性名对照正确，gsub 修复生效（数值行不再炸）；
3. **主属性行有前导「+」**（「+31 智力」）——预判的已知限制**不成立**，主属性数值同可采集，`primary_values` 非空；星标比较所需副属性数值链完整。

## 四、遗留

1. 主属性数值可采（真机 tooltip 带前导「+」，见三节结论 3），无已知限制遗留；
2. GetItemStats 在 12.x 不存在，数值链实际唯一通道 = tooltip 解析——若未来客户端恢复该 API，优先通道自动接管，无需改代码；
3. 验收通过后建议 commit 标题：「任务书#28-WP1-fix：插件1.0.6（gsub多返回值修复+probe物品级诊断）」。
