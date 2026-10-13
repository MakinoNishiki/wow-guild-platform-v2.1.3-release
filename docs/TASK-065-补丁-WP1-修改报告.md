# 任务书 #65-补丁 WP1 修改报告：套装表单主属性动态联动

> 日期：2026-10-13 ｜ 执行：Kimi Code ｜ 范围：WP1 纯前端补丁（WP2 插件扩展不在本批）
> 验证：`scripts/verify-task65-patch.js` **28/28 全绿**（A 静态 14 + B 浏览器 13 + C 清零 1），退出码 0
> 版本串：三壳 `20261013.88` → `20261013.89`（index 15 处 / data 8 处 / decor 5 处，旧串零残留）

---

## 一、修改前输出（规范 3.1）

| 文件 | 位置 | 原因 | 影响与风险 |
|---|---|---|---|
| js/app.js | 套装快捷录入区（TIER_SLOT_SUFFIX 起）+ lootUpdateBossOptions / wishlistOnRaidChange 尾部 + changelogData 首条 | WP1.1 主属性联动、WP1.2 首领锁定、WP1.3 副属性占位 | 仅套装模式新行为；普通模式路径只新增两处 rearm 空操作守卫 |
| index.html | lootModal 首领组 / 副属性组、wishlistModal 首领组 | 三条提示元素（默认隐藏） | 普通模式 display:none 零视觉变化 |
| index/data/decor.html | 版本串注释 + `?v=` | 任务书红线：共享资源改动三壳同步 | 缓存失效语义不变 |
| docs/问题与需求清单.md | REQ-159 登记 | 编号纪律 | — |
| AGENTS.md | 功能模块 7 装备分配 REQ-158 行末 | 文档同步纪律 | — |
| scripts/verify-task65-patch.js | 新建 | 验收自动化 | — |

## 二、实际改动点

### 1.1 主属性联动（REQ-159）
- 新增 `CLASS_SPEC_PRIMARY_STAT`（13 职业全量，`'*'` 为职业级默认；含任务书修正值：圣骑士·神圣=智力、德鲁伊·守护=敏捷、恶魔猎手·噬灭=智力）+ `getPrimaryStat(className, specName)`（专精精确→职业默认→力量 三级兜底）。
- `tierPrimaryStatSync(scope)` 挂入 `tierSetSpecChange` 尾部：选职业不动（等专精），选专精即更新；心愿单弹窗无主属性字段（数据模型无此列），`primaryId=''` 天然跳过。
- 套装模式下 `lootPrimaryStat` 下拉 `disabled` 锁定禁手改（disabled 不影响 `lootSave` 的 JS 读值链路，已实测入库值正确）。

### 1.2 首领掉落锁定
- `tierFieldLock(scope, lock)`：首领控件（loot：`lootBoss`+自定义输入形态 `lootBossCustom`；wishlist：`wishlistBoss`+`wishlistBossText`）disabled + **清空值**（防锁定态残留默认首 BOSS 随保存入库）+ 提示显隐。
- 接入点：`tierSetMode`（进套装锁 / 回普通解锁）、`tierSetReset`（弹窗复开保证无残留禁用态）。
- `tierBossRearm(scope)` 后援：套装模式下切换团本会重建 BOSS 下拉（首项自动选中），重建后重新锁定+清空，防脏值回填；挂在 `lootUpdateBossOptions` / `wishlistOnRaidChange` 尾部，普通模式零操作。
- 提示文案：「套装由兑换物兑换，首领待插件导出后匹配」（复用 `.special-effect-hint` 样式，main.css 零改动）。

### 1.3 副属性占位
- 交互零改动；套装模式下副属性区显示占位提示「副属性待插件导出后自动填充，当前可手动选择」（`#lootTierSecHint`）。心愿单无副属性字段，不适用。

### 1.4 心愿单同步
- 首领锁定 + 提示同步生效（`#wishlistTierBossHint`）；主属性/副属性联动不适用（无字段，如实申报，未擅自加字段）。

### 其他
- changelog 四维补录：`v3.2.0-task65-patch-primary-stat`（问题修复类）置顶。
- 版本串三壳 `.89`，`node --check` 全量通过。

## 三、验证方式（交付红线：主链路真浏览器实测）

`node scripts/verify-task65-patch.js`（自起 server :15668 + Playwright + 真实 Supabase 测试账号，跑完清零）：

- **A 静态 14/14**：映射表 eval 抽验 26 个职业·专精组合逐值命中 + 双兜底；挂钩/锁函数/提示元素锚点；版本串 15/8/5 + 旧串零残留；node --check 全量。
- **B1 主属性矩阵 8/8**（页面=装备分配-添加装备弹窗，操作=套装模式→选职业→选专精）：死亡骑士·鲜血=力量、圣骑士·神圣=智力→同弹窗切惩戒=力量（实时更新不重开）、德鲁伊·平衡/野性/守护=智力/敏捷/敏捷、恶魔猎手·噬灭/浩劫=智力/敏捷。
- **B2 锁定三态**：套装模式主属性 disabled + 首领 disabled 且值为空 + 两提示显示；切团本重建后仍锁定仍空值（rearm 生效）。
- **B4 套装保存主链路**：死亡骑士·鲜血→头部→保存→`loot_records` 落行「灾厄墓骑的熔炉 头盔」、`boss_name=null`（固定值病灶根除）、`item_stats.primaryStat='力量'`。
- **B3 普通模式回归**：全解锁+提示隐藏；手动选 BOSS「盘魂者内克扎莉」保存→`boss_name` 随选入库（正常模式首领可用）。
- **B5 心愿单同步**：套装模式首领下拉+自定义输入双禁用+提示显示，回普通全解锁。
- **B6 全程零 TypeError / console 零报错**（白名单：图标素材 404 在案、409 设计内、tier_set_pieces 404 迁移窗口）。
- **C 清零复核**：测试装备/公会/账号全删复核为零。

任务书 WP1 验收清单逐项对照：13 条全过（映射 8 项 = B1+A1c 双覆盖，实时切换 = B1，首领禁用 = B2a/B5a，普通模式正常 = B3，心愿单同步 = B5，console 零报错 = B6）。

## 四、遗留与申报

1. **心愿单弹窗无主属性/副属性字段**：WP1.4「同步」实际落点 = 首领锁定+提示；主属性联动对心愿单不适用（数据模型无列），未擅自扩字段。
2. **映射表与 WP2 插件 Lua 常量一致性**：任务书红线要求两份完全一致——WP2 施工时以 `CLASS_SPEC_PRIMARY_STAT`（app.js 套装区）为唯一对照源。
3. 副属性动态填充、首领自动匹配均为 WP2 范围，本批不动。
4. 映射表若与游戏实际不符（任务书红线）：先报运营定夺，当前表完全按任务书 1.1 原文落地。
