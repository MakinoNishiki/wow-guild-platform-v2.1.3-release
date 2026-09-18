// 任务书 #51（REQ-137 一期）：家宅图鉴数据层+渲染层（双壳单一真源，禁止复制第二份）。
// 双壳机制沿袭 js/dataPublic.js（任务书 #28 WP5 定式）：
//   公开壳 = decor.html（body.data-decor-body，文件末尾自动 mount(document)，免登录可分享，WP2 落地）；
//   登录壳 = index.html #page-decor 页签，由 app.js ensureDecorMounted() 首次切入懒挂载容器根。
// 数据通道：/api/supabase-config（免登录端点）→ anon 直连 PostgREST 读 decor_catalog，只读零写入。
// 防坑（侦察实证）：PostgREST 单请求上限 1000 行——分页循环拉满（判停：返回批 < 1000），
// 拉齐后内存索引，筛选/搜索/翻页全程内存计算零请求。
// 词表唯一真源 = js/decorDict.js（本文件之前加载）；词表外 ID 渲染为「货币/物品/分类 + ID」兜底不改写。
(function () {
  'use strict';

  const D = window.DecorDict;
  const PLACEHOLDER = 'assets/decor-icons/_placeholder.png';

  // WP5 定式：root = 挂载根（公开壳 document / 登录壳 #page-decor 容器），id 查找限定 root 不越界
  let root = document;
  const $ = id => root.querySelector(`#${id}`);
  let filterBar = null, main = null;

  const state = {
    url: '', anon: '',
    rows: [],            // 全量 2062 件（内存索引）
    search: '',
    category: 0,         // 主类 id（0=全部）
    source: '',          // 来源类型 key（''=全部，'none'=无来源）
    expansion: 0,        // 资料片 tag id（0=全部）
    costTier: '',        // 容量档 key
    env: '',             // 摆放环境 key
    petOnly: false,      // 可放宠物（subcategory 含 53，方案 A 终审）
    roomsOnly: false,    // 房间/户型（entry_type=2）
    page: 1,
  };

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---- 数据管线 ----
  const SELECT = 'record_id,entry_type,name,icon_file_id,quality,size,placement_cost,' +
    'category_ids,subcategory_ids,tags,indoors,outdoors,can_customize,source_text,sources';

  async function loadData() {
    const rows = [];
    let offset = 0;
    for (;;) {
      const res = await fetch(`${state.url}/rest/v1/decor_catalog?select=${SELECT}&order=record_id.asc&offset=${offset}&limit=1000`, {
        headers: { apikey: state.anon, Authorization: `Bearer ${state.anon}` },
      });
      if (!res.ok) throw new Error(`读取失败（HTTP ${res.status}）`);
      const batch = await res.json();
      rows.push(...batch);
      if (batch.length < 1000) break; // 判停：返回批 < 1000
      offset += 1000;
    }
    state.rows = rows;
  }

  // ---- 筛选（AND 跨组） ----
  function activeFilterCount() {
    let n = 0;
    if (state.search) n++;
    if (state.category) n++;
    if (state.source) n++;
    if (state.expansion) n++;
    if (state.costTier) n++;
    if (state.env) n++;
    if (state.petOnly) n++;
    if (state.roomsOnly) n++;
    return n;
  }

  function filteredRows() {
    const kw = state.search;
    const tier = D.COST_TIERS.find(t => t.key === state.costTier);
    const env = D.ENV_OPTIONS.find(e => e.key === state.env);
    return state.rows.filter(r => {
      if (kw && !r.name.toLowerCase().includes(kw)) return false;
      if (state.category && !(Array.isArray(r.category_ids) && r.category_ids.includes(state.category))) return false;
      if (state.source === 'none') { if (Array.isArray(r.sources) && r.sources.length) return false; }
      else if (state.source && !(Array.isArray(r.sources) && r.sources.some(s => s.type === state.source))) return false;
      if (state.expansion && !(r.tags && r.tags[String(state.expansion)])) return false;
      if (tier && !tier.match(r.placement_cost || 0)) return false;
      if (env && !env.match(r)) return false;
      if (state.petOnly && !(Array.isArray(r.subcategory_ids) && r.subcategory_ids.includes(D.PET_SUBCATEGORY_ID))) return false;
      if (state.roomsOnly && r.entry_type !== 2) return false;
      return true;
    });
  }

  // ---- 筛选栏（结构 JS 生成，双壳零骨架差异） ----
  function chip(label, on, count) {
    return `<button type="button" class="dh-chip${on ? ' on' : ''}">${esc(label)}${count != null ? `<span class="dh-chip-n">${count}</span>` : ''}</button>`;
  }

  function buildFilterBar() {
    const rows = state.rows;
    const countBy = fn => rows.filter(fn).length;
    const srcCount = key => key === 'none'
      ? countBy(r => !Array.isArray(r.sources) || !r.sources.length)
      : countBy(r => Array.isArray(r.sources) && r.sources.some(s => s.type === key));

    filterBar.innerHTML = `
      <div class="dh-top-row">
        <div class="uc-input-wrap dh-search-wrap"><input type="text" id="dhSearch" class="search-input" placeholder="搜索装饰名…"><button type="button" id="dhSearchClear" class="uc-clear-btn" aria-label="清除搜索" title="清空" style="display:none">&times;</button></div>
        <button type="button" id="dhResetFilters" class="btn btn-secondary">重置筛选</button>
        <div class="dh-count" id="dhCount"></div>
        <button type="button" id="dhFilterToggle" class="btn btn-secondary dh-filter-toggle">筛选 ▾</button>
      </div>
      <div class="dh-filter-rows" id="dhFilterRows">
        <div class="dh-group"><div class="dh-group-head">分类<span class="dh-chip-n">（单选）</span></div><div class="dh-chips" id="dhCatChips"></div></div>
        <div class="dh-group"><div class="dh-group-head">来源<span class="dh-chip-n">（单选）</span></div><div class="dh-chips" id="dhSrcChips"></div></div>
        <div class="dh-group"><div class="dh-group-head">资料片<span class="dh-chip-n">（单选）</span></div><div class="dh-chips" id="dhExpChips"></div></div>
        <div class="dh-group"><div class="dh-group-head">容量<span class="dh-chip-n">（单选）</span></div><div class="dh-chips" id="dhCostChips"></div></div>
        <div class="dh-group"><div class="dh-group-head">摆放环境<span class="dh-chip-n">（单选）</span></div><div class="dh-chips" id="dhEnvChips"></div></div>
        <div class="dh-group"><div class="dh-group-head">特性</div><div class="dh-chips" id="dhFeatChips"></div></div>
      </div>`;

    // 分类（主类单选，计数全量数据驱动）
    $('dhCatChips').innerHTML = chip('全部', !state.category) + D.CATEGORY_FILTER_ORDER.map(id =>
      chip(D.CATEGORY_NAMES[id], state.category === id, countBy(r => Array.isArray(r.category_ids) && r.category_ids.includes(id)))).join('');
    [...$('dhCatChips').children].forEach((btn, i) => btn.onclick = () => {
      state.category = i === 0 ? 0 : D.CATEGORY_FILTER_ORDER[i - 1]; state.page = 1; refreshChips(); render(true);
    });

    // 来源（十类单选）
    const srcDefs = [{ key: '', label: '全部' }, ...D.SOURCE_TYPES];
    $('dhSrcChips').innerHTML = srcDefs.map(s => chip(s.label, state.source === s.key, s.key ? srcCount(s.key) : null)).join('');
    [...$('dhSrcChips').children].forEach((btn, i) => btn.onclick = () => {
      state.source = srcDefs[i].key; state.page = 1; refreshChips(); render(true);
    });

    // 资料片（tags 组单选）
    const expDefs = [{ id: 0, label: '全部' }, ...D.EXPANSION_TAGS];
    $('dhExpChips').innerHTML = expDefs.map(e =>
      chip(e.label, state.expansion === e.id, e.id ? countBy(r => r.tags && r.tags[String(e.id)]) : null)).join('');
    [...$('dhExpChips').children].forEach((btn, i) => btn.onclick = () => {
      state.expansion = expDefs[i].id; state.page = 1; refreshChips(); render(true);
    });

    // 容量档（单选）
    const costDefs = [{ key: '', label: '全部' }, ...D.COST_TIERS];
    $('dhCostChips').innerHTML = costDefs.map(t =>
      chip(t.label, state.costTier === t.key, t.key ? countBy(r => t.match(r.placement_cost || 0)) : null)).join('');
    [...$('dhCostChips').children].forEach((btn, i) => btn.onclick = () => {
      state.costTier = costDefs[i].key; state.page = 1; refreshChips(); render(true);
    });

    // 摆放环境（单选）
    const envDefs = [{ key: '', label: '全部' }, ...D.ENV_OPTIONS];
    $('dhEnvChips').innerHTML = envDefs.map(e =>
      chip(e.label, state.env === e.key, e.key ? countBy(r => e.match(r)) : null)).join('');
    [...$('dhEnvChips').children].forEach((btn, i) => btn.onclick = () => {
      state.env = envDefs[i].key; state.page = 1; refreshChips(); render(true);
    });

    // 特性（可放宠物 / 房间·户型，独立开关）
    $('dhFeatChips').innerHTML =
      chip('可放宠物', state.petOnly, countBy(r => Array.isArray(r.subcategory_ids) && r.subcategory_ids.includes(D.PET_SUBCATEGORY_ID))) +
      chip('房间/户型', state.roomsOnly, countBy(r => r.entry_type === 2));
    const featBtns = [...$('dhFeatChips').children];
    featBtns[0].onclick = () => { state.petOnly = !state.petOnly; state.page = 1; refreshChips(); render(true); };
    featBtns[1].onclick = () => { state.roomsOnly = !state.roomsOnly; state.page = 1; refreshChips(); render(true); };

    // 搜索（模糊即时，REQ-084 同款清除钮：有内容才显示、点击/Esc 清空、焦点留存）
    const searchInput = $('dhSearch'), searchClear = $('dhSearchClear');
    const syncClear = () => { searchClear.style.display = searchInput.value ? 'block' : 'none'; };
    const clearSearch = () => { searchInput.value = ''; state.search = ''; state.page = 1; syncClear(); searchInput.focus(); refreshCount(); render(true); };
    searchInput.oninput = e => { state.search = e.target.value.trim().toLowerCase(); state.page = 1; syncClear(); refreshCount(); render(true); };
    searchInput.onkeydown = e => { if (e.key === 'Escape' && searchInput.value) clearSearch(); };
    searchClear.onclick = clearSearch;

    $('dhResetFilters').onclick = () => { resetFilters(); refreshChips(); render(true); };
    $('dhFilterToggle').onclick = () => {
      const open = filterBar.classList.toggle('filters-open');
      $('dhFilterToggle').textContent = open ? '筛选 ▴' : '筛选 ▾';
    };
    refreshCount();
  }

  // chips 选中态刷新（计数不变，仅 .on 类迁移；避免整栏重建丢搜索框焦点）
  function refreshChips() {
    const paint = (id, isOn) => [...$(id).children].forEach((btn, i) => btn.classList.toggle('on', isOn(i)));
    paint('dhCatChips', i => (i === 0 ? !state.category : state.category === D.CATEGORY_FILTER_ORDER[i - 1]));
    paint('dhSrcChips', i => state.source === (i === 0 ? '' : D.SOURCE_TYPES[i - 1].key));
    paint('dhExpChips', i => state.expansion === (i === 0 ? 0 : D.EXPANSION_TAGS[i - 1].id));
    paint('dhCostChips', i => state.costTier === (i === 0 ? '' : D.COST_TIERS[i - 1].key));
    paint('dhEnvChips', i => state.env === (i === 0 ? '' : D.ENV_OPTIONS[i - 1].key));
    paint('dhFeatChips', i => (i === 0 ? state.petOnly : state.roomsOnly));
    refreshCount();
  }

  function refreshCount() {
    const n = activeFilterCount();
    $('dhCount').textContent = n ? `命中 ${filteredRows().length} 件 · ${n} 项生效` : `共 ${state.rows.length} 件`;
  }

  function resetFilters() {
    Object.assign(state, { search: '', category: 0, source: '', expansion: 0, costTier: '', env: '', petOnly: false, roomsOnly: false, page: 1 });
    const si = $('dhSearch'); if (si) { si.value = ''; $('dhSearchClear').style.display = 'none'; }
  }

  // ---- 网格渲染 ----
  function iconSrc(r) { return r.icon_file_id != null ? `assets/decor-icons/${r.icon_file_id}.png` : PLACEHOLDER; }

  function cardHtml(r) {
    const q = r.quality != null ? r.quality : 1;
    const badges = [];
    if (r.entry_type === 2) badges.push('<span class="dh-badge dh-badge-room">房间</span>');
    if (Array.isArray(r.subcategory_ids) && r.subcategory_ids.includes(D.PET_SUBCATEGORY_ID)) badges.push('<span class="dh-badge dh-badge-pet">可放宠物</span>');
    if (r.placement_cost != null) badges.push(`<span class="dh-badge">容量 ${r.placement_cost}</span>`);
    return `<div class="dh-card" data-rid="${r.record_id}" tabindex="0" role="button" aria-label="${esc(r.name)}">
      <div class="dh-icon-wrap"><img src="${iconSrc(r)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER}'"></div>
      <div class="dh-name dh-q${q}">${esc(r.name)}</div>
      <div class="dh-badges">${badges.join('')}</div>
    </div>`;
  }

  function pagerHtml(total, page, pages) {
    if (pages <= 1) return '';
    const nums = new Set([1, pages, page - 1, page, page + 1]);
    const list = [...nums].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
    let out = `<button data-pg="${page - 1}" ${page <= 1 ? 'disabled' : ''}>‹</button>`;
    let prev = 0;
    for (const n of list) {
      if (n - prev > 1) out += '<span class="dh-pager-info">…</span>';
      out += `<button data-pg="${n}" class="${n === page ? 'cur' : ''}">${n}</button>`;
      prev = n;
    }
    out += `<button data-pg="${page + 1}" ${page >= pages ? 'disabled' : ''}>›</button>`;
    out += `<span class="dh-pager-info">第 ${page}/${pages} 页 · 共 ${total} 件</span>`;
    return out;
  }

  function render() {
    const rows = filteredRows();
    const pages = Math.max(1, Math.ceil(rows.length / D.PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    const start = (state.page - 1) * D.PAGE_SIZE;
    const pageRows = rows.slice(start, start + D.PAGE_SIZE);

    if (!rows.length) {
      main.innerHTML = `<div class="dh-empty">
        <div class="dh-empty-title">没有符合条件的装饰</div>
        <div class="dh-empty-hint">试试放宽筛选条件或清空搜索词</div>
        <button type="button" class="btn btn-secondary" id="dhEmptyReset">重置筛选</button>
      </div>`;
      $('dhEmptyReset').onclick = () => { resetFilters(); refreshChips(); render(true); };
      return;
    }

    main.innerHTML = `<div class="dh-grid">${pageRows.map(cardHtml).join('')}</div>
      <div class="dh-pager" id="dhPager">${pagerHtml(rows.length, state.page, pages)}</div>`;

    [...main.querySelectorAll('.dh-card')].forEach(card => {
      const open = () => openDetail(state.rows.find(r => r.record_id === +card.dataset.rid));
      card.onclick = open;
      card.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    });
    const pager = $('dhPager');
    if (pager) [...pager.querySelectorAll('button[data-pg]')].forEach(btn => btn.onclick = () => {
      if (btn.disabled) return;
      state.page = +btn.dataset.pg;
      render();
      filterBar.scrollIntoView({ block: 'start' });
    });
  }

  // ---- 来源渲染（任务书规格表逐类写死） ----
  function priceText(price) {
    if (!Array.isArray(price) || !price.length) return '';
    return price.map(p => {
      if (p.gold != null && p.silver != null) return `${p.gold} 金 ${p.silver} 银`;
      if (p.gold != null) return `${p.gold} 金`;
      if (p.currency_id != null) return `${p.amount} × ${D.CURRENCY_NAMES[p.currency_id] || `货币 ${p.currency_id}`}`;
      if (p.item_id != null) return `${p.amount} × ${D.ITEM_NAMES[p.item_id] || `物品 ${p.item_id}`}`;
      if (p.texture != null) return `${p.amount} × ${D.TEXTURE_CURRENCY_NAMES[p.texture] || '未知货币'}`;
      return '';
    }).filter(Boolean).join(' + ');
  }

  function sourceText(s) {
    const zones = Array.isArray(s.zones) && s.zones.length ? `（${s.zones.join('、')}）` : '';
    switch (s.type) {
      case 'shop': return '商城购买';
      case 'vendor': {
        let t = `商人：${s.vendor}${zones}`;
        const p = priceText(s.price);
        if (p) t += ` · ${p}`;
        if (s.reputation) t += ` · ${s.reputation}`;
        return t;
      }
      case 'drop': return `掉落：${s.drop}${zones}`;
      case 'quest': return `任务：${s.quest}${zones}`;
      case 'achievement': return `成就：${s.achievement}${s.category ? `（${s.category}）` : ''}`;
      case 'profession': return `制造：${s.profession}`;
      case 'treasure': return `宝藏：${s.treasure}${zones}`;
      case 'event': return `事件：${s.event}`;
      case 'festival_note': return s.note || '';
      default: return '';
    }
  }

  // source_text 原文兜底剥离：|cXXXXXXXX/|r/|n/|T...|t/|H...|h/残余|h（侦察：887 件含 |H 超链接标记）
  function stripRawText(s) {
    return String(s || '')
      .replace(/\|c[0-9A-Fa-f]{8}/g, '')
      .replace(/\|r/g, '')
      .replace(/\|n/g, '\n')
      .replace(/\|T[^|]*\|t/g, '')
      .replace(/\|H[^|]*\|h/g, '')
      .replace(/\|h/g, '')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  function renderSourceBlock(r) {
    if (Array.isArray(r.sources) && r.sources.length) {
      return r.sources.map(s => `<div class="dh-src-item">${esc(sourceText(s))}</div>`).join('');
    }
    const raw = stripRawText(r.source_text);
    if (raw) return `<div class="dh-src-item dh-src-raw">${raw.split('\n').filter(Boolean).map(esc).join('<br>')}</div>`;
    return '<div class="dh-src-item dh-src-raw">来源未知</div>';
  }

  // ---- 详情弹窗（只读不涉 modalDirtyChecks；document.body 单例，双壳自足） ----
  let modalEl = null;
  function closeDetail() {
    if (!modalEl) return;
    modalEl.classList.remove('show');
    const el = modalEl;
    modalEl = null;
    setTimeout(() => el.remove(), 200);
    document.removeEventListener('keydown', onModalKey);
  }
  function onModalKey(e) { if (e.key === 'Escape') closeDetail(); }

  function openDetail(r) {
    if (!r || modalEl) return;
    const q = r.quality != null ? r.quality : 1;
    const envText = r.indoors && r.outdoors ? '均可' : r.indoors ? '室内' : r.outdoors ? '室外' : '—';
    const catText = Array.isArray(r.category_ids) && r.category_ids.length
      ? r.category_ids.map(id => D.CATEGORY_NAMES[id] || `分类 ${id}`).join('、') : '—';
    const subText = Array.isArray(r.subcategory_ids) && r.subcategory_ids.length
      ? r.subcategory_ids.map(id => D.SUBCATEGORY_NAMES[id] || `子类 ${id}`).join('、') : '—';
    const sizeText = D.SIZE_NAMES[r.size] || '—';
    const tags = r.tags && typeof r.tags === 'object' ? Object.values(r.tags) : [];

    modalEl = document.createElement('div');
    modalEl.className = 'dh-modal-overlay';
    modalEl.innerHTML = `<div class="dh-modal" role="dialog" aria-label="${esc(r.name)}">
      <div class="dh-modal-head">
        <div class="dh-modal-icon"><img src="${iconSrc(r)}" alt="" onerror="this.onerror=null;this.src='${PLACEHOLDER}'"></div>
        <div>
          <div class="dh-modal-title dh-q${q}">${esc(r.name)}</div>
          <div class="dh-modal-sub">${esc(D.QUALITY_NAMES[q] || '')}${r.entry_type === 2 ? ' · 房间/户型' : ''}</div>
        </div>
        <button type="button" class="dh-modal-close" aria-label="关闭">&times;</button>
      </div>
      <div class="dh-meta-rows">
        <div class="dh-meta-row">容量：<b>${r.placement_cost != null ? r.placement_cost : '—'}</b></div>
        <div class="dh-meta-row">尺寸：<b>${esc(sizeText)}</b></div>
        <div class="dh-meta-row">摆放：<b>${envText}</b></div>
        <div class="dh-meta-row">分类：<b>${esc(catText)}</b></div>
        <div class="dh-meta-row">子类：<b>${esc(subText)}</b></div>
      </div>
      ${tags.length ? `<div class="dh-sec-title">标签</div><div class="dh-tags">${tags.map(t => `<span class="dh-badge">${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="dh-sec-title">来源</div>
      <div class="dh-src-list">${renderSourceBlock(r)}</div>
    </div>`;
    modalEl.addEventListener('click', e => { if (e.target === modalEl) closeDetail(); });
    modalEl.querySelector('.dh-modal-close').onclick = closeDetail;
    document.body.appendChild(modalEl);
    document.addEventListener('keydown', onModalKey);
    requestAnimationFrame(() => modalEl && modalEl.classList.add('show'));
  }

  // ---- 三态 ----
  function showError(msg) {
    main.innerHTML = `<div class="dh-error">
      <div class="dh-error-text">${esc(msg || '数据加载失败')}</div>
      <button type="button" class="btn btn-primary" id="dhRetry">重试</button>
    </div>`;
    $('dhRetry').onclick = () => { main.innerHTML = '<div class="dh-loading">数据加载中…</div>'; boot(); };
  }

  // ---- 启动 ----
  let booted = false;
  async function boot() {
    filterBar = $('dhFilterBar');
    main = $('dhMain');
    let cfg;
    try {
      const r = await fetch('/api/supabase-config');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      cfg = await r.json();
    } catch (e) { showError('无法获取服务配置，请检查网络后重试'); return; }
    state.url = (cfg.url || cfg.supabaseUrl || '').replace(/\/+$/, '');
    state.anon = cfg.anonKey || cfg.supabaseAnonKey || '';
    if (!state.url || !state.anon) { showError('服务配置不完整'); return; }
    try {
      await loadData();
    } catch (e) { showError(e.message || '数据加载失败'); return; }
    buildFilterBar();
    render();
  }

  // 双宿主挂载入口（WP5 定式）：公开壳自动挂 document 立即启动；登录壳 tab 首切 mount(容器) 懒启动（幂等）。
  // activate()：图鉴为只读目录数据（变更只走 sql 迁移，无前端写点），无脏标记链路——重切页签零请求，仅作对称占位。
  let started = false;
  window.DecorCatalog = {
    mount(el) {
      if (started) return;
      started = true;
      root = el || document;
      boot();
    },
    activate() { /* 只读目录：无脏标记、无重测需求，刻意零动作 */ },
  };
  if (document.body.classList.contains('data-decor-body')) window.DecorCatalog.mount(document);
})();
