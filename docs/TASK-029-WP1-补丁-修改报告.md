# 验收修复小包修改报告：BUG-072 改名刷新链 + REQ-096 改密强制重新登录

> 日期：2026-08-11 ｜ 执行：Kimi Code ｜ 版本串：20260810.41 → **20260811.42**（index.html 10 处 + data.html 6 处全量同步）
> 范围：① BUG-072 改名后昵称显示不即时刷新；② REQ-096 改密成功后强制重新登录（口径变更，推翻任务书 #29 WP1「会话保持」裁定）。
> 红线自查：零依赖、零 schema 变更、未碰 server.js/RLS/密钥/.env/公示页渲染层；测试数据自清理复核为零；**未 commit 未 push**。

---

## 一、修改文件清单

| 文件 | 位置 | 改动 |
|---|---|---|
| js/app.js | `saveUserProfile()` | BUG-072：保存成功后补 render 环——`await loadUserProfile()`（重读服务端用户，刷用户中心顶部玩家ID卡 + 页内昵称输入）+ `updateCloudUI()`（刷 topbar 昵称/头像 + 头像菜单头昵称与玩家ID）；零整页 reload |
| js/app.js | `changePassword()` | REQ-096：改密成功 → toast「密码已修改，请重新登录」→ `handleSignOut()`（全站唯一 logout 路径）→ `showLoginForm()` + `showAuthNotice()` 登录页持久提示；删「会话保持」旧逻辑 |
| js/app.js | `showAuthError()` / 新增 `showAuthNotice()` | showAuthError 补颜色复位（防成功级绿色覆写残留）；showAuthNotice 复用 #authError 元素、绿色语义 |
| js/app.js | changelogData 顶部 | 补录两条：「修复BUG」BUG-072、「功能优化」REQ-096；REQ-094 旧条目中「会话保持/不掉线」表述按 REQ-096 口径修正（同版本周期内消除自相矛盾） |
| js/cloud.js | `updatePassword()` 注释 | 注释口径更新：SDK 本身保持会话，强制登出由调用方执行（REQ-096）；函数体零改动 |
| index.html | 修改密码面板注释 + 版本串 | 注释「改密后会话保持」→「REQ-096：改密成功强制登出重新登录」；版本串 10 处 |
| data.html | 版本串 | 6 处同步递增（开发规范第五章第 6 条，与 index.html 同步） |
| scripts/verify-task29-wp1.js | B5/B6/C5 + 头部注释 | 按新口径更新断言并注释引用本令（裁定驱动合法更新）：B5「会话保持」反转为「强制登出（回登录页+登录页提示+token 清空+弹窗已关）」；B6 删手动 logout（B5 已强制登出落在登录表单）；C5 删手动 `loadUserProfile()`  workaround，改断言保存即四点即时跟随（BUG-072 实证） |
| scripts/verify-task27-wp2.js | 三处写后固定 sleep → 条件等待 | 回归期假红排查产物（见第四节附注）：删除/离队链路远端代理写实测 3.6s 超出原 2.5s 固定窗口致假红，HEAD 未改动代码同病复现；三处改条件等待（toast 出现 / DB 轮询到位），断言零改动零放宽 |
| docs/问题与需求清单.md | 台账 | 登记 BUG-072 / REQ-096（编号纪律） |

`node --check` js/app.js、js/cloud.js、scripts/verify-task29-wp1.js、scripts/verify-task27-wp2.js 均通过。

## 二、断点定位与修法（DB-first 逐环核对）

### BUG-072（改名刷新链）

逐环核对结果：

1. **写入环** ✅：`CloudSync.saveUserProfile` → `auth.updateUser({data:{display_name}})` 写唯一真源 user_metadata，并以返回的最新 user 更新本地 `currentUser` 缓存——断点不在此。
2. **状态环** ✅：各显示点均实时读 `getCachedUser()` / `getPlayerId()`（名字部分跟 user_metadata），无第二副本——断点不在此。
3. **render 环** ❌ **断点在此**：`updateCloudUI()` 虽在保存后被调（topbar/头像菜单可刷），但用户中心顶部玩家ID卡 `#ucPlayerIdText` 与页内昵称输入 `#ucDisplayName` 只在 `loadUserProfile()`（进入用户中心时）渲染，保存后无人重渲——故需重进用户中心才更新。

修法：只补断环——保存成功后 `await loadUserProfile()`（DB-first 重读服务端用户）+ `updateCloudUI()`，覆盖全部四个显示点；禁止的整页 reload 未使用。F5 不回退由写入环（user_metadata 持久化）保证。

### REQ-096（改密会话链）

旧口径：改密成功 toast「密码已修改」、会话保持。新口径（本令）：改密成功 → toast「密码已修改，请重新登录」→ signOut → 跳转登录页，旧会话即刻失效。

实现：成功路径清三字段后 `showToast` → `await handleSignOut()`（FIXED-024 确立的全站唯一 logout 路径：清会话/公会态 + modalStack 全弹窗出栈 + showAuthView 兜底跳转 + 登录按钮状态机复位）→ `showLoginForm()`（showAuthView 只显遮罩，表单停留上次状态，强制回登录表单）→ `showAuthNotice()` 落持久提示。

**toast 可见性处理**：#toastContainer 位于 .app-container 内，登出后随应用视图隐藏，toast 用户看不到——故登录页以 #authError 元素落绿色持久提示「密码已修改，请重新登录」（showAuthNotice），toast 仍发（满足「toast/提示」口径与 DOM 断言）。showAuthError 同步补颜色复位，避免后续错误提示残留绿色。

强度条组件（updatePwStrength/updatePwGate/passwordRuleError）零改动，复用零回归由 A 组 8 项 + B4 断言锁定。

## 三、验证（真浏览器实测，scripts/verify-task29-wp1.js，27/27 PASS、SKIP 0）

主链路实测（具体到页面/按钮/交互）：

- **REQ-096 主链路**：用户中心 → 🔒 修改密码 tab → 填当前/新/确认密码 → 点「确认修改」→ toast「密码已修改，请重新登录」→ 自动登出回登录页（登录表单态）+ 登录页绿色持久提示「密码已修改，请重新登录」+ 用户中心弹窗已关 + token 已清空（B5 两项断言）；旧密码登录 → 「邮箱或密码错误」（B6）；新密码登录 → 进应用 dashboard 可见（B6）。截图 `backup/2026-08-10-task29-wp1/uc-changepw-relogin.png`（已抽看：登录页 + 绿色提示就位）。
- **BUG-072 主链路**：用户中心 → 个人资料 tab → 显示名称改「T29新名」→ 点「保存资料」→ 不重进不刷新：顶部玩家ID卡 = `T29新名#50520`、页内昵称输入 = T29新名、头像菜单头昵称+玩家ID = T29新名 / `T29新名#50520`、topbar 昵称 = T29新名，数字段恒定（C5 断言五点全中）；C6 碰撞重试后改名数字段仍恒定。
- **失败路径**：B1 当前密码错 → 就地提示「当前密码错误」弹窗不关不跳转；B2/B3 两次不一致/新=旧 就地提示；B4 弱新密码提交禁用 + 强度条 danger computed 色。
- **强度条零回归**：A 组 8/8（弱/中/强三档 computed 色 + 比例 + 门禁交互）+ B4。
- 全程零 JS 报错；测试数据清零复核全 0（guilds/guild_members/profiles/auth 404）。

断言更新声明（裁定驱动合法更新）：B5 原「会话保持（token 非空且未回登录页）」与 REQ-096 新口径直接冲突，已反转为强制登出断言并在脚本头部与 B5 注释引用本令；B6 流程适配（B5 已登出，删手动 logout）；C5 删手动 loadUserProfile workaround 改即时断言（BUG-072 修复实证）。

## 四、回归五组全绿 + 附注

| 项 | 结果 |
|---|---|
| verify-task29-wp1 | **27/27 PASS，SKIP 0**（上节；含 REQ-096 强制登出、BUG-072 即时刷新新断言） |
| verify-task27-wp1 | **8/8** |
| verify-task27-wp2 | **27/27** |
| verify-task27-patch | **24/24** |
| npm test（server-security） | **5/5** |
| SEC-001（verify-authz.js） | **34/34** |

**附注：wp2 回归假红排查（与本包无关，已实证）**——首轮回归 wp2 出现 17/10 红，全部失败级联自「删除成功 toast」一环。A/B 对照：临时换回 HEAD 四文件（git show 只读取出，未做 git 变更）同病复现（26/1、23/4），排除本包嫌疑；一次性探针（固定 sleep 改条件等待）实测删除链路远端代理写耗时 **3588ms**，超出脚本 2.5s 固定等待窗口——断言跑在写库落地之前，纯环境延迟假红。处置：wp2 三处写后固定 sleep 改条件等待（断言零改动零放宽），复跑 27/27；探针脚本已删除。wp1/patch/npm/SEC-001 各组测试数据清零复核均为 0。

## 五、§1 修复副作用审计单（刷新链/会话链路逐项）

| 链路环节 | 可能影响的既有行为 | 验证方式 | 结论 |
|---|---|---|---|
| 改名写入 → `loadUserProfile()` 重读 | **用户中心表单态**：loadUserProfile 会重填邮箱/昵称输入为服务端值——保存后表单值 = 刚保存的值，无用户未保存内容被冲（保存即成功路径）；失败路径不触发 | C5 实测输入框 = 新名；B/C 组多次开关用户中心无误弹 | 无 |
| 改名 → `updateCloudUI()` 重刷 topbar/菜单头 | **公会名/角色徽章同函数渲染**：updateCloudUI 同时渲染公会名、身份徽章、数据中心入口——均为幂等重渲，数据源未变 | C4 菜单头 + trigger 高度 36→36 不变；回归全绿 | 无 |
| 改名 → 公会快照同步 + `renderMembers()` | **成员列表重渲**：既有行为（任务书 #22 WP3-④），本包未动 | verify-task27 三组全绿 | 无（未触及） |
| 改密成功 → `handleSignOut()` | **全站唯一 logout 路径复用**：清会话/公会态 + 全弹窗出栈 + showAuthView + 按钮复位——与手动退出登录同一链路，无新分支 | B5 强制登出断言（token 清空/回登录页/弹窗关）；FIXED-024 路径已被既有回归覆盖 | 无 |
| 改密 → `showLoginForm()` 强制登录表单态 | **注册/公会表单状态**：仅显隐切换 + resetAuthButtons（既有状态机），门禁重估 updatePwGate('reg') 不受影响 | B6 旧/新密码登录走登录表单正常 | 无 |
| 改密 → `showAuthNotice()` 绿色提示 | **#authError 复用**：showAuthError 补颜色复位，后续错误提示恢复 danger 色；showLoginForm/showRegisterForm/showGuildForm 切表清空提示（既有 showAuthError('') 路径） | B6 旧密码错误提示正常显示「邮箱或密码错误」（覆盖绿色提示且断言不含成功文案） | 无 |
| `updatePassword()` 注释口径更新 | 函数体零改动，SDK 层仍保持会话（强制登出在调用方） | 代码审查 + B5 实测 | 无 |
| 版本串 .41→.42 | 静态资源缓存刷新；data.html 同步 | grep 复核 index.html 10 处 + data.html 6 处全替换、旧串零残留 | 无 |
| 强度条组件 | **零改动**：updatePwStrength/updatePwGate/passwordRuleError/WEAK_PASSWORDS 未碰 | A 组 8/8 + B4 全绿 | 无 |

## 六、§4 数据样本前提声明

- **测试样本**：T29A 前缀（UI 注册账号 t29a-main + API 占位账号 t29a-occ + T29A公会），跑完脚本自清理并复核为零（guilds=0、guild_members=0、profiles=0、auth 404）——本次复跑已确认全 0。
- **改名样本**：T29A昵称 → T29新名，tag_num=50520 恒定；碰撞重试样本 55555/77447（C6 故意 23505 构造，重试收敛落库）。
- **改密样本**：T29abcd12 → NewT29pass34（均满足强度规则）；旧密码登录失败、新密码登录成功实测。
- **存量真实数据**：线上真实公会/账号（含运营真实数据）只读未动；本包零生产库写入（测试行已自清理）。
- **既有样本偏差**：无——本包不依赖任何存量数据形态；tag_num 已迁移（sql/25 已执行），C 组全量实测无 SKIP。

## 七、遗留与后续

- 无新增遗留。REQ-094 WP2（邮箱验证/SMTP）仍等运营侧 SendGrid+DNS，另案。
- 台账：BUG-072 / REQ-096 已登记 docs/问题与需求清单.md；changelog 四维补录两条（修复BUG + 功能优化）。
- **未 commit 未 push**，报告 + 审计单送审。
