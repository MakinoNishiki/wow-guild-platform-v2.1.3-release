'use strict';

const roleTypes = {
  owner: { tier: '创建者', name: '会长', piece: 'king' },
  editor: { tier: '管理者', name: '公会编辑', piece: 'knight' },
  viewer: { tier: '普通用户', name: '团员', piece: 'pawn' }
};
const baseKeys = Object.keys(roleTypes);
const managers = ['owner', 'editor'];
const creator = ['owner'];
const categories = [
  ['key', '重点对照', 'guild-banner'], ['guild', '会籍与招募', 'members'],
  ['loot', '拾取与分配', 'loot'], ['battle', '战报与录像', 'reports'],
  ['roster', '角色与考勤', 'attendance'], ['all', '全部操作', 'dashboard']
];
// Fixed rules govern authorship, membership and publication independently of the business switches.
const actions = [
  {id:'edit-card', category:'guild', key:true, label:'编辑内部招募卡', grants:managers,
    detail:'可以保存本会的招募需求、活动时间和联系方式。本机新默认向公会编辑开放，线上当前由会长保存。'},
  {id:'wcl', category:'roster', key:true, label:'绑定或解绑公会 WCL', grants:creator,
    detail:'可以更换或移除本会绑定的 WCL 公会。本机新默认仅向会长开放，线上当前也允许公会编辑操作。查找新报告和考勤各有独立开关。'},
  {id:'video', category:'battle', key:true, label:'编辑单次击杀录像', grants:managers,
    detail:'可以给某次击杀添加或更新录像。录像关联原战斗，随战报发布后才对外展示。'},
  {id:'publish', category:'battle', key:true, label:'发布战报', grants:managers,
    detail:'可以核对击杀证据并发布本会的战报，访客随后可通过链接阅读。'},
  {id:'withdraw', category:'battle', label:'撤回已发布战报', grants:managers,
    detail:'可以撤回本会已经发布的战报，公开链接上的战报和随附录像一并收回。'},
  {id:'submit', category:'loot', key:true, label:'提交拾取记录', grants:baseKeys,
    detail:'可以提交自己的观察记录，保留来源以供核对。最终装备去向要单独确认。'},
  {id:'review', category:'loot', label:'核对拾取与交易证据', grants:managers,
    detail:'可以查看交易证据，确认、忽略或合并本会拾取记录。'},
  {id:'allocate', category:'loot', key:true, label:'确认装备最终分配', grants:managers,
    detail:'可以登记装备去向。登记为已分配时需选定本会在队角色，拾取人和交易对象可供核对。'},
  {id:'contact', category:'guild', key:true, label:'查看内部招募卡与联系方式', grants:baseKeys, fixed:'随会籍',
    detail:'本会全体成员都能查看。游客、其他公会成员和已离会账号无权查看本会内部资料。'},
  {id:'read-report', category:'battle', label:'阅读已发布战报', grants:baseKeys, fixed:'已公开',
    detail:'已经发布且击杀证据有效的战报对访客开放。草稿和已撤回战报仅在相应的内部入口处理。'},
  {id:'settings', category:'guild', label:'编辑公会资料与分配制度', grants:creator,
    detail:'可以维护本会介绍、分配制度与规则说明。'},
  {id:'membership', category:'guild', label:'分配成员的公会角色', grants:creator, fixed:'创建者专属',
    detail:'创建者可将其他成员账号分配到管理者、普通用户或自建角色。同一账号认领的所有角色共用该身份。'},
  {id:'remove', category:'guild', label:'移出公会成员', grants:creator,
    detail:'可解除其他成员在本会的会籍，被移出者随即失去本会内部资料的访问权。创建者身份由公会所有权流程管理。'},
  {id:'configure', category:'guild', label:'角色命名与权限配置', grants:creator, fixed:'创建者专属',
    detail:'只有创建者可以新建角色、修改角色名称和业务权限。改名保留现有成员分配及公会所有权。'},
  {id:'claim-mode', category:'roster', label:'设置公会角色认领方式', grants:creator,
    detail:'可以选择自由认领、申请审核或管理者指定。'},
  {id:'claim', category:'roster', label:'认领本人的团队角色', grants:baseKeys,
    detail:'开启后仍遵守本会认领方式。自由模式可自行认领，审核模式需提交申请，指定模式由获授权者分配。解绑本人的已有认领沿用个人流程。'},
  {id:'assign-claim', category:'roster', label:'管理团队角色与认领申请', grants:managers,
    detail:'可以维护名册、指定认领人或审核申请。认领游戏角色与账号的公会身份分别管理。'},
  {id:'attendance', category:'roster', label:'维护活动和考勤', grants:managers,
    detail:'可以维护本会活动与出勤，或从 WCL 同步活动考勤。'},
  {id:'find-wcl', category:'roster', label:'查找新的 WCL 报告', grants:managers,
    detail:'可以从已绑定的公会日志源查找新报告。该操作保留原来的公会绑定。'},
  {id:'wishlist', category:'loot', label:'维护团队心愿单', grants:managers,
    detail:'可以新增、编辑或删除团队心愿。认领某个角色不会自动授予维护权限。'},
  {id:'stats', category:'roster', label:'查看团队统计', grants:baseKeys,
    detail:'可以通过本会仪表盘和报表查看活动出勤和排行。'}
];
const accounts = {
  keeper: {name:'守夜人', role:'owner'}, wanderer: {name:'暮色行者', role:'editor'}, hiker: {name:'山间来客', role:'viewer'},
  sailor: {name:'夜航', role:'viewer'}
};
const sampleMembers = [
  ['黎明守望', 'keeper'], ['渡鸦', 'wanderer'], ['山脊', 'hiker'], ['晨露', 'hiker'], ['林间微光', null], ['潮声', 'sailor']
];
const assignableAccounts = Object.keys(accounts).filter(id => accounts[id].role !== 'owner');
const pieceNames = {king:'王 · 国王', queen:'后 · 王后', rook:'车 · 战车', bishop:'象 · 主教', knight:'马 · 骑士', pawn:'兵 · 兵卒'};
const storageKey = 'wb.guild-permissions.review.v2';
const el = id => document.getElementById(id);
const initialNames = Object.fromEntries(baseKeys.map(key => [key, roleTypes[key].name]));
const isName = value => typeof value === 'string' && !!value.trim() && Array.from(value.trim()).length <= 16;
const normalized = value => value.trim().normalize('NFKC').toLowerCase();
function validNames(names) {
  const values = Object.values(names);
  return values.every(isName) && new Set(values.map(normalized)).size === values.length;
}
function defaultConfig() { return { names:{...initialNames}, overrides:{}, assignments:{}, pieces:{} }; }
function loadConfig() {
  const next = defaultConfig();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (!saved) return next;
    if (saved.names && baseKeys.every(key => Object.hasOwn(saved.names,key))) {
      const entries = Object.entries(saved.names).filter(([key]) => baseKeys.includes(key) || /^custom-[1-9]\d*$/.test(key));
      const names = Object.fromEntries(entries);
      if (validNames(names)) next.names = Object.fromEntries(entries.map(([key,name]) => [key,name.trim()]));
    }
    for (const key of Object.keys(next.names)) {
      const piece = saved.pieces?.[key];
      if (!baseKeys.includes(key) && Object.hasOwn(pieceNames,piece)) next.pieces[key] = piece;
    }
    for (const action of actions.filter(item => !item.fixed)) {
      for (const key of Object.keys(next.names)) {
        const id = action.id + '/' + key;
        if (typeof saved.overrides?.[id] === 'boolean') next.overrides[id] = saved.overrides[id];
      }
    }
    for (const account of assignableAccounts) {
      const key = saved.assignments?.[account];
      if (key !== 'owner' && Object.hasOwn(next.names,key)) next.assignments[account] = key;
    }
  } catch { /* A file preview or browser privacy setting may disable storage. */ }
  return next;
}
let config = loadConfig();
const roleKeys = () => Object.keys(config.names);
const tier = key => roleTypes[key]?.tier || '自建角色';
const accountRole = account => config.assignments[account] || accounts[account].role;
let actor = 'owner';
const viewFromURL = () => location.hash === '#members' ? 'members' : 'permissions';
let view = viewFromURL();
let category = 'key';
let role = 'all';
let expanded = new Set();
let feedbackTimer;
const canManage = () => actor === 'owner';
function announce(message) {
  clearTimeout(feedbackTimer);
  el('feedback').textContent = message;
  feedbackTimer = setTimeout(() => { el('feedback').textContent = ''; }, 4300);
}
function persist(message) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(config));
    announce(message);
  } catch { announce(message + '。浏览器未允许保存，刷新后会恢复默认。'); }
}
function text(value) {
  return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[ch]));
}
const rolePiece = key => roleTypes[key]?.piece || config.pieces[key] || 'rook';
function pieceIcon(piece) {
  return '<svg class="role-icon" data-piece="'+piece+'" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#chess-'+piece+'"></use></svg>';
}
function piecePicker(name, selected, legend) {
  const options = Object.entries(pieceNames).map(([piece,label])=>
    '<label class="piece-choice"><input type="radio" name="'+name+'" value="'+piece+'"'+(piece===selected?' checked':'')+
    '><span>'+pieceIcon(piece)+'<span>'+label+'</span></span></label>').join('');
  return '<fieldset class="piece-picker"><legend>'+text(legend)+'</legend><div>'+options+'</div></fieldset>';
}
function roleLabel(key) {
  const piece = rolePiece(key);
  return '<span class="role-mark" title="'+pieceNames[piece]+'">'+pieceIcon(piece)+'</span><span>'+text(config.names[key])+'</span>';
}
function inCategory(action, id) {
  return id === 'all' || (id === 'key' && action.key) || action.category === id;
}
function allowed(action, key) {
  if (action.fixed) return action.grants === baseKeys || action.grants.includes(key);
  return config.overrides[action.id+'/'+key] ?? action.grants.includes(key);
}
function cell(action, key) {
  const active = allowed(action,key);
  if (action.fixed) {
    const content = active ? action.fixed : '无权限';
    return '<td><span class="fixed-rule">'+text(content)+'</span></td>';
  }
  const label = text(config.names[key]+' · '+action.label);
  return '<td><button class="permission-switch" type="button" role="switch" aria-label="'+label+
    '" aria-checked="'+active+'" data-for="'+key+'" data-permission="'+action.id+'"'+
    (canManage()?'':' disabled')+'><span class="track" aria-hidden="true"><span></span></span>'+
    '<span class="switch-word">'+(active?'允许':'禁止')+'</span></button></td>';
}
function renderMatrix() {
  const single = role !== 'all';
  const activeRoles = single ? [role] : roleKeys();
  const items = actions.filter(action => inCategory(action,category) &&
    (!single || !el('allowed').checked || allowed(action,role)));
  el('sectionTitle').textContent = categories.find(item => item[0] === category)[1];
  el('count').textContent = items.length+' 项操作';
  el('allowedLabel').hidden = !single;
  el('assignRole').hidden = !canManage() || !single || role === 'owner';
  el('empty').hidden = items.length > 0;
  const table = el('head').closest('table');
  table.classList.toggle('single',single);
  table.classList.toggle('many-roles',activeRoles.length>3);
  table.style.minWidth = activeRoles.length > 3 ? (275 + activeRoles.length * 135)+'px' : '';
  document.querySelectorAll('[data-category]').forEach(button => button.setAttribute('aria-pressed',button.dataset.category === category));
  el('roles').innerHTML = ['all',...roleKeys()].map(key => '<button type="button" data-role="'+key+'" aria-pressed="'+(key === role)+'">'+
    (key === 'all'?'全部角色对照':roleLabel(key))+'</button>').join('');
  el('head').innerHTML = '<tr><th scope="col">操作</th>'+activeRoles.map(key =>
    '<th scope="col"><span class="badge">'+roleLabel(key)+'</span><small>'+tier(key)+'</small></th>').join('')+
    (single?'<th scope="col">适用范围</th>':'')+'</tr>';
  el('rows').innerHTML = items.map(action => {
    const open = expanded.has(action.id);
    const name = single ? text(action.label) : '<button type="button" class="row-button" data-action="'+action.id+
      '" aria-expanded="'+open+'" aria-controls="note-'+action.id+'"><span class="chevron" aria-hidden="true"></span>'+text(action.label)+'</button>';
    return '<tr class="action"><th scope="row">'+name+'</th>'+activeRoles.map(key=>cell(action,key)).join('')+
      (single?'<td class="role-note">'+text(action.detail)+'</td>':'')+'</tr>'+
      (single?'':'<tr class="note-row" id="note-'+action.id+'"'+(open?'':' hidden')+'><td colspan="'+(1+activeRoles.length)+'">'+text(action.detail)+'</td></tr>');
  }).join('');
}
function renderMembers() {
  el('memberEditHead').hidden = !canManage();
  el('memberRows').innerHTML = sampleMembers.map(([character,account]) => {
    const key = account && accountRole(account);
    const assignment = assignableAccounts.includes(account)
      ? '<button type="button" class="assign-button" data-account="'+account+'" aria-label="给'+accounts[account].name+'分配角色">分配角色</button>'
      : '<span class="fixed-rule">'+(account?'创建者身份固定':'待认领')+'</span>';
    return '<tr><th scope="row">'+character+'</th><td>'+(account ? accounts[account].name : '尚未认领')+'</td><td>'+(key
      ? '<span class="badge roster-badge '+(baseKeys.includes(key)?key:'custom')+'">'+roleLabel(key)+'</span><small>'+tier(key)+'</small>'
      : '<span class="fixed-rule">—</span>')+'</td>'+(canManage()?'<td>'+assignment+'</td>':'')+'</tr>';
  }).join('');
}
function render() {
  for (const button of document.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed',button.dataset.view===view);
  el('permissionsPanel').hidden = view !== 'permissions';
  el('membersPanel').hidden = view !== 'members';
  el('actor').replaceChildren(...roleKeys().map(key=>new Option(tier(key)+' · '+config.names[key],key)));
  el('actor').value = actor;
  el('rename').disabled = el('restore').disabled = !canManage();
  el('createRole').hidden = !canManage();
  el('manageHint').textContent = canManage() ? '调整会同时作用于该角色下的所有成员。' : '当前为只读视角。仅创建者可修改角色配置。';
  renderMatrix();
  renderMembers();
}
el('categories').innerHTML = categories.map(([id,name,asset])=>'<button type="button" data-category="'+id+
  '"><img src="../../assets/icons/nav/'+asset+'.svg" alt="">'+name+'<small aria-hidden="true">'+
  actions.filter(action=>inCategory(action,id)).length+'</small></button>').join('');
el('categories').addEventListener('click',event=>{
  const button = event.target.closest('[data-category]');
  if (button) { category = button.dataset.category; expanded.clear(); renderMatrix(); }
});
el('roles').addEventListener('click',event=>{
  const button = event.target.closest('[data-role]');
  if (!button) return;
  role = button.dataset.role;
  el('allowed').checked = false;
  renderMatrix();
  el('roles').querySelector('[data-role="'+role+'"]').focus({preventScroll:true});
});
el('allowed').addEventListener('change',renderMatrix);
el('rows').addEventListener('click',event=>{
  const disclosure = event.target.closest('[data-action]');
  if (disclosure) {
    const key = disclosure.dataset.action;
    if (expanded.has(key)) expanded.delete(key);
    else expanded.add(key);
    disclosure.setAttribute('aria-expanded',expanded.has(key));
    el('note-'+key).hidden = !expanded.has(key);
    return;
  }
  const button = event.target.closest('[data-permission]');
  if (!button || !canManage()) return;
  const action = actions.find(item=>item.id===button.dataset.permission);
  const key = button.dataset.for;
  if (!action || action.fixed || !roleKeys().includes(key)) return;
  const next = !allowed(action,key);
  const id = action.id+'/'+key;
  if (next === action.grants.includes(key)) delete config.overrides[id];
  else config.overrides[id] = next;
  persist('已'+(next?'允许':'禁止')+'「'+config.names[key]+'」'+action.label);
  if (role !== 'all' && el('allowed').checked && !next) {
    renderMatrix();
    el('allowed').focus({preventScroll:true});
  } else {
    button.setAttribute('aria-checked',next);
    button.querySelector('.switch-word').textContent = next?'允许':'禁止';
  }
});
el('actor').addEventListener('change',event=>{ actor=event.target.value; render(); });
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{
  location.hash = button.dataset.view;
}));
window.addEventListener('hashchange',()=>{ view = viewFromURL(); render(); });
el('rename').addEventListener('click',()=>{
  if (!canManage()) return;
  el('nameFields').innerHTML = roleKeys().map(key=>{
    const piece = rolePiece(key);
    const field = '<label class="name-field"><span class="badge">'+pieceIcon(piece)+tier(key)+'</span><input name="'+key+
      '" value="'+text(config.names[key])+'" aria-label="'+text(config.names[key])+'的角色名称" required></label>';
    return field + (baseKeys.includes(key) ? '' : piecePicker('piece-'+key,piece,config.names[key]+'的徽记'));
  }).join('');
  el('nameError').textContent='';
  openFormDialog('nameDialog');
});
el('nameFields').addEventListener('input',event=>{
  if (event.target.type === 'text') el('nameError').textContent = '';
});
el('nameForm').addEventListener('submit',event=>{
  event.preventDefault();
  if (!canManage()) return;
  const names = Object.fromEntries(roleKeys().map(key=>[key,event.target.elements.namedItem(key).value.trim()]));
  if (!validNames(names)) {
    el('nameError').textContent='请为每种角色填写不同的名称，每个名称限 1 至 16 个字。';
    return;
  }
  config.names=names;
  for (const key of roleKeys().filter(key=>!baseKeys.includes(key))) {
    const selected = event.target.elements.namedItem('piece-'+key).value;
    if (Object.hasOwn(pieceNames,selected)) config.pieces[key] = selected;
  }
  persist('角色名称与徽记已保存，成员名册已同步');
  el('nameDialog').close();
  render();
});
el('restore').addEventListener('click',()=>{ if (canManage()) el('restoreDialog').showModal(); });
el('restoreConfirm').addEventListener('click',()=>{
  if (!canManage()) return;
  config=defaultConfig();
  role = 'all';
  el('allowed').checked = false;
  persist('角色名称、权限和成员分配已恢复默认配置');
  el('restoreDialog').close();
  render();
});
function openFormDialog(id) {
  const dialog = el(id);
  dialog.dataset.initial = dialogValues(dialog);
  dialog.showModal();
}
function dialogValues(dialog) {
  return JSON.stringify(Array.from(dialog.querySelectorAll('input:not([type=radio]),input[type=radio]:checked,select'),field=>field.value));
}
function closeDialog(dialog) {
  if (!dialog.dataset.initial || dialogValues(dialog) === dialog.dataset.initial || window.confirm('内容未保存，确定放弃吗？')) dialog.close();
}
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('cancel',event=>{
  event.preventDefault();
  closeDialog(dialog);
}));
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>closeDialog(button.closest('dialog'))));

el('createRole').addEventListener('click',()=>{
  if (!canManage()) return;
  el('newName').value = '';
  el('newPieceField').innerHTML = piecePicker('newPiece','rook','身份徽记');
  el('createError').textContent = '';
  openFormDialog('createDialog');
});
el('newName').addEventListener('input',()=>{ el('createError').textContent = ''; });
el('createForm').addEventListener('submit',event=>{
  event.preventDefault();
  if (!canManage()) return;
  const name = el('newName').value.trim();
  if (!isName(name) || Object.values(config.names).some(existing=>normalized(existing)===normalized(name))) {
    el('createError').textContent = '请输入不同于现有角色的名称，每个名称限 1 至 16 个字。';
    el('newName').focus();
    return;
  }
  let number = 1;
  while (Object.hasOwn(config.names,'custom-'+number)) number++;
  role = 'custom-'+number;
  config.names[role] = name;
  config.pieces[role] = event.target.elements.newPiece.value;
  category = 'all';
  el('allowed').checked = false;
  persist('已创建「'+name+'」。请开启所需权限，再分配给成员。');
  el('createDialog').close();
  render();
  el('roles').querySelector('[data-role="'+role+'"]').focus({preventScroll:true});
});
function updateAssignInfo() {
  const account = el('assignAccount').value;
  const characters = sampleMembers.filter(member=>member[1]===account).map(member=>member[0]);
  el('assignInfo').textContent = '当前身份：'+config.names[accountRole(account)]+'。关联游戏角色：'+characters.join('、')+'。';
}
function openAssignment(account, target) {
  if (!canManage() || !assignableAccounts.includes(account)) return;
  el('assignAccount').replaceChildren(...assignableAccounts.map(id=>new Option(accounts[id].name,id)));
  el('assignAccount').value = account;
  el('assignTarget').replaceChildren(...roleKeys().filter(key=>key!=='owner').map(key=>new Option(config.names[key],key)));
  el('assignTarget').value = target;
  updateAssignInfo();
  openFormDialog('assignDialog');
}
el('assignAccount').addEventListener('change',updateAssignInfo);
el('assignRole').addEventListener('click',()=>openAssignment('hiker',role));
el('memberRows').addEventListener('click',event=>{
  const button = event.target.closest('[data-account]');
  if (button) openAssignment(button.dataset.account,accountRole(button.dataset.account));
});
el('assignForm').addEventListener('submit',event=>{
  event.preventDefault();
  const account = el('assignAccount').value;
  const key = el('assignTarget').value;
  if (!canManage() || !assignableAccounts.includes(account) || !roleKeys().includes(key) || key==='owner') return;
  config.assignments[account] = key;
  persist('已为「'+accounts[account].name+'」分配「'+config.names[key]+'」');
  el('assignDialog').close();
  location.hash = 'members';
  renderMembers();
});
render();
