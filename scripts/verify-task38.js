// 任务书 #38 验证：修复小包（BUG-077 弹窗按钮文案 / BUG-075 422 文案 / BUG-076 死选择器）
// 覆盖：BUG-077 两入口弹窗按钮文案（真浏览器点击工具条主链路）+ 忙碌态参数化；
//       BUG-075 mapAuthError 422 文案「至少 8 位」+ 全站密码文案一致核查（node 静态 + 浏览器占位符）；
//       BUG-076 死选择器 grep 零残留（node 静态，剔注释行）+ .role-badge/.guild-member-role computed 生效值回归（§2）。
// 测试数据（T38A 前缀成员/活动 + t38- 用户/公会）终清理并复核为零。
// 用法: node scripts/verify-task38.js（PW_CHANNEL=chrome 可选）
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 15653;
const BASE = `http://localhost:${PORT}`;
const PWD = 'T38-Test-2026!';
const EMAIL = 't38-owner@wowbutler.cn';

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

let serverProc = null, owner = null, guildId = null;

async function setup() {
  // 前置自清（上轮失败残留幂等清扫）
  await svc('DELETE', `/rest/v1/activities?name=like.T38A*`);
  await svc('DELETE', `/rest/v1/raid_members?name=like.T38A*`);
  const oldG = await svc('GET', `/rest/v1/guilds?select=id&name=like.T38A*`);
  for (const g of (Array.isArray(oldG.body) ? oldG.body : [])) await svc('DELETE', `/rest/v1/guilds?id=eq.${g.id}`);
  const lu = await fetch(`${SB}/auth/v1/admin/users?per_page=50`, { headers: SVC });
  const lj = await lu.json();
  for (const u of (lj.users || []).filter(u => u.email && u.email.startsWith('t38-'))) {
    await fetch(`${SB}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: SVC });
  }

  // 建用户（已存在则直接登录取 token）
  let res = await fetch(`${SB}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PWD, data: { display_name: 'T38会长' } }),
  });
  let body = await res.json();
  if (!body.access_token) {
    res = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PWD }),
    });
    body = await res.json();
  }
  owner = { uid: body.user.id, token: body.access_token };

  const g = await svc('POST', '/rest/v1/guilds', { name: 'T38A修复小包会', owner_id: owner.uid, invite_code: 'T38B' + Date.now().toString(36).slice(-4).toUpperCase() });
  guildId = g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', { guild_id: guildId, user_id: owner.uid, role: 'owner', display_name: 'T38会长' });
  const m = await svc('POST', '/rest/v1/raid_members', [
    { guild_id: guildId, name: 'T38A成员一', class: '战士', status: '正式' },
    { guild_id: guildId, name: 'T38A成员二', class: '法师', status: '正式' },
  ]);
  if (m.status !== 201) throw new Error('建成员失败: ' + JSON.stringify(m.body));
  const a = await svc('POST', '/rest/v1/activities', [
    { guild_id: guildId, name: 'T38A活动一', activity_date: '2026-08-11', raid: '测试团本' },
    { guild_id: guildId, name: 'T38A活动二', activity_date: '2026-08-12', raid: '测试团本' },
  ]);
  if (a.status !== 201) throw new Error('建活动失败: ' + JSON.stringify(a.body));

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }
}

async function cleanup() {
  const steps = [];
  try { const r = await svc('DELETE', `/rest/v1/activities?name=like.T38A*`); steps.push(`act:${r.status}`); } catch { steps.push('act:ERR'); }
  try { const r = await svc('DELETE', `/rest/v1/raid_members?name=like.T38A*`); steps.push(`mem:${r.status}`); } catch { steps.push('mem:ERR'); }
  if (guildId) { try { const r = await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`); steps.push(`guild:${r.status}`); } catch { steps.push('guild:ERR'); } }
  if (owner) { try { await fetch(`${SB}/auth/v1/admin/users/${owner.uid}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); } }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const c1 = await svc('GET', `/rest/v1/activities?select=id&name=like.T38A*`);
  const c2 = await svc('GET', `/rest/v1/raid_members?select=id&name=like.T38A*`);
  const c3 = await svc('GET', `/rest/v1/guilds?select=id&name=like.T38A*`);
  const zero = [c1, c2, c3].every(c => Array.isArray(c.body) && c.body.length === 0);
  check('[清理复核] T38A 前缀全 0', zero, `act=${c1.body.length} mem=${c2.body.length} guild=${c3.body.length}`);
}

async function login(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
  await page.fill('#authEmail', EMAIL);
  await page.fill('#authPassword', PWD);
  await page.click('#authLoginBtn');
  await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
  await sleep(1500);
}

// node 侧静态：去注释行后查串
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('<!--')).join('\n');
}

(async () => {
  await setup();

  // ==================== S. node 侧静态断言 ====================
  const appJs = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  const cloudJs = fs.readFileSync(path.join(ROOT, 'js', 'cloud.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dataHtml = fs.readFileSync(path.join(ROOT, 'data.html'), 'utf8');
  const mainCss = fs.readFileSync(path.join(ROOT, 'css', 'main.css'), 'utf8');

  // changelogData 允许引用旧文案字面（变更记录本身），其余代码区/两壳零残留
  const appJsCode = appJs.split('const changelogData')[0];
  const sixLeft = [appJsCode, cloudJs, indexHtml, dataHtml].some(s => s.includes('至少 6 位') || s.includes('至少6位'));
  check('S1 BUG-075 全站无「至少 6 位」残留（js×2+两壳 HTML）', !sixLeft);
  check('S2 BUG-075 八位口径三处在位：mapAuthError「至少 8 位」+ passwordRuleError「密码至少 8 位」+ 占位符「至少8位」',
    appJs.includes('密码不符合要求（至少 8 位）') && appJs.includes("return '密码至少 8 位'") && indexHtml.includes('至少8位，需含字母和数字'));
  check('S3 BUG-076 main.css 剔注释后零 guild-bar 残留', !stripComments(mainCss).includes('guild-bar'));
  check('S4 BUG-076 徽章族保留：.guild-member-role 与 .role-badge 选择器在位',
    stripComments(mainCss).includes('.guild-member-role') && stripComments(mainCss).includes('.role-badge'));
  check('S5 版本串两壳递增 20260811.50（REQ-097/任务书 #31 于本包之后合入再递增一档，裁定驱动适配）', !indexHtml.includes('20260811.49') && !dataHtml.includes('20260811.49') && indexHtml.includes('20260811.50') && dataHtml.includes('20260811.50'));
  check('S6 BUG-077 成员批量彻底删除独立弹窗保持「彻底删除」按钮（未误改）', indexHtml.includes('id="batchHardDeleteConfirmBtn" disabled onclick="confirmBatchHardDelete()">彻底删除'));

  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const pageErrors = [];
  try {
    // ==================== B3. 注册页占位符（免登录壳） ====================
    const ctxR = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageR = await ctxR.newPage();
    pageR.on('pageerror', e => pageErrors.push('pageerror(reg): ' + e.message));
    await pageR.goto(BASE, { waitUntil: 'networkidle' });
    await pageR.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
    const b3 = await pageR.evaluate(() => ({
      reg: document.getElementById('regPassword').getAttribute('placeholder'),
      mapped: mapAuthError({ message: 'Password should be at least 8 characters' }),
    }));
    check('B3 注册页密码占位符=「至少8位，需含字母和数字」', b3.reg === '至少8位，需含字母和数字', b3.reg);
    check('B1 BUG-075 mapAuthError 422 文案=「密码不符合要求（至少 8 位）」', b3.mapped === '密码不符合要求（至少 8 位）', b3.mapped);
    await ctxR.close();

    // ==================== 登录壳：A 组弹窗文案 + C 组徽章族 ====================
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => pageErrors.push('pageerror(app): ' + e.message));
    page.on('console', msg => { if (msg.type() === 'error') pageErrors.push('console(app): ' + msg.text()); });
    await login(page);

    // A1 批量离队（真点击主链路：勾选行 → 工具条「批量离队」→ 弹窗）
    await page.evaluate(() => switchPage('members'));
    await page.waitForSelector('.member-row-checkbox', { timeout: 20000 });
    await page.click('.member-row-checkbox');
    await page.waitForSelector('#memberBatchToolbar', { state: 'visible', timeout: 10000 });
    await page.click('#memberBatchDepartBtn');
    await page.waitForFunction(() => document.getElementById('batchDeleteTitle').textContent.includes('批量离队'), { timeout: 10000 });
    const a1 = await page.evaluate(() => ({
      title: document.getElementById('batchDeleteTitle').textContent,
      btn: document.getElementById('batchDeleteConfirmBtn').textContent,
      labels: { ...batchDeleteLabels },
    }));
    check('A1 BUG-077 批量离队弹窗按钮=「确认离队」（真点击主链路）', a1.btn === '确认离队', `标题=${a1.title} 按钮=${a1.btn}`);
    check('A2 BUG-077 忙碌态参数化=「离队中...」', a1.labels.confirm === '确认离队' && a1.labels.busy === '离队中...', JSON.stringify(a1.labels));
    await page.evaluate(() => closeModal('batchDeleteModal'));
    await sleep(300);

    // A3 批量删除活动（真点击主链路：勾选活动 → 工具条「批量删除」→ 弹窗）
    await page.evaluate(() => switchPage('attendance'));
    await page.waitForSelector('.activity-select-checkbox', { timeout: 20000 });
    await page.click('.activity-select-checkbox');
    await page.waitForSelector('#activityBatchToolbar', { state: 'visible', timeout: 10000 });
    await page.click('#activityBatchDeleteBtn');
    await page.waitForFunction(() => document.getElementById('batchDeleteTitle').textContent.includes('批量删除活动'), { timeout: 10000 });
    const a3 = await page.evaluate(() => ({
      title: document.getElementById('batchDeleteTitle').textContent,
      btn: document.getElementById('batchDeleteConfirmBtn').textContent,
      labels: { ...batchDeleteLabels },
    }));
    check('A3 BUG-077 批量删除活动弹窗按钮保持「确认删除」', a3.btn === '确认删除', `标题=${a3.title} 按钮=${a3.btn}`);
    check('A4 BUG-077 删除入口忙碌态保持「删除中...」', a3.labels.confirm === '确认删除' && a3.labels.busy === '删除中...', JSON.stringify(a3.labels));
    await page.evaluate(() => closeModal('batchDeleteModal'));
    await sleep(300);

    // C2 §2 computed：topbar .role-badge 生效值回归（徽章族未受死选择器清理影响）
    const c2 = await page.evaluate(() => {
      const el = document.getElementById('userRoleBadge');
      const cs = getComputedStyle(el);
      const bf = getComputedStyle(el, '::before');
      return {
        display: cs.display, height: cs.height, fw: cs.fontWeight, br: cs.borderRadius,
        beforeW: bf.width, beforeImg: bf.backgroundImage, text: el.textContent,
      };
    });
    // flex 容器子项会被块化：inline-flex → flex，二者均视为规则生效
    check('C2 §2 topbar .role-badge computed 生效（inline-flex→flex 块化/20px/600/盾形圆角）',
      ['inline-flex', 'flex'].includes(c2.display) && c2.height === '20px' && c2.fw === '600' && c2.br === '5px 5px 8px 8px',
      JSON.stringify(c2));
    check('C3 §2 .role-badge::before 图标生效（role-owner.svg，12px）',
      c2.beforeW === '12px' && c2.beforeImg.includes('role-owner.svg'), `w=${c2.beforeW} img=${c2.beforeImg.slice(0, 80)}`);

    // C4 §2 computed：.guild-member-role（切换公会弹窗列表）
    await page.evaluate(() => openGuildSwitcher());
    await page.waitForSelector('.guild-member-role', { state: 'visible', timeout: 10000 });
    const c4 = await page.evaluate(() => {
      const el = document.querySelector('.guild-member-role');
      const cs = getComputedStyle(el);
      const bf = getComputedStyle(el, '::before');
      return { display: cs.display, height: cs.height, fw: cs.fontWeight, br: cs.borderRadius, beforeW: bf.width, beforeImg: bf.backgroundImage, text: el.textContent };
    });
    check('C4 §2 .guild-member-role computed 生效（切换公会列表徽标）',
      ['inline-flex', 'flex'].includes(c4.display) && c4.height === '20px' && c4.fw === '600' && c4.br === '5px 5px 8px 8px' && c4.beforeW === '12px' && c4.beforeImg.includes('role-'),
      JSON.stringify(c4));
    await page.evaluate(() => closeModal('guildSwitcherModal'));
    await sleep(300);

    const realErrors = pageErrors.filter(e => !e.includes('status of 406') && !e.includes('status of 409'));
    check('全程零 JS 报错（406/409 资源状态码噪音已排除）', realErrors.length === 0, realErrors.join(' | ') || '无');
    await ctx.close();
  } finally {
    await browser.close();
  }

  await cleanup();

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#38 验证: ${passed}/${results.length} 通过 =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => {
  console.error('[验证脚本异常]', e);
  try { await cleanup(); } catch {}
  process.exit(1);
});
