// 任务书 #27-WP2 验证脚本：彻底删除放开 + 历史保全 + 垃圾桶 + 统计口径 + 离队回归
// 前置：sql/17 已在真实库执行（member_name 列 / SET NULL 外键 / deleted_raid_members 表）
// 用法：node scripts/verify-task27-wp2.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(__dirname, '..', '.s6-ssh', 'node_modules', 'playwright-core'))); }

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-06-task27-wp2');
const PORT = 15657;
const BASE = `http://localhost:${PORT}`;
const PWD = 'T27b-2026!';
const EMAIL = 't27b-verify@wowbutler.cn';

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

  // 预清理同名遗留
  const old = await svc('GET', '/rest/v1/guilds?name=eq.T27B验证会&select=id');
  for (const g0 of old.body || []) {
    for (const t of ['deleted_raid_members', 'activity_attendance', 'loot_records', 'wishlists', 'raid_members', 'activities', 'guild_members']) {
      await svc('DELETE', `/rest/v1/${t}?guild_id=eq.${g0.id}`);
    }
    await svc('DELETE', `/rest/v1/activities?guild_id=eq.${g0.id}`);
    await svc('DELETE', `/rest/v1/guilds?id=eq.${g0.id}`);
  }

  let res = await fetch(`${SB}/auth/v1/signup`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PWD, data: { display_name: 'T27B验证' } }) });
  let body = await res.json();
  if (!body.access_token) {
    res = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PWD }) });
    body = await res.json();
  }
  owner = { uid: body.user.id };
  const g = await svc('POST', '/rest/v1/guilds', { name: 'T27B验证会', owner_id: owner.uid, invite_code: 'T27B' + Date.now().toString(36).slice(-4).toUpperCase() });
  guildId = g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', { guild_id: guildId, user_id: owner.uid, role: 'owner', display_name: 'T27B验证' });

  // 成员：李雷(活跃,带历史) / 李雷(离队,同名干扰) / 韩梅梅(统计对照) / 零历史 / 离队回归（数组 POST 键集一致）
  const mm = await svc('POST', '/rest/v1/raid_members', [
    { guild_id: guildId, name: '李雷', class: '战士', spec: '防护', status: '正式', user_id: null },
    { guild_id: guildId, name: '李雷', class: '牧师', spec: '神圣', status: '离队', user_id: null },
    { guild_id: guildId, name: '韩梅梅', class: '法师', spec: '奥术', status: '正式', user_id: null },
    { guild_id: guildId, name: '零历史', class: '猎人', spec: '射击', status: '正式', user_id: null },
    { guild_id: guildId, name: '离队回归', class: '盗贼', spec: '奇袭', status: '正式', user_id: null },
  ]);
  if (mm.status !== 201) throw new Error('成员插入失败: ' + JSON.stringify(mm.body));
  const byName = (n, s) => mm.body.find(r => r.name === n && r.status === s);
  const M1 = byName('李雷', '正式'), M3 = byName('韩梅梅', '正式');
  const M4 = byName('零历史', '正式'), M5 = byName('离队回归', '正式');

  // 活动 A1/A2 + 考勤（member_name 快照按应用行为一并写入）
  const acts = await svc('POST', '/rest/v1/activities', [
    { guild_id: guildId, name: 'T27活动一', activity_date: '2026-08-05', raid: '虚影尖塔', boss: '', status: 'normal' },
    { guild_id: guildId, name: 'T27活动二', activity_date: '2026-08-06', raid: '虚影尖塔', boss: '', status: 'normal' },
  ]);
  if (acts.status !== 201) throw new Error('活动插入失败: ' + JSON.stringify(acts.body));
  const A1 = acts.body.find(a => a.name === 'T27活动一'), A2 = acts.body.find(a => a.name === 'T27活动二');
  const at = await svc('POST', '/rest/v1/activity_attendance', [
    { activity_id: A1.id, member_id: M1.id, member_name: '李雷', status: 'present' },
    { activity_id: A1.id, member_id: M3.id, member_name: '韩梅梅', status: 'absent' },
    { activity_id: A1.id, member_id: M5.id, member_name: '离队回归', status: 'present' },
    { activity_id: A2.id, member_id: M1.id, member_name: '李雷', status: 'absent' },
    { activity_id: A2.id, member_id: M3.id, member_name: '韩梅梅', status: 'present' },
  ]);
  if (at.status !== 201) throw new Error('考勤插入失败: ' + JSON.stringify(at.body));
  // 心愿 1 条 + 装备 1 条（李雷）
  const wl = await svc('POST', '/rest/v1/wishlists', { guild_id: guildId, member_id: M1.id, items: [{ name: '测试心愿装备' }] });
  if (wl.status !== 201) throw new Error('心愿插入失败: ' + JSON.stringify(wl.body));
  const lt = await svc('POST', '/rest/v1/loot_records', {
    guild_id: guildId, character_id: M1.id, item_name: '李雷的测试之剑', item_category: '武器', item_slot: '双手',
    item_stats: { assignedTo: '李雷', status: '已分配', priority: 'P1' }, obtained_date: '2026-08-05',
  });
  if (lt.status !== 201) throw new Error('装备插入失败: ' + JSON.stringify(lt.body));

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {} await sleep(500); }

  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  page.on('dialog', async d => { await d.accept(); });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#authEmail', { timeout: 20000 });
  await page.fill('#authEmail', EMAIL);
  await page.fill('#authPassword', PWD);
  await page.click('#authLoginBtn');
  await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
  await sleep(2500);

  // ---- 删除前统计基线 ----
  const baseline = await page.evaluate(([m1, m3]) => ({
    m1: getAttendanceStats(m1, appData.activities).rate,
    m3: getAttendanceStats(m3, appData.activities).rate,
    attRows: appData.activities.reduce((c, a) => c + a.attendees.length, 0),
  }), [M1.id, M3.id]);
  assert(baseline.m1 === 50 && baseline.m3 === 50, '统计基线：李雷/韩梅梅出勤率各 50%', JSON.stringify(baseline));

  // ================= 场景①：重复角色——删带历史者，输名确认 =================
  console.log('—— 场景①：两个同名成员，删带历史者，输名确认 ——');
  await page.evaluate(() => switchPage('members'));
  await sleep(800);
  const m1row = page.locator('#membersTableBody tr', { hasText: '李雷' }).first();
  await m1row.locator('button.danger').click();
  await sleep(1200);
  const modalVisible = await page.evaluate(() => document.getElementById('memberHardDeleteModal').classList.contains('show'));
  assert(modalVisible, '有历史：弹出输名确认弹窗（非拦截）');
  const warnText = await page.evaluate(() => document.getElementById('hardDeleteWarnText').textContent);
  assert(warnText.includes('考勤 2 条') && warnText.includes('装备记录 1 条') && warnText.includes('心愿 1 条'),
    '弹窗红色警示含三项历史计数', warnText);
  const btnDisabled0 = await page.evaluate(() => document.getElementById('hardDeleteConfirmBtn').disabled);
  assert(btnDisabled0 === true, '未输名时确认按钮禁用');
  await page.fill('#hardDeleteConfirmName', '李');
  const btnDisabled1 = await page.evaluate(() => document.getElementById('hardDeleteConfirmBtn').disabled);
  assert(btnDisabled1 === true, '输名不完整仍禁用（重复角色防误删）');
  await page.fill('#hardDeleteConfirmName', '李雷');
  const btnEnabled = await page.evaluate(() => document.getElementById('hardDeleteConfirmBtn').disabled);
  assert(btnEnabled === false, '输全名后确认按钮启用');
  await page.screenshot({ path: path.join(SHOT_DIR, '01-harddelete-modal.png') });
  await page.click('#hardDeleteConfirmBtn');
  await sleep(2500);
  const toast1 = await page.evaluate(() => {
    const ts = [...document.querySelectorAll('#toastContainer .toast')];
    return ts.length ? ts[ts.length - 1].textContent : '';
  });
  assert(toast1.includes('已彻底删除'), '删除成功 toast', toast1);

  // DB 复核
  const rm = await svc('GET', `/rest/v1/raid_members?guild_id=eq.${guildId}&name=eq.李雷&select=id,status`);
  assert(rm.body.length === 1 && rm.body[0].status === '离队', '活跃李雷已删、同名离队李雷不受影响', JSON.stringify(rm.body));
  const att1 = await svc('GET', `/rest/v1/activity_attendance?activity_id=in.(${A1.id},${A2.id})&member_name=eq.李雷&select=member_id,member_name,status`);
  assert(att1.body.length === 2 && att1.body.every(r => r.member_id === null && r.member_name === '李雷'),
    'SET NULL 实测：考勤行 member_id 空、member_name 快照在（2 行）', JSON.stringify(att1.body));
  const wl1 = await svc('GET', `/rest/v1/wishlists?guild_id=eq.${guildId}&select=id`);
  assert(wl1.body.length === 0, '心愿单已级联删除（0 行）');
  const lt1 = await svc('GET', `/rest/v1/loot_records?guild_id=eq.${guildId}&select=character_id,item_stats`);
  assert(lt1.body.length === 1 && lt1.body[0].character_id === null && lt1.body[0].item_stats.assignedTo === '李雷',
    '装备记录保留：character_id 空、assignedTo 快照在', JSON.stringify(lt1.body));
  const trash = await svc('GET', `/rest/v1/deleted_raid_members?guild_id=eq.${guildId}&name=eq.李雷&select=name,class,spec,status,history_counts,deleted_by`);
  assert(trash.body.length === 1 && trash.body[0].class === '战士' && trash.body[0].spec === '防护',
    '垃圾桶行：全字段快照完整', JSON.stringify(trash.body));
  const hc = trash.body[0] && trash.body[0].history_counts;
  assert(hc && hc.attendance === 2 && hc.wishlist === 1 && hc.loot === 1,
    '垃圾桶 history_counts = 考勤2/心愿1/装备1', JSON.stringify(hc));
  assert(trash.body[0] && trash.body[0].deleted_by === owner.uid, '垃圾桶 deleted_by = 操作者 uid');

  // 历史灰色展示：考勤详情
  await page.evaluate(id => openAttendanceDetail(id), A1.id);
  await sleep(800);
  const attHtml = await page.evaluate(() => document.getElementById('attendanceMembersList').innerHTML);
  assert(attHtml.includes('李雷') && attHtml.includes('已删除'), '考勤详情：李雷灰色「已删除」行');
  const attReadonly = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#attendanceMembersList .attend-member-row')];
    const r = rows.find(x => x.textContent.includes('李雷'));
    return r ? { hasSelect: !!r.querySelector('select'), readonly: !!r.querySelector('.attend-status-readonly'), text: r.querySelector('.attend-status-readonly')?.textContent } : null;
  });
  assert(attReadonly && !attReadonly.hasSelect && attReadonly.readonly && attReadonly.text === '出席',
    '考勤详情：已删除行状态只读（出席）', JSON.stringify(attReadonly));
  await page.screenshot({ path: path.join(SHOT_DIR, '02-attendance-deleted-gray.png') });
  await page.evaluate(() => closeModal('attendanceDetailModal'));
  await sleep(300);

  // 历史灰色展示：装备分配
  // BUG-059（任务书 #27-补丁2 方案 C 运营拍板）后预期更新：本场景恰为「同名一删一留」——活跃李雷已删、
  // 离队李雷在册，存量行 character_id 被 FK SET NULL 后按名字匹配放行离队命中 → 显「（已离队）」。
  // 「存量 NULL 行以在册成员为准」为记录在案的已知限制（补丁脚本 C(b) 同口径），旧预期「（已删除）」作废。
  await page.evaluate(() => switchPage('loot'));
  await sleep(800);
  const lootHtml = await page.evaluate(() => document.querySelector('#page-loot').innerHTML);
  assert(lootHtml.includes('李雷（已离队）'), '装备分配：李雷存量行灰色标记（BUG-059 方案 C：同名一删一留以在册成员为准→已离队）');
  await page.screenshot({ path: path.join(SHOT_DIR, '03-loot-deleted-gray.png') });

  // 统计断言（硬指标：删除前后一致）
  const after = await page.evaluate(([m3]) => ({
    m3: getAttendanceStats(m3, appData.activities).rate,
    attRows: appData.activities.reduce((c, a) => c + a.attendees.length, 0),
    pseudo: getAttendanceRankings(appData.activities, true).find(r => r.member.deleted),
  }), [M3.id]);
  assert(after.m3 === baseline.m3, '统计断言：其他成员（韩梅梅）出勤率删除前后一致 50%', JSON.stringify(after));
  assert(after.attRows === baseline.attRows, '统计断言：考勤行总数不变（历史保留）', `前 ${baseline.attRows} 后 ${after.attRows}`);
  assert(after.pseudo && after.pseudo.member.name === '李雷' && after.pseudo.rate === baseline.m1,
    '统计断言：已删除李雷伪成员出勤率与删除前一致（50%，仍计入）', JSON.stringify(after.pseudo && { name: after.pseudo.member.name, rate: after.pseudo.rate }));

  // 报表灰色展示
  await page.evaluate(() => switchPage('reports'));
  await sleep(1000);
  const rankHtml = await page.evaluate(() => document.getElementById('rankTableBody').innerHTML);
  assert(rankHtml.includes('李雷') && rankHtml.includes('已删除'), '统计报表：排名表含李雷灰色「已删除」行');
  await page.screenshot({ path: path.join(SHOT_DIR, '04-reports-deleted-gray.png') });

  // ================= 场景②：0 历史删除回归 =================
  console.log('—— 场景②：0 历史删除回归 ——');
  await page.evaluate(() => switchPage('members'));
  await sleep(800);
  const m4row = page.locator('#membersTableBody tr', { hasText: '零历史' }).first();
  await m4row.locator('button.danger').click();
  await sleep(2500); // 原生 confirm 由 dialog 监听自动 accept
  const rm4 = await svc('GET', `/rest/v1/raid_members?guild_id=eq.${guildId}&name=eq.零历史&select=id`);
  assert(rm4.body.length === 0, '0 历史成员已彻底删除');
  const trash4 = await svc('GET', `/rest/v1/deleted_raid_members?guild_id=eq.${guildId}&name=eq.零历史&select=history_counts`);
  assert(trash4.body.length === 1 && trash4.body[0].history_counts.attendance === 0 && trash4.body[0].history_counts.wishlist === 0 && trash4.body[0].history_counts.loot === 0,
    '0 历史删除同样写垃圾桶（counts 全 0）', JSON.stringify(trash4.body));

  // ================= 场景③：离队软删路径不回归 =================
  console.log('—— 场景③：离队软删不回归 ——');
  const m5row = page.locator('#membersTableBody tr', { hasText: '离队回归' }).first();
  await m5row.locator('button[title="离队"]').click(); // 🚪 离队（原生 confirm 由 dialog 监听自动 accept）
  await sleep(2000);
  const rm5 = await svc('GET', `/rest/v1/raid_members?guild_id=eq.${guildId}&name=eq.离队回归&select=id,status`);
  assert(rm5.body.length === 1 && rm5.body[0].status === '离队', '离队路径：行保留、status=离队', JSON.stringify(rm5.body));
  const att5 = await svc('GET', `/rest/v1/activity_attendance?activity_id=eq.${A1.id}&member_name=eq.离队回归&select=member_id,member_name`);
  assert(att5.body.length === 1 && att5.body[0].member_id === rm5.body[0].id, '离队路径：考勤行 member_id 保留不变（软删）', JSON.stringify(att5.body));
  const trash5 = await svc('GET', `/rest/v1/deleted_raid_members?guild_id=eq.${guildId}&name=eq.离队回归&select=id`);
  assert(trash5.body.length === 0, '离队不进垃圾桶');
  await page.screenshot({ path: path.join(SHOT_DIR, '05-departed-member.png') });

  await browser.close();

  // ================= 清理 + 复核 =================
  console.log('—— 测试数据清零 ——');
  await svc('DELETE', `/rest/v1/deleted_raid_members?guild_id=eq.${guildId}`);
  await svc('DELETE', `/rest/v1/activity_attendance?activity_id=in.(${A1.id},${A2.id})`);
  await svc('DELETE', `/rest/v1/loot_records?guild_id=eq.${guildId}`);
  await svc('DELETE', `/rest/v1/wishlists?guild_id=eq.${guildId}`);
  await svc('DELETE', `/rest/v1/raid_members?guild_id=eq.${guildId}`);
  await svc('DELETE', `/rest/v1/activities?guild_id=eq.${guildId}`);
  await svc('DELETE', `/rest/v1/guild_members?guild_id=eq.${guildId}`);
  await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`);
  await fetch(`${SB}/auth/v1/admin/users/${owner.uid}`, { method: 'DELETE', headers: SVC });
  const chk = await svc('GET', `/rest/v1/raid_members?guild_id=eq.${guildId}&select=id`);
  const chk2 = await svc('GET', `/rest/v1/deleted_raid_members?guild_id=eq.${guildId}&select=id`);
  const chk3 = await svc('GET', `/rest/v1/guilds?id=eq.${guildId}&select=id`);
  assert(chk.body.length === 0 && chk2.body.length === 0 && chk3.body.length === 0, '测试数据清零复核（raid_members/deleted_raid_members/guilds 均为 0）');

  if (serverProc) serverProc.kill();
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  if (fail) { console.log('失败项：\n - ' + fails.join('\n - ')); process.exit(1); }
})().catch(async e => {
  console.error(e);
  try { if (owner) {
    await svc('DELETE', `/rest/v1/deleted_raid_members?guild_id=eq.${guildId}`);
    await svc('DELETE', `/rest/v1/loot_records?guild_id=eq.${guildId}`);
    await svc('DELETE', `/rest/v1/wishlists?guild_id=eq.${guildId}`);
    await svc('DELETE', `/rest/v1/raid_members?guild_id=eq.${guildId}`);
    await svc('DELETE', `/rest/v1/activities?guild_id=eq.${guildId}`);
    await svc('DELETE', `/rest/v1/guild_members?guild_id=eq.${guildId}`);
    await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`);
    await fetch(`${SB}/auth/v1/admin/users/${owner.uid}`, { method: 'DELETE', headers: SVC });
  } } catch {}
  if (serverProc) serverProc.kill();
  process.exit(1);
});
