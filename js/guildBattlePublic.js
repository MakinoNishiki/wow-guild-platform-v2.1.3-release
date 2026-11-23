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
  const reportPage = id => '/guild-report.html?report=' + encodeURIComponent(id);
  const fightPage = (report, kill) => reportPage(report.id) + '#fight-' + kill.fightId;
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
  // A later clear can unlock a new achievement for someone who missed the first.
  // Deduplicate recipients inside each filtered set, retaining their earliest supporting fight.
  function honorsIn(reports, filters) {
    const awards = new Map();
    for (const report of reports) {
      const s = report.snapshot;
      if (filters.season && filters.season !== s.seasonId || filters.team && filters.team !== teamName(s.teamLabel)) continue;
      for (const kill of s.kills) {
        if (filters.difficulty && filters.difficulty !== kill.difficulty) continue;
        for (const honor of kill.honors || []) {
          const key = JSON.stringify([s.region, s.seasonId, honor.scope, honor.id]);
          if (!awards.has(key)) awards.set(key, {honor, recipients: new Map()});
          const recipients = awards.get(key).recipients;
          const subject = honor.subject.trim().normalize('NFKC').replace(/\s*-\s*/g, '-').toLowerCase();
          const previous = recipients.get(subject);
          if (!previous || dateOrder(kill.killedAt, previous.kill.killedAt) < 0) recipients.set(subject, {honor, kill, report});
        }
      }
    }
    return [...awards.values()];
  }
  if (typeof module === 'object' && module.exports) { module.exports = { progress, wcl, honorsIn }; return; }

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
  function externalUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  }
  function videoLinks(kill) {
    const links = [];
    for (const video of kill.videos || []) {
      const uri = externalUrl(video.url);
      if (uri) links.push(link('录像 · ' + video.label, uri, true));
    }
    return links;
  }
  function renderAwards(awards) {
    const honors = section('赛季荣誉');
    if (!awards.length) {
      honors.append(meta('当前筛选下暂无已核对的成就。'));
      return honors;
    }
    for (const [scope, title, unit] of [['player', '个人成就', '位获得者'], ['guild', '公会成就', '家公会']]) {
      const groups = awards.filter(group => group.honor.scope === scope);
      if (!groups.length) continue;
      honors.append(node('h3', title));
      for (const {honor, recipients} of groups) {
        const details = node('details', null, 'battle-awards');
        details.append(node('summary', honor.name + ' · ' + recipients.size + ' ' + unit));
        details.append(list([...recipients.values()], entry => [
          node('span', entry.honor.subject), meta(entry.honor.earnedOn + ' · 管理者核对'),
          link('查看对应击杀', fightPage(entry.report, entry.kill))
        ]));
        honors.append(details);
      }
    }
    return honors;
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
  function renderGuild(reports, target = root) {
    if (!reports.length) {
      target.replaceChildren(...(target === root ? [node('h1', '公会战报')] : []), meta('这个公会还没有公开战报。'));
      return;
    }
    const heading = reports[0].guildName;
    if (target === root) document.title = heading + ' · 公会战报 · 魔兽管家';
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
    target.replaceChildren(...(target === root ? [node('h1', heading)] : []), meta('公会已发布的团本战绩 · 北京时间'), filterBar, content);
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
        const events = group.milestones.map(({kill, report}) => ({title:'已收录最早击杀 · ' + kill.bossName, at:kill.killedAt, report, kill, diff:group.difficulty}));
        timeline.push(...events);
        if (group.complete) timeline.push({...events[events.length-1], title:'全通 · ' + s.raidName});
      }
      cards.append(grid);
      const moments = section('里程碑');
      timeline.sort((a,b) => dateOrder(b.at,a.at));
      moments.append(list(timeline, event => [
        link(event.title, fightPage(event.report, event.kill)),
        meta([event.report.snapshot.seasonName,teamName(event.report.snapshot.teamLabel),difficulties[event.diff],when(event.at)].join(' · ')),
        ...videoLinks(event.kill)
      ]));
      const history = section('活动战报');
      const matching = reports.filter(({snapshot:s}) => (!filters.season || filters.season === s.seasonId) &&
        (!filters.team || filters.team === teamName(s.teamLabel)) && (!filters.difficulty || s.kills.some(k => k.difficulty === filters.difficulty)));
      history.append(list(matching, r => [link(r.snapshot.raidName + ' · ' + teamName(r.snapshot.teamLabel), reportPage(r.id)), meta(when(r.snapshot.reportStartAt))]));
      if (target === root) content.replaceChildren(cards, moments, renderAwards(honorsIn(matching, filters)), history);
      else content.replaceChildren(history, moments, cards, renderAwards(honorsIn(matching, filters)));
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
    const fightList = node('ul', null, 'battle-list battle-fights');
    for (const k of [...s.kills].sort((a,b) => dateOrder(a.killedAt,b.killedAt))) {
      const item = node('li');
      item.id = 'fight-' + k.fightId;
      const url = wcl(s,k);
      item.append(node('strong', k.bossName + ' · ' + difficulties[k.difficulty]), meta(when(k.killedAt)));
      const actions = node('div', null, 'battle-fight-links');
      if (url) actions.append(link('查看 WCL 战斗', url, true));
      actions.append(...videoLinks(k));
      item.append(actions);
      if (k.honors?.length) {
        const confirmed = node('div', null, 'battle-fight-honors');
        confirmed.append(node('h3', '本场成就 · 管理者核对'));
        confirmed.append(list(k.honors, honor => {
          const proof = externalUrl(honor.proofUrl);
          return [node('strong', honor.name), node('span', (honor.scope === 'guild' ? '公会 · ' : '角色 · ') + honor.subject),
            meta(honor.earnedOn), ...(proof ? [link('查看凭据', proof, true)] : [])];
        }));
        item.append(confirmed);
      }
      fightList.append(item);
    }
    fights.append(fightList);
    root.append(fights, meta('战斗日志核对于 ' + when(s.verifiedAt) + '（北京时间）'));
    if (/^#fight-\d+$/.test(location.hash)) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }
  let generation = 0;
  async function load(target = root, guildId, isCurrent = () => true) {
    const request = ++generation;
    const params = new URLSearchParams(location.search);
    const id = guildId ? null : params.get('report'), guild = guildId || params.get('guild');
    const current = () => request === generation && isCurrent();
    target.setAttribute('aria-busy','true');
    target.replaceChildren(meta('正在读取已发布战报…'));
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
        if (current()) renderReport(data.report);
      } else {
        const unique = new Map();
        let offset = 0;
        do {
          const data = await get(new URLSearchParams({guildId:guild,offset,limit:100}));
          if (!current()) return;
          for (const report of data.reports) unique.set(report.id, report);
          if (!data.hasMore) break;
          if (!data.reports.length) throw new Error('分页读取中断，请重新载入。');
          offset += data.reports.length;
        } while (true);
        renderGuild([...unique.values()].sort((a,b) => dateOrder(b.snapshot.reportStartAt,a.snapshot.reportStartAt)), target);
      }
    } catch (err) {
      if (!current()) return;
      const retry = node('button','重新载入','btn');
      retry.onclick = () => load(target, guildId, isCurrent);
      target.replaceChildren(...(target === root ? [node('h1', '公会战报')] : []), meta(err.message), retry);
    } finally { if (current()) target.setAttribute('aria-busy','false'); }
  }
  if (root) {
    window.addEventListener('pageshow', e => { if (e.persisted) load(); });
    load();
  } else window.GuildPublished = { load };
})();
