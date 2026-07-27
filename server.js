"use strict";
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = __dirname;

// 读取项目根目录 .env 文件（手写解析，零依赖）。
// 已存在的系统环境变量优先，.env 只补缺。
function loadDotEnv() {
  try {
    const content = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue; // 注释和空行自然不匹配
      let value = m[2];
      if (
        (value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"'))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[m[1]]) process.env[m[1]] = value;
    }
  } catch {
    // .env 不存在或不可读时静默跳过，由其他来源（系统环境变量 / Coze 平台）提供配置
  }
}
loadDotEnv();

const PORT = parseInt(process.env.DEPLOY_RUN_PORT || "5000", 10);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

// Load Supabase env vars
let envLoaded = false;
function loadEnv() {
  if (envLoaded || (process.env.COZE_SUPABASE_URL && process.env.COZE_SUPABASE_ANON_KEY)) {
    envLoaded = true;
    return;
  }
  try {
    const pythonCode = `
import os, sys
try:
    from coze_workload_identity import Client
    client = Client()
    env_vars = client.get_project_env_vars()
    client.close()
    for ev in env_vars:
        print(f"{ev.key}={ev.value}")
except Exception as e:
    print(f"# Error: {e}", file=sys.stderr)
`;
    const output = execSync(`python3 -c '${pythonCode.replace(/'/g, "'\"'\"'")}'`, {
      encoding: "utf-8",
      timeout: 10000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    for (const line of output.trim().split("\n")) {
      if (line.startsWith("#")) continue;
      const eqIndex = line.indexOf("=");
      if (eqIndex > 0) {
        const key = line.substring(0, eqIndex);
        let value = line.substring(eqIndex + 1);
        if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = value;
      }
    }
    envLoaded = true;
  } catch {
    // silently fail
  }
}

function getSupabaseConfig() {
  loadEnv();
  return {
    url: process.env.COZE_SUPABASE_URL || process.env.SUPABASE_URL || "",
    anonKey: process.env.COZE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "",
  };
}

function getServiceRoleKey() {
  loadEnv();
  return process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function getSupabaseUrl() {
  loadEnv();
  return process.env.COZE_SUPABASE_URL || process.env.SUPABASE_URL || "";
}

// Verify JWT token with Supabase Auth
function verifyToken(accessToken, callback) {
  const supabaseUrl = getSupabaseUrl();
  const anonKey = process.env.COZE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
  
  if (!accessToken) {
    callback(null);
    return;
  }

  const url = new URL(`${supabaseUrl}/auth/v1/user`);
  const options = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname,
    method: "GET",
    headers: {
      "apikey": anonKey,
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  };

  const req = https.request(options, (res) => {
    let data = "";
    res.on("data", (chunk) => { data += chunk; });
    res.on("end", () => {
      if (res.statusCode === 200) {
        try {
          callback(JSON.parse(data));
        } catch {
          callback(null);
        }
      } else {
        callback(null);
      }
    });
  });

  req.on("error", () => callback(null));
  req.end();
}

// Proxy request to Supabase using service_role key
function proxyToSupabase(method, supabasePath, headers, body, callback) {
  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey = getServiceRoleKey();
  const url = new URL(`${supabaseUrl}${supabasePath}`);

  const forwardHeaders = {
    "apikey": serviceRoleKey,
    "Authorization": `Bearer ${serviceRoleKey}`,
    "Content-Type": headers["content-type"] || "application/json",
    "Prefer": headers["prefer"] || "return=representation",
  };

  // Forward query params are already in supabasePath

  const options = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname + url.search,
    method: method,
    headers: forwardHeaders,
  };

  const req = https.request(options, (res) => {
    let data = "";
    res.on("data", (chunk) => { data += chunk; });
    res.on("end", () => {
      callback({
        statusCode: res.statusCode,
        headers: res.headers,
        body: data,
      });
    });
  });

  req.on("error", (err) => {
    callback({
      statusCode: 500,
      headers: {},
      body: JSON.stringify({ error: err.message }),
    });
  });

  if (body) {
    req.write(body);
  }
  req.end();
}

// Read request body
function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => resolve(body));
  });
}

// ==================== SEC-001 代理层公会级鉴权 ====================
// 所有经 /api/db/rest/v1/* 的写操作以 service_role 执行（绕过 RLS），
// 因此必须在代理层完成 "用户 → 公会成员身份 → 角色" 三级校验。
// 规则映射见 tasks/任务书05 与 docs/开发规范.md 2.2。

// Promise 版 JWT 验证
function verifyTokenAsync(accessToken) {
  return new Promise((resolve) => verifyToken(accessToken, resolve));
}

// ==================== 任务书 #10 性能缓存 ====================
// 诊断结论：每次 HTTPS 往返 Supabase ≈700ms，写路径串行 3-5 次往返，
// JWT 验证与角色联查合计占一半以上且是重复查询，故加缓存；行归属联查不缓存。
//
// 缓存失效策略（安全优先于速度）：
// 1. JWT 缓存：按 token 缓存 60 秒。风险：用户登出/删号后最长 60 秒内旧 token
//    仍被认作"有效用户"，但公会级角色校验仍逐次生效，且 token 自身会过期，可接受。
// 2. 角色缓存：按 user+guild 缓存 120 秒。任何经本代理的 guild_members / guilds
//    写操作成功后立即清空全部角色缓存（见转发回调），因此权限变更经本代理即时生效；
//    直接改库的最晚 120 秒（TTL 上限）生效。
// 3. 行归属联查（resolveGuildIds / fetchRowById）不缓存——归属判断必须实时。
const JWT_CACHE_TTL = 60 * 1000;
const ROLE_CACHE_TTL = 120 * 1000;
const jwtCache = new Map(); // token → { user, exp }
const roleCache = new Map(); // `${userId}:${guildId}` → { role, exp }

function cacheSet(map, key, value) {
  if (map.size > 5000) { // 防内存膨胀：超限顺带清理过期项
    const now = Date.now();
    for (const [k, v] of map) { if (v.exp <= now) map.delete(k); }
  }
  map.set(key, value);
}

function verifyTokenCached(accessToken) {
  const hit = jwtCache.get(accessToken);
  if (hit && hit.exp > Date.now()) return Promise.resolve(hit.user);
  return verifyTokenAsync(accessToken).then((user) => {
    if (user) cacheSet(jwtCache, accessToken, { user, exp: Date.now() + JWT_CACHE_TTL });
    return user;
  });
}

async function getGuildRoleCached(guildId, userId) {
  const key = `${userId}:${guildId}`;
  const hit = roleCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.role;
  const role = await getGuildRole(guildId, userId);
  cacheSet(roleCache, key, { role, exp: Date.now() + ROLE_CACHE_TTL });
  return role;
}

// service_role REST 查询（仅鉴权模块内部使用）
function supabaseRestGet(restPath) {
  return new Promise((resolve) => {
    proxyToSupabase("GET", restPath, {}, null, (result) => {
      let body = null;
      try { body = JSON.parse(result.body); } catch { body = null; }
      resolve({ status: result.statusCode, body });
    });
  });
}

// 查询用户在指定公会的角色（owner/editor/viewer），非成员返回 null
async function getGuildRole(guildId, userId) {
  const { body } = await supabaseRestGet(
    `/rest/v1/guild_members?guild_id=eq.${guildId}&user_id=eq.${userId}&select=role&limit=1`
  );
  return Array.isArray(body) && body[0] ? body[0].role : null;
}

// 解析 query string 中的 eq. 过滤条件 → { 列名: [值, ...] }
function parseEqFilters(queryString) {
  const filters = {};
  const qs = (queryString || "").replace(/^\?/, "");
  for (const pair of qs.split("&")) {
    if (!pair) continue;
    const eqIdx = pair.indexOf("=");
    if (eqIdx < 0) continue;
    const key = decodeURIComponent(pair.slice(0, eqIdx));
    const value = decodeURIComponent(pair.slice(eqIdx + 1));
    if (value.startsWith("eq.")) {
      if (!filters[key]) filters[key] = [];
      filters[key].push(value.slice(3));
    }
  }
  return filters;
}

// 把请求体规范化为行数组（POST 支持单对象或数组批量）
function parseBodyRows(rawBody) {
  if (!rawBody) return [];
  try {
    const parsed = JSON.parse(rawBody);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

// 解析本次写操作涉及的 guild_id 集合
// table: 目标表；filters: query 中的 eq 过滤；rows: 请求体行
async function resolveGuildIds(table, filters, rows) {
  const guildIds = new Set();
  const add = (v) => { if (v) guildIds.add(v); };

  // 1. 请求体 / query 直接携带 guild_id
  rows.forEach((r) => add(r && r.guild_id));
  (filters.guild_id || []).forEach(add);

  // 2. activity_attendance：从 activity_id 联查 activities
  if (table === "activity_attendance") {
    const activityIds = new Set();
    rows.forEach((r) => r && r.activity_id && activityIds.add(r.activity_id));
    (filters.activity_id || []).forEach((v) => activityIds.add(v));
    for (const actId of activityIds) {
      const { body } = await supabaseRestGet(`/rest/v1/activities?id=eq.${actId}&select=guild_id&limit=1`);
      if (Array.isArray(body) && body[0]) add(body[0].guild_id);
    }
  }

  // 3. wishlists 按 member_id 过滤：联查 raid_members
  if (table === "wishlists" && filters.member_id) {
    for (const memberId of filters.member_id) {
      const { body } = await supabaseRestGet(`/rest/v1/raid_members?id=eq.${memberId}&select=guild_id&limit=1`);
      if (Array.isArray(body) && body[0]) add(body[0].guild_id);
    }
  }

  // 4. 仅按 id 过滤（PATCH/DELETE）：查行取 guild_id
  if (filters.id && ["raid_members", "activities", "loot_records", "wishlists"].includes(table)) {
    for (const rowId of filters.id) {
      const { body } = await supabaseRestGet(`/rest/v1/${table}?id=eq.${rowId}&select=guild_id&limit=1`);
      if (Array.isArray(body) && body[0]) add(body[0].guild_id);
    }
  }

  return guildIds;
}

// 按 id 查询单行（用于归属判断）
async function fetchRowById(table, id, select) {
  const { body } = await supabaseRestGet(`/rest/v1/${table}?id=eq.${id}&select=${select}&limit=1`);
  return Array.isArray(body) && body[0] ? body[0] : null;
}

// 鉴权主函数：返回 { ok, status, message }
async function authorizeProxyRequest(user, table, method, queryString, rawBody) {
  const uid = user.id;
  const deny = (message) => ({ ok: false, status: 403, message });
  const filters = parseEqFilters(queryString);
  const rows = parseBodyRows(rawBody);

  // ---- GET：仅放行 guilds（邀请码/按 id 查找公会的唯一代理读场景），且必须带精确过滤，防止全表遍历 ----
  if (method === "GET") {
    if (table === "guilds" && (filters.invite_code || filters.id)) return { ok: true };
    if (table === "guilds") return deny("查询公会必须提供邀请码或公会 ID");
    return deny("该表不允许通过代理读取");
  }

  // ---- guilds ----
  if (table === "guilds") {
    if (method === "POST") return { ok: true }; // 任何登录用户可创建公会
    // PATCH/DELETE：仅 owner
    const ids = filters.id || [];
    for (const guildId of ids) {
      const role = await getGuildRoleCached(guildId, uid);
      if (role !== "owner") return deny("仅公会会长可以修改或删除公会");
    }
    return { ok: true };
  }

  // ---- guild_members ----
  if (table === "guild_members") {
    if (method === "POST") {
      for (const row of rows) {
        if (!row || row.user_id !== uid) return deny("只能将自己的账号加入公会");
        if (row.role === "owner") {
          // 防自我提权：owner 行仅允许建在本人拥有的公会
          const guild = await fetchRowById("guilds", row.guild_id, "owner_id");
          if (!guild || guild.owner_id !== uid) return deny("无权在该公会设置会长角色");
        } else if (row.role !== "viewer" && row.role !== "editor") {
          return deny("非法的成员角色");
        } else if (row.role === "editor") {
          return deny("加入公会时不能以编辑身份加入");
        }
      }
      return { ok: true };
    }
    // PATCH/DELETE：解析目标行
    const ids = filters.id || [];
    for (const rowId of ids) {
      const row = await fetchRowById("guild_members", rowId, "guild_id,user_id");
      if (!row) continue; // 目标不存在，no-op 放行
      if (method === "PATCH") {
        const role = await getGuildRoleCached(row.guild_id, uid);
        if (role !== "owner") return deny("仅公会会长可以变更成员角色");
      } else if (method === "DELETE") {
        if (row.user_id === uid) continue; // 退出自己的公会，允许
        const role = await getGuildRoleCached(row.guild_id, uid);
        if (role !== "owner") return deny("仅公会会长可以移除成员");
      }
    }
    return { ok: true };
  }

  // ---- notifications ----
  if (table === "notifications") {
    if (method === "POST") {
      // 入/退会通知等：调用者必须是目标公会成员
      for (const row of rows) {
        if (!row || !row.guild_id) return deny("通知缺少目标公会");
        const role = await getGuildRoleCached(row.guild_id, uid);
        if (!role) return deny("无权向该公会成员发送通知");
      }
      return { ok: true };
    }
    // PATCH/DELETE：仅限本人通知
    if (filters.user_id && filters.user_id.some((v) => v !== uid)) return deny("只能操作本人的通知");
    for (const rowId of filters.id || []) {
      const row = await fetchRowById("notifications", rowId, "user_id");
      if (row && row.user_id !== uid) return deny("只能操作本人的通知");
    }
    if (method === "PATCH") {
      for (const row of rows) {
        if (row && row.user_id && row.user_id !== uid) return deny("只能操作本人的通知");
      }
    }
    return { ok: true };
  }

  // ---- user_profiles / user_characters：仅限本人 ----
  if (table === "user_profiles" || table === "user_characters") {
    if (filters.user_id && filters.user_id.some((v) => v !== uid)) return deny("只能操作本人的数据");
    for (const row of rows) {
      if (row && row.user_id && row.user_id !== uid) return deny("只能操作本人的数据");
    }
    for (const rowId of filters.id || []) {
      const row = await fetchRowById(table, rowId, "user_id");
      if (row && row.user_id !== uid) return deny("只能操作本人的数据");
    }
    return { ok: true };
  }

  // ---- 公会业务表：raid_members / activities / activity_attendance / loot_records / wishlists ----
  if (["raid_members", "activities", "activity_attendance", "loot_records", "wishlists"].includes(table)) {
    const guildIds = await resolveGuildIds(table, filters, rows);
    if (guildIds.size === 0) {
      // 无法定位目标公会（如删除不存在的行）：放行，操作必然 no-op
      return { ok: true };
    }
    for (const guildId of guildIds) {
      const role = await getGuildRoleCached(guildId, uid);
      if (role !== "owner" && role !== "editor") {
        return deny("无权修改该公会数据（需要编辑或以上权限）");
      }
    }
    return { ok: true };
  }

  // ---- 未知表：一律拒绝 ----
  return deny("不允许代理访问该表");
}

// ==================== 任务书 #11 WCL 集成 ====================
// 两个端点（/api/wcl/report-summary、/api/wcl/attendance-snapshot）共用：
// JWT 验证 → 公会角色鉴权（owner/editor，viewer/非成员 403）→ 解析 reportCode → 调 WCL GraphQL。
// 安全纪律：鉴权全部通过后才读取 WCL 凭证 / 调用 WCL API；报告数据不缓存，仅缓存 token。

// 支持完整 URL 或纯 code 入参（与 scripts/verify-wcl-api.js 一致）
function parseReportCode(input) {
  const m = String(input || "").match(/reports\/([A-Za-z0-9]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9]{10,20}$/.test(String(input || ""))) return input;
  return null;
}

function wclError(status, message) {
  const e = new Error(message);
  e.wclStatus = status;
  return e;
}

// 带 10s 超时的 HTTPS 请求（WCL 专用）
function wclHttpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", reject);
    req.setTimeout(10000, () => {
      const err = new Error("请求超时（10s）");
      err.code = "WCL_TIMEOUT";
      req.destroy(err);
    });
    if (body) req.write(body);
    req.end();
  });
}

// WCL client_credentials token 缓存：未过期（提前 60s）则复用
const wclTokenCache = { accessToken: null, expiresAt: 0 };

async function getWclAccessToken() {
  if (wclTokenCache.accessToken && wclTokenCache.expiresAt > Date.now() + 60 * 1000) {
    return wclTokenCache.accessToken;
  }
  const clientId = process.env.WCL_CLIENT_ID || "";
  const clientSecret = process.env.WCL_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) throw wclError(500, "服务器未配置 WCL 凭证");
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  let res;
  try {
    res = await wclHttpsRequest(
      {
        hostname: "www.warcraftlogs.com",
        path: "/oauth/token",
        method: "POST",
        headers: {
          "Authorization": `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
      "grant_type=client_credentials"
    );
  } catch {
    throw wclError(502, "WCL 授权失败");
  }
  if (res.status !== 200) throw wclError(502, "WCL 授权失败");
  let json = null;
  try { json = JSON.parse(res.body); } catch { json = null; }
  if (!json || !json.access_token) throw wclError(502, "WCL 授权失败");
  wclTokenCache.accessToken = json.access_token;
  wclTokenCache.expiresAt = Date.now() + (json.expires_in || 3600) * 1000;
  return json.access_token;
}

// 与 scripts/verify-wcl-api.js 相同的报告查询
const WCL_REPORT_QUERY = `
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
  rateLimitData { limitPerHour pointsSpentThisHour pointsResetIn }
}`;

// 拉取报告并汇总为考勤比对结构（报告数据不缓存）
async function fetchWclReportSummary(code) {
  const token = await getWclAccessToken();
  let res;
  try {
    res = await wclHttpsRequest(
      {
        hostname: "www.warcraftlogs.com",
        path: "/api/v2/client",
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
      JSON.stringify({ query: WCL_REPORT_QUERY, variables: { code } })
    );
  } catch (e) {
    if (e && e.code === "WCL_TIMEOUT") throw wclError(504, "WCL 接口请求超时，请稍后再试");
    throw wclError(502, "WCL 接口请求失败，请稍后再试");
  }

  const bodyText = res.body || "";
  let json = null;
  try { json = JSON.parse(bodyText); } catch { json = null; }
  // rate limit 判定：HTTP 429，或 GraphQL errors 中含 rate limit 字样。
  // 注意不能全文扫 bodyText——正常 200 响应里带有 rateLimitData 字段名，会误伤。
  const hasGraphqlErrors = !!(json && json.errors && json.errors.length);
  const rateLimited =
    res.status === 429 ||
    (hasGraphqlErrors && json.errors.some((e) => /rate ?limit/i.test((e && e.message) || "")));
  if (rateLimited) {
    throw wclError(429, "WCL 接口速率超限，请稍后再试");
  }
  // 区分上游故障与"报告不存在"（验收用例 9：错误提示须准确）：
  // 非 JSON（如 WCL 的 HTML 错误页）或 HTTP 5xx 且无 GraphQL errors 结构 → 上游暂时不可用
  if (!json || (res.status >= 500 && !hasGraphqlErrors)) {
    throw wclError(502, "WCL 服务暂时不可用，请稍后再试");
  }
  // HTTP 200 且带 GraphQL errors，或其余非 200 响应 → 报告不存在/私有
  if (res.status !== 200 || hasGraphqlErrors) {
    throw wclError(502, "无法读取该 WCL 报告（不存在或为私有日志）");
  }
  const report = json.data && json.data.reportData && json.data.reportData.report;
  if (!report) {
    throw wclError(502, "无法读取该 WCL 报告（不存在或为私有日志）");
  }

  const actors = (report.masterData && report.masterData.actors) || [];
  const fights = report.fights || [];
  const bossFights = fights.filter((f) => f.encounterID > 0);
  const players = actors.map((a) => ({
    id: a.id,
    name: a.name,
    server: a.server || "",
    subType: a.subType || "",
    bossFights: bossFights.filter(
      (f) => Array.isArray(f.friendlyPlayers) && f.friendlyPlayers.includes(a.id)
    ).length,
  }));
  return {
    title: report.title || "",
    startTime: report.startTime,
    endTime: report.endTime,
    bossFightTotal: bossFights.length,
    players,
  };
}

// 两个 WCL 端点的共用处理器；withSnapshot=true 时附带活动已有快照供前端比对
async function handleWclRequest(req, res, corsHeaders, withSnapshot) {
  const t0 = Date.now();
  const endpoint = withSnapshot ? "attendance-snapshot" : "report-summary";
  const send = (status, obj) => {
    res.writeHead(status, { "Content-Type": "application/json", ...corsHeaders });
    res.end(JSON.stringify(obj));
  };
  try {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return send(401, { message: "未登录或登录已过期，请重新登录" });
    const user = await verifyTokenCached(token);
    if (!user) return send(401, { message: "登录状态无效，请重新登录" });

    const rawBody = await readBody(req);
    let payload = {};
    try { payload = JSON.parse(rawBody || "{}"); } catch { payload = {}; }

    const guildId = payload.guildId;
    if (!guildId) return send(400, { message: "缺少公会 ID（guildId）" });

    const role = await getGuildRoleCached(guildId, user.id);
    if (role !== "owner" && role !== "editor") {
      return send(403, { message: "无权修改该公会数据（需要编辑或以上权限）" });
    }

    const code = parseReportCode(payload.reportCode);
    if (!code) return send(400, { message: "无法识别的 WCL 报告链接或代码" });

    let snapshotExtra = {};
    if (withSnapshot) {
      const activityId = payload.activityId;
      if (!activityId) return send(400, { message: "缺少活动 ID（activityId）" });
      const { body } = await supabaseRestGet(
        `/rest/v1/activities?id=eq.${activityId}&select=guild_id,wcl_snapshot&limit=1`
      );
      const activity = Array.isArray(body) && body[0] ? body[0] : null;
      if (!activity) return send(404, { message: "活动不存在" });
      if (activity.guild_id !== guildId) {
        return send(403, { message: "无权访问该公会的活动" });
      }
      snapshotExtra = {
        existingSnapshot: activity.wcl_snapshot != null ? activity.wcl_snapshot : null,
        hasSnapshot: activity.wcl_snapshot != null,
      };
    }

    // 鉴权全部通过后才接触 WCL 凭证 / API
    const summary = await fetchWclReportSummary(code);
    console.log(`[perf] WCL ${endpoint} code=${code} total=${Date.now() - t0}ms`);
    send(200, { ...summary, ...snapshotExtra });
  } catch (e) {
    const status = e.wclStatus || 500;
    console.log(`[perf] WCL ${endpoint} failed total=${Date.now() - t0}ms err=${e.message}`);
    send(status, { message: e.message || "服务器内部错误" });
  }
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  let urlPath = req.url.split("?")[0];

  // CORS headers for all API routes
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Prefer, Accept",
  };

  // Handle CORS preflight
  if (req.method === "OPTIONS" && urlPath.startsWith("/api/")) {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  // API: Supabase config
  if (urlPath === "/api/supabase-config" && req.method === "GET") {
    const config = getSupabaseConfig();
    res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders });
    res.end(JSON.stringify(config));
    return;
  }

  // API: WCL - /api/wcl/report-summary、/api/wcl/attendance-snapshot（任务书 #11）
  // JWT + 公会角色鉴权（owner/editor 可用，viewer/非成员 403），鉴权通过后才调 WCL API
  if (urlPath === "/api/wcl/report-summary" && req.method === "POST") {
    handleWclRequest(req, res, corsHeaders, false);
    return;
  }
  if (urlPath === "/api/wcl/attendance-snapshot" && req.method === "POST") {
    handleWclRequest(req, res, corsHeaders, true);
    return;
  }

  // API: DB Proxy - /api/db/rest/v1/:table
  // 代理读写操作到 Supabase（service_role），转发前必须过 SEC-001 公会级鉴权
  if (urlPath.startsWith("/api/db/rest/v1/") && (req.method === "GET" || req.method === "POST" || req.method === "PATCH" || req.method === "DELETE")) {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.replace("Bearer ", "");

    if (!token) {
      res.writeHead(401, { "Content-Type": "application/json", ...corsHeaders });
      res.end(JSON.stringify({ message: "未登录或登录已过期，请重新登录" }));
      return;
    }

    (async () => {
      const perfT0 = Date.now();
      const user = await verifyTokenCached(token);
      const perfJwt = Date.now();
      if (!user) {
        res.writeHead(401, { "Content-Type": "application/json", ...corsHeaders });
        res.end(JSON.stringify({ message: "登录状态无效，请重新登录" }));
        return;
      }

      const table = urlPath.replace("/api/db/rest/v1/", "").split("/")[0];
      const queryString = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
      const body = await readBody(req);

      // SEC-001：公会级鉴权，失败返回 401/403 + 中文提示
      try {
        const authz = await authorizeProxyRequest(user, table, req.method, queryString, body);
        if (!authz.ok) {
          res.writeHead(authz.status, { "Content-Type": "application/json", ...corsHeaders });
          res.end(JSON.stringify({ message: authz.message }));
          return;
        }
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json", ...corsHeaders });
        res.end(JSON.stringify({ message: "权限校验失败，请稍后重试" }));
        return;
      }
      const perfAuthz = Date.now();

      const supabasePath = `/rest/v1/${table}${queryString}`;
      proxyToSupabase(req.method, supabasePath, req.headers, body, (result) => {
        const perfEnd = Date.now();
        // 任务书 #10：写路径分阶段计时日志（JWT 验证 / 鉴权联查 / 转发写入）
        console.log(`[perf] ${req.method} ${table} jwt=${perfJwt - perfT0}ms authz=${perfAuthz - perfJwt}ms write=${perfEnd - perfAuthz}ms total=${perfEnd - perfT0}ms`);
        // 任务书 #10 缓存失效：公会/成员写成功 → 权限可能已变更，清空角色缓存（安全优先，缓存重建代价低）
        if (result.statusCode < 300 && (table === "guild_members" || table === "guilds")) {
          roleCache.clear();
        }
        const responseHeaders = { ...corsHeaders, "Content-Type": "application/json" };

        // Forward content-range header if present
        if (result.headers["content-range"]) {
          responseHeaders["Content-Range"] = result.headers["content-range"];
        }

        res.writeHead(result.statusCode, responseHeaders);
        res.end(result.body);
      });
    })();
    return;
  }

  // API: RPC Proxy - /api/db/rpc/v1/:function_name
  // SEC-001：service_role 执行数据库函数风险高，仅放行白名单函数
  const RPC_ALLOWLIST = ["get_unread_notification_count"];
  if (urlPath.startsWith("/api/db/rpc/v1/") && req.method === "POST") {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.replace("Bearer ", "");

    if (!token) {
      res.writeHead(401, { "Content-Type": "application/json", ...corsHeaders });
      res.end(JSON.stringify({ message: "未登录或登录已过期，请重新登录" }));
      return;
    }

    const fnName = urlPath.replace("/api/db/rpc/v1/", "").split("/")[0];
    if (!RPC_ALLOWLIST.includes(fnName)) {
      res.writeHead(403, { "Content-Type": "application/json", ...corsHeaders });
      res.end(JSON.stringify({ message: "不允许调用该函数" }));
      return;
    }

    verifyToken(token, (user) => {
      if (!user) {
        res.writeHead(401, { "Content-Type": "application/json", ...corsHeaders });
        res.end(JSON.stringify({ message: "登录状态无效，请重新登录" }));
        return;
      }

      const supabasePath = `/rest/v1/rpc/${fnName}`;

      readBody(req).then((body) => {
        proxyToSupabase("POST", supabasePath, req.headers, body, (result) => {
          const responseHeaders = { ...corsHeaders, "Content-Type": "application/json" };
          res.writeHead(result.statusCode, responseHeaders);
          res.end(result.body);
        });
      });
    });
    return;
  }

  // API: PRD Document Download - /api/prd
  if (urlPath === "/api/prd") {
    const prdPath = path.join(ROOT, "PRD.docx");
    fs.stat(prdPath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { "Content-Type": "application/json", ...corsHeaders });
        res.end(JSON.stringify({ error: "PRD document not found" }));
        return;
      }
      res.writeHead(200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": "attachment; filename=PRD.docx",
        "Content-Length": stats.size,
        ...corsHeaders
      });
      fs.createReadStream(prdPath).pipe(res);
    });
    return;
  }

  // API: Loot Design Document Download - /api/loot-design
  if (urlPath === "/api/loot-design") {
    const docPath = path.join(ROOT, "public", "V2.1-装备履历模型设计方案.docx");
    fs.stat(docPath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { "Content-Type": "application/json", ...corsHeaders });
        res.end(JSON.stringify({ error: "Loot design document not found" }));
        return;
      }
      res.writeHead(200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": "attachment; filename=\"V2.1-Loot-Design.docx\"",
        "X-Original-Filename": encodeURIComponent("V2.1-装备履历模型设计方案.docx"),
        "Content-Length": stats.size,
        ...corsHeaders
      });
      fs.createReadStream(docPath).pipe(res);
    });
    return;
  }

  if (urlPath === "/") urlPath = "/index.html";

  const safePath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(ROOT, safePath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/html" });
      res.end("Not Found");
      return;
    }
    serveFile(res, filePath);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  process.stderr.write(`Server listening on port ${PORT}\n`);
});
