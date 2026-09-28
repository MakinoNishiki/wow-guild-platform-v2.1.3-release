// 任务书 #59 WP4（视觉密度五项）实测取证脚本——验证代理自建脚本，不触碰产品源码
// 前置：node server.js 已在 :18659 运行；verify-task59-wp4-setup.js setup 已建测试数据
// 用法: node scripts/verify-task59-wp4-measure.js before|after
// 产出：backup/2026-09-28-task59-wp4/<label>/*.png + measurements-<label>.json
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const LABEL = process.argv[2] || 'before';
const SHOT = path.join(ROOT, 'backup', '2026-09-28-task59-wp4', LABEL);
const BASE = 'http://127.0.0.1:18659';
const CTX = JSON.parse(fs.readFileSync(path.join(__dirname, '.task59-wp4-ctx.json'), 'utf8'));
fs.mkdirSync(SHOT, { recursive: true });

const M = { label: LABEL, at: new Date().toISOString(), viewports: {}, buttons: {}, notes: [] };
const consoleErrors = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function watchConsole(page, tag) {
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push({ ctx: tag, text: msg.text().slice(0, 200) });
  });
  page.on('pageerror', err => consoleErrors.push({ ctx: tag, type: 'pageerror', text: String(err).slice(0, 200) }));
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOT, name), fullPage: false });
}
async function goHash(page, hash, waitSel, timeout = 30000) {
  await page.evaluate(h => { location.hash = h; }, hash);
  if (waitSel) await page.waitForSelector(waitSel, { timeout });
  await sleep(400);
}
async function login(page, email) {
  await page.goto(BASE + '/#/home', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#iaLoginBtn', { timeout: 15000 });
  await page.click('#iaLoginBtn');
  await page.waitForSelector('#authOverlay', { state: 'visible' });
  await page.fill('#authEmail', email);
  await page.fill('#authPassword', CTX.pwd);
  await page.click('#authLoginBtn');
  await page.waitForFunction(() => {
    const o = document.getElementById('authOverlay');
    return o && getComputedStyle(o).display === 'none';
  }, null, { timeout: 30000 });
  await sleep(600);
}

// 通用实测块：容器/版心/标题
async function measureFrame(page, key) {
  M.viewports[key] = await page.evaluate(() => {
    const cs = el => el ? getComputedStyle(el) : null;
    const activePage = document.querySelector('.content-area > .page.active');
    const ca = cs(document.querySelector('.content-area'));
    const ap = cs(activePage);
    const pt = cs(document.querySelector('.page-title'));
    return {
      hash: location.hash,
      activePageId: activePage ? activePage.id : null,
      contentAreaPadding: ca ? ca.padding : null,
      pageMaxWidth: ap ? ap.maxWidth : null,
      pageWidth: activePage ? Math.round(activePage.getBoundingClientRect().width) : null,
      pageTitle: pt ? { fontSize: pt.fontSize, fontWeight: pt.fontWeight, letterSpacing: pt.letterSpacing } : null,
    };
  });
}

// 按钮清单：全页可见 button 元素（含 .btn 类 div 角色按钮不含——任务口径=按钮元素与 .btn 类）
async function invButtons(page, tag) {
  const list = await page.evaluate(() => {
    const out = [];
    const els = document.querySelectorAll('button, .btn, .dp-toggle, .dh-pp-back, .home-quick-link');
    els.forEach(el => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0) return;
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (typeof el.className === 'string' ? el.className : '').trim().slice(0, 60),
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24),
        h: Math.round(r.height * 10) / 10,
        fs: cs.fontSize,
      });
    });
    return out;
  });
  M.buttons[tag] = list;
  return list;
}

// 表格行高/td padding
async function measureTable(page, key, sel) {
  const r = await page.evaluate(s => {
    const t = document.querySelector(s);
    if (!t) return null;
    const row = t.querySelector('tbody tr');
    const td = t.querySelector('tbody td');
    if (!row || !td) return null;
    const cs = getComputedStyle(td);
    return { rowH: Math.round(row.getBoundingClientRect().height * 10) / 10, tdPadding: cs.padding, tdFontSize: cs.fontSize };
  }, sel);
  M.viewports[key] = Object.assign(M.viewports[key] || {}, { table: r, tableSel: sel });
}

(async () => {
  const browser = await chromium.launch();

  for (const vp of [{ w: 1440, h: 900 }, { w: 1920, h: 1080 }]) {
    const vkey = `${vp.w}`;
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await ctx.newPage();
    watchConsole(page, `${vkey}-guest`);

    // ---- 游客态：home / 图鉴 / 掉落 ----
    await page.goto(BASE + '/#/home', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#page-home.active .home-entry-card', { timeout: 20000 });
    await measureFrame(page, `${vkey}-home`);
    await invButtons(page, `${vkey}-home`);
    await shot(page, `${vkey}-home.png`);

    await goHash(page, '#/house/decor', '#page-decor .dh-card', 90000);
    await measureFrame(page, `${vkey}-decor`);
    M.viewports[`${vkey}-decor`].dhGrid = await page.evaluate(() => {
      const g = document.querySelector('#page-decor .dh-grid');
      if (!g) return null;
      const cs = getComputedStyle(g);
      return { cols: cs.gridTemplateColumns.split(' ').length, gap: cs.gap, width: Math.round(g.getBoundingClientRect().width) };
    });
    await shot(page, `${vkey}-decor.png`);

    await goHash(page, '#/team/lootdrop', '#page-lootdrop .dp-item', 90000);
    await measureFrame(page, `${vkey}-lootdrop`);
    M.viewports[`${vkey}-lootdrop`].dp = await page.evaluate(() => {
      const main = document.querySelector('#page-lootdrop .dp-main');
      const grid = document.querySelector('#page-lootdrop .dp-items');
      const csMain = main ? getComputedStyle(main) : null;
      const csGrid = grid ? getComputedStyle(grid) : null;
      return {
        mainMaxWidth: csMain ? csMain.maxWidth : null,
        mainWidth: main ? Math.round(main.getBoundingClientRect().width) : null,
        mainMarginRight: csMain ? csMain.marginRight : null,
        cols: csGrid ? csGrid.gridTemplateColumns.split(' ').length : null,
        gap: csGrid ? csGrid.gap : null,
      };
    });
    await invButtons(page, `${vkey}-lootdrop`);
    await shot(page, `${vkey}-lootdrop.png`);

    // ---- 登录 owner（公会A 有数据）----
    await login(page, 'wp4-owner@example.com');
    // 确保落在公会A
    await page.evaluate(({ uid, gid }) => localStorage.setItem(`wow_raid_last_guild:${uid}`, gid), { uid: CTX.uidOwner, gid: CTX.guildA });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#page-dashboard.active', { timeout: 30000 }).catch(() => {});
    await sleep(1200);

    await goHash(page, '#/team/members', '#page-members .data-table tbody tr td');
    await measureFrame(page, `${vkey}-members`);
    await measureTable(page, `${vkey}-members`, '#page-members .data-table');
    await invButtons(page, `${vkey}-members`);
    await shot(page, `${vkey}-members.png`);

    await goHash(page, '#/team/attendance', '#page-attendance');
    await sleep(800);
    await invButtons(page, `${vkey}-attendance`);

    await goHash(page, '#/team/loot', '#page-loot .data-table tbody tr td');
    await measureTable(page, `${vkey}-loot`, '#page-loot .data-table');

    await goHash(page, '#/team/wishlist', '#page-wishlist .data-table tbody tr td');
    await measureTable(page, `${vkey}-wishlist`, '#page-wishlist .data-table');

    await goHash(page, '#/team/reports', '#page-reports .data-table tbody tr td');
    await measureTable(page, `${vkey}-reports`, '#page-reports .data-table');
    await invButtons(page, `${vkey}-reports`);

    // 登录态图鉴/掉落网格（与游客同源，复核列数）
    await goHash(page, '#/house/decor', '#page-decor .dh-card', 90000);
    M.viewports[`${vkey}-decor-login`] = await page.evaluate(() => {
      const g = document.querySelector('#page-decor .dh-grid');
      const cs = g ? getComputedStyle(g) : null;
      return cs ? { cols: cs.gridTemplateColumns.split(' ').length, gap: cs.gap, width: Math.round(g.getBoundingClientRect().width) } : null;
    });

    // ---- 切公会B（空数据）做空态 ----
    await page.evaluate(({ uid, gid }) => localStorage.setItem(`wow_raid_last_guild:${uid}`, gid), { uid: CTX.uidOwner, gid: CTX.guildB });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(1500);

    await goHash(page, '#/team/loot', '#page-loot .data-table .empty-state');
    await shot(page, `${vkey}-empty-loot.png`);
    await goHash(page, '#/team/wishlist', '#page-wishlist .data-table .empty-state');
    await shot(page, `${vkey}-empty-wishlist.png`);
    await goHash(page, '#/team/reports', '#page-reports .data-table .empty-state');
    await shot(page, `${vkey}-empty-reports.png`);
    await goHash(page, '#/team/attendance', '#page-attendance .empty-state', 15000).catch(() => {});
    await shot(page, `${vkey}-empty-attendance.png`);
    // 空方案单（owner 无方案）
    await goHash(page, '#/house/plan', '#page-decor-plan .dh-pp-empty', 60000);
    await shot(page, `${vkey}-empty-plan.png`);
    M.viewports[`${vkey}-empty-plan`] = await page.evaluate(() => {
      const b = document.querySelector('#page-decor-plan .dh-pp-empty .btn');
      return b ? { text: b.textContent.trim(), h: Math.round(b.getBoundingClientRect().height * 10) / 10 } : null;
    });

    // ---- 无公会用户：引导卡 ----
    const ctx2 = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const p2 = await ctx2.newPage();
    watchConsole(p2, `${vkey}-noguild`);
    await login(p2, 'wp4-noguild@example.com');
    await goHash(p2, '#/team/members', '#page-team-guide.active', 20000);
    await shot(p2, `${vkey}-guide-card.png`);
    await invButtons(p2, `${vkey}-guide`);
    await ctx2.close();

    await ctx.close();
  }

  // 汇总 <32px 按钮清单（跨页去重：cls+text）
  const seen = new Map();
  for (const [tag, list] of Object.entries(M.buttons)) {
    for (const b of list) {
      const k = `${b.tag}|${b.cls}|${b.text}`;
      if (!seen.has(k)) seen.set(k, { ...b, pages: [tag] });
      else seen.get(k).pages.push(tag);
    }
  }
  M.buttonInventoryAll = [...seen.values()].sort((a, b) => a.h - b.h);
  M.buttonInventoryUnder32 = M.buttonInventoryAll.filter(b => b.h < 32);
  M.consoleErrors = consoleErrors.slice(0, 30);

  fs.writeFileSync(path.join(SHOT, `measurements-${LABEL}.json`), JSON.stringify(M, null, 2));
  console.log(`\n===== ${LABEL} 实测完成 =====`);
  console.log('按钮去重总数:', M.buttonInventoryAll.length, '| <32px:', M.buttonInventoryUnder32.length);
  for (const b of M.buttonInventoryUnder32) console.log(`  <32: h=${b.h} fs=${b.fs} [${b.cls}] "${b.text}" @ ${b.pages.slice(0, 3).join(',')}`);
  console.log('console 错误:', consoleErrors.length);
  for (const [k, v] of Object.entries(M.viewports)) console.log(k, JSON.stringify(v).slice(0, 220));
  await browser.close();
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
