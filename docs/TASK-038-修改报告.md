# 任务书 #38 修改报告 —— 修复小包：文案与死选择器

- 任务书：`tasks/任务书38-修复小包-文案与死选择器.md`（用户指令原文路径 docs/，实际存档于 tasks/，台账已注明）
- 日期：2026-08-11 ｜ 版本串：`20260811.48 → 20260811.49`（两壳 index.html 10 处 + data.html 6 处，共 14+2）
- 约束：完工送审，不 commit 不 push

## 一、WP1｜BUG-077 批量离队弹窗按钮文案参数化

### 改动

- `js/app.js` `openBatchDeleteModal`（≈4093 行区）：新增模块变量 `batchDeleteLabels = { confirm: '确认删除', busy: '删除中...' }`；函数签名新增可选参数 `confirmLabel` / `busyLabel`，不传参维持默认删除语义；`confirmBatchDelete` 忙碌态/复位均走该变量。
- 调用点扫齐（grep `openBatchDeleteModal` 全 2 处逐一核对）：
  - `memberBatchDepart`（≈2930 行，成员批量离队）：传 `confirmLabel: '确认离队'`、`busyLabel: '离队中...'`；
  - `activityBatchDelete`（≈4120 行，活动批量删除）：不传参，保持「确认删除/删除中...」。
- 弹窗标题/正文语义核查：标题由调用方传入（「批量离队（N）」/「批量删除活动（N）」）本已正确；正文 warning 文案两处各自语义正确，无需修正。

### 语义扫齐附记

- 成员「批量彻底删除」为独立弹窗 `memberBatchHardDeleteModal`（`index.html:1106-1123`，四字解锁 + 「彻底删除」按钮 + 三表历史计数护栏），与批量离队不共用弹窗，语义本已正确，未动（S6 断言守护未误改）。

## 二、WP2｜BUG-075 密码长度文案「至少 8 位」

### 改动

- `js/app.js:1375` `mapAuthError` 422 弱密码提示：「密码不符合要求（至少 6 位）」→「密码不符合要求（至少 8 位）」，附 BUG-075 注释（对齐 gotrue `GOTRUE_PASSWORD_MIN_LENGTH=8`）。

### 全站口径核查清单

| 出现处 | 内容 | 结论 |
|---|---|---|
| `js/app.js:1375` mapAuthError 422 | 「至少 6 位」→「至少 8 位」 | 本次修正（唯一错配点） |
| `js/app.js:1448` passwordRuleError | 「密码至少 8 位，且需包含字母和数字」 | 原已正确 |
| `index.html:51`（注册）/ `index.html:1751`（用户中心改密码）占位符 | 「至少8位，需含字母和数字」 | 原已正确 |
| `js/cloud.js` / `data.html` | 无密码长度文案 | — |

核查方式：四文件 grep「至少 6 位」「至少6位」零残留（changelogData 变更记录引用旧文案字面除外，属台账性质）；「至少 8 位/至少8位」三处断言在位。

## 三、WP3｜BUG-076 main.css 死选择器清理

### 删除（三处，删前逐处核消费点零引用）

1. `@media (max-width: 768px)` 内 `.guild-bar { padding: 6px 12px; }`（原 3391 行）；
2. 4021 区组选择器 `.guild-bar-role,`（盾形徽章规则首行）；
3. 4036 区组选择器 `.guild-bar-role::before,`。

来源：task#36 侧栏公会行删除后 `.guild-bar`/`.guild-bar-role` 在 js/index.html 零消费点。删后在 4020 区加 BUG-076 注释说明取舍。

### 保留（消费点核实在用，一个不动）

- `.guild-member-role`：`js/app.js:1826`（公会设置成员列表）、`js/app.js:1937`（切换公会弹窗列表）；
- `.role-badge`：`js/app.js:661`（topbar 身份徽章）、`js/app.js:2046`（公会卡）、`index.html:181/1701`。

### 复核

剔注释后 `grep guild-bar css/main.css` 零残留（S3 断言）；`.guild-member-role`/`.role-badge` 选择器在位（S4）。

## 四、版本串与 changelog

- 版本串 `20260811.48 → 20260811.49`：index.html 10 处 + data.html 6 处（css/js 引用 query 串，14+2 口径），两壳同步 replace_all。
- changelog（`js/app.js` changelogData 顶部）补录三条 fix：
  1. `bug077-batch-depart-label` 批量离队弹窗按钮文案修正；
  2. `bug075-password-8-chars` 密码长度提示统一「至少 8 位」；
  3. `bug076-dead-selectors` main.css 死选择器清理。
- 台账：`docs/问题与需求清单.md` 登记 BUG-077/075/076（🔧 已修复待验收，注明仓库副本 tasks/ 路径）。

## 五、验证证据

### 5.1 新增脚本 `scripts/verify-task38.js`（17/17 通过）

- S 组静态断言：S1 全站无「至少 6 位」残留（排除 changelogData）｜S2 八位口径三处在位｜S3 main.css 剔注释零 guild-bar｜S4 徽章族选择器在位｜S5 版本串两壳 .49｜S6 彻底删除独立弹窗未误改。
- B 组：B3 注册页占位符逐字「至少8位，需含字母和数字」｜B1 mapAuthError 422 浏览器内直调=「密码不符合要求（至少 8 位）」。
- A 组真点击主链路：A1 members 勾选 `.member-row-checkbox`→点 `#memberBatchDepartBtn`→弹窗标题「批量离队（1）」按钮=「确认离队」｜A2 忙碌态参数化=「离队中...」｜A3 attendance 勾选 `.activity-select-checkbox`→点 `#activityBatchDeleteBtn`→按钮=「确认删除」｜A4 删除入口忙碌态=「删除中...」。
- C 组 §2 computed 回归：C2 topbar `.role-badge` display=flex（flex 容器子项块化，inline-flex→flex）/height 20px/font-weight 600/盾形圆角 5px 5px 8px 8px｜C3 `::before` 图标 role-owner.svg 12px｜C4 切换公会弹窗 `.guild-member-role` 同族全项生效。
- 全程零 JS 报错；测试数据 T38A 前缀自清，复核全 0。

### 5.2 回归全量（全绿清零）

| 回归组 | 结果 |
|---|---|
| verify-task27-wp1 | 8/8 ✓ |
| verify-task27-wp2 | 27/27 ✓ |
| verify-task27-patch | 24/24 ✓ |
| verify-task29-wp1 | 27/27 ✓ |
| verify-task32 | 16/16 ✓ |
| verify-bug071（task33） | 15/15 ✓ |
| verify-task34 | 18/18 ✓ |
| verify-task35 | 13/13 ✓ |
| verify-task36 | 10/10 ✓ |
| verify-task37（毒咒+308 基线） | 25/25 ✓（首轮 24/25：A5 版本串断言写死 .48 被本任务 .49 递增顶掉，已将断言改为「两壳单一串且一致」后复跑全绿，308/104/204 基线逐值复测零漂移） |
| npm test | 5/5 ✓ |
| SEC-001 verify-authz | 34/34 ✓ |

各组测试数据自清复核全 0。

## 六、改动文件清单

- `js/app.js`：WP1（batchDeleteLabels + 两参数 + 忙碌态）、WP2（mapAuthError）、changelog 三条、版本串引用
- `css/main.css`：WP3 三处删除 + BUG-076 注释
- `index.html` / `data.html`：版本串 .48→.49（10+6 处）
- `scripts/verify-task38.js`：新增验证脚本（17 断言）
- `scripts/verify-task37.js`：A5 版本串断言去硬编码（.48→两壳单一串一致判定），防止后续递增任务误报
- `docs/问题与需求清单.md`：台账三条
- `docs/TASK-038-修改报告.md`：本报告

## 七、遗留申报

- 无已知遗留。
- 出入注明：任务书存档路径用户指令写 docs/，实际为 `tasks/任务书38-修复小包-文案与死选择器.md`，台账按实际路径登记。
- C2/C4 断言首轮按 `inline-flex` 字面断言失败，查明为 flex 容器子项块化（inline-flex→flex，CSS 规范行为），规则本身生效无误；断言已改为两者皆收，非产品缺陷。
