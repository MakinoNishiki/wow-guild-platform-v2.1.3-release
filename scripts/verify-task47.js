// 任务书 #47 验证：BUG-080 写链路刷新断裂排查+预防 + BUG-081 赛季选择器对齐
// 覆盖（任务书 §四 verify 口径）：
//   A. 版本串两壳 .59 + 静态断言（WP2 四项实锤修复落码 + BUG-081 两壳 CSS 规则 + 层叠顺序）；
//   B. BUG-080 主链路实证（B1/B2 自动化）：添加成员 toast 成功且零刷新即时可见、连加 3 条逐条即时可见、
//      切 tab 往返保持（逐环 dump DB/appData/DOM 三环同步）；
//   C. WP2 实锤修复浏览器实测：#1 退会自愈切换后当前页即时重渲新公会数据（不点 tab 不刷新）；
//      #3 活动保存失败弹窗不关+输入保留+错误 toast（失败路径主链路）；
//   D. BUG-081 computed（§2 口径）：双壳 1920 赛季行右缘=卡片区右缘（同 292 轨道）+
//      双壳 1366 折叠态零裁切（选择器完整落在视口内）；
//   E. 全程零 JS 报错零 404；T47 前缀测试数据（公会/成员/活动）终清理复核为零。
// 用法: node scripts/verify-task47.js（PW_CHANNEL=chrome 可选）
// 截图输出 backup/2026-08-13-task47/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-13-task47');
const PORT = 15716;
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

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail !== undefined ? `（${detail}）` : ''}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function svc(method, p, body) {
  const res = await fetch(`${SB}${p}`, { method, headers: SVC, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text(); let j = null; try { j = JSON.parse(t); } catch { j = t; }
  return { status: res.status, body: j };
}

let serverProc = null, uid = null, guildA = null, guildB = null;

async function setup() {
  const oldG = await svc('GET', `/rest/v1/guilds?select=id&name=like.T47*`);
  for (const g of (Array.isArray(oldG.body) ? oldG.body : [])) await svc('DELETE', `/rest/v1/guilds?id=eq.${g.id}`);
  const lu = await fetch(`${SB}/auth/v1/admin/users?per_page=50`, { headers: SVC });
  const hit = ((await lu.json()).users || []).find(u => u.email === EMAIL);
  if (hit) await fetch(`${SB}/auth/v1/admin/users/${hit.id}`, { method: 'DELETE', headers: SVC });

  let res = await fetch(`${SB}/auth/v1/signup`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PWD, data: { display_name: 'T47甲' } }) });
  uid = (await res.json()).user.id;
  // 公会 A（owner，含标识成员）+ 公会 B（owner=另一个系统账号不行——owner 不能退会；B 让 A 用户以 editor 身份加入）
  const gA = await svc('POST', '/rest/v1/guilds', { name: 'T47甲会', owner_id: uid, invite_code: 'T47A' + Date.now().toString(36).slice(-4).toUpperCase() });
  guildA = gA.body[0].id;
  await svc('POST', '/rest/v1/guild_members', [{ guild_id: guildA, user_id: uid, role: 'owner', display_name: 'T47甲' }]);
  await svc('POST', '/rest/v1/raid_members', [{ guild_id: guildA, name: 'T47甲会成员', class: '战士', status: '正式', server: '' }]);
  // B 会：owner 为一个一次性系统账号，本测试用户以 editor 加入（非 owner 才有退会入口）
  let res2 = await fetch(`${SB}/auth/v1/signup`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 't47-owner@wowbutler.cn', password: PWD, data: { display_name: 'T47乙' } }) });
  let ownerUid = null;
  try { ownerUid = (await res2.json()).user.id; } catch {
    const t = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 't47-owner@wowbutler.cn', password: PWD }) });
    ownerUid = (await t.json()).user.id;
  }
  globalThis.__t47OwnerUid = ownerUid;
  const gB = await svc('POST', '/rest/v1/guilds', { name: 'T47乙会', owner_id: ownerUid, invite_code: 'T47B' + Date.now().toString(36).slice(-4).toUpperCase() });
  guildB = gB.body[0].id;
  await svc('POST', '/rest/v1/guild_members', [
    { guild_id: guildB, user_id: ownerUid, role: 'owner', display_name: 'T47乙' },
    { guild_id: guildB, user_id: uid, role: 'editor', display_name: 'T47甲' },
  ]);
  await svc('POST', '/rest/v1/raid_members', [{ guild_id: guildB, name: 'T47乙会成员', class: '法师', status: '正式', server: '' }]);

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }
}
async function cleanup() {
  const steps = [];
  for (const g of [guildA, guildB]) if (g) { try { const r = await svc('DELETE', `/rest/v1/guilds?id=eq.${g}`); steps.push(`guild:${r.status}`); } catch { steps.push('guild:ERR'); } }
  for (const u of [uid, globalThis.__t47OwnerUid]) if (u) { try { await fetch(`${SB}/auth/v1/admin/users/${u}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); } }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const c1 = await svc('GET', `/rest/v1/guilds?select=id&name=like.T47*`);
  const c2 = await svc('GET', `/rest/v1/raid_members?select=id&name=like.T47*`);
  check('[清理复核] T47 前缀公会/成员全 0', c1.body.length === 0 && c2.body.length === 0, `guild=${c1.body.length} member=${c2.body.length}`);
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

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await setup();

  // ==================== A. 版本串 + 静态断言 ====================
  const htmlData = await (await fetch(`${BASE}/data.html`)).text();
  const htmlIndex = await (await fetch(`${BASE}/`)).text();
  const verOf = h => [...new Set([...h.matchAll(/20260811\.\d+/g)].map(m => m[0]))];
  const vD = verOf(htmlData), vI = verOf(htmlIndex);
  check('A1 版本串两壳同步（单一串且两壳一致；本包 .59 起）', vD.length === 1 && vI.length === 1 && vD[0] === vI[0] && parseInt(vI[0].split('.')[1], 10) >= 59, `index=${vI} data=${vD}`);
  const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  check('A2 WP2-#1 退会自愈重渲落码（selectGuild 后 updateCloudUI+updatePermissionUI+renderCurrentPage）',
    /selectGuild\(guilds\[0\]\.id\);\s*\n[\s\S]{0,400}?updateCloudUI\(\);\s*\n\s*updatePermissionUI\(\);\s*\n\s*renderCurrentPage\(\);/.test(appSrc));
  check('A3 WP2-#3 三处「成功才关弹窗」落码（saveActivity/saveAttendance/deleteCurrentActivity）',
    (appSrc.match(/closeModal\('activityModal'\); \/\//g) || []).length >= 1
      && appSrc.includes("closeModal('attendanceDetailModal'); // 任务书 #47 WP2-#3")
      && !/}\s*\n\s*}\s*\n\s*closeModal\('activityModal'\);\s*\n}/.test(appSrc));
  check('A4 WP2-#4/#5 落码（WCL 部分写 catch reload + 心愿联动 warning toast 不静默）',
    appSrc.includes('同步失败后 reload 失败') && appSrc.includes('心愿单联动同步失败') && appSrc.includes('请核对心愿单「已获取」状态'));
  const cssSrc = fs.readFileSync(path.join(ROOT, 'css', 'data-public.css'), 'utf8');
  check('A5 BUG-081 两壳 CSS 落码（页头/登录壳赛季行并入 292 轨道）且登录壳规则在基线规则之后层叠',
    cssSrc.includes('.data-public-body .dp-header { margin-right: 292px; }')
      && cssSrc.lastIndexOf('#page-lootdrop .dp-season { margin-right: 292px; }') > cssSrc.indexOf('#page-lootdrop .dp-season { max-width: 1100px'));
  // ---- WP4（运营裁定 b 先行+轻量门禁）静态断言 ----
  check('A6 WP4 哨兵落码：cloudCrud 写后自检函数+告警标记', appSrc.includes('function cloudCrudSentinelCheck') && appSrc.includes('[BUG-080 哨兵]'));
  const directWrites = (appSrc.match(/window\.CloudSync\.saveCloudData\(/g) || []).length - 1; // 扣 cloudCrud 内 1 处
  const directApiDb = (appSrc.match(/fetch\('\/api\/db/g) || []).length;
  const directDbOps = (appSrc.match(/[^.]db(?:Insert|Update|Delete)\(/g) || []).length;
  check('A7 WP4 门禁锁数：app.js 直调 saveCloudData=16（批处理例外白名单）/fetch(/api/db)=1（wclAttendanceWrite 登记例外）/直连 dbInsert|Update|Delete=0——新增绕过即超限报警',
    directWrites === 16 && directApiDb === 1 && directDbOps === 0, `saveCloudData=${directWrites} apiDb=${directApiDb} dbOps=${directDbOps}`);
  // A7b（修复清单终案 2026-08-13 扩锁）：cloud.js 同样纳入门禁——syncActivity 内 REQ-033 时代
  // 裸 fetch('/api/db…') 既存写点已收口走 dbInsert wrapper，cloud.js 字面量直 fetch('/api/db 锁 0
  // （dbWrite/dbQuery 两个 wrapper 走 fetch(url,…) 变量形式，不计入）
  const cloudSrc = fs.readFileSync(path.join(ROOT, 'js', 'cloud.js'), 'utf8');
  const cloudApiDb = (cloudSrc.match(/fetch\('\/api\/db/g) || []).length;
  check('A7b WP4 门禁扩锁：cloud.js 裸 fetch(/api/db)=0（syncActivity 既存写点已收口 dbInsert）',
    cloudApiDb === 0, `cloudApiDb=${cloudApiDb}`);

  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const pageErrors = [];
  const notFounds = [];
  const sentinelHits = []; // WP4 哨兵告警捕获（触发/不触发两态断言）
  const watch = (page, tag) => {
    page.setDefaultTimeout(30000);
    page.on('pageerror', e => pageErrors.push(`pageerror(${tag}): ` + e.message));
    page.on('console', msg => {
      if (msg.type() === 'error') pageErrors.push(`console(${tag}): ` + msg.text());
      if (msg.text().includes('[BUG-080 哨兵]')) sentinelHits.push(`${tag}: ${msg.text()}`);
    });
    page.on('response', r => { if (r.status() === 404) notFounds.push(`${tag}: ${r.url()}`); });
  };
  try {
    // ==================== B. BUG-080 主链路（B1/B2 自动化：添加+连加即时可见） ====================
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    watch(page, 't47');
    await login(page);
    await page.click('.nav-item[data-page="members"]');
    await sleep(1000);

    const rings = async () => {
      const db = await svc('GET', `/rest/v1/raid_members?select=id&name=like.T47新*&guild_id=eq.${guildA}`);
      const st = await page.evaluate(() => ({
        appData: (window.appData.members || []).filter(m => (m.name || '').startsWith('T47新')).length,
        dom: [...document.querySelectorAll('#membersTableBody tr')].filter(tr => tr.textContent.includes('T47新')).length,
      }));
      return { db: db.body.length, ...st };
    };
    const addMember = async (name, cls) => {
      await page.click('#page-members button:has-text("添加成员")');
      await page.waitForSelector('#memberModal', { state: 'visible', timeout: 10000 });
      await page.fill('#memberName', name);
      await page.selectOption('#memberClass', cls);
      await page.evaluate(() => { document.getElementById('toastContainer').innerHTML = ''; }); // 清旧 toast 再存，防等待命中上一条
      await page.click('#memberSaveBtn');
      await page.waitForFunction(() => document.getElementById('toastContainer').innerText.includes('成员已添加'), null, { timeout: 20000 });
      await sleep(300);
    };
    await addMember('T47新一', '战士');
    const b1 = await rings();
    check('B1 添加成员：toast 成功且列表零刷新即时可见（DB/appData/DOM 三环=1）', b1.db === 1 && b1.appData === 1 && b1.dom === 1, JSON.stringify(b1));
    await addMember('T47新二', '法师');
    const b2a = await rings();
    await addMember('T47新三', '牧师');
    const b2b = await rings();
    check('B2 连加 3 个逐条即时可见（三环 2→3 递增）', b2a.db === 2 && b2a.dom === 2 && b2b.db === 3 && b2b.appData === 3 && b2b.dom === 3, `中=${JSON.stringify(b2a)} 末=${JSON.stringify(b2b)}`);
    await page.click('.nav-item[data-page="dashboard"]');
    await sleep(600);
    await page.click('.nav-item[data-page="members"]');
    await sleep(800);
    const b3 = await rings();
    check('B3 切 tab 往返后仍即时（无硬刷）', b3.dom === 3 && b3.appData === 3, JSON.stringify(b3));
    await page.screenshot({ path: path.join(SHOT_DIR, 'members-add-instant-1366.png'), fullPage: false });

    // ==================== F. WP4 哨兵两态（b 裁定落地实证） ====================
    // F1 不触发态：B 组正常三次添加全程应零哨兵告警
    check('F1 哨兵不触发态：正常写链路零告警（B 组三次添加）', sentinelHits.length === 0, sentinelHits.join(' | ') || '无告警');
    // F2 触发态：拦截下一次 SDK 直读（reload 走 Supabase 直连；写走 localhost 代理不受影响），
    // 回放生前的陈旧 members 体 → 哨兵应告警并自动二次 reload 自愈，列表仍即时可见
    const staleBody = await svc('GET', `/rest/v1/raid_members?select=*&guild_id=eq.${guildA}&order=created_at.asc`);
    let intercepted = 0;
    await page.route(`${SB}/rest/v1/raid_members*`, async (route) => {
      if (route.request().method() === 'GET' && intercepted === 0) {
        intercepted++;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(staleBody.body) });
        await page.unroute(`${SB}/rest/v1/raid_members*`);
      } else {
        await route.continue();
      }
    });
    await page.click('#page-members button:has-text("添加成员")');
    await page.waitForSelector('#memberModal', { state: 'visible', timeout: 10000 });
    await page.fill('#memberName', 'T47哨兵');
    await page.selectOption('#memberClass', '术士');
    await page.evaluate(() => { document.getElementById('toastContainer').innerHTML = ''; });
    await page.click('#memberSaveBtn');
    await page.waitForFunction(() => document.getElementById('toastContainer').innerText.includes('成员已添加'), null, { timeout: 20000 });
    await sleep(800);
    const f2 = await rings(); // 复用 B 组三环 dump（T47新 前缀）；哨兵行单独查
    const f2dom = await page.evaluate(() => [...document.querySelectorAll('#membersTableBody tr')].filter(tr => tr.textContent.includes('T47哨兵')).length);
    const f2db = await svc('GET', `/rest/v1/raid_members?select=id&name=eq.T47哨兵&guild_id=eq.${guildA}`);
    check('F2 哨兵触发态：陈旧 reload 注入→告警+自动二次 reload 自愈（DOM 仍即时可见）',
      intercepted === 1 && sentinelHits.length >= 1 && f2dom === 1 && f2db.body.length === 1,
      `拦截=${intercepted} 告警=${sentinelHits.length} DOM=${f2dom} DB=${f2db.body.length}`);

    // ==================== C1. WP2-#1 退会自愈重渲（真点击链路） ====================
    // 当前在甲会（owner）；切到乙会（editor）→ 用户中心 → 公会设置 → 退出公会（双 confirm）
    await page.evaluate(async (gid) => { await window.CloudSync.selectGuild(gid); renderCurrentPage(); }, guildB);
    await sleep(1200);
    await page.click('.nav-item[data-page="members"]');
    await sleep(800);
    const c1pre = await page.evaluate(() => document.getElementById('membersTableBody').textContent.includes('T47乙会成员'));
    page.on('dialog', d => d.accept()); // 双 confirm 自动确认
    await page.evaluate(() => openGuildSettings()); // 打开公会设置弹窗（导航动作，写操作本身走真实按钮）
    await page.waitForSelector('#guildSettingsModal', { state: 'visible', timeout: 10000 });
    await page.click('#guildSettingsModal button:has-text("退出此公会")');
    await page.waitForFunction(() => document.getElementById('toastContainer').innerText.includes('已退出公会'), null, { timeout: 20000 });
    await sleep(1500);
    const c1 = await page.evaluate(() => ({
      guildName: (document.getElementById('guildName') || {}).textContent || '',
      memberRows: document.getElementById('membersTableBody').textContent,
    }));
    check('C1 WP2-#1：退会自愈切回甲会后当前页即时重渲（不点 tab 不硬刷，名单=甲会）',
      c1pre && c1.guildName.includes('T47甲会') && c1.memberRows.includes('T47甲会成员') && !c1.memberRows.includes('T47乙会成员'),
      `公会=${c1.guildName} 含甲=${c1.memberRows.includes('T47甲会成员')} 含乙=${c1.memberRows.includes('T47乙会成员')}`);

    // ==================== C2. WP2-#3 活动保存失败弹窗不关（失败路径主链路） ====================
    await page.click('.nav-item[data-page="attendance"]');
    await sleep(800);
    await page.click('#page-attendance button:has-text("创建活动")');
    await page.waitForSelector('#activityModal', { state: 'visible', timeout: 10000 });
    await page.fill('#activityDate', '2026-08-20');
    await page.fill('#activityRaidName', 'T47失败路径本');
    await page.route('**/api/db/rest/v1/activities*', r => r.abort()); // 断写链路
    await page.evaluate(() => { document.getElementById('toastContainer').innerHTML = ''; });
    await page.click('#activitySaveBtn');
    await page.waitForFunction(() => document.getElementById('toastContainer').innerText.includes('失败') || document.getElementById('toastContainer').innerText.includes('出错'), null, { timeout: 15000 }).catch(() => {});
    await sleep(800);
    const c2 = await page.evaluate(() => ({
      toast: document.getElementById('toastContainer').innerText,
      modalVisible: getComputedStyle(document.getElementById('activityModal')).display !== 'none', // fixed 定位 offsetParent 恒 null，用 computed display
      raidKept: document.getElementById('activityRaidName').value,
      btnText: document.getElementById('activitySaveBtn').textContent,
      btnDisabled: document.getElementById('activitySaveBtn').disabled,
    }));
    check('C2 WP2-#3：写失败弹窗不关+输入保留+错误 toast+按钮复位（无假成功无卡死）',
      (c2.toast.includes('失败') || c2.toast.includes('出错')) && c2.modalVisible && c2.raidKept === 'T47失败路径本' && !c2.btnDisabled,
      `toast=${c2.toast.slice(0, 30)} modal=${c2.modalVisible} raid=${c2.raidKept} btn=${c2.btnText}`);
    await page.unroute('**/api/db/rest/v1/activities*');
    await page.evaluate(() => closeModal('activityModal'));
    const c2db = await svc('GET', `/rest/v1/activities?select=id&raid=eq.${encodeURIComponent('T47失败路径本')}`);
    check('C2b 失败路径未入库（零脏行）', c2db.body.length === 0, `rows=${c2db.body.length}`);
    await ctx.close();

    // ==================== D. BUG-081 赛季选择器对齐（computed，双壳×双档） ====================
    // 登录壳 1920
    const ctxW = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const pageL = await ctxW.newPage();
    watch(pageL, 'login1920');
    await pageL.goto(BASE, { waitUntil: 'networkidle' });
    await pageL.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
    await login(pageL);
    await pageL.click('.nav-item[data-page="lootdrop"]');
    await pageL.waitForSelector('#page-lootdrop .dp-filterbar', { state: 'visible', timeout: 20000 });
    await sleep(1500);
    const d1 = await pageL.evaluate(() => {
      const season = document.querySelector('#page-lootdrop .dp-season');
      const main = document.querySelector('#page-lootdrop .dp-main');
      const sel = document.getElementById('dpSeasonSelect');
      return { seasonRight: season.getBoundingClientRect().right, mainRight: main.getBoundingClientRect().right,
        selRight: sel.getBoundingClientRect().right, selLeft: sel.getBoundingClientRect().left, innerW: window.innerWidth,
        seasonMR: getComputedStyle(season).marginRight };
    });
    check('D1 登录壳 1920：赛季行右缘=卡片区右缘（同 292 轨道，偏差 ≤2px）',
      d1.seasonMR === '292px' && Math.abs(d1.seasonRight - d1.mainRight) <= 2, `season=${d1.seasonRight} main=${d1.mainRight} mr=${d1.seasonMR}`);
    check('D2 登录壳 1920：选择器完整可视零裁切', d1.selRight <= d1.innerW && d1.selLeft >= 0, `sel=[${d1.selLeft},${d1.selRight}] vw=${d1.innerW}`);
    await pageL.screenshot({ path: path.join(SHOT_DIR, 'season-login-1920.png'), fullPage: false });

    // 公开壳 1920
    const pageP = await ctxW.newPage();
    watch(pageP, 'public1920');
    await pageP.goto(`${BASE}/data.html`, { waitUntil: 'networkidle' });
    await pageP.waitForSelector('.data-public-body .dp-item', { state: 'visible', timeout: 20000 });
    await sleep(1200);
    const d3 = await pageP.evaluate(() => {
      const header = document.querySelector('.data-public-body .dp-header');
      const main = document.querySelector('.data-public-body .dp-main');
      const sel = document.getElementById('dpSeasonSelect');
      return { headerRight: header.getBoundingClientRect().right, mainRight: main.getBoundingClientRect().right,
        selRight: sel.getBoundingClientRect().right, innerW: window.innerWidth,
        headerMR: getComputedStyle(header).marginRight };
    });
    check('D3 公开壳 1920：页头右缘=卡片区右缘（赛季选择器随之归位，偏差 ≤2px）',
      d3.headerMR === '292px' && Math.abs(d3.headerRight - d3.mainRight) <= 2, `header=${d3.headerRight} main=${d3.mainRight} mr=${d3.headerMR}`);
    check('D4 公开壳 1920：选择器完整可视零裁切', d3.selRight <= d3.innerW, `selRight=${d3.selRight} vw=${d3.innerW}`);
    await pageP.screenshot({ path: path.join(SHOT_DIR, 'season-public-1920.png'), fullPage: false });
    await ctxW.close();

    // 双壳 1366（折叠顶栏态零回退零裁切）
    const ctxM = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageM = await ctxM.newPage();
    watch(pageM, 'public1366');
    await pageM.goto(`${BASE}/data.html`, { waitUntil: 'networkidle' });
    await pageM.waitForSelector('.data-public-body .dp-item', { state: 'visible', timeout: 20000 });
    await sleep(1000);
    const d5 = await pageM.evaluate(() => {
      const sel = document.getElementById('dpSeasonSelect');
      const header = document.querySelector('.data-public-body .dp-header');
      return { selRight: sel.getBoundingClientRect().right, innerW: window.innerWidth, headerMR: getComputedStyle(header).marginRight };
    });
    check('D5 公开壳 1366：折叠态零回退（页头无 292 偏移）+ 选择器零裁切',
      d5.headerMR !== '292px' && d5.selRight <= d5.innerW, `mr=${d5.headerMR} selRight=${d5.selRight}`);
    await pageM.screenshot({ path: path.join(SHOT_DIR, 'season-public-1366.png'), fullPage: false });

    const pageM2 = await ctxM.newPage();
    watch(pageM2, 'login1366');
    await pageM2.goto(BASE, { waitUntil: 'networkidle' });
    await pageM2.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
    await login(pageM2);
    await pageM2.click('.nav-item[data-page="lootdrop"]');
    await pageM2.waitForSelector('#page-lootdrop .dp-filterbar', { state: 'visible', timeout: 20000 });
    await sleep(1200);
    const d6 = await pageM2.evaluate(() => {
      const sel = document.getElementById('dpSeasonSelect');
      const season = document.querySelector('#page-lootdrop .dp-season');
      return { selRight: sel.getBoundingClientRect().right, innerW: window.innerWidth, seasonMR: getComputedStyle(season).marginRight };
    });
    check('D6 登录壳 1366：折叠态零回退（赛季行无 292 偏移）+ 选择器零裁切',
      d6.seasonMR !== '292px' && d6.selRight <= d6.innerW, `mr=${d6.seasonMR} selRight=${d6.selRight}`);
    await pageM2.screenshot({ path: path.join(SHOT_DIR, 'season-login-1366.png'), fullPage: false });
    await ctxM.close();

    const realErrors = pageErrors.filter(e => !e.includes('status of 406') && !e.includes('status of 409')
      && !e.includes('net::ERR_FAILED') // C2 主动断流噪音
      && !e.includes('云端同步失败') && !e.includes('活动保存失败') && !e.includes('cloudCrud 失败')); // C2 失败路径预期 console.error
    check('全程零 JS 报错（406/409/C2 主动断流噪音另行列示）', realErrors.length === 0, realErrors.join(' | ') || '无');
    check('全程零 404', notFounds.length === 0, notFounds.join(' | ') || '无');
  } finally {
    await browser.close();
  }

  await cleanup();

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#47 验证: ${passed}/${results.length} 通过，截图 → ${SHOT_DIR} =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => {
  console.error('[验证脚本异常]', e);
  try { await cleanup(); } catch {}
  process.exit(1);
});
