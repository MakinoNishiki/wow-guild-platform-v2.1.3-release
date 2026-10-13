// 任务书 #66 验证：体验优化小批
// ①masterDataSnapshot seasons 补全两行真实数据；②lootShowModal/wishlistShowModal/openItemDbPicker
//   转 async + 首行 await MasterData.init()；③buildRaidSeasonOptions 空当前赛季组平面回退+历史组无名退化；
//   ④getMasterLootItems 接 boss_loot.ilvl + picker 卡 meta 非空段拼接；⑤server.js HTML 缓存头三件套；
//   ⑥版本串 20261013.87（index×15/data×8/decor×5）。
// A 静态锚点 + A7 npm test（server-security，server.js 本批有改动）+ A8 冻结零触碰。
// B 浏览器实测（自起服务器，端口 15666，登录测试账号 t66-exp）：
//   B1 正常态三处团本下拉 optgroup 两档（当前赛季（S2）置顶/历史赛季收尾，默认烈毒之渊，picker「全部团本」置顶）；
//   B2 快照兜底态：route 拦截 **/rest/v1/game_* 全 abort → 三弹窗不报错、下拉有选项（平面回退）、
//      当前赛季组不得为空 optgroup、虚影尖塔 BOSS 联动出快照 BOSS（元首阿福扎恩）；
//   B3 ilvl：picker S2 卡 meta 含「装等3xx」、全列表无裸「装等」尾巴、S1 卡无「装等」段、
//      公示页 #/team/lootdrop「物品等级 X」回归不破；
//   B4 缓存头：/ /data.html /decor.html → no-cache,no-store,must-revalidate + Pragma + Expires；
//      /js/app.js?v=20261013.87 → 无 no-store；
//   B5 toLowerCase 猎捕：全开流程（搜索框/弹窗开合/picker 全链路/双保存/七页签切换）零 TypeError；
//   B6 picker 主链路回归：选中→确认→弹窗关闭+装备名回填分配行。
// C 清零：B5 写入的测试装备/心愿逐条删除复核 + 测试公会/测试账号清零。
// 用法: node scripts/verify-task66.js
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 15666;
const BASE = `http://127.0.0.1:${PORT}`;
const VER = '20261013.87';
const VER_OLD = '20261013.86';
const EMAIL = 't66-exp@example.com';
const PWD = 'T66-Exp-2026!';
const GUILD_NAME = 'T66测试会';
const MEMBER_NAME = 'T66测试员';
const LOOT_MARK = 'T66验证装备';
const WISH_MARK = 'T66验证心愿';
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
  const snap = read('js/masterDataSnapshot.js');
  const srv = read('server.js');
  const index = read('index.html');
  const data = read('data.html');
  const decor = read('decor.html');

  // A1 快照 seasons 两行四键精确断言
  check('A1a 快照 seasons：S1 行精确（id/name/is_current=false/start_date=2026-03-19）',
    /\{ id: 'f4d458b5-b4fb-4fdc-bdc8-721265b4a485', name: 'S1', is_current: false, start_date: '2026-03-19', end_date: null \}/.test(snap), '');
  check('A1b 快照 seasons：S2 行精确（id/name/is_current=true/start_date=2026-08-20）',
    /\{ id: '370c4590-5fa0-47ba-a97a-d8a4436cbeea', name: 'S2', is_current: true, start_date: '2026-08-20', end_date: null \}/.test(snap), '');
  check('A1c 快照 seasons 恰两行（seasons 数组内对象数=2）',
    (snap.match(/seasons: \[\n([\s\S]*?)\n  \]/) || [])[1] &&
    ((snap.match(/seasons: \[\n([\s\S]*?)\n  \]/) || [])[1].match(/\{ id:/g) || []).length === 2, '');

  // A2 三入口 async + 首行 await init；buildRaidSeasonOptions 空组回退
  check('A2a 三渲染入口转 async：lootShowModal / wishlistShowModal / openItemDbPicker',
    /async function lootShowModal\(lootId = null\) \{/.test(app) &&
    /async function wishlistShowModal\(wishId = null, presetData = null\) \{/.test(app) &&
    /async function openItemDbPicker\(mode = 'wishlist'\) \{/.test(app), '');
  check('A2b 三入口首行 await MasterData.init()（任务书 #66 1.2 守卫）',
    (app.match(/if \(window\.MasterData && !MasterData\.isLoaded\(\)\) await MasterData\.init\(\);/g) || []).length === 3,
    `锚点命中=${(app.match(/if \(window\.MasterData && !MasterData\.isLoaded\(\)\) await MasterData\.init\(\);/g) || []).length}`);
  check('A2c buildRaidSeasonOptions 加固：当前赛季组空→平面回退 + 历史组无名退化「历史赛季」',
    /if \(!current\.length\) return raids\.map\(opt\)\.join\(''\) \+ tail; \/\/ 当前赛季组空（快照兜底态）不出空 optgroup/.test(app) &&
    /histNames\.length \? `历史赛季（\$\{histNames\.join\('\/'\)\}）` : '历史赛季'/.test(app), '');

  // A3 ilvl 接线 + meta 非空段拼接
  check('A3a getMasterLootItems 接 boss_loot.ilvl：itemLevel: l.ilvl || \'\'',
    /itemLevel: l\.ilvl \|\| '', \/\/ 任务书 #66（1\.3）：接 boss_loot\.ilvl 列/.test(app), '');
  check('A3b picker 卡 meta 非空段拼接（装等有值才渲染，空段不出裸分隔符）',
    /const metaText = \[item\.armorType, item\.slot, item\.itemLevel \? `装等\$\{item\.itemLevel\}` : ''\]\.filter\(Boolean\)\.join\(' · '\);/.test(app), '');

  // A4 server.js HTML 缓存头三件套
  check('A4 server.js serveFile：HTML 缓存头三件套（Cache-Control/Pragma/Expires，isHtml 分支内）',
    /const isHtml = ext === "\.html";/.test(srv) &&
    /headers\["Cache-Control"\] = "no-cache, no-store, must-revalidate";/.test(srv) &&
    /headers\["Pragma"\] = "no-cache";/.test(srv) &&
    /headers\["Expires"\] = "0";/.test(srv), '');

  // A5 版本串
  check(`A5a 三壳版本串 ${VER}（index×15/data×8/decor×5）`,
    countStr(index, VER) === 15 && countStr(data, VER) === 8 && countStr(decor, VER) === 5,
    `实际=${countStr(index, VER)}/${countStr(data, VER)}/${countStr(decor, VER)}`);
  const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'));
  const jsResidual = jsFiles.filter(f => countStr(read('js/' + f), VER_OLD) > 0)
    .map(f => `${f}×${countStr(read('js/' + f), VER_OLD)}`);
  // js/app.js 内 changelog 历史记录有一处 20261013.86（任务书 #64-补丁 changelog 条目），不算残留
  check(`A5b 旧串 ${VER_OLD} 零残留（三壳全零；js/ 仅 app.js changelog 历史记录 1 处在案）`,
    [index, data, decor].every(s => countStr(s, VER_OLD) === 0) &&
    jsResidual.length === 1 && jsResidual[0] === 'app.js×1',
    jsResidual.join(','));

  // A6 node --check
  for (const f of ['js/app.js', 'js/masterDataSnapshot.js', 'server.js']) {
    const r = spawnSync(process.execPath, ['--check', f], { cwd: ROOT, encoding: 'utf8' });
    check('A6 node --check ' + f, r.status === 0, (r.stderr || '').trim().split('\n')[0]);
  }

  // A7 npm test（server-security，server.js 本批有改动）
  const st = spawnSync('npm', ['test'], { cwd: ROOT, encoding: 'utf8', shell: true });
  const passLine = ((st.stdout || '').match(/# pass \d+/) || [''])[0];
  check('A7 npm test（server-security）回归', st.status === 0, passLine || (st.stderr || '').trim().split('\n')[0]);

  // A8 冻结零触碰（git diff --name-only HEAD）
  const diff = spawnSync('git', ['-c', 'core.quotepath=false', 'diff', '--name-only', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout
    .split('\n').filter(Boolean).map(s => s.trim());
  const frozen = ['js/dataPublic.js', 'js/lootTaxonomy.js', 'js/track.js'];
  check('A8 冻结零触碰（dataPublic/lootTaxonomy/track 不在变更集 + css/ 零触碰）',
    diff.length > 0 && frozen.every(f => !diff.includes(f)) && diff.every(f => !f.startsWith('css/')),
    diff.join(','));
}

// ==================== B 浏览器实测 ====================
let testUid = null, guildId = null, memberId = null;

async function ensureTestUser() {
  const list = await svcRest('GET', '/auth/v1/admin/users?page=1&per_page=500');
  const users = (list.body && (list.body.users || list.body)) || [];
  const hit = Array.isArray(users) ? users.find(u => (u.email || '').toLowerCase() === EMAIL) : null;
  if (hit) return hit.id;
  const c = await svcRest('POST', '/auth/v1/admin/users', { email: EMAIL, password: PWD, email_confirm: true, user_metadata: { display_name: 't66-exp' } });
  return c.body && c.body.id;
}

async function newCtx(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const pg = await ctx.newPage();
  const errs = [], typeErrors = [], whitelist = [];
  pg.on('pageerror', e => {
    errs.push('pageerror: ' + e.message);
    if (e instanceof TypeError || /TypeError/.test(String(e && e.name))) {
      typeErrors.push(`${e.message}\n${e.stack || ''}`);
    }
  });
  pg.on('console', m => {
    if (m.type() !== 'error') return;
    errs.push('console: ' + m.text());
    if (/TypeError/.test(m.text())) typeErrors.push('console: ' + m.text());
  });
  pg.on('response', r => {
    const u = r.url();
    if (r.status() >= 400) {
      // 白名单：物品图标素材待运营入库（REQ-092/150 在案）、装饰缺图 onerror 回退（任务书 #51 在案）、user_profiles 409 设计内噪音
      if (/assets\/icons\/items\//.test(u) || /assets\/decor-icons\//.test(u)) { whitelist.push(u); return; }
      if (r.status() === 409 && /user_profiles/.test(u)) { whitelist.push(u); return; }
      errs.push(`http${r.status()} ${r.request().method()} ${u}`);
    }
  });
  return { ctx, pg, errs, typeErrors, whitelist };
}
// console「Failed to load resource」与已白名单的网络 4xx / 主动 abort 一一冲抵
function realErrors(errs, whitelistCount, abortCount = 0) {
  let budget4xx = whitelistCount, budgetAbort = abortCount;
  return errs.filter(e => {
    if (budget4xx > 0 && e.startsWith('console: Failed to load resource: the server responded with a status of 4')) { budget4xx--; return false; }
    if (budgetAbort > 0 && e.startsWith('console: Failed to load resource: net::ERR_FAILED')) { budgetAbort--; return false; }
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

async function loginFlow(pg) {
  await pg.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await pg.waitForSelector('#iaLoginBtn', { state: 'visible', timeout: 15000 });
  await pg.click('#iaLoginBtn');
  await pg.waitForSelector('#authEmail', { state: 'visible', timeout: 10000 });
  await pg.fill('#authEmail', EMAIL);
  await pg.fill('#authPassword', PWD);
  await pg.click('#authLoginBtn');
  await pg.waitForURL('**/index.html#/home', { timeout: 30000 });
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
  const g = await svcRest('POST', '/rest/v1/guilds', { name: GUILD_NAME, owner_id: testUid, invite_code: 'T66EXPB1', server_name: '测试', server_region: '一区' });
  guildId = g.body && g.body[0] && g.body[0].id;
  await svcRest('POST', '/rest/v1/guild_members', [{ guild_id: guildId, user_id: testUid, role: 'owner', display_name: 't66-exp' }]);
  // B5 主链路成员（分配人/心愿成员多选）
  const m = await svcRest('POST', '/rest/v1/raid_members', { guild_id: guildId, name: MEMBER_NAME, class: '战士', spec: '', role: '输出', status: '正式' });
  memberId = m.body && m.body[0] && m.body[0].id;

  await startServer();
  console.log('--- 服务器已起（端口 ' + PORT + '） ---');

  // B4 缓存头（Node fetch 直取，免浏览器）
  for (const p of ['/', '/data.html', '/decor.html']) {
    const r = await fetch(`${BASE}${p}`);
    check(`B4 HTML 缓存头三件套 ${p}（Cache-Control 精确 + Pragma/Expires 在场）`,
      r.headers.get('cache-control') === 'no-cache, no-store, must-revalidate' &&
      r.headers.get('pragma') === 'no-cache' && r.headers.get('expires') === '0',
      `CC=${r.headers.get('cache-control')} Pragma=${r.headers.get('pragma')} Expires=${r.headers.get('expires')}`);
  }
  const rJs = await fetch(`${BASE}/js/app.js?v=${VER}`);
  check('B4 js 静态资源未动（/js/app.js?v=.87 无 no-store）',
    !(rJs.headers.get('cache-control') || '').includes('no-store'),
    `CC=${rJs.headers.get('cache-control')}`);

  const browser = await chromium.launch({ headless: true });

  // ========== 主上下文（正常态）：B1 + B3 + B5 + B6 ==========
  const P = await newCtx(browser);
  const pg = P.pg;
  await loginFlow(pg);
  check('B-前置 登录成功落 #/home', true, '');
  // picker/下拉数据源=主数据（登录后异步拉取）——先等就绪防空列表竞态
  await pg.waitForFunction(() => window.MasterData && MasterData.isLoaded && MasterData.isLoaded() && MasterData.getRaids().length > 0, { timeout: 30000 });
  const mdMode = await pg.evaluate(() => MasterData.isSnapshotMode());
  check('B-前置 主数据在线态（非快照兜底）', mdMode === false, `snapshotMode=${mdMode}`);

  // ========== B1a 装备分配「添加装备」→ #lootModal #lootRaid 分组 ==========
  await pg.goto(`${BASE}/index.html#/team/loot`, { waitUntil: 'load' });
  await pg.waitForSelector('button[onclick="lootShowModal()"]', { state: 'visible', timeout: 30000 });
  // B5 覆盖：装备分配页搜索框 + 成员筛选/成员搜索输入
  await pg.fill('#lootSearch', '测试');
  await pg.fill('#lootSearch', '');
  await pg.fill('#lootMemberSearch', 'T66');
  await pg.fill('#lootMemberSearch', '');
  await pg.click('button[onclick="lootShowModal()"]');
  await pg.waitForSelector('#lootModal.show', { timeout: 10000 });
  const b1a = await raidSelectInfo(pg, '#lootRaid');
  const b1aOk = b1a && b1a.groups.length === 2 &&
    b1a.groups[0].label === '当前赛季（S2）' &&
    JSON.stringify(b1a.groups[0].values) === JSON.stringify(S2_RAIDS) &&
    b1a.groups[1].label.startsWith('历史赛季（') &&
    S1_RAIDS.every(v => b1a.groups[1].values.includes(v)) &&
    !b1a.groups[1].values.some(v => S2_RAIDS.includes(v)) &&
    b1a.value === '烈毒之渊' &&
    b1a.directOpts.some(o => o.value === '其他');
  check('B1a #lootRaid 分组：当前赛季（S2）=[烈毒之渊,潮缚石窟] 置顶、历史赛季收尾、默认烈毒之渊、「其他」追加',
    b1aOk, JSON.stringify(b1a));

  // ========== B1b + B3ab + B6 picker：从装备库选择 ==========
  await pg.click('button[onclick="openItemDbPicker(\'loot\')"]');
  await pg.waitForSelector('#itemDbModal .item-card', { state: 'visible', timeout: 15000 });
  const b1b = await raidSelectInfo(pg, '#itemDbRaidFilter');
  const b1bOk = b1b && b1b.directOpts.length >= 1 && b1b.directOpts[0].value === '' && b1b.directOpts[0].text === '全部团本' &&
    b1b.groups.length === 2 &&
    b1b.groups[0].label === '当前赛季（S2）' && JSON.stringify(b1b.groups[0].values) === JSON.stringify(S2_RAIDS) &&
    b1b.groups[1].label.startsWith('历史赛季（') && b1b.groups[1].values.some(v => S1_RAIDS.includes(v));
  check('B1b picker #itemDbRaidFilter：「全部团本」置顶 + optgroup 两档（当前赛季（S2）/历史赛季（…））',
    b1bOk, JSON.stringify(b1b));

  // B3a 默认（全部团本→直显当前赛季）：S2 卡 meta 含「装等3xx」；全列表无裸「装等」尾巴
  const b3a = await pg.evaluate(() => {
    const metas = [...document.querySelectorAll('#itemDbList > .item-card .item-card-meta')].map(c => c.textContent.trim());
    return {
      n: metas.length,
      ilvlCards: metas.filter(t => /装等3\d\d/.test(t)).length,
      bare: metas.filter(t => t.includes('装等') && !/装等\d+/.test(t)),
    };
  });
  check('B3a picker 直显 S2 卡 meta 含「装等3xx」数字，且无裸「装等」尾巴（meta 含装等必带数字）',
    b3a.n > 0 && b3a.ilvlCards > 0 && b3a.bare.length === 0,
    `直显卡=${b3a.n} 带装等=${b3a.ilvlCards} 裸尾巴=${JSON.stringify(b3a.bare.slice(0, 2))}`);
  // B3b 历史赛季 S1 卡 meta 不含「装等」段（S1 ilvl 全 NULL）
  await pg.selectOption('#itemDbRaidFilter', '虚影尖塔');
  await sleep(400);
  const b3b = await pg.evaluate(() => {
    const cards = [...document.querySelectorAll('#itemDbModal .item-card')];
    const metas = cards.map(c => (c.querySelector('.item-card-meta') || { textContent: '' }).textContent.trim());
    return { n: cards.length, withIlvl: metas.filter(t => t.includes('装等')).length, allS1: cards.every(c => (c.querySelector('.item-card-source') || { textContent: '' }).textContent.includes('虚影尖塔')) };
  });
  check('B3b 选 S1「虚影尖塔」→ 卡 meta 不含「装等」段（S1 ilvl 全 NULL）',
    b3b.n > 0 && b3b.withIlvl === 0 && b3b.allS1, `卡=${b3b.n} 带装等=${b3b.withIlvl}`);

  // B5 覆盖：picker 搜索框输入；B6 picker 主链路回归：选中→确认→弹窗关闭+回填
  await pg.selectOption('#itemDbRaidFilter', '');
  await sleep(300);
  await pg.fill('#itemDbSearch', '毒');
  await sleep(300);
  await pg.fill('#itemDbSearch', '');
  await sleep(300);
  await pg.locator('#itemDbList > .item-card').first().click();
  await sleep(200);
  const b6disabled = await pg.evaluate(() => document.getElementById('itemDbConfirmBtn').disabled);
  const b6name = await pg.evaluate(() => { const c = document.querySelector('#itemDbList > .item-card.selected .item-card-name'); return c ? c.textContent.trim() : ''; });
  await pg.click('#itemDbConfirmBtn');
  await sleep(400);
  const b6 = await pg.evaluate(() => ({
    modalClosed: getComputedStyle(document.getElementById('itemDbModal')).display === 'none',
    lootName: (document.getElementById('lootName') || {}).value || '',
  }));
  check('B6 picker 主链路回归：选中→确认→弹窗关闭+装备名回填分配行',
    b6disabled === false && b6.modalClosed && b6.lootName.length > 0 && b6.lootName === b6name,
    `回填=「${b6.lootName}」 modalClosed=${b6.modalClosed}`);

  // B5 主链路写库①：保存一条装备（分配人=测试成员，触发 syncWishlistLinkages）
  await pg.evaluate(mid => {
    const sel = document.getElementById('lootAssignedTo');
    sel.value = mid;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, memberId);
  await pg.click('#lootSaveBtn');
  await pg.waitForFunction(() => !document.getElementById('lootModal').classList.contains('show'), { timeout: 20000 });
  await sleep(500);
  const lootSaved = await svcRest('GET', `/rest/v1/loot_records?guild_id=eq.${guildId}&select=id,item_name`);
  const lootRows = Array.isArray(lootSaved.body) ? lootSaved.body : [];
  check('B5-① 装备保存主链路写库成功（loot_records 落行）', lootRows.length === 1, `rows=${lootRows.length} name=${lootRows[0] && lootRows[0].item_name}`);

  // ========== B1c 心愿单「添加心愿」→ #wishlistModal #wishlistRaid 分组 ==========
  await pg.goto(`${BASE}/index.html#/team/wishlist`, { waitUntil: 'load' });
  await pg.waitForSelector('button[onclick="wishlistShowModal()"]', { state: 'visible', timeout: 30000 });
  // B5 覆盖：心愿单页搜索输入
  await pg.fill('#wishlistSearch', '测试');
  await pg.fill('#wishlistSearch', '');
  await pg.click('button[onclick="wishlistShowModal()"]');
  await pg.waitForSelector('#wishlistModal.show', { timeout: 10000 });
  const b1c = await raidSelectInfo(pg, '#wishlistRaid');
  const b1cOk = b1c && b1c.groups.length === 2 &&
    b1c.groups[0].label === '当前赛季（S2）' &&
    JSON.stringify(b1c.groups[0].values) === JSON.stringify(S2_RAIDS) &&
    b1c.groups[1].label.startsWith('历史赛季（') &&
    b1c.value === '烈毒之渊' &&
    b1c.directOpts.some(o => o.value === '其他');
  check('B1c #wishlistRaid 分组：当前赛季（S2）置顶、历史赛季收尾、默认烈毒之渊、「其他」追加',
    b1cOk, JSON.stringify(b1c));
  // B5 覆盖：添加心愿弹窗成员搜索输入
  await pg.fill('#wishlistMemberSearch', 'T66');
  await pg.fill('#wishlistMemberSearch', '');
  // B5 主链路写库②：保存一条心愿（勾选测试成员）
  await pg.fill('#wishlistItemName', WISH_MARK);
  await pg.locator('#wishlistMemberCheckboxes input[type="checkbox"]').first().check();
  await pg.click('#wishlistSaveBtn');
  await pg.waitForFunction(() => !document.getElementById('wishlistModal').classList.contains('show'), { timeout: 20000 });
  await sleep(500);
  const wishSaved = await svcRest('GET', `/rest/v1/wishlists?guild_id=eq.${guildId}&select=id,items`);
  const wishRows = Array.isArray(wishSaved.body) ? wishSaved.body : [];
  check('B5-② 心愿保存主链路写库成功（wishlists 落行）', wishRows.length === 1, `rows=${wishRows.length}`);

  // ========== B5 覆盖：成员页搜索 + 七页签切换一轮 ==========
  await pg.goto(`${BASE}/index.html#/team/members`, { waitUntil: 'load' });
  await pg.waitForSelector('#memberSearch', { state: 'visible', timeout: 30000 });
  await pg.fill('#memberSearch', 'T66');
  await pg.fill('#memberSearch', '');
  for (const h of ['#/team/dashboard', '#/team/attendance', '#/team/reports', '#/team/data', '#/team/lootdrop', '#/house/decor', '#/team/loot']) {
    await pg.goto(`${BASE}/index.html${h}`, { waitUntil: 'load' });
    await sleep(600);
  }

  // ========== B3c 公示页（#/team/lootdrop）「物品等级 X」回归不破 ==========
  await pg.goto(`${BASE}/index.html#/team/lootdrop`, { waitUntil: 'load' });
  await pg.waitForSelector('.dp-card, .dp-item, [class*="dp-"]', { timeout: 30000 });
  await sleep(800);
  const b3c = await pg.evaluate(() => {
    const tags = [...document.querySelectorAll('.dp-tag')].map(t => t.textContent.trim());
    const ilvl = tags.filter(t => /^物品等级 \d+$/.test(t));
    const bare = tags.filter(t => t.includes('物品等级') && !/^物品等级 \d+$/.test(t));
    return { ilvlN: ilvl.length, sample: ilvl.slice(0, 3), bare };
  });
  check('B3c 公示页装备卡「物品等级 X」渲染回归不破（非空才渲染，无裸段）',
    b3c.ilvlN > 0 && b3c.bare.length === 0, `物品等级标签=${b3c.ilvlN} 样本=${b3c.sample}`);

  // ========== B5 toLowerCase 猎捕汇总 + console 零报错 ==========
  check('B5a 全程零 TypeError（toLowerCase 猎捕：搜索/弹窗/picker/双保存/七页签全开流程）',
    P.typeErrors.length === 0, P.typeErrors.slice(0, 2).join(' | ').slice(0, 400));
  const real = realErrors(P.errs, P.whitelist.length);
  check('B5b 全程 console 零报错（白名单：图标 404 素材待入库/缺图回退/409 设计内）',
    real.length === 0, real.slice(0, 3).join(' | ').slice(0, 400));

  // ========== B2 快照兜底态：拦 **/rest/v1/game_* 全 abort ==========
  const P2 = await newCtx(browser);
  let abortCount = 0;
  await P2.ctx.route('**/rest/v1/game_*', route => { abortCount++; route.abort(); });
  await loginFlow(P2.pg);
  // 快照兜底为异步（init 失败→applySnapshot）——等加载落定
  await P2.pg.waitForFunction(() => window.MasterData && MasterData.isLoaded && MasterData.isLoaded(), { timeout: 30000 });
  const snapMode = await P2.pg.evaluate(() => MasterData.isSnapshotMode());
  check('B2-前置 字典表拦截生效 → MasterData 快照兜底态', snapMode === true, `snapshotMode=${snapMode} abort=${abortCount}`);

  // 弹窗①：装备分配
  await P2.pg.goto(`${BASE}/index.html#/team/loot`, { waitUntil: 'load' });
  await P2.pg.waitForSelector('button[onclick="lootShowModal()"]', { state: 'visible', timeout: 30000 });
  await P2.pg.click('button[onclick="lootShowModal()"]');
  await P2.pg.waitForSelector('#lootModal.show', { timeout: 10000 });
  const b2a = await raidSelectInfo(P2.pg, '#lootRaid');
  const b2aOk = b2a && b2a.allCount > 0 &&
    !b2a.groups.some(gr => gr.label.startsWith('当前赛季') && gr.values.length === 0) &&
    b2a.groups.every(gr => gr.values.length > 0);
  check('B2a 快照态 #lootRaid：有选项（平面或分组均可）且当前赛季组不得为空 optgroup',
    b2aOk, JSON.stringify(b2a));
  await P2.pg.selectOption('#lootRaid', '虚影尖塔');
  await sleep(300);
  const b2b = await P2.pg.evaluate(() => [...document.querySelectorAll('#lootBoss option')].map(o => o.value).filter(Boolean));
  check('B2b 快照态选「虚影尖塔」→ BOSS 下拉出快照 BOSS（含元首阿福扎恩）',
    b2b.length > 0 && b2b.includes('元首阿福扎恩'), `BOSS=${JSON.stringify(b2b.slice(0, 4))}`);
  await P2.pg.evaluate(() => closeModal('lootModal'));
  await sleep(300);

  // 弹窗②：心愿单
  await P2.pg.goto(`${BASE}/index.html#/team/wishlist`, { waitUntil: 'load' });
  await P2.pg.waitForSelector('button[onclick="wishlistShowModal()"]', { state: 'visible', timeout: 30000 });
  await P2.pg.click('button[onclick="wishlistShowModal()"]');
  await P2.pg.waitForSelector('#wishlistModal.show', { timeout: 10000 });
  const b2c = await raidSelectInfo(P2.pg, '#wishlistRaid');
  check('B2c 快照态 #wishlistRaid：有选项且无空 optgroup',
    b2c && b2c.allCount > 0 && b2c.groups.every(gr => gr.values.length > 0), JSON.stringify(b2c));
  await P2.pg.evaluate(() => closeModal('wishlistModal'));
  await sleep(300);

  // 弹窗③：picker（经装备分配弹窗进入）
  await P2.pg.goto(`${BASE}/index.html#/team/loot`, { waitUntil: 'load' });
  await P2.pg.waitForSelector('button[onclick="lootShowModal()"]', { state: 'visible', timeout: 30000 });
  await P2.pg.click('button[onclick="lootShowModal()"]');
  await P2.pg.waitForSelector('#lootModal.show', { timeout: 10000 });
  await P2.pg.click('button[onclick="openItemDbPicker(\'loot\')"]');
  await sleep(800);
  const b2d = await raidSelectInfo(P2.pg, '#itemDbRaidFilter');
  const b2dCards = await P2.pg.evaluate(() => document.querySelectorAll('#itemDbModal .item-card').length);
  check('B2d 快照态 picker：#itemDbRaidFilter 有选项且无空 optgroup（快照无掉落数据，卡 0 属预期）',
    b2d && b2d.allCount > 0 && b2d.groups.every(gr => gr.values.length > 0), `选项=${b2d && b2d.allCount} 卡=${b2dCards}`);
  check('B2e 快照态全程 console 无新增报错（已冲抵主动 abort 的 ERR_FAILED）+ 零 TypeError',
    realErrors(P2.errs, P2.whitelist.length, abortCount).length === 0 && P2.typeErrors.length === 0,
    realErrors(P2.errs, P2.whitelist.length, abortCount).concat(P2.typeErrors).slice(0, 3).join(' | ').slice(0, 400));

  await browser.close();
}

// ==================== C 清零 ====================
async function cleanup() {
  console.log('== C. 清零 ==');
  if (guildId) {
    await svcRest('DELETE', `/rest/v1/loot_records?guild_id=eq.${guildId}`);
    await svcRest('DELETE', `/rest/v1/wishlists?guild_id=eq.${guildId}`);
    await svcRest('DELETE', `/rest/v1/raid_members?guild_id=eq.${guildId}`);
    await svcRest('DELETE', `/rest/v1/guild_members?guild_id=eq.${guildId}`);
    await svcRest('DELETE', `/rest/v1/guilds?id=eq.${guildId}`);
  }
  if (testUid) await svcRest('DELETE', `/auth/v1/admin/users/${testUid}`);
  // 复核：按公会 id 复查 loots/wishlists/raid_members 三表零残留 + 公会/账号绝迹
  const l = guildId ? await svcRest('GET', `/rest/v1/loot_records?guild_id=eq.${guildId}&select=id`) : { body: [] };
  const w = guildId ? await svcRest('GET', `/rest/v1/wishlists?guild_id=eq.${guildId}&select=id`) : { body: [] };
  const rm = guildId ? await svcRest('GET', `/rest/v1/raid_members?guild_id=eq.${guildId}&select=id`) : { body: [] };
  const g = await svcRest('GET', `/rest/v1/guilds?name=eq.${encodeURIComponent(GUILD_NAME)}&select=id`);
  const u = await svcRest('GET', '/auth/v1/admin/users?page=1&per_page=500');
  const uu = (u.body && (u.body.users || u.body)) || [];
  const users = Array.isArray(uu) ? uu : [];
  check('C1 B5 写入的测试装备/心愿逐条删除复核 + 测试公会/账号清零',
    (!Array.isArray(l.body) || l.body.length === 0) &&
    (!Array.isArray(w.body) || w.body.length === 0) &&
    (!Array.isArray(rm.body) || rm.body.length === 0) &&
    (!Array.isArray(g.body) || g.body.length === 0) &&
    !users.some(x => (x.email || '').toLowerCase() === EMAIL),
    `loots=${Array.isArray(l.body) ? l.body.length : '?'} wishes=${Array.isArray(w.body) ? w.body.length : '?'} members=${Array.isArray(rm.body) ? rm.body.length : '?'} guilds=${Array.isArray(g.body) ? g.body.length : '?'}`);
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
