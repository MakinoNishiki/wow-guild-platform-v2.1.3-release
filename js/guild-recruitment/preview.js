'use strict';
const el = id => document.getElementById(id);
const val = id => el(id).value.trim();
const demo = location.protocol==='file:' && new URLSearchParams(location.search).get('demo')==='1';
let guild = {}, canEdit = false, baseline = '';
const scalarFields = ['region','edition','branch','identity','mode','goal','goalText','team','teamName','overtime','score','scoreText','bracket','voice','tool','toolText'];
const lootRules = {roll:'ROLL',yixuduotan:'一需多贪',cl:'CL（团长分配）',custom:'自定义'};
const days = ['周一','周二','周三','周四','周五','周六','周日'];
const goals = {
  '团队副本':['本赛季取得千钧一发','取得引领潮流','通关史诗团本','通关英雄团本'],
  '大秘境':['提升大秘境评分','固定队冲层','完成每周低保'],
  'PvP':['提升评级','固定队竞技场','评级战场'],
  '角色扮演':['固定剧情活动','角色扮演聚会'],
  '休闲社交':['固定公会活动','成就与收藏','练级交流']
};
const goalByMode = new Map();
let lastMode = null;
const checked = group => [...el(group).querySelectorAll('input:checked')].map(input=>input.value);
const make = (tag,text,cls) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};
function createCheck(group,value,label=value) {
  const wrap = make('label',null,'choice-pill');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.value = value;
  wrap.append(input,make('span',label));
  el(group).append(wrap);
  return input;
}
const entries = days.map((day,index) => {
  const enabled = createCheck('dayButtons',day);
  enabled.checked = demo && index >= 4;
  const row = make('div',null,'night');
  const start = document.createElement('input'), end = document.createElement('input');
  [start,end].forEach(input=>input.type='time');
  start.setAttribute('aria-label',day+'开始');
  end.setAttribute('aria-label',day+'结束');
  if (demo) {
    start.value = index === 4 ? '21:00' : '20:00';
    end.value = index === 4 ? '23:30' : '23:00';
  }
  const nextDay = make('small');
  row.append(make('b',day),start,make('span','—'),end,nextDay);
  el('nights').append(row);
  return {day,enabled,row,start,end,nextDay};
});
const commonRules = ['提前请假','准时集合','准备合剂和食物','安装 DBM','安装 MRT','安装 DFT','其他约定'];
commonRules.forEach(rule=>{ createCheck('ruleChoices',rule).checked = demo && ['提前请假','准时集合'].includes(rule); });
const contactTypes = [
  ['微信','微信号'],['QQ','QQ 号'],['战网 ID','战网昵称#编号'],['手机号','手机号码'],['其他','其他联络方式']
];
function addContact(type,hint) {
  const enabled = createCheck('contactChoices',type);
  const fields = make('div',null,'contact-field');
  const label = make('label',hint);
  const account = document.createElement('input');
  account.type = type==='手机号' ? 'tel' : 'text';
  account.placeholder = hint;
  label.append(account);
  fields.append(label);
  let visible = null;
  if (demo) {
    visible = document.createElement('input');
    visible.type = 'checkbox';
    const access = make('label',null,'privacy-check');
    access.append(visible,' 在招募卡公开'+type);
    fields.append(access);
  }
  el('contactFields').append(fields);
  return {type,fields,enabled,visible,account};
}
const contacts = contactTypes.map(([type,hint])=>addContact(type,hint));
const intro = demo ? GuildIntroEditor.mount(el('introHost'), {label:'公会介绍',id:'reviewGuildIntro'}) : null;
if (demo) {
  intro.setValue('我们是金色平原的固定团。欢迎愿意一起研究战术、长期出勤的伙伴。');
  document.body.classList.remove('embedded');
  document.querySelector('.mast').hidden = false;
  el('cardGuildName').textContent = '「挽歌」';
  el('cardRealm').textContent = '金色平原';
} else {
  el('demoLoot').hidden = el('lootExtra').hidden = true;
  el('guildLoot').hidden = false;
  el('introHost').previousElementSibling.append(make('small','来自公会资料'));
  el('contactChoices').parentElement.querySelector('legend small').textContent = '选填 · 本公会成员可见';
  for (const id of scalarFields) {
    if (el(id).tagName==='SELECT') el(id).add(new Option('请选择',''),0);
  }
}
const visuals = GuildChoiceVisuals;
visuals.decorate(el('tool'),visuals.voiceMark);
GuildChoices.init(demo);

function syncForm() {
  const mode = val('mode');
  if (mode !== lastMode) {
    if (lastMode) goalByMode.set(lastMode,{choice:val('goal'),text:val('goalText')});
    const options = [...(goals[mode] || []),'尚未确定','自定义'];
    el('goal').replaceChildren(...options.map(name=>new Option(name,name)));
    if (!demo) { el('goal').add(new Option('请选择',''),0); el('goal').value=''; }
    const previous = goalByMode.get(mode);
    if (previous) el('goal').value = previous.choice;
    el('goalText').value = previous?.text || '';
    lastMode = mode;
  }
  GuildChoices.update(val('edition'),mode);
  el('classicEdition').hidden = val('edition') !== '怀旧服';
  el('goalExtra').hidden = val('goal') !== '自定义';
  el('teamExtra').hidden = val('team') !== '其他';
  el('voiceTools').hidden = !val('voice') || val('voice') === '否';
  el('toolExtra').hidden = el('voiceTools').hidden || val('tool') !== '其他';
  el('ruleExtra').hidden = !checked('ruleChoices').includes('其他约定');
  el('scoreExtra').hidden = mode !== '大秘境' || val('score') !== '自定义';
  for (const label of document.querySelectorAll('[data-modes]')) label.hidden = !label.dataset.modes.split('|').includes(mode);
  el('recruitPicker').hidden = !['团队副本','大秘境','PvP'].includes(mode);
  for (const entry of contacts) entry.fields.hidden = !entry.enabled.checked;
  for (const {enabled,row,start,end,nextDay} of entries) {
    row.hidden = !enabled.checked;
    nextDay.textContent = start.value && end.value && end.value < start.value ? '次日' : '';
  }
  const activeDays = entries.filter(entry=>entry.enabled.checked).length;
  el('nightCount').textContent = activeDays ? '每周 '+activeDays+' 天' : '';
  const facts = [val('region'),val('edition'),el('classicEdition').hidden ? '' : val('branch'),val('identity'),mode].filter(Boolean);
  el('guildMeta').replaceChildren(...facts.map(text=>make('span',text)));
  el('cardSummary').textContent = facts.join(' · ');
  el('cardSummary').hidden = demo || !facts.length;
}

function detail(label,value) {
  const row = make('div',null,'fact-line');
  row.append(make('span',label,'caption'),make('span',value));
  return row;
}
function tags(values) {
  const container = make('div',null,'tags');
  for (const value of values) container.append(make('span',value));
  return container;
}
function drawPreview() {
  const mode = val('mode');
  const needs = el('recruitPicker').hidden ? [] : GuildChoices.needs();
  const goal = val('goal') === '自定义' ? val('goalText') : val('goal');
  const needHost = el('readNeeds');
  needHost.replaceChildren();
  if (goal) needHost.append(make('p',goal,'raid-goal'));
  for (const need of needs) {
    const line = make('div',null,'need-line');
    const cls = GuildRecruitArt.getClass(need.className);
    const single = need.specs.length === 1;
    const portrait = (single && GuildRecruitArt.getSpec(need.className,need.specs[0]).icon) || cls.icon;
    if (portrait) {
      const img = document.createElement('img'); img.src = portrait; img.alt=''; img.className='recruit-portrait'; line.append(img);
    }
    const text = make('div',null,'need-summary');
    const name = need.className || '职业不限';
    const title = make('b',single ? name+' · '+need.specs[0] : need.specs.length ? name : name+' · 专精待确认');
    if (cls.color) title.style.color = cls.color;
    text.append(title);
    if (need.specs.length > 1) {
      const specs = make('div',null,'need-marks');
      for (const value of need.specs) specs.append(visuals.label(value,GuildRecruitArt.getSpec(need.className,value).icon));
      text.append(specs);
    }
    const marks = make('div',null,'need-marks');
    for (const value of need.roles) {
      const {icon,color} = GuildRecruitArt.getRole(value);
      marks.append(visuals.label(value,icon,color));
    }
    if (!need.roles.length) marks.textContent='职责不限';
    text.append(marks);
    line.append(text);
    if (need.priority) {
      const badge = make('span',null,'priority');
      badge.dataset.level = need.priority;
      badge.append(visuals.priorityMark(need.priority,need.priority+'需求'));
      line.append(badge);
    }
    needHost.append(line);
  }
  if (!needs.length && (!el('recruitPicker').hidden || !mode)) needHost.append(make('p','尚未指定职业缺口','muted'));
  if (mode==='大秘境') needHost.append(detail('大秘境分数',(val('score')==='自定义' ? val('scoreText') : val('score')) || '待确认'));
  if (mode==='PvP') needHost.append(detail('队伍形式',val('bracket') || '待确认'));

  const schedule = el('readSchedule');
  const activeDays = entries.filter(entry=>entry.enabled.checked);
  el('weekCount').textContent = activeDays.length ? '每周 '+activeDays.length+' 天' : '';
  schedule.replaceChildren();
  const times = new Map();
  for (const {day,start,end,nextDay} of activeDays) {
    const time = start.value && end.value && start.value!==end.value ? start.value+' – '+nextDay.textContent+end.value : '时段待确认';
    if (!times.has(time)) times.set(time,[]);
    times.get(time).push(day);
  }
  for (const [range,group] of times) {
    const row = make('div',null,'schedule-row');
    row.append(tags(group),make('strong',range));
    schedule.append(row);
  }
  if (!times.size) schedule.append(make('p','活动时间待确认','muted'));
  const team = val('team')==='其他' ? val('teamName') : val('team');
  schedule.append(make('p',[team,val('overtime')].filter(Boolean).join(' · '),'muted'));

  const value = demo ? intro.getValue() : guild.description;
  if (value) GuildIntroEditor.render(el('readIntro'),value);
  else el('readIntro').replaceChildren(make('p','尚未填写公会介绍','muted'));

  const rules = checked('ruleChoices').filter(rule=>rule!=='其他约定');
  const rule = demo ? val('loot') : guildLootLabel();
  const note = demo ? val('lootNote') : guild.loot_rule_text;
  el('readRules').replaceChildren(detail('装备分配',rule || '尚未设置'));
  if (note) el('readRules').append(make('p',note,'preserve'));
  if (rules.length) el('readRules').append(tags(rules));
  if (!el('ruleExtra').hidden && val('rules')) el('readRules').append(make('p',val('rules'),'preserve'));

  const progress = GuildChoices.progress();
  el('readProgressPanel').hidden = !progress.length;
  el('readProgress').replaceChildren();
  for (const entry of progress) {
    const row = make('div',null,'progress-entry');
    row.append(detail(entry.season+' · '+entry.raid,entry.difficulty+' '+entry.killed+(entry.total ? ' / '+entry.total : ' 位首领（历史目录）')));
    if (entry.total) {
      const bar = document.createElement('progress'); bar.max=entry.total; bar.value=entry.killed;
      bar.setAttribute('aria-label',entry.raid+' '+entry.difficulty+'击杀进度'); row.append(bar);
    }
    if (entry.bosses.length) row.append(make('p',entry.bosses.join('、'),'muted'));
    el('readProgress').append(row);
  }
  const voiceTool = val('tool')==='其他' ? val('toolText') : val('tool');
  const voice = val('voice');
  const voiceRow = detail('团队语音',voice === '否' ? '无需语音' : voice === '是' ? '需要语音' : voice==='视情况' ? '视情况使用' : voice || '待确认');
  if (voice && voice !== '否' && voiceTool) {
    const value = voiceRow.lastElementChild;
    value.className = 'voice-value';
    value.append(visuals.label(voiceTool,visuals.voiceMark(val('tool')).src));
  }
  const contact = el('readContact'); contact.replaceChildren(voiceRow);
  for (const entry of contacts) {
    if (entry.enabled.checked && (!demo || entry.visible.checked) && entry.account.value.trim()) contact.append(detail(entry.type,entry.account.value.trim()));
  }
}
function setView(read) {
  el('reader').hidden = !read;
  el('editor').hidden = read;
  el('editView').setAttribute('aria-pressed',String(!read));
  el('publicView').setAttribute('aria-pressed',String(read));
  if (read) drawPreview();
}
el('editor').addEventListener('change',syncForm);
el('loot').onchange = ()=>{ if (val('loot')==='自定义') el('lootExtra').open = true; };
el('editor').onsubmit = event=>event.preventDefault();
el('publicView').onclick = ()=>{ location.hash = 'preview'; };
el('editView').onclick = ()=>{ location.hash = 'edit'; };
function guildLootLabel() {
  return Object.hasOwn(lootRules,guild.loot_rule_type) ? lootRules[guild.loot_rule_type] : guild.loot_rule_type;
}

function getValue() {
  const result = Object.fromEntries(scalarFields.map(key=>[key,val(key)]));
  if (el('classicEdition').hidden) result.branch='';
  if (el('goalExtra').hidden) result.goalText='';
  if (el('teamExtra').hidden) result.teamName='';
  if (result.mode!=='大秘境') result.score='';
  if (el('scoreExtra').hidden) result.scoreText='';
  if (result.mode!=='PvP') result.bracket='';
  if (el('voiceTools').hidden) result.tool='';
  if (el('toolExtra').hidden) result.toolText='';
  result.rules=checked('ruleChoices');
  result.ruleText=el('ruleExtra').hidden ? '' : val('rules');
  result.days=entries.filter(e=>e.enabled.checked).map(e=>({day:e.day,start:e.start.value,end:e.end.value}));
  result.contacts=contacts.filter(e=>e.enabled.checked && e.account.value.trim()).map(e=>({type:e.type,value:e.account.value.trim()}));
  result.needs=GuildChoices.getNeeds();
  result.progress=GuildChoices.progress().map(({season,raid,difficulty,bosses})=>({season,raid,difficulty,bosses}));
  return result;
}

function setField(key,value) {
  const node=el(key);
  const text=typeof value==='string' ? value : '';
  if (text && node.tagName==='SELECT' && ![...node.options].some(option=>option.value===text)) {
    const option=new Option(text,text);
    option.dataset.historical='';
    node.add(option);
  }
  node.value=text;
}
function guildCatalog(master) {
  if (!master?.isLoaded?.() || master.isSnapshotMode()) return null;
  const patches=new Map(master.getPatches().map(patch=>[patch.id,patch.version]));
  return master.getSeasons().map(s=>{
    const cached=window.GUILD_REVIEW_RAIDS.find(item=>item.id===s.id);
    const version=cached?.version || String(patches.get(s.patch_id) || '').match(/^\d+\.\d+/)?.[0] || '';
    return {id:s.id,name:s.name,current:s.is_current,version,
      raids:master.getRaids(s.id).map(r=>({id:r.id,name:r.name,bosses:master.getBosses(r.id).map(b=>b.name)})).filter(r=>r.bosses.length)};
  }).filter(s=>s.raids.length);
}
function load({guild:source,card,canEdit:editable=false,masterData}={}) {
  if (demo) return;
  guild=source || {};
  canEdit=!!editable;
  const data=card || {};
  document.querySelectorAll('option[data-historical],#ruleChoices [data-historical]').forEach(node=>node.remove());
  for (let i=contacts.length-1;i>=contactTypes.length;i--) {
    const entry=contacts.pop(); entry.enabled.parentElement.remove(); entry.fields.remove();
  }
  for (const key of scalarFields) if (key!=='goal' && key!=='goalText') setField(key,data[key]);
  lastMode=null;
  goalByMode.clear();
  syncForm();
  setField('goal',data.goal);
  setField('goalText',data.goalText);
  setField('rules',data.ruleText);
  const rules=data.rules || [];
  for (const item of rules) if (!commonRules.includes(item)) createCheck('ruleChoices',item).parentElement.dataset.historical='';
  for (const input of el('ruleChoices').querySelectorAll('input')) input.checked=rules.includes(input.value) || (input.value==='其他约定' && !!data.ruleText);
  for (const entry of entries) {
    const saved=data.days?.find(item=>item.day===entry.day);
    entry.enabled.checked=!!saved; entry.start.value=saved?.start || ''; entry.end.value=saved?.end || '';
  }
  for (const item of data.contacts || []) if (!contacts.some(e=>e.type===item.type)) contacts.push(addContact(item.type,item.type));
  for (const entry of contacts) {
    const saved=data.contacts?.find(item=>item.type===entry.type);
    entry.enabled.checked=!!saved; entry.account.value=saved?.value || '';
  }
  GuildChoices.restore(data.needs || [],data.progress || [],guildCatalog(masterData));
  GuildIntroEditor.render(el('introHost'),guild.description || '尚未填写公会介绍');
  el('guildLoot').replaceChildren(detail('公会装备分配',guildLootLabel() || '尚未设置'));
  if (guild.loot_rule_text) el('guildLoot').append(make('p',guild.loot_rule_text,'preserve'));
  syncForm();
  visuals.decorate(el('tool'),visuals.voiceMark);
  document.querySelector('.folio').hidden=false;
  setView(true);
  baseline=JSON.stringify(getValue());
}
if (demo) {
  window.addEventListener('hashchange',()=>setView(location.hash==='#preview'));
  document.querySelector('.folio').hidden=false;
  syncForm();
  setView(location.hash==='#preview');
} else {
  window.GuildRecruitmentForm=Object.freeze({
    load,getValue,isDirty:()=>!!baseline && JSON.stringify(getValue())!==baseline,
    setView(view) {
      const editing=view==='edit' && canEdit;
      setView(!editing);
      if (editing) el('region').focus({preventScroll:true});
    }
  });
}
