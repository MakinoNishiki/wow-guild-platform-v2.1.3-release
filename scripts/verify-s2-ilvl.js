// S2-装等批次 子批A 验收（REQ-116）：boss_loot/dungeon_loot.ilvl 全链路
// 覆盖（任务口径）：
//   A. 静态断言：①dataPublic.js ilvl meta tag 渲染行+REQ-116 同档绑定注释；②app.js 双表单 ilvl 字段/
//      正整数校验/payload 恒携带（各 ×2）；③两壳版本串 20260816.62 计数（index 11 / data 7，含顶部注释）
//      且旧串 20260811.61 零残留；④changelog 三条新条目在场（stat-tier-fix/loot-ilvl/darknight-rollback）
//      + 1026-final date=2026-08-16；
//      ⑤node --check js/app.js / js/dataPublic.js。
//   B. 公开壳真浏览器（data.html 免登录）：「物品等级」tag 数=320（当前赛季 S2 全量非空）；
//      乌拉特克卡片区全为「物品等级 344」；任一「物品等级 311」在场；零 JS 报错/零 404
//      （物品图标 assets/icons/items/*.png 未入本仓库为既有环境缺口，另行列示不计入）；
//      B3b. BUG-101 数值同档订正（sql/27）：觉醒外衣卡片 chips=敏捷+162/智力+162/急速+130/精通+58
//      （装等 318 配史诗档值，Frankenstein 态视觉闭环）。
//   C. RPC 层：get_public_loot_detail 每行带 ilvl 键；当前赛季 total/has_key/non_null=320/320/320；
//      S1 行 ilvl 全 null；抽断 乌拉特克=344 / S2 大米=311；
//      C5. BUG-101：RPC 觉醒外衣 primary/secondary_values=史诗档值（162/162/130/58）。
//   D. 数据中心主链路真浏览器实测（超管）：团本掉落（烈毒之渊/乌拉特克）T116 行 填344保存读回 →
//      填0拦截（toast「物品等级必须为正整数」+弹窗不关+库内不变）→ 清空保存读回 null；
//      大秘境掉落（毒牙祭坛整体池）T116 行 填311保存读回。
//   E. T116 数据/测试用户/公会清零复核；逐项 ✓/✗ 汇总，任一 ✗ 退出码 1。
// 用法: node scripts/verify-s2-ilvl.js（PW_CHANNEL=chrome 可选）
// 截图输出 backup/2026-08-16-s2-ilvl/
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-16-s2-ilvl');
const PORT = 15816;
const BASE = `http://localhost:${PORT}`;
const PWD = 'T116-Test-2026!';
const EMAIL = 't116-admin@wowbutler.cn';
const VER = '20260816.62';
const BOSS_ID_WULATAKE = 'b9b78e39-bc74-48e4-9206-367bb7a59836'; // 烈毒之渊 8号 乌拉特克
const DUNGEON_ID_DUYA = 'cd8ed84e-637b-403e-a2f6-360eafc00cdf';  // 毒牙祭坛
const ITEM_BOSS = 'T116装等验收项坠';
const ITEM_DUNG = 'T116装等验收指环';

const t0 = Date.now();
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
async function readIlvl(table, name) {
  const r = await svc('GET', `/rest/v1/${table}?select=ilvl&item_name=eq.${encodeURIComponent(name)}`);
  return Array.isArray(r.body) && r.body.length ? r.body[0].ilvl : `<读回失败:${r.status}>`;
}

let serverProc = null, userU = null, guildId = null, currentSeasonId = null;

async function setup() {
  // T116 前缀残留清扫 + 旧测试用户/公会清扫
  await svc('DELETE', `/rest/v1/boss_loot?item_name=like.T116*`);
  await svc('DELETE', `/rest/v1/dungeon_loot?item_name=like.T116*`);
  const oldG = await svc('GET', `/rest/v1/guilds?select=id&name=like.T116*`);
  for (const g of (Array.isArray(oldG.body) ? oldG.body : [])) await svc('DELETE', `/rest/v1/guilds?id=eq.${g.id}`);
  const lu = await fetch(`${SB}/auth/v1/admin/users?per_page=50`, { headers: SVC });
  const lj = await lu.json();
  const hit = (lj.users || []).find(u => u.email === EMAIL);
  if (hit) await fetch(`${SB}/auth/v1/admin/users/${hit.id}`, { method: 'DELETE', headers: SVC });

  const cur = await svc('GET', '/rest/v1/game_seasons?select=id&is_current=eq.true&limit=1');
  currentSeasonId = cur.body[0].id;

  // 测试用户 → superadmin（浏览器登录在置权之后，JWT 自然带 claim）
  let res = await fetch(`${SB}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PWD, data: { display_name: 'T116超管' } }),
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
  const sa = await fetch(`${SB}/auth/v1/admin/users/${userU.uid}`, {
    method: 'PUT', headers: SVC, body: JSON.stringify({ app_metadata: { role: 'superadmin' } }),
  });
  if (sa.status !== 200) throw new Error('置 superadmin 失败: ' + sa.status);
  const g = await svc('POST', '/rest/v1/guilds', { name: 'T116装等验收会', owner_id: userU.uid, invite_code: 'T116' + Date.now().toString(36).slice(-4).toUpperCase() });
  guildId = g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', [{ guild_id: guildId, user_id: userU.uid, role: 'owner', display_name: 'T116超管' }]);

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }
}
async function cleanup() {
  const steps = [];
  try { const r = await svc('DELETE', `/rest/v1/boss_loot?item_name=like.T116*`); steps.push(`boss:${r.status}`); } catch { steps.push('boss:ERR'); }
  try { const r = await svc('DELETE', `/rest/v1/dungeon_loot?item_name=like.T116*`); steps.push(`dung:${r.status}`); } catch { steps.push('dung:ERR'); }
  if (guildId) { try { const r = await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`); steps.push(`guild:${r.status}`); } catch { steps.push('guild:ERR'); } }
  if (userU) { try { await fetch(`${SB}/auth/v1/admin/users/${userU.uid}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); } }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const c1 = await svc('GET', `/rest/v1/boss_loot?select=id&item_name=like.T116*`);
  const c2 = await svc('GET', `/rest/v1/dungeon_loot?select=id&item_name=like.T116*`);
  const c3 = await svc('GET', `/rest/v1/guilds?select=id&name=like.T116*`);
  check('[清理复核] T116 前缀掉落/公会全 0', c1.body.length === 0 && c2.body.length === 0 && c3.body.length === 0,
    `boss=${c1.body.length} dung=${c2.body.length} guild=${c3.body.length}`);
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await setup();

  // ==================== A. 静态断言 ====================
  const dpSrc = fs.readFileSync(path.join(ROOT, 'js', 'dataPublic.js'), 'utf8');
  check('A1 dataPublic.js：ilvl meta 行首 tag 渲染行 + REQ-116 同档绑定注释钉死',
    dpSrc.includes("${l.ilvl != null ? `<span class=\"dp-tag\">物品等级 ${esc(l.ilvl)}</span>` : ''}")
    && dpSrc.includes('REQ-116（S2-装等批次）') && dpSrc.includes('同档绑定'));
  const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  const cnt = (s, sub) => s.split(sub).length - 1;
  check('A2 app.js 双表单：ilvl 字段/正整数校验/toast/payload 恒携带 各 ×2（boss_loot+dungeon_loot）',
    cnt(appSrc, "{ key: 'ilvl', label: '物品等级', type: 'number' }") === 2
    && cnt(appSrc, '!Number.isInteger(out.ilvl) || out.ilvl <= 0') === 2
    && cnt(appSrc, "showToast('物品等级必须为正整数', 'error')") === 2
    && cnt(appSrc, 'payload.ilvl = (out.ilvl === undefined) ? null : out.ilvl;') === 2,
    `字段=${cnt(appSrc, "{ key: 'ilvl', label: '物品等级', type: 'number' }")} 校验=${cnt(appSrc, '!Number.isInteger(out.ilvl) || out.ilvl <= 0')} payload=${cnt(appSrc, 'payload.ilvl = (out.ilvl === undefined) ? null : out.ilvl;')}`);
  const idxSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const datSrc = fs.readFileSync(path.join(ROOT, 'data.html'), 'utf8');
  const vIdx = (idxSrc.match(/20260816\.62/g) || []).length, vDat = (datSrc.match(/20260816\.62/g) || []).length;
  check('A3 两壳版本串 20260816.62 计数（index=11 / data=7，含顶部注释）且旧串 .61 零残留',
    vIdx === 11 && vDat === 7 && !idxSrc.includes('20260811.61') && !datSrc.includes('20260811.61'), `index=${vIdx} data=${vDat}`);
  const clDate = id => {
    const i = appSrc.indexOf(`id: '${id}'`);
    return i === -1 ? null : (appSrc.slice(i, i + 400).match(/date: '([^']+)'/) || [])[1] || null;
  };
  check('A4 changelog：s2-stat-tier-fix / s2-loot-ilvl / s2-darknight-rollback 三条在场 + 1026-final date=2026-08-16',
    clDate('v3.2.0-s2-stat-tier-fix') === '2026-08-16' && clDate('v3.2.0-s2-loot-ilvl') === '2026-08-16' && clDate('v3.2.0-s2-darknight-rollback') === '2026-08-16'
    && clDate('v3.2.0-addon-1026-final') === '2026-08-16',
    `fix=${clDate('v3.2.0-s2-stat-tier-fix')} ilvl=${clDate('v3.2.0-s2-loot-ilvl')} rollback=${clDate('v3.2.0-s2-darknight-rollback')} 1026=${clDate('v3.2.0-addon-1026-final')}`);
  const nc1 = spawnSync(process.execPath, ['--check', path.join(ROOT, 'js', 'app.js')], { encoding: 'utf8' });
  const nc2 = spawnSync(process.execPath, ['--check', path.join(ROOT, 'js', 'dataPublic.js')], { encoding: 'utf8' });
  check('A5 node --check js/app.js + js/dataPublic.js 语法通过', nc1.status === 0 && nc2.status === 0, `${nc1.status}/${nc2.status}`);

  // ==================== B. 公开壳真浏览器（T116 样本插入前，320 口径纯净） ====================
  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const pubErrors = [], pub404 = [];
  try {
    const ctxB = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageB = await ctxB.newPage();
    pageB.setDefaultTimeout(30000);
    pageB.on('pageerror', e => pubErrors.push('pageerror: ' + e.message));
    pageB.on('console', msg => { if (msg.type() === 'error') pubErrors.push('console: ' + msg.text()); });
    pageB.on('response', r => { if (r.status() === 404) pub404.push(r.url()); });
    await pageB.goto(`${BASE}/data.html`, { waitUntil: 'networkidle' });
    await pageB.waitForSelector('#dpMain .dp-item', { state: 'visible', timeout: 20000 });
    await sleep(1500);
    const b = await pageB.evaluate(() => {
      const cards = [...document.querySelectorAll('#dpMain .dp-item')];
      const tags = [...document.querySelectorAll('#dpMain .dp-tag')].filter(t => t.textContent.trim().startsWith('物品等级'));
      const wlkCards = cards.filter(c => ((c.querySelector('.dp-item-src') || {}).textContent || '').includes('乌拉特克'));
      const wlk344 = wlkCards.filter(c => [...c.querySelectorAll('.dp-tag')].some(t => t.textContent.trim() === '物品等级 344'));
      const sel = document.getElementById('dpSeasonSelect');
      const jx = cards.find(c => ((c.querySelector('.dp-item-name') || {}).textContent || '').trim() === '觉醒外衣');
      const jxTags = jx ? [...jx.querySelectorAll('.dp-tag')].map(t => t.textContent.trim().replace(/\s+/g, '')) : [];
      return {
        cards: cards.length, tags: tags.length,
        wlk: wlkCards.length, wlk344: wlk344.length,
        any311: tags.some(t => t.textContent.trim() === '物品等级 311'),
        season: sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : '?',
        jxTags,
      };
    });
    check('B1 公开壳「物品等级」tag 数 = 320（当前赛季全量非空）', b.tags === 320, `tag=${b.tags} 卡=${b.cards} 赛季=${b.season}`);
    check('B2 烈毒之渊 8号 乌拉特克 卡片区全为「物品等级 344」', b.wlk > 0 && b.wlk344 === b.wlk, `乌拉特克卡=${b.wlk} 含344=${b.wlk344}`);
    check('B3 任一大米卡片出现「物品等级 311」', b.any311);
    check('B3b BUG-101 同档订正：觉醒外衣 chips=敏捷+162/智力+162/急速+130/精通+58',
      ['敏捷+162', '智力+162', '急速+130', '精通+58'].every(x => (b.jxTags || []).includes(x)),
      `实得=${(b.jxTags || []).join('/')}`);
    await pageB.screenshot({ path: path.join(SHOT_DIR, 'public-1366-ilvl-tags.png'), fullPage: false });
    // 乌拉特克分组滚动取证截图
    await pageB.evaluate(() => {
      const c = [...document.querySelectorAll('#dpMain .dp-item')].find(x => ((x.querySelector('.dp-item-src') || {}).textContent || '').includes('乌拉特克'));
      if (c) c.scrollIntoView({ block: 'center' });
    });
    await sleep(400);
    await pageB.screenshot({ path: path.join(SHOT_DIR, 'public-wulatake-344.png'), fullPage: false });
    await ctxB.close();
  } catch (e) {
    check('B 公开壳浏览器流程异常中断', false, e.message);
  }

  // ==================== C. RPC 层 ====================
  const rpc = await rpcPublic();
  const rows = Array.isArray(rpc.body) ? rpc.body : [];
  const s2 = rows.filter(r => r.season_id === currentSeasonId);
  const s1 = rows.filter(r => r.season_id !== currentSeasonId);
  check('C1 RPC 每行带 ilvl 键（白名单透出）', rows.length > 0 && rows.every(r => 'ilvl' in r), `行=${rows.length}`);
  check('C2 当前赛季 total/has_key/non_null = 320/320/320',
    s2.length === 320 && s2.filter(r => 'ilvl' in r).length === 320 && s2.filter(r => r.ilvl != null).length === 320,
    `${s2.length}/${s2.filter(r => 'ilvl' in r).length}/${s2.filter(r => r.ilvl != null).length}`);
  check('C3 S1 赛季行 ilvl 全 null（存量不回填）', s1.length > 0 && s1.every(r => r.ilvl === null), `S1 行=${s1.length}`);
  const wlkRpc = s2.filter(r => r.boss_name === '乌拉特克');
  const dungRpc = s2.filter(r => r.source === 'dungeon');
  check('C4 抽断：乌拉特克 ilvl 全 344 + S2 大米 ilvl 全 311',
    wlkRpc.length === 13 && wlkRpc.every(r => r.ilvl === 344) && dungRpc.length > 0 && dungRpc.every(r => r.ilvl === 311),
    `乌拉特克=${wlkRpc.length}行 大米=${dungRpc.length}行`);
  const jxRpc = s2.find(r => r.item_name === '觉醒外衣');
  check('C5 BUG-101 同档订正 RPC 层：觉醒外衣 values=敏捷162/智力162/急速130/精通58（sql/27）',
    !!(jxRpc && jxRpc.primary_values && jxRpc.primary_values['敏捷'] === 162 && jxRpc.primary_values['智力'] === 162
      && jxRpc.secondary_values && jxRpc.secondary_values['急速'] === 130 && jxRpc.secondary_values['精通'] === 58),
    jxRpc ? `P=${JSON.stringify(jxRpc.primary_values)} S=${JSON.stringify(jxRpc.secondary_values)}` : '未找到行');

  // ==================== D. 数据中心主链路真浏览器实测 ====================
  // T116 样本行（boss 挂乌拉特克 / dungeon 挂毒牙祭坛整体池 boss_id=null）
  const ins1 = await svc('POST', '/rest/v1/boss_loot', { boss_id: BOSS_ID_WULATAKE, item_name: ITEM_BOSS, slot: '颈部', item_type: '项链' });
  const ins2 = await svc('POST', '/rest/v1/dungeon_loot', { dungeon_id: DUNGEON_ID_DUYA, boss_id: null, item_name: ITEM_DUNG, slot: '手指', item_type: '戒指' });
  check('D0 T116 样本行写入（boss_loot+dungeon_loot）', ins1.status === 201 && ins2.status === 201, `${ins1.status}/${ins2.status}`);

  const dcErrors = [], dc404 = [], dcNoise409 = [];
  const modalOpen = () => document.getElementById('mdEditorModal').classList.contains('show');
  try {
    const ctxD = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await ctxD.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', e => dcErrors.push('pageerror: ' + e.message));
    page.on('console', msg => { if (msg.type() === 'error') dcErrors.push('console: ' + msg.text()); });
    page.on('response', r => { if (r.status() === 404) dc404.push(r.url()); });
    page.on('response', r => { if (r.status() === 406 || r.status() === 409) dcNoise409.push(`${r.status()} ${r.url()}`); });
    const toastSeen = async (text) => {
      try {
        await page.waitForFunction(t => (document.getElementById('toastContainer') || {}).textContent?.includes(t), text, { timeout: 15000 });
        return true;
      } catch { return false; }
    };

    // 登录（index.html → 邮箱/密码 → 登录按钮）
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
    await page.fill('#authEmail', EMAIL);
    await page.fill('#authPassword', PWD);
    await page.click('#authLoginBtn');
    await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
    await sleep(1500);
    const navDcShown = await page.evaluate(() => {
      const el = document.getElementById('navDatacenter');
      return el && el.style.display !== 'none';
    });
    check('D1 超管登录后「数据中心」页签可见（superadmin claim 生效）', !!navDcShown);

    // 数据中心 → 团本掉落（掉落池 tab）→ 烈毒之渊 / 8号 乌拉特克
    await page.click('.nav-item[data-page="datacenter"]');
    await page.waitForSelector('#page-datacenter.active #mdTabs', { timeout: 20000 });
    await sleep(800);
    await page.click('#mdTabs .view-tab[data-mdtab="loot"]');
    await page.waitForSelector('#mdPanel select', { timeout: 15000 });
    await page.selectOption('#mdPanel select >> nth=0', { label: '烈毒之渊' });
    await sleep(400);
    await page.selectOption('#mdPanel select >> nth=1', { label: '8号 乌拉特克' });
    await sleep(400);
    const rowVisible = await page.locator('#mdPanel tr', { hasText: ITEM_BOSS }).count();
    check('D2 团本掉落列表定位 T116 行（烈毒之渊/乌拉特克）', rowVisible === 1, `行=${rowVisible}`);

    // D3 编辑 → 物品等级填 344 → 保存 → toast「已保存」→ REST 读回 344
    await page.locator('#mdPanel tr', { hasText: ITEM_BOSS }).locator('button[title="编辑"]').click();
    await page.waitForFunction(modalOpen, null, { timeout: 10000 });
    const ilvlInit = await page.inputValue('#mdField_ilvl');
    await page.fill('#mdField_ilvl', '344');
    await page.screenshot({ path: path.join(SHOT_DIR, 'dc-loot-edit-344-modal.png'), fullPage: false });
    await page.click('#mdEditorSaveBtn');
    const d3Toast = await toastSeen('已保存');
    await page.waitForFunction(() => !document.getElementById('mdEditorModal').classList.contains('show'), null, { timeout: 10000 }).catch(() => {});
    const modalClosed1 = await page.evaluate(() => !document.getElementById('mdEditorModal').classList.contains('show'));
    const rb1 = await readIlvl('boss_loot', ITEM_BOSS);
    check('D3 填 344 保存：toast「已保存」+ 弹窗关闭 + REST 读回 ilvl=344', ilvlInit === '' && d3Toast && modalClosed1 && rb1 === 344,
      `初值="${ilvlInit}" toast=${d3Toast} 关=${modalClosed1} 读回=${rb1}`);

    // D4 失败路径：填 0 → toast「物品等级必须为正整数」+ 弹窗不关 + 库内不变（仍 344）
    await page.locator('#mdPanel tr', { hasText: ITEM_BOSS }).locator('button[title="编辑"]').click();
    await page.waitForFunction(modalOpen, null, { timeout: 10000 });
    await page.fill('#mdField_ilvl', '0');
    await page.click('#mdEditorSaveBtn');
    const d4Toast = await toastSeen('物品等级必须为正整数');
    await sleep(800);
    const modalStillOpen = await page.evaluate(modalOpen);
    await page.screenshot({ path: path.join(SHOT_DIR, 'dc-loot-invalid-0-blocked.png'), fullPage: false });
    const rb2 = await readIlvl('boss_loot', ITEM_BOSS);
    check('D4 填 0 拦截：toast「物品等级必须为正整数」+ 弹窗不关 + 库内仍 344', d4Toast && modalStillOpen && rb2 === 344,
      `toast=${d4Toast} 弹窗开=${modalStillOpen} 读回=${rb2}`);

    // D5 清空物品等级 → 保存 → 读回 null（恒携带 payload 口径）
    await page.fill('#mdField_ilvl', '');
    await page.click('#mdEditorSaveBtn');
    const d5Toast = await toastSeen('已保存');
    await page.waitForFunction(() => !document.getElementById('mdEditorModal').classList.contains('show'), null, { timeout: 10000 }).catch(() => {});
    const rb3 = await readIlvl('boss_loot', ITEM_BOSS);
    check('D5 清空保存：toast「已保存」+ 读回 ilvl=null（清空=NULL 生效）', d5Toast && rb3 === null, `toast=${d5Toast} 读回=${JSON.stringify(rb3)}`);

    // D6 大秘境掉落：毒牙祭坛整体池 T116 行 填 311 保存读回
    await page.click('#mdTabs .view-tab[data-mdtab="dungeonloot"]');
    await page.waitForSelector('#mdPanel select', { timeout: 15000 });
    await page.selectOption('#mdPanel select >> nth=0', { label: '毒牙祭坛' });
    await sleep(400);
    const bossSelVal = await page.evaluate(() => document.querySelectorAll('#mdPanel select')[1].value);
    const dRowVisible = await page.locator('#mdPanel tr', { hasText: ITEM_DUNG }).count();
    check('D6a 大秘境掉落列表定位 T116 行（毒牙祭坛/整体池）', bossSelVal === '' && dRowVisible === 1, `bossSel="${bossSelVal}" 行=${dRowVisible}`);
    await page.locator('#mdPanel tr', { hasText: ITEM_DUNG }).locator('button[title="编辑"]').click();
    await page.waitForFunction(modalOpen, null, { timeout: 10000 });
    await page.fill('#mdField_ilvl', '311');
    await page.screenshot({ path: path.join(SHOT_DIR, 'dc-dungeon-edit-311-modal.png'), fullPage: false });
    await page.click('#mdEditorSaveBtn');
    const d6Toast = await toastSeen('已保存');
    await page.waitForFunction(() => !document.getElementById('mdEditorModal').classList.contains('show'), null, { timeout: 10000 }).catch(() => {});
    const rb4 = await readIlvl('dungeon_loot', ITEM_DUNG);
    check('D6b 大米表单填 311 保存：toast「已保存」+ REST 读回 ilvl=311', d6Toast && rb4 === 311, `toast=${d6Toast} 读回=${rb4}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'dc-dungeon-after-save.png'), fullPage: false });
    await ctxD.close();
  } catch (e) {
    check('D 数据中心浏览器流程异常中断', false, e.message);
  }

  // 报错/404 汇总：图标素材 404 为既有环境缺口（assets/icons/items 未入本仓库，DB 已挂 icon_id），另行列示；
  // 406/409 资源状态码为既有噪音口径（同 verify-task43/task46 先例，另行列示）
  const isNoise = e => e.includes('status of 404') || e.includes('status of 406') || e.includes('status of 409');
  const isIcon404 = u => u.includes('assets/icons/items/');
  const pubRealErr = pubErrors.filter(e => !isNoise(e));
  const pubReal404 = pub404.filter(u => !isIcon404(u));
  check('B4 公开壳零 JS 报错（图标 404 / 406/409 资源状态码噪音另行列示）', pubRealErr.length === 0, pubRealErr.join(' | ') || '无');
  check('B5 公开壳零 404（物品图标素材除外）', pubReal404.length === 0,
    `非图标404=${pubReal404.length} 图标404=${pub404.filter(isIcon404).length}（既有缺口：素材未入本仓库）`);
  const dcNoise = dcErrors.filter(isNoise); // 另行列示：406/409 资源状态码
  const dcRealErr = dcErrors.filter(e => !isNoise(e) && !e.includes('数据中心保存失败')); // D4 主动失败路径的 console.error 取证噪音
  const dcReal404 = dc404.filter(u => !isIcon404(u));
  check('D7 登录壳零 JS 报错（D4 主动校验失败 console.error + 406/409 噪音另行列示）', dcRealErr.length === 0,
    dcRealErr.join(' | ') || `无（噪音 ${dcNoise.length} 条：406/409 资源状态码）`);
  check('D8 登录壳零 404', dcReal404.length === 0, dcReal404.join(' | ') || '无');
  if (dcNoise409.length) console.log('  [噪音取证] ' + dcNoise409.join(' | '));
  await browser.close();

  await cleanup();

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== S2-装等批次 子批A 验收: ${passed}/${results.length} 通过，耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s，截图 → ${SHOT_DIR} =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => {
  console.error('[验证脚本异常]', e);
  try { await cleanup(); } catch {}
  process.exit(1);
});
