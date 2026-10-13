// 任务书 #64-补丁 验证：团本赛季分组三补丁（①REQ-148 销项取证 / ②装备分配+心愿单团本下拉赛季分组 / ③picker 团本筛选分组）
// A 静态锚点：app.js 三助手定义+三处调用；optgroup 标签+is_current 缺失回退；
//   版本串 20261013.86（index×15/data×8/decor×5）+ 旧串 .85 三壳+js/ 零残留；
//   node --check app.js；git diff 变更集 ⊆ {app.js, 三壳}（补丁①零改动实证）。
// B 浏览器实测（自起服务器，端口 15665，登录测试账号 t64p-exp）：
//   B1 登录壳 #/team/lootdrop：共X件徽标 >30、点击展开五件（部位序 头肩胸手腿）、
//      sessionStorage dp23:collapsed tier: 前缀记忆、再点收起键移除（补丁①销项取证，双壳唯一渲染层 dataPublic.js）；
//   B2 装备分配「添加装备」→ #lootModal：#lootRaid optgroup 当前赛季(S2)置顶/历史赛季收尾、默认选中∈S2、
//      #lootBoss 联动非空、换 S1 虚影尖塔 BOSS 联动切换；
//   B3 心愿单「添加心愿」→ #wishlistModal：同款分组断言 + #wishlistBoss 联动；
//   B4 picker #itemDbModal：#itemDbRaidFilter 首 option 全部团本 + optgroup 两档、选虚影尖塔列表全含、
//      选回 '' REQ-149 折叠组在场且收起（回归不破）；
//   B5 全程 console 零报错（白名单：物品图标 404/装饰缺图回退/user_profiles 409）。
// C 清零：测试公会/测试账号删除复核。
// 用法: node scripts/verify-task64-patch.js
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 15665;
const BASE = `http://127.0.0.1:${PORT}`;
const VER = '20261013.86';
const VER_OLD = '20261013.85';
const EMAIL = 't64p-exp@example.com';
const PWD = 'T64p-Exp-2026!';
const GUILD_NAME = 'T64补丁测试会';
const S2_RAIDS = ['烈毒之渊', '潮缚石窟'];
const S1_RAIDS = ['虚影尖塔', '梦境裂隙', '进军奎尔丹纳斯', '孢陨幽境'];

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
const countStr = (s, sub) => s.split(sub).length - 1;

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

// ==================== A 静态锚点 ====================
function staticAsserts() {
  console.log('== A. 静态锚点 ==');
  const app = read('js/app.js');
  const index = read('index.html');
  const data = read('data.html');
  const decor = read('decor.html');

  // A1 三助手定义 + 三处调用
  check('A1a 三助手定义：seasonOfRaidName / getDefaultRaidName / buildRaidSeasonOptions',
    /function seasonOfRaidName\(raidName\)/.test(app) &&
    /function getDefaultRaidName\(\)/.test(app) &&
    /function buildRaidSeasonOptions\(selectedRaid = '', appendOther = false, raidList = null\)/.test(app), '');
  check('A1b 三处调用：lootInitRaidSelect / wishlistShowModal / renderItemDbList 均走 buildRaidSeasonOptions',
    /function lootInitRaidSelect\(selectedRaid = '', selectedBoss = ''\) \{[\s\S]{0,400}?buildRaidSeasonOptions\(selectedRaid, true\)/.test(app) &&
    /function wishlistShowModal\(wishId = null, presetData = null\) \{[\s\S]{0,800}?buildRaidSeasonOptions\('', true\)/.test(app) &&
    /'<option value="">全部团本<\/option>' \+ buildRaidSeasonOptions\(cur, false, keys\)/.test(app), '');
  check('A1c 默认团本三处改 getDefaultRaidName()（loot 空值默认 + wishlist 编辑/复制/添加回退）',
    /if \(!selectedRaid\) selectedRaid = getDefaultRaidName\(\);/.test(app) &&
    (app.match(/getDefaultRaidName\(\)/g) || []).length >= 4,
    `getDefaultRaidName 出现=${(app.match(/getDefaultRaidName\(\)/g) || []).length}`);

  // A2 助手产出 optgroup + is_current 缺失回退
  check('A2 buildRaidSeasonOptions：optgroup label「当前赛季（」/「历史赛季（」+ !cur 回退平面列表',
    /<optgroup label="当前赛季（\$\{cur\.name\}）">/.test(app) &&
    /<optgroup label="历史赛季（\$\{histNames\.join\('\/'\)\}）">/.test(app) &&
    /if \(!cur\) return raids\.map\(opt\)\.join\(''\) \+ tail;/.test(app), '');

  // A3 版本串
  check(`A3a 三壳版本串 ${VER}（index×15/data×8/decor×5）`,
    countStr(index, VER) === 15 && countStr(data, VER) === 8 && countStr(decor, VER) === 5,
    `实际=${countStr(index, VER)}/${countStr(data, VER)}/${countStr(decor, VER)}`);
  const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'));
  const jsResidual = jsFiles.filter(f => countStr(read('js/' + f), VER_OLD) > 0);
  check(`A3b 旧串 ${VER_OLD} 零残留（三壳 + js/ 全目录）`,
    [index, data, decor].every(s => countStr(s, VER_OLD) === 0) && jsResidual.length === 0,
    jsResidual.join(','));

  // A4 node --check
  const r = spawnSync(process.execPath, ['--check', 'js/app.js'], { cwd: ROOT, encoding: 'utf8' });
  check('A4 node --check js/app.js', r.status === 0, (r.stderr || '').trim().split('\n')[0]);

  // A5 git diff 变更集：业务代码仅 app.js + 三壳版本串（补丁①零改动实证）；文档登记（AGENTS.md/台账/修改报告）属批内合法伴生
  const diff = spawnSync('git', ['-c', 'core.quotepath=false', 'diff', '--name-only', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout
    .split('\n').filter(Boolean).map(s => s.trim());
  const allowed = new Set(['js/app.js', 'index.html', 'data.html', 'decor.html',
    'AGENTS.md', 'docs/问题与需求清单.md', 'docs/TASK-064-补丁-修改报告.md']);
  const frozen = ['js/dataPublic.js', 'js/lootTaxonomy.js', 'server.js', 'js/track.js'];
  check('A5 git diff 变更集 ⊆ 代码{app.js+三壳}+文档登记（dataPublic/lootTaxonomy/css/server/track 零触碰）',
    diff.length > 0 && diff.every(f => allowed.has(f)) && frozen.every(f => !diff.includes(f)) &&
    diff.every(f => !f.startsWith('css/')),
    diff.join(','));
}

// ==================== B 浏览器实测 ====================
let testUid = null, guildId = null;

async function ensureTestUser() {
  const list = await svcRest('GET', '/auth/v1/admin/users?page=1&per_page=500');
  const users = (list.body && (list.body.users || list.body)) || [];
  const hit = Array.isArray(users) ? users.find(u => (u.email || '').toLowerCase() === EMAIL) : null;
  if (hit) return hit.id;
  const c = await svcRest('POST', '/auth/v1/admin/users', { email: EMAIL, password: PWD, email_confirm: true, user_metadata: { display_name: 't64p-exp' } });
  return c.body && c.body.id;
}

async function newCtx(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const pg = await ctx.newPage();
  const errs = [], whitelist = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  pg.on('response', r => {
    const u = r.url();
    if (r.status() >= 400) {
      // 白名单：物品图标素材待运营入库（REQ-092/150 在案）、装饰缺图 onerror 回退（任务书 #51 在案）、user_profiles 409 设计内噪音
      if (/assets\/icons\/items\//.test(u) || /assets\/decor-icons\//.test(u)) { whitelist.push(u); return; }
      if (r.status() === 409 && /user_profiles/.test(u)) { whitelist.push(u); return; }
      errs.push(`http${r.status()} ${r.request().method()} ${u}`);
    }
  });
  return { ctx, pg, errs, whitelist };
}
// console「Failed to load resource」与已白名单的网络 4xx 一一冲抵
function realErrors(errs, whitelistCount) {
  let budget = whitelistCount;
  return errs.filter(e => {
    if (budget > 0 && e.startsWith('console: Failed to load resource: the server responded with a status of 4')) { budget--; return false; }
    return true;
  });
}

// 团本下拉分组通用断言采集（#lootRaid / #wishlistRaid / #itemDbRaidFilter 复用）
async function raidSelectInfo(pg, sel) {
  return pg.evaluate(sel => {
    const s = document.querySelector(sel);
    if (!s) return null;
    const groups = [...s.querySelectorAll('optgroup')].map(g => ({
      label: g.label,
      values: [...g.querySelectorAll('option')].map(o => o.value),
    }));
    const directOpts = [...s.children].filter(c => c.tagName === 'OPTION').map(o => ({ value: o.value, text: o.textContent.trim() }));
    return { value: s.value, groups, directOpts, allCount: s.querySelectorAll('option').length };
  }, sel);
}

async function liveAsserts() {
  console.log('== B. 浏览器实测 ==');
  testUid = await ensureTestUser();
  if (!testUid) { check('B-前置 测试账号就位', false); return; }
  // 清理上轮残留（幂等重跑）
  const oldG = await svcRest('GET', `/rest/v1/guilds?name=eq.${encodeURIComponent(GUILD_NAME)}&select=id`);
  for (const g of (Array.isArray(oldG.body) ? oldG.body : [])) {
    await svcRest('DELETE', `/rest/v1/guild_members?guild_id=eq.${g.id}`);
    await svcRest('DELETE', `/rest/v1/guilds?id=eq.${g.id}`);
  }
  const g = await svcRest('POST', '/rest/v1/guilds', { name: GUILD_NAME, owner_id: testUid, invite_code: 'T64PXPB1', server_name: '测试', server_region: '一区' });
  guildId = g.body && g.body[0] && g.body[0].id;
  await svcRest('POST', '/rest/v1/guild_members', [{ guild_id: guildId, user_id: testUid, role: 'owner', display_name: 't64p-exp' }]);

  await startServer();
  console.log('--- 服务器已起（端口 ' + PORT + '） ---');
  const browser = await chromium.launch({ headless: true });
  const P = await newCtx(browser);
  const pg = P.pg;

  // 登录（任务书 #59 门户化：游客落 #/home，先点「登录 / 注册」）
  await pg.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await pg.waitForSelector('#iaLoginBtn', { state: 'visible', timeout: 15000 });
  await pg.click('#iaLoginBtn');
  await pg.waitForSelector('#authEmail', { state: 'visible', timeout: 10000 });
  await pg.fill('#authEmail', EMAIL);
  await pg.fill('#authPassword', PWD);
  await pg.click('#authLoginBtn');
  await pg.waitForURL('**/index.html#/home', { timeout: 30000 });
  check('B-前置 登录成功落 #/home', true, '');
  // picker/下拉数据源=主数据（登录后异步拉取）——先等就绪防空列表竞态
  await pg.waitForFunction(() => window.MasterData && MasterData.getRaids && MasterData.getRaids().length > 0, { timeout: 30000 });

  // ========== B1 补丁①销项取证：登录壳 #/team/lootdrop 共X件展开 ==========
  await pg.goto(`${BASE}/index.html#/team/lootdrop`, { waitUntil: 'load' });
  await pg.waitForSelector('.dp-tier-count', { timeout: 30000 });
  const b1a = await pg.evaluate(() => ({
    badges: document.querySelectorAll('.dp-tier-count').length,
    firstText: (document.querySelector('.dp-tier-count') || { textContent: '' }).textContent.trim(),
  }));
  check('B1a 登录壳套装卡「共X件」徽标 >30（REQ-148 双壳唯一渲染层 dataPublic.js）',
    b1a.badges > 30, `徽标=${b1a.badges} 首钮=「${b1a.firstText}」`);
  await pg.locator('.dp-tier-count').first().click();
  await pg.waitForSelector('.dp-tier-pieces', { timeout: 5000 });
  const b1b = await pg.evaluate(() => {
    const rows = [...document.querySelectorAll('.dp-tier-pieces .dp-tier-piece')];
    return {
      n: rows.length,
      slots: rows.map(r => r.querySelector('.dp-tag').textContent.trim()),
      tierKeys: JSON.parse(sessionStorage.getItem('dp23:collapsed') || '[]').filter(x => String(x).startsWith('tier:')).length,
    };
  });
  const SLOT_EXPECT = ['头部', '肩部', '胸部', '手部', '腿部'];
  check('B1b 点击展开：5 件明细 + 部位序 = [头部,肩部,胸部,手部,腿部]',
    b1b.n === 5 && JSON.stringify(b1b.slots) === JSON.stringify(SLOT_EXPECT), JSON.stringify(b1b));
  check('B1c 展开态 sessionStorage 记忆（tier: 前缀入 dp23:collapsed）', b1b.tierKeys >= 1, `tier 键=${b1b.tierKeys}`);
  await pg.locator('.dp-tier-count').first().click();
  await sleep(300);
  const b1d = await pg.evaluate(() => ({
    pieces: document.querySelectorAll('.dp-tier-pieces').length,
    tierKeys: JSON.parse(sessionStorage.getItem('dp23:collapsed') || '[]').filter(x => String(x).startsWith('tier:')).length,
  }));
  check('B1d 再点收起：明细消失 + tier: 记忆键移除', b1d.pieces === 0 && b1d.tierKeys === 0, JSON.stringify(b1d));

  // ========== B2 补丁②装备分配：添加装备 → #lootModal ==========
  await pg.goto(`${BASE}/index.html#/team/loot`, { waitUntil: 'load' });
  await pg.waitForSelector('button[onclick="lootShowModal()"]', { state: 'visible', timeout: 30000 });
  await pg.click('button[onclick="lootShowModal()"]');
  await pg.waitForSelector('#lootModal.show', { timeout: 10000 });
  const b2a = await raidSelectInfo(pg, '#lootRaid');
  const b2aOk = b2a && b2a.groups.length === 2 &&
    b2a.groups[0].label === '当前赛季（S2）' &&
    b2a.groups[0].values.every(v => S2_RAIDS.includes(v)) &&
    b2a.groups[1].label.startsWith('历史赛季（') &&
    S2_RAIDS.includes(b2a.value) &&
    b2a.value === b2a.groups[0].values[0] &&
    b2a.directOpts.some(o => o.value === '其他');
  check('B2a #lootRaid 分组：当前赛季（S2）置顶 option⊆{烈毒之渊,潮缚石窟}、历史赛季收尾、默认选中=S2 首团本、「其他」追加',
    b2aOk, JSON.stringify(b2a));
  const b2b = await pg.evaluate(() => {
    const raid = document.getElementById('lootRaid').value;
    const opts = [...document.querySelectorAll('#lootBoss option')].map(o => o.value);
    return { raid, opts, expect: getGameBossNames(raid) };
  });
  check('B2b #lootBoss 联动：默认团本 BOSS 下拉非空且属该团本',
    b2b.opts.length > 0 && b2b.expect.length > 0 && b2b.opts.every(v => b2b.expect.includes(v)),
    `团本=${b2b.raid} BOSS数=${b2b.opts.length}`);
  await pg.selectOption('#lootRaid', '虚影尖塔');
  await sleep(300);
  const b2c = await pg.evaluate(() => {
    const raid = document.getElementById('lootRaid').value;
    const opts = [...document.querySelectorAll('#lootBoss option')].map(o => o.value);
    return { raid, opts, expect: getGameBossNames('虚影尖塔') };
  });
  check('B2c 换 S1「虚影尖塔」→ #lootBoss 选项随之变为其 BOSS 列表（联动过滤）',
    b2c.raid === '虚影尖塔' && b2c.opts.length > 0 && b2c.expect.length > 0 &&
    b2c.opts.every(v => b2c.expect.includes(v)) && b2c.expect.every(v => b2c.opts.includes(v)),
    `BOSS数=${b2c.opts.length} 样本=${b2c.opts.slice(0, 3)}`);

  // ========== B4 补丁③ picker：从装备库选择 → #itemDbModal（趁 lootModal 在场先做，免二次开合） ==========
  await pg.click('button[onclick="openItemDbPicker(\'loot\')"]');
  await pg.waitForSelector('#itemDbModal .item-card', { state: 'visible', timeout: 15000 });
  const b4a = await raidSelectInfo(pg, '#itemDbRaidFilter');
  const b4aOk = b4a && b4a.directOpts.length >= 1 && b4a.directOpts[0].value === '' && b4a.directOpts[0].text === '全部团本' &&
    b4a.groups.length === 2 &&
    b4a.groups[0].label === '当前赛季（S2）' && b4a.groups[0].values.every(v => S2_RAIDS.includes(v)) &&
    b4a.groups[1].label.startsWith('历史赛季（') && b4a.groups[1].values.some(v => S1_RAIDS.includes(v));
  check('B4a #itemDbRaidFilter：首 option value="" 文本「全部团本」+ optgroup 两档（当前赛季（S2）/历史赛季（…））',
    b4aOk, JSON.stringify(b4a));
  await pg.selectOption('#itemDbRaidFilter', '虚影尖塔');
  await sleep(400);
  const b4b = await pg.evaluate(() => {
    const cards = [...document.querySelectorAll('#itemDbModal .item-card')];
    return { n: cards.length, bad: cards.filter(c => !(c.querySelector('.item-card-source') || { textContent: '' }).textContent.includes('虚影尖塔')).length };
  });
  check('B4b 选「虚影尖塔」→ 列表卡 .item-card-source 全含虚影尖塔',
    b4b.n > 0 && b4b.bad === 0, `卡=${b4b.n} 越界=${b4b.bad}`);
  await pg.selectOption('#itemDbRaidFilter', '');
  await sleep(400);
  const b4c = await pg.evaluate(() => {
    const hist = document.querySelector('#itemDbModal .item-db-history');
    return { exists: !!hist, open: hist ? hist.classList.contains('open') : null,
      head: hist ? hist.querySelector('.item-db-history-head').textContent.trim() : '' };
  });
  check('B4c 选回「全部团本」→ REQ-149 折叠组 .item-db-history 在场且收起（回归不破）',
    b4c.exists && b4c.open === false, JSON.stringify(b4c));
  // 关 picker + 关 lootModal，避免遮罩干扰后续
  await pg.evaluate(() => { closeModal('itemDbModal'); closeModal('lootModal'); });
  await sleep(300);

  // ========== B3 补丁②心愿单：添加心愿 → #wishlistModal ==========
  await pg.goto(`${BASE}/index.html#/team/wishlist`, { waitUntil: 'load' });
  await pg.waitForSelector('button[onclick="wishlistShowModal()"]', { state: 'visible', timeout: 30000 });
  await pg.click('button[onclick="wishlistShowModal()"]');
  await pg.waitForSelector('#wishlistModal.show', { timeout: 10000 });
  const b3a = await raidSelectInfo(pg, '#wishlistRaid');
  const b3aOk = b3a && b3a.groups.length === 2 &&
    b3a.groups[0].label === '当前赛季（S2）' &&
    b3a.groups[0].values.every(v => S2_RAIDS.includes(v)) &&
    b3a.groups[1].label.startsWith('历史赛季（') &&
    S2_RAIDS.includes(b3a.value) &&
    b3a.value === b3a.groups[0].values[0] &&
    b3a.directOpts.some(o => o.value === '其他');
  check('B3a #wishlistRaid 分组：当前赛季（S2）置顶、历史赛季收尾、默认选中=S2 首团本、「其他」追加',
    b3aOk, JSON.stringify(b3a));
  const b3b = await pg.evaluate(() => {
    const raid = document.getElementById('wishlistRaid').value;
    const bossSel = document.getElementById('wishlistBoss');
    const opts = bossSel ? [...bossSel.querySelectorAll('option')].map(o => o.value).filter(v => v !== '') : [];
    return { raid, opts, expect: getGameBossNames(raid), visible: bossSel && bossSel.style.display !== 'none' };
  });
  check('B3b #wishlistBoss 联动：默认团本 BOSS 下拉非空且属该团本',
    b3b.opts.length > 0 && b3b.expect.length > 0 && b3b.opts.every(v => b3b.expect.includes(v)),
    `团本=${b3b.raid} BOSS数=${b3b.opts.length}`);
  await pg.selectOption('#wishlistRaid', '虚影尖塔');
  await sleep(300);
  const b3c = await pg.evaluate(() => {
    const raid = document.getElementById('wishlistRaid').value;
    const opts = [...document.querySelectorAll('#wishlistBoss option')].map(o => o.value).filter(v => v !== '');
    return { raid, opts, expect: getGameBossNames('虚影尖塔') };
  });
  check('B3c 换 S1「虚影尖塔」→ #wishlistBoss 选项随之变为其 BOSS 列表（联动过滤）',
    b3c.raid === '虚影尖塔' && b3c.opts.length > 0 && b3c.expect.length > 0 &&
    b3c.opts.every(v => b3c.expect.includes(v)) && b3c.expect.every(v => b3c.opts.includes(v)),
    `BOSS数=${b3c.opts.length} 样本=${b3c.opts.slice(0, 3)}`);

  // ========== B5 console 零报错 ==========
  const real = realErrors(P.errs, P.whitelist.length);
  check('B5 全程 console 零报错（白名单：物品图标 404 素材待入库/缺图回退/409 设计内）',
    real.length === 0, real.slice(0, 3).join(' | '));

  await browser.close();
}

// ==================== C 清零 ====================
async function cleanup() {
  console.log('== C. 清零 ==');
  if (guildId) {
    await svcRest('DELETE', `/rest/v1/guild_members?guild_id=eq.${guildId}`);
    await svcRest('DELETE', `/rest/v1/guilds?id=eq.${guildId}`);
  }
  if (testUid) await svcRest('DELETE', `/rest/v1/auth/v1/admin/users/${testUid}`);
  const g = await svcRest('GET', `/rest/v1/guilds?name=eq.${encodeURIComponent(GUILD_NAME)}&select=id`);
  const u = await svcRest('GET', `/rest/v1/auth/v1/admin/users?page=1&per_page=500`);
  const uu = (u.body && (u.body.users || u.body)) || [];
  const users = Array.isArray(uu) ? uu : [];
  check('C1 测试公会/测试账号清零', (!Array.isArray(g.body) || g.body.length === 0) && !users.some(x => (x.email || '').toLowerCase() === EMAIL), '');
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
