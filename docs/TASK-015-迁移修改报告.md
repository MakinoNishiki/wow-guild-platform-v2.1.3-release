# TASK-015 数据库迁移修改报告（Supabase 云 → 国内自托管）

> 状态：**S1~S5 完成（演练成功），S6~S8 待外部依赖**。
> 服务器：腾讯云上海 101.35.124.22（Ubuntu 24.04，4C4G/60G）。执行日期：2026-08-02。
> 密钥纪律：本报告不含任何密钥；密钥仅存于服务器 `/opt/supabase/.env`、`/opt/backups/backup.env`（均 600）。

## 一、实际改动点

### 服务器侧（全部在 101.35.124.22）
1. Docker 环境复用既有（Docker 28.2.2 + Compose v5.0.0，已配腾讯云镜像加速器），未新装。
2. 部署目录 `/opt/supabase/`：supabase/supabase master 分支 `docker/` 目录（GitHub 直连被墙，经本地中转 scp 上传）。
3. `docker-compose.yml` 精简（见下节），`db` 服务补 `127.0.0.1:5432:5432` 端口映射（替代被移除的 supavisor，仅供本机迁移/备份用）。
4. `/opt/supabase/.env`（600）：`JWT_SECRET`=原云项目密钥（老用户免重登机关）；`ANON_KEY`/`SERVICE_ROLE_KEY` 由同一 JWT_SECRET 重新生成（HS256，iss=supabase，10 年）；`POSTGRES_PASSWORD` 新强随机（与原云无关）；`API_EXTERNAL_URL`/`SITE_URL` 按 S6 默认方案预填 `https://api.ddctl.com:8443`；`ENABLE_EMAIL_AUTOCONFIRM=true`（无 SMTP，保证注册可用，见遗留问题 L2）。
5. S6 预制（未启动）：`docker-compose.caddy8443.yml`（Caddy 反代 Kong，仅暴露 8443 + 80 供 ACME 挑战；Kong 端口 `!reset` 不再直接对外）、`volumes/proxy/caddy/Caddyfile`（API 路径→kong:8000，其余→studio:3000 带 basic-auth）。
6. S8 预制（未启用）：`/opt/backups/backup.sh`（本地 pg_dump→gzip→推送远端→抽查 auth.users/raid_members/activities 三表行数比对，失败向 backup.log 写 ALARM 并非零退出；保留最近 7 份）、`/opt/backups/backup.env`（600，待填 `BACKUP_PGURI`）。
7. 数据灌库：`DROP SCHEMA public/auth CASCADE` → `pg_restore --no-owner` → 归属修正（auth.* → supabase_auth_admin，public.* → postgres，与云端布局一致）→ `CREATE EXTENSION pgjwt`（补齐云端有而镜像未默认建的一个）。
8. 超管重授：`564245086@qq.com` 的 `raw_app_meta_data.role=superadmin` 已恢复。

### 仓库侧
- 未改任何业务代码（S7 才动 cloud.js 两行，待切换窗口）。

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

## 五、接入延迟实测（当前状态）

- 自托管栈服务器本机 curl：`/rest/v1/`（service_role）<10ms；gotrue 注册全链路 <1s。
- 对外 HTTPS 延迟实测：**待 S6 DNS 与安全组开通后补测**（本报告随之更新）。

## 六、切换窗口记录

- 演练窗口：2026-08-02 13:24–13:42 CST（导出 13:36 完成，dump 220KB，灌库+对账 6 分钟）。
- 正式切换：**未执行**。按任务书需运营通知暂停录入 → 最终导出（重跑 S3→S4）→ cloud.js 两行切换 → 30 分钟内一气呵成。

## 七、遗留问题与外部依赖（阻塞项）

| # | 事项 | 等谁 | 状态 |
|---|---|---|---|
| B1 | DNS A 记录 `api.ddctl.com → 101.35.124.22`（Caddy 配置已预制，DNS 一生效即启动签证书） | 朋友 | ⬜ 阻塞 S6 |
| B2 | 腾讯云安全组放行 8443（业务）+ 80（ACME 挑战，签完可关）；若运营商对未备案域名封 80，需朋友提供既有证书方案（参照 db.ddctl.com:19832 实践） | 朋友 | ⬜ 阻塞 S6 |
| B3 | 加州备份库凭据（`BACKUP_PGURI`，库名 wow_butler_backup）填入 `/opt/backups/backup.env` 后启用 cron（每日 03:30） | 运营 | ⬜ 阻塞 S8 |
| B4 | 正式切换窗口（最终导出 + 前端两行切换 + localhost:5000 验收 9 条） | 运营拍板时间 | ⬜ 阻塞 S7 |

其他遗留：
- L1：内存余量偏紧——栈全起后 `available` 约 1.6G（另有 1.9G swap），观察期需盯内存；超 4G 建议升配。
- L2：无 SMTP，`ENABLE_EMAIL_AUTOCONFIRM=true`（注册免验证直接可用，与云端"需邮件确认"行为有差异）；找回密码邮件不可用，需后续配 SMTP 或接受现状。
- L3：旧云项目保持只读，任何人不得再写入（切换后执行）。

## 八、回退预案确认

cloud.js 两行改回旧 Supabase 云配置即秒级回退（旧项目保留 1~2 周只读）；服务器侧栈不影响旧链路。已确认可行。

## 九、台账与 changelog

- 台账 REQ-035 登记为「进行中（S1~S5 完成，待 S6~S8）」，随本次报告同步更新。
- changelog（应用内更新日志）按四维分类补录「其他」类条目，随 S7 切换一并提交（当前未提交 git，遵守验收前不提交纪律）。
