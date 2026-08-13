# 任务书 #45 修改报告｜成员服务器字段+同名口径升级（REQ-095，REQ-002 完整落地，BUG-060 根治）

> 施工日期：2026-08-13。仓库副本：tasks/任务书45-REQ-095-成员服务器字段.md（任务书原文已在库）。
> 红线执行：§1 审计单先行；零依赖；DB-first；版本串 20260811.56→.57 两壳 16 引用+2 头部注释；T45 前缀测试数据（含垃圾桶）终清理复核为零；不 commit 不 push。
> ✅ **sql/28 已执行**（2026-08-13，SSH_PASS 运营私聊件；纪律全走：备份 backup/2026-08-13-sql28-29/pre-migration-backup.sql → SSH+docker exec（supabase_admin，ON_ERROR_STOP）→ NOTIFY pgrst×2 → 复核：行数 43/190/221 零漂移、server 存量全 NULL 零回填、索引定义=（guild_id,name,COALESCE(server,'')）活跃 partial 逐字核对）。迁移后 verify-task45.js 全量矩阵 **20/20**（含 C 组 DB 三键三态、D 组 UI 主链路、E 组导入落库、F 组 WP5 归属性）。

---

## §1 审计单（开工前置，先行送审口径）

### 1.1 现状三事实
1. `raid_members` 无 server 列；唯一索引停在 sql/09 的 (guild_id,name) 活跃 partial——同名跨服被误拦（BUG-060 根因）。
2. 智能导入/WCL 链路早已解析出 server（宏格式「名字-服务器」/WCL realm），但写库时**丢弃**；查重靠「名字-服务器」整名前缀形态推断（无列时代的权宜口径）。
3. 装备分配人下拉 option value=**名字**，lootSave 按名反查 id——同名合法化后这是安全命门（同名会串人）。

### 1.2 全站「按名反查/按名匹配」清单（先列后改，WP5 覆盖面）
| 点 | 处置 |
|---|---|
| lootInitMemberSelect/lootUpdateMemberInfo/lootShowModal/lootSave/lootFillAssignedTo/syncWishlistLinkages（装备分配人全链） | **改 id 键**（option value=成员 id，自定义名兜底保留；lootSave 直读 id 不再反查） |
| buildWclSyncPreview / 导入后重匹配 / importParseWcl / importParseRoster / wclSyncAddAsMember / importConfirmRoster 撞离队 | 统一 `matchMemberByNameServer`（单候选宽松、多候选 (name,server) 精确） |
| saveMember 查重/恢复 | (name,server) 精确双键 |
| 心愿单保存/考勤保存 | 本已 id 键，不动 |
| lootRender/我的认领装备计数/硬删历史计数 | character_id 优先 + 按名回退（存量数据兜底），不动 |
| importFromWCL（REQ-032 前遗留入口）/ JSON 导入合并去重 | 遗留口径不动（申报 §6） |

### 1.3 同名消歧展示点清单
成员列表/考勤详情/考勤筛选下拉/装备分配列+下拉+信息卡/心愿单列表+复选框+编辑下拉+筛选/统计双榜/仪表盘 Top5/认领审核/批量离队+彻底删除确认行/memberChipHtml 公共 chip——统一走新 helper `memberDisplayName()`（同名并存且有 server→「名字（服务器）」，否则裸名）。已删除伪行（member_name 快照）/WCL 预览既有「· server」后缀形态不动。

### 1.4 我的角色表单复核
`charServer`（index.html:1879）服务器字段**本已存在**（REQ-077/078 链路），与 raid_members 无关，零改动——任务书「我的角色同步加」经侦察为已具备，特此核销。

---

## §2 修改清单（实际改动点）

| 文件 | 改动 |
|---|---|
| sql/28_req095_raid_members_server.sql（新） | server text 可空（存量不回填）+ 索引重建 (guild_id,name,COALESCE(server,'')) 活跃 partial + COMMENT/回滚/复核 SQL/NOTIFY×2 |
| js/app.js | ①parseMemberRosterLine 宏格式与「名字-服务器」拆出 server；②四旧函数（isDupMemberName(WithServer)/findDepartedByName(WithServer)）废止，统一 matchMemberByNameServer/findDepartedByNameServer/memberDisplayName；③成员弹窗+列表常驻服务器列（空显—，colspan 三处 10→11）；④saveMember (name,server) 双键校验+恢复链路对齐 isDepartedStatus；⑤导入/WCL 查重与匹配全链接统一口径、importExecute/恢复 payload 落 server；⑥WP5 装备分配人链路 id 化（含 syncWishlistLinkages id 优先+名回退）；⑦§1.3 展示点消歧 |
| js/cloud.js | reloadMembers/syncMember 映射加 server；**probeServerColumn 探测门**——sql/28 未执行时写路径自动摘除 server 键降级（成员 CRUD 不断链），迁移后自然全量；导出 isServerColumnReady |
| index.html | #memberModal 加「服务器（非必填）」#memberServer；成员列表表头加「服务器」列；版本串 .57 |
| scripts/verify-smart-import.js | 同步改写（旧四函数抽取已失效）：解析用例 24（含新拆 server 形态）+ REQ-095 口径 15 全绿 |
| scripts/verify-task45.js（新） | 双模式验证（见 §3） |
| docs/问题与需求清单.md | REQ-095 登记 + BUG-060 并入根治销号（注明仓库副本路径） |

`node --check`：js/app.js、js/cloud.js、scripts/verify-task45.js、scripts/verify-smart-import.js 全过。

---

## §3 验证

### A. 迁移探测双模式（verify-master-data 先例）
verify-task45.js 先探 `raid_members.server` REST 可见性：**sql/28 已于 2026-08-13 执行，全量矩阵已解锁并跑通 20/20**（脚本保留双模式——迁移前跑为降级态断言，迁移后跑为全量断言）。

### B. 全量矩阵实测（迁移后，20/20）
- C1-C4 DB 三键：无 server 第一人可建 / 同键活跃重复 23505 拦截 / **跨服同名放行（BUG-060 DB 层根治）** / 撞离队同键可新建活跃行 ✓
- D1-D5 UI 主链路：列表常驻服务器列（空显「—」）/ 同名消歧「T45同名（白银之手）」「T45同名（罗宁）」/ 同服同名拦截（toast「同服务器已存在同名角色…」+弹窗不关+未入库）/ **跨服同名 UI 新增放行+server 落库（BUG-060 主链路根治）** / 编辑回填 ✓
- E1-E2 导入：「T45导入甲-罗宁，MAGE」拆 server 进预览行 + 落库（甲=罗宁/乙=空）✓
- F1-F2 WP5：同名并存下 UI 分配 character_id=所选成员 id（不串同名）+ assignedTo 名字快照语义不变 ✓
- 全程零 JS 报错零 404；T45 数据清零复核 ✓

### B-补. 降级路径实测（迁移前窗口期记录，13/13）
- 成员 UI 新增不断链（server 键自动摘除）+ 无错误 toast（静默降级+console.warn）✓——探测门在迁移前的保护性证据，迁移后该路径不再触发。

### D. 单元口径（verify-smart-import.js 24+15 全绿）
解析五格式（含「阿布-死亡之翼」拆 name+server 新口径、「-白银之手」空名段保留旧行为）、匹配三场景（撞离队恢复/活跃查重/多候选精确）、消歧三态。

### E. 回归（红线清单，2026-08-13 全绿；sql/28+sql/29 迁移执行后同口径复跑同绿）
| 套件 | 结果 |
|---|---|
| verify-smart-import / task27-wp1 / wp2 / patch | ✅ 39（24+15）/ 8/8 / 27/27 / 24/24 |
| task29-wp1 / task31 / task32 / bug071 / task34 / task35 | ✅ 27/27、16/16、16/16、15/15、18/18、13/13 |
| task36 / task37 / task38 / task39 / task40 | ✅ 10/10、25/25、17/17、18/18、21/21 |
| task41 / task42 / task43 / task44 | ✅ 17/17、24/24、27/27、27/27 |
| verify-authz（SEC-001）/ npm test | ✅ 34/34、通过 |

回归过程三项如实申报（均非本包产品缺陷）：
1. task37/40 并行首跑挂在数据中心掉落保存 toast——真因是 #46 施工侧 payload 恒带 `icon_id` 键撞 PGRST204（sql/29 未执行），已加「icon_id 仅非空携带」防护（本包与 #46 同工作区并行施工的交叉发现，修复后 37/40 串行全绿）；
2. task27-patch 首跑挂 `#lootAssignedTo` selectOption——回归脚本与旧「value=名字」语义耦合（WP5 已 id 化），脚本维护为按名解析 id 后选中，产品行为不变；
3. task44 A1 版本断言写死 .56——改「≥本包串」口径（task42 先例），task45 同。

---

## §4 样本声明
构造同名跨服样本：T45同名（空 server/白银之手/罗宁离队/金色平原 UI 新建）+ T45导入甲-罗宁/乙（无 server）——迁移后全量矩阵用同一套样本断言（脚本内置，当前降级态样本=T45降级成员 1 件，已清零复核）。

## §5 B 表（运营手工，5 项，任务书 §八原表照录+施工侧注）
| # | 操作 | 预期 |
|---|---|---|
| B1 | 新增成员「测试同名」不填服务器→再加「测试同名」填「白银之手」 | 第一个成功；第二个不再误拦（BUG-060 根治），跨服同名共存（**前提：sql/28 已执行**） |
| B2 | 成员列表看服务器列 | 常驻显示；未填显「—」；同名两条各自「名字（服务器）」消歧 |
| B3 | 第三个「测试同名」也填「白银之手」 | 拦截 toast「同服务器已存在同名角色」+弹窗不关+未入库 |
| B4 | 撞离队同名：离队一条→重新加同名同服 | 弹「是否恢复」语义不变（BUG-060 B4 补验并入） |
| B5 | 给同名成员之一分配装备→核对归属 | 分配到正确的人（WP5 id 优先，不串同名） |

## §6 遗留申报
1. ~~sql/28 执行窗口~~ **已执行**（2026-08-13）；探测门 probeServerColumn 保留作为同类迁移的防护资产，正常态下恒 true 零开销。
2. **垃圾桶 deletedNames 名集合**：跨服同名时一名进桶会使同名在册成员的存量 NULL character_id 装备行误判「已删除」徽标（lootRender 回退路径）；任务书未列垃圾桶改造，登记待后续批次。
3. **importFromWCL 遗留入口**（REQ-032 之前的旧活动级导入）与 JSON 导入合并去重仍按旧名口径，使用面极低，登记不动。
4. 旧「名字-服务器」整名成员的查重前缀形态口径随 REQ-095 废止（库内若有此类历史整名成员，新口径不再按前缀判重）——任务书 WP4 裁定口径的字面结果，报备。
