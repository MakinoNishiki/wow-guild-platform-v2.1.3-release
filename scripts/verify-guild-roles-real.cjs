// Run through verify-req203-web.cjs --guild-roles. Every mutation targets the disposable local database.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sql = name => fs.readFileSync(path.join(__dirname, '..', 'sql', name), 'utf8');

// The real upstream can end one network chunk in the middle of a Chinese character.
function sendFragmentedRoles(incoming, response) {
  const chunks = [];
  incoming.on('data', chunk => chunks.push(chunk));
  incoming.on('end', () => {
    const bytes = Buffer.concat(chunks);
    const name = bytes.includes(Buffer.from('考勤官')) ? '考勤官' : '团员';
    const start = bytes.indexOf(Buffer.from(name));
    assert.notEqual(start, -1);
    const split = start + Buffer.byteLength(name[0]) + 1;
    response.write(bytes.subarray(0, split));
    setTimeout(() => response.end(bytes.subarray(split)), 15);
  });
}

async function setupSchema(db) {
  for (const file of ['42_task075_loot_drops.sql','45_req191_loot_observations.sql','46_req195_person_attendance.sql','47_req199_loot_evidence.sql','60_req191_guild_roles.sql','60_req191_guild_roles.sql']) {
    await db.query(sql(file));
  }
}

async function setup(db, sessions) {
  await db.query('grant select on raid_members to service_role,authenticated');
  await db.query("insert into raid_members (guild_id,user_id,name,class) select id,$1,'测试角色','牧师' from guilds where name='银松远征团'",[sessions[1].user.id]);
}

async function verify({author, viewer, guest, db, sessions, base, output, pass}) {
  const {rows:[guild]} = await db.query("select id from guilds where name='银松远征团'");
  const roleRow = async () => (await db.query('select * from guild_roles where guild_id=$1 and name=$2',[guild.id,'考勤官'])).rows[0];
  const entry = author.locator('[data-ia-key=guild-permissions]');
  assert.deepEqual((await author.locator('#iaSubnavTeam .ia-pill').allTextContents()).slice(0,3),['公会资料','成员权限','公会战报']);
  await entry.click();
  assert.equal(await entry.locator('img').getAttribute('src'),'assets/icons/guild-roles/king.svg');
  await viewer.locator('[data-ia-key=guild-permissions]').click();
  await guest.goto(base+'/#/team/guild-permissions');
  await guest.locator('#page-team-guide.active').waitFor();
  await author.locator('#page-guild-permissions.active').waitFor();
  await author.locator('#guildMembersList .gr-badge').first().waitFor();
  await author.evaluate(()=>Promise.all([GuildRoles.refreshMembers(), GuildRoles.load(true)]));
  assert.ok(await author.locator('#guildMembersList .gr-badge').count(),'刷新成员和重新激活页签后应仍有成员身份');
  await author.screenshot({path:path.join(output,'permissions-entry.png'),animations:'disabled'});
  const manager = author.locator('#guildRoleManager');
  const member = author.locator('#guildMembersList .guild-member-item').filter({hasText:'测试团员'});
  const modal = author.locator('#guildRolesModal');
  await member.locator('.gr-badge').waitFor();
  assert.equal(await member.locator('.gr-badge').innerText(),'团员');
  assert.equal(await member.locator('.gr-piece').getAttribute('src'),'assets/icons/guild-roles/pawn.svg');
  const assign = member.getByRole('button',{name:'分配角色'});
  const remove = member.getByRole('button',{name:'移除'});
  const color = button => button.evaluate(async el => {
    const style = getComputedStyle(el);
    await Promise.all(el.getAnimations().map(animation => animation.finished));
    return style.color;
  });
  const token = name => member.evaluate((el, name) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(' + name + ')';
    el.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, name);
  assert.equal(await color(assign),await token('--text-primary'));
  await assign.hover();
  assert.equal(await color(assign),await token('--gold'));
  await assign.click();
  const selection=modal.locator('#grmAssignedRole');
  const saveAssignment=modal.getByRole('button',{name:'保存分配'});
  const readMemberRole=async ()=>(await db.query('select role from guild_members where guild_id=$1 and user_id=$2',[guild.id,sessions[1].user.id])).rows[0].role;
  const definitions=async ()=>(await db.query('select role_key,revision,permissions from guild_roles where guild_id=$1 order by role_key',[guild.id])).rows;
  const originalDefinitions=await definitions();
  assert.equal(await selection.inputValue(),'viewer');
  assert.equal(await modal.locator('#grmAssignedRole option:checked').innerText(),'团员');
  assert.match(await selection.locator('..').textContent(),/测试团员/);
  assert.equal(await modal.locator('#grmPreview fieldset').count(),5);
  assert.equal(await modal.locator('#grmPreview [role=switch]:disabled').count(),17);
  assert.equal(await modal.getByRole('switch',{name:'提交拾取记录'}).isChecked(),true);
  assert.equal(await modal.getByRole('switch',{name:'编辑内部招募卡'}).isChecked(),false);
  assert.equal(await saveAssignment.isDisabled(),true);
  await author.screenshot({path:path.join(output,'assignment-initial.png'),animations:'disabled'});
  await modal.locator('[data-gr-role=viewer]').click();
  assert.equal(await selection.inputValue(),'viewer');
  assert.equal(await saveAssignment.isVisible(),true);
  await selection.selectOption('editor');
  assert.equal(await modal.locator('[data-gr-role=editor]').getAttribute('aria-pressed'),'true');
  assert.equal(await modal.getByRole('switch',{name:'编辑内部招募卡'}).isChecked(),true);
  assert.equal(await modal.getByRole('switch',{name:'绑定或解绑公会 WCL'}).isChecked(),false);
  assert.equal(await readMemberRole(),'viewer');
  await modal.locator('[data-gr-role=viewer]').click();
  assert.equal(await selection.inputValue(),'viewer');
  assert.equal(await saveAssignment.isDisabled(),true);
  await modal.locator('[data-gr-role=editor]').click();
  author.once('dialog',dialog=>dialog.accept());
  await modal.locator('.modal-close').click();
  await modal.waitFor({state:'hidden'});
  assert.equal(await readMemberRole(),'viewer');
  await assign.click();
  assert.equal(await selection.inputValue(),'viewer');
  await selection.selectOption('editor');
  await saveAssignment.click();
  await modal.waitFor({state:'hidden'});
  assert.equal(await readMemberRole(),'editor');
  await assign.click();
  assert.equal(await selection.inputValue(),'editor');
  assert.equal(await modal.getByRole('switch',{name:'编辑内部招募卡'}).isChecked(),true);
  await modal.locator('[data-gr-role=viewer]').click();
  await saveAssignment.click();
  await modal.waitFor({state:'hidden'});
  assert.equal(await readMemberRole(),'viewer');
  assert.deepEqual(await definitions(),originalDefinitions);
  pass('成员行首开即展示五组 17 项权限，侧栏和下拉同步；取消保留原身份，保存后重新打开读取新身份，角色配置未被改写');
  const dialogSeen = new Promise(resolve => author.once('dialog', async dialog => {
    const message = dialog.message();
    await dialog.dismiss();
    resolve(message);
  }));
  await remove.hover();
  assert.equal(await color(remove),await token('--danger'));
  await remove.click();
  assert.match(await dialogSeen,/移除成员.*测试团员/);
  assert.equal(await member.count(),1);
  await viewer.locator('#guildMembersList .gr-badge').first().waitFor();
  assert.equal(await viewer.locator('#guildMembersList [data-gr-assign],#guildMembersList [data-gr-remove]').count(),0);
  await author.mouse.move(0,0);
  await author.locator('.gp-members').screenshot({path:path.join(output,'default-member-actions.png'),animations:'disabled'});
  pass('角色响应在汉字中间分包，成员行和分配窗口仍显示「团员」；会长可打开分配、取消移除，普通成员无管理按钮');
  await manager.click();
  assert.equal(await modal.locator('[data-gr-role]').count(),3);
  assert.equal(await modal.locator('[data-gr-role=owner] img').getAttribute('src'),'assets/icons/guild-roles/king.svg');
  await modal.locator('[data-gr-role=editor]').click();
  assert.equal(await modal.locator('[name=grant-edit-card]').isChecked(),true);
  assert.equal(await modal.locator('[name=grant-wcl]').isChecked(),false);
  pass('从正式公会资料打开成员权限，默认三角色与编辑招募卡、绑定 WCL 的默认开关正确');
  await modal.locator('#grmNew').click();
  assert.equal(await modal.locator('.gr-pieces img').count(),6);
  assert.equal(await modal.getByRole('switch').count(),17);
  await modal.locator('[name=grmName]').fill('考勤官');
  await modal.locator('.gr-pieces label').filter({hasText:'王后'}).click();
  await modal.getByRole('switch',{name:'维护活动和考勤'}).check();
  await modal.getByRole('switch',{name:'编辑内部招募卡'}).check();
  await modal.locator('#grmSave').click();
  await modal.getByText('角色已保存',{exact:true}).waitFor();
  const role = await roleRow();
  assert.equal(role.piece,'queen');
  assert.equal(role.permissions.attendance,true);
  assert.equal(role.revision,1);
  await author.screenshot({path:path.join(output,'role-editor-1920.png'),animations:'disabled'});
  pass('会长从正式弹窗创建王后徽记的考勤官并启用考勤权限，保存后服务器与数据库一致');
  await modal.locator('#grmAssignSelected').click();
  await modal.waitFor({state:'hidden'});
  await author.locator('#guildMembersList .guild-member-item').filter({hasText:'测试团员'}).getByText('考勤官').waitFor();
  const {rows:[assigned]}=await db.query('select role,custom_role_key from guild_members where user_id=$1 and guild_id=$2',[sessions[1].user.id,guild.id]);
  assert.deepEqual(assigned,{role:'viewer',custom_role_key:role.role_key});
  await assign.click();
  assert.equal(await selection.inputValue(),role.role_key);
  assert.equal(await modal.locator('#grmPreview .gr-piece').getAttribute('src'),'assets/icons/guild-roles/queen.svg');
  assert.equal(await modal.getByRole('switch',{name:'维护活动和考勤'}).isChecked(),true);
  await modal.locator('.modal-close').click();
  await author.reload();
  await author.locator('#guildMembersList .gr-badge').filter({hasText:'考勤官'}).waitFor().catch(async error=>{
    throw new Error(error.message+'；当前视图 '+new URL(author.url()).hash+'；'+await author.locator('#guildMembersList').textContent());
  });
  await author.locator('.gp-members').screenshot({path:path.join(output,'guild-members-entry.png'),animations:'disabled'});
  await viewer.reload();
  await viewer.getByRole('button',{name:'查看角色权限'}).click();
  const readOnly=viewer.locator('#guildRolesModal');
  assert.equal(await readOnly.locator('#grmNew').count(),0);
  assert.equal(await readOnly.locator('#grmSave').isVisible(),false);
  assert.equal(await readOnly.locator('[name=grant-attendance]').isDisabled(),true);
  assert.equal(await viewer.evaluate(()=>GuildRoles.can('attendance')),true);
  assert.equal(await viewer.evaluate(()=>GuildRoles.can('configure')),false);
  await viewer.screenshot({path:path.join(output,'member-role-1366.png'),animations:'disabled'});
  pass('会长分配后刷新仍见新身份；另一成员账号读取同一结果并具备考勤权限，管理入口只读');
  await viewer.locator('#guildRolesModal .modal-close').click();
  await viewer.locator('[data-ia-key=guild-settings]').click();
  await viewer.getByRole('button',{name:'填写招募卡'}).click();
  await viewer.locator('#grSave:enabled').waitFor();
  await viewer.locator('#grCancel').click();
  assert.equal(await viewer.locator('#wclLookupBtn').isVisible(),false);
  await viewer.goto(base+'/#/team/attendance');
  await viewer.getByRole('button',{name:'创建活动'}).click();
  await viewer.locator('#activityModal.show').waitFor();
  await viewer.locator('#activityModal .modal-close').click();
  pass('受委托团员可打开招募卡编辑器、考勤创建活动弹窗，公会资料的 WCL 绑定控件保持隐藏');
  await viewer.goto(base+'/#/team/members');
  await viewer.locator('.gr-character-identity').getByText('考勤官',{exact:true}).waitFor();
  assert.equal(await viewer.locator('.gr-character-identity img').getAttribute('src'),'assets/icons/guild-roles/queen.svg');
  pass('成员管理的已认领角色显示同一账号的王后徽记与自定义身份');
  await manager.click();
  await modal.locator('[data-gr-role="'+role.role_key+'"]').click();
  await modal.locator('[name=grmName]').fill('训练官');
  await db.query("update guild_roles set name='资深考勤官',revision=revision+1 where role_key=$1 and guild_id=$2",[role.role_key,guild.id]);
  const [conflict]=await Promise.all([
    author.waitForResponse(r=>r.url().endsWith('/api/guild-roles') && r.request().method()==='POST',{timeout:30000}),
    modal.locator('#grmSave').click()
  ]);
  assert.equal(conflict.status(),409,await conflict.text());
  await modal.getByRole('button',{name:'重新读取'}).waitFor();
  assert.equal(await modal.locator('[name=grmName]').inputValue(),'训练官');
  assert.equal((await db.query('select name from guild_roles where role_key=$1 and guild_id=$2',[role.role_key,guild.id])).rows[0].name,'资深考勤官');
  const response=await guest.request.get(base+'/api/guild-roles?guildId='+guild.id);
  assert.equal(response.status(),401);
  pass('并发改名时旧表单保留输入、提示重新读取，较新的改名保留；访客读取角色接口返回 401');
}
module.exports={setupSchema,setup,verify,sendFragmentedRoles};
