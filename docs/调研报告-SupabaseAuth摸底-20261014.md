# 调研报告：Supabase Auth 能力摸底

- 调研日期：2026-10-14
- 调研范围：线上 Auth 配置实测（只读）+ Supabase 官方文档/定价页调研 + 迁移路径评估
- 红线遵守：全程零写入；密钥仅在脚本内从 `.env` 读取，本报告不含任何密钥完整值
- 重要背景：本项目 SUPABASE_URL 为 `https://101.35.124.22:8443`——**自建（self-hosted）Supabase 实例**，非 supabase.com 托管云。这直接影响「成本」章节的适用性（托管定价/MAU 额度对自建不生效，自建不受平台配额约束，成本=自有服务器+运维）。

---

## 一、实测配置（/auth/v1/settings 结果摘要）

请求方式：`GET {SUPABASE_URL}/auth/v1/settings`，Header `apikey=<SUPABASE_ANON_KEY>`，HTTP 200。实测返回关键字段：

| 字段 | 实测值 | 含义 |
|---|---|---|
| `external.email` | **true** | 邮箱密码登录已启用（唯一启用的 Provider） |
| `external.phone` | false | 手机号登录未启用 |
| 其余 external.*（google/github/discord 等 20+ 项） | 全部 false | 无任何第三方 OAuth Provider |
| `external.anonymous_users` | false | 匿名登录未启用 |
| `disable_signup` | **false** | 注册未禁用（任何人可自助注册） |
| `mailer_autoconfirm` | **true** | **邮箱确认处于关闭状态**——注册后无需点确认邮件即可直接登录 |
| `phone_autoconfirm` | false | — |
| `sms_provider` | "" | 无短信服务商配置 |
| `saml_enabled` / `passkeys_enabled` | false / false | SAML SSO、Passkey 均未启用 |

补充实测（service_role 只读调用 `GET /auth/v1/admin/users?page=1&per_page=1`，HTTP 200）：
- **存量用户总数：41**（取自响应头 `x-total-count`，未记录任何用户字段）。

解读：
1. 当前是纯邮箱密码体系，且 `mailer_autoconfirm=true`，即注册即生效、不发/不要求确认邮件。这与前端 `js/cloud.js` 注册后立刻 `onUserSignedIn()` 进主界面的行为一致（cloud.js:208-240）。
2. 自建实例下 `mailer_autoconfirm` 由服务端配置项 `GOTRUE_MAILER_AUTOCONFIRM` 控制，开启邮箱确认 = 改服务端环境变量为 `false` + 配置可用 SMTP，无需改前端代码（signUp 已有 session 兜底分支，cloud.js:221-230 兼容「需确认」与「自动确认」两种返回形态）。
3. 自建实例没有 supabase.com Dashboard，邮件模板/确认开关/SMTP 全部走 GoTrue 环境变量（`GOTRUE_MAILER_TEMPLATES_*` 等）或 Admin API 配置。

---

## 二、7 项能力清单逐项结论

| # | 能力 | 结论 | 关键事实 |
|---|---|---|---|
| ① | 邮箱验证（confirm email） | **支持，当前未启用；开启零前端改动** | 托管项目默认开、自建默认关（与实测 `mailer_autoconfirm=true` 吻合）。自建通过 `GOTRUE_MAILER_AUTOCONFIRM=false` 开启。邮件模板可自定义：确认/重置/换邮箱/魔法链接/安全通知等 6+ 套模板，支持 Go template 变量（`.ConfirmationURL`/`.Token`/`.SiteURL` 等），托管走 Dashboard，自建走 `GOTRUE_MAILER_TEMPLATES_*` 环境变量。来源：[Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates)、[Customizing email templates](https://supabase.com/docs/guides/local-development/customizing-email-templates) |
| ② | 密码重置 | **SDK 原生支持，两段式流程** | 第一步 `resetPasswordForEmail(email, { redirectTo })` 发重置邮件（需 SMTP + redirect URL 白名单）；第二步用户从邮件链接回到「改密页」（此时已带 recovery 会话）调 `updateUser({ password })`。本项目前端目前**未实现**重置入口（cloud.js 无 `resetPasswordForEmail` 调用），需新增：登录页「忘记密码」入口 + 一个公开改密页/弹窗。来源：[Passwords](https://supabase.com/docs/guides/auth/passwords) |
| ③ | 密码修改 | **已实现** | `cloud.js:278-284 updatePassword()` 调 `auth.updateUser({ password })`，REQ-094/096 已落地（改密后强制重新登录）。SDK v2.102.0+ 还支持 `current_password` 参数在改密时服务端校验旧密码，可作为后续增强（当前项目用自建 `verifyCurrentPassword` 直连 token 端点校验，cloud.js:259-273）。 |
| ④ | 用户迁移（批量导入） | **可行，bcrypt/argon2 hash 可直导，密码无需重置** | 路径一：`auth.admin.createUser({ email, password_hash, email_confirm: true, ... })` 逐用户脚本化调用（service_role）；路径二：直接 SQL INSERT 进 `auth.users`（自建实例有数据库直连权限，这条路对本项目完全开放）。支持的 hash 格式：bcrypt、Argon2（i/id）、Firebase scrypt；**不支持 PBKDF2**。无官方 bulk import 端点，大迁移靠脚本循环或 SQL。来源：[Migrate from Auth0 to Supabase Auth](https://supabase.com/docs/guides/platform/migrating-to-supabase/auth0)、[Migrating PBKDF2 hashes into Supabase Auth（实测格式清单）](https://erfi.dev/reference/pbkdf2-supabase-auth-migration/) |
| ⑤ | 自定义元数据 | **两类，权限模型清晰** | `user_metadata`（raw_user_meta_data）：用户本人可用 `updateUser({ data })` 改写，存显示名/偏好等无害字段——本项目已在用（注册时写 `display_name`，cloud.js:216；改名 cloud.js:1666）。`app_metadata`（raw_app_meta_data）：**仅 service_role/Admin API 可写**，用户不可篡改，适合放授权信息——本项目主数据超管 `app_metadata.role='superadmin'` 即是此用法。红线：RLS/授权判断只准读 app_metadata，禁用 user_metadata。来源：[Managing User Data](https://supabase.com/docs/guides/auth/managing-user-data) |
| ⑥ | 邮件服务商 | **内置 SMTP 仅为玩具档，生产必须自定义** | Supabase 托管内置 SMTP：只能发给项目团队成员邮箱（其余地址报 `Email address not authorized`），速率限制**仅 2 封/小时**，无 SLA，官方明确「非生产用途」。配置自定义 SMTP 后默认限速 30 封/小时（可在 Rate Limits 页调高）。官方列举可用服务：Resend、AWS SES、Postmark、Twilio SendGrid、ZeptoMail、Brevo；也可用 Send Email Auth Hook 接任意非 SMTP 服务。自建实例下没有内置 SMTP 概念，直接配 `GOTRUE_SMTP_*` 即可，限速自定。来源：[Send emails with custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) |
| ⑦ | 成本 | **托管：Free 5 万 MAU / Pro 10 万 MAU；本项目自建不受此约束** | 托管定价（[supabase.com/pricing](https://supabase.com/pricing)，2026-10-14 查）：Free $0，含 50,000 MAU；Pro $25/月/组织起，含 100,000 MAU，超出 $0.00325/MAU；Team $599/月起。内置邮件限速 2 封/小时（见⑥）。**本项目为自建实例（IP:8443），无 MAU 计费，实际成本=现有服务器+可选第三方 SMTP 费用**（如 Resend 免费档 100 封/天/3000 封每月、SES $0.10/千封量级）。 |

---

## 三、用户迁移路径与改动量评估

### 3.1 现状澄清（基于代码事实）

本项目账户体系**已经是 Supabase Auth 邮箱账户**：

- 注册：`js/cloud.js:212-218` 直接调 `client.auth.signUp({ email, password, options: { data: { display_name } } })`，邮箱是账户唯一标识。
- 登录：`js/cloud.js:198` 调 `signInWithPassword({ email, password })`。
- 邀请码（`guilds.invite_code`）**只是入会凭证，不是账户体系**：`cloud.js:531-536` 中 `joinGuild` 要求先登录（`currentUser` 为空即抛「请先登录」），再用邀请码查公会后写入 `guild_members`。即「邀请码无邮箱用户」在当前产品里不存在——没有邮箱账户连加入公会的入口都走不到。

### 3.2 假想场景：若存在「仅邀请码、无邮箱」的存量用户要迁入 Supabase Auth

前提假想：某旧系统里有一批只有用户名/邀请码、没有邮箱的用户，要变成 Supabase Auth 用户。

- **前端**：零改动或极小改动。登录注册界面已是邮箱体系；迁移后用户用「预置邮箱+初始密码」或「首次登录强制改密」进入，现有 signInWithPassword 链路直接承接。
- **后端**：新增一个一次性迁移脚本（Node，service_role）：循环 `auth.admin.createUser({ email: 占位邮箱或真实邮箱, password: 随机初始密码 / password_hash: 旧bcrypt, email_confirm: true, user_metadata: { display_name } })`，拿到返回的 `user.id` 后回写业务表外键。几十到几百用户规模秒级完成；无官方批量端点但脚本成本极低。
- **数据**：以迁移脚本产出的 `auth.users.id` 为准，批量 UPDATE `guild_members.user_id` / `user_profiles.id` / `raid_members.user_id`（认领）等外键列；若保留旧密码 bcrypt hash 则用户无感，否则需配合「首次登录强制改密」或密码重置邮件流程（依赖 SMTP 先就位）。

### 3.3 auth.users 与业务表关联现状（sql 事实）

外键关联完整、级联规则明确（sql/01_tables.sql、sql/schema_baseline_v1.sql）：

| 业务表 | 关联列 | 级联规则 |
|---|---|---|
| `guilds.owner_id` | → auth.users(id) | ON DELETE SET NULL |
| `guild_members.user_id` | → auth.users(id) | ON DELETE CASCADE（删 auth 用户自动清公会成员关系） |
| `user_profiles.id` | → auth.users(id) | 主键即外键，ON DELETE CASCADE |
| `raid_members.user_id`（认领人） | → auth.users(id) | 有外键（01_tables.sql:56） |
| `activities.created_by` / `loots.assigned_by` 等 | → auth.users(id) | 审计列，SET NULL / 无级联 |

另有 sql/25 的存量补发逻辑：为缺 `user_profiles` 行的 `auth.users` 自动建行——说明业务层已接受「auth.users 先行、业务表行可后补」的方向，迁移脚本可复用这一模式（先建 auth 用户，再补/改业务行）。

风险点：删 auth 用户会 CASCADE 掉 guild_members/user_profiles，但 raid_members.user_id 与审计列的行为需按上表逐列确认；迁移/清理脚本不要直接 DELETE auth.users，除非确知级联后果。

---

## 四、成本估算（粗略数字）

**前提：本项目为自建 Supabase，托管定价不适用，以下为对照参考。**

托管云口径（supabase.com/pricing，2026-10-14）：
- Free：$0/月，50,000 MAU，内置 SMTP 2 封/小时（不可用级别）。
- Pro：$25/月/组织起，100,000 MAU 含内，超出 $0.00325/MAU（例：20 万 MAU ≈ $25 + 10万×$0.00325 = $350/月）。
- 若同等功能迁托管，本项目 41 个用户远低于 Free 档 5 万 MAU 上限，**纯 Auth 维度 $0 即可覆盖**；瓶颈只在数据库 500MB/暂停策略等其他配额。

自建口径（本项目实际）：
- Auth 本身边际成本 $0（GoTrue 跑在自有服务器）。
- 若开启邮箱确认/密码重置，需第三方 SMTP：Resend 免费档 100 封/天（约 3000 封/月）对 41 用户体量绰绰有余；AWS SES 约 $0.10/千封。**实际增量成本 ≈ $0/月**。

---

## 五、决策素材摘要

- 线上实测：唯一启用的 Provider 是邮箱密码；`mailer_autoconfirm=true`（注册免确认）；`disable_signup=false`；**存量 41 个用户**；实例为自建（IP:8443），无托管 Dashboard，所有 Auth 配置走 GoTrue 环境变量/Admin API。
- 邮箱确认、密码重置两项能力 SDK/服务端原生支持，前端注册链路（cloud.js signUp 带 session 兜底）已兼容确认开关两种状态，开启邮箱确认**前端零改动**，真正的前置条件是配好 SMTP。
- 密码重置是前端缺口：cloud.js 无 `resetPasswordForEmail`，需新增「忘记密码」入口+改密落地页（公开可访问），约一个小型前端任务。
- 用户迁移有成熟路径：`admin.createUser` 支持 bcrypt/argon2 hash 直导（不支持 PBKDF2），或自建库直接 SQL 写 auth.users；几十用户规模脚本化即可完成，业务表外键（guild_members/user_profiles/raid_members）已有完整 REFERENCES auth.users 约束可承接。
- 元数据纪律：授权只信 `app_metadata`（本项目超管 `role='superadmin'` 已合规）；`user_metadata.display_name` 用户可自改，仅作展示。
- 成本结论：自建架构下 Auth 边际成本为零；唯一可能的新增支出是 SMTP 服务，41 用户体量用免费档（Resend 100 封/天）即可覆盖，**年成本可视为 $0**。

---

## 附：引用来源

1. [Passwords | Supabase Docs](https://supabase.com/docs/guides/auth/passwords)（2026-10-14 查）
2. [Email Templates | Supabase Docs](https://supabase.com/docs/guides/auth/auth-email-templates)（2026-10-13 更新）
3. [Send emails with custom SMTP | Supabase Docs](https://supabase.com/docs/guides/auth/auth-smtp)（2026-10-09 更新）
4. [Managing User Data | Supabase Docs](https://supabase.com/docs/guides/auth/managing-user-data)（2026-10-14 查）
5. [Migrate from Auth0 to Supabase Auth | Supabase Docs](https://supabase.com/docs/guides/platform/migrating-to-supabase/auth0)（2026-10-12 更新）
6. [Migrating PBKDF2 password hashes into Supabase Auth](https://erfi.dev/reference/pbkdf2-supabase-auth-migration/)（hash 格式清单：bcrypt/argon2/firebase-scrypt）
7. [Supabase Pricing](https://supabase.com/pricing)（2026-10-14 查）
8. [Customizing email templates（自建/CLI 环境变量口径）](https://supabase.com/docs/guides/local-development/customizing-email-templates)
