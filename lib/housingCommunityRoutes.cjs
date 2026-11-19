'use strict';
const { checkComment } = require('./housingCommunityRules.cjs');
const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const reasons = ['spam', 'abuse', 'unsafe', 'copyright', 'other'];
const actions = { summary: 'GET', thread: 'GET', favorites: 'GET', report: 'POST', 'my-report': 'GET',
  notifications: 'GET', 'admin-reports': 'GET', react: 'POST', comment: 'POST', 'remove-comment': 'POST', moderate: 'POST', read: 'POST' };
module.exports = ({ auth, get, write, body }) => async (req, res, headers, path) => {
  const prefix = '/api/housing-community/';
  if (!path.startsWith(prefix)) return false;
  const action = path.slice(prefix.length);
  function send(status, data) {
    res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data)); return true;
  }
  async function rows(table, fields) {
    const result = await get('/rest/v1/' + table + '?' + new URLSearchParams(fields));
    if (result.status !== 200 || !Array.isArray(result.body)) { console.error('[housing-community] read failed', table, result.status, result.body?.code, result.body?.message); throw new Error('unavailable'); }
    return result.body;
  }
  if (!Object.hasOwn(actions, action)) return send(404, { message: '未找到社区入口' });
  if (req.method !== actions[action]) return send(405, { message: '请求方式不正确' });
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer /i, '');
    const actor = token ? await auth(token) : null;
    if ((token || !['summary', 'thread'].includes(action)) && !actor?.id) return send(401, { message: '请登录后使用社区互动' });
    if (['moderate', 'admin-reports'].includes(action) && actor.app_metadata?.role !== 'superadmin') return send(403, { message: '仅平台管理员可处理举报' });
    const query = new URL(req.url, 'http://localhost').searchParams;
    if (action === 'summary') {
      const all = [];
      let after = '00000000-0000-0000-0000-000000000000';
      for (;;) {
        const batch = await rows('housing_build_community_totals', { select: 'work_id,likes,favorites,comments,recent7d', order: 'work_id.asc', work_id: 'gt.' + after, limit: '500' });
        all.push(...batch); if (batch.length < 500) break; after = batch.at(-1).work_id;
      }
      return send(200, { rows: all });
    }
    const id = query.get('id');
    if (id && !uuid.test(id)) return send(400, { message: '编号无效' });
    if (action === 'favorites') {
      const all = []; let after = '00000000-0000-0000-0000-000000000000';
      for (;;) {
        const batch = await rows('housing_build_reactions', { select: 'work_id,housing_builds!inner()', user_id: 'eq.' + actor.id,
          kind: 'eq.favorite', 'housing_builds.published': 'eq.true', 'housing_builds.moderation_hidden': 'eq.false', order: 'work_id.asc', work_id: 'gt.' + after, limit: '500' });
        all.push(...batch.map(({ work_id }) => ({ work_id }))); if (batch.length < 500) break; after = batch.at(-1).work_id;
      }
      return send(200, { rows: all });
    }
    if (action === 'thread') {
      if (!id) return send(400, { message: '请指定作品' });
      const page = Number(query.get('page') || 0);
      if (!Number.isSafeInteger(page) || page < 0 || page > 100000) return send(400, { message: '页码无效' });
      const totals = await rows('housing_build_community_totals', { select: '*', work_id: 'eq.' + id });
      if (!totals.length) return send(404, { message: '作品已撤回或暂不可互动' });
      const [comments, reactions] = await Promise.all([
        rows('housing_community_comment_list', { select: 'id,author_id,body,author_name,created_at', work_id: 'eq.' + id, status: 'eq.visible', order: 'created_at.desc,id.desc', limit: '21', offset: String(page * 20) }),
        actor ? rows('housing_build_reactions', { select: 'kind', user_id: 'eq.' + actor.id, work_id: 'eq.' + id }) : []
      ]);
      return send(200, { ...totals[0], liked: reactions.some(r => r.kind === 'like'), favorited: reactions.some(r => r.kind === 'favorite'),
        rows: comments.slice(0, 20).map(({ author_id, ...r }) => ({ ...r, mine: actor?.id === author_id })), hasMore: comments.length > 20, page });
    }
    if (action === 'notifications') {
      const list = await rows('housing_community_notifications', { select: 'id,title,message,is_read,created_at', user_id: 'eq.' + actor.id, order: 'created_at.desc,id.desc', limit: '100' });
      const unread = await rows('housing_community_notifications', { select: 'id', user_id: 'eq.' + actor.id, is_read: 'eq.false', limit: '1000' });
      return send(200, { rows: list, unread: unread.length });
    }
    if (action === 'my-report') {
      if (!id) return send(400, { message: '请指定举报' });
      return send(200, { rows: await rows('housing_community_reports', { select: 'id,status,decision,note', reporter_id: 'eq.' + actor.id, id: 'eq.' + id }) });
    }
    if (action === 'admin-reports') {
      const status = query.get('status') || 'pending';
      const page = Number(query.get('page') || 0);
      if (!['pending', 'resolved', 'rejected', 'all'].includes(status) || !Number.isInteger(page) || page < 0 || page > 10000) return send(400, { message: '筛选无效' });
      const fields = { select: 'id,work_id,comment_id,reason,details,target_text,work_title,status,decision,note,history,created_at', order: 'created_at.desc,id.desc', limit: '21', offset: String(page * 20) };
      if (id) { fields.id = 'eq.' + id; delete fields.offset; }
      else if (status !== 'all') fields.status = 'eq.' + status;
      const list = await rows('housing_community_reports', fields);
      return send(200, { rows: list.slice(0, 20), hasMore: list.length > 20 });
    }
    const input = JSON.parse(await body(req));
    if (!input || typeof input !== 'object' || Array.isArray(input)) return send(400, { message: '提交内容无效' });
    const data = {};
    if (action !== 'read' || input.id != null) {
      if (!['react'].includes(action) && !uuid.test(input.id || '')) return send(400, { message: '操作编号无效' });
      if (input.id) data.id = input.id;
    }
    if (!['read', 'moderate'].includes(action)) {
      if (!uuid.test(input.work_id || '')) return send(400, { message: '作品编号无效' });
      data.work_id = input.work_id;
    }
    if (action === 'react') {
      if (!['like', 'favorite'].includes(input.kind) || typeof input.active !== 'boolean') return send(400, { message: '互动状态无效' });
      data.kind = input.kind; data.active = input.active;
    }
    if (action === 'comment') {
      if (typeof input.body !== 'string' || !input.body.trim() || [...input.body.trim()].length > 1000) return send(400, { message: '留言需为 1—1000 字' });
      const error = checkComment(input.body); if (error) return send(422, { message: error });
      data.body = input.body.trim();
    }
    if (action === 'report') {
      if (!reasons.includes(input.reason) || typeof input.details !== 'string' || [...input.details].length > 1000 ||
        (input.comment_id != null && !uuid.test(input.comment_id))) return send(400, { message: '请核对举报原因和说明' });
      if (input.reason === 'other' && !input.details.trim()) return send(400, { message: '选择其他原因时请补充说明' });
      data.reason = input.reason; data.details = input.details.trim(); data.comment_id = input.comment_id || null;
    }
    if (action === 'moderate') {
      if (!['dismiss', 'hide_comment', 'hide_work', 'restore_comment', 'restore_work'].includes(input.decision) || typeof input.note !== 'string' || !input.note.trim() || [...input.note].length > 500) return send(400, { message: '请填写处理方式及 1—500 字说明' });
      data.decision = input.decision; data.note = input.note.trim();
    }
    const result = await write('POST', '/rest/v1/rpc/housing_community_action', { p_actor: actor.id, p_action: action, p_data: data });
    if (result.body?.code === 'P0001') return send(409, { message: result.body.message });
    if (result.status < 200 || result.status >= 300) { console.error('[housing-community] write failed', result.status, result.body?.code, result.body?.message); throw new Error('storage'); }
    return send(200, result.body);
  } catch (error) {
    if (error.statusCode === 413) return send(413, { message: '提交内容过大' });
    return send(error instanceof SyntaxError ? 400 : 503, { message: error instanceof SyntaxError ? '提交内容无效' : '社区服务暂时不可用，请保留内容后重试' });
  }
};
