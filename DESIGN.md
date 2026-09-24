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
