// 任务书 #65-补丁 WP1 验证：套装表单主属性动态联动 + 首领掉落锁定 + 副属性占位提示
// 断言两组：
//   A 静态锚点（app.js 映射表/挂钩/锁函数、index.html 提示元素、三壳版本串 .89）+ 全量 node --check；
//   B 浏览器实测（自起 server，端口 15668，测试账号 t65p）：
//     B1 装备分配弹窗套装模式主属性联动矩阵（死亡骑士/圣骑士/德鲁伊/恶魔猎手八组合）+ 实时切换更新；
//     B2 套装模式首领锁定（disabled+清空+提示）/ 副属性占位提示 / 团本切换后锁定保持（tierBossRearm）；
//     B3 回普通模式全解锁 + 普通模式手动选 BOSS 保存主链路；
//     B4 套装模式保存主链路（boss 空值入库，不残留固定值）；
//     B5 心愿单弹窗首领锁定同步（心愿单无主属性字段，联动不适用）；
//     B6 全程零 TypeError / console 零报错。
// C 清零：测试装备/心愿/成员/公会/账号逐条删除复核。
// 用法: node scripts/verify-task65-patch.js
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 15668;
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = 't65p-exp@example.com';
const PWD = 'T65p-Exp-2026!';
const GUILD_NAME = 'T65P测试会';
const MEMBER_NAME = 'T65P测试员';
const VER = '20261013.89';

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

  // A1 映射表 + 取值函数
  check('A1a CLASS_SPEC_PRIMARY_STAT 常量 + getPrimaryStat 函数在场',
    /const CLASS_SPEC_PRIMARY_STAT = \{/.test(app) && /function getPrimaryStat\(className, specName\)/.test(app), '');
  const classes = ['死亡骑士', '恶魔猎手', '德鲁伊', '唤魔师', '猎人', '法师', '武僧', '圣骑士', '牧师', '潜行者', '萨满', '术士', '战士'];
  const mapBlock = app.match(/const CLASS_SPEC_PRIMARY_STAT = \{[\s\S]*?\n\};/);
  check('A1b 映射表块可定位', !!mapBlock, '');
  let mapOk = false, mapDetail = '';
  if (mapBlock) {
    const MAP = eval('(' + mapBlock[0].replace(/^const CLASS_SPEC_PRIMARY_STAT = /, '').replace(/;$/, '') + ')');
    const missing = classes.filter(c => !MAP[c]);
    // 关键档位断言（任务书验收矩阵）
    const cases = [
      ['死亡骑士', '鲜血', '力量'], ['死亡骑士', '冰霜', '力量'], ['死亡骑士', '邪恶', '力量'],
      ['恶魔猎手', '浩劫', '敏捷'], ['恶魔猎手', '复仇', '敏捷'], ['恶魔猎手', '噬灭', '智力'],
      ['德鲁伊', '平衡', '智力'], ['德鲁伊', '恢复', '智力'], ['德鲁伊', '野性', '敏捷'], ['德鲁伊', '守护', '敏捷'],
      ['武僧', '织雾', '智力'], ['武僧', '酒仙', '敏捷'], ['武僧', '踏风', '敏捷'],
      ['圣骑士', '神圣', '智力'], ['圣骑士', '防护', '力量'], ['圣骑士', '惩戒', '力量'],
      ['萨满', '元素', '智力'], ['萨满', '恢复', '智力'], ['萨满', '增强', '敏捷'],
      ['唤魔师', '湮灭', '智力'], ['猎人', '野兽控制', '敏捷'], ['法师', '奥术', '智力'],
      ['牧师', '戒律', '智力'], ['潜行者', '奇袭', '敏捷'], ['术士', '痛苦', '智力'], ['战士', '武器', '力量'],
    ];
    const getP = (c, s) => { const cm = MAP[c]; if (!cm) return '力量'; return cm[s] || cm['*'] || '力量'; };
    const badCases = cases.filter(([c, s, want]) => getP(c, s) !== want).map(([c, s, want]) => `${c}·${s}=${getP(c, s)}≠${want}`);
    mapOk = missing.length === 0 && badCases.length === 0 && getP('不存在职业', 'x') === '力量' && getP('战士', '不存在专精') === '力量';
    mapDetail = missing.length ? `缺职业=${missing}` : (badCases.length ? badCases.slice(0, 3).join('|') : `26 组合全中+双兜底`);
  }
  check('A1c 映射表 13 职业齐 + 验收矩阵 26 组合逐值命中 + 未知职业/专精兜底力量', mapOk, mapDetail);

  // A2 联动挂钩
  check('A2a tierSetSpecChange 尾部挂 tierPrimaryStatSync（选专精即联动）',
    /function tierSetSpecChange\(scope\) \{[\s\S]*?tierPrimaryStatSync\(scope\);[\s\S]*?\n\}/.test(app), '');
  check('A2b tierPrimaryStatSync 未选全不动（等专精）+ 心愿单无 primaryId 跳过',
    /if \(!m\.primaryId\) return;/.test(app) && /if \(!clsName \|\| !specName\) return;/.test(app) &&
    /p\.value = getPrimaryStat\(clsName, specName\);/.test(app), '');

  // A3 字段锁
  check('A3a tierScopeMap 扩 bossIds/bossHintId/primaryId/secHintId 四键（loot 全量、wishlist 无后两项）',
    /bossIds: \['lootBoss', 'lootBossCustom'\]/.test(app) && /bossIds: \['wishlistBoss', 'wishlistBossText'\]/.test(app) &&
    /primaryId: 'lootPrimaryStat'/.test(app) && /primaryId: '', secHintId: ''/.test(app), '');
  check('A3b tierFieldLock：首领禁用+清空、提示显隐、主属性锁定',
    /function tierFieldLock\(scope, lock\)/.test(app) && /el\.disabled = lock;/.test(app) &&
    /if \(lock\) el\.value = ''/.test(app) && /bossHint\.style\.display = lock \? '' : 'none'/.test(app) &&
    /p\.disabled = lock;/.test(app), '');
  check('A3c tierSetMode 接入 tierFieldLock(scope, isTier) + tierSetReset 复位解锁',
    /tierFieldLock\(scope, isTier\);/.test(app) && /tierFieldLock\(scope, false\);/.test(app), '');
  check('A3d tierBossRearm 挂入两 BOSS 重建函数（团本切换后锁定保持）',
    /function tierBossRearm\(scope\)/.test(app) &&
    /tierBossRearm\('loot'\);/.test(app) && /tierBossRearm\('wishlist'\);/.test(app) &&
    app.indexOf("tierBossRearm('loot')") > app.indexOf('function lootUpdateBossOptions') &&
    app.indexOf("tierBossRearm('wishlist')") > app.indexOf('function wishlistOnRaidChange'), '');

  // A4 index.html 提示元素
  check('A4a 装备分配弹窗：首领提示 + 副属性占位提示两元素',
    index.includes('id="lootTierBossHint"') && index.includes('套装由兑换物兑换，首领待插件导出后匹配') &&
    index.includes('id="lootTierSecHint"') && index.includes('副属性待插件导出后自动填充'), '');
  check('A4b 心愿单弹窗：首领提示元素（同步）',
    index.includes('id="wishlistTierBossHint"'), '');

  // A5 版本串三壳 .89 同步、.88 零残留
  const cnt = (f, s) => (read(f).match(new RegExp(s.replace(/\./g, '\\.'), 'g')) || []).length;
  check('A5a 版本串 20261013.89 三壳递增（index 15 / data 8 / decor 5）',
    cnt('index.html', VER) === 15 && cnt('data.html', VER) === 8 && cnt('decor.html', VER) === 5,
    `index=${cnt('index.html', VER)} data=${cnt('data.html', VER)} decor=${cnt('decor.html', VER)}`);
  check('A5b 旧串 20261013.88 三壳零残留',
    cnt('index.html', '20261013.88') === 0 && cnt('data.html', '20261013.88') === 0 && cnt('decor.html', '20261013.88') === 0, '');

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
let testUid = null, guildId = null;

async function ensureTestUser() {
  const list = await svcRest('GET', '/auth/v1/admin/users?page=1&per_page=500');
  const users = (list.body && (list.body.users || list.body)) || [];
  const hit = Array.isArray(users) ? users.find(u => (u.email || '').toLowerCase() === EMAIL) : null;
  if (hit) return hit.id;
  const c = await svcRest('POST', '/auth/v1/admin/users', { email: EMAIL, password: PWD, email_confirm: true, user_metadata: { display_name: 't65p-exp' } });
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
      // 白名单：物品图标素材待入库（REQ-092/150 在案）、user_profiles 409 设计内噪音、tier_set_pieces 404 迁移窗口
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

// 套装模式下选职业+专精并读回主属性/锁定态
async function tierPick(pg, scope, cls, spec) {
  const pfx = scope === 'loot' ? 'lootTier' : 'wishlistTier';
  await pg.selectOption(`#${pfx}Class`, cls);
  await pg.waitForFunction(([p, s]) => {
    const sel = document.getElementById(p + 'Spec');
    return sel && !sel.disabled && [...sel.options].some(o => o.value === s);
  }, [pfx, spec], { timeout: 10000 });
  await pg.selectOption(`#${pfx}Spec`, spec);
  await sleep(150);
}

async function liveAsserts() {
  console.log('== B. 浏览器实测 ==');
  testUid = await ensureTestUser();
  if (!testUid) { check('B-前置 测试账号就位', false); return; }
  // 清理上轮残留（幂等重跑）
  const oldG = await svcRest('GET', `/rest/v1/guilds?name=eq.${encodeURIComponent(GUILD_NAME)}&select=id`);
  for (const g of (Array.isArray(oldG.body) ? oldG.body : [])) {
    await svcRest('DELETE', `/rest/v1/loot_records?guild_id=eq.${g.id}`);
    await svcRest('DELETE', `/rest/v1/wishlists?guild_id=eq.${g.id}`);
    await svcRest('DELETE', `/rest/v1/raid_members?guild_id=eq.${g.id}`);
    await svcRest('DELETE', `/rest/v1/guild_members?guild_id=eq.${g.id}`);
    await svcRest('DELETE', `/rest/v1/guilds?id=eq.${g.id}`);
  }
  const g = await svcRest('POST', '/rest/v1/guilds', { name: GUILD_NAME, owner_id: testUid, invite_code: 'T65PEXP1', server_name: '测试', server_region: '一区' });
  guildId = g.body && g.body[0] && g.body[0].id;
  await svcRest('POST', '/rest/v1/guild_members', [{ guild_id: guildId, user_id: testUid, role: 'owner', display_name: 't65p-exp' }]);
  await svcRest('POST', '/rest/v1/raid_members', { guild_id: guildId, name: MEMBER_NAME, class: '战士', spec: '', role: '输出', status: '正式' });

  await startServer();
  console.log('--- 服务器已起（端口 ' + PORT + '） ---');

  const browser = await chromium.launch({ headless: true });
  const P = await newCtx(browser);
  const pg = P.pg;
  await loginFlow(pg);
  check('B-前置 登录成功落 #/home', true, '');
  await pg.waitForFunction(() => window.MasterData && MasterData.isLoaded && MasterData.isLoaded() && MasterData.getClasses().length >= 13, { timeout: 30000 });
  const mdMode = await pg.evaluate(() => MasterData.isSnapshotMode());
  check('B-前置 主数据在线态（快照态职业清单不含噬灭等键会导致联动用例失真）', mdMode === false, `snapshotMode=${mdMode}`);

  // ========== B1 装备分配弹窗：主属性联动矩阵 ==========
  await pg.goto(`${BASE}/index.html#/team/loot`, { waitUntil: 'load' });
  await pg.waitForSelector('button[onclick="lootShowModal()"]', { state: 'visible', timeout: 30000 });
  await pg.click('button[onclick="lootShowModal()"]');
  await pg.waitForSelector('#lootModal.show', { timeout: 10000 });
  await pg.click('#lootModeTier');
  await pg.waitForSelector('#lootTierBlock', { state: 'visible', timeout: 5000 });
  await pg.waitForFunction(() => {
    const s = document.getElementById('lootTierClass');
    return s && s.options.length > 13;
  }, { timeout: 10000 });

  const matrix = [
    ['死亡骑士', '鲜血', '力量'],
    ['圣骑士', '神圣', '智力'],
    ['圣骑士', '惩戒', '力量'], // 同弹窗内切换专精实时更新（不重开）
    ['德鲁伊', '平衡', '智力'],
    ['德鲁伊', '野性', '敏捷'],
    ['德鲁伊', '守护', '敏捷'],
    ['恶魔猎手', '噬灭', '智力'],
    ['恶魔猎手', '浩劫', '敏捷'],
  ];
  let matrixFail = '';
  for (const [cls, spec, want] of matrix) {
    await tierPick(pg, 'loot', cls, spec);
    const got = await pg.evaluate(() => document.getElementById('lootPrimaryStat').value);
    if (got !== want) { matrixFail = `${cls}·${spec}: got=${got} want=${want}`; break; }
  }
  check('B1 主属性联动矩阵 8 组合逐值命中（含同弹窗切专精实时更新）', !matrixFail, matrixFail || '8/8');

  // ========== B2 套装模式字段锁定 ==========
  const b2 = await pg.evaluate(() => ({
    primaryDisabled: document.getElementById('lootPrimaryStat').disabled,
    bossDisabled: document.getElementById('lootBoss').disabled,
    bossValue: document.getElementById('lootBoss').value,
    bossHintShown: document.getElementById('lootTierBossHint').style.display !== 'none',
    bossHintText: document.getElementById('lootTierBossHint').textContent.trim(),
    secHintShown: document.getElementById('lootTierSecHint').style.display !== 'none',
  }));
  check('B2a 套装模式：主属性下拉锁定（禁手改）+ 首领下拉禁用且清空 + 提示显示',
    b2.primaryDisabled && b2.bossDisabled && b2.bossValue === '' && b2.bossHintShown &&
    b2.bossHintText.includes('套装由兑换物兑换') && b2.bossHintText.includes('首领待插件导出后匹配'),
    JSON.stringify(b2));
  check('B2b 套装模式：副属性占位提示显示（交互不动）', b2.secHintShown, `secHintShown=${b2.secHintShown}`);

  // B2c 套装模式下切团本 → BOSS 下拉重建后仍锁定+清空（tierBossRearm）
  await pg.selectOption('#lootRaid', { index: 1 });
  await sleep(300);
  const b2c = await pg.evaluate(() => ({
    bossDisabled: document.getElementById('lootBoss').disabled,
    bossValue: document.getElementById('lootBoss').value,
    optCount: document.getElementById('lootBoss').options.length,
  }));
  check('B2c 套装模式切团本重建 BOSS 下拉后：仍禁用+仍空值（防首项回填脏值）',
    b2c.bossDisabled && b2c.bossValue === '' && b2c.optCount > 0, JSON.stringify(b2c));

  // ========== B4 套装模式保存主链路（boss 空值入库） ==========
  await tierPick(pg, 'loot', '死亡骑士', '鲜血');
  await pg.waitForFunction(() => {
    const el = document.getElementById('lootTierSetName');
    return el && el.textContent.trim() && el.textContent.trim() !== '—' && !el.classList.contains('tier-set-empty');
  }, { timeout: 10000 });
  await pg.locator('#lootTierSlots .tier-slot-cap', { hasText: '头部' }).click();
  await sleep(200);
  const b4name = await pg.evaluate(() => document.getElementById('lootName').value);
  await pg.click('#lootSaveBtn');
  await pg.waitForFunction(() => !document.getElementById('lootModal').classList.contains('show'), { timeout: 20000 });
  await sleep(600);
  const tierSaved = await svcRest('GET', `/rest/v1/loot_records?guild_id=eq.${guildId}&select=id,item_name,boss_name,item_stats`);
  const tierRows = Array.isArray(tierSaved.body) ? tierSaved.body : [];
  check('B4 套装模式保存主链路：落库成功 + boss_name 空值（不残留固定值）+ 主属性=力量（死亡骑士·鲜血）',
    tierRows.length === 1 && tierRows[0].item_name === b4name && !tierRows[0].boss_name &&
    tierRows[0].item_stats && tierRows[0].item_stats.primaryStat === '力量',
    `rows=${tierRows.length} name=${tierRows[0] && tierRows[0].item_name} boss=${tierRows[0] && JSON.stringify(tierRows[0].boss_name)} primary=${tierRows[0] && tierRows[0].item_stats && tierRows[0].item_stats.primaryStat}`);

  // ========== B3 回普通模式全解锁 + 普通模式手动选 BOSS 保存 ==========
  await pg.click('button[onclick="lootShowModal()"]');
  await pg.waitForSelector('#lootModal.show', { timeout: 10000 });
  await pg.click('#lootModeTier');
  await pg.waitForSelector('#lootTierBlock', { state: 'visible', timeout: 5000 });
  await pg.click('#lootModeNormal');
  await sleep(200);
  const b3a = await pg.evaluate(() => ({
    primaryEnabled: !document.getElementById('lootPrimaryStat').disabled,
    bossEnabled: !document.getElementById('lootBoss').disabled,
    bossHintHidden: document.getElementById('lootTierBossHint').style.display === 'none',
    secHintHidden: document.getElementById('lootTierSecHint').style.display === 'none',
    bossOptCount: document.getElementById('lootBoss').options.length,
  }));
  check('B3a 切回普通模式：主属性/首领全解锁、两条提示隐藏、BOSS 选项在场',
    b3a.primaryEnabled && b3a.bossEnabled && b3a.bossHintHidden && b3a.secHintHidden && b3a.bossOptCount > 0,
    JSON.stringify(b3a));
  // 普通模式保存主链路（手动选 BOSS 正常入库）
  await pg.fill('#lootName', 'T65P普通件');
  const bossPicked = await pg.evaluate(() => {
    const sel = document.getElementById('lootBoss');
    sel.value = sel.options[0].value;
    return sel.value;
  });
  await pg.click('#lootSaveBtn');
  await pg.waitForFunction(() => !document.getElementById('lootModal').classList.contains('show'), { timeout: 20000 });
  await sleep(600);
  const normalSaved = await svcRest('GET', `/rest/v1/loot_records?guild_id=eq.${guildId}&item_name=eq.T65P普通件&select=id,boss_name`);
  const normalRows = Array.isArray(normalSaved.body) ? normalSaved.body : [];
  check('B3b 普通模式手动选 BOSS 保存主链路正常（boss_name 随选入库）',
    normalRows.length === 1 && normalRows[0].boss_name === bossPicked,
    `rows=${normalRows.length} boss=${normalRows[0] && normalRows[0].boss_name} picked=${bossPicked}`);

  // ========== B5 心愿单弹窗：首领锁定同步 ==========
  await pg.goto(`${BASE}/index.html#/team/wishlist`, { waitUntil: 'load' });
  await pg.waitForSelector('button[onclick="wishlistShowModal()"]', { state: 'visible', timeout: 30000 });
  await pg.click('button[onclick="wishlistShowModal()"]');
  await pg.waitForSelector('#wishlistModal.show', { timeout: 10000 });
  await pg.click('#wishlistModeTier');
  await pg.waitForSelector('#wishlistTierBlock', { state: 'visible', timeout: 5000 });
  const b5a = await pg.evaluate(() => ({
    bossDisabled: document.getElementById('wishlistBoss').disabled,
    bossTextDisabled: document.getElementById('wishlistBossText').disabled,
    bossValue: document.getElementById('wishlistBoss').value,
    hintShown: document.getElementById('wishlistTierBossHint').style.display !== 'none',
  }));
  check('B5a 心愿单套装模式：首领下拉+自定义输入双禁用、值清空、提示显示（WP1.4 同步）',
    b5a.bossDisabled && b5a.bossTextDisabled && b5a.bossValue === '' && b5a.hintShown, JSON.stringify(b5a));
  await pg.click('#wishlistModeNormal');
  await sleep(200);
  const b5b = await pg.evaluate(() => ({
    bossEnabled: !document.getElementById('wishlistBoss').disabled,
    bossTextEnabled: !document.getElementById('wishlistBossText').disabled,
    hintHidden: document.getElementById('wishlistTierBossHint').style.display === 'none',
  }));
  check('B5b 心愿单回普通模式：首领控件解锁、提示隐藏',
    b5b.bossEnabled && b5b.bossTextEnabled && b5b.hintHidden, JSON.stringify(b5b));

  // ========== B6 全程 console 零报错 ==========
  check('B6a 全程零 TypeError', P.typeErrors.length === 0, P.typeErrors.slice(0, 2).join(' | ').slice(0, 400));
  const real = realErrors(P.errs, P.whitelist.length);
  check('B6b 全程 console 零报错（白名单：图标素材 404 在案/409 设计内/tier_set_pieces 404 迁移窗口）',
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
  if (testUid) await svcRest('DELETE', `/auth/v1/admin/users/${testUid}`);
  const l = guildId ? await svcRest('GET', `/rest/v1/loot_records?guild_id=eq.${guildId}&select=id`) : { body: [] };
  const g = await svcRest('GET', `/rest/v1/guilds?name=eq.${encodeURIComponent(GUILD_NAME)}&select=id`);
  const u = await svcRest('GET', '/auth/v1/admin/users?page=1&per_page=500');
  const users = Array.isArray((u.body && (u.body.users || u.body)) || []) ? (u.body.users || u.body) : [];
  check('C1 测试装备/公会/账号清零复核',
    (!Array.isArray(l.body) || l.body.length === 0) &&
    (!Array.isArray(g.body) || g.body.length === 0) &&
    !users.some(x => (x.email || '').toLowerCase() === EMAIL),
    `loots=${Array.isArray(l.body) ? l.body.length : '?'} guilds=${Array.isArray(g.body) ? g.body.length : '?'}`);
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
