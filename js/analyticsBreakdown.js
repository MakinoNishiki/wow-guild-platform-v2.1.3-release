// 数据中心访问统计与本地交互稿共用的只读排行和来源明细。
const ANX_EVENT_LABEL = {
  page_view: '浏览页面', tab_click: '点击导航页签', user_register: '注册账号',
  guild_create: '创建公会', guild_join: '加入公会', attendance_save: '保存考勤',
  loot_assign: '保存装备分配', wishlist_add: '添加心愿装备', smart_import: '完成智能导入',
  decor_plan_add: '将家具加入方案单', decor_plan_save: '保存方案单',
  decor_plan_create: '创建方案单', decor_plan_switch: '切换方案单',
  decor_plan_export_text: '复制方案单文本', decor_plan_export_image: '导出方案单图片'
};
function anxEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function anxBarsHtml(items, getLabel, getV1, getV2, v1Name, v2Name) {
  if (!items.length) return '<div class="anx-panel-empty">暂无数据</div>';
  const max = Math.max(1, ...items.map(getV1));
  return items.map(it => {
    const v1 = getV1(it), v2 = getV2(it);
    return `<div class="anx-bar-row">
      <span class="anx-bar-label" title="${anxEsc(getLabel(it))}">${anxEsc(getLabel(it))}</span>
      <span class="anx-bar-track"><span class="anx-bar-fill" style="width:${((v1 / max) * 100).toFixed(1)}%"></span></span>
      <span class="anx-bar-num">${v1} <em>${v1Name}</em> · ${v2} <em>${v2Name}</em></span>
    </div>`;
  }).join('');
}

function anxTableHtml(headers, rows) {
  if (!rows.length) return '<div class="anx-panel-empty">暂无数据</div>';
  return `<table class="anx-table"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

const ANX_GRAIN_LABEL = { hour: '小时', day: '天', week: '周', month: '月' };
const ANX_HISTORY_PAGE_SIZE = 8;

function anxSourceHistoryHtml(refs, state) {
  if (!refs.length) return '';
  if (!refs.every(ref => Array.isArray(ref.periods))) {
    return '<p class="anx-count-note">来源分时明细暂未就绪。</p>';
  }
  const options = refs.map((ref, i) =>
    `<option value="${i}"${ref.ref_dom === state.sourceName ? ' selected' : ''}>${anxEsc(ref.ref_dom)}</option>`
  ).join('');
  return `<details class="anx-source-history"${state.sourceOpen ? ' open' : ''}>
    <summary>按时间查看</summary>
    <div class="anx-source-picker"><label for="anxSourceSelect">访问来源</label>
      <select class="form-select" id="anxSourceSelect">${options}</select></div>
    <p class="anx-count-note">按${ANX_GRAIN_LABEL[state.appliedGrain]}统计（北京时间），最新在前。每段访客单独去重。</p>
    <div class="anx-source-rows"></div>
    <div class="anx-source-pager" hidden>
      <button type="button" class="btn btn-secondary" data-step="-1">较新</button>
      <span aria-live="polite"></span>
      <button type="button" class="btn btn-secondary" data-step="1">较早</button>
    </div>
  </details>`;
}

function anxBindSourceHistory(data, state) {
  const details = document.querySelector('#anxBody .anx-source-history');
  if (!details) return;
  const select = details.querySelector('select');
  const pager = details.querySelector('.anx-source-pager');
  const series = data.series || [];
  const pageCount = Math.max(1, Math.ceil(series.length / ANX_HISTORY_PAGE_SIZE));
  const grain = state.appliedGrain;
  let periods;
  function selectSource() {
    const source = data.refs[select.selectedIndex];
    state.sourceName = source.ref_dom;
    periods = new Map(source.periods.map(p => [p.bucket, p]));
  }
  function render() {
    if (!periods) selectSource();
    const page = Math.min(state.sourcePage, pageCount - 1);
    state.sourcePage = page;
    const end = series.length - page * ANX_HISTORY_PAGE_SIZE;
    const rows = series.slice(Math.max(0, end - ANX_HISTORY_PAGE_SIZE), end).reverse().map(({ bucket }) => {
      const time = grain === 'hour' ? bucket.slice(0, 16).replace('T', ' ') :
        grain === 'month' ? bucket.slice(0, 7) : bucket.slice(0, 10);
      const p = periods.get(bucket);
      return [anxEsc(time), p?.pv ?? 0, p?.uv ?? 0];
    });
    details.querySelector('.anx-source-rows').innerHTML = anxTableHtml(
      [grain === 'week' ? '周起始日' : '时间', '浏览量 PV', '访客数 UV'], rows);
    pager.hidden = pageCount <= 1;
    pager.querySelector('span').textContent = `${page + 1} / ${pageCount}`;
    pager.querySelector('[data-step="-1"]').disabled = page === 0;
    pager.querySelector('[data-step="1"]').disabled = page + 1 === pageCount;
  }
  details.addEventListener('toggle', () => {
    if (!details.isConnected) return;
    state.sourceOpen = details.open;
    if (details.open) render();
  });
  select.addEventListener('change', () => { selectSource(); state.sourcePage = 0; render(); });
  pager.addEventListener('click', event => {
    const button = event.target.closest('button[data-step]');
    if (!button || button.disabled) return;
    state.sourcePage += Number(button.dataset.step);
    render();
  });
  if (details.open) render();
}

function anxBreakdownPanelsHtml(d, state) {
  const refs = d.refs || [];
  const events = (d.events || []).map(({ event, cnt }) => {
    const code = anxEsc(event);
    const name = Object.hasOwn(ANX_EVENT_LABEL, event) ? ANX_EVENT_LABEL[event] : `其他事件（${code}）`;
    return [`<span title="${code}">${name}</span>`, cnt];
  });
  return `
      <div class="card anx-panel">
        <div class="anx-panel-title">来源域 TOP10</div>
        ${anxBarsHtml(refs, it => it.ref_dom || '直接访问', it => it.pv || 0, it => it.uv || 0, 'PV', 'UV')}
        ${anxSourceHistoryHtml(refs, state)}
      </div>
      <div class="card anx-panel">
        <div class="anx-panel-title">事件 TOP</div>
        ${anxTableHtml(['事件', '次数'], events)}
      </div>`;
}
