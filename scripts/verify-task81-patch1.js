// 任务书 #81-Patch1 验证：图标微白边框 + meta 多 tab 自动换行
// A 静态锚点 + B 浏览器实测（自起 server :15678，无痕游客 #/team/lootdrop）：
//   B1 computed：图标 border 1px rgba(255,255,255,0.15) + box-shadow 非 none；
//   B2 .dp-item-meta flex-wrap = wrap（多 tab 自动换行）；
//   B3 多 tag 样本（觉醒恐牙胸甲，4 tag）：所有 tag 右缘 ≤ 图标左缘（不挤压不截断）；
//   B4 卡片无横向溢出 + 图标加载成功；
//   B5 全程零 TypeError / console 零报错。
// 用法: node scripts/verify-task81-patch1.js
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 15678;
const BASE = `http://127.0.0.1:${PORT}`;
const VER = '20261015.102';

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
  check('A1a .dp-item-icon 微白边框 rgba(255,255,255,0.15) + 微弱阴影',
    /\.dp-item-icon \{[\s\S]*?border: 1px solid rgba\(255, 255, 255, 0\.15\);/.test(css) &&
    /\.dp-item-icon \{[\s\S]*?box-shadow: 0 0 4px rgba\(0, 0, 0, 0\.4\);/.test(css), '');
  check('A1b .dp-item-meta 由 nowrap 改 wrap（gap 维持 4px）',
    /\.dp-item-meta \{ display: flex; flex-wrap: wrap; overflow: hidden; gap: 4px; padding-right: 56px; \}/.test(css) &&
    !/\.dp-item-meta \{ display: flex; flex-wrap: nowrap;/.test(css), '');

  const cnt = (f, s) => (read(f).match(new RegExp(s.replace(/\./g, '\\.'), 'g')) || []).length;
  check('A2a 版本串 ' + VER + ' 三壳递增（index 15 / data 8 / decor 5）',
    cnt('index.html', VER) === 15 && cnt('data.html', VER) === 8 && cnt('decor.html', VER) === 5,
    `index=${cnt('index.html', VER)} data=${cnt('data.html', VER)} decor=${cnt('decor.html', VER)}`);
  check('A2b 旧串 20261015.101 三壳零残留',
    cnt('index.html', '20261015.101') === 0 && cnt('data.html', '20261015.101') === 0 && cnt('decor.html', '20261015.101') === 0, '');
  check('A3 changelog 补录（v3.2.0-task81-patch1-icon-border-meta）+ 台账 REQ-171',
    read('js/app.js').includes("id: 'v3.2.0-task81-patch1-icon-border-meta'") && /\| REQ-171 \|/.test(read('docs/问题与需求清单.md')), '');

  const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f).concat(['server.js']);
  let allOk = true, bad = '';
  for (const f of jsFiles) {
    const r = spawnSync(process.execPath, ['--check', f], { cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) { allOk = false; bad = f; }
  }
  check('A4 node --check 全量通过（js/ 全部 + server.js）', allOk, bad);
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
  await pg.fill('#page-lootdrop .dp-search, #page-lootdrop #dpSearch, #page-lootdrop input[type="text"]', '觉醒恐牙胸甲');
  await sleep(900);

  const b = await pg.evaluate(() => {
    const card = document.querySelector('#page-lootdrop .dp-item');
    const icon = card.querySelector('.dp-item-icon');
    const meta = card.querySelector('.dp-item-meta');
    const cs = getComputedStyle(icon);
    const ir = icon.getBoundingClientRect();
    const tags = [...meta.querySelectorAll('.dp-tag')].map(t => {
      const r = t.getBoundingClientRect();
      return { text: t.textContent.trim(), right: r.right };
    });
    return {
      borderWidth: cs.borderTopWidth, borderColor: cs.borderTopColor, boxShadow: cs.boxShadow,
      flexWrap: getComputedStyle(meta).flexWrap,
      metaHeight: meta.getBoundingClientRect().height,
      iconLeft: ir.left, iconLoaded: icon.complete && icon.naturalWidth > 0,
      tags,
      cardOverflow: card.scrollWidth > card.clientWidth + 1,
    };
  });
  check('B1 computed：图标 1px 微白边框 + 阴影非 none',
    b.borderWidth === '1px' && b.boxShadow !== 'none',
    `border=${b.borderWidth} color=${b.borderColor} shadow=${b.boxShadow.slice(0, 60)}`);
  check('B2 .dp-item-meta flex-wrap = wrap（多 tab 自动换行）', b.flexWrap === 'wrap',
    `flexWrap=${b.flexWrap} metaHeight=${b.metaHeight}`);
  check('B3 多 tag 样本：所有 tag 右缘 ≤ 图标左缘（不挤压不截断）',
    b.tags.length >= 4 && b.tags.every(t => t.right <= b.iconLeft + 1),
    `tags=${b.tags.map(t => `${t.text}@${Math.round(t.right)}`).join(' | ')} iconLeft=${b.iconLeft}`);
  check('B4 卡片无横向溢出 + 图标加载成功', !b.cardOverflow && b.iconLoaded,
    `overflow=${b.cardOverflow} loaded=${b.iconLoaded}`);

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
