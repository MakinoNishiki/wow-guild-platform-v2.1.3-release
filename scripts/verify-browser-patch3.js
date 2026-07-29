// 任务书 #14-补丁3 浏览器实测（playwright chromium，headless）
// 覆盖：BUG-051 装备库 picker 全链路 / 特效「装备：」去重 / REQ-062 团号三态+旧记录兼容 /
//       套装物化显示+解绑填写 / 专精表列对齐（1366×768 与 1920 双档）/ 日期 Ctrl+A yyyy / 「其他」下拉合并
// 用法: node scripts/verify-browser-patch3.js   （前置：npm i playwright，浏览器缓存已就绪）
// 取证截图输出到 backup/2026-07-29-patch3/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-07-29-patch3');
const PORT = 15619;
const BASE = `http://localhost:${PORT}`;
const EMAIL = 'patch3-test@wowbutler.cn';
const PWD = 'Patch3-2026!';

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
let testUid = null, testGuildId = null, tempLootId = null, tempTierId = null;

async function setup() {
  // 1. 测试用户
  let res = await fetch(`${SB}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PWD, data: { display_name: '补丁3验收' } }),
  });
  let body = await res.json();
  if (!body.access_token) {
    res = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PWD }),
    });
    body = await res.json();
    if (!body.access_token) throw new Error('测试用户登录失败: ' + JSON.stringify(body));
  }
  testUid = body.user.id;
  // 2. superadmin
  await fetch(`${SB}/auth/v1/admin/users/${testUid}`, { method: 'PUT', headers: SVC, body: JSON.stringify({ app_metadata: { role: 'superadmin' } }) });
  // 3. 公会 + owner 成员
  const g = await svc('POST', '/rest/v1/guilds', { name: '补丁3验收会', owner_id: testUid, invite_code: 'PT3A' + Date.now().toString(36).slice(-4).toUpperCase() });
  if (g.status !== 201) throw new Error('建会失败: ' + JSON.stringify(g.body));
  testGuildId = g.body[0].id;
  const gm = await svc('POST', '/rest/v1/guild_members', { guild_id: testGuildId, user_id: testUid, role: 'owner' });
  if (gm.status !== 201) throw new Error('建会成员失败: ' + JSON.stringify(gm.body));
  // 4. 静态服务器
  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }
  // 5. 临时掉落行（特效文本自带「装备：」前缀，验证显示层去重）——必须在浏览器加载前插入，否则 MasterData 缓存不含该行
  const someLoot = await svc('GET', '/rest/v1/boss_loot?select=boss_id&limit=1');
  const bossId = someLoot.body[0].boss_id;
  const tmp = await svc('POST', '/rest/v1/boss_loot', { boss_id: bossId, item_name: '补丁3特效验证剑', slot: '武器', item_type: '双手剑', effect: '装备：攻击附带剧毒' });
  if (tmp.status !== 201) throw new Error('临时掉落行插入失败: ' + JSON.stringify(tmp.body));
  tempLootId = tmp.body[0].id;
}

async function cleanup() {
  try { if (tempLootId) await svc('DELETE', `/rest/v1/boss_loot?id=eq.${tempLootId}`); } catch {}
  try { if (tempTierId) await svc('DELETE', `/rest/v1/tier_sets?id=eq.${tempTierId}`); } catch {}
  try { if (testGuildId) await svc('DELETE', `/rest/v1/guilds?id=eq.${testGuildId}`); } catch (e) { console.error('删公会失败', e); }
  try { if (testUid) await fetch(`${SB}/auth/v1/admin/users/${testUid}`, { method: 'DELETE', headers: SVC }); } catch (e) { console.error('删用户失败', e); }
  if (serverProc) serverProc.kill();
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await setup();
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const pageErrors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => pageErrors.push('pageerror: ' + e.message));
    page.on('console', msg => { if (msg.type() === 'error') pageErrors.push('console: ' + msg.text()); });

    // ---------- 登录 ----------
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
    await page.fill('#authEmail', EMAIL);
    await page.fill('#authPassword', PWD);
    await page.click('#authLoginBtn');
    await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
    await sleep(2500); // 主数据加载
    check('0. 登录进入主应用', true);

    // ---------- A. BUG-051：装备库 picker 全链路 + 特效去重 ----------
    await page.click('.nav-item[data-page="loot"]');
    await page.click('button:has-text("+ 添加装备")');
    await page.waitForSelector('#lootModal.show', { timeout: 10000 });
    await page.click('button:has-text("从装备库选择")');
    await page.waitForSelector('#itemDbModal.show', { timeout: 10000 });
    await page.waitForSelector('#itemDbList .item-card', { timeout: 15000 });

    // 特效去重断言
    const effectText = await page.evaluate(() => {
      const card = [...document.querySelectorAll('#itemDbList .item-card')].find(c => c.textContent.includes('补丁3特效验证剑'));
      const eff = card && card.querySelector('.loot-effect-green');
      return eff ? eff.textContent.trim() : null;
    });
    check('A1. 特效「装备：」不重复', effectText === '装备：攻击附带剧毒', effectText);

    const errBefore = pageErrors.length;
    await page.click('#itemDbList .item-card:has-text("补丁3特效验证剑")');
    await sleep(400);
    const btnEnabled = await page.evaluate(() => !document.getElementById('itemDbConfirmBtn').disabled);
    check('A2. 选中装备后「确认选择」可用', btnEnabled);
    await page.screenshot({ path: path.join(SHOT_DIR, 'A-bug051-picker-selected.png') });
    await page.click('#itemDbConfirmBtn');
    await sleep(600);
    const lootNameVal = await page.evaluate(() => document.getElementById('lootName').value);
    const lootModalOpen = await page.evaluate(() => document.getElementById('lootModal').classList.contains('show'));
    check('A3. BUG-051 确认后装备进入分配行', lootNameVal === '补丁3特效验证剑' && lootModalOpen, `lootName=${lootNameVal}`);
    check('A4. picker 交互零 JS 错误', pageErrors.length === errBefore, pageErrors.slice(errBefore).join(' | ') || '无');
    await page.screenshot({ path: path.join(SHOT_DIR, 'A-bug051-confirmed.png') });
    await page.click('#lootModal .modal-close');
    await sleep(300);

    // ---------- B. REQ-062：团号徽章三态 + 旧记录兼容 ----------
    await page.click('.nav-item[data-page="attendance"]');
    await sleep(500);
    await page.evaluate(() => {
      appData.activities = [
        { id: 'pt3-a', date: '2026-07-29', raid_name: '补丁3数字团号', start_time: '20:00', end_time: '23:00', notes: '', status: 'normal', team_tag: '', team_label: '1', attendees: [] },
        { id: 'pt3-b', date: '2026-07-29', raid_name: '补丁3文字团号', start_time: '20:00', end_time: '23:00', notes: '', status: 'normal', team_tag: '', team_label: '战战子', attendees: [] },
        { id: 'pt3-c', date: '2026-07-28', raid_name: '补丁3旧记录兼容', start_time: '20:00', end_time: '23:00', notes: '', status: 'normal', team_tag: '', attendees: [] },
      ];
      renderAttendance();
    });
    await sleep(500);
    const badgeCheck = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.activity-item')];
      // 按卡片标题(h4)精确匹配——textContent 会命中冲突提示行里的对方活动名（B2 误判教训）
      const byName = n => cards.find(c => (c.querySelector('h4') || {}).textContent && c.querySelector('h4').textContent.includes(n));
      const num = byName('补丁3数字团号');
      const txt = byName('补丁3文字团号');
      const old = byName('补丁3旧记录兼容');
      const numTag = num && num.querySelector('.tag-gold');
      const txtTag = txt && txt.querySelector('.tag-gold');
      const noClip = el => el && el.clientWidth === el.scrollWidth;
      return {
        numText: numTag ? numTag.textContent.trim() : null,
        txtText: txtTag ? txtTag.textContent.trim() : null,
        oldHasBadge: !!(old && old.querySelector('.tag-gold')),
        numNoClip: noClip(numTag), txtNoClip: noClip(txtTag),
        oldRendered: !!old,
      };
    });
    check('B1. 纯数字团号显示「N 团」', badgeCheck.numText === '1 团', badgeCheck.numText);
    check('B2. 文字团号显示「团号：X」', badgeCheck.txtText === '团号：战战子', badgeCheck.txtText);
    check('B3. 旧记录（无 team_label）正常渲染无徽章', badgeCheck.oldRendered && !badgeCheck.oldHasBadge);
    check('B4. 徽章文字不被裁剪', badgeCheck.numNoClip && badgeCheck.txtNoClip, `num=${badgeCheck.numNoClip} txt=${badgeCheck.txtNoClip}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'B-req062-badges.png') });
    // 表单含团号输入框
    await page.click('button:has-text("+ 创建活动")');
    await page.waitForSelector('#activityModal.show', { timeout: 10000 });
    const hasTeamLabelInput = await page.evaluate(() => !!document.getElementById('activityTeamLabel'));
    check('B5. 活动表单含「团号」输入框', hasTeamLabelInput);
    await page.screenshot({ path: path.join(SHOT_DIR, 'B-req062-form.png') });
    await page.click('#activityModal .modal-close');
    await sleep(300);

    // ---------- C. 套装物化显示 + 解绑填写 ----------
    await page.click('#navDatacenter');
    await sleep(1500);
    await page.click('#mdTabs .view-tab[data-mdtab="tiersets"]');
    await sleep(1200);
    // S2 套装名物化断言（战士=翡翠督军的统御）
    await page.selectOption('#mdPanel select', { label: 'S2' });
    await sleep(1200);
    const s2Warrior = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#mdPanel tr')].filter(tr => tr.textContent.includes('战士'));
      return rows.map(tr => tr.querySelector('.md-tier-setname') && tr.querySelector('.md-tier-setname').value);
    });
    check('C1. S2 战士全专精行套装名已物化', s2Warrior.length === 3 && s2Warrior.every(v => v === '翡翠督军的统御'), JSON.stringify(s2Warrior));
    await page.screenshot({ path: path.join(SHOT_DIR, 'C-tiersets-s2.png'), fullPage: true });
    // S1 战士（无套装名行）：直接填 2 件效果 → 应可独立建行（解绑）
    await page.selectOption('#mdPanel select', { label: 'S1' });
    await sleep(1200);
    await page.evaluate(() => {
      const tr = [...document.querySelectorAll('#mdPanel tr')].find(tr => tr.textContent.includes('战士'));
      const inputs = tr.querySelectorAll('input');
      const bonus2 = inputs[1]; // [套装名, 2件, 4件]
      bonus2.value = '补丁3解绑验证';
      bonus2.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await sleep(2500);
    const tierRow = await svc('GET', `/rest/v1/tier_sets?bonus_2=eq.补丁3解绑验证&select=id,set_name,bonus_2`);
    const tierOk = tierRow.body.length === 1 && tierRow.body[0].set_name === '';
    if (tierRow.body[0]) tempTierId = tierRow.body[0].id;
    check('C2. 无套装名时 2 件效果可独立填写保存', tierOk, JSON.stringify(tierRow.body[0] || null));
    await page.screenshot({ path: path.join(SHOT_DIR, 'C-tiersets-unbind.png') });

    // ---------- D. 专精表列对齐（双档） ----------
    await page.click('#mdTabs .view-tab[data-mdtab="specs"]');
    await sleep(1500);
    const alignAt = async () => page.evaluate(() => {
      const tables = [...document.querySelectorAll('.md-specs-table')];
      if (!tables.length) return null;
      const pos = tables.map(t => {
        const ths = t.querySelectorAll('th');
        return [1, 2, 3].map(i => Math.round(ths[i].getBoundingClientRect().x));
      });
      const ref = pos[0];
      return pos.every(p => p.every((x, i) => Math.abs(x - ref[i]) <= 1));
    });
    const align1366 = await alignAt();
    check('D1. 专精表四列对齐（1366×768）', align1366);
    await page.screenshot({ path: path.join(SHOT_DIR, 'D-specs-1366.png'), fullPage: true });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await sleep(800);
    const align1920 = await alignAt();
    check('D2. 专精表四列对齐（1920 宽屏）', align1920);
    await page.screenshot({ path: path.join(SHOT_DIR, 'D-specs-1920.png'), fullPage: true });
    await page.setViewportSize({ width: 1366, height: 768 });
    await sleep(500);

    // ---------- E. 日期 Ctrl+A yyyy ----------
    await page.click('.nav-item[data-page="attendance"]');
    await sleep(500);
    await page.click('button:has-text("+ 创建活动")');
    await page.waitForSelector('#activityModal.show', { timeout: 10000 });
    await page.click('#activityDate');
    await page.keyboard.press('Control+a');
    await sleep(400);
    await page.screenshot({ path: path.join(SHOT_DIR, 'E-date-ctrl-a.png') });
    const dateVisibleText = await page.evaluate(() => {
      // 遮罩文本存在且原生文本透明（computed color rgba(0,0,0,0)）
      const input = document.getElementById('activityDate');
      const color = getComputedStyle(input).color;
      const mask = input.parentElement.querySelector('.date-zh-text');
      return { color, maskText: mask ? mask.textContent : null };
    });
    check('E1. 日期 Ctrl+A 后原生文本透明', dateVisibleText.color === 'rgba(0, 0, 0, 0)', JSON.stringify(dateVisibleText));
    // Ctrl+A 选中态被拦截（无原生分段高亮自绘）：document 无 selection、输入保持焦点即可
    const selState = await page.evaluate(() => {
      const sel = window.getSelection();
      return { selLen: sel ? String(sel).length : -1, active: document.activeElement && document.activeElement.id };
    });
    check('E2. 有值日期框 Ctrl+A 不产生选中态', selState.selLen === 0, JSON.stringify(selState));
    await page.click('#activityModal .modal-close');
    await sleep(300);
    // 空值日期框（运营报障现场：数据中心 新增版本-上线日）
    await page.click('#navDatacenter');
    await sleep(1200);
    await page.click('#mdTabs .view-tab[data-mdtab="patches"]');
    await sleep(1000);
    await page.click('button:has-text("+ 新增版本")');
    await page.waitForSelector('#mdEditorModal.show', { timeout: 10000 });
    await page.click('#mdField_release_date');
    await page.keyboard.press('Control+a');
    await sleep(400);
    await page.screenshot({ path: path.join(SHOT_DIR, 'E-date-ctrl-a-empty.png') });
    const emptySel = await page.evaluate(() => {
      const sel = window.getSelection();
      const mask = document.querySelector('#mdField_release_date') && document.querySelector('#mdField_release_date').parentElement.querySelector('.date-zh-text');
      return { selLen: sel ? String(sel).length : -1, maskText: mask ? mask.textContent : null };
    });
    check('E3. 空值日期框 Ctrl+A 无 yyyy 透出（无选中态+遮罩占位）', emptySel.selLen === 0 && emptySel.maskText === '年 / 月 / 日', JSON.stringify(emptySel));
    await page.click('#mdEditorModal .modal-close');
    await sleep(300);

    // ---------- F. 「其他」下拉合并 ----------
    await page.click('#navDatacenter');
    await sleep(1200);
    await page.click('#mdTabs .view-tab[data-mdtab="loot"]');
    await sleep(1200);
    await page.click('button:has-text("+ 新增掉落")');
    await page.waitForSelector('#mdEditorModal.show', { timeout: 10000 });
    const slotOpts = await page.evaluate(() => [...document.getElementById('mdField_slot').options].map(o => o.textContent));
    const typeOpts = await page.evaluate(() => [...document.getElementById('mdField_item_type').options].map(o => o.textContent));
    check('F1. 部位下拉无「其他」，保留「其他（手动输入）」', !slotOpts.includes('其他') && slotOpts.includes('其他（手动输入）'), slotOpts.join('/'));
    check('F2. 类型下拉无「其他」，保留「其他（手动输入）」', !typeOpts.includes('其他') && typeOpts.includes('其他（手动输入）'), typeOpts.join('/'));
    await page.screenshot({ path: path.join(SHOT_DIR, 'F-loot-no-other.png') });
    await page.click('#mdEditorModal .modal-close');
    await sleep(300);

    // 全程 JS 错误汇总（A 段已单独断言，这里给总览）
    console.log('\n== 页面 JS 错误总览 ==');
    console.log(pageErrors.length ? pageErrors.join('\n') : '（无）');
  } finally {
    await browser.close();
    await cleanup();
  }

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 补丁3 浏览器实测: ${passed}/${results.length} 通过 =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
