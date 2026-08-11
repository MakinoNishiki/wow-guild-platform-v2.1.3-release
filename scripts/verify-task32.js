// 任务书 #32 验证（REQ-100：仪表盘「最近活动」状态徽标 + 只读预览跳转考勤）：
//   A. F1 状态徽标（§2 生效值断言：徽标 computed 色值、灰化条目 computed opacity/filter，非类名断言）；
//   B. 删除联动：UI 主链路删除活动 → dashboard 条目消失 → F5 不残留；
//   C. F2 只读预览跳转：点击条目 → 考勤 tab 列表视图定位高亮（§3 出现-消退双向连帧 rAF 采样）、
//      已取消条目跳转（当次含已取消+清筛选）、真删除 toast、视图偏好记忆键零改动、成功跳转无 toast；
//   D. 测试数据（T32A 前缀）自清理并复核为零。
// 红线：只动显示层与跳转的验证；不改业务代码；不 git 操作。
// 用法: node scripts/verify-task32.js（PW_CHANNEL=chrome 可选）｜ 截图 → backup/2026-08-11-task32/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(__dirname, '..', '.s6-ssh', 'node_modules', 'playwright-core'))); }

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-11-task32');
const PORT = 15663;
const BASE = `http://localhost:${PORT}`;
const EMAIL = 't32a-main@wowbutler.cn';
const PWD = 'T32abcd12';

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
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
  const t = await res.text(); try { return { status: res.status, body: JSON.parse(t) }; } catch { return { status: res.status, body: t }; }
}
const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

let serverProc = null, uid = null, guildId = null;
let actNormal = null, actCancelled = null, actDelete = null; // §4 三态样本

async function cleanup() {
  const steps = [];
  if (guildId) {
    const acts = await svc('GET', `/rest/v1/activities?select=id&guild_id=eq.${guildId}`);
    for (const a of (acts.body || [])) await svc('DELETE', `/rest/v1/activity_attendance?activity_id=eq.${a.id}`);
    await svc('DELETE', `/rest/v1/activities?guild_id=eq.${guildId}`);
    await svc('DELETE', `/rest/v1/guild_members?guild_id=eq.${guildId}`);
    steps.push('guild-data:ok');
  }
  await svc('DELETE', '/rest/v1/guilds?name=like.T32A*');
  if (uid) {
    await svc('DELETE', `/rest/v1/user_profiles?user_id=eq.${uid}`);
    try { await fetch(`${SB}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); }
  }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const counts = [];
  const c1 = await svc('GET', '/rest/v1/guilds?select=id&name=like.T32A*');
  counts.push(['guilds', Array.isArray(c1.body) ? c1.body.length : '?']);
  const c2 = guildId ? await svc('GET', `/rest/v1/activities?select=id&guild_id=eq.${guildId}`) : { body: [] };
  counts.push(['activities', Array.isArray(c2.body) ? c2.body.length : '?']);
  if (uid) {
    const cp = await svc('GET', `/rest/v1/user_profiles?select=user_id&user_id=eq.${uid}`);
    const profN = Array.isArray(cp.body) ? cp.body.length : '?';
    const r = await fetch(`${SB}/auth/v1/admin/users/${uid}`, { headers: SVC });
    const gone = r.status === 404;
    counts.push([`user(profiles=${profN},auth ${gone ? 0 : '在'})`, profN === 0 && gone ? 0 : 1]);
  }
  console.log('[清理复核] ' + counts.map(([l, n]) => `${l}=${n}`).join(' | '));
  check('测试数据清零复核（全 0）', counts.every(([, n]) => n === 0), counts.map(([, n]) => n).join('/'));
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  // 预清理
  const r0 = await fetch(`${SB}/auth/v1/admin/users?page=1&per_page=200`, { headers: SVC });
  const b0 = await r0.json().catch(() => ({}));
  for (const u of (b0.users || [])) if ((u.email || '').startsWith('t32a-')) await fetch(`${SB}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: SVC });
  await svc('DELETE', '/rest/v1/guilds?name=like.T32A*');

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r2 = await fetch(`${BASE}/api/supabase-config`); if (r2.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }

  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const pageErrors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => pageErrors.push('pageerror: ' + e.message));
    page.on('console', msg => { if (msg.type() === 'error') pageErrors.push('console: ' + msg.text()); });
    page.on('dialog', d => d.accept());

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });

    // CSS 变量解析基准
    const COLORS = await page.evaluate(() => {
      const out = {};
      for (const v of ['--danger', '--success', '--gold']) {
        const d = document.createElement('div');
        d.style.color = `var(${v})`;
        document.body.appendChild(d);
        out[v] = getComputedStyle(d).color;
        d.remove();
      }
      return out;
    });

    // UI 注册 + 建会
    await page.evaluate(() => showRegisterForm());
    await sleep(300);
    await page.fill('#regDisplayName', 'T32A验收');
    await page.fill('#regEmail', EMAIL);
    await page.fill('#regPassword', PWD);
    await page.click('#authRegisterBtn');
    await page.waitForSelector('#authGuildForm', { state: 'visible', timeout: 20000 });
    await page.fill('#newGuildName', 'T32A公会');
    await page.click('button[onclick="handleCreateGuild()"]');
    await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
    await sleep(2000);
    uid = await page.evaluate(() => window.CloudSync.getCachedUser().id);
    const g = await svc('GET', '/rest/v1/guilds?select=id&name=eq.T32A公会');
    guildId = g.body[0].id;
    check('C0 UI 注册+创建公会进应用（主链路）', !!uid && !!guildId, `uid=${uid}`);

    // §4 三态样本：正常（今日）/ 已取消（昨日）/ 待删除（今日）各 1
    const today = new Date(); const yest = new Date(Date.now() - 86400000);
    const ins = await svc('POST', '/rest/v1/activities?select=id', [
      { guild_id: guildId, name: 'T32A正常活动', activity_date: fmt(today), raid: '虚影尖塔', start_time: '20:00', end_time: '23:00', status: 'normal' },
      { guild_id: guildId, name: 'T32A取消活动', activity_date: fmt(yest), raid: '梦境裂隙', start_time: '20:00', end_time: '23:00', status: 'cancelled' },
      { guild_id: guildId, name: 'T32A待删活动', activity_date: fmt(today), raid: '进军奎尔丹纳斯', start_time: '21:00', end_time: '23:00', status: 'normal' },
    ]);
    actNormal = ins.body[0].id; actCancelled = ins.body[1].id; actDelete = ins.body[2].id;
    check('C0 三态样本插入（正常/已取消/待删除 各 1）', ins.status === 201 && !!actNormal && !!actCancelled && !!actDelete, `status=${ins.status}`);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
    await sleep(2500);

    // ==================== A. F1 状态徽标（§2 生效值断言） ====================
    const itemState = (raid) => page.evaluate((raidName) => {
      const el = [...document.querySelectorAll('#recentList .recent-item')].find(e => e.textContent.includes(raidName));
      if (!el) return null;
      const tag = el.querySelector('.tag');
      const cs = getComputedStyle(el);
      const ts = tag ? getComputedStyle(tag) : null;
      return {
        onclick: el.getAttribute('onclick') || '',
        innerBtns: el.querySelectorAll('button, a').length,
        tagText: tag ? tag.textContent : '',
        tagColor: ts ? ts.color : '',
        tagBg: ts ? ts.backgroundColor : '',
        opacity: cs.opacity,
        filter: cs.filter,
      };
    }, raid);

    const a1 = await itemState('虚影尖塔');
    check('A1 正常条目：「正常」徽标 tag-green computed 色 + 条目无灰化',
      a1 && a1.tagText === '正常' && a1.tagColor === COLORS['--success'] && a1.opacity === '1' && (a1.filter === 'none' || a1.filter === ''),
      JSON.stringify(a1));
    const a2 = await itemState('梦境裂隙');
    check('A2 已取消条目：「已取消」徽标实色高对比（bg=--danger/白字）+ 条目灰化降饱和（opacity .55 + saturate(.5)）',
      a2 && a2.tagText === '已取消' && a2.tagBg === COLORS['--danger'].replace('rgb(', 'rgb(') && a2.tagColor === 'rgb(255, 255, 255)'
        && a2.opacity === '0.55' && a2.filter.includes('saturate'),
      JSON.stringify(a2));
    check('A3 只读预览：条目内零按钮/零链接，onclick = gotoActivityInAttendance（不再 openAttendanceDetail）',
      a1 && a2 && a1.innerBtns === 0 && a2.innerBtns === 0
        && a1.onclick.includes('gotoActivityInAttendance') && !a1.onclick.includes('openAttendanceDetail'),
      `btns=${a1 && a1.innerBtns} onclick=${a1 && a1.onclick}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'a-dashboard-badges.png') });

    // ==================== B. 删除联动（UI 主链路删除 → dashboard 消失 → F5 不残留） ====================
    await page.evaluate(() => switchPage('attendance'));
    await sleep(1000);
    await page.evaluate((id) => openAttendanceDetail(id), actDelete);
    await sleep(800);
    await page.click('#activityDeleteBtn'); // confirm 由 dialog 监听自动 accept
    try {
      await page.waitForFunction(() => [...document.querySelectorAll('#toastContainer .toast')].some(t => t.textContent.includes('活动已删除')), undefined, { timeout: 30000, polling: 500 });
    } catch (e) { /* 断言兜底 */ }
    await page.evaluate(() => switchPage('dashboard'));
    await sleep(800);
    const b1 = await page.evaluate(() => document.getElementById('recentList').textContent);
    check('B1 删除活动（UI 主链路）→ dashboard 条目联动消失', !b1.includes('进军奎尔丹纳斯') && b1.includes('虚影尖塔') && b1.includes('梦境裂隙'), b1.replace(/\s+/g, ' ').slice(0, 80));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
    await sleep(2500);
    const b2 = await page.evaluate(() => document.getElementById('recentList').textContent);
    check('B2 F5 后不残留', !b2.includes('进军奎尔丹纳斯'), b2.replace(/\s+/g, ' ').slice(0, 80));
    const b3 = await svc('GET', `/rest/v1/activities?select=id&id=eq.${actDelete}`);
    check('B3 DB 侧活动确已删除（0 行）', Array.isArray(b3.body) && b3.body.length === 0, JSON.stringify(b3.body));

    // ==================== C. F2 跳转定位高亮 ====================
    // 预置：视图偏好记忆 = 日历（验证决策②：当次强制列表但不落记忆键）
    const viewKey = await page.evaluate(() => getAttendanceViewStorageKey());
    await page.evaluate((k) => localStorage.setItem(k, 'calendar'), viewKey);

    // C1 点击正常条目 → 考勤 tab + 当次列表视图 + 定位高亮 + 无 toast + 筛选态当次复位
    const toastCount0 = await page.evaluate(() => document.querySelectorAll('#toastContainer .toast').length);
    await page.evaluate((id) => gotoActivityInAttendance(id), actNormal);
    await sleep(1200); // smooth scroll 就位
    const c1 = await page.evaluate((id) => {
      const card = document.querySelector(`#activityList .activity-item[data-activity-id="${id}"]`);
      const rect = card ? card.getBoundingClientRect() : null;
      return {
        pageActive: document.getElementById('page-attendance').classList.contains('active'),
        listVisible: document.getElementById('listView').style.display === 'block',
        calHidden: document.getElementById('calendarView').style.display === 'none',
        cardFound: !!card,
        highlighted: card ? card.classList.contains('activity-jump-highlight') : false,
        inViewport: rect ? (rect.top >= 0 && rect.top < window.innerHeight) : false,
        includeCancelledOn: document.getElementById('attFilterIncludeCancelled').checked,
        rangeAll: document.getElementById('attFilterRange').value === 'all',
        memberCleared: document.getElementById('attFilterMember').value === '',
        toastCount: document.querySelectorAll('#toastContainer .toast').length,
      };
    }, actNormal);
    check('C1 点击正常条目 → 考勤 tab 列表视图定位高亮（视口内）+ 当次筛选复位（含已取消勾选）',
      c1.pageActive && c1.listVisible && c1.calHidden && c1.cardFound && c1.highlighted && c1.inViewport
        && c1.includeCancelledOn && c1.rangeAll && c1.memberCleared,
      JSON.stringify(c1));
    check('C1b 跳转成功零 toast', c1.toastCount === toastCount0, `toasts ${toastCount0}→${c1.toastCount}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'c1-jump-highlight.png') });

    // C2 §3 高亮出现-消退双向连帧（rAF 全程采样 boxShadow 计算值）
    await sleep(1200); // 等 C1 高亮消退干净
    const frames = await page.evaluate((id) => new Promise(res => {
      gotoActivityInAttendance(id);
      const el = document.querySelector(`#activityList .activity-item[data-activity-id="${id}"]`);
      const samples = [];
      const t0 = performance.now();
      function tick() {
        samples.push([Math.round(performance.now() - t0), getComputedStyle(el).boxShadow]);
        if (performance.now() - t0 < 2400) requestAnimationFrame(tick); else res(samples);
      }
      requestAnimationFrame(tick);
    }), actNormal);
    const full = frames.find(([, v]) => v.includes('rgba(240, 192, 96'));
    const appearFrames = frames.filter(([t]) => t < 300).map(([, v]) => v);
    const fadeFrames = frames.filter(([t]) => t >= 1800).map(([, v]) => v);
    const appearDistinct = new Set(appearFrames).size;
    const fadeDistinct = new Set(fadeFrames).size;
    const appearOk = appearFrames.length >= 3 && appearDistinct >= 3 && appearFrames.some(v => v.includes('rgba(240, 192, 96')) && appearFrames[0] !== appearFrames[appearFrames.length - 1];
    const fadeOk = fadeFrames.length >= 3 && fadeDistinct >= 3 && fadeFrames[fadeFrames.length - 1] === 'none' && fadeFrames[0] !== 'none';
    check('C2 §3 双向连帧：出现期逐帧过渡到金色描影、消退期逐帧回落 none（rAF 采样计算值）',
      !!full && appearOk && fadeOk,
      `出现帧=${appearFrames.length}/distinct=${appearDistinct} 消退帧=${fadeFrames.length}/distinct=${fadeDistinct} 末帧=${fadeFrames[fadeFrames.length - 1]}`);

    // C3 点击已取消条目 → 当次含已取消已勾选 → 卡片找得到并高亮；零 toast
    const toastCount1 = await page.evaluate(() => document.querySelectorAll('#toastContainer .toast').length);
    await page.evaluate((id) => gotoActivityInAttendance(id), actCancelled);
    await sleep(1000);
    const c3 = await page.evaluate((id) => {
      const card = document.querySelector(`#activityList .activity-item[data-activity-id="${id}"]`);
      return {
        cardFound: !!card,
        highlighted: card ? card.classList.contains('activity-jump-highlight') : false,
        cancelledStyle: card ? card.classList.contains('activity-cancelled') : false,
        toastCount: document.querySelectorAll('#toastContainer .toast').length,
      };
    }, actCancelled);
    check('C3 点击已取消条目 → 定位高亮（列表灰化样式在）+ 零 toast',
      c3.cardFound && c3.highlighted && c3.cancelledStyle && c3.toastCount === toastCount1, JSON.stringify(c3));
    await page.screenshot({ path: path.join(SHOT_DIR, 'c3-jump-cancelled.png') });

    // C4 真删除场景（B 组已删的 actDelete）→ 落 tab 顶部 + toast「该活动已被删除」
    await page.evaluate((id) => gotoActivityInAttendance(id), actDelete);
    await sleep(600);
    const c4 = await page.evaluate(() => ({
      pageActive: document.getElementById('page-attendance').classList.contains('active'),
      scrollTop: document.getElementById('mainContent').scrollTop,
      toast: [...document.querySelectorAll('#toastContainer .toast')].map(t => t.textContent).join('|'),
    }));
    check('C4 已删除活动 → 落考勤 tab 顶部 + toast「该活动已被删除」（严格限定真不存在）',
      c4.pageActive && c4.scrollTop === 0 && c4.toast.includes('该活动已被删除'), JSON.stringify(c4));

    // C5 视图偏好记忆键零改动 + 用户手动切日历行为如常
    const c5a = await page.evaluate((k) => localStorage.getItem(k), viewKey);
    await page.evaluate(() => switchAttendanceView('calendar'));
    await sleep(600);
    const c5b = await page.evaluate((k) => ({
      calVisible: document.getElementById('calendarView').style.display === 'block',
      listHidden: document.getElementById('listView').style.display === 'none',
      key: localStorage.getItem(k),
    }), viewKey);
    check('C5 BUG-023 记忆键零改动（仍 calendar）+ 手动切日历视图行为与现状一致',
      c5a === 'calendar' && c5b.calVisible && c5b.listHidden && c5b.key === 'calendar',
      `跳转后键=${c5a} 手动切换=${JSON.stringify(c5b)}`);

    // 零 JS 报错（406=既有噪音）
    const realErrors = pageErrors.filter(e => !/status of (400|401|406|409)/.test(e));
    check('全程零 JS 报错（406=既有噪音已排除）', realErrors.length === 0, realErrors.join(' | ') || '无');
    await ctx.close();
  } finally {
    await browser.close();
  }

  await cleanup();

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#32 验证: ${passed}/${results.length} 通过，截图 → ${SHOT_DIR} =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
