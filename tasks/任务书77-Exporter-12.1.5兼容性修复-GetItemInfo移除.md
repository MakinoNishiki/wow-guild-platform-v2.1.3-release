# 任务书 #77

**项目**：魔兽管家（WoW Butler）
**任务名称**：Exporter 12.1.5 兼容性修复（GetItemInfo 移除）
**类型**：插件补丁（Lua）
**优先级**：T0（阻塞基希克斯破封数据录入）
**关联**：#76 → #77 → 基希克斯破封数据录入
**插件**：WoWButlerExporter 1.0.27 → 1.0.28
**数据库**：无（纯插件修复）

---

## 防失忆自检

1. 当前版本串？→ 20261015.97
2. Exporter 崩在哪？→ `GetItemInfo` 在 12.1.5 被移除，调用即 `attempt to call a nil value`
3. 修复后目标？→ `/wjdc all` 能正常扫出基希克斯破封团本掉落

---

## 一、问题现状

| 现象 | 根因 |
|------|------|
| 所有装备 `attempt to call a nil value` | `GetItemInfo` 在 12.1.5 中被彻底移除（deprecation fallback removed） |
| 所有副本/团本导出 0 件 | 解析函数炸在 `getItemBasics`，没有一件能读完 |
| 基希克斯破封 0 件 | 同上，不是没数据，是读不出来 |

**Warcraft Wiki 铁证**：
> "This function was deprecated in patch 10.2.6 in Deprecated_ItemScript.lua and its deprecation fallback will be removed in patch 12.1.5."

**WoW Forever 开发者指南铁证**：
> "Patch 12.1.5 removed the deprecated item functions that the 12.1.0 build still relies on (`GetItemInfo`, `GetItemQualityColor`, `GetDetailedItemLevelInfo`, `GetItemIcon`)"

---

## 二、受影响调用点（6处）

在 `WoWButlerExporter.lua` 中搜索 `GetItemInfo`：

| 行号 | 上下文 | 当前代码 |
|------|--------|----------|
| 394 | `parseItemDetail` 回退通道 | `local _, link = GetItemInfo(itemID)` |
| 881 | `isItemDataReady` 回退判存 | `return GetItemInfo(itemID) ~= nil` |
| 940 | `getItemBasics` 首调 | `local name, _, _, ilvl, ... = GetItemInfo(itemID)` |
| 943 | `getItemBasics` 重试 | `name, _, _, ilvl, ... = GetItemInfo(itemID)` |

**注释中出现的 `GetItemInfo`**（行 23/28/235/293/391/742/856/872/874/935）——只改代码，不改注释（注释留作历史记录）。

---

## 三、修复方案

### 3.1 适配函数（新增）

在 `WoWButlerExporter.lua` 文件头部（`ADDON_VERSION` 之后、`ejAvailable` 之前）新增：

```lua
-- 12.1.5 兼容性适配：GetItemInfo 在 12.1.5 中被移除，C_Item.GetItemInfo 返回同样的 18 个值
local function safeGetItemInfo(itemID)
  if C_Item and type(C_Item.GetItemInfo) == "function" then
    return C_Item.GetItemInfo(itemID)
  elseif type(GetItemInfo) == "function" then
    return GetItemInfo(itemID)
  end
  return nil
end
```

### 3.2 调用点替换（4处）

| 行号 | 替换前 | 替换后 |
|------|--------|--------|
| 394 | `local _, link = GetItemInfo(itemID)` | `local _, link = safeGetItemInfo(itemID)` |
| 881 | `return GetItemInfo(itemID) ~= nil` | `return safeGetItemInfo(itemID) ~= nil` |
| 940 | `local name, _, _, ilvl, ... = GetItemInfo(itemID)` | `local name, _, _, ilvl, ... = safeGetItemInfo(itemID)` |
| 943 | `name, _, _, ilvl, ... = GetItemInfo(itemID)` | `name, _, _, ilvl, ... = safeGetItemInfo(itemID)` |

### 3.3 版本号更新

```lua
local ADDON_VERSION = "1.0.28"
```

---

## 四、验证清单

| # | 检查项 | 通过标准 | 负责人 |
|---|--------|----------|--------|
| 1 | `/wjdc probe 6948` | 不报错，输出物品信息 | 运营（真机） |
| 2 | `/wjdc raid` | 基希克斯破封有掉落（>0 件） | 运营（真机） |
| 3 | `/wjdc all` | 全部团本+大米正常扫描 | 运营（真机） |
| 4 | 旧客户端兼容 | 12.1.0 客户端 `GetItemInfo` 仍可用 | 运营（如有条件） |
| 5 | 导出文件 | SavedVariables 有完整数据 | 运营（真机） |

---

## 五、执行步骤（Code 做）

1. 在 `WoWButlerExporter.lua` 头部插入 `safeGetItemInfo` 适配函数
2. 替换 4 处 `GetItemInfo` 调用为 `safeGetItemInfo`
3. `ADDON_VERSION` 改为 `"1.0.28"`
4. `.toc` 文件 `## Version` 同步改为 `1.0.28`
5. 交付运营真机测试

---

## 六、红线

1. **只改 4 处调用 + 新增 1 个适配函数**，不动其他逻辑
2. **向后兼容**：`safeGetItemInfo` 优先 `C_Item.GetItemInfo`，回退 `GetItemInfo`
3. **注释不改**：保留历史注释，新增注释说明 12.1.5 适配
4. **版本号必 bump**：1.0.27 → 1.0.28

---

## 七、后续

修复后运营真机测试 → `/wjdc all` 扫基希克斯破封 → 发 SavedVariables 文件 → 我解析生成 SQL → Code 入库 → 公示页可见。
