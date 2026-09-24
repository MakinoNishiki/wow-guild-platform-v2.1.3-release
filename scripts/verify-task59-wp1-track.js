// 任务书 #59 WP1 验收补丁：tab_click 入库实证（独立重跑——主跑全量事件撞 /api/track 60次/分/IP 限流窗口，
// 重启服务清零窗口后单跑本项）+ 404 资源 URL 取证（确认噪音性质）
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const BASE = 'http://127.0.0.1:18659';
const VID = 'wp1-verify-tab2-' + Date.now();

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB_URL = env.SUPABASE_URL.replace(/\/+$/, '');
const SVC = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await ctx.addInitScript(v => { try { localStorage.setItem('wb_vid', v); } catch (e) {} }, VID);
  const page = await ctx.newPage();
  const notFound = [];
  page.on('response', r => { if (r.status() === 404) notFound.push(r.url()); });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => location.hash === '#/home', null, { timeout: 10000 });
  await page.waitForSelector('#iaTopbar');
  await page.click('button[data-ia-tab="house"]'); // L1 house
  await sleep(400);
  await page.click('button[data-ia-key="decor"]'); // L2 decor
  await sleep(400);
  await page.click('button[data-ia-tab="team"]'); // L1 team
  await sleep(400);
  await page.click('button[data-ia-key="members"]'); // L2 members（守卫落引导卡也发）
  await sleep(3000);

  const r = await fetch(`${SB_URL}/rest/v1/analytics_events?vid=eq.${VID}&select=event,page,props&order=created_at.asc`, { headers: SVC });
  const rows = await r.json();
  const tabRows = (Array.isArray(rows) ? rows : []).filter(x => x.event === 'tab_click');
  const pvRows = (Array.isArray(rows) ? rows : []).filter(x => x.event === 'page_view');
  const combos = new Set(tabRows.map(x => `L${x.props && x.props.level}:${x.props && x.props.key}`));
  const need = ['L1:team', 'L1:house', 'L2:decor', 'L2:members'];
  console.log(`vid=${VID}`);
  console.log(`tab_click 行数=${tabRows.length}（需求 ≥4）: ${[...combos].join(' | ')}`);
  console.log(`page_view 行数=${pvRows.length}: ${pvRows.map(x => x.page).join(' | ')}`);
  console.log(`四组合覆盖: ${need.map(n => `${n}=${combos.has(n) ? '✓' : '✗'}`).join(' ')}`);
  const pass = tabRows.length >= 4 && need.every(n => combos.has(n));

  // 清理本 vid 全部行
  const d = await fetch(`${SB_URL}/rest/v1/analytics_events?vid=eq.${VID}`, { method: 'DELETE', headers: SVC });
  const chk = await fetch(`${SB_URL}/rest/v1/analytics_events?vid=eq.${VID}&select=id`, { headers: SVC });
  const left = await chk.json();
  console.log(`清理: DELETE status=${d.status}, 剩余=${Array.isArray(left) ? left.length : '?'}（删除行数=${Array.isArray(rows) ? rows.length : 0}）`);

  // 404 取证：统计 URL 分布
  const counts = {};
  notFound.forEach(u => { const k = u.replace(/^https?:\/\/[^/]+/, ''); counts[k] = (counts[k] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log(`\n404 资源共 ${notFound.length} 个，去重路径 Top12:`);
  top.forEach(([u, n]) => console.log(`  ${n}× ${u}`));

  await browser.close();
  process.exit(pass && Array.isArray(left) && left.length === 0 ? 0 : 1);
})().catch(e => { console.error('异常:', e); process.exit(2); });
