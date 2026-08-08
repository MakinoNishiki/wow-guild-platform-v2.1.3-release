# TASK-028 WP3 设计方案（送审稿）—— 装备详情展开 + 掉落数据公开 RPC 化

> 送审：运营 / 顾问 ｜ 2026-08-08 ｜ 状态：**待拍板，未动代码**
> 口径来源：运营 2026-08-08 开工指令 + 台账 REQ-086（WP3=装备详情展开）。
> ⚠️ 口径差异报备：tasks/任务书28-公示页改版V2.md 文件内 §WP3 文案仍是旧版「卡片排版+主属性彩色+副属性星标」，与台账 REQ-086 最新 WP 划分（WP3 装备详情展开 / WP4 排版留白对比度 / WP5 英雄榜筛选）不一致——本方案按台账+运营指令口径设计；任务书文件回写建议随 WP3 施工同批提交（文档纪律 6.3）。

---

## 一、现状侦察（已取证）

### 1. 展开路径（补丁4 已验收，WP3 复用对象）
- 机制：覆盖层全文替换 + 状态类切换 + z-index 抬升（30），**不挤压网格**（css/data-public.css:283-316）。
- 触发：桌面 `:hover` 特效覆盖层；移动端/触屏 click 切 `.expanded`（js/dataPublic.js render() 尾部，仅 `.has-effect` 卡）。
- 约束继承：卡片统一尺寸铁律（UI 规范 §4.4）、reduced-motion 降级（css/data-public.css:331-335）。

### 2. 详情层六字段数据可用性（anon REST 直查生产库，2026-08-08）
| 字段 | 数据源 | 现状 |
|---|---|---|
| 实例来源 | boss_loot→game_bosses→game_raids.name；dungeon_loot→game_dungeons.name | ✔ 联查可得（含巢穴 type=lair 标注） |
| BOSS | game_bosses.name | ✔；大秘境整体池条目 boss_id=null → 显示「整体池」 |
| 掉落难度 | primary_tiers/secondary_tiers（sql/20） | ✘ **全表 null**（REQ-087 已封存：12.x 无公开四档通道，S2 亦无 tiers 数据）→ 决策点① |
| 套装关联 | 无 item→tier_sets 外键 | ✘ 仅 1 行套装兑换物（鸣响虚空珍玩，note 已注明可兑换套装部位）→ 决策点② |
| 特效全文 | effect | ✔ 33 件非空（boss_loot 22 + dungeon_loot 11） |
| 主副属性数值 | primary_values/secondary_values（WP1 链，jsonb {属性:数值}） | ✔ 非空率：boss_loot 120/118 of 190、dungeon_loot 193/182 of 221；样例 `{力量:5}` `{急速:4,精通:5}` |

### 3. 读取通道现状
公示页 anon 直连 PostgREST 并行读 9 表（sql/16 字典表匿名读），联查在客户端组装。WP3 将 boss_loot/dungeon_loot 两表读取收口为公开 RPC（见 §三）。

---

## 二、improve-ui 开工前审计（铁律 #4 问题清单）

## Design language
- Audited surface：公示页 data.html 装备卡片（.dp-item）与展开交互
- Design sources：docs/魔兽管家UI设计规范v2.md（§4.2/§4.4/§6/§9）、docs/公示页筛选系统设计规范.md v2.0（§7/§9）
- Documented decisions：卡片统一尺寸、覆盖层展开不挤压网格（§4.4）；动画只动 transform/opacity、150–250ms ease-out、reduced-motion 降级（§6）；特效绿 #1eff00 唯一高饱和例外（§2.2）
- Governing owners and consumers：css/data-public.css `.dp-item*` 族 → js/dataPublic.js itemCard/render
- Explicit exceptions：特效绿（§2.2 已注册）；chip 圆角 12px（§9 已注册）

## Findings
| # | Problem | Evidence | Proposed change | Scope | Confidence |
|---|---|---|---|---|---|
| F1 | 特效覆盖层过渡动 **max-height/padding**（layout 属性），违反 §6「只动 transform/opacity」，且未注册例外 | contract=UI 规范 §6 + 筛选规范 §9 反例；runtime=css/data-public.css:310 `transition: max-height .25s ease, opacity .25s ease, padding .25s ease` 经 data.html 加载生效；correction=二选一：WP3 规范增补把该过渡注册为例外（维持已验收视觉），或随 WP3 改造为 transform/opacity 实现 | 详情层复用路径前置项 | 高 |
| F2 | 可展开引导（边框高亮+cursor:pointer）仅覆盖 `.has-effect` 卡（33/411 件），WP3 全卡可展开后约 92% 卡片无任何可交互暗示 | contract=§4.4「可展开卡加边框高亮引导」；runtime=css/data-public.css:291-295 仅 .has-effect 生效；correction=WP3 规范增补注册「详情卡」引导形态（全卡 cursor:pointer + 统一边框高亮策略，特效卡维持现金色微光作二级引导） | 详情层规范增补 | 高 |

## Improve first
F1——详情层复用补丁4 路径的前置合规项；若直接复用现有过渡写法，WP3 会把未注册的 layout 动画扩散到全部卡片。

已知取舍标注：移动端（≤768px）交互细节按 §8 移动端口径标记「已知取舍-封存」，仅保持可用；不另立 mobile 发现。

---

## 三、数据层设计：sql/21（公开 RPC 化）

### 3.1 设计要点
- 新增公开 RPC `get_public_loot_detail()`：一次调用返回两表合并 + 实例/BOSS 联查预组装的 JSONB，**字段白名单输出**（不含 official_item_id 等内部列），前端公示页改走此通道（取代 boss_loot/dungeon_loot 两次直读，其余 7 表直读不变）。
- `security invoker`（不抬权，依赖 sql/16 既有 anon 读策略）+ `stable`；`grant execute to anon, authenticated`。
- **杂项排除下沉 RPC**（`where slot <> '杂项'`，服务端收口「数据层排除」口径）；前端 isMisc 过滤保留作防线——决策点③确认。
- anon 对两表的直读权限**本期不动**（数据中心读取与三 verify 脚本期望值依赖直读）——决策点④确认。
- 走 dataPublic.js 既有 anon 直连 PostgREST 通道（POST /rest/v1/rpc/...），不碰 server.js 代理与 RPC 白名单（该白名单只管代理写路径）。
- 幂等（create or replace）+ 回滚注释 + `notify pgrst, 'reload schema'`；**执行纪律同 sql/19/20：运营执行（备份→执行→NOTIFY→REST 复核行数/字段）**。

### 3.2 sql/21 草案（送审版，拍板后落盘为 sql/21_req086_public_loot_rpc.sql）
```sql
create or replace function public.get_public_loot_detail()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(x.doc order by x.season_id, x.instance_name, x.boss_order, x.item_name), '[]'::jsonb)
  from (
    select jsonb_build_object(
        'id', bl.id, 'source', 'raid',
        'item_name', bl.item_name, 'slot', bl.slot, 'item_type', bl.item_type,
        'primary_stats', bl.primary_stats, 'secondary_stats', bl.secondary_stats,
        'primary_values', bl.primary_values, 'secondary_values', bl.secondary_values,
        'primary_tiers', bl.primary_tiers, 'secondary_tiers', bl.secondary_tiers,
        'effect', bl.effect, 'note', bl.note,
        'boss_id', bl.boss_id, 'boss_name', gb.name,
        'instance_id', gr.id, 'instance_name', gr.name, 'instance_type', gr.type,
        'season_id', gr.season_id
      ) as doc, gr.season_id, gr.name as instance_name, gb.boss_order, bl.item_name
    from boss_loot bl
    left join game_bosses gb on gb.id = bl.boss_id
    left join game_raids  gr on gr.id = gb.raid_id
    where bl.slot <> '杂项'
    union all
    select jsonb_build_object(
        'id', dl.id, 'source', 'dungeon',
        'item_name', dl.item_name, 'slot', dl.slot, 'item_type', dl.item_type,
        'primary_stats', dl.primary_stats, 'secondary_stats', dl.secondary_stats,
        'primary_values', dl.primary_values, 'secondary_values', dl.secondary_values,
        'primary_tiers', dl.primary_tiers, 'secondary_tiers', dl.secondary_tiers,
        'effect', dl.effect, 'note', dl.note,
        'boss_id', dl.boss_id, 'boss_name', gb.name,
        'instance_id', gd.id, 'instance_name', gd.name, 'instance_type', 'dungeon',
        'season_id', gd.season_id
      ), gd.season_id, gd.name, gb.boss_order, dl.item_name
    from dungeon_loot dl
    left join game_dungeons gd on gd.id = dl.dungeon_id
    left join game_bosses   gb on gb.id = dl.boss_id
    where dl.slot <> '杂项'
  ) x;
$$;
revoke all on function public.get_public_loot_detail() from public;
grant execute on function public.get_public_loot_detail() to anon, authenticated;
notify pgrst, 'reload schema';
-- 回滚：drop function if exists public.get_public_loot_detail(); notify pgrst, 'reload schema';
```
REST 复核口径：anon 调 RPC 返回 341 行（当前赛季口径以施工时实测重锚）；逐行字段在白名单内；杂项零行；S2 两件带 instance_name=烈毒之渊。

## 四、前端设计：详情覆盖层

- **形态**（mockup 已出图）：点击任意装备卡 → 卡片下方下拉覆盖层（卡宽、max-height 260px 内部滚动），复用补丁4 覆盖层+z-index 抬升机制，**不挤压网格**（统一尺寸铁律不变）。
- **行结构**（无数据的行整体隐藏，不占行不显示「—」）：实例来源（团本/巢穴/大秘境标注）→ BOSS（整体池兜底）→ 掉落难度（决策点①）→ 套装关联（仅套装兑换物，决策点②）→ 主属性数值（tag +N）→ 副属性数值（tag +N）→ 特效全文（特效绿 #1eff00）。
- **交互**：点击卡片切换 `.dp-detail-open`；全页同时仅一张展开（点开另一张自动收起前一张）；再点/点击卡外/Esc 收起；展开态卡片维持现金色描边高亮。
- **与特效 hover 预览共存**（决策点⑤推荐案）：桌面 hover 快速预览保留不变；点击进详情层（含特效全文）；移动端 click 原 `.expanded` 特效展开并入详情层同一入口。
- **动画**（§6 白名单内）：200ms ease-out，只动 transform/opacity（translateY(-4px)+fade 入场；收起反向）；reduced-motion 瞬时切换。F1 处置随拍板①并案。
- **渲染管线**：boot() 改 RPC 一次调用取两表数据（含联查字段），其余 7 表直读不变；加载失败照旧友好重试界面，不白屏。

## 五、规范增补草案（随 WP3 施工落稿，运营确认后生效）
1. UI 规范 v2 §4.4 卡片增补「详情覆盖层」变体：点击触发、卡宽下拉面板、行式字段（60px 标签列+值列）、z-index 抬升不挤压网格、全卡 cursor:pointer 引导（F2）。
2. UI 规范 v2 §6 注册详情层动画（200ms ease-out，transform/opacity，reduced-motion 降级）。
3. F1 处置二选一（并入拍板）：特效覆盖层既有 max-height/padding 过渡注册为 §6 例外（维持补丁4 已验收视觉，**推荐**——零回归风险），或改造为 transform/opacity 实现。

## 六、决策点清单（请运营/顾问逐条拍板）
| # | 事项 | 推荐案 | 备选 |
|---|---|---|---|
| ① | 掉落难度口径（tiers 全 null，REQ-087 封存） | 约定口径：团本/巢穴=「随机/普通/英雄/史诗（数值随难度缩放）」，大秘境=「史诗钥石（数值随钥石等级缩放）」；tiers 将来有数据时改读 keys | 本版整行隐藏，待数据再开 |
| ② | 套装关联规则 | 仅套装兑换物显示「可兑换本赛季套装（详见套装一览）」，其余不显示该行 | 建 item→tier_sets 映射（需数据维护，不建议本期） |
| ③ | 杂项排除下沉 RPC | 下沉（RPC where 过滤 + 前端防线保留） | 维持前端过滤，RPC 全量输出 |
| ④ | anon 两表直读权限 | 本期不动（仅新增 RPC 通道） | 收回直读收紧（需同步改数据中心读取与三 verify 脚本，另立安全项） |
| ⑤ | 特效 hover 预览 | 保留桌面 hover 预览，点击=详情层；移动端 .expanded 并入详情层 | 详情层取代 hover 预览（改动已验收行为，不建议） |
| ⑥ | F1 处置 | 注册为 §6 例外 | 改造 transform/opacity |

## 七、改造前后 UI 图（backup/2026-08-08-task28-wp3/，不入库）
- 现状：`before-cards-{1366,1920}.png`（常态网格）、`before-effect-open-{1366,1920}.png`（补丁4 特效覆盖层展开态=复用基线）；
- 提案：`after-detail-open-{1366,1920}.png`（详情覆盖层展开态 mockup，真实库样例数据）；mockup 源文件 `mockup-detail.html`（送审件，非生产代码）。

## 八、施工与验收口径（拍板后执行，供确认）
- 顺序：sql/21 落盘 → 运营执行迁移 → REST 复核 → 前端施工（data.html 无 DOM 变更预期 / css / dataPublic.js）→ 版本串 .23→.24 双头。
- 验证：RPC REST 复核（行数/字段白名单/杂项零行）；真浏览器详情六字段逐项（含无数据行隐藏、整体池兜底、套装兑换物关联行）；展开/收起/单开互斥/Esc/点外关；动画两态（含 reduced-motion）；三 verify 脚本锚点适配（RPC 数据源断言）全绿；npm test + SEC-001；补丁4 特效卡断言零回归；不 push，出修改报告等验收。
