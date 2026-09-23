# TASK-055-WP1 修改报告：访问统计看板 · 数据层（REQ-141 / 任务书 #55 WP1）

> 日期：2026-09-22 ｜ 执行：Kimi Code ｜ 范围：sql/34 聚合 RPC + server.js 查询端点 + 90 天滚动清理（server.js 版调度）+ 管理员白名单配置
> 结论：**verify-task55.js 44/44 全绿（0 红 0 阻塞）**，迁移已执行，送审待终审；未 commit、未 push。

## 〇、侦察闸五项（已送审放行，结论存档）

1. **数据中心 tab 机制**：页名 `switchPage('datacenter')`；tab 体系 = index.html:711-723 `#mdTabs .view-tab[data-mdtab]` + `mdSwitchTab()`（app.js:12557-12561）→ `renderDatacenter()` renderers 映射（:12568-12573）→ `#mdPanel`（index.html:724）。WP2 挂载点定案：专精 tab 后追加 `data-mdtab="analytics"`，复用现有体系零新造样式。（顾问放行）
2. **server.js 校验与 env**：两段鉴权活先例 = `handleWclRequest`（server.js:987-1011：401→403 中文 json，鉴权全过才触下游）；`verifyTokenCached`（:456，60s 缓存）为 JWT helper；env 直读先例 TRACK_SALT（:404）/WCL 凭证（:872-873）。（顾问放行）
3. **pg_cron**：**定案 server.js setInterval 版**（启动 10 分钟首跑 + 每 24h），pg_cron 不启用、不再查。（运营定夺）
4. **运营 uid**：service_role admin API 按邮箱定位（uid 掩码 `66de8e…`），已写入本地与服务器双端 .env；密码未使用未存储（运营已知情并决定不更换，事件结项）。（顾问放行；uid 掩码新规本次起执行）
5. **verify 登录路径复用**：#54 spawn env 注入先例（verify-task54.js:77-79）+ admin API 自建/自删测试用户（:243/:315）原样复用；本任务 spawn 注入 `ANALYTICS_ADMIN_UIDS=<测试管理员 uid>`。（顾问放行）

## 一、改动清单（按任务书 WP1 四节）

| 文件 | 性质 | 内容 |
|---|---|---|
| `sql/34_task055_analytics_overview.sql` | 新件 | ①`analytics_overview(p_start,p_end,p_grain,p_page='all') returns jsonb`（STABLE/SECURITY DEFINER/search_path=public）：参数校验三件套（grain∈hour/day/week/month、p_end>p_start 且 ≤92 天、page 正则 `^(all|index|decor|data|index:[a-z]+)$`，raise→PostgREST 400）；**时区钉死东八区** `date_trunc(grain, ts at time zone 'Asia/Shanghai')`，桶序列化 `to_char(...)+'+08:00'`；`generate_series` 全量桶 left join **补零**（折线不断）；人口径 `coalesce(uid::text,vid)`；六键——series（bucket/pv/uv 升序）/cards（pv/uv/dau_avg：东八区日历日 distinct 人再平均，零事件日计 0，round::int）/nav（`index:*` 剔 `index:login`，clicks/people 双口径降序）/pages（全 page 含 decor/data 降序）/refs（null 归并「直接访问」TOP10）/events（cnt 降序）；范围 `[p_start,p_end)`。②`analytics_purge_90d() returns bigint`：删 90 天前，`GET DIAGNOSTICS` 返回行数。③权限：双函数 `revoke from public,anon,authenticated` + `grant execute to service_role`。④幂等 CREATE OR REPLACE + 回滚注释 + 文末 `NOTIFY pgrst`；**零 ALTER**（不动 #54 表结构红线） |
| `server.js` | 只增不改（三处） | ①常量区（track 常量后）：`ANALYTICS_SUMMARY_MAX_BODY_BYTES=8KB` / `ANALYTICS_SUMMARY_RATE_PER_MIN=30` / `ANALYTICS_MAX_RANGE_MS=92d` / `ANALYTICS_GRAINS` / `ANALYTICS_PAGE_RE` / `analyticsSummaryRateBuckets`（与 track 限流桶分离）+ `analyticsAdminUids()`（.env 逗号分隔解析）+ `analyticsSummaryRateLimited()`（滑窗 Map+万条兜底清扫，trackRateLimited 同款）；②端点 `POST /api/analytics/summary`（/api/track 与 /api/db 同层）：**两段鉴权**——无 token/verifyTokenCached 失败 → 401；uid ∉ 白名单 → 403 `{error:'仅管理员可见'}`；→ 同 uid 30/分限流（429）→ readBody+8KB → body 四项校验（与 RPC 同规则，400 中文）→ `proxyToSupabase` POST `/rest/v1/rpc/analytics_overview` **原样透传** jsonb；RPC 失败 → 502 `{error:'统计服务暂不可用'}` + console.error 不泄露内部细节；③90 天清理调度（server.js 版，侦察闸 3 定案）：`runAnalyticsPurge()`（RPC 调 purge，console.log 删除行数，异常 console.error 不崩进程）+ `scheduleAnalyticsPurge()`（10 分钟首跑+24h setInterval，双 unref）挂 `startServer()` |
| `scripts/verify-task55.js` | 新件 | A 静态 18 + B 实测 24 + C 清零 2 = 44 项；B0 迁移闸（RPC 不在场全段 ⏸ 阻塞不假绿）；双测试用户 admin API 自建自删；spawn 注入白名单；受控事件 5 行逐字断言（详见三节） |
| `docs/问题与需求清单.md` | 台账 | REQ-141 行补记 #55-WP1 状态（编号纪律） |
| `.env`（本地+服务器双端，gitignore 内） | 配置 | `ANALYTICS_ADMIN_UIDS=<运营 uid>`（任务书 WP1.4；服务器端 /opt/frontend/.env 已写入，**部署重启容器时生效**，回执「已配置」） |

## 二、设计边界（按书落地，未擅自扩）

- **不碰 #54 采集层**：track.js、/api/track、analytics_events 表结构零改动（A1h 锚零 ALTER；A3 版本串 .70 三壳计数 15/6/8 守恒——WP1 不动前端资产）。
- **看板对 analytics_events 只读 + 定时删**，不碰任何业务表；端点任何失败不影响 /api/db 与其他端点（独立分支独立 try/catch，security 回归 5/5 实证既有边界零行为变更）。
- **三重防线**：端点两段鉴权（401/403）+ 函数层 revoke anon/authenticated（B1g/B1h anon 直调 401 实证）+ /api/db RPC 白名单不放行 analytics_*（authorizeRpcPayload 仅 get_unread_notification_count，未动）。
- **uid 纪律**：白名单只走 .env；代码零 uid 字面量（A2b 锚）；本报告与 verify 输出一律前 6 位掩码（新规执行）。
- **申报①（任务书措辞冲突，按枚举实做）**：WP1 需求正文写「返回 jsonb 固定**五**键」，但下文逐项枚举 series/cards/nav/pages/refs/events **六**键且各有详细语义，WP2 四面板（refs TOP10 + events TOP）亦需六键齐备——判定「五键」为措辞笔误，按枚举清单实做**六键**，verify A1f/B1c 按六键钉死。请顾问备案。
- **申报②（清理调度首跑观察）**：server.js 版调度的「10 分钟首跑」在下次部署重启后由生产进程日志观察（`[analytics] 90 天滚动清理完成，删除行数=N`）；verify 无法等 10 分钟，调度参数由 A2f 静态锚 + B3 手动 purge 实证函数正确性覆盖。
- **申报③（dau_avg 口径细节）**：零事件日计 0 参与平均（「先按日分桶求每日 distinct 人再取平均」的字面实现，generate_series 日桶 left join）；若顾问本意是「仅有事件的日期参与平均」，一字之改（去掉 day_buckets 补零）即可，送审定夺。

## 三、验证（scripts/verify-task55.js，44/44 全绿，0 红 0 阻塞）

- **A 静态 18/18**：sql/34 锚点 ×8（双函数签名/东八区+补零+ISO 桶/参数校验三件套/人口径+剔 login+直访归并/六键/revoke+grant/幂等回滚 NOTIFY 零 ALTER）；server.js 锚点 ×6（两段鉴权顺序/.env 白名单零 uid 字面量/30 限流分离桶/四项校验/RPC 透传+502/清理调度参数+unref+startServer 挂载）；版本串守恒；node --check ×2；node --test server-security 5/5。
- **B 实测 24/24**（迁移执行后复跑解锁）：
  - curl 矩阵 8/8：无 token **401**；非管理员 **403** `{"error":"仅管理员可见"}`；管理员合法 **200 六键齐**；`grain:'minute'` **400**；93 天 **400**；`page:'index;drop'` **400**；anon 直调双 RPC 各 **401**。
  - 数据正确性 11/11（5 行受控事件，窗口 北京 9-20~9-22 无非测试事件前置钉死）：**时区子弹**——UTC 9-20T16:30 事件落北京 9-21 日桶（三日桶 pv=[0,5,0]/uv=[0,4,0]，UTC 切日则歪 9-20）；**补零**首末空桶在场；cards={pv:5,uv:4,dau_avg:1}（uid 跨行去重子弹）；nav 剔 index:login 双口径；pages 五页全列；refs 直接访问 4/4 居首；events cnt=5；小时粒度 25 桶逐时落点+中间空桶补零；页面筛选三态（index 整壳 3/decor 1/单子页 1）。
  - purge 1/1：91 天前旧行删除（返回 1），窗口内近行 5 全保留。
  - 限流 1/1：同 uid 连发 40 次 → 200×21 + 429×19（30/分滑窗实证，不全是 429）。
- **C 清零 2/2**：props->>test=t55 零残留；双测试用户删除复核。
- 全量输出：`diff-task55-wp1-verify-output.txt`（随送审）。

## 四、迁移执行记录（sql/34 已执行，2026-09-22，执行器 backup/_sshtmp/run-sql34.js）

纪律全走：① 备份留档 `backup/2026-09-22-task55-wp1/pre-migration-backup.sql`（analytics_events 全量 pg_dump 7990 字节，纯新增函数零触碰既有对象，备份为纪律性留档）；② SSH + docker exec supabase-db psql（supabase_admin，**ON_ERROR_STOP=1**，sftp+ docker cp 摆渡）；③ 输出核对：**CREATE FUNCTION×2 + REVOKE×2 + GRANT×2 + NOTIFY，零 ERROR/FATAL/ROLLBACK，exit=0**；④ 库内复核：双函数在场，proacl=`{supabase_admin=X,postgres=X,service_role=X}`（anon/authenticated 无执行权）；⑤ 冒烟：overview 近 1 天返回六键（nav/refs/cards/pages/events/series）、purge 手动首跑返回 0；⑥ verify 复跑 B/C 解锁 44/44。

## 五、遗留与边界

- 生产 `/api/analytics/summary` 在终审→push→部署后生效；服务器 .env 白名单已提前配置（WP1.4 回执「已配置」），部署重启自然生效。
- verify-task55.js 为 WP1 段；WP2 施工时扩展浏览器四态矩阵（403 占位/断网重试等），A 段版本串断言届时切 .71。
- 「五键/六键」措辞笔误待顾问备案后，建议任务书正文顺手订正（不擅改任务书）。

## 六、送审物料

- `diff-task55-wp1.txt`（git add -N 后完整 diff，含新件：sql/34、verify-task55.js、本报告、任务书 #55；改件：server.js、问题与需求清单.md）
- `diff-task55-wp1-verify-output.txt`（verify 44/44 全量输出）
- 本报告
- 新件 sha256（**diff 生成后计算**，#54 立规；工作区为 LF 与 git blob 一致，push 后 `git show HEAD:<path> | sha256sum` 可直接回证）：

| 项 | 值 |
|---|---|
| sha256 sql/34_task055_analytics_overview.sql | 86a62008064882fc0b7c9545474d50272203ea4e41cb8eac99772d524d0025ad |
| sha256 scripts/verify-task55.js | 113796d8862adb3556abc7daf835ea5e32515b85c7b143e01c1de4207ec50bae |
