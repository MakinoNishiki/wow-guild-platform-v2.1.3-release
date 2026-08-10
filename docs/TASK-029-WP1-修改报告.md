# 任务书 #29 WP1 修改报告：账号体系完善 A 组（REQ-094）

> 日期：2026-08-10 ｜ 执行：Kimi Code ｜ 版本串：20260810.39 → **20260810.40**（index.html 10 处 + data.html 6 处全量同步）
> 范围：注册密码强度 / 用户中心修改密码 / 玩家ID BattleTag 风格。WP2（SMTP/邮箱验证）未动，等运营侧 SendGrid+DNS。
> 红线自查：零依赖、深色 WoW 主题组件规范；玩家ID 纯展示识别，未进入任何鉴权/查重逻辑；未碰公示页与既有业务逻辑、密钥、.env、server.js、RLS；测试数据自清理复核为零；**未 commit 未 push**。

---

## ⚠️ 运营执行通道（两条）——**2026-08-10 执行令转我执行，均已落地**，详见第九节补记

1. ~~执行 SQL 迁移 `sql/25_task029_wp1_user_profiles_tag_num.sql`~~ **已执行**（备份→docker exec psql→NOTIFY→复核全过，第九节①）。
2. ~~SSH 配置 gotrue 环境变量 `GOTRUE_PASSWORD_MIN_LENGTH=8`~~ **已生效**（.env 一行 + compose 透传 + recreate，7 位注册实测 422 拒绝，第九节②；compose 透传行属执行令口径外的事实修正，已报备）。

## 一、修改文件清单

| 文件 | 位置 | 改动 |
|---|---|---|
| sql/25_task029_wp1_user_profiles_tag_num.sql | 新建 | tag_num 迁移（只产出，未执行，未碰生产库） |
| index.html | 注册表单 | 强度条三元素（#regPwStrength/#regPwStrengthFill/#regPwStrengthText）+ regPassword oninput + placeholder「至少8位，需含字母和数字」（登录框改「登录密码」） |
| index.html | 用户中心 | uc-tab「🔒 修改密码」+#tab-password 面板（#ucPwCurrent/#ucPwNew/#ucPwConfirm/#ucPwSubmitBtn/#ucPwHint）+ 玩家ID 卡（#ucPlayerIdCard/#ucPlayerIdText）+ 头像菜单下拉头（#userMenuHead/#userMenuHeadName/#userMenuHeadId） |
| css/main.css | 文件末尾追加 | .pw-strength＊ / .uc-playerid-＊ / .user-menu-head＊ 样式（深色主题、零依赖） |
| js/cloud.js | REQ-094 区块 | verifyCurrentPassword（独立 fetch gotrue token 端点，不碰会话）/ updatePassword / ensureTagNum（10000-99999 随机、23505 碰撞重试 5 次、SDK 直连）/ getTagNum / getPlayerId；cloudSignOut 清 currentTagNum |
| js/app.js | 注册链路 | WEAK_PASSWORDS top-20 + passwordRuleError（≥8位+字母数字+黑名单）+ passwordStrengthLevel（弱/中/强）+ updatePwStrength('reg'&#124;'uc') + updatePwGate（非空不合规禁提交）；handleRegister 兜底同口径 |
| js/app.js | 用户中心 | changePassword（#ucPwHint 就地提示、成功 toast「密码已修改」+清字段、会话保持）+ copyPlayerId（clipboard 失败回退 execCommand）+ openUserCenter 先 ensureTagNum 再渲染、末尾 snapshotModalForm 重拍（防误关登记 modalDirtyChecks）+ updateCloudUI 渲染头像菜单下拉头 |
| js/app.js | changelogData 顶部 | 补录「新增功能」条目（REQ-094） |
| scripts/verify-task29-wp1.js | 新建 | A 注册强度 8 项 / B 改密主链路 10 项 / C 玩家ID 7 项（tag_num 未迁移自动 SKIP）+ T29A 前缀清零复核 4 项 |
| scripts/verify-task27-patch.js | 零报错过滤 | 仅放宽 console 噪音过滤 406→(400&#124;406)（ensureTagNum 对未迁移列的 PGRST204 探测噪音，迁移后自然消失），业务零改动 |

版本串 .39 → .40：index.html 10 处 + data.html 6 处。node --check js/app.js、js/cloud.js 均过。

## 二、三项实现说明

**① 注册密码强度**：规则 = ≥8 位 + 含字母和数字 + top-20 弱口令黑名单（passwordRuleError 单一口径，注册提交兜底与实时门禁同函数）。强度三档：弱（不合规或黑名单，--danger，33%）/ 中（合规，--warning，66%）/ 强（合规且 ≥10 位且大小写混合或含符号，--success，100%）。密码框非空且不合规时注册按钮禁用（updatePwGate），清空恢复。登录表单不动。

**② 用户中心修改密码**：新 tab「🔒 修改密码」三字段（当前/新/确认）。校验链：当前密码错→「当前密码错误」（verifyCurrentPassword 独立 fetch gotrue token 端点验证，**不换 session、不触发 onAuthStateChange，会话零抖动**）；两次不一致/新=旧/新密码不合规就地提示（#ucPwHint）不提交；新密码框带同款强度条+提交门禁。成功 toast「密码已修改」+ 三清字段，supabase-js updateUser 官方保持当前会话（不掉线、不刷新页面）。面板已登记防误关（modalDirtyChecks + snapshotModalForm 重拍，改动未保存关闭弹确认）。

**③ 玩家ID（BattleTag 风格）**：`{显示名}#{5位数字}`，显示名 = user_metadata.display_name 唯一真源（任务书 #21 口径），数字段 = user_profiles.tag_num（10000-99999 随机，注册/登录后 ensureTagNum 惰性确保，唯一索引碰撞 23505 重试至多 5 次，恒定不变）。展示位两处：用户中心「玩家ID」卡（点击复制，clipboard 失败回退 execCommand）；右上角头像菜单**下拉头部**小字（名称 + ID，未分配整头隐藏）。纯展示识别用途，未进入任何鉴权/查重/数据链路。

## 三、验证（真浏览器实测，scripts/verify-task29-wp1.js，19/19 PASS + 7 SKIP）

**A 注册密码强度 8/8**（§2 生效值断言：色 = getComputedStyle 解析 CSS 变量 RGB 比对，宽 = fill/track 像素比，非类名断言）：

- A1 `12345678` → 弱 + danger rgb(248,81,73) + 33% + 提交禁用；A1b `abc12345` → 黑名单文案「过于常见」
- A2 纯字母 / A3 7 位 → 文案正确；A4 `T29abcdef` → 中 + warning + 66% + 启用；A5 `T29abcde1!` → 强 + success + 100%
- A6 清空 → 条隐藏 + 按钮恢复；A7 门禁交互。截图 backup/2026-08-10-task29-wp1/reg-weak.png、reg-strong.png

**B 修改密码 10/10**：B0 UI 注册+建会进应用；B1 当前密码错→「当前密码错误」；B2 两次不一致；B3 新=旧；B4 弱新密码→提交禁用+danger 色（computed）；**B5 成功 toast「密码已修改」+三字段清空+会话保持（token 非空、未回登录页）**；**B6 登出后旧密码登录失败、新密码登录成功进应用**。截图 uc-changepw.png（已抽看：面板/清空/按钮复位正常）。

**C 玩家ID 7 项 SKIP（§4 声明，非静默放宽）**：探测实测 `user_profiles.tag_num` 返回 42703（sql/25 未执行），整组跳过并在输出显著标注。脚本幂等，运营执行 sql/25 后复跑即可兜底 C1-C7（含头像菜单下拉头渲染、复制、碰撞重试、恒定不变）。零 JS 报错项 PASS。头像菜单截图 avatar-menu.png 因此未产生，随 C 组补。

**过程发现并已修复 1 个业务 bug**：首跑 B5/B6 四项红——`verifyCurrentPassword` 误引用 initSupabase 函数作用域内的局部 `config`（ReferenceError→恒返回 false，正确密码也校验失败）。已改为 `client.supabaseUrl/client.supabaseKey`（supabase-js v2 客户端公开属性），复跑转绿。

**已知行为说明（不追求两全）**：passwordRuleError 先查格式再查黑名单，WEAK_PASSWORDS 中 6 条纯数字条目（12345678 等）先中「字母和数字」规则——用户结果相同（弱+禁用+合理文案），黑名单分支由 `abc12345` 验证可达。

## 四、回归五组全绿 + 清零复核

| 项 | 结果 |
|---|---|
| verify-task29-wp1 | **19/19 PASS + 7 SKIP**（C 组待迁移） |
| verify-task27-wp1 | **8/8** |
| verify-task27-wp2 | **27/27**（同名一删一留预期维持补丁2 裁定口径，未回退） |
| verify-task27-patch | **24/24** |
| npm test（server-security） | **5/5** |
| SEC-001（verify-authz.js） | **34/34** |

#27 已验收主链路零回归确认：wp1/wp2/patch 测试账号均走 signup API + 密码本就合规，未触发新注册门禁，无需改测试密码。
**测试数据清零复核**：T29A 前缀四项全零（guilds=0、guild_members=0、profiles=0、auth 404）；wp1/wp2/patch 各前缀复核全零。诊断临时账号 t29a-diag 已删净。

## 五、§1 修复副作用审计单

| 触及约束 | 可能影响的既有行为 | 验证方式 | 结论 |
|---|---|---|---|
| 注册表单加 oninput + 提交门禁 | **注册链路**：updatePwGate 仅在密码非空且不合规时禁用提交；登录按钮不受门禁；authSetBusy  loading 态与门禁独立（提交中禁用由既有逻辑管） | A6/A7 实测 + B0 UI 注册建会主链路 + wp1/wp2/patch 全绿 | 无 |
| 用户中心新增改密 tab + 玩家ID 卡 | **防误关**：openUserCenter 末尾 snapshotModalForm 重拍，新面板登记 modalDirtyChecks——改动未保存关闭弹确认，无改动不误弹 | B 组全程多次开关用户中心无误弹/误拦 | 无 |
| 头像菜单加下拉头小字 | **全站布局**：小字放在**下拉菜单头部**（仅展开时渲染）而非 topbar 触发行，topbar 高度/每页布局零影响；未分配（迁移前）整头隐藏 | updateCloudUI 渲染逻辑审查 + C 组待迁移后截图兜底 | 无（解读见第六节②） |
| verifyCurrentPassword 独立 fetch | **auth 会话保持**：不走 signInWithPassword，不换新 session、不触发 onAuthStateChange 回调链；改密后 updateUser 官方保持会话 | B5 会话保持断言（token 非空、未回登录页）+ B6 旧密码失效新密码生效 | 无 |
| ensureTagNum fire-and-forget | **登录不阻塞**：onUserSignedIn 里异步调用不 await，失败 console.warn 吞错；并发重复调用由唯一索引 + maybeSingle 读回收敛 | B0/B5 登录链路与 C 探测 | 无 |
| ensureTagNum 对未迁移列探测 | **console 噪音**：迁移前每次登录产生一条 PGRST204 400（已 console.warn 吞错，无 UI 影响）；verify-task27-patch 零报错断言过滤已放宽并注释，迁移后自然消失 | patch 24/24 | 已知噪音，迁移后消失 |
| ensureTagNum 写 user_profiles SDK 直连 | **写路径先例**：个人表 RLS 限本人，与 user_characters（saveUserCharacter）同先例；不经过 /api/db 代理 | C 组待迁移后实测兜底 | 无（同先例） |
| 玩家ID 渲染 | **不进入鉴权/查重**：getPlayerId 仅用于展示与复制，全文检索无鉴权/查重调用点 | 代码审查 | 无 |

## 六、设计备忘（候运营校准，不重开）

1. **cloud.js config bug**（第三节已述）：验收暴露、本包内修复，非遗留。
2. **头像菜单玩家ID 位置**：§1 提示「全站每页都渲染，加小字不得撑破布局」——解读为放在头像**下拉菜单头部**（展开才渲染），topbar 触发行不动。如运营要的是 topbar 常显小字，另案调整。
3. **tag_num 区间**：任务书示例「#08241」与区间约束 10000-99999 矛盾——按区间实现（恒 5 位、无前导零），CHECK 约束同口径。
4. **强度「强」档口径**：合规且 ≥10 位且（大小写混合或含符号），三档色值复用主题变量 --danger/--warning/--success。
5. **user_profiles 真实结构**以 sql/schema_baseline_v1.sql 为准（PK user_id + display_name），sql/01 的 id/nickname 结构已漂移，sql/25 按 baseline 编写。

## 七、§4 数据样本前提声明

- **存量账号样本**：线上 auth.users = **8 账号**、user_profiles = **3 行**（sql/25 的 DO 块 = 3 行补号 + 5 账号补建行，补发区间 10000-99999 随机不重复）。本包未执行迁移，补发结果待运营执行后核对。
- **碰撞重试用例构造方式**：verify 脚本 C 组用 Math.random 单次 stub（首次 pickTagNum 强制返回已被占用的号）构造 23505 碰撞，验证重试收敛——tag_num 未迁移，该项随 C 组 SKIP，迁移后实测。
- **改密样本**：B 组 T29A 前缀新注册账号 2 个（UI 注册 1 + API 1），跑完自清理清零。
- **玩家ID 实测样本**：迁移前库内 tag_num 样本 = **0（无样本）**，C 组 7 项 SKIP 声明如上，未静默放宽。

## 九、执行令完成补记（2026-08-10，sql/25 迁移 + gotrue 环境变量，两项均已落地）

### ① sql/25 迁移执行（迁移纪律：备份 → 执行 → NOTIFY → 复核）

- **备份先行**（落服务器 /tmp，路径+大小）：
  - 全库快照 `/tmp/pgdump_full_20260810_sql25.sql.gz` —— **141,898 字节**
  - 两表转储 `/tmp/pgdump_auth_users_user_profiles_20260810_sql25.sql` —— **14,940 字节**
- **执行**：sftp 上传 → `docker cp` → `docker exec supabase-db psql -U supabase_admin -d postgres -f`，输出：`ALTER TABLE ×3 / INSERT 0 4 / DO / CREATE INDEX / NOTIFY`，exit=0，唯一 NOTICE 为幂等 DROP CONSTRAINT IF EXISTS 跳过提示（预期）。
- **schema 重载**：文件内 NOTIFY + 单独再发 `NOTIFY pgrst, 'reload schema';` 各一次。
- **复核全过**：tag_num NULL 行=0；重复行=0；越界行=0；唯一索引 uq_user_profiles_tag_num 在位；行数 auth.users 8→8（零漂移）、user_profiles 4→8。
- **§4 存量补发实际口径**（修正本报告此前「3 行」的侦察值）：迁移前实测 user_profiles=**4 行**（侦察后执行前新增 1 行）、auth.users=8 → 补发 = **4 行补号 + 4 账号建行补号**（INSERT 0 4）。全部 8 行号段 10000-99999 不重复。

### ② gotrue GOTRUE_PASSWORD_MIN_LENGTH=8

- **.env**：`/opt/supabase/.env` 第 83 行追加 `GOTRUE_PASSWORD_MIN_LENGTH=8`（仅此一行；改前备份 `/opt/supabase/.env.bak-20260810-sql25`）。密钥纪律遵守：值只进 .env，未进代码/文档/git。
- **事实修正（报备）**：执行令口径「只进 .env」在本机不生效——`/opt/supabase/docker-compose.yml` 的 auth 服务是 `environment:` 显式 `${VAR}` 映射（无 env_file），.env 新行无透传通道，force-recreate 后容器 env 仍无该项。已在 auth environment 增加一行**纯引用透传** `GOTRUE_PASSWORD_MIN_LENGTH: ${GOTRUE_PASSWORD_MIN_LENGTH}`（第 148 行；值仍只存 .env，compose 不落地任何值；改前备份 `docker-compose.yml.bak-20260810-sql25`）。过程中 sed 曾被本地 shell 展开误写成硬编码 `6`，当次即发现并已修正为透传引用，终态核对无误。
- **生效核对**：`docker compose up -d --force-recreate auth` 重建后 `docker exec supabase-auth env` 实测 `GOTRUE_PASSWORD_MIN_LENGTH=8`，容器 healthy。compose 提示 supabase-caddy orphan 为既有信息性警告，未动。
- **生效验证（直连 auth API）**：7 位密码注册 → **422 `weak_password`「Password should be at least 8 characters.」（reasons:["length"]）**；8 位合规密码注册 → **200 正常签发**（前端正常注册链路不受影响）。验证账号 t29e-minlen@example.com 已 DELETE 清理，复核 t29e- 前缀 0 行。

### ③ 终验复跑（迁移+env 生效后）

- `node scripts/verify-task29-wp1.js`：**27/27 PASS，SKIP 清零**——C 组玩家ID 7 项由 SKIP 转实测全过（tag=70735 区间合规、玩家ID卡/复制 toast/菜单头渲染、改名后数字段恒定、碰撞重试 stub 撞 23505 后收敛 65196、防误关计数、trigger 高度 36→36 不变）。截图补齐 4 张：`backup/2026-08-10-task29-wp1/`（avatar-menu.png 新补，已抽看）。
- 回归：npm test **5/5**、SEC-001 verify-authz **34/34**（gotrue 重建后无回归）。
- **测试数据清零复核**：T29A 前缀四项全零（guilds/guild_members/profiles/auth 404）+ t29e- 验证账号 0 行。
- 脚本适配 2 处（非业务代码）：C4 前补 closeModal、C5 改重新 openUserCenter；零报错过滤新增 409（C6 故意碰撞的必然噪音）。

### ④ 执行侧说明

- 生产库全程只执行 sql/25 一个文件 + 验证账号清理 DELETE，未顺手改任何其他结构/数据；线上真实数据（含「验收梅」同名组）只读未动。
- 一次性执行器留档（backup/ 已 gitignore，凭据仅走环境变量当次使用）：`backup/_sshtmp/run-sql25.js`、`run-gotrue-minlen.js`、`run-gotrue-minlen2.js`。
- SSH 凭据按密钥纪律只走私聊通道，未进 git/文档/本报告。
- **未 commit 未 push**，报告送审。

## 十、遗留与后续

- ~~运营执行 sql/25 后复跑验收~~ 已完成（第九节③，27/27）。
- ~~运营 SSH 配置 GOTRUE_PASSWORD_MIN_LENGTH=8~~ 已完成（第九节②）。
- WP2（邮箱验证/SMTP）：等运营侧 SendGrid+DNS 接通后另案。
- 台账：REQ-094 已登记 changelogData「新增功能」；WP1 三项落库。
