// BUG-019 复现脚本：editor 创建活动全链路（与前端 syncActivity 'add' 完全相同的调用序列）
// 1) POST /api/db/rest/v1/activities（editor JWT）
// 2) POST /api/db/rest/v1/activity_attendance（批量数组）
// 3) 直读 activities 确认行存在
// 对照组：owner 同样流程。结束后自动清理。用法: node scripts/verify-create-activity.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TEST_PORT = 15619;
const PWD = 'Sec-Test-2026!';

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
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PWD, data: { display_name: email.split('@')[0] } }),
  });
  const sb = await su.json();
  if (sb.access_token) return { token: sb.access_token, uid: sb.user.id };
  const li = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PWD }),
  });
  const lb = await li.json();
  return { token: lb.access_token, uid: lb.user.id };
}

async function proxy(token, method, table, body, query) {
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/db/rest/v1/${table}${query || ''}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

async function waitServer() {
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://127.0.0.1:${TEST_PORT}/api/supabase-config`);
      return;
    } catch {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  throw new Error('server 启动超时');
}

async function runCase(label, token, guildId, memberIds, uid) {
  console.log(`\n--- ${label} ---`);
  // 与 syncActivity add 完全相同的请求体
  const actBody = {
    guild_id: guildId,
    name: '虚影尖塔 - 2026-07-26',
    activity_date: '2026-07-26',
    raid: '虚影尖塔',
    boss: '',
    notes: '',
    start_time: '20:00',
    end_time: '23:00',
    created_by: uid,
  };
  const ins = await proxy(token, 'POST', 'activities', actBody);
  console.log(`1) POST activities → ${ins.status}`);
  const newId = Array.isArray(ins.body) && ins.body[0] ? ins.body[0].id : (ins.body && ins.body.id);
  console.log(`   返回 id: ${newId ? '有' : '无（前端 item.id 将无法回填！）'} ${!newId ? JSON.stringify(ins.body).slice(0, 200) : ''}`);
  if (!newId) return null;

  const attRows = memberIds.map(mid => ({ activity_id: newId, member_id: mid, status: 'absent' }));
  const att = await proxy(token, 'POST', 'activity_attendance', attRows);
  console.log(`2) POST activity_attendance (${attRows.length}行) → ${att.status}${att.status >= 400 ? ' ' + JSON.stringify(att.body).slice(0, 200) : ''}`);

  const check = await svcRest('GET', `/rest/v1/activities?id=eq.${newId}&select=id,activity_date`);
  console.log(`3) 直读确认活动存在 → ${Array.isArray(check.body) && check.body.length === 1 ? '是' : '否'}`);
  return newId;
}

async function main() {
  const stamp = Date.now().toString(36);
  const server = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(TEST_PORT) } });
  const created = { guildId: null, memberIds: [], activityIds: [], userIds: [] };
  try {
    await waitServer(server);
    const owner = await signUpOrIn(`bug19-owner-${stamp}@example.com`);
    const editor = await signUpOrIn(`bug19-editor-${stamp}@example.com`);
    created.userIds.push(owner.uid, editor.uid);

    const g = await svcRest('POST', '/rest/v1/guilds', { name: `BUG19-${stamp}`, owner_id: owner.uid, invite_code: `B${stamp}`.slice(0, 8) });
    created.guildId = g.body[0].id;
    await svcRest('POST', '/rest/v1/guild_members', [
      { guild_id: created.guildId, user_id: owner.uid, role: 'owner' },
      { guild_id: created.guildId, user_id: editor.uid, role: 'editor' },
    ]);
    for (const name of ['Bug19甲', 'Bug19乙']) {
      const r = await svcRest('POST', '/rest/v1/raid_members', { guild_id: created.guildId, name, class: '战士', spec: '武器', role: 'dps' });
      created.memberIds.push(r.body[0].id);
    }

    const a1 = await runCase('owner 创建活动', owner.token, created.guildId, created.memberIds, owner.uid);
    if (a1) created.activityIds.push(a1);
    const a2 = await runCase('editor 创建活动', editor.token, created.guildId, created.memberIds, editor.uid);
    if (a2) created.activityIds.push(a2);
  } finally {
    console.log('\n===== 清理 =====');
    if (created.activityIds.length) await svcRest('DELETE', `/rest/v1/activity_attendance?activity_id=in.(${created.activityIds.join(',')})`);
    if (created.activityIds.length) await svcRest('DELETE', `/rest/v1/activities?id=in.(${created.activityIds.join(',')})`);
    if (created.memberIds.length) await svcRest('DELETE', `/rest/v1/raid_members?id=in.(${created.memberIds.join(',')})`);
    if (created.guildId) {
      await svcRest('DELETE', `/rest/v1/guild_members?guild_id=eq.${created.guildId}`);
      await svcRest('DELETE', `/rest/v1/guilds?id=eq.${created.guildId}`);
    }
    for (const uid of created.userIds) await svcRest('DELETE', `/auth/v1/admin/users/${uid}`);
    server.kill();
    console.log('已清理');
  }
}

main().catch(e => { console.error('脚本失败:', e.message); process.exit(1); });
