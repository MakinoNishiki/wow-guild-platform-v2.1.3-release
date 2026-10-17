# 任务书 #76

**项目**：魔兽管家（WoW Butler）
**任务名称**：decor_catalog 12.1.5 新增家具入库
**类型**：数据入库（PostgREST 批量 upsert）
**优先级**：T2（当前最高优先级）
**关联**：#76 数据录入、WoWButlerDecor v0.2.0
**数据库**：自建 Supabase 实例

---

## 防失忆自检

1. 当前版本串？→ 20261015.97
2. 入库谁跑？→ **Code 负责全部入库，运营不碰数据库**
3. 当前第一任务？→ #76 decor 新增家具入库

---

## 一、任务概述

WoWButlerDecor v0.2.0 扫描完成 2313 件家宅装饰，对比数据库现有 2062 件，新增 **252 条**（12.1.5 新增家具）。

**执行人**：Code（PostgREST 批量 upsert，service_role key）
**运营**：提供扫描文件 + 验收结果

---

## 二、数据文件

**文件**：`data/decor-catalog-12.1.5-new-items.json`

**格式**：JSON 数组，每条记录包含 decor_catalog 全字段：
```json
{
  "record_id": 30255,
  "entry_type": 1,
  "item_id": 285179,
  "name": "仪式安波里拱门",
  "icon_file_id": 8345355,
  "asset_id": 8344060,
  "model_scene_id": 1337,
  "quality": 2,
  "size": 69,
  "placement_cost": 5,
  "category_ids": [2],
  "subcategory_ids": [9],
  "source_text": "...",
  "tags": {"89": "德莱尼", "69": "超大", "104": "德拉诺之王"},
  "indoors": true,
  "outdoors": true,
  "can_customize": false,
  "first_acquisition_bonus": 0,
  "client_version": "12.1.5",
  "run_id": "20261017-...",
  "collected_at": "2026-10-17T...",
  "sources": []
}
```

**数量**：252 条

---

## 三、入库方式（Code 执行）

### 3.1 PostgREST 批量 upsert

**API**：`POST /rest/v1/decor_catalog?on_conflict=record_id`

**Headers**：
```
apikey: <service_role_key>
Content-Type: application/json
Prefer: resolution=merge-duplicates,return=representation
```

**Body**：JSON 数组（全部 252 条一次性发送）

**效果**：
- 新 record_id → INSERT
- 已存在 record_id → UPDATE（merge-duplicates）
- 幂等：重复执行不翻倍

### 3.2 执行脚本（参考）

```javascript
// scripts/import-decor-batch.js
const fs = require('fs');

const data = JSON.parse(fs.readFileSync('data/decor-catalog-12.1.5-new-items.json', 'utf8'));

async function importBatch() {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/decor_catalog?on_conflict=record_id`, {
        method: 'POST',
        headers: {
            'apikey': SERVICE_ROLE_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify(data)
    });
    
    const result = await response.json();
    console.log(`Inserted/Updated: ${result.length} rows`);
}

importBatch();
```

### 3.3 注意事项

- `service_role_key` 从环境变量读取（`SUPABASE_SERVICE_ROLE_KEY`）
- 不硬编码密钥到脚本
- 执行前查当前 `COUNT(*)` 作为基线
- 执行后查 `COUNT(*)` 验证增长

---

## 四、验证清单

| # | 检查项 | 通过标准 | 负责人 |
|---|--------|----------|--------|
| 1 | 基线计数 | 执行前 decor_catalog COUNT = 2062 | Code |
| 2 | 批量入库 | POST 成功，返回 252 条 | Code |
| 3 | 增长验证 | 执行后 COUNT = 2314（2062+252） | Code |
| 4 | 幂等测试 | 重复执行不翻倍 | Code |
| 5 | 数据抽查 | 抽查 3 条记录字段完整 | Code |
| 6 | 公示页 | decor.html 新家具可见 | 运营 |

---

## 五、红线

1. **Code 负责全部入库**：运营不执行 SQL，不碰数据库
2. **密钥不进脚本**：service_role_key 从环境变量读取
3. **先查证再断言**：执行前后必须 COUNT 验证
4. **幂等护栏**：`on_conflict=record_id` 必带

---

## 六、Exporter 修 bug（另出任务书，不阻塞本批）

Exporter 1.0.27 在 12.1.5 上完全崩（所有装备 nil value，基希克斯破封 0 件）。修复兼容性 bug 后另扫，届时再出 #77 任务书。

本批只处理 decor 252 条，不等待 Exporter。
