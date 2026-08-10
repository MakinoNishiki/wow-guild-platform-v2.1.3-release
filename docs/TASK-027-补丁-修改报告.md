# 任务书 #27-补丁 修改报告：报表与装备显示修正（BUG-057 / BUG-058 完工 + BUG-059 侦察送审）

> 日期：2026-08-10 ｜ 执行：Kimi Code ｜ 版本串：20260808.37 → **20260810.38**（index.html 10 处 + data.html 6 处全量同步）
> 状态：BUG-057 / BUG-058 已修并全绿待验收；**BUG-059 仅完成侦察，代码未动，待运营裁定修复口径**
> 红线自查：只动显示层；未动数据/权限/RLS/server.js/.env；未 commit 未 push；测试数据自清理复核为零

---

## 一、修改文件清单（开发规范 §3.1）

| 文件 | 位置 | 改动 | 原因 |
|---|---|---|---|
| js/app.js | `resolvePickerCategorySlot()`（新增，lootFillFromItemDb 前） | 新增统一解析函数：库内 slot/item_type → 表单 大类/部位 | BUG-057 |
| js/app.js | `lootFillFromItemDb()` 大类/部位段 | 旧 typeCategory/categoryMap/slotNameMap+setTimeout 模糊匹配 → 调用统一解析 + `lootUpdateSlotOptions(slot)` 精确选中 | BUG-057 |
| js/app.js | `wishlistFillFromItemDb()` 大类/部位段 | 同上（两面板同标准同治） | BUG-057 |
| js/app.js | changelogData 顶部 | 补录条目「修复BUG」一条（BUG-057/058） | 编号纪律四维补录 |
| css/main.css | `#page-reports .table-container .data-table` 规则 | min-width 720px → 0；新增 `.stats-rank-table th/td padding:10px 8px` | BUG-058 |
| index.html / data.html | 版本注释 + 全部 `?v=` | 20260808.37 → 20260810.38 | 规范第五章第 6 条 |
| scripts/verify-task27-patch.js | 新建 | 19 项断言验收脚本（A=057 六项 / B=058 六项 / C=059 侦察五项+三态观测） | 验收留证 |

未改动：server.js、js/cloud.js、任何 SQL、.env。

## 二、BUG-057：装备库选择回填大类/部位（已修）

### 侦察结论（两面板 picker 确认后回填字段清单现状）

- `lootFillFromItemDb`（装备分配）：装备名 / 团本+BOSS（BUG-013 精确链路）/ 大类+部位（旧逻辑）/ 主属性（取第一个）/ 副属性标签 / 特效 / 赛季（REQ-063）。
- `wishlistFillFromItemDb`（心愿单）：装备名 / 团本+BOSS / 大类+部位（旧逻辑，与装备分配同源同病）。无赛季字段。
- **旧逻辑双根因**（2026-07-25 引入，验收时即在架上）：
  1. 大类只按 `item_type` 查表，**不看 slot**——库内 21 件饰品 item_type 全为「其它」（插件采集口径），查表落空走兜底分支恒返「武器」；
  2. 部位用 `option.text.includes(targetSlot)` 模糊匹配 + 词表不全（缺 手腕→腕部、长柄武器→长柄、枪→枪械，单手/双手/远程/副手物品 整族未覆盖）——匹配落空静默停留首项「单手锤」。
- 合成结果即运营所见：选「艾林先知的凝视」（库内实测 slot=饰品、item_type=**其它**，任务书所记 item_type=饰品与库内实况有出入，以此实测为准）→ 大类=武器、部位=单手锤。

### 修法

新增 `resolvePickerCategorySlot(item)`：**部位 slot 为主键**定大类（REQ-060 部位↔类型口径：防具九部位/颈部手指=首饰/饰品/武器与副手=武器），武器/副手的部位取 item_type 细分；词汇归一覆盖数据中心录入词汇（武器/手腕…）与插件采集词汇（单手/双手/远程/副手物品/腕部，2026-08-10 库内 190 行实测分布全覆盖，杂项/套装兑换物/装饰品除外——非装备，解析不出**保持表单现状不改动**，留空不报错、不阻断手改）。两面板调用同一函数，部位用 `lootUpdateSlotOptions/wishlistUpdateSlotOptions(slot)` 精确选中，废除 setTimeout(50ms)+文本模糊匹配（同时消除时序窗口）。

### 验证（真浏览器，脚本 A 部分 6/6）

| 用例 | 心愿单面板 | 装备分配面板 |
|---|---|---|
| 饰品（slot=饰品 item_type=其它，镜像线上数据形态） | 饰品/饰品 ✓ | 饰品/饰品 ✓ |
| 单手锤（slot=单手 item_type=单手锤） | 武器/单手锤 ✓ | 武器/单手锤 ✓ |
| 负例（slot=杂项 item_type=垃圾） | 表单哨兵值不被改动 ✓ | 同 ✓ |

截图：backup/2026-08-10-task27-patch/wishlist-pick-*.png、loot-pick-*.png。全程 console 零报错。

## 三、BUG-058：出勤率排名表自适配（已修）

根因：`#page-reports .table-container .data-table { min-width: 720px }`（BUG-040 时期横滚兜底）——1366 档双列网格下单卡仅约 530px，720px 保底强制撑出横向滚动条；「已删除」徽标只是压垮列宽的最后一根稻草。

修法：该表 min-width 去保底（0）+ 单元格左右内距 16px→8px（`padding:10px 8px`）。作用域 `#page-reports` + `.stats-rank-table` 双重限定——报表页仅此一张表，缺席榜（.rank-list 非表格）及其他页面 min-width 规则一概未动。

验证（§2 运行时断言，非类名断言，脚本 B 部分 6/6）：

- 1366×768：scrollWidth=468 **=** clientWidth=468（无横滚）；getComputedStyle 生效值 min-width=0px、td padding=10px 8px；「已删除」徽标矩形 [341,390] 完整落在容器 [282,752] 内。截图 reports-1366.png。
- 1920×1080：761=761；徽标 [386,435] ⊂ [266,1029]。截图 reports-1920.png。
- 已知观感项（不裁剪、不越定案，报备不擅改）：1366 档「职业」列两字会折行（战/士）。如需根治可再把排名列 50px 收窄让位，属定案外打磨，候运营示意。

## 四、BUG-059 侦察报告（送审，代码未动）

### 代码现状（锚点）

装备分配列表分配人解析（js/app.js:5404-5415）：`members.find(name===assignedTo && status!=='离队')` 纯按名字匹配且排除离队 → 落空查 `appData.deletedMemberNames`（Set）→ 命中显「（已删除）」、否则「（已离队）」。

### 侦察三项实测（脚本 C 部分，自造 T27P 样本，已清零）

- **(a) 纯离队显示**：离队成员（无同名垃圾桶行）的装备行 → 实际显示「名字（已离队）」**正确**。截图 loot-bug059-departed 系。
- **(b) 同名碰撞复现**：同名 A 硬删 + 同名 B 离队 → A 的行显「（已删除）」✓，**B 的行也显「（已删除）」✗（应为已离队）**——BUG 如实复现，截图 loot-bug059-same-name.png 两行同显「（已删除）」清晰可见。
- **(c) deletedMemberNames 加载时机与刷新链路**：仅在 `reloadLootRecords()`（cloud.js:594-606）内从 deleted_raid_members 表加载，即**任何一次 loots 重载才刷新**（登录初始全量、装备 CRUD 后 cloudCrud reload、硬删后 execHardDelete 显式 reload loots）；无 realtime 订阅。实测佐证：service API 旁路插垃圾桶行后仅切页签不更新，reloadData('loots') 后才更新。硬删主链路本身会刷新（execHardDelete → reloadData('loots')），故单端操作无陈旧窗口；他端硬删后本端未重载 loots 期间存在陈旧窗口（误显方向：该显已删除的显已离队）。

### 关键事实（直接影响定案可行性）

1. **loot_records.character_id 线上 4 行全 NULL**（sql/17 注释亦记载「历史上 character_id 恒 NULL」），且**前端保存链路从不写入**——`lootSave()`（app.js:5692-5714）payload 无 character_id，`syncLoot()` 写 `item.character_id || null` 恒为 null。
2. 由此，定案倾向「character_id 优先解析」**对存量数据 100% 无效、对新增数据目前也无效**；要成立必须补「保存时写入 character_id」——这触及写路径（仅填既有列、不动 schema/RLS/server.js），是否越「只动显示层」红线请运营裁定。
3. **纯名字方案无法两全**：同名一删一留时，两条 loot 行的 member_name 快照完全相同，任何按名字的判定都只能让两行同对或同错（实测：改按「含离队的唯一命中」口径则 B 对 A 错）。根治同名不串必须靠 id。
4. 线上实况样本：同名碰撞真实存在 1 组——「验收梅」（垃圾桶 1 行 + 现存离队成员 1 行），其名下的 loot 行 1 行当前即误显「已删除」。

### 待裁定方案选项

- **方案 A（定案倾向完整落地）**：lootSave 补写 character_id（分配人下拉选中即带 id）+ 渲染 id 优先、member_name 回退。根治新增数据；存量行 id 全空仍走名字回退，同名残余误显无法可靠回填（同名歧义）。
- **方案 B（纯显示层折中）**：不改写路径；名字回退细化——含离队成员唯一命中时按该成员 status 显示。效果：线上「验收梅」这类「同名一删一留」场景两行都显「已离队」（B 修对、A 错显）；纯硬删（无同名活人）场景仍正确显「已删除」。
- **方案 C（A+B 组合）**：新数据 id 优先根治，存量按 B 口径回退。推荐。
- 另请一并裁定：考勤详情/统计报表的同类解析核对了——考勤详情按 member_id 聚合并有 member_name 快照兜底（app.js:4146-4153），报表伪行按 member_id 空 + member_name 聚合（app.js:2239-），两处均不经过「名字→垃圾桶」判定，**不同病，不扩面**（任务书授权：不同病不扩面）。

## 五、§1 修复副作用审计单

| 修正项 | 触及约束 | 可能影响的既有行为 | 验证方式 | 结论 |
|---|---|---|---|---|
| 057 | 两面板表单 大类/部位 下拉选中态；数据样本前提=boss_loot slot/item_type 词汇 | ①picker 其他回填字段（名/团本/BOSS/赛季/主副属性/特效）链路未触碰；②手改自由：仅解析成功才覆盖，解析不出保持现状；③内置库回退路径（MD_PICKER_MASTER_ONLY=false，当前关闭）词汇不在映射表时返回空、不改动字段，不劣于现状；④废除 setTimeout 无动画/异步依赖 | 脚本 A 六项（正例×2 面板×2 + 负例×2 面板）+ 手改哨兵值保持 | 无意外影响 |
| 057 | REQ-063 赛季回填、BUG-013 BOSS 回填共用 picker 确认链路 | 同函数内相邻段落，未改动 | verify-task24-wp1.js 所验链路本次未回归（见回归节） | 无 |
| 058 | 宽度（min-width 720→0）、排版（padding 12/16→10/8） | ①报表页仅此一张表（charts 为 canvas、缺席榜非 table）；②表头吸顶 sticky 规则未动；③其他页 min-width（loot 1050/members 900/wishlist 960）未动；④1920 档空间更大无回缩风险 | getComputedStyle 生效值断言 + 两档 scrollWidth/clientWidth 断言 + 徽标矩形可见性断言 + 截图 | 无意外影响 |
| 058 | 图层/动画时序 | 不涉及（纯静态排版） | — | 无 |
| 059 | 未修，无改动 | — | — | 待裁定后补审计 |

## 六、§4 数据样本前提声明

- **BUG-057**：库内 boss_loot 190 行全量词汇实测（slot/item_type 分布见侦察）；饰品且 item_type=其它 21 行（含「艾林先知的凝视」）；单手|单手锤 4 行；杂项类 43 行（负例口径）。浏览器验证用自造 T27P 样本 3 件（已清零）。
- **BUG-058**：线上「报表含已删除伪行」的真实公会样本未逐库统计（不动真实数据）；浏览器验证用自造样本（3 活跃成员 + 1 硬删伪行 + 1 活动 4 考勤行，已清零）。
- **BUG-059**：线上 loot_records 4 行（character_id 非空 **0** 行）；deleted_raid_members 5 行；同公会同名「垃圾桶×现存成员」碰撞 **1 组**（验收梅：垃圾桶 1 + 现存离队 1，其名下 loot 1 行）；raid_members 48 行（正式 23 / 离队 25）。三态实测用自造样本（已清零）。
- 无一处静默放宽；样本为 0 的项已明示（character_id 非空 = 0）。

## 七、回归与纪律

- verify-task27-patch.js（本补丁）：**19/19 通过**（A6 + B6 + C5 + 三态观测）。
- verify-task27-wp1.js **8/8**；verify-task27-wp2.js **27/27**（#27 已验收主链路零回归）。
- npm test **5/5**；SEC-001（verify-authz.js）**34/34**。
- 测试数据自清理复核 **11 项全 0**（raid_members/loot_records/activities/activity_attendance/guilds/guild_members/game_raids/game_bosses/boss_loot/deleted_raid_members/auth 用户）。
- node --check js/app.js ✓；§5 注释扫描：新增注释无半角星号闭合误用；版本串 20260810.38 单一对应本包改动。
- 更新日志已按四维补录「修复BUG」一条（BUG-057/058）；BUG-059 条目待修复后同批补。
- **未 commit、未 push**，候运营验收。

## 八、遗留问题

1. BUG-059 待运营裁定方案（A/B/C），裁定后施工 + 补 §1 审计 + changelog + 版本串再递增。
2. 报表职业列 1366 档两字折行（观感项，不裁剪不滚动，候示意）。
3. 表单部位词表无「魔杖」项（lootSlotMap 历史口径），库内当前无魔杖掉落，如遇该类型装备大类可正确回填、部位保持现状可手改——仅报备不擅改。
