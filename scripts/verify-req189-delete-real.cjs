// BUG-119: real Chrome + isolated Supabase only. Synthetic fixtures, no production data.
const assert = require('node:assert/strict'), crypto = require('node:crypto'), fs = require('node:fs');
const {chromium} = require('playwright');
module.exports = async config => {
  assert.equal(config.ENVIRONMENT, 'isolated-test');
  assert.equal(config.SUPABASE_URL, 'http://127.0.0.1:18000');
  const out = 'docs/evidence/req189-20261113'; fs.mkdirSync(out,{recursive:true});
  const headers = {apikey:config.SUPABASE_SERVICE_ROLE_KEY, Authorization:'Bearer '+config.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type':'application/json',Prefer:'return=representation'};
  const call = async (path,method='GET',body) => {
    const r=await fetch(config.SUPABASE_URL+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
    assert.ok(r.ok,path+' '+r.status); const text=await r.text(); return text?JSON.parse(text):null;
  };
  const users=[],guilds=[],checks=[],errors=[];
  const check=(name,ok)=>{assert.ok(ok,name); checks.push(name); console.log('PASS '+name);};
  let browser,page;
  const createUser=async()=>{
    const email='req189-'+crypto.randomBytes(5).toString('hex')+'@example.com',password=crypto.randomBytes(24).toString('base64url');
    const user=await call('/auth/v1/admin/users','POST',{email,password,email_confirm:true});users.push(user.id);return {...user,email,password};
  };
  const createGuild=async user=>{const [g]=await call('/rest/v1/guilds','POST',{name:'拾取隔离测试',owner_id:user.id,invite_code:crypto.randomBytes(4).toString('hex')});guilds.push(g.id);await call('/rest/v1/guild_members','POST',{guild_id:g.id,user_id:user.id,role:'owner'});return g;};
  const login=async user=>{
    const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1366,height:900}}), p=await context.newPage();
    await p.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
    p.on('pageerror',e=>errors.push(e.message));
    await p.goto('http://127.0.0.1:18779/#/home');
    await p.getByRole('button',{name:'登录 / 注册',exact:true}).first().click();
    await p.locator('#authEmail').fill(user.email);await p.locator('#authPassword').fill(user.password);await p.locator('#authLoginBtn').click();
    await p.waitForFunction(()=>CloudSync.getCurrentGuild()&&!document.getElementById('authOverlay').offsetHeight);
    await p.goto('http://127.0.0.1:18779/#/team/loot');
    await p.waitForFunction(()=>CloudSync.getCurrentGuild());
    await p.locator('#lootViewTabs [data-lootview="drops"]').click();
    return p;
  };
  try {
    const owner=await createUser(),viewer=await createUser(),outsider=await createUser();
    const guild=await createGuild(owner),otherGuild=await createGuild(outsider);
    await call('/rest/v1/guild_members','POST',{guild_id:guild.id,user_id:viewer.id,role:'viewer'});
    await call('/rest/v1/loot_records','POST',{guild_id:guild.id,item_name:'保留的分配记录'});
    await call('/rest/v1/activities','POST',{guild_id:guild.id,name:'保留的活动',activity_date:'2026-11-13'});
    const [foreign]=await call('/rest/v1/loot_drops','POST',{guild_id:otherGuild.id,player_name:'其他公会',item_name:'不可删除',official_item_id:1,timestamp:new Date().toISOString()});
    browser=await chromium.launch({channel:'chrome',headless:true});page=await login(owner);
    await page.waitForFunction(()=>document.getElementById('lootDropsTableBody').textContent.includes('暂无拾取'));
    await page.locator('#lootViewDrops .toolbar-right button').click();
    await page.locator('#lootDropImportText').fill(JSON.stringify([{playerName:'隔离拾取者',itemName:'误录战团装备',itemID:268236,ilvl:219,quality:4,slot:'INVTYPE_LEGS',difficulty:'史诗',difficultyID:16,timestamp:Math.floor(Date.now()/1000),instanceName:'烈毒之渊',bossName:'测试首领'}]));
    await page.getByRole('button',{name:'解析预览',exact:true}).click();await page.locator('#lootDropImportConfirmBtn').click();
    await page.waitForFunction(()=>document.getElementById('lootDropsTableBody').textContent.includes('误录战团装备'));
    const readDrops=()=>call('/rest/v1/loot_drops?guild_id=eq.'+guild.id);
    const [drop]=await readDrops();check('真实页面导入并独立回读一条',!!drop && (await readDrops()).length===1);
    const button=page.locator('[data-drop-delete="'+drop.id+'"]');
    await page.screenshot({path:out+'/delete-1366.png',fullPage:true});
    await page.setViewportSize({width:1920,height:1080});await page.screenshot({path:out+'/delete-1920.png',fullPage:true});
    let deletes=0,fail=true;
    await page.route('**/api/db/rest/v1/loot_drops?*',async route=>{
      if(route.request().method()==='DELETE') {deletes++;if(fail)return route.fulfill({status:503,json:{message:'隔离删除失败'}});await new Promise(r=>setTimeout(r,300));}
      return route.continue();
    });
    page.once('dialog',d=>d.dismiss());await button.click();check('取消删除不发请求不改数据',deletes===0&&(await readDrops()).length===1);
    let message='';page.once('dialog',d=>{message=d.message();return d.accept();});await button.click();
    await page.waitForFunction(()=>lootDropDeleting.size===0);
    check('确认说明装备人时间及删除边界',message.includes('误录战团装备')&&message.includes('隔离拾取者')&&message.includes('不会删除分配记录'));
    check('删除失败保留记录且恢复按钮',(await readDrops()).length===1&&await button.isEnabled());
    check('失败提示明确',await page.locator('body').innerText().then(t=>t.includes('删除结果未确认')));
    fail=false;page.once('dialog',d=>d.accept());await button.click();
    await page.waitForFunction(()=>lootDropDeleting.size===1);
    check('删除过程可见并禁重复',await button.isDisabled()&&(await button.innerText()).includes('删除中'));
    await page.evaluate(id=>lootDropDelete(id),drop.id);
    await page.waitForFunction(()=>lootDropDeleting.size===0&&!document.querySelector('[data-drop-delete]'));
    check('重试删除一次成功独立回读为空',deletes===2&&(await readDrops()).length===0);
    await page.reload();await page.waitForFunction(()=>CloudSync.getCurrentGuild());await page.locator('#lootViewTabs [data-lootview="drops"]').click();
    await page.waitForFunction(()=>document.getElementById('lootDropsTableBody').textContent.includes('暂无拾取'));
    check('刷新后无被删行',await page.locator('[data-drop-delete]').count()===0);
    check('装备分配和活动保留',(await call('/rest/v1/loot_records?guild_id=eq.'+guild.id)).length===1&&(await call('/rest/v1/activities?guild_id=eq.'+guild.id)).length===1);
    const [remaining]=await call('/rest/v1/loot_drops','POST',{guild_id:guild.id,player_name:'保留',item_name:'权限样本',official_item_id:2,timestamp:new Date().toISOString()});
    const vpage=await login(viewer);await vpage.waitForFunction(()=>document.getElementById('lootDropsTableBody').textContent.includes('权限样本'));
    check('viewer看不到删除按钮',!(await vpage.locator('[data-drop-delete]').isVisible()));
    const deny=async(p,id)=>p.evaluate(async id=>{const token=await CloudSync.getAccessToken();const r=await fetch('/api/db/rest/v1/loot_drops?id=eq.'+id,{method:'DELETE',headers:{Authorization:'Bearer '+token}});return r.status;},id);
    check('viewer直接请求仍被服务端拒绝',await deny(vpage,remaining.id)===403);
    check('owner跨公会删除被拒绝',await deny(page,foreign.id)===403);
    check('权限拒绝后记录保留',(await readDrops()).length===1&&(await call('/rest/v1/loot_drops?id=eq.'+foreign.id)).length===1);
    check('页面无未捕获异常',errors.length===0);
    fs.writeFileSync(out+'/delete-verification.json',JSON.stringify({checks,errors,environment:'Real Chrome + isolated Supabase; one deliberate DELETE 503; synthetic fixtures'},null,2));
  } catch(e) {if(page)await page.screenshot({path:out+'/delete-failure.png',fullPage:true}).catch(()=>{});throw e;}
  finally {
    if(browser)await browser.close();
    for(const id of guilds)await call('/rest/v1/guilds?id=eq.'+id,'DELETE');
    for(const id of users)await call('/auth/v1/admin/users/'+id,'DELETE');
    fs.writeFileSync(out+'/delete-cleanup.json',JSON.stringify({createdUsers:users.length,createdGuilds:guilds.length,removed:true}));
  }
};
