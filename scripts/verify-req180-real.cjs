const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { chromium } = require('playwright');
module.exports = async function(config) {
  const out = 'docs/evidence/req180-real-20261105'; fs.mkdirSync(out, { recursive: true });
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
      body: JSON.stringify({ name: 'REQ180隔离联验', owner_id: uid, invite_code: crypto.randomBytes(4).toString('hex') }) });
    assert.equal(guild.status, 201); guildId = guild.body[0].id;
    const member = await request(base + '/rest/v1/guild_members', { method: 'POST', headers: service,
      body: JSON.stringify({ guild_id: guildId, user_id: uid, role: 'owner' }) });
    assert.equal(member.status, 201);
    const summary = await request('http://127.0.0.1:18779/api/wcl/report-summary', { method: 'POST',
      headers: { Authorization: 'Bearer ' + login.body.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportCode: '7wYFJH9RyxzBnVXv', guildId }) });
    console.log(JSON.stringify({ stage: 'real-wcl-probe', status: summary.status,
      players: summary.body?.players?.length, fights: summary.body?.bossFightTotal,
      message: summary.body?.message }));
    check('真实 WCL 报告读取', summary.status === 200 && summary.body.players.length > 2 && summary.body.bossFightTotal > 0);
    const aCode = '7wYFJH9RyxzBnVXv';
    const appHeaders = { Authorization: 'Bearer ' + login.body.access_token, 'Content-Type': 'application/json' };
    const appApi = (route, payload) => request('http://127.0.0.1:18779/api/wcl/' + route,
      { method:'POST', headers:appHeaders, body:JSON.stringify({guildId,...payload}) });
    const rest = async table => {
      const r = await request(base + '/rest/v1/' + table, { headers:service });
      assert.equal(r.status, 200, 'Independent DB read'); return r.body;
    };
    const activities = () => rest('activities?guild_id=eq.' + guildId + '&order=created_at.asc');
    const attendance = id => rest('activity_attendance?activity_id=eq.' + id + '&order=member_id.asc');
    // Discover a second public report from the same WCL guild, without touching
    // the production app DB. This is external read-only GraphQL traffic.
    const oauth = await request('https://www.warcraftlogs.com/oauth/token', { method:'POST',
      headers:{Authorization:'Basic '+Buffer.from(config.WCL_CLIENT_ID+':'+config.WCL_CLIENT_SECRET).toString('base64'), 'Content-Type':'application/x-www-form-urlencoded'},
      body:'grant_type=client_credentials'});
    assert.equal(oauth.status,200);
    const query = async (query,variables) => request('https://www.warcraftlogs.com/api/v2/client', {method:'POST',
      headers:{Authorization:'Bearer '+oauth.body.access_token,'Content-Type':'application/json'},body:JSON.stringify({query,variables})});
    const meta = await query('query($code:String!){reportData{report(code:$code){guild{id}}}}',{code:aCode});
    const externalGuildId = meta.body?.data?.reportData?.report?.guild?.id;
    let bCode = null;
    if(externalGuildId) {
      const reports = await query('query($id:Int!){reportData{reports(guildID:$id,limit:5){data{code}}}}',{id:externalGuildId});
      bCode = reports.body?.data?.reportData?.reports?.data?.find(r=>r.code!==aCode)?.code;
    }
    check('已找到第二份真实 WCL 报告', !!bCode);

    browser = await chromium.launch({ channel:'chrome',headless:true });
    const context = await browser.newContext({viewport:{width:1366,height:900},ignoreHTTPSErrors:true});
    page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', e => errors.push(e.message));
    let failure = null, attendanceWriteCount = 0, reportFetches = 0;
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      // Local test endpoints and vendored assets only. Real WCL goes through
      // the product backend. No browser production session/network is used.
      if (url.hostname !== '127.0.0.1') return route.abort();
      if (url.pathname === '/api/wcl/reports') reportFetches++;
      if (failure === 'link' && url.pathname === '/api/db/rest/v1/activities' && req.method()==='PATCH') {
        failure = null; return route.fulfill({status:502,contentType:'application/json',body:'{"message":"隔离测试：模拟活动保存失败"}'});
      }
      if (failure === 'second-attendance' && url.pathname === '/api/db/rest/v1/activity_attendance' && ['PATCH','POST'].includes(req.method())) {
        attendanceWriteCount++;
        if (attendanceWriteCount===2) {failure=null;return route.fulfill({status:502,contentType:'application/json',body:'{"message":"隔离测试：第二条写入失败"}'});}
      }
      return route.continue();
    });
    const shot = name => page.screenshot({path:out+'/'+name+'.png',fullPage:true});
    await page.goto('http://127.0.0.1:18779/#/team/members');
    await page.waitForFunction(()=>typeof handleLogin==='function');
    await page.getByRole('button',{name:'登录 / 注册',exact:true}).first().click();
    await page.locator('#authEmail').fill(email); await page.locator('#authPassword').fill(password);
    await page.locator('#authLoginBtn').click();
    await page.waitForFunction(()=>window.CloudSync?.getCurrentGuild()?.id && window.CloudSync.canEdit());
    check('Chrome 真实账号登录并加载测试公会',await page.evaluate(id=>CloudSync.getCurrentGuild().id===id,guildId));
    await page.evaluate(()=>{switchPage('members');showImportMembersModal();});
    check('成员导入默认 WCL',await page.locator('#importWclStep').isVisible());
    await page.locator('#importWclUrl').fill('https://www.warcraftlogs.com/reports/'+aCode);
    await page.locator('#importWclParseBtn').click();
    await page.waitForSelector('#importPreviewStep',{state:'visible'});
    check('真实 WCL 名单预览不提前写库',(await rest('raid_members?guild_id=eq.'+guildId)).length===0);
    const selected = summary.body.players.map((p,i)=>({p,i})).filter(x=>x.p.bossFights>0).slice(0,3);
    for(let i=0;i<summary.body.players.length;i++) await page.locator('#importPreviewBody input[type=checkbox]').nth(i).setChecked(selected.some(x=>x.i===i));
    await page.locator('#importConfirmBtn').click();
    await page.waitForFunction(()=>!document.getElementById('importMembersModal').classList.contains('show'));
    const roster=await rest('raid_members?guild_id=eq.'+guildId);
    check('确认导入后真实数据库出现3角色且无人被自动认领',roster.length===3 && roster.every(r=>!r.user_id));
    check('导入成员不自动创建考勤活动',(await activities()).length===0);
    await page.evaluate(()=>switchPage('attendance'));
    await page.locator('#page-attendance button[onclick="showActivityModal()"]').first().click();
    await page.locator('#activityRaidName').fill('REQ180真实活动');
    await page.locator('#activitySaveBtn').click();
    await page.waitForFunction(()=>!document.getElementById('activityModal').classList.contains('show'));
    let rows=await activities(); const activityId=rows[0]?.id;
    check('页面创建活动落库且生成3条占位考勤',rows.length===1 && (await attendance(activityId)).length===3);
    await page.evaluate(id=>openAttendanceDetail(id),activityId);
    await page.locator('.attend-status-select[data-member="'+roster[0].id+'"]').selectOption('迟到');
    await page.locator('#attendanceSaveBtn').click();
    await page.waitForFunction(()=>!document.getElementById('attendanceDetailModal').classList.contains('show'));
    const before=await attendance(activityId);
    check('人工迟到标记真实保存',before.find(a=>a.member_id===roster[0].id)?.status==='late');
    await page.evaluate(id=>openAttendanceDetail(id),activityId);
    await page.locator('#attendanceWclActions summary').click();
    await page.locator('#attendanceWclEditBtn').click();
    await page.locator('#activityWclUrl').fill('https://www.warcraftlogs.com/reports/'+aCode);
    failure='link';await page.locator('#activitySaveBtn').click();
    await page.waitForFunction(()=>!activitySaving);
    check('补链写入失败保留表单和旧数据',await page.locator('#activityModal').isVisible() && !(await activities())[0].wcl_report_code);
    await page.locator('#activitySaveBtn').click();
    await page.waitForFunction(()=>!document.getElementById('activityModal').classList.contains('show'));
    check('补链重试落库且原考勤行完全不变',(await activities())[0].wcl_report_code===aCode && JSON.stringify(await attendance(activityId))===JSON.stringify(before));
    await page.locator('#attendanceWclActions summary').click();await page.locator('#attendanceWclSyncBtn').click();
    await page.waitForSelector('#wclSyncModal.show');
    check('真实报告同步预览保留人工状态',await page.evaluate(()=>wclSyncMeta.preservedList.some(r=>r.status==='迟到')&&wclSyncRows.filter(r=>r.zone!=='unmatched').length===2));
    await shot('real-wcl-preview');
    failure='second-attendance';attendanceWriteCount=0;
    await page.locator('#wclSyncConfirmBtn').click();await page.waitForFunction(()=>!wclSyncWriting);
    const partial=await attendance(activityId);
    check('第二条写入失败时第一条已落库且预览保留',partial.filter(a=>a.status==='present').length===1 && await page.locator('#wclSyncModal').isVisible());
    await page.locator('#wclSyncConfirmBtn').click();await page.waitForFunction(()=>!document.getElementById('wclSyncModal').classList.contains('show'));
    const synced=await attendance(activityId);const oldSnapshot=(await activities())[0].wcl_snapshot;
    check('部分失败后重试不重复并保留迟到',synced.length===3 && synced.filter(a=>a.status==='present').length===2 && synced.filter(a=>a.status==='late').length===1);
    check('真实报告完整参战快照保存',oldSnapshot.report_code===aCode && oldSnapshot.players.length===summary.body.players.filter(p=>p.bossFights>0).length);
    await page.locator('#attendanceWclActions summary').click();await page.locator('#attendanceWclSyncBtn').click();await page.waitForSelector('#wclSyncModal.show');
    await page.locator('#wclSyncConfirmBtn').click();await page.waitForFunction(()=>!wclSyncWriting);
    check('再次同步不重复写考勤',JSON.stringify(await attendance(activityId))===JSON.stringify(synced));
    await page.evaluate(()=>closeModal('wclSyncModal'));
    await page.locator('#attendanceWclActions summary').click();await page.locator('#attendanceWclEditBtn').click();
    await page.locator('#activityWclUrl').fill('https://www.warcraftlogs.com/reports/'+bCode);await page.locator('#activitySaveBtn').click();
    await page.waitForSelector('#wclSyncModal.show');
    check('更换真实报告先预览且数据库仍是旧链接',(await activities())[0].wcl_report_code===aCode && await page.locator('#wclSyncChanges').isVisible());
    await shot('real-replacement-preview');failure='link';
    await page.locator('#wclSyncConfirmBtn').click();await page.waitForFunction(()=>!wclSyncWriting);
    check('更换保存失败不假成功',await page.locator('#wclSyncModal').isVisible() && (await activities())[0].wcl_report_code===aCode);
    check('更换失败后重试按钮保持操作含义',(await page.locator('#wclSyncConfirmBtn').innerText())==='确认更换并保留已有考勤');
    await shot('real-replacement-retry');
    await page.locator('#wclSyncConfirmBtn').click();await page.waitForFunction(()=>!document.getElementById('wclSyncModal').classList.contains('show'));
    const replaced=(await activities())[0];
    check('更换重试成功且旧快照入历史',replaced.wcl_report_code===bCode && replaced.wcl_snapshot.history[0].report_code===aCode);
    check('更换报告后旧考勤逐行守恒',JSON.stringify(await attendance(activityId))===JSON.stringify(synced));
    await page.reload();await page.waitForFunction(()=>window.CloudSync?.getCurrentGuild()?.id && appData.activities?.length===1);
    check('刷新页面重新从数据库读到更换结果',await page.evaluate(code=>appData.activities[0].wcl_report_code===code&&appData.activities[0].attendees.some(a=>a.status==='迟到'),bCode));

    const bind=await appApi('bind-guild-paste',{wclGuildId:externalGuildId});check('测试公会绑定公开 WCL 公会成功',bind.status===200);
    await page.reload();await page.waitForFunction(()=>window.CloudSync?.getCurrentGuild()?.wcl_guild_id);
    await page.evaluate(()=>switchPage('attendance'));
    const searchReports=async()=>{
      const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/wcl/reports');
      await page.locator('#wclReportsSyncBtn').click();
      assert.equal((await response).status(),200,'Report discovery response');
      await page.waitForFunction(()=>!wclReportsBusy && wclReportCache.length>0);
      return page.evaluate(()=>({count:wclReportCache.length,guild:wclReportGuildId,status:document.getElementById('wclSyncStatusLine').textContent}));
    };
    const discovery1=await searchReports();
    const count=reportFetches;const discovery2=await searchReports();
    console.log(JSON.stringify({discovery1,discovery2}));
    check('连续查找新报告实际请求两次且不自动建活动',reportFetches===count+1 && (await activities()).length===1);
    check('重复查找有明确结果反馈',/检查完成 \d{2}:\d{2}:\d{2}｜没有新增报告/.test(await page.locator('#wclSyncStatusLine').innerText()));
    await shot('real-report-discovery');
    await page.locator('#page-attendance button[onclick="showActivityModal()"]').first().click();
    await page.locator('#activityRaidName').fill('REQ180已有空日志活动');
    await page.locator('#activitySaveBtn').click();
    await page.waitForFunction(()=>!document.getElementById('activityModal').classList.contains('show'));
    const emptyActivity=(await activities()).find(a=>!a.wcl_report_code);
    check('已有无日志活动真实创建',!!emptyActivity);
    const candidate=page.locator('.wcl-report-candidate').first();
    await candidate.getByRole('button',{name:'核对参战名单',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.wcl-report-check')?.textContent.includes('名单匹配'));
    check('候选报告真实名单核对不自动入活动',(await activities()).length===2);
    await candidate.getByRole('button',{name:'关联已有活动',exact:true}).click();
    await candidate.locator('select').selectOption(emptyActivity.id);
    const linkedCode=await page.locator('#activityWclUrl').inputValue();
    const candidateCount=await page.locator('.wcl-report-candidate').count();
    await page.locator('#activitySaveBtn').click();
    await page.waitForFunction(()=>!document.getElementById('activityModal').classList.contains('show'));
    check('候选关联保存落库并即时移除候选',(await activities()).find(a=>a.id===emptyActivity.id).wcl_url===linkedCode && await page.locator('.wcl-report-candidate').count()===candidateCount-1);
    // A real viewer account verifies the backend, rather than merely hiding UI.
    const viewer=await request(base+'/auth/v1/admin/users',{method:'POST',headers:service,body:JSON.stringify({email:'viewer-'+crypto.randomBytes(4).toString('hex')+'@example.com',password,email_confirm:true})});
    assert.equal(viewer.status,200);viewerId=viewer.body.id;
    assert.equal((await request(base+'/rest/v1/guild_members',{method:'POST',headers:service,body:JSON.stringify({guild_id:guildId,user_id:viewerId,role:'viewer'})})).status,201);
    const viewerLogin=await request(base+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:config.SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email:viewer.body.email,password})});
    const denied=await request('http://127.0.0.1:18779/api/wcl/report-summary',{method:'POST',headers:{...appHeaders,Authorization:'Bearer '+viewerLogin.body.access_token},body:JSON.stringify({guildId,reportCode:aCode})});
    check('真实 viewer 请求被服务端拒绝',denied.status===403);
    check('页面无未捕获异常',errors.length===0);
    fs.writeFileSync(out+'/verification.json',JSON.stringify({environment:'Chrome + real isolated Supabase + real public WCL reports; only designated HTTP failures injected',checks,errors,reports:[aCode,bCode],discovery1,discovery2},null,2));
    console.log(JSON.stringify({passed:checks.length,realWcl:true,realDatabase:true}));
  } catch(error) {
    if(page) await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});
    fs.writeFileSync(out+'/failure.json',JSON.stringify({checks,errors,message:error.message},null,2));
    throw error;
  } finally {
    if(browser) await browser.close();
    if (guildId) assert.ok([200,204].includes((await request(base + '/rest/v1/guilds?id=eq.' + guildId, { method:'DELETE', headers:service })).status));
    if (viewerId) assert.ok([200,204].includes((await request(base + '/auth/v1/admin/users/' + viewerId, { method:'DELETE', headers:service })).status));
    if (uid) assert.ok([200,204].includes((await request(base + '/auth/v1/admin/users/' + uid, { method:'DELETE', headers:service })).status));
  }
};
