// ==================== 数据管理 ====================
const STORAGE_KEY = 'wow_raid_attendance_data';

let appData = {
  members: [],
  activities: [],
  loots: [],
  wishlist: []
};

// 暴露 appData 到 window 供 cloud.js 使用
window.appData = appData;

let editingMemberId = null;
let editingActivityId = null;
let currentActivityId = null;
let reportRange = 7;
let calendarDate = new Date();
let attendanceView = 'calendar';

// 职业映射
const classMap = {
  '战士': 'warrior', '法师': 'mage', '牧师': 'priest', '盗贼': 'rogue',
  '猎人': 'hunter', '圣骑士': 'paladin', '萨满': 'shaman', '德鲁伊': 'druid',
  '术士': 'warlock', '武僧': 'monk', '恶魔猎手': 'dh', '死亡骑士': 'dk',
  '唤魔师': 'evoker'
};

// 职业-专精映射
const classSpecMap = {
  '战士': ['防护', '武器', '狂怒'],
  '盗贼': ['刺杀', '狂徒', '敏锐'],
  '圣骑士': ['防护', '神圣', '惩戒'],
  '法师': ['冰霜', '火焰', '奥术'],
  '术士': ['恶魔学识', '毁灭', '痛苦'],
  '猎人': ['野兽控制', '射击', '生存'],
  '恶魔猎手': ['复仇', '浩劫', '噬灭'],
  '死亡骑士': ['鲜血', '冰霜', '邪恶'],
  '萨满': ['恢复', '增强', '元素'],
  '德鲁伊': ['守护', '野性', '平衡', '恢复'],
  '唤魔师': ['湮灭', '恩护', '增辉'],
  '武僧': ['酒仙', '踏风', '织雾'],
  '牧师': ['戒律', '神圣', '暗影']
};

// 职责-类型映射
const roleTypeMap = {
  '坦克': 'tank',
  '治疗': 'healer',
  '输出': 'dps'
};

// 团本-BOSS映射
const raidBossMap = {
  '虚影尖塔': ['元首阿福扎恩', '弗拉希乌斯', '陨落之王萨哈达尔', '威厄高尔和艾佐拉克', '光盲先锋', '宇宙之冕'],
  '梦境裂隙': ['奇美鲁斯（未梦之神）'],
  '进军奎尔丹纳斯': ['贝洛朗（奥的子嗣）', '至暗之夜降临'],
  '孢陨幽境': ['腐沼']
};

// 当前弹窗中选中的职责
let modalSelectedRoles = [];
let modalCurrentOffSpecs = [];

// 加载数据
function loadData() {
  // 云端模式下，数据由 CloudSync.loadCloudData() 加载到 appData，不需要从 localStorage 读取
  if (window.CloudSync && window.CloudSync.isCloudMode()) {
    // 确保 appData 结构完整
    if (!appData.loots) appData.loots = [];
    if (!appData.wishlist) appData.wishlist = [];
    return;
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      appData = JSON.parse(saved);
      // 确保loots字段存在
      if (!appData.loots) appData.loots = [];
      // 确保wishlist字段存在
      if (!appData.wishlist) appData.wishlist = [];
      // 数据迁移：旧版 spec 字段 -> main_spec / off_spec
      // 旧成员没有 role 字段的，默认为空数组
      // off_spec 字符串 -> off_specs 数组迁移
      if (appData.members && appData.members.length) {
        appData.members = appData.members.map(m => {
          const migrated = { ...m };
          // spec -> main_spec 迁移
          if (migrated.spec !== undefined && migrated.main_spec === undefined) {
            migrated.main_spec = migrated.spec;
          }
          if (migrated.off_spec === undefined) {
            migrated.off_spec = '';
          }
          // off_spec 字符串 -> off_specs 数组迁移
          if (migrated.off_specs === undefined) {
            if (migrated.off_spec && typeof migrated.off_spec === 'string') {
              migrated.off_specs = [migrated.off_spec];
            } else if (Array.isArray(migrated.off_spec)) {
              migrated.off_specs = migrated.off_spec;
            } else {
              migrated.off_specs = [];
            }
          }
          // role 默认空数组
          if (migrated.role === undefined) {
            migrated.role = [];
          }
          return migrated;
        });
      }
    }
  } catch (e) {
    console.error('加载数据失败', e);
  }
}

// ==================== 用户中心功能 ====================

// 打开用户中心
async function openUserCenter() {
  openModal('userCenterModal');
  await loadUserProfile();
  await loadUserCharacters();
  await loadNotifications();
}

// 切换用户中心标签页
function switchUserTab(tabName) {
  document.querySelectorAll('.uc-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.uc-tab-content').forEach(c => c.style.display = 'none');
  
  const tab = document.querySelector(`.uc-tab[data-tab="${tabName}"]`);
  const content = document.getElementById(`tab-${tabName}`);
  
  if (tab) tab.classList.add('active');
  if (content) content.style.display = 'block';
  
  if (tabName === 'notifications') {
    loadNotifications();
  }
}

// 加载用户资料
async function loadUserProfile() {
  try {
    const user = await window.CloudSync.getCurrentUser();
    if (!user) return;
    
    document.getElementById('ucEmail').value = user.email || '';
    
    const profile = await window.CloudSync.getUserProfile();
    if (profile) {
      document.getElementById('ucDisplayName').value = profile.display_name || '';
    } else {
      document.getElementById('ucDisplayName').value = '';
    }
  } catch (e) {
    console.error('加载用户资料失败:', e);
  }
}

// 保存用户资料
async function saveUserProfile() {
  const displayName = document.getElementById('ucDisplayName').value.trim();
  try {
    await window.CloudSync.saveUserProfile({ display_name: displayName });
    alert('资料已保存');
  } catch (e) {
    alert('保存失败：' + e.message);
  }
}

// 加载用户角色列表
async function loadUserCharacters() {
  const container = document.getElementById('characterList');
  if (!container) return;
  
  try {
    const characters = await window.CloudSync.getUserCharacters();
    
    if (characters.length === 0) {
      container.innerHTML = '<p class="uc-empty">暂无角色，点击上方按钮添加</p>';
      return;
    }
    
    const regionLabels = { 'CN': '国服', 'Asia': '亚服', 'US-EU': '欧美服' };
    const factionLabels = { 'Alliance': '联盟', 'Horde': '部落' };
    
    container.innerHTML = characters.map(c => `
      <div class="uc-character-card">
        <div class="uc-character-header">
          <div>
            <span class="uc-character-name">${c.character_name}</span>
            <span class="uc-character-server">${c.server_name}</span>
            <span class="uc-character-region">${regionLabels[c.server_region] || c.server_region}</span>
          </div>
        </div>
        <div class="uc-character-details">
          ${c.class ? `<div class="uc-character-detail">职业：<span>${c.class}</span></div>` : ''}
          ${c.spec ? `<div class="uc-character-detail">专精：<span>${c.spec}</span></div>` : ''}
          ${c.race ? `<div class="uc-character-detail">种族：<span>${c.race}</span></div>` : ''}
          ${c.faction ? `<div class="uc-character-detail">阵营：<span>${factionLabels[c.faction] || c.faction}</span></div>` : ''}
          ${c.level ? `<div class="uc-character-detail">等级：<span>${c.level}</span></div>` : ''}
          ${c.item_level ? `<div class="uc-character-detail">装等：<span>${c.item_level}</span></div>` : ''}
          ${c.guild_name ? `<div class="uc-character-detail">公会：<span>${c.guild_name}</span></div>` : ''}
        </div>
        ${c.armory_url ? `<div class="uc-character-armory"><a href="${c.armory_url}" target="_blank" rel="noopener">查看英雄榜 →</a></div>` : ''}
        <div class="uc-character-actions">
          <button class="uc-btn uc-btn-danger" onclick="deleteCharacter('${c.id}')">删除</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error('加载角色列表失败:', e);
    container.innerHTML = '<p class="uc-empty">加载失败</p>';
  }
}

// 打开添加角色模态框
function openAddCharacterModal() {
  document.getElementById('charArmoryUrl').value = '';
  document.getElementById('charName').value = '';
  document.getElementById('charServer').value = '';
  document.getElementById('charRegion').value = 'CN';
  document.getElementById('charFaction').value = '';
  document.getElementById('charClass').value = '';
  document.getElementById('charSpec').value = '';
  document.getElementById('charLevel').value = '';
  document.getElementById('charItemLevel').value = '';
  document.getElementById('charRace').value = '';
  document.getElementById('charGuild').value = '';
  openModal('addCharacterModal');
}

// 解析英雄榜 URL 输入
function parseArmoryUrlInput() {
  const url = document.getElementById('charArmoryUrl').value.trim();
  if (!url) return;
  
  const parsed = parseArmoryUrl(url);
  if (parsed) {
    if (parsed.characterName) document.getElementById('charName').value = parsed.characterName;
    if (parsed.serverName) document.getElementById('charServer').value = parsed.serverName;
    if (parsed.region) document.getElementById('charRegion').value = parsed.region;
  }
}

// 解析英雄榜 URL
function parseArmoryUrl(url) {
  if (!url) return null;
  
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // 判断区域
    let region = 'CN';
    if (hostname.includes('.blizzard.cn') || hostname.includes('battlenet.com.cn')) {
      region = 'CN';
    } else if (hostname.includes('.blizzard.com')) {
      region = 'US-EU';
    }
    
    // 获取路径和 hash
    let path = urlObj.pathname;
    const hash = urlObj.hash ? urlObj.hash.substring(1) : '';
    
    // 合并路径和 hash 进行处理
    const fullPath = hash ? path + '/' + hash : path;
    const pathParts = fullPath.split('/').filter(p => p);
    
    // 支持多种 URL 格式：
    // 1. /character-profile/服务器/角色名
    // 2. /character/#服务器/角色名
    // 3. /character-profile/区域/服务器/角色名
    
    let serverName = '';
    let characterName = '';
    
    // 查找 character 或 character-profile 关键字
    const charIndex = pathParts.findIndex(p => p === 'character' || p === 'character-profile');
    
    if (charIndex !== -1) {
      const remaining = pathParts.slice(charIndex + 1);
      
      // 移除可能的区域标识
      let startIdx = 0;
      if (remaining[0] && ['us', 'eu', 'kr', 'tw', 'cn'].includes(remaining[0].toLowerCase())) {
        startIdx = 1;
      }
      
      // 提取服务器和角色名
      if (remaining.length >= startIdx + 2) {
        serverName = decodeURIComponent(remaining[startIdx]);
        characterName = decodeURIComponent(remaining[startIdx + 1]);
      } else if (remaining.length === startIdx + 1) {
        characterName = decodeURIComponent(remaining[startIdx]);
      }
    }
    
    if (!serverName && !characterName) return null;
    
    return { region, serverName, characterName };
  } catch (e) {
    return null;
  }
}

// 保存角色
async function saveCharacter() {
  const characterData = {
    character_name: document.getElementById('charName').value.trim(),
    server_name: document.getElementById('charServer').value.trim(),
    server_region: document.getElementById('charRegion').value,
    armory_url: document.getElementById('charArmoryUrl').value.trim(),
    faction: document.getElementById('charFaction').value,
    class: document.getElementById('charClass').value,
    spec: document.getElementById('charSpec').value.trim(),
    level: parseInt(document.getElementById('charLevel').value) || null,
    item_level: parseInt(document.getElementById('charItemLevel').value) || null,
    race: document.getElementById('charRace').value.trim(),
    guild_name: document.getElementById('charGuild').value.trim()
  };
  
  if (!characterData.character_name || !characterData.server_name) {
    alert('请填写角色名称和服务器');
    return;
  }

  // REQ-002②：同一服务器内角色名唯一，不同服务器允许重名
  try {
    const existingChars = await window.CloudSync.getUserCharacters();
    const dup = (existingChars || []).some(c =>
      c.server_name === characterData.server_name && c.character_name === characterData.character_name
    );
    if (dup) {
      alert(`服务器「${characterData.server_name}」已存在同名角色「${characterData.character_name}」`);
      return;
    }
  } catch (e) {
    console.error('角色查重失败:', e);
    // 查重失败不阻断保存，由数据库唯一索引兜底
  }

  try {
    await window.CloudSync.saveUserCharacter(characterData);
    closeModal('addCharacterModal');
    await loadUserCharacters();
  } catch (e) {
    alert('保存失败：' + e.message);
  }
}

// 删除角色
async function deleteCharacter(characterId) {
  if (!confirm('确定要删除这个角色吗？')) return;
  
  try {
    await window.CloudSync.deleteUserCharacter(characterId);
    await loadUserCharacters();
  } catch (e) {
    alert('删除失败：' + e.message);
  }
}

// 加载通知列表
async function loadNotifications() {
  const container = document.getElementById('notificationList');
  const badge = document.getElementById('notifBadge');
  if (!container) return;
  
  try {
    const notifications = await window.CloudSync.getNotifications();
    
    // 更新徽章
    const unreadCount = notifications.filter(n => !n.is_read).length;
    if (badge) {
      if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }
    
    // 更新侧边栏通知点
    const notifDot = document.querySelector('.user-center-btn .notif-dot');
    if (notifDot) {
      if (unreadCount > 0) {
        notifDot.classList.add('show');
      } else {
        notifDot.classList.remove('show');
      }
    }
    
    if (notifications.length === 0) {
      container.innerHTML = '<p class="uc-empty">暂无通知</p>';
      return;
    }
    
    const typeIcons = {
      'member_join': '👋',
      'member_leave': '👋',
      'role_change': '🔑',
      'guild_invite': '✉️'
    };
    
    container.innerHTML = notifications.map(n => {
      const timeStr = new Date(n.created_at).toLocaleString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      return `
        <div class="uc-notification-item ${n.is_read ? 'read' : 'unread'}" onclick="markNotificationRead('${n.id}')">
          <div class="uc-notification-header">
            <span class="uc-notification-title">${typeIcons[n.type] || '📢'} ${n.title}</span>
            <span class="uc-notification-time">${timeStr}</span>
          </div>
          <div class="uc-notification-message">${n.message}</div>
          ${n.type === 'guild_invite' && !n.is_read ? `
            <div class="uc-notification-actions">
              <button class="uc-btn uc-btn-primary" onclick="acceptGuildInvite('${n.guild_id}', '${n.id}')">接受邀请</button>
              <button class="uc-btn uc-btn-secondary" onclick="declineGuildInvite('${n.id}')">拒绝</button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error('加载通知失败:', e);
    container.innerHTML = '<p class="uc-empty">加载失败</p>';
  }
}

// 标记通知为已读
async function markNotificationRead(notificationId) {
  try {
    await window.CloudSync.markNotificationRead(notificationId);
    await loadNotifications();
  } catch (e) {
    console.error('标记已读失败:', e);
  }
}

// 全部标记已读
async function markAllNotificationsRead() {
  try {
    await window.CloudSync.markAllNotificationsRead();
    await loadNotifications();
  } catch (e) {
    console.error('全部标记已读失败:', e);
  }
}

// 接受公会邀请
async function acceptGuildInvite(guildId, notificationId) {
  try {
    await window.CloudSync.joinGuildById(guildId);
    await markNotificationRead(notificationId);
    showAppView();
  } catch (e) {
    alert('加入失败：' + e.message);
  }
}

// 拒绝公会邀请
async function declineGuildInvite(notificationId) {
  try {
    await markNotificationRead(notificationId);
  } catch (e) {
    console.error('操作失败:', e);
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
  // 云端同步 - 异步不阻塞
  if (window.CloudSync && window.CloudSync.isCloudMode()) {
    // 延迟同步，避免频繁写入
    clearTimeout(window._cloudSyncTimer);
    window._cloudSyncTimer = setTimeout(() => {
      syncAllToCloud();
    }, 500);
  }
}

// 全量同步到云端（用于批量操作后）
async function syncAllToCloud() {
  if (!window.CloudSync || !window.CloudSync.isCloudMode()) return;
  try {
    // V2.1 修复：不再直接重新加载云端数据覆盖本地，避免刚保存的本地数据被旧云端数据覆盖
    // 单个编辑操作已通过 cloudCrud 实时同步到云端
    // 如需拉取其他会话的最新数据，请刷新页面或切换公会
    console.log('全量同步跳过，避免覆盖本地未同步完成的数据');
  } catch (e) {
    console.error('全量同步失败', e);
  }
}

// V2.1 数据架构稳定修复：统一 CRUD 严格数据流
// Supabase 是唯一主数据源；localStorage 仅作缓存；JSON 仅作备份/迁移。
// 流程：写入 DB -> 重新读取 DB -> 更新 appData -> 渲染
async function cloudCrud(dataType, operation, payload, options = {}) {
  const { renderFn, onSuccess, onError, reloadTypes } = options;

  try {
    // 1. 写入主数据源（Supabase）
    await window.CloudSync.saveCloudData(dataType, operation, payload);

    // 2. 重新读取数据库最新状态并更新 appData
    await window.CloudSync.reloadData(dataType);
    const typesToReload = reloadTypes || [];
    for (const t of typesToReload) {
      await window.CloudSync.reloadData(t);
    }

    // 3. 缓存到 localStorage（仅作为缓存）
    saveData();

    // 4. 渲染当前模块
    if (typeof renderFn === 'function') renderFn();
    if (typeof onSuccess === 'function') onSuccess();
    return { success: true };
  } catch (e) {
    console.error(`cloudCrud 失败 [${dataType}/${operation}]:`, e);
    showToast('保存失败: ' + (e.message || '未知错误'), 'error');
    if (typeof onError === 'function') onError(e);
    throw e;
  }
}

// V2.1 数据持久化稳定性（兼容旧调用，已委托给 cloudCrud）
async function syncToCloudAndReload(dataType, operation, item, extra, renderFn) {
  return cloudCrud(dataType, operation, item, { renderFn });
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ==================== 认证与公会管理 ====================

// 显示认证错误
function showAuthError(msg) {
  const el = document.getElementById('authError');
  if (el) el.textContent = msg;
}

// BUG-009：Supabase Auth 英文错误 → 中文提示映射
function mapAuthError(e) {
  const msg = (e && (e.message || e.error_description || e.msg)) || '';
  const lower = msg.toLowerCase();
  if (lower.includes('invalid login credentials')) return '邮箱或密码错误';
  if (lower.includes('user already registered')) return '该邮箱已注册，请直接登录';
  if (lower.includes('email not confirmed')) return '邮箱尚未验证，请先完成邮箱验证';
  if (lower.includes('password') && (lower.includes('at least') || lower.includes('too short') || lower.includes('weak'))) return '密码不符合要求（至少 6 位）';
  if (lower.includes('unable to validate email') || lower.includes('invalid email') || lower.includes('email address') && lower.includes('invalid')) return '邮箱格式不正确';
  if (lower.includes('signups not allowed') || lower.includes('signup') && lower.includes('disabled')) return '当前未开放注册，请联系管理员';
  if (lower.includes('for security purposes') || lower.includes('rate limit') || lower.includes('too many requests')) return '操作过于频繁，请稍后再试';
  if (lower.includes('failed to fetch') || lower.includes('network') || lower.includes('load failed')) return '网络连接失败，请检查网络后重试';
  return msg || '操作失败，请重试';
}

// 显示登录表单
function showLoginForm() {
  document.getElementById('authLoginForm').style.display = '';
  document.getElementById('authRegisterForm').style.display = 'none';
  document.getElementById('authGuildForm').style.display = 'none';
  showAuthError('');
}

// 显示注册表单
function showRegisterForm() {
  document.getElementById('authLoginForm').style.display = 'none';
  document.getElementById('authRegisterForm').style.display = '';
  document.getElementById('authGuildForm').style.display = 'none';
  showAuthError('');
}

// 显示公会选择表单
function showGuildForm() {
  // 确保认证遮罩层显示
  const authOverlay = document.getElementById('authOverlay');
  if (authOverlay) authOverlay.style.display = 'flex';
  // 隐藏登录/注册表单，显示公会表单
  const loginForm = document.getElementById('authLoginForm');
  const registerForm = document.getElementById('authRegisterForm');
  const guildForm = document.getElementById('authGuildForm');
  if (loginForm) loginForm.style.display = 'none';
  if (registerForm) registerForm.style.display = 'none';
  if (guildForm) guildForm.style.display = '';
  showAuthError('');
}

// 登录
async function handleLogin() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  if (!email || !password) { showAuthError('请填写邮箱和密码'); return; }

  try {
    showAuthError('登录中...');
    await window.CloudSync.signIn(email, password);
    // 检查是否有公会
    const guilds = window.CloudSync.getUserGuilds();
    if (guilds.length === 0) {
      // 没有公会，显示创建/加入公会表单
      showGuildForm();
    } else {
      // 有公会，跳转到应用界面
      showAppView();
    }
  } catch (e) {
    showAuthError(mapAuthError(e) || '登录失败');
  }
}

// 注册
async function handleRegister() {
  const displayName = document.getElementById('regDisplayName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  if (!email || !password) { showAuthError('请填写邮箱和密码'); return; }
  if (password.length < 6) { showAuthError('密码至少6位'); return; }

  try {
    showAuthError('注册中...');
    await window.CloudSync.signUp(email, password, displayName);
    // 注册后一定没有公会，显示创建/加入公会表单
    showGuildForm();
  } catch (e) {
    showAuthError(mapAuthError(e) || '注册失败');
  }
}

// 服务器搜索（全区域）
function getAllServers() {
  const servers = window.CloudSync.getWowServers();
  const all = [];
  for (const region in servers) {
    if (servers[region]) {
      servers[region].forEach(name => all.push({ name, region }));
    }
  }
  return all;
}

function searchAllServers(query) {
  const filter = query.trim().toLowerCase();
  if (!filter) return getAllServers();
  return getAllServers().filter(s => s.name.toLowerCase().includes(filter));
}

function showServerDropdown() {
  const dropdown = document.getElementById('serverDropdown');
  if (dropdown) {
    filterServerList();
    dropdown.style.display = 'block';
  }
}

function hideServerDropdown() {
  setTimeout(() => {
    const dropdown = document.getElementById('serverDropdown');
    if (dropdown) dropdown.style.display = 'none';
  }, 200);
}

function filterServerList() {
  const input = document.getElementById('serverNameInput');
  const dropdown = document.getElementById('serverDropdown');
  if (!input || !dropdown) return;
  const filter = input.value.trim().toLowerCase();
  dropdown.innerHTML = '';
  
  const results = searchAllServers(filter);
  
  // 如果只有一个精确匹配，自动关联区域
  const exactMatches = results.filter(s => s.name.toLowerCase() === filter);
  if (exactMatches.length === 1) {
    const match = exactMatches[0];
    const regionSelect = document.getElementById('serverRegion');
    if (regionSelect && regionSelect.value !== match.region) {
      regionSelect.value = match.region;
    }
  }
  
  if (results.length === 0) {
    if (filter) {
      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.textContent = '使用：' + input.value.trim();
      item.style.color = '#f0c060';
      item.onclick = () => { dropdown.style.display = 'none'; };
      dropdown.appendChild(item);
    } else {
      dropdown.innerHTML = '<div class="autocomplete-item disabled">输入服务器名称搜索</div>';
    }
    return;
  }
  
  results.forEach(({ name, region }) => {
    const item = document.createElement('div');
    item.className = 'autocomplete-item';
    item.innerHTML = '<span>' + name + '</span><span style="color:#6e7681;font-size:11px;margin-left:8px;">' + region + '</span>';
    item.onclick = () => {
      input.value = name;
      const regionSelect = document.getElementById('serverRegion');
      if (regionSelect) regionSelect.value = region;
      dropdown.style.display = 'none';
    };
    dropdown.appendChild(item);
  });
  
  // 添加自定义输入选项
  if (filter && results.every(r => r.name.toLowerCase() !== filter)) {
    const item = document.createElement('div');
    item.className = 'autocomplete-item';
    item.textContent = '使用：' + input.value.trim();
    item.style.color = '#f0c060';
    item.onclick = () => { dropdown.style.display = 'none'; };
    dropdown.appendChild(item);
  }
}

function toggleManualServer() {}

// 创建公会
async function handleCreateGuild() {
  const nameEl = document.getElementById('newGuildName');
  const name = nameEl ? nameEl.value.trim() : '';
  if (!name) { showAuthError('请输入公会名称'); return; }

  const serverInput = document.getElementById('serverNameInput');
  const regionSelect = document.getElementById('serverRegion');
  const serverName = serverInput ? serverInput.value.trim() : '';
  const serverRegion = regionSelect ? regionSelect.value : '';

  try {
    showAuthError('创建中...');
    await window.CloudSync.createGuild(name, serverName, serverRegion);
    showAppView();
  } catch (e) {
    showAuthError('创建失败：' + (e.message || '未知错误'));
  }
}

// 加入公会
async function handleJoinGuild() {
  const code = document.getElementById('joinInviteCode').value.trim().toUpperCase();
  if (!code) { showAuthError('请输入邀请码'); return; }

  try {
    showAuthError('加入中...');
    await window.CloudSync.joinGuild(code);
    showAppView();
  } catch (e) {
    showAuthError(e.message || '加入失败');
  }
}

// 打开公会设置
async function openGuildSettings() {
  const guild = window.CloudSync.getCurrentGuild();
  if (!guild) return;

  document.getElementById('settingsGuildName').textContent = guild.name;
  document.getElementById('settingsGuildId').textContent = guild.id;
  document.getElementById('settingsInviteCode').textContent = guild.invite_code;
  
  // 显示服务器信息
  const serverInfo = [];
  if (guild.server_region) serverInfo.push(guild.server_region);
  if (guild.server_name) serverInfo.push(guild.server_name);
  document.getElementById('settingsServer').textContent = serverInfo.length > 0 ? serverInfo.join(' - ') : '未设置';

  // 非 owner 隐藏危险操作
  const dangerZone = document.getElementById('dangerZone');
  if (dangerZone) {
    dangerZone.style.display = window.CloudSync.isOwner() ? '' : 'none';
  }

  openModal('guildSettingsModal');
  await loadGuildMembers();
}

// 加载公会成员列表
async function loadGuildMembers() {
  const container = document.getElementById('guildMembersList');
  if (!container) return;

  try {
    const members = await window.CloudSync.getGuildMembers();
    const currentUserId = (await window.CloudSync.getCurrentUser())?.id;
    const isOwner = window.CloudSync.isOwner();

    if (members.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px">暂无成员</div>';
      return;
    }

    const roleLabels = { owner: '会长', editor: '编辑', viewer: '浏览' };
    const roleClasses = { owner: 'role-owner', editor: 'role-editor', viewer: 'role-viewer' };

    container.innerHTML = members.map(m => `
      <div class="guild-member-item">
        <div class="guild-member-info">
          <div>
            <div class="guild-member-name">${m.display_name}${m.user_id === currentUserId ? ' (我)' : ''}</div>
          </div>
        </div>
        <div class="guild-member-actions">
          <span class="guild-member-role ${roleClasses[m.role] || ''}">${roleLabels[m.role] || m.role}</span>
          ${isOwner && m.user_id !== currentUserId ? `
            <select onchange="handleChangeRole('${m.id}', this.value)">
              <option value="viewer" ${m.role === 'viewer' ? 'selected' : ''}>浏览</option>
              <option value="editor" ${m.role === 'editor' ? 'selected' : ''}>编辑</option>
              <option value="owner" ${m.role === 'owner' ? 'selected' : ''}>会长</option>
            </select>
            <button onclick="handleRemoveMember('${m.id}', '${m.display_name}')">移除</button>
          ` : ''}
        </div>
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = `<div style="text-align:center;color:var(--danger);padding:20px">加载失败: ${e.message}</div>`;
  }
}

// 修改成员角色
async function handleChangeRole(membershipId, newRole) {
  try {
    await window.CloudSync.updateMemberRole(membershipId, newRole);
    showToast('角色已更新', 'success');
    await loadGuildMembers();
  } catch (e) {
    showToast('更新失败: ' + e.message, 'error');
  }
}

// 移除成员
async function handleRemoveMember(membershipId, name) {
  if (!confirm(`确定要移除成员 "${name}" 吗？`)) return;
  try {
    await window.CloudSync.removeGuildMember(membershipId);
    showToast('已移除', 'success');
    await loadGuildMembers();
  } catch (e) {
    showToast('移除失败: ' + e.message, 'error');
  }
}

// 复制邀请码
function copyInviteCode() {
  const guild = window.CloudSync.getCurrentGuild();
  if (!guild) return;
  navigator.clipboard.writeText(guild.invite_code).then(() => {
    showToast('邀请码已复制', 'success');
  }).catch(() => {
    showToast('复制失败，请手动复制', 'error');
  });
}

// 退出公会
async function handleLeaveGuild() {
  if (!confirm('确定要退出此公会吗？')) return;
  try {
    const membership = window.CloudSync.getCurrentMembership();
    if (membership) {
      await window.CloudSync.removeGuildMember(membership.id);
    }
    await window.CloudSync.signOut();
    showAuthError('');
    // 重新检查公会列表
    const guilds = window.CloudSync.getUserGuilds();
    if (guilds.length === 0) {
      showGuildForm();
    }
  } catch (e) {
    showToast('退出失败: ' + e.message, 'error');
  }
}

// 打开公会切换器
async function openGuildSwitcher() {
  const guilds = window.CloudSync.getUserGuilds();
  const currentGuild = window.CloudSync.getCurrentGuild();
  const container = document.getElementById('guildSwitcherList');
  if (!container) return;

  const roleLabels = { owner: '会长', editor: '编辑', viewer: '浏览' };

  container.innerHTML = guilds.map(g => {
    let serverInfo = '';
    if (g.server_name) {
      serverInfo = `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${g.server_region || ''}${g.server_region && g.server_name ? ' - ' : ''}${g.server_name}</div>`;
    }
    return `
    <div class="guild-member-item" style="cursor:pointer;${g.id === currentGuild?.id ? 'background:rgba(240,192,96,0.08);border-color:var(--gold)' : ''}" onclick="handleSwitchGuild('${g.id}')">
      <div class="guild-member-info">
        <div>
          <div class="guild-member-name">${g.name}${g.id === currentGuild?.id ? ' ✓' : ''}</div>
          ${serverInfo}
        </div>
      </div>
      <span class="guild-member-role role-${g.my_role}">${roleLabels[g.my_role] || g.my_role}</span>
    </div>
  `;
  }).join('');

  // 添加退出登录按钮
  container.innerHTML += `
    <div style="padding:16px;border-top:1px solid var(--border-color);margin-top:8px">
      <button class="btn" style="width:100%" onclick="handleSignOut()">退出登录</button>
    </div>
  `;

  openModal('guildSwitcherModal');
}

// 切换公会
async function handleSwitchGuild(guildId) {
  try {
    await window.CloudSync.selectGuild(guildId);
    closeModal('guildSwitcherModal');
    renderCurrentPage();
    showToast('已切换公会', 'success');
  } catch (e) {
    showToast('切换失败: ' + e.message, 'error');
  }
}

// 退出登录
async function handleSignOut() {
  await window.CloudSync.signOut();
  closeModal('guildSwitcherModal');
}

// 显示应用视图（登录后）
function showAppView() {
  const authOverlay = document.getElementById('authOverlay');
  const appContainer = document.querySelector('.app-container');
  if (authOverlay) authOverlay.style.display = 'none';
  if (appContainer) appContainer.style.display = '';

  // 更新 UI
  updateCloudUI();
  updatePermissionUI();
  loadData();
  renderCurrentPage();
}

// BUG-012：viewer 权限门。viewer 登录后隐藏/禁用全部写入口（界面收口，
// 真正防线在 server.js 代理鉴权）。切换公会/登录/登出后都需调用。
function updatePermissionUI() {
  const isViewer = !!(window.CloudSync && window.CloudSync.isCloudMode() && !window.CloudSync.canEdit());
  document.body.classList.toggle('viewer-mode', isViewer);
}

// 更新云端模式 UI
function updateCloudUI() {
  const guildBar = document.getElementById('guildBar');
  const guildSwitchBtn = document.getElementById('guildSwitchBtn');
  const sidebarUser = document.getElementById('sidebarUser');
  const guildName = document.getElementById('guildName');
  const userInfo = document.getElementById('userInfo');

  if (window.CloudSync && window.CloudSync.isCloudMode()) {
    const guild = window.CloudSync.getCurrentGuild();
    const membership = window.CloudSync.getCurrentMembership();
    const user = window.CloudSync.getCurrentUser ? null : null; // async, skip

    if (guildBar) guildBar.style.display = guild ? '' : 'none';
    if (guildSwitchBtn) guildSwitchBtn.style.display = '';
    if (guild && guildName) {
      // 显示公会名称 + 服务器信息
      let displayName = guild.name;
      if (guild.server_name) {
        displayName += ` (${guild.server_name})`;
      }
      guildName.textContent = displayName;
    }
    if (membership) {
      const roleLabels = { owner: '会长', editor: '编辑', viewer: '浏览' };
      const guildRole = document.getElementById('guildRole');
      if (guildRole) guildRole.textContent = roleLabels[membership.role] || membership.role;
    }
    if (guild) {
      const guildBarName = document.getElementById('guildBarName');
      if (guildBarName) {
        let displayName = guild.name;
        if (guild.server_name) {
          displayName += ` (${guild.server_name})`;
        }
        guildBarName.textContent = displayName;
      }
    }
    const cloudSyncStatus = document.getElementById('cloudSyncStatus');
    if (cloudSyncStatus) cloudSyncStatus.textContent = '数据已云端同步';
  } else {
    if (guildBar) guildBar.style.display = 'none';
    if (guildSwitchBtn) guildSwitchBtn.style.display = 'none';
  }
}

// 渲染当前页面
function renderCurrentPage() {
  const activePage = document.querySelector('.nav-item.active');
  const page = activePage ? activePage.getAttribute('data-page') : 'dashboard';
  switch (page) {
    case 'dashboard': renderDashboard(); break;
    case 'members': renderMembers(); break;
    case 'attendance': renderAttendance(); break;
    case 'loot': renderLoot(); break;
    case 'wishlist': renderWishlist(); break;
    case 'reports': renderReports(); break;
    case 'data': renderDataPage(); break;
  }
}

// ==================== 提示消息 ====================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ==================== 页面切换 ====================
const pageTitles = {
  dashboard: '仪表盘',
  members: '成员管理',
  attendance: '考勤记录',
  loot: '装备分配',
  wishlist: '心愿单',
  reports: '统计报表',
  data: '数据管理',
  changelog: '更新日志'
};

function switchPage(pageName) {
  // 切换导航激活状态
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === pageName);
  });
  
  // 切换页面内容
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });
  document.getElementById(`page-${pageName}`).classList.add('active');
  
  // 更新标题
  document.getElementById('pageTitle').textContent = pageTitles[pageName];
  
  // 渲染对应页面
  if (pageName === 'loot') {
    lootRender();
  }
  if (pageName === 'wishlist') {
    wishlistRender();
  }
  if (pageName === 'changelog') {
    changelogRender();
  }
  
  // 移动端关闭侧边栏
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('show');
  }
  
  // 渲染对应页面
  switch(pageName) {
    case 'dashboard': renderDashboard(); break;
    case 'members': renderMembers(); break;
    case 'attendance': renderAttendance(); break;
    case 'reports': renderReports(); break;
    case 'data': renderDataPage(); break;
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (window.innerWidth <= 768) {
    sidebar.classList.toggle('show');
  } else {
    sidebar.classList.toggle('collapsed');
    document.getElementById('mainContent').classList.toggle('full');
  }
}

// ==================== 弹窗控制 ====================
function openModal(id) {
  document.getElementById(id).classList.add('show');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

// 点击遮罩关闭弹窗
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('show');
    }
  });
});

// ==================== 仪表盘 ====================
function renderDashboard() {
  const members = appData.members.filter(m => m.status !== '离队');
  const activities = appData.activities;
  const today = formatDate(new Date());
  
  // 本月活动数
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthActivities = activities.filter(a => new Date(a.date) >= monthStart);
  
  // 今日出勤（与考勤模块口径一致：出席+替补+迟到）
  const todayActivity = activities.find(a => a.date === today);
  const todayAttendance = todayActivity ? 
    todayActivity.attendees.filter(a => a.status === '出席' || a.status === '替补' || a.status === '迟到').length : 0;
  
  // 平均出勤率
  const avgRate = calculateAvgAttendanceRate(activities);
  
  // 统计卡片
  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card">
      <div class="stat-icon">👥</div>
      <div class="stat-value">${members.length}</div>
      <div class="stat-label">团员总数</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">📅</div>
      <div class="stat-value">${monthActivities.length}</div>
      <div class="stat-label">本月活动次数</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">📊</div>
      <div class="stat-value">${avgRate}%</div>
      <div class="stat-label">平均出勤率</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">⚔</div>
      <div class="stat-value">${todayAttendance}</div>
      <div class="stat-label">今日出勤</div>
    </div>
  `;
  
  // 最近活动（与考勤模块口径一致：出席+替补+迟到）
  const recent = [...activities].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  const recentHtml = recent.length ? recent.map(a => {
    const presentCount = a.attendees.filter(att => att.status === '出席' || att.status === '替补' || att.status === '迟到').length;
    return `
      <div class="recent-item" onclick="openAttendanceDetail('${a.id}')">
        <div>
          <div class="recent-date">${a.date}</div>
          <div class="recent-raid">${a.raid_name}</div>
        </div>
        <div class="recent-count">${presentCount} 人</div>
      </div>
    `;
  }).join('') : `<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-text">暂无活动记录</div></div>`;
  document.getElementById('recentList').innerHTML = recentHtml;
  
  // Top5 排行
  renderRankList('rankListTop5', 5);
}

function calculateAvgAttendanceRate(activities) {
  if (!activities.length) return 0;
  const activeMembers = appData.members.filter(m => m.status !== '离队').length;
  if (!activeMembers) return 0;
  
  let totalRate = 0;
  activities.forEach(a => {
    const present = a.attendees.filter(att => att.status === '出席' || att.status === '替补' || att.status === '迟到').length;
    totalRate += (present / activeMembers) * 100;
  });
  return Math.round(totalRate / activities.length);
}

function renderRankList(containerId, limit) {
  const rankings = getAttendanceRankings();
  const top = rankings.slice(0, limit);
  
  const html = top.length ? top.map((item, i) => `
    <div class="rank-item">
      <div class="rank-num">${i + 1}</div>
      <div class="rank-name class-${classMap[item.member.class] || ''}">${item.member.name}</div>
      <div class="rank-rate">${item.rate}%</div>
    </div>
  `).join('') : `<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-text">暂无数据</div></div>`;
  
  document.getElementById(containerId).innerHTML = html;
}

function getAttendanceRankings() {
  const members = appData.members.filter(m => m.status !== '离队');
  const activities = getFilteredActivities();
  
  return members.map(member => {
    let present = 0, absent = 0, late = 0, sub = 0, leave = 0;
    let total = activities.length;
    
    activities.forEach(act => {
      const attendee = act.attendees.find(a => a.member_id === member.id);
      if (attendee) {
        switch(attendee.status) {
          case '出席': present++; break;
          case '缺席': absent++; break;
          case '迟到': late++; present++; break; // 迟到算出勤
          case '替补': sub++; break;
          case '请假': leave++; break;
        }
      } else {
        absent++;
      }
    });
    
    const rate = total > 0 ? Math.round(((present + sub) / total) * 100) : 0;
    
    return { member, present, absent, late, sub, leave, total, rate };
  }).sort((a, b) => b.rate - a.rate || b.present - a.present);
}

function getFilteredActivities() {
  if (reportRange === 0) return appData.activities;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - reportRange);
  return appData.activities.filter(a => new Date(a.date) >= cutoff);
}

// ==================== 成员管理 ====================
function renderMembers() {
  const search = document.getElementById('memberSearch').value.toLowerCase();
  const classFilter = document.getElementById('classFilter').value;
  
  // 职责过滤：获取所有勾选的职责
  const roleCheckboxes = document.querySelectorAll('#roleFilter input[type="checkbox"]:checked');
  const roleFilter = Array.from(roleCheckboxes).map(cb => cb.value);
  
  let filtered = appData.members.filter(m => {
    const mainSpec = m.main_spec || '';
    const offSpecs = m.off_specs || (m.off_spec ? [m.off_spec] : []);
    const offSpecText = offSpecs.join('、');
    const matchSearch = !search || m.name.toLowerCase().includes(search) || m.class.includes(search) || mainSpec.toLowerCase().includes(search) || offSpecText.toLowerCase().includes(search);
    const matchClass = !classFilter || m.class === classFilter;
    // 职责匹配：成员的role数组必须包含所有勾选的职责（AND逻辑）；未勾选任何职责则不过滤
    const memberRoles = m.role || [];
    const matchRole = roleFilter.length === 0 || roleFilter.every(r => memberRoles.includes(r));
    return matchSearch && matchClass && matchRole;
  });
  
  const tbody = document.getElementById('membersTableBody');
  
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">👥</div><div class="empty-text">暂无成员数据</div><button class="btn btn-primary" onclick="showMemberModal()">+ 添加第一个成员</button></div></td></tr>`;
    return;
  }
  
  tbody.innerHTML = filtered.map((m, i) => {
    const cls = classMap[m.class] || '';
    const rate = getMemberAttendanceRate(m.id);
    const mainSpec = m.main_spec || '';
    const offSpecs = m.off_specs || (m.off_spec ? [m.off_spec] : []);
    const offSpecText = offSpecs.join('、');
    const roles = m.role || [];
    
    // 职责标签HTML
    const roleTagsHtml = roles.length > 0 ? roles.map(r => {
      const type = roleTypeMap[r] || 'dps';
      return `<span class="member-role-tag ${type}">${r}</span>`;
    }).join('') : '';
    
    // 专精显示
    const specHtml = mainSpec 
      ? `<span>${mainSpec}</span>${offSpecText ? `<span class="off-spec-text">（副：${offSpecText}）</span>` : ''}` 
      : '-';
    
    return `
      <tr>
        <td>${i + 1}</td>
        <td class="class-${cls}" style="font-weight:500">${m.name}</td>
        <td>
          <span class="badge class-bg-${cls}" style="color:var(--${cls === 'priest' ? 'text-primary' : cls})">${m.class}</span>
          ${roleTagsHtml ? `<span class="member-role-tags">${roleTagsHtml}</span>` : ''}
        </td>
        <td style="color:var(--text-secondary)">${specHtml}</td>
        <td><span class="badge ${m.status === '正式' || m.status?.trim() === 'active' ? 'badge-present' : m.status === '替补' ? 'badge-sub' : m.status === '试用' ? 'badge-late' : 'badge-inactive'}">${(function(){ const s = (m.status || '').trim(); if (s === 'inactive') return '离队'; if (s === 'active') return '正式'; return m.status || '-'; })()}</span></td>
        <td style="color:var(--text-secondary)">${m.join_date || '-'}</td>
        <td><span style="color:${rate >= 80 ? 'var(--success)' : rate >= 60 ? 'var(--warning)' : 'var(--danger)'};font-weight:600">${rate}%</span></td>
        <td>
          <div class="action-btns">
            <button class="icon-btn" onclick="editMember('${m.id}')" title="编辑">✏️</button>
            <button class="icon-btn danger" onclick="deleteMember('${m.id}')" title="删除">🗑</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function getMemberAttendanceRate(memberId) {
  const activities = appData.activities;
  if (!activities.length) return 0;
  
  let present = 0;
  activities.forEach(act => {
    const att = act.attendees.find(a => a.member_id === memberId);
    if (att && (att.status === '出席' || att.status === '替补' || att.status === '迟到')) {
      present++;
    }
  });
  
  return Math.round((present / activities.length) * 100);
}

function showMemberModal(member = null) {
  editingMemberId = member ? member.id : null;
  document.getElementById('memberModalTitle').textContent = member ? '编辑成员' : '添加成员';
  document.getElementById('memberName').value = member ? member.name : '';
  document.getElementById('memberClass').value = member ? member.class : '';
  document.getElementById('memberStatus').value = member ? member.status : '正式';
  document.getElementById('memberJoinDate').value = member ? member.join_date || '' : formatDate(new Date());
  document.getElementById('memberNotes').value = member ? member.notes || '' : '';
  
  // 初始化职责选中状态
  modalSelectedRoles = member && member.role ? [...member.role] : [];
  updateRoleTagsUI();
  
  // 先初始化专精下拉框（职业→专精映射）
  onMemberClassChange();
  
  // 初始化副专精选中状态（数组）——必须在onMemberClassChange之后，否则会被清空
  if (member && member.off_specs && Array.isArray(member.off_specs)) {
    modalCurrentOffSpecs = [...member.off_specs];
  } else if (member && member.off_spec) {
    // 兼容旧数据：字符串转数组
    modalCurrentOffSpecs = [member.off_spec];
  } else {
    modalCurrentOffSpecs = [];
  }
  
  // 设置主专精值
  const mainSpec = member ? (member.main_spec || member.spec || '') : '';
  
  // 显示专精字段（主专精单选 + 副专精多选）
  updateSpecFieldsDisplay();
  
  if (document.getElementById('memberMainSpec')) {
    document.getElementById('memberMainSpec').value = mainSpec;
    // 设置完主专精后重新刷新副专精（排除主专精）
    if (mainSpec) {
      modalCurrentOffSpecs = modalCurrentOffSpecs.filter(s => s !== mainSpec);
      updateSpecFieldsDisplay();
    }
  }
  
  openModal('memberModal');
}

// 职业变更时更新专精下拉选项
function onMemberClassChange() {
  const cls = document.getElementById('memberClass').value;
  const specs = classSpecMap[cls] || [];
  
  // 保存当前主专精值
  const mainSelect = document.getElementById('memberMainSpec');
  const currentMain = mainSelect ? mainSelect.value : '';
  
  // 职业变更时清空副专精选中（不同职业专精不同）
  modalCurrentOffSpecs = [];
  
  // 重新渲染专精字段
  updateSpecFieldsDisplay();
  
  // 恢复主专精选中值（如果新职业也有这个专精）
  const newMainSelect = document.getElementById('memberMainSpec');
  if (newMainSelect && specs.includes(currentMain)) {
    newMainSelect.value = currentMain;
  }
}

// 切换职责选中状态
function toggleMemberRole(role) {
  const index = modalSelectedRoles.indexOf(role);
  if (index === -1) {
    modalSelectedRoles.push(role);
  } else {
    modalSelectedRoles.splice(index, 1);
  }
  updateRoleTagsUI();
  updateSpecFieldsDisplay();
}

// 更新职责标签UI
function updateRoleTagsUI() {
  document.querySelectorAll('#memberRoleTags .role-tag').forEach(tag => {
    const r = tag.dataset.role;
    tag.classList.toggle('active', modalSelectedRoles.includes(r));
  });
}

// 根据职责数量更新专精字段显示（主专精单选 + 副专精多选）
function updateSpecFieldsDisplay() {
  const container = document.getElementById('specFieldsContainer');
  const label = document.getElementById('specFieldLabel');
  if (!container) return;
  
  const cls = document.getElementById('memberClass').value;
  const specs = classSpecMap[cls] || [];
  
  // 保存当前选中的值
  const currentMain = document.getElementById('memberMainSpec') ? document.getElementById('memberMainSpec').value : '';
  // 副专精当前选中值（数组）
  let currentOffSpecs = [];
  const offCheckboxes = document.querySelectorAll('input[name="memberOffSpec"]:checked');
  offCheckboxes.forEach(cb => currentOffSpecs.push(cb.value));
  // 如果checkbox还没渲染（第一次加载），从全局变量或成员数据取
  if (currentOffSpecs.length === 0 && modalCurrentOffSpecs) {
    currentOffSpecs = modalCurrentOffSpecs;
  }
  
  label.textContent = '专精';
  
  // 主专精选项
  const mainOptionsHtml = specs.length 
    ? `<option value="">请选择主专精</option>` + specs.map(s => `<option value="${s}">${s}</option>`).join('')
    : `<option value="">请先选择职业</option>`;
  
  // 副专精checkbox选项（排除主专精）
  const offSpecsAvailable = specs.filter(s => s !== currentMain);
  const offSpecCheckboxesHtml = offSpecsAvailable.length > 0
    ? offSpecsAvailable.map(s => `
        <label class="off-spec-checkbox">
          <input type="checkbox" name="memberOffSpec" value="${s}" ${currentOffSpecs.includes(s) ? 'checked' : ''} onchange="onOffSpecChange()">
          <span>${s}</span>
        </label>
      `).join('')
    : `<span style="color:var(--text-muted);font-size:12px">${specs.length ? '请先选择主专精' : '请先选择职业'}</span>`;
  
  container.innerHTML = `
    <div class="spec-group">
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">主专精 <span style="color:var(--text-muted)">(单选)</span></div>
      <select class="form-select" id="memberMainSpec" onchange="onMainSpecChange()">
        ${mainOptionsHtml}
      </select>
    </div>
    <div class="spec-group" style="margin-top:12px">
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">副专精 <span style="color:var(--text-muted)">(可多选)</span></div>
      <div class="off-spec-checkboxes" id="offSpecCheckboxes">
        ${offSpecCheckboxesHtml}
      </div>
    </div>
  `;
  
  // 设置主专精选中值
  if (specs.includes(currentMain)) {
    document.getElementById('memberMainSpec').value = currentMain;
  }
}

// 主专精变更时刷新副专精选项
function onMainSpecChange() {
  // 保留当前副专精选中状态（过滤掉和新主专精相同的）
  const newMain = document.getElementById('memberMainSpec').value;
  modalCurrentOffSpecs = modalCurrentOffSpecs.filter(s => s !== newMain);
  updateSpecFieldsDisplay();
}

// 副专精选中状态变更
function onOffSpecChange() {
  const checked = [];
  document.querySelectorAll('input[name="memberOffSpec"]:checked').forEach(cb => {
    checked.push(cb.value);
  });
  modalCurrentOffSpecs = checked;
}

function editMember(id) {
  const member = appData.members.find(m => m.id === id);
  if (member) showMemberModal(member);
}

// 防重复提交标志
let memberSaving = false;

async function saveMember() {
  // 防重复提交
  if (memberSaving) return;
  memberSaving = true;
  const saveBtn = document.getElementById('memberSaveBtn');
  if (saveBtn) { saveBtn.dataset.originalText = saveBtn.textContent; saveBtn.disabled = true; saveBtn.textContent = '保存中...'; }

  const name = document.getElementById('memberName').value.trim();
  const cls = document.getElementById('memberClass').value;

  if (!name) { showToast('请输入角色名', 'error'); memberSaving = false; if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset.originalText || '保存'; } return; }
  if (!cls) { showToast('请选择职业', 'error'); memberSaving = false; if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset.originalText || '保存'; } return; }

  // REQ-002①：公会绑定单服务器，公会内角色名唯一（即服务器内唯一），编辑时排除自身
  const nameDuplicate = appData.members.some(m => m.name === name && m.id !== editingMemberId);
  if (nameDuplicate) { showToast(`公会内已存在同名角色「${name}」`, 'error'); memberSaving = false; if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset.originalText || '保存'; } return; }

  const mainSpec = document.getElementById('memberMainSpec') ? document.getElementById('memberMainSpec').value : '';
  // 副专精从全局变量取（多选数组）
  const offSpecs = modalCurrentOffSpecs || [];

  const memberData = {
    name,
    class: cls,
    main_spec: mainSpec,
    off_spec: offSpecs.length > 0 ? offSpecs[0] : '', // 兼容：第一个副专精
    off_specs: offSpecs,
    role: [...modalSelectedRoles],
    // 向后兼容：保留 spec 字段
    spec: mainSpec,
    status: document.getElementById('memberStatus').value,
    join_date: document.getElementById('memberJoinDate').value || formatDate(new Date()),
    notes: document.getElementById('memberNotes').value.trim()
  };

  // V2.1 数据架构稳定修复：严格遵循 Save DB -> Load DB -> Update State -> Render
  try {
    const payload = { ...memberData, id: editingMemberId || undefined };
    const operation = editingMemberId ? 'update' : 'add';
    await cloudCrud('members', operation, payload, { renderFn: renderMembers });
    closeModal('memberModal');
    showToast(editingMemberId ? '成员已更新' : '成员已添加', 'success');
  } catch (e) {
    // 弹窗保持打开，便于用户重试
  } finally {
    memberSaving = false;
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset.originalText || '保存'; }
  }
}

async function deleteMember(id) {
  if (!confirm('确定要删除这个成员吗？相关考勤记录不会被删除。')) return;

  const member = appData.members.find(m => m.id === id);
  if (!member) return;

  // 严格 DB-first
  try {
    await cloudCrud('members', 'delete', { id: member.id }, { renderFn: renderMembers });
    showToast('成员已删除', 'success');
  } catch (e) {
    // 错误已在 cloudCrud 中提示
  }
}

function showImportMembersModal() {
  document.getElementById('importMembersText').value = '';
  openModal('importMembersModal');
}

async function importMembers() {
  const text = document.getElementById('importMembersText').value.trim();
  if (!text) { showToast('请输入成员数据', 'error'); return; }

  try {
    let members;
    // 尝试解析 JSON
    if (text.startsWith('[')) {
      members = JSON.parse(text);
    } else {
      // 每行一个成员，用空格或Tab分隔 名字 职业 专精
      members = text.split('\n').filter(l => l.trim()).map(line => {
        const parts = line.trim().split(/[\s\t]+/);
        return { name: parts[0] || '', class: parts[1] || '', spec: parts[2] || '' };
      });
    }

    if (!Array.isArray(members)) throw new Error('格式错误');

    const pendingMembers = [];
    members.forEach(m => {
      if (m.name && m.class) {
        const mainSpec = m.main_spec || m.spec || '';
        // 副专精：优先数组，其次字符串转数组
        let offSpecs = [];
        if (m.off_specs && Array.isArray(m.off_specs)) {
          offSpecs = m.off_specs;
        } else if (m.off_spec) {
          offSpecs = Array.isArray(m.off_spec) ? m.off_spec : [m.off_spec];
        }
        pendingMembers.push({
          name: m.name,
          class: m.class,
          main_spec: mainSpec,
          off_spec: offSpecs.length > 0 ? offSpecs[0] : '',
          off_specs: offSpecs,
          role: m.role || [],
          spec: mainSpec, // 向后兼容
          status: m.status || '正式',
          join_date: m.join_date || formatDate(new Date()),
          notes: m.notes || ''
        });
      }
    });

    // 规范 1.2.2 批处理例外：批量导入循环 saveCloudData 写入，完成后统一 reload 一次
    try {
      for (const member of pendingMembers) {
        await window.CloudSync.saveCloudData('members', 'add', member);
      }
      await window.CloudSync.reloadData('members');
      saveData();
      closeModal('importMembersModal');
      renderMembers();
      showToast(`成功导入 ${pendingMembers.length} 个成员`, 'success');
    } catch (e) {
      console.error('成员批量导入失败:', e);
      showToast('导入失败：云端同步出错', 'error');
    }
  } catch (e) {
    showToast('导入失败：格式不正确', 'error');
  }
}

// ==================== 考勤记录 ====================
function renderAttendance() {
  if (attendanceView === 'calendar') {
    renderCalendar();
  } else {
    renderActivityList();
  }
}

function switchAttendanceView(view) {
  attendanceView = view;
  document.querySelectorAll('.view-tab').forEach((tab, i) => {
    tab.classList.toggle('active', (view === 'calendar' && i === 0) || (view === 'list' && i === 1));
  });
  document.getElementById('calendarView').style.display = view === 'calendar' ? 'block' : 'none';
  document.getElementById('listView').style.display = view === 'list' ? 'block' : 'none';
  renderAttendance();
}

// 日历
function renderCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  
  document.getElementById('calendarMonth').textContent = `${year}年 ${month + 1}月`;
  
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = formatDate(new Date());
  
  // 当月活动映射
  const activityMap = {};
  appData.activities.forEach(a => {
    const d = new Date(a.date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      if (!activityMap[a.date]) activityMap[a.date] = [];
      activityMap[a.date].push(a);
    }
  });
  
  let html = '';
  
  // 空白格子
  for (let i = 0; i < firstDay; i++) {
    html += `<div class="calendar-day empty"></div>`;
  }
  
  // 日期格子
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = dateStr === today;
    const hasActivity = activityMap[dateStr] && activityMap[dateStr].length > 0;
    const count = hasActivity ? activityMap[dateStr].length : 0;
    
    html += `
      <div class="calendar-day ${isToday ? 'today' : ''} ${hasActivity ? 'has-activity' : ''}" 
           onclick="${hasActivity ? `openDayActivities('${dateStr}')` : `createActivityOnDate('${dateStr}')`}">
        <div>${day}</div>
        ${hasActivity ? `<div class="day-count">${count}场</div>` : ''}
      </div>
    `;
  }
  
  document.getElementById('calendarDays').innerHTML = html;
}

function changeMonth(delta) {
  calendarDate.setMonth(calendarDate.getMonth() + delta);
  renderCalendar();
}

function goToToday() {
  calendarDate = new Date();
  renderCalendar();
}

function openDayActivities(dateStr) {
  const dayActivities = appData.activities.filter(a => a.date === dateStr);
  if (dayActivities.length === 1) {
    openAttendanceDetail(dayActivities[0].id);
  } else if (dayActivities.length > 1) {
    // 多个活动时，打开第一个，后续可优化为选择列表
    openAttendanceDetail(dayActivities[0].id);
  }
}

function createActivityOnDate(dateStr) {
  // BUG-012：viewer 无创建权限（CSS 无法覆盖日历格子的动态 onclick，此处 JS 守卫）
  if (window.CloudSync && window.CloudSync.isCloudMode() && !window.CloudSync.canEdit()) {
    showToast('当前为只读权限，无法创建活动', 'warning');
    return;
  }
  editingActivityId = null;
  document.getElementById('activityModalTitle').textContent = '创建活动';
  document.getElementById('activityDate').value = dateStr;
  document.getElementById('activityRaidName').value = '';
  document.getElementById('activityStartTime').value = '20:00';
  document.getElementById('activityEndTime').value = '23:00';
  document.getElementById('activityNotes').value = '';
  openModal('activityModal');
}

// 列表视图
function renderActivityList() {
  const activities = [...appData.activities].sort((a, b) => new Date(b.date) - new Date(a.date));
  const container = document.getElementById('activityList');
  
  if (!activities.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div><div class="empty-text">暂无活动记录</div><button class="btn btn-primary" onclick="showActivityModal()">+ 创建第一个活动</button></div>`;
    return;
  }
  
  container.innerHTML = activities.map(a => {
    const present = a.attendees.filter(att => att.status === '出席' || att.status === '替补' || att.status === '迟到').length;
    const absent = a.attendees.filter(att => att.status === '缺席').length;
    const total = appData.members.filter(m => m.status !== '离队').length;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    
    return `
      <div class="activity-item" onclick="openAttendanceDetail('${a.id}')">
        <div class="activity-info">
          <h4>${a.raid_name || '未命名活动'}</h4>
          <div class="activity-meta">
            <span>📅 ${a.date}</span>
            <span>⏰ ${a.start_time || '--:--'} - ${a.end_time || '--:--'}</span>
            <span>👥 ${a.attendees.length} 人登记</span>
          </div>
        </div>
        <div class="activity-stats">
          <div class="activity-stat">
            <div class="activity-stat-num" style="color:var(--success)">${present}</div>
            <div class="activity-stat-label">出勤</div>
          </div>
          <div class="activity-stat">
            <div class="activity-stat-num" style="color:var(--danger)">${absent}</div>
            <div class="activity-stat-label">缺席</div>
          </div>
          <div class="activity-stat">
            <div class="activity-stat-num">${rate}%</div>
            <div class="activity-stat-label">出勤率</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function showActivityModal(activity = null) {
  editingActivityId = activity ? activity.id : null;
  document.getElementById('activityModalTitle').textContent = activity ? '编辑活动' : '创建活动';
  document.getElementById('activityDate').value = activity ? activity.date : formatDate(new Date());
  document.getElementById('activityRaidName').value = activity ? activity.raid_name : '';
  document.getElementById('activityStartTime').value = activity ? activity.start_time : '20:00';
  document.getElementById('activityEndTime').value = activity ? activity.end_time : '23:00';
  document.getElementById('activityNotes').value = activity ? activity.notes || '' : '';
  openModal('activityModal');
}

// 防重复提交标志
let activitySaving = false;

async function saveActivity() {
  if (activitySaving) return;
  activitySaving = true;
  const saveBtn = document.getElementById('activitySaveBtn');
  if (saveBtn) { saveBtn.dataset.originalText = saveBtn.textContent; saveBtn.disabled = true; saveBtn.textContent = '保存中...'; }

  const date = document.getElementById('activityDate').value;
  const raidName = document.getElementById('activityRaidName').value.trim();
  
  if (!date) { showToast('请选择日期', 'error'); activitySaving = false; if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset.originalText || '保存'; } return; }
  if (!raidName) { showToast('请输入团本名称', 'error'); activitySaving = false; if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset.originalText || '保存'; } return; }
  
  const activityData = {
    date,
    raid_name: raidName,
    start_time: document.getElementById('activityStartTime').value,
    end_time: document.getElementById('activityEndTime').value,
    notes: document.getElementById('activityNotes').value.trim()
  };
  
  // 严格 DB-first
  try {
    if (editingActivityId) {
      const activity = appData.activities.find(a => a.id === editingActivityId);
      if (!activity) return;
      const payload = { ...activity, ...activityData, id: editingActivityId };
      await cloudCrud('activities', 'update', payload, { renderFn: renderAttendance });
      showToast('活动已更新', 'success');
    } else {
      const attendees = appData.members.filter(m => m.status !== '离队').map(m => ({
        member_id: m.id, status: '缺席', notes: ''
      }));
      const payload = { ...activityData, attendees };
      await cloudCrud('activities', 'add', payload, { renderFn: renderAttendance });
      showToast('活动已创建', 'success');
    }
  } catch (e) {
    console.error('活动保存失败:', e);
  } finally {
    activitySaving = false;
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset.originalText || '保存'; }
  }
  closeModal('activityModal');
}

function openAttendanceDetail(activityId) {
  currentActivityId = activityId;
  const activity = appData.activities.find(a => a.id === activityId);
  if (!activity) return;
  
  document.getElementById('attendanceDetailTitle').textContent = activity.raid_name;
  document.getElementById('attendanceDetailSubtitle').textContent = 
    `📅 ${activity.date} | ⏰ ${activity.start_time || '--:--'} - ${activity.end_time || '--:--'}`;
  
  renderAttendanceMembers(activity);
  openModal('attendanceDetailModal');
}

function renderAttendanceMembers(activity) {
  const members = appData.members.filter(m => m.status !== '离队');
  const container = document.getElementById('attendanceMembersList');
  
  container.innerHTML = members.map(m => {
    const attendee = activity.attendees.find(a => a.member_id === m.id);
    const status = attendee ? attendee.status : '缺席';
    const cls = classMap[m.class] || '';
    const checked = status === '出席' || status === '替补' || status === '迟到';
    const mainSpec = m.main_spec || m.spec || '';
    const roles = m.role || [];
    const roleTagsHtml = roles.length > 0 ? roles.map(r => {
      const type = roleTypeMap[r] || 'dps';
      return `<span class="member-role-tag ${type}">${r}</span>`;
    }).join(' ') : '';
    
    return `
      <div class="attend-member-row">
        <input type="checkbox" class="attend-checkbox" data-member="${m.id}" 
               ${checked ? 'checked' : ''} 
               onchange="toggleAttendStatus(this, '${m.id}')">
        <div class="attend-name">
          <span class="class-${cls}" style="font-weight:500">${m.name}</span>
          <span style="color:var(--text-muted);font-size:11px;margin-left:8px">${m.class}${mainSpec ? '·' + mainSpec : ''}</span>
          ${roleTagsHtml ? `<span style="margin-left:6px">${roleTagsHtml}</span>` : ''}
        </div>
        <select class="attend-status-select" data-member="${m.id}" onchange="updateAttendCheckbox(this)">
          <option value="出席" ${status === '出席' ? 'selected' : ''}>出席</option>
          <option value="缺席" ${status === '缺席' ? 'selected' : ''}>缺席</option>
          <option value="迟到" ${status === '迟到' ? 'selected' : ''}>迟到</option>
          <option value="替补" ${status === '替补' ? 'selected' : ''}>替补</option>
          <option value="请假" ${status === '请假' ? 'selected' : ''}>请假</option>
        </select>
      </div>
    `;
  }).join('');
}

function toggleAttendStatus(checkbox, memberId) {
  const select = document.querySelector(`.attend-status-select[data-member="${memberId}"]`);
  if (checkbox.checked) {
    if (select.value === '缺席' || select.value === '请假') {
      select.value = '出席';
    }
  } else {
    select.value = '缺席';
  }
}

function updateAttendCheckbox(select) {
  const memberId = select.dataset.member;
  const checkbox = document.querySelector(`.attend-checkbox[data-member="${memberId}"]`);
  const status = select.value;
  checkbox.checked = status === '出席' || status === '替补' || status === '迟到';
}

function setAllAttendance(status) {
  document.querySelectorAll('.attend-status-select').forEach(sel => {
    sel.value = status;
    const memberId = sel.dataset.member;
    const checkbox = document.querySelector(`.attend-checkbox[data-member="${memberId}"]`);
    checkbox.checked = status === '出席' || status === '替补' || status === '迟到';
  });
}

// 防重复提交标志
let attendanceSaving = false;

async function saveAttendance() {
  if (attendanceSaving) return;
  attendanceSaving = true;
  const saveBtn = document.getElementById('attendanceSaveBtn');
  if (saveBtn) { saveBtn.dataset.originalText = saveBtn.textContent; saveBtn.disabled = true; saveBtn.textContent = '保存中...'; }

  const activity = appData.activities.find(a => a.id === currentActivityId);
  if (!activity) { attendanceSaving = false; if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset.originalText || '保存考勤'; } return; }
  
  const attendees = [];
  document.querySelectorAll('.attend-status-select').forEach(sel => {
    attendees.push({
      member_id: sel.dataset.member,
      status: sel.value,
      notes: ''
    });
  });
  
  // 严格 DB-first
  try {
    const payload = { ...activity, attendees, id: activity.id };
    await cloudCrud('activities', 'update', payload, { renderFn: renderAttendance });
    showToast('考勤已保存', 'success');
  } catch (e) {
    console.error('考勤保存失败:', e);
  } finally {
    attendanceSaving = false;
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset.originalText || '保存考勤'; }
  }
  closeModal('attendanceDetailModal');
}

async function deleteCurrentActivity() {
  if (!confirm('确定要删除这个活动吗？此操作不可撤销。')) return;
  const activity = appData.activities.find(a => a.id === currentActivityId);
  
  // 严格 DB-first
  try {
    if (activity) {
      await cloudCrud('activities', 'delete', { id: activity.id }, { renderFn: renderAttendance });
    }
    showToast('活动已删除', 'success');
  } catch (e) {
    console.error('活动删除失败:', e);
  }
  closeModal('attendanceDetailModal');
}

// WCL 导入
function showWCLImportModal() {
  document.getElementById('wclUrl').value = '';
  document.getElementById('wclDate').value = formatDate(new Date());
  document.getElementById('wclRaidName').value = '';
  document.getElementById('wclPlayerList').value = '';
  openModal('wclImportModal');
}

async function importFromWCL() {
  const date = document.getElementById('wclDate').value;
  const raidName = document.getElementById('wclRaidName').value.trim() || 'WCL导入活动';
  const playerText = document.getElementById('wclPlayerList').value.trim();
  
  if (!date) { showToast('请选择活动日期', 'error'); return; }
  if (!playerText) { showToast('请输入玩家名单', 'error'); return; }
  
  const playerNames = playerText.split('\n').map(l => l.trim()).filter(l => l);
  
  // 匹配团队成员
  const members = appData.members.filter(m => m.status !== '离队');
  const matchedIds = new Set();
  
  playerNames.forEach(name => {
    // 精确匹配
    const member = members.find(m => m.name === name);
    if (member) matchedIds.add(member.id);
  });
  
  // 创建活动
  const attendees = members.map(m => ({
    member_id: m.id,
    status: matchedIds.has(m.id) ? '出席' : '缺席',
    notes: ''
  }));
  
  const newActivity = {
    id: genId(),
    date,
    raid_name: raidName,
    start_time: '20:00',
    end_time: '23:00',
    attendees,
    notes: '从WCL导入'
  };
  
  // 写入DB → reload → render
  try {
    await cloudCrud('activities', 'add', newActivity, { renderFn: renderAttendance });
    closeModal('wclImportModal');
    showToast(`成功导入，匹配到 ${matchedIds.size} 名团员`, 'success');
  } catch (e) {
    showToast('导入失败: ' + e.message, 'error');
  }
}

// ==================== 统计报表 ====================
function setReportRange(days) {
  reportRange = days;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.range) === days);
  });
  renderReports();
}

function renderReports() {
  const rankings = getAttendanceRankings();
  
  // 排名表格
  const tbody = document.getElementById('rankTableBody');
  if (!rankings.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">📊</div><div class="empty-text">暂无数据</div></div></td></tr>`;
  } else {
    tbody.innerHTML = rankings.map((item, i) => {
      const cls = classMap[item.member.class] || '';
      return `
        <tr>
          <td><div class="rank-num" style="margin:auto">${i + 1}</div></td>
          <td class="class-${cls}" style="font-weight:500">${item.member.name}</td>
          <td>${item.member.class}</td>
          <td style="color:var(--success)">${item.present}</td>
          <td style="color:var(--info)">${item.sub}</td>
          <td style="color:var(--danger)">${item.absent}</td>
          <td style="color:var(--warning)">${item.late}</td>
          <td style="color:var(--text-muted)">${item.leave}</td>
          <td><span style="color:${item.rate >= 80 ? 'var(--success)' : item.rate >= 60 ? 'var(--warning)' : 'var(--danger)'};font-weight:600">${item.rate}%</span></td>
        </tr>
      `;
    }).join('');
  }
  
  // 缺席榜
  const absentRank = [...rankings].sort((a, b) => b.absent - a.absent).slice(0, 5);
  const absentHtml = absentRank.filter(r => r.absent > 0).map((item, i) => `
    <div class="rank-item">
      <div class="rank-num" style="background:rgba(248,81,73,0.3);color:var(--danger)">${i + 1}</div>
      <div class="rank-name class-${classMap[item.member.class] || ''}">${item.member.name}</div>
      <div class="rank-rate" style="color:var(--danger)">${item.absent} 次</div>
    </div>
  `).join('');
  document.getElementById('absentRankList').innerHTML = absentHtml || '<div class="empty-state" style="padding:20px 0"><div class="empty-text" style="font-size:12px">暂无缺席记录</div></div>';
  
  // 绘制图表
  setTimeout(() => {
    drawBarChart(rankings.slice(0, 10));
    drawLineChart();
  }, 50);
}

// 柱状图
function drawBarChart(data) {
  const canvas = document.getElementById('barChart');
  const ctx = canvas.getContext('2d');
  
  // 设置实际像素尺寸
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * 2;
  canvas.height = rect.height * 2;
  ctx.scale(2, 2);
  
  const w = rect.width;
  const h = rect.height;
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;
  
  // 清空
  ctx.clearRect(0, 0, w, h);
  
  if (!data.length) {
    ctx.fillStyle = '#6e7681';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('暂无数据', w / 2, h / 2);
    return;
  }
  
  const barWidth = Math.min(40, (chartW / data.length) - 8);
  const gap = (chartW - barWidth * data.length) / (data.length + 1);
  
  // 绘制网格线
  ctx.strokeStyle = 'rgba(48, 54, 61, 0.5)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();
    
    // Y轴标签
    ctx.fillStyle = '#8b949e';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${100 - i * 25}%`, padding.left - 8, y + 4);
  }
  
  // 绘制柱子
  data.forEach((item, i) => {
    const x = padding.left + gap + i * (barWidth + gap);
    const barHeight = (item.rate / 100) * chartH;
    const y = padding.top + chartH - barHeight;
    
    // 渐变填充
    const gradient = ctx.createLinearGradient(0, y, 0, padding.top + chartH);
    gradient.addColorStop(0, '#f0c060');
    gradient.addColorStop(1, '#b8860b');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barHeight, [3, 3, 0, 0]);
    ctx.fill();
    
    // 数值标签
    ctx.fillStyle = '#f0c060';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${item.rate}%`, x + barWidth / 2, y - 5);
    
    // X轴标签
    ctx.fillStyle = '#8b949e';
    ctx.font = '10px sans-serif';
    const name = item.member.name.length > 4 ? item.member.name.slice(0, 4) + '...' : item.member.name;
    ctx.fillText(name, x + barWidth / 2, padding.top + chartH + 18);
  });
  
  // Y轴
  ctx.strokeStyle = '#30363d';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + chartH);
  ctx.stroke();
}

// 折线图
function drawLineChart() {
  const canvas = document.getElementById('lineChart');
  const ctx = canvas.getContext('2d');
  
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * 2;
  canvas.height = rect.height * 2;
  ctx.scale(2, 2);
  
  const w = rect.width;
  const h = rect.height;
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;
  
  ctx.clearRect(0, 0, w, h);
  
  // 获取最近10次活动
  const recent = [...appData.activities].sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-10);
  
  if (!recent.length) {
    ctx.fillStyle = '#6e7681';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('暂无数据', w / 2, h / 2);
    return;
  }
  
  const totalMembers = appData.members.filter(m => m.status !== '离队').length;
  
  // 计算每次活动的出勤率
  const rates = recent.map(a => {
    const present = a.attendees.filter(att => att.status === '出席' || att.status === '替补' || att.status === '迟到').length;
    return totalMembers > 0 ? (present / totalMembers) * 100 : 0;
  });
  
  // 网格线
  ctx.strokeStyle = 'rgba(48, 54, 61, 0.5)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();
    
    ctx.fillStyle = '#8b949e';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${100 - i * 25}%`, padding.left - 8, y + 4);
  }
  
  // 绘制折线
  const pointGap = chartW / (rates.length > 1 ? rates.length - 1 : 1);
  
  // 区域填充
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top + chartH);
  rates.forEach((rate, i) => {
    const x = padding.left + i * pointGap;
    const y = padding.top + chartH - (rate / 100) * chartH;
    if (i === 0) ctx.lineTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(padding.left + (rates.length - 1) * pointGap, padding.top + chartH);
  ctx.closePath();
  
  const areaGradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
  areaGradient.addColorStop(0, 'rgba(88, 166, 255, 0.3)');
  areaGradient.addColorStop(1, 'rgba(88, 166, 255, 0.02)');
  ctx.fillStyle = areaGradient;
  ctx.fill();
  
  // 折线
  ctx.beginPath();
  ctx.strokeStyle = '#58a6ff';
  ctx.lineWidth = 2;
  rates.forEach((rate, i) => {
    const x = padding.left + i * pointGap;
    const y = padding.top + chartH - (rate / 100) * chartH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  
  // 数据点
  rates.forEach((rate, i) => {
    const x = padding.left + i * pointGap;
    const y = padding.top + chartH - (rate / 100) * chartH;
    
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#58a6ff';
    ctx.fill();
    ctx.strokeStyle = '#161b22';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // X轴标签
    ctx.fillStyle = '#8b949e';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    const dateLabel = recent[i].date.slice(5); // MM-DD
    ctx.fillText(dateLabel, x, padding.top + chartH + 18);
  });
  
  // Y轴
  ctx.strokeStyle = '#30363d';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + chartH);
  ctx.stroke();
}

// ==================== 数据管理 ====================
function renderDataPage() {
  const memberCount = appData.members.length;
  const activityCount = appData.activities.length;
  const totalAttendances = appData.activities.reduce((sum, a) => sum + a.attendees.length, 0);
  
  // 计算数据大小
  const dataSize = new Blob([JSON.stringify(appData)]).size;
  const sizeStr = dataSize < 1024 ? `${dataSize} B` : dataSize < 1024 * 1024 ? `${(dataSize / 1024).toFixed(1)} KB` : `${(dataSize / 1024 / 1024).toFixed(2)} MB`;
  
  const lootCount = (appData.loots || []).length;
  const wishlistCount = (appData.wishlist || []).length;
  
  document.getElementById('dataStatsGrid').innerHTML = `
    <div class="data-stat-item">
      <div class="data-stat-value">${memberCount}</div>
      <div class="data-stat-label">团队成员</div>
    </div>
    <div class="data-stat-item">
      <div class="data-stat-value">${activityCount}</div>
      <div class="data-stat-label">活动次数</div>
    </div>
    <div class="data-stat-item">
      <div class="data-stat-value">${totalAttendances}</div>
      <div class="data-stat-label">考勤记录</div>
    </div>
    <div class="data-stat-item">
      <div class="data-stat-value">${lootCount}</div>
      <div class="data-stat-label">装备记录</div>
    </div>
    <div class="data-stat-item">
      <div class="data-stat-value">${wishlistCount}</div>
      <div class="data-stat-label">心愿单</div>
    </div>
    <div class="data-stat-item">
      <div class="data-stat-value">${sizeStr}</div>
      <div class="data-stat-label">数据大小</div>
    </div>
  `;
}

function exportData() {
  const dataStr = JSON.stringify(appData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `wow_attendance_${formatDate(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showToast('数据已导出', 'success');
}

function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const data = JSON.parse(e.target.result);
      
      if (!data.members && !data.activities) {
        showToast('文件格式不正确', 'error');
        return;
      }
      
      const mode = confirm('点击"确定"合并数据，点击"取消"覆盖现有数据。\n\n合并：保留现有数据，添加新数据\n覆盖：删除所有现有数据，替换为导入的数据');
      
      // 规范 1.2.2 批处理例外：JSON 导入属于备份/迁移的批量写入，
      // 循环 saveCloudData 写入，全部完成后统一 reload 一次再渲染（与 importMembers 同款写法）
      try {
        if (!mode) {
          // 覆盖：先清空云端现有数据（按依赖顺序：心愿单/装备/活动/成员）
          for (const w of (appData.wishlist || [])) {
            await window.CloudSync.saveCloudData('wishlists', 'delete', { id: w.id });
          }
          for (const l of (appData.loots || [])) {
            await window.CloudSync.saveCloudData('loots', 'delete', { id: l.id });
          }
          for (const a of appData.activities) {
            await window.CloudSync.saveCloudData('activities', 'delete', { id: a.id });
          }
          for (const m of appData.members) {
            await window.CloudSync.saveCloudData('members', 'delete', { id: m.id });
          }
        }

        // 成员：数据库会生成新 id，建立 旧id -> 新id 映射，供考勤/心愿单关联修复
        const memberIdMap = {};
        if (data.members && Array.isArray(data.members)) {
          for (const m of data.members) {
            if (mode) {
              // 合并模式按名字去重，已存在的成员沿用其现有 id
              const existing = appData.members.find(ex => ex.name === m.name);
              if (existing) {
                if (m.id) memberIdMap[m.id] = existing.id;
                continue;
              }
            }
            const oldId = m.id;
            const row = { ...m };
            delete row.id;
            await window.CloudSync.saveCloudData('members', 'add', row);
            if (oldId && row.id) memberIdMap[oldId] = row.id;
          }
        }
        if (data.activities && Array.isArray(data.activities)) {
          for (const a of data.activities) {
            const row = { ...a };
            delete row.id;
            if (Array.isArray(row.attendees)) {
              row.attendees = row.attendees.map(att => ({
                ...att,
                member_id: memberIdMap[att.member_id] || att.member_id
              }));
            }
            await window.CloudSync.saveCloudData('activities', 'add', row);
          }
        }
        if (data.loots && Array.isArray(data.loots)) {
          for (const l of data.loots) {
            const row = { ...l };
            delete row.id;
            await window.CloudSync.saveCloudData('loots', 'add', row);
          }
        }
        if (data.wishlist && Array.isArray(data.wishlist)) {
          for (const w of data.wishlist) {
            const row = { ...w, id: genId() };
            if (row.memberId && memberIdMap[row.memberId]) row.memberId = memberIdMap[row.memberId];
            if (row.member_id && memberIdMap[row.member_id]) row.member_id = memberIdMap[row.member_id];
            await window.CloudSync.saveCloudData('wishlists', 'add', row);
          }
        }

        // 统一 reload + 缓存 + 渲染
        await window.CloudSync.reloadData('members');
        await window.CloudSync.reloadData('activities');
        await window.CloudSync.reloadData('loots');
        await window.CloudSync.reloadData('wishlists');
        saveData();
        renderDataPage();
        showToast(mode ? '数据已合并导入' : '数据已覆盖导入', 'success');
      } catch (cloudErr) {
        console.error('JSON 导入失败:', cloudErr);
        showToast('导入失败：云端同步出错', 'error');
      }
    } catch (err) {
      showToast('文件解析失败', 'error');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

async function confirmClearAll() {
  if (!confirm('⚠️ 警告：此操作将删除所有成员、考勤、装备和心愿单数据，且无法恢复！\n\n确定要清空所有数据吗？')) return;
  if (!confirm('再次确认：真的要清空所有数据吗？')) return;
  
  // 规范 1.2.2 批处理例外：清空属于批量删除，循环 saveCloudData 删除后统一 reload 一次
  try {
    for (const w of (appData.wishlist || [])) {
      await window.CloudSync.saveCloudData('wishlists', 'delete', { id: w.id });
    }
    for (const l of (appData.loots || [])) {
      await window.CloudSync.saveCloudData('loots', 'delete', { id: l.id });
    }
    for (const a of appData.activities) {
      await window.CloudSync.saveCloudData('activities', 'delete', { id: a.id });
    }
    for (const m of appData.members) {
      await window.CloudSync.saveCloudData('members', 'delete', { id: m.id });
    }
    await window.CloudSync.reloadData('members');
    await window.CloudSync.reloadData('activities');
    await window.CloudSync.reloadData('loots');
    await window.CloudSync.reloadData('wishlists');
    saveData();
    renderDataPage();
    showToast('所有数据已清空', 'warning');
  } catch (e) {
    console.error('清空数据失败:', e);
    showToast('清空失败：云端同步出错', 'error');
  }
}




// ==================== 装备分配模块 ====================

// 装备部位映射
const lootSlotMap = {
  '武器': ['单手锤', '单手剑', '单手斧', '匕首', '战刃', '拳套', '双手锤', '双手剑', '双手斧', '法杖', '长柄', '盾牌', '副手物品', '枪械', '弓', '弩'],
  '防具': ['头部', '胸部', '肩部', '腕部', '手部', '腰部', '腿部', '脚部', '背部'],
  '首饰': ['颈部', '手指'],
  '饰品': ['饰品']
};

// 状态标签映射
const lootStatusBadgeMap = {
  '待分配': 'badge-loot-pending',
  '已分配': 'badge-loot-assigned',
  '分解': 'badge-loot-disenchant',
  '销毁': 'badge-loot-destroyed'
};

// 优先级标签映射
const lootPriorityBadgeMap = {
  'P0': 'badge-priority-p0',
  'P1': 'badge-priority-p1',
  'P2': 'badge-priority-p2',
  'P3': 'badge-priority-p3'
};

let lootEditingId = null;
let lootSelectedSecondaryStats = [];

// 根据大类更新部位下拉选项
function lootUpdateSlotOptions(selectedSlot = '') {
  const category = document.getElementById('lootCategory').value;
  const slots = lootSlotMap[category] || [];
  const select = document.getElementById('lootSlot');
  select.innerHTML = slots.map(s => `<option value="${s}" ${s === selectedSlot ? 'selected' : ''}>${s}</option>`).join('');
}

// 大类变化时更新部位
function lootOnCategoryChange() {
  lootUpdateSlotOptions();
}

// 初始化团本下拉选项
function lootInitRaidSelect(selectedRaid = '虚影尖塔', selectedBoss = '') {
  const raidSelect = document.getElementById('lootRaid');
  if (!raidSelect) return;
  
  const raids = Object.keys(raidBossMap || {});
  raids.push('其他');
  raidSelect.innerHTML = raids.map(r => 
    `<option value="${r}" ${r === selectedRaid ? 'selected' : ''}>${r}</option>`
  ).join('');
  
  // 更新BOSS下拉
  lootUpdateBossOptions(selectedBoss);
}

// 团本变化时更新BOSS下拉
function lootOnRaidChange() {
  lootUpdateBossOptions();
}

// 更新BOSS下拉选项
function lootUpdateBossOptions(selectedBoss = '') {
  const raid = document.getElementById('lootRaid')?.value || '';
  const bossSelect = document.getElementById('lootBoss');
  if (!bossSelect) return;
  
  const bosses = raidBossMap?.[raid] || [];
  
  if (raid === '其他' || bosses.length === 0) {
    // 自定义团本，改成文本输入
    bossSelect.innerHTML = '';
    // 用input替代select的方式：保留select但加一个自定义选项并允许编辑
    bossSelect.innerHTML = `<option value="${selectedBoss || '自定义BOSS'}">${selectedBoss || '请在下方输入BOSS名'}</option>`;
    // 简单处理：直接改成可自定义输入的模式
    if (!bossSelect.dataset.hasCustomInput) {
      bossSelect.innerHTML = '';
      bossSelect.style.display = 'none';
      // 创建一个文本输入框
      if (!document.getElementById('lootBossCustom')) {
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'lootBossCustom';
        input.className = 'form-input';
        input.placeholder = '请输入BOSS名称';
        bossSelect.parentNode.insertBefore(input, bossSelect.nextSibling);
      }
      document.getElementById('lootBossCustom').style.display = 'block';
      document.getElementById('lootBossCustom').value = selectedBoss || '';
      bossSelect.dataset.hasCustomInput = 'true';
    }
  } else {
    // 正常团本，用下拉
    const customInput = document.getElementById('lootBossCustom');
    if (customInput) {
      customInput.style.display = 'none';
    }
    bossSelect.style.display = '';
    bossSelect.innerHTML = bosses.map(b => 
      `<option value="${b}" ${b === selectedBoss ? 'selected' : ''}>${b}</option>`
    ).join('');
  }
}

// 获取BOSS值（兼容下拉和自定义输入）
function lootGetBossValue() {
  const customInput = document.getElementById('lootBossCustom');
  if (customInput && customInput.style.display !== 'none') {
    return customInput.value.trim();
  }
  return document.getElementById('lootBoss')?.value || '';
}

// 切换副属性标签
function lootToggleSecondaryStat(stat) {
  const idx = lootSelectedSecondaryStats.indexOf(stat);
  if (idx > -1) {
    lootSelectedSecondaryStats.splice(idx, 1);
  } else {
    lootSelectedSecondaryStats.push(stat);
  }
  document.querySelectorAll('#lootSecondaryStats .secondary-stat-tag').forEach(tag => {
    tag.classList.toggle('active', lootSelectedSecondaryStats.includes(tag.dataset.stat));
  });
}

// 渲染装备列表
function lootRender() {
  const tbody = document.getElementById('lootTableBody');
  if (!tbody) return;
  
  let loots = [...(appData.loots || [])];
  
  // 搜索过滤
  const searchKw = (document.getElementById('lootSearch')?.value || '').toLowerCase();
  if (searchKw) {
    loots = loots.filter(l => l.name.toLowerCase().includes(searchKw));
  }
  
  // 团本筛选
  const raidFilter = document.getElementById('lootRaidFilter')?.value || '';
  if (raidFilter) {
    loots = loots.filter(l => l.raid === raidFilter);
  }
  
  // 难度筛选
  const diffFilter = document.getElementById('lootDifficultyFilter')?.value || '';
  if (diffFilter) {
    loots = loots.filter(l => l.difficulty === diffFilter);
  }
  
  // 大类筛选
  const catFilter = document.getElementById('lootCategoryFilter')?.value || '';
  if (catFilter) {
    loots = loots.filter(l => l.category === catFilter);
  }
  
  // 状态筛选
  const statusFilter = document.getElementById('lootStatusFilter')?.value || '';
  if (statusFilter) {
    loots = loots.filter(l => l.status === statusFilter);
  }
  
  // 优先级筛选
  const priorityFilter = document.getElementById('lootPriorityFilter')?.value || '';
  if (priorityFilter) {
    loots = loots.filter(l => l.priority === priorityFilter);
  }
  
  if (loots.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="13">
          <div class="empty-state">
            <div class="empty-icon">⚔️</div>
            <div class="empty-text">暂无装备记录，点击「添加装备」开始记录</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }
  
  // 按日期倒序排列
  loots.sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date);
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
  
  tbody.innerHTML = loots.map(loot => {
    const statusBadge = lootStatusBadgeMap[loot.status] || '';
    const priorityBadge = lootPriorityBadgeMap[loot.priority] || '';
    const secondaryStatsHtml = (loot.secondaryStats || [])
      .map(s => `<span class="loot-stat-tag">${s}</span>`).join('');
    
    const distMethodMap = {
      'roll': 'Roll',
      'cl': 'CL',
      'master_loot': '队长',
      'custom': '自定义'
    };
    const distMethodText = distMethodMap[loot.distribution_method] || loot.distribution_method || '-';
    const rollText = loot.distribution_method === 'roll' 
      ? `${loot.player_action === 'need' ? '需求' : loot.player_action === 'greed' ? '贪婪' : loot.player_action === 'pass' ? '放弃' : ''} ${loot.roll_value || ''}`.trim() || '-'
      : '-';
    const wishlistBadge = loot.is_wishlist ? '<span class="badge" style="background:#f0c060;color:#0d1117;margin-left:4px">心愿</span>' : '';
    
    return `
      <tr>
        <td><span class="loot-name">${loot.name}</span>${wishlistBadge}</td>
        <td><span class="wishlist-raid-tag">${loot.raid || '-'}</span></td>
        <td>${loot.difficulty || ''}</td>
        <td>${loot.boss || ''}</td>
        <td>${loot.slot || ''}</td>
        <td>${loot.primaryStat || ''}</td>
        <td><div class="loot-secondary-stats">${secondaryStatsHtml || '-'}</div></td>
        <td>${loot.assignedTo || '-'}</td>
        <td><span class="badge ${statusBadge}">${loot.status || '待分配'}</span></td>
        <td>${distMethodText}</td>
        <td>${rollText}</td>
        <td>${loot.date || '-'}</td>
        <td>
          <div class="action-btns">
            <button class="icon-btn" onclick="lootEdit('${loot.id}')" title="编辑">✏️</button>
            <button class="icon-btn danger" onclick="lootDelete('${loot.id}')" title="删除">🗑</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// 初始化装备分配-成员下拉选择
function lootInitMemberSelect(selectedName = '') {
  const select = document.getElementById('lootAssignedTo');
  if (!select) return;
  
  const classColors = {
    '战士': '#C79C6E', '法师': '#69CCF0', '牧师': '#FFFFFF',
    '盗贼': '#FFF569', '猎人': '#ABD473', '圣骑士': '#F58CBA',
    '萨满': '#0070DE', '德鲁伊': '#FF7D0A', '术士': '#9482C9',
    '武僧': '#00FF96', '恶魔猎手': '#A330C9', '死亡骑士': '#C41E3A',
    '唤魔师': '#33937F'
  };
  
  const members = appData.members || [];
  // 按名字排序
  const sortedMembers = [...members].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  
  let optionsHtml = '<option value="">请选择成员</option>';
  sortedMembers.forEach(m => {
    const mainSpec = m.main_spec || m.spec || '';
    const displayText = mainSpec ? `${m.name} · ${m.class} · ${mainSpec}` : `${m.name} · ${m.class}`;
    const selected = selectedName && m.name === selectedName ? 'selected' : '';
    const color = classColors[m.class] || 'var(--text-primary)';
    optionsHtml += `<option value="${m.name}" ${selected} style="color:${color}">${displayText}</option>`;
  });
  
  // 如果有自定义输入的名字（不在成员列表中），也加上
  if (selectedName && !members.find(m => m.name === selectedName)) {
    optionsHtml += `<option value="${selectedName}" selected>${selectedName} · （自定义）</option>`;
  }
  
  select.innerHTML = optionsHtml;
  
  // 设置选中项的文字颜色（职业色）
  if (selectedName) {
    const member = members.find(m => m.name === selectedName);
    if (member && classColors[member.class]) {
      select.style.color = classColors[member.class];
    } else {
      select.style.color = 'var(--text-primary)';
    }
  } else {
    select.style.color = 'var(--text-primary)';
  }
}

// 更新装备分配-成员信息展示
function lootUpdateMemberInfo() {
  const select = document.getElementById('lootAssignedTo');
  const infoDiv = document.getElementById('lootMemberInfo');
  if (!select || !infoDiv) return;
  
  const memberName = select.value;
  
  const classColors = {
    '战士': '#C79C6E', '法师': '#69CCF0', '牧师': '#FFFFFF',
    '盗贼': '#FFF569', '猎人': '#ABD473', '圣骑士': '#F58CBA',
    '萨满': '#0070DE', '德鲁伊': '#FF7D0A', '术士': '#9482C9',
    '武僧': '#00FF96', '恶魔猎手': '#A330C9', '死亡骑士': '#C41E3A',
    '唤魔师': '#33937F'
  };
  
  // 更新select选中项的文字颜色
  if (!memberName) {
    infoDiv.style.display = 'none';
    select.style.color = 'var(--text-primary)';
    return;
  }
  
  const member = (appData.members || []).find(m => m.name === memberName);
  if (member && classColors[member.class]) {
    select.style.color = classColors[member.class];
  } else {
    select.style.color = 'var(--text-primary)';
  }
  
  // 自定义输入的成员，不展示详细信息
  if (!member) {
    infoDiv.style.display = 'none';
    return;
  }
  
  const classColor = classColors[member.class] || 'var(--text-muted)';
  const mainSpec = member.main_spec || member.spec || '';
  const offSpecs = member.off_specs || (member.off_spec ? [member.off_spec] : []);
  const roles = member.role || [];
  
  const roleMap = { '坦克': 'tank', '输出': 'dps', '治疗': 'healer' };
  const roleTags = roles.map(r => 
    `<span class="lmi-role-tag ${roleMap[r] || ''}">${r}</span>`
  ).join('');
  
  const offSpecText = offSpecs.length > 0 
    ? `<span class="lmi-label">副专精</span><span class="lmi-value">${offSpecs.join(' / ')}</span>` 
    : '';
  
  infoDiv.innerHTML = `
    <div class="lmi-class-bar" style="background:${classColor}"></div>
    <div class="lmi-content">
      <div class="lmi-row">
        <span class="lmi-name" style="color:${classColor}">${member.name}</span>
        <span class="lmi-value">${member.class}</span>
        ${roleTags}
      </div>
      <div class="lmi-row">
        <span class="lmi-label">主专精</span>
        <span class="lmi-value">${mainSpec || '未设置'}</span>
        ${offSpecText}
      </div>
    </div>
  `;
  infoDiv.style.display = 'flex';
  
  // 同步更新心愿单匹配
  if (typeof lootUpdateWishlistMatches === 'function') {
    lootUpdateWishlistMatches();
  }
}

// 根据分配方式切换字段显示
function lootOnDistributionMethodChange() {
  const method = document.getElementById('lootDistributionMethod').value;
  const playerActionRow = document.getElementById('lootPlayerActionRow');
  const ruleNoteRow = document.getElementById('lootRuleNoteRow');
  const decisionNoteRow = document.getElementById('lootDecisionNoteRow');
  
  if (!playerActionRow || !ruleNoteRow || !decisionNoteRow) return;
  
  // 重置显示
  playerActionRow.style.display = 'none';
  ruleNoteRow.style.display = 'none';
  decisionNoteRow.style.display = 'none';
  
  switch (method) {
    case 'roll':
      playerActionRow.style.display = 'flex';
      ruleNoteRow.style.display = 'block';
      break;
    case 'cl':
    case 'master_loot':
      decisionNoteRow.style.display = 'block';
      break;
    case 'custom':
      ruleNoteRow.style.display = 'block';
      break;
  }
}

// 显示添加/编辑装备弹窗
function lootShowModal(lootId = null) {
  lootEditingId = lootId;
  lootSelectedSecondaryStats = [];
  
  if (lootId) {
    document.getElementById('lootModalTitle').textContent = '编辑装备';
    const loot = (appData.loots || []).find(l => l.id === lootId);
    if (loot) {
      document.getElementById('lootName').value = loot.name || '';
      // 初始化团本下拉
      lootInitRaidSelect(loot.raid || '虚影尖塔', loot.boss || '');
      document.getElementById('lootDifficulty').value = loot.difficulty || '普通';
      document.getElementById('lootCategory').value = loot.category || '武器';
      lootUpdateSlotOptions(loot.slot || '');
      document.getElementById('lootPrimaryStat').value = loot.primaryStat || '力量';
      lootSelectedSecondaryStats = [...(loot.secondaryStats || [])];
      document.querySelectorAll('#lootSecondaryStats .secondary-stat-tag').forEach(tag => {
        tag.classList.toggle('active', lootSelectedSecondaryStats.includes(tag.dataset.stat));
      });
      document.getElementById('lootSpecialEffect').value = loot.specialEffect || '';
      // 初始化成员下拉并选中
      lootInitMemberSelect(loot.assignedTo || '');
      document.getElementById('lootStatus').value = loot.status || '待分配';
      document.getElementById('lootPriority').value = loot.priority || 'P2';
      document.getElementById('lootDate').value = loot.date || '';
      document.getElementById('lootNote').value = loot.note || '';
      document.getElementById('lootDistributionMethod').value = loot.distribution_method || 'custom';
      document.getElementById('lootSeason').value = loot.season || '';
      document.getElementById('lootPlayerAction').value = loot.player_action || 'none';
      document.getElementById('lootRollValue').value = loot.roll_value || '';
      document.getElementById('lootRuleNote').value = loot.rule_note || '';
      document.getElementById('lootDecisionNote').value = loot.decision_note || '';
      document.getElementById('lootIsWishlist').checked = !!loot.is_wishlist;
    }
  } else {
    document.getElementById('lootModalTitle').textContent = '添加装备';
    document.getElementById('lootName').value = '';
    lootInitRaidSelect('虚影尖塔');
    document.getElementById('lootDifficulty').value = '普通';
    document.getElementById('lootCategory').value = '武器';
    lootUpdateSlotOptions();
    document.getElementById('lootPrimaryStat').value = '力量';
    lootSelectedSecondaryStats = [];
    document.querySelectorAll('#lootSecondaryStats .secondary-stat-tag').forEach(tag => {
      tag.classList.remove('active');
    });
    document.getElementById('lootSpecialEffect').value = '';
    // 初始化成员下拉
    lootInitMemberSelect('');
    document.getElementById('lootStatus').value = '待分配';
    document.getElementById('lootPriority').value = 'P2';
    document.getElementById('lootDate').value = formatDate(new Date());
    document.getElementById('lootNote').value = '';
    document.getElementById('lootDistributionMethod').value = 'custom';
    document.getElementById('lootSeason').value = '';
    document.getElementById('lootPlayerAction').value = 'none';
    document.getElementById('lootRollValue').value = '';
    document.getElementById('lootRuleNote').value = '';
    document.getElementById('lootDecisionNote').value = '';
    document.getElementById('lootIsWishlist').checked = false;
  }

  // 回显成员信息
  lootUpdateMemberInfo();
  
  // 更新心愿单匹配
  lootUpdateWishlistMatches();

  // 根据分配方式切换字段显示
  lootOnDistributionMethodChange();
  
  openModal('lootModal');
}

// 编辑装备
function lootEdit(lootId) {
  lootShowModal(lootId);
}

// 保存装备
let lootSaving = false;
async function lootSave() {
  if (lootSaving) return;
  const name = document.getElementById('lootName').value.trim();
  if (!name) {
    showToast('请输入装备名称', 'error');
    return;
  }

  // 防重复提交
  const saveBtn = document.getElementById('lootSaveBtn');
  lootSaving = true;
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.dataset.originalText = saveBtn.textContent;
    saveBtn.textContent = '保存中...';
  }

  const lootData = {
    name: name,
    raid: document.getElementById('lootRaid').value,
    difficulty: document.getElementById('lootDifficulty').value,
    boss: lootGetBossValue(),
    category: document.getElementById('lootCategory').value,
    slot: document.getElementById('lootSlot').value,
    primaryStat: document.getElementById('lootPrimaryStat').value,
    secondaryStats: [...lootSelectedSecondaryStats],
    specialEffect: document.getElementById('lootSpecialEffect').value.trim(),
    assignedTo: document.getElementById('lootAssignedTo').value.trim(),
    status: document.getElementById('lootStatus').value,
    priority: document.getElementById('lootPriority').value,
    date: document.getElementById('lootDate').value,
    note: document.getElementById('lootNote').value.trim(),
    distribution_method: document.getElementById('lootDistributionMethod').value || 'custom',
    season: document.getElementById('lootSeason').value.trim(),
    player_action: document.getElementById('lootPlayerAction').value || 'none',
    roll_value: document.getElementById('lootRollValue').value ? parseInt(document.getElementById('lootRollValue').value, 10) : null,
    rule_note: document.getElementById('lootRuleNote').value.trim(),
    decision_note: document.getElementById('lootDecisionNote').value.trim(),
    is_wishlist: document.getElementById('lootIsWishlist').checked
  };

  const isEdit = !!lootEditingId;
  const oldLoot = isEdit ? (appData.loots || []).find(l => l.id === lootEditingId) : null;

  // 严格 DB-first（Save DB -> Load DB -> Update State -> Render）
  try {
    const payload = { ...lootData, id: lootEditingId || undefined };
    await cloudCrud('loots', isEdit ? 'update' : 'add', payload, { renderFn: lootRender });

    // 联动心愿单：将分配状态变化同步到数据库
    await syncWishlistLinkages(lootData, oldLoot);

    closeModal('lootModal');
    showToast(isEdit ? '装备已更新' : '装备已添加', 'success');
  } catch (e) {
    console.error('[lootSave] 保存失败:', e);
    // 弹窗保持打开，便于用户重试
  } finally {
    lootSaving = false;
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset.originalText || '确认'; }
  }
}

// 根据装备分配状态变化，同步更新心愿单获取状态到数据库
async function syncWishlistLinkages(newLoot, oldLoot) {
  if (!window.CloudSync || !window.CloudSync.isCloudMode()) return;

  const wasAssigned = oldLoot && oldLoot.status === '已分配' && oldLoot.assignedTo;
  const isAssigned = newLoot.status === '已分配' && newLoot.assignedTo;
  let hasChanges = false;

  try {
    // 1. 从已分配变为非已分配：取消对应心愿单的已获取标记
    if (wasAssigned && !isAssigned) {
      await window.CloudSync.reloadData('wishlists');
      const toUnmark = (appData.wishlist || []).filter(w =>
        w.obtained &&
        w.itemName.toLowerCase() === oldLoot.name.toLowerCase() &&
        w.memberName === oldLoot.assignedTo
      );
      for (const w of toUnmark) {
        await cloudCrud('wishlists', 'update', {
          ...w,
          obtained: false,
          obtainedDate: '',
          updatedAt: Date.now()
        }, { renderFn: () => {} });
      }
      if (toUnmark.length > 0) {
        hasChanges = true;
        showToast(`已取消 ${toUnmark.length} 条心愿单的已获取标记`, 'info');
      }
    }

    // 2. 变为已分配：标记对应心愿单为已获取
    if (isAssigned) {
      await window.CloudSync.reloadData('wishlists');
      const obtainInfo = `${newLoot.date || formatDate(new Date())}，${newLoot.difficulty ? newLoot.difficulty + '难度 ' : ''}${newLoot.raid ? newLoot.raid + ' ' : ''}${newLoot.boss ? newLoot.boss + ' ' : ''}获得该装备`;
      const toMark = (appData.wishlist || []).filter(w =>
        !w.obtained &&
        w.itemName.toLowerCase() === newLoot.name.toLowerCase() &&
        w.memberName === newLoot.assignedTo
      );
      for (const w of toMark) {
        const note = w.note ? w.note + '\n' + obtainInfo : obtainInfo;
        await cloudCrud('wishlists', 'update', {
          ...w,
          obtained: true,
          obtainedDate: newLoot.date || formatDate(new Date()),
          note: note,
          updatedAt: Date.now()
        }, { renderFn: () => {} });
      }
      if (toMark.length > 0) {
        hasChanges = true;
        showToast(`已自动标记 ${toMark.length} 条心愿单为已获取`, 'success');
      }
    }

    // 统一刷新
    if (hasChanges) {
      await window.CloudSync.reloadData('wishlists');
      saveData();
      if (typeof wishlistRender === 'function') wishlistRender();
    }
  } catch (e) {
    console.error('心愿单联动同步失败:', e);
  }
}

// 删除装备
async function lootDelete(lootId) {
  if (!confirm('确定要删除这条装备记录吗？')) return;

  const loot = appData.loots ? appData.loots.find(l => l.id === lootId) : null;
  if (!loot) return;

  // 严格 DB-first
  try {
    await cloudCrud('loots', 'delete', { id: loot.id }, { renderFn: lootRender });

    // 联动：删除已分配装备后，取消对应心愿单已获取标记
    if (loot.status === '已分配' && loot.assignedTo) {
      await syncWishlistLinkages({ status: '', assignedTo: '' }, loot);
    }

    showToast('装备已删除', 'success');
  } catch (e) {
    // 错误已在 cloudCrud 中提示
  }
}



// ==================== 心愿单模块 ====================

let wishlistEditingId = null;

// 心愿单状态标签映射
const wishlistStatusBadgeMap = {
  'pending': 'badge-wish-pending',
  'obtained': 'badge-wish-obtained'
};

// 专精类型标签映射
const wishlistSpecBadgeMap = {
  'main': 'badge-spec-main',
  'off': 'badge-spec-off',
  'both': 'badge-spec-both'
};

// 专精类型显示文本
const wishlistSpecTextMap = {
  'main': '主专精',
  'off': '副专精',
  'both': '双修'
};

// 根据大类更新部位下拉选项
function wishlistUpdateSlotOptions(selectedSlot = '') {
  const category = document.getElementById('wishlistCategory').value;
  const slots = lootSlotMap[category] || [];
  const select = document.getElementById('wishlistSlot');
  select.innerHTML = slots.map(s => `<option value="${s}" ${s === selectedSlot ? 'selected' : ''}>${s}</option>`).join('');
}

// 大类变化时更新部位
function wishlistOnCategoryChange() {
  wishlistUpdateSlotOptions();
}

// 团本变化时更新BOSS下拉
function wishlistOnRaidChange() {
  const raid = document.getElementById('wishlistRaid').value;
  const bossSelect = document.getElementById('wishlistBoss');
  const bossText = document.getElementById('wishlistBossText');

  if (raid === '其他' || raid === '__custom__') {
    // 自定义团本，显示文本输入
    bossSelect.style.display = 'none';
    bossText.style.display = 'block';
  } else {
    // 预设团本，显示下拉
    bossSelect.style.display = 'block';
    bossText.style.display = 'none';

    const bosses = raidBossMap[raid] || [];
    if (bosses.length > 0) {
      bossSelect.innerHTML = '<option value="">请选择BOSS</option>' +
        bosses.map(b => `<option value="${b}">${b}</option>`).join('');
    } else {
      bossSelect.innerHTML = '<option value="">暂无BOSS数据</option>';
    }
  }
}

// 切换已获取日期显示
function wishlistToggleObtainedDate() {
  const obtained = document.getElementById('wishlistObtained').checked;
  const dateGroup = document.getElementById('wishlistObtainedDateGroup');
  if (obtained) {
    dateGroup.style.display = 'block';
    if (!document.getElementById('wishlistObtainedDate').value) {
      document.getElementById('wishlistObtainedDate').value = formatDate(new Date());
    }
  } else {
    dateGroup.style.display = 'none';
  }
}

// 渲染心愿单列表
function wishlistRender() {
  const tbody = document.getElementById('wishlistTableBody');
  if (!tbody) return;

  // 更新成员筛选下拉
  const memberFilter = document.getElementById('wishlistMemberFilter');
  if (memberFilter && memberFilter.options.length <= 1) {
    const currentVal = memberFilter.value;
    memberFilter.innerHTML = '<option value="">全部成员</option>' +
      appData.members.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
    memberFilter.value = currentVal;
  }

  let wishlist = [...(appData.wishlist || [])];

  // 搜索过滤
  const searchKw = (document.getElementById('wishlistSearch')?.value || '').toLowerCase();
  if (searchKw) {
    wishlist = wishlist.filter(w => w.itemName.toLowerCase().includes(searchKw));
  }

  // 成员筛选
  const memberFilterVal = document.getElementById('wishlistMemberFilter')?.value || '';
  if (memberFilterVal) {
    wishlist = wishlist.filter(w => w.memberId === memberFilterVal);
  }

  // 优先级筛选
  const priorityFilter = document.getElementById('wishlistPriorityFilter')?.value || '';
  if (priorityFilter) {
    wishlist = wishlist.filter(w => w.priority === priorityFilter);
  }

  // 大类筛选
  const catFilter = document.getElementById('wishlistCategoryFilter')?.value || '';
  if (catFilter) {
    wishlist = wishlist.filter(w => w.category === catFilter);
  }

  // 状态筛选
  const statusFilter = document.getElementById('wishlistStatusFilter')?.value || '';
  if (statusFilter) {
    if (statusFilter === 'pending') {
      wishlist = wishlist.filter(w => !w.obtained);
    } else if (statusFilter === 'obtained') {
      wishlist = wishlist.filter(w => w.obtained);
    }
  }

  // 专精筛选
  const specFilter = document.getElementById('wishlistSpecFilter')?.value || '';
  if (specFilter) {
    if (specFilter === 'main') {
      wishlist = wishlist.filter(w => w.spec === 'main' || w.spec === 'both');
    } else if (specFilter === 'off') {
      wishlist = wishlist.filter(w => w.spec === 'off' || w.spec === 'both');
    }
  }

  if (wishlist.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10">
          <div class="empty-state">
            <div class="empty-icon">🎯</div>
            <div class="empty-text">暂无心愿记录，点击「添加心愿」开始记录</div>
          </div>
        </td>
      </tr>
    `;
    wishlistUpdateBatchToolbar();
    return;
  }

  // 按优先级排序（P0 > P1 > P2），再按是否获取排序
  const priorityOrder = { 'P0': 0, 'P1': 1, 'P2': 2 };
  wishlist.sort((a, b) => {
    if (a.obtained !== b.obtained) return a.obtained ? 1 : -1; // 未获取的在前
    const pa = priorityOrder[a.priority] ?? 99;
    const pb = priorityOrder[b.priority] ?? 99;
    if (pa !== pb) return pa - pb;
    return b.createdAt - a.createdAt;
  });

  tbody.innerHTML = wishlist.map(w => {
    const statusBadge = w.obtained ? 'badge-wish-obtained' : 'badge-wish-pending';
    const statusText = w.obtained ? '已获取' : '未获取';
    const priorityBadge = lootPriorityBadgeMap[w.priority] || '';
    const specBadge = wishlistSpecBadgeMap[w.spec] || '';
    const specText = wishlistSpecTextMap[w.spec] || w.spec;
    const member = appData.members.find(m => m.id === w.memberId);
    const memberName = member ? member.name : w.memberName;
    const cls = member ? classMap[member.class] || '' : '';

    return `
      <tr>
        <td><input type="checkbox" class="wishlist-row-checkbox" value="${w.id}" onchange="wishlistOnRowCheckboxChange()" ${wishlistSelectedIds.has(w.id) ? 'checked' : ''}></td>
        <td><span class="wishlist-item-name">${w.itemName}</span></td>
        <td><span class="wishlist-raid-tag">${w.raid || '-'}</span></td>
        <td>${w.boss || '-'}</td>
        <td>${w.slot || '-'}</td>
        <td class="${cls ? 'class-' + cls : ''}" style="font-weight:500">${memberName}</td>
        <td><span class="badge ${priorityBadge}">${w.priority || 'P2'}</span></td>
        <td><span class="badge ${specBadge}">${specText}</span>${w.specName ? ` <span style="color:var(--text-muted);font-size:11px">(${w.specName})</span>` : ''}</td>
        <td>
          <span class="badge ${statusBadge}">${statusText}</span>
          ${w.obtained && w.obtainedDate ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px">${w.obtainedDate}</div>` : ''}
        </td>
        <td>
          <div class="action-btns">
            <button class="icon-btn" onclick="wishlistCopyTo('${w.id}')" title="复制给其他人">📋</button>
            <button class="icon-btn" onclick="wishlistToggleObtained('${w.id}')" title="${w.obtained ? '标记未获取' : '标记已获取'}">
              ${w.obtained ? '↩️' : '✅'}
            </button>
            <button class="icon-btn" onclick="wishlistEdit('${w.id}')" title="编辑">✏️</button>
            <button class="icon-btn danger" onclick="wishlistDelete('${w.id}')" title="删除">🗑</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  wishlistUpdateBatchToolbar();
}

// ==================== 心愿单批量操作 ====================
let wishlistSelectedIds = new Set();

function wishlistToggleSelectAll(checked) {
  const boxes = document.querySelectorAll('.wishlist-row-checkbox');
  boxes.forEach(cb => {
    cb.checked = checked;
    if (checked) wishlistSelectedIds.add(cb.value);
    else wishlistSelectedIds.delete(cb.value);
  });
  wishlistUpdateBatchToolbar();
}

function wishlistOnRowCheckboxChange() {
  const boxes = document.querySelectorAll('.wishlist-row-checkbox');
  boxes.forEach(cb => {
    if (cb.checked) wishlistSelectedIds.add(cb.value);
    else wishlistSelectedIds.delete(cb.value);
  });
  const allBoxes = document.querySelectorAll('.wishlist-row-checkbox');
  const selectAllEl = document.getElementById('wishlistSelectAll');
  if (selectAllEl) {
    selectAllEl.checked = allBoxes.length > 0 && Array.from(allBoxes).every(cb => cb.checked);
  }
  wishlistUpdateBatchToolbar();
}

function wishlistClearSelection() {
  wishlistSelectedIds.clear();
  const boxes = document.querySelectorAll('.wishlist-row-checkbox');
  boxes.forEach(cb => cb.checked = false);
  const selectAllEl = document.getElementById('wishlistSelectAll');
  if (selectAllEl) selectAllEl.checked = false;
  wishlistUpdateBatchToolbar();
}

function wishlistUpdateBatchToolbar() {
  const toolbar = document.getElementById('wishlistBatchToolbar');
  const countEl = document.getElementById('wishlistBatchCount');
  const n = wishlistSelectedIds.size;
  if (toolbar) toolbar.style.display = n > 0 ? 'flex' : 'none';
  if (countEl) countEl.textContent = `已选择 ${n} 条`;
}

async function wishlistBatchDelete() {
  const ids = Array.from(wishlistSelectedIds);
  if (ids.length === 0) {
    showToast('未选择任何记录', 'warning');
    return;
  }
  if (!confirm(`确定要删除选中的 ${ids.length} 条心愿记录吗？此操作不可恢复。`)) return;

  let successCount = 0;
  let failCount = 0;

  for (const wishId of ids) {
    const wish = (appData.wishlist || []).find(w => w.id === wishId);
    if (!wish) continue;
    try {
      await cloudCrud('wishlists', 'delete', { id: wishId }, { renderFn: () => {} });
      successCount++;
    } catch (e) {
      console.error('批量删除失败:', wishId, e);
      failCount++;
    }
  }

  await window.CloudSync.reloadData('wishlists');
  saveData();
  wishlistSelectedIds.clear();
  wishlistRender();

  if (failCount > 0) {
    showToast(`删除完成：成功 ${successCount} 条，失败 ${failCount} 条`, 'warning');
  } else {
    showToast(`已删除 ${successCount} 条心愿记录`, 'success');
  }
}

// 显示添加/编辑心愿弹窗
function wishlistShowModal(wishId = null, presetData = null) {
  wishlistEditingId = wishId;
  const isEdit = !!wishId;

  // 填充成员下拉（编辑模式用）
  const memberSelect = document.getElementById('wishlistMember');
  memberSelect.innerHTML = '<option value="">请选择成员</option>' +
    appData.members.map(m => `<option value="${m.id}">${m.name} (${m.class})</option>`).join('');

  // 渲染成员多选列表（添加模式用）
  wishlistRenderMemberCheckboxes();

  // 切换成员选择方式
  document.getElementById('wishlistMemberMulti').style.display = isEdit ? 'none' : 'block';
  memberSelect.style.display = isEdit ? 'block' : 'none';

  // 填充团本下拉（raidBossMap keys + 其他）
  const raidSelect = document.getElementById('wishlistRaid');
  const raidOptions = Object.keys(raidBossMap).map(r => `<option value="${r}">${r}</option>`).join('');
  raidSelect.innerHTML = raidOptions + '<option value="其他">其他</option>';

  if (isEdit) {
    document.getElementById('wishlistModalTitle').textContent = '编辑心愿';
    const wish = (appData.wishlist || []).find(w => w.id === wishId);
    if (wish) {
      document.getElementById('wishlistMember').value = wish.memberId || '';
      document.getElementById('wishlistItemName').value = wish.itemName || '';

      // 设置团本
      const raidVal = wish.raid || '虚影尖塔';
      if (raidBossMap.hasOwnProperty(raidVal)) {
        raidSelect.value = raidVal;
      } else {
        raidSelect.value = '其他';
      }
      // 触发BOSS下拉更新
      wishlistOnRaidChange();

      // 设置BOSS值
      if (raidBossMap.hasOwnProperty(raidVal)) {
        document.getElementById('wishlistBoss').value = wish.boss || '';
      } else {
        document.getElementById('wishlistBossText').value = wish.boss || '';
      }

      document.getElementById('wishlistCategory').value = wish.category || '武器';
      wishlistUpdateSlotOptions(wish.slot || '');
      document.getElementById('wishlistPriority').value = wish.priority || 'P2';
      document.getElementById('wishlistSpec').value = wish.spec || 'main';
      document.getElementById('wishlistObtained').checked = wish.obtained || false;
      document.getElementById('wishlistObtainedDate').value = wish.obtainedDate || '';
      wishlistToggleObtainedDate();
      document.getElementById('wishlistNote').value = wish.note || '';
    }
  } else {
    document.getElementById('wishlistModalTitle').textContent = presetData ? '复制心愿' : '添加心愿';
    // 添加模式：清空成员选择
    wishlistSelectAllMembers(false);
    
    // 如果有预设数据（复制场景），填进去
    if (presetData) {
      document.getElementById('wishlistItemName').value = presetData.itemName || '';
      
      const raidVal = presetData.raid || '虚影尖塔';
      if (raidBossMap.hasOwnProperty(raidVal)) {
        raidSelect.value = raidVal;
      } else {
        raidSelect.value = '其他';
      }
      wishlistOnRaidChange();
      
      if (raidBossMap.hasOwnProperty(raidVal)) {
        document.getElementById('wishlistBoss').value = presetData.boss || '';
      } else {
        document.getElementById('wishlistBossText').value = presetData.boss || '';
      }
      
      document.getElementById('wishlistCategory').value = presetData.category || '武器';
      wishlistUpdateSlotOptions(presetData.slot || '');
      document.getElementById('wishlistPriority').value = presetData.priority || 'P2';
      document.getElementById('wishlistSpec').value = presetData.spec || 'main';
      document.getElementById('wishlistObtained').checked = false;
      document.getElementById('wishlistObtainedDate').value = '';
      wishlistToggleObtainedDate();
      document.getElementById('wishlistNote').value = '';
    } else {
      document.getElementById('wishlistItemName').value = '';
      // 默认选第一个团本
      const firstRaid = Object.keys(raidBossMap)[0] || '其他';
      raidSelect.value = firstRaid;
      wishlistOnRaidChange();
      document.getElementById('wishlistCategory').value = '武器';
      wishlistUpdateSlotOptions();
      document.getElementById('wishlistPriority').value = 'P2';
      document.getElementById('wishlistSpec').value = 'main';
      document.getElementById('wishlistObtained').checked = false;
      document.getElementById('wishlistObtainedDate').value = '';
      wishlistToggleObtainedDate();
      document.getElementById('wishlistNote').value = '';
    }
  }

  openModal('wishlistModal');
}

// 渲染成员多选checkbox列表
function wishlistRenderMemberCheckboxes() {
  const container = document.getElementById('wishlistMemberCheckboxes');
  if (!container) return;
  
  const classColors = {
    '战士': '#C79C6E', '法师': '#69CCF0', '牧师': '#FFFFFF',
    '盗贼': '#FFF569', '猎人': '#ABD473', '圣骑士': '#F58CBA',
    '萨满': '#0070DE', '德鲁伊': '#FF7D0A', '术士': '#9482C9',
    '武僧': '#00FF96', '恶魔猎手': '#A330C9', '死亡骑士': '#C41E3A',
    '唤魔师': '#33937F'
  };
  
  container.innerHTML = appData.members.map(m => {
    const cls = classMap[m.class] || '';
    const roles = (m.role || []).join(',');
    const mainSpec = m.main_spec || '';
    const offSpecs = m.off_specs || (m.off_spec ? [m.off_spec] : []);
    const memberRoles = m.role || [];
    const classColor = classColors[m.class] || 'var(--text-primary)';
    
    // 职责标签
    const roleTags = memberRoles.map(r => {
      const type = roleTypeMap[r] || 'dps';
      return `<span class="wm-role-tag ${type}">${r}</span>`;
    }).join('');
    
    // 副专精文本
    const offSpecHtml = offSpecs.length > 0 
      ? `<div class="wm-offspec">副专精：${offSpecs.join('、')}</div>` 
      : '';
    
    return `
      <label class="wishlist-member-checkbox" data-name="${m.name.toLowerCase()}" data-roles="${roles}" 
             style="--class-color: ${classColor}" 
             title="${m.name} · ${m.class}${mainSpec ? ' · ' + mainSpec : ''}${offSpecs.length ? ' · 副：' + offSpecs.join('、') : ''}">
        <input type="checkbox" value="${m.id}" onchange="wishlistUpdateMemberCount()">
        <div class="wm-content">
          <div class="wm-name ${cls ? 'class-' + cls : ''}">${m.name}</div>
          <div class="wm-spec">
            ${roleTags}
            <span>${mainSpec || m.class}</span>
          </div>
          ${offSpecHtml}
        </div>
      </label>
    `;
  }).join('');
  
  wishlistUpdateMemberCount();
}

// 搜索筛选成员
function wishlistFilterMembers() {
  const keyword = document.getElementById('wishlistMemberSearch').value.toLowerCase().trim();
  const items = document.querySelectorAll('#wishlistMemberCheckboxes .wishlist-member-checkbox');
  items.forEach(item => {
    const name = item.dataset.name || '';
    item.style.display = (!keyword || name.includes(keyword)) ? '' : 'none';
  });
}

// 按职责快速选择
function wishlistSelectByRole(role) {
  // 先找出该职责的所有成员ID（转字符串统一类型）
  const memberIds = appData.members
    .filter(m => m.role && m.role.includes(role))
    .map(m => String(m.id));
  
  const checkboxes = document.querySelectorAll('#wishlistMemberCheckboxes input[type="checkbox"]');
  checkboxes.forEach(cb => {
    // 只勾选可见的
    const item = cb.closest('.wishlist-member-checkbox');
    if (item && item.style.display === 'none') return;
    if (memberIds.includes(cb.value)) {
      cb.checked = true;
    }
  });
  wishlistUpdateMemberCount();
}

// 全选/清空成员
function wishlistSelectAllMembers(selectAll) {
  const items = document.querySelectorAll('#wishlistMemberCheckboxes .wishlist-member-checkbox');
  items.forEach(item => {
    if (item.style.display === 'none') return;
    const checkbox = item.querySelector('input[type="checkbox"]');
    checkbox.checked = selectAll;
  });
  wishlistUpdateMemberCount();
}

// 更新已选成员计数
function wishlistUpdateMemberCount() {
  const items = document.querySelectorAll('#wishlistMemberCheckboxes .wishlist-member-checkbox');
  let count = 0;
  items.forEach(item => {
    if (item.style.display === 'none') return;
    const checkbox = item.querySelector('input[type="checkbox"]');
    if (checkbox.checked) count++;
  });
  const countEl = document.getElementById('wishlistMemberCount');
  if (countEl) countEl.textContent = `已选 ${count} 人`;
}

// 编辑心愿
function wishlistEdit(wishId) {
  wishlistShowModal(wishId);
}

// 复制心愿给其他人
function wishlistCopyTo(wishId) {
  const wish = (appData.wishlist || []).find(w => w.id === wishId);
  if (!wish) return;
  
  // 打开添加弹窗，预填装备信息
  const presetData = {
    itemName: wish.itemName,
    raid: wish.raid,
    boss: wish.boss,
    category: wish.category,
    slot: wish.slot,
    priority: wish.priority,
    spec: wish.spec
  };
  
  wishlistShowModal(null, presetData);
}

// 保存心愿
let wishlistSaving = false;
async function wishlistSave() {
  if (wishlistSaving) return;
  const itemName = document.getElementById('wishlistItemName').value.trim();
  const isEdit = !!wishlistEditingId;

  if (!itemName) {
    showToast('请输入装备名称', 'error');
    return;
  }

  // 防重复提交：按钮进入 loading 状态
  const saveBtn = document.getElementById('wishlistSaveBtn');
  wishlistSaving = true;
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.dataset.originalText = saveBtn.textContent;
    saveBtn.textContent = '保存中...';
  }

  // 获取BOSS值（根据团本类型决定从下拉还是文本框取值）
  const raid = document.getElementById('wishlistRaid').value;
  let boss = '';
  if (raid === '其他') {
    boss = document.getElementById('wishlistBossText').value.trim();
  } else {
    boss = document.getElementById('wishlistBoss').value;
  }

  const obtained = document.getElementById('wishlistObtained').checked;
  const category = document.getElementById('wishlistCategory').value;
  const slot = document.getElementById('wishlistSlot').value;
  const priority = document.getElementById('wishlistPriority').value;
  const spec = document.getElementById('wishlistSpec').value;
  const note = document.getElementById('wishlistNote').value.trim();
  const obtainedDate = obtained ? document.getElementById('wishlistObtainedDate').value : '';

  // 计算specName的工具函数
  function calcSpecName(member, specType) {
    if (!member) return '';
    const mainSpec = member.main_spec || member.spec || '';
    const offSpecs = member.off_specs || (member.off_spec ? [member.off_spec] : []);
    const offSpecText = offSpecs.join('、');
    if (specType === 'main') return mainSpec;
    if (specType === 'off') return offSpecText;
    if (specType === 'both') return mainSpec && offSpecText ? `${mainSpec}/${offSpecText}` : mainSpec || offSpecText;
    return '';
  }

  // 严格 DB-first
  try {
    if (isEdit) {
      const memberId = document.getElementById('wishlistMember').value;
      if (!memberId) {
        showToast('请选择成员', 'error');
        return;
      }
      const member = appData.members.find(m => m.id === memberId);
      const targetWish = (appData.wishlist || []).find(w => w.id === wishlistEditingId);
      const wishData = {
        id: targetWish ? targetWish.id : undefined,
        memberId, memberName: member ? member.name : '', itemName, raid, boss, category, slot,
        priority, spec, specName: calcSpecName(member, spec), obtained, obtainedDate, note,
        updatedAt: Date.now()
      };
      await cloudCrud('wishlists', 'update', wishData, { renderFn: wishlistRender });
      closeModal('wishlistModal');
      showToast('心愿已更新', 'success');
    } else {
      const checkedBoxes = document.querySelectorAll('#wishlistMemberCheckboxes input[type="checkbox"]:checked');
      const selectedMemberIds = Array.from(checkedBoxes).map(cb => cb.value);
      if (selectedMemberIds.length === 0) {
        showToast('请至少选择一个成员', 'error');
        return;
      }

      const pendingWishes = [];
      let skipCount = 0;
      selectedMemberIds.forEach(memberId => {
        const member = appData.members.find(m => m.id === memberId);
        if (!member) return;
        const exists = (appData.wishlist || []).some(w =>
          !w.obtained && w.memberId === memberId && w.itemName.toLowerCase() === itemName.toLowerCase()
        );
        if (exists) {
          skipCount++;
          return;
        }
        pendingWishes.push({
          id: genId(), memberId, memberName: member.name, itemName, raid, boss, category, slot,
          priority, spec, specName: calcSpecName(member, spec), obtained, obtainedDate, note,
          createdAt: Date.now(), updatedAt: Date.now()
        });
      });

      if (pendingWishes.length === 0) {
        showToast(skipCount > 0 ? '全部重复，已跳过' : '未选择有效成员', 'warning');
        return;
      }

      // 批量写入 DB，成功后统一 reload
      for (const item of pendingWishes) {
        await cloudCrud('wishlists', 'add', item, { renderFn: () => {} });
      }
      await window.CloudSync.reloadData('wishlists');
      saveData();
      wishlistRender();
      closeModal('wishlistModal');
      const msg = skipCount > 0
        ? `已添加 ${pendingWishes.length} 条心愿，跳过 ${skipCount} 条重复`
        : `已为 ${pendingWishes.length} 人添加心愿`;
      showToast(msg, 'success');
    }
  } catch (e) {
    // 错误已在 cloudCrud / saveCloudData 中提示
  } finally {
    wishlistSaving = false;
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset.originalText || '确定'; }
  }
}

// 删除心愿
async function wishlistDelete(wishId) {
  if (!confirm('确定要删除这条心愿记录吗？')) return;

  const wish = appData.wishlist ? appData.wishlist.find(w => w.id === wishId) : null;
  if (!wish) return;

  // 严格 DB-first
  try {
    await cloudCrud('wishlists', 'delete', { id: wish.id }, { renderFn: wishlistRender });
    showToast('心愿已删除', 'success');
  } catch (e) {
    // 错误已在 cloudCrud 中提示
  }
}

// 切换已获取状态
async function wishlistToggleObtained(wishId) {
  const wish = (appData.wishlist || []).find(w => w.id === wishId);
  if (!wish) return;

  const newObtained = !wish.obtained;
  const newObtainedDate = newObtained ? formatDate(new Date()) : '';

  // 严格 DB-first
  try {
    await cloudCrud('wishlists', 'update', {
      ...wish,
      obtained: newObtained,
      obtainedDate: newObtainedDate,
      updatedAt: Date.now()
    }, { renderFn: wishlistRender });
    showToast(newObtained ? '已标记为已获取 🎉' : '已标记为未获取', newObtained ? 'success' : 'info');
  } catch (e) {
    // 错误已在 cloudCrud 中提示
  }
}


// 装备分配弹窗中更新心愿单匹配
function lootUpdateWishlistMatches() {
  const itemName = document.getElementById('lootName')?.value.trim() || '';
  const matchSection = document.getElementById('lootWishlistMatches');
  const matchList = document.getElementById('lootWishlistMatchList');

  if (!itemName || !matchSection || !matchList) {
    if (matchSection) matchSection.style.display = 'none';
    return;
  }

  // 查找未获取的匹配心愿单
  const matches = (appData.wishlist || [])
    .filter(w => !w.obtained && w.itemName.toLowerCase().includes(itemName.toLowerCase()))
    .sort((a, b) => {
      const priorityOrder = { 'P0': 0, 'P1': 1, 'P2': 2 };
      return (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99);
    });

  if (matches.length === 0) {
    matchSection.style.display = 'none';
    return;
  }

  matchSection.style.display = 'block';
  matchList.innerHTML = matches.map(w => {
    const specText = wishlistSpecTextMap[w.spec] || w.spec;
    const member = appData.members.find(m => m.id === w.memberId);
    const memberName = member ? member.name : w.memberName;
    return `
      <span class="wish-match-member" onclick="lootFillAssignedTo('${memberName}')">
        <span class="match-priority">${w.priority}</span>
        <span>${memberName}</span>
        <span style="font-size:10px;opacity:0.7">(${specText})</span>
      </span>
    `;
  }).join('');
}

// 自动填充分配给谁
function lootFillAssignedTo(name) {
  const select = document.getElementById('lootAssignedTo');
  if (select) {
    // 检查下拉中是否有这个选项
    const optionExists = Array.from(select.options).some(o => o.value === name);
    if (!optionExists) {
      // 没有则添加
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name + ' · （自定义）';
      select.appendChild(opt);
    }
    select.value = name;
    lootUpdateMemberInfo();
  }
  lootUpdateWishlistMatches();
}


// ==================== 初始化 ====================
// ==================== 更新日志 ====================
const changelogData = [
  {
    id: 'v3.0.0',
    version: 'v3.0.0',
    date: '2026-07-22',
    type: 'feature',
    typeLabel: '重大更新',
    title: '用户中心与英雄榜集成',
    summary: '新增完整的用户中心系统，支持个人资料管理、魔兽世界角色管理（集成英雄榜 URL 解析）、通知系统（成员加入/退出提醒）。',
    details: [
      '新增用户中心入口（侧边栏按钮），包含个人资料、我的角色、通知三个标签页',
      '支持编辑显示名称等个人资料',
      '新增角色管理功能：添加/删除魔兽世界角色',
      '支持英雄榜 URL 自动解析（国服/亚服/欧美服），自动提取角色名、服务器、区域',
      '角色信息包含：职业、专精、种族、阵营、等级、装等、所属公会',
      '新增通知系统：成员加入/退出公会时自动通知公会管理者',
      '通知支持未读计数徽章显示',
      '新增数据库表：user_profiles、user_characters、notifications'
    ]
  },
  {
    id: 'v2.13.0',
    version: 'v2.13.0',
    date: '2026-07-22',
    type: 'feature',
    typeLabel: '功能增强',
    title: '公会创建支持服务器选择',
    summary: '创建公会时可选择服务器区域，支持手动输入服务器名称。公会设置显示公会 ID 和服务器信息。',
    details: [
      '新增服务器区域下拉选择（一区、三区、五区、十区、推荐服务器）',
      '根据区域动态加载服务器列表（100+ 国服正式服服务器）',
      '支持手动输入服务器名称',
      '公会设置弹窗显示公会 ID（UUID）',
      '数据库 guilds 表新增 server_name 和 server_region 字段'
    ]
  },
  {
    id: 'v2.12.2',
    version: 'v2.12.2',
    date: '2026-07-22',
    type: 'bugfix',
    typeLabel: '问题修复',
    title: '修复 Supabase RLS INSERT 策略失效问题',
    summary: '通过 server.js 代理写入操作解决 PostgREST RLS INSERT 策略不生效的问题。',
    details: [
      '问题：PostgREST schema 缓存导致 INSERT 策略即使 WITH CHECK (true) 也返回 403',
      '解决：新增 server.js 代理端点，使用 service_role key 绕过 RLS 限制',
      '前端写入操作通过代理执行，读取操作仍直接通过 Supabase REST API'
    ]
  },
  {
    id: 'v2.12.1',
    version: 'v2.12.1',
    date: '2026-07-09',
    type: 'feature',
    typeLabel: '功能增强',
    title: '装备库新增首领掉落筛选',
    summary: '装备库筛选器新增「首领掉落」维度，与所属团本联动，选中团本后可进一步按具体BOSS筛选掉落装备。',
    details: [
      '新增「首领掉落」下拉筛选，位于所属团本下方',
      '与团本筛选联动：未选团本时禁用，选中团本后自动加载对应BOSS列表',
      'BOSS顺序与游戏内一致，标注1号/2号/尾王等序号',
      '覆盖全部4个团本共10个BOSS',
      '与现有搜索/部位/护甲/副属性筛选叠加使用'
    ]
  },
  {
    id: 'v2.12.0',
    version: 'v2.12.0',
    date: '2026-07-09',
    type: 'feature',
    typeLabel: '重大更新',
    title: '装备库全面接入Raidbots官方数据源',
    summary: '装备库从10件手写样本升级为Raidbots真实数据源，覆盖12.0版本全部4个团本共103件掉落装备，属性类型与数值完整映射。',
    details: [
      '数据源切换为Raidbots encounter-items.json，确保数据准确性与时效性',
      '覆盖4个团本：虚影尖塔(60件)、进军奎尔丹纳斯(24件)、梦境裂隙(8件)、孢陨幽境(11件)',
      '修正饰品主属性缺失问题，正确显示力量/敏捷/智力/全主属性等',
      '完整stat映射：主属性(力/敏/智/混合) + 耐力 + 副属性(爆击/急速/精通/全能)',
      '装备属性数值化显示（基于alloc比例系数换算）',
      '新增slotDetail/armorDetail字段保留详细分类信息',
      '筛选器与新数据结构完全兼容'
    ]
  },
  {
    id: 'v2.11.4',
    version: 'v2.11.4',
    date: '2026-07-07',
    type: 'bugfix',
    typeLabel: '数据修正',
    title: '虚影尖塔BOSS列表修正',
    summary: '修正虚影尖塔团本BOSS序列：威厄高尔与艾佐拉克为双子BOSS（同一战斗），新增遗漏的光盲先锋BOSS。',
    details: [
      '合并4号BOSS：威厄高尔、艾佐拉克 → 威厄高尔和艾佐拉克（双子BOSS）',
      '新增5号BOSS：光盲先锋',
      'BOSS总数保持6个，序列与官方一致'
    ]
  },
  {
    id: 'v2.11.3',
    version: 'v2.11.3',
    date: '2026-07-07',
    type: 'bugfix',
    typeLabel: '数据与映射修复',
    title: '装备库归属与分类映射全面修复',
    summary: '彻查并修复装备库模块的多处数据映射问题：装备分类映射错误、slot名称不统一、团本数据缺失、BOSS名称不一致等，确保从装备库选择后所有字段准确填充。',
    details: [
      '分类映射修正：副手→武器（原错误归为首饰）、披风→防具（原错误归为首饰）',
      '新增slot名称映射表：项链→颈部、戒指→手指、副手→副手物品、披风→背部，统一装备库与下拉选项的命名差异',
      '防具部位新增「背部」，支持披风类装备',
      '团本数据补全：raidBossMap新增「孢陨幽境」（替换原占位的12.1新团本），含腐沼BOSS',
      '团本名称映射补全：mire→孢陨幽境',
      'BOSS名称修正：进军奎尔丹纳斯1号「贝朗洛」→「贝洛朗」',
      '装备分配与心愿单双端同步修复'
    ]
  },
  {
    id: 'v2.11.2',
    version: 'v2.11.2',
    date: '2026-07-07',
    type: 'bugfix',
    typeLabel: '数据修正',
    title: '装备库数据修正',
    summary: '修正装备库中2处数据错误：虚影尖塔1号BOSS归属、贝罗梅洛恩武器类型。',
    details: [
      '虚影尖塔1号BOSS从「弗拉希乌斯」修正为「元首阿福扎恩」（光耀连队队旗）',
      '贝罗梅洛恩，破碎之爪 slot 从「武器」修正为「单手剑」，避免装备分配时默认显示为单手锤'
    ]
  },
  {
    id: 'v2.11.1',
    version: 'v2.11.1',
    date: '2026-07-07',
    type: 'bugfix',
    typeLabel: 'Bug修复',
    title: '心愿单装备库填充字段丢失',
    summary: '修复心愿单从装备库选择装备后，团本、装备大类、部位等字段未填充的问题。原因是装备库使用英文raid标识而心愿单下拉使用中文名，且分类映射只覆盖了布皮锁板四类防具。',
    details: [
      '新增团本名称映射：英文标识 → 中文名（voidspire→虚影尖塔等）',
      '装备大类映射从4类扩充到全类型：武器/防具/首饰/饰品全覆盖',
      'BOSS下拉增加显示状态判断，避免自定义模式下报错'
    ]
  },
  {
    id: 'v2.11.0',
    version: 'v2.11.0',
    date: '2026-07-07',
    type: 'feature',
    typeLabel: '功能新增',
    title: '装备分配支持从装备库选择',
    summary: '装备分配弹窗新增「从装备库选择」按钮，复用装备库选择器，选中后自动填充装备名称、团本、BOSS、大类、部位、主副属性、特殊效果等全部字段，与心愿单共享装备数据源，匹配更精准。',
    details: [
      '装备名称字段下方新增「📦 从装备库选择」按钮',
      '复用心愿单的装备库选择器弹窗，支持按团本/部位/护甲/属性多维度筛选',
      '选中装备后一键填充：名称、团本、BOSS、装备大类、部位、主属性、副属性、特殊效果',
      '装备库选择器支持双模式（wishlist/loot），同一组件两处复用',
      '主属性为组合属性时（如敏捷/力量）自动取第一项',
      '副属性自动勾选对应标签（爆击统一映射为暴击）',
      '填充后自动触发心愿单匹配提示'
    ]
  },
  {
    id: 'v2.10.1',
    version: 'v2.10.1',
    date: '2026-07-07',
    type: 'enhancement',
    typeLabel: '体验优化',
    title: '成员下拉选项职业色',
    summary: '装备分配成员下拉选择器中每个选项文字显示对应职业颜色，选中后下拉框本身也同步显示职业色，视觉识别更直观。',
    details: [
      '下拉列表中每个成员选项文字使用对应职业颜色显示',
      '选中成员后下拉框本身文字也同步变为职业色',
      '自定义成员保持默认文字色，区分清晰'
    ]
  },
  {
    id: 'v2.10.0',
    version: 'v2.10.0',
    date: '2026-07-07',
    type: 'feature',
    typeLabel: '功能新增',
    title: '装备分配成员联动选择',
    summary: '装备分配弹窗中"分配给谁"升级为成员下拉选择器，自动关联成员管理数据，选中后展示完整成员信息条（职业色+职责+主副专精）。',
    details: [
      '"分配给谁"从文本输入改为下拉选择，自动加载成员管理中的所有成员',
      '下拉选项格式：名字 · 职业 · 主专精，按名称排序，快速识别',
      '选中成员后展示成员信息条：左侧职业色条 + 名字（职业色）+ 职业 + 职责标签 + 主专精 + 副专精',
      '副专精为空时不显示该字段，信息简洁不冗余',
      '兼容历史数据：不在成员列表中的已分配名字显示为"自定义"标签',
      '心愿单匹配的"点击自动填充"功能同步适配，点击后自动选中并展示信息'
    ]
  },
  {
    id: 'v2.9.1',
    version: 'v2.9.1',
    date: '2026-07-07',
    type: 'improve',
    typeLabel: '体验优化',
    title: '成员选择器布局+下拉菜单+副专精Bug修复',
    summary: '成员选择器卡片布局重构（勾选框右上+内容左对齐）、全站下拉菜单对比度提升、修复编辑成员时副专精被重置的Bug。',
    details: [
      '勾选框从卡片左侧移至右上角，与内容分离，视觉更清爽',
      '卡片内容区（名称/职责/主副专精）统一左对齐，上下对齐平行',
      '卡片flex布局改为顶部对齐，保证元素顶部基准线一致',
      '全站select下拉菜单option样式统一：深色背景+浅色文字+金色选中态',
      '筛选下拉框文字颜色从灰色提亮至主色，增强可读性',
      '修复编辑成员弹窗时副专精被重置为空的Bug：调整初始化顺序，先渲染下拉框再恢复副专精数据'
    ]
  },
  {
    id: 'v2.9.0',
    version: 'v2.9.0',
    date: '2026-07-07',
    type: 'improve',
    typeLabel: '体验优化',
    title: 'PC端UX视觉全面升级',
    summary: '桌面端视觉质感与交互体验全面升级，侧边栏收窄、卡片层次优化、统计卡片渐变动效、表格斑马纹、弹窗精致化，整体更具层次与精致感。',
    details: [
      '侧边栏宽度从240px收窄至200px，标题升级为「WoW团本工具箱」，增加阴影层次感',
      '导航项选中态优化：金色渐变背景+左侧金色竖条+图标发光效果，悬停态金色微光',
      '所有功能模块卡片化升级：圆角阴影+悬浮加深阴影，卡片标题增加左侧金色渐变色条',
      '仪表盘统计卡片全面升级：金色大号数字+径向渐变背景+悬浮上浮动效+图标淡入',
      '数据表格升级：表头金色底边+大写字母间距+斑马纹奇偶行区分+悬停金色高亮边',
      '表格单元格内边距加大（12px 16px），提升阅读舒适度',
      '弹窗精致化：背景遮罩6px模糊+弹窗12px圆角+淡入滑入动画+多层阴影层次',
      '弹窗标题增加左侧金色色条，关闭按钮旋转动效+金色悬停',
      '按钮交互升级：主按钮悬浮上移+金色光晕，次按钮悬浮加深+轻微上浮',
      '输入框/下拉框优化：hover边框加深+focus金色光晕+微背景提亮',
      '整体暗金风格更统一：页面背景最暗→卡片稍亮→弹窗最亮，三层递进层次分明',
      '移动端样式完全不受影响，768px以下保持v2.8.0底部Tab+卡片化布局'
    ]
  },
  {
    id: 'v2.8.0',
    version: 'v2.8.0',
    date: '2026-07-07',
    type: 'feature',
    typeLabel: '功能升级',
    title: '移动端响应式适配',
    summary: '全面的移动端响应式适配，底部Tab栏导航、表格卡片化、弹窗全屏、触控优化，手机端体验大幅提升。',
    details: [
      '移动端底部固定Tab栏（5个核心页面），替代侧边栏导航，类微信底部导航体验',
      '仪表盘统计卡片从4列改为2列，适配窄屏显示',
      '成员表格、心愿单表格、装备分配表格全部转为卡片列表式布局',
      '心愿单成员选择器从4列改为2列，卡片高度增加至48px，触控友好',
      '所有弹窗改为底部弹出全屏模式（92vh高度），内容可滚动',
      '所有按钮最小高度44px，输入框44px，符合移动端触控规范',
      'Checkbox、下拉选择器、职责标签等交互元素全面加大触控区域',
      '表单双列布局改为单列，避免移动端输入框过窄',
      '顶部栏高度压缩至48px，隐藏日期显示，预留更多内容空间',
      '内容区域padding缩小为12px，卡片间距优化为12px',
      '日历视图适配移动端，日期格子比例调整',
      '活动列表项改为纵向布局，统计数据分散底部展示',
      '装备库弹窗筛选区改为顶部横向，列表占满下方空间',
      '保持暗色主题+金色点缀风格不变，桌面端样式完全不受影响'
    ]
  },
  {
    id: 'v2.7.0',
    version: 'v2.7.0',
    date: '2026-07-07',
    type: 'feature',
    typeLabel: '功能升级',
    title: '成员选择器信息完整化',
    summary: '心愿单成员选择卡片全面升级，对齐成员管理数据，展示职业色条、名字、职责标签、主专精、副专精完整信息，4列网格布局信息密度更合理。',
    details: [
      '卡片左侧新增职业色条，一眼识别职业归属',
      '展示完整成员信息：名字（职业色）+ 职责标签 + 主专精 + 副专精',
      '布局从6列调整为4列，适配更丰富的信息展示',
      '职责标签配色与成员管理一致：坦克蓝、输出红、治疗绿',
      '副专精有则显示，无则不显示，卡片高度自适应',
      '选中态名字变亮金加粗，视觉反馈清晰',
      '鼠标悬停显示完整信息 tooltip'
    ]
  },
  {
    id: 'v2.6.2',
    version: 'v2.6.2',
    date: '2026-07-07',
    type: 'improve',
    typeLabel: '体验优化',
    title: '成员选择器卡片尺寸统一',
    summary: '心愿单成员选择卡片统一高度和宽度，名字过长自动省略，所有卡片视觉尺寸一致。',
    details: [
      '成员卡片统一固定高度30px，6列网格下所有卡片尺寸完全一致',
      '成员名称过长自动省略号截断，hover可查看完整名称',
      '职业标签固定右侧，不随名字长度挤压布局',
      '调整字体大小和内边距，整体更紧凑适配宽幅布局'
    ]
  },
  {
    id: 'v2.6.1',
    version: 'v2.6.1',
    date: '2026-07-07',
    type: 'improve',
    typeLabel: '体验优化',
    title: '成员选择器升级 + 装备属性彩色化',
    summary: '心愿单弹窗布局调整为装备在上、成员在下，成员列表改为6列宽幅布局；装备库属性文字按游戏内配色着色。',
    details: [
      '弹窗布局调整：装备名称放第一行全宽，成员多选放第二行全宽',
      '弹窗宽度加宽至800px，成员列表改为6列扁矩形布局，一屏显示更多成员',
      '新增成员搜索框，支持按名称快速筛选定位',
      '保留全选/清空功能，工具栏简洁化',
      '每个选项增加卡片式边框和内边距，选中状态金色高亮',
      '装备库主属性按War3/Dota2配色：力量-红、敏捷-绿、智力-蓝',
      '装备库副属性按魔兽游戏内配色：爆击-橙、急速-绿、精通-蓝、全能-紫',
      '主属性支持组合显示（如"敏捷/力量"分别着色）',
      '全选/清空只作用于当前可见成员（搜索过滤后）'
    ]
  },
  {
    id: 'v2.6.0',
    version: 'v2.6.0',
    date: '2026-07-07',
    type: 'feature',
    typeLabel: '新增功能',
    title: '装备数据库选择器 MVP',
    summary: '心愿单新增装备库选择功能，内置12.0版本团本装备样本数据，支持按团本/部位/类型/属性多维度筛选，点击即可自动填充装备信息。',
    details: [
      '心愿单添加弹窗新增「从装备库选择」按钮，打开装备库选择面板',
      '左侧筛选栏：团本、部位、护甲类型、副属性四维筛选 + 关键词搜索',
      '右侧装备列表：卡片式展示，包含装备名称、装等、部位、主副属性、掉落来源、装备特效',
      '史诗品质装备名称显示紫色，与游戏内一致',
      '选中装备后自动填充心愿单：装备名称、所属团本、掉落BOSS、护甲类型、装备部位',
      'MVP版本内置10件样本装备，覆盖4个团本、多种装备类型',
      '后续版本将扩展至全团本掉落装备数据库'
    ]
  },
  {
    id: 'v2.5.1',
    version: 'v2.5.1',
    date: '2026-07-07',
    type: 'feature',
    typeLabel: '新增功能',
    title: '心愿单批量添加 & 一键复制',
    summary: '心愿单新增批量添加能力，支持一次选多人批量录入同款装备心愿；每条心愿支持一键复制给其他成员，大幅提升录入效率。',
    details: [
      '添加心愿时成员改为多选checkbox列表（双列布局，带滚动）',
      '支持全选/清空，实时显示已选人数',
      '一次勾选多人，批量生成多条心愿记录，每人独立一条',
      '自动去重：同一成员已有同款未获取心愿时自动跳过，避免重复录入',
      '每条心愿新增「复制给其他人」按钮，一键预填装备信息开新弹窗',
      '复制模式自动清空获取状态，只复制装备属性配置',
      '编辑模式保持原单选成员不变',
      '修复离队状态英文inactive显示问题，兼容带空格的旧数据'
    ]
  },
  {
    id: 'v2.5.0',
    version: 'v2.5.0',
    date: '2026-07-07',
    type: 'feature',
    typeLabel: '新增功能',
    title: '成员管理职责过滤',
    summary: '成员管理页面新增职责多选过滤，支持按坦克/输出/治疗筛选成员，可与职业、搜索组合使用。',
    details: [
      '成员列表工具栏新增职责过滤区域（职业筛选旁）',
      '支持多选AND逻辑：勾选多个职责，成员必须同时拥有全部职责才显示',
      '未勾选任何职责时不过滤，显示全部成员',
      '职责标签颜色：坦克蓝、输出红、治疗绿',
      '可与搜索框、职业筛选组合叠加过滤',
      '修复离队状态value为英文inactive的问题，统一为中文「离队」',
      '修复已有英文状态值（inactive/active）的中文显示兼容'
    ]
  },
  {
    id: 'v2.4.0',
    version: 'v2.4.0',
    date: '2026-07-07',
    type: 'improve',
    typeLabel: '功能优化',
    title: '副专精多选 & 职责颜色调整',
    summary: '成员副专精从单选改为多选，支持同一职业下多个副专精；职责标签颜色调整为坦克蓝、输出红、治疗绿。',
    details: [
      '副专精改为checkbox多选，可选择除主专精外的任意数量副专精',
      '无论选择几个职责，都会显示主专精+副专精区域',
      '主专精变更时自动从副专精列表中排除，避免重复',
      '成员列表副专精以顿号分隔显示多个',
      '职责标签颜色调整：坦克-蓝色、输出-红色、治疗-绿色',
      '心愿单副专精标签同步支持多专精显示',
      '数据向后兼容：旧版 off_spec 字符串自动迁移为 off_specs 数组'
    ]
  },
  {
    id: 'v2.3.0',
    version: 'v2.3.0',
    date: '2026-07-07',
    type: 'improve',
    typeLabel: '功能优化',
    title: '心愿单与装备分配深度联动',
    summary: '装备分配与心愿单双向联动增强，分配装备时自动标记心愿单完成并记录获取详情，误操作可自动回退。',
    details: [
      '装备标记为已分配时，自动将对应成员的同名心愿单标记为已获取',
      '自动在心愿单备注中追加获取详情：日期、难度、团本、BOSS',
      '编辑装备分配时若取消已分配状态，自动回退心愿单已获取标记',
      '删除已分配装备记录时，同步取消对应心愿单的已获取标记',
      '匹配规则：装备名称（不区分大小写）+ 成员名 完全匹配'
    ]
  },
  {
    id: 'v2.2.0',
    version: 'v2.2.0',
    date: '2026-07-07',
    type: 'feature',
    typeLabel: '新增功能',
    title: '心愿单模块上线',
    summary: '新增心愿单模块，支持团员录入装备需求，与装备分配联动形成「许愿→掉落→分配→自动完成」闭环。',
    details: [
      '心愿单增删改查，支持按成员、优先级、装备大类、状态、专精类型筛选',
      '装备分配弹窗自动显示有需求的成员，按优先级排序，点击一键填充分配对象',
      '装备标记为已分配时，自动将对应心愿单标记为已获取并记录日期',
      '支持团本-BOSS级联选择，12.0至暗之夜3个团本9个BOSS预置',
      '支持飞书双向同步（JSON导入导出）',
      '全局导入导出包含心愿单数据'
    ]
  },
  {
    id: 'v2.1.5',
    version: 'v2.1.5',
    date: '2026-07-07',
    type: 'improve',
    typeLabel: '功能优化',
    title: '装备分配新增团本级联',
    summary: '装备分配模块新增「所属团本」字段，与BOSS下拉级联，解决多团本并行时BOSS同名混淆问题。',
    details: [
      '新增所属团本字段，支持虚影尖塔、梦境裂隙、进军奎尔丹纳斯3个团本',
      'BOSS下拉与团本级联，选择团本后自动显示对应BOSS列表',
      '支持「其他」团本自定义输入BOSS名称',
      '筛选工具栏新增团本筛选器',
      '装备表格新增所属团本列'
    ]
  },
  {
    id: 'v2.1.0',
    version: 'v2.1.0',
    date: '2026-07-06',
    type: 'feature',
    typeLabel: '新增功能',
    title: '装备分配模块上线',
    summary: '新增装备分配模块，支持13字段详细记录，与飞书多维表格双向同步。',
    details: [
      '13字段设计：装备名称、掉落难度、掉落BOSS、装备大类、装备部位、主属性、副属性、特殊效果、分配给谁、分配状态、优先级、活动日期、备注',
      '装备大类与部位级联选择，副属性多选标签',
      '支持按名称搜索、难度/大类/状态/优先级多维筛选',
      '飞书多维表格双向同步（JSON导入导出 + CLI中转）',
      '暗色主题+金色点缀视觉风格'
    ]
  },
  {
    id: 'v2.0.0',
    version: 'v2.0.0',
    date: '2026-07-06',
    type: 'refactor',
    typeLabel: '模块调整',
    title: '前端页面大版本重构',
    summary: '前端页面从独立HTML重构为单页应用，统一暗色主题+金色点缀视觉风格，整合多个功能模块。',
    details: [
      '侧边栏导航架构，支持多模块切换',
      '统一卡片/表格/弹窗/按钮组件样式',
      '数据本地持久化（localStorage）',
      '全局导入导出JSON，支持合并/覆盖模式'
    ]
  },
  {
    id: 'v1.5.0',
    version: 'v1.5.0',
    date: '2026-07-06',
    type: 'improve',
    typeLabel: '功能优化',
    title: '成员模块功能增强',
    summary: '成员管理模块新增职责多选、主副专精、职业-专精级联等功能，数据结构升级并兼容旧数据自动迁移。',
    details: [
      '职责字段支持多选（输出/治疗/坦克）',
      '新增主专精、副专精字段，副专精在职责≥2时显示',
      '职业-专精级联选择，13个职业全覆盖',
      '支持恶魔猎手「噬灭」等11.0新专精',
      '旧数据自动迁移（spec → main_spec）'
    ]
  },
  {
    id: 'v1.0.0',
    version: 'v1.0.0',
    date: '2026-07-06',
    type: 'feature',
    typeLabel: '新增功能',
    title: '考勤管理系统基础版上线',
    summary: 'WoW团本考勤管理系统首个版本上线，支持成员、活动、考勤记录的增删改查与飞书多维表格同步。',
    details: [
      '成员管理：职业、职责、备注等基础信息',
      '活动管理：创建活动并记录出席成员',
      '考勤统计：出勤率、出席次数等统计报表',
      '飞书多维表格双向同步',
      '日历视图 + 列表视图双模式'
    ]
  }
];

let currentChangelogFilter = 'all';

function changelogRender() {
  const timeline = document.getElementById('changelogTimeline');
  if (!timeline) return;
  
  let items = [...changelogData];
  
  // 按类型筛选
  if (currentChangelogFilter !== 'all') {
    items = items.filter(item => item.type === currentChangelogFilter);
  }
  
  // 按日期倒序
  items.sort((a, b) => b.date.localeCompare(a.date));
  
  if (items.length === 0) {
    timeline.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-text">暂无更新记录</div>
      </div>
    `;
    return;
  }
  
  timeline.innerHTML = items.map(item => `
    <div class="changelog-item">
      <div class="changelog-date">${item.date}</div>
      <div class="changelog-dot dot-${item.type}"></div>
      <div class="changelog-card" onclick="changelogToggle('${item.id}')">
        <div class="changelog-header">
          <div class="changelog-title">${item.title}</div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="changelog-version">${item.version}</span>
            <span class="changelog-toggle">▼</span>
          </div>
        </div>
        <div class="changelog-tags">
          <span class="changelog-tag tag-${item.type}">${item.typeLabel}</span>
        </div>
        <div class="changelog-summary">${item.summary}</div>
        <div class="changelog-details">
          <ul>
            ${item.details.map(d => `<li>${d}</li>`).join('')}
          </ul>
        </div>
      </div>
    </div>
  `).join('');
}

function changelogFilter(type) {
  currentChangelogFilter = type;
  
  // 更新筛选按钮状态
  document.querySelectorAll('#page-changelog .filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
  
  changelogRender();
}

function changelogToggle(id) {
  const cards = document.querySelectorAll('.changelog-card');
  cards.forEach(card => {
    // 不直接通过id匹配，而是找被点击的那个
  });
  
  // 通过event.target找到最近的card
  // 因为onclick直接传id，我们重新找
  const allCards = document.querySelectorAll('.changelog-card');
  allCards.forEach(card => {
    const title = card.querySelector('.changelog-title')?.textContent;
    const item = changelogData.find(d => d.title === title);
    if (item && item.id === id) {
      card.classList.toggle('expanded');
    }
  });
}

// ==================== 初始化 ====================
async function init() {
  // 设置今日日期显示
  const now = new Date();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const todayEl = document.getElementById('todayStr');
  if (todayEl) {
    todayEl.textContent = 
      `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} 周${weekdays[now.getDay()]}`;
  }

  // 尝试初始化云端
  let cloudReady = false;
  if (window.CloudSync) {
    try {
      cloudReady = !!(await window.CloudSync.init());
      window.CloudSync.setupAuthListener();

      // 检查是否已有登录态
      const user = await window.CloudSync.getCurrentUser();
      if (user) {
        // 已登录，加载数据
        await window.CloudSync.loadUserGuilds();
        const guilds = window.CloudSync.getUserGuilds();
        if (guilds.length > 0) {
          const lastGuildId = localStorage.getItem('wow_raid_last_guild');
          const guild = guilds.find(g => g.id === lastGuildId) || guilds[0];
          if (guild) {
            await window.CloudSync.selectGuild(guild.id);
          }
          showAppView();
          return;
        } else {
          // 已登录但没有公会
          document.getElementById('authOverlay').style.display = 'flex';
          document.querySelector('.app-container').style.display = 'none';
          showGuildForm();
          return;
        }
      }
    } catch (e) {
      console.warn('云端初始化失败', e);
    }
  }

  // 未登录或云端不可用 - 停留在登录/注册界面（Supabase 是唯一数据源）
  const authOverlay = document.getElementById('authOverlay');
  const appContainer = document.querySelector('.app-container');
  
  if (authOverlay) {
    authOverlay.style.display = 'flex';
    if (appContainer) appContainer.style.display = 'none';
  }

  // 云端不可用时停留在登录页并给出明确提示
  if (!cloudReady) {
    showAuthError('云端服务不可用，请检查网络后刷新重试');
  }
}

// 页面加载完成后初始化
init();

// 窗口大小变化时重绘图表
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const activePage = document.querySelector('.page.active');
    if (activePage && activePage.id === 'page-reports') {
      renderReports();
    }
  }, 200);
});

// ===== 装备数据库（12.0 四团本 103件）=====
  // ===== 装备数据库（12.0 四团本 103件）=====
  // ===== 装备数据库（12.0 四团本 103件）=====
  const itemDatabase = [
    {
      id: 249922,
      name: "Tome of Alnscorned Regret",
      nameCn: "",
      quality: "epic",
      slot: "副手",
      slotDetail: "副手物品",
      armorType: "副手",
      armorDetail: "副手",
      itemLevel: 197,
      raid: "dreamrift",
      raidName: "梦境裂隙",
      boss: "Chimaerus the Undreamt God",
      bossIndex: "尾王",
      bossOrder: 0,
      stats: {
        primary: "智力",
        secondary: ["急速", "精通"],
        primaryDetail: [{"id": 5, "name": "智力", "alloc": 16132, "value": 121}],
        secondaryDetail: [{"id": 36, "name": "急速", "alloc": 4889, "value": 37}, {"id": 49, "name": "精通", "alloc": 2111, "value": 16}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "📕",
      iconFile: "inv_offhand_1h_raidmidnight_d_01"
    },
    {
      id: 249278,
      name: "Alnscorned Spire",
      nameCn: "",
      quality: "epic",
      slot: "武器",
      slotDetail: "双手武器",
      armorType: "武器",
      armorDetail: "法杖",
      itemLevel: 197,
      raid: "dreamrift",
      raidName: "梦境裂隙",
      boss: "Chimaerus the Undreamt God",
      bossIndex: "尾王",
      bossOrder: 0,
      stats: {
        primary: "敏捷",
        secondary: ["急速", "全能"],
        primaryDetail: [{"id": 3, "name": "敏捷", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 36, "name": "急速", "alloc": 4821, "value": 36}, {"id": 40, "name": "全能", "alloc": 2179, "value": 16}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "⚔️",
      iconFile: "inv_staff_2h_raidmidnight_d_01"
    },
    {
      id: 249373,
      name: "Dream-Scorched Striders",
      nameCn: "",
      quality: "epic",
      slot: "脚部",
      slotDetail: "脚部",
      armorType: "布甲",
      armorDetail: "布甲",
      itemLevel: 197,
      raid: "dreamrift",
      raidName: "梦境裂隙",
      boss: "Chimaerus the Undreamt God",
      bossIndex: "尾王",
      bossOrder: 0,
      stats: {
        primary: "智力",
        secondary: ["精通", "爆击"],
        primaryDetail: [{"id": 5, "name": "智力", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 49, "name": "精通", "alloc": 4842, "value": 36}, {"id": 32, "name": "爆击", "alloc": 2158, "value": 16}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "👢",
      iconFile: "inv_boot_cloth_raidmagemidnight_d_01"
    },
    {
      id: 249381,
      name: "Greaves of the Unformed",
      nameCn: "",
      quality: "epic",
      slot: "脚部",
      slotDetail: "脚部",
      armorType: "板甲",
      armorDetail: "板甲",
      itemLevel: 197,
      raid: "dreamrift",
      raidName: "梦境裂隙",
      boss: "Chimaerus the Undreamt God",
      bossIndex: "尾王",
      bossOrder: 0,
      stats: {
        primary: "力量/智力",
        secondary: ["爆击", "精通"],
        primaryDetail: [{"id": 74, "name": "力/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 4688, "value": 35}, {"id": 49, "name": "精通", "alloc": 2312, "value": 17}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "👢",
      iconFile: "inv_boot_plate_raidwarriormidnight_d_01"
    },
    {
      id: 249371,
      name: "Scornbane Waistguard",
      nameCn: "",
      quality: "epic",
      slot: "腰部",
      slotDetail: "腰部",
      armorType: "锁甲",
      armorDetail: "锁甲",
      itemLevel: 197,
      raid: "dreamrift",
      raidName: "梦境裂隙",
      boss: "Chimaerus the Undreamt God",
      bossIndex: "尾王",
      bossOrder: 0,
      stats: {
        primary: "敏捷/智力",
        secondary: ["急速", "精通"],
        primaryDetail: [{"id": 73, "name": "敏/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 36, "name": "急速", "alloc": 4926, "value": 37}, {"id": 49, "name": "精通", "alloc": 2074, "value": 16}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🎗️",
      iconFile: "inv_belt_mail_raidhuntermidnight_d_01"
    },
    {
      id: 249374,
      name: "Scorn-Scarred Shul'ka's Belt",
      nameCn: "",
      quality: "epic",
      slot: "腰部",
      slotDetail: "腰部",
      armorType: "皮甲",
      armorDetail: "皮甲",
      itemLevel: 197,
      raid: "dreamrift",
      raidName: "梦境裂隙",
      boss: "Chimaerus the Undreamt God",
      bossIndex: "尾王",
      bossOrder: 0,
      stats: {
        primary: "敏捷/智力",
        secondary: ["急速", "爆击"],
        primaryDetail: [{"id": 73, "name": "敏/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 36, "name": "急速", "alloc": 4849, "value": 36}, {"id": 32, "name": "爆击", "alloc": 2151, "value": 16}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🎗️",
      iconFile: "inv_belt_leather_raidmonkmidnight_d_01"
    },
    {
      id: 249343,
      name: "Gaze of the Alnseer",
      nameCn: "",
      quality: "epic",
      slot: "饰品",
      slotDetail: "饰品",
      armorType: "饰品",
      armorDetail: "饰品",
      itemLevel: 197,
      raid: "dreamrift",
      raidName: "梦境裂隙",
      boss: "Chimaerus the Undreamt God",
      bossIndex: "尾王",
      bossOrder: 0,
      stats: {
        primary: "",
        secondary: ["精通"],
        primaryDetail: [],
        secondaryDetail: [{"id": 49, "name": "精通", "alloc": 6666, "value": 50}],
        stamina: null,
        other: []
      },
      equipEffect: "被动饰品",
      onUseTrinket: false,
      icon: "🔮",
      iconFile: "inv_12_trinket_raid_dreamrift_gazeofthealnseer"
    },
    {
      id: 249805,
      name: "Undreamt God's Oozing Vestige",
      nameCn: "",
      quality: "epic",
      slot: "饰品",
      slotDetail: "饰品",
      armorType: "饰品",
      armorDetail: "饰品",
      itemLevel: 197,
      raid: "dreamrift",
      raidName: "梦境裂隙",
      boss: "Chimaerus the Undreamt God",
      bossIndex: "尾王",
      bossOrder: 0,
      stats: {
        primary: "力量/敏捷",
        secondary: [],
        primaryDetail: [{"id": 72, "name": "力/敏", "alloc": 6666, "value": 50}],
        secondaryDetail: [],
        stamina: null,
        other: []
      },
      equipEffect: "被动饰品",
      onUseTrinket: false,
      icon: "🔮",
      iconFile: "inv_12_trinket_raid_dreamrift__physdps2_umdreamtgodsoozingvestige"
    },
    {
      id: 268283,
      name: "Festerbloom Crown",
      nameCn: "",
      quality: "epic",
      slot: "头部",
      slotDetail: "头部",
      armorType: "皮甲",
      armorDetail: "皮甲",
      itemLevel: 298,
      raid: "mire",
      raidName: "孢陨幽境",
      boss: "Rotmire",
      bossIndex: "尾王",
      bossOrder: 0,
      stats: {
        primary: "敏捷/智力",
        secondary: ["急速", "爆击"],
        primaryDetail: [{"id": 73, "name": "敏/智", "alloc": 5259, "value": 101}],
        secondaryDetail: [{"id": 36, "name": "急速", "alloc": 4575, "value": 88}, {"id": 32, "name": "爆击", "alloc": 2425, "value": 47}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 151},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🪖",
      iconFile: "inv_helm_leather_raiddruidmidnight_d_01"
    },
    {
      id: 268290,
      name: "Sporecaller's Blooming Loop",
      nameCn: "",
      quality: "epic",
      slot: "戒指",
      slotDetail: "戒指",
      armorType: "戒指",
      armorDetail: "戒指",
      itemLevel: 298,
      raid: "mire",
      raidName: "孢陨幽境",
      boss: "Rotmire",
      bossIndex: "尾王",
      bossOrder: 0,
      stats: {
        primary: "",
        secondary: ["急速", "精通"],
        primaryDetail: [],
        secondaryDetail: [{"id": 36, "name": "急速", "alloc": 14500, "value": 278}, {"id": 49, "name": "精通", "alloc": 3000, "value": 58}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 151},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "💍",
      iconFile: "inv_12_jewelry_rutaani_ring_blue"
    },
    {
      id: 268284,
      name: "Mycomancer's Rot Robes",
      nameCn: "",
      quality: "epic",
      slot: "胸部",
      slotDetail: "胸部",
      armorType: "布甲",
      armorDetail: "布甲",
      itemLevel: 298,
      raid: "mire",
      raidName: "孢陨幽境",
      boss: "Rotmire",
      bossIndex: "尾王",
      bossOrder: 0,
      stats: {
        primary: "智力",
        secondary: ["急速", "精通"],
        primaryDetail: [{"id": 5, "name": "智力", "alloc": 5259, "value": 101}],
        secondaryDetail: [{"id": 36, "name": "急速", "alloc": 4651, "value": 89}, {"id": 49, "name": "精通", "alloc": 2349, "value": 45}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 151},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🎽",
      iconFile: "inv_chest_cloth_raidmagemidnight_d_01"
    },
    {
      id: 268285,
      name: "Putrid Tender's Battleplate",
      nameCn: "",
      quality: "epic",
      slot: "胸部",
      slotDetail: "胸部",
      armorType: "板甲",
      armorDetail: "板甲",
      itemLevel: 298,
      raid: "mire",
      raidName: "孢陨幽境",
      boss: "Rotmire",
      bossIndex: "尾王",
      bossOrder: 0,
      stats: {
        primary: "力量/智力",
        secondary: ["精通", "急速"],
        primaryDetail: [{"id": 74, "name": "力/智", "alloc": 5259, "value": 101}],
        secondaryDetail: [{"id": 49, "name": "精通", "alloc": 4790, "value": 92}, {"id": 36, "name": "急速", "alloc": 2210, "value": 42}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 151},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🎽",
      iconFile: "inv_plate_raiddeathknightmidnight_d_01_chest"
    },
    {
      id: 268282,
      name: "Luxurious Loamstriders",
      nameCn: "",
      quality: "epic",
      slot: "脚部",
      slotDetail: "脚部",
      armorType: "布甲",
      armorDetail: "布甲",
      itemLevel: 298,
      raid: "mire",
      raidName: "孢陨幽境",
      boss: "Rotmire",
      bossIndex: "尾王",
      bossOrder: 0,
      stats: {
        primary: "智力",
        secondary: ["精通", "爆击"],
        primaryDetail: [{"id": 5, "name": "智力", "alloc": 5259, "value": 101}],
        secondaryDetail: [{"id": 49, "name": "精通", "alloc": 4901, "value": 94}, {"id": 32, "name": "爆击", "alloc": 2099, "value": 40}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 151},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "👢",
      iconFile: "inv_boot_cloth_raidpriestmidnight_d_01"
    },
    {
      id: 268287,
      name: "Grudgefiend Stompers",
      nameCn: "",
      quality: "epic",
      slot: "脚部",
      slotDetail: "脚部",
      armorType: "锁甲",
      armorDetail: "锁甲",
      itemLevel: 298,
      raid: "mire",
      raidName: "孢陨幽境",
      boss: "Rotmire",
      bossIndex: "尾王",
      bossOrder: 0,
      stats: {
        primary: "敏捷/智力",
        secondary: ["精通", "急速"],
        primaryDetail: [{"id": 73, "name": "敏/智", "alloc": 5259, "value": 101}],
        secondaryDetail: [{"id": 49, "name": "精通", "alloc": 4566, "value": 88}, {"id": 36, "name": "急速", "alloc": 2434, "value": 47}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 151},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "👢",
      iconFile: "inv_boot_mail_raidshamanmidnight_d_01"
    },
    {
      id: 268286,
      name: "Sash of the Putrid Giant",
      nameCn: "",
      quality: "epic",
      slot: "腰部",
      slotDetail: "腰部",
      armorType: "皮甲",
      armorDetail: "皮甲",
      itemLevel: 298,
      raid: "mire",
      raidName: "孢陨幽境",
      boss: "Rotmire",
      bossIndex: "尾王",
      bossOrder: 0,
      stats: {
        primary: "敏捷/智力",
        secondary: ["爆击", "精通"],
        primaryDetail: [{"id": 73, "name": "敏/智", "alloc": 5259, "value": 101}],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 4876, "value": 94}, {"id": 49, "name": "精通", "alloc": 2124, "value": 41}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 151},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🎗️",
      iconFile: "inv_belt_leather_raidroguemidnight_d_01"
    },
    {
      id: 268289,
      name: "Girdle of Devouring Rot",
      nameCn: "",
      quality: "epic",
      slot: "腰部",
      slotDetail: "腰部",
      armorType: "板甲",
      armorDetail: "板甲",
      itemLevel: 298,
      raid: "mire",
      raidName: "孢陨幽境",
      boss: "Rotmire",
      bossIndex: "尾王",
      bossOrder: 0,
      stats: {
        primary: "力量/智力",
        secondary: ["爆击", "精通"],
        primaryDetail: [{"id": 74, "name": "力/智", "alloc": 5259, "value": 101}],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 4990, "value": 96}, {"id": 49, "name": "精通", "alloc": 2010, "value": 39}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 151},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🎗️",
      iconFile: "inv_belt_plate_raidpaladinmidnight_d_01"
    },
    {
      id: 268288,
      name: "Fungarian Folly Faulds",
      nameCn: "",
      quality: "epic",
      slot: "腿部",
      slotDetail: "腿部",
      armorType: "锁甲",
      armorDetail: "锁甲",
      itemLevel: 298,
      raid: "mire",
      raidName: "孢陨幽境",
      boss: "Rotmire",
      bossIndex: "尾王",
      bossOrder: 0,
      stats: {
        primary: "敏捷/智力",
        secondary: ["爆击", "精通"],
        primaryDetail: [{"id": 73, "name": "敏/智", "alloc": 5259, "value": 101}],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 4825, "value": 93}, {"id": 49, "name": "精通", "alloc": 2175, "value": 42}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 151},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "👖",
      iconFile: "inv_pant_mail_raidevokermidnight_d_01"
    },
    {
      id: 268291,
      name: "Rotmire's Sporeheart",
      nameCn: "",
      quality: "epic",
      slot: "项链",
      slotDetail: "项链",
      armorType: "项链",
      armorDetail: "项链",
      itemLevel: 298,
      raid: "mire",
      raidName: "孢陨幽境",
      boss: "Rotmire",
      bossIndex: "尾王",
      bossOrder: 0,
      stats: {
        primary: "",
        secondary: ["精通", "爆击"],
        primaryDetail: [],
        secondaryDetail: [{"id": 49, "name": "精通", "alloc": 14900, "value": 286}, {"id": 32, "name": "爆击", "alloc": 2600, "value": 50}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 151},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "📿",
      iconFile: "inv_12_jewelry_rutaani_necklace_blue"
    },
    {
      id: 268292,
      name: "Sporelord's Mycelial Insignia",
      nameCn: "",
      quality: "epic",
      slot: "饰品",
      slotDetail: "饰品",
      armorType: "饰品",
      armorDetail: "饰品",
      itemLevel: 298,
      raid: "mire",
      raidName: "孢陨幽境",
      boss: "Rotmire",
      bossIndex: "尾王",
      bossOrder: 0,
      stats: {
        primary: "力量/敏捷/智力",
        secondary: [],
        primaryDetail: [{"id": 71, "name": "全主属性", "alloc": 6666, "value": 128}],
        secondaryDetail: [],
        stamina: null,
        other: []
      },
      equipEffect: "被动饰品",
      onUseTrinket: false,
      icon: "🔮",
      iconFile: "inv_1207_fungarianraid_trinket"
    },
    {
      id: 249919,
      name: "Sin'dorei Band of Hope",
      nameCn: "",
      quality: "epic",
      slot: "戒指",
      slotDetail: "戒指",
      armorType: "戒指",
      armorDetail: "戒指",
      itemLevel: 197,
      raid: "queldanas",
      raidName: "进军奎尔丹纳斯",
      boss: "Belo'ren, Child of Al'ar",
      bossIndex: "1号",
      bossOrder: 0,
      stats: {
        primary: "",
        secondary: ["爆击", "精通"],
        primaryDetail: [],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 14350, "value": 108}, {"id": 49, "name": "精通", "alloc": 3150, "value": 24}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "💍",
      iconFile: "inv_12_jewelry_silvermoonelf_ring_red1"
    },
    {
      id: 249307,
      name: "Emberborn Grasps",
      nameCn: "",
      quality: "epic",
      slot: "手",
      slotDetail: "手",
      armorType: "板甲",
      armorDetail: "板甲",
      itemLevel: 197,
      raid: "queldanas",
      raidName: "进军奎尔丹纳斯",
      boss: "Belo'ren, Child of Al'ar",
      bossIndex: "1号",
      bossOrder: 0,
      stats: {
        primary: "力量/智力",
        secondary: ["爆击", "全能"],
        primaryDetail: [{"id": 74, "name": "力/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 4619, "value": 35}, {"id": 40, "name": "全能", "alloc": 2381, "value": 18}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🧤",
      iconFile: "inv_glove_plate_raidpaladinmidnight_d_01"
    },
    {
      id: 249283,
      name: "Belo'melorn, the Shattered Talon",
      nameCn: "",
      quality: "epic",
      slot: "武器",
      slotDetail: "单手武器",
      armorType: "武器",
      armorDetail: "双手斧",
      itemLevel: 197,
      raid: "queldanas",
      raidName: "进军奎尔丹纳斯",
      boss: "Belo'ren, Child of Al'ar",
      bossIndex: "1号",
      bossOrder: 0,
      stats: {
        primary: "智力/智力",
        secondary: ["急速", "精通"],
        primaryDetail: [{"id": 5, "name": "智力", "alloc": 5259, "value": 39}, {"id": 5, "name": "智力", "alloc": 25370, "value": 190}],
        secondaryDetail: [{"id": 36, "name": "急速", "alloc": 4755, "value": 36}, {"id": 49, "name": "精通", "alloc": 2245, "value": 17}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "⚔️",
      iconFile: "inv_knife_1h_raidmidnight_d_02"
    },
    {
      id: 249284,
      name: "Belo'ren's Swift Talon",
      nameCn: "",
      quality: "epic",
      slot: "武器",
      slotDetail: "单手武器",
      armorType: "武器",
      armorDetail: "双手斧",
      itemLevel: 197,
      raid: "queldanas",
      raidName: "进军奎尔丹纳斯",
      boss: "Belo'ren, Child of Al'ar",
      bossIndex: "1号",
      bossOrder: 0,
      stats: {
        primary: "敏捷",
        secondary: ["爆击", "精通"],
        primaryDetail: [{"id": 3, "name": "敏捷", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 4964, "value": 37}, {"id": 49, "name": "精通", "alloc": 2036, "value": 15}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "⚔️",
      iconFile: "inv_knife_1h_raidmidnight_d_01"
    },
    {
      id: 249921,
      name: "Thalassian Dawnguard",
      nameCn: "",
      quality: "epic",
      slot: "盾牌",
      slotDetail: "盾牌",
      armorType: "盾牌",
      armorDetail: "盾牌",
      itemLevel: 197,
      raid: "queldanas",
      raidName: "进军奎尔丹纳斯",
      boss: "Belo'ren, Child of Al'ar",
      bossIndex: "1号",
      bossOrder: 0,
      stats: {
        primary: "力量/智力",
        secondary: ["全能", "爆击"],
        primaryDetail: [{"id": 4, "name": "力量", "alloc": 5259, "value": 39}, {"id": 5, "name": "智力", "alloc": 16132, "value": 121}],
        secondaryDetail: [{"id": 40, "name": "全能", "alloc": 4921, "value": 37}, {"id": 32, "name": "爆击", "alloc": 2079, "value": 16}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🛡️",
      iconFile: "inv_shield_1h_raidmidnight_d_01"
    },
    {
      id: 249328,
      name: "Echoing Void Mantle",
      nameCn: "",
      quality: "epic",
      slot: "肩部",
      slotDetail: "肩部",
      armorType: "布甲",
      armorDetail: "布甲",
      itemLevel: 197,
      raid: "queldanas",
      raidName: "进军奎尔丹纳斯",
      boss: "Belo'ren, Child of Al'ar",
      bossIndex: "1号",
      bossOrder: 0,
      stats: {
        primary: "智力",
        secondary: ["急速", "精通"],
        primaryDetail: [{"id": 5, "name": "智力", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 36, "name": "急速", "alloc": 4928, "value": 37}, {"id": 49, "name": "精通", "alloc": 2072, "value": 16}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🛡️",
      iconFile: "inv_shoulder_cloth_raidmagemidnight_d_01"
    },
    {
      id: 249322,
      name: "Radiant Clutchtender's Jerkin",
      nameCn: "",
      quality: "epic",
      slot: "胸部",
      slotDetail: "胸部",
      armorType: "皮甲",
      armorDetail: "皮甲",
      itemLevel: 197,
      raid: "queldanas",
      raidName: "进军奎尔丹纳斯",
      boss: "Belo'ren, Child of Al'ar",
      bossIndex: "1号",
      bossOrder: 0,
      stats: {
        primary: "敏捷/智力",
        secondary: ["爆击", "精通"],
        primaryDetail: [{"id": 73, "name": "敏/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 4787, "value": 36}, {"id": 49, "name": "精通", "alloc": 2213, "value": 17}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🎽",
      iconFile: "inv_chest_leather_raidmonkmidnight_d_01"
    },
    {
      id: 249377,
      name: "Darkstrider Treads",
      nameCn: "",
      quality: "epic",
      slot: "脚部",
      slotDetail: "脚部",
      armorType: "锁甲",
      armorDetail: "锁甲",
      itemLevel: 197,
      raid: "queldanas",
      raidName: "进军奎尔丹纳斯",
      boss: "Belo'ren, Child of Al'ar",
      bossIndex: "1号",
      bossOrder: 0,
      stats: {
        primary: "敏捷/智力",
        secondary: ["爆击", "急速"],
        primaryDetail: [{"id": 73, "name": "敏/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 4967, "value": 37}, {"id": 36, "name": "急速", "alloc": 2033, "value": 15}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "👢",
      iconFile: "inv_boot_mail_raidhuntermidnight_d_01"
    },
    {
      id: 249376,
      name: "Whisper-Inscribed Sash",
      nameCn: "",
      quality: "epic",
      slot: "腰部",
      slotDetail: "腰部",
      armorType: "布甲",
      armorDetail: "布甲",
      itemLevel: 197,
      raid: "queldanas",
      raidName: "进军奎尔丹纳斯",
      boss: "Belo'ren, Child of Al'ar",
      bossIndex: "1号",
      bossOrder: 0,
      stats: {
        primary: "智力",
        secondary: ["精通", "急速"],
        primaryDetail: [{"id": 5, "name": "智力", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 49, "name": "精通", "alloc": 4651, "value": 35}, {"id": 36, "name": "急速", "alloc": 2349, "value": 18}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🎗️",
      iconFile: "inv_belt_cloth_raidmagemidnight_d_01"
    },
    {
      id: 249324,
      name: "Eternal Flame Scaleguards",
      nameCn: "",
      quality: "epic",
      slot: "腿部",
      slotDetail: "腿部",
      armorType: "锁甲",
      armorDetail: "锁甲",
      itemLevel: 197,
      raid: "queldanas",
      raidName: "进军奎尔丹纳斯",
      boss: "Belo'ren, Child of Al'ar",
      bossIndex: "1号",
      bossOrder: 0,
      stats: {
        primary: "敏捷/智力",
        secondary: ["精通", "急速"],
        primaryDetail: [{"id": 73, "name": "敏/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 49, "name": "精通", "alloc": 4766, "value": 36}, {"id": 36, "name": "急速", "alloc": 2234, "value": 17}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "👖",
      iconFile: "inv_pant_mail_raidhuntermidnight_d_01"
    },
    {
      id: 249806,
      name: "Radiant Plume",
      nameCn: "",
      quality: "epic",
      slot: "饰品",
      slotDetail: "饰品",
      armorType: "饰品",
      armorDetail: "饰品",
      itemLevel: 197,
      raid: "queldanas",
      raidName: "进军奎尔丹纳斯",
      boss: "Belo'ren, Child of Al'ar",
      bossIndex: "1号",
      bossOrder: 0,
      stats: {
        primary: "力量/敏捷",
        secondary: [],
        primaryDetail: [{"id": 72, "name": "力/敏", "alloc": 6666, "value": 50}],
        secondaryDetail: [],
        stamina: null,
        other: []
      },
      equipEffect: "被动饰品",
      onUseTrinket: false,
      icon: "🔮",
      iconFile: "inv_12_dualityphoenix_holy_feather"
    },
    {
      id: 249807,
      name: "The Eternal Egg",
      nameCn: "",
      quality: "epic",
      slot: "饰品",
      slotDetail: "饰品",
      armorType: "饰品",
      armorDetail: "饰品",
      itemLevel: 197,
      raid: "queldanas",
      raidName: "进军奎尔丹纳斯",
      boss: "Belo'ren, Child of Al'ar",
      bossIndex: "1号",
      bossOrder: 0,
      stats: {
        primary: "力量/敏捷",
        secondary: [],
        primaryDetail: [{"id": 72, "name": "力/敏", "alloc": 6666, "value": 50}],
        secondaryDetail: [],
        stamina: null,
        other: []
      },
      equipEffect: "被动饰品",
      onUseTrinket: false,
      icon: "🔮",
      iconFile: "inv_12_trinket_raid_darkwell_tank2_phoenixegg"
    },
    {
      id: 260235,
      name: "Umbral Plume",
      nameCn: "",
      quality: "epic",
      slot: "饰品",
      slotDetail: "饰品",
      armorType: "饰品",
      armorDetail: "饰品",
      itemLevel: 197,
      raid: "queldanas",
      raidName: "进军奎尔丹纳斯",
      boss: "Belo'ren, Child of Al'ar",
      bossIndex: "1号",
      bossOrder: 0,
      stats: {
        primary: "力量/敏捷",
        secondary: [],
        primaryDetail: [{"id": 72, "name": "力/敏", "alloc": 6666, "value": 50}],
        secondaryDetail: [],
        stamina: null,
        other: []
      },
      equipEffect: "被动饰品",
      onUseTrinket: false,
      icon: "🔮",
      iconFile: "inv_12_dualityphoenix_void_feather"
    },
    {
      id: 249913,
      name: "Mask of Darkest Intent",
      nameCn: "",
      quality: "epic",
      slot: "头部",
      slotDetail: "头部",
      armorType: "皮甲",
      armorDetail: "皮甲",
      itemLevel: 197,
      raid: "queldanas",
      raidName: "进军奎尔丹纳斯",
      boss: "Midnight Falls",
      bossIndex: "尾王",
      bossOrder: 1,
      stats: {
        primary: "敏捷/智力",
        secondary: ["急速"],
        primaryDetail: [{"id": 73, "name": "敏/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 36, "name": "急速", "alloc": 7000, "value": 52}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🪖",
      iconFile: "inv_helm_leather_raidroguemidnight_d_01"
    },
    {
      id: 249914,
      name: "Oblivion Guise",
      nameCn: "",
      quality: "epic",
      slot: "头部",
      slotDetail: "头部",
      armorType: "锁甲",
      armorDetail: "锁甲",
      itemLevel: 197,
      raid: "queldanas",
      raidName: "进军奎尔丹纳斯",
      boss: "Midnight Falls",
      bossIndex: "尾王",
      bossOrder: 1,
      stats: {
        primary: "敏捷/智力",
        secondary: ["爆击"],
        primaryDetail: [{"id": 73, "name": "敏/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 7000, "value": 52}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🪖",
      iconFile: "inv_helm_mail_raidshamanmidnight_d_01"
    },
    {
      id: 249920,
      name: "Eye of Midnight",
      nameCn: "",
      quality: "epic",
      slot: "戒指",
      slotDetail: "戒指",
      armorType: "戒指",
      armorDetail: "戒指",
      itemLevel: 197,
      raid: "queldanas",
      raidName: "进军奎尔丹纳斯",
      boss: "Midnight Falls",
      bossIndex: "尾王",
      bossOrder: 1,
      stats: {
        primary: "",
        secondary: ["急速"],
        primaryDetail: [],
        secondaryDetail: [{"id": 36, "name": "急速", "alloc": 17500, "value": 131}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "💍",
      iconFile: "inv_12_jewelry_devouringhost_ring_bronze"
    },
    {
      id: 249286,
      name: "Brazier of the Dissonant Dirge",
      nameCn: "",
      quality: "epic",
      slot: "武器",
      slotDetail: "双手武器",
      armorType: "武器",
      armorDetail: "法杖",
      itemLevel: 197,
      raid: "queldanas",
      raidName: "进军奎尔丹纳斯",
      boss: "Midnight Falls",
      bossIndex: "尾王",
      bossOrder: 1,
      stats: {
        primary: "智力/智力",
        secondary: ["精通"],
        primaryDetail: [{"id": 5, "name": "智力", "alloc": 5259, "value": 39}, {"id": 5, "name": "智力", "alloc": 18121, "value": 136}],
        secondaryDetail: [{"id": 49, "name": "精通", "alloc": 7000, "value": 52}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "⚔️",
      iconFile: "inv_staff_2h_raidmidnight_d_02"
    },
    {
      id: 249296,
      name: "Alah'endal, the Dawnsong",
      nameCn: "",
      quality: "epic",
      slot: "武器",
      slotDetail: "双手武器",
      armorType: "武器",
      armorDetail: "弓",
      itemLevel: 197,
      raid: "queldanas",
      raidName: "进军奎尔丹纳斯",
      boss: "Midnight Falls",
      bossIndex: "尾王",
      bossOrder: 1,
      stats: {
        primary: "力量",
        secondary: ["急速"],
        primaryDetail: [{"id": 4, "name": "力量", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 36, "name": "急速", "alloc": 7000, "value": 52}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "⚔️",
      iconFile: "inv_axe_2h_raidmidnight_d_01"
    },
    {
      id: 260408,
      name: "Lightless Lament",
      nameCn: "",
      quality: "epic",
      slot: "武器",
      slotDetail: "单手武器",
      armorType: "武器",
      armorDetail: "长柄武器",
      itemLevel: 197,
      raid: "queldanas",
      raidName: "进军奎尔丹纳斯",
      boss: "Midnight Falls",
      bossIndex: "尾王",
      bossOrder: 1,
      stats: {
        primary: "敏/智/智力",
        secondary: ["爆击"],
        primaryDetail: [{"id": 73, "name": "敏/智", "alloc": 5259, "value": 39}, {"id": 5, "name": "智力", "alloc": 25370, "value": 190}],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 7000, "value": 52}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "⚔️",
      iconFile: "inv_glaive_1h_darknaaru_d_01"
    },
    {
      id: 249912,
      name: "Robes of Endless Oblivion",
      nameCn: "",
      quality: "epic",
      slot: "胸部",
      slotDetail: "胸部",
      armorType: "布甲",
      armorDetail: "布甲",
      itemLevel: 197,
      raid: "queldanas",
      raidName: "进军奎尔丹纳斯",
      boss: "Midnight Falls",
      bossIndex: "尾王",
      bossOrder: 1,
      stats: {
        primary: "智力",
        secondary: ["急速"],
        primaryDetail: [{"id": 5, "name": "智力", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 36, "name": "急速", "alloc": 7000, "value": 52}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🎽",
      iconFile: "inv_chest_cloth_raidwarlockmidnight_d_01"
    },
    {
      id: 249915,
      name: "Extinction Guards",
      nameCn: "",
      quality: "epic",
      slot: "腿部",
      slotDetail: "腿部",
      armorType: "板甲",
      armorDetail: "板甲",
      itemLevel: 197,
      raid: "queldanas",
      raidName: "进军奎尔丹纳斯",
      boss: "Midnight Falls",
      bossIndex: "尾王",
      bossOrder: 1,
      stats: {
        primary: "力量/智力",
        secondary: ["精通"],
        primaryDetail: [{"id": 74, "name": "力/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 49, "name": "精通", "alloc": 7000, "value": 52}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "👖",
      iconFile: "inv_plate_raiddeathknightmidnight_d_01_pant"
    },
    {
      id: 250247,
      name: "Amulet of the Abyssal Hymn",
      nameCn: "",
      quality: "epic",
      slot: "项链",
      slotDetail: "项链",
      armorType: "项链",
      armorDetail: "项链",
      itemLevel: 197,
      raid: "queldanas",
      raidName: "进军奎尔丹纳斯",
      boss: "Midnight Falls",
      bossIndex: "尾王",
      bossOrder: 1,
      stats: {
        primary: "",
        secondary: ["精通", "急速"],
        primaryDetail: [],
        secondaryDetail: [{"id": 49, "name": "精通", "alloc": 15000, "value": 112}, {"id": 36, "name": "急速", "alloc": 2500, "value": 19}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "📿",
      iconFile: "inv_12_jewelry_devouringhost_necklace_bronze2"
    },
    {
      id: 249810,
      name: "Shadow of the Empyrean Requiem",
      nameCn: "",
      quality: "epic",
      slot: "饰品",
      slotDetail: "饰品",
      armorType: "饰品",
      armorDetail: "饰品",
      itemLevel: 197,
      raid: "queldanas",
      raidName: "进军奎尔丹纳斯",
      boss: "Midnight Falls",
      bossIndex: "尾王",
      bossOrder: 1,
      stats: {
        primary: "智力",
        secondary: [],
        primaryDetail: [{"id": 5, "name": "智力", "alloc": 6666, "value": 50}],
        secondaryDetail: [],
        stamina: null,
        other: []
      },
      equipEffect: "被动饰品",
      onUseTrinket: false,
      icon: "🔮",
      iconFile: "inv_12_trinket_raid_darkwell_intdps2"
    },
    {
      id: 249811,
      name: "Light of the Cosmic Crescendo",
      nameCn: "",
      quality: "epic",
      slot: "饰品",
      slotDetail: "饰品",
      armorType: "饰品",
      armorDetail: "饰品",
      itemLevel: 197,
      raid: "queldanas",
      raidName: "进军奎尔丹纳斯",
      boss: "Midnight Falls",
      bossIndex: "尾王",
      bossOrder: 1,
      stats: {
        primary: "智力",
        secondary: [],
        primaryDetail: [{"id": 5, "name": "智力", "alloc": 6666, "value": 50}],
        secondaryDetail: [],
        stamina: null,
        other: []
      },
      equipEffect: "被动饰品",
      onUseTrinket: false,
      icon: "🔮",
      iconFile: "inv_12_trinket_raid_darkwelle_healer3_cosmiccrescendo"
    },
    {
      id: 249306,
      name: "Devouring Night's Visage",
      nameCn: "",
      quality: "epic",
      slot: "头部",
      slotDetail: "头部",
      armorType: "皮甲",
      armorDetail: "皮甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Imperator Averzian",
      bossIndex: "1号",
      bossOrder: 0,
      stats: {
        primary: "敏捷/智力",
        secondary: ["精通", "爆击"],
        primaryDetail: [{"id": 73, "name": "敏/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 49, "name": "精通", "alloc": 4945, "value": 37}, {"id": 32, "name": "爆击", "alloc": 2055, "value": 15}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🪖",
      iconFile: "inv_helm_leather_raiddemonhuntermidnight_d_01"
    },
    {
      id: 249326,
      name: "Light's March Bracers",
      nameCn: "",
      quality: "epic",
      slot: "手腕",
      slotDetail: "手腕",
      armorType: "板甲",
      armorDetail: "板甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Imperator Averzian",
      bossIndex: "1号",
      bossOrder: 0,
      stats: {
        primary: "力量/智力",
        secondary: ["急速", "精通"],
        primaryDetail: [{"id": 74, "name": "力/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 36, "name": "急速", "alloc": 4986, "value": 37}, {"id": 49, "name": "精通", "alloc": 2014, "value": 15}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "⌚",
      iconFile: "inv_bracer_plate_raidwarriormidnight_d_01"
    },
    {
      id: 249279,
      name: "Sunstrike Rifle",
      nameCn: "",
      quality: "epic",
      slot: "武器",
      slotDetail: "远程武器",
      armorType: "武器",
      armorDetail: "弩",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Imperator Averzian",
      bossIndex: "1号",
      bossOrder: 0,
      stats: {
        primary: "敏捷",
        secondary: ["急速", "精通"],
        primaryDetail: [{"id": 3, "name": "敏捷", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 36, "name": "急速", "alloc": 4924, "value": 37}, {"id": 49, "name": "精通", "alloc": 2076, "value": 16}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "⚔️",
      iconFile: "inv_firearm_2h_raidmidnight_d_01"
    },
    {
      id: 249293,
      name: "Weight of Command",
      nameCn: "",
      quality: "epic",
      slot: "武器",
      slotDetail: "单手武器",
      armorType: "武器",
      armorDetail: "匕首",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Imperator Averzian",
      bossIndex: "1号",
      bossOrder: 0,
      stats: {
        primary: "智力/智力",
        secondary: ["爆击", "全能"],
        primaryDetail: [{"id": 5, "name": "智力", "alloc": 5259, "value": 39}, {"id": 5, "name": "智力", "alloc": 25370, "value": 190}],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 4559, "value": 34}, {"id": 40, "name": "全能", "alloc": 2441, "value": 18}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "⚔️",
      iconFile: "inv_mace_1h_raidmidnight_d_02"
    },
    {
      id: 249275,
      name: "Bulwark of Noble Resolve",
      nameCn: "",
      quality: "epic",
      slot: "盾牌",
      slotDetail: "盾牌",
      armorType: "盾牌",
      armorDetail: "盾牌",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Imperator Averzian",
      bossIndex: "1号",
      bossOrder: 0,
      stats: {
        primary: "力量/智力",
        secondary: ["全能", "爆击"],
        primaryDetail: [{"id": 4, "name": "力量", "alloc": 5259, "value": 39}, {"id": 5, "name": "智力", "alloc": 16132, "value": 121}],
        secondaryDetail: [{"id": 40, "name": "全能", "alloc": 4890, "value": 37}, {"id": 32, "name": "爆击", "alloc": 2110, "value": 16}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🛡️",
      iconFile: "inv_shield_1h_raidmidnight_d_01"
    },
    {
      id: 249313,
      name: "Light-Judged Spaulders",
      nameCn: "",
      quality: "epic",
      slot: "肩部",
      slotDetail: "肩部",
      armorType: "板甲",
      armorDetail: "板甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Imperator Averzian",
      bossIndex: "1号",
      bossOrder: 0,
      stats: {
        primary: "力量/智力",
        secondary: ["爆击", "急速"],
        primaryDetail: [{"id": 74, "name": "力/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 4719, "value": 35}, {"id": 36, "name": "急速", "alloc": 2281, "value": 17}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🛡️",
      iconFile: "inv_shoulder_plate_raidpaladinmidnight_d_01"
    },
    {
      id: 249335,
      name: "Imperator's Banner",
      nameCn: "",
      quality: "epic",
      slot: "背部",
      slotDetail: "披风",
      armorType: "布甲",
      armorDetail: "布甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Imperator Averzian",
      bossIndex: "1号",
      bossOrder: 0,
      stats: {
        primary: "力量/敏捷/智力",
        secondary: ["爆击", "全能"],
        primaryDetail: [{"id": 71, "name": "全主属性", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 4559, "value": 34}, {"id": 40, "name": "全能", "alloc": 2441, "value": 18}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🧣",
      iconFile: "inv_plate_raiddeathknightmidnight_d_01_cape"
    },
    {
      id: 249310,
      name: "Robes of the Voidbound",
      nameCn: "",
      quality: "epic",
      slot: "胸部",
      slotDetail: "胸部",
      armorType: "锁甲",
      armorDetail: "锁甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Imperator Averzian",
      bossIndex: "1号",
      bossOrder: 0,
      stats: {
        primary: "敏捷/智力",
        secondary: ["急速", "爆击"],
        primaryDetail: [{"id": 73, "name": "敏/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 36, "name": "急速", "alloc": 4682, "value": 35}, {"id": 32, "name": "爆击", "alloc": 2318, "value": 17}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🎽",
      iconFile: "inv_robe_mail_raidshamanmidnight_d_01"
    },
    {
      id: 249320,
      name: "Sabatons of Obscurement",
      nameCn: "",
      quality: "epic",
      slot: "脚部",
      slotDetail: "脚部",
      armorType: "锁甲",
      armorDetail: "锁甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Imperator Averzian",
      bossIndex: "1号",
      bossOrder: 0,
      stats: {
        primary: "敏捷/智力",
        secondary: ["全能", "爆击"],
        primaryDetail: [{"id": 73, "name": "敏/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 40, "name": "全能", "alloc": 4756, "value": 36}, {"id": 32, "name": "爆击", "alloc": 2244, "value": 17}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "👢",
      iconFile: "inv_boot_mail_raidevokermidnight_d_01"
    },
    {
      id: 249334,
      name: "Void-Claimed Shinkickers",
      nameCn: "",
      quality: "epic",
      slot: "脚部",
      slotDetail: "脚部",
      armorType: "皮甲",
      armorDetail: "皮甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Imperator Averzian",
      bossIndex: "1号",
      bossOrder: 0,
      stats: {
        primary: "敏捷/智力",
        secondary: ["全能", "急速"],
        primaryDetail: [{"id": 73, "name": "敏/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 40, "name": "全能", "alloc": 4632, "value": 35}, {"id": 36, "name": "急速", "alloc": 2368, "value": 18}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "👢",
      iconFile: "inv_boot_leather_raiddemonhuntermidnight_d_01"
    },
    {
      id: 249319,
      name: "Endless March Waistwrap",
      nameCn: "",
      quality: "epic",
      slot: "腰部",
      slotDetail: "腰部",
      armorType: "布甲",
      armorDetail: "布甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Imperator Averzian",
      bossIndex: "1号",
      bossOrder: 0,
      stats: {
        primary: "智力",
        secondary: ["急速", "爆击"],
        primaryDetail: [{"id": 5, "name": "智力", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 36, "name": "急速", "alloc": 4982, "value": 37}, {"id": 32, "name": "爆击", "alloc": 2018, "value": 15}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🎗️",
      iconFile: "inv_belt_cloth_raidpriestmidnight_d_01"
    },
    {
      id: 249323,
      name: "Leggings of the Devouring Advance",
      nameCn: "",
      quality: "epic",
      slot: "腿部",
      slotDetail: "腿部",
      armorType: "布甲",
      armorDetail: "布甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Imperator Averzian",
      bossIndex: "1号",
      bossOrder: 0,
      stats: {
        primary: "智力",
        secondary: ["爆击", "全能"],
        primaryDetail: [{"id": 5, "name": "智力", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 4645, "value": 35}, {"id": 40, "name": "全能", "alloc": 2355, "value": 18}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "👖",
      iconFile: "inv_pant_cloth_raidmagemidnight_d_01"
    },
    {
      id: 249344,
      name: "Light Company Guidon",
      nameCn: "",
      quality: "epic",
      slot: "饰品",
      slotDetail: "饰品",
      armorType: "饰品",
      armorDetail: "饰品",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Imperator Averzian",
      bossIndex: "1号",
      bossOrder: 0,
      stats: {
        primary: "力量/敏捷",
        secondary: [],
        primaryDetail: [{"id": 72, "name": "力/敏", "alloc": 6666, "value": 50}],
        secondaryDetail: [],
        stamina: null,
        other: []
      },
      equipEffect: "主动饰品",
      onUseTrinket: true,
      icon: "🔮",
      iconFile: "inv_12_trinket_raid_voidspire_physdps1_armyoflightbanner"
    },
    {
      id: 249276,
      name: "Grimoire of the Eternal Light",
      nameCn: "",
      quality: "epic",
      slot: "副手",
      slotDetail: "副手物品",
      armorType: "副手",
      armorDetail: "副手",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Vorasius",
      bossIndex: "2号",
      bossOrder: 1,
      stats: {
        primary: "智力",
        secondary: ["爆击", "急速"],
        primaryDetail: [{"id": 5, "name": "智力", "alloc": 16132, "value": 121}],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 4785, "value": 36}, {"id": 36, "name": "急速", "alloc": 2215, "value": 17}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "📕",
      iconFile: "inv_offhand_1h_raidmidnight_d_01"
    },
    {
      id: 249317,
      name: "Frenzy's Rebuke",
      nameCn: "",
      quality: "epic",
      slot: "头部",
      slotDetail: "头部",
      armorType: "锁甲",
      armorDetail: "锁甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Vorasius",
      bossIndex: "2号",
      bossOrder: 1,
      stats: {
        primary: "敏捷/智力",
        secondary: ["爆击", "急速"],
        primaryDetail: [{"id": 73, "name": "敏/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 4828, "value": 36}, {"id": 36, "name": "急速", "alloc": 2172, "value": 16}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🪖",
      iconFile: "inv_helm_mail_raidevokermidnight_d_01"
    },
    {
      id: 249336,
      name: "Signet of the Starved Beast",
      nameCn: "",
      quality: "epic",
      slot: "戒指",
      slotDetail: "戒指",
      armorType: "戒指",
      armorDetail: "戒指",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Vorasius",
      bossIndex: "2号",
      bossOrder: 1,
      stats: {
        primary: "",
        secondary: ["爆击", "全能"],
        primaryDetail: [],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 13750, "value": 103}, {"id": 40, "name": "全能", "alloc": 3750, "value": 28}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "💍",
      iconFile: "inv_12_jewelry_devouringhost_ring_silver2"
    },
    {
      id: 249315,
      name: "Voracious Wristwraps",
      nameCn: "",
      quality: "epic",
      slot: "手腕",
      slotDetail: "手腕",
      armorType: "布甲",
      armorDetail: "布甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Vorasius",
      bossIndex: "2号",
      bossOrder: 1,
      stats: {
        primary: "智力",
        secondary: ["急速", "精通"],
        primaryDetail: [{"id": 5, "name": "智力", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 36, "name": "急速", "alloc": 4594, "value": 34}, {"id": 49, "name": "精通", "alloc": 2406, "value": 18}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "⌚",
      iconFile: "inv_bracer_cloth_raidpriestmidnight_d_01"
    },
    {
      id: 249327,
      name: "Void-Skinned Bracers",
      nameCn: "",
      quality: "epic",
      slot: "手腕",
      slotDetail: "手腕",
      armorType: "皮甲",
      armorDetail: "皮甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Vorasius",
      bossIndex: "2号",
      bossOrder: 1,
      stats: {
        primary: "敏捷/智力",
        secondary: ["爆击", "急速"],
        primaryDetail: [{"id": 73, "name": "敏/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 4686, "value": 35}, {"id": 36, "name": "急速", "alloc": 2314, "value": 17}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "⌚",
      iconFile: "inv_bracer_leather_raidroguemidnight_d_01"
    },
    {
      id: 249302,
      name: "Inescapable Reach",
      nameCn: "",
      quality: "epic",
      slot: "武器",
      slotDetail: "双手武器",
      armorType: "武器",
      armorDetail: "武器",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Vorasius",
      bossIndex: "2号",
      bossOrder: 1,
      stats: {
        primary: "敏捷",
        secondary: ["爆击", "精通"],
        primaryDetail: [{"id": 3, "name": "敏捷", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 4904, "value": 37}, {"id": 49, "name": "精通", "alloc": 2096, "value": 16}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "⚔️",
      iconFile: "inv_polearm_2h_raidmidnight_d_01"
    },
    {
      id: 249925,
      name: "Hungering Victory",
      nameCn: "",
      quality: "epic",
      slot: "武器",
      slotDetail: "单手武器",
      armorType: "武器",
      armorDetail: "双手斧",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Vorasius",
      bossIndex: "2号",
      bossOrder: 1,
      stats: {
        primary: "敏捷",
        secondary: ["精通", "全能"],
        primaryDetail: [{"id": 3, "name": "敏捷", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 49, "name": "精通", "alloc": 4844, "value": 36}, {"id": 40, "name": "全能", "alloc": 2156, "value": 16}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "⚔️",
      iconFile: "inv_knife_1h_raidmidnight_d_02"
    },
    {
      id: 249332,
      name: "Parasite Stompers",
      nameCn: "",
      quality: "epic",
      slot: "脚部",
      slotDetail: "脚部",
      armorType: "板甲",
      armorDetail: "板甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Vorasius",
      bossIndex: "2号",
      bossOrder: 1,
      stats: {
        primary: "力量/智力",
        secondary: ["精通", "急速"],
        primaryDetail: [{"id": 74, "name": "力/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 49, "name": "精通", "alloc": 4904, "value": 37}, {"id": 36, "name": "急速", "alloc": 2096, "value": 16}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "👢",
      iconFile: "inv_boot_plate_raidpaladinmidnight_d_01"
    },
    {
      id: 249342,
      name: "Heart of Ancient Hunger",
      nameCn: "",
      quality: "epic",
      slot: "饰品",
      slotDetail: "饰品",
      armorType: "饰品",
      armorDetail: "饰品",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Vorasius",
      bossIndex: "2号",
      bossOrder: 1,
      stats: {
        primary: "力量",
        secondary: [],
        primaryDetail: [{"id": 4, "name": "力量", "alloc": 6666, "value": 50}],
        secondaryDetail: [],
        stamina: null,
        other: []
      },
      equipEffect: "被动饰品",
      onUseTrinket: false,
      icon: "🔮",
      iconFile: "inv_12_trinket_raid_voidspire_strdps_hearthofancienthunger"
    },
    {
      id: 249316,
      name: "Crown of the Fractured Tyrant",
      nameCn: "",
      quality: "epic",
      slot: "头部",
      slotDetail: "头部",
      armorType: "板甲",
      armorDetail: "板甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Fallen-King Salhadaar",
      bossIndex: "3号",
      bossOrder: 2,
      stats: {
        primary: "力量/智力",
        secondary: ["全能", "急速"],
        primaryDetail: [{"id": 74, "name": "力/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 40, "name": "全能", "alloc": 4944, "value": 37}, {"id": 36, "name": "急速", "alloc": 2056, "value": 15}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🪖",
      iconFile: "inv_plate_raiddeathknightmidnight_d_01_helm"
    },
    {
      id: 249304,
      name: "Fallen King's Cuffs",
      nameCn: "",
      quality: "epic",
      slot: "手腕",
      slotDetail: "手腕",
      armorType: "锁甲",
      armorDetail: "锁甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Fallen-King Salhadaar",
      bossIndex: "3号",
      bossOrder: 2,
      stats: {
        primary: "敏捷/智力",
        secondary: ["精通", "爆击"],
        primaryDetail: [{"id": 73, "name": "敏/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 49, "name": "精通", "alloc": 4729, "value": 35}, {"id": 32, "name": "爆击", "alloc": 2271, "value": 17}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "⌚",
      iconFile: "inv_bracer_mail_raidshamanmidnight_d_01"
    },
    {
      id: 249281,
      name: "Blade of the Final Twilight",
      nameCn: "",
      quality: "epic",
      slot: "武器",
      slotDetail: "单手武器",
      armorType: "武器",
      armorDetail: "单手剑",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Fallen-King Salhadaar",
      bossIndex: "3号",
      bossOrder: 2,
      stats: {
        primary: "力量",
        secondary: ["爆击", "精通"],
        primaryDetail: [{"id": 4, "name": "力量", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 4698, "value": 35}, {"id": 49, "name": "精通", "alloc": 2302, "value": 17}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "⚔️",
      iconFile: "inv_sword_1h_raidmidnight_d_01"
    },
    {
      id: 249298,
      name: "Tormentor's Bladed Fists",
      nameCn: "",
      quality: "epic",
      slot: "武器",
      slotDetail: "单手武器",
      armorType: "武器",
      armorDetail: "武器",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Fallen-King Salhadaar",
      bossIndex: "3号",
      bossOrder: 2,
      stats: {
        primary: "敏捷",
        secondary: ["急速", "全能"],
        primaryDetail: [{"id": 3, "name": "敏捷", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 36, "name": "急速", "alloc": 4621, "value": 35}, {"id": 40, "name": "全能", "alloc": 2379, "value": 18}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "⚔️",
      iconFile: "inv_hand_1h_raidmidnight_d_01"
    },
    {
      id: 249308,
      name: "Despotic Raiment",
      nameCn: "",
      quality: "epic",
      slot: "胸部",
      slotDetail: "胸部",
      armorType: "布甲",
      armorDetail: "布甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Fallen-King Salhadaar",
      bossIndex: "3号",
      bossOrder: 2,
      stats: {
        primary: "智力",
        secondary: ["精通", "爆击"],
        primaryDetail: [{"id": 5, "name": "智力", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 49, "name": "精通", "alloc": 4891, "value": 37}, {"id": 32, "name": "爆击", "alloc": 2109, "value": 16}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🎽",
      iconFile: "inv_robe_cloth_raidpriestmidnight_d_01"
    },
    {
      id: 249314,
      name: "Twisted Twilight Sash",
      nameCn: "",
      quality: "epic",
      slot: "腰部",
      slotDetail: "腰部",
      armorType: "皮甲",
      armorDetail: "皮甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Fallen-King Salhadaar",
      bossIndex: "3号",
      bossOrder: 2,
      stats: {
        primary: "敏捷/智力",
        secondary: ["精通", "全能"],
        primaryDetail: [{"id": 73, "name": "敏/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 49, "name": "精通", "alloc": 4796, "value": 36}, {"id": 40, "name": "全能", "alloc": 2204, "value": 17}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🎗️",
      iconFile: "inv_belt_leather_raiddemonhuntermidnight_d_01"
    },
    {
      id: 249337,
      name: "Ribbon of Coiled Malice",
      nameCn: "",
      quality: "epic",
      slot: "项链",
      slotDetail: "项链",
      armorType: "项链",
      armorDetail: "项链",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Fallen-King Salhadaar",
      bossIndex: "3号",
      bossOrder: 2,
      stats: {
        primary: "",
        secondary: ["爆击", "急速"],
        primaryDetail: [],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 13000, "value": 97}, {"id": 36, "name": "急速", "alloc": 4500, "value": 34}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "📿",
      iconFile: "inv_12_jewelry_devouringhost_necklace_bronze"
    },
    {
      id: 249340,
      name: "Wraps of Cosmic Madness",
      nameCn: "",
      quality: "epic",
      slot: "饰品",
      slotDetail: "饰品",
      armorType: "饰品",
      armorDetail: "饰品",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Fallen-King Salhadaar",
      bossIndex: "3号",
      bossOrder: 2,
      stats: {
        primary: "智力",
        secondary: [],
        primaryDetail: [{"id": 5, "name": "智力", "alloc": 6666, "value": 50}],
        secondaryDetail: [],
        stamina: null,
        other: []
      },
      equipEffect: "主动饰品",
      onUseTrinket: true,
      icon: "🔮",
      iconFile: "inv_12_trinket_raid_voidspire_intdps1_wrapsofcosmicmadness"
    },
    {
      id: 249341,
      name: "Volatile Void Suffuser",
      nameCn: "",
      quality: "epic",
      slot: "饰品",
      slotDetail: "饰品",
      armorType: "饰品",
      armorDetail: "饰品",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Fallen-King Salhadaar",
      bossIndex: "3号",
      bossOrder: 2,
      stats: {
        primary: "",
        secondary: ["急速"],
        primaryDetail: [],
        secondaryDetail: [{"id": 36, "name": "急速", "alloc": 6666, "value": 50}],
        stamina: null,
        other: []
      },
      equipEffect: "被动饰品",
      onUseTrinket: false,
      icon: "🔮",
      iconFile: "inv_12_trinket_raid_voidspire_healer1_volatilevoidsuffuser"
    },
    {
      id: 249321,
      name: "Vaelgor's Fearsome Grasp",
      nameCn: "",
      quality: "epic",
      slot: "手",
      slotDetail: "手",
      armorType: "皮甲",
      armorDetail: "皮甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Vaelgor & Ezzorak",
      bossIndex: "4号",
      bossOrder: 3,
      stats: {
        primary: "敏捷/智力",
        secondary: ["爆击", "精通"],
        primaryDetail: [{"id": 73, "name": "敏/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 4892, "value": 37}, {"id": 49, "name": "精通", "alloc": 2108, "value": 16}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🧤",
      iconFile: "inv_glove_leather_raiddruidmidnight_d_01"
    },
    {
      id: 249280,
      name: "Emblazoned Sunglaive",
      nameCn: "",
      quality: "epic",
      slot: "武器",
      slotDetail: "单手武器",
      armorType: "武器",
      armorDetail: "长柄武器",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Vaelgor & Ezzorak",
      bossIndex: "4号",
      bossOrder: 3,
      stats: {
        primary: "敏/智/智力",
        secondary: ["爆击", "精通"],
        primaryDetail: [{"id": 73, "name": "敏/智", "alloc": 5259, "value": 39}, {"id": 5, "name": "智力", "alloc": 25370, "value": 190}],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 4810, "value": 36}, {"id": 49, "name": "精通", "alloc": 2190, "value": 16}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "⚔️",
      iconFile: "inv_glaive_1h_raidmidnight_d_01"
    },
    {
      id: 249287,
      name: "Clutchmates' Caress",
      nameCn: "",
      quality: "epic",
      slot: "武器",
      slotDetail: "单手武器",
      armorType: "武器",
      armorDetail: "匕首",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Vaelgor & Ezzorak",
      bossIndex: "4号",
      bossOrder: 3,
      stats: {
        primary: "敏捷",
        secondary: ["精通", "急速"],
        primaryDetail: [{"id": 3, "name": "敏捷", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 49, "name": "精通", "alloc": 4812, "value": 36}, {"id": 36, "name": "急速", "alloc": 2188, "value": 16}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "⚔️",
      iconFile: "inv_mace_1h_raidmidnight_d_01"
    },
    {
      id: 249318,
      name: "Nullwalker's Dread Epaulettes",
      nameCn: "",
      quality: "epic",
      slot: "肩部",
      slotDetail: "肩部",
      armorType: "锁甲",
      armorDetail: "锁甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Vaelgor & Ezzorak",
      bossIndex: "4号",
      bossOrder: 3,
      stats: {
        primary: "敏捷/智力",
        secondary: ["爆击", "精通"],
        primaryDetail: [{"id": 73, "name": "敏/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 4570, "value": 34}, {"id": 49, "name": "精通", "alloc": 2430, "value": 18}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🛡️",
      iconFile: "inv_shoulder_mail_raidevokermidnight_d_01"
    },
    {
      id: 249370,
      name: "Draconic Nullcape",
      nameCn: "",
      quality: "epic",
      slot: "背部",
      slotDetail: "披风",
      armorType: "布甲",
      armorDetail: "布甲",
      itemLevel: 219,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Vaelgor & Ezzorak",
      bossIndex: "4号",
      bossOrder: 3,
      stats: {
        primary: "力量/敏捷/智力",
        secondary: ["急速", "精通"],
        primaryDetail: [{"id": 71, "name": "全主属性", "alloc": 5259, "value": 48}],
        secondaryDetail: [{"id": 36, "name": "急速", "alloc": 4707, "value": 43}, {"id": 49, "name": "精通", "alloc": 2293, "value": 21}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 73},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🧣",
      iconFile: "inv_cape_plate_raidpaladinmidnight_d_01"
    },
    {
      id: 249305,
      name: "Slippers of the Midnight Flame",
      nameCn: "",
      quality: "epic",
      slot: "脚部",
      slotDetail: "脚部",
      armorType: "布甲",
      armorDetail: "布甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Vaelgor & Ezzorak",
      bossIndex: "4号",
      bossOrder: 3,
      stats: {
        primary: "智力",
        secondary: ["爆击", "急速"],
        primaryDetail: [{"id": 5, "name": "智力", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 4626, "value": 35}, {"id": 36, "name": "急速", "alloc": 2374, "value": 18}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "👢",
      iconFile: "inv_boot_cloth_raidwarlockmidnight_d_01"
    },
    {
      id: 249331,
      name: "Ezzorak's Gloombind",
      nameCn: "",
      quality: "epic",
      slot: "腰部",
      slotDetail: "腰部",
      armorType: "板甲",
      armorDetail: "板甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Vaelgor & Ezzorak",
      bossIndex: "4号",
      bossOrder: 3,
      stats: {
        primary: "力量/智力",
        secondary: ["急速", "精通"],
        primaryDetail: [{"id": 74, "name": "力/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 36, "name": "急速", "alloc": 4867, "value": 36}, {"id": 49, "name": "精通", "alloc": 2133, "value": 16}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🎗️",
      iconFile: "inv_belt_plate_raidwarriormidnight_d_01"
    },
    {
      id: 249339,
      name: "Gloom-Spattered Dreadscale",
      nameCn: "",
      quality: "epic",
      slot: "饰品",
      slotDetail: "饰品",
      armorType: "饰品",
      armorDetail: "饰品",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Vaelgor & Ezzorak",
      bossIndex: "4号",
      bossOrder: 3,
      stats: {
        primary: "",
        secondary: ["爆击"],
        primaryDetail: [],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 6666, "value": 50}],
        stamina: null,
        other: []
      },
      equipEffect: "主动饰品",
      onUseTrinket: true,
      icon: "🔮",
      iconFile: "inv_12_trinket_raid_voidspire_tank1_smolderinggloomscale"
    },
    {
      id: 249346,
      name: "Vaelgor's Final Stare",
      nameCn: "",
      quality: "epic",
      slot: "饰品",
      slotDetail: "饰品",
      armorType: "饰品",
      armorDetail: "饰品",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Vaelgor & Ezzorak",
      bossIndex: "4号",
      bossOrder: 3,
      stats: {
        primary: "智力",
        secondary: [],
        primaryDetail: [{"id": 5, "name": "智力", "alloc": 6666, "value": 50}],
        secondaryDetail: [],
        stamina: null,
        other: []
      },
      equipEffect: "主动饰品",
      onUseTrinket: true,
      icon: "🔮",
      iconFile: "inv_12_trinket_raid_voidspire_int1_voiddragoneye"
    },
    {
      id: 249369,
      name: "Bond of Light",
      nameCn: "",
      quality: "epic",
      slot: "戒指",
      slotDetail: "戒指",
      armorType: "戒指",
      armorDetail: "戒指",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Lightblinded Vanguard",
      bossIndex: "5号",
      bossOrder: 4,
      stats: {
        primary: "",
        secondary: ["精通", "急速"],
        primaryDetail: [],
        secondaryDetail: [{"id": 49, "name": "精通", "alloc": 14250, "value": 107}, {"id": 36, "name": "急速", "alloc": 3250, "value": 24}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "💍",
      iconFile: "inv_12_jewelry_silvermoonelf_ring_blue1"
    },
    {
      id: 249330,
      name: "War Chaplain's Grips",
      nameCn: "",
      quality: "epic",
      slot: "手",
      slotDetail: "手",
      armorType: "布甲",
      armorDetail: "布甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Lightblinded Vanguard",
      bossIndex: "5号",
      bossOrder: 4,
      stats: {
        primary: "智力",
        secondary: ["急速", "全能"],
        primaryDetail: [{"id": 5, "name": "智力", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 36, "name": "急速", "alloc": 4994, "value": 37}, {"id": 40, "name": "全能", "alloc": 2006, "value": 15}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🧤",
      iconFile: "inv_glove_cloth_raidwarlockmidnight_d_01"
    },
    {
      id: 249277,
      name: "Bellamy's Final Judgement",
      nameCn: "",
      quality: "epic",
      slot: "武器",
      slotDetail: "双手武器",
      armorType: "武器",
      armorDetail: "单手锤",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Lightblinded Vanguard",
      bossIndex: "5号",
      bossOrder: 4,
      stats: {
        primary: "力量",
        secondary: ["精通", "爆击"],
        primaryDetail: [{"id": 4, "name": "力量", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 49, "name": "精通", "alloc": 4929, "value": 37}, {"id": 32, "name": "爆击", "alloc": 2071, "value": 16}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "⚔️",
      iconFile: "inv_mace_2h_raidmidnight_d_01"
    },
    {
      id: 249294,
      name: "Blade of the Blind Verdict",
      nameCn: "",
      quality: "epic",
      slot: "武器",
      slotDetail: "单手武器",
      armorType: "武器",
      armorDetail: "单手剑",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Lightblinded Vanguard",
      bossIndex: "5号",
      bossOrder: 4,
      stats: {
        primary: "智力/智力",
        secondary: ["急速", "精通"],
        primaryDetail: [{"id": 5, "name": "智力", "alloc": 5259, "value": 39}, {"id": 5, "name": "智力", "alloc": 25370, "value": 190}],
        secondaryDetail: [{"id": 36, "name": "急速", "alloc": 4606, "value": 35}, {"id": 49, "name": "精通", "alloc": 2394, "value": 18}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "⚔️",
      iconFile: "inv_sword_1h_raidmidnight_d_01"
    },
    {
      id: 249333,
      name: "Blooming Barklight Spaulders",
      nameCn: "",
      quality: "epic",
      slot: "肩部",
      slotDetail: "肩部",
      armorType: "皮甲",
      armorDetail: "皮甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Lightblinded Vanguard",
      bossIndex: "5号",
      bossOrder: 4,
      stats: {
        primary: "敏捷/智力",
        secondary: ["爆击", "全能"],
        primaryDetail: [{"id": 73, "name": "敏/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 4869, "value": 36}, {"id": 40, "name": "全能", "alloc": 2131, "value": 16}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🛡️",
      iconFile: "inv_shoulder_leather_raiddruidmidnight_d_01"
    },
    {
      id: 249303,
      name: "Waistcord of the Judged",
      nameCn: "",
      quality: "epic",
      slot: "腰部",
      slotDetail: "腰部",
      armorType: "锁甲",
      armorDetail: "锁甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Lightblinded Vanguard",
      bossIndex: "5号",
      bossOrder: 4,
      stats: {
        primary: "敏捷/智力",
        secondary: ["爆击", "全能"],
        primaryDetail: [{"id": 73, "name": "敏/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 4609, "value": 35}, {"id": 40, "name": "全能", "alloc": 2391, "value": 18}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🎗️",
      iconFile: "inv_belt_mail_raidevokermidnight_d_01"
    },
    {
      id: 249311,
      name: "Lightblood Greaves",
      nameCn: "",
      quality: "epic",
      slot: "腿部",
      slotDetail: "腿部",
      armorType: "板甲",
      armorDetail: "板甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Lightblinded Vanguard",
      bossIndex: "5号",
      bossOrder: 4,
      stats: {
        primary: "力量/智力",
        secondary: ["精通", "急速"],
        primaryDetail: [{"id": 74, "name": "力/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 49, "name": "精通", "alloc": 4792, "value": 36}, {"id": 36, "name": "急速", "alloc": 2208, "value": 17}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "👖",
      iconFile: "inv_pant_plate_raidpaladinmidnight_d_01"
    },
    {
      id: 249808,
      name: "Litany of Lightblind Wrath",
      nameCn: "",
      quality: "epic",
      slot: "饰品",
      slotDetail: "饰品",
      armorType: "饰品",
      armorDetail: "饰品",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Lightblinded Vanguard",
      bossIndex: "5号",
      bossOrder: 4,
      stats: {
        primary: "智力",
        secondary: [],
        primaryDetail: [{"id": 5, "name": "智力", "alloc": 6666, "value": 50}],
        secondaryDetail: [],
        stamina: null,
        other: []
      },
      equipEffect: "主动饰品",
      onUseTrinket: true,
      icon: "🔮",
      iconFile: "inv_12_trinket_raid_voidspire_healer2_litanyoflightblindwrath"
    },
    {
      id: 249329,
      name: "Gaze of the Unrestrained",
      nameCn: "",
      quality: "epic",
      slot: "头部",
      slotDetail: "头部",
      armorType: "布甲",
      armorDetail: "布甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Crown of the Cosmos",
      bossIndex: "尾王",
      bossOrder: 5,
      stats: {
        primary: "智力",
        secondary: ["精通", "急速"],
        primaryDetail: [{"id": 5, "name": "智力", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 49, "name": "精通", "alloc": 4789, "value": 36}, {"id": 36, "name": "急速", "alloc": 2211, "value": 17}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🪖",
      iconFile: "inv_helm_cloth_raidwarlockmidnight_d_01"
    },
    {
      id: 249325,
      name: "Untethered Berserker's Grips",
      nameCn: "",
      quality: "epic",
      slot: "手",
      slotDetail: "手",
      armorType: "锁甲",
      armorDetail: "锁甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Crown of the Cosmos",
      bossIndex: "尾王",
      bossOrder: 5,
      stats: {
        primary: "敏捷/智力",
        secondary: ["精通", "爆击"],
        primaryDetail: [{"id": 73, "name": "敏/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 49, "name": "精通", "alloc": 4758, "value": 36}, {"id": 32, "name": "爆击", "alloc": 2242, "value": 17}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🧤",
      iconFile: "inv_glove_mail_raidhuntermidnight_d_01"
    },
    {
      id: 249288,
      name: "Ranger-Captain's Lethal Recurve",
      nameCn: "",
      quality: "epic",
      slot: "武器",
      slotDetail: "远程",
      armorType: "武器",
      armorDetail: "枪",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Crown of the Cosmos",
      bossIndex: "尾王",
      bossOrder: 5,
      stats: {
        primary: "敏捷",
        secondary: ["爆击", "急速"],
        primaryDetail: [{"id": 3, "name": "敏捷", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 4945, "value": 37}, {"id": 36, "name": "急速", "alloc": 2055, "value": 15}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "⚔️",
      iconFile: "inv_bow_1h_raidmidnight_d_01"
    },
    {
      id: 249295,
      name: "Turalyon's False Echo",
      nameCn: "",
      quality: "epic",
      slot: "武器",
      slotDetail: "单手武器",
      armorType: "武器",
      armorDetail: "匕首",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Crown of the Cosmos",
      bossIndex: "尾王",
      bossOrder: 5,
      stats: {
        primary: "力量",
        secondary: ["急速", "爆击"],
        primaryDetail: [{"id": 4, "name": "力量", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 36, "name": "急速", "alloc": 4977, "value": 37}, {"id": 32, "name": "爆击", "alloc": 2023, "value": 15}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "⚔️",
      iconFile: "inv_mace_1h_raidmidnight_d_01"
    },
    {
      id: 260423,
      name: "Arator's Swift Remembrance",
      nameCn: "",
      quality: "epic",
      slot: "武器",
      slotDetail: "单手武器",
      armorType: "武器",
      armorDetail: "单手剑",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Crown of the Cosmos",
      bossIndex: "尾王",
      bossOrder: 5,
      stats: {
        primary: "敏捷",
        secondary: ["爆击", "急速"],
        primaryDetail: [{"id": 3, "name": "敏捷", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 32, "name": "爆击", "alloc": 4900, "value": 37}, {"id": 36, "name": "急速", "alloc": 2100, "value": 16}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "⚔️",
      iconFile: "inv_sword_1h_raidmidnight_d_01"
    },
    {
      id: 249309,
      name: "Sunbound Breastplate",
      nameCn: "",
      quality: "epic",
      slot: "胸部",
      slotDetail: "胸部",
      armorType: "板甲",
      armorDetail: "板甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Crown of the Cosmos",
      bossIndex: "尾王",
      bossOrder: 5,
      stats: {
        primary: "力量/智力",
        secondary: ["急速", "爆击"],
        primaryDetail: [{"id": 74, "name": "力/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 36, "name": "急速", "alloc": 4601, "value": 34}, {"id": 32, "name": "爆击", "alloc": 2399, "value": 18}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🎽",
      iconFile: "inv_chest_plate_raidpaladinmidnight_d_01"
    },
    {
      id: 249382,
      name: "Canopy Walker's Footwraps",
      nameCn: "",
      quality: "epic",
      slot: "脚部",
      slotDetail: "脚部",
      armorType: "皮甲",
      armorDetail: "皮甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Crown of the Cosmos",
      bossIndex: "尾王",
      bossOrder: 5,
      stats: {
        primary: "敏捷/智力",
        secondary: ["精通", "爆击"],
        primaryDetail: [{"id": 73, "name": "敏/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 49, "name": "精通", "alloc": 4586, "value": 34}, {"id": 32, "name": "爆击", "alloc": 2414, "value": 18}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "👢",
      iconFile: "inv_boot_leather_raiddruidmidnight_d_01"
    },
    {
      id: 249380,
      name: "Hate-Tied Waistchain",
      nameCn: "",
      quality: "epic",
      slot: "腰部",
      slotDetail: "腰部",
      armorType: "板甲",
      armorDetail: "板甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Crown of the Cosmos",
      bossIndex: "尾王",
      bossOrder: 5,
      stats: {
        primary: "力量/智力",
        secondary: ["精通", "爆击"],
        primaryDetail: [{"id": 74, "name": "力/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 49, "name": "精通", "alloc": 4913, "value": 37}, {"id": 32, "name": "爆击", "alloc": 2087, "value": 16}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "🎗️",
      iconFile: "inv_plate_raiddeathknightmidnight_d_01_belt"
    },
    {
      id: 249312,
      name: "Nightblade's Pantaloons",
      nameCn: "",
      quality: "epic",
      slot: "腿部",
      slotDetail: "腿部",
      armorType: "皮甲",
      armorDetail: "皮甲",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Crown of the Cosmos",
      bossIndex: "尾王",
      bossOrder: 5,
      stats: {
        primary: "敏捷/智力",
        secondary: ["急速", "精通"],
        primaryDetail: [{"id": 73, "name": "敏/智", "alloc": 5259, "value": 39}],
        secondaryDetail: [{"id": 36, "name": "急速", "alloc": 4573, "value": 34}, {"id": 49, "name": "精通", "alloc": 2427, "value": 18}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "👖",
      iconFile: "inv_pant_leather_raidroguemidnight_d_01"
    },
    {
      id: 249368,
      name: "Eternal Voidsong Chain",
      nameCn: "",
      quality: "epic",
      slot: "项链",
      slotDetail: "项链",
      armorType: "项链",
      armorDetail: "项链",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Crown of the Cosmos",
      bossIndex: "尾王",
      bossOrder: 5,
      stats: {
        primary: "",
        secondary: ["急速", "精通"],
        primaryDetail: [],
        secondaryDetail: [{"id": 36, "name": "急速", "alloc": 14700, "value": 110}, {"id": 49, "name": "精通", "alloc": 2800, "value": 21}],
        stamina: {"id": 7, "name": "耐力", "alloc": 7889, "value": 59},
        other: []
      },
      equipEffect: "",
      onUseTrinket: false,
      icon: "📿",
      iconFile: "inv_12_jewelry_silvermoonelf_necklace_blue1"
    },
    {
      id: 249345,
      name: "Ranger-Captain's Iridescent Insignia",
      nameCn: "",
      quality: "epic",
      slot: "饰品",
      slotDetail: "饰品",
      armorType: "饰品",
      armorDetail: "饰品",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Crown of the Cosmos",
      bossIndex: "尾王",
      bossOrder: 5,
      stats: {
        primary: "敏捷",
        secondary: [],
        primaryDetail: [{"id": 3, "name": "敏捷", "alloc": 6666, "value": 50}],
        secondaryDetail: [],
        stamina: null,
        other: []
      },
      equipEffect: "主动饰品",
      onUseTrinket: true,
      icon: "🔮",
      iconFile: "inv_12_trinket_raid_voidspire_agidps_rangercaptainsinsignia"
    },
    {
      id: 249809,
      name: "Locus-Walker's Ribbon",
      nameCn: "",
      quality: "epic",
      slot: "饰品",
      slotDetail: "饰品",
      armorType: "饰品",
      armorDetail: "饰品",
      itemLevel: 197,
      raid: "voidspire",
      raidName: "虚影尖塔",
      boss: "Crown of the Cosmos",
      bossIndex: "尾王",
      bossOrder: 5,
      stats: {
        primary: "",
        secondary: ["精通"],
        primaryDetail: [],
        secondaryDetail: [{"id": 49, "name": "精通", "alloc": 6666, "value": 50}],
        stamina: null,
        other: []
      },
      equipEffect: "被动饰品",
      onUseTrinket: false,
      icon: "🔮",
      iconFile: "inv_12_trinket_raid_voidspire_int2_locuswalkerslastribbon"
    }
  ];

// 装备选择状态
let selectedDbItem = null;
let itemDbCallback = null;

// 打开装备库选择器
let itemDbPickerMode = 'wishlist';
function openItemDbPicker(mode = 'wishlist') {
  itemDbPickerMode = mode;
  selectedDbItem = null;
  document.getElementById('itemDbSearch').value = '';
  document.getElementById('itemDbRaidFilter').value = '';
  document.getElementById('itemDbBossFilter').value = '';
  document.getElementById('itemDbBossFilter').disabled = true;
  document.getElementById('itemDbSlotFilter').value = '';
  document.getElementById('itemDbArmorFilter').value = '';
  document.getElementById('itemDbStatFilter').value = '';
  document.getElementById('itemDbConfirmBtn').disabled = true;
  renderItemDbList();
  openModal('itemDbModal');
}

// 渲染装备列表
// 主属性颜色映射
const primaryStatColorMap = {
  '力量': 'stat-str',
  '敏捷': 'stat-agi',
  '智力': 'stat-int'
};

// 副属性颜色映射
const secondaryStatColorMap = {
  '爆击': 'stat-crit',
  '暴击': 'stat-crit',
  '急速': 'stat-haste',
  '精通': 'stat-mastery',
  '全能': 'stat-versatility'
};

// 团本→BOSS映射（用于首领掉落筛选联动，顺序与游戏内一致）
const itemDbRaidBossMap = {
  voidspire: [
    { value: 'Imperator Averzian', label: '1号 Imperator Averzian' },
    { value: 'Vorasius', label: '2号 Vorasius' },
    { value: 'Fallen-King Salhadaar', label: '3号 Fallen-King Salhadaar' },
    { value: 'Vaelgor & Ezzorak', label: '4号 Vaelgor & Ezzorak' },
    { value: 'Lightblinded Vanguard', label: '5号 Lightblinded Vanguard' },
    { value: 'Crown of the Cosmos', label: '尾王 Crown of the Cosmos' }
  ],
  dreamrift: [
    { value: 'Chimaerus the Undreamt God', label: '尾王 Chimaerus the Undreamt God' }
  ],
  queldanas: [
    { value: 'Belo\'ren, Child of Al\'ar', label: '1号 Belo\'ren, Child of Al\'ar' },
    { value: 'Midnight Falls', label: '尾王 Midnight Falls' }
  ],
  mire: [
    { value: 'Rotmire', label: '尾王 Rotmire' }
  ]
};

// 更新首领掉落下拉选项
function updateItemDbBossFilter() {
  const raidVal = document.getElementById('itemDbRaidFilter').value;
  const bossSelect = document.getElementById('itemDbBossFilter');
  bossSelect.innerHTML = '<option value="">全部首领</option>';
  
  if (!raidVal || !itemDbRaidBossMap[raidVal]) {
    bossSelect.disabled = true;
    return;
  }
  
  bossSelect.disabled = false;
  itemDbRaidBossMap[raidVal].forEach(boss => {
    const opt = document.createElement('option');
    opt.value = boss.value;
    opt.textContent = boss.label;
    bossSelect.appendChild(opt);
  });
}

// 渲染彩色主属性（带数值）
function renderPrimaryStat(primary, detail) {
  if (!primary) return '<span style="color:var(--text-muted)">无</span>';
  let value = '';
  if (detail && detail.length > 0 && detail[0].value) {
    value = ` <span style="color:#fff;font-weight:600">+${detail[0].value}</span>`;
  }
  const parts = primary.split('/');
  const nameHtml = parts.map(p => {
    const cls = primaryStatColorMap[p] || '';
    return cls ? `<span class="${cls}">${p}</span>` : `<span style="color:#fff;font-weight:500">${p}</span>`;
  }).join('<span style="color:var(--text-muted)">/</span>');
  return nameHtml + value;
}

// 渲染彩色副属性（带数值）
function renderSecondaryStats(secondary, detail) {
  if (!secondary || secondary.length === 0) return '<span style="color:var(--text-muted)">无副属性</span>';
  return secondary.map((s, i) => {
    const cls = secondaryStatColorMap[s] || '';
    let val = '';
    if (detail && detail[i] && detail[i].value) {
      val = ` <span style="color:#fff;font-weight:600">+${detail[i].value}</span>`;
    }
    const name = cls ? `<span class="${cls}">${s}</span>` : `<span>${s}</span>`;
    return name + val;
  }).join('<span style="color:var(--text-muted)">、</span>');
}

function renderItemDbList() {
  const search = document.getElementById('itemDbSearch').value.toLowerCase();
  const raidFilter = document.getElementById('itemDbRaidFilter').value;
  const bossFilter = document.getElementById('itemDbBossFilter').value;
  const slotFilter = document.getElementById('itemDbSlotFilter').value;
  const armorFilter = document.getElementById('itemDbArmorFilter').value;
  const statFilter = document.getElementById('itemDbStatFilter').value;
  
  let filtered = itemDatabase.filter(item => {
    if (search && !item.name.toLowerCase().includes(search) && !item.boss.toLowerCase().includes(search)) return false;
    if (raidFilter && item.raid !== raidFilter) return false;
    if (bossFilter && item.boss !== bossFilter) return false;
    if (slotFilter && item.slot !== slotFilter) return false;
    if (armorFilter && item.armorType !== armorFilter) return false;
    if (statFilter && !item.stats.secondary.includes(statFilter)) return false;
    return true;
  });
  
  document.getElementById('itemDbCount').textContent = `共 ${filtered.length} 件装备`;
  
  const listEl = document.getElementById('itemDbList');
  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="item-db-empty">没有找到匹配的装备</div>';
    return;
  }
  
  listEl.innerHTML = filtered.map(item => {
    const isSelected = selectedDbItem && selectedDbItem.id === item.id;
    const qualityClass = item.quality === 'epic' ? 'quality-epic' : 'quality-rare';
    const primaryStatHtml = renderPrimaryStat(item.stats.primary, item.stats.primaryDetail);
    const secondaryStatHtml = renderSecondaryStats(item.stats.secondary, item.stats.secondaryDetail);
    const sourceText = `${item.raidName} · ${item.bossIndex} ${item.boss}`;
    
    return `
      <div class="item-card ${isSelected ? 'selected' : ''}" onclick="selectDbItem(${item.id})">
        <div class="item-card-icon">${item.icon}</div>
        <div class="item-card-info">
          <div class="item-card-name ${qualityClass}">${item.name}</div>
          <div class="item-card-meta">${item.armorType} · ${item.slot} · 装等${item.itemLevel}</div>
          <div class="item-card-stats">
            <div><span class="stat-label">主属性：</span>${primaryStatHtml}</div>
            <div><span class="stat-label">副属性：</span>${secondaryStatHtml}</div>
            ${item.equipEffect ? `<div style="color:var(--gold);margin-top:4px;">装备：${item.equipEffect.substring(0, 80)}${item.equipEffect.length > 80 ? '...' : ''}</div>` : ''}
          </div>
        </div>
        <div class="item-card-source">${sourceText}</div>
      </div>
    `;
  }).join('');
}

// 选择装备
function selectDbItem(itemId) {
  selectedDbItem = itemDatabase.find(i => i.id === itemId);
  document.getElementById('itemDbConfirmBtn').disabled = false;
  renderItemDbList();
}

// 确认选择
function confirmItemDbSelection() {
  if (!selectedDbItem) return;
  
  if (itemDbPickerMode === 'loot') {
    // 填充到装备分配表单
    lootFillFromItemDb(selectedDbItem);
  } else {
    // 填充到心愿单表单
    wishlistFillFromItemDb(selectedDbItem);
  }
  
  closeModal('itemDbModal');
}

// 装备分配-从装备库填充
function lootFillFromItemDb(item) {
  document.getElementById('lootName').value = item.name;
  
  // 团本和BOSS
  const raidNameMap = { 'voidspire': '虚影尖塔', 'dreamrift': '梦境裂隙', 'queldanas': '进军奎尔丹纳斯', 'mire': '孢陨幽境' };
  const raidName = raidNameMap[item.raid] || item.raidName || item.raid;
  const raidSelect = document.getElementById('lootRaid');
  if (raidSelect) {
    raidSelect.value = raidName;
    if (typeof lootOnRaidChange === 'function') {
      lootOnRaidChange();
      setTimeout(() => {
        const bossSelect = document.getElementById('lootBoss');
        if (bossSelect && bossSelect.style.display !== 'none') {
          for (let i = 0; i < bossSelect.options.length; i++) {
            if (bossSelect.options[i].text.includes(item.boss)) {
              bossSelect.selectedIndex = i;
              break;
            }
          }
        }
      }, 50);
    }
  }
  
  // 装备大类和部位映射
  const categoryMap = {
    '武器': '武器',
    '布甲': '防具', '皮甲': '防具', '锁甲': '防具', '板甲': '防具', '披风': '防具',
    '饰品': '饰品',
    '项链': '首饰', '戒指': '首饰',
    '副手': '武器'
  };
  // slot名称映射（装备库叫法 → 部位下拉叫法）
  const slotNameMap = {
    '项链': '颈部',
    '戒指': '手指',
    '副手': '副手物品',
    '披风': '背部'
  };
  const category = categoryMap[item.armorType] || '防具';
  const targetSlot = slotNameMap[item.slot] || item.slot;
  const categorySelect = document.getElementById('lootCategory');
  if (categorySelect) {
    categorySelect.value = category;
    if (typeof lootOnCategoryChange === 'function') {
      lootOnCategoryChange();
      setTimeout(() => {
        const slotSelect = document.getElementById('lootSlot');
        if (slotSelect) {
          for (let i = 0; i < slotSelect.options.length; i++) {
            if (slotSelect.options[i].text.includes(targetSlot)) {
              slotSelect.selectedIndex = i;
              break;
            }
          }
        }
      }, 50);
    }
  }
  
  // 主属性（取第一个）
  const primaryStat = item.stats.primary ? item.stats.primary.split('/')[0] : '';
  const primarySelect = document.getElementById('lootPrimaryStat');
  if (primarySelect && primaryStat) {
    primarySelect.value = primaryStat;
  }
  
  // 副属性
  if (typeof lootSelectedSecondaryStats !== 'undefined') {
    lootSelectedSecondaryStats = [];
    (item.stats.secondary || []).forEach(stat => {
      // 统一用词：爆击→暴击
      const normalizedStat = stat === '爆击' ? '暴击' : stat;
      if (['暴击', '急速', '精通', '全能'].includes(normalizedStat)) {
        lootSelectedSecondaryStats.push(normalizedStat);
      }
    });
    document.querySelectorAll('#lootSecondaryStats .secondary-stat-tag').forEach(tag => {
      tag.classList.toggle('active', lootSelectedSecondaryStats.includes(tag.dataset.stat));
    });
  }
  
  // 特殊效果
  document.getElementById('lootSpecialEffect').value = item.equipEffect || '';
  
  // 更新心愿单匹配
  if (typeof lootUpdateWishlistMatches === 'function') {
    lootUpdateWishlistMatches();
  }
}

// 心愿单-从装备库填充
function wishlistFillFromItemDb(selectedDbItem) {
  // 填充到心愿单表单
  document.getElementById('wishlistItemName').value = selectedDbItem.name;
  
  // 团本名称映射（装备库英文标识 → 下拉中文名）
  const raidNameMap = { 'voidspire': '虚影尖塔', 'dreamrift': '梦境裂隙', 'queldanas': '进军奎尔丹纳斯', 'mire': '孢陨幽境' };
  const raidName = raidNameMap[selectedDbItem.raid] || selectedDbItem.raidName || selectedDbItem.raid;
  
  // 设置团本和BOSS
  const raidSelect = document.getElementById('wishlistRaid');
  if (raidSelect) {
    raidSelect.value = raidName;
    if (typeof wishlistOnRaidChange === 'function') {
      wishlistOnRaidChange();
      // 等BOSS选项加载后选中
      setTimeout(() => {
        const bossSelect = document.getElementById('wishlistBoss');
        if (bossSelect && bossSelect.style.display !== 'none') {
          // 尝试匹配BOSS名称
          for (let i = 0; i < bossSelect.options.length; i++) {
            if (bossSelect.options[i].text.includes(selectedDbItem.boss)) {
              bossSelect.selectedIndex = i;
              break;
            }
          }
        }
      }, 50);
    }
  }
  
  // 设置部位和类型
  const categoryMap = {
    '武器': '武器',
    '布甲': '防具', '皮甲': '防具', '锁甲': '防具', '板甲': '防具', '披风': '防具',
    '饰品': '饰品',
    '项链': '首饰', '戒指': '首饰',
    '副手': '武器'
  };
  // slot名称映射（装备库叫法 → 部位下拉叫法）
  const slotNameMap = {
    '项链': '颈部',
    '戒指': '手指',
    '副手': '副手物品',
    '披风': '背部'
  };
  const category = categoryMap[selectedDbItem.armorType] || '防具';
  const targetSlot = slotNameMap[selectedDbItem.slot] || selectedDbItem.slot;
  const categorySelect = document.getElementById('wishlistCategory');
  if (categorySelect) {
    categorySelect.value = category;
    if (typeof wishlistOnCategoryChange === 'function') {
      wishlistOnCategoryChange();
      setTimeout(() => {
        const slotSelect = document.getElementById('wishlistSlot');
        if (slotSelect) {
          for (let i = 0; i < slotSelect.options.length; i++) {
            if (slotSelect.options[i].text.includes(targetSlot)) {
              slotSelect.selectedIndex = i;
              break;
            }
          }
        }
      }, 50);
    }
  }
}
