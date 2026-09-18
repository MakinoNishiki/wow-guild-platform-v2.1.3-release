// 任务书 #51 WP2 验证：家宅图鉴公示页双壳（decor.html 免登录版，REQ-137 一期）
// 命名理由：任务书编号仍为 #51（WP2 子包），顺延 WP1 的 verify-task51.js 命名并加 -wp2 后缀区分；
//           不命名 verify-task52.js——#52 是导航分组重构另一任务书，避免占位混淆。
// 核心路径：无痕（未登录）直开 decor.html——三态齐全、2062 计数对库、基准六件详情、筛选/翻页、
//           双向互链、768px 窄屏；A 组静态断言锁双壳同源（decor.html 零数据逻辑内嵌、data.html 零越界改动）。
// 零写入声明：全程只读（anon REST 对照计数），不建测试用户/公会/数据。用法: node scripts/verify-task51-wp2.js
// 截图输出 backup/2026-09-18-task51-wp2/
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-09-18-task51-wp2');
const PORT = 15651;
const BASE = `http://127.0.0.1:${PORT}`;
const VER = '20260918.65';

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const ANON = env.SUPABASE_ANON_KEY;
const ANON_H = { apikey: ANON, Authorization: `Bearer ${ANON}` };

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail !== undefined ? `（${detail}）` : ''}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// anon 只读对照（Prefer: count=exact 拿全量计数，零写入）
async function anonCount(restQuery) {
  const res = await fetch(`${SB}/rest/v1/decor_catalog?select=record_id&${restQuery}`, {
    headers: { ...ANON_H, Prefer: 'count=exact', Range: '0-0' },
  });
  const cr = res.headers.get('content-range') || '';
  return parseInt(cr.split('/')[1], 10);
}
async function anonGet(restQuery) {
  const res = await fetch(`${SB}/rest/v1/decor_catalog?${restQuery}`, { headers: ANON_H });
  if (!res.ok) throw new Error(`anon 对照读取失败 HTTP ${res.status}`);
  return res.json();
}

let serverProc = null;
async function startServer() {
  serverProc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) return; } catch { /* 未起 */ }
    await sleep(200);
  }
  throw new Error('server.js 启动超时');
}

// ---- A 组：静态/同源断言 ----
function staticAsserts() {
  const decor = fs.readFileSync(path.join(ROOT, 'decor.html'), 'utf8');
  const data = fs.readFileSync(path.join(ROOT, 'data.html'), 'utf8');
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const decorData = fs.readFileSync(path.join(ROOT, 'js', 'decorData.js'), 'utf8');

  check('A1 decor.html body 带 data-decor-body（自动挂载钩子）', /<body class="data-decor-body">/.test(decor));
  const scriptSrcs = [...decor.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
  check('A2 decor.html 仅两个外联脚本 = decorDict.js + decorData.js',
    scriptSrcs.length === 2 && scriptSrcs[0].startsWith('js/decorDict.js') && scriptSrcs[1].startsWith('js/decorData.js'), scriptSrcs.join(', '));
  check('A3 decor.html 零内联脚本（无 <script> 无 src 块 / 无事件属性）',
    !/<script(?![^>]*\bsrc=)[^>]*>/i.test(decor) && !/\son(click|input|load|error|keydown)=/i.test(decor));
  const cssHrefs = [...decor.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1]);
  check('A4 decor.html 样式仅 main.css（暗色基底）+ decor-public.css',
    cssHrefs.length === 2 && cssHrefs[0].startsWith('css/main.css') && cssHrefs[1].startsWith('css/decor-public.css'), cssHrefs.join(', '));
  check('A5 decor.html 零数据逻辑/常量内嵌（无 fetch/表名/词表键/渲染函数）',
    !/fetch\(|decor_catalog|CURRENCY_NAMES|ITEM_NAMES|SUBCATEGORY_NAMES|window\.DecorDict\s*=|function\s+(loadData|render|sourceText|priceText)/.test(decor));
  check('A6 decor.html 版本串全为 ' + VER + '（注释+4 处引用）',
    (decor.match(/20260918\.65/g) || []).length === 5 && !/\?v=(?!20260918\.65)/.test(decor));
  check('A7 decor.html 头部互链指向 data.html', /<a[^>]+href="data\.html"[^>]*>副本掉落公示<\/a>/.test(decor));
  check('A8 骨架双壳零差异（#dhFilterBar + #dhMain + dh-loading 初始态）',
    /id="dhFilterBar"/.test(decor) && /id="dhMain"/.test(decor) && /<div class="dh-loading">数据加载中…<\/div>/.test(decor));

  check('B1 data.html 顶部互链指向 decor.html（有且仅有一处）',
    (data.match(/href="decor\.html"/g) || []).length === 1);
  check('B2 data.html 版本串同步递增为 ' + VER + '（7 处，无旧串残留）',
    (data.match(/20260918\.65/g) || []).length === 7 && !/20260816\.64/.test(data));
  check('B3 data.html 零 decor 三件套引用（不交叉加载，仅互链）',
    !/decorData\.js|decorDict\.js|decor-public\.css/.test(data));
  check('B4 data.html 除互链+版本串外零触碰（git diff 行数锁）', (() => {
    const d = spawnSync('git', ['diff', '--unified=0', '--', 'data.html'], { cwd: ROOT, encoding: 'utf8' });
    const changed = d.stdout.split('\n').filter(l => /^[+-]/.test(l) && !/^[+-]{3}/.test(l));
    return changed.every(l => /20260918\.65|20260816\.64|decor\.html|互链|家宅图鉴公示|dp-season|label for="dpSeasonSelect"/.test(l));
  })());

  check('C1 server.js 静态白名单放行 decor.html', /PUBLIC_STATIC_FILES[\s\S]*?decor\.html/.test(server));
  check('C2 decorData.js 自动挂载钩子在库（data-decor-body → mount(document)）',
    /classList\.contains\('data-decor-body'\)\)\s*window\.DecorCatalog\.mount\(document\)/.test(decorData));

  for (const f of ['js/decorDict.js', 'js/decorData.js', 'server.js', 'scripts/verify-task51-wp2.js']) {
    const r = spawnSync(process.execPath, ['--check', f], { cwd: ROOT, encoding: 'utf8' });
    check('C3 node --check ' + f, r.status === 0, r.status === 0 ? '' : r.stderr.trim().split('\n')[0]);
  }
  const t = spawnSync(process.execPath, ['--test', 'test/server-security.test.js'], { cwd: ROOT, encoding: 'utf8' });
  check('C4 node --test server-security（含 decor.html 放行断言）', t.status === 0, (t.stdout.match(/# pass \d+/) || [''])[0]);
}

// ---- 基准六件期望（任务书口径，与 WP1 目验一致）----
const SIX = [
  { rid: 28350, must: ['商城购买', '商人：世界商人', '500 金'] },
  { rid: 27973, must: ['20 × 社区礼券'], mustCount: { '20 × 社区礼券': 2 } },
  { rid: 27043, must: ['掉落：乌拉特克（烈毒之渊）'] },
  { rid: 675, must: ['2000 × 职业大厅资源 + 1000 金', '织梦者 - 崇拜'] },
  { rid: 25546, must: [], rawFallback: true }, // sources=[] 原文兜底
  { rid: 8176, must: ['任务：密报：突击索克雷萨高地（影月谷）'] },
];

async function browserAsserts() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const badResponses = [];
  // 无痕上下文（零 storage = 未登录）
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'zh-CN' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`); });

  // D1 三态之加载中：DOM 就绪即见加载态（数据未回前）
  await page.goto(`${BASE}/decor.html`, { waitUntil: 'domcontentloaded' });
  check('D1 无痕免登录可开 decor.html + 加载中态先见', await page.locator('.dh-loading').count() === 1);
  await page.waitForSelector('.dh-grid .dh-card', { timeout: 30000 });

  // D2 全量计数对库
  const dbTotal = await anonCount('');
  const dbDecor = await anonCount('entry_type=eq.1');
  const dbRooms = await anonCount('entry_type=eq.2');
  const countText = await page.locator('#dhCount').textContent();
  check('D2 全量计数 = 库内 2062（装饰 2023 + 房间 39）',
    dbTotal === 2062 && dbDecor === 2023 && dbRooms === 39 && countText.includes(`共 ${dbTotal} 件`),
    `页面=${countText.trim()} 库=${dbTotal}/${dbDecor}/${dbRooms}`);
  const cards = await page.locator('.dh-grid .dh-card').count();
  const pagerText = await page.locator('.dh-pager-info').last().textContent();
  check('D3 首页 60 卡 + 分页「第 1/35 页 · 共 2062 件」',
    cards === 60 && pagerText.includes('第 1/35 页') && pagerText.includes(`共 ${dbTotal} 件`), `${cards} 卡, ${pagerText.trim()}`);

  // D4 首页占位图 = 库内前 60 件缺图标数
  const first60 = await anonGet('select=record_id,icon_file_id&order=record_id.asc&limit=60');
  const expectPh = first60.filter(r => r.icon_file_id == null).length;
  const actualPh = await page.locator('.dh-grid .dh-card img').evaluateAll(
    imgs => imgs.filter(i => i.src.endsWith('_placeholder.png')).length);
  check('D4 首页占位图计数 = 库内前 60 件缺图标数', actualPh === expectPh, `页面=${actualPh} 库=${expectPh}`);

  // D5 基准六件详情（搜索名称→点卡→断言来源区）
  for (const item of SIX) {
    const [row] = await anonGet(`select=record_id,name,source_text,sources&record_id=eq.${item.rid}`);
    const nameInput = page.locator('#dhSearch');
    await nameInput.fill(row.name);
    await page.waitForSelector(`.dh-card[data-rid="${item.rid}"]`, { timeout: 10000 });
    const hitText = await page.locator('#dhCount').textContent();
    await page.locator(`.dh-card[data-rid="${item.rid}"]`).click();
    await page.waitForSelector('.dh-modal-overlay.show', { timeout: 5000 });
    const srcText = await page.locator('.dh-src-list').innerText();
    let ok = item.must.every(f => srcText.includes(f)) && hitText.includes('命中');
    let detail = srcText.replace(/\n/g, ' ｜ ').slice(0, 120);
    if (item.mustCount) {
      for (const [frag, n] of Object.entries(item.mustCount)) {
        const cnt = srcText.split(frag).length - 1;
        ok = ok && cnt === n;
        detail += `（「${frag}」×${cnt}）`;
      }
    }
    if (item.rawFallback) {
      // 原文兜底：sources 空 + 渲染 .dh-src-raw 且为 source_text 剥离后原文（非「来源未知」）
      const stripped = String(row.source_text || '')
        .replace(/\|c[0-9A-Fa-f]{8}/g, '').replace(/\|r/g, '').replace(/\|n/g, '\n')
        .replace(/\|T[^|]*\|t/g, '').replace(/\|H[^|]*\|h/g, '').replace(/\|h/g, '')
        .replace(/[^\S\n]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
      const firstLine = stripped.split('\n').filter(Boolean)[0] || '';
      const rawShown = await page.locator('.dh-src-raw').innerText();
      ok = ok && (!Array.isArray(row.sources) || !row.sources.length) && firstLine.length > 0 && rawShown.includes(firstLine) && !rawShown.includes('来源未知');
      detail = `原文首行=「${firstLine}」`;
    }
    check(`D5 基准件 ${item.rid}「${row.name}」详情`, ok, detail);
    await page.locator('.dh-modal-close').click();
    await page.waitForSelector('.dh-modal-overlay', { state: 'detached', timeout: 5000 });
    await nameInput.fill('');
    await page.waitForSelector('.dh-grid .dh-card');
  }

  // D6 筛选抽验：房间/户型 39 + 可放宠物 11（计数=库内 REST 同语义对照）
  const petCount = await anonCount('subcategory_ids=cs.' + encodeURIComponent('[53]'));
  const featChips = page.locator('#dhFeatChips .dh-chip');
  await featChips.nth(1).click();
  let hit = await page.locator('#dhCount').textContent();
  check('D6a 筛选「房间/户型」命中 = 库内 39', hit.includes(`命中 ${dbRooms} 件`), hit.trim());
  await featChips.nth(1).click();
  await featChips.nth(0).click();
  hit = await page.locator('#dhCount').textContent();
  check('D6b 筛选「可放宠物」命中 = 库内 ' + petCount, petCount === 11 && hit.includes(`命中 ${petCount} 件`), hit.trim());
  await page.locator('#dhResetFilters').click();
  hit = await page.locator('#dhCount').textContent();
  check('D6c 重置筛选还原全量', hit.includes(`共 ${dbTotal} 件`), hit.trim());

  // D7 翻页：第 2 页首卡 = 库内第 61 件
  const [row61] = await anonGet('select=record_id&order=record_id.asc&offset=60&limit=1');
  await page.locator('.dh-pager button:text-is("2")').click();
  await page.waitForFunction(() => [...document.querySelectorAll('.dh-pager-info')].some(el => el.textContent.includes('第 2/35 页')));
  const firstRid = await page.locator('.dh-grid .dh-card').first().getAttribute('data-rid');
  check('D7 翻页第 2 页首卡 = 库内第 61 件', +firstRid === row61.record_id, `页面 rid=${firstRid} 库 rid=${row61.record_id}`);

  // D8 空态：无命中 → 提示 + 重置引导还原
  await page.locator('#dhSearch').fill('绝不存在的装饰xyz123');
  await page.waitForSelector('.dh-empty');
  const emptyOk = (await page.locator('.dh-empty-title').textContent()).includes('没有符合条件的装饰');
  await page.locator('#dhEmptyReset').click();
  await page.waitForSelector('.dh-grid .dh-card');
  const restored = await page.locator('#dhCount').textContent();
  check('D8 空结果态 + 空态重置还原', emptyOk && restored.includes(`共 ${dbTotal} 件`));

  // D9 失败重试态：拦截 decor_catalog 请求 → 错误态 → 放行 → 重试成功
  const ctx2 = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page2 = await ctx2.newPage();
  await page2.route('**/rest/v1/decor_catalog*', r => r.abort());
  await page2.goto(`${BASE}/decor.html`, { waitUntil: 'domcontentloaded' });
  await page2.waitForSelector('.dh-error #dhRetry', { timeout: 15000 });
  const errText = await page2.locator('.dh-error-text').textContent();
  await page2.unroute('**/rest/v1/decor_catalog*');
  await page2.locator('#dhRetry').click();
  await page2.waitForSelector('.dh-grid .dh-card', { timeout: 30000 });
  const retryCount = await page2.locator('#dhCount').textContent();
  check('D9 失败态（拦截请求→错误文案+重试钮）→ 重试恢复', errText.length > 0 && retryCount.includes(`共 ${dbTotal} 件`), errText.trim());
  await ctx2.close();

  // D10 双向互链真点击：decor → data → decor
  await page.locator('.dh-nav-link').click();
  await page.waitForLoadState('domcontentloaded');
  const onData = page.url().endsWith('/data.html') && (await page.title()).includes('副本掉落');
  const backLink = page.locator('a[href="decor.html"]');
  const backVisible = await backLink.count() === 1 && await backLink.isVisible();
  await backLink.click();
  await page.waitForLoadState('domcontentloaded');
  const backOnDecor = page.url().endsWith('/decor.html') && (await page.title()).includes('家宅图鉴');
  check('D10 双向互链（decor→data 落地 + data 链接可见 + data→decor 回跳）', onData && backVisible && backOnDecor);
  await page.waitForSelector('.dh-grid .dh-card', { timeout: 30000 });

  // D11 桌面截图（网格+筛选栏+页头互链）
  await page.screenshot({ path: path.join(SHOT_DIR, '01-desktop-grid.png'), fullPage: false });
  await page.locator('#dhSearch').fill((await anonGet('select=name&record_id=eq.28350'))[0].name);
  await page.waitForSelector('.dh-card[data-rid="28350"]');
  await page.locator('.dh-card[data-rid="28350"]').click();
  await page.waitForSelector('.dh-modal-overlay.show');
  await sleep(300); // 弹窗 0.2s 淡入收尾后再截，免半透明帧
  await page.screenshot({ path: path.join(SHOT_DIR, '02-desktop-modal-28350.png') });
  await page.locator('.dh-modal-close').click();
  await page.locator('#dhSearch').fill('');

  // D12 768px 窄屏：筛选折叠↔展开、网格降列（minmax 150→104 + 图标 72→56 媒体查询收小）、两态截图
  await page.setViewportSize({ width: 768, height: 900 });
  await page.waitForSelector('.dh-grid .dh-card');
  const rowsHidden = await page.locator('#dhFilterRows').isHidden();
  const toggleVisible = await page.locator('#dhFilterToggle').isVisible();
  const narrowIcon = await page.locator('.dh-icon-wrap').first().evaluate(el => getComputedStyle(el).width);
  const narrowMin = await page.locator('.dh-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns);
  await page.screenshot({ path: path.join(SHOT_DIR, '03-mobile-768-collapsed.png') });
  await page.locator('#dhFilterToggle').click();
  const rowsShown = await page.locator('#dhFilterRows').isVisible();
  await page.screenshot({ path: path.join(SHOT_DIR, '04-mobile-768-expanded.png') });
  await page.setViewportSize({ width: 1366, height: 900 });
  const deskIcon = await page.locator('.dh-icon-wrap').first().evaluate(el => getComputedStyle(el).width);
  const deskMin = await page.locator('.dh-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns);
  const narrowColW = parseFloat(narrowMin.split(' ')[0]), deskColW = parseFloat(deskMin.split(' ')[0]);
  check('D12 768px 窄屏：筛选栏折叠↔展开 + 网格降列（列宽/图标收小）',
    rowsHidden && toggleVisible && rowsShown && narrowIcon === '56px' && deskIcon === '72px' && narrowColW < deskColW,
    `图标 768=${narrowIcon} 桌面=${deskIcon}；列宽 768=${narrowColW}px 桌面=${deskColW}px`);

  // D13 全程零 JS 报错、零 ≥400 响应（anon 只读通道）
  check('D13 全程零 JS 报错', errors.length === 0, errors.slice(0, 2).join(' ｜ '));
  check('D14 全程零 ≥400 响应', badResponses.length === 0, badResponses.slice(0, 2).join(' ｜ '));

  await ctx.close();
  await browser.close();
}

(async () => {
  try {
    staticAsserts();
    await startServer();
    await browserAsserts();
  } catch (e) {
    check('运行异常', false, e.message);
  } finally {
    if (serverProc) serverProc.kill();
  }
  const pass = results.filter(r => r.ok).length;
  console.log(`\n${pass}/${results.length} 通过`);
  process.exit(pass === results.length ? 0 : 1);
})();
