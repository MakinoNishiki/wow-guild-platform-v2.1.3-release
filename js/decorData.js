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
  // 任务书 #58-WP1：方案单抽屉/导出/toast 挂 document.body（fixed 双壳自足），查找必须 document 级——
  // 登录壳 root=#page-decor 容器，root 作用域 $ 查不到 body 级节点（B1③ 实证打回根因）
  const $doc = id => document.getElementById(id);
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
    pageSize: 0,         // 任务书 #51-补丁3：动态每页件数（0=未实测，首渲染前实测列数×8 行）
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
      // 任务书 #51-补丁 第一节（2026-09-18）：默认排序——装饰在前、房间沉底（观感修复：缺图标 41 件中
      // 39 件为低 record_id 房间条目，旧序扎堆首屏）；第一键 entry_type===2 沉底，第二键 record_id 升序
      // （filter 保 REST 原生 record_id asc，sort 稳定即组内原序）；不加排序选择器，默认序即唯一序
    }).sort((a, b) => (a.entry_type === 2 ? 1 : 0) - (b.entry_type === 2 ? 1 : 0));
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

    // 摆放环境（单选；任务书 #51-补丁 第四节：四档砍三档——「室内」=全部无筛选价值、「均可」与「室外」恒等，
    // 词表 ENV_OPTIONS 已同步精简；三档计数按新口径动态渲染，「全部」档同样带计数 2062）
    const envDefs = [{ key: '', label: '全部' }, ...D.ENV_OPTIONS];
    $('dhEnvChips').innerHTML = envDefs.map(e =>
      chip(e.label, state.env === e.key, e.key ? countBy(r => e.match(r)) : rows.length)).join('');
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

  // ---- 每页件数动态化（任务书 #51-补丁3 第一节：PAGE_SIZE 常量 60 → 实测列数 × 8 行） ----
  // 列数取法=网格渲染后 getComputedStyle(gridEl).gridTemplateColumns 实测，不写死断点、不复制媒体查询逻辑；
  // 探针同步三连（append→getComputedStyle 强制排版→remove，同一 JS 任务内完成，无绘制无闪烁）。
  // 首挂载先算再渲染；resize 防抖 300ms 重算，件数变化时记当前页首件 record_id 锚点重定位（不粗暴回第 1 页）；
  // 筛选/搜索/排序变化回第 1 页现逻辑不动；页码语义随窗口宽度漂移=任务书明示的已知代价。
  const ROWS_PER_PAGE = 8;
  function measureColumns() {
    if (!main) return 0;
    const probe = document.createElement('div');
    probe.className = 'dh-grid';
    probe.style.visibility = 'hidden';
    probe.innerHTML = '<div class="dh-card"></div>';
    main.appendChild(probe);
    const tracks = getComputedStyle(probe).gridTemplateColumns;
    probe.remove();
    // 隐藏态（登录壳切去他页 display:none）auto-fill 不可解析 → 原样 repeat() 串或 none，判不可测
    if (!tracks || tracks === 'none' || tracks.indexOf('repeat(') !== -1) return 0;
    return Math.max(1, tracks.split(/\s+/).filter(Boolean).length);
  }
  function currentPageSize() {
    if (!state.pageSize) {
      const cols = measureColumns();
      state.pageSize = cols ? cols * ROWS_PER_PAGE : D.PAGE_SIZE; // 隐藏态降级=词表旧常量兜底
    }
    return state.pageSize;
  }
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (!started || !main) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const cols = measureColumns();
      if (!cols) return; // 隐藏态不测不动
      const newSize = cols * ROWS_PER_PAGE;
      if (newSize === state.pageSize) return;
      const rows = filteredRows();
      const anchor = rows[(state.page - 1) * state.pageSize]; // 当前页首件锚点
      state.pageSize = newSize;
      if (anchor) {
        const idx = rows.findIndex(r => r.record_id === anchor.record_id);
        state.page = idx >= 0 ? Math.floor(idx / newSize) + 1 : 1;
      }
      render();
    }, 300);
  });

  // 任务书 #51-补丁 第三节：分类路径行（主类 · 子类；多分类取第一个主类+第一个子类；
  // 子类 34/35 词表已映射父类名（杂项/房间），与主类同名时去重只显一次；房间件显示「房间」；无子类仅显主类名）
  function catPathText(r) {
    if (r.entry_type === 2) return '房间';
    const cat = Array.isArray(r.category_ids) && r.category_ids.length ? (D.CATEGORY_NAMES[r.category_ids[0]] || `分类 ${r.category_ids[0]}`) : '';
    const sub = Array.isArray(r.subcategory_ids) && r.subcategory_ids.length ? (D.SUBCATEGORY_NAMES[r.subcategory_ids[0]] || `子类 ${r.subcategory_ids[0]}`) : '';
    if (cat && sub && sub !== cat) return `${cat} · ${sub}`;
    return cat || sub || '—';
  }

  // 任务书 #51-补丁 第三节：来源摘要行——sources[0] 复用详情弹窗同款 sourceText 措辞；
  // 任务书 #51-补丁3 第二节：CSS 两行截断（-webkit-line-clamp:2 + 标准 line-clamp 回退，单行截断砍尾修复）；
  // sources 空且 source_text 非空 → 剥离控制码取首行截断 24 字+…；全无 → 「来源未知」（灰字 .dh-src-unknown，单行维持）
  function srcSummaryText(r) {
    if (Array.isArray(r.sources) && r.sources.length) return { text: sourceText(r.sources[0]), unknown: false };
    const raw = stripRawText(r.source_text);
    if (raw) {
      const first = raw.split('\n')[0];
      return { text: first.length > 24 ? first.slice(0, 24) + '…' : first, unknown: false };
    }
    return { text: '来源未知', unknown: true };
  }

  function cardHtml(r) {
    const q = r.quality != null ? r.quality : 1;
    const badges = [];
    if (r.entry_type === 2) badges.push('<span class="dh-badge dh-badge-room">房间</span>');
    if (Array.isArray(r.subcategory_ids) && r.subcategory_ids.includes(D.PET_SUBCATEGORY_ID)) badges.push('<span class="dh-badge dh-badge-pet">可放宠物</span>');
    // 任务书 #51-补丁3 第二节：容量徽标挪图标右上角角标（.dh-cost-badge 绝对定位），原底部容量行删除；
    // 无房间/宠物徽标时整行省略（净空高，抵来源一行变两行）
    const cost = r.placement_cost != null ? `<span class="dh-badge dh-cost-badge">容量 ${r.placement_cost}</span>` : '';
    const src = srcSummaryText(r);
    // 任务书 #58-补丁：角标 ＋ 退役 → 卡片底部通栏按钮「加入方案单 / 已加入 ×N」双态
    return `<div class="dh-card" data-rid="${r.record_id}" tabindex="0" role="button" aria-label="${esc(r.name)}">
      <div class="dh-icon-wrap"><img src="${iconSrc(r)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER}'">${cost}</div>
      <div class="dh-name dh-q${q}">${esc(r.name)}</div>
      <div class="dh-cat">${esc(catPathText(r))}</div>
      <div class="dh-src${src.unknown ? ' dh-src-unknown' : ''}">${esc(src.text)}</div>
      ${badges.length ? `<div class="dh-badges">${badges.join('')}</div>` : ''}
      <button type="button" class="dh-card-add${planQtyOf(r.record_id) ? ' added' : ''}" data-add="${r.record_id}">${planAddLabel(r.record_id)}</button>
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
    const size = currentPageSize(); // 任务书 #51-补丁3：动态每页件数=实测列数×8 行（首挂载先算再渲染）
    const pages = Math.max(1, Math.ceil(rows.length / size));
    if (state.page > pages) state.page = pages;
    const start = (state.page - 1) * size;
    const pageRows = rows.slice(start, start + size);

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
    // 任务书 #58-补丁：卡片通栏「加入方案单」按钮（click/keydown 双 stopPropagation——焦点按钮 Enter/Space 只加单，不冒泡触发卡片开详情）
    [...main.querySelectorAll('[data-add]')].forEach(btn => {
      btn.onclick = e => { e.stopPropagation(); planAdd(+btn.dataset.add); };
      btn.onkeydown = e => e.stopPropagation();
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
      <div class="dh-detail-add-row"><button type="button" class="btn btn-primary dh-detail-add${planQtyOf(r.record_id) ? ' added' : ''}" data-add="${r.record_id}">${planAddLabel(r.record_id)}</button></div>
    </div>`;
    modalEl.addEventListener('click', e => { if (e.target === modalEl) closeDetail(); });
    modalEl.querySelector('.dh-modal-close').onclick = closeDetail;
    // 任务书 #58-补丁：详情弹窗底部加单主按钮（行为同卡片：加入/已加入 ×N 双态，点击 qty+1）
    modalEl.querySelector('.dh-detail-add').onclick = () => planAdd(r.record_id, 'detail');
    document.body.appendChild(modalEl);
    document.addEventListener('keydown', onModalKey);
    requestAnimationFrame(() => modalEl && modalEl.classList.add('show'));
  }

  // ==================== 任务书 #58-WP1：方案单·组单抽屉（形态A）+ 导出文字链路 ====================
  // D2 红线实现：未登录可组单（草稿 localStorage 自动暂存）、保存才登录（公示壳恒视为未登录）、
  // 登录返回组单不丢（双壳同域同 key）。保存通道走 bridge（app.js 注入 cloudCrud 链路）；
  // 公示壳无 bridge → 恒未登录行为。抽屉非弹窗、自动暂存无丢失风险，不登记 modalDirtyChecks；
  // 导出弹窗含可编辑内容，二次确认本模块自实现（双壳自足，app 壳另登记 modalDirtyChecks 对齐规范 4.6）。
  const PLAN_DRAFT_KEY = 'wb_decor_plan_draft'; // 双壳同 key（D2 硬验收：登录跳转往返草稿不丢）
  const DECOR_PLAN_CAPACITY_REF = 2000; // 容量参考上限：游戏内实际预算随住宅等级变化，此处仅参考——超限仅标红不阻断

  const plan = {
    items: [],          // [{record_id, qty}]——当前选定方案的工作集
    plans: [],          // 任务书 #58-WP2-1：全量方案 [{id,name,updated_at,items}]（未登录恒空）
    currentId: null,    // 任务书 #58-WP2-1：当前选定方案 id（未登录恒 null → 草稿键 'anon'）
    cloudName: '我的方案单',
    notice: '',         // 一次性提示（草稿还原）
    saving: false,
    built: false,
  };

  function planCount() { return plan.items.reduce((s, it) => s + it.qty, 0); }
  // 容量合计纯前端算：placement_cost 取自图鉴内存索引，零请求
  function planCapacity() {
    return plan.items.reduce((s, it) => {
      const row = state.rows.find(r => r.record_id === it.record_id);
      return s + ((row && row.placement_cost) || 0) * it.qty;
    }, 0);
  }
  // 任务书 #58-WP2-1：草稿按方案分键（{plans:{[planId|'anon']:{items,updatedAt}}}）——切方案不串单；
  // 兼容 WP1 旧形态 {items,updatedAt} → 视作 'anon' 单槽（未登录/无云端方案行为不变）
  function planDraftReadAll() {
    try {
      const raw = localStorage.getItem(PLAN_DRAFT_KEY);
      if (!raw) return { plans: {} };
      const d = JSON.parse(raw);
      if (d && d.plans && typeof d.plans === 'object') return d;
      if (d && Array.isArray(d.items)) return { plans: { anon: { items: d.items, updatedAt: d.updatedAt } } };
      return { plans: {} };
    } catch { return { plans: {} }; }
  }
  function planDraftKey() { return plan.currentId != null ? String(plan.currentId) : 'anon'; }
  function planDraftSave() {
    try {
      const all = planDraftReadAll();
      if (plan.items.length) all.plans[planDraftKey()] = { items: plan.items, updatedAt: Date.now() };
      else delete all.plans[planDraftKey()];
      if (Object.keys(all.plans).length) localStorage.setItem(PLAN_DRAFT_KEY, JSON.stringify(all));
      else localStorage.removeItem(PLAN_DRAFT_KEY);
    } catch { /* localStorage 不可用（隐私模式等）静默 */ }
  }
  function planDraftLoad() {
    const d = planDraftReadAll().plans[planDraftKey()];
    return (d && Array.isArray(d.items) && d.items.length) ? d : null;
  }
  // 登录态认领 'anon' 槽（WP1 旧草稿 / 公示壳未登录组单）→ 一次性迁入当前方案槽，认领后不再回潮
  function planDraftAdoptAnon() {
    if (planDraftKey() === 'anon') return;
    const all = planDraftReadAll();
    const legacy = all.plans.anon;
    if (!all.plans[planDraftKey()] && legacy && Array.isArray(legacy.items) && legacy.items.length) {
      all.plans[planDraftKey()] = legacy;
      delete all.plans.anon;
      try { localStorage.setItem(PLAN_DRAFT_KEY, JSON.stringify(all)); } catch { /* 静默 */ }
    }
  }

  function planBridge() { return window.DecorCatalog && window.DecorCatalog.planBridge; }
  function planLoggedIn() {
    const b = planBridge();
    return !!(b && typeof b.isLoggedIn === 'function' && b.isLoggedIn());
  }

  // 任务书 #58-WP2-1：登录态云端对齐——拉全量方案 → plans/currentId/cloudName；
  // 当前方案 items 合并三分支（草稿空→云端；云端空→草稿；皆非空→草稿优先+一次性提示）
  async function planPullCloud() {
    let list = [];
    try { list = await planBridge().listPlans(); } catch { list = []; }
    plan.plans = Array.isArray(list) ? list : [];
    const bid = planBridge().currentPlanId && planBridge().currentPlanId();
    plan.currentId = bid != null ? bid : (plan.plans[0] && plan.plans[0].id) || null;
    const cur = plan.plans.find(p => String(p.id) === String(plan.currentId)) || null;
    plan.cloudName = (cur && cur.name) || '我的方案单';
    const cloudItems = cur && Array.isArray(cur.items) && cur.items.length ? cur.items : null;
    planDraftAdoptAnon(); // 先认领 anon 遗留槽，再按三分支合并
    const draft = planDraftLoad();
    if (draft) {
      plan.items = draft.items.map(it => ({ record_id: it.record_id | 0, qty: Math.max(1, it.qty | 0) }));
      plan.notice = '已还原你上次未保存的组单，保存后覆盖云端';
    } else {
      plan.notice = '';
      plan.items = cloudItems ? cloudItems.map(it => ({ record_id: it.record_id, qty: it.qty })) : [];
    }
  }

  // 初始化（boot 数据拉齐后调用）
  async function planInit() {
    if (planLoggedIn()) {
      await planPullCloud();
    } else {
      plan.plans = [];
      plan.currentId = null;
      const draft = planDraftLoad();
      if (draft) plan.items = draft.items.map(it => ({ record_id: it.record_id | 0, qty: Math.max(1, it.qty | 0) }));
    }
    // 目录外 record_id（数据下线等）静默剔除
    plan.items = plan.items.filter(it => state.rows.some(r => r.record_id === it.record_id));
    planRender();
  }

  // 任务书 #58-补丁：加单入口双态同源助手（卡片通栏按钮 + 详情弹窗主按钮共用）
  function planQtyOf(recordId) {
    const hit = plan.items.find(it => it.record_id === recordId);
    return hit ? hit.qty : 0;
  }
  function planAddLabel(recordId) {
    const q = planQtyOf(recordId);
    return q > 0 ? `已加入 ×${q}` : '加入方案单';
  }
  // 全部 [data-add] 入口（卡片 + 详情弹窗）文案/双态统一刷新——抽屉步进/移除后回到弹窗文案亦最新
  function planRefreshEntries() {
    [...document.querySelectorAll('[data-add]')].forEach(btn => {
      const rid = +btn.dataset.add;
      btn.textContent = planAddLabel(rid);
      btn.classList.toggle('added', planQtyOf(rid) > 0);
    });
  }

  // 任务书 #58-补丁：from 区分来源（card=卡片通栏按钮 / detail=详情弹窗主按钮），默认 card
  function planAdd(recordId, from) {
    const hit = plan.items.find(it => it.record_id === recordId);
    if (hit) hit.qty = Math.min(99, hit.qty + 1);
    else plan.items.push({ record_id: recordId, qty: 1 });
    planDraftSave();
    planRender();
    planToast('已加入方案单');
    // 任务书 #56 登记事件（props ≤2KB；record_id 书载可带）
    if (window.WBTrack) WBTrack.event('decor_plan_add', { from: from || 'card', record_id: recordId });
  }
  function planSetQty(recordId, qty) {
    const hit = plan.items.find(it => it.record_id === recordId);
    if (!hit) return;
    hit.qty = Math.max(1, Math.min(99, qty));
    planDraftSave();
    planRender();
  }
  function planRemove(recordId) {
    plan.items = plan.items.filter(it => it.record_id !== recordId);
    planDraftSave();
    planRender();
  }

  // ---- 任务书 #58-WP2-1：批量操作（独立页批量条；单次变更一次 planDraftSave+planRender，不循环触发） ----
  function planBatchRemove(recordIds) {
    const ids = new Set(recordIds.map(Number));
    plan.items = plan.items.filter(it => !ids.has(it.record_id));
    planDraftSave();
    planRender();
  }
  function planBatchInc(recordIds) {
    const ids = new Set(recordIds.map(Number));
    plan.items.forEach(it => { if (ids.has(it.record_id)) it.qty = Math.min(99, it.qty + 1); });
    planDraftSave();
    planRender();
  }

  // ---- 任务书 #58-WP2-1：多方案动作（登录壳专用；写全部走 bridge→cloudCrud，完成后云端对齐重渲染） ----
  async function planActionSwitch(id) {
    if (!planLoggedIn() || String(id) === String(plan.currentId)) return;
    planDraftSave(); // 当前方案未保存编辑先入草稿（切方案不丢不串）
    try {
      await planBridge().switchPlan(id);
      await planPullCloud();
      planRender();
      // 任务书 #58-WP2-3 登记事件（切换一次一埋；plan_count=方案总数）
      if (window.WBTrack) WBTrack.event('decor_plan_switch', { plan_count: plan.plans.length });
    } catch (e) { planToast('切换方案失败：' + ((e && e.message) || '未知错误'), true); }
  }
  async function planActionCreate() {
    if (!planLoggedIn()) { planToast('新建方案需要登录，登录后组单内容不丢'); setTimeout(() => { location.href = 'index.html'; }, 900); return; }
    planDraftSave();
    // 默认名「我的方案 N」：取未被占用的最小序号
    const used = new Set(plan.plans.map(p => p.name));
    let seq = plan.plans.length + 1;
    while (used.has(`我的方案 ${seq}`)) seq++;
    try {
      await planBridge().createPlan(`我的方案 ${seq}`);
      await planPullCloud();
      planRender();
      // 任务书 #58-WP2-3 登记事件
      if (window.WBTrack) WBTrack.event('decor_plan_create', {});
      planToast(`已创建「我的方案 ${seq}」`);
    } catch (e) { planToast('新建方案失败：' + ((e && e.message) || '未知错误'), true); }
  }
  async function planActionRename() {
    if (!planLoggedIn() || plan.currentId == null) return;
    const name = window.prompt('方案名称', plan.cloudName || '我的方案单');
    if (name == null) return; // 取消
    const trimmed = name.trim().slice(0, 40);
    if (!trimmed || trimmed === plan.cloudName) return;
    try {
      await planBridge().renamePlan(plan.currentId, trimmed);
      await planPullCloud();
      planRender();
      planToast('方案已重命名');
    } catch (e) { planToast('重命名失败：' + ((e && e.message) || '未知错误'), true); }
  }
  async function planActionDelete() {
    if (!planLoggedIn() || plan.currentId == null) return;
    if (plan.plans.length <= 1) { planToast('仅剩一个方案，禁止删除', true); return; } // 前端拦截与服务端同口径
    if (!window.confirm(`确定删除方案「${plan.cloudName}」吗？明细一并删除，不可恢复。`)) return;
    try {
      await planBridge().deletePlan(plan.currentId);
      await planPullCloud();
      planRender();
      planToast('方案已删除');
    } catch (e) { planToast('删除失败：' + ((e && e.message) || '未知错误'), true); }
  }

  // ---- 抽屉 DOM（fixed 挂 body，双壳自足；与 root 挂载点无关） ----
  function planBuildDom() {
    if (plan.built) return;
    plan.built = true;
    const wrap = document.createElement('div');
    wrap.id = 'dhPlanRoot';
    wrap.innerHTML = `
      <button type="button" class="dh-plan-toggle" id="dhPlanToggle" aria-label="打开方案单">🧺 方案单 <span class="dh-plan-toggle-n" id="dhPlanToggleN">0</span></button>
      <div class="dh-plan-scrim" id="dhPlanScrim"></div>
      <aside class="dh-plan-drawer" id="dhPlanDrawer" aria-label="我的方案单">
        <div class="dh-plan-head">
          <span class="dh-plan-title">我的方案单</span>
          <span class="dh-plan-count" id="dhPlanCount">0 件</span>
          <button type="button" class="dh-plan-x" id="dhPlanClose" aria-label="收起方案单">&times;</button>
        </div>
        <div class="dh-plan-notice" id="dhPlanNotice" style="display:none"></div>
        <div class="dh-plan-list" id="dhPlanList"></div>
        <div class="dh-plan-foot">
          <div class="dh-plan-cap" id="dhPlanCap"></div>
          <div class="dh-plan-actions">
            <button type="button" class="btn btn-primary" id="dhPlanSave">保存</button>
            <button type="button" class="btn btn-secondary" id="dhPlanExport">导出文本清单</button>
          </div>
        </div>
      </aside>`;
    document.body.appendChild(wrap);
    $doc('dhPlanToggle').onclick = () => planSetOpen(true);
    $doc('dhPlanClose').onclick = () => planSetOpen(false);
    $doc('dhPlanScrim').onclick = () => planSetOpen(false);
    $doc('dhPlanSave').onclick = planSave;
    $doc('dhPlanExport').onclick = planOpenExport;
  }

  function planSetOpen(open) {
    planBuildDom();
    $doc('dhPlanDrawer').classList.toggle('open', open);
    $doc('dhPlanScrim').classList.toggle('open', open);
  }

  function planRender() {
    planBuildDom();
    planRefreshEntries(); // 任务书 #58-补丁：加单入口双态同步（须在空清单早退前执行）
    const n = planCount();
    $doc('dhPlanToggleN').textContent = n;
    $doc('dhPlanCount').textContent = `${n} 件`;
    // 任务书 #58-WP2-1：徽标三处同源——侧栏「方案单」项徽标（应用壳独有，公示壳无此节点自动跳过）
    const navBadge = document.getElementById('dhNavPlanBadge');
    if (navBadge) { navBadge.textContent = n; navBadge.style.display = n > 0 ? '' : 'none'; }
    // 独立页已挂载则同步重渲染（抽屉/卡片操作实时反映到页内表格与摘要卡）
    if (planPageEl) planPageRender();
    const cap = planCapacity();
    const capEl = $doc('dhPlanCap');
    capEl.textContent = `容量 ${cap.toLocaleString()} / ${DECOR_PLAN_CAPACITY_REF.toLocaleString()}`;
    capEl.classList.toggle('over', cap > DECOR_PLAN_CAPACITY_REF); // 超限仅标红警示，不阻断
    const noticeEl = $doc('dhPlanNotice');
    if (plan.notice) { noticeEl.textContent = plan.notice; noticeEl.style.display = ''; }
    else noticeEl.style.display = 'none';

    const list = $doc('dhPlanList');
    if (!plan.items.length) {
      list.innerHTML = '<div class="dh-plan-empty">方案单还是空的<br><span>从左侧图鉴挑装饰加入方案单</span></div>';
      return;
    }
    list.innerHTML = plan.items.map(it => {
      const row = state.rows.find(r => r.record_id === it.record_id);
      if (!row) return '';
      const q = row.quality != null ? row.quality : 1;
      return `<div class="dh-plan-row" data-rid="${it.record_id}">
        <span class="dh-plan-icon"><img src="${iconSrc(row)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER}'"></span>
        <span class="dh-plan-name dh-q${q}" title="${esc(row.name)}">${esc(row.name)}</span>
        <span class="dh-plan-step">
          <button type="button" class="dh-plan-step-btn" data-step="-1" ${it.qty <= 1 ? 'disabled' : ''} aria-label="减少数量">−</button>
          <span class="dh-plan-qty">${it.qty}</span>
          <button type="button" class="dh-plan-step-btn" data-step="1" ${it.qty >= 99 ? 'disabled' : ''} aria-label="增加数量">＋</button>
        </span>
        <button type="button" class="dh-plan-rm" data-rm="1" aria-label="移除">&times;</button>
      </div>`;
    }).join('');
    [...list.querySelectorAll('.dh-plan-row')].forEach(rowEl => {
      const rid = +rowEl.dataset.rid;
      [...rowEl.querySelectorAll('[data-step]')].forEach(btn => btn.onclick = () => {
        const cur = plan.items.find(it => it.record_id === rid);
        if (cur) planSetQty(rid, cur.qty + (+btn.dataset.step));
      });
      rowEl.querySelector('[data-rm]').onclick = () => planRemove(rid);
    });
  }

  // 迷你 toast（公开壳无 app.js showToast，双壳自足）
  let planToastTimer = null;
  function planToast(msg, isErr) {
    let el = document.getElementById('dhPlanToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'dhPlanToast';
      el.className = 'dh-plan-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.toggle('err', !!isErr);
    el.classList.add('show');
    clearTimeout(planToastTimer);
    planToastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ---- 保存（D2：公示壳恒视为未登录 → 提示+跳主站登录页；登录壳走 bridge cloudCrud 链路） ----
  async function planSave() {
    if (!planLoggedIn()) {
      planToast('保存方案单需要登录，登录后组单内容不丢');
      setTimeout(() => { location.href = 'index.html'; }, 900);
      return;
    }
    if (plan.saving) return;
    plan.saving = true;
    const btn = $doc('dhPlanSave');
    btn.disabled = true; btn.textContent = '保存中…';
    try {
      await planBridge().save(plan.items, plan.cloudName || '我的方案单');
      // 保存成功清当前方案草稿槽（云端为真源；#58-WP2-1 分键草稿——其他方案草稿槽不受影响）
      plan.items = [];
      planDraftSave();
      await planPullCloud(); // 云端对齐（头名/明细以库为准）
      plan.notice = '';
      planRender();
      // 任务书 #56 登记事件（计数口径：总件数+容量）
      if (window.WBTrack) WBTrack.event('decor_plan_save', { items: planCount(), capacity: planCapacity() });
      planToast('方案单已保存');
    } catch (e) {
      planToast('保存失败：' + ((e && e.message) || '未知错误'), true); // 禁止静默失败
    } finally {
      plan.saving = false;
      btn.disabled = false; btn.textContent = '保存';
    }
  }

  // ---- 导出文字链路（WP1 仅文字模式；双壳可用，不写库） ----
  function planExportText() {
    const name = plan.cloudName || '我的方案单';
    const lines = [`【魔兽管家 · 家宅方案单】${name}`];
    plan.items.forEach(it => {
      const row = state.rows.find(r => r.record_id === it.record_id);
      if (!row) return;
      lines.push(`${row.name} ×${it.qty}（容量 ${row.placement_cost != null ? row.placement_cost : '—'}/件）`);
    });
    lines.push('——————————');
    lines.push(`合计 ${planCount()} 件 · 容量 ${planCapacity()}`);
    // 尾行固定挂站点链接（文本其他位置不再插链接）
    lines.push('魔兽管家 · 家宅图鉴免费组单：https://wow.ddctl.com/decor.html');
    return lines.join('\n');
  }

  let exportEl = null, exportOriginal = '';
  function planExportIsDirty() {
    const ta = exportEl && exportEl.querySelector('#dhPlanExportText');
    return !!(ta && ta.value !== exportOriginal);
  }
  function planCloseExport(force) {
    if (!exportEl) return;
    if (!force && planExportIsDirty()) {
      // 规范 4.6：含未保存编辑内容，遮罩/ESC 二次确认（双壳自足实现；app 壳另已登记 modalDirtyChecks）
      if (!window.confirm('内容未保存，确定放弃吗？')) return;
    }
    const el = exportEl;
    exportEl = null;
    el.classList.remove('show');
    setTimeout(() => el.remove(), 200);
    document.removeEventListener('keydown', onExportKey);
  }
  function onExportKey(e) { if (e.key === 'Escape') planCloseExport(false); }

  // ==================== 任务书 #58-WP2-2：导出图片模式（Canvas 零依赖手绘） + 三皮肤 + 阵营水印 ====================
  // 素材口径：三枚水印为暴雪官方美术抠图（过渡使用）——正式上线前评估简化重绘（台账在案）。
  const EXPORT_SKINS = {
    gold: { label: '默认·管家金边', color: '#C9A869', wm: 'assets/decor-brand/wm-wb-shield-v2.png' },
    alliance: { label: '联盟·狮蓝', color: '#4A7FBF', wm: 'assets/decor-brand/wm-alliance-v2.png' },
    horde: { label: '部落·战红', color: '#B03A2E', wm: 'assets/decor-brand/wm-horde-v2.png' },
  };
  const EXPORT_IMG_W = 900;      // 出图宽度 ≥900px（2 倍屏保真；预览同位图 CSS 缩放保清晰）
  const EXPORT_WM_W = 150;       // 水印绘制宽度（硬规格）
  const EXPORT_WM_MARGIN = 16;   // 水印右/下缘边距（硬规格）
  const EXPORT_WM_ALPHA = 0.18;  // 水印不透明度 18%（硬规格 0.15–0.20 区间）
  const EXPORT_BG = '#0F1115';   // 深色卡底（--bg-primary 同系）
  const EXPORT_FONT = '-apple-system, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif';

  const wmCache = {}; // skin -> HTMLImageElement | 'error'（404 优雅降级：无水印出图，console 告警，不阻断导出）
  function loadWm(skinKey, onDone) {
    const cur = wmCache[skinKey];
    if (cur && cur !== 'error') { onDone(cur); return; }
    if (cur === 'error') { onDone(null); return; }
    const img = new Image();
    img.onload = () => { wmCache[skinKey] = img; onDone(img); };
    img.onerror = () => {
      wmCache[skinKey] = 'error';
      console.warn('[decor-export] 水印素材缺失（' + EXPORT_SKINS[skinKey].wm + '），本次导出降级为无水印出图');
      onDone(null);
    };
    img.src = EXPORT_SKINS[skinKey].wm;
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 绘制规格（任务书逐条硬规格）：图层顺序 = 卡底 → 边框 → 水印（垫底）→ 标题/清单/合计/页脚文字层；
  // 卡高 = 内容自然高度（默认最小高，清单变长则变长——水印不参与尺寸计算）
  function planDrawExportImage(canvas, skinKey, wmImg) {
    const skin = EXPORT_SKINS[skinKey];
    const W = EXPORT_IMG_W, PAD = 28, ROW_H = 32;
    const name = plan.cloudName || '我的方案单';
    const n = planCount(), cap = planCapacity();
    const items = plan.items
      .map(it => ({ it, row: state.rows.find(r => r.record_id === it.record_id) }))
      .filter(x => x.row);
    const H = PAD + 44 + 14 + Math.max(1, items.length) * ROW_H + 36 + 30 + PAD;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    // 卡底圆角矩形（半径 8px）+ 3px 皮肤边框
    roundRectPath(ctx, 1.5, 1.5, W - 3, H - 3, 8);
    ctx.fillStyle = EXPORT_BG;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = skin.color;
    ctx.stroke();
    // 水印：锚定右下角（右/下缘各 16px）、绘制宽 150px、不透明度 18%、垫于文字之下
    if (wmImg) {
      const wmH = EXPORT_WM_W * ((wmImg.naturalHeight / wmImg.naturalWidth) || 1);
      ctx.save();
      ctx.globalAlpha = EXPORT_WM_ALPHA;
      ctx.drawImage(wmImg, W - EXPORT_WM_MARGIN - EXPORT_WM_W, H - EXPORT_WM_MARGIN - wmH, EXPORT_WM_W, wmH);
      ctx.restore();
    }
    ctx.textBaseline = 'middle';
    // 标题区：方案名（皮肤色系标题色）+ 件数
    ctx.fillStyle = skin.color;
    ctx.font = '700 26px ' + EXPORT_FONT;
    ctx.fillText(name, PAD, PAD + 20, W - PAD * 2 - 220);
    ctx.fillStyle = '#9aa0a8';
    ctx.font = '13px ' + EXPORT_FONT;
    ctx.textAlign = 'right';
    ctx.fillText(`共 ${n} 件 · 容量 ${cap.toLocaleString()}`, W - PAD, PAD + 20);
    ctx.textAlign = 'left';
    // 分隔线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD, PAD + 44); ctx.lineTo(W - PAD, PAD + 44); ctx.stroke();
    // 清单行：名称 ×qty（容量/件 小字右置），行高随内容
    let y = PAD + 44 + 14;
    items.forEach(({ it, row }) => {
      ctx.fillStyle = '#e8e8e8';
      ctx.font = '15px ' + EXPORT_FONT;
      ctx.fillText(`${row.name} ×${it.qty}`, PAD, y + ROW_H / 2, W - PAD * 2 - 240);
      ctx.fillStyle = '#9aa0a8';
      ctx.font = '12px ' + EXPORT_FONT;
      if (row.placement_cost != null) {
        ctx.textAlign = 'right';
        ctx.fillText(`容量 ${row.placement_cost}/件 · 小计 ${(row.placement_cost * it.qty).toLocaleString()}`, W - PAD, y + ROW_H / 2);
        ctx.textAlign = 'left';
      }
      y += ROW_H;
    });
    if (!items.length) {
      ctx.fillStyle = '#7a7f85';
      ctx.font = '13px ' + EXPORT_FONT;
      ctx.fillText('（空方案——去图鉴挑几件装饰加入方案单）', PAD, y + ROW_H / 2);
      y += ROW_H;
    }
    // 合计行
    ctx.fillStyle = skin.color;
    ctx.font = '600 14px ' + EXPORT_FONT;
    ctx.fillText(`合计 ${n} 件 · 容量 ${cap.toLocaleString()}`, PAD, y + 18);
    y += 36;
    // 页脚固定行
    ctx.fillStyle = '#7a7f85';
    ctx.font = '12px ' + EXPORT_FONT;
    ctx.fillText('魔兽管家 · 家宅图鉴免费组单：https://wow.ddctl.com/decor.html', PAD, y + 15);
    return { W, H };
  }

  let exportSkin = 'gold';
  function exportRedrawPreview() {
    const canvas = exportEl && exportEl.querySelector('#dhExpCanvas');
    if (!canvas) return;
    const skinAtCall = exportSkin;
    loadWm(exportSkin, img => {
      if (!exportEl || exportSkin !== skinAtCall) return; // 已关弹窗或已切皮肤，丢弃过期回调
      planDrawExportImage(canvas, skinAtCall, img);
    });
  }
  function exportImageBlob() {
    return new Promise(resolve => {
      loadWm(exportSkin, img => {
        const canvas = document.createElement('canvas');
        planDrawExportImage(canvas, exportSkin, img);
        canvas.toBlob(blob => resolve(blob), 'image/png');
      });
    });
  }
  function exportImageDownload(blob) {
    const name = (plan.cloudName || '我的方案单').replace(/[\\/:*?"<>|]/g, '_');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}-魔兽管家.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  async function planSaveExportImage() {
    // 任务书 #58-WP2-3 登记事件（一次导出动作一次，props 枚举口径）
    if (window.WBTrack) WBTrack.event('decor_plan_export_image', { skin: exportSkin });
    const blob = await exportImageBlob();
    if (!blob) { planToast('图片生成失败', true); return; }
    exportImageDownload(blob);
    planToast('图片已保存');
  }
  async function planCopyExportImage() {
    if (window.WBTrack) WBTrack.event('decor_plan_export_image', { skin: exportSkin });
    const blob = await exportImageBlob();
    if (!blob) { planToast('图片生成失败', true); return; }
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      planToast('图片已复制到剪贴板');
    } catch {
      // 不支持/权限拒 → 自动降级为下载 PNG 并 toast 说明（台账定案口径）
      exportImageDownload(blob);
      planToast('剪贴板不可用，已降级为下载 PNG');
    }
  }

  function planOpenExport() {
    if (exportEl) return;
    exportSkin = 'gold'; // 每次打开回到默认皮肤（与 radio checked 态一致）
    exportOriginal = planExportText();
    exportEl = document.createElement('div');
    exportEl.className = 'dh-modal-overlay dh-plan-export-overlay';
    exportEl.innerHTML = `<div class="dh-modal dh-plan-export" role="dialog" aria-label="导出方案单">
      <div class="dh-plan-export-head">
        <span class="dh-plan-export-title">导出方案单</span>
        <button type="button" class="dh-modal-close" aria-label="关闭">&times;</button>
      </div>
      <div class="dh-exp-tabs" role="tablist">
        <button type="button" class="dh-exp-tab active" id="dhExpTabText" role="tab" aria-selected="true">文字预览</button>
        <button type="button" class="dh-exp-tab" id="dhExpTabImage" role="tab" aria-selected="false">生成图片</button>
      </div>
      <div id="dhExpPaneText">
        <div class="dh-plan-export-hint">改动只影响本次导出，不回写方案单数据</div>
        <textarea id="dhPlanExportText" class="dh-plan-export-text" spellcheck="false"></textarea>
        <div class="dh-plan-export-actions">
          <button type="button" class="btn btn-primary" id="dhPlanCopyBtn">复制文本清单</button>
        </div>
      </div>
      <div id="dhExpPaneImage" style="display:none">
        <div class="dh-exp-image-body">
          <div class="dh-exp-preview"><canvas id="dhExpCanvas"></canvas></div>
          <div class="dh-exp-ctl">
            <div class="dh-exp-ctl-title">边框皮肤</div>
            ${Object.entries(EXPORT_SKINS).map(([k, s]) =>
              `<label class="dh-exp-skin"><input type="radio" name="dhExpSkin" value="${k}" ${k === 'gold' ? 'checked' : ''}> ${s.label}</label>`).join('')}
            <button type="button" class="btn btn-primary dh-exp-save" id="dhExpSaveImg">保存图片 PNG</button>
            <button type="button" class="btn dh-exp-copy" id="dhExpCopyImg">复制图片到剪贴板</button>
          </div>
        </div>
      </div>
    </div>`;
    const ta = exportEl.querySelector('#dhPlanExportText');
    ta.value = exportOriginal;
    exportEl.addEventListener('click', e => { if (e.target === exportEl) planCloseExport(false); });
    exportEl.querySelector('.dh-modal-close').onclick = () => planCloseExport(false);
    exportEl.querySelector('#dhPlanCopyBtn').onclick = planCopyExport;
    // tab 壳：文字预览（默认聚焦）/ 生成图片（次位）——文字模式 WP1 逻辑原样迁移不改造
    const tabText = exportEl.querySelector('#dhExpTabText');
    const tabImage = exportEl.querySelector('#dhExpTabImage');
    const setTab = which => {
      tabText.classList.toggle('active', which === 'text');
      tabImage.classList.toggle('active', which === 'image');
      tabText.setAttribute('aria-selected', which === 'text' ? 'true' : 'false');
      tabImage.setAttribute('aria-selected', which === 'image' ? 'true' : 'false');
      exportEl.querySelector('#dhExpPaneText').style.display = which === 'text' ? '' : 'none';
      exportEl.querySelector('#dhExpPaneImage').style.display = which === 'image' ? '' : 'none';
      if (which === 'image') exportRedrawPreview();
    };
    tabText.onclick = () => setTab('text');
    tabImage.onclick = () => setTab('image');
    [...exportEl.querySelectorAll('input[name="dhExpSkin"]')].forEach(r => {
      r.onchange = () => { exportSkin = r.value; exportRedrawPreview(); };
    });
    exportEl.querySelector('#dhExpSaveImg').onclick = planSaveExportImage;
    exportEl.querySelector('#dhExpCopyImg').onclick = planCopyExportImage;
    document.body.appendChild(exportEl);
    document.addEventListener('keydown', onExportKey);
    requestAnimationFrame(() => exportEl && exportEl.classList.add('show'));
  }

  async function planCopyExport() {
    const ta = exportEl && exportEl.querySelector('#dhPlanExportText');
    if (!ta) return;
    // 任务书 #56 登记事件（复制点击挂点，双壳可用）
    if (window.WBTrack) WBTrack.event('decor_plan_export_text', { items: planCount() });
    try {
      await navigator.clipboard.writeText(ta.value);
      planToast('文本清单已复制');
    } catch {
      // 降级：clipboard 不可用（非安全上下文/权限拒）→ 全选提示手动复制
      ta.focus();
      ta.select();
      planToast('已全选，请按 Ctrl+C 手动复制');
    }
  }

  // ==================== 任务书 #58-WP2-1：方案单独立页（形态B，应用壳专用渲染层） ====================
  // 与抽屉共享同一 plan 数据模块（增删改/步进/批量/多方案动作全复用上方函数，禁止复制第二份数据逻辑）；
  // 仅应用壳经 DecorCatalog.mountPlanPage 挂载（公示壳不挂，本段代码在公示壳惰性不触发）。
  let planPageEl = null;
  const planPageSel = new Set(); // 批量条勾选态（record_id）

  function mountPlanPage(el) {
    planPageEl = el;
    planPageRender();
  }
  function activatePlanPage() { planPageRender(); } // 重切页签刷新（方案可能在抽屉/卡片侧改过）

  function planPageRowHtml(it) {
    const row = state.rows.find(r => r.record_id === it.record_id);
    if (!row) return '';
    const q = row.quality != null ? row.quality : 1;
    const src = srcSummaryText(row);
    const cost = row.placement_cost != null ? row.placement_cost : '—';
    const sub = row.placement_cost != null ? (row.placement_cost * it.qty).toLocaleString() : '—';
    return `<tr data-rid="${it.record_id}">
      <td class="dh-pp-cb"><input type="checkbox" class="dh-pp-sel" data-rid="${it.record_id}" ${planPageSel.has(it.record_id) ? 'checked' : ''} aria-label="选择 ${esc(row.name)}"></td>
      <td><span class="dh-pp-item"><img class="dh-pp-icon" src="${iconSrc(row)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER}'"><span class="dh-pp-name dh-q${q}" title="${esc(row.name)}">${esc(row.name)}</span></span></td>
      <td class="dh-pp-src${src.unknown ? ' dh-src-unknown' : ''}" title="${esc(src.text)}">${esc(src.text)}</td>
      <td class="dh-pp-qty"><span class="dh-plan-step">
        <button type="button" class="dh-plan-step-btn" data-step="-1" ${it.qty <= 1 ? 'disabled' : ''} aria-label="减少数量">−</button>
        <span class="dh-plan-qty">${it.qty}</span>
        <button type="button" class="dh-plan-step-btn" data-step="1" ${it.qty >= 99 ? 'disabled' : ''} aria-label="增加数量">＋</button>
      </span></td>
      <td class="dh-pp-num">${cost}</td>
      <td class="dh-pp-num">${sub}</td>
      <td class="dh-pp-op"><button type="button" class="dh-plan-rm" data-rm="1" aria-label="移除">&times;</button></td>
    </tr>`;
  }

  function planPageBatchInfo() {
    const ids = [...planPageSel];
    const sub = ids.reduce((s, rid) => {
      const it = plan.items.find(x => x.record_id === rid);
      const row = state.rows.find(r => r.record_id === rid);
      return s + (it && row && row.placement_cost ? row.placement_cost * it.qty : 0);
    }, 0);
    return `已选 ${ids.length} 件 · 小计容量 ${sub.toLocaleString()}`;
  }

  function planPageRender() {
    if (!planPageEl) return;
    // 三态：目录数据未就绪（加载中 / 失败重试）
    if (!state.rows.length) {
      planPageEl.innerHTML = state.loadError
        ? `<div class="dh-error"><div class="dh-error-text">${esc(state.loadError)}</div><button type="button" class="btn btn-primary" id="dhPpRetry">重试</button></div>`
        : '<div class="dh-loading">数据加载中…</div>';
      const retry = planPageEl.querySelector('#dhPpRetry');
      if (retry) retry.onclick = () => { state.loadError = ''; planPageRender(); boot(); };
      return;
    }
    // 勾选手残清理（已移除的件不再选中）
    [...planPageSel].forEach(rid => { if (!plan.items.some(it => it.record_id === rid)) planPageSel.delete(rid); });

    const n = planCount();
    const cap = planCapacity();
    const capPct = Math.min(100, Math.round(cap / DECOR_PLAN_CAPACITY_REF * 100));
    const logged = planLoggedIn();
    const options = plan.plans.map(p =>
      `<option value="${p.id}" ${String(p.id) === String(plan.currentId) ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
    const selInfo = planPageBatchInfo();

    planPageEl.innerHTML = `<div class="dh-pp">
      <div class="dh-pp-head">
        <h2 class="dh-pp-title">我的方案单</h2>
        ${logged ? `<div class="dh-pp-ctl">
          <select class="dh-pp-plan-sel" id="dhPpPlanSel" aria-label="切换方案">${options}</select>
          <button type="button" class="btn btn-sm" id="dhPpCreate">＋ 新建方案</button>
          <button type="button" class="btn btn-sm" id="dhPpRename">重命名</button>
          <button type="button" class="btn btn-sm btn-danger" id="dhPpDelete">删除</button>
        </div>` : ''}
        <button type="button" class="dh-pp-back" id="dhPpBack">← 返回图鉴</button>
      </div>
      ${plan.notice ? `<div class="dh-pp-notice">${esc(plan.notice)}</div>` : ''}
      <div class="dh-pp-body">
        <div class="dh-pp-main">
          <div class="dh-pp-batch">
            <label class="dh-pp-selall"><input type="checkbox" id="dhPpSelAll"> 全选</label>
            <button type="button" class="btn btn-sm" id="dhPpBatchRm">批量移除</button>
            <button type="button" class="btn btn-sm" id="dhPpBatchInc">批量 +1</button>
            <span class="dh-pp-batch-info" id="dhPpBatchInfo">${esc(selInfo)}</span>
          </div>
          ${plan.items.length ? `<div class="dh-pp-table-wrap"><table class="dh-pp-table">
            <thead><tr><th></th><th>家具</th><th>来源</th><th>数量</th><th>容量·件</th><th>小计</th><th>操作</th></tr></thead>
            <tbody>${plan.items.map(planPageRowHtml).join('')}</tbody>
          </table></div>`
          : `<div class="dh-pp-empty">
              <div class="dh-empty-title">方案单还是空的</div>
              <div class="dh-empty-hint">去图鉴挑几件装饰加入方案单</div>
              <button type="button" class="btn btn-primary" id="dhPpGoDecor">去图鉴挑装饰</button>
            </div>`}
        </div>
        <aside class="dh-pp-side">
          <div class="dh-pp-summary">
            <div class="dh-pp-sum-row">总件数 <b id="dhPpTotal">${n}</b></div>
            <div class="dh-pp-sum-row">容量合计 <b class="${cap > DECOR_PLAN_CAPACITY_REF ? 'dh-pp-over' : ''}">${cap.toLocaleString()}</b> / ${DECOR_PLAN_CAPACITY_REF.toLocaleString()}</div>
            <div class="dh-pp-progress"><div class="dh-pp-progress-bar${cap > DECOR_PLAN_CAPACITY_REF ? ' over' : ''}" style="width:${capPct}%"></div></div>
            ${cap > DECOR_PLAN_CAPACITY_REF ? '<div class="dh-pp-over-hint">已超参考上限（游戏内预算随住宅等级变化，仅提示不阻断）</div>' : ''}
            <button type="button" class="btn btn-primary dh-pp-export" id="dhPpExport">导出</button>
            <button type="button" class="btn dh-pp-share" id="dhPpShare" disabled title="三期社区开放">分享方案</button>
            <div class="dh-pp-sync">${logged ? '云端已同步 · 跨设备可用' : '未登录 · 草稿本地暂存，保存时跳登录'}</div>
          </div>
        </aside>
      </div>
    </div>`;

    // ---- 事件绑定 ----
    const $p = id => planPageEl.querySelector('#' + id);
    $p('dhPpBack').onclick = () => { if (typeof switchPage === 'function') switchPage('decor'); };
    const goDecor = $p('dhPpGoDecor');
    if (goDecor) goDecor.onclick = () => { if (typeof switchPage === 'function') switchPage('decor'); };
    if (logged) {
      const selEl = $p('dhPpPlanSel');
      selEl.dataset.current = String(plan.currentId); // 异步切换落地标记（verify/测试可观测）
      selEl.onchange = e => planActionSwitch(e.target.value);
      $p('dhPpCreate').onclick = planActionCreate;
      $p('dhPpRename').onclick = planActionRename;
      $p('dhPpDelete').onclick = planActionDelete;
    }
    $p('dhPpExport').onclick = planOpenExport;
    // 表格行交互（复用抽屉同源函数）
    [...planPageEl.querySelectorAll('tbody tr')].forEach(tr => {
      const rid = +tr.dataset.rid;
      [...tr.querySelectorAll('[data-step]')].forEach(btn => btn.onclick = () => {
        const cur = plan.items.find(it => it.record_id === rid);
        if (cur) planSetQty(rid, cur.qty + (+btn.dataset.step));
      });
      tr.querySelector('[data-rm]').onclick = () => planRemove(rid);
      tr.querySelector('.dh-pp-sel').onchange = e => {
        if (e.target.checked) planPageSel.add(rid); else planPageSel.delete(rid);
        planPageRender();
      };
    });
    $p('dhPpSelAll').checked = plan.items.length > 0 && plan.items.every(it => planPageSel.has(it.record_id));
    $p('dhPpSelAll').onchange = e => {
      planPageSel.clear();
      if (e.target.checked) plan.items.forEach(it => planPageSel.add(it.record_id));
      planPageRender();
    };
    $p('dhPpBatchRm').onclick = () => {
      if (!planPageSel.size) { planToast('先勾选要操作的装饰', true); return; }
      planBatchRemove([...planPageSel]);
      planPageSel.clear();
    };
    $p('dhPpBatchInc').onclick = () => {
      if (!planPageSel.size) { planToast('先勾选要操作的装饰', true); return; }
      planBatchInc([...planPageSel]);
    };
  }

  // ---- 三态 ----
  function showError(msg) {
    state.loadError = msg || '数据加载失败'; // 任务书 #58-WP2-1：独立页失败重试同源消费
    main.innerHTML = `<div class="dh-error">
      <div class="dh-error-text">${esc(msg || '数据加载失败')}</div>
      <button type="button" class="btn btn-primary" id="dhRetry">重试</button>
    </div>`;
    $('dhRetry').onclick = () => { main.innerHTML = '<div class="dh-loading">数据加载中…</div>'; boot(); };
    if (planPageEl) planPageRender();
  }

  // ---- 启动 ----
  let booted = false;
  async function boot() {
    filterBar = $('dhFilterBar');
    main = $('dhMain');
    state.loadError = '';
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
    planInit(); // 任务书 #58-WP1：抽屉初始化（草稿/云端合并三分支）+ 入口徽标
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
    // 任务书 #58-WP2-1：方案单独立页（应用壳专用；公示壳不调用，惰性不触发）
    mountPlanPage(el) { mountPlanPage(el); },
    activatePlanPage() { activatePlanPage(); },
    // 任务书 #58-WP1：导出弹窗脏检查（app 壳登记 modalDirtyChecks 用，规范 4.6）
    planExportIsDirty() { return planExportIsDirty(); },
  };
  if (document.body.classList.contains('data-decor-body')) window.DecorCatalog.mount(document);
})();
