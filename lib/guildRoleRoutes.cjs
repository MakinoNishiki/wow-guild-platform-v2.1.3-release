'use strict';

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const validKey = key => ['owner','editor','viewer'].includes(key) ||
  (typeof key === 'string' && key.startsWith('custom-') && uuid.test(key.slice(7)));
const pieces = new Set(['king','queen','rook','bishop','knight','pawn']);

function fail(status, message) {
  throw Object.assign(new Error(message), {status});
}

function roleMutation(input) {
  if (!input || !uuid.test(input.guildId)) fail(400,'请选择有效的公会');
  if (input.action === 'assign') {
    if (!uuid.test(input.membershipId) || !validKey(input.key) || !validKey(input.expectedRole) ||
        Object.keys(input).some(k => !['action','guildId','membershipId','key','expectedRole'].includes(k))) {
      fail(400,'成员或目标角色无效，请刷新后重试');
    }
    return ['assign_role',{p_membership:input.membershipId,p_key:input.key,p_expected:input.expectedRole}];
  }
  if (input.action !== 'save' || Object.keys(input).some(k =>
      !['action','guildId','key','name','piece','permissions','expectedRevision'].includes(k))) fail(400,'角色操作无效');
  if (input.key != null && !validKey(input.key) || typeof input.name !== 'string' ||
      !input.name.trim() || Array.from(input.name.trim()).length > 16 || !pieces.has(input.piece) ||
      !input.permissions || typeof input.permissions !== 'object' || Array.isArray(input.permissions) ||
      Object.values(input.permissions).some(value => typeof value !== 'boolean') ||
      !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || input.expectedRevision >= 2147483647) {
    fail(400,'请检查角色名称、棋子与权限');
  }
  return ['save_role',{p_key:input.key ?? null,p_name:input.name.trim(),p_piece:input.piece,
    p_permissions:input.permissions,p_revision:input.expectedRevision}];
}

module.exports = ({auth,write,body,onChange}) => async (req,res,cors,path) => {
  if (path !== '/api/guild-roles') return false;
  const send = (status, data) => {
    res.writeHead(status,{...cors,'Cache-Control':'private, no-store','Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify(data));
  };
  try {
    const token = /^Bearer (\S+)$/i.exec(req.headers.authorization || '')?.[1];
    const user = token && await auth(token);
    if (!user || !uuid.test(user.id)) fail(401,'请先登录');
    let guild, operation, args;
    if (req.method === 'GET') {
      guild = new URL(req.url,'http://localhost').searchParams.get('guildId');
      operation = 'read_roles'; args = {};
    } else if (req.method === 'POST') {
      const raw = await body(req);
      if (Buffer.byteLength(raw) > 8192) fail(413,'角色资料过大');
      let input;
      try { input = JSON.parse(raw); } catch { fail(400,'角色资料格式无效'); }
      [operation,args] = roleMutation(input);
      guild = input.guildId;
    } else fail(405,'请求方式无效');
    if (!uuid.test(guild)) fail(400,'公会编号无效');
    const result = await write('POST','/rest/v1/rpc/req191_'+operation,{...args,p_guild:guild,p_user:user.id});
    if (result.status !== 200) {
      const code = result.body?.code;
      if (code === '42501') fail(403, req.method === 'GET' ? '仅本公会成员可查看' : '仅本公会会长可管理角色');
      if (code === '23505') fail(409,'角色名称已存在，请更换名称');
      if (['PT409','40001','P0001'].includes(code)) fail(409,'角色或成员身份已变化，请重新读取后操作');
      if (['22023','23514'].includes(code)) fail(400,'角色信息无效，请检查后重试');
      fail(503,'公会角色服务暂不可用，请稍后重新读取');
    }
    if (req.method === 'POST') {
      if (result.body?.ok !== true) fail(503,'角色保存结果待核实，请重新读取');
      onChange();
    } else if (!validKey(result.body?.ownRole) || !Array.isArray(result.body?.roles) || !Array.isArray(result.body?.assignments)) {
      fail(503,'角色资料读取不完整，请重试');
    }
    send(200,result.body);
  } catch (error) {
    send(error.status || error.statusCode || 503,{message:error.status ? error.message : '公会角色服务暂不可用'});
  }
  return true;
};
