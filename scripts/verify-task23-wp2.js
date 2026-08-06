// 任务书 #23 WP2 验证：数据公示页（免登录公开，REQ-073）
// 核心路径：隐身窗口（未登录）直开 data.html——三区块渲染、赛季切换联动、筛选搜索、四视图截图（两档宽度）
// 附带：匿名安全抽测（anon 读业务表空集）、登录用户侧边栏入口、空赛季空态、控制台零报错零 404
// 测试数据（T23P 前缀）自清理并复核为零。用法: node scripts/verify-task23-wp2.js（PW_CHANNEL=chrome 可选）
// 截图输出 backup/2026-08-05-task23-wp2/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-05-task23-wp2');
const PORT = 15648;
const BASE = `http://localhost:${PORT}`;
const PWD = 'Wp23b-Test-2026!';
const EMAIL_OWNER = 'wp23b-owner@wowbutler.cn';

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

let serverProc = null, owner = null, ownerGuildId = null;
let dungeonId = null, testBossId = null, emptySeasonId = null, currentSeasonId = null;

async function setup() {
  // 当前赛季与副本锚点（is_current 缺省时与公示页同款回退：取最新赛季）
  const cs = await svc('GET', '/rest/v1/game_seasons?select=id,is_current,start_date&order=start_date.asc');
  const cur = cs.body.find(s => s.is_current) || cs.body[cs.body.length - 1];
  currentSeasonId = cur.id;
  const d = await svc('GET', `/rest/v1/game_dungeons?select=id&name=eq.${encodeURIComponent('毒牙祭坛')}`);
  dungeonId = d.body[0].id;

  // 测试 BOSS + 大秘境掉落（归属 BOSS 1 条 + 整体池 1 条 + 带特效 1 条）
  const b = await svc('POST', '/rest/v1/game_bosses', { dungeon_id: dungeonId, name: 'T23P公示王', boss_order: 90 });
  if (b.status !== 201) throw new Error('建测试 BOSS 失败');
  testBossId = b.body[0].id;
  const lootRows = [
    { dungeon_id: dungeonId, boss_id: testBossId, item_name: 'T23P毒牙之刃', slot: '武器', item_type: '单手剑', primary_stats: ['力量'], secondary_stats: ['爆击', '急速'], effect: '装备：攻击附带剧毒' },
    { dungeon_id: dungeonId, boss_id: testBossId, item_name: 'T23P毒牙头盔', slot: '头部', item_type: '板甲', primary_stats: ['力量'], secondary_stats: ['全能'], effect: null },
    { dungeon_id: dungeonId, boss_id: null, item_name: 'T23P整体池项坠', slot: '颈部', item_type: '项链', primary_stats: ['智力'], secondary_stats: [], effect: null },
  ];
  const l = await svc('POST', '/rest/v1/dungeon_loot', lootRows);
  if (l.status !== 201) throw new Error('建测试掉落失败: ' + JSON.stringify(l.body));

  // 空赛季（空态实测；start_date 取远古日期，避免成为「最新赛季」抢占默认视图）
  const es = await svc('POST', '/rest/v1/game_seasons', { name: 'T23P空赛季', start_date: '2020-01-01', is_current: false });
  if (es.status !== 201) throw new Error('建空赛季失败');
  emptySeasonId = es.body[0].id;

  // 登录用户（侧边栏入口测试）
  let res = await fetch(`${SB}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL_OWNER, password: PWD, data: { display_name: 'WP23B会长' } }),
  });
  let body = await res.json();
  if (!body.access_token) {
    res = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL_OWNER, password: PWD }),
    });
    body = await res.json();
  }
  owner = { uid: body.user.id, token: body.access_token };
  const g = await svc('POST', '/rest/v1/guilds', { name: 'WP23B入口会', owner_id: owner.uid, invite_code: 'W23B' + Date.now().toString(36).slice(-4).toUpperCase() });
  ownerGuildId = g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', { guild_id: ownerGuildId, user_id: owner.uid, role: 'owner', display_name: 'WP23B会长' });

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }
}

async function cleanup() {
  const steps = [];
  try { const r = await svc('DELETE', `/rest/v1/dungeon_loot?dungeon_id=eq.${dungeonId}&item_name=like.T23P*`); steps.push(`loot:${r.status}`); } catch { steps.push('loot:ERR'); }
  if (testBossId) { try { const r = await svc('DELETE', `/rest/v1/game_bosses?id=eq.${testBossId}`); steps.push(`boss:${r.status}`); } catch { steps.push('boss:ERR'); } }
  if (emptySeasonId) { try { const r = await svc('DELETE', `/rest/v1/game_seasons?id=eq.${emptySeasonId}`); steps.push(`season:${r.status}`); } catch { steps.push('season:ERR'); } }
  if (ownerGuildId) { try { const r = await svc('DELETE', `/rest/v1/guilds?id=eq.${ownerGuildId}`); steps.push(`guild:${r.status}`); } catch { steps.push('guild:ERR'); } }
  if (owner) { try { await fetch(`${SB}/auth/v1/admin/users/${owner.uid}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); } }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const c1 = await svc('GET', `/rest/v1/dungeon_loot?select=id&item_name=like.T23P*`);
  const c2 = await svc('GET', `/rest/v1/game_bosses?select=id&name=like.T23P*`);
  const c3 = await svc('GET', `/rest/v1/game_seasons?select=id&name=like.T23P*`);
  console.log(`[清理复核] T23P 掉落=${Array.isArray(c1.body) ? c1.body.length : '?'} BOSS=${Array.isArray(c2.body) ? c2.body.length : '?'} 赛季=${Array.isArray(c3.body) ? c3.body.length : '?'}`);
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await setup();

  // ---- 匿名安全抽测（与 WP1 矩阵互证） ----
  const anonH = { apikey: ANON, Authorization: `Bearer ${ANON}` };
  const ag = await fetch(`${SB}/rest/v1/guilds?select=*&limit=1`, { headers: anonH });
  const agBody = await ag.json().catch(() => null);
  check('匿名安全抽测：anon 读 guilds = 403/空集', ag.status !== 200 || (Array.isArray(agBody) && agBody.length === 0), `HTTP ${ag.status}`);
  const am = await fetch(`${SB}/rest/v1/raid_members?select=*&limit=1`, { headers: anonH });
  const amBody = await am.json().catch(() => null);
  check('匿名安全抽测：anon 读 raid_members = 403/空集', am.status !== 200 || (Array.isArray(amBody) && amBody.length === 0), `HTTP ${am.status}`);

  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const pageErrors = [];
  const notFounds = [];
  try {
    for (const vp of [{ width: 1366, height: 768, tag: '1366' }, { width: 1920, height: 1080, tag: '1920' }]) {
      // ---- 隐身窗口（未登录）直开 ----
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      page.on('pageerror', e => pageErrors.push(`pageerror(${vp.tag}): ` + e.message));
      page.on('console', msg => { if (msg.type() === 'error') pageErrors.push(`console(${vp.tag}): ` + msg.text()); });
      page.on('response', r => { if (r.status() === 404) notFounds.push(`${vp.tag}: ${r.url()}`); });

      await page.goto(`${BASE}/data.html`, { waitUntil: 'networkidle' });
      await sleep(2500);

      // 三区块渲染
      const blocks = await page.evaluate(() => {
        const t = document.getElementById('dpMain').innerText;
        return {
          raid: t.includes('团本掉落池'),
          mplus: t.includes('大秘境掉落池') && t.includes('大秘境'),
          tier: t.includes('套装一览'),
          testBoss: t.includes('T23P公示王'),
          bossItem: t.includes('T23P毒牙之刃'),
          poolGroup: t.includes('整体池'),
          poolItem: t.includes('T23P整体池项坠'),
          effect: t.includes('装备：攻击附带剧毒'),
          noLogin: !document.querySelector('#authEmail'),
        };
      });
      check(`[${vp.tag}] 隐身直开：三区块渲染（团本/大秘境/套装）`, blocks.raid && blocks.mplus && blocks.tier);
      check(`[${vp.tag}] 大秘境按 BOSS 分组（测试 BOSS+归属装备+整体池组）`, blocks.testBoss && blocks.bossItem && blocks.poolGroup && blocks.poolItem);
      check(`[${vp.tag}] 特效游戏绿文本渲染`, blocks.effect);
      check(`[${vp.tag}] 无登录表单（免登录页）`, blocks.noLogin);
      await page.screenshot({ path: path.join(SHOT_DIR, `${vp.tag}-raid-section.png`) });

      // 大秘境整体池视图切换
      await page.evaluate(() => {
        [...document.querySelectorAll('.dp-toggle')].find(b => b.dataset.view === 'pool').click();
      });
      await sleep(600);
      const poolView = await page.evaluate(() => {
        const t = document.getElementById('dpMain').innerText;
        return { poolItem: t.includes('T23P整体池项坠'), bossItem: t.includes('T23P毒牙之刃'), bossGroup: t.includes('T23P公示王') };
      });
      check(`[${vp.tag}] 整体池视图：全部条目平铺（无 BOSS 分组头）`, poolView.poolItem && poolView.bossItem && !poolView.bossGroup, JSON.stringify(poolView));
      // 滚到大秘境区块截图
      await page.evaluate(() => {
        const secs = [...document.querySelectorAll('.dp-section')];
        const s = secs.find(x => x.innerText.includes('大秘境掉落池'));
        if (s) s.scrollIntoView();
      });
      await sleep(300);
      await page.screenshot({ path: path.join(SHOT_DIR, `${vp.tag}-mplus-pool-view.png`) });
      // 切回按 BOSS 截图
      await page.evaluate(() => { [...document.querySelectorAll('.dp-toggle')].find(b => b.dataset.view === 'boss').click(); });
      await sleep(500);
      await page.screenshot({ path: path.join(SHOT_DIR, `${vp.tag}-mplus-boss-view.png`) });

      // 筛选搜索：关键词 T23P毒牙 → 团本区相应隐藏、大秘境剩 2 条
      await page.fill('#dpSearch', 'T23P毒牙');
      await sleep(600);
      const filtered = await page.evaluate(() => {
        const t = document.getElementById('dpMain').innerText;
        return { blade: t.includes('T23P毒牙之刃'), helm: t.includes('T23P毒牙头盔'), pool: t.includes('T23P整体池项坠') };
      });
      check(`[${vp.tag}] 搜索过滤生效（毒牙 2 条在、整体池项坠隐藏）`, filtered.blade && filtered.helm && !filtered.pool, JSON.stringify(filtered));
      await page.fill('#dpSearch', '');
      await sleep(500);

      // 部位筛选：头部 → 只剩头盔
      await page.selectOption('#dpSlotFilter', '头部');
      await sleep(600);
      const slotFiltered = await page.evaluate(() => {
        const t = document.getElementById('dpMain').innerText;
        return { blade: t.includes('T23P毒牙之刃'), helm: t.includes('T23P毒牙头盔') };
      });
      check(`[${vp.tag}] 部位筛选生效（头部=只剩头盔）`, !slotFiltered.blade && slotFiltered.helm, JSON.stringify(slotFiltered));
      await page.selectOption('#dpSlotFilter', '');
      await sleep(500);

      // 套装视图截图（S2 套装效果运营未录入时 bonus 行为空属数据现状；另切 S1 验证 2/4 件渲染）
      await page.evaluate(() => {
        const secs = [...document.querySelectorAll('.dp-section')];
        const s = secs.find(x => x.innerText.includes('套装一览'));
        if (s) s.scrollIntoView();
      });
      await sleep(300);
      const tierOk = await page.evaluate(() => document.querySelectorAll('.dp-tier').length > 0);
      check(`[${vp.tag}] 套装一览渲染（赛季×职业×专精卡片）`, tierOk);
      await page.screenshot({ path: path.join(SHOT_DIR, `${vp.tag}-tier-sets.png`) });
      // S1（效果已录入赛季）验证 2 件/4 件效果渲染
      const s1 = await svc('GET', `/rest/v1/game_seasons?select=id&name=eq.S1`);
      if (s1.body && s1.body[0]) {
        await page.selectOption('#dpSeasonSelect', s1.body[0].id);
        await sleep(800);
        const bonusOk = await page.evaluate(() => {
          const t = document.getElementById('dpMain').innerText;
          return t.includes('2 件') && t.includes('4 件') && document.querySelectorAll('.dp-tier-bonus').length > 0;
        });
        check(`[${vp.tag}] 套装 2/4 件效果渲染（S1 数据在案赛季）`, bonusOk);
        await page.selectOption('#dpSeasonSelect', currentSeasonId);
        await sleep(800);
      }

      // 赛季切换 → 空赛季空态（仅 1366 档做）
      if (vp.tag === '1366') {
        const seasonCount = await page.evaluate(() => document.getElementById('dpSeasonSelect').options.length);
        check('[1366] 赛季下拉含当前赛季与空赛季', seasonCount >= 2, `${seasonCount} 项`);
        await page.selectOption('#dpSeasonSelect', emptySeasonId);
        await sleep(800);
        const emptyState = await page.evaluate(() => {
          const t = document.getElementById('dpMain').innerText;
          return {
            raid: t.includes('该赛季团本数据维护中'),
            mplus: t.includes('该赛季大秘境数据维护中'),
            tier: t.includes('该赛季套装数据维护中'),
          };
        });
        check('[1366] 空赛季：三区块独立空态「数据维护中」', emptyState.raid && emptyState.mplus && emptyState.tier, JSON.stringify(emptyState));
        await page.screenshot({ path: path.join(SHOT_DIR, `${vp.tag}-empty-season.png`) });
        await page.selectOption('#dpSeasonSelect', currentSeasonId);
        await sleep(800);
      }

      await ctx.close();
    }

    // ---- 登录用户侧边栏入口（owner 视角；viewer/editor 同一无条件渲染） ----
    const ctxL = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageL = await ctxL.newPage();
    pageL.on('pageerror', e => pageErrors.push('pageerror(L): ' + e.message));
    pageL.on('dialog', d => d.accept());
    await pageL.goto(BASE, { waitUntil: 'networkidle' });
    await pageL.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
    await pageL.fill('#authEmail', EMAIL_OWNER);
    await pageL.fill('#authPassword', PWD);
    await pageL.click('#authLoginBtn');
    await pageL.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
    await sleep(2000);
    const navEntry = await pageL.evaluate(() => {
      const items = [...document.querySelectorAll('.nav-item')];
      return items.some(i => i.textContent.includes('数据公示'));
    });
    check('登录用户侧边栏「数据公示」入口可见', navEntry === true);
    const [popup] = await Promise.all([
      ctxL.waitForEvent('page', { timeout: 8000 }).catch(() => null),
      pageL.evaluate(() => {
        const items = [...document.querySelectorAll('.nav-item')];
        items.find(i => i.textContent.includes('数据公示')).click();
      }),
    ]);
    check('侧边栏入口新开标签页打开 data.html', !!popup && popup.url().includes('data.html'), popup ? popup.url() : '无弹窗');
    if (popup) { await popup.waitForLoadState('networkidle').catch(() => {}); await sleep(1500); await popup.close(); }
    await ctxL.close();

    const realErrors = pageErrors.filter(e => !e.includes('status of 406'));
    check('全程零 JS 报错（406=既有噪音已排除）', realErrors.length === 0, realErrors.join(' | ') || '无');
    check('全程零 404', notFounds.length === 0, notFounds.join(' | ') || '无');
  } finally {
    await browser.close();
  }

  await cleanup();

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#23 WP2 验证: ${passed}/${results.length} 通过，截图 → ${SHOT_DIR} =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
