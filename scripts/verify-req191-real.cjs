// Actual Chrome + isolated Supabase; synthetic raid events, never live game/production.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const {chromium}=require('playwright');
module.exports=async config=>{
  assert.equal(config.ENVIRONMENT,'isolated-test');assert.equal(config.SUPABASE_URL,'http://127.0.0.1:18000');
  const out='docs/evidence/req191-20261113';fs.mkdirSync(out,{recursive:true});
  const headers={apikey:config.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+config.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json',Prefer:'return=representation'};
  const call=async(path,method='GET',body)=>{const r=await fetch(config.SUPABASE_URL+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();assert(r.ok,path+' '+r.status+' '+text.slice(0,160));return text?JSON.parse(text):null;};
  const checks=[],errors=[],users=[],guilds=[];let browser,op,vp;
  const check=(name,ok)=>{assert(ok,name);checks.push(name);console.log('PASS '+name);};
  const createUser=async()=>{const email='req191-'+crypto.randomBytes(5).toString('hex')+'@example.com',password=crypto.randomBytes(24).toString('base64url');const u=await call('/auth/v1/admin/users','POST',{email,password,email_confirm:true});users.push(u.id);return{...u,email,password};};
  const createGuild=async u=>{const[g]=await call('/rest/v1/guilds','POST',{name:'多人拾取隔离测试',owner_id:u.id,invite_code:crypto.randomBytes(4).toString('hex')});guilds.push(g.id);await call('/rest/v1/guild_members','POST',{guild_id:g.id,user_id:u.id,role:'owner'});return g;};
  const login=async u=>{const ctx=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1366,height:900}}),p=await ctx.newPage();
    await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
    await p.route('**/api/track',r=>r.fulfill({status:204}));p.on('pageerror',e=>errors.push(e.message));
    await p.goto('http://127.0.0.1:18779/#/home');await p.getByRole('button',{name:'登录 / 注册',exact:true}).first().click();
    await p.locator('#authEmail').fill(u.email);await p.locator('#authPassword').fill(u.password);await p.locator('#authLoginBtn').click();
    await p.waitForFunction(()=>CloudSync.getCurrentGuild()&&!document.getElementById('authOverlay').offsetHeight);
    await p.goto('http://127.0.0.1:18779/#/team/loot');await p.waitForFunction(()=>CloudSync.getCurrentGuild());await p.locator('#lootViewTabs [data-lootview="drops"]').click();return p;};
  const api=(p,path,body,method='POST')=>p.evaluate(async({path,body,method})=>{const r=await fetch(path,{method,headers:{Authorization:'Bearer '+await CloudSync.getAccessToken(),'Content-Type':'application/json'},body:JSON.stringify(body)});return{status:r.status,body:await r.json()};},{path,body,method});
  try{
    const owner=await createUser(),viewer=await createUser(),outsider=await createUser();const guild=await createGuild(owner),foreign=await createGuild(outsider);
    await call('/rest/v1/guild_members','POST',{guild_id:guild.id,user_id:viewer.id,role:'viewer'});
    const[activity]=await call('/rest/v1/activities','POST',{guild_id:guild.id,name:'多人拾取测试活动',activity_date:'2026-11-13'});
    const[otherActivity]=await call('/rest/v1/activities','POST',{guild_id:foreign.id,name:'其他公会活动',activity_date:'2026-11-13'});
    browser=await chromium.launch({channel:'chrome',headless:true});op=await login(owner);vp=await login(viewer);
    const time=Math.floor(Date.now()/1000)-60;
    const sample={playerName:'测试拾取者',playerServer:'金色平原',playerRegion:'5',itemID:268236,itemName:'测试团本装备',itemLink:'|Hitem:268236:0:0:0:0:0:0:0:90:0:0:0:1:12345|h[测试团本装备]|h',quality:4,ilvl:318,slot:'INVTYPE_HEAD',difficultyID:16,instanceName:'测试团本',bossName:'测试首领',encounterID:123,encounterAt:time-5,timestamp:time,quantity:1,captureVersion:'1.0.5',bindingStatus:'ordinary',collectorSourceID:'observer-a',sourceEventID:'1'};
    const submit=(p,rows,activityId=activity.id,guildId=guild.id)=>api(p,'/api/loot-observations/submit',{guildId,activityId,rows});
    const drops=()=>call('/rest/v1/loot_drops?guild_id=eq.'+guild.id);
    const refresh=async p=>{await p.evaluate(async()=>{await CloudSync.reloadData('lootDrops');lootDropsRenderTable();});};
    await vp.locator('#lootViewDrops .toolbar-right button').click();await vp.locator('#lootDropActivity').selectOption(activity.id);
    await vp.locator('#lootDropImportText').fill(JSON.stringify([sample,sample]));await vp.getByRole('button',{name:'解析预览',exact:true}).click();
    check('同批重复只选择一次',await vp.locator('#lootDropImportPreview input:checked').count()===1);
    await vp.locator('#lootDropImportConfirmBtn').click();await vp.waitForFunction(()=>!lootDropImportSaving&&!document.getElementById('lootDropImportModal').classList.contains('show'));
    let list=await drops();const id=list[0].id;check('普通成员真实页面提交且独立回读一条',list.length===1&&list[0].observation_count===1&&list[0].review_status==='pending');
    check('普通成员无核对按钮',!(await vp.locator('[data-drop-review]').first().isVisible()));
    const replay=await submit(vp,[sample]);check('重传幂等',replay.status===200&&replay.body.repeated===1&&(await drops()).length===1);
    const parallel=await Promise.all([submit(op,[{...sample,collectorSourceID:'observer-b',timestamp:time+1}]),submit(vp,[{...sample,collectorSourceID:'observer-c',timestamp:time-1}])]);
    check('双账号并发且相差一秒归并',parallel.every(r=>r.status===200&&r.body.merged===1)&&(await drops())[0].observation_count===3);
    const spoof=await api(vp,'/api/loot-observations/submit',{guildId:guild.id,activityId:activity.id,submitter_user_id:owner.id,rows:[{...sample,collectorSourceID:'spoof',submitter_user_id:owner.id}]});
    check('伪造提交人不能代替登录人',spoof.status===200&&(await call('/rest/v1/loot_drop_observations?guild_id=eq.'+guild.id+'&collector_source_id=eq.spoof'))[0].submitter_user_id===viewer.id);
    check('普通成员不能核对',(await api(vp,'/api/loot-observations/review',{guildId:guild.id,id,action:'confirm'})).status===403);
    check('普通成员直接写分配被拒绝',(await api(vp,'/api/db/rest/v1/loot_records',{guild_id:guild.id,item_name:'越权'})).status===403);
    check('旧通用拾取写口不能绕过事务',(await api(op,'/api/db/rest/v1/loot_drops',{guild_id:guild.id,player_name:'绕过',item_name:'绕过',timestamp:new Date().toISOString()})).status===403);
    check('跨公会提交拒绝',(await submit(op,[sample],otherActivity.id,foreign.id)).status===403);
    check('活动归属验证',(await submit(vp,[{...sample,sourceEventID:'bad-activity'}],otherActivity.id)).status===409);
    check('同来源同ID内容冲突不覆盖',(await submit(vp,[{...sample,ilvl:321}])).status===409);
    check('战团绑定拒绝',(await submit(vp,[{...sample,sourceEventID:'warbound',bindingStatus:'account'}])).status===400);
    check('随机团拒绝',(await submit(vp,[{...sample,sourceEventID:'lfr',difficultyID:17}])).status===400);
    await refresh(op);await op.locator('[data-drop-review="'+id+'"]').click();await op.locator('[data-review-confirm]').waitFor();
    await op.screenshot({path:out+'/review-1366.png',fullPage:true});
    op.once('dialog',d=>d.accept());await op.locator('[data-review-confirm]').click();await op.waitForFunction(()=>lootDropDeleting.size===0&&!document.getElementById('lootDropReviewModal').classList.contains('show'));
    check('管理者真实页面核对保存',(await drops())[0].review_status==='confirmed');
    await call('/rest/v1/guild_members?guild_id=eq.'+guild.id+'&user_id=eq.'+viewer.id,'PATCH',{role:'editor'});
    check('非会长管理员可以核对',(await api(vp,'/api/loot-observations/review',{guildId:guild.id,id,action:'confirm'})).status===200);
    await call('/rest/v1/guild_members?guild_id=eq.'+guild.id+'&user_id=eq.'+viewer.id,'PATCH',{role:'viewer'});
    check('撤回管理权限立即生效',(await api(vp,'/api/loot-observations/review',{guildId:guild.id,id,action:'confirm'})).status===403);
    // Fault injection is explicit and only intercepts the isolated HTTP endpoint.
    let fail=true;await op.route('**/api/loot-observations/review',r=>fail?r.fulfill({status:503,json:{message:'隔离故障'}}):r.continue());
    op.once('dialog',d=>d.accept());await op.locator('[data-drop-delete="'+id+'"]').click();await op.waitForFunction(()=>lootDropDeleting.size===0);
    check('忽略失败保留数据和恢复按钮',(await drops())[0].review_status==='confirmed'&&await op.locator('[data-drop-delete="'+id+'"]').isEnabled());
    fail=false;op.once('dialog',d=>d.accept());await op.locator('[data-drop-delete="'+id+'"]').click();await op.waitForFunction(()=>lootDropDeleting.size===0&&!document.querySelector('[data-drop-delete]'));
    check('忽略保留数据库证据',(await drops())[0].review_status==='ignored');
    const ignored=await submit(vp,[{...sample,collectorSourceID:'observer-d'}]);check('另一来源重传不恢复误录',ignored.status===200&&ignored.body.ignored===1&&(await drops())[0].review_status==='ignored');
    await op.reload();await op.waitForFunction(()=>CloudSync.getCurrentGuild());await op.locator('#lootViewTabs [data-lootview="drops"]').click();await op.locator('#lootDropsShowIgnored').check();await op.locator('[data-drop-review]').first().waitFor();
    check('刷新后可查看已忽略记录',await op.locator('#lootDropsTableBody').innerText().then(t=>t.includes('已忽略')));
    // Two legitimate events from the SAME observer must never disappear behind a time window.
    const two=[{...sample,timestamp:time+30,encounterAt:time+25,sourceEventID:'2'},{...sample,timestamp:time+31,encounterAt:time+25,sourceEventID:'3'}];
    const twoResult=await submit(vp,two);check('同人同物品两件保留两条待核对',twoResult.status===200&&twoResult.body.created===2&&(await drops()).filter(d=>d.review_status==='needs_review').length===2);
    const distinct=await submit(vp,[{...sample,sourceEventID:'realm',playerServer:'罗宁'},{...sample,sourceEventID:'heroic',difficultyID:15},{...sample,sourceEventID:'variant',itemLink:sample.itemLink.replace('12345','67890')}]);
    check('不同服务器难度变体不归并',distinct.status===200&&distinct.body.created===3);
    check('手动合并也禁止跨难度',(await api(op,'/api/loot-observations/review',{guildId:guild.id,id:distinct.body.ids[0],action:'merge',targetId:distinct.body.ids[1]})).status===409);
    const incomplete=await submit(vp,[{...sample,sourceEventID:'missing',playerServer:''}],null);check('缺活动服务器留待核对',incomplete.status===200&&(await drops()).find(d=>d.id===incomplete.body.ids[0]).review_status==='needs_review');
    await refresh(op);await op.locator('[data-drop-review="'+incomplete.body.ids[0]+'"]').click();await op.locator('#lootDropReviewActivity').selectOption(activity.id);op.once('dialog',d=>d.accept());await op.locator('[data-review-activity]').click();await op.waitForFunction(()=>lootDropDeleting.size===0&&!document.getElementById('lootDropReviewModal').classList.contains('show'));
    check('真实页面更正活动并同步证据',(await drops()).find(d=>d.id===incomplete.body.ids[0]).activity_id===activity.id&&(await call('/rest/v1/loot_drop_observations?canonical_drop_id=eq.'+incomplete.body.ids[0])).every(o=>o.activity_id===activity.id));
    check('更正活动后重新提交仍幂等',(await submit(vp,[{...sample,sourceEventID:'missing',playerServer:''}])).body.repeated===1);
    // Manual merge is an explicit manager decision; use two uncertain rows with matching identity.
    const uncertain=await submit(vp,[{...sample,sourceEventID:'u1',timestamp:time+100,playerServer:''},{...sample,sourceEventID:'u2',timestamp:time+101,playerServer:''}]);
    await refresh(op);const[from,to]=uncertain.body.ids;await op.locator('[data-drop-review="'+from+'"]').click();await op.locator('#lootDropMergeTarget').selectOption(to);op.once('dialog',d=>d.accept());await op.locator('[data-review-merge]').click();await op.waitForFunction(()=>lootDropDeleting.size===0&&!document.getElementById('lootDropReviewModal').classList.contains('show'));
    check('真实页面人工合并保留两份来源',(await drops()).find(d=>d.id===to).observation_count===2&&(await drops()).find(d=>d.id===from).review_status==='merged');
    // Check direct authenticated RPC denial and observation RLS using the actual JWT.
    const token=await vp.evaluate(()=>CloudSync.getAccessToken());const userHeaders={apikey:config.SUPABASE_ANON_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'};
    const forbidden=await fetch(config.SUPABASE_URL+'/rest/v1/rpc/req191_submit_loot',{method:'POST',headers:userHeaders,body:JSON.stringify({p_guild:guild.id,p_user:owner.id,p_activity:activity.id,p_rows:[]})});check('用户JWT不能直调服务角色RPC',forbidden.status===403||forbidden.status===401);
    const visible=await fetch(config.SUPABASE_URL+'/rest/v1/loot_drop_observations?guild_id=eq.'+guild.id,{headers:userHeaders});const visibleRows=await visible.json();check('普通成员只能读取本人采集来源',visible.ok&&visibleRows.length>0&&visibleRows.every(o=>o.submitter_user_id===viewer.id));
    await call('/rest/v1/loot_records','POST',{guild_id:guild.id,item_name:'保留手工分配'});check('导入核对不会自动分配',(await call('/rest/v1/loot_records?guild_id=eq.'+guild.id)).length===1);
    await api(op,'/api/loot-observations/review',{guildId:guild.id,id:to,action:'confirm'});
    const [allocation]=await call('/rest/v1/loot_records','POST',{guild_id:guild.id,item_name:'来源约束测试',source_drop_id:to});
    const insertSource=body=>fetch(config.SUPABASE_URL+'/rest/v1/loot_records',{method:'POST',headers,body:JSON.stringify(body)});
    check('分配来源只能关联一份',(await insertSource({guild_id:guild.id,item_name:'重复关联',source_drop_id:to})).status===409);
    check('分配来源不能跨公会',(await insertSource({guild_id:foreign.id,item_name:'跨公会关联',source_drop_id:to})).status>=400);
    check('已关联分配的拾取不能被忽略',(await api(op,'/api/loot-observations/review',{guildId:guild.id,id:to,action:'ignore'})).status===409);
    await call('/rest/v1/loot_records?id=eq.'+allocation.id,'DELETE');
    // Force >1000 canonical rows via service-role fixtures, not public import.
    for(let offset=0;offset<1100;offset+=100)await call('/rest/v1/loot_drops','POST',Array.from({length:100},(_,i)=>({guild_id:guild.id,player_name:'分页样本',item_name:'历史分页'+(offset+i),official_item_id:1,timestamp:new Date((time-10000-offset-i)*1000).toISOString()})));
    await refresh(op);check('1000行以上读取完整',await op.evaluate(()=>appData.lootDrops.length)===(await fetch(config.SUPABASE_URL+'/rest/v1/loot_drops?guild_id=eq.'+guild.id+'&select=id',{headers:{...headers,Prefer:'count=exact',Range:'0-0'}}).then(r=>Number(r.headers.get('content-range').split('/')[1]))));
    await op.locator('#lootDropsSearch').fill('测试团本装备');await op.screenshot({path:out+'/list-1366.png',fullPage:true});await op.setViewportSize({width:1920,height:1080});await op.screenshot({path:out+'/list-1920.png',fullPage:true});
    await call('/rest/v1/guild_members?guild_id=eq.'+guild.id+'&user_id=eq.'+viewer.id,'DELETE');check('退出公会后即刻不能提交',(await submit(vp,[{...sample,sourceEventID:'after-leave'}])).status===403);
    check('无未捕获页面异常',errors.length===0);
    fs.writeFileSync(out+'/verification.json',JSON.stringify({checks,errors,environment:'Chrome + isolated Supabase; synthetic fixtures; one intentional review 503; tracking blocked'},null,2));
  }catch(e){if(op)await op.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});throw e;}
  finally{if(browser)await browser.close();for(const id of guilds)await call('/rest/v1/guilds?id=eq.'+id,'DELETE');for(const id of users)await call('/auth/v1/admin/users/'+id,'DELETE');fs.writeFileSync(out+'/cleanup.json',JSON.stringify({users:users.length,guilds:guilds.length,removed:true}));}
};
