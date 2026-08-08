# TASK-028 WP3-v2 修改报告 —— 全信息装备卡（方向修正版）

- 任务：tasks/任务书28-公示页改版V2.md §WP3（已按 v2 口径回写）｜ 台账 REQ-086
- 施工日期：2026-08-08 ｜ 状态：**完工待验收，未 commit / 未 push**
- 前置：设计方案 `docs/TASK-028-WP3-设计方案v2.md`（运营 2026-08-08 拍板放行，含补充裁定 G/H）；v1 点击详情层方案/报告已标注废止存档。
- 版本串：`20260808.24` → `20260808.25` 双头（index.html 8 处 + data.html 6 处，旧串零残留）。

## 一、运营五条修正口径落地对照

| # | 口径 | 落地 |
|---|------|------|
| ① | 卡片默认展示完整信息组（名称/主属性+数值/副属性+数值⭐/特效/掉落来源/套装归属） | ✔ 六结构行逐行排列（详见 §二）；js/dataPublic.js `itemCard()` 重写 |
| ② | 仅长特效 hover 悬浮展示全文，复用补丁4 overlay 模式（150–250ms ease-out、只动 transform/opacity、reduced-motion 降级） | ✔ overlay 动画改为 `opacity .2s ease-out, transform .2s ease-out`（translateY(-4px)+fade），reduced-motion 瞬时；下展实底（--bg-card #1e252e 实色）遮严邻卡；patch4 WP3-9/9b 断言锁定 |
| ③ | 卡片零点击交互，v1 点击详情层（单开互斥/Esc/点外）全部移除 | ✔ 拆除清单见 §三；patch4 WP3-4 断言：点击+Esc 后类名零变化、全页零 `.dp-item-detail`/`.dp-detail-open` 残留 |
| ④ | 难度行继续不显 | ✔ 卡片面本就不渲染 tiers；patch4 WP3-5 断言（库内 tiers 全 null + DOM 零「掉落难度」） |
| ⑤ | sql/21 RPC 保留不动 | ✔ 零改动；patch4 WP3-1 断言 RPC 通道 200 |

## 二、补充裁定 G/H 落地

- **裁定 G（逐行排列）**：名称（18px 单行截断）/ meta（20px 单行）/ 主属性（20px）/ 副属性（20px）/ 特效（恒 34px=2 行 line-clamp）/ 来源（16px 单行截断）各占一行、恒占恒高，缺省=空行占位；实测行顶 y 严格递增（[308,332,356,380,406,444]），全页卡片高度差=0（patch4 WP3-2/WP3-3）。
- **裁定 H（副属性降序+星标）**：数值降序稳定排序、唯一最大者⭐（金星 SVG+金描边，§4.2 已注册变体）排第一位；同值并列保持库内原序且不加星（「枯法学者的鎏金长袍」实测）；单副属性值不加星（「艾林先知的凝视」实测——施工中发现初版把单值误判为「唯一最大」加星，已修为 `withVal.length>=2` 才参评）；缺数值只显属性名不加星（裁定 E 不变，「内克扎莉的兜帽」实测，S2 切赛季断言后切回）。
- **主属性色板**（§4.11 落地）：力量 #ff6b6b / 敏捷 #40c057 / 智力 #4dabf7，库内原序；缺数值只显属性名。
- **来源行**：「实例 · BOSS（空=整体池）· 可兑换本赛季套装（仅兑换物）」（确认点 C/F：套装归属并入同行、不显实例类型标注；「鸣响虚空珍玩」实测）。

## 三、v1 点击详情层拆除清单（下线方式）

- `js/dataPublic.js`：删 `detailHtml()`/`INSTANCE_TYPE_LABELS`/`TIER_LABELS`/`openDetailCard`/`closeDetail()`；render() 尾部全卡 onclick 绑定移除；boot() 两处 document 级监听（点外/Esc）移除。
- `css/data-public.css`：删 `.dp-item-detail`/`.dp-detail-*`/`.dp-detail-open` 全族与 `.dp-item{cursor:pointer}`；`.has-effect` 的 `cursor:pointer` 一并移除（零点击语义）；`.dp-item-effect-preview` 单行省略改恒 2 行 line-clamp；overlay 过渡 max-height/padding（F1 例外）→ transform/opacity。
- `scripts/verify-task23-patch4.js`：v1 WP3 断言块（13 项）整体替换为 v2 断言（WP3-1～WP3-10 共 16 项）；① 截断测量 scrollWidth→scrollHeight（2 行 clamp 竖向截断）。
- **保留**：sql/21 RPC、`restRpc()`、boot() RPC 读取链、`_src`/`instance_id` 口径、杂项服务端排除、特效卡金色微光描边（has-effect 引导，已验收行为）。

## 四、偏差与决策留痕（请验收时一并确认）

1. **`.dp-item-note` 卡片面停显**：库内唯一带 note 的行是「鸣响虚空珍玩」（note=「尾王珍玩系列：可兑换套装部位（特效文本以游戏内为准）」）。note 行会破坏六行恒占恒高，且拍板 mockup 的珍玩卡本无 note 行——按 mockup 停显，CSS 类同批移除。**数据未动**（note 仍在库内，RPC 仍透传）；note 中「可兑换套装部位」信息已被来源行「可兑换本赛季套装」覆盖，「特效文本以游戏内为准」为数据注记。如需保留可挂来源行 title 或恢复第七行（牺牲等高），请示下。
2. **cursor 口径**：生产 CSS 不再声明 cursor（计算值 `auto`），断言按「非 pointer」锁定零点击语义。
3. **裁定 H 同值句读**：「同值并列 ⭐ 保持库内原序」按「同值并列不加星、保持库内原序」施工（延续方案 §二 三态规则；⭐ 只给唯一最大者）。若原意是「同值并列均加星」，改一行条件即可，请示下。
4. **库内无「无属性名纯空卡」**：备料探针实测——无特效无值卡仅 S2 两件且均带属性名，空行占位由珍玩卡（主/副/特效三行空）+ 缺值卡（六行齐全）覆盖断言。
5. mockup hover-390 图曾发现 overlay 透底：生产 `--bg-card` 为实色 #1e252e，patch4 WP3-9 已加「实底（alpha=1）」断言；两档 impl 截图确认遮严。

## 五、规范/任务书回写（随施工同批）

- `docs/魔兽管家UI设计规范v2.md`：§4.4「详情卡变体」标注废止、改写「全信息装备卡」规格；§6 删 F1 例外段、改注覆盖层动画 200ms transform/opacity；§4.11 标注落地。
- `tasks/任务书28-公示页改版V2.md`：§WP3 回写 v2 口径（含 G/H）；§WP4 标注台账 REQ-086 划分（排版留白对比度），旧「视图 tab」文案降为存档。
- `docs/TASK-028-WP3-设计方案v2.md` §五并入 G/H 裁定、状态转「已拍板放行」；v1 设计方案/修改报告头部标注「已被 v2 取代」。

## 六、验证（全部真浏览器实测，Chromium，data.html 公示页）

- 三 verify 串行全绿：`verify-task23-patch.js` 33/33、`verify-task23-patch3.js` 28/28、`verify-task23-patch4.js` **62/62**（WP3-v2 块 16 项：RPC 通道/备料/六行逐行排列+色板+非 pointer/恒占恒高高差 0/零点击/难度行不显/降序+星标三态（独特最大⭐、单值无星、同值无星保原序）/套装来源行/缺值卡裁定 E/overlay 动画+实底/reduced-motion/hover 零挤压）。
- `npm test` 5/5；`scripts/verify-authz.js`（SEC-001）34/34，测试数据零残留。
- 全程零 JS 报错、零 404（patch4 尾部断言）。
- 截图（backup/2026-08-08-task28-wp3/，不入库）：`v2-impl-cards-{1366,1920}.png`（常态六行卡网格）、`v2-impl-star-1366.png`（星标卡特写：精通+5⭐ 急速+4）、`v2-impl-hover-{1366,1920}.png`（hover 覆盖层全文态）；patch4 回归截图入 `backup/2026-08-07-task23-patch4/`。

## 七、变更清单

```
M  js/dataPublic.js          （itemCard 六行卡重写 + v1 点击层拆除 + 星标单值修正）
M  css/data-public.css       （六行规则/色板/星标/来源行 + overlay 动画回白名单 + 详情族删除）
M  scripts/verify-task23-patch4.js （WP3 断言块换 v2，13→16 项）
M  index.html / data.html    （版本串 .24→.25，共 14 处）
M  docs/魔兽管家UI设计规范v2.md（§4.4/§6/§4.11）
M  tasks/任务书28-公示页改版V2.md（§WP3 回写 v2、§WP4 台账标注）
M  docs/TASK-028-WP3-设计方案.md / 修改报告.md（v1 标注废止存档）
?? docs/TASK-028-WP3-设计方案v2.md（本版方案，含 G/H 裁定）
?? docs/TASK-028-WP3-修改报告v2.md（本报告）
```

未 commit、未 push，等验收。
