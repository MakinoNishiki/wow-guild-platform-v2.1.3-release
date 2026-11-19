'use strict';

const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const { validateBuildTags } = require('../js/decorDict.js');
const pageSize = 24;
const privateColumns = 'id,title,description,blueprint_code,code_public,published,revision,updated_at';
const publicColumns = 'id,title,description,author_name,updated_at';
const maxImageBytes = 175 * 1024;
const maxImages = 8;

// The editor rasterizes images before upload. Accept bounded JPEG frames only.
function validJpeg(data) {
  if (typeof data !== 'string' || data.length > 4 * Math.ceil(maxImageBytes / 3)) return false;
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length < 12 || bytes.length > maxImageBytes || bytes.toString('base64') !== data ||
      bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) return false;
  let hasFrame = false;
  let pos = 2;
  while (pos + 4 < bytes.length) {
    if (bytes[pos++] !== 0xff) return false;
    while (bytes[pos] === 0xff) pos++;
    if (pos + 3 > bytes.length) return false;
    const marker = bytes[pos++];
    const length = bytes.readUInt16BE(pos);
    if (length < 2 || pos + length > bytes.length - 2) return false;
    if (marker === 0xc0 || marker === 0xc2) {
      if (length < 11 || bytes[pos + 2] !== 8) return false;
      const height = bytes.readUInt16BE(pos + 3);
      const width = bytes.readUInt16BE(pos + 5);
      if (!width || !height || width > 4096 || height > 4096) return false;
      hasFrame = true;
    }
    if (marker === 0xda) return hasFrame && length >= 8 && pos + length < bytes.length - 2;
    pos += length;
  }
  return false;
}

function validScreenshots(list) {
  if (!Array.isArray(list) || list.length > maxImages) return false;
  const ids = new Set();
  for (const entry of list) {
    if (!entry || typeof entry.id !== 'string' || !uuid.test(entry.id)) return false;
    if (ids.has(entry.id.toLowerCase()) || ('data' in entry && !validJpeg(entry.data))) return false;
    ids.add(entry.id.toLowerCase());
  }
  return true;
}

function validFurniture(list) {
  if (!Array.isArray(list) || list.length > 500) return false;
  const seen = new Set();
  return list.every(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key=>!['record_id','quantity'].includes(key)) ||
        !Number.isSafeInteger(item.record_id) || item.record_id < 1 || item.record_id > 2147483647 ||
        !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 9999 || seen.has(item.record_id)) return false;
    seen.add(item.record_id); return true;
  });
}
module.exports = ({ auth, get, write, body }) => async (req, res, cors, path) => {
  if (!path.startsWith('/api/housing-builds/')) return false;
  const send = (status, data) => {
    res.writeHead(status, { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
    return true;
  };
  const action = path.slice('/api/housing-builds/'.length);
  if (!['gallery', 'discover', 'mine', 'save', 'save-v2', 'photo', 'my-photo', 'copy-code'].includes(action)) return send(404, { message: '未找到入口' });
  const saving = action === 'save' || action === 'save-v2';
  const copying = action === 'copy-code';
  if (req.method !== (saving || copying ? 'POST' : 'GET')) return send(405, { message: '请求方式不正确' });
  try {
    const query = new URL(req.url, 'http://localhost').searchParams;
    const privateAction = (action !== 'discover' || query.get('mode') === 'favorites') && action !== 'gallery' && action !== 'photo' && !copying;
    const actor = privateAction ? await auth((req.headers.authorization || '').replace(/^Bearer /i, '')) : null;
    if (privateAction && !actor?.id) return send(401, { message: '请登录后管理自己的作品' });
    const v2 = query.get('v') === '2';
    if (copying) {
      const input = JSON.parse(await body(req));
      if (typeof input?.id !== 'string' || !uuid.test(input.id)) return send(400, { message: '作品链接无效' });
      const fields = new URLSearchParams({ select: 'blueprint_code', id: 'eq.' + input.id,
        published: 'eq.true', moderation_hidden: 'eq.false', code_public: 'eq.true', allow_copy: 'eq.true', limit: '1' });
      const result = await get('/rest/v1/housing_builds?' + fields);
      if (result.status >= 400 || !Array.isArray(result.body)) return send(503, { message: '蓝图暂时无法复制，请稍后重试' });
      const code = result.body[0]?.blueprint_code;
      if (!code) return send(404, { message: '作品已撤回或作者未开放复制' });
      return send(200, { blueprint_code: code });
    }
    if (saving) {
      const input = JSON.parse(await body(req));
      const title = typeof input?.title === 'string' && input.title.trim();
      const code = typeof input?.blueprint_code === 'string' ? input.blueprint_code.trim() || null : null;
      const hasMediaSettings = action === 'save-v2' || v2 || input?.allow_copy !== undefined || input?.screenshots !== undefined;
      if (!title || [...title].length > 80 || typeof input.description !== 'string' || [...input.description].length > 1000 ||
          (input.blueprint_code != null && typeof input.blueprint_code !== 'string') ||
          (!code && (!hasMediaSettings || input.code_public)) || (code && !/^[a-zA-Z0-9+/_=-]{4,512}$/.test(code)) ||
          typeof input.id !== 'string' || !uuid.test(input.id) ||
          typeof input.code_public !== 'boolean' || typeof input.published !== 'boolean' ||
          !Number.isSafeInteger(input.revision) || input.revision < 0 || input.revision >= 2147483647) {
        return send(400, { message: '请核对作品名、说明和游戏内复制的蓝图码' });
      }
      if (hasMediaSettings && (typeof input.allow_copy !== 'boolean' || (input.allow_copy && !input.code_public))) {
        return send(400, { message: '公开蓝图码后才能开启一键复制' });
      }
      if (hasMediaSettings && !validScreenshots(input.screenshots)) {
        return send(400, { message: `请检查截图格式和大小，每件作品最多 ${maxImages} 张。` });
      }
      if (input.published) {
        const moderation = await get('/rest/v1/housing_builds?' + new URLSearchParams({ select: 'moderation_hidden', id: 'eq.' + input.id, author_id: 'eq.' + actor.id }));
        if (moderation.status >= 400 || !Array.isArray(moderation.body)) return send(503, { message: '暂时无法核对作品状态，请保留内容重试' });
        if (moderation.body[0]?.moderation_hidden) return send(409, { message: '作品已被平台下架，可保存草稿；解除限制后才能重新发布' });
      }
      const args = {
        p_author: actor.id, p_id: input.id, p_revision: input.revision, p_title: title,
        p_description: input.description.trim(), p_code: code, p_code_public: input.code_public, p_published: input.published
      };
      if (hasMediaSettings) {
        args.p_allow_copy = input.allow_copy;
        args.p_screenshots = input.screenshots.map(({ id, data }) => data ? { id, data } : { id });
      }
      let rpc = hasMediaSettings ? 'save_housing_build_v2' : 'save_housing_build';
      if ('preset_tags' in input || 'custom_tags' in input) {
        const tagError = validateBuildTags(input.preset_tags, input.custom_tags);
        if (tagError || !hasMediaSettings) return send(400, { message: tagError || '请刷新后编辑作品标签。' });
        args.p_preset_tags = input.preset_tags;
        args.p_custom_tags = input.custom_tags;
        rpc = 'save_housing_build_v3';
      }
      if ('furniture_items' in input) {
        if (!hasMediaSettings || !validFurniture(input.furniture_items)) return send(400,{message:'请从图鉴选择家具，用量填写 1 至 9999 的整数，最多 500 种且不能重复'});
        args.p_furniture_items = input.furniture_items;
        args.p_preset_tags ??= null;
        args.p_custom_tags ??= null;
        rpc = 'save_housing_build_v4';
      }
      const result = await write('POST', '/rest/v1/rpc/' + rpc, args);
      if (result.body?.code === 'P0001') return send(409, { message: result.body.message });
      if (result.status >= 400 || !Number.isInteger(result.body)) return send(503, { message: '作品保存服务暂不可用，请保留内容后重试' });
      return send(200, { revision: result.body });
    }
    const id = query.get('id');
    const page = Number(query.get('page') || 0);
    if ((id !== null && !uuid.test(id)) || !Number.isSafeInteger(page) || page < 0 || page > 1000000) {
      return send(400, { message: '作品链接或页码无效' });
    }
    if (action === 'discover') {
      const mode = query.get('mode') || 'latest';
      const tag = (query.get('tag') || '').trim();
      if (!['latest','hot','favorites'].includes(mode) || [...tag].length > 32) return send(400,{message:'筛选条件无效'});
      const result = await write('POST','/rest/v1/rpc/discover_housing_works',{
        p_mode:mode, p_tag:tag, p_actor:actor?.id || null, p_page:page
      });
      if (result.status >= 400 || !Array.isArray(result.body)) return send(503,{message:'暂时无法读取作品，请重试'});
      return send(200,{rows:result.body.slice(0,pageSize),hasMore:result.body.length>pageSize});
    }
    if (action === 'photo' || action === 'my-photo') {
      if (!id) return send(400, { message: '截图链接无效' });
      // Filtering the parent in the same query makes withdrawal immediately effective.
      const fields = new URLSearchParams({ id: 'eq.' + id, select: 'jpeg,housing_builds!inner()', limit: '1' });
      if (actor) fields.set('housing_builds.author_id', 'eq.' + actor.id);
      else { fields.set('housing_builds.published', 'eq.true'); fields.set('housing_builds.moderation_hidden', 'eq.false'); }
      const result = await get('/rest/v1/housing_build_images?' + fields);
      if (result.status >= 400 || !Array.isArray(result.body)) return send(503, { message: '截图读取失败，请重试' });
      if (!result.body.length) return send(404, { message: '截图不存在或尚未公开' });
      const hex = result.body[0].jpeg;
      if (typeof hex !== 'string' || !hex.startsWith('\\x')) return send(503, { message: '截图暂不可用' });
      const image = Buffer.from(hex.slice(2), 'hex');
      res.writeHead(200, { ...cors, 'Content-Type': 'image/jpeg', 'Content-Length': image.length,
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(image);
      return true;
    }
    const table = action === 'gallery' ? 'housing_build_gallery' : 'housing_builds';
    const filters = new URLSearchParams({
      select: action === 'gallery'
        ? publicColumns + (v2 ? ',code_public,allow_copy,image_ids,preset_tags,custom_tags,furniture_items' : '')
        : privateColumns + (v2 ? ',allow_copy,image_ids,preset_tags,custom_tags,furniture_items' : ''),
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
