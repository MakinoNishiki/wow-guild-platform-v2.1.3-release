// node scripts/verify-req203-web.cjs --guild-recruitment (disposable database and Chrome).
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cardTable = 'guild_recruitment_cards';
const invite = 'WB212ABC';
const guildName = '银松远征团';
const otherName = '霜林二团';
const contactValue = '测试招募联络人';
let guildId;
let otherGuildId;

async function setup(db, sessions) {
  const migration = fs.readFileSync(path.join(__dirname,'..','sql','59_req212_guild_recruitment.sql'),'utf8');
  // Reproduce the existing grants before checking that the migration narrows them.
  await db.query('grant insert on guild_members to authenticated; grant insert,update on notifications to authenticated');
  await db.query('alter table notifications add column related_user_id uuid');
  await db.query(migration);
  await db.query(migration);
  const result = await db.query('update guilds set invite_code=$1 where name=$2 returning id',[invite,guildName]);
  guildId = result.rows[0].id;
  const other = await db.query('insert into guilds(name,invite_code,owner_id) values ($1,$2,$3) returning id',[otherName,'WB212DEF',sessions[0].user.id]);
  otherGuildId = other.rows[0].id;
  await db.query('grant insert, delete on guild_members to service_role; grant select,insert,update on notifications to service_role; grant select on notifications to authenticated');
}

function allows(url) {
  return /^\/rest\/v1\/(?:notifications|guild_recruitment_cards|rpc\/req212_\w+)(?:\?|$)/.test(url);
}

async function verify({author, viewer, guest, open, db, sessions, base, pass, output}) {
  const pathToCard = '/api/guild-recruitment';
  const profile = page=>page.locator('#page-guild-settings.active');
  const frame = page=>page.frameLocator('#grFrame');
  const dbState = async ()=> (await db.query('select guild_id,revision,card from '+cardTable+' order by guild_id')).rows;
  async function api(session,id,body) {
    const headers = session ? {Authorization:'Bearer '+session.access_token} : {};
    if (body) headers['Content-Type']='application/json';
    const res = await fetch(base+pathToCard+(body?'':'?guildId='+id),{
      headers,method:body?'POST':'GET',body:body && JSON.stringify({guildId:id,...body})
    });
    return {status:res.status, data:await res.json()};
  }
  async function save() {
    const saved = author.waitForResponse(response => new URL(response.url()).pathname === pathToCard && response.request().method()==='POST');
    await author.locator('#grSave').click();
    const response = await saved;
    return {status:response.status(),data:await response.json()};
  }
  async function seeContact(page, value) {
    await frame(page).locator('#readContact').getByText(value,{exact:true}).waitFor();
  }
  let acceptDialog = true;
  author.on('dialog',dialog=>acceptDialog ? dialog.accept() : dialog.dismiss());
  await profile(author).locator('#grEdit').waitFor();
  await author.locator('[data-ia-key=guild-permissions]').click();
  await author.locator('#page-guild-permissions.active #guildMembersList').getByText('团长 (我)',{exact:true}).waitFor();
  await author.locator('[data-ia-key=guild-settings]').click();
  assert.deepEqual(await dbState(),[]);
  assert.deepEqual(await api(sessions[0],guildId),{status:200,data:{card:null,revision:0}});
  assert.equal((await api(null,guildId)).status,401);
  assert.equal((await api(sessions[2],guildId)).status,403);
  const lookup = await fetch(base+'/api/db/rest/v1/guilds?invite_code=eq.'+invite,
    {headers:{Authorization:'Bearer '+sessions[2].access_token}});
  assert.equal(lookup.status,200);
  assert.deepEqual(await lookup.json(),[{id:guildId}]);
  const privileges = (await db.query(`select
    has_table_privilege('authenticated','guild_members','INSERT') as membership,
    has_table_privilege('authenticated','notifications','INSERT') as invitation,
    has_table_privilege('anon','guild_recruitment_cards','SELECT') as public,
    has_table_privilege('authenticated','guild_recruitment_cards','SELECT') as direct,
    has_function_privilege('authenticated','req212_read_card(uuid,uuid)','EXECUTE') as rpc`)).rows[0];
  assert.deepEqual(privileges,{membership:false,invitation:false,public:false,direct:false,rpc:false});
  await guest.locator('#page-team-guide.active').waitFor();
  assert.equal(await guest.locator('#gpRecruitment').isVisible(),false);
  await guest.goto(base+'/guild-recruitment.html');
  await guest.locator('#page-team-guide.active').waitFor();
  assert.equal(await guest.locator('#gpRecruitment').isVisible(),false);
  pass('公会名册可读取，空公会仅浏览不建卡；游客直接打开公会资料或嵌入页面均回到入会引导；未登录和未入会账号均读不到招募卡');

  await author.locator('#grEdit').click();
  const form = frame(author);
  await form.locator('#edition').selectOption('正式服');
  await form.locator('#mode').selectOption('团队副本');
  await form.locator('#dayButtons').getByText('周五',{exact:true}).click();
  await form.getByLabel('周五开始').fill('20:00');
  await form.getByLabel('周五结束').fill('00:30');
  await form.locator('#contactChoices').getByText('微信',{exact:true}).click();
  await form.getByLabel('微信号',{exact:true}).fill(contactValue);
  await form.locator('#contactChoices').getByText('QQ',{exact:true}).click();
  await form.getByLabel('QQ 号',{exact:true}).fill('测试招募 QQ');
  await form.locator('#voice').selectOption('是');
  await form.locator('#tool').selectOption('QQ');
  const bosses = form.locator('.boss-choice input');
  const bossCount = await bosses.count();
  assert.ok(bossCount > 0);
  await bosses.first().check();
  if (!(await form.locator('.picker-row').count())) await form.getByRole('button',{name:'添加招募需求'}).click();
  const need = form.locator('.picker-row').first();
  await need.locator('[data-field=class]').selectOption('德鲁伊');
  await need.getByRole('checkbox',{name:'平衡',exact:true}).check();
  await form.getByRole('button',{name:'添加招募需求'}).click();
  const warrior = form.locator('.picker-row').last();
  await warrior.locator('[data-field=class]').selectOption('战士');
  await warrior.getByRole('checkbox',{name:'坦克',exact:true}).check();
  assert.equal(await warrior.getByRole('checkbox',{name:'防护',exact:true}).isChecked(),true);
  await warrior.getByRole('checkbox',{name:'输出',exact:true}).check();
  for (const name of ['武器','狂怒']) {
    const spec = warrior.getByRole('checkbox',{name,exact:true});
    assert.equal(await spec.isChecked(),false);
    await spec.check();
  }
  await warrior.locator('[data-field=priority]').selectOption('高');
  await warrior.screenshot({path:path.join(output,'warrior-editor.png')});
  acceptDialog = false;
  await author.locator('[data-ia-key="guild"]').click();
  assert.equal(await form.getByLabel('微信号',{exact:true}).inputValue(),contactValue);
  assert.ok(author.url().endsWith('#/team/guild-settings'));
  acceptDialog = true;
  const failure = route=>route.request().method()==='POST' ? route.fulfill({status:503,json:{message:'测试保存失败'}}) : route.continue();
  await author.route('**/api/guild-recruitment*',failure);
  assert.equal((await save()).status,503);
  await author.locator('#grStatus').filter({hasText:/失败/}).waitFor();
  assert.equal(await form.getByLabel('微信号',{exact:true}).inputValue(),contactValue);
  assert.deepEqual(await dbState(),[]);
  await author.unroute('**/api/guild-recruitment*',failure);
  const first = await save();
  assert.equal(first.status,200,JSON.stringify(first.data));
  await seeContact(author,contactValue);
  assert.equal(await author.locator('#grSave').isVisible(),false);
  const [one] = await dbState();
  assert.equal(one.revision,1);
  assert.equal(one.guild_id,guildId);
  assert.deepEqual(one.card.contacts.map(c=>c.value).sort(),[contactValue,'测试招募 QQ'].sort());
  assert.equal(one.card.needs.some(n=>n.spec==='平衡'),true);
  const savedWarrior = one.card.needs.filter(n=>n.className==='战士');
  assert.deepEqual(savedWarrior,[{className:'战士',priority:'高',roles:['坦克','输出'],specs:['防护','武器','狂怒']}]);
  assert.ok(one.card.progress.length);
  assert.equal(JSON.stringify(one.card).includes('旧资料简介'),false);
  await author.reload();
  await seeContact(author,contactValue);
  assert.match(await form.locator('#readSchedule').innerText(),/次日00:30/);
  const shownProgress = await form.locator('#readProgress').innerText();
  assert.ok(shownProgress.includes('1 / '+bossCount),'原始首领总数 '+bossCount+'；刷新后 '+shownProgress);
  assert.match(await form.locator('#readNeeds').innerText(),/平衡/);
  const restoredWarrior = form.locator('#readNeeds .need-line').filter({hasText:'战士'});
  for (const value of ['防护','武器','狂怒','坦克','输出','高需求']) await restoredWarrior.getByText(value,{exact:true}).waitFor();
  await form.locator('#readNeeds').screenshot({path:path.join(output,'warrior-card.png')});
  pass('一条战士需求的双职责、三专精和高需求刻度经保存、刷新、资料库回读一致，旧格式的单专精仍可读取');
  pass('会长在公会资料选择专精、跨日排班和首领，填两种招募联系方式；放弃离开与失败保留表单，重试写入一条，刷新后全部回读');

  const secondValue = '更新后的招募负责人';
  await author.locator('#grEdit').click();
  const savedRow = form.locator('.picker-row:has([data-field=class] option:checked[value="战士"])');
  await savedRow.getByRole('checkbox',{name:'坦克',exact:true}).uncheck();
  assert.equal(await savedRow.getByRole('checkbox',{name:'防护',exact:true}).count(),0);
  assert.equal(await savedRow.getByRole('checkbox',{name:'狂怒',exact:true}).isChecked(),true);
  await savedRow.getByRole('checkbox',{name:'坦克',exact:true}).check();
  assert.equal(await savedRow.getByRole('checkbox',{name:'防护',exact:true}).isChecked(),true);
  await form.getByLabel('微信号',{exact:true}).fill('取消编辑的内容');
  await author.locator('#grCancel').click();
  await seeContact(author,contactValue);
  await author.locator('#grEdit').click();
  await form.getByLabel('微信号',{exact:true}).fill(secondValue);
  const edited = await save();
  assert.equal(edited.status,200);
  await seeContact(author,secondValue);
  assert.equal((await dbState()).length,1);
  assert.equal((await dbState())[0].revision,2);
  const repeated = await api(sessions[0],guildId,{expectedRevision:1,card:edited.data.card});
  assert.equal(repeated.status,200);
  assert.equal(repeated.data.revision,2);
  assert.equal((await api(sessions[0],guildId,{expectedRevision:1,card:one.card})).status,409);
  assert.equal((await dbState())[0].revision,2);
  pass('取消不改旧卡；修改联系人后仍是一条记录，相同请求重试不增加修订号，旧版本无法覆盖');

  for (const role of ['viewer','editor']) {
    await db.query('update guild_members set role=$1 where guild_id=$2 and user_id=$3',[role,guildId,sessions[1].user.id]);
    await viewer.reload();
    await seeContact(viewer,secondValue);
    await seeContact(viewer,'测试招募 QQ');
    assert.equal(await viewer.locator('#grEdit').isVisible(),role === 'editor');
    const member = await api(sessions[1],guildId);
    assert.deepEqual(member.data.card.contacts,edited.data.card.contacts);
    const canSave=await api(sessions[1],guildId,{expectedRevision:1,card:edited.data.card});
    assert.equal(canSave.status,role==='editor' ? 200 : 403);
    if (role === 'viewer') {
      for (const [width,height] of [[1366,768],[1920,1080]]) {
        await viewer.setViewportSize({width,height});
        await seeContact(viewer,secondValue);
        const body = frame(viewer).locator('body');
        assert.ok(await body.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
        await viewer.locator('#gpRecruitment').screenshot({path:path.join(output,`member-card-${width}.png`)});
      }
    }
  }
  viewer.on('dialog',dialog=>dialog.accept());
  await viewer.getByRole('button',{name:'退出此公会'}).click();
  await viewer.waitForURL('**/#/home');
  const departed = await api(sessions[1],guildId);
  assert.equal(departed.status,403);
  assert.ok(!JSON.stringify(departed).includes(secondValue));
  await viewer.goto(base+'/#/team/guild-settings');
  await viewer.locator('#page-team-guide.active').waitFor();
  assert.equal(await viewer.locator('#gpRecruitment').isVisible(),false);
  pass('本会成员可查全部联系方式，团员只读，公会编辑可保存；离会后同一登录会话立即失去读取权限');

  // Rejoin from the website with the real fixture invite, not an administrator write.
  await viewer.locator('#iaGuideInviteCode').fill(invite);
  await viewer.locator('#iaGuideJoinBtn').click();
  await viewer.waitForURL('**/#/team/dashboard');
  await viewer.goto(base+'/#/team/guild-settings');
  await seeContact(viewer,secondValue);
  assert.equal((await api(sessions[1],guildId)).status,200);
  pass('普通账号从入会引导输入有效邀请码，加入成功后可在正式档案查看招募卡');

  const invited=await open(sessions[2],1366);
  const invitation=await db.query("insert into notifications(guild_id,user_id,type,title,message) values ($1,$2,'guild_invite','测试邀请','诚邀加入银松远征团') returning id",[guildId,sessions[2].user.id]);
  const notice=await db.query("insert into notifications(guild_id,user_id,title) values ($1,$2,'普通站内消息') returning id",[guildId,sessions[2].user.id]);
  await db.query("insert into notifications(guild_id,user_id,title) values ($1,$2,'第二条普通消息')",[guildId,sessions[2].user.id]);
  await invited.locator('#userMenuTrigger').click();
  await invited.locator('#userMenuDropdown').getByRole('button',{name:'通知'}).click();
  const ordinaryRow=invited.locator('#notificationList .uc-notification-item').filter({hasText:'普通站内消息'});
  await ordinaryRow.click();
  await invited.locator('#notificationList .uc-notification-item.read').filter({hasText:'普通站内消息'}).waitFor();
  assert.equal((await db.query('select is_read from notifications where id=$1',[notice.rows[0].id])).rows[0].is_read,true);
  let readRequests=0;
  invited.on('request',req=>{
    if (new URL(req.url()).pathname==='/rest/v1/notifications' && req.method()==='PATCH') readRequests++;
  });
  await invited.locator('#notificationList').getByText('诚邀加入银松远征团',{exact:true}).click();
  assert.equal(readRequests,0);
  await invited.locator('#tab-notifications').getByRole('button',{name:'全部已读'}).click();
  await invited.locator('#notificationList .uc-notification-item.read').filter({hasText:'第二条普通消息'}).waitFor();
  assert.equal((await db.query('select is_read from notifications where id=$1',[invitation.rows[0].id])).rows[0].is_read,false);
  assert.equal(readRequests,1);
  await invited.locator('#notificationList').getByRole('button',{name:'接受邀请'}).click();
  await invited.waitForURL('**/#/team/dashboard');
  assert.equal(readRequests,1,'接受邀请由入会事务消费，无重复的标已读请求');
  assert.equal((await db.query('select is_read from notifications where id=$1',[invitation.rows[0].id])).rows[0].is_read,true);
  await invited.goto(base+'/#/team/guild-settings');
  await seeContact(invited,secondValue);
  pass('入会前用准确邀请码只能查到入会所需编号；普通消息可单条或全部标为已读，点邀请正文和全部已读均保留待处理邀请，接受时仅由入会事务消费一次');

  // Existing draft remains in the owner form until an explicit reload after a conflicting save.
  await author.locator('#grEdit').click();
  const proposedValue='尚未保存的负责人';
  await form.getByLabel('微信号',{exact:true}).fill(proposedValue);
  const anotherCard=structuredClone(edited.data.card);
  const currentValue='另一页确认的招募负责人';
  anotherCard.contacts.find(row=>row.type==='微信').value=currentValue;
  assert.equal((await api(sessions[0],guildId,{expectedRevision:2,card:anotherCard})).status,200);
  const conflict=await save();
  assert.equal(conflict.status,409);
  assert.equal(await form.getByLabel('微信号',{exact:true}).inputValue(),proposedValue);
  assert.equal(await author.locator('#grSave').isDisabled(),true);
  acceptDialog=false;
  await author.locator('#grRetry').click();
  assert.equal(await form.getByLabel('微信号',{exact:true}).inputValue(),proposedValue);
  acceptDialog=true;
  await author.locator('#grRetry').click();
  await seeContact(author,currentValue);
  pass('冲突时会长原输入仍在，确认重新读取才换成其他页面已保存版本');

  await db.query("insert into guild_members(guild_id,user_id,role) values ($1,$2,'owner')",[otherGuildId,sessions[0].user.id]);
  await author.reload();
  await seeContact(author,currentValue);
  await profile(author).getByRole('button',{name:'切换公会'}).click();
  await author.locator('#guildSwitcherList').getByText(otherName,{exact:true}).click();
  await profile(author).getByRole('heading',{name:new RegExp(otherName)}).waitFor();
  assert.deepEqual(await api(sessions[0],otherGuildId),{status:200,data:{card:null,revision:0}});
  await author.locator('#grEdit').click();
  await form.locator('#editor').waitFor();
  assert.equal(await form.locator('#contactChoices input:checked').count(),0);
  assert.equal(await form.locator('#contactFields input').evaluateAll((inputs,previous)=>inputs.some(el=>el.value===previous),currentValue),false);
  await author.locator('#grCancel').click();
  assert.equal((await dbState()).length,1);
  pass('同一会长通过页面切到另一公会，空卡无前公会联系人；取消后仍仅原公会一条保存记录');
}
module.exports = {setup,allows,verify};
