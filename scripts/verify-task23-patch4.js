// 任务书 #23-补丁4 验证：展开文本衔接（①）+ 三级折叠（②）+ 筛选条规范核验（③）
// ③ 已按任务书 #28 WP2（筛选规范 v2.0）重构口径改锚：v1.0 部位/类型二维与「排除杂项」已彻底取消，
// 现覆盖 = 行序/区头层级/chip 规格、来源单选互斥、重置筛选、杂项零渲染、§7 动画、§8 移动端折叠。
// 适配任务书 #28 WP6（过滤器二期，2026-08-09）：F1 分类三级过滤组（第一组；二级 3 tab、三级 部位11/武器4（主手 0 命中
// 定义保留不渲染）/护甲5、切换清空、多选 OR、映射终版逐值对库）、F2 来源实例级（实例 chips 数据驱动带计数、
// 点实例=另一池折叠+本池只剩该实例、再点取消）、F3 筛选态平铺（内容筛选激活→无池标题+命中计数=REST 口径、
// 来源退化为纯过滤、0 命中空态+重置引导、清空回浏览态双池）；③§2 行序改 五段（顶行/分类/主属性/副属性/来源）、
// 1920 档 4 行改 5 行；双视图一致回归挪浏览态「来源=大秘境」（内容筛选触发平铺态无视图开关）。
// 适配任务书 #28 WP3-v2（全信息装备卡，运营 2026-08-08 方向修正+补充裁定 G/H）：v1 点击详情层断言块整体替换。
// 适配任务书 #28 WP3-v3（R1–R10，2026-08-08）：恒占恒高/占位行废止 → 内容驱动行内等高（R3）；
// hover 全文替换 → 特效展开层（R4：预览截…+展开层；R7：未溢出卡无 … 无 hover 无展开层）；
// R5 来源组 chip 同包 .dp-chip-sub（6px 同距）；R6 来源单选联动折叠对应掉落池整段（含分组标题）；
// R1 星标边界盒断言；R2 锚点卡（永恒虚空之歌/圣光纽带/上古饥渴之心）+ 零空 stats 行；
// R9 期望值增排 item_type IN('装饰品','幻化')（sql/22 服务端口径）。
// 适配任务书 #28 WP3-v4（R11–R13，2026-08-08）：R11 来源行锚底（margin-top:auto，WP3-13 全页贴底 ±1px + 分叉指环锚点）；
// R12 hover 续文自然接续（WP3-v4 隐藏前缀占位）→ WP3-v5（2026-08-08）返修：占位废止，展开层=特效全文可见
// （展开无省略号、无不可见占位、overlay 文本逐字=数据源全文、首行与预览原位对齐）；
// R13 世界BOSS剔除（BUG-062，sql/24：至暗之夜 type='world'、RPC 黑名单 is distinct from 'world'，lair 保留；
// S1 基线 308=团本 104+大秘境 204；WP3-14 零 world 行断言）。
// 适配任务书 #28 WP6 补丁（P1–P4，2026-08-09）：P1 hover 形态重构——独立浮层（.dp-item-effect-overlay）废止，
// 改整卡 max-height 生长（.dp-item>.dp-item-inner 结构、§6 白名单例外已注册 2026-08-09）、来源行跟随新底部、
// 网格不塌（JS 对溢出卡预设折叠态 minHeight）；P2 分类二级增设「全部」默认 tab（4 tab，三级区不渲染）；
// P3 部位增设「饰品」（12 项，S1 40 件）；P4 筛选联动置灰（未选 chip 0 命中置灰+原因提示+aria-disabled，
// 已选恒不置灰、禁止自动清除、重置全恢复）。
// 适配 WP6 补丁二轮（P1-补/P4-补，2026-08-09）：P1-补 生长防抖——废弃 line-clamp（动画中 clamp 释放导致逐行重排
// 抖动），特效文本恒一次性完整排版，折叠态 = 容器 2 行高 overflow 纯视口裁剪（… 观感由 ::after 伪元素+渐变遮罩
// 承担），断言改 视口裁剪（wrap scrollHeight>clientHeight）+ 生长全程文本 top 偏移恒 0（折叠/动画中段/展开/收回
// 四态）；P4-补 置灰点击反馈——置灰 chip 点击触发抖动 200ms + 筛选条下浮出原因提示（2s 渐隐），守卫/title/aria 不变。
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
  const raids = (await rest(`/game_raids?select=*&season_id=eq.${cur.id}`))
    .filter(r => r.type !== 'world'); // R13（WP3-v4 / BUG-062）：世界BOSS 公示页剔除，期望值同口径；lair 巢穴归团本口径保留
  const dungeons = await rest(`/game_dungeons?select=*&season_id=eq.${cur.id}`);
  const bossRows = await rest('/game_bosses?select=id,raid_id,dungeon_id&limit=1000');
  const bossIdsInSeason = new Set(bossRows.filter(b => raids.some(r => r.id === b.raid_id)).map(b => b.id));
  const dungeonIds = new Set(dungeons.map(d => d.id));
  const raidLootRaw = (await rest('/boss_loot?select=*&limit=2000')).filter(l => bossIdsInSeason.has(l.boss_id));
  const dunLootRaw = (await rest('/dungeon_loot?select=*&limit=2000')).filter(l => dungeonIds.has(l.dungeon_id));
  // 任务书 #28 WP2（筛选规范 v2.0）：杂项（slot='杂项'）数据层排除、页面零渲染——期望值按非杂项口径计算；
  // R9（WP3-v3，sql/22）：公开 RPC 增排 item_type IN('装饰品','幻化')——期望值与页面同口径
  const EXCL_TYPES = ['装饰品', '幻化'];
  const nMisc = [...raidLootRaw, ...dunLootRaw].filter(l => l.slot === '杂项').length;
  const nExcl = [...raidLootRaw, ...dunLootRaw].filter(l => EXCL_TYPES.includes(l.item_type)).length;
  const raidLoot = raidLootRaw.filter(l => l.slot !== '杂项' && !EXCL_TYPES.includes(l.item_type));
  const dunLoot = dunLootRaw.filter(l => l.slot !== '杂项' && !EXCL_TYPES.includes(l.item_type));
  const all = [...raidLoot, ...dunLoot];
  const nRaid = raidLoot.length, nDun = dunLoot.length;
  const nCrit = all.filter(l => (l.secondary_stats || []).includes('爆击')).length;
  const nStr = all.filter(l => (l.primary_stats || []).includes('力量')).length;
  const nCombo = all.filter(l => (l.primary_stats || []).includes('力量') && (l.secondary_stats || []).includes('爆击')).length;
  console.log(`  [数据] 当前赛季「${cur.name}」：全集 ${all.length} 行（团本 ${nRaid} + 大秘境 ${nDun}，已排除杂项 ${nMisc} 行 + 装饰品/幻化 ${nExcl} 行）｜爆击 ${nCrit}｜力量 ${nStr}｜力量AND爆击 ${nCombo}（按行计）`);
  console.log(`  [基准] v4 口径参照（R13 后）：S1 全集 308（团本 104 + 大秘境 204，世界BOSS 32 件剔除、lair 巢穴保留）→ ${all.length === 308 && nRaid === 104 && nDun === 204 ? '与库内一致' : '库内已变动，以库内实测为准'}`);
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
    // WP3：采集公开 RPC 通道调用（装备详情数据源 get_public_loot_detail，anon 直连 PostgREST）
    const rpcCalls = [];
    page.on('response', r => { if (r.url().includes('/rest/v1/rpc/get_public_loot_detail')) rpcCalls.push(`${r.request().method()} ${r.status()}`); });
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
    assert(JSON.stringify(layout.rowKids) === JSON.stringify(['top', '分类', '主属性', '副属性', '来源']),
      '§2 行序：顶行（搜索+重置）→ 分类组（WP6 起第一组）→ 主属性组 → 副属性组 → 来源组', layout.rowKids.join('>'));
    assert(JSON.stringify(layout.topKids) === JSON.stringify(['search', 'dpResetFilters']) && layout.searchInWrap
      && layout.searchFlex === '1' && layout.resetText === '重置筛选' && layout.searchPh.includes('…'),
      '§2 顶行 = 搜索（置顶加宽 flex:1、占位省略号）+ 重置筛选按钮（不放 chip）', JSON.stringify(layout.topKids));
    assert(JSON.stringify(layout.heads) === JSON.stringify(['分类', '主属性', '副属性', '来源'])
      && JSON.stringify(layout.notes) === JSON.stringify(['二级单选 · 三级多选', '多选', '多选', '单选 · 值域随赛季数据驱动']),
      '§2 区头标题层级：分类/主属性/副属性/来源 + 各带说明注记（WP6 分类组为第一组）', JSON.stringify(layout.notes));
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
    // §3 组内 chip 间距 6px（R5：来源组复用同一值）；来源行「全部」与值间 1px 竖分隔线 16px 高 + 8px 间距
    const gaps = await page.evaluate(() => {
      const chips = [...document.querySelectorAll('#dpPrimaryChips .dp-chip-sub .dp-chip')];
      const g = chips[1].getBoundingClientRect().left - chips[0].getBoundingClientRect().right;
      const srcChips = [...document.querySelectorAll('#dpSourceChips .dp-chip-sub .dp-chip')];
      const gSrc = srcChips.length >= 2 ? srcChips[1].getBoundingClientRect().left - srcChips[0].getBoundingClientRect().right : null;
      const div = document.querySelector('#dpSourceChips .dp-chip-divider');
      const ds = getComputedStyle(div);
      const gapBefore = div.getBoundingClientRect().left - div.previousElementSibling.getBoundingClientRect().right;
      return { chipGap: g, srcGap: gSrc, dw: ds.width, dh: ds.height, gapBefore };
    });
    assert(Math.abs(gaps.chipGap - 6) <= 0.5, '§3 组内 chip 间距 6px', `实测 ${gaps.chipGap}`);
    assert(gaps.srcGap != null && Math.abs(gaps.srcGap - 6) <= 0.5, '§3 来源组 chip 间距 = 主/副属性组同一 6px（R5）', `实测 ${gaps.srcGap}`);
    assert(gaps.dw === '1px' && gaps.dh === '16px' && Math.abs(gaps.gapBefore - 8) <= 0.5,
      '§3 来源行 1px 竖分隔线（16px 高）+ 8px 间距', JSON.stringify(gaps));
    // §4 结构：主/副/来源三组值 chip 同包一层 .dp-chip-sub（R5 同距）；值域 = 「全部」+ 当季有数据的来源（副本任务/专业制造恒不渲染）
    const expSrcVals = ['', ...(nRaid > 0 ? ['raid'] : []), ...(nDun > 0 ? ['dungeon'] : [])];
    const srcDom = await page.evaluate(() => {
      const first = document.querySelector('#dpSourceChips .dp-chip');
      return {
        primWrapped: !!document.querySelector('#dpPrimaryChips > .dp-chip-sub'),
        secWrapped: !!document.querySelector('#dpSecondaryChips > .dp-chip-sub'),
        srcWrapped: !!document.querySelector('#dpSourceChips > .dp-chip-sub'),
        vals: [...document.querySelectorAll('#dpSourceChips .dp-chip')].map(c => c.dataset.v),
        firstIsAll: first.classList.contains('dp-chip-all') && first.textContent === '全部' && first.classList.contains('active'),
      };
    });
    assert(srcDom.primWrapped && srcDom.secWrapped && srcDom.srcWrapped,
      '§4 主/副/来源三组值 chip 同包 .dp-chip-sub（R5 间距一致的结构前提）', JSON.stringify(srcDom));
    assert(JSON.stringify(srcDom.vals) === JSON.stringify(expSrcVals) && srcDom.firstIsAll,
      '§4 来源值域赛季数据驱动：「全部」首位默认选中 + 团本/大秘境（无数据来源不渲染）', srcDom.vals.join('/'));
    // §4 来源单选互斥 + R6 联动折叠：点 raid → raid active/全部失活、大秘境区块整段（含分组标题）不渲染、页面仅剩团本卡；
    // 点 dungeon → 互斥切换、团本区块整段不渲染；再点已选 dungeon → 回全部、两区块均展开
    await clickChip('#dpSourceChips', 'raid');
    await sleep(500);
    const src1 = await page.evaluate(() => ({
      raidActive: document.querySelector('#dpSourceChips .dp-chip[data-v="raid"]').classList.contains('active'),
      allOff: !document.querySelector('#dpSourceChips .dp-chip-all').classList.contains('active'),
      cards: document.querySelectorAll('.dp-item').length,
      dungeonSectionGone: ![...document.querySelectorAll('.dp-section')].some(s => s.textContent.includes('大秘境掉落池')),
      raidSectionKept: [...document.querySelectorAll('.dp-section')].some(s => s.textContent.includes('团本掉落池')),
      enterAnim: !!document.querySelector('.dp-item.dp-enter'),
    }));
    assert(src1.raidActive && src1.allOff && src1.cards === nRaid && src1.dungeonSectionGone && src1.raidSectionKept,
      '§4 来源单选「团本」：全部失活、仅剩团本卡，大秘境区块整段折叠含分组标题（R6）', JSON.stringify(src1));
    assert(src1.enterAnim, '§7 筛选交互触发的重渲染给卡片加 .dp-enter 入场动画');
    await clickChip('#dpSourceChips', 'dungeon');
    await sleep(500);
    const src2 = await page.evaluate(() => ({
      dungeonActive: document.querySelector('#dpSourceChips .dp-chip[data-v="dungeon"]').classList.contains('active'),
      raidOff: !document.querySelector('#dpSourceChips .dp-chip[data-v="raid"]').classList.contains('active'),
      cards: document.querySelectorAll('.dp-item').length,
      raidSectionGone: ![...document.querySelectorAll('.dp-section')].some(s => s.textContent.includes('团本掉落池')),
      dungeonSectionKept: [...document.querySelectorAll('.dp-section')].some(s => s.textContent.includes('大秘境掉落池')),
    }));
    assert(src2.dungeonActive && src2.raidOff && src2.cards === nDun && src2.raidSectionGone && src2.dungeonSectionKept,
      '§4 来源单选互斥切换「大秘境」：团本区块整段折叠含分组标题（R6）', JSON.stringify(src2));
    await clickChip('#dpSourceChips', 'dungeon'); // 再点已选中的值 → 回「全部」
    await sleep(500);
    const src3 = await page.evaluate(() => ({
      allBack: document.querySelector('#dpSourceChips .dp-chip-all').classList.contains('active'),
      noValActive: document.querySelectorAll('#dpSourceChips .dp-chip.active:not(.dp-chip-all)').length,
      cards: document.querySelectorAll('.dp-item').length,
      bothSections: [...document.querySelectorAll('.dp-section')].some(s => s.textContent.includes('团本掉落池'))
        && [...document.querySelectorAll('.dp-section')].some(s => s.textContent.includes('大秘境掉落池')),
    }));
    assert(src3.allBack && src3.noValActive === 0 && src3.cards === all.length && src3.bothSections,
      '§4 再点已选值回「全部」：还原全集、两区块均展开（R6）', JSON.stringify(src3));
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
    // 清空还原（撤力量+爆击 → 回浏览态全集）
    await clickChip('#dpPrimaryChips', '力量');
    await clickChip('#dpSecondaryChips', '爆击');
    await sleep(500);
    cnt = await cardCount();
    assert(cnt === all.length, `清空还原全集（页面 ${cnt} = 库内 ${all.length}）`);
    // 双视图一致（WP6 F3 起内容筛选触发平铺态、无视图开关——改在浏览态「来源=大秘境」下回归：按BOSS ≡ 整体池 ≡ 大秘境全集）
    await clickChip('#dpSourceChips', 'dungeon');
    await sleep(500);
    const bossViewCnt = await cardCount();
    await page.evaluate(() => { [...document.querySelectorAll('.dp-toggle')].find(b => b.dataset.view === 'pool').click(); });
    await sleep(500);
    const poolCnt = await cardCount();
    await page.evaluate(() => { [...document.querySelectorAll('.dp-toggle')].find(b => b.dataset.view === 'boss').click(); });
    await sleep(400);
    assert(bossViewCnt === nDun && poolCnt === nDun,
      `双视图一致（浏览态来源=大秘境：按BOSS ${bossViewCnt} = 整体池 ${poolCnt} = ${nDun}）`);
    await clickChip('#dpSourceChips', 'dungeon'); // 回「全部」
    await sleep(500);
    cnt = await cardCount();
    assert(cnt === all.length, `来源回「全部」还原全集（页面 ${cnt} = 库内 ${all.length}）`);

    // ============ WP6（过滤器二期）：F1 分类三级 + F2 来源实例级 + F3 筛选态平铺 ============
    console.log('—— WP6 F1 分类三级 / F2 来源实例级 / F3 筛选态平铺 ——');
    // F1 结构：二级 4 tab（P2：全部默认选中/部位/武器/护甲）；「全部」= 未启用分类过滤，三级行不渲染
    const f1Tabs = await page.evaluate(() => ({
      tabs: [...document.querySelectorAll('#dpCatTabs .dp-cat-tab')].map(t => t.dataset.v),
      allDefault: !!document.querySelector('#dpCatTabs .dp-cat-tab[data-v=""].active.dp-chip-all'),
      chipsHidden: document.getElementById('dpCatChips').hidden,
    }));
    assert(JSON.stringify(f1Tabs.tabs) === JSON.stringify(['', 'slot', 'weapon', 'armor']) && f1Tabs.allDefault && f1Tabs.chipsHidden,
      'WP6-F1 分类组结构：二级 4 tab（P2 全部默认选中/部位/武器/护甲），「全部」态三级行不渲染', JSON.stringify(f1Tabs));
    // F1 三级 chips 数量与值域（映射终版 2026-08-09 运营定 + P3 增设饰品）：部位 12 / 武器 4（主手全库 0 命中定义保留不渲染）/ 护甲 5
    await page.click('#dpCatTabs .dp-cat-tab[data-v="slot"]');
    await sleep(400);
    const f1Slot = await page.evaluate(() => [...document.querySelectorAll('#dpCatChips .dp-chip')].map(c => c.dataset.v));
    assert(JSON.stringify(f1Slot) === JSON.stringify(['头部', '肩部', '胸部', '腕部', '手部', '腰部', '腿部', '脚部', '背部', '颈部', '手指', '饰品']),
      'WP6-F1 部位 12 chips（slot 判定；P3 增设「饰品」末位）', f1Slot.join('/'));
    // P3 饰品映射精确匹配（S1 口径 40 件）
    await page.click('#dpCatChips .dp-chip[data-v="饰品"]');
    await sleep(400);
    let cntP3 = await cardCount();
    const nTrinket = all.filter(l => l.slot === '饰品').length;
    assert(cntP3 === nTrinket && nTrinket === 40,
      `WP6-P3 部位「饰品」映射精确匹配（页面 ${cntP3} = 库内 ${nTrinket}，S1 口径 40）`);
    await page.click('#dpCatChips .dp-chip[data-v="饰品"]'); // 撤选
    await sleep(300);
    // 部位多选 OR：头部+颈部 = 库内两 slot 并集
    await page.click('#dpCatChips .dp-chip[data-v="头部"]');
    await page.click('#dpCatChips .dp-chip[data-v="颈部"]');
    await sleep(500);
    const nHeadNeck = all.filter(l => l.slot === '头部' || l.slot === '颈部').length;
    cnt = await cardCount();
    const f1Or = await page.evaluate(() => ({
      flat: !!document.querySelector('.dp-flat-head'),
      head: document.querySelector('.dp-flat-head') ? document.querySelector('.dp-flat-head').textContent.trim() : '',
    }));
    assert(cnt === nHeadNeck && f1Or.flat && f1Or.head === `命中 ${nHeadNeck} 件`,
      `WP6-F1 部位多选 OR + F3 平铺头（头部+颈部：页面 ${cnt} = 库内 ${nHeadNeck}）`, f1Or.head);
    // 二级切换清空三级（武器 tab）：三级已选清空 → 回浏览态全集；武器 chips = 单手/双手/远程/副手（主手不渲染）
    await page.click('#dpCatTabs .dp-cat-tab[data-v="weapon"]');
    await sleep(500);
    const f1Weapon = await page.evaluate(() => ({
      chips: [...document.querySelectorAll('#dpCatChips .dp-chip')].map(c => c.dataset.v),
      flat: !!document.querySelector('.dp-flat-head'),
      cards: document.querySelectorAll('.dp-item').length,
    }));
    assert(JSON.stringify(f1Weapon.chips) === JSON.stringify(['单手', '双手', '远程', '副手'])
      && !f1Weapon.flat && f1Weapon.cards === all.length,
      'WP6-F1 二级切换清空三级（回浏览态全集）+ 武器 chips 4 枚（主手 0 命中定义保留不渲染）', f1Weapon.chips.join('/'));
    // F1 映射终版抽查（W1：法杖归双手、弓弩枪归远程、魔杖归单手、副手=副手物品）
    const CAT_EXP = {
      '单手': l => ['单手剑', '单手锤', '单手斧', '匕首', '拳套', '战刃', '魔杖'].includes(l.item_type),
      '双手': l => ['双手剑', '双手锤', '双手斧', '长柄武器', '法杖'].includes(l.item_type),
      '远程': l => ['弓', '弩', '枪械'].includes(l.item_type),
      '副手': l => l.slot === '副手物品',
    };
    for (const [k, pred] of Object.entries(CAT_EXP)) {
      await page.click(`#dpCatChips .dp-chip[data-v="${k}"]`);
      await sleep(400);
      cnt = await cardCount();
      const expN = all.filter(pred).length;
      assert(cnt === expN, `WP6-F1 武器「${k}」映射精确匹配（页面 ${cnt} = 库内 ${expN}）`);
      await page.click(`#dpCatChips .dp-chip[data-v="${k}"]`); // 撤选
      await sleep(300);
    }
    // 护甲：5 chips（盾牌归护甲不归武器副手，与武器-副手零重叠）
    await page.click('#dpCatTabs .dp-cat-tab[data-v="armor"]');
    await sleep(400);
    const f1Armor = await page.evaluate(() => [...document.querySelectorAll('#dpCatChips .dp-chip')].map(c => c.dataset.v));
    assert(JSON.stringify(f1Armor) === JSON.stringify(['板甲', '锁甲', '皮甲', '布甲', '盾牌']),
      'WP6-F1 护甲 5 chips（item_type 判定，盾牌归护甲）', f1Armor.join('/'));
    await page.click('#dpCatChips .dp-chip[data-v="盾牌"]');
    await sleep(400);
    cnt = await cardCount();
    const nShield = all.filter(l => l.item_type === '盾牌').length;
    assert(cnt === nShield && nShield === all.filter(l => l.slot === '副手').length,
      `WP6-F1 护甲「盾牌」精确匹配且与 slot='副手' 同集（${cnt} = ${nShield}，武器-副手零重叠）`);
    await page.click('#dpCatChips .dp-chip[data-v="盾牌"]');
    await sleep(300);
    await page.click('#dpCatTabs .dp-cat-tab[data-v="armor"]'); // 收起分类 tab
    await sleep(400);
    // F2 来源实例级：来源=团本 → 实例 chips 数据驱动（4 枚带计数、合计 = 团本总数）；
    // 点「虚影尖塔」→ 秘境池整段折叠 + 团本池只剩该实例分组 + 卡片数 = 该实例件数；再点取消恢复池全量
    await page.click('#dpSourceChips .dp-chip[data-v="raid"]');
    await sleep(500);
    const f2 = await page.evaluate(() => ({
      chips: [...document.querySelectorAll('#dpInstanceChips .dp-chip-inst')].map(c => ({
        name: c.childNodes[0].textContent.trim(), count: Number(c.querySelector('.dp-count').textContent),
      })),
      flat: !!document.querySelector('.dp-flat-head'),
    }));
    const bossRaid = new Map(bossRows.map(b => [b.id, b.raid_id]));
    const raidNameById = new Map(raids.map(r => [r.id, r.name]));
    const raidInstExp = {};
    raidLoot.forEach(l => { const nm = raidNameById.get(bossRaid.get(l.boss_id)); raidInstExp[nm] = (raidInstExp[nm] || 0) + 1; });
    const f2Sum = f2.chips.reduce((a, c) => a + c.count, 0);
    assert(f2.chips.length === Object.keys(raidInstExp).length && f2Sum === nRaid && !f2.flat
      && f2.chips.every(c => raidInstExp[c.name] === c.count),
      'WP6-F2 团本实例 chips 数据驱动（枚数/逐实例计数/合计均与库内一致，仅来源不触发平铺）', JSON.stringify(f2.chips));
    const target = f2.chips.find(c => c.name === '虚影尖塔') || f2.chips[0];
    await page.evaluate((nm) => {
      [...document.querySelectorAll('#dpInstanceChips .dp-chip-inst')].find(c => c.childNodes[0].textContent.trim() === nm).click();
    }, target.name);
    await sleep(500);
    const f2Sel = await page.evaluate(() => ({
      cards: document.querySelectorAll('.dp-item').length,
      groups: [...document.querySelectorAll('.dp-raid > .dp-raid-name')].map(h => h.textContent.replace(/\d+$/, '').trim()),
      dungeonGone: ![...document.querySelectorAll('.dp-section')].some(s => s.textContent.includes('大秘境掉落池')),
    }));
    assert(f2Sel.cards === target.count && f2Sel.groups.length === 1 && f2Sel.groups[0].startsWith(target.name) && f2Sel.dungeonGone,
      `WP6-F2 点「${target.name}」：秘境池折叠 + 团本池只剩该实例（${f2Sel.cards} = ${target.count} 件）`, JSON.stringify(f2Sel));
    await page.evaluate((nm) => { // 再点取消 → 恢复池全量
      [...document.querySelectorAll('#dpInstanceChips .dp-chip-inst')].find(c => c.childNodes[0].textContent.trim() === nm).click();
    }, target.name);
    await sleep(500);
    cnt = await cardCount();
    assert(cnt === nRaid, `WP6-F2 再点取消实例选中：团本池恢复全量（${cnt} = ${nRaid}）`);
    await clickChip('#dpSourceChips', 'raid'); // F3-W4 需全局口径：来源先回「全部」
    await sleep(500);
    // F3 平铺态（W4/W5）：爆击+精通 → 全局平铺（无池标题无分组）+ 顶部命中计数 = REST 口径逐字一致；
    // 平铺态来源=团本（含实例）退化为纯过滤 → 命中仅团本装备、不触发折叠/分组
    await clickChip('#dpSecondaryChips', '爆击');
    await clickChip('#dpSecondaryChips', '精通');
    await sleep(500);
    const nCritMast = all.filter(l => (l.secondary_stats || []).includes('爆击') && (l.secondary_stats || []).includes('精通')).length;
    const nCritMastRaid = raidLoot.filter(l => (l.secondary_stats || []).includes('爆击') && (l.secondary_stats || []).includes('精通')).length;
    const f3 = await page.evaluate(() => ({
      flat: !!document.querySelector('.dp-flat-head'),
      head: document.querySelector('.dp-flat-head') ? document.querySelector('.dp-flat-head').textContent.trim() : '',
      cards: document.querySelectorAll('.dp-item').length,
      poolTitles: [...document.querySelectorAll('.dp-section-title')].map(t => t.textContent.trim()).filter(t => t.includes('掉落池')),
    }));
    assert(f3.flat && f3.head === `命中 ${nCritMast} 件` && f3.cards === nCritMast && f3.poolTitles.length === 0,
      `WP6-F3 平铺态：爆击+精通命中 ${f3.cards} = REST 口径 ${nCritMast}，无池标题无分组`, JSON.stringify(f3));
    assert(f3.cards === nCritMast && nCritMast > 0, 'WP6-F3 平铺命中计数与 REST 逐字一致（备料非零）', `${nCritMast}`);
    // W5：平铺态 + 来源=团本 → 命中仅团本装备（来源退化为纯过滤，不触发折叠/分组）
    await clickChip('#dpSourceChips', 'raid');
    await sleep(500);
    cnt = await cardCount();
    const f3w5 = await page.evaluate(() => ({
      flat: !!document.querySelector('.dp-flat-head'),
      poolTitles: [...document.querySelectorAll('.dp-section-title')].filter(t => t.textContent.includes('掉落池')).length,
    }));
    assert(cnt === nCritMastRaid && f3w5.flat && f3w5.poolTitles === 0,
      `WP6-F3 平铺态来源退化为纯过滤（团本+爆击+精通：页面 ${cnt} = 库内 ${nCritMastRaid}，仍平铺无分组）`);
    // W6：0 命中空态 + 重置引导（叠加搜索 zzz）
    await page.fill('#dpSearch', 'zzz');
    await sleep(500);
    const f3Empty = await page.evaluate(() => ({
      head: document.querySelector('.dp-flat-head') ? document.querySelector('.dp-flat-head').textContent.trim() : '',
      empty: document.querySelector('.dp-empty') ? document.querySelector('.dp-empty').textContent : '',
      resetBtn: !!document.getElementById('dpEmptyReset'),
      cards: document.querySelectorAll('.dp-item').length,
    }));
    assert(f3Empty.head === '命中 0 件' && f3Empty.empty.includes('无符合条件装备') && f3Empty.resetBtn && f3Empty.cards === 0,
      'WP6-F3 0 命中空态：「无符合条件装备」+ 重置引导按钮', JSON.stringify(f3Empty));
    await page.click('#dpEmptyReset'); // 空态重置 → 回浏览态全集
    await sleep(600);
    const f3Reset = await page.evaluate(() => ({
      cards: document.querySelectorAll('.dp-item').length,
      flat: !!document.querySelector('.dp-flat-head'),
      bothPools: [...document.querySelectorAll('.dp-section-title')].filter(t => t.textContent.includes('掉落池')).length,
    }));
    assert(f3Reset.cards === all.length && !f3Reset.flat && f3Reset.bothPools === 2,
      'WP6-F3 空态重置：回浏览态双池全集', JSON.stringify(f3Reset));

    // ============ WP6 补丁 P4：筛选联动置灰 ============
    console.log('—— WP6 补丁 P4 筛选联动置灰 ——');
    // 力量+敏捷（AND）→ 部位 tab 下：库内「力量∧敏捷」装备的 slot 集之外的未选 chip 全部置灰（锚点：颈部/手指必在列）；
    // 已选 chip 恒不置灰；置灰不可点；重置全恢复
    await clickChip('#dpPrimaryChips', '力量');
    await clickChip('#dpPrimaryChips', '敏捷');
    await sleep(500);
    await page.click('#dpCatTabs .dp-cat-tab[data-v="slot"]');
    await sleep(500);
    const strAgiSlots = new Set(all.filter(l => (l.primary_stats || []).includes('力量') && (l.primary_stats || []).includes('敏捷')).map(l => l.slot));
    const p4 = await page.evaluate(() => ({
      disabled: [...document.querySelectorAll('#dpCatChips .dp-chip.dp-chip-disabled')].map(c => c.dataset.v),
      titles: [...document.querySelectorAll('#dpCatChips .dp-chip.dp-chip-disabled')].map(c => c.title),
      arias: [...document.querySelectorAll('#dpCatChips .dp-chip.dp-chip-disabled')].map(c => c.getAttribute('aria-disabled')),
      strDisabled: document.querySelector('#dpPrimaryChips .dp-chip[data-v="力量"]').classList.contains('dp-chip-disabled'),
      agiDisabled: document.querySelector('#dpPrimaryChips .dp-chip[data-v="敏捷"]').classList.contains('dp-chip-disabled'),
    }));
    const SLOT_KEYS = ['头部', '肩部', '胸部', '腕部', '手部', '腰部', '腿部', '脚部', '背部', '颈部', '手指', '饰品'];
    const expDisabled = SLOT_KEYS.filter(s => !strAgiSlots.has(s));
    assert(JSON.stringify([...p4.disabled].sort()) === JSON.stringify([...expDisabled].sort())
      && p4.disabled.includes('颈部') && p4.disabled.includes('手指'),
      'WP6-P4 未选 chip 0 命中置灰（力量∧敏捷下部位 12 项置灰集=库内口径逐值一致；锚点颈部/手指在列）',
      `页面 ${JSON.stringify(p4.disabled)} 库内 ${JSON.stringify(expDisabled)}`);
    assert(p4.titles.length > 0 && p4.titles.every(t => t.includes('无命中')) && p4.arias.every(a => a === 'true'),
      'WP6-P4 置灰 chip 带悬浮原因提示 + aria-disabled=true', p4.titles[0] || '无置灰');
    assert(!p4.strDisabled && !p4.agiDisabled, 'WP6-P4 已选 chip（力量/敏捷）恒不置灰');
    const p4Before = await cardCount();
    await page.click('#dpCatChips .dp-chip[data-v="颈部"]', { force: true });
    // P4-补（二轮）：点击置灰 chip 的即时反馈——chip 抖动类（200ms）+ 筛选条下浮出原因提示（含标签名与「无命中」）
    const p4Fb = await page.evaluate(() => ({
      shaking: !!document.querySelector('#dpCatChips .dp-chip[data-v="颈部"].dp-chip-shake'),
      hintEl: !!document.getElementById('dpChipHint'),
      hintShown: (document.getElementById('dpChipHint') || { classList: { contains: () => false } }).classList.contains('show'),
      hintText: (document.getElementById('dpChipHint') || {}).textContent || '',
      cursorNA: getComputedStyle(document.querySelector('#dpCatChips .dp-chip[data-v="颈部"]')).cursor === 'not-allowed',
      titleKept: document.querySelector('#dpCatChips .dp-chip[data-v="颈部"]').title.includes('无命中'),
    }));
    assert(p4Fb.shaking && p4Fb.hintEl && p4Fb.hintShown && p4Fb.hintText.includes('「颈部」') && p4Fb.hintText.includes('无命中')
      && p4Fb.cursorNA && p4Fb.titleKept,
      'WP6-P4-补 置灰点击反馈：cursor:not-allowed + chip 抖动 200ms + 筛选条下浮出原因提示（「颈部」…无命中…）+ title 保留', JSON.stringify(p4Fb));
    await sleep(300);
    const p4Click = await page.evaluate(() => ({
      active: !!document.querySelector('#dpCatChips .dp-chip[data-v="颈部"].active'),
      cards: document.querySelectorAll('.dp-item').length,
    }));
    assert(!p4Click.active && p4Click.cards === p4Before,
      'WP6-P4 置灰 chip 点击无效（不选中、结果集不变、不自动清除已选）', JSON.stringify(p4Click));
    await sleep(2100); // 提示 2s 渐隐（含已等待的 300ms）
    const p4FbGone = await page.evaluate(() => {
      const h = document.getElementById('dpChipHint');
      return h ? !h.classList.contains('show') : true;
    });
    assert(p4FbGone, 'WP6-P4-补 原因提示 2s 后渐隐');
    await page.click('#dpResetFilters');
    await sleep(600);
    const p4Reset = await page.evaluate(() => ({
      disabledLeft: document.querySelectorAll('.dp-chip.dp-chip-disabled').length,
      cards: document.querySelectorAll('.dp-item').length,
      flat: !!document.querySelector('.dp-flat-head'),
    }));
    assert(p4Reset.disabledLeft === 0 && p4Reset.cards === all.length && !p4Reset.flat,
      'WP6-P4 重置筛选：置灰全清、回浏览态全集', JSON.stringify(p4Reset));

    // ============ 修正项①（WP6 补丁 P1 整卡生长，2026-08-09 运营体验终审）：废弃独立浮层遮盖——
    // hover 卡片本体（含边框）经 max-height 动画向下生长、特效全文框内展开、来源行跟随新底部全程可见；
    // 生长部分 z-index 提升覆盖下方卡片、不推挤网格；离开收回。R7：未溢出卡无 has-effect 无 hover 无截断 ============
    console.log('—— ① hover 整卡生长逐字核验（3 张长特效卡；P1 生长 / R7 未溢出零 hover） ——');
    let overflowSeen = 0;
    for (let i = 0; i < picked.length; i++) {
      const item = picked[i];
      // 同名装备可能有跨 BOSS 多行（特效不同），按「名字 + 预览 dataset.full 全文」双重定位；
      // has-effect 仅溢出卡有（measureEffectCards 镜像实测溢出），未溢出卡走 R7 零 hover 路径
      const pre = await page.evaluate((it) => {
        const card = [...document.querySelectorAll('.dp-item')].find(c => {
          const p = c.querySelector('.dp-item-effect-preview');
          return p && p.dataset.full === it.effect
            && c.querySelector('.dp-item-name').textContent === it.item_name;
        });
        if (!card) return { found: false };
        card.setAttribute('data-t4-hover', '1');
        card.scrollIntoView({ block: 'center' });
        const preview = card.querySelector('.dp-item-effect-preview');
        const inner = card.querySelector('.dp-item-inner');
        const wrap = card.querySelector('.dp-item-effect-wrap');
        const wcs = getComputedStyle(wrap);
        return { found: true, overflow: card.classList.contains('has-effect'), before: {
          previewFull: preview.textContent === it.effect,              // P1：预览恒为特效全文
          cropped: wrap.scrollHeight > wrap.clientHeight + 1,          // P1-补：容器 2 行高 overflow 纯视口裁剪
          textTop0: Math.abs(preview.getBoundingClientRect().top - wrap.getBoundingClientRect().top) <= 1, // P1-补：文本 top 偏移恒 0
          minH: card.style.minHeight,
          cardH: card.getBoundingClientRect().height,
          innerPos: getComputedStyle(inner).position,
          noOverlay: !card.querySelector('.dp-item-effect-overlay'),   // 浮层形态废止
          wrapTrans: `${wcs.transitionProperty}|${wcs.transitionDuration}|${wcs.transitionTimingFunction}`,
        } };
      }, item);
      let after = null, back = null, mid = null;
      if (pre.found && pre.overflow) {
        overflowSeen++;
        await page.hover('[data-t4-hover]');
        await sleep(100); // 生长动画中段（200ms 动画）：P1-补 核心断言——文本 top 偏移恒 0、零重排
        mid = await page.evaluate(() => {
          const card = document.querySelector('[data-t4-hover]');
          const wrap = card.querySelector('.dp-item-effect-wrap');
          const preview = card.querySelector('.dp-item-effect-preview');
          return { textTop0: Math.abs(preview.getBoundingClientRect().top - wrap.getBoundingClientRect().top) <= 1,
            sameText: preview.textContent === preview.dataset.full };
        });
        await sleep(350); // 200ms max-height 生长动画 + 余量
        after = await page.evaluate(() => {
          const card = document.querySelector('[data-t4-hover]');
          const inner = card.querySelector('.dp-item-inner');
          const preview = card.querySelector('.dp-item-effect-preview');
          const wrap = card.querySelector('.dp-item-effect-wrap');
          const src = card.querySelector('.dp-item-src');
          const cs = getComputedStyle(inner);
          const cardR = card.getBoundingClientRect(), innerR = inner.getBoundingClientRect(), srcR = src.getBoundingClientRect();
          return {
            pos: cs.position, z: cs.zIndex,
            grown: innerR.height > parseFloat(card.style.minHeight) + 10,               // 整卡向下生长
            cardStable: Math.abs(cardR.height - parseFloat(card.style.minHeight)) < 1.5, // 外层占位不塌、网格不动
            srcFollows: Math.abs(srcR.bottom - (innerR.bottom - parseFloat(cs.paddingBottom))) < 1.5, // 来源行跟随新底部
            srcInside: srcR.bottom <= innerR.bottom + 0.5 && srcR.top >= innerR.top,     // 全程可见不被遮盖
            textFull: preview.textContent === preview.dataset.full,                      // 特效全文框内展开
            textTop0: Math.abs(preview.getBoundingClientRect().top - wrap.getBoundingClientRect().top) <= 1, // P1-补：展开态文本零位移
            displayBlock: getComputedStyle(preview).display === 'block',                 // P1-补：无 line-clamp（恒 block 排版）
            noClampCss: getComputedStyle(preview).webkitLineClamp === 'none',
          };
        });
        await page.hover('.dp-footer'); // 鼠标移开（页脚）→ 离开动画收回
        await sleep(400);
        back = await page.evaluate(() => {
          const card = document.querySelector('[data-t4-hover]');
          const preview = card.querySelector('.dp-item-effect-preview');
          const wrap = card.querySelector('.dp-item-effect-wrap');
          const out = { pos: getComputedStyle(card.querySelector('.dp-item-inner')).position,
            cropped: wrap.scrollHeight > wrap.clientHeight + 1,
            textTop0: Math.abs(preview.getBoundingClientRect().top - wrap.getBoundingClientRect().top) <= 1 };
          card.removeAttribute('data-t4-hover'); // 避免下一张定位到旧卡
          return out;
        });
      } else if (pre.found) {
        await page.evaluate(() => document.querySelector('[data-t4-hover]').removeAttribute('data-t4-hover'));
      }
      const ok = pre.found && (pre.overflow
        ? (after && back && mid
          && pre.before.previewFull && pre.before.cropped && pre.before.textTop0 // 折叠态：预览恒全文 + 视口裁剪 + 文本零位移
          && pre.before.noOverlay                                      // 浮层废止：零 overlay DOM
          && pre.before.innerPos === 'static'
          && pre.before.minH && Math.abs(parseFloat(pre.before.minH) - pre.before.cardH) < 1.5 // 折叠态占位高 = 卡高
          && /max-height/.test(pre.before.wrapTrans) && /0\.2s/.test(pre.before.wrapTrans) && /ease-out/.test(pre.before.wrapTrans) // §6 例外已注册
          && mid.textTop0 && mid.sameText                              // P1-补：动画中段文本 top 偏移 0、文本零变化
          && after.pos === 'absolute' && after.z === '30'
          && after.grown && after.cardStable                           // 整卡生长 + 网格不塌
          && after.srcFollows && after.srcInside                       // 来源行跟随新底部全程可见
          && after.textFull && after.textTop0 && after.displayBlock && after.noClampCss // 全文展开、无 clamp、零位移
          && back.pos === 'static' && back.cropped && back.textTop0)   // 离开收回折叠态（视口裁剪恢复、零位移）
        : (pre.before.previewFull && !pre.before.cropped && pre.before.noOverlay && !pre.before.minH && pre.before.textTop0)); // R7：未溢出整行直显
      assert(ok, `①卡${i + 1}「${item.item_name}」${pre.found && pre.overflow ? 'hover 整卡生长（P1+P1-补）：视口裁剪→框内全文展开、全程文本 top 偏移 0、来源行跟随、网格不塌、离开收回' : '未溢出：整行直显无裁剪无 hover（R7）'}`,
        pre.found ? `before=${JSON.stringify(pre.before)} mid=${JSON.stringify(mid)} after=${JSON.stringify(after)} back=${JSON.stringify(back)}` : '卡片未找到');
    }
    assert(overflowSeen >= 1, '①备料：3 张长特效卡中至少 1 张实测溢出（has-effect，生长路径被真实覆盖）', `溢出 ${overflowSeen}/3`);
    // R7/P1/P1-补 专项（全页不变量）：全页零 overlay DOM、零 line-clamp；预览恒=特效全文一次性排版、文本 top 偏移恒 0；
    // 未溢出卡 = 无 has-effect/无占位 minHeight/无视口裁剪/无 … 伪元素；
    // 溢出卡 = has-effect + 容器 2 行高视口裁剪（… 观感由 ::after 伪元素承担）+ JS 预设折叠态 minHeight（hover 生长不塌网格）
    const r7 = await page.evaluate(() => {
      const bad = [];
      let shortSeen = 0, longSeen = 0;
      document.querySelectorAll('.dp-item').forEach(c => {
        const p = c.querySelector('.dp-item-effect-preview');
        if (!p) return;
        const name = c.querySelector('.dp-item-name').textContent;
        const wrap = c.querySelector('.dp-item-effect-wrap');
        const has = c.classList.contains('has-effect');
        const cropped = wrap.scrollHeight > wrap.clientHeight + 1;
        const dots = getComputedStyle(wrap, '::after').content.includes('…');
        const topOff = Math.abs(p.getBoundingClientRect().top - wrap.getBoundingClientRect().top) > 1;
        if (p.textContent !== p.dataset.full) bad.push('预览非全文:' + name);
        if (c.querySelector('.dp-item-effect-overlay')) bad.push('overlay残留:' + name);
        if (topOff) bad.push('文本偏移:' + name);
        if (getComputedStyle(p).webkitLineClamp !== 'none') bad.push('clamp残留:' + name);
        if (has) {
          longSeen++;
          if (!cropped || !c.style.minHeight || !dots) bad.push('溢出卡异常:' + name);
        } else {
          shortSeen++;
          if (cropped || c.style.minHeight || dots) bad.push('未溢出卡异常:' + name);
        }
      });
      return { bad, shortSeen, longSeen, overlayDom: document.querySelectorAll('.dp-item-effect-overlay').length };
    });
    assert(r7.bad.length === 0 && r7.shortSeen > 0 && r7.longSeen > 0 && r7.overlayDom === 0,
      `①R7/P1-补 全页不变量：未溢出卡 ${r7.shortSeen} 张零裁剪零 hover 零占位零 …、溢出卡 ${r7.longSeen} 张视口裁剪+…伪元素+占位高、全页零 overlay 零 clamp、文本偏移恒 0、预览恒全文`,
      JSON.stringify(r7.bad));
    // ① 截图：特效卡 折叠态 vs 悬浮展开态
    await page.evaluate(() => {
      const card = [...document.querySelectorAll('.dp-item.has-effect')][0];
      card.setAttribute('data-t4-shot', '1');
      card.scrollIntoView({ block: 'center' });
    });
    await sleep(300);
    await page.screenshot({ path: path.join(SHOT_DIR, '1366-expand-before.png') });
    await page.hover('[data-t4-shot]');
    await sleep(500);
    await page.screenshot({ path: path.join(SHOT_DIR, '1366-expand-after.png') });
    await page.hover('.dp-footer');
    await sleep(300);

    // ============ ①+ 任务书 #28 WP3-v2：全信息装备卡 ============
    console.log('—— ①+ WP3-v2 全信息装备卡 ——');
    // WP3-1 RPC 通道：页面加载经公开 RPC（anon 直连 PostgREST，不走 server.js；监听器在 page.goto 前已挂）
    assert(rpcCalls.some(c => c === 'POST 200'),
      'WP3-1 RPC 通道：POST /rest/v1/rpc/get_public_loot_detail 返回 200', rpcCalls.join(' | ') || '未捕获到调用');
    // 备料（REST 动态取，不硬编码）：有数值（主或副）的特效卡、套装兑换物卡、
    // 星标卡（副属性 ≥2 值且唯一最大）、单副属性值卡、缺数值有属性名卡（裁定 E）
    // （库内实况 2026-08-08 探针：无「无属性名纯空卡」——无特效无值卡仅 S2 两件且带属性名，缺值卡兼任空行占位断言）
    const richItem = all.find(l => l.effect && ((l.primary_values && Object.keys(l.primary_values).length)
      || (l.secondary_values && Object.keys(l.secondary_values).length)));
    // 跨赛季全集（缺数值卡在 S2「烈毒之渊」），命中非当前赛季卡时切赛季断言后切回
    const allFull = [...await rest('/boss_loot?select=*&limit=2000'), ...await rest('/dungeon_loot?select=*&limit=2000')]
      .filter(l => l.slot !== '杂项' && !EXCL_TYPES.includes(l.item_type));
    const hasVals = o => o && Object.keys(o).length;
    const tierItem = all.find(l => l.slot === '套装兑换物' && String(l.item_name).includes('珍玩'));
    const uniqMax = o => { const vs = Object.values(o || {}).map(Number); return vs.length >= 2 && vs.filter(v => v === Math.max(...vs)).length === 1; };
    const starItem = all.find(l => uniqMax(l.secondary_values));
    const oneSecItem = all.find(l => Object.keys(l.secondary_values || {}).length === 1);
    const noValItem = allFull.find(l => ((l.primary_stats || []).length || (l.secondary_stats || []).length)
      && !hasVals(l.primary_values) && !hasVals(l.secondary_values) && l.slot !== '套装兑换物');
    assert(richItem && tierItem && starItem && oneSecItem && noValItem,
      'WP3 备料：特效有值卡/套装兑换物卡/星标卡/单副值卡/缺数值卡 各一',
      `rich=${!!richItem} tier=${!!tierItem} star=${!!starItem} one=${!!oneSecItem} noval=${!!noValItem}`);
    if (richItem && tierItem && starItem && oneSecItem && noValItem) {
      richItem.effect = richItem.effect.replace(/\r\n?/g, '\n'); // 同 ① 的 \r 规范化（innerHTML 解析吞 \r）
      const P_CLS = { '力量': 'dp-tag-p1', '敏捷': 'dp-tag-p2', '智力': 'dp-tag-p3' }; // §4.11 色板
      // 卡片结构行读取器（裁定 G 行序：名称/meta/主属性(如有)/副属性(如有)/特效(如有)/来源；R2 只渲染有数据的行——
      // 主/副属性行按 tag 类识别，不能按序号取：无主属性卡的第一条 .dp-item-stats 就是副属性行）
      const readCard = mark => page.evaluate((m) => {
        const card = document.querySelector(`[${m}]`);
        if (!card) return null;
        const statRows = [...card.querySelectorAll('.dp-item-stats')];
        const primRow = statRows.find(r => r.querySelector('.dp-tag-p1,.dp-tag-p2,.dp-tag-p3,.dp-tag-primary')) || null;
        const secRow = statRows.find(r => r.querySelector('.dp-tag-secondary')) || null;
        const rows = [card.querySelector('.dp-item-name'), card.querySelector('.dp-item-meta'),
          primRow, secRow, card.querySelector('.dp-item-effect-wrap'), card.querySelector('.dp-item-src')].filter(Boolean);
        const tagsOf = row => row ? [...row.querySelectorAll('.dp-tag')].map(t => ({
          text: t.textContent.trim(), cls: t.className,
          star: t.classList.contains('dp-tag-star'), svg: !!t.querySelector('svg') })) : null;
        return {
          rowCount: rows.length,
          rowTops: rows.map(e => Math.round(e.getBoundingClientRect().top)),
          primTags: tagsOf(primRow), secTags: tagsOf(secRow),
          previewText: (card.querySelector('.dp-item-effect-preview') || {}).textContent || null,
          srcText: (card.querySelector('.dp-item-src') || {}).textContent || null,
          cursor: getComputedStyle(card).cursor,
          cardH: Math.round(card.getBoundingClientRect().height),
        };
      }, mark);
      // 定位 rich 卡（同名跨 BOSS 多行合法，按 名字+预览 dataset.full 全文 双重定位）并打标
      const richFound = await page.evaluate((it) => {
        const card = [...document.querySelectorAll('.dp-item')].find(c => {
          const p = c.querySelector('.dp-item-effect-preview');
          return p && p.dataset.full === it.effect
            && c.querySelector('.dp-item-name').textContent === it.item_name;
        });
        if (!card) return false;
        card.setAttribute('data-t4-rich', '1');
        card.scrollIntoView({ block: 'center' });
        const next = card.parentElement.querySelector('.dp-item:not([data-t4-rich])');
        if (next) next.setAttribute('data-t4-nb', '1');
        return true;
      }, richItem);
      assert(richFound, `WP3-2 备料定位：特效有值卡「${richItem.item_name}」在页`);
      const c1 = await readCard('data-t4-rich');
      // WP3-2 行序逐行排列（裁定 G + R2 有数据行）+ 主属性色板 + 数值逐字
      const expPrim = (richItem.primary_stats || []).map(s =>
        ({ text: `${s}${richItem.primary_values && richItem.primary_values[s] != null ? ' +' + richItem.primary_values[s] : ''}`, cls: P_CLS[s] || 'dp-tag-primary' }));
      const expRows = 2 + ((richItem.primary_stats || []).length ? 1 : 0) + ((richItem.secondary_stats || []).length ? 1 : 0) + 1 /*特效*/ + 1 /*来源*/;
      const primOk = expPrim.length === 0 ? c1.primTags === null
        : (c1.primTags && JSON.stringify(c1.primTags.map(t => t.text)) === JSON.stringify(expPrim.map(t => t.text))
          && c1.primTags.every((t, i) => t.cls.includes(expPrim[i].cls)));
      const strictlyDescending = c1.rowTops.every((t, i) => i === 0 || t > c1.rowTops[i - 1]);
      assert(c1.rowCount === expRows && strictlyDescending && primOk && c1.cursor !== 'pointer',
        `WP3-2 行序=名称/meta/主属性(如有)/副属性(如有)/特效/来源（裁定 G + R2 只渲染有数据行）+ 主属性色板/数值逐字 + 非 pointer 光标（零点击）`,
        `rows=${c1.rowCount}/${expRows} tops=${JSON.stringify(c1.rowTops)} prim=${JSON.stringify((c1.primTags || []).map(t => t.text + '/' + t.cls))}`);
      // WP3-3（R3）：恒占恒高废止——卡片高度内容驱动，同一 grid 行内原生 stretch 等高（零 JS 测高）、行间允许不同高
      const rowGroups = await page.evaluate(() => {
        const byTop = new Map();
        [...document.querySelectorAll('.dp-item')].forEach(c => {
          const t = Math.round(c.getBoundingClientRect().top);
          if (!byTop.has(t)) byTop.set(t, []);
          byTop.get(t).push(Math.round(c.getBoundingClientRect().height));
        });
        const groups = [...byTop.values()].filter(g => g.length > 1);
        return { rows: byTop.size, multiGroups: groups.length,
          uneven: groups.filter(g => new Set(g).size > 1).length,
          distinctHeights: new Set([...byTop.values()].flat()).size };
      });
      assert(rowGroups.multiGroups > 0 && rowGroups.uneven === 0,
        'WP3-3 内容驱动行内等高（R3）：同一 grid 行内各卡高度一致（grid 原生 stretch，零 JS 测高）', JSON.stringify(rowGroups));
      const cardCss = ['.dp-item-name', '.dp-item-meta', '.dp-item-stats', '.dp-item-effect-preview', '.dp-item-src']
        .map(ruleOf).join('\n');
      assert(!/min-height|(?<!line-)height\s*:/.test(cardCss),
        'WP3-3b 卡片各结构行无固定/占位行高（R3：恒占 174px 与占位行废止）',
        cardCss.match(/[a-z-]*height[^;]+;/g)?.join(' | ') || '无 height 声明');
      // WP3-4 零点击交互（运营方向修正③）：点击/Esc 后卡片类名零变化、全页无详情层 DOM
      const clsBefore = await page.evaluate(() => document.querySelector('[data-t4-rich]').className);
      await page.click('[data-t4-rich]');
      await sleep(300);
      await page.keyboard.press('Escape');
      await sleep(200);
      const clickRes = await page.evaluate(() => ({
        cls: document.querySelector('[data-t4-rich]').className,
        detailDom: document.querySelectorAll('.dp-item-detail, .dp-detail-open').length,
      }));
      assert(clickRes.cls === clsBefore && clickRes.detailDom === 0,
        'WP3-4 卡片零点击：点击+Esc 后类名零变化、无 .dp-item-detail/.dp-detail-open 残留',
        JSON.stringify(clickRes));
      // WP3-5 掉落难度行不显（tiers 全 null，裁定①）：DOM 无「掉落难度」字样 + 数据侧 tiers 全空
      const tiersAllNull = allFull.every(l => !Object.keys(l.primary_tiers || {}).length && !Object.keys(l.secondary_tiers || {}).length);
      const diffText = await page.evaluate(() =>
        [...document.querySelectorAll('.dp-item')].filter(c => c.textContent.includes('掉落难度')).length);
      assert(tiersAllNull && diffText === 0, 'WP3-5 掉落难度不显（库内 tiers 全 null，DOM 零「掉落难度」）',
        `tiersNull=${tiersAllNull} dom=${diffText}`);
      // WP3-14（R13 / BUG-062）世界BOSS剔除：RPC 零 instance_type='world' 行（黑名单写法）、页面零「至暗之夜」；
      // lair 巢穴（孢陨幽境）归团本口径保留展示
      const rpcRows = await fetch(`${SB}/rest/v1/rpc/get_public_loot_detail`,
        { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.json());
      const worldRows = rpcRows.filter(x => x.instance_type === 'world').length;
      const lairRows = rpcRows.filter(x => x.instance_type === 'lair').length;
      const worldDom = await page.evaluate(() => ({
        // 精确口径：来源行以「至暗之夜 ·」开头（实例名）才算世界BOSS行——BOSS 名「至暗之夜降临」（进军奎尔丹纳斯）是合法团本内容
        srcHits: [...document.querySelectorAll('.dp-item-src')].filter(e => e.textContent.startsWith('至暗之夜 ·')).length,
        headHits: [...document.querySelectorAll('.dp-raid-name')].filter(e => e.textContent.replace(/[\d\s]/g, '') === '至暗之夜').length,
        lairKept: [...document.querySelectorAll('.dp-raid-name')].some(e => e.textContent.includes('孢陨幽境')),
      }));
      assert(worldRows === 0 && lairRows > 0 && worldDom.srcHits === 0 && worldDom.headHits === 0 && worldDom.lairKept,
        'WP3-14 R13 世界BOSS剔除（BUG-062）：RPC 零 world 行、页面零至暗之夜实例行（BOSS「至暗之夜降临」为合法团本内容不误伤）、lair 巢穴保留',
        JSON.stringify({ worldRows, lairRows, ...worldDom }));
      // WP3-6 副属性降序+星标（裁定 H）：星标卡首 tag=唯一最大者带⭐+SVG，其余无星；单副值卡无星
      const starExp = Object.entries(starItem.secondary_values).map(([k, v]) => ({ k, v: Number(v) }))
        .sort((a, b) => b.v - a.v).map(e => `${e.k} +${e.v}`);
      const starMarked = await page.evaluate((it) => {
        const exp = Object.entries(it.secondary_values).map(([k, v]) => `${k} +${v}`);
        const card = [...document.querySelectorAll('.dp-item')].find(c => {
          if (c.querySelector('.dp-item-name').textContent !== it.item_name) return false;
          const r = [...c.querySelectorAll('.dp-item-stats')].find(x => x.querySelector('.dp-tag-secondary'));
          if (!r) return false;
          const have = [...r.querySelectorAll('.dp-tag')].map(t => t.textContent.trim());
          return exp.every(e => have.includes(e));
        });
        if (card) card.setAttribute('data-t4-star', '1');
        return !!card;
      }, starItem);
      const starTags = starMarked ? (await readCard('data-t4-star')).secTags : null;
      const starOk = starTags
        && JSON.stringify(starTags.map(t => t.text)) === JSON.stringify(starExp) // 降序（含最大值排第一）
        && starTags[0].star && starTags[0].svg && starTags.slice(1).every(t => !t.star); // 唯一最大者⭐
      assert(starOk, `WP3-6 副属性降序+唯一最大者⭐排第一（裁定 H）：「${starItem.item_name}」`,
        starTags ? JSON.stringify(starTags.map(t => t.text + (t.star ? '⭐' : ''))) : '卡片未找到');
      const oneMarked = await page.evaluate((it) => {
        const card = [...document.querySelectorAll('.dp-item')].find(c => {
          if (c.querySelector('.dp-item-name').textContent !== it.item_name) return false;
          const r = [...c.querySelectorAll('.dp-item-stats')].find(x => x.querySelector('.dp-tag-secondary'));
          return r && r.querySelectorAll('.dp-tag').length === 1;
        });
        if (card) card.setAttribute('data-t4-one', '1');
        return !!card;
      }, oneSecItem);
      const oneTags = oneMarked ? (await readCard('data-t4-one')).secTags : null;
      assert(oneTags && oneTags.length === 1 && !oneTags[0].star,
        `WP3-6b 单副属性值卡「${oneSecItem.item_name}」不加星（三态规则）`,
        oneTags ? JSON.stringify(oneTags.map(t => t.text)) : '卡片未找到');
      // 同值并列：当前赛季有实例则 DOM 断言（不加星、保持库内原序），无实例则标注跳过
      const tieItem = all.find(l => { const vs = Object.values(l.secondary_values || {}).map(Number); return vs.length >= 2 && vs.every(v => v === vs[0]); });
      if (tieItem) {
        const tieTags = await page.evaluate((it) => {
          const card = [...document.querySelectorAll('.dp-item')].find(c => {
            if (c.querySelector('.dp-item-name').textContent !== it.item_name) return false;
            const r = [...c.querySelectorAll('.dp-item-stats')].find(x => x.querySelector('.dp-tag-secondary'));
            return r && r.querySelectorAll('.dp-tag').length >= 2;
          });
          if (!card) return null;
          const r = [...card.querySelectorAll('.dp-item-stats')].find(x => x.querySelector('.dp-tag-secondary'));
          return [...r.querySelectorAll('.dp-tag')]
            .map(t => ({ text: t.textContent.trim(), star: t.classList.contains('dp-tag-star') }));
        }, tieItem);
        const expTieOrder = (tieItem.secondary_stats || []).map(s => `${s} +${tieItem.secondary_values[s]}`);
        assert(tieTags && tieTags.every(t => !t.star)
          && JSON.stringify(tieTags.map(t => t.text)) === JSON.stringify(expTieOrder),
          `WP3-6c 同值并列不加星、保持库内原序：「${tieItem.item_name}」`,
          tieTags ? JSON.stringify(tieTags) : '卡片未找到');
      } else {
        assert(true, 'WP3-6c 同值并列：当前赛季库内无同值实例（规则由代码路径覆盖：同值不加星、稳定排序保原序）');
      }
      // WP3-7 套装兑换物：来源行「实例 · BOSS · 可兑换本赛季套装」（确认点 C）+ R2 无主/副属性行不渲染（仅 名称/meta/来源 三行）
      await page.fill('#dpSearch', '珍玩');
      await sleep(400);
      const tierHit = await page.evaluate((name) => {
        const cards = [...document.querySelectorAll('.dp-item')];
        if (cards.length !== 1) return { count: cards.length, okName: false };
        const okName = cards[0].querySelector('.dp-item-name').textContent === name;
        cards[0].setAttribute('data-t4-tier', '1');
        return { count: 1, okName };
      }, tierItem.item_name);
      assert(tierHit.count === 1 && tierHit.okName,
        `WP3-7 搜索「珍玩」命中唯一卡 = ${tierItem.item_name}`, JSON.stringify(tierHit));
      if (tierHit.count === 1 && tierHit.okName) {
        const ct = await readCard('data-t4-tier');
        assert(ct.rowCount === 3 && ct.srcText && ct.srcText.includes(' · ') && ct.srcText.endsWith('可兑换本赛季套装')
          && !ct.primTags && !ct.secTags,
          'WP3-7 套装兑换物：仅 名称/meta/来源 三行（R2 无主副属性行不渲染），来源行含实例·BOSS·可兑换本赛季套装',
          JSON.stringify({ rows: ct.rowCount, src: ct.srcText }));
      }
      await page.fill('#dpSearch', '');
      await sleep(400);
      assert(await cardCount() === all.length, 'WP3-7 清空搜索还原全集');
      // WP3-8 缺数值卡（裁定 E）：属性 tag 只显属性名（无 +N、不加星）；跨赛季时先切赛季、断言后切回
      const raidsAll = await rest('/game_raids?select=id,name,season_id');
      const dunsAll = await rest('/game_dungeons?select=id,name,season_id');
      const bossAll = await rest('/game_bosses?select=id,name,raid_id,dungeon_id&limit=1000');
      const seasonOf = l => {
        if (l.dungeon_id) { const d = dunsAll.find(x => x.id === l.dungeon_id); return d ? d.season_id : null; }
        const b = bossAll.find(x => x.id === l.boss_id) || {};
        const r = b.raid_id ? raidsAll.find(x => x.id === b.raid_id) : null;
        const d = b.dungeon_id ? dunsAll.find(x => x.id === b.dungeon_id) : null;
        return r ? r.season_id : (d ? d.season_id : null);
      };
      const targetSeason = seasonOf(noValItem);
      const switched = targetSeason && targetSeason !== cur.id;
      if (switched) { await page.selectOption('#dpSeasonSelect', targetSeason); await sleep(800); }
      const nv = await page.evaluate((it) => {
        const card = [...document.querySelectorAll('.dp-item')].find(c =>
          c.querySelector('.dp-item-name').textContent === it.item_name);
        if (!card) return null;
        const statRows = [...card.querySelectorAll('.dp-item-stats')];
        const tags = statRows.flatMap(r => [...r.querySelectorAll('.dp-tag')].map(t => ({
          text: t.textContent.trim(), star: t.classList.contains('dp-tag-star') })));
        return { tags, src: (card.querySelector('.dp-item-src') || {}).textContent || '',
          rows: card.querySelector('.dp-item-inner').children.length }; // R2：只渲染有数据的行，行数=数据驱动（P1：行容器=.dp-item-inner）
      }, noValItem);
      const nvExpTags = [...(noValItem.primary_stats || []), ...(noValItem.secondary_stats || [])];
      const nvExpRows = 2 + ((noValItem.primary_stats || []).length ? 1 : 0) + ((noValItem.secondary_stats || []).length ? 1 : 0)
        + (noValItem.effect ? 1 : 0) + 1;
      assert(nv && nv.rows === nvExpRows && nv.tags.length === nvExpTags.length
        && nv.tags.every(t => !t.text.includes('+') && nvExpTags.includes(t.text) && !t.star),
        `WP3-8 缺数值卡「${noValItem.item_name}」：有数据行齐全（R2）、属性 tag 只显属性名（无 +N、不加星，裁定 E）`,
        nv ? JSON.stringify(nv.tags.map(t => t.text)) : '卡片未找到');
      if (switched) { await page.selectOption('#dpSeasonSelect', cur.id); await sleep(800); }
      // WP3-11（R1）星标边界盒：⭐SVG 10×10 完整落在卡片内（.dp-item-stats overflow 已放开，任何缩放不被裁切）
      const starBox = await page.evaluate(() => {
        const svg = document.querySelector('.dp-tag-star svg');
        if (!svg) return null;
        const s = svg.getBoundingClientRect(), c = svg.closest('.dp-item').getBoundingClientRect();
        return { dl: +(s.left - c.left).toFixed(1), dt: +(s.top - c.top).toFixed(1),
          dr: +(c.right - s.right).toFixed(1), db: +(c.bottom - s.bottom).toFixed(1), w: s.width, h: s.height };
      });
      assert(starBox && starBox.w === 10 && starBox.h === 10
        && starBox.dl > 0 && starBox.dt > 0 && starBox.dr > 0 && starBox.db > 0,
        'WP3-11 星标边界盒（R1）：⭐SVG 10×10 完整可见、不被卡片/行容器裁切', JSON.stringify(starBox));
      // WP3-12（R2 锚点卡）：无主属性→副属性行紧跟 meta 上移（永恒虚空之歌/圣光纽带）；
      // 无副属性→特效行紧跟主属性行（上古饥渴之心）；全页零空 stats 占位行
      const anchors = await page.evaluate(() => {
        const structOf = key => {
          const card = [...document.querySelectorAll('.dp-item')].find(c =>
            c.querySelector('.dp-item-name').textContent.includes(key));
          if (!card) return null;
          return [...card.querySelector('.dp-item-inner').children].map(e => e.className.split(' ')[0].replace('dp-item-', ''));
        };
        return {
          necklace: structOf('永恒虚空之歌'),
          bond: structOf('圣光纽带'),
          heart: structOf('上古饥渴之心') || structOf('上古饥渇之心'),
          emptyStats: document.querySelectorAll('.dp-item-stats:empty').length,
        };
      });
      const seqOk = (seq, a, b) => { const i = seq ? seq.indexOf(a) : -1; return i >= 0 && seq[i + 1] === b; };
      assert(anchors.necklace && seqOk(anchors.necklace, 'meta', 'stats')
        && anchors.bond && seqOk(anchors.bond, 'meta', 'stats'),
        'WP3-12 R2 锚点：无主属性卡（永恒虚空之歌/圣光纽带）副属性行紧跟 meta 上移', JSON.stringify(anchors));
      assert(anchors.heart && seqOk(anchors.heart, 'stats', 'effect-wrap'),
        'WP3-12b R2 锚点：无副属性卡（上古饥渴之心）特效行紧跟主属性行上提', JSON.stringify(anchors.heart));
      assert(anchors.emptyStats === 0, 'WP3-12c 全页零空属性占位行（R2 占位行废止）', `空行=${anchors.emptyStats}`);
      // WP3-13（R11）来源行锚底：全页卡片 来源行下缘 == 卡片内容盒下缘（±1px，margin-top:auto 吸收短卡空白）；
      // 锚点卡「分叉指环」（魔导师平台·吉美尔鲁斯）在页且来源行与上行间距 ≥6px（空白留在来源行之上、不上移）
      const srcAnchor = await page.evaluate(() => {
        const bad = [];
        let checked = 0;
        document.querySelectorAll('.dp-item').forEach(c => {
          const src = c.querySelector('.dp-item-src');
          if (!src) return;
          checked++;
          const inner = c.querySelector('.dp-item-inner'); // P1：卡盒=inner（margin-top:auto 锚底在 inner 内）
          const cb = inner.getBoundingClientRect(), sb = src.getBoundingClientRect();
          const padBottom = parseFloat(getComputedStyle(inner).paddingBottom);
          if (Math.abs((cb.bottom - padBottom) - sb.bottom) > 1)
            bad.push(c.querySelector('.dp-item-name').textContent);
        });
        const anchor = [...document.querySelectorAll('.dp-item')].find(c =>
          c.querySelector('.dp-item-name').textContent.includes('分叉指环'));
        let gap = null, srcIn = null;
        if (anchor) {
          const src = anchor.querySelector('.dp-item-src');
          gap = Math.round(src.getBoundingClientRect().top - src.previousElementSibling.getBoundingClientRect().bottom);
          srcIn = src.textContent;
        }
        return { bad, checked, anchorFound: !!anchor, gap, srcIn };
      });
      assert(srcAnchor.checked > 0 && srcAnchor.bad.length === 0,
        `WP3-13 R11 来源行锚底：全页 ${srcAnchor.checked} 张卡片来源行贴卡片底部（±1px）`,
        srcAnchor.bad.slice(0, 3).join(' | ') || '无漂移');
      assert(srcAnchor.anchorFound && srcAnchor.gap >= 6 && srcAnchor.srcIn.includes('魔导师平台'),
        'WP3-13b R11 锚点卡「分叉指环」：来源行（魔导师平台 · 吉美尔鲁斯）锚底不上移、与上行间距 ≥6px',
        JSON.stringify({ found: srcAnchor.anchorFound, gap: srcAnchor.gap, src: srcAnchor.srcIn }));
      // WP3-9 特效生长动画（P1，§6 白名单例外已注册 2026-08-09）：wrap max-height 200ms ease-out；reduced-motion 瞬时
      const animSpec = await page.evaluate(() => {
        const cs = getComputedStyle(document.querySelector('.dp-item-effect-wrap'));
        return { dur: cs.transitionDuration, prop: cs.transitionProperty, tf: cs.transitionTimingFunction };
      });
      assert(animSpec.dur.split(',').map(s => s.trim()).every(d => d === '0.2s')
        && animSpec.prop.split(',').map(s => s.trim()).includes('max-height') && animSpec.tf.includes('ease-out'),
        'WP3-9 整卡生长动画 200ms ease-out max-height（P1 §6 例外已注册 2026-08-09；浮层 opacity/transform 形态废止）', JSON.stringify(animSpec));
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const animRm = await page.evaluate(() => getComputedStyle(document.querySelector('.dp-item-effect-wrap')).transitionDuration);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      assert(animRm.split(',').map(s => s.trim()).every(d => d === '0s'),
        'WP3-9b reduced-motion 生长瞬时切换（transitionDuration=0s）', animRm);
      // WP3-10 hover 整卡生长网格零挤压（邻卡 rect 不变；生长部分 z-index 抬升覆盖下方卡片）——取首张溢出卡（has-effect）
      const nbBefore = await page.evaluate(() => {
        const card = document.querySelector('.dp-item.has-effect');
        if (!card) return null;
        card.setAttribute('data-t4-rich2', '1');
        card.scrollIntoView({ block: 'center' });
        const next = card.parentElement.querySelector('.dp-item:not([data-t4-rich2])');
        if (!next) return null;
        next.setAttribute('data-t4-nb2', '1');
        return next.getBoundingClientRect().toJSON();
      });
      await page.hover('[data-t4-rich2]');
      await sleep(400);
      const nbAfter = await page.evaluate(() => {
        const n = document.querySelector('[data-t4-nb2]');
        return n ? n.getBoundingClientRect().toJSON() : null;
      });
      await page.hover('.dp-footer');
      await sleep(300);
      assert(nbBefore && nbAfter && ['x', 'y', 'width', 'height'].every(k => nbBefore[k] === nbAfter[k]),
        'WP3-10 hover 整卡生长网格零挤压（邻卡位置/尺寸不变）');
    }

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
      catChipsHidden: document.getElementById('dpCatChips').hidden, // WP6：分类三级行随重置收起
      instHidden: document.getElementById('dpInstanceChips').hidden, // WP6：实例行随来源清空收起
    }));
    assert(reset.activeVals === 0 && reset.allChips === 2 && !reset.search && reset.catChipsHidden && reset.instHidden,
      '③§5 赛季切换全重置（值 chip 全清、分类/来源两枚「全部」回选、搜索清空、分类三级与实例行收起）', JSON.stringify(reset));
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
    assert(rows1920.kids === 5 && rows1920.rows === 5 && rows1920.toggleHidden && rows1920.groupLines.every(n => n === 1),
      '③§6 1920×1080 桌面档：toggle 隐藏、顶行+四组各一行（组内无折行；WP6 分类组为第一组，三级行未选 tab 时隐藏）', JSON.stringify(rows1920));
    await page2.evaluate(() => window.scrollTo(0, 0));
    await page2.screenshot({ path: path.join(SHOT_DIR, '1920-filterbar.png') });
    // 1920 hover 整卡生长一例 + 截图（P1：按 名字+预览 dataset.full 双重定位）
    const pre1920 = await page2.evaluate((it) => {
      const card = [...document.querySelectorAll('.dp-item.has-effect')].find(c => {
        const p = c.querySelector('.dp-item-effect-preview');
        return p && p.dataset.full === it.effect
          && c.querySelector('.dp-item-name').textContent === it.item_name;
      });
      if (!card) return false;
      card.setAttribute('data-t4-1920', '1');
      card.scrollIntoView({ block: 'center' });
      return true;
    }, picked[0]);
    let r1920 = null;
    if (pre1920) {
      await page2.hover('[data-t4-1920]');
      await sleep(450);
      r1920 = await page2.evaluate(() => {
        const card = document.querySelector('[data-t4-1920]');
        const inner = card.querySelector('.dp-item-inner');
        const preview = card.querySelector('.dp-item-effect-preview');
        const src = card.querySelector('.dp-item-src');
        const cs = getComputedStyle(inner);
        const innerR = inner.getBoundingClientRect(), srcR = src.getBoundingClientRect();
        return { pos: cs.position, z: cs.zIndex,
          grown: innerR.height > parseFloat(card.style.minHeight) + 10,
          srcFollows: Math.abs(srcR.bottom - (innerR.bottom - parseFloat(cs.paddingBottom))) < 1.5,
          textTop0: Math.abs(preview.getBoundingClientRect().top - card.querySelector('.dp-item-effect-wrap').getBoundingClientRect().top) <= 1,
          fullText: preview.textContent,
          noOverlay: !document.querySelector('.dp-item-effect-overlay') };
      });
    }
    assert(r1920 && r1920.pos === 'absolute' && r1920.z === '30' && r1920.grown && r1920.srcFollows
      && r1920.textTop0 && r1920.fullText === picked[0].effect && r1920.noOverlay,
      '①[1920] hover 整卡生长（P1+P1-补）：inner absolute 生长、来源行跟随新底部、特效全文框内逐字=数据源、文本零位移、零 overlay');
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
