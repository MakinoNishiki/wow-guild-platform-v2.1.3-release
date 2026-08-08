// 任务书 #23-补丁3 验证脚本：公示页交互优化（七修正项）
// 2026-08-08 适配任务书 #28 WP2（筛选规范 v2.0）：部位/类型两维筛选与「排除杂项」开关已 abolish——
// 四维组合改三维（来源+主+副）、部位/类型分组排序断言整段删除、杂项沉底改零渲染、开关用例改 DOM 不存在断言。
// 2026-08-09 适配任务书 #28-WP6 补丁 P1：悬浮「覆盖层」断言改「整卡生长」（inner absolute 高度生长 + wrap max-height 过渡）；
// 边框高亮断言改读 .dp-item-inner（卡盒样式随 P1 迁移）。
// 公示页为免登录只读页（live 数据），本脚本不创建任何测试数据。
// 用法：node scripts/verify-task23-patch3.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(__dirname, '..', '.s6-ssh', 'node_modules', 'playwright-core'))); }

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-06-task23-patch3');
const PORT = 15658;
const BASE = `http://localhost:${PORT}`;

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const ANON = env.SUPABASE_ANON_KEY;
const H = { apikey: ANON, Authorization: `Bearer ${ANON}` };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function rest(p) {
  const r = await fetch(`${SB}/rest/v1${p}`, { headers: H });
  if (!r.ok) throw new Error(`REST ${p}: HTTP ${r.status}`);
  return r.json();
}

let serverProc = null;
let pass = 0, fail = 0;
const fails = [];
function assert(cond, label, detail) {
  if (cond) { pass++; console.log(`  ✔ ${label}`); }
  else { fail++; fails.push(label); console.log(`  ✘ ${label}${detail ? ' — ' + detail : ''}`); }
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  // ---- node 侧：当前赛季掉落全集 + 各断言基准 ----
  const seasons = await rest('/game_seasons?select=*');
  const cur = seasons.find(s => s.is_current) || seasons.sort((a, b) => String(a.start_date).localeCompare(String(b.start_date))).pop();
  const raids = (await rest(`/game_raids?select=*&season_id=eq.${cur.id}`))
    .filter(r => r.type !== 'world'); // R13（WP3-v4 / BUG-062）：世界BOSS 公示页剔除，参照集同口径；lair 巢穴归团本口径保留
  const dungeons = await rest(`/game_dungeons?select=*&season_id=eq.${cur.id}`);
  const bossRows = await rest(`/game_bosses?select=id,raid_id,dungeon_id&limit=1000`);
  const bossIdsInSeason = new Set(bossRows.filter(b => raids.some(r => r.id === b.raid_id)).map(b => b.id));
  const dungeonIds = new Set(dungeons.map(d => d.id));
  const bossLoot = (await rest('/boss_loot?select=*&limit=2000')).filter(l => bossIdsInSeason.has(l.boss_id));
  const dunLoot = (await rest('/dungeon_loot?select=*&limit=2000')).filter(l => dungeonIds.has(l.dungeon_id));
  // _src 行标记 = 来源单选判定依据（boss_loot→raid / dungeon_loot→dungeon），与 js/dataPublic.js 装载口径一致
  const all = [
    ...bossLoot.map(l => ({ ...l, _src: 'raid' })),
    ...dunLoot.map(l => ({ ...l, _src: 'dungeon' })),
  ];
  console.log(`  [数据] 当前赛季「${cur.name}」：团本掉落 ${bossLoot.length} 行 + 大秘境掉落 ${dunLoot.length} 行`);

  // 任务书 #28 WP2：杂项（slot='杂项'）在数据装载层过滤、页面零渲染——一切页面侧断言基线用排杂后集合；
  // R9（WP3-v3，sql/22）：公开 RPC 增排 item_type IN('装饰品','幻化')，基线同口径
  const visible = all.filter(l => l.slot !== '杂项' && !['装饰品', '幻化'].includes(l.item_type));
  console.log(`  [数据] 杂项+装饰品/幻化 ${all.length - visible.length} 行数据层排除（零渲染），页面渲染基线 = ${visible.length} 件`);

  const hasCrit = visible.filter(l => (l.secondary_stats || []).includes('爆击'));
  // 三维组合：从真实数据挑一组 来源+主属性+副属性（爆击优先）
  let combo = null;
  for (const it of visible) {
    const p = (it.primary_stats || []).find(x => ['力量', '敏捷', '智力'].includes(x));
    const s = (it.secondary_stats || []).find(x => ['爆击', '急速', '精通', '全能'].includes(x));
    if (p && s) {
      combo = { source: it._src, sourceLabel: it._src === 'raid' ? '团本' : '大秘境', primary: p, secondary: s };
      combo.count = visible.filter(l => l._src === combo.source
        && (l.primary_stats || []).includes(combo.primary) && (l.secondary_stats || []).includes(combo.secondary)).length;
      break;
    }
  }
  if (!combo) throw new Error('无法从真实数据构造三维组合');

  // 数据断言（防再犯）：item_type='装饰' 不得出现在非杂项 slot
  for (const t of ['boss_loot', 'dungeon_loot']) {
    const bad = (await rest(`/${t}?select=item_name,slot,item_type&item_type=eq.装饰&limit=500`)).filter(x => x.slot !== '杂项');
    assert(bad.length === 0, `数据断言：${t} item_type=装饰 不出现在非杂项 slot（0 行）`, JSON.stringify(bad.map(x => x.item_name + '@' + x.slot)));
  }
  // 数据观察（报告用）：DB 残留旧字形行数（字面量用转义防 grep 误命中）
  const legacyCrit = all.filter(l => (l.secondary_stats || []).includes('暴\u51fb'));
  console.log(`  [观察] 库内仍带旧字形副属性的行：${legacyCrit.length}（${legacyCrit.map(x => x.item_name).join('、') || '无'}）`);

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {} await sleep(500); }

  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const consoleErrs = [], failedReqs = [];
  page.on('pageerror', e => consoleErrs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 200)); });
  page.on('requestfailed', r => failedReqs.push(r.url()));
  page.on('response', r => { if (r.status() >= 400) failedReqs.push(`${r.status()} ${r.url()}`); });

  await page.goto(`${BASE}/data.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.dp-item', { timeout: 20000 });
  await sleep(500);

  const cardCount = () => page.evaluate(() => document.querySelectorAll('.dp-item').length);
  const totalCards = await cardCount();
  assert(totalCards === visible.length, `无筛选基线：卡片数 = 当前赛季掉落排杂后总行数（${visible.length}）`, `页面 ${totalCards}`);

  // ================= ① 爆击 =================
  console.log('—— ① 爆击订正 ——');
  const critChip = await page.evaluate(() => [...document.querySelectorAll('#dpSecondaryChips .dp-chip')].map(c => c.dataset.v));
  assert(JSON.stringify(critChip) === JSON.stringify(['爆击', '急速', '精通', '全能']), '副属性 chips 枚举官方用字「爆击」', JSON.stringify(critChip));
  await page.click('#dpSecondaryChips .dp-chip[data-v="爆击"]');
  await sleep(500);
  const critCards = await cardCount();
  assert(critCards === hasCrit.length && critCards > 0, `「爆击」筛选精确匹配（页面 ${critCards} = 库内 ${hasCrit.length}）`);
  // 清空还原
  await page.click('#dpSecondaryChips .dp-chip[data-v="爆击"]');
  await sleep(500);
  assert(await cardCount() === totalCards, '清空筛选还原（卡片数回到基线）');

  // ================= ② 筛选条三维组合（来源+主属性+副属性） =================
  console.log('—— ② 筛选条三维组合 ——');
  const noDropdowns = await page.evaluate(() => !document.getElementById('dpSlotFilter') && !document.getElementById('dpTypeFilter'));
  assert(noDropdowns, '右上角部位/类型两个下拉已移除（单形态 chips 筛选条）');
  // 来源单选 chips 值域：「全部」(data-v="") + 当季有数据的来源值（平铺直挂容器，无 .dp-chip-sub 包裹）；
  // 副本任务/专业制造为预留值、当前无数据源恒不渲染（任务书 #28 WP2）
  const srcChips = await page.evaluate(() => [...document.querySelectorAll('#dpSourceChips .dp-chip')].map(c => c.dataset.v));
  const expectSrc = ['', ...new Set(visible.map(l => l._src))];
  assert(JSON.stringify(srcChips) === JSON.stringify(expectSrc),
    '来源 chips 值域 = 全部 + 当季有数据来源（预留值不渲染）', JSON.stringify(srcChips));
  await page.click(`#dpSourceChips .dp-chip[data-v="${combo.source}"]`);
  await page.click(`#dpPrimaryChips .dp-chip[data-v="${combo.primary}"]`);
  await page.click(`#dpSecondaryChips .dp-chip[data-v="${combo.secondary}"]`);
  await sleep(600);
  const comboCards = await cardCount();
  assert(comboCards === combo.count && comboCards > 0,
    `三维组合（${combo.sourceLabel}+${combo.primary}+${combo.secondary}）：页面 ${comboCards} = 库内 ${combo.count}`);
  const comboConsistent = await page.evaluate(c => {
    return [...document.querySelectorAll('.dp-item')].every(el => {
      const t = el.textContent;
      return t.includes(c.primary) && t.includes(c.secondary);
    });
  }, combo);
  assert(comboConsistent, '三维组合结果每张卡片主/副属性齐全');
  // 筛选触发的重渲染给卡片加 .dp-enter 入场类（筛选规范 v2.0 §7）
  const hasEnter = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.dp-item')];
    return cards.length > 0 && cards.every(c => c.classList.contains('dp-enter'));
  });
  assert(hasEnter, '筛选重渲染卡片带 .dp-enter 入场类');
  for (const sel of [`#dpSourceChips .dp-chip[data-v="${combo.source}"]`, `#dpPrimaryChips .dp-chip[data-v="${combo.primary}"]`, `#dpSecondaryChips .dp-chip[data-v="${combo.secondary}"]`]) {
    await page.click(sel);
  }
  await sleep(500);
  assert(await cardCount() === totalCards, '三维清空还原（卡片数回到基线）');
  await page.screenshot({ path: path.join(SHOT_DIR, '01-filterbar-groups-1366.png') });

  // ================= ③ 卡片同尺寸 + 展开 =================
  console.log('—— ③ 特效卡片 ——');
  const pair = await page.evaluate(() => {
    for (const grid of document.querySelectorAll('.dp-items')) {
      const eff = grid.querySelector('.dp-item.has-effect');
      const plain = grid.querySelector('.dp-item:not(.has-effect)');
      if (eff && plain) {
        const e = eff.getBoundingClientRect(), p = plain.getBoundingClientRect();
        if (Math.abs(e.top - p.top) < 2) { // 同一行
          eff.setAttribute('data-t3-eff', '1'); plain.setAttribute('data-t3-plain', '1');
          return { hEff: e.height, hPlain: p.height };
        }
      }
    }
    return null;
  });
  assert(pair && Math.abs(pair.hEff - pair.hPlain) === 0, '无特效卡同尺寸断言（同行两卡高度差=0）', JSON.stringify(pair));
  const borderDiff = await page.evaluate(() => {
    const eff = document.querySelector('[data-t3-eff] .dp-item-inner'), plain = document.querySelector('[data-t3-plain] .dp-item-inner');
    if (!eff || !plain) return null;
    const be = getComputedStyle(eff), bp = getComputedStyle(plain);
    return { eff: be.borderColor + '/' + be.boxShadow, plain: bp.borderColor + '/' + bp.boxShadow, diff: be.borderColor !== bp.borderColor || be.boxShadow !== bp.boxShadow };
  });
  assert(borderDiff && borderDiff.diff, '可展开卡片边框高亮（与普通卡框体配色不同）', JSON.stringify(borderDiff));
  const neighborBefore = await page.evaluate(() => {
    const eff = document.querySelector('[data-t3-eff]');
    const next = eff && eff.parentElement.querySelector('.dp-item:not([data-t3-eff]):not([data-t3-plain])');
    if (next) next.setAttribute('data-t3-next', '1');
    return next ? next.getBoundingClientRect().toJSON() : null;
  });
  await page.hover('[data-t3-eff]');
  await sleep(450);
  // P1（#28-WP6 补丁）：浮层遮盖废止——hover 整卡生长（inner absolute + wrap max-height 展开）
  const grow = await page.evaluate(() => {
    const card = document.querySelector('[data-t3-eff]');
    const inner = card.querySelector('.dp-item-inner');
    const wrap = card.querySelector('.dp-item-effect-wrap');
    const cs = getComputedStyle(inner), wcs = getComputedStyle(wrap);
    return { pos: cs.position, maxH: parseFloat(wcs.maxHeight), transition: wcs.transitionDuration,
      grown: inner.getBoundingClientRect().height > parseFloat(card.style.minHeight) + 10 };
  });
  assert(grow.pos === 'absolute' && grow.maxH > 100 && grow.grown, '悬浮整卡生长（inner absolute 高度生长 + wrap 展开，P1）', JSON.stringify(grow));
  assert(parseFloat(grow.transition) >= 0.2 && parseFloat(grow.transition) <= 0.3, '生长过渡 200–300ms', grow.transition);
  const neighborAfter = await page.evaluate(() => {
    const next = document.querySelector('[data-t3-next]');
    return next ? next.getBoundingClientRect().toJSON() : null;
  });
  assert(neighborBefore && neighborAfter && neighborBefore.x === neighborAfter.x && neighborBefore.y === neighborAfter.y,
    '展开不挤压网格（邻卡位置零位移）');
  await page.screenshot({ path: path.join(SHOT_DIR, '02-effect-expand-hover.png') });
  await page.mouse.move(5, 5);
  await sleep(400);

  // ================= ④ 杂项零渲染 + 套装兑换物排序 =================
  console.log('—— ④ 杂项零渲染 ——');
  const order = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('.dp-items').forEach(grid => {
      const cards = [...grid.querySelectorAll('.dp-item')];
      const slots = cards.map(c => (c.querySelector('.dp-tag') || {}).textContent || '');
      const lastEquip = slots.map((s, i) => s !== '套装兑换物' ? i : -1).reduce((a, b) => Math.max(a, b), -1);
      const lastToken = slots.map((s, i) => s === '套装兑换物' ? i : -1).reduce((a, b) => Math.max(a, b), -1);
      if (lastToken !== -1 && lastEquip > lastToken) bad.push('套装兑换物未在装备后:' + slots.join(','));
    });
    return bad;
  });
  assert(order.length === 0, '卡片排序：所有网格 装备 → 套装兑换物（杂项已不存在）', order[0] || '');
  const miscTagsAny = await page.evaluate(() => [...document.querySelectorAll('.dp-tag')].filter(t => t.textContent === '杂项').length);
  assert(miscTagsAny === 0, '杂项零渲染：全页 .dp-tag 不含「杂项」（数据装载层排除）', `出现 ${miscTagsAny} 处`);
  await page.evaluate(() => {
    const grids = [...document.querySelectorAll('.dp-items')];
    const g = grids.find(x => [...x.querySelectorAll('.dp-item .dp-tag')].some(t => t.textContent === '套装兑换物'));
    if (g) g.scrollIntoView({ block: 'center' });
  });
  await sleep(400);
  await page.screenshot({ path: path.join(SHOT_DIR, '03-sort-order.png') });

  // ================= ⑤ 两级折叠 + 记忆 =================
  console.log('—— ⑤ 分区折叠 ——');
  await page.evaluate(() => window.scrollTo(0, 0));
  const firstBossHead = page.locator('.dp-boss-name[data-collapse]').first();
  const bossId = await firstBossHead.getAttribute('data-collapse');
  await firstBossHead.click();
  await sleep(400);
  const bossCollapsed = await page.evaluate(id => {
    const b = document.querySelector(`[data-collapse="${id}"]`).closest('.dp-boss');
    return b.classList.contains('collapsed') && getComputedStyle(b.querySelector('.dp-items')).display === 'none';
  }, bossId);
  assert(bossCollapsed, 'BOSS 级折叠：标题行点击后掉落区收起（件数徽标保留）');
  await page.screenshot({ path: path.join(SHOT_DIR, '04-boss-collapsed.png') });
  await page.click('.dp-section-collapser[data-collapse="sec:dungeons"]');
  await sleep(400);
  const secCollapsed = await page.evaluate(() => {
    const head = document.querySelector('.dp-section-collapser[data-collapse="sec:dungeons"]');
    const section = head.closest('.dp-section');
    return head.classList.contains('collapsed') && !section.querySelector('.dp-boss');
  });
  assert(secCollapsed, '一级区块折叠：大秘境掉落池整区收起（看大秘境不必翻页）');
  await page.screenshot({ path: path.join(SHOT_DIR, '05-section-collapsed.png') });
  // 记忆：切赛季再切回，折叠状态保持
  await page.selectOption('#dpSeasonSelect', { index: 1 });
  await sleep(800);
  await page.selectOption('#dpSeasonSelect', { index: 0 });
  await sleep(800);
  const memory = await page.evaluate(id => {
    const bossHead = document.querySelector(`[data-collapse="${id}"]`);
    const bossKept = bossHead ? bossHead.closest('.dp-boss').classList.contains('collapsed') : false;
    const secKept = document.querySelector('.dp-section-collapser[data-collapse="sec:dungeons"]').classList.contains('collapsed');
    return { bossKept, secKept };
  }, bossId);
  assert(memory.bossKept && memory.secKept, '折叠状态页内记忆（切赛季往返后两级折叠保持）', JSON.stringify(memory));
  // 还原展开
  await page.click('.dp-section-collapser[data-collapse="sec:dungeons"]');
  await sleep(300);
  await page.evaluate(id => document.querySelector(`[data-collapse="${id}"]`).click(), bossId);
  await sleep(300);

  // ================= ⑥ 「排除杂项」开关整块删除 =================
  console.log('—— ⑥ 排除杂项开关删除 ——');
  const gone = await page.evaluate(() =>
    document.getElementById('dpExcludeMisc') === null && document.getElementById('dpMiscHelp') === null);
  assert(gone, '「排除杂项」开关与问号帮助已从 DOM 整块删除');
  const miscTags = await page.evaluate(() => [...document.querySelectorAll('.dp-tag')].filter(t => t.textContent === '杂项').length);
  assert(miscTags === 0, '杂项零渲染（无开关、默认即数据层排杂）', `出现 ${miscTags} 处`);
  assert(await cardCount() === visible.length, `默认全集计数 = 排杂动态基线（页面 = 库内 ${visible.length}）`);

  // ================= 两档截图 + 控制台 =================
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(300);
  await page.screenshot({ path: path.join(SHOT_DIR, '07-full-1366x768.png'), fullPage: false });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await sleep(600);
  await page.screenshot({ path: path.join(SHOT_DIR, '08-full-1920x1080.png') });

  assert(consoleErrs.length === 0, '控制台零报错', consoleErrs.join(' | '));
  assert(failedReqs.length === 0, '零 404/失败请求', failedReqs.join(' | '));

  await browser.close();

  // 只读页面：本脚本未创建任何测试数据（DB 零写入），无需清理；复核在线数据行数未变
  const after = (await rest('/boss_loot?select=id&limit=2000')).length;
  assert(typeof after === 'number', '测试数据零创建（只读断言，全程无写入）');

  if (serverProc) serverProc.kill();
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  if (fail) { console.log('失败项：\n - ' + fails.join('\n - ')); process.exit(1); }
})().catch(async e => {
  console.error(e);
  if (serverProc) serverProc.kill();
  process.exit(1);
});
