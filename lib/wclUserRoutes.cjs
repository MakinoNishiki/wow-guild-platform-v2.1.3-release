'use strict';
const crypto=require('node:crypto');
const {matchCharacters,claimAction,createEvidenceStore}=require('./wclClaims.cjs');
module.exports=function createRoutes(d) {
 const sessions=new Map(), evidence=createEvidenceStore();
 const enc=encodeURIComponent;
 const check=r=>{if(r.status<200||r.status>=300)throw Error('数据库操作失败，请重试');return r.body;};
 const get=async p=>check(await d.get('/rest/v1/'+p));
 const write=async(m,p,b)=>check(await d.write(m,'/rest/v1/'+p,b));
 const link=async uid=>(await get('wcl_user_links?user_id=eq.'+enc(uid)+'&select=*'))[0]||null;
 return async function(req,res) {
  const url=new URL(req.url,'http://local');if(!url.pathname.startsWith('/api/wcl/user/'))return false;
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try {
   const callback=process.env.WCL_USER_REDIRECT_URI;
   let cb;try{cb=new URL(callback);}catch{}
   const configured=cb&&cb.pathname==='/api/wcl/user/callback'&&(cb.protocol==='https:'||(cb.protocol==='http:'&&['127.0.0.1','localhost'].includes(cb.hostname)));
   if(url.pathname.endsWith('/callback')) {
    const state=url.searchParams.get('state'),s=sessions.get(state);sessions.delete(state);
    const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('wb_wcl='));
    if(!configured||!s||s.expires<Date.now()||cookie!=='wb_wcl='+s.cookie) {send(403,{message:'授权已过期，请重新开始'});return true;}
    if(url.searchParams.has('error')||!url.searchParams.get('code')) {send(400,{message:'授权已取消，未修改关联'});return true;}
    const identity=await d.exchange(url.searchParams.get('code'),callback);
    if(!Number.isSafeInteger(identity.id)||!Array.isArray(identity.characters))throw Error('WCL账号信息无效');
    s.identity=identity;s.ready=true;s.expires=Date.now()+600000;sessions.set(state,s);
    res.writeHead(303,{Location:cb.origin+'/index.html?wclResult='+enc(state)+'#/home','Referrer-Policy':'no-referrer','Cache-Control':'no-store'});res.end();return true;
   }
   const token=(req.headers.authorization||'').replace(/^Bearer /,'');const user=token&&await d.auth(token);
   if(!user){send(401,{message:'请重新登录'});return true;}
   const action=url.pathname.slice('/api/wcl/user/'.length);
   let body={};if(req.method==='POST') {body=JSON.parse(await d.body(req)||'{}');if(!configured||req.headers.origin!==cb.origin){send(403,{message:'请求来源无效'});return true;}}
   if(action==='status'&&req.method==='GET'){send(200,{link:await link(user.id),configured:!!configured});return true;}
   if(action==='result'&&req.method==='GET'){const s=sessions.get(url.searchParams.get('result'));if(!s||s.uid!==user.id||!s.ready||s.expires<Date.now())throw Error('授权结果已过期，请重新授权');send(200,{name:s.identity.name,characterCount:s.identity.characters.length});return true;}
   if(action==='start'&&req.method==='POST') {
    for(const [k,v]of sessions)if(v.expires<Date.now()||v.uid===user.id)sessions.delete(k);
    if(sessions.size>=500)throw Error('授权请求过多，请稍后重试');
    const state=crypto.randomBytes(32).toString('hex'),cookie=crypto.randomBytes(32).toString('hex');
    sessions.set(state,{uid:user.id,cookie,expires:Date.now()+600000});
    res.setHeader('Set-Cookie',`wb_wcl=${cookie}; HttpOnly; SameSite=Lax; Path=/api/wcl/user; Max-Age=600${cb.protocol==='https:'?'; Secure':''}`);
    send(200,{url:'https://www.warcraftlogs.com/oauth/authorize?'+new URLSearchParams({client_id:process.env.WCL_CLIENT_ID,redirect_uri:callback,response_type:'code',scope:'view-user-profile',state})});return true;
   }
   if(action==='finish'&&req.method==='POST') {
    const s=sessions.get(body.result);if(!s||s.uid!==user.id||!s.ready||s.expires<Date.now())throw Error('授权结果已过期，请重新授权');
    if(s.completed) {
     const current=await link(user.id);
     if(!current||String(current.wcl_user_id)!==String(s.identity.id)||s.completedGuild!==(body.guildId||null))throw Error('关联或公会已变化，请重新验证');
     if(body.guildId&&!await d.role(body.guildId,user.id))throw Error('无权访问该公会');
     send(200,s.completed);return true;
    }
    const guild=body.guildId;
    if(guild && !await d.role(guild,user.id))throw Error('无权访问该公会');
    const existing=await link(user.id);if(existing&&String(existing.wcl_user_id)!==String(s.identity.id))throw Error('请先解除原WCL账号关联');
    try {if(existing)await write('PATCH','wcl_user_links?user_id=eq.'+enc(user.id),{wcl_user_name:s.identity.name,verified_at:new Date().toISOString()});
    else await write('POST','wcl_user_links',{user_id:user.id,wcl_user_id:s.identity.id,wcl_user_name:s.identity.name});}catch{throw Error('关联保存失败：账号可能已被关联，请重试或联系管理员');}
    // Keep verified characters briefly for a separately confirmed preview; no tokens.
    let result={link:await link(user.id),candidates:[],evidence:null};
    if(guild){const role=await d.role(guild,user.id);if(!role)throw Error('无权访问该公会');
     const members=await get('raid_members?guild_id=eq.'+enc(guild)+'&select=id,name,server,class,status,user_id');
     const g=(await get('guilds?id=eq.'+enc(guild)+'&select=claim_mode'))[0];
     result.candidates=matchCharacters(s.identity.characters,members,user.id);result.action=claimAction(g.claim_mode||'free',role);
     result.evidence=evidence.issue(user.id,guild,s.identity.characters,s.identity.id);
    }s.completed=result;s.completedGuild=guild||null;send(200,result);return true;
   }
   if(action==='unlink'&&req.method==='POST'){await write('DELETE','wcl_user_links?user_id=eq.'+enc(user.id),null);evidence.revokeUser(user.id);for(const[k,v]of sessions)if(v.uid===user.id)sessions.delete(k);send(200,{ok:true});return true;}
   if(action==='claim'&&req.method==='POST') {
    const proof=evidence.read(body.evidence,user.id,body.guildId);if(!proof)throw Error('角色验证已过期，请重新授权');
    const l=await link(user.id);if(!l||String(l.wcl_user_id)!==String(proof.wclUserId))throw Error('账号关联已变化，请重新验证');
    if(!Array.isArray(body.memberIds)||body.memberIds.length>100)throw Error('请选择有效角色');
    const results=[];
    // Development standard 1.2.2: confirmed batch, server validates each row; caller reloads once.
    for(const id of new Set(body.memberIds))try {
     const role=await d.role(body.guildId,user.id),g=(await get('guilds?id=eq.'+enc(body.guildId)+'&select=claim_mode'))[0];
     const mode=claimAction(g&&g.claim_mode||'free',role);if(mode==='forbidden')throw Error('本公会由管理者统一分配或权限已变更');
     const members=await get('raid_members?guild_id=eq.'+enc(body.guildId)+'&select=id,name,server,class,status,user_id');
     const candidate=matchCharacters(proof.characters,members,user.id).find(x=>x.memberId===id);
     if(!candidate||!['available','owned'].includes(candidate.status))throw Error('角色已被认领或信息变化');
     if(candidate.status==='owned'){results.push({id,status:'owned'});continue;}
     if(mode==='request') {
      const pendingPath='claim_requests?guild_id=eq.'+enc(body.guildId)+'&member_id=eq.'+enc(id)+'&user_id=eq.'+enc(user.id)+'&status=eq.pending&select=id';
      const existingRequests=await get(pendingPath);
      if(!Array.isArray(existingRequests))throw Error('认领申请核对失败，请重试');
      if(!existingRequests.length) {
       try {await write('POST','claim_requests',{guild_id:body.guildId,member_id:id,user_id:user.id});}
       catch(error) {
        // Lost response or competing retry: only this user's persisted pending row proves success.
        const recovered=await get(pendingPath);
        if(!Array.isArray(recovered)||!recovered.length)throw error;
       }
      }
      results.push({id,status:'requested'});
     }
     else {const rows=await write('PATCH','raid_members?id=eq.'+enc(id)+'&guild_id=eq.'+enc(body.guildId)+'&user_id=is.null',{user_id:user.id});if(!Array.isArray(rows)||rows.length!==1)throw Error('角色刚被其他人认领');results.push({id,status:'claimed'});}
    }catch(e){results.push({id,status:'failed',message:e.message});}
    send(200,{results});return true;
   }
   send(404,{message:'接口不存在'});
  }catch(e){send(400,{message:e.message||'操作失败，请重试'});}return true;
 };
};
