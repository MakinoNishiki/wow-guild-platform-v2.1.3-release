// 任务书 #79 验证：家宅图鉴价格货币名还原 + 图标占位回退（真实病灶修复）
// A 静态锚点 + B 浏览器实测（自起 server :15673，无痕游客 #/house/decor）：
//   B1 货币链接样本（仪式安波里拱门）→ 详情「价格：350 × 要塞物资」；
//   B2 金币样本（“暴风城之傲”雕像）→ 详情「价格：250 金」；
//   B3 双价样本（伊森拉图斯草丛）→ 详情「价格：200 × 要塞物资 + 200 金」；
//   B4 新家具缺图 → _placeholder.png 回退（非裂图）+ 旧家具正常出图；
//   B5 全程零 TypeError / console 零报错。
// 用法: node scripts/verify-task79.js
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 15673;
const BASE = `http://127.0.0.1:${PORT}`;
const VER = '20261015.98';

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

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
  const data = read('js/decorData.js');
  const dict = read('js/decorDict.js');
  const app = read('js/app.js');

  check('A1a rawPriceLabel 三形态（货币链接 / 金币 / 双价并存）+ DecorDict 词表单源',
    /function rawPriceLabel\(s\)/.test(data) &&
    /价格：\\\|r\(\\d\+\)\\\|Hcurrency:\(\\d\+\)\\\|h/.test(data) &&
    /UI-GOLDICON/.test(data) && /D\.CURRENCY_NAMES\[cm\[2\]\]/.test(data), '');
  check('A1b renderSourceBlock 价格行替换（g 全局，多商人块同治）',
    /raw\.replace\(\/价格：\[\\d\\s\]\+\/g, `价格：\$\{priceLabel\}`\)/.test(data), '');
  check('A1c 未引入第二份 CURRENCY_MAP（词表单一真源红线）',
    !/CURRENCY_MAP/.test(data) && !/CURRENCY_MAP/.test(dict), '');
  const ids = ['824', '1220', '1560', '1813', '2003', '2803', '3316'];
  check('A2 词表已覆盖新数据全部 6 个货币 ID（824/1220/1560/1813/2003/2803/3316）',
    ids.every(id => new RegExp('\\b' + id + ": '").test(dict)), '');

  const cnt = (f, s) => (read(f).match(new RegExp(s.replace(/\./g, '\\.'), 'g')) || []).length;
  check('A3a 版本串 ' + VER + ' 三壳递增（index 15 / data 8 / decor 5）',
    cnt('index.html', VER) === 15 && cnt('data.html', VER) === 8 && cnt('decor.html', VER) === 5,
    `index=${cnt('index.html', VER)} data=${cnt('data.html', VER)} decor=${cnt('decor.html', VER)}`);
  check('A3b 旧串 20261015.97 三壳零残留',
    cnt('index.html', '20261015.97') === 0 && cnt('data.html', '20261015.97') === 0 && cnt('decor.html', '20261015.97') === 0, '');
  check('A4 changelog 补录（v3.2.0-task79-decor-price-currency）+ 台账 REQ-167',
    app.includes("id: 'v3.2.0-task79-decor-price-currency'") && /\| REQ-167 \|/.test(read('docs/问题与需求清单.md')), '');

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
      if (/assets\/decor-icons\//.test(u)) { whitelist.push(u); return; } // 新增家具缺图标属预期（占位回退）
      errs.push(`http${r.status()} ${r.request().method()} ${u}`);
    }
  });

  await pg.goto(`${BASE}/index.html#/house/decor`, { waitUntil: 'load' });
  await pg.waitForSelector('#page-decor .dh-grid .dh-card', { timeout: 30000 });

  // 逐样本：搜索 → 点卡 → 读详情来源块
  async function priceOf(name) {
    await pg.fill('#page-decor #dhSearch', '');
    await pg.fill('#page-decor #dhSearch', name);
    await sleep(600);
    await pg.waitForSelector('#page-decor .dh-grid .dh-card', { timeout: 10000 });
    await pg.click('#page-decor .dh-grid .dh-card');
    await pg.waitForSelector('.dh-modal-overlay.show .dh-src-item', { timeout: 10000 });
    const text = await pg.evaluate(() =>
      [...document.querySelectorAll('.dh-modal-overlay.show .dh-src-item')].map(d => d.textContent.trim()).join('\n'));
    await pg.evaluate(() => {
      const ov = document.querySelector('.dh-modal-overlay.show');
      const close = ov && ov.querySelector('.dh-modal-close, .modal-close, [class*="close"]');
      if (close) close.click();
    });
    await sleep(300);
    return text;
  }

  const t1 = await priceOf('仪式安波里拱门');
  check('B1 货币链接样本：仪式安波里拱门 → 「价格：350 × 要塞物资」',
    t1.includes('价格：350 × 要塞物资'), t1.split('\n').find(l => l.includes('价格')) || t1.slice(0, 80));

  const t2 = await priceOf('“暴风城之傲”雕像');
  const goldCount = (t2.match(/价格：250 金/g) || []).length;
  check('B2 金币样本：“暴风城之傲”雕像 → 「价格：250 金」×2（两商人块同治）',
    goldCount === 2, `命中=${goldCount}`);

  const t3 = await priceOf('伊森拉图斯草丛');
  check('B3 双价样本：伊森拉图斯草丛 → 「价格：200 × 要塞物资 + 200 金」',
    t3.includes('价格：200 × 要塞物资 + 200 金'), t3.split('\n').find(l => l.includes('价格')) || t3.slice(0, 80));

  // B4 图标：新家具缺图 → 占位回退；旧家具正常出图
  await pg.fill('#page-decor #dhSearch', '');
  await pg.fill('#page-decor #dhSearch', '仪式安波里拱门');
  await sleep(800);
  const b4a = await pg.evaluate(() => {
    const img = document.querySelector('#page-decor .dh-grid .dh-card .dh-icon-wrap img');
    return { src: img ? img.src : '', complete: img ? img.complete && img.naturalWidth > 0 : false };
  });
  check('B4a 新家具缺图标 → _placeholder.png 回退且实际加载成功（非裂图/非问号）',
    b4a.src.includes('_placeholder.png') && b4a.complete, JSON.stringify(b4a));
  await pg.fill('#page-decor #dhSearch', '');
  await sleep(600);
  const b4b = await pg.evaluate(() => {
    const imgs = [...document.querySelectorAll('#page-decor .dh-grid .dh-card .dh-icon-wrap img')];
    const real = imgs.find(i => !i.src.includes('_placeholder'));
    return real ? { src: real.src, complete: real.complete && real.naturalWidth > 0 } : null;
  });
  check('B4b 旧家具图标正常显示（本地 assets/decor-icons 管道）',
    !!b4b && b4b.complete && /assets\/decor-icons\/\d+\.png/.test(b4b.src), JSON.stringify(b4b));

  check('B5a 全程零 TypeError', typeErrors.length === 0, typeErrors.slice(0, 2).join(' | ').slice(0, 300));
  let budget = whitelist.length;
  const real = errs.filter(e => {
    if (budget > 0 && e.startsWith('console: Failed to load resource: the server responded with a status of 4')) { budget--; return false; }
    return true;
  });
  check('B5b 全程 console 零报错（白名单：新增家具缺图标 404 占位回退在案）', real.length === 0, real.slice(0, 3).join(' | ').slice(0, 300));

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
