// Integration suite for verify-req203-web.cjs --personal-archive.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sql = name => fs.readFileSync(path.join(__dirname,'..','sql',name),'utf8');
async function setup(db,sessions) {
  const [owner,viewer] = sessions.map(s => s.user.id);
  await db.query(sql('schema_baseline_v1.sql').match(/CREATE TABLE IF NOT EXISTS user_characters\s*\([\s\S]+?\n\);/i)[0]);
  for (const name of ['43_req185_wcl_user_links.sql','44_req186_personal_wcl_characters.sql','28_req095_raid_members_server.sql']) await db.query(sql(name));
  await db.query('grant select,update on user_characters to service_role; grant select on wcl_user_links to service_role; grant select on raid_members,claim_requests,wishlists,loot_records to authenticated,service_role; grant update on raid_members to service_role; grant delete,insert on claim_requests,guild_members to service_role; grant select,insert,update on notifications to service_role; alter table notifications add column if not exists related_user_id uuid');
  const first = (await db.query("update guilds set invite_code='DUSK1128',claim_mode='free' where name='银松远征团' returning id")).rows[0].id;
  const second = (await db.query("insert into guilds(name,invite_code,owner_id,claim_mode) values('北辰','NORTH128',$1,'approval') returning id",[owner])).rows[0].id;
  await db.query("insert into guild_members(guild_id,user_id,role) values($1,$2,'owner')",[second,owner]);
  await db.query("insert into raid_members(guild_id,name,server,class,spec,user_id) values($1,'白砾','金色平原','战士','防护',$3),($2,'林间月','白银之手','德鲁伊','平衡',null)",[first,second,viewer]);
  await db.query("insert into user_characters(user_id,character_name,server_name,class,spec) values($1,'林间月','白银之手','德鲁伊','平衡'),($1,'白砾','金色平原','战士','防护'),($2,'别人的角色','金色平原','法师','冰霜')",[viewer,owner]);
  await db.query("insert into wishlists(guild_id,member_id,items) select guild_id,id,'[{\"itemName\":\"守卫长剑\"}]' from raid_members where name='白砾'");
  await db.query("insert into loot_records(guild_id,character_id,item_name,item_stats) select guild_id,id,v.name,jsonb_build_object('status',v.status) from raid_members cross join (values ('板甲护腕','已分配'),('待核实腰带','待分配')) v(name,status) where raid_members.name='白砾'");
  const plan = (await db.query("insert into decor_plans(user_id,name) values($1,'林间书房') returning id",[viewer])).rows[0].id;
  await db.query("insert into decor_plans(user_id,name) values($1,'炉边会客厅'),($2,'另一账号的方案')",[viewer,owner]);
  await db.query('insert into decor_plan_items(plan_id,record_id,qty) values($1,126,2)',[plan]);
}
function allows(url) {
  return /^\/rest\/v1\/(?:user_characters|raid_members|claim_requests|wishlists|loot_records|decor_plans|decor_plan_items|wcl_user_links|notifications|rpc\/(?:set_personal_display|req212_join_guild))(?:\?|$)/.test(url);
}
async function verify({author,viewer:p,guest,db,sessions,base,output,pass}) {
  const nav = key => p.locator('#iaSubnavPersonal [data-ia-key="'+key+'"]').click();
  const uid = sessions[1].user.id;
  const visible = async (selector,text) => p.locator(selector).getByText(text,{exact:true}).first().waitFor();
  const count = async (table,where,args) => (await db.query('select count(*)::int n from '+table+' where '+where,args)).rows[0].n;
  p.on('dialog',d=>d.accept());
  await visible('#wsPersonalData','2 份家宅方案');
  await nav('privacy');
  await p.locator('#paChoices button').filter({hasText:'林间月'}).click();
  await visible('#paPreview','林间月');
  await p.reload();
  await visible('#paPreview','林间月');
  const external = (await (await guest.request.get(base+'/api/wcl/user/public-character?userId='+uid)).json()).character;
  assert.deepEqual(Object.keys(external).sort(),['character_name','class','server_name','server_region']);
  assert.equal(external.character_name,'林间月');
  await p.screenshot({path:path.join(output,'privacy.png')});
  await p.locator('[data-pa-view="guild"]').click();
  await visible('#paPreview','白砾');
  assert.ok(!(await p.locator('#paPreview').innerText()).includes('林间月'));
  await p.locator('[data-pa-view="self"]').click();
  await visible('#paPreview','林间月'); await visible('#paPreview','白砾');
  await p.locator('#paWithdraw').click(); await visible('#paSaveStatus','已撤下展示');
  await p.locator('[data-pa-view="visitor"]').click();
  await visible('#paPreview','当前没有对外展示的角色。');
  pass('展示选择真实保存、刷新、撤下；访客仅四项，本会团员与本人视角独立');
  await nav('assets');
  await p.locator('#paRecords summary').filter({hasText:'装备心愿'}).click();
  await p.locator('#paRecords summary').filter({hasText:'已获装备'}).click();
  await visible('#paRecords','守卫长剑'); await visible('#paRecords','板甲护腕');
  assert.ok(!(await p.locator('#paRecords').innerText()).includes('待核实腰带'));
  await p.screenshot({path:path.join(output,'assets.png')});
  await p.locator('#paPlans button').filter({hasText:'林间书房'}).click();
  await p.locator('#page-decor-plan.active [data-step="1"]').first().click();
  await p.locator('#dhPpSave').click();
  await p.waitForFunction(()=>appData.decorPlan?.items?.[0]?.qty===3);
  await p.getByRole('button',{name:'← 返回我的资产'}).click();
  await visible('#paPlans','1 种家具 · 共 3 件');
  pass('两份个人方案、从原编辑器调整用量并回读；心愿和最终分配按认领角色筛选');
  await nav('claims');
  const join = async code => {
    await p.locator('#paJoin').locator('..').locator('summary').click();
    await p.locator('#paCode').fill(code);
    await p.locator('#paJoin button').click();
  };
  await join('NOTFOUND');
  await visible('#paJoinStatus','未加入公会，请核对邀请码后重试。');
  await p.locator('#paCode').fill('NORTH128'); await p.locator('#paJoin button').click();
  await p.locator('#paRoster').getByRole('button',{name:'申请认领'}).click();
  await p.locator('#claimConfirmBtn').click();
  await p.locator('#paRoster').getByRole('button',{name:'撤回申请'}).waitFor();
  await p.screenshot({path:path.join(output,'claims.png')});
  await nav('assets'); await visible('#paRecords','认领申请待审核。');
  assert.ok(!(await p.locator('#paRecords').innerText()).includes('守卫长剑'));
  await nav('claims'); await p.getByRole('button',{name:'撤回申请',exact:true}).click();
  await p.locator('#paRoster').getByRole('button',{name:'申请认领'}).waitFor();
  assert.equal(await count('claim_requests','user_id=$1 and status=$2',[uid,'pending']),0);
  pass('错误与有效邀请码，审核制提交、切到资产显示待审、撤回后数据库回读');
  await p.locator('#paGuilds .pa-row').filter({hasText:'银松远征团'}).getByRole('button',{name:'切换'}).click();
  await p.locator('#paRoster').getByRole('button',{name:'解除认领'}).click();
  await p.locator('#paRoster').getByRole('button',{name:'认领角色'}).click();
  await p.locator('#claimConfirmBtn').click();
  await p.locator('#paRoster').getByRole('button',{name:'解除认领'}).waitFor();
  assert.equal(await count('raid_members','user_id=$1',[uid]),1);
  await p.getByRole('button',{name:'退出公会',exact:true}).click();
  await p.waitForFunction(()=>CloudSync.getCurrentGuild()?.name==='北辰');
  await p.locator('#paGuilds .pa-row').filter({hasText:'北辰'}).getByRole('button',{name:'退出公会'}).click();
  await visible('#paGuilds','尚未加入公会。');
  await nav('assets'); await visible('#paPlans','1 种家具 · 共 3 件');
  await visible('#paRecords','加入公会后，可在这里查看已认领角色的团队记录。');
  assert.equal(await count('user_characters','user_id=$1',[uid]),2);
  assert.equal(await count('guild_members','user_id=$1',[uid]),0);
  pass('切会、解除、重新认领、退出最后一个公会，原角色和方案保留');
  await author.goto(base+'/#/personal/assets');
  await author.locator('#paPlans').getByText('另一账号的方案',{exact:true}).waitFor();
  assert.ok(!(await author.locator('#paPlans').innerText()).includes('林间书房'));
  await p.evaluate(() => handleSignOut());
  await p.evaluate(async session => {
    const {error} = await CloudSync.getClient().auth.setSession(session);
    if (error) throw error;
  },sessions[0]);
  await p.waitForFunction(id => CloudSync.getCachedUser()?.id===id,sessions[0].user.id);
  await p.evaluate(() => iaGoKey('assets'));
  await visible('#paPlans','另一账号的方案');
  assert.ok(!(await p.locator('#paPlans').innerText()).includes('林间书房'));
  for (const section of ['privacy','assets','claims']) {
    await guest.goto(base+'/#/personal/'+section);
    await guest.locator('#page-personal.active #wsPersonalGuest').waitFor();
    assert.equal(await guest.locator('#page-'+section).isVisible(),false);
  }
  pass('同浏览器登出并换号只见新账号方案；访客直达三个私有入口均进入登录引导');
}
module.exports = {setup,allows,verify};
