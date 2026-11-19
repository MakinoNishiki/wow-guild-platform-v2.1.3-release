'use strict';
const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
function validAvailable(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length <= 500 &&
    Object.entries(value).every(([key, count]) => /^[1-9]\d{0,9}$/.test(key) && Number(key) <= 2147483647 && Number.isSafeInteger(count) && count >= 0 && count <= 9999);
}
module.exports = ({auth,get,write,body}) => async (req,res,cors,path) => {
  if (!path.startsWith('/api/housing-build-supplies/')) return false;
  const send = (status,value) => { res.writeHead(status,{...cors,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(value)); return true; };
  const action = path.slice('/api/housing-build-supplies/'.length);
  if (!['read','save'].includes(action)) return send(404,{message:'未找到入口'});
  if (req.method !== (action === 'read' ? 'GET' : 'POST')) return send(405,{message:'请求方式不正确'});
  try {
    const actor = await auth((req.headers.authorization || '').replace(/^Bearer /i,''));
    if (!actor?.id) return send(401,{message:'请登录后记录自己的可用量'});
    const input = action === 'read' ? {id:new URL(req.url,'http://localhost').searchParams.get('id')} : JSON.parse(await body(req));
    if (!input || typeof input.id !== 'string' || !uuid.test(input.id) || Object.keys(input).some(key=>!['id','revision','available'].includes(key))) return send(400,{message:'可用量请求有误'});
    if (action === 'save' && (!Number.isSafeInteger(input.revision) || input.revision < 0 || input.revision >= 2147483647 || !validAvailable(input.available))) return send(400,{message:'可用量请填写 0 至 9999 的整数，未知请留空'});
    const filter = new URLSearchParams({select:'id',id:'eq.'+input.id,or:'(published.eq.true,author_id.eq.'+actor.id+')',limit:'1'});
    const work = await get('/rest/v1/housing_builds?'+filter);
    if (work.status >= 400 || !Array.isArray(work.body)) return send(503,{message:'作品暂时无法读取，请重试'});
    if (!work.body.length) return send(404,{message:'作品不存在或已撤回'});
    if (action === 'save') {
      const result = await write('POST','/rest/v1/rpc/save_housing_build_supply',{p_user:actor.id,p_build:input.id,p_revision:input.revision,p_available:input.available});
      if (result.body?.code === 'P0001') return send(409,{message:result.body.message});
      if (result.status >= 400 || !Number.isSafeInteger(result.body)) return send(503,{message:'可用量保存失败，输入已保留，请重试'});
      return send(200,{revision:result.body});
    }
    // Parent visibility is checked again in the same read to respect concurrent withdrawal.
    const fields = new URLSearchParams({select:'available,revision,updated_at,housing_builds!inner()',user_id:'eq.'+actor.id,build_id:'eq.'+input.id,
      'housing_builds.or':'(published.eq.true,author_id.eq.'+actor.id+')',limit:'1'});
    const result = await get('/rest/v1/housing_build_supplies?'+fields);
    if (result.status >= 400 || !Array.isArray(result.body)) return send(503,{message:'可用量暂时无法读取，请重试'});
    const row = result.body[0];
    return send(200,row ? {available:row.available,revision:row.revision,updated_at:row.updated_at} : {available:{},revision:0,updated_at:null});
  } catch(error) { return send(error instanceof SyntaxError ? 400 : 503,{message:'可用量请求未完成，请重试'}); }
};
