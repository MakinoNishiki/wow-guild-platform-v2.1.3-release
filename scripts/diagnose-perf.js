// 任务书 #10 性能诊断：5 个写场景的服务端分阶段耗时 + 前端 reload 模拟计时
// 自建测试用户/公会，结束自动清理。只读 .env，不打印密钥。用法: node scripts/diagnose-perf.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TEST_PORT = 15610;
const PWD = 'Perf-Test-2026!';
const ROUNDS = 3;

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const URL = env.SUPABASE_URL.replace(/\/+$/, '');
const ANON = env.SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const SVC = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

async function svcRest(method, restPath, body) {
  const res = await fetch(`${URL}${restPath}`, { method, headers: SVC, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

async function signUpOrIn(email) {
  const su = await fetch(`${URL}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PWD, data: { display_name: 'perf' } }),
  });
  const sb = await su.json();
  if (sb.access_token) return { token: sb.access_token, uid: sb.user.id };
  const li = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PWD }),
  });
  const lb = await li.json();
  if (!lb.access_token) throw new Error(`无法获取会话: ${JSON.stringify(lb)}`);
  return { token: lb.access_token, uid: lb.user.id };
}

// 经代理写，返回 { status, clientMs }
async function proxyTimed(token, method, table, body, query) {
  const t0 = Date.now();
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/db/rest/v1/${table}${query || ''}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  await res.text();
  return { status: res.status, clientMs: Date.now() - t0 };
}

// 模拟前端 reloadData：用户 JWT 直连 Supabase REST（RLS 读），返回 ms
async function reloadTimed(token, restPath) {
  const t0 = Date.now();
  const res = await fetch(`${URL}${restPath}`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } });
  await res.text();
  return Date.now() - t0;
}

const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

(async () => {
  console.log('===== 准备测试数据 =====');
  const owner = await signUpOrIn('perf-owner@example.com');
  const g = await svcRest('POST', '/rest/v1/guilds', { name: 'PERF测试公会', owner_id: owner.uid, invite_code: 'PERFTEST1', server_name: '测试', server_region: '一区' });
  const guild = g.body[0].id;
  await svcRest('POST', '/rest/v1/guild_members', [{ guild_id: guild, user_id: owner.uid, role: 'owner', display_name: 'perf-owner' }]);

  // 捕获 server.js [perf] 日志
  const perfLines = [];
  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DEPLOY_RUN_PORT: String(TEST_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  srv.stdout.on('data', d => {
    for (const line of String(d).split('\n')) {
      const m = line.match(/\[perf\] (\w+) (\w+) jwt=(\d+)ms authz=(\d+)ms write=(\d+)ms total=(\d+)ms/);
      if (m) perfLines.push({ method: m[1], table: m[2], jwt: +m[3], authz: +m[4], write: +m[5], total: +m[6] });
    }
  });
  await new Promise(r => setTimeout(r, 1200));

  const memberRow = suffix => ({
    guild_id: guild, name: 'PERF成员' + suffix, class: '战士', spec: '武器', role: '输出',
    off_spec: '', off_specs: [], status: '正式', join_date: '2026-07-26', notes: '', user_id: null,
  });
  const activityRow = suffix => ({
    guild_id: guild, name: 'PERF活动' + suffix, activity_date: '2026-07-26', raid: '虚影尖塔', boss: '', notes: '', created_by: owner.uid,
  });
  const lootRow = suffix => ({
    guild_id: guild, item_name: 'PERF装备' + suffix, raid_name: '虚影尖塔', boss_name: '', item_category: '武器', item_slot: '双手',
    item_stats: {}, obtained_date: '2026-07-26', note: '', distribution_method: 'custom', is_wishlist: false,
  });

  const report = {}; // name → {jwt:[],authz:[],write:[],serverTotal:[],client:[],reload:[]}

  async function runScenario(name, doOnce, reloadPaths) {
    report[name] = { jwt: [], authz: [], write: [], serverTotal: [], client: [], reload: [] };
    for (let i = 0; i < ROUNDS; i++) {
      const mark = perfLines.length;
      const clientMs = await doOnce(i);
      const mine = perfLines.slice(mark);
      report[name].jwt.push(avg(mine.map(p => p.jwt)));
      report[name].authz.push(avg(mine.map(p => p.authz)));
      report[name].write.push(avg(mine.map(p => p.write)));
      report[name].serverTotal.push(avg(mine.map(p => p.total)));
      report[name].client.push(clientMs);
      // 模拟前端 reload（分表）
      let reloadMs = 0;
      for (const rp of reloadPaths) reloadMs += await reloadTimed(owner.token, rp);
      report[name].reload.push(reloadMs);
    }
  }

  try {
    console.log('===== 场景计时（每场景 ' + ROUNDS + ' 轮） =====');
    await runScenario('保存成员', async i => (await proxyTimed(owner.token, 'POST', 'raid_members', memberRow('_' + i))).clientMs,
      [`/rest/v1/raid_members?guild_id=eq.${guild}&select=*`]);
    await runScenario('保存活动', async i => (await proxyTimed(owner.token, 'POST', 'activities', activityRow('_' + i))).clientMs,
      [`/rest/v1/activities?guild_id=eq.${guild}&select=*`, `/rest/v1/activity_attendance?select=*&limit=1`]);
    await runScenario('保存装备', async i => (await proxyTimed(owner.token, 'POST', 'loot_records', lootRow('_' + i))).clientMs,
      [`/rest/v1/loot_records?guild_id=eq.${guild}&select=*`]);
    await runScenario('删除活动', async i => {
      const created = await svcRest('POST', '/rest/v1/activities', activityRow('_del' + i));
      return (await proxyTimed(owner.token, 'DELETE', 'activities', null, `?id=eq.${created.body[0].id}`)).clientMs;
    }, [`/rest/v1/activities?guild_id=eq.${guild}&select=*`, `/rest/v1/activity_attendance?select=*&limit=1`]);
    await runScenario('批量导入(10成员)', async i => {
      const t0 = Date.now();
      for (let j = 0; j < 10; j++) await proxyTimed(owner.token, 'POST', 'raid_members', memberRow(`_b${i}_${j}`));
      return Date.now() - t0;
    }, [`/rest/v1/raid_members?guild_id=eq.${guild}&select=*`]);
  } finally {
    srv.kill();
    console.log('\n===== 清理测试数据 =====');
    await svcRest('DELETE', `/rest/v1/guilds?id=eq.${guild}`);
    await svcRest('DELETE', `/auth/v1/admin/users/${owner.uid}`);
    console.log('测试用户与公会已删除');
  }

  console.log('\n===== 耗时分解表（平均值，ms） =====');
  console.log('场景 | JWT验证 | 鉴权联查 | 转发写入 | 服务端合计 | 客户端写入 | 前端reload | 全链路合计');
  for (const [name, r] of Object.entries(report)) {
    const j = avg(r.jwt), a = avg(r.authz), w = avg(r.write), s = avg(r.serverTotal), c = avg(r.client), rl = avg(r.reload);
    console.log(`${name} | ${j} | ${a} | ${w} | ${s} | ${c} | ${rl} | ${c + rl}`);
  }
})().catch(e => { console.error('诊断异常:', e.message); process.exit(1); });
