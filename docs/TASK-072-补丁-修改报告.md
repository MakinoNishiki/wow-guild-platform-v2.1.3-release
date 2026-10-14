# 任务书 #72-补丁 修改报告：首领中文映射 + 看板难度列

> 日期：2026-10-14 ｜ 执行：Kimi Code ｜ 类型：前端补丁（零数据库）
> 验证：`scripts/verify-task72-patch.js` **21/21 全绿**（A 静态 11 + B 浏览器 8 + C 清零 1+前置 2），退出码 0
> 版本串：三壳 `20261014.92` → `.93`（本批）→ `.95`（难度列激活订正，15/8/5，旧串零残留）
> 状态：①首领映射+②难度列均已生效（难度列 2026-10-14 运营裁定一词激活，见 §四-1）
> **未 commit**：按修正后纪律（验收通过前不提交），改动在工作区待开核；开核通过后随统一 push 入库。

---

## 一、修改前输出（规范 3.1）

| 文件 | 位置 | 原因 | 影响与风险 |
|---|---|---|---|
| js/app.js | WCL_ZONE_NAMES 区后 + renderWclRaidBoard | ①首领字典 ②难度列 | 看板渲染单点；难度列降级设计保零回归 |
| index/data/decor.html | 版本串 `.92`→`.93` | 任务书 §四 | 缓存失效语义不变 |
| docs/问题与需求清单.md | REQ-161 登记 | 编号纪律 | — |
| scripts/verify-task72-patch.js | 新建 | 验收自动化 | — |

## 二、实际改动点

### ① 首领中文映射（WCL_BOSS_NAMES，20 项）

证据链（任务书红线「Code 实测产出，不凭记忆硬编码」逐项落实）：
- **英文键**：WCL GraphQL `worldData.expansion(id:7).zones` 实测抓取（2026-10-14）——zone 46（VS/DR/MQD 合并区 9 首领）/ zone 50（Sporefall 1）/ zone 53（The Venomous Abyss 10，含潮缚石窟与 12.1.5 新首领）；并用运营公会真实公开报告 `RXYfr6gtCMbhFdc7` 的 `fights.name` 反向核对逐字符一致。
- **中文值**：19 项取项目主数据 `game_bosses`（插件 EJ 游戏内采集 = 国服官方译名）同本逐对音义核对；`Kith'ix` 为 12.1.5 新首领（DB 未收录），取暴雪官方中文站新闻口径「基希克斯」。
- **纠错**：通知示例 `"Nek'zali the Soulcoiler": "缚魂者奈克扎里"` 为错误译名——官方游戏内译名是「盘魂者内克扎莉」（EJ 实证，AGENTS/台账多处同名互证），已按实证值入典，verify A1c 锁死防回退。
- `getBossName(enName)` 未收录回退英文原名（任务书 2.1 原文语义）。

### ② 难度列（降级实现，红线零触碰）

**任务书前提经实测双重不成立**（证据）：
1. WCL GraphQL schema **没有** `Report.zoneDifficulty` 字段——实测报错 `Cannot query field "zoneDifficulty" on type "Report"`；
2. server.js `WCL_REPORT_FIGHTS_QUERY`（:1206）当前查询为 `fights { encounterID name kill fightPercentage startTime endTime }`，**不含任何难度字段**。

**已交付的前端部分**（纯 app.js，零 server.js 改动）：
- `WCL_DIFFICULTY`（1=随机 2/3=普通 4=英雄 5=史诗）+ `getDifficultyText()`（未识别→「未知」）；
- 看板聚合键升级为 `首领名|难度`（实测**一份报告可混难度**：同报告 Chimaerus 英雄击杀+史诗尝试并存，按首领名合并会串难度）；
- 难度列「数据在场才渲染」：`fights` 任一含数值 difficulty 才出列，否则维持四列零回归。

**待裁定激活项**：难度列上线仅需 server.js:1206 查询选择集加 `difficulty` 一词（响应透传 `fights` 整对象，handleWclReportFights 无需改）。红线「不改 server.js」下未动，留运营裁定。

### ③ 版本串

三壳 20261014.92 → 20261014.93（15/8/5，.92 零残留）。

### 其他

changelog 四维补录（问题修复类，置顶）；台账 REQ-161 登记。

## 三、验证方式（真浏览器主链路 + 真实 WCL 数据）

`node scripts/verify-task72-patch.js`（自起 server :15671 → 真实 WCL API → 前端渲染，全链路真实）：

- **A 静态 11/11**：字典 eval 实读 20 项键值逐一相等（含 `'Nek\'zali the Soulcoiler'` 等特殊字符键）；映射/难度函数锚点；看板挂钩；版本串 15/8/5 零残留；changelog+台账；node --check 全量。
- **B1 主链路**：测试公会活动挂真实公开报告 → 登录 → 考勤页打开活动详情 → 看板渲染 4 行首领**全中文**（奇美鲁斯，未梦之神/光盲先锋军/宇宙之冕/弗拉希乌斯），字典内英文原名零残留；难度列降级态表头维持 4 列零回归。
- **B2 函数态**：`getBossName('Some Unknown Boss')` 回退英文；`getDifficultyText` 1/3/4/5/9/null 六值全中（随机/普通/英雄/史诗/未知/未知）。
- **B3 全程零 TypeError / console 零报错**。
- **C 清零复核**：测试活动/公会/账号全删复核为零。

任务书 §五 验证清单对照：1=21 项全覆盖（20≥8）✓、2=B1b ✓、3/4=难度列前端已备+函数映射 B2 ✓（**上屏待 server.js 一词裁定**）、5=B2 兜底 ✓、6=A4 ✓。

## 四、待裁定与申报

1. **【已激活 2026-10-14】难度列**：运营裁定放行后已执行——server.js `WCL_REPORT_FIGHTS_QUERY` fights 选择集补 `difficulty` 一词（响应整对象透传，其他零改动），verify-task72-patch 复跑 **21/21**：真实报告看板五列上屏（首领/难度/击杀/尝试/最佳进度），混难度报告同首领按难度分行（奇美鲁斯，未梦之神 英雄/史诗两行实证），难度值全部合法。版本串随 app.js changelog 订正同步 bump `.94`→`.95`（三壳 15/8/5 零残留）。
2. **通知示例译名纠错**：「缚魂者奈克扎里」实为「盘魂者内克扎莉」；「Ula'tek→乌拉泰克」实为「乌拉特克」（均 EJ 官方）。字典全部按实证值。
3. **潮缚石窟 WCL 归属**：WCL live zone 53（烈毒之渊）实际并入潮缚石窟首领（Nymrissa Wavecaller）与 12.1.5 新首领 Kith'ix；zone 57（潮缚石窟）WCL 侧 0 encounters。字典按名映射不受 zone 归属影响，申报备查。
4. **至暗之夜 4 世界首领**（鲁阿夏尔/索姆贝兰/普雷达萨斯/克拉格平）不在 WCL 任何 zone 的 encounters 中（worldData 实测），未入典；若后续 WCL 收录其报告，首领名显示英文原名兜底，补丁追加即可。
5. 本批未 commit 未 push（纪律修正后等你统一开核）。
