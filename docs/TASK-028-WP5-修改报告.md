# TASK-028 WP5 修改报告：双壳嵌入 + 更名「副本掉落」（REQ-086 收官）

- 任务：tasks/任务书28-WP5-双壳嵌入更名.md
- 版本串：20260808.36 → **20260808.37**（index.html 10 处 + data.html 6 处，grep 复核零 .36 残留）
- 日期：2026-08-10｜状态：完工送审（未 commit / 未 push）

## 一、改动清单（文件级）

| 文件 | 改动 |
|---|---|
| js/dataPublic.js | F1 渲染层参数化：IIFE 内部 root 可替换（`$ = root.querySelector`），`boot()` 不再即载即跑；暴露 `window.DPLootDrop.mount(root)` / `.activate()`；公开壳（body.data-public-body）自动挂 document，登录壳由 app.js 懒挂载；resize 监听加可见性守卫（tab 隐藏 display:none 跳过测量）；toast 查找改 document 级单例 |
| index.html | head 引入 data-public.css；侧边栏「数据公示 window.open 新标签」→「副本掉落 data-page=lootdrop switchPage 内切换」（图标 📖 沿用）；新增 `#page-lootdrop` 页容器（赛季行 + 筛选条骨架逐字同构公开壳 + #dpMain）；尾部引入 dataPublic.js（app.js 之前） |
| js/app.js | `pageTitles` 加 `lootdrop:'副本掉落'`；`switchPage` 加 lootdrop 分支；新增 `ensureLootdropMounted()`（首次 mount / 此后 activate）；changelog 新增 WP5 条目（新增功能） |
| css/data-public.css | 追加 WP5 作用域段（仅 3 条，全部 `#page-lootdrop` 前缀）：筛选条 `top:56px` 让开 topbar；`.dp-main` 补 200px 池末 hover 缓冲（登录壳无 dp-footer）；赛季行 1100px 版心对齐 |
| data.html | title/h1「数据公示」→「副本掉落」（副标保留）；注释更新；**文件名/URL 不动** |
| docs/魔兽管家UI设计规范v2.md、docs/公示页筛选系统设计规范.md | 文首更名记要（现行名=副本掉落，「公示页」历史字样同指，不逐处改写历史段落） |
| docs/问题与需求清单.md | REQ-086 行：WP4 ✅（2026-08-10）/ WP5 ✅ 已实现待验收 |
| scripts/verify-task28-wp5.js | 新增双壳验证（25 断言，详见 §三） |
| scripts/verify-browser-patch4.js、verify-browser-patch3.js | 环境脆性修复（测试脚本侧，产品代码零改动）——见 §四专项 |

单一真源核查：渲染层/数据通道全项目仅 js/dataPublic.js 一份（grep 无第二处掉落池渲染代码）；双壳差异仅静态外壳骨架（header/footer vs topbar/赛季行），属任务书认可的壳差异。

## 二、真浏览器实测明细（playwright，脚本 scripts/verify-task28-wp5.js，25/25）

- 公开壳：无痕直开 data.html → title=「副本掉落 · 魔兽管家」、h1=副本掉落、三区块渲染、页面无「数据公示」残留、零报错零 404；
- 登录壳：owner 登录 → 侧边栏点「副本掉落」→ **无新标签页**（popup 监听实证）、page-lootdrop 激活、顶栏标题=副本掉落、卡片 309/309 与公开壳一致、首卡同名；
- tab 内交互：搜索「WP5」→ 平铺态「命中 1 件」；重置筛选还原 309；切走再切回 activate() 重测后溢出卡标记保持；
- 吸顶（§2 生效值）：scrollTo(900) 后 `.dp-filterbar` computed position=sticky、**rect.top=56 实测**（让开 56px topbar）；
- 层级（BUG-069 口径）：滚动后卡上半藏至筛选条下 hover 展开，重叠区 `elementFromPoint` 命中 #dpFilterBar（条在上层），截图 `tab-hover-under-sticky.png` 可见卡上半被条正常遮挡、向下展开部分完整可读；
- 主应用零回归：其余 8 页签 pageTitle 逐一断言正确；数据中心超管守卫不变（非超管拦回仪表盘）；退出登录→认证页→再登录→tab 可用；
- viewer：侧边栏可见、tab 渲染 309 卡一致（只读无编辑入口）；
- id 清查：index.html 文档内全部 id 零重复（断言化）。
- 截图：backup/2026-08-10-task28-wp5/（公开壳 / tab 首屏 / 滚动吸顶 / hover 层级 共 4 张，均已回读目检）。

## 三、§3 双向连帧 + §4 样本声明

- tab 内连帧抽验样本 = **1 张确定溢出卡**（WP5 长特效测试掉落，测试后已清理）：展开 0→200ms rAF 逐帧采样单调递增、收回单调递减，行程 34px、最大单帧增量 2.0px（≈6%，≤50% 阈值）；
- 全量 8 张特效卡连帧/textTop0 断言由 verify-browser-patch4（公开壳）覆盖，17/17 全绿——双壳同源同一渲染层，公开壳全量 + tab 抽验即闭环；
- 双壳一致性样本 = **当季 309 件装备卡全量**（计数 + 首卡比对，非抽样）。

## 四、§1 副作用审计单（正式版）

### 4.1 渲染层全局副作用清单（逐处处置）

| # | 副作用点 | 处置 |
|---|---|---|
| 1 | #dpChipToast append document.body（fixed z-2000） | 维持 body 级（视口底部定位所需）；查找改 document 级单例防重复；双壳异文档不同时存在 |
| 2 | fxMirror append document.body（aria-hidden 屏外 -99999px） | 维持 body 级；纯测量镜像零视觉影响 |
| 3 | window resize 监听 | 保留唯一监听（mount 幂等防重）；**加可见性守卫**：tab 隐藏（display:none 量得 0 宽）跳过测量，回 tab 由 activate() 重测校正——防 0 宽污染溢出标记 |
| 4 | sessionStorage 折叠记忆（dp23:collapsed） | 键不变；双壳异文档无共享冲突 |
| 5 | window.matchMedia（reduced-motion） | 只读，双壳安全 |
| 6 | window.IconMap | 只读；index.html 既有引入，加载序在 dataPublic.js 之前 |
| 7 | `$()` id 查找 | 全部改 root 容器作用域（主应用文档存在其他页签 DOM，不得越界） |
| 8 | showError 重试钮 location.reload() | 错误路径保留原行为（双壳同为整页刷新回默认态），记录在案 |
| — | document.title | 渲染层**零操作**（grep 实证）；title 为外壳静态标签，各壳自管 |

### 4.2 主应用 z 层级树核对（本轮零调整，仅核对）

sidebar 100 / topbar 50 / modal 1000 / 菜单 1001 / 移动 tab 999 / loading 9999 / toast 2000（主应用）；筛选条 10 ＞ hover 卡 5 ＞ 普通卡 auto / #dpChipToast 2000（副本掉落组件，五轮规约）。
tab 内核对结论：筛选条(10) ＜ topbar(50)——吸顶点上移 56px 后条在 topbar 之下，无越层；hover 卡(5) 低于全部主应用浮层，弹窗/遮罩不受干扰；#dpChipToast(2000) 与主应用 toast 同级同形态，独立层不动。**本轮未新增/未修改任何 z-index**（仅核对），越层实测见 §二 elementFromPoint 断言。

### 4.3 双壳 id 冲突清查

data.html 与 index.html 为两个独立文档、永不同页，id 复用零冲突；index.html 文档内断言化核查全部 id 零重复（含新增 dp-* 16 枚）。

### 4.4 CSS 泄漏面

data-public.css 全量选择器 `.dp-*`/`.data-public-body` 前缀 + 本轮 3 条 `#page-lootdrop` 作用域规则，零裸 body/html/通配规则——引入 index.html 对主应用零泄漏（其余 9 页签回归断言旁证）。

### 4.5 测试脚本脆性修复与数据事故专项（如实上报）

回归重跑暴露两个**与本补丁无关的环境性失败**（根因 = 回归期间 DB 侧两项演进：sql/13 删 team_tag 列已执行、is_current 翻转 S2→S1 且 S1/S2 套装名均已物化）：

1. **patch4 B10**（team_tag=3→「3 团」徽章）：列已删 → setup 探针 400 → team_label 永远置不上 → 按脚本设计必败。修复（脚本侧 1 行）：列已删分支直接置迁移后终态 `team_label='3'`，B10 等价验证徽章渲染。修复后 17/17。
2. **patch3 C2 前置超时**（数据中心套装赛季下拉选 S1）：S1 成当前赛季后选项标签带「（当前）」后缀，精确 label 匹配失配。修复：赛季选择改名称前缀匹配（容忍「（当前）」）。
3. **⚠ 数据事故（C2 断言暴露的连锁）**：C2 原设计在真实 S1 赛季找「无套装名行」写 2 件效果；套装名物化后该前提已不存在，写入落入 **S1 战士·防护**真实行（覆盖 bonus_2），清理逻辑按 id 误删该行。发现后立即处置：
   - 恢复值取自**官方源双证**：[暴雪官方 12.0 至暗之夜套装新闻](https://wow.blizzard.cn/news/24244458/) + [Wowhead CN item-set 1990](https://www.wowhead.com/cn/item-set=1990/)，并与库内同套装武器/狂怒行逐字比对风格一致（狂怒 4 件与官方文本逐字相同）；
   - 已补回：战士·防护「终夜者的愤怒」，2 件=「盾牌猛击伤害提高10%，盾牌冲锋伤害提高100%。」，4 件=「雷霆一击和复仇的伤害提高10%，盾牌冲锋会使你获得复仇效果！」；复核 S1 tier_sets=40 行、战士三系齐；
   - **根因修复（防再犯）**：C2 改在专用临时赛季（补丁3临时赛季，零数据天然满足「无套装名」前提）执行，清理连临时赛季一并删除并复核——真实赛季字典行永不再被测试触碰。修复后 19/19。
   - 请运营知悉：S1 防护战套装行 id 已变更（内容同官方源），若顾问侧持有该表快照请以此为准核对。

## 五、全量回归（最终代码态，顺序干净执行）

| 套件 | 结果 |
|---|---|
| verify-task28-wp5.js（本 WP 新增） | **25/25** |
| verify-browser-patch4.js | **17/17**（基线 308/104/204 断言在案、不动） |
| verify-task23-patch.js | **33/33** |
| verify-browser-patch3.js | **19/19** |
| npm test | **5/5** |
| SEC-001（verify-authz.js） | **34/34** |

测试数据复核：WP5 前缀（掉落/公会/双用户）、补丁3 临时赛季与临时行均已清理并复核为零。

## 六、验收对照

- F1 双宿主改造 ✔（mount/activate + 容器作用域 + 副作用清查 4.1）
- F2 tab 嵌入 ✔（内切换无新标签 / 吸顶 top=56 实测 / 层级规约 tab 内同效 / 主应用 z 层零干扰）
- F3 更名 ✔（侧边栏/pageTitles/公开页 title+h1/changelog/规范文首记要/台账；页面零「数据公示」残留断言；URL 不动）
- F4 公开壳保留 ✔（patch4/patch/patch3 原样全绿 + 公开壳 4 断言 + 双壳 309 卡一致）
- 运营手工 B 表 6 项（B1–B6）待验收；verify 证据已覆盖 B1/B2/B4/B5/B6 对应链路。
