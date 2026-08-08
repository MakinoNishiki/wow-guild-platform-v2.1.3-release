// 任务书 #23 WP2：数据公示页（免登录公开，REQ-073）
// 任务书 #28 WP2：筛选条重构（筛选规范 v2.0）——首行搜索+重置、主/副属性多选、来源单选、
// 杂项数据层排除零渲染、「排除杂项」开关整块删除、卡片入场/筛选器展开收起动画（§7）。
// 读取通道：anon key 直连 PostgREST（字典表匿名读，sql/16），不登录、不走 server.js 写代理。
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
      return state.dungeonLoot.some(l => dunIds.has(l.dungeon_id));
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
      const [seasons, raids, bosses, loot, tierSets, dungeons, dungeonLoot, classes, specs] = await Promise.all([
        restGet('/game_seasons?select=*'),
        restGet('/game_raids?select=*'),
        restGet('/game_bosses?select=*'),
        restGet('/boss_loot?select=*'),
        restGet('/tier_sets?select=*'),
        restGet('/game_dungeons?select=*'),
        restGet('/dungeon_loot?select=*'),
        restGet('/game_classes?select=*'),
        restGet('/game_specs?select=*'),
      ]);
      Object.assign(state, { seasons, raids, bosses, loot, tierSets, dungeons, dungeonLoot, classes, specs });
      // 任务书 #28 WP2：杂项数据层排除（slot=杂项 全表过滤，页面零渲染、筛选零入口）；
      // _src 行标记 = 来源单选判定依据（boss_loot→raid / dungeon_loot→dungeon）
      state.loot = state.loot.filter(l => !isMisc(l)).map(l => ({ ...l, _src: 'raid' }));
      state.dungeonLoot = state.dungeonLoot.filter(l => !isMisc(l)).map(l => ({ ...l, _src: 'dungeon' }));
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
    container.innerHTML =
      `<span class="dp-chip dp-chip-all${state.source === '' ? ' active' : ''}" data-v="">全部</span>` +
      (avail.length ? `<span class="dp-chip-divider"></span>` : '') +
      avail.map(d =>
        `<span class="dp-chip${state.source === d.key ? ' active' : ''}" data-v="${esc(d.key)}">${esc(d.label)}</span>`).join('');
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

  // ---- 装备卡片（REQ-054 体系：部位/类型/特效游戏绿/主副属性标签） ----
  // 修正项③（任务书 #23-补丁3）：全部卡片默认统一尺寸——特效预览恒占一行（无特效为空行）；
  // 有特效卡边框高亮引导，悬浮（移动端点击 .expanded）平滑展开覆盖层，不挤压网格。
  // 修正项①（任务书 #23-补丁4）：展开即全文替换——预览行与覆盖层渲染同一份文本，
  // 折叠态 CSS 截断（单行省略号）、展开态覆盖层上移覆盖预览行显示完整全文，状态类切换，不做任何拼接。
  function itemCard(l) {
    const hasEffect = !!l.effect;
    return `<div class="dp-item${hasEffect ? ' has-effect' : ''}">
      <div class="dp-item-name">${esc(l.item_name)}</div>
      <div class="dp-item-meta">
        ${l.slot ? `<span class="dp-tag">${esc(l.slot)}</span>` : ''}
        ${l.item_type ? `<span class="dp-tag">${esc(l.item_type)}</span>` : ''}
        ${(l.primary_stats || []).map(s => `<span class="dp-tag dp-tag-primary">${esc(s)}</span>`).join('')}
        ${(l.secondary_stats || []).map(s => `<span class="dp-tag dp-tag-secondary">${esc(s)}</span>`).join('')}
      </div>
      <div class="dp-item-effect-preview">${hasEffect ? esc(l.effect) : ''}</div>
      ${hasEffect ? `<div class="dp-item-effect-overlay">${esc(l.effect)}</div>` : ''}
      ${l.note ? `<div class="dp-item-note">${esc(l.note)}</div>` : ''}
    </div>`;
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
      const all = state.dungeonLoot.filter(l => l.dungeon_id === d.id && matchItem(l));
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
      <section class="dp-section">
        ${secHead('sec:raids', '团本掉落池')}
        ${raidsBody}
      </section>
      <section class="dp-section">
        ${secHead('sec:dungeons', '大秘境掉落池', mplusToggle)}
        ${mplusBody}
      </section>
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
    // 修正项③：移动端/触屏点击特效卡展开收起（桌面悬浮由 CSS :hover 覆盖）
    main.querySelectorAll('.dp-item.has-effect').forEach(card => {
      card.onclick = () => card.classList.toggle('expanded');
    });
    bindTierFilters();
    // 任务书 #28 WP2（筛选规范 v2.0 §7）：筛选动作触发的重渲染给卡片入场 fade（0.2s ease-out，
    // 仅 opacity/transform，reduced-motion 由 CSS 降级）；视图切换/折叠/套装筛选走默认 render() 无入场动画
    if (enterAnim) main.querySelectorAll('.dp-item').forEach(c => c.classList.add('dp-enter'));
  }

  boot();
})();
