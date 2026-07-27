"use strict";
// 任务书 #11 阶段 0：WCL API 验证脚本（零依赖）
// 用法：node scripts/verify-wcl-api.js [reportCodeOrUrl]
// 依次验证：1) client_credentials 换 token  2) GraphQL 拉公开报告  3) token 缓存复用
// 凭证来源：环境变量 WCL_CLIENT_ID / WCL_CLIENT_SECRET（或项目根目录 .env）

const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.join(__dirname, "..");

// 与 server.js 相同的手写 .env 解析（零依赖），已存在的环境变量优先
function loadDotEnv() {
  try {
    const content = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
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
    // .env 不存在时静默跳过
  }
}
loadDotEnv();

const CLIENT_ID = process.env.WCL_CLIENT_ID || "";
const CLIENT_SECRET = process.env.WCL_CLIENT_SECRET || "";

// 支持完整 URL 或纯 code 入参
function parseReportCode(input) {
  const m = String(input || "").match(/reports\/([A-Za-z0-9]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9]{10,20}$/.test(String(input || ""))) return input;
  return null;
}

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", reject);
    req.setTimeout(10000, () => {
      req.destroy(new Error("请求超时（10s）"));
    });
    if (body) req.write(body);
    req.end();
  });
}

// ---- token 缓存：未过期（提前 60s）则复用，供 server.js 照抄 ----
let cachedToken = null; // { accessToken, expiresAt }

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60 * 1000) {
    return { token: cachedToken.accessToken, fromCache: true };
  }
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await httpsRequest(
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
  if (res.status !== 200) {
    throw new Error(`换取 token 失败：HTTP ${res.status} ${res.body.slice(0, 200)}`);
  }
  const json = JSON.parse(res.body);
  if (!json.access_token) throw new Error("响应中无 access_token");
  cachedToken = {
    accessToken: json.access_token,
    expiresAt: Date.now() + (json.expires_in || 3600) * 1000,
  };
  return { token: json.access_token, fromCache: false };
}

const REPORT_QUERY = `
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

async function main() {
  const arg = process.argv[2] || "7wYFJH9RyxzBnVXv";
  const code = parseReportCode(arg);
  if (!code) {
    console.error(`无法从入参解析 report code：${arg}`);
    process.exit(1);
  }
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("缺少 WCL_CLIENT_ID / WCL_CLIENT_SECRET（环境变量或 .env）");
    process.exit(1);
  }

  console.log("========== WCL API 验证（任务书 #11 阶段 0） ==========");
  console.log(`报告 code：${code}\n`);

  // 1. 换 token
  const t1 = await getAccessToken();
  const masked = `${t1.token.slice(0, 6)}...${t1.token.slice(-6)}`;
  console.log(`[1] 换取 token：✅ 成功（${masked}，缓存命中=${t1.fromCache}）`);

  // 2. 拉报告
  const res = await httpsRequest(
    {
      hostname: "www.warcraftlogs.com",
      path: "/api/v2/client",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${t1.token}`,
        "Content-Type": "application/json",
      },
    },
    JSON.stringify({ query: REPORT_QUERY, variables: { code } })
  );
  if (res.status !== 200) {
    throw new Error(`GraphQL 请求失败：HTTP ${res.status} ${res.body.slice(0, 300)}`);
  }
  const json = JSON.parse(res.body);
  if (json.errors && json.errors.length) {
    throw new Error(`GraphQL 返回错误：${JSON.stringify(json.errors).slice(0, 300)}`);
  }
  const report = json.data && json.data.reportData && json.data.reportData.report;
  if (!report) {
    throw new Error("报告不存在或为私有（report 为 null）");
  }

  const actors = (report.masterData && report.masterData.actors) || [];
  const fights = report.fights || [];
  const bossFights = fights.filter((f) => f.encounterID > 0);

  // 3. 打印结果
  console.log(`[2] 拉取报告：✅ 成功`);
  console.log(`    报告标题：${report.title}`);
  console.log(`    时间：${new Date(report.startTime).toLocaleString("zh-CN")} ~ ${new Date(report.endTime).toLocaleString("zh-CN")}`);
  console.log(`    玩家总数：${actors.length}`);
  console.log(`    Boss 战（encounterID>0）场次：${bossFights.length} / 全部 fights ${fights.length}`);
  console.log(`    样例角色（前 3 个）：`);
  for (const a of actors.slice(0, 3)) {
    console.log(`      - ${a.name} / server=${a.server || "(无)"} / subType=${a.subType}`);
  }
  const rl = json.data && json.data.rateLimitData;
  if (rl) {
    console.log(`    速率余量：${rl.limitPerHour - rl.pointsSpentThisHour}/${rl.limitPerHour} 点（${rl.pointsResetIn}s 后重置）`);
  }

  // 4. token 缓存复用验证
  const t2 = await getAccessToken();
  console.log(`[3] token 缓存复用：${t2.fromCache && t2.token === t1.token ? "✅ 命中缓存" : "❌ 未命中"}`);

  console.log("\n========== 验证通过：可进入 server.js / 前端开发 ==========");
}

main().catch((e) => {
  console.error(`\n验证失败：${e.message}`);
  process.exit(1);
});
