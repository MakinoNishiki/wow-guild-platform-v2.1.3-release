// Synthetic fixtures only; called within the existing isolated allocation lifecycle.
module.exports=async({p,v,open,save,alloc,call,check,out,savedId,d1,d2,m1,g})=>{
  const record=async()=> (await call('/rest/v1/loot_records?id=eq.'+savedId))[0];
  const before=await record();
  await open(d1.id);await p.locator('#lootAllocationStatus').selectOption('无人需求');
  check('无人需求清空并禁用获得者，说明可重新分配',await p.locator('#lootAllocationMember').inputValue()===''&&await p.locator('#lootAllocationMember').isDisabled()&&(await p.locator('#lootAllocationMember option').first().innerText())==='无需指定获得者'&&(await p.locator('#lootAllocationStatusHint').innerText()).includes('重新分配'));
  for(const width of [1366,1920]){
    await p.setViewportSize({width,height:900});
    check(width+'无人需求表单完整可见',await p.locator('#lootAllocationModal .modal').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&el.scrollWidth<=el.clientWidth+1;}));
    await p.waitForFunction(()=>![...document.querySelectorAll('.toast')].some(el=>el.getBoundingClientRect().height>0));
    await p.screenshot({path:out+'/no-demand-'+width+'.png',fullPage:true});
  }
  await p.route('**/api/loot-observations/allocate',r=>r.fulfill({status:503,json:{message:'无人需求保存失败测试'}}));
  await save();
  check('无人需求失败保留输入且不改变已分配记录',await p.locator('#lootAllocationStatus').inputValue()==='无人需求'&&(await record()).item_stats.status==='已分配');
  await p.unroute('**/api/loot-observations/allocate');await save();
  const after=await record();
  check('无人需求保存原记录并清空获得者',after.id===savedId&&after.item_stats.status==='无人需求'&&after.character_id===null&&after.member_name===''&&after.item_stats.assignedTo==='');
  check('无人需求保留原拾取证据和装备事实',JSON.stringify(after.item_stats.pickup_source)===JSON.stringify(before.item_stats.pickup_source)&&after.item_level===before.item_level&&after.difficulty===before.difficulty);
  check('无人需求撤回原获得者心愿已获取',(await call('/rest/v1/wishlists?member_id=eq.'+m1.id))[0].items[0].obtained===false);
  check('服务器拒绝无人需求同时指定获得者',(await alloc(p,{id:savedId,status:'无人需求',characterId:m1.id})).status===400);
  check('普通成员不能写无人需求',(await alloc(v,{id:savedId,status:'无人需求'})).status===403);
  check('非法状态仍拒绝',(await alloc(p,{id:savedId,status:'随便'})).status===400);
  await p.reload();await p.waitForFunction(()=>CloudSync.getCurrentGuild());await p.locator('#lootViewTabs [data-lootview="assign"]').click();
  await p.locator('#lootStatusFilter').selectOption('无人需求');
  check('刷新后无人需求筛选显示保存结果',(await p.locator('#lootTableBody').innerText()).includes('无人需求'));
  await p.screenshot({path:out+'/no-demand-list.png',fullPage:true});
  await p.locator('#lootStatusFilter').selectOption('待分配');
  check('无人需求不混入待分配',(await p.locator('#lootTableBody').innerText()).includes('剧毒悔恨束带')===false);
  await p.locator('#lootStatusFilter').selectOption('');
  await open(d2.id);await p.locator('#lootAllocationStatus').selectOption('无人需求');await save();
  const [created]=await call('/rest/v1/loot_records?source_drop_id=eq.'+d2.id);
  check('首次转分配可直接保存无人需求',created.item_stats.status==='无人需求'&&created.character_id===null);
  check('重复提交不覆盖无人需求',(await alloc(p,{sourceDropId:d2.id,status:'已分配',characterId:m1.id})).body.id===created.id&&(await call('/rest/v1/loot_records?id=eq.'+created.id))[0].item_stats.status==='无人需求');
  await call('/rest/v1/loot_records?id=eq.'+created.id,'DELETE');
  // Manual allocation uses the same vocabulary, with existing CRUD and no new source association.
  await p.getByRole('button',{name:'+ 添加装备',exact:true}).click();await p.locator('#lootModal.show').waitFor();
  await p.locator('#lootName').fill('无人需求手动测试');await p.locator('#lootAssignedTo').selectOption(m1.id);
  await p.locator('#lootStatus').selectOption('无人需求');
  check('手动分配无人需求也清空获得者',await p.locator('#lootAssignedTo').isDisabled()&&await p.locator('#lootAssignedTo').inputValue()==='');
  await p.locator('#lootSaveBtn').click();await p.locator('#lootModal').waitFor({state:'hidden'});
  const manual=(await call('/rest/v1/loot_records?guild_id=eq.'+g.id)).find(r=>r.item_name==='无人需求手动测试');
  check('手动无人需求真实保存',manual?.item_stats.status==='无人需求'&&manual.character_id===null);
  await call('/rest/v1/loot_records?id=eq.'+manual.id,'DELETE');
  await open(d1.id);
  check('重新打开回显无人需求',await p.locator('#lootAllocationStatus').inputValue()==='无人需求');
  await p.locator('#lootAllocationStatus').selectOption('已分配');await save();
  check('无人需求转已分配必须重新选人',(await p.locator('#lootAllocationError').innerText()).includes('请选择最终获得者'));
  await p.locator('#lootAllocationMember').selectOption(m1.id);await save();
  check('重新分配沿用原记录并恢复心愿',(await record()).character_id===m1.id&&(await call('/rest/v1/wishlists?member_id=eq.'+m1.id))[0].items[0].obtained===true);
};
