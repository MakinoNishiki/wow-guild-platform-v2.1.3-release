# 任务书 #35 v2 修改报告：BUG 包（BUG-074 批量工具条双功能 + BUG-073 公会卡服务器名竞态）

> 日期：2026-08-11 ｜ 执行：Kimi Code ｜ 版本串：20260811.45 → **20260811.46**（index.html 10 处 + data.html 6 处全量同步）
> 施工依据：`tasks/任务书35-BUG包-已清除语义与公会卡竞态.md`（v2；指令所引 docs/ 路径文件不存在，已核对内容一致）。
> 流程：两 WP 前置侦察结论先行送审，拟案经运营放行后施工（全选维持现状 + REQ-049 口径对齐附加项、server_name 空回退附加项均已落实）。
> 红线自查：零 schema 变更、零迁移、零依赖；未动唯一索引（REQ-095 预留口径）；存量 19 行离队测试成员未动（上线后运营自清，B4）；测试数据自清理复核为零（含垃圾桶）；**未 commit 未 push**。

---

## 〇、前置侦察结论（已送审放行，要点留存）

**WP1**：① 行内勾选框活跃/离队组无差别渲染（离队行逐行勾选可达）；全选 handler 实际覆盖全部渲染行，与原 REQ-049 注释「只覆盖活跃区」言行不一（运营 19 行离队成员即此路径）；② 单个按钮：活跃行 ✏️🚪🗑、离队行 ✏️♻️🗑（🗑 对离队行本就在场）；③ 计数三路 count（app.js:3274 同口径）与 `CloudSync.hardDeleteRaidMember(member, counts)`（cloud.js:1618）均按行设计，可逐行复用。

**WP2**：`#guildName` 写入点两个——cloud.js `updateGuildUI` 写**裸名**（selectGuild 尾部/updateGuildProfile 路径），app.js `updateCloudUI` 写**完整名**（showAppView/ensureTagNum 回调/改名路径）；`handleSwitchGuild` 不调 updateCloudUI，切会后停留裸名——最后写入者随路径不同，即「时不时」根因。

## 一、修改文件清单

| 文件 | 位置 | 改动 |
|---|---|---|
| index.html | 成员批量工具条 | 三钮布局「已选择 N 人 [批量离队] [批量删除] [取消选择]」（edit-only 不变） |
| index.html | memberHardDeleteModal 后 | 新增 `memberBatchHardDeleteModal`：可滚动名单（复用 .batch-delete-list 240px 滚动）+ 红字警示 + 「彻底删除」四字输入解锁 + requestCloseModal 防误关 |
| js/app.js | `memberBatchDepart()`（原 memberBatchDelete 改名归位） | 批量离队：仅选中活跃行生效；已离队行跳过并在结果 toast 注明；确认弹窗沿用 openBatchDeleteModal 名单+警示，文案归位「标记为离队」 |
| js/app.js | `memberBatchHardDelete()`/`batchHardDeleteTextInput()`/`confirmBatchHardDelete()` | 批量真删：逐行三路历史计数（与单个同口径并发查询）→ 弹窗名单（名字+职业+状态+逐行计数）+ 三项合计 + 四字解锁 → Promise.allSettled 并发逐行 hardDeleteRaidMember → 统一 reload 四表一次 → 成败计数 toast、失败名单列 console |
| js/app.js | renderMembers 全选判定 + memberToggleSelectAll 注释 | **REQ-049 口径对齐（运营附加项，行为零变）**：全选框 checked 判定由「活跃区」对齐为「全部渲染行」真实口径，注释同步修正 |
| js/app.js | modalDirtyChecks | 登记 memberBatchHardDeleteModal（确认词输入框有内容即未保存） |
| js/app.js | 新增 `guildDisplayName(g)` + updateCloudUI 两处 | WP2：单一拼接真源（server_name 空回退裸名，不出空括号） |
| js/cloud.js | `updateGuildUI()` | WP2：#guildName 改走 guildDisplayName；**补写 #guildBarName**（验证首跑暴露：切会后信息条滞留旧公会名——同族名称行未同步，属归一真源范围内补正） |
| js/app.js | changelogData 顶部 | 补录「修复BUG」两条（BUG-073/BUG-074） |
| index.html / data.html | 版本串 | 20260811.45 → 20260811.46（10 + 6 处） |
| scripts/verify-task35.js | 新建 | 13 项：A 公会卡 20 次混合采样 / B0 单钮覆盖面 / B1 全选口径+工具条布局 / B2 批量离队 2 项 / B3 批量真删 6 项 + 零报错 + 清零复核（含垃圾桶） |
| docs/问题与需求清单.md | **仓库副本**台账 | 登记 BUG-073/BUG-074（运营侧 master 台账由顾问维护） |

`node --check` js/app.js、js/cloud.js、scripts/verify-task35.js 均通过。

## 二、验证（真浏览器实测，scripts/verify-task35.js，13/13 PASS）

**A WP2 BUG-073**：20 次混合采样——首载 + F5×5 + 切页往返×6 + 切换公会往返×8（甲「无尽之海」⇄乙「回音山」双公会）——每次读取 `#guildName` 与 `#guildBarName` 文本与 computed 可见性，**20/20 逐次恒定** =「公会名 （服务器）」；切会路径（原裸名写入点）实测 8 次全为完整名。截图 `a-guild-card.png`。

**B WP1 BUG-074**：
- B0 单个按钮零回归：活跃行=编辑/离队/彻底删除，离队行=编辑/恢复/彻底删除（无🚪）逐行断言。
- B1 全选 4/4 覆盖全部渲染行（活跃 2+离队 2）+ 工具条三钮布局逐字断言。
- B2 批量离队：选 正式甲+离队丙 → 弹窗「批量离队（1）」名单仅活跃行、文案「标记为「离队」」→ 确认 → 甲置离队（DB 实证）、丙维持、乙不动，toast「已将 1 个成员标记为离队，跳过 1 名已离队成员」。
- B3 批量真删：选 正式乙（有历史）+离队丁 → 弹窗名单逐行计数「考勤 1 / 装备 1 / 心愿 1」+ 合计红字警示 + 初始禁用；输「彻底删」仍禁用、输全四字解锁（防误闸门）；执行后——成员行消失（乙/丁删、甲/丙留）、考勤行 member_id=NULL + member_name 快照在、心愿级联 0 行、装备 character_id=NULL + assignedTo 快照在、垃圾桶逐行在案（乙 counts=1/1/1，丁=0/0/0）、toast「已彻底删除 2 个成员」；考勤详情弹窗乙行灰色「已删除」快照展示实测。截图 `b3-batch-harddelete-modal.png`、`b3-after-delete-members.png`（已抽看）。

全程零 JS 报错；测试数据清零复核全 0（guilds/raid_members/activities/wishlists/loot_records/**deleted_raid_members**/profiles/auth）。

## 三、回归九组全绿

| 项 | 结果 |
|---|---|
| verify-task35（本包） | **13/13** |
| verify-task27-wp1 | **8/8** |
| verify-task27-wp2 | **27/27** |
| verify-task27-patch | **24/24** |
| verify-task29-wp1 | **27/27，SKIP 0** |
| verify-task32 | **16/16** |
| verify-bug071（task33） | **15/15** |
| verify-task34 | **18/18** |
| npm test（server-security） | **5/5** |
| SEC-001（verify-authz.js） | **34/34** |

各组测试数据清零复核均为 0（T35A 前缀八项含垃圾桶全 0；task27/task29/task32/bug071/task34 各前缀复核全 0）。

## 四、§1 副作用审计单（两份）

### WP1 批量双功能消费点逐项

| 链路环节 | 可能影响的既有行为 | 验证方式 | 结论 |
|---|---|---|---|
| 批量离队 = 原批量删除软语义改名 | **REQ-042 软删口径**：status 置离队、历史保留、可恢复——逻辑逐行平移，仅过滤活跃行 + 跳过注明 | B2 DB 状态断言 + toast 注明 | 无 |
| 批量离队弹窗复用 openBatchDeleteModal | **活动批量删除（REQ-017-B）**：共用弹窗组件，标题/名单/警示/onConfirm 参数化，活动链路零改动 | 回归 task27 三组 + task32 | 无 |
| 批量真删逐行 hardDeleteRaidMember | **单个彻底删除（任务书 #27 WP2）**：cloud.js 函数零改动，批量为逐行调用；垃圾桶/SET NULL/级联走同一 DB 机制 | B3 六项 + task27-wp2 27/27 回归 | 无 |
| 逐行历史计数并发查询 | **读路径**：SDK 直连 count 查询（head:true 零行传输），N≤勾选数，无写副作用 | B3 计数逐值断言（1/1/1 与 0/0/0） | 无 |
| 统一 reload 四表一次 | **规范 1.2.2 批处理例外**：members/activities/wishlists/loots 各一次，与 execHardDelete 同四表 | B3 UI 灰显 + DB 断言 | 无 |
| 新弹窗 memberBatchHardDeleteModal | **弹窗体系**：openModal/closeModal 走 modalStack 统一层级；已登记 modalDirtyChecks（输词未保存遮罩/ESC 二次确认）；无写死 z-index | B3 开关多次 + 规范审查 | 无 |
| 全选 checked 判定对齐 | **REQ-049 口径**：勾选行为零变化，仅全选框勾选态显示与注释对齐真实覆盖（全部渲染行）——运营附加项 | B1 断言（4/4 + checked） | 无（行为零变，报告注明） |
| 工具条按钮文案去计数 | **原「批量删除（N）」**：计数保留在「已选择 N 人」，按钮静态文案按规格布局 | B1 逐字断言 | 无 |

### WP2 渲染路径全表逐项

| 写入点/路径 | 修复前 | 修复后 | 验证 |
|---|---|---|---|
| HTML 默认「未加入公会」 | 无公会时显示 | 不变（无公会不走任一写入点） | 登录页/无公会流程回归（task29 B0） |
| cloud.js updateGuildUI（selectGuild 尾部：首载/登录/**切会**/退会切会；updateGuildProfile） | 裸名（竞态源） | guildDisplayName 完整名 + **同步 guildBarName** | A1 切会 8 次采样 |
| app.js updateCloudUI（showAppView/ensureTagNum 回调/改名） | 完整名 | 同一拼接函数，口径不变 | A1 F5/切页采样 + task29 C5 改名回归 |
| #guildBarName 仅 updateCloudUI 写入 | 切会后滞留旧公会名（验证首跑暴露） | updateGuildUI 补写，两元素同刷 | A1 bar 逐次恒定断言 |
| server_name 空 | — | 回退裸名不出空括号（运营附加项） | 拼接函数三元结构审查（样本双公会均带服务器名，空值路径为分支回退） |

## 五、§4 数据样本前提声明

- **WP1 样本**（T35A 自建自清理）：活跃正式 2（甲无历史/乙有历史：考勤 1+心愿 1+装备 1）、离队 2（丙/丁无历史）；混合勾选覆盖 活跃+活跃（历史）+离队 组合。批量离队样本=正式甲+离队丙（跳过 1）；批量真删样本=正式乙+离队丁（活跃/离队混合）。19 行存量离队测试成员**未动**（按规格上线后运营自清，B4）。
- **WP2 样本**：双公会均带 server_name（无尽之海/回音山），20 次混合采样。**server_name 空值路径**无现成样本（两测试公会均带服务器名）——如实声明：空回退为拼接函数三元分支，未单列实测样本。
- **存量真实数据**：线上真实公会/成员只读未动；T35A 前缀自清理复核为零（含垃圾桶 deleted_raid_members）。

## 六、遗留与后续

- 无新增遗留。B 表 5 项（B4=19 行存量离队成员批量真删自清，上线后运营执行）随批交付。
- 台账（**仓库副本** docs/问题与需求清单.md）已登记 BUG-073/BUG-074；changelog「修复BUG」两条已补录。
- **未 commit 未 push**，报告 + 双审计单送审。
