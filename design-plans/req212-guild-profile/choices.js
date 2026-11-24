// 本地评审中的自报记录随页面关闭清空；首领目录与公会实际击杀分别处理。
window.GuildChoices = (() => {
  'use strict';
  const dict = window.MASTER_DATA_SNAPSHOT;
  const seasons = window.GUILD_REVIEW_RAIDS;
  const roles = { TANK: '坦克', HEALER: '治疗', DAMAGE: '输出' };
  const recruitingModes = ['团队副本', '大秘境', 'PvP'];
  const teams = new Map();
  const records = new Map();
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
    select.value = chosen;
  }

  function blankNeed() {
    return { role: '', className: '', spec: '', priority: '中' };
  }
  function classRecord(name) {
    return dict.classes.find(item => item.name_zh === name);
  }
  function specsFor(name) {
    const cls = classRecord(name);
    return cls ? dict.specs.filter(spec => spec.class_key === cls.class_key) : [];
  }
  function derivedRole(need) {
    const entries = specsFor(need.className).filter(item => !need.spec || item.name_zh === need.spec);
    const possible = new Set(entries.map(item => roles[item.role]));
    return possible.size === 1 ? [...possible][0] : '';
  }
  function needs() {
    if (!recruitingModes.includes(mode)) return [];
    return (teams.get(group) || []).filter(need => need.role || need.className).map(need => ({
      role: need.role || derivedRole(need) || '职责不限',
      className: need.className || '职业不限',
      spec: need.spec || '专精待确认',
      priority: need.priority
    }));
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
      const role = field(line, '职责', 'role');
      const cls = field(line, '职业', 'class');
      const spec = field(line, '专精', 'spec');
      const priority = field(line, '需求度', 'priority');
      options(priority, ['高', '中', '低'], need.priority);
      function sync() {
        const matching = dict.classes.filter(item => !need.role ||
          specsFor(item.name_zh).some(entry => roles[entry.role] === need.role));
        if (!matching.some(item => item.name_zh === need.className)) need.className = '';
        const allowed = specsFor(need.className).filter(item => !need.role || roles[item.role] === need.role);
        if (!allowed.some(item => item.name_zh === need.spec)) need.spec = '';
        options(role, Object.values(roles), need.role);
        const inferred = derivedRole(need);
        role.add(new Option(inferred ? '自动 · ' + inferred : '职责不限', ''), 0);
        role.value = need.role;
        options(cls, edition === '正式服' ? matching.map(item => item.name_zh) : [], need.className);
        cls.add(new Option(edition === '正式服' ? '职业不限' : '词表待补充', ''), 0);
        cls.value = need.className;
        cls.disabled = edition !== '正式服';
        options(spec, allowed.map(item => item.name_zh), need.spec);
        spec.add(new Option('专精待确认', ''), 0);
        spec.value = need.spec;
        spec.disabled = !need.className;
        const {decorate,gameMark} = GuildChoiceVisuals;
        decorate(role, value => gameMark(GuildRecruitArt.getRole(value || inferred)));
        decorate(cls, value => gameMark(GuildRecruitArt.getClass(value)));
        decorate(spec, value => gameMark(GuildRecruitArt.getSpec(need.className,value)));
      }
      role.onchange = () => { need.role = role.value; sync(); };
      cls.onchange = () => { need.className = cls.value; need.spec = ''; sync(); };
      spec.onchange = () => { need.spec = spec.value; sync(); };
      priority.onchange = () => { need.priority = priority.value; };
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
      bosses: entry.raid.bosses.filter(name => entry.bosses.has(name))
    }));
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
    }
    for (const name of raid.bosses) {
      const label = element('label','boss-choice');
      const check = document.createElement('input');
      check.type = 'checkbox'; check.value = name;
      check.onchange = () => {
        const marked = new Set(checkboxes.filter(box => box.checked).map(box => box.value));
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
  function init() {
    recruitHost = document.getElementById('recruitPicker');
    progressHost = document.getElementById('progressPicker');
    if (!group) {
      const sample = {...blankNeed(),className:'德鲁伊',spec:'平衡',priority:'高'};
      teams.set('正式服//团队副本', [sample]);
    }
    update(document.getElementById('edition').value, document.getElementById('mode').value);
  }
  return { init, update, needs, progress };
})();
