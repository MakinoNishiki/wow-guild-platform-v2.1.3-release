'use strict';

const roleTypes = {
  owner: { tier: '创建者', name: '会长' },
  editor: { tier: '管理者', name: '公会编辑' },
  viewer: { tier: '普通用户', name: '团员' }
};
const roleKeys = Object.keys(roleTypes);
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
  {id:'submit', category:'loot', key:true, label:'提交拾取记录', grants:roleKeys,
    detail:'可以提交自己的观察记录，保留来源以供核对。最终装备去向要单独确认。'},
  {id:'review', category:'loot', label:'核对拾取与交易证据', grants:managers,
    detail:'可以查看交易证据，确认、忽略或合并本会拾取记录。'},
  {id:'allocate', category:'loot', key:true, label:'确认装备最终分配', grants:managers,
    detail:'可以登记装备去向。登记为已分配时需选定本会在队角色，拾取人和交易对象可供核对。'},
  {id:'contact', category:'guild', key:true, label:'查看内部招募卡与联系方式', grants:roleKeys, fixed:'随会籍',
    detail:'本会全体成员都能查看。游客、其他公会成员和已离会账号无权查看本会内部资料。'},
  {id:'read-report', category:'battle', label:'阅读已发布战报', grants:roleKeys, fixed:'已公开',
    detail:'已经发布且击杀证据有效的战报对访客开放。草稿和已撤回战报仅在相应的内部入口处理。'},
  {id:'settings', category:'guild', label:'编辑公会资料与分配制度', grants:creator,
    detail:'可以维护本会介绍、分配制度与规则说明。'},
  {id:'membership', category:'guild', label:'调整成员的基础角色', grants:creator, fixed:'创建者专属',
    detail:'创建者为其他账号分配管理者或普通用户身份。变更公会所有权另走所有权流程。'},
  {id:'remove', category:'guild', label:'移出公会成员', grants:creator,
    detail:'可解除其他成员在本会的会籍，被移出者随即失去本会内部资料的访问权。创建者身份由公会所有权流程管理。'},
  {id:'configure', category:'guild', label:'角色命名与权限配置', grants:creator, fixed:'创建者专属',
    detail:'只有创建者可以修改这三种基础角色的显示名称与业务权限。改名不影响现有会籍和公会所有权。'},
  {id:'claim-mode', category:'roster', label:'设置公会角色认领方式', grants:creator,
    detail:'可以选择自由认领、申请审核或管理者指定。'},
  {id:'claim', category:'roster', label:'认领本人的团队角色', grants:roleKeys,
    detail:'开启后仍遵守本会认领方式。自由模式可自行认领，审核模式需提交申请，指定模式由获授权者分配。解绑本人的已有认领沿用个人流程。'},
  {id:'assign-claim', category:'roster', label:'管理团队角色与认领申请', grants:managers,
    detail:'可以维护名册、指定认领人或审核申请。认领游戏角色与账号的公会身份分别管理。'},
  {id:'attendance', category:'roster', label:'维护活动和考勤', grants:managers,
    detail:'可以维护本会活动与出勤，或从 WCL 同步活动考勤。'},
  {id:'find-wcl', category:'roster', label:'查找新的 WCL 报告', grants:managers,
    detail:'可以从已绑定的公会日志源查找新报告。该操作保留原来的公会绑定。'},
  {id:'wishlist', category:'loot', label:'维护团队心愿单', grants:managers,
    detail:'可以新增、编辑或删除团队心愿。认领某个角色不会自动授予维护权限。'},
  {id:'stats', category:'roster', label:'查看团队统计', grants:roleKeys,
    detail:'可以通过本会仪表盘和报表查看活动出勤和排行。'}
];
const sampleMembers = [
  ['黎明守望', '守夜人', 'owner'], ['渡鸦', '暮色行者', 'editor'],
  ['山脊', '山间来客', 'viewer'], ['晨露', '山间来客', 'viewer'], ['林间微光', '', null]
];
const schemes = ['heraldry', 'ranks'];
const storageKey = 'wb.guild-permissions.review.v2';
const el = id => document.getElementById(id);
const initialNames = Object.fromEntries(roleKeys.map(key => [key, roleTypes[key].name]));
const isName = value => typeof value === 'string' && !!value.trim() && Array.from(value.trim()).length <= 16;
const normalized = value => value.trim().normalize('NFKC').toLowerCase();
function validNames(names) {
  return names && roleKeys.every(key => isName(names[key])) &&
    new Set(roleKeys.map(key => normalized(names[key]))).size === roleKeys.length;
}
function defaultConfig() { return { names:{...initialNames}, overrides:{}, scheme:'heraldry' }; }
function loadConfig() {
  const next = defaultConfig();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (!saved) return next;
    if (validNames(saved.names)) roleKeys.forEach(key => { next.names[key] = saved.names[key].trim(); });
    if (schemes.includes(saved.scheme)) next.scheme = saved.scheme;
    for (const action of actions.filter(item => !item.fixed)) {
      for (const key of roleKeys) {
        const id = action.id + '/' + key;
        if (typeof saved.overrides?.[id] === 'boolean') next.overrides[id] = saved.overrides[id];
      }
    }
  } catch { /* A file preview or browser privacy setting may disable storage. */ }
  return next;
}
let config = loadConfig();
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
function icon(key) {
  return '<svg class="role-icon" width="20" height="20" aria-hidden="true" focusable="false"><use href="#'+config.scheme+'-'+key+'"></use></svg>';
}
function roleLabel(key) {
  return icon(key)+'<span>'+text(config.names[key])+'</span>';
}
function inCategory(action, id) {
  return id === 'all' || (id === 'key' && action.key) || action.category === id;
}
function allowed(action, key) {
  if (action.fixed) return action.grants.includes(key);
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
  const activeRoles = single ? [role] : roleKeys;
  const items = actions.filter(action => inCategory(action,category) &&
    (!single || !el('allowed').checked || allowed(action,role)));
  el('sectionTitle').textContent = categories.find(item => item[0] === category)[1];
  el('count').textContent = items.length+' 项操作';
  el('allowedLabel').hidden = !single;
  el('empty').hidden = items.length > 0;
  el('head').closest('table').classList.toggle('single',single);
  document.querySelectorAll('[data-category]').forEach(button => button.setAttribute('aria-pressed',button.dataset.category === category));
  el('roles').innerHTML = ['all',...roleKeys].map(key => '<button type="button" data-role="'+key+'" aria-pressed="'+(key === role)+'">'+
    (key === 'all'?'三种身份对照':text(config.names[key]))+'</button>').join('');
  el('head').innerHTML = '<tr><th scope="col">操作</th>'+activeRoles.map(key =>
    '<th scope="col"><span class="badge">'+roleLabel(key)+'</span><small>'+roleTypes[key].tier+'</small></th>').join('')+
    (single?'<th scope="col">适用范围</th>':'')+'</tr>';
  el('rows').innerHTML = items.map(action => {
    const open = expanded.has(action.id);
    const name = single ? text(action.label) : '<button type="button" class="row-button" data-action="'+action.id+
      '" aria-expanded="'+open+'" aria-controls="note-'+action.id+'"><span class="chevron" aria-hidden="true"></span>'+text(action.label)+'</button>';
    return '<tr class="action"><th scope="row">'+name+'</th>'+activeRoles.map(key=>cell(action,key)).join('')+
      (single?'<td class="role-note">'+text(action.detail)+'</td>':'')+'</tr>'+
      (single?'':'<tr class="note-row" id="note-'+action.id+'"'+(open?'':' hidden')+'><td colspan="4">'+text(action.detail)+'</td></tr>');
  }).join('');
}
function renderMembers() {
  document.querySelectorAll('[data-scheme]').forEach(button => button.setAttribute('aria-pressed',button.dataset.scheme === config.scheme));
  el('memberRows').innerHTML = sampleMembers.map(([character,account,key]) =>
    '<tr><th scope="row">'+character+'</th><td>'+(account||'尚未认领')+'</td><td>'+(key
      ? '<span class="badge roster-badge '+key+'">'+roleLabel(key)+'</span><small>'+roleTypes[key].tier+'</small>'
      : '<span class="fixed-rule">—</span>')+'</td></tr>').join('');
}
function render() {
  for (const button of document.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed',button.dataset.view===view);
  el('permissionsPanel').hidden = view !== 'permissions';
  el('membersPanel').hidden = view !== 'members';
  el('actor').replaceChildren(...roleKeys.map(key=>new Option(roleTypes[key].tier+' · '+config.names[key],key)));
  el('actor').value = actor;
  el('rename').disabled = el('restore').disabled = !canManage();
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
  if (!action || action.fixed || !roleKeys.includes(key)) return;
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
document.querySelectorAll('[data-scheme]').forEach(button=>button.addEventListener('click',()=>{
  config.scheme = button.dataset.scheme;
  persist('已切换本机预览徽记');
  render();
}));
el('rename').addEventListener('click',()=>{
  if (!canManage()) return;
  el('nameFields').innerHTML = roleKeys.map(key=>'<label class="name-field"><span class="badge">'+icon(key)+roleTypes[key].tier+
    '</span><input name="'+key+'" value="'+text(config.names[key])+'" aria-label="'+roleTypes[key].tier+'的角色名称" required></label>').join('');
  el('nameError').textContent='';
  el('nameDialog').showModal();
});
el('nameForm').addEventListener('submit',event=>{
  event.preventDefault();
  if (!canManage()) return;
  const names = Object.fromEntries(roleKeys.map(key=>[key,event.target.elements.namedItem(key).value.trim()]));
  if (!validNames(names)) {
    el('nameError').textContent='请为每种角色填写不同的名称，每个名称限 1 至 16 个字。';
    return;
  }
  config.names=names;
  persist('角色名称已更新，成员名册已同步');
  el('nameDialog').close();
  render();
});
el('restore').addEventListener('click',()=>{ if (canManage()) el('restoreDialog').showModal(); });
el('restoreConfirm').addEventListener('click',()=>{
  if (!canManage()) return;
  config={...defaultConfig(),scheme:config.scheme};
  persist('三种角色的名称和权限已恢复默认配置');
  el('restoreDialog').close();
  render();
});
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
render();
