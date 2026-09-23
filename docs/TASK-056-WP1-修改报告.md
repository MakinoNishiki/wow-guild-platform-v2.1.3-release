# 任务书 #56 WP1 修改报告：REQ-141 埋点 WP3 收官（规范回写 + 存量七事件补挂）

> 日期：2026-09-23 ｜ 执行方：Kimi Code ｜ 状态：**已实现待验收（verify 29/29 全绿）** ｜ git：未 commit 未 push

---

## 一、定点申报（任务书硬性要求，七处挂点逐一核实）

| 事件 | 挂点函数:行号（施工后现码） | 语义确认 |
|---|---|---|
| user_register | `handleRegister` js/app.js:1606（signUp 成功 + regToken 校验后、showGuildForm 前） | ✅ 候选 ~1593 一致；此时 __wbUid 未写（showAppView 未走）→ uid=null，书载允许 |
| guild_create | `handleCreateGuild` js/app.js:1726（createGuild 成功 + showAppView 后） | ✅ 候选 ~1719 一致；挂 showAppView 之后使 __wbUid 已就位（uid 非空） |
| guild_join | **双路径同事件名**：`handleJoinGuild` js/app.js:1742（邀请码主路径）+ `acceptGuildInvite` js/app.js:1269（通知接受路径） | ⚠️ 候选仅 ~1265（通知路径）；邀请码加入才是主入会路径，只挂通知路径会漏绝大多数真实入会——按登记表语义「入会成功（成员关系落库后）」双路径同挂一事件名，申报在案 |
| attendance_save | `saveActivity` 双分支 js/app.js:4561（update）/4571（add） | ✅ 候选 ~4547/4555 一致；marked=在册人数（非离队成员数） |
| loot_assign | `lootSave` js/app.js:6334（cloudCrud 成功后、心愿联动前） | ✅ 候选 ~6316 一致；count=1（一次保存一件） |
| wishlist_add | `wishlistSave` 批量添加分支 js/app.js:7119（统一 reload 成功后） | ⚠️ 候选 ~5685 **不符**——该处是数据管理 JSON 导入的 wishlists 写，非用户心愿新增；真实新增路径=wishlistSave 批量分支。批量 N 人一次动作埋一次（纪律 3），登记表 props={} 无数量键故按表不附（纪律 4 省略精神），申报在案；装备联动自动心愿（syncWishlistLinkages :6405）非用户动作不埋 |
| smart_import | `importExecute` js/app.js:4030（addedOk+restoredOk>0 分支内） | ✅ 候选 ~3967 一致；全败不埋（纪律 3 禁失败也埋）；import_type=importSource 现成枚举（paste/wcl，:3746），rows=新增+恢复行数 |

**挂点计数申报**：任务书 A 组口径「WBTrack.event 恰好 7 处」按事件名计；实做 9 挂点（guild_join 双路径 + attendance_save 双分支），去重事件名恰 7 类与清单表逐字一致——verify A3a 按此口径断言并在断言文案写明。

**C 组通道申报**：UI 无删除公会入口（`deleteGuildCloud` 在 app.js 零调用点，死功能在案）——任务书「经 UI 删除测试公会」不可达，C 组公会清理走 service_role 先例通道（#54 B5/#55 B5 同款），业务行清零复核口径不变。

## 二、改动清单

| 文件 | 改动 |
|---|---|
| `docs/开发规范.md` | 新增第七章「埋点纪律」：五条纪律（唯一入口/事件登记制/成功后触发+批量一次一埋/props 零 PII/静默不阻塞）+ 事件清单表 8 行（page_view 存量登记 + 七新事件） |
| `js/app.js` | 九处埋点挂点（每处带 #56 注释钉来源）+ changelog 条目 v3.2.0-task56-analytics-events（新增功能维度） |
| `index.html` / `decor.html` / `data.html` | 版本串 .71→.72 全量递增（index×15/decor×6/data×8 守恒，旧串零残留） |
| `docs/问题与需求清单.md` | REQ-141 行补记 #56 WP3 段 |
| `scripts/verify-task56.js` | 新建（A 静态 12 项 + B 浏览器插桩 13 项 + C 清零 3 项） |

**红线复核**：track.js/server.js/sql//css(main.css 看板样式）零改动（A2 git diff 文件名清单实证）；#55 看板代码零改动（A2b app.js 变更行零命中 anxState/mdRenderAnalytics/.anx- 实证）；心愿单/导入写路径 P1 旧债只挂埋点未动写路径（diff 可见两处均为纯插入埋点行）。

## 三、验证（scripts/verify-task56.js，输出全文 backup/2026-09-23-task56-wp1/verify-output.txt）

**29/29 全绿，0 红，exit 0。**

- A 静态 12/12：规范章锚点（章题/五条/8 行逐字）；零改动断言；挂点 9 处+事件名 7 类逐字+注释钉来源；版本串 .72 三壳 15/6/8+.71 零残留；changelog+台账；node --check ×2 + server-security 回归。
- B 浏览器插桩 13/13（addInitScript 包装 sendBeacon+fetch 捕获 payload）：账号 A 真机 注册→建会「埋点测试会」→智能导入 2 行→创建活动→添加装备→添加心愿；账号 B 真机 登录→邀请码加入。七事件逐一在场、props 键全 ⊆ 登记键集、登录态 uid 非空（user_register=null 书载允许）、值口径实证（import_type=paste/rows=2、marked=2、count=1）、七类之外零埋点、双账号全程零 JS 报错零意外 4xx。
- C 清零 3/3：测试事件行（双 vid）service_role 删除复核零残留；测试公会 G1 及考勤/装备/心愿/成员行清零复核；双测试 auth 用户清零复核。

**一遍全绿零打回**（B 组前置两坑已在设计期规避：无公会登录落创建遮罩→B 账号走邀请码加入主路径正好覆盖 guild_join；Playwright fill 不发 change→日期类字段一律 evaluate 落值）。

## 四、送审物料

| 物料 | 位置 |
|---|---|
| diff 全文（747 行，git add -N 新件=verify-task56.js + 任务书存档） | backup/2026-09-23-task56-wp1/diff.txt |
| verify 全量输出（29/29） | backup/2026-09-23-task56-wp1/verify-output.txt |
| sha256 复算命令+输出（**diff 生成之后**复算，硬性纪律） | backup/2026-09-23-task56-wp1/sha256-after-diff.txt |
| sha256 scripts/verify-task56.js（新件） | 6e8e181863024aca770949ace26be129d6be597f7106a7f9254ca5fcc096e64e |
| sha256 js/app.js（改动核心件） | cf2bddbbe0e0823628a88d1d8c155da989af8e6dd4cd792f63c82e632d52082b |
| sha256 docs/开发规范.md（改动核心件） | d4c6dc7388488a2f21e48e37ddaa9a31eb4fe21779dad9521f267c3f3b2ab781 |

复算命令（diff 生成后执行，输出原件随附）：
```
$ sha256sum scripts/verify-task56.js js/app.js docs/开发规范.md
6e8e181863024aca770949ace26be129d6be597f7106a7f9254ca5fcc096e64e *scripts/verify-task56.js
cf2bddbbe0e0823628a88d1d8c155da989af8e6dd4cd792f63c82e632d52082b *js/app.js
d4c6dc7388488a2f21e48e37ddaa9a31eb4fe21779dad9521f267c3f3b2ab781 *docs/开发规范.md
```
