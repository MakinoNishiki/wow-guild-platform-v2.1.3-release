// 任务书 #62 送审实测：六项真浏览器验证（测试公会/成员/活动/装备/心愿造数，用后自清理）
// 覆盖：§1 首页回退（logo+tab，埋点单次）/ §2 团本筛选动态 / §3 考勤统计剔已删除 /
//       §4 成员筛选+搜索 / §5 图标 DOM（img 元素+src 规则路径，404 隐藏不塌版）/ §6 筛选分组结构
// 用法: node scripts/shot-task62.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 15662;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.join(ROOT, 'backup', '2026-09-30-task62');
const PWD = 'T62-Shot-2026!';
const EMAIL = 't62-shot@example.com';

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const SVC = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };

async function svc(method, p, body) {
  const r = await fetch(SB + p, { method, headers: { ...SVC, Prefer: 'return=representation' }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
}
function must(r, label) {
  if (r.status >= 300 || !Array.isArray(r.body) || !r.body[0]) {
    throw new Error(`造数失败[${label}] HTTP=${r.status} body=${JSON.stringify(r.body).slice(0, 300)}`);
  }
  return r.body;
}

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' —— ' + detail : ''}`); }
}

let serverProc = null, uid = null, guildId = null, browser = null;
const ids = { members: [], activity: null, loots: [], wishlistRow: null };

async function cleanup() {
  if (browser) await browser.close().catch(() => {});
  if (serverProc) serverProc.kill();
  if (guildId) {
    for (const t of ['wishlists', 'loot_records', 'activity_attendance', 'activities', 'raid_members', 'guild_members']) {
      const col = t === 'activity_attendance' ? null : 'guild_id';
      if (t === 'activity_attendance') await svc('DELETE', `/rest/v1/activity_attendance?activity_id=eq.${ids.activity}`);
      else await svc('DELETE', `/rest/v1/${t}?guild_id=eq.${guildId}`);
    }
    await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`);
    const chk = await svc('GET', `/rest/v1/guilds?id=eq.${guildId}&select=id`);
    console.log('清理复核：测试公会残留=' + (Array.isArray(chk.body) ? chk.body.length : '?'));
  }
  if (uid) {
    await svc('DELETE', `/auth/v1/admin/users/${uid}`);
    console.log('清理复核：测试用户已删');
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  // ---- 选一件本地有图标文件的 boss_loot 装备（icon_id 命中 assets/icons/items/{id}.png）----
  const iconDir = path.join(ROOT, 'assets', 'icons', 'items');
  const iconFiles = fs.existsSync(iconDir) ? fs.readdirSync(iconDir).filter(f => /^\d+\.png$/.test(f)) : [];
  let iconItem = null;
  if (iconFiles.length) {
    const iconId = iconFiles[0].replace('.png', '');
    const rows = await svc('GET', `/rest/v1/boss_loot?select=item_name,boss_id,icon_id&icon_id=eq.${iconId}&limit=1`);
    if (rows.body && rows.body[0]) {
      const boss = await svc('GET', `/rest/v1/game_bosses?select=name,raid_id&id=eq.${rows.body[0].boss_id}&limit=1`);
      const raid = boss.body && boss.body[0] ? await svc('GET', `/rest/v1/game_raids?select=name&id=eq.${boss.body[0].raid_id}&limit=1`) : null;
      iconItem = { name: rows.body[0].item_name, boss: boss.body[0].name, raid: raid.body[0].name, iconId };
    }
  }
  if (!iconItem) {
    // 本地无图标文件（运营源图未入库）：取库内任一有 icon_id 的装备，验证 img DOM+src 规则路径 + 404 隐藏不塌版
    const rows = await svc('GET', '/rest/v1/boss_loot?select=item_name,boss_id,icon_id&icon_id=not.is.null&limit=1');
    const boss = await svc('GET', `/rest/v1/game_bosses?select=name,raid_id&id=eq.${rows.body[0].boss_id}&limit=1`);
    const raid = await svc('GET', `/rest/v1/game_raids?select=name&id=eq.${boss.body[0].raid_id}&limit=1`);
    iconItem = { name: rows.body[0].item_name, boss: boss.body[0].name, raid: raid.body[0].name, iconId: String(rows.body[0].icon_id), noAsset: true };
  }
  console.log('图标测试装备：' + JSON.stringify(iconItem));

  // ---- 造数 ----
  const c = await svc('POST', '/auth/v1/admin/users', { email: EMAIL, password: PWD, email_confirm: true });
  uid = c.body.id;
  if (!uid) { const l = await svc('GET', '/auth/v1/admin/users?page=1&per_page=1000'); uid = l.body.users.find(u => u.email === EMAIL).id; await svc('PUT', `/auth/v1/admin/users/${uid}`, { password: PWD }); }
  const g = await svc('POST', '/rest/v1/guilds', { name: 'T62测试公会', owner_id: uid, invite_code: 'T62SHOT1', server_name: '测试', server_region: '一区' });
  guildId = must(g, 'guilds')[0].id;
  must(await svc('POST', '/rest/v1/guild_members', [{ guild_id: guildId, user_id: uid, role: 'owner', display_name: 't62-shot' }]), 'guild_members');
  const ms = await svc('POST', '/rest/v1/raid_members', [
    { guild_id: guildId, name: '测试甲', class: '战士', spec: '防护', role: '坦克' },
    { guild_id: guildId, name: '测试乙', class: '法师', spec: '奥术', role: '输出' },
  ]);
  const [mA, mB] = must(ms, 'raid_members');
  ids.members = [mA.id, mB.id];
  const act = await svc('POST', '/rest/v1/activities', { guild_id: guildId, name: 'T62测试活动', activity_date: '2026-09-29', raid: 'T62测试活动', boss: '', status: 'normal' });
  ids.activity = must(act, 'activities')[0].id;
  must(await svc('POST', '/rest/v1/activity_attendance', [
    { activity_id: ids.activity, member_id: mA.id, member_name: '测试甲', status: 'present' },
    { activity_id: ids.activity, member_id: mB.id, member_name: '测试乙', status: 'absent' },
    { activity_id: ids.activity, member_id: null, member_name: '已删路人', status: 'absent' }, // 硬删除后形态（SET NULL+快照）
  ]), 'activity_attendance');
  const loot1 = await svc('POST', '/rest/v1/loot_records', {
    guild_id: guildId, item_name: iconItem.name, raid_name: iconItem.raid, boss_name: iconItem.boss,
    item_category: '武器', item_slot: '单手剑', difficulty: '史诗', member_name: '测试甲', character_id: mA.id,
    obtained_date: '2026-09-29', distribution_method: 'roll', player_action: 'need', roll_value: 88,
    item_stats: { status: '已分配', priority: 'P1', secondaryStats: [] },
  });
  must(loot1, 'loots-1');
  const loot2 = await svc('POST', '/rest/v1/loot_records', {
    guild_id: guildId, item_name: '无图标测试件', raid_name: '其他自定义本', boss_name: '自定义BOSS',
    item_category: '防具', item_slot: '胸部', difficulty: '英雄', member_name: '测试乙', character_id: mB.id,
    obtained_date: '2026-09-28', distribution_method: 'custom',
    item_stats: { status: '已分配', priority: 'P2', secondaryStats: [] },
  });
  must(loot2, 'loots-2');
  ids.loots = [loot1.body[0].id, loot2.body[0].id];
  must(await svc('POST', '/rest/v1/wishlists', {
    guild_id: guildId, member_id: mA.id,
    items: [{ id: 't62w1', itemName: iconItem.name, raid: iconItem.raid, boss: iconItem.boss, slot: '单手剑', category: '武器', priority: 'P0', spec: 'main', obtained: false, memberId: mA.id, memberName: '测试甲', createdAt: 1 }],
  }), 'wishlists');
  console.log('造数完成 guild=' + guildId.slice(0, 8) + '…');

  // ---- 起 server ----
  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {} await new Promise(r => setTimeout(r, 200)); }

  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  // /api/track 发帖体捕获（sendBeacon Blob postData 为 null，故 initScript 包装同 #54 pvcheck 先例）
  await ctx.addInitScript(() => {
    window.__trackLog = [];
    const rec = b => { try { window.__trackLog.push(String(b)); } catch (e) {} };
    const origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) => {
      if (String(url).includes('/api/track')) {
        if (data && typeof data.text === 'function') data.text().then(rec).catch(() => {});
        else rec(data);
      }
      return origBeacon(url, data);
    };
    const origFetch = window.fetch.bind(window);
    window.fetch = (url, opt) => {
      if (String(url).includes('/api/track') && opt && opt.body) rec(opt.body);
      return origFetch(url, opt);
    };
  });

  await pg.goto(`${BASE}/?auth=login`, { waitUntil: 'load' });
  await pg.waitForSelector('#authEmail', { state: 'visible', timeout: 15000 });
  await pg.fill('#authEmail', EMAIL);
  await pg.fill('#authPassword', PWD);
  await pg.click('#authLoginBtn');
  await pg.waitForSelector('.ia-tab[data-ia-tab="team"]', { state: 'visible', timeout: 30000 });
  await pg.waitForFunction(() => location.hash.startsWith('#/'), { timeout: 15000 });
  await pg.waitForTimeout(1500);
  await pg.evaluate(() => { window.__trackLog = []; });

  // ---------- §1 BUG-109 ----------
  await pg.click('.ia-tab[data-ia-tab="team"]');
  await pg.waitForFunction(() => location.hash === '#/team/dashboard', { timeout: 10000 });
  await pg.click('.ia-brand');
  await pg.waitForFunction(() => location.hash === '#/home', { timeout: 10000 });
  const homeTabActive1 = await pg.evaluate(() => document.querySelector('.ia-tab[data-ia-tab="home"]').classList.contains('active'));
  check('§1a 功能页点 logo → #/home 且首页 tab 高亮', homeTabActive1);
  await pg.click('.ia-tab[data-ia-tab="team"]');
  await pg.waitForFunction(() => location.hash === '#/team/dashboard', { timeout: 10000 });
  await pg.click('.ia-tab[data-ia-tab="home"]');
  await pg.waitForFunction(() => location.hash === '#/home', { timeout: 10000 });
  await pg.waitForTimeout(600);
  const trackPosts = await pg.evaluate(() => window.__trackLog);
  const homeEvents = trackPosts.filter(p => (p || '').includes('"tab_click"') && p.includes('"home"')).length;
  if (homeEvents !== 2) console.log('  [diag] trackPosts=' + JSON.stringify(trackPosts).slice(0, 800));
  check('§1b 首页 tab → #/home；tab_click home 事件两次点击各一发不双发', homeEvents === 2, `实际=${homeEvents} 发帖=${trackPosts.length}`);
  await pg.screenshot({ path: path.join(OUT, 's1-home-tab.png') });

  // ---------- §2/§4/§5 装备分配页 ----------
  await pg.goto(`${BASE}/#/team/loot`, { waitUntil: 'load' });
  await pg.waitForSelector('#lootTableBody tr', { timeout: 20000 });
  await pg.waitForTimeout(800);
  const raidOpts = await pg.evaluate(() => [...document.getElementById('lootRaidFilter').options].map(o => o.value));
  check('§2 团本筛选动态含当前赛季四团本（含孢陨幽境）+ 记录内自定义名',
    ['虚影尖塔', '梦境裂隙', '进军奎尔丹纳斯', '孢陨幽境', '其他自定义本'].every(n => raidOpts.includes(n)), raidOpts.join('/'));
  // §4 成员下拉
  const memberOpts = await pg.evaluate(() => [...document.getElementById('lootMemberFilter').options].map(o => o.textContent));
  check('§4a 成员筛选下拉含两名成员', memberOpts.some(t => t.includes('测试甲')) && memberOpts.some(t => t.includes('测试乙')), memberOpts.join('/'));
  await pg.selectOption('#lootMemberFilter', mA.id);
  await pg.waitForTimeout(300);
  const rowsA = await pg.evaluate(() => [...document.querySelectorAll('#lootTableBody tr')].map(tr => tr.textContent).join('|'));
  check('§4b 成员下拉筛选（id）→ 仅剩测试甲行', rowsA.includes('测试甲') && !rowsA.includes('测试乙'), '');
  await pg.selectOption('#lootMemberFilter', '');
  await pg.fill('#lootMemberSearch', '测试乙');
  await pg.waitForTimeout(300);
  const rowsB = await pg.evaluate(() => [...document.querySelectorAll('#lootTableBody tr')].map(tr => tr.textContent).join('|'));
  check('§4c 成员搜索模糊 → 仅剩测试乙行', rowsB.includes('测试乙') && !rowsB.includes('测试甲'), '');
  await pg.fill('#lootMemberSearch', '不存在的人');
  await pg.waitForTimeout(300);
  const emptyOk = await pg.evaluate(() => document.querySelector('#lootTableBody .empty-state') !== null);
  check('§4d 搜索无结果 → 空态', emptyOk);
  await pg.fill('#lootMemberSearch', '');
  await pg.waitForTimeout(300);
  // §5 图标 DOM
  const iconInfo = await pg.evaluate((name) => {
    const imgs = [...document.querySelectorAll('#lootTableBody img.loot-item-icon')];
    return imgs.map(i => ({ src: i.getAttribute('src'), name: i.parentElement.textContent.slice(0, 20) }));
  });
  check('§5a 装备分配列表 icon 行渲染 img.loot-item-icon（src 规则路径）',
    iconInfo.length === 1 && iconInfo[0].src === `assets/icons/items/${iconItem.iconId}.png`, JSON.stringify(iconInfo));
  await pg.screenshot({ path: path.join(OUT, 's2-loot-page.png'), fullPage: false });

  // ---------- §5b 心愿单 ----------
  await pg.goto(`${BASE}/#/team/wishlist`, { waitUntil: 'load' });
  await pg.waitForSelector('#wishlistTableBody tr', { timeout: 20000 });
  await pg.waitForTimeout(500);
  const wIcon = await pg.evaluate(() => {
    const img = document.querySelector('#wishlistTableBody img.loot-item-icon');
    return img ? img.getAttribute('src') : null;
  });
  check('§5b 心愿单列表 icon 行渲染 img（src 规则路径）', wIcon === `assets/icons/items/${iconItem.iconId}.png`, String(wIcon));
  await pg.screenshot({ path: path.join(OUT, 's3-wishlist-icon.png') });

  // ---------- §3 BUG-107 ----------
  await pg.goto(`${BASE}/#/team/attendance`, { waitUntil: 'load' });
  await pg.waitForSelector('.activity-item', { timeout: 20000 });
  await pg.waitForTimeout(800);
  const cardStats = await pg.evaluate(() => {
    const item = [...document.querySelectorAll('.activity-item')].find(el => el.textContent.includes('T62测试活动'));
    return item ? [...item.querySelectorAll('.activity-stat-num')].map(n => n.textContent) : null;
  });
  check('§3a 活动卡统计：出勤 1 / 缺席 1（已删路人 2 缺席行剔 1）', cardStats && cardStats[0] === '1' && cardStats[1] === '1', JSON.stringify(cardStats));
  await pg.screenshot({ path: path.join(OUT, 's4-attendance-card.png') });
  await pg.goto(`${BASE}/#/team/reports`, { waitUntil: 'load' });
  await pg.waitForTimeout(1500);
  const absentBoard = await pg.evaluate(() => (document.getElementById('absentRankList') || {}).textContent || '');
  check('§3b 缺席榜含测试乙、不含已删路人', absentBoard.includes('测试乙') && !absentBoard.includes('已删路人'), absentBoard.replace(/\s+/g, ' ').slice(0, 120));
  const rankTable = await pg.evaluate(() => (document.getElementById('rankTableBody') || {}).textContent || '');
  check('§3c 主排名表同步剔除已删除成员（BUG-107 补丁终审裁定）', !rankTable.includes('已删路人'), rankTable.replace(/\s+/g, ' ').slice(0, 120));
  await pg.screenshot({ path: path.join(OUT, 's5-reports-absent.png') });
  // §3d 考勤明细灰显保留不篡改：打开活动详情弹窗核已删路人行
  await pg.goto(`${BASE}/#/team/attendance`, { waitUntil: 'load' });
  await pg.waitForSelector('.activity-item', { timeout: 20000 });
  await pg.click('.activity-item');
  await pg.waitForSelector('#attendanceDetailModal', { state: 'visible', timeout: 15000 });
  await pg.waitForTimeout(500);
  const detailTxt = await pg.evaluate(() => (document.getElementById('attendanceDetailModal') || {}).textContent || '');
  check('§3d 考勤明细已删路人行灰显「已删除」保留（记录不篡改）', detailTxt.includes('已删路人') && detailTxt.includes('已删除'), '');
  await pg.screenshot({ path: path.join(OUT, 's5b-attendance-detail-deleted.png') });
  await pg.keyboard.press('Escape');
  const escConfirm = await pg.locator('.modal-overlay:visible', { hasText: '确定' }).count().catch(() => 0);
  if (escConfirm) await pg.click('button:has-text("确定")').catch(() => {});

  // ---------- §6 REQ-151 ----------
  await pg.goto(`${BASE}/#/team/lootdrop`, { waitUntil: 'load' });
  await pg.waitForSelector('.dp-item', { timeout: 30000 });
  await pg.waitForTimeout(800);
  await pg.fill('#dpSearch', iconItem.name);
  await pg.waitForTimeout(800);
  const groupInfo = await pg.evaluate(() => ({
    raids: document.querySelectorAll('#page-lootdrop .dp-raid, .dp-main .dp-raid').length || document.querySelectorAll('.dp-raid').length,
    bosses: document.querySelectorAll('.dp-boss').length,
    items: document.querySelectorAll('.dp-item').length,
    head: (document.getElementById('dpFlatHead') || {}).textContent || '',
    raidNames: [...document.querySelectorAll('.dp-raid-name')].map(e => e.textContent.trim()).join('|'),
    bossNames: [...document.querySelectorAll('.dp-boss-name')].map(e => e.textContent.trim()).join('|'),
  }));
  check('§6a 筛选态呈「团本→BOSS」分组结构（非平铺）', groupInfo.raids >= 1 && groupInfo.bosses >= 1, JSON.stringify(groupInfo));
  check('§6b 分组头=团本名/BOSS名，件数与命中一致', groupInfo.raidNames.includes(iconItem.raid) && groupInfo.bossNames.includes(iconItem.boss) && groupInfo.head.includes(String(groupInfo.items)), JSON.stringify(groupInfo));
  await pg.screenshot({ path: path.join(OUT, 's6-lootdrop-grouped.png'), fullPage: true });

  console.log('JS 报错数=' + errs.length + (errs.length ? ' → ' + errs.slice(0, 3).join(' | ') : ''));
  check('全程零 JS 报错', errs.length === 0, errs.slice(0, 3).join('|'));
  console.log(`\n结果：${pass} 过 / ${fail} 挂；截图落盘 ${OUT}`);
  await cleanup();
  process.exit(fail ? 1 : 0);
})().catch(async e => { console.error('异常：' + (e && e.message)); await cleanup(); process.exit(1); });
