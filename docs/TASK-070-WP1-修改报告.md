# 任务书 #70 WP1 修改报告：WCL 公会绑定与报告同步（方案A + 共用功能）

**日期**：2026-10-14　**状态**：✅ 全部验证通过（接口 36/36 + 真浏览器 14/14），待运营终审与 git 提交

---

## 一、实际改动点

### 数据库（待执行）
- `sql/41_task070_wcl_guild_binding.sql`（新建）：guilds 加 8 列（wcl_guild_id/wcl_guild_name/wcl_server_name/wcl_region/wcl_bind_method/wcl_token/wcl_bound_at/wcl_auto_create_event）+ 部分唯一索引 `idx_guilds_wcl_guild_id` + **列级加固** `REVOKE SELECT (wcl_token) FROM authenticated, anon`（密文不出服务端）+ NOTIFY pgrst。幂等可重跑，头注含回滚 SQL。

### 后端 server.js（+约 330 行）
- 新区块「任务书 #70」六个端点（鉴权栈复用 verifyTokenCached + getGuildRoleCached，鉴权通过后才接触 WCL 凭证）：
  | 端点 | 方法 | 鉴权 | 说明 |
  |---|---|---|---|
  | /api/wcl/guild-lookup | GET | owner/editor | id 直查或 中文名+服务器+大区 组合查（serverSlug 传中文，#69 实测命中） |
  | /api/wcl/bind-guild-paste | POST | owner/editor | **服务端二次向 WCL 核实公会名**（防前端伪造）后落库；23505 唯一冲突 → 409 中文 |
  | /api/wcl/unbind-guild | POST | owner/editor | wcl_* 全清空（含 token、开关复位）；已关联活动不动 |
  | /api/wcl/set-auto-create | POST | owner/editor | 自动创建开关（wcl_ 前缀被通用代理拦截，走此专用通道） |
  | /api/wcl/reports | GET | owner/editor | guildReports（client_credentials）+ 比对 activities.wcl_report_code 标 is_linked |
  | /api/wcl/report-fights | GET | 公会成员（含 viewer） | **防线：code 必须是本公会已关联活动的报告**；只拉 fights 首领级字段，无玩家数据 |
- 通用代理加固：`authorizeProxyRequest` guilds PATCH 分支拒绝一切 wcl_ 前缀键（绑定字段只走专用端点）
- 定时 sweep：`startWclAutoCreateSweep()` 进程内每小时（启动 5 分钟首跑）扫「已绑定+开关开」公会，新报告按 自然日+副本 去重直插 activities（规范 1.2.2 自动化例外，注释已自引）；逐公会 try/catch 静默降级
- guilds 写成功后 roleCache.clear() 与 /api/db 转发惯例对齐

### 前端
- `index.html`：公会设置弹窗新增「🔗 WCL 公会绑定」卡（已绑定态：公会名+方式+解绑+自动创建开关；未绑定态：方式一粘贴输入+检测+确认条；方式二 OAuth 占位置灰「即将上线」——WP2）；考勤页加「🔄 同步 WCL 报告」按钮 + 新报告 banner 容器 + 同步状态行；考勤详情弹窗加「📊 团本速览」容器。版本串 20261013.90 → **20261014.91（15 处零残留）**；data.html/decor.html 引用资源未变，按 #61-WP1 规则不联动
- `js/app.js`（+约 230 行）：wclApiGet/wclParseGuildInput（两种链接格式+纯数字）/renderWclBindCard/wclLookupGuild/wclConfirmBind/wclUnbind（二次确认）/wclToggleAutoCreate（失败回滚勾选）；wclSyncReports + banner（每条新报告：创建活动并关联=showActivityModal 预填 日期/团本/WCL链接，忽略=localStorage 按公会记忆）；renderWclRaidBoard（首领聚合：击杀/尝试/最佳进度，会话内缓存，失败优雅降级文案）；modalDirtyChecks.guildSettingsModal 纳入绑定卡未确认输入；syncAttendanceViewUI 控制同步按钮显隐（绑定+edit-only）
- 外部数据（WCL 公会名/首领名）一律经 wcl70Esc 转义
- `js/app.js` changelog：四维「新增功能」补录（5.5 门禁）

## 二、验证方式与结果

- `node --check server.js js/app.js scripts/verify-task70.js scripts/verify-task70-browser.js` 全过
- `scripts/verify-task70.js`（仿 verify-authz.js 自建 3 用户 2 公会后自清理）：**A 组鉴权矩阵 10/10 通过**——无 JWT 401 / viewer 五端点 403 / outsider 403 / 通用代理 wcl_ 键拦截 403 / 常规字段不受影响 200
- **sql/41 执行纪实**：supabase.com Dashboard 是另一个库（首跑无效）；实际经 SSH 到自建机 101.35.124.22，`docker exec supabase-db psql -U supabase_admin` 执行成功（8×ALTER TABLE + CREATE INDEX + REVOKE + NOTIFY）。**两个环境教训**：①自建镜像中 postgres 角色没有 public schema 的 CREATE 权限，DDL 必须用 supabase_admin；②psql -c 多语句单事务，中途报错全回滚（首跑 postgres 用户的 8 条 ALTER 已整体回滚，无半成品残留）。SSH 纪律遵守：凭据仅环境变量内存传递、零落盘、临时脚本用后已删
- **接口层 `node scripts/verify-task70.js`：36/36 通过**（真实 WCL 调用：挽歌 id=144305 / 报告 gXCGyxkmTwQfpMv9）
  - A 鉴权矩阵 10/10：无 JWT 401；viewer/outsider 各端点 403；通用代理 wcl_ 键 403 且常规字段不受影响
  - B 绑定 9/9：lookup 命中挽歌 / 非法 id 400 / 绑定落库三字段正确 / 重复绑定 409 / 公会B 绑同一 WCL 公会撞唯一索引 409
  - C 同步看板 8/8：reports 200 带 is_linked / 未关联报告看板 403 / viewer 看已关联看板 200 / fights 仅首领级字段断言 / 关联后 is_linked=true
  - D 开关与解绑 9/9：开关落库 / 解绑五字段清空 / 已关联活动报告保留 / 重绑可用
  - E REVOKE 加固：**实测降级**——Postgres 表级 GRANT 覆盖列级 REVOKE，anon 直读 wcl_token 返回 200（RLS 挡行故为空数组）。WP1 期间 wcl_token 恒 NULL 零暴露面；WP2 实施时 token 改独立表 `guild_wcl_tokens`（RLS 全拒、仅 service_role），比列级权限更彻底
- **真浏览器主链路 `node scripts/verify-task70-browser.js`：14/14 通过**（Chrome 无头 1440×900，截图 8 张在 backup/2026-10-14-task70-wp1/）：
  1. 登录进主应用 ✓；2. 用户中心→公会设置→WCL 绑定卡未绑定态（截图01）✓
  3. 粘贴 `warcraftlogs.com/guild/id/144305` → 检测出「挽歌 - 金色平原（ID: 144305）」（截图02）→ 确认绑定 → toast+已绑定态（截图03）✓
  4. 考勤页「🔄 同步 WCL 报告」→ banner 弹 3 条新报告（各带 创建活动并关联/忽略）（截图04）✓
  5. 「创建活动并关联」→ 弹窗预填 日期2016-10-03/团本 Emerald Nightmare/WCL 链接（截图05）→ 保存 toast「活动已创建」✓
  6. 活动详情「📊 团本速览 — h萨维斯开荒」：Xavius 尝试 2、击杀 ❌、最佳进度 剩余 0%（截图06）✓
  7. 再同步 banner 3→2，已关联报告被 is_linked 过滤（截图07）✓
  8. 解绑 confirm→toast→卡片回未绑定态（截图08）✓
  - 异常面：全程仅 1 条已知白名单 409（user_profiles 首登竞态），零 console error、零其他 4xx/5xx
- **schema 勘正留痕**：任务书 §6.2 伪代码 `guildReports` 在 WCL V2 实际 schema 不存在，正确字段 `reportData.reports(guildID:)`（实测报错引导订正，server.js 注释已钉）

## 三、运营终审前待办

1. git 提交（建议单枚「任务书#70-WP1：WCL公会绑定+报告同步+团本速览（方案A）」，含 sql/41、server.js、app.js、index.html、两个 verify 脚本、本报告）
2. 部署后复核：生产 server.js 重启生效（sweep 随进程启动）；生产随手点一次「同步 WCL 报告」确认 WCL 通路
3. WP2（方案 C OAuth）前置：WCL 客户端管理页登记 redirect_uri；**注意 api.ddctl.com 当前 404**（实测），回调域名需在 WP2 开工前修复或改用主域；.env 新增 WCL_TOKEN_KEY；token 存储改独立表 guild_wcl_tokens（见 E 组降级结论）

## 四、遗留与说明

- **方案 C（WCL OAuth）= WP2**，前置卡点：运营须在 warcraftlogs.com 客户端管理页把 `https://api.ddctl.com/auth/wcl/callback` 加进 Redirect URIs，且 .env 新增 `WCL_TOKEN_KEY`（AES-256-GCM 密钥，32 字节 hex）。前端入口已占位置灰
- A 方案用 client_credentials 只读**公开**报告；公会私有报告需 WP2 用户 token
- 定时 sweep 依赖 server.js 进程常驻；重启后 5 分钟自愈。每小时每公会约 2-3 点 WCL 额度（3600/小时额度内可忽略）
- WCL zone 名为英文（API 无本地化），自动创建活动的 raid 字段为英文原名，团长可手动改
- 埋点未新增事件（第七章登记制，本任务书未立项）
