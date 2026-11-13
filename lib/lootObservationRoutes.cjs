'use strict';
const crypto = require('node:crypto');
const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const fail = message => { throw Object.assign(new Error(message), {statusCode:400}); };
const hash = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function normalize(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) fail('采集行格式无效');
  const text = (key, max=160) => {
    const value = row[key] == null ? '' : row[key];
    if(typeof value!=='string'||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))fail('采集字段无效：'+key);
    return value.trim();
  };
  const number = (key,min,max,required=false) => {
    const n=row[key]; if(n==null&&!required)return null;
    if(!Number.isSafeInteger(n)||n<min||n>max)fail('采集数值无效：'+key);return n;
  };
  const date = (value,required=false) => {
    if(value==null&&!required)return null;
    if(typeof value!=='number'&&typeof value!=='string')fail('采集时间无效');
    const t=typeof value==='number'?value*1000:Date.parse(value);
    if(!Number.isFinite(t)||t<946684800000||t>Date.now()+86400000)fail('采集时间无效');
    return new Date(t).toISOString();
  };
  const r={player_name:text('playerName'),player_server:text('playerServer'),player_region:text('playerRegion',8).toUpperCase(),
    item_name:text('itemName'),official_item_id:number('itemID',1,2147483647,true),item_link:text('itemLink',2048),
    icon_id:number('iconID',1,2147483647),quality:number('quality',0,7),ilvl:number('ilvl',1,2000),slot:text('slot',40),slot_cn:text('slotCN',40),
    item_type:text('itemType',40),boss_name:text('bossName'),instance_name:text('instanceName'),difficulty_id:number('difficultyID',1,1000),
    timestamp:date(row.timestampISO??row.timestamp,true),encounter_id:number('encounterID',1,2147483647),encounter_at:date(row.encounterAt),
    quantity:row.quantity==null?1:number('quantity',1,100,true),capture_version:text('captureVersion',30),binding_status:text('bindingStatus',30)};
  if(!r.player_name||!r.item_name)fail('缺少拾取人或装备名称');
  const difficulty={3:'普通',4:'普通',9:'普通',14:'普通',5:'英雄',6:'英雄',15:'英雄',16:'史诗'};
  if(!difficulty[r.difficulty_id])fail('仅支持普通、英雄、史诗团队副本记录');
  r.difficulty=difficulty[r.difficulty_id];
  if(r.binding_status==='account')fail('战团绑定物品不纳入团队拾取，请重新导出');
  if(r.item_link&&!r.item_link.startsWith('|Hitem:'+r.official_item_id+':'))fail('物品链接与物品ID不一致');
  // Full exact link is deliberately conservative: variant normalization is not yet evidenced.
  r.identity_complete=!!(r.player_server&&r.player_region&&r.item_link&&r.encounter_id&&r.encounter_at&&r.instance_name&&r.ilvl&&r.binding_status==='ordinary');
  const source=text('collectorSourceID',160),event=text('sourceEventID',160);
  if (!!source!==!!event)fail('采集来源与事件编号不完整');
  r.content_hash=hash(r);
  r.collector_source_id=source||'legacy';r.source_event_id=event||r.content_hash;
  return r;
}
module.exports = dependencies => async function handleLoot(req,res,cors,urlPath) {
  if(!urlPath.startsWith('/api/loot-observations/'))return false;
  const send=(status,body)=>{res.writeHead(status,{...cors,'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));};
  try {
    if(req.method!=='POST'){send(405,{message:'仅支持POST'});return true;}
    const user=await dependencies.auth((req.headers.authorization||'').replace(/^Bearer /,''));
    if(!user){send(401,{message:'请先登录'});return true;}
    let body;try{body=JSON.parse(await dependencies.body(req));}catch(e){if(e.statusCode===413)throw e;fail('请求内容无效');}
    if(!uuid(body.guildId)||body.activityId!=null&&!uuid(body.activityId))fail('公会或活动编号无效');
    // No role cache for this workflow. SQL checks membership again inside its write transaction.
    const membership=await dependencies.get(`/rest/v1/guild_members?guild_id=eq.${body.guildId}&user_id=eq.${user.id}&select=role&limit=1`);
    const role=membership.body?.[0]?.role;
    if(!role){send(403,{message:'你已不在该公会，不能提交或核对'});return true;}
    let fn,args;
    if(urlPath==='/api/loot-observations/submit') {
      if(!Array.isArray(body.rows)||!body.rows.length||body.rows.length>200)fail('每批支持1至200条记录');
      fn='req191_submit_loot';args={p_guild:body.guildId,p_user:user.id,p_activity:body.activityId||null,p_rows:body.rows.map(normalize)};
    } else if(urlPath==='/api/loot-observations/review') {
      if(!['owner','editor'].includes(role)){send(403,{message:'仅公会管理者可核对拾取，提交记录不会授予分配权限'});return true;}
      if(!uuid(body.id)||!['confirm','ignore','merge','activity'].includes(body.action)||['merge','activity'].includes(body.action)&&!uuid(body.targetId))fail('核对操作无效');
      fn='req191_review_loot';args={p_guild:body.guildId,p_user:user.id,p_id:body.id,p_action:body.action,p_target:body.targetId||null};
    }else{send(404,{message:'接口不存在'});return true;}
    const result=await dependencies.write('POST','/rest/v1/rpc/'+fn,args);
    if(result.status>=400){
      const code=result.body?.code;
      if(code==='PGRST202'||code==='42883'){send(503,{message:'多人拾取服务尚未启用，请联系管理员完成升级'});return true;}
      send(code==='42501'?403:code==='P0001'?409:502,{message:code==='P0001'||code==='42501'?result.body.message:'提交未确认，请保留原文后重试',code});return true;
    }
    send(200,result.body);
  }catch(e){send(e.statusCode||500,{message:e.statusCode?e.message:'拾取服务暂不可用，请保留原文后重试'});}
  return true;
};
module.exports.normalize=normalize;
