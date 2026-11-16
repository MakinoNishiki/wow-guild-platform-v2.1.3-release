const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),{chromium}=require('playwright');
module.exports=async config=>{
 assert.equal(config.ENVIRONMENT,'isolated-test');assert.equal(config.SUPABASE_URL,'http://127.0.0.1:18000');
 const out=config.verifyAttributes?'docs/evidence/bug125-20261116':'docs/evidence/req196-20261116',checks=[],errors=[];fs.mkdirSync(out,{recursive:true});
 const headers={apikey:config.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+config.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json',Prefer:'return=representation'};
 const call=async(path,method='GET',body)=>{const r=await fetch(config.SUPABASE_URL+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});assert(r.ok,path+' '+r.status);const t=await r.text();return t?JSON.parse(t):null;};
 const check=(name,result)=>{assert(result,name);checks.push(name);console.log('PASS '+name);};let user,guild,browser,page;
 try{
  const email='req196-'+crypto.randomBytes(6).toString('hex')+'@example.com',password=crypto.randomBytes(24).toString('base64url');
  user=await call('/auth/v1/admin/users','POST',{email,password,email_confirm:true});[guild]=await call('/rest/v1/guilds','POST',{name:'REQ196隔离验收',owner_id:user.id,invite_code:crypto.randomBytes(4).toString('hex')});await call('/rest/v1/guild_members','POST',{guild_id:guild.id,user_id:user.id,role:'owner'});
  const members=await call('/rest/v1/raid_members','POST',['主号','小号'].map(name=>({guild_id:guild.id,name,class:'战士',server:'罗宁',status:'正式'})));
  browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1366,height:768}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.route('**/api/track',r=>r.fulfill({status:204}));
  await page.goto('http://127.0.0.1:18779/#/home');await page.getByRole('button',{name:'登录 / 注册',exact:true}).first().click();await page.locator('#authEmail').fill(email);await page.locator('#authPassword').fill(password);await page.locator('#authLoginBtn').click();await page.waitForFunction(()=>CloudSync.getCurrentGuild()&&appData.peopleReady);
  await page.goto('http://127.0.0.1:18779/#/team/members');for(const m of members)await page.locator('.member-row-checkbox[value="'+m.id+'"]').check();await page.getByRole('button',{name:'关联为同一团员',exact:true}).click();
  page.once('dialog',d=>d.dismiss());await page.locator('#personLinkSave').click();check('取消关联保留列表两项勾选',await page.locator('.member-row-checkbox:checked').count()===2);
  await page.route('**/api/people/link',r=>r.fulfill({status:503,json:{message:'隔离测试网络失败'}}));page.once('dialog',d=>d.accept());await page.locator('#personLinkSave').click();await page.waitForFunction(()=>!personLinkBusy);check('保存失败弹窗与勾选保留',await page.locator('#personLinkModal').isVisible()&&await page.locator('.member-row-checkbox:checked').count()===2&&(await page.locator('#personLinkError').innerText()).length>0);
  await page.unroute('**/api/people/link');page.once('dialog',d=>d.accept());await page.locator('#personLinkSave').click();await page.locator('#personLinkModal').waitFor({state:'hidden'});
  check('真实保存后列表勾选及批量栏清空',await page.locator('.member-row-checkbox:checked').count()===0&&!await page.locator('#memberBatchToolbar').isVisible());
  const roster=await call('/rest/v1/raid_members?guild_id=eq.'+guild.id);check('数据库两个角色关联同一团员且未修改认领人',roster[0].person_id&&roster[0].person_id===roster[1].person_id&&roster.every(m=>!m.user_id));
  const sample=await page.evaluate(async()=>{await MasterData.init();for(const r of MasterData.getRaids())for(const b of MasterData.getBosses(r.id))for(const l of MasterData.getLoot(b.id))if(l.item_name==='剧毒悔恨束带')return {row:l,raid:r.name,boss:b.name,season:r.season_id};});assert(sample,'Real dictionary belt available');
  const records=await call('/rest/v1/loot_records','POST',[
   {guild_id:guild.id,item_name:sample.row.item_name,item_slot:sample.row.slot,item_level:344,raid_name:sample.raid,boss_name:sample.boss,difficulty:'史诗',obtained_date:'2026-11-16',item_stats:{status:'待分配',pickup_source:{official_item_id:sample.row.official_item_id,icon_id:sample.row.icon_id,quality:4,...(config.verifyAttributes?{player_name:'原始拾取人',player_server:'罗宁'}:{})}}},
   {guild_id:guild.id,item_name:'未收录装备 <安全文本>',item_level:0,obtained_date:'2026-11-16',item_stats:{status:'待分配'}},
   {guild_id:guild.id,item_name:sample.row.item_name,item_level:344,obtained_date:'2026-11-16',item_stats:{status:'待分配',pickup_source:{official_item_id:999999999}}}
  ].map(row=>({item_slot:'',raid_name:'',boss_name:'',difficulty:'',...row})));
  await page.goto('http://127.0.0.1:18779/#/team/loot');await page.reload();await page.waitForFunction(()=>appData.loots.length===3);await page.locator('[onclick="lootSwitchView(\'assign\')"]').click();
  const trigger=page.locator('[data-loot-detail="'+records[0].id+'"]'),popup=page.locator('#lootDetailPopover');
  if(config.verifyAttributes){
   await require('./verify-bug125-columns.cjs')(page,sample,records,check,out);
   const persisted=await call('/rest/v1/loot_records?id=eq.'+records[0].id);
   check('显示补充属性不回写原分配记录',!persisted[0].item_stats.primaryStat&&!persisted[0].item_stats.secondaryStats);
  }
  await trigger.hover();await popup.locator('.dp-item').waitFor();check('名称悬浮显示图鉴同源卡片',await popup.locator('.dp-item-name').innerText()===sample.row.item_name);
  check('本次344史诗与图鉴参考档明确分开',(await popup.locator('.loot-detail-record').innerText()).includes('344')&&(await popup.locator('.loot-detail-record').innerText()).includes('史诗')&&(await popup.locator('.loot-detail-note').innerText()).includes('不代表本次'));
  const shared=await page.evaluate(sample=>DPLootDrop.renderItemCard({...sample.row,source:'raid',instance_name:sample.raid,boss_name:sample.boss,season_id:sample.season},[]),sample);
  check('详情卡内容与副本掉落渲染完全一致',await popup.locator('.dp-item').evaluate((e,html)=>{const d=document.createElement('div');d.innerHTML=html;const actual=e.cloneNode(true);for(const root of [actual,d])root.querySelectorAll('img').forEach(i=>i.remove());return actual.innerHTML===d.firstElementChild.innerHTML;},shared));
  await popup.hover();await page.waitForTimeout(250);check('鼠标可移入浮层持续阅读',await popup.isVisible());
  for(const width of [1366,1920]){await page.setViewportSize({width,height:width===1366?768:1080});await trigger.hover();await popup.locator('.dp-item').waitFor();const box=await popup.boundingBox();check(width+'浮层未越出视口',box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=(width===1366?768:1080));await page.screenshot({path:out+'/hover-'+width+'.png',animations:'disabled'});}
  await page.keyboard.press('Escape');check('Escape关闭详情',!await popup.isVisible());await trigger.focus();await popup.locator('.dp-item').waitFor();check('键盘聚焦显示详情',await popup.isVisible());
  await page.keyboard.press('Tab');await page.mouse.move(0,0);await page.waitForTimeout(250);check('焦点和鼠标离开关闭详情',!await popup.isVisible());
  await trigger.locator('img').hover();await popup.locator('.dp-item').waitFor();check('图标与名称共用入口',await popup.isVisible());await page.locator('[data-lootview=assign]').click();check('点外关闭详情',!await popup.isVisible());
  const unknown=page.locator('[data-loot-detail="'+records[1].id+'"]');await unknown.hover();await page.waitForFunction(()=>document.querySelector('#lootDetailPopover')?.textContent.includes('暂无可确认'));check('缺资料与装等不猜测并安全转义',(await popup.innerText()).includes('装等未记录')&&!(await popup.locator('.dp-item').count())&&(await popup.innerText()).includes('<安全文本>'));
  await page.locator('[data-loot-detail="'+records[2].id+'"]').hover();await page.waitForTimeout(150);check('有不同物品ID时不按同名串件',!await popup.locator('.dp-item').count());
  await page.evaluate(()=>{window.__originalInit=MasterData.init;MasterData.init=()=>Promise.reject(Error('offline'));});await trigger.hover();await page.waitForFunction(()=>document.querySelector('#lootDetailPopover')?.textContent.includes('暂时无法加载'));check('失败状态可见',await popup.isVisible());await page.evaluate(()=>MasterData.init=window.__originalInit);await unknown.hover();await trigger.hover();await popup.locator('.dp-item').waitFor();check('失败后移入可重试',await popup.isVisible());
  await page.evaluate(()=>{window.__releaseDetails=null;MasterData.init=()=>new Promise(r=>window.__releaseDetails=r);});await unknown.hover();check('加载状态可见',(await popup.innerText()).includes('正在加载'));await page.keyboard.press('Escape');await page.evaluate(()=>{MasterData.init=window.__originalInit;window.__releaseDetails();});await page.waitForTimeout(100);check('迟到响应不重开已关闭详情',!await popup.isVisible());
  await page.evaluate(()=>{window.__originalLoot=MasterData.getLoot;MasterData.getLoot=id=>window.__originalLoot(id).map(l=>l.item_name==='剧毒悔恨束带'?{...l,effect:'装备：这是验证长特效完整显示与内部滚动的文字。'.repeat(80)}:l);});await trigger.hover();await popup.locator('.dp-item').waitFor();check('长特效完整渲染且可内部滚动',await popup.evaluate(e=>e.scrollHeight>e.clientHeight&&e.getBoundingClientRect().bottom<=innerHeight)&&(await popup.locator('.dp-item-effect-preview').innerText()).length>1000);await popup.hover();await page.mouse.wheel(0,450);check('浮层内部滚动不关闭',await popup.isVisible());await page.screenshot({path:out+'/long-effect.png',animations:'disabled'});
  await page.evaluate(()=>{MasterData.getLoot=id=>{const rows=window.__originalLoot(id);return rows.concat(rows.filter(l=>l.item_name==='剧毒悔恨束带').map(l=>({...l,id:l.id+'-duplicate'})));};});await unknown.hover();await trigger.hover();await page.waitForFunction(()=>document.querySelector('#lootDetailPopover')?.textContent.includes('多个匹配'));check('多候选明确提示不猜属性',!await popup.locator('.dp-item').count());await page.evaluate(()=>MasterData.getLoot=window.__originalLoot);
  await unknown.hover();await trigger.hover();await popup.locator('.dp-item').waitFor();await page.goto('http://127.0.0.1:18779/#/team/members');check('切页关闭详情',!await popup.isVisible());
  await page.goto('http://127.0.0.1:18779/#/lootdrop');await page.locator('#page-lootdrop .dp-item').first().waitFor();check('副本掉落原卡片仍正常渲染',await page.locator('#page-lootdrop .dp-item-name').count()>0);await page.screenshot({path:out+'/lootdrop-regression.png',animations:'disabled'});
  check('无浏览器脚本错误',errors.length===0);
  fs.writeFileSync(out+'/verification.json',JSON.stringify({checks,errors,environment:'Real Chrome + isolated Supabase; synthetic business records; actual isolated game dictionary; external image requests blocked'},null,2));
 }catch(e){if(page)await page.screenshot({path:out+'/failure.png',animations:'disabled'}).catch(()=>{});throw e;}finally{
  if(browser)await browser.close();if(guild)await call('/rest/v1/guilds?id=eq.'+guild.id,'DELETE');if(user)await call('/auth/v1/admin/users/'+user.id,'DELETE');
  fs.writeFileSync(out+'/cleanup.json',JSON.stringify({guildRemoved:guild?!(await call('/rest/v1/guilds?id=eq.'+guild.id)).length:true},null,2));
 }
};
