/* Public records already cleared for display by /api/guild-reports/public. */
(function () {
  'use strict';
  const difficulties = { normal: '普通', heroic: '英雄', mythic: '史诗' };
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const teamName = label => label ? (/^\d+$/.test(label) ? label + ' 团' : label) : '团号未注明';
  const time = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  const when = value => time.format(new Date(value));
  const dateOrder = (left, right) => Date.parse(left) - Date.parse(right);
  const guildPage = id => '?guild=' + encodeURIComponent(id);
  const reportPage = id => '?report=' + encodeURIComponent(id);
  const wcl = (snapshot, kill) => {
    if (!/^[a-z0-9]{10,20}$/i.test(snapshot.reportCode) || !Number.isSafeInteger(kill.fightId) || kill.fightId < 1) return null;
    return 'https://www.warcraftlogs.com/reports/' + snapshot.reportCode + '#fight=' + kill.fightId;
  };
  // Keep team, raid, season and difficulty intact even when the same boss appears in multiple reports.
  function progress(reports, filters) {
    const groups = new Map();
    for (const report of reports) {
      const s = report.snapshot;
      if (filters.season && s.seasonId !== filters.season || filters.team && teamName(s.teamLabel) !== filters.team) continue;
      for (const kill of s.kills) {
        if (!difficulties[kill.difficulty] || filters.difficulty && filters.difficulty !== kill.difficulty) continue;
        const key = JSON.stringify([s.region, s.seasonId, s.raidId, s.teamLabel || report.id, kill.difficulty]);
        let group = groups.get(key);
        if (!group) {
          group = { snapshot: s, difficulty: kill.difficulty, bosses: new Map(), catalogChanged: false };
          groups.set(key, group);
        }
        const known = group.snapshot.bosses;
        if (s.bosses.length !== known.length || s.bosses.some(b => !known.some(other => other.id === b.id))) group.catalogChanged = true;
        const previous = group.bosses.get(kill.bossId);
        if (!previous || dateOrder(kill.killedAt, previous.kill.killedAt) < 0) group.bosses.set(kill.bossId, { kill, report });
      }
    }
    return Array.from(groups.values()).map(group => {
      const milestones = Array.from(group.bosses.values()).sort((a, b) => dateOrder(a.kill.killedAt, b.kill.killedAt));
      const complete = !group.catalogChanged && group.snapshot.bosses.length > 0 &&
        group.snapshot.bosses.every(b => group.bosses.has(b.id));
      return { ...group, milestones, complete };
    });
  }
  if (typeof module === 'object' && module.exports) { module.exports = { progress, wcl }; return; }

  const root = document.getElementById('battleContent');
  const node = (tag, text, cls) => {
    const el = document.createElement(tag);
    if (text != null) el.textContent = text;
    if (cls) el.className = cls;
    return el;
  };
  const meta = text => node('p', text, 'battle-meta');
  function link(text, href, external = false) {
    const a = node('a', text, 'battle-link');
    a.href = href;
    if (external) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    return a;
  }
  function section(title) {
    const el = node('section');
    el.append(node('h2', title));
    return el;
  }
  function list(items, row) {
    const ul = node('ul', null, 'battle-list');
    for (const item of items) { const li = node('li'); li.append(...row(item)); ul.append(li); }
    return ul;
  }
  function select(label, values, chosen, onChange, all = '全部') {
    const wrapper = node('label', label);
    const input = node('select', null, 'form-select');
    input.add(new Option(all, ''));
    for (const [value, caption] of values) input.add(new Option(caption, value));
    input.value = chosen;
    input.onchange = () => onChange(input.value);
    wrapper.append(input);
    return wrapper;
  }
  function renderGuild(reports) {
    if (!reports.length) { root.replaceChildren(node('h1','公会战报'), meta('这个公会还没有公开战报。')); return; }
    const heading = reports[0].guildName;
    document.title = heading + ' · 公会战报 · 魔兽管家';
    const filters = { season: '', team: '', difficulty: '' };
    const seasons = new Map(reports.map(r => [r.snapshot.seasonId, r.snapshot.seasonName]));
    const teams = new Set(reports.map(r => teamName(r.snapshot.teamLabel)));
    const filterBar = node('div', null, 'battle-filters');
    const content = node('div');
    function change(key, value) { filters[key] = value; draw(); }
    filterBar.append(
      select('赛季', seasons, filters.season, value => change('season', value)),
      select('团队', [...teams].map(t => [t,t]), '', value => change('team', value)),
      select('难度', Object.entries(difficulties), '', value => change('difficulty', value))
    );
    root.replaceChildren(node('h1', heading), meta('公会已发布的团本战绩 · 北京时间'), filterBar, content);
    function draw() {
      const groups = progress(reports, filters);
      if (!groups.length) { content.replaceChildren(meta('当前筛选下没有已发布的击杀记录。')); return; }
      const cards = section('团本进度');
      const grid = node('div', null, 'battle-grid');
      const timeline = [];
      for (const group of groups) {
        const s = group.snapshot;
        const card = node('article', null, 'battle-panel');
        const count = group.bosses.size;
        const caption = group.catalogChanged ? count + ' 位已收录首领' : count + ' / ' + s.bosses.length + ' 位首领';
        card.append(node('h3', s.raidName + ' · ' + difficulties[group.difficulty]), meta(s.seasonName + ' · ' + teamName(s.teamLabel)),
          node('strong', caption, 'battle-total'));
        if (group.complete) card.append(meta('已有全通击杀记录'));
        if (!s.teamLabel) card.append(meta('团号未注明，仅统计本场。'));
        grid.append(card);
        const events = group.milestones.map(({kill, report}) => ({title:'已收录最早击杀 · ' + kill.bossName, at:kill.killedAt, report, diff:group.difficulty}));
        timeline.push(...events);
        if (group.complete) timeline.push({...events[events.length-1], title:'全通 · ' + s.raidName});
      }
      cards.append(grid);
      const moments = section('里程碑');
      timeline.sort((a,b) => dateOrder(b.at,a.at));
      moments.append(list(timeline, event => [
        link(event.title, reportPage(event.report.id)),
        meta([event.report.snapshot.seasonName,teamName(event.report.snapshot.teamLabel),difficulties[event.diff],when(event.at)].join(' · '))
      ]));
      const history = section('活动战报');
      const matching = reports.filter(({snapshot:s}) => (!filters.season || filters.season === s.seasonId) &&
        (!filters.team || filters.team === teamName(s.teamLabel)) && (!filters.difficulty || s.kills.some(k => k.difficulty === filters.difficulty)));
      history.append(list(matching, r => [link(r.snapshot.raidName + ' · ' + teamName(r.snapshot.teamLabel), reportPage(r.id)), meta(when(r.snapshot.reportStartAt))]));
      content.replaceChildren(cards, moments, history);
    }
    draw();
  }
  function renderReport(report) {
    const s = report.snapshot;
    document.title = s.raidName + ' · ' + report.guildName + ' · 魔兽管家';
    const back = link('← 公会主页', guildPage(report.guildId));
    back.className = 'btn btn-sm';
    root.replaceChildren(back, node('h1', s.raidName + '战报'),
      meta([report.guildName,teamName(s.teamLabel),s.seasonName,when(s.reportStartAt) + '（北京时间）'].join(' · ')));
    if (report.message) root.append(node('blockquote', report.message, 'battle-message'));
    const fights = section('首领击杀');
    fights.append(list([...s.kills].sort((a,b) => dateOrder(a.killedAt,b.killedAt)), k => {
      const url = wcl(s,k);
      return [node('strong', k.bossName + ' · ' + difficulties[k.difficulty]), meta(when(k.killedAt)),
        ...(url ? [link('查看 WCL 战斗', url, true)] : [])];
    }));
    root.append(fights, meta('战斗日志核对于 ' + when(s.verifiedAt) + '（北京时间）'));
  }
  let generation = 0;
  async function load() {
    const request = ++generation;
    const params = new URLSearchParams(location.search);
    const id = params.get('report'), guild = params.get('guild');
    root.setAttribute('aria-busy','true');
    root.replaceChildren(meta('正在读取已发布战报…'));
    try {
      if ((id && guild) || !uuid.test(id || guild || '')) throw new Error('这个分享链接不完整。');
      const get = async query => {
        const response = await fetch('/api/guild-reports/public?' + query, {cache:'no-store',credentials:'omit'});
        if (response.status === 404) throw new Error('这篇战报尚未公开或已撤回。');
        if (!response.ok) throw new Error('战报暂时无法读取，请稍后重试。');
        return response.json();
      };
      if (id) {
        const data = await get(new URLSearchParams({id}));
        if (request === generation) renderReport(data.report);
      } else {
        const unique = new Map();
        let offset = 0;
        do {
          const data = await get(new URLSearchParams({guildId:guild,offset,limit:100}));
          if (request !== generation) return;
          for (const report of data.reports) unique.set(report.id, report);
          if (!data.hasMore) break;
          if (!data.reports.length) throw new Error('分页读取中断，请重新载入。');
          offset += data.reports.length;
        } while (true);
        renderGuild([...unique.values()].sort((a,b) => dateOrder(b.snapshot.reportStartAt,a.snapshot.reportStartAt)));
      }
    } catch (err) {
      if (request !== generation) return;
      const retry = node('button','重新载入','btn');
      retry.onclick = load;
      root.replaceChildren(node('h1','公会战报'), meta(err.message), retry);
    } finally { if (request === generation) root.setAttribute('aria-busy','false'); }
  }
  window.addEventListener('pageshow', e => { if (e.persisted) load(); });
  load();
})();
