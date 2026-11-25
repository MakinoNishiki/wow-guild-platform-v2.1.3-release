/* Approved guild identities. Server controls every grant; this page keeps a scoped, in-memory read model. */
(() => {
  'use strict';
  const pieces = {king:'王 · 国王', queen:'后 · 王后', rook:'车 · 战车', bishop:'象 · 主教', knight:'马 · 骑士', pawn:'兵 · 兵卒'};
  const categories = [
    ['会籍与招募', {'edit-card':'编辑内部招募卡', settings:'编辑公会资料与分配制度', remove:'移出公会成员'}],
    ['战报与录像', {video:'编辑单次击杀录像', publish:'发布战报', withdraw:'撤回已发布战报'}],
    ['拾取与分配', {submit:'提交拾取记录', review:'核对拾取与交易证据', allocate:'确认装备最终分配'}],
    ['角色与考勤', {wcl:'绑定或解绑公会 WCL', 'find-wcl':'查找新的 WCL 报告', 'claim-mode':'设置角色认领方式', claim:'认领本人角色', 'assign-claim':'维护名册与认领申请', attendance:'维护活动和考勤'}],
    ['心愿与统计', {wishlist:'维护团队心愿单', stats:'查看团队统计'}]
  ];
  const permissions = categories.flatMap(([,actions]) => Object.keys(actions));
  const builtins = ['owner','editor','viewer'];
  const get = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  function context() {
    const guild = window.CloudSync?.getCurrentGuild()?.id;
    const user = window.CloudSync?.getCachedUser()?.id;
    return guild && user ? {guild,user} : null;
  }
  const same = ctx => !!ctx && ctx.guild === context()?.guild && ctx.user === context()?.user;
  let snapshot = null, reading = null, sequence = 0;
  let members = [], membersContext = null, listSequence = 0;
  let editor = null, saving = false;
  const ready = () => same(snapshot?.ctx);
  const roleOf = key => ready() ? snapshot.roles.get(key) : null;
  function can(id) {
    if (!ready()) return false;
    if (['membership','configure'].includes(id)) return snapshot.ownRole === 'owner';
    if (['contact','read-report'].includes(id)) return true;
    return roleOf(snapshot.ownRole)?.permissions?.[id] === true;
  }
  function icon(piece) {
    return Object.hasOwn(pieces,piece) ? '<img class="gr-piece" width="20" height="20" src="assets/icons/guild-roles/'+piece+'.svg" alt="" title="'+pieces[piece]+'">' : '';
  }
  function badge(role) {
    return role ? '<span class="gr-badge">'+icon(role.piece)+'<span>'+esc(role.name)+'</span></span>' : '—';
  }
  const ownRoleInfo = () => ready() ? roleOf(snapshot.ownRole) : null;
  function badgeFor(user) {
    return badge(ready() && roleOf(snapshot.accounts.get(user)));
  }
  function paintIdentities() {
    document.querySelectorAll('[data-gr-user]').forEach(el => { el.innerHTML = badgeFor(el.dataset.grUser); });
  }
  async function request(ctx, body) {
    if (!same(ctx)) throw new Error('当前公会已切换');
    const token = await CloudSync.getAccessToken();
    if (!token || !same(ctx)) throw new Error('请重新进入当前公会');
    const url = body ? '/api/guild-roles' : '/api/guild-roles?guildId='+encodeURIComponent(ctx.guild);
    const response = await fetch(url, {
      method:body?'POST':'GET', cache:'no-store',
      headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    const data = await response.json().catch(() => ({}));
    if (!same(ctx)) throw new Error('当前公会已切换');
    if (!response.ok) {
      const e = new Error(data.message || data.error || '暂时无法读取公会权限');
      e.status = response.status;
      throw e;
    }
    return data;
  }
  async function load(force=false, afterWrite=false) {
    const ctx = context();
    if (!ctx) throw new Error('请先进入公会');
    // A page refresh and a tab-focus refresh can use the same in-flight read.
    // A confirmed write needs a read that started after its commit.
    if (!afterWrite && reading && same(reading.ctx)) return reading.promise;
    if (!force && ready()) return snapshot;
    const seq = ++sequence;
    const promise = request(ctx).then(data => {
      if (!same(ctx)) throw new Error('当前公会已切换');
      if (seq !== sequence) {
        if (reading && same(reading.ctx)) return reading.promise;
        if (ready()) return snapshot;
        throw new Error('权限正在重新读取');
      }
      if (!Array.isArray(data.roles) || !Array.isArray(data.assignments) ||
          !data.roles.some(r => r.key === data.ownRole)) throw new Error('公会角色资料不完整，请刷新');
      const signature=JSON.stringify([data.ownRole,data.roles.map(r=>[r.key,r.revision]).sort(),data.assignments.map(a=>[a.user_id,a.key]).sort()]);
      const changed=!ready() || snapshot.signature!==signature;
      snapshot = {ctx,signature,ownRole:data.ownRole,roles:new Map(data.roles.map(r=>[r.key,r])),
        accounts:new Map(data.assignments.map(a=>[a.user_id,a.key]))};
      paintIdentities();
      if(changed) {
        if (same(membersContext)) renderMemberList();
        window.dispatchEvent(new Event('guild-roles-ready'));
      }
      return snapshot;
    }).catch(e => {
      if (seq === sequence) { const changed=ready(); snapshot=null; paintIdentities();setManagerButton();if(changed)window.dispatchEvent(new Event('guild-roles-ready')); }
      throw e;
    }).finally(() => { if(seq === sequence) reading=null; });
    reading = {ctx,promise};
    return promise;
  }
  async function write(operation, payload) {
    if (!same(payload.ctx) || !['assign','save'].includes(operation)) throw new Error('请重新进入当前公会');
    const {ctx,...values}=payload;
    await request(ctx,{...values,action:operation,guildId:ctx.guild});
  }
  async function readBack(payload) {
    if (!same(payload.ctx)) throw new Error('公会已切换，请回到原公会查看保存结果');
    const result=await load(true,true);
    if (payload.membershipId) {
      const member=members.find(m=>m.id===payload.membershipId);
      if (!member || result.accounts.get(member.user_id)!==payload.key) throw new Error('分配后回读未确认，请刷新核对');
    } else {
      const role=payload.key ? result.roles.get(payload.key) : [...result.roles.values()].find(r=>r.name===payload.name);
      if (!role || role.name!==payload.name || role.piece!==payload.piece ||
          permissions.some(id=>!!role.permissions[id]!==!!payload.permissions[id])) throw new Error('角色已提交，回读结果有变化，请刷新核对');
      return role;
    }
    return result;
  }
  function setManagerButton() {
    const button=get('guildRoleManager');
    button.hidden=!ready();
    button.textContent=can('configure') ? '管理角色与权限' : '查看角色权限';
  }
  function renderMemberList() {
    const container=get('guildMembersList');
    if (!same(membersContext) || !ready()) return;
    container.innerHTML=members.map(m=>{
      const key=snapshot.accounts.get(m.user_id);
      const canAssign=can('membership') && key && key!=='owner' && m.user_id!==context().user;
      const canRemove=can('remove') && key && key!=='owner' && m.user_id!==context().user;
      return '<div class="guild-member-item"><div class="guild-member-name">'+esc(m.display_name||'未设置昵称')+(m.user_id===context().user?' (我)':'')+'</div>'+
        '<div class="guild-member-actions">'+badgeFor(m.user_id)+
        (canAssign ? '<button type="button" class="btn btn-sm" data-gr-assign="'+esc(m.id)+'">分配角色</button>' : '')+
        (canRemove ? '<button type="button" data-gr-remove="'+esc(m.id)+'">移除</button>' : '')+'</div></div>';
    }).join('') || '暂无成员';
    setManagerButton();
  }
  async function refreshMembers() {
    const ctx=context(), seq=++listSequence;
    const container=get('guildMembersList');
    get('guildRoleManager').hidden=true;
    container.textContent='正在读取成员…';
    membersContext=null;
    members=[];
    if (!ctx) {container.textContent='请先进入公会';return;}
    try {
      const [rows]=await Promise.all([CloudSync.getGuildMembers(),load(true)]);
      if (seq!==listSequence || !same(ctx)) return;
      members=rows; membersContext=ctx;
      renderMemberList();
    } catch(e) {
      if (seq===listSequence && same(ctx)) container.textContent='读取成员权限失败：'+e.message+'。可点击刷新重试。';
    }
  }
  function isEditor() { return can('configure') && same(editor?.ctx); }
  function currentForm() {
    const form=get('grmForm');
    if (!form) return null;
    const checked=form.querySelector('[name=grmPiece]:checked');
    return {name:form.elements.grmName.value.trim(),piece:checked?.value || editor.original.piece,
      permissions:Object.fromEntries(permissions.map(id => [id,form.elements.namedItem('grant-'+id).checked]))};
  }
  function dirty() {
    if (editor?.assignMember && same(editor.ctx)) return editor.key!==editor.expectedRole;
    return same(editor?.ctx) && editor.baseline != null && JSON.stringify(currentForm())!==editor.baseline;
  }
  function status(message, error=false) {
    get('grmStatus').textContent=message;
    get('grmStatus').classList.toggle('gr-error',error);
  }
  const modalOpen=()=>get('guildRolesModal').classList.contains('show');
  function close() {editor=null;status('');}
  function changeAllowed() {return !saving && (!dirty() || confirm('有未保存的角色修改，确定放弃吗？'));}
  function open(key, assignMember) {
    if (!ready() || !same(membersContext)) return;
    if (modalOpen() && !changeAllowed()) return;
    editor={ctx:context(),key,createKey:key?null:'custom-'+crypto.randomUUID(),newRole:!key,assignMember:assignMember||null,expectedRole:assignMember?key:null,baseline:null};
    if (!modalOpen()) openModal('guildRolesModal');
    showForm();
  }
  function permissionDetails(role, editable) {
    const groups=categories.map(([group,actions])=>'<fieldset class="gr-grants"><legend>'+group+'</legend>'+Object.entries(actions).map(([id,label])=>'<label><span>'+label+'</span><input type="checkbox" role="switch" name="grant-'+id+'"'+(role.permissions[id]?' checked':'')+(editable?'':' disabled')+'></label>').join('')+'</fieldset>').join('');
    return groups+'<details class="gr-fixed"><summary>固定权限</summary><p>本会成员可查看内部招募卡与联系方式。已发布战报对访客开放。</p><p>创建者可管理角色权限，并为成员分配角色。</p></details>';
  }
  function assignmentPreview(role) {
    return '<h4>'+badge(role)+' · 权限预览</h4>'+permissionDetails(role,false);
  }
  function selectAssignment(key) {
    const role=roleOf(key);
    if (!editor?.assignMember || !isEditor() || saving || !role || key==='owner' || key===editor.key) return;
    editor.key=key;
    get('grmAssignedRole').value=key;
    get('grmBody').querySelectorAll('[data-gr-role]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.grRole===key)));
    get('grmPreview').innerHTML=assignmentPreview(role);
    get('grmSave').disabled=!dirty();
  }
  function showForm() {
    if (!same(editor?.ctx) || !ready()) return;
    const existing=roleOf(editor.key);
    const r=editor.original=existing || {key:'',name:'',piece:'rook',permissions:{},revision:0};
    const edit=isEditor(), disabled=edit?'':' disabled', assign=editor.assignMember;
    const roles=[...snapshot.roles.values()].filter(role=>!assign || role.key!=='owner');
    const nav=roles.map(role=>'<button type="button" data-gr-role="'+esc(role.key)+'" aria-pressed="'+(r.key===role.key)+'">'+badge(role)+'</button>').join('');
    let body;
    if (assign) {
      const name=assign.display_name||'未设置昵称';
      body='<label class="gr-field">为「'+esc(name)+'」分配角色<select id="grmAssignedRole">'+roles.map(item=>'<option value="'+esc(item.key)+'"'+(item.key===r.key?' selected':'')+'>'+esc(item.name)+'</option>').join('')+'</select></label><section id="grmPreview">'+assignmentPreview(r)+'</section>';
    } else {
      const choosePiece=edit && !builtins.includes(r.key);
      const picker=choosePiece ? '<fieldset class="gr-pieces"><legend>身份徽记</legend>'+Object.entries(pieces).map(([piece,label])=>'<label><input type="radio" name="grmPiece" value="'+piece+'"'+(r.piece===piece?' checked':'')+'><span>'+icon(piece)+label+'</span></label>').join('')+'</fieldset>' : '';
      body='<form id="grmForm"><h4>'+ (editor.newRole?'创建角色':badge(r))+'</h4><label class="gr-field">角色名称<input name="grmName" autocomplete="off" maxlength="32" value="'+esc(r.name)+'"'+disabled+' required></label>'+picker+permissionDetails(r,edit)+'</form>';
      if (edit && existing && r.key!=='owner') {
        const options=members.filter(m=>m.user_id!==context().user && snapshot.accounts.has(m.user_id) && snapshot.accounts.get(m.user_id)!=='owner');
        if(options.length) body+='<div class="gr-assign"><label class="gr-field">成员账号<select id="grmMemberChoice">'+options.map(m=>'<option value="'+esc(m.id)+'">'+esc(m.display_name||'未设置昵称')+'</option>').join('')+'</select></label><button class="btn btn-secondary" id="grmAssignSelected" type="button">分配给成员</button></div>';
      }
    }
    get('grmTitle').textContent=assign?'分配成员角色':'公会角色与权限';
    get('grmBody').innerHTML='<div class="gr-layout"><aside class="gr-nav" aria-label="公会角色">'+nav+(edit && !assign?'<button type="button" id="grmNew">＋ 创建角色</button>':'')+'</aside><section class="gr-editor">'+body+'</section></div>';
    get('grmSave').hidden=!edit;
    get('grmSave').disabled=!!assign && !dirty();
    get('grmSave').textContent=assign?'保存分配':editor.newRole?'创建角色':'保存修改';
    editor.baseline=JSON.stringify(currentForm());
    get('grmBody').scrollTop=0;
    status('');
    if(editor.newRole)get('grmForm').elements.grmName.focus();
  }
  async function save(action, values) {
    if (saving || !isEditor()) return;
    const ctx=editor.ctx;
    saving=true;
    get('grmBody').inert=true;
    get('grmSave').disabled=true;
    status('正在保存…');
    try {
      const {row}=await cloudCrud('guildRoles',action,{ctx,...values},{silentError:true});
      if (!same(ctx) || !same(editor?.ctx)) return;
      renderMemberList();
      if(action==='assign') { closeModal('guildRolesModal');showToast('已分配角色','success'); }
      else {editor.key=row.key;editor.newRole=false;showForm();status('角色已保存');}
    } catch(e) {
      if (same(ctx) && same(editor?.ctx)) {
        status(e.message || '保存失败，请重试',true);
        if (e.status===409 || e.status===403) {
          // Preserve the unsaved fields; reopen with a fresh revision after the author acknowledges the conflict.
          const refresh=document.createElement('button');
          refresh.type='button';refresh.className='btn btn-sm';refresh.textContent='重新读取';
          refresh.onclick=async()=>{
            if (!changeAllowed()) return;
            const targetId=editor.assignMember?.id;
            closeModal('guildRolesModal');await refreshMembers();
            if(!same(ctx) || !ready()) return;
            if (!targetId) { open(snapshot.ownRole); return; }
            const target=members.find(member=>member.id===targetId);
            const role=target && snapshot.accounts.get(target.user_id);
            if (can('membership') && role && role!=='owner') open(role,target);
          };
          get('grmStatus').append(' ',refresh);
        }
      }
    } finally {
      saving=false;
      get('grmBody').inert=false;
      get('grmSave').disabled=!!editor?.assignMember && !dirty();
    }
  }
  async function submit() {
    if (!isEditor() || saving) return;
    if (editor.assignMember) {
      if (dirty()) return save('assign',{membershipId:editor.assignMember.id,key:editor.key,expectedRole:editor.expectedRole});
      return;
    }
    const values=currentForm();
    if (!values) return;
    if (!values.name || [...values.name].length>16) {status('角色名称需要 1 至 16 个字',true);return;}
    if ([...snapshot.roles.values()].some(r=>r.key!==editor.key && r.name.normalize('NFKC').toLowerCase()===values.name.normalize('NFKC').toLowerCase())) {
      status('公会内已有同名角色',true);return;
    }
    await save('save',{key:editor.key || editor.createKey,...values,expectedRevision:editor.original.revision});
  }
  get('guildRoleManager').onclick=()=>open(ready()?snapshot.ownRole:null);
  get('guildMembersList').addEventListener('click',event=>{
    if(!same(membersContext) || !ready())return;
    const button=event.target.closest('[data-gr-assign],[data-gr-remove]');
    const m=members.find(row=>row.id===(button?.dataset.grAssign||button?.dataset.grRemove));
    if(!m)return;
    if (button.dataset.grAssign && can('membership'))open(snapshot.accounts.get(m.user_id),m);
    if (button.dataset.grRemove && can('remove'))handleRemoveMember(m.id,m.display_name||'未设置昵称');
  });
  get('grmBody').addEventListener('click',event=>{
    const button=event.target.closest('button');
    if (!button || !same(editor?.ctx)) return;
    if (button.hasAttribute('data-gr-role')) {
      if (editor.assignMember) selectAssignment(button.dataset.grRole);
      else open(button.dataset.grRole);
    }
    else if (button.id==='grmNew' && isEditor()) open(null);
    else if (button.id==='grmAssignSelected' && isEditor() && !dirty()) {
      const m=members.find(row=>row.id===get('grmMemberChoice').value);
      if(m)save('assign',{membershipId:m.id,key:editor.key,expectedRole:snapshot.accounts.get(m.user_id)});
    } else if(button.id==='grmAssignSelected') status('先保存角色修改，再分配给成员',true);
  });
  get('grmBody').addEventListener('submit',e=>{e.preventDefault();submit();});
  get('grmBody').addEventListener('change',event=>{
    if (event.target.id==='grmAssignedRole') selectAssignment(event.target.value);
  });
  get('grmBody').addEventListener('input',()=>{if(get('grmStatus').classList.contains('gr-error') && !get('grmStatus').querySelector('button'))status('');});
  get('grmSave').onclick=submit;
  function scopeChanged() {
    if (editor && !same(editor.ctx)) closeModal('guildRolesModal');
    if (!same(membersContext)) { members=[]; membersContext=null; get('guildMembersList').replaceChildren(); setManagerButton(); }
    if (snapshot && !same(snapshot.ctx)) { snapshot=null; paintIdentities(); }
  }
  window.GuildRoles={can,ownRoleInfo,scopeChanged,ready,load,badgeFor,refreshMembers,write,readBack,close,dirty,isSaving:()=>saving};
})();
