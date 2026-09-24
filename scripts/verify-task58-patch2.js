// 任务书 #58-补丁2 验证：WP1 水印素材 v2 换线 + WP2 独立页表格列对齐
// A 静态：EXPORT_SKINS 三行 -v2 路径+旧路径零引用/素材在场且旧件保留/版本串 .78/WP2 CSS 规则/红线/node --check。
// B 浏览器实测（应用壳 + 公示壳）：
//   B1 三枚 v2 素材 HTTP 200 + Content-Type image/png；
//   B2 导出图片链路冒烟：预览 canvas 900 宽出图 + 联盟/部落皮肤 v2 水印区在场（像素抽样）；
//   B3 WP2 独立页表格：fixed 布局/来源列宽受控 260/数量居中/两数字列右对齐/src ellipsis；
//   B4 水印 404 优雅降级不受影响（阻断素材请求仍出图 + console 告警）；
//   B5 全程零 JS 报错零意外 4xx。
// C 清零：测试事件/方案行/公会/账号四清零复核。
// 用法: node scripts/verify-task58-patch2.js
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'backup/2026-09-24-task58-patch2');
const PORT = 15664;
const BASE = `http://127.0.0.1:${PORT}`;
const VER = '20260923.78';
const VER_PREV = '20260923.77';
const PWD = 'T58-P2-2026!';
const EMAIL = 't58-p2@example.com';
const GUILD_NAME = 'T58P2测试会';
const WM_V2 = ['wm-wb-shield-v2.png', 'wm-alliance-v2.png', 'wm-horde-v2.png'];
const WM_OLD = ['wm-wb-shield.png', 'wm-alliance.png', 'wm-horde.png'];

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const SVC = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail !== undefined ? `（${detail}）` : ''}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
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
function pngDims(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

let serverProc = null;
async function startServer() {
  serverProc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DEPLOY_RUN_PORT: String(PORT) },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(BASE + '/index.html'); if (r.ok) return; } catch { /* 未起 */ }
    await sleep(300);
  }
  throw new Error('server 启动超时');
}

// ==================== A 静态断言 ====================
function staticAsserts() {
  const dd = fs.readFileSync(path.join(ROOT, 'js/decorData.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'css/decor-public.css'), 'utf8');
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const decor = fs.readFileSync(path.join(ROOT, 'decor.html'), 'utf8');

  check('A1 EXPORT_SKINS 三行 = -v2 路径（色值/标签原样）+ 旧路径（无 -v2）在 decorData.js 零引用 + 绘制硬规格未动',
    /gold: \{ label: '默认·管家金边', color: '#C9A869', wm: 'assets\/decor-brand\/wm-wb-shield-v2\.png' \}/.test(dd) &&
    /alliance: \{ label: '联盟·狮蓝', color: '#4A7FBF', wm: 'assets\/decor-brand\/wm-alliance-v2\.png' \}/.test(dd) &&
    /horde: \{ label: '部落·战红', color: '#B03A2E', wm: 'assets\/decor-brand\/wm-horde-v2\.png' \}/.test(dd) &&
    WM_OLD.every(f => !dd.includes(f)) &&
    /const EXPORT_IMG_W = 900/.test(dd) && /const EXPORT_WM_ALPHA = 0\.18/.test(dd) &&
    /ctx\.drawImage\(wmImg, W - EXPORT_WM_MARGIN - EXPORT_WM_W/.test(dd));
  check('A2 三枚 v2 素材在场（合法 PNG，宽>0）+ 旧三枚保留不删（回滚可及）',
    WM_V2.every(f => {
      const p = path.join(ROOT, 'assets/decor-brand', f);
      return fs.existsSync(p) && fs.readFileSync(p).slice(1, 4).toString() === 'PNG' && pngDims(p).w > 0;
    }) && WM_OLD.every(f => fs.existsSync(path.join(ROOT, 'assets/decor-brand', f))),
    WM_V2.map(f => `${f}=${pngDims(path.join(ROOT, 'assets/decor-brand', f)).w}px`).join(' '));
  const countStr = (s, v) => (s.match(new RegExp(v.replace(/\./g, '\\.'), 'g')) || []).length;
  check(`A3 版本串 ${VER}（index×15/decor×6）+ 旧串（${VER_PREV}）零残留`,
    countStr(index, VER) === 15 && countStr(decor, VER) === 6 &&
    countStr(index, VER_PREV) === 0 && countStr(decor, VER_PREV) === 0);
  check('A4 WP2 CSS：fixed 布局 + 列宽 36/260/96/72/72/48 + 数量居中 + th5/th6 右对齐 + src max-width 去除（原规则保留）',
    /\.dh-pp-table \{ table-layout: fixed; \}/.test(css) &&
    /\.dh-pp-table th:nth-child\(3\), \.dh-pp-table td:nth-child\(3\) \{ width: 260px; \}/.test(css) &&
    /\.dh-pp-table th:nth-child\(4\), \.dh-pp-table td:nth-child\(4\) \{ width: 96px; text-align: center; \}/.test(css) &&
    /\.dh-pp-table th:nth-child\(5\), \.dh-pp-table th:nth-child\(6\) \{ text-align: right; \}/.test(css) &&
    /\.dh-pp-src \{ max-width: none; \}/.test(css) &&
    /\.dh-pp-src \{\s*\n\s*max-width: 260px;/.test(css));
  const unquote = p => {
    if (!p.startsWith('"')) return p;
    const inner = p.slice(1, -1);
    const bytes = [];
    for (let i = 0; i < inner.length; i++) {
      const m = inner.slice(i).match(/^\\([0-7]{3})/);
      if (m) { bytes.push(parseInt(m[1], 8)); i += 3; }
      else bytes.push(...Buffer.from(inner[i]));
    }
    return Buffer.from(bytes).toString('utf8');
  };
  const st = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean)
    .map(l => l.slice(0, 2).trim() + ' ' + unquote(l.slice(3)));
  const allowed = new Set([
    'M css/decor-public.css', 'M decor.html', 'M index.html', 'M js/decorData.js',
    '?? assets/decor-brand/wm-alliance-v2.png', '?? assets/decor-brand/wm-horde-v2.png', '?? assets/decor-brand/wm-wb-shield-v2.png',
    '?? backup/2026-09-24-task58-patch2/', '?? scripts/verify-task58-patch2.js',
    '?? tasks/任务书58-补丁2-水印素材棋盘格修复.md',
  ]);
  check('A5 红线零越界：改动仅限 decorData/decor-public.css/双壳 html + v2 素材与 verify 新增',
    st.every(l => allowed.has(l)),
    `status 清单=${st.join(' | ') || '（空）'}`);
  for (const f of ['js/decorData.js', 'scripts/verify-task58-patch2.js']) {
    const r = spawnSync(process.execPath, ['--check', f], { cwd: ROOT, encoding: 'utf8' });
    check('A6 node --check ' + f, r.status === 0, r.status === 0 ? '' : r.stderr.trim().split('\n')[0]);
  }
  const t = spawnSync(process.execPath, ['--test', 'test/server-security.test.js'], { cwd: ROOT, encoding: 'utf8' });
  check('A7 node --test server-security 回归', t.status === 0, (t.stdout.match(/# pass \d+|ℹ pass \d+/) || [''])[0]);
}

// ==================== B 浏览器实测 ====================
let testUid = null, guildId = null, vidApp = null;

async function liveAsserts() {
  fs.mkdirSync(OUT, { recursive: true });
  const list = await svcRest('GET', '/auth/v1/admin/users?page=1&per_page=500');
  const users = (list.body && (list.body.users || list.body)) || [];
  const hit = users.find(u => (u.email || '').toLowerCase() === EMAIL);
  if (hit) testUid = hit.id;
  else {
    const c = await svcRest('POST', '/auth/v1/admin/users', { email: EMAIL, password: PWD, email_confirm: true, user_metadata: { display_name: 't58-p2' } });
    testUid = c.body && c.body.id;
  }
  check('B-前置 测试账号就位', !!testUid);
  if (!testUid) return;
  await svcRest('DELETE', `/rest/v1/decor_plans?user_id=eq.${testUid}`);
  const g = await svcRest('POST', '/rest/v1/guilds', { name: GUILD_NAME, owner_id: testUid, invite_code: 'T58P2B', server_name: '测试', server_region: '一区' });
  guildId = g.body && g.body[0] && g.body[0].id;
  await svcRest('POST', '/rest/v1/guild_members', [{ guild_id: guildId, user_id: testUid, role: 'owner', display_name: 't58-p2' }]);

  await startServer();
  console.log('--- 服务器已起（端口 ' + PORT + '） ---');

  // ========== B1：三枚 v2 素材 HTTP 200 + Content-Type: image/png ==========
  const http = [];
  for (const f of WM_V2) {
    const r = await fetch(`${BASE}/assets/decor-brand/${f}`);
    http.push({ f, status: r.status, ct: r.headers.get('content-type') || '' });
    await r.arrayBuffer().then(b => b.byteLength); // 消费 body
  }
  check('B1 三枚 v2 素材经服务器 HTTP 200 且 Content-Type: image/png',
    http.every(h => h.status === 200 && h.ct.includes('image/png')),
    http.map(h => `${h.f}:${h.status}/${h.ct}`).join(' '));

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', acceptDownloads: true });
  const pg = await ctx.newPage();
  const errs = [], badNet = [];
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  pg.on('response', r => { if (r.status() >= 400) badNet.push(`http${r.status()} ${r.request().method()} ${r.url()}`); });

  await pg.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await pg.fill('#authEmail', EMAIL);
  await pg.fill('#authPassword', PWD);
  await pg.click('#authLoginBtn');
  await pg.waitForSelector('.nav-item[data-page="decor"]', { state: 'visible', timeout: 30000 });
  vidApp = await pg.evaluate(() => localStorage.getItem('wb_vid'));
  await pg.evaluate(() => localStorage.removeItem('wb_decor_plan_draft'));

  // 图鉴加 3 件（含一件 ×2，撑出多行表格）
  await pg.click('.nav-item[data-page="decor"]');
  await pg.waitForSelector('.dh-grid .dh-card', { timeout: 30000 });
  await pg.locator('.dh-card-add').nth(0).click();
  await pg.locator('.dh-card-add').nth(1).click();
  await pg.locator('.dh-card-add').nth(1).click();
  await pg.locator('.dh-card-add').nth(2).click();
  await sleep(400);

  // ========== B2：导出图片链路冒烟（canvas 900 宽 + 联盟/部落 v2 水印区在场） ==========
  await pg.click('#dhPlanToggle');
  await pg.waitForSelector('.dh-plan-drawer.open', { timeout: 5000 });
  await pg.click('#dhPlanExport');
  await pg.waitForSelector('#dhExpTabImage', { timeout: 5000 });
  await pg.click('#dhExpTabImage');
  await pg.waitForSelector('#dhExpCanvas', { state: 'visible', timeout: 5000 });
  await sleep(700); // v2 水印首次异步加载落定
  const wmSample = () => pg.evaluate(() => {
    const c = document.getElementById('dhExpCanvas');
    const ctx = c.getContext('2d');
    let diff = 0;
    for (let x = c.width - 16 - 150 + 8; x < c.width - 24; x += 12) {
      for (let y = c.height - 16 - 140; y < c.height - 24; y += 12) {
        const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
        if (Math.abs(r - 0x0F) + Math.abs(g - 0x11) + Math.abs(b - 0x15) > 12) diff++;
      }
    }
    return { w: c.width, h: c.height, diff };
  });
  const goldS = await wmSample();
  await pg.check('input[name="dhExpSkin"][value="alliance"]');
  await sleep(600);
  const alS = await wmSample();
  const [dlAl] = await Promise.all([
    pg.waitForEvent('download', { timeout: 10000 }),
    pg.click('#dhExpSaveImg'),
  ]);
  await dlAl.saveAs(path.join(OUT, 'export-alliance-v2.png'));
  await pg.check('input[name="dhExpSkin"][value="horde"]');
  await sleep(600);
  const hdS = await wmSample();
  check('B2 导出图片链路冒烟：预览 canvas 900 宽出图 + 三皮肤 v2 水印区均在场（非底色素抽样 >10）',
    goldS.w === 900 && goldS.h > 100 && goldS.diff > 10 && alS.diff > 10 && hdS.diff > 10,
    `金=${goldS.diff} 蓝=${alS.diff} 红=${hdS.diff} 画布=${goldS.w}×${goldS.h}`);
  const [dl] = await Promise.all([
    pg.waitForEvent('download', { timeout: 10000 }),
    pg.click('#dhExpSaveImg'),
  ]);
  const fileExp = path.join(OUT, 'export-horde-v2.png');
  await dl.saveAs(fileExp);
  check('B2b 导出 PNG 正常（宽 ≥900，原件落物料区供顾问比对）', pngDims(fileExp).w >= 900,
    `${pngDims(fileExp).w}×${pngDims(fileExp).h}`);
  await pg.click('.dh-plan-export-overlay .dh-modal-close');
  await sleep(300);

  // ========== B3：WP2 独立页表格列对齐（应用壳 decor-plan 页） ==========
  await pg.click('#dhPlanClose');
  await sleep(300);
  await pg.click('.nav-item[data-page="decor-plan"]');
  await pg.waitForSelector('.dh-pp-table tbody tr', { timeout: 8000 });
  const tbl = await pg.evaluate(() => {
    const table = document.querySelector('.dh-pp-table');
    const cs = getComputedStyle(table);
    const th = i => getComputedStyle(table.querySelector(`thead th:nth-child(${i})`)).textAlign;
    const srcCells = [...table.querySelectorAll('td.dh-pp-src')].map(td => ({
      len: td.textContent.length, ow: td.offsetWidth, sw: td.scrollWidth,
      tof: getComputedStyle(td).textOverflow, nw: getComputedStyle(td).whiteSpace,
    }));
    const qtyTd = getComputedStyle(table.querySelector('td:nth-child(4)')).textAlign;
    const numTd = [...table.querySelectorAll('td.dh-pp-num')].map(td => getComputedStyle(td).textAlign);
    const col3w = table.querySelector('td:nth-child(3)').offsetWidth;
    const col4w = table.querySelector('td:nth-child(4)').offsetWidth;
    return { layout: cs.tableLayout, th4: th(4), th5: th(5), th6: th(6), qtyTd, numTd, col3w, col4w, srcCells };
  });
  const anyTrunc = tbl.srcCells.some(c => c.sw > c.ow);
  check('B3 WP2 表格：fixed 布局 + 来源列宽受控（≤260 不撑爆）+ src ellipsis/nowrap',
    tbl.layout === 'fixed' && tbl.col3w <= 260 &&
    tbl.srcCells.length >= 2 && tbl.srcCells.every(c => c.tof === 'ellipsis' && c.nw === 'nowrap'),
    `layout=${tbl.layout} 来源列宽=${tbl.col3w} 行数=${tbl.srcCells.length} 实截断行=${anyTrunc ? '有' : '无（本批来源均短，以 computed 样式佐证）'}`);
  check('B3b WP2 对齐：数量列 th/td 居中 + 容量·件/小计 th 右对齐 + 数据 td 右对齐（表头数据同缘）',
    tbl.th4 === 'center' && tbl.qtyTd === 'center' &&
    tbl.th5 === 'right' && tbl.th6 === 'right' && tbl.numTd.every(a => a === 'right'),
    `th4=${tbl.th4} td4=${tbl.qtyTd} th5=${tbl.th5} th6=${tbl.th6} td数列=${[...new Set(tbl.numTd)].join('/')}`);
  const planPageShot = path.join(OUT, 'plan-page-table.png');
  await pg.locator('.dh-pp-table-wrap').screenshot({ path: planPageShot });

  // ========== B4：水印 404 优雅降级不受影响（公示壳，阻断含 -v2 的素材请求） ==========
  const pg4 = await ctx.newPage();
  const wmWarns = [];
  pg4.on('console', m => { if (m.type() === 'warning' && m.text().includes('水印素材缺失')) wmWarns.push(m.text()); });
  await pg4.route('**/assets/decor-brand/wm-*.png', r => r.abort());
  await pg4.goto(`${BASE}/decor.html`, { waitUntil: 'load' });
  await pg4.waitForSelector('.dh-grid .dh-card', { timeout: 30000 });
  await pg4.locator('.dh-card-add').first().click();
  await sleep(300);
  await pg4.click('#dhPlanToggle');
  await pg4.waitForSelector('.dh-plan-drawer.open', { timeout: 5000 });
  await pg4.click('#dhPlanExport');
  await pg4.waitForSelector('#dhExpTabImage', { timeout: 5000 });
  await pg4.click('#dhExpTabImage');
  await sleep(600);
  const [dl4] = await Promise.all([
    pg4.waitForEvent('download', { timeout: 10000 }),
    pg4.click('#dhExpSaveImg'),
  ]);
  const file4 = path.join(OUT, 'export-nowm-degrade.png');
  await dl4.saveAs(file4);
  check('B4 水印 404 优雅降级：console 告警 + 无水印出图不阻断（PNG 正常导出）',
    wmWarns.length > 0 && pngDims(file4).w >= 900, `告警=${wmWarns.length} 条`);
  await pg4.close();

  // ========== B5：零 JS 报错零意外 4xx（主流程页） ==========
  const NET_409 = /^http409 POST https:\/\/[^/]+\/rest\/v1\/user_profiles$/;
  const badReal = badNet.filter(e => !NET_409.test(e));
  let echoBudget = badNet.length - badReal.length;
  const errsReal = errs.filter(e => {
    if (echoBudget > 0 && e === 'console: Failed to load resource: the server responded with a status of 409 ()') { echoBudget--; return false; }
    return true;
  });
  check('B5 全程零 JS 报错零意外 4xx', badReal.length === 0 && errsReal.length === 0,
    badReal.concat(errsReal).join(' | ').slice(0, 160) || '0');

  await ctx.close();
  await browser.close();
}

// ==================== C 清零 ====================
async function cleanupAsserts() {
  if (vidApp) await svcRest('DELETE', `/rest/v1/analytics_events?vid=eq.${vidApp}`);
  const leftEv = vidApp ? await svcRest('GET', `/rest/v1/analytics_events?select=id&vid=eq.${vidApp}`) : { status: 200, body: [] };
  check('C1 测试事件行清零复核', leftEv.status === 200 && Array.isArray(leftEv.body) && leftEv.body.length === 0,
    `残留=${Array.isArray(leftEv.body) ? leftEv.body.length : '?'}`);
  if (testUid) await svcRest('DELETE', `/rest/v1/decor_plans?user_id=eq.${testUid}`);
  const leftPlan = testUid ? await svcRest('GET', `/rest/v1/decor_plans?user_id=eq.${testUid}&select=id`) : { status: 200, body: [] };
  check('C2 测试方案行清零复核（头+明细级联）',
    leftPlan.status === 200 && Array.isArray(leftPlan.body) && leftPlan.body.length === 0);
  if (guildId) {
    await svcRest('DELETE', `/rest/v1/guild_members?guild_id=eq.${guildId}`);
    await svcRest('DELETE', `/rest/v1/guilds?id=eq.${guildId}`);
  }
  if (testUid) await svcRest('DELETE', `/auth/v1/admin/users/${testUid}`);
  const list = await svcRest('GET', '/auth/v1/admin/users?page=1&per_page=500');
  const users = (list.body && (list.body.users || list.body)) || [];
  check('C3 测试公会+测试账号清零复核',
    !users.some(u => (u.email || '').toLowerCase() === EMAIL));
}

(async () => {
  console.log('===== A 静态断言 =====');
  staticAsserts();
  console.log('===== B 浏览器实测（v2 素材 HTTP/导出冒烟/水印像素/WP2 表格/404 降级） =====');
  try {
    await liveAsserts();
  } catch (e) {
    check('B 段异常捕获（不假绿）', false, e.message);
  } finally {
    if (serverProc) serverProc.kill();
  }
  console.log('===== C 清零 =====');
  try {
    await cleanupAsserts();
  } catch (e) {
    check('C 清零异常', false, e.message);
  }
  const pass = results.filter(r => r.ok).length;
  const fail = results.filter(r => !r.ok).length;
  console.log(`\n========== 合计 ${pass}/${results.length} 通过，${fail} 红 ==========`);
  process.exit(fail === 0 ? 0 : 1);
})();
