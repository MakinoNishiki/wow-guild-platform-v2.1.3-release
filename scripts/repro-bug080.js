// BUG-080 复现+断点取证（一次性脚本，非 verify）：添加成员后逐环dump DB/appData/DOM
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const PORT = 15715;
const BASE = `http://localhost:${PORT}`;
const PWD = 'T47-Test-2026!';
const EMAIL = 't47-a@wowbutler.cn';
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const ANON = env.SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const SVC = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function svc(method, p, body) {
  const res = await fetch(`${SB}${p}`, { method, headers: SVC, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text(); let j = null; try { j = JSON.parse(t); } catch { j = t; }
  return { status: res.status, body: j };
}
let serverProc = null, uid = null, guildId = null;
(async () => {
  const lu = await fetch(`${SB}/auth/v1/admin/users?per_page=50`, { headers: SVC });
  const hit = ((await lu.json()).users || []).find(u => u.email === EMAIL);
  if (hit) await fetch(`${SB}/auth/v1/admin/users/${hit.id}`, { method: 'DELETE', headers: SVC });
  let res = await fetch(`${SB}/auth/v1/signup`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PWD, data: { display_name: 'T47甲' } }) });
  uid = (await res.json()).user.id;
  const g = await svc('POST', '/rest/v1/guilds', { name: 'T47复现会', owner_id: uid, invite_code: 'T47' + Date.now().toString(36).slice(-4).toUpperCase() });
  guildId = g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', [{ guild_id: guildId, user_id: uid, role: 'owner', display_name: 'T47甲' }]);
  // 富态：认领标签开+approval 模式+认领行+离队行+同名跨服对+怪数据行
  await svc('PATCH', '/rest/v1/guilds?id=eq.' + guildId, { show_claimer_label: true, claim_mode: 'approval' });
  await svc('POST', '/rest/v1/raid_members', [
    { guild_id: guildId, name: 'T47Z认领侠', class: '战士', status: '正式', user_id: uid, server: '' },
    { guild_id: guildId, name: 'T47Z离队某', class: '法师', status: '离队', server: '' },
    { guild_id: guildId, name: 'T47Z同名', class: '牧师', status: '正式', server: '白银之手' },
    { guild_id: guildId, name: 'T47Z同名', class: '牧师', status: '正式', server: '罗宁' },
    { guild_id: guildId, name: 'T47Z怪数据', class: '唤魔师', spec: null, off_spec: null, off_specs: null, role: null, status: '试用', notes: null, server: null },
  ]);
  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {} await sleep(500); }

  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  page.setDefaultTimeout(30000);
  const consoleLogs = [];
  page.on('console', m => consoleLogs.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', e => consoleLogs.push('pageerror: ' + e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#authEmail', { state: 'visible' });
  await page.fill('#authEmail', EMAIL);
  await page.fill('#authPassword', PWD);
  await page.click('#authLoginBtn');
  await page.waitForSelector('#page-dashboard', { state: 'visible' });
  await sleep(1500);
  await page.click('.nav-item[data-page="members"]');
  await sleep(1000);

  const dump = async (tag) => {
    const db = await svc('GET', `/rest/v1/raid_members?select=id&name=like.T47D*&guild_id=eq.${guildId}`);
    const st = await page.evaluate(() => ({
      appDataLen: (window.appData.members || []).filter(m => (m.name || '').startsWith('T47D')).length,
      domRows: [...document.querySelectorAll('#membersTableBody tr')].filter(tr => tr.textContent.includes('T47D')).length,
      currentPage: document.querySelector('.nav-item.active') && document.querySelector('.nav-item.active').dataset.page,
      cacheHas: (JSON.parse(localStorage.getItem('wow_raid_attendance_data') || '{}').members || []).filter(m => (m.name || '').startsWith('T47D')).length,
    }));
    console.log(`[${tag}] DB=${db.body.length} appData=${st.appDataLen} DOM=${st.domRows} cache=${st.cacheHas} page=${st.currentPage}`);
  };

  await dump('基线');
  // 环 1：UI 添加成员
  await page.click('#page-members button:has-text("添加成员")');
  await page.waitForSelector('#memberModal', { state: 'visible' });
  await page.fill('#memberName', 'T47D一号');
  await page.selectOption('#memberClass', '战士');
  await page.click('#memberSaveBtn');
  await page.waitForFunction(() => document.getElementById('toastContainer').innerText.length > 0, null, { timeout: 15000 }).catch(() => {});
  await sleep(1200);
  await dump('添加①后');
  // 连加②
  await page.click('#page-members button:has-text("添加成员")');
  await page.waitForSelector('#memberModal', { state: 'visible' });
  await page.fill('#memberName', 'T47D二号');
  await page.selectOption('#memberClass', '法师');
  await page.click('#memberSaveBtn');
  await page.waitForFunction(() => document.getElementById('toastContainer').innerText.includes('二号') || true, null, { timeout: 3000 }).catch(() => {});
  await sleep(1800);
  await dump('连加②后');
  // 切 tab 再切回
  await page.click('.nav-item[data-page="dashboard"]');
  await sleep(600);
  await page.click('.nav-item[data-page="members"]');
  await sleep(1000);
  await dump('切tab往返后');
  console.log('\n---- console 尾部 ----');
  consoleLogs.slice(-12).forEach(l => console.log(l));
  await browser.close();
  await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`);
  await fetch(`${SB}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: SVC });
  serverProc.kill();
  const c = await svc('GET', `/rest/v1/raid_members?select=id&name=like.T47D*`);
  console.log('[清理] 残留=' + c.body.length);
  process.exit(0);
})().catch(async e => { console.error('[异常]', e); try { await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`); if (uid) await fetch(`${SB}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: SVC }); if (serverProc) serverProc.kill(); } catch {} process.exit(1); });
