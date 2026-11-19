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
  const maxPhotos = 8;
  function dataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('无法读取图片，请重新选择。'));
      reader.readAsDataURL(blob);
    });
  }
  async function preparePhoto(file) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) {
      throw new Error('请选择不超过 20 MB 的 JPG、PNG 或 WebP 图片。');
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
  function renderPreview(message = '') {
    const preview = byId('hbPreview');
    const previousImages = new Map(Array.from(preview.children, tile => [tile.dataset.photoId, tile.querySelector('img')]));
    preview.replaceChildren();
    editor.photos.forEach((photo, index) => {
      const tile = element('div', null, 'hb-tile');
      tile.dataset.photoId = photo.id;
      const picker = element('input');
      picker.type = 'file';
      picker.accept = byId('hbPhotos').accept;
      picker.hidden = true;
      picker.onchange = () => readPhotoInput(picker, index);
      const replace = button('', () => picker.click());
      replace.className = 'hb-replace';
      replace.setAttribute('aria-label', '更换第 ' + (index + 1) + ' 张截图');
      replace.append(previousImages.get(photo.id) || photoImage(photo, '', true), element('span', '更换', 'hb-replace-label'));
      if (photo.data) replace.append(element('span', '待保存', 'hb-pending'));
      tile.append(replace, picker);
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
    byId('hbPhotoStatus').textContent = [editor.photos.length ? '已选 ' + editor.photos.length + ' / ' + maxPhotos + ' 张' : '', message].filter(Boolean).join(' · ');
  }
  function readPhotoInput(input, replaceAt = null) {
    const files = Array.from(input.files);
    input.value = '';
    selectPhotos(files, replaceAt);
  }
  async function selectPhotos(files, replaceAt = null) {
    const context = editor;
    if (!context || saving || !files.length) return;
    const error = byId('hbFormError');
    if (replaceAt === null && context.photos.length + context.processingCount +
        context.queuedPhotos.reduce((count, batch) => count + batch.length, 0) + files.length > maxPhotos) {
      error.textContent = '每个作品最多 8 张截图，请减少所选图片或点击已有截图更换。';
      return;
    }
    if (context.preparing) {
      if (replaceAt === null) context.queuedPhotos.push(files);
      return;
    }
    error.textContent = '';
    context.preparing = true;
    context.processingCount = replaceAt === null ? files.length : 0;
    byId('hbPhotoStatus').textContent = replaceAt === null ? '正在处理截图…' : '正在更换第 ' + (replaceAt + 1) + ' 张截图…';
    setEditorControls();
    let message = '';
    try {
      const prepared = [];
      for (const file of files) prepared.push(await preparePhoto(file));
      if (editor !== context) return;
      if (replaceAt === null) context.photos.push(...prepared);
      else {
        context.photos[replaceAt] = prepared[0];
        message = '第 ' + (replaceAt + 1) + ' 张截图已更换，保存后生效。';
      }
    } catch (e) {
      if (editor === context) {
        error.textContent = e.message;
        if (replaceAt !== null) message = '更换失败，已保留第 ' + (replaceAt + 1) + ' 张原图。';
      }
    } finally {
      context.preparing = false;
      context.processingCount = 0;
      if (editor === context) {
        renderPreview(message);
        setEditorControls();
        if (replaceAt !== null) byId('hbPreview').querySelectorAll('.hb-replace')[replaceAt].focus({ preventScroll: true });
        if (context.queuedPhotos.length) selectPhotos(context.queuedPhotos.shift());
      }
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
      initialIds: ids.join(','), photos: ids.map(id => ({ id })), preparing: false, processingCount: 0, queuedPhotos: [] };
    byId('hbEditorTitle').textContent = row ? '编辑作品' : '创建作品';
    byId('hbTitle').value = row?.title || '';
    byId('hbDescription').value = row?.description || '';
    byId('hbCode').value = row?.blueprint_code || '';
    byId('hbCodePublic').checked = row?.code_public || false;
    byId('hbAllowCopy').checked = !!row?.allow_copy;
    byId('hbCodePublic').onchange = setEditorControls;
    byId('hbForm').oninput = () => { byId('hbFormError').textContent = ''; };
    byId('hbPhotos').onchange = event => readPhotoInput(event.currentTarget);
    const form = byId('hbForm');
    const photoZone = byId('hbPhotoZone');
    photoZone.classList.remove('hb-dragging');
    form.onpaste = event => {
      const data = event.clipboardData;
      if (!data || !data.files.length) return;
      if (event.target.matches('input:not([type=file]), textarea') && data.getData('text/plain')) return;
      event.preventDefault();
      selectPhotos(Array.from(data.files));
    };
    form.ondragover = event => {
      if (!event.dataTransfer.types.includes('Files')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = saving ? 'none' : 'copy';
      photoZone.classList.toggle('hb-dragging', !saving);
    };
    form.ondragleave = event => {
      if (!form.contains(event.relatedTarget)) photoZone.classList.remove('hb-dragging');
    };
    form.ondrop = event => {
      photoZone.classList.remove('hb-dragging');
      if (!event.dataTransfer.types.includes('Files')) return;
      event.preventDefault();
      selectPhotos(Array.from(event.dataTransfer.files));
    };
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
  function cardAlbum(row, ids, mine) {
    const cover = element('div', null, 'hb-cover hb-card-album');
    cover.setAttribute('role', 'group');
    cover.setAttribute('aria-label', row.title + '的装修截图');
    const canOpen = !mine || row.published;
    const stage = canOpen ? link('', base + '/' + row.id) : element('div');
    stage.className = 'hb-card-stage';
    if (canOpen) {
      stage.draggable = false;
      stage.setAttribute('aria-label', '查看作品详情：' + row.title);
    }
    const dots = element('div', null, 'hb-card-dots');
    dots.setAttribute('role', 'group');
    dots.setAttribute('aria-label', '选择截图');
    const status = element('span', null, 'hb-card-position');
    status.setAttribute('role', 'status');
    let index = -1;
    let start = null;
    let dragged = false;
    function select(nextIndex) {
      if (nextIndex === index) return;
      index = nextIndex;
      const position = '第 ' + (index + 1) + ' 张截图，共 ' + ids.length + ' 张';
      const image = photoImage({ id: ids[index] }, row.title + '，' + position, mine);
      image.draggable = false;
      stage.replaceChildren(image);
      Array.from(dots.children).forEach((dot, i) => {
        if (i === index) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
      status.textContent = position;
    }
    function move(step) {
      select((index + step + ids.length) % ids.length);
    }
    cover.append(stage);
    for (const [step, name] of [[-1, '上一张截图'], [1, '下一张截图']]) {
      const turn = button('', () => move(step));
      turn.className = step === -1 ? 'hb-prev-photo' : 'hb-next-photo';
      turn.setAttribute('aria-label', name);
      cover.append(turn);
    }
    ids.forEach((_, i) => {
      const dot = button('', () => select(i));
      dot.className = 'hb-card-dot';
      dot.setAttribute('aria-label', '查看第 ' + (i + 1) + ' 张截图');
      dots.append(dot);
    });
    cover.append(dots, status);
    select(0);
    cover.onpointerdown = event => {
      if (!event.isPrimary || event.button !== 0) return;
      dragged = false;
      start = { id: event.pointerId, x: event.clientX, y: event.clientY };
      const target = event.target.closest('button, a') || stage;
      target.setPointerCapture(event.pointerId);
    };
    cover.onpointermove = event => {
      if (start?.id === event.pointerId && Math.max(Math.abs(event.clientX - start.x), Math.abs(event.clientY - start.y)) > 10) dragged = true;
    };
    cover.onpointerup = event => {
      if (start?.id !== event.pointerId) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      start = null;
      dragged ||= Math.max(Math.abs(dx), Math.abs(dy)) > 10;
      if (Math.abs(dx) >= 35 && Math.abs(dx) > Math.abs(dy) * 1.3) move(dx < 0 ? 1 : -1);
    };
    cover.onpointercancel = cover.onlostpointercapture = event => {
      if (start?.id === event.pointerId) { dragged = true; start = null; }
    };
    // 指针滑动结束后浏览器仍会派发 click。键盘激活的 detail 为零，可正常访问链接和按钮。
    cover.addEventListener('click', event => {
      if (dragged && event.detail > 0) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);
    return cover;
  }
  function work(row, mine, detail) {
    const card = element('article', null, 'hb-work');
    const photos = row.image_ids || [];
    if (!detail && photos.length > 1) card.append(cardAlbum(row, photos, mine));
    else if (!detail && photos.length) {
      const cover = mine && !row.published ? element('div') : link('', base + '/' + row.id);
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
    } else if (detail) {
      if (row.allow_copy === true) {
        const copy = button('复制蓝图码', async () => {
          copy.disabled = true;
          copy.textContent = '正在复制…';
          try {
            await CloudSync.copyHousingCode(row.id);
            showToast('蓝图码已复制', 'success');
          } catch {
            showToast('复制失败，请刷新详情并检查浏览器的剪贴板权限。', 'error');
          } finally {
            copy.textContent = '复制蓝图码';
            copy.disabled = false;
          }
        });
        card.append(copy);
      } else card.append(element('span', row.code_public ? '作者未开放蓝图复制' : '作者仅展示作品', 'hb-byline'));
    }
    return card;
  }
  async function show(route) {
    if (activeRoute !== route) page = 0;
    activeRoute = route;
    const ticket = ++request;
    const mine = route === base + '/mine';
    const detail = !mine && route !== base;
    const back = byId('hbBack');
    back.hidden = !detail;
    back.onclick = () => { location.hash = base; };
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
      if (!detail) {
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
