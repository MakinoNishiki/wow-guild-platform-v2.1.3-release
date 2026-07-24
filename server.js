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

  // API: DB Proxy - /api/db/rest/v1/:table
  // Proxies read/write operations (GET/POST/PATCH/DELETE) to Supabase using service_role key
  if (urlPath.startsWith("/api/db/rest/v1/") && (req.method === "GET" || req.method === "POST" || req.method === "PATCH" || req.method === "DELETE")) {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.replace("Bearer ", "");

    if (!token) {
      res.writeHead(401, { "Content-Type": "application/json", ...corsHeaders });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    // Verify the user's token
    verifyToken(token, (user) => {
      if (!user) {
        res.writeHead(401, { "Content-Type": "application/json", ...corsHeaders });
        res.end(JSON.stringify({ error: "Invalid token" }));
        return;
      }

      // Extract the Supabase REST path
      const restPath = urlPath.replace("/api/db", "");
      const queryString = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
      const supabasePath = `/rest/v1${restPath.replace("/rest/v1", "")}${queryString}`;

      readBody(req).then((body) => {
        proxyToSupabase(req.method, supabasePath, req.headers, body, (result) => {
          const responseHeaders = { ...corsHeaders, "Content-Type": "application/json" };
          
          // Forward content-range header if present
          if (result.headers["content-range"]) {
            responseHeaders["Content-Range"] = result.headers["content-range"];
          }

          res.writeHead(result.statusCode, responseHeaders);
          res.end(result.body);
        });
      });
    });
    return;
  }

  // API: RPC Proxy - /api/db/rpc/v1/:function_name
  if (urlPath.startsWith("/api/db/rpc/v1/") && req.method === "POST") {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.replace("Bearer ", "");

    if (!token) {
      res.writeHead(401, { "Content-Type": "application/json", ...corsHeaders });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    verifyToken(token, (user) => {
      if (!user) {
        res.writeHead(401, { "Content-Type": "application/json", ...corsHeaders });
        res.end(JSON.stringify({ error: "Invalid token" }));
        return;
      }

      const restPath = urlPath.replace("/api/db", "");
      const supabasePath = restPath;

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
