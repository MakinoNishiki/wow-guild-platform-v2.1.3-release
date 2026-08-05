// 任务书 #23 WP2：数据公示页（免登录公开，REQ-073）
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
    search: '', slot: '', type: '',
    primaryStats: new Set(), secondaryStats: new Set(), // 主/副属性多标签筛选（AND，任务书 #23-补丁 修正项③）
    tierClassId: '', tierRole: '', tierSpecId: '', // 套装三维筛选（修正项②）
  };

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
    $('dpSeasonSelect').onchange = e => { state.seasonId = e.target.value; resetFilters(); render(); };

    // 部位/类型筛选选项（从全部掉落数据收集）
    const slots = new Set(), types = new Set();
    [...state.loot, ...state.dungeonLoot].forEach(l => { if (l.slot) slots.add(l.slot); if (l.item_type) types.add(l.item_type); });
    $('dpSlotFilter').innerHTML = '<option value="">全部部位</option>' + [...slots].map(s => `<option>${esc(s)}</option>`).join('');
    $('dpTypeFilter').innerHTML = '<option value="">全部类型</option>' + [...types].map(t => `<option>${esc(t)}</option>`).join('');
    $('dpSlotFilter').onchange = e => { state.slot = e.target.value; render(); };
    $('dpTypeFilter').onchange = e => { state.type = e.target.value; render(); };
    $('dpSearch').oninput = e => { state.search = e.target.value.trim().toLowerCase(); render(); };

    // 主/副属性多标签筛选（任务书 #23-补丁 修正项③：多标签 AND；
    // #23-补丁2 修正项③：筛选项为 WoW 封闭枚举固定全量——主：力量/敏捷/智力，副：暴击/急速/精通/全能，
    // 不再从已录入数据聚合；选中无匹配装备时显示空结果属正常）
    buildChips($('dpPrimaryChips'), ['力量', '敏捷', '智力'], state.primaryStats);
    buildChips($('dpSecondaryChips'), ['暴击', '急速', '精通', '全能'], state.secondaryStats);

    render();
  }

  function buildChips(container, values, stateSet) {
    if (!container) return;
    container.innerHTML = values.map(v => `<span class="dp-chip" data-v="${esc(v)}">${esc(v)}</span>`).join('');
    container.querySelectorAll('.dp-chip').forEach(ch => {
      ch.onclick = () => {
        const v = ch.dataset.v;
        if (stateSet.has(v)) { stateSet.delete(v); ch.classList.remove('active'); }
        else { stateSet.add(v); ch.classList.add('active'); }
        render();
      };
    });
  }

  // 赛季切换后全部筛选重置为默认（修正项③）
  function resetFilters() {
    state.search = ''; state.slot = ''; state.type = '';
    state.primaryStats.clear(); state.secondaryStats.clear();
    state.tierClassId = ''; state.tierRole = ''; state.tierSpecId = '';
    $('dpSearch').value = ''; $('dpSlotFilter').value = ''; $('dpTypeFilter').value = '';
    document.querySelectorAll('.dp-filterbar .dp-chip.active').forEach(c => c.classList.remove('active'));
  }

  const hasLootFilter = () => !!(state.search || state.slot || state.type || state.primaryStats.size || state.secondaryStats.size);

  // ---- 筛选 ----
  function matchItem(l) {
    if (state.slot && l.slot !== state.slot) return false;
    if (state.type && l.item_type !== state.type) return false;
    if (state.search && !String(l.item_name || '').toLowerCase().includes(state.search)) return false;
    // 主/副属性：多标签 AND（选中标签必须全部出现在该装备对应数组中）
    if (state.primaryStats.size && ![...state.primaryStats].every(s => (l.primary_stats || []).includes(s))) return false;
    if (state.secondaryStats.size && ![...state.secondaryStats].every(s => (l.secondary_stats || []).includes(s))) return false;
    return true;
  }

  // ---- 装备卡片（REQ-054 体系：部位/类型/特效游戏绿/主副属性标签） ----
  function itemCard(l) {
    return `<div class="dp-item">
      <div class="dp-item-name">${esc(l.item_name)}</div>
      <div class="dp-item-meta">
        ${l.slot ? `<span class="dp-tag">${esc(l.slot)}</span>` : ''}
        ${l.item_type ? `<span class="dp-tag">${esc(l.item_type)}</span>` : ''}
        ${(l.primary_stats || []).map(s => `<span class="dp-tag dp-tag-primary">${esc(s)}</span>`).join('')}
        ${(l.secondary_stats || []).map(s => `<span class="dp-tag dp-tag-secondary">${esc(s)}</span>`).join('')}
      </div>
      ${l.effect ? `<div class="dp-item-effect">${esc(l.effect)}</div>` : ''}
      ${l.note ? `<div class="dp-item-note">${esc(l.note)}</div>` : ''}
    </div>`;
  }
  const emptyText = t => `<div class="dp-empty">${esc(t)}</div>`;

  // ---- 团本掉落池 ----
  function renderRaids() {
    const raids = state.raids.filter(r => r.season_id === state.seasonId)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    if (!raids.length) return emptyText('该赛季团本数据维护中');
    return raids.map(raid => {
      const bosses = state.bosses.filter(b => b.raid_id === raid.id).sort((a, b) => (a.boss_order || 0) - (b.boss_order || 0));
      const bossHtml = bosses.map(boss => {
        const items = state.loot.filter(l => l.boss_id === boss.id && matchItem(l));
        if (!items.length) return '';
        return `<div class="dp-boss">
          <div class="dp-boss-name">${boss.boss_order}号 · ${esc(boss.name)}<span class="dp-count">${items.length}</span></div>
          <div class="dp-items">${items.map(itemCard).join('')}</div>
        </div>`;
      }).join('');
      if (!bossHtml) return '';
      return `<div class="dp-raid">
        <div class="dp-raid-name">${esc(raid.name)}${raid.type === 'lair' ? '<span class="dp-badge dp-badge-lair">巢穴</span>' : ''}</div>
        ${bossHtml}
      </div>`;
    }).join('') || emptyText(hasLootFilter() ? '没有符合筛选条件的团本装备' : '该赛季团本数据维护中');
  }

  // ---- 大秘境掉落池 ----
  function renderDungeons() {
    const dungeons = state.dungeons.filter(d => d.season_id === state.seasonId)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const head = `<div class="dp-section-head">
      <div class="dp-section-title">大秘境掉落池 <span class="dp-badge dp-badge-mplus">大秘境</span></div>
      <div class="dp-view-toggle">
        <button class="dp-toggle${state.dungeonView === 'boss' ? ' active' : ''}" data-view="boss">按 BOSS</button>
        <button class="dp-toggle${state.dungeonView === 'pool' ? ' active' : ''}" data-view="pool">整体池</button>
      </div>
    </div>`;
    if (!dungeons.length) return head + emptyText('该赛季大秘境数据维护中');

    const body = dungeons.map(d => {
      const all = state.dungeonLoot.filter(l => l.dungeon_id === d.id && matchItem(l));
      const dName = `${esc(d.name)}${d.is_new ? '<span class="dp-badge dp-badge-new">新本</span>' : ''}`;
      if (state.dungeonView === 'pool') {
        if (!all.length) return '';
        return `<div class="dp-raid">
          <div class="dp-raid-name">${dName}<span class="dp-count">${all.length}</span></div>
          <div class="dp-items">${all.map(itemCard).join('')}</div>
        </div>`;
      }
      // 按 BOSS：BOSS 分组 + 未归属条目归「整体池」组
      const bosses = state.bosses.filter(b => b.dungeon_id === d.id).sort((a, b) => (a.boss_order || 0) - (b.boss_order || 0));
      const groups = bosses.map(boss => {
        const items = all.filter(l => l.boss_id === boss.id);
        if (!items.length) return '';
        return `<div class="dp-boss">
          <div class="dp-boss-name">${boss.boss_order}号 · ${esc(boss.name)}<span class="dp-count">${items.length}</span></div>
          <div class="dp-items">${items.map(itemCard).join('')}</div>
        </div>`;
      });
      const poolItems = all.filter(l => !l.boss_id);
      if (poolItems.length) {
        groups.push(`<div class="dp-boss">
          <div class="dp-boss-name">整体池<span class="dp-count">${poolItems.length}</span></div>
          <div class="dp-items">${poolItems.map(itemCard).join('')}</div>
        </div>`);
      }
      const gHtml = groups.join('');
      if (!gHtml) return '';
      return `<div class="dp-raid"><div class="dp-raid-name">${dName}</div>${gHtml}</div>`;
    }).join('') || emptyText(hasLootFilter() ? '没有符合筛选条件的大秘境装备' : '该赛季大秘境数据维护中');

    return head + body;
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

  function render() {
    main.innerHTML = `
      <section class="dp-section">
        <div class="dp-section-head"><div class="dp-section-title">团本掉落池</div></div>
        ${renderRaids()}
      </section>
      <section class="dp-section">${renderDungeons()}</section>
      <section class="dp-section">
        <div class="dp-section-head">
          <div class="dp-section-title">套装一览</div>
          <div class="dp-tier-filters">
            <select id="dpTierClass" class="form-select"></select>
            <select id="dpTierRole" class="form-select"></select>
            <select id="dpTierSpec" class="form-select"></select>
          </div>
        </div>
        <div class="dp-tiers">${renderTierSets()}</div>
      </section>`;
    // 大秘境视图切换（事件委托，渲染后重绑）
    main.querySelectorAll('.dp-toggle').forEach(btn => {
      btn.onclick = () => { state.dungeonView = btn.dataset.view; render(); };
    });
    bindTierFilters();
  }

  boot();
})();
