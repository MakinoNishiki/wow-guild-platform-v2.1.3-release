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
  const maxPhotos = 4;
  function dataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('无法读取图片，请重新选择。'));
      reader.readAsDataURL(blob);
    });
  }
  async function preparePhoto(file) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 16 * 1024 * 1024) {
      throw new Error('请选择不超过 16 MB 的 JPG、PNG 或 WebP 图片。');
    }
    const bitmap = await createImageBitmap(file).catch(() => { throw new Error('无法读取这张图片，请重新导出后选择。'); });
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { alpha: false });
      for (const maxEdge of [1920, 1440, 1080, 800]) {
        const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        ctx.fillStyle = '#111519';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.86, 0.68, 0.5]) {
          const jpeg = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
          if (jpeg && jpeg.size <= 175 * 1024) {
            const encoded = await dataUrl(jpeg);
            return { id: crypto.randomUUID(), data: encoded.slice(encoded.indexOf(',') + 1) };
          }
        }
      }
      throw new Error('这张截图过大，请缩小后再次上传。');
    } finally { bitmap.close(); }
  }
  function photoImage(photo, description, mine) {
    const img = element('img');
    img.alt = description;
    img.decoding = 'async';
    if (photo.data) img.src = 'data:image/jpeg;base64,' + photo.data;
    else if (mine) {
      const owner = userId();
      CloudSync.readHousingPhoto(photo.id).then(dataUrl).then(url => {
        if (owner === userId()) img.src = url;
      }).catch(() => { img.alt = '截图暂时无法读取'; });
    } else {
      img.loading = 'lazy';
      img.src = '/api/housing-builds/photo?id=' + encodeURIComponent(photo.id);
    }
    return img;
  }
  function renderPreview() {
    const preview = byId('hbPreview');
    preview.replaceChildren();
    editor.photos.forEach((photo, index) => {
      const tile = element('div', null, 'hb-tile');
      tile.append(photoImage(photo, '装修截图 ' + (index + 1), true));
      const actions = element('div', null, 'hb-tile-actions');
      if (index === 0) actions.append(element('span', '封面'));
      else actions.append(button('设为封面', () => {
        editor.photos.splice(index, 1);
        editor.photos.unshift(photo);
        renderPreview();
      }));
      const remove = button('移除', () => { editor.photos.splice(index, 1); renderPreview(); });
      remove.setAttribute('aria-label', '移除第 ' + (index + 1) + ' 张截图');
      actions.append(remove);
      tile.append(actions);
      preview.append(tile);
    });
    byId('hbPhotoStatus').textContent = editor.photos.length ? '已选 ' + editor.photos.length + ' / ' + maxPhotos + ' 张' : '';
  }
  async function addPhotos() {
    const context = editor;
    const input = byId('hbPhotos');
    const files = Array.from(input.files);
    input.value = '';
    if (!context || context.preparing || !files.length) return;
    const error = byId('hbFormError');
    error.textContent = '';
    if (context.photos.length + files.length > maxPhotos) {
      error.textContent = '每个作品最多 4 张截图，请减少所选图片或移除已有图片。';
      return;
    }
    context.preparing = true;
    byId('hbPhotoStatus').textContent = '正在处理截图…';
    input.disabled = true;
    byId('hbDraft').disabled = byId('hbPublish').disabled = true;
    byId('hbPreview').inert = true;
    try {
      const prepared = [];
      for (const file of files) prepared.push(await preparePhoto(file));
      if (editor === context) context.photos.push(...prepared);
    } catch (e) {
      if (editor === context) error.textContent = e.message;
    } finally {
      context.preparing = false;
      if (editor === context) { renderPreview(); setEditorControls(); }
    }
  }
  function setEditorControls() {
    const busy = saving || !!editor?.preparing;
    byId('hbPhotos').disabled = byId('hbDraft').disabled = byId('hbPublish').disabled = busy;
    byId('hbPreview').inert = busy;
    const visible = byId('hbCodePublic').checked;
    if (!visible) byId('hbAllowCopy').checked = false;
    byId('hbAllowCopy').disabled = busy || !visible;
    byId('hbCode').required = visible;
  }
  function clearEditor() {
    editor = null;
    byId('hbForm').reset();
    byId('hbPreview').replaceChildren();
    byId('hbPhotoStatus').textContent = '';
    byId('hbFormError').textContent = '';
  }
  function edit(row) {
    if (!userId()) { iaOpenAuth(); return; }
    const ids = row?.image_ids || [];
    editor = { owner: userId(), id: row?.id || crypto.randomUUID(), revision: row?.revision || 0, published: !!row?.published,
      initialIds: ids.join(','), photos: ids.map(id => ({ id })), preparing: false };
    byId('hbEditorTitle').textContent = row ? '编辑作品' : '创建作品';
    byId('hbTitle').value = row?.title || '';
    byId('hbDescription').value = row?.description || '';
    byId('hbCode').value = row?.blueprint_code || '';
    byId('hbCodePublic').checked = row?.code_public || false;
    byId('hbAllowCopy').checked = !!row?.allow_copy;
    byId('hbCodePublic').onchange = setEditorControls;
    byId('hbForm').oninput = () => { byId('hbFormError').textContent = ''; };
    byId('hbPhotos').onchange = addPhotos;
    renderPreview();
    setEditorControls();
    byId('hbDraft').textContent = row?.published ? '撤回为草稿' : '保存草稿';
    byId('hbPublish').textContent = row?.published ? '保存修改' : '发布作品';
    byId('hbFormError').textContent = '';
    openModal(modal);
    byId('hbTitle').focus();
  }
  async function save(published) {
    if (!editor || editor.preparing || saving || !byId('hbForm').reportValidity()) return;
    const context = editor;
    if (context.owner !== userId()) { closeModal(modal); return; }
    const title = byId('hbTitle').value.trim();
    const code = byId('hbCode').value.trim();
    const error = byId('hbFormError');
    if (!title || (code && !/^[A-Za-z0-9+/=_-]{4,512}$/.test(code))) {
      error.textContent = !title ? '请填写作品名称。' : '蓝图码格式有误，请粘贴游戏复制的完整原码，或留空只展示作品。';
      return;
    }
    if (!published && context.published && !confirm('撤回后，访客将无法打开此作品。确定撤回？')) return;
    const payload = { id: context.id, revision: context.revision, title, description: byId('hbDescription').value.trim(),
      blueprint_code: code || null, code_public: byId('hbCodePublic').checked, allow_copy: byId('hbAllowCopy').checked,
      screenshots: context.photos, published };
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
      if (editor) setEditorControls();
    }
  }
  function album(row, ids) {
    const figure = element('figure', null, 'hb-album');
    const stage = element('div', null, 'hb-stage');
    const caption = element('figcaption');
    const choices = element('div', null, 'hb-filmstrip');
    function select(index) {
      stage.replaceChildren(photoImage({ id: ids[index] }, row.title + '，装修截图 ' + (index + 1), false));
      caption.textContent = '装修截图 ' + (index + 1) + ' / ' + ids.length;
      Array.from(choices.children).forEach((item, i) => item.setAttribute('aria-pressed', String(i === index)));
    }
    if (ids.length > 1) ids.forEach((id, index) => {
      const choice = button('', () => select(index));
      choice.setAttribute('aria-label', '查看第 ' + (index + 1) + ' 张截图');
      choice.append(photoImage({ id }, '', false));
      choices.append(choice);
    });
    select(0);
    figure.append(stage, caption, choices);
    return figure;
  }
  function work(row, mine, detail) {
    const card = element('article', null, 'hb-work');
    const photos = row.image_ids || [];
    if (!detail && photos.length) {
      const cover = mine ? element('div') : link('', base + '/' + row.id);
      cover.className = 'hb-cover';
      cover.append(photoImage({ id: photos[0] }, row.title + '的封面', mine));
      card.append(cover);
    }
    const heading = element(detail ? 'h2' : 'h3');
    if (mine || detail) heading.textContent = row.title;
    else heading.append(link(row.title, base + '/' + row.id));
    card.append(heading);
    const byline = mine ? (row.published ? '已发布' : '私有草稿') : row.author_name;
    card.append(element('p', byline + ' · ' + new Date(row.updated_at).toLocaleDateString('zh-CN'), 'hb-byline'));
    if (detail && photos.length) card.append(album(row, photos));
    if (row.description) card.append(element('p', row.description, 'hb-description'));
    if (mine) {
      card.append(button('编辑作品', () => edit(row)));
      if (row.published) card.append(link('查看公开作品', base + '/' + row.id));
    } else if (row.blueprint_code) {
      const field = element('input', null, 'form-input hb-visible-code');
      field.value = row.blueprint_code;
      field.readOnly = true;
      field.setAttribute('aria-label', '公开蓝图码');
      if (detail) {
        const label = element('label', '公开蓝图码', 'hb-code-label');
        label.append(field);
        card.append(label);
      }
      if (row.allow_copy) card.append(button('复制蓝图码', async () => {
        try {
          await navigator.clipboard.writeText(row.blueprint_code);
          showToast('蓝图码已复制', 'success');
        } catch {
          if (!field.isConnected) card.append(field);
          field.focus();
          field.select();
          showToast('蓝图码已选中，可手动复制。');
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
  function photosChanged() {
    return !!editor && (editor.preparing || editor.initialIds !== editor.photos.map(photo => photo.id).join(','));
  }
  return { show, reset, clearEditor, photosChanged, isSaving: () => saving };
})();
