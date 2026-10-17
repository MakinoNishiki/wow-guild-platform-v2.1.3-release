// 任务书 #80 验证：装备分配/拾取记录列表图标走 Blizzard CDN + 占位回退
// A 静态锚点 + B 浏览器实测（自起 server :15675，真实 Supabase 测试公会，主数据含基希克斯破封 10 件）：
//   B1 装备分配列表图标 = render CDN 且真实加载成功（露瑟拉玛，圣光之裁 icon=7350841）；
//   B2 拾取记录表格图标同链路；
//   B3 无本地 /assets/icons/items/ 请求；
//   B4 拦截 CDN 全断 → onerror 回退 _placeholder.png（非裂图）；
//   B5 全程零 TypeError / console 零报错。
// C 清零：测试记录/公会/账号删除复核。
// 用法: node scripts/verify-task80.js
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 15675;
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = 't80-exp@example.com';
const PWD = 'T80-Exp-2026!';
const GUILD_NAME = 'T80测试会';
const MEMBER_NAME = 'T80测试员';
const ITEM_NAME = '露瑟拉玛，圣光之裁';
const ICON_ID = 7350841;
const VER = '20261015.100';

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const SVC = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `（${detail}）` : ''}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

async function svcRest(method, restPath, body) {
  const res = await fetch(`${SB}${restPath}`, {
    method, headers: { ...SVC, Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

let serverProc = null;
async function startServer() {
  serverProc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DEPLOY_RUN_PORT: String(PORT) },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) return; } catch { /* 未起 */ }
    await sleep(200);
  }
  throw new Error('server.js 启动超时');
}

function staticAsserts() {
  console.log('== A. 静态锚点 ==');
  const app = read('js/app.js');
  check('A1a itemIconImgHtml（装备分配/心愿单列表）= render CDN + onerror 占位回退 + 空值不渲染',
    /function itemIconImgHtml\(name, raid, boss\) \{\s*const id = getItemIconId\(name, raid, boss\);\s*return id \? `<img class="loot-item-icon" src="https:\/\/render\.worldofwarcraft\.com\/icons\/56\/\$\{id\}\.jpg" loading="lazy" alt="" onerror="this\.onerror=null;this\.src='assets\/decor-icons\/_placeholder\.png'">` : '';/.test(app), '');
  check('A1b 拾取记录表格图标同链路（icon_id 直出，无本地路径残留）',
    /`<img class="loot-item-icon" src="https:\/\/render\.worldofwarcraft\.com\/icons\/56\/\$\{d\.icon_id\}\.jpg"/.test(app) &&
    !/src="assets\/icons\/items\//.test(app), '');

  const cnt = (f, s) => (read(f).match(new RegExp(s.replace(/\./g, '\\.'), 'g')) || []).length;
  check('A2a 版本串 ' + VER + ' 三壳递增（index 15 / data 8 / decor 5）',
    cnt('index.html', VER) === 15 && cnt('data.html', VER) === 8 && cnt('decor.html', VER) === 5,
    `index=${cnt('index.html', VER)} data=${cnt('data.html', VER)} decor=${cnt('decor.html', VER)}`);
  check('A2b 旧串 20261015.99 三壳零残留',
    cnt('index.html', '20261015.99') === 0 && cnt('data.html', '20261015.99') === 0 && cnt('decor.html', '20261015.99') === 0, '');
  check('A3 changelog 补录（v3.2.0-task80-list-icon-cdn）+ 台账 REQ-169',
    app.includes("id: 'v3.2.0-task80-list-icon-cdn'") && /\| REQ-169 \|/.test(read('docs/问题与需求清单.md')), '');

  const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f).concat(['server.js']);
  let allOk = true, bad = '';
  for (const f of jsFiles) {
    const r = spawnSync(process.execPath, ['--check', f], { cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) { allOk = false; bad = f; }
  }
  check('A4 node --check 全量通过（js/ 全部 + server.js）', allOk, bad);
  check('A5 renderCurrentPage loot/wishlist 均有 init 完成后补渲钩子（首渲染无图标时序修复）',
    (app.match(/MasterData\.init\(\)\.then\(\(\) => \{/g) || []).length >= 2 &&
    /data-page'\) === 'loot'\) lootRender\(\);/.test(app) &&
    /data-page'\) === 'wishlist'\) wishlistRender\(\);/.test(app), '');
}

let testUid = null, guildId = null;

async function ensureTestUser() {
  const list = await svcRest('GET', '/auth/v1/admin/users?page=1&per_page=500');
  const users = (list.body && (list.body.users || list.body)) || [];
  const hit = Array.isArray(users) ? users.find(u => (u.email || '').toLowerCase() === EMAIL) : null;
  if (hit) return hit.id;
  const c = await svcRest('POST', '/auth/v1/admin/users', { email: EMAIL, password: PWD, email_confirm: true, user_metadata: { display_name: 't80-exp' } });
  return c.body && c.body.id;
}

async function liveAsserts() {
  console.log('== B. 浏览器实测 ==');
  testUid = await ensureTestUser();
  if (!testUid) { check('B-前置 测试账号就位', false); return; }
  const oldG = await svcRest('GET', `/rest/v1/guilds?name=eq.${encodeURIComponent(GUILD_NAME)}&select=id`);
  for (const g of (Array.isArray(oldG.body) ? oldG.body : [])) {
    await svcRest('DELETE', `/rest/v1/loot_records?guild_id=eq.${g.id}`);
    await svcRest('DELETE', `/rest/v1/loot_drops?guild_id=eq.${g.id}`);
    await svcRest('DELETE', `/rest/v1/raid_members?guild_id=eq.${g.id}`);
    await svcRest('DELETE', `/rest/v1/guild_members?guild_id=eq.${g.id}`);
    await svcRest('DELETE', `/rest/v1/guilds?id=eq.${g.id}`);
  }
  const g = await svcRest('POST', '/rest/v1/guilds', { name: GUILD_NAME, owner_id: testUid, invite_code: 'T80EXP01', server_name: '测试', server_region: '一区' });
  guildId = g.body && g.body[0] && g.body[0].id;
  await svcRest('POST', '/rest/v1/guild_members', [{ guild_id: guildId, user_id: testUid, role: 'owner', display_name: 't80-exp' }]);
  const m = await svcRest('POST', '/rest/v1/raid_members', { guild_id: guildId, name: MEMBER_NAME, class: '战士', spec: '', role: '输出', status: '正式' });
  const memberId = m.body && m.body[0] && m.body[0].id;
  // 主数据在库装备（基希克斯破封，#78 已入库，icon_id=7350841）
  await svcRest('POST', '/rest/v1/loot_records', {
    guild_id: guildId, character_id: memberId, member_name: MEMBER_NAME, assigned_by: testUid,
    item_name: ITEM_NAME, item_category: '武器', item_slot: '双手', item_level: 0,
    raid_name: '基希克斯破封', boss_name: '基希克斯', difficulty: '史诗',
    distribution_method: 'custom', player_action: 'none', is_wishlist: false,
    item_stats: { category: '武器', primaryStat: '力量', secondaryStats: [], specialEffect: '', assignedTo: MEMBER_NAME, status: '待分配', priority: 'P2' },
  });
  await svcRest('POST', '/rest/v1/loot_drops', {
    guild_id: guildId, player_name: MEMBER_NAME, item_name: ITEM_NAME, official_item_id: 280799,
    icon_id: ICON_ID, quality: 4, slot: '双手', slot_cn: '双手剑', item_type: '双手剑',
    boss_name: '基希克斯', instance_name: '基希克斯破封', difficulty: '史诗',
    timestamp: '2026-10-17T08:00:00Z', source: 'plugin',
  });
  check('B-前置 测试公会 + 装备分配记录 + 拾取记录就位（icon_id=7350841）', !!guildId, '');

  await startServer();
  console.log('--- 服务器已起（端口 ' + PORT + '） ---');

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const pg = await ctx.newPage();
  const errs = [], typeErrors = [], whitelist = [];
  const localItemReqs = [];
  pg.on('pageerror', e => {
    errs.push('pageerror: ' + e.message);
    if (e instanceof TypeError || /TypeError/.test(String(e && e.name))) typeErrors.push(`${e.message}\n${e.stack || ''}`);
  });
  pg.on('console', m => {
    if (m.type() !== 'error') return;
    errs.push('console: ' + m.text());
    if (/TypeError/.test(m.text())) typeErrors.push('console: ' + m.text());
  });
  pg.on('request', r => { if (/\/assets\/icons\/items\//.test(r.url())) localItemReqs.push(r.url()); });
  pg.on('response', r => {
    if (r.status() >= 400) {
      const u = r.url();
      if (/assets\/decor-icons\//.test(u)) { whitelist.push(u); return; }
      errs.push(`http${r.status()} ${r.request().method()} ${u}`);
    }
  });

  await pg.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await pg.waitForSelector('#iaLoginBtn', { state: 'visible', timeout: 15000 });
  await pg.click('#iaLoginBtn');
  await pg.fill('#authEmail', EMAIL);
  await pg.fill('#authPassword', PWD);
  await pg.click('#authLoginBtn');
  await pg.waitForURL('**/index.html#/home', { timeout: 30000 });
  check('B-前置 登录成功落 #/home', true, '');

  // B1 装备分配列表图标
  await pg.goto(`${BASE}/index.html#/team/loot`, { waitUntil: 'load' });
  await pg.waitForSelector('#lootTableBody .loot-item-icon', { timeout: 30000 });
  await sleep(1200);
  const b1 = await pg.evaluate(() => {
    const img = document.querySelector('#lootTableBody .loot-item-icon');
    return img ? { src: img.src, loaded: img.complete && img.naturalWidth > 0 } : null;
  });
  check('B1 装备分配列表图标 = render CDN（7350841）且真实加载成功',
    !!b1 && b1.src.includes(`render.worldofwarcraft.com/icons/56/${ICON_ID}.jpg`) && b1.loaded, JSON.stringify(b1));

  // B2 拾取记录表格图标
  await pg.click('#lootViewTabs .view-tab[data-lootview="drops"]');
  await pg.waitForSelector('#lootDropsTableBody .loot-item-icon', { timeout: 30000 });
  await sleep(600);
  const b2 = await pg.evaluate(() => {
    const img = document.querySelector('#lootDropsTableBody .loot-item-icon');
    return img ? { src: img.src, loaded: img.complete && img.naturalWidth > 0 } : null;
  });
  check('B2 拾取记录表格图标同链路加载成功', !!b2 && b2.src.includes(`render.worldofwarcraft.com/icons/56/${ICON_ID}.jpg`) && b2.loaded, JSON.stringify(b2));

  // B3 无本地装备图标请求
  check('B3 无本地 /assets/icons/items/ 请求（旧 404 通道消失）', localItemReqs.length === 0, `本地请求=${localItemReqs.length}`);

  // B4 拦截 CDN 全断 → onerror 回退占位图
  await pg.route('**/render.worldofwarcraft.com/icons/56/*', route => route.abort());
  await pg.reload({ waitUntil: 'load' });
  // reload 后 lootViewMode 复位为 assign，需先切回拾取记录标签
  await pg.click('#lootViewTabs .view-tab[data-lootview="drops"]');
  await pg.waitForSelector('#lootDropsTableBody .loot-item-icon', { timeout: 30000 });
  await sleep(1000);
  const b4 = await pg.evaluate(() => {
    const imgs = [...document.querySelectorAll('.loot-item-icon')];
    const ph = imgs.filter(i => i.src.includes('_placeholder.png'));
    return { n: imgs.length, placeholders: ph.length, phLoaded: ph.filter(i => i.complete && i.naturalWidth > 0).length };
  });
  check('B4 拦截 CDN 全断 → onerror 回退 _placeholder.png 且占位图加载成功',
    b4.placeholders > 0 && b4.phLoaded === b4.placeholders, JSON.stringify(b4));
  await pg.unroute('**/render.worldofwarcraft.com/icons/56/*');

  check('B5a 全程零 TypeError', typeErrors.length === 0, typeErrors.slice(0, 2).join(' | ').slice(0, 300));
  const real = errs.filter(e => {
    if (/assets\/decor-icons\//.test(e)) return false;
    if (/render\.worldofwarcraft\.com/.test(e)) return false;
    if (/user_profiles/.test(e) && e.includes('409')) return false; // ensureTagNum 409 撞号重试（任务书 #54 起设计内噪音）
    if (e.includes('Failed to load resource') && !e.includes('401')) return false;
    return true;
  });
  check('B5b 全程 console 零报错（白名单：decor 缺图/B4 拦截模拟故障）', real.length === 0, real.slice(0, 3).join(' | ').slice(0, 300));

  await browser.close();
}

async function cleanup() {
  console.log('== C. 清零 ==');
  if (guildId) {
    await svcRest('DELETE', `/rest/v1/loot_records?guild_id=eq.${guildId}`);
    await svcRest('DELETE', `/rest/v1/loot_drops?guild_id=eq.${guildId}`);
    await svcRest('DELETE', `/rest/v1/raid_members?guild_id=eq.${guildId}`);
    await svcRest('DELETE', `/rest/v1/guild_members?guild_id=eq.${guildId}`);
    await svcRest('DELETE', `/rest/v1/guilds?id=eq.${guildId}`);
  }
  if (testUid) await svcRest('DELETE', `/auth/v1/admin/users/${testUid}`);
  const lr = guildId ? await svcRest('GET', `/rest/v1/loot_records?guild_id=eq.${guildId}&select=id`) : { body: [] };
  const g = await svcRest('GET', `/rest/v1/guilds?name=eq.${encodeURIComponent(GUILD_NAME)}&select=id`);
  const u = await svcRest('GET', '/auth/v1/admin/users?page=1&per_page=500');
  const users = Array.isArray((u.body && (u.body.users || u.body)) || []) ? (u.body.users || u.body) : [];
  check('C1 测试记录/公会/账号清零复核',
    (!Array.isArray(lr.body) || lr.body.length === 0) &&
    (!Array.isArray(g.body) || g.body.length === 0) &&
    !users.some(x => (x.email || '').toLowerCase() === EMAIL),
    `loots=${Array.isArray(lr.body) ? lr.body.length : '?'} guilds=${Array.isArray(g.body) ? g.body.length : '?'}`);
}

(async () => {
  staticAsserts();
  try {
    await liveAsserts();
  } catch (e) {
    check('B 浏览器实测执行', false, e.message);
  } finally {
    if (serverProc) serverProc.kill();
    await cleanup();
  }
  const fails = results.filter(r => !r.ok);
  console.log(`\n===== 结果：${results.length - fails.length}/${results.length} 通过 =====`);
  process.exit(fails.length ? 1 : 0);
})();
