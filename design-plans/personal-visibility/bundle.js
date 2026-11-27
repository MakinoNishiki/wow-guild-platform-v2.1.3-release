'use strict';

// This review uses the same account, character selection and membership as the privacy mock.
const sections = {
  overview: ['我的档案', '查看你的角色、个人方案和当前公会。', 'profile'],
  privacy: ['展示与隐私', '选择代表你的角色，查看自己、团员和访客各自能看到的资料。', 'characters'],
  assets: ['我的资产', '查看家宅方案，以及公会为你认领的角色登记的心愿与装备。', 'decor-plan'],
  guilds: ['公会与认领', '切换正在查看的公会，管理自己在名册中认领的角色。', 'guild-banner'],
  plan: ['家宅方案单', '调整这份采购清单的家具用量。保存后可回个人档案查看。', 'decor-plan']
};
const guildNames = {dusk:'暮星', north:'北辰'};
const invitations = {DUSK1128:'dusk', NORTH128:'north'};
const plans = {study:'林间书房', hearth:'炉边会客厅'};
const furnishings = [
  {name:'卷起来的卷轴', icon:7415897},
  {name:'华丽的石制壁炉', icon:7415905}
];
let draft = null;

function currentGuild() {
  if (!state.member && !state.north) return null;
  return state.active;
}
function reviewButton(label, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button';
  button.textContent = label;
  button.onclick = action;
  return button;
}
function renderOverview() {
  byId('ownedRoster').innerHTML = Object.entries(characters)
    .map(([key, role]) => record(key, role.source)).join('');
  byId('overviewDisplay').textContent = state.display ? characters[state.display].name : '仅自己可见';
  byId('overviewPlan').textContent = '2 份家宅方案';
  byId('overviewGuild').textContent = guildNames[currentGuild()] || '尚未加入公会';
}

function renderTeamRecords() {
  const guild = currentGuild();
  const records = byId('assetRecords');
  if (!guild) {
    records.innerHTML = '<p class="empty-note">尚未加入公会。加入后可查看已认领角色的团队记录。</p>';
    return;
  }
  if (guild === 'north' || !state.claimed) {
    const message = guild === 'north' && state.requested ? '认领申请待审核。' : '当前没有已认领角色。';
    records.innerHTML = '<p class="eyebrow">'+guildNames[guild]+'公会</p><p class="empty-note">'+message+'</p>';
    return;
  }
  records.innerHTML = '<p class="eyebrow">暮星公会 · 白砾 · 金色平原</p>'+
    '<details class="ledger"><summary>装备心愿<span>1 项</span></summary><div><strong>主手双手剑</strong><small>心愿单记录 · 尚未获得</small></div></details>'+
    '<details class="ledger"><summary>已获装备<span>1 件</span></summary><div><strong>板甲护腕</strong><small>11 月 20 日 · 一团 · 最终分配给白砾</small></div></details>';
}

function renderPlan() {
  const key = state.plan;
  const values = draft || state[key];
  const list = byId('planItems');
  byId('planSelect').value = key;
  byId('planSelect').disabled = Boolean(draft);
  list.replaceChildren();
  for (const [index, item] of furnishings.entries()) {
    const row = document.createElement('div');
    row.className = 'asset-row';
    row.innerHTML = '<img src="../../assets/decor-icons/'+item.icon+'.png" alt=""><span>'+item.name+'</span>';
    if (draft) {
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '1';
      input.max = '999';
      input.setAttribute('aria-label', item.name+'的计划用量');
      input.value = values[index];
      input.oninput = () => {
        draft[index] = input.valueAsNumber;
        updatePlanTotal();
      };
      row.append(input);
    } else {
      const quantity = document.createElement('strong');
      quantity.textContent = '× '+values[index];
      row.append(quantity);
    }
    list.append(row);
  }
  byId('cancelPlan').hidden = !draft;
  byId('editPlan').textContent = draft ? '保存用量' : '调整用量';
  updatePlanTotal();
}
function renderPlanList() {
  const list = byId('personalPlans');
  list.replaceChildren();
  for (const [key,name] of Object.entries(plans)) {
    const row = document.createElement('a');
    row.className = 'plan-entry';
    row.href = '#plan';
    row.innerHTML = '<img src="../../assets/decor-icons/'+furnishings[key==='study'?0:1].icon+'.png" alt="">'+
      '<span><strong>'+name+'</strong><small>2 种家具 · 共 '+(state[key][0]+state[key][1])+' 件</small></span><span aria-hidden="true">›</span>';
    row.onclick = () => {
      draft = null;
      update({plan:key},'');
    };
    list.append(row);
  }
}
function updatePlanTotal() {
  const values = draft || state[state.plan];
  const valid = values.every(n => Number.isSafeInteger(n) && n >= 1 && n <= 999);
  byId('editPlan').disabled = !valid;
  byId('planTotal').textContent = valid ? '2 种家具 · 共 '+(values[0]+values[1])+' 件' : '每种家具请输入 1 至 999 的整数';
}
byId('planSelect').onchange = event => update({plan:event.target.value}, '已打开'+plans[event.target.value]+'。');
byId('editPlan').onclick = () => {
  if (draft) {
    const saved = draft;
    draft = null;
    update({[state.plan]:saved}, '已保存「'+plans[state.plan]+'」的用量。');
  } else {
    draft = [...state[state.plan]];
    renderPlan();
    byId('planItems').querySelector('input').focus();
  }
};
byId('cancelPlan').onclick = () => {
  draft = null;
  renderPlan();
  byId('editPlan').focus();
  byId('message').textContent = '已取消调整。';
};

function joined(key) { return key === 'dusk' ? state.member : state.north; }
function renderGuilds() {
  const current = currentGuild();
  const memberships = byId('guildMemberships');
  memberships.replaceChildren();
  for (const [key,name] of Object.entries(guildNames)) {
    if (!joined(key)) continue;
    const row = document.createElement('div');
    row.className = 'membership-row';
    const title = document.createElement('strong');
    title.textContent = name+'公会';
    const status = document.createElement('small');
    status.textContent = key === current ? '当前公会 · 团员' : '团员';
    const action = key === current
      ? reviewButton('退出公会', () => openConfirmation(key === 'dusk' ? 'leave' : 'leaveNorth'))
      : reviewButton('切换至'+name, () => update({active:key}, '已切换至'+name+'公会。'));
    row.append(title,status,action);
    memberships.append(row);
  }
  if (!current) memberships.innerHTML = '<p class="empty-note">你尚未加入公会，可使用邀请码加入。</p>';
  byId('joinBox').hidden = state.member && state.north;
  const codes = Object.entries(invitations).filter(([,key]) => !joined(key));
  const hint=byId('inviteHint');
  hint.replaceChildren();
  for (const [code,key] of codes) {
    const fill=reviewButton('填入'+guildNames[key]+'示例码 '+code, () => {
      byId('inviteCode').value=code;
      byId('inviteError').textContent='';
      byId('joinForm').querySelector('[type="submit"]').focus();
    });
    fill.className='inset-link';
    hint.append(fill);
  }
  const claim = byId('activeClaim');
  if (!current) {
    claim.innerHTML = '<p class="empty-note">加入公会后，这里会显示可关联的名册角色。</p>';
    return;
  }
  if (current === 'dusk') {
    claim.innerHTML = '<p class="eyebrow">暮星公会 · 自由认领</p>'+record('warrior',state.claimed?'你已认领':'尚未认领');
    claim.append(reviewButton(state.claimed?'解除认领':'认领白砾', () => openConfirmation(state.claimed?'unclaim':'claim')));
  } else {
    claim.innerHTML = '<p class="eyebrow">北辰公会 · 认领需审核</p>'+record('druid',state.requested?'你的申请待审核':'可申请认领');
    claim.append(reviewButton(state.requested?'撤回申请':'申请认领林间月', () => {
      update({requested:!state.requested},state.requested?'已撤回认领申请。':'已提交示例申请，等待公会审核。');
    }));
  }
}
byId('joinForm').onsubmit = event => {
  event.preventDefault();
  const code = byId('inviteCode').value.trim().toUpperCase();
  const key = Object.hasOwn(invitations,code) ? invitations[code] : null;
  if (!key || joined(key)) {
    byId('inviteError').textContent = key ? '你已加入此公会。' : '邀请码无效，请核对下方的示例邀请码。';
    byId('inviteCode').focus();
    return;
  }
  byId('inviteError').textContent = '';
  byId('joinForm').reset();
  byId('joinBox').open = false;
  update({[key === 'north'?'north':'member']:true,active:key}, '已加入'+guildNames[key]+'公会。');
};
function renderBundle() {
  renderOverview();
  renderPlanList();
  renderPlan();
  renderTeamRecords();
  renderGuilds();
}
function showSection() {
  const hash = location.hash.slice(1);
  const page = Object.hasOwn(sections,hash) ? hash : 'privacy';
  const [title,lead,icon] = sections[page];
  for (const key of Object.keys(sections)) byId(key+'Page').hidden = key !== page;
  for (const link of document.querySelectorAll('.profile-sections a')) {
    if (link.hash === '#'+(page==='plan'?'assets':page)) link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
  }
  byId('pageHeading').textContent = title;
  document.querySelector('.hero .kicker').textContent = page==='plan'?'家宅房屋 · 方案单':'微澜的个人档案';
  byId('pageLead').textContent = lead;
  byId('pageEmblem').src = '../../assets/icons/nav/'+icon+'.svg';
  byId('message').textContent = '';
  document.title = title+' · 魔兽管家交互评审';
}
document.addEventListener('profile-updated',renderBundle);
document.addEventListener('profile-reset',() => {
  draft = null;
  byId('joinForm').reset();
  byId('joinBox').open = false;
  byId('inviteError').textContent = '';
});
window.addEventListener('hashchange',showSection);
renderBundle();
showSection();
