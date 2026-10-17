# 任务书 #77 修改报告：Exporter 12.1.5 GetItemInfo 移除兼容性适配

> 日期：2026-10-17 ｜ 执行：Kimi Code ｜ 类型：插件补丁（纯 Lua，零前端/后端变更，不 bump 版本串）
> 验证：`scripts/verify-task77.js` **8/8 全绿**（静态断言；真机验证属运营侧 REQ-121 流程）
> 版本：WoWButlerExporter **1.0.27 → 1.0.28**

## 一、根因核对（先查证再改）

- 通知「4 处直接调用」与实测一致：裸 `GetItemInfo(itemID)` 调用恰 4 处——`:394`（parseItemDetail 双通道回退取 link）、`:881`（isItemDataReady 名称判存回退）、`:940` 与 `:943`（getItemBasics 名称/部位/类型/装等/图标）。
- 其他候选 API（GetDetailedItemLevelInfo / GetItemIcon / GetItemClassInfo 等）**未在活代码使用**（仅历史注释提及），无连带炸点。
- `ADDON_VERSION` 在 :241（启动语跟随该常量，无第二处硬编码）。

## 二、实际改动（红线：只改 4 处调用 + 1 个适配函数 + 版本号）

1. **新增适配函数**（`ADDON_VERSION` 之后、msg 之前）：
   `safeGetItemInfo(itemID)`——优先 `C_Item.GetItemInfo(itemID)`（返回与旧全局相同的 18 值），回退旧全局 `GetItemInfo`，双无返 nil。向前/向后双兼容。
2. **4 处调用全替换**为 `safeGetItemInfo(itemID)`（多返回值解构原样，其他逻辑零改动、历史注释零改动）。
3. **版本号双处 bump**：`ADDON_VERSION = "1.0.28"` + `.toc ## Version: 1.0.28`。

diff 受控：`+16/-5`（适配块 11 行 = 注释 2 + 代码 8 + 空行 1，版本 1，调用 4；删除 = 4 调用行 + 版本行）。

## 三、验证

- ① 适配函数结构/优先级/位置（ADDON_VERSION 后 msg 前）✓
- ② safeGetItemInfo 调用 = 5（4 处替换 + 定义名）✓；裸 `GetItemInfo(itemID)` 残留 = 0（负向后行断言排除 safe/C_Item 前缀，适配块剥离含 CRLF 处理）✓；四个目标行全部就位 ✓
- ③ 版本号双处 1.0.28 ✓
- ④ diff 行数受控 ✓
- **真机验证（运营侧，未做）**：`/wjdc probe 6948` 不报错、`/wjdc raid` 基希克斯破封出件 >0、`/wjdc all` 全量正常、SavedVariables 完整——按 REQ-121 流程：先 diff 游戏目录插件与仓库 1.0.28 一致再跑，跑完直读 SavedVariables 校验。

## 四、申报

- 本机无游戏客户端/Lua VM，插件行为验证只能静态锚定；真机回验是闭环必需项（运营回家跑）。
- `docs/plugin-sources/` 为 #76 提取时刻快照（1.0.27），不随本补丁回写；如需最新源再提取一次即可。
- 台账：BUG-111 登记。
