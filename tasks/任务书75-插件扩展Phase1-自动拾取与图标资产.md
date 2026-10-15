# 任务书 #75

**项目**：魔兽管家（WoW Butler）
**任务名称**：插件扩展 Phase 1 —— 自动拾取记录 + 图标资产入库
**类型**：前端代码 + 数据库 + 插件 Lua
**优先级**：T2（#74 完成后当前最高优先级）
**关联**：REQ-157（S2 补录，已完成）、#65（WoWButlerCollector）、#67（图标资产）
**版本串**：本次涉及前端代码变更，需 bump 版本串（三壳同步）
**数据库**：自建 Supabase 实例

---

## 防失忆自检

1. decor_catalog 在哪？→ Supabase decor_catalog 表（2062 行）
2. 当前版本串？→ 20261014.95
3. 当前第一任务？→ #75 插件扩展 Phase 1

---

## 一、任务概述

本任务为插件扩展第一阶段，包含两个可并行的子任务：

| 子任务 | 内容 | 产出物 | 执行顺序 |
|--------|------|--------|----------|
| A | 自动拾取记录（WoWButlerCollector） | Lua 插件 + 前端导入页 | 先 A 后 B（A 产出的数据格式是 B 的输入） |
| B | 图标资产入库 | 数据库 icon 表 + 前端图标渲染 | A 完成后或并行 |

---

## 二、子任务 A：自动拾取记录（WoWButlerCollector）

### 2.1 背景

当前拾取记录依赖手动录入或批量导入，操作成本高。目标：开发一个轻量级 WoW 插件，在玩家获得装备/物品时自动捕获关键信息，导出为 JSON/CSV，供前端一键导入。

### 2.2 插件功能规格

**触发时机**：
- `LOOT_READY` / `CHAT_MSG_LOOT` 事件
- 仅捕获团队副本 / 大秘境 / 世界BOSS 掉落（排除垃圾、金币、材料）

**捕获字段**：

| 字段 | 来源 | 说明 |
|------|------|------|
| itemName | `GetItemInfo(itemID)` | 物品名称 |
| itemID | `itemLink` 解析 | official_item_id |
| quality | `GetItemQualityByID` | 品质（史诗/传说等） |
| ilvl | `GetDetailedItemLevelInfo` | 实际装等 |
| slot | `GetItemInventoryType` | 装备部位 |
| itemType | `GetItemClassInfo` | 护甲/武器/饰品等 |
| bossName | `UnitName("target")` 或 API | 掉落首领 |
| instanceName | `GetInstanceInfo()` | 副本名称 |
| difficulty | `GetDifficultyInfo` | 难度（普通/英雄/史诗） |
| timestamp | `time()` | 拾取时间 |
| playerName | `UnitName("player")` | 拾取者（公会场景） |

**导出格式**（JSON 数组）：

```json
[
  {
    "itemName": "罪炽连发枪",
    "itemID": 271680,
    "quality": 4,
    "ilvl": 292,
    "slot": "远程",
    "itemType": "枪械",
    "bossName": "咬咬",
    "instanceName": "闸板陋巷",
    "difficulty": 8,
    "timestamp": 1728931200,
    "playerName": "玩家名"
  }
]
```

**文件输出**：
- 路径：`WTF\Account\<账号>\SavedVariables\WoWButlerCollector.lua`
- 格式：JSON 数组，追加写入
- 命令：`/wbc export` 生成导出文件到 `WoWButlerCollector_YYYYMMDD.json`

### 2.3 前端导入页

**新增页面/功能**：
- 在「副本掉落」或「装备管理」模块新增「导入拾取」按钮
- 支持拖放 JSON 文件或粘贴 JSON 文本
- 导入预览：展示待入库列表（名称/装等/部位/来源），支持勾选/取消
- 入库逻辑：
  - 先查 `official_item_id` 是否已存在（去重）
  - 新件 → `cloudCrud('dungeon_loot'/'boss_loot', 'POST', data)`
  - 存量 → 提示"已存在，是否更新装等？"（可选）

**接口**：
- 复用现有 `cloudCrud()`，无需新 API
- 批量插入建议用 PostgREST `POST /rest/v1/dungeon_loot` 数组格式

### 2.4 文件清单

```
plugins/WoWButlerCollector/
├── WoWButlerCollector.toc
├── core.lua          # 主逻辑：事件监听、数据捕获
├── export.lua        # 导出逻辑
└── locales/
    └── zhCN.lua      # 简体中文本地化

前端变更：
├── js/app.js         # 新增导入按钮 + 导入弹窗
├── css/style.css     # 导入弹窗样式（WoW 主题）
└── index.html        # 版本串 bump
```

---

## 三、子任务 B：图标资产入库（#67）

### 3.1 背景

当前公示页和装备卡片缺少图标展示，视觉体验差。目标：建立 `item_icons` 表，存储 icon_id → 图标 URL 的映射，前端按需渲染。

### 3.2 数据库变更

**新建表 `item_icons`**：

```sql
CREATE TABLE IF NOT EXISTS item_icons (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    icon_id INTEGER NOT NULL UNIQUE,
    icon_name TEXT,
    icon_url TEXT NOT NULL,
    source TEXT DEFAULT 'wowdb',  -- wowdb / blizzard_api / local
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE item_icons IS '装备图标资产表';
```

**初始数据**：
- 从现有 `boss_loot` + `dungeon_loot` 提取所有 `icon_id`（去重）
- 批量插入 icon URL（格式：`https://wow.zamimg.com/images/wow/icons/large/<icon_name>.jpg`）
- 首次入库约 600-800 个 icon_id

**查询接口**：
- PostgREST: `GET /rest/v1/item_icons?icon_id=eq.7672957`
- 或前端批量查询：`GET /rest/v1/item_icons?icon_id=in.(7672957,7674304,...)`

### 3.3 前端渲染

**装备卡片加图标**：
- `boss_loot` / `dungeon_loot` 查询时 JOIN `item_icons`（或通过 icon_id 关联）
- 卡片左上角或名称前显示图标 `<img src="icon_url" class="item-icon">`
- 加载失败 fallback：显示默认问号图标

**CSS 规格**（遵守深色 WoW 主题）：

```css
.item-icon {
    width: 36px;
    height: 36px;
    border: 2px solid var(--wow-gold);
    border-radius: 4px;
    background: var(--wow-dark);
    object-fit: contain;
}
```

### 3.4 文件清单

```
sql/39-item-icons-table.sql    # 建表 + 初始数据 INSERT
前端变更：
├── js/app.js                  # 查询时 JOIN item_icons / 图标渲染
├── js/dataPublic.js           # 公示页同步加图标
├── css/style.css              # item-icon 样式
└── index.html / data.html     # 版本串 bump
```

---

## 四、执行顺序与依赖

```
Day 1（今天）
├── A1: WoWButlerCollector 插件开发（Lua）
│   ├── core.lua 事件监听 + 数据捕获
│   └── export.lua 导出逻辑
├── A2: 本地游戏测试（/reload → 打本 → /wbc export → 验证 JSON）
└── B1: sql/39 建表 + 初始 icon 数据入库

Day 2
├── A3: 前端导入页开发（拖放 JSON → 预览 → 入库）
├── B2: 前端装备卡片加图标渲染
└── 联调测试（插件导出 → 前端导入 → 公示页可见）

Day 3
├── 验收用例执行
├── 版本串 bump + push
└── 开核
```

---

## 五、验证清单

### 5.1 子任务 A 验证

| # | 检查项 | 通过标准 |
|---|--------|----------|
| 1 | 插件加载 | `/wbc` 命令可用，无 Lua 报错 |
| 2 | 事件捕获 | 获得装备时 `core.lua` 正确记录 |
| 3 | 导出文件 | `/wbc export` 生成 JSON，格式正确 |
| 4 | 前端导入 | 拖放 JSON → 预览列表 → 入库成功 |
| 5 | 去重逻辑 | 重复 official_item_id 不重复插入 |
| 6 | 公示页 | 新导入装备在 data.html 可见 |

### 5.2 子任务 B 验证

| # | 检查项 | 通过标准 |
|---|--------|----------|
| 1 | item_icons 表 | `\dt item_icons` 存在，icon_id UNIQUE |
| 2 | 初始数据 | SELECT COUNT(*) 与 boss+dungeon 去重 icon_id 一致 |
| 3 | 前端图标 | 装备卡片显示图标，无 404 |
| 4 | fallback | 图标加载失败显示默认占位图 |
| 5 | 公示页 | data.html 装备同步显示图标 |

---

## 六、红线

1. **DB-first**：所有入库走 `cloudCrud()` → Supabase → reload → 缓存 → render
2. **零依赖**：前端不引入新库；插件纯原生 Lua，不用 Ace3 等框架
3. **版本串**：前端代码变更必 bump 三壳（index.html / data.html / decor.html）
4. **插件安全**：Lua 代码不调用 `SendAddonMessage` 等网络 API，纯本地文件输出
5. **密钥**：service_role / anon key 永不进 git/插件代码/文档
6. **先查证再断言**：icon 数量、入库行数等必须实际查询后报告

---

## 七、备注

- **至暗之夜世界BOSS**：用户明确裁定不录入，world_boss_loot 后续补录排除该BOSS
- **icon 来源**：首选用 WoWDB CDN（`wow.zamimg.com`），备选 Blizzard API（需申请 key）
- **插件兼容性**：支持国服客户端 12.1.5，不保证怀旧服兼容
