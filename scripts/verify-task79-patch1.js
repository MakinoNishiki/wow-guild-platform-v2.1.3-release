// 任务书 #79-Patch1 验证：装备图标走 Blizzard CDN + 占位回退（decor 不随改）
// A 静态锚点 + B 浏览器实测（自起 server :15674，无痕游客）：
//   B1 公示页装备卡图标 = render CDN 且真实加载成功（naturalWidth>0）；
//   B2 无本地 /assets/icons/items/ 请求（旧 404 通道消失）；
//   B3 拦截 CDN 全部请求 → onerror 回退 _placeholder.png（非裂图）；
//   B4 decor 旧家具图标仍走本地管道且加载成功（证明未按通知误改 decor）；
//   B5 全程零 TypeError / console 零报错（白名单：拦截模拟故障/新增家具缺图）。
// 用法: node scripts/verify-task79-patch1.js
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 15674;
const BASE = `http://127.0.0.1:${PORT}`;
const VER = '20261015.99';

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `（${detail}）` : ''}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

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

function staticAsserts() {
  console.log('== A. 静态锚点 ==');
  const dp = read('js/dataPublic.js');
  const decor = read('js/decorData.js');
  const app = read('js/app.js');

  check('A1 dataPublic.js 装备图标 = render CDN + onerror 占位回退 + 空值不渲染',
    /src="https:\/\/render\.worldofwarcraft\.com\/icons\/56\/\$\{iconId\}\.jpg"/.test(dp) &&
    /onerror="this\.onerror=null;this\.src='assets\/decor-icons\/_placeholder\.png'"/.test(dp) &&
    /\$\{iconId \? `<img/.test(dp), '');
  check('A2 decor 图标维持本地管道（未按通知误改 CDN；render 字样仅出现在 #79 注释中）',
    /function iconSrc\(r\) \{ return r\.icon_file_id != null \? `assets\/decor-icons\/\$\{r\.icon_file_id\}\.png` : PLACEHOLDER; \}/.test(decor), '');

  const cnt = (f, s) => (read(f).match(new RegExp(s.replace(/\./g, '\\.'), 'g')) || []).length;
  check('A3a 版本串 ' + VER + ' 三壳递增（index 15 / data 8 / decor 5）',
    cnt('index.html', VER) === 15 && cnt('data.html', VER) === 8 && cnt('decor.html', VER) === 5,
    `index=${cnt('index.html', VER)} data=${cnt('data.html', VER)} decor=${cnt('decor.html', VER)}`);
  check('A3b 旧串 20261015.98 三壳零残留',
    cnt('index.html', '20261015.98') === 0 && cnt('data.html', '20261015.98') === 0 && cnt('decor.html', '20261015.98') === 0, '');
  check('A4 changelog 补录（v3.2.0-task79-patch1-item-icon-cdn）+ 台账 REQ-168',
    app.includes("id: 'v3.2.0-task79-patch1-item-icon-cdn'") && /\| REQ-168 \|/.test(read('docs/问题与需求清单.md')), '');

  const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f).concat(['server.js']);
  let allOk = true, bad = '';
  for (const f of jsFiles) {
    const r = spawnSync(process.execPath, ['--check', f], { cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) { allOk = false; bad = f; }
  }
  check('A5 node --check 全量通过（js/ 全部 + server.js）', allOk, bad);
}

async function liveAsserts() {
  console.log('== B. 浏览器实测 ==');
  await startServer();
  console.log('--- 服务器已起（端口 ' + PORT + '） ---');

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const pg = await ctx.newPage();
  const errs = [], typeErrors = [], whitelist = [];
  const localItemReqs = [];
  pg.on('pageerror', e => {
    errs.push('pageerror: ' + e.message);
    if (e instanceof TypeError || /TypeError/.test(String(e && e.name))) typeErrors.push(`${e.message}\n${e.stack || ''}`);
  });
  pg.on('console', m => {
    if (m.type() !== 'error') return;
    errs.push('console: ' + m.text());
    if (/TypeError/.test(m.text())) typeErrors.push('console: ' + m.text());
  });
  pg.on('request', r => { if (/\/assets\/icons\/items\//.test(r.url())) localItemReqs.push(r.url()); });
  pg.on('response', r => {
    if (r.status() >= 400) {
      const u = r.url();
      if (/assets\/decor-icons\//.test(u)) { whitelist.push(u); return; }
      errs.push(`http${r.status()} ${r.request().method()} ${u}`);
    }
  });

  // B1/B2 公示页装备卡 CDN 图标 + 无本地装备图标请求
  await pg.goto(`${BASE}/index.html#/team/lootdrop`, { waitUntil: 'load' });
  await pg.waitForSelector('#page-lootdrop .dp-item .dp-item-icon', { timeout: 30000 });
  await sleep(1500);
  const b1 = await pg.evaluate(() => {
    const imgs = [...document.querySelectorAll('#page-lootdrop .dp-item .dp-item-icon')];
    return imgs.slice(0, 8).map(i => ({ src: i.src, loaded: i.complete && i.naturalWidth > 0 }));
  });
  check('B1 公示页装备卡图标 = render CDN 且真实加载成功（前 8 枚全部 naturalWidth>0）',
    b1.length > 0 && b1.every(i => /render\.worldofwarcraft\.com\/icons\/56\/\d+\.jpg/.test(i.src) && i.loaded),
    b1.slice(0, 2).map(i => `${i.src} loaded=${i.loaded}`).join(' | '));
  check('B2 无本地 /assets/icons/items/ 请求（旧 404 通道消失）',
    localItemReqs.length === 0, `本地装备图标请求=${localItemReqs.length}`);

  // B3 拦截 CDN 全部图标请求 → onerror 回退占位图（强制 reload 触发新请求；同 URL 二次 goto 不刷新页面）
  await pg.route('**/render.worldofwarcraft.com/icons/56/*', route => route.abort());
  await pg.reload({ waitUntil: 'load' });
  await pg.waitForSelector('#page-lootdrop .dp-item .dp-item-icon', { timeout: 30000 });
  // lazy 图标需滚动触发全部请求后再断言（否则未发请求即无 onerror 也无占位）
  await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(2500);
  const b3 = await pg.evaluate(() => {
    const imgs = [...document.querySelectorAll('#page-lootdrop .dp-item .dp-item-icon')];
    const ph = imgs.filter(i => i.src.includes('_placeholder.png'));
    return {
      n: imgs.length,
      placeholders: ph.length,
      phLoaded: ph.filter(i => i.complete && i.naturalWidth > 0).length,
    };
  });
  check('B3 拦截 CDN 全断 → onerror 回退 _placeholder.png 且占位图实际加载成功（lazy 未触发请求的子集不属失败）',
    b3.placeholders > 0 && b3.phLoaded === b3.placeholders, JSON.stringify(b3));
  await pg.unroute('**/render.worldofwarcraft.com/icons/56/*');

  // B4 decor 旧家具图标仍走本地管道且加载成功
  await pg.goto(`${BASE}/index.html#/house/decor`, { waitUntil: 'load' });
  await pg.waitForSelector('#page-decor .dh-grid .dh-card .dh-icon-wrap img', { timeout: 30000 });
  await sleep(1000);
  const b4 = await pg.evaluate(() => {
    const imgs = [...document.querySelectorAll('#page-decor .dh-grid .dh-card .dh-icon-wrap img')];
    const real = imgs.find(i => /assets\/decor-icons\/\d+\.png/.test(i.src));
    return real ? { src: real.src, loaded: real.complete && real.naturalWidth > 0 } : null;
  });
  check('B4 decor 旧家具图标仍走本地 assets/decor-icons 且加载成功（未误改 CDN）',
    !!b4 && b4.loaded, JSON.stringify(b4));

  check('B5a 全程零 TypeError', typeErrors.length === 0, typeErrors.slice(0, 2).join(' | ').slice(0, 300));
  const real = errs.filter(e => {
    // 白名单：新增家具缺图 404、B3 拦截模拟故障产生的 CDN 失败日志
    if (/assets\/decor-icons\//.test(e)) return false;
    if (/render\.worldofwarcraft\.com/.test(e)) return false;
    if (e.includes('Failed to load resource') && !e.includes('401')) return false;
    return true;
  });
  check('B5b 全程 console 零报错（白名单：decor 缺图/B3 拦截模拟故障）', real.length === 0, real.slice(0, 3).join(' | ').slice(0, 300));

  await browser.close();
}

(async () => {
  staticAsserts();
  try {
    await liveAsserts();
  } catch (e) {
    check('B 浏览器实测执行', false, e.message);
  } finally {
    if (serverProc) serverProc.kill();
  }
  const fails = results.filter(r => !r.ok);
  console.log(`\n===== 结果：${results.length - fails.length}/${results.length} 通过 =====`);
  process.exit(fails.length ? 1 : 0);
})();
