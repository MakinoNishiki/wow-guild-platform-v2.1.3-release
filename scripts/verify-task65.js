// 任务书 #65（扩展版）WP2.3+WP3 验证：套装数据导入 / picker CDN 图标 / 套装快捷录入 / 装备列表套装徽标
// 断言分两组：
//   「迁移无关」组（A+B1-B5，必须全绿）——tier_set_pieces 表与 icon_name 列不存在时也应全过；
//   「迁移相关」组（M 组）——先探表存在性，404 时逐条打印 SKIP 不计失败（sql/37 待执行属预期）。
// A 静态锚点（app.js / index.html / main.css / DESIGN.md）+ 全量 node --check。
// B 浏览器实测（自起 server，端口 15667，测试账号 t65-exp 提 superadmin 以进数据中心）：
//   B1 装备分配弹窗套装模式主链路：切换→死亡骑士→鲜血→套装名出现→部位→名称自动拼接且可手改→
//      大类/部位自动带「防具/头部」→保存入库→列表出现 🏷️套装徽标；
//   B2 心愿单同款链路（腿部→保存入库）；
//   B3 picker 打开图标全 📦（icon_name 列不存在属预期）零报错；
//   B4 数据中心套装 tab 导入按钮→合成 JSON 解析预览正常→确认导入因表 404 中文报错不白屏（迁移门禁预期）；
//   B5 全程零 TypeError / console 零报错（白名单：tier_set_pieces 404、图标素材 404 在案）。
// C 清零：测试装备/心愿/成员/公会/账号逐条删除复核。
// 用法: node scripts/verify-task65.js
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 15667;
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = 't65-exp@example.com';
const PWD = 'T65-Exp-2026!';
const GUILD_NAME = 'T65测试会';
const MEMBER_NAME = 'T65测试员';
const SET_NAME = '灾厄墓骑的熔炉'; // S2 死亡骑士·鲜血（线上 tier_sets 实测行）

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
function skip(name, why) { console.log(`⊘ SKIP ${name}（${why}）`); }
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

// ==================== A 静态锚点（迁移无关） ====================
function staticAsserts() {
  console.log('== A. 静态锚点 ==');
  const app = read('js/app.js');
  const index = read('index.html');
  const css = read('css/main.css');
  const design = read('DESIGN.md');

  // A1 WP2.3 数据中心套装导入
  check('A1a mdRenderTierSets 工具行有「📥 套装数据导入」按钮',
    /<button class="btn btn-sm" onclick="mdOpenTierSetImport\(\)">📥 套装数据导入<\/button>/.test(app), '');
  check('A1b 两段式弹窗三函数齐备（mdOpenTierSetImport/mdTierImportParse/mdTierImportConfirm）',
    /function mdOpenTierSetImport\(\)/.test(app) && /function mdTierImportParse\(\)/.test(app) && /async function mdTierImportConfirm\(\)/.test(app), '');
  check('A1c 解析校验：version ≥1.1.0 点分逐段比 + exportType=tier_sets',
    /function mdVersionGte\(a, b\)/.test(app) && /mdVersionGte\(json\.version, '1\.1\.0'\)/.test(app) && /json\.exportType !== 'tier_sets'/.test(app), '');
  check('A1d 幂等 upsert：mdUpsert(\'tier_set_pieces\', pieceRows, \'season_id,tier_set_id,slot\')',
    /MasterData\.mdUpsert\('tier_set_pieces', pieceRows, 'season_id,tier_set_id,slot'\)/.test(app), '');
  check('A1e 迁移门禁：表 404 中文提示「tier_set_pieces 表未就绪（sql/37 待执行）」',
    /tier_set_pieces 表未就绪（sql\/37 待执行）/.test(app), '');

  // A2 WP3.1 picker CDN 图标
  check('A2a getMasterLootItems 接 icon_name 列（迁移前 undefined→\'\' 全量 📦）',
    /iconName: l\.icon_name \|\| '',/.test(app), '');
  check('A2b cardHtml 白名单字符校验 + CDN 56px + lazy + onerror 回退 📦',
    /\/\^\[A-Za-z0-9_\\-\]\+\$\//.test(app) &&
    /https:\/\/render\.worldofwarcraft\.com\/icons\/56\/\$\{item\.iconName\}\.jpg/.test(app) &&
    /class="item-card-icon-img" loading="lazy" alt="" onerror="this\.outerHTML='📦'"/.test(app), '');
  check('A2c main.css .item-card-icon-img 尺寸规则 + DESIGN.md #65 登记',
    /\.item-card-icon-img \{ width: 100%; height: 100%;/.test(css) && /任务书 #65 登记/.test(design) && /\.item-card-icon-img/.test(design), '');

  // A3 WP3.2 套装快捷录入（两弹窗同源）
  check('A3a 两弹窗标题行模式切换钮（lootModeNormal/lootModeTier、wishlistModeNormal/wishlistModeTier）',
    index.includes('id="lootModeNormal"') && index.includes('id="lootModeTier"') &&
    index.includes('id="wishlistModeNormal"') && index.includes('id="wishlistModeTier"'), '');
  check('A3b 两弹窗套装块 DOM（lootTierBlock/wishlistTierBlock，id 前缀 lootTier*/wishlistTier*）',
    index.includes('id="lootTierBlock"') && index.includes('id="wishlistTierBlock"') &&
    index.includes('id="lootTierClass"') && index.includes('id="wishlistTierSpec"') &&
    index.includes('id="lootTierSlots"') && index.includes('id="wishlistTierSetName"'), '');
  check('A3c 部位后缀表 + 单选注释钉死待运营确认 + 打开复位（tierSetReset 两入口）',
    /const TIER_SLOT_SUFFIX = \{ '头部': '头盔', '肩部': '肩甲', '胸部': '胸甲', '手部': '护手', '腿部': '腿甲' \}/.test(app) &&
    /单选/.test(app) && /待运营确认/.test(app) &&
    /tierSetReset\('loot'\);/.test(app) && /tierSetReset\('wishlist'\);/.test(app), '');
  check('A3d 名称自动拼接 setName + 后缀 + 大类置「防具」+ 部位带值',
    /`\$\{t\.set_name\} \$\{TIER_SLOT_SUFFIX\[slot\]\}`/.test(app) &&
    /document\.getElementById\(m\.catId\)\.value = '防具';/.test(app) && /m\.slotUpdate\(slot\);/.test(app), '');
  check('A3e modalDirtyChecks 登记两弹窗（部位胶囊 tierSlotSel 纳入脏判定）',
    /lootModal: \(\) => isModalFormDirty\('lootModal'\) \|\| tierSlotSel\.loot !== '',/.test(app) &&
    /wishlistModal: \(\) => isModalFormDirty\('wishlistModal'\) \|\| tierSlotSel\.wishlist !== '',/.test(app), '');
  check('A3f main.css 套装组件样式（.tier-mode-switch/.tier-set-name/.tier-slot-cap）',
    /\.tier-mode-switch \{/.test(css) && /\.tier-set-name \{/.test(css) && /\.tier-slot-cap\.active \{/.test(css) && /\.tier-slot-cap\.disabled \{/.test(css), '');

  // A4 WP3.3 装备分配列表套装徽标（心愿单列表不扩）
  check('A4a tierSetBadgeHtml 助手（MasterData 未加载返回 \'\'，set_name 前缀命中 → .tag tag-gold）',
    /function tierSetBadgeHtml\(name\)/.test(app) && /name\.startsWith\(t\.set_name\)/.test(app) && /tag tag-gold/.test(app), '');
  const lootNameCell = /\$\{itemIconImgHtml\(loot\.name, loot\.raid, loot\.boss\)\}\$\{loot\.name\}\$\{tierSetBadgeHtml\(loot\.name\)\}/.test(app);
  const wishNoBadge = !/\$\{itemIconImgHtml\(w\.itemName[^}]*\}\$\{w\.itemName\}\$\{tierSetBadgeHtml/.test(app);
  check('A4b lootRender 装备名单元格接入徽标 + 心愿单列表未接入（任务书 3.3 勿扩）', lootNameCell && wishNoBadge, '');

  // A5 server.js MASTER_TABLES 含 tier_set_pieces（本批前置已完成）；MasterData 加载层不加该表
  const srv = read('server.js');
  const md = read('js/masterData.js');
  check('A5a server.js MASTER_TABLES 已含 tier_set_pieces', /MASTER_TABLES = \[[^\]]*"tier_set_pieces"\]/.test(srv), '');
  check('A5b MasterData 加载层不加 tier_set_pieces（TABLES/refresh 映射/DP_LOOT_TABLES 三清单均无）',
    !/tier_set_pieces/.test(md), '');

  // A6 全量 node --check
  const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f).concat(['server.js']);
  let allOk = true, bad = '';
  for (const f of jsFiles) {
    const r = spawnSync(process.execPath, ['--check', f], { cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) { allOk = false; bad = f; }
  }
  check('A6 node --check 全量通过（js/ 全部 + server.js）', allOk, bad);
}

// ==================== B 浏览器实测 ====================
let testUid = null, guildId = null, memberId = null;

async function ensureTestUser() {
  const list = await svcRest('GET', '/auth/v1/admin/users?page=1&per_page=500');
  const users = (list.body && (list.body.users || list.body)) || [];
  const hit = Array.isArray(users) ? users.find(u => (u.email || '').toLowerCase() === EMAIL) : null;
  if (hit) return hit.id;
  const c = await svcRest('POST', '/auth/v1/admin/users', { email: EMAIL, password: PWD, email_confirm: true, user_metadata: { display_name: 't65-exp' } });
  return c.body && c.body.id;
}

async function newCtx(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const pg = await ctx.newPage();
  const errs = [], typeErrors = [], whitelist = [];
  pg.on('pageerror', e => {
    errs.push('pageerror: ' + e.message);
    if (e instanceof TypeError || /TypeError/.test(String(e && e.name))) typeErrors.push(`${e.message}\n${e.stack || ''}`);
  });
  pg.on('console', m => {
    if (m.type() !== 'error') return;
    errs.push('console: ' + m.text());
    if (/TypeError/.test(m.text())) typeErrors.push('console: ' + m.text());
  });
  pg.on('response', r => {
    if (r.status() >= 400) {
      const u = r.url();
      // 白名单：物品图标素材待入库（REQ-092/150 在案）、user_profiles 409 设计内噪音、
      // tier_set_pieces 404 = sql/37 迁移未执行（本批迁移门禁预期路径）
      if (/assets\/icons\/items\//.test(u)) { whitelist.push(u); return; }
      if (r.status() === 409 && /user_profiles/.test(u)) { whitelist.push(u); return; }
      if (r.status() === 404 && /tier_set_pieces/.test(u)) { whitelist.push(u); return; }
      errs.push(`http${r.status()} ${r.request().method()} ${u}`);
    }
  });
  return { ctx, pg, errs, typeErrors, whitelist };
}
function realErrors(errs, whitelistCount) {
  let budget = whitelistCount;
  return errs.filter(e => {
    if (budget > 0 && e.startsWith('console: Failed to load resource: the server responded with a status of 4')) { budget--; return false; }
    // 迁移门禁预期路径（sql/37 未执行）：mdTierImportConfirm catch 的诊断日志；
    // 迁移后 M 组走成功路径不会再出现——若出现说明实导失败，属真错误（届时本白名单仍放行，
    // 但 M1/M2 断言会红，不致静默）
    if (e.startsWith('console: 套装导入失败:')) return false;
    return true;
  });
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

// 套装模式通用操作：切模式 → 选职业 → 选专精 → 断言套装名
async function enterTierMode(pg, scope, setNameEl) {
  const pfx = scope === 'loot' ? 'lootTier' : 'wishlistTier';
  await pg.click(`#${scope}ModeTier`);
  await pg.waitForSelector(`#${pfx}Block`, { state: 'visible', timeout: 5000 });
  await pg.waitForFunction(p => {
    const s = document.getElementById(p + 'Class');
    return s && s.options.length > 10;
  }, pfx, { timeout: 10000 });
  await pg.selectOption(`#${pfx}Class`, '死亡骑士');
  await pg.waitForFunction(p => {
    const s = document.getElementById(p + 'Spec');
    return s && !s.disabled && [...s.options].some(o => o.value === '鲜血');
  }, pfx, { timeout: 10000 });
  await pg.selectOption(`#${pfx}Spec`, '鲜血');
  await pg.waitForFunction(sel => {
    const el = document.querySelector(sel);
    return el && el.textContent.trim() && el.textContent.trim() !== '—' && !el.classList.contains('tier-set-empty');
  }, setNameEl, { timeout: 10000 });
}

async function liveAsserts() {
  console.log('== B. 浏览器实测 ==');
  testUid = await ensureTestUser();
  if (!testUid) { check('B-前置 测试账号就位', false); return; }
  // 提 superadmin（数据中心页签门禁 + 代理主数据分支；浏览器登录在置权之后，JWT 自然带 claim）
  const sa = await svcRest('PUT', `/auth/v1/admin/users/${testUid}`, { app_metadata: { role: 'superadmin' } });
  if (sa.status !== 200) { check('B-前置 置 superadmin', false, 'status=' + sa.status); return; }
  // 清理上轮残留（幂等重跑）
  const oldG = await svcRest('GET', `/rest/v1/guilds?name=eq.${encodeURIComponent(GUILD_NAME)}&select=id`);
  for (const g of (Array.isArray(oldG.body) ? oldG.body : [])) {
    await svcRest('DELETE', `/rest/v1/guild_members?guild_id=eq.${g.id}`);
    await svcRest('DELETE', `/rest/v1/guilds?id=eq.${g.id}`);
  }
  const g = await svcRest('POST', '/rest/v1/guilds', { name: GUILD_NAME, owner_id: testUid, invite_code: 'T65EXPB1', server_name: '测试', server_region: '一区' });
  guildId = g.body && g.body[0] && g.body[0].id;
  await svcRest('POST', '/rest/v1/guild_members', [{ guild_id: guildId, user_id: testUid, role: 'owner', display_name: 't65-exp' }]);
  const m = await svcRest('POST', '/rest/v1/raid_members', { guild_id: guildId, name: MEMBER_NAME, class: '战士', spec: '', role: '输出', status: '正式' });
  memberId = m.body && m.body[0] && m.body[0].id;

  await startServer();
  console.log('--- 服务器已起（端口 ' + PORT + '） ---');

  const browser = await chromium.launch({ headless: true });
  const P = await newCtx(browser);
  const pg = P.pg;
  await loginFlow(pg);
  check('B-前置 登录成功落 #/home', true, '');
  await pg.waitForFunction(() => window.MasterData && MasterData.isLoaded && MasterData.isLoaded() && MasterData.getTierSets(MasterData.getCurrentSeason().id).length > 0, { timeout: 30000 });
  const mdMode = await pg.evaluate(() => MasterData.isSnapshotMode());
  check('B-前置 主数据在线态且当前赛季 tier_sets 非空（死亡骑士·鲜血链路依赖）', mdMode === false, `snapshotMode=${mdMode}`);

  // ========== B1 装备分配弹窗：套装快捷录入主链路 ==========
  await pg.goto(`${BASE}/index.html#/team/loot`, { waitUntil: 'load' });
  await pg.waitForSelector('button[onclick="lootShowModal()"]', { state: 'visible', timeout: 30000 });
  await pg.click('button[onclick="lootShowModal()"]');
  await pg.waitForSelector('#lootModal.show', { timeout: 10000 });
  const b1a = await pg.evaluate(() => ({
    switchShown: !!document.getElementById('lootModeNormal') && !!document.getElementById('lootModeTier'),
    normalActive: document.getElementById('lootModeNormal').classList.contains('btn-primary') && !document.getElementById('lootModeTier').classList.contains('btn-primary'),
    blockHidden: document.getElementById('lootTierBlock').style.display === 'none',
  }));
  check('B1a 打开「添加装备」默认普通模式：切换钮在场、普通高亮、套装块隐藏',
    b1a.switchShown && b1a.normalActive && b1a.blockHidden, JSON.stringify(b1a));

  await enterTierMode(pg, 'loot', '#lootTierSetName');
  const b1b = await pg.evaluate(() => ({
    setName: document.getElementById('lootTierSetName').textContent.trim(),
    caps: [...document.querySelectorAll('#lootTierSlots .tier-slot-cap')].map(c => ({ t: c.textContent.trim(), disabled: c.classList.contains('disabled') })),
  }));
  check('B1b 套装模式：死亡骑士→鲜血→套装名称出现（S2 当前赛季 tier_sets 命中）',
    b1b.setName === SET_NAME, `套装名=「${b1b.setName}」`);
  check('B1c 部位胶囊五个且可点（无 disabled）',
    b1b.caps.length === 5 && b1b.caps.every(c => !c.disabled) && b1b.caps.map(c => c.t).join('/') === '头部/肩部/胸部/手部/腿部',
    JSON.stringify(b1b.caps));

  await pg.locator('#lootTierSlots .tier-slot-cap', { hasText: '头部' }).click();
  await sleep(200);
  const autoName = await pg.evaluate(() => document.getElementById('lootName').value);
  const b1d = await pg.evaluate(() => ({
    cat: document.getElementById('lootCategory').value,
    slot: document.getElementById('lootSlot').value,
    capActive: [...document.querySelectorAll('#lootTierSlots .tier-slot-cap')].filter(c => c.classList.contains('active')).map(c => c.textContent.trim()),
  }));
  check('B1d 选部位「头部」→ 名称自动拼接「套装名 头盔」+ 大类/部位自动带「防具/头部」+ 胶囊单选高亮',
    autoName === `${SET_NAME} 头盔` && b1d.cat === '防具' && b1d.slot === '头部' && b1d.capActive.join() === '头部',
    `name=「${autoName}」 cat=${b1d.cat} slot=${b1d.slot}`);
  // 名称可手改且不被覆盖
  await pg.fill('#lootName', `${SET_NAME} 头盔 T65改`);
  await sleep(200);
  const editedName = await pg.evaluate(() => document.getElementById('lootName').value);
  check('B1e 名称手改后保持（不被覆盖）', editedName === `${SET_NAME} 头盔 T65改`, `name=「${editedName}」`);

  // 保存主链路写库（status 走默认「待分配」，保存链路零改动；loot_records 无 status 列——状态为前端语义，故只断言落行与名称）
  await pg.click('#lootSaveBtn');
  await pg.waitForFunction(() => !document.getElementById('lootModal').classList.contains('show'), { timeout: 20000 });
  await sleep(600);
  const lootSaved = await svcRest('GET', `/rest/v1/loot_records?guild_id=eq.${guildId}&select=id,item_name`);
  const lootRows = Array.isArray(lootSaved.body) ? lootSaved.body : [];
  check('B1f 套装装备保存主链路写库成功（loot_records 落行）',
    lootRows.length === 1 && lootRows[0].item_name === `${SET_NAME} 头盔 T65改`,
    `rows=${lootRows.length} name=${lootRows[0] && lootRows[0].item_name}`);
  // B1g 列表套装徽标（WP3.3）
  await pg.waitForSelector('#lootTableBody tr', { timeout: 10000 });
  const b1g = await pg.evaluate(() => {
    const cell = document.querySelector('#lootTableBody .loot-name');
    const tag = cell && cell.querySelector('.tag.tag-gold');
    return { cellText: cell ? cell.textContent.trim() : '', tagText: tag ? tag.textContent.trim() : '' };
  });
  check('B1g 装备分配列表名称后追加 🏷️套装 徽标（名称以 set_name 前缀命中）',
    b1g.tagText.includes('套装') && b1g.cellText.startsWith(SET_NAME), JSON.stringify(b1g));

  // ========== B2 心愿单弹窗：同款套装链路 ==========
  await pg.goto(`${BASE}/index.html#/team/wishlist`, { waitUntil: 'load' });
  await pg.waitForSelector('button[onclick="wishlistShowModal()"]', { state: 'visible', timeout: 30000 });
  await pg.click('button[onclick="wishlistShowModal()"]');
  await pg.waitForSelector('#wishlistModal.show', { timeout: 10000 });
  await enterTierMode(pg, 'wishlist', '#wishlistTierSetName');
  await pg.locator('#wishlistTierSlots .tier-slot-cap', { hasText: '腿部' }).click();
  await sleep(200);
  const b2a = await pg.evaluate(() => ({
    name: document.getElementById('wishlistItemName').value,
    cat: document.getElementById('wishlistCategory').value,
    slot: document.getElementById('wishlistSlot').value,
  }));
  check('B2a 心愿单套装模式：腿部 → 名称「套装名 腿甲」+ 大类/部位「防具/腿部」',
    b2a.name === `${SET_NAME} 腿甲` && b2a.cat === '防具' && b2a.slot === '腿部', JSON.stringify(b2a));
  await pg.locator('#wishlistMemberCheckboxes input[type="checkbox"]').first().check();
  await pg.click('#wishlistSaveBtn');
  await pg.waitForFunction(() => !document.getElementById('wishlistModal').classList.contains('show'), { timeout: 20000 });
  await sleep(600);
  const wishSaved = await svcRest('GET', `/rest/v1/wishlists?guild_id=eq.${guildId}&select=id`);
  const wishRows = Array.isArray(wishSaved.body) ? wishSaved.body : [];
  check('B2b 心愿单套装保存主链路写库成功（wishlists 落行）', wishRows.length === 1, `rows=${wishRows.length}`);

  // ========== B3 picker：icon_name 列不存在（迁移前）→ 图标全 📦 零报错 ==========
  await pg.goto(`${BASE}/index.html#/team/loot`, { waitUntil: 'load' });
  await pg.waitForSelector('button[onclick="lootShowModal()"]', { state: 'visible', timeout: 30000 });
  await pg.click('button[onclick="lootShowModal()"]');
  await pg.waitForSelector('#lootModal.show', { timeout: 10000 });
  await pg.click('button[onclick="openItemDbPicker(\'loot\')"]');
  await pg.waitForSelector('#itemDbModal .item-card', { state: 'visible', timeout: 15000 });
  const b3 = await pg.evaluate(() => {
    const icons = [...document.querySelectorAll('#itemDbModal .item-card-icon')];
    return {
      n: icons.length,
      cdnImgs: document.querySelectorAll('#itemDbModal .item-card-icon-img').length,
      allBox: icons.every(i => i.textContent.trim() === '📦'),
    };
  });
  check('B3 picker 打开：icon_name 列不存在（迁移前）→ 图标全 📦 占位、零 CDN img、零报错',
    b3.n > 0 && b3.cdnImgs === 0 && b3.allBox, `卡=${b3.n} cdnImg=${b3.cdnImgs}`);
  await pg.evaluate(() => { closeModal('itemDbModal'); closeModal('lootModal'); });
  await sleep(300);

  // ========== B4 数据中心套装 tab：导入按钮 + 解析预览 + 迁移门禁报错 ==========
  await pg.goto(`${BASE}/index.html#/team/datacenter`, { waitUntil: 'load' });
  await pg.waitForSelector('#mdTabs', { state: 'visible', timeout: 30000 });
  await pg.click('#mdTabs .view-tab[data-mdtab="tiersets"]');
  await pg.waitForSelector('button[onclick="mdOpenTierSetImport()"]', { state: 'visible', timeout: 10000 });
  check('B4a 数据中心套装 tab 出现「📥 套装数据导入」按钮', true, '');
  await pg.click('button[onclick="mdOpenTierSetImport()"]');
  await pg.waitForSelector('#mdEditorModal.show #mdField__tierimport', { timeout: 10000 });
  // 合成 JSON：任务书 WP1.3 格式，1 套 5 件（S2 死亡骑士·鲜血 = 线上 tier_sets 既有行）
  const tierJson = JSON.stringify({
    version: '1.1.0', exportType: 'tier_sets', exportedAt: 1728864000,
    data: [{
      season: 'S2', className: '死亡骑士', specName: '鲜血', specId: 250, setName: SET_NAME, setId: 1234,
      pieces: ['头部', '肩部', '胸部', '手部', '腿部'].map((slot, i) => ({
        slot, itemID: 279101 + i, itemName: `${SET_NAME} T65导入${slot}`,
        iconName: 'inv_helm_plate_raidwarriorprimalist_d_01', ilvl: 318, armorType: '板甲'
      }))
    }]
  });
  await pg.evaluate(j => { document.getElementById('mdField__tierimport').value = j; }, tierJson);
  await pg.click('#mdEditorSaveBtn'); // 解析并预览
  await pg.waitForFunction(() => document.querySelector('#mdTierImportPreview table'), { timeout: 10000 });
  const b4b = await pg.evaluate(() => {
    const rows = [...document.querySelectorAll('#mdTierImportPreview table tbody tr')];
    return {
      rowCount: rows.length,
      redRows: rows.filter(r => r.style.color !== '' || getComputedStyle(r).color === 'rgb(248, 81, 73)').length,
      pieceCell: rows[0] ? rows[0].querySelector('td.num') ?.textContent.trim() : '',
      btnText: document.getElementById('mdEditorSaveBtn').textContent.trim(),
    };
  });
  check('B4b 解析预览：1 套匹配（无红行）、件数=5、按钮变「确认导入（5 件）」',
    b4b.rowCount === 1 && b4b.redRows === 0 && b4b.pieceCell === '5' && b4b.btnText === '确认导入（5 件）',
    JSON.stringify(b4b));

  // 迁移门禁探测：表存在走 M 组实导断言；404 → 门禁报错断言（不白屏不静默）
  const probe = await svcRest('GET', '/rest/v1/tier_set_pieces?select=id&limit=1');
  const tableReady = probe.status === 200;
  await pg.click('#mdEditorSaveBtn'); // 确认导入
  // 代理链路（JWT 校验 + 上游 REST 往返）可能 >1.5s——轮询等 toast 出现再读，不做定长 sleep
  await pg.waitForSelector('#toastContainer .toast', { state: 'attached', timeout: 15000 }).catch(() => {});
  await sleep(300);
  const b4c = await pg.evaluate(() => {
    const toasts = [...document.querySelectorAll('#toastContainer .toast')].map(t => t.textContent.trim());
    return { toasts, modalOpen: document.getElementById('mdEditorModal').classList.contains('show') };
  });
  if (tableReady) {
    check('M1 [迁移相关] 确认导入成功 toast「成功导入 5 件，覆盖 1 个专精」+ 弹窗关闭',
      b4c.toasts.some(t => t.includes('成功导入 5 件') && t.includes('覆盖 1 个专精')) && !b4c.modalOpen,
      JSON.stringify(b4c));
    const wrote = await svcRest('GET', `/rest/v1/tier_set_pieces?select=id,slot,item_name&item_name=like.*T65%E5%AF%BC%E5%85%A5*`);
    const wrows = Array.isArray(wrote.body) ? wrote.body : [];
    check('M2 [迁移相关] tier_set_pieces 落库 5 件', wrows.length === 5, `rows=${wrows.length}`);
    // M3 幂等重导：同 JSON 再跑一遍不重复
    if (wrows.length === 5) {
      await pg.click('button[onclick="mdOpenTierSetImport()"]');
      await pg.waitForSelector('#mdEditorModal.show #mdField__tierimport', { timeout: 10000 });
      await pg.evaluate(j => { document.getElementById('mdField__tierimport').value = j; }, tierJson);
      await pg.click('#mdEditorSaveBtn');
      await pg.waitForFunction(() => document.getElementById('mdEditorSaveBtn').textContent.includes('确认导入'), { timeout: 10000 });
      await pg.click('#mdEditorSaveBtn');
      await sleep(1500);
      const rewrote = await svcRest('GET', `/rest/v1/tier_set_pieces?select=id&item_name=like.*T65%E5%AF%BC%E5%85%A5*`);
      check('M3 [迁移相关] 重复导入幂等（仍 5 行）', Array.isArray(rewrote.body) && rewrote.body.length === 5, `rows=${Array.isArray(rewrote.body) ? rewrote.body.length : '?'}`);
      await svcRest('DELETE', `/rest/v1/tier_set_pieces?item_name=like.*T65%E5%AF%BC%E5%85%A5*`);
    }
  } else {
    skip('M1/M2/M3 迁移相关断言', `tier_set_pieces 表 404（sql/37 待执行），probe.status=${probe.status}`);
    check('B4c 迁移门禁：确认导入报中文错「tier_set_pieces 表未就绪（sql/37 待执行）」+ 弹窗不关不白屏',
      b4c.toasts.some(t => t.includes('tier_set_pieces 表未就绪') && t.includes('sql/37')) && b4c.modalOpen,
      JSON.stringify(b4c).slice(0, 300));
    await pg.evaluate(() => closeModal('mdEditorModal'));
  }

  // ========== B5 全程 console 零报错 ==========
  check('B5a 全程零 TypeError', P.typeErrors.length === 0, P.typeErrors.slice(0, 2).join(' | ').slice(0, 400));
  const real = realErrors(P.errs, P.whitelist.length);
  check('B5b 全程 console 零报错（白名单：图标素材 404 在案/409 设计内/tier_set_pieces 404 迁移门禁）',
    real.length === 0, real.slice(0, 3).join(' | ').slice(0, 400));

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
  // 迁移相关残留清防：M 组测试件按名字前缀删（表不存在时 404 忽略）
  await svcRest('DELETE', `/rest/v1/tier_set_pieces?item_name=like.*T65%E5%AF%BC%E5%85%A5*`);
  if (testUid) await svcRest('DELETE', `/auth/v1/admin/users/${testUid}`);
  const l = guildId ? await svcRest('GET', `/rest/v1/loot_records?guild_id=eq.${guildId}&select=id`) : { body: [] };
  const w = guildId ? await svcRest('GET', `/rest/v1/wishlists?guild_id=eq.${guildId}&select=id`) : { body: [] };
  const rm = guildId ? await svcRest('GET', `/rest/v1/raid_members?guild_id=eq.${guildId}&select=id`) : { body: [] };
  const g = await svcRest('GET', `/rest/v1/guilds?name=eq.${encodeURIComponent(GUILD_NAME)}&select=id`);
  const u = await svcRest('GET', '/auth/v1/admin/users?page=1&per_page=500');
  const users = Array.isArray((u.body && (u.body.users || u.body)) || []) ? (u.body.users || u.body) : [];
  check('C1 测试装备/心愿/成员/公会/账号清零复核',
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
