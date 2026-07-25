// 任务书 #4 诊断脚本：A 组刷新链验证
// 以 test-diag@example.com（诊断测试公会 owner）身份，完整模拟 cloud.js 的
// “写入(代理) → 立即重读(直连 REST+JWT)” 链路，验证各表写后立即可读。
// 只读 .env，不打印密钥；产生的测试数据在脚本末尾清理。
// 用法: node scripts/diagnose-refresh-chain.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TEST_PORT = 15603;

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const URL = env.SUPABASE_URL.replace(/\/+$/, '');
const ANON = env.SUPABASE_ANON_KEY;

let TOKEN = null;
let results = [];
function report(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}: ${detail}`);
}

async function directGet(table, query) {
  // 模拟前端 reloadData：直连 Supabase REST（anon + 用户 JWT，走 RLS）
  const res = await fetch(`${URL}/rest/v1/${table}?${query}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${TOKEN}` },
  });
  const body = await res.json();
  return { status: res.status, body };
}

async function proxyWrite(method, table, body, query) {
  // 模拟前端 saveCloudData：走 server.js 代理写入
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/db/rest/v1/${table}${query || ''}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

(async () => {
  // 登录测试用户 A
  const li = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test-diag@example.com', password: 'Test-Diag-2026!' }),
  });
  const lb = await li.json();
  if (!lb.access_token) { console.log('登录失败:', JSON.stringify(lb)); process.exit(1); }
  TOKEN = lb.access_token;
  const uid = lb.user.id;
  console.log('已登录 test-diag@example.com');

  // 找到诊断测试公会
  const g = await directGet('guilds', 'invite_code=eq.DIAG0001&select=id');
  if (!Array.isArray(g.body) || !g.body.length) { console.log('找不到诊断测试公会'); process.exit(1); }
  const guildId = g.body[0].id;

  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DEPLOY_RUN_PORT: String(TEST_PORT) },
    stdio: 'ignore',
  });
  await new Promise(r => setTimeout(r, 1000));

  const cleanup = { memberIds: [], lootIds: [], activityIds: [] };
  try {
    // ---- 1. 成员：写入后立即重读（BUG-002） ----
    const m1 = await proxyWrite('POST', 'raid_members', {
      guild_id: guildId, name: '刷新链测试成员甲', class: '战士', spec: '武器', role: '输出',
      off_spec: '', off_specs: [], status: '正式', join_date: '2026-07-25', notes: '', user_id: uid,
    });
    report('成员写入(代理)', m1.status === 201, `HTTP ${m1.status}`);
    const memberId = Array.isArray(m1.body) && m1.body[0] ? m1.body[0].id : null;
    if (memberId) cleanup.memberIds.push(memberId);
    const mRead = await directGet('raid_members', `guild_id=eq.${guildId}&select=id,name`);
    const mVisible = Array.isArray(mRead.body) && mRead.body.some(r => r.id === memberId);
    report('成员写后立即直连可读(BUG-002)', mVisible, `HTTP ${mRead.status}, 可见=${mVisible}, 行数=${Array.isArray(mRead.body) ? mRead.body.length : '-'}`);

    // 连续写入第二个，验证两个都可见
    const m2 = await proxyWrite('POST', 'raid_members', {
      guild_id: guildId, name: '刷新链测试成员乙', class: '法师', spec: '火焰', role: '输出',
      off_spec: '', off_specs: [], status: '正式', join_date: '2026-07-25', notes: '', user_id: uid,
    });
    const memberId2 = Array.isArray(m2.body) && m2.body[0] ? m2.body[0].id : null;
    if (memberId2) cleanup.memberIds.push(memberId2);
    const mRead2 = await directGet('raid_members', `guild_id=eq.${guildId}&select=id,name`);
    const bothVisible = Array.isArray(mRead2.body) && [memberId, memberId2].every(id => mRead2.body.some(r => r.id === id));
    report('连续写第二个后两个都可见', bothVisible, `行数=${Array.isArray(mRead2.body) ? mRead2.body.length : '-'}`);

    // ---- 2. 装备：写入后立即重读（BUG-001），删除后确认消失（BUG-004） ----
    const l1 = await proxyWrite('POST', 'loot_records', {
      guild_id: guildId, character_id: null, assigned_by: uid, item_name: '刷新链测试装备',
      item_category: '武器', item_slot: '双手', item_level: 639, item_stats: { status: '待分配' },
      raid_name: '虚影尖塔', season: '', difficulty: '史诗', boss_name: '测试BOSS',
      obtained_date: '2026-07-25', distribution_method: 'custom', player_action: 'none',
      roll_value: null, is_wishlist: false, rule_note: null, decision_note: null, note: null,
    });
    report('装备写入(代理)', l1.status === 201, `HTTP ${l1.status}`);
    const lootId = Array.isArray(l1.body) && l1.body[0] ? l1.body[0].id : null;
    const lRead = await directGet('loot_records', `guild_id=eq.${guildId}&select=id,item_name`);
    const lVisible = Array.isArray(lRead.body) && lRead.body.some(r => r.id === lootId);
    report('装备写后立即直连可读(BUG-001)', lVisible, `HTTP ${lRead.status}, 可见=${lVisible}`);
    if (lootId) {
      const del = await proxyWrite('DELETE', 'loot_records', null, `?id=eq.${lootId}`);
      const lRead2 = await directGet('loot_records', `guild_id=eq.${guildId}&select=id`);
      const gone = Array.isArray(lRead2.body) && !lRead2.body.some(r => r.id === lootId);
      report('装备删除(代理)后直连确认消失(BUG-004)', del.status === 204 && gone, `DELETE HTTP ${del.status}, 仍存在=${!gone}`);
    }

    // ---- 3. 心愿单：写入→重读→批量删除（BUG-005/006，模拟 cloud.js 分组行模式） ----
    if (memberId) {
      const w1 = await proxyWrite('POST', 'wishlists', {
        guild_id: guildId, member_id: memberId,
        items: [{ id: 'wtest1', itemName: '测试心愿甲', memberId }, { id: 'wtest2', itemName: '测试心愿乙', memberId }],
      });
      report('心愿单写入(代理)', w1.status === 201, `HTTP ${w1.status}`);
      const wRowId = Array.isArray(w1.body) && w1.body[0] ? w1.body[0].id : null;
      const wRead = await directGet('wishlists', `guild_id=eq.${guildId}&select=id,items`);
      const wVisible = Array.isArray(wRead.body) && wRead.body.some(r => r.id === wRowId);
      report('心愿单写后立即直连可读(BUG-005)', wVisible, `HTTP ${wRead.status}, 可见=${wVisible}`);
      // 模拟批量删除：从 items 中移除两个条目后 PATCH（cloud.js syncWishlist delete 的做法）
      if (wRowId) {
        const del = await proxyWrite('PATCH', 'wishlists', { items: [] }, `?id=eq.${wRowId}`);
        const wRead2 = await directGet('wishlists', `id=eq.${wRowId}&select=items`);
        const emptied = Array.isArray(wRead2.body) && wRead2.body[0] && wRead2.body[0].items.length === 0;
        report('心愿单批量移除条目(PATCH)生效(BUG-006)', del.status === 200 && emptied, `PATCH HTTP ${del.status}, items 已清空=${emptied}`);
      }
    }

    // ---- 4. 活动 + 考勤：写入后立即重读（BUG-003） ----
    const a1 = await proxyWrite('POST', 'activities', {
      guild_id: guildId, name: '刷新链测试活动 - 2026-07-25', activity_date: '2026-07-25',
      raid: '虚影尖塔', boss: '', notes: '', created_by: uid,
    });
    report('活动写入(代理)', a1.status === 201, `HTTP ${a1.status}`);
    const actId = Array.isArray(a1.body) && a1.body[0] ? a1.body[0].id : null;
    if (actId) cleanup.activityIds.push(actId);
    if (actId && memberId) {
      const att = await proxyWrite('POST', 'activity_attendance', [
        { activity_id: actId, member_id: memberId, status: 'present' },
        { activity_id: actId, member_id: memberId2, status: 'absent' },
      ]);
      report('考勤批量写入(代理, 英文状态码)', att.status === 201, `HTTP ${att.status} ${att.status !== 201 ? JSON.stringify(att.body).slice(0, 200) : ''}`);
      const aRead = await directGet('activity_attendance', `activity_id=eq.${actId}&select=id,status`);
      report('考勤写后立即直连可读(BUG-003)', Array.isArray(aRead.body) && aRead.body.length === 2, `HTTP ${aRead.status}, 行数=${Array.isArray(aRead.body) ? aRead.body.length : '-'}`);
    }
  } finally {
    // 清理本次脚本产生的测试数据（保留任务书 #3 的诊断公会与账号）
    for (const id of cleanup.activityIds) {
      await proxyWrite('DELETE', 'activity_attendance', null, `?activity_id=eq.${id}`);
      await proxyWrite('DELETE', 'activities', null, `?id=eq.${id}`);
    }
    for (const id of cleanup.memberIds) {
      await proxyWrite('DELETE', 'wishlists', null, `?member_id=eq.${id}`);
      await proxyWrite('DELETE', 'raid_members', null, `?id=eq.${id}`);
    }
    srv.kill();
    console.log('\n（脚本产生的成员/装备/活动测试行已清理）');
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n===== 刷新链诊断结果: ${results.length - failed.length}/${results.length} 通过 =====`);
  if (failed.length) process.exit(1);
})().catch(e => { console.error('诊断异常:', e.message); process.exit(1); });
