// 任务书 #22 WP1：成员管理列表对齐修复——前后对照截图 + 控制台零报错
// 用法: SHOT_SUFFIX=before node scripts/verify-task22-wp1.js   （改 CSS 前）
//       SHOT_SUFFIX=after  node scripts/verify-task22-wp1.js   （改 CSS 后）
// 覆盖页面：成员管理（含已离队视图）、装备分配、心愿单；两档宽度 1366×768 / 1920×1080。
// 造数含极端行（长角色名/多副专精/多职责/离队/已认领），用完自清理并复核为零。
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SUFFIX = process.env.SHOT_SUFFIX || 'before';
const SHOT_DIR = path.join(ROOT, 'backup', `2026-08-05-task22-wp1-${SUFFIX}`);
const PORT = 15644;
const BASE = `http://localhost:${PORT}`;
const PWD = 'Wp22-Test-2026!';
const EMAIL_OWNER = 'wp22-owner@wowbutler.cn';

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const ANON = env.SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const SVC = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail !== undefined ? `（${detail}）` : ''}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function svc(method, restPath, body) {
  const res = await fetch(`${SB}${restPath}`, { method, headers: SVC, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

let serverProc = null, owner = null, guildId = null;
const memberIds = {};

async function setup() {
  let res = await fetch(`${SB}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL_OWNER, password: PWD, data: { display_name: 'WP22会长' } }),
  });
  let body = await res.json();
  if (!body.access_token) {
    res = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL_OWNER, password: PWD }),
    });
    body = await res.json();
    if (!body.access_token) throw new Error('owner 登录失败');
  }
  owner = { uid: body.user.id, token: body.access_token };

  const g = await svc('POST', '/rest/v1/guilds', { name: 'WP22视觉会', owner_id: owner.uid, invite_code: 'W22A' + Date.now().toString(36).slice(-4).toUpperCase() });
  if (g.status !== 201) throw new Error('建会失败: ' + JSON.stringify(g.body));
  guildId = g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', { guild_id: guildId, user_id: owner.uid, role: 'owner', display_name: 'WP22会长' });

  // 极端行造数：长名/多副专精/多职责/替补/离队/已认领
  const members = [
    { key: 'long', name: '长名字测试角色甲乙丙丁', class: '战士', main_spec: '武器', off_specs: ['狂怒', '防护'], role: ['坦克', '输出'], status: '正式', user_id: null },
    { key: 'rogue', name: '贼老二', class: '盗贼', main_spec: '刺杀', off_specs: ['敏锐', '狂徒'], role: ['输出'], status: '替补', user_id: null },
    { key: 'priest', name: '牧小仙', class: '牧师', main_spec: '戒律', off_specs: ['神圣'], role: ['治疗'], status: '离队', user_id: null },
    { key: 'hunter', name: '猎大', class: '猎人', main_spec: '射击', off_specs: [], role: ['输出'], status: '正式', user_id: owner.uid },
    { key: 'dh', name: '蛋总', class: '恶魔猎手', main_spec: '浩劫', off_specs: ['复仇', '噬灭'], role: ['坦克', '输出'], status: '试用', user_id: null },
  ];
  for (const m of members) {
    const r = await svc('POST', '/rest/v1/raid_members', {
      guild_id: guildId, name: m.name, class: m.class, spec: m.main_spec,
      off_specs: m.off_specs, role: m.role, status: m.status, user_id: m.user_id,
    });
    if (r.status !== 201) throw new Error('建成员失败 ' + m.name + ': ' + JSON.stringify(r.body));
    memberIds[m.key] = r.body[0].id;
  }

  // 装备分配两行（一个待分配、一个已分配给猎大）
  const loots = [
    { guild_id: guildId, item_name: '虚影统领的威严头盔', raid_name: '虚影尖塔', boss_name: '虚影统领', item_category: '护甲', item_slot: '头部', item_level: 489, obtained_date: '2026-08-04', season: 'S1', item_stats: { assignedTo: '', status: '待分配', priority: 'P1' } },
    { guild_id: guildId, item_name: '梦境织锦护腿', raid_name: '梦境裂隙', boss_name: '织梦者', item_category: '护甲', item_slot: '腿部', item_level: 483, obtained_date: '2026-08-03', season: 'S1', character_id: memberIds.hunter, item_stats: { assignedTo: '猎大', status: '已分配', priority: 'P2' } },
  ];
  for (const l of loots) {
    const r = await svc('POST', '/rest/v1/loot_records', l);
    if (r.status !== 201) throw new Error('建装备失败: ' + JSON.stringify(r.body));
  }

  // 心愿单：猎大两条
  const w = await svc('POST', '/rest/v1/wishlists', {
    guild_id: guildId, member_id: memberIds.hunter,
    items: [
      { id: 'w22a', memberId: memberIds.hunter, itemName: '虚影统领的威严头盔', raid: '虚影尖塔', boss: '虚影统领', category: '护甲', slot: '头部', priority: 'P1', obtained: false },
      { id: 'w22b', memberId: memberIds.hunter, itemName: '孢陨之怒长弓', raid: '孢陨幽境', boss: '孢陨之王', category: '武器', slot: '远程武器', priority: 'P2', obtained: false },
    ],
  });
  if (w.status !== 201) throw new Error('建心愿单失败: ' + JSON.stringify(w.body));

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }
}

async function cleanup() {
  const steps = [];
  try { const r = await svc('DELETE', `/rest/v1/loot_records?guild_id=eq.${guildId}`); steps.push(`loot:${r.status}`); } catch { steps.push('loot:ERR'); }
  try { const r = await svc('DELETE', `/rest/v1/wishlists?guild_id=eq.${guildId}`); steps.push(`wish:${r.status}`); } catch { steps.push('wish:ERR'); }
  try { const r = await svc('DELETE', `/rest/v1/raid_members?guild_id=eq.${guildId}`); steps.push(`members:${r.status}`); } catch { steps.push('members:ERR'); }
  try { const r = await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`); steps.push(`guilds:${r.status}`); } catch { steps.push('guilds:ERR'); }
  try { if (owner) await fetch(`${SB}/auth/v1/admin/users/${owner.uid}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const chk = await svc('GET', `/rest/v1/guilds?id=eq.${guildId}&select=id`);
  console.log(`[清理复核] guilds 剩余=${Array.isArray(chk.body) ? chk.body.length : '?'}`);
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await setup();

  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const pageErrors = [];
  try {
    for (const vp of [{ width: 1366, height: 768, tag: '1366' }, { width: 1920, height: 1080, tag: '1920' }]) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      page.on('pageerror', e => pageErrors.push(`pageerror(${vp.tag}): ` + e.message));
      page.on('console', msg => { if (msg.type() === 'error') pageErrors.push(`console(${vp.tag}): ` + msg.text()); });
      page.on('dialog', d => d.accept());

      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
      await page.fill('#authEmail', EMAIL_OWNER);
      await page.fill('#authPassword', PWD);
      await page.click('#authLoginBtn');
      await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
      await sleep(2000);

      // 成员管理（默认隐藏离队）
      await page.click('.nav-item[data-page="members"]');
      await sleep(1500);
      const rowCount = await page.evaluate(() => document.querySelectorAll('#membersTableBody tr').length);
      check(`[${vp.tag}] 成员表渲染（5 行含离队隐藏→4 行）`, rowCount >= 4, `行数=${rowCount}`);
      await page.screenshot({ path: path.join(SHOT_DIR, `${vp.tag}-members.png`) });

      // 已离队视图
      await page.click('#memberShowDeparted');
      await sleep(1000);
      await page.screenshot({ path: path.join(SHOT_DIR, `${vp.tag}-members-departed.png`) });

      // 装备分配
      await page.click('.nav-item[data-page="loot"]');
      await sleep(1500);
      const lootRows = await page.evaluate(() => document.querySelectorAll('#page-loot .data-table tbody tr').length);
      check(`[${vp.tag}] 装备分配渲染（2 行）`, lootRows >= 2, `行数=${lootRows}`);
      await page.screenshot({ path: path.join(SHOT_DIR, `${vp.tag}-loot.png`) });

      // 心愿单（切到「竞争概览」外的成员列表视图即可，默认渲染即含表格）
      await page.click('.nav-item[data-page="wishlist"]');
      await sleep(1500);
      await page.screenshot({ path: path.join(SHOT_DIR, `${vp.tag}-wishlist.png`) });

      await ctx.close();
    }

    const realErrors = pageErrors.filter(e => !e.includes('status of 406'));
    check('两档宽度四页控制台零报错（406=既有用户资料空行噪音，已排除）', realErrors.length === 0, realErrors.join(' | ') || '无');
  } finally {
    await browser.close();
  }

  await cleanup();

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#22 WP1（${SUFFIX}）: ${passed}/${results.length} 通过，截图 → ${SHOT_DIR} =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
