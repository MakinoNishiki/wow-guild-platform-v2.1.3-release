// Public ranking is per catalog record. Only a detail read includes this account's own vote.
window.DecorEngagement = (() => {
  const totals = new Map();
  const empty = Object.freeze({ likes: 0, views: 0 });
  let ready = false;
  let loading;
  let loadedAt = 0;
  let revision = 0;
  function counts(id) { return totals.get(id)?.counts || (ready ? empty : null); }
  const user = () => window.CloudSync?.getCachedUser()?.id || '';
  async function request(action, payload = {}) {
    const currentUser = user();
    if (payload.owner !== undefined && currentUser !== payload.owner) throw new Error('登录账号已切换，请重新打开家具');
    const options = { headers: {} };
    if (action !== 'summary' && currentUser) {
      const token = await CloudSync.getAccessToken();
      if (!token || currentUser !== user()) throw new Error('登录状态已变更，请重新打开家具');
      options.headers.Authorization = 'Bearer ' + token;
    }
    let url = '/api/decor-engagement/' + action;
    if (action === 'item') url += '?id=' + encodeURIComponent(payload.id);
    if (action === 'like' || action === 'view') {
      options.method = 'POST';
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify({ id: payload.id, liked: payload.liked });
    }
    const res = await fetch(url, options);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || '读取家具热度失败');
    if (action !== 'summary' && currentUser !== user()) throw new Error('登录账号已切换，请重新打开家具');
    return data;
  }
  function load() {
    if (ready && Date.now() - loadedAt < 60000) return Promise.resolve(true);
    if (loading) return loading;
    const atStart = revision;
    loading = request('summary').then(({rows}) => {
      if (!Array.isArray(rows)) throw new Error('读取家具热度失败');
      for (const [id, entry] of totals) if (entry.revision <= atStart) totals.delete(id);
      for (const row of rows) if (!totals.has(row.record_id)) {
        totals.set(row.record_id, { counts: { likes: row.likes, views: row.views }, revision: atStart });
      }
      ready = true;
      loadedAt = Date.now();
      window.dispatchEvent(new Event('decor-engagement-change'));
      return true;
    }).catch(() => false).finally(() => { loading = null; });
    return loading;
  }
  function mount(modal, id) {
    const strip = document.createElement('div');
    strip.className = 'dh-engagement';
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'btn btn-sm';
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    strip.append(action, status);
    modal.querySelector('.dh-detail-add-row').before(strip);
    const owner = user();
    let liked = false;
    let retry = null;
    async function run(operation, desired) {
      action.disabled = true;
      status.textContent = '正在读取…';
      try {
        const result = await cloudCrud('decorEngagement', operation, { id, owner, liked: desired }, { silentError: true });
        if (!result.success) throw new Error(result.error?.message || '家具热度暂时不可用');
        const row = result.row;
        if (owner !== user()) return;
        totals.set(id, { counts: { likes: row.likes, views: row.views }, revision: ++revision });
        window.dispatchEvent(new Event('decor-engagement-change'));
        liked = row.liked;
        retry = null;
        status.textContent = row.likes + ' 人点赞 · ' + row.views + ' 次浏览';
        action.textContent = liked ? '取消点赞' : '点赞';
        action.setAttribute('aria-pressed', String(liked));
      } catch {
        retry = [operation, desired];
        action.textContent = '重试';
        action.removeAttribute('aria-pressed');
        status.textContent = '家具热度暂时不可用';
      } finally {
        action.disabled = owner !== user();
      }
    }
    action.textContent = '点赞';
    action.onclick = () => {
      if (retry) return run(...retry);
      if (!user()) return window.iaOpenAuth?.();
      return run('like', !liked);
    };
    run('view');
  }
  return { counts, load, mount, request };
})();
