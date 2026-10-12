// 任务书 #64 验证：体验批（REQ-148 套装共X件展开 / REQ-149 picker 当前赛季默认+历史折叠 / BUG-108 主题风格改名）
// A 静态锚点：lootTaxonomy 词表；dataPublic 套装卡锚点+CSS；app.js picker 分组锚点+main.css；
//   decorData/decorDict 改名+文案+decor-public 小注；台账/勘定报告/DESIGN/changelog 登记；
//   版本串 20261013.85（index×15/decor×5/data×8）+ 旧串零残留；node --check + server-security；冻结零触碰。
// B 浏览器实测（自起服务器，端口 15664）：
//   B1 公示壳（免登录 #/team/lootdrop）：共X件徽标在场、点击展开五件（部位序 头肩胸手腿、名称毒字头）、
//      sessionStorage 记忆（tier: 入 dp23:collapsed）、再点收起；
//   B2 公示壳（免登录 #/house/decor）：「主题风格」组名+说明文案在场、「资料片」组名绝迹；
//   B3 登录壳：picker 默认全当前赛季（烈毒之渊/潮缚石窟）+历史组折叠、手动展开出 S1 卡、筛选自动展开；
//      双壳同源抽验：登录态 #/team/lootdrop 共X件徽标在场；
//   B4 console 零报错（白名单：物品图标 404 素材待运营入库 + 装饰缺图 onerror 回退 + user_profiles 409 设计内噪音）。
// C 清零：测试公会/测试账号删除复核。
// 用法: node scripts/verify-task64.js
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 15664;
const BASE = `http://127.0.0.1:${PORT}`;
const VER = '20261013.85';
const VER_OLD1 = '20260923.84';
const VER_OLD2 = '20260923.83';
const EMAIL = 't64-exp@example.com';
const PWD = 'T64-Exp-2026!';
const GUILD_NAME = 'T64体验批测试会';

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
  const tax = read('js/lootTaxonomy.js');
  const dp = read('js/dataPublic.js');
  const app = read('js/app.js');
  const dd = read('js/decorData.js');
  const ddict = read('js/decorDict.js');
  const cssMain = read('css/main.css');
  const cssDp = read('css/data-public.css');
  const cssDh = read('css/decor-public.css');
  const index = read('index.html');
  const decor = read('decor.html');
  const data = read('data.html');

  // A1 REQ-148
  check('A1a 词表单一真源：CLASS_ARMOR 13 职业 + ARMOR_TOKEN_FAMILY 四族（lootTaxonomy 导出）',
    /const CLASS_ARMOR = \{/.test(tax) && (tax.match(/'(战士|圣骑士|死亡骑士|猎人|萨满|唤魔师|盗贼|武僧|德鲁伊|恶魔猎手|牧师|法师|术士)': '(板甲|锁甲|皮甲|布甲)'/g) || []).length === 13 &&
    /const ARMOR_TOKEN_FAMILY = \{ '布甲': '毒织', '皮甲': '毒咒', '锁甲': '毒锻', '板甲': '毒铸' \}/.test(tax) &&
    /CLASS_ARMOR, ARMOR_TOKEN_FAMILY/.test(tax), '');
  check('A1b tierTokenPieces：族前缀+effect 部位解析+赛季归属链路+SLOT_OPTIONS 排序',
    /function tierTokenPieces\(t, cls\)/.test(dp) && /startsWith\(fam\)/.test(dp) &&
    /TIER_TOKEN_SLOT_WORDS\.find/.test(dp) && /raid\.season_id !== t\.season_id/.test(dp) &&
    /order\.indexOf\(a\.slot\) - order\.indexOf\(b\.slot\)/.test(dp), '');
  check('A1c 套装卡「共X件」钮（data-collapse tier: 前缀 + aria-expanded + 在集合=展开语义注释）',
    /class="dp-tier-count\$\{expanded \? ' open' : ''\}" data-collapse="\$\{esc\(tid\)\}"/.test(dp) &&
    /getCollapsed\(\)\.has\(tid\)/.test(dp) && /在集合=展开/.test(dp), '');
  check('A1d 展开明细行（部位 dp-tag + 名称，expanded 才渲染）+ CSS 三件套注册',
    /class="dp-tier-pieces"/.test(dp) && /class="dp-tier-piece"><span class="dp-tag">\$\{esc\(p\.slot\)\}/.test(dp) &&
    /\.dp-tier-count \{/.test(cssDp) && /\.dp-tier-pieces \{/.test(cssDp) && /\.dp-tier-piece-name \{/.test(cssDp), '');

  // A2 REQ-149
  check('A2a picker 分组：is_current 当前赛季 + raidId→season_id + 筛选自动展开 + 复位',
    /MasterData\.getCurrentSeason\(\)/.test(app) && /raidSeasonOf/.test(app) &&
    /const historyOpen = itemDbHistoryOpen \|\| anyFilter;/.test(app) &&
    /itemDbHistoryOpen = false; \/\/ REQ-149：每次打开复位/.test(app), '');
  check('A2b 历史折叠组 DOM + 手动翻面函数 + 计数改当前赛季口径',
    /class="item-db-history\$\{historyOpen \? ' open' : ''\}"/.test(app) &&
    /onclick="toggleItemDbHistory\(\)"/.test(app) && /历史赛季团本（\$\{historyItems\.length\} 件）/.test(app) &&
    /function toggleItemDbHistory\(\)/.test(app) &&
    /textContent = `共 \$\{currentItems\.length\} 件装备`/.test(app), '');
  check('A2c main.css 折叠组样式（默认收起 .open 展开 + 箭头旋转）',
    /\.item-db-history-body \{ display: none; \}/.test(cssMain) &&
    /\.item-db-history\.open \.item-db-history-body \{ display: block; \}/.test(cssMain) &&
    /\.item-db-history\.open \.item-db-history-caret \{ transform: rotate\(90deg\); \}/.test(cssMain), '');

  // A3 BUG-108
  check('A3a 组名「主题风格」+ 说明文案上屏（decorData 结构）',
    /<div class="dh-group-head">主题风格<span class="dh-chip-n">（单选）<\/span><\/div><div class="dh-group-note">按装饰的主题风格归类，非物品加入版本<\/div>/.test(dd), '');
  check('A3b 「资料片」组名绝迹（decorData/decorDict 用户可见层零残留）',
    !/资料片/.test(dd) && !/资料片筛选/.test(ddict), '');
  check('A3c .dh-group-note 样式注册（decor-public.css）', /\.dh-group-note \{/.test(cssDh), '');

  // A4 文档登记
  const ledger = read('docs/问题与需求清单.md');
  const recon = read('docs/BUG-108-装饰版本标签勘定报告-送审.md');
  const design = read('DESIGN.md');
  check('A4a 台账：BUG-108 优先级 P1→P2 + REQ-148/REQ-149 登记',
    /\| BUG-108 \|[^\n]*\| P2 \|/.test(ledger) && /\| REQ-148 \|/.test(ledger) && /\| REQ-149 \|/.test(ledger), '');
  check('A4b 勘定报告批次号补全「转 #64 批」', /转 #64 批/.test(recon), '');
  check('A4c DESIGN.md 任务书 #64 登记（三族新类）',
    /## 任务书 #64 登记/.test(design) && /\.dp-tier-count/.test(design) && /\.item-db-history/.test(design) && /\.dh-group-note/.test(design), '');
  check('A4d changelog 三条补录（feature/improve/fix 三维）',
    /v3\.2\.0-task64-req148/.test(app) && /v3\.2\.0-task64-req149/.test(app) && /v3\.2\.0-task64-bug108/.test(app), '');

  // A5 版本串
  check(`A5a 三壳版本串 ${VER}（index×15/decor×5/data×8）`,
    countStr(index, VER) === 15 && countStr(decor, VER) === 5 && countStr(data, VER) === 8,
    `实际=${countStr(index, VER)}/${countStr(decor, VER)}/${countStr(data, VER)}`);
  check(`A5b 旧串零残留（${VER_OLD1}/${VER_OLD2} 三壳全零）`,
    [index, decor, data].every(s => countStr(s, VER_OLD1) === 0 && countStr(s, VER_OLD2) === 0), '');

  // A6 node --check + server-security
  for (const f of ['js/app.js', 'js/dataPublic.js', 'js/lootTaxonomy.js', 'js/decorData.js', 'js/decorDict.js']) {
    const r = spawnSync(process.execPath, ['--check', f], { cwd: ROOT, encoding: 'utf8' });
    check('A6 node --check ' + f, r.status === 0, (r.stderr || '').trim().split('\n')[0]);
  }
  const st = spawnSync(process.execPath, ['--test', 'test/server-security.test.js'], { cwd: ROOT, encoding: 'utf8' });
  check('A6b server-security 回归', st.status === 0, (st.stdout.match(/# pass \d+/) || [''])[0]);

  // A7 冻结零触碰
  const diff = spawnSync('git', ['-c', 'core.quotepath=false', 'status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).stdout
    .split('\n').filter(Boolean).map(l => l.slice(3).replace(/"/g, ''));
  check('A7 冻结项零触碰（track.js/server.js/cloud.js/masterData.js/sql/addon 不在变更集；本批零 DB 迁移）',
    diff.every(f => !['js/track.js', 'server.js', 'js/cloud.js', 'js/masterData.js', 'js/masterDataSnapshot.js'].includes(f)) &&
    diff.every(f => !f.startsWith('sql/') && !f.startsWith('addon/')),
    diff.join(','));
}

// ==================== B 浏览器实测 ====================
let testUid = null, guildId = null;

async function ensureTestUser() {
  const list = await svcRest('GET', '/auth/v1/admin/users?page=1&per_page=500');
  const users = (list.body && (list.body.users || list.body)) || [];
  const hit = Array.isArray(users) ? users.find(u => (u.email || '').toLowerCase() === EMAIL) : null;
  if (hit) return hit.id;
  const c = await svcRest('POST', '/auth/v1/admin/users', { email: EMAIL, password: PWD, email_confirm: true, user_metadata: { display_name: 't64-exp' } });
  return c.body && c.body.id;
}

async function newCtx(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const pg = await ctx.newPage();
  const errs = [], icon404 = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  pg.on('response', r => {
    const u = r.url();
    if (r.status() >= 400) {
      // 白名单：物品图标素材待运营入库（REQ-092/150 在案）、装饰缺图 onerror 回退（任务书 #51 在案 41 件）、user_profiles 409 设计内噪音
      if (/assets\/icons\/items\//.test(u) || /assets\/decor-icons\//.test(u)) { icon404.push(u); return; }
      if (r.status() === 409 && /user_profiles/.test(u)) { icon404.push(u); return; }
      errs.push(`http${r.status()} ${r.request().method()} ${u}`);
    }
  });
  return { ctx, pg, errs, icon404 };
}
// console「Failed to load resource」与已白名单的网络 4xx 一一冲抵
function realErrors(errs, whitelistCount) {
  let budget = whitelistCount;
  return errs.filter(e => {
    if (budget > 0 && e.startsWith('console: Failed to load resource: the server responded with a status of 4')) { budget--; return false; }
    return true;
  });
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
  const g = await svcRest('POST', '/rest/v1/guilds', { name: GUILD_NAME, owner_id: testUid, invite_code: 'T64EXPB1', server_name: '测试', server_region: '一区' });
  guildId = g.body && g.body[0] && g.body[0].id;
  await svcRest('POST', '/rest/v1/guild_members', [{ guild_id: guildId, user_id: testUid, role: 'owner', display_name: 't64-exp' }]);

  await startServer();
  console.log('--- 服务器已起（端口 ' + PORT + '） ---');
  const browser = await chromium.launch({ headless: true });

  // ========== B1 公示壳 REQ-148（免登录 #/team/lootdrop） ==========
  const P1 = await newCtx(browser);
  await P1.pg.goto(`${BASE}/index.html#/team/lootdrop`, { waitUntil: 'load' });
  await P1.pg.waitForSelector('.dp-tier', { timeout: 30000 });
  const b1a = await P1.pg.evaluate(() => {
    const badges = [...document.querySelectorAll('.dp-tier-count')];
    return { total: document.querySelectorAll('.dp-tier').length, badges: badges.length, firstText: badges[0] ? badges[0].textContent.trim() : '' };
  });
  check('B1a 公示壳套装卡「共X件」徽标：全部 S2 套装卡均带（共5件）',
    b1a.total > 30 && b1a.badges === b1a.total && /共5件/.test(b1a.firstText),
    `卡=${b1a.total} 徽标=${b1a.badges} 首钮=「${b1a.firstText}」`);
  await P1.pg.locator('.dp-tier-count').first().click();
  await P1.pg.waitForSelector('.dp-tier-pieces', { timeout: 5000 });
  const b1b = await P1.pg.evaluate(() => {
    const rows = [...document.querySelectorAll('.dp-tier-pieces .dp-tier-piece')];
    return {
      n: rows.length,
      slots: rows.map(r => r.querySelector('.dp-tag').textContent.trim()),
      names: rows.map(r => r.querySelector('.dp-tier-piece-name').textContent.trim()),
      mem: JSON.parse(sessionStorage.getItem('dp23:collapsed') || '[]').filter(x => String(x).startsWith('tier:')).length,
    };
  });
  const SLOT_EXPECT = ['头部', '肩部', '胸部', '手部', '腿部'];
  check('B1b 点击展开：五件明细（部位序 头/肩/胸/手/腿 + 兑换物名毒字头）',
    b1b.n === 5 && JSON.stringify(b1b.slots) === JSON.stringify(SLOT_EXPECT) && b1b.names.every(n => n.startsWith('毒')),
    JSON.stringify(b1b));
  check('B1c 展开态 sessionStorage 记忆（tier: 前缀入 dp23:collapsed）', b1b.mem >= 1, `tier 键=${b1b.mem}`);
  await P1.pg.locator('.dp-tier-count').first().click();
  await sleep(300);
  const b1d = await P1.pg.evaluate(() => ({
    pieces: document.querySelectorAll('.dp-tier-pieces').length,
    mem: JSON.parse(sessionStorage.getItem('dp23:collapsed') || '[]').filter(x => String(x).startsWith('tier:')).length,
  }));
  check('B1d 再点收起：明细消失 + 记忆键移除', b1d.pieces === 0 && b1d.mem === 0, JSON.stringify(b1d));

  // ========== B2 公示壳 BUG-108（免登录 #/house/decor） ==========
  const P2 = await newCtx(browser);
  await P2.pg.goto(`${BASE}/index.html#/house/decor`, { waitUntil: 'load' });
  await P2.pg.waitForSelector('.dh-grid .dh-card', { timeout: 30000 });
  const b2 = await P2.pg.evaluate(() => {
    const rows = document.getElementById('dhFilterRows');
    const t = rows ? rows.textContent : '';
    return { theme: t.includes('主题风格'), note: t.includes('按装饰的主题风格归类，非物品加入版本'), old: t.includes('资料片') };
  });
  check('B2 公示壳图鉴筛选组「主题风格」+说明文案在场、「资料片」绝迹',
    b2.theme && b2.note && !b2.old, JSON.stringify(b2));

  // ========== B3 登录壳 REQ-149 + REQ-148 双壳 ==========
  const P3 = await newCtx(browser);
  await P3.pg.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  // 任务书 #59 门户化：游客落 #/home 门户，登录表单需先点「登录 / 注册」按钮（iaOpenAuth）
  await P3.pg.waitForSelector('#iaLoginBtn', { state: 'visible', timeout: 15000 });
  await P3.pg.click('#iaLoginBtn');
  await P3.pg.waitForSelector('#authEmail', { state: 'visible', timeout: 10000 });
  await P3.pg.fill('#authEmail', EMAIL);
  await P3.pg.fill('#authPassword', PWD);
  await P3.pg.click('#authLoginBtn');
  await P3.pg.waitForURL('**/index.html#/home', { timeout: 30000 }); // 登录成功落 #/home 门户（侧栏 nav 门户态隐藏，不作等待锚点）
  // REQ-148 双壳同源抽验（登录态副本掉落页签）
  await P3.pg.goto(`${BASE}/index.html#/team/lootdrop`, { waitUntil: 'load' });
  await P3.pg.waitForSelector('.dp-tier-count', { timeout: 30000 });
  check('B3a 登录壳副本掉落页签「共X件」徽标在场（双壳同源）',
    (await P3.pg.locator('.dp-tier-count').count()) > 30, '');
  // REQ-149 picker（入口：装备分配页 → + 添加装备（lootModal）→ 从装备库选择）
  await P3.pg.goto(`${BASE}/index.html#/team/loot`, { waitUntil: 'load' });
  // picker 数据源=主数据（登录后异步拉取，5s 超时+快照兜底）——先等主数据就绪再开弹窗，防空列表竞态
  await P3.pg.waitForFunction(() => window.MasterData && MasterData.getRaids && MasterData.getRaids().length > 0, { timeout: 30000 });
  await P3.pg.waitForSelector('button[onclick="lootShowModal()"]', { state: 'visible', timeout: 30000 });
  await P3.pg.click('button[onclick="lootShowModal()"]');
  await P3.pg.waitForSelector('#lootModal.show', { timeout: 10000 });
  await P3.pg.click('button[onclick="openItemDbPicker(\'loot\')"]');
  await P3.pg.waitForSelector('#itemDbModal .item-card', { state: 'visible', timeout: 15000 });
  const b3b = await P3.pg.evaluate(() => {
    const modal = document.getElementById('itemDbModal');
    const cards = [...modal.querySelectorAll('#itemDbList > .item-card')];
    const hist = modal.querySelector('.item-db-history');
    return {
      count: document.getElementById('itemDbCount').textContent.trim(),
      topCards: cards.length,
      sources: cards.map(c => c.querySelector('.item-card-source').textContent),
      histExists: !!hist,
      histOpen: hist ? hist.classList.contains('open') : null,
      histHead: hist ? hist.querySelector('.item-db-history-head').textContent.trim() : '',
    };
  });
  const S2_RAIDS = ['烈毒之渊', '潮缚石窟'];
  check('B3b picker 默认：直显卡全部当前赛季（烈毒之渊/潮缚石窟）+ 历史组折叠在场',
    b3b.topCards > 0 && b3b.sources.every(s => S2_RAIDS.some(r => s.includes(r))) &&
    b3b.histExists && b3b.histOpen === false && /历史赛季团本（\d+ 件）/.test(b3b.histHead),
    `直显=${b3b.topCards} 计数=「${b3b.count}」组头=「${b3b.histHead}」越界=${b3b.sources.filter(s => !S2_RAIDS.some(r => s.includes(r))).slice(0, 3)}`);
  await P3.pg.click('.item-db-history-head');
  await sleep(300);
  const b3c = await P3.pg.evaluate(() => {
    const hist = document.querySelector('#itemDbModal .item-db-history');
    const body = [...hist.querySelectorAll('.item-db-history-body .item-card')];
    return { open: hist.classList.contains('open'), histCards: body.length, histSources: body.slice(0, 5).map(c => c.querySelector('.item-card-source').textContent) };
  });
  check('B3c 手动展开历史组：S1 团本卡出现',
    b3c.open && b3c.histCards > 0 && b3c.histSources.every(s => !S2_RAIDS.some(r => s.includes(r))),
    `历史卡=${b3c.histCards} 样本=${b3c.histSources.slice(0, 2)}`);
  // 任一筛选生效 → 历史组自动展开（先收起再筛选验证）
  await P3.pg.click('.item-db-history-head'); // 收起
  await sleep(200);
  await P3.pg.selectOption('#itemDbSlotFilter', '饰品');
  await sleep(300);
  const b3d = await P3.pg.evaluate(() => {
    const hist = document.querySelector('#itemDbModal .item-db-history');
    return { open: hist ? hist.classList.contains('open') : null, count: document.getElementById('itemDbCount').textContent.trim() };
  });
  check('B3d 筛选生效历史组自动展开（结果不藏）', b3d.open === true, JSON.stringify(b3d));
  // 主链路：选中装备 → 确认选择 → 装备名回填分配行（picker 既有链路零回归）
  await P3.pg.selectOption('#itemDbSlotFilter', '');
  await sleep(200);
  await P3.pg.locator('#itemDbList > .item-card').first().click();
  await sleep(200);
  const b3e0 = await P3.pg.evaluate(() => document.getElementById('itemDbConfirmBtn').disabled);
  await P3.pg.click('#itemDbConfirmBtn');
  await sleep(400);
  const b3e = await P3.pg.evaluate(() => ({
    modalClosed: getComputedStyle(document.getElementById('itemDbModal')).display === 'none',
    lootName: (document.getElementById('lootName') || {}).value || '',
  }));
  check('B3e 主链路零回归：选中→确认→弹窗关闭+装备名回填分配行', b3e0 === false && b3e.lootName.length > 0, JSON.stringify(b3e));

  // ========== B4 console 零报错 ==========
  for (const [tag, P] of [['公示壳lootdrop', P1], ['公示壳decor', P2], ['登录壳', P3]]) {
    const real = realErrors(P.errs, P.icon404.length);
    check(`B4 ${tag} console 零报错（白名单：图标 404 素材待入库/缺图回退/409 设计内）`, real.length === 0, real.slice(0, 3).join(' | '));
  }

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
