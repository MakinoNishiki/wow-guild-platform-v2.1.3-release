const assert=require('node:assert/strict');
module.exports=async({p,v,api,call,check,out,g,foreign,m1,fm,refresh,sample})=>{
  const guildId=g.id,now=Math.floor(Date.now()/1000)-120;
  const pickup=(event,name)=>({...sample,collectorSourceID:'req199',sourceEventID:event,playerName:name,bossName:'核对首领',encounterID:909,encounterAt:now,timestamp:now,playerRegion:'5',slot:'INVTYPE_WAIST'});
  const rows=[pickup('a','拾取甲'),pickup('b','拾取乙'),pickup('c','拾取丙')];
  const drop=(i)=>({kind:'drop',collectorSourceID:'req199',sourceEventID:'e'+i,observationKey:'drop:'+i,sequence:i,itemName:sample.itemName,itemID:sample.itemID,itemLink:sample.itemLink,quantity:1,bindingStatus:'ordinary',encounterID:909,encounterAt:now,timestamp:now,instanceName:sample.instanceName,difficultyID:16,bossName:'核对首领',captureVersion:'1.1.0'});
  const evidence=[1,2,3,4].map(drop);
  await refresh();await p.locator('#lootViewDrops .toolbar-right button').click();
  await p.locator('#lootDropImportText').fill(JSON.stringify({schemaVersion:2,rows:[],evidence:[null]}));await p.getByRole('button',{name:'解析预览',exact:true}).click();
  check('无效观察包不保留可提交预览',await p.locator('#lootDropImportConfirmBtn').isDisabled());
  await p.locator('#lootDropImportText').fill(JSON.stringify({schemaVersion:2,rows,evidence}));await p.getByRole('button',{name:'解析预览',exact:true}).click();
  check('四件观察三件拾取显示缺口且允许提交',(await p.locator('#lootDropImportPreview').innerText()).includes('尚有 1 件未匹配')&&await p.locator('#lootDropImportConfirmBtn').isEnabled());
  await p.screenshot({path:out+'/missing-preview.png',fullPage:true});
  await p.locator('#lootDropImportConfirmBtn').click();await p.waitForFunction(()=>!lootDropImportSaving&&!document.getElementById('lootDropImportModal').classList.contains('show'));
  check('真实数据库保存三件与四条清单',(await call('/rest/v1/loot_event_evidence?guild_id=eq.'+guildId)).length===4);
  const drops=await call('/rest/v1/loot_drops?guild_id=eq.'+guildId+'&encounter_id=eq.909');assert.equal(drops.length,3);
  const submit=(page,body)=>api(page,'/api/loot-observations/submit',{guildId,rows:[],...body});
  check('重传观察不重复',(await submit(p,{rows,evidence})).status===200&&(await call('/rest/v1/loot_event_evidence?guild_id=eq.'+guildId)).length===4);
  check('同事件内容冲突整批回滚',(await submit(p,{rows:[pickup('rollback','回滚')],evidence:[{...evidence[0],itemName:'篡改'}]})).status===409&&(await call('/rest/v1/loot_drops?guild_id=eq.'+guildId+'&player_name=eq.回滚')).length===0);
  const trade={...drop(10),kind:'trade',observationKey:'trade:10',outcome:'success',timestamp:now+30,fromName:'拾取甲',fromServer:'罗宁',toName:m1.name,toServer:m1.server};
  check('普通成员可提交本人交易证据',(await submit(v,{evidence:[trade]})).status===200);
  check('错误链接被拒绝',(await submit(p,{evidence:[{...trade,sourceEventID:'bad-link',itemID:1}]})).status===400);
  check('普通成员不能看公会交易参考',(await api(v,'/api/loot-observations/evidence',{guildId,sourceDropId:drops[0].id})).status===403);
  check('普通成员不能批量核对',(await api(v,'/api/loot-observations/batch',{guildId,action:'review',items:[{sourceDropId:drops[0].id}]})).status===403);
  check('跨公会提交拒绝',(await submit(p,{guildId:foreign.id,evidence})).status===403);
  // Select only the fixture rows with real checkboxes; do not mutate UI model.
  await refresh();for(const d of drops)await p.locator('[data-loot-select="'+d.id+'"]').check();
  p.once('dialog',d=>d.accept());await p.getByRole('button',{name:'批量核对',exact:true}).click();
  await p.waitForFunction(()=>!LootWorkflow.isBusy());check('批量核对落库后清空选择',await p.locator('#lootBatchCount').innerText()==='已选 0 件'&&(await call('/rest/v1/loot_drops?guild_id=eq.'+guildId+'&encounter_id=eq.909')).every(d=>d.review_status==='confirmed'));
  for(const d of drops)await p.locator('[data-loot-select="'+d.id+'"]').check();
  await p.getByRole('button',{name:'批量转分配',exact:true}).click();await p.locator('#lootBatchModal.show').waitFor();
  const tr=i=>p.locator('#lootBatchRows tr').nth(i);
  check('批量默认待分配，不猜获得者',await tr(0).locator('[data-batch-status]').inputValue()==='待分配'&&await tr(0).locator('[data-batch-member]').inputValue()==='');
  await tr(0).locator('[data-batch-status]').selectOption('已分配');await p.locator('#lootBatchSave').click();
  check('已分配缺人整批客户端拦截',(await p.locator('#lootBatchError').innerText()).includes('请选择')||(await p.locator('#lootBatchError').innerText()).includes('选择最终获得者'));
  await tr(0).locator('[data-batch-member]').selectOption(m1.id);await tr(1).locator('[data-batch-status]').selectOption('无人需求');
  for(const width of [1366,1920]){await p.setViewportSize({width,height:900});await p.screenshot({path:out+'/batch-'+width+'.png',fullPage:true});check(width+'批量弹窗边界可达',await p.locator('#lootBatchModal .modal').evaluate(el=>{const b=el.getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight&&el.scrollWidth<=el.clientWidth+1;}));}
  p.once('dialog',d=>d.dismiss());await p.locator('#lootBatchModal .modal-close').click();check('批量未保存关闭确认',await p.locator('#lootBatchModal.show').isVisible());
  // One row fails on real server validation; successful rows retain their own commits.
  let corrupt=true;
  await p.route('**/api/loot-observations/batch',route=>{
    const body=route.request().postDataJSON();if(body.action==='allocate'&&corrupt){corrupt=false;body.items[2].activityId=foreign.id;return route.continue({postData:JSON.stringify(body)});}return route.continue();
  });
  await p.locator('#lootBatchSave').click();await p.waitForFunction(()=>!LootWorkflow.isBusy());
  check('部分失败有逐行结果且成功项锁定',await p.locator('#lootBatchRows tr[data-saved]').count()===2&&await p.locator('#lootBatchSave').isEnabled());
  await p.screenshot({path:out+'/batch-partial.png',fullPage:true});
  await p.locator('#lootBatchSave').click();await p.waitForFunction(()=>!LootWorkflow.isBusy());await p.unroute('**/api/loot-observations/batch');
  check('只重试失败项并完成三件',await p.locator('#lootBatchRows tr[data-saved]').count()===3&&await p.locator('#lootBatchSave').isDisabled());
  const saved=await call('/rest/v1/loot_records?guild_id=eq.'+guildId);check('每来源一条，三种状态保留',drops.every(d=>saved.filter(l=>l.source_drop_id===d.id).length===1)&&['待分配','已分配','无人需求'].every(s=>saved.some(l=>drops.some(d=>d.id===l.source_drop_id)&&l.item_stats.status===s)));
  await p.locator('#lootBatchModal .modal-close').click();await refresh();
  const d=drops.find(d=>d.player_name==='拾取甲');await p.locator('[data-drop-allocate="'+d.id+'"]').click();await p.locator('.loot-trade-evidence').getByText('交易参考',{exact:true}).waitFor();
  check('保存后交易参考展示双方且不覆盖获得者',(await p.locator('.loot-trade-evidence').innerText()).includes('交易成功')&&(await p.locator('.loot-trade-evidence').innerText()).includes(m1.name));
  await p.screenshot({path:out+'/trade-reference.png',fullPage:true});await p.locator('#lootAllocationModal .modal-close').click();
  const viewerRead=await v.evaluate(async guildId=>{const config=await(await fetch('/api/supabase-config')).json();const r=await fetch(config.url+'/rest/v1/loot_event_evidence?guild_id=eq.'+guildId,{headers:{apikey:config.anonKey,Authorization:'Bearer '+await CloudSync.getAccessToken()}});return{status:r.status,rows:await r.json()};},guildId);
  // Authenticated user must see only their submitted trade, not officer/importer history.
  check('普通成员证据读权限限本人',viewerRead.status===200&&viewerRead.rows.length===1&&viewerRead.rows[0].kind==='trade');
};
