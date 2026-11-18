'use strict';

const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const pageSize = 24;
const privateColumns = 'id,title,description,blueprint_code,code_public,published,revision,updated_at';

module.exports = ({ auth, get, write, body }) => async (req, res, cors, path) => {
  if (!path.startsWith('/api/housing-builds/')) return false;
  const send = (status, data) => {
    res.writeHead(status, { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
    return true;
  };
  const action = path.slice('/api/housing-builds/'.length);
  if (!['gallery', 'mine', 'save'].includes(action)) return send(404, { message: '未找到入口' });
  if (req.method !== (action === 'save' ? 'POST' : 'GET')) return send(405, { message: '请求方式不正确' });
  try {
    const actor = action === 'gallery' ? null : await auth((req.headers.authorization || '').replace(/^Bearer /i, ''));
    if (action !== 'gallery' && !actor?.id) return send(401, { message: '请登录后管理自己的作品' });
    if (action === 'save') {
      const input = JSON.parse(await body(req));
      const title = typeof input?.title === 'string' && input.title.trim();
      const code = typeof input?.blueprint_code === 'string' && input.blueprint_code.trim();
      if (!title || [...title].length > 80 || typeof input.description !== 'string' || [...input.description].length > 1000 ||
          !code || !/^[a-zA-Z0-9+/_=-]{4,512}$/.test(code) || !uuid.test(input.id) ||
          typeof input.code_public !== 'boolean' || typeof input.published !== 'boolean' ||
          !Number.isSafeInteger(input.revision) || input.revision < 0 || input.revision >= 2147483647) {
        return send(400, { message: '请核对作品名、说明和游戏内复制的蓝图码' });
      }
      const result = await write('POST', '/rest/v1/rpc/save_housing_build', {
        p_author: actor.id, p_id: input.id, p_revision: input.revision, p_title: title,
        p_description: input.description.trim(), p_code: code, p_code_public: input.code_public, p_published: input.published
      });
      if (result.body?.code === 'P0001') return send(409, { message: result.body.message });
      if (result.status >= 400 || !Number.isInteger(result.body)) return send(503, { message: '作品保存服务暂不可用，请保留内容后重试' });
      return send(200, { revision: result.body });
    }
    const query = new URL(req.url, 'http://localhost').searchParams;
    const id = query.get('id');
    const page = Number(query.get('page') || 0);
    if ((id !== null && !uuid.test(id)) || !Number.isSafeInteger(page) || page < 0 || page > 1000000) {
      return send(400, { message: '作品链接或页码无效' });
    }
    const table = action === 'gallery' ? 'housing_build_gallery' : 'housing_builds';
    const filters = new URLSearchParams({
      select: action === 'gallery' ? 'id,title,description,author_name,blueprint_code,updated_at' : privateColumns,
      order: 'updated_at.desc,id.asc', limit: id ? '1' : String(pageSize + 1), offset: String(id ? 0 : page * pageSize)
    });
    if (actor) filters.set('author_id', 'eq.' + actor.id);
    if (id) filters.set('id', 'eq.' + id);
    const result = await get('/rest/v1/' + table + '?' + filters);
    if (result.status >= 400 || !Array.isArray(result.body)) return send(503, { message: '作品暂时无法读取，请重试' });
    if (id && !result.body.length) return send(404, { message: '作品不存在或已撤回' });
    return send(200, { rows: result.body.slice(0, pageSize), hasMore: result.body.length > pageSize });
  } catch (error) {
    if (error.statusCode === 413) return send(413, { message: '提交内容过大' });
    return send(error instanceof SyntaxError ? 400 : 503, { message: '请求未完成，请重试' });
  }
};
