/* REQ-199: workflow UI; all mutations go through cloudCrud and existing server policy. */
(function(){
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const selected=new Set();let guild=null,visibleRows=[],busy=false,openedGuild=null,initial='';
  const $=id=>document.getElementById(id);
  function syncGuild(){const id=CloudSync.getCurrentGuild()?.id;if(guild!==id){selected.clear();guild=id;visibleRows=[];}updateToolbar();}
  function updateToolbar(){const el=$('lootBatchCount');if(el)el.textContent=`已选 ${selected.size} 件`;}
  function checkbox(d){return (GuildRoles.can('review') || GuildRoles.can('allocate'))&&!['merged','ignored'].includes(d.review_status)?`<input type="checkbox" class="loot-batch-check" aria-label="选择${esc(d.item_name)}，${esc(d.player_name)}" data-loot-select="${esc(d.id)}" ${selected.has(d.id)?'checked':''}>`:'';}
  function visible(rows){visibleRows=rows;for(const id of selected)if(!rows.some(r=>r.id===id))selected.delete(id);updateToolbar();}
  function preview(rows,events){
    const groups=LootEvidence.completeness(rows,events);
    const header='<strong>掉落核对</strong><p>仅核对本机观察清单与本次勾选拾取；观察清单可能不完整，数量一致也不代表全团已拾取完毕。</p>';
    return `<div class="loot-evidence-panel" role="status">${header}${groups.length?groups.map(g=>`<p><strong>${esc(g.boss||g.instance)}</strong> · 观察 ${g.observed} 件 · 匹配拾取 ${g.matched} 件${g.excluded?` · 已排除战团绑定 ${g.excluded} 件`:''}${g.unknown?` · 绑定信息待确认 ${g.unknown} 件`:''}<br>${g.unmatched?`<span class="loot-evidence-warning">尚有 ${g.unmatched} 件未匹配：${g.missing.map(m=>`${esc(m.name)} × ${m.quantity}`).join('、')}。可能尚未拾取或本机未观察到；可先提交已拾取装备。</span>`:'本机已知清单暂未发现缺口。'}</p>`).join(''):'<p>未获得可信掉落清单，无法判断是否漏捡。仍可提交有效拾取记录。</p>'}<p>交易证据 ${events.filter(e=>e.kind==='trade').length} 条；提交不会自动分配。</p></div>`;
  }
  async function showTrades(drop,guildId,container){
    let panel=container.querySelector('.loot-trade-evidence');if(panel)panel.remove();
    panel=document.createElement('div');panel.className='loot-evidence-panel loot-trade-evidence';panel.textContent='正在读取交易参考…';container.append(panel);
    if(!GuildRoles.can('review')){panel.textContent='交易证据由公会管理者核对。';return;}
    try{
      const r=await fetch('/api/loot-observations/evidence',{method:'POST',headers:{Authorization:'Bearer '+await CloudSync.getAccessToken(),'Content-Type':'application/json'},body:JSON.stringify({guildId,sourceDropId:drop.id})});const result=await r.json();
      if(CloudSync.getCurrentGuild()?.id!==guildId||!panel.isConnected)return;
      if(!r.ok)throw new Error(result.message||'交易参考读取失败');
      panel.innerHTML='<strong>交易参考</strong><p>仅包含安装插件者本人参与且可识别的交易；同变体可能有多件，请核对双方与时间，不自动确定最终获得者。</p>'+(result.events.length?result.events.map(e=>`<p>${esc(new Date(e.timestamp*1000).toLocaleString('zh-CN'))} · ${esc(({success:'交易成功',cancelled:'已取消',unknown:'结果未确认'})[e.outcome])}<br>${esc([e.fromName,e.fromServer].filter(Boolean).join(' · '))} → ${esc([e.toName,e.toServer].filter(Boolean).join(' · '))} · ${e.quantity} 件</p>`).join(''):'<p>暂无匹配交易证据，可人工确认去向。</p>')+(result.truncated?'<p>记录较多，当前仅展示部分候选。</p>':'');
    }catch(e){panel.textContent=(e.message||'交易参考暂不可用')+'；可继续人工核对，重新打开可重试。';}
  }
  async function review(){
    syncGuild();if(busy||!GuildRoles.can('review'))return;
    const ids=[...selected];if(!ids.length)return showToast('请先勾选拾取记录','error');
    if(ids.length>50)return showToast('每批最多50件','error');
    if(!confirm(`确认核对这 ${ids.length} 件拾取？这不会自动分配装备。`))return;
    const g=guild;busy=true;setToolbarDisabled(true);
    try{
      const payload={items:ids.map(sourceDropId=>({sourceDropId}))};
      await cloudCrud('lootDrops','batchReview',payload,{silentError:true});
      if(CloudSync.getCurrentGuild()?.id!==g)throw new Error('公会已切换，请在原公会核对');
      if(!cloudCrudSentinelCheck('lootDrops','batchReview',payload))throw new Error('保存回读未确认，请刷新后核对');
      const failures=payload.result.results.filter(r=>!r.ok);
      payload.result.results.filter(r=>r.ok).forEach(r=>selected.delete(r.sourceDropId));
      $('lootBatchFeedback').textContent=failures.length?failures.map(r=>`${appData.lootDrops.find(d=>d.id===r.sourceDropId)?.item_name||'装备'}：${r.message}`).join('；'):`已核对 ${ids.length} 件，可勾选后批量转分配。`;
      lootDropsRenderTable();updateToolbar();
    }catch(e){$('lootBatchFeedback').textContent=e.message;}
    finally{busy=false;setToolbarDisabled(false);}
  }
  function setToolbarDisabled(value){document.querySelectorAll('#lootBatchToolbar button').forEach(b=>b.disabled=value);}
  function snapshot(){return JSON.stringify([...document.querySelectorAll('#lootBatchModal input,#lootBatchModal select')].map(el=>el.value));}
  function statusChanged(tr){const status=tr.querySelector('[data-batch-status]').value,member=tr.querySelector('[data-batch-member]');if(status!=='已分配')member.value='';member.disabled=busy||status!=='已分配';member.style.color=window.IconMap?.classColor(appData.members.find(m=>m.id===member.value)?.class)||'var(--text-primary)';}
  async function open(){
    syncGuild();if(busy||!GuildRoles.can('allocate'))return;
    const ids=[...selected];if(!ids.length||ids.length>50)return showToast('请勾选1至50件已核对的单件拾取','error');
    const g=guild;busy=true;setToolbarDisabled(true);
    try{
      await Promise.all(['lootDrops','loots','members','activities'].map(k=>CloudSync.reloadData(k)));
      if(CloudSync.getCurrentGuild()?.id!==g)return;
      const rows=ids.map(id=>appData.lootDrops.find(r=>r.id===id));
      if(rows.some(d=>!d||d.review_status!=='confirmed'||d.quantity!==1))throw new Error('选中记录包含未核对或非单件装备，请先核对；可取消勾选异常项。');
      if(rows.some(d=>appData.loots.some(l=>l.source_drop_id===d.id)))throw new Error('选中装备已有分配记录，请通过“查看分配”修改；批量入口只创建新分配。');
      openedGuild=g;
      const members=(appData.members||[]).filter(m=>!['离队','inactive'].includes(m.status));
      const options='<option value="">请选择最终获得者</option>'+members.map(m=>`<option style="color:${IconMap.classColor(m.class)||'var(--text-primary)'}" value="${esc(m.id)}">${esc(m.name)} · ${esc(m.server||'服务器未提供')} · ${esc(m.class)}</option>`).join('');
      $('lootBatchRows').innerHTML=rows.map(d=>`<tr data-batch-id="${esc(d.id)}"><td><strong>${esc(d.item_name)}</strong><br><small>拾取人：${esc(d.player_name)} · ${esc(d.player_server||'服务器未提供')}</small></td><td><select class="form-input" data-batch-status aria-label="${esc(d.item_name)}分配状态"><option>待分配</option><option>已分配</option><option>无人需求</option></select></td><td><select class="form-input" data-batch-member aria-label="${esc(d.item_name)}最终获得者" disabled>${options}</select></td><td><input class="form-input" data-batch-boss aria-label="${esc(d.item_name)}首领" maxlength="160" value="${esc(d.boss_name||'')}"></td><td data-batch-result role="status">尚未保存</td></tr>`).join('');
      $('lootBatchActivity').innerHTML='<option value="">暂不关联活动</option>'+(appData.activities||[]).filter(a=>a.status!=='cancelled').map(a=>`<option value="${esc(a.id)}">${esc(a.date||a.activity_date)} · ${esc(a.name||a.raid_name||a.raidName||'活动')}</option>`).join('');
      $('lootBatchMethod').innerHTML=Object.entries(LOOT_DISTRIBUTION_LABELS).map(([k,v])=>`<option value="${k}" ${k==='custom'?'selected':''}>${v}</option>`).join('');
      $('lootBatchError').textContent='';$('lootBatchSave').disabled=false;
      initial=snapshot();openModal('lootBatchModal');
    }catch(e){showToast(e.message,'error');}
    finally{busy=false;setToolbarDisabled(false);}
  }
  async function save(){
    if(busy||!GuildRoles.can('allocate'))return;
    if(CloudSync.getCurrentGuild()?.id!==openedGuild){$('lootBatchError').textContent='公会已切换，请关闭后重新打开';return;}
    const trs=[...$('lootBatchRows').querySelectorAll('tr')].filter(tr=>!tr.dataset.saved);
    const items=trs.map(tr=>({sourceDropId:tr.dataset.batchId,status:tr.querySelector('[data-batch-status]').value,characterId:tr.querySelector('[data-batch-member]').value||null,boss:tr.querySelector('[data-batch-boss]').value.trim(),activityId:$('lootBatchActivity').value||null,method:$('lootBatchMethod').value}));
    if(items.some(i=>i.status==='已分配'&&!i.characterId)){ $('lootBatchError').textContent='请为每件已分配装备选择最终获得者。';return; }
    if(!items.length)return;
    busy=true;$('lootBatchError').textContent='保存中…';
    const controls=[...document.querySelectorAll('#lootBatchModal input,#lootBatchModal select,#lootBatchModal button')];controls.forEach(el=>el.disabled=true);
    try{
      const payload={items};await cloudCrud('loots','batchAllocate',payload,{silentError:true});
      if(CloudSync.getCurrentGuild()?.id!==openedGuild)throw new Error('公会已切换，请在原公会核对保存结果');
      if(!cloudCrudSentinelCheck('loots','batchAllocate',payload))throw new Error('保存后回读未确认，请保留表单重试');
      for(const r of payload.result.results){
        const tr=trs.find(t=>t.dataset.batchId===r.sourceDropId);if(!tr)continue;
        tr.querySelector('[data-batch-result]').textContent=r.ok?(r.repeated?'已存在，未覆盖':'已保存'):r.message;
        if(r.ok){tr.dataset.saved='true';selected.delete(r.sourceDropId);}
      }
      // Reuse existing idempotent wishlist linkage; allocation remains saved if linkage needs retry.
      const syncErrors=[];
      for(const r of payload.result.results.filter(r=>r.ok)){
        const saved=appData.loots.find(l=>l.id===r.id);
        try{await syncWishlistLinkages(saved,null,{throwOnError:true});}catch(e){syncErrors.push(saved?.itemName||'装备');}
      }
      const failed=payload.result.results.filter(r=>!r.ok).length;
      $('lootBatchError').textContent=failed?`${failed} 件未保存，其他已保存。修正后重试只处理失败项。`:'本批保存完成，可关闭后查看分配记录。';
      if(syncErrors.length)$('lootBatchError').textContent+=' 部分心愿联动未确认，请打开对应分配记录重新保存。';
      initial=snapshot();lootRender();lootDropsRenderTable();updateToolbar();
    }catch(e){$('lootBatchError').textContent=e.message+'；已成功的记录重试不会重复创建。';}
    finally{
      busy=false;controls.forEach(el=>el.disabled=false);
      for(const tr of $('lootBatchRows').querySelectorAll('tr')){statusChanged(tr);if(tr.dataset.saved)tr.querySelectorAll('input,select').forEach(el=>el.disabled=true);}
      $('lootBatchSave').disabled=![...$('lootBatchRows').querySelectorAll('tr')].some(tr=>!tr.dataset.saved);
    }
  }
  document.addEventListener('change',e=>{
    if(e.target.matches('[data-loot-select]')){e.target.checked?selected.add(e.target.dataset.lootSelect):selected.delete(e.target.dataset.lootSelect);updateToolbar();}
    if(e.target.closest('#lootBatchModal'))$('lootBatchError').textContent='';
    if(e.target.matches('[data-batch-status],[data-batch-member]'))statusChanged(e.target.closest('tr'));
  });
  modalDirtyChecks.lootBatchModal=()=>busy||snapshot()!==initial;
  window.LootWorkflow={syncGuild,visible,checkbox,preview,showTrades,review,open,save,isBusy:()=>busy,
    selectAll(){syncGuild();visibleRows.filter(d=>!['ignored','merged'].includes(d.review_status)).slice(0,50).forEach(d=>selected.add(d.id));lootDropsRenderTable();},
    clear(){selected.clear();lootDropsRenderTable();}};
})();
