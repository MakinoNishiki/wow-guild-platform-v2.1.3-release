// 个人环节 3–5。展示选择属于账号，名册与装备属于当前会籍。
window.PersonalArchive = (() => {
  'use strict';
  const el = id => document.getElementById(id);
  let planOrigin = null;
  function node(tag, text, cls) {
    const element = document.createElement(tag);
    if (text != null) element.textContent = text;
    if (cls) element.className = cls;
    return element;
  }
  function action(label, run, cls = 'btn') {
    const button = node('button', label, cls);
    button.type = 'button';
    button.onclick = async () => {
      if (button.disabled) return;
      button.disabled = true;
      try { await run(); }
      catch (e) { showToast(e.message || '操作失败，请重试', 'error'); }
      finally { button.disabled = false; }
    };
    return button;
  }
  function row(title, meta) {
    const item = node('div', null, 'pa-row');
    const label = node('span');
    label.append(node('strong', title), node('small', meta));
    item.append(label);
    return item;
  }
  function link(text, hash) {
    const a = node('a', text, 'btn');
    a.href = hash;
    return a;
  }
  async function read(host, current, task) {
    host.textContent = '正在读取…';
    try {
      const contents = await task();
      if (current()) host.replaceChildren(...contents);
    } catch {
      if (current()) host.replaceChildren(node('p','暂时无法读取。'),action('重试', () => read(host,current,task)));
    }
  }
  async function rows(query) {
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }
  async function allRows(query) {
    const result = [];
    for (let offset = 0; ; offset += 500) {
      const page = await rows(query().range(offset, offset + 499));
      result.push(...page);
      if (page.length < 500) return result;
    }
  }
  async function plans() {
    await CloudSync.reloadData('decorPlan');
    return appData.decorPlans || [];
  }
  async function planCount(host,current) {
    try {
      const data = await plans();
      if (current()) host.textContent = data.length + ' 份家宅方案';
    } catch { if (current()) host.textContent = '进入查看'; }
  }
  const mine = (user,guild) => allRows(() => CloudSync.getClient().from('raid_members')
    .select('id,name,server,class,spec,status').eq('guild_id',guild.id).eq('user_id',user.id).order('id'));
  const characterMeta = c => [c.server_region,c.server_name,c.class].filter(Boolean).join(' · ');
  function privacy(user,guild,current) {
    let account, view = 'visitor', revision = 0, saving = false;
    const choices = el('paChoices'), withdraw = el('paWithdraw'), status = el('paSaveStatus');
    const tabs = [...document.querySelectorAll('[data-pa-view]')];
    async function preview() {
      const generation = ++revision;
      tabs.forEach(t => t.setAttribute('aria-pressed', String(t.dataset.paView === view)));
      await read(el('paPreview'),() => current() && generation === revision, async () => {
        if (view === 'visitor') {
          const response = await fetch('/api/wcl/user/public-character?userId=' + encodeURIComponent(user.id), {cache:'no-store'});
          if (!response.ok) throw Error();
          const { character } = await response.json();
          return [character ? row(character.character_name,characterMeta(character)) : node('p','当前没有对外展示的角色。'),node('small','访客名片预览 · 公开个人主页尚未开放')];
        }
        if (view === 'self') {
          const chars = account?.characters || (await CloudSync.wclAccount('characters')).characters;
          return chars.length ? chars.map(c => row(c.character_name,[characterMeta(c),c.spec,
            c.source === 'wcl' ? ({verified:'WCL 已验证',revoked:'WCL 已解绑',review:'待重新验证'}[c.wcl_verification] || '待验证') : '手动登记'].filter(Boolean).join(' · '))) : [node('p','尚未登记个人角色。')];
        }
        if (!guild) return [node('p','尚未加入公会，没有可预览的公会名册。')];
        const roster = await mine(user,guild);
        const showName = guild.show_claimer_label !== false;
        return [node('p',guildDisplayName(guild)),...roster.map(c => row(c.name,[c.server,c.class,c.spec,
          showName && ('认领人 · ' + (CloudSync.getCurrentMembership()?.display_name || user.user_metadata?.display_name || '已认领用户'))].filter(Boolean).join(' · '))),
          node('small',roster.length ? '仅显示该公会名册中的认领记录。' : '本公会暂无已认领角色。')];
      });
    }
    tabs.forEach(t => { t.onclick = () => { view = t.dataset.paView; preview(); }; });
    async function choose(id) {
      if (saving || !current()) return;
      saving = true;
      withdraw.disabled = true;
      choices.querySelectorAll('button').forEach(b => b.disabled = true);
      status.textContent = '正在保存…';
      let saved;
      try {
        await CloudSync.wclAccount('display',{characterId:id});
        saved = await CloudSync.wclAccount('characters');
        if (!current()) return;
        if ((saved.displayCharacterId || null) !== id) throw Error();
        status.textContent = id ? '展示角色已保存' : '已撤下展示';
      } catch {
        if (!current()) return;
        status.textContent = '未能确认保存结果，请刷新核对。';
      } finally { saving = false; }
      if (current()) { await loadChoices(saved); await preview(); }
    }
    async function loadChoices(saved) {
      withdraw.disabled = true;
      await read(choices,current,async () => {
        const data = saved || await CloudSync.wclAccount('characters');
        if (!current()) return [];
        account = data;
        withdraw.disabled = !data.displayCharacterId;
        withdraw.onclick = () => choose(null);
        if (!data.characters.length) return [node('p','尚未登记个人角色。'),link('添加角色','#/personal/characters')];
        return data.characters.map(c => {
          const selected = c.id === data.displayCharacterId;
          const button = action('', () => selected ? undefined : choose(c.id),'pa-choice');
          button.setAttribute('aria-pressed',String(selected));
          const icon = node('span');
          if (c.class) icon.innerHTML = classIconHtml(c.class);
          button.append(icon,row(c.character_name,characterMeta(c)),node('small',selected ? '展示中' : '选择'));
          return button;
        });
      });
    }
    loadChoices(); preview();
  }
  function ledger(title, items) {
    const box = node('details',null,'pa-ledger');
    const heading = node('summary',title);
    heading.append(node('small',items.length + ' 项'));
    box.append(heading,...(items.length ? items : [node('p','暂无记录')]));
    return box;
  }
  function assets(user,guild,current) {
    read(el('paPlans'),current, async () => {
      const owned = await plans();
      if (!owned.length) return [node('p','还没有家宅方案。'),action('打开方案单',() => {
        planOrigin = user.id;
        iaGoKey('decor-plan');
      })];
      return owned.map(p => {
        const button = action('',async () => {
          await cloudCrud('decorPlan','switch',{id:p.id});
          if (!current()) return;
          if (String(appData.decorPlan?.id) !== String(p.id)) throw Error('该方案已变更，请刷新');
          planOrigin = user.id;
          iaGoKey('decor-plan');
        },'pa-choice');
        button.append(row(p.name,p.items.length + ' 种家具 · 共 ' + p.items.reduce((sum,i) => sum + Number(i.qty),0) + ' 件'),node('span','›'));
        return button;
      });
    });
    read(el('paRecords'),current,async () => {
      if (!guild) return [node('p','加入公会后，可在这里查看已认领角色的团队记录。')];
      const members = await mine(user,guild);
      if (!members.length) {
        const pending = await CloudSync.getMyPendingClaimRequests();
        return [node('p',guildDisplayName(guild)),node('p',pending.length ? '认领申请待审核。' : '当前没有已认领的角色。')];
      }
      const names = new Map(members.map(m => [m.id,[m.name,m.server].filter(Boolean).join(' · ')]));
      const ids = [...names.keys()], db = CloudSync.getClient();
      const [wishes,loots] = await Promise.all([
        allRows(() => db.from('wishlists').select('id,member_id,items').eq('guild_id',guild.id).in('member_id',ids).order('id')),
        allRows(() => db.from('loot_records').select('id,character_id,item_name,obtained_date,raid_name').eq('guild_id',guild.id)
          .in('character_id',ids).eq('item_stats->>status','已分配').order('obtained_date',{ascending:false}).order('id'))
      ]);
      return [node('p',guildDisplayName(guild)),ledger('装备心愿',wishes.flatMap(w => (w.items || [])
        .filter(i => !i.memberId || i.memberId === w.member_id)
        .map(i => row(i.itemName,[names.get(w.member_id),i.obtained ? '已获得' : '尚未获得'].join(' · '))))),
        ledger('已获装备',loots.map(l => row(l.item_name,[names.get(l.character_id),l.obtained_date,l.raid_name].filter(Boolean).join(' · '))))];
    });
  }
  function claims(user,guild,current) {
    read(el('paGuilds'),current,async () => {
      const guilds = await CloudSync.loadUserGuilds();
      if (!guilds.length) return [node('p','尚未加入公会。')];
      return guilds.map(g => {
        const active = guild?.id === g.id;
        const item = row(guildDisplayName(g),active ? '当前公会' : '已加入');
        if (!active) item.append(action('切换',() => handleSwitchGuild(g.id)));
        else if (!CloudSync.isOwner()) item.append(action('退出公会',handleLeaveGuild));
        return item;
      });
    });
    el('paJoin').onsubmit = async event => {
      event.preventDefault();
      const button = event.submitter || el('paJoin').querySelector('button');
      if (button.disabled || !current()) return;
      button.disabled = true;
      const joined = await handleJoinGuild(el('paCode').value,true);
      if (current() && !joined) el('paJoinStatus').textContent = '未加入公会，请核对邀请码后重试。';
      button.disabled = false;
    };
    read(el('paRoster'),current,async () => {
      if (!guild) return [node('p','加入公会后，可在名册中认领角色。')];
      const [roster,pending] = await Promise.all([
        allRows(() => CloudSync.getClient().from('raid_members').select('id,name,server,class,spec,status,user_id').eq('guild_id',guild.id).order('name').order('id')),
        CloudSync.getMyPendingClaimRequests(), GuildRoles.load()
      ]);
      if (!current()) return [];
      const result = [node('p',guildDisplayName(guild))], requests = new Map(pending.map(r => [r.member_id,r.id]));
      for (const m of roster.filter(m => m.user_id === user.id || requests.has(m.id))) {
        const owned = m.user_id === user.id;
        const item = row(m.name,[m.server,m.class,owned ? '已认领' : '待审核'].filter(Boolean).join(' · '));
        item.append(action(owned ? '解除认领' : '撤回申请', async () => {
          if (!current()) return;
          if (owned) await unclaimFromCenter(m.id,m.name);
          else {
            await CloudSync.deleteClaimRequest(requests.get(m.id));
            if (current()) await reloadClaimGovernance();
          }
          if (current()) Workspaces.show('claims');
        }));
        result.push(item);
      }
      if (result.length === 1) result.push(node('p','暂无已认领角色或待审核申请。'));
      if (!GuildRoles.can('claim') && !GuildRoles.can('assign-claim') || guild.claim_mode === 'assign' && !GuildRoles.can('assign-claim')) {
        result.push(node('small','请联系有权限的管理者分配角色。'));
        return result;
      }
      const available = roster.filter(m => !m.user_id && !requests.has(m.id) && m.status !== '离队');
      if (available.length) {
        const select = node('select',null,'form-select');
        select.setAttribute('aria-label','待认领角色');
        for (const m of available) select.add(new Option([m.name,m.server,m.class].filter(Boolean).join(' · '),m.id));
        const claim = action(guild.claim_mode === 'approval' && !GuildRoles.can('assign-claim') ? '申请认领' : '认领角色',async () => {
          await CloudSync.reloadData('members');
          if (current()) claimMember(select.value);
        });
        result.push(select,claim);
      }
      return result;
    });
  }
  function reset(key) {
    if (key !== 'decor-plan') planOrigin = null;
    for (const id of ['paChoices','paSaveStatus','paPreview','paPlans','paRecords','paGuilds','paRoster','paJoinStatus']) el(id).replaceChildren();
    el('paCode').value = '';
    el('paWithdraw').disabled = true;
    el('paJoin').closest('details').open = false;
  }
  function show(key,user,guild,current) {
    if (key === 'privacy') privacy(user,guild,current);
    if (key === 'assets') assets(user,guild,current);
    if (key === 'claims') claims(user,guild,current);
  }
  return {show,reset,planCount,fromAssets:() => !!planOrigin && planOrigin === CloudSync.getCachedUser()?.id};
})();
