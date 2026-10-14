# 任务书 #72

**项目**：魔兽管家（WoW Butler）
**任务名称**：WCL 团本中文映射
**类型**：前端补丁（零数据库改动）
**优先级**：P1
**关联**：#70 WP1（WCL 公会绑定与报告同步）
**前置依赖**：#70 WP1 已开核通过
**版本串**：20261014.92（补丁 bump，三壳同步）
**数据库**：无

---

## 一、问题

WCL API 返回的团本名称是英文原文（如 "Nerub-ar Palace"），而管家用户是国服玩家，页面上显示英文团本名体验不友好。

**当前受影响的位置：**
- 考勤页 WCL 同步 banner：「检测到 WCL 新报告：[英文团本名]」
- 活动卡片/弹窗：自动创建的活动中团本名为英文
- 简化看板：首领列表上方的团本标题为英文

---

## 二、方案：前端字典 + Code 实测产出

### 2.1 为什么不用数据库表

| 维度 | 前端字典 | 数据库表 |
|------|---------|---------|
| 团本数量 | 约 20-30 个（历史累计） | 同 |
| 更新频率 | 一年 2-3 个新团本 | 同 |
| 实现成本 | 极低（改 app.js） | 需建表 + API + 后端查询 |
| 维护成本 | 发版时顺手加 key-value | 需运营后台维护 |

**结论**：前端硬编码字典足够，不引入数据库表。

### 2.2 Code 实测产出完整字典

Code 按以下步骤产出 `WCL_ZONE_NAMES`：

**步骤 1：抓取 zone 列表**

调 WCL GraphQL 获取已绑定的 WCL 公会所有报告涉及的 zone：

```graphql
query {
  reportData {
    reports(guildID: 766716) {
      data {
        zone { id name }
      }
    }
  }
}
```

**步骤 2：抓取更多历史团本**

如果当前公会报告太少，用以下方式补充历史团本 zone：

```graphql
query {
  worldData {
    expansions {
      id
      name
      zones {
        id
        name
      }
    }
  }
}
```

**步骤 3：对照中文官方译名**

- WCL 网站切换语言为「简体中文」
- 或查 Wowhead CN 对应副本页面
- 记录每个 `zone.id` → `中文译名`

**步骤 4：输出字典**

在 app.js 中添加：

```javascript
const WCL_ZONE_NAMES = {
  // Code 实测产出，示例格式：
  // 38: "尼鲁巴尔王宫",
  // 39: "解放安德麦",
  // ... 其余 zone.id: "中文译名"
};

function getZoneName(zoneId, fallback) {
  return WCL_ZONE_NAMES[zoneId] || fallback || "未知团本";
}
```

**兜底策略：**
- `zone.id` 不在字典中 → 显示英文原名（`fallback`，即 WCL 返回的 `zone.name`）
- `zone.id` 为 null/undefined → 显示 "未知团本"
- 后续新团本 → 发版时补丁追加字典条目

---

## 三、集成点（改 app.js）

以下 3 个显示点统一走 `getZoneName(zone.id, zone.name)`：

### 3.1 考勤页 banner

```javascript
const zoneName = getZoneName(report.zone.id, report.zone.name);
// banner 文案：「检测到 WCL 新报告：10月14日 尼鲁巴尔王宫 史诗」
```

### 3.2 自动创建活动

```javascript
const zoneName = getZoneName(report.zone.id, report.zone.name);
const eventName = `${dateStr} ${zoneName} ${difficultyText}`;
// 例：「10月14日 尼鲁巴尔王宫 史诗」
```

### 3.3 简化看板

```javascript
const zoneName = getZoneName(report.zone.id, report.zone.name);
// 「📊 团本速览 — 10月14日 尼鲁巴尔王宫 史诗」
```

---

## 四、版本串

本次改 app.js，版本串 bump：
- 20261014.91 → **20261014.92**
- 三壳同步：index.html / decor.html / data.html 全部更新 .92

---

## 五、验证清单

| # | 检查项 | 通过标准 |
|---|--------|----------|
| 1 | 字典产出 | app.js 中 `WCL_ZONE_NAMES` 对象包含 ≥10 个 zone.id 映射 |
| 2 | 当前赛季团本 | 当前活跃团本（如尼鲁巴尔王宫、解放安德麦）有中文映射 |
| 3 | banner 中文 | 同步 WCL 报告后 banner 显示中文团本名 |
| 4 | 看板中文 | 简化看板标题显示中文团本名 |
| 5 | 兜底生效 | zone_id 不在字典中时显示英文原名 |
| 6 | 版本串 | 三壳全部 .92，零个 .91 残留 |

---

## 六、红线

- 不改数据库
- 不改 server.js
- 不改 WCL API 调用逻辑
- 只改前端显示层（把英文 zone.name 换成中文）
- 字典由 Code 实测产出，不凭顾问记忆硬编码
