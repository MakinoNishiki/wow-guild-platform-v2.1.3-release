'use strict';

const characters = {
  druid: {name:'林间月', realm:'白银之手', region:'国服', job:'德鲁伊', spec:'平衡', source:'WCL 已验证'},
  warrior: {name:'白砾', realm:'金色平原', region:'国服', job:'战士', spec:'武器', source:'手动添加'}
};
const storageKey = 'wb-review-personal-visibility-v1';
const initial = {
  display:null, claimed:true, member:true, north:false, requested:false, active:'dusk',
  study:[2,1], hearth:[1,2], plan:'study'
};
const byId = id => document.getElementById(id);
const dialog = byId('confirmation');
let state = {...initial};
let view = 'visitor';
let pendingAction = null;
try {
  const saved = JSON.parse(sessionStorage.getItem(storageKey));
  if (saved && (saved.display === null || Object.hasOwn(characters,saved.display)) &&
      typeof saved.claimed === 'boolean' && typeof saved.member === 'boolean') {
    state.display = saved.display;
    state.claimed = saved.claimed;
    state.member = saved.member;
    state.north = saved.north === true;
    state.requested = saved.requested === true;
    state.active = saved.active === 'north' ? 'north' : 'dusk';
    state.plan = saved.plan === 'hearth' ? 'hearth' : 'study';
    for (const key of ['study','hearth']) {
      if (Array.isArray(saved[key]) && saved[key].length === 2 &&
          saved[key].every(n => Number.isSafeInteger(n) && n >= 1 && n <= 999)) state[key] = saved[key];
    }
  }
} catch { /* This preview also works without browser storage. */ }

function update(changes, message) {
  Object.assign(state, changes);
  if (state.active === 'north' && !state.north && state.member) state.active = 'dusk';
  if (state.active === 'dusk' && !state.member && state.north) state.active = 'north';
  try { sessionStorage.setItem(storageKey, JSON.stringify(state)); }
  catch { message += ' 当前浏览器仅保留本页操作。'; }
  render();
  document.dispatchEvent(new Event('profile-updated'));
  byId('message').textContent = message;
}

function specImage(role) {
  return '<img src="../../'+IconMap.specIcon(role.job,role.spec)+'" width="39" height="39" alt="">';
}
for (const [id,role] of Object.entries(characters)) {
  document.documentElement.style.setProperty('--class-'+id, IconMap.classColor(role.job));
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'choice';
  button.dataset.character = id;
  button.innerHTML = specImage(role)+'<span><span class="name class-'+id+'">'+role.name+
    '</span><span class="subline">'+role.realm+' · '+role.job+' · '+role.spec+
    '</span></span><span class="choice-state"></span>';
  button.onclick = () => {
    if (state.display !== id) update({display:id}, '对外展示角色已设为「'+role.name+'」。');
  };
  byId('choices').append(button);
}

function record(key, meta) {
  const role = characters[key];
  return '<div class="record">'+specImage(role)+'<div><span class="name class-'+key+'">'+role.name+
    '</span><span class="subline">'+role.realm+' · '+role.job+' · '+role.spec+'</span><span class="subline">'+meta+'</span></div></div>';
}
function claimLabel() {
  if (!state.claimed) return '未认领';
  return state.member ? '认领人：微澜' : '认领人：已退会用户';
}
function visitorCard() {
  if (!state.display) return '<div class="preview-blank"><img src="../../assets/icons/nav/characters.svg" alt=""><strong>尚未对外展示角色</strong></div>';
  // Match the live publicCharacter field list. The icon only represents the public class.
  const role = characters[state.display];
  return '<div class="record public"><img src="../../'+IconMap.classIcon(role.job)+'" alt=""><div><strong class="name class-'+state.display+'">'+role.name+
    '</strong><span class="subline">'+role.region+' · '+role.realm+' · '+role.job+'</span></div></div>';
}
function renderPreview() {
  for (const button of document.querySelectorAll('[data-view]'))
    button.setAttribute('aria-pressed',String(view===button.dataset.view));
  let html, hint;
  if (view==='visitor') {
    html=visitorCard();
    hint='对外名片仅含角色名、地区、服务器和职业。此处为预览，个人公开主页尚未开放。';
  } else if (view==='guild') {
    const north=state.active==='north';
    html=north
      ? '<div class="preview-caption">北辰公会 · 成员名册</div>'+record('druid','未认领')
      : '<div class="preview-caption">暮星公会 · 成员名册</div>'+record('warrior',claimLabel());
    hint='这是另一位团员在'+(north?'北辰':'暮星')+'名册中看到的记录。此示例公会开启了认领人标签。';
  } else {
    html=Object.entries(characters).map(([key,role])=>record(key,role.source+' · '+(state.display===key?'已选为展示角色':'个人角色'))).join('');
    hint=state.member||state.north?'你可以管理这两个角色，并在「公会与认领」查看公会关联。':'你仍可管理这两个角色，已无法进入原公会的内部资料。';
  }
  byId('previewBody').innerHTML=html;
  byId('viewHint').textContent=hint;
}
function render() {
  for (const button of byId('choices').children) {
    const selected = state.display === button.dataset.character;
    button.setAttribute('aria-pressed', String(selected));
    button.querySelector('.choice-state').textContent = selected ? '正在展示' : '设为展示';
  }
  byId('selectionState').textContent=state.display?'当前展示 · '+characters[state.display].name:'当前未展示角色';
  byId('withdraw').disabled=!state.display;
  const north=state.active==='north';
  const inGuild=north?state.north:state.member;
  byId('privacyGuildName').textContent=north?'北辰公会':'暮星公会';
  byId('membership').textContent=inGuild?'当前身份 · 团员':'已退出';
  let claimDescription='你在本会没有已认领的角色。';
  if (!inGuild) claimDescription='个人角色仍保留，原公会保留自己的名册与活动历史。';
  else if (!north && state.claimed) claimDescription='你已认领战士「白砾」。';
  else if (north && state.requested) claimDescription='「林间月」认领申请待审核。';
  byId('claimState').textContent=claimDescription;
  byId('unclaim').hidden=north;
  byId('unclaim').disabled=north || !state.member || !state.claimed;
  byId('leave').disabled=!inGuild;
  renderPreview();
}
for (const button of document.querySelectorAll('[data-view]')) {
  button.onclick=()=>{ view=button.dataset.view; renderPreview(); };
}
byId('withdraw').onclick=()=>{
  update({display:null},'已撤下对外展示。公会认领保持原状。');
  byId('choices').querySelector('button').focus();
};
const actions={
  unclaim:{title:'解除「白砾」的公会认领？',body:'示例名册将标记为未认领。你仍是暮星团员，个人角色和展示选择都会保留。',confirm:'解除认领', changes:{claimed:false},message:'已解除「白砾」的认领。'},
  leave:{title:'以团员身份退出暮星？',body:'退出后失去本会内部访问权。个人角色、家宅方案和展示选择都会保留，原公会仍可查看已有的活动记录。',confirm:'退出示例公会',changes:{member:false},message:'已退出暮星公会。'},
  leaveNorth:{title:'以团员身份退出北辰？',body:'将关闭北辰的内部记录入口。你的家宅方案、个人角色及其他会籍都会保留。',confirm:'退出示例公会',changes:{north:false},message:'已退出北辰公会。'},
  claim:{title:'认领暮星名册中的「白砾」？',body:'请核对国服、金色平原、战士。确认后，这条公会记录将关联到你的账号。',confirm:'确认认领',changes:{claimed:true},message:'已认领暮星的「白砾」。'}
};
function openConfirmation(key) {
    const action=actions[key];
    pendingAction=key;
    byId('dialogTitle').textContent=action.title;
    byId('dialogText').textContent=action.body;
    byId('confirmAction').textContent=action.confirm;
    dialog.returnValue='';
    dialog.showModal();
}
byId('unclaim').onclick=()=>openConfirmation('unclaim');
byId('leave').onclick=()=>openConfirmation(state.active==='north'?'leaveNorth':'leave');
dialog.addEventListener('cancel',()=>{pendingAction=null;});
dialog.querySelector('form').addEventListener('submit', event=>{
  event.preventDefault();
  const key=pendingAction;
  pendingAction=null;
  const choice=event.submitter?.value || 'cancel';
  dialog.close(choice);
  if (choice!=='confirm' || !key) return;
  update(actions[key].changes,actions[key].message);
  const focusTarget = byId('privacyPage').hidden
    ? document.querySelector('.profile-sections [aria-current]')
    : document.querySelector('[data-view="'+view+'"]');
  focusTarget.focus();
});
byId('reset').onclick=()=>{
  view='visitor';
  document.dispatchEvent(new Event('profile-reset'));
  update(initial,'已恢复示例的初始状态。');
};
render();
