// REQ-196: read-only allocation details. Dictionary values stay at their original tier.
(function () {
  'use strict';
  let anchor = null, panel = null, request = 0, leaveTimer;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const trigger = node => node instanceof Element ? node.closest('#lootTableBody [data-loot-detail]') : null;
  function close() {
    clearTimeout(leaveTimer); request++;
    anchor?.setAttribute('aria-expanded', 'false'); anchor = null;
    if (panel) panel.hidden = true;
  }
  function position() {
    if (!anchor?.isConnected || !anchor.getClientRects().length) { close(); return; }
    const a = anchor.getBoundingClientRect(), p = panel.getBoundingClientRect(), gap = 8;
    let left = a.right + gap;
    if (left + p.width > innerWidth - gap) left = a.left - p.width - gap;
    panel.style.left = Math.max(gap, Math.min(left, innerWidth - p.width - gap)) + 'px';
    panel.style.top = Math.max(gap, Math.min(a.top, innerHeight - p.height - gap)) + 'px';
  }
  function pool() {
    const rows = [];
    for (const raid of MasterData.getRaids()) for (const boss of MasterData.getBosses(raid.id)) {
      for (const row of MasterData.getLoot(boss.id)) rows.push({...row, source:'raid', instance_name:raid.name, boss_name:boss.name, season_id:raid.season_id});
    }
    return rows;
  }
  function match(loot) {
    const id = loot.pickup_source?.official_item_id || loot.pickup_source?.item_link?.match(/item:(\d+)/)?.[1];
    // A supplied stable ID must never fall back to a different same-name item.
    let rows = pool().filter(row => id ? String(row.official_item_id) === String(id) : row.item_name === loot.name);
    if (loot.raid) rows = rows.filter(row => row.instance_name === loot.raid);
    if (rows.length > 1 && loot.boss) rows = rows.filter(row => row.boss_name === loot.boss);
    return {row: rows.length === 1 ? rows[0] : null, ambiguous: rows.length > 1};
  }
  async function open(el) {
    clearTimeout(leaveTimer);
    if (anchor === el && !panel?.hidden) return;
    close(); anchor = el; const ticket = request;
    const loot = appData.loots.find(row => String(row.id) === el.dataset.lootDetail);
    if (!loot) { close(); return; }
    if (!panel) {
      panel = document.createElement('section'); panel.id = 'lootDetailPopover'; panel.className = 'loot-detail-popover';
      panel.setAttribute('role','region'); panel.setAttribute('aria-label','装备详情'); panel.tabIndex = -1;
      panel.addEventListener('pointerenter', () => clearTimeout(leaveTimer));
      panel.addEventListener('pointerleave', scheduleClose);
      panel.addEventListener('toggle', position, true);
      document.body.append(panel);
    }
    el.setAttribute('aria-expanded','true'); panel.hidden = false;
    const actual = `<div class="loot-detail-record"><strong>${esc(loot.name)}</strong><div>本次记录 · ${Number(loot.item_level)>0 ? '装等 '+esc(loot.item_level) : '装等未记录'} · ${esc(loot.difficulty||'难度未记录')}${loot.slot ? ' · '+esc(LOOT_DROP_INVTYPE_ZH[loot.slot]||loot.slot) : ''}</div></div>`;
    panel.innerHTML = actual + '<p class="loot-detail-note" role="status">正在加载装备资料…</p>'; position();
    try {
      await MasterData.init();
      if (ticket !== request || !el.isConnected) return;
      const {row, ambiguous} = match(loot);
      if (!row) {
        panel.innerHTML = actual + `<p class="loot-detail-note">${ambiguous ? '图鉴中存在多个匹配，暂不展示属性，避免串件。' : '暂无可确认的副本图鉴资料，仅展示本次记录。'}</p>`;
      } else {
        const pieces = LootTaxonomy.tierTokenMatch(row) ? await MasterData.getTierPieces() : [];
        if (ticket !== request || !el.isConnected) return;
        panel.innerHTML = actual + '<p class="loot-detail-note">副本掉落图鉴参考 · 下方装等与属性沿用图鉴，不代表本次掉落的实际数值。</p>' +
          (MasterData.isSnapshotMode() ? '<p class="loot-detail-note">当前使用内置图鉴快照，资料可能不是最新。</p>' : '') + DPLootDrop.renderItemCard(row, pieces);
      }
      position();
    } catch {
      if (ticket !== request) return;
      panel.innerHTML = actual + '<p class="loot-detail-note" role="status">装备资料暂时无法加载，请移开后重试。</p>'; position();
    }
  }
  function scheduleClose() {
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => {
      if (!anchor?.matches(':hover') && !panel?.matches(':hover') && document.activeElement !== anchor && !panel?.contains(document.activeElement)) close();
    }, 160);
  }
  document.addEventListener('pointerover', ev => { const el = trigger(ev.target); if (el) open(el); });
  document.addEventListener('pointerout', ev => { if (trigger(ev.target)) scheduleClose(); });
  document.addEventListener('focusin', ev => { const el = trigger(ev.target); if (el) open(el); else if (!panel?.contains(ev.target)) close(); });
  document.addEventListener('focusout', scheduleClose);
  document.addEventListener('click', ev => { const el = trigger(ev.target); if (el) open(el); else if (!panel?.contains(ev.target)) close(); });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && anchor) { const focus = panel?.contains(document.activeElement), el = anchor; close(); if (focus) { el.focus(); close(); } ev.stopPropagation(); }
  }, true);
  document.addEventListener('scroll', ev => { if (anchor && !panel?.contains(ev.target)) close(); }, true);
  window.addEventListener('resize', close); window.addEventListener('hashchange', close);
  window.LootDetails = {close};
})();
