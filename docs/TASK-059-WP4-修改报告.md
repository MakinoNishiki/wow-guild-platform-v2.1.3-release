# 任务书 #59 WP4 送审报告：视觉密度五项（纯前端 CSS）

> 日期：2026-09-28 ｜ 版本串：20260923.81 → **20260923.82**（三壳同步：index.html 15 处 + data.html 8 处 + decor.html 5 处，旧串零残留，grep 实证）
> 范围纪律：纯 CSS 变量/类收口 + 3 处空态入口钮 + 1 枚按钮文案；色值零改动；.anx-/.dp-/.dh- 前缀纪律不破（dp/dh 改动落在各自 css 作用域内）；不 push、送审制。
> 取证目录：`backup/2026-09-28-task59-wp4/{before,after}/`（1440×900 与 1920×1080 两视口全套截图 + measurements JSON）；改前/改后由同一脚本 `scripts/verify-task59-wp4-measure.js` 双跑，测试数据由 `scripts/verify-task59-wp4-setup.js` 自建（公会A=12 成员/3 活动+考勤/3 装备/2 心愿；公会B=零数据空态；wp4-noguild=无公会用户），验收后 cleanup 清零。

---

## 一、密度五项：前后对比（全部实测值，证据=measurements JSON + 截图）

### ① 容器放宽

| 项 | 现行值（改前实测） | 新值（改后实测） |
|---|---|---|
| .content-area 左右内边距 | 24px（已达标 ≥24px，不动） | 24px |
| 团队管理页容器（.page） | **无 max-width，全宽**（1440 视口实宽 1392px / 1920 视口 1872px） | max-width **1400px** 居中（1920 实测=1400） |
| 家宅/公示宽页（lootdrop/decor/decor-plan） | 同上全宽 + dp/dh 壳内版心 **1100px** | **1600px**（1920 实测=1600） |
| dp 版心（.dp-header/.dp-filterbar/.dp-main/.dp-footer/.dp-season） | 1100px ×5 处 | 1600px ×5 处 |
| dh 版心（.dh-header/.dh-filterbar/.dh-main/.dh-footer） | 1100px ×4 处 | 1600px ×4 处 |

截图：before/after `1440-members.png`、`1920-members.png`（团队 1400）、`1440-decor.png`、`1920-decor.png`（宽页 1600）。

### ② 卡片网格加密（repeat(auto-fill, minmax(210px, 1fr))，gap 12px）

| 网格 | 现行值 | 新值 | 1440 实测列数 | 1920 实测列数 |
|---|---|---|---|---|
| 家宅图鉴 .dh-grid | minmax(190px,1fr) / gap 12px | minmax(**210px**,1fr) / gap 12px | **6 列**（≥6 达标） | 7 列 |
| 掉落公示 .dp-items | minmax(240px,1fr) / gap 10px | minmax(**210px**,1fr) / gap **12px** | 4 列（≥1400 右栏面板占位 292px，卡区实宽 1100px） | **5 列**（卡区实宽 1308px，改前 4 列） |

说明：1440 视口掉落公示列数未增，系任务书 #43 右栏悬浮筛选面板（≥1400px 固定占位 292px）既有几何守恒，任务达标线「1440 图鉴 ≥6 列」由图鉴承担且实测达标；768 档移动规则（132px/单列）属移动封存口径未动。

### ③ 字号/行距阶梯

| 项 | 改前 | 改后 |
|---|---|---|
| 页标题 .page-title | 18px / 600 / normal | **22px / 700 / -0.02em**（实测 letter-spacing -0.44px=22×0.02） |
| 正文行距 | 1.5–1.7 | 不动 ✓ |
| .data-table td 纵向 padding | 12px 16px | **9.6px 16px**（-20% 精确） |
| 报表排名表 td | 10px 8px | **8px 8px**（-20%） |

行高前后值（实测）：成员表 55.5→**52.7px**；装备分配 63.3→**58.4px**；心愿单 63.3→**58.4px**；报表排名 45.5→**41.5px**。行高降幅小于 padding 降幅的行，系行内容物（20px 徽标/32px 按钮）托底，密度纪律「不靠缩字号」遵守（td 字号 13px 不动）。

### ④ 按钮三档（主 40/14、次 36/13、ghost 32/12）

CSS 变量收口（:root 新增，DESIGN.md 已登记）：`--btn-h-primary:40px/--btn-fs-primary:14px`、`--btn-h-secondary:36px/--btn-fs-secondary:13px`、`--btn-h-ghost:32px/--btn-fs-ghost:12px`。

- .btn-primary → 40px/14（实测：方案单空态钮 35→40px、「添加成员/添加装备」40px、「登录/注册」40px）
- .btn → 36px/13；.btn-ghost/.btn-sm/.btn-xs → 32px/12（btn-xs 字号 11→12）

**存量 <32px 按钮清零清单**（改前全站跨 10+ 页面实测去重 30 枚 → 改后仅余 4 枚豁免，全部为规范钉死或纯文字链接）：

| 类 | 改前实测高 | 处置 | 改后 |
|---|---|---|---|
| .btn-sm（重置筛选等） | 26px | 提 ghost 档 | 32px |
| .ia-login-btn 登录/注册 | 29px | 提 ghost 档热区（btn-primary 叠加取 40） | 40px |
| .ia-uc-btn 用户中心 | 31px | 提 ghost 档热区 | 32px |
| .ia-pill 二级导航 ×9 | 31px | 提 ghost 档热区（字号 13 不动） | 32px |
| .filter-btn 报表范围 ×4 | 30px | 提 ghost 档热区 | 32px |
| .icon-btn 行内图标钮 ✏️/🚪/🗑 | 30×30px | 提 ghost 档 32×32 | 32px |
| .dp-toggle 按BOSS/整体池 | 26px | 提 ghost 档（data-public.css） | 32px |
| .dh-plan-x 抽屉关闭 × | 26px | 热区提 32px（字形不动） | 32px |
| .dh-pp-back 返回图鉴 | ~31px | 热区提 32px | 32px |
| **豁免** .tag.claim-pending-btn「待认领」 | 20px | 规范 v2 §4.2 钉死 .tag 20px 高，徽标形态豁免 | 20px（不动） |
| **豁免** .home-quick-link ×3 | 21px | 纯文字链接（首页「无需登录」行内链接），非按钮形态 | 21px（不动） |

抽样实证 ≥10 枚： measurements-after.json `buttonInventoryAll` 47 枚全量带实测高/字号；截图 `1440-members.png`（图标钮/待认领/添加成员）、`1920-lootdrop.png`（登录注册/dp-toggle/方案单抽屉钮）、`1440-guide-card.png`（加入公会 40/创建公会 32）。

### ⑤ 空态填充三处（不允许整屏空白）

| 空态 | 现状/改动 | 截图 |
|---|---|---|
| 无公会引导卡 | WP2 已含（邀请码主卡+创建公会次级），本批复测不破 | `1440-guide-card.png` / `1920-guide-card.png` |
| 空方案单 | 现行空态本有导流钮，按任务书口径文案改「**去图鉴逛逛**」（dhPpGoDecor，按钮升主档 40px） | `1440-empty-plan.png` / `1920-empty-plan.png` |
| 空数据表格 | 装备分配/心愿单空态文案承诺的入口落成真实按钮「+ 添加装备」「+ 添加心愿」（edit-only 门控，viewer 不见）；报表排名空态补「前往考勤记录」；成员/考勤空态本有「+ 添加第一个成员」「+ 创建第一个活动」不破 | `1440-empty-loot.png` / `-empty-wishlist.png` / `-empty-reports.png` / `-empty-attendance.png`（两视口各一） |

---

## 二、顺手项（挂账清理）处置：showGuildForm **不删，报裁**

任务书口径「showGuildForm 死代码（全仓已无调用）」与现状不符——实查（grep 全仓）：
- `index.html:896` 团队管理引导卡次级按钮「创建公会」`onclick="showGuildForm()"` 仍在调用（WP2 验收链路：打开 authGuildForm 建会弹层）；
- `scripts/verify-task59-wp1.js:201` 断言「点加入/创建公会 → 公会表单遮罩打开」为该链路的在案验收锁。

删除将直接打断 WP2 已验收的建会次级入口。按任务书红线「发现与本文档冲突的现实，先报告运营定夺，不擅自改设计」，本批**不删除**，报运营定夺（若定夺删除，需同步改引导卡按钮跳转目标与 wp1 断言）。

## 三、版本串

20260923.81 → **20260923.82**：index.html 15 处（14 引用 + 1 头注释）、data.html 8 处、decor.html 5 处，逐处同值；`grep 20260923.81` 三壳 + js/ + css/ 零残留。

## 四、DESIGN.md 登记

已新增「任务书 #59 WP4 登记」节：按钮三档变量、提档清单与豁免项、容器/密度覆写清单（无新类名，全部为既有类覆写 + :root 变量）。

## 五、回归与红线

### 5.1 D2 红线回归（未登录组单 → 登录往返 → 组单完整）——三处独立实证全绿

- `verify-task59-wp2.js` §5 D2 登录腿 8/8 ✓（toast→跳 auth=login→自动弹浮层→抹参→登录后组单 2=2+还原提示条）；
- `verify-task59-wp3.js` §5 D2 回归 ✓（同口径复跑）；
- `verify-task59-wp2-d2.js post` 专线 **9/9** ✓（草稿 anon 槽跳转后完整 + 重进方案单页还原 2 行）。

### 5.2 全量回归 verify（本批相关面全绿；存量失修项附 WP4 前树对照实证零 delta）

**本批相关面（全绿）：**

| 脚本 | 结果 |
|---|---|
| verify-task59-wp1.js 主链 | 仅 3 项存量 ✗（见下表对照），其余全绿 |
| verify-task59-wp1-track.js | tab_click 4/4 组合 + PV 5 行入库（修复脚本列名 bug 后，见 5.3-⑤） |
| verify-task59-wp2.js | **37/37** |
| verify-task59-wp2-ghost.js | **6/6** |
| verify-task59-wp2-p1.js | **37/37** |
| verify-task59-wp3.js | **25/25**（含埋点 a1-d4 DB 核对） |
| verify-authz.js | **34/34** |
| npm test（server-security） | **5/5** |
| node --check | app.js / decorData.js / 两个新验证脚本全过 |

**存量失修项（与 WP4 前树逐条对照，失败集完全相同=本批零回归；对照日志 `backup/2026-09-28-task59-wp4/regress-preWP4.log` vs `regress-others.log`）：**

| 脚本 | 失败项 | 根因（均为 WP1~WP3/S2 批次留下的口径漂移，非本批） |
|---|---|---|
| verify-task59-wp1.js | 「游客 引导卡无公会行隐藏」 | WP2 裁定口径变更：游客主卡改禁用预览不再隐藏（index.html:875 注释 + iaRenderTeamGuide 在案），断言失修 |
| 同上 | §2b BUG 取证 ×2 | 该两条为 BUG 复现取证断言（语义=期望重叠存在）；WP1 批内已修（.home-qq-float bottom:84px，注释引 BUG-1 实证），此后恒不成立——批内遗留 |
| verify-task47.js | A1 版本串断言 + #authEmail 超时 | 版本串日期段 20260813→20260923 漂移（任务书 #54 起）；WP1 落地页改版后登录框默认隐藏（脚本仍直填 #authEmail）。前树逐字相同 |
| verify-task43.js | A1/A2/D2/D4/D6 + 超时 | S1 基线 308→318（S2 数据批次漂移）、毒咒样本计数漂移、版本串、同上登录框。前树逐字相同 |
| verify-task51.js | A2/A3 + 超时 | 版本串硬编码 20260919.67、WP3 重定向壳化。前树相同；A7a 网格锚点经本批裁定驱动更新后转绿 |
| verify-task51-wp2.js | A1~A8/B1/B2/D1 + 超时 | WP3 重定向壳化 + 版本串漂移，前树相同（25↔26 见下）；D3/D4/D7/D15 动态口径断言本批自适应转绿值（1366 视口 6 列×8→5 列×8=40/页，断言随实测列数随动 ✓） |
| 同上 | B4「git diff 行数锁」前树 ✓→本树 ✗ | 该断言只在干净工作树成立（退化检查）；送审制下本批未提交，data.html 版本串 8 处递增必触发；且其期望计数 7 为 WP2 时代值。commit 后复绿，不属回归 |

### 5.3 既有 verify 断言的裁定驱动更新（5 处，均注释引用本批）

1. `verify-task51.js` A7a：网格锚点 minmax(190px)→(210px)（②网格加密）；
2. `verify-task47.js` A5：`.dp-season` 基线规则串 1100px→1600px（层叠顺序断言口径同步）；
3. `verify-task58-wp2-1.js` A6/B1a：空态导流钮文案「去图鉴挑装饰」→「去图鉴逛逛」（该脚本另有 WP1 前旧导航选择器/硬编码版本串等存量失修，不属本批，见 §七）；
4. `verify-task51-wp2.js` D3 注释：版心 1100→1600（断言本为实测列数动态口径，仅注释滚动）；
5. `verify-task59-wp1-track.js`：analytics_events 排序列 `created_at`→`ts`（sql/33 权威列名；原写法撞 PostgREST 42703 致「0 行」假象——本批取证时挖出的脚本自身存量 bug，修复后 tab_click 四组合真实入库全绿）。

### 5.4 测试数据清零

wp4  fixtures（2 公会/12 成员/3 活动+考勤/3 装备/2 心愿/2 用户）cleanup 全删复核 0 残留；各回归脚本自清；本机 localhost 当日埋点测试流量按 ip_h（日盐 sha256，127.0.0.1）精确清扫 198→**0 行**（生产真实用户 ip_h 不可能命中本机哈希，零误伤）。

### 5.5 已知取舍/不属本批

- chip 24px（规范 v2 §4.3 恒定高）与 .tag 20px（§4.2，含「待认领」claim-pending-btn）为规范钉死，不入「消灭小纽扣」清零面；
- 表单控件（select/input，如 .dp-tier-filters 28px 下拉）非按钮，不入清零面；
- 768px 移动档规则全部未动（移动封存已知取舍，规范 v2 §8/§9）；
- 验证期 console 404 为装备图标素材未入库（REQ-092 素材待运营供源图，onerror 隐藏不裂图），改前 132 / 改后 136 同族同质（增量=新增空态页访问路径），无 JS 错误。

## 六、修改文件清单

| 文件 | 改动 |
|---|---|
| css/main.css | 末尾新增 WP4 节：容器 1400/1600、页标题 22/700/-0.02em、td padding -20%、按钮三档变量+提档 |
| css/data-public.css | 版心 1100→1600 ×5 处、.dp-items 210/12、.dp-toggle 26→32、注释同步 |
| css/decor-public.css | 版心 1100→1600 ×4 处、.dh-grid 190→210、.dh-plan-x/.dh-pp-back 热区 32、注释同步 |
| js/app.js | 3 处空数据表格补入口钮（loot/wishlist/reports），零逻辑改动 |
| js/decorData.js | 空方案单导流钮文案「去图鉴逛逛」 |
| index.html / data.html / decor.html | 版本串 .82（15+8+5 处） |
| DESIGN.md | WP4 登记节 |
| scripts/verify-task51.js / verify-task47.js / verify-task58-wp2-1.js / verify-task51-wp2.js | 裁定驱动断言滚动（§5.3） |
| scripts/verify-task59-wp4-setup.js / verify-task59-wp4-measure.js | 本批验证代理自建脚本（新增） |

## 七、遗留问题

- showGuildForm 删除与否待运营定夺（见第二节）；
- verify-task58.js / verify-task58-wp2-1.js 等 #58 批次脚本含 WP1 前旧导航选择器（.nav-item）与硬编码旧版本串，属 WP1 前存量脚本失修，不属本批回归面，建议另立小批滚动；
- 更新日志（changelog）四维补录按发布门禁随运营验收通过后补录（与 #59 WP1~WP3 同口径，本批不先行提交 git）。
