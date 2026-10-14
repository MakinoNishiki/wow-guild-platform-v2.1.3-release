// 任务书 #70 WP1 D 组验收：WCL 公会绑定与报告同步 —— 真浏览器主链路实测
// 主链路：登录 → 用户中心 → ⚙ 公会设置 → 🔗 WCL 公会绑定卡 → 粘贴链接检测挽歌(144305) → 确认绑定
//   → 考勤页「🔄 同步 WCL 报告」→ 新报告 banner →「创建活动并关联」预填弹窗 → 保存
//   → 活动详情「📊 团本速览」看板 → 再同步（已关联过滤）→ 解绑（confirm 接受）。
// 截图落 backup/2026-10-14-task70-wp1/（文件名带序号）；console error 与 4xx/5xx 全程收集，
// user_profiles 409 首登竞态属已知白名单。结束后 service_role 清理测试活动/公会/用户。
// 自建用户 t070-ui@example.com + 公会「T070UI公会」（owner 行同建），只读 .env 不打印密钥。
// 用法: node scripts/verify-task70-browser.js（PW_CHANNEL 可选，默认 chrome）
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-10-14-task70-wp1');
const PORT = 15770;
const BASE = `http://127.0.0.1:${PORT}`;
const PWD = 'T070-Ui-2026!';
const EMAIL = 't070-ui@example.com';
const GUILD_NAME = 'T070UI公会';
const WCL_URL_INPUT = 'https://www.warcraftlogs.com/guild/id/144305';

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

let serverProc = null, browser = null, userU = null, guildId = null;
const consoleErrors = [];
const badResponses = [];

async function setup() {
  // 清理上次残留（同名公会/同邮箱用户）
  const oldG = await svc('GET', `/rest/v1/guilds?select=id&name=eq.${encodeURIComponent(GUILD_NAME)}`);
  for (const g of (Array.isArray(oldG.body) ? oldG.body : [])) {
    await svc('DELETE', `/rest/v1/activities?guild_id=eq.${g.id}`);
    await svc('DELETE', `/rest/v1/guilds?id=eq.${g.id}`);
  }
  const lu = await fetch(`${SB}/auth/v1/admin/users?per_page=50`, { headers: SVC });
  const lj = await lu.json();
  const hit = (lj.users || []).find(u => u.email === EMAIL);
  if (hit) await fetch(`${SB}/auth/v1/admin/users/${hit.id}`, { method: 'DELETE', headers: SVC });

  let res = await fetch(`${SB}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PWD, data: { display_name: 't070-ui' } }),
  });
  let body = await res.json();
  if (!body.access_token) {
    res = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PWD }),
    });
    body = await res.json();
    if (!body.access_token) throw new Error('测试用户创建/登录失败: ' + JSON.stringify(body));
  }
  userU = { uid: body.user.id };
  const g = await svc('POST', '/rest/v1/guilds', { name: GUILD_NAME, owner_id: userU.uid, invite_code: 'T070UI01', server_name: '金色平原', server_region: '一区' });
  if (!Array.isArray(g.body) || !g.body[0]) throw new Error('公会创建失败: ' + JSON.stringify(g.body));
  guildId = g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', [{ guild_id: guildId, user_id: userU.uid, role: 'owner', display_name: 't070-ui' }]);

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) return; } catch { /* 未起 */ }
    if (i === 49) throw new Error('server.js 启动超时');
    await sleep(200);
  }
}

async function cleanup() {
  const steps = [];
  if (guildId) {
    try { const r1 = await svc('DELETE', `/rest/v1/activities?guild_id=eq.${guildId}`); steps.push(`activities:${r1.status}`); } catch { steps.push('activities:ERR'); }
    try { const r2 = await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`); steps.push(`guild:${r2.status}`); } catch { steps.push('guild:ERR'); }
  }
  if (userU) { try { await fetch(`${SB}/auth/v1/admin/users/${userU.uid}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); } }
  if (browser) { try { await browser.close(); } catch { /* 已关 */ } }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const c1 = await svc('GET', `/rest/v1/guilds?select=id&name=eq.${encodeURIComponent(GUILD_NAME)}`);
  check('[清理复核] T070UI公会 全 0', Array.isArray(c1.body) && c1.body.length === 0, `guild=${Array.isArray(c1.body) ? c1.body.length : '查询异常'}`);
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await setup();
  console.log(`[数据] 用户 ${EMAIL} + 公会「${GUILD_NAME}」(${guildId}) 就绪，服务端口 ${PORT}`);

  browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push({ text: msg.text(), url: (msg.location() && msg.location().url) || '' }); });
  page.on('response', res => { if (res.status() >= 400) badResponses.push(`${res.status()} ${res.url()}`); });
  page.on('dialog', d => { console.log(`[dialog] ${d.message().split('\n')[0]}`); d.accept(); });

  const shot = async name => { const p = path.join(SHOT_DIR, name); await page.screenshot({ path: p, fullPage: false }); console.log(`[截图] ${name}`); };

  try {
    // ---------- 1. 登录 ----------
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#iaLoginBtn', { state: 'visible' }); // 免登录首页 → 右上「登录 / 注册」
    await page.click('#iaLoginBtn');
    await page.waitForSelector('#authOverlay', { state: 'visible' });
    await page.fill('#authEmail', EMAIL);
    await page.fill('#authPassword', PWD);
    await page.click('#authLoginBtn');
    await page.waitForSelector('#authOverlay', { state: 'hidden', timeout: 30000 });
    await sleep(1500); // 云端数据加载沉降
    await page.click('[data-ia-tab="team"]'); // 任务书 #59 壳：一级导航「团队管理」进主应用
    await page.waitForSelector('.ia-pill[data-ia-key="attendance"]', { state: 'visible' });
    check('1 登录进入主应用（团队管理二级导航可见）', await page.isVisible('.ia-pill[data-ia-key="attendance"]'));

    // ---------- 2. 用户中心 → ⚙ 公会设置 → WCL 公会绑定卡 ----------
    await page.click('#iaUserCenterBtn');
    await page.waitForSelector('#userCenterModal.show', { state: 'visible' });
    await page.click('#ucGuildCard button:has-text("公会设置")');
    await page.waitForSelector('#guildSettingsModal.show', { state: 'visible' });
    await page.locator('#wclBindUnbound').scrollIntoViewIfNeeded();
    await sleep(400);
    check('2 公会设置弹窗内「🔗 WCL 公会绑定」卡在场（未绑定态）',
      await page.isVisible('#wclBindUnbound') && !(await page.isVisible('#wclBindBound')));
    await shot('01-guild-settings-wcl-card.png');

    // ---------- 3. 粘贴绑定 ----------
    await page.fill('#wclGuildInput', WCL_URL_INPUT);
    await page.click('#wclLookupBtn');
    await page.waitForSelector('#wclLookupResult', { state: 'visible', timeout: 45000 });
    const lookupText = await page.textContent('#wclLookupText');
    check('3a 检测公会确认区出现「挽歌 - 金色平原」', /挽歌/.test(lookupText) && /金色平原/.test(lookupText), lookupText.trim());
    await shot('02-lookup-confirm.png');
    await page.click('#wclLookupResult button:has-text("确认绑定")');
    await page.waitForSelector('#wclBindBound', { state: 'visible', timeout: 30000 });
    const boundName = await page.textContent('#wclBoundName');
    check('3b 绑定成功：卡片切已绑定态（公会名+解绑按钮）',
      /挽歌/.test(boundName || '') && await page.isVisible('#wclUnbindBtn'), (boundName || '').trim());
    await shot('03-bound-state.png');

    // 关闭弹窗（公会设置 + 用户中心）后再走导航
    await page.click('#guildSettingsModal .modal-close');
    await page.click('#userCenterModal .modal-close');
    await page.waitForSelector('#guildSettingsModal.show', { state: 'hidden' });

    // ---------- 4. 考勤页同步 ----------
    await page.click('.ia-pill[data-ia-key="attendance"]');
    await page.waitForSelector('#wclReportsSyncBtn', { state: 'visible' });
    check('4a 考勤工具条出现「🔄 同步 WCL 报告」', true);
    await page.click('#wclReportsSyncBtn');
    await page.waitForSelector('#wclNewReportsBanner', { state: 'visible', timeout: 60000 });
    await sleep(500);
    const bannerBtns = await page.locator('#wclNewReportsBanner button:has-text("创建活动并关联")').count();
    const bannerIgnore = await page.locator('#wclNewReportsBanner button:has-text("忽略")').count();
    check('4b 新报告 banner 弹出（每条带 创建活动并关联/忽略）', bannerBtns >= 1 && bannerIgnore === bannerBtns, `新报告 ${bannerBtns} 条`);
    await shot('04-sync-banner.png');

    // ---------- 5. 创建活动并关联 ----------
    await page.locator('#wclNewReportsBanner button:has-text("创建活动并关联")').first().click();
    await page.waitForSelector('#activityModal.show', { state: 'visible' });
    const preDate = await page.inputValue('#activityDate');
    const preRaid = await page.inputValue('#activityRaidName');
    const preWcl = await page.inputValue('#activityWclUrl');
    // 团本预填值 = WCL 返回的 zoneName（挽歌 2016 报告为英文 Emerald Nightmare，属数据源原文非缺陷）
    check('5a 活动弹窗预填 日期/团本/WCL链接', !!preDate && !!preRaid && /warcraftlogs\.com\/reports\//.test(preWcl),
      `date=${preDate} raid=${preRaid} url=${preWcl}`);
    await shot('05-activity-prefill.png');
    await page.click('#activitySaveBtn');
    await page.waitForSelector('#activityModal.show', { state: 'hidden', timeout: 30000 });
    await sleep(1500); // cloudCrud reload + render 沉降
    check('5b 保存成功：弹窗关闭返回考勤列表', true);
    const linkedCode = (preWcl.match(/\/reports\/([A-Za-z0-9]+)/) || [])[1];

    // ---------- 6. 团本速览看板 ----------
    const itemSel = `#activityList .activity-item[data-activity-id]`;
    await page.waitForSelector(itemSel, { state: 'visible' });
    await page.locator(itemSel).first().click();
    await page.waitForSelector('#attendanceDetailModal.show', { state: 'visible' });
    await page.waitForFunction(() => {
      const b = document.getElementById('wclRaidBoard');
      return b && b.style.display !== 'none' && b.querySelector('table tbody tr');
    }, null, { timeout: 60000 });
    const boardText = await page.textContent('#wclRaidBoard');
    const hasXavius = /萨维斯|Xavius/i.test(boardText || '');
    check('6 详情弹窗「📊 团本速览」卡：首领表格在场（击杀/尝试/最佳进度）',
      /团本速览/.test(boardText) && /首领/.test(boardText) && /最佳进度/.test(boardText) && hasXavius,
      hasXavius ? '含萨维斯/Xavius 行' : '未命中萨维斯/Xavius 字样（见截图）');
    await shot('06-raid-board.png');

    // ---------- 7. 再同步：已关联过滤 ----------
    await page.click('#attendanceDetailModal .modal-footer button:has-text("关闭")');
    await page.waitForSelector('#attendanceDetailModal.show', { state: 'hidden' });
    await page.click('#wclReportsSyncBtn');
    await sleep(500);
    await page.waitForFunction(prev => {
      const b = document.getElementById('wclNewReportsBanner');
      const n = b && b.style.display !== 'none' ? b.querySelectorAll('button').length / 2 : 0;
      return n === prev - 1;
    }, bannerBtns, { timeout: 60000 }).catch(() => null);
    const afterVisible = await page.isVisible('#wclNewReportsBanner');
    const afterCount = afterVisible ? await page.locator('#wclNewReportsBanner button:has-text("创建活动并关联")').count() : 0;
    check('7 再同步后已关联报告从 banner 消失（is_linked 过滤）', afterCount === bannerBtns - 1, `${bannerBtns} → ${afterCount}`);
    await shot('07-resync-filtered.png');

    // ---------- 8. 解绑 ----------
    await page.click('#iaUserCenterBtn');
    await page.waitForSelector('#userCenterModal.show', { state: 'visible' });
    await page.click('#ucGuildCard button:has-text("公会设置")');
    await page.waitForSelector('#guildSettingsModal.show', { state: 'visible' });
    await page.locator('#wclBindBound').scrollIntoViewIfNeeded();
    await page.click('#wclUnbindBtn'); // confirm 由 page.on('dialog') accept
    await page.waitForSelector('#wclBindUnbound', { state: 'visible', timeout: 30000 });
    check('8 解绑成功：卡片回到未绑定态', !(await page.isVisible('#wclBindBound')) && await page.isVisible('#wclBindUnbound'));
    await shot('08-unbound-state.png');

    // ---------- 9. console / 网络异常 ----------
    const whitelisted409 = badResponses.some(t => /user_profiles/.test(t) && /409/.test(t));
    const errFiltered = consoleErrors.filter(e =>
      !/user_profiles/.test(e.url)
      && !(whitelisted409 && /^Failed to load resource: the server responded with a status of 409/.test(e.text)));
    const respFiltered = badResponses.filter(t => !(/user_profiles/.test(t) && /409/.test(t)));
    check('9a 全程零 console error（user_profiles 409 竞态白名单）', errFiltered.length === 0, errFiltered.slice(0, 3).map(e => e.text).join(' | ') || '无');
    check('9b 全程零 4xx/5xx（user_profiles 409 白名单）', respFiltered.length === 0, respFiltered.slice(0, 3).join(' | ') || '无');
  } catch (e) {
    check('主链路执行', false, e.message);
    try {
      await shot('99-fail.png');
      const domProbe = await page.evaluate(() => ({
        url: location.href,
        modals: [...document.querySelectorAll('.modal-overlay.show')].map(m => m.id),
        bindCard: (document.getElementById('wclBindBound') || {}).style && document.getElementById('wclBindBound').style.display,
        banner: (document.getElementById('wclNewReportsBanner') || {}).style && document.getElementById('wclNewReportsBanner').style.display,
      }));
      console.log('[失败现场]', JSON.stringify(domProbe));
    } catch { /* 页面已不可用 */ }
  } finally {
    await cleanup();
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n===== 任务书 #70 WP1 真浏览器验收: ${results.length - failed.length}/${results.length} 通过 =====`);
  if (consoleErrors.length) console.log('[console error 全量]', consoleErrors);
  if (badResponses.length) console.log('[4xx/5xx 全量]', badResponses);
  process.exit(failed.length ? 1 : 0);
})().catch(async e => { console.error('执行异常:', e); await cleanup(); process.exit(1); });
