# TASK-028 WP3 修改报告 —— 装备详情展开 + 掉落数据公开 RPC 化

> **⚠️ 本报告（v1 点击详情层口径）已被 v2 取代（2026-08-08）**：运营方向修正、顾问裁定⑤撤回——废弃点击展开模式，v1 点击详情层已整族拆除（sql/21 RPC 保留）。现行报告见 `docs/TASK-028-WP3-修改报告v2.md`；本文件存档留痕。

- 任务：tasks/任务书28-公示页改版V2.md §WP3（已按六案裁定回写）｜ 台账 REQ-086
- 施工日期：2026-08-08 ｜ 状态：**完工待验收，未 commit / 未 push**
- 前置：设计方案 `docs/TASK-028-WP3-设计方案.md` 六案裁定（顾问 2026-08-08 拍板），本报告按裁定逐条销项。

## 一、六案裁定落地对照

| # | 裁定 | 落地 |
|---|------|------|
| ① | 掉落难度整行隐藏（无数据不显，REQ-087 复活自动有） | ✔ detailHtml 仅在 primary_tiers/secondary_tiers 有 key 时渲染该行（key→随机/普通/英雄/史诗）；当前全表 null 恒不显，patch4 WP3-5 断言锁定 |
| ② | 套装关联有则显示无则不显，不建映射 | ✔ 仅 slot='套装兑换物' 显示「可兑换本赛季套装（详见套装一览）」 |
| ③ | 杂项下沉服务端 | ✔ RPC `where slot <> '杂项'`；前端 isMisc 保留作防线 |
| ④ | anon 直读不动 | ✔ 两表 anon 直读权限未动（数据中心/verify 脚本依赖） |
| ⑤ | hover 预览保留 + 点击进详情 | ✔ 桌面 :hover 特效覆盖层零改动；点击进详情层（特效全文完整可读）；移动端原 .expanded 点击路径并入详情层 |
| ⑥ | F1 注册 §6 例外 | ✔ UI 规范 v2 §6 已注册（限定 .dp-item-effect-overlay，写明理由与日期） |

F2（详情卡引导形态）已按 §10 评审闸随施工注册进 §4.4；任务书 §WP3 旧文案已回写。

## 二、实际改动点

### 1. 数据层：sql/21_task028_public_loot_rpc.sql（已上生产）
- 新增 `public.get_public_loot_detail()`：boss_loot+dungeon_loot 合并、实例/BOSS 预联查、19 字段白名单（不含 official_item_id 等内部列）、杂项服务端排除；security invoker 不抬权；grant anon+authenticated；幂等 + NOTIFY pgrst；回滚=DROP FUNCTION。
- **迁移执行**（同 sql/19/20 通道，backup/_sshtmp/run-sql21.js，凭据仅当次环境变量）：前行数快照 190/221 → 执行（CREATE FUNCTION/REVOKE/GRANT/NOTIFY）→ 后行数 190/221 零漂移；库内复核：RPC 返回 343 行、杂项 0 行、S2 两件 instance_name=烈毒之渊。
- **anon REST 复核**：POST /rest/v1/rpc/get_public_loot_detail → HTTP 200、343 行、白名单外字段零、source 分布 139 raid/204 dungeon、S1 视图 341、数值/特效样例字段齐全。

### 2. js/dataPublic.js
- 新增 `restRpc()`；boot() 两表直读 → 一次 RPC（其余 7 表直读不变）；`_src` 取 RPC source 字段；isMisc 防线保留；`sourceHasData`/renderDungeons 的 dungeon_id 改读 RPC 行 `instance_id`（game_bosses 直读的 dungeon_id 不受影响）。
- 新增 `detailHtml(l)`：行序 实例来源（团本/巢穴/大秘境标注）→ BOSS（整体池兜底）→ 掉落难度（无 tiers 不显）→ 套装关联（仅兑换物）→ 主属性数值 tag（力量 +5 式）→ 副属性数值 tag → 特效全文（#1eff00）；无数据行整体隐藏。
- 交互：全卡点击切换 `.dp-detail-open`（单开互斥、详情层内点击不冒泡、再点收起）；document 级监听仅挂一次（点卡外/Esc 收起）；原 has-effect 点击切 .expanded 的 JS 移除（CSS 类保留不再被挂）；hover 快读路径零改动。

### 3. css/data-public.css
- 新增 `.dp-item-detail` 族（卡宽下拉面板、max-height 260px 内部滚动、z-index 31 压特效层、金描边高亮）、`.dp-detail-row/.dp-detail-label/.dp-detail-val/.dp-detail-effect`；全卡 `cursor:pointer`（F2 一级引导）。
- 动画：200ms ease-out 只动 opacity/transform（translateY(-4px)+fade）；reduced-motion 媒体查询补 `.dp-item-detail` 瞬时降级。

### 4. 文档
- `docs/魔兽管家UI设计规范v2.md`：§4.4 注册「详情卡变体」（含全卡引导/单开互斥/无数据行隐藏）；§6 注册详情层动画 + F1 例外（限定特效覆盖层，理由+日期）。
- `tasks/任务书28-公示页改版V2.md` §WP3：旧文案（卡片排版/星标）回写为「装备详情展开」新口径，含回写说明与六案裁定。

### 5. scripts/verify-task23-patch4.js（只改失效锚点 + 新增块）
- §① 展开逐字比对三处 click→`.expanded` 改 hover 触发（裁定⑤路径），断言全部保留；1920 档同修（顺带修了原先只按名字定位的歧义隐患）。
- 新增「①+ WP3 详情覆盖层」13 断言：RPC 通道 200、点击展开行序列+特效逐字+数值 tag 一致、单开互斥、Esc/点外收起、掉落难度行不显、套装兑换物关联行（搜索「珍玩」唯一卡）、无值卡特例行集（S2 内克扎莉的兜帽仅两行）、动画规格（0.2s/仅 opacity/transform/reduced-motion 0s）、网格零挤压。

### 6. 版本串
`20260808.23 → 20260808.24` 双头（data.html 6 处 + index.html 8 处，含顶部注释记录行），旧串零残留。

## 三、验证逐项

| 项 | 结果 |
|---|---|
| `node --check js/dataPublic.js` | ✔ |
| sql/21 迁移 + 库内复核 + anon REST 复核 | ✔（见 §二.1） |
| `npm test` | ✔ 5/5 |
| SEC-001 `scripts/verify-authz.js` | ✔ 34/34，测试用户/公会已删除零残留 |
| `verify-task23-patch.js` | ✔ 33/33，T23X 清零复核 0 |
| `verify-task23-patch3.js` | ✔ 28/28（只读零写入；一次并行跑飘红为资源争抢 flake，串行复跑全绿） |
| `verify-task23-patch4.js` | ✔ 58/58（45 基线 + WP3 新增 13），零 JS 报错零 404 |

### 真浏览器实测点（chromium，本机自起 server；页面 /data.html）
- **点击特效卡**（艾林先知的凝视）→ 详情层展开：实例来源=梦境裂隙（团本）、BOSS=奇美鲁斯，未梦之神、副属性=精通 +13、特效=库内全文逐字一致；全页仅 1 张开。
- **点击无特效卡**（梦境灼烧长靴）→ 前卡自动收起（单开互斥）；行集=实例来源/BOSS/主属性/副属性（无特效行不占行）。
- **Esc / 点页脚** → 收起；**再点同卡** → 收起。
- **hover 特效卡** → 特效覆盖层 opacity=1（快读路径不变，裁定⑤）。
- **搜索「珍玩」** → 鸣响虚空珍玩详情含「套装关联：可兑换本赛季套装（详见套装一览）」，无主/副属性行（库内 values null）。
- **切 S2** → 内克扎莉的兜帽详情仅 实例来源=烈毒之渊（团本）+BOSS=盘魂者内克扎莉 两行（无 tiers 无难度行，裁定①）。
- 详情层展开前后邻卡 rect 零位移（统一尺寸铁律）。
- 截图：`backup/2026-08-08-task28-wp3/impl-cards-{1366,1920}.png`（常态网格）、`impl-detail-open-{1366,1920}.png`（详情层展开态）。

## 四、改动文件清单
```
M  css/data-public.css                     （详情层样式族 + reduced-motion 补充）
M  data.html                               （仅版本串）
M  index.html                              （仅版本串）
M  js/dataPublic.js                        （RPC 通道 + detailHtml + 交互）
M  docs/魔兽管家UI设计规范v2.md             （§4.4 详情卡变体 + §6 注册/例外）
M  tasks/任务书28-公示页改版V2.md           （§WP3 回写）
M  scripts/verify-task23-patch4.js         （click→hover 适配 + WP3 断言块）
?? sql/21_task028_public_loot_rpc.sql      （新增，已上生产）
?? docs/TASK-028-WP3-设计方案.md           （送审件留存）
?? docs/TASK-028-WP3-修改报告.md           （本文件）
```
一次性工具（不入库）：backup/_sshtmp/run-sql21.js、backup/2026-08-08-task28-wp3/{mockup-detail.html,smoke-detail.js,shot-wp3.js,shot-impl.js}。

## 五、遗留
- 无阻塞遗留。掉落难度行待命 REQ-087 通道复活（录入 tiers 即自动显示，代码零改动）。
- `.expanded` CSS 选择器组暂留（无 JS 挂载，纯死样式）；后续卡片专项可顺手清理，本 WP 不动（最小改动）。
- 台账 REQ-086 状态与 changelog 四维补录：按惯例随下次统一更新入库。
- **未 commit、未 push**，等运营验收。
