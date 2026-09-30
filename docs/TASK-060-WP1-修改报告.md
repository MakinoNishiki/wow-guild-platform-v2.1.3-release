# 任务书 #60-WP1 修改报告：新 IA 路由 PV 口径对齐——访问统计看板新路由可见

> 日期：2026-09-30 ｜ 执行：Kimi Code ｜ 状态：已实现待验收（**未 commit / 未 push，送审**；**sql/36 已在服务器执行并四层实证，见 §3.5**）
> 前置：已读 docs/开发规范.md（最新版）、docs/问题与需求清单.md、任务书 #60 §0 勘查结论；server.js 双 RE 已按 §0 复核在场（server.js:371 `TRACK_PAGE_RE` / server.js:420 `ANALYTICS_PAGE_RE` 均含连字符），未改。

## 一、改动清单（修改文件 / 位置 / 原因 / 影响）

| 文件 | 改动 | 原因 | 影响范围与风险 |
|---|---|---|---|
| `sql/36_task060_analytics_page_re.sql`（新增） | `analytics_overview` 的 p_page 校验 regex `'^(all\|index\|decor\|data\|index:[a-z]+)$'` → `'^(all\|index\|decor\|data\|index:[a-z-]+)$'`；函数体其余与 sql/34 逐字一致（verify A2 机器比对钉死，仅该行差异）；照 sql/34 范式：幂等 CREATE OR REPLACE / 文件头注释（日期/内容/执行方式/回滚）/ revoke+grant 仅 service_role / 末尾 `NOTIFY pgrst, 'reload schema'` | 断点 A：server.js 双 RE 已放行连字符页签（index:team-guide / index:decor-plan），DB 函数旧 regex 会 raise 400「页面筛选参数无效」；断点 B（页筛选项）一旦补上不修 A 即触发 | 唯一 DB 变更；CREATE OR REPLACE 保留原函数签名与 ACL（revoke/grant 重申兜底）；旧 page 值（all/index/decor/data/index:xxx 无连字符）为新区 regex 子集，向后兼容零行为变化；执行权属运营 |
| `js/app.js` | ①`ANX_TAB_LABEL`（app.js:13878）补 4 新键：home '首页' / 'team-guide' '团队引导' / 'decor-plan' '方案单' / community '家宅社区'，12 旧键原样保留；②页筛下拉 `pageOpts`（app.js:13924 起）在 4 旧项（全部/主站/家宅公示/掉落公示，保留不动）后补 14 个单页签选项，label「主站·××」，清单与任务书逐字一致 | 断点 B：页筛无单页签入口；nav 排行中新页签（index:home 等）无中文 label 显示原始 key | 纯看板渲染层；anxPageLabel 旧键回退逻辑（`|| p.slice(6)`）未动，历史遗留值（index:dashboard/login）兼容展示不变；选新选项发出的 page 参数已被 server.js ANALYTICS_PAGE_RE 放行（#58-WP2-3），DB 侧待 36 号迁移执行后全链贯通 |
| `index.html` | 版本串 20260923.82 → 20260923.83，15 处（顶部注释 + 14 个 `?v=` 查询串）逐处同值零残留 | 开发规范第五章第 6 条归属条款：凡改动 js/css 的批，版本串批内由施工方递增 | 纯缓存串 |
| `docs/问题与需求清单.md` | REQ-141 行尾补记 #60-WP1 段（编号纪律，沿袭 #54/#55/#56 同行累积补记先例） | 台账登记纪律 | 文档 |
| `scripts/verify-task60.js`（新增） | 本批回归脚本 13 项（见下） | 批内自证 | — |
| `scripts/shot-task60.js`（新增） | 送审截图脚本（测试管理员/公会用后自清理，零测试事件注入） | 截图取证 | — |

**冻结项遵守**：track.js 零触碰、server.js 零触碰（git diff 白名单锁死，verify A6）；不动 #58 全链；测试数据不引入（截图用近 30 天真实埋点，测试用户/公会创建后删除并复核清零）。

## 二、迁移文件全文（sql/36_task060_analytics_page_re.sql）

```sql
-- 任务书 #60 WP1 / REQ-141：analytics_overview 的 p_page 校验 regex 对齐连字符口径
-- 内容：p_page 校验 regex '^(all|index|decor|data|index:[a-z]+)$' → '^(all|index|decor|data|index:[a-z-]+)$'，
--   与 server.js 双 RE（TRACK_PAGE_RE / ANALYTICS_PAGE_RE，任务书 #58-WP2-3 已放行连字符）同口径。
--   除该 regex 外，函数体与 sql/34_task055_analytics_overview.sql 一字不动（含东八区分桶/补零/六键/权限）。
-- 背景：新 IA 页签 key 含连字符（index:team-guide / index:decor-plan），旧 regex 会在 SQL 层 raise 400
--   「页面筛选参数无效」（server.js 已放行，断点仅在 DB 函数校验）。
-- 幂等：CREATE OR REPLACE，可重复执行。
-- 执行方式（照 sql/33/34 先例，执行权属运营）：SSH 登服务器 → docker exec supabase db 容器
--   psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f 本文件。
-- 回滚：将下方 p_page 校验行改回 '^(all|index|decor|data|index:[a-z]+)$' 后重跑本文件
--   （等价于重跑 sql/34_task055_analytics_overview.sql 中的 analytics_overview 定义）。

create or replace function public.analytics_overview(
  p_start timestamptz,
  p_end timestamptz,
  p_grain text,
  p_page text default 'all'
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- 参数校验（任一不满足即 raise exception，PostgREST 透 400）
  if p_grain is null or p_grain not in ('hour', 'day', 'week', 'month') then
    raise exception '粒度参数无效（hour/day/week/month）';
  end if;
  if p_start is null or p_end is null or p_end <= p_start then
    raise exception '结束时间必须晚于开始时间';
  end if;
  if p_end - p_start > interval '92 days' then
    raise exception '时间范围不能超过 92 天（90 天保留 + 2 天余量）';
  end if;
  if p_page is null or p_page !~ '^(all|index|decor|data|index:[a-z-]+)$' then
    raise exception '页面筛选参数无效';
  end if;

  -- p_page 过滤语义：'all'=不过滤；'index'=主站整壳（page 形如 index:*）；
  -- 'decor'/'data'=精确匹配；'index:xxx'=精确匹配单子页。范围取 [p_start, p_end)。
  -- 「人」口径（方案单 v1.1）：coalesce(uid::text, vid)。
  return (
    with f as (
      select ae.ts, ae.page, ae.event, ae.ref_dom,
             coalesce(ae.uid::text, ae.vid) as person
      from public.analytics_events ae
      where ae.ts >= p_start and ae.ts < p_end
        and (p_page = 'all'
             or (p_page = 'index' and ae.page like 'index:%')
             or (p_page in ('decor', 'data') and ae.page = p_page)
             or (p_page like 'index:%' and ae.page = p_page))
    ),
    -- 趋势序列：东八区分桶 pv/uv；generate_series 造全量桶 left join 补零（折线不断）
    buckets as (
      select generate_series(
        date_trunc(p_grain, p_start at time zone 'Asia/Shanghai'),
        date_trunc(p_grain, p_end at time zone 'Asia/Shanghai'),
        ('1 ' || p_grain)::interval
      ) as bk
    ),
    series_agg as (
      select date_trunc(p_grain, ts at time zone 'Asia/Shanghai') as bk,
             count(*) as pv, count(distinct person) as uv
      from f group by 1
    ),
    series_json as (
      select coalesce(jsonb_agg(jsonb_build_object(
               'bucket', to_char(b.bk, 'YYYY-MM-DD"T"HH24:MI:SS') || '+08:00',
               'pv', coalesce(s.pv, 0),
               'uv', coalesce(s.uv, 0)
             ) order by b.bk), '[]'::jsonb) as j
      from buckets b left join series_agg s on s.bk = b.bk
    ),
    -- 三卡片：范围内总 PV、总 UV（整段 distinct 人）、日均 DAU
    -- （先按东八区日历日分桶求每日 distinct 人——零事件日计 0 参与平均——再取平均四舍五入到整数）
    day_buckets as (
      select generate_series(
        date_trunc('day', p_start at time zone 'Asia/Shanghai'),
        date_trunc('day', p_end at time zone 'Asia/Shanghai'),
        interval '1 day'
      ) as dk
    ),
    day_agg as (
      select date_trunc('day', ts at time zone 'Asia/Shanghai') as dk,
             count(distinct person) as dau
      from f group by 1
    ),
    cards_json as (
      select jsonb_build_object(
        'pv', (select count(*) from f),
        'uv', (select count(distinct person) from f),
        'dau_avg', coalesce((
          select round(avg(coalesce(d.dau, 0)))::int
          from day_buckets db left join day_agg d on d.dk = db.dk
        ), 0)
      ) as j
    ),
    -- 导航 TAB 排行：主站页签（登录墙 index:login 不是导航 TAB，剔除），次数/人数双口径，按次数降序
    nav_json as (
      select coalesce(jsonb_agg(jsonb_build_object(
               'page', t.page, 'clicks', t.clicks, 'people', t.people
             ) order by t.clicks desc, t.page), '[]'::jsonb) as j
      from (
        select page, count(*) as clicks, count(distinct person) as people
        from f
        where page like 'index:%' and page <> 'index:login'
        group by page
      ) t
    ),
    -- 分页面：全部 page 分组（含 decor/data），按 pv 降序
    pages_json as (
      select coalesce(jsonb_agg(jsonb_build_object(
               'page', t.page, 'pv', t.pv, 'uv', t.uv
             ) order by t.pv desc, t.page), '[]'::jsonb) as j
      from (
        select page, count(*) as pv, count(distinct person) as uv
        from f group by page
      ) t
    ),
    -- 来源域 TOP10：ref_dom 为 null 归并「直接访问」，按 pv 降序取前 10
    refs_json as (
      select coalesce(jsonb_agg(jsonb_build_object(
               'ref_dom', t.rd, 'pv', t.pv, 'uv', t.uv
             ) order by t.pv desc, t.rd), '[]'::jsonb) as j
      from (
        select coalesce(ref_dom, '直接访问') as rd,
               count(*) as pv, count(distinct person) as uv
        from f group by 1 order by 2 desc, 1 limit 10
      ) t
    ),
    -- 事件 TOP：按次数降序
    events_json as (
      select coalesce(jsonb_agg(jsonb_build_object(
               'event', t.event, 'cnt', t.cnt
             ) order by t.cnt desc, t.event), '[]'::jsonb) as j
      from (
        select event, count(*) as cnt from f group by event
      ) t
    )
    select jsonb_build_object(
      'series', (select j from series_json),
      'cards',  (select j from cards_json),
      'nav',    (select j from nav_json),
      'pages',  (select j from pages_json),
      'refs',   (select j from refs_json),
      'events', (select j from events_json)
    )
  );
end;
$$;

-- 权限：维持 sql/34 口径，仅 service_role 可执行（CREATE OR REPLACE 保留原 ACL，此处重申兜底）
revoke all on function public.analytics_overview(timestamptz, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.analytics_overview(timestamptz, timestamptz, text, text) to service_role;

NOTIFY pgrst, 'reload schema';
```

## 三、验证

### 3.1 本批回归 verify-task60.js：13/13 全绿

- A1 sql/36 锚点：新 regex 校验行恰一条、无旧 regex 校验行残留（回滚注释不计）、幂等/权限/NOTIFY 锚点齐；
- A2 **函数体一字不动机器钉死**：sql/36 的 `analytics_overview` 与 sql/34 逐字比对（行尾归一后），唯一差异 = p_page 校验行 regex；
- A3 页筛 18 项（4 旧 + 14 新）value/label 逐对断言在场；
- A4 ANX_TAB_LABEL 12 旧键原样 + 4 新键在场；
- A5 版本串三壳实查（见 §3.4）；
- A6 git diff 白名单：仅 index.html / js/app.js / docs/问题与需求清单.md（台账补记），**track.js / server.js 零触碰**；
- A7 `node --check js/app.js` 过；A8 `node --test test/server-security.test.js` 5 pass 回归。

### 3.2 既有 verify 重跑（零新增失败，红项逐条定性为预存陈旧锚点）

**verify-task58-wp2-3.js：10/14，B 实测段全绿**。4 红全部预存、与本批无关：
- A1/A4：TRACK_EVENTS 与规范事件表现 15 行——任务书 #59-WP1 已新增第 15 事件 `tab_click`（规范 §7.2 清单表在案），该脚本钉 14 系 #58 时代锚点；
- A6：版本串钉 20260923.77，后续批次已递增（本批前即为 .82）；
- A7：批次排他锚点（改动仅限 #58-WP2-3 白名单）——任何后续未提交工作必然触红；本批改动文件 = 本批白名单，track.js/server.js 零触碰由本批 verify A6 锁定。
- B 段全绿：三事件入库 / `index:decor-plan` PV 入库不回归 / 负向三吞零入库 / 测试行清零残留=0。

**verify-task55.js：51/54，B 实测段（B0~B3 + C 清零）全绿**（全文日志落 `backup/task55-rerun-t60.log`）。3 红全部预存：
- A2d：钉 server.js 旧 regex `index:[a-z]+`——#58-WP2-3 已将其改为 `index:[a-z-]+`（即本批对齐的目标口径），锚点陈旧；
- A3：版本串钉 20260919.71，后续批次已递增；
- B 段异常：`page.fill('#authEmail')` 元素不可见——任务书 #59 门户化后 `?auth=login` 才弹登录遮罩（index.html:18 `#authOverlay` 默认 display:none），该脚本登录路径系 #55 时代直填式，已过时。**申报（预存问题，不属本批范围）**：verify-task55 的 B5 浏览器段需按新 IA 登录路径（`?auth=login` 唤醒 / 一级 tab→二级 pill）适配，建议后续批次处理。
- B 段关键绿项：B0 RPC 在场、B1 鉴权矩阵（401/403/200 六键/三 400/anon 双 RPC 401）、B2k 页面筛选三态（index 整壳/decor 精确/单子页精确）、B3 purge、C1/C2 清零。

### 3.3 真浏览器实测（playwright Chromium，本地 server :15660 连真实库，测试管理员+测试公会用后删除复核清零）

实测路径：`/?auth=login` 登录 → 一级 tab「团队管理」→ 二级 pill「数据中心」（超管门禁）→ 「访问统计」tab → 默认近30天+天粒度自动出数。全程 JS 报错数=0。

- **页筛截图**（4 旧项 + 14 新项，原生 select size=18 展开真实 DOM 零 mock）：
  `backup/2026-09-30-task60/shot-1-pagefilter-18.png`
  选项逐字（脚本打印同证）：全部 / 主站 / 家宅公示 / 掉落公示 / 主站·首页 / 主站·团队引导 / 主站·成员管理 / 主站·考勤记录 / 主站·装备分配 / 主站·心愿单 / 主站·统计报表 / 主站·数据管理 / 主站·更新日志 / 主站·数据中心 / 主站·副本掉落 / 主站·家宅图鉴 / 主站·方案单 / 主站·家宅社区（共 18 项）。
- **nav 排行中文 label 截图**：`backup/2026-09-30-task60/shot-2-nav-labels.png`
  近 30 天真实数据显示：主站·首页 183 次·91 人、主站·团队引导 85 次·32 人、主站·方案单 49 次·25 人、主站·家宅社区 13 次·6 人——四个新键全部显示中文 label 而非原始 key；历史键「主站·仪表盘」（index:dashboard 遗留值）兼容展示不变。
- 全貌图：`backup/2026-09-30-task60/shot-3-board-full.png`。

### 3.4 版本串三壳实查值（grep 计数）

| 壳 | 20260923.83 | 20260923.82 残留 | 结论 |
|---|---|---|---|
| index.html | **15**（顶部注释 1 + `?v=` 14） | 0 | 本批递增，逐处同值零残留 |
| decor.html | 0 | 5（顶部注释 1 + `?v=` 4） | 本批未触碰，不追平（裁决见下） |
| data.html | 0 | 8（顶部注释 1 + `?v=` 7） | 本批未触碰，不追平（裁决见下） |

**decor/data 壳是否追平——按开发规范第五章第 6 条原文裁决：不追平。** 原文规约对象为「index.html 内所有本地 js/css 引用」与「index.html 版本串全局同步递增」；递增的立法目的是「不递增则用户端会跑到旧版脚本」。本批唯一改动的 js = `js/app.js`，仅被 index.html 引用；decor.html（main.css/decorDict/decorData/track）与 data.html（main.css/data-public/supabase vendor/iconMap/lootTaxonomy/dataPublic/track）所引用资源本批零改动，不递增无旧缓存风险，且任务书明确「decor.html/data.html 本批未触碰」。两壳头注释「与 index.html 同步递增」系 #59 WP3 时代表述，与第五章第 6 条原文的规约范围出入在此申报，请顾问终审裁示（若裁追平，两行 sed 即可，零风险）。

### 3.5 服务器执行实证（2026-09-30，运营授凭证委托执行；照 33/34 先例：备份 → SSH docker exec → NOTIFY → 复核）

- **执行前备份**：`pg_get_functiondef` 全量函数定义落 `backup/2026-09-30-sql36/analytics_overview-pre-sql36.sql`（5479 字节，含旧 regex，与 sql/34 互为回滚双保险）；
- **执行**：`cat sql/36 | ssh → sudo docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1` → 输出 `CREATE FUNCTION / REVOKE / GRANT / NOTIFY`，ON_ERROR_STOP 零报错，exit=0；
- **psql 层**：`p_page='index:decor-plan'` / `'index:team-guide'` 各返回六键 jsonb（不再 raise 400）；旧值 `'index:decor'` / `'all'` 照常六键；nav 样本含 index:home/team-guide/decor-plan/community 等新键；**负向**：`'index:decor_plan'`（下划线）仍 raise「页面筛选参数无效」（regex 未过度放宽）；
- **REST 层**（service_role 经 PostgREST，即看板链路同径）：四值全 **HTTP 200** 六键齐——`index:decor-plan` cards.pv=49、`index:team-guide` 85、`index:decor` 160、`all` 865；
- **ACL 复核**：anon 直调 RPC → **HTTP 401**（revoke/grant 重申生效，权限口径零漂移）。

## 四、决策点与遗留

1. **执行顺序（任务书红线）**：~~运营先执行 sql/36~~ **已执行并实证（§3.5），SQL 先于 UI 生效的窗口期顺序满足**；剩余流程 = 顾问终审 → commit+push（前端）。窗口期内旧 UI 发不出新参数，无风险；新 UI 若先于迁移上线，选连字符页签会收到 400 错误条（已有错误态 UI，不白屏）。
2. **埋点向后兼容**：旧 page 值查询结果不因本批变化（verify-task55 B2k 页面筛选三态重跑全绿实证）。
3. **预存问题申报**：verify-task55 B5 浏览器段登录路径过时（#59 门户化所致，非本批引入）；verify-task58-wp2-3 A1/A4/A6 锚点陈旧（#59 第 15 事件/版本递增所致）。建议后续批次统一适配。
4. **changelog 四维补录随 release**（#58/#59 各批同口径先例：changelog 最新条目止于 task52/55/56，均随 release 补录）。
5. **commit 物料**：按纪律待顾问终审后另发；建议标题「任务书#60-WP1：analytics_overview p_page regex 放行连字符 + 看板页筛 14 单页签选项」，三段式【改了什么】sql/36 迁移 + 看板页筛/label 补口 + 版本串 .83【范围】sql/36、js/app.js、index.html、台账、verify/截图脚本【验证】verify-task60 13/13 + 既有 verify 零新增失败 + 真浏览器截图三枚。
