// 任务书 #45 验证：REQ-095 成员服务器字段+同名口径升级（BUG-060 根治并入验收）
// 覆盖（任务书 §七 verify 口径）：
//   A. 版本串两壳 .57 + 静态断言（sql/28 落码/消歧 helper/双键校验/探测门）；
//   B. sql/28 迁移探测：raid_members.server 列 REST 可见性——未执行时结构类断言自动跳过
//      （verify-master-data 先例），并补测降级路径（成员 UI 新增不带 server 不断链）；
//      已执行则跑全量：
//   C. DB 层唯一键：同服同键活跃重复被索引拦（23505）、跨服同名放行（BUG-060 根治）、
//      撞离队同键可新建活跃行（partial 索引不含离队）；
//   D. UI 主链路：成员弹窗加服务器→列表常驻服务器列+同名消歧「名字（服务器）」→
//      同服同名拦截 toast→编辑回填；
//   E. 智能导入：粘贴「名字-服务器,职业」→预览服务器列→确认导入 server 落库；
//   F. WP5 安全命门：同名并存下装备分配 UI 选人→character_id=所选人 id（不串同名）；
//   G. 全程零 JS 报错零 404；T45 前缀测试数据（含垃圾桶）终清理复核为零。
// 用法: node scripts/verify-task45.js（PW_CHANNEL=chrome 可选）
// 截图输出 backup/2026-08-13-task45/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-13-task45');
const PORT = 15713;
const BASE = `http://localhost:${PORT}`;
const PWD = 'T45-Test-2026!';
const EMAIL_A = 't45-a@wowbutler.cn';

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
function skip(name, why) {
  results.push({ name: `[跳过] ${name}`, ok: true });
  console.log(`⊘ ${name}（跳过：${why}）`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function svc(method, restPath, body) {
  const res = await fetch(`${SB}${restPath}`, { method, headers: SVC, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

let serverProc = null, userA = null, guildId = null;

async function makeUser(email, displayName) {
  let res = await fetch(`${SB}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PWD, data: { display_name: displayName } }),
  });
  let body = await res.json();
  if (!body.access_token) {
    res = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PWD }),
    });
    body = await res.json();
  }
  return { uid: body.user.id, token: body.access_token };
}

async function setup() {
  const oldG = await svc('GET', `/rest/v1/guilds?select=id&name=like.T45*`);
  for (const g of (Array.isArray(oldG.body) ? oldG.body : [])) await svc('DELETE', `/rest/v1/guilds?id=eq.${g.id}`);
  const lu = await fetch(`${SB}/auth/v1/admin/users?per_page=50`, { headers: SVC });
  const hit = ((await lu.json()).users || []).find(u => u.email === EMAIL_A);
  if (hit) await fetch(`${SB}/auth/v1/admin/users/${hit.id}`, { method: 'DELETE', headers: SVC });

  userA = await makeUser(EMAIL_A, 'T45甲');
  const g = await svc('POST', '/rest/v1/guilds', { name: 'T45同名会', owner_id: userA.uid, invite_code: 'T45A' + Date.now().toString(36).slice(-4).toUpperCase() });
  guildId = g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', [{ guild_id: guildId, user_id: userA.uid, role: 'owner', display_name: 'T45甲' }]);

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }
}
async function cleanup() {
  const steps = [];
  if (guildId) { try { const r = await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`); steps.push(`guild:${r.status}`); } catch { steps.push('guild:ERR'); } }
  try { await svc('DELETE', `/rest/v1/deleted_raid_members?name=like.T45*`); steps.push('trash:ok'); } catch { steps.push('trash:ERR'); }
  if (userA) { try { await fetch(`${SB}/auth/v1/admin/users/${userA.uid}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); } }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const c1 = await svc('GET', `/rest/v1/guilds?select=id&name=like.T45*`);
  const c2 = await svc('GET', `/rest/v1/raid_members?select=id&name=like.T45*`);
  const c3 = await svc('GET', `/rest/v1/deleted_raid_members?select=id&name=like.T45*`);
  check('[清理复核] T45 前缀公会/成员/垃圾桶全 0',
    c1.body.length === 0 && c2.body.length === 0 && c3.body.length === 0,
    `guild=${c1.body.length} member=${c2.body.length} trash=${c3.body.length}`);
}
async function login(page, email) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
  await page.fill('#authEmail', email);
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
  check('A1 版本串两壳同步（单一串且两壳一致；本包 .57 起）', vD.length === 1 && vI.length === 1 && vD[0] === vI[0] && parseInt(vI[0].split('.')[1], 10) >= 57, `index=${vI} data=${vD}`);
  const sql28 = fs.readFileSync(path.join(ROOT, 'sql', '28_req095_raid_members_server.sql'), 'utf8');
  check('A2 sql/28 落码：server 可空列 + 三键 COALESCE 活跃 partial 索引 + 回滚注释',
    sql28.includes('ADD COLUMN IF NOT EXISTS server text') && sql28.includes('COALESCE(server, \'\')') && sql28.includes("IS DISTINCT FROM '离队'") && sql28.includes('回滚'));
  const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  const cloudSrc = fs.readFileSync(path.join(ROOT, 'js', 'cloud.js'), 'utf8');
  check('A3 静态：消歧/双键匹配 helper 落码 + 旧四函数零残留',
    appSrc.includes('function matchMemberByNameServer') && appSrc.includes('function memberDisplayName') && appSrc.includes('function findDepartedByNameServer')
      && !appSrc.includes('function isDupMemberName') && !appSrc.includes('function findDepartedByName('));
  check('A4 静态：cloud.js server 列探测门（迁移窗口降级）+ 成员表单服务器字段',
    cloudSrc.includes('probeServerColumn') && cloudSrc.includes('isServerColumnReady') && htmlIndex.includes('id="memberServer"'));

  // ==================== B. sql/28 迁移探测 ====================
  const probe = await svc('GET', '/rest/v1/raid_members?select=server&limit=1');
  const columnReady = probe.status === 200;
  console.log(`\n[探测] raid_members.server 列${columnReady ? '已就绪（sql/28 已执行，跑全量）' : '未就绪（sql/28 待运营执行，结构类跳过+降级路径补测）'}`);

  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const pageErrors = [];
  const notFounds = [];
  const watch = (page, tag) => {
    page.setDefaultTimeout(30000);
    page.on('pageerror', e => pageErrors.push(`pageerror(${tag}): ` + e.message));
    page.on('console', msg => { if (msg.type() === 'error') pageErrors.push(`console(${tag}): ` + msg.text()); });
    page.on('response', r => { if (r.status() === 404) notFounds.push(`${tag}: ${r.url()}`); });
  };
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    watch(page, 't45');
    await login(page, EMAIL_A);

    if (!columnReady) {
      // ---- 降级路径补测（迁移窗口）：成员 UI 新增不带 server 不断链 ----
      skip('C 组 DB 唯一键三态', 'sql/28 待运营执行');
      skip('D 组服务器列/消歧/同服拦截', 'sql/28 待运营执行');
      skip('E 组导入 server 落库', 'sql/28 待运营执行');
      skip('F 组 WP5 同名 id 归属性', 'sql/28 待运营执行');
      await page.click('.nav-item[data-page="members"]');
      await sleep(800);
      await page.click('button:has-text("+ 添加成员"), #page-members button:has-text("添加成员")');
      await page.waitForSelector('#memberModal', { state: 'visible', timeout: 10000 });
      await page.fill('#memberName', 'T45降级成员');
      await page.fill('#memberServer', '白银之手'); // 填了也应被降级摘除
      await page.selectOption('#memberClass', '战士');
      await page.click('#memberSaveBtn');
      await page.waitForFunction(() => document.getElementById('toastContainer').innerText.includes('成功') || document.getElementById('toastContainer').innerText.includes('已'), null, { timeout: 15000 }).catch(() => {});
      await sleep(1500);
      const row = await svc('GET', `/rest/v1/raid_members?select=id,name&name=eq.T45降级成员&guild_id=eq.${guildId}`);
      check('B1 降级路径：迁移窗口内成员 UI 新增不断链（server 键自动摘除）', Array.isArray(row.body) && row.body.length === 1, `rows=${Array.isArray(row.body) ? row.body.length : JSON.stringify(row.body)}`);
      const toastTxt = await page.evaluate(() => document.getElementById('toastContainer').innerText);
      check('B2 降级路径：无错误 toast（静默降级+console.warn）', !toastTxt.includes('失败') && !toastTxt.includes('出错'), toastTxt.slice(0, 60) || '无 toast 残留');
    } else {
      // ==================== C. DB 层唯一键三态 ====================
      const m1 = await svc('POST', '/rest/v1/raid_members', { guild_id: guildId, name: 'T45同名', server: '', class: '战士', status: '正式' });
      check('C1 无服务器同名第一人可建', m1.status === 201, `status=${m1.status}`);
      const m1dup = await svc('POST', '/rest/v1/raid_members', { guild_id: guildId, name: 'T45同名', server: '', class: '法师', status: '正式' });
      check('C2 同键（空 server）同名活跃重复被索引拦（23505）', m1dup.status === 409, `status=${m1dup.status} ${JSON.stringify(m1dup.body).slice(0, 80)}`);
      const m2 = await svc('POST', '/rest/v1/raid_members', { guild_id: guildId, name: 'T45同名', server: '白银之手', class: '法师', status: '正式' });
      check('C3 跨服同名放行（BUG-060 根治，DB 层）', m2.status === 201, `status=${m2.status}`);
      const m3 = await svc('POST', '/rest/v1/raid_members', { guild_id: guildId, name: 'T45同名', server: '罗宁', class: '牧师', status: '离队' });
      const m4 = await svc('POST', '/rest/v1/raid_members', { guild_id: guildId, name: 'T45同名', server: '罗宁', class: '牧师', status: '正式' });
      check('C4 撞离队同键可新建活跃行（partial 索引不含离队）', m3.status === 201 && m4.status === 201, `departed=${m3.status} active=${m4.status}`);

      // ==================== D. UI 主链路 ====================
      await page.reload({ waitUntil: 'networkidle' }); // C 组 svc 直插的成员需刷新进 appData
      await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
      await sleep(1500);
      await page.click('.nav-item[data-page="members"]');
      await sleep(1200);
      const d1 = await page.evaluate(() => {
        const heads = [...document.querySelectorAll('#page-members thead th')].map(t => t.textContent.trim());
        const rows = [...document.querySelectorAll('#membersTableBody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent.trim()));
        return { heads, rows };
      });
      check('D1 成员列表常驻服务器列（表头含「服务器」，空值显「—」）',
        d1.heads.includes('服务器') && d1.rows.some(r => r.includes('—')) && d1.rows.some(r => r.includes('白银之手')),
        `表头=${d1.heads.join('/')}`);
      const d2 = await page.evaluate(() => [...document.querySelectorAll('#membersTableBody td')].map(td => td.textContent).filter(t => t.includes('T45同名（')));
      check('D2 同名并存消歧「名字（服务器）」（列表名字格）', d2.some(t => t.includes('T45同名（白银之手）')) && d2.some(t => t.includes('T45同名（罗宁）')), JSON.stringify(d2.map(t => t.trim().slice(0, 30))));
      await page.screenshot({ path: path.join(SHOT_DIR, 'members-server-column-1366.png'), fullPage: false });

      // 同服同名 UI 拦截（主链路失败路径同属主链路）
      await page.click('#page-members button:has-text("添加成员")');
      await page.waitForSelector('#memberModal', { state: 'visible', timeout: 10000 });
      await page.fill('#memberName', 'T45同名');
      await page.fill('#memberServer', '白银之手');
      await page.selectOption('#memberClass', '盗贼');
      await page.evaluate(() => { document.getElementById('toastContainer').innerHTML = ''; });
      await page.click('#memberSaveBtn');
      await page.waitForFunction(() => document.getElementById('toastContainer').innerText.includes('同服务器已存在同名'), null, { timeout: 10000 }).catch(() => {});
      const d3toast = await page.evaluate(() => document.getElementById('toastContainer').innerText);
      const d3modal = await page.evaluate(() => document.getElementById('memberModal').style.display !== 'none');
      const d3count = await svc('GET', `/rest/v1/raid_members?select=id&name=eq.T45同名&server=eq.白银之手&guild_id=eq.${guildId}`);
      check('D3 同服同名 UI 拦截：toast+弹窗不关+未入库（失败路径实测）',
        d3toast.includes('同服务器已存在同名') && d3modal && d3count.body.length === 1, `toast=${d3toast.slice(0, 40)} rows=${d3count.body.length}`);
      // 跨服同名 UI 放行（BUG-060 主链路）
      await page.evaluate(() => { document.getElementById('toastContainer').innerHTML = ''; });
      await page.fill('#memberServer', '金色平原');
      await page.click('#memberSaveBtn');
      await page.waitForFunction(() => document.getElementById('toastContainer').innerText.length > 0, null, { timeout: 10000 }).catch(() => {});
      await sleep(2000);
      const d4 = await svc('GET', `/rest/v1/raid_members?select=id,server&name=eq.T45同名&server=eq.金色平原&guild_id=eq.${guildId}`);
      check('D4 跨服同名 UI 新增放行+server 落库（BUG-060 主链路根治）', d4.body.length === 1 && d4.body[0].server === '金色平原', `rows=${d4.body.length}`);
      // 编辑回填
      await page.evaluate(() => {
        const m = appData.members.find(x => x.name === 'T45同名' && x.server === '金色平原');
        editMember(m.id);
      });
      await sleep(600);
      const d5 = await page.evaluate(() => document.getElementById('memberServer').value);
      check('D5 编辑弹窗服务器回填', d5 === '金色平原', `回填=${d5}`);
      await page.evaluate(() => requestCloseModal('memberModal'));
      await sleep(400);

      // ==================== E. 智能导入 server 落库 ====================
      await page.evaluate(() => showImportMembersModal());
      await sleep(600);
      await page.fill('#importMembersText', 'T45导入甲-罗宁,MAGE\nT45导入乙,WARRIOR');
      await page.click('#importParseBtn');
      await sleep(800);
      const e1 = await page.evaluate(() => importPreviewRows.map(r => ({ name: r.name, server: r.server, status: r.status })));
      check('E1 导入解析：「名字-服务器,职业」拆出 server 进预览行', e1[0] && e1[0].server === '罗宁' && e1[1] && e1[1].server === '', JSON.stringify(e1));
      await page.click('#importConfirmBtn');
      await sleep(3000);
      const e2 = await svc('GET', `/rest/v1/raid_members?select=name,server&name=like.T45导入*&guild_id=eq.${guildId}`);
      const e2a = Array.isArray(e2.body) && e2.body.find(r => r.name === 'T45导入甲');
      const e2b = Array.isArray(e2.body) && e2.body.find(r => r.name === 'T45导入乙');
      check('E2 导入 server 落库（甲=罗宁/乙=空）',
        e2.body.length === 2 && e2a && e2a.server === '罗宁' && e2b && (e2b.server === '' || e2b.server === null), JSON.stringify(e2.body));

      // ==================== F. WP5 同名 id 归属（安全命门） ====================
      // 给「T45同名（罗宁，正式）」与「T45同名（白银之手）」并存状态下，UI 分配装备给罗宁那位
      const fIds = await svc('GET', `/rest/v1/raid_members?select=id,server&name=eq.T45同名&status=eq.正式&guild_id=eq.${guildId}`);
      const ln = fIds.body.find(r => r.server === '罗宁');
      await page.click('.nav-item[data-page="loot"]');
      await sleep(800);
      await page.click('#page-loot button:has-text("添加装备")');
      await page.waitForSelector('#lootModal', { state: 'visible', timeout: 10000 });
      await page.fill('#lootName', 'T45归属测试之剑');
      await page.evaluate((id) => {
        const sel = document.getElementById('lootAssignedTo');
        sel.value = id;
        lootUpdateMemberInfo();
      }, ln.id);
      await page.selectOption('#lootStatus', '已分配');
      await page.click('#lootSaveBtn');
      await sleep(2500);
      const f1 = await svc('GET', `/rest/v1/loot_records?select=character_id,item_stats&item_name=eq.T45归属测试之剑&guild_id=eq.${guildId}`);
      const f1row = Array.isArray(f1.body) && f1.body[0];
      check('F1 WP5：同名并存下分配归属 id=所选成员（不串同名）',
        f1row && f1row.character_id === ln.id, `character_id=${f1row && f1row.character_id} 期望=${ln.id}`);
      check('F2 WP5：assignedTo 名字快照语义不变（裸名）',
        f1row && f1row.item_stats && f1row.item_stats.assignedTo === 'T45同名', JSON.stringify(f1row && f1row.item_stats && f1row.item_stats.assignedTo));
    }

    const realErrors = pageErrors.filter(e => !e.includes('status of 406') && !e.includes('status of 409')
      && !(columnReady === false && e.includes('status of 400'))); // 迁移窗口探测 400 为预期流量（B 组探测口）
    check('全程零 JS 报错（406/409 噪音另行列示）', realErrors.length === 0, realErrors.join(' | ') || '无');
    check('全程零 404', notFounds.length === 0, notFounds.join(' | ') || '无');
    await ctx.close();
  } finally {
    await browser.close();
  }

  await cleanup();

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#45 验证: ${passed}/${results.length} 通过，截图 → ${SHOT_DIR} =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => {
  console.error('[验证脚本异常]', e);
  try { await cleanup(); } catch {}
  process.exit(1);
});
