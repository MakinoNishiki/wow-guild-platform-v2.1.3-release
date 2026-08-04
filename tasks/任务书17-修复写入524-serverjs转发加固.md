# 任务书 #17：修复线上写入 524（server.js 转发层加固）

> 执行方：Kimi Code　｜　改动范围：**仅 server.js 一个文件**　｜　朋友侧：**零操作**　｜　密钥：不涉及

## 0. 一句话任务

线上所有写库请求经 server.js 的 `/api/db/rest/v1/*` 代理转发到上海数据库；转发层复用跨国 TCP 连接会病态停顿 15–20 秒，EdgeOne（ddctl.com 前面的 CDN）约 15 秒放弃 → 浏览器收到 524，但写入最后实际落库（"幽灵成功"，用户重试会产生重复数据）。本任务给转发层打加固补丁。

## 1. 病灶证据（运营侧已实测，仅供理解，不要质疑诊断方向）

- 用户 F12：`POST /api/db/rest/v1/activities` → **524，耗时 15.02s**；活动记录实际已写入数据库（切账号可见）。
- 运营外部探针：同一代理 POST 连续 4 次 **18–20 秒**才返回 201；DELETE 仅 **2.2s**；伪造 token 的鉴权往返 **2.2s**。
- 结论：慢且只慢在"转发到上游"这一段。病根 = `https.request` 走全局连接池，复用到上海的旧连接被跨国链路悄悄掐死，靠 TCP 重传（RTO 约 15–18 秒）才恢复。
- 架构背景（任务书 #15 之后）：浏览器读操作直连上海（约 30ms，健康）；写操作 = 浏览器 → EdgeOne → 美国服务器 server.js → 上海（双跨太平洋）。

## 2. 修改清单（只允许改 server.js）

**M1. 转发专用连接池：每次请求全新连接**

新增：`const upstreamAgent = new https.Agent({ keepAlive: false });`

`proxyToSupabase` 和 `verifyToken` 的 `https.request` options 里都加 `agent: upstreamAgent`。禁止再使用全局默认 agent（Node 19+ 默认 keepAlive=true，正是病根）。

**M2. proxyToSupabase 加上游超时 10 秒**

- options 或 `req.setTimeout(10000)`；`timeout` 事件里必须 `req.destroy()`（Node 不会自动销毁）。
- error 回调区分：超时/ECONNRESET → `callback({ statusCode: 504, headers: {}, body: JSON.stringify({ message: "数据库响应超时：本次写入结果未知，请先刷新列表确认，再决定是否重试" }) })`；其他错误维持原有 500 分支。
- 加 `done` 标志位，保证 callback 只被调用一次（响应已完成后又触发 error 的场景）。

**M3. 显式 Content-Length**

有 body 时：`forwardHeaders["Content-Length"] = Buffer.byteLength(body);`（去掉 chunked 传输编码，跨国中间设备对 chunked 处理不可靠）。

**M4. verifyToken 加 6 秒超时**

超时按验证失败处理，走原有 `callback(null)` → 401 路径（语义上略微委屈，但安全第一，可接受）。

**M5. 重试纪律（重要）**

- `supabaseRestGet`（鉴权模块内部 GET，幂等）：超时或 ECONNRESET 后**允许重试 1 次**——M1 之后每次请求本来就是新连接，直接重发即可。
- **POST / PATCH / DELETE 一律禁止自动重试**——上游可能已落库，自动重试 = 制造重复数据（本次事故已演示过）。

**M6. 保留 `[perf]` 日志行原样不动**（jwt/authz/write 分段计时是线上观测手段，后续还要靠它复查）。

## 3. 红线

1. 只允许改 **server.js**；禁止动 .env、cloud.js、app.js、index.html、sql/、docs/。
2. 线上 .env 现在是正确状态，**严禁以任何方式覆盖或改动**；本任务书不含、也不需要任何密钥。
3. 提交前 `git status` 自查：暂存区里应该只有 server.js 一个文件。

## 4. 本地验证（无需真实登录）

1. 本地起 server.js（本地 .env 指向上海 + 有效 keys，现状即是）。
2. `curl -X POST http://localhost:5000/api/db/rest/v1/activities -H "Authorization: Bearer fake" -H "Content-Type: application/json" -d "{}"` → 应**快速**返回 401（几秒内，不挂起）。
3. `curl http://localhost:5000/api/supabase-config` → 正常 JSON。
4. 代码自查四点：agent 挂在 options 上；timeout 事件里有 destroy；Content-Length 已设置；error 路径 callback 不重复调用。

## 5. 提交口径（给运营）

- 标题：`任务书#17：server.js 转发层加固（全新连接+上游超时，修复写入524）`
- 描述：`写库代理不再复用跨国 TCP 连接（keepAlive=false）；上游 10s 超时返回干净 504，杜绝"报错却已落库"的幽灵成功；鉴权 GET 可重试一次，写操作禁止自动重试；显式 Content-Length。仅 server.js。`

## 6. 部署与验收

1. 正常 push → GitHub Actions 自动部署。**先确认部署工作流包含进程重启步骤**（新 server.js 必须真正生效，不能只是文件落盘）。
2. 部署完成后**不要自行线上验收**，在对话里回复"已部署"。运营会先做外部真实写入探针（预期 201 且 < 5 秒），探针过了运营本人才做 5 轮保存/删除验收。
3. 验收标准：探针 3 连 POST 全部 < 5 秒；用户 5 轮保存/删除零 524、无重复记录。

## 7. 回滚

`git revert` 本次提交并 push，Actions 自动回退旧版 server.js，无数据风险。

## 8. 后续预案（不在本任务范围）

若加固后探针仍 > 5 秒：启动方案 B——把 `/api/db/*` 代理整体迁到上海服务器（转发变本地回环，浏览器写操作直连上海，读写的路径就一致了）。届时另出任务书，需要朋友配合一次（Caddy 加路由 + 跑一个服务）。
