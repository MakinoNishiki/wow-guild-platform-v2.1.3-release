'use strict';

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const limits = {
  region:16, edition:24, branch:64, identity:40, mode:24, goal:80, goalText:300,
  team:20, teamName:80, overtime:32, score:40, scoreText:80, bracket:40,
  ruleText:1000, voice:24, tool:32, toolText:80
};
const lists = ['days','rules','contacts','needs','progress'];
const contactTypes = ['微信','QQ','战网 ID','手机号','其他'];
const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function fail(statusCode, message) {
  throw Object.assign(new Error(message), {statusCode});
}

function fields(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !allowed.includes(key))) fail(400, '招募卡字段无效，请刷新后再试');
}

function validText(value, max) {
  return typeof value === 'string' && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value);
}

function unique(rows, key, message) {
  if (new Set(rows.map(key)).size !== rows.length) fail(400,message);
}

function list(value, max, label) {
  if (!Array.isArray(value) || value.length > max) fail(400,label+'数量无效');
  return value;
}

function checkCard(card) {
  fields(card,[...Object.keys(limits),...lists]);
  for (const [key,max] of Object.entries(limits)) {
    if (key in card && !validText(card[key],max)) fail(400,'招募内容格式有误或超长');
  }
  for (const row of list(card.days === undefined ? [] : card.days,7,'活动日')) {
    fields(row,['day','start','end']);
    if (typeof row.day !== 'string' || !/^周[一二三四五六日]$/u.test(row.day) ||
        ![row.start,row.end].every(value => typeof value==='string' && (value==='' || time.test(value)))) {
      fail(400,'请检查固定活动的星期和时段');
    }
  }
  unique(card.days || [],row=>row.day,'活动日重复');
  const contacts = list(card.contacts === undefined ? [] : card.contacts,contactTypes.length,'联系方式');
  for (const row of contacts) {
    fields(row,['type','value']);
    if (!contactTypes.includes(row.type) || !validText(row.value,160) || !row.value.trim()) fail(400,'请检查招募联系方式');
  }
  unique(contacts,row=>row.type,'联系方式类型重复');
  const rules = list(card.rules === undefined ? [] : card.rules,16,'团队约定');
  if (!rules.every(rule=>validText(rule,80))) fail(400,'团队约定格式有误');
  for (const row of list(card.needs === undefined ? [] : card.needs,100,'招募需求')) {
    fields(row,['role','className','spec','priority']);
    if (!['','坦克','治疗','输出'].includes(row.role) || !validText(row.className,40) ||
        !validText(row.spec,40) || !['','高','中','低'].includes(row.priority)) fail(400,'请检查招募职责、职业和专精');
  }
  const progress = list(card.progress === undefined ? [] : card.progress,100,'团本进度');
  for (const row of progress) {
    fields(row,['season','raid','difficulty','bosses']);
    if (!validText(row.season,64) || !row.season.trim() || !validText(row.raid,100) || !row.raid.trim() ||
        !['普通','英雄','史诗'].includes(row.difficulty)) fail(400,'请检查赛季、副本和难度');
    const bosses = list(row.bosses,40,'首领');
    if (!bosses.every(name=>validText(name,100) && name.trim())) fail(400,'首领名称无效');
    unique(bosses,name=>name,'同一条进度中首领重复');
  }
  unique(progress,row=>JSON.stringify([row.season,row.raid,row.difficulty]),'同一赛季、副本和难度的进度重复');
}

module.exports = ({auth, write, body}) => async (req,res,cors,path) => {
  if (path !== '/api/guild-recruitment') return false;
  const send = (code, payload) => {
    res.writeHead(code, {...cors,'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store'});
    res.end(JSON.stringify(payload));
  };
  try {
    const token = /^Bearer (\S+)$/i.exec(req.headers.authorization || '')?.[1];
    const user = token && await auth(token);
    if (!user || !uuid.test(user.id)) fail(401,'请先登录');
    let args = {p_user:user.id}, operation;
    if (req.method === 'GET') {
      operation = 'read';
      args.p_guild = new URL(req.url,'http://localhost').searchParams.get('guildId');
    } else if (req.method === 'POST') {
      operation = 'save';
      const raw = await body(req);
      if (Buffer.byteLength(raw) > 65536) fail(413,'招募卡过大，请减少内容');
      let data;
      try { data = JSON.parse(raw); } catch { fail(400,'请求内容无效'); }
      fields(data,['guildId','expectedRevision','card']);
      if (!Number.isSafeInteger(data.expectedRevision) || data.expectedRevision < 0 || data.expectedRevision >= 2147483647) {
        fail(400,'招募卡修订号无效');
      }
      checkCard(data.card);
      Object.assign(args,{p_guild:data.guildId, p_revision:data.expectedRevision, p_card:data.card});
    } else {
      res.setHeader('Allow','GET, POST');
      fail(405,'请求方式无效');
    }
    if (typeof args.p_guild !== 'string' || !uuid.test(args.p_guild)) fail(400,'公会编号无效');
    const result = await write('POST','/rest/v1/rpc/req212_'+operation+'_card',args);
    if (result.status === 200 && Number.isInteger(result.body?.revision) && Object.hasOwn(result.body,'card')) {
      send(200,result.body);
    } else {
      const code = result.body?.code;
      if (code==='42501') fail(403,operation==='read'?'仅本公会成员可查看招募资料':'仅本公会会长可编辑招募资料');
      if (code==='P0001') fail(409,'其他页面已保存新版本，请重新读取后再修改');
      if (code==='22023') fail(400,'招募卡内容或修订号无效');
      fail(503,operation==='read'?'招募资料暂时无法读取，请稍后重试':'尚未确认保存结果，可保留输入重试');
    }
  } catch (error) {
    send(error.statusCode || 500,{message:error.statusCode ? error.message : '招募卡暂不可用'});
  }
  return true;
};
