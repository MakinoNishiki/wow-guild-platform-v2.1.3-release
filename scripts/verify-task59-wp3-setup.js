// 任务书 #59 WP3 验收——测试数据准备/清理（验证代理自建脚本）
// setup: wp3-owner + 公会 WP3验收公会（邀请码 WP3JOIN8）
// cleanup: 埋点 wp3-verify-* / 方案单 / 公会（级联成员）/ wp3-* 用户 全删
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CTX = path.join(__dirname, '.task59-wp3-ctx.json');
const PWD = 'Wp3-Verify-2026!';

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const SVC = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

async function svcRest(method, p, body) {
  const res = await fetch(`${SB}${p}`, { method, headers: SVC, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

async function setup() {
  const su = await fetch(`${SB}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'wp3-owner@example.com', password: PWD, data: { display_name: 'wp3-owner' } }),
  });
  const sb = await su.json();
  let uidOwner = sb.access_token ? sb.user.id : null;
  if (!uidOwner) {
    const li = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'wp3-owner@example.com', password: PWD }),
    });
    uidOwner = (await li.json()).user.id;
  }
  await svcRest('DELETE', `/rest/v1/guilds?invite_code=eq.WP3JOIN8`);
  const g = await svcRest('POST', '/rest/v1/guilds', { name: 'WP3验收公会', owner_id: uidOwner, invite_code: 'WP3JOIN8', server_name: '测试', server_region: '一区' });
  if (g.status !== 201) throw new Error('建会失败 ' + g.status);
  const guildId = g.body[0].id;
  await svcRest('POST', '/rest/v1/guild_members', [{ guild_id: guildId, user_id: uidOwner, role: 'owner', display_name: 'wp3-owner' }]);
  fs.writeFileSync(CTX, JSON.stringify({ uidOwner, guildId, pwd: PWD }, null, 2));
  console.log(JSON.stringify({ uidOwner, guildId }));
}

async function cleanup() {
  const ctx = JSON.parse(fs.readFileSync(CTX, 'utf8'));
  const del = async (label, p) => { const r = await svcRest('DELETE', p); console.log(`清理 ${label}: status=${r.status}`); };
  await del('analytics_events(wp3-verify)', `/rest/v1/analytics_events?vid=like.wp3-verify-*`);
  const plans = await svcRest('GET', `/rest/v1/decor_plans?user_id=eq.${ctx.uidOwner}&select=id`);
  const planIds = (Array.isArray(plans.body) ? plans.body : []).map(p => p.id);
  if (planIds.length) {
    await del('decor_plan_items', `/rest/v1/decor_plan_items?plan_id=in.(${planIds.join(',')})`);
    await del('decor_plans(' + planIds.length + ')', `/rest/v1/decor_plans?user_id=eq.${ctx.uidOwner}`);
  } else console.log('清理 decor_plans: 无测试方案行');
  await del('guilds WP3', `/rest/v1/guilds?id=eq.${ctx.guildId}`);
  const lu = await fetch(`${SB}/auth/v1/admin/users?per_page=200&page=1`, { headers: SVC });
  const lj = await lu.json();
  for (const u of (lj.users || []).filter(u => (u.email || '').startsWith('wp3-'))) {
    await del(`user ${u.email}`, `/auth/v1/admin/users/${u.id}`);
  }
  fs.unlinkSync(CTX);
  console.log('清理完成');
}

(process.argv[2] === 'cleanup' ? cleanup() : setup()).catch(e => { console.error('失败:', e.message); process.exit(1); });
