// 任务书 #23-补丁 验证：公示页 套装排序 + 三维筛选 + 掉落池主/副属性筛选 + 徽标防重叠 + HTML no-cache
// 核心断言（硬验收）：
//   ①套装排序：DOM 顺序 == class_key→spec_key 期望顺序，同职业连续；
//   ②套装三维筛选：职业/职责/专精各一例 + 清空还原，结果集与服务端参照精确相等；
//   ③主/副属性筛选：单选/组合(AND)/清空还原，显示结果集与按 boss_loot/dungeon_loot 数组算出的参照集精确相等；
//     大秘境 按BOSS/整体池 双视图下同样生效；赛季切换后筛选重置；
//   ④全部套装卡片 徽标与长文本矩形零重叠、文本不溢出卡片；
//   ⑤GET / 与 /data.html 响应头 Cache-Control: no-cache + If-Modified-Since 304；带 ?v= 的 js/css 响应头不变。
// 测试数据（T23X 前缀）自清理并复核为零。用法: node scripts/verify-task23-patch.js（PW_CHANNEL=chrome 可选）
// 截图输出 backup/2026-08-05-task23-patch/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(__dirname, '..', '.s6-ssh', 'node_modules', 'playwright-core'))); }

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-05-task23-patch');
const PORT = 15649;
const BASE = `http://localhost:${PORT}`;

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
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

let serverProc = null, testBossId = null, emptySeasonId = null;
let ref = null; // 服务端参照数据

// 与页面完全同口径地算参照结果集（赛季内 团本+大秘境 全部掉落，再过筛选谓词）
// 任务书 #28 WP2（筛选规范 v2.0）：杂项（slot='杂项'）在数据装载层过滤、页面零渲染，参照集同步排除（动态计算，不硬编码件数）；
// R9（WP3-v3，sql/22）：公开 RPC 增排 item_type IN('装饰品','幻化')，参照集同口径
function refItems(pred) {
  const all = [...ref.raidLoot, ...ref.dungeonLoot].filter(l => l.slot !== '杂项' && !['装饰品', '幻化'].includes(l.item_type));
  return all.filter(pred || (() => true)).map(l => l.item_name).sort();
}

async function setup() {
  const cs = await svc('GET', '/rest/v1/game_seasons?select=id,name,is_current,start_date&order=start_date.asc');
  const cur = cs.body.find(s => s.is_current) || cs.body[cs.body.length - 1];
  const seasonId = cur.id;
  const s1 = cs.body.find(s => s.name === 'S1');

  const [raids, dungeons, classes, specs, tierSets] = await Promise.all([
    svc('GET', `/rest/v1/game_raids?select=id,name,type&season_id=eq.${seasonId}`),
    svc('GET', `/rest/v1/game_dungeons?select=id,name&season_id=eq.${seasonId}`),
    svc('GET', '/rest/v1/game_classes?select=id,name_zh,class_key'),
    svc('GET', '/rest/v1/game_specs?select=id,class_id,name_zh,spec_key,role'),
    svc('GET', `/rest/v1/tier_sets?select=id,class_id,spec_id,set_name,bonus_2,bonus_4&season_id=eq.${seasonId}`),
  ]);
  // R13（WP3-v4 / BUG-062）：世界BOSS（type='world'）不属副本场景，公示页剔除——参照集同口径排除；lair 巢穴归团本口径保留
  const raidIds = raids.body.filter(r => r.type !== 'world').map(r => r.id);
  const dungeonIds = dungeons.body.map(d => d.id);
  const inList = ids => ids.length ? `in.(${ids.join(',')})` : 'in.(00000000-0000-0000-0000-000000000000)';
  const [bosses, raidLoot, dungeonLoot] = await Promise.all([
    svc('GET', `/rest/v1/game_bosses?select=id,raid_id,dungeon_id,name&raid_id=${inList(raidIds)}`),
    svc('GET', `/rest/v1/boss_loot?select=id,boss_id,item_name,slot,item_type,primary_stats,secondary_stats&boss_id=${inList((await svc('GET', `/rest/v1/game_bosses?select=id&raid_id=${inList(raidIds)}`)).body.map(b => b.id))}`),
    svc('GET', `/rest/v1/dungeon_loot?select=id,dungeon_id,boss_id,item_name,slot,item_type,primary_stats,secondary_stats&dungeon_id=${inList(dungeonIds)}`),
  ]);
  ref = {
    seasonId, s1Id: s1 ? s1.id : null,
    classes: classes.body, specs: specs.body, tierSets: tierSets.body,
    raidLoot: raidLoot.body, dungeonLoot: dungeonLoot.body, dungeonIds,
  };

  // 测试数据：挂在当前赛季第一个副本下（原锚点「毒牙祭坛」已随当前赛季切换漂移出赛季，2026-08-06 刷新）
  const dungeonId = ref.dungeonIds[0];
  const b = await svc('POST', '/rest/v1/game_bosses', { dungeon_id: dungeonId, name: 'T23X补丁王', boss_order: 91 });
  if (b.status !== 201) throw new Error('建测试 BOSS 失败: ' + JSON.stringify(b.body));
  testBossId = b.body[0].id;
  const lootRows = [
    { dungeon_id: dungeonId, boss_id: testBossId, item_name: 'T23X力量战斧', slot: '武器', item_type: '双手斧', primary_stats: ['力量'], secondary_stats: ['急速'] },
    { dungeon_id: dungeonId, boss_id: testBossId, item_name: 'T23X智力法杖', slot: '武器', item_type: '法杖', primary_stats: ['智力'], secondary_stats: ['爆击'] },
    { dungeon_id: dungeonId, boss_id: null, item_name: 'T23X全能项坠', slot: '颈部', item_type: '项链', primary_stats: ['力量'], secondary_stats: ['爆击', '全能'] },
  ];
  const l = await svc('POST', '/rest/v1/dungeon_loot', lootRows);
  if (l.status !== 201) throw new Error('建测试掉落失败: ' + JSON.stringify(l.body));
  // 参照集同步纳入测试数据
  ref.dungeonLoot = [...ref.dungeonLoot, ...l.body];

  // 空赛季（赛季切换重置筛选实测用）
  const es = await svc('POST', '/rest/v1/game_seasons', { name: 'T23X空赛季', start_date: '2020-02-02', is_current: false });
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
  try { const r = await svc('DELETE', `/rest/v1/dungeon_loot?item_name=like.T23X*`); steps.push(`loot:${r.status}`); } catch { steps.push('loot:ERR'); }
  if (testBossId) { try { const r = await svc('DELETE', `/rest/v1/game_bosses?id=eq.${testBossId}`); steps.push(`boss:${r.status}`); } catch { steps.push('boss:ERR'); } }
  if (emptySeasonId) { try { const r = await svc('DELETE', `/rest/v1/game_seasons?id=eq.${emptySeasonId}`); steps.push(`season:${r.status}`); } catch { steps.push('season:ERR'); } }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const c1 = await svc('GET', '/rest/v1/dungeon_loot?select=id&item_name=like.T23X*');
  const c2 = await svc('GET', '/rest/v1/game_bosses?select=id&name=like.T23X*');
  const c3 = await svc('GET', '/rest/v1/game_seasons?select=id&name=like.T23X*');
  const n1 = Array.isArray(c1.body) ? c1.body.length : '?', n2 = Array.isArray(c2.body) ? c2.body.length : '?', n3 = Array.isArray(c3.body) ? c3.body.length : '?';
  console.log(`[清理复核] T23X 掉落=${n1} BOSS=${n2} 赛季=${n3}`);
  check('测试数据清零复核（T23X 掉落/BOSS/赛季 全 0）', n1 === 0 && n2 === 0 && n3 === 0, `掉落=${n1} BOSS=${n2} 赛季=${n3}`);
}

// 页面显示中的装备名集合（团本+大秘境两区全部卡片）
const displayedItems = () => [...document.querySelectorAll('.dp-item .dp-item-name')].map(e => e.textContent).sort();
// 页面显示中的套装卡片「职业 · 专精」序列（保持 DOM 顺序）
const displayedTiers = () => [...document.querySelectorAll('.dp-tier .dp-tier-class')].map(e => e.textContent.trim());

const eqSet = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await setup();

  // ---- 修正项⑤：响应头实测（等价 curl -sI）----
  const h1 = await fetch(`${BASE}/`, { method: 'GET' });
  const h2 = await fetch(`${BASE}/data.html`);
  check('⑤ GET / 响应头 Cache-Control: no-cache', (h1.headers.get('cache-control') || '').includes('no-cache'), h1.headers.get('cache-control') || '缺失');
  check('⑤ GET /data.html 响应头 Cache-Control: no-cache', (h2.headers.get('cache-control') || '').includes('no-cache'), h2.headers.get('cache-control') || '缺失');
  const lm = h1.headers.get('last-modified');
  check('⑤ GET / 带 Last-Modified（304 校验基础）', !!lm, lm || '缺失');
  const h304 = await fetch(`${BASE}/`, { headers: { 'If-Modified-Since': lm || new Date().toUTCString() } });
  check('⑤ If-Modified-Since 回源校验 → 304 不重传', h304.status === 304, `HTTP ${h304.status}`);
  const hj = await fetch(`${BASE}/js/dataPublic.js?v=20260805.7`);
  const hc = await fetch(`${BASE}/css/main.css?v=20260805.7`);
  check('⑤ 带 ?v= 的 js/css 响应头维持现状（无 Cache-Control）', hj.status === 200 && !hj.headers.get('cache-control') && hc.status === 200 && !hc.headers.get('cache-control'),
    `js:${hj.headers.get('cache-control') || '无'} css:${hc.headers.get('cache-control') || '无'}`);

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

      await page.goto(`${BASE}/data.html`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.dp-tier', { timeout: 20000 });
      await sleep(1200);

      // ============ 修正项①：套装排序断言（同职业连续、与 class_key→spec_key 一致） ============
      const classRank = new Map([...ref.classes].sort((a, b) => (a.class_key || 0) - (b.class_key || 0)).map((c, i) => [c.id, i]));
      const specRank = new Map(ref.specs.map(s => [s.id, s.spec_key != null ? s.spec_key : 999]));
      const clsName = id => (ref.classes.find(c => c.id === id) || {}).name_zh || '';
      const specName = id => (ref.specs.find(s => s.id === id) || {}).name_zh || '';
      const expectedTiers = [...ref.tierSets].sort((a, b) => {
        const ca = classRank.has(a.class_id) ? classRank.get(a.class_id) : 999;
        const cb = classRank.has(b.class_id) ? classRank.get(b.class_id) : 999;
        if (ca !== cb) return ca - cb;
        return (specRank.has(a.spec_id) ? specRank.get(a.spec_id) : 999) - (specRank.has(b.spec_id) ? specRank.get(b.spec_id) : 999);
      }).map(t => `${clsName(t.class_id)} · ${specName(t.spec_id)}`);
      const domTiers = await page.evaluate(displayedTiers);
      check(`[${vp.tag}] ①套装排序：DOM 顺序 == 职业(class_key)→专精(spec_key) 期望顺序（同职业连续）`,
        eqSet(domTiers, expectedTiers), `卡片 ${domTiers.length} 张，前三=${domTiers.slice(0, 3).join(' / ')}`);

      // 套装排序断言截图（套装区滚入视口）
      await page.evaluate(() => {
        const s = [...document.querySelectorAll('.dp-section')].find(x => x.innerText.includes('套装一览'));
        if (s) s.scrollIntoView();
      });
      await sleep(400);
      await page.screenshot({ path: path.join(SHOT_DIR, `${vp.tag}-tier-sorted.png`) });

      // ============ 修正项②：套装三维筛选（各一例 + 清空还原） ============
      // 职业一例：取当前赛季套装数最多的职业
      const byClass = {};
      ref.tierSets.forEach(t => { byClass[t.class_id] = (byClass[t.class_id] || 0) + 1; });
      const topClassId = Object.keys(byClass).sort((a, b) => byClass[b] - byClass[a])[0];
      const expClass = ref.tierSets.filter(t => t.class_id === topClassId).map(t => `${clsName(t.class_id)} · ${specName(t.spec_id)}`).sort();
      await page.selectOption('#dpTierClass', topClassId);
      await sleep(600);
      const gotClass = (await page.evaluate(displayedTiers)).sort();
      check(`[${vp.tag}] ②套装筛选-职业「${clsName(topClassId)}」：结果集精确匹配`, eqSet(gotClass, [...expClass].sort()), `${gotClass.length}/${expClass.length} 张`);

      // 专精一例（随职业联动：该职业下第一个专精）
      const aSpec = ref.specs.filter(s => s.class_id === topClassId).sort((a, b) => (a.spec_key || 0) - (b.spec_key || 0))[0];
      const expSpec = ref.tierSets.filter(t => t.spec_id === aSpec.id).map(t => `${clsName(t.class_id)} · ${specName(t.spec_id)}`).sort();
      const specOptions = await page.evaluate(() => [...document.getElementById('dpTierSpec').options].map(o => o.textContent));
      const linkOk = specOptions.every(t => t === '全部专精' || ref.specs.some(s => s.class_id === topClassId && s.name_zh === t));
      await page.selectOption('#dpTierSpec', aSpec.id);
      await sleep(600);
      const gotSpec = (await page.evaluate(displayedTiers)).sort();
      check(`[${vp.tag}] ②套装筛选-专精「${aSpec.name_zh}」（选项随职业联动=${linkOk ? '是' : '否'}）：结果集精确匹配`,
        linkOk && eqSet(gotSpec, expSpec), `${gotSpec.length}/${expSpec.length} 张`);

      // 职责一例：清空职业/专精后选 坦克
      await page.selectOption('#dpTierClass', '');
      await sleep(400);
      await page.selectOption('#dpTierSpec', '');
      await sleep(400);
      await page.selectOption('#dpTierRole', 'TANK');
      await sleep(600);
      const expRole = ref.tierSets.filter(t => { const sp = ref.specs.find(s => s.id === t.spec_id); return sp && sp.role === 'TANK'; })
        .map(t => `${clsName(t.class_id)} · ${specName(t.spec_id)}`).sort();
      const gotRole = (await page.evaluate(displayedTiers)).sort();
      check(`[${vp.tag}] ②套装筛选-职责「坦克」：结果集精确匹配`, eqSet(gotRole, expRole), `${gotRole.length}/${expRole.length} 张`);

      // 清空还原
      await page.selectOption('#dpTierRole', '');
      await page.selectOption('#dpTierSpec', '');
      await page.selectOption('#dpTierClass', '');
      await sleep(600);
      const gotAll = await page.evaluate(displayedTiers);
      check(`[${vp.tag}] ②套装筛选-清空还原：卡片数回到全集`, eqSet(gotAll, expectedTiers), `${gotAll.length}/${expectedTiers.length} 张`);

      // ============ 修正项③：主/副属性筛选（AND，结果集精确匹配） ============
      const clickChip = (row, v) => page.evaluate(([r, val]) => {
        [...document.querySelectorAll(`${r} .dp-chip`)].find(c => c.dataset.v === val).click();
      }, [row, v]);

      // 主属性单选一例：力量
      await clickChip('#dpPrimaryChips', '力量');
      await sleep(600);
      let exp = refItems(l => (l.primary_stats || []).includes('力量'));
      let got = await page.evaluate(displayedItems);
      check(`[${vp.tag}] ③主属性单选「力量」：结果集精确匹配（无智力装备混入）`, eqSet(got, exp), `${got.length}/${exp.length} 件`);

      // 副属性单选一例：爆击（先撤力量）
      await clickChip('#dpPrimaryChips', '力量');
      await clickChip('#dpSecondaryChips', '爆击');
      await sleep(600);
      exp = refItems(l => (l.secondary_stats || []).includes('爆击'));
      got = await page.evaluate(displayedItems);
      check(`[${vp.tag}] ③副属性单选「爆击」：结果集精确匹配`, eqSet(got, exp), `${got.length}/${exp.length} 件`);

      // 组合一例：主=力量 AND 副=爆击
      await clickChip('#dpPrimaryChips', '力量');
      await sleep(600);
      exp = refItems(l => (l.primary_stats || []).includes('力量') && (l.secondary_stats || []).includes('爆击'));
      got = await page.evaluate(displayedItems);
      check(`[${vp.tag}] ③组合「力量 AND 爆击」：结果集精确匹配（AND 语义）`, eqSet(got, exp), `${got.length}/${exp.length} 件=${got.join(',')}`);

      // 双视图筛选生效：按 BOSS 视图截图 → 切整体池视图再核对+截图
      await page.evaluate(() => {
        const s = [...document.querySelectorAll('.dp-section')].find(x => x.innerText.includes('大秘境掉落池'));
        if (s) s.scrollIntoView();
      });
      await sleep(300);
      await page.screenshot({ path: path.join(SHOT_DIR, `${vp.tag}-mplus-filtered-boss-view.png`) });
      const gotBossView = await page.evaluate(displayedItems);
      await page.evaluate(() => { [...document.querySelectorAll('.dp-toggle')].find(b => b.dataset.view === 'pool').click(); });
      await sleep(600);
      const gotPoolView = await page.evaluate(displayedItems);
      check(`[${vp.tag}] ③大秘境双视图筛选均生效（按BOSS ≡ 整体池 ≡ 参照集）`,
        eqSet(gotBossView, exp) && eqSet(gotPoolView, exp), `boss视图 ${gotBossView.length} / pool视图 ${gotPoolView.length} / 参照 ${exp.length}`);
      await page.evaluate(() => {
        const s = [...document.querySelectorAll('.dp-section')].find(x => x.innerText.includes('大秘境掉落池'));
        if (s) s.scrollIntoView();
      });
      await sleep(300);
      await page.screenshot({ path: path.join(SHOT_DIR, `${vp.tag}-mplus-filtered-pool-view.png`) });
      await page.evaluate(() => { [...document.querySelectorAll('.dp-toggle')].find(b => b.dataset.view === 'boss').click(); });
      await sleep(500);

      // 清空还原一例：撤掉全部 chips → 回到全集
      await clickChip('#dpPrimaryChips', '力量');
      await clickChip('#dpSecondaryChips', '爆击');
      await sleep(600);
      exp = refItems();
      got = await page.evaluate(displayedItems);
      check(`[${vp.tag}] ③清空还原：结果集回到未筛选全集`, eqSet(got, exp), `${got.length}/${exp.length} 件`);

      // 赛季切换后筛选重置（仅 1366 档）：挂上筛选 → 切空赛季 → 控件全部复位
      if (vp.tag === '1366') {
        await clickChip('#dpPrimaryChips', '力量');
        await clickChip('#dpSourceChips', 'raid'); // 任务书 #28 WP2 起部位/类型筛选彻底取消（#dpSlotChips 不存在），改挂 v2.0 等价维度：来源单选
        await page.fill('#dpSearch', 'T23X');
        await sleep(500);
        await page.selectOption('#dpSeasonSelect', emptySeasonId);
        await sleep(900);
        const resetState = await page.evaluate(() => ({
          chips: document.querySelectorAll('.dp-filterbar .dp-chip.active:not(.dp-chip-all)').length, // 值 chips 全覆盖；「全部」chip 空选即 active=默认态（筛选规范 §3），不计入
          search: document.getElementById('dpSearch').value,
          tierCls: document.getElementById('dpTierClass').value,
          tierRole: document.getElementById('dpTierRole').value,
          tierSpec: document.getElementById('dpTierSpec').value,
        }));
        const allReset = resetState.chips === 0 && !resetState.search
          && !resetState.tierCls && !resetState.tierRole && !resetState.tierSpec;
        check('[1366] ③赛季切换后全部筛选重置为默认', allReset, JSON.stringify(resetState));
        await page.screenshot({ path: path.join(SHOT_DIR, '1366-empty-season-filter-reset.png') });
        await page.selectOption('#dpSeasonSelect', ref.seasonId);
        await sleep(900);
      }

      // ============ 修正项④：徽标与长文本排版（S1 有效果文本赛季 + 当前赛季） ============
      const overlapAudit = () => {
        const bad = [];
        document.querySelectorAll('.dp-tier').forEach(card => {
          const title = card.querySelector('.dp-tier-class') ? card.querySelector('.dp-tier-class').textContent.trim() : '?';
          const cardR = card.getBoundingClientRect();
          card.querySelectorAll('.dp-tier-bonus').forEach(b => {
            const tag = b.querySelector('.dp-tag');
            const text = b.querySelector('.dp-tier-bonus-text');
            if (!tag || !text) return;
            const tr = tag.getBoundingClientRect(), xr = text.getBoundingClientRect();
            const overlap = !(tr.right <= xr.left + 0.5 || xr.right <= tr.left + 0.5);
            const overflow = xr.right > cardR.right + 0.5 || xr.bottom > cardR.bottom + 0.5 || tr.bottom > cardR.bottom + 0.5;
            if (overlap || overflow) bad.push(`${title}${overlap ? ' 重叠' : ''}${overflow ? ' 溢出' : ''}`);
          });
        });
        return { total: document.querySelectorAll('.dp-tier').length, bad };
      };
      // 当前赛季
      let audit = await page.evaluate(overlapAudit);
      check(`[${vp.tag}] ④当前赛季套装卡片 徽标×长文本 零重叠零溢出`, audit.bad.length === 0, `检查 ${audit.total} 张${audit.bad.length ? ' 异常: ' + audit.bad.join(' | ') : ''}`);
      // S1（2/4 件效果长文本在案赛季，含「猎人 · 野兽控制」长文本卡片）
      if (ref.s1Id) {
        await page.selectOption('#dpSeasonSelect', ref.s1Id);
        await sleep(1000);
        audit = await page.evaluate(overlapAudit);
        const bmCard = await page.evaluate(() => {
          const c = [...document.querySelectorAll('.dp-tier')].find(x => x.innerText.includes('野兽控制'));
          if (!c) return null;
          const r = c.getBoundingClientRect();
          return { found: true, lines: Math.round(r.height / 16), h: Math.round(r.height) };
        });
        check(`[${vp.tag}] ④S1 长文本赛季（含野兽控制卡=${bmCard ? '在' : '缺'}）零重叠零溢出`, audit.bad.length === 0,
          `检查 ${audit.total} 张${audit.bad.length ? ' 异常: ' + audit.bad.join(' | ') : ''}`);
        if (vp.tag === '1366' && bmCard) {
          await page.evaluate(() => {
            const c = [...document.querySelectorAll('.dp-tier')].find(x => x.innerText.includes('野兽控制'));
            if (c) c.scrollIntoView({ block: 'center' });
          });
          await sleep(300);
          await page.screenshot({ path: path.join(SHOT_DIR, '1366-tier-bm-hunter-badge-fix.png') });
        }
        await page.selectOption('#dpSeasonSelect', ref.seasonId);
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
  console.log(`\n===== 任务书#23-补丁 验证: ${passed}/${results.length} 通过，截图 → ${SHOT_DIR} =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
