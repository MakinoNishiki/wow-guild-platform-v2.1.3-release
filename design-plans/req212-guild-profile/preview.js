'use strict';
const el = id => document.getElementById(id);
const val = id => el(id).value.trim();
const days = ['周一','周二','周三','周四','周五','周六','周日'];
const goals = {
  '团队副本':['本赛季取得千钧一发','取得引领潮流','通关史诗团本','通关英雄团本'],
  '大秘境':['提升大秘境评分','固定队冲层','完成每周低保'],
  'PvP':['提升评级','固定队竞技场','评级战场'],
  '角色扮演':['固定剧情活动','角色扮演聚会'],
  '休闲社交':['固定公会活动','成就与收藏','练级交流']
};
const goalByMode = new Map();
let lastMode = '';
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
  enabled.checked = index >= 4;
  const row = make('div',null,'night');
  const start = document.createElement('input'), end = document.createElement('input');
  [start,end].forEach(input=>input.type='time');
  start.setAttribute('aria-label',day+'开始');
  end.setAttribute('aria-label',day+'结束');
  start.value = index === 4 ? '21:00' : '20:00';
  end.value = index === 4 ? '23:30' : '23:00';
  const nextDay = make('small');
  row.append(make('b',day),start,make('span','—'),end,nextDay);
  el('nights').append(row);
  return {day,enabled,row,start,end,nextDay};
});
const commonRules = ['提前请假','准时集合','准备合剂和食物','安装 DBM','安装 MRT','安装 DFT','其他约定'];
commonRules.forEach(rule=>{ createCheck('ruleChoices',rule).checked = ['提前请假','准时集合'].includes(rule); });
const contactTypes = [
  ['微信','微信号'],['QQ','QQ 号'],['战网 ID','战网昵称#编号'],['手机号','手机号码'],['其他','其他联络方式']
];
const contacts = contactTypes.map(([type,hint])=>{
  const enabled = createCheck('contactChoices',type);
  const fields = make('div',null,'contact-field');
  const label = make('label',hint);
  const account = document.createElement('input');
  account.type = type==='手机号' ? 'tel' : 'text';
  account.placeholder = hint;
  label.append(account);
  const visible = document.createElement('input');
  visible.type = 'checkbox';
  const access = make('label',null,'privacy-check');
  access.append(visible,' 在招募卡公开'+type);
  fields.append(label,access);
  el('contactFields').append(fields);
  return {type,fields,enabled,visible,account};
});
const intro = GuildIntroEditor.mount(el('introHost'), {label:'公会介绍',id:'reviewGuildIntro'});
intro.setValue('我们是金色平原的固定团。欢迎愿意一起研究战术、长期出勤的伙伴。');
const visuals = GuildChoiceVisuals;
visuals.decorate(el('tool'),visuals.voiceMark);
GuildChoices.init();

function syncForm() {
  const mode = val('mode');
  if (mode !== lastMode) {
    if (lastMode) goalByMode.set(lastMode,{choice:val('goal'),text:val('goalText')});
    const options = [...goals[mode],'尚未确定','自定义'];
    el('goal').replaceChildren(...options.map(name=>new Option(name,name)));
    const previous = goalByMode.get(mode);
    if (previous) el('goal').value = previous.choice;
    el('goalText').value = previous?.text || '';
    lastMode = mode;
  }
  GuildChoices.update(val('edition'),mode);
  el('classicEdition').hidden = val('edition') !== '怀旧服';
  el('goalExtra').hidden = val('goal') !== '自定义';
  el('teamExtra').hidden = val('team') !== '其他';
  el('voiceTools').hidden = val('voice') === '否';
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
  el('nightCount').textContent = '每周 '+entries.filter(entry=>entry.enabled.checked).length+' 天';
  el('guildMeta').replaceChildren(...[val('region'),val('edition'),el('classicEdition').hidden ? '' : val('branch'),val('identity'),mode].filter(Boolean).map(text=>make('span',text)));
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
    const spec = GuildRecruitArt.getSpec(need.className,need.spec);
    const role = visuals.gameMark(GuildRecruitArt.getRole(need.role));
    const portrait = spec.icon || cls.icon;
    if (portrait) {
      const img = document.createElement('img'); img.src = '../../'+portrait; img.alt=''; img.className='recruit-portrait'; line.append(img);
    }
    const text = make('div');
    const title = make('b',need.className+' · '+need.spec);
    if (cls.color) title.style.color = cls.color;
    text.append(title,visuals.label(need.role,role.src,role.color));
    line.append(text);
    if (mode==='团队副本' && need.priority) line.append(make('span',need.priority+'需求','priority'));
    needHost.append(line);
  }
  if (!needs.length && !el('recruitPicker').hidden) needHost.append(make('p','尚未指定职业缺口','muted'));
  if (mode==='大秘境') needHost.append(detail('大秘境分数',val('score')==='自定义' ? val('scoreText')||'待确认' : val('score')));
  if (mode==='PvP') needHost.append(detail('队伍形式',val('bracket')));

  const schedule = el('readSchedule');
  const activeDays = entries.filter(entry=>entry.enabled.checked);
  el('weekCount').textContent = '每周 '+activeDays.length+' 天';
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

  const value = intro.getValue();
  if (value) GuildIntroEditor.render(el('readIntro'),value);
  else el('readIntro').replaceChildren(make('p','尚未填写公会介绍','muted'));

  const rules = checked('ruleChoices').filter(rule=>rule!=='其他约定');
  el('readRules').replaceChildren(detail('装备分配',val('loot')));
  if (val('lootNote')) el('readRules').append(make('p',val('lootNote'),'preserve'));
  if (rules.length) el('readRules').append(tags(rules));
  if (!el('ruleExtra').hidden && val('rules')) el('readRules').append(make('p',val('rules'),'preserve'));

  const progress = GuildChoices.progress();
  el('readProgressPanel').hidden = !progress.length;
  el('readProgress').replaceChildren();
  for (const entry of progress) {
    const row = make('div',null,'progress-entry');
    const bar = document.createElement('progress'); bar.max=entry.total; bar.value=entry.killed; bar.setAttribute('aria-label',entry.raid+' '+entry.difficulty+'击杀进度');
    row.append(detail(entry.season+' · '+entry.raid,entry.difficulty+' '+entry.killed+' / '+entry.total),bar);
    if (entry.bosses.length) row.append(make('p',entry.bosses.join('、'),'muted'));
    el('readProgress').append(row);
  }
  const voiceTool = val('tool')==='其他' ? val('toolText') : val('tool');
  const voice = val('voice');
  const voiceRow = detail('团队语音',voice === '否' ? '无需语音' : voice === '是' ? '需要语音' : '视情况使用');
  if (voice !== '否' && voiceTool) {
    const value = voiceRow.lastElementChild;
    value.className = 'voice-value';
    value.append(visuals.label(voiceTool,visuals.voiceMark(val('tool')).src));
  }
  const contact = el('readContact'); contact.replaceChildren(voiceRow);
  for (const entry of contacts) {
    if (entry.enabled.checked && entry.visible.checked && entry.account.value.trim()) contact.append(detail(entry.type,entry.account.value.trim()));
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
window.addEventListener('hashchange',()=>setView(location.hash==='#preview'));
syncForm();
setView(location.hash==='#preview');
