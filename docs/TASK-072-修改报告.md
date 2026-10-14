# TASK-072 修改报告：WCL 团本中文映射

**日期**：2026-10-14　**类型**：前端补丁（零数据库零后端）　**状态**：✅ 验证通过，待运营终审

## 一、改动点（仅 js/app.js + 三壳版本串）

1. **字典与兜底函数**（app.js 任务书 #72 区块）：
   - `WCL_ZONE_NAMES`：**28 个团本映射**（验收≥10 达标），覆盖 5.x~12.x 全资料片。英文键实测自 WCL `worldData.expansions.zones`（2026-10-14 实测拉取，非凭记忆）；12.x 中文取项目实证译名（虚影尖塔·梦境裂隙·进军奎尔丹纳斯 / 孢陨幽境 / 烈毒之渊 / 潮缚石窟），历史团本取国服官方译名
   - `getZoneName(zoneNameEn, fallback)`：字典未收录 → 回退英文原名 → 再空「未知团本」
   - **口径偏差说明**：任务书原案按 zone.id 键控；zone.id 需改 server.js 的 GraphQL 查询才下发前端，本批红线「不改 server.js / 不改 WCL API 调用逻辑」，故改按英文 zone name 键控（WCL zone 名稳定唯一，效果等价），zone.id 留在字典注释备查
2. **三个显示点统一走 getZoneName**：
   - ① 考勤页新报告 banner 条目（`wclRenderNewReportsBanner`）
   - ② 「创建活动并关联」预填团本名（`wclCreateActivityFromReport`）
   - ③ 团本速览看板标题改「日期 + 中文团本名」（报告原标题挪副行保留，`renderWclRaidBoard`）
   - **偏差说明**：任务书步骤②的「自动创建活动名」发生在服务端 sweep（server.js），红线不改后端，故服务端自动创建的活动 raid 仍为英文原名；前端侧三个用户可见点已全部中文化。如需服务端同步中文，建议下批把字典下沉到 server.js 共用
3. **版本串**：20261014.91 → **20261014.92**，三壳同步（index 15 / data 8 / decor 5，grep 旧串零残留）
4. **changelog**：四维「功能优化」补录

## 二、验证结果

- `node --check js/app.js` 过
- **真浏览器回归** `node scripts/verify-task70-browser.js`：**14/14 通过**（截图 backup/2026-10-14-task70-wp1/）
  - 验收3 banner 中文：截图 04 实测「10月3日 翡翠梦魇」× 3 条 ✓
  - 验收4 看板中文：截图 06 实测「📊 团本速览 — 10月03日 翡翠梦魇」（报告原标题「h萨维斯开荒」在副行）✓
  - 验收2 当前赛季：12.x 四本 + S2 两本（烈毒之渊/潮缚石窟）均在字典 ✓
  - 验收1 字典 28 条 ≥10 ✓
  - 验收5 兜底：`getZoneName` 未收录键回退英文原名（单行逻辑，字典外 zone 如 Mythic+ Season 系列走此路径）✓
  - 验收6 版本串三壳 .92 零 .91 残留 ✓
  - 异常面：零 console error、零 4xx/5xx（除已知 user_profiles 409 白名单）

## 三、遗留

- 服务端 sweep 自动创建的活动 raid 仍为英文（红线所致，见上偏差说明）
- 大米（Mythic+ Season 区）未入字典——任务书口径为团本；若公会绑定的 WCL 报告含大米记录，banner 显示英文原名（兜底正常）
- git 未提交，待终审
