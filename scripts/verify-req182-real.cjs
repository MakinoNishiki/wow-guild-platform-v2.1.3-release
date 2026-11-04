const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { chromium } = require('playwright');
module.exports = async function(config) {
  const out = 'docs/evidence/req182-20261105'; fs.mkdirSync(out, { recursive: true });
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
      body: JSON.stringify({ name: 'REQ182隔离联验', owner_id: uid, invite_code: crypto.randomBytes(4).toString('hex') }) });
    assert.equal(guild.status, 201); guildId = guild.body[0].id;
    const member = await request(base + '/rest/v1/guild_members', { method: 'POST', headers: service,
      body: JSON.stringify({ guild_id: guildId, user_id: uid, role: 'owner' }) });
    assert.equal(member.status, 201);
    const rest = async table => (await request(base+'/rest/v1/'+table,{headers:service})).body;
    browser=await chromium.launch({channel:'chrome',headless:true});
    const context=await browser.newContext({viewport:{width:1366,height:900},ignoreHTTPSErrors:true});
    page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await page.goto('http://127.0.0.1:18779/#/team/members');
    await page.waitForFunction(()=>typeof handleLogin==='function');
    await page.getByRole('button',{name:'登录 / 注册',exact:true}).first().click();
    await page.locator('#authEmail').fill(email);await page.locator('#authPassword').fill(password);
    await page.locator('#authLoginBtn').click();
    await page.waitForFunction(()=>window.CloudSync?.getCurrentGuild()?.id && CloudSync.canEdit());
    await page.evaluate(()=>{switchPage('members');showImportMembersModal();});
    await page.locator('#importWclUrl').fill('https://www.warcraftlogs.com/reports/rFZAQTm4M7bCJcBp');
    const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/wcl/report-summary'));
    await page.locator('#importWclParseBtn').click();
    const summary=await (await responsePromise).json();
    await page.waitForSelector('#importPreviewStep',{state:'visible'});
    const rows=await page.evaluate(()=>importPreviewRows);
    console.log(JSON.stringify({players:rows.length,identified:rows.filter(r=>r.mainSpec).length,missing:rows.map((r,i)=>({r,i})).filter(x=>!x.r.mainSpec).map(x=>({cls:x.r.cls,subType:summary.players[x.i].subType,specs:summary.players[x.i].specs}))}));
    check('真实报告有效职业专精均识别，未知职业不猜测',rows.length===24 && rows.every((r,i)=>r.mainSpec || (!r.cls && !r.include && r.status==='bad')));
    check('预览不提前写入',(await rest('raid_members?guild_id=eq.'+guildId)).length===0);
    await page.waitForFunction(()=>[...document.querySelectorAll('#importPreviewBody img')].every(img=>img.complete));
    check('职业图标均为统一PNG且加载成功',await page.locator('#importPreviewBody span[id^=importClsIcon] img').evaluateAll((imgs,n)=>imgs.length===n && imgs.every(img=>img.src.includes('/classes/') && img.naturalWidth>0),rows.filter(r=>r.cls).length));
    check('专精图标加载成功',await page.locator('#importPreviewBody td[id^=importSpecCell] img').evaluateAll((imgs,n)=>imgs.length===n && imgs.every(img=>img.naturalWidth>0),rows.filter(r=>r.mainSpec).length));
    await page.screenshot({path:out+'/real-import-preview.png',fullPage:true});
    for(const width of [1366,1920]) {
      await page.setViewportSize({width,height:900});
      check('导入表格无横向溢出 '+width,await page.locator('#importPreviewStep .table-container').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
    }
    // Branch fixtures only in preview memory; write/read validation below uses the real WCL rows.
    check('多专精、缺失、旧别名处理',await page.evaluate(()=>{
      const multi=wclImportSpecs('牧师',{specs:[{name:'Holy'},{name:'Shadow'}]});
      const fields=importSpecFields({cls:'牧师',...multi});
      return multi.mainSpec==='神圣' && fields.off_specs[0]==='暗影' && fields.role.includes('治疗') && fields.role.includes('输出') &&
        wclImportSpecs('盗贼',{specs:[{name:'Assassination'}]}).mainSpec==='刺杀' && !wclImportSpecs('猎人',{}).mainSpec;
    }));
    const first=page.locator('#importPreviewBody tr').first();
    await first.locator('td').nth(2).locator('select').selectOption('牧师');
    check('改职业清空旧专精并更新图标',await page.evaluate(()=>!importPreviewRows[0].mainSpec && document.querySelector('#importClsIcon0 img').src.includes('priest.png')));
    await first.locator('select[aria-label="主专精"]').selectOption('戒律');
    check('手动修正专精即时反馈',await page.evaluate(()=>importPreviewRows[0].mainSpec==='戒律' && document.querySelector('#importSpecCell0 img').src.includes('discipline.png')));
    // Restore exact API-derived preview and select 3 real participants.
    await page.evaluate(rows=>{importPreviewRows=rows;renderImportPreview();},rows);
    for(let i=0;i<rows.length;i++) await page.locator('#importPreviewBody input[type=checkbox]').nth(i).setChecked(i<3);
    await page.locator('#importConfirmBtn').click();
    await page.waitForFunction(()=>!document.getElementById('importMembersModal').classList.contains('show'));
    const stored=await rest('raid_members?guild_id=eq.'+guildId);
    check('确认导入主副专精真实落库',stored.length===3 && stored.every(r=>{
      const expected=rows.find(x=>x.name===r.name && x.server===(r.server||''));
      return expected && r.spec===expected.mainSpec && JSON.stringify(r.off_specs)===JSON.stringify(expected.reportSpecs.slice(1));
    }));
    check('新成员不自动认领、不创建考勤',stored.every(r=>!r.user_id) && (await rest('activities?guild_id=eq.'+guildId)).length===0);
    await page.reload();
    await page.waitForFunction(()=>window.appData?.members?.length===3);
    check('刷新后专精保持',await page.evaluate(()=>appData.members.every(r=>(r.main_spec||r.spec) && (r.main_spec||r.spec)!=='待补充')));
    await page.evaluate(()=>showImportMembersModal());
    await page.locator('#importWclUrl').fill('https://www.warcraftlogs.com/reports/rFZAQTm4M7bCJcBp');
    await page.locator('#importWclParseBtn').click();await page.waitForSelector('#importPreviewStep',{state:'visible'});
    check('已存在成员默认不勾选',await page.evaluate(()=>importPreviewRows.filter(r=>r.status==='dup').length===3 && importPreviewRows.filter(r=>r.status==='dup').every(r=>!r.include)));
    check('重复预览不覆盖原成员',JSON.stringify(await rest('raid_members?guild_id=eq.'+guildId))===JSON.stringify(stored));
    check('页面无未捕获异常',errors.length===0);
    fs.writeFileSync(out+'/verification.json',JSON.stringify({checks,errors,report:'rFZAQTm4M7bCJcBp',realWcl:true,realDatabase:true},null,2));
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
