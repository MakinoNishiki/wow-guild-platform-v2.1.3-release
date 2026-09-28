// 任务书 #59 WP4 验收——测试数据准备/清理（验证代理自建脚本，仿 verify-task59-wp2-setup.js）
// setup: 建 wp4-owner（公会A「WP4密度验收会」含 12 成员/3 活动+考勤/3 装备/2 心愿；公会B「WP4空会」零数据做空态）+ wp4-noguild
// cleanup: 删两公会（级联成员/活动/考勤/装备/心愿）/用户/方案单/埋点 wp4-verify-* 行
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CTX = path.join(__dirname, '.task59-wp4-ctx.json');
const PWD = 'Wp4-Verify-2026!';

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

const CLASSES = ['战士', '法师', '牧师', '潜行者', '猎人', '圣骑士', '萨满祭司', '德鲁伊', '术士', '武僧', '恶魔猎手', '死亡骑士'];

async function setup() {
  const uidOwner = await signUpOrIn('wp4-owner@example.com');
  const uidNoguild = await signUpOrIn('wp4-noguild@example.com');
  await svcRest('DELETE', `/rest/v1/guilds?invite_code=eq.WP4DENSE`); // 幂等清残留（级联清子表）
  await svcRest('DELETE', `/rest/v1/guilds?invite_code=eq.WP4EMPTY`);

  const gA = await svcRest('POST', '/rest/v1/guilds', { name: 'WP4密度验收会', owner_id: uidOwner, invite_code: 'WP4DENSE', server_name: '测试服', server_region: '一区' });
  if (gA.status !== 201) throw new Error('建会A失败 ' + gA.status + ' ' + JSON.stringify(gA.body).slice(0, 200));
  const guildA = gA.body[0].id;
  const gB = await svcRest('POST', '/rest/v1/guilds', { name: 'WP4空会', owner_id: uidOwner, invite_code: 'WP4EMPTY', server_name: '测试服', server_region: '一区' });
  if (gB.status !== 201) throw new Error('建会B失败 ' + gB.status + ' ' + JSON.stringify(gB.body).slice(0, 200));
  const guildB = gB.body[0].id;
  await svcRest('POST', '/rest/v1/guild_members', [
    { guild_id: guildA, user_id: uidOwner, role: 'owner', display_name: 'wp4-owner' },
    { guild_id: guildB, user_id: uidOwner, role: 'owner', display_name: 'wp4-owner' },
  ]);

  // 公会A：12 成员（列口径对齐 cloud.js syncMember：role=职责中文、status=正式/替补/试用）
  const members = CLASSES.map((cls, i) => ({
    guild_id: guildA, name: `密度样本${String(i + 1).padStart(2, '0')}`, server: '测试服', class: cls,
    spec: '待补充', role: ['坦克', '治疗', '输出'][i % 3], off_spec: '', off_specs: [], status: '正式', join_date: '2026-09-01', notes: '',
  }));
  const mRes = await svcRest('POST', '/rest/v1/raid_members', members);
  if (mRes.status !== 201) throw new Error('成员失败 ' + mRes.status + ' ' + JSON.stringify(mRes.body).slice(0, 200));
  const memberIds = mRes.body.map(m => m.id);

  // 3 活动 + 考勤（status 英文枚举，口径对齐 cloud.js mapStatusToDb）
  const acts = [];
  for (let i = 0; i < 3; i++) {
    acts.push({ guild_id: guildA, name: `WP4密度活动${i + 1}`, activity_date: `2026-09-2${i + 5}`, raid: '虚影尖塔', boss: '', start_time: '20:00', end_time: '23:00', status: 'normal', team_label: '' });
  }
  const aRes = await svcRest('POST', '/rest/v1/activities', acts);
  if (aRes.status !== 201) throw new Error('活动失败 ' + aRes.status + ' ' + JSON.stringify(aRes.body).slice(0, 200));
  const attRows = [];
  for (const a of aRes.body) {
    memberIds.forEach((mid, i) => attRows.push({ activity_id: a.id, member_id: mid, member_name: `密度样本${String(i + 1).padStart(2, '0')}`, status: ['present', 'present', 'present', 'late', 'backup', 'leave'][i % 6] }));
  }
  const attRes = await svcRest('POST', '/rest/v1/activity_attendance', attRows);
  if (attRes.status !== 201) throw new Error('考勤失败 ' + attRes.status + ' ' + JSON.stringify(attRes.body).slice(0, 200));

  // 3 装备分配（loot_records 为真实表，列口径对齐 cloud.js syncLoot）
  const loots = [0, 1, 2].map(i => ({
    guild_id: guildA, character_id: memberIds[i], member_name: `密度样本0${i + 1}`,
    item_name: `WP4密度装备${i + 1}`, item_category: '护甲', item_slot: '头部', item_level: 318,
    raid_name: '虚影尖塔', boss_name: '样本BOSS', obtained_date: `2026-09-2${i + 5}`,
    distribution_method: 'custom', player_action: 'none',
    item_stats: { category: '护甲', assignedTo: `密度样本0${i + 1}`, status: '已分配', priority: 'P1' },
  }));
  const lRes = await svcRest('POST', '/rest/v1/loot_records', loots);
  if (lRes.status !== 201) console.warn('装备分配跳过（表结构不符不阻塞）: ' + lRes.status + ' ' + JSON.stringify(lRes.body).slice(0, 150));

  // 2 心愿（items JSONB 数组，口径对齐 cloud.js reloadWishlists 展平）
  const wl = [3, 4].map(i => ({ guild_id: guildA, member_id: memberIds[i], items: [{ name: `WP4心愿装备${i}`, raid: '虚影尖塔', boss: '样本BOSS', slot: '头部', category: '护甲', priority: 'P1', status: '未获取', spec: 'main' }] }));
  const wRes = await svcRest('POST', '/rest/v1/wishlists', wl);
  if (wRes.status !== 201) console.warn('心愿跳过（表结构不符不阻塞）: ' + wRes.status + ' ' + JSON.stringify(wRes.body).slice(0, 150));

  fs.writeFileSync(CTX, JSON.stringify({ uidOwner, uidNoguild, guildA, guildB, pwd: PWD, inviteA: 'WP4DENSE', inviteB: 'WP4EMPTY' }, null, 2));
  console.log(JSON.stringify({ uidOwner, uidNoguild, guildA, guildB, members: memberIds.length, loots: lRes.status, wishlists: wRes.status }));
}

async function cleanup() {
  const ctx = JSON.parse(fs.readFileSync(CTX, 'utf8'));
  const del = async (label, p) => { const r = await svcRest('DELETE', p); console.log(`清理 ${label}: status=${r.status}`); };
  await del('analytics_events(wp4-verify)', `/rest/v1/analytics_events?vid=like.wp4-verify-*`);
  const plans = await svcRest('GET', `/rest/v1/decor_plans?user_id=eq.${ctx.uidOwner}&select=id`);
  const planIds = (Array.isArray(plans.body) ? plans.body : []).map(p => p.id);
  if (planIds.length) {
    await del('decor_plan_items', `/rest/v1/decor_plan_items?plan_id=in.(${planIds.join(',')})`);
    await del('decor_plans', `/rest/v1/decor_plans?user_id=eq.${ctx.uidOwner}`);
  } else console.log('清理 decor_plans: 无测试方案行');
  await del('guilds WP4-A', `/rest/v1/guilds?id=eq.${ctx.guildA}`);
  await del('guilds WP4-B', `/rest/v1/guilds?id=eq.${ctx.guildB}`);
  await del('user owner', `/auth/v1/admin/users/${ctx.uidOwner}`);
  await del('user noguild', `/auth/v1/admin/users/${ctx.uidNoguild}`);
  fs.unlinkSync(CTX);
  console.log('清理完成');
}

(process.argv[2] === 'cleanup' ? cleanup() : setup()).catch(e => { console.error('失败:', e.message); process.exit(1); });
