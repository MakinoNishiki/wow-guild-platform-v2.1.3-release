/* REQ-190 逐条读取管理者战报。预览凭据只存在当前弹窗内。 */
(() => {
  'use strict';
  const modalId = 'guildBattleModal';
  const element = id => document.getElementById('guildBattle' + id);
  const difficulties = { normal: '普通', heroic: '英雄', mythic: '史诗' };
  const clock = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  let editor = null;

  function sameIdentity(context) {
    return !!context && CloudSync.getCurrentGuild()?.id === context.guildId &&
      CloudSync.getCachedUser()?.id === context.userId && !!CloudSync.canEdit();
  }

  function active(context) {
    return context === editor && sameIdentity(context);
  }

  function syncContext() {
    const guildId = window.CloudSync?.getCurrentGuild()?.id;
    const link = element('Home');
    link.hidden = !guildId;
    if (guildId) link.href = '/guild-report.html?guild=' + encodeURIComponent(guildId);
    else link.removeAttribute('href');
    if (editor && !sameIdentity(editor)) closeModal(modalId);
  }

  function formatTime(value) {
    const time = value && new Date(value);
    return time && Number.isFinite(time.getTime()) ? clock.format(time) : '时间待核对';
  }

  function publicEvidence(snapshot) {
    if (!snapshot) return '';
    // 每次查询的核对时间会变；关闭保护只比对实际展示的战绩。
    return JSON.stringify([
      snapshot.teamLabel, snapshot.region, snapshot.reportCode, snapshot.reportStartAt, snapshot.reportEndAt,
      snapshot.seasonName, snapshot.raidName,
      (snapshot.kills || []).map(kill => [kill.bossName, kill.difficulty, kill.killedAt, kill.sourceUrl])
    ]);
  }

  function evidenceNode(tag, value) {
    const node = document.createElement(tag);
    node.textContent = value;
    return node;
  }

  function renderEvidence(snapshot) {
    const area = element('Evidence');
    area.replaceChildren();
    if (!snapshot) {
      area.textContent = '核对日志后，可以预览将公开的首领、难度、击杀时间和来源。';
      return;
    }
    const team = snapshot.teamLabel || '未填写团号';
    const teamName = /^\d+$/.test(team) ? team + ' 团' : team;
    const meta = [teamName, snapshot.raidName || '团本待核对', snapshot.seasonName || '赛季待核对', snapshot.region].filter(Boolean);
    area.append(evidenceNode('p', meta.join(' · ')));
    if (snapshot.reportStartAt) {
      area.append(evidenceNode('p', '日志时段（北京时间） ' + formatTime(snapshot.reportStartAt) + ' 至 ' + formatTime(snapshot.reportEndAt)));
    }
    if (snapshot.excludedOtherRaidKills > 0) {
      area.append(evidenceNode('p', '本次日志另有 ' + snapshot.excludedOtherRaidKills + ' 次其他团本的击杀，已排除。'));
    }
    if (!snapshot.kills?.length) {
      area.append(evidenceNode('p', '本场没有可展示的首领击杀。'));
      return;
    }
    const table = document.createElement('table');
    table.setAttribute('aria-label', '战报首领击杀');
    const heading = table.createTHead().insertRow();
    for (const title of ['首领', '难度', '击杀时间（北京时间）', '来源']) {
      const th = evidenceNode('th', title);
      th.scope = 'col';
      heading.append(th);
    }
    const body = table.createTBody();
    for (const kill of snapshot.kills) {
      const row = body.insertRow();
      row.insertCell().textContent = kill.bossName;
      row.insertCell().textContent = difficulties[kill.difficulty] || '待核对';
      row.insertCell().textContent = formatTime(kill.killedAt);
      const cell = row.insertCell();
      const source = parseWclUrl(kill.sourceUrl);
      if (source?.code && source.code === snapshot.reportCode) {
        const link = evidenceNode('a', 'WCL ↗');
        link.href = source.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.setAttribute('aria-label', '打开' + kill.bossName + '的 WCL 战斗日志');
        cell.append(link);
      }
    }
    area.append(table);
  }

  function notice(message, error = false) {
    element('Feedback').textContent = message;
    element('Feedback').classList.toggle('battle-error', error);
  }

  function controls(context) {
    const row = context.row;
    const published = row?.status === 'published';
    const changed = row?.evidenceStatus === 'changed';
    const ready = context.loaded && !context.busy && !context.stale;
    element('State').textContent = !context.loaded ? (context.reloadOffered ? '读取失败' : '正在读取战报状态') :
      context.stale ? '战报状态待核对 · 请重新读取' :
      published ? (changed ? '已发布 · 证据已变更，公开展示已暂停' : '已发布') : row ? '已保存草稿' : '未保存';
    element('Content').hidden = !context.loaded;
    element('Reload').hidden = !context.reloadOffered;
    element('Reload').disabled = !!context.busy;
    element('Preview').disabled = !ready;
    element('Message').disabled = !context.loaded || !!context.busy;
    element('Draft').hidden = !context.loaded || published;
    element('Publish').hidden = !context.loaded;
    element('Draft').disabled = element('Publish').disabled = !ready || !context.previewToken;
    element('Publish').textContent = published ? '更新已发布战报' : '发布战报';
    element('Withdraw').hidden = !published;
    element('Withdraw').disabled = !ready;
    element('Sharing').hidden = !published || changed || !!context.stale;
    if (!element('Sharing').hidden) {
      element('Link').href = '/guild-report.html?report=' + encodeURIComponent(row.id);
    } else {
      element('Link').removeAttribute('href');
      element('ShareUrl').hidden = true;
      element('ShareUrl').value = '';
    }
    element('Modal').querySelectorAll('[data-battle-close]').forEach(button => {
      button.disabled = context.busy === 'save';
    });
  }

  function validateRow(row, context) {
    if (!row?.id || row.guildId !== context.guildId || row.activityId !== context.activityId ||
        !Number.isSafeInteger(row.version) || row.version < 1 || !['draft', 'published'].includes(row.status)) {
      throw new Error('战报回执与当前活动不一致，请重新读取战报。');
    }
    return row;
  }

  async function request(action, context, fields = {}) {
    if (!sameIdentity(context)) throw new Error('登录账号、公会或管理权限已更改，请重新打开活动。');
    const token = await CloudSync.getAccessToken();
    if (!token || !sameIdentity(context)) throw new Error('登录或公会状态已变更，请重新打开活动。');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch('/api/guild-reports/' + action, {
        method: 'POST', cache: 'no-store', signal: controller.signal,
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: context.guildId, activityId: context.activityId, ...fields })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result) {
        const error = new Error(result?.message || '战报请求失败（' + response.status + '），请重试。');
        error.invalidatedVersion = result?.invalidatedVersion;
        throw error;
      }
      return result;
    } catch (error) {
      if (controller.signal.aborted) throw new Error('战报请求超时，请重新核对。');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function current(context) {
    const result = await request('current', context);
    return result.report === null ? null : validateRow(result.report, context);
  }

  // 仅接收自己手中版本的直接后继。其他管理者中间保存过时，不能将本地寄语套用到对方的新版本。
  function applySuspension(context, version) {
    if (context.row?.status === 'published' && Number.isSafeInteger(version) && version === context.row.version + 1) {
      context.row = { ...context.row, version, evidenceStatus: 'changed' };
    } else {
      context.stale = true;
      context.reloadOffered = true;
    }
  }

  async function checkPublishedState(context, version) {
    if (version) {
      applySuspension(context, version);
    } else if (context.row?.status === 'published') {
      // 已被其他管理者暂停时，本次核对不会再次生成暂停回执。
      let row;
      try { row = await current(context); }
      catch (error) {
        if (active(context)) {
          context.stale = true;
          context.reloadOffered = true;
        }
        throw error;
      }
      if (!active(context)) return;
      if (row?.id === context.row.id && row.version === context.row.version) context.row = row;
      else {
        context.stale = true;
        context.reloadOffered = true;
      }
    }
    if (context.stale) throw new Error('其他操作已更新这篇战报，请重新读取。当前寄语已保留。');
  }

  // 这两个适配器仅由 cloudCrud 的 saveCloudData / reloadData 调用。
  async function write(action, payload) {
    const fields = { action, expectedVersion: payload.expectedVersion };
    if (action !== 'withdraw') {
      fields.message = payload.message;
      fields.previewToken = payload.previewToken;
    }
    const result = await request('save', payload, fields);
    return validateRow(result.report, payload);
  }

  async function readBack(payload) {
    const saved = payload.receipt;
    const row = await current(payload);
    const status = payload.action === 'publish' ? 'published' : 'draft';
    if (!row || row.id !== saved.id || row.version !== saved.version || saved.version !== payload.expectedVersion + 1 || row.status !== status ||
        (payload.action !== 'withdraw' && (row.message || '') !== payload.message)) {
      throw new Error('战报保存结果与当前版本不一致，请重新读取战报核对。');
    }
    if (payload.action !== 'withdraw' && row.evidenceStatus !== 'verified') {
      throw new Error('活动来源已发生变化，请重新核对日志。');
    }
    return row;
  }

  async function preview(context) {
    if (!active(context) || context.busy || context.stale) return;
    context.busy = 'preview';
    context.previewToken = null;
    controls(context);
    notice('正在核对活动关联的 WCL 日志…');
    try {
      let result, previewError;
      try { result = await request('preview', context); }
      catch (error) { previewError = error; }
      if (!active(context)) return;
      await checkPublishedState(context, result?.invalidatedVersion || previewError?.invalidatedVersion);
      if (!active(context)) return;
      if (previewError) throw previewError;
      if (!result.previewToken || !result.snapshot || !Array.isArray(result.snapshot.kills)) {
        throw new Error('日志预览不完整，请重新核对。');
      }
      renderEvidence(result.snapshot);
      context.previewToken = result.previewToken;
      context.previewChanged = !!context.row && publicEvidence(result.snapshot) !== publicEvidence(context.row.snapshot);
      notice('请核对下方内容。发布后，访客可通过链接查看战报和团长寄语。');
    } catch (error) {
      if (active(context)) {
        renderEvidence(context.row?.snapshot);
        context.previewChanged = false;
        notice(error.message + (context.row ? ' 当前显示上次保存的内容。' : ''), true);
      }
    } finally {
      if (active(context)) {
        context.busy = null;
        controls(context);
      }
    }
  }

  async function load(context) {
    context.busy = 'load';
    context.loaded = false;
    context.reloadOffered = false;
    context.stale = false;
    context.previewToken = null;
    context.previewChanged = false;
    controls(context);
    notice('正在读取战报…');
    try {
      const row = await current(context);
      if (!active(context)) return;
      context.row = row;
      context.loaded = true;
      element('Message').value = row?.message || '';
      snapshotModalForm(modalId);
      renderEvidence(row?.snapshot);
      notice(row ? '下方是上次保存的内容。请重新核对日志后保存或发布。' : '');
    } catch (error) {
      if (active(context)) {
        context.reloadOffered = true;
        notice(error.message, true);
      }
    } finally {
      if (active(context)) {
        context.busy = null;
        controls(context);
        if (context.loaded && !context.row) await preview(context);
      }
    }
  }

  async function save(action) {
    const context = editor;
    if (!active(context) || context.busy || context.stale || !context.loaded) return;
    if (action === 'withdraw') {
      if (!confirm('撤回后，访客将无法查看这篇战报。未保存的寄语也会放弃。确定撤回吗？')) return;
    } else {
      if (!context.previewToken) return;
      if (action === 'publish' && !confirm('确认将预览中的战绩和团长寄语发布到公会公开主页吗？')) return;
    }
    const payload = {
      guildId: context.guildId, userId: context.userId, activityId: context.activityId,
      expectedVersion: context.row?.version || 0, action,
      message: element('Message').value.trim(), previewToken: context.previewToken
    };
    context.busy = 'save';
    controls(context);
    notice('正在保存并核对战报…');
    try {
      const { row } = await cloudCrud('guildBattleReport', action, payload, { silentError: true });
      if (!active(context)) return;
      context.row = row;
      context.reloadOffered = false;
      context.previewChanged = false;
      element('Message').value = row.message || '';
      snapshotModalForm(modalId);
      renderEvidence(row.snapshot);
      notice(action === 'withdraw' ? '已撤回，访客无法查看这篇战报。' : action === 'publish' ? '战报已发布，可以复制分享链接。' : '草稿已保存，仅管理者可见。');
    } catch (error) {
      if (active(context)) {
        context.previewToken = null;
        context.reloadOffered = true;
        if (error.invalidatedVersion) applySuspension(context, error.invalidatedVersion);
        notice(error.message + ' 本次输入已保留，可重新读取战报核对保存结果。', true);
      }
    } finally {
      if (active(context)) {
        context.busy = null;
        controls(context);
      }
    }
  }

  function clear() {
    editor = null;
    element('Message').value = '';
    element('ShareUrl').value = '';
    element('ShareUrl').hidden = true;
    element('Link').removeAttribute('href');
    element('Evidence').replaceChildren();
    if (document.getElementById('attendanceDetailModal').classList.contains('show')) {
      document.querySelector('#attendanceWclActions summary')?.focus();
    }
  }

  function open(activityId) {
    const context = { guildId: CloudSync.getCurrentGuild()?.id, userId: CloudSync.getCachedUser()?.id, activityId };
    if (!context.guildId || !context.userId || !activityId || !sameIdentity(context)) return;
    editor = context;
    element('Message').value = '';
    element('ShareUrl').hidden = true;
    openModal(modalId);
    element('Modal').querySelector('[data-battle-close]').focus();
    load(context);
  }

  function isDirty() {
    return !!editor?.loaded && (editor.previewChanged || element('Message').value !== (editor.row?.message || ''));
  }

  element('Preview').addEventListener('click', () => preview(editor));
  element('Reload').addEventListener('click', () => {
    if (active(editor) && !editor.busy && (!isDirty() || confirm('重新读取会替换尚未保存的内容，确定继续吗？'))) load(editor);
  });
  element('Modal').querySelectorAll('[data-battle-close]').forEach(button => {
    button.addEventListener('click', () => requestCloseModal(modalId));
  });
  for (const [id, action] of [['Draft', 'draft'], ['Publish', 'publish'], ['Withdraw', 'withdraw']]) {
    element(id).addEventListener('click', () => save(action));
  }
  element('Copy').addEventListener('click', async () => {
    const context = editor;
    if (!active(context) || element('Sharing').hidden) return;
    const url = element('Link').href;
    try {
      await navigator.clipboard.writeText(url);
      if (active(context)) notice('分享链接已复制。');
    } catch {
      if (!active(context) || element('Sharing').hidden) return;
      const field = element('ShareUrl');
      field.hidden = false;
      field.value = url;
      field.select();
      notice('可以复制下方已选中的分享链接。');
    }
  });
  element('Modal').addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const targets = Array.from(element('Modal').querySelectorAll('button:not(:disabled), a[href], textarea:not(:disabled), input'))
      .filter(node => node.getClientRects().length);
    if (!targets.length) { event.preventDefault(); return; }
    const first = targets[0], last = targets[targets.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  window.GuildBattleEditor = { open, clear, syncContext, isDirty, isSaving: () => editor?.busy === 'save', write, readBack };
})();
