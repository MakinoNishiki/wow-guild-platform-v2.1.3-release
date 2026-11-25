/* 国服排行榜，公开查询只在用户打开本页时执行。 */
(() => {
  'use strict';
  const modes = [
    {key:'2v2', name:'2v2竞技场', id:1}, {key:'3v3', name:'3v3竞技场', id:2},
    {key:'battlegrounds', name:'10v10战场', id:3, faction:true},
    {key:'shuffle', name:'单排轮斗', id:4, specialize:true},
    {key:'blitz', name:'战场闪电战', id:5, specialize:true, faction:true}
  ];
  const $ = id => document.getElementById(id);
  const make = (tag, value) => {
    const element = document.createElement(tag);
    if (value != null) element.textContent = value;
    return element;
  };
  const cnDate = new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'});
  const cnTime = new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
  const dateText = (date, fmt) => Number.isFinite(Number(date)) && Number(date)>0 ? fmt.format(new Date(Number(date))) : '—';
  function elapsed(ms) {
    if (!Number.isFinite(ms) || ms<0) return '—';
    const seconds = Math.floor(ms/1000);
    return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
  }
  const pageSize = 25;
  const picks = {realm:'abbendis', dungeon:'249', classId:'6', specId:'250', faction:''};
  const dictionaries = new Map();
  let mode = null, lastMode = modes[0], serial = 0, page = 0, rows = [], classes = [], specs = [];
  async function request(resource,query={}) {
    const search = new URLSearchParams(query);
    const response = await fetch('/api/cn-leaderboards/'+resource+'?'+search,{credentials:'omit'});
    if (!response.ok) throw new Error('榜单暂时不可用');
    const result = await response.json();
    if (!result.data) throw new Error('榜单暂时不可用');
    return result;
  }
  async function dictionary(resource,query={}) {
    const key = resource+'?'+new URLSearchParams(query);
    let cached = dictionaries.get(key);
    if (!cached || Date.now()-cached.at>300000) {
      cached = {at:Date.now(), promise:request(resource,query).then(r=>r.data)};
      dictionaries.set(key,cached);
    }
    try { return await cached.promise; }
    catch (e) { if (dictionaries.get(key)===cached) dictionaries.delete(key); throw e; }
  }
  function makeSelect(id,title,items) {
    const label = make('label',title);
    const select = make('select');
    select.id = 'rb-'+id;
    for (const [value,name] of items) select.add(new Option(name,String(value)));
    select.value = picks[id];
    select.addEventListener('change',()=>{
      picks[id] = select.value;
      void load(id);
    });
    label.append(select);
    return label;
  }
  function ensureChoice(id,items) {
    if (!items.some(([value])=>String(value)===picks[id])) picks[id] = String(items[0]?.[0] ?? '');
  }
  function classText(node,cls) {
    if (!/^#[0-9a-f]{6}$/i.test(cls?.color)) return;
    node.style.setProperty('--rb-class-color',cls.color);
    node.classList.add('rb-class-text');
  }
  function officialURL(pveRealm='',pveDungeon='') {
    if (!mode) {
      const search = new URLSearchParams();
      if (pveRealm) search.set('server',pveRealm);
      if (pveDungeon) search.set('dungeon',pveDungeon);
      return 'https://wow.blizzard.cn/game/pve/leaderboards/#/'+(search.size?'?'+search:'');
    }
    const cls = classes.find(c=>String(c.id)===picks.classId);
    const spec = specs.find(s=>String(s.id)===picks.specId);
    const parts = mode.specialize && cls?.en_name && spec?.en_name ? [mode.key,cls.en_name,spec.en_name] : [mode.key];
    // The official detail paths use "deathknight" and "beastmastery".
    const suffix = mode.id === 1 ? '' : parts.map(part=>encodeURIComponent(part.replace(/[\s-]+/g,''))).join('/')+'/';
    const faction = mode.faction && picks.faction ? '?faction='+picks.faction : '';
    return 'https://wow.blizzard.cn/game/pvp/leaderboards/'+suffix+faction+'#/';
  }
  function paintPages() {
    const start = page*pageSize, pages = Math.ceil(rows.length/pageSize);
    const headings = mode ? ['名次','评分','玩家','职业','阵营','服务器','胜场',mode.specialize?'比赛场次':'败场'] :
      ['名次','钥石层数','用时','队伍','完成日期'];
    const header = make('tr');
    headings.forEach(label=>{ const th = make('th',label); th.scope='col'; header.append(th); });
    $('rbHeaders').replaceChildren(header);
    const trList = rows.slice(start,start+pageSize).map(row=>{
      const tr = make('tr');
      const rank = mode ? row.rank : row.ranking;
      const td = make('td',rank ?? '—');
      if (rank>0 && rank<=3) td.className='rb-medal';
      tr.append(td);
      if (mode) {
        const cls = classes.find(c=>String(c.id)===String(row.class_id));
        const values = [row.rating,row.name,cls?.name,row.faction,row.realm?.name,row.won,mode.specialize?row.played:row.lost];
        values.forEach((v,i)=>{
          const cell=make('td',v ?? '—');
          if (i===1 || i===2) classText(cell,cls);
          tr.append(cell);
        });
      } else {
        const team = make('td');
        team.className='rb-team';
        for (const member of row.members || []) {
          const name = make('span', member.profile?.name || '—');
          name.className='rb-player';
          const spec = specs.find(s=>String(s.id)===String(member.specialization?.id));
          const cls = spec && classes.find(c=>String(c.id)===String(spec.class_id));
          if (cls) {
            name.title = cls.name+' · '+spec.name;
            classText(name,cls);
          }
          team.append(name);
        }
        tr.append(make('td',row.keystone_level ?? '—'), make('td',elapsed(row.duration)),team,make('td',dateText(row.completed_timestamp,cnDate)));
      }
      return tr;
    });
    $('rbRows').replaceChildren(...trList);
    $('rbScroll').hidden = !rows.length;
    $('rbPagination').hidden = pages<=1;
    $('rbPrev').disabled = page===0;
    $('rbNext').disabled = page+1>=pages;
    $('rbPage').textContent = (page+1)+' / '+pages;
  }
  async function load(focusKey) {
    const version = ++serial;
    const current = () => version===serial;
    page=0;
    rows=[];
    $('rbScroll').hidden = $('rbPagination').hidden = $('rbRetry').hidden = true;
    $('rbRows').replaceChildren();
    $('rbCount').textContent = $('rbStamp').textContent = '';
    $('rbPeriod').textContent='国服正式服';
    $('rbTitle').textContent=mode?.name || '地下城队伍';
    $('rbOfficial').href=officialURL();
    $('rbStatus').textContent='正在读取官方榜单…';
    $('rbFilters').replaceChildren();
    try {
      const params = await dictionary('params');
      if (!current()) return;
      classes = params.class;
      specs = params.specializations;
      let resource, query;
      if (!mode) {
        const {realms} = await dictionary('realms');
        if (!current()) return;
        const realmsList=realms.map(r=>[r.slug,r.name]);
        ensureChoice('realm',realmsList);
        if (!picks.realm) throw new Error();
        $('rbFilters').append(makeSelect('realm','服务器',realmsList));
        const data=await dictionary('dungeons',{slug:picks.realm});
        if (!current()) return;
        const dungeons=data.current_leaderboards.map(d=>[d.id,d.name]);
        ensureChoice('dungeon',dungeons);
        const realmName=realmsList.find(([v])=>v===picks.realm)?.[1];
        const dungeonName=dungeons.find(([v])=>String(v)===picks.dungeon)?.[1];
        $('rbOfficial').href=officialURL(realmName,dungeonName);
        if (!dungeons.length) { $('rbStatus').textContent='该服务器当前没有开放的地下城榜单。'; return; }
        $('rbFilters').append(makeSelect('dungeon','地下城',dungeons));
        $('rbTitle').textContent=dungeonName+' · '+realmName;
        resource='runs'; query={slug:picks.realm,leaderboard_id:picks.dungeon};
      } else {
        resource='pvp'; query={pvp_rank:mode.id};
        if (mode.specialize) {
          const available=classes.filter(c=>specs.some(s=>String(s.class_id)===String(c.id))).map(c=>[c.id,c.name]);
          ensureChoice('classId',available);
          const chosen=specs.filter(s=>String(s.class_id)===picks.classId).sort((a,b)=>Number(a.id)-Number(b.id)).map(s=>[s.id,s.name]);
          ensureChoice('specId',chosen);
          if (!picks.specId) throw new Error();
          $('rbFilters').append(makeSelect('classId','职业',available),makeSelect('specId','专精',chosen));
          Object.assign(query,{class_id:picks.classId,specialization_id:picks.specId});
        }
        if (mode.faction) {
          $('rbFilters').append(makeSelect('faction','阵营',[['','双方阵营'],['alliance','联盟'],['horde','部落']]));
          if (picks.faction) query.faction=picks.faction;
        }
        $('rbOfficial').href=officialURL();
      }
      if (focusKey) $('rb-'+focusKey)?.focus({preventScroll:true});
      const {data,readAt}=await request(resource,query);
      if (!current()) return;
      rows=mode ? data.list : data.leading_groups;
      if (!Array.isArray(rows)) throw new Error();
      $('rbPeriod').textContent=mode ? (data.season || '国服正式服') :
        '统计周期　'+dateText(data.period_start_timestamp,cnDate)+' – '+dateText(data.period_end_timestamp,cnDate);
      $('rbCount').textContent=rows.length+(mode?' 位玩家':' 支队伍');
      $('rbStatus').textContent=rows.length?'':(data.in_season===false?'当前不在赛季内。':'此条件下暂无官方排名。');
      $('rbStamp').textContent='来源：魔兽世界国服官网 · 本站读取 '+dateText(readAt,cnTime)+'（北京时间）';
      paintPages();
    } catch {
      if (!current()) return;
      $('rbStatus').textContent='暂时无法读取官方榜单，请重试或查看官方榜单。';
      $('rbRetry').hidden=false;
    }
  }
  function show(hash) {
    mode=modes.find(m=>hash.endsWith('/pvp/'+m.key)) || null;
    if (mode) lastMode=mode;
    $('rbPvp').href='#/rankings/pvp/'+lastMode.key;
    for (const [id,selected] of [['rbPve',!mode],['rbPvp',!!mode]]) {
      if (selected) $(id).setAttribute('aria-current','page');
      else $(id).removeAttribute('aria-current');
    }
    $('rbModes').hidden=!mode;
    for (const link of $('rbModes').children) {
      if (link.dataset.mode===mode?.key) link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    }
    void load();
  }
  for (const m of modes) {
    const link=make('a',m.name);
    link.href='#/rankings/pvp/'+m.key;
    link.dataset.mode=m.key;
    $('rbModes').append(link);
  }
  $('rbRetry').addEventListener('click',()=>{ dictionaries.clear(); void load(); });
  function changePage(direction) {
    page+=direction;
    paintPages();
    $('rbTitle').scrollIntoView({block:'center'});
  }
  $('rbPrev').addEventListener('click',()=>changePage(-1));
  $('rbNext').addEventListener('click',()=>changePage(1));
  window.CnLeaderboards={show};
})();
