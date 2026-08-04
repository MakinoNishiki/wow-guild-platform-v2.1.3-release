// 任务书 #19 WP2 验证：toast 改版（顶部居中/不透明/不遮挡/自动消失）+ 认领即时反馈
// 用法: node scripts/verify-toast-redesign.js   （前置：npm i playwright，浏览器缓存已就绪）
// 取证截图输出到 backup/2026-08-04-task19-wp2/（1366×768 与 1920×1080 两宽度）
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-04-task19-wp2');
const PORT = 15643;
const BASE = `http://localhost:${PORT}`;
const PWD = 'Wp19t-Test-2026!';
const EMAIL = 'wp19t-owner@wowbutler.cn';

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const ANON = env.SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
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

let serverProc = null;
let testUid = null, testGuildId = null;

async function setup() {
  let res = await fetch(`${SB}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PWD, data: { display_name: 'WP19T' } }),
  });
  let body = await res.json();
  if (!body.access_token) {
    res = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PWD }),
    });
    body = await res.json();
    if (!body.access_token) throw new Error('登录失败: ' + JSON.stringify(body));
  }
  testUid = body.user.id;
  const g = await svc('POST', '/rest/v1/guilds', { name: 'WP19T验收会', owner_id: testUid, invite_code: 'W19T' + Date.now().toString(36).slice(-4).toUpperCase() });
  if (g.status !== 201) throw new Error('建会失败: ' + JSON.stringify(g.body));
  testGuildId = g.body[0].id;
  const gm = await svc('POST', '/rest/v1/guild_members', { guild_id: testGuildId, user_id: testUid, role: 'owner', display_name: 'WP19T' });
  if (gm.status !== 201) throw new Error('入会失败: ' + JSON.stringify(gm.body));
  const m = await svc('POST', '/rest/v1/raid_members', { guild_id: testGuildId, name: 'WP19T甲', class: '战士', status: '正式', user_id: null });
  if (m.status !== 201) throw new Error('建成员失败');

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }
}

async function cleanup() {
  const steps = [];
  try { const r = await svc('DELETE', `/rest/v1/raid_members?guild_id=eq.${testGuildId}`); steps.push(`raid_members:${r.status}`); } catch { steps.push('raid_members:ERR'); }
  try { const r = await svc('DELETE', `/rest/v1/guilds?id=eq.${testGuildId}`); steps.push(`guilds:${r.status}`); } catch { steps.push('guilds:ERR'); }
  try { if (testUid) await fetch(`${SB}/auth/v1/admin/users/${testUid}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const chk1 = await svc('GET', `/rest/v1/guilds?id=eq.${testGuildId}&select=id`);
  console.log(`[清理复核] guilds 剩余=${Array.isArray(chk1.body) ? chk1.body.length : '?'}`);
}

// 读取 toast 几何与样式
async function toastProbe(page) {
  return page.evaluate(() => {
    const toasts = [...document.querySelectorAll('#toastContainer .toast')];
    const menu = document.getElementById('userMenu');
    const menuRect = menu ? menu.getBoundingClientRect() : null;
    const createBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('创建活动'));
    const createRect = createBtn ? createBtn.getBoundingClientRect() : null;
    const overlap = (a, b) => a && b && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
    return {
      vw: window.innerWidth,
      count: toasts.length,
      toasts: toasts.map(t => {
        const r = t.getBoundingClientRect();
        const cs = getComputedStyle(t);
        return {
          text: t.textContent.slice(0, 30),
          cx: r.left + r.width / 2, top: r.top, bottom: r.bottom, left: r.left, right: r.right,
          bg: cs.backgroundColor,
          overlapsMenu: overlap(r, menuRect),
          overlapsCreateBtn: overlap(r, createRect),
        };
      }),
    };
  });
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await setup();
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const pageErrors = [];
  try {
    for (const vw of [1366, 1920]) {
      const ctx = await browser.newContext({ viewport: { width: vw, height: vw === 1366 ? 768 : 1080 } });
      const page = await ctx.newPage();
      page.on('pageerror', e => pageErrors.push('pageerror: ' + e.message));
      page.on('console', msg => { if (msg.type() === 'error') pageErrors.push('console: ' + msg.text()); });
      page.on('dialog', d => d.accept());

      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
      await page.fill('#authEmail', EMAIL);
      await page.fill('#authPassword', PWD);
      await page.click('#authLoginBtn');
      await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
      await sleep(2000);

      // ---------- 成功 toast：添加成员 ----------
      await page.click('.nav-item[data-page="members"]');
      await sleep(800);
      await page.click('button:has-text("+ 添加成员")');
      await page.waitForSelector('#memberModal.show', { timeout: 10000 });
      await page.fill('#memberName', `T${vw}成功`);
      await page.selectOption('#memberClass', '法师');
      await page.click('#memberSaveBtn');
      await page.waitForSelector('#toastContainer .toast', { timeout: 15000 });
      await sleep(300);
      let probe = await toastProbe(page);
      const t0 = probe.toasts[0] || {};
      check(`${vw} A1. 成功 toast 顶部居中`, Math.abs(t0.cx - vw / 2) < 80 && t0.top >= 0 && t0.top <= 60,
        `cx=${Math.round(t0.cx)} 期望≈${vw / 2} top=${Math.round(t0.top)}`);
      check(`${vw} A2. toast 背景不透明`, /^rgb\(/.test(t0.bg || ''), `bg=${t0.bg}`);
      check(`${vw} A3. 不遮挡用户面板与主按钮`, !t0.overlapsMenu && t0.overlapsCreateBtn === false, `menu=${t0.overlapsMenu} create=${t0.overlapsCreateBtn}`);
      await page.screenshot({ path: path.join(SHOT_DIR, `${vw}-success-toast.png`) });

      // ---------- 失败 toast + 多条堆叠 ----------
      await page.evaluate(() => { showToast('WP19失败样例：保存失败: 测试错误', 'error'); });
      await sleep(300);
      probe = await toastProbe(page);
      const rectsOverlap = probe.toasts.length >= 2 && (() => {
        const [a, b] = probe.toasts;
        return !(a.bottom <= b.top || b.bottom <= a.top);
      })();
      check(`${vw} B1. 失败 toast 出现且多条堆叠不重叠`, probe.count >= 2 && !rectsOverlap, `count=${probe.count}`);
      await page.screenshot({ path: path.join(SHOT_DIR, `${vw}-stacked-toasts.png`) });

      // ---------- 自动消失 ----------
      await sleep(3500);
      const left = await page.evaluate(() => document.querySelectorAll('#toastContainer .toast').length);
      check(`${vw} C1. toast 自动消失`, left === 0, `剩余=${left}`);

      // ---------- 认领即时反馈 ----------
      await page.evaluate(() => {
        const rows = [...document.querySelectorAll('#membersTableBody tr')];
        const row = rows.find(r => r.textContent.includes('WP19T甲'));
        const btn = row && [...row.querySelectorAll('.claim-btns button')].find(b => b.title === '认领为我的角色');
        if (btn) btn.click();
      });
      await page.waitForSelector('#toastContainer .toast', { timeout: 15000 });
      await sleep(1600);
      const fb = await page.evaluate(() => {
        const toast = [...document.querySelectorAll('#toastContainer .toast')].map(t => t.textContent).join('|');
        const rows = [...document.querySelectorAll('#membersTableBody tr')];
        const row = rows.find(r => r.textContent.includes('WP19T甲'));
        const hasUnclaim = row && [...row.querySelectorAll('.claim-btns button')].some(b => b.title === '解除认领');
        return { toast, hasUnclaim };
      });
      check(`${vw} D1. 认领成功 toast「已认领：WP19T甲」`, fb.toast.includes('已认领：WP19T甲'), fb.toast);
      check(`${vw} D2. 成员行认领状态立即就地更新（出现解除认领）`, fb.hasUnclaim === true);
      await page.screenshot({ path: path.join(SHOT_DIR, `${vw}-claim-feedback.png`) });

      // 解绑复位（供下一宽度用例复用）
      await page.evaluate(() => {
        const rows = [...document.querySelectorAll('#membersTableBody tr')];
        const row = rows.find(r => r.textContent.includes('WP19T甲'));
        const btn = row && [...row.querySelectorAll('.claim-btns button')].find(b => b.title === '解除认领');
        if (btn) btn.click();
      });
      await sleep(2500);
      await ctx.close();
    }

    const realErrors = pageErrors.filter(e => !e.includes('status of 406'));
    check('Z. 两宽度全程零 JS 错误（406=既有用户资料空行噪音，已排除）', realErrors.length === 0, realErrors.join(' | ') || '无');
  } finally {
    await browser.close();
    await cleanup();
  }

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#19 WP2 验证: ${passed}/${results.length} 通过 =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
