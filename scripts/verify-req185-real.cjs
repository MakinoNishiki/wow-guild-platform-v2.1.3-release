const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const {chromium}=require('playwright');
const fixture=require('./req185-wcl-fixture.cjs');
module.exports=async config=>{
 const out='docs/evidence/req185-20261106';fs.mkdirSync(out,{recursive:true});const checks=[],errors=[];
 const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('PASS '+name);};
 const base=config.SUPABASE_URL,origin='http://127.0.0.1:18779';
 const service={apikey:config.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+config.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json',Prefer:'return=representation'};
 const request=async(url,options={})=>{const r=await fetch(url,options),text=await r.text();return{status:r.status,body:text?JSON.parse(text):null};};
 const db=async(table,method='GET',body)=>{const r=await request(base+'/rest/v1/'+table,{method,headers:service,body:body===undefined?undefined:JSON.stringify(body)});assert.ok(r.status>=200&&r.status<300,table+' '+r.status);return r.body;};
 const users=[];let guildId,browser,page;
 try{
  for(let i=0;i<2;i++){const email='req185-'+crypto.randomBytes(5).toString('hex')+'@example.com',password=crypto.randomBytes(24).toString('base64url');const r=await request(base+'/auth/v1/admin/users',{method:'POST',headers:service,body:JSON.stringify({email,password,email_confirm:true})});assert.equal(r.status,200);const l=await request(base+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:config.SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(l.status,200);users.push({id:r.body.id,email,password,token:l.body.access_token});}
  guildId=(await db('guilds','POST',{name:'REQ185隔离',owner_id:users[0].id,invite_code:crypto.randomBytes(5).toString('hex')}))[0].id;
  await db('guild_members','POST',users.map((u,i)=>({guild_id:guildId,user_id:u.id,role:i?'viewer':'owner'})));
  const members=await db('raid_members','POST',[{name:'验证甲',server:'罗宁'},{name:'验证乙',server:'罗宁'},{name:'验证丙',server:'金色平原'}].map(x=>({...x,guild_id:guildId,class:'战士',spec:'防护',role:'坦克',status:'正式'})));
  fixture.identity={id:185001,name:'隔离WCL用户',characters:members.map((m,i)=>({id:18500+i,canonicalID:18500+i,name:m.name,claimed:true,classID:11,server:{name:m.server,region:{slug:'CN'}}}))};
  browser=await chromium.launch({channel:'chrome',headless:true});const ctx=await browser.newContext({viewport:{width:1366,height:900},ignoreHTTPSErrors:true});page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto(origin+'/#/home');await page.waitForFunction(()=>typeof handleLogin==='function');
  await page.getByRole('button',{name:'登录 / 注册',exact:true}).first().click();await page.locator('#authEmail').fill(users[0].email);await page.locator('#authPassword').fill(users[0].password);await page.locator('#authLoginBtn').click();await page.waitForFunction(()=>CloudSync.getCurrentGuild()?.id);
  const api=async(action,body,user=users[0])=>{const r=await page.request.fetch(origin+'/api/wcl/user/'+action,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+user.token,Origin:origin,'Content-Type':'application/json'},data:body?JSON.stringify(body):undefined,maxRedirects:0});return{status:r.status(),body:await r.json()};};
  const authorize=async(user=users[0])=>{const s=await api('start',{},user);assert.equal(s.status,200);const u=new URL(s.body.url),state=u.searchParams.get('state');await page.goto(origin+'/api/wcl/user/callback?'+new URLSearchParams({state,code:'fake'}));return state;};
  const state=await authorize();check('OAuth回调不写关联',(await db('wcl_user_links')).length===0);
  await page.waitForFunction(()=>CloudSync.getCurrentGuild()?.id);await page.evaluate(async()=>{await openUserCenter();switchUserTab('claims');});
  await page.getByRole('button',{name:'确认关联并查看角色',exact:true}).click();await page.locator('[data-wcl-index="0"]').waitFor();
  check('真实UI确认后写入关联',(await db('wcl_user_links'))[0].user_id===users[0].id);
  check('关联未自动认领',(await db('raid_members?guild_id=eq.'+guildId)).every(x=>!x.user_id));
  await page.locator('[data-wcl-index="0"]').check();await page.getByRole('button',{name:'确认认领所选角色',exact:true}).click();await page.waitForFunction(()=>!wclAccountBusy);
  check('真实UI勾选保存认领',(await db('raid_members?id=eq.'+members[0].id))[0].user_id===users[0].id);
  await page.waitForFunction(()=>document.getElementById('wclCandidateList')?.textContent.includes('认领成功'));
  await page.waitForFunction(()=>document.getElementById('myClaimsList')?.textContent.includes('验证甲'));
  check('保存后原我的认领列表同步展示',await page.locator('#myClaimsList').innerText().then(t=>t.includes('验证甲')));
  await page.screenshot({path:out+'/claimed.png',fullPage:true});
  await page.setViewportSize({width:1920,height:1080});
  check('宽屏弹窗无横向溢出',await page.locator('#userCenterModal').evaluate(e=>e.scrollWidth<=e.clientWidth));
  await page.screenshot({path:out+'/claimed-wide.png',fullPage:true});
  const proof=await page.evaluate(()=>wclClaimPreview.evidence);
  check('跨用户证据拒绝',(await api('claim',{guildId,evidence:proof,memberIds:[members[1].id]},users[1])).status===400);
  const partial=await api('claim',{guildId,evidence:proof,memberIds:[members[0].id,'forged']});check('重复幂等及伪造候选分项失败',partial.body.results[0].status==='owned'&&partial.body.results[1].status==='failed');
  const conflictState=await authorize(users[1]);const conflict=await api('finish',{result:conflictState,guildId},users[1]);check('同一WCL账号不能绑定另一用户',conflict.status===400&&(await db('wcl_user_links')).length===1);
  await api('unlink',{});check('解绑保留已认领角色',(await db('wcl_user_links')).length===0&&(await db('raid_members?id=eq.'+members[0].id))[0].user_id===users[0].id);
  check('解绑撤销证据',(await api('claim',{guildId,evidence:proof,memberIds:[members[1].id]})).status===400);
  // Reauthorize viewer with a separate WCL identity, exercise all governance modes.
  fixture.identity.id=185002;
  for(const mode of ['free','approval','assign']){
   await db('guilds?id=eq.'+guildId,'PATCH',{claim_mode:mode});
   const st=await authorize(users[1]),f=await api('finish',{result:st,guildId},users[1]);assert.equal(f.status,200);
   const id=mode==='free'?members[1].id:members[2].id;
   const r=await api('claim',{guildId,evidence:f.body.evidence,memberIds:[id]},users[1]);
   check('viewer '+mode,r.body.results[0].status===(mode==='free'?'claimed':mode==='approval'?'requested':'failed'));
   if(mode==='approval'){
    check('审核不直接认领',(await db('raid_members?id=eq.'+id))[0].user_id===null&&(await db('claim_requests?member_id=eq.'+id)).length===1);
    const retry=await api('claim',{guildId,evidence:f.body.evidence,memberIds:[id]},users[1]);
    check('审核重试不重复申请',retry.body.results[0].status==='requested'&&(await db('claim_requests?member_id=eq.'+id)).length===1);
   }
  }
  check('未登录拒绝',(await page.request.get(origin+'/api/wcl/user/status')).status()===401);
  check('无未捕获页面异常',errors.length===0);
  fs.writeFileSync(out+'/verification.json',JSON.stringify({checks,errors,environment:'real Chrome + isolated Supabase; WCL transport is explicit test fixture'},null,2));
 }catch(e){if(page)await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});throw e;}
 finally{if(browser)await browser.close();if(guildId)await db('guilds?id=eq.'+guildId,'DELETE');for(const u of users)assert.ok([200,204].includes((await request(base+'/auth/v1/admin/users/'+u.id,{method:'DELETE',headers:service})).status));}
};
