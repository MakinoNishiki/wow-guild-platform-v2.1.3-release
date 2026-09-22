# 任务书 #54 WP1 修改报告：全站数据埋点——采集层（REQ-141）

> 日期：2026-09-22 ｜ 执行方：Kimi Code ｜ 状态：**已实现待验收（sql/33 已执行，verify 38/38 全绿）** ｜ git：未 commit 未 push

---

## 〇、零节侦察闸三项（只读，结论）

| 闸项 | 结论 | 钉点 |
|---|---|---|
| ① server.js 结构钉点 | ✅ 符合预期 | service_role 转发先例 = `proxyToSupabase()`（server.js:212，`${getSupabaseUrl()}/rest/v1/...` + apikey/Bearer service_role，https.request 零依赖）；静态分发回调 = `http.createServer`（server.js:1036），API 分支集中挂在回调前段（/api/db 写代理 :1100 起），/api/track 挂 /api/db 分支前同层；端口 = `DEPLOY_RUN_PORT \|\| 5000`（server.js:49），listen :1287 |
| ② app.js 登录态钉点 | ✅ 符合预期 | 授权行①钉 `showAppView()`（js/app.js:2032）——登录（handleLogin :1546）/注册/会话恢复（cloud.js SIGNED_IN→onUserSignedIn）三路径共同落点，优于只钉 handleLogin（刷新恢复会话同样带 uid）；uid 取 `CloudSync.getCachedUser()?.id`（cloud.js:1785 同步缓存读，零网络）。授权行②钉 `handleSignOut()`（js/app.js:2014，全站唯一 logout 路径） |
| ③ PostgREST 写库先例 | ✅ 符合预期 | service_role INSERT 走 `${SUPABASE_URL}/rest/v1/<table>`（/api/db 分支 :1146 同款）；.env 变量名 `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`（server.js:120/127 读取，COZE_ 前缀兼容） |

**侦察闸偏差一项（已处置）**：开工时本地 master 落后 origin/master 2 个提交（任务书 #52 WP1/WP2 未拉取），工作区版本串实为 20260919.67 而非书载 .69。已 `git pull --ff-only` 对齐到 5d87dcb（纯快进、零合并零提交，工作区仅两件未跟踪件不受影响），对齐后版本串 .69 ×（index 14/decor 5/data 7）与任务书前置状态逐字吻合，后续施工基于正确基线。

## 一、改动清单（按任务书五节）

| 文件 | 改动 | 说明 |
|---|---|---|
| `sql/33_task054_analytics_events.sql` | 新建 | analytics_events 表（9 列按书逐字）+ 三索引 + RLS 启用零策略 + 表注释 + 文末 NOTIFY pgrst；文件头回滚注释 `DROP TABLE IF EXISTS public.analytics_events;`；幂等可重复执行 |
| `server.js` | 只增不改 | ① `require("crypto")`；② 常量区 + TRACK_EVENTS=["page_view"] / TRACK_PAGE_RE / 8KB·2KB 双限 / 60 次每分钟；③ 三辅助函数 trackClientIp（xff 首段兜底 socket）/trackRateLimited（进程内 Map 滑动窗口+万条兜底清扫）/trackIpHash（sha256 日盐 YYYYMMDD+TRACK_SALT\|\|'wb-track'）；④ POST /api/track 分支挂 /api/db 前同层——恒 204 先应答后异步写库、白名单七列组装行、uid 轻格式校验（WP1 不验 JWT，注释钉边界）、props 非对象归一 {}、全异常 console.error 不 500 |
| `js/track.js` | 新建 | 零依赖 IIFE 全局 WBTrack：vid=localStorage wb_vid（randomUUID 降级拼接）；page 推导三分支；ref_dom 只取 hostname；sendBeacon(Blob json) 优先 fetch keepalive 兜底全 try/catch；DOMContentLoaded 包装 switchPage（判存在+幂等+原函数后上报 index:<key>）；加载完成自动一次 PV；currentPage 跟随页签供 WBTrack.event 自定义事件（WP3 挂点用） |
| `js/app.js` | 限授权两行 | showAppView 首行 `window.__wbUid = (window.CloudSync && window.CloudSync.getCachedUser()?.id) \|\| null;` + handleSignOut 首行 `window.__wbUid = null;`；除此之外零触碰 |
| `index.html` / `decor.html` / `data.html` | 挂载+版本串 | track.js 各挂最后一条业务 script 之后；版本串 .69→.70 全量递增（index×15/decor×6/data×8，旧串零残留） |
| `scripts/verify-task54.js` | 新建 | 三节目径见 §三 |
| `docs/问题与需求清单.md` | 台账登记 | REQ-141 行（编号纪律） |

**app.js diff 复核**：`git diff js/app.js` 仅 +2 行授权行，无其他改动（含 git pull 带进的 #52 内容属对齐基线，非本任务改动）。

## 二、设计边界（按书落地，未擅自扩）

- 明文 IP 永不落库：仅 ip_h=sha256(ip|YYYYMMDD|盐)，日盐轮换跨日不可关联；TRACK_SALT 未配置时兜底 'wb-track'（.env 当前未配，在场探测=absent）。
- body 白名单七列外字段一律丢弃；ref_dom 前端只取 hostname、服务端不再解析。
- OPTIONS 预检由既有 /api/ 分支统一覆盖，/api/track 无新增 CORS 面。
- 响应恒 204（含非法/超限/异常/上游写库失败全部情形）——埋点永不得影响业务。

## 三、验证（scripts/verify-task54.js）

- **A 静态 29/29 全绿**：sql/33 锚点（表/三索引/RLS/回滚注释/NOTIFY）；server.js 锚点（白名单常量/page 正则/ip_h sha256/限流 Map/恒 204/白名单七列组装）；track.js 锚点（vid/sendBeacon+keepalive/switchPage 包装/静默/WBTrack API）；三壳引用行序；版本串 .70 计数（index×15/decor×6/data×8）+旧串零残留+无异版本串；node --check ×4；node --test server-security 回归通过。
- **B 实测 8/8 全绿**（迁移执行后复跑解锁）：B0a 表在场（service_role 可查）+ B0b RLS 实证 anon 0 行；B1 合法 page_view → 204 + 行在场（page=decor / ip_h 64 位 hex / uid=null / props 透传）；B2 非法 event=hack → 204 零入库；B3 超大 props（3KB）→ 204 零入库；B4 真浏览器 decor.html 两连开自动 PV 入库 ×2、vid 持久相同、ref_dom=null 直访、控制台零报错；B5a 登录测试用户→真实点击考勤页签 → index:attendance 行 uid=该用户 id；B5b 头像菜单真实点击退出 → __wbUid=null → 同上下文开 decor.html 新行 uid 回 null。
- **C 清零 ✓**：全部 t54 测试事件行（curl 三件 + 浏览器两 vid + props->>test=t54）service_role 删除复核零残留；测试公会/成员行/用户删除；收尾 REST 复核表空 `[]`。
- **汇总 38/38 全绿（exit 0）**，输出全文：backup/2026-09-22-task54-wp1/verify-output.txt。
- B5b 排障留痕：首轮 37/38，唯一红 = 登录流程 console 409——取证定位 `POST /rest/v1/user_profiles` 409 = ensureTagNum 撞号重试（cloud.js:297-309 设计内 23505 重试路径，全新用户撞触发器建行，与本任务零交集），verify 加 4xx URL 取证钉死后按已知噪音白名单过滤，复跑全绿。**终审钉点⑧精度版**：白名单收窄为只滤「POST /rest/v1/user_profiles 的 409」精确匹配（方法+路径+状态码三元组正则），console 侧资源回显按命中条数逐条配对滤除——该域其他状态码、其他路径 409、其他 4xx 一律照红（复跑实证：精确滤除 1 条配对）。

## 四、迁移执行记录（sql/33 已执行，2026-09-22）

纪律全走：① 备份留档 `backup/2026-09-22-task54-wp1/pre-migration-backup.sql`（public schema 全量 pg_dump 6705 行，纯新增表零触碰既有表，备份为纪律性留档）；② SSH + sudo docker exec supabase-db psql（supabase_admin，ON_ERROR_STOP=1，base64 摆渡 stdin 喂入）——输出逐行 `CREATE TABLE / CREATE INDEX ×3 / ALTER TABLE / COMMENT / NOTIFY`；③ 文末 NOTIFY pgrst 已随文件执行；④ REST 复核：service_role 查表 HTTP 200、anon 查 0 行 HTTP 200（RLS 零策略实证）；⑤ verify-task54.js 复跑 B/C 解锁，38/38 全绿 + C 段清零后表空 `[]` 复核。

回滚路径（如需）：`DROP TABLE IF EXISTS public.analytics_events; NOTIFY pgrst, 'reload schema';`（sql/33 文件头同载）。

## 五、遗留与边界

-  changelog 四维补录：属提交前发布门禁，本次只送审不 commit，留待验收通过提交时补录。
-  uid 口径边界（书载）：WP1 不验 JWT，body.uid 前端显式传，统计自用口径——伪造 uid 可污染登录溯源列，WP2 看板解读时注意；如需可信溯源另立 WP 验 JWT。
-  限流为进程内 Map——多实例部署（当前单实例）需另议。
-  90 天滚动清理在 WP2，本表当前只增不清。

## 六、送审物料

| 物料 | 位置 |
|---|---|
| diff 全文（git add -N 新件后 git diff） | 随附 / backup/2026-09-22-task54-wp1/diff.txt（818 行） |
| verify 输出全文（38/38 全绿） | backup/2026-09-22-task54-wp1/verify-output.txt |
| 迁移前备份 | backup/2026-09-22-task54-wp1/pre-migration-backup.sql |
| sha256 js/track.js | 22dc63883cfa26e349f764fe72c5183a078b36b4dd6469419e5637381baf8841 |
| sha256 scripts/verify-task54.js | 9b5b6748d38f55b9dc22218f133e4b649ddf641e6a3a69b25fc262c787525640 |
| sha256 sql/33_task054_analytics_events.sql | eb48bc35fb1d3f8e410f8ed0e48a1c65bc3067b046593317137cbd41c43a517f |
