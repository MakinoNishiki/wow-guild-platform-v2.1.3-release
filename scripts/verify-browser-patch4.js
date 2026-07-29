// 任务书 #14-补丁4 浏览器实测（playwright chromium，headless）
// 覆盖：REQ-063 装备库选择自动带出赛季（链路完整回填 / 链路缺数据留空 / 零 JS 错误）
//       REQ-064 团队标签去重（面板只剩团号一个字段 / 写路径不携带 team_tag / 团号三态徽章 /
//       旧数据迁移后徽章正常显示 / 冲突检测按 team_label 分组 / 编辑回填）
// 用法: node scripts/verify-browser-patch4.js   （前置：npm i playwright，浏览器缓存已就绪）
// 取证截图输出到 backup/2026-07-29-patch4/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-07-29-patch4');
const PORT = 15623;
const BASE = `http://localhost:${PORT}`;
const EMAIL = 'patch4-test@wowbutler.cn';
const PWD = 'Patch4-2026!';

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
let testUid = null, testGuildId = null;
let tmpRaidId = null, tmpBossId = null, tmpLootId = null;   // REQ-063 负例：无赛季团本链
let chainedItem = null;                                     // REQ-063 正例：链路完整的既有掉落
let tmpActId = null;                                        // REQ-064 迁移模拟活动
let teamTagColumnExists = false;

async function setup() {
  // 1. 测试用户
  let res = await fetch(`${SB}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PWD, data: { display_name: '补丁4验收' } }),
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
  // 2. 公会 + owner 成员
  const g = await svc('POST', '/rest/v1/guilds', { name: '补丁4验收会', owner_id: testUid, invite_code: 'PT4A' + Date.now().toString(36).slice(-4).toUpperCase() });
  if (g.status !== 201) throw new Error('建会失败: ' + JSON.stringify(g.body));
  testGuildId = g.body[0].id;
  const gm = await svc('POST', '/rest/v1/guild_members', { guild_id: testGuildId, user_id: testUid, role: 'owner' });
  if (gm.status !== 201) throw new Error('建会成员失败: ' + JSON.stringify(gm.body));

  // 3. REQ-063 正例：从既有 boss_loot 找一条 掉落→BOSS→团本→赛季 链路完整的装备
  const loots = await svc('GET', '/rest/v1/boss_loot?select=id,item_name,boss_id&limit=50');
  if (!Array.isArray(loots.body) || !loots.body.length) throw new Error('boss_loot 无数据，无法实测 REQ-063');
  for (const l of loots.body) {
    const boss = await svc('GET', `/rest/v1/game_bosses?id=eq.${l.boss_id}&select=raid_id`);
    const raidId = boss.body && boss.body[0] && boss.body[0].raid_id;
    if (!raidId) continue;
    const raid = await svc('GET', `/rest/v1/game_raids?id=eq.${raidId}&select=name,season_id`);
    const r = raid.body && raid.body[0];
    if (!r || !r.season_id) continue;
    const season = await svc('GET', `/rest/v1/game_seasons?id=eq.${r.season_id}&select=name`);
    const s = season.body && season.body[0];
    if (!s || !s.name) continue;
    chainedItem = { itemName: l.item_name, raidName: r.name, seasonName: s.name };
    break;
  }
  if (!chainedItem) throw new Error('未找到链路完整的既有掉落，无法实测 REQ-063 正例');
  console.log(`[setup] REQ-063 正例装备：${chainedItem.itemName}（${chainedItem.raidName} → ${chainedItem.seasonName}）`);

  // 4. REQ-063 负例：临时 无赛季团本 + BOSS + 掉落（必须在浏览器加载前插入，否则 MasterData 缓存不含）
  const tr = await svc('POST', '/rest/v1/game_raids', { name: '补丁4无赛季本', season_id: null, type: 'raid', min_players: 20, max_players: 20 });
  if (tr.status !== 201) throw new Error('临时团本插入失败: ' + JSON.stringify(tr.body));
  tmpRaidId = tr.body[0].id;
  const tb = await svc('POST', '/rest/v1/game_bosses', { raid_id: tmpRaidId, name: '补丁4无赛季王', boss_order: 1 });
  if (tb.status !== 201) throw new Error('临时BOSS插入失败: ' + JSON.stringify(tb.body));
  tmpBossId = tb.body[0].id;
  const tl = await svc('POST', '/rest/v1/boss_loot', { boss_id: tmpBossId, item_name: '补丁4无赛季剑', slot: '武器', item_type: '双手剑' });
  if (tl.status !== 201) throw new Error('临时掉落插入失败: ' + JSON.stringify(tl.body));
  tmpLootId = tl.body[0].id;

  // 5. REQ-064 迁移模拟：team_tag 列仍在库时，造一条「旧字段有值、team_label 为空」的历史活动
  const probe = await svc('GET', '/rest/v1/activities?select=team_tag&limit=1');
  teamTagColumnExists = probe.status !== 400;
  console.log(`[setup] activities.team_tag 列${teamTagColumnExists ? '仍存在，执行迁移模拟' : '已不存在（sql/13 已执行？），迁移模拟改为直接验证徽章'}`);
  const actRow = {
    guild_id: testGuildId, name: '补丁4迁移模拟 - 2026-07-29', activity_date: '2026-07-29',
    raid: '补丁4迁移模拟', start_time: '20:00', end_time: '23:00', status: 'normal',
  };
  if (teamTagColumnExists) actRow.team_tag = '3'; // 旧字段有值、team_label 留空
  const ta = await svc('POST', '/rest/v1/activities', actRow);
  if (ta.status !== 201) throw new Error('迁移模拟活动插入失败: ' + JSON.stringify(ta.body));
  tmpActId = ta.body[0].id;

  // 6. 静态服务器
  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }
}

async function cleanup() {
  try { if (tmpActId) await svc('DELETE', `/rest/v1/activities?id=eq.${tmpActId}`); } catch {}
  try { await svc('DELETE', `/rest/v1/activities?guild_id=eq.${testGuildId}`); } catch {}
  try { if (tmpLootId) await svc('DELETE', `/rest/v1/boss_loot?id=eq.${tmpLootId}`); } catch {}
  try { if (tmpBossId) await svc('DELETE', `/rest/v1/game_bosses?id=eq.${tmpBossId}`); } catch {}
  try { if (tmpRaidId) await svc('DELETE', `/rest/v1/game_raids?id=eq.${tmpRaidId}`); } catch {}
  try { if (testGuildId) await svc('DELETE', `/rest/v1/guilds?id=eq.${testGuildId}`); } catch (e) { console.error('删公会失败', e); }
  try { if (testUid) await fetch(`${SB}/auth/v1/admin/users/${testUid}`, { method: 'DELETE', headers: SVC }); } catch (e) { console.error('删用户失败', e); }
  if (serverProc) serverProc.kill();
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await setup();
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const pageErrors = [];
  const dbWritePayloads = []; // 经代理的写请求体，用于断言不再携带 team_tag
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => pageErrors.push('pageerror: ' + e.message));
    page.on('console', msg => { if (msg.type() === 'error') pageErrors.push('console: ' + msg.text()); });
    page.on('request', req => {
      if (req.url().includes('/api/db/') && (req.method() === 'POST' || req.method() === 'PATCH')) {
        dbWritePayloads.push(req.postData() || '');
      }
    });

    // ---------- 登录 ----------
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
    await page.fill('#authEmail', EMAIL);
    await page.fill('#authPassword', PWD);
    await page.click('#authLoginBtn');
    await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
    await sleep(2500); // 主数据加载
    check('0. 登录进入主应用', true);

    // ---------- A. REQ-063：装备库选择自动带出赛季 ----------
    const pickFromDb = async (itemName) => {
      await page.click('button:has-text("从装备库选择")');
      await page.waitForSelector('#itemDbModal.show', { timeout: 10000 });
      await page.waitForSelector('#itemDbList .item-card', { timeout: 15000 });
      await page.fill('#itemDbSearch', itemName);
      await sleep(400);
      await page.click(`#itemDbList .item-card:has-text("${itemName}")`);
      await sleep(400);
      await page.click('#itemDbConfirmBtn');
      await sleep(600);
    };

    await page.click('.nav-item[data-page="loot"]');
    await page.click('button:has-text("+ 添加装备")');
    await page.waitForSelector('#lootModal.show', { timeout: 10000 });

    // A1 正例：链路完整 → 赛季自动回填
    const errBeforeA = pageErrors.length;
    await pickFromDb(chainedItem.itemName);
    const a1 = await page.evaluate(() => ({
      name: document.getElementById('lootName').value,
      raid: document.getElementById('lootRaid').value,
      season: document.getElementById('lootSeason').value,
      modalOpen: document.getElementById('lootModal').classList.contains('show'),
    }));
    check('A1. REQ-063 链路完整：赛季自动回填', a1.season === chainedItem.seasonName && a1.name === chainedItem.itemName && a1.modalOpen,
      `赛季=${a1.season || '(空)'}（期望 ${chainedItem.seasonName}）装备=${a1.name} 团本=${a1.raid}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'A1-req063-season-filled.png') });
    // 赛季字段在弹窗下半区，滚到底部单独取证
    await page.evaluate(() => { const b = document.querySelector('#lootModal .modal-body'); if (b) b.scrollTop = b.scrollHeight; });
    await sleep(300);
    await page.screenshot({ path: path.join(SHOT_DIR, 'A1b-req063-season-field.png') });

    // A2 负例：团本无赛季（链路缺数据）→ 留空不报错
    await pickFromDb('补丁4无赛季剑');
    const a2 = await page.evaluate(() => ({
      name: document.getElementById('lootName').value,
      season: document.getElementById('lootSeason').value,
    }));
    check('A2. REQ-063 链路缺数据：赛季留空', a2.name === '补丁4无赛季剑' && a2.season === '', `赛季=${a2.season || '(空)'} 装备=${a2.name}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'A2-req063-season-empty.png') });
    check('A3. REQ-063 全程零 JS 错误', pageErrors.length === errBeforeA, pageErrors.slice(errBeforeA).join(' | ') || '无');
    await page.click('#lootModal .modal-close');
    await sleep(300);

    // ---------- B. REQ-064：团队标签去重 ----------
    await page.click('.nav-item[data-page="attendance"]');
    await sleep(800);

    // B1 面板只剩一个团号字段
    await page.click('button:has-text("+ 创建活动")');
    await page.waitForSelector('#activityModal.show', { timeout: 10000 });
    const b1 = await page.evaluate(() => ({
      oldInput: !!document.getElementById('activityTeamTag'),
      newInput: !!document.getElementById('activityTeamLabel'),
      oldLabel: [...document.querySelectorAll('#activityModal .form-label')].some(l => l.textContent.includes('团队标签')),
      newLabel: [...document.querySelectorAll('#activityModal .form-label')].some(l => l.textContent.includes('团号')),
    }));
    check('B1. REQ-064 面板只剩「团号」一个字段', !b1.oldInput && b1.newInput && !b1.oldLabel && b1.newLabel, JSON.stringify(b1));
    await sleep(600); // 等弹窗淡入动画结束再取证
    await page.screenshot({ path: path.join(SHOT_DIR, 'B1-req064-form-single-field.png') });

    // B2 写路径主链路：创建活动带团号 → toast + DB 落 team_label + 请求体不含 team_tag
    const today = '2026-07-29';
    await page.fill('#activityDate', today);
    await page.fill('#activityRaidName', '补丁4团号写路径');
    await page.fill('#activityTeamLabel', '2');
    const writesBefore = dbWritePayloads.length;
    await page.click('#activitySaveBtn');
    await page.waitForSelector('.toast', { timeout: 15000 }).catch(() => {});
    await sleep(2500);
    const dbRow = await svc('GET', `/rest/v1/activities?guild_id=eq.${testGuildId}&raid=eq.补丁4团号写路径&select=id,team_label`);
    const savedLabel = dbRow.body && dbRow.body[0] && dbRow.body[0].team_label;
    const newWrites = dbWritePayloads.slice(writesBefore).join('\n');
    check('B2. REQ-064 创建活动团号写库成功', savedLabel === '2', `DB team_label=${savedLabel}`);
    check('B3. REQ-064 写请求体不携带 team_tag', !newWrites.includes('team_tag'), newWrites.includes('team_tag') ? '发现 team_tag!' : '无');
    await page.screenshot({ path: path.join(SHOT_DIR, 'B2-req064-saved.png') });

    // B4 编辑回填
    const savedId = dbRow.body && dbRow.body[0] && dbRow.body[0].id;
    await page.evaluate((id) => { const a = appData.activities.find(x => x.id === id); showActivityModal(a); }, savedId);
    await sleep(500);
    const b4 = await page.evaluate(() => document.getElementById('activityTeamLabel').value);
    check('B4. REQ-064 编辑弹窗团号回填', b4 === '2', `团号=${b4}`);
    await page.click('#activityModal .modal-close');
    await sleep(300);

    // B5 团号三态徽章 + 无旧蓝色团队标签徽章（fixture 渲染，同补丁3手法）
    await page.evaluate(() => {
      appData.activities = [
        { id: 'pt4-a', date: '2026-07-29', raid_name: '补丁4数字团号', start_time: '20:00', end_time: '23:00', notes: '', status: 'normal', team_label: '1', attendees: [] },
        { id: 'pt4-b', date: '2026-07-29', raid_name: '补丁4文字团号', start_time: '20:00', end_time: '23:00', notes: '', status: 'normal', team_label: '战战子', attendees: [] },
        { id: 'pt4-c', date: '2026-07-28', raid_name: '补丁4空团号', start_time: '20:00', end_time: '23:00', notes: '', status: 'normal', attendees: [] },
      ];
      renderAttendance();
    });
    await sleep(500);
    const b5 = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.activity-item')];
      const byName = n => cards.find(c => (c.querySelector('h4') || {}).textContent && c.querySelector('h4').textContent.includes(n));
      const num = byName('补丁4数字团号');
      const txt = byName('补丁4文字团号');
      const old = byName('补丁4空团号');
      const numTag = num && num.querySelector('.tag-gold');
      const txtTag = txt && txt.querySelector('.tag-gold');
      return {
        numText: numTag ? numTag.textContent.trim() : null,
        txtText: txtTag ? txtTag.textContent.trim() : null,
        oldRendered: !!old,
        oldHasBadge: !!(old && old.querySelector('.tag-gold')),
        // 旧团队标签蓝色徽章（🏷）全列表不得再出现（WCL「手动标记」蓝标保留，无 🏷 图标）
        anyOldTagBadge: cards.some(c => [...c.querySelectorAll('.tag-blue')].some(t => t.textContent.includes('🏷'))),
      };
    });
    check('B5. 团号三态：纯数字→「N 团」', b5.numText === '1 团', b5.numText);
    check('B6. 团号三态：文字→「团号：X」', b5.txtText === '团号：战战子', b5.txtText);
    check('B7. 团号三态：空→不显示徽章', b5.oldRendered && !b5.oldHasBadge);
    check('B8. REQ-064 旧蓝色团队标签徽章已移除', !b5.anyOldTagBadge);
    await page.screenshot({ path: path.join(SHOT_DIR, 'B5-req064-badges.png') });

    // B9 迁移模拟：旧值迁入 team_label 后徽章正常显示
    if (teamTagColumnExists) {
      // 等价执行 sql/13 第①步（REST 无法引用列赋值，按同语义逐行 PATCH）
      const mig = await svc('PATCH', `/rest/v1/activities?id=eq.${tmpActId}`, { team_label: '3' });
      check('B9. REQ-064 迁移更新执行（REST 等价模拟 sql/13 第①步）', mig.status === 200 || mig.status === 204, `HTTP ${mig.status}`);
    }
    await page.evaluate(async () => { await window.CloudSync.reloadData('activities'); renderAttendance(); });
    await sleep(1500);
    const b10 = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.activity-item')];
      const card = cards.find(c => (c.querySelector('h4') || {}).textContent && c.querySelector('h4').textContent.includes('补丁4迁移模拟'));
      const tag = card && card.querySelector('.tag-gold');
      return { rendered: !!card, text: tag ? tag.textContent.trim() : null };
    });
    check('B10. REQ-064 迁移后旧活动徽章正常显示（team_tag=3 →「3 团」）', b10.rendered && b10.text === '3 团', `徽章=${b10.text}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'B9-req064-migrated-badge.png') });

    // B11 冲突检测按 team_label 分组：同团号交叉=冲突，不同团号交叉=不冲突
    const b11 = await page.evaluate(() => {
      appData.activities = [
        { id: 'cf-1', date: '2026-07-30', raid_name: '冲突同团甲', start_time: '20:00', end_time: '23:00', status: 'normal', team_label: '1', attendees: [] },
        { id: 'cf-2', date: '2026-07-30', raid_name: '冲突同团乙', start_time: '21:00', end_time: '22:00', status: 'normal', team_label: '1', attendees: [] },
        { id: 'cf-3', date: '2026-07-30', raid_name: '冲突异团丙', start_time: '21:00', end_time: '22:00', status: 'normal', team_label: '2', attendees: [] },
      ];
      const sameTeam = findActivityConflicts(appData.activities[1], 'cf-2').map(a => a.id);
      const diffTeam = findActivityConflicts(appData.activities[2], 'cf-3').map(a => a.id);
      renderAttendance();
      const cards = [...document.querySelectorAll('.activity-item')];
      const conflicted = cards.filter(c => c.classList.contains('activity-conflict')).map(c => c.querySelector('h4').textContent);
      return { sameTeam, diffTeam, conflicted: conflicted.join('|') };
    });
    check('B11. REQ-064 冲突检测同团号交叉报警', b11.sameTeam.includes('cf-1'), JSON.stringify(b11.sameTeam));
    check('B12. REQ-064 冲突检测异团号不报警', !b11.diffTeam.includes('cf-1') && !b11.diffTeam.includes('cf-2'), JSON.stringify(b11.diffTeam));
    check('B13. REQ-064 冲突黄色高亮只落在同团号活动', b11.conflicted.includes('冲突同团甲') && b11.conflicted.includes('冲突同团乙') && !b11.conflicted.includes('冲突异团丙'), b11.conflicted);
    await page.screenshot({ path: path.join(SHOT_DIR, 'B11-req064-conflict.png') });

    // 全程 JS 错误汇总
    console.log('\n== 页面 JS 错误总览 ==');
    console.log(pageErrors.length ? pageErrors.join('\n') : '（无）');
    check('Z. 全程零 JS 错误', pageErrors.length === 0, pageErrors.join(' | ') || '无');
  } finally {
    await browser.close();
    await cleanup();
  }

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 补丁4 浏览器实测: ${passed}/${results.length} 通过 =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
