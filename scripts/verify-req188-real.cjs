const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const {chromium}=require('playwright');
module.exports=async config=>{
 const checks=[],out='docs/evidence/req188-20261109';fs.mkdirSync(out,{recursive:true});
 const headers={apikey:config.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+config.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'};
 const call=async(path,method='GET',body)=>{const r=await fetch(config.SUPABASE_URL+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});assert.ok(r.ok,path+' '+r.status);const text=await r.text();return text?JSON.parse(text):null;};
 const email='req188-'+crypto.randomBytes(5).toString('hex')+'@example.com',password=crypto.randomBytes(24).toString('base64url');
 let user,userB,guildId,browser;
 const check=(s,v)=>{assert.ok(v,s);checks.push(s);console.log('PASS '+s);};
 try{
 user=await call('/auth/v1/admin/users','POST',{email,password,email_confirm:true});
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1366,height:900}}),page=await context.newPage();
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/rest/v1/decor_catalog?*',r=>r.fulfill({json:[{record_id:1,name_zh:'隔离目录样本',category_id:1,entry_type:1,tags:[],sources:[]}]}));
 await page.goto('http://127.0.0.1:18779/#/home');await page.getByRole('button',{name:'登录 / 注册',exact:true}).first().click();await page.locator('#authEmail').fill(email);await page.locator('#authPassword').fill(password);await page.locator('#authLoginBtn').click();await page.waitForFunction(()=>CloudSync.getCachedUser()&&!document.getElementById('authOverlay').offsetHeight);
 check('无公会登录进入主站',await page.evaluate(()=>!CloudSync.getCurrentGuild()));

 await page.locator('#iaUserCenterBtn').click();await page.evaluate(()=>switchUserTab('characters'));await page.waitForFunction(()=>document.getElementById('characterList').textContent.includes('暂无角色'));
 let failSave=true,failDelete=true,posts=0,deletes=0;
 await page.route('**/rest/v1/user_characters**',async route=>{
   const method=route.request().method();
   if(method==='POST'){posts++;if(failSave)return route.fulfill({status:503,json:{message:'测试保存失败'}});}
   if(method==='DELETE'){deletes++;if(failDelete)return route.fulfill({status:503,json:{message:'测试删除失败'}});}
   return route.continue();
 });
 await page.getByRole('button',{name:'+ 添加角色',exact:false}).click();await page.locator('#charName').fill('环节二测试角色');await page.locator('#charServer').fill('金色平原');
 await page.getByRole('button',{name:'保存角色',exact:true}).click();await page.waitForFunction(()=>!personalCharacterSaving);
 check('保存失败表单保留',await page.locator('#addCharacterModal').isVisible());check('保存失败输入保留',await page.locator('#charName').inputValue()==='环节二测试角色');check('保存失败未入库',(await call('/rest/v1/user_characters?user_id=eq.'+user.id)).length===0);
 failSave=false;
 await page.evaluate(()=>Promise.all([saveCharacter(),saveCharacter()]));await page.waitForFunction(()=>document.getElementById('characterList').textContent.includes('环节二测试角色'));
 check('重试保存单行且防重复',posts===2&&(await call('/rest/v1/user_characters?user_id=eq.'+user.id)).length===1);check('手动角色标未验证',await page.locator('#characterList').innerText().then(s=>s.includes('手动添加 · 未验证归属')));
 await page.getByRole('button',{name:'+ 添加角色',exact:false}).click();await page.locator('#charName').fill('环节二测试角色');await page.locator('#charServer').fill('金色平原');await page.getByRole('button',{name:'保存角色',exact:true}).click();await page.waitForFunction(()=>!personalCharacterSaving);check('同服同名不再写入',posts===2);await page.evaluate(()=>closeModal('addCharacterModal'));
 const character=(await call('/rest/v1/user_characters?user_id=eq.'+user.id))[0];let dialogText='';page.on('dialog',d=>{dialogText=d.message();d.accept();});
 await page.locator('#characterList .uc-character-actions button').click();await page.waitForFunction(()=>personalCharacterDeleting.size===0);check('删除说明明确个人与团队边界',dialogText.includes('不会解除公会认领'));check('删除失败角色仍在',(await call('/rest/v1/user_characters?user_id=eq.'+user.id)).length===1);check('删除失败界面仍在',await page.locator('#characterList').innerText().then(s=>s.includes('环节二测试角色')));
 failDelete=false;await page.evaluate(id=>Promise.all([deleteCharacter(id),deleteCharacter(id)]),character.id);await page.waitForFunction(()=>document.getElementById('characterList').textContent.includes('暂无角色'));check('删除重试成功且防重复',deletes===2&&(await call('/rest/v1/user_characters?user_id=eq.'+user.id)).length===0);
 await page.screenshot({path:out+'/characters-empty.png',fullPage:true});fs.writeFileSync(out+'/verification.json',JSON.stringify({checks,environment:'real Chrome + isolated Supabase; deliberate POST/DELETE failure injection'},null,2));
 }finally{if(browser)await browser.close();if(user)await call('/auth/v1/admin/users/'+user.id,'DELETE');}
};
