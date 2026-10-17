// 任务书 #81 验证：装备卡图标 22px → 48px + 名称/meta 行留白 26→56px（防重叠）
// A 静态锚点 + B 浏览器实测（自起 server :15677，无痕游客 #/team/lootdrop）：
//   B1 computed：图标 width/height = 48px、名称/meta 行 padding-right = 56px；
//   B2 几何：图标左缘 ≥ 名称/meta 内容盒右缘（无重叠）；
//   B3 基希克斯破封 + 大米样本卡图标 = render CDN 且加载成功；
//   B4 布局：卡片无横向溢出（scrollWidth ≤ clientWidth）；
//   B5 全程零 TypeError / console 零报错。
// 用法: node scripts/verify-task81.js
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 15677;
const BASE = `http://127.0.0.1:${PORT}`;
const VER = '20261015.101';

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
  const css = read('css/data-public.css');
  check('A1a .dp-item-icon width/height = 48px',
    /\.dp-item-icon \{[\s\S]*?width: 48px;[\s\S]*?height: 48px;/.test(css), '');
  check('A1b .dp-item-name / .dp-item-meta padding-right = 56px',
    /\.dp-item-name \{[^}]*padding-right: 56px;/.test(css) &&
    /\.dp-item-meta \{[^}]*padding-right: 56px;/.test(css), '');
  check('A1c 原 22px/26px 残留清零',
    !/width: 22px;/.test(css) && !/padding-right: 26px;/.test(css), '');

  const cnt = (f, s) => (read(f).match(new RegExp(s.replace(/\./g, '\\.'), 'g')) || []).length;
  check('A2a 版本串 ' + VER + ' 三壳递增（index 15 / data 8 / decor 5）',
    cnt('index.html', VER) === 15 && cnt('data.html', VER) === 8 && cnt('decor.html', VER) === 5,
    `index=${cnt('index.html', VER)} data=${cnt('data.html', VER)} decor=${cnt('decor.html', VER)}`);
  check('A2b 旧串 20261015.100 三壳零残留',
    cnt('index.html', '20261015.100') === 0 && cnt('data.html', '20261015.100') === 0 && cnt('decor.html', '20261015.100') === 0, '');
  check('A3 changelog 补录（v3.2.0-task81-item-icon-48）+ 台账 REQ-170',
    read('js/app.js').includes("id: 'v3.2.0-task81-item-icon-48'") && /\| REQ-170 \|/.test(read('docs/问题与需求清单.md')), '');
}

async function liveAsserts() {
  console.log('== B. 浏览器实测 ==');
  await startServer();
  console.log('--- 服务器已起（端口 ' + PORT + '） ---');

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'zh-CN' });
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
      if (/assets\/decor-icons\//.test(u)) { whitelist.push(u); return; }
      errs.push(`http${r.status()} ${r.request().method()} ${u}`);
    }
  });

  await pg.goto(`${BASE}/index.html#/team/lootdrop`, { waitUntil: 'load' });
  await pg.waitForSelector('#page-lootdrop .dp-item .dp-item-icon', { timeout: 30000 });
  await sleep(1000);

  const b12 = await pg.evaluate(() => {
    const card = document.querySelector('#page-lootdrop .dp-item');
    const icon = card.querySelector('.dp-item-icon');
    const name = card.querySelector('.dp-item-name');
    const meta = card.querySelector('.dp-item-meta');
    const cs = getComputedStyle(icon);
    const ir = icon.getBoundingClientRect();
    const nr = name.getBoundingClientRect();
    const mr = meta.getBoundingClientRect();
    return {
      w: cs.width, h: cs.height,
      namePR: getComputedStyle(name).paddingRight,
      metaPR: getComputedStyle(meta).paddingRight,
      iconLeft: ir.left, nameRight: nr.right, metaRight: mr.right,
      iconLoaded: icon.complete && icon.naturalWidth > 0,
      cardOverflow: card.scrollWidth > card.clientWidth + 1,
    };
  });
  check('B1a computed：图标 48×48 + 名称/meta padding-right=56px',
    b12.w === '48px' && b12.h === '48px' && b12.namePR === '56px' && b12.metaPR === '56px', JSON.stringify(b12).slice(0, 220));
  check('B1b 几何防重叠：图标左缘 ≥ 名称/meta 内容盒右缘（内容盒 = 边框盒 − padding-right 56px）',
    b12.iconLeft >= (b12.nameRight - 56) - 1 && b12.iconLeft >= (b12.metaRight - 56) - 1,
    `iconLeft=${b12.iconLeft} nameContentRight=${b12.nameRight - 56} metaContentRight=${b12.metaRight - 56}`);
  check('B1c 卡片无横向溢出（scrollWidth ≤ clientWidth）', !b12.cardOverflow, `overflow=${b12.cardOverflow}`);
  check('B1d 图标真实加载成功（naturalWidth>0）', b12.iconLoaded, '');

  // B3 基希克斯破封 + 大米样本卡
  async function iconOf(name) {
    await pg.fill('#page-lootdrop .dp-search, #page-lootdrop #dpSearch, #page-lootdrop input[type="text"]', '');
    await pg.fill('#page-lootdrop .dp-search, #page-lootdrop #dpSearch, #page-lootdrop input[type="text"]', name);
    await sleep(700);
    // CDN 加载需等待（不可定长 sleep 即断言 loaded）
    await pg.waitForFunction(() => {
      const icon = document.querySelector('#page-lootdrop .dp-item .dp-item-icon');
      return icon && icon.complete && icon.naturalWidth > 0;
    }, { timeout: 10000 }).catch(() => {});
    return pg.evaluate(() => {
      const icon = document.querySelector('#page-lootdrop .dp-item .dp-item-icon');
      return icon ? { src: icon.src, loaded: icon.complete && icon.naturalWidth > 0 } : null;
    });
  }
  const kith = await iconOf('露瑟拉玛');
  check('B3a 基希克斯破封样本卡（露瑟拉玛）图标 = render CDN 且加载成功',
    !!kith && /render\.worldofwarcraft\.com\/icons\/56\/\d+\.jpg/.test(kith.src) && kith.loaded, JSON.stringify(kith));
  const dun = await iconOf('抛光的光木引导匕首');
  check('B3b 大米样本卡（抛光的光木引导匕首）图标 = render CDN 且加载成功',
    !!dun && /render\.worldofwarcraft\.com\/icons\/56\/\d+\.jpg/.test(dun.src) && dun.loaded, JSON.stringify(dun));

  check('B5a 全程零 TypeError', typeErrors.length === 0, typeErrors.slice(0, 2).join(' | ').slice(0, 300));
  const real = errs.filter(e => {
    if (/assets\/decor-icons\//.test(e)) return false;
    if (e.includes('Failed to load resource') && !e.includes('401')) return false;
    return true;
  });
  check('B5b 全程 console 零报错（白名单：decor 缺图）', real.length === 0, real.slice(0, 3).join(' | ').slice(0, 300));

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
