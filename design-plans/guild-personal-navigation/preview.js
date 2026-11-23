'use strict';
const el = id => document.getElementById(id);
const content = el('content');
const dialog = el('dialog');
const menu = el('account-menu');
const identity = el('identity');
const site = 'https://wow.ddctl.com/#/team/';
const icon = name => '<img alt="" src="' + (name === 'guild-banner' ? 'guild-banner.svg' : '../../assets/icons/nav/' + name + '.svg') + '">';
const guildPages = new Set(['guild', 'settings', 'dashboard']);
const personalPages = new Set(['person', 'characters', 'claims']);
let unread = true;
let signedIn = true;
let manager = true;
let menuOpener;

function openDialog(title, body) {
  menuOpener = document.activeElement;
  el('dialog-copy').innerHTML = '<h2>' + title + '</h2>' + body;
  dialog.showModal();
  dialog.querySelector('.close').focus();
}
function closeMenu(focus = false) {
  menu.hidden = true;
  identity.setAttribute('aria-expanded', 'false');
  if (focus) identity.focus();
}
function navLink(hash, asset, label, selected) {
  return '<a href="#' + hash + '"' + (selected === hash ? ' aria-current="page"' : '') + '>' + icon(asset) + label + '</a>';
}
function sidebar(page) {
  if (guildPages.has(page)) return '<h2>公会大厅</h2>' + navLink('guild', 'guild-banner', '公会战报', page) + navLink('settings', 'members', '公会设置', page) +
    '<h2>团队管理</h2>' + navLink('dashboard', 'dashboard', '仪表盘', page) +
    [['attendance','attendance','考勤记录'],['members','members','成员管理'],['loot','loot','装备分配'],['wishlist','wishlist','心愿单'],['reports','reports','统计报表']].map(([key,asset,label])=>'<a href="' + site + key + '">' + icon(asset) + label + '</a>').join('');
  if (personalPages.has(page)) return '<h2>个人档案</h2>' + navLink('person','profile','档案总览',page) + navLink('characters','characters','我的角色',page) + navLink('claims','claims','我的认领',page);
  if (page === 'release') return '<h2>站点信息</h2>' + navLink('release','notifications','更新日志',page);
  return '<h2>我的账号</h2>' + navLink('account','password','账号设置',page) + navLink('notifications','notifications','通知',page);
}
function hero(kicker, title, meta, asset) {
  return '<header class="hero"><div class="hero-body"><p class="minor">' + kicker + '</p><h1>' + title + '</h1><p>' + meta + '</p></div><div class="crest" aria-hidden="true">' + icon(asset) + '</div></header>';
}
function panel(title, body) {
  return '<section class="panel"><h2>' + title + '</h2>' + body + '</section>';
}
function fields(rows) {
  return '<dl>' + rows.map(([label,value])=>'<div class="formline"><dt>'+label+'</dt><dd>'+value+'</dd></div>').join('') + '</dl>';
}
const reports = [
  { day:'22', title:'烈毒之渊 · 乌拉特克', boss:'乌拉特克', desc:'史诗 · 一团', note:'最后一次转阶段，坦克把首领带回预定点位，全团完成击杀。' },
  { day:'19', title:'烈毒之渊 · 盘卷祭坛', boss:'盘卷祭坛', desc:'史诗 · 一团', note:'交换站位调整后，第二轮点名处理稳定。' }
];
function reportRows() {
  return reports.map((r,i)=>'<div class="list-row"><div class="stamp"><small>十一月</small>'+r.day+'</div><div><strong>'+r.title+'</strong><span class="sub">'+r.desc+'</span></div><button class="link end" data-report="'+i+'">读战报</button></div>').join('');
}
function guild() {
  return hero('银松远征团','公会战报','国服 · 罗宁　／　第二赛季','guild-banner') +
    '<div class="columns"><section class="panel"><div class="panel-heading"><h2>已发布战报</h2>'+(manager?'<button class="button" data-compose>从活动写战报</button>':'')+'</div>'+reportRows()+'</section>' +
    panel('赛季里程碑','<div class="entryline"><span class="eyebrow">11 月 22 日</span><strong>乌拉特克 · 史诗首杀</strong><div><button class="link" data-report="0">查看对应战报 →</button></div></div><div class="entryline"><span class="eyebrow">11 月 19 日</span><strong>盘卷祭坛 · 史诗首杀</strong></div>') + '</div>';
}
function settings() {
  return hero('银松远征团','公会设置','国服 · 罗宁　／　我的身份：'+(manager?'会长':'团员'),'members')+'<div class="columns">'+
    panel('公会资料',(manager?'<label class="guild-intro">公会介绍<textarea rows="2" aria-label="公会介绍（试排字体）">固定团，每周三晚集合。</textarea></label>':fields([['公会介绍','固定团，每周三晚集合。']]))+fields([['分配制度','按规则掷骰'],['角色认领','审核后认领']]))+
    panel('组织管理','<details><summary>WCL 公会绑定</summary><p>示例公会尚未绑定日志。</p></details>'+(manager?'<details><summary>成员权限</summary><p>霜林 · 会长</p></details>':'')+'<details><summary>切换公会</summary><p>当前加入 1 个公会：银松远征团。</p></details>')+'</div>';
}
function characters() {
  return [['warrior','雾渡','罗宁 · 武器战士'],['monk','松间雨','罗宁 · 踏风武僧']].map(([asset,name,detail])=>'<div class="list-row"><img class="class-icon" alt="" src="../../assets/icons/'+asset+'.svg"><div><strong>'+name+'</strong><span class="sub">'+detail+'</span></div></div>').join('');
}
function person(page) {
  const titles={person:'霜林',characters:'我的角色',claims:'我的认领'};
  const head=hero('个人档案',titles[page],page==='person'?'玩家 ID　霜林#86723':'霜林#86723','characters');
  if (page==='claims') return head+'<div class="stack">'+panel('公会角色',fields([['公会','银松远征团'],['已认领','雾渡 · 罗宁']]))+'</div>';
  if (page==='characters') return head+'<div class="stack">'+panel('已登记角色',characters())+'</div>';
  return head+'<div class="columns">'+panel('我的角色',characters())+
    panel('所属公会','<strong>银松远征团</strong><p>国服 · 罗宁　<span class="role">'+(manager?'会长':'团员')+'</span></p><a class="link" href="#guild">进入公会 →</a>')+'</div>';
}
const headerStudies = {
  home: {name:'首页', file:'home', route:'home', subject:'首排入口卡', y:325,
    note:'沿用首页原有高度，把 WB 字标放到题头右侧，金属细边与下面三张入口卡对齐。'},
  house: {name:'家宅图鉴', file:'house', route:'house/decor', subject:'首张家具卡', y:406,
    note:'书形徽记和淡金边收在原有的 56 像素标题栏内，搜索、筛选和家具保留首屏空间。'},
  lootdrop: {name:'副本掉落', file:'loot', route:'lootdrop', subject:'首张装备卡', y:399,
    note:'宝箱小旗标记掉落图鉴，赛季、首领和装备继续占据正文的主要位置。'}
};
let studyMode = 'study';
function studyImage(page) {
  const study = headerStudies[page];
  const img = el('study-image');
  img.src = study.file + '-' + studyMode + '.png';
  img.alt = study.name + (studyMode === 'study' ? '页头试排' : '正式站原版') + '，含首屏实际内容';
  content.querySelectorAll('[data-study-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.studyMode === studyMode)));
}
function renderStudy(page) {
  const study = headerStudies[page];
  content.innerHTML = '<section class="study"><div class="study-heading"><div><h1>'+study.name+' · 页头对照</h1><p>'+study.note+'</p></div><a class="button" href="https://wow.ddctl.com/#/'+study.route+'" target="_blank" rel="noopener">打开正式站 ↗</a></div>' +
    '<figure><figcaption><div class="periods" role="group" aria-label="对照版本"><button data-study-mode="current">当前线上</button><button data-study-mode="study">页头试排</button></div><span>1366 × 768 截图 · '+study.subject+'距页面顶部 '+study.y+' px</span></figcaption><img id="study-image" width="1334" height="655" alt=""></figure></section>';
  studyImage(page);
}
function render() {
  const hash=location.hash.slice(1);
  const page=(!hash||!['guild','settings','dashboard','person','characters','claims','account','release','notifications',...Object.keys(headerStudies)].includes(hash))?'guild':hash;
  closeMenu();
  closeQuick();
  for(const [id,active] of [['guild-nav',guildPages.has(page)],['person-nav',personalPages.has(page)],['release-nav',page==='release'],['home-nav',page==='home'],['house-nav',page==='house'],['loot-nav',page==='lootdrop']]) {
    if(active) el(id).setAttribute('aria-current','page'); else el(id).removeAttribute('aria-current');
  }
  document.querySelectorAll('.unread').forEach(n=>n.hidden=!unread||!signedIn);
  if (Object.hasOwn(headerStudies, page)) { renderStudy(page); return; }
  if(!signedIn && page!=='release'){
    content.innerHTML=panel('已退出演示账号','<p>使用示例会长身份继续预览。</p><button class="button" data-signin>进入演示</button>');
    return;
  }
  let body;
  if (personalPages.has(page)) body=person(page);
  else if (page==='guild') body=guild();
  else if (page==='settings') body=settings();
  else if (page==='dashboard') body=hero('银松远征团','仪表盘','最近活动','dashboard')+'<div class="stack">'+panel('最近战报','<strong>'+reports[0].title+'</strong><p>'+reports[0].desc+'</p><a class="link" href="#guild">查看全部公会战报 →</a>')+'</div>';
  else if (page==='release') body=hero('魔兽管家','更新日志','当前版本　v3.2.0','notifications')+'<div class="stack">'+panel('版本记录','<p>完整记录可在正式站查阅。</p><a class="link" href="https://wow.ddctl.com/#/changelog">打开正式站更新日志 →</a>')+'</div>';
  else if (page==='account') body=hero('霜林','账号设置','仅本人可见','password')+'<div class="stack">'+panel('账号资料',fields([['邮箱','frost@example.org'],['显示名称','霜林']])+'<details><summary>修改密码</summary><p>正式页面沿用当前密码核验和修改后的重新登录流程。此评审稿不接收密码。</p></details>')+'</div>';
  else {
    body=hero('霜林','通知','个人消息','notifications')+'<div class="stack">'+panel('公会通知','<strong>角色认领已通过</strong><p>你已认领银松远征团的「雾渡」。</p><a class="link" href="#claims">查看认领 →</a>')+'</div>';
    unread=false; document.querySelectorAll('.unread').forEach(n=>n.hidden=true);
  }
  const group=guildPages.has(page)?'公会':personalPages.has(page)?'个人档案':page==='release'?'站点信息':'我的账号';
  content.innerHTML='<div class="layout"><nav class="side" aria-label="'+group+'导航">'+sidebar(page)+'</nav><div><p class="trail">魔兽管家 <span>/</span> '+group+'</p>'+body+'</div></div>';
}
identity.addEventListener('click',()=>{
  closeQuick();
  if(!signedIn){signIn(); return;}
  const show=menu.hidden; menu.hidden=!show;identity.setAttribute('aria-expanded',String(show));
  if(show) menu.querySelector('a').focus();
});
identity.addEventListener('keydown',e=>{if(e.key==='ArrowDown'&&menu.hidden){e.preventDefault();identity.click();}});
menu.addEventListener('click',e=>{if(e.target.closest('a'))closeMenu();});
document.addEventListener('click',e=>{if(!identity.contains(e.target)&&!menu.contains(e.target))closeMenu();});
document.addEventListener('focusin',e=>{if(!menu.hidden&&!identity.contains(e.target)&&!menu.contains(e.target))closeMenu();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){e.preventDefault();closeMenu(true);}});
function signIn(){signedIn=true;identity.innerHTML='<span class="avatar">霜</span><b>霜林</b><span class="unread" aria-label="有未读通知"></span><span aria-hidden="true">⌄</span>';render();}
el('logout').addEventListener('click',()=>{closeMenu();signedIn=false;identity.textContent='进入演示';render();identity.focus();});
content.addEventListener('click',e=>{
  const mode = e.target.closest('[data-study-mode]');
  if (mode) {studyMode = mode.dataset.studyMode; studyImage(location.hash.slice(1)); return;}
  const button=e.target.closest('[data-report]');
  if(button){const r=reports[Number(button.dataset.report)];openDialog(r.title,'<p>2026 年 11 月 '+r.day+' 日　·　'+r.desc+'</p><h3>团长寄语</h3><p>'+r.note+'</p>');}
  if(e.target.closest('[data-compose]')&&signedIn&&manager)openDialog('选择考勤活动','<p>每场活动对应一份战报。已有草稿可继续编辑。</p><div class="dialog-actions"><button class="button" data-draft>11 月 23 日 · 烈毒之渊（一团）</button></div>');
  if(e.target.closest('[data-signin]'))signIn();
});
dialog.addEventListener('click',e=>{
  if(e.target.closest('[data-draft]')&&signedIn&&manager){
    el('dialog-copy').innerHTML='<h2>烈毒之渊 · 战报草稿</h2><p>11 月 23 日　／　一团</p><h3>团长寄语</h3><p>在正式编辑器核对击杀、填写寄语后保存或发布。</p><button class="button" data-return>返回战报列表</button>';
    dialog.querySelector('[data-return]').focus();
  }
  if(e.target.closest('[data-return]'))dialog.close();
});
el('view-role').addEventListener('click',()=>{
  manager=!manager;
  el('view-role').textContent=manager?'切换普通团员视角':'切换会长视角';
  render();
});
// The chart uses the site's renderer with a fixed, offline review series.
const endTime = Date.UTC(2026, 10, 23, 15, 40);
const anchors = [680100, 681922, 678410, 682160, 684203, 681820, 687370, 685290, 691450, 689300, 692020, 690830, 692686];
const samples = Array.from({length: 289}, (_, i) => {
  const pos = i / 24, base = Math.floor(pos), fraction = pos - base;
  const next = anchors[Math.min(base + 1, anchors.length - 1)];
  return { at: endTime - (288 - i) * 300000, gold: Math.round(anchors[base] + (next - anchors[base]) * fraction) };
});
const formatClock = new Intl.DateTimeFormat('zh-CN', {timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
window.mountWowTokenTrend(document.querySelector('.quote-card .token-trend'), new Intl.NumberFormat('zh-CN'), formatClock)(samples, endTime);

let activeQuick = null;
let closeTimer;
function closeQuick() {
  clearTimeout(closeTimer);
  if (!activeQuick) return;
  const {button, panel} = activeQuick;
  activeQuick = null;
  button.setAttribute('aria-expanded', 'false');
  panel.hidden = true;
}
for (const entry of document.querySelectorAll('.quick-entry')) {
  const button = entry.querySelector('.quick-trigger');
  const panel = el(button.getAttribute('aria-controls'));
  function open() {
    clearTimeout(closeTimer);
    if (activeQuick?.button === button) return;
    closeMenu();
    closeQuick();
    activeQuick = {entry, button, panel};
    button.setAttribute('aria-expanded', 'true');
    panel.hidden = false;
  }
  entry.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && !dialog.open) open(); });
  entry.addEventListener('pointerleave', e => {
    if (e.pointerType !== 'mouse' || activeQuick?.entry !== entry) return;
    closeTimer = setTimeout(() => {
      if (activeQuick?.entry === entry && !entry.querySelector(':focus-visible')) closeQuick();
    }, 150);
  });
  // Mouse opens on approach, keyboard and touch activate the same button.
  button.addEventListener('click', e => {
    if (activeQuick?.entry === entry && (e.detail === 0 || e.pointerType === 'touch')) closeQuick();
    else open();
  });
  button.addEventListener('keydown', e => { if (e.key === 'ArrowDown') {e.preventDefault(); open(); panel.querySelector('button')?.focus();} });
  entry.addEventListener('focusout', e => {
    if (activeQuick?.entry === entry && e.relatedTarget && !entry.contains(e.relatedTarget)) closeQuick();
  });
}
document.addEventListener('pointerdown', e => {
  if (activeQuick && !activeQuick.entry.contains(e.target)) closeQuick();
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !activeQuick) return;
  const {button, entry} = activeQuick;
  const restore = entry.contains(document.activeElement);
  closeQuick();
  if (restore) button.focus();
});
el('copy-group').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(el('copy-group').dataset.number);
    el('copy-status').textContent = '群号已复制';
  } catch {
    el('copy-status').textContent = '可手动复制群号：' + el('copy-group').dataset.number;
  }
});
el('compare').addEventListener('click',()=>openDialog('顶栏对照','<p>当前布局 · 使用示例身份</p><img src="before-account.png" alt="当前顶栏依次显示版本号、邮箱、用户中心、昵称和会长身份"><p>提案 · 登录时常驻</p><div class="comparison"><strong>霜林　⌄</strong></div><p>个人档案移入主导航，邮箱随头像菜单展开，版本号归入更新日志。会长身份随当前公会显示。</p>'));
dialog.querySelector('.close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
dialog.addEventListener('close',()=>menuOpener?.focus());
window.addEventListener('hashchange',()=>{render();content.focus({preventScroll:true});});
render();
