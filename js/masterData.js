// 任务书 #14（V2.2 主数据层）：游戏字典加载层。
// 启动（登录选完公会后）并行拉 9 张主数据表挂内存缓存；
// 加载失败（离线/超时 5s）回退内置快照（masterDataSnapshot.js），任何页面不得白屏。
// 读：Supabase 直连（RLS select 放行 authenticated）；
// 写：server.js 代理（仅 app_metadata.role='superadmin'，server.js authorizeProxyRequest 主数据分支）。
// TODO（一期不做）：postgres_changes 实时订阅——种子阶段手动刷新足够（refresh()）。
(function () {
  'use strict';

  const TABLES = ['game_patches', 'game_seasons', 'game_raids', 'game_bosses', 'boss_loot', 'tier_sets', 'game_dungeons', 'game_classes', 'game_specs'];
  const LOAD_TIMEOUT_MS = 5000;

  const state = {
    patches: [], seasons: [], raids: [], bosses: [], loot: [], tierSets: [], dungeons: [], classes: [], specs: [],
    loaded: false, snapshotMode: false, loading: null
  };

  function client() {
    return window.CloudSync && window.CloudSync.getClient ? window.CloudSync.getClient() : null;
  }

  function applySnapshot() {
    const s = window.MASTER_DATA_SNAPSHOT || {};
    state.patches = s.patches || [];
    state.seasons = s.seasons || [];
    state.raids = s.raids || [];
    state.bosses = s.bosses || [];
    state.loot = s.loot || [];
    state.tierSets = s.tierSets || [];
    state.dungeons = s.dungeons || [];
    state.classes = s.classes || [];
    state.specs = s.specs || [];
    state.snapshotMode = true;
    state.loaded = true;
  }

  async function fetchTable(c, table) {
    const { data, error } = await c.from(table).select('*');
    if (error) throw error;
    return data || [];
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('主数据加载超时')), ms))
    ]);
  }

  // 初始化：并行拉 9 表；任一失败 → 快照兜底 + toast（禁止白屏）
  async function init() {
    if (state.loaded) return state;
    if (state.loading) return state.loading;
    state.loading = (async () => {
      const c = client();
      if (!c) { applySnapshot(); return state; }
      try {
        const [patches, seasons, raids, bosses, loot, tierSets, dungeons, classes, specs] = await withTimeout(
          Promise.all(TABLES.map(t => fetchTable(c, t))), LOAD_TIMEOUT_MS
        );
        state.patches = patches; state.seasons = seasons; state.raids = raids;
        state.bosses = bosses; state.loot = loot; state.tierSets = tierSets;
        state.dungeons = dungeons; state.classes = classes; state.specs = specs;
        state.snapshotMode = false;
        state.loaded = true;
        console.debug(`[diag] MasterData init ok: raids=${raids.length} bosses=${bosses.length} classes=${classes.length} specs=${specs.length}`);
      } catch (e) {
        console.warn('[diag] MasterData init FAIL，使用内置快照:', e && e.message);
        applySnapshot();
        if (typeof showToast === 'function') showToast('游戏字典加载失败，已使用内置快照', 'warning');
      }
      return state;
    })();
    try {
      return await state.loading;
    } finally {
      state.loading = null;
    }
  }

  // 刷新指定表（维护页写成功后调用方就地刷新缓存）
  async function refresh(table) {
    const c = client();
    if (!c || state.snapshotMode) return;
    const rows = await fetchTable(c, table);
    const key = {
      game_patches: 'patches', game_seasons: 'seasons', game_raids: 'raids',
      game_bosses: 'bosses', boss_loot: 'loot', tier_sets: 'tierSets',
      game_dungeons: 'dungeons', game_classes: 'classes', game_specs: 'specs'
    }[table];
    if (key) state[key] = rows;
  }

  // ---- 访问函数 ----
  const getPatches = () => [...state.patches].sort((a, b) => String(a.version).localeCompare(String(b.version)));
  const getSeasons = () => [...state.seasons].sort((a, b) => String(a.start_date || '').localeCompare(String(b.start_date || '')));
  const getCurrentSeason = () => state.seasons.find(s => s.is_current) || null;
  const getRaids = (seasonId) => {
    let list = [...state.raids];
    if (seasonId) list = list.filter(r => r.season_id === seasonId);
    return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.name).localeCompare(String(b.name)));
  };
  const getRaidByName = (name) => state.raids.find(r => r.name === name) || null;
  const getBosses = (raidId) => state.bosses.filter(b => b.raid_id === raidId).sort((a, b) => (a.boss_order || 0) - (b.boss_order || 0));
  const getLoot = (bossId) => state.loot.filter(l => l.boss_id === bossId);
  const getTierSets = (seasonId) => state.tierSets.filter(t => t.season_id === seasonId);
  const getDungeons = (seasonId) => {
    let list = [...state.dungeons];
    if (seasonId) list = list.filter(d => d.season_id === seasonId);
    return list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  };
  const getClasses = () => [...state.classes].sort((a, b) => (a.class_key || 0) - (b.class_key || 0));
  const getSpecs = (classId) => state.specs.filter(s => s.class_id === classId).sort((a, b) => (a.spec_key || 0) - (b.spec_key || 0));
  const getSpecsByClassName = (zhName) => {
    const cls = state.classes.find(c => c.name_zh === zhName);
    if (!cls) return [];
    // 快照的 specs 只有 class_key；DB 的有 class_id——两种都兼容
    return state.specs
      .filter(s => s.class_id === cls.id || s.class_key === cls.class_key)
      .sort((a, b) => (a.spec_key || 0) - (b.spec_key || 0));
  };

  const isLoaded = () => state.loaded;
  const isSnapshotMode = () => state.snapshotMode;
  const isSuperadmin = () => {
    const u = window.CloudSync && window.CloudSync.getCachedUser && window.CloudSync.getCachedUser();
    return !!(u && u.app_metadata && u.app_metadata.role === 'superadmin');
  };

  // ---- 写助手：server.js 代理（仅超管，server.js 主数据分支校验） ----
  async function mdWrite(method, table, body, query) {
    const token = await window.CloudSync.getAccessToken();
    if (!token) throw new Error('未登录，请先登录');
    const resp = await fetch('/api/db/rest/v1/' + table + (query ? `?${query}` : ''), {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const text = await resp.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = text; }
    if (!resp.ok) {
      const err = new Error((data && data.message) || `写入失败 (${resp.status})`);
      err.code = data && data.code;
      err.status = resp.status;
      throw err;
    }
    return data;
  }

  const mdInsert = (table, rows) => mdWrite('POST', table, rows);
  const mdUpdate = (table, rows, query) => mdWrite('PATCH', table, rows, query);
  const mdDelete = (table, query) => mdWrite('DELETE', table, undefined, query);
  // upsert：PostgREST 原生 upsert（Prefer: resolution=merge-duplicates）
  // 必须显式 on_conflict 指定唯一列（默认按主键，gen_random_uuid 永不冲突 →
  // 第二次导入撞业务唯一索引 23505，BUG-046 浏览器实测抓获）
  async function mdUpsert(table, rows, onConflict) {
    const token = await window.CloudSync.getAccessToken();
    if (!token) throw new Error('未登录，请先登录');
    const resp = await fetch('/api/db/rest/v1/' + table + (onConflict ? `?on_conflict=${onConflict}` : ''), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation,resolution=merge-duplicates'
      },
      body: JSON.stringify(rows)
    });
    const text = await resp.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = text; }
    if (!resp.ok) throw new Error((data && data.message) || `导入失败 (${resp.status})`);
    return data;
  }

  window.MasterData = {
    init, refresh,
    getPatches, getSeasons, getCurrentSeason,
    getRaids, getRaidByName, getBosses, getLoot, getTierSets, getDungeons,
    getClasses, getSpecs, getSpecsByClassName,
    isLoaded, isSnapshotMode, isSuperadmin,
    mdInsert, mdUpdate, mdDelete, mdUpsert
  };
})();
