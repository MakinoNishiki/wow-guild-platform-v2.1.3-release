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
