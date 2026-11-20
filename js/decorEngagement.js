// Aggregate counts are public. The current account's likes are loaded with its summary.
window.DecorEngagement = (() => {
  const totals = new Map();
  const empty = Object.freeze({ likes: 0, views: 0, favorites: 0 });
  let ready = false;
  let likedIds = new Set();
  let ownerKey;
  let epoch = 0;
  let loading;
  const pendingLikes = new Set();
  let loadedAt = 0;
  let revision = 0;
  function counts(id) { return totals.get(id)?.counts || (ready ? empty : null); }
  const user = () => window.CloudSync?.getCachedUser()?.id || '';
  async function request(action, payload = {}) {
    const currentUser = user();
    if (payload.owner !== undefined && currentUser !== payload.owner) throw new Error('登录账号已切换，请重新打开家具');
    const options = { headers: {} };
    if (currentUser) {
      const token = await CloudSync.getAccessToken();
      if (!token || currentUser !== user()) throw new Error('登录状态已变更，请重新打开家具');
      options.headers.Authorization = 'Bearer ' + token;
    }
    let url = '/api/decor-engagement/' + action;
    if (action === 'item') url += '?id=' + encodeURIComponent(payload.id);
    if (['like','view','favorite'].includes(action)) {
      options.method = 'POST';
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify({ id: payload.id, liked: payload.liked, planId: payload.planId, qty: payload.qty });
    }
    const res = await fetch(url, options);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || '读取家具热度失败');
    if (currentUser !== user()) throw new Error('登录账号已切换，请重新打开家具');
    return data;
  }
  const announce = () => window.dispatchEvent(new Event('decor-engagement-change'));
  function load(force = false) {
    const actor = user();
    if (ownerKey !== actor) {
      ownerKey = actor;
      likedIds = new Set();
      ready = false;
      loadedAt = 0;
      loading = null;
      ++epoch;
      announce();
    }
    if (!force && ready && Date.now() - loadedAt < 60000) return Promise.resolve(true);
    if (!force && loading) return loading;
    const ticket = ++epoch;
    const atStart = revision;
    loading = request('summary').then(data => {
      if (ticket !== epoch || actor !== user()) return false;
      if (!Array.isArray(data.rows)) throw new Error('统计格式错误');
      const newer = new Set([...totals].filter(([,entry]) => entry.revision > atStart).map(([id]) => id));
      const nextLikes = new Set(data.likedIds || []);
      for (const id of newer) { if (likedIds.has(id)) nextLikes.add(id); else nextLikes.delete(id); }
      likedIds = nextLikes;
      for (const id of totals.keys()) if (!newer.has(id)) totals.delete(id);
      for (const row of data.rows) if (!newer.has(row.record_id)) {
        totals.set(row.record_id, { counts: row, revision: atStart });
      }
      ready = true;
      loadedAt = Date.now();
      announce();
      return true;
    }).catch(() => false).finally(() => { if (ticket === epoch) loading = null; });
    return loading;
  }
  async function update(id, operation, desired) {
    const owner = user();
    const result = await cloudCrud('decorEngagement', operation, {id,owner,liked:desired}, {silentError:true});
    if (!result.success || !result.row) throw new Error('家具互动暂时不可用，请重试');
    if (owner !== user()) return;
    const row = result.row;
    totals.set(id, {counts:row, revision:++revision});
    if (row.liked) likedIds.add(id); else likedIds.delete(id);
    announce();
  }
  const iconFile = 'assets/icons/decor-interactions.svg';
  function metricIcon(symbol, className) {
    return `<svg class="dh-metric-icon ${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="${iconFile}#metric-${symbol}"></use></svg>`;
  }
  function refresh(root) {
    if (!root) return;
    for (const strip of root.querySelectorAll('[data-metrics]')) {
      const id = Number(strip.dataset.metrics);
      if (!strip.firstElementChild) {
        strip.innerHTML = `<button type="button" class="dh-heart" aria-label="点赞">${metricIcon('like', 'dh-heart-icon')} <span data-count="likes"></span></button>
          <span class="dh-stat" title="收藏到方案单的人数">${metricIcon('favorite', 'dh-star')} <span data-count="favorites"></span></span>
          <span class="dh-stat" title="有效浏览">${metricIcon('views', 'dh-eye')} <span data-count="views"></span></span>`;
        strip.querySelector('button').onclick = async event => {
          event.stopPropagation();
          if (!user()) return window.iaOpenAuth?.();
          if (pendingLikes.has(id)) return;
          if (ownerKey !== user() || !ready) {
            if (!await load(true)) return window.showToast?.('家具统计读取失败，请重试', 'error');
          }
          const desired = !likedIds.has(id);
          pendingLikes.add(id);
          refresh(strip.parentNode);
          try { await update(id,'like',desired); }
          catch (error) { window.showToast?.(error.message,'error'); }
          finally { pendingLikes.delete(id); refresh(document); }
        };
      }
      const liked = ownerKey === user() && likedIds.has(id);
      const heart = strip.querySelector('.dh-heart');
      heart.disabled = pendingLikes.has(id);
      heart.setAttribute('aria-label', liked ? '取消点赞' : '点赞');
      heart.setAttribute('aria-pressed', String(liked));
      heart.title = liked ? '取消点赞' : '点赞';
      const heartShape = heart.querySelector('use');
      const symbol = iconFile + (liked ? '#metric-liked' : '#metric-like');
      if (heartShape.getAttribute('href') !== symbol) heartShape.setAttribute('href', symbol);
      const total = counts(id);
      for (const [key, label] of [['likes','点赞'],['favorites','收藏'],['views','浏览']]) {
        const number = strip.querySelector('[data-count=' + key + ']');
        number.textContent = total?.[key] ?? '—';
        number.setAttribute('aria-label', label + ' ' + number.textContent);
      }
    }
  }
  function mount(modal,id) {
    const strip = document.createElement('div');
    strip.className = 'dh-engagement';
    strip.dataset.metrics = id;
    modal.querySelector('.dh-detail-add-row').before(strip);
    refresh(modal);
    strip.querySelector('button').disabled = true;
    strip.querySelector('button').removeAttribute('aria-pressed');
    update(id,'view').then(() => refresh(modal)).catch(() => {
      strip.querySelector('button').disabled = false;
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn btn-sm';
      retry.textContent = '重新读取统计';
      retry.onclick = () => { strip.remove(); mount(modal,id); };
      strip.append(retry);
    });
  }
  return {counts, load, mount, refresh, request};
})();
