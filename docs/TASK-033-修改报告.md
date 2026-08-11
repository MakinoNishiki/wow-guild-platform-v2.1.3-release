# 任务书 #33 修改报告：BUG-071 报表「已删除」伪行行高修正

> 日期：2026-08-11 ｜ 执行：Kimi Code ｜ 版本串：20260811.43 → **20260811.44**（index.html 10 处 + data.html 6 处全量同步）
> 范围：统计报表出勤率排名表「已删除」伪行排版。单点小修：徽标文案与判定语义零改动，正常数据行零触及。
> 红线自查：零依赖、未动共用样式（无需 §1 送审，理由见第二节）、未碰业务逻辑/数据表/RLS；测试数据自清理复核为零；**未 commit 未 push**。

---

## 一、修改文件清单

| 文件 | 位置 | 改动 |
|---|---|---|
| js/app.js | `renderReports()` 伪行名字 td | 伪行 td 加 `rank-deleted-name` 专属类；名字与徽标间的折行空格去掉（间距改由徽标 margin-left 承担）。文案「已删除」、`member.deleted` 判定、`.member-departed`/`.tag-grey` 语义全部零改动 |
| css/main.css | BUG-070 规则之后 | 新增伪行最小选择器 `#page-reports .stats-rank-table td.rank-deleted-name`（nowrap + padding-right:0）与其徽标紧凑化（17px/10px 字/padding 0 3px/margin-left 3px） |
| js/app.js | changelogData 顶部 | 补录「修复BUG」条目（BUG-071） |
| index.html / data.html | 版本串 | 20260811.43 → 20260811.44（10 + 6 处） |
| scripts/verify-bug071.js | 新建 | 三硬约束逐值断言 + 修复目标断言 + 最小选择器/文案语义断言，双档（1366/1920） |
| docs/问题与需求清单.md | 台账 | 登记 BUG-071 |

`node --check` js/app.js、scripts/verify-bug071.js 均通过。

## 二、成因侦察与修法（先侦察后动手，红-绿证据在案）

**成因（红跑实测实证）**：1366 档伪行 `T71A将删丙 已删除` 行高 **59px** vs 正常行 45-46px，徽标 rect top 差 **16px**（=一整行）——折行发生在**第 2 列（名字列）**：表格 auto 布局分给名字列的宽度 < 名字+空格+徽标的 min-content，td 默认 `white-space:normal`，于名字与徽标间的空格处折行，徽标掉第二行。非徽标块级/间距挤压（.tag 为 inline-flex 行内元素）。1920 档列宽充足不折行（红跑即同行）。

**修法（最小选择器，未动共用样式）**：仅作用伪行名字单元格 `.rank-deleted-name`（仅伪行挂载）：
1. `white-space: nowrap` —— 徽标与名字强制同行；
2. 徽标紧凑化（17px 高/10px 字/padding 0 3px）+ 折行空格改 3px 外边距 + td 右内距让位（padding-right:0，徽标是本行最后元素，左缘对齐不变）——压回名字列 min-content。

**为何不是单纯 nowrap（过程记录）**：首版只加 nowrap 时 1366 档 scrollWidth 490→479>468（BUG-058 回退），探针实测列 2 min-content 137px vs 分得 114px、六列表头列已压到 41px 极限——nowrap 把全名+徽标并入列 min-content，须同轮压缩徽标/内距找齐（最终 468=468）。探针脚本一次性使用已删除，数据 T71P 前缀自清理复核为零。

**共用样式零触及**：`.tag`、全表 th/td padding、BUG-070 第 3 列 nowrap 均未改——选择器锚点 `.rank-deleted-name` 只存在于伪行，故无需 §1 送审。

## 三、验证（真浏览器实测，scripts/verify-bug071.js，15/15 PASS，红-绿流程）

红跑（修复前）：1366 档伪行 59px / 正常行 45-46px / top 差 16px / 名字列 normal ——成因与现象实证在案。
绿跑（修复后）逐值：

- **BUG-058 不回退**：1366 档 scrollWidth=**468**=clientWidth；1920 档 761=761
- **BUG-070 不回退**：职业列「死亡骑士」单行不折行（clientHeight 44px ≤ 45px 基准）
- **修复目标**：伪行徽标与名字同行（top 差 ≤4px，折行时差一整行 16px）；伪行行高 45px = 正常行 45-46px（±1）；行高绝对值复测 44-46px 区间（任务书基准 44px 为 BUG-070 验收口径，本样本实测正常行 45-46px，以「伪行=正常行」为硬判定）
- **最小选择器**：伪行名字 td computed `nowrap`，正常行仍 `normal`（零触及实测）
- **语义零改动**：徽标文案「已删除」断言在案；徽标完整落在容器内（双档）
- 全程零 JS 报错；测试数据清零复核全 0

截图 `backup/2026-08-11-bug071/reports-1366.png`（已抽看：伪行第 3 行徽标与名字同行、与正常行同高、表格无横滚、职业列单行）、`reports-1920.png`。

## 四、回归六组全绿

| 项 | 结果 |
|---|---|
| verify-bug071（本包） | **15/15** |
| verify-task27-wp1 | **8/8** |
| verify-task27-wp2 | **27/27** |
| verify-task27-patch | **24/24** |
| verify-task29-wp1 | **27/27，SKIP 0** |
| verify-task32 | **16/16** |
| npm test（server-security） | **5/5** |
| SEC-001（verify-authz.js） | **34/34** |

各组测试数据清零复核均为 0（T71A 前缀八项全 0；task27/task29/task32 各前缀复核全 0）。

## 五、§1 副作用审计单（伪行选择器影响面逐项）

| 触及约束 | 可能影响的既有行为 | 验证方式 | 结论 |
|---|---|---|---|
| `.rank-deleted-name` 只挂伪行名字 td | **正常数据行**：选择器不匹配任何正常行（app.js 仅在 `item.member.deleted` 时挂类）；computed whiteSpace 实测正常行仍 normal | verify 1366 档「最小选择器」断言（正常行 normal/伪行 nowrap） | 无 |
| 伪行 td nowrap | **BUG-058 横滚**：nowrap 抬升名字列 min-content——经徽标紧凑化+右内距让位压回，双档 scrollWidth=clientWidth 逐值实测 | verify 468=468 / 761=761 | 无 |
| 徽标紧凑化（17px/10px） | **.tag 共用组件**：未改 .tag/.tag-grey 本体，紧凑参数仅挂伪行选择器；考勤详情/缺席榜等其他「已删除」徽标保持原尺寸 | 选择器范围审查 + task27 三组回归（考勤详情灰行/垃圾桶链路） | 无 |
| 伪行右内距 0 | **单元格对齐**：左内距不变、左缘对齐正常行；右侧为列内空白区，无视觉错位 | 截图抽看 | 无 |
| 名字与徽标间空格去除 | **文案语义**：间距改由 margin-left 3px 承担，textContent 少一个空格——徽标文案「已删除」不变，无下游解析依赖该空格 | verify 文案断言 | 无 |
| 缺席榜（.rank-list）同名徽标 | **不在任务范围**：缺席榜伪行徽标（app.js:4954）为非表格 flex 行，无 58px 行高问题，未动 | 代码审查 | 无（范围外不动） |
| BUG-070 职业列 nowrap | **零交互**：本包未碰第 3 列规则 | verify 职业列单行断言双档 | 无 |

## 六、§4 数据样本前提声明

- **伪行样本**：报表无现成已删除样本，按任务书如实构造——T71A 前缀：成员 3（死亡骑士「T71A死骑甲」=BUG-070 样本、法师「T71A法师乙」=正常行对照、牧师「T71A将删丙」=伪行样本）+ 活动 1 + 考勤 3 + 硬删走垃圾桶行 + FK SET NULL（与生产真实链路同构）。
- **样本数量**：伪行 1、正常行 2（含 4 字职业名行）；双档（1366×768 / 1920×1080）各测一轮。
- **行高基准口径**：任务书所引 44px 为 BUG-070 验收实测值；本样本正常行实测 45-46px（名字字数为 6-7 字符，行盒随字体度量微差）——硬判定采用「伪行 = 正常行（±1）」+ 绝对值区间 [44,46] 复测记录，未静默放宽。
- **存量真实数据**：线上真实公会/成员只读未动；T71A 前缀自清理复核为零（raid_members/activities/attendance/deleted_raid_members/guilds/guild_members/profiles/auth 全 0）。

## 七、遗留与后续

- 无新增遗留。B 表 3 项（运营手工）随批统一交付验收。
- **已知边界（如实申报）**：极端超长角色名（≫10 字符）的伪行在 1366 档仍可能顶满名字列——正常行同名长亦折行（既有行为），伪行 nowrap 下不折行但列宽以 min-content 参与分配；当前样本（7 字符）与常规名（2-6 字符）双档实测无横滚。
- 台账 BUG-071 已登记；changelog「修复BUG」已补录。
- **未 commit 未 push**，报告 + 审计单送审。
