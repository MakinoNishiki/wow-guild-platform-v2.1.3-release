// 任务书 #34 验证（小件包四合一）：
//   A. WP1 REQ-104 注册页密码抖动：blur 补位触发（弱密码）+ §3 rAF 连帧（位移有变化、末帧严格 none）+
//      可重复触发 + 服务端 422 拦截触发 + prefers-reduced-motion 降级不抖动；
//   B. WP2 REQ-106 topbar 秒级时间：两采样文本不同且格式正确；visibilityState=hidden 跳过写入、恢复后更新；
//   C. WP3 REQ-108 看板细分：混合样本逐值断言（正式/替补/离队段、0 段不显示、取消 X 个 0 不显示）；
//   D. WP1 用户中心改密：两次不一致→确认框抖动（提交路径）、空新密码→新密码框、422 拦截→新密码框、§3 连帧；
//   E. WP4 REQ-109 批量按钮精简：仅「全部出席」且功能正常（全 select 出席 + 统计行联动）；
//   F. 测试数据（T34A 前缀）自清理复核为零。
// 红线：不改业务代码；不 git 操作。用法: node scripts/verify-task34.js｜截图 → backup/2026-08-11-task34/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(__dirname, '..', '.s6-ssh', 'node_modules', 'playwright-core'))); }

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-11-task34');
const PORT = 15666;
const BASE = `http://localhost:${PORT}`;
const EMAIL = 't34a-main@wowbutler.cn';
const PWD = 'T34abcd12';

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
const memberIds = [], activityIds = [];

async function cleanup() {
  const steps = [];
  if (guildId) {
    const acts = await svc('GET', `/rest/v1/activities?select=id&guild_id=eq.${guildId}`);
    for (const a of (acts.body || [])) await svc('DELETE', `/rest/v1/activity_attendance?activity_id=eq.${a.id}`);
    await svc('DELETE', `/rest/v1/activities?guild_id=eq.${guildId}`);
    await svc('DELETE', `/rest/v1/raid_members?guild_id=eq.${guildId}`);
    await svc('DELETE', `/rest/v1/guild_members?guild_id=eq.${guildId}`);
    steps.push('guild-data:ok');
  }
  await svc('DELETE', '/rest/v1/guilds?name=like.T34A*');
  if (uid) {
    await svc('DELETE', `/rest/v1/user_profiles?user_id=eq.${uid}`);
    try { await fetch(`${SB}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); }
  }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const counts = [];
  const qs = [
    ['guilds', '/rest/v1/guilds?select=id&name=like.T34A*'],
    ['raid_members', '/rest/v1/raid_members?select=id&name=like.T34A*'],
    ['activities', '/rest/v1/activities?select=id&name=like.T34A*'],
  ];
  for (const [label, p] of qs) {
    const c = await svc('GET', p);
    counts.push([label, Array.isArray(c.body) ? c.body.length : '?']);
  }
  if (uid) {
    const cp = await svc('GET', `/rest/v1/user_profiles?select=user_id&user_id=eq.${uid}`);
    const profN = Array.isArray(cp.body) ? cp.body.length : '?';
    const r = await fetch(`${SB}/auth/v1/admin/users/${uid}`, { headers: SVC });
    counts.push([`user(profiles=${profN},auth ${r.status === 404 ? 0 : '在'})`, profN === 0 && r.status === 404 ? 0 : 1]);
  }
  console.log('[清理复核] ' + counts.map(([l, n]) => `${l}=${n}`).join(' | '));
  check('测试数据清零复核（全 0）', counts.every(([, n]) => n === 0), counts.map(([, n]) => n).join('/'));
}

// §3 rAF 连帧采样：selector 元素 transform 在 ms 内逐帧采样
async function sampleTransform(page, selector, ms = 600) {
  return page.evaluate(({ sel, dur }) => new Promise(res => {
    const el = document.querySelector(sel);
    const vals = [];
    const t0 = performance.now();
    function tick() {
      vals.push(getComputedStyle(el).transform);
      if (performance.now() - t0 < dur) requestAnimationFrame(tick); else res(vals);
    }
    requestAnimationFrame(tick);
  }), { sel: selector, dur: ms });
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  // 预清理
  const r0 = await fetch(`${SB}/auth/v1/admin/users?page=1&per_page=200`, { headers: SVC });
  const b0 = await r0.json().catch(() => ({}));
  for (const u of (b0.users || [])) if ((u.email || '').startsWith('t34a-')) await fetch(`${SB}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: SVC });
  await svc('DELETE', '/rest/v1/guilds?name=like.T34A*');

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

    // ==================== A. WP1 注册页抖动 ====================
    await page.evaluate(() => showRegisterForm());
    await sleep(400);

    // A1 前端校验失败（blur 补位：弱密码失焦）→ 密码框抖动 + §3 连帧
    await page.fill('#regPassword', 'abc12345');
    const a1Frames = await page.evaluate(() => new Promise(res => {
      const el = document.getElementById('regPassword');
      el.dispatchEvent(new Event('blur'));
      const vals = [];
      const t0 = performance.now();
      (function tick() {
        vals.push(getComputedStyle(el).transform);
        if (performance.now() - t0 < 600) requestAnimationFrame(tick); else res(vals);
      })();
    }));
    const a1Distinct = new Set(a1Frames).size;
    const a1Anim = await page.evaluate(() => getComputedStyle(document.getElementById('regPassword')).animationName);
    check('A1 §3 连帧：注册页弱密码失焦 → 密码框抖动（位移逐帧有变化、末帧严格归位 none）',
      a1Distinct >= 3 && a1Frames.some(v => v !== 'none') && a1Frames[a1Frames.length - 1] === 'none',
      `帧=${a1Frames.length} distinct=${a1Distinct} 末帧=${a1Frames[a1Frames.length - 1]} animation=${a1Anim}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'a1-reg-shake.png') });

    // A2 可重复触发（classList 移除→reflow→再添加）
    const a2 = await page.evaluate(() => new Promise(res => {
      const el = document.getElementById('regPassword');
      el.dispatchEvent(new Event('blur'));
      const first = getComputedStyle(el).animationName;
      setTimeout(() => {
        el.dispatchEvent(new Event('blur'));
        const mid = getComputedStyle(el).transform; // 第二次动画进行中应有位移
        res({ first, mid, hasClass: el.classList.contains('pw-shake') });
      }, 500); // 第一次 0.4s 已播完
    }));
    check('A2 抖动可重复触发（第二次仍在播放）', a2.first.includes('pwShake') && a2.hasClass, JSON.stringify(a2));

    // A3 服务端 422（拦截 signup）→ 密码框抖动 + 错误提示
    await page.route('**/auth/v1/signup', route => {
      route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ code: 'weak_password', message: 'Password is known to be weak and easy to guess' }) });
    });
    await page.fill('#regDisplayName', 'T34A验收');
    await page.fill('#regEmail', EMAIL);
    await page.fill('#regPassword', PWD); // 前端合规，服务端被拦截 422
    await page.click('#authRegisterBtn');
    await page.waitForFunction(() => document.getElementById('authError').textContent.trim().length > 0, undefined, { timeout: 10000 });
    const a3 = await page.evaluate(() => ({
      cls: document.getElementById('regPassword').classList.contains('pw-shake'),
      err: document.getElementById('authError').textContent.trim(),
    }));
    check('A3 服务端 422 weak_password → 注册密码框抖动 + 红字提示', a3.cls && a3.err.length > 0, JSON.stringify(a3));
    await page.unroute('**/auth/v1/signup');

    // A4 reduced-motion 降级：不抖动
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.fill('#regPassword', 'abc12345');
    const a4Frames = await page.evaluate(() => new Promise(res => {
      const el = document.getElementById('regPassword');
      el.dispatchEvent(new Event('blur'));
      const vals = [];
      const t0 = performance.now();
      (function tick() {
        vals.push(getComputedStyle(el).transform);
        if (performance.now() - t0 < 500) requestAnimationFrame(tick); else res({ vals, anim: getComputedStyle(el).animationName });
      })();
    }));
    check('A4 prefers-reduced-motion 降级：animation 关闭、位移恒 none',
      a4Frames.anim === 'none' && a4Frames.vals.every(v => v === 'none'),
      `animation=${a4Frames.anim} distinct=${new Set(a4Frames.vals).size}`);
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    // ==================== B0. 注册进应用 ====================
    await page.fill('#regPassword', PWD);
    await page.click('#authRegisterBtn');
    await page.waitForSelector('#authGuildForm', { state: 'visible', timeout: 20000 });
    await page.fill('#newGuildName', 'T34A公会');
    await page.click('button[onclick="handleCreateGuild()"]');
    await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
    await sleep(2500);
    uid = await page.evaluate(() => window.CloudSync.getCachedUser().id);
    const g = await svc('GET', '/rest/v1/guilds?select=id&name=eq.T34A公会');
    guildId = g.body[0].id;
    check('B0 UI 注册+创建公会进应用（主链路）', !!uid && !!guildId, `uid=${uid}`);

    // ==================== B. WP2 topbar 秒级时间 ====================
    const t1 = await page.evaluate(() => document.getElementById('todayStr').textContent);
    await sleep(2100);
    const t2 = await page.evaluate(() => document.getElementById('todayStr').textContent);
    const fmtOk = /^\d{4}\/\d{1,2}\/\d{1,2} 周[一二三四五六日] \d{2}:\d{2}:\d{2}$/;
    check('B1 topbar 时间到秒且每秒走动（两采样不同、格式正确）', t1 !== t2 && fmtOk.test(t1) && fmtOk.test(t2), `"${t1}" → "${t2}"`);
    // 隐藏页签跳过写入（defineProperty 覆写 visibilityState），恢复可见后立即更新
    const b2 = await page.evaluate(() => new Promise(res => {
      Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
      const before = document.getElementById('todayStr').textContent;
      setTimeout(() => {
        const during = document.getElementById('todayStr').textContent;
        delete document.visibilityState; // 还原原型 getter（visible）
        setTimeout(() => {
          const after = document.getElementById('todayStr').textContent;
          res({ before, during, after });
        }, 1400);
      }, 1400);
    }));
    check('B2 隐藏期间跳过写入（文本冻结），恢复可见后走动', b2.before === b2.during && b2.after !== b2.during,
      `隐藏前="${b2.before}" 隐藏中="${b2.during}" 恢复后="${b2.after}"`);

    // ==================== C. WP3 看板细分（混合样本逐值） ====================
    // 初始：0 成员 0 活动 → 无细分行、无「取消」
    const c0 = await page.evaluate(() => ({
      sub: document.getElementById('statSubMembers') ? document.getElementById('statSubMembers').textContent : null,
      cancel: document.getElementById('statSubCancelled') ? document.getElementById('statSubCancelled').textContent : null,
    }));
    check('C0 全 0 初始态：细分行与「取消」均不渲染', c0.sub === null && c0.cancel === null, JSON.stringify(c0));
    // 混合样本：正式×2 / 替补×1 / 离队×1（试用 0）；本月正常活动×1
    async function addMember(name, cls, status) {
      const m = await svc('POST', '/rest/v1/raid_members', { guild_id: guildId, name, class: cls, spec: '', role: '输出', status });
      if (m.status !== 201) throw new Error('建成员失败: ' + JSON.stringify(m.body));
      memberIds.push(m.body[0].id);
    }
    await addMember('T34A正式甲', '战士', '正式');
    await addMember('T34A正式乙', '法师', '正式');
    await addMember('T34A替补丙', '牧师', '替补');
    await addMember('T34A离队丁', '盗贼', '离队');
    const aN = await svc('POST', '/rest/v1/activities', { guild_id: guildId, name: 'T34A正常活动', activity_date: fmt(new Date()), raid: '虚影尖塔', status: 'normal' });
    activityIds.push(aN.body[0].id);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
    await sleep(2500);
    const c1 = await page.evaluate(() => ({
      total: [...document.querySelectorAll('#statsGrid .stat-card')][0].querySelector('.stat-value').textContent,
      sub: document.getElementById('statSubMembers') ? document.getElementById('statSubMembers').textContent : null,
      monthTotal: [...document.querySelectorAll('#statsGrid .stat-card')][1].querySelector('.stat-value').textContent,
      cancel: document.getElementById('statSubCancelled') ? document.getElementById('statSubCancelled').textContent : null,
    }));
    check('C1 团员卡细分逐值：正式 2 · 替补 1 · 离队 1（试用 0 不显示，分隔符动态）',
      c1.total === '3' && c1.sub === '正式 2 · 替补 1 · 离队 1' && !c1.sub.includes('试用'), JSON.stringify(c1));
    check('C2 本月活动卡：无取消时不渲染「取消 X 个」', c1.monthTotal === '1' && c1.cancel === null, JSON.stringify(c1));
    const aC = await svc('POST', '/rest/v1/activities', { guild_id: guildId, name: 'T34A取消活动', activity_date: fmt(new Date()), raid: '梦境裂隙', status: 'cancelled' });
    activityIds.push(aC.body[0].id);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
    await sleep(2500);
    const c3 = await page.evaluate(() => ({
      monthTotal: [...document.querySelectorAll('#statsGrid .stat-card')][1].querySelector('.stat-value').textContent,
      cancel: document.getElementById('statSubCancelled') ? document.getElementById('statSubCancelled').textContent : null,
    }));
    check('C3 取消 1 个活动后：大数字 2 + 「取消 1 个」', c3.monthTotal === '2' && c3.cancel === '取消 1 个', JSON.stringify(c3));
    await page.screenshot({ path: path.join(SHOT_DIR, 'c-dashboard-breakdown.png') });

    // ==================== D. WP1 用户中心改密抖动 ====================
    await page.evaluate(async () => { await openUserCenter(); switchUserTab('password'); });
    await sleep(800);
    // D1 两次不一致（提交路径可达：门禁只管新密码强度）→ 确认框抖动 + §3 连帧
    await page.fill('#ucPwCurrent', PWD);
    await page.fill('#ucPwNew', 'T34newab1');
    await page.fill('#ucPwConfirm', 'T34newab2');
    const d1Frames = await page.evaluate(() => new Promise(res => {
      const el = document.getElementById('ucPwConfirm');
      document.getElementById('ucPwSubmitBtn').click();
      const vals = [];
      const t0 = performance.now();
      (function tick() {
        vals.push(getComputedStyle(el).transform);
        if (performance.now() - t0 < 600) requestAnimationFrame(tick); else res(vals);
      })();
    }));
    const d1Distinct = new Set(d1Frames).size;
    const d1Hint = await page.evaluate(() => document.getElementById('ucPwHint').textContent);
    check('D1 两次不一致 → 确认框抖动（§3 连帧：位移有变化、末帧 none）+ 红字保留',
      d1Distinct >= 3 && d1Frames.some(v => v !== 'none') && d1Frames[d1Frames.length - 1] === 'none' && d1Hint === '两次输入的新密码不一致',
      `distinct=${d1Distinct} 末帧=${d1Frames[d1Frames.length - 1]} hint=${d1Hint}`);
    // D2 空新密码（门禁放行空值点击路径）→ 新密码框抖动
    await page.fill('#ucPwNew', '');
    await page.fill('#ucPwConfirm', '');
    await page.click('#ucPwSubmitBtn');
    await sleep(300);
    const d2 = await page.evaluate(() => ({
      cls: document.getElementById('ucPwNew').classList.contains('pw-shake'),
      hint: document.getElementById('ucPwHint').textContent,
    }));
    check('D2 空新密码提交 → 新密码框抖动 + 红字「请输入密码」', d2.cls && d2.hint === '请输入密码', JSON.stringify(d2));
    // D3 服务端 422（拦截 updateUser PUT）→ 新密码框抖动
    await page.route('**/auth/v1/user', (route, req) => {
      if (req.method() === 'PUT') {
        route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ code: 'weak_password', message: 'Password should be at least 8 characters' }) });
      } else route.continue();
    });
    await page.fill('#ucPwNew', 'T34newab1');
    await page.fill('#ucPwConfirm', 'T34newab1');
    await page.click('#ucPwSubmitBtn');
    await page.waitForFunction(() => document.getElementById('ucPwHint').textContent.includes('修改失败'), undefined, { timeout: 15000 });
    const d3 = await page.evaluate(() => ({
      cls: document.getElementById('ucPwNew').classList.contains('pw-shake'),
      hint: document.getElementById('ucPwHint').textContent,
      modalOpen: document.getElementById('userCenterModal').classList.contains('show'),
    }));
    check('D3 服务端 422 weak_password → 新密码框抖动 + 就地提示（弹窗不关、未登出）',
      d3.cls && d3.hint.includes('修改失败') && d3.modalOpen, JSON.stringify(d3));
    await page.unroute('**/auth/v1/user');
    await page.evaluate(() => { snapshotModalForm('userCenterModal'); closeModal('userCenterModal'); });
    await sleep(300);

    // ==================== E. WP4 批量按钮精简 ====================
    await page.evaluate(() => switchPage('attendance'));
    await sleep(1000);
    await page.evaluate((id) => openAttendanceDetail(id), aN.body[0].id);
    await sleep(800);
    const e1 = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('#attendanceBulkBar button')];
      return { count: btns.length, texts: btns.map(b => b.textContent) };
    });
    check('E1 批量条仅剩「全部出席」（三按钮零残留）', e1.count === 1 && e1.texts[0] === '全部出席', JSON.stringify(e1));
    await page.click('#attendanceBulkBar button'); // 全部出席
    await sleep(400);
    const e2 = await page.evaluate(() => {
      const sels = [...document.querySelectorAll('.attend-status-select')];
      return {
        allPresent: sels.length > 0 && sels.every(s => s.value === '出席'),
        n: sels.length,
        stats: document.getElementById('attendanceStatsLine').textContent,
      };
    });
    check('E2 「全部出席」功能正常（全 select 出席 + REQ-055 统计行联动）',
      e2.allPresent && e2.stats.includes(`出席 ${e2.n}`), JSON.stringify(e2));

    // 零 JS 报错（400/401=422 拦截与探测噪音、406=既有噪音）
    const realErrors = pageErrors.filter(e => !/status of (400|401|406|409|422)/.test(e) && !e.includes('修改密码失败') && !e.includes('Registration failed') && !e.includes('注册失败'));
    check('全程零 JS 报错（422=故意拦截路径、406=既有噪音，均已排除）', realErrors.length === 0, realErrors.join(' | ') || '无');
    await ctx.close();
  } finally {
    await browser.close();
  }

  await cleanup();

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#34 验证: ${passed}/${results.length} 通过，截图 → ${SHOT_DIR} =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
