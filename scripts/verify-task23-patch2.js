// 任务书 #23-补丁2 验证：成员管理职责筛选 AND 语义 + 公示页 chips 固定枚举 + 全部职业下拉箭头
// 核心断言：
//   ②职责多选 AND——成员职责按主/副专精推导（deriveMemberRoles），职责集合 ⊇ 选中集合才命中：
//     双职责成员（织雾=治疗+踏风=输出，存档 role 仅 ['治疗']）勾「治疗+输出」必须命中（BUG 实证复现）；
//     单职责成员不误中；单选回归；与职业下拉/搜索组合各一例；显示已离队联动；清空还原。
//   ③chips 固定枚举：主 3（力量/敏捷/智力）+ 副 4（暴击/急速/精通/全能）全量渲染不随数据增减；
//     每个属性单选结果集 = 服务端参照集精确匹配；空结果属性空态正常；AND/双视图/赛季复位不回归。
//   ①成员管理筛选条「全部职业」select 截图取证（两档）。
// 测试数据（T23Y 前缀）自清理并复核为零。用法: node scripts/verify-task23-patch2.js（PW_CHANNEL=chrome 可选）
// 截图输出 backup/2026-08-05-task23-patch2/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(__dirname, '..', '.s6-ssh', 'node_modules', 'playwright-core'))); }

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-05-task23-patch2');
const PORT = 15651;
const BASE = `http://localhost:${PORT}`;
const PWD = 'T23y-Test-2026!';
const EMAIL_OWNER = 't23y-owner@wowbutler.cn';

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

let serverProc = null, owner = null, guildId = null, emptySeasonId = null;
const createdMemberIds = [];
let ref = null;

function refItems(pred) {
  return [...ref.raidLoot, ...ref.dungeonLoot].filter(pred || (() => true)).map(l => l.item_name).sort();
}

async function setup() {
  // 登录用户 + 公会
  let res = await fetch(`${SB}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL_OWNER, password: PWD, data: { display_name: 'T23Y会长' } }),
  });
  let body = await res.json();
  if (!body.access_token) {
    res = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL_OWNER, password: PWD }),
    });
    body = await res.json();
    if (!body.access_token) throw new Error('owner 登录失败');
  }
  owner = { uid: body.user.id, token: body.access_token };
  const g = await svc('POST', '/rest/v1/guilds', { name: 'T23Y职责会', owner_id: owner.uid, invite_code: 'T23Y' + Date.now().toString(36).slice(-4).toUpperCase() });
  if (g.status !== 201) throw new Error('建会失败: ' + JSON.stringify(g.body));
  guildId = g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', { guild_id: guildId, user_id: owner.uid, role: 'owner', display_name: 'T23Y会长' });

  // 成员：A=双职责 BUG 实证（织雾+踏风，存档 role 只有 ['治疗']）；B=纯治疗；C=纯输出；D=纯坦克；E=离队治疗
  const members = [
    { name: '小时候挺聪明', class: '武僧', spec: '织雾', off_specs: ['踏风'], role: ['治疗'], status: '正式' },
    { name: 'T23Y牧小仙', class: '牧师', spec: '戒律', off_specs: ['神圣'], role: ['治疗'], status: '正式' },
    { name: 'T23Y战大', class: '战士', spec: '武器', off_specs: [], role: ['输出'], status: '正式' },
    { name: 'T23Y盾墙', class: '战士', spec: '防护', off_specs: [], role: ['坦克'], status: '正式' },
    { name: 'T23Y离队牧', class: '牧师', spec: '神圣', off_specs: [], role: ['治疗'], status: '离队' },
  ];
  for (const m of members) {
    const r = await svc('POST', '/rest/v1/raid_members', { guild_id: guildId, ...m, user_id: null });
    if (r.status !== 201) throw new Error('建成员失败 ' + m.name + ': ' + JSON.stringify(r.body));
    createdMemberIds.push(r.body[0].id);
  }

  // 公示页参照数据（当前赛季）
  const cs = await svc('GET', '/rest/v1/game_seasons?select=id,name,is_current,start_date&order=start_date.asc');
  const cur = cs.body.find(s => s.is_current) || cs.body[cs.body.length - 1];
  const seasonId = cur.id;
  const [raids, dungeons] = await Promise.all([
    svc('GET', `/rest/v1/game_raids?select=id&season_id=eq.${seasonId}`),
    svc('GET', `/rest/v1/game_dungeons?select=id&season_id=eq.${seasonId}`),
  ]);
  const raidIds = raids.body.map(r => r.id);
  const dungeonIds = dungeons.body.map(d => d.id);
  const inList = ids => ids.length ? `in.(${ids.join(',')})` : 'in.(00000000-0000-0000-0000-000000000000)';
  const raidBosses = await svc('GET', `/rest/v1/game_bosses?select=id&raid_id=${inList(raidIds)}`);
  const [raidLoot, dungeonLoot] = await Promise.all([
    svc('GET', `/rest/v1/boss_loot?select=id,item_name,primary_stats,secondary_stats&boss_id=${inList(raidBosses.body.map(b => b.id))}`),
    svc('GET', `/rest/v1/dungeon_loot?select=id,item_name,primary_stats,secondary_stats&dungeon_id=${inList(dungeonIds)}`),
  ]);
  ref = { seasonId, raidLoot: raidLoot.body, dungeonLoot: dungeonLoot.body };

  // 空赛季（赛季复位回归）
  const es = await svc('POST', '/rest/v1/game_seasons', { name: 'T23Y空赛季', start_date: '2020-03-03', is_current: false });
  if (es.status !== 201) throw new Error('建空赛季失败: ' + JSON.stringify(es.body));
  emptySeasonId = es.body[0].id;

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }
}

async function cleanup() {
  const steps = [];
  if (guildId) { try { const r = await svc('DELETE', `/rest/v1/raid_members?guild_id=eq.${guildId}`); steps.push(`members:${r.status}`); } catch { steps.push('members:ERR'); } }
  if (guildId) { try { const r = await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`); steps.push(`guilds:${r.status}`); } catch { steps.push('guilds:ERR'); } }
  if (emptySeasonId) { try { const r = await svc('DELETE', `/rest/v1/game_seasons?id=eq.${emptySeasonId}`); steps.push(`season:${r.status}`); } catch { steps.push('season:ERR'); } }
  if (owner) { try { await fetch(`${SB}/auth/v1/admin/users/${owner.uid}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); } }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  // 复核按本次创建的行 ID 判定（「小时候挺聪明」与运营真实数据同名，绝不能按名字删/数）
  const idList = createdMemberIds.length ? createdMemberIds.join(',') : '00000000-0000-0000-0000-000000000000';
  const c1 = await svc('GET', `/rest/v1/raid_members?select=id&id=in.(${idList})`);
  const c3 = await svc('GET', '/rest/v1/game_seasons?select=id&name=like.T23Y*');
  const c4 = await svc('GET', '/rest/v1/guilds?select=id&name=like.T23Y*');
  const n = [c1, c3, c4].map(c => (Array.isArray(c.body) ? c.body.length : '?'));
  console.log(`[清理复核] 本批成员=${n[0]} T23Y赛季=${n[1]} T23Y公会=${n[2]}`);
  check('测试数据清零复核（本批成员/赛季/公会 全 0）', n.every(x => x === 0), n.join('/'));
}

const displayedItems = () => [...document.querySelectorAll('.dp-item .dp-item-name')].map(e => e.textContent).sort();
const eqSet = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// 成员表当前显示的成员名：按夹具名单在 tbody 文本中检索（规避首列复选框/空态行干扰；名单内联供 page.evaluate 序列化）
const memberNames = () => {
  const FIXTURE_NAMES = ['小时候挺聪明', 'T23Y牧小仙', 'T23Y战大', 'T23Y盾墙', 'T23Y离队牧'];
  const t = document.getElementById('membersTableBody').innerText;
  return FIXTURE_NAMES.filter(n => t.includes(n));
};

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await setup();

  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const pageErrors = [];
  const notFounds = [];
  try {
    for (const vp of [{ width: 1366, height: 768, tag: '1366' }, { width: 1920, height: 1080, tag: '1920' }]) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      page.on('pageerror', e => pageErrors.push(`pageerror(${vp.tag}): ` + e.message));
      page.on('console', msg => { if (msg.type() === 'error') pageErrors.push(`console(${vp.tag}): ` + msg.text()); });
      page.on('response', r => { if (r.status() === 404) notFounds.push(`${vp.tag}: ${r.url()}`); });
      page.on('dialog', d => d.accept());

      // ============ 主应用：成员管理 职责筛选（修正项②） ============
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
      await page.fill('#authEmail', EMAIL_OWNER);
      await page.fill('#authPassword', PWD);
      await page.click('#authLoginBtn');
      await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
      await sleep(1500);
      await page.click('.nav-item[data-page="members"]');
      await sleep(1500);

      const checkRole = async (values) => { // 勾选指定职责（先全清）
        await page.evaluate(() => { document.querySelectorAll('#roleFilter input[type="checkbox"]').forEach(c => { if (c.checked) c.click(); }); });
        for (const v of values) {
          await page.evaluate(val => { [...document.querySelectorAll('#roleFilter input[type="checkbox"]')].find(c => c.value === val).click(); }, v);
        }
        await sleep(500);
      };
      const names = async () => (await page.evaluate(memberNames)).sort();

      // 清空还原基线（默认隐藏离队 → 4 人）
      await checkRole([]);
      let got = await names();
      check(`[${vp.tag}] ②清空还原：无勾选显示全部活跃成员`, eqSet(got, ['T23Y牧小仙', 'T23Y战大', 'T23Y盾墙', '小时候挺聪明'].sort()), got.join(','));

      // AND 实证：治疗+输出 → 仅双职责成员
      await checkRole(['治疗', '输出']);
      got = await names();
      check(`[${vp.tag}] ②AND「治疗+输出」：双职责成员命中、单职责不误中`, eqSet(got, ['小时候挺聪明']), got.join(',') || '(空)');

      // 单选回归：治疗 → A+B；输出 → A+C
      await checkRole(['治疗']);
      got = await names();
      check(`[${vp.tag}] ②单选「治疗」：双职责+纯治疗都命中`, eqSet(got, ['T23Y牧小仙', '小时候挺聪明'].sort()), got.join(','));
      await checkRole(['输出']);
      got = await names();
      check(`[${vp.tag}] ②单选「输出」：双职责+纯输出都命中`, eqSet(got, ['T23Y战大', '小时候挺聪明'].sort()), got.join(','));

      // 组合一例：职责「输出」+ 职业「战士」 → 仅 T23Y战大
      await page.selectOption('#classFilter', '战士');
      await sleep(500);
      got = await names();
      check(`[${vp.tag}] ②组合「输出+职业战士」：双职责被职业条件收窄`, eqSet(got, ['T23Y战大']), got.join(','));
      await page.selectOption('#classFilter', '');
      await sleep(400);

      // 组合一例：职责「治疗」+ 搜索「牧」 → 仅 T23Y牧小仙
      await checkRole(['治疗']);
      await page.fill('#memberSearch', '牧');
      await sleep(500);
      got = await names();
      check(`[${vp.tag}] ②组合「治疗+搜索"牧"」：精确命中纯治疗`, eqSet(got, ['T23Y牧小仙']), got.join(','));
      await page.fill('#memberSearch', '');
      await sleep(400);

      // 显示已离队联动：开 + 治疗 → A+B+离队牧（离队区）；关 → 离队牧消失
      await page.evaluate(() => { const c = document.getElementById('memberShowDeparted'); if (!c.checked) c.click(); });
      await sleep(600);
      got = await names();
      check(`[${vp.tag}] ②「显示已离队」开+治疗：离队治疗成员入列`, eqSet(got, ['T23Y离队牧', 'T23Y牧小仙', '小时候挺聪明'].sort()), got.join(','));
      await page.evaluate(() => { const c = document.getElementById('memberShowDeparted'); if (c.checked) c.click(); });
      await sleep(500);
      got = await names();
      check(`[${vp.tag}] ②「显示已离队」关：离队成员重新隐藏`, eqSet(got, ['T23Y牧小仙', '小时候挺聪明'].sort()), got.join(','));
      await checkRole([]);

      // ① 成员管理筛选条截图（全部职业 select 取证）
      await page.locator('.toolbar-left').first().screenshot({ path: path.join(SHOT_DIR, `${vp.tag}-members-filterbar.png`) });
      await page.locator('#classFilter').screenshot({ path: path.join(SHOT_DIR, `${vp.tag}-classFilter-select.png`) });

      // ============ 公示页：chips 固定枚举（修正项③） ============
      const page2 = await ctx.newPage();
      page2.on('pageerror', e => pageErrors.push(`pageerror2(${vp.tag}): ` + e.message));
      page2.on('console', msg => { if (msg.type() === 'error') pageErrors.push(`console2(${vp.tag}): ` + msg.text()); });
      page2.on('response', r => { if (r.status() === 404) notFounds.push(`${vp.tag}: ${r.url()}`); });
      await page2.goto(`${BASE}/data.html`, { waitUntil: 'networkidle' });
      await page2.waitForSelector('.dp-tier', { timeout: 20000 });
      await sleep(1000);

      const chipVals = await page2.evaluate(() => ({
        p: [...document.querySelectorAll('#dpPrimaryChips .dp-chip')].map(c => c.dataset.v),
        s: [...document.querySelectorAll('#dpSecondaryChips .dp-chip')].map(c => c.dataset.v),
      }));
      check(`[${vp.tag}] ③chips 固定枚举全量渲染（主 3 + 副 4，不随数据增减）`,
        eqSet(chipVals.p, ['力量', '敏捷', '智力']) && eqSet(chipVals.s, ['暴击', '急速', '精通', '全能']),
        `主=[${chipVals.p}] 副=[${chipVals.s}]`);
      await page2.locator('.dp-filterbar').screenshot({ path: path.join(SHOT_DIR, `${vp.tag}-chips-all.png`) });

      // 每个属性单选：结果集 = 服务端参照集（精确匹配）
      const clickChip2 = (row, v) => page2.evaluate(([r, val]) => {
        [...document.querySelectorAll(`${r} .dp-chip`)].find(c => c.dataset.v === val).click();
      }, [row, v]);
      let emptyEnum = null;
      for (const [row, v] of [['#dpPrimaryChips', '力量'], ['#dpPrimaryChips', '敏捷'], ['#dpPrimaryChips', '智力'],
        ['#dpSecondaryChips', '暴击'], ['#dpSecondaryChips', '急速'], ['#dpSecondaryChips', '精通'], ['#dpSecondaryChips', '全能']]) {
        const isPrimary = row === '#dpPrimaryChips';
        const exp = refItems(l => ((isPrimary ? l.primary_stats : l.secondary_stats) || []).includes(v));
        await clickChip2(row, v);
        await sleep(450);
        const got2 = await page2.evaluate(displayedItems);
        check(`[${vp.tag}] ③单选「${v}」：结果集精确匹配参照集`, eqSet(got2, exp), `${got2.length}/${exp.length} 件`);
        if (exp.length === 0) {
          const emptyOk = await page2.evaluate(() => document.getElementById('dpMain').innerText.includes('没有符合筛选条件'));
          check(`[${vp.tag}] ③空结果属性「${v}」：空态正常显示`, emptyOk);
          if (!emptyEnum) emptyEnum = v;
        }
        await clickChip2(row, v); // 撤销
        await sleep(350);
      }
      if (vp.tag === '1366') console.log(`  [i] 空结果属性: ${emptyEnum || '（当前数据 7 项均有匹配，空态断言未触发）'}`);

      // 不回归：AND + 双视图 + 赛季复位
      await clickChip2('#dpPrimaryChips', '智力');
      await clickChip2('#dpSecondaryChips', '暴击');
      await sleep(500);
      const expAnd = refItems(l => (l.primary_stats || []).includes('智力') && (l.secondary_stats || []).includes('暴击'));
      const gotAnd = await page2.evaluate(displayedItems);
      await page2.evaluate(() => { [...document.querySelectorAll('.dp-toggle')].find(b => b.dataset.view === 'pool').click(); });
      await sleep(500);
      const gotPool = await page2.evaluate(displayedItems);
      check(`[${vp.tag}] ③不回归：AND「智力+暴击」+ 整体池视图结果一致`, eqSet(gotAnd, expAnd) && eqSet(gotPool, expAnd),
        `boss ${gotAnd.length} / pool ${gotPool.length} / 参照 ${expAnd.length}`);
      await page2.evaluate(() => { [...document.querySelectorAll('.dp-toggle')].find(b => b.dataset.view === 'boss').click(); });
      await sleep(400);
      if (vp.tag === '1366') {
        await page2.selectOption('#dpSeasonSelect', emptySeasonId);
        await sleep(900);
        const reset = await page2.evaluate(() => document.querySelectorAll('.dp-filterbar .dp-chip.active').length);
        check('[1366] ③不回归：赛季切换后 chips 复位', reset === 0, `active=${reset}`);
        await page2.selectOption('#dpSeasonSelect', ref.seasonId);
        await sleep(900);
      }

      await ctx.close();
    }

    const realErrors = pageErrors.filter(e => !e.includes('status of 406'));
    check('全程零 JS 报错（406=既有噪音已排除）', realErrors.length === 0, realErrors.join(' | ') || '无');
    check('全程零 404', notFounds.length === 0, notFounds.join(' | ') || '无');
  } finally {
    await browser.close();
  }

  await cleanup();

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#23-补丁2 验证: ${passed}/${results.length} 通过，截图 → ${SHOT_DIR} =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
