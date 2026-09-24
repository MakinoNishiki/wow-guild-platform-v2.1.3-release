// 任务书 #59 WP1 验收——测试数据准备/清理（验证代理自建脚本，不触碰产品源码）
// 用法: node scripts/verify-task59-wp1-setup.js setup   → 输出 JSON {uidA, uidB, guildId} 到 scripts/.task59-wp1-ctx.json
//       node scripts/verify-task59-wp1-setup.js cleanup → 删除测试用户/公会/方案单/埋点测试行
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CTX = path.join(__dirname, '.task59-wp1-ctx.json');
const PWD = 'Wp1-Verify-2026!';

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
    body: JSON.stringify({ email, password: PWD, data: { display_name: email.split('@')[0] } }),
  });
  const sb = await su.json();
  if (sb.access_token) return sb.user.id;
  const li = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PWD }),
  });
  const lb = await li.json();
  if (!lb.access_token) throw new Error(`无法获取 ${email} 会话`);
  return lb.user.id;
}

async function setup() {
  const uidA = await signUpOrIn('wp1-a@example.com'); // 有公会 owner
  const uidB = await signUpOrIn('wp1-b@example.com'); // 无公会
  // 幂等：若上次残留同名公会先清
  await svcRest('DELETE', `/rest/v1/guilds?invite_code=eq.WP1VIFYA`);
  const g = await svcRest('POST', '/rest/v1/guilds', { name: 'WP1验收公会A', owner_id: uidA, invite_code: 'WP1VIFYA', server_name: '测试', server_region: '一区' });
  if (g.status !== 201) throw new Error('建会失败 status=' + g.status + ' ' + JSON.stringify(g.body).slice(0, 200));
  const guildId = g.body[0].id;
  await svcRest('POST', '/rest/v1/guild_members', [{ guild_id: guildId, user_id: uidA, role: 'owner', display_name: 'wp1-a' }]);
  fs.writeFileSync(CTX, JSON.stringify({ uidA, uidB, guildId, pwd: PWD }, null, 2));
  console.log(JSON.stringify({ uidA, uidB, guildId }));
}

async function cleanup() {
  const ctx = JSON.parse(fs.readFileSync(CTX, 'utf8'));
  const del = async (label, p) => {
    const r = await svcRest('DELETE', p);
    console.log(`清理 ${label}: status=${r.status}`);
    return r;
  };
  // 埋点测试行（两个验收 vid 前缀）
  await del('analytics_events(wp1-verify)', `/rest/v1/analytics_events?vid=like.wp1-verify-*`);
  // 方案单（decor_plan_items 无 user_id，经头表 plan_id 归属删除）
  const plans = await svcRest('GET', `/rest/v1/decor_plans?user_id=eq.${ctx.uidA}&select=id`);
  const planIds = (Array.isArray(plans.body) ? plans.body : []).map(p => p.id);
  if (planIds.length) {
    await del('decor_plan_items', `/rest/v1/decor_plan_items?plan_id=in.(${planIds.join(',')})`);
    await del('decor_plans', `/rest/v1/decor_plans?user_id=eq.${ctx.uidA}`);
  } else {
    console.log('清理 decor_plans: 无测试方案行');
  }
  await del('guilds A', `/rest/v1/guilds?id=eq.${ctx.guildId}`);
  await del('user A', `/auth/v1/admin/users/${ctx.uidA}`);
  await del('user B', `/auth/v1/admin/users/${ctx.uidB}`);
  fs.unlinkSync(CTX);
  console.log('清理完成');
}

const mode = process.argv[2];
(mode === 'cleanup' ? cleanup() : setup()).catch(e => { console.error('失败:', e.message); process.exit(1); });
