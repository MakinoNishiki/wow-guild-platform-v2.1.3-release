# 任务书 #39 修改报告：副本掉落页签数据即时刷新根治（REQ-113）

> 日期：2026-08-12 ｜ 执行：Kimi Code ｜ 版本串：20260811.50 → **20260811.51**（两壳 16 引用 + 2 头部注释同步）
> 状态：开发自测完成（verify 18/18 全绿），待运营验收（B 表 3 项）｜ 未 commit 未 push

---

## 一、改动清单（实际改动点）

| 文件 | 改动 |
|---|---|
| `js/masterData.js` | 新增 `DP_LOOT_TABLES` 消费表集合 + `markDpLootDirty(table)`；`mdWrite`（insert/update/delete 统一口）与 `mdUpsert`（字典导入器）写成功路径置 `window.__dpLootDirty = true` |
| `js/dataPublic.js` | boot() 数据拉取段拆出为独立 `loadData()`；赛季下拉选项渲染拆出 `renderSeasonOptions()`（选中态守恒：原选中赛季仍在则保留，否则回落 is_current/最新）；新增 `reloadData()`（重拉+按新数据重建赛季选项/分类/来源 chips+render）；`activate()` 改两分支：脏→重拉（防重入 `reloading` 守卫，成功清标记，失败保留旧数据+toast+标记留存待重试），不脏→只重测特效溢出（零请求） |
| `index.html` / `data.html` | 版本串 .50→.51（11 处 + 7 处 = 16 引用 + 2 注释，无新增资源） |
| `scripts/verify-task39.js` | 新增验证脚本（18 断言） |

## 二、脏标记写入点审计单（§1）

数据中心全部写路径收口于 `MasterData.mdInsert/mdUpdate/mdDelete/mdUpsert` 四个助手（mdEditorSave 九区块编辑保存、掉落/大秘境批量录入、字典导入器、通用删除 mdDeleteRow 均经此），脏标记打在 `mdWrite`/`mdUpsert` 两个底层函数成功返回处，**单点全覆盖、无遗漏分支**。

掉落页消费表侦察（dataPublic.js boot 拉取清单）：`game_seasons / game_raids / game_bosses / boss_loot+dungeon_loot（公开 RPC 合并）/ tier_sets / game_dungeons / game_classes / game_specs`——9 张全部被消费，全部纳入置脏清单；`game_patches` 不被掉落页消费，不置脏（任务书「只标记被消费表」口径）。

其它写 loot 两表的路径扫描：智能导入（写 raid_members，不涉及）、装备 picker（只读）、批量录入（mdInsert 已覆盖）——无遗漏。

## 三、筛选态守恒口径

重拉只替换数据数组（`Object.assign(state, …)`），以下状态全部保留：搜索词（state.search + 输入框值不动）、主/副属性 chips、分类二级 tab/三级 chips、来源单选+实例级、赛季选中（赛季被删才回落当前）、大秘境视图（boss/pool）、折叠记忆（sessionStorage 不触碰）、套装三维筛选。已选筛选 key 因新数据失效的剔除由 renderCategory/renderSourceChips 自带逻辑承担（与赛季切换同路径）。

失败路径（网络/RLS）：loadData 抛错 → state 未被触碰（旧数据原样）→ toast「副本掉落数据刷新失败，已保留原数据」（公开壳无 showToast 天然跳过）→ 脏标记留存，下次 activate 自动重试。不清空白屏。

公开壳 data.html：整页无编辑入口，刷新即 boot，不在脏标记链路内。

## 四、WP2 全页签同类滞留扫描（只报告不施工）

主应用 9+2 页签切入渲染路径对照：

| 页签 | 切入动作 | 数据源 | 同类「一次挂载吃旧快照」滞留 |
|---|---|---|---|
| 仪表盘 | renderDashboard() 每次切入重跑 | appData 内存 | 无（同会话写走 cloudCrud 同步内存） |
| 成员管理 | renderMembers() 每次切入重跑 | appData 内存 | 无（同上） |
| 考勤记录 | renderAttendance() 每次切入重跑 | appData 内存 | 无（同上） |
| 装备分配 | lootRender() 每次切入重跑 | appData 内存 | 无（同上） |
| 心愿单 | wishlistRender() 每次切入重跑 | appData 内存 | 无（同上） |
| 统计报表 | renderReports() 每次切入重跑 | appData 内存实时算 | 无 |
| 数据管理 | renderDataPage() 每次切入重跑 | appData + 实时读 | 无 |
| 更新日志 | changelogRender() 每次切入重跑 | 内置常量 | 无 |
| 用户中心 | openUserCenter→loadUserProfile 重读服务端 | auth/服务端 | 无 |
| 数据中心 | renderDatacenter() 每次切入重跑 | MasterData 内存（写后 refresh） | 无 |
| 副本掉落 | 首切 mount 一次性 boot，再切 activate 仅重测 | **闭包 state 快照** | **实锤滞留 → 本包已修** |

结论：其余页签均为「每次切入从内存态重渲染」，同会话内写操作经 cloudCrud（Save→Load→Update→Render）或 MasterData.refresh 同步内存，不存在同会话旧快照问题；跨会话/跨设备变更需 F5 属全站共性（业务页签共享同一口径，非副本掉落式单点滞留），如需根治另立项裁定。**除副本掉落外无其它实锤滞留，按任务书只报告不施工。**

## 五、验证方式（verify-task39.js，18/18 全绿）

真浏览器（Playwright chromium，1366×768）主链路实测，T39 前缀测试数据终清理复核为零：

- A1/A2：308 基线（308/104/204）+ 版本串两壳 .51 单一串一致；
- B1：公开壳基线卡数 308 零变化（公开壳不在脏标记链路）；
- C1：首次切入 boot 308 卡、脏标记初始为假；
- C2：**无脏标记切回 activate 零请求**（掉落页 9 端点请求计数器 = 0）；
- C4：数据中心「团本掉落→新增掉落→填表→保存」真 UI 主链路 → toast「已保存」+ `__dpLootDirty===true`；
- C5：切回副本掉落 → activate 重拉（8 路请求发生）→ 新卡渲染（团本池 104+1=105，秘境池折叠不渲染）→ 标记清除；
- C6：折叠记忆守恒（sessionStorage `sec:dungeons` 重拉后仍在）；
- C7/C8：搜索词「T39」+ 主属性「力量」chip + 平铺命中 1 件，二次编辑保存重拉后**全部保留**，新特效文本已渲染；
- C9-C11 失败路径：路由拦截 RPC 断网 → 编辑保存（写路径走本地代理不受影响）→ 切回重拉失败 → toast「刷新失败」+ 旧数据保留不白屏 + 标记留存；恢复网络后再切 → 重试成功、新名渲染、标记清除、搜索词仍守恒；
- 全程零 JS 报错、零 404；G1 清理后 308 基线还原。

截图：`backup/2026-08-12-task39/`（reload-filter-preserved.png / reload-after-recovery.png）。

回归：task27×3 / 29 / 31 / 32 / bug071 / 34 / 35 / 36 / 37 / 38 + npm test + SEC-001（verify-authz）全绿（结果见完工报文分段）。

## 六、遗留问题

- 无功能性遗留。C7→C8 段曾在一次运行中因代理网络抖动超时（30s 无 toast），复跑通过；属测试环境网络波动，非代码缺陷（同序列调试脚本两次复现均正常）。
- B 表 3 项待运营手工验收。

### commit 物料（待运营审后统一提交）
标题：「任务书#39：副本掉落页签脏标记+activate重拉（REQ-113）」
【改了什么】数据中心写成功置 window.__dpLootDirty（masterData.js mdWrite/mdUpsert 统一口，9 张被消费字典表）；DPLootDrop.activate() 脏则重拉数据段并重渲染（筛选态/折叠记忆守恒，失败保旧数据+toast+标记留存重试），不脏零请求只重测溢出；boot 数据段拆 loadData() 复用。【范围】js/masterData.js、js/dataPublic.js、index.html、data.html（版本串 .51）、scripts/verify-task39.js（新增）。【验证】verify-task39 18/18 全绿（脏置位/重拉渲染/筛选守恒/零请求计数/断网失败路径）；回归 task27×3/29/31/32/bug071/34/35/36/37/38+npm+SEC-001 全绿；308 基线零漂移；测试数据清零。
