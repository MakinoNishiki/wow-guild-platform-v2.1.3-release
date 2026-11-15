'use strict';
// REQ-193: source facts are read server-side. No client supplied loot facts are trusted.
const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const error = (message, statusCode=400) => { throw Object.assign(new Error(message), {statusCode}); };
module.exports = async function allocate(deps, user, body) {
  const {guildId, sourceDropId, id, characterId, activityId} = body;
  if (!uuid(sourceDropId) || id!=null&&!uuid(id) || characterId!=null&&!uuid(characterId) || activityId!=null&&!uuid(activityId)) error('分配关联编号无效');
  const read = async path => {
    const result=await deps.get('/rest/v1/'+path);
    if(result.status>=400||!Array.isArray(result.body))error('读取分配资料失败，请重试',502);
    return result.body;
  };
  const [drop]=await read(`loot_drops?id=eq.${sourceDropId}&guild_id=eq.${guildId}&limit=1`);
  if(!drop)error('拾取记录不存在或不属于当前公会',404);
  if(drop.review_status!=='confirmed'||drop.quantity!==1)error('请先核对为单件拾取，再确认分配',409);
  const [existing]=await read(`loot_records?source_drop_id=eq.${sourceDropId}&guild_id=eq.${guildId}&limit=1`);
  if(id&&existing?.id!==id)error('分配记录已变化，请关闭后重新打开',409);
  // Retried creation never overwrites a manager's subsequent decision.
  if(!id&&existing)return {id:existing.id,repeated:true};
  if(!['待分配','已分配'].includes(body.status))error('请选择待分配或已分配');
  let member=null;
  if(characterId){
    [member]=await read(`raid_members?id=eq.${characterId}&guild_id=eq.${guildId}&limit=1`);
    if(!member||['离队','inactive'].includes(member.status))error('最终获得者不在当前公会活跃名单中');
  }
  if(body.status==='已分配'&&!member)error('请明确选择最终获得者，拾取人不会自动作为获得者');
  if(body.status==='待分配'&&member)error('待分配请清空最终获得者，或改为已分配');
  let activity=null;
  if(activityId){
    [activity]=await read(`activities?id=eq.${activityId}&guild_id=eq.${guildId}&limit=1`);
    if(!activity||activity.status==='cancelled')error('活动不存在、已取消或不属于当前公会');
  }
  const text=(key,max)=>{
    const v=body[key]??'';
    if(typeof v!=='string'||v.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v))error('分配字段无效：'+key);
    return v.trim();
  };
  const boss=text('boss',160),note=text('note',2000);
  const method=body.method||'custom';
  if(!['roll','roll_rule','cl','master_loot','dkp','epgp','gkp','custom'].includes(method))error('分配方式无效');
  const roll=body.rollValue??null;
  if(roll!==null&&(!Number.isInteger(roll)||roll<1||roll>100))error('Roll点须为1至100');
  const snapshot=existing?.item_stats?.pickup_source||{player_name:drop.player_name,player_server:drop.player_server,
    boss_name:drop.boss_name,timestamp:drop.timestamp,item_link:drop.item_link,official_item_id:drop.official_item_id,
    icon_id:drop.icon_id,quality:drop.quality};
  const date=new Date(drop.timestamp);
  if(!Number.isFinite(date.getTime()))error('拾取时间无效，请先核查来源');
  const row={guild_id:guildId,source_drop_id:drop.id,item_name:drop.item_name,item_category:drop.item_type||'',
    item_slot:drop.slot_cn||drop.slot||'',item_level:drop.ilvl||0,raid_name:drop.instance_name||'',difficulty:drop.difficulty||'',
    boss_name:boss,character_id:member?.id||null,member_name:member?.name||'',assigned_by:user.id,
    obtained_date:existing?.obtained_date||new Date(date.getTime()+8*3600000).toISOString().slice(0,10),
    distribution_method:method,roll_value:roll,note,
    item_stats:{...(existing?.item_stats||{}),status:body.status,assignedTo:member?.name||'',priority:existing?.item_stats?.priority||'P2',
      pickup_source:snapshot,activity_id:activity?.id||null,activity_name:activity?.name||'',activity_date:activity?.activity_date||''}};
  const result=await deps.write(id?'PATCH':'POST','/rest/v1/loot_records'+(id?`?id=eq.${id}&guild_id=eq.${guildId}`:''),row);
  if(result.status>=400){
    if(!id&&result.body?.code==='23505'){
      const [saved]=await read(`loot_records?source_drop_id=eq.${drop.id}&guild_id=eq.${guildId}&limit=1`);
      if(saved)return {id:saved.id,repeated:true};
    }
    error(result.body?.code==='P0001'?result.body.message:'分配保存未确认，请保留表单重试',409);
  }
  const saved=Array.isArray(result.body)?result.body[0]:result.body;
  if(!saved?.id)error('分配保存结果未确认，请重试',502);
  return {id:saved.id,repeated:false};
};
