# S2-装等批次 子批A（DB+web）修改报告

> 日期：2026-08-16 ｜ 范围：sql/25 至暗回滚 + sql/26 装等列与静态表 + sql/27 数值同档订正（BUG-101，增补并入）+ 公示页/数据中心 ilvl 前端 + 台账/changelog/版本串
> 纪律：本批未 commit（送审纪律：运营验收通过前不提交）；git 提交由运营执行，sql/24_s2_loot_import.sql 随本 commit 一并入仓（工具件口径，A4）
> 增补沿革：本报告先以 sql/25+26 送审，运营暂停送审指示并入 sql/27「数值同档订正」（BUG-101，P1）后重送——本版即并入版

---

## 一、编号申报（撞号声明，先行报备）

任务书指定「sql/25=至暗回滚、sql/26=装等列」，但仓库既有 `sql/25_task029_wp1_user_profiles_tag_num.sql` 与 `sql/26_req110_venomcurse.sql` 已在号。按 S2 批次自带序号先例（`24_s2_loot_import.sql` 与 `24_bug062_world_boss_type.sql` 并立在案），本批文件以**后缀区分、不覆盖既有文件**：

- `sql/25_s2_darknight_rollback.sql`（至暗回滚）
- `sql/26_s2_ilvl.sql`（装等列+静态表）
- `sql/27_s2_stat_tier_fix.sql`（BUG-101 数值同档订正，增补并入；与既有 `sql/27_task042_user_profiles_preferences.sql` 撞号，同一后缀先例处理）

如运营要求改用 30/31 之外的全局新序号，文件名级调整随验收意见一次改。

## 二、A1：sql/25 至暗之夜回滚（已执行，全绿）

运营终裁维持「世界BOSS掉落不入库」口径，推翻 sql/24 中至暗相关改动。

- **备份（双份，回滚依仗）**，落 `backup/2026-08-16-sql25/`：
  - 四表全量 pg_dump `backup_before_sql25_20260816.sql`（259,121 字节，COPY 段×4 齐全，执行前验证非空）；
  - 行级备份 `zidian_boss_loot_rows_20260816.json`（至暗 32 行全列原值含 id，可原样回插）+ `zidian_game_raids_row_20260816.json`。
- **执行输出原文**（单事务，零 ERROR/ROLLBACK）：
  ```
  BEGIN / DELETE 32 / UPDATE 1 / NOTIFY / COMMIT
  ```
- **执行后复核（四组全符）**：
  - 至暗 boss_loot = **0 行** ✅（删除前按 BOSS 分组预核对：克拉格平/普雷达萨斯/索姆贝兰/鲁阿夏尔 各 8）；
  - 行数：boss_loot 301→**269** ✅、dungeon_loot **428 不动** ✅、game_bosses 80 / game_raids 7 不动（维度行保留，至暗 4 BOSS 行仍在）✅；
  - game_raids 至暗之夜 = `world | S1`（season 回挂 S1，恢复 08-06 原状；type 不动）✅；
  - 公示页当前赛季件数 **320 不变** ✅（至暗 type=world 本就被 RPC 黑名单剔除，视觉零变化）。

## 三、A2：sql/26 装等列+静态表（已执行，全绿）

### 硬门：UPDATE 前 dry-run 位次映射（已通过才执行）

`game_bosses.boss_order` 即为位次唯一依据（公开 RPC 排序同键）。dry-run 原文：

| 位次 | BOSS | 件数 | → ilvl |
|---|---|---|---|
| 1 | 盘魂者内克扎莉 | 13 | 318 |
| 2 | 陵寝哨兵 | 12 | 321 |
| 3 | 迷失的探险者 | 13 | 321 |
| 4 | 万毒邪祟者瓦什尼克 | 12 | 324 |
| 5 | 斯索拉克 | 12 | 324 |
| 6 | 双子毒牙 | 12 | 324 |
| 7 | 盘卷祭坛 | 14 | **344（锚点✅）** |
| 8 | 乌拉特克 | 13 | **344（锚点✅）** |

锚点 7号盘卷祭坛/8号乌拉特克 对得上 344，硬门通过。

### 执行输出原文（单事务，零 ERROR/ROLLBACK）

```
BEGIN / ALTER TABLE ×2 / COMMENT ×2 /
UPDATE 13 / UPDATE 25 / UPDATE 36 / UPDATE 27 / UPDATE 12 / UPDATE 207 /
CREATE FUNCTION / REVOKE / GRANT / NOTIFY ×2 / COMMIT
```

UPDATE 序列与期望（烈毒 13/25/36/27 + 潮缚 12 + 大米 207）**逐一精确吻合**。

### 执行后复核（五组全符）

1. 两表 ilvl 列在场（integer 可空）✅；
2. 烈毒 ilvl 分布 318×13 / 321×25 / 324×36 / 344×27，分 BOSS 明细与 dry-run 映射一一对应 ✅；潮缚 318×12 ✅；
3. S1 团本行 ilvl 非空 = **0**（全 NULL 不回填）✅；
4. S2 大米八本 ilvl=311 逐本：塞塔里斯神庙 34/夺目谷 26/密谋小径 25/毒牙祭坛 24/红玉新生法池 20/纳洛拉克的洞穴 22/虚空之痕竞技场 22/诸王之眠 34（合计 207）✅；S1 大米行非空 = 0 ✅；
5. RPC `get_public_loot_detail` 白名单透出 ilvl：当前赛季 total/has_key/non_null = **320/320/320** ✅；RPC 全量 628 行（与执行前一致，零漂移）。

备份：`backup/2026-08-16-sql26/backup_before_sql26_20260816.sql`（250,424 字节，COPY×4）。

###  RPC 白名单改动申报

A3 公示页「物品等级 X」渲染依赖 RPC 透出，而 `get_public_loot_detail` 为显式字段白名单（非 SELECT *），故 sql/26 含 `CREATE OR REPLACE` 两分支各加一行 `'ilvl', bl.ilvl / dl.ilvl`。**函数体其余部分与 sql/29（icon_id 版，现网口径）逐字一致**——已用脚本逐行 diff 实证：除新增两行 ilvl 外零差异（杂项/装饰品/幻化排除、world 黑名单、lair 保留全不动）。

## 四、A2b：sql/27 数值同档订正（BUG-101，增补并入，已执行全绿）

背景：运营截图+顾问 RPC 实证，卡片属性 chips 写的是导出件 primary_values/secondary_values（裸基底 219 级模板值），正确史诗档值在同行 primary_tiers->'mythic' / secondary_tiers->'mythic' 里——装等 318 配基底 65=运营明令禁止的 Frankenstein 态（亦违反 A3 注释钉死的同档绑定前提）。

文件：`sql/27_s2_stat_tier_fix.sql`（含回滚注释段、跳过清单、复核 SQL 注释）。内容=四条 UPDATE（boss_loot/dungeon_loot × 主/副属性）：`*_values ← *_tiers->'mythic'`，WHERE 条件=mythic 键存在，范围仅 S2（烈毒之渊/潮缚石窟/S2 大米八本）；**S1 行不动**（dry-run 实证 S1 全库含 mythic 键行数=0/0，无档可回填，随批报备运营裁）；effect/venomcurse/ilvl 字段零触碰、前端零改动。

### dry-run 侦察（执行前，对账精确吻合）

四条 UPDATE 预期行数：boss_loot 主 80/副 83 + dungeon_loot 主 181/副 173 = **主 261/副 256**，与任务书预期（261/256）精确吻合。锚点预核（订正前均为裸基底 65 级模板值，Frankenstein 态实证）：觉醒外衣 mythic=敏捷162/智力162/急速130/精通58 ✅、觉醒恐牙胸甲 mythic=敏捷207/智力207/爆击209 ✅。

### 执行输出原文（单事务，零 ERROR/ROLLBACK）

```
BEGIN / UPDATE 80 / UPDATE 83 / UPDATE 181 / UPDATE 173 / NOTIFY / COMMIT
```

### 执行后硬门验证（全过）

- 觉醒外衣=敏捷162/智力162/急速130/精通58 ✅；觉醒恐牙胸甲=敏捷207/智力207/爆击209 ✅；
- 大米任抽三件贴值均已换 mythic 档（报告留档执行器输出）✅；
- 271876 行 effect 全文/venomcurse='毒咒'/ilvl=344 复核零触碰 ✅；
- 公示页当前赛季件数 320 不变 ✅。

### 跳过清单（8 件塞塔里斯神庙，仅 legacy normal 档，WHERE 天然跳过，待插件 1.0.27 probe/游戏内取证补订）

| 装备 | BOSS | 订正前原值（dry-run 留档） |
|---|---|---|
| 防咬手套 | 米利克萨 | 智力4 / 急速5 精通3 |
| 克拉西斯封印者肩铠 | 塞塔里斯的化身 | 智力8 |
| 堕落妖术师法衣 | 塞塔里斯的化身 | 敏捷11 |
| 塞塔里斯的尖牙头盔 | 塞塔里斯的化身 | 敏捷11 |
| 巢穴净化者护肩 | 塞塔里斯的化身 | 智力8 |
| 沙漠卫士胸甲 | 塞塔里斯的化身 | 智力11 |
| 蛇行神灵兜帽 | 塞塔里斯的化身 | 敏捷11 |
| 重生巨蛇长袍 | 塞塔里斯的化身 | 智力11 |

### 备份（双份，回滚依仗），落 `backup/2026-08-16-sql27/`

- 四表全量 pg_dump `backup_before_sql27_20260816.sql`（253,317 字节）；
- 行级 JSON：`s2_boss_loot_values_20260816.json`（92 行）+ `s2_dungeon_loot_values_20260816.json`（196 行），含 id+旧 values 可原样回插。

## 五、A3：前端改动清单

| 文件 | 位置 | 改动 |
|---|---|---|
| js/dataPublic.js | itemCard() meta 行（:611-616）+ 注释（:606-610） | meta 行首加「物品等级 X」tag（`dp-tag` 复用现有版式，ilvl 非空才渲染）；上方注释钉死**同档绑定**（装等显示档与 effect 数值必须同档，禁混搭取档；当前单值结构天然满足——effect=史诗档实测文本、ilvl=史诗档静态表值，日后拆档须联动切换）。双壳同一渲染层自动生效 |
| js/app.js | mdEditLootItem（boss_loot 表单） | 字段数组尾部加「物品等级」number 录入框；onSave 正整数校验（NaN/非整数/≤0 → toast「物品等级必须为正整数」+throw，弹窗不关数据不写）；`payload.ilvl` 恒携带（sql/26 已执行列在场，清空=NULL 正常生效——无 icon_id 的 PGRST204 迁移窗口遗留） |
| js/app.js | mdEditDungeonLootItem（dungeon_loot 表单） | 同上口径 |
| js/app.js | changelogData | ①微瑕修复：v3.2.0-addon-1026-final 条目 date 2026-08-15→**2026-08-16**；②新增三条目（四维分类）：`v3.2.0-s2-stat-tier-fix`（问题修复：BUG-101 数值同档订正，最新置顶）、`v3.2.0-s2-loot-ilvl`（新增功能：S2 数据上线+物品等级）、`v3.2.0-s2-darknight-rollback`（模块调整：至暗回滚）。版本串不再二次递增——.62 尚未发布，本 commit 内一次递增覆盖全部 js 改动 |
| index.html / data.html | 全量 ?v= 查询串+顶部注释 | 版本串 20260811.61 → **20260816.62**（index 11 处 / data 7 处全量替换） |
| docs/问题与需求清单.md | REQ-116 新行 + BUG-101 新行 | 按编号纪律补录（REQ-116 此前未登记，本批落地即挂号，状态=已实现待验收）；BUG-101 挂号（P1，已修复待验收，含跳过清单 8 件与 S1 报备口径） |
| AGENTS.md | 副本掉落条目 | 补 REQ-116 ilvl 摘要+同档绑定钉死+sql/25 回滚+sql/27 同档订正一句+编号撞号声明 |

`node --check js/app.js js/dataPublic.js` 通过。

未动申报：数据中心掉落**列表列**与**批量录入**未加 ilvl 列（任务书只要求编辑表单录入框，最小改动）；批量录入维持 7 列格式不变。

## 六、验证（真浏览器主链路，交付红线）

verify 脚本 `scripts/verify-s2-ilvl.js`（零新增依赖，playwright 既有），覆盖：
A 静态断言（渲染行/注释/双表单/版本串计数/changelog）｜B 公开壳 data.html 真浏览器（物品等级 tag 数=320、乌拉特克卡=344、大米卡=311、零 console error；**B3b BUG-101 断言**：觉醒外衣卡片 chips=敏捷+162/智力+162/急速+130/精通+58——装等 318 配史诗档值视觉闭环）｜C RPC 层（ilvl 键 320/320/320、S1 全 null；**C5 BUG-101 断言**：RPC 觉醒外衣 primary/secondary_values=史诗档值 162/162/130/58）｜D 数据中心主链路实测（超管登录→团本掉落编辑 T116 样本行填 344 保存读回=344；填 0/负/小数拦截 toast+弹窗不关+库内不变；清空=NULL 读回 null；大米表单同路径）。

**结果：27/27 全绿，退出码 0（sql/27 并入后重跑，实跑 18.4s，端口 15816）**

- A 静态断言 5/5：渲染行+同档绑定注释在场；双表单字段/校验/payload 各×2；版本串 20260816.62 计数 index=11/data=7 且旧串零残留；changelog 条目日期核对（新增 v3.2.0-s2-stat-tier-fix）；node --check 双过。
- B 公开壳 data.html 真浏览器 6/6：全页「物品等级」tag=320/卡=320、赛季选择器默认 S2；乌拉特克卡片区 13/13 全「物品等级 344」；大米「物品等级 311」在场；**B3b 觉醒外衣卡 meta+chips 实得=「物品等级318/胸部/皮甲/敏捷+162/智力+162/急速+130/精通+58」**；零 JS 报错、零非图标 404（图标 404 共 95 条为素材 PNG 未入仓的既有环境缺口，与本次改动无关，按先例另行列示）。
- C RPC 层 5/5：628 行每行带 ilvl 键；当前赛季 320/320/320；S1 308 行 ilvl 全 null；抽断乌拉特克 13 行全 344、S2 大米 207 行全 311；**C5 觉醒外衣 RPC 行 primary/secondary_values=162/162/130/58**。
- D 数据中心主链路实测 8/8（页面/按钮/交互级）：superadmin 测试号登录→数据中心可见→掉落池选「烈毒之渊/8号 乌拉特克」→编辑 T116 行填 344→保存→toast「已保存」+读回 344；失败路径填 0→toast「物品等级必须为正整数」+弹窗不关+库内仍 344（截图在案）；清空→保存→读回 null；大米表单（毒牙祭坛整体池）填 311 同路径过。T116 样本行/公会/测试用户全清理复核 0 残留。
- 截图：`backup/2026-08-16-s2-ilvl/`（公开壳 320 计数、乌拉特克 344 组、觉醒外衣同档闭环、编辑弹窗、0 值拦截态、大米编辑与保存后列表）。
- 噪音口径 1 条：user_profiles 409 upsert 冲突为任务书 #42 既有噪音，按 verify-task43/task46 先例过滤（406/409 资源状态码口径一致）。

## 七、备份与回滚索引

| 物件 | 路径 |
|---|---|
| sql/24 执行前四表全量 | backup/2026-08-16-sql24/backup_before_sql24_20260816.sql |
| sql/25 执行前四表全量 + 至暗 32 行行级 JSON | backup/2026-08-16-sql25/ |
| sql/26 执行前四表全量 | backup/2026-08-16-sql26/backup_before_sql26_20260816.sql |
| sql/27 执行前四表全量 + S2 行级 values JSON（boss 92/大米 196 行可回插） | backup/2026-08-16-sql27/ |
| 回滚方法 | 见各 sql 文件头「回滚说明」注释段 |

## 八、边界申报（已知项，非阻塞，与 sql/24 导入回报一致）

- 2 件主手武器（萨塔特克/阿曼穆索）slot 录「单手」+note 标注（库词表无主手词，顾问挂牌，前端词表支持后回迁）；
- 杂项 29 件（装饰/图纸/宠物/幻化）按运营裁定不录；
- dungeon_loot.official_item_id 为 text 型未动；
- 至暗之夜插件采集侧不受影响（仍按无难度维单档采集留痕，仅不入库）；
- BUG-101 跳过清单 8 件（塞塔里斯神庙仅 legacy normal 档）维持裸基底原值，待插件 1.0.27 probe/游戏内取证补订（见第四节跳过清单表）；
- S1 行全库无 mythic 键（0/0）无档可回填，维持裸基底显示，随批报备运营裁。
