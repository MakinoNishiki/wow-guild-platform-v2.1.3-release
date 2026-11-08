const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const {chromium}=require('playwright');
module.exports=async config=>{
 const checks=[],out='docs/evidence/personal-entry-20261108';fs.mkdirSync(out,{recursive:true});
 const headers={apikey:config.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+config.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'};
 const call=async(path,method='GET',body)=>{const r=await fetch(config.SUPABASE_URL+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});assert.ok(r.ok,path+' '+r.status);const text=await r.text();return text?JSON.parse(text):null;};
 const email='req187-'+crypto.randomBytes(5).toString('hex')+'@example.com',password=crypto.randomBytes(24).toString('base64url');
 let user,userB,guildId,browser;
 const check=(s,v)=>{assert.ok(v,s);checks.push(s);console.log('PASS '+s);};
 try{
 user=await call('/auth/v1/admin/users','POST',{email,password,email_confirm:true});
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1366,height:900}}),page=await context.newPage();
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/rest/v1/decor_catalog?*',r=>r.fulfill({json:[{record_id:1,name_zh:'隔离目录样本',category_id:1,entry_type:1,tags:[],sources:[]}]}));
 await page.goto('http://127.0.0.1:18779/#/home');await page.getByRole('button',{name:'登录 / 注册',exact:true}).first().click();await page.locator('#authEmail').fill(email);await page.locator('#authPassword').fill(password);await page.locator('#authLoginBtn').click();await page.waitForFunction(()=>CloudSync.getCachedUser()&&!document.getElementById('authOverlay').offsetHeight);
 check('无公会登录进入主站',await page.evaluate(()=>!CloudSync.getCurrentGuild()));

 await page.locator('#iaUserCenterBtn').click();await page.locator('#userCenterModal').waitFor({state:'visible'});check('无公会真实账号打开用户中心',true);check('无公会隐藏公会卡',!(await page.locator('#ucGuildCard').isVisible()));
 await page.evaluate(()=>switchUserTab('characters'));await page.waitForFunction(()=>document.getElementById('characterList').textContent.includes('暂无角色'));check('个人角色入口可用',true);await page.evaluate(()=>closeModal('userCenterModal'));
 await page.evaluate(()=>{location.hash='#/team/members';});await page.waitForFunction(()=>document.getElementById('page-team-guide').classList.contains('active'));check('团队页正确引导加入公会',true);check('加入按钮可用',await page.locator('#iaGuideJoinBtn').isEnabled());
 await page.locator('[data-ia-tab="home"]').click();await page.waitForFunction(()=>location.hash==='#/home');check('可返回首页',await page.locator('#iaUserCenterBtn').isVisible());
 await page.evaluate(()=>{location.hash='#/house/plan';});await page.locator('#dhPpCreate').waitFor();check('个人方案无需公会即可进入',true);await page.screenshot({path:out+'/no-guild-plan.png',fullPage:true});
 await page.evaluate(()=>handleSignOut());await page.waitForFunction(()=>!CloudSync.getCachedUser());check('退出后个人入口隐藏',!(await page.locator('#iaUserCenterBtn').isVisible()));
 check('全程未建立公会成员关系',(await call('/rest/v1/guild_members?user_id=eq.'+user.id)).length===0);
 fs.writeFileSync(out+'/verification.json',JSON.stringify({checks,environment:'real Chrome + isolated Supabase; synthetic decor catalog'},null,2));
 }finally{if(browser)await browser.close();if(user)await call('/auth/v1/admin/users/'+user.id,'DELETE');}
};
