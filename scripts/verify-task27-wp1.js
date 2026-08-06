// 任务书 #27-WP1 验证脚本：成员管理操作列垂直居中（已认领/未认领/已离队三行态 × 两档宽度）
// 用法：node scripts/verify-task27-wp1.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(__dirname, '..', '.s6-ssh', 'node_modules', 'playwright-core'))); }

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-06-task27-wp1');
const PORT = 15656;
const BASE = `http://localhost:${PORT}`;
const PWD = 'T27a-2026!';
const EMAIL = 't27a-verify@wowbutler.cn';

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
async function svc(method, restPath, body) {
  const res = await fetch(`${SB}${restPath}`, { method, headers: SVC, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text(); try { return { status: res.status, body: JSON.parse(t) }; } catch { return { status: res.status, body: t }; }
}

let serverProc = null, owner = null, guildId = null;
let pass = 0, fail = 0;
const fails = [];
function assert(cond, label, detail) {
  if (cond) { pass++; console.log(`  ✔ ${label}`); }
  else { fail++; fails.push(label); console.log(`  ✘ ${label}${detail ? ' — ' + detail : ''}`); }
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  // 预清理同名遗留测试公会（防止多公会时登录自动选错公会）
  const old = await svc('GET', '/rest/v1/guilds?name=eq.T27A验证会&select=id');
  for (const g0 of old.body || []) {
    await svc('DELETE', `/rest/v1/raid_members?guild_id=eq.${g0.id}`);
    await svc('DELETE', `/rest/v1/guild_members?guild_id=eq.${g0.id}`);
    await svc('DELETE', `/rest/v1/guilds?id=eq.${g0.id}`);
  }

  let res = await fetch(`${SB}/auth/v1/signup`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PWD, data: { display_name: 'T27A验证' } }) });
  let body = await res.json();
  if (!body.access_token) {
    res = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PWD }) });
    body = await res.json();
  }
  owner = { uid: body.user.id };
  const g = await svc('POST', '/rest/v1/guilds', { name: 'T27A验证会', owner_id: owner.uid, invite_code: 'T27A' + Date.now().toString(36).slice(-4).toUpperCase() });
  guildId = g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', { guild_id: guildId, user_id: owner.uid, role: 'owner', display_name: 'T27A验证' });
  // 三行态：已认领（名+认领人两行撑高）/ 未认领 / 已离队（数组 POST 键集必须一致，user_id 补 null）
  const mi = await svc('POST', '/rest/v1/raid_members', [
    { guild_id: guildId, name: '已认领甲', class: '战士', spec: '防护', status: '正式', user_id: owner.uid },
    { guild_id: guildId, name: '未认领乙', class: '法师', spec: '奥术', status: '正式', user_id: null },
    { guild_id: guildId, name: '已离队丙', class: '牧师', spec: '神圣', status: '离队', user_id: null },
  ]);
  if (mi.status !== 201) throw new Error('raid_members 插入失败: ' + JSON.stringify(mi.body));

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {} await sleep(500); }

  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console.' + m.type() + ']', m.text().slice(0, 300)); });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#authEmail', { timeout: 20000 });
  await page.fill('#authEmail', EMAIL);
  await page.fill('#authPassword', PWD);
  await page.click('#authLoginBtn');
  await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
  await sleep(2000);
  await page.evaluate(() => switchPage('members'));
  await sleep(800);
  // 开启「显示已离队」让三行态同屏
  await page.evaluate(() => {
    const t = document.querySelector('input[type=checkbox][onchange*="memberToggleShowDeparted"]');
    if (t && !t.checked) { t.checked = true; memberToggleShowDeparted(true); }
  });
  await sleep(800);

  // 对齐断言：每个成员行内，操作列首枚图标按钮的垂直中心 ≈ 行垂直中心（容差 4px）
  async function alignmentCheck(tag) {
    return page.evaluate(() => {
      const out = [];
      document.querySelectorAll('#page-members .data-table tbody tr').forEach(tr => {
        const nameEl = tr.querySelector('td:nth-child(3)');
        const btn = tr.querySelector('.op-cell .action-btns .icon-btn');
        if (!nameEl || !btn) return;
        const rr = tr.getBoundingClientRect();
        const br = btn.getBoundingClientRect();
        out.push({
          name: nameEl.textContent.trim().slice(0, 6),
          rowH: Math.round(rr.height),
          delta: Math.abs((br.top + br.height / 2) - (rr.top + rr.height / 2)),
        });
      });
      return out;
    });
  }

  const rows1 = await alignmentCheck();
  const claimed = rows1.find(r => r.name.startsWith('已认领'));
  const unclaimed = rows1.find(r => r.name.startsWith('未认领'));
  const departed = rows1.find(r => r.name.startsWith('已离队'));
  assert(claimed && claimed.rowH > 40, '已认领行行高被认领人第二行撑大（>40px）', JSON.stringify(claimed));
  for (const [label, r] of [['已认领', claimed], ['未认领', unclaimed], ['已离队', departed]]) {
    assert(r && r.delta <= 4, `1366 档 ${label}行操作列图标垂直居中（偏差 ≤4px）`, JSON.stringify(r));
  }
  await page.screenshot({ path: path.join(SHOT_DIR, '01-opcell-align-1366x768.png') });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await sleep(500);
  const rows2 = await alignmentCheck();
  for (const [label, r] of [['已认领', rows2.find(r => r.name.startsWith('已认领'))], ['未认领', rows2.find(r => r.name.startsWith('未认领'))], ['已离队', rows2.find(r => r.name.startsWith('已离队'))]]) {
    assert(r && r.delta <= 4, `1920 档 ${label}行操作列图标垂直居中（偏差 ≤4px）`, JSON.stringify(r));
  }
  await page.screenshot({ path: path.join(SHOT_DIR, '02-opcell-align-1920x1080.png') });

  await browser.close();

  console.log('—— 测试数据清零 ——');
  await svc('DELETE', `/rest/v1/raid_members?guild_id=eq.${guildId}`);
  await svc('DELETE', `/rest/v1/guild_members?guild_id=eq.${guildId}`);
  await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`);
  await fetch(`${SB}/auth/v1/admin/users/${owner.uid}`, { method: 'DELETE', headers: SVC });
  const chk1 = await svc('GET', `/rest/v1/raid_members?guild_id=eq.${guildId}&select=id`);
  const chk2 = await svc('GET', `/rest/v1/guilds?id=eq.${guildId}&select=id`);
  assert(chk1.body.length === 0 && chk2.body.length === 0, '测试数据清零复核（raid_members/guilds 均为 0）');

  if (serverProc) serverProc.kill();
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  if (fail) { console.log('失败项：\n - ' + fails.join('\n - ')); process.exit(1); }
})().catch(async e => {
  console.error(e);
  try { if (owner) { await svc('DELETE', `/rest/v1/raid_members?guild_id=eq.${guildId}`); await svc('DELETE', `/rest/v1/guild_members?guild_id=eq.${guildId}`); await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`); await fetch(`${SB}/auth/v1/admin/users/${owner.uid}`, { method: 'DELETE', headers: SVC }); } } catch {}
  if (serverProc) serverProc.kill();
  process.exit(1);
});
