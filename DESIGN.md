# DESIGN.md - WoW 团本考勤管理系统

## 气质与意象
- 暗色史诗奇幻风格，灵感来自《魔兽世界》游戏内界面
- 深邃暗夜城堡氛围，搭配金色符文边框发光效果

## 房间图片与来源（REQ-176）

- 房间图片优先当前客户端HouseRoom关联的UI图集矩形，保存在assets/decor-icons/room-previews/；卡片、详情和方案单继续共用iconSrc。官方数字图标后来到位时优先，不强行覆盖；缺图回退原占位。
- 基础房型原生平面轮廓与主题房原生室内图都属于有效预览，不能将别的房型实景冒充对应图；英文内部名称未经证据不擅译。
- 住宅等级解锁使用独立unlock来源与现有chip组件，不标成任务或成就；来源文本仍统一转义。公告历史价格未核当前版本时不进入正式price字段。

## REQ-196 装备列表详情
- REQ-197补充：分配表左右内边距8px、按列预算固定布局、点数与日期不换行；右侧操作固定可见。主属性复用dp-tag-p1/p2/p3色板，副属性按运营要求#1eff00/12%背景，标签11px/20px高；仅分配表生效，不修改副本图鉴配色。
- `.loot-detail-trigger`：图标与名称共用按钮，图标32px、金色名称14px/600，inline-flex居中同排、间距8px；REQ197首列按220px预算随表宽分配，过长名称省略并保留完整title与详情，宽表最小1280px。hover提亮、focus-visible金色轮廓，无下划线。
- 名称下方仅显示原始快照的“拾取人：角色 · 服务器”（12px灰字），与最终分配对象分离；缺来源人物写“未记录”，手动记录不伪造来源；团本、日期只在各自列展示。
- 主副属性逐字段优先记录值，缺失时复用详情匹配的图鉴属性名称；未知或歧义留“—”，不按实际装等推算数值，不回写历史记录。
- `.loot-detail-popover`：body内fixed浮层，360px上限/视口8px边距，背景与边框沿用变量，圆角8px，z=60（普通表格上、编辑弹窗下）；长内容内部滚动。
- 内部复用副本掉落`.dp-item-*`卡片，长名称/特效完整显示；本次记录与图鉴参考分区，绝不用本次装等覆盖图鉴数值所属档。
- 鼠标hover/键盘focus显示，可移入阅读；Escape、点外、切页或外部滚动关闭，无新增动效。

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

## 任务书 #62 登记（反馈快赢批，2026-09-30）

### 既有类行为变更（不改旧规则，main.css 末尾 #62 节覆盖）
- `.ia-brand` —— 品牌区可点击回 `#/home`（BUG-109：cursor:pointer + hover 时 `.ia-brand-name` 金色高亮，色取 `--gold-light` 既有变量）

### 新增类
- `.loot-item-icon` —— 装备分配/心愿单列表装备名前置 20px 小图标（REQ-150；#46 掉落卡片同族口径：空值不渲染、404 onerror 隐藏不占位、lazy 加载；装备分配与心愿单两列表共用此类）

## 任务书 #64 登记（体验批，2026-10-13）

### 新增类
- `.dp-tier-count` / `.dp-tier-pieces` / `.dp-tier-piece` / `.dp-tier-piece-name`（data-public.css）—— REQ-148 套装一览「共X件」展开钮与明细行：胶囊钮 22px 高 11px 字（.dp-count 同族），箭头默认收起向右 -90°、.open 归位向下；明细行与 .dp-tier-bonus 同排版规格（部位 .dp-tag + 兑换物名），REQ-089 落地后仅换数据源样式不动
- `.item-db-history` / `.item-db-history-head` / `.item-db-history-caret` / `.item-db-history-body`（main.css）—— REQ-149 picker 历史赛季折叠组：默认收起（.open 展开），组头虚线分隔降一档、箭头 ▸ 展开旋转 90°；任一筛选生效 JS 自动加 .open
- `.dh-group-note`（decor-public.css）—— 筛选组说明小注（11px 灰、紧贴组头、可换行），首发于 BUG-108「主题风格」组口径说明

## 任务书 #65 登记（扩展版，2026-10-13）

### 新增类
- `.item-card-icon-img`（main.css）—— picker 卡片 Blizzard CDN 图标（REQ-156/WP3.1）：填满 `.item-card-icon` 容器（100% 宽高自适应 44px 基档/40px 移动档）、`object-fit: cover`、5px 圆角；`icon_name` 白名单字符校验通过才渲染，CDN 加载失败 onerror 回退 📦（与 #46/.loot-item-icon 同族口径：空值不渲染、lazy 加载）
- `.tier-mode-switch`（main.css）—— 装备分配/心愿单弹窗标题行「普通装备/套装装备」切换钮组（WP3.2）：margin-left:auto 右贴关闭钮，激活钮加 .btn-primary 高亮
- `.tier-slot-cap` / `.tier-slot-cap.active` / `.tier-slot-cap.disabled`（main.css）—— 套装部位胶囊钮（WP3.2）：样式复刻 .secondary-stat-tag 族（20px 圆角胶囊、金色 active 渐变），单选语义（任务书 3.2「单选/多选」未定，按线框图单选实现，待运营确认）
- `.tier-set-name`（main.css）—— 套装名称只读行（WP3.2）：命中显示套装名（金色），未命中灰字「该职业专精当前赛季无套装记录」

## 任务书 #84 图标资源选择（2026-11-02）

沿用现有家宅卡片/详情及方案单CSS尺寸。优先目录真实官方图；原物品图替代项可用按record_id登记的512px透明模型缩略图；模型加载失败回原物品图，再失败回占位。映射唯一真源=DecorDict.MODEL_ICON_OVERRIDES，选择入口=decorData.js iconSrc，模型不得冒用FileDataID路径。静态缩略图仅展示实体，动态叠加光效面不作为实体材质显示；失败仍保留原图回退。

## 物品图标品质描边（REQ-179）

物品及装备图标统一使用 `data-item-quality="0…7"` 和 `css/main.css` 品质色板。品质顺序为粗糙 #9D9D9D、普通 #FFFFFF、优秀 #1EFF00、精良 #0070DD、史诗 #A335EE、传说 #FF8000、神器 #E6CC80、传家宝 #00CCFF。优先使用记录品质；当前掉落目录缺字段时可用 12.1.5 客户端中同名且品质一致的已核对照。品质缺失或存在歧义时使用组件默认中性边框。品质与职业色、主题色分别维护。新增物品图标入口须复用该规则。

## REQ194 / REQ195 登记（2026-11-16）

- 装备分配新增 `.loot-next-step` 说明未核对的下一步，`.loot-item-level` 独立装等数字列；分配表最小宽度1280px，窄桌面在表内滚动，装备名最小180px避免竖排。获得者选项及选中值复用IconMap职业色，原生选择高亮仍由既有样式/系统负责。
- `.person-stat-mode` 复用toolbar/form-select，明确“按团员（新活动）”和“按角色（历史活动）”，禁止两个口径混加；`.person-owner-label` 说明角色所属团员。
- `.person-attendance-row` 复用考勤行，原生details/summary展开实际参战角色；`.person-attendance-add` 提供保存前显式补入名单；`#personLinkModal` 沿用既有弹窗、勾选、主次按钮及错误提示。
- 两块均不改主色、职业配色、图标资产或移动端封存取舍。审计证据见design-plans/req194-loot-feedback.md和req195-person-attendance.md。


## REQ198 分配结果（2026-11-16）
“无人需求”表示已确认没人需要，不等于分解或销毁；获得者清空并禁用，可重新分配。复用中性灰badge-loot-disenchant、form-select及form-hint。只在已分配且存在获得者时联动心愿已获取。


## REQ-199 团队收官交互（2026-11-17）
- 导入预览内增加掉落核对块，12/16px内边距、13px正文、1.6行高、项目边框/背景/金色提示；未知与缺口明示，不阻止有效记录提交。
- 拾取列表装备单元格加入勾选；当前筛选多选最多50件。核对成功清除成功项勾选，失败项保留。
- 批量分配模态宽 min(1120px,100vw - 32px)，正文独立滚动、底部保存固定在模态布局；逐件状态/获得者/首领，活动和方式整批共用。默认待分配，获得者不预选；无人需求无需获得者。
- 保存中禁止关闭和重复提交；逐行显示结果，成功项锁定，失败项可重试。切账号/公会后不可提交旧表单。
- 单件分配内交易参考异步加载，失败不阻止人工核对；取消/未知不表述为成功，不能自动变更最终获得者。
- 访问统计新增口径说明，不变更原图表配色/布局。真实浏览器1366/1920验收，移动端继续封存。

# REQ-201 家宅导出增量（2026-11-17）

方案单文字预览增加“包含获取来源（图鉴参考）”复选项，默认勾选，复用`dh-exp-skin`现有标签样式与导出弹窗布局。简洁清单/获取清单共用可编辑文本框、复制及失败全选流程；切换将覆盖手改文本时先确认，取消保留。来源与单件价格为参考，不汇总替代途径成本；图片导出样式不变。

BUG-127补充（2026-11-18）：图鉴详情与文字清单按单件家具的完整来源展示文字去重，保留第一条及原顺序；商人、地点、价格、声望或前置条件不同仍分列。同一来源在不同家具下分别保留，不修改原始数据，不逐行去重原文来源，避免误删多个途径共有的价格/地区。
## 家宅分享的公开页与作者区（REQ-203-WP1）

家宅二级导航保留三个同级入口。家宅图鉴供查询家具，个人方案单供采购，家宅分享供发布与浏览装修作品。分享页内以“公开作品”和“我的作品”区分读者与作者。读者点击标题可直达作品，作者从“我的作品”编辑。创建或编辑时分别选择发布状态与代码可见性，默认勾选状态为关闭。撤回作品要二次确认。

作品列表使用站内金色标题、次级署名、正文与复制操作，长说明在列表保留三行，在详情完整展示。空列表、读取中和读取失败分别反馈。视觉证据见[1366 宽作品页](docs/evidence/req203-20261118/web-gallery-1366.png)和[1920 宽编辑弹窗](docs/evidence/req203-20261118/web-editor-1920.png)。

2026-11-19 家宅作品支持最多四张装修截图。列表以 16∶9 裁切第一张作为封面，详情按原比例展示，缩略图可用键盘切换。编辑器中可更换封面和移除单张。作品原码、公开原码、允许访客一键复制单独呈现，两个勾选项初始关闭。打开公开后原码可以手动复制；“一键复制”决定网站是否提供按钮。[编辑弹窗](docs/evidence/req203-photos-20261119/web-editor-1920.png) · [作品详情](docs/evidence/req203-photos-20261119/visible-detail-1366.png)


## 导航图标（REQ-208，2026-11-19）

团队侧栏 8 项、家宅侧栏 3 项及用户中心 5 个页签统一用暗铁金边图标。素材存放在 `assets/icons/nav/`，24 单位画布，以 20 × 20 CSS 像素显示。桌面图文间距 8 像素。图与文字共用同一按钮，图标使用空替代文本，数字徽标保留文字。默认显示原色，悬浮及键盘焦点提亮；已选入口保留原有的高亮外框或页签底线。家宅分享采用屋顶与炉石回纹。窄屏用户中心将图置于文字上方，给五个页签和未读数留出空间。[实际界面对照](design-plans/req208-samples/navigation-20px.png)

## 家宅分享图集与蓝图复制（REQ-203 补丁2，2026-11-19）

当前版本的作者编辑器最多接收 8 张截图，每张原图最高 20 MB。图片编号、顺序和第一个封面一起保存。缩略图始终显示“更换”，键盘可聚焦；更换后显示“待保存”，并在状态行报出第几张图。作品详情的返回按钮位于图集上方。

多图卡片默认展示作者的封面，左右半幅支持点击，水平拖动可翻页，角标显示当前张数。作品标题保留进入详情的入口。浏览者只在作品详情、作者允许时看到“复制蓝图码”按钮；读取原码和写入剪贴板在点击后完成。作者编辑器保留原码。该版本取代上方补丁1的四图与公开明码展示规则。[图集实测](docs/evidence/req203-gallery-20261119/web-verification.json)
