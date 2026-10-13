// 任务书 #68 验证：家宅图鉴「种族」单选筛选维度 + 「主题风格」→「资料片分类」文案改名
// A 静态锚点：decorDict.js RACE_TAGS 30 项（eval 实读）+导出、decorData.js 七处挂钩、三处文案改名、
//    expansion/EXPANSION_TAGS 键名不动、版本串三壳 .90、changelog/台账登记、全量 node --check。
// B 浏览器实测（自起 server，端口 15669，无痕游客直开 index.html#/house/decor）：
//    B1 组头改名「资料片分类」在场、「主题风格」组头绝迹；B2 种族组 31 胶囊（全部+30）计数与库实测逐一致；
//    B3 点「兽人」→ 命中计数=库实测 + 当前页全部卡片确含 tags[90]；点「全部」恢复；
//    B4 组合筛选 种族×资料片分类 交集计数=库实测；B5 重置筛选归位；
//    B6 零回归：既有维度（可放宠物特性）照常；B7 全程零 TypeError / console 零报错。
// 库实测基准 = service key 直读 decor_catalog（tags/subcategory_ids），与页面同库同时刻。
// 用法: node scripts/verify-task68.js
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 15669;
const BASE = `http://127.0.0.1:${PORT}`;
const VER = '20261013.90';

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const SVC = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `（${detail}）` : ''}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// eval decorDict.js 取真实词表（IIFE 写 window.DecorDict）
global.window = {};
eval(read('js/decorDict.js'));
const DD = global.window.DecorDict;

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

// 库实测：全量 tags + subcategory_ids（分页拉满）
async function dbRows(select) {
  const out = [];
  let offset = 0;
  for (;;) {
    const res = await fetch(`${SB}/rest/v1/decor_catalog?select=${select}&order=record_id.asc&limit=1000&offset=${offset}`, { headers: SVC });
    if (!res.ok) throw new Error('DB 读取失败 HTTP ' + res.status);
    const batch = await res.json();
    out.push(...batch);
    if (batch.length < 1000) break;
    offset += 1000;
  }
  return out;
}

// ==================== A 静态锚点 ====================
function staticAsserts() {
  console.log('== A. 静态锚点 ==');
  const dict = read('js/decorDict.js');
  const data = read('js/decorData.js');
  const app = read('js/app.js');
  const ledger = read('docs/问题与需求清单.md');

  const EXPECT_IDS = [74, 75, 76, 77, 78, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 95, 96, 97, 98, 157, 452, 484, 505, 620, 631, 639];
  const gotIds = (DD.RACE_TAGS || []).map(t => t.id);
  check('A1a RACE_TAGS 恰 30 项且 id 集与裁定口径一致（暴风城 80 剔除、精灵 83 上位保留）',
    Array.isArray(DD.RACE_TAGS) && DD.RACE_TAGS.length === 30 &&
    EXPECT_IDS.every(id => gotIds.includes(id)) && !gotIds.includes(80) && gotIds.includes(83),
    `n=${DD.RACE_TAGS && DD.RACE_TAGS.length}`);
  check('A1b RACE_TAGS 每项 label 非空 + 已挂 window.DecorDict 导出',
    DD.RACE_TAGS.every(t => t.label && typeof t.label === 'string') &&
    /SOURCE_TYPES, EXPANSION_TAGS, RACE_TAGS, COST_TIERS/.test(dict), '');

  check('A2a state 加 race:0 + activeFilterCount 计数 + filteredRows 过滤行',
    /race: 0,\s*\/\/ 种族 tag id/.test(data) &&
    /if \(state\.race\) n\+\+;/.test(data) &&
    /if \(state\.race && !\(r\.tags && r\.tags\[String\(state\.race\)\]\)\) return false;/.test(data), '');
  check('A2b 筛选栏种族组 HTML（dhRaceChips）+ chip 渲染绑定（raceDefs）',
    /dh-group-head">种族<span class="dh-chip-n">（单选）<\/span>/.test(data) &&
    /id="dhRaceChips"/.test(data) &&
    /const raceDefs = \[\{ id: 0, label: '全部' \}, \.\.\.D\.RACE_TAGS\];/.test(data) &&
    /state\.race = raceDefs\[i\]\.id; state\.page = 1; refreshChips\(\); render\(true\);/.test(data), '');
  check('A2c refreshChips paint + resetFilters 归位',
    /paint\('dhRaceChips', i => state\.race === \(i === 0 \? 0 : D\.RACE_TAGS\[i - 1\]\.id\)\);/.test(data) &&
    /expansion: 0, race: 0, costTier/.test(data), '');

  check('A3a 三处文案改名：state 注释 / 组头 / 渲染注释',
    /\/\/ 资料片分类 tag id/.test(data) &&
    /dh-group-head">资料片分类<span/.test(data) &&
    /\/\/ 资料片分类（tags 组单选/.test(data), '');
  check('A3b 「主题风格」组头绝迹（说明文案保留属任务书原文，不在改名范围）',
    !/dh-group-head">主题风格/.test(data), '');
  check('A3c 键名不动：expansion/EXPANSION_TAGS 全链路维持',
    /state\.expansion/.test(data) && /D\.EXPANSION_TAGS/.test(data) && /const EXPANSION_TAGS = \[/.test(dict), '');

  const cnt = (f, s) => (read(f).match(new RegExp(s.replace(/\./g, '\\.'), 'g')) || []).length;
  check('A4a 版本串 ' + VER + ' 三壳递增（index 15 / data 8 / decor 5）',
    cnt('index.html', VER) === 15 && cnt('data.html', VER) === 8 && cnt('decor.html', VER) === 5,
    `index=${cnt('index.html', VER)} data=${cnt('data.html', VER)} decor=${cnt('decor.html', VER)}`);
  check('A4b 旧串 20261013.89 三壳零残留',
    cnt('index.html', '20261013.89') === 0 && cnt('data.html', '20261013.89') === 0 && cnt('decor.html', '20261013.89') === 0, '');

  check('A5 changelog 补录（v3.2.0-task68-decor-race）+ 台账 REQ-160 登记',
    app.includes("id: 'v3.2.0-task68-decor-race'") && /\| REQ-160 \|/.test(ledger), '');

  const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f).concat(['server.js']);
  let allOk = true, bad = '';
  for (const f of jsFiles) {
    const r = spawnSync(process.execPath, ['--check', f], { cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) { allOk = false; bad = f; }
  }
  check('A6 node --check 全量通过（js/ 全部 + server.js）', allOk, bad);
}

// ==================== B 浏览器实测 ====================
async function liveAsserts() {
  console.log('== B. 浏览器实测 ==');
  // 库实测基准
  const rows = await dbRows('record_id,tags,subcategory_ids');
  const raceCount = id => rows.filter(r => r.tags && r.tags[String(id)]).length;
  const CNT_ORC = raceCount(90);
  const CNT_ORC_EXP110 = rows.filter(r => r.tags && r.tags['90'] && r.tags['110']).length;
  const CNT_PET = rows.filter(r => Array.isArray(r.subcategory_ids) && r.subcategory_ids.includes(53)).length;
  check('B-前置 库实测基准：兽人=' + CNT_ORC + '、兽人×至暗之夜=' + CNT_ORC_EXP110 + '、可放宠物=' + CNT_PET + '、全量=' + rows.length,
    rows.length > 2000 && CNT_ORC > 0 && CNT_ORC_EXP110 > 0 && CNT_PET > 0, '');

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
      if (/assets\/decor-icons\//.test(u)) { whitelist.push(u); return; } // 缺图标占位链路在案（41 件）
      errs.push(`http${r.status()} ${r.request().method()} ${u}`);
    }
  });

  await pg.goto(`${BASE}/index.html#/house/decor`, { waitUntil: 'load' });
  await pg.waitForSelector('#page-decor .dh-grid .dh-card', { timeout: 30000 });

  // B1 组头改名
  const b1 = await pg.evaluate(() => {
    const heads = [...document.querySelectorAll('#page-decor .dh-group-head')].map(h => h.textContent.trim());
    return { heads, hasExp: heads.some(h => h.startsWith('资料片分类')), hasOld: heads.some(h => h.startsWith('主题风格')), hasRace: heads.some(h => h.startsWith('种族')) };
  });
  check('B1 筛选栏组头「资料片分类」在场 + 「种族」在场 + 「主题风格」组头绝迹',
    b1.hasExp && b1.hasRace && !b1.hasOld, b1.heads.join('/'));

  // B2 种族胶囊 31 枚 + 计数与库实测逐一致
  const b2 = await pg.evaluate(() => {
    const btns = [...document.querySelectorAll('#dhRaceChips button')];
    return btns.map(b => {
      const n = b.querySelector('.dh-chip-n');
      return { label: n ? b.childNodes[0].textContent.trim() : b.textContent.trim(), count: n ? Number(n.textContent) : null };
    });
  });
  const labels = DD.RACE_TAGS.map(t => t.label);
  let cntFail = '';
  if (b2.length !== 31 || b2[0].label !== '全部' || b2[0].count !== null) {
    cntFail = `结构异常 n=${b2.length} first=${JSON.stringify(b2[0])}`;
  } else {
    for (let i = 1; i < 31; i++) {
      const want = raceCount(DD.RACE_TAGS[i - 1].id);
      if (b2[i].label !== labels[i - 1] || b2[i].count !== want) {
        cntFail = `${labels[i - 1]}: 页面=${b2[i].label}/${b2[i].count} 库=${want}`;
        break;
      }
    }
  }
  check('B2 种族组 31 胶囊（全部+30）：label 序与词表一致、30 枚计数与库实测逐一相等', !cntFail, cntFail || '30/30');

  // B3 点「兽人」→ 命中计数 + 当前页卡片确含 tags[90] → 点「全部」恢复
  const orcIdx = DD.RACE_TAGS.findIndex(t => t.id === 90) + 1;
  await pg.locator('#dhRaceChips button').nth(orcIdx).click();
  await sleep(400);
  const b3a = await pg.evaluate(() => ({
    countText: document.querySelector('#page-decor #dhCount').textContent.trim(),
    onIdx: [...document.querySelectorAll('#dhRaceChips button')].findIndex(b => b.classList.contains('on')),
    rids: [...document.querySelectorAll('#page-decor .dh-grid .dh-card')].map(c => c.dataset.rid),
  }));
  check('B3a 点「兽人」：计数「命中 ' + CNT_ORC + ' 件 · 1 项生效」+ 胶囊选中态到位',
    b3a.countText === `命中 ${CNT_ORC} 件 · 1 项生效` && b3a.onIdx === orcIdx,
    `count=${b3a.countText} onIdx=${b3a.onIdx}`);
  const probe = await dbRows(`record_id,tags&record_id=in.(${b3a.rids.join(',')})`);
  const notOrc = probe.filter(r => !(r.tags && r.tags['90'])).map(r => r.record_id);
  check('B3b 当前页 ' + b3a.rids.length + ' 张卡片逐张核对：全部含 tags[90]（兽人）',
    b3a.rids.length > 0 && notOrc.length === 0, notOrc.slice(0, 3).join(',') || `${b3a.rids.length} 张全中`);
  await pg.locator('#dhRaceChips button').nth(0).click();
  await sleep(400);
  const b3c = await pg.evaluate(() => document.querySelector('#page-decor #dhCount').textContent.trim());
  check('B3c 点「全部」恢复全量计数', b3c === `共 ${rows.length} 件`, `count=${b3c}`);

  // B4 组合筛选：兽人 × 至暗之夜
  await pg.locator('#dhRaceChips button').nth(orcIdx).click();
  const expIdx = DD.EXPANSION_TAGS.findIndex(t => t.id === 110) + 1;
  await pg.locator('#dhExpChips button').nth(expIdx).click();
  await sleep(400);
  const b4 = await pg.evaluate(() => document.querySelector('#page-decor #dhCount').textContent.trim());
  check('B4 组合筛选 兽人×至暗之夜：交集计数=库实测（' + CNT_ORC_EXP110 + ' 件 · 2 项生效）',
    b4 === `命中 ${CNT_ORC_EXP110} 件 · 2 项生效`, `count=${b4}`);

  // B5 重置筛选归位
  await pg.locator('#page-decor #dhResetFilters').click();
  await sleep(400);
  const b5 = await pg.evaluate(() => ({
    countText: document.querySelector('#page-decor #dhCount').textContent.trim(),
    raceOnIdx: [...document.querySelectorAll('#dhRaceChips button')].findIndex(b => b.classList.contains('on')),
    expOnIdx: [...document.querySelectorAll('#dhExpChips button')].findIndex(b => b.classList.contains('on')),
  }));
  check('B5 重置筛选：种族/资料片分类双归「全部」+ 全量计数',
    b5.countText === `共 ${rows.length} 件` && b5.raceOnIdx === 0 && b5.expOnIdx === 0, JSON.stringify(b5));

  // B6 零回归：特性「可放宠物」既有维度照常
  await pg.locator('#page-decor #dhFeatChips button').nth(0).click();
  await sleep(400);
  const b6 = await pg.evaluate(() => document.querySelector('#page-decor #dhCount').textContent.trim());
  check('B6 既有维度零回归：可放宠物 → 命中 ' + CNT_PET + ' 件（库实测一致）',
    b6 === `命中 ${CNT_PET} 件 · 1 项生效`, `count=${b6}`);

  // B7 全程 console 零报错
  check('B7a 全程零 TypeError', typeErrors.length === 0, typeErrors.slice(0, 2).join(' | ').slice(0, 300));
  let budget = whitelist.length;
  const real = errs.filter(e => {
    if (budget > 0 && e.startsWith('console: Failed to load resource: the server responded with a status of 4')) { budget--; return false; }
    return true;
  });
  check('B7b 全程 console 零报错（白名单：缺图标占位 404 在案）', real.length === 0, real.slice(0, 3).join(' | ').slice(0, 300));

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
