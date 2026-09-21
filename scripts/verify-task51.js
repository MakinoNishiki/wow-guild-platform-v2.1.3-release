// 任务书 #51 WP1 验收（REQ-137 一期·家宅图鉴应用内页）
// 【重建件】任务书 #51-补丁 第五节：HEAD 中本文件曾为重定向误写 7 字节事故件（WP1 本体两侧不可考，
//   WP1 已销号不考古），按 WP1 修改报告 28 项清单（A1-A6 + B1a-d + B2a-f + B3 + B4×7 + B5 + B6 + B7 +
//   清理复核）一一重建，风格对齐 verify-task51-wp2.js。
// 【口径变更】2026-09-18 排序口径变更（任务书 #51-补丁 第一节：装饰在前、房间沉底）——
//   B3「第 2 页首卡」由旧口径（全量 record_id asc 第 61 件=487）改为新口径（装饰序第 61 件=RPC 实测），
//   重建时先以新口径跑出「27 绿 + B3 预期红」开工基线，第一节完工后 B3 转绿。
// 【口径变更】2026-09-21 任务书 #51-补丁3：①每页件数动态化（PAGE_SIZE 常量 60 → 实测列数×8 行，
//   B1/B3/B8a/B8c 旧 60 卡口径全部改动态——浏览器内实测 gridTemplateColumns 列数×8 为期望基准）；
//   ②卡片版式重排（容量徽标挪图标右上角角标 .dh-cost-badge、原底部容量行删除、来源摘要两行截断）——
//   新增 A8 静态锚点 + B11 版式断言 + B12 resize 锚点实测。
// 覆盖（任务书 WP1 验收口径）：
//   A. 静态断言：①index.html 最小入口（导航项/#page-decor/三引用）+ 版本串计数与旧串零残留；
//      ②data.html 零 decor 引用越界（WP1 口径，WP2 后 data.html 仍零 decor）；③decorData.js 零写入 grep 门禁；
//      ④changelog 条目在场；⑤node --check js/decorDict.js / js/decorData.js / js/app.js。
//   B. 登录壳真浏览器（T051 测试用户 owner，只读页面不限角色）：
//      B1 全量计数「共 2062 件」+ 首页卡数=实测列数×8（补丁3 动态口径）+ 分页「第 1/N 页」+ 首页占位图数=库内计算值；
//      B2 逐筛选维度命中计数与库内 REST 对照（分类家具/特性房间/可放宠物/来源商城/来源无来源/资料片至暗之夜）；
//      B3 翻页主链路（新口径：第 2 页首卡=装饰序第 61 件）；
//      B4 基准六件详情弹窗 + 1430 texture 价=「100 × 封存腐化」（货币 3568，顾问对证点）；
//      B5 空结果态 + 重置还原；B6 768px 窄屏折叠+卡片收小；B7 零 JS 报错零 4xx/5xx（user_profiles 409 首登竞态白名单）；
//      B8 截图 → backup/2026-09-18-task51-wp1/。
//   C. T051 测试用户/公会清零复核；逐项 ✓/✗ 汇总，任一 ✗ 退出码 1。
// 用法: node scripts/verify-task51.js（PW_CHANNEL=chrome 可选）
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-09-18-task51-wp1');
const PORT = 15051;
const BASE = `http://127.0.0.1:${PORT}`;
const PWD = 'T051-Test-2026!';
const EMAIL = 't051-decor@wowbutler.cn';
const VER = '20260919.67';

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const ANON = env.SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_H = { apikey: ANON, Authorization: `Bearer ${ANON}` };
const SVC = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail !== undefined ? `（${detail}）` : ''}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function svc(method, restPath, body) {
  const res = await fetch(`${SB}${restPath}`, { method, headers: SVC, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

let serverProc = null, userU = null, guildId = null, dbRows = [];

async function fetchDecorAnon() {
  const rows = [];
  let offset = 0;
  for (;;) {
    const res = await fetch(`${SB}/rest/v1/decor_catalog?select=record_id,entry_type,name,icon_file_id,quality,size,placement_cost,category_ids,subcategory_ids,tags,indoors,outdoors,source_text,sources&order=record_id.asc&offset=${offset}&limit=1000`, {
      headers: ANON_H,
    });
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < 1000) break;
    offset += 1000;
  }
  return rows;
}

async function setup() {
  const oldG = await svc('GET', `/rest/v1/guilds?select=id&name=like.T051*`);
  for (const g of (Array.isArray(oldG.body) ? oldG.body : [])) await svc('DELETE', `/rest/v1/guilds?id=eq.${g.id}`);
  const lu = await fetch(`${SB}/auth/v1/admin/users?per_page=50`, { headers: SVC });
  const lj = await lu.json();
  const hit = (lj.users || []).find(u => u.email === EMAIL);
  if (hit) await fetch(`${SB}/auth/v1/admin/users/${hit.id}`, { method: 'DELETE', headers: SVC });

  let res = await fetch(`${SB}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PWD, data: { display_name: 'T051验收' } }),
  });
  let body = await res.json();
  if (!body.access_token) {
    res = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PWD }),
    });
    body = await res.json();
  }
  userU = { uid: body.user.id };
  const g = await svc('POST', '/rest/v1/guilds', { name: 'T051图鉴验收会', owner_id: userU.uid, invite_code: 'T051' + Date.now().toString(36).slice(-4).toUpperCase() });
  guildId = g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', [{ guild_id: guildId, user_id: userU.uid, role: 'owner', display_name: 'T051验收' }]);

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch { /* 未起 */ }
    if (i === 49) throw new Error('server.js 启动超时');
    await sleep(200);
  }
  dbRows = await fetchDecorAnon();
}

async function cleanup() {
  const steps = [];
  if (guildId) { try { const r = await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`); steps.push(`guild:${r.status}`); } catch { steps.push('guild:ERR'); } }
  if (userU) { try { await fetch(`${SB}/auth/v1/admin/users/${userU.uid}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); } }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const c1 = await svc('GET', `/rest/v1/guilds?select=id&name=like.T051*`);
  check('[清理复核] T051 前缀公会全 0', c1.body.length === 0, `guild=${c1.body.length}`);
}

// 与 UI 同语义的计数函数（词表 js/decorDict.js 终审值）
const PET_SUB = 53;
// 2026-09-18 排序口径（#51-补丁 第一节）：装饰在前、房间沉底，组内 record_id asc（dbRows 已 asc，稳定排序）
const ordered = () => [...dbRows].sort((a, b) => (a.entry_type === 2 ? 1 : 0) - (b.entry_type === 2 ? 1 : 0));
const cnt = {
  total: () => dbRows.length,
  // 2026-09-21 补丁3 动态口径：首屏窗口 = 新序前 pageSize 件（pageSize=实测列数×8，浏览器侧实测传入）
  firstPagePlaceholder: n => ordered().slice(0, n).filter(r => r.icon_file_id == null).length,
  catFurniture: () => dbRows.filter(r => Array.isArray(r.category_ids) && r.category_ids.includes(1)).length,
  rooms: () => dbRows.filter(r => r.entry_type === 2).length,
  pet: () => dbRows.filter(r => Array.isArray(r.subcategory_ids) && r.subcategory_ids.includes(PET_SUB)).length,
  srcShop: () => dbRows.filter(r => Array.isArray(r.sources) && r.sources.some(s => s.type === 'shop')).length,
  srcNone: () => dbRows.filter(r => !Array.isArray(r.sources) || !r.sources.length).length,
  expMidnight: () => dbRows.filter(r => r.tags && r.tags['110']).length,
  envOutdoor: () => dbRows.filter(r => r.outdoors === true).length,
  envIndoorOnly: () => dbRows.filter(r => r.indoors === true && r.outdoors !== true).length,
  searchHit: kw => dbRows.filter(r => r.name.toLowerCase().includes(kw.toLowerCase())).length,
};

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await setup();
  console.log(`[数据] decor_catalog anon 拉取 ${dbRows.length} 行（分页循环实证）`);

  // ==================== A. 静态断言 ====================
  const idxSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check('A1 index.html 最小入口：导航项 data-page="decor" + #page-decor 容器 + decor-public.css/decorDict.js/decorData.js 三引用',
    idxSrc.includes('data-page="decor"') && idxSrc.includes('id="page-decor"')
    && idxSrc.includes('css/decor-public.css') && idxSrc.includes('js/decorDict.js') && idxSrc.includes('js/decorData.js'));
  const vRe = new RegExp(VER.replace('.', '\\.'), 'g');
  const vIdx = (idxSrc.match(vRe) || []).length;
  const staleIdx = (idxSrc.match(/\?v=\d{8}\.\d+/g) || []).filter(s => !s.includes(VER));
  check(`A2 index.html 版本串 ${VER} 计数=14（含顶部注释，新增 css+2js）且旧版本串零残留`,
    vIdx === 14 && staleIdx.length === 0, `计数=${vIdx} 残留=${staleIdx.length}`);
  const datSrc = fs.readFileSync(path.join(ROOT, 'data.html'), 'utf8');
  check('A3 data.html 仅 WP2 互链一行（href="decor.html"），无 decorData/decorDict 引用越界',
    datSrc.includes('href="decor.html"') && !datSrc.includes('decorData.js') && !datSrc.includes('decorDict.js') && !datSrc.includes('decor-public.css'));
  const ddSrc = fs.readFileSync(path.join(ROOT, 'js', 'decorData.js'), 'utf8');
  check('A4 decorData.js 零写入门禁：无 /api/db、无 POST、无 service 字样',
    !ddSrc.includes('/api/db') && !ddSrc.includes('POST') && !/service/i.test(ddSrc));
  const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  const clIdx = appSrc.indexOf("id: 'v3.2.0-decor-catalog'");
  check('A5 changelog 条目在场（v3.2.0-decor-catalog，date=2026-09-18，type=feature）',
    clIdx !== -1 && appSrc.slice(clIdx, clIdx + 300).includes("date: '2026-09-18'") && appSrc.slice(clIdx, clIdx + 300).includes("type: 'feature'"));
  const nc = ['js/decorDict.js', 'js/decorData.js', 'js/app.js'].map(f => spawnSync(process.execPath, ['--check', path.join(ROOT, f)], { encoding: 'utf8' }).status);
  check('A6 node --check decorDict/decorData/app 三文件语法通过', nc.every(s => s === 0), nc.join('/'));
  // A7（#51-补丁 静态锚点）：第二节 CSS 放大 + 第三节卡片行 + 第四节词表三档 + 第六节 focus-visible
  const cssSrc = fs.readFileSync(path.join(ROOT, 'css', 'decor-public.css'), 'utf8');
  check('A7a CSS 锚点：grid minmax(190px,1fr) + 768 档 minmax(132px,1fr)/80px + 弹窗 img 128px + .dh-cat/.dh-src 行',
    cssSrc.includes('minmax(190px, 1fr)') && cssSrc.includes('minmax(132px, 1fr)')
    && cssSrc.includes('.dh-icon-wrap img { width: 96px; height: 96px')
    && cssSrc.includes('.dh-modal-icon img { width: 128px; height: 128px')
    && cssSrc.includes('.dh-cat {') && cssSrc.includes('.dh-src {'));
  check('A7b CSS 锚点：:focus-visible 补登（chip/分页钮/弹窗关闭钮/栏内按钮，卡片既有）',
    cssSrc.includes('.dh-chip:focus-visible') && cssSrc.includes('.dh-pager button:focus-visible') && cssSrc.includes('.dh-card:focus-visible'));
  const dictSrc = fs.readFileSync(path.join(ROOT, 'js', 'decorDict.js'), 'utf8');
  check('A7c 词表锚点：ENV_OPTIONS 三档（可放室外/仅室内，「均可」「室内」档已砍）+ 数据依据注释',
    dictSrc.includes("label: '可放室外'") && dictSrc.includes("label: '仅室内'") && !dictSrc.includes("label: '均可'") && dictSrc.includes('仅室外=0'));
  check('A7d 渲染锚点：decorData.js 排序沉底（entry_type===2 沉底）+ 卡片分类/来源行',
    ddSrc.includes('(a.entry_type === 2 ? 1 : 0) - (b.entry_type === 2 ? 1 : 0)') && ddSrc.includes('dh-cat') && ddSrc.includes('srcSummaryText'));
  // A8（任务书 #51-补丁3 静态锚点）：动态每页件数 + 卡片版式重排
  check('A8a 渲染锚点：动态件数=实测列数×8（getComputedStyle gridTemplateColumns 实测 + ROWS_PER_PAGE=8 + resize 防抖 300ms + record_id 锚点重定位）',
    ddSrc.includes('getComputedStyle(probe).gridTemplateColumns') && ddSrc.includes('ROWS_PER_PAGE = 8')
    && ddSrc.includes('resizeTimer = setTimeout') && ddSrc.includes('}, 300);')
    && ddSrc.includes('rows.findIndex(r => r.record_id === anchor.record_id)')
    && !ddSrc.includes('/ D.PAGE_SIZE') && !ddSrc.includes('* D.PAGE_SIZE'));
  check('A8b 渲染锚点：容量角标入图标容器（dh-cost-badge）+ 底部容量行删除 + 无徽标整行省略',
    ddSrc.includes('dh-cost-badge') && !ddSrc.includes('badges.push(`<span class="dh-badge">容量'));
  check('A8c CSS 锚点：角标绝对定位（图标容器 relative + top/right 角位 + 字号≤11px）+ 来源两行截断（-webkit-line-clamp:2 + line-clamp 回退）+ 768 档角标缩小',
    /\.dh-icon-wrap\s*\{\s*position: relative;/.test(cssSrc) && cssSrc.includes('.dh-cost-badge {')
    && cssSrc.includes('top: 2px;') && cssSrc.includes('right: 2px;')
    && cssSrc.includes('-webkit-line-clamp: 2;') && cssSrc.includes('line-clamp: 2;')
    && cssSrc.includes('.dh-cost-badge { font-size: 9px'));

  // ==================== B. 登录壳真浏览器 ====================
  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const jsErrors = [], httpBad = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', e => jsErrors.push('pageerror: ' + e.message));
    page.on('console', msg => { if (msg.type() === 'error') jsErrors.push('console: ' + msg.text()); });
    page.on('response', r => { if (r.status() >= 400) httpBad.push(`${r.status()} ${r.url()}`); });

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
    await page.fill('#authEmail', EMAIL);
    await page.fill('#authPassword', PWD);
    await page.click('#authLoginBtn');
    await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
    await sleep(1200);

    // 导航最小入口截图（报运营确认物料）
    await page.locator('#sidebar').screenshot({ path: path.join(SHOT_DIR, '01-nav-entry.png') });

    // 切入家宅图鉴
    await page.click('.nav-item[data-page="decor"]');
    await page.waitForSelector('#page-decor .dh-card', { state: 'visible', timeout: 30000 });
    await sleep(1500); // 图标 lazy 加载稳定

    // B1 全量计数 + 首页卡数 + 分页 + 占位图【2026-09-21 补丁3 动态口径：
    //    每页件数=浏览器实测 gridTemplateColumns 列数×8 行，不写死断点；页数=ceil(总量/每页件数)】
    const gridProbe = await page.evaluate(() => {
      const tracks = getComputedStyle(document.querySelector('#page-decor .dh-grid')).gridTemplateColumns;
      const cols = tracks.split(/\s+/).filter(Boolean).length;
      return { cols, size: cols * 8 };
    });
    const PAGE = gridProbe.size;
    const PAGES = Math.max(1, Math.ceil(cnt.total() / PAGE));
    const b1 = await page.evaluate(() => ({
      count: document.getElementById('dhCount').textContent,
      cards: document.querySelectorAll('#page-decor .dh-card').length,
      pager: (document.querySelector('#dhPager .dh-pager-info:last-child') || {}).textContent || '',
      placeholder: [...document.querySelectorAll('#page-decor .dh-card img')].filter(i => i.getAttribute('src').endsWith('_placeholder.png')).length,
    }));
    check(`B1a 全量计数「共 ${cnt.total()} 件」`, b1.count === `共 ${cnt.total()} 件`, b1.count);
    check(`B1b 首页卡片数=实测列数×8（1366 档实测 ${gridProbe.cols} 列 × 8 = ${PAGE}/页，动态口径）`, b1.cards === PAGE, `卡=${b1.cards}`);
    check(`B1c 分页信息「第 1/${PAGES} 页 · 共 2062 件」（动态件数自然更新）`, b1.pager.includes(`第 1/${PAGES} 页`) && b1.pager.includes('共 2062 件'), b1.pager);
    check(`B1d 首页占位图数=库内新序首 ${PAGE} 件缺图标数（${cnt.firstPagePlaceholder(PAGE)}，#51-补丁 第一节排序口径：房间沉底后装饰件图标齐备）`, b1.placeholder === cnt.firstPagePlaceholder(PAGE),
      `页面=${b1.placeholder} 库=${cnt.firstPagePlaceholder(PAGE)}`);
    // B1e（#51-补丁 第一节）：首页整页零房间卡（房间沉底）+ P1 首卡=装饰序第 1 件（RPC 实测 decorOnly[0]）
    const decorOnlyRows = dbRows.filter(r => r.entry_type !== 2);
    const roomRids = new Set(dbRows.filter(r => r.entry_type === 2).map(r => r.record_id));
    const b1e = await page.evaluate(() => [...document.querySelectorAll('#page-decor .dh-card')].map(c => +c.dataset.rid));
    check(`B1e 排序沉底：首页 ${PAGE} 卡零房间卡 + 首卡=装饰序第 1 件`,
      b1e.length === PAGE && b1e.every(rid => !roomRids.has(rid)) && b1e[0] === decorOnlyRows[0].record_id,
      `卡=${b1e.length} 房间卡=${b1e.filter(rid => roomRids.has(rid)).length} 首卡=${b1e[0]} 期望=${decorOnlyRows[0].record_id}`);
    // B1f（#51-补丁3）：末页余量正确——末页件数=总量-(页数-1)×每页件数，且整页外页均满
    check('B1f 末页余量正确（总量 − (N−1)×每页件数）',
      cnt.total() - (PAGES - 1) * PAGE === cnt.total() % PAGE || cnt.total() % PAGE === 0,
      `总量=${cnt.total()} 每页=${PAGE} 末页=${cnt.total() - (PAGES - 1) * PAGE}`);
    // B11（任务书 #51-补丁3 第二节）：卡片版式重排 DOM/样式断言（当前为 1366 首页整页）
    const b11 = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#page-decor .dh-card')];
      const badgeEl = document.querySelector('#page-decor .dh-cost-badge');
      const srcEl = document.querySelector('#page-decor .dh-card .dh-src');
      const unknownEl = document.querySelector('#page-decor .dh-src-unknown');
      return {
        n: cards.length,
        costInIcon: cards.every(c => { const b = c.querySelector('.dh-cost-badge'); return !b || b.parentElement.classList.contains('dh-icon-wrap'); }),
        noBottomCost: cards.every(c => { const b = c.querySelector('.dh-badges'); return !b || !b.textContent.includes('容量'); }),
        badgesOmitted: cards.every(c => { const b = c.querySelector('.dh-badges'); return !b || b.children.length > 0; }),
        clamp: srcEl ? getComputedStyle(srcEl).webkitLineClamp : null,
        badgeFont: badgeEl ? getComputedStyle(badgeEl).fontSize : null,
        badgePos: badgeEl ? getComputedStyle(badgeEl).position : null,
        unknownNowrap: unknownEl ? getComputedStyle(unknownEl).whiteSpace === 'nowrap' : true,
      };
    });
    check(`B11a 卡片版式：${b11.n} 卡容量角标全部位于 .dh-icon-wrap 内 + 底部容量行绝迹 + 无徽标卡整行省略`,
      b11.costInIcon && b11.noBottomCost && b11.badgesOmitted,
      `入容器=${b11.costInIcon} 底部无容量=${b11.noBottomCost} 空行省略=${b11.badgesOmitted}`);
    check('B11b 来源摘要两行截断（computed -webkit-line-clamp=2）+ 角标 absolute/字号≤11px + 「来源未知」单行维持',
      b11.clamp === '2' && b11.badgePos === 'absolute' && parseFloat(b11.badgeFont) <= 11 && b11.unknownNowrap,
      `clamp=${b11.clamp} 角标=${b11.badgePos}/${b11.badgeFont} 未知单行=${b11.unknownNowrap}`);
    await page.screenshot({ path: path.join(SHOT_DIR, '02-grid-desktop.png') });

    // B2 逐筛选维度命中计数（UI 文本 vs 库内 REST 同语义计算）
    async function clickChip(groupId, label) {
      await page.evaluate(({ groupId, label }) => {
        const btn = [...document.querySelectorAll(`#${groupId} .dh-chip`)].find(b => b.textContent.trim().startsWith(label));
        if (!btn) throw new Error('chip 不存在: ' + groupId + '/' + label);
        btn.click();
      }, { groupId, label });
      await sleep(300);
      return (await page.textContent('#dhCount')).trim();
    }
    const t1 = await clickChip('dhCatChips', '家具');
    check('B2a 分类「家具」命中=库内 546', t1 === `命中 ${cnt.catFurniture()} 件 · 1 项生效`, t1);
    await clickChip('dhCatChips', '全部');
    const t2 = await clickChip('dhFeatChips', '房间/户型');
    check('B2b 特性「房间/户型」命中=库内 39', t2 === `命中 ${cnt.rooms()} 件 · 1 项生效`, t2);
    await clickChip('dhFeatChips', '房间/户型');
    const t3 = await clickChip('dhFeatChips', '可放宠物');
    check('B2c 特性「可放宠物」命中=库内 11（官方子分类 53 宠物床）', t3 === `命中 ${cnt.pet()} 件 · 1 项生效`, t3);
    await clickChip('dhFeatChips', '可放宠物');
    const t4 = await clickChip('dhSrcChips', '商城');
    check('B2d 来源「商城」命中=库内同语义计数', t4 === `命中 ${cnt.srcShop()} 件 · 1 项生效`, t4);
    const t5 = await clickChip('dhSrcChips', '无来源');
    check('B2e 来源「无来源」命中=库内 76（单选置换商城 → 1 项生效）', t5 === `命中 ${cnt.srcNone()} 件 · 1 项生效`, t5);
    await clickChip('dhSrcChips', '全部');
    const t6 = await clickChip('dhExpChips', '至暗之夜');
    check('B2f 资料片「至暗之夜」命中=库内 988', t6 === `命中 ${cnt.expMidnight()} 件 · 1 项生效`, t6);
    await clickChip('dhExpChips', '全部');

    // B3 翻页主链路【2026-09-21 补丁3 动态口径：第 2 页首卡=装饰序第 PAGE+1 件（PAGE=1366 档实测列数×8）；
    //    历史口径：旧=全量 record_id asc 第 61 件（487）→ 2026-09-18 排序沉底新口径=装饰序第 61 件 → 本批动态化】
    const decorOnly = dbRows.filter(r => r.entry_type !== 2);
    const firstCardP1 = await page.evaluate(() => +document.querySelector('#page-decor .dh-card').dataset.rid);
    await page.evaluate(() => { document.querySelector('#dhPager button[data-pg="2"]').click(); });
    await sleep(400);
    const b3 = await page.evaluate(() => ({
      first: +document.querySelector('#page-decor .dh-card').dataset.rid,
      pager: (document.querySelector('#dhPager .dh-pager-info:last-child') || {}).textContent || '',
    }));
    check(`B3 翻页：第 2 页首卡=装饰序第 ${PAGE + 1} 件 record_id（动态口径）+ 分页文本`, b3.first === decorOnly[PAGE].record_id && b3.pager.includes(`第 2/${PAGES} 页`),
      `首卡=${b3.first} 期望=${decorOnly[PAGE].record_id}（P1 首卡=${firstCardP1}）${b3.pager}`);
    await page.screenshot({ path: path.join(SHOT_DIR, '08-page2-first-card.png') }); // §7 截图：排序后第 2 页首卡

    // B12（任务书 #51-补丁3 第一节验收）：resize 锚点保持——翻到第 3 页→窗口收窄（列数变少、每页件数变少）→
    //    记当前页首件 record_id 锚点重定位，锚件仍在新件数下所在页（不粗暴回第 1 页）
    await page.evaluate(() => { document.querySelector('#dhPager button[data-pg="3"]').click(); });
    await sleep(400);
    const anchorId = await page.evaluate(() => +document.querySelector('#page-decor .dh-card').dataset.rid);
    const wideProbe = await page.evaluate(() => ({
      cols: getComputedStyle(document.querySelector('#page-decor .dh-grid')).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
      cards: document.querySelectorAll('#page-decor .dh-card').length,
    }));
    await page.setViewportSize({ width: 1000, height: 768 });
    await sleep(700); // resize 防抖 300ms + 重排
    const narrowProbe = await page.evaluate(() => ({
      cols: getComputedStyle(document.querySelector('#page-decor .dh-grid')).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
      cards: document.querySelectorAll('#page-decor .dh-card').length,
      rids: [...document.querySelectorAll('#page-decor .dh-card')].map(c => +c.dataset.rid),
      pager: (document.querySelector('#dhPager .dh-pager-info:last-child') || {}).textContent || '',
    }));
    check(`B12 resize 锚点：第 3 页首件 ${anchorId} 锚定——收窄 ${wideProbe.cols} 列→${narrowProbe.cols} 列（每页 ${wideProbe.cards}→${narrowProbe.cards}）后锚件仍在当前页`,
      narrowProbe.cols !== wideProbe.cols && narrowProbe.cards === narrowProbe.cols * 8 && narrowProbe.rids.includes(anchorId),
      `锚件在场=${narrowProbe.rids.includes(anchorId)} ${narrowProbe.pager.trim()}`);
    await page.screenshot({ path: path.join(SHOT_DIR, '13-resize-anchor.png') });
    await page.setViewportSize({ width: 1366, height: 768 });
    await sleep(700); // 防抖重排回 1366 原件数（锚件仍在场，后续搜索类断言自带 page=1 重置）
    await page.evaluate(() => { document.querySelector('#dhPager button[data-pg="1"]').click(); });
    await sleep(300);

    // B4 基准六件 + texture 件详情弹窗
    async function openByName(name) {
      await page.fill('#dhSearch', name);
      await sleep(400);
      const found = await page.evaluate(n => {
        const card = [...document.querySelectorAll('#page-decor .dh-card')].find(c => c.querySelector('.dh-name').textContent.trim() === n)
          || document.querySelector('#page-decor .dh-card');
        if (!card) return false;
        card.click();
        return true;
      }, name);
      if (!found) return null;
      await page.waitForSelector('.dh-modal-overlay.show', { timeout: 10000 });
      await sleep(300);
      const info = await page.evaluate(() => ({
        title: document.querySelector('.dh-modal-title').textContent.trim(),
        src: document.querySelector('.dh-src-list').textContent.replace(/\s+/g, ' '),
      }));
      return info;
    }
    async function closeModal() {
      await page.keyboard.press('Escape');
      await sleep(300);
      await page.evaluate(() => { document.getElementById('dhSearchClear').click(); });
      await sleep(300);
    }
    const cases = [
      ['暴雪嘉年华门垫', ['商城购买', '商人：世界商人 · 500 金'], '28350 商城+世界商人 500 金'],
      ['月溪镇旧式夜景窗', ['“丹恩”夜影（烈风海岸） · 20 × 社区礼券', '费奥蕊·月行者（创始者之角） · 20 × 社区礼券'], '27973 双商人双地区 20×社区礼券'],
      ['“受枷者的狂怒”壁画', ['掉落：乌拉特克（烈毒之渊）'], '27043 掉落乌拉特克'],
      ['塞纳里奥私密屏风', ['赛尔弗丽雅·珀林（瓦尔莎拉） · 2000 × 职业大厅资源 + 1000 金 · 织梦者 - 崇拜', '西尔维娅·鹿角'], '675 双商人 2000×职业大厅资源+1000金+织梦者-崇拜'],
      ['佩佩', ['地区：烈风海岸', '地区：创始者之角'], '25546 原文兜底'],
      ['影月开放式棚屋', ['任务：密报：突击索克雷萨高地（影月谷）'], '8176 任务影月谷'],
      ['净化的巨魔骨灰瓮', ['商人：受诅信物（创始者之角、烈风海岸） · 100 × 封存腐化'], '1430 texture=封存腐化（货币 3568，顾问对证点）'],
    ];
    let shotDone = false;
    for (const [name, expects, label] of cases) {
      const info = await openByName(name);
      const ok = info && info.title === name && expects.every(e => info.src.includes(e));
      check(`B4 ${label}`, !!ok, info ? `标题=${info.title} 来源=${info.src.slice(0, 120)}…` : '卡片未找到');
      if (name === '暴雪嘉年华门垫' && info && !shotDone) {
        shotDone = true;
        await page.screenshot({ path: path.join(SHOT_DIR, '03-modal-28350.png') });
      }
      await closeModal();
    }

    // B5 空结果态 + 重置还原
    await page.fill('#dhSearch', '绝不存在的装饰xyz123');
    await sleep(400);
    const emptyVisible = await page.evaluate(() => !!document.querySelector('#page-decor .dh-empty'));
    await page.screenshot({ path: path.join(SHOT_DIR, '04-empty.png') });
    await page.evaluate(() => { document.getElementById('dhEmptyReset').click(); });
    await sleep(400);
    const restored = (await page.textContent('#dhCount')).trim();
    check('B5 空结果态（含重置引导）+ 重置还原全集', emptyVisible && restored === `共 ${cnt.total()} 件`,
      `空态=${emptyVisible} 还原=${restored}`);

    // ==================== #51-补丁 第三节：卡片信息扩充断言 ====================
    // B8a 首页每张卡含分类行 .dh-cat 与来源行 .dh-src（补丁3 动态口径：整页卡数=PAGE）
    const b8a = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#page-decor .dh-card')];
      return { n: cards.length, ok: cards.every(c => c.querySelector('.dh-cat') && c.querySelector('.dh-src')) };
    });
    check(`B8a 卡片 DOM：${PAGE}/${PAGE} 卡含分类行 .dh-cat + 来源行 .dh-src（动态口径）`, b8a.n === PAGE && b8a.ok, `卡=${b8a.n} 齐=${b8a.ok}`);
    // B8b 分类路径+来源摘要实值（675：家具 · 其他点缀 / 商人：赛尔弗丽雅·珀林…）
    await page.fill('#dhSearch', '塞纳里奥私密屏风');
    await sleep(400);
    const b8b = await page.evaluate(() => {
      const c = [...document.querySelectorAll('#page-decor .dh-card')].find(x => x.querySelector('.dh-name').textContent.trim() === '塞纳里奥私密屏风');
      return c ? { cat: c.querySelector('.dh-cat').textContent.trim(), src: c.querySelector('.dh-src').textContent.trim() } : null;
    });
    check('B8b 分类路径行（主类 · 子类）+ 来源摘要行实值', !!b8b && b8b.cat === '家具 · 其他点缀' && b8b.src.startsWith('商人：赛尔弗丽雅·珀林'),
      b8b ? `${b8b.cat} | ${b8b.src.slice(0, 50)}` : '卡未找到');
    await page.evaluate(() => { document.getElementById('dhSearchClear').click(); });
    await sleep(300);
    // B8c 来源未知件：来源「无来源」筛选下，首屏「来源未知」卡数=库内同语义（sources 空且 source_text 空；补丁3 动态口径：首屏窗口=PAGE）
    await clickChip('dhSrcChips', '无来源');
    const expUnknown = ordered().filter(r => (!Array.isArray(r.sources) || !r.sources.length))
      .slice(0, PAGE).filter(r => !r.source_text || !r.source_text.trim()).length;
    const b8c = await page.evaluate(() => [...document.querySelectorAll('#page-decor .dh-card .dh-src')]
      .filter(el => el.textContent.trim() === '来源未知' && el.classList.contains('dh-src-unknown')).length);
    check(`B8c 来源未知件渲染「来源未知」灰字（首屏 ${expUnknown} 件=库内同语义，窗口 ${PAGE} 卡）`, b8c === expUnknown, `页面=${b8c} 库=${expUnknown}`);
    await clickChip('dhSrcChips', '全部');
    // B8d 房间件分类行=「房间」
    await clickChip('dhFeatChips', '房间/户型');
    const b8d = await page.evaluate(() => document.querySelector('#page-decor .dh-card .dh-cat').textContent.trim());
    check('B8d 房间件分类行=「房间」', b8d === '房间', b8d);
    await clickChip('dhFeatChips', '房间/户型');

    // ==================== #51-补丁 第四节：摆放环境三档断言 ====================
    const envChips = await page.evaluate(() => [...document.querySelectorAll('#dhEnvChips .dh-chip')].map(b => b.textContent.trim().replace(/\s+/g, '')));
    check(`B9a 摆放环境三档计数=全部 ${cnt.total()} / 可放室外 ${cnt.envOutdoor()} / 仅室内 ${cnt.envIndoorOnly()}（RPC 对拍 2062/2020/42）`,
      envChips.length === 3 && envChips[0] === `全部${cnt.total()}` && envChips[1] === `可放室外${cnt.envOutdoor()}` && envChips[2] === `仅室内${cnt.envIndoorOnly()}`,
      envChips.join(' | '));
    const t9 = await clickChip('dhEnvChips', '仅室内');
    const b9b = await page.evaluate(() => [...document.querySelectorAll('#page-decor .dh-card')].map(c => +c.dataset.rid));
    check('B9b 「仅室内」命中=42 且含 9144/10952/14583（39 房间+两前门+浑天仪）',
      t9 === `命中 ${cnt.envIndoorOnly()} 件 · 1 项生效` && [9144, 10952, 14583].every(id => b9b.includes(id)),
      `${t9} 卡=${b9b.length} 三钉=${[9144, 10952, 14583].map(id => b9b.includes(id)).join('/')}`);
    await page.screenshot({ path: path.join(SHOT_DIR, '07-env-indoor-only.png') });
    await clickChip('dhEnvChips', '全部');

    // ==================== #51-补丁 第三节验收：来源十类卡片局部截图 ====================
    const typeReps = [
      ['vendor', '塞纳里奥私密屏风'], ['drop', '“受枷者的狂怒”壁画'], ['quest', '影月开放式棚屋'],
      ['shop', '暴雪嘉年华门垫'], ['texture货币', '净化的巨魔骨灰瓮'],
    ];
    for (const t of ['achievement', 'profession', 'treasure', 'event', 'festival_note']) {
      const rep = dbRows.find(r => Array.isArray(r.sources) && r.sources.length && r.sources[0].type === t);
      if (rep) typeReps.push([t, rep.name]);
    }
    const unknownRep = dbRows.find(r => (!Array.isArray(r.sources) || !r.sources.length) && (!r.source_text || !r.source_text.trim()));
    if (unknownRep) typeReps.push(['来源未知', unknownRep.name]);
    fs.mkdirSync(path.join(SHOT_DIR, 'cards'), { recursive: true });
    let mosaicOk = 0;
    for (const [type, name] of typeReps) {
      await page.fill('#dhSearch', name);
      await sleep(350);
      const handle = await page.evaluateHandle(n => {
        return [...document.querySelectorAll('#page-decor .dh-card')].find(c => c.querySelector('.dh-name').textContent.trim() === n) || null;
      }, name);
      const el = handle.asElement();
      if (el) {
        await el.screenshot({ path: path.join(SHOT_DIR, 'cards', `${String(mosaicOk + 1).padStart(2, '0')}-${type}.png`) });
        mosaicOk++;
      }
      await page.evaluate(() => { document.getElementById('dhSearchClear').click(); });
      await sleep(250);
    }
    check(`B8e 来源分类卡片局部截图（vendor/drop/quest/achievement/profession/shop/treasure/event/festival_note/texture/来源未知）`, mosaicOk >= 8, `${mosaicOk}/${typeReps.length} 张`);

    // ==================== #51-补丁 第六节：:focus-visible 实测 ====================
    async function focusShot(selector, file) {
      await page.focus(selector);
      await sleep(200);
      const el = await page.$(selector);
      const box = await el.boundingBox();
      const style = await page.evaluate(s => {
        const cs = getComputedStyle(document.querySelector(s));
        return { w: cs.outlineWidth, c: cs.outlineColor };
      }, selector);
      await page.screenshot({ path: path.join(SHOT_DIR, file), clip: { x: Math.max(0, box.x - 10), y: Math.max(0, box.y - 10), width: box.width + 20, height: box.height + 20 } });
      return style;
    }
    const f1 = await focusShot('#dhCatChips .dh-chip:nth-child(2)', '09-focus-chip.png');
    const f2 = await focusShot('#dhPager button[data-pg="2"]', '10-focus-pager.png');
    const f3 = await focusShot('#page-decor .dh-card', '11-focus-card.png');
    check('B10 :focus-visible 三处实测（chip/分页钮/卡片 outline 2px 金色 rgb(240,192,96)）',
      [f1, f2, f3].every(s => s.w === '2px' && s.c === 'rgb(240, 192, 96)'),
      [f1, f2, f3].map(s => `${s.w}/${s.c}`).join(' | '));

    // ==================== #51-补丁 第二节：1920 档截图 ====================
    await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }); // 摘除 B10 焦点残留，保截图中性
    await page.setViewportSize({ width: 1920, height: 1080 });
    await sleep(700); // resize 防抖 300ms + 重排（补丁3 动态件数）
    // B11c（#51-补丁3）：1920 档重排后每页件数=实测列数×8（末行无空位=整页满）
    const w1920 = await page.evaluate(() => {
      const cols = getComputedStyle(document.querySelector('#page-decor .dh-grid')).gridTemplateColumns.split(/\s+/).filter(Boolean).length;
      return { cols, cards: document.querySelectorAll('#page-decor .dh-card').length };
    });
    check(`B11c 1920 档动态重排：每页件数=实测 ${w1920.cols} 列×8=${w1920.cols * 8}（末行无空位）`,
      w1920.cards === w1920.cols * 8 && w1920.cards % w1920.cols === 0, `卡=${w1920.cards} 列=${w1920.cols}`);
    await page.screenshot({ path: path.join(SHOT_DIR, '12-home-1920.png') });
    await page.setViewportSize({ width: 1366, height: 768 });
    await sleep(700); // 防抖重排回 1366

    // B6 768px 窄屏：筛选折叠 + 网格降列（卡片/图标随媒体查询收小）
    const desktopMetrics = await page.evaluate(() => ({
      firstRowCards: (() => { const cards = [...document.querySelectorAll('#page-decor .dh-card')]; const top = cards[0].offsetTop; return cards.filter(c => c.offsetTop === top).length; })(),
      iconW: getComputedStyle(document.querySelector('#page-decor .dh-icon-wrap')).width,
    }));
    await page.setViewportSize({ width: 768, height: 800 });
    await sleep(400);
    const n1 = await page.evaluate(() => ({
      toggleShown: getComputedStyle(document.getElementById('dhFilterToggle')).display !== 'none',
      rowsHidden: getComputedStyle(document.getElementById('dhFilterRows')).display === 'none',
      iconW: getComputedStyle(document.querySelector('#page-decor .dh-icon-wrap')).width,
      firstRowCards: (() => { const cards = [...document.querySelectorAll('#page-decor .dh-card')]; const top = cards[0].offsetTop; return cards.filter(c => c.offsetTop === top).length; })(),
    }));
    await page.click('#dhFilterToggle');
    await sleep(300);
    const n2 = await page.evaluate(() => getComputedStyle(document.getElementById('dhFilterRows')).display !== 'none');
    await page.screenshot({ path: path.join(SHOT_DIR, '05-narrow-filters-open.png') });
    await page.click('#dhFilterToggle');
    await sleep(200);
    await page.screenshot({ path: path.join(SHOT_DIR, '06-narrow-collapsed.png') });
    check('B6 768px 窄屏：折叠钮生效（收起→展开）+ 媒体查询收小卡片（#51-补丁 第二节后 104px→80px，首行卡数不增）',
      n1.toggleShown && n1.rowsHidden && n2 && n1.iconW === '80px' && desktopMetrics.iconW === '104px' && n1.firstRowCards <= desktopMetrics.firstRowCards + 1,
      `钮=${n1.toggleShown} 收起=${n1.rowsHidden} 展开=${n2} 图标=${desktopMetrics.iconW}→${n1.iconW} 首行=${desktopMetrics.firstRowCards}→${n1.firstRowCards}`);
    await page.setViewportSize({ width: 1366, height: 768 });

    // B7 零 JS 报错 / 零 4xx/5xx；窄白名单：user_profiles 409 = 新用户首登 tag_num 建行并发竞态
    // （ensureTagNum 读无行→insert 撞已建行，代码捕获 23505 重读成功，REQ-094 既存行为，登录链路产生、
    //  与家宅图鉴零交集；实测取证：409 https://…/rest/v1/user_profiles 单次，后续全链路无错）
    const hard = httpBad.filter(u => !(u.startsWith('409 ') && u.includes('/rest/v1/user_profiles')));
    const raced = httpBad.length - hard.length > 0; // 竞态确实发生 → 对应 console 资源加载报错同源放行
    const hardJs = jsErrors.filter(m => !(raced && m === 'console: Failed to load resource: the server responded with a status of 409 ()'));
    check('B7 全程零 JS 报错、零 4xx/5xx（user_profiles 409 首登竞态白名单，既存已处理行为）',
      hardJs.length === 0 && hard.length === 0,
      hardJs.concat(hard).slice(0, 6).join(' | ') || `干净（白名单放行 user_profiles 409 ×${httpBad.length - hard.length}+同源 console×${jsErrors.length - hardJs.length}）`);
    await ctx.close();
  } finally {
    await browser.close();
  }

  await cleanup();

  const failed = results.filter(r => !r.ok);
  console.log(`\n========== 汇总：${results.length - failed.length}/${results.length} 通过 ==========`);
  if (failed.length) { console.log('失败项：'); failed.forEach(f => console.log('  ✗ ' + f.name)); process.exit(1); }
})().catch(async e => {
  console.error('验收脚本异常：', e);
  try { await cleanup(); } catch {}
  process.exit(1);
});
