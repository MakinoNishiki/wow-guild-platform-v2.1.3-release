// REQ-203: optional author quantities and a reader's private, explicitly entered available quantities.
window.HousingBuildFurniture = (() => {
  'use strict';
  const userId = () => window.CloudSync?.getCachedUser()?.id || '';
  const maxKinds = 500, maxQuantity = 9999;
  let editing = null, activeDetail = null, tip = null, tipTimer = null, tipAnchor = null;
  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function button(text, action) {
    const node = el('button', text, 'btn btn-sm'); node.type = 'button'; node.onclick = action; return node;
  }
  const catalogLink = id => '#/house/decor/item/' + id;
  function hideTip() { clearTimeout(tipTimer); tipAnchor?.removeAttribute('aria-describedby'); tipAnchor=null; tip?.remove(); tip = null; }
  function positionTip() {
    if (!tip || !tipAnchor) return;
    const rect=tipAnchor.getBoundingClientRect(), bounds=tip.getBoundingClientRect();
    if (!tipAnchor.isConnected || rect.bottom<0 || rect.top>innerHeight) { hideTip(); return; }
    tip.style.left=Math.max(8,Math.min(rect.left,innerWidth-bounds.width-8))+'px';
    tip.style.top=Math.max(8,rect.bottom+bounds.height+12<=innerHeight?rect.bottom+8:rect.top-bounds.height-8)+'px';
  }
  function bindSource(link, row) {
    if (!row) return;
    const show = () => {
      clearTimeout(tipTimer);
      if (tip?.dataset.record === String(row.record_id)) return;
      hideTip();
      tip = el('aside', null, 'hbf-source-popover');
      tip.id = 'hbfSourceTooltip'; tipAnchor=link; link.setAttribute('aria-describedby',tip.id);
      tip.dataset.record = row.record_id;
      tip.setAttribute('role', 'tooltip');
      tip.append(el('strong', row.name), el('p', '图鉴参考 · 价格以游戏内为准', 'hbf-hint'));
      const source = el('div', null, 'dh-src-list'); source.innerHTML = DecorCatalog.sourceHtml(row);
      tip.append(source);
      tip.onmouseenter = () => clearTimeout(tipTimer);
      tip.onmouseleave = () => { tipTimer = setTimeout(hideTip, 120); };
      const parentModal = link.closest('.modal-overlay');
      tip.style.zIndex = String(parentModal ? (Number(getComputedStyle(parentModal).zIndex) || 1000) + 1 : 80);
      document.body.append(tip);
      positionTip();
    };
    link.onmouseenter = link.onfocus = show;
    link.onmouseleave = () => { tipTimer = setTimeout(hideTip, 120); };
    link.onblur = hideTip;
    link.addEventListener('click', hideTip);
  }
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hideTip(); });
  window.addEventListener('hashchange', hideTip);
  window.addEventListener('scroll', positionTip, true);
  window.addEventListener('resize', positionTip);
  function furnitureName(row, id) {
    const link = el('a', row?.name || '家具 #' + id, 'hbf-furniture-name');
    link.href = catalogLink(id);
    link.setAttribute('aria-label', (row?.name || '家具 #' + id) + '，查看图鉴');
    bindSource(link, row);
    return link;
  }
  function quantityInput(value, label, optional) {
    const input = el('input', null, 'form-input hbf-quantity');
    input.type = 'number'; input.min = optional ? '0' : '1'; input.max = String(maxQuantity); input.step = '1';
    input.required = !optional; input.value = value == null ? '' : String(value);
    input.placeholder = optional ? '未知' : '';
    input.setAttribute('aria-label', label);
    return input;
  }
  function mountEditor(row) {
    clearEditor();
    const host = el('section', null, 'hbf-editor form-group'); host.id = 'hbFurniture';
    document.getElementById('hbFormError').before(host);
    const initial = (row?.furniture_items || []).map(item => ({ record_id: item.record_id, quantity: item.quantity }));
    const context = editing = { host, initial: JSON.stringify(initial), items: initial.map(item => ({...item})), rows: [], loading: false, busy: false, preview:null, bulkConfirmed:false };
    const title = el('h3', '家具用量（选填）');
    const hint = el('p', '可只发布作品和蓝图码；附上清单后，浏览者能查看用量、来源和参考价格。最多 500 种家具。', 'hbf-hint');
    const label = el('label', '从图鉴选择家具', 'form-label'); label.htmlFor = 'hbFurnitureSearch';
    const search = el('input', null, 'form-input'); search.id = 'hbFurnitureSearch'; search.placeholder = '输入家具名称'; search.autocomplete = 'off';
    const matches = el('div', null, 'hbf-search-results'); matches.setAttribute('aria-label', '匹配的家具');
    const status = el('p', '', 'hbf-hint'); status.setAttribute('role', 'status');
    const list = el('div', null, 'hbf-editor-list');
    host.append(title, hint, label, search, matches, status, list);
    const bulk=el('details',null,'hbf-bulk');
    bulk.append(el('summary','批量附清单（选填）'),el('p','已有游戏内清单可粘贴到这里；只纳入类型 3 的家具，先预览再确认。其他类型和未收录编号会列出跳过，不影响只用蓝图码发布作品。','hbf-hint'));
    const bulkLabel=el('label','游戏内清单','form-label'); bulkLabel.htmlFor='hbFurnitureBulk';
    const bulkText=el('textarea',null,'form-input'); bulkText.id='hbFurnitureBulk'; bulkText.rows=4; bulkText.maxLength=300000; bulkText.placeholder='[[3,126,3],[3,2105,2]]';
    const bulkStatus=el('p','','hbf-hint'); bulkStatus.setAttribute('role','status');
    const preview=el('div',null,'hbf-bulk-preview');
    const parse=button('解析清单预览',parseBulk); parse.dataset.catalogRequired='true';
    bulk.append(bulkLabel,bulkText,parse,bulkStatus,preview);host.append(bulk);
    bulkText.oninput=()=>{context.preview=null;context.bulkConfirmed=false;preview.replaceChildren();bulkStatus.textContent='内容已修改，请重新解析预览。';};
    function parseBulk() {
      context.preview=null;context.bulkConfirmed=false;preview.replaceChildren();
      try {
        const text=bulkText.value.trim();
        if(text.length>300000) throw Error('清单过长，请按作品拆分后再试。');
        const entries=JSON.parse(text);
        if(!Array.isArray(entries)||!entries.length||entries.length>5000) throw Error('请粘贴由 [类型,编号,数量] 组成的清单，最多 5000 行。');
        const known=new Map(context.rows.map(row=>[row.record_id,row]));
        const found=[], unknown=[], skipped=new Map(), seen=new Set();
        entries.forEach((entry,index)=>{
          if(!Array.isArray(entry)||entry.length!==3||entry.some(value=>!Number.isSafeInteger(value))||entry[0]<1||entry[1]<1||entry[1]>2147483647||entry[2]<1||entry[2]>maxQuantity)
            throw Error('第 '+(index+1)+' 行格式有误，请使用 [类型,编号,数量]，数量为 1 至 9999 的整数。');
          const [type,id,quantity]=entry;
          if(type!==3) {skipped.set(type,(skipped.get(type)||0)+1);return;}
          if(seen.has(id)) throw Error('家具编号 '+id+' 重复，请核对后保留一行，避免重复计算用量。');
          seen.add(id);
          if(!known.has(id)) {unknown.push({id,quantity});return;}
          found.push({record_id:id,quantity});
        });
        if(found.length>maxKinds) throw Error('每件作品最多附 500 种家具，请拆分后再试。');
        context.preview=found;
        bulkStatus.textContent='可附 '+found.length+' 种家具，共 '+found.reduce((sum,item)=>sum+item.quantity,0)+' 件。';
        if(skipped.size) preview.append(el('p','跳过非家具：'+Array.from(skipped,([type,count])=>'类型 '+type+'：'+count+' 行').join('；')+'。','hbf-hint'));
        if(unknown.length) preview.append(el('p','跳过未收录家具编号：'+unknown.map(item=>item.id+' × '+item.quantity).join('、')+'。不会按同名或其他类型猜测。','hbf-hint'));
        if(!found.length) return;
        const table=el('table',null,'hbf-table');table.innerHTML='<thead><tr><th>家具</th><th>用量</th></tr></thead>';
        const tbody=el('tbody');found.forEach(item=>{const row=el('tr');row.append(el('td',known.get(item.record_id).name),el('td',String(item.quantity)));tbody.append(row);});
        table.append(tbody);preview.append(table,el('p','确认后更新相同家具的用量，未导入的现有家具仍保留；还需保存作品才会生效。','hbf-hint'),button('确认附入清单',()=>{
          if(!context.preview||context.busy)return;
          const merged=new Map(context.items.map(item=>[item.record_id,item]));context.preview.forEach(item=>merged.set(item.record_id,{...item}));
          if(merged.size>maxKinds){bulkStatus.textContent='合并后超过 500 种家具，当前清单未变更。';return;}
          context.items=Array.from(merged.values());context.preview=null;context.bulkConfirmed=true;preview.replaceChildren();bulkStatus.textContent='已附入当前表单，请保存作品。';drawList();drawMatches();
        }));
      } catch(error) {bulkStatus.textContent=(error instanceof SyntaxError?'清单格式无法识别，请粘贴完整的 [类型,编号,数量] 数组。':error.message)+' 当前家具清单未变更。';}
    }
    function drawList() {
      list.replaceChildren();
      if (!context.items.length) { list.append(el('p', '尚未附家具清单，不影响保存或发布。', 'hbf-hint')); return; }
      const table = el('table', null, 'hbf-table');
      table.innerHTML = '<thead><tr><th>家具</th><th>用量</th><th>操作</th></tr></thead>';
      const body = el('tbody');
      for (const item of context.items) {
        const decor = context.rows.find(value => value.record_id === item.record_id);
        const tr = el('tr'); tr.dataset.recordId = item.record_id;
        const name = el('td');
        // 编辑中保留表单；另开图鉴不会丢弃尚未保存的作品。
        const link = furnitureName(decor, item.record_id); link.target = '_blank'; link.rel = 'noopener'; name.append(link);
        const qty = el('td'), control = quantityInput(item.quantity, (decor?.name || '家具 #' + item.record_id) + '用量', false);
        control.oninput = () => { item.quantity = control.value === '' ? '' : Number(control.value); };
        qty.append(control);
        const actions = el('td'); actions.append(button('移除', () => { context.items = context.items.filter(value => value !== item); drawList(); drawMatches(); }));
        tr.append(name, qty, actions); body.append(tr);
      }
      table.append(body); list.append(table); setBusy(context.busy);
    }
    function drawMatches() {
      matches.replaceChildren();
      const keyword = search.value.trim().toLocaleLowerCase();
      if (!keyword || context.loading) return;
      const results = context.rows.filter(value => value.name.toLocaleLowerCase().includes(keyword)).slice(0, 20);
      if (!results.length) { matches.append(el('p', '没有匹配家具，请尝试完整名称。', 'hbf-hint')); return; }
      for (const decor of results) {
        const added = context.items.some(item => item.record_id === decor.record_id);
        const add = button((added ? '已添加 · ' : '添加 · ') + decor.name, () => {
          if (context.items.length >= maxKinds) { status.textContent = '每件作品最多附 500 种家具。'; return; }
          context.items.push({ record_id: decor.record_id, quantity: 1 }); drawList(); drawMatches();
        });
        add.disabled = added || context.busy; add.dataset.addFurniture = decor.record_id; matches.append(add);
      }
    }
    async function load() {
      context.loading = true; search.disabled = true; status.textContent = '正在读取家具图鉴…';
      try {
        const rows = await DecorCatalog.readRows();
        if (editing !== context) return;
        context.rows = rows.filter(value => value.entry_type === 1);
        status.textContent = ''; drawList();
      } catch (error) {
        if (editing !== context) return;
        status.replaceChildren(el('span', '图鉴暂时无法读取，已有清单已保留。'), button('重试', load));
      } finally {
        context.loading = false;
        if (editing === context) { setBusy(context.busy); drawMatches(); }
      }
    }
    search.oninput = drawMatches;
    drawList(); load();
  }
  function editorValue() {
    if(editing?.host.querySelector('#hbFurnitureBulk')?.value.trim() && !editing.bulkConfirmed) throw new Error('批量清单尚未确认，请解析预览并确认附入；也可清空批量文本后继续保存。');
    const items = editing?.items || [];
    if (items.length > maxKinds || items.some(item => !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > maxQuantity)) {
      throw new Error('家具用量请填写 1 至 9999 的整数。');
    }
    return items.map(item => ({record_id:item.record_id,quantity:item.quantity}));
  }
  function setBusy(busy) {
    if (!editing) return;
    editing.busy = !!busy;
    editing.host.querySelectorAll('input,button,textarea').forEach(control => { control.disabled = !!busy || ((control.id === 'hbFurnitureSearch' || control.dataset.catalogRequired) && (editing.loading || !editing.rows.length)) || control.textContent.startsWith('已添加 · '); });
  }
  function changed() { return !!editing && (JSON.stringify(editing.items) !== editing.initial || !!editing.host.querySelector('#hbFurnitureBulk')?.value.trim()); }
  function clearEditor() { editing?.host.remove(); editing = null; hideTip(); }
  async function request(action, input) {
    const owner = userId(), token = await CloudSync.getAccessToken();
    if (!owner || !token || owner !== userId()) throw new Error('请登录后保存自己的可用量');
    const response = await fetch('/api/housing-build-supplies/' + action + (action === 'read' ? '?id=' + encodeURIComponent(input.id) : ''), {
      method: action === 'read' ? 'GET' : 'POST', cache: 'no-store',
      headers: {Authorization:'Bearer ' + token, 'Content-Type':'application/json'},
      ...(action === 'read' ? {} : {body:JSON.stringify(input)})
    });
    const result = await response.json();
    if (owner !== userId()) throw new Error('登录账号已切换，请重新打开作品');
    if (!response.ok) throw new Error(result.message || '可用量暂时无法保存，请重试');
    return result;
  }
  function mountDetail(host, work) {
    const previous = activeDetail;
    if (previous) previous.alive = false;
    const items = work.furniture_items || [];
    const section = el('section', null, 'hbf-detail');
    section.append(el('h3', '家具用量'));
    host.append(section);
    if (!items.length) { section.append(el('p', '作者尚未附家具清单。蓝图码不会自动生成用量。', 'hbf-hint')); return; }
    section.append(el('p', '作者提供的用量；悬浮家具名称可看来源、地点和参考价格，点击可查看图鉴。', 'hbf-hint'));
    const context = activeDetail = { alive:true, owner:userId(), section, revision:0, available:{}, saved:{}, rows:[], saving:false, readFailed:false };
    const table = el('table', null, 'hbf-table'); table.innerHTML = '<thead><tr><th>家具</th><th>用量</th><th>本次可用量</th><th>还缺</th></tr></thead>';
    const body = el('tbody'), status = el('p', '正在读取图鉴…', 'hbf-hint'), summary = el('p', '', 'hbf-hint');
    status.setAttribute('role','status'); summary.setAttribute('role','status'); table.append(body); section.append(table, summary, status);
    const editable = !!context.owner;
    const save = button('保存我的可用量', saveAvailable);
    if (editable) section.append(el('p', '仅自己可见。本次可用量由你确认填写，不代表游戏实时库存；留空为未知，填 0 表示本次没有。', 'hbf-hint'), save);
    else section.append(button('登录后记录我的可用量', () => window.iaOpenAuth()));
    const current = () => context.alive && section.isConnected && context.owner === userId();
    function updateTotals() {
      let missing = 0, unknown = 0;
      for (const item of items) {
        const known = Object.hasOwn(context.available, String(item.record_id));
        const qty = known ? context.available[item.record_id] : null;
        const valid = known && Number.isSafeInteger(qty) && qty >= 0 && qty <= maxQuantity;
        const cell = body.querySelector('[data-missing="' + item.record_id + '"]');
        if (cell) cell.textContent = valid ? String(Math.max(0,item.quantity-qty)) : known ? '待核对' : '未知';
        if (valid) missing += Math.max(0,item.quantity-qty); else unknown++;
      }
      summary.textContent = (unknown === items.length ? '缺件数未知' : '已确认还缺 ' + missing + ' 件') + (unknown ? ' · ' + unknown + ' 种可用量未知，未计入缺件合计' : ' · 全部家具已填写本次可用量');
    }
    function draw() {
      body.replaceChildren();
      items.forEach(item => {
        const row = context.rows.find(value => value.record_id === item.record_id && value.entry_type === 1);
        const tr = el('tr'); tr.dataset.recordId = item.record_id;
        const name = el('td'); name.append(furnitureName(row,item.record_id));
        const quantity = el('td', String(item.quantity));
        const available = el('td');
        if (editable) {
          const input = quantityInput(context.available[item.record_id], (row?.name || '家具 #' + item.record_id) + '本次可用量', true);
          input.dataset.available = item.record_id; input.disabled = context.saving || context.readFailed;
          input.oninput = () => {
            if (input.value === '') delete context.available[item.record_id];
            else context.available[item.record_id] = Number(input.value);
            status.textContent = '有未保存的可用量'; updateTotals();
          };
          available.append(input);
        } else available.textContent = '未知';
        const missing = el('td'); missing.dataset.missing = item.record_id;
        tr.append(name,quantity,available,missing); body.append(tr);
      });
      save.disabled = context.saving || context.readFailed; updateTotals();
    }
    async function load() {
      context.readFailed = true; draw();
      const [catalog, supplies] = await Promise.allSettled([DecorCatalog.readRows(), editable ? request('read',{id:work.id}) : Promise.resolve({available:{},revision:0})]);
      if (!current()) return;
      if (catalog.status === 'fulfilled') context.rows = catalog.value;
      if (supplies.status === 'fulfilled') {
        context.available = {...supplies.value.available}; context.saved = {...context.available}; context.revision = supplies.value.revision;
        context.readFailed = false;
        status.textContent = supplies.value.updated_at ? '我的可用量更新于 ' + new Date(supplies.value.updated_at).toLocaleString('zh-CN') : '';
      } else status.replaceChildren(el('span', supplies.reason.message), button('重新读取', load));
      if (catalog.status === 'rejected') status.append(el('span', ' 图鉴暂不可用，家具编号及用量仍保留。'), button('重试图鉴', reloadCatalog));
      draw();
    }
    async function reloadCatalog() {
      try {
        const rows = await DecorCatalog.readRows();
        if (!current()) return;
        context.rows = rows; draw();
        status.textContent = '图鉴已读取；本次可用量输入保持不变。';
      } catch(error) {
        if (current()) status.replaceChildren(el('span','图鉴暂时无法读取，输入已保留。'),button('重试图鉴',reloadCatalog));
      }
    }
    async function saveAvailable() {
      if (!current() || context.saving || context.readFailed) return;
      if (!Array.from(body.querySelectorAll('input')).every(input=>input.reportValidity())) return;
      const available = Object.fromEntries(items.filter(item=>Object.hasOwn(context.available,String(item.record_id))).map(item=>[item.record_id,context.available[item.record_id]]));
      const payload = {id:work.id,revision:context.revision,available};
      context.saving = true; status.textContent = '正在保存…'; draw();
      try {
        const result = await cloudCrud('housingBuildSupply','save',payload,{silentError:true});
        if (!current()) return;
        context.available = {...result.row.available}; context.saved = {...context.available}; context.revision = result.row.revision;
        status.textContent = '我的可用量已保存 · ' + new Date(result.row.updated_at).toLocaleString('zh-CN');
      } catch(error) { if (current()) status.textContent = error.message || '保存失败，输入已保留，请重试'; }
      finally { context.saving = false; if (current()) draw(); }
    }
    draw(); load();
  }
  function reset() { clearEditor(); if(activeDetail) {activeDetail.alive=false;activeDetail.section.replaceChildren();activeDetail=null;} }
  return {mountEditor,editorValue,changed,clearEditor,setBusy,mountDetail,reset,request};
})();
