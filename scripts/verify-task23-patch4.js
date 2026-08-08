// 任务书 #23-补丁4 验证：展开文本衔接（①）+ 三级折叠（②）+ 筛选条规范核验（③）
// ③ 已按任务书 #28 WP2（筛选规范 v2.0）重构口径改锚：v1.0 部位/类型二维与「排除杂项」已彻底取消，
// 现覆盖 = 行序/区头层级/chip 规格、来源单选互斥、重置筛选、杂项零渲染、§7 动画、§8 移动端折叠。
// 公示页为免登录只读页（live 数据），本脚本不创建任何测试数据，收尾复核 T23X 遗留为零。
// 用法: node scripts/verify-task23-patch4.js（PW_CHANNEL=chrome 可选）截图输出 backup/2026-08-07-task23-patch4/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(__dirname, '..', '.s6-ssh', 'node_modules', 'playwright-core'))); }

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-07-task23-patch4');
const PORT = 15711;
const BASE = `http://localhost:${PORT}`;

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const ANON = env.SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
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

  // ---- node 侧：§7 动画规格文本断言（css/data-public.css）——时长 150-250ms ease-out、只动 transform/opacity ----
  const dpCss = fs.readFileSync(path.join(ROOT, 'css', 'data-public.css'), 'utf8');
  const ruleOf = sel => { const m = dpCss.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*\\}')); return m ? m[0] : ''; };
  const closingRule = ruleOf('.dp-filter-rows.closing');
  const enterRule = ruleOf('.dp-item.dp-enter');
  const kfCard = (dpCss.match(/@keyframes dpCardIn\s*\{[\s\S]*?\n\}/) || [''])[0];
  const kfRows = (dpCss.match(/@keyframes dpRowsIn\s*\{[\s\S]*?\n\}/) || [''])[0];
  const onlyTransformOpacity = s => !/(width|height|margin|padding|top|left|right|bottom|background|box-shadow)\s*[:)]/.test(s.replace(/ease-out|transform:|opacity:/g, ''));
  assert(/0\.(15|2|25)s ease-out|0\.2s ease-out/.test(closingRule) && /opacity/.test(closingRule) && /transform/.test(closingRule) && onlyTransformOpacity(closingRule),
    '§7[CSS] 筛选条收起过渡 150-250ms ease-out、仅 opacity/transform', closingRule.slice(0, 120));
  assert(/0\.2s ease-out/.test(enterRule) && /opacity/.test(kfCard) && /transform/.test(kfCard) && /opacity/.test(kfRows) && /transform/.test(kfRows),
    '§7[CSS] 卡片入场/面板展开动画 0.2s ease-out、keyframes 仅 opacity/transform');

  // ---- node 侧：当前赛季参照数据（按行计，不按名去重——同名跨 BOSS 重复掉落是合法重复行） ----
  const seasons = await rest('/game_seasons?select=*');
  const cur = seasons.find(s => s.is_current) || seasons.sort((a, b) => String(a.start_date).localeCompare(String(b.start_date))).pop();
  const raids = await rest(`/game_raids?select=*&season_id=eq.${cur.id}`);
  const dungeons = await rest(`/game_dungeons?select=*&season_id=eq.${cur.id}`);
  const bossRows = await rest('/game_bosses?select=id,raid_id,dungeon_id&limit=1000');
  const bossIdsInSeason = new Set(bossRows.filter(b => raids.some(r => r.id === b.raid_id)).map(b => b.id));
  const dungeonIds = new Set(dungeons.map(d => d.id));
  const raidLootRaw = (await rest('/boss_loot?select=*&limit=2000')).filter(l => bossIdsInSeason.has(l.boss_id));
  const dunLootRaw = (await rest('/dungeon_loot?select=*&limit=2000')).filter(l => dungeonIds.has(l.dungeon_id));
  // 任务书 #28 WP2（筛选规范 v2.0）：杂项（slot='杂项'）数据层排除、页面零渲染——期望值按非杂项口径计算
  const nMisc = [...raidLootRaw, ...dunLootRaw].filter(l => l.slot === '杂项').length;
  const raidLoot = raidLootRaw.filter(l => l.slot !== '杂项');
  const dunLoot = dunLootRaw.filter(l => l.slot !== '杂项');
  const all = [...raidLoot, ...dunLoot];
  const nRaid = raidLoot.length, nDun = dunLoot.length;
  const nCrit = all.filter(l => (l.secondary_stats || []).includes('爆击')).length;
  const nStr = all.filter(l => (l.primary_stats || []).includes('力量')).length;
  const nCombo = all.filter(l => (l.primary_stats || []).includes('力量') && (l.secondary_stats || []).includes('爆击')).length;
  console.log(`  [数据] 当前赛季「${cur.name}」：非杂项全集 ${all.length} 行（团本 ${nRaid} + 大秘境 ${nDun}，已排除杂项 ${nMisc} 行）｜爆击 ${nCrit}｜力量 ${nStr}｜力量AND爆击 ${nCombo}（按行计）`);
  console.log(`  [基准] v2.0 口径参照：全集 343（190−51 + 221−17）→ ${all.length === 343 ? '与库内一致' : '库内已变动，以库内实测为准'}`);
  // ① 用 3 张最长特效卡
  const effectCards = all.filter(l => l.effect && l.effect.length >= 30).sort((a, b) => b.effect.length - a.effect.length);
  const picked = [];
  for (const c of effectCards) { if (!picked.some(p => p.effect === c.effect)) picked.push(c); if (picked.length === 3) break; }
  assert(picked.length === 3, '①备料：库内找到 3 张长特效卡（≥30 字）', `实际 ${picked.length} 张`);
  // DB 文本含 \r\n，innerHTML 解析时 \r 被 HTML 规范化吞掉（视觉无异）；断言统一按规范化后文本逐字比对
  picked.forEach(p => { p.effect = p.effect.replace(/\r\n?/g, '\n'); });

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }

  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const pageErrors = [];
  const notFounds = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => pageErrors.push('pageerror: ' + e.message));
    page.on('console', msg => { if (msg.type() === 'error') pageErrors.push('console: ' + msg.text()); });
    page.on('response', r => { if (r.status() === 404) notFounds.push(r.url()); });
    await page.goto(`${BASE}/data.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.dp-item', { timeout: 20000 });
    await sleep(800);

    const clickChip = (row, v) => page.evaluate(([r, val]) => {
      [...document.querySelectorAll(`${r} .dp-chip`)].find(c => c.dataset.v === val).click();
    }, [row, v]);
    const cardCount = () => page.evaluate(() => document.querySelectorAll('.dp-item').length);

    // ============ 修正项③：筛选规范 v2.0 逐节核验（任务书 #28 WP2 重构后口径） ============
    console.log('—— ③ 筛选条 v2.0 逐节核验 ——');
    // §2 布局：dpFilterBar = [dpFilterToggle, dpFilterRows]；rows 内行序 = 顶行（搜索+重置）→ 主属性组 → 副属性组 → 来源组
    const layout = await page.evaluate(() => {
      const bar = document.getElementById('dpFilterBar');
      const rows = document.getElementById('dpFilterRows');
      const top = rows.querySelector('.dp-top-row');
      return {
        barKids: [...bar.children].map(e => e.id),
        rowKids: [...rows.children].map(e => e.classList.contains('dp-top-row') ? 'top'
          : (e.querySelector('.dp-group-head') ? e.querySelector('.dp-group-head').childNodes[0].textContent.trim() : '?')),
        topKids: [...top.children].map(e => e.classList.contains('dp-search-wrap') ? 'search' : e.id),
        searchInWrap: !!top.querySelector('.dp-search-wrap #dpSearch'),
        searchFlex: getComputedStyle(top.querySelector('.dp-search-wrap')).flexGrow,
        resetText: document.getElementById('dpResetFilters').textContent.trim(),
        heads: [...rows.querySelectorAll('.dp-group-head')].map(h => h.childNodes[0].textContent.trim()),
        notes: [...rows.querySelectorAll('.dp-group-note')].map(n => n.textContent),
        searchPh: document.getElementById('dpSearch').placeholder,
      };
    });
    assert(JSON.stringify(layout.barKids) === JSON.stringify(['dpFilterToggle', 'dpFilterRows']),
      '§2 筛选条结构：折叠按钮在前、dpFilterRows 在后', layout.barKids.join('>'));
    assert(JSON.stringify(layout.rowKids) === JSON.stringify(['top', '主属性', '副属性', '来源']),
      '§2 行序：顶行（搜索+重置）→ 主属性组 → 副属性组 → 来源组', layout.rowKids.join('>'));
    assert(JSON.stringify(layout.topKids) === JSON.stringify(['search', 'dpResetFilters']) && layout.searchInWrap
      && layout.searchFlex === '1' && layout.resetText === '重置筛选' && layout.searchPh.includes('…'),
      '§2 顶行 = 搜索（置顶加宽 flex:1、占位省略号）+ 重置筛选按钮（不放 chip）', JSON.stringify(layout.topKids));
    assert(JSON.stringify(layout.heads) === JSON.stringify(['主属性', '副属性', '来源'])
      && JSON.stringify(layout.notes) === JSON.stringify(['多选', '多选', '单选 · 值域随赛季数据驱动']),
      '§2 区头标题层级：主属性/副属性/来源 + 各带说明注记', JSON.stringify(layout.notes));
    // §3 chip 视觉规格（锚到仍存在的主属性组）
    const chipCss = await page.evaluate(() => {
      const c = document.querySelector('#dpPrimaryChips .dp-chip');
      const s = getComputedStyle(c);
      return { h: s.height, r: s.borderRadius, fs: s.fontSize, fw: s.fontWeight, bg: s.backgroundColor };
    });
    assert(chipCss.h === '24px' && chipCss.r === '12px' && chipCss.fs === '12px' && chipCss.fw === '500',
      '§3 chip 24px 高 / 12px 圆角 / 12px / 500', JSON.stringify(chipCss));
    assert(chipCss.bg === 'rgb(30, 37, 46)', '§3 chip 默认态深底（--bg-card）', chipCss.bg);
    // §3 区头 12px/600 次级色
    const headCss = await page.evaluate(() => {
      const s = getComputedStyle(document.querySelector('.dp-group-head'));
      return { fs: s.fontSize, fw: s.fontWeight, color: s.color };
    });
    assert(headCss.fs === '12px' && headCss.fw === '600' && headCss.color === 'rgb(139, 148, 158)',
      '§3 区头 12px / 600 / 次级色', JSON.stringify(headCss));
    // §3 组内 chip 间距 6px；来源行「全部」与值间 1px 竖分隔线 16px 高 + 8px 间距
    const gaps = await page.evaluate(() => {
      const chips = [...document.querySelectorAll('#dpPrimaryChips .dp-chip-sub .dp-chip')];
      const g = chips[1].getBoundingClientRect().left - chips[0].getBoundingClientRect().right;
      const div = document.querySelector('#dpSourceChips .dp-chip-divider');
      const ds = getComputedStyle(div);
      const gapBefore = div.getBoundingClientRect().left - div.previousElementSibling.getBoundingClientRect().right;
      return { chipGap: g, dw: ds.width, dh: ds.height, gapBefore };
    });
    assert(Math.abs(gaps.chipGap - 6) <= 0.5, '§3 组内 chip 间距 6px', `实测 ${gaps.chipGap}`);
    assert(gaps.dw === '1px' && gaps.dh === '16px' && Math.abs(gaps.gapBefore - 8) <= 0.5,
      '§3 来源行 1px 竖分隔线（16px 高）+ 8px 间距', JSON.stringify(gaps));
    // §4 结构：主/副属性 chips 包一层 .dp-chip-sub；来源组平铺；值域 = 「全部」+ 当季有数据的来源（副本任务/专业制造恒不渲染）
    const expSrcVals = ['', ...(nRaid > 0 ? ['raid'] : []), ...(nDun > 0 ? ['dungeon'] : [])];
    const srcDom = await page.evaluate(() => {
      const first = document.querySelector('#dpSourceChips .dp-chip');
      return {
        primWrapped: !!document.querySelector('#dpPrimaryChips > .dp-chip-sub'),
        secWrapped: !!document.querySelector('#dpSecondaryChips > .dp-chip-sub'),
        srcFlat: !document.querySelector('#dpSourceChips .dp-chip-sub'),
        vals: [...document.querySelectorAll('#dpSourceChips .dp-chip')].map(c => c.dataset.v),
        firstIsAll: first.classList.contains('dp-chip-all') && first.textContent === '全部' && first.classList.contains('active'),
      };
    });
    assert(srcDom.primWrapped && srcDom.secWrapped && srcDom.srcFlat,
      '§4 主/副属性 chips 包 .dp-chip-sub、来源组平铺', JSON.stringify(srcDom));
    assert(JSON.stringify(srcDom.vals) === JSON.stringify(expSrcVals) && srcDom.firstIsAll,
      '§4 来源值域赛季数据驱动：「全部」首位默认选中 + 团本/大秘境（无数据来源不渲染）', srcDom.vals.join('/'));
    // §4 来源单选互斥：点 raid → raid active/全部失活、页面仅剩团本卡；点 dungeon → 互斥切换；再点已选 dungeon → 回全部
    await clickChip('#dpSourceChips', 'raid');
    await sleep(500);
    const src1 = await page.evaluate(() => {
      const dSec = [...document.querySelectorAll('.dp-section')][1];
      return {
        raidActive: document.querySelector('#dpSourceChips .dp-chip[data-v="raid"]').classList.contains('active'),
        allOff: !document.querySelector('#dpSourceChips .dp-chip-all').classList.contains('active'),
        cards: document.querySelectorAll('.dp-item').length,
        dungeonCards: dSec.querySelectorAll('.dp-item').length,
        dungeonEmpty: !!dSec.querySelector('.dp-empty'),
        enterAnim: !!document.querySelector('.dp-item.dp-enter'),
      };
    });
    assert(src1.raidActive && src1.allOff && src1.cards === nRaid && src1.dungeonCards === 0 && src1.dungeonEmpty,
      '§4 来源单选「团本」：全部失活、页面仅剩团本卡（大秘境区块空态）', JSON.stringify(src1));
    assert(src1.enterAnim, '§7 筛选交互触发的重渲染给卡片加 .dp-enter 入场动画');
    await clickChip('#dpSourceChips', 'dungeon');
    await sleep(500);
    const src2 = await page.evaluate(() => ({
      dungeonActive: document.querySelector('#dpSourceChips .dp-chip[data-v="dungeon"]').classList.contains('active'),
      raidOff: !document.querySelector('#dpSourceChips .dp-chip[data-v="raid"]').classList.contains('active'),
      cards: document.querySelectorAll('.dp-item').length,
    }));
    assert(src2.dungeonActive && src2.raidOff && src2.cards === nDun,
      '§4 来源单选互斥切换「大秘境」', JSON.stringify(src2));
    await clickChip('#dpSourceChips', 'dungeon'); // 再点已选中的值 → 回「全部」
    await sleep(500);
    const src3 = await page.evaluate(() => ({
      allBack: document.querySelector('#dpSourceChips .dp-chip-all').classList.contains('active'),
      noValActive: document.querySelectorAll('#dpSourceChips .dp-chip.active:not(.dp-chip-all)').length,
      cards: document.querySelectorAll('.dp-item').length,
    }));
    assert(src3.allBack && src3.noValActive === 0 && src3.cards === all.length,
      '§4 再点已选值回「全部」并还原全集', JSON.stringify(src3));
    // §5 杂项零渲染：「排除杂项」开关/问号帮助 DOM 不存在，全页 .dp-tag 无「杂项」
    const miscGone = await page.evaluate(() => ({
      noExclude: !document.getElementById('dpExcludeMisc'),
      noHelp: !document.getElementById('dpMiscHelp') && !document.querySelector('.dp-help-pop') && !document.querySelector('.dp-misc-toggle'),
      miscTags: [...document.querySelectorAll('.dp-tag')].filter(t => t.textContent === '杂项').length,
    }));
    assert(miscGone.noExclude && miscGone.noHelp && miscGone.miscTags === 0,
      '§5 杂项零渲染：排除杂项开关/帮助 DOM 不存在、全页无「杂项」标签', JSON.stringify(miscGone));
    // §5 「重置筛选」一键还原：任意筛选+搜索词状态下点击 → 搜索空、仅来源「全部」active、卡片回基线
    await clickChip('#dpPrimaryChips', '力量');
    await page.fill('#dpSearch', 'abc');
    await sleep(400);
    await page.click('#dpResetFilters');
    await sleep(500);
    const resetBtn = await page.evaluate(() => ({
      search: document.getElementById('dpSearch').value,
      activeVals: document.querySelectorAll('.dp-filterbar .dp-chip.active:not(.dp-chip-all)').length,
      allActive: document.querySelectorAll('#dpSourceChips .dp-chip-all.active').length,
      cards: document.querySelectorAll('.dp-item').length,
    }));
    assert(resetBtn.search === '' && resetBtn.activeVals === 0 && resetBtn.allActive === 1 && resetBtn.cards === all.length,
      '§5 「重置筛选」一键还原：搜索清空、值 chip 全清、来源「全部」回选、卡片回基线', JSON.stringify(resetBtn));
    // 筛选条两档截图
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(200);
    await page.screenshot({ path: path.join(SHOT_DIR, '1366-filterbar.png') });

    // ============ 筛选对数硬验收（按行计） ============
    console.log('—— ③ 筛选对数回归（页面卡片数 == 库内行数） ——');
    await clickChip('#dpSecondaryChips', '爆击');
    await sleep(500);
    let cnt = await cardCount();
    const critNames = await page.evaluate(() => [...document.querySelectorAll('.dp-item .dp-item-name')].map(e => e.textContent).sort());
    const expCritNames = all.filter(l => (l.secondary_stats || []).includes('爆击')).map(l => l.item_name).sort();
    assert(cnt === nCrit && JSON.stringify(critNames) === JSON.stringify(expCritNames),
      `副属性「爆击」精确匹配（页面 ${cnt} = 库内 ${nCrit}，含同名重复行逐一比对）`);
    await clickChip('#dpSecondaryChips', '爆击');
    await clickChip('#dpPrimaryChips', '力量');
    await sleep(500);
    cnt = await cardCount();
    assert(cnt === nStr, `主属性「力量」精确匹配（页面 ${cnt} = 库内 ${nStr}）`);
    await clickChip('#dpSecondaryChips', '爆击');
    await sleep(500);
    cnt = await cardCount();
    assert(cnt === nCombo, `组合「力量 AND 爆击」精确匹配（页面 ${cnt} = 库内 ${nCombo}）`);
    // 双视图筛选一致（回归）
    await page.evaluate(() => { [...document.querySelectorAll('.dp-toggle')].find(b => b.dataset.view === 'pool').click(); });
    await sleep(500);
    const poolCnt = await cardCount();
    await page.evaluate(() => { [...document.querySelectorAll('.dp-toggle')].find(b => b.dataset.view === 'boss').click(); });
    await sleep(400);
    assert(poolCnt === nCombo, `双视图筛选一致（整体池 ${poolCnt} = 按BOSS ${nCombo}）`);
    // 清空还原
    await clickChip('#dpPrimaryChips', '力量');
    await clickChip('#dpSecondaryChips', '爆击');
    await sleep(500);
    cnt = await cardCount();
    assert(cnt === all.length, `清空还原全集（页面 ${cnt} = 库内 ${all.length}）`);

    // ============ 修正项①：展开即全文替换 ============
    console.log('—— ① 展开文本逐字比对（3 张长特效卡） ——');
    for (let i = 0; i < picked.length; i++) {
      const item = picked[i];
      const r = await page.evaluate(async (it) => {
        // 同名装备可能有跨 BOSS 多行（特效不同），必须按「名字 + 覆盖层全文」双重定位到对应行
        const card = [...document.querySelectorAll('.dp-item.has-effect')].find(c =>
          c.querySelector('.dp-item-name').textContent === it.item_name
          && c.querySelector('.dp-item-effect-overlay').textContent === it.effect);
        if (!card) return { found: false };
        card.scrollIntoView({ block: 'center' });
        const preview = card.querySelector('.dp-item-effect-preview');
        const overlay = card.querySelector('.dp-item-effect-overlay');
        const before = {
          previewText: preview.textContent,
          clamped: preview.scrollWidth > preview.clientWidth + 1,
          overlayHidden: getComputedStyle(overlay).opacity === '0',
        };
        card.click(); // .expanded
        await new Promise(r => setTimeout(r, 500));
        const after = {
          previewOpacity: getComputedStyle(preview).opacity,
          overlayOpacity: getComputedStyle(overlay).opacity,
          overlayText: overlay.textContent,
        };
        card.click(); // 还原，避免影响下一张
        return { found: true, before, after };
      }, item);
      const ok = r.found
        && r.before.previewText === item.effect          // 折叠态 DOM 内为完整同一文本（CSS 截断）
        && r.before.clamped                               // 折叠态确实被截断（省略号）
        && r.before.overlayHidden                         // 折叠态覆盖层不渲染
        && r.after.previewOpacity === '0'                 // 展开态预览行隐藏（替换而非拼接）
        && r.after.overlayOpacity === '1'
        && r.after.overlayText === item.effect            // 展开态覆盖层 = 数据源全文，逐字一致
        && r.after.overlayText.indexOf(item.effect.slice(0, 20)) === r.after.overlayText.lastIndexOf(item.effect.slice(0, 20)); // 无重复片段
      assert(ok, `①卡${i + 1}「${item.item_name}」展开逐字=数据源全文、无重复子串（折叠截断+展开替换）`,
        r.found ? `预览opacity=${r.after.previewOpacity} 覆盖层字数=${r.after.overlayText.length}/${item.effect.length}` : '卡片未找到');
    }
    // ① 截图：两卡 折叠态 vs 展开态
    await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.dp-item.has-effect')];
      cards[0].scrollIntoView({ block: 'center' });
    });
    await sleep(300);
    await page.screenshot({ path: path.join(SHOT_DIR, '1366-expand-before.png') });
    await page.evaluate(() => { [...document.querySelectorAll('.dp-item.has-effect')][0].click(); });
    await sleep(500);
    await page.screenshot({ path: path.join(SHOT_DIR, '1366-expand-after.png') });
    await page.evaluate(() => { [...document.querySelectorAll('.dp-item.has-effect')][0].click(); });
    await sleep(300);

    // ============ 修正项②：三级折叠 ============
    console.log('—— ② 三级折叠 + 热区 + 记忆 ——');
    // 热区 ≥24×24（三级各取一例）+ 2px 描边
    const hot = await page.evaluate(() => {
      const pick = sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
      const sec = pick('.dp-section-collapser .dp-collapse-btn');
      const raid = pick('.dp-raid-name[data-collapse] .dp-collapse-btn');
      const boss = pick('.dp-boss-name[data-collapse] .dp-collapse-btn');
      const sw = document.querySelector('.dp-collapse-btn svg path').getAttribute('stroke-width');
      return { sec, raid, boss, sw };
    });
    assert(hot.sec && hot.sec.w >= 24 && hot.sec.h >= 24 && hot.raid && hot.raid.w >= 24 && hot.raid.h >= 24 && hot.boss && hot.boss.w >= 24 && hot.boss.h >= 24,
      '② 三级折叠控件热区均 ≥24×24px', JSON.stringify(hot));
    assert(hot.sw === '2', '② 箭头描边 2px 级', `stroke-width=${hot.sw}`);
    // 副本级折叠头存在（团本各团本 + 大秘境各副本），含件数徽标与新本徽标
    const headInfo = await page.evaluate(() => {
      const raidHeads = [...document.querySelectorAll('.dp-raid-name[data-collapse]')];
      return {
        raidLevel: raidHeads.length,
        allHaveCount: raidHeads.every(h => h.querySelector('.dp-count')),
        dungeonHeads: raidHeads.filter(h => h.dataset.collapse.startsWith('dungeon:')).length,
        newBadgeHeads: raidHeads.filter(h => h.querySelector('.dp-badge-new')).length,
      };
    });
    assert(headInfo.raidLevel >= 2 && headInfo.dungeonHeads >= 2 && headInfo.allHaveCount && headInfo.newBadgeHeads >= 1,
      '② 副本级折叠头：团本/大秘境各副本均有（件数徽标 + 新本徽标在头）', JSON.stringify(headInfo));
    // 三级独立：折叠 BOSS → 仅其 items 隐藏；折叠副本 → 仅其 body 隐藏；折叠区块 → 仅其区块隐藏
    // 注意：每次点击触发整页重渲染，必须在点击后按折叠 id 重新查询新 DOM，不能用旧引用
    const indep = await page.evaluate(async () => {
      const out = {};
      const bossHead = document.querySelector('.dp-boss-name[data-collapse]');
      const bossId = bossHead.dataset.collapse;
      bossHead.click(); await new Promise(r => setTimeout(r, 300));
      const freshBoss = document.querySelector(`.dp-boss-name[data-collapse="${bossId}"]`).closest('.dp-boss');
      out.bossCollapsedClass = freshBoss.classList.contains('collapsed');
      out.bossItemsHidden = getComputedStyle(freshBoss.querySelector('.dp-items')).display === 'none';
      out.siblingVisible = [...document.querySelectorAll('.dp-boss:not(.collapsed) > .dp-items')]
        .some(el => getComputedStyle(el).display !== 'none');
      // 副本级（优先取带「新本」徽标的大秘境副本头）
      const dHeads = [...document.querySelectorAll('.dp-raid-name[data-collapse]')].filter(h => h.dataset.collapse.startsWith('dungeon:'));
      const dHead = dHeads.find(h => h.querySelector('.dp-badge-new')) || dHeads[0];
      const dId = dHead.dataset.collapse;
      const hadNew = !!dHead.querySelector('.dp-badge-new');
      dHead.click(); await new Promise(r => setTimeout(r, 300));
      const freshD = document.querySelector(`.dp-raid-name[data-collapse="${dId}"]`).closest('.dp-raid');
      out.hadNew = hadNew;
      out.dungeonCollapsedClass = freshD.classList.contains('collapsed');
      out.dungeonBodyHidden = getComputedStyle(freshD.querySelector('.dp-raid-body')).display === 'none';
      out.newBadgeKept = hadNew ? !!document.querySelector(`.dp-raid-name[data-collapse="${dId}"] .dp-badge-new`) : true;
      out.otherDungeonVisible = [...document.querySelectorAll('.dp-raid:not(.collapsed)')].length >= 1;
      // 区块级
      const secHead = document.querySelector('.dp-section-collapser[data-collapse="sec:dungeons"]');
      secHead.click(); await new Promise(r => setTimeout(r, 300));
      out.secCollapsedClass = document.querySelector('.dp-section-collapser[data-collapse="sec:dungeons"]').classList.contains('collapsed');
      out.sectionBodyGone = !document.querySelector('.dp-raid-name[data-collapse^="dungeon:"]');
      out.raidSectionAlive = !!document.querySelector('.dp-raid-name[data-collapse^="raid:"]');
      return { ...out, bossId, dId };
    });
    assert(indep.bossCollapsedClass && indep.bossItemsHidden && indep.siblingVisible, '② BOSS 级折叠独立生效（同级不受影响）', JSON.stringify(indep));
    assert(indep.dungeonCollapsedClass && indep.dungeonBodyHidden && indep.otherDungeonVisible && indep.newBadgeKept, '② 副本级折叠独立生效（新本徽标保持可见）', JSON.stringify(indep));
    assert(indep.secCollapsedClass && indep.sectionBodyGone && indep.raidSectionAlive, '② 区块级折叠独立生效（团本区块不受影响）', JSON.stringify(indep));
    await page.screenshot({ path: path.join(SHOT_DIR, '1366-collapse-three-levels.png') });
    // 记忆：切赛季往返后三级折叠保持（sessionStorage）。
    // 注意层级：区块折叠时副本头不渲染，须先核验区块级记忆，再展开区块核验副本级记忆
    const otherSeason = seasons.find(s => s.id !== cur.id);
    await page.selectOption('#dpSeasonSelect', otherSeason.id);
    await sleep(800);
    await page.selectOption('#dpSeasonSelect', cur.id);
    await sleep(800);
    const mem1 = await page.evaluate(() => ({
      bossKept: !!document.querySelector('.dp-boss.collapsed'),
      secKept: !![...document.querySelectorAll('.dp-section-collapser.collapsed')].find(h => h.dataset.collapse === 'sec:dungeons'),
    }));
    await page.evaluate(() => {
      const h = document.querySelector('.dp-section-collapser[data-collapse="sec:dungeons"]');
      if (h && h.classList.contains('collapsed')) h.click();
    });
    await sleep(400);
    const mem2 = await page.evaluate(({ dId }) => {
      const h = document.querySelector(`.dp-raid-name[data-collapse="${dId}"]`);
      return { dKept: h ? h.closest('.dp-raid').classList.contains('collapsed') : false };
    }, indep);
    assert(mem1.bossKept && mem1.secKept && mem2.dKept, '② 折叠记忆：切赛季往返后三级折叠保持', JSON.stringify({ ...mem1, ...mem2 }));
    // 还原全部折叠（循环点击直至无折叠，不污染后续断言与截图）
    await page.evaluate(async () => {
      for (let i = 0; i < 20; i++) {
        const h = document.querySelector('.dp-boss.collapsed > .dp-boss-name, .dp-raid.collapsed > .dp-raid-name, .dp-section-collapser.collapsed');
        if (!h) break;
        h.click();
        await new Promise(r => setTimeout(r, 200));
      }
    });
    await sleep(400);

    // ============ 赛季切换筛选重置（回归，含「全部」chip 复位） ============
    await clickChip('#dpPrimaryChips', '力量');
    await clickChip('#dpSourceChips', 'raid');
    await page.fill('#dpSearch', 'test');
    await sleep(300);
    await page.selectOption('#dpSeasonSelect', otherSeason.id);
    await sleep(800);
    const reset = await page.evaluate(() => ({
      activeVals: document.querySelectorAll('.dp-filterbar .dp-chip.active:not(.dp-chip-all)').length,
      allChips: document.querySelectorAll('.dp-filterbar .dp-chip-all.active').length,
      search: document.getElementById('dpSearch').value,
    }));
    assert(reset.activeVals === 0 && reset.allChips === 1 && !reset.search,
      '③§5 赛季切换全重置（值 chip 全清、来源「全部」回选、搜索清空）', JSON.stringify(reset));
    await page.selectOption('#dpSeasonSelect', cur.id);
    await sleep(800);

    // ============ 1920 档：筛选条核验 + 展开截图 ============
    const ctx2 = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page2 = await ctx2.newPage();
    page2.on('pageerror', e => pageErrors.push('pageerror(1920): ' + e.message));
    page2.on('console', msg => { if (msg.type() === 'error') pageErrors.push('console(1920): ' + msg.text()); });
    page2.on('response', r => { if (r.status() === 404) notFounds.push('1920: ' + r.url()); });
    await page2.goto(`${BASE}/data.html`, { waitUntil: 'networkidle' });
    await page2.waitForSelector('.dp-item', { timeout: 20000 });
    await sleep(800);
    const rows1920 = await page2.evaluate(() => {
      const rows = document.getElementById('dpFilterRows');
      const kids = [...rows.children];
      const tops = new Set(kids.map(r => Math.round(r.getBoundingClientRect().top)));
      const toggleHidden = getComputedStyle(document.getElementById('dpFilterToggle')).display === 'none';
      const groupLines = [...rows.querySelectorAll('.dp-group')].map(g =>
        new Set([...g.querySelectorAll('.dp-chip')].map(c => Math.round(c.getBoundingClientRect().top))).size);
      return { kids: kids.length, rows: tops.size, toggleHidden, groupLines };
    });
    assert(rows1920.kids === 4 && rows1920.rows === 4 && rows1920.toggleHidden && rows1920.groupLines.every(n => n === 1),
      '③§6 1920×1080 桌面档：toggle 隐藏、顶行+三组各一行（组内无折行）', JSON.stringify(rows1920));
    await page2.evaluate(() => window.scrollTo(0, 0));
    await page2.screenshot({ path: path.join(SHOT_DIR, '1920-filterbar.png') });
    // 1920 展开逐字比对一例 + 截图
    const r1920 = await page2.evaluate(async (name) => {
      const card = [...document.querySelectorAll('.dp-item.has-effect')].find(c => c.querySelector('.dp-item-name').textContent === name);
      if (!card) return null;
      card.scrollIntoView({ block: 'center' });
      card.click();
      await new Promise(r => setTimeout(r, 500));
      const preview = card.querySelector('.dp-item-effect-preview');
      const overlay = card.querySelector('.dp-item-effect-overlay');
      return { po: getComputedStyle(preview).opacity, oo: getComputedStyle(overlay).opacity, text: overlay.textContent };
    }, picked[0].item_name);
    assert(r1920 && r1920.po === '0' && r1920.oo === '1' && r1920.text === picked[0].effect,
      '①[1920] 展开逐字=数据源全文、预览行替换隐藏');
    await page2.screenshot({ path: path.join(SHOT_DIR, '1920-expand-after.png') });
    await ctx2.close();

    // ============ 移动端档：筛选条折叠（§8）+ 收起动画（§7） ============
    const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page3 = await ctx3.newPage();
    page3.on('pageerror', e => pageErrors.push('pageerror(m): ' + e.message));
    page3.on('response', r => { if (r.status() === 404) notFounds.push('mobile: ' + r.url()); });
    await page3.goto(`${BASE}/data.html`, { waitUntil: 'networkidle' });
    await page3.waitForSelector('.dp-item', { timeout: 20000 });
    await sleep(500);
    const mob = await page3.evaluate(async () => {
      const toggle = document.getElementById('dpFilterToggle');
      const rows = document.getElementById('dpFilterRows');
      const bar = document.getElementById('dpFilterBar');
      const r0 = { toggleVisible: getComputedStyle(toggle).display !== 'none',
        rowsHidden: getComputedStyle(rows).display === 'none', text0: toggle.textContent };
      toggle.click();
      await new Promise(r => setTimeout(r, 300));
      const r1 = { rowsShown: getComputedStyle(rows).display !== 'none', text1: toggle.textContent,
        open: bar.classList.contains('filters-open') };
      // 收起：先挂 .closing 退出动画（200ms），动画结束后才移除 filters-open
      toggle.click();
      const r2 = { closing: rows.classList.contains('closing'), stillOpen: bar.classList.contains('filters-open') };
      await new Promise(r => setTimeout(r, 300));
      const r3 = { closed: !bar.classList.contains('filters-open'), closingGone: !rows.classList.contains('closing'),
        rowsHiddenAgain: getComputedStyle(rows).display === 'none' };
      return { ...r0, ...r1, ...r2, ...r3 };
    });
    assert(mob.toggleVisible && mob.rowsHidden && mob.text0.includes('▾'),
      '③§8 移动端筛选条默认折叠为「筛选 ▾」按钮', JSON.stringify(mob));
    assert(mob.rowsShown && mob.open && mob.text1.includes('▴'),
      '③§8 点击展开面板（filters-open，文案变 ▴）', JSON.stringify(mob));
    assert(mob.closing && mob.stillOpen && mob.closed && mob.closingGone && mob.rowsHiddenAgain,
      '③§7 收起走 .closing 退出动画（200ms 后移除 filters-open）', JSON.stringify(mob));
    await page3.screenshot({ path: path.join(SHOT_DIR, '390-mobile-filter-open.png') });
    await ctx3.close();
    // §7 prefers-reduced-motion：直收，无 .closing 过渡
    const ctx4 = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page4 = await ctx4.newPage();
    page4.on('pageerror', e => pageErrors.push('pageerror(rm): ' + e.message));
    page4.on('response', r => { if (r.status() === 404) notFounds.push('rm: ' + r.url()); });
    await page4.goto(`${BASE}/data.html`, { waitUntil: 'networkidle' });
    await page4.waitForSelector('.dp-item', { timeout: 20000 });
    await sleep(500);
    const rm = await page4.evaluate(async () => {
      const toggle = document.getElementById('dpFilterToggle');
      const rows = document.getElementById('dpFilterRows');
      const bar = document.getElementById('dpFilterBar');
      toggle.click();
      await new Promise(r => setTimeout(r, 100));
      const opened = bar.classList.contains('filters-open');
      toggle.click();
      return { opened, closing: rows.classList.contains('closing'), closedNow: !bar.classList.contains('filters-open') };
    });
    assert(rm.opened && !rm.closing && rm.closedNow,
      '③§7 prefers-reduced-motion：收起直收（无 .closing，立即移除 filters-open）', JSON.stringify(rm));
    await ctx4.close();
    await ctx.close();

    const realErrors = pageErrors.filter(e => !e.includes('status of 406'));
    assert(realErrors.length === 0, '全程零 JS 报错（406=既有噪音已排除）', realErrors.join(' | ') || '无');
    assert(notFounds.length === 0, '全程零 404', notFounds.join(' | ') || '无');
  } finally {
    await browser.close();
  }

  // ---- 测试数据复核：本脚本零创建；T23X 历史前缀复核为零 ----
  const svcH = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
  const c1 = await fetch(`${SB}/rest/v1/dungeon_loot?select=id&item_name=like.T23X*`, { headers: svcH }).then(r => r.json());
  const c2 = await fetch(`${SB}/rest/v1/game_bosses?select=id&name=like.T23X*`, { headers: svcH }).then(r => r.json());
  const c3 = await fetch(`${SB}/rest/v1/game_seasons?select=id&name=like.T23X*`, { headers: svcH }).then(r => r.json());
  assert(c1.length === 0 && c2.length === 0 && c3.length === 0,
    `测试数据清零复核（本脚本零创建；T23X 掉落=${c1.length} BOSS=${c2.length} 赛季=${c3.length}）`);

  if (serverProc) serverProc.kill();
  console.log(`\n===== 任务书#23-补丁4 验证: ${pass} 通过 / ${fail} 失败，截图 → ${SHOT_DIR} =====`);
  if (fails.length) console.log('失败项: ' + fails.join(' | '));
  process.exit(fail === 0 ? 0 : 1);
})().catch(async e => { console.error(e); if (serverProc) serverProc.kill(); process.exit(1); });
