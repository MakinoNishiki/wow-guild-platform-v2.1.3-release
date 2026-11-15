'use strict';
// All mutations require a fresh owner/editor membership; RPC checks again transactionally.
module.exports=deps=>async(req,res,cors,path)=>{
 if(!path.startsWith('/api/people/'))return false;
 const send=(status,body)=>{res.writeHead(status,{...cors,'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));};
 try{
  if(req.method!=='POST'){send(405,{message:'仅支持POST'});return true;}
  const user=await deps.auth((req.headers.authorization||'').replace(/^Bearer /,''));
  if(!user){send(401,{message:'请先登录'});return true;}
  const body=JSON.parse(await deps.body(req)),action=path.slice('/api/people/'.length);
  if(!['ensure','link','save'].includes(action)||!/^[0-9a-f-]{36}$/i.test(body.guildId||'')){send(400,{message:'请求格式无效'});return true;}
  const membership=await deps.get('/rest/v1/guild_members?guild_id=eq.'+body.guildId+'&user_id=eq.'+user.id+'&select=role');
  if(!['owner','editor'].includes(membership.body?.[0]?.role)){send(403,{message:'仅公会管理者可修改团员与考勤'});return true;}
  const result=await deps.write('POST','/rest/v1/rpc/req195_people_write',{p_actor:user.id,p_guild:body.guildId,p_action:action,p_body:body});
  if(result.status>=400){send(400,{message:result.body?.code==='P0001'?result.body.message:'团员考勤保存失败，请检查配置并重试'});return true;}
  send(200,result.body);
 }catch(e){send(e.statusCode||400,{message:'请求失败，请保留内容重试'});}
 return true;
};
