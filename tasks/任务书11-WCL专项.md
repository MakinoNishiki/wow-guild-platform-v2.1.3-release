# 任务书 #11：WCL 专项（REQ-032 链接导入成员 + REQ-033 考勤自动标记）

## 0. 背景与设计依据

本任务书依据已与运营确认的设计稿执行，设计决策如下（**不得擅自变更**，有异议先回报）：

1. REQ-033 对照名单 = **成员管理（raid_members，固定团名单）**，不是公会名单（公会里不活跃角色太多，对照会产生大量"未匹配"噪音）；
2. 部分 Boss 战角色**默认标"出席"**，黄色高亮提醒"仅参加部分 BOSS 战，可手动改为替补"，由用户决定；替补计入出勤（出勤 = 出席 + 迟到 + 替补，任务书 #6 统一算法），出席/替补不影响出勤率，仅为管理明细；
3. log 有、成员管理没有的角色 = **红色提醒**"该角色不在成员管理名单中"，操作：一键添加为成员 / 忽略；
4. **不覆盖手动**：已手动标记的考勤状态，同步一律不冲掉；重复点同步幂等；
5. 同步时把当晚参战名单存为快照（WCL 免费日志约 2 年过期，快照保永久）；
6. 本期**不做**：WCL 评分/排名展示、定时自动同步、对手动考勤流程的任何改动。

WCL API 约束：V2 GraphQL，client credentials 授权，免费档速率 3600 points/小时（本功能单次消耗远低于额度，无需节流设计，但要做超限报错）。

## 1. 环境变量

`.env` 新增（两台电脑 + 服务器三处都要加，部署部分见第 6 节）：

```
WCL_CLIENT_ID=019fa239-7ed8-7182-84f8-4ef849a29492
WCL_CLIENT_SECRET=Km2gWUmFw33qEmiElqowA0dpB8j6IWdwnGtwQSMi
```

server.js 的 loadDotEnv() 已支持自动读取；变量名回退逻辑（COZE_ 前缀）不需要扩展。**密钥只允许出现在服务端，前端 js/ 目录禁止出现这两个值**（验收时 grep 检查）。

## 2. 阶段 0：API 验证先行（不写业务代码，先出数据）

新建 `scripts/verify-wcl-api.js`（零依赖，复用 server.js 的 dotenv 解析方式），依次验证并打印结果：

1. **换 token**：POST `https://www.warcraftlogs.com/oauth/token`，Basic Auth（client_id:client_secret base64），body `grant_type=client_credentials`，打印是否拿到 access_token（token 本身不要完整打印，打前后各 6 位即可）；
2. **拉报告**：GraphQL POST `https://www.warcraftlogs.com/api/v2/client`，对一份**公开报告**（从用户已有的活动 wcl_url 里取一个 code，或由运营提供一个）执行：

```graphql
query ($code: String!) {
  reportData {
    report(code: $code) {
      title
      startTime
      endTime
      masterData { actors(type: "Player") { id name server subType } }
      fights { id encounterID name startTime endTime friendlyPlayers }
    }
  }
}
```

3. 打印：报告标题、玩家总数、Boss 战（encounterID > 0）场次、样例 3 个角色的 name/server/subType、本次查询的 rateLimitData 剩余点数；
4. **token 缓存**：验证脚本里实现"token 未过期则复用"，供 server.js 后续照抄。

**验证通过**（能拿到角色名单和 fights）→ 进入第 3、4 节开发；**验证失败**（凭证错误/报告私有/字段不符）→ 停止开发，把失败现象写进修改报告交回，禁止绕过验证蛮干。

## 3. 服务端：WCL 代理端点（server.js）

新增端点（全部走 authorizeProxyRequest，**owner/editor 可用，viewer 403**）：

| 端点 | 方法 | 入参 | 返回 | 说明 |
|------|------|------|------|------|
| `/api/wcl/report-summary` | POST | `{ reportCode }` | 标题、时间、Boss 战场次数、玩家列表（name/server/subType/参战fight数/总fight数） | 供预览页使用 |
| `/api/wcl/attendance-snapshot` | POST | `{ reportCode, activityId }` | 玩家列表 + 已存快照状态 | 拉数据并提示快照差异 |

实现要求：

- **token 管理**：进程内缓存 access_token，记录过期时间提前 60s 刷新；换取失败返回明确错误码；
- **reportCode 解析**：支持两种入参——完整 URL（`https://cn.warcraftlogs.com/reports/XXXX#...` 或 `https://www.warcraftlogs.com/reports/XXXX`）或纯 code，正则提取，非法输入 400；
- **参战统计**：分母 = 该报告 encounterID > 0 的 Boss 战总场次；分子 = 该角色出现在 friendlyPlayers 的 Boss 战场次（小怪/ trash 不计）；
- **错误透传**：报告不存在/私有（WCL 返回错误）→ 502 + 中文提示文案；rate limit 耗尽 → 429 + 提示稍后再试；网络超时 10s → 504；
- **禁止缓存报告数据本身**（用户可能刚传完 log 就要同步，缓存会造成"拉不到最新"），只缓存 token；
- 写操作日志沿用现有 [perf] 风格，记 WCL 请求耗时。

## 4. REQ-033 考勤自动标记（前端）

**入口**：活动考勤区，当活动已挂 WCL 链接（wcl_url / wcl_report_code，sql/05 已建）时显示按钮「从 WCL 同步考勤」。未挂链接的活动不显示。

**流程**：点按钮 → 调 `/api/wcl/report-summary` → 拉成员管理名单对照 → 弹「同步预览」弹窗 → 确认 → 写入 activity_attendance → reload → render（遵守 cloudCrud 铁律：真实写库成功才提示，禁止假成功）。

**预览弹窗三分区**（对照名单 = 成员管理 raid_members）：

| 分区 | 判定 | 样式 | 默认动作 | 可改 |
|------|------|------|---------|------|
| ① 自动出席 | log 角色名与成员管理角色名完全一致，且参战场次 = Boss 总场次 | 绿 | 出席 | 可改替补/缺席 |
| ② 部分参战 | 同名但参战场次 < Boss 总场次 | **默认出席** + 黄色高亮"仅参加 X/Y 场 BOSS 战，可改为替补" | 出席 | 可改替补 |
| ③ 未匹配 | log 有、成员管理没有 | 红色"该角色不在成员管理名单中" | 不写入考勤 | 一键添加为成员（进成员管理）/ 忽略 |

成员管理里有、log 里没有的成员：**不在预览页出现**，考勤区保持未标记，用户照常手动标。

**写入铁律**：
- 只写"未标记"的记录；**已手动标记的状态一律不动**；预览页显示"N 条已手动标记，将被保留"；
- 重复点同步 = 幂等，不产生重复记录（先查已有 attendance 再决定插入）；
- 确认写入成功后，把参战名单快照写入 `activities.wcl_snapshot`（JSONB，若无此列则出 sql/07 增量：`ALTER TABLE activities ADD COLUMN IF NOT EXISTS wcl_snapshot jsonb;`，sql 文件同时放项目 sql/ 目录并在修改报告提醒运营到 Supabase SQL Editor 执行）；
- 按钮 loading 态（"同步中..."，防重复点击，遵守规范弹窗防误关第 6 条：预览弹窗有未确认数据时点关闭需二次确认）。

**多角色规则**：按角色名逐一匹配，同一人多个号各算各的，不做合并。

## 5. REQ-032 WCL 链接导入成员（前端）

**入口**：智能导入弹窗新增第二个标签页「从 WCL 链接导入」（与现有粘贴宏页并列，现有功能一行不动）。

**流程**：贴 WCL 报告链接 → 调 `/api/wcl/report-summary` → 用返回的玩家列表（name + subType 职业 + server）**直接进入现有预览确认页**（复用查重、职业识别、同服唯一 REQ-002 校验、确认入库全链路，禁止另写一套入库逻辑）。

**细节**：
- subType → 中文职业名映射（Warrior→战士 等 13 职业，映射表放 js/ 内常量）；
- server 字段参与同服唯一校验；跨服同名按 WCL server 归属；
- 已在成员管理中的角色在预览页标"已存在"，默认不勾选导入；
- ③ 分区（考勤同步里的红色未匹配角色）"一键添加为成员"按钮同样复用本链路：预填进智能导入预览页。

## 6. 部署同步（修改报告里必须提醒）

线上服务器（朋友机器）的 `.env` 也要加 WCL 两行，否则线上 WCL 功能报 500。在修改报告末尾加醒目提示：**Push 后请运营联系朋友在服务器 .env 追加 WCL_CLIENT_ID / WCL_CLIENT_SECRET 并重启服务**。

## 7. 文档同步（修改报告完成项里逐条列出）

- `docs/AGENTS.md`：新增 WCL 集成说明（凭证、端点、token 缓存、速率限制）；
- `docs/开发规范.md`：无新增章节，技术债表无需更新（本任务是新功能非债务）；
- `docs/问题与需求清单.md`：REQ-032、REQ-033 标记完成；决策记录新增一条：考勤同步三分区规则（部分参战默认出席+黄色提醒、未匹配红色、不覆盖手动、快照留存）；

## 8. 验证与交付

1. `node --check server.js / js/app.js / js/cloud.js` 全过；
2. `scripts/verify-wcl-api.js` 输出贴进修改报告（token 获取✅、报告解析✅、速率余量）；
3. `verify-authz.js` 26/26 回归通过（新增端点也要补 viewer 拦截用例，加入该脚本，总数随之增加）；
4. grep 确认前端代码无 WCL_CLIENT_SECRET；
5. 修改报告按惯例：改动文件清单 / 数据流说明 / 验证结果 / 待运营执行项（sql/07、服务器 .env）。

**不提交 git**，运营验收后走 GitHub Desktop。

## 9. 验收用例（运营侧，供核对）

| # | 场景 | 通过标准 |
|---|------|---------|
| 1 | 已挂 WCL 链接的活动出现「从 WCL 同步考勤」按钮；未挂链接的活动没有 | 显隐正确 |
| 2 | 贴真实 log 同步 | 预览页三分区正确：全勤绿色出席、部分参战黄色出席、外援红色未匹配 |
| 3 | 部分参战成员 | 默认出席，可手动改替补，改完出勤率不变（两者都计出勤） |
| 4 | 红色未匹配角色 | 可一键添加进成员管理；忽略则不入考勤 |
| 5 | 先手动标两人请假 → 再同步 | 这两人状态不被冲掉，预览页提示"已手动标记将被保留" |
| 6 | 重复点同步 | 不产生重复考勤记录 |
| 7 | 智能导入 → WCL 链接标签页 | 贴 log 链接 → 预览页出角色+职业+服务器 → 查重正确 → 入库成功 |
| 8 | viewer 账号 | 看不到同步/导入入口，直接调接口 403 |
| 9 | 无效链接 / 私有报告 | 中文错误提示，不白屏不转圈卡死 |
| 10 | 同步成功后 | 考勤区刷新显示，活动详情留有快照（刷新页面数据仍在=真实写入） |
