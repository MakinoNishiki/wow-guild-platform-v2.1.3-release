const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { chromium } = require('playwright');
module.exports = async function(config) {
  const out = 'docs/evidence/req183-20261105'; fs.mkdirSync(out, { recursive: true });
  const checks = [], errors = [];
  const check = (name, value) => { assert.ok(value, name); checks.push(name); console.log('PASS ' + name); };
  const base = config.SUPABASE_URL;
  const service = { apikey: config.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + config.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  const request = async (url, options = {}) => {
    const response = await fetch(url, options);
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  let uid, guildId, viewerId, browser, page;
  try {
    const email = `req180-${crypto.randomBytes(5).toString('hex')}@example.com`;
    const password = crypto.randomBytes(24).toString('base64url');
    const created = await request(base + '/auth/v1/admin/users', { method: 'POST', headers: service,
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { display_name: '隔离联验团长' } }) });
    assert.equal(created.status, 200, 'Create isolated account'); uid = created.body.id;
    const login = await request(base + '/auth/v1/token?grant_type=password', { method: 'POST',
      headers: { apikey: config.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    assert.equal(login.status, 200, 'Login isolated account');
    const guild = await request(base + '/rest/v1/guilds', { method: 'POST', headers: service,
      body: JSON.stringify({ name: 'REQ183隔离联验', owner_id: uid, invite_code: crypto.randomBytes(4).toString('hex') }) });
    assert.equal(guild.status, 201); guildId = guild.body[0].id;
    const member = await request(base + '/rest/v1/guild_members', { method: 'POST', headers: service,
      body: JSON.stringify({ guild_id: guildId, user_id: uid, role: 'owner' }) });
    assert.equal(member.status, 201);
    const rest=async table=>(await request(base+'/rest/v1/'+table,{headers:service})).body;
    const added=await request(base+'/rest/v1/raid_members',{method:'POST',headers:service,body:JSON.stringify([
      {guild_id:guildId,name:'测试甲',class:'战士',spec:'防护',role:'坦克',status:'正式'},
      {guild_id:guildId,name:'测试乙',class:'牧师',spec:'神圣',role:'治疗',status:'正式'}])});assert.equal(added.status,201);
    const activities=()=>rest('activities?guild_id=eq.'+guildId);
    const attendance=id=>rest('activity_attendance?activity_id=eq.'+id);
    browser=await chromium.launch({channel:'chrome',headless:true});
    const context=await browser.newContext({viewport:{width:1366,height:900},ignoreHTTPSErrors:true});
    page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    let mode='',blockRead=false;const createIds=[];
    await page.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url()),method=req.method();
      if(url.hostname!=='127.0.0.1')return route.abort();
      if(blockRead && method==='GET' && /\/rest\/v1\/(activities|activity_attendance)$/.test(url.pathname))return route.fulfill({status:503,contentType:'application/json',body:'{"message":"测试：读取不可用"}'});
      if(url.pathname==='/api/db/rest/v1/activities' && method==='POST') {
        createIds.push(req.postDataJSON().id);
        if(mode==='before') {mode='';return route.fulfill({status:522,body:'test timeout'});}
        if(mode==='afterActivity'||mode==='unknown') {
          const unknown=mode==='unknown';mode='';const response=await route.fetch();assert.equal(response.status(),201);
          if(unknown)blockRead=true;
          return route.fulfill({status:522,body:'test response lost'});
        }
      }
      if(mode==='afterAttendance' && url.pathname==='/api/db/rest/v1/activity_attendance' && method==='POST') {
        mode='';const response=await route.fetch();assert.equal(response.status(),201);
        return route.fulfill({status:522,body:'test attendance response lost'});
      }
      if(mode==='afterUpdate' && url.pathname==='/api/db/rest/v1/activities' && method==='PATCH') {
        mode='';const response=await route.fetch();assert.equal(response.status(),200);
        return route.fulfill({status:522,body:'test edit response lost'});
      }
      return route.continue();
    });
    await page.goto('http://127.0.0.1:18779/#/team/attendance');
    await page.waitForFunction(()=>typeof handleLogin==='function');
    await page.getByRole('button',{name:'登录 / 注册',exact:true}).first().click();
    await page.locator('#authEmail').fill(email);await page.locator('#authPassword').fill(password);await page.locator('#authLoginBtn').click();
    await page.waitForFunction(()=>window.CloudSync?.getCurrentGuild()?.id && CloudSync.canEdit());
    const create=async(name,fault)=>{
      await page.evaluate(()=>{modalStack.slice().forEach(closeModal);switchPage('attendance');showActivityModal();document.getElementById('toastContainer').replaceChildren();});
      await page.locator('#activityRaidName').fill(name);mode=fault;
      await page.locator('#activitySaveBtn').click();await page.waitForFunction(()=>!activitySaving);
    };
    await create('到库前失败','before');
    check('到库前失败保留输入且数据库无新增',(await activities()).length===0 && await page.locator('#activityModal').isVisible());
    check('只显示一次准确提示',await page.locator('#toastContainer').evaluate(e=>e.children.length===1 && e.textContent.includes('暂未查到')));
    await page.locator('#activitySaveBtn').click();await page.waitForFunction(()=>!activitySaving);
    let all=await activities();
    check('重试复用UUID且只建一个活动',all.length===1 && createIds[0]===createIds[1] && all[0].id===createIds[0]);
    check('正常重试完成初始考勤',(await attendance(all[0].id)).length===2 && await page.locator('#activityModal').isHidden());
    await create('活动写入后丢响应','afterActivity');
    all=await activities();const partial=all.find(a=>a.raid==='活动写入后丢响应');
    check('活动已存考勤未齐时进入原活动',!!partial && (await attendance(partial.id)).length===0 && await page.locator('#attendanceDetailModal').isVisible());
    check('部分成功提示明确且不重复报错',await page.locator('#toastContainer').evaluate(e=>e.children.length===1 && e.textContent.includes('初始考勤尚未保存')));
    await page.getByRole('button',{name:'保存考勤',exact:true}).click();
    await page.waitForFunction(()=>!document.getElementById('attendanceDetailModal').classList.contains('show'));
    check('原活动继续保存考勤，不重新创建',(await activities()).length===2 && (await attendance(partial.id)).length===2);
    await create('全部写入后丢响应','afterAttendance');
    all=await activities();const full=all.find(a=>a.raid==='全部写入后丢响应');
    check('全部写入后的522核实为成功',!!full && (await attendance(full.id)).length===2 && await page.locator('#activityModal').isHidden());
    check('全部成功仅显示一条核实提示',await page.locator('#toastContainer').evaluate(e=>e.children.length===1 && e.textContent.includes('已核实活动保存成功')));
    await page.screenshot({path:out+'/saved-response-lost.png',fullPage:true});
    await create('结果未知后重试','unknown');
    check('回读失败明确未知且保留表单',await page.locator('#activityModal').isVisible() && (await page.locator('#toastContainer').innerText()).includes('无法确认保存结果'));
    blockRead=false;const oldCount=(await activities()).length;
    await page.locator('#activitySaveBtn').click();await page.waitForFunction(()=>!activitySaving);
    check('结果未知后重试由主键防重',(await activities()).length===oldCount && createIds.at(-1)===createIds.at(-2));
    await page.evaluate(id=>{modalStack.slice().forEach(closeModal);showActivityModal(appData.activities.find(a=>a.id===id));document.getElementById('toastContainer').replaceChildren();},full.id);
    await page.locator('#activityNotes').fill('已核实更新');mode='afterUpdate';
    await page.locator('#activitySaveBtn').click();await page.waitForFunction(()=>!activitySaving);
    check('编辑响应丢失也核实成功',(await activities()).find(a=>a.id===full.id).notes==='已核实更新' && await page.locator('#activityModal').isHidden());
    check('编辑恢复不改考勤',(await attendance(full.id)).length===2);
    const html=await page.evaluate(()=>wclCheckSummaryHtml({bossFightTotal:1,players:[{name:'名单外角色',server:'其他服',bossFights:1}]}));
    check('未匹配名单说明默认排除且无需逐人忽略',html.includes('默认不计入考勤') && html.includes('无需逐个忽略'));
    check('无未捕获页面异常',errors.length===0);
    fs.writeFileSync(out+'/verification.json',JSON.stringify({checks,errors,environment:'real Chrome and isolated Supabase; designated response failures injected',createIds},null,2));
    console.log(JSON.stringify({passed:checks.length}));
  } catch(e) {
    if(page)await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});
    throw e;
  } finally {
    if(browser)await browser.close();
    if(guildId)assert.ok([200,204].includes((await request(base+'/rest/v1/guilds?id=eq.'+guildId,{method:'DELETE',headers:service})).status));
    if(uid)assert.ok([200,204].includes((await request(base+'/auth/v1/admin/users/'+uid,{method:'DELETE',headers:service})).status));
  }
};
