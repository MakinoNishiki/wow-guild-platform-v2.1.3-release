# TASK-058-补丁 修改报告：组单入口可识别性优化（卡片按钮 + 详情弹窗入口）

> 执行：Kimi Code ｜ 2026-09-23 ｜ 状态：送审（未 commit / 未 push）
> 任务书：tasks/任务书58-补丁-组单按钮与详情弹窗入口.md

## 一、前置自查

- `git pull`：工作区已对齐 master（顶端 d348c4c 任务书#58-WP1，任务书全文 pull 后通读）。
- 规范通读：《开发规范》V1.0、《ui设计参考》、UI 工作方法；开工铁律三件套齐。
- UI 审计前置（improve-ui，范围限定卡片/详情弹窗/方案单段）结论与处置：
  1. **状态同步断点**（已测量）：cardHtml 渲染不读 plan.items、planAdd 不重渲卡片——双态按钮必须在 planAdd/planSetQty/planRemove 后统一刷新入口文案 → 本次以 `planRefreshEntries()` 收口（挂在 `planRender()` 空清单早退之前）。
  2. **focus-visible 漏登风险**（已测量）：角标退役后新按钮须按 decor-public.css 既有补登块范式登记 → 已补 `.dh-card-add:focus-visible`（弹窗按钮走 `.btn` 体系 + `.dh-detail-add`）。
  3. **弹窗滚动容器**（已测量）：`.dh-modal` 为 overflow-y:auto，底部按钮放文档流随内容滚动，未用 fixed/sticky。
  - 不破坏锚点清单（.dh-cost-badge 角标、卡片点击开详情、stopPropagation、planRender 早退、99 钳制）逐项核对未动。
- 已知取舍（不计问题）：移动端封存不做触屏特化；禁动画库，仅 transition transform/background-color。

## 二、执行明细（修改文件 6 + 物料 2）

| 文件 | 改动 |
|---|---|
| js/decorData.js | ① cardHtml：图标角标 ＋（.dh-add-plan）退役，卡片底部新增通栏按钮 `.dh-card-add`（data-add 不变，stopPropagation 不变）；② 新增 `planQtyOf/planAddLabel/planRefreshEntries` 双态同源助手（常态「加入方案单」/ 已加入「已加入 ×N」）；③ `planRender()` 首行挂 `planRefreshEntries()`（早退前执行，抽屉步进/移除后卡片与弹窗文案实时一致）；④ `planAdd(recordId, from)` 增 from 形参，埋点 `decor_plan_add` from: card（默认）/ detail；⑤ openDetail 底部新增 `.dh-detail-add` 主按钮（btn btn-primary 制式，同 data-add，点击 planAdd(rid,'detail')） |
| css/decor-public.css | `.dh-add-plan` 样式段整体退役；新增 `.dh-card-add`（通栏 32px 高、圆角 6px、幽灵金描边常态 / `.added` 实心金底深字、:active scale(0.97)、focus-visible 金 outline、tabular-nums、nowrap）与 `.dh-detail-add`（通栏主按钮，`.added` 降幽灵金描边）+ `.dh-detail-add-row`；reduced-motion 降级块选择器换名 |
| index.html / decor.html | 版本串 20260923.73 → **20260923.74**（index×15 / decor×6，含顶部注释；开发规范第五章第 6 条） |
| docs/开发规范.md | 第七章事件清单 decor_plan_add 行：props 更新为 `{from: 'card'/'detail', record_id}`，触发语义补双入口说明（登记制同步，server.js TRACK_EVENTS 名单不变） |
| scripts/verify-task58.js | WP1 门禁跟随新现实：A3c 改写（通栏按钮+双来源埋点锚点）、新增 A3e/A3f 补丁锚点（含 dh-add-plan 零残留断言）、B8 扩三段（双态刷新/弹窗同刷/from 双来源）、addN 选择器换名、VER=.74 + 旧串零残留断言、头部注释补录 |
| backup/2026-09-23-task58-patch/ | 截图物料 8 张 + shots.js（gitignore 物料区，本地留存） |
| diff-task58-patch.txt | 全量 diff 物料（gitignore，本地留存） |

**未动红线**：抽屉结构/导出弹窗/保存链路/埋点挂点（仅 from 取值扩展）、server.js 白名单、track.js、cloud.js、app.js、sql 全零触碰；WP2 范围（assets/decor-brand、任务书58-WP2）未介入。

## 三、硬门验证输出

- `node --check`：js/decorData.js、scripts/verify-task58.js 全过（verify A8 段另锁 cloud.js/app.js/server.js 全过）。
- `node --test test/server-security.test.js`：5/5 pass。
- **verify-task58 全量 47/47 绿**，实测要点（真浏览器 Playwright，自起 server 15658）：
  - B8a 卡片通栏按钮：点击不触发详情弹窗；「加入方案单」→「已加入 ×1」即时刷新 + added 态在场；
  - B8b 详情弹窗：入场即同步「已加入 ×1」→ 弹窗点击 qty+1 → 弹窗与卡片文案同刷「已加入 ×2」（验收链路"卡片 ×2 → 弹窗同步 → 弹窗再点 → 抽屉 qty 一致"全覆盖，抽屉侧由 B1-B4 既有断言锁定）；
  - B8c 埋点 from 双来源：card×4 + detail×1 在场，204 非吞（B6b/B6c 入库复核绿）；
  - B7 768px 抽屉全宽、B9 双壳 DOM 同构、B10 零 JS 报错零意外 4xx；C 段测试数据四清零。
- 截图物料（backup/2026-09-23-task58-patch/，公示壳+登录壳 × 1440/768）：
  pub-1440-grid-dualstate / pub-1440-modal-added / pub-1440-modal-normal / pub-768-grid-dualstate / pub-768-modal-added / app-1440-grid-dualstate / app-1440-modal-added / app-768-grid-dualstate（768 窄屏按钮不断行不溢出，目视复核）。

## 四、sha256 物料（diff 后复算）

```
6ce127151d5730943e374f8acfc6e5970f8a745078564afdaa50b916779f5862  js/decorData.js
70a19fef7a66531049e9be364936a5c027d89d26332f37fed52f4f5f5202699a  css/decor-public.css
ed15d93ec08d826976e269dc257c038713ae40223cbd254bd88798a2ce0df817  index.html
4540a16c45c878b8b839de66d245ac19fcd66a6e1fbc1e1cd82518499f2c3e34  decor.html
8aea13b45fea0e05ee43181b09f044fcf408432fbc9c63f41d694bc77d76bf4f  docs/开发规范.md
588438948df7c8a1f65c6659965a19d1ecfb9c631577d9f6edededc62a06ee59  scripts/verify-task58.js
ffd1228bb9c630be4837403407f9f98d6221aa0afe77c6cc246e8f99c58954c3  diff-task58-patch.txt
```

## 五、设计决策备查（送审确认点）

1. **双态视觉方向**：卡片常态=幽灵金描边（2062 件网格降噪），已加入=实心金底（状态强信号）；弹窗常态=gold 主按钮（书载"主按钮"），已加入=降幽灵。两处语义一致：可执行主行动=实心金，已在单中=状态呈现。
2. **from 默认值**：planAdd 第二形参缺省 card——render() 既有绑定零改动，弹窗显式传 'detail'；server.js 白名单不变。
3. **终审打回修复（2026-09-23 复送）**：卡片加单按钮补 `btn.onkeydown = e => e.stopPropagation()`——焦点按钮 Enter/Space 只加单不冒泡开详情（原 WP1 角标时代既有冒泡行为随本补丁根治）；verify 增补 A3e 静态锚点 + B8d 实测断言（Enter/Space 各一次 ×N+1 且弹窗不开）。
4. **遗留**：应用内更新日志四维补录待运营验收后随 commit 一并处理（git 纪律：验收前不提交）。
