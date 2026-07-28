// ==================== 云端数据层 ====================
// Supabase 集成 - 用户认证 + 云端数据同步
// 写入操作通过 server.js 代理（使用 service_role key 绕过 RLS INSERT 问题）
// 读取操作直接使用 Supabase REST API（RLS SELECT 正常）

(function () {
  'use strict';

  // ---- WoW 国服正式服服务器列表 ----
  const WOW_SERVERS = {
    '一区': ['万色星辰', '世界之树', '伊利丹', '伊瑟拉', '冬寒', '冬泉谷', '冰川之拳', '凯尔萨斯', '刀塔', '利刃之拳', '加里索斯', '卡扎克', '双子峰', '古尔丹', '图拉扬', '地狱之石', '埃苏雷格', '埃雷达尔', '基尔加丹', '塔伦米尔', '塞纳留斯', '奥拉基尔', '奥特兰克', '奥蕾莉亚', '奥达曼', '安东尼达斯', '寒冰皇冠', '尘风峡谷', '山丘之王', '巴尔古恩', '巴纳扎尔', '布莱恩', '库德兰', '影牙要塞', '恶魔之翼', '戈古纳斯', '托尔巴拉德', '拉文霍德', '拉格纳罗斯', '提瑞斯法', '摩摩尔', '斯坦索姆', '无底海渊', '时光之穴', '普罗德摩', '暗影裂口', '暗影议会', '暴风祭坛', '月光林地', '月神殿', '格鲁尔', '永恒之井', '泰拉尔', '洛萨', '海达希亚', '激流之傲', '火烟之谷', '火焰之树', '烈焰峰', '熵魔', '燃烧平原', '爱斯特纳', '玛多兰', '玛洛加尔', '玛诺洛斯', '玛里苟斯', '瓦拉斯塔兹', '瓦里玛萨斯', '甜水绿洲', '袒达克', '穆戈尔', '索瑞森', '红云台地', '红龙军团', '羽月', '耐奥祖', '耳语海岸', '自由之风', '艾森娜', '艾欧娜尔', '艾苏恩', '艾萨拉', '萨格拉斯', '藏宝海湾', '血顶', '试炼之环', '诺莫瑞根', '轻风之语', '辛达苟萨', '达纳斯', '达隆米尔', '迦玛兰', '通灵学院', '铜龙军团', '银月', '阿努巴拉克', '阿卡玛', '阿尔萨斯', '阿拉希', '阿拉索', '阿迦玛甘', '霜狼', '风行者', '麦迪文', '黑翼之巢', '龙骨平原', '冰风岗', '回音山', '国王之谷', '死亡之翼', '白银之手', '神圣之歌', '罗宁', '血色十字军', '遗忘海岸', '霜之哀伤'],
    '三区': ['丹莫德', '伊兰尼库斯', '伊莫塔尔', '克苏恩', '凯恩血蹄', '加兹鲁维', '加基森', '勇士岛', '卡德加', '卡德罗斯', '厄祖玛特', '古加尔', '古拉巴什', '哈兰', '哈卡', '圣火神殿', '埃克索图斯', '埃基尔松', '埃德萨拉', '塞拉赞恩', '塞泰克', '外域', '大地之怒', '太阳之井', '夺灵者', '奈萨里奥', '奎尔丹纳斯', '奎尔萨拉斯', '奥妮克希亚', '奥斯里安', '奥金顿', '安戈洛', '安纳塞隆', '屠魔山谷', '巨龙之吼', '布鲁塔卢斯', '希尔瓦娜斯', '德拉诺', '恐怖图腾', '恶魔之魂', '战歌', '拉文凯斯', '拉贾克斯', '日落沼泽', '暮色森林', '末日祷告祭坛', '杜隆坦', '格雷迈恩', '桑德兰', '梦境之树', '死亡熔炉', '泰兰德', '洛丹伦', '海加尔', '深渊之喉', '深渊之巢', '激流堡', '火喉', '火羽山', '燃烧军团', '狂风峭壁', '玛瑟里顿', '瑟菜德丝', '瓦丝琪', '石爪峰', '破碎岭', '祖尔金', '符文图腾', '索拉丁', '红龙女王', '纳克萨玛斯', '纳沙塔尔', '织亡者', '罗曼斯', '耐普图隆', '艾维娜', '艾莫莉丝', '艾露恩', '范克里夫', '荆棘谷', '菲拉斯', '萨尔', '蜘蛛王国', '血牙魔王', '血环', '诺兹多姆', '诺森德', '达文格尔', '迦罗娜', '迪瑟洛克', '阿克蒙德', '阿古斯', '阿扎达斯', '阿斯塔洛', '阿格拉玛', '雷克萨', '雷斧堡垒', '雷霆之王', '风暴之鳞', '鬼雾峰', '黑手军团', '黑暗之矛', '黑暗虚空', '黑暗魅影', '黑石尖塔', '黑铁', '凤凰之神', '埃霍恩', '托塞德林', '格瑞姆巴托', '熊猫酒仙', '燃烧之刃'],
    '五区': ['亚雷戈斯', '伊森德雷', '伊萨里奥斯', '克洛玛古斯', '卡拉赞', '卡珊德拉', '埃加洛尔', '基尔罗格', '塔纳利斯', '塞拉摩', '大漩涡', '天谴之门', '守护之剑', '安威玛尔', '密林游侠', '巫妖之王', '巴瑟拉斯', '布兰卡德', '布菜克摩', '希雷诺斯', '幽暗沼泽', '库尔提拉斯', '扎拉赞恩', '提尔之手', '斩魔者', '暗影之月', '暗影迷宫', '朵丹尼尔', '永夜港', '沃金', '灰谷', '烈焰荆棘', '狂热之刃', '瑞文戴尔', '祖阿曼', '翡翠梦境', '芬里斯', '苏塔恩', '萨洛拉丝', '萨菲隆', '蓝龙军团', '达斯雷玛', '迅捷微风', '迦顿', '金度', '金色平原', '银松森林', '雷霆之怒', '雷霆号角', '风暴之怒', '风暴之眼', '鲜血熔炉', '麦毋', '黄金之路', '伊森利恩', '无尽之海', '米奈希尔'],
    '十区': ['迦拉克隆', '元素之力', '兰娜瑟尔', '军团要塞', '冬拥湖', '冰霜之刃', '刺骨利刃', '加尔', '千针石林', '古达克', '嚎风峡湾', '地狱咆哮', '壁炉谷', '夏维安', '天空之墙', '奈法利安', '奥杜尔', '安其拉', '安加萨', '安格博达', '弗塞雷迦', '戈提克', '斯克提斯', '普瑞斯托', '梅尔加尼', '森金', '毁灭之锤', '沙怒', '法拉希姆', '洛肯', '海克泰尔', '熔火之心', '玛法里奥', '玛维·影歌', '瓦拉纳', '生态船', '白骨荒野', '盖斯', '石锤', '能源舰', '范达尔鹿盔', '莱索恩', '菲米丝', '血吼', '血羽', '踏梦者', '达克萨隆', '达基萨斯', '达尔坎', '远古海滩', '迪托马斯', '逐日者', '闪电之刃', '阿曼尼', '阿比迪斯', '阿纳克洛斯', '雏龙之翼', '凤暴峭壁', '鹰巢山', '黑暗之门', '黑锋哨站', '黑龙军团', '主宰之剑', '亡语者', '克尔苏加德', '奥尔加隆', '安苏', '影之哀伤', '末日行者', '贫瘠之地', '霍格'],
    '推荐服务器': ['丽丽', '晴日峰', '瓦里安', '苏拉玛']
  };

  // ---- 状态 ----
  let supabaseClient = null;
  let currentUser = null;       // Supabase auth user
  let currentGuild = null;      // 当前公会
  let currentMembership = null; // 当前用户在当前公会的成员信息 (role)
  let userGuilds = [];          // 用户所属的所有公会
  let isCloudMode = false;      // 是否启用云端模式
  let configLoaded = false;

  // ---- 初始化 Supabase 客户端 ----
  async function initSupabase() {
    if (supabaseClient) return supabaseClient;

    const t0 = performance.now(); // BUG-030（任务书 #12 补丁）：诊断埋点
    try {
      const resp = await fetch('/api/supabase-config');
      if (!resp.ok) throw new Error('无法获取 Supabase 配置');
      const config = await resp.json();

      if (!config.url || !config.anonKey) {
        console.warn('[diag] initSupabase FAIL: Supabase 未配置，云端不可用');
        return null;
      }

      if (typeof window.supabase === 'undefined') {
        console.warn('[diag] initSupabase FAIL: Supabase SDK 未加载，云端不可用');
        return null;
      }

      supabaseClient = window.supabase.createClient(config.url, config.anonKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          storage: localStorage,
          storageKey: 'wow_raid_supabase',
        },
      });

      configLoaded = true;
      console.debug(`[diag] initSupabase ok ${Math.round(performance.now() - t0)}ms`);
      return supabaseClient;
    } catch (e) {
      console.error('[diag] initSupabase FAIL:', e);
      return null;
    }
  }

  // ---- 获取当前 access_token ----
  async function getAccessToken() {
    if (!supabaseClient) return null;
    const { data } = await supabaseClient.auth.getSession();
    return data?.session?.access_token || null;
  }

  // ---- 代理写入操作到 server.js ----
  // 通过 /api/db/rest/v1/{table} 代理，server.js 使用 service_role key 写入
  async function dbWrite(method, table, { query, body } = {}) {
    const token = await getAccessToken();
    if (!token) throw new Error('未登录，请先登录');

    let url = `/api/db/rest/v1/${table}`;
    if (query) {
      const qs = Object.entries(query)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      if (qs) url += `?${qs}`;
    }

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    };

    const opts = { method, headers };
    if (body && (method === 'POST' || method === 'PATCH')) {
      opts.body = JSON.stringify(body);
    }

    const resp = await fetch(url, opts);
    const text = await resp.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = text; }

    if (!resp.ok) {
      const errMsg = (data && data.message) || `数据库操作失败 (${resp.status})`;
      // BUG-037（任务书 #12 补丁4）：透传 PostgREST 错误码（如 23505 唯一约束冲突），
      // 供调用方分层提示，不再笼统报"云端同步出错"
      const err = new Error(errMsg);
      err.code = data && data.code;
      err.status = resp.status;
      throw err;
    }

    // POST/PATCH 返回数组或单个对象
    if (Array.isArray(data) && data.length === 1 && (method === 'POST' || method === 'PATCH')) {
      return data[0];
    }
    return data;
  }

  // ---- 代理查询操作到 server.js ----
  // 通过 /api/db/rest/v1/{table} 代理，server.js 使用 service_role key 查询
  // 用于需要绕过 RLS 的查询场景（如通过邀请码查找公会）
  async function dbQuery(table, filter, method = 'GET') {
    const token = await getAccessToken();
    if (!token) throw new Error('未登录，请先登录');

    let url = `/api/db/rest/v1/${table}`;
    if (filter) url += `?${filter}`;

    const headers = {
      'Authorization': `Bearer ${token}`,
    };

    const resp = await fetch(url, { method, headers });
    const text = await resp.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = text; }

    if (!resp.ok) {
      const errMsg = (data && data.message) || `查询失败 (${resp.status})`;
      throw new Error(errMsg);
    }

    return data;
  }

  // 便捷方法
  function dbInsert(table, row) {
    return dbWrite('POST', table, { body: row });
  }

  function dbUpdate(table, row, filters) {
    // filters: { id: 'eq.xxx', guild_id: 'eq.yyy' }
    const query = {};
    for (const [k, v] of Object.entries(filters)) {
      query[k] = `eq.${v}`;
    }
    return dbWrite('PATCH', table, { query, body: row });
  }

  function dbDelete(table, filters) {
    const query = {};
    for (const [k, v] of Object.entries(filters)) {
      query[k] = `eq.${v}`;
    }
    return dbWrite('DELETE', table, { query });
  }

  // ---- 认证监听 ----
  function setupAuthListener() {
    if (!supabaseClient) return;

    // BUG-029/030（任务书 #12 补丁）：onAuthStateChange 回调触发期间 supabase-js 持有
    // auth 锁，回调里直接 await 长链路（loadUserGuilds/selectGuild/loadCloudData）时，
    // 并发的 getSession()（dbWrite 取 token）会被锁阻塞甚至卡死，造成写链路假性挂起。
    // 官方建议：回调内不做 await，异步工作用 setTimeout 延后、先释放锁。
    supabaseClient.auth.onAuthStateChange((event, session) => {
      console.debug(`[diag] auth event: ${event}`);
      if (event === 'SIGNED_IN' && session) {
        currentUser = session.user;
        setTimeout(() => { onUserSignedIn(); }, 0);
      } else if (event === 'SIGNED_OUT') {
        currentUser = null;
        currentGuild = null;
        currentMembership = null;
        userGuilds = [];
        onUserSignedOut();
      } else if (event === 'TOKEN_REFRESHED') {
        currentUser = session ? session.user : null;
      }
    });
  }

  // ---- 登录 ----
  async function cloudSignIn(email, password) {
    const client = await initSupabase();
    if (!client) throw new Error('云端服务不可可用');

    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;

    currentUser = data.user;
    isCloudMode = true;
    await onUserSignedIn();
    return data;
  }

  // ---- 注册 ----
  async function cloudSignUp(email, password, displayName) {
    const client = await initSupabase();
    if (!client) throw new Error('云端服务不可可用');

    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName || email.split('@')[0] },
      },
    });
    if (error) throw error;

    let user = data.user;
    if (!user && data.session) {
      user = data.session.user;
    }
    if (!user) {
      const { data: sessionData } = await client.auth.getSession();
      if (sessionData?.session?.user) {
        user = sessionData.session.user;
      }
    }

    if (user) {
      currentUser = user;
      isCloudMode = true;
      await onUserSignedIn();
    } else {
      isCloudMode = true;
    }
    return data;
  }

  // ---- 登出 ----
  async function cloudSignOut() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    currentUser = null;
    currentGuild = null;
    currentMembership = null;
    userGuilds = [];
    isCloudMode = false;
    onUserSignedOut();
  }

  // ---- 清除当前公会上下文（BUG-015：退出公会后调用，不登出） ----
  function clearCurrentGuild() {
    currentGuild = null;
    currentMembership = null;
    localStorage.removeItem('wow_raid_last_guild');
  }

  // ---- 获取当前用户 ----
  async function getCurrentUser() {
    const client = await initSupabase();
    if (!client) return null;

    const { data: { user } } = await client.auth.getUser();
    currentUser = user;
    return user;
  }

  // ---- 用户登录后加载公会列表 ----
  async function onUserSignedIn() {
    if (!currentUser) return;
    isCloudMode = true;

    try {
      await loadUserGuilds();
      const lastGuildId = localStorage.getItem('wow_raid_last_guild');
      const guild = userGuilds.find(g => g.id === lastGuildId) || userGuilds[0];
      if (guild) {
        await selectGuild(guild.id);
        showAppView();
      }
    } catch (e) {
      console.error('加载公会列表失败', e);
    }
  }

  // ---- 用户登出后 ----
  function onUserSignedOut() {
    isCloudMode = false;
    // BUG-012：登出时清除 viewer 权限门状态
    if (typeof document !== 'undefined') document.body.classList.remove('viewer-mode');
    showAuthView();
  }

  // ---- 加载用户所属公会 (SELECT - 直接走 Supabase) ----
  async function loadUserGuilds() {
    if (!supabaseClient || !currentUser) return [];

    const { data, error } = await supabaseClient
      .from('guild_members')
      .select('*, guilds(*)')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    userGuilds = (data || []).map(m => ({
      ...m.guilds,
      my_role: m.role,
      membership_id: m.id,
    }));

    return userGuilds;
  }

  // ---- 选择公会 ----
  async function selectGuild(guildId) {
    if (!supabaseClient || !currentUser) return;

    const { data: guildData, error: guildError } = await supabaseClient
      .from('guilds')
      .select('*')
      .eq('id', guildId)
      .maybeSingle();

    if (guildError) throw guildError;
    if (!guildData) throw new Error('公会不存在');

    currentGuild = guildData;

    const { data: memberData, error: memberError } = await supabaseClient
      .from('guild_members')
      .select('id, role')
      .eq('guild_id', guildId)
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (memberError) throw memberError;
    currentMembership = memberData;

    localStorage.setItem('wow_raid_last_guild', guildId);

    await loadCloudData();
    updateGuildUI();
  }

  // ---- REQ-025：更新公会资料（简介/分配制度/规则说明），服务端代理仅放行 owner ----
  async function updateGuildProfile(fields) {
    if (!currentGuild) throw new Error('未选择公会');
    await dbUpdate('guilds', fields, { id: currentGuild.id });
    Object.assign(currentGuild, fields);
    updateGuildUI();
  }

  // ---- 获取服务器列表 ----
  function getWowServers() {
    return WOW_SERVERS;
  }

  // 获取所有服务器（扁平列表，用于搜索）
  function getAllWowServers() {
    const all = [];
    Object.entries(WOW_SERVERS).forEach(([region, servers]) => {
      servers.forEach(server => {
        all.push({ region, server });
      });
    });
    return all;
  }

  // ---- 创建公会 (INSERT - 走代理) ----
  async function createGuild(name, serverName, serverRegion) {
    const client = await initSupabase();
    if (!client || !currentUser) throw new Error('请先登录');

    const inviteCode = generateInviteCode();

    // 创建公会
    const guild = await dbInsert('guilds', {
      name,
      owner_id: currentUser.id,
      invite_code: inviteCode,
      server_name: serverName || null,
      server_region: serverRegion || null,
    });

    if (!guild || !guild.id) throw new Error('创建公会失败');

    // 创建者自动成为 owner
    const displayName = currentUser.user_metadata?.display_name || currentUser.email.split('@')[0];
    await dbInsert('guild_members', {
      guild_id: guild.id,
      user_id: currentUser.id,
      role: 'owner',
      display_name: displayName,
    });

    await loadUserGuilds();
    await selectGuild(guild.id);
    return guild;
  }

  // ---- 通过邀请码加入公会 ----
  async function joinGuild(inviteCode) {
    const client = await initSupabase();
    if (!client || !currentUser) throw new Error('请先登录');

    // 查找公会 (通过代理查询，绕过 RLS 限制)
    const guild = await dbQuery('guilds', `invite_code=eq.${inviteCode}`, 'GET');
    if (!guild || guild.length === 0) throw new Error('邀请码无效');
    const guildData = guild[0];

    // 检查是否已是成员
    const { data: existing } = await supabaseClient
      .from('guild_members')
      .select('id')
      .eq('guild_id', guildData.id)
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (existing) throw new Error('你已经是该公会成员');

    // 加入公会 (INSERT - 走代理)
    const displayName = currentUser.user_metadata?.display_name || currentUser.email.split('@')[0];
    await dbInsert('guild_members', {
      guild_id: guildData.id,
      user_id: currentUser.id,
      role: 'viewer',
      display_name: displayName,
    });

    // 创建通知给公会 owner 和 editor
    await createJoinNotification(guildData.id, currentUser.id, displayName);

    await loadUserGuilds();
    await selectGuild(guildData.id);
    return guildData;
  }

  // ---- 通过公会 ID 加入公会（用户中心接受邀请，BUG-010） ----
  async function joinGuildById(guildId) {
    const client = await initSupabase();
    if (!client || !currentUser) throw new Error('请先登录');
    if (!guildId) throw new Error('公会不存在或邀请已失效');

    // 通过代理查询，绕过 RLS（非成员不可读公会行）
    const guild = await dbQuery('guilds', `id=eq.${guildId}`, 'GET');
    if (!guild || guild.length === 0) throw new Error('公会不存在或已解散');
    const guildData = guild[0];

    // 检查是否已是成员
    const { data: existing } = await supabaseClient
      .from('guild_members')
      .select('id')
      .eq('guild_id', guildData.id)
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (existing) throw new Error('你已经是该公会成员');

    // 加入公会 (INSERT - 走代理)
    const displayName = currentUser.user_metadata?.display_name || currentUser.email.split('@')[0];
    await dbInsert('guild_members', {
      guild_id: guildData.id,
      user_id: currentUser.id,
      role: 'viewer',
      display_name: displayName,
    });

    await createJoinNotification(guildData.id, currentUser.id, displayName);

    await loadUserGuilds();
    await selectGuild(guildData.id);
    return guildData;
  }

  // ---- 加载云端数据到 appData (SELECT - 直接走 Supabase) ----
  async function loadCloudData() {
    if (!supabaseClient || !currentGuild) return;

    const guildId = currentGuild.id;

    // BUG-030（任务书 #12 补丁）：旧实现是自写的一套映射（成员 status 恒为"正式"、
    // 活动缺 status/team_tag/boss/wcl_snapshot 列），与 reloadData 的各表加载函数口径
    // 不一致，每次登录/刷新后新列全部丢失。统一改走各表加载函数，单一映射口径。
    // 逐表 try/catch 隔离：单表失败不再中断后续表，失败模块给页面可见横幅（禁止静默空白）。
    const loaders = [
      ['members', reloadMembers],
      ['activities', reloadActivities],
      ['loots', reloadLootRecords],
      ['wishlists', reloadWishlists],
    ];
    const failed = [];
    for (const [name, fn] of loaders) {
      const t0 = performance.now();
      try {
        await fn(guildId);
        console.debug(`[diag] loadCloudData ${name} ok ${Math.round(performance.now() - t0)}ms`);
      } catch (e) {
        failed.push(name);
        console.error(`[diag] loadCloudData ${name} FAIL:`, e);
      }
    }
    saveLocalCache();
    if (failed.length && typeof window.showLoadFailureBanner === 'function') {
      window.showLoadFailureBanner(failed);
    }
  }

  // ---- 重新加载指定模块数据（写成功后回读数据库最新状态） ----
  async function reloadData(dataType) {
    // BUG-029（任务书 #12 补丁）：原来是静默 return——会话/公会上下文在写流程中途
    // 丢失（auth 事件竞态）时 reload 变 no-op，调用方照常 toast 成功但界面是旧数据
    // （假成功）。改为明确抛错，让调用方走失败提示（规范：禁止静默失败）。
    if (!supabaseClient || !currentGuild) {
      throw new Error('云端连接未就绪（会话或公会上下文丢失），请刷新页面重试');
    }
    const guildId = currentGuild.id;
    const perfT0 = performance.now(); // 任务书 #10：分表计时

    try {
      switch (dataType) {
        case 'members':
          await reloadMembers(guildId);
          break;
        case 'loots':
          await reloadLootRecords(guildId);
          break;
        case 'wishlist':
        case 'wishlists':
          await reloadWishlists(guildId);
          break;
        case 'activities':
          await reloadActivities(guildId);
          break;
        default:
          console.warn('未知 reload 数据类型:', dataType);
      }
      saveLocalCache();
      console.debug(`[perf] reloadData ${dataType} ${Math.round(performance.now() - perfT0)}ms`);
    } catch (e) {
      console.error('reloadData 失败:', dataType, e);
      throw e;
    }
  }

  async function reloadMembers(guildId) {
    const { data, error } = await supabaseClient
      .from('raid_members')
      .select('*')
      .eq('guild_id', guildId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const members = (data || []).map(m => ({
      id: m.id,
      name: m.name,
      class: m.class,
      main_spec: m.spec || '',
      spec: m.spec || '',
      role: m.role ? (Array.isArray(m.role) ? m.role : [m.role]) : ['输出'],
      off_spec: m.off_spec || '',
      off_specs: m.off_specs || (m.off_spec ? [m.off_spec] : []),
      status: m.status || '正式',
      join_date: m.join_date || formatDate(new Date()),
      notes: m.notes || '',
      created_at: m.created_at,
      updated_at: m.updated_at
    }));

    if (typeof window.appData !== 'undefined') {
      window.appData.members = members;
    }
  }

  async function reloadLootRecords(guildId) {
    const { data, error } = await supabaseClient
      .from('loot_records')
      .select('*')
      .eq('guild_id', guildId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const loots = (data || []).map(l => ({
      id: l.id,
      name: l.item_name,
      raid: l.raid_name || '',
      difficulty: l.difficulty || '',
      boss: l.boss_name || '',
      category: l.item_category || '',
      slot: l.item_slot || '',
      item_level: l.item_level || 0,
      primaryStat: l.item_stats ? l.item_stats.primaryStat : '',
      secondaryStats: l.item_stats ? l.item_stats.secondaryStats : [],
      specialEffect: l.item_stats ? l.item_stats.specialEffect : '',
      assignedTo: l.item_stats ? l.item_stats.assignedTo : '',
      status: l.item_stats ? l.item_stats.status : '待分配',
      priority: l.item_stats ? l.item_stats.priority : 'P2',
      date: l.obtained_date || '',
      season: l.season || '',
      distribution_method: l.distribution_method || 'custom',
      player_action: l.player_action || 'none',
      roll_value: l.roll_value || null,
      is_wishlist: l.is_wishlist || false,
      rule_note: l.rule_note || '',
      decision_note: l.decision_note || '',
      note: l.note || '',
      character_id: l.character_id || null,
      assigned_by: l.assigned_by || null,
      createdAt: l.created_at ? new Date(l.created_at).getTime() : Date.now(),
      updatedAt: l.updated_at ? new Date(l.updated_at).getTime() : Date.now()
    }));

    if (typeof window.appData !== 'undefined') {
      window.appData.loots = loots;
    }
  }

  async function reloadWishlists(guildId) {
    const { data, error } = await supabaseClient
      .from('wishlists')
      .select('*')
      .eq('guild_id', guildId);

    if (error) throw error;

    const wishlist = [];
    (data || []).forEach(w => {
      const memberItems = w.items || [];
      memberItems.forEach(item => {
        wishlist.push({
          ...item,
          memberId: item.memberId || w.member_id,
          id: item.id || (typeof genId === 'function' ? genId() : Date.now().toString(36) + Math.random().toString(36).substr(2, 9))
        });
      });
    });

    if (typeof window.appData !== 'undefined') {
      window.appData.wishlist = wishlist;
    }
  }

  async function reloadActivities(guildId) {
    const { data: activitiesData, error: activitiesError } = await supabaseClient
      .from('activities')
      .select('*')
      .eq('guild_id', guildId)
      .order('activity_date', { ascending: false });

    if (activitiesError) throw activitiesError;

    const { data: attendanceData, error: attendanceError } = await supabaseClient
      .from('activity_attendance')
      .select('*')
      .in('activity_id', (activitiesData || []).map(a => a.id));

    if (attendanceError) throw attendanceError;

    const attendanceMap = {};
    (attendanceData || []).forEach(att => {
      if (!attendanceMap[att.activity_id]) attendanceMap[att.activity_id] = [];
      attendanceMap[att.activity_id].push({
        member_id: att.member_id,
        status: mapStatusFromDb(att.status),
        notes: att.notes || ''
      });
    });

    const activities = (activitiesData || []).map(a => ({
      id: a.id,
      date: a.activity_date,
      raid_name: a.raid || '',
      boss: a.boss || '',
      notes: a.notes || '',
      start_time: a.start_time || '',
      end_time: a.end_time || '',
      wcl_url: a.wcl_url || '',
      wcl_report_code: a.wcl_report_code || '',
      // REQ-020/028（任务书 #12）：活动状态（normal/cancelled）与团队标签
      status: a.status || 'normal',
      team_tag: a.team_tag || '',
      // REQ-037（任务书 #12）：WCL 同步快照（已导入提示条的数据来源，刷新后仍需可读）
      wcl_snapshot: a.wcl_snapshot || null,
      attendees: attendanceMap[a.id] || []
    }));

    if (typeof window.appData !== 'undefined') {
      window.appData.activities = activities;
    }
  }

  // ---- 保存数据到云端 ----
  async function saveCloudData(dataType, operation, item, extra) {
    // BUG-029（任务书 #12 补丁）：同 reloadData，静默 return 会造成假成功，改为明确抛错
    if (!supabaseClient || !currentGuild) {
      throw new Error('云端连接未就绪（会话或公会上下文丢失），请刷新页面重试');
    }

    const guildId = currentGuild.id;

    try {
      switch (dataType) {
        case 'members':
          await syncMember(guildId, operation, item);
          break;
        case 'activities':
          await syncActivity(guildId, operation, item, extra);
          break;
        case 'loots':
          await syncLoot(guildId, operation, item);
          break;
        case 'wishlist':
        case 'wishlists':
          await syncWishlist(guildId, operation, item);
          break;
        default:
          console.warn('未知数据类型:', dataType);
      }
    } catch (e) {
      console.error('云端同步失败:', dataType, operation, e);
      throw e;
    }
  }

  // ---- 同步成员 (写入走代理) ----
  async function syncMember(guildId, operation, item) {
    switch (operation) {
      case 'add': {
        const row = {
          guild_id: guildId,
          name: item.name,
          class: item.class,
          spec: item.main_spec || item.spec || '',
          role: mapRoleToDb(item.role),
          off_spec: item.off_spec || '',
          off_specs: item.off_specs || (item.off_spec ? [item.off_spec] : []),
          status: item.status || '正式',
          join_date: item.join_date || formatDate(new Date()),
          notes: item.notes || '',
          user_id: currentUser ? currentUser.id : null,
        };
        const data = await dbInsert('raid_members', row);
        if (data && data.id) item.id = data.id;
        break;
      }
      case 'update': {
        const row = {
          guild_id: guildId,
          name: item.name,
          class: item.class,
          spec: item.main_spec || item.spec || '',
          role: mapRoleToDb(item.role),
          off_spec: item.off_spec || '',
          off_specs: item.off_specs || (item.off_spec ? [item.off_spec] : []),
          status: item.status || '正式',
          join_date: item.join_date || formatDate(new Date()),
          notes: item.notes || '',
          user_id: currentUser ? currentUser.id : null,
        };
        await dbUpdate('raid_members', row, { id: item.id });
        break;
      }
      case 'delete': {
        await dbDelete('raid_members', { id: item.id });
        break;
      }
    }
  }

  // ---- 同步活动 (写入走代理) ----
  async function syncActivity(guildId, operation, item, extra) {
    switch (operation) {
      case 'add':
      case 'update': {
        const row = {
          guild_id: guildId,
          name: item.raid_name ? `${item.raid_name} - ${item.date}` : item.date,
          activity_date: item.date,
          raid: item.raid_name || '',
          boss: item.boss || '',
          notes: item.notes || '',
          start_time: item.start_time || '',
          end_time: item.end_time || '',
          wcl_url: item.wcl_url || '',
          wcl_report_code: item.wcl_report_code || '',
          // REQ-033（任务书 #11）：WCL 同步考勤后写参战名单快照；未传时不触碰该列
          ...(item.wcl_snapshot !== undefined ? { wcl_snapshot: item.wcl_snapshot } : {}),
          // REQ-020/028（任务书 #12）：status/team_tag 条件透传（同 wcl_snapshot 模式）；
          // 新增时默认 normal，编辑未传时不触碰该列
          ...(item.status !== undefined ? { status: item.status } : (operation === 'add' ? { status: 'normal' } : {})),
          ...(item.team_tag !== undefined ? { team_tag: item.team_tag || '' } : {}),
          created_by: currentUser ? currentUser.id : null,
        };

        if (operation === 'update' && item.id) {
          await dbUpdate('activities', row, { id: item.id });
        } else {
          const data = await dbInsert('activities', row);
          if (data && data.id) item.id = data.id;
        }

        // 同步出勤记录
        if (item.attendees && item.attendees.length > 0) {
          // 先删除旧的出勤记录
          if (item.id) {
            await dbDelete('activity_attendance', { activity_id: item.id });
          }
          // 批量插入
          const attRows = item.attendees.map(att => ({
            activity_id: item.id,
            member_id: att.member_id,
            status: mapStatusToDb(att.status),
          }));
          if (attRows.length > 0) {
            // 批量插入通过代理 - 使用数组 body
            const token = await getAccessToken();
            if (!token) throw new Error('未登录');
            const resp = await fetch('/api/db/rest/v1/activity_attendance', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation',
              },
              body: JSON.stringify(attRows),
            });
            if (!resp.ok) {
              const errText = await resp.text();
              throw new Error(`出勤记录同步失败: ${errText}`);
            }
          }
        }
        break;
      }
      case 'delete': {
        // BUG-016：activity_attendance.activity_id 外键为 ON DELETE CASCADE（sql/01_tables.sql:78，
        // 真实库已用 scripts/verify-activity-cascade.js 实证），删活动即级联删考勤，
        // 不再单独发一次考勤删除代理请求（省掉一次完整的 JWT 验证 + 联查鉴权 + 转发链路）。
        await dbDelete('activities', { id: item.id });
        break;
      }
    }
  }

  // ---- 同步装备 (写入走代理) ----
  async function syncLoot(guildId, operation, item) {
    const itemStats = {
      category: item.category,
      primaryStat: item.primaryStat,
      secondaryStats: item.secondaryStats,
      specialEffect: item.specialEffect,
      assignedTo: item.assignedTo,
      status: item.status,
      priority: item.priority,
    };

    const row = {
      guild_id: guildId,
      character_id: item.character_id || null,
      assigned_by: currentUser ? currentUser.id : null,
      item_name: item.name,
      item_category: item.category || null,
      item_slot: item.slot || null,
      item_level: item.item_level || 0,
      raid_name: item.raid || null,
      season: item.season || null,
      difficulty: item.difficulty || null,
      boss_name: item.boss || null,
      obtained_date: item.date || null,
      distribution_method: item.distribution_method || 'custom',
      player_action: item.player_action || 'none',
      roll_value: item.roll_value || null,
      is_wishlist: item.is_wishlist || false,
      rule_note: item.rule_note || null,
      decision_note: item.decision_note || null,
      note: item.note || null,
      item_stats: itemStats,
    };

    switch (operation) {
      case 'add': {
        const data = await dbInsert('loot_records', row);
        if (data && data.id) item.id = data.id;
        break;
      }
      case 'update': {
        await dbUpdate('loot_records', row, { id: item.id });
        break;
      }
      case 'delete': {
        await dbDelete('loot_records', { id: item.id });
        break;
      }
    }
  }

  // ---- 同步心愿单 (写入走代理) ----
  // 前端 appData.wishlist 是平铺数组，每个元素是一个心愿单条目。
  // 数据库 wishlists 表按 member_id 分组，items 字段存储该成员的所有心愿单条目数组。
  async function syncWishlist(guildId, operation, item) {
    // 前端使用 memberId，数据库使用 member_id
    const memberId = item.memberId || item.member_id;
    if (!memberId && operation !== 'delete') {
      console.error('[syncWishlist] memberId missing', item);
      throw new Error('心愿单缺少成员 ID');
    }

    switch (operation) {
      case 'add': {
        // 查询该成员是否已有心愿单记录
        const { data: existingRows, error: queryError } = await supabaseClient
          .from('wishlists')
          .select('id, items')
          .eq('guild_id', guildId)
          .eq('member_id', memberId);

        if (queryError) {
          console.error('[syncWishlist] query error', queryError);
          throw queryError;
        }

        const existingRow = existingRows && existingRows[0];
        const items = (existingRow && existingRow.items) || [];
        items.push(item);

        if (existingRow) {
          await dbUpdate('wishlists', { items }, { id: existingRow.id });
        } else {
          const data = await dbInsert('wishlists', {
            guild_id: guildId,
            member_id: memberId,
            items: items,
          });
          if (data && data.id) {
            // 不修改前端 item.id，它由前端生成并用于列表展示
          }
        }
        break;
      }
      case 'update': {
        // 根据前端 item.id 找到对应的数据库记录并更新该条目
        const { data: rows, error: queryError } = await supabaseClient
          .from('wishlists')
          .select('id, items')
          .eq('guild_id', guildId);

        if (queryError) {
          console.error('[syncWishlist] query error', queryError);
          throw queryError;
        }

        let found = false;
        for (const row of (rows || [])) {
          const items = row.items || [];
          const idx = items.findIndex(i => i.id === item.id);
          if (idx >= 0) {
            items[idx] = { ...item };
            await dbUpdate('wishlists', { items }, { id: row.id });
            found = true;
            break;
          }
        }
        if (!found) {
          console.warn('[syncWishlist] update target not found, fallback to add', item);
          await syncWishlist(guildId, 'add', item);
        }
        break;
      }
      case 'delete': {
        // 根据前端 item.id 找到对应的数据库记录并从 items 数组中移除
        const { data: rows, error: queryError } = await supabaseClient
          .from('wishlists')
          .select('id, items')
          .eq('guild_id', guildId);

        if (queryError) {
          console.error('[syncWishlist] query error', queryError);
          throw queryError;
        }

        for (const row of (rows || [])) {
          const items = row.items || [];
          const idx = items.findIndex(i => i.id === item.id);
          if (idx >= 0) {
            items.splice(idx, 1);
            await dbUpdate('wishlists', { items }, { id: row.id });
            break;
          }
        }
        break;
      }
    }
  }

  // ---- 公会成员管理 (SELECT 走 Supabase, 写入走代理) ----
  async function getGuildMembers() {
    if (!supabaseClient || !currentGuild) return [];
    const { data, error } = await supabaseClient
      .from('guild_members')
      .select('*')
      .eq('guild_id', currentGuild.id)
      .order('created_at');
    if (error) throw error;
    return data || [];
  }

  // 创建成员加入通知
  async function createJoinNotification(guildId, userId, displayName) {
    try {
      const { data: members } = await supabaseClient
        .from('guild_members')
        .select('user_id, role')
        .eq('guild_id', guildId)
        .in('role', ['owner', 'editor']);

      if (members && members.length > 0) {
        for (const member of members) {
          await dbInsert('notifications', {
            user_id: member.user_id,
            type: 'member_join',
            title: '新成员加入',
            message: `${displayName} 加入了公会`,
            guild_id: guildId,
            related_user_id: userId,
          });
        }
      }
    } catch (e) {
      console.error('创建加入通知失败:', e);
    }
  }

  // 创建成员退出通知
  async function createLeaveNotification(guildId, userId, displayName) {
    try {
      const { data: members } = await supabaseClient
        .from('guild_members')
        .select('user_id, role')
        .eq('guild_id', guildId)
        .in('role', ['owner', 'editor']);

      if (members && members.length > 0) {
        for (const member of members) {
          if (member.user_id !== userId) {
            await dbInsert('notifications', {
              user_id: member.user_id,
              type: 'member_leave',
              title: '成员退出',
              message: `${displayName} 退出了公会`,
              guild_id: guildId,
              related_user_id: userId,
            });
          }
        }
      }
    } catch (e) {
      console.error('创建退出通知失败:', e);
    }
  }

  async function updateMemberRole(membershipId, newRole) {
    if (!supabaseClient || !currentGuild) return;
    await dbUpdate('guild_members', { role: newRole }, { id: membershipId, guild_id: currentGuild.id });
  }

  async function removeGuildMember(membershipId) {
    if (!supabaseClient || !currentGuild) return;
    
    const { data: member } = await supabaseClient
      .from('guild_members')
      .select('user_id, display_name')
      .eq('id', membershipId)
      .single();
    
    await dbDelete('guild_members', { id: membershipId, guild_id: currentGuild.id });
    
    if (member) {
      await createLeaveNotification(currentGuild.id, member.user_id, member.display_name);
    }
  }

  // ---- 公会设置 (写入走代理) ----
  async function deleteGuildCloud(guildId) {
    await dbDelete('guilds', { id: guildId });
  }

  async function leaveGuildCloud(membershipId) {
    if (!supabaseClient || !currentGuild) return;
    
    const displayName = currentUser.user_metadata?.display_name || currentUser.email.split('@')[0];
    
    await dbDelete('guild_members', { id: membershipId });
    
    await createLeaveNotification(currentGuild.id, currentUser.id, displayName);
  }

  async function resetGuildDataCloud(guildId) {
    // 删除公会下所有数据
    await dbDelete('raid_members', { guild_id: guildId });
    await dbDelete('activities', { guild_id: guildId });
    await dbDelete('loot_records', { guild_id: guildId });
    await dbDelete('wishlists', { guild_id: guildId });
  }

  // ---- 初始化示例数据 ----
  async function initGuildSampleData(guildId) {
    // 不自动初始化示例数据
  }

  // ---- 辅助函数 ----
  function generateInviteCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  function mapRoleToDb(roles) {
    if (!roles || !Array.isArray(roles) || roles.length === 0) return '输出';
    return roles[0];
  }

  function mapRoleFromDb(role) {
    return role || '输出';
  }

  function mapStatusToDb(status) {
    const map = { '出席': 'present', '缺席': 'absent', '迟到': 'late', '替补': 'backup', '请假': 'leave' };
    return map[status] || 'present';
  }

  function mapStatusFromDb(status) {
    const map = { 'present': '出席', 'absent': '缺席', 'late': '迟到', 'backup': '替补', 'leave': '请假' };
    return map[status] || '出席';
  }

  // ---- UI 控制 ----
  function showAuthView() {
    const authOverlay = document.getElementById('authOverlay');
    const appContainer = document.querySelector('.app-container');
    if (authOverlay) authOverlay.style.display = 'flex';
    if (appContainer) appContainer.style.display = 'none';
  }

  function showAppView() {
    const authOverlay = document.getElementById('authOverlay');
    const appContainer = document.querySelector('.app-container');
    if (authOverlay) authOverlay.style.display = 'none';
    if (appContainer) appContainer.style.display = '';

    if (typeof window.loadData === 'function' && isCloudMode) {
      window.loadData();
    }
    if (typeof window.renderDashboard === 'function') {
      window.renderDashboard();
    }
  }

  function updateGuildUI() {
    const guildNameEl = document.getElementById('guildName');
    const guildRoleEl = document.getElementById('guildRole');
    const userInfoEl = document.getElementById('userInfo');

    if (guildNameEl && currentGuild) {
      guildNameEl.textContent = currentGuild.name;
    }
    if (guildRoleEl && currentMembership) {
      const roleLabels = { owner: '会长', editor: '编辑', viewer: '浏览' };
      guildRoleEl.textContent = roleLabels[currentMembership.role] || currentMembership.role;
      // BUG-018：按角色着色，一眼可见自己身份
      guildRoleEl.className = `guild-bar-role role-${currentMembership.role}`;
    }
    if (userInfoEl && currentUser) {
      userInfoEl.textContent = currentUser.email;
    }

    // BUG-012：切换公会后角色可能变化，刷新 viewer 权限门
    if (typeof window.updatePermissionUI === 'function') {
      window.updatePermissionUI();
    }
  }

  function saveLocalCache() {
    if (typeof window.appData !== 'undefined') {
      localStorage.setItem('wow_raid_attendance_data', JSON.stringify(window.appData));
    }
  }

  // ---- 权限检查 ----
  function canEdit() {
    if (!isCloudMode) return true;
    return currentMembership && (currentMembership.role === 'owner' || currentMembership.role === 'editor');
  }

  function isOwner() {
    return currentMembership && currentMembership.role === 'owner';
  }

  // ==================== 用户中心 ====================

  // 获取用户资料
  async function getUserProfile() {
    if (!isCloudMode || !currentUser) return null;
    try {
      const { data, error } = await supabaseClient
        .from('user_profiles')
        .select('*')
        .eq('user_id', currentUser.id)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (e) {
      console.error('获取用户资料失败:', e);
      return null;
    }
  }

  // 保存用户资料
  async function saveUserProfile(profileData) {
    if (!isCloudMode || !currentUser) return null;
    try {
      const { data, error } = await supabaseClient
        .from('user_profiles')
        .upsert({
          user_id: currentUser.id,
          ...profileData,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (e) {
      console.error('保存用户资料失败:', e);
      return null;
    }
  }

  // 获取用户角色列表
  async function getUserCharacters() {
    if (!isCloudMode || !currentUser) return [];
    try {
      const { data, error } = await supabaseClient
        .from('user_characters')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error('获取用户角色失败:', e);
      return [];
    }
  }

  // 保存用户角色
  async function saveUserCharacter(characterData) {
    if (!isCloudMode || !currentUser) return null;
    try {
      // BUG-011 修复：upsert 不带 id 时主键永远新生成，会产生重复行。
      // 未指定 id 时先按 (user_id, server_name, character_name) 查已有行，复用其 id 做真正的更新。
      let rowId = characterData.id;
      if (!rowId) {
        const { data: existing, error: queryError } = await supabaseClient
          .from('user_characters')
          .select('id')
          .eq('user_id', currentUser.id)
          .eq('server_name', characterData.server_name || '')
          .eq('character_name', characterData.character_name || '')
          .maybeSingle();
        if (queryError) throw queryError;
        if (existing) rowId = existing.id;
      }
      const { data, error } = await supabaseClient
        .from('user_characters')
        .upsert({
          user_id: currentUser.id,
          ...characterData,
          id: rowId || undefined,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (e) {
      console.error('保存用户角色失败:', e);
      return null;
    }
  }

  // 删除用户角色
  async function deleteUserCharacter(characterId) {
    if (!isCloudMode || !currentUser) return false;
    try {
      const { error } = await supabaseClient
        .from('user_characters')
        .delete()
        .eq('id', characterId)
        .eq('user_id', currentUser.id);
      if (error) throw error;
      return true;
    } catch (e) {
      console.error('删除用户角色失败:', e);
      return false;
    }
  }

  // 获取通知列表
  async function getNotifications(limit = 50) {
    if (!isCloudMode || !currentUser) return [];
    try {
      const { data, error } = await supabaseClient
        .from('notifications')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error('获取通知失败:', e);
      return [];
    }
  }

  // 获取未读通知数量
  async function getUnreadNotificationCount() {
    if (!isCloudMode || !currentUser) return 0;
    try {
      const { data, error } = await supabaseClient
        .rpc('get_unread_notification_count', { p_user_id: currentUser.id });
      if (error) throw error;
      return data || 0;
    } catch (e) {
      console.error('获取未读通知数量失败:', e);
      return 0;
    }
  }

  // 标记通知为已读
  async function markNotificationRead(notificationId) {
    if (!isCloudMode || !currentUser) return false;
    try {
      const { error } = await supabaseClient
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('user_id', currentUser.id);
      if (error) throw error;
      return true;
    } catch (e) {
      console.error('标记通知已读失败:', e);
      return false;
    }
  }

  // 标记所有通知为已读
  async function markAllNotificationsRead() {
    if (!isCloudMode || !currentUser) return false;
    try {
      const { error } = await supabaseClient
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', currentUser.id)
        .eq('is_read', false);
      if (error) throw error;
      return true;
    } catch (e) {
      console.error('标记所有通知已读失败:', e);
      return false;
    }
  }

  // 解析英雄榜 URL
  function parseArmoryUrl(url) {
    if (!url) return null;
    
    // 匹配不同区域的英雄榜 URL
    // CN: https://worldofwarcraft.blizzard.cn/character-profile/服务器/角色名
    // Asia: https://worldofwarcraft.blizzard.com/character-profile/服务器/角色名
    // US/EU: https://worldofwarcraft.blizzard.com/character-profile/服务器/角色名
    const patterns = [
      /blizzard\.cn\/character-profile\/([^\/]+)\/([^\/\?]+)/i,
      /blizzard\.com\/character-profile\/([^\/]+)\/([^\/\?]+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        const serverName = decodeURIComponent(match[1]);
        const characterName = decodeURIComponent(match[2]);
        let region = 'CN';
        if (url.includes('blizzard.cn')) region = 'CN';
        else if (url.includes('asia')) region = 'Asia';
        else region = 'US-EU';
        
        return {
          server_name: serverName,
          server_region: region,
          character_name: characterName,
          armory_url: url
        };
      }
    }
    
    return null;
  }

  // ---- 暴露全局接口 ----
  window.CloudSync = {
    init: initSupabase,
    setupAuthListener: setupAuthListener,
    signIn: cloudSignIn,
    signUp: cloudSignUp,
    signOut: cloudSignOut,
    getCurrentUser: getCurrentUser,
    createGuild: createGuild,
    joinGuild: joinGuild,
    joinGuildById: joinGuildById,
    selectGuild: selectGuild,
    updateGuildProfile: updateGuildProfile,
    loadUserGuilds: loadUserGuilds,
    loadCloudData: loadCloudData,
    saveCloudData: saveCloudData,
    reloadData: reloadData,
    getGuildMembers: getGuildMembers,
    updateMemberRole: updateMemberRole,
    removeGuildMember: removeGuildMember,
    clearCurrentGuild: clearCurrentGuild,
    deleteGuild: deleteGuildCloud,
    leaveGuild: leaveGuildCloud,
    resetGuildData: resetGuildDataCloud,
    canEdit: canEdit,
    isOwner: isOwner,
    showAuthView: showAuthView,
    showAppView: showAppView,
    isCloudMode: () => isCloudMode,
    getCurrentGuild: () => currentGuild,
    // BUG-023（任务书 #12）：同步读取当前用户（localStorage 视图偏好 key 需 userId，渲染链路是同步的）
    getCachedUser: () => currentUser,
    getCurrentMembership: () => currentMembership,
    getUserGuilds: () => userGuilds,
    getWowServers: getWowServers,
    getAllWowServers: getAllWowServers,
    dbQuery: dbQuery,
    // REQ-032/033（任务书 #11）：前端调 /api/wcl/* 端点需复用同一途径取用户 JWT
    getAccessToken: getAccessToken,
    // 用户中心
    getUserProfile: getUserProfile,
    saveUserProfile: saveUserProfile,
    getUserCharacters: getUserCharacters,
    saveUserCharacter: saveUserCharacter,
    deleteUserCharacter: deleteUserCharacter,
    getNotifications: getNotifications,
    getUnreadNotificationCount: getUnreadNotificationCount,
    markNotificationRead: markNotificationRead,
    markAllNotificationsRead: markAllNotificationsRead,
    parseArmoryUrl: parseArmoryUrl,
    setAppData: (data) => { if (typeof window !== 'undefined') window.appData = data; },
  };

})();
