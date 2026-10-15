// 任务书 #75-Day2 验证：拾取记录子标签 + 导入弹窗 + loot_drops 入库链路
// A 静态锚点（cloud.js 通道/app.js 逻辑/index.html DOM/main.css 样式/版本串 .96/changelog/台账）+ node --check。
// B 浏览器实测（自起 server :15672，真实 Supabase 测试公会）：
//   迁移探测先行——loot_drops 表存在走「全链路组」（导入写库→列表渲染→重复导入跳过），
//   表不存在（sql/42 待执行）走「门禁组」（中文提示不白屏不吞现场），两箱必居其一。
// C 清零：测试拾取记录/公会/账号删除复核。
// 用法: node scripts/verify-task75-day2.js
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 15672;
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = 't75d2-exp@example.com';
const PWD = 'T75d2-Exp-2026!';
const GUILD_NAME = 'T75D2测试会';
const MEMBER_NAME = 'T75D2测试员';
const VER = '20261015.96';

const SAMPLE_JSON = JSON.stringify([
  { itemName: '觉醒恐牙胸甲', itemID: 271876, iconID: 237510, quality: 4, ilvl: 324, slot: 'INVTYPE_CHEST', slotCN: '胸部', itemType: '护甲', bossName: '盘魂者内克扎莉', instanceName: '烈毒之渊', difficulty: '史诗', difficultyID: 16, timestamp: 1791902400, timestampISO: '2026-10-13T14:40:00.000Z', playerName: MEMBER_NAME },
  { itemName: '罪炽连发枪', itemID: 271680, iconID: null, quality: 4, ilvl: 292, slot: 'INVTYPE_RANGED', slotCN: '武器', itemType: '武器', bossName: '咬咬', instanceName: '闸板陋巷', difficulty: '史诗', difficultyID: 8, timestamp: 1791902460, timestampISO: '2026-10-13T14:41:00.000Z', playerName: MEMBER_NAME },
  { itemName: '缺字段样本', playerName: MEMBER_NAME }, // 缺 itemID/timestamp → 无效行
]);

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

// ==================== A 静态锚点 ====================
function staticAsserts() {
  console.log('== A. 静态锚点 ==');
  const app = read('js/app.js');
  const cloud = read('js/cloud.js');
  const index = read('index.html');
  const css = read('css/main.css');

  check('A1 cloud.js lootDrops 通道：reloadData/saveCloudData 双 case + reloadLootDrops/syncLootDrop 两函数',
    /case 'lootDrops':/.test(cloud) && /async function reloadLootDrops\(guildId\)/.test(cloud) &&
    /async function syncLootDrop\(guildId, operation, item\)/.test(cloud) &&
    (cloud.match(/case 'lootDrops':/g) || []).length === 2, '');
  check('A2a app.js 视图切换+懒加载+门禁（lootSwitchView/lootDropsEnsureLoaded/表未就绪中文提示）',
    /function lootSwitchView\(view\)/.test(app) && /async function lootDropsEnsureLoaded\(\)/.test(app) &&
    /拾取记录表未就绪（sql\/42 待运营执行）/.test(app), '');
  check('A2b 导入弹窗函数族 + 规范 4.6 modalDirtyChecks 登记 + 规范 1.2.2 批处理注释自引',
    /function lootDropImportOpen\(\)/.test(app) && /function lootDropImportParse\(\)/.test(app) &&
    /async function lootDropImportConfirm\(\)/.test(app) && /lootDropBindZone/.test(app) &&
    /modalDirtyChecks\.lootDropImportModal/.test(app) && /规范 1\.2\.2 批处理例外/.test(app), '');
  check('A2c 重复检测键与 sql/42 唯一索引同口径（拾取者+物品+时刻）',
    /function lootDropDupKey\(playerName, itemId, ts\)/.test(app) &&
    /`\$\{playerName\}\|\$\{itemId\}\|\$\{t\}`/.test(app), '');
  check('A2d .view-tab 全局选择器收窄（两处 #page-attendance 作用域）+ lootRender 末尾视图同步钩',
    (app.match(/#page-attendance \.view-tab/g) || []).length === 2 &&
    /lootSwitchView\(lootViewMode\);\n\}/.test(app), '');
  check('A3 index.html：子标签双视图 + 拾取工具区/表格 + 导入弹窗 DOM + 两处导入按钮 edit-only',
    index.includes('id="lootViewTabs"') && index.includes('data-lootview="drops"') &&
    index.includes('id="lootViewDrops"') && index.includes('id="lootDropsTableBody"') &&
    index.includes('id="lootDropImportModal"') && index.includes('id="lootDropZone"') &&
    (index.match(/lootDropImportOpen\(\)"/g) || []).length === 2 && // 分配/拾取两工具区各一（空态引导钮在 app.js 渲染层）
    /btn btn-secondary edit-only" onclick="lootDropImportOpen/.test(index), '');
  check('A4 main.css：拖放区/hover-dragover/预览滚动区三规则',
    /\.drop-import-zone \{/.test(css) && /\.drop-import-zone:hover, \.drop-import-zone\.dragover/.test(css) &&
    /\.drop-import-preview-wrap \{/.test(css), '');

  const cnt = (f, s) => (read(f).match(new RegExp(s.replace(/\./g, '\\.'), 'g')) || []).length;
  check('A5a 版本串 ' + VER + ' 三壳递增（index 15 / data 8 / decor 5）',
    cnt('index.html', VER) === 15 && cnt('data.html', VER) === 8 && cnt('decor.html', VER) === 5,
    `index=${cnt('index.html', VER)} data=${cnt('data.html', VER)} decor=${cnt('decor.html', VER)}`);
  check('A5b 旧串 20261014.95 三壳零残留',
    cnt('index.html', '20261014.95') === 0 && cnt('data.html', '20261014.95') === 0 && cnt('decor.html', '20261014.95') === 0, '');
  check('A6 changelog 补录（v3.2.0-task75-day2-lootdrops）+ 台账 REQ-163 Day2 段',
    app.includes("id: 'v3.2.0-task75-day2-lootdrops'") &&
    /REQ-163[\s\S]*Day2 已实现待验收/.test(read('docs/问题与需求清单.md')), '');

  const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f).concat(['server.js']);
  let allOk = true, bad = '';
  for (const f of jsFiles) {
    const r = spawnSync(process.execPath, ['--check', f], { cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) { allOk = false; bad = f; }
  }
  check('A7 node --check 全量通过（js/ 全部 + server.js）', allOk, bad);
}

// ==================== B 浏览器实测 ====================
let testUid = null, guildId = null;

async function ensureTestUser() {
  const list = await svcRest('GET', '/auth/v1/admin/users?page=1&per_page=500');
  const users = (list.body && (list.body.users || list.body)) || [];
  const hit = Array.isArray(users) ? users.find(u => (u.email || '').toLowerCase() === EMAIL) : null;
  if (hit) return hit.id;
  const c = await svcRest('POST', '/auth/v1/admin/users', { email: EMAIL, password: PWD, email_confirm: true, user_metadata: { display_name: 't75d2-exp' } });
  return c.body && c.body.id;
}

async function liveAsserts() {
  console.log('== B. 浏览器实测 ==');
  testUid = await ensureTestUser();
  if (!testUid) { check('B-前置 测试账号就位', false); return; }
  const oldG = await svcRest('GET', `/rest/v1/guilds?name=eq.${encodeURIComponent(GUILD_NAME)}&select=id`);
  for (const g of (Array.isArray(oldG.body) ? oldG.body : [])) {
    await svcRest('DELETE', `/rest/v1/loot_drops?guild_id=eq.${g.id}`);
    await svcRest('DELETE', `/rest/v1/guild_members?guild_id=eq.${g.id}`);
    await svcRest('DELETE', `/rest/v1/guilds?id=eq.${g.id}`);
  }
  const g = await svcRest('POST', '/rest/v1/guilds', { name: GUILD_NAME, owner_id: testUid, invite_code: 'T75D2XP1', server_name: '测试', server_region: '一区' });
  guildId = g.body && g.body[0] && g.body[0].id;
  await svcRest('POST', '/rest/v1/guild_members', [{ guild_id: guildId, user_id: testUid, role: 'owner', display_name: 't75d2-exp' }]);
  await svcRest('POST', '/rest/v1/raid_members', { guild_id: guildId, name: MEMBER_NAME, class: '战士', spec: '', role: '输出', status: '正式' });

  // 迁移探测：loot_drops 表是否已执行 sql/42
  const probe = await svcRest('GET', '/rest/v1/loot_drops?select=id&limit=1');
  const tableReady = probe.status === 200;
  console.log(`--- loot_drops 表探测：${tableReady ? '已就绪（全链路组）' : '未就绪（门禁组，status=' + probe.status + '）'} ---`);

  await startServer();
  console.log('--- 服务器已起（端口 ' + PORT + '） ---');

  const browser = await chromium.launch({ headless: true });
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
      if (/assets\/icons\/items\//.test(u)) { whitelist.push(u); return; }
      if (r.status() === 409 && /user_profiles/.test(u)) { whitelist.push(u); return; }
      if (r.status() === 404 && /tier_set_pieces/.test(u)) { whitelist.push(u); return; }
      if (!tableReady && /loot_drops/.test(u)) { whitelist.push(u); return; } // 门禁组预期 404
      errs.push(`http${r.status()} ${r.request().method()} ${u}`);
    }
  });

  await pg.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await pg.waitForSelector('#iaLoginBtn', { state: 'visible', timeout: 15000 });
  await pg.click('#iaLoginBtn');
  await pg.fill('#authEmail', EMAIL);
  await pg.fill('#authPassword', PWD);
  await pg.click('#authLoginBtn');
  await pg.waitForURL('**/index.html#/home', { timeout: 30000 });
  check('B-前置 登录成功落 #/home', true, '');

  // B1 子标签在场 + 默认分配记录视图
  await pg.goto(`${BASE}/index.html#/team/loot`, { waitUntil: 'load' });
  await pg.waitForSelector('#lootViewTabs', { timeout: 30000 });
  const b1 = await pg.evaluate(() => ({
    tabs: [...document.querySelectorAll('#lootViewTabs .view-tab')].map(t => t.textContent.trim()),
    assignActive: document.querySelector('#lootViewTabs .view-tab[data-lootview="assign"]').classList.contains('active'),
    assignShown: document.getElementById('lootViewAssign').style.display !== 'none',
    dropsHidden: document.getElementById('lootViewDrops').style.display === 'none',
  }));
  check('B1 子标签「分配记录/拾取记录」在场，默认分配记录激活、拾取视图隐藏',
    b1.tabs.join('/') === '分配记录/拾取记录' && b1.assignActive && b1.assignShown && b1.dropsHidden,
    JSON.stringify(b1));

  // B2 切拾取记录标签
  await pg.click('#lootViewTabs .view-tab[data-lootview="drops"]');
  await sleep(1200);
  const b2 = await pg.evaluate(() => ({
    dropsActive: document.querySelector('#lootViewTabs .view-tab[data-lootview="drops"]').classList.contains('active'),
    dropsShown: document.getElementById('lootViewDrops').style.display !== 'none',
    assignHidden: document.getElementById('lootViewAssign').style.display === 'none',
    bodyText: document.getElementById('lootDropsTableBody').textContent,
  }));
  check('B2 切「拾取记录」：视图显隐切换 + tab 激活态迁移',
    b2.dropsActive && b2.dropsShown && b2.assignHidden, JSON.stringify({ ...b2, bodyText: undefined }));

  if (!tableReady) {
    // ---- 门禁组（sql/42 未执行） ----
    check('B3-门禁 表未就绪中文提示「拾取记录表未就绪（sql/42 待运营执行）」不白屏',
      b2.bodyText.includes('拾取记录表未就绪') && b2.bodyText.includes('sql/42'), b2.bodyText.slice(0, 80));
    skip('B4/B5/B6 全链路组', 'loot_drops 表未就绪（sql/42 待运营执行），执行后复跑本脚本走全链路组');
  } else {
    // ---- 全链路组 ----
    check('B3 空态引导（§4.9）：暂无拾取记录文案 + 导入拾取引导钮',
      b2.bodyText.includes('暂无拾取记录') && b2.bodyText.includes('导入拾取'), b2.bodyText.slice(0, 60));

    // B4 导入弹窗：粘贴 → 解析 → 预览 → 确认入库
    await pg.click('#lootViewDrops button[onclick="lootDropImportOpen()"]');
    await pg.waitForSelector('#lootDropImportModal.show', { timeout: 10000 });
    await pg.evaluate(j => { document.getElementById('lootDropImportText').value = j; }, SAMPLE_JSON);
    await pg.click('button[onclick="lootDropImportParse()"]');
    await pg.waitForSelector('#lootDropImportPreview table tbody tr', { timeout: 5000 });
    const b4a = await pg.evaluate(() => ({
      summary: document.querySelector('#lootDropImportPreview div').textContent.trim(),
      rows: document.querySelectorAll('#lootDropImportPreview tbody tr').length,
      checkedBoxes: document.querySelectorAll('#lootDropImportPreview input[type=checkbox]:checked').length,
      btnText: document.getElementById('lootDropImportConfirmBtn').textContent.trim(),
      btnDisabled: document.getElementById('lootDropImportConfirmBtn').disabled,
    }));
    check('B4a 解析预览：共 3 条 · 可入库 2 · 缺字段 1；勾选=2、按钮「确认入库（2 条）」可用',
      b4a.rows === 3 && /共 3 条/.test(b4a.summary) && /可入库 2 条/.test(b4a.summary) && /缺字段 1 条/.test(b4a.summary) &&
      b4a.checkedBoxes === 2 && b4a.btnText === '确认入库（2 条）' && !b4a.btnDisabled, JSON.stringify(b4a));

    await pg.click('#lootDropImportConfirmBtn');
    await pg.waitForFunction(() => !document.getElementById('lootDropImportModal').classList.contains('show'), { timeout: 20000 });
    await sleep(800);
    const saved = await svcRest('GET', `/rest/v1/loot_drops?guild_id=eq.${guildId}&select=id,item_name,official_item_id,slot_cn,icon_id,quality`);
    const savedRows = Array.isArray(saved.body) ? saved.body : [];
    check('B4b 入库主链路：loot_drops 落 2 行（字段族完整，无效行未写入）',
      savedRows.length === 2 && savedRows.some(r => r.official_item_id === 271876 && r.slot_cn === '胸部' && r.icon_id === 237510),
      `rows=${savedRows.length}`);
    const b4c = await pg.evaluate(() => ({
      dropsActive: document.querySelector('#lootViewTabs .view-tab[data-lootview="drops"]').classList.contains('active'),
      bodyText: document.getElementById('lootDropsTableBody').textContent,
    }));
    check('B4c 入库后自动切拾取记录视图 + 列表渲染新行（装备名/装等/部位上屏）',
      b4c.dropsActive && b4c.bodyText.includes('觉醒恐牙胸甲') && b4c.bodyText.includes('324') && b4c.bodyText.includes('胸部'),
      b4c.bodyText.slice(0, 80));

    // B5 重复导入幂等：同 JSON 再导 → 全部标「已存在」且确认钮禁用
    await pg.click('#lootViewDrops button[onclick="lootDropImportOpen()"]');
    await pg.waitForSelector('#lootDropImportModal.show', { timeout: 10000 });
    await pg.evaluate(j => { document.getElementById('lootDropImportText').value = j; }, SAMPLE_JSON);
    await pg.click('button[onclick="lootDropImportParse()"]');
    await pg.waitForSelector('#lootDropImportPreview table tbody tr', { timeout: 5000 });
    const b5 = await pg.evaluate(() => ({
      summary: document.querySelector('#lootDropImportPreview div').textContent.trim(),
      btnDisabled: document.getElementById('lootDropImportConfirmBtn').disabled,
    }));
    check('B5 重复导入：2 条标记「已存在跳过」、确认钮禁用（不重复插入）',
      /已存在跳过 2 条/.test(b5.summary) && b5.btnDisabled, JSON.stringify(b5));
    await pg.evaluate(() => closeModal('lootDropImportModal'));

    // B6 筛选：搜索「连发枪」→ 只剩 1 行；清空恢复 2 行
    await pg.fill('#lootDropsSearch', '连发枪');
    await sleep(400);
    const b6a = await pg.evaluate(() => document.querySelectorAll('#lootDropsTableBody tr').length);
    await pg.fill('#lootDropsSearch', '');
    await sleep(400);
    const b6b = await pg.evaluate(() => document.querySelectorAll('#lootDropsTableBody tr').length);
    check('B6 筛选生效：搜索收窄 1 行 / 清空恢复 2 行', b6a === 1 && b6b === 2, `search=${b6a} clear=${b6b}`);
  }

  // B7 分配记录回归：切回 assign 表格正常 + 考勤视图 tab 未受影响（收窄副作用零回归）
  await pg.click('#lootViewTabs .view-tab[data-lootview="assign"]');
  await sleep(400);
  const b7a = await pg.evaluate(() => document.getElementById('lootViewAssign').style.display !== 'none');
  await pg.goto(`${BASE}/index.html#/team/attendance`, { waitUntil: 'load' });
  await pg.waitForSelector('#page-attendance .view-tab', { timeout: 30000 });
  const b7b = await pg.evaluate(() => {
    const tabs = [...document.querySelectorAll('#page-attendance .view-tab')];
    return { n: tabs.length, activeOne: tabs.filter(t => t.classList.contains('active')).length };
  });
  check('B7 回归：分配记录视图还原 + 考勤页 view-tab 恰一个激活（作用域收窄零误伤）',
    b7a && b7b.n >= 2 && b7b.activeOne === 1, JSON.stringify(b7b));

  // B8 全程 console 零报错
  check('B8a 全程零 TypeError', typeErrors.length === 0, typeErrors.slice(0, 2).join(' | ').slice(0, 300));
  let budget = whitelist.length;
  const real = errs.filter(e => {
    if (budget > 0 && e.startsWith('console: Failed to load resource: the server responded with a status of 4')) { budget--; return false; }
    // 门禁组预期：表未就绪时 cloud.js reloadData 的 console.error 诊断（页面已中文提示，属设计内路径）
    if (!tableReady && /loot_drops|PGRST205/.test(e)) return false;
    return true;
  });
  check('B8b 全程 console 零报错（白名单：图标素材 404/409 设计内/tier_set_pieces 404/门禁组 loot_drops 404）',
    real.length === 0, real.slice(0, 3).join(' | ').slice(0, 300));

  await browser.close();
}

// ==================== C 清零 ====================
async function cleanup() {
  console.log('== C. 清零 ==');
  if (guildId) {
    await svcRest('DELETE', `/rest/v1/loot_drops?guild_id=eq.${guildId}`);
    await svcRest('DELETE', `/rest/v1/raid_members?guild_id=eq.${guildId}`);
    await svcRest('DELETE', `/rest/v1/guild_members?guild_id=eq.${guildId}`);
    await svcRest('DELETE', `/rest/v1/guilds?id=eq.${guildId}`);
  }
  if (testUid) await svcRest('DELETE', `/auth/v1/admin/users/${testUid}`);
  const d = guildId ? await svcRest('GET', `/rest/v1/loot_drops?guild_id=eq.${guildId}&select=id`) : { body: [] };
  const g = await svcRest('GET', `/rest/v1/guilds?name=eq.${encodeURIComponent(GUILD_NAME)}&select=id`);
  const u = await svcRest('GET', '/auth/v1/admin/users?page=1&per_page=500');
  const users = Array.isArray((u.body && (u.body.users || u.body)) || []) ? (u.body.users || u.body) : [];
  check('C1 测试拾取记录/公会/账号清零复核',
    (!Array.isArray(d.body) || d.body.length === 0) &&
    (!Array.isArray(g.body) || g.body.length === 0) &&
    !users.some(x => (x.email || '').toLowerCase() === EMAIL),
    `drops=${Array.isArray(d.body) ? d.body.length : '?'} guilds=${Array.isArray(g.body) ? g.body.length : '?'}`);
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
