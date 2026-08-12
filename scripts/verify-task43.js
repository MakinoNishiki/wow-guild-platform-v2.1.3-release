// 任务书 #43 验证：REQ-098 右栏悬浮筛选面板 + 毒咒筛选维度（= 任务书 #30 全文 + 增补合并）
// 覆盖（任务书 #30 §三 + #43 §四 verify 口径）：
//   ① 面板态（≥1400）：fixed 定位、264px 框体完整四边闭合（四边框 computed）、控件矩形全在面板内零裁切、
//      独立纵向滚动、--dp-panel-top 壳级顶偏、卡片区让位 margin-right、1920 卡片 ≥4 列；
//   ② 折叠顶栏态（<1400）：首行恒显（搜索/重置/命中计数/筛选▾）、折叠展开双向、sessionStorage 记忆、
//      登录壳吸顶 56px；
//   ③ 两态一套 DOM（同 id 集合、毒咒组两态均在）；层级规约 面板 z=10＞hover 卡 z=5（elementFromPoint 断言）；
//   ④ 毒咒组：全部/有毒咒单选、真实毒咒行过滤（T43 样本 1 件）、0 命中态「命中 0 件 · 1 项生效」不报错不白屏、
//      重置复位、词表=LootTaxonomy.VENOMCURSE_LABEL；
//   ⑤ 筛选语义零改动回归：力敏 AND、来源单选、命中计数口径；
//   ⑥ 双壳（公开 data.html / 登录壳 #page-lootdrop）× 1366/1920；版本串两壳 .55；308 基线零漂移；
//      主应用 9 页签零回归；三角色可读（viewer 实测）。
// 测试数据（T43 前缀掉落行 + t43- 测试用户/公会）终清理并复核为零。
// 用法: node scripts/verify-task43.js（PW_CHANNEL=chrome 可选）
// 截图输出 backup/2026-08-12-task43/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-12-task43');
const PORT = 15721;
const BASE = `http://localhost:${PORT}`;
const PWD = 'T43-Test-2026!';
const EMAIL = 't43-user@wowbutler.cn';
const ITEM_VENOM = 'T43毒咒筛选之刃';
const BASELINE = { total: 308, raid: 104, dungeon: 204 };

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
async function rpcPublic() {
  const res = await fetch(`${SB}/rest/v1/rpc/get_public_loot_detail`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }, body: '{}',
  });
  return { status: res.status, body: await res.json() };
}

let serverProc = null, userU = null, guildId = null, currentSeasonId = null, testBossId = null;

async function setup() {
  await svc('DELETE', `/rest/v1/boss_loot?item_name=like.T43*`);
  const oldG = await svc('GET', `/rest/v1/guilds?select=id&name=like.T43*`);
  for (const g of (Array.isArray(oldG.body) ? oldG.body : [])) await svc('DELETE', `/rest/v1/guilds?id=eq.${g.id}`);
  const lu = await fetch(`${SB}/auth/v1/admin/users?per_page=50`, { headers: SVC });
  const lj = await lu.json();
  const hit = (lj.users || []).find(u => u.email === EMAIL);
  if (hit) await fetch(`${SB}/auth/v1/admin/users/${hit.id}`, { method: 'DELETE', headers: SVC });

  const cs = await svc('GET', '/rest/v1/game_seasons?select=id,is_current,start_date&order=start_date.asc');
  const cur = cs.body.find(s => s.is_current) || cs.body[cs.body.length - 1];
  currentSeasonId = cur.id;
  const raids = await svc('GET', `/rest/v1/game_raids?select=id&season_id=eq.${currentSeasonId}&type=neq.world&limit=1`);
  const bosses = await svc('GET', `/rest/v1/game_bosses?select=id&raid_id=eq.${raids.body[0].id}&limit=1`);
  testBossId = bosses.body[0].id;

  let res = await fetch(`${SB}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PWD, data: { display_name: 'T43成员' } }),
  });
  let body = await res.json();
  if (!body.access_token) {
    res = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PWD }),
    });
    body = await res.json();
  }
  userU = { uid: body.user.id };
  const g = await svc('POST', '/rest/v1/guilds', { name: 'T43面板会', owner_id: userU.uid, invite_code: 'T43A' + Date.now().toString(36).slice(-4).toUpperCase() });
  guildId = g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', [{ guild_id: guildId, user_id: userU.uid, role: 'viewer', display_name: 'T43成员' }]);

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }
}
async function cleanup() {
  const steps = [];
  try { const r = await svc('DELETE', `/rest/v1/boss_loot?item_name=like.T43*`); steps.push(`boss:${r.status}`); } catch { steps.push('boss:ERR'); }
  if (guildId) { try { const r = await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`); steps.push(`guild:${r.status}`); } catch { steps.push('guild:ERR'); } }
  if (userU) { try { await fetch(`${SB}/auth/v1/admin/users/${userU.uid}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); } }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const c1 = await svc('GET', `/rest/v1/boss_loot?select=id&item_name=like.T43*`);
  const c2 = await svc('GET', `/rest/v1/guilds?select=id&name=like.T43*`);
  check('[清理复核] T43 前缀掉落/公会全 0', c1.body.length === 0 && c2.body.length === 0, `boss=${c1.body.length} guild=${c2.body.length}`);
}
async function login(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
  await page.fill('#authEmail', EMAIL);
  await page.fill('#authPassword', PWD);
  await page.click('#authLoginBtn');
  await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
  await sleep(1500);
}
// 面板态断言集（scope：公开壳 '' / 登录壳 '#page-lootdrop '）
async function panelAsserts(page, scope, tag) {
  return page.evaluate((scope) => {
    const q = s => document.querySelector(scope + s);
    const bar = q('#dpFilterBar');
    const cs = getComputedStyle(bar);
    const pr = bar.getBoundingClientRect();
    const within = [];
    ['#dpSearch', '#dpResetFilters', '#dpFlatHead'].forEach(s => {
      const r = q(s).getBoundingClientRect();
      if (r.left < pr.left - 0.6 || r.right > pr.right + 0.6 || r.top < pr.top - 0.6 || r.bottom > pr.bottom + 0.6) within.push(s);
    });
    const firstRowTops = new Set();
    const items = [...document.querySelectorAll(scope + '#dpMain .dp-item')];
    const y0 = items.length ? items[0].getBoundingClientRect().top : 0;
    const cols = items.filter(c => Math.abs(c.getBoundingClientRect().top - y0) < 2).length;
    return {
      pos: cs.position, width: cs.width, z: cs.zIndex,
      bt: cs.borderTopWidth, br: cs.borderRightWidth, bb: cs.borderBottomWidth, bl: cs.borderLeftWidth,
      radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, oy: cs.overflowY,
      titleShown: q('.dp-panel-title') && getComputedStyle(q('.dp-panel-title')).display !== 'none' && q('.dp-panel-title').textContent === '筛选',
      toggleHidden: getComputedStyle(q('#dpFilterToggle')).display === 'none',
      rowsShown: getComputedStyle(q('#dpFilterRows')).display !== 'none',
      outOfBox: within,
      mainMarginRight: parseInt(getComputedStyle(q('#dpMain')).marginRight, 10),
      cols,
      venomAfterSource: q('#dpSourceGroup').compareDocumentPosition(q('#dpVenomGroup')) === Node.DOCUMENT_POSITION_FOLLOWING,
      flatHead: q('#dpFlatHead').innerText,
    };
  }, scope);
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await setup();

  // ==================== A. 基线与版本串 ====================
  const rpc0 = await rpcPublic();
  const s1 = rpc0.body.filter(r => r.season_id === currentSeasonId);
  const baseline = { total: s1.length, raid: s1.filter(r => r.source === 'raid').length, dungeon: s1.filter(r => r.source === 'dungeon').length };
  check('A1 公示页 308 基线（S1 全部/团本/大秘境）', baseline.total === BASELINE.total && baseline.raid === BASELINE.raid && baseline.dungeon === BASELINE.dungeon,
    `实测=${baseline.total}/${baseline.raid}/${baseline.dungeon}`);
  const htmlData = await (await fetch(`${BASE}/data.html`)).text();
  const htmlIndex = await (await fetch(`${BASE}/`)).text();
  const verOf = h => [...new Set([...h.matchAll(/20260811\.\d+/g)].map(m => m[0]))];
  const vD = verOf(htmlData), vI = verOf(htmlIndex);
  check('A2 版本串两壳同步（单一串且两壳一致；本包 .55）', vD.length === 1 && vI.length === 1 && vD[0] === vI[0] && parseInt(vI[0].split('.')[1], 10) >= 55, `index=${vI} data=${vD}`);

  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const pageErrors = [];
  const notFounds = [];
  const watch = (page, tag) => {
    page.on('pageerror', e => pageErrors.push(`pageerror(${tag}): ` + e.message));
    page.on('console', msg => { if (msg.type() === 'error') pageErrors.push(`console(${tag}): ` + msg.text()); });
    page.on('response', r => { if (r.status() === 404) notFounds.push(`${tag}: ${r.url()}`); });
  };
  try {
    // ==================== B. 公开壳面板态（1920×1080） ====================
    const ctxB = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const pageB = await ctxB.newPage();
    watch(pageB, 'pub1920');
    await pageB.goto(`${BASE}/data.html`, { waitUntil: 'networkidle' });
    await pageB.waitForSelector('#dpMain .dp-item', { timeout: 20000 });
    await sleep(1200);
    const b1 = await panelAsserts(pageB, '', 'pub');
    check('B1 面板态：fixed+264px+四边框 1px 全闭合+圆角 8px+底色+z=10+标题「筛选」+折叠钮隐藏+组行展开',
      b1.pos === 'fixed' && b1.width === '264px' && b1.bt === '1px' && b1.br === '1px' && b1.bb === '1px' && b1.bl === '1px'
      && b1.radius === '8px' && b1.z === '10' && b1.titleShown && b1.toggleHidden && b1.rowsShown,
      JSON.stringify({ w: b1.width, z: b1.z, bd: [b1.bt, b1.br, b1.bb, b1.bl] }));
    check('B2 框体完整专项：搜索/重置/命中计数矩形全在面板内（零裁切）', b1.outOfBox.length === 0, b1.outOfBox.join('|') || '无');
    check('B3 卡片区让位 margin-right=292 且 1920 卡片 ≥4 列', b1.mainMarginRight === 292 && b1.cols >= 4, `mr=${b1.mainMarginRight} 列=${b1.cols}`);
    check('B4 浏览态命中计数恒显「共 N 件」（N=基线）', b1.flatHead.includes('共') && b1.flatHead.includes(String(baseline.total)), b1.flatHead);
    check('B5 毒咒组在来源组之后（DOM 序）', b1.venomAfterSource);

    // 滚动 1500px 面板跟随（fixed 不滚动）+ hover 卡不压面板（层级规约 elementFromPoint）
    await pageB.evaluate(() => window.scrollTo(0, 1500));
    await sleep(400);
    const b6hover = await pageB.evaluate(() => {
      const c = document.querySelector('.dp-item.has-effect');
      if (c) c.scrollIntoView({ block: 'center' });
      return !!c;
    });
    if (b6hover) { await pageB.hover('.dp-item.has-effect'); await sleep(350); }
    const b6 = await pageB.evaluate(() => {
      const bar = document.getElementById('dpFilterBar');
      const r = bar.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const hoverCard = document.querySelector('.dp-item.has-effect:hover');
      const zCard = hoverCard ? getComputedStyle(hoverCard).zIndex : '?';
      return { inBar: bar.contains(hit) || hit === bar, top: Math.round(r.top), zCard };
    });
    check('B6 滚动后面板跟随 + 层级规约（面板区命中面板自身；hover 态特效卡 z=5＜面板 10）',
      b6.inBar && b6.zCard === '5', JSON.stringify(b6));
    await pageB.screenshot({ path: path.join(SHOT_DIR, 'pub-1920-panel-scrolled.png'), fullPage: false });

    // 面板独立纵向滚动（压低视口 1920×520 强制内容超高）
    await pageB.setViewportSize({ width: 1920, height: 520 });
    await sleep(600);
    const b7 = await pageB.evaluate(() => {
      const bar = document.getElementById('dpFilterBar');
      const before = bar.scrollTop;
      bar.scrollTop = 200;
      return { oy: getComputedStyle(bar).overflowY, canScroll: bar.scrollHeight > bar.clientHeight, scrolled: bar.scrollTop > before };
    });
    check('B7 面板独立纵向滚动（overflow-y:auto，内容超高可滚）', b7.oy === 'auto' && b7.canScroll && b7.scrolled, JSON.stringify(b7));
    await pageB.setViewportSize({ width: 1920, height: 1080 });
    await ctxB.close();

    // ==================== C. 公开壳折叠顶栏态（1366×768） ====================
    const ctxC = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageC = await ctxC.newPage();
    watch(pageC, 'pub1366');
    await pageC.goto(`${BASE}/data.html`, { waitUntil: 'networkidle' });
    await pageC.waitForSelector('#dpMain .dp-item', { timeout: 20000 });
    await sleep(1000);
    const c1 = await pageC.evaluate(() => {
      const q = s => document.querySelector(s);
      return {
        pos: getComputedStyle(q('#dpFilterBar')).position,
        toggleShown: getComputedStyle(q('#dpFilterToggle')).display !== 'none',
        rowsHidden: getComputedStyle(q('#dpFilterRows')).display === 'none',
        titleHidden: getComputedStyle(q('.dp-panel-title')).display === 'none',
        flatShown: q('#dpFlatHead').innerText.includes('共'),
        toggleText: q('#dpFilterToggle').textContent,
      };
    });
    check('C1 折叠顶栏态（<1400）：sticky+折叠钮显+组行默认收起+面板标题隐+命中计数首行恒显',
      c1.pos === 'sticky' && c1.toggleShown && c1.rowsHidden && c1.titleHidden && c1.flatShown && c1.toggleText.includes('▾'), JSON.stringify(c1));
    await pageC.click('#dpFilterToggle');
    await sleep(400);
    const c2 = await pageC.evaluate(() => ({
      open: document.getElementById('dpFilterBar').classList.contains('filters-open'),
      rowsShown: getComputedStyle(document.getElementById('dpFilterRows')).display !== 'none',
      mem: sessionStorage.getItem('dp43:filterOpen'),
      text: document.getElementById('dpFilterToggle').textContent,
    }));
    check('C2 展开双向 + sessionStorage 记忆写入', c2.open && c2.rowsShown && c2.mem === '1' && c2.text.includes('▴'), JSON.stringify(c2));
    await pageC.reload({ waitUntil: 'networkidle' });
    await pageC.waitForSelector('#dpMain .dp-item', { timeout: 20000 });
    await sleep(800);
    const c3 = await pageC.evaluate(() => ({
      open: document.getElementById('dpFilterBar').classList.contains('filters-open'),
      text: document.getElementById('dpFilterToggle').textContent,
    }));
    check('C3 刷新后折叠记忆还原（保持展开）', c3.open && c3.text.includes('▴'), JSON.stringify(c3));
    await pageC.screenshot({ path: path.join(SHOT_DIR, 'pub-1366-collapsed-open.png'), fullPage: false });
    await pageC.click('#dpFilterToggle');
    await sleep(500);
    const c4 = await pageC.evaluate(() => ({
      open: document.getElementById('dpFilterBar').classList.contains('filters-open'),
      mem: sessionStorage.getItem('dp43:filterOpen'),
    }));
    check('C4 再点收起 + 记忆归零', !c4.open && c4.mem === '0', JSON.stringify(c4));

    // ==================== D. 毒咒筛选（公开壳 1366 折叠态展开 + 1920 面板态——两态一套 DOM） ====================
    // D1 折叠态毒咒组在位 + 0 命中态
    await pageC.click('#dpFilterToggle');
    await sleep(400);
    const d1 = await pageC.evaluate(() => {
      const box = document.getElementById('dpVenomChips');
      return {
        chips: [...box.querySelectorAll('.dp-chip')].map(c => c.textContent),
        allActive: box.querySelector('.dp-chip-all').classList.contains('active'),
      };
    });
    check('D1 毒咒组两态渲染（折叠态：全部/有毒咒，默认全部 active）', d1.chips.join(',') === '全部,有毒咒' && d1.allActive, d1.chips.join(','));
    await pageC.click('#dpVenomChips .dp-chip[data-v="1"]');
    await sleep(600);
    const d2 = await pageC.evaluate(() => ({
      flat: document.getElementById('dpFlatHead').innerText,
      empty: !!document.querySelector('#dpMain .dp-empty'),
      onlyActive: document.querySelector('#dpVenomChips .dp-chip[data-v="1"]').classList.contains('active'),
    }));
    check('D2 0 命中态：「命中 0 件 · 1 项生效」+ 空态重置引导，不报错不白屏',
      d2.flat.includes('命中') && d2.flat.includes('0') && d2.flat.includes('1 项生效') && d2.empty && d2.onlyActive, d2.flat);
    await pageC.screenshot({ path: path.join(SHOT_DIR, 'venom-zero-hit.png'), fullPage: false });
    // 重置复位
    await pageC.click('#dpResetFilters');
    await sleep(600);
    const d3 = await pageC.evaluate(() => ({
      flat: document.getElementById('dpFlatHead').innerText,
      allActive: document.querySelector('#dpVenomChips .dp-chip-all').classList.contains('active'),
      cards: document.querySelectorAll('#dpMain .dp-item').length,
    }));
    check('D3 重置筛选→毒咒组复位全部+全集还原', d3.allActive && d3.flat.includes('共') && d3.cards === baseline.total, `卡=${d3.cards} ${d3.flat}`);

    // D4 真实毒咒行过滤（插样本 → 有毒咒恰命中 1 件 → 删样本）
    const vIns = await svc('POST', '/rest/v1/boss_loot', {
      boss_id: testBossId, item_name: ITEM_VENOM, slot: '单手', item_type: '单手剑',
      primary_stats: ['力量'], effect: '装备：T43 毒咒筛选样本。', venomcurse: '毒咒',
    });
    if (vIns.status !== 201) throw new Error('毒咒样本插入失败: ' + JSON.stringify(vIns.body));
    await pageC.reload({ waitUntil: 'networkidle' });
    await pageC.waitForSelector('#dpMain .dp-item', { timeout: 20000 });
    await sleep(800);
    const d4open = await pageC.evaluate(() => document.getElementById('dpFilterBar').classList.contains('filters-open'));
    if (!d4open) { await pageC.click('#dpFilterToggle'); await sleep(400); } // 折叠态需展开才能点毒咒组（按记忆态幂等）
    await pageC.click('#dpVenomChips .dp-chip[data-v="1"]');
    await sleep(600);
    const d4 = await pageC.evaluate((n) => ({
      flat: document.getElementById('dpFlatHead').innerText,
      names: [...document.querySelectorAll('#dpMain .dp-item-name')].map(x => x.textContent),
      venomBadge: !!document.querySelector('#dpMain .dp-tag-venom'),
    }), ITEM_VENOM);
    check('D4 有毒咒过滤真实行：恰命中 T43 样本 1 件且带毒咒徽标', d4.names.length === 1 && d4.names[0] === ITEM_VENOM && d4.venomBadge && d4.flat.includes('命中') && d4.flat.includes('1'),
      `命中=${d4.flat} 卡=${d4.names.join(',')}`);
    await ctxC.close();

    // D5 面板态毒咒组同 DOM 同步（1920）
    const ctxD = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const pageD = await ctxD.newPage();
    watch(pageD, 'pub1920-venom');
    await pageD.goto(`${BASE}/data.html`, { waitUntil: 'networkidle' });
    await pageD.waitForSelector('#dpMain .dp-item', { timeout: 20000 });
    await sleep(1000);
    const d5 = await pageD.evaluate(() => ({
      chips: [...document.querySelectorAll('#dpVenomChips .dp-chip')].map(c => c.textContent),
      rowsShown: getComputedStyle(document.getElementById('dpFilterRows')).display !== 'none',
    }));
    check('D5 毒咒组面板态同一套 DOM 同步包含（恒展开）', d5.chips.join(',') === '全部,有毒咒' && d5.rowsShown, d5.chips.join(','));
    await pageD.click('#dpVenomChips .dp-chip[data-v="1"]');
    await sleep(600);
    const d6 = await pageD.evaluate((n) => ({
      names: [...document.querySelectorAll('#dpMain .dp-item-name')].map(x => x.textContent),
      flat: document.getElementById('dpFlatHead').innerText,
    }), ITEM_VENOM);
    check('D6 面板态有毒咒过滤同效（恰 1 件样本）', d6.names.length === 1 && d6.names[0] === ITEM_VENOM, d6.flat);
    await pageD.screenshot({ path: path.join(SHOT_DIR, 'pub-1920-venom-filter.png'), fullPage: false });
    // 删样本（后续断言回 308 基线）
    await svc('DELETE', `/rest/v1/boss_loot?item_name=like.T43*`);
    await ctxD.close();

    // ==================== E. 登录壳（viewer）：两态 + 9 页签零回归 ====================
    const ctxE = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const pageE = await ctxE.newPage();
    watch(pageE, 'app1920');
    await login(pageE);
    await pageE.click('.nav-item[data-page="lootdrop"]');
    await pageE.waitForSelector('#page-lootdrop .dp-item', { timeout: 20000 });
    await sleep(1200);
    const e1 = await panelAsserts(pageE, '#page-lootdrop ', 'app');
    check('E1 登录壳面板态同款（fixed/264/四边框/z=10/标题/让位/毒咒组在来源后）',
      e1.pos === 'fixed' && e1.width === '264px' && e1.bt === '1px' && e1.bb === '1px' && e1.z === '10' && e1.titleShown
      && e1.mainMarginRight === 292 && e1.venomAfterSource && e1.outOfBox.length === 0,
      JSON.stringify({ w: e1.width, mr: e1.mainMarginRight }));
    const e2 = await pageE.evaluate(() => {
      const top = getComputedStyle(document.getElementById('page-lootdrop')).getPropertyValue('--dp-panel-top').trim();
      const seasonH = document.querySelector('#page-lootdrop .dp-season').offsetHeight;
      return { top, seasonH, expect: 56 + seasonH };
    });
    check('E2 登录壳 --dp-panel-top = topbar 56 + 赛季行高（壳级变量实测）', parseInt(e2.top, 10) === e2.expect, JSON.stringify(e2));
    await pageE.screenshot({ path: path.join(SHOT_DIR, 'app-1920-panel.png'), fullPage: false });

    // 1366 折叠态（登录壳吸顶 56）
    await pageE.setViewportSize({ width: 1366, height: 768 });
    await sleep(800);
    const e3 = await pageE.evaluate(() => ({
      pos: getComputedStyle(document.querySelector('#page-lootdrop .dp-filterbar')).position,
      top: getComputedStyle(document.querySelector('#page-lootdrop .dp-filterbar')).top,
      toggleShown: getComputedStyle(document.querySelector('#page-lootdrop #dpFilterToggle')).display !== 'none',
    }));
    check('E3 登录壳 1366 折叠顶栏态（sticky top=56 让开 topbar + 折叠钮显）',
      e3.pos === 'sticky' && e3.top === '56px' && e3.toggleShown, JSON.stringify(e3));
    await pageE.screenshot({ path: path.join(SHOT_DIR, 'app-1366-collapsed.png'), fullPage: false });

    // 9 页签零回归（viewer 逐页签切换无报错；数据中心 viewer 不可见不测）
    await pageE.setViewportSize({ width: 1920, height: 1080 });
    for (const p of ['dashboard', 'members', 'attendance', 'loot', 'wishlist', 'reports', 'data', 'changelog', 'lootdrop']) {
      await pageE.click(`.nav-item[data-page="${p}"]`);
      await sleep(350);
    }
    const e4 = await pageE.evaluate(() => document.querySelector('#page-lootdrop.active') !== null);
    check('E4 主应用 9 页签切换零回归（viewer 三角色之一实测，最终回副本掉落）', e4);
    await ctxE.close();

    const realErrors = pageErrors.filter(e => !e.includes('status of 406') && !e.includes('status of 409'));
    check('全程零 JS 报错（406/409 资源状态码噪音另行列示）', realErrors.length === 0, realErrors.join(' | ') || '无');
    check('全程零 404', notFounds.length === 0, notFounds.join(' | ') || '无');
  } finally {
    await browser.close();
  }

  await cleanup();

  // ==================== G. 清理后 308 基线还原 ====================
  const rpc1 = await rpcPublic();
  const s1After = rpc1.body.filter(r => r.season_id === currentSeasonId);
  const after = { total: s1After.length, raid: s1After.filter(r => r.source === 'raid').length, dungeon: s1After.filter(r => r.source === 'dungeon').length };
  check('G1 清理后 308 基线还原（S1 全部/团本/大秘境）', after.total === BASELINE.total && after.raid === BASELINE.raid && after.dungeon === BASELINE.dungeon,
    `实测=${after.total}/${after.raid}/${after.dungeon}`);

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#43 验证: ${passed}/${results.length} 通过，截图 → ${SHOT_DIR} =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => {
  console.error('[验证脚本异常]', e);
  try { await cleanup(); } catch {}
  process.exit(1);
});
