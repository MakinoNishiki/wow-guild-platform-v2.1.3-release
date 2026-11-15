// REQ-195: guild people own attendance; characters remain equipment identities.
let personStatisticsMode = 'person', personLinkBusy = false, personAttendanceBusy = false,personLinkRequestId=null,personLinkSnapshot='',personLinkAttempt='';
const personEsc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const personLinkForm=()=>JSON.stringify([...document.querySelectorAll('#personLinkModal input,#personLinkModal select')].map(e=>e.type==='checkbox'?e.checked:e.value));
modalDirtyChecks.personLinkModal=()=>personLinkBusy||personLinkForm()!==personLinkSnapshot;
let personAttendanceSnapshot='';
const personAttendanceForm=()=>JSON.stringify([...document.querySelectorAll('#attendanceMembersList .attend-status-select,#attendanceMembersList .person-character')].map(e=>e.type==='checkbox'?e.checked:e.value));
modalDirtyChecks.attendanceDetailModal=()=>personAttendanceBusy||(appData.activities.find(a=>a.id===currentActivityId)?.attendance_mode==='person'?personAttendanceForm()!==personAttendanceSnapshot:attendanceHasUnsavedMarks(appData.activities.find(a=>a.id===currentActivityId)||{attendees:[]}));
function personMode(){return appData.peopleReady ? personStatisticsMode : 'legacy';}
function attendanceRows(activity){return activity.attendance_mode==='person' ? (activity.person_attendees||[]) : (activity.attendees||[]);}
function personChildren(id){return appData.members.filter(m=>m.person_id===id&&!isDepartedStatus(m.status));}
function personIdForActivity(activity,member){return activity.person_attendees?.find(a=>(a.characters||[]).some(c=>c.id===member.id))?.person_id||member.person_id;}
function statisticsMembers(activities=appData.activities){
  if(personMode()==='legacy')return appData.members.filter(m=>!isDepartedStatus(m.status));
  const snapshots=new Map();for(const activity of activities)if(activity.attendance_mode==='person'&&activity.status!=='cancelled')for(const row of activity.person_attendees||[])snapshots.set(row.person_id,row.person_name);
  if(snapshots.size)return [...snapshots].map(([id,name])=>({...personChildren(id)[0],id,name,person_id:id,__person:true,server:''}));
  return (appData.people||[]).filter(p=>p.status==='active'&&personChildren(p.id).length).map(p=>({...personChildren(p.id)[0],id:p.id,name:p.name,person_id:p.id,__person:true,server:''}));
}
function personStatsControl(pageId){
  const page=document.getElementById(pageId);if(!page)return;
  let bar=page.querySelector('.person-stat-mode');
  if(!bar){bar=document.createElement('div');bar.className='toolbar person-stat-mode';page.prepend(bar);}
  bar.innerHTML=`<label>考勤口径 <select class="form-select" onchange="personStatisticsMode=this.value;renderCurrentPage()"><option value="person" ${personMode()==='person'?'selected':''} ${!appData.peopleReady?'disabled':''}>按团员（新活动）</option><option value="legacy" ${personMode()==='legacy'?'selected':''}>按角色（历史活动）</option></select></label><small>两种口径分别统计，不混加。角色行显示所属团员的出勤率。</small>`;
}
function personStats(memberId, activities){
  const m=appData.members.find(m=>m.id===memberId),id=m?.person_id||memberId;
  if(personMode()==='legacy')return getAttendanceStatsCore(activities.filter(a=>a.attendance_mode!=='person'),a=>a.member_id===memberId);
  return getAttendanceStatsCore(activities.filter(a=>a.attendance_mode==='person').map(a=>({...a,attendees:a.person_attendees||[]})),a=>a.person_id===id);
}
function personMemberLabel(member){const p=(appData.people||[]).find(p=>p.id===member.person_id);return `<small class="person-owner-label">团员：${personEsc(p?.name||'尚未关联')}</small>`;}
async function personLinkOpen(){
  if(!CloudSync.canEdit())return;
  if(!appData.peopleReady){showToast(appData.peopleError||'团员功能尚未就绪，请完成数据库更新','error');return;}
  const selected=appData.members.filter(m=>memberSelectedIds.has(m.id)&&!isDepartedStatus(m.status));
  if(!selected.length){showToast('请先勾选属于同一人的角色','warning');return;}
  const el=document.getElementById('personLinkMembers');el.innerHTML=selected.map(m=>`<label><input type="checkbox" value="${personEsc(m.id)}" checked> <span class="class-${classMap[m.class]||''}">${personEsc(memberDisplayName(m))}</span></label>`).join('');
  const sameAccount=selected.length===1&&selected[0].user_id?appData.members.filter(m=>m.user_id===selected[0].user_id&&!selected.some(s=>s.id===m.id)&&!isDepartedStatus(m.status)):[];
  if(sameAccount.length)el.insertAdjacentHTML('beforeend','<p>同一账号认领的其他角色（请核对后勾选）：</p>'+sameAccount.map(m=>`<label><input type="checkbox" value="${personEsc(m.id)}"> ${personEsc(memberDisplayName(m))}</label>`).join(''));
  document.getElementById('personLinkTarget').innerHTML='<option value="">新建团员 / 将所选角色独立成一人</option>'+(appData.people||[]).filter(p=>p.status==='active').map(p=>`<option value="${personEsc(p.id)}">${personEsc(p.name)}</option>`).join('');
  document.getElementById('personLinkName').value=selected[0].name;
  const target=document.getElementById('personLinkTarget');if(selected[0].person_id&&selected.every(m=>m.person_id===selected[0].person_id)){target.value=selected[0].person_id;document.getElementById('personLinkName').value=(appData.people||[]).find(p=>p.id===target.value)?.name||selected[0].name;}
  target.onchange=()=>{const person=(appData.people||[]).find(p=>p.id===target.value);if(person)document.getElementById('personLinkName').value=person.name;};
  document.getElementById('personLinkError').textContent='';personLinkAttempt='';personLinkRequestId=crypto.randomUUID();personLinkSnapshot=personLinkForm();openModal('personLinkModal');
}
async function personLinkSave(){
  if(personLinkBusy||!CloudSync.canEdit())return;
  const memberIds=[...document.querySelectorAll('#personLinkMembers input:checked')].map(x=>x.value),name=document.getElementById('personLinkName').value.trim(),personId=document.getElementById('personLinkTarget').value||null;
  const error=document.getElementById('personLinkError');if(!memberIds.length||!name){error.textContent='请选择角色并填写团员称呼';return;}
  if(!confirm('确认所选角色属于同一团员？之后活动按此关系考勤，历史考勤保持不变。'))return;
  const signature=JSON.stringify({memberIds,personId,name});if(personLinkAttempt&&signature!==personLinkAttempt){personLinkRequestId=crypto.randomUUID();}personLinkAttempt=signature;
  personLinkBusy=true;document.getElementById('personLinkSave').disabled=true;
  document.querySelectorAll('#personLinkModal input,#personLinkModal select').forEach(e=>e.disabled=true);
  try{const payload={memberIds,personId,name,allowReassign:true,requestId:personLinkRequestId};await cloudCrud('people','link',payload,{renderFn:renderMembers,silentError:true});if(!cloudCrudSentinelCheck('people','link',payload))throw Error('回读未确认角色归属，请保留表单重试');memberClearSelection();personLinkSnapshot=personLinkForm();closeModal('personLinkModal');showToast('团员角色关系已保存','success');}
  catch(e){error.textContent=e.message;}finally{personLinkBusy=false;document.getElementById('personLinkSave').disabled=false;document.querySelectorAll('#personLinkModal input,#personLinkModal select').forEach(e=>e.disabled=false);}
}
async function personEnsure(){
  if(personAttendanceBusy)return;if(personAttendanceForm()!==personAttendanceSnapshot){showToast('请先保存本场正在编辑的考勤，再建立新团员','warning');return;}personAttendanceBusy=true;
  try{await cloudCrud('people','ensure',{}, {renderFn:()=>{const a=appData.activities.find(a=>a.id===currentActivityId);if(a)renderAttendanceMembers(a);},silentError:true});}
  catch(e){showToast(e.message,'error');}finally{personAttendanceBusy=false;}
}
function renderPersonAttendance(activity){
  const container=document.getElementById('attendanceMembersList');
  if(!appData.peopleReady){container.innerHTML=`<p role="alert">${personEsc(appData.peopleError||'团员功能尚未就绪，请完成数据库更新')}</p>`;return;}
  const missing=appData.members.filter(m=>!m.person_id&&!isDepartedStatus(m.status));
  const saved=activity.person_attendees||[];
  const people=saved.length?saved.map(a=>({id:a.person_id,name:a.person_name})): (appData.people||[]).filter(p=>p.status==='active'&&personChildren(p.id).length);
  const disabled=activity.status==='cancelled'||!CloudSync.canEdit();
  container.innerHTML=`<p>按团员记录：一人一条考勤，换角色不重复计数。</p>${missing.length?`<p>${missing.length} 个角色尚未关联团员。可先为各角色建立独立团员，再到成员管理关联主小号。</p><button type="button" class="btn btn-secondary edit-only" onclick="personEnsure()">建立未关联团员</button>`:''}`+people.map(p=>{
    const a=activity.person_attendees?.find(a=>a.person_id===p.id),status=a?.status||'缺席';
    const children=personChildren(p.id),known=new Set(children.map(m=>m.id));
    const historic=(a?.characters||[]).filter(c=>!known.has(c.id));
    return `<div class="attend-member-row person-attendance-row"><input class="attend-pick-checkbox" type="checkbox" data-member="${p.id}" onchange="attPickToggle('${p.id}',this.checked)" ${disabled?'disabled':''}><input class="attend-checkbox" type="checkbox" data-member="${p.id}" onchange="toggleAttendStatus(this,'${p.id}')" ${['出席','迟到','替补'].includes(status)?'checked':''} ${disabled?'disabled':''}><div class="attend-name"><strong>${personEsc(p.name)}</strong><details><summary>参战角色（${a?.characters?.length||0}）</summary>${children.map(m=>`<label><input class="person-character" data-person="${p.id}" value="${m.id}" type="checkbox" ${a?.characters?.some(c=>c.id===m.id)?'checked':''} ${disabled?'disabled':''} onchange="personCharacterChanged('${p.id}',this.checked)"><span class="class-${classMap[m.class]||''}">${personEsc(memberDisplayName(m))}</span></label>`).join('')}${historic.map(c=>`<small>历史参战：${personEsc(c.name)} · ${personEsc(c.server)}（关系已变化，保留快照）</small>`).join('')}</details></div><select class="attend-status-select" data-member="${p.id}" ${disabled?'disabled':''} onchange="updateAttendCheckbox(this)">${['出席','缺席','迟到','替补','请假'].map(s=>`<option ${s===status?'selected':''}>${s}</option>`).join('')}</select></div>`;
  }).join('');
  const candidates=(appData.people||[]).filter(p=>p.status==='active'&&personChildren(p.id).length&&!people.some(existing=>existing.id===p.id));
  if(saved.length&&candidates.length&&!disabled)container.insertAdjacentHTML('beforeend',`<div class="person-attendance-add"><label>补入本场团员 <select id="personAttendanceAdd" class="form-select"><option value="">请选择漏登或临时加入的团员</option>${candidates.map(p=>`<option value="${p.id}">${personEsc(p.name)}</option>`).join('')}</select></label><button type="button" class="btn btn-secondary" onclick="personAttendanceAdd()">加入本场名单</button><small>仅保存本场考勤后生效，不改变其他历史活动。</small></div>`);
  attPickedIds.clear();attUpdatePickBar();updateAttendanceStatsLine();personAttendanceSnapshot=personAttendanceForm();
}
function personAttendanceAdd(){
  const id=document.getElementById('personAttendanceAdd')?.value,activity=appData.activities.find(a=>a.id===currentActivityId),person=(appData.people||[]).find(p=>p.id===id);if(!person||!activity)return;
  const baseline=personAttendanceSnapshot,rows=[...document.querySelectorAll('#attendanceMembersList .attend-status-select')].map(el=>{
    const old=activity.person_attendees?.find(a=>a.person_id===el.dataset.member),selected=[...document.querySelectorAll(`.person-character[data-person="${el.dataset.member}"]:checked`)].map(c=>appData.members.find(m=>m.id===c.value)).filter(Boolean);
    return {person_id:el.dataset.member,person_name:old?.person_name||(appData.people||[]).find(p=>p.id===el.dataset.member)?.name,status:el.value,characters:selected.concat((old?.characters||[]).filter(c=>!personChildren(el.dataset.member).some(m=>m.id===c.id)))};
  });rows.push({person_id:id,person_name:person.name,status:'缺席',characters:[]});renderPersonAttendance({...activity,person_attendees:rows});personAttendanceSnapshot=baseline;
}
function personCharacterChanged(id,checked){if(checked){const select=document.querySelector(`.attend-status-select[data-member="${id}"]`);select.value='出席';updateAttendCheckbox(select);}else updateAttendanceStatsLine();}
function personSyncSelections(){
  for(const row of document.querySelectorAll('.person-attendance-row')){
    const select=row.querySelector('.attend-status-select'),present=['出席','迟到','替补'].includes(select.value);
    if(!present)row.querySelectorAll('.person-character').forEach(c=>c.checked=false);
    const activity=appData.activities.find(a=>a.id===currentActivityId),old=activity?.person_attendees?.find(a=>a.person_id===select.dataset.member);
    const historical=present?(old?.characters||[]).filter(c=>!personChildren(select.dataset.member).some(m=>m.id===c.id)).length:0;
    row.querySelector('summary').textContent=`参战角色（${row.querySelectorAll('.person-character:checked').length+historical}）`;
  }
}
async function savePersonAttendance(activity){
  if(personAttendanceBusy||!CloudSync.canEdit())return;
  const rows=[...document.querySelectorAll('#attendanceMembersList .attend-status-select')].map(el=>({person_id:el.dataset.member,status:el.value,character_ids:['出席','迟到','替补'].includes(el.value)?[...new Set([...document.querySelectorAll(`.person-character[data-person="${el.dataset.member}"]:checked`)].map(c=>c.value).concat((activity.person_attendees?.find(a=>a.person_id===el.dataset.member)?.characters||[]).filter(c=>!personChildren(el.dataset.member).some(m=>m.id===c.id)).map(c=>c.id)))]:[]}));
  personAttendanceBusy=true;const button=document.getElementById('attendanceSaveBtn');button.disabled=true;button.textContent='保存中…';
  try{const payload={activityId:activity.id,rows};await cloudCrud('personAttendance','save',payload,{renderFn:renderAttendance,silentError:true});if(!cloudCrudSentinelCheck('personAttendance','save',payload))throw Error('回读未确认考勤，请保留表单重试');closeModal('attendanceDetailModal');if(window.WBTrack)WBTrack.event('attendance_save',{marked:rows.length});showToast('已按团员保存考勤','success');}
  catch(e){showToast(e.message,'error');}finally{personAttendanceBusy=false;button.disabled=false;button.textContent='保存考勤';}
}
async function personWclSave(activity,rows,replacement){
  await cloudCrud('people','ensure',{}, {renderFn:()=>{},silentError:true});
  const grouped=new Map();for(const row of rows){
    const m=appData.members.find(m=>m.id===row.memberId);if(!m?.person_id)continue;
    const personId=personIdForActivity(activity,m),old=activity.person_attendees?.find(a=>a.person_id===personId);
    if(old&&(replacement||old.status!=='缺席')&&!(old.source==='wcl'&&old.status==='出席'&&!replacement))continue;
    if(!grouped.has(personId))grouped.set(personId,{person_id:personId,status:'出席',character_ids:(old?.characters||[]).map(c=>c.id)});
    if(!grouped.get(personId).character_ids.includes(m.id))grouped.get(personId).character_ids.push(m.id);
  }
  const attended=grouped.size;
  if(!(activity.person_attendees||[]).length)for(const person of (appData.people||[]).filter(p=>p.status==='active'&&personChildren(p.id).length))if(!grouped.has(person.id))grouped.set(person.id,{person_id:person.id,status:'缺席',character_ids:[]});
  if(grouped.size)await cloudCrud('personAttendance','save',{activityId:activity.id,rows:[...grouped.values()],source:'wcl'},{renderFn:()=>{},silentError:true});
  return attended;
}
