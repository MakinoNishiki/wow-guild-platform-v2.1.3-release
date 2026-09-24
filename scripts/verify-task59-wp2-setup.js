// 任务书 #59 WP2 验收——测试数据准备/清理（验证代理自建脚本）
// setup: 建 wp2-owner（公会 owner，公会 WP2验收公会/邀请码 WP2JOIN8）+ wp2-noguild（无公会）
// cleanup: 删公会（级联成员）/三用户（含 UI 注册的 wp2-reg-*）/方案单/埋点 wp2-verify-* 行
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CTX = path.join(__dirname, '.task59-wp2-ctx.json');
const PWD = 'Wp2-Verify-2026!';

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const ANON = env.SUPABASE_ANON_KEY;
const SVC = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

async function svcRest(method, p, body) {
  const res = await fetch(`${SB}${p}`, { method, headers: SVC, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}
async function signUpOrIn(email) {
  const su = await fetch(`${SB}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PWD, data: { display_name: email.split('@')[0] } }),
  });
  const sb = await su.json();
  if (sb.access_token) return sb.user.id;
  const li = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PWD }),
  });
  const lb = await li.json();
  if (!lb.access_token) throw new Error(`无法获取 ${email} 会话: ` + JSON.stringify(lb).slice(0, 150));
  return lb.user.id;
}

async function setup() {
  const uidOwner = await signUpOrIn('wp2-owner@example.com');
  const uidNoguild = await signUpOrIn('wp2-noguild@example.com');
  await svcRest('DELETE', `/rest/v1/guilds?invite_code=eq.WP2JOIN8`); // 幂等清残留
  const g = await svcRest('POST', '/rest/v1/guilds', { name: 'WP2验收公会', owner_id: uidOwner, invite_code: 'WP2JOIN8', server_name: '测试', server_region: '一区' });
  if (g.status !== 201) throw new Error('建会失败 ' + g.status + ' ' + JSON.stringify(g.body).slice(0, 200));
  const guildId = g.body[0].id;
  await svcRest('POST', '/rest/v1/guild_members', [{ guild_id: guildId, user_id: uidOwner, role: 'owner', display_name: 'wp2-owner' }]);
  fs.writeFileSync(CTX, JSON.stringify({ uidOwner, uidNoguild, guildId, pwd: PWD, invite: 'WP2JOIN8', regEmail: null }, null, 2));
  console.log(JSON.stringify({ uidOwner, uidNoguild, guildId }));
}

async function cleanup() {
  const ctx = JSON.parse(fs.readFileSync(CTX, 'utf8'));
  const del = async (label, p) => { const r = await svcRest('DELETE', p); console.log(`清理 ${label}: status=${r.status}`); };
  await del('analytics_events(wp2-verify)', `/rest/v1/analytics_events?vid=like.wp2-verify-*`);
  // 全部 wp2-* 测试用户（含 UI 注册的 wp2-reg-*，可能多轮残留）——admin 列表按邮箱前缀清扫
  const lu = await fetch(`${SB}/auth/v1/admin/users?per_page=200&page=1`, { headers: SVC });
  const lj = await lu.json();
  const wp2Users = (lj.users || []).filter(u => typeof u.email === 'string' && u.email.startsWith('wp2-'));
  console.log('待清 wp2-* 用户:', wp2Users.map(u => u.email).join(', ') || '(无)');
  // 方案单（owner 名下，D2 若产生）
  const plans = await svcRest('GET', `/rest/v1/decor_plans?user_id=eq.${ctx.uidOwner}&select=id`);
  const planIds = (Array.isArray(plans.body) ? plans.body : []).map(p => p.id);
  if (planIds.length) {
    await del('decor_plan_items', `/rest/v1/decor_plan_items?plan_id=in.(${planIds.join(',')})`);
    await del('decor_plans', `/rest/v1/decor_plans?user_id=eq.${ctx.uidOwner}`);
  } else console.log('清理 decor_plans: 无测试方案行');
  await del('guilds WP2', `/rest/v1/guilds?id=eq.${ctx.guildId}`);
  await del('user owner', `/auth/v1/admin/users/${ctx.uidOwner}`);
  await del('user noguild', `/auth/v1/admin/users/${ctx.uidNoguild}`);
  for (const u of wp2Users) {
    if (u.id === ctx.uidOwner || u.id === ctx.uidNoguild) continue; // 已删
    await del(`user ${u.email}`, `/auth/v1/admin/users/${u.id}`);
  }
  fs.unlinkSync(CTX);
  console.log('清理完成');
}

(process.argv[2] === 'cleanup' ? cleanup() : setup()).catch(e => { console.error('失败:', e.message); process.exit(1); });
