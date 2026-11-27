/* REQ-211: logged-in hubs use the same editors and public report data as existing deep links. */
window.Workspaces = (() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const pages = new Set(['guild','guild-settings','guild-permissions','personal','characters','claims','privacy','assets']);
  const roleNames = { owner:'会长', editor:'编辑', viewer:'团员' };
  let epoch = 0;
  let inline = null;

  function restorePanel() {
    if (!inline) return;
    inline.marker.replaceWith(inline.panel);
    inline.panel.style.display = inline.display;
    inline = null;
  }

  function personalDetail(key) {
    if (byId('userCenterModal').classList.contains('show')) return;
    const panel = byId(key === 'claims' ? 'wclGuildPanel' : 'tab-' + key);
    const display = panel.style.display;
    const marker = document.createComment('个人资料面板原位置');
    panel.before(marker);
    byId('page-' + key).querySelector('.ws-panel-host').append(panel);
    panel.style.display = 'block';
    inline = {panel, marker, display};
    if (key === 'claims') loadWclGuildPanel();
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
    byId('paDisplaySummary').textContent = '';
    byId('paPlanSummary').textContent = '';
    if (!user) return;
    PersonalArchive.planCount(byId('paPlanSummary'),current);
    list.textContent = '正在读取角色…';
    try {
      const data = await CloudSync.wclAccount('characters');
      if (!current()) return;
      list.replaceChildren();
      byId('paDisplaySummary').textContent = data.characters.find(c => c.id === data.displayCharacterId)?.character_name || '仅自己可见';
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
      edit.onclick = () => { if (current() && GuildBattleEditor.canOpen()) GuildBattleEditor.open(select.value); };
    } catch {
      if (!current()) return;
      select.replaceChildren(new Option('活动读取失败',''));
      edit.disabled = false;
      edit.textContent = '重新读取活动';
      edit.onclick = () => { if (current()) { edit.textContent = '打开战报编辑器'; activityPicker(guildId,current); } };
    }
  }

  const profileForm = byId('gpForm');
  const introEditor = GuildIntroEditor.mount(byId('gpIntroEditor'), {label:'公会介绍',id:'guildProfileDesc'});
  let profile = null;

  function profileFields() {
    return {
      description: introEditor.getValue() || null,
      loot_rule_type: byId('guildProfileLootRuleType').value || null,
      loot_rule_text: byId('guildProfileLootRuleText').value.trim() || null,
      claim_mode: byId('guildClaimMode').value,
      show_claimer_label: byId('guildShowClaimerLabel').checked
    };
  }

  function canEditProfile() {
    return GuildRoles.can('settings') || GuildRoles.can('claim-mode');
  }

  function profileControls() {
    const settings = GuildRoles.can('settings');
    introEditor.setDisabled(!settings);
    for (const id of ['guildProfileLootRuleType','guildProfileLootRuleText','guildShowClaimerLabel']) byId(id).disabled = !settings;
    byId('guildClaimMode').disabled = !GuildRoles.can('claim-mode');
  }

  function refreshProfilePermissions() {
    if (!sameProfile()) return;
    byId('wsSettingsRole').textContent = '我的身份 · ' + (GuildRoles.ownRoleInfo()?.name || '正在读取');
    if (!profile.saving) {
      if (profileForm.hidden) byId('gpEdit').hidden = !canEditProfile();
      else profileControls();
    }
    GuildRecruitment.refreshPermissions();
    renderWclBindCard();
  }

  function profileChanges() {
    if (!profile?.original) return {};
    return Object.fromEntries(Object.entries(profileFields()).filter(([key,value]) => profile.original[key] !== value));
  }

  function sameProfile() {
    return profile && profile.guildId === CloudSync.getCurrentGuild()?.id && profile.userId === CloudSync.getCachedUser()?.id;
  }

  function profileDirty() {
    return Object.keys(profileChanges()).length > 0 || !!byId('wclGuildInput').value.trim() || GuildRecruitment.dirty();
  }

  function canLeaveProfile() {
    if (!sameProfile()) return true;
    if (profile.saving || GuildRecruitment.busy()) { showToast('正在保存公会资料','warning'); return false; }
    return !profileDirty() || confirm('内容未保存，确定放弃吗？');
  }

  window.addEventListener('beforeunload', event => {
    if (sameProfile() && (profile.saving || GuildRecruitment.busy() || profileDirty())) { event.preventDefault(); event.returnValue = ''; }
  });

  function readProfile(guild) {
    const label = (id,value) => Array.from(byId(id).options).find(option => option.value === value)?.textContent;
    GuildIntroEditor.render(byId('wsGuildIntro'),guild.description || '尚未填写公会介绍');
    byId('gpRule').textContent = label('guildProfileLootRuleType',guild.loot_rule_type || '') || guild.loot_rule_type;
    byId('gpRuleText').textContent = guild.loot_rule_text || '';
    byId('gpClaims').textContent = (label('guildClaimMode',guild.claim_mode || 'free') || '尚未设置') +
      (guild.show_claimer_label === false ? ' · 隐藏认领人标签' : ' · 显示认领人标签');
    byId('gpRead').hidden = false;
    profileForm.hidden = true;
    byId('gpEdit').hidden = !canEditProfile();
    profile.original = null;
  }

  byId('gpEdit').onclick = () => {
    if (!sameProfile() || !canEditProfile()) return;
    const guild = CloudSync.getCurrentGuild();
    introEditor.setValue(guild.description);
    byId('guildProfileLootRuleType').value = guild.loot_rule_type || '';
    byId('guildProfileLootRuleText').value = guild.loot_rule_text || '';
    byId('guildClaimMode').value = guild.claim_mode || 'free';
    byId('guildShowClaimerLabel').checked = guild.show_claimer_label !== false;
    profile.original = profileFields();
    byId('gpEdit').hidden = byId('gpRead').hidden = true;
    profileForm.hidden = false;
    profileForm.oninput();
    profileControls();
    if (GuildRoles.can('settings')) introEditor.focus(); else byId('guildClaimMode').focus();
  };
  byId('gpCancel').onclick = () => {
    if (!sameProfile() || profile.saving) return;
    readProfile(CloudSync.getCurrentGuild());
    byId('gpEdit').focus();
  };
  profileForm.oninput = () => {
    const custom = byId('guildProfileLootRuleType').value === 'custom';
    byId('guildProfileLootRuleText').required = custom;
    byId('guildProfileCustomHint').hidden = !custom;
    byId('gpStatus').textContent = Object.keys(profileChanges()).length ? '有未保存的修改' : '';
  };
  profileForm.onsubmit = async event => {
    event.preventDefault();
    if (!sameProfile() || !canEditProfile() || profile.saving) return;
    if (GuildRoles.can('settings') && byId('guildProfileLootRuleType').value === 'custom' && !byId('guildProfileLootRuleText').value.trim()) {
      byId('gpStatus').textContent = '请填写自定义分配规则';
      byId('guildProfileLootRuleText').focus();
      return;
    }
    const session = profile;
    const changes = profileChanges();
    if (!Object.keys(changes).length) { byId('gpCancel').click(); return; }
    session.saving = true;
    introEditor.setDisabled(true);
    for (const el of profileForm.elements) el.disabled = true;
    byId('gpStatus').textContent = '正在保存…';
    try {
      await CloudSync.updateGuildProfile(changes);
      if (profile !== session || !sameProfile()) return;
      readProfile(CloudSync.getCurrentGuild());
      GuildRecruitment.refreshProfile();
      byId('gpEdit').focus();
      showToast('公会资料已保存','success');
      renderMembers();
      renderClaimReviewBlock();
    } catch (error) {
      if (profile === session) byId('gpStatus').textContent = '保存失败，请重试。' + (error.message || '');
    } finally {
      session.saving = false;
      for (const el of profileForm.elements) el.disabled = false;
      profileControls();
    }
  };

  function guildHeading(guild) {
    return '「' + guild.name + '」' + (guild.server_name ? ' - ' + guild.server_name : '');
  }

  function profileFacts(guild) {
    byId('settingsServer').textContent = [guild.server_region,guild.server_name].filter(Boolean).join(' · ') || '尚未填写';
    byId('settingsGuildId').textContent = guild.id;
    byId('settingsInviteCode').textContent = guild.invite_code || '未设置';
    byId('settingsInviteCode').disabled = !guild.invite_code;
    byId('dangerZone').hidden = !!CloudSync.isOwner();
  }

  async function enterProfile(user,guild,role) {
    byId('wsSettingsGuild').textContent = guildHeading(guild);
    byId('wsSettingsRole').textContent = '我的身份 · ' + role;
    if (sameProfile() && profile.role === role) return;
    const session = profile = { userId:user.id, guildId:guild.id, role, original:null, saving:false };
    GuildRecruitment.open();
    profileFacts(guild);
    byId('gpLoadStatus').textContent = '正在读取公会资料…';
    byId('gpEdit').disabled = true;
    byId('gpRetry').hidden = true;
    // Do not let a delayed read reset WCL lookup input for the active guild.
    byId('wclGuildInput').value = '';
    byId('wclBindBound').style.display = byId('wclBindUnbound').style.display = 'none';
    byId('gpWclEmpty').hidden = true;
    readProfile(guild);
    try {
      await CloudSync.refreshGuildProfile(() => profile === session && sameProfile());
      if (profile !== session || !sameProfile()) return;
      byId('gpLoadStatus').textContent = '';
      byId('gpEdit').disabled = false;
    } catch {
      if (profile !== session || !sameProfile()) return;
      byId('gpLoadStatus').textContent = '暂时无法刷新，以下为上次读取的资料。';
      byId('gpRetry').hidden = false;
      byId('gpRetry').onclick = () => { profile = null; enterProfile(user,CloudSync.getCurrentGuild(),role); };
    }
    byId('wsSettingsGuild').textContent = guildHeading(guild);
    readProfile(guild);
    profileFacts(guild);
    GuildRecruitment.refreshProfile();
    renderWclBindCard();
  }

  function clearProfile() {
    profile = null;
    GuildRecruitment.reset();
    introEditor.setValue('');
    profileForm.reset();
    profileForm.hidden = true;
    for (const id of ['wsSettingsGuild','wsSettingsRole','settingsInviteCode','settingsGuildId','settingsServer',
      'wsGuildIntro','gpRule','gpRuleText','gpClaims','wclBoundName','wclBoundMeta','wclLookupText']) byId(id).replaceChildren();
    byId('wclGuildInput').value = '';
    byId('gpWclLink').removeAttribute('href');
    byId('wclLookupResult').style.display = 'none';
  }

  async function recheckGuild(checkNewRole) {
    const id = profile?.guildId;
    if (!id || !sameProfile()) return;
    clearProfile();
    if (checkNewRole) {
      try {
        await CloudSync.selectGuild(id);
        iaApplyRoute();
        return;
      } catch { /* A departed member cannot reload this guild. */ }
    }
    if (CloudSync.getCurrentGuild()?.id === id) CloudSync.clearCurrentGuild();
    iaApplyRoute();
  }

  function show(key) {
    const generation = ++epoch;
    restorePanel();
    if (profile && (key !== 'guild-settings' || !sameProfile())) clearProfile();
    PersonalArchive.reset(key);
    if (!pages.has(key)) return;
    const user = window.CloudSync?.getCachedUser(), guild = window.CloudSync?.getCurrentGuild();
    const current = () => generation === epoch && user?.id === CloudSync.getCachedUser()?.id && guild?.id === CloudSync.getCurrentGuild()?.id;
    if (key === 'personal') { overview(user,guild,current); return; }
    if (!user) return;
    if (['privacy','assets','claims'].includes(key)) PersonalArchive.show(key,user,iaHasGuild() ? guild : null,current);
    if (key === 'characters' || key === 'claims') { personalDetail(key); return; }
    if (!guild) return;
    if (key === 'guild-permissions') { loadGuildMembers(); return; }
    const role = GuildRoles.ownRoleInfo()?.name || roleNames[CloudSync.getCurrentMembership()?.role] || '团员';
    if (key === 'guild-settings') {
      enterProfile(user,guild,role);
      return;
    }
    byId('wsGuildName').textContent = guildHeading(guild);
    byId('wsGuildRole').textContent = '我的身份 · '+role;
    const canEdit = GuildBattleEditor.canOpen();
    byId('wsWriteReport').hidden = !canEdit;
    byId('wsEditReport').textContent = '打开战报编辑器';
    if (canEdit) activityPicker(guild.id,current);
    GuildPublished.load(byId('wsPublished'),guild.id,current);
  }
  return { refreshProfilePermissions, owns:key => pages.has(key), show, restorePanel, canLeaveProfile, clearProfile, recheckGuild, inlinePanelActive:() => !!inline };
})();
