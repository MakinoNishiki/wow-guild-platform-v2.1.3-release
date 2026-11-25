// Internal recruitment cards live only in the active guild profile.
window.GuildRecruitment = (() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const panel = byId('gpRecruitment');
  const content = byId('grContent');
  const edit = byId('grEdit');
  const retry = byId('grRetry');
  const save = byId('grSave');
  const cancel = byId('grCancel');
  const status = byId('grStatus');
  let active = null;

  function current(session) {
    return session && session === active && iaHasGuild() && session.guildId === CloudSync.getCurrentGuild()?.id &&
      session.userId === CloudSync.getCachedUser()?.id;
  }

  function clearFrame() {
    active?.observer?.disconnect();
    content.replaceChildren();
  }

  function reset() {
    clearFrame();
    active = null;
    panel.hidden = true;
    edit.hidden = retry.hidden = byId('grActions').hidden = true;
    status.textContent = '';
  }

  function form() { return content.firstElementChild?.contentWindow?.GuildRecruitmentForm; }
  function dirty() { return !!(active?.editing && form()?.isDirty()); }
  function busy() { return !!active?.saving; }

  function buttons(session) {
    const allowed = GuildRoles.can('edit-card');
    edit.hidden = !allowed || !session.loaded || session.editing;
    edit.textContent = session.row?.card ? '编辑招募卡' : '填写招募卡';
    byId('grActions').hidden = !allowed || !session.editing;
    save.disabled = !session.formReady || session.saving || session.conflict;
    cancel.disabled = session.saving;
    if (content.firstElementChild) content.firstElementChild.inert = session.saving;
    retry.hidden = !(session.conflict || session.failed);
    retry.textContent = session.conflict ? '读取最新版本' : '重新读取';
  }

  function draw(session) {
    if (!current(session)) return;
    const frame = content.firstElementChild;
    const api = form();
    if (!api) throw new Error('招募卡表单未能加载');
    api.load({guild:CloudSync.getCurrentGuild(), card:session.row.card, canEdit:GuildRoles.can('edit-card'), masterData:window.MasterData});
    api.setView(session.editing ? 'edit' : 'read');
    session.formReady = true;
    buttons(session);
    if (!session.observer) {
      const body = frame.contentDocument.body;
      session.observer = new ResizeObserver(() => {
        if (current(session) && frame.isConnected) frame.style.height = Math.ceil(body.getBoundingClientRect().height) + 'px';
      });
      session.observer.observe(body);
    }
  }

  function display(session, message='') {
    const empty = !session.row.card && !session.editing;
    status.textContent = message || (empty ? '本公会尚未填写招募卡。' : '');
    session.failed = false;
    buttons(session);
    if (empty) {
      clearFrame();
      session.observer = null;
      session.formReady = false;
      return;
    }
    const frame = content.firstElementChild;
    if (form()) { draw(session); return; }
    if (frame) return;
    const next = document.createElement('iframe');
    next.id = 'grFrame';
    next.title = '公会招募资料';
    next.src = 'guild-recruitment.html?v=20261125.173';
    next.onload = () => {
      if (!current(session) || !next.isConnected) return;
      try { draw(session); }
      catch { fail(session, new Error('招募卡表单未能加载，请重新读取')); }
    };
    content.append(next);
  }

  function fail(session, error, editingDenied=false) {
    if (!current(session)) return;
    if (error.status === 401 || error.status === 403) {
      // Membership may have changed since this page opened. Discard on-screen private data.
      reset();
      window.Workspaces?.recheckGuild(editingDenied && error.status === 403);
      return;
    }
    session.failed = true;
    status.textContent = error.message || '暂时无法读取招募卡，请重试。';
    buttons(session);
  }

  async function open() {
    reset();
    const session = active = {userId:CloudSync.getCachedUser()?.id, guildId:CloudSync.getCurrentGuild()?.id,
      editing:false, loaded:false, formReady:false, saving:false, conflict:false, failed:false};
    if (!current(session)) return;
    panel.hidden = false;
    status.textContent = '正在读取招募卡…';
    try {
      const [row] = await Promise.all([CloudSync.readGuildRecruitment(session.guildId), MasterData.init()]);
      if (!current(session)) return;
      session.row = row;
      session.loaded = true;
      display(session);
    } catch (error) { fail(session, error); }
  }

  edit.onclick = () => {
    if (!current(active) || !active.loaded || !GuildRoles.can('edit-card')) return;
    active.editing = true;
    display(active);
  };
  cancel.onclick = () => {
    if (!current(active) || busy()) return;
    if (dirty() && !confirm('放弃这次对招募卡的修改？')) return;
    if (active.conflict) { open(); return; }
    active.editing = false;
    display(active);
    edit.focus();
  };
  retry.onclick = () => {
    if (busy() || (dirty() && !confirm('读取最新版本将放弃这次修改，继续吗？'))) return;
    open();
  };
  save.onclick = async () => {
    const session = active;
    if (!current(session) || !session.editing || busy() || !session.formReady || session.conflict || !GuildRoles.can('edit-card')) return;
    try {
      const card = form().getValue();
      session.saving = true;
      buttons(session);
      status.textContent = '正在保存招募卡…';
      const result = await cloudCrud('guildRecruitment','save',
        {guildId:session.guildId, expectedRevision:session.row.revision, card}, {silentError:true});
      if (!current(session)) return;
      session.row = result.row;
      session.editing = false;
      display(session, '招募卡已保存，本公会成员可查看。');
      edit.focus({preventScroll:true});
      showToast('公会招募卡已保存','success');
    } catch (error) {
      if (!current(session)) return;
      if ([401,403].includes(error.status)) { fail(session,error,true); return; }
      session.conflict = error.status === 409;
      status.textContent = (error.message || '保存失败，请重试') + '。本次填写的内容已保留。';
      showToast(status.textContent, 'error');
    } finally {
      session.saving = false;
      if (current(session)) buttons(session);
    }
  };

  function refreshPermissions() {
    if (!current(active) || !active.loaded || active.saving) return;
    if (active.editing && !GuildRoles.can('edit-card')) {
      active.editing = false;
      display(active, '你的招募卡编辑权限已变更。');
    } else buttons(active);
  }

  function refreshProfile() {
    if (current(active) && active.loaded && !active.editing && form()) draw(active);
  }

  document.addEventListener('visibilitychange', async () => {
    const session = active;
    if (document.hidden || !current(session) || !session.loaded || session.saving) return;
    try {
      const row = await CloudSync.readGuildRecruitment(session.guildId);
      if (!current(session) || session.saving || row.revision <= session.row.revision) return;
      if (!session.editing) { session.row = row; display(session); }
      else {
        session.conflict = true;
        status.textContent = '其他窗口已修改招募卡，本次输入已保留。';
        buttons(session);
      }
    } catch (error) {
      if (error.status === 401 || error.status === 403) fail(session,error);
    }
  });

  return { open, reset, dirty, busy, refreshPermissions, refreshProfile };
})();
