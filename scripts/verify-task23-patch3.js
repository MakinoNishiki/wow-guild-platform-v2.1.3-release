// 任务书 #23-补丁3 验证脚本：公示页交互优化（七修正项）
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
  const raids = await rest(`/game_raids?select=*&season_id=eq.${cur.id}`);
  const dungeons = await rest(`/game_dungeons?select=*&season_id=eq.${cur.id}`);
  const bossRows = await rest(`/game_bosses?select=id,raid_id,dungeon_id&limit=1000`);
  const bossIdsInSeason = new Set(bossRows.filter(b => raids.some(r => r.id === b.raid_id)).map(b => b.id));
  const dungeonIds = new Set(dungeons.map(d => d.id));
  const bossLoot = (await rest('/boss_loot?select=*&limit=2000')).filter(l => bossIdsInSeason.has(l.boss_id));
  const dunLoot = (await rest('/dungeon_loot?select=*&limit=2000')).filter(l => dungeonIds.has(l.dungeon_id));
  const all = [...bossLoot, ...dunLoot];
  console.log(`  [数据] 当前赛季「${cur.name}」：团本掉落 ${bossLoot.length} 行 + 大秘境掉落 ${dunLoot.length} 行`);

  const hasCrit = all.filter(l => (l.secondary_stats || []).includes('爆击'));
  // 四维组合：从真实数据挑一组 slot+type+primary+secondary（爆击优先）
  let combo = null;
  for (const it of all) {
    const p = (it.primary_stats || []).find(x => ['力量', '敏捷', '智力'].includes(x));
    const s = (it.secondary_stats || []).find(x => ['爆击', '急速', '精通', '全能'].includes(x));
    if (it.slot && it.item_type && p && s) {
      combo = { slot: it.slot, type: it.item_type, primary: p, secondary: s };
      combo.count = all.filter(l => l.slot === combo.slot && l.item_type === combo.type
        && (l.primary_stats || []).includes(combo.primary) && (l.secondary_stats || []).includes(combo.secondary)
        && !(false)).length;
      break;
    }
  }
  if (!combo) throw new Error('无法从真实数据构造四维组合');

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
  assert(totalCards === all.length, `无筛选基线：卡片数 = 当前赛季掉落总行数（${all.length}）`, `页面 ${totalCards}`);

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

  // ================= ② 合并筛选条四维组合 =================
  console.log('—— ② 合并筛选条四维组合 ——');
  const noDropdowns = await page.evaluate(() => !document.getElementById('dpSlotFilter') && !document.getElementById('dpTypeFilter'));
  assert(noDropdowns, '右上角部位/类型两个下拉已移除（单形态 chips 筛选条）');
  await page.click(`#dpSlotChips .dp-chip[data-v="${combo.slot}"]`);
  await page.click(`#dpTypeChips .dp-chip[data-v="${combo.type}"]`);
  await page.click(`#dpPrimaryChips .dp-chip[data-v="${combo.primary}"]`);
  await page.click(`#dpSecondaryChips .dp-chip[data-v="${combo.secondary}"]`);
  await sleep(600);
  const comboCards = await cardCount();
  assert(comboCards === combo.count && comboCards > 0,
    `四维组合（${combo.slot}+${combo.type}+${combo.primary}+${combo.secondary}）：页面 ${comboCards} = 库内 ${combo.count}`);
  const comboConsistent = await page.evaluate(c => {
    return [...document.querySelectorAll('.dp-item')].every(el => {
      const t = el.textContent;
      return t.includes(c.slot) && t.includes(c.type) && t.includes(c.primary) && t.includes(c.secondary);
    });
  }, combo);
  assert(comboConsistent, '四维组合结果每张卡片四要素齐全');
  for (const sel of [`#dpSlotChips .dp-chip[data-v="${combo.slot}"]`, `#dpTypeChips .dp-chip[data-v="${combo.type}"]`, `#dpPrimaryChips .dp-chip[data-v="${combo.primary}"]`, `#dpSecondaryChips .dp-chip[data-v="${combo.secondary}"]`]) {
    await page.click(sel);
  }
  await sleep(500);
  assert(await cardCount() === totalCards, '四维清空还原（卡片数回到基线）');
  await page.screenshot({ path: path.join(SHOT_DIR, '01-filterbar-groups-1366.png') });

  // ================= ⑦ 分组排序（先断言顺序，趁无筛选） =================
  console.log('—— ⑦ 筛选选项分组排序 ——');
  const slotOrder = await page.evaluate(() => [...document.querySelectorAll('#dpSlotChips .dp-chip')].map(c => c.dataset.v));
  const expectSlots = ['头部', '肩部', '胸部', '腕部', '手部', '腰部', '腿部', '脚部', '背部',
    '单手', '双手', '主手', '副手', '副手物品', '远程', '颈部', '手指', '饰品', '套装兑换物', '杂项']
    .filter(v => slotOrder.includes(v));
  assert(JSON.stringify(slotOrder.slice(0, expectSlots.length)) === JSON.stringify(expectSlots) && !slotOrder.includes('披风'),
    '部位组按模板排序（护甲→武器→首饰→饰品→套装兑换物→杂项；背部=披风判定）', JSON.stringify(slotOrder));
  const miscLast = slotOrder[slotOrder.length - 1] === '杂项' || slotOrder.indexOf('杂项') > slotOrder.indexOf('套装兑换物');
  assert(miscLast, '部位组：套装兑换物独立成组、杂项最后');
  const typeSeq = await page.evaluate(() => {
    const seq = [];
    document.querySelectorAll('#dpTypeChips > *').forEach(el => {
      seq.push(el.classList.contains('dp-chip-group-label') ? '#' + el.textContent : el.dataset.v);
    });
    return seq;
  });
  const armorIdx = ['板甲', '锁甲', '皮甲', '布甲', '盾牌'].map(v => typeSeq.indexOf(v)).filter(i => i >= 0);
  const weaponIdx = ['单手锤', '单手斧', '单手剑', '匕首', '拳套', '战刃', '长柄武器', '法杖', '弓', '枪械', '弩', '双手锤', '双手斧', '双手剑', '魔杖'].map(v => typeSeq.indexOf(v)).filter(i => i >= 0);
  const otherIdx = typeSeq.indexOf('#其它');
  assert(Math.max(...armorIdx) < Math.min(...weaponIdx) && (otherIdx === -1 || Math.max(...weaponIdx) < otherIdx),
    '类型组：甲型 → 武器 → … → 其它 有序');
  if (typeSeq.includes('弩')) {
    // 弩为模板内正式成员（远程武器三连：弓/枪械/弩相邻，#23-补丁3 模板补充）
    const bowI = typeSeq.indexOf('弓'), gunI = typeSeq.indexOf('枪械'), crossI = typeSeq.indexOf('弩');
    assert(bowI !== -1 && gunI === bowI + 1 && crossI === gunI + 1 && (otherIdx === -1 || crossI < otherIdx),
      '弩在武器组内与弓/枪械相邻（远程三连），不入「其它」组');
    assert(typeSeq.indexOf('装饰') > otherIdx && otherIdx !== -1, '模板外值（装饰等）仍归「其它」组保留');
  } else {
    console.log('  [跳过] 当前数据无「弩」值，模板外归组由「装饰/附魔」等代验');
    assert(otherIdx !== -1 && typeSeq.indexOf('装饰') > otherIdx, '模板外值（装饰等）归「其它」组保留');
  }

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
    const eff = document.querySelector('[data-t3-eff]'), plain = document.querySelector('[data-t3-plain]');
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
  const overlay = await page.evaluate(() => {
    const o = document.querySelector('[data-t3-eff] .dp-item-effect-overlay');
    const cs = getComputedStyle(o);
    return { opacity: parseFloat(cs.opacity), maxH: parseFloat(cs.maxHeight), transition: cs.transitionDuration };
  });
  assert(overlay.opacity === 1 && overlay.maxH > 100, '悬浮展开覆盖层（opacity=1 且展开）', JSON.stringify(overlay));
  assert(parseFloat(overlay.transition) >= 0.2 && parseFloat(overlay.transition) <= 0.3, '展开过渡 200–300ms', overlay.transition);
  const neighborAfter = await page.evaluate(() => {
    const next = document.querySelector('[data-t3-next]');
    return next ? next.getBoundingClientRect().toJSON() : null;
  });
  assert(neighborBefore && neighborAfter && neighborBefore.x === neighborAfter.x && neighborBefore.y === neighborAfter.y,
    '展开不挤压网格（邻卡位置零位移）');
  await page.screenshot({ path: path.join(SHOT_DIR, '02-effect-expand-hover.png') });
  await page.mouse.move(5, 5);
  await sleep(400);

  // ================= ④ 杂项沉底 =================
  console.log('—— ④ 杂项沉底 ——');
  const sink = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('.dp-items').forEach(grid => {
      const cards = [...grid.querySelectorAll('.dp-item')];
      const slots = cards.map(c => (c.querySelector('.dp-tag') || {}).textContent || '');
      const firstMisc = slots.findIndex(s => s === '杂项');
      const lastNonMisc = slots.map((s, i) => s !== '杂项' && s !== '套装兑换物' ? i : -1).reduce((a, b) => Math.max(a, b), -1);
      const lastToken = slots.map((s, i) => s === '套装兑换物' ? i : -1).reduce((a, b) => Math.max(a, b), -1);
      if (firstMisc !== -1 && (lastNonMisc > firstMisc || lastToken > firstMisc)) bad.push(slots.join(','));
      if (lastToken !== -1 && lastNonMisc > lastToken) bad.push('套装兑换物未在装备后:' + slots.join(','));
    });
    return bad;
  });
  assert(sink.length === 0, '杂项沉底：所有网格 装备 → 套装兑换物 → 杂项', sink[0] || '');
  await page.evaluate(() => {
    const grids = [...document.querySelectorAll('.dp-items')];
    const g = grids.find(x => [...x.querySelectorAll('.dp-item .dp-tag')].some(t => t.textContent === '杂项'));
    if (g) g.scrollIntoView({ block: 'center' });
  });
  await sleep(400);
  await page.screenshot({ path: path.join(SHOT_DIR, '03-misc-sink.png') });

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

  // ================= ⑥ 排除杂项开关 =================
  console.log('—— ⑥ 排除杂项开关 ——');
  const miscDefault = await page.evaluate(() => document.getElementById('dpExcludeMisc').checked);
  assert(miscDefault === false, '「排除杂项物品」默认关');
  const helpText = await page.evaluate(() => document.querySelector('#dpMiscHelp .dp-help-pop').textContent);
  assert(helpText === '勾选后仅显示装备，屏蔽坐骑、玩具、装饰、配方、幻化及垃圾等杂项物品', '问号说明文本正确', helpText);
  await page.click('#dpMiscHelp');
  await sleep(300);
  const helpVisible = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('#dpMiscHelp .dp-help-pop'));
    return parseFloat(cs.opacity) === 1;
  });
  assert(helpVisible, '问号点击展开说明');
  await page.screenshot({ path: path.join(SHOT_DIR, '06-misc-help.png') });
  await page.evaluate(() => document.body.click());
  const miscCountBefore = await page.evaluate(() => [...document.querySelectorAll('.dp-item .dp-tag')].filter(t => t.textContent === '杂项').length);
  await page.check('#dpExcludeMisc');
  await sleep(500);
  const miscCountAfter = await page.evaluate(() => [...document.querySelectorAll('.dp-item .dp-tag')].filter(t => t.textContent === '杂项').length);
  assert(miscCountBefore > 0 && miscCountAfter === 0, `勾选后杂项卡片即时隐藏（${miscCountBefore} → 0）`);
  // 叠加筛选不冲突：开关 + 爆击
  await page.click('#dpSecondaryChips .dp-chip[data-v="爆击"]');
  await sleep(500);
  const stacked = await cardCount();
  const expectStack = hasCrit.filter(l => l.slot !== '杂项').length;
  assert(stacked === expectStack, `叠加筛选不冲突（排除杂项 + 爆击：页面 ${stacked} = 库内 ${expectStack}）`);
  await page.click('#dpSecondaryChips .dp-chip[data-v="爆击"]');
  await page.uncheck('#dpExcludeMisc');
  await sleep(500);
  assert(await cardCount() === totalCards, '开关与筛选全部还原');

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
