"use strict";
// WCL V2 GraphQL 公会查询能力验证（国内直连），零依赖原型脚本
// 用法：node scripts/verify-wcl-guild.js
// 步骤：1) client_credentials 换 token  2) guildData 定位公会（挽歌/金色平原/CN）
//       3) guildReports 拉最近 5 份公开报告  4) 取首份报告解析 fights+players
// 每步记录耗时（ms）；GraphQL 主域名 api.warcraftlogs.com 失败/超时则对比 www.warcraftlogs.cn
// 凭证来源：环境变量 WCL_CLIENT_ID / WCL_CLIENT_SECRET（或项目根目录 .env），输出打码

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

const GUILD_NAME = "挽歌";
const SERVER_REGION = "CN";
const SLUG_CANDIDATES = ["金色平原", "gold-shire", "goldshire"];

function httpsRequest(options, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs || 15000, () => {
      req.destroy(new Error("TIMEOUT"));
    });
    if (body) req.write(body);
    req.end();
  });
}

async function getAccessToken() {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const started = Date.now();
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
  const ms = Date.now() - started;
  if (res.status !== 200) {
    const err = new Error(`换取 token 失败：HTTP ${res.status} ${res.body.slice(0, 200)}`);
    err.ms = ms;
    throw err;
  }
  const json = JSON.parse(res.body);
  if (!json.access_token) throw new Error("响应中无 access_token");
  return { token: json.access_token, ms };
}

async function graphql(host, token, query, variables) {
  const started = Date.now();
  const res = await httpsRequest(
    {
      hostname: host,
      path: "/api/v2/client",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
    JSON.stringify({ query, variables })
  );
  const ms = Date.now() - started;
  const json = JSON.parse(res.body);
  if (json.errors && json.errors.length) {
    const err = new Error(`GraphQL 错误：${JSON.stringify(json.errors).slice(0, 300)}`);
    err.ms = ms;
    err.graphql = true;
    throw err;
  }
  return { data: json.data, ms, status: res.statusCode };
}

// GraphQL 域名按序尝试：api.warcraftlogs.com（官方 V2 域名）→ www.warcraftlogs.com
// （server.js 现网在用的同路径域名）→ www.warcraftlogs.cn（国内镜像，若存在）
// 网络层失败才换下一个域名；GraphQL 语义错误说明直连是通的，直接抛出
const GRAPHQL_HOSTS = ["api.warcraftlogs.com", "www.warcraftlogs.com", "www.warcraftlogs.cn"];

async function graphqlWithFallback(token, query, variables, label) {
  const attempts = [];
  let lastErr = null;
  for (const host of GRAPHQL_HOSTS) {
    try {
      const r = await graphql(host, token, query, variables);
      attempts.push({ host, ok: true, ms: r.ms });
      return { data: r.data, attempts };
    } catch (e) {
      attempts.push({ host, ok: false, ms: e.ms || null, error: e.message.slice(0, 120) });
      lastErr = e;
      if (e.graphql) {
        e.attempts = attempts;
        throw e;
      }
    }
  }
  lastErr.attempts = attempts;
  lastErr.message = `[${label}] 全部域名失败：${lastErr.message}`;
  throw lastErr;
}

function printAttempts(attempts) {
  for (const a of attempts) {
    console.log(`    ${a.host}：${a.ok ? "✅" : "❌"} ${a.ms == null ? "-" : a.ms + "ms"}${a.error ? "（" + a.error + "）" : ""}`);
  }
}

const GUILD_QUERY = `
query ($name: String!, $slug: String!, $region: String!) {
  guildData {
    guild(name: $name, serverSlug: $slug, serverRegion: $region) {
      id
      name
      faction { name }
      server { name slug }
    }
  }
}`;

const SERVERS_QUERY = `
query {
  worldData {
    regions {
      compactName
      servers(limit: 200) {
        data { name slug }
      }
    }
  }
}`;

const GUILD_REPORTS_QUERY = `
query ($gid: Int!, $limit: Int!) {
  reportData {
    reports(guildID: $gid, limit: $limit) {
      total
      data {
        code
        title
        startTime
        endTime
        zone { name }
      }
    }
  }
}`;

// 与 scripts/verify-wcl-api.js / server.js 完全一致的报告详情查询
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
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("缺少 WCL_CLIENT_ID / WCL_CLIENT_SECRET（环境变量或 .env）");
    process.exit(1);
  }

  console.log("========== WCL 公会查询验证（国内直连） ==========");
  console.log(`凭证：CLIENT_ID=${CLIENT_ID.slice(0, 4)}*** / CLIENT_SECRET=${CLIENT_SECRET.slice(0, 4)}***`);
  console.log(`目标公会：${GUILD_NAME} / ${SERVER_REGION}\n`);

  // [1] 换 token
  const t = await getAccessToken();
  console.log(`[1] 换取 token（www.warcraftlogs.com/oauth/token）：✅ ${t.ms}ms`);

  // [2] 定位公会：依次尝试 slug 候选
  let guild = null;
  let guildAttempts = [];
  let slugUsed = null;
  for (const slug of SLUG_CANDIDATES) {
    try {
      const r = await graphqlWithFallback(t.token, GUILD_QUERY, { name: GUILD_NAME, slug, region: SERVER_REGION }, "guildData");
      guildAttempts.push({ slug, attempts: r.attempts });
      const g = r.data && r.data.guildData && r.data.guildData.guild;
      if (g) {
        guild = g;
        slugUsed = slug;
        break;
      }
      guildAttempts[guildAttempts.length - 1].notFound = true;
    } catch (e) {
      guildAttempts.push({ slug, attempts: e.attempts || [], error: e.message.slice(0, 150) });
      if (e.attempts && e.attempts.some((a) => !a.ok)) break; // 网络层失败不再换 slug 重试
    }
  }

  if (!guild) {
    console.log("[2] guildData 直查未命中，回退 worldData 拉 CN 区服务器列表：");
    for (const ga of guildAttempts) {
      console.log(`    slug 候选 "${ga.slug}"${ga.notFound ? "（连通但公会未命中）" : ""}${ga.error ? "（" + ga.error + "）" : ""}`);
      printAttempts(ga.attempts);
    }
    const r = await graphqlWithFallback(t.token, SERVERS_QUERY, {}, "worldData");
    printAttempts(r.attempts);
    const regions = (r.data && r.data.worldData && r.data.worldData.regions) || [];
    const cn = regions.find((x) => x.compactName === "CN");
    const servers = (cn && cn.servers && cn.servers.data) || [];
    console.log(`    CN 区服务器共 ${servers.length} 个，含「金色平原」相关：`);
    for (const s of servers.filter((x) => /金|gold/i.test(x.name + x.slug))) {
      console.log(`      - name=${s.name} slug=${s.slug}`);
    }
    throw new Error(`公会「${GUILD_NAME}」在所有 slug 候选下均未命中，请按上方真实 slug 调整`);
  }

  const slugAttempts = guildAttempts[guildAttempts.length - 1].attempts;
  const slugMs = slugAttempts.length ? slugAttempts[slugAttempts.length - 1].ms : null;
  console.log(`[2] guildData 定位公会：✅ ${slugMs}ms（serverSlug="${slugUsed}"）`);
  if (guildAttempts.length > 1 || slugAttempts.length > 1) {
    for (const ga of guildAttempts) {
      console.log(`    slug 候选 "${ga.slug}"${ga.notFound ? "（连通但公会未命中）" : ""}`);
      printAttempts(ga.attempts);
    }
  }
  console.log(`    公会：id=${guild.id} name=${guild.name} faction=${guild.faction ? guild.faction.name : "?"} server=${guild.server ? guild.server.name + "/" + guild.server.slug : "?"}`);

  // [3] 拉最近公开报告
  const r3 = await graphqlWithFallback(t.token, GUILD_REPORTS_QUERY, { gid: guild.id, limit: 5 }, "guildReports");
  console.log(`[3] guildReports（limit=5）：✅ ${r3.attempts[r3.attempts.length - 1].ms}ms`);
  printAttempts(r3.attempts);
  const repData = r3.data && r3.data.reportData && r3.data.reportData.reports;
  const reports = (repData && repData.data) || [];
  console.log(`    公开报告总数 total=${repData ? repData.total : "?"}，本次返回 ${reports.length} 份`);
  for (const rp of reports) {
    console.log(`      - ${rp.code}｜${rp.title}｜${rp.zone ? rp.zone.name : "?"}｜${new Date(rp.startTime).toLocaleString("zh-CN")}`);
  }
  if (!reports.length) throw new Error("公会无公开报告");

  // [4] 首份报告详情
  const first = reports[0];
  const r4 = await graphqlWithFallback(t.token, REPORT_QUERY, { code: first.code }, "report detail");
  console.log(`[4] 首份报告详情（${first.code}）：✅ ${r4.attempts[r4.attempts.length - 1].ms}ms`);
  printAttempts(r4.attempts);
  const report = r4.data && r4.data.reportData && r4.data.reportData.report;
  if (!report) throw new Error("首份报告不存在或为私有");
  const actors = (report.masterData && report.masterData.actors) || [];
  const fights = report.fights || [];
  const bossFights = fights.filter((f) => f.encounterID > 0);
  console.log(`    标题：${report.title}`);
  console.log(`    时间：${new Date(report.startTime).toLocaleString("zh-CN")} ~ ${new Date(report.endTime).toLocaleString("zh-CN")}`);
  console.log(`    玩家总数：${actors.length}`);
  console.log(`    fights 总数：${fights.length}，其中 Boss 战（encounterID>0）：${bossFights.length}`);
  console.log(`    样例玩家（前 3）：`);
  for (const a of actors.slice(0, 3)) {
    console.log(`      - ${a.name} / server=${a.server || "(无)"} / subType=${a.subType}`);
  }
  console.log(`    Boss 战场次（前 5）：`);
  for (const f of bossFights.slice(0, 5)) {
    console.log(`      - #${f.id} ${f.name}（${Math.round((f.endTime - f.startTime) / 1000)}s）`);
  }
  const rl = r4.data && r4.data.rateLimitData;
  if (rl) {
    console.log(`[5] 速率余量：${rl.limitPerHour - rl.pointsSpentThisHour}/${rl.limitPerHour} 点（${rl.pointsResetIn}s 后重置）`);
  }

  console.log("\n========== 验证完成 ==========");
}

main().catch((e) => {
  console.error(`\n验证失败：${e.message}`);
  process.exit(1);
});
