// 任务书 #23 WP2：数据公示页（免登录公开，REQ-073）
// 任务书 #28 WP2：筛选条重构（筛选规范 v2.0）——首行搜索+重置、主/副属性多选、来源单选、
// 杂项数据层排除零渲染、「排除杂项」开关整块删除、卡片入场/筛选器展开收起动画（§7）。
// 任务书 #28 WP3-v2（方向修正版，运营 2026-08-08 裁定⑤撤回+补充裁定 G/H）：全信息装备卡——
// 卡片默认展示完整信息组（名称/meta/主属性+数值/副属性+数值/特效/来源 逐行排列），
// 主属性色板（§4.11）、副属性数值降序且唯一最大者⭐排第一（裁定 H；同值/缺值保持库内原序不加星）、
// 来源行「实例 · BOSS（· 可兑换本赛季套装）」；卡片零点击交互（v1 点击详情层已整族拆除）。
// 任务书 #28 WP3-v3（体验修订 R1–R7）：星标裁切修复（行容器 overflow 放开）；
// R2 占位行废止——只渲染有数据的行；R3 内容驱动行内等高（grid 原生 stretch，删全部固定/占位行高）；
// R4/R7 特效 hover 续文展开——未溢出卡无 … 无 hover 无展开层，溢出卡展开层只放被截续文（镜像实测切分、resize 重算）；
// R5 来源组 chip 间距复用 .dp-chip-sub；R6 来源单选联动折叠对应掉落池整段。
// boss_loot/dungeon_loot 读取收口公开 RPC（sql/21，杂项服务端排除；sql/22 增排装饰品/幻化），难度行继续不显（tiers 无数据）。
// 读取通道：anon key 直连 PostgREST（字典表匿名读 sql/16 + 公开 RPC sql/21），不登录、不走 server.js 写代理。
// 任何加载失败给友好重试界面，不白屏；全部内容只读。
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const main = $('dpMain');

  const state = {
    url: '', anon: '',
    seasons: [], raids: [], bosses: [], loot: [], tierSets: [],
    dungeons: [], dungeonLoot: [], classes: [], specs: [],
    seasonId: '', dungeonView: 'boss', // boss=按 BOSS（默认） / pool=整体池
    search: '',
    primaryStats: new Set(), secondaryStats: new Set(), // 主/副属性多标签筛选（AND，任务书 #23-补丁 修正项③）
    source: '', // 任务书 #28 WP2：来源单选（''=全部 / raid=团本 / dungeon=大秘境 / quest=副本任务 / profession=专业制造）
    tierClassId: '', tierRole: '', tierSpecId: '', // 套装三维筛选（修正项②）
  };

  // ---- 来源维度（筛选规范 v2.0 §4，运营 2026-08-08 裁定②：单选四值，值域赛季数据驱动） ----
  // 归组映射（不上界面）：团本=boss_loot（game_raids→赛季归属）；大秘境=dungeon_loot（game_dungeons→赛季链路）；
  // 副本任务/专业制造=预留值——当前数据模型无此来源，当季无数据时 chip 不渲染（不写死、不置灰占位）。
  const SOURCE_DEFS = [
    { key: 'raid', label: '团本' },
    { key: 'dungeon', label: '大秘境' },
    { key: 'quest', label: '副本任务' },
    { key: 'profession', label: '专业制造' },
  ];
  // 某来源当季是否有数据（无数据 → chip 不出现）
  function sourceHasData(key) {
    if (key === 'raid') {
      const raidIds = new Set(state.raids.filter(r => r.season_id === state.seasonId).map(r => r.id));
      const bossIds = new Set(state.bosses.filter(b => raidIds.has(b.raid_id)).map(b => b.id));
      return state.loot.some(l => bossIds.has(l.boss_id));
    }
    if (key === 'dungeon') {
      const dunIds = new Set(state.dungeons.filter(d => d.season_id === state.seasonId).map(d => d.id));
      return state.dungeonLoot.some(l => dunIds.has(l.instance_id)); // WP3：RPC 行以 instance_id 携带 dungeon_id
    }
    return false; // quest/profession：数据模型暂无此来源，恒不渲染
  }

  // 杂项判定唯一口径（任务书 #28 WP2：数据层排除零渲染，装载时过滤；「排除杂项」开关已整块删除）：slot 为「杂项」
  const isMisc = l => l.slot === '杂项';
  // 修正项④：装备 → 套装兑换物（独立分类）→ 杂项（永远最后）；同组内按部位/名称稳定排序
  function sortLoot(items) {
    const rank = l => isMisc(l) ? 3 : l.slot === '套装兑换物' ? 2 : 1;
    return [...items].sort((a, b) =>
      rank(a) - rank(b)
      || String(a.slot || '').localeCompare(String(b.slot || ''), 'zh')
      || String(a.item_name || '').localeCompare(String(b.item_name || ''), 'zh'));
  }

  // 折叠状态页内记忆（sessionStorage，不持久；三级折叠共用同一键集）
  const COLLAPSE_KEY = 'dp23:collapsed';
  function getCollapsed() {
    try { return new Set(JSON.parse(sessionStorage.getItem(COLLAPSE_KEY) || '[]')); } catch { return new Set(); }
  }
  function toggleCollapse(id) {
    const s = getCollapsed();
    if (s.has(id)) s.delete(id); else s.add(id);
    try { sessionStorage.setItem(COLLAPSE_KEY, JSON.stringify([...s])); } catch {}
    render();
  }

  // 修正项②（任务书 #23-补丁4）：三级折叠同规格控件——24×24 热区 + 2px 描边箭头（CSS 控制旋转）
  const CARET_BTN = '<span class="dp-collapse-btn" aria-hidden="true"><svg viewBox="0 0 12 12" width="12" height="12"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showError(msg) {
    main.innerHTML = `
      <div class="dp-error">
        <div class="dp-error-icon">⚠</div>
        <div class="dp-error-text">${esc(msg || '数据加载失败')}</div>
        <button class="btn btn-primary" onclick="location.reload()">重试</button>
      </div>`;
  }

  async function restGet(path) {
    const res = await fetch(`${state.url}/rest/v1${path}`, {
      headers: { apikey: state.anon, Authorization: `Bearer ${state.anon}` },
    });
    if (!res.ok) throw new Error(`读取失败（HTTP ${res.status}）`);
    return res.json();
  }

  // 任务书 #28 WP3：公开 RPC 通道（sql/21 get_public_loot_detail，anon 直连 PostgREST，不走 server.js 代理）
  async function restRpc(name) {
    const res = await fetch(`${state.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: state.anon, Authorization: `Bearer ${state.anon}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) throw new Error(`读取失败（HTTP ${res.status}）`);
    return res.json();
  }

  async function boot() {
    // 配置与登录页同源（/api/supabase-config 本为免登录端点）；失败给重试界面
    let cfg;
    try {
      const r = await fetch('/api/supabase-config');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      cfg = await r.json();
    } catch (e) {
      showError('无法获取服务配置，请检查网络后重试');
      return;
    }
    state.url = (cfg.url || cfg.supabaseUrl || '').replace(/\/+$/, '');
    state.anon = cfg.anonKey || cfg.supabaseAnonKey || '';
    if (!state.url || !state.anon) { showError('服务配置不完整'); return; }

    try {
      const [seasons, raids, bosses, lootAll, tierSets, dungeons, classes, specs] = await Promise.all([
        restGet('/game_seasons?select=*'),
        restGet('/game_raids?select=*'),
        restGet('/game_bosses?select=*'),
        restRpc('get_public_loot_detail'), // WP3：boss_loot/dungeon_loot 两表收口 RPC（合并+实例/BOSS 预联查+杂项服务端排除，裁定③）
        restGet('/tier_sets?select=*'),
        restGet('/game_dungeons?select=*'),
        restGet('/game_classes?select=*'),
        restGet('/game_specs?select=*'),
      ]);
      // 杂项防线（裁定③：RPC 服务端已排除，前端过滤仅作防线）；_src 取 RPC source 字段（来源单选判定依据）
      const lootRows = lootAll.filter(l => !isMisc(l));
      const loot = lootRows.filter(l => l.source === 'raid').map(l => ({ ...l, _src: 'raid' }));
      const dungeonLoot = lootRows.filter(l => l.source === 'dungeon').map(l => ({ ...l, _src: 'dungeon' }));
      Object.assign(state, { seasons, raids, bosses, loot, tierSets, dungeons, dungeonLoot, classes, specs });
    } catch (e) {
      showError(e.message || '数据加载失败');
      return;
    }

    // 赛季下拉：默认 is_current，无 is_current 取最新
    const seasons = [...state.seasons].sort((a, b) => String(a.start_date || '').localeCompare(String(b.start_date || '')));
    const current = seasons.find(s => s.is_current) || seasons[seasons.length - 1];
    state.seasonId = current ? current.id : '';
    $('dpSeasonSelect').innerHTML = seasons.map(s =>
      `<option value="${s.id}" ${s.id === state.seasonId ? 'selected' : ''}>${esc(s.name)}${s.is_current ? '（当前）' : ''}</option>`).join('');
    $('dpSeasonSelect').onchange = e => { state.seasonId = e.target.value; resetFilters(); renderSourceChips(); render(); };

    // 筛选条（结构 = 筛选规范 v2.0 §2 唯一合法布局：首行搜索+重置 → 主属性组 → 副属性组 → 来源组，区头标题层级）
    renderSourceChips();
    // REQ-084（任务书 #23-补丁6）：搜索框清除钮——有内容才显示、点击/Esc 清空还原全集、焦点留输入框
    const searchInput = $('dpSearch'), searchClear = $('dpSearchClear');
    const syncSearchClear = () => { searchClear.style.display = searchInput.value ? 'block' : 'none'; };
    const clearSearch = () => {
      searchInput.value = ''; state.search = ''; syncSearchClear(); searchInput.focus(); render(true);
    };
    searchInput.oninput = e => { state.search = e.target.value.trim().toLowerCase(); syncSearchClear(); render(true); };
    searchInput.onkeydown = e => { if (e.key === 'Escape' && searchInput.value) clearSearch(); };
    searchClear.onclick = clearSearch;
    // 重置筛选（任务书 #28 WP2：一键清空全部筛选 + 搜索词，还原默认全集）
    $('dpResetFilters').onclick = () => { resetFilters(); render(true); };
    // 移动端（≤768px）筛选条整体折叠为「筛选 ▾」按钮（筛选规范 v2.0 §6）；
    // 收起走 .closing 退出动画（0.2s ease-out，仅 opacity/transform），reduced-motion 直收
    $('dpFilterToggle').onclick = () => {
      const bar = $('dpFilterBar'), rows = $('dpFilterRows');
      const open = bar.classList.contains('filters-open');
      const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!open) { bar.classList.add('filters-open'); $('dpFilterToggle').textContent = '筛选 ▴'; return; }
      $('dpFilterToggle').textContent = '筛选 ▾';
      if (reduced) { bar.classList.remove('filters-open'); return; }
      if (rows.classList.contains('closing')) return; // 收起动画中防连点
      rows.classList.add('closing');
      setTimeout(() => { rows.classList.remove('closing'); bar.classList.remove('filters-open'); }, 200);
    };

    // 主/副属性多标签筛选（任务书 #23-补丁 修正项③：多标签 AND；
    // #23-补丁2 修正项③：筛选项为 WoW 封闭枚举固定全量——主：力量/敏捷/智力，副：爆击/急速/精通/全能，
    // 不再从已录入数据聚合；选中无匹配装备时显示空结果属正常；
    // 筛选规范 v2.0 §2 布局：主/副属性组无「全部」chip（未选中即不过滤））
    buildChips($('dpPrimaryChips'), ['力量', '敏捷', '智力'], state.primaryStats);
    buildChips($('dpSecondaryChips'), ['爆击', '急速', '精通', '全能'], state.secondaryStats);

    // R4（WP3-v3）：resize（含浏览器缩放）防抖重算特效截断切分点
    let fxResizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(fxResizeTimer);
      fxResizeTimer = setTimeout(() => measureEffectOverlays(), 150);
    });

    render();
  }

  // chip 行选中态同步（值 chip 按 stateSet、全部 chip 仅当集合为空）
  function syncChipRow(container, stateSet) {
    container.querySelectorAll('.dp-chip').forEach(ch => {
      if (ch.classList.contains('dp-chip-all')) ch.classList.toggle('active', stateSet.size === 0);
      else ch.classList.toggle('active', stateSet.has(ch.dataset.v));
    });
  }

  function buildChips(container, values, stateSet) {
    if (!container) return;
    container.innerHTML = `<span class="dp-chip-sub">` +
      values.map(v => `<span class="dp-chip" data-v="${esc(v)}">${esc(v)}</span>`).join('') + `</span>`;
    container.querySelectorAll('.dp-chip').forEach(ch => {
      ch.onclick = () => {
        const v = ch.dataset.v;
        if (stateSet.has(v)) stateSet.delete(v); else stateSet.add(v);
        syncChipRow(container, stateSet);
        render(true);
      };
    });
  }

  // 来源单选 chips（筛选规范 v2.0 §4）：「全部」+ 当季有数据的来源值；
  // 单选互斥——点已选中的值 chip 回「全部」；state.source 不在当季值域时回落 ''（赛季切换场景）
  function renderSourceChips() {
    const container = $('dpSourceChips');
    if (!container) return;
    const avail = SOURCE_DEFS.filter(d => sourceHasData(d.key));
    if (state.source && !avail.some(d => d.key === state.source)) state.source = '';
    // R5（WP3-v3）：值 chip 包 .dp-chip-sub——与主/副属性组完全同一 gap（6px）
    container.innerHTML =
      `<span class="dp-chip dp-chip-all${state.source === '' ? ' active' : ''}" data-v="">全部</span>` +
      (avail.length ? `<span class="dp-chip-divider"></span><span class="dp-chip-sub">` +
        avail.map(d =>
          `<span class="dp-chip${state.source === d.key ? ' active' : ''}" data-v="${esc(d.key)}">${esc(d.label)}</span>`).join('') +
        `</span>` : '');
    container.querySelectorAll('.dp-chip').forEach(ch => {
      ch.onclick = () => {
        const v = ch.dataset.v;
        state.source = (v && state.source !== v) ? v : '';
        renderSourceChips();
        render(true);
      };
    });
  }

  // 全部筛选重置为默认（赛季切换 / 「重置筛选」按钮共用；筛选规范 v2.0 §5：每组回「全部」、来源回「全部」、搜索清空）
  function resetFilters() {
    state.search = '';
    state.primaryStats.clear(); state.secondaryStats.clear();
    state.source = '';
    state.tierClassId = ''; state.tierRole = ''; state.tierSpecId = '';
    $('dpSearch').value = ''; $('dpSearchClear').style.display = 'none';
    syncChipRow($('dpPrimaryChips'), state.primaryStats);
    syncChipRow($('dpSecondaryChips'), state.secondaryStats);
    renderSourceChips();
  }

  const hasLootFilter = () => !!(state.search || state.primaryStats.size || state.secondaryStats.size || state.source);

  // ---- 筛选（搜索 AND；主/副属性标签 AND；来源单选等值） ----
  function matchItem(l) {
    if (state.source && l._src !== state.source) return false; // quest/profession 无行带此 _src，选中即空结果（当前值域不含这两值）
    if (state.search && !String(l.item_name || '').toLowerCase().includes(state.search)) return false;
    // 主/副属性：多标签 AND（选中标签必须全部出现在该装备对应数组中）
    if (state.primaryStats.size && ![...state.primaryStats].every(s => (l.primary_stats || []).includes(s))) return false;
    if (state.secondaryStats.size && ![...state.secondaryStats].every(s => (l.secondary_stats || []).includes(s))) return false;
    return true;
  }

  // ---- 装备卡片（任务书 #28 WP3-v3 体验修订 R1–R7） ----
  // 行序固定：名称 / meta / 主属性(如有) / 副属性(如有) / 特效(如有) / 来源——只渲染有数据的行（R2 占位行废止），
  // 卡片高度内容驱动、同一 grid 行内原生 stretch 等高、行间允许不同高（R3，零 JS 测高）。
  // 主属性：库内原序，§4.11 色板；缺数值只显属性名（裁定 E 不变）。
  // 副属性（裁定 H 不变）：数值降序，唯一最大者⭐排第一；同值并列/缺数值保原序不加星。
  // 特效（R4/R7）：空间够用（≤2 行）整行直显——无 …、无 hover、无展开层；
  // 溢出卡 hover 只展开被 … 截掉的续文（渲染后 measureEffectOverlays 镜像实测切分，前缀+续文===全文，resize 重算）。
  // 卡片零点击交互（运营 2026-08-08 方向修正）。
  // 主属性色板类映射（§4.11；未收录属性名回退 dp-tag-primary 蓝）
  const PRIMARY_TAG_CLASS = { '力量': 'dp-tag-p1', '敏捷': 'dp-tag-p2', '智力': 'dp-tag-p3' };
  // 金星变体 SVG（§4.2 已注册：右上角金色五角星，自绘；R1：行容器 overflow 放开后任何缩放完整可见）
  const STAR_SVG = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 0l1.4 3.1L10 3.6 7.3 6l.8 3.4L5 7.6 1.9 9.4 2.7 6 0 3.6l3.6-.5z" fill="#ffd700"/></svg>';
  function itemCard(l) {
    const pv = l.primary_values || {};
    const sv = l.secondary_values || {};
    // 主属性行（有才渲染）：库内原序 + 色板；缺数值只显属性名（裁定 E）
    const primHtml = (l.primary_stats || []).map(s => {
      const v = pv[s];
      return `<span class="dp-tag ${PRIMARY_TAG_CLASS[s] || 'dp-tag-primary'}">${esc(s)}${v != null ? ` +${esc(v)}` : ''}</span>`;
    }).join('');
    // 副属性行（有才渲染；裁定 H）：数值降序稳定排序（同值/缺值保持库内原序，缺值沉底）；
    // 唯一最大者加⭐（≥2 个有值才参评），同值并列第一不加星
    const secEntries = (l.secondary_stats || []).map(s => {
      const raw = sv[s];
      const num = raw != null ? Number(raw) : NaN;
      return { name: s, value: Number.isNaN(num) ? null : num, raw };
    });
    const withVal = secEntries.filter(e => e.value != null);
    const maxV = withVal.length ? Math.max(...withVal.map(e => e.value)) : null;
    const starName = (maxV != null && withVal.length >= 2 && withVal.filter(e => e.value === maxV).length === 1)
      ? withVal.find(e => e.value === maxV).name : '';
    const secSorted = [...secEntries].sort((a, b) =>
      (a.value == null) - (b.value == null) || (b.value - a.value));
    const secHtml = secSorted.map(e => {
      const star = e.name === starName;
      return `<span class="dp-tag dp-tag-secondary${star ? ' dp-tag-star' : ''}">${esc(e.name)}${e.value != null ? ` +${esc(e.raw)}` : ''}${star ? STAR_SVG : ''}</span>`;
    }).join('');
    // 来源行：实例 · BOSS（空=整体池）· 套装归属并入同行末尾（确认点 C）
    const srcParts = [l.instance_name, l.boss_name || '整体池'];
    if (l.slot === '套装兑换物') srcParts.push('可兑换本赛季套装');
    return `<div class="dp-item">
      <div class="dp-item-name">${esc(l.item_name)}</div>
      <div class="dp-item-meta">
        ${l.slot ? `<span class="dp-tag">${esc(l.slot)}</span>` : ''}
        ${l.item_type ? `<span class="dp-tag">${esc(l.item_type)}</span>` : ''}
      </div>
      ${primHtml ? `<div class="dp-item-stats">${primHtml}</div>` : ''}
      ${secHtml ? `<div class="dp-item-stats">${secHtml}</div>` : ''}
      ${l.effect ? `<div class="dp-item-effect-wrap"><div class="dp-item-effect-preview">${esc(l.effect)}</div></div>` : ''}
      <div class="dp-item-src">${esc(srcParts.filter(Boolean).join(' · '))}</div>
    </div>`;
  }

  // R4/R7 特效行实测切分（渲染后 + resize 重算）：
  // 隐藏镜像同宽同字体测 2 行可容纳字符数；未溢出 = 无 … 无 hover 无展开层（R7）；
  // 溢出 = 预览「前缀+…」、展开层只放续文（前缀+续文 === 全文，逐字接续，视觉接在截断处之后）
  let fxMirror = null;
  function measureEffectOverlays() {
    const wraps = main.querySelectorAll('.dp-item-effect-wrap');
    if (!wraps.length) return;
    if (!fxMirror) {
      fxMirror = document.createElement('div');
      fxMirror.setAttribute('aria-hidden', 'true');
      document.body.appendChild(fxMirror);
    }
    const m = fxMirror;
    wraps.forEach(wrap => {
      const card = wrap.closest('.dp-item');
      const preview = wrap.querySelector('.dp-item-effect-preview');
      const full = preview.dataset.full || preview.textContent;
      preview.dataset.full = full;
      const cs = getComputedStyle(preview);
      m.style.cssText = 'position:absolute;visibility:hidden;left:-99999px;top:0;white-space:normal;'
        + `width:${preview.clientWidth}px;font-size:${cs.fontSize};font-family:${cs.fontFamily};font-weight:${cs.fontWeight};`
        + `line-height:${cs.lineHeight};letter-spacing:${cs.letterSpacing};word-break:${cs.wordBreak};overflow-wrap:${cs.overflowWrap};`;
      const maxH = parseFloat(cs.lineHeight) * 2 + 0.5;
      m.textContent = full;
      const overflow = m.offsetHeight > maxH;
      let overlay = wrap.querySelector('.dp-item-effect-overlay');
      if (!overflow) { // R7：未溢出——整行直显，无 … 无 hover 无展开层
        if (preview.textContent !== full) preview.textContent = full;
        card.classList.remove('has-effect');
        if (overlay) overlay.remove();
        return;
      }
      // 二分：连 … 一起恰好装满 2 行的最长前缀
      let lo = 0, hi = full.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        m.textContent = full.slice(0, mid) + '…';
        if (m.offsetHeight <= maxH) lo = mid; else hi = mid - 1;
      }
      m.textContent = '';
      preview.textContent = full.slice(0, lo) + '…';
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'dp-item-effect-overlay';
        wrap.appendChild(overlay);
      }
      overlay.textContent = full.slice(lo);
      card.classList.add('has-effect');
    });
  }

  const emptyText = t => `<div class="dp-empty">${esc(t)}</div>`;

  // ---- 团本掉落池 ----
  // 折叠三级（任务书 #23-补丁4 修正项②）：区块（render()）→ 副本（本函数）→ BOSS（bossBlockHtml），
  // 各自独立、默认全展开、sessionStorage 记忆全覆盖；副本级折叠头 = 副本名 + 徽标 + 件数徽标 + 折叠控件
  function bossBlockHtml(collapseId, title, items) {
    const collapsed = getCollapsed().has(collapseId);
    return `<div class="dp-boss${collapsed ? ' collapsed' : ''}">
      <div class="dp-boss-name" data-collapse="${esc(collapseId)}">${CARET_BTN}${title}<span class="dp-count">${items.length}</span></div>
      <div class="dp-items">${sortLoot(items).map(itemCard).join('')}</div>
    </div>`;
  }

  function renderRaids() {
    const raids = state.raids.filter(r => r.season_id === state.seasonId)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    if (!raids.length) return emptyText('该赛季团本数据维护中');
    return raids.map(raid => {
      const bosses = state.bosses.filter(b => b.raid_id === raid.id).sort((a, b) => (a.boss_order || 0) - (b.boss_order || 0));
      let raidCount = 0;
      const bossHtml = bosses.map(boss => {
        const items = state.loot.filter(l => l.boss_id === boss.id && matchItem(l));
        if (!items.length) return '';
        raidCount += items.length;
        return bossBlockHtml('boss:' + boss.id, `${boss.boss_order}号 · ${esc(boss.name)}`, items);
      }).join('');
      if (!bossHtml) return '';
      const rid = 'raid:' + raid.id;
      const collapsed = getCollapsed().has(rid);
      return `<div class="dp-raid${collapsed ? ' collapsed' : ''}">
        <div class="dp-raid-name" data-collapse="${esc(rid)}">${CARET_BTN}${esc(raid.name)}${raid.type === 'lair' ? '<span class="dp-badge dp-badge-lair">巢穴</span>' : ''}<span class="dp-count">${raidCount}</span></div>
        <div class="dp-raid-body">${bossHtml}</div>
      </div>`;
    }).join('') || emptyText(hasLootFilter() ? '没有符合筛选条件的团本装备' : '该赛季团本数据维护中');
  }

  // ---- 大秘境掉落池（区块头在 render()，此处仅内容体；副本级折叠两种视图均生效） ----
  function renderDungeons() {
    const dungeons = state.dungeons.filter(d => d.season_id === state.seasonId)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    if (!dungeons.length) return emptyText('该赛季大秘境数据维护中');

    const body = dungeons.map(d => {
      const all = state.dungeonLoot.filter(l => l.instance_id === d.id && matchItem(l)); // WP3：RPC 行 instance_id = dungeon_id
      if (!all.length) return '';
      const did = 'dungeon:' + d.id;
      const collapsed = getCollapsed().has(did);
      const head = `<div class="dp-raid-name" data-collapse="${esc(did)}">${CARET_BTN}${esc(d.name)}${d.is_new ? '<span class="dp-badge dp-badge-new">新本</span>' : ''}<span class="dp-count">${all.length}</span></div>`;
      let inner;
      if (state.dungeonView === 'pool') {
        inner = `<div class="dp-items">${sortLoot(all).map(itemCard).join('')}</div>`;
      } else {
        // 按 BOSS：BOSS 分组 + 未归属条目归「整体池」组
        const bosses = state.bosses.filter(b => b.dungeon_id === d.id).sort((a, b) => (a.boss_order || 0) - (b.boss_order || 0));
        const groups = bosses.map(boss => {
          const items = all.filter(l => l.boss_id === boss.id);
          if (!items.length) return '';
          return bossBlockHtml('boss:' + boss.id, `${boss.boss_order}号 · ${esc(boss.name)}`, items);
        });
        const poolItems = all.filter(l => !l.boss_id);
        if (poolItems.length) {
          groups.push(bossBlockHtml('pool:' + d.id, '整体池', poolItems));
        }
        inner = groups.join('');
      }
      return `<div class="dp-raid${collapsed ? ' collapsed' : ''}">${head}<div class="dp-raid-body">${inner}</div></div>`;
    }).join('') || emptyText(hasLootFilter() ? '没有符合筛选条件的大秘境装备' : '该赛季大秘境数据维护中');

    return body;
  }

  // ---- 套装一览（赛季 × 职业 × 专精，职业色点缀） ----
  // 修正项①：先按职业（game_classes.class_key）再按专精（game_specs.spec_key）排序，同职业连续
  // 修正项②：职业 / 职责（由专精推导）/ 专精 三维筛选
  const ROLE_LABELS = { TANK: '坦克', HEALER: '治疗', DAMAGE: '输出' };
  function renderTierSets() {
    const classRank = new Map([...state.classes].sort((a, b) => (a.class_key || 0) - (b.class_key || 0)).map((c, i) => [c.id, i]));
    const specRank = new Map(state.specs.map(s => [s.id, s.spec_key != null ? s.spec_key : 999]));
    let sets = state.tierSets.filter(t => t.season_id === state.seasonId);
    if (state.tierClassId) sets = sets.filter(t => t.class_id === state.tierClassId);
    if (state.tierSpecId) sets = sets.filter(t => t.spec_id === state.tierSpecId);
    if (state.tierRole) sets = sets.filter(t => {
      const sp = state.specs.find(s => s.id === t.spec_id);
      return sp && sp.role === state.tierRole;
    });
    sets = [...sets].sort((a, b) => {
      const ca = classRank.has(a.class_id) ? classRank.get(a.class_id) : 999;
      const cb = classRank.has(b.class_id) ? classRank.get(b.class_id) : 999;
      if (ca !== cb) return ca - cb;
      const sa = specRank.has(a.spec_id) ? specRank.get(a.spec_id) : 999;
      const sb = specRank.has(b.spec_id) ? specRank.get(b.spec_id) : 999;
      return sa - sb;
    });
    const tierFiltered = !!(state.tierClassId || state.tierRole || state.tierSpecId);
    if (!sets.length) return emptyText(tierFiltered ? '没有符合筛选条件的套装' : '该赛季套装数据维护中');
    const classOf = t => state.classes.find(c => c.id === t.class_id) || {};
    const rows = sets.map(t => {
      const cls = classOf(t);
      const spec = state.specs.find(s => s.id === t.spec_id);
      const color = (window.IconMap && IconMap.classColor(cls.name_zh)) || cls.color || '#8b949e';
      const icon = (window.IconMap && IconMap.classIcon(cls.name_zh)) || cls.icon || '';
      return `<div class="dp-tier" style="--cc:${esc(color)}">
        <div class="dp-tier-head">
          ${icon ? `<img class="dp-tier-icon" src="${esc(icon)}" alt="" onerror="this.style.display='none'">` : ''}
          <span class="dp-tier-class">${esc(cls.name_zh || '')}${spec ? ' · ' + esc(spec.name_zh) : ''}</span>
          <span class="dp-tier-name">${esc(t.set_name)}</span>
        </div>
        ${t.bonus_2 ? `<div class="dp-tier-bonus"><span class="dp-tag">2 件</span><span class="dp-tier-bonus-text">${esc(t.bonus_2)}</span></div>` : ''}
        ${t.bonus_4 ? `<div class="dp-tier-bonus"><span class="dp-tag">4 件</span><span class="dp-tier-bonus-text">${esc(t.bonus_4)}</span></div>` : ''}
      </div>`;
    }).join('');
    return rows || emptyText(tierFiltered ? '没有符合筛选条件的套装' : '该赛季套装数据维护中');
  }

  // 套装三维筛选条（渲染后重绑；专精选项随职业联动）
  function bindTierFilters() {
    const clsSel = $('dpTierClass'), roleSel = $('dpTierRole'), specSel = $('dpTierSpec');
    if (!clsSel) return;
    const clsSorted = [...state.classes].sort((a, b) => (a.class_key || 0) - (b.class_key || 0));
    clsSel.innerHTML = '<option value="">全部职业</option>' + clsSorted.map(c => `<option value="${c.id}">${esc(c.name_zh)}</option>`).join('');
    clsSel.value = state.tierClassId;
    const specPool = state.tierClassId ? state.specs.filter(s => s.class_id === state.tierClassId) : state.specs;
    if (state.tierSpecId && !specPool.some(s => s.id === state.tierSpecId)) state.tierSpecId = '';
    const specSorted = [...specPool].sort((a, b) => (a.spec_key || 0) - (b.spec_key || 0));
    specSel.innerHTML = '<option value="">全部专精</option>' + specSorted.map(s => `<option value="${s.id}">${esc(s.name_zh)}</option>`).join('');
    specSel.value = state.tierSpecId;
    roleSel.innerHTML = '<option value="">全部职责</option>' + Object.entries(ROLE_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    roleSel.value = state.tierRole;
    clsSel.onchange = e => { state.tierClassId = e.target.value; render(); };
    roleSel.onchange = e => { state.tierRole = e.target.value; render(); };
    specSel.onchange = e => { state.tierSpecId = e.target.value; render(); };
  }

  function render(enterAnim) {
    // 一级区块级折叠（团本/大秘境两大区块，默认展开，sessionStorage 记忆）
    const collapsed = getCollapsed();
    // R6（WP3-v3）：来源单选联动折叠——选「团本」大秘境区块整段不渲染（含分组标题）；
    // 选「大秘境」团本区块整段不渲染；「全部」均展开；与搜索/属性筛选叠加逻辑不变
    const showRaids = state.source !== 'dungeon';
    const showDungeons = state.source !== 'raid';
    const secHead = (id, title, extra) => `<div class="dp-section-head dp-section-collapser${collapsed.has(id) ? ' collapsed' : ''}" data-collapse="${id}">
      <div class="dp-section-title">${CARET_BTN}${title}</div>${extra || ''}</div>`;
    const raidsBody = collapsed.has('sec:raids') ? '' : renderRaids();
    const mplusToggle = `<div class="dp-view-toggle">
        <button class="dp-toggle${state.dungeonView === 'boss' ? ' active' : ''}" data-view="boss">按 BOSS</button>
        <button class="dp-toggle${state.dungeonView === 'pool' ? ' active' : ''}" data-view="pool">整体池</button>
      </div>`;
    const mplusBody = collapsed.has('sec:dungeons') ? '' : renderDungeons();
    // REQ-085（任务书 #23-补丁6）：套装一览升级同构折叠头（sec:tiers，区块级，记忆同补丁4 口径）；
    // 三维筛选留在头内常驻，折叠时筛选状态保留、展开结果不变
    const tiersBody = collapsed.has('sec:tiers') ? '' : `<div class="dp-tiers">${renderTierSets()}</div>`;
    const tierFiltersHtml = `<div class="dp-tier-filters">
            <select id="dpTierClass" class="form-select"></select>
            <select id="dpTierRole" class="form-select"></select>
            <select id="dpTierSpec" class="form-select"></select>
          </div>`;
    main.innerHTML = `
      ${showRaids ? `<section class="dp-section">
        ${secHead('sec:raids', '团本掉落池')}
        ${raidsBody}
      </section>` : ''}
      ${showDungeons ? `<section class="dp-section">
        ${secHead('sec:dungeons', '大秘境掉落池', mplusToggle)}
        ${mplusBody}
      </section>` : ''}
      <section class="dp-section">
        ${secHead('sec:tiers', '套装一览', tierFiltersHtml)}
        ${tiersBody}
      </section>`;
    // 大秘境视图切换（事件委托，渲染后重绑）
    main.querySelectorAll('.dp-toggle').forEach(btn => {
      btn.onclick = () => { state.dungeonView = btn.dataset.view; render(); };
    });
    // 折叠（区块/副本/BOSS 三级，事件委托；视图切换按钮与套装三维筛选下拉不触发折叠）
    main.querySelectorAll('[data-collapse]').forEach(el => {
      el.onclick = ev => { if (ev.target.closest('.dp-toggle') || ev.target.closest('.dp-tier-filters')) return; toggleCollapse(el.dataset.collapse); };
    });
    bindTierFilters();
    // R4/R7（WP3-v3）：特效行实测切分——未溢出卡无 … 无 hover 无展开层；溢出卡预览截断+展开层续文
    measureEffectOverlays();
    // 任务书 #28 WP2（筛选规范 v2.0 §7）：筛选动作触发的重渲染给卡片入场 fade（0.2s ease-out，
    // 仅 opacity/transform，reduced-motion 由 CSS 降级）；视图切换/折叠/套装筛选走默认 render() 无入场动画
    if (enterAnim) main.querySelectorAll('.dp-item').forEach(c => c.classList.add('dp-enter'));
  }

  boot();
})();
