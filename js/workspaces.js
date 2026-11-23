/* REQ-211: logged-in hubs use the same editors and public report data as existing deep links. */
window.Workspaces = (() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const pages = new Set(['guild','guild-settings','personal','characters','claims']);
  const roleNames = { owner:'会长', editor:'编辑', viewer:'团员' };
  let epoch = 0;
  let inline = null;

  function restorePanel() {
    if (!inline) return;
    inline.marker.replaceWith(inline.panel);
    inline.panel.style.display = 'none';
    inline = null;
  }

  function personalDetail(key) {
    if (byId('userCenterModal').classList.contains('show')) return;
    const panel = byId('tab-' + key);
    const marker = document.createComment('个人资料面板原位置');
    panel.before(marker);
    byId('page-' + key).querySelector('.ws-panel-host').append(panel);
    panel.style.display = 'block';
    inline = {panel, marker};
    if (key === 'claims') loadMyClaims();
    else { loadWclAccount(); loadUserCharacters(); }
  }

  async function overview(user, guild, current) {
    byId('wsPersonalGuest').hidden = !!user;
    byId('wsPersonalData').hidden = !user;
    byId('wsPlayerName').textContent = user?.user_metadata?.display_name || user?.email?.split('@')[0] || '个人档案';
    byId('wsPlayerId').textContent = user ? (CloudSync.getPlayerId() || '') : '';
    byId('wsPlayerGuild').textContent = guild ? guildDisplayName(guild) : '尚未加入公会';
    const list = byId('wsCharacterPreview');
    list.replaceChildren();
    if (!user) return;
    list.textContent = '正在读取角色…';
    try {
      const data = await CloudSync.wclAccount('characters');
      if (!current()) return;
      list.replaceChildren();
      for (const character of data.characters) {
        const row = document.createElement('p');
        row.textContent = [character.character_name,character.server_name,character.class].filter(Boolean).join(' · ');
        list.append(row);
      }
      if (!list.childElementCount) list.textContent = '尚未登记角色';
    } catch {
      if (current()) list.textContent = '暂时无法读取角色，可在「我的角色」中重试。';
    }
  }

  async function activityPicker(guildId, current) {
    const select = byId('wsActivity'), edit = byId('wsEditReport');
    select.replaceChildren(new Option('正在读取活动…',''));
    edit.disabled = select.disabled = true;
    edit.onclick = null;
    try {
      const options = [];
      for (let offset = 0; ; offset += 500) {
        const {data,error} = await CloudSync.getClient().from('activities')
          .select('id,name,activity_date,raid,team_label').eq('guild_id',guildId)
          .order('activity_date',{ascending:false}).order('id').range(offset,offset+499);
        if (!current()) return;
        if (error) throw error;
        for (const row of data) {
          const title = row.name && row.name !== row.raid ? row.name : '';
          const team = row.team_label && (/^\d+$/.test(row.team_label) ? row.team_label + ' 团' : row.team_label);
          options.push(new Option([row.activity_date, title, row.raid, team].filter(Boolean).join(' · '), row.id));
        }
        if (data.length < 500) break;
      }
      select.replaceChildren(...options);
      if (!options.length) { select.add(new Option('暂无考勤活动','')); return; }
      edit.disabled = select.disabled = false;
      edit.onclick = () => { if (current() && CloudSync.canEdit()) GuildBattleEditor.open(select.value); };
    } catch {
      if (!current()) return;
      select.replaceChildren(new Option('活动读取失败',''));
      edit.disabled = false;
      edit.textContent = '重新读取活动';
      edit.onclick = () => { if (current()) { edit.textContent = '打开战报编辑器'; activityPicker(guildId,current); } };
    }
  }

  function show(key) {
    const generation = ++epoch;
    restorePanel();
    if (!pages.has(key)) return;
    const user = window.CloudSync?.getCachedUser(), guild = window.CloudSync?.getCurrentGuild();
    const current = () => generation === epoch && user?.id === CloudSync.getCachedUser()?.id && guild?.id === CloudSync.getCurrentGuild()?.id;
    if (key === 'personal') { overview(user,guild,current); return; }
    if (!user) return;
    if (key === 'characters' || key === 'claims') { personalDetail(key); return; }
    if (!guild) return;
    const role = roleNames[CloudSync.getCurrentMembership()?.role] || '团员';
    if (key === 'guild-settings') {
      byId('wsSettingsGuild').textContent = guildDisplayName(guild);
      byId('wsSettingsRole').textContent = '我的身份 · '+role;
      byId('wsGuildIntro').textContent = guild.description || '尚未填写公会介绍';
      return;
    }
    byId('wsGuildName').textContent = guildDisplayName(guild);
    byId('wsGuildRole').textContent = '我的身份 · '+role;
    const canEdit = CloudSync.canEdit();
    byId('wsWriteReport').hidden = !canEdit;
    byId('wsEditReport').textContent = '打开战报编辑器';
    if (canEdit) activityPicker(guild.id,current);
    GuildPublished.load(byId('wsPublished'),guild.id,current);
  }
  return { owns:key => pages.has(key), show, restorePanel, inlinePanelActive:() => !!inline };
})();
