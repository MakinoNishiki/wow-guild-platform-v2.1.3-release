'use strict';
const assert=require('node:assert/strict'),http=require('node:http');
const routes=require('../lib/wclUserRoutes.cjs');
(async()=>{
 let pending=[],posts=0,failWrite=false,persistBeforeFailure=false;
 let links=[],members=[{id:'m1',name:'角色',server:'罗宁',status:'正式',user_id:null}],mode='free';
 const handler=routes({auth:async token=>token==='ok'?{id:'me'}:null,role:async(g,u)=>g==='g'?'viewer':null,
  body:async req=>{let s='';for await(const x of req)s+=x;return s;},
  get:async p=>({status:200,body:p.includes('wcl_user_links')?links:p.includes('raid_members')?members:p.includes('claim_requests')?pending:[{claim_mode:mode}]}),
  write:async(method,p,b)=>{if(p.includes('claim_requests')){posts++;if(!failWrite||persistBeforeFailure)pending=[{id:'request',...b}];return {status:failWrite?522:201,body:pending};}if(p.includes('wcl_user_links')){links=method==='DELETE'?[]:[b];return {status:200,body:links};}if(p.includes('raid_members')){assert.ok(p.includes('user_id=is.null'));if(members[0].user_id)return {status:200,body:[]};members[0].user_id=b.user_id;return{status:200,body:[members[0]]};}return{status:200,body:[b]};},
  exchange:async()=>({id:10,name:'test',characters:[{id:1,name:'角色',claimed:true,server:{name:'罗宁',region:{slug:'CN'}}}]})});
 const server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;process.env.WCL_USER_REDIRECT_URI=base+'/api/wcl/user/callback';process.env.WCL_CLIENT_ID='test';
 const api=async(action,body)=>{const r=await fetch(base+'/api/wcl/user/'+action,{method:body?'POST':'GET',headers:{Authorization:'Bearer ok',Origin:base,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'manual'});return{r,json:await r.json()};};
 try{
  assert.equal((await fetch(base+'/api/wcl/user/status')).status,401);
  assert.equal((await api('status')).json.link,null);
  const start=await api('start',{}),u=new URL(start.json.url),state=u.searchParams.get('state'),cookie=start.r.headers.get('set-cookie').split(';')[0];
  assert.equal(u.searchParams.get('scope'),'view-user-profile');
  const cb=await fetch(base+'/api/wcl/user/callback?'+new URLSearchParams({state,code:'x'}),{headers:{Cookie:cookie},redirect:'manual'});
  assert.equal(cb.status,303);assert.equal(links.length,0);
  assert.equal((await api('result?result='+state)).json.characterCount,1);assert.equal(links.length,0);
  const finish=await api('finish',{result:state,guildId:'g'});assert.equal(finish.r.status,200);assert.equal(links.length,1);assert.equal(finish.json.candidates[0].status,'available');
  const retried=await api('finish',{result:state,guildId:'g'});assert.equal(retried.r.status,200);assert.equal(retried.json.evidence,finish.json.evidence);assert.equal(links.length,1);
  const claimed=await api('claim',{guildId:'g',evidence:finish.json.evidence,memberIds:['m1','fake']});assert.equal(claimed.json.results[0].status,'claimed');assert.equal(claimed.json.results[1].status,'failed');
  assert.equal((await api('claim',{guildId:'other',evidence:finish.json.evidence,memberIds:['m1']})).r.status,400);
  mode='approval';members[0].user_id=null;
  const claimBody={guildId:'g',evidence:finish.json.evidence,memberIds:['m1']};
  assert.equal((await api('claim',claimBody)).json.results[0].status,'requested');
  assert.equal((await api('claim',claimBody)).json.results[0].status,'requested');assert.equal(posts,1);
  pending=[];failWrite=true;persistBeforeFailure=true;
  assert.equal((await api('claim',claimBody)).json.results[0].status,'requested');assert.equal(posts,2);
  pending=[];persistBeforeFailure=false;
  assert.equal((await api('claim',claimBody)).json.results[0].status,'failed');assert.equal(posts,3);
  members[0].user_id='me';
  await api('unlink',{});assert.equal(links.length,0);assert.equal(members[0].user_id,'me');
  assert.equal((await api('claim',{guildId:'g',evidence:finish.json.evidence,memberIds:['m1']})).r.status,400);
  console.log('REQ185 routes PASS: auth, confirmed linking, exact preview, conditional claims, forged candidate rejection, scope isolation, unlink preserving claims');
 }finally{await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
