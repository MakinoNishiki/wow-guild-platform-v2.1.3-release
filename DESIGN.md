# DESIGN.md - WoW 团本考勤管理系统

## 气质与意象
- 暗色史诗奇幻风格，灵感来自《魔兽世界》游戏内界面
- 深邃暗夜城堡氛围，搭配金色符文边框发光效果

## 配色方案 (CSS Variables)
- `--bg-primary: #0d1117` — 最深底色（暗夜背景）
- `--bg-secondary: #161b22` — 侧边栏/顶栏背景
- `--bg-tertiary: #1c2128` — 三级层级
- `--bg-card: #1e252e` — 卡片面板背景
- `--border-color: #30363d` — 默认边框
- `--gold: #f0c060` — 主色调（史诗装备光泽）
- `--gold-light: #ffd700` — 悬停高亮
- `--gold-dark: #b8860b` — 暗色金色
- `--text-primary: #e6edf3` — 主文字（月光白）
- `--text-secondary: #8b949e` — 副文字
- `--text-muted: #6e7681` — 弱化文字
- `--blue-highlight: #58a6ff` — 高亮/链接
- `--success: #3fb950` — 成功/治愈绿
- `--warning: #d29922` — 警告/坦克
- `--danger: #f85149` — 危险/删除/DPS

## 职业色
- 战士 #C79C6E、法师 #69CCF0、牧师 #FFFFFF
- 盗贼 #FFF569、猎人 #ABD473、圣骑士 #F58CBA
- 萨满 #0070DE、德鲁伊 #FF7D0A、术士 #9482C9
- 武僧 #00FF96、恶魔猎手 #A330C9、死亡骑士 #C41F3B、唤魔师 #33937F

## 字体排版
- 系统字体栈：`-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei"`
- 标题 18px/600、正文 13-14px、统计数字 24px/700
- 侧边栏标题 16px/700（金色）、副标题 11px
- 移动端导航文字 10px

## 动效与交互
- 页面切换：display block/none（无过渡）
- 按钮悬停：边框高亮 + 微上浮 translateY(-1px)
- 卡片悬停：边框亮度提升 + 阴影扩散
- 模态框：CSS动画淡入 + 遮罩背景
- 侧边栏切换：transform translateX 0.3s

## 布局
- 桌面：侧边栏 200px 固定 + 主内容区 flex
- 移动（≤768px）：侧边栏隐藏，底部固定Tab导航（5项）
- 表格移动端：卡片化堆叠布局
- 弹窗移动端：全屏模式

## 设计禁忌
- 不使用亮色/白色背景
- 不使用圆角超过 8px 的元素
- 不使用过于鲜艳的渐变色
- 不使用卡通风格图标

## 任务书 #59 WP1 新增类登记（门户化 IA）

> 样式集中于 css/main.css 末尾「任务书 #59 WP1」节；全部走 CSS 变量，新增类仅用 .ia- / .home- 前缀。侧栏纵导航退役（DOM 保留、CSS 隐藏），主内容区 margin-left 归零。

### 布局与导航（.ia-）
- `.ia-topbar` / `#iaTopbar` —— 一级 tab 栏容器（40px 高）
- `.ia-brand` / `.ia-brand-logo` / `.ia-brand-name` / `.ia-brand-sub` —— 品牌区
- `.ia-tabs` / `.ia-tab`（`.active` = 金色 2px 下划线，`data-ia-tab="team|house"`）—— 一级 tab
- `.ia-top-right` / `.ia-login-btn`（`#iaLoginBtn`，游客可见）—— 登录/注册入口
- `.ia-subnav`（`#iaSubnavTeam` / `#iaSubnavHouse`）—— 二级导航 pill 条
- `.ia-pill`（`.active` = 金边金字淡金底，`data-ia-key` = 页签 key；`#iaPillDatacenter` 与 `#navDatacenter` 显隐同步）—— 二级导航项
- `.ia-uc-btn`（`#iaUserCenterBtn`，登录后显示；`.notif-dot` 通知点宿主迁此）—— 顶部栏用户中心按钮
- `.ia-version`（`#appVersion` 自侧栏 footer 迁入顶部栏）
- `.ia-guide-actions` —— 引导卡/占位卡按钮行

### 首页与 QQ 悬浮钮（.home-）
- `.home-hero` / `.home-hero-title` / `.home-hero-gold` / `.home-hero-sub` —— 导航页 hero
- `.home-entry-grid` / `.home-entry-card` / `.home-entry-title` / `.home-entry-desc` —— 双一级入口卡
- `.home-quick` / `.home-quick-link` —— 「无需登录」快捷入口行
- `.home-guide-card` —— team-guide/community 居中卡（复用 .card）
- `.home-qq-float`（`#homeQqFloat`）/ `.home-qq-btn` / `.home-qq-pop`（含 `::after` 指向三角）/ `.home-qq-qr` / `.home-qq-name` / `.home-qq-num` —— 首页 QQ 用户群悬浮钮（44px 圆角 8px 金线描边，z-index 55；仅 #/home 显示；hover/focus-within 纯 CSS 出码，reduced-motion 直呈终态；白底卡托同 .fb-qr-wrap 口径保扫码率）

### 既有类覆写（不改旧规则，新节覆盖）
- `.sidebar { display:none }` / `.main-content { margin-left:0 }` / `.menu-toggle { display:none }` —— 侧栏退役
- `.topbar .fb-entry` / `.topbar .fb-entry .fb-btn` / `.topbar .fb-card` —— 问题反馈浮层朝向覆写（按钮下方向下展开，z-index 60 沿用）

### 任务书 #59 WP2 追加（团队管理引导卡正式版）
- `.ia-guide-login` / `.ia-guide-login-text` —— 游客登录行（仅游客可见，iaRenderTeamGuide 控制）
- `.ia-guide-join` / `.ia-guide-hint` / `.ia-guide-join-row` / `.ia-guide-code` —— 邀请码加入主卡（REQ-138 主路径）
- `.ia-guide-or` —— 「或者」分隔线（::before/::after 双侧细线）
- `.ia-guide-create` —— 创建公会次级 ghost 按钮（权重 ≤ 主卡一半）

### 任务书 #59 WP2 需求 4 追加（导航页预览稿 P1 定稿，结构/文案/跳转；视觉项随 WP4）
- `.home-kicker` —— hero 第一行 kicker（金色、letter-spacing 0.2em 加宽字距）
- `.home-hero-light` / `.home-hero-gold` —— 双色主标题「魔兽（浅色）/ 管家（金色）」
- `.home-chip-free` —— 导流卡「免登录」金 chip（描边 + 10% 金底，圆角 12px 走 chip 已注册例外）
- `.home-entry-arrow` —— 导流卡右箭头（margin-left:auto 行尾）
- `.home-locked-strip` / `.home-locked-label` / `.home-locked-pills` / `.home-locked-pill` —— 锁定功能预告带（带锁灰显 pill，纯展示不可点）

## 任务书 #59 WP4 登记（视觉密度五项，2026-09-28）

> 纯 CSS 收口于 css/main.css 末尾「任务书 #59 WP4」节 + data-public.css / decor-public.css 各自作用域内改值；色值零改动，全部走 CSS 变量。

### 按钮三档变量（:root 新增）
- `--btn-h-primary: 40px` / `--btn-fs-primary: 14px` —— 主按钮（.btn-primary）
- `--btn-h-secondary: 36px` / `--btn-fs-secondary: 13px` —— 次按钮（.btn 基类）
- `--btn-h-ghost: 32px` / `--btn-fs-ghost: 12px` —— ghost 档（.btn-ghost/.btn-sm/.btn-xs + 存量小钮提档）

### 提档清单（存量 <32px → ghost 档热区，字号不动）
- `.ia-login-btn` / `.ia-uc-btn` / `.ia-pill` / `.filter-btn` / `.icon-btn`（main.css WP4 节）
- `.dp-toggle`（data-public.css，26→32）/ `.dh-plan-x` / `.dh-pp-back`（decor-public.css，热区 32）
- 豁免（规范钉死，不计入清零）：chip 24px（规范 v2 §4.3 恒定高）、.tag 徽标 20px（§4.2，含 claim-pending-btn 待认领）、纯文字链接 .home-quick-link

### 容器与密度（覆写既有类，无新类名）
- `.content-area > .page` max-width 1400px 居中；`#page-lootdrop` / `#page-decor` / `#page-decor-plan` 1600px（家宅/公示类宽页）
- `.page-title` 22px/700/-0.02em；`.data-table td` 纵向 padding 12→9.6px（-20%）、`#page-reports .stats-rank-table td` 10→8px
- `.dh-grid` minmax 190→210 / `.dp-items` minmax 240→210、gap 10→12；dp/dh 版心 1100→1600
