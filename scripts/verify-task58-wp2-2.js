// 任务书 #58-WP2-2 验证：导出图片模式 + 三皮肤 + 阵营水印（Canvas 零依赖手绘）
// A 静态：皮肤表/硬规格常量/绘制规格锚点/tab 壳/WP1 文字模式锚点保留/动作链路/素材在场/版本串/红线/node --check。
// B 浏览器实测（应用壳 + 公示壳）：
//   B1 tab 壳默认文字预览+WP1 文字内容不回归；B2 图片 tab 画布 900 宽+三 radio；
//   B3 切皮肤预览即时重绘（dataURL 三态互异）；B4 像素复核（边框肤色/水印区在场/卡高随内容）；
//   B5 三皮肤导出 PNG 原件（下载捕获，宽 ≥900，文件名口径）——原件落 backup 物料区供顾问 PIL 复核；
//   B6 复制图片成功；B7 复制降级（自动下载+toast 说明）；B8 水印 404 优雅降级不阻断；
//   B9 无清单导出（空方案出图+PNG）；B10 零 JS 报错。
// C 清零：测试事件/方案行/公会/账号四清零复核。
// 用法: node scripts/verify-task58-wp2-2.js
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'backup/2026-09-24-task58-wp2-2');
const PORT = 15663;
const BASE = `http://127.0.0.1:${PORT}`;
const VER = '20260923.76';
const VER_PREV = '20260923.75';
const PWD = 'T58-WP22-2026!';
const EMAIL = 't58-wp22@example.com';
const GUILD_NAME = 'T58WP22测试会';

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

  check('A1 皮肤表三色 + 水印路径 + 硬规格常量（900/150/16/0.18/#0F1115）+ 过渡素材口径注释',
    /gold: \{ label: '默认·管家金边', color: '#C9A869', wm: 'assets\/decor-brand\/wm-wb-shield\.png' \}/.test(dd) &&
    /alliance: \{ label: '联盟·狮蓝', color: '#4A7FBF', wm: 'assets\/decor-brand\/wm-alliance\.png' \}/.test(dd) &&
    /horde: \{ label: '部落·战红', color: '#B03A2E', wm: 'assets\/decor-brand\/wm-horde\.png' \}/.test(dd) &&
    /const EXPORT_IMG_W = 900/.test(dd) && /const EXPORT_WM_W = 150/.test(dd) &&
    /const EXPORT_WM_MARGIN = 16/.test(dd) && /const EXPORT_WM_ALPHA = 0\.18/.test(dd) &&
    /const EXPORT_BG = '#0F1115'/.test(dd) && /正式上线前评估简化重绘/.test(dd));
  check('A2 绘制规格：圆角≤8 + 边框 3px 肤色 + 水印垫底先绘（drawImage 在文字层之前）+ 右下锚定算式 + 页脚固定行 + 合计行',
    /roundRectPath\(ctx, 1\.5, 1\.5, W - 3, H - 3, 8\)/.test(dd) &&
    /ctx\.lineWidth = 3;\s*\n\s*ctx\.strokeStyle = skin\.color/.test(dd) &&
    /ctx\.globalAlpha = EXPORT_WM_ALPHA/.test(dd) &&
    /ctx\.drawImage\(wmImg, W - EXPORT_WM_MARGIN - EXPORT_WM_W, H - EXPORT_WM_MARGIN - wmH, EXPORT_WM_W, wmH\)/.test(dd) &&
    dd.indexOf('ctx.drawImage(wmImg') < dd.indexOf('标题区') &&
    /魔兽管家 · 家宅图鉴免费组单：https:\/\/wow\.ddctl\.com\/decor\.html', PAD, y \+ 15\)/.test(dd) &&
    /合计 \$\{n\} 件 · 容量 \$\{cap\.toLocaleString\(\)\}/.test(dd));
  check('A3 tab 壳：文字预览默认 active/aria-selected + 生成图片次位 + WP1 文字模式锚点原样（id/类/提示文案）',
    /id="dhExpTabText" role="tab" aria-selected="true">文字预览/.test(dd) &&
    /id="dhExpTabImage" role="tab" aria-selected="false">生成图片/.test(dd) &&
    /class="dh-exp-tab active" id="dhExpTabText"/.test(dd) &&
    /id="dhPlanExportText" class="dh-plan-export-text"/.test(dd) &&
    /改动只影响本次导出，不回写方案单数据/.test(dd) &&
    /id="dhPlanCopyBtn">复制文本清单/.test(dd) &&
    /id="dhExpPaneImage" style="display:none"/.test(dd));
  check('A4 动作链路：toBlob 出图 + 文件名口径 + ClipboardItem 复制 + 降级下载 toast + 埋点 {skin} + 404 优雅降级',
    /canvas\.toBlob\(blob => resolve\(blob\), 'image\/png'\)/.test(dd) &&
    /a\.download = `\$\{name\}-魔兽管家\.png`/.test(dd) &&
    /new ClipboardItem\(\{ 'image\/png': blob \}\)/.test(dd) &&
    /剪贴板不可用，已降级为下载 PNG/.test(dd) &&
    (dd.match(/WBTrack\.event\('decor_plan_export_image', \{ skin: exportSkin \}\)/g) || []).length === 2 &&
    /本次导出降级为无水印出图/.test(dd));
  check('A5 三枚水印素材在场（RGBA PNG）',
    ['wm-wb-shield.png', 'wm-alliance.png', 'wm-horde.png'].every(f => {
      const p = path.join(ROOT, 'assets/decor-brand', f);
      return fs.existsSync(p) && fs.readFileSync(p).readUInt32BE(16) > 0;
    }));
  check('A6 css：tab 壳/图片双栏/768 堆叠/弹窗加宽 760/reduced-motion',
    /\.dh-exp-tabs \{/.test(css) && /\.dh-exp-tab\.active \{/.test(css) &&
    /\.dh-exp-image-body \{ display: flex;/.test(css) &&
    /\.dh-plan-export \{ width: min\(760px/.test(css) &&
    /@media \(max-width: 768px\) \{[\s\S]*?\.dh-exp-image-body \{ flex-direction: column; \}/.test(css));
  const countStr = (s, v) => (s.match(new RegExp(v.replace(/\./g, '\\.'), 'g')) || []).length;
  check(`A7 版本串 ${VER}（index×15/decor×6）+ 旧串（${VER_PREV}）零残留`,
    countStr(index, VER) === 15 && countStr(decor, VER) === 6 &&
    countStr(index, VER_PREV) === 0 && countStr(decor, VER_PREV) === 0);
  const diffNames = spawnSync('git', ['diff', '--name-only'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
  check('A8 红线零改动：track.js/server.js/data.html/dataPublic.js/decorDict.js/sql（白名单属 WP2-3）',
    !diffNames.some(f => ['js/track.js', 'server.js', 'data.html', 'js/dataPublic.js', 'js/decorDict.js'].includes(f)) &&
    !diffNames.some(f => f.startsWith('sql/')),
    `diff 清单=${diffNames.join(',')}`);
  for (const f of ['js/decorData.js', 'scripts/verify-task58-wp2-2.js']) {
    const r = spawnSync(process.execPath, ['--check', f], { cwd: ROOT, encoding: 'utf8' });
    check('A9 node --check ' + f, r.status === 0, r.status === 0 ? '' : r.stderr.trim().split('\n')[0]);
  }
  const t = spawnSync(process.execPath, ['--test', 'test/server-security.test.js'], { cwd: ROOT, encoding: 'utf8' });
  check('A10 node --test server-security 回归', t.status === 0, (t.stdout.match(/# pass \d+|ℹ pass \d+/) || [''])[0]);
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
    const c = await svcRest('POST', '/auth/v1/admin/users', { email: EMAIL, password: PWD, email_confirm: true, user_metadata: { display_name: 't58-wp22' } });
    testUid = c.body && c.body.id;
  }
  check('B-前置 测试账号就位', !!testUid);
  if (!testUid) return;
  await svcRest('DELETE', `/rest/v1/decor_plans?user_id=eq.${testUid}`);
  const g = await svcRest('POST', '/rest/v1/guilds', { name: GUILD_NAME, owner_id: testUid, invite_code: 'T58WP22B', server_name: '测试', server_region: '一区' });
  guildId = g.body && g.body[0] && g.body[0].id;
  await svcRest('POST', '/rest/v1/guild_members', [{ guild_id: guildId, user_id: testUid, role: 'owner', display_name: 't58-wp22' }]);

  await startServer();
  console.log('--- 服务器已起（端口 ' + PORT + '） ---');
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

  // 图鉴加 2 件（一件 ×2）
  await pg.click('.nav-item[data-page="decor"]');
  await pg.waitForSelector('.dh-grid .dh-card', { timeout: 30000 });
  await pg.locator('.dh-card-add').nth(0).click();
  await pg.locator('.dh-card-add').nth(1).click();
  await pg.locator('.dh-card-add').nth(1).click();
  await sleep(400);

  // ========== B1：tab 壳 + 文字模式不回归 ==========
  await pg.click('#dhPlanToggle');
  await pg.waitForSelector('.dh-plan-drawer.open', { timeout: 5000 });
  await pg.click('#dhPlanExport');
  await pg.waitForSelector('#dhPlanExportText', { timeout: 5000 });
  const tabState = await pg.evaluate(() => ({
    tabs: [...document.querySelectorAll('.dh-exp-tab')].map(t => t.textContent.trim()),
    textActive: document.getElementById('dhExpTabText').classList.contains('active'),
    imageActive: document.getElementById('dhExpTabImage').classList.contains('active'),
    paneTextVisible: document.getElementById('dhExpPaneText').style.display !== 'none',
    paneImageHidden: document.getElementById('dhExpPaneImage').style.display === 'none',
  }));
  const textVal = await pg.locator('#dhPlanExportText').inputValue();
  check('B1 tab 壳：双 tab「文字预览/生成图片」+ 默认聚焦文字预览 + 文字内容 WP1 格式不回归',
    JSON.stringify(tabState.tabs) === JSON.stringify(['文字预览', '生成图片']) &&
    tabState.textActive && !tabState.imageActive && tabState.paneTextVisible && tabState.paneImageHidden &&
    textVal.startsWith('【魔兽管家 · 家宅方案单】') && /合计 3 件 · 容量 \d+/.test(textVal),
    JSON.stringify(tabState));

  // ========== B2：图片 tab（画布 900 宽 + 三 radio 默认金边） ==========
  await pg.click('#dhExpTabImage');
  await pg.waitForSelector('#dhExpCanvas', { state: 'visible', timeout: 5000 });
  await sleep(600); // 水印异步加载落定
  const imgState = await pg.evaluate(() => ({
    canvasW: document.getElementById('dhExpCanvas').width,
    canvasH: document.getElementById('dhExpCanvas').height,
    radios: [...document.querySelectorAll('input[name="dhExpSkin"]')].map(r => r.value),
    goldChecked: document.querySelector('input[name="dhExpSkin"][value="gold"]').checked,
  }));
  check('B2 图片 tab：画布宽=900（≥900 硬规格）+ 三皮肤 radio + 默认管家金边选中',
    imgState.canvasW === 900 && imgState.canvasH > 100 &&
    JSON.stringify(imgState.radios) === JSON.stringify(['gold', 'alliance', 'horde']) && imgState.goldChecked,
    JSON.stringify(imgState));

  // ========== B3：切皮肤预览即时重绘（三态 dataURL 互异） ==========
  const snap = async () => pg.evaluate(() => document.getElementById('dhExpCanvas').toDataURL().slice(-2000));
  const urlGold = await snap();
  await pg.check('input[name="dhExpSkin"][value="alliance"]');
  await sleep(400);
  const urlAlliance = await snap();
  await pg.check('input[name="dhExpSkin"][value="horde"]');
  await sleep(400);
  const urlHorde = await snap();
  check('B3 切皮肤预览即时重绘（金/蓝/红三态画面互异）',
    urlGold !== urlAlliance && urlAlliance !== urlHorde && urlGold !== urlHorde);

  // ========== B4 像素复核（边框肤色 / 水印区在场 / 卡高随内容） ==========
  const pix = await pg.evaluate(() => {
    const c = document.getElementById('dhExpCanvas');
    const ctx = c.getContext('2d');
    const px = (x, y) => [...ctx.getImageData(x, y, 1, 1).data];
    // 边框：左缘中点（3px 描边内）
    const border = px(2, Math.floor(c.height / 2));
    // 水印区：右下 16px 内缩 150 宽区域抽样均值（与纯底 #0F1115 比对）
    let diff = 0;
    for (let x = c.width - 16 - 150 + 8; x < c.width - 24; x += 12) {
      for (let y = c.height - 16 - 140; y < c.height - 24; y += 12) {
        const [r, g, b] = px(x, y);
        if (Math.abs(r - 0x0F) + Math.abs(g - 0x11) + Math.abs(b - 0x15) > 12) diff++;
      }
    }
    return { border, wmDiffSamples: diff, h: c.height };
  });
  check('B4 像素复核：边框=部落战红 #B03A2E（±4）+ 右下水印区存在非底色素（18% 透明叠底可辨）',
    Math.abs(pix.border[0] - 0xB0) <= 4 && Math.abs(pix.border[1] - 0x3A) <= 4 && Math.abs(pix.border[2] - 0x2E) <= 4 &&
    pix.wmDiffSamples > 10,
    `边框=rgb(${pix.border.slice(0, 3).join(',')}) 水印区异色素样本=${pix.wmDiffSamples}`);

  // ========== B5：三皮肤导出 PNG 原件（下载捕获 → 物料区，顾问 PIL 复核用） ==========
  const skins = ['gold', 'alliance', 'horde'];
  const pngs = {};
  for (const skin of skins) {
    await pg.check(`input[name="dhExpSkin"][value="${skin}"]`);
    await sleep(400);
    const [dl] = await Promise.all([
      pg.waitForEvent('download', { timeout: 10000 }),
      pg.click('#dhExpSaveImg'),
    ]);
    const file = path.join(OUT, `export-${skin}.png`);
    await dl.saveAs(file);
    pngs[skin] = { file, dims: pngDims(file), name: dl.suggestedFilename() };
  }
  check('B5 三皮肤导出 PNG：宽 ≥900 + 文件名「{方案名}-魔兽管家.png」+ 原件落物料区',
    skins.every(s => pngs[s].dims.w >= 900) && skins.every(s => pngs[s].name.endsWith('-魔兽管家.png')),
    skins.map(s => `${s}=${pngs[s].dims.w}×${pngs[s].dims.h}`).join(' '));

  // ========== B6/B7：复制图片成功 / 降级两路径 ==========
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await pg.evaluate(() => { const t = document.getElementById('dhPlanToast'); if (t) t.textContent = ''; });
  await pg.click('#dhExpCopyImg');
  await pg.waitForFunction(() => {
    const t = document.querySelector('#dhPlanToast');
    return t && t.classList.contains('show') && t.textContent.includes('图片已复制');
  }, { timeout: 8000 }).catch(() => null);
  const copyToast = await pg.locator('#dhPlanToast').textContent().catch(() => '');
  const copyOk = copyToast.includes('图片已复制到剪贴板');
  // 降级路径：覆写 clipboard.write 抛错 → 自动下载 + toast 说明
  await pg.evaluate(() => { navigator.clipboard.write = () => Promise.reject(new Error('denied')); });
  const [dl2] = await Promise.all([
    pg.waitForEvent('download', { timeout: 10000 }),
    pg.click('#dhExpCopyImg'),
  ]);
  await sleep(400);
  const fbToast = await pg.locator('#dhPlanToast').textContent().catch(() => '');
  check('B6/B7 复制图片：成功路径 toast「已复制」/ 降级路径自动下载 PNG + toast 说明',
    copyOk && dl2.suggestedFilename().endsWith('-魔兽管家.png') && fbToast.includes('已降级为下载 PNG'),
    `成功=「${copyToast.trim()}」 降级=「${fbToast.trim()}」`);
  await pg.click('.dh-plan-export-overlay .dh-modal-close');
  await sleep(400);

  // ========== B8：水印 404 优雅降级（阻断素材请求 → 出图不阻断 + console 告警） ==========
  const pg8 = await ctx.newPage();
  const wmWarns = [];
  pg8.on('console', m => { if (m.type() === 'warning' && m.text().includes('水印素材缺失')) wmWarns.push(m.text()); });
  await pg8.route('**/assets/decor-brand/wm-*.png', r => r.abort());
  await pg8.goto(`${BASE}/decor.html`, { waitUntil: 'load' });
  await pg8.waitForSelector('.dh-grid .dh-card', { timeout: 30000 });
  await pg8.locator('.dh-card-add').first().click();
  await sleep(300);
  await pg8.click('#dhPlanToggle');
  await pg8.waitForSelector('.dh-plan-drawer.open', { timeout: 5000 });
  await pg8.click('#dhPlanExport');
  await pg8.waitForSelector('#dhExpTabImage', { timeout: 5000 });
  await pg8.click('#dhExpTabImage');
  await sleep(600);
  const [dl3] = await Promise.all([
    pg8.waitForEvent('download', { timeout: 10000 }),
    pg8.click('#dhExpSaveImg'),
  ]);
  const file3 = path.join(OUT, 'export-nowm-degrade.png');
  await dl3.saveAs(file3);
  check('B8 水印 404：console 告警 + 无水印出图不阻断（PNG 正常导出）',
    wmWarns.length > 0 && pngDims(file3).w >= 900, `告警=${wmWarns.length} 条`);
  await pg8.unroute('**/assets/decor-brand/wm-*.png');
  await pg8.close();

  // ========== B9：无清单导出（空方案出图 + PNG + 卡高小于有清单） ==========
  const pg9 = await ctx.newPage();
  await pg9.goto(`${BASE}/decor.html`, { waitUntil: 'load' });
  await pg9.waitForSelector('.dh-grid .dh-card', { timeout: 30000 });
  await pg9.evaluate(() => localStorage.removeItem('wb_decor_plan_draft')); // 清同 ctx 残留草稿，确保真空方案
  await pg9.reload({ waitUntil: 'load' });
  await pg9.waitForSelector('.dh-grid .dh-card', { timeout: 30000 });
  await pg9.click('#dhPlanToggle');
  await pg9.waitForSelector('.dh-plan-drawer.open', { timeout: 5000 });
  await pg9.click('#dhPlanExport');
  await pg9.waitForSelector('#dhExpTabImage', { timeout: 5000 });
  await pg9.click('#dhExpTabImage');
  await sleep(600);
  const emptyH = await pg9.evaluate(() => document.getElementById('dhExpCanvas').height);
  const [dl4] = await Promise.all([
    pg9.waitForEvent('download', { timeout: 10000 }),
    pg9.click('#dhExpSaveImg'),
  ]);
  const file4 = path.join(OUT, 'export-empty.png');
  await dl4.saveAs(file4);
  check('B9 无清单导出：空方案出图（卡高自然最小高 < 有清单）+ PNG 正常',
    emptyH > 60 && emptyH < pix.h && pngDims(file4).w >= 900,
    `空卡高=${emptyH} 有清单卡高=${pix.h}`);
  await pg9.close();

  // ========== B10：零 JS 报错零意外 4xx（主流程页） ==========
  const NET_409 = /^http409 POST https:\/\/[^/]+\/rest\/v1\/user_profiles$/;
  const badReal = badNet.filter(e => !NET_409.test(e));
  let echoBudget = badNet.length - badReal.length;
  const errsReal = errs.filter(e => {
    if (echoBudget > 0 && e === 'console: Failed to load resource: the server responded with a status of 409 ()') { echoBudget--; return false; }
    return true;
  });
  check('B10 全程零 JS 报错零意外 4xx', badReal.length === 0 && errsReal.length === 0,
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
  console.log('===== B 浏览器实测（tab 壳 + 三皮肤 + 水印硬规格 + 双路径复制 + 降级） =====');
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
