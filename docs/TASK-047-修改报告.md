# 任务书 #47 修改报告｜写链路刷新断裂系统排查+预防机制+赛季选择器对齐（BUG-080/081）

> 施工日期：2026-08-13。仓库副本：tasks/任务书47-BUG-080-写链路刷新断裂排查.md（任务书原文已在库）。
> 红线执行：零依赖；版本串 20260811.58→.59 两壳 16 引用+2 头部注释；T47 前缀测试数据终清理复核为零；不 commit 不 push。

---

## §1 WP1 排查审计单（先侦察后修复，逐环实证）

### 1.1 逐环实证（复现脚本 scripts/repro-bug080.js，双场景）

标准链五环：写库（saveCloudData→syncMember→dbInsert 代理）→ 返回值 → reload（reloadData→reloadMembers 重读 DB 更新 appData）→ 缓存（saveData/saveLocalCache）→ render（renderMembers）。

| 场景 | DB | appData | DOM | localStorage 缓存 | 结论 |
|---|---|---|---|---|---|
| 净态（新公会空名单）添加① | 1 | 1 | 1 | 1 | 四环同步 ✅ |
| 连加② | 2 | 2 | 2 | 2 | 连加逐条即时 ✅ |
| 切 tab 往返 | 2 | 2 | 2 | 2 | 缓存重渲染正常 ✅ |
| 富态（approval 认领模式+认领标签+离队行+同名跨服对+null 怪数据行）全量同上 | ✓ | ✓ | ✓ | ✓ | 富态亦不断链 ✅ |

**WP1 定论**：当前交付构建（含 #45 双键改造+probeServerColumn 探测门）的成员写链路**逐环实证无断点**——任务书首要嫌疑面（#45 改造吞异常/绕 reload/提前 return）经代码走查+双场景复现**排除**；成功 toast 出现在 cloudCrud 四环全部完成之后，看到成功 toast 即证明 reload 与 render 已执行。运营截图场景在交付构建上不可复现，环境侧嫌疑（验收时开着旧版本页签/旧缓存页面——版本串机制下硬刷即新构建，与「仅硬刷可见」症状自洽）如实列入 §6 排查建议。#45 中对被吞异常的防护（探测门只摘键、不吞错；reloadData 失败抛错不静默）均在案。

### 1.2 WP2 全站写路径对照表（40+ 写点全枚举，摘要）

| 写路径类别 | 调用点 | 判定 |
|---|---|---|
| cloudCrud 标准入口（写→reload→缓存→render 四环原子） | 21 处：saveMember/deleteMember/restoreMember/saveActivity/saveAttendance/deleteCurrentActivity/toggleActivityCancelled/lootSave/lootDelete/wishlistSave/wishlistDelete/wishlistToggleObtained/importFromWCL 等 | ✅ 全标准链 |
| 直接 saveCloudData 批处理例外（规范 1.2.2：循环写后统一 reload+render） | 5 处：批量离队/批量删活动/智能导入/JSON 导入/数据重置 | ⚠️ 全合规 |
| CloudSync 封装写（代理） | 13 处：认领/审批/公会资料/角色变更/踢人/退会/硬删等 | 12 ✅ + **1 ❌（实锤#1）** |
| MasterData 写助手（数据中心 9 区块+字典导入器+批量录入） | 11 类 | ✅/⚠️合规（脏标记统一置位，掉落页 activate 重拉闭环） |
| 直代理 fetch | 1 处：wclSyncConfirm 循环写 | ⚠️ 瑕疵#4 |
| SDK 直连写 | 6 处：改名/角色/通知/偏好（偏好=先改后写+失败回滚设计） | ✅ |

### 1.3 实锤与瑕疵清单（本包处理）

| # | 位置 | 问题 | 处置 |
|---|---|---|---|
| #1 ❌ | handleLeaveGuild（app.js:1892） | 非 owner 退会后自愈切到剩余公会：selectGuild 全量换了 appData 但**零 render**——当前页停留旧公会数据，此刻编辑/删除会以新公会 id 走代理（脏操作）；切 tab/硬刷才恢复 | **已修**：补 updateCloudUI+updatePermissionUI+renderCurrentPage |
| #2 | saveActivity 编辑分支 `if (!activity) return` | 排查代理报「锁泄漏」——**误报排除**：return 在 try 内，finally 必复位锁与按钮 | 不改，排除在案 |
| #3 ⚠️ | saveActivity/saveAttendance/deleteCurrentActivity | closeModal 在 try/catch 之外——写失败弹窗照关、用户输入丢失（与 saveMember「失败保弹窗」口径不一，假成功 UX 风险） | **已修**：三处改成功才关弹窗 |
| #4 ⚠️ | wclSyncConfirm | 考勤循环写第 N 行失败=前 N-1 行已落库的部分写，catch 只 toast 不 reload——考勤详情停留旧状态 | **已修**：catch 兜底 reloadData+saveData+renderAttendance |
| #5 ⚠️ | syncWishlistLinkages | 联动写心愿失败仅 console.error，lootSave 照常成功 toast——联动可能半同步且用户无感 | **已修**：warning toast 明示+兜底 reload 心愿缓存（不阻断主保存） |
| #6 ⚠️ | MasterData.refresh 快照模式 | 离线快照兜底态下写成功但缓存不刷新（超管+离线+代理可达的极端组合，近不可达） | 申报不改 |
| ⚫ | confirmClearAll / CloudSync.deleteGuild / resetGuildData | 死代码（无 UI 调用方） | 申报不动（删除属清理决策，留运营定） |

---

## §2 WP2 预防机制方案书 → **WP4 落地（2026-08-13 运营裁定：b 先行+轻量门禁，a 记长期演进）**

**已施工（版本串 .59 不动，属 #47 收尾 WP4）**：
- **哨兵（b）**：cloudCrud 内置写后自检 `cloudCrudSentinelCheck()`（app.js）——校验口径：add=新 id 在集合/delete=id 已消失/update=payload 与行同名标量键值一致（对象/数组键不比对，宁稳勿误报）；不满足→`console.warn('[BUG-080 哨兵]…')`+自动二次 reload；二次仍不一致升级 console.error。verify-task47 F 组两态实证：F1 正常写零误报、F2 注入陈旧 reload（拦截 SDK 直读回放旧 body）→告警+自愈+DOM 即时可见。
- **门禁（轻量）**：立规双文档（AGENTS.md 数据同步机制节 + docs/开发规范.md §1.2 第 5 条）——新增写操作必须走 cloudCrud，批处理例外注释自引规范 1.2.2；verify-task47 A7 grep 锁数（直调 saveCloudData=16/fetch('/api/db=1/直连 dbInsert|Update|Delete=0），新增绕过即红。
- **方案 a（统一收口 wrapper 物理收编存量 16 处直调+13 处封装写）**：按裁定记入长期演进，本批不实施。

**原方案书留档（已裁定）**：
- a｜写路径统一收口 wrapper（物理无法绕过）：cloudCrud 升级为唯一合法写入口，收编全部直调点，CloudSync.saveCloudData 不再导出。优点=物理收口；缺点=存量重构面大、回归成本中。
- b｜写后自检断言（cloudCrud 内置）：reload 后校验 appData 含新值，不满足自动二次 reload+console 告警，verify 可断言两态。优点=单点小改；缺点=只覆盖 cloudCrud 链。
- 组合（Code 建议被采纳）：b 先行锁主链路 + 轻量门禁立规（不重构存量），a 择机收编。

---

## §3 WP3 BUG-081 赛季选择器对齐

根因：≥1400 面板态卡片区右让 292px（任务书 #43），赛季行（公开壳在 .dp-header 内/登录壳独立行）仍居中于 1100px 版心——右缘与卡片区右缘偏差随宽度变化（1920 档约 118px），视觉悬浮未对齐。修复：两壳赛季行所在轨道并入卡片区同一 292 右偏移（margin-left auto 吸收余量，与 .dp-main 同机制）；登录壳规则置文件尾作用域段（层叠须晚于基线规则，已在 verify A5 断言防回归）。1366/<1400 折叠态零改动。

## §4 验证（verify-task47.js）

- A 组：版本串 .59 两壳 + 四项修复静态落码 + CSS 层叠顺序断言 ✓
- B 组（B1/B2 自动化主链路）：添加成员 toast 成功+三环（DB/appData/DOM）即时=1；连加 3 条三环 1→2→3 逐条即时；切 tab 往返保持 ✓（截图 members-add-instant-1366.png）
- C 组：C1 退会自愈后当前页即时重渲新公会名单（不点 tab 不硬刷）✓；C2 活动写失败（主动断流）弹窗不关+输入保留+错误 toast+按钮复位+零脏行入库 ✓
- D 组 BUG-081 computed：登录壳 1920 赛季行右缘=卡片区右缘（1604=1604）；公开壳 1920（1628=1628）；双壳 1366 折叠态无 292 偏移+选择器零裁切 ✓（截图四张）
- E 组：零 JS 报错（C2 主动断流噪音另行列示）零 404；T47 数据清零复核 ✓

## §5 样本声明

T47甲会（owner，标识成员「T47甲会成员」）+T47乙会（editor，退会测试）+连加成员「T47新一/二/三」+失败路径活动「T47失败路径本」（断流注入，零入库复核）；全部终清理复核为零。

## §6 回归（红线清单，2026-08-13 迁移后全量口径，全绿；WP4 哨兵落地后复跑同绿）

| 套件 | 结果 |
|---|---|
| 主数据敏感串行：task27-patch / task37 / task39 / task40 / task43 | ✅ 24/24、25/25、18/18、21/21、27/27 |
| verify-smart-import / task27-wp1 / wp2 / task29-wp1 / task31 / task32 | ✅ 39（24+15）、8/8、27/27、27/27、16/16、16/16 |
| bug071 / task34 / 35 / 36 / 38 / 41 / 42 | ✅ 15/15、18/18、13/13、10/10、17/17、17/17、24/24 |
| task44 / task45 / task46 | ✅ 27/27、20/20（全量口径）、27/27（全量口径） |
| verify-authz（SEC-001）/ npm test | ✅ 34/34、通过 |
| verify-task47 本包（WP1-WP4 全量） | ✅ 24/24（含 A6/A7 哨兵落码+门禁锁数、F1/F2 哨兵两态） |

注 1：task27-patch 曾挂 #lootSaveBtn 点击——回归脚本残留 toast 竞态，已维护（清旧 toast+等按钮复位），产品零改动。
注 2：WP4 哨兵改动在 cloudCrud 主链路面，全量回归于哨兵落地后复跑，零误报零回归。

## §7 B 表（运营手工，4 项，任务书 §五原表照录+施工侧注）

| # | 操作 | 预期 |
|---|---|---|
| B1 | 添加一个测试成员 | toast 成功且列表立即显示新行，零刷新（verify B1 已自动化实证） |
| B2 | 连续添加 3 个测试成员 | 逐条即时出现（verify B2 已自动化实证） |
| B3 | 随机抽查：改考勤状态/加心愿/加装备分配 | 每处即时反映；附：退出公会（多公会账号）后当前页即时切换为新公会数据（本次实锤修复点） |
| B4 | 副本掉落页看赛季选择器（1366/1920） | 与右侧面板/卡片右缘对齐，无悬浮错位（截图 season-*.png 四张可先审） |

## §8 遗留与排查建议

0. **插件 1.0.9 真机终验报障修复（2026-08-13 晚，随本批送审）**：S2 实采 360 件实证觉醒恐牙胸甲（id 271876）tooltip 有毒咒行+特效行但导出双空（全库 venomcurse 360 空、饰品特效 43 仅 1 非空）——#46 行首色码修复未根治。**插件 1.0.10**：①parseItemDetail 双通道回退（SetItemByID 缺特效/毒咒行时回退 SetHyperlink(GetItemInfo link) 补扫，属性行两通道同值经 addUnique 去重、首条命中守卫语义不变）；②Probe 加双通道对照 dump（A/B 通道特效/毒咒行有无判定行+全行 dump+NumLines 完整性计数）；③启动语版本硬编码「1.0.7」修正为跟随 ADDON_VERSION（toc/lua 同步 1.0.10，luacheck 双件过）。运营取证卡 Q1-Q4 已入 addon/运营测试步骤卡.md；判据=probe 271876 通道判定行 + 重导后该样本 effect 非空+venomcurse=毒咒+后二 BOSS 同类抽查。**待真机回验**。
0.1 **REQ-089 备案情报（不动手）**：S2 兑换物正体=毒咒神像/残骸/圣像/遗物/雕像 5 件（对应护手头/肩/胸/腿/头盔），插件导出 type 现标「垃圾」——已入 docs/REQ-089-兑换物展开规则表-送审.md 第七节备案（施工时按名称白名单识别、按 5 件重算基数）。

1. **BUG-080 环境侧嫌疑**（交付构建不可复现的如实申报）：若运营环境再遇到「写成功不显示」，请当场记录 F12 Console 与 Network 末次写请求——成功 toast 在当前代码=reload+render 已完成，再不显示只可能是浏览器在跑旧构建（硬刷即新）；WP4 哨兵落地后不一致会自愈并 console 留痕（`[BUG-080 哨兵]`）。
2. ~~预防机制方案（§2）待运营裁定后施工~~ **已裁定落地（WP4：b 哨兵+轻量门禁；a 记长期演进）**。
3. 死代码两枚（confirmClearAll/resetGuildData+deleteGuild）登记，删除属清理决策另批。
4. MasterData 快照模式 refresh no-op（#6）近不可达边界，登记。
5. **增补 WP4（图标素材 fileID 直取）降级申报**：探针实测 wow.tools CASC 镜像 `/casc/file/fdid` 等多种端点形态对本机网络全 404（站点可达但取图端点/FDID 未命中；库内 icon_id 现全 NULL，首库全量本就无源）；按任务书降级口径——`scripts/import-item-icons.js` 运营供图模式保留、前端空值不渲染兜底不受影响、不阻塞整包；待正确镜像端点/图源确认后另案施工。另注：运营 08-13 晚裁定将「WP4」编号用于哨兵/门禁收尾，图标直取如续做建议另立编号。
