// 目录仅用来选择首领。公会自报的资料由宿主另行保存。
window.GuildChoices = (() => {
  'use strict';
  const dict = window.MASTER_DATA_SNAPSHOT;
  let seasons = window.GUILD_REVIEW_RAIDS;
  const roles = { TANK: '坦克', HEALER: '治疗', DAMAGE: '输出' };
  const recruitingModes = ['团队副本', '大秘境', 'PvP'];
  const teams = new Map();
  const records = new Map();
  let historicalProgress = [];
  const lastRaid = new Map();
  const difficultyOptions = ['普通', '英雄', '史诗'];
  let edition, mode, group;
  let season = seasons.find(item => item.current) || seasons[0];
  let raid = season.raids[0];
  let difficulty = '史诗';
  let recruitHost, progressHost;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function button(text, action) {
    const node = element('button', 'subtle-button', text);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }
  function field(parent, label, key) {
    const wrap = element('label', 'choice-field', label);
    const select = document.createElement('select');
    select.dataset.field = key;
    wrap.append(select);
    parent.append(wrap);
    return select;
  }
  function options(select, values, chosen) {
    select.replaceChildren(...values.map(value => new Option(value, value)));
    if (chosen && !values.includes(chosen)) select.add(new Option(chosen,chosen));
    select.value = chosen;
  }

  function blankNeed() {
    return { roles: [], className: '', specs: [], priority: '中' };
  }
  function classRecord(name) {
    return dict.classes.find(item => item.name_zh === name);
  }
  function specsFor(name) {
    const cls = classRecord(name);
    return cls ? dict.specs.filter(spec => spec.class_key === cls.class_key) : [];
  }
  function inferredRoles(need) {
    const entries = specsFor(need.className).filter(item => !need.specs.length || need.specs.includes(item.name_zh));
    const matches = [...new Set(entries.map(item => roles[item.role]).filter(Boolean))];
    return need.specs.length || matches.length === 1 ? matches : [];
  }
  function needs() {
    if (!recruitingModes.includes(mode)) return [];
    return (teams.get(group) || []).filter(need => need.roles.length || need.className).map(need => ({
      ...need, roles: need.roles.length ? need.roles : inferredRoles(need)
    }));
  }
  function addUniqueSpecs(need, selectedRoles) {
    const entries = specsFor(need.className);
    for (const value of selectedRoles) {
      const matching = entries.filter(entry => roles[entry.role] === value);
      if (matching.length === 1 && !need.specs.includes(matching[0].name_zh)) {
        need.specs.push(matching[0].name_zh);
      }
    }
  }
  function groupField(parent, title, key) {
    const group = element('fieldset', 'need-options');
    group.dataset.field = key;
    group.append(element('legend', '', title));
    parent.append(group);
    return group;
  }
  function checkOptions(group, values, selected, artwork, change, empty) {
    const list = element('div', 'need-choices');
    for (const value of values) {
      const label = element('label', 'need-chip');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.value = value;
      check.checked = selected.includes(value);
      const {icon,color} = artwork(value);
      check.onchange = () => {
        change(check.checked ? [...selected,value] : selected.filter(v => v !== value));
        [...group.querySelectorAll('input')].find(input => input.value === value)?.focus({preventScroll:true});
      };
      label.append(check,GuildChoiceVisuals.label(value,icon,color));
      list.append(label);
    }
    if (!values.length) list.append(element('span','muted',empty));
    group.replaceChildren(group.firstElementChild,list);
  }
  function renderNeeds() {
    const list = teams.get(group);
    recruitHost.replaceChildren();
    if (!recruitingModes.includes(mode)) return;
    if (edition !== '正式服') {
      recruitHost.append(element('p', 'muted', '此版本的职业专精词表尚未收录，可先选择招募职责。'));
    }
    for (const need of list) {
      const row = element('div', 'picker-row');
      const line = element('div', 'field-line');
      const cls = field(line, '职业', 'class');
      const role = groupField(line, '职责（可多选）', 'role');
      const spec = groupField(line, '专精（可多选）', 'spec');
      const priority = field(line, '需求度', 'priority');
      options(priority, ['高', '中', '低'], need.priority);
      GuildChoiceVisuals.decoratePriority(priority);
      function sync() {
        const matching = dict.classes.filter(item => need.roles.every(value =>
          specsFor(item.name_zh).some(entry => roles[entry.role] === value)));
        options(cls, edition === '正式服' ? matching.map(item => item.name_zh) : [], need.className);
        cls.add(new Option(edition === '正式服' ? '职业不限' : '词表待补充', ''), 0);
        cls.value = need.className;
        cls.disabled = edition !== '正式服';
        GuildChoiceVisuals.decorate(cls, value => GuildChoiceVisuals.gameMark(GuildRecruitArt.getClass(value)));
        const entries = specsFor(need.className);
        const availableRoles = entries.length ? Object.values(roles).filter(value => entries.some(entry => roles[entry.role] === value)) : Object.values(roles);
        checkOptions(role, [...new Set([...availableRoles,...need.roles])], need.roles, GuildRecruitArt.getRole, values => {
          const added = values.filter(value => !need.roles.includes(value));
          need.roles = values;
          need.specs = need.specs.filter(name => {
            const entry = entries.find(item => item.name_zh === name);
            return !entry || values.includes(roles[entry.role]);
          });
          addUniqueSpecs(need, added);
          sync();
        });
        const allowedSpecs = entries.filter(entry => !need.roles.length || need.roles.includes(roles[entry.role])).map(entry => entry.name_zh);
        checkOptions(spec, [...new Set([...allowedSpecs,...need.specs])], need.specs,
          value => GuildRecruitArt.getSpec(need.className,value), values => { need.specs = values; sync(); },
          need.className ? '专精待确认' : '先选职业');
        priority.dataset.level = need.priority;
      }
      cls.onchange = () => {
        need.className = cls.value;
        need.specs = [];
        addUniqueSpecs(need, need.roles);
        sync();
      };
      priority.onchange = () => { need.priority = priority.value; priority.dataset.level = priority.value; };
      sync();
      row.append(line, button('移除需求', () => {
        list.splice(list.indexOf(need), 1);
        renderNeeds();
        recruitHost.querySelector('[data-add-need]').focus();
      }));
      recruitHost.append(row);
    }
    const add = button('添加招募需求', () => {
      list.push(blankNeed());
      renderNeeds();
      const rows = recruitHost.querySelectorAll('.picker-row');
      rows[rows.length - 1].querySelector('select').focus();
    });
    add.dataset.addNeed = '';
    recruitHost.append(add);
  }

  function progress() {
    if (edition !== '正式服') return [];
    return [...records.values()].map(entry => ({
      season: seasonLabel(entry.season), raid: entry.raid.name, difficulty: entry.difficulty,
      killed: entry.bosses.size, total: entry.raid.bosses.length,
      bosses: [...entry.bosses]
    })).concat(historicalProgress.map(entry => ({...entry,killed:entry.bosses.length,total:null})));
  }
  function seasonLabel(item) {
    return [item.version,item.name].filter(Boolean).join(' · ');
  }
  function renderProgress() {
    progressHost.replaceChildren();
    if (edition !== '正式服') {
      progressHost.append(element('p', 'muted', '这个版本的赛季与副本目录尚未收录。'));
      return;
    }
    const line = element('div', 'field-line');
    const seasonSelect = field(line, '版本与赛季', 'season');
    const raidSelect = field(line, '副本', 'raid');
    const difficultySelect = field(line, '难度', 'difficulty');
    seasonSelect.id = 'progressSeason'; raidSelect.id = 'progressRaid'; difficultySelect.id = 'progressDifficulty';
    for (const item of seasons) seasonSelect.add(new Option(seasonLabel(item) + (item.current ? '（当前赛季）' : ''), item.name));
    for (const version of window.GUILD_REVIEW_UNLISTED_VERSIONS) {
      if (seasons.some(item=>item.version===version)) continue;
      const option = new Option(version+' · 团本待收录','');
      option.disabled = true;
      seasonSelect.add(option);
    }
    seasonSelect.value = season.name;
    options(raidSelect, season.raids.map(item => item.name), raid.name);
    options(difficultySelect, difficultyOptions, difficulty);
    function changeContext(focusId) {
      renderProgress();
      document.getElementById(focusId).focus();
    }
    seasonSelect.onchange = () => {
      season = seasons.find(item => item.name === seasonSelect.value);
      raid = lastRaid.get(season.id) || season.raids[0];
      changeContext(seasonSelect.id);
    };
    raidSelect.onchange = () => {
      raid = season.raids.find(item => item.name === raidSelect.value);
      lastRaid.set(season.id, raid);
      changeContext(raidSelect.id);
    };
    difficultySelect.onchange = () => { difficulty = difficultySelect.value; changeContext(difficultySelect.id); };
    const id = raid.id + ':' + difficulty;
    const checks = element('fieldset', 'choice-set');
    checks.append(element('legend', '', '已击杀首领'));
    const bosses = element('div', 'boss-checks');
    const status = element('output', 'progress-tally');
    status.setAttribute('aria-live', 'polite');
    const actions = element('div', 'choice-tags');
    const otherRecords = element('div', 'choice-tags');
    const checkboxes = [];
    // Undefined = 尚未自报。空集合仅由“确认零击杀”明确创建。
    function store(marked) {
      records.set(id, {season, raid, difficulty, bosses:marked});
    }
    const zero = button('确认零击杀', () => { store(new Set()); syncProgress(); });
    const clear = button('清除此项进度', () => { records.delete(id); syncProgress(); });
    actions.append(status, zero, clear);
    function syncProgress() {
      const current = records.get(id);
      for (const box of checkboxes) box.checked = !!current?.bosses.has(box.value);
      status.textContent = current ? '自报进度 ' + current.bosses.size + ' / ' + raid.bosses.length :
        '尚未填写 · 共 ' + raid.bosses.length + ' 位首领';
      zero.hidden = !!current;
      clear.hidden = !current;
      otherRecords.replaceChildren();
      const others = [...records.entries()].filter(([key]) => key !== id);
      if (others.length) otherRecords.append(element('span', 'muted', '其他已填进度'));
      for (const [, entry] of others) {
        const text = [seasonLabel(entry.season),entry.raid.name,entry.difficulty,entry.bosses.size+'/'+entry.raid.bosses.length].join(' · ');
        otherRecords.append(button(text, () => {
          season = entry.season; raid = entry.raid; difficulty = entry.difficulty;
          lastRaid.set(season.id, raid);
          changeContext('progressRaid');
        }));
      }
      for (const entry of historicalProgress) {
        const text = [entry.season,entry.raid,entry.difficulty].join(' · ');
        otherRecords.append(element('span','muted',text+'（历史目录）'),button('移除 '+text,()=>{
          historicalProgress = historicalProgress.filter(record=>record!==entry);
          syncProgress();
        }));
      }
    }
    for (const name of raid.bosses) {
      const label = element('label','boss-choice');
      const check = document.createElement('input');
      check.type = 'checkbox'; check.value = name;
      check.onchange = () => {
        const marked = new Set([...records.get(id)?.bosses || []].filter(name=>!raid.bosses.includes(name)));
        for (const box of checkboxes) if (box.checked) marked.add(box.value);
        if (marked.size) store(marked); else records.delete(id);
        syncProgress();
      };
      checkboxes.push(check);
      label.append(check, document.createTextNode(name));
      bosses.append(label);
    }
    checks.append(bosses);
    progressHost.append(line, checks, actions, otherRecords);
    syncProgress();
  }

  function update(nextEdition,nextMode) {
    const branch = nextEdition === '怀旧服' ? document.getElementById('branch')?.value : '';
    const nextGroup = [nextEdition,branch,nextMode].join('/');
    if (group === nextGroup) return;
    const editionChanged = edition !== nextEdition;
    edition = nextEdition; mode = nextMode; group = nextGroup;
    if (!teams.has(group)) teams.set(group, [blankNeed()]);
    renderNeeds();
    if (editionChanged) renderProgress();
  }
  function restore(needRows,progressRows,liveCatalog) {
    teams.clear();
    records.clear();
    lastRaid.clear();
    historicalProgress = [];
    seasons = liveCatalog?.length ? liveCatalog : window.GUILD_REVIEW_RAIDS;
    season = seasons.find(item=>item.current) || seasons[0];
    raid = season.raids[0];
    difficulty = '史诗';
    const selectedEdition = document.getElementById('edition').value;
    const selectedMode = document.getElementById('mode').value;
    const branch = selectedEdition==='怀旧服' ? document.getElementById('branch').value : '';
    const key = [selectedEdition,branch,selectedMode].join('/');
    teams.set(key,needRows.length ? needRows.map(item => ({
      className:item.className, priority:item.priority,
      roles:item.roles || (item.role ? [item.role] : []),
      specs:item.specs || (item.spec ? [item.spec] : [])
    })) : [blankNeed()]);
    for (const entry of progressRows) {
      const s = seasons.find(item=>item.name===entry.season || seasonLabel(item)===entry.season);
      const r = s?.raids.find(item=>item.name===entry.raid);
      if (r && difficultyOptions.includes(entry.difficulty)) {
        records.set(r.id+':'+entry.difficulty,{season:s,raid:r,difficulty:entry.difficulty,bosses:new Set(entry.bosses)});
      } else {
        historicalProgress.push({...entry,bosses:[...entry.bosses]});
      }
    }
    group = edition = undefined;
    update(selectedEdition,selectedMode);
  }
  function getNeeds() {
    if (!recruitingModes.includes(mode)) return [];
    return (teams.get(group) || []).filter(need => need.roles.length || need.className).map(need => {
      const {className,priority,roles,specs} = need;
      if (roles.length <= 1 && specs.length <= 1) return {className,priority,role:roles[0] || '',spec:specs[0] || ''};
      return {className,priority,roles:[...roles],specs:[...specs]};
    });
  }
  function init(demo) {
    recruitHost = document.getElementById('recruitPicker');
    progressHost = document.getElementById('progressPicker');
    if (demo) {
      const sample = {...blankNeed(),className:'德鲁伊',specs:['平衡'],priority:'高'};
      const warriorExample = new URLSearchParams(location.search).get('sample') === 'warrior';
      teams.set('正式服//团队副本', warriorExample ? [
        {className:'战士',roles:['坦克','输出'],specs:['防护','武器','狂怒'],priority:'高'},
        {...blankNeed(),className:'武僧',specs:['织雾'],priority:'中'},
        {...sample,priority:'低'}
      ] : [sample]);
    }
    update(document.getElementById('edition').value, document.getElementById('mode').value);
  }
  return { init, update, needs, progress, restore, getNeeds };
})();
