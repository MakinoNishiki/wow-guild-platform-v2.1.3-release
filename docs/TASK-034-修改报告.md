# 任务书 #34 修改报告：小件包四合一（REQ-104/106/108/109）

> 日期：2026-08-11 ｜ 执行：Kimi Code ｜ 版本串：20260811.44 → **20260811.45**（index.html 10 处 + data.html 6 处全量同步）
> 范围：WP1 密码校验失败抖动 / WP2 topbar 秒级时间 / WP3 仪表盘看板细分 / WP4 考勤弹窗批量按钮精简。
> 红线自查：零依赖、零 schema 变更、未碰 server.js/RLS/密钥；测试数据自清理复核为零；**未 commit 未 push**。

---

## 一、修改文件清单

| 文件 | 位置 | 改动 |
|---|---|---|
| css/main.css | 任务书 #32 规则后 | WP1：@keyframes pwShake（0.4s、≤8px 衰减摆动）+ .pw-shake + `@media (prefers-reduced-motion: reduce)` 降级；WP3：.stat-sub 细分行样式 |
| js/app.js | 新增 shakePwField/isWeakPassword422 + blur 绑定块 | WP1：一处实现两处复用；可重复触发（移除类→强制 reflow→再添加）；422 判定（status=422 / code=weak_password） |
| js/app.js | `changePassword()` | WP1 触发：ruleErr→ucPwNew、新=旧→ucPwNew、两次不一致→ucPwConfirm、catch 422→ucPwNew |
| js/app.js | `handleRegister()` | WP1 触发：前端兜底校验失败→regPassword、catch 422→regPassword |
| js/app.js | `init()` | WP2：renderTopbarTime（YYYY/M/D 周X HH:MM:SS）+ setInterval 1s，`document.visibilityState==='hidden'` 跳过写入 |
| js/app.js | `renderDashboard()` 统计卡 | WP3：团员卡细分行（正式/替补/试用/离队，0 段不显示、存量英文状态归并）+ 本月活动卡「取消 X 个」（0 不显示） |
| js/app.js | changelogData 顶部 | 补录四条（功能优化 ×4：REQ-104/106/108/109） |
| index.html | 考勤弹窗批量条 | WP4：删「全部缺席/替补/请假」三按钮，保留「全部出席」；grep 自证三按钮引用零残留（共享 handler setAllAttendance 保留在用） |
| index.html / data.html | 版本串 | 20260811.44 → 20260811.45（10 + 6 处） |
| scripts/verify-task34.js | 新建 | 18 项：A 注册页抖动 4 / B topbar 时间 2+主链路 1 / C 看板细分 4 / D 改密抖动 3 / E 按钮精简 2 + 零报错 + 清零复核 |
| docs/问题与需求清单.md | 台账 | 登记 REQ-104/106/108/109 |

`node --check` js/app.js、scripts/verify-task34.js 均通过。

## 二、四件实现说明

**WP1 REQ-104 抖动**：CSS keyframes 水平衰减摆动（0/-8/7/-5/3/0px，0.4s ease-out）；JS `shakePwField` 移除类→`void offsetWidth` 强制 reflow→再添加，连续失败可重复触发。触发两路：①前端校验失败——新密码不合规→`ucPwNew`、两次不一致→`ucPwConfirm`、注册页→`regPassword`；②服务端 422 weak_password（`isWeakPassword422` 判定 status/code/message）→新密码框/注册密码框。红字提示全部保留。
**可达性申报（如实）**：两表单均有 REQ-094 提交门（非空不合规禁用提交），弱密码下「点击提交触发抖动」路径不可达；为让 B1/B2 口径可验收，补了 **blur 触发面**——字段失焦且内容非空不合规时抖动一次（空值不抖）。注册页由此可达；改密「新=旧」也挂了新密码框抖动（不符字段本身）。此为对任务书触发口径的实现层补位，若运营要求去掉 blur 面只留提交/422 两路，一行绑定可摘。

**WP2 REQ-106 秒级时间**：`init()` 内单一定时器，每秒渲染 `YYYY/M/D 周X HH:MM:SS`；`visibilityState==='hidden'` 跳过 DOM 写入（不堆积定时器之外的副作用），可见后下一拍即准确值。SPA 单页生命周期内常驻，登出/切页无泄漏面（topbar 常驻 DOM）。

**WP3 REQ-108 看板细分**：团员总数大数字保留既有口径（非离队计数），下方细分行按 正式/替补/试用/离队 计数动态拼接（0 段不显示、分隔符随段数自适应；存量 active/inactive 英文状态按成员列表徽标同口径归并）；本月活动大数字不变，追加「取消 X 个」=本月 `status='cancelled'` 行数（0 不渲染）。全量 appData 现算，零新增缓存。

**WP4 REQ-109 按钮精简**：index.html 删三按钮，`setAllAttendance` 为「全部出席」仍用故保留；grep 自证「全部缺席/全部替补/全部请假」全仓零残留；弹窗批量条自然收拢（flex 单按钮无空占位）。已取消活动禁用批量条的既有逻辑（`#attendanceBulkBar button` 全禁用）不受影响。

## 三、验证（真浏览器实测，scripts/verify-task34.js，18/18 PASS）

**A WP1 注册页**：A1 §3 连帧——弱密码失焦触发抖动，rAF 采样 39 帧/26 distinct 位移逐帧变化、末帧严格 `none`（animation=pwShake）；A2 可重复触发（500ms 后二次触发仍在播放）；A3 服务端 422（Playwright 拦截 signup 返 weak_password）→ 密码框抖动 + 红字；A4 `prefers-reduced-motion: reduce` 降级——computed animationName=none、位移恒 none。
**B WP2**：B1 两采样 2.1s 间隔文本不同且格式 `2026/8/11 周二 18:04:03` 正确；B2 覆写 visibilityState=hidden → 文本冻结不动，恢复 visible → 继续走动且值准确。
**C WP3**（混合样本逐值）：C0 全 0 初始态细分行/「取消」均不渲染；C1 正式 2·替补 1·离队 1（试用 0 不显示、分隔符动态）、大数字 3（非离队口径不变）；C2 无取消活动时无「取消」行；C3 插入 1 个本月取消活动 → 大数字 2 +「取消 1 个」。截图 `c-dashboard-breakdown.png`（已抽看：四卡细分/topbar 秒级时间同框）。
**D WP1 改密**：D1 两次不一致（提交路径）→确认框抖动，rAF 26 distinct、末帧 none、红字保留；D2 空新密码提交→新密码框抖动+「请输入密码」；D3 拦截 updateUser PUT 返 422→新密码框抖动+就地提示、弹窗不关不登出。
**E WP4**：E1 批量条仅剩 1 按钮「全部出席」；E2 点击后全 select=出席 + REQ-055 统计行联动「已登记 3 人：出席 3」。
全程零 JS 报错（422=故意拦截路径已排除）；测试数据清零复核全 0。

## 四、回归八组全绿

| 项 | 结果 |
|---|---|
| verify-task34（本包） | **18/18** |
| verify-task27-wp1 | **8/8** |
| verify-task27-wp2 | **27/27** |
| verify-task27-patch | **24/24**（后台批次汇总行因输出缓冲未抓到，已单独复跑确认 exit=0） |
| verify-task29-wp1 | **27/27，SKIP 0** |
| verify-task32 | **16/16** |
| verify-bug071（task33） | **15/15** |
| npm test（server-security） | **5/5** |
| SEC-001（verify-authz.js） | **34/34** |

各组测试数据清零复核均为 0（T34A 前缀全 0；task27/task29/task32/bug071 各前缀复核全 0）。

## 五、§1 副作用审计单（四件各自影响面逐项）

| WP | 触及约束 | 可能影响的既有行为 | 验证方式 | 结论 |
|---|---|---|---|---|
| WP1 | @keyframes/.pw-shake 新增 | **动画性能**：transform-only、0.4s 单次、无 layout 属性；reduced-motion 降级 | A1/A4 连帧与降级断言 | 无 |
| WP1 | changePassword 校验路径加抖动 | **REQ-094/096 链路**：校验顺序、提示文案、强制登出逻辑零改动，抖动为纯增量 | D1-D3 + task29-wp1 27/27 回归（B1-B6 改密链路全绿） | 无 |
| WP1 | handleRegister 加抖动 | **注册链路/提交门**：updatePwGate 禁用逻辑未动；422 判定只在 catch 追加 | A3 + task29-wp1 A 组 8 项回归 | 无 |
| WP1 | blur 绑定三字段 | **输入体验**：仅失焦且非空不合规时抖一次；空值不抖；不影响 oninput 强度条 | A1/A2 + D 组实测 | 无（补位口径已申报） |
| WP2 | init() 单定时器 | **初始化/登出**：topbar 常驻，定时器无清理需求；hidden 跳过写入不堆积 | B1/B2 + 全回归零报错 | 无 |
| WP3 | renderDashboard 统计卡 | **看板大数字口径**：团员总数（非离队）与本月活动次数大字均未变，细分为追加行；最近活动/Top5 数据源未动 | C0-C3 逐值 + task32 16/16 回归（最近活动区块） | 无 |
| WP3 | 存量英文状态归并 | **成员状态口径**：active/inactive→正式/离队 与成员列表徽标同函数口径，仅显示层归并 | C1 逐值断言 | 无 |
| WP4 | 删三按钮 | **考勤弹窗其余功能**：全部出席/单个标记/勾选批量/保存/取消/删除活动逻辑零改动；已取消活动禁用批量条逻辑覆盖剩余按钮 | E1/E2 + task27 三组回归（考勤主链路） | 无 |
| WP4 | setAllAttendance 保留 | **共享 handler**：出席按钮在用；REQ-017-A attPickMark 同口径注释引用不变 | grep 引用核查 + E2 | 无 |

## 六、§4 数据样本前提声明

- **WP1 样本**：注册页弱密码 `abc12345`（黑名单）、合规 `T34abcd12`；改密样本 两次不一致/空新密码/合规新密码；服务端 422 样本 = Playwright 路由拦截构造（gotrue 规则与前端对齐后真实 422 难以自然触发，如实声明为拦截注入）。
- **WP2 样本**：topbar 真实时钟两采样 + visibilityState 覆写构造隐藏态（`delete document.visibilityState` 还原，无副作用残留）。
- **WP3 混合样本**（自建自清理）：正式×2/替补×1/试用×0/离队×1 成员 + 本月正常活动×1 + 取消活动×1；全 0 初始态先于样本插入断言。
- **WP4 样本**：3 名活跃成员的考勤弹窗实测「全部出席」。
- **存量真实数据**：线上真实公会/成员只读未动；T34A 前缀自清理复核为零（guilds/raid_members/activities/profiles/auth 全 0）。

## 七、遗留与后续

- **mapAuthError 文案观察项**（不改，如实申报）：422 weak_password 现映射为「密码不符合要求（至少 6 位）」，与 gotrue 实际最小 8 位（GOTRACE_PASSWORD_MIN_LENGTH=8）不符——系 REQ-094 时期既有文案，本包未动，建议下批顺手改「至少 8 位」。
- B 表 5 项（运营手工）随批交付。
- 台账 REQ-104/106/108/109 已登记；changelog 四条「功能优化」已补录。
- **未 commit 未 push**，报告 + 审计单送审。
