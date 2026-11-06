# 账号安全基础闭环

## 最新安排（2026-11-07）
运营明确调整优先级：账号安全暂缓，由负责服务器的朋友后续接入。代理停止本轮实施；当前仅审计文档，无产品代码、数据库、生产配置改动。以下为交接材料，不代表已实现。恢复时需重新核查配置与版本，优先完成真实邮件送达、回调、恢复密码及注册验证联验。

基线：2fc2d18。依据开发规范、UI工作方法、DESIGN.md；2026-11-06用户优先授权账号安全基础工作。当前为审计及实施交接，未改产品或生产。

## Design language
- 审计范围：index.html authLoginForm/authRegisterForm、用户中心修改密码；js/cloud.js认证监听及js/app.js认证导航。
- 设计来源：DESIGN.md、docs/UI工作方法-证据规范实现验收.md。
- 复用：auth-overlay/auth-container/auth-field/auth-input/auth-btn、btn-primary/btn-ghost、既有错误与成功提示、passwordRuleError。
- 已知取舍：桌面优先、纯CSS零构建；不更换主题。

## Findings
No supported findings were found. 当前已确认的是功能缺口，不能伪装成视觉审计结论。

## Improve first
No supported recommendation. 依据用户明确诉求补齐找回流程，沿用现有认证表单视觉。

## 已确认的功能与环境证据
- index.html登录表单只有登录与注册，搜索无找回入口。
- cloud.js已有signUp/signIn/updatePassword，setupAuthListener不处理PASSWORD_RECOVERY。
- app.js changePassword已有当前密码校验与改密后登出，不应另建平行修改密码流程。
- 生产supabase-auth只读检查：MAILER_AUTOCONFIRM=true；SMTP_HOST=localhost、PORT=2500，该容器网络命名空间没有2500监听；SITE_URL=https://ddctl.com，URI_ALLOW_LIST只有localhost/127.0.0.1:5000。SMTP用户/密码仅检查是否非空，未输出或保存。
- 结论：当前配置不具备可用的生产邮件发送链路；存在配置值不代表送达能力。未发送任何邮件、未修改账号或生产配置。

## 施工范围
1. 登录表单添加忘记密码，输入邮箱、提交忙碌、防连点、成功与失败状态、返回登录。成功提示不泄露邮箱是否注册，不宣称实际送达。
2. 专用恢复页面/模式优先于主站路由和自动登录导航；有效恢复会话才能保存新密码，链接失效/取消/重开明确处理；成功后清理敏感URL并引导重新登录。不得记录恢复令牌。
3. 邮箱验证与重发入口；先检查已有注册无session时的行为，防止误报注册失败或误进入公会。存量自动确认账号不能标成实际收信验证过。
4. 邮箱变更采用原生安全确认流程，核对当前Auth版本支持与旧邮箱/新邮箱确认规则；不直接以管理员权限改邮箱。
5. 核对全局退出与旧会话边界：刷新令牌撤销不等于已发JWT立即失效，文案与实际一致。
6. 注销另列明确方案，覆盖会长交接与历史保留，不在此次不经确认删除账户。手机号、社交参数暂缓。

## 生产变更准备（尚未执行）
- 需要真实SMTP服务的host/port/发件地址/认证方式，以及域名投递验证；凭据只入受保护服务端配置。
- SITE_URL与允许回跳地址需与正式站点及专用恢复路径一致，禁止通配任意域名。
- 开启注册邮件确认前，必须通过真实送达及新注册完整验证；避免阻断注册。
- 修改前备份配置；只重启必要认证服务；回滚恢复原配置。不能将隔离测试配置用于生产。

## 验证
- 隔离Supabase测试邮箱收件器：注册确认、重发、找回、恢复保存、过期/重复链接、错误密码、取消、刷新、已登录打开恢复链接。
- 真浏览器点击登录忘记密码→收到测试邮件→打开链接→保存→旧密码失败/新密码成功，且不提前跳到团队页。
- 检查未注册邮箱反馈不暴露账号存在性、发送失败可重试、不假成功、密钥及token不进日志。
- 正式邮件收件验收需要用户指定可接收的测试邮箱并授权发送；不得测试修改真实用户密码。

## 当前阻塞
实际发信服务尚未确定。可以继续本地实现及隔离验证，但正式上线和真实送达验收必须具备可用SMTP。

## 参考
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail
- https://supabase.com/docs/guides/self-hosting/docker
