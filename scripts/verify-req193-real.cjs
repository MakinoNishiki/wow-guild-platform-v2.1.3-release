// Real Chrome + isolated Supabase. Synthetic fixtures, never production or game validation.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const {chromium}=require('playwright');
module.exports=async config=>{
  assert.equal(config.ENVIRONMENT,'isolated-test');assert.equal(config.SUPABASE_URL,'http://127.0.0.1:18000');
  const out=config.verifyLootDisplay?'docs/evidence/req194-20261116':'docs/evidence/req193-20261115';fs.mkdirSync(out,{recursive:true});
  const headers={apikey:config.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+config.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json',Prefer:'return=representation'};
  const call=async(path,method='GET',body)=>{const r=await fetch(config.SUPABASE_URL+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const t=await r.text();assert(r.ok,path+' '+r.status+' '+t.slice(0,120));return t?JSON.parse(t):null;};
  const checks=[],errors=[],users=[],guilds=[];let browser,p,v;
  const check=(name,ok)=>{assert(ok,name);checks.push(name);console.log('PASS '+name);};
  const createUser=async()=>{const email='req193-'+crypto.randomBytes(5).toString('hex')+'@example.com',password=crypto.randomBytes(24).toString('base64url');const u=await call('/auth/v1/admin/users','POST',{email,password,email_confirm:true});users.push(u.id);return {...u,email,password};};
  const createGuild=async u=>{const[g]=await call('/rest/v1/guilds','POST',{name:'分配闭环隔离测试',owner_id:u.id,invite_code:crypto.randomBytes(4).toString('hex')});guilds.push(g.id);await call('/rest/v1/guild_members','POST',{guild_id:g.id,user_id:u.id,role:'owner'});return g;};
  const login=async u=>{const c=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1366,height:768}}),page=await c.newPage();
    await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
    await page.route('**/api/track',r=>r.fulfill({status:204}));page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:18779/#/home');await page.getByRole('button',{name:'登录 / 注册',exact:true}).first().click();
    await page.locator('#authEmail').fill(u.email);await page.locator('#authPassword').fill(u.password);await page.locator('#authLoginBtn').click();
    await page.waitForFunction(()=>CloudSync.getCurrentGuild()&&!document.getElementById('authOverlay').offsetHeight);
    await page.goto('http://127.0.0.1:18779/#/team/loot');await page.waitForFunction(()=>CloudSync.getCurrentGuild());await page.locator('#lootViewTabs [data-lootview="drops"]').click();return page;};
  const api=(page,path,body,method='POST')=>page.evaluate(async({path,body,method})=>{const r=await fetch(path,{method,headers:{Authorization:'Bearer '+await CloudSync.getAccessToken(),'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};},{path,body,method});
  const waitSave=async()=>p.waitForFunction(()=>!lootAllocationBusy);
  const refresh=async()=>p.evaluate(async()=>{await CloudSync.reloadData('loots');await CloudSync.reloadData('lootDrops');lootDropsRenderTable();lootSwitchView('drops');});
  const open=async id=>{await refresh();await p.locator('[data-drop-allocate="'+id+'"]').click();await p.locator('#lootAllocationModal.show').waitFor();};
  const save=async()=>{await p.locator('#lootAllocationSave').click();await waitSave();};
  try{
    const owner=await createUser(),viewer=await createUser(),outsider=await createUser();const g=await createGuild(owner),foreign=await createGuild(outsider);
    await call('/rest/v1/guild_members','POST',{guild_id:g.id,user_id:viewer.id,role:'viewer'});
    const [m1,m2]=await call('/rest/v1/raid_members','POST',[{guild_id:g.id,name:'同名成员',server:'罗宁',class:'战士',spec:'武器',status:'正式'},{guild_id:g.id,name:'同名成员',server:'金色平原',class:'战士',spec:'武器',status:'正式'}]);
    if(config.verifyLootDisplay)await call('/rest/v1/raid_members','POST',['法师','牧师','盗贼','猎人','圣骑士','萨满','德鲁伊','术士','武僧','恶魔猎手','死亡骑士','唤魔师'].map(cls=>({guild_id:g.id,name:cls+'测试',class:cls,status:'正式'})));
    const [fm]=await call('/rest/v1/raid_members','POST',{guild_id:foreign.id,name:'外会成员',class:'战士',status:'正式'});
    for(const m of [m1,m2])await call('/rest/v1/wishlists','POST',{guild_id:g.id,member_id:m.id,items:[{id:crypto.randomUUID(),itemName:'剧毒悔恨束带',obtained:false}]});
    const [fa]=await call('/rest/v1/activities','POST',{guild_id:foreign.id,name:'外会活动',activity_date:'2026-11-15'});
    browser=await chromium.launch({channel:'chrome',headless:true});p=await login(owner);v=await login(viewer);
    const time=Math.floor(Date.now()/1000)-60;
    const sample={playerName:'代拿者',playerServer:'罗宁',itemID:268259,itemName:'剧毒悔恨束带',itemLink:'|Hitem:268259:0:0:0:0:0:0:0:90:0:0:0:1:12345|h[剧毒悔恨束带]|h',iconID:7730297,quality:4,ilvl:344,slot:'INVTYPE_WAIST',slotCN:'腰部',itemType:'护甲',difficultyID:16,instanceName:'烈毒之渊',bossName:'',timestamp:time,quantity:1,captureVersion:'1.0.6',bindingStatus:'ordinary',collectorSourceID:'req193',sourceEventID:'first'};
    if(config.verifyLootDisplay)delete sample.slotCN; // Actual Collector export need not contain translated slot.
    // Real pasted export -> parsing -> API -> DB, then review through UI.
    await p.locator('#lootViewDrops .toolbar-right button').click();await p.locator('#lootDropImportText').fill(JSON.stringify([sample,{...sample,playerName:'另一拾取人',sourceEventID:'second'}]));
    await p.getByRole('button',{name:'解析预览',exact:true}).click();await p.locator('#lootDropImportConfirmBtn').click();
    await p.waitForFunction(()=>!lootDropImportSaving&&!document.getElementById('lootDropImportModal').classList.contains('show'));
    const rows=await call('/rest/v1/loot_drops?guild_id=eq.'+g.id);const d1=rows.find(r=>r.player_name==='代拿者'),d2=rows.find(r=>r.player_name==='另一拾取人');
    const alloc=(page,body)=>api(page,'/api/loot-observations/allocate',{guildId:g.id,sourceDropId:d1.id,status:'待分配',...body});
    check('未核对来源不能转分配',(await alloc(p,{})).status===409);
    if(config.verifyLootDisplay){
      const row=p.locator('#lootDropsTableBody tr').filter({hasText:'代拿者'});
      check('未核对且缺首领的记录给出下一步', (await row.innerText()).includes('先核对，再分配')&&(await row.innerText()).includes('未采集'));
      await p.screenshot({path:out+'/pickup-next-step.png',fullPage:true,animations:'disabled'});
      await row.locator('[data-drop-review]').click();await p.locator('[data-review-allocate]').waitFor();
      p.once('dialog',d=>d.dismiss());await p.locator('[data-review-allocate]').click();
      check('取消核对不跳转、不写入',await p.locator('#lootDropReviewModal.show').isVisible()&&(await call('/rest/v1/loot_drops?id=eq.'+d1.id))[0].review_status!=='confirmed');
      await p.route('**/api/loot-observations/review',r=>r.fulfill({status:503,json:{message:'测试核对失败'}}));
      p.once('dialog',d=>d.accept());await p.locator('[data-review-allocate]').click();await p.waitForFunction(()=>lootDropDeleting.size===0);
      check('核对保存失败不打开分配，按钮恢复',await p.locator('#lootDropReviewModal.show').isVisible()&&await p.locator('[data-review-allocate]').isEnabled()&&!await p.locator('#lootAllocationModal.show').isVisible());
      await p.unroute('**/api/loot-observations/review');
      p.once('dialog',d=>d.accept());await p.locator('[data-review-allocate]').click();await p.locator('#lootAllocationModal.show').waitFor();
      check('晚拾取缺首领可确认后连续填写分配',await p.locator('#lootAllocationBoss').inputValue()===''&&(await call('/rest/v1/loot_records?guild_id=eq.'+g.id)).length===0);
      await p.locator('#lootAllocationModal .modal-close').click();
    }
    for(const d of [d1,d2]){await p.locator('[data-drop-review="'+d.id+'"]').click();await p.locator('[data-review-confirm]').waitFor();p.once('dialog',d=>d.accept());await p.locator('[data-review-confirm]').click();await p.waitForFunction(()=>lootDropDeleting.size===0&&!document.getElementById('lootDropReviewModal').classList.contains('show'));}
    await open(d1.id);
    await p.locator('#lootAllocationModal .modal-body').evaluate(el=>el.scrollTop=0);
    await p.screenshot({path:out+'/allocation-default-1366.png',fullPage:true,animations:'disabled'});
    check('1366视口页头与保存按钮均可达',await p.locator('#lootAllocationModal .modal').evaluate(el=>{const b=el.getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight&&el.scrollWidth<=el.clientWidth+1;}));
    const action=p.locator('#lootAllocationSave');await action.hover();check('保存按钮响应悬停',await action.evaluate(el=>el.matches(':hover')));
    await p.keyboard.press('Tab');await action.focus();check('保存按钮键盘焦点可见',await action.evaluate(el=>el.matches(':focus-visible')));
    await p.mouse.move(1,1);await action.hover();await p.mouse.down();check('保存按钮按下状态反馈',await action.evaluate(el=>el.matches(':active')));
    await action.evaluate(el=>el.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();},{once:true,capture:true}));await p.mouse.up();
    check('无活动可开表单且默认待分配、不猜获得者',await p.locator('#lootAllocationStatus').inputValue()==='待分配'&&await p.locator('#lootAllocationMember').inputValue()===''&&await p.locator('#lootAllocationActivity option').count()===1);
    await p.locator('#lootAllocationStatus').selectOption('已分配');await save();
    check('未选最终获得者就地拦截且没有入库',(await p.locator('#lootAllocationError').innerText()).includes('请选择最终获得者')&&(await call('/rest/v1/loot_records?guild_id=eq.'+g.id)).length===0);
    await p.locator('#lootAllocationStatus').selectOption('待分配');await p.locator('#lootAllocationBoss').fill('盘卷祭坛');
    check('切回待分配清除不适用错误',await p.locator('#lootAllocationError').innerText()==='');
    if(config.verifyLootDisplay){
      check('13职业选项与既有职业色同源',await p.evaluate(()=>{
        const options=[...document.querySelectorAll('#lootAllocationMember option')].filter(o=>o.value);
        return options.length===14&&options.every(o=>{const m=appData.members.find(m=>m.id===o.value),probe=document.createElement('span');probe.style.color=IconMap.classColor(m.class);document.body.append(probe);const expected=getComputedStyle(probe).color;probe.remove();return getComputedStyle(o).color===expected;});
      }));
      await p.locator('#lootAllocationStatus').selectOption('已分配');await p.locator('#lootAllocationMember').selectOption(m1.id);
      check('选中获得者保留职业色',await p.locator('#lootAllocationMember').evaluate(el=>el.style.color==='rgb(199, 156, 110)'));
      await p.locator('#lootAllocationStatus').selectOption('待分配');
      check('待分配清空获得者和职业色',await p.locator('#lootAllocationMember').inputValue()===''&&await p.locator('#lootAllocationMember').evaluate(el=>el.style.color==='var(--text-primary)'));
      await p.locator('#lootAllocationMethod').selectOption('roll_rule');await p.locator('#lootAllocationRoll').fill('88');
    }
    await p.locator('#lootAllocationNote').fill('晚拾取，确认后再交易。'.repeat(100));
    check('长备注不造成弹窗横向溢出',await p.locator('#lootAllocationModal .modal').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    p.once('dialog',d=>d.dismiss());await p.locator('#lootAllocationModal .modal-close').click();check('未保存关闭可取消',await p.locator('#lootAllocationModal.show').isVisible());
    await p.screenshot({path:out+'/allocation-1366.png',fullPage:true,animations:'disabled'});
    await save();await p.locator('#lootAllocationModal').waitFor({state:'hidden'});
    let [record]=await call('/rest/v1/loot_records?guild_id=eq.'+g.id);
    check('真实保存待分配并自动出现在分配表',record.source_drop_id===d1.id&&record.item_stats.status==='待分配'&&record.character_id===null&&(await p.locator('#lootTableBody').innerText()).includes('剧毒悔恨束带'));
    check('装等难度原链接品质保留；修正首领不改采集证据',record.item_level===344&&record.difficulty==='史诗'&&record.boss_name==='盘卷祭坛'&&record.item_stats.pickup_source.quality===4&&record.item_stats.pickup_source.item_link===sample.itemLink&&(await call('/rest/v1/loot_drops?id=eq.'+d1.id))[0].boss_name==='');
    if(config.verifyLootDisplay){
      const row=p.locator('#lootTableBody tr').filter({hasText:'剧毒悔恨束带'});
      check('分配表独立装等列、史诗和中文部位方式',await row.locator('.loot-item-level').innerText()==='344'&&(await row.innerText()).includes('史诗')&&(await row.innerText()).includes('腰部')&&(await row.innerText()).includes('按规则掷骰')&&!(await row.innerText()).includes('INVTYPE_')&&!(await row.innerText()).includes('roll_rule'));
      check('规则掷骰显示实际点数88',(await row.innerText()).includes('88'));
      for(const [slot,cn] of [['INVTYPE_LEGS','腿部'],['INVTYPE_CHEST','胸部'],['INVTYPE_WAIST','腰部']]){
        await call('/rest/v1/loot_records?id=eq.'+record.id,'PATCH',{item_slot:slot});await p.evaluate(async()=>{await CloudSync.reloadData('loots');lootRender();});
        check('已有部位代码显示中文：'+slot,(await row.innerText()).includes(cn)&&!(await row.innerText()).includes(slot));
      }
      for(const width of [1366,1920]){await p.setViewportSize({width,height:1080});await p.screenshot({path:out+'/allocation-list-'+width+'.png',fullPage:true,animations:'disabled'});check(width+'分配表不撑宽页面',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
      await p.setViewportSize({width:1366,height:768});
    }
    const savedId=record.id;
    check('重复创建返回原记录且不覆盖',(await alloc(p,{status:'已分配',characterId:m1.id})).body.id===savedId&&(await call('/rest/v1/loot_records?id=eq.'+savedId))[0].character_id===null);
    await p.reload();await p.waitForFunction(()=>CloudSync.getCurrentGuild());await p.locator('#lootViewTabs [data-lootview="assign"]').click();
    await p.locator('#lootTableBody button[title="编辑"]').first().click();await p.locator('#lootAllocationModal.show').waitFor();
    await p.locator('#lootAllocationStatus').selectOption('已分配');await p.locator('#lootAllocationMember').selectOption(m2.id);await p.locator('#lootAllocationMethod').selectOption('roll');await p.locator('#lootAllocationRoll').fill('77');await save();
    [record]=await call('/rest/v1/loot_records?id=eq.'+savedId);
    check('刷新后从分配表编辑最终获得者，跨服同名不串人',record.character_id===m2.id&&record.member_name===m2.name&&record.item_stats.status==='已分配'&&record.roll_value===77);
    check('最终获得者心愿随保存标记',(await call('/rest/v1/wishlists?member_id=eq.'+m2.id))[0].items[0].obtained===true);
    await open(d1.id);await p.locator('#lootAllocationMember').selectOption(m1.id);await save();
    check('改最终获得者后新旧心愿同步',(await call('/rest/v1/wishlists?member_id=eq.'+m1.id))[0].items[0].obtained===true&&(await call('/rest/v1/wishlists?member_id=eq.'+m2.id))[0].items[0].obtained===false);
    // Create actual activity using existing UI, with no attendance assumptions.
    await p.goto('http://127.0.0.1:18779/#/team/attendance');await p.getByRole('button',{name:'+ 创建活动',exact:true}).click();
    await p.locator('#activityDate').fill('2026-11-15');await p.locator('#activityRaidName').fill('烈毒之渊');await p.locator('#activitySaveBtn').click();await p.locator('#activityModal').waitFor({state:'hidden'});
    const [activity]=await call('/rest/v1/activities?guild_id=eq.'+g.id);
    await p.goto('http://127.0.0.1:18779/#/team/loot');await open(d1.id);await p.locator('#lootAllocationActivity').selectOption(activity.id);await save();
    [record]=await call('/rest/v1/loot_records?id=eq.'+savedId);
    check('先分配后建活动并补关联无需重建',record.item_stats.activity_id===activity.id&&(await call('/rest/v1/loot_records?guild_id=eq.'+g.id)).length===1);
    // True write, drop only response; retry must read existing source association.
    await open(d2.id);await p.locator('#lootAllocationStatus').selectOption('已分配');await p.locator('#lootAllocationMember').selectOption(m2.id);let dropResponse=true;
    await p.route('**/api/loot-observations/allocate',async r=>{if(dropResponse){dropResponse=false;await r.fetch();await r.fulfill({status:503,json:{message:'隔离测试：保存响应丢失'}});}else await r.continue();});
    await save();check('响应丢失保留表单且仅新增一条',await p.locator('#lootAllocationModal.show').isVisible()&&(await call('/rest/v1/loot_records?guild_id=eq.'+g.id)).length===2);
    await save();await p.unroute('**/api/loot-observations/allocate');check('重试不重复，同名两件独立保留',(await call('/rest/v1/loot_records?guild_id=eq.'+g.id)).length===2);
    check('回执丢失重试补齐最终获得者心愿',(await call('/rest/v1/wishlists?member_id=eq.'+m2.id))[0].items[0].obtained===true);
    check('普通成员不可分配',(await alloc(v,{})).status===403);
    check('跨公会来源不可操作',(await alloc(p,{guildId:foreign.id})).status===403);
    check('跨公会获得者拒绝',(await alloc(p,{id:savedId,status:'已分配',characterId:fm.id})).status===400);
    check('跨公会活动拒绝',(await alloc(p,{id:savedId,activityId:fa.id})).status===400);
    check('通用编辑不能绕过来源保护',(await api(p,'/api/db/rest/v1/loot_records?id=eq.'+savedId,{item_level:1},'PATCH')).status===403);
    await call('/rest/v1/guild_members?guild_id=eq.'+g.id+'&user_id=eq.'+viewer.id,'PATCH',{role:'editor'});
    check('非会长管理员可确认分配',(await alloc(v,{id:savedId,status:'待分配'})).status===200);
    await call('/rest/v1/guild_members?guild_id=eq.'+g.id+'&user_id=eq.'+viewer.id,'PATCH',{role:'viewer'});
    check('撤销管理权限立即生效',(await alloc(v,{id:savedId,status:'待分配'})).status===403);
    await open(d1.id);await p.setViewportSize({width:1920,height:1080});await p.screenshot({path:out+'/allocation-1920.png',fullPage:true,animations:'disabled'});
    check('弹窗无横向内容溢出',await p.locator('#lootAllocationModal .modal').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    await p.locator('#lootAllocationModal .modal-close').click();
    const concurrentSample={...sample,sourceEventID:'concurrent'};
    const imported=await api(p,'/api/loot-observations/submit',{guildId:g.id,rows:[concurrentSample]});const concurrentId=imported.body.ids[0];await api(p,'/api/loot-observations/review',{guildId:g.id,id:concurrentId,action:'confirm'});
    const parallel=await Promise.all([alloc(p,{sourceDropId:concurrentId}),alloc(p,{sourceDropId:concurrentId})]);
    check('并发创建同一来源只有一条',parallel.every(r=>r.status===200)&&parallel[0].body.id===parallel[1].body.id);
    const many=await api(p,'/api/loot-observations/submit',{guildId:g.id,rows:[{...sample,sourceEventID:'quantity2',quantity:2}]});
    await api(p,'/api/loot-observations/review',{guildId:g.id,id:many.body.ids[0],action:'confirm'});
    check('多件未拆分不误转单件',(await alloc(p,{sourceDropId:many.body.ids[0]})).status===409);
    await refresh();check('多件提示先核实且没有转分配按钮',await p.locator('[data-drop-allocate="'+many.body.ids[0]+'"]').count()===0&&(await p.locator('#lootDropsTableBody').innerText()).includes('多件记录需先核实'));
    await call('/rest/v1/activities?id=eq.'+activity.id,'PATCH',{status:'cancelled'});
    check('已取消活动不允许关联',(await alloc(p,{id:savedId,activityId:activity.id})).status===400);
    const originalDrop=await call('/rest/v1/loot_drops?id=eq.'+d2.id);
    // UI deletion must preserve source; recreating is an explicit manager action.
    await p.evaluate(()=>lootSwitchView('assign'));
    const secondRecord=(await call('/rest/v1/loot_records?source_drop_id=eq.'+d2.id))[0];
    p.once('dialog',d=>d.accept());await p.locator('#lootTableBody button[onclick="lootDelete(\''+secondRecord.id+'\')"]').click();
    await p.waitForFunction(id=>!appData.loots.some(l=>l.id===id),secondRecord.id);
    check('删除分配保留原拾取证据',JSON.stringify(await call('/rest/v1/loot_drops?id=eq.'+d2.id))===JSON.stringify(originalDrop));
    await open(d2.id);
    await p.route('**/api/loot-observations/allocate',r=>r.fulfill({status:503,json:{message:'隔离测试：写入前失败'}}));
    await save();check('写入前失败恢复按钮、保留输入且无新行',await p.locator('#lootAllocationSave').isEnabled()&&(await p.locator('#lootAllocationError').innerText()).includes('写入前失败')&&(await call('/rest/v1/loot_records?source_drop_id=eq.'+d2.id)).length===0);
    await p.unroute('**/api/loot-observations/allocate');await save();check('删除后可显式重新创建一条分配',(await call('/rest/v1/loot_records?source_drop_id=eq.'+d2.id)).length===1);
    await v.reload();await v.waitForFunction(()=>CloudSync.getCurrentGuild());await v.locator('#lootViewTabs [data-lootview="drops"]').click();await v.locator('[data-drop-allocate="'+d2.id+'"]').click();await v.locator('#lootAllocationModal.show').waitFor();
    check('普通成员可查看分配但不能编辑',await v.locator('#lootAllocationStatus').isDisabled()&&!(await v.locator('#lootAllocationSave').isVisible()));
    check('无未捕获浏览器异常',errors.length===0);
    fs.writeFileSync(out+'/verification.json',JSON.stringify({checks,errors,environment:'Real Chrome + isolated Supabase; synthetic events; injected lost response; no production writes'},null,2));
  }catch(e){if(p)await p.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});throw e;}
  finally{if(browser)await browser.close();for(const id of guilds)await call('/rest/v1/guilds?id=eq.'+id,'DELETE');for(const id of users)await call('/auth/v1/admin/users/'+id,'DELETE');
    const clean=await call('/rest/v1/guilds?select=id');assert(!clean.some(g=>guilds.includes(g.id)));fs.writeFileSync(out+'/cleanup.json',JSON.stringify({syntheticUsers:users.length,syntheticGuilds:guilds.length,removed:true}));}
};
