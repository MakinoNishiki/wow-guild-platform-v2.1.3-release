// REQ-203. Public works and the author's workshop share a route, independent of shopping plans.
window.HousingBuilds = (() => {
  const base = '#/house/community';
  const modal = 'housingBuildEditor';
  const byId = id => document.getElementById(id);
  const userId = () => window.CloudSync?.getCachedUser()?.id || '';
  let activeRoute = '';
  let page = 0;
  let request = 0;
  let editor = null;
  let saving = false;

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function button(label, click) {
    const node = element('button', label, 'btn btn-sm');
    node.type = 'button';
    node.onclick = click;
    return node;
  }
  function link(label, route) {
    const node = element('a', label);
    node.href = route;
    return node;
  }
  function clearEditor() {
    editor = null;
    byId('hbForm').reset();
    byId('hbFormError').textContent = '';
  }
  function edit(row) {
    if (!userId()) { iaOpenAuth(); return; }
    editor = { owner: userId(), id: row?.id || crypto.randomUUID(), revision: row?.revision || 0, published: !!row?.published };
    byId('hbEditorTitle').textContent = row ? '编辑作品' : '创建作品';
    byId('hbTitle').value = row?.title || '';
    byId('hbDescription').value = row?.description || '';
    byId('hbCode').value = row?.blueprint_code || '';
    byId('hbCodePublic').checked = row?.code_public || false;
    byId('hbDraft').textContent = row?.published ? '撤回为草稿' : '保存草稿';
    byId('hbPublish').textContent = row?.published ? '保存修改' : '发布作品';
    byId('hbFormError').textContent = '';
    openModal(modal);
    byId('hbTitle').focus();
  }
  async function save(published) {
    if (!editor || saving || !byId('hbForm').reportValidity()) return;
    const context = editor;
    if (context.owner !== userId()) { closeModal(modal); return; }
    const title = byId('hbTitle').value.trim();
    const code = byId('hbCode').value.trim();
    const error = byId('hbFormError');
    if (!title || !/^[A-Za-z0-9+/=_-]{4,512}$/.test(code)) {
      error.textContent = '请填写作品名，并粘贴游戏复制的完整蓝图码。';
      return;
    }
    if (!published && context.published && !confirm('撤回后，访客将无法打开此作品。确定撤回？')) return;
    const payload = { id: context.id, revision: context.revision, title, description: byId('hbDescription').value.trim(),
      blueprint_code: code, code_public: byId('hbCodePublic').checked, published };
    saving = true;
    error.textContent = '';
    const fields = byId('hbForm').querySelectorAll('button, input, textarea');
    fields.forEach(control => { control.disabled = true; });
    try {
      await cloudCrud('housingBuild', 'save', payload, { silentError: true });
      if (context !== editor || context.owner !== userId()) return;
      closeModal(modal);
      showToast(published ? (context.published ? '作品修改已保存' : '作品已发布') : '已保存到我的草稿', 'success');
      page = 0;
      if (location.hash === base + '/mine') await show(location.hash);
      else location.hash = base + '/mine';
    } catch (e) {
      if (context === editor) error.textContent = e.message || '保存失败，请重试';
    } finally {
      saving = false;
      fields.forEach(control => { control.disabled = false; });
    }
  }
  function work(row, mine, detail) {
    const card = element('article', null, 'hb-work');
    const heading = element(detail ? 'h2' : 'h3');
    if (mine || detail) heading.textContent = row.title;
    else heading.append(link(row.title, base + '/' + row.id));
    card.append(heading);
    const byline = mine ? (row.published ? '已发布' : '私有草稿') : row.author_name;
    card.append(element('p', byline + ' · ' + new Date(row.updated_at).toLocaleDateString('zh-CN'), 'hb-byline'));
    if (row.description) card.append(element('p', row.description, 'hb-description'));
    if (mine) {
      card.append(button('编辑作品', () => edit(row)));
      if (row.published) card.append(link('查看公开作品', base + '/' + row.id));
    } else if (row.blueprint_code) {
      card.append(button('复制蓝图码', async () => {
        try {
          await navigator.clipboard.writeText(row.blueprint_code);
          showToast('蓝图码已复制', 'success');
        } catch {
          const field = element('input', null, 'form-input');
          field.readOnly = true;
          field.setAttribute('aria-label', '请手动复制蓝图码');
          field.value = row.blueprint_code;
          card.querySelector('input')?.remove();
          card.append(field);
          field.select();
        }
      }));
    } else card.append(element('span', '作者仅展示作品', 'hb-byline'));
    return card;
  }
  async function show(route) {
    if (activeRoute !== route) page = 0;
    activeRoute = route;
    const ticket = ++request;
    const mine = route === base + '/mine';
    const detail = !mine && route !== base;
    const owner = userId();
    const target = byId('hbResults');
    byId('hbMine').classList.toggle('active', mine);
    byId('hbGallery').classList.toggle('active', !mine);
    byId('hbMine').setAttribute('aria-current', mine ? 'page' : 'false');
    byId('hbGallery').setAttribute('aria-current', !mine && !detail ? 'page' : 'false');
    byId('hbCreate').onclick = () => edit(null);
    byId('hbDraft').onclick = () => save(false);
    byId('hbForm').onsubmit = event => { event.preventDefault(); save(true); };
    if (mine && !owner) {
      target.replaceChildren(element('p', '登录后可查看和管理自己的作品。'), button('登录', iaOpenAuth));
      return;
    }
    target.replaceChildren(element('p', '正在读取作品…'));
    try {
      const result = await CloudSync.readHousingBuilds(mine ? 'mine' : 'gallery', detail ? { id: route.slice(base.length + 1) } : { page });
      if (ticket !== request || (mine && owner !== userId())) return;
      const grid = element('div', null, detail ? 'hb-detail' : 'hb-grid');
      result.rows.forEach(row => grid.append(work(row, mine, detail)));
      target.replaceChildren(grid);
      if (detail) target.append(link('返回公开作品', base));
      else {
        if (!result.rows.length) target.append(element('p', mine ? '还没有自己的作品。' : '暂无公开作品。'));
        function move(step) { page += step; show(route); }
        if (page > 0) target.append(button('上一页', () => move(-1)));
        if (result.hasMore) target.append(button('下一页', () => move(1)));
      }
    } catch (error) {
      if (ticket === request) target.replaceChildren(element('p', error.message), button('重试', () => show(route)));
    }
  }
  function reset() {
    ++request;
    if (editor) closeModal(modal);
    byId('hbResults').replaceChildren();
  }
  return { show, reset, clearEditor, isSaving: () => saving };
})();
