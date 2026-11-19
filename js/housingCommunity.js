// REQ-207: public work interactions, platform moderation and account-level receipts.
window.HousingCommunity = (() => {
  const reasons = { spam: '广告或刷屏', abuse: '侮辱或骚扰', unsafe: '危险或违法内容', copyright: '侵权内容', other: '其他' };
  const decisions = { dismiss: '驳回举报', hide_comment: '隐藏留言', hide_work: '下架作品', restore_comment: '恢复留言', restore_work: '解除作品下架限制' };
  const reads = new Set(['summary', 'thread', 'favorites', 'my-report', 'notifications', 'admin-reports']);
  const owner = () => window.CloudSync?.getCachedUser()?.id || '';
  const isAdmin = () => window.CloudSync?.getCachedUser()?.app_metadata?.role === 'superadmin';
  const el = (tag, text, cls) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (cls) node.className = cls; return node; };
  const btn = (text, fn) => { const node = el('button', text, 'btn btn-sm'); node.type = 'button'; node.onclick = fn; return node; };
  function statusNode() { const node = el('p', '', 'hc-status'); node.setAttribute('role', 'status'); return node; }
  function field(text, input) { const label = el('label', text, 'hc-field'); label.append(input); return label; }
  function select(options, name) { const node = el('select'); node.name = name; for (const [value, text] of Object.entries(options)) { const option = el('option', text); option.value = value; node.append(option); } return node; }
  function textArea(name, limit) { const node = el('textarea'); node.name = name; node.maxLength = limit; node.rows = 3; return node; }
  function login() { if (owner()) return true; window.iaOpenAuth?.(); return false; }
  async function request(action, data = {}) {
    const uid = owner();
    if (data.owner !== undefined && data.owner !== uid) throw new Error('账号已切换，请重新打开作品');
    let url = '/api/housing-community/' + action;
    const options = { headers: {} };
    if (uid) {
      const token = await CloudSync.getAccessToken();
      if (!token || uid !== owner()) throw new Error('登录状态已改变，请重新打开');
      options.headers.Authorization = 'Bearer ' + token;
    }
    if (reads.has(action)) {
      const params = new URLSearchParams();
      for (const name of ['id', 'page', 'status']) if (data[name] != null) params.set(name, data[name]);
      url += '?' + params;
    } else {
      options.method = 'POST'; options.headers['Content-Type'] = 'application/json';
      const { owner: ignored, operation, receipt, ...body } = data;
      options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || '社区服务暂时不可用');
    if (uid !== owner()) throw new Error('账号已切换，请重新打开');
    return result;
  }
  async function reload(data) {
    if (['react', 'comment', 'remove-comment'].includes(data.operation)) {
      const state = await request('thread', { id: data.work_id, owner: data.owner });
      if (data.operation === 'react' && state[data.kind === 'like' ? 'liked' : 'favorited'] !== data.active) throw new Error('互动状态尚未确认，请重试');
      if (data.operation === 'comment' && !state.rows.some(row => row.id === data.id)) throw new Error('留言回读尚未确认，请保留内容重试');
      if (data.operation === 'remove-comment' && state.rows.some(row => row.id === data.id)) throw new Error('留言删除尚未确认，请重试');
      return state;
    }
    if (data.operation === 'report' || data.operation === 'moderate') {
      const state = await request(data.operation === 'report' ? 'my-report' : 'admin-reports', { id: data.receipt.id, owner: data.owner });
      if (!state.rows.some(row => row.id === data.receipt.id && (data.operation !== 'moderate' || row.decision === data.decision))) throw new Error('处理回读尚未确认，请重试');
      return state;
    }
    const state = await request('notifications', { owner: data.owner });
    if (state.rows.some(row => !row.is_read && (!data.id || row.id === data.id))) throw new Error('已读状态尚未确认，请重试');
    return state;
  }
  async function mutate(action, data) {
    const result = await cloudCrud('housingCommunity', action, { ...data, owner: owner() }, { silentError: true });
    window.dispatchEvent(new Event('housing-community-change'));
    return result.row;
  }
  function reportForm(host, workId, commentId) {
    if (!login()) return;
    const existing = host.querySelector('.hc-report-form'); if (existing) { existing.querySelector('select').focus(); return; }
    const form = el('form', null, 'hc-form hc-report-form');
    const reason = select(reasons, 'reason'), details = textArea('details', 1000), status = statusNode();
    const id = crypto.randomUUID();
    const submit = btn('提交举报', () => {}); submit.type = 'submit';
    const cancel = btn('取消举报', () => form.remove());
    form.append(el('h4', commentId ? '举报这条留言' : '举报作品'), field('举报原因', reason), field('补充说明（最多 1000 字）', details),
      el('p', '请提供与举报有关的信息。受理和处理结果会发送到用户中心的通知消息。', 'hc-hint'), submit, cancel, status);
    form.onsubmit = async event => {
      event.preventDefault(); submit.disabled = cancel.disabled = reason.disabled = true; details.readOnly = true; status.textContent = '正在提交…';
      try {
        await mutate('report', { id, work_id: workId, comment_id: commentId || null, reason: reason.value, details: details.value });
        form.replaceChildren(el('p', '举报已收到，可在用户中心查看回执。', 'hc-status'));
        window.iaSyncTopRight?.();
      } catch (error) { status.textContent = error.message; } finally { submit.disabled = cancel.disabled = reason.disabled = false; details.readOnly = false; }
    };
    host.append(form); reason.focus();
  }
  function mount(host, work) {
    const root = el('section', null, 'hc-community'); root.dataset.workId = work.id;
    const heading = el('h3', '作品互动'), tools = el('div', null, 'hc-tools'), status = statusNode();
    const comments = el('div', null, 'hc-comments'), pager = el('div', null, 'hc-tools');
    const like = btn('点赞', () => react('like')), favorite = btn('收藏作品', () => react('favorite'));
    const report = btn('举报作品', () => reportForm(root, work.id));
    tools.append(like, favorite, report);
    const form = el('form', null, 'hc-form'), input = textArea('comment', 1000), formStatus = statusNode();
    const submit = btn(owner() ? '发表留言' : '登录后留言', () => {}); submit.type = 'submit';
    form.append(field('留言（最多 1000 字）', input), el('p', '友善交流，不发布广告、骚扰、违法或侵权内容。留言以纯文字展示。', 'hc-hint'), submit, formStatus);
    root.append(heading, tools, status, el('h3', '留言'), form, comments, pager); host.append(root);
    let state = null, page = 0, busy = false, ticket = 0, draftId = null, draftText = '';
    const uid = owner();
    const current = () => root.isConnected && uid === owner();
    function paint(data) {
      state = data; page = data.page;
      like.textContent = (data.liked ? '已点赞' : '点赞') + ' · ' + data.likes;
      favorite.textContent = (data.favorited ? '已收藏作品' : '收藏作品') + ' · ' + data.favorites;
      like.setAttribute('aria-pressed', String(data.liked)); favorite.setAttribute('aria-pressed', String(data.favorited));
      status.textContent = data.comments + ' 条留言'; comments.replaceChildren(); pager.replaceChildren();
      if (!data.rows.length) comments.append(el('p', '还没有留言，来分享你的想法吧。', 'hc-hint'));
      for (const row of data.rows) {
        const item = el('article', null, 'hc-comment'); item.dataset.commentId = row.id;
        item.append(el('p', row.author_name + ' · ' + new Date(row.created_at).toLocaleString('zh-CN'), 'hc-hint'), el('p', row.body, 'hc-body'));
        if (row.mine) item.append(btn('删除留言', async () => {
          if (busy || !confirm('删除这条留言？')) return;
          busy = true;
          try { const fresh = await mutate('remove-comment', { id: row.id, work_id: work.id }); if (current()) paint(fresh); }
          catch (error) { if (current()) status.textContent = error.message; } finally { busy = false; }
        }));
        item.append(btn('举报留言', () => reportForm(item, work.id, row.id))); comments.append(item);
      }
      if (page > 0) pager.append(btn('上一页留言', () => load(page - 1)));
      if (data.hasMore) pager.append(btn('下一页留言', () => load(page + 1)));
    }
    async function load(next = 0) {
      const stamp = ++ticket; like.disabled = favorite.disabled = true; status.textContent = '正在读取互动…';
      try { const data = await request('thread', { id: work.id, page: next }); if (current() && stamp === ticket) paint(data); }
      catch (error) { if (current() && stamp === ticket) { status.replaceChildren(el('span', error.message), btn('重试读取', () => load(next))); } }
      finally { if (current() && stamp === ticket) like.disabled = favorite.disabled = false; }
    }
    async function react(kind) {
      if (!login() || busy) return;
      if (!state) return load();
      busy = true; like.disabled = favorite.disabled = true; status.textContent = '正在保存…';
      try { const data = await mutate('react', { work_id: work.id, kind, active: !state[kind === 'like' ? 'liked' : 'favorited'] }); if (current()) paint(data); }
      catch (error) { if (current()) status.textContent = error.message; }
      finally { busy = false; if (current()) like.disabled = favorite.disabled = false; }
    }
    form.onsubmit = async event => {
      event.preventDefault(); if (!login() || busy) return;
      const body = input.value.trim(); if (!body) { formStatus.textContent = '请先填写留言'; input.focus(); return; }
      if (!draftId || draftText !== body) { draftId = crypto.randomUUID(); draftText = body; }
      busy = true; submit.disabled = true; input.readOnly = true; formStatus.textContent = '正在发表…';
      try {
        const data = await mutate('comment', { id: draftId, work_id: work.id, body });
        if (current()) { paint(data); input.value = ''; draftId = null; formStatus.textContent = '留言已发表'; }
      } catch (error) { if (current()) formStatus.textContent = error.message; }
      finally { busy = false; submit.disabled = false; input.readOnly = false; }
    };
    load(); return root;
  }
  function adminEntry(container) {
    if (!container) return;
    container.querySelector('[data-hc-admin]')?.remove();
    if (!isAdmin()) return;
    const entry = btn('社区举报管理', openAdmin); entry.dataset.hcAdmin = ''; container.append(entry);
  }
  function openAdmin() {
    if (!isAdmin()) return;
    let overlay = document.getElementById('housingCommunityAdmin');
    if (!overlay) {
      overlay = el('div', null, 'modal-overlay'); overlay.id = 'housingCommunityAdmin';
      const modal = el('div', null, 'modal hc-admin'); modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', '社区举报管理');
      const head = el('div', null, 'modal-header'); head.append(el('h2', '社区举报管理'), btn('关闭', () => closeModal(overlay.id)));
      const body = el('div', null, 'modal-body'); body.id = 'hcAdminBody'; modal.append(head, body); overlay.append(modal); document.body.append(overlay);
      overlay.addEventListener('click', event => { if (event.target === overlay) closeModal(overlay.id); });
    }
    openModal(overlay.id);
    const body = document.getElementById('hcAdminBody'); body.replaceChildren();
    const filter = select({ pending: '待处理', resolved: '已处理', rejected: '已驳回', all: '全部举报' }, 'report-status');
    const listing = el('div'), pager = el('div', null, 'hc-tools'), status = statusNode();
    body.append(field('举报状态', filter), status, listing, pager);
    let page = 0, ticket = 0;
    async function load() {
      const stamp = ++ticket; status.textContent = '正在读取举报…';
      try {
        const data = await request('admin-reports', { status: filter.value, page });
        if (stamp !== ticket || !isAdmin()) return;
        listing.replaceChildren(); pager.replaceChildren(); status.textContent = data.rows.length ? '' : '没有符合条件的举报';
        for (const row of data.rows) {
          const item = el('article', null, 'hc-report'); item.dataset.reportId = row.id;
          item.append(el('h3', row.work_title + (row.comment_id ? ' · 留言举报' : ' · 作品举报')),
            el('p', (reasons[row.reason] || row.reason) + ' · ' + new Date(row.created_at).toLocaleString('zh-CN'), 'hc-hint'),
            el('p', row.target_text || '（作品未填写说明）', 'hc-body'), el('p', '举报说明：' + (row.details || '未补充'), 'hc-body'));
          const view = el('a', '查看公开作品（新标签页）'); view.href = '#/house/community/' + row.work_id; view.target = '_blank'; view.rel = 'noopener'; item.append(view);
          if (row.history?.length) {
            const history = el('details'); history.append(el('summary', '处理记录 · ' + row.history.length));
            row.history.forEach(h => history.append(el('p', new Date(h.at).toLocaleString('zh-CN') + ' · ' + (decisions[h.decision] || h.decision) + '：' + h.note, 'hc-body'))); item.append(history);
          }
          const choices = row.status === 'pending' ? { dismiss: decisions.dismiss, ...(row.comment_id ? { hide_comment: decisions.hide_comment } : {}), hide_work: decisions.hide_work }
            : row.decision === 'hide_comment' ? { restore_comment: decisions.restore_comment } : row.decision === 'hide_work' ? { restore_work: decisions.restore_work } : {};
          if (Object.keys(choices).length) {
            const form = el('form', null, 'hc-form'), decision = select(choices, 'decision'), note = textArea('note', 500), message = statusNode();
            const save = btn('确认处理', () => {}); save.type = 'submit';
            form.append(field('处理方式', decision), field('处理说明（必填，将反馈给用户）', note), save, message);
            form.onsubmit = async event => {
              event.preventDefault(); if (!note.value.trim()) { message.textContent = '请填写处理说明'; note.focus(); return; }
              save.disabled = true; message.textContent = '正在处理…';
              try { await mutate('moderate', { id: row.id, decision: decision.value, note: note.value }); message.textContent = '处理已保存，回执已发送'; await load(); }
              catch (error) { message.textContent = error.message; } finally { save.disabled = false; }
            }; item.append(form);
          }
          listing.append(item);
        }
        if (page) pager.append(btn('上一页举报', () => { page--; load(); }));
        if (data.hasMore) pager.append(btn('下一页举报', () => { page++; load(); }));
      } catch (error) { if (stamp === ticket) status.replaceChildren(el('span', error.message), btn('重试', load)); }
    }
    filter.onchange = () => { page = 0; load(); }; load(); filter.focus();
  }
  async function notifications() {
    if (!owner()) return { rows: [], unread: 0 };
    const data = await request('notifications');
    return { ...data, rows: data.rows.map(row => ({ ...row, id: 'hc-' + row.id, type: 'community' })) };
  }
  function reset() {
    const modal = document.getElementById('housingCommunityAdmin');
    if (modal) { if (modal.classList.contains('show')) closeModal(modal.id); modal.querySelector('.modal-body').replaceChildren(); }
    document.querySelectorAll('[data-hc-admin]').forEach(node => node.remove());
  }
  let badgeBusy = false;
  async function refreshBadge() {
    const uid = owner();
    if (!uid || document.hidden || badgeBusy) return;
    badgeBusy = true;
    try {
      const count = await CloudSync.getUnreadNotificationCount();
      if (uid !== owner()) return;
      const dot = document.getElementById('navNotifDot');
      if (dot) { dot.classList.toggle('show', count > 0); dot.title = count ? '有 ' + count + ' 条未读通知' : ''; }
      const badge = document.getElementById('notifBadge');
      if (badge) { badge.textContent = String(count); badge.style.display = count ? 'inline-block' : 'none'; }
    } finally { badgeBusy = false; }
  }
  // Account inbox is refreshed while the tab is visible; this is not an OS/browser push subscription.
  window.addEventListener('housing-community-change', refreshBadge);
  document.addEventListener('visibilitychange', refreshBadge);
  setInterval(refreshBadge, 60000);
  setTimeout(refreshBadge, 3000);
  return { request, reload, mutate, mount, adminEntry, openAdmin, notifications, reset };
})();
