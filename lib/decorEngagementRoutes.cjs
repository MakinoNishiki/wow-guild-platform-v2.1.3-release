'use strict';
const { randomUUID, createHmac } = require('node:crypto');
const prefix = '/api/decor-engagement/';
const cookieName = 'wb_decor_visitor';

module.exports = ({ auth, get, write, body, signingKey }) => async (req, res, headers, path) => {
  if (!path.startsWith(prefix)) return false;
  const action = path.slice(prefix.length);
  function send(status, data) {
    res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
    return true;
  }
  async function rows(url) {
    const result = await get('/rest/v1/' + url);
    if (result.status !== 200 || !Array.isArray(result.body)) throw new Error('unavailable');
    return result.body;
  }
  const allowed = { summary: 'GET', item: 'GET', like: 'POST', view: 'POST', favorite: 'POST' };
  if (!Object.hasOwn(allowed, action)) return send(404, { message: '未找到入口' });
  if (req.method !== allowed[action]) return send(405, { message: '请求方式不正确' });
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer /i, '');
    const actor = token ? await auth(token) : null;
    if ((token || ['like','favorite'].includes(action)) && !actor?.id) return send(401, { message: '请重新登录' });
    if (action === 'summary') {
      const totals = [];
      let cursor = 0;
      for (;;) {
        const page = await rows('decor_item_totals?select=record_id,likes,views,favorites&order=record_id.asc&limit=500&record_id=gt.' + cursor);
        totals.push(...page);
        if (page.length < 500) break;
        cursor = page[page.length - 1].record_id;
      }
      const likedIds = [];
      if (actor) {
        let last = 0;
        for (;;) {
          const page = await rows('decor_item_likes?select=record_id&user_id=eq.' + actor.id + '&order=record_id.asc&limit=500&record_id=gt.' + last);
          likedIds.push(...page.map(row => row.record_id));
          if (page.length < 500) break;
          last = page[page.length - 1].record_id;
        }
      }
      return send(200, { rows: totals, likedIds });
    }
    const input = req.method === 'POST' ? JSON.parse(await body(req)) : null;
    const id = req.method === 'POST' ? input?.id : Number(new URL(req.url, 'http://localhost').searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0 || id > 2147483647) return send(400, { message: '家具编号无效' });
    if (action === 'item') {
      const [totals, ownLikes] = await Promise.all([
        rows('decor_item_totals?select=likes,views,favorites&record_id=eq.' + id),
        actor ? rows('decor_item_likes?select=record_id&record_id=eq.' + id + '&user_id=eq.' + actor.id) : []
      ]);
      return send(200, { ...(totals[0] || { likes: 0, views: 0, favorites: 0 }), liked: ownLikes.length > 0 });
    }
    if (action === 'favorite') {
      if ((input.planId != null && !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(input.planId)) ||
          !Number.isInteger(input.qty) || input.qty < 1 || input.qty > 99) return send(400, { message:'请选择方案和有效数量' });
      const result = await write('POST', '/rest/v1/rpc/favorite_decor_in_plan', {
        p_user: actor.id, p_plan: input.planId || null, p_record: id, p_quantity: input.qty
      });
      if (result.body?.code === 'P0001') return send(409, {message:'方案已变更，请刷新后重试'});
      if (result.status >= 400 || typeof result.body !== 'string') throw new Error('storage');
      return send(200, {planId: result.body});
    }
    let result;
    if (action === 'like') {
      if (typeof input.liked !== 'boolean') return send(400, { message: '点赞状态无效' });
      result = await write('POST', '/rest/v1/rpc/set_decor_item_like', { p_record: id, p_user: actor.id, p_liked: input.liked });
    } else {
      const key = signingKey();
      if (!key) throw new Error('missing key');
      const sign = value => createHmac('sha256', key).update('decor-view:' + value).digest('hex');
      let identity;
      if (actor) identity = 'account:' + actor.id;
      else {
        const cookie = (req.headers.cookie || '').split(/;\s*/).find(v => v.startsWith(cookieName + '=')) || '';
        const [value, mac] = cookie.slice(cookieName.length + 1).split('.');
        let guest = value;
        if (!/^[a-f0-9-]{36}$/.test(guest || '') || mac !== sign(guest)) {
          guest = randomUUID();
          const secure = (req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https') ? '; Secure' : '';
          res.setHeader('Set-Cookie', cookieName + '=' + guest + '.' + sign(guest) + '; Max-Age=31536000; HttpOnly; SameSite=Lax; Path=' + prefix + secure);
        }
        identity = 'guest:' + guest;
      }
      result = await write('POST', '/rest/v1/rpc/record_decor_item_view', { p_record: id, p_visitor: sign(identity) });
    }
    if (result.status >= 200 && result.status < 300) return send(200, { ok: true });
    if (result.body?.code === '23503') return send(404, { message: '家具已不存在' });
    throw new Error('storage');
  } catch (err) {
    return send(err instanceof SyntaxError ? 400 : 503, { message: err instanceof SyntaxError ? '请求内容无效' : '家具热度暂时无法读取，请稍后重试' });
  }
};
