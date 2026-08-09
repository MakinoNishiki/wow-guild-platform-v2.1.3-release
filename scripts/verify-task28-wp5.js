// 任务书 #28 WP5 验证：双壳嵌入 + 更名「副本掉落」（REQ-086 收官）
// 核心路径：公开壳（data.html）零回退 + 登录壳（index.html #page-lootdrop tab）内嵌渲染、
// 双壳数据一致、吸顶/层级/双向连帧 tab 内抽验、主应用其余页签零回归、viewer 可见、登出再登录。
// 测试数据（WP5 前缀：1 条长特效大秘境掉落 + owner/viewer 两测试用户与公会）终清理并复核为零。
// 用法: node scripts/verify-task28-wp5.js（PW_CHANNEL=chrome 可选）
// 截图输出 backup/2026-08-10-task28-wp5/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-10-task28-wp5');
const PORT = 15649;
const BASE = `http://localhost:${PORT}`;
const PWD = 'Wp28e-Test-2026!';
const EMAIL_OWNER = 'wp28e-owner@wowbutler.cn';
const EMAIL_VIEWER = 'wp28e-viewer@wowbutler.cn';
const FX_ITEM = 'WP5长特效测试之刃';
const FX_TEXT = '装备：攻击时有一定几率召唤远古符文风暴，对前方所有敌人造成持续自然伤害并削弱其护甲，效果可叠加三层，持续十二秒，冷却四十五秒。';

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

let serverProc = null, owner = null, viewer = null, guildId = null, currentSeasonId = null, testDungeonId = null;

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

async function setup() {
  const cs = await svc('GET', '/rest/v1/game_seasons?select=id,is_current,start_date&order=start_date.asc');
  const cur = cs.body.find(s => s.is_current) || cs.body[cs.body.length - 1];
  currentSeasonId = cur.id;
  const d = await svc('GET', `/rest/v1/game_dungeons?select=id,name&season_id=eq.${currentSeasonId}&limit=1`);
  testDungeonId = d.body[0].id;

  // 长特效测试掉落（整体池归属；保证双壳各有一张确定的溢出卡样本）
  const l = await svc('POST', '/rest/v1/dungeon_loot', {
    dungeon_id: testDungeonId, boss_id: null, item_name: FX_ITEM, slot: '武器', item_type: '单手剑',
    primary_stats: ['力量'], secondary_stats: ['爆击'], effect: FX_TEXT,
  });
  if (l.status !== 201) throw new Error('建测试掉落失败: ' + JSON.stringify(l.body));

  owner = await makeUser(EMAIL_OWNER, 'WP5会长');
  viewer = await makeUser(EMAIL_VIEWER, 'WP5看客');
  const g = await svc('POST', '/rest/v1/guilds', { name: 'WP5双壳会', owner_id: owner.uid, invite_code: 'W28E' + Date.now().toString(36).slice(-4).toUpperCase() });
  guildId = g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', [
    { guild_id: guildId, user_id: owner.uid, role: 'owner', display_name: 'WP5会长' },
    { guild_id: guildId, user_id: viewer.uid, role: 'viewer', display_name: 'WP5看客' },
  ]);

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }
}

async function cleanup() {
  const steps = [];
  try { const r = await svc('DELETE', `/rest/v1/dungeon_loot?item_name=like.WP5*`); steps.push(`loot:${r.status}`); } catch { steps.push('loot:ERR'); }
  if (guildId) { try { const r = await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`); steps.push(`guild:${r.status}`); } catch { steps.push('guild:ERR'); } }
  for (const u of [owner, viewer]) {
    if (u) { try { await fetch(`${SB}/auth/v1/admin/users/${u.uid}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); } }
  }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const c1 = await svc('GET', `/rest/v1/dungeon_loot?select=id&item_name=like.WP5*`);
  const c2 = await svc('GET', `/rest/v1/guilds?select=id&name=like.WP5*`);
  console.log(`[清理复核] WP5 掉落=${Array.isArray(c1.body) ? c1.body.length : '?'} 公会=${Array.isArray(c2.body) ? c2.body.length : '?'}`);
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

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await setup();

  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const pageErrors = [];
  const notFounds = [];
  try {
    // ==================== A. 公开壳（data.html）零回退 ====================
    const ctxP = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageP = await ctxP.newPage();
    pageP.on('pageerror', e => pageErrors.push('pageerror(public): ' + e.message));
    pageP.on('console', msg => { if (msg.type() === 'error') pageErrors.push('console(public): ' + msg.text()); });
    pageP.on('response', r => { if (r.status() === 404) notFounds.push(`public: ${r.url()}`); });
    await pageP.goto(`${BASE}/data.html`, { waitUntil: 'networkidle' });
    await pageP.waitForSelector('#dpMain .dp-item', { timeout: 20000 });
    await sleep(1200);

    const pub = await pageP.evaluate(() => ({
      title: document.title,
      h1: document.querySelector('.dp-title')?.textContent || '',
      cardCount: document.querySelectorAll('#dpMain .dp-item').length,
      firstCard: document.querySelector('#dpMain .dp-item-name')?.textContent || '',
      hasFx: [...document.querySelectorAll('#dpMain .dp-item.has-effect .dp-item-name')].some(n => n.textContent.includes('WP5长特效测试之刃')),
      legacy: document.body.innerText.includes('数据公示'),
      threeBlocks: document.getElementById('dpMain').innerText.includes('团本掉落池')
        && document.getElementById('dpMain').innerText.includes('大秘境掉落池')
        && document.getElementById('dpMain').innerText.includes('套装一览'),
    }));
    check('[公开壳] title=「副本掉落 · 魔兽管家」', pub.title === '副本掉落 · 魔兽管家', pub.title);
    check('[公开壳] h1=「副本掉落」', pub.h1 === '副本掉落', pub.h1);
    check('[公开壳] 三区块渲染 + 测试溢出卡在列', pub.threeBlocks && pub.hasFx, `卡数=${pub.cardCount}`);
    check('[公开壳] 页面无「数据公示」残留', !pub.legacy);
    await pageP.screenshot({ path: path.join(SHOT_DIR, 'public-shell.png'), fullPage: false });
    await ctxP.close();

    // ==================== B. 登录壳（owner）：tab 嵌入 ====================
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => pageErrors.push('pageerror(app): ' + e.message));
    page.on('console', msg => { if (msg.type() === 'error') pageErrors.push('console(app): ' + msg.text()); });
    page.on('response', r => { if (r.status() === 404) notFounds.push(`app: ${r.url()}`); });
    await login(page, EMAIL_OWNER);

    const nav = await page.evaluate(() => {
      const items = [...document.querySelectorAll('.nav-item')];
      const item = items.find(i => i.dataset.page === 'lootdrop');
      return { text: item ? item.textContent.trim() : '', legacy: items.some(i => i.textContent.includes('数据公示')) };
    });
    check('[登录壳] 侧边栏入口=「副本掉落」且无旧名残留', nav.text.includes('副本掉落') && !nav.legacy, nav.text);

    // 点击入口：无新标签页、内切换
    const [popup] = await Promise.all([
      ctx.waitForEvent('page', { timeout: 3000 }).catch(() => null),
      page.click('.nav-item[data-page="lootdrop"]'),
    ]);
    await page.waitForSelector('#page-lootdrop .dp-item', { timeout: 20000 });
    await sleep(1200);
    const tabState = await page.evaluate(() => ({
      active: document.getElementById('page-lootdrop').classList.contains('active'),
      title: document.getElementById('pageTitle').textContent,
      cardCount: document.querySelectorAll('#page-lootdrop #dpMain .dp-item').length,
      firstCard: document.querySelector('#page-lootdrop #dpMain .dp-item-name')?.textContent || '',
      season: document.getElementById('dpSeasonSelect').selectedOptions[0]?.textContent || '',
    }));
    check('[登录壳] 点击=应用内切换（无新标签页）', popup === null, popup ? popup.url() : '无弹窗');
    check('[登录壳] page-lootdrop 激活 + 顶栏标题=副本掉落', tabState.active && tabState.title === '副本掉落', tabState.title);
    check('[双壳一致] 卡片总数一致', tabState.cardCount === pub.cardCount, `公开=${pub.cardCount} tab=${tabState.cardCount}`);
    check('[双壳一致] 首张卡名称一致', tabState.firstCard === pub.firstCard, tabState.firstCard);
    await page.screenshot({ path: path.join(SHOT_DIR, 'tab-first-screen.png') });

    // id 唯一性清查（§1 审计断言化）
    const dupIds = await page.evaluate(() => {
      const seen = {}, dups = [];
      document.querySelectorAll('[id]').forEach(el => { if (seen[el.id]) dups.push(el.id); seen[el.id] = 1; });
      return dups;
    });
    check('[登录壳] 文档内 id 零重复（双壳骨架共存）', dupIds.length === 0, dupIds.join(',') || '无重复');

    // tab 内筛选：搜索 WP5 → 平铺「命中 1 件」
    await page.fill('#page-lootdrop #dpSearch', 'WP5');
    await sleep(700);
    const flat = await page.evaluate(() => ({
      flatHead: document.getElementById('dpFlatHead').innerText,
      flatShown: !document.getElementById('dpFlatHead').hidden,
      item: document.getElementById('dpMain').innerText.includes('WP5长特效测试之刃'),
      count: document.querySelectorAll('#page-lootdrop #dpMain .dp-item').length,
    }));
    check('[tab行为] 搜索激活平铺态「命中 1 件」', flat.flatShown && flat.flatHead.includes('命中') && flat.flatHead.includes('1') && flat.item && flat.count === 1, flat.flatHead);
    await page.click('#page-lootdrop #dpResetFilters');
    await sleep(700);
    const restored = await page.evaluate(() => document.querySelectorAll('#page-lootdrop #dpMain .dp-item').length);
    check('[tab行为] 重置筛选还原全集', restored === pub.cardCount, `${restored}`);

    // 吸顶（§2 生效值）：scrollTo(900) 后筛选条 rect.top===56（topbar 56px 之下）
    await page.evaluate(() => window.scrollTo(0, 900));
    await sleep(400);
    const sticky = await page.evaluate(() => {
      const bar = document.getElementById('dpFilterBar');
      const r = bar.getBoundingClientRect();
      return { top: Math.round(r.top), pos: getComputedStyle(bar).position };
    });
    check('[tab吸顶] scrollTo(900) 后筛选条 sticky top=56（让开 topbar）', sticky.pos === 'sticky' && sticky.top === 56, `top=${sticky.top} pos=${sticky.pos}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'tab-sticky-scrolled.png') });

    // 层级（BUG-069 口径）：卡上半藏于筛选条下，hover 展开后重叠区 elementFromPoint 命中筛选条
    await page.evaluate(() => {
      const card = [...document.querySelectorAll('#page-lootdrop .dp-item.has-effect')]
        .find(c => c.innerText.includes('WP5长特效测试之刃'));
      card.scrollIntoView({ block: 'start' });
      const bar = document.getElementById('dpFilterBar');
      const barBottom = bar.getBoundingClientRect().bottom;
      window.scrollBy(0, card.getBoundingClientRect().top - barBottom + 40); // 卡顶藏到条下 40px
    });
    await sleep(300);
    const hoverGeo = await page.evaluate(() => {
      const card = [...document.querySelectorAll('#page-lootdrop .dp-item.has-effect')]
        .find(c => c.innerText.includes('WP5长特效测试之刃'));
      const r = card.getBoundingClientRect();
      const bar = document.getElementById('dpFilterBar').getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(bar.bottom - 10), cardTop: Math.round(r.top), barBottom: Math.round(bar.bottom) };
    });
    await page.mouse.move(hoverGeo.x, hoverGeo.y + 30); // 先落卡体（条下沿外露部分）触发 hover
    await page.mouse.move(hoverGeo.x, hoverGeo.y + 30);
    await sleep(350); // 生长动画 200ms 完成
    const zHit = await page.evaluate((pt) => {
      const el = document.elementFromPoint(pt.x, pt.y);
      return { hit: el ? (el.id || el.className || el.tagName) : 'null', inBar: !!(el && el.closest('#dpFilterBar')) };
    }, hoverGeo);
    check('[tab层级] hover 展开卡与筛选条重叠区 elementFromPoint 命中筛选条（条在上层）', zHit.inBar, zHit.hit);
    await page.screenshot({ path: path.join(SHOT_DIR, 'tab-hover-under-sticky.png') });

    // 双向连帧（§3，rAF 逐帧口径，样本=1 张确定溢出卡；全量 8 卡连帧由 verify-browser-patch4 公开壳覆盖）
    async function sampleFrames(act) {
      await page.evaluate(() => {
        window.__samples = [];
        window.__sampling = true;
        const card = [...document.querySelectorAll('#page-lootdrop .dp-item.has-effect')]
          .find(c => c.innerText.includes('WP5长特效测试之刃'));
        const wrap = card.querySelector('.dp-item-effect-wrap');
        const tick = () => { if (!window.__sampling) return; window.__samples.push(wrap.getBoundingClientRect().height); requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      });
      await act();
      await sleep(450);
      return page.evaluate(() => { window.__sampling = false; return window.__samples; });
    }
    function frameVerdict(samples, dir) {
      const travel = Math.max(...samples) - Math.min(...samples);
      if (travel < 5) return { ok: false, why: `行程过小 ${travel}` };
      let mono = true, maxJump = 0;
      for (let i = 1; i < samples.length; i++) {
        const d = samples[i] - samples[i - 1];
        if (dir === 'up' && d < -0.6) mono = false;
        if (dir === 'down' && d > 0.6) mono = false;
        maxJump = Math.max(maxJump, Math.abs(d));
      }
      return { ok: mono && maxJump <= travel * 0.5, why: `行程=${travel.toFixed(1)} 最大帧增量=${maxJump.toFixed(1)} 单调=${mono}` };
    }
    // 先确保折叠态（上级层级断言 hover 后鼠标仍在卡上，直接采样会量到已展开的平直线）
    await page.mouse.move(hoverGeo.x, 80);
    await sleep(400);
    const cardPt = await page.evaluate(() => {
      const card = [...document.querySelectorAll('#page-lootdrop .dp-item.has-effect')]
        .find(c => c.innerText.includes('WP5长特效测试之刃'));
      card.scrollIntoView({ block: 'center' });
      const r = card.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });
    const exp = await sampleFrames(() => page.mouse.move(cardPt.x, cardPt.y));
    const vExp = frameVerdict(exp, 'up');
    check('[tab连帧] 展开逐帧单调递增、单帧跳变≤50% 行程', vExp.ok, vExp.why);
    const col = await sampleFrames(() => page.mouse.move(cardPt.x, 80)); // 移到顶部栏区域离开卡片
    const vCol = frameVerdict(col, 'down');
    check('[tab连帧] 收回逐帧单调递减、单帧跳变≤50% 行程', vCol.ok, vCol.why);

    // 切走再切回：activate() 重测校正（溢出标记保持）
    await page.evaluate(() => switchPage('dashboard'));
    await sleep(400);
    await page.evaluate(() => switchPage('lootdrop'));
    await sleep(600);
    const backFx = await page.evaluate(() => {
      const card = [...document.querySelectorAll('#page-lootdrop .dp-item.has-effect')]
        .find(c => c.innerText.includes('WP5长特效测试之刃'));
      return !!card;
    });
    check('[tab行为] 切走再切回 activate 重测后溢出卡标记保持', backFx);

    // 主应用零回归：其余页签 pageTitle 逐一断言
    const titles = await page.evaluate(async () => {
      const out = {};
      for (const p of ['dashboard', 'members', 'attendance', 'loot', 'wishlist', 'reports', 'data', 'changelog']) {
        switchPage(p);
        await new Promise(r => setTimeout(r, 120));
        out[p] = document.getElementById('pageTitle').textContent;
      }
      return out;
    });
    const expectTitles = { dashboard: '仪表盘', members: '成员管理', attendance: '考勤记录', loot: '装备分配', wishlist: '心愿单', reports: '统计报表', data: '数据管理', changelog: '更新日志' };
    const titlesOk = Object.entries(expectTitles).every(([k, v]) => titles[k] === v);
    check('[零回归] 其余 8 页签切换 pageTitle 全部正确', titlesOk, JSON.stringify(titles));
    const dc = await page.evaluate(async () => {
      switchPage('datacenter'); // owner 非超管 → 拦回 dashboard
      await new Promise(r => setTimeout(r, 200));
      return document.getElementById('pageTitle').textContent;
    });
    check('[零回归] 数据中心超管守卫不变（非超管拦回仪表盘）', dc === '仪表盘', dc);

    // 登出 → 再登录（B6 链路）
    await page.evaluate(() => userMenuAction('logout'));
    await page.waitForSelector('#authEmail', { state: 'visible', timeout: 15000 });
    check('[零回归] 退出登录回到认证页', true);
    await login(page, EMAIL_OWNER);
    await page.click('.nav-item[data-page="lootdrop"]');
    await page.waitForSelector('#page-lootdrop .dp-item', { timeout: 20000 });
    check('[零回归] 再登录后副本掉落 tab 可用', true);
    await ctx.close();

    // ==================== C. viewer 角色可见可用 ====================
    const ctxV = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageV = await ctxV.newPage();
    pageV.on('pageerror', e => pageErrors.push('pageerror(viewer): ' + e.message));
    await login(pageV, EMAIL_VIEWER);
    const vNav = await pageV.evaluate(() => {
      const item = [...document.querySelectorAll('.nav-item')].find(i => i.dataset.page === 'lootdrop');
      return item ? item.textContent.trim() : '';
    });
    check('[viewer] 侧边栏「副本掉落」可见', vNav.includes('副本掉落'), vNav);
    await pageV.click('.nav-item[data-page="lootdrop"]');
    await pageV.waitForSelector('#page-lootdrop .dp-item', { timeout: 20000 });
    const vCount = await pageV.evaluate(() => document.querySelectorAll('#page-lootdrop #dpMain .dp-item').length);
    check('[viewer] tab 渲染正常（卡片数与公开壳一致）', vCount === pub.cardCount, `${vCount}`);
    await ctxV.close();

    const realErrors = pageErrors.filter(e => !e.includes('status of 406'));
    check('全程零 JS 报错（406=既有噪音已排除）', realErrors.length === 0, realErrors.join(' | ') || '无');
    check('全程零 404', notFounds.length === 0, notFounds.join(' | ') || '无');
  } finally {
    await browser.close();
  }

  await cleanup();

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#28 WP5 验证: ${passed}/${results.length} 通过，截图 → ${SHOT_DIR} =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
