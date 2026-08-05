// 任务书 #24 WP2 验证：server.js 上游调用「连接阶段硬截止」注入实测
// 注入方法：本地黑洞服务器（accept TCP 后永不响应）——TLS 握手永远完不成，连接阶段挂死，
//   没有硬截止时请求将无限挂起；有硬截止则到点 destroy 并返回统一中文 504 / verifyToken 走 401。
// 断言：
//   A. verifyToken 硬截止 6s：整服注入（SPAWN server.js 指黑洞 SUPABASE_URL）→ /api/db 请求
//      约 6s 返回 401（而非挂死）；
//   B. proxyToSupabase 硬截止 8s：进程内注入直连 → 约 8s 返回 504「上游连接超时，请重试」；
//   C. 写操作无自动重试（POST 同样一次回调 504）；D. 既有 req.setTimeout 路径不受影响（快速拒绝地址立即报错）。
// 不涉及数据库造数，零清理负担。用法: node scripts/verify-task24-wp2.js
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const STALL_PORT = 15662; // 黑洞：accept 后永不响应
const PORT = 15663;

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail !== undefined ? `（${detail}）` : ''}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // ---- 黑洞服务器：TCP accept 后保持沉默（TLS 握手永不完成 = 连接阶段挂死） ----
  const held = new Set();
  const blackhole = net.createServer((sock) => { held.add(sock); sock.on('error', () => {}); sock.on('close', () => held.delete(sock)); });
  await new Promise(r => blackhole.listen(STALL_PORT, '127.0.0.1', r));

  // ---- A. verifyToken 硬截止 6s（整服注入） ----
  const serverProc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, DEPLOY_RUN_PORT: String(PORT), SUPABASE_URL: `https://127.0.0.1:${STALL_PORT}` },
    stdio: 'ignore',
  });
  try {
    for (let i = 0; i < 40; i++) {
      try { const r = await fetch(`http://localhost:${PORT}/api/supabase-config`); if (r.ok) break; } catch {}
      if (i === 39) throw new Error('server.js 启动超时');
      await sleep(500);
    }
    const t0 = Date.now();
    const resp = await fetch(`http://localhost:${PORT}/api/db/rest/v1/raid_members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer invalid-token-for-timeout-test' },
      body: '{}',
    });
    const elapsed = Date.now() - t0;
    // verifyToken 连接阶段挂死 → 6s 硬截止 → finish(null) → 401（无硬截止时此处会无限挂起）
    check('A. verifyToken 连接阶段硬截止 6s：/api/db 请求按时返回 401 不挂死',
      resp.status === 401 && elapsed >= 5000 && elapsed <= 9000,
      `HTTP ${resp.status} 耗时 ${elapsed}ms（期望 5000~9000ms）`);
  } finally {
    serverProc.kill();
  }

  // ---- B/C/D. proxyToSupabase 进程内注入直连 ----
  process.env.SUPABASE_URL = `https://127.0.0.1:${STALL_PORT}`;
  const { proxyToSupabase } = require(path.join(ROOT, 'server.js'));

  // B. GET：8s 硬截止 → 504「上游连接超时，请重试」
  {
    const t0 = Date.now();
    const r = await new Promise(resolve => proxyToSupabase('GET', '/rest/v1/guilds?select=id&limit=1', {}, null, resolve));
    const elapsed = Date.now() - t0;
    let msg = '';
    try { msg = JSON.parse(r.body).message; } catch {}
    check('B. 代理主链路连接阶段硬截止 8s：504 + 统一中文「上游连接超时，请重试」',
      r.statusCode === 504 && msg === '上游连接超时，请重试' && elapsed >= 7000 && elapsed <= 11000,
      `HTTP ${r.statusCode} 耗时 ${elapsed}ms message=${msg}`);
  }

  // C. POST 写操作：同样一次回调 504（无自动重试铁律：回调只来一次，且代理层对写不重发）
  {
    const t0 = Date.now();
    let calls = 0;
    const r = await new Promise(resolve => proxyToSupabase('POST', '/rest/v1/raid_members', {}, '{}', (x) => { calls++; resolve(x); }));
    const elapsed = Date.now() - t0;
    check('C. 写操作禁自动重试：POST 一次回调 504 不挂死',
      calls === 1 && r.statusCode === 504 && elapsed >= 7000 && elapsed <= 11000,
      `回调 ${calls} 次 HTTP ${r.statusCode} 耗时 ${elapsed}ms`);
  }

  // D. 快速失败地址（端口拒绝）：既有可能性不受影响，立即报错而非等满 8s
  {
    process.env.SUPABASE_URL = 'https://127.0.0.1:1'; // 端口 1 必拒绝
    const t0 = Date.now();
    const r = await new Promise(resolve => proxyToSupabase('GET', '/rest/v1/guilds?select=id&limit=1', {}, null, resolve));
    const elapsed = Date.now() - t0;
    check('D. 连接被拒（ECONNREFUSED）快速返回不受影响', elapsed < 3000 && (r.statusCode === 500 || r.statusCode === 504),
      `HTTP ${r.statusCode} 耗时 ${elapsed}ms`);
  }

  blackhole.close();
  for (const s of held) s.destroy();

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#24 WP2 注入实测: ${passed}/${results.length} 通过 =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
