# TASK-015 数据库迁移修改报告（Supabase 云 → 国内自托管）

> 状态：**S1~S8 全部执行完毕（2026-08-02 21:15 正式切换完成），待运营 localhost:5000 验收 10 条**。
> 服务器：腾讯云上海 101.35.124.22（Ubuntu 24.04，4C4G/60G）。执行日期：2026-08-02（S1~S5）、2026-08-02 晚（S6，任务书 V2 方案）。
> 密钥纪律：本报告不含任何密钥；密钥仅存于服务器 `/opt/supabase/.env`、`/opt/backups/backup.env`（均 600）。

## 一、实际改动点

### 服务器侧（全部在 101.35.124.22）
1. Docker 环境复用既有（Docker 28.2.2 + Compose v5.0.0，已配腾讯云镜像加速器），未新装。
2. 部署目录 `/opt/supabase/`：supabase/supabase master 分支 `docker/` 目录（GitHub 直连被墙，经本地中转 scp 上传）。
3. `docker-compose.yml` 精简（见下节），`db` 服务补 `127.0.0.1:5432:5432` 端口映射（替代被移除的 supavisor，仅供本机迁移/备份用）。
4. `/opt/supabase/.env`（600）：`JWT_SECRET`=原云项目密钥（老用户免重登机关）；`ANON_KEY`/`SERVICE_ROLE_KEY` 由同一 JWT_SECRET 重新生成（HS256，iss=supabase，10 年）；`POSTGRES_PASSWORD` 新强随机（与原云无关）；`API_EXTERNAL_URL`/`SITE_URL` 按 S6 默认方案预填 `https://api.ddctl.com:8443`；`ENABLE_EMAIL_AUTOCONFIRM=true`（无 SMTP，保证注册可用，见遗留问题 L2）。
5. ~~S6 预制~~ **S6 已上线（V2 裸 IP + IP 证书方案，2026-08-02 晚）**：
   - `docker-compose.caddy8443.yml` 已启用：Caddy 反代 Kong，对外仅 8443（业务）+ 80（ACME HTTP-01 挑战）；Kong 端口 `!reset` 不再直接对外（已从外网实测 8000 不可达 ✅）；compose 追加 `acme-webroot:/srv/acme` 卷供续签 webroot。
   - `volumes/proxy/caddy/Caddyfile`（V2 改写，原域名版备份为 `Caddyfile.bak.s6`）：全局 `auto_https off`（关键——Caddy 自动签发的 ACME 中间件会抢占 `/.well-known/acme-challenge/*` 路径致 webroot 挑战 404，关闭后由 acme.sh 全权管证书）；`:8443` 手动 `tls /etc/caddy/tls/fullchain.pem key.pem`，API 路径→kong:8000，其余→studio:3000 带 basic-auth；`:80` 仅服务 ACME 挑战，其余请求 abort。
   - 证书（acme.sh v3.1.3，gitee 镜像安装，GitHub 直连被墙）：先 staging（letsencrypt_test）跑通 IP 证书签发，再正式签发——Let's Encrypt `--certificate-profile shortlived`，SAN=IP 101.35.124.22，有效期 6.7 天；ECC P-256。签发热路径：HTTP-01 + webroot（续签零停机，无需 standalone 抢 80）。
   - **续签命门已实测**：`--days 3`（每 3 天续签，6 天证书留足余量；LE 同 IP 每 168h 限 5 张，用量 ≈2 张/周，安全）；root cron 每日 11:44 `acme.sh --cron`；续签后 reloadcmd = `docker restart supabase-caddy`（restart 而非 reload，因容器启动命令需重新哈希 basic-auth 密码）。**2026-08-02 20:19 手动强制续签一次成功**：新证书落盘 + Caddy 自动重启 + 证书日期刷新，下次自动续签 2026-08-04。
   - `.env` 接入地址切换：`SUPABASE_PUBLIC_URL` / `API_EXTERNAL_URL` → `https://101.35.124.22:8443(/auth/v1)`，`PROXY_DOMAIN` → `101.35.124.22`；`SITE_URL=https://ddctl.com` 不动（前端仍在美国站）。auth/studio 已重建生效、全栈 healthy。
6. ~~S8 预制~~ **S8 已启用（V2 本地留存版，2026-08-02 晚）**：`/opt/backups/backup.sh` 重写为纯本地留存——容器内 pg_dump（custom 格式，public+auth 全量）→ gzip → `/opt/backups/`，保留最近 7 份；自检 = gzip 完整性 + dump 目录 TABLE DATA ≥40（实测 45）；失败写 ALARM 到 `backup.log` 并非零退出。root cron 每日 **03:30** 启用，已手动完整跑通一次（产物 66KB gz）。旧远端推送版（backup.env 模板）已删除。**运营每周手动下载**：`/opt/backups/wowbutler_*.dump.gz` 取最新一份，scp/SFTP 下载到运营本地电脑即异地副本。
7. 数据灌库：`DROP SCHEMA public/auth CASCADE` → `pg_restore --no-owner` → 归属修正（auth.* → supabase_auth_admin，public.* → postgres，与云端布局一致）→ `CREATE EXTENSION pgjwt`（补齐云端有而镜像未默认建的一个）。
8. 超管重授：`564245086@qq.com` 的 `raw_app_meta_data.role=superadmin` 已恢复。

### 仓库侧
- `.env` 三行切换（2026-08-02 S7）：`SUPABASE_URL=https://101.35.124.22:8443`、`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` → 自托管新 key。前端代码零改动（cloud.js 经 `/api/supabase-config` 注入配置）；旧配置备份 `.env.bak.s7`（秒级回退用，观察期结束后删除）。
- `js/app.js`：更新日志补录 1 条（REQ-035 迁移，模块调整类），`node --check` 通过。

## 二、精简组件名单及理由

| 组件 | 处理 | 理由 |
|---|---|---|
| realtime | 移除 | js/ 全库零引用（已 grep 确认，cloud.js 仅用 localStorage 会话存储） |
| storage + imgproxy | 移除 | 项目无文件存储功能，零引用 |
| functions（edge-runtime）+ deno-cache | 移除 | 项目无边缘函数 |
| supavisor（连接池） | 移除 | 前端走 REST/RPC，无直连需求；5432 由 db 绑回环替代 |
| analytics/vector/logs | 本版 compose 已无/未启用可选 logs 栈 | 省内存 |
| **保留**：db / auth(gotrue v2.189.0) / rest(postgrest v14.12) / kong 3.9.1 / studio / meta(postgres-meta) | 运行 | 业务必需 |

禁完影响的功能名单：**实时推送、文件存储、边缘函数、连接池**——本项目均未使用，无功能损失。

## 三、对账表（演练，2026-08-02 13:36 CST 导出）

源库 = pg_dump 出口；目标 = 自托管灌库后精确 `count(*)`。**43 张表逐张相等**。

| 表 | 源 | 目标 | 表 | 源 | 目标 |
|---|---|---|---|---|---|
| auth.users | 10 | 10 ✅ | public.game_patches | 3 | 3 ✅ |
| auth.identities | 10 | 10 ✅ | public.game_seasons | 2 | 2 ✅ |
| auth.sessions | 12 | 12 ✅ | public.game_raids | 6 | 6 ✅ |
| auth.refresh_tokens | 22 | 22 ✅ | public.game_bosses | 19 | 19 ✅ |
| auth.mfa_amr_claims | 12 | 12 ✅ | public.boss_loot | 3 | 3 ✅ |
| auth.schema_migrations | 77 | 77 ✅ | public.tier_sets | 80 | 80 ✅ |
| public.activities | 7 | 7 ✅ | public.game_dungeons | 16 | 16 ✅ |
| public.activity_attendance | 135 | 135 ✅ | public.game_classes | 13 | 13 ✅ |
| public.guild_members | 7 | 7 ✅ | public.game_specs | 40 | 40 ✅ |
| public.guilds | 4 | 4 ✅ | public.loot_records | 6 | 6 ✅ |
| public.notifications | 12 | 12 ✅ | public.raid_members | 50 | 50 ✅ |
| public.user_characters | 2 | 2 ✅ | public.user_profiles | 4 | 4 ✅ |
| public.wishlists | 8 | 8 ✅ | auth 其余 17 张空表 | 0 | 0 ✅ |

- RLS：19 张 public 表全部 `relrowsecurity=true`；`pg_policies` 共 70 条策略随库落地（主数据 9 表 master_read/master_write 齐全，业务表策略名与 sql/02 一致）。
- 扩展：pgcrypto / uuid-ossp / pg_net / pgjwt（补建）/ pg_stat_statements / supabase_vault / plpgsql 就位。
- 字典抽查：13 职业、40 专精、S2 十三职业套装齐（战士=翡翠督军的统御、唤魔师=灾厄回响）。
- 端点冒烟（服务器本机）：Kong→PostgREST service_role 200 / anon 鉴权通过 / gotrue 注册冒烟签发 token 正常（冒烟用户已在灌库时随 auth schema 重建清除）。

## 四、发现的源库数据问题（非迁移造成，待运营处置）

1. `boss_loot` 有 1 行新测试残留：`id=4aa9a4ac-9b00-46be-9305-e7bd8a084e8b`，`item_name='123'`（FIXED-032 清理后新产生的）。未代删，请运营在数据中心确认后删除。
2. `game_seasons` 两个赛季（S1/S2）`is_current` 均为 false——「本赛季」口径当前实际走 90 天回退。建议运营在数据中心把 S2 置为当前赛季（迁移已原样照搬，未代改）。

## 五、接入延迟实测（S6 完成后，2026-08-02 20:20 CST，国内客户端实测）

- 证书链：`openssl s_client` 直连 8443——issuer=Let's Encrypt YE2，SAN=IP 101.35.124.22，有效期 2026-08-02 → 2026-08-09；**curl 不带 `-k` 全通过**（系统信任链认可，浏览器同）。
- 功能链：`/auth/v1/health`（带 anon key）= 200；`/rest/v1/game_classes` 查询直达 PG（返回列名错误属预期，证明 TLS→Caddy→Kong→PostgREST→DB 全链路通）。
- 延迟（`/auth/v1/health`，8 次）：首请求 1.41s（冷启动含 TLS 握手），热请求 **0.104~0.141s**（TLS 握手 0.08~0.11s）——对比迁移前跨太平洋频繁 524，提升两个数量级。
- 外网暴露面复核：8000（Kong 直连）已不可达 ✅；80 仅 ACME 挑战路径有响应，其余 abort ✅。

## 六、切换窗口记录

- 演练窗口：2026-08-02 13:24–13:42 CST（导出 13:36 完成，dump 220KB，灌库+对账 6 分钟）。
- **正式切换：2026-08-02 20:52–21:15 CST（约 23 分钟，在 30 分钟红线内）**：
  - 20:52 最终导出（Session pooler ap-southeast-1，dump 216K，`/opt/backups/final_20260802_205205.dump` + 源侧/目标侧行数清单同目录留存）；
  - 灌库：drop public/auth → pg_restore → 归属修正（auth.*→supabase_auth_admin、public.*→postgres）→ pgjwt 确认 → 超管重授（564245086@qq.com）；
  - **对账：42 张表源侧=目标侧全等**（与演练差异：boss_loot 3→2——运营已删测试残留行；loot_records 6→5；refresh_tokens 22→23；其余不变）；
  - 21:10 `.env` 三行切换 + localhost:5000 起服自检（`/api/supabase-config` 返回新地址 ✅）；
  - 更新日志补录（REQ-035，模块调整类）。
- 切换后：旧 Supabase 云项目（wbsulgzzrkumcdkiqhkw）**只读保留**，任何人不得再写入，观察期 1~2 周后由运营删除或暂停。

## 七、遗留问题与外部依赖（阻塞项）

| # | 事项 | 等谁 | 状态 |
|---|---|---|---|
| ~~B1~~ | ~~DNS A 记录~~（V2 已取消域名方案，改裸 IP + IP 证书） | — | ✅ 作废（S6 完成） |
| ~~B2~~ | ~~安全组放行 8443+80~~（V2：安全组已放行，S6 已实测两端口工作正常） | — | ✅ 完成 |
| B3 | ~~S8 备份 cron 启用~~（V2 本地留存版已重写并启用，每日 03:30，已实测跑通；运营每周手动下载 `/opt/backups/` 最新一份） | — | ✅ 完成 |
| B4 | ~~正式切换窗口~~（2026-08-02 20:52–21:15 已执行，23 分钟完成；待运营 localhost:5000 验收 10 条） | 运营验收中 | 🔶 验收中 |

其他遗留：
- L1：内存余量偏紧——栈全起（含 Caddy）后 `available` 约 1.5G（另有 swap），观察期需盯内存；超 4G 建议升配。
- L2：无 SMTP，`ENABLE_EMAIL_AUTOCONFIRM=true`（注册免验证直接可用，与云端"需邮件确认"行为有差异）；找回密码邮件不可用，需后续配 SMTP 或接受现状。
- L3：旧云项目保持只读，任何人不得再写入（切换后执行）。
- L4：IP 证书 6.7 天短周期为持续性运维命门——cron 每 3 天续签已实测（见 S6），观察期必须确认至少 1 个自动周期成功（验收表第 10 条）；LE 速率限制同 IP 每 168h 5 张，勿频繁手动强制续签。

## 八、回退预案确认

cloud.js 两行改回旧 Supabase 云配置即秒级回退（旧项目保留 1~2 周只读）；服务器侧栈不影响旧链路。已确认可行。

## 九、台账与 changelog

- 台账 REQ-035 登记为「进行中（S1~S6 完成，待 S7 切换窗口、S8 备份启用）」，随本次报告同步更新。
- changelog（应用内更新日志）按四维分类补录「其他」类条目，随 S7 切换一并提交（当前未提交 git，遵守验收前不提交纪律）。
