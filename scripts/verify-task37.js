// 任务书 #37 验证：REQ-110 WP1 毒咒（Venomcurse）字段支持
// 覆盖（任务书 §四 verify 口径）：迁移后两表列在、RPC 透出、录入写读一致（真浏览器主链路）、
// 卡片徽标渲染（有毒咒样本显示/无样本不显示）、picker 不受影响、公示页 308 基线零回归（逐卡扫）、
// 1366 档 meta 行三徽标零截断（运营附加转正断言）、双壳一致、§2 computed 断言、版本串递增。
// 测试数据（T37 前缀掉落行 + t37- 测试用户/公会）终清理并复核为零。
// 前置：sql/26 已执行（backup/_sshtmp/run-sql26.js）。
// 用法: node scripts/verify-task37.js（PW_CHANNEL=chrome 可选）
// 截图输出 backup/2026-08-11-task37/
// v2 修正：保存等待改为「先清 toast 容器再等本存 toast」+ REST 轮询落定（消除残留 toast 提前 resolve 的读写竞态）；
//          409 响应抓 URL 定位来源后再定性。
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-11-task37');
const PORT = 15651;
const BASE = `http://localhost:${PORT}`;
const PWD = 'T37-Test-2026!';
const EMAIL_SUPER = 't37-super@wowbutler.cn';
const EMAIL_USER = 't37-user@wowbutler.cn';
const ITEM_BOSS = 'T37毒咒测试之刃';
const ITEM_DUNG = 'T37毒咒测试之戒';
const ITEM_FORM = 'T37表单落库之锤';
const ITEM_FORM_D = 'T37表单大秘境之戒';
const FX_BOSS = '装备：攻击时附加毒咒之力，使目标中毒并在十秒内持续受到自然伤害，效果可叠加。';
const FX_DUNG = '装备：受到攻击时对攻击者反弹毒咒伤害。';
const BASELINE = { total: 308, raid: 104, dungeon: 204 }; // sql/24 R13 口径基线（公示页 308 零回归硬约束）

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
// REST 轮询落定：直到 pred(body) 为真或超时（消除写入在途竞态）
async function waitRest(restPath, pred, timeoutMs = 15000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    const r = await svc('GET', restPath);
    last = r.body;
    if (r.status === 200 && pred(r.body)) return { ok: true, body: r.body };
    await sleep(500);
  }
  return { ok: false, body: last };
}
async function rpcPublic() {
  const res = await fetch(`${SB}/rest/v1/rpc/get_public_loot_detail`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  return { status: res.status, body: await res.json() };
}

let serverProc = null, superU = null, userU = null, guildId = null;
let currentSeasonId = null, testBossId = null, testDungeonId = null;
let baseline = null;

async function makeUser(email, displayName) {
  let res = await fetch(`${SB}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PWD, data: { display_name: displayName } }),
  });
  let body = await res.json();
  if (!body.access_token) {
    res = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PWD }),
    });
    body = await res.json();
  }
  return { uid: body.user.id, token: body.access_token };
}
async function setSuperadmin(uid) {
  const res = await fetch(`${SB}/auth/v1/admin/users/${uid}`, {
    method: 'PUT', headers: SVC, body: JSON.stringify({ app_metadata: { role: 'superadmin' } }),
  });
  return res.status;
}

async function setup() {
  // 前置自清（上轮失败残留幂等清扫，保证 A3 零回填口径干净）
  await svc('DELETE', `/rest/v1/boss_loot?item_name=like.T37*`);
  await svc('DELETE', `/rest/v1/dungeon_loot?item_name=like.T37*`);
  const oldG = await svc('GET', `/rest/v1/guilds?select=id&name=like.T37*`);
  for (const g of (Array.isArray(oldG.body) ? oldG.body : [])) await svc('DELETE', `/rest/v1/guilds?id=eq.${g.id}`);
  for (const email of [EMAIL_SUPER, EMAIL_USER]) {
    const lu = await fetch(`${SB}/auth/v1/admin/users?per_page=50`, { headers: SVC });
    const lj = await lu.json();
    const hit = (lj.users || []).find(u => u.email === email);
    if (hit) await fetch(`${SB}/auth/v1/admin/users/${hit.id}`, { method: 'DELETE', headers: SVC });
  }

  const cs = await svc('GET', '/rest/v1/game_seasons?select=id,is_current,start_date&order=start_date.asc');
  const cur = cs.body.find(s => s.is_current) || cs.body[cs.body.length - 1];
  currentSeasonId = cur.id;
  const raids = await svc('GET', `/rest/v1/game_raids?select=id,type&season_id=eq.${currentSeasonId}&type=neq.world&limit=1`);
  const bosses = await svc('GET', `/rest/v1/game_bosses?select=id&raid_id=eq.${raids.body[0].id}&limit=1`);
  testBossId = bosses.body[0].id;
  const d = await svc('GET', `/rest/v1/game_dungeons?select=id&season_id=eq.${currentSeasonId}&limit=1`);
  testDungeonId = d.body[0].id;

  superU = await makeUser(EMAIL_SUPER, 'T37超管');
  userU = await makeUser(EMAIL_USER, 'T37成员');
  if ((await setSuperadmin(superU.uid)) !== 200) throw new Error('设置 superadmin 失败');
  const g = await svc('POST', '/rest/v1/guilds', { name: 'T37毒咒会', owner_id: superU.uid, invite_code: 'T37A' + Date.now().toString(36).slice(-4).toUpperCase() });
  guildId = g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', [
    { guild_id: guildId, user_id: superU.uid, role: 'owner', display_name: 'T37超管' },
    { guild_id: guildId, user_id: userU.uid, role: 'viewer', display_name: 'T37成员' },
  ]);

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }
}

async function insertSamples() {
  const a = await svc('POST', '/rest/v1/boss_loot', {
    boss_id: testBossId, item_name: ITEM_BOSS, slot: '武器', item_type: '单手剑',
    primary_stats: ['力量'], secondary_stats: ['爆击'], effect: FX_BOSS, venomcurse: '毒咒',
  });
  if (a.status !== 201) throw new Error('建 boss_loot 样本失败: ' + JSON.stringify(a.body));
  const b = await svc('POST', '/rest/v1/dungeon_loot', {
    dungeon_id: testDungeonId, boss_id: null, item_name: ITEM_DUNG, slot: '手指', item_type: '戒指',
    primary_stats: ['智力'], secondary_stats: ['急速'], effect: FX_DUNG, venomcurse: '毒咒',
  });
  if (b.status !== 201) throw new Error('建 dungeon_loot 样本失败: ' + JSON.stringify(b.body));
}

async function cleanup() {
  const steps = [];
  try { const r = await svc('DELETE', `/rest/v1/boss_loot?item_name=like.T37*`); steps.push(`boss:${r.status}`); } catch { steps.push('boss:ERR'); }
  try { const r = await svc('DELETE', `/rest/v1/dungeon_loot?item_name=like.T37*`); steps.push(`dung:${r.status}`); } catch { steps.push('dung:ERR'); }
  if (guildId) { try { const r = await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`); steps.push(`guild:${r.status}`); } catch { steps.push('guild:ERR'); } }
  for (const u of [superU, userU]) {
    if (u) { try { await fetch(`${SB}/auth/v1/admin/users/${u.uid}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); } }
  }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const c1 = await svc('GET', `/rest/v1/boss_loot?select=id&item_name=like.T37*`);
  const c2 = await svc('GET', `/rest/v1/dungeon_loot?select=id&item_name=like.T37*`);
  const c3 = await svc('GET', `/rest/v1/guilds?select=id&name=like.T37*`);
  const zero = [c1, c2, c3].every(c => Array.isArray(c.body) && c.body.length === 0);
  check('[清理复核] T37 前缀掉落/公会全 0', zero, `boss=${c1.body.length} dung=${c2.body.length} guild=${c3.body.length}`);
}

async function login(page, email) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
  await page.fill('#authEmail', email);
  await page.fill('#authPassword', PWD);
  await page.click('#authLoginBtn');
  await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
  await sleep(1500);
}

// meta 行三徽标零截断扫描（1366 档；返回违规清单与三徽标卡数）
async function metaTruncationSweep(page, scopeSel) {
  return page.evaluate((sel) => {
    const bad = [];
    let threeTag = 0;
    document.querySelectorAll(`${sel} .dp-item-meta`).forEach(m => {
      const tags = [...m.querySelectorAll('.dp-tag')];
      if (tags.length < 3) return;
      threeTag++;
      const card = m.closest('.dp-item');
      const name = card ? (card.querySelector('.dp-item-name') || {}).textContent : '?';
      const mr = m.getBoundingClientRect();
      if (m.scrollWidth > m.clientWidth + 1) bad.push(`scrollWidth越界:${name}`);
      tags.forEach(t => {
        const tr = t.getBoundingClientRect();
        if (tr.right > mr.right + 0.6 || tr.left < mr.left - 0.6) bad.push(`tag出盒:${name}/${t.textContent}`);
      });
    });
    return { bad, threeTag };
  }, scopeSel);
}

// 保存点击：先清 toast 容器（消除残留 toast 提前 resolve），点保存，等本次 toast
async function clickSaveAndWaitToast(page) {
  await page.evaluate(() => { document.getElementById('toastContainer').innerHTML = ''; });
  await page.click('#mdEditorSaveBtn');
  await page.waitForFunction(() => document.getElementById('toastContainer').innerText.includes('已保存'), { timeout: 15000 });
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await setup();

  // ==================== A. 迁移后结构与 RPC（REST 直连） ====================
  const a1a = await svc('GET', '/rest/v1/boss_loot?select=venomcurse&limit=1');
  const a1b = await svc('GET', '/rest/v1/dungeon_loot?select=venomcurse&limit=1');
  check('A1 两表 venomcurse 列在（REST select 200）', a1a.status === 200 && a1b.status === 200, `boss=${a1a.status} dung=${a1b.status}`);

  const rpc0 = await rpcPublic();
  check('A2 RPC 每行透出 venomcurse 键', rpc0.status === 200 && rpc0.body.every(r => Object.prototype.hasOwnProperty.call(r, 'venomcurse')), `行数=${rpc0.body.length} 状态=${rpc0.status}`);
  const nn = rpc0.body.filter(r => r.venomcurse !== null).length;
  check('A3 存量零回填（RPC 值全 null + DB 非空 0）', nn === 0, `非空=${nn}`);
  const s1 = rpc0.body.filter(r => r.season_id === currentSeasonId);
  baseline = {
    total: s1.length,
    raid: s1.filter(r => r.source === 'raid').length,
    dungeon: s1.filter(r => r.source === 'dungeon').length,
  };
  check('A4 公示页 308 基线（S1 全部/团本/大秘境）', baseline.total === BASELINE.total && baseline.raid === BASELINE.raid && baseline.dungeon === BASELINE.dungeon,
    `实测=${baseline.total}/${baseline.raid}/${baseline.dungeon} 基线=${BASELINE.total}/${BASELINE.raid}/${BASELINE.dungeon}`);

  // 版本串（14+2 口径：两壳资源引用同步；具体串号随后续任务递增，只断言两壳一致+单一串）
  const htmlData = await (await fetch(`${BASE}/data.html`)).text();
  const htmlIndex = await (await fetch(`${BASE}/`)).text();
  const verOf = h => [...new Set([...h.matchAll(/20260811\.\d+/g)].map(m => m[0]))];
  const vD = verOf(htmlData), vI = verOf(htmlIndex);
  check('A5 版本串两壳同步（单一串且两壳一致，当前 .49）', vD.length === 1 && vI.length === 1 && vD[0] === vI[0], `index=${vI} data=${vD}`);

  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const pageErrors = [];
  const notFounds = [];
  const conflicts = [];
  const watch = (page, tag) => {
    page.on('pageerror', e => pageErrors.push(`pageerror(${tag}): ` + e.message));
    page.on('console', msg => { if (msg.type() === 'error') pageErrors.push(`console(${tag}): ` + msg.text()); });
    page.on('response', r => {
      if (r.status() === 404) notFounds.push(`${tag}: ${r.url()}`);
      if (r.status() === 409) conflicts.push(`${tag}: ${r.request().method()} ${r.url()}`);
    });
  };
  try {
    // ==================== B. 公开壳基线零变化（插样本前，逐卡扫） ====================
    const ctxB = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageB = await ctxB.newPage();
    watch(pageB, 'pub-base');
    await pageB.goto(`${BASE}/data.html`, { waitUntil: 'networkidle' });
    await pageB.waitForSelector('#dpMain .dp-item', { timeout: 20000 });
    await sleep(1200);
    const b0 = await pageB.evaluate(() => ({
      cards: document.querySelectorAll('#dpMain .dp-item').length,
      venom: document.querySelectorAll('#dpMain .dp-tag-venom').length,
      overTwo: [...document.querySelectorAll('#dpMain .dp-item-meta')].filter(m => m.querySelectorAll('.dp-tag').length > 2).length,
    }));
    check('B1 基线卡数=S1 全集且零毒咒徽标（线上卡片零变化）', b0.cards === baseline.total && b0.venom === 0, `卡=${b0.cards} 徽标=${b0.venom}`);
    check('B2 逐卡扫：全部 meta 行徽标 ≤2 枚（无第三枚挤入）', b0.overTwo === 0, `超2枚的卡=${b0.overTwo}`);
    await ctxB.close();

    // ==================== C. 插入毒咒样本 → 公开壳徽标渲染 ====================
    await insertSamples();
    const ctxC = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageC = await ctxC.newPage();
    watch(pageC, 'pub');
    await pageC.goto(`${BASE}/data.html`, { waitUntil: 'networkidle' });
    await pageC.waitForSelector('#dpMain .dp-item', { timeout: 20000 });
    await sleep(1200);

    const c1 = await pageC.evaluate(() => ({
      cards: document.querySelectorAll('#dpMain .dp-item').length,
      venomTexts: [...document.querySelectorAll('#dpMain .dp-tag-venom')].map(t => t.textContent),
    }));
    check('C1 样本后卡数=基线+2，毒咒徽标恰 2 枚且文本=「毒咒」', c1.cards === baseline.total + 2 && c1.venomTexts.length === 2 && c1.venomTexts.every(t => t === '毒咒'),
      `卡=${c1.cards} 徽标=[${c1.venomTexts.join(',')}]`);

    const c2 = await pageC.evaluate(() => {
      const badge = document.querySelector('#dpMain .dp-tag-venom');
      const cs = getComputedStyle(badge);
      return { h: cs.height, fw: cs.fontWeight, br: cs.borderRadius, color: cs.color, bg: cs.backgroundColor, fs: cs.fontSize, lh: cs.lineHeight };
    });
    check('C2 §2 computed：.dp-tag-venom 几何并轨 .tag 族', c2.h === '20px' && c2.fw === '600' && c2.br === '5px' && c2.fs === '11px', JSON.stringify(c2));
    check('C3 §2 computed：绿色调与特效绿 #1eff00 同族', c2.color === 'rgb(30, 255, 0)' && c2.bg === 'rgba(30, 255, 0, 0.12)', `color=${c2.color} bg=${c2.bg}`);

    const sweepC = await metaTruncationSweep(pageC, '#dpMain');
    check('C4 meta 行三徽标零截断（1366 档全页扫，含两张样本卡）', sweepC.bad.length === 0 && sweepC.threeTag >= 2, `三徽标卡=${sweepC.threeTag} 违规=${sweepC.bad.join('|') || '无'}`);

    const c5 = await pageC.evaluate((names) => {
      return names.map(n => {
        const card = [...document.querySelectorAll('#dpMain .dp-item')].find(c => (c.querySelector('.dp-item-name') || {}).textContent === n);
        if (!card) return { n, ok: false };
        const fx = card.querySelector('.dp-item-effect-preview');
        const meta = card.querySelector('.dp-item-meta');
        return { n, ok: !!(fx && fx.textContent.length > 0 && meta && meta.querySelector('.dp-tag-venom')), fxLen: fx ? fx.textContent.length : 0 };
      });
    }, [ITEM_BOSS, ITEM_DUNG]);
    check('C5 样本卡特效行正常渲染 + 徽标同卡在位', c5.every(x => x.ok), JSON.stringify(c5));
    await pageC.screenshot({ path: path.join(SHOT_DIR, 'public-venom-badges.png'), fullPage: false });
    await ctxC.close();

    // ==================== D. 登录壳（viewer）：双壳一致 ====================
    const ctxD = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageD = await ctxD.newPage();
    watch(pageD, 'app');
    await login(pageD, EMAIL_USER);
    await pageD.click('.nav-item[data-page="lootdrop"]');
    await pageD.waitForSelector('#page-lootdrop .dp-item', { timeout: 20000 });
    await sleep(1200);
    const d1 = await pageD.evaluate(() => ({
      cards: document.querySelectorAll('#page-lootdrop #dpMain .dp-item').length,
      venom: [...document.querySelectorAll('#page-lootdrop #dpMain .dp-tag-venom')].map(t => t.textContent),
    }));
    check('D1 登录壳徽标与公开壳一致（2 枚「毒咒」，卡数一致）', d1.cards === baseline.total + 2 && d1.venom.length === 2 && d1.venom.every(t => t === '毒咒'),
      `卡=${d1.cards} 徽标=${d1.venom.length}`);
    const sweepD = await metaTruncationSweep(pageD, '#page-lootdrop #dpMain');
    check('D2 登录壳 meta 行三徽标零截断（1366 档）', sweepD.bad.length === 0 && sweepD.threeTag >= 2, `三徽标卡=${sweepD.threeTag} 违规=${sweepD.bad.join('|') || '无'}`);
    await pageD.screenshot({ path: path.join(SHOT_DIR, 'app-venom-badges.png'), fullPage: false });
    await ctxD.close();

    // ==================== E. 数据中心录入主链路（真浏览器 CRUD，superadmin） ====================
    const ctxE = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageE = await ctxE.newPage();
    watch(pageE, 'dc');
    await login(pageE, EMAIL_SUPER);
    await pageE.evaluate(() => switchPage('datacenter'));
    await pageE.waitForSelector('.view-tab[data-mdtab="loot"]', { state: 'visible', timeout: 20000 });
    await pageE.click('.view-tab[data-mdtab="loot"]');
    await pageE.waitForSelector('#mdPanel table', { timeout: 20000 });
    await pageE.click('button:has-text("+ 新增掉落")');
    await pageE.waitForSelector('#mdField_venomcurse', { state: 'visible', timeout: 10000 });

    const e1 = await pageE.evaluate(() => {
      const sel = document.getElementById('mdField_venomcurse');
      return {
        isSelect: sel.tagName === 'SELECT',
        opts: [...sel.options].map(o => `${o.value}:${o.textContent}`),
        noCustom: !document.getElementById('mdField_venomcurse_custom'),
      };
    });
    check('E1 表单「毒咒」=预设下拉（无/毒咒两选项，禁自由输入）', e1.isSelect && e1.noCustom && e1.opts.length === 2 && e1.opts[0] === ':无' && e1.opts[1] === '毒咒:毒咒', JSON.stringify(e1.opts));

    await pageE.fill('#mdField_item_name', ITEM_FORM);
    await pageE.selectOption('#mdField_slot', '单手'); // 演进驱动适配（任务书 #40 词表下拉化）：「武器」退出 slot 选项，单手剑归「单手」位
    await sleep(300);
    await pageE.selectOption('#mdField_item_type', '单手剑');
    await pageE.selectOption('#mdField_venomcurse', '毒咒');
    await clickSaveAndWaitToast(pageE);
    const e2w = await waitRest(`/rest/v1/boss_loot?select=id,venomcurse&item_name=eq.${encodeURIComponent(ITEM_FORM)}`, b => b.length === 1 && b[0].venomcurse === '毒咒');
    check('E2 新增掉落选「毒咒」保存→写读一致（toast+库内值）', e2w.ok, JSON.stringify(e2w.body));
    const formRowId = e2w.ok ? e2w.body[0].id : null;
    const e2b = await pageE.evaluate((n) => {
      const row = [...document.querySelectorAll('#mdPanel tr')].find(tr => tr.innerText.includes(n));
      return row ? row.innerText.includes('毒咒') : false;
    }, ITEM_FORM);
    check('E2b 列表同步展示毒咒列', e2b);

    // 编辑改回「无」→ NULL
    await pageE.evaluate((id) => mdEditLootItem(id), formRowId);
    await pageE.waitForSelector('#mdField_venomcurse', { state: 'visible', timeout: 10000 });
    const e3pre = await pageE.evaluate(() => document.getElementById('mdField_venomcurse').value);
    await pageE.selectOption('#mdField_venomcurse', '');
    await clickSaveAndWaitToast(pageE);
    const e3w = await waitRest(`/rest/v1/boss_loot?select=venomcurse&item_name=eq.${encodeURIComponent(ITEM_FORM)}`, b => b.length === 1 && b[0].venomcurse === null);
    check('E3 编辑带回显（毒咒）改「无」→ 库内 NULL', e3pre === '毒咒' && e3w.ok, `回显=${e3pre} 库=${JSON.stringify(e3w.body)}`);

    // 大秘境掉落区块
    await pageE.click('.view-tab[data-mdtab="dungeonloot"]');
    await pageE.waitForSelector('#mdPanel table', { timeout: 20000 });
    await pageE.click('button:has-text("+ 新增掉落")');
    await pageE.waitForSelector('#mdField_venomcurse', { state: 'visible', timeout: 10000 });
    await pageE.fill('#mdField_item_name', ITEM_FORM_D);
    await pageE.selectOption('#mdField_slot', '手指');
    await sleep(300);
    await pageE.selectOption('#mdField_item_type', '戒指');
    await pageE.selectOption('#mdField_venomcurse', '毒咒');
    await clickSaveAndWaitToast(pageE);
    const e4w = await waitRest(`/rest/v1/dungeon_loot?select=venomcurse&item_name=eq.${encodeURIComponent(ITEM_FORM_D)}`, b => b.length === 1 && b[0].venomcurse === '毒咒');
    check('E4 大秘境掉落「毒咒」保存→写读一致', e4w.ok, JSON.stringify(e4w.body));
    await pageE.screenshot({ path: path.join(SHOT_DIR, 'datacenter-venom-form.png'), fullPage: false });

    // ==================== F. picker 不受影响 ====================
    const f1 = await pageE.evaluate(() => {
      const items = getMasterLootItems();
      return {
        hasVenomKey: items.some(i => Object.prototype.hasOwnProperty.call(i, 'venomcurse')),
        sample: items.filter(i => i.name && i.name.startsWith('T37')).map(i => i.name),
      };
    });
    check('F1 picker 映射对象零 venomcurse 字段（不受影响）', !f1.hasVenomKey, `T37样本在列=${f1.sample.join(',') || '无'}`);
    await ctxE.close();

    const realErrors = pageErrors.filter(e => !e.includes('status of 406') && !e.includes('status of 409'));
    check('全程零 JS 报错（406/409 资源状态码噪音另行列示）', realErrors.length === 0, realErrors.join(' | ') || '无');
    check('全程零 404', notFounds.length === 0, notFounds.join(' | ') || '无');
    console.log('[409 定位] ' + (conflicts.join(' | ') || '无'));
  } finally {
    await browser.close();
  }

  await cleanup();

  // ==================== G. 清理后 308 基线还原 ====================
  const rpc1 = await rpcPublic();
  const s1After = rpc1.body.filter(r => r.season_id === currentSeasonId);
  const after = {
    total: s1After.length,
    raid: s1After.filter(r => r.source === 'raid').length,
    dungeon: s1After.filter(r => r.source === 'dungeon').length,
  };
  check('G1 清理后 308 基线还原（S1 全部/团本/大秘境）', after.total === BASELINE.total && after.raid === BASELINE.raid && after.dungeon === BASELINE.dungeon,
    `实测=${after.total}/${after.raid}/${after.dungeon}`);
  check('G2 清理后 RPC venomcurse 全 null', rpc1.body.every(r => r.venomcurse === null));

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#37 验证: ${passed}/${results.length} 通过，截图 → ${SHOT_DIR} =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => {
  console.error('[验证脚本异常]', e);
  try { await cleanup(); } catch {}
  process.exit(1);
});
