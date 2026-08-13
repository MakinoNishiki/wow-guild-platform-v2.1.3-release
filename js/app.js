// ==================== 数据管理 ====================
const STORAGE_KEY = 'wow_raid_attendance_data';

// DEC-004：版本号单一事实源（发布时只改这一处），侧边栏左下角显示
const APP_VERSION = 'v3.2.0';

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
// REQ-011：考勤默认列表视图，日历为用户自选；记住用户上次选择
// BUG-023：视图偏好按「账号+公会」记忆。根因：旧 key 'wow_raid_attendance_view' 无用户/公会维度，
// 同浏览器所有账号、所有公会共用一份，切换后互相覆盖。
// 本文件顶部执行时还没有用户/公会上下文，故用时惰性计算 key；切公会后渲染链路自然读到新 key，无需额外钩子。
// 旧 key 不迁移，自然废弃。
function getAttendanceViewStorageKey() {
  const user = window.CloudSync && window.CloudSync.getCachedUser && window.CloudSync.getCachedUser();
  const guild = window.CloudSync && window.CloudSync.getCurrentGuild && window.CloudSync.getCurrentGuild();
  return `attendanceView:${(user && user.id) || 'anonymous'}:${(guild && guild.id) || 'noguild'}`;
}
function getAttendanceView() {
  return localStorage.getItem(getAttendanceViewStorageKey()) === 'calendar' ? 'calendar' : 'list';
}

// 职业映射
const classMap = {
  '战士': 'warrior', '法师': 'mage', '牧师': 'priest', '盗贼': 'rogue',
  '猎人': 'hunter', '圣骑士': 'paladin', '萨满': 'shaman', '德鲁伊': 'druid',
  '术士': 'warlock', '武僧': 'monk', '恶魔猎手': 'dh', '死亡骑士': 'dk',
  '唤魔师': 'evoker'
};

// REQ-023：英文类名（游戏宏输出）→ 中文职业映射
const wowClassEnToCn = {
  'WARRIOR': '战士', 'PALADIN': '圣骑士', 'HUNTER': '猎人', 'ROGUE': '盗贼',
  'PRIEST': '牧师', 'DEATHKNIGHT': '死亡骑士', 'SHAMAN': '萨满', 'MAGE': '法师',
  'WARLOCK': '术士', 'MONK': '武僧', 'DRUID': '德鲁伊', 'DEMONHUNTER': '恶魔猎手',
  'EVOKER': '唤魔师'
};

// REQ-023：解析单行名单为 {name, cls, server}，无法识别返回 null。
// 支持：宏输出（名字-服务器,英文类名）、名字,职业、名字-职业、名字 职业、纯名字（cls 为空）
// REQ-095（任务书 #45）：宏格式与「名字-服务器」形态拆出 server（此前宏格式丢弃、无职业形态整行并入 name）
function parseMemberRosterLine(line) {
  const raw = (line || '').trim();
  if (!raw) return null;
  // 任务书 #9：剥离聊天复制带来的时间戳前缀（[12:34] / [12:34:56] / 12:34 / 12:34:56，前后可带空格）
  const text = raw.replace(/^\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*/, '').trim();
  if (!text) return null;
  const isCnClass = s => Object.prototype.hasOwnProperty.call(classMap, s);
  const isEnClass = s => Object.prototype.hasOwnProperty.call(wowClassEnToCn, (s || '').toUpperCase());

  // ① 逗号格式：末段是职业（英文类名或中文职业）
  if (text.indexOf(',') !== -1 || text.indexOf('，') !== -1) {
    const parts = text.split(/[,，]/).map(p => p.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    const last = parts[parts.length - 1];
    let name = parts.slice(0, -1).join(',');
    if (isEnClass(last)) {
      // 宏格式：名字-服务器，拆出 server（REQ-095，不再丢弃）
      let server = '';
      if (name.indexOf('-') !== -1) {
        const sIdx = name.lastIndexOf('-');
        server = name.slice(sIdx + 1).trim();
        name = name.slice(0, sIdx).trim();
      }
      return name ? { name, cls: wowClassEnToCn[last.toUpperCase()], server } : null;
    }
    if (isCnClass(last)) return name ? { name, cls: last } : null;
    return null;
  }

  // ② 无逗号含 '-' 且末段是中文职业：名字-职业
  if (text.indexOf('-') !== -1) {
    const idx = text.lastIndexOf('-');
    const tail = text.slice(idx + 1).trim();
    if (isCnClass(tail)) {
      const name = text.slice(0, idx).trim();
      return name ? { name, cls: tail } : null;
    }
    // ③ '-' 后非职业（如 名字-服务器）：拆出 name+server（REQ-095，不再整行并入 name）；
    // 名字段为空（如 "-白银之手"）则整行按纯名字保留，预览页人工修正
    const nm = text.slice(0, idx).trim();
    return nm ? { name: nm, cls: '', server: tail } : { name: text, cls: '' };
  }

  // ④ 空白分隔（含全角空格）：尾段是中文职业 → 名字 职业
  const m = text.match(/^(.+?)[\s　]+([^\s　]+)$/);
  if (m && isCnClass(m[2])) return { name: m[1].trim(), cls: m[2] };

  // ⑤ 纯名字
  return { name: text, cls: '' };
}

// BUG-037（任务书 #12 补丁4）：兼容历史英文状态 'inactive'
function isDepartedStatus(s) { return s === '离队' || s === 'inactive'; }

// REQ-095（任务书 #45）：同名匹配统一口径（导入查重/WCL 对照/撞离队查找共用，替代旧
// isDupMemberName(WithServer)/findDepartedByName(WithServer) 的"名字-服务器"前缀形态匹配）。
// 候选集合先按 name 精确过滤：恰好 1 个候选 → 视为匹配（宽松，兼容存量成员 server 全空 +
// WCL/导入带服务器的常态）；≥2 个同名候选 → 必须 (name, server) 精确相等才匹配，否则不匹配
// （走未匹配/添加为成员流）。名字与 server 均先 trim 再比对（与 DB 唯一键 COALESCE(server,'') 口径对齐）。
function matchMemberByNameServer(members, name, server) {
  const n = (name || '').trim();
  const s = (server || '').trim();
  if (!n) return null;
  const sameName = (members || []).filter(m => (m.name || '').trim() === n);
  if (sameName.length === 1) return sameName[0];
  if (sameName.length > 1) return sameName.find(m => (m.server || '').trim() === s) || null;
  return null;
}

// REQ-002（软删除）：撞「已离队」成员查找——与 matchMemberByNameServer 同口径（候选=离队成员）。
// 撞活跃成员判重；撞离队成员不判重、走恢复链路（恢复优先于新建）。
function findDepartedByNameServer(name, server) {
  return matchMemberByNameServer(appData.members.filter(m => isDepartedStatus(m.status)), name, server);
}

// REQ-095（任务书 #45）：同名消歧显示——活跃成员中存在同名（同名键 = name 相同，不限 server）
// 的其他成员时返回「名字（服务器）」；server 空或无同名并存时返回裸名。纯展示层纯函数，不改数据。
function memberDisplayName(m) {
  if (!m) return '';
  const name = m.name || '';
  const server = (m.server || '').trim();
  if (!server) return name;
  const hasNameClash = (appData.members || []).some(x =>
    x.id !== m.id && !isDepartedStatus(x.status) && (x.name || '') === name);
  return hasNameClash ? `${name}（${server}）` : name;
}

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

// 任务书 #13 §6：职业/职责本地 SVG 图标（assets/icons，单色职业色，16 枚）。
// 图标+文字并用，不替换文字；加载失败（如图标缺失）自动隐藏不影响布局。
function classIconHtml(cnClass) {
  // 任务书 #22 WP2：优先官方 PNG（js/iconMap.js 集中映射），映射缺失回退旧 SVG；加载失败隐藏图标保留文字（不裂图）
  const png = window.IconMap && window.IconMap.classIcon(cnClass);
  const key = classMap[cnClass];
  const src = png || (key ? `assets/icons/${key}.svg` : '');
  if (!src) return '';
  return `<img class="class-icon" src="${src}" alt="" onerror="this.style.display='none'">`;
}
function roleIconHtml(cnRole) {
  const png = window.IconMap && window.IconMap.roleIcon(cnRole);
  const key = roleTypeMap[cnRole];
  const src = png || (key ? `assets/icons/${key}.svg` : '');
  if (!src) return '';
  return `<img class="class-icon" src="${src}" alt="" onerror="this.style.display='none'">`;
}
// 任务书 #22 WP2：专精图标（无图返回空串，文字常驻即回退；不出现裂图）
function specIconHtml(cnClass, cnSpec) {
  const src = window.IconMap && window.IconMap.specIcon(cnClass, cnSpec);
  if (!src) return '';
  return `<img class="class-icon" src="${src}" alt="" onerror="this.style.display='none'">`;
}
// 任务书 #22 WP2：职业徽标换装——图标+文字+职业色点缀（底色/描边，非整片色块）；
// IconMap 未加载时回退旧 class-bg 色块徽标
// 任务书 #22-补丁：wowChipHtml 上升为全站统一职业色 tag 渲染组件
// （成员管理职业列/专精列、心愿单、装备分配共用，禁止各写一份；色值一律取 IconMap 官方色）
function wowChipHtml(color, iconHtml, text, extraClass) {
  if (!color) return `<span>${text}</span>`;
  return `<span class="wow-class-chip${extraClass ? ' ' + extraClass : ''}" style="--cc:${color}">${iconHtml || ''}${text}</span>`;
}
function classChipHtml(cnClass) {
  const cls = classMap[cnClass] || '';
  const cc = window.IconMap && window.IconMap.classColor(cnClass);
  if (cc && window.IconMap.classIcon(cnClass)) {
    return wowChipHtml(cc, classIconHtml(cnClass), cnClass);
  }
  return `<span class="badge class-bg-${cls}" style="color:var(--${cls === 'priest' ? 'text-primary' : cls})">${classIconHtml(cnClass)}${cnClass}</span>`;
}
// 任务书 #22-补丁 修正项④：专精职业色 tag（tag 底色/描边取职业官方色 + 专精图标 + 专精文字，与职业列视觉同源）
function specChipHtml(cnClass, cnSpec, extraClass) {
  const cc = window.IconMap && window.IconMap.classColor(cnClass);
  return wowChipHtml(cc, specIconHtml(cnClass, cnSpec), cnSpec, extraClass);
}
// 任务书 #22-补丁 修正项②③：成员职业色 tag（tag 内仅职业图标+成员名；
// 「未认领/认领人」小字不进 tag，由调用方在 tag 外拼接）
function memberChipHtml(member, fallbackName) {
  if (!member) return `<span>${fallbackName || '-'}</span>`;
  const cc = window.IconMap && window.IconMap.classColor(member.class);
  // REQ-095：tag 内名字走同名消歧显示（同名并存时「名字（服务器）」）
  return wowChipHtml(cc, classIconHtml(member.class), memberDisplayName(member));
}

// REQ-009：专精 → 职责推导表（未列出的专精一律视为输出）
const specRoleMap = {
  '防护': '坦克', '鲜血': '坦克', '复仇': '坦克', '酒仙': '坦克', '守护': '坦克',
  '神圣': '治疗', '戒律': '治疗', '恢复': '治疗', '织雾': '治疗', '恩护': '治疗'
};

// REQ-009：按主专精+副专精推导成员全部职责（主专精优先，去重，保持首次出现顺序）
function deriveMemberRoles(m) {
  const specs = [m.main_spec || m.spec || ''].concat(m.off_specs || (m.off_spec ? [m.off_spec] : []));
  const roles = [];
  specs.forEach(s => {
    if (!s || s === '待补充') return; // REQ-023：导入占位专精不参与职责推导
    const role = specRoleMap[s] || '输出';
    if (!roles.includes(role)) roles.push(role);
  });
  return roles;
}

// 团本-BOSS映射
const raidBossMap = {
  '虚影尖塔': ['元首阿福扎恩', '弗拉希乌斯', '陨落之王萨哈达尔', '威厄高尔和艾佐拉克', '光盲先锋', '宇宙之冕'],
  '梦境裂隙': ['奇美鲁斯（未梦之神）'],
  '进军奎尔丹纳斯': ['贝洛朗（奥的子嗣）', '至暗之夜降临'],
  '孢陨幽境': ['腐沼']
};

// REQ-029：团本名称候选清单（activityRaidName 的 datalist 建议，仍可手输兜底）。
// 主数据层 V2.2 上线后切换为数据库驱动（REQ-003/004）
const RAID_NAME_OPTIONS = ['尼鲁巴尔王宫', ...Object.keys(raidBossMap)];

// ==================== 任务书 #14：游戏字典统一访问层 ====================
// 主数据（MasterData）已加载 → 读数据库；未加载/快照模式 → 回退上方常量（快照=常量固化）。
function getGameRaidNames() {
  if (window.MasterData && MasterData.isLoaded()) {
    const names = MasterData.getRaids().map(r => r.name);
    if (names.length) return names;
  }
  return RAID_NAME_OPTIONS;
}
function getGameBossNames(raidName) {
  if (window.MasterData && MasterData.isLoaded()) {
    const raid = MasterData.getRaidByName(raidName);
    return raid ? MasterData.getBosses(raid.id).map(b => b.name) : [];
  }
  return raidBossMap[raidName] || [];
}
function getGameSpecs(cls) {
  if (window.MasterData && MasterData.isLoaded()) {
    const specs = MasterData.getSpecsByClassName(cls).map(s => s.name_zh);
    if (specs.length) return specs;
  }
  return classSpecMap[cls] || [];
}
// 巢穴类型查询（任务书 #14 第七节：lair 15-25 弹性标识）
function getGameRaidType(raidName) {
  if (window.MasterData && MasterData.isLoaded()) {
    const raid = MasterData.getRaidByName(raidName);
    return raid ? raid.type : null;
  }
  return null;
}
// REQ-018（V2.2 覆盖）：当前赛季起点统一读 game_seasons.is_current，禁止再读代码常量
function getGameCurrentSeasonStart() {
  if (window.MasterData && MasterData.isLoaded()) {
    const cur = MasterData.getCurrentSeason();
    if (cur && cur.start_date) return cur.start_date;
  }
  return null;
}

// REQ-029：「最近使用」团本，按公会记忆最近 3 个
function getRecentRaidNamesKey() {
  const guild = window.CloudSync && window.CloudSync.getCurrentGuild && window.CloudSync.getCurrentGuild();
  return `recentRaidNames:${(guild && guild.id) || 'local'}`;
}
function getRecentRaidNames() {
  try { return JSON.parse(localStorage.getItem(getRecentRaidNamesKey())) || []; } catch { return []; }
}
// 保存活动成功后调用：置顶去重，最多保留 3 个
function rememberRecentRaidName(name) {
  if (!name) return;
  const list = [name, ...getRecentRaidNames().filter(n => n !== name)].slice(0, 3);
  localStorage.setItem(getRecentRaidNamesKey(), JSON.stringify(list));
}
// BUG-027（任务书 #13）：团本自定义下拉组件（替代原生 datalist）。
// 暗色浮层面板（ui设计参考 §4 材质层级：比底层亮一档+柔和阴影）、输入实时过滤、
// 最近使用置顶（按公会记忆 3 个，REQ-029 逻辑不变）、"其他（手动输入）"兜底、键盘 ↑↓/Enter/Esc 可用。
let raidSelectActiveIdx = -1;
let raidSelectOptions = []; // 当前面板可选项 [{label, tag}]

function raidSelectRender() {
  const input = document.getElementById('activityRaidName');
  const panel = document.getElementById('raidSelectPanel');
  if (!input || !panel) return;
  const q = input.value.trim();
  const recent = getRecentRaidNames().filter(n => !q || n.includes(q));
  // 任务书 #14：团本清单读主数据（巢穴类型带标识）；未加载时回退内置常量
  const rest = getGameRaidNames().filter(n => !getRecentRaidNames().includes(n) && (!q || n.includes(q)));
  raidSelectOptions = [
    ...recent.map(n => ({ label: n, tag: '最近' })),
    ...rest.map(n => ({ label: n, tag: getGameRaidType(n) === 'lair' ? '巢穴 15-25' : '' })),
  ];
  const otherLabel = q ? `其他（手动输入）："${q}"` : '其他（手动输入）';
  let html = raidSelectOptions.map((o, i) =>
    `<div class="raid-select-item${i === raidSelectActiveIdx ? ' active' : ''}" data-idx="${i}" onmousedown="raidSelectPick(${i})">
       <span>${o.label}</span>${o.tag ? `<span class="raid-select-tag">${o.tag}</span>` : ''}
     </div>`).join('');
  // 兜底项 idx = raidSelectOptions.length
  html += `<div class="raid-select-item raid-select-other${raidSelectActiveIdx === raidSelectOptions.length ? ' active' : ''}" data-idx="${raidSelectOptions.length}" onmousedown="raidSelectPick(${raidSelectOptions.length})">${otherLabel}</div>`;
  panel.innerHTML = html;
}

function raidSelectOpen() {
  const panel = document.getElementById('raidSelectPanel');
  if (!panel) return;
  raidSelectActiveIdx = -1;
  raidSelectRender();
  panel.style.display = 'block';
  raidSelectSyncClear();
}

// REQ-050（任务书 #13-补丁）：清空按钮显隐（有内容才显示）
function raidSelectSyncClear() {
  const btn = document.getElementById('raidSelectClear');
  const input = document.getElementById('activityRaidName');
  if (btn && input) btn.style.display = input.value ? '' : 'none';
}

// REQ-050：清空文本框并重新展开下拉面板（不清空"最近使用"记忆）
function raidSelectClearInput(e) {
  if (e) e.stopPropagation();
  const input = document.getElementById('activityRaidName');
  if (!input) return;
  input.value = '';
  raidSelectSyncClear();
  raidSelectOpen(); // 重新展开全量面板供重选
  input.focus();
}

function raidSelectClose() {
  const panel = document.getElementById('raidSelectPanel');
  if (panel) panel.style.display = 'none';
  raidSelectActiveIdx = -1;
  raidSelectSyncClear(); // REQ-050：弹窗打开/面板收起时同步清空按钮显隐
}

function raidSelectFilter() {
  raidSelectActiveIdx = -1;
  raidSelectSyncClear();
  raidSelectOpen();
}

function raidSelectPick(idx) {
  const input = document.getElementById('activityRaidName');
  if (!input) return;
  // 兜底项"其他（手动输入）"：保留已输入文本，仅关闭面板
  if (idx >= 0 && idx < raidSelectOptions.length) {
    input.value = raidSelectOptions[idx].label;
  }
  raidSelectClose();
  // 注意：不要 input.focus()——onfocus 会重新展开面板
}

function raidSelectKey(e) {
  const panel = document.getElementById('raidSelectPanel');
  const isOpen = panel && panel.style.display !== 'none';
  const total = raidSelectOptions.length + 1; // 含兜底项
  if (e.key === 'Escape' && isOpen) {
    // 面板打开时 Esc 只关面板，不触发弹窗栈关闭（modalStack 体系）
    e.stopPropagation();
    e.preventDefault();
    raidSelectClose();
    return;
  }
  if (!isOpen) {
    if (e.key === 'ArrowDown') { raidSelectOpen(); e.preventDefault(); }
    return;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    raidSelectActiveIdx = e.key === 'ArrowDown'
      ? (raidSelectActiveIdx + 1) % total
      : (raidSelectActiveIdx - 1 + total) % total;
    raidSelectRender();
    const activeEl = panel.querySelector('.raid-select-item.active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter' && raidSelectActiveIdx >= 0) {
    e.preventDefault();
    raidSelectPick(raidSelectActiveIdx);
  }
}

// 点击组件外部关闭面板（onmousedown 先于此触发，选项点击不受影响）
document.addEventListener('click', (e) => {
  if (!e.target.closest('#raidSelect')) raidSelectClose();
});

// REQ-028：活动时间段归一化为 [start, end) 分钟区间；结束 <= 开始视为跨天（+24h），与 REQ-012 时长口径一致。
// 缺起止时间返回 null（不参与冲突判定）。
function activityTimeRangeMinutes(a) {
  if (!a.start_time || !a.end_time) return null;
  const [sh, sm] = a.start_time.split(':').map(Number);
  const [eh, em] = a.end_time.split(':').map(Number);
  if ([sh, sm, eh, em].some(isNaN)) return null;
  const s = sh * 60 + sm;
  let e = eh * 60 + em;
  if (e <= s) e += 24 * 60; // 跨天：结束时间为次日
  return [s, e];
}

// REQ-028：时间冲突检测。规则：同日 + 同团号（双方都空视为同组）+ 时间段交叉。
// REQ-064（任务书 #14-补丁4）：旧「团队标签」team_tag 已并入「团号」team_label（值已迁移），分组键同步切换。
// 交叉判定：半开区间 s1 < e2 && s2 < e1（首尾相接不算冲突）；跨天已按 +24h 归一。
// 已取消的活动不占用时间，不参与冲突判定；编辑时由 excludeId 排除自身。
function findActivityConflicts(candidate, excludeId) {
  if (!candidate || !candidate.date) return [];
  const range = activityTimeRangeMinutes(candidate);
  if (!range) return [];
  const label = (candidate.team_label || '').trim();
  return appData.activities.filter(a => {
    if (a.id === excludeId) return false;
    if (a.status === 'cancelled') return false;
    if (a.date !== candidate.date) return false;
    if ((a.team_label || '').trim() !== label) return false;
    const r = activityTimeRangeMinutes(a);
    if (!r) return false;
    return range[0] < r[1] && r[0] < range[1];
  });
}

// REQ-028：活动弹窗内冲突警告条（黄色，仅提示不阻断保存）
function updateActivityConflictWarning() {
  const el = document.getElementById('activityConflictWarning');
  if (!el) return;
  const conflicts = findActivityConflicts({
    date: document.getElementById('activityDate').value,
    team_label: document.getElementById('activityTeamLabel').value,
    start_time: document.getElementById('activityStartTime').value,
    end_time: document.getElementById('activityEndTime').value
  }, editingActivityId);
  if (!conflicts.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.innerHTML = conflicts.map(c =>
    `⚠ 与活动《${c.raid_name || '未命名活动'}》（${c.start_time || '--:--'}-${c.end_time || '--:--'}）时间冲突`
  ).join('<br>');
  el.style.display = '';
}

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
  await window.CloudSync.ensureTagNum(); // REQ-094：玩家ID 数字段确保已分配（幂等）
  await loadUserProfile();
  await loadUserCharacters();
  await loadNotifications();
  // REQ-094：异步回填完成后重拍快照——openModal 时字段尚为空，
  // 不补拍则防误关把数据回填误判为「未保存编辑」（误拦关闭）
  snapshotModalForm('userCenterModal');
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
  if (tabName === 'claims') {
    loadMyClaims();
  }
}

// 任务书 #18 WP2 R2/R3：用户中心「我的认领」——跨公会列出我认领的 raid_members，
// 逐条展示角色名/职业专精/公会/区服/在队状态并提供解绑；本公会部分附 R2 聚合行。
async function loadMyClaims() {
  const listEl = document.getElementById('myClaimsList');
  const sumEl = document.getElementById('myClaimsSummary');
  if (!listEl) return;
  const me = window.CloudSync.getCachedUser();
  if (!me) { listEl.innerHTML = '<p class="uc-empty">未登录</p>'; return; }
  const client = window.CloudSync.getClient();
  if (!client) { listEl.innerHTML = '<p class="uc-empty">云端未连接</p>'; return; }

  const { data: rows, error } = await client.from('raid_members').select('*').eq('user_id', me.id);
  if (error) {
    console.error('我的认领加载失败:', error);
    listEl.innerHTML = '<p class="uc-empty">加载失败</p>';
    return;
  }
  if (!rows || rows.length === 0) {
    if (sumEl) sumEl.textContent = '';
    listEl.innerHTML = '<p class="uc-empty">暂无认领的角色（认领入口：成员管理 → 成员行「待认领」）</p>';
    return;
  }

  const guildIds = [...new Set(rows.map(r => r.guild_id))];
  const { data: guilds } = await client.from('guilds').select('id,name,server_region,server_name').in('id', guildIds);
  const gMap = new Map((guilds || []).map(g => [g.id, g]));
  const currentGuild = window.CloudSync.getCurrentGuild();

  listEl.innerHTML = rows.map(r => {
    const g = gMap.get(r.guild_id) || {};
    const region = [g.server_region, g.server_name].filter(Boolean).join(' - ') || '未设置';
    const specText = [r.class, r.spec].filter(Boolean).join(' / ') || '-';
    return `
      <div class="uc-character-card">
        <div class="uc-character-header">
          <div>
            <span class="uc-character-name">${r.name}</span>
            <span class="uc-character-server">${g.name || '未知公会'}</span>
            <span class="uc-character-region">${region}</span>
          </div>
        </div>
        <div class="uc-character-details">
          <div class="uc-character-detail">职业/专精：<span>${classIconHtml(r.class)}${specText}</span></div>
          <div class="uc-character-detail">在队状态：<span>${r.status || '正式'}</span></div>
        </div>
        <div class="uc-character-actions">
          <button class="uc-btn uc-btn-danger" onclick="unclaimFromCenter('${r.id}', '${(r.name || '').replace(/'/g, '')}')">解除认领</button>
        </div>
      </div>
    `;
  }).join('');

  // R2 个人视角聚合（本公会口径：appData 即当前公会数据）
  if (sumEl) {
    const mineHere = rows.filter(r => currentGuild && r.guild_id === currentGuild.id);
    if (!mineHere.length) {
      sumEl.textContent = '当前公会内无认领角色';
    } else {
      const ids = new Set(mineHere.map(r => r.id));
      const names = new Set(mineHere.map(r => r.name));
      let present = 0, total = 0;
      mineHere.forEach(r => {
        const s = getAttendanceStats(r.id, appData.activities);
        present += s.present;
        total += s.total;
      });
      const lootCount = (appData.loots || []).filter(l =>
        (l.character_id && ids.has(l.character_id)) || (l.assignedTo && names.has(l.assignedTo))).length;
      const wishCount = (appData.wishlist || []).filter(w => ids.has(w.memberId)).length;
      const rate = total > 0 ? Math.round((present / total) * 100) : 0;
      sumEl.textContent = `本公会认领 ${mineHere.length} 人 · 合计出勤率 ${rate}%（出勤 ${present}/应到 ${total}） · 装备 ${lootCount} 件 · 心愿 ${wishCount} 条`;
    }
  }
}

// 任务书 #18 WP2 R3：从用户中心解除认领（只能解自己的；confirmed 后清空该成员 user_id）
async function unclaimFromCenter(memberId, memberName) {
  if (!confirm(`确定解除对「${memberName || '该角色'}」的认领吗？`)) return;
  try {
    await window.CloudSync.unclaimRaidMember(memberId);
    // 若是当前公会的成员，同步刷新 appData 与列表
    const currentGuild = window.CloudSync.getCurrentGuild();
    const inAppData = (appData.members || []).some(m => m.id === memberId);
    if (currentGuild && inAppData) {
      await window.CloudSync.reloadData('members');
      saveData();
      renderCurrentPage();
    }
    showToast('已解除认领', 'success');
  } catch (e) {
    console.error('解除认领失败:', e);
    showToast('解除认领失败: ' + (e.message || '未知错误'), 'error');
  }
  await loadMyClaims();
}

// REQ-103（任务书 #36 WP1）：用户中心公会卡渲染——名称复用 guildDisplayName 真源（BUG-073），
// 我的角色徽标复用 roleLabels/着色；两按钮复用现有 guildSettingsModal/guildSwitcherModal（modalStack 叠开置顶为既有机制）
function renderUcGuildCard() {
  const card = document.getElementById('ucGuildCard');
  if (!card) return;
  const guild = window.CloudSync && window.CloudSync.getCurrentGuild ? window.CloudSync.getCurrentGuild() : null;
  const membership = window.CloudSync && window.CloudSync.getCurrentMembership ? window.CloudSync.getCurrentMembership() : null;
  if (!guild) { card.style.display = 'none'; return; }
  card.style.display = '';
  document.getElementById('ucGuildCardName').textContent = guildDisplayName(guild);
  const roleEl = document.getElementById('ucGuildCardRole');
  if (roleEl && membership) {
    const roleLabels = { owner: '会长', editor: '编辑', viewer: '浏览' };
    roleEl.textContent = roleLabels[membership.role] || membership.role;
    roleEl.className = `role-badge role-${membership.role}`;
    roleEl.style.display = '';
  }
}

// 加载用户资料
async function loadUserProfile() {
  try {
    const user = await window.CloudSync.getCurrentUser();
    if (!user) return;
    
    document.getElementById('ucEmail').value = user.email || '';
    
    const profile = await window.CloudSync.getUserProfile();
    // 任务书 #21 WP1-④：显示名唯一真源 = user_metadata.display_name；
    // user_profiles.display_name 仅为存量数据回退展示（不再写入）
    const metaName = user.user_metadata && user.user_metadata.display_name;
    document.getElementById('ucDisplayName').value = metaName || (profile && profile.display_name) || '';

    // REQ-103（任务书 #36 WP1）：用户中心公会卡（置顶，唯一入口）
    renderUcGuildCard();

    // REQ-094（任务书 #29 WP1）：玩家ID 顶部卡片（名字部分跟随改名、数字段恒定）
    const pid = window.CloudSync.getPlayerId ? window.CloudSync.getPlayerId() : '';
    const pidCard = document.getElementById('ucPlayerIdCard');
    if (pidCard) {
      pidCard.style.display = pid ? '' : 'none';
      if (pid) document.getElementById('ucPlayerIdText').textContent = pid;
    }
  } catch (e) {
    console.error('加载用户资料失败:', e);
  }
}

// REQ-094（任务书 #29 WP1）：复制完整玩家ID（昵称#12345）到剪贴板
async function copyPlayerId() {
  const text = (window.CloudSync.getPlayerId && window.CloudSync.getPlayerId()) || '';
  if (!text) { showToast('玩家ID 尚未生成，请稍后重试', 'error'); return; }
  try {
    await navigator.clipboard.writeText(text);
    showToast(`已复制 ${text}`, 'success');
  } catch (e) {
    // 剪贴板 API 不可用（非安全上下文等）时回退 execCommand
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast(`已复制 ${text}`, 'success');
    } catch (e2) {
      showToast('复制失败，请手动选择复制', 'error');
    }
    ta.remove();
  }
}

// ==================== REQ-104（任务书 #34 WP1）：密码校验失败抖动 ====================
// 一处实现两处复用（注册页 regPassword / 用户中心 ucPw*）；红字提示保留，抖动为增量感知。
// 可重复触发：移除类 → 强制 reflow → 再添加；reduced-motion 降级在 CSS 层（animation:none）。
function shakePwField(el) {
  if (!el) return;
  el.classList.remove('pw-shake');
  void el.offsetWidth; // 强制 reflow，保证连续失败也能重新播放
  el.classList.add('pw-shake');
}
// 服务端 422 weak_password 判定（supabase AuthApiError：status=422 / code=weak_password）
function isWeakPassword422(e) {
  return !!(e && (e.status === 422 || /weak_password/i.test(String(e.code || '')) || /weak_password/i.test(String(e.message || ''))));
}
// blur 补位触发面：两表单均有 REQ-094 提交门（非空不合规禁用提交），弱密码下提交路径不可达——
// 字段失焦且内容不合规时抖动一次（空值不抖：未输入不算校验失败），B1/B2 验收路径由此可达。
(function bindPwShakeOnBlur() {
  const regPw = document.getElementById('regPassword');
  if (regPw) regPw.addEventListener('blur', () => { if (regPw.value && passwordRuleError(regPw.value)) shakePwField(regPw); });
  const ucNew = document.getElementById('ucPwNew');
  if (ucNew) ucNew.addEventListener('blur', () => { if (ucNew.value && passwordRuleError(ucNew.value)) shakePwField(ucNew); });
  const ucCf = document.getElementById('ucPwConfirm');
  if (ucCf) ucCf.addEventListener('blur', () => { if (ucCf.value && ucCf.value !== ucNew.value) shakePwField(ucCf); });
})();

// REQ-094（任务书 #29 WP1）：修改密码——当前密码服务端校验 + 强度规则同注册
// REQ-096（2026-08-11 验收修复小包，口径变更推翻任务书 #29 WP1「会话保持」裁定）：改密成功 → 提示 → 强制登出回登录页
async function changePassword() {
  const cur = document.getElementById('ucPwCurrent').value;
  const nw = document.getElementById('ucPwNew').value;
  const cf = document.getElementById('ucPwConfirm').value;
  const hint = document.getElementById('ucPwHint');
  const showHint = (msg, ok) => {
    hint.textContent = msg || '';
    hint.style.display = msg ? '' : 'none';
    hint.style.color = ok ? 'var(--success)' : 'var(--danger)';
  };
  if (!cur) { showHint('请输入当前密码'); return; }
  const ruleErr = passwordRuleError(nw);
  // REQ-104：前端校验失败抖动——目标 = 不符字段本身（新密码不合规→新密码框；两次不一致→确认框）
  if (ruleErr) { showHint(ruleErr); shakePwField(document.getElementById('ucPwNew')); return; }
  if (nw === cur) { showHint('新密码不能与当前密码相同'); shakePwField(document.getElementById('ucPwNew')); return; }
  if (nw !== cf) { showHint('两次输入的新密码不一致'); shakePwField(document.getElementById('ucPwConfirm')); return; }

  const btn = document.getElementById('ucPwSubmitBtn');
  try {
    btn.disabled = true;
    btn.textContent = '修改中...';
    // 当前密码服务端校验（独立 token 端点，不触碰当前会话）
    const curOk = await window.CloudSync.verifyCurrentPassword(cur);
    if (!curOk) { showHint('当前密码错误'); return; }
    await window.CloudSync.updatePassword(nw);
    // REQ-096：改密成功 → toast/登录页提示「密码已修改，请重新登录」→ 强制登出，旧会话即刻失效。
    // 登出走全站唯一 logout 路径 handleSignOut（清会话/公会态 + 全弹窗出栈 + 回登录页 + 按钮状态机复位）。
    document.getElementById('ucPwCurrent').value = '';
    document.getElementById('ucPwNew').value = '';
    document.getElementById('ucPwConfirm').value = '';
    updatePwStrength('uc');
    showHint('');
    showToast('密码已修改，请重新登录', 'success');
    await handleSignOut();
    showLoginForm(); // showAuthView 只显遮罩，表单停留在上次状态——强制回登录表单
    // toast 容器在应用视图内、登出后随之隐藏，登录页落持久提示（绿色语义）
    showAuthNotice('密码已修改，请重新登录');
  } catch (e) {
    console.error('修改密码失败:', e);
    showHint('修改失败：' + (e.message || '未知错误'));
    if (isWeakPassword422(e)) shakePwField(document.getElementById('ucPwNew')); // REQ-104：服务端 422 → 新密码框
  } finally {
    btn.disabled = false;
    btn.textContent = '确认修改';
    updatePwGate('uc');
  }
}

// 保存用户资料
async function saveUserProfile() {
  const displayName = document.getElementById('ucDisplayName').value.trim();
  try {
    await window.CloudSync.saveUserProfile({ display_name: displayName });
    // 任务书 #21 WP1-④：改名后右上角立即生效，不依赖重新登录
    // BUG-072（2026-08-11 验收修复小包）：改名刷新链断在 render 环——玩家ID卡/页内昵称只在
    // 进入用户中心时渲染。补环（禁整页 reload）：loadUserProfile 重读服务端用户刷用户中心
    // 顶部玩家ID卡与页内昵称输入；updateCloudUI 刷 topbar 昵称/头像 + 头像菜单头（昵称+玩家ID）
    await loadUserProfile();
    updateCloudUI();
    // 任务书 #22 WP3-④：同步本人所有公会 guild_members.display_name 快照（他人视角显示新名）
    let syncWarn = '';
    try {
      await window.CloudSync.syncMyGuildDisplayName(displayName);
      claimerNames.guildId = null; // 认领人名单缓存失效，下次渲染重取
      renderMembers();
    } catch (e2) {
      console.error('公会快照同步失败:', e2);
      syncWarn = '（但公会内名字快照同步失败：' + (e2.message || '未知错误') + '）';
    }
    alert('资料已保存' + syncWarn);
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
  lastArmoryWarnValue = '';
  updateCharArmoryClearBtn();
  onCharClassChange(); // 重置专精候选为空
  openModal('addCharacterModal');
}

// 任务书 #24-补丁①：英雄榜 slug → 国服中文服务器名映射（保守收录常见服务器；
// 清单权威源为 cloud.js WOW_SERVERS，映射不到时保留原值并提示可手改）
const ARMORY_SERVER_SLUGS = {
  'the-golden-plains': '金色平原',
  'silver-hand': '白银之手',
  'deathwing': '死亡之翼',
  'burning-blade': '燃烧之刃',
  'ronin': '罗宁',
  'arthas': '阿尔萨斯',
  'illidan': '伊利丹',
  'khadgar': '卡德加',
  'proudmoore': '普罗德摩',
  'frostmourne': '霜之哀伤',
  'tyrande': '泰兰德',
  'draenor': '德拉诺',
  'stormscale': '风暴之鳞',
  'howling-fjord': '嚎风峡湾',
  'valley-of-kings': '国王之谷',
  'doomhammer': '毁灭之锤',
  'shadow-moon': '暗影之月'
};

// 服务器名归一化：已是中文且在国服清单内→原样；英文 slug 命中映射→中文；否则保留原值
function mapArmoryServerName(serverName) {
  if (!serverName) return { name: '', known: false };
  const all = (window.CloudSync && window.CloudSync.getAllWowServers) ? window.CloudSync.getAllWowServers() : [];
  if (all.some(s => s.server === serverName)) return { name: serverName, known: true };
  const mapped = ARMORY_SERVER_SLUGS[serverName.toLowerCase()];
  if (mapped) return { name: mapped, known: true };
  return { name: serverName, known: false };
}

// 解析成功后字段短暂高亮
function flashParsedFields(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('uc-flash');
    void el.offsetWidth; // 重启动画
    el.classList.add('uc-flash');
    setTimeout(() => el.classList.remove('uc-flash'), 900);
  });
}

// 英雄榜输入框清空按钮显隐
function updateCharArmoryClearBtn() {
  const input = document.getElementById('charArmoryUrl');
  const btn = document.getElementById('charArmoryUrlClear');
  if (input && btn) btn.style.display = input.value ? 'block' : 'none';
}

// 清空英雄榜链接
function clearCharArmoryUrl() {
  const input = document.getElementById('charArmoryUrl');
  if (input) input.value = '';
  updateCharArmoryClearBtn();
}

let lastArmoryWarnValue = ''; // 同一未识别值只提示一次，避免打字过程刷屏
// 解析英雄榜 URL 输入
function parseArmoryUrlInput() {
  const url = document.getElementById('charArmoryUrl').value.trim();
  updateCharArmoryClearBtn();
  if (!url) { lastArmoryWarnValue = ''; return; }

  const parsed = parseArmoryUrl(url);
  if (!parsed || !parsed.characterName) {
    // 仅对看似完整的链接提示一次，输入中间态不打扰
    if (url.startsWith('http') && url.length >= 25 && lastArmoryWarnValue !== url) {
      lastArmoryWarnValue = url;
      showToast('未识别链接格式，请手动输入', 'warning');
    }
    return;
  }
  lastArmoryWarnValue = '';

  if (parsed.characterName) document.getElementById('charName').value = parsed.characterName;
  if (parsed.region) document.getElementById('charRegion').value = parsed.region;
  let serverDisplay = '';
  let serverKnown = true;
  if (parsed.serverName) {
    const mapped = mapArmoryServerName(parsed.serverName);
    serverDisplay = mapped.name;
    serverKnown = mapped.known;
    document.getElementById('charServer').value = mapped.name;
  }
  flashParsedFields(['charName', 'charServer']);
  if (parsed.serverName && !serverKnown) {
    showToast(`已解析：${parsed.characterName} · ${serverDisplay}（服务器未收录，已保留原值，请手动核对）`, 'warning');
  } else {
    showToast(`已解析：${parsed.characterName} · ${serverDisplay || '未知服务器'}`, 'success');
  }
}

// 任务书 #24-补丁2①：专精改站内标准下拉——未选职业禁用+占位；选职业后填充全量专精（getGameSpecs）；换职业重建即清空旧值
function onCharClassChange() {
  const cls = document.getElementById('charClass').value;
  const specSel = document.getElementById('charSpec');
  if (!specSel) return;
  const specs = cls ? getGameSpecs(cls) : [];
  specSel.innerHTML = cls
    ? '<option value="">请选择专精</option>' + specs.map(s => `<option value="${s}">${s}</option>`).join('')
    : '<option value="">请先选择职业</option>';
  specSel.disabled = !cls;
}

// 任务书 #24-补丁2②：从插件导出文件（游戏内 /wjdc me → character.json）导入角色档案
// 字段口径以 scripts/wjdc_convert.py 的 character.json 产物为准，禁止自造字段名；只填表单不写库，保存链路不变
function importCharacterJson(input) {
  const file = input.files && input.files[0];
  input.value = ''; // 复位，允许重复选择同一文件
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = JSON.parse(reader.result);
    } catch (e) {
      showToast('文件不是有效的 JSON，请使用插件 /wjdc me 导出的 character.json', 'error');
      return;
    }
    if (!data || typeof data !== 'object' || !data.character_name || !data.server_name) {
      showToast('文件格式不正确：缺少 character_name / server_name 字段（应为 /wjdc me 导出的 character.json），可手动填写', 'error');
      return;
    }
    // 区域：插件导出 CN/US/EU/KR/TW → 表单三档
    const regionMap = { CN: 'CN', KR: 'Asia', TW: 'Asia', Asia: 'Asia', US: 'US-EU', EU: 'US-EU', 'US-EU': 'US-EU' };
    // 阵营：插件导出本地化「联盟/部落」→ 表单 Alliance/Horde
    const factionMap = { '联盟': 'Alliance', '部落': 'Horde', Alliance: 'Alliance', Horde: 'Horde' };
    document.getElementById('charArmoryUrl').value = ''; // armory_url 恒空（#26 约定），清空防误带旧链接
    updateCharArmoryClearBtn();
    document.getElementById('charName').value = data.character_name || '';
    document.getElementById('charServer').value = data.server_name || '';
    document.getElementById('charRegion').value = regionMap[data.server_region] || 'CN';
    document.getElementById('charFaction').value = factionMap[data.faction] || '';
    // 职业：命中下拉选项才带入，否则留空手选
    const classSel = document.getElementById('charClass');
    const classOk = [...classSel.options].some(o => o.value && o.value === data.class);
    classSel.value = classOk ? data.class : '';
    onCharClassChange(); // 重建专精下拉（含清空）
    // 专精：合法值带入，非法值清空并提示（提示延后到成功 toast 之后，避免被覆盖）
    let specWarn = '';
    if (classOk && data.spec) {
      if (getGameSpecs(data.class).includes(data.spec)) {
        document.getElementById('charSpec').value = data.spec;
      } else {
        specWarn = `专精「${data.spec}」不在「${data.class}」专精列表中，已清空请手选`;
      }
    }
    document.getElementById('charLevel').value = data.level || '';
    document.getElementById('charItemLevel').value = data.item_level || '';
    document.getElementById('charRace').value = data.race || '';
    document.getElementById('charGuild').value = data.guild_name || '';
    flashParsedFields(['charName', 'charServer', 'charRegion', 'charFaction', 'charClass', 'charSpec', 'charLevel', 'charItemLevel', 'charRace', 'charGuild']);
    showToast(`已导入：${data.character_name} · ${data.server_name}`, 'success');
    if (specWarn) showToast(specWarn, 'warning');
  };
  reader.onerror = () => showToast('文件读取失败，请重试', 'error');
  reader.readAsText(file, 'utf-8');
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
    showToast('请填写角色名称和服务器', 'warning');
    return;
  }

  // REQ-002②：同一服务器内角色名唯一，不同服务器允许重名
  try {
    const existingChars = await window.CloudSync.getUserCharacters();
    const dup = (existingChars || []).some(c =>
      c.server_name === characterData.server_name && c.character_name === characterData.character_name
    );
    if (dup) {
      showToast(`服务器「${characterData.server_name}」已存在同名角色「${characterData.character_name}」`, 'warning');
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
    
    // 更新侧边栏通知点（REQ-103，任务书 #36 WP4 附加：宿主由侧栏公会行 👤 按钮迁至 nav「用户中心」项，
    // 显隐条件与数据源零变化，只换宿主）
    const notifDot = document.getElementById('navNotifDot');
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
  const perfT0 = performance.now(); // 任务书 #10：写路径前端计时

  try {
    // 1. 写入主数据源（Supabase）
    await window.CloudSync.saveCloudData(dataType, operation, payload);
    const perfWrite = performance.now();

    // 2. 重新读取数据库最新状态并更新 appData
    await window.CloudSync.reloadData(dataType);
    const typesToReload = reloadTypes || [];
    for (const t of typesToReload) {
      await window.CloudSync.reloadData(t);
    }

    // 3. 缓存到 localStorage（仅作为缓存）
    saveData();

    // 3.5 BUG-080 哨兵（任务书 #47 WP4，运营裁定 b 先行）：写后自检——reload 后缓存必须已含新值，
    // 不满足自动二次 reload + console 告警（verify 断言触发/不触发两态）；二次仍不一致升级 error
    if (!cloudCrudSentinelCheck(dataType, operation, payload)) {
      console.warn(`[BUG-080 哨兵] cloudCrud ${dataType}/${operation} 写后缓存未含新值，自动二次 reload`);
      await window.CloudSync.reloadData(dataType);
      saveData();
      if (!cloudCrudSentinelCheck(dataType, operation, payload)) {
        console.error(`[BUG-080 哨兵] ${dataType}/${operation} 二次 reload 后缓存仍不一致（id=${payload && payload.id}）`);
      }
    }
    const perfReload = performance.now();

    // 4. 渲染当前模块
    if (typeof renderFn === 'function') renderFn();
    if (typeof onSuccess === 'function') onSuccess();
    const perfEnd = performance.now();
    console.debug(`[perf] cloudCrud ${dataType}/${operation} write=${Math.round(perfWrite - perfT0)}ms reload=${Math.round(perfReload - perfWrite)}ms render=${Math.round(perfEnd - perfReload)}ms total=${Math.round(perfEnd - perfT0)}ms`);
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

// ---- BUG-080 哨兵校验函数（任务书 #47 WP4）----
// 校验口径（宁稳勿误报）：add=新 id 在集合；delete=id 已消失；update=id 在集合且 payload 中与行
// 同名的标量键值逐一相等（对象/数组键如 attendees/off_specs/item_stats 因前后端结构映射差异不比对，
// payload 缺 id 或未知数据类型不校验）。appData 集合映射：members/loots/wishlist(s)/activities。
function cloudCrudSentinelCheck(dataType, operation, payload) {
  const coll = dataType === 'members' ? appData.members
    : dataType === 'loots' ? appData.loots
    : (dataType === 'wishlist' || dataType === 'wishlists') ? appData.wishlist
    : dataType === 'activities' ? appData.activities : null;
  if (!Array.isArray(coll)) return true;
  const id = payload && payload.id;
  if (!id) return true;
  const row = coll.find(r => r.id === id);
  if (operation === 'delete') return !row;
  if (!row) return false;
  if (operation === 'add') return true;
  if (operation !== 'update') return true;
  for (const k of Object.keys(payload)) {
    if (k === 'id') continue;
    const v = payload[k];
    if (v === undefined || v === null || typeof v === 'object') continue;
    if (k in row && row[k] !== v) return false;
  }
  return true;
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
  if (el) { el.textContent = msg; el.style.color = ''; } // 颜色复位，避免盖过 REQ-096 成功级提示的覆写
}

// REQ-096：登录页成功级提示（改密强制重新登录等场景），复用 authError 元素、绿色语义
function showAuthNotice(msg) {
  const el = document.getElementById('authError');
  if (el) { el.textContent = msg; el.style.color = 'var(--success)'; }
}

// BUG-009：Supabase Auth 英文错误 → 中文提示映射
function mapAuthError(e) {
  const msg = (e && (e.message || e.error_description || e.msg)) || '';
  const lower = msg.toLowerCase();
  if (lower.includes('invalid login credentials')) return '邮箱或密码错误';
  if (lower.includes('user already registered')) return '该邮箱已注册，请直接登录';
  if (lower.includes('email not confirmed')) return '邮箱尚未验证，请先完成邮箱验证';
  if (lower.includes('password') && (lower.includes('at least') || lower.includes('too short') || lower.includes('weak'))) return '密码不符合要求（至少 8 位）'; // BUG-075：对齐 gotrue GOTRUE_PASSWORD_MIN_LENGTH=8
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
  resetAuthButtons(); // BUG-044：回登录表单统一复位按钮与提示
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
  resetAuthButtons(); // BUG-044：退出公会等路径落到公会表单时，登录/注册按钮一并复位
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

// BUG-044（任务书 #13-补丁2）：登录/注册按钮状态机——任何路径不得把按钮卡在"登录中..."
function authSetBusy(form, busy) {
  const btn = document.getElementById(form === 'register' ? 'authRegisterBtn' : 'authLoginBtn');
  if (!btn) return;
  if (busy) {
    btn.dataset.originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = form === 'register' ? '注册中...' : '登录中...';
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.originalText || (form === 'register' ? '注册' : '登录');
  }
}
// 回到登录页/切换表单时统一复位（退出公会、退出登录、表单切换均覆盖）
function resetAuthButtons() {
  authSetBusy('login', false);
  authSetBusy('register', false);
  if (typeof updatePwGate === 'function') updatePwGate('reg'); // REQ-094：复位后按强度规则重估注册提交门
  showAuthError('');
}
window.resetAuthButtons = resetAuthButtons; // cloud.js showAuthView 回登录页时调用

// ==================== REQ-094（任务书 #29 WP1）：密码强度 ====================
// 规则：≥8 位、必须同时含字母与数字、拦截 top-20 常见弱密码。
// 同一套校验 + 三档强度条组件复用注册（reg）与修改密码（uc）两表单。
const WEAK_PASSWORDS = [
  '12345678', '123456789', '1234567890', 'password', 'password1', 'qwerty123', 'abc12345', 'abcd1234',
  'qq123456', '11111111', '00000000', 'iloveyou', '123123123', 'admin123', 'letmein123', 'wow123456',
  'a12345678', '87654321', '66668888', '52013145'
];
// 返回 '' = 合规可提交；否则为就地中文提示文案
function passwordRuleError(pw) {
  if (!pw) return '请输入密码';
  if (pw.length < 8) return '密码至少 8 位';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return '密码需同时包含字母和数字';
  if (WEAK_PASSWORDS.includes(pw.toLowerCase())) return '该密码过于常见，请更换更安全的密码';
  return '';
}
// 三档：1=弱（不合规）2=中（合规）3=强（合规且 ≥10 位且大小写混合或含符号）
function passwordStrengthLevel(pw) {
  if (!pw) return 0;
  if (passwordRuleError(pw)) return 1;
  const mixedCase = /[a-z]/.test(pw) && /[A-Z]/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);
  return (pw.length >= 10 && (mixedCase || hasSymbol)) ? 3 : 2;
}
function updatePwStrength(scope) {
  const input = document.getElementById(scope === 'reg' ? 'regPassword' : 'ucPwNew');
  const box = document.getElementById(scope + 'PwStrength');
  const fill = document.getElementById(scope + 'PwStrengthFill');
  const text = document.getElementById(scope + 'PwStrengthText');
  if (!input || !box || !fill || !text) return;
  const pw = input.value;
  if (!pw) {
    box.style.display = 'none';
    updatePwGate(scope);
    return;
  }
  box.style.display = '';
  const lv = passwordStrengthLevel(pw);
  const styles = {
    1: ['弱', 'var(--danger)', '33%'],
    2: ['中', 'var(--warning)', '66%'],
    3: ['强', 'var(--success)', '100%']
  };
  const [label, color, width] = styles[lv];
  fill.style.width = width;
  fill.style.backgroundColor = color;
  const ruleErr = passwordRuleError(pw);
  text.textContent = lv === 1 ? `强度：弱（${ruleErr}）` : `强度：${label}`;
  text.style.color = color;
  updatePwGate(scope);
}
// 提交门：密码非空且不合规时禁用提交（空密码保留原点击报错路径）
function updatePwGate(scope) {
  if (scope === 'reg') {
    const btn = document.getElementById('authRegisterBtn');
    const pw = document.getElementById('regPassword');
    if (btn && pw) btn.disabled = !!pw.value && !!passwordRuleError(pw.value);
  } else {
    const btn = document.getElementById('ucPwSubmitBtn');
    const pw = document.getElementById('ucPwNew');
    if (btn && pw) btn.disabled = !!pw.value && !!passwordRuleError(pw.value);
  }
}

// 登录
async function handleLogin() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  if (!email || !password) { showAuthError('请填写邮箱和密码'); return; }

  try {
    authSetBusy('login', true); // 防重复提交
    showAuthError('');
    await window.CloudSync.signIn(email, password);
    // BUG-045（任务书 #13-补丁3）：登录等待期间用户可能已走退出流程（如弹窗内退出登录），
    // 迟到的 showAppView 会把登录页盖回"已退出的公会页"——落地视图前校验会话仍在
    const token = await window.CloudSync.getAccessToken();
    if (!token) {
      authSetBusy('login', false);
      window.CloudSync.showAuthView();
      return;
    }
    // 检查是否有公会
    const guilds = window.CloudSync.getUserGuilds();
    showAuthError(''); // 成功路径清除瞬时状态，视图随后切换
    if (guilds.length === 0) {
      // 没有公会，显示创建/加入公会表单
      showGuildForm();
    } else {
      // 有公会，跳转到应用界面
      showAppView();
    }
    authSetBusy('login', false); // 复位，供下次回到登录页时处于初始态
  } catch (e) {
    authSetBusy('login', false); // 失败复位 + 错误提示
    showAuthError(mapAuthError(e) || '登录失败');
  }
}

// 注册
async function handleRegister() {
  const displayName = document.getElementById('regDisplayName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  if (!email || !password) { showAuthError('请填写邮箱和密码'); return; }
  // REQ-094（任务书 #29 WP1）：强度规则兜底校验（与实时门禁同一口径，防绕过禁用态直点）
  // REQ-104（任务书 #34 WP1）：前端校验失败 → 注册密码框抖动
  const pwRuleErr = passwordRuleError(password);
  if (pwRuleErr) { showAuthError(pwRuleErr); shakePwField(document.getElementById('regPassword')); return; }

  try {
    authSetBusy('register', true); // 防重复提交
    showAuthError('');
    await window.CloudSync.signUp(email, password, displayName);
    // BUG-045：同 handleLogin，注册等待期间会话若已失效则不落视图
    const regToken = await window.CloudSync.getAccessToken();
    if (!regToken) {
      authSetBusy('register', false);
      window.CloudSync.showAuthView();
      return;
    }
    // 注册后一定没有公会，显示创建/加入公会表单
    showAuthError('');
    showGuildForm();
    authSetBusy('register', false);
    updatePwGate('reg'); // REQ-094：复位后按强度规则重估提交门
  } catch (e) {
    authSetBusy('register', false);
    updatePwGate('reg'); // REQ-094：同上
    showAuthError(mapAuthError(e) || '注册失败');
    if (isWeakPassword422(e)) shakePwField(document.getElementById('regPassword')); // REQ-104：服务端 422 → 密码框
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

  // BUG-015：危险区（退出公会）仅非 owner 可见；owner 退出=解散/转让，属另一需求
  const dangerZone = document.getElementById('dangerZone');
  if (dangerZone) {
    dangerZone.style.display = window.CloudSync.isOwner() ? 'none' : '';
  }

  // REQ-025：公会资料（仅 owner 可编辑）
  const profileOwner = window.CloudSync.isOwner();
  const descEl = document.getElementById('guildProfileDesc');
  const typeEl = document.getElementById('guildProfileLootRuleType');
  const textEl = document.getElementById('guildProfileLootRuleText');
  descEl.value = guild.description || '';
  typeEl.value = guild.loot_rule_type || '';
  textEl.value = guild.loot_rule_text || '';
  [descEl, typeEl, textEl].forEach(el => { el.disabled = !profileOwner; });
  // 任务书 #18 WP2 R4：认领人标签开关（默认开；列未迁移时按开处理，勾选状态仅展示）
  const claimerEl = document.getElementById('guildShowClaimerLabel');
  if (claimerEl) {
    claimerEl.checked = guild.show_claimer_label !== false;
    claimerEl.disabled = !profileOwner;
  }
  // 任务书 #21 WP2：认领方式三档（仅 owner 可改；列未迁移时按 free 展示）
  const claimModeEl = document.getElementById('guildClaimMode');
  if (claimModeEl) {
    claimModeEl.value = guild.claim_mode || 'free';
    claimModeEl.disabled = !profileOwner;
  }
  document.getElementById('guildProfileSaveBtn').style.display = profileOwner ? '' : 'none';
  document.getElementById('guildProfileOwnerHint').style.display = profileOwner ? 'none' : '';
  toggleGuildProfileCustomHint();

  // 任务书 #22 WP3-③：底部保存栏未保存提示——弹窗内任何字段变动即按未保存判定显隐（幂等绑定）
  const dirtyHintEl = document.getElementById('guildSettingsDirtyHint');
  const settingsModalEl = document.getElementById('guildSettingsModal');
  const refreshDirtyHint = () => {
    if (!dirtyHintEl) return;
    const dirty = profileOwner && modalDirtyChecks.guildSettingsModal && modalDirtyChecks.guildSettingsModal();
    dirtyHintEl.style.display = dirty ? '' : 'none';
  };
  if (settingsModalEl) {
    settingsModalEl.oninput = refreshDirtyHint;
    settingsModalEl.onchange = refreshDirtyHint;
  }
  refreshDirtyHint();

  openModal('guildSettingsModal');
  await loadGuildMembers();
}

// REQ-025：自定义制度时提示规则说明必填
function toggleGuildProfileCustomHint() {
  const typeEl = document.getElementById('guildProfileLootRuleType');
  const hint = document.getElementById('guildProfileCustomHint');
  if (typeEl && hint) hint.style.display = typeEl.value === 'custom' ? '' : 'none';
}

// REQ-025：保存公会资料（服务端代理二次校验仅 owner 可写）
async function saveGuildProfile() {
  if (!window.CloudSync.isOwner()) { showToast('仅会长可编辑公会资料', 'error'); return; }
  const description = document.getElementById('guildProfileDesc').value.trim();
  const lootRuleType = document.getElementById('guildProfileLootRuleType').value;
  const lootRuleText = document.getElementById('guildProfileLootRuleText').value.trim();
  if (lootRuleType === 'custom' && !lootRuleText) {
    showToast('选择自定义制度时，请填写分配规则说明', 'error');
    return;
  }
  try {
    await window.CloudSync.updateGuildProfile({
      description: description || null,
      loot_rule_type: lootRuleType || null,
      loot_rule_text: lootRuleText || null,
      // 任务书 #18 WP2 R4：认领人标签开关（列不存在时服务端会报错，由迁移 sql/14 解锁）
      show_claimer_label: document.getElementById('guildShowClaimerLabel') ? document.getElementById('guildShowClaimerLabel').checked : true,
      // 任务书 #21 WP2：认领方式三档（列不存在时服务端会报错，由迁移 sql/15 解锁）
      claim_mode: document.getElementById('guildClaimMode') ? document.getElementById('guildClaimMode').value : 'free'
    });
    showToast('公会资料已保存', 'success');
    // 任务书 #22 WP3-③：保存成功隐藏底部未保存提示
    const dirtyHintEl = document.getElementById('guildSettingsDirtyHint');
    if (dirtyHintEl) dirtyHintEl.style.display = 'none';
    // 认领方式变更影响成员列表认领入口与审核区块，即时重渲染
    renderMembers();
    renderClaimReviewBlock();
  } catch (e) {
    showToast('保存失败: ' + e.message, 'error');
  }
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
            <select data-prev="${m.role}" onchange="handleChangeRole('${m.id}', this)">
              <option value="viewer" ${m.role === 'viewer' ? 'selected' : ''}>浏览</option>
              <option value="editor" ${m.role === 'editor' ? 'selected' : ''}>编辑</option>
              <option value="owner" ${m.role === 'owner' ? 'selected' : ''}>会长</option>
            </select>
            <button onclick="handleRemoveMember('${m.id}', '${m.display_name}')">移除</button>
            <span class="role-change-hint" style="font-size:12px"></span>
          ` : ''}
        </div>
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = `<div style="text-align:center;color:var(--danger);padding:20px">加载失败: ${e.message}</div>`;
  }
}

// 修改成员角色（REQ-043 任务书 #13：全程有感知——禁用防重+"变更中..."，成功 toast，失败就地提示并回滚选择）
async function handleChangeRole(membershipId, selectEl) {
  const newRole = selectEl.value;
  const prevRole = selectEl.dataset.prev || '';
  const hint = selectEl.parentElement ? selectEl.parentElement.querySelector('.role-change-hint') : null;
  selectEl.disabled = true;
  if (hint) { hint.style.color = 'var(--text-muted)'; hint.textContent = '变更中...'; }
  try {
    await window.CloudSync.updateMemberRole(membershipId, newRole);
    showToast('变更成功', 'success');
    await loadGuildMembers();
  } catch (e) {
    selectEl.value = prevRole; // 回滚选择
    selectEl.disabled = false;
    if (hint) { hint.style.color = 'var(--danger)'; hint.textContent = `变更失败：${e.message || '请重试'}`; }
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

// 退出公会（BUG-015：非 owner 入口；退出后不登出，清除公会上下文并回公会入口页）
async function handleLeaveGuild() {
  const membership = window.CloudSync.getCurrentMembership();
  if (!membership) return;
  // owner 退出 = 解散/转让，属另一需求，此处双保险拦截（按钮本就不对 owner 显示）
  if (window.CloudSync.isOwner()) { showToast('会长不能直接退出公会', 'warning'); return; }
  if (!confirm('确定要退出此公会吗？退出后需要重新获得邀请码才能加入。')) return;
  if (!confirm('再次确认：真的要退出吗？')) return;
  try {
    await window.CloudSync.leaveGuild(membership.id);
    // 清除本地会话中的公会上下文
    window.CloudSync.clearCurrentGuild();
    closeModal('guildSettingsModal');
    // 重新加载公会列表：仍有其他公会则切到第一个，否则回"创建/加入公会"页
    const guilds = await window.CloudSync.loadUserGuilds();
    if (guilds.length > 0) {
      await window.CloudSync.selectGuild(guilds[0].id);
      // BUG-080 同族实锤（任务书 #47 WP2-#1）：自愈切换公会后必须重渲——selectGuild 已全量换 appData，
      // 不 render 则当前页停留旧公会数据，此时编辑/删除会以新公会 id 走代理（脏操作）
      updateCloudUI();
      updatePermissionUI();
      renderCurrentPage();
      showToast('已退出公会', 'success');
    } else {
      // 回"创建/加入公会"页（保持在登录态）
      const appContainer = document.querySelector('.app-container');
      if (appContainer) appContainer.style.display = 'none';
      showGuildForm();
      showToast('已退出公会', 'success');
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

// 退出登录（全站唯一 logout 路径：头像菜单 / 切换公会弹窗 都走这里）
async function handleSignOut() {
  try {
    await window.CloudSync.signOut(); // ①清理登录态（supabase 会话）与公会态（SIGNED_OUT 清空上下文）
  } catch (e) {
    // 接口异常时 supabase-js 仍已清本地会话；此处兜底再保一道
    console.error('退出登录接口异常:', e);
    try { localStorage.removeItem('wow_raid_supabase'); } catch { /* 忽略 */ }
    window.CloudSync.clearCurrentGuild();
  }
  // ②清空 modalStack 所有弹窗（不止切换公会弹窗——任何入口叠开的弹窗一律出栈）
  modalStack.slice().forEach(id => closeModal(id));
  // ③跳转登录页（SIGNED_OUT 事件通常已触发，此处兜底幂等）
  window.CloudSync.showAuthView();
  // ④按 FIXED-023 状态机复位登录按钮（showAuthView 内已调，显式再保一道）
  if (typeof resetAuthButtons === 'function') resetAuthButtons();
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
  // 任务书 #14：登录后加载主数据（并行拉取 + 5s 超时 + 快照兜底，不阻塞界面）
  if (window.MasterData) MasterData.init();
  // 任务书 #42：登录/切公会后加载用户偏好（导航排序/日历密度，不阻塞界面）
  loadUserPreferences();
}

// BUG-012：viewer 权限门。viewer 登录后隐藏/禁用全部写入口（界面收口，
// 真正防线在 server.js 代理鉴权）。切换公会/登录/登出后都需调用。
function updatePermissionUI() {
  const isViewer = !!(window.CloudSync && window.CloudSync.isCloudMode() && !window.CloudSync.canEdit());
  document.body.classList.toggle('viewer-mode', isViewer);
}

// BUG-073（任务书 #35 WP2）：公会名称行单一拼接真源——server_name 空回退裸名（不出空括号）。
// #guildName 的全部写入点（本文件 updateCloudUI + cloud.js updateGuildUI）统一走它，
// 任何路径最后写入的都是同口径完整名，消除「裸名/完整名」双路径竞态。
// REQ-103（任务书 #36 WP1）：用户中心公会卡名称同走此真源。
function guildDisplayName(g) {
  if (!g) return '';
  return g.name + (g.server_name ? ` (${g.server_name})` : '');
}

// 更新云端模式 UI
// REQ-103（任务书 #36）：侧栏公会行（guildBar）与头像菜单头部（userMenuHead）已移除——
// 本函数不再写 #guildBar/#guildBarName/#guildRole/#userMenuHead*（元素不存在，零残留）
function updateCloudUI() {
  const userMenu = document.getElementById('userMenu');
  const guildName = document.getElementById('guildName');

  if (window.CloudSync && window.CloudSync.isCloudMode()) {
    const guild = window.CloudSync.getCurrentGuild();
    const membership = window.CloudSync.getCurrentMembership();
    const user = window.CloudSync.getCachedUser ? window.CloudSync.getCachedUser() : null;

    // REQ-044（任务书 #13）：头像菜单（昵称取显示名，缺省用邮箱前缀；头像=昵称首字圆形底）
    if (userMenu) {
      userMenu.style.display = '';
      const nickname = (user && user.user_metadata && user.user_metadata.display_name)
        || (user && user.email ? user.email.split('@')[0] : '用户');
      const nickEl = document.getElementById('userNickname');
      const avatarEl = document.getElementById('userAvatar');
      if (nickEl) nickEl.textContent = nickname;
      if (avatarEl) avatarEl.textContent = (nickname || '用').slice(0, 1);
    }
    if (guild && guildName) {
      // BUG-073：统一走 guildDisplayName 单一拼接真源（含服务器名，空回退裸名）
      guildName.textContent = guildDisplayName(guild);
    }
    if (membership) {
      const roleLabels = { owner: '会长', editor: '编辑', viewer: '浏览' };
      // BUG-020（任务书 #13-补遗）：头像菜单旁同步身份徽章
      const userRoleBadge = document.getElementById('userRoleBadge');
      if (userRoleBadge) {
        userRoleBadge.textContent = roleLabels[membership.role] || membership.role;
        userRoleBadge.className = `role-badge role-${membership.role}`;
        userRoleBadge.style.display = '';
      }
    }
    const cloudSyncStatus = document.getElementById('cloudSyncStatus');
    if (cloudSyncStatus) cloudSyncStatus.textContent = '数据已云端同步';
    // 任务书 #14：数据中心 tab 仅超管可见（非超管不渲染）
    const navDc = document.getElementById('navDatacenter');
    if (navDc) navDc.style.display = (window.MasterData && MasterData.isSuperadmin()) ? '' : 'none';
  } else {
    if (userMenu) userMenu.style.display = 'none';
  }
}

// ==================== REQ-044（任务书 #13）：头像菜单 ====================
function userMenuToggle(e) {
  if (e) e.stopPropagation();
  const dd = document.getElementById('userMenuDropdown');
  if (!dd) return;
  dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

function userMenuClose() {
  const dd = document.getElementById('userMenuDropdown');
  if (dd) dd.style.display = 'none';
}

function userMenuAction(action) {
  userMenuClose();
  // REQ-103（任务书 #36 WP2）：菜单只留退出登录；用户中心/切换公会入口迁用户中心公会卡
  if (action === 'logout') handleSignOut();
}

// 点击外部关闭菜单
document.addEventListener('click', (e) => {
  if (!e.target.closest('#userMenu')) userMenuClose();
});

// Esc 关闭菜单（capture 阶段优先于弹窗栈 ESC：菜单打开时先关菜单，不触发弹窗关闭）
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const dd = document.getElementById('userMenuDropdown');
  if (dd && dd.style.display !== 'none') {
    e.stopImmediatePropagation();
    userMenuClose();
  }
}, true);

// 渲染当前页面
function renderCurrentPage() {
  const activePage = document.querySelector('.nav-item.active');
  const page = activePage ? activePage.getAttribute('data-page') : 'dashboard';
  switch (page) {
    case 'dashboard': renderDashboard(); break;
    case 'members': renderMembers(); break;
    case 'attendance': renderAttendance(); break;
    case 'loot': lootRender(); break; // BUG-034：修正未定义函数名（原 renderLoot 不存在，ReferenceError）
    case 'wishlist': wishlistRender(); break; // 同上（原 renderWishlist）
    case 'reports': renderReports(); break;
    case 'data': renderDataPage(); break;
  }
}

// ==================== REQ-100（任务书 #32 F2）：dashboard 最近活动点击 → 考勤 tab 定位高亮 ====================
// 决策①（运营放行）：跳转当次自动勾选「含已取消」+ 清空其余筛选，只动当次筛选态（不写任何存储）；
//   跳转成功不弹 toast；「该活动已被删除」toast 严格限定 appData 真不存在的场景。
// 决策②（运营放行）：当次强制列表视图渲染定位——不落记忆键、不改写用户视图偏好（BUG-023 记忆逻辑零改动），
//   用户事后手动切日历视图行为与现状完全一致。
function gotoActivityInAttendance(activityId) {
  const exists = appData.activities.some(a => a.id === activityId);
  switchPage('attendance');
  if (!exists) {
    // 真删除：落 tab 顶部 + toast（严格限定此场景）
    const main = document.getElementById('mainContent');
    if (main) main.scrollTop = 0;
    showToast('该活动已被删除', 'warning');
    return;
  }
  // 决策①：当次筛选态复位 + 含已取消（DOM 与 attFilter 对象经 attFilterChange 同步，保证目标卡片必渲染）
  document.getElementById('attFilterMember').value = '';
  document.querySelectorAll('#attFilterStatuses input').forEach(cb => { cb.checked = false; });
  document.getElementById('attFilterRange').value = 'all';
  document.getElementById('attFilterFrom').value = '';
  document.getElementById('attFilterTo').value = '';
  document.getElementById('attFilterIncludeCancelled').checked = true;
  attFilterChange(); // 内部重读 DOM → 同步 attFilter → renderActivityList
  // 决策②：当次强制列表视图（手动同步 tab/容器显隐，不碰 getAttendanceView 记忆键）
  document.querySelectorAll('.view-tab').forEach((tab, i) => {
    tab.classList.toggle('active', i === 1); // i=1 为列表视图 tab
  });
  document.getElementById('calendarView').style.display = 'none';
  document.getElementById('listView').style.display = 'block';
  // 定位 + 高亮 1.8s（卡片标识 = data-activity-id，renderActivityList 渲染）
  const card = document.querySelector(`#activityList .activity-item[data-activity-id="${activityId}"]`);
  if (!card) { console.warn('[REQ-100] 活动存在但卡片未渲染（异常兜底，静默）:', activityId); return; }
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('activity-jump-highlight');
  setTimeout(() => card.classList.remove('activity-jump-highlight'), 1800);
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
    toast.style.transform = 'translateY(-100%)'; // 任务书 #19 WP2：顶部居中后向上滑出
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// BUG-030（任务书 #12 补丁）：数据模块加载失败的页面可见提示（cloud.js loadCloudData 调用）
window.showLoadFailureBanner = function (failedTables) {
  const banner = document.getElementById('loadFailureBanner');
  const text = document.getElementById('loadFailureText');
  if (!banner || !text) return;
  const names = { members: '成员', activities: '考勤活动', loots: '装备', wishlists: '心愿单' };
  const label = (failedTables || []).map(t => names[t] || t).join('、');
  text.textContent = `⚠ 部分数据加载失败（${label}），显示的可能不是最新数据。`;
  banner.style.display = 'flex';
};

// ==================== 页面切换 ====================
const pageTitles = {
  dashboard: '仪表盘',
  members: '成员管理',
  attendance: '考勤记录',
  loot: '装备分配',
  wishlist: '心愿单',
  reports: '统计报表',
  data: '数据管理',
  changelog: '更新日志',
  datacenter: '数据中心',
  lootdrop: '副本掉落' // 任务书 #28 WP5（REQ-086）：原「数据公示」更名 + 双壳嵌入
};

// ==================== 任务书 #42（REQ-105/107）：用户偏好包 ====================
// 服务端持久化（user_profiles.preferences jsonb 单列，sql/27），跨设备同步；
// 键：nav_order（侧栏导航顺序，页签 key 数组）/ calendar_density（日历密度 compact=紧凑默认 / comfortable=舒适）。
// 登录/切公会后加载偏好入内存并按偏好重排导航 + 刷日历密度（不阻塞界面，同 MasterData.init 先例）
async function loadUserPreferences() {
  if (!window.CloudSync || !CloudSync.loadPreferences) return;
  await CloudSync.loadPreferences();
  applyNavOrder();
  paintCalendarDensity(getCalendarDensity());
}

// ---- WP2：REQ-105 侧栏导航拖拽排序（零依赖原生 HTML5 DnD） ----
// nav key = data-page（页签项）；「用户中心」无 data-page，以 data-navkey="usercenter" 参与；
// 「问题反馈」按钮与版本号区在 .sidebar-footer，非 .nav-menu .nav-item，不参与排序。
// 默认序 = DOM 原序（无偏好时）；nav_order 数组外残留 key 忽略、缺失 key 追加尾部（防版本演进键对不上卡死）。
// BUG-078（任务书 #44 WP1）：DOM 原序须在任何重排前快照——「无偏好=当前 DOM 序」在拖拽重排后已失真
// （DOM 残留上一账号的序，同浏览器换号登录被当成默认序，即导航串号病灶）；无偏好时回快照默认序。
let defaultNavOrder = null;
function navKeyOf(item) { return item.dataset.page || item.dataset.navkey || ''; }
function currentNavOrder() {
  return [...document.querySelectorAll('.nav-menu .nav-item')].map(navKeyOf).filter(Boolean);
}
function applyNavOrder(forced) {
  const menu = document.querySelector('.nav-menu');
  if (!menu) return;
  const pref = forced || (window.CloudSync && CloudSync.getPreference ? CloudSync.getPreference('nav_order', null) : null);
  // 无偏好 → 回默认序快照（不再早退：DOM 可能残留上一账号的序，BUG-078）
  const order = (Array.isArray(pref) && pref.length) ? pref : defaultNavOrder;
  if (!Array.isArray(order) || !order.length) return;
  const items = [...menu.querySelectorAll('.nav-item')];
  const byKey = {};
  items.forEach(it => { const k = navKeyOf(it); if (k && !byKey[k]) byKey[k] = it; });
  const used = new Set();
  order.forEach(k => { // 数组外残留 key（已下线页签）忽略
    if (byKey[k] && !used.has(k)) { menu.appendChild(byKey[k]); used.add(k); }
  });
  items.forEach(it => { const k = navKeyOf(it); if (!used.has(k)) menu.appendChild(it); }); // 缺失 key 按原序追加尾部
}
let navDragEl = null;
let navOrderBeforeDrag = null;
function refreshNavDraggable() {
  // 移动端/触屏（<768px 或 hover 不可用）禁用拖拽，仅桌面
  const desktop = window.innerWidth > 768 && !(window.matchMedia && window.matchMedia('(hover: none)').matches);
  document.querySelectorAll('.nav-menu .nav-item').forEach(it => { it.draggable = desktop; });
}
function initNavDragSort() {
  const menu = document.querySelector('.nav-menu');
  if (!menu) return;
  defaultNavOrder = currentNavOrder(); // BUG-078：任何重排前快照 DOM 原序（本函数在脚本末尾执行，早于一切登录/拖拽）
  refreshNavDraggable();
  window.addEventListener('resize', refreshNavDraggable);
  menu.addEventListener('dragstart', (e) => {
    const item = e.target.closest && e.target.closest('.nav-item');
    if (!item || !item.draggable) { e.preventDefault(); return; }
    navDragEl = item;
    navOrderBeforeDrag = currentNavOrder(); // 写库失败回滚用
    item.classList.add('nav-dragging'); // 半透明占位
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', navKeyOf(item)); } catch {}
  });
  menu.addEventListener('dragover', (e) => {
    if (!navDragEl) return;
    e.preventDefault(); // 允许 drop
    e.dataTransfer.dropEffect = 'move';
    const after = [...menu.querySelectorAll('.nav-item:not(.nav-dragging)')].find(it => {
      const r = it.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    // 拖动中实时插入位重排（指示 = 半透占位 + 实时位移，零额外指示元素）
    if (after) menu.insertBefore(navDragEl, after); else menu.appendChild(navDragEl);
  });
  menu.addEventListener('drop', (e) => { if (navDragEl) e.preventDefault(); });
  menu.addEventListener('dragend', () => {
    if (!navDragEl) return;
    navDragEl.classList.remove('nav-dragging');
    navDragEl = null;
    persistNavOrder(); // 防抖口径：落定一次写，拖拽过程零打库
  });
}
async function persistNavOrder() {
  const order = currentNavOrder();
  try {
    await CloudSync.savePreference('nav_order', order);
  } catch (e) {
    console.error('导航顺序保存失败:', e);
    showToast('导航顺序保存失败，已还原', 'error');
    applyNavOrder(navOrderBeforeDrag); // 界面回滚到拖拽前序（禁假成功）
  }
}

// ---- WP3：REQ-107 考勤日历密度切换（紧凑=默认 / 舒适=现状方形格原样） ----
function getCalendarDensity() {
  const v = window.CloudSync && CloudSync.getPreference ? CloudSync.getPreference('calendar_density', 'compact') : 'compact';
  return v === 'comfortable' ? 'comfortable' : 'compact';
}
function paintCalendarDensity(d) {
  const days = document.getElementById('calendarDays');
  if (days) days.classList.toggle('cal-compact', d === 'compact');
  document.querySelectorAll('.cal-density-btn').forEach(b => b.classList.toggle('active', b.dataset.density === d));
}
async function setCalendarDensity(d) {
  const prev = getCalendarDensity();
  if (d === prev) return;
  paintCalendarDensity(d); // 切换即时生效免刷新（列表视图不受影响）
  try {
    await CloudSync.savePreference('calendar_density', d);
  } catch (e) {
    console.error('日历密度保存失败:', e);
    paintCalendarDensity(prev); // 写失败界面回滚旧值（禁假成功）
    showToast('日历密度保存失败，已还原', 'error');
  }
}

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
  if (pageName === 'attendance') {
    // REQ-011：进入考勤页时按上次选择同步视图（默认列表）
    syncAttendanceViewUI();
  }
  if (pageName === 'loot') {
    lootRender();
  }
  if (pageName === 'wishlist') {
    wishlistRender();
  }
  if (pageName === 'changelog') {
    changelogRender();
  }
  // 任务书 #14：数据中心仅超管可进（非超管即使绕过 tab 隐藏也被拦回）
  if (pageName === 'datacenter') {
    if (!window.MasterData || !MasterData.isSuperadmin()) {
      showToast('数据中心仅产品超管可用', 'warning');
      switchPage('dashboard');
      return;
    }
    renderDatacenter();
  }
  
  // 任务书 #28 WP5：副本掉落 tab——首次切入懒挂载渲染层（DPLootDrop.mount 挂 page-lootdrop 容器），
  // 此后切入 activate() 重测特效溢出（tab 隐藏期间 resize 被可见性守卫跳过，归来校正）
  if (pageName === 'lootdrop') {
    ensureLootdropMounted();
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

// 任务书 #28 WP5：副本掉落 tab 懒挂载（双壳之登录壳；渲染层 js/dataPublic.js 与公开页 data.html 同源单一真源）
let lootdropMounted = false;
function ensureLootdropMounted() {
  if (!window.DPLootDrop) return;
  if (!lootdropMounted) {
    lootdropMounted = true;
    DPLootDrop.mount(document.getElementById('page-lootdrop'));
  } else {
    DPLootDrop.activate();
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
// 弹窗防误关（任务书 #9，开发规范第四章第 6 条）：
// 含未保存编辑内容的弹窗，点击遮罩/按 ESC 时不直接关闭，二次确认后才放弃；
// 无编辑内容或未登记的弹窗维持现状。新弹窗必须在 modalDirtyChecks 登记判定函数。
const modalFormSnapshots = {};

// 打开时快照表单值（input/select/textarea，按元素 id 记录）
function snapshotModalForm(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  const snap = {};
  modal.querySelectorAll('input, select, textarea').forEach(el => {
    if (el.id) snap[el.id] = el.type === 'checkbox' ? el.checked : el.value;
  });
  modalFormSnapshots[modalId] = snap;
}

// 当前表单值与快照比对，任一字段不同即视为有未保存编辑
function isModalFormDirty(modalId) {
  const snap = modalFormSnapshots[modalId];
  const modal = document.getElementById(modalId);
  if (!snap || !modal) return false;
  let dirty = false;
  modal.querySelectorAll('input, select, textarea').forEach(el => {
    if (!el.id || !(el.id in snap)) return;
    const cur = el.type === 'checkbox' ? el.checked : el.value;
    if (cur !== snap[el.id]) dirty = true;
  });
  return dirty;
}

// 各弹窗"有未保存内容"判定；未登记的弹窗遮罩点击/ESC 直接关闭（维持现状）
const modalDirtyChecks = {
  importMembersModal: () => isModalFormDirty('importMembersModal') || importPreviewRows.length > 0,
  // REQ-048：聚合确认弹窗——改动过勾选（与默认全选快照不一致）才算未保存内容
  importRestoreModal: () => isModalFormDirty('importRestoreModal'),
  // REQ-033：同步预览弹窗内改过状态/忽略过角色即视为有未确认数据
  wclSyncModal: () => wclSyncDirty || isModalFormDirty('wclSyncModal'),
  memberModal: () => isModalFormDirty('memberModal'),
  // 任务书 #27 WP2：彻底删除确认弹窗——输名输入框有内容即算未保存
  memberHardDeleteModal: () => isModalFormDirty('memberHardDeleteModal'),
  // 任务书 #35 WP1（BUG-074）：批量彻底删除确认弹窗——确认词输入框有内容即算未保存
  memberBatchHardDeleteModal: () => isModalFormDirty('memberBatchHardDeleteModal'),
  activityModal: () => isModalFormDirty('activityModal'),
  lootModal: () => isModalFormDirty('lootModal'),
  // REQ-094（任务书 #29 WP1）：用户中心含可编辑字段（显示名/修改密码表单），纳入防误关
  userCenterModal: () => isModalFormDirty('userCenterModal'),
  // 公会设置：成员角色变更即时保存不算未保存内容，只跟踪公会资料三字段
  guildSettingsModal: () => {
    const g = (window.CloudSync && window.CloudSync.getCurrentGuild()) || {};
    const claimerEl = document.getElementById('guildShowClaimerLabel');
    const claimModeEl = document.getElementById('guildClaimMode');
    return document.getElementById('guildProfileDesc').value !== (g.description || '') ||
      document.getElementById('guildProfileLootRuleType').value !== (g.loot_rule_type || '') ||
      document.getElementById('guildProfileLootRuleText').value !== (g.loot_rule_text || '') ||
      // 任务书 #18 WP2 R4：认领人标签开关同样纳入未保存判定（默认开）
      (claimerEl && claimerEl.checked !== (g.show_claimer_label !== false)) ||
      // 任务书 #21 WP2：认领方式三档纳入未保存判定（默认 free）
      (claimModeEl && claimModeEl.value !== (g.claim_mode || 'free'));
  }
};

// 遮罩点击/ESC 的统一关闭入口：有未保存内容时二次确认
function requestCloseModal(id) {
  const check = modalDirtyChecks[id];
  if (check && check() && !confirm('内容未保存，确定放弃吗？')) return;
  closeModal(id);
}

function openModal(id) {
  const el = document.getElementById(id);
  el.classList.add('show');
  // BUG-033：压栈并置顶（重复打开同弹窗先出栈再压栈，保持唯一）
  const si = modalStack.indexOf(id);
  if (si !== -1) modalStack.splice(si, 1);
  modalStack.push(id);
  modalApplyStacking();
  snapshotModalForm(id);
}

function closeModal(id) {
  const el = document.getElementById(id);
  el.classList.remove('show');
  el.style.zIndex = '';
  const si = modalStack.indexOf(id);
  if (si !== -1) modalStack.splice(si, 1);
}

// BUG-033（任务书 #12 补丁3）：弹窗栈统一管理——任何 openModal 都把弹窗置顶，
// z-index 按打开顺序递增（基数 1000 同 CSS，步进 2；上限远低于 toast 的 2000）。
// 全站弹窗一律走 openModal/closeModal，禁止个别弹窗写死 z-index。
const modalStack = [];

function modalApplyStacking() {
  modalStack.forEach((id, idx) => {
    const el = document.getElementById(id);
    if (el) el.style.zIndex = String(1000 + (idx + 1) * 2);
  });
}

// 点击遮罩关闭弹窗（防误关：走 requestCloseModal 二次确认）
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      requestCloseModal(overlay.id);
    }
  });
});

// ESC 关闭最上层弹窗（BUG-033：以弹窗栈栈顶为准，同样走二次确认）
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!modalStack.length) return;
  requestCloseModal(modalStack[modalStack.length - 1]);
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
  // REQ-108（任务书 #34 WP3）：看板细分——团员卡细分「正式/替补/试用/离队」（0 段不显示，分隔符随显示段动态拼接）；
  // 本月活动卡追加「取消 X 个」（0 不显示）。数据源与既有看板同链（appData 现算），无新增缓存。
  const normMemberStatus = m => {
    const s = (m.status || '').trim();
    return s === 'active' ? '正式' : s === 'inactive' ? '离队' : s; // 兼容存量英文状态（与成员列表徽标同口径）
  };
  const memberSegText = ['正式', '替补', '试用', '离队']
    .map(s => ({ s, n: appData.members.filter(m => normMemberStatus(m) === s).length }))
    .filter(x => x.n > 0)
    .map(x => `${x.s} ${x.n}`).join(' · ');
  const monthCancelled = monthActivities.filter(a => a.status === 'cancelled').length;
  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card">
      <div class="stat-icon">👥</div>
      <div class="stat-value">${members.length}</div>
      <div class="stat-label">团员总数</div>
      ${memberSegText ? `<div class="stat-sub" id="statSubMembers">${memberSegText}</div>` : ''}
    </div>
    <div class="stat-card">
      <div class="stat-icon">📅</div>
      <div class="stat-value">${monthActivities.length}</div>
      <div class="stat-label">本月活动次数</div>
      ${monthCancelled > 0 ? `<div class="stat-sub" id="statSubCancelled">取消 ${monthCancelled} 个</div>` : ''}
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
    // REQ-100（任务书 #32 F1）：状态徽标一级可见——判定来源 = 既有 activities.status（REQ-020），禁新造语义；
    // 已取消条目整体灰化降饱和 + 「已取消」高对比实色徽标
    const isCancelled = a.status === 'cancelled';
    // REQ-100（任务书 #32 F2）：区域纯预览——条目无操作按钮，点击跳转考勤 tab 定位高亮（不再开考勤详情弹窗）
    return `
      <div class="recent-item${isCancelled ? ' recent-cancelled' : ''}" onclick="gotoActivityInAttendance('${a.id}')">
        <div>
          <div class="recent-date">${a.date} <span class="tag ${isCancelled ? 'recent-status-cancelled' : 'tag-green'}">${isCancelled ? '已取消' : '正常'}</span></div>
          <div class="recent-raid">${a.raid_name}</div>
        </div>
        <div class="recent-count">${presentCount} 人</div>
      </div>
    `;
  }).join('') : `<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-text">暂无活动记录</div></div>`;
  document.getElementById('recentList').innerHTML = recentHtml;
  
  // Top5 排行（BUG-014：用全量活动，与成员列表/报表同算法）
  renderRankList('rankListTop5', 5, appData.activities);
}

// BUG-014：全站出勤率唯一算法源（成员列表 / Top5 / 统计报表 / 仪表盘平均必须同源）。
// 统一口径：出勤率 = 出勤次数 ÷ 应到次数
//   出勤 = 出席 + 迟到 + 替补（替补按出勤计）
//   应到 = 该成员有考勤记录（任意状态）的活动数；无记录的活动不计入应到
//   请假 / 缺席：计入应到，不计入出勤
// REQ-020：已取消活动（status === 'cancelled'）的考勤不计入应到与出勤；
// 只过滤统计不过滤数据，DB 记录保留，活动恢复正常即重新计入。
function getAttendanceStatsCore(activities, matchFn) {
  let present = 0, absent = 0, late = 0, sub = 0, leave = 0, total = 0;
  (activities || []).forEach(act => {
    if (act.status === 'cancelled') return; // REQ-020：已取消活动不参与统计
    const attendee = (act.attendees || []).find(matchFn);
    if (!attendee) return; // 未标记：不计入应到
    total++;
    switch (attendee.status) {
      case '出席': present++; break;
      case '缺席': absent++; break;
      case '迟到': late++; present++; break; // 迟到算出勤
      case '替补': sub++; present++; break;  // 替补按出勤计
      case '请假': leave++; break;           // 请假计入应到，不计入出勤
    }
  });
  const rate = total > 0 ? Math.round((present / total) * 100) : 0;
  return { present, absent, late, sub, leave, total, rate };
}

function getAttendanceStats(memberId, activities) {
  return getAttendanceStatsCore(activities, a => a.member_id === memberId);
}

// 任务书 #27 WP2：已删除成员的考勤仍计入历史出勤率（统计口径硬指标）——
// member_id 为空的考勤行按 member_name 快照聚合成伪成员，报表中灰色「已删除」展示
function getDeletedMemberStats(activities) {
  const names = new Set();
  (activities || []).forEach(act => (act.attendees || []).forEach(a => {
    if (!a.member_id && a.member_name) names.add(a.member_name);
  }));
  return [...names].map(name => ({
    member: { id: 'deleted:' + name, name, class: '', deleted: true },
    ...getAttendanceStatsCore(activities, a => !a.member_id && a.member_name === name),
  }));
}

function calculateAvgAttendanceRate(activities) {
  // BUG-014：与成员级口径同源 = 全成员（非离队）出勤率的平均
  const members = appData.members.filter(m => m.status !== '离队');
  if (!members.length || !activities.length) return 0;
  const sum = members.reduce((acc, m) => acc + getAttendanceStats(m.id, activities).rate, 0);
  return Math.round(sum / members.length);
}

function renderRankList(containerId, limit, activities) {
  const rankings = getAttendanceRankings(activities);
  const top = rankings.slice(0, limit);
  
  const html = top.length ? top.map((item, i) => `
    <div class="rank-item">
      <div class="rank-num">${i + 1}</div>
      <div class="rank-name class-${classMap[item.member.class] || ''}">${memberDisplayName(item.member)}</div>
      <div class="rank-rate">${item.rate}%</div>
    </div>
  `).join('') : `<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-text">暂无数据</div></div>`;
  
  document.getElementById(containerId).innerHTML = html;
}

// BUG-014：活动集由调用方显式传入（仪表盘 Top5 传全量；统计报表传用户自选范围），
// 不再隐式依赖报表页的 reportRange，算法统一走 getAttendanceStats。
function getAttendanceRankings(activities, includeDeleted) {
  const members = appData.members.filter(m => m.status !== '离队');

  const rows = members.map(member => {
    const stats = getAttendanceStats(member.id, activities);
    return { member, ...stats };
  });
  // 任务书 #27 WP2：报表口径含已删除成员伪行（仪表盘 Top5 不传 includeDeleted，与离队同规则不含）
  if (includeDeleted) rows.push(...getDeletedMemberStats(activities));
  return rows.sort((a, b) => b.rate - a.rate || b.present - a.present);
}

function getFilteredActivities() {
  if (reportRange === 0) return appData.activities;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - reportRange);
  return appData.activities.filter(a => new Date(a.date) >= cutoff);
}

// ==================== 成员管理 ====================
// REQ-042（软删除）：成员列表默认隐藏已离队成员（开关状态存模块变量，不持久化）
let showDepartedMembers = false;
function memberToggleShowDeparted(checked) {
  showDepartedMembers = checked;
  renderMembers();
}

// 任务书 #18 WP2：认领人显示名缓存（user_id → display_name，来源 guild_members）
// 心愿单/装备列表的认领人标签与成员编辑弹窗的认领人下拉共用；按公会缓存，切公会自动重取。
const claimerNames = { guildId: null, map: null, loading: false };

// 异步版：确保当前公会的认领人名单已加载（渲染链路用，完成后重渲染当前页）
function ensureClaimerNames() {
  const g = window.CloudSync.getCurrentGuild();
  if (!g || claimerNames.loading || claimerNames.guildId === g.id) return;
  claimerNames.loading = true;
  window.CloudSync.getGuildMembers()
    .then(ms => {
      claimerNames.guildId = g.id;
      claimerNames.map = new Map((ms || []).map(m => [m.user_id, m.display_name || '']));
    })
    .catch(e => console.error('认领人名单加载失败:', e))
    .finally(() => {
      claimerNames.loading = false;
      try { renderCurrentPage(); } catch (e) { /* 页面已切换时忽略 */ }
    });
}

// 同步版：await 到名单就绪（编辑弹窗打开前用，避免下拉缺项误清认领人）
async function ensureClaimerNamesAsync() {
  const g = window.CloudSync.getCurrentGuild();
  if (!g || claimerNames.guildId === g.id) return;
  if (claimerNames.loading) {
    for (let i = 0; i < 50 && claimerNames.loading; i++) await new Promise(r => setTimeout(r, 100));
    return;
  }
  claimerNames.loading = true;
  try {
    const ms = await window.CloudSync.getGuildMembers();
    claimerNames.guildId = g.id;
    claimerNames.map = new Map((ms || []).map(m => [m.user_id, m.display_name || '']));
  } catch (e) {
    console.error('认领人名单加载失败:', e);
  } finally {
    claimerNames.loading = false;
  }
}

// ==================== 任务书 #21 WP2：认领治理三档 ====================

// 当前公会认领方式（claim_mode 列未迁移时按 free，不改变现状）
function getClaimMode() {
  const g = window.CloudSync.getCurrentGuild();
  return (g && g.claim_mode) || 'free';
}

// 我的 pending 认领申请（approval 模式下成员行显示「认领审核中」）；按公会缓存
const myClaimRequests = { guildId: null, memberIds: new Set(), loading: false };

function ensureMyClaimRequests() {
  const g = window.CloudSync.getCurrentGuild();
  if (!g || getClaimMode() !== 'approval') return;
  if (myClaimRequests.loading || myClaimRequests.guildId === g.id) return;
  myClaimRequests.loading = true;
  window.CloudSync.getMyPendingClaimRequests()
    .then(rows => {
      // 切公会竞态：以当前公会为准
      const cur = window.CloudSync.getCurrentGuild();
      if (!cur || cur.id !== g.id) return;
      myClaimRequests.guildId = g.id;
      myClaimRequests.memberIds = new Set((rows || []).map(r => r.member_id));
    })
    .catch(e => console.error('我的认领申请加载失败:', e))
    .finally(() => {
      myClaimRequests.loading = false;
      renderMembers();
    });
}

// owner/editor 审批列表缓存（approval 模式下成员管理顶部审核区块）
const guildClaimRequests = { guildId: null, rows: null, loading: false };

function ensureGuildClaimRequests() {
  const g = window.CloudSync.getCurrentGuild();
  if (!g || getClaimMode() !== 'approval' || !window.CloudSync.canEdit()) return;
  if (guildClaimRequests.loading || guildClaimRequests.guildId === g.id) return;
  guildClaimRequests.loading = true;
  window.CloudSync.getGuildPendingClaimRequests()
    .then(rows => {
      const cur = window.CloudSync.getCurrentGuild();
      if (!cur || cur.id !== g.id) return;
      guildClaimRequests.guildId = g.id;
      guildClaimRequests.rows = rows || [];
    })
    .catch(e => console.error('认领审核列表加载失败:', e))
    .finally(() => {
      guildClaimRequests.loading = false;
      renderClaimReviewBlock();
    });
}

// 审批/申请动作后统一刷新：审批列表 + 我的申请 + 成员表 + 审核区块
async function reloadClaimGovernance() {
  const g = window.CloudSync.getCurrentGuild();
  if (!g) return;
  guildClaimRequests.guildId = null;
  myClaimRequests.guildId = null;
  try {
    if (window.CloudSync.canEdit()) {
      guildClaimRequests.rows = await window.CloudSync.getGuildPendingClaimRequests();
      guildClaimRequests.guildId = g.id;
    }
    const mine = await window.CloudSync.getMyPendingClaimRequests();
    myClaimRequests.memberIds = new Set((mine || []).map(r => r.member_id));
    myClaimRequests.guildId = g.id;
  } catch (e) {
    console.error('认领治理状态刷新失败:', e);
  }
  renderClaimReviewBlock();
  renderMembers();
}

// 认领审核区块（仅 approval 模式 + owner/editor + 有待审申请时显示）
function renderClaimReviewBlock() {
  const el = document.getElementById('claimReviewBlock');
  if (!el) return;
  const rows = (getClaimMode() === 'approval' && window.CloudSync.canEdit() && guildClaimRequests.rows) || [];
  if (!rows.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
  ensureClaimerNames();
  el.style.display = '';
  el.innerHTML = `
    <div class="claim-review-head">认领审核 <span class="tag tag-yellow">${rows.length} 待审</span></div>
    ${rows.map(r => {
      const m = (appData.members || []).find(x => x.id === r.member_id);
      const applicant = (claimerNames.map && claimerNames.map.get(r.user_id)) || '（已退会用户）';
      return `<div class="claim-review-row">
        <span class="claim-review-text"><b>${applicant}</b> 申请认领 <b>${m ? memberDisplayName(m) : '（成员已删除）'}</b></span>
        <span class="claim-review-actions">
          <button class="btn btn-sm btn-primary" onclick="approveClaimRequest('${r.id}')">批准</button>
          <button class="btn btn-sm btn-danger" onclick="rejectClaimRequest('${r.id}')">拒绝</button>
        </span>
      </div>`;
    }).join('')}`;
}

// 批准认领：并发护栏——批准前重查成员最新认领态，已被抢则明确报错不覆盖
async function approveClaimRequest(requestId) {
  const r = (guildClaimRequests.rows || []).find(x => x.id === requestId);
  if (!r) return;
  const g = window.CloudSync.getCurrentGuild();
  try {
    const fresh = await window.CloudSync.getRaidMemberClaimState(r.member_id);
    if (fresh && fresh.user_id) {
      showToast('批准失败：该角色刚已被认领，未覆盖。请核实后处理该申请', 'error');
      await reloadClaimGovernance();
      return;
    }
    await window.CloudSync.setRaidMemberClaim(r.member_id, r.user_id);
    await window.CloudSync.resolveClaimRequest(requestId, 'approved');
    const m = (appData.members || []).find(x => x.id === r.member_id);
    await window.CloudSync.createClaimResultNotification(g.id, r.user_id, m ? m.name : '该角色', true);
    await window.CloudSync.reloadData('members');
    saveData();
    await reloadClaimGovernance();
    showToast(`已批准：${m ? m.name : '该角色'} 的认领`, 'success');
  } catch (e) {
    console.error('批准认领失败:', e);
    showToast('批准失败: ' + (e.message || '未知错误'), 'error');
  }
}

// 拒绝认领申请
async function rejectClaimRequest(requestId) {
  const r = (guildClaimRequests.rows || []).find(x => x.id === requestId);
  if (!r) return;
  const g = window.CloudSync.getCurrentGuild();
  try {
    await window.CloudSync.resolveClaimRequest(requestId, 'rejected');
    const m = (appData.members || []).find(x => x.id === r.member_id);
    await window.CloudSync.createClaimResultNotification(g.id, r.user_id, m ? m.name : '该角色', false);
    await reloadClaimGovernance();
    showToast('已拒绝该认领申请', 'success');
  } catch (e) {
    console.error('拒绝认领失败:', e);
    showToast('拒绝失败: ' + (e.message || '未知错误'), 'error');
  }
}

// 任务书 #18 WP2 R4：认领人小字标签（公会开关 show_claimer_label 关闭时不渲染；
// 成员找不到时不渲染——历史装备的成员可能已被彻底删除，无法判定认领态）
function claimerLabelHtml(member) {
  if (!member) return '';
  const g = window.CloudSync.getCurrentGuild();
  if (!g || g.show_claimer_label === false) return '';
  ensureClaimerNames();
  const uid = member.user_id;
  // 任务书 #21-补丁 B：认领人灰色小字第二行不折行（成员管理名称单元格/心愿单/装备分配共用）
  const text = uid ? `认领人：${(claimerNames.map && claimerNames.map.get(uid)) || '（已退会用户）'}` : '未认领';
  return `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;white-space:nowrap">${text}</div>`;
}


function renderMembers() {
  const search = document.getElementById('memberSearch').value.toLowerCase();
  const classFilter = document.getElementById('classFilter').value;
  // 任务书 #18 WP2：认领/解除认领按钮按当前用户判定
  const currentUserId = (window.CloudSync.getCachedUser() || {}).id || null;
  // 任务书 #21 WP2：认领治理三档——approval 模式加载申请状态（我的申请 + 审批列表）
  const claimMode = getClaimMode();
  if (claimMode === 'approval') {
    ensureMyClaimRequests();
    ensureGuildClaimRequests();
  }
  const canEditMembers = window.CloudSync.canEdit();
  
  // 职责过滤：获取所有勾选的职责
  const roleCheckboxes = document.querySelectorAll('#roleFilter input[type="checkbox"]:checked');
  const roleFilter = Array.from(roleCheckboxes).map(cb => cb.value);
  
  let filtered = appData.members.filter(m => {
    const mainSpec = m.main_spec || '';
    const offSpecs = m.off_specs || (m.off_spec ? [m.off_spec] : []);
    const offSpecText = offSpecs.join('、');
    // BUG-034：坏数据（如 name 为空）不能拖垮整表渲染——整表 innerHTML 一次性赋值，
    // 任何一行抛错都会让表格停留在上一次渲染（表现为"出勤率列全是旧值"）
    const mname = m.name || '';
    const matchSearch = !search || mname.toLowerCase().includes(search) || (m.class || '').includes(search) || mainSpec.toLowerCase().includes(search) || offSpecText.toLowerCase().includes(search);
    const matchClass = !classFilter || m.class === classFilter;
    // 职责匹配：成员职责 = 按主/副专精推导的职责集合（REQ-009 deriveMemberRoles，可有多职责），
    // 多选为 AND 语义——成员职责集合 ⊇ 选中集合才被筛出（任务书 #23-补丁2 修正项②：不再读存档 role 字段）；未勾选则不过滤
    const memberRoles = deriveMemberRoles(m);
    const matchRole = roleFilter.length === 0 || roleFilter.every(r => memberRoles.includes(r));
    return matchSearch && matchClass && matchRole;
  });

  // REQ-042（软删除）：默认隐藏已离队成员；
  // REQ-049（任务书 #13）：开启「显示已离队」时活跃成员区在上、离队成员集中底部（分隔标题行），关闭时整组隐藏
  const activeMembers = filtered.filter(m => m.status !== '离队');
  const departedMembers = showDepartedMembers ? filtered.filter(m => m.status === '离队') : [];
  const displayList = departedMembers.length
    ? [...activeMembers, { __divider: true }, ...departedMembers]
    : activeMembers;

  const tbody = document.getElementById('membersTableBody');

  if (!displayList.length) {
    tbody.innerHTML = `<tr><td colspan="11"><div class="empty-state"><div class="empty-icon">👥</div><div class="empty-text">暂无成员数据</div><button class="btn btn-primary" onclick="showMemberModal()">+ 添加第一个成员</button></div></td></tr>`;
    memberUpdateBatchToolbar();
    return;
  }

  tbody.innerHTML = displayList.map((m, i) => {
    // REQ-049：离队分组分隔标题行
    if (m.__divider) return '<tr class="member-divider-row"><td colspan="11">—— 已离队成员 ——</td></tr>';
    // BUG-034：行级防御——单行异常降级为提示行，不拖垮整表（否则整表停在旧渲染，出勤率列全是旧值）
    try {
    const cls = classMap[m.class] || '';
    const rate = getMemberAttendanceRate(m.id);
    const mainSpec = m.main_spec || '';
    const offSpecs = m.off_specs || (m.off_spec ? [m.off_spec] : []);
    const offSpecText = offSpecs.join('、');
    
    // REQ-009：职责列 = 按主/副专精推导的全部职责，tag 尺寸与职业 tag 一致（.badge）
    const derivedRoles = deriveMemberRoles(m);
    const roleTagsHtml = derivedRoles.length > 0
      ? derivedRoles.map(r => `<span class="badge badge-role-${roleTypeMap[r] || 'dps'}">${roleIconHtml(r)}${r}</span>`).join(' ')
      : '<span style="color:var(--text-muted)">—</span>';
    
    // 专精显示（任务书 #22-补丁 修正项④：职业色 tag 底 + 专精图标 + 专精文字；
    // 副专精多个同行依次排列不折行，与职业 tag 风格统一）
    const specHtml = mainSpec 
      ? `<span class="spec-chip-row">${specChipHtml(m.class, mainSpec)}${offSpecs.map(s => specChipHtml(m.class, s, 'chip-off')).join('')}</span>` 
      : '-';
    
    return `
      <tr${m.status === '离队' ? ' class="member-row-departed"' : ''}>
        <td><input type="checkbox" class="member-row-checkbox" value="${m.id}" ${memberSelectedIds.has(m.id) ? 'checked' : ''} onchange="memberToggleSelect('${m.id}', this.checked)"></td>
        <td class="num">${i + 1}</td>
        <td class="class-${cls}">
          <div style="font-weight:500">${memberDisplayName(m)}</div>
          ${m.user_id ? claimerLabelHtml(m) : ''}
        </td>
        <td style="color:var(--text-secondary)">${(m.server || '').trim() || '—'}</td>
        <td>
          ${classChipHtml(m.class)}
        </td>
        <td style="color:var(--text-secondary)">${specHtml}</td>
        <td>${roleTagsHtml}</td>
        <td class="center"><span class="badge ${m.status === '正式' || m.status?.trim() === 'active' ? 'badge-present' : m.status === '替补' ? 'badge-sub' : m.status === '试用' ? 'badge-late' : 'badge-inactive'}">${(function(){ const s = (m.status || '').trim(); if (s === 'inactive') return '离队'; if (s === 'active') return '正式'; return m.status || '-'; })()}</span></td>
        <td style="color:var(--text-secondary)">${m.join_date || '-'}</td>
        <td class="num"><span style="color:${rate >= 80 ? 'var(--success)' : rate >= 60 ? 'var(--warning)' : 'var(--danger)'};font-weight:600">${rate}%</span></td>
        <td class="center">
          <!-- 任务书 #22-补丁 修正项⑤：操作列整行元素压缩进同一行（.op-cell 不换行，窄屏走横滚兜底） -->
          <div class="op-cell">
            <div class="action-btns">
              <button class="icon-btn" onclick="editMember('${m.id}')" title="编辑">✏️</button>
              ${m.status === '离队'
                ? `<button class="icon-btn" onclick="restoreMember('${m.id}', this)" title="恢复">♻️</button>`
                : `<button class="icon-btn" onclick="deleteMember('${m.id}')" title="离队">🚪</button>`}
              <button class="icon-btn danger" onclick="hardDeleteMember('${m.id}')" title="彻底删除（历史保全，进垃圾桶）">🗑</button>
            </div>
            <div class="claim-btns">
              ${!m.user_id
                ? (claimMode === 'approval' && myClaimRequests.memberIds.has(m.id)
                  ? '<span class="tag tag-yellow">认领审核中</span>'
                  : (claimMode === 'assign' && !canEditMembers
                    ? '<span class="tag tag-grey" title="本公会由管理者统一分配认领">待认领</span>'
                    : `<button class="tag tag-grey claim-pending-btn" onclick="claimMember('${m.id}')">待认领</button>`))
                : (currentUserId && m.user_id === currentUserId
                  ? `<button class="icon-btn" onclick="unclaimMember('${m.id}')" title="解除认领">🔓</button>`
                  : '')}
            </div>
          </div>
        </td>
      </tr>
    `;
    } catch (err) {
      console.error('成员行渲染失败（已降级为提示行）:', m && m.id, err);
      return `<tr><td colspan="11" style="color:var(--danger)">该行数据异常，渲染失败（${(m && (m.name || m.id)) || '未知成员'}），请检查数据</td></tr>`;
    }
  }).join('');

  // REQ-042：剔除已不存在的选中项，同步全选框与批量工具条
  memberSelectedIds.forEach(id => { if (!appData.members.some(m => m.id === id)) memberSelectedIds.delete(id); });
  const selectAllEl = document.getElementById('memberSelectAll');
  if (selectAllEl) {
    // REQ-049 口径对齐（任务书 #35 WP1 附加，行为零变）：全选实际覆盖全部渲染行——活跃区 +
    // 「显示已离队」开启时的离队组行（memberToggleSelectAll 无差别勾选所有渲染行，运营 19 行离队成员即此路径）。
    // 原 checked 判定按活跃区计算与真实行为不符，对齐为全部渲染行。
    const visibleIds = displayList.filter(m => !m.__divider).map(m => m.id);
    selectAllEl.checked = visibleIds.length > 0 && visibleIds.every(id => memberSelectedIds.has(id));
  }
  memberUpdateBatchToolbar();
}

// ==================== REQ-042：成员批量删除 ====================
let memberSelectedIds = new Set();

function memberToggleSelect(id, checked) {
  if (checked) memberSelectedIds.add(id);
  else memberSelectedIds.delete(id);
  memberUpdateBatchToolbar();
}

function memberToggleSelectAll(checked) {
  // REQ-049 口径对齐（任务书 #35 WP1 附加）：覆盖全部渲染行（活跃区 + 可见的离队组行），与工具条双功能配套
  document.querySelectorAll('.member-row-checkbox').forEach(cb => {
    cb.checked = checked;
    if (checked) memberSelectedIds.add(cb.value);
    else memberSelectedIds.delete(cb.value);
  });
  memberUpdateBatchToolbar();
}

function memberClearSelection() {
  memberSelectedIds.clear();
  memberUpdateBatchToolbar();
  renderMembers();
}

function memberUpdateBatchToolbar() {
  const toolbar = document.getElementById('memberBatchToolbar');
  const countEl = document.getElementById('memberBatchCount');
  if (!toolbar) return;
  toolbar.style.display = memberSelectedIds.size > 0 ? 'flex' : 'none';
  if (countEl) countEl.textContent = `已选择 ${memberSelectedIds.size} 人`;
}

// BUG-074（任务书 #35 WP1）：批量离队——REQ-042 软删语义改名归位（status 置「离队」，历史保留可恢复）。
// 仅对选中中的活跃行生效；已离队行跳过并在结果 toast 注明。
function memberBatchDepart() {
  const selected = appData.members.filter(m => memberSelectedIds.has(m.id));
  if (!selected.length) { showToast('未选择任何成员', 'warning'); return; }
  const isDeparted = m => { const s = (m.status || '').trim(); return s === '离队' || s === 'inactive'; };
  const active = selected.filter(m => !isDeparted(m));
  const skipped = selected.length - active.length;
  if (!active.length) { showToast('选中成员均已离队，无需操作', 'warning'); return; }
  openBatchDeleteModal({
    title: `批量离队（${active.length}）`,
    lines: active.map(m => `${memberDisplayName(m)}（${m.class}）`),
    warning: '成员将标记为「离队」（编辑成员可恢复），其历史考勤/装备记录将保留并标记为已离队',
    confirmLabel: '确认离队',
    busyLabel: '离队中...',
    onConfirm: async () => {
      // 规范 1.2.2 批处理例外：并发写库，完成后统一 reload 一次 + 单次 render
      try {
        const results = await Promise.allSettled(
          active.map(m => window.CloudSync.saveCloudData('members', 'update', { ...m, status: '离队', id: m.id }))
        );
        const ok = results.filter(r => r.status === 'fulfilled').length;
        const fail = results.length - ok;
        results.forEach((r, i) => { if (r.status === 'rejected') console.error('批量离队失败:', active[i].name, r.reason); });
        await window.CloudSync.reloadData('members');
        saveData();
        memberSelectedIds.clear();
        closeModal('batchDeleteModal');
        renderMembers();
        const skipNote = skipped ? `，跳过 ${skipped} 名已离队成员` : '';
        if (fail) showToast(`离队完成：成功 ${ok} 人，失败 ${fail} 人${skipNote}`, 'warning');
        else showToast(`已将 ${ok} 个成员标记为离队${skipNote}`, 'success');
      } catch (e) {
        console.error('批量离队后刷新失败:', e);
        showToast('操作可能已提交，但刷新数据失败：' + (e.message || '请手动刷新页面'), 'error');
      }
    }
  });
}

// BUG-074（任务书 #35 WP1）：批量删除（真删）——选中行活跃+离队皆可，走 hardDelete 同链路：
// 考勤/装备 member_id 置 NULL 快照灰显「已删除」、心愿单级联、逐行进垃圾桶（含 history_counts）。
// 确认交互：可滚动名单（名字+职业+状态）+ 历史合计 + 红字警示 + 输「彻底删除」四字解锁。
let pendingBatchHardDelete = null; // { rows: [{ member, counts }] }

async function memberBatchHardDelete() {
  const selected = appData.members.filter(m => memberSelectedIds.has(m.id));
  if (!selected.length) { showToast('未选择任何成员', 'warning'); return; }
  const client = window.CloudSync.getClient();
  if (!client) { showToast('云端未连接，无法校验历史记录', 'error'); return; }
  // 逐行历史计数（与单个 hardDeleteMember 同口径三路 count：考勤按 member_id、心愿按 member_id、
  // 装备按 character_id 或 item_stats->>assignedTo 名字；逐行并发查询）
  let rows;
  try {
    rows = await Promise.all(selected.map(async m => {
      const nameFilter = String(m.name || '').replace(/"/g, '\\"');
      const [att, wish, loot] = await Promise.all([
        client.from('activity_attendance').select('id', { count: 'exact', head: true }).eq('member_id', m.id),
        client.from('wishlists').select('id', { count: 'exact', head: true }).eq('member_id', m.id),
        client.from('loot_records').select('id', { count: 'exact', head: true })
          .or(`character_id.eq.${m.id},item_stats->>assignedTo.eq."${nameFilter}"`),
      ]);
      if (att.error || wish.error || loot.error) throw (att.error || wish.error || loot.error);
      return { member: m, counts: { attendance: att.count || 0, wishlist: wish.count || 0, loot: loot.count || 0 } };
    }));
  } catch (e) {
    console.error('批量历史计数失败:', e);
    showToast('历史记录校验失败，已取消删除（安全起见请稍后重试）', 'error');
    return;
  }
  pendingBatchHardDelete = { rows };
  document.getElementById('batchHardDeleteTitle').textContent = `批量彻底删除成员（${rows.length}）`;
  document.getElementById('batchHardDeleteList').innerHTML = rows.map(({ member: m, counts }) => {
    const s = (m.status || '').trim();
    const statusText = s === 'inactive' ? '离队' : (s || '—');
    return `<div class="batch-delete-item">${memberDisplayName(m)}（${m.class || '—'} · ${statusText}）—— 考勤 ${counts.attendance} / 装备 ${counts.loot} / 心愿 ${counts.wishlist}</div>`;
  }).join('');
  const totals = rows.reduce((acc, r) => ({
    attendance: acc.attendance + r.counts.attendance,
    wishlist: acc.wishlist + r.counts.wishlist,
    loot: acc.loot + r.counts.loot,
  }), { attendance: 0, wishlist: 0, loot: 0 });
  document.getElementById('batchHardDeleteWarnText').textContent =
    `⚠ 合计：考勤 ${totals.attendance} 条 / 装备记录 ${totals.loot} 条 / 心愿 ${totals.wishlist} 条。` +
    '彻底删除后：心愿单随人删除，考勤与装备记录将保留并灰色显示「已删除」，成员数据进垃圾桶可查。此操作不可恢复。';
  const input = document.getElementById('batchHardDeleteConfirmText');
  input.value = '';
  document.getElementById('batchHardDeleteConfirmBtn').disabled = true;
  openModal('memberBatchHardDeleteModal');
}

function batchHardDeleteTextInput() {
  const input = document.getElementById('batchHardDeleteConfirmText');
  document.getElementById('batchHardDeleteConfirmBtn').disabled = input.value.trim() !== '彻底删除';
}

async function confirmBatchHardDelete() {
  if (!pendingBatchHardDelete) return;
  const input = document.getElementById('batchHardDeleteConfirmText');
  if (input.value.trim() !== '彻底删除') return;
  const btn = document.getElementById('batchHardDeleteConfirmBtn');
  btn.disabled = true; btn.textContent = '删除中...';
  try {
    const rows = pendingBatchHardDelete.rows;
    // 规范 1.2.2 批处理例外：Promise.allSettled 并发逐行（垃圾桶写入 + 删行两段同行原子），完成后统一 reload 一次
    const results = await Promise.allSettled(rows.map(r => window.CloudSync.hardDeleteRaidMember(r.member, r.counts)));
    const ok = results.filter(r => r.status === 'fulfilled').length;
    const fail = results.length - ok;
    results.forEach((r, i) => { if (r.status === 'rejected') console.error('批量彻底删除失败:', rows[i].member.name, r.reason); });
    await window.CloudSync.reloadData('members');
    await window.CloudSync.reloadData('activities');
    await window.CloudSync.reloadData('wishlists');
    await window.CloudSync.reloadData('loots');
    saveData();
    memberSelectedIds.clear();
    pendingBatchHardDelete = null;
    closeModal('memberBatchHardDeleteModal');
    renderMembers();
    if (fail) showToast(`彻底删除完成：成功 ${ok} 人，失败 ${fail} 人`, 'warning');
    else showToast(`已彻底删除 ${ok} 个成员，历史记录已保全`, 'success');
  } catch (e) {
    console.error('批量彻底删除后刷新失败:', e);
    showToast('删除可能已提交，但刷新数据失败：' + (e.message || '请手动刷新页面'), 'error');
  } finally {
    btn.disabled = false; btn.textContent = '彻底删除';
  }
}

function getMemberAttendanceRate(memberId) {
  // BUG-014：与 Top5/统计报表/仪表盘同源同算法（全量活动）
  return getAttendanceStats(memberId, appData.activities).rate;
}

function showMemberModal(member = null) {
  editingMemberId = member ? member.id : null;
  document.getElementById('memberModalTitle').textContent = member ? '编辑成员' : '添加成员';
  document.getElementById('memberName').value = member ? member.name : '';
  document.getElementById('memberServer').value = member ? (member.server || '') : ''; // REQ-095：服务器回填/清空
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

  // 任务书 #18 WP2 R1：认领人指定/调整（仅编辑已有成员且 owner/editor 可见）
  const claimGroup = document.getElementById('memberClaimGroup');
  const claimSel = document.getElementById('memberClaimUser');
  if (claimGroup && claimSel) {
    if (member && window.CloudSync.canEdit()) {
      const opts = ['<option value="">未认领</option>'];
      if (claimerNames.map) {
        for (const [uid, dn] of claimerNames.map) {
          opts.push(`<option value="${uid}">${dn || uid}</option>`);
        }
      }
      // 认领人已退出公会（不在 guild_members 名单）时保留原值占位
      if (member.user_id && !(claimerNames.map && claimerNames.map.has(member.user_id))) {
        opts.push(`<option value="${member.user_id}">（已退会用户）</option>`);
      }
      claimSel.innerHTML = opts.join('');
      claimSel.value = member.user_id || '';
      claimGroup.style.display = '';
    } else {
      claimGroup.style.display = 'none';
    }
  }

  openModal('memberModal');
}

// 职业变更时更新专精下拉选项
function onMemberClassChange() {
  const cls = document.getElementById('memberClass').value;
  const specs = getGameSpecs(cls); // 任务书 #14：专精读主数据，未加载回退常量
  
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
  const specs = getGameSpecs(cls); // 任务书 #14：专精读主数据，未加载回退常量
  
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
  if (!member) return;
  // 任务书 #18 WP2 R1：owner/editor 编辑时认领人下拉需先就绪名单，避免缺项误清
  if (window.CloudSync.canEdit()) {
    ensureClaimerNamesAsync().then(() => showMemberModal(member));
    return;
  }
  showMemberModal(member);
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
  const server = (document.getElementById('memberServer').value || '').trim(); // REQ-095：服务器（可空，空存 ''）
  const cls = document.getElementById('memberClass').value;

  if (!name) { showToast('请输入角色名', 'error'); memberSaving = false; if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset.originalText || '保存'; } return; }
  if (!cls) { showToast('请选择职业', 'error'); memberSaving = false; if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset.originalText || '保存'; } return; }

  // REQ-002① + REQ-095（任务书 #45）：唯一口径升级为 (name, server) 双键——同服同名拦、跨服同名放行，
  // 与 DB 唯一索引 (guild_id, name, COALESCE(server,'')) 活跃 partial 对齐；编辑时排除自身。
  // 软删除后查重只针对活跃成员；撞「离队」成员走下方恢复链路（同 (name,server) 键无法新建同名行）
  const nameClash = appData.members.find(m => m.name === name && (m.server || '') === server && m.id !== editingMemberId);
  if (nameClash && !isDepartedStatus(nameClash.status)) { showToast(`同服务器已存在同名角色「${name}」（跨服同名请填写服务器区分）`, 'error'); memberSaving = false; if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset.originalText || '保存'; } return; }

  const mainSpec = document.getElementById('memberMainSpec') ? document.getElementById('memberMainSpec').value : '';
  // 副专精从全局变量取（多选数组）
  const offSpecs = modalCurrentOffSpecs || [];

  const memberData = {
    name,
    server, // REQ-095：服务器（可空，空存 ''）
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

  // 任务书 #18 WP2 R1：编辑时认领人随表单保存（新增成员不入列，默认未认领；
  // 下拉隐藏/非编辑场景不带 user_id，syncMember 不会触碰认领人）
  const claimGroupEl = document.getElementById('memberClaimGroup');
  if (editingMemberId && claimGroupEl && claimGroupEl.style.display !== 'none') {
    memberData.user_id = document.getElementById('memberClaimUser').value || null;
  }

  // REQ-002（软删除）：新增时撞同 (name,server) 已离队成员 → 不判重、不新建，确认后恢复优先于新建
  // （恢复 = status 改回「正式」，顺带更新本次输入的职业/专精/职责/服务器等字段，加入日期保留原值）
  if (!editingMemberId && nameClash && isDepartedStatus(nameClash.status)) {
    if (!confirm(`存在同名已离队成员「${name}」，是否恢复？\n确认后不新建成员，该成员将恢复为「正式」并更新为本次输入的职业/专精等信息。`)) {
      memberSaving = false;
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset.originalText || '保存'; }
      return;
    }
    try {
      const payload = { ...nameClash, ...memberData, id: nameClash.id, status: '正式', join_date: nameClash.join_date || memberData.join_date };
      await cloudCrud('members', 'update', payload, { renderFn: renderMembers });
      closeModal('memberModal');
      showToast('已恢复同名离队成员', 'success');
    } catch (e) {
      // 弹窗保持打开，便于用户重试
    } finally {
      memberSaving = false;
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset.originalText || '保存'; }
    }
    return;
  }
  // 编辑改名撞上已离队同 (name,server) 成员：唯一索引同样会拦，提前给出明确提示
  if (editingMemberId && nameClash && isDepartedStatus(nameClash.status)) {
    showToast(`已存在同名已离队成员「${name}」，请先恢复该成员或改用其他名字`, 'error');
    memberSaving = false;
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset.originalText || '保存'; }
    return;
  }

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

// REQ-042（软删除）：离队 = status 置「离队」，不 DELETE 行
// （activity_attendance.member_id 外键 ON DELETE CASCADE，真删会连带清空历史考勤）
async function deleteMember(id) {
  if (!confirm('确定将该成员标记为离队吗？离队后保留其全部历史记录，移出正式名单。')) return;

  const member = appData.members.find(m => m.id === id);
  if (!member) return;

  // 严格 DB-first
  try {
    await cloudCrud('members', 'update', { ...member, status: '离队', id: member.id }, { renderFn: renderMembers });
    showToast('成员已标记为离队（编辑成员可改回正式）', 'success');
  } catch (e) {
    // 错误已在 cloudCrud 中提示
  }
}

// 任务书 #27 WP2：彻底删除放开——删除就是删除，不再受历史有无限制，历史保全：
// 考勤/装备 member_id 由 DB 置 NULL（member_name / assignedTo 快照保留，灰色「已删除」展示，
// 统计口径不变）；心愿单为成员私有随人走（DB 级联删除）；原行进垃圾桶 deleted_raid_members（含 history_counts）。
// 有历史时需输入成员名确认（重复角色场景下必须输名才能区分）。
async function hardDeleteMember(id) {
  const member = appData.members.find(m => m.id === id);
  if (!member) return;

  const client = window.CloudSync.getClient();
  if (!client) { showToast('云端未连接，无法校验历史记录', 'error'); return; }

  // 历史计数（沿用原护栏口径：考勤按 member_id；装备按 character_id 或 item_stats->>assignedTo 名字；心愿按 member_id）
  let counts;
  try {
    const nameFilter = String(member.name || '').replace(/"/g, '\\"');
    const [att, wish, loot] = await Promise.all([
      client.from('activity_attendance').select('id', { count: 'exact', head: true }).eq('member_id', id),
      client.from('wishlists').select('id', { count: 'exact', head: true }).eq('member_id', id),
      client.from('loot_records').select('id', { count: 'exact', head: true })
        .or(`character_id.eq.${id},item_stats->>assignedTo.eq."${nameFilter}"`),
    ]);
    if (att.error || wish.error || loot.error) throw (att.error || wish.error || loot.error);
    counts = { attendance: att.count || 0, wishlist: wish.count || 0, loot: loot.count || 0 };
  } catch (e) {
    console.error('成员历史计数失败:', e);
    showToast('历史记录校验失败，已取消删除（安全起见请稍后重试）', 'error');
    return;
  }

  if (counts.attendance + counts.wishlist + counts.loot === 0) {
    // 0 历史：现文案不变
    if (!confirm(`将彻底删除成员「${member.name}」，不可恢复。确定删除吗？`)) return;
    await execHardDelete(member, counts);
    return;
  }
  openHardDeleteModal(member, counts);
}

let pendingHardDelete = null;

function openHardDeleteModal(member, counts) {
  pendingHardDelete = { memberId: member.id, counts };
  document.getElementById('hardDeleteWarnText').textContent =
    `该成员有考勤 ${counts.attendance} 条 / 装备记录 ${counts.loot} 条 / 心愿 ${counts.wishlist} 条。` +
    '彻底删除后：考勤与装备记录将保留并灰色显示「已删除」，心愿单将一并删除，成员数据进入垃圾桶可查。';
  document.getElementById('hardDeleteNameHint').textContent = member.name;
  const input = document.getElementById('hardDeleteConfirmName');
  input.value = '';
  document.getElementById('hardDeleteConfirmBtn').disabled = true;
  openModal('memberHardDeleteModal');
}

function hardDeleteNameInput() {
  const member = appData.members.find(m => m.id === (pendingHardDelete || {}).memberId);
  const input = document.getElementById('hardDeleteConfirmName');
  document.getElementById('hardDeleteConfirmBtn').disabled = !member || input.value.trim() !== member.name;
}

async function confirmHardDelete() {
  if (!pendingHardDelete) return;
  const member = appData.members.find(m => m.id === pendingHardDelete.memberId);
  const input = document.getElementById('hardDeleteConfirmName');
  if (!member || input.value.trim() !== member.name) return;
  const btn = document.getElementById('hardDeleteConfirmBtn');
  btn.disabled = true; btn.textContent = '删除中...';
  try {
    await execHardDelete(member, pendingHardDelete.counts);
    closeModal('memberHardDeleteModal');
    pendingHardDelete = null;
  } finally {
    btn.disabled = false; btn.textContent = '彻底删除';
  }
}

async function execHardDelete(member, counts) {
  // 顺序（任务书 #27 WP2）：写垃圾桶行 → 删 raid_members 行（wishlists 级联自动；
  // 考勤/装备 member_id 被 SET NULL，member_name / assignedTo 快照保留）
  try {
    await window.CloudSync.hardDeleteRaidMember(member, counts);
    await window.CloudSync.reloadData('members');
    await window.CloudSync.reloadData('activities');
    await window.CloudSync.reloadData('wishlists');
    await window.CloudSync.reloadData('loots');
    renderMembers();
    showToast(`成员「${member.name}」已彻底删除，历史记录已保全`, 'success');
  } catch (e) {
    console.error('彻底删除失败:', e);
    showToast('彻底删除失败：' + (e.message || '未知错误'), 'error');
  }
}

// BUG-031（任务书 #12 补丁）：离队成员操作列「恢复」按钮（复用 REQ-042 恢复链路：status 改回正式）
async function restoreMember(id, btn) {
  const member = appData.members.find(m => m.id === id);
  if (!member) return;
  if (btn) { btn.disabled = true; }
  try {
    await cloudCrud('members', 'update', { ...member, status: '正式', id: member.id }, { renderFn: renderMembers });
    showToast(`已恢复 ${member.name} 为正式成员`, 'success');
  } catch (e) {
    // 错误已在 cloudCrud 中提示
    if (btn) { btn.disabled = false; }
  }
}

// 任务书 #18 WP2 R1：认领为我的角色（先到先得；每个成员仍只能被一个用户认领）
// 任务书 #19 WP1：改走窄通道（PATCH 体只含 user_id），viewer 亦可自助认领
// 任务书 #21 WP1-①：点击「待认领」不再立即生效，先弹二次确认弹窗（含用途说明），确认才提交
let pendingClaimMemberId = null;

function claimMember(id) {
  const member = appData.members.find(m => m.id === id);
  const me = window.CloudSync.getCachedUser();
  if (!member || !me) return;
  if (member.user_id) { showToast('该角色已被认领', 'error'); return; }
  // 任务书 #21 WP2：assign 模式 viewer 无认领入口（按钮已隐藏，此处为兜底守卫）
  const mode = getClaimMode();
  if (mode === 'assign' && !window.CloudSync.canEdit()) {
    showToast('本公会由管理者统一分配认领', 'error');
    return;
  }
  pendingClaimMemberId = id;
  document.getElementById('claimConfirmName').textContent = member.name;
  // approval 模式：viewer 确认即提交申请；任务书 #21-补丁 A——owner/editor 无需审核，与 free 同款二次确认直接认领
  const needApproval = mode === 'approval' && !window.CloudSync.canEdit();
  const approvalNote = document.getElementById('claimConfirmApprovalNote');
  if (approvalNote) approvalNote.style.display = needApproval ? '' : 'none';
  document.getElementById('claimConfirmBtn').textContent = needApproval ? '提交认领申请' : '确认认领';
  openModal('claimConfirmModal');
}

// 认领确认弹窗「确认认领/提交认领申请」：free 直接认领；approval 下 viewer 生成申请、管理者直接认领（#21-补丁 A）
async function confirmClaimMember() {
  const id = pendingClaimMemberId;
  const member = appData.members.find(m => m.id === id);
  const me = window.CloudSync.getCachedUser();
  if (!member || !me) { closeModal('claimConfirmModal'); return; }
  const btn = document.getElementById('claimConfirmBtn');
  if (btn) btn.disabled = true;
  try {
    if (getClaimMode() === 'approval' && !window.CloudSync.canEdit()) {
      // 任务书 #21 WP2：approval 不直写 raid_members，生成申请（server.js 窄例外）
      const g = window.CloudSync.getCurrentGuild();
      await window.CloudSync.insertClaimRequest(g.id, id, me.id);
      closeModal('claimConfirmModal');
      await reloadClaimGovernance();
      showToast(`认领申请已提交：${member.name}，等待管理审核`, 'success');
      return;
    }
    await window.CloudSync.setRaidMemberClaim(id, me.id);
    await window.CloudSync.reloadData('members');
    saveData();
    renderMembers();
    closeModal('claimConfirmModal');
    showToast(`已认领：${member.name}`, 'success');
  } catch (e) {
    // 任务书 #19 WP2：失败透传后端具体原因（被抢/无权限等）
    showToast('认领失败: ' + (e.message || '未知错误'), 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// 任务书 #18 WP2 R1 / #19 WP1：解除认领（成员列表内，仅本人认领的行显示该按钮）
async function unclaimMember(id) {
  const member = appData.members.find(m => m.id === id);
  const me = window.CloudSync.getCachedUser();
  if (!member || !me) return;
  if (member.user_id !== me.id) { showToast('只能解除自己的认领', 'error'); return; }
  if (!confirm(`确定解除对「${member.name}」的认领吗？`)) return;
  try {
    await window.CloudSync.setRaidMemberClaim(id, null);
    await window.CloudSync.reloadData('members');
    saveData();
    renderMembers();
    showToast('已解除认领', 'success');
  } catch (e) {
    showToast('解除认领失败: ' + (e.message || '未知错误'), 'error');
  }
}

// REQ-023：智能导入预览行 {name, cls, include, status: 'ok'|'dup'|'bad'}
// REQ-032：WCL 来源的行额外带 server 字段（参与同服唯一查重，REQ-002）
let importPreviewRows = [];
// REQ-032：当前导入来源（'paste' 粘贴名单 / 'wcl' WCL 链接），WCL 来源时记录报告标题
let importSource = 'paste';
let importWclTitle = '';

function showImportMembersModal() {
  document.getElementById('importMembersText').value = '';
  document.getElementById('importWclUrl').value = '';
  importPreviewRows = [];
  importWclTitle = '';
  switchImportTab('paste');
  openModal('importMembersModal');
}

// REQ-032：切换"粘贴名单 / 从 WCL 链接导入"标签页（在预览页点标签 = 退出预览回到该步）
function switchImportTab(tab) {
  importSource = tab;
  document.getElementById('importTabPaste').classList.toggle('active', tab === 'paste');
  document.getElementById('importTabWcl').classList.toggle('active', tab === 'wcl');
  document.getElementById('importPasteStep').style.display = tab === 'paste' ? '' : 'none';
  document.getElementById('importWclStep').style.display = tab === 'wcl' ? '' : 'none';
  document.getElementById('importPreviewStep').style.display = 'none';
  document.getElementById('importParseBtn').style.display = tab === 'paste' ? '' : 'none';
  document.getElementById('importConfirmBtn').style.display = 'none';
  document.getElementById('importBackBtn').style.display = 'none';
}

// 进入预览确认步（粘贴解析与 WCL 解析共用）
function showImportPreviewStep() {
  document.getElementById('importPasteStep').style.display = 'none';
  document.getElementById('importWclStep').style.display = 'none';
  document.getElementById('importPreviewStep').style.display = '';
  document.getElementById('importParseBtn').style.display = 'none';
  document.getElementById('importConfirmBtn').style.display = '';
  document.getElementById('importBackBtn').style.display = '';
  renderImportPreview();
}

// REQ-032：解析 WCL 报告链接 → 玩家列表转预览行 → 复用现有预览确认全链路
async function importParseWcl() {
  const parsed = parseWclUrl(document.getElementById('importWclUrl').value);
  if (!parsed || !parsed.code) { showToast('WCL 链接格式不正确，请输入 warcraftlogs.com 的报告链接', 'error'); return; }
  const guild = window.CloudSync.getCurrentGuild();
  if (!guild) { showToast('请先选择公会', 'error'); return; }
  const btn = document.getElementById('importWclParseBtn');
  btn.disabled = true;
  btn.textContent = '解析中...';
  try {
    const data = await wclApiPost('/api/wcl/report-summary', { reportCode: parsed.code, guildId: guild.id });
    const players = data.players || [];
    if (!players.length) { showToast('该报告中未找到玩家名单', 'error'); return; }
    importWclTitle = data.title || '';
    // REQ-002（软删除）：dup 判定只针对活跃成员；撞已离队成员不判重，确认导入时走恢复链路
    // REQ-095：查重走 matchMemberByNameServer 统一口径（server 参与同服查重）
    const activeMembers = appData.members.filter(m => !isDepartedStatus(m.status));
    importPreviewRows = players.map(p => {
      const cls = wowClassEnToCn[(p.subType || '').toUpperCase()] || '';
      // 未识别职业按现有 bad 状态处理（预览页可人工修正）
      const dup = cls ? !!matchMemberByNameServer(activeMembers, p.name, p.server || '') : false;
      const status = !cls ? 'bad' : (dup ? 'dup' : 'ok');
      return { name: p.name, cls, server: p.server || '', include: status === 'ok', status };
    });
    showImportPreviewStep();
  } catch (e) {
    console.error('WCL 名单解析失败:', e);
    showToast(e.message || 'WCL 报告解析失败', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '解析';
  }
}

function copyImportMacro(elementId) {
  const text = document.getElementById(elementId).textContent;
  navigator.clipboard.writeText(text)
    .then(() => showToast('宏已复制，到游戏聊天框粘贴回车即可导出名单', 'success'))
    .catch(() => showToast('复制失败，请手动选中复制', 'error'));
}

function importParseRoster() {
  const text = document.getElementById('importMembersText').value;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) { showToast('请先粘贴名单', 'error'); return; }
  // REQ-002（软删除）：dup 判定只针对活跃成员；撞已离队成员不判重，确认导入时走恢复链路
  // REQ-095：查重走 matchMemberByNameServer 统一口径（单候选宽松匹配，多候选须 (name,server) 精确相等）
  const activeMembers = appData.members.filter(m => !isDepartedStatus(m.status));
  importPreviewRows = lines.map(line => {
    const parsed = parseMemberRosterLine(line);
    if (!parsed) return { name: line, cls: '', server: '', include: false, status: 'bad' };
    const dup = !!matchMemberByNameServer(activeMembers, parsed.name, parsed.server);
    const status = !parsed.cls ? 'bad' : (dup ? 'dup' : 'ok');
    return { name: parsed.name, cls: parsed.cls, server: parsed.server || '', include: status === 'ok', status };
  });
  showImportPreviewStep();
}

function importBackToPaste() {
  // REQ-032：按来源返回对应步（粘贴名单 / WCL 链接）
  switchImportTab(importSource);
}

function renderImportPreview() {
  const classOptions = sel => '<option value="">（选职业）</option>' +
    Object.keys(classMap).map(c => `<option value="${c}" ${sel === c ? 'selected' : ''}>${c}</option>`).join('');
  // REQ-048：departed-skip = 同名已离队未恢复（聚合确认中未勾选，跳过导入）
  // BUG-036（任务书 #12 补丁4）：文案精简为"离队未恢复"（原"已离队同名，未恢复"在状态列竖排换行）
  const statusText = { ok: '新成员', dup: '已存在', bad: '需修正', 'departed-skip': '离队未恢复' };
  // REQ-032：WCL 来源时在预览步顶部注明报告标题
  const srcEl = document.getElementById('importPreviewSource');
  if (importSource === 'wcl' && importWclTitle) {
    srcEl.textContent = `来自 WCL 报告：${importWclTitle}`;
    srcEl.style.display = '';
  } else {
    srcEl.style.display = 'none';
  }
  document.getElementById('importPreviewBody').innerHTML = importPreviewRows.map((r, i) => {
    const color = r.status === 'bad' ? 'var(--danger)' : (r.status === 'dup' || r.status === 'departed-skip' ? 'var(--warning)' : '');
    const nameCell = r.status === 'bad'
      ? `<input class="form-input" style="height:28px;padding:2px 6px" value="${r.name.replace(/"/g, '&quot;')}" oninput="importUpdateRow(${i},'name',this.value)">`
      : r.name;
    return `<tr${color ? ` style="color:${color}"` : ''}>
      <td class="center"><input type="checkbox" ${r.include ? 'checked' : ''} onchange="importUpdateRow(${i},'include',this.checked)"></td>
      <td>${nameCell}</td>
      <td style="white-space:nowrap">${classMap[r.cls] ? `<img class="class-icon" id="importClsIcon${i}" src="assets/icons/${classMap[r.cls]}.svg" alt="" onerror="this.style.display='none'">` : `<span id="importClsIcon${i}"></span>`}<select class="form-select" style="height:28px;padding:2px 6px" onchange="importUpdateRow(${i},'cls',this.value)">${classOptions(r.cls)}</select></td>
      <td style="font-size:12px;white-space:nowrap">${r.server || '—'}</td>
      <td style="white-space:nowrap">待补充</td>
      <td class="center" style="white-space:nowrap">${statusText[r.status]}</td>
      <td class="center"><button type="button" class="btn btn-sm btn-danger" onclick="importRemoveRow(${i})">剔除</button></td>
    </tr>`;
  }).join('');
}

function importUpdateRow(i, field, value) {
  const r = importPreviewRows[i];
  if (!r) return;
  r[field] = value;
  // 任务书 #13 §6：职业变更时同步更新行内图标
  if (field === 'cls') {
    const icon = document.getElementById(`importClsIcon${i}`);
    if (icon) {
      const key = classMap[value];
      if (key) {
        icon.outerHTML = `<img class="class-icon" id="importClsIcon${i}" src="assets/icons/${key}.svg" alt="" onerror="this.style.display='none'">`;
      } else {
        icon.outerHTML = `<span id="importClsIcon${i}"></span>`;
      }
    }
  }
  // 不整表重绘（避免输入框失焦），状态在确认导入时最终校验
}

function importRemoveRow(i) {
  importPreviewRows.splice(i, 1);
  renderImportPreview();
}

// 规范 1.2.2 批处理例外：智能导入循环写入，完成后统一 reload 一次
let importConfirming = false; // BUG-024：防重复点击
let importRestorePending = null; // REQ-048：聚合确认上下文 { picked, collisions }

async function importConfirmRoster() {
  if (importConfirming) return;
  const picked = importPreviewRows.filter(r => r.include && r.name.trim() && r.cls);
  if (!picked.length) { showToast('没有可导入的成员（需勾选且名字、职业齐全）', 'error'); return; }

  // REQ-048（任务书 #12 补丁3）：撞已离队同名成员的行聚合确认——一次弹窗列全、默认全选恢复，
  // 替代原逐个浏览器 confirm。未勾选的跳过不导入，预览页标"已离队同名，未恢复"。
  // （恢复优先于新建：DB (guild_id,name,COALESCE(server,'')) 唯一索引下不恢复则无法新建同键成员）
  const collisions = [];
  for (const r of picked) {
    // REQ-095：两种来源同一口径——撞离队查找统一走 matchMemberByNameServer（候选=离队成员）
    const departed = findDepartedByNameServer(r.name.trim(), r.server || '');
    if (departed) collisions.push({ row: r, departed });
  }
  if (collisions.length) {
    importRestorePending = { picked, collisions };
    showImportRestoreModal(collisions);
    return;
  }
  await importExecute(picked, [], []);
}

// REQ-048：聚合确认弹窗
function showImportRestoreModal(collisions) {
  document.getElementById('importRestoreHint').textContent =
    `以下 ${collisions.length} 名成员同名已离队，勾选将恢复为正式成员（不新建）；未勾选的跳过导入。`;
  document.getElementById('importRestoreList').innerHTML = collisions.map((c, i) => `
    <label style="display:flex;align-items:center;gap:8px;padding:8px 4px;border-bottom:1px solid var(--border-color, #333);cursor:pointer">
      <input type="checkbox" id="importRestoreCb${i}" checked>
      <span style="font-weight:500">${c.row.name}</span>
      <span style="color:var(--text-muted);font-size:12px">${c.row.cls}${c.row.server ? ' · ' + c.row.server : ''}</span>
      <span style="margin-left:auto;font-size:12px;color:var(--warning)">已离队</span>
    </label>`).join('');
  openModal('importRestoreModal');
}

// REQ-048：返回导入预览，不做任何写入
function importRestoreCancel() {
  importRestorePending = null;
  closeModal('importRestoreModal');
}

// REQ-048：聚合确认——勾选的恢复、未勾选的跳过（预览页标出）、其余正常新建
async function importRestoreConfirm() {
  const pending = importRestorePending;
  if (!pending) return;
  const checkedIdx = [];
  pending.collisions.forEach((c, i) => {
    if (document.getElementById(`importRestoreCb${i}`).checked) checkedIdx.push(i);
  });
  const toRestore = checkedIdx.map(i => pending.collisions[i]);
  const skipped = pending.collisions.filter((c, i) => !checkedIdx.includes(i)).map(c => c.row);
  const collidingRows = new Set(pending.collisions.map(c => c.row));
  const toAdd = pending.picked.filter(r => !collidingRows.has(r));
  importRestorePending = null;
  closeModal('importRestoreModal');
  // BUG-035（任务书 #12 补丁4）：确认后立即更新预览行状态——未勾选恢复的行即时取消勾选
  // 并标黄"离队未恢复"，不等写库完成（此前要等整个导入执行完才更新，等待期误导用户）
  skipped.forEach(r => { r.status = 'departed-skip'; r.include = false; });
  renderImportPreview();
  await importExecute(toAdd, toRestore, skipped);
}

// REQ-048：导入执行体（原 importConfirmRoster 写路径）。
// skipped：同名离队未恢复的行——不导入，预览页标"已离队同名，未恢复"并停留预览页
async function importExecute(toAdd, toRestore, skipped) {
  const btn = document.getElementById('importConfirmBtn');
  importConfirming = true;
  btn.disabled = true;
  btn.dataset.originalText = btn.textContent;
  btn.textContent = '导入中...';
  try {
    // BUG-037（任务书 #12 补丁4）：逐行容错——单行写失败不拖死整批、不让已成功的行停在未刷新状态。
    // 23505（唯一约束冲突）给具体中文提示，其他错误走通用文案（用户提示分层）。
    const failReason = (e) => (e && e.code === '23505') ? '同名成员已存在或与已离队成员重名' : ((e && e.message) || '未知错误');
    const failedRows = [];
    for (const r of toAdd) {
      try {
        await window.CloudSync.saveCloudData('members', 'add', {
          name: r.name.trim(),
          server: r.server || '', // REQ-095：服务器随导入写库（此前解析出但丢弃）
          class: r.cls,
          main_spec: '待补充',
          spec: '待补充', // 向后兼容
          off_spec: '',
          off_specs: [],
          role: [],
          status: '正式',
          join_date: formatDate(new Date()),
          notes: ''
        });
      } catch (e) {
        console.error('导入成员失败:', r.name, e);
        failedRows.push({ name: r.name.trim(), reason: failReason(e) });
      }
    }
    for (const t of toRestore) {
      try {
        await window.CloudSync.saveCloudData('members', 'update', {
          ...t.departed,
          class: t.row.cls || t.departed.class, // 顺带更新本次输入的职业，其余字段保留原值
          server: t.row.server || '', // REQ-095：恢复顺带写入本次输入的服务器（与 saveMember 恢复链路同口径）
          status: '正式',
          id: t.departed.id
        });
      } catch (e) {
        console.error('恢复离队成员失败:', t.row.name, e);
        failedRows.push({ name: t.row.name.trim(), reason: failReason(e) });
      }
    }
    const addedOk = toAdd.length - failedRows.filter(f => toAdd.some(r => r.name.trim() === f.name)).length;
    const restoredOk = toRestore.length - failedRows.filter(f => toRestore.some(t => t.row.name.trim() === f.name)).length;
    if (addedOk > 0 || restoredOk > 0) {
      await window.CloudSync.reloadData('members');
      saveData();
      renderMembers();
    }
    const failedMsg = failedRows.length
      ? `，失败 ${failedRows.length} 个（${failedRows.slice(0, 3).map(f => `${f.name}：${f.reason}`).join('；')}${failedRows.length > 3 ? ' 等' : ''}）`
      : '';
    if (skipped.length) {
      // 有跳过行：停留预览页标出，由用户剔除或重新勾选后再导入
      renderImportPreview();
      showToast(`导入 ${addedOk} 个、恢复 ${restoredOk} 个，跳过 ${skipped.length} 个（同名离队未恢复）${failedMsg}`, failedRows.length ? 'error' : 'warning');
    } else if (failedRows.length && addedOk === 0 && restoredOk === 0) {
      showToast(`导入失败${failedMsg.replace('，失败', '：')}`, 'error');
    } else {
      if (!failedRows.length) closeModal('importMembersModal');
      else renderImportPreview();
      const restoredMsg = restoredOk ? `，恢复 ${restoredOk} 个已离队成员` : '';
      showToast(`成功导入 ${addedOk} 个成员（专精待补充）${restoredMsg}${failedMsg}`, failedRows.length ? 'warning' : 'success');
    }
    // BUG-026（任务书 #12 补丁）：从 WCL 同步预览跳转过来的"添加为成员"，
    // 导入成功后回到同步预览弹窗，不阻塞后续考勤写入
    // BUG-032（任务书 #12 补丁2）：reload 后用新名单对 _pendingAdd 行重跑对照匹配，
    // 命中则移入①自动出席/②部分参战分区（随「确认写入考勤」一并写入），不再滞留③区
    if ((toAdd.length || toRestore.length) &&
        typeof wclSyncRows !== 'undefined' && wclSyncRows.some(r => r._pendingAdd)) {
      const activeMembers = appData.members.filter(m => m.status !== '离队');
      wclSyncRows.forEach(r => {
        if (!r._pendingAdd) return;
        r._pendingAdd = false;
        const member = matchMemberByNameServer(activeMembers, r.name, r.server || ''); // REQ-095：重匹配走统一口径
        if (member) {
          r.memberId = member.id;
          r.zone = r.bossFights >= (wclSyncMeta ? wclSyncMeta.bossFightTotal : 0) ? 'full' : 'partial';
          r.status = '出席';
          r.added = false;
        } else {
          r.added = true; // 兜底：reload 后仍未匹配到（异常），维持补丁1 的「已添加」灰显
        }
      });
      if (wclSyncMeta) {
        renderWclSyncPreview();
        openModal('wclSyncModal');
      }
    }
  } catch (e) {
    console.error('成员智能导入失败:', e);
    showToast('导入失败：云端同步出错', 'error');
  } finally {
    importConfirming = false;
    btn.disabled = false;
    btn.textContent = btn.dataset.originalText || '确认导入';
  }
}

// ==================== 考勤记录 ====================
function renderAttendance() {
  if (getAttendanceView() === 'calendar') {
    renderCalendar();
  } else {
    renderActivityList();
  }
}

function switchAttendanceView(view) {
  // REQ-011 + BUG-023：按「账号+公会」记住用户上次选择
  localStorage.setItem(getAttendanceViewStorageKey(), view);
  syncAttendanceViewUI();
}

// REQ-011：按当前视图偏好同步 tab 高亮与视图容器显隐（页面初始化/切页时也要调）
function syncAttendanceViewUI() {
  const view = getAttendanceView();
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
  document.getElementById('activityWclUrl').value = '';
  // REQ-064：旧 team_tag 输入框已移除；此处一并清空团号（原补丁3漏清，日历格子连点会串值）
  document.getElementById('activityTeamLabel').value = '';
  raidSelectClose(); // BUG-027：自定义下拉，打开弹窗时确保面板收起
  updateActivityDuration();
  updateActivityConflictWarning();
  openModal('activityModal');
}

// ==================== REQ-018：考勤筛选 ====================
// 筛选状态存模块变量即可（不持久化）。
// 「本赛季」口径（V2.2 覆盖）：统一读 game_seasons.is_current 起点，未设当前赛季回退最近 90 天。
const ATT_FILTER_SEASON_DAYS = 90;
const attFilter = { memberId: '', statuses: new Set(), range: 'all', from: '', to: '', includeCancelled: false };

function attFilterChange() {
  attFilter.memberId = document.getElementById('attFilterMember').value;
  attFilter.statuses = new Set(Array.from(document.querySelectorAll('#attFilterStatuses input:checked')).map(cb => cb.value));
  attFilter.range = document.getElementById('attFilterRange').value;
  attFilter.from = document.getElementById('attFilterFrom').value;
  attFilter.to = document.getElementById('attFilterTo').value;
  attFilter.includeCancelled = document.getElementById('attFilterIncludeCancelled').checked;
  const isCustom = attFilter.range === 'custom';
  document.getElementById('attFilterFrom').style.display = isCustom ? '' : 'none';
  document.getElementById('attFilterTo').style.display = isCustom ? '' : 'none';
  renderActivityList();
}

function attFilterReset() {
  document.getElementById('attFilterMember').value = '';
  document.querySelectorAll('#attFilterStatuses input').forEach(cb => { cb.checked = false; });
  document.getElementById('attFilterRange').value = 'all';
  document.getElementById('attFilterFrom').value = '';
  document.getElementById('attFilterTo').value = '';
  document.getElementById('attFilterIncludeCancelled').checked = false;
  attFilterChange();
}

function getAttFilteredActivities() {
  let list = [...appData.activities];
  // 含已取消开关：默认关，关掉时已取消活动不进列表
  if (!attFilter.includeCancelled) list = list.filter(a => a.status !== 'cancelled');
  // 时间范围
  if (attFilter.range !== 'all') {
    let from = null;
    const to = attFilter.range === 'custom' ? (attFilter.to || null) : null;
    if (attFilter.range === 'custom') {
      from = attFilter.from || null;
    } else if (attFilter.range === 'season') {
      // REQ-018（V2.2 覆盖）：本赛季起点统一读 game_seasons.is_current；
      // 主数据未加载/未设当前赛季时回退最近 90 天
      from = getGameCurrentSeasonStart();
      if (!from) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - ATT_FILTER_SEASON_DAYS);
        from = formatDate(cutoff);
      }
    } else {
      const days = parseInt(attFilter.range, 10);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      from = formatDate(cutoff);
    }
    if (from) list = list.filter(a => a.date >= from);
    if (to) list = list.filter(a => a.date <= to);
  }
  // 成员：该活动有此成员的考勤记录
  if (attFilter.memberId) {
    list = list.filter(a => (a.attendees || []).some(att => att.member_id === attFilter.memberId));
  }
  // 状态多选：选中具体成员时按其状态匹配；全部成员时任一成员状态命中即保留
  if (attFilter.statuses.size > 0) {
    list = list.filter(a => (a.attendees || []).some(att =>
      (!attFilter.memberId || att.member_id === attFilter.memberId) && attFilter.statuses.has(att.status)));
  }
  return list;
}

// 出勤率小计：复用全站唯一算法源 getAttendanceStats，对筛选后的活动集聚合
// （getAttendanceStats 内部跳过已取消活动，与全站统计口径一致）
function attRenderFilterSubtotal(activities) {
  const el = document.getElementById('attFilterSubtotal');
  if (!el) return;
  const targets = attFilter.memberId
    ? appData.members.filter(m => m.id === attFilter.memberId)
    : appData.members.filter(m => m.status !== '离队');
  let present = 0, total = 0;
  targets.forEach(m => {
    const s = getAttendanceStats(m.id, activities);
    present += s.present;
    total += s.total;
  });
  const rate = total > 0 ? Math.round((present / total) * 100) : 0;
  el.textContent = `小计：出勤率 ${rate}%（出勤 ${present}/应到 ${total}）`;
}

// ==================== REQ-017-B：活动批量删除 ====================
let activitySelectedIds = new Set();

function activityToggleSelect(id, checked) {
  if (checked) activitySelectedIds.add(id);
  else activitySelectedIds.delete(id);
  activityUpdateBatchToolbar();
}

function activityClearSelection() {
  activitySelectedIds.clear();
  activityUpdateBatchToolbar();
  renderActivityList();
}

function activityUpdateBatchToolbar() {
  const toolbar = document.getElementById('activityBatchToolbar');
  const countEl = document.getElementById('activityBatchCount');
  if (!toolbar) return;
  toolbar.style.display = activitySelectedIds.size > 0 ? 'flex' : 'none';
  if (countEl) countEl.textContent = `已选择 ${activitySelectedIds.size} 个活动`;
  const btn = document.getElementById('activityBatchDeleteBtn');
  if (btn) btn.textContent = `批量删除（${activitySelectedIds.size}）`;
}

// ==================== 通用批量删除二次确认弹窗（REQ-017-B 活动 / REQ-042 成员共用） ====================
let batchDeleteBusy = false;
let batchDeleteOnConfirm = null;
// BUG-077（任务书 #38 WP1）：确认/忙碌按钮文案按入口参数化——批量离队=「确认离队/离队中...」，
// 批量删除（活动/默认）=「确认删除/删除中...」；不传参维持默认删除语义。
let batchDeleteLabels = { confirm: '确认删除', busy: '删除中...' };

function openBatchDeleteModal({ title, lines, warning, onConfirm, confirmLabel, busyLabel }) {
  document.getElementById('batchDeleteTitle').textContent = title;
  document.getElementById('batchDeleteList').innerHTML =
    lines.map(l => `<div class="batch-delete-item">${l}</div>`).join('');
  document.getElementById('batchDeleteWarning').textContent = warning;
  batchDeleteOnConfirm = onConfirm;
  batchDeleteLabels = { confirm: confirmLabel || '确认删除', busy: busyLabel || '删除中...' };
  const btn = document.getElementById('batchDeleteConfirmBtn');
  btn.disabled = false;
  btn.textContent = batchDeleteLabels.confirm;
  openModal('batchDeleteModal');
}

async function confirmBatchDelete() {
  if (batchDeleteBusy || !batchDeleteOnConfirm) return; // 防重复点击
  batchDeleteBusy = true;
  const btn = document.getElementById('batchDeleteConfirmBtn');
  btn.disabled = true;
  btn.textContent = batchDeleteLabels.busy;
  try {
    await batchDeleteOnConfirm();
  } finally {
    batchDeleteBusy = false;
    batchDeleteOnConfirm = null;
    btn.disabled = false;
    btn.textContent = batchDeleteLabels.confirm;
  }
}

function activityBatchDelete() {
  const acts = appData.activities.filter(a => activitySelectedIds.has(a.id));
  if (!acts.length) { showToast('未选择任何活动', 'warning'); return; }
  openBatchDeleteModal({
    title: `批量删除活动（${acts.length}）`,
    lines: [...acts].sort((a, b) => a.date.localeCompare(b.date))
      .map(a => `${a.raid_name || '未命名活动'} — 📅 ${a.date}`),
    warning: '⚠ 删除后不可恢复，活动的考勤记录将一并删除',
    onConfirm: async () => {
      // 规范 1.2.2 批处理例外：并发写库，完成后统一 reload 一次 + 单次 render
      // （DB 外键 ON DELETE CASCADE 级联删考勤，无需显式删考勤）
      // BUG-029（任务书 #12 补丁）：串行改并发——代理冷缓存下单个 DELETE 可达 2-4.6s，
      // 串行 N 次等待过长；且 reloadData 失败时必须报错误而不是成功 toast
      try {
        const results = await Promise.allSettled(
          acts.map(a => window.CloudSync.saveCloudData('activities', 'delete', { id: a.id }))
        );
        const ok = results.filter(r => r.status === 'fulfilled').length;
        const fail = results.length - ok;
        results.forEach((r, i) => { if (r.status === 'rejected') console.error('批量删除活动失败:', acts[i].id, r.reason); });
        await window.CloudSync.reloadData('activities');
        saveData();
        activitySelectedIds.clear();
        closeModal('batchDeleteModal');
        renderAttendance();
        if (fail) showToast(`删除完成：成功 ${ok} 个，失败 ${fail} 个`, 'warning');
        else showToast(`已删除 ${ok} 个活动`, 'success');
      } catch (e) {
        console.error('批量删除活动后刷新失败:', e);
        showToast('删除可能已提交，但刷新数据失败：' + (e.message || '请手动刷新页面'), 'error');
      }
    }
  });
}

// 列表视图
function renderActivityList() {
  const activities = getAttFilteredActivities().sort((a, b) => new Date(b.date) - new Date(a.date));
  const container = document.getElementById('activityList');

  // REQ-018：成员下拉跟随成员名单刷新（保留当前选择；成员被删则回落"全部成员"）
  const memberSel = document.getElementById('attFilterMember');
  if (memberSel) {
    const cur = memberSel.value;
    memberSel.innerHTML = '<option value="">全部成员</option>' +
      appData.members.filter(m => m.status !== '离队').map(m => `<option value="${m.id}">${memberDisplayName(m)}</option>`).join('');
    memberSel.value = cur;
    if (memberSel.value !== cur) { attFilter.memberId = ''; }
  }

  if (!activities.length) {
    const hasAny = appData.activities.length > 0;
    container.innerHTML = hasAny
      ? `<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-text">无符合筛选条件的活动</div></div>`
      : `<div class="empty-state"><div class="empty-icon">📅</div><div class="empty-text">暂无活动记录</div><button class="btn btn-primary" onclick="showActivityModal()">+ 创建第一个活动</button></div>`;
    activityUpdateBatchToolbar();
    attRenderFilterSubtotal(activities);
    return;
  }
  
  container.innerHTML = activities.map(a => {
    const present = a.attendees.filter(att => att.status === '出席' || att.status === '替补' || att.status === '迟到').length;
    const absent = a.attendees.filter(att => att.status === '缺席').length;
    const total = appData.members.filter(m => m.status !== '离队').length;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    // REQ-020：已取消活动灰显 + 徽标
    const isCancelled = a.status === 'cancelled';
    // REQ-028：同标签同日时间交叉的活动黄色左边条 + ⚠（双向：本活动看别人与别人看自己规则相同）
    const conflicts = findActivityConflicts(a, a.id);
    const conflictTitle = conflicts.length
      ? `时间冲突：${conflicts.map(c => `《${c.raid_name || '未命名活动'}》（${c.start_time || '--:--'}-${c.end_time || '--:--'}）`).join('、')}`
      : '';

    return `
      <div class="activity-item${isCancelled ? ' activity-cancelled' : ''}${conflicts.length ? ' activity-conflict' : ''}" data-activity-id="${a.id}"${conflictTitle ? ` title="${conflictTitle}"` : ''} onclick="openAttendanceDetail('${a.id}')">
        <input type="checkbox" class="activity-select-checkbox" title="选择" ${activitySelectedIds.has(a.id) ? 'checked' : ''}
               onclick="event.stopPropagation()" onchange="activityToggleSelect('${a.id}', this.checked)">
        <div class="activity-info">
          <h4>${conflicts.length ? '<span class="conflict-icon">⚠</span> ' : ''}${a.raid_name || '未命名活动'}${isCancelled ? ' <span class="badge badge-inactive">已取消</span>' : ''}</h4>
          <div class="activity-meta">
            <span>📅 ${a.date}</span>
            <span>⏰ ${a.start_time || '--:--'} - ${a.end_time || '--:--'}</span>
            ${a.team_label ? `<span class="tag tag-gold" title="团号">${/^\d+$/.test((a.team_label || '').trim()) ? `${(a.team_label || '').trim()} 团` : `团号：${a.team_label}`}</span>` : ''}
            <span>👥 ${a.attendees.length} 人登记</span>
            ${a.wcl_snapshot ? `<span class="tag tag-blue" title="已从 WCL 导入 ${(typeof a.wcl_snapshot.imported === 'number' ? a.wcl_snapshot.imported : a.attendees.filter(x => x.status && x.status !== '缺席').length)} 人考勤（快照留存）">手动标记 ${(typeof a.wcl_snapshot.imported === 'number' ? a.wcl_snapshot.imported : a.attendees.filter(x => x.status && x.status !== '缺席').length)}</span>` : ''}
            ${a.wcl_url ? `<a class="btn btn-sm" href="${a.wcl_url}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" style="padding:2px 10px;font-size:12px">📊 WCL 复盘</a>` : ''}
          </div>
          ${conflicts.length ? `<div class="activity-conflict-line">⚠ 与 ${conflicts.map(c => `《${c.raid_name || '未命名活动'}》${c.start_time || '--:--'}-${c.end_time || '--:--'}`).join('、')} 冲突</div>` : ''}
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

  // REQ-017-B：剔除已不存在的选中项（如被他人删除），并同步工具条；REQ-018：刷新小计
  activitySelectedIds.forEach(id => { if (!appData.activities.some(a => a.id === id)) activitySelectedIds.delete(id); });
  activityUpdateBatchToolbar();
  attRenderFilterSubtotal(activities);
}

function showActivityModal(activity = null) {
  editingActivityId = activity ? activity.id : null;
  document.getElementById('activityModalTitle').textContent = activity ? '编辑活动' : '创建活动';
  document.getElementById('activityDate').value = activity ? activity.date : formatDate(new Date());
  document.getElementById('activityRaidName').value = activity ? activity.raid_name : '';
  document.getElementById('activityStartTime').value = activity ? activity.start_time : '20:00';
  document.getElementById('activityEndTime').value = activity ? activity.end_time : '23:00';
  document.getElementById('activityNotes').value = activity ? activity.notes || '' : '';
  // REQ-014：回填 WCL 链接
  document.getElementById('activityWclUrl').value = activity ? (activity.wcl_url || '') : '';
  // REQ-062：回填团号
  document.getElementById('activityTeamLabel').value = activity ? (activity.team_label || '') : '';
  raidSelectClose(); // BUG-027：自定义下拉，打开弹窗时确保面板收起
  updateActivityDuration();
  updateActivityConflictWarning();
  openModal('activityModal');
}

// REQ-012：活动时长实时显示（结束早于开始按跨天计算并提示）
function updateActivityDuration() {
  const el = document.getElementById('activityDuration');
  if (!el) return;
  const start = document.getElementById('activityStartTime').value;
  const end = document.getElementById('activityEndTime').value;
  if (!start || !end) { el.textContent = ''; return; }
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  let crossDay = false;
  if (diff < 0) { diff += 24 * 60; crossDay = true; }
  if (diff === 0) { el.textContent = '⚠️ 起止时间相同，请确认'; el.style.color = 'var(--warning)'; return; }
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  el.textContent = `⏱ 时长：${h > 0 ? h + ' 小时 ' : ''}${m > 0 ? m + ' 分钟' : ''}${crossDay ? '（跨天，结束时间为次日）' : ''}`.trim();
  el.style.color = crossDay ? 'var(--warning)' : 'var(--text-muted)';
}

// 防重复提交标志
let activitySaving = false;

// REQ-014：校验 WCL 链接并解析报告编号
// 返回 { url, code }；空输入返回 { url:'', code:'' }；非 warcraftlogs.com 域名返回 null
function parseWclUrl(input) {
  const url = (input || '').trim();
  if (!url) return { url: '', code: '' };
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== 'warcraftlogs.com' && !host.endsWith('.warcraftlogs.com')) return null;
  const m = parsed.pathname.match(/\/reports\/([A-Za-z0-9]+)/);
  return { url, code: m ? m[1] : '' };
}

async function saveActivity() {
  if (activitySaving) return;
  activitySaving = true;
  const saveBtn = document.getElementById('activitySaveBtn');
  if (saveBtn) { saveBtn.dataset.originalText = saveBtn.textContent; saveBtn.disabled = true; saveBtn.textContent = '保存中...'; }

  const date = document.getElementById('activityDate').value;
  const raidName = document.getElementById('activityRaidName').value.trim();
  
  if (!date) { showToast('请选择日期', 'error'); activitySaving = false; if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset.originalText || '保存'; } return; }
  if (!raidName) { showToast('请输入团本名称', 'error'); activitySaving = false; if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset.originalText || '保存'; } return; }

  // REQ-014：WCL 链接校验（域名必须是 warcraftlogs.com），并解析报告编号
  const wclParsed = parseWclUrl(document.getElementById('activityWclUrl').value);
  if (wclParsed === null) {
    showToast('WCL 链接格式不正确，请输入 warcraftlogs.com 的链接', 'error');
    activitySaving = false;
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset.originalText || '保存'; }
    return;
  }
  
  const activityData = {
    date,
    raid_name: raidName,
    start_time: document.getElementById('activityStartTime').value,
    end_time: document.getElementById('activityEndTime').value,
    notes: document.getElementById('activityNotes').value.trim(),
    wcl_url: wclParsed.url,
    wcl_report_code: wclParsed.code,
    // REQ-062：团号（trim；空串不显示徽章）。REQ-064：旧 team_tag 已并入本字段，不再读写
    team_label: document.getElementById('activityTeamLabel').value.trim()
  };
  // REQ-028：时间冲突仅弹窗内黄色警告条提示（updateActivityConflictWarning 实时刷新），不阻断保存

  // 严格 DB-first
  try {
    // BUG-019：保存后把日历切到活动所在月份，保证新活动即时可见
    // （否则在“翻到其他月份后用创建按钮”的入口下，活动落在当月之外，看似未刷新）
    calendarDate = new Date(date + 'T00:00:00');
    if (editingActivityId) {
      const activity = appData.activities.find(a => a.id === editingActivityId);
      if (!activity) return;
      const payload = { ...activity, ...activityData, id: editingActivityId };
      await cloudCrud('activities', 'update', payload, { renderFn: renderAttendance });
      rememberRecentRaidName(raidName); // REQ-029：真实写库成功才记最近使用
      showToast('活动已更新', 'success');
    } else {
      const attendees = appData.members.filter(m => m.status !== '离队').map(m => ({
        member_id: m.id, status: '缺席', notes: ''
      }));
      const payload = { ...activityData, status: 'normal', attendees };
      await cloudCrud('activities', 'add', payload, { renderFn: renderAttendance });
      rememberRecentRaidName(raidName); // REQ-029
      showToast('活动已创建', 'success');
    }
    closeModal('activityModal'); // BUG-080 同族（任务书 #47 WP2-#3）：成功才关弹窗——失败保弹窗留输入便于重试（与 saveMember 口径对齐）
  } catch (e) {
    console.error('活动保存失败:', e);
  } finally {
    activitySaving = false;
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset.originalText || '保存'; }
  }
}

function openAttendanceDetail(activityId) {
  currentActivityId = activityId;
  const activity = appData.activities.find(a => a.id === activityId);
  if (!activity) return;
  
  document.getElementById('attendanceDetailTitle').textContent = activity.raid_name;
  document.getElementById('attendanceDetailSubtitle').textContent = 
    `📅 ${activity.date} | ⏰ ${activity.start_time || '--:--'} - ${activity.end_time || '--:--'}`;
  
  // REQ-014：已挂 WCL 链接的活动显示"WCL 复盘"（全体成员可见），否则隐藏
  const wclBtn = document.getElementById('attendanceWclBtn');
  if (wclBtn) {
    if (activity.wcl_url) {
      wclBtn.href = activity.wcl_url;
      wclBtn.style.display = '';
    } else {
      wclBtn.style.display = 'none';
    }
  }

  // REQ-033：已挂 WCL 链接（report_code 或 url）的活动显示"从 WCL 同步考勤"（edit-only，viewer 隐藏）
  const wclSyncBtn = document.getElementById('attendanceWclSyncBtn');
  if (wclSyncBtn) {
    wclSyncBtn.style.display = (activity.wcl_report_code || activity.wcl_url) ? '' : 'none';
  }

  // REQ-020：已取消活动——顶部横幅、取消/恢复按钮文案、状态标记控件禁用
  const isCancelled = activity.status === 'cancelled';
  const cancelledBanner = document.getElementById('attendanceCancelledBanner');
  if (cancelledBanner) cancelledBanner.style.display = isCancelled ? '' : 'none';
  const cancelBtn = document.getElementById('activityCancelBtn');
  if (cancelBtn) cancelBtn.textContent = isCancelled ? '恢复活动' : '取消活动';
  document.querySelectorAll('#attendanceBulkBar button').forEach(b => { b.disabled = isCancelled; });
  // REQ-017-A：已取消活动时勾选批量条同样禁用（跟随上方批量四键的禁用逻辑）
  document.querySelectorAll('#attendancePickBar button').forEach(b => { b.disabled = isCancelled; });
  // REQ-017-A：每次打开详情清空勾选状态
  attPickedIds.clear();

  renderAttendanceMembers(activity);
  updateWclImportedBanner(activity); // REQ-037
  openModal('attendanceDetailModal');
}

// ==================== REQ-017-A：考勤区勾选批量标记 ====================
// 只改 UI 状态（各行 status select 的值），保存仍走「保存考勤」按钮（saveAttendance 整表收集）
let attPickedIds = new Set();

function attPickToggle(memberId, checked) {
  if (checked) attPickedIds.add(memberId);
  else attPickedIds.delete(memberId);
  attUpdatePickBar();
}

function attUpdatePickBar() {
  const bar = document.getElementById('attendancePickBar');
  const countEl = document.getElementById('attendancePickCount');
  if (!bar) return;
  bar.style.display = attPickedIds.size > 0 ? 'flex' : 'none';
  if (countEl) countEl.textContent = `已选 ${attPickedIds.size} 人`;
}

// 批量标记：仅作用于勾选成员，与 setAllAttendance 同口径（select 值 + 出勤 checkbox 联动）
function attPickMark(status) {
  attPickedIds.forEach(memberId => {
    const sel = document.querySelector(`.attend-status-select[data-member="${memberId}"]`);
    if (!sel || sel.disabled) return;
    sel.value = status;
    const checkbox = document.querySelector(`.attend-checkbox[data-member="${memberId}"]`);
    if (checkbox) checkbox.checked = status === '出席' || status === '替补' || status === '迟到';
  });
  updateAttendanceStatsLine(); // REQ-055
}

function attPickClear() {
  attPickedIds.clear();
  document.querySelectorAll('.attend-pick-checkbox').forEach(cb => { cb.checked = false; });
  attUpdatePickBar();
}

// ==================== REQ-037：WCL 已导入提示条 ====================
// 显示条件：活动有 wcl_snapshot 且并非全员已标记；隐藏口径（与 REQ-033「已标记」一致）：
// 全部非离队成员都有考勤行且状态非占位「缺席」。N 优先取快照 imported（新快照），旧快照回退为已标记人数。
function updateWclImportedBanner(activity) {
  const banner = document.getElementById('attendanceWclBanner');
  if (!banner) return;
  const snap = activity.wcl_snapshot;
  if (!snap) { banner.style.display = 'none'; return; }
  const members = appData.members.filter(m => m.status !== '离队');
  const marked = members.filter(m => {
    const att = activity.attendees.find(a => a.member_id === m.id);
    return att && att.status && att.status !== '缺席';
  }).length;
  if (members.length > 0 && marked >= members.length) { banner.style.display = 'none'; return; }
  const n = (typeof snap.imported === 'number') ? snap.imported : marked;
  banner.textContent = `已从 WCL 导入 ${n} 人考勤。日志以外的成员请手动标记（请假/替补），未标记的默认缺席。`;
  banner.style.display = '';
}

function renderAttendanceMembers(activity) {
  // REQ-042（软删除）：活跃成员全量展示；已离队成员若在该活动有考勤行（历史记录）也展示，
  // 名字后加灰色「已离队」标记，状态仍可编辑（其考勤行随 saveAttendance 整表收集而保留）
  const members = appData.members.filter(m =>
    m.status !== '离队' || activity.attendees.some(a => a.member_id === m.id));
  const container = document.getElementById('attendanceMembersList');
  const isCancelled = activity.status === 'cancelled'; // REQ-020：已取消活动禁用状态标记控件

  const membersHtml = members.map(m => {
    const attendee = activity.attendees.find(a => a.member_id === m.id);
    const status = attendee ? attendee.status : '缺席';
    const cls = classMap[m.class] || '';
    const checked = status === '出席' || status === '替补' || status === '迟到';
    const departed = m.status === '离队';
    const mainSpec = m.main_spec || m.spec || '';
    const roles = m.role || [];
    const roleTagsHtml = roles.length > 0 ? roles.map(r => {
      const type = roleTypeMap[r] || 'dps';
      return `<span class="member-role-tag ${type}">${r}</span>`;
    }).join(' ') : '';

    return `
      <div class="attend-member-row${departed ? ' member-row-departed' : ''}">
        <input type="checkbox" class="attend-pick-checkbox" data-member="${m.id}" title="选中以批量标记"
               ${attPickedIds.has(m.id) ? 'checked' : ''} ${isCancelled ? 'disabled' : ''}
               onchange="attPickToggle('${m.id}', this.checked)">
        <input type="checkbox" class="attend-checkbox" data-member="${m.id}"
               ${checked ? 'checked' : ''} ${isCancelled ? 'disabled' : ''}
               onchange="toggleAttendStatus(this, '${m.id}')">
        <div class="attend-name">
          <span class="class-${cls}" style="font-weight:500">${memberDisplayName(m)}</span>${departed ? ' <span class="member-departed">（已离队）</span>' : ''}
          <span style="color:var(--text-muted);font-size:11px;margin-left:8px">${classIconHtml(m.class)}${m.class}${mainSpec ? '·' + mainSpec : ''}</span>
          ${roleTagsHtml ? `<span style="margin-left:6px">${roleTagsHtml}</span>` : ''}
        </div>
        <select class="attend-status-select" data-member="${m.id}" ${isCancelled ? 'disabled' : ''} onchange="updateAttendCheckbox(this)">
          <option value="出席" ${status === '出席' ? 'selected' : ''}>出席</option>
          <option value="缺席" ${status === '缺席' ? 'selected' : ''}>缺席</option>
          <option value="迟到" ${status === '迟到' ? 'selected' : ''}>迟到</option>
          <option value="替补" ${status === '替补' ? 'selected' : ''}>替补</option>
          <option value="请假" ${status === '请假' ? 'selected' : ''}>请假</option>
        </select>
      </div>
    `;
  }).join('');

  // 任务书 #27 WP2：已删除成员的考勤行（member_id 为空）按 member_name 快照展示——
  // 灰色黯淡 + 「已删除」徽标，状态只读（不再可编辑）；saveAttendance 整表收集时按原状保留
  const deletedHtml = (activity.attendees || []).filter(a => !a.member_id && a.member_name).map(a => `
    <div class="attend-member-row member-row-departed">
      <span class="attend-deleted-spacer"></span>
      <span class="attend-deleted-spacer"></span>
      <div class="attend-name">
        <span class="member-departed" style="font-weight:500">${a.member_name}</span> <span class="tag tag-grey">已删除</span>
      </div>
      <span class="attend-status-readonly">${a.status}</span>
    </div>
  `).join('');
  container.innerHTML = membersHtml + deletedHtml;

  // REQ-017-A：重绘后剔除已不在名单中的勾选（如 WCL 同步刷新），并同步批量条显隐
  const renderedIds = new Set(members.map(m => m.id));
  attPickedIds.forEach(id => { if (!renderedIds.has(id)) attPickedIds.delete(id); });
  attUpdatePickBar();
  updateAttendanceStatsLine(); // REQ-055：渲染后同步统计行
}

// REQ-055：考勤编辑弹窗实时统计行——从 DOM 下拉当前值聚合（0 项灰显不隐藏，位置稳定）
function updateAttendanceStatsLine() {
  const el = document.getElementById('attendanceStatsLine');
  if (!el) return;
  const counts = { '出席': 0, '替补': 0, '请假': 0, '缺席': 0, '迟到': 0 };
  let total = 0;
  document.querySelectorAll('.attend-status-select').forEach(sel => {
    total++;
    if (counts[sel.value] !== undefined) counts[sel.value]++;
  });
  el.innerHTML = `已登记 ${total} 人：` + Object.entries(counts).map(([k, n]) =>
    `<span class="${n === 0 ? 'att-stat-zero' : ''}">${k} ${n}</span>`).join(' · ');
}

// REQ-020：取消/恢复活动。仅改 activities.status，不删任何考勤记录；
// 统计侧由 getAttendanceStats 过滤 cancelled，恢复正常即重新计入。
let activityCancelling = false;
async function toggleActivityCancelled() {
  if (activityCancelling) return;
  const activity = appData.activities.find(a => a.id === currentActivityId);
  if (!activity) return;
  const cancelling = activity.status !== 'cancelled';
  activityCancelling = true;
  const btn = document.getElementById('activityCancelBtn');
  if (btn) { btn.disabled = true; btn.textContent = '处理中...'; }

  // 严格 DB-first
  try {
    const payload = { ...activity, status: cancelling ? 'cancelled' : 'normal', id: activity.id };
    await cloudCrud('activities', 'update', payload, { renderFn: renderAttendance });
    showToast(cancelling ? '活动已取消，其考勤不再计入出勤率' : '活动已恢复正常', 'success');
    // REQ-047（任务书 #12 补丁2）：成功后自动关闭弹窗，列表灰显/徽标即为可视反馈；
    // 失败时 cloudCrud 已弹错误 toast，弹窗保持打开便于重试
    closeModal('attendanceDetailModal');
  } catch (e) {
    console.error('活动状态变更失败:', e);
  } finally {
    activityCancelling = false;
    if (btn) {
      btn.disabled = false;
      const cur = appData.activities.find(a => a.id === currentActivityId);
      btn.textContent = cur && cur.status === 'cancelled' ? '恢复活动' : '取消活动';
    }
  }
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
  updateAttendanceStatsLine(); // REQ-055
}

function updateAttendCheckbox(select) {
  const memberId = select.dataset.member;
  const checkbox = document.querySelector(`.attend-checkbox[data-member="${memberId}"]`);
  const status = select.value;
  checkbox.checked = status === '出席' || status === '替补' || status === '迟到';
  updateAttendanceStatsLine(); // REQ-055
}

function setAllAttendance(status) {
  document.querySelectorAll('.attend-status-select').forEach(sel => {
    sel.value = status;
    const memberId = sel.dataset.member;
    const checkbox = document.querySelector(`.attend-checkbox[data-member="${memberId}"]`);
    checkbox.checked = status === '出席' || status === '替补' || status === '迟到';
  });
  updateAttendanceStatsLine(); // REQ-055
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
  // BUG-038（任务书 #12 补丁4）：整表重写必须逐行保留已有状态——DOM 名单里没有
  // 但 DB 已有考勤行的成员（如离队历史行），按原状态并入，缺席占位只用于新成员
  const collectedIds = new Set(attendees.map(a => a.member_id));
  (activity.attendees || []).forEach(a => {
    if (!collectedIds.has(a.member_id)) {
      // 任务书 #27 WP2：member_name 快照随保留行原样携带（含已删除成员的 member_id 空行）
      attendees.push({ member_id: a.member_id, member_name: a.member_name || '', status: a.status, notes: a.notes || '' });
    }
  });
  
  // 严格 DB-first
  try {
    const payload = { ...activity, attendees, id: activity.id };
    await cloudCrud('activities', 'update', payload, { renderFn: renderAttendance });
    showToast('考勤已保存', 'success');
    closeModal('attendanceDetailModal'); // 任务书 #47 WP2-#3：成功才关弹窗（失败保弹窗便于重试）
  } catch (e) {
    console.error('考勤保存失败:', e);
  } finally {
    attendanceSaving = false;
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset.originalText || '保存考勤'; }
  }
}

let activityDeleting = false;

async function deleteCurrentActivity() {
  if (activityDeleting) return; // 任务书 #10：防重复点击
  if (!confirm('确定要删除这个活动吗？此操作不可撤销。')) return;
  const activity = appData.activities.find(a => a.id === currentActivityId);
  activityDeleting = true;
  const delBtn = document.getElementById('activityDeleteBtn');
  if (delBtn) { delBtn.dataset.originalText = delBtn.textContent; delBtn.disabled = true; delBtn.textContent = '删除中...'; }

  // 严格 DB-first
  try {
    if (activity) {
      await cloudCrud('activities', 'delete', { id: activity.id }, { renderFn: renderAttendance });
    }
    showToast('活动已删除', 'success');
    closeModal('attendanceDetailModal'); // 任务书 #47 WP2-#3：成功才关弹窗（失败保弹窗便于重试）
  } catch (e) {
    console.error('活动删除失败:', e);
  } finally {
    activityDeleting = false;
    if (delBtn) { delBtn.disabled = false; delBtn.textContent = delBtn.dataset.originalText || '删除活动'; }
  }
}

// ==================== REQ-033：WCL 同步考勤（任务书 #11） ====================

// 调 server.js 的 WCL 代理端点（与 cloud.js 代理写同一途径取 JWT；后端中文 message 直接透出）
async function wclApiPost(path, body) {
  const token = await window.CloudSync.getAccessToken();
  if (!token) throw new Error('未登录，请先登录');
  const resp = await fetch(path, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  let data = null;
  try { data = await resp.json(); } catch { data = null; }
  if (!resp.ok) throw new Error((data && data.message) || `WCL 请求失败 (${resp.status})`);
  return data;
}

// activity_attendance 直写 server.js 代理（与 cloud.js syncActivity 内批量插入同一途径）
async function wclAttendanceWrite(method, body, query, token) {
  const resp = await fetch('/api/db/rest/v1/activity_attendance' + (query ? `?${query}` : ''), {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const text = await resp.text();
    let msg = text;
    try { msg = JSON.parse(text).message || text; } catch { /* 保留原文 */ }
    throw new Error(msg);
  }
}

// 考勤状态中文 → DB 英文（与 cloud.js mapStatusToDb 同口径）
const wclAttStatusToDb = { '出席': 'present', '缺席': 'absent', '迟到': 'late', '替补': 'backup', '请假': 'leave' };

// 同步预览行：{name, server, subType, cls, bossFights, zone:'full'|'partial'|'unmatched', memberId, status, ignored}
let wclSyncRows = [];
let wclSyncMeta = null; // { activityId, reportCode, title, bossFightTotal, preservedCount }
let wclSyncDirty = false; // 弹窗防误关：忽略过角色即视为有未确认数据（状态改动由 isModalFormDirty 捕获）
let wclSyncing = false;

async function syncAttendanceFromWcl() {
  if (wclSyncing) return; // 防重复点击
  const activity = appData.activities.find(a => a.id === currentActivityId);
  if (!activity) return;
  // reportCode 优先取活动的 wcl_report_code，fallback 从 wcl_url 正则提取
  const reportCode = activity.wcl_report_code || ((parseWclUrl(activity.wcl_url) || {}).code);
  if (!reportCode) { showToast('该活动的 WCL 链接缺少报告编号，请编辑活动重新保存链接', 'error'); return; }
  const guild = window.CloudSync.getCurrentGuild();
  if (!guild) { showToast('请先选择公会', 'error'); return; }
  const btn = document.getElementById('attendanceWclSyncBtn');
  wclSyncing = true;
  if (btn) { btn.disabled = true; btn.textContent = '同步中...'; }
  try {
    const data = await wclApiPost('/api/wcl/report-summary', { reportCode, guildId: guild.id });
    buildWclSyncPreview(activity, reportCode, data);
    openModal('wclSyncModal');
  } catch (e) {
    console.error('WCL 同步考勤失败:', e);
    showToast(e.message || 'WCL 报告解析失败', 'error');
  } finally {
    wclSyncing = false;
    if (btn) { btn.disabled = false; btn.textContent = '🔄 从 WCL 同步考勤'; }
  }
}

// 与成员管理名单对照，构建三分区预览数据
function buildWclSyncPreview(activity, reportCode, data) {
  const bossFightTotal = data.bossFightTotal || 0;
  // "已手动标记"口径：创建活动时会给全员预置"缺席"占位行（saveActivity），
  // 真正手动标过的状态（出席/迟到/替补/请假）一律不动、计入保留数
  // REQ-046（任务书 #13）：保留名单同时存明细（成员名：状态），预览页悬浮展开
  const preservedList = activity.attendees
    .filter(a => a.status && a.status !== '缺席')
    .map(a => {
      const m = appData.members.find(mm => mm.id === a.member_id);
      return { name: m ? m.name : '（名单外成员）', status: a.status };
    });
  const preservedCount = preservedList.length;
  const members = appData.members.filter(m => m.status !== '离队');
  wclSyncRows = (data.players || []).map(p => {
    const cls = wowClassEnToCn[(p.subType || '').toUpperCase()] || '';
    const base = {
      name: p.name, server: p.server || '', subType: p.subType || '', cls,
      bossFights: p.bossFights || 0, memberId: null, status: '出席', ignored: false
    };
    // 按角色名逐一匹配（REQ-095 统一口径：单候选宽松、多候选须 (name,server) 精确相等），
    // 同一人多个号各算各的，不做合并
    const member = matchMemberByNameServer(members, p.name, p.server || '');
    if (!member) return { ...base, zone: 'unmatched' };
    // 已手动标记（非占位"缺席"）的成员不进预览，同步一律不动
    const att = activity.attendees.find(a => a.member_id === member.id);
    if (att && att.status && att.status !== '缺席') return null;
    return { ...base, memberId: member.id, zone: base.bossFights >= bossFightTotal ? 'full' : 'partial' };
  }).filter(Boolean);
  wclSyncMeta = { activityId: activity.id, reportCode, title: data.title || '', bossFightTotal, preservedCount, preservedList };
  wclSyncDirty = false;
  wclPreservedOpen = false; // REQ-046：展开状态不记住，每次打开预览默认收起
  renderWclSyncPreview();
}

function renderWclSyncPreview() {
  const meta = wclSyncMeta;
  if (!meta) return;
  const full = wclSyncRows.filter(r => r.zone === 'full');
  const partial = wclSyncRows.filter(r => r.zone === 'partial');
  const unmatched = wclSyncRows.filter(r => r.zone === 'unmatched');
  document.getElementById('wclSyncSubtitle').textContent = meta.title ? `📊 ${meta.title}（BOSS 战共 ${meta.bossFightTotal} 场）` : '';
  document.getElementById('wclSyncStats').innerHTML =
    `自动出席 <strong style="color:var(--success)">${full.length}</strong> · ` +
    `部分参战 <strong style="color:var(--warning)">${partial.length}</strong> · ` +
    `未匹配 <strong style="color:var(--danger)">${unmatched.filter(r => !r.ignored).length}</strong>`;

  const statusSelect = (r, i, opts) =>
    `<select class="form-select" id="wclSyncStatus${i}" style="height:26px;padding:2px 6px;width:76px" onchange="wclSyncSetStatus(${i},this.value)">` +
    opts.map(o => `<option value="${o}" ${r.status === o ? 'selected' : ''}>${o}</option>`).join('') + '</select>';
  const rowShell = (i, cls, inner) =>
    `<div class="wcl-sync-row ${cls}">${inner}</div>`;
  const nameHtml = r =>
    `<span style="font-weight:500">${r.name}</span>` +
    `<span style="color:var(--text-muted);font-size:11px;margin-left:8px">${r.cls || r.subType || '未知职业'}${r.server ? ' · ' + r.server : ''}</span>`;

  let html = '';
  // ① 自动出席（绿）：同名且参战场次 = BOSS 总场次，默认出席，可改替补/缺席
  if (full.length) {
    html += `<div class="wcl-sync-zone"><div class="wcl-sync-zone-title" style="color:var(--success)">① 自动出席（${full.length}）</div>`;
    html += full.map(r => {
      const i = wclSyncRows.indexOf(r);
      return rowShell(i, 'wcl-sync-full', `${nameHtml(r)}
        <span style="color:var(--text-muted);font-size:11px;margin-left:8px">参战 ${r.bossFights}/${meta.bossFightTotal} 场</span>
        <span style="margin-left:auto">${statusSelect(r, i, ['出席', '替补', '缺席'])}</span>`);
    }).join('') + '</div>';
  }
  // ② 部分参战（黄）：同名但参战场次 < BOSS 总场次，默认出席，可改替补
  if (partial.length) {
    html += `<div class="wcl-sync-zone"><div class="wcl-sync-zone-title" style="color:var(--warning)">② 部分参战（${partial.length}）</div>`;
    html += partial.map(r => {
      const i = wclSyncRows.indexOf(r);
      return rowShell(i, 'wcl-sync-partial', `${nameHtml(r)}
        <span style="color:var(--warning);font-size:11px;margin-left:8px">仅参加 ${r.bossFights}/${meta.bossFightTotal} 场 BOSS 战，可改为替补</span>
        <span style="margin-left:auto">${statusSelect(r, i, ['出席', '替补'])}</span>`);
    }).join('') + '</div>';
  }
  // ③ 未匹配（红）：log 有、成员管理没有，不写入考勤；可添加为成员 / 忽略
  if (unmatched.length) {
    html += `<div class="wcl-sync-zone"><div class="wcl-sync-zone-title" style="color:var(--danger)">③ 未匹配（${unmatched.length}）</div>`;
    html += unmatched.map(r => {
      const i = wclSyncRows.indexOf(r);
      // BUG-026：已成功添加为成员的行标「已添加」灰显，不再可操作
      if (r.added) {
        return rowShell(i, 'wcl-sync-unmatched', `<span style="color:var(--text-muted)">${r.name}</span>
          <span style="color:var(--success);font-size:11px;margin-left:8px">✓ 已添加到成员管理</span>`);
      }
      if (r.ignored) {
        return rowShell(i, 'wcl-sync-unmatched', `<span style="color:var(--text-muted);text-decoration:line-through">${r.name}</span>
          <span style="color:var(--text-muted);font-size:11px;margin-left:8px">已忽略</span>
          <span style="margin-left:auto"><button type="button" class="btn btn-sm" onclick="wclSyncIgnoreRow(${i})">恢复</button></span>`);
      }
      return rowShell(i, 'wcl-sync-unmatched', `${nameHtml(r)}
        <span style="color:var(--danger);font-size:11px;margin-left:8px">该角色不在成员管理名单中</span>
        <span style="margin-left:auto;display:flex;gap:6px">
          <button type="button" class="btn btn-sm btn-primary" onclick="wclSyncAddAsMember(${i})">添加为成员</button>
          <button type="button" class="btn btn-sm" onclick="wclSyncIgnoreRow(${i})">忽略</button>
        </span>`);
    }).join('') + '</div>';
  }
  if (!html) {
    html = '<div style="color:var(--text-muted);font-size:13px;padding:12px 0">没有需要同步的考勤（成员管理中的角色均已手动标记，或报告中无匹配角色）。</div>';
  }
  // REQ-046 方案变更（任务书 #13-补丁2）：第四区「已手动标记」折叠区——默认收起，
  // 点击就地展开完整列表（替代悬浮浮层：弹窗堆叠中空间不可控、19 条必然截断，已废弃）
  if (meta.preservedCount > 0) {
    html += `<div class="wcl-sync-zone wcl-preserved-zone">
      <div class="wcl-sync-zone-title wcl-preserved-header" onclick="wclPreservedToggle()">
        已手动标记（${meta.preservedCount}），将被保留 <span class="wcl-preserved-caret">${wclPreservedOpen ? '▾' : '▸'}</span>
      </div>
      <div class="wcl-preserved-body" style="display:${wclPreservedOpen ? '' : 'none'}">
        ${(meta.preservedList || []).map(p =>
          `<div class="wcl-preserved-line"><span>${p.name}</span><span>${p.status}</span></div>`).join('')}
      </div>
    </div>`;
  }
  document.getElementById('wclSyncPreviewList').innerHTML = html;
}

// REQ-046 方案变更：折叠区展开/收起（展开状态不记住，每次打开预览默认收起，见 buildWclSyncPreview）
let wclPreservedOpen = false;
function wclPreservedToggle() {
  wclPreservedOpen = !wclPreservedOpen;
  renderWclSyncPreview();
}

function wclSyncSetStatus(i, value) {
  const r = wclSyncRows[i];
  if (!r) return;
  r.status = value; // 脏标记由 isModalFormDirty（select 带 id）捕获
}

function wclSyncIgnoreRow(i) {
  const r = wclSyncRows[i];
  if (!r) return;
  r.ignored = !r.ignored;
  wclSyncDirty = true;
  renderWclSyncPreview();
}

// ③ 区"添加为成员"：预填进智能导入预览页（复用 REQ-032 预览/查重/入库全链路）
// BUG-026（任务书 #12 补丁）：先关同步弹窗再开导入弹窗——两个 .modal-overlay 同 z-index
// 按 DOM 序后者在上，wclSyncModal 在 importMembersModal 之后，不关闭会把导入弹窗完全压住，
// 表现为"点击无任何反应"。导入成功后由 importConfirmRoster 对 _pendingAdd 行重跑对照匹配
// （BUG-032：命中新成员即移入①/②分区），并重开同步预览。
function wclSyncAddAsMember(i) {
  const r = wclSyncRows[i];
  if (!r || r.added || r._pendingAdd) return; // 防重复点击
  try {
    // REQ-002（软删除）：dup 判定只针对活跃成员；撞已离队成员不判重，确认导入时走恢复链路
    // REQ-095：查重走 matchMemberByNameServer 统一口径
    const activeMembers = appData.members.filter(m => !isDepartedStatus(m.status));
    const dup = r.cls ? !!matchMemberByNameServer(activeMembers, r.name, r.server) : false;
    const status = !r.cls ? 'bad' : (dup ? 'dup' : 'ok');
    importPreviewRows = [{ name: r.name, cls: r.cls, server: r.server, include: status === 'ok', status }];
    importSource = 'wcl';
    importWclTitle = wclSyncMeta ? wclSyncMeta.title : '';
    document.getElementById('importTabPaste').classList.remove('active');
    document.getElementById('importTabWcl').classList.add('active');
    showImportPreviewStep();
    r._pendingAdd = true;
    closeModal('wclSyncModal');
    openModal('importMembersModal');
  } catch (e) {
    console.error('WCL 添加为成员失败:', e);
    showToast('添加失败：' + (e.message || '未知错误'), 'error');
  }
}

// 防重复提交标志
let wclSyncWriting = false;

async function wclSyncConfirm() {
  if (wclSyncWriting) return;
  const meta = wclSyncMeta;
  if (!meta) return;
  const activity = appData.activities.find(a => a.id === meta.activityId);
  if (!activity) { showToast('活动不存在，请刷新后重试', 'error'); return; }
  const rows = wclSyncRows.filter(r => r.zone !== 'unmatched'); // ③ 未匹配角色一律不写考勤
  if (!rows.length) { showToast('没有可写入的考勤记录', 'error'); return; }
  const btn = document.getElementById('wclSyncConfirmBtn');
  const writingHint = document.getElementById('wclSyncWritingHint');
  wclSyncWriting = true;
  btn.disabled = true;
  btn.textContent = '写入中...';
  if (writingHint) writingHint.style.display = ''; // REQ-038：写入期间常驻提示
  try {
    const token = await window.CloudSync.getAccessToken();
    if (!token) throw new Error('未登录，请先登录');
    let added = 0, kept = 0;
    // 规范 1.2.2 批处理例外：循环写入 activity_attendance（代理），完成后统一 reload 一次
    for (const r of rows) {
      // 幂等：写前再查已有考勤，已手动标记（非占位"缺席"）的一律不动；重复点同步不产生重复记录
      const att = activity.attendees.find(a => a.member_id === r.memberId);
      if (att && att.status && att.status !== '缺席') { kept++; continue; }
      const dbStatus = wclAttStatusToDb[r.status] || 'present';
      if (att) {
        // 占位"缺席"行 → 更新为同步状态
        await wclAttendanceWrite('PATCH', { status: dbStatus }, `activity_id=eq.${meta.activityId}&member_id=eq.${r.memberId}`, token);
      } else {
        await wclAttendanceWrite('POST', { activity_id: meta.activityId, member_id: r.memberId, status: dbStatus }, '', token);
      }
      added++;
    }

    // 写入成功后把参战名单快照存入 activities.wcl_snapshot（JSONB，WCL 免费日志约 2 年过期，快照保永久）
    // 走 cloudCrud 更新活动；payload 不带 attendees，syncActivity 不会整表重写考勤
    let snapshotOk = true;
    try {
      await cloudCrud('activities', 'update', {
        id: activity.id,
        date: activity.date,
        raid_name: activity.raid_name,
        start_time: activity.start_time,
        end_time: activity.end_time,
        notes: activity.notes || '',
        boss: activity.boss || '',
        wcl_url: activity.wcl_url || '',
        wcl_report_code: activity.wcl_report_code || '',
        wcl_snapshot: {
          report_code: meta.reportCode,
          title: meta.title,
          synced_at: new Date().toISOString(),
          boss_fight_total: meta.bossFightTotal,
          imported: added, // REQ-037：本次实际写入人数（提示条 N 的持久来源，刷新页面后仍准确）
          players: wclSyncRows.map(r => ({ name: r.name, server: r.server, subType: r.subType, bossFights: r.bossFights }))
        }
      }, { renderFn: renderAttendance });
    } catch (e) {
      snapshotOk = false;
      if (/wcl_snapshot|column/i.test((e && e.message) || '')) {
        showToast('考勤已写入，但快照保存失败：请先在数据库执行 sql/07 增量（activities 表加 wcl_snapshot 列）', 'error');
      }
      // 快照失败不影响已写入的考勤，手动 reload 一次保证界面是最新
      await window.CloudSync.reloadData('activities');
      saveData();
      renderAttendance();
    }

    wclSyncDirty = false;
    closeModal('wclSyncModal');
    // 考勤详情弹窗在下层仍开着，同步刷新成员状态列表
    const act = appData.activities.find(a => a.id === meta.activityId);
    if (act) { renderAttendanceMembers(act); updateWclImportedBanner(act); } // REQ-037：刷新提示条
    if (snapshotOk) {
      showToast(`同步完成：新增 ${added} 条考勤，保留 ${kept} 条手动标记`, 'success');
    }
  } catch (e) {
    console.error('WCL 同步考勤写入失败:', e);
    showToast('同步失败：' + (e.message || '云端同步出错'), 'error');
    // 任务书 #47 WP2-#4：循环写中途抛错 = 前 N-1 行已落库的部分写——必须 reload 让界面与库一致，
    // 否则考勤详情停留旧状态（同族「写成功（部分）但 UI 不刷新」）
    try {
      await window.CloudSync.reloadData('activities');
      saveData();
      renderAttendance();
    } catch (e2) { console.error('同步失败后 reload 失败:', e2); }
  } finally {
    wclSyncWriting = false;
    btn.disabled = false;
    btn.textContent = '确认写入考勤';
    if (writingHint) writingHint.style.display = 'none'; // REQ-038：完成/失败后消失
  }
}

// WCL 导入
function showWCLImportModal() {  document.getElementById('wclUrl').value = '';
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
  // BUG-014：报表页尊重用户自选时间范围，算法与仪表盘/成员列表同源
  // 任务书 #27 WP2：报表含已删除成员伪行（灰色「已删除」，其历史考勤仍计入）
  const rankings = getAttendanceRankings(getFilteredActivities(), true);
  
  // 排名表格
  const tbody = document.getElementById('rankTableBody');
  if (!rankings.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">📊</div><div class="empty-text">暂无数据</div></div></td></tr>`;
  } else {
    tbody.innerHTML = rankings.map((item, i) => {
      const cls = classMap[item.member.class] || '';
      // 已删除伪成员：名字灰色黯淡 + 「已删除」小徽标，职业列无数据
      // BUG-071（任务书 #33）：伪行名字 td 加 rank-deleted-name 专属类（徽标折行修最小选择器锚点，文案/语义零改动）；
      // 名字与徽标间的折行空格去掉（间距由徽标 margin-left 承担，压缩名字列 min-content 保 468 无横滚）
      const nameHtml = item.member.deleted
        ? `<span class="member-departed" style="font-weight:500">${item.member.name}</span><span class="tag tag-grey">已删除</span>`
        : `<span style="font-weight:500">${memberDisplayName(item.member)}</span>`;
      return `
        <tr>
          <td><div class="rank-num" style="margin:auto">${i + 1}</div></td>
          <td class="class-${cls}${item.member.deleted ? ' rank-deleted-name' : ''}">${nameHtml}</td>
          <td>${item.member.class || '—'}</td>
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
      <div class="rank-name class-${classMap[item.member.class] || ''}">${item.member.deleted ? item.member.name : memberDisplayName(item.member)}${item.member.deleted ? ' <span class="tag tag-grey">已删除</span>' : ''}</div>
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
  let chartW = w - padding.left - padding.right;
  let chartH = h - padding.top - padding.bottom;
  
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
  // BUG-043（任务书 #13-补丁2）：成员名超过约 6 个时 X 轴标签旋转 45°，柱宽/间距随数量自适应；
  // 长名截断加省略号，完整名单由下方排名表提供，canvas title 兜底全名悬浮
  const rotateLabels = data.length > 6;
  if (rotateLabels) {
    padding.bottom = 64;
    chartW = w - padding.left - padding.right;
    chartH = h - padding.top - padding.bottom;
  }
  canvas.title = data.map(d => d.member.name).join('、');
  
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
    
    // X轴标签（BUG-043：超 6 个旋转 45°，长名 6 字截断加省略号，canvas title 悬浮全名）
    ctx.fillStyle = '#8b949e';
    ctx.font = '10px sans-serif';
    const name = item.member.name.length > 6 ? item.member.name.slice(0, 6) + '…' : item.member.name;
    if (rotateLabels) {
      ctx.save();
      ctx.translate(x + barWidth / 2, padding.top + chartH + 6);
      ctx.rotate(-Math.PI / 4);
      ctx.textAlign = 'right';
      ctx.fillText(name, 0, 10);
      ctx.restore();
    } else {
      ctx.textAlign = 'center';
      ctx.fillText(name, x + barWidth / 2, padding.top + chartH + 18);
    }
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
  
  // 获取最近10次活动（REQ-020：已取消活动无真实出勤，不进出勤趋势图）
  const recent = [...appData.activities].filter(a => a.status !== 'cancelled').sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-10);
  
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
  
  const raids = getGameRaidNames().concat(['其他']); // 任务书 #14：团本清单读主数据
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
  
  const bosses = getGameBossNames(raid); // 任务书 #14：BOSS 清单读主数据
  
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

// REQ-022：Roll 值循环步进（1↓→100，100↑→1），空值时 ↑=1、↓=100
function rollStep(delta) {
  const input = document.getElementById('lootRollValue');
  if (!input) return;
  let v = parseInt(input.value, 10);
  if (isNaN(v)) {
    input.value = delta > 0 ? 1 : 100;
    return;
  }
  v += delta;
  if (v > 100) v = 1;
  if (v < 1) v = 100;
  input.value = v;
}

// REQ-022：键盘上下箭头同样走循环逻辑
function rollKeyStep(event) {
  if (event.key === 'ArrowUp') { event.preventDefault(); rollStep(1); }
  else if (event.key === 'ArrowDown') { event.preventDefault(); rollStep(-1); }
}

// REQ-022：手动输入时锁定范围 1-100（空值允许，表示未 Roll）
function rollClamp() {
  const input = document.getElementById('lootRollValue');
  if (!input || input.value === '') return;
  let v = parseInt(input.value, 10);
  if (isNaN(v)) { input.value = ''; return; }
  input.value = Math.min(100, Math.max(1, v));
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
        <td colspan="14">
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
    // REQ-008："心愿"独立成列，非心愿装备显示 —
    const wishlistBadge = loot.is_wishlist ? '<span class="badge" style="background:#f0c060;color:#0d1117">心愿</span>' : '<span style="color:var(--text-muted)">—</span>';
    // REQ-042（软删除）+ 任务书 #27 WP2：assignedTo 为名字快照（member_name 优先）。
    // BUG-059（任务书 #27-补丁2，方案 C 运营拍板）：分配人解析 id 优先、名字回退——
    // A：character_id 非空按 id 在成员表（含离队）精确定位，同名零碰撞；id 定位不到 = 已彻底删除 →「已删除」；
    // B：id 为空的存量行按名字匹配（放行离队命中、按真实状态显示）→ 垃圾桶名单 →「已删除」→ 兜底「已离队」。
    // 已知限制（在案不追求两全）：同名一删一留的存量 NULL 行，显示方向以在册成员为准
    const deletedNames = appData.deletedMemberNames || new Set();
    let assignedMember = null;
    let assignedMark = ''; // ''=在队（职业色 chip）/ 'departed'=已离队 / 'deleted'=已删除
    if (loot.character_id) {
      assignedMember = appData.members.find(m => m.id === loot.character_id) || null;
      assignedMark = assignedMember ? (assignedMember.status === '离队' ? 'departed' : '') : 'deleted';
    } else if (loot.assignedTo) {
      assignedMember = appData.members.find(m => m.name === loot.assignedTo) || null;
      assignedMark = assignedMember
        ? (assignedMember.status === '离队' ? 'departed' : '')
        : (deletedNames.has(loot.assignedTo) ? 'deleted' : 'departed');
    }
    const assignedToHtml = !loot.assignedTo
      ? '-'
      : assignedMark === ''
        ? memberChipHtml(assignedMember)
        : `<span class="member-departed">${loot.assignedTo}（${assignedMark === 'deleted' ? '已删除' : '已离队'}）</span>`;
    
    return `
      <tr>
        <td><span class="loot-name">${loot.name}</span>${loot.effect ? `<div class="loot-effect-green" style="font-size:11px;margin-top:2px" title="${loot.effect.replace(/"/g, '&quot;')}">${loot.effect.length > 30 ? loot.effect.slice(0, 30) + '…' : loot.effect}</div>` : ''}</td>
        <td class="center">${wishlistBadge}</td>
        <td><span class="wishlist-raid-tag">${loot.raid || '-'}</span></td>
        <td>${loot.difficulty || ''}</td>
        <td>${loot.boss || ''}</td>
        <td>${loot.slot || ''}</td>
        <td>${loot.primaryStat || ''}</td>
        <td><div class="loot-secondary-stats">${secondaryStatsHtml || '-'}</div></td>
        <td>${assignedToHtml}${claimerLabelHtml(assignedMark === '' ? assignedMember : null)}</td>
        <td class="center"><span class="badge ${statusBadge}">${loot.status || '待分配'}</span></td>
        <td>${distMethodText}</td>
        <td class="num">${rollText}</td>
        <td>${loot.date || '-'}</td>
        <td class="center">
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
// REQ-095（任务书 #45 WP5）：option value = 成员 id（同名歧义根治），显示文本走 memberDisplayName 消歧；
// 名单外自定义名仍允许（无 id，value 原样存名字）——selectedId 为成员 id，customName 为无 id 的存量/手输名
function lootInitMemberSelect(selectedId = '', customName = '') {
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
    const dispName = memberDisplayName(m);
    const displayText = mainSpec ? `${dispName} · ${m.class} · ${mainSpec}` : `${dispName} · ${m.class}`;
    const selected = selectedId && m.id === selectedId ? 'selected' : '';
    const color = classColors[m.class] || 'var(--text-primary)';
    optionsHtml += `<option value="${m.id}" ${selected} style="color:${color}">${displayText}</option>`;
  });

  // 如果有自定义输入的名字（不在成员列表中 / 无 id 的存量行），也加上
  if (customName && !members.find(m => m.id === selectedId)) {
    optionsHtml += `<option value="${customName}" selected>${customName} · （自定义）</option>`;
  }

  select.innerHTML = optionsHtml;

  // 设置选中项的文字颜色（职业色）
  const selMember = selectedId ? members.find(m => m.id === selectedId) : null;
  if (selMember && classColors[selMember.class]) {
    select.style.color = classColors[selMember.class];
  } else {
    select.style.color = 'var(--text-primary)';
  }
}

// 更新装备分配-成员信息展示
function lootUpdateMemberInfo() {
  const select = document.getElementById('lootAssignedTo');
  const infoDiv = document.getElementById('lootMemberInfo');
  if (!select || !infoDiv) return;
  
  // REQ-095（WP5）：下拉值 = 成员 id（名单内）或自定义名（名单外）
  const selectVal = select.value;
  
  const classColors = {
    '战士': '#C79C6E', '法师': '#69CCF0', '牧师': '#FFFFFF',
    '盗贼': '#FFF569', '猎人': '#ABD473', '圣骑士': '#F58CBA',
    '萨满': '#0070DE', '德鲁伊': '#FF7D0A', '术士': '#9482C9',
    '武僧': '#00FF96', '恶魔猎手': '#A330C9', '死亡骑士': '#C41E3A',
    '唤魔师': '#33937F'
  };
  
  // 更新select选中项的文字颜色
  if (!selectVal) {
    infoDiv.style.display = 'none';
    select.style.color = 'var(--text-primary)';
    return;
  }

  const member = (appData.members || []).find(m => m.id === selectVal);
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
        <span class="lmi-name" style="color:${classColor}">${memberDisplayName(member)}</span>
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
      // 初始化成员下拉并选中（REQ-095/WP5：character_id 优先；无 id 存量行走自定义名兜底）
      lootInitMemberSelect(loot.character_id || '', loot.assignedTo || '');
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
    lootInitMemberSelect();
    document.getElementById('lootStatus').value = '待分配';
    document.getElementById('lootPriority').value = 'P2';
    document.getElementById('lootDate').value = formatDate(new Date());
    document.getElementById('lootNote').value = '';
    document.getElementById('lootDistributionMethod').value = 'custom';
    document.getElementById('lootSeason').value = '';
    document.getElementById('lootPlayerAction').value = 'none';
    document.getElementById('lootRollValue').value = '';
    // REQ-025：新建装备时自动带入公会分配规则说明（仅预填，不回写公会设置）
    const guildProfile = window.CloudSync.getCurrentGuild() || {};
    document.getElementById('lootRuleNote').value = guildProfile.loot_rule_text || '';
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

  // REQ-095（任务书 #45 WP5）：分配人下拉 value = 成员 id（名单内）或自定义名（名单外，无 id）。
  // 是 id 则 character_id=id + assignedTo=该成员裸名（名字快照语义不变）；自定义名则 character_id=null。
  const assignedVal = document.getElementById('lootAssignedTo').value.trim();
  const assignedMemberRow = assignedVal
    ? (appData.members || []).find(m => m.id === assignedVal)
    : null;
  const lootCharacterId = assignedMemberRow ? assignedMemberRow.id : null;

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
    assignedTo: assignedMemberRow ? assignedMemberRow.name : assignedVal,
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
    const payload = { ...lootData, character_id: lootCharacterId, id: lootEditingId || undefined };
    await cloudCrud('loots', isEdit ? 'update' : 'add', payload, { renderFn: lootRender });

    // 联动心愿单：将分配状态变化同步到数据库（REQ-095/WP5：携 character_id，联动按 id 优先匹配）
    await syncWishlistLinkages({ ...lootData, character_id: lootCharacterId }, oldLoot);

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

  // REQ-095（任务书 #45 WP5）：心愿行匹配——有 character_id 按 id 匹配 memberId（同名零碰撞）；
  // 无 id 的存量/自定义名行保留按名回退
  const wishMemberMatch = (w, loot) =>
    loot.character_id ? w.memberId === loot.character_id : w.memberName === loot.assignedTo;

  try {
    // 1. 从已分配变为非已分配：取消对应心愿单的已获取标记
    if (wasAssigned && !isAssigned) {
      await window.CloudSync.reloadData('wishlists');
      const toUnmark = (appData.wishlist || []).filter(w =>
        w.obtained &&
        w.itemName.toLowerCase() === oldLoot.name.toLowerCase() &&
        wishMemberMatch(w, oldLoot)
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
        wishMemberMatch(w, newLoot)
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

      // REQ-007：勾选"心愿单装备"且该成员心愿单中无此装备记录 → 自动创建并直接标记已获取
      // （优先级取默认值 P2，来源备注"装备分配联动"；规范 1.2.2：写入后统一 reload）
      if (newLoot.is_wishlist) {
        const existsAny = (appData.wishlist || []).some(w =>
          w.itemName.toLowerCase() === newLoot.name.toLowerCase() &&
          wishMemberMatch(w, newLoot)
        );
        if (!existsAny) {
          // REQ-095（WP5）：有 character_id 按 id 定位成员，无 id（自定义名）按名回退
          const member = newLoot.character_id
            ? appData.members.find(m => m.id === newLoot.character_id)
            : appData.members.find(m => m.name === newLoot.assignedTo);
          if (member) {
            await cloudCrud('wishlists', 'add', {
              id: genId(),
              memberId: member.id,
              memberName: member.name,
              itemName: newLoot.name,
              raid: newLoot.raid || '',
              boss: newLoot.boss || '',
              category: newLoot.category || '',
              slot: newLoot.slot || '',
              priority: 'P2',
              spec: 'main',
              specName: member.main_spec || member.spec || '',
              obtained: true,
              obtainedDate: newLoot.date || formatDate(new Date()),
              note: '装备分配联动',
              createdAt: Date.now(),
              updatedAt: Date.now()
            }, { renderFn: () => {} });
            hasChanges = true;
            showToast('已自动创建心愿单记录并标记已获取', 'success');
          } else {
            console.warn('REQ-007 联动跳过：未找到成员', newLoot.assignedTo);
          }
        }
      }
    }

    // 统一刷新
    if (hasChanges) {
      await window.CloudSync.reloadData('wishlists');
      saveData();
      if (typeof wishlistRender === 'function') wishlistRender();
    }
  } catch (e) {
    // 任务书 #47 WP2-#5：联动失败禁止静默（规范 §4.5）——主对象（装备）确已保存，
    // 联动可能半同步（部分心愿行已更新、收尾 reload 被跳过）；warning 级明示 + 尝试兜底刷新心愿缓存
    console.error('心愿单联动同步失败:', e);
    showToast('装备已保存，但心愿单联动同步失败——请核对心愿单「已获取」状态', 'warning');
    try {
      await window.CloudSync.reloadData('wishlists');
      saveData();
      if (typeof wishlistRender === 'function') wishlistRender();
    } catch (e2) { console.error('联动失败后 reload 失败:', e2); }
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

    const bosses = getGameBossNames(raid); // 任务书 #14：BOSS 清单读主数据
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
      appData.members.map(m => `<option value="${m.id}">${memberDisplayName(m)}</option>`).join('');
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

    return `
      <tr>
        <td><input type="checkbox" class="wishlist-row-checkbox" value="${w.id}" onchange="wishlistOnRowCheckboxChange()" ${wishlistSelectedIds.has(w.id) ? 'checked' : ''}></td>
        <td><span class="wishlist-item-name">${w.itemName}</span></td>
        <td><span class="wishlist-raid-tag">${w.raid || '-'}</span></td>
        <td>${w.boss || '-'}</td>
        <td>${w.slot || '-'}</td>
        <td>${memberChipHtml(member, memberName)}${claimerLabelHtml(member)}</td>
        <td class="center"><span class="badge ${priorityBadge}">${w.priority || 'P2'}</span></td>
        <td><span class="badge ${specBadge}">${specText}</span>${w.specName ? ` ${specChipHtml(member ? member.class : '', w.specName)}` : ''}</td>
        <td class="center">
          <span class="badge ${statusBadge}">${statusText}</span>
          ${w.obtained && w.obtainedDate ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px">${w.obtainedDate}</div>` : ''}
        </td>
        <td class="center">
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
    appData.members.map(m => `<option value="${m.id}">${memberDisplayName(m)} (${m.class})</option>`).join('');

  // 渲染成员多选列表（添加模式用）
  wishlistRenderMemberCheckboxes();

  // 切换成员选择方式
  document.getElementById('wishlistMemberMulti').style.display = isEdit ? 'none' : 'block';
  memberSelect.style.display = isEdit ? 'block' : 'none';

  // 填充团本下拉（任务书 #14：主数据清单 + 其他）
  const raidSelect = document.getElementById('wishlistRaid');
  const raidOptions = getGameRaidNames().map(r => `<option value="${r}">${r}</option>`).join(''); // 任务书 #14：团本清单读主数据
  raidSelect.innerHTML = raidOptions + '<option value="其他">其他</option>';

  if (isEdit) {
    document.getElementById('wishlistModalTitle').textContent = '编辑心愿';
    const wish = (appData.wishlist || []).find(w => w.id === wishId);
    if (wish) {
      document.getElementById('wishlistMember').value = wish.memberId || '';
      document.getElementById('wishlistItemName').value = wish.itemName || '';

      // 设置团本
      const raidVal = wish.raid || '虚影尖塔';
      if (getGameRaidNames().includes(raidVal)) {
        raidSelect.value = raidVal;
      } else {
        raidSelect.value = '其他';
      }
      // 触发BOSS下拉更新
      wishlistOnRaidChange();

      // 设置BOSS值
      if (getGameRaidNames().includes(raidVal)) {
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
      if (getGameRaidNames().includes(raidVal)) {
        raidSelect.value = raidVal;
      } else {
        raidSelect.value = '其他';
      }
      wishlistOnRaidChange();
      
      if (getGameRaidNames().includes(raidVal)) {
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
      const firstRaid = getGameRaidNames()[0] || '其他';
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
             title="${memberDisplayName(m)} · ${m.class}${mainSpec ? ' · ' + mainSpec : ''}${offSpecs.length ? ' · 副：' + offSpecs.join('、') : ''}">
        <input type="checkbox" value="${m.id}" onchange="wishlistUpdateMemberCount()">
        <div class="wm-content">
          <div class="wm-name ${cls ? 'class-' + cls : ''}">${memberDisplayName(m)}</div>
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
    // REQ-095（WP5）：点击按成员 id 填充下拉（同名零碰撞）；成员已删（伪行）回退按名填自定义项
    const memberName = member ? memberDisplayName(member) : w.memberName;
    return `
      <span class="wish-match-member" onclick="lootFillAssignedTo('${member ? member.id : w.memberName}')">
        <span class="match-priority">${w.priority}</span>
        <span>${memberName}</span>
        <span style="font-size:10px;opacity:0.7">(${specText})</span>
      </span>
    `;
  }).join('');
}

// 自动填充分配给谁（REQ-095/WP5：入参为成员 id 或名单外自定义名——下拉 option value 已 id 化，
// id 直接命中既有选项；自定义名按旧逻辑追加「（自定义）」兜底项，随后走既有 change 逻辑）
function lootFillAssignedTo(idOrName) {
  const select = document.getElementById('lootAssignedTo');
  if (select) {
    // 检查下拉中是否有这个选项
    const optionExists = Array.from(select.options).some(o => o.value === idOrName);
    if (!optionExists) {
      // 没有则添加
      const opt = document.createElement('option');
      opt.value = idOrName;
      opt.textContent = idOrName + ' · （自定义）';
      select.appendChild(opt);
    }
    select.value = idOrName;
    lootUpdateMemberInfo();
  }
  lootUpdateWishlistMatches();
}


// ==================== 初始化 ====================
// ==================== 更新日志 ====================
const changelogData = [
  {
    id: 'v3.2.0-addon-1010-tooltip-fix',
    version: 'v3.2.0',
    date: '2026-08-13',
    type: 'fix',
    typeLabel: '问题修复',
    title: '插件 1.0.10：特效/毒咒漏读双通道修复+版本打印修正（REQ-088 真机报障）',
    summary: 'S2 实采真机终验发现：部分装备（EJ 手册预览态，如觉醒恐牙胸甲）tooltip 有毒咒标签行/特效行但导出为空——1.0.9 的行首色码修复未根治。1.0.10 起采集端改双通道：SetItemByID 扫不到特效/毒咒行时自动回退物品链接 SetHyperlink 通道补扫；Probe 诊断加双通道对照输出。另修正导出启动语版本号硬编码（显示「1.0.7」→跟随实际版本）。',
    details: [
      '待运营真机回验：/wjdc probe 271876 取证对照 + 重导后 effect 非空、venomcurse=毒咒（步骤卡 Q1-Q4）',
      'REQ-089 备案情报：S2 兑换物正体=毒咒神像/残骸/圣像/遗物/雕像 5 件（导出 type 标「垃圾」），已入送审件附录'
    ]
  },
  {
    id: 'v3.2.0-bug080-sentinel-gate',
    version: 'v3.2.0',
    date: '2026-08-13',
    type: 'improve',
    typeLabel: '体验优化',
    title: '写后自检哨兵+新增写点门禁（任务书 #47 WP4，BUG-080 预防机制落地）',
    summary: '所有经 cloudCrud 的写操作在 reload 后自动自检缓存已含新值（新增=id 在列/删除=id 消失/更新=字段值一致），不一致即自动二次 reload 并 console 告警——「写成功但界面不刷新」从机制上自愈+留痕。新增写操作必须走 cloudCrud 的门禁立规入 AGENTS.md 与开发规范 §1.2，回归脚本以计数断言锁死现状白名单，新增绕过直调即红。',
    details: [
      '哨兵两态经真浏览器实证：正常写零误报；注入陈旧 reload 时告警并自动二次 reload 自愈，列表仍即时可见',
      '收口 wrapper（方案 a）按运营裁定记入长期演进，本批不实施'
    ]
  },
  {
    id: 'v3.2.0-bug081-season-align',
    version: 'v3.2.0',
    date: '2026-08-13',
    type: 'fix',
    typeLabel: '问题修复',
    title: '副本掉落页赛季选择器对齐归位（任务书 #47 WP3，BUG-081）',
    summary: '≥1400 宽屏面板态下，赛季下拉留在 1100px 版心、右缘与右栏筛选面板/卡片区不对齐（悬浮错位）。两壳（登录页签+公开 data.html）赛季行所在轨道并入卡片区同一 292px 右偏移，右缘对齐归位；1366 折叠顶栏态零变动。',
    details: [
      '公开壳页头与登录壳赛季行分别并入卡片区偏移轨道（margin-left auto 吸收余量，与卡片区同机制）',
      'computed 实测：双壳 1920 右缘偏差 ≤2px、双壳 1366 零裁切零回退'
    ]
  },
  {
    id: 'v3.2.0-bug080-write-chain-audit',
    version: 'v3.2.0',
    date: '2026-08-13',
    type: 'fix',
    typeLabel: '问题修复',
    title: '写链路刷新断裂系统排查+同族修复（任务书 #47，BUG-080）',
    summary: '「添加成员 toast 成功但列表不显示」系统排查：主链路（成员表单/导入/连加/切 tab）在当前构建逐环实证完好（写库→reload→缓存→渲染四环 dump 全通）；全站写路径对照排查（成员/考勤/装备/心愿/数据中心九区块/认领/公会/用户/偏好共 40+ 写点）发现同族实锤 1 处与边缘瑕疵 4 处，本包一并修复。预防机制方案（写路径收口 wrapper / 写后自检断言）已出方案书送运营裁定后施工。',
    details: [
      '实锤修复：退出公会后自愈切换到其他公会时当前页不重渲（停留旧公会数据，此时编辑会脏操作）——补 updateCloudUI+权限门+整页重渲',
      '瑕疵修复：活动保存/考勤保存/活动删除写失败时弹窗照关输入丢失→成功才关弹窗；WCL 同步考勤循环写中途失败（部分行已落库）不刷新→catch 兜底 reload；装备保存的心愿单联动失败静默→warning 明示+兜底刷新',
      '预防机制待运营定稿后落地，落地前回归 verify-task47 锁定主链路即时可见'
    ]
  },
  {
    id: 'v3.2.0-req092-item-icons',
    version: 'v3.2.0',
    date: '2026-08-13',
    type: 'feature',
    typeLabel: '新增功能',
    title: '副本掉落卡片物品图标（任务书 #46 WP3，REQ-092 落地半）',
    summary: '副本掉落页（登录壳+公开壳双壳同源）装备卡片右上角渲染物品图标：数据中心掉落表单/列表/批量录入支持「图标ID」（可空），公开 RPC 白名单透出 icon_id（sql/29 待运营执行），图标按 assets/icons/items/{图标ID}.png 规则路径加载——懒加载不卡首屏，无图标ID或图片缺失时不显示、不占位、不破版。',
    details: [
      '素材管道 scripts/import-item-icons.js：运营供源图（纯数字 iconID.png）零依赖入库，首库约 300 枚待素材到位后执行',
      '迁移窗口防护：sql/29 执行前数据中心保存自动不携带 icon_id 键，录入链路不断'
    ]
  },
  {
    id: 'v3.2.0-addon-109-venom-icon',
    version: 'v3.2.0',
    date: '2026-08-13',
    type: 'feature',
    typeLabel: '新增功能',
    title: '插件 1.0.9 毒咒+iconID 采集与转换器 v4（任务书 #46，REQ-110③/REQ-092 采集半）',
    summary: 'WoWButlerExporter 插件 1.0.7→1.0.9（1.0.8 跳号追平登记口径）：tooltip 绿字「毒咒」标签行采集进导出（venomcurse 字段），物品图标 iconID 经 GetItemInfo 第 10 返回值透传；转换器 wjdc_convert.py 冻结声明升 v4，venomcurse/icon_id 进 load rows 与零丢失比对集（_CMP_FIELDS 八键）。',
    details: [
      '诊断件 Probe 新增 tooltip 全行原样 dump（色码可见化），供真机取证',
      'REQ-089 兑换物展开：规则表送审件 docs/REQ-089-兑换物展开规则表-送审.md 待运营逐格确认，未施工——展开将改变 308 基线，确认前禁止动基线断言'
    ]
  },
  {
    id: 'v3.2.0-req088-effect-recollect',
    version: 'v3.2.0',
    date: '2026-08-13',
    type: 'fix',
    typeLabel: '问题修复',
    title: '插件饰品特效补采修复（任务书 #46 WP1，REQ-088）',
    summary: 'S1 池 40 件饰品 39 件特效空串的根因修复：tooltip 特效行（「装备：…」绿字）行首带内联颜色码时，旧版行首锚定匹配失配。1.0.9 起匹配前先剥离行首色码/图标码/前导空白（纯文本行零影响），特效正常入导出。',
    details: [
      '根因经代码级排他论证（换行/多段落形态被排除，同版本 3 件采到证明色码个体级），真机终验走 Probe 全行 dump 取证',
      '修复后游戏内导出→converter 转换的特效非空率实测待 B 表 B1/B2 真机链路确认'
    ]
  },
  {
    id: 'v3.2.0-req095-member-server',
    version: 'v3.2.0',
    date: '2026-08-13',
    type: 'feature',
    typeLabel: '新增功能',
    title: '成员服务器字段+同名口径升级（任务书 #45，REQ-095）',
    summary: '成员新增/编辑弹窗加「服务器」字段（可空=同服/未填），成员列表常驻服务器列（空显「—」）；同名唯一口径升级为「同服同名拦、跨服同名放行」——同公会跨服同名不再误拦。同名并存时全站成员名展示自动消歧为「名字（服务器）」。智能导入/WCL 导入解析出的服务器随导入落库，匹配按（名字+服务器）双键。',
    details: [
      '数据库迁移 sql/28（待运营执行）：raid_members 加 server 可空列，唯一索引重建为 (公会,名字,服务器) 活跃成员生效；迁移执行前产品自动降级（服务器不读写、成员功能不断链），执行后全量生效',
      '匹配统一口径：同名只有一个候选时宽松匹配（兼容存量成员未填服务器），同名并存时必须服务器精确相等',
      '装备分配「分配给谁」下拉内部改用成员 id（同名零碰撞），自定义名字输入保留'
    ]
  },
  {
    id: 'v3.2.0-bug060-cross-server-same-name',
    version: 'v3.2.0',
    date: '2026-08-13',
    type: 'fix',
    typeLabel: '问题修复',
    title: '同名跨服成员创建被误拦修复（任务书 #45 并入，BUG-060）',
    summary: '同名不同服务器角色创建被拦「公会内已存在同名角色」——游戏现行设定同公会允许同名、前提不同服务器。随 REQ-095 服务器字段与三键唯一索引落地根治；撞离队同名「是否恢复」语义不变。',
    details: [
      '修复前根因：唯一索引停在 (公会,名字)，无服务器维度',
      '同服同名仍正确拦截并提示「同服务器已存在同名角色（跨服同名请填写服务器区分）」'
    ]
  },
  {
    id: 'v3.2.0-bug078-nav-cross-account',
    version: 'v3.2.0',
    date: '2026-08-13',
    type: 'fix',
    typeLabel: '问题修复',
    title: '侧栏导航跨账号串号修复（任务书 #44 WP1，BUG-078）',
    summary: '同浏览器 A 账号拖拽调序→退出→B 账号登录，侧栏串了 A 的序。根因在前端换号残留：导航 DOM 重排后不还原、「无偏好=当前 DOM 序」把残留序当默认序、偏好内存态登出不清。修复：登出清偏好内存态与本地数据缓存、导航回默认序快照、登录后以当前用户 nav_order 为准（加载完成前默认序不抢跑）。',
    details: [
      'DOM 原序在任何重排前快照为默认序（initNavDragSort），无偏好时主动回快照而非沿用当前 DOM',
      '「上次公会」localStorage 键加用户维度（wow_raid_last_guild:{userId}），旧全局键不迁移、开键即删自然废弃',
      '服务端隔离本正常（任务书 #42 B14 口径），本修为纯前端收口，零 schema 零依赖'
    ]
  },
  {
    id: 'v3.2.0-bug079-back-to-today',
    version: 'v3.2.0',
    date: '2026-08-13',
    type: 'fix',
    typeLabel: '问题修复',
    title: '考勤日历「今天」按钮更名「回到今天」（任务书 #44 WP2，BUG-079）',
    summary: '考勤日历视图翻页后回当月的按钮文案由「今天」改为「回到今天」，语义更明确。全站 grep 同义按钮扫齐，仅此一处（仪表盘「今日出勤」为统计标签非按钮，不动）。',
    details: [
      'goToToday() 逻辑零改动，纯文案；点击回当月主链路真浏览器实测'
    ]
  },
  {
    id: 'v3.2.0-req115-panel-slim',
    version: 'v3.2.0',
    date: '2026-08-13',
    type: 'improve',
    typeLabel: '体验优化',
    title: '副本掉落右栏筛选面板减重（任务书 #44 WP3，REQ-115）',
    summary: '≥1400px 悬浮筛选面板由「贴顶拉满到 viewport 底部」改为高度随内容收缩：height:auto + max-height（100vh − 顶部偏移 − 底部余量），内容超出才内部滚动。框体四边闭合、264px 宽、z=10 层级、两态一套 DOM 全部不动。',
    details: [
      '公开壳（data.html）与登录壳（#page-lootdrop）同一条公式，壳级 --dp-panel-top 变量回退值各自兜底',
      '1366（折叠顶栏态 sticky）/1920（面板态）双分辨率双壳实测入报告'
    ]
  },
  {
    id: 'v3.2.0-req097-picker-taxonomy',
    version: 'v3.2.0',
    date: '2026-08-11',
    type: 'improve',
    typeLabel: '体验优化',
    title: '装备库选择器默认排除杂项+下拉对齐公示页分类（任务书 #31，REQ-097）',
    summary: '心愿单「添加心愿」与装备分配「添加装备」两处 picker（两面板同治）：列表恒定排除杂项与套装兑换物（不做切换入口）；部位下拉对齐公示页 12 项词汇（新增肩部/腕部，披风→背部、项链→颈部、戒指→手指），武器独立成下拉 4 项（单手/双手/远程/副手），护甲类型收敛 5 项（板甲/锁甲/皮甲/布甲/盾牌）。',
    details: [
      '词汇表单一真源：新建 js/lootTaxonomy.js，公示页三级 chips、picker 过滤、BUG-057 回填推导三处统一引用，禁第三份映射',
      '过滤口径实证：杂项真实标记为 slot=杂项（51 行）+ 套装兑换物（1 行），保留 138 件装备全部可筛选归属',
      'BUG-057 回填语义零改动：仅切换词表来源，表单大类/部位判定与旧表逐项一致'
    ]
  },
  {
    id: 'v3.2.0-bug077-batch-depart-label',
    version: 'v3.2.0',
    date: '2026-08-11',
    type: 'fix',
    typeLabel: '问题修复',
    title: '批量离队弹窗按钮文案修正（任务书 #38 WP1，BUG-077）',
    summary: '批量离队确认弹窗按钮由「确认删除」改为「确认离队」（忙碌态「离队中...」），与离队软语义一致；批量删除（活动）入口保持「确认删除」不变。弹窗按钮文案按入口参数化，全复用处逐一核对。',
    details: [
      'openBatchDeleteModal 全部 2 处调用点核查：成员批量离队（改「确认离队」）、活动批量删除（保持「确认删除」）',
      '成员批量彻底删除为独立弹窗（四字解锁+「彻底删除」按钮），语义本已正确，未动'
    ]
  },
  {
    id: 'v3.2.0-bug075-password-8-chars',
    version: 'v3.2.0',
    date: '2026-08-11',
    type: 'fix',
    typeLabel: '问题修复',
    title: '密码长度提示统一「至少 8 位」（任务书 #38 WP2，BUG-075）',
    summary: '服务端 422 弱密码提示由「至少 6 位」修正为「至少 8 位」，与 gotrue 实际校验（GOTRUE_PASSWORD_MIN_LENGTH=8）对齐；注册页/修改密码占位符与前端校验提示本已为 8 位口径，全站逐处核查一致。',
    details: [
      'mapAuthError 422 文案为唯一错配点；注册/用户中心占位符「至少8位，需含字母和数字」、passwordRuleError「密码至少 8 位」原已正确'
    ]
  },
  {
    id: 'v3.2.0-bug076-dead-selectors',
    version: 'v3.2.0',
    date: '2026-08-11',
    type: 'fix',
    typeLabel: '问题修复',
    title: 'main.css 死选择器清理（任务书 #38 WP3，BUG-076）',
    summary: '清理侧栏公会行移除后的残留样式：.guild-bar 响应式规则 1 条、.guild-bar-role 组选择器 2 处；徽章族 .guild-member-role/.role-badge 仍有消费点，保留不动，渲染零变化。',
    details: [
      '删除前逐处核消费点：.guild-bar/.guild-bar-role 在 js/index.html 零引用；.guild-member-role（公会设置/切换公会）、.role-badge（topbar/公会卡）确认在用'
    ]
  },
  {
    id: 'v3.2.0-req110-venomcurse',
    version: 'v3.2.0',
    date: '2026-08-11',
    type: 'feature',
    typeLabel: '新增功能',
    title: '副本掉落「毒咒」字段支持（任务书 #37，REQ-110 WP1）',
    summary: '掉落池数据模型新增毒咒标签字段（文本标签型，存「毒咒」，可空，未来其他咒直接存新值不再加列）；数据中心掉落录入/编辑表单加「毒咒」预设下拉（无/毒咒，禁自由输入），列表同步展示；副本掉落装备卡 meta 行新增「毒咒」绿色徽标，仅毒咒装备显示，毒咒效果文本仍走现有特效行。',
    details: [
      'boss_loot / dungeon_loot 两表加 venomcurse 列（sql/26），存量零回填（S1 无毒咒装备）',
      '公开 RPC get_public_loot_detail 白名单透出 venomcurse，双壳（登录壳/公开壳）同一渲染器自动覆盖',
      '徽标样式沿用 .dp-tag 徽标族，绿色调与特效行同族（.dp-tag-venom）；无毒咒装备卡片零变化'
    ]
  },
  {
    id: 'v3.2.0-req103-entry-consolidation',
    version: 'v3.2.0',
    date: '2026-08-11',
    type: 'improve',
    typeLabel: '功能优化',
    title: '用户/公会入口整合：用户中心唯一入口·双卡同页（任务书 #36，REQ-103）',
    summary: '用户中心页顶部新增公会卡：公会名（服务器）+ 我的角色徽标 +「公会设置」「切换公会」两入口（复用现有弹窗）；右上角头像菜单精简为仅「退出登录」；侧栏公会行整行移除，未读通知点迁至「用户中心」导航项；左上角品牌+公会名（服务器）保持纯展示。',
    details: [
      '玩家ID 主展示=用户中心卡（REQ-094 菜单头部口径随本包修订移除）',
      '公会名显示统一走 BUG-073 归一的 guildDisplayName 真源；侧栏布局自然收拢零残留',
      '通知点只换宿主（显隐条件与数据源零变化）'
    ]
  },
  {
    id: 'v3.2.0-bug074-batch-depart-delete',
    version: 'v3.2.0',
    date: '2026-08-11',
    type: 'fix',
    typeLabel: '修复BUG',
    title: '成员批量工具条双功能：批量离队 + 批量删除（任务书 #35 WP1，BUG-074）',
    summary: '成员管理批量工具条升级为「已选择 N 人 [批量离队] [批量删除] [取消选择]」：批量离队 = 原批量删除的软语义改名归位（标记为离队、可恢复，仅对活跃行生效，已离队行跳过并注明）；批量删除 = 真删——考勤/装备历史保留灰色「已删除」、心愿单随人删、逐行进垃圾桶可查，确认需输入「彻底删除」四字。',
    details: [
      '批量删除确认弹窗：可滚动名单（名字+职业+状态）+ 考勤/装备/心愿历史合计 + 红字警示 + 四字解锁确认按钮',
      '逐行并发执行、完成后统一刷新；成功/失败计数提示，失败名单记 console',
      '全选行为不变（覆盖全部渲染行含可见离队组），REQ-049 注释与全选框判定已对齐真实口径'
    ]
  },
  {
    id: 'v3.2.0-bug073-guild-name-race',
    version: 'v3.2.0',
    date: '2026-08-11',
    type: 'fix',
    typeLabel: '修复BUG',
    title: '左上角公会名服务器名间歇显示（任务书 #35 WP2，BUG-073）',
    summary: '左上角公会卡名称行的服务器名不再时有时无：两条渲染路径（切换公会/改公会资料走裸名、首载登录走完整名）统一为同一拼接真源，任何路径最后写入都是同口径「公会名（服务器）」。',
    details: [
      '根因：cloud.js updateGuildUI 写裸名（无服务器名），app.js updateCloudUI 写完整名，最后写入者随路径不同而不同',
      '修法：guildDisplayName 单一拼接函数（server_name 空回退裸名不出空括号），三处写入点归一；显示格式零改动'
    ]
  },
  {
    id: 'v3.2.0-req109-att-bulk-trim',
    version: 'v3.2.0',
    date: '2026-08-11',
    type: 'improve',
    typeLabel: '功能优化',
    title: '考勤弹窗批量按钮精简（任务书 #34 WP4，REQ-109）',
    summary: '考勤详情弹窗批量条移除「全部缺席」「全部替补」「全部请假」三按钮，保留「全部出席」；单个标记、勾选批量标记、保存考勤等其余功能不变。',
    details: [
      '三按钮及其引用零残留；共享 handler 保留供「全部出席」使用',
      '弹窗布局随按钮移除自然收拢，无空占位'
    ]
  },
  {
    id: 'v3.2.0-req108-dashboard-breakdown',
    version: 'v3.2.0',
    date: '2026-08-11',
    type: 'improve',
    typeLabel: '功能优化',
    title: '仪表盘看板细分（任务书 #34 WP3，REQ-108）',
    summary: '团员总数卡下方新增细分行「正式 X · 替补 X · 试用 X · 离队 X」（为 0 的段不显示）；本月活动次数卡下方追加「取消 X 个」（0 不显示）。大数字与既有口径不变，数据均实时现算。',
    details: [
      '细分段动态拼接，分隔符随显示段自适应；存量英文状态（active/inactive）按既有口径归并',
      '与既有看板同一数据源（appData 现算），无新增缓存'
    ]
  },
  {
    id: 'v3.2.0-req106-topbar-seconds',
    version: 'v3.2.0',
    date: '2026-08-11',
    type: 'improve',
    typeLabel: '功能优化',
    title: 'topbar 时间精确到秒（任务书 #34 WP2，REQ-106）',
    summary: '右上角日期由「2026/8/11 周二」升级为「2026/8/11 周二 20:03:45」，每秒走动；页面隐藏期间跳过写入，切回立即恢复准确时间。',
    details: [
      '单一定时器随 topbar 生命周期，零依赖、登出/切页无泄漏'
    ]
  },
  {
    id: 'v3.2.0-req104-pw-shake',
    version: 'v3.2.0',
    date: '2026-08-11',
    type: 'improve',
    typeLabel: '功能优化',
    title: '密码校验失败抖动反馈（任务书 #34 WP1，REQ-104）',
    summary: '修改密码与注册页密码框新增校验失败抖动动画：新密码不合规抖新密码框、两次不一致抖确认框、服务端拒绝（弱密码）同样触发；红字提示保留，抖动为增量感知；系统开启减弱动态效果时自动降级不抖动。',
    details: [
      '一处实现两处复用：水平衰减摆动 0.4s、幅度 ≤8px，连续失败可重复触发',
      '提交门禁（REQ-094）不变；字段失焦且内容不合规时同样给出一次抖动提示'
    ]
  },
  {
    id: 'v3.2.0-bug071-reports-deleted-row-height',
    version: 'v3.2.0',
    date: '2026-08-11',
    type: 'fix',
    typeLabel: '修复BUG',
    title: '报表「已删除」伪行行高修正（任务书 #33，BUG-071）',
    summary: '统计报表出勤率排名表中，已删除角色伪行的「已删除」徽标不再折行：伪行行高与正常数据行一致（1366 档实测同高 45-46px），徽标与名字同行。',
    details: [
      '根因：1366 档表格自动布局分给名字列的宽度不足以同放名字与徽标，徽标在空格处折行使行高增高',
      '修法仅限伪行最小选择器（rank-deleted-name）：名字单元格不折行 + 徽标紧凑化，正常数据行零触及，徽标文案与判定语义未动',
      '1366 档表格无横向滚动条（BUG-058）、职业列两字单行（BUG-070）逐值复测零回退'
    ]
  },
  {
    id: 'v3.2.0-req100-dashboard-recent',
    version: 'v3.2.0',
    date: '2026-08-11',
    type: 'improve',
    typeLabel: '功能优化',
    title: '仪表盘「最近活动」状态徽标 + 只读预览跳转考勤（任务书 #32，REQ-100）',
    summary: '仪表盘「最近活动」每个条目一级显示状态徽标（正常/已取消，取消判定用既有 activities.status 字段），已取消条目整体灰化降饱和、徽标高对比实色；条目改为纯预览（原点击开考勤详情弹窗已移除），点击跳转考勤记录 tab 并滚动定位、高亮该活动 1.8s；活动已删除时落考勤 tab 顶部并提示「该活动已被删除」。',
    details: [
      '跳转当次自动勾选「含已取消」并清空其余筛选（只动当次筛选态），强制列表视图渲染定位但不改写用户视图偏好记忆',
      '删除活动后 dashboard 条目联动消失（既有刷新链完整，删除→重读→切页重渲），本包实测闭环含 F5',
      '只动显示层与跳转：考勤业务逻辑、数据表、RLS 零改动'
    ]
  },
  {
    id: 'v3.2.0-req096-force-relogin',
    version: 'v3.2.0',
    date: '2026-08-11',
    type: 'improve',
    typeLabel: '功能优化',
    title: '改密成功后强制重新登录（验收修复小包，REQ-096）',
    summary: '修改密码成功后旧会话即刻失效：提示「密码已修改，请重新登录」并自动登出回登录页，新密码可正常登录。本口径推翻任务书 #29 WP1 的「会话保持」裁定。',
    details: [
      '登出走全站唯一 logout 路径：清理会话与公会态、全弹窗出栈、回登录页、登录按钮状态机复位',
      'toast 容器随应用视图隐藏，登录页同步落持久提示（绿色）；注册/登录按钮与强度条组件零改动'
    ]
  },
  {
    id: 'v3.2.0-bug072-rename-refresh',
    version: 'v3.2.0',
    date: '2026-08-11',
    type: 'fix',
    typeLabel: '修复BUG',
    title: '改名后昵称显示即时刷新（验收修复小包，BUG-072）',
    summary: '用户中心修改显示名称成功后，顶部玩家ID卡（昵称部分）、页内昵称、右上角头像菜单与 topbar 昵称全部即时更新为新值，无需重进用户中心或刷新页面；F5 后不回落。',
    details: [
      '断点定位（DB-first 逐环核对）：改名写入与本地缓存更新正常，断在 render 环——玩家ID卡只在进入用户中心时渲染，保存后未重渲',
      '修法：保存成功后重读服务端用户并同步刷新全部显示点（用户中心卡片/昵称输入、topbar、头像菜单头），不做整页 reload'
    ]
  },
  {
    id: 'v3.2.0-bug070-reports-class-nowrap',
    version: 'v3.2.0',
    date: '2026-08-10',
    type: 'fix',
    typeLabel: '修复BUG',
    title: '统计报表职业列 1366 档不再折行（BUG-070）',
    summary: '1366×768 档下，统计报表出勤率排名表的「职业」列不再两字折行（职业名最长 4 字「死亡骑士」）：仅对该列禁折行，表格自适配与无横向滚动条保持不变（BUG-058 修复零回退）。',
    details: [
      '根因：表格自动布局下职业列分得宽度不足 4 字，默认允许中文任意断行，遂两字一折',
      '修复：只对排名表职业列禁折行，其余列排版不受影响',
      '1366/1920 双档实测：表格无横向滚动条、「已删除」徽标完整可见'
    ]
  },
  {
    id: 'v3.2.0-task29-wp1-account',
    version: 'v3.2.0',
    date: '2026-08-10',
    type: 'feature',
    typeLabel: '新增功能',
    title: '账号体系完善 A 组：注册密码强度 + 修改密码 + 玩家ID（任务书 #29 WP1，REQ-094）',
    summary: '注册启用密码强度规则（≥8 位、须含字母和数字、拦截常见弱密码），输入实时显示弱/中/强三档强度条，不合规禁用提交；用户中心新增「修改密码」（当前密码服务端校验；改密后会话策略后经 REQ-096 调整为强制重新登录，见同版「功能优化」条目）；新增 BattleTag 风格玩家ID「昵称#5位数字」，用户中心顶部卡片一键复制，头像菜单昵称下方同步显示。',
    details: [
      '强度三档：弱（不合规，红）/中（合规，黄）/强（合规且更长更复杂，绿），修改密码表单复用同一校验组件',
      '修改密码：当前密码错误/强度不足/两次不一致均就地提示，成功 toast「密码已修改」（原「会话保持」口径已由 REQ-096 推翻：改密成功强制登出重新登录）',
      '玩家ID 数字段注册时随机分配、恒定不变，名字部分实时跟随改名；仅作展示识别，不参与任何鉴权与查重',
      '存量账号数字段由增量迁移统一补发（sql/25，运营执行）；登录时亦有幂等兜底分配'
    ]
  },
  {
    id: 'v3.2.0-task27-patch2-bug059',
    version: 'v3.2.0',
    date: '2026-08-10',
    type: 'fix',
    typeLabel: '修复BUG',
    title: '装备分配「离队成员误显已删除」口径修正（任务书 #27-补丁2，BUG-059）',
    summary: '装备分配列表的分配人解析改为「成员 id 优先、名字回退」：新保存的分配记录携带成员 id，同名成员零碰撞；存量记录按名字匹配时放行离队成员命中、按真实状态显示——离队成员的装备行不再因垃圾桶同名而误显「已删除」。',
    details: [
      '保存装备分配时补写成员 id（既有字段，分配人选择流程不变、用户无感）；编辑既有分配保存时同步补 id',
      'id 可解析：在队正常显示、离队显示「已离队」；id 定位不到（已彻底删除）显示「已删除」',
      'id 为空的存量记录：名字命中在册成员（含离队）按真实状态显示；未命中查垃圾桶显示「已删除」，再未命中显示「已离队」',
      '已知限制（运营在案）：同名一删一留的存量记录，显示方向以在册成员为准'
    ]
  },
  {
    id: 'v3.2.0-task27-patch-display-fix',
    version: 'v3.2.0',
    date: '2026-08-10',
    type: 'fix',
    typeLabel: '修复BUG',
    title: '装备库选择回填大类/部位修正 + 报表出勤率排名表自适配（任务书 #27-补丁，BUG-057/058）',
    summary: '从装备库选择装备后，「装备大类/装备部位」按库内 部位/类型 数据正确回填（心愿单与装备分配两面板同标准）；统计报表「出勤率排名」表在 1366×768 下不再出现横向滚动条，角色名与「已删除」徽标完整可见。',
    details: [
      'BUG-057：选饰品（如 艾林先知的凝视，库内类型字段为「其它」）不再错显 武器/单手锤——回填改以库内部位为主键、类型细分武器/副手，兼容插件采集词汇（单手/双手/远程等），缺数据字段保持现状可手改',
      '两面板同一解析函数同治，部位精确选中取代旧延时模糊匹配',
      'BUG-058：排名表去除固定最小宽度并收紧单元格内距，1366/1920 两档均无横向滚动条，信息不裁剪'
    ]
  },
  {
    id: 'v3.2.0-task28-wp5-lootdrop',
    version: 'v3.2.0',
    date: '2026-08-10',
    type: 'feature',
    typeLabel: '新增功能',
    title: '「数据公示」更名「副本掉落」并嵌入主应用（任务书 #28 WP5，REQ-086 收官）',
    summary: '原「数据公示」更名「副本掉落」；侧边栏入口改为应用内切换页签（与考勤记录、成员管理同款），不再新开页面。免登录公开页 data.html 原样保留（已分享链接不受损），双壳共用同一套渲染层与数据通道。',
    details: [
      '登录后在主应用内直接查看：赛季切换、分类/属性/来源筛选、搜索、团本与大秘境掉落池、套装一览，全部功能与公开页一致',
      '筛选条在页签内吸顶于顶部栏之下；特效卡悬浮生长、置灰提示、折叠记忆等行为双壳一致',
      '三角色（owner/editor/viewer）均可见，全部内容只读'
    ]
  },
  {
    id: 'v3.2.0-task28-wp4-contrast-fix',
    version: 'v3.2.0',
    date: '2026-08-09',
    type: 'fix',
    typeLabel: '修复BUG',
    title: '公示页灰色系对比度达标：来源行与灰标签文字提亮（任务书 #28 WP4，WCAG AA）',
    summary: '公示页走查仅有的两处灰色系对比度不达标整改——装备卡来源行文字与部位/类型灰标签文字提亮，均达 WCAG AA 4.5 标准；标签底色、留白、间距、密度一律未动。',
    details: [
      '来源行文字 rgb(110,118,129)→rgb(150,158,170)，卡片底色合成对比度 3.36→5.71',
      '部位/类型灰标签文字 rgb(139,148,158)→rgb(165,173,185)，15% 灰合成底色对比度 3.98→5.41，标签底色不变',
      '件数徽标（副本/BOSS 名旁的 N 件角标）文字同步提亮至 rgb(165,173,185)（WP4 追加，运营拍板）'
    ]
  },
  {
    id: 'v3.2.0-task28-wp6-feature',
    version: 'v3.2.0',
    date: '2026-08-09',
    type: 'feature',
    typeLabel: '新增功能',
    title: '公示页过滤器二期：分类三级 + 来源实例级 + 筛选态平铺（任务书 #28 WP6，含 P1–P4 补丁及二轮/三轮/四轮/五轮修订）',
    summary: '筛选条新增「分类」组（第一组）：二级 tab 单选（全部/部位/武器/护甲，切换清空）+ 三级 chips 多选——部位 12 项（含饰品）、武器按类型白名单（魔杖归单手、法杖归双手、远程纯弓弩枪）、盾牌归护甲；来源组选中团本/大秘境后展开实例级 chips（带计数，点实例只看该本）；搜索/分类/属性任一激活时列表切换为全局平铺（无分组标题，顶部显示命中件数），清空自动恢复双池浏览。',
    details: [
      '分类三级 chips 数据驱动：当季无命中的 chip 不渲染（如「主手」本赛季无数据自动隐藏）',
      '平铺态下来源（含实例）退化为纯过滤；0 命中显示「无符合条件装备」并提供重置引导',
      '实例列表随赛季翻牌自动更新，S2 数据上线后无需改代码',
      'P1 特效悬浮形态重构：超长特效 hover 时卡片本体平滑向下生长、全文框内展开，来源行跟随卡片新底部全程可见，不再用浮层遮盖',
      'P2 分类组新增「全部」默认锚点 tab：未启用分类过滤时三级 chips 区不渲染',
      'P3 部位分类新增「饰品」（40 件），与套装兑换物区分口径不变',
      'P4 筛选联动置灰：当前组合下无命中的未选 chip 自动置灰不可点并附原因提示，已选 chip 不受影响',
      'P1-补 生长防抖：特效文本一次性完整排版，悬浮生长只是容器视口扩大、文本零位移零重排，折叠态省略观感不变',
      'P4-补 置灰点击反馈：点击置灰 chip 会抖动并浮出一行原因提示（2 秒渐隐），不再"死无反馈"',
      'P1-再补 覆盖式生长：悬浮展开/收回全程不推挤任何相邻卡片（展开收回连帧实测邻卡零位移），页面底部预留缓冲，末行卡片展开不抖滚动条',
      'P4-再补 置灰提示改底部 toast（与主应用通知同款、不遮命中计数）；平铺态「命中 N 件」并入吸顶筛选条末行，任意滚动位置完整可见不再半裁',
      'BUG-066 修复：折叠态省略号改为预留位排版，特效可见文字字字完整，不再被遮罩压盖',
      'BUG-067 修复：两行刚好放下的特效不再被误判溢出——省略号占位带改为仅超长特效卡使用，恰好放下的卡整行全宽直显、无省略号、悬浮不再多余展开',
      'BUG-068 修复：特效卡悬浮展开/收回动画双向对称——展开不再瞬时跳到位、收回不再先停后急缩，同一动画路径 200ms 平滑进出',
      'BUG-069 修复：页面滚动后悬浮展开特效卡不再盖住吸顶筛选条——卡片上半正常被条遮挡、仅向下展开部分可见'
    ]
  },
  {
    id: 'v3.2.0-task28-wp3v5-fix',
    version: 'v3.2.0',
    date: '2026-08-08',
    type: 'fix',
    typeLabel: '修复BUG',
    title: '公示页特效悬浮展开：整段全文连续可见（任务书 #28 WP3-v5 R12 返修）',
    summary: '修复超长特效悬浮展开时前两行前文消失的问题——展开层改为显示特效全文：省略号只在折叠态出现，悬浮后整段特效从第一个字起连续可读，前文保持可见、续文自断点自然生长，无任何不可见占位区。',
    details: [
      '展开层内容 = 特效全文（同一文本流全程可见），废止上一版的隐藏前缀占位实现',
      '展开层与预览行同宽同字体原位覆盖，absolute 不推挤其他卡片；未溢出卡片依旧无悬浮'
    ]
  },
  {
    id: 'v3.2.0-task28-wp3v4-improve',
    version: 'v3.2.0',
    date: '2026-08-08',
    type: 'improve',
    typeLabel: '功能优化',
    title: '公示页装备卡：来源行锚底 + 特效续文自然接续（任务书 #28 WP3-v4 R11/R12）',
    summary: '装备卡来源行（实例 · BOSS · 套装归属）锚定卡片底部不动，短卡空白留在内容与来源行之间；超长特效悬浮展开改为自然接续——省略号只在折叠态出现，展开时续文从截断处接着预览末字内联生长、自然换行，不再另起面板块。',
    details: [
      '来源行 margin-top:auto 锚底，全页卡片贴底误差 ≤1px（分叉指环等短卡来源行不再随内容上移）',
      '特效展开层与预览行同宽同字体原位覆盖：隐藏前缀占位 + 可见续文同一文本流，视觉 = 一段连续文本从截断处继续生长'
    ]
  },
  {
    id: 'v3.2.0-task28-wp3v4-fix',
    version: 'v3.2.0',
    date: '2026-08-08',
    type: 'fix',
    typeLabel: '修复BUG',
    title: '世界BOSS实例类型误标修正：至暗之夜剔出公示页（BUG-062，任务书 #28 WP3-v4 R13）',
    summary: '至暗之夜（鲁阿夏尔/索姆贝兰/普雷达萨斯/克拉格平，32 件）为世界BOSS，不属任何副本场景，此前 instance_type 误标「团本」混入公示页。已修正为 world 并从公示页剔除（数据保留）；巢穴（孢陨幽境/潮缚石窟）按裁定归团队副本口径保留展示。',
    details: [
      'game_raids.type 值域扩为 raid/lair/world；公开 RPC 以黑名单写法剔除 world（不误杀巢穴）',
      'wjdc 转换器分类修复：dict.json 透传实例类型，核对表对世界BOSS/巢穴分型标注——S2 翻牌作战清单前置项',
      '公示基线变更：S1 全部 308 = 团本 104 + 大秘境 204'
    ]
  },
  {
    id: 'v3.2.0-task28-wp3v3-improve',
    version: 'v3.2.0',
    date: '2026-08-08',
    type: 'improve',
    typeLabel: '功能优化',
    title: '公示页装备卡体验修订：内容驱动等高 + 特效续文展开（任务书 #28 WP3-v3 R1–R7）',
    summary: '装备卡废除恒占行高与占位空行，高度由内容驱动、同一行内自动对齐；超长特效悬浮时只展开被省略号截掉的续文，空间够用的特效整行直显、不再出现悬浮层；副属性星标裁切修复；来源筛选与掉落池区块联动折叠。',
    details: [
      '卡片只渲染有数据的行：无主属性卡副属性行紧跟部位行上移，无副属性卡特效行上提，不再出现漂浮空行',
      '特效悬浮展开层从预览行正下方续接被截文本，逐字接续全文；未溢出特效无省略号、无悬浮',
      '副属性⭐星标在任何缩放下完整可见；来源组 chip 间距与主/副属性组一致；选「团本/大秘境」时对应另一掉落池整段折叠'
    ]
  },
  {
    id: 'v3.2.0-task28-wp3v3-fix',
    version: 'v3.2.0',
    date: '2026-08-08',
    type: 'fix',
    typeLabel: '修复BUG',
    title: '饰品特效数据链取证 + 3 条漏回写修复（BUG-061，任务书 #28 WP3-v3 R8）',
    summary: '公示饰品特效大面积缺失取证定案：丢失环节在插件采集端（wjdc 导出原文 409 物品仅 36 条带特效，39 件双空饰品导出时即为空串），转换器零丢失；另修复 3 条历史装载批次漏回写（暮色怨灵的低语/圣光印记/多曼纳尔控制台），三栏对账 导出 36 = 转换 36 = 库内 36 一致。',
    details: [
      '采集端特效空串问题转插件侧另立案，待插件修复后重跑导出回填',
      '公示页数据源增排「装饰品/幻化」类物品（R9，sql/22），套装兑换物保留不排除'
    ]
  },
  {
    id: 'v3.2.0-task23-patch3-feature',
    version: 'v3.2.0',
    date: '2026-08-06',
    type: 'feature',
    typeLabel: '新增功能',
    title: '数据公示页交互优化：合并筛选条 / 特效卡展开 / 分区折叠 / 排除杂项（任务书 #23-补丁3）',
    summary: '公示页部位/类型下拉并入统一 chips 筛选条并按分组模板排序；特效装备卡统一尺寸、悬浮平滑展开完整特效；掉落区支持 BOSS 级与区块级两级折叠（页内记忆）；新增「排除杂项物品」开关；杂项物品永远沉底展示。',
    details: [
      '筛选条四组（部位/类型/主属性/副属性）：组内多选 OR、跨组 AND；部位与类型选项从数据动态聚合但按固定分组模板排序，模板外新值自动归「其它」组',
      '有特效的装备卡带高亮边框引导，悬浮（移动端点击）250ms 展开覆盖层显示完整特效，不影响周围卡片布局',
      '掉落网格内固定排序：装备 → 套装兑换物 → 杂项；折叠状态刷新页面内保持',
      '「排除杂项物品」默认关闭，旁置问号说明：勾选后屏蔽坐骑、玩具、装饰、配方、幻化及垃圾等'
    ]
  },
  {
    id: 'v3.2.0-task23-patch3-fix',
    version: 'v3.2.0',
    date: '2026-08-06',
    type: 'fix',
    typeLabel: '修复BUG',
    title: '副属性用字全站统一为官方「爆击」（任务书 #23-补丁3 修正项①+附）',
    summary: '公示页筛选枚举此前误写为「暴击」，导致按暴击筛选匹配不到任何装备；全站（公示页 + 主应用数据中心枚举/装备分配标签/颜色映射）统一为游戏官方用字「爆击」，筛选与库内数据精确匹配。',
    details: [
      '数据中心副属性写库枚举同步订正，杜绝后续再录出错配数据；存量旧字形数据展示时自动归一为爆击',
      '顺带修复：排除杂项开关旁的问号图标嵌在开关标签内，点击问号会误触开关'
    ]
  },
  {
    id: 'v3.2.0-task27-wp2-feature',
    version: 'v3.2.0',
    date: '2026-08-06',
    type: 'feature',
    typeLabel: '新增功能',
    title: '成员彻底删除放开：历史保全 + 垃圾桶（任务书 #27 WP2）',
    summary: '任何成员现在都可以彻底删除，不再受历史记录有无限制。删除后其考勤与装备记录保留并灰色显示「已删除」，出勤率统计口径不变；被删成员进入「垃圾桶」表留存快照（含当时考勤/装备/心愿条数）可审计。',
    details: [
      '有历史成员删除需输入成员全名确认（同名角色场景靠输名区分，防误删）；零历史成员维持原确认文案',
      '心愿单为成员私有数据，随删除一并移除（确认弹窗内明示条数）',
      '考勤详情、装备分配、统计报表中已删除成员以灰色黯淡 + 「已删除」徽标展示，历史出勤率仍计入'
    ]
  },
  {
    id: 'v3.2.0-task27-wp1-improve',
    version: 'v3.2.0',
    date: '2026-08-06',
    type: 'improve',
    typeLabel: '功能优化',
    title: '成员管理操作列垂直居中对齐（REQ-079）',
    summary: '已认领成员的角色名含认领人第二行撑大行高后，操作列图标组不再贴顶，与未认领行齐平居中。',
    details: [
      '已认领/未认领/已离队三种行态在 1366×768 与 1920×1080 两档宽度下对齐一致',
      '纯样式修复，零逻辑改动'
    ]
  },
  {
    id: 'v3.2.0-task24-patch2-feature',
    version: 'v3.2.0',
    date: '2026-08-06',
    type: 'feature',
    typeLabel: '新增功能',
    title: '「添加角色」支持从插件导出文件一键导入（任务书 #24-补丁2②）',
    summary: '游戏内运行 /wjdc me 导出角色档案后，在添加角色弹窗选择导出的 character.json 即可一键填充全部字段：名称/服务器/区域/阵营/种族/职业/专精/等级/装等/所属公会。',
    details: [
      '字段格式与数据导出插件（任务书 #26）严格对齐；阵营、区域自动换算为表单选项',
      '职业/专精带入后与下拉联动一致：专精非法值自动清空并提示手选',
      '文件格式错误给出中文提示且不阻断手动填写；导入只填充表单，保存仍需点击「保存角色」，同服查重等校验不变'
    ]
  },
  {
    id: 'v3.2.0-task24-patch2-fix',
    version: 'v3.2.0',
    date: '2026-08-06',
    type: 'fix',
    typeLabel: '修复BUG',
    title: '「添加角色」专精输入改站内标准下拉（任务书 #24-补丁2①）',
    summary: '原专精输入框在输入文字后下拉只剩匹配项，易被误判为「只有一个选项」；已改为与「职业」「区域」一致的标准下拉：未选职业时禁用并提示，选定职业后列出该职业全部专精。',
    details: [
      '更换职业时旧专精自动清空，避免脏数据',
      '专精数据源与成员管理一致（主数据优先、常量兜底）'
    ]
  },
  {
    id: 'v3.2.0-task24-patch-fix',
    version: 'v3.2.0',
    date: '2026-08-05',
    type: 'fix',
    typeLabel: '修复BUG',
    title: '用户中心「添加角色」：弹窗透明修复 + 英雄榜链接解析补强（REQ-077①②）',
    summary: '添加角色弹窗内层容器此前没有任何背景样式导致整体透明，已补齐与全站弹窗一致的视觉；英雄榜链接粘贴后服务器英文 slug 自动映射为国服中文名（如 the-golden-plains→金色平原）。',
    details: [
      '弹窗透明根因：.modal-content 在样式表中零定义（仅用户中心弹窗族 2 处使用），补等效样式对齐公会设置弹窗，用户中心主弹窗 700px 宽度不受影响',
      '英雄榜链接三种格式（hash 型 / character-profile 型 / 带 cn 区域段）粘贴即解析：角色名、服务器、区域自动回填并短暂高亮，附「已解析」提示',
      '服务器映射以国服服务器清单为权威源，未收录的 slug 保留原值并提示手动核对；无法识别的链接提示「未识别链接格式，请手动输入」'
    ]
  },
  {
    id: 'v3.2.0-task24-patch-improve',
    version: 'v3.2.0',
    date: '2026-08-05',
    type: 'improve',
    typeLabel: '功能优化',
    title: '「添加角色」表单体验：职业→专精联动 + 链接清空钮 + 校验改站内提示（REQ-077③）',
    summary: '专精候选随所选职业自动联动（与成员管理同一数据源），英雄榜链接输入框新增一键清空按钮，保存校验不再弹出浏览器原生对话框。',
    details: [
      '选择职业后专精候选自动刷新；更换职业时已填的旧专精自动清空，避免脏数据',
      '英雄榜链接占位示例改为真实格式（https://wow.blizzard.cn/character/#/the-golden-plains/角色名），输入内容后右侧出现 ✕ 一键清空',
      '必填校验、同服同名查重提示统一为站内顶部消息条'
    ]
  },
  {
    id: 'v3.2.0-task24-wp2-fix',
    version: 'v3.2.0',
    date: '2026-08-05',
    type: 'fix',
    typeLabel: '修复BUG',
    title: '服务器上游调用补「连接阶段」硬超时（524 疫苗）',
    summary: '修复隐患：请求超时计时只在连接建立后生效，TCP 连接与 TLS 握手阶段此前无超时覆盖，极端情况下保存操作可能长时间挂起。',
    details: [
      '全部上游调用（登录验证、数据库代理、WCL）从发起即计时：数据库代理 8 秒、登录验证 6 秒，到点主动断开并返回「上游连接超时，请重试」',
      '连接阶段请求从未发出，重试安全；GET 重试 1 次与写操作禁止自动重试的规则保持不变',
      '注入实测：黑洞环境（连接永不完成）下按时返回 504 不再挂死；正常链路零影响'
    ]
  },
  {
    id: 'v3.2.0-task24-wp1-fix',
    version: 'v3.2.0',
    date: '2026-08-05',
    type: 'fix',
    typeLabel: '修复BUG',
    title: '选装备后「掉落BOSS」自动回填（装备分配与心愿单两面板，BUG-013）',
    summary: '从装备库（主数据）选定装备后，「掉落BOSS」按 掉落→BOSS 主数据链路精确回填，取代旧的延时文本模糊匹配；缺少 BOSS 数据时留空不报错。',
    details: [
      '与 REQ-063 赛季回填同一条解析链路，picker 条目携带 bossId 直查，不再靠 BOSS 名模糊包含匹配',
      '内置库/历史引用回退路径用原 BOSS 名兜底，历史保底显示不受影响；赛季回填行为不回归'
    ]
  },
  {
    id: 'v3.2.0-task23-patch2-fix',
    version: 'v3.2.0',
    date: '2026-08-05',
    type: 'fix',
    typeLabel: '修复BUG',
    title: '成员管理职责多选筛选不出双职责成员 + 「全部职业」下拉箭头定位（REQ-075）',
    summary: '职责筛选同时勾选「治疗+输出」时，主专精织雾（治疗）+副专精踏风（输出）的成员筛不出；筛选条件改按主/副专精实时推导成员全部职责，多选为 AND 语义（必须同时具备全部选中职责）。',
    details: [
      '根因：筛选读的是成员存档的单一职责字段，未按主/副专精推导多职责集合',
      '修复后：勾选「治疗+输出」只显示双职责成员，单选语义不变，与职业下拉/搜索框/「显示已离队」组合联动不回归',
      '顺带修正：成员管理筛选条「全部职业」下拉箭头改为自绘样式，垂直居中、右侧留足间距（纯样式，不碰交互）'
    ]
  },
  {
    id: 'v3.2.0-task23-patch2-improve',
    version: 'v3.2.0',
    date: '2026-08-05',
    type: 'improve',
    typeLabel: '功能优化',
    title: '公示页主/副属性筛选项定稿为固定枚举',
    summary: '主/副属性筛选标签不再从已录入装备聚合（数据少时选项残缺），改为 WoW 封闭枚举全量：主属性 力量/敏捷/智力，副属性 爆击/急速/精通/全能。',
    details: [
      '选中某属性但当前赛季无匹配装备时显示空结果，属正常而非筛选项缺失',
      'AND 过滤、大秘境双视图联动、赛季切换复位等行为维持不变'
    ]
  },
  {
    id: 'v3.2.0-task23-patch-feature',
    version: 'v3.2.0',
    date: '2026-08-05',
    type: 'feature',
    typeLabel: '新增功能',
    title: '公示页筛选补全：套装三维筛选 + 掉落池主/副属性标签筛选（REQ-074）',
    summary: '数据公示页套装一览新增「职业/职责/专精」三维筛选；团本与大秘境掉落池新增主属性、副属性多标签筛选。',
    details: [
      '套装区：专精选项随职业联动，职责由专精推导（选职责=过滤出该职责全部专精的套装）',
      '掉落池：主/副属性标签数据源为掉落的主副属性数组，多标签为 AND 关系，单选/组合/清空结果集与条件严格一致',
      '大秘境「按 BOSS / 整体池」双视图下筛选均生效；赛季切换后全部筛选自动重置为默认'
    ]
  },
  {
    id: 'v3.2.0-task23-patch-improve',
    version: 'v3.2.0',
    date: '2026-08-05',
    type: 'improve',
    typeLabel: '功能优化',
    title: '公示页套装一览排序定稿：先按职业、再按专精',
    summary: '套装卡片不再乱序混排——同一职业的全部专精连续排完才进入下一个职业，顺序与游戏字典的职业/专精排序全站统一。',
    details: [
      '职业顺序取 game_classes.class_key，专精顺序取 game_specs.spec_key，公示页不另造顺序'
    ]
  },
  {
    id: 'v3.2.0-task23-patch-fix',
    version: 'v3.2.0',
    date: '2026-08-05',
    type: 'fix',
    typeLabel: '修复BUG',
    title: '公示页套装徽标防重叠 + 首页/公示页 HTML 缓存补洞',
    summary: '套装卡片 2件/4件 徽标与长效果文本改为独立占位，长文本不再挤压重叠；index.html/data.html 外壳补 Cache-Control: no-cache，杜绝浏览器启发式缓存旧首页导致版本串机制失效。',
    details: [
      '徽标固定不压缩独立列，正文独占剩余宽度，全部套装卡片零重叠零溢出',
      'HTML 文档每次回源校验，配合 Last-Modified 新鲜则 304 不重传；带 ?v= 的 js/css 缓存策略维持不变'
    ]
  },
  {
    id: 'v3.2.0-task21-patchB-improve',
    version: 'v3.2.0',
    date: '2026-08-05',
    type: 'improve',
    typeLabel: '功能优化',
    title: '「认领人：XXX」移至角色名下方第二行',
    summary: '成员管理列表的认领人从操作列移到角色名单元格第二行，灰色小字不折行，操作列更清爽。',
    details: [
      '已认领行：角色名正下方第二行显示认领人（可见性仍受公会「认领人标签」开关控制）',
      '操作列只保留「待认领」「认领审核中」等交互标签与操作按钮，已离队视图同标准'
    ]
  },
  {
    id: 'v3.2.0-task21-patchA-fix',
    version: 'v3.2.0',
    date: '2026-08-05',
    type: 'fix',
    typeLabel: '修复BUG',
    title: '认领需审核/仅管理者分配模式下，管理者「批准/认领自己」被误拒',
    summary: '认领需审核模式下，会长在审核区块批准自己的申请时报错「请提交认领申请」；仅管理者分配模式下会长认领自己也被拦。',
    details: [
      '根因：服务端认领护栏在做权限判定前就按认领方式拦截，把管理者的管理权短路',
      '修复：拦截前先判定身份，会长/管理一律放行（防线对普通成员不变）',
      '前端同步：认领需审核模式下，管理者点「待认领」改为与自由认领相同的确认后直接生效，普通成员仍是提交申请'
    ]
  },
  {
    id: 'v3.2.0-task23-wp2-feature',
    version: 'v3.2.0',
    date: '2026-08-05',
    type: 'feature',
    typeLabel: '新增功能',
    title: '数据公示页（免登录公开，REQ-073）',
    summary: '新增免登录公开页 data.html：不登录即可查看团本/大秘境掉落池与套装一览，链接可分享。',
    details: [
      '赛季切换（默认当前赛季）全页联动；团本按 BOSS 三级浏览，大秘境独立分区带「按 BOSS/整体池」视图切换，套装按 赛季×职业×专精 展示',
      '部位/类型筛选与装备名搜索对团本、大秘境两区同时生效；无数据赛季分区显示「数据维护中」',
      '主应用侧边栏新增「数据公示」入口（全角色可见，新开标签页）；公开页只读，匿名仅能访问游戏字典数据'
    ]
  },
  {
    id: 'v3.2.0-task23-wp1-feature',
    version: 'v3.2.0',
    date: '2026-08-05',
    type: 'feature',
    typeLabel: '新增功能',
    title: '大秘境掉落池主数据（REQ-072）',
    summary: '数据中心新增「大秘境掉落」区块：副本 → BOSS 分组维护掉落，支持无法归属 BOSS 的整体池条目。',
    details: [
      'BOSS 管理支持挂副本（与挂团本二选一，数据库约束保证），大秘境掉落按副本 → BOSS 分组增删改',
      '批量录入格式：副本名,BOSS名（可留空=整体池）,装备名,部位,类型,主属性,副属性,特效，非法行报行号跳过',
      '同一副本内整体池同名装备自动去重；数据仅产品超管可维护'
    ]
  },
  {
    id: 'v3.2.0-task22-patch-improve',
    version: 'v3.2.0',
    date: '2026-08-05',
    type: 'improve',
    typeLabel: '功能优化',
    title: '职责图标修正与换装补漏（REQ-071）',
    summary: '职责图标换为完整圆形官方图；心愿单/装备分配补上职业图标与职业色 tag；成员管理专精列与操作列版式统一。',
    details: [
      '坦克/治疗/输出图标换新：蓝盾/绿十字/红剑完整圆形官方图，成员职责列、编辑弹窗等全站生效',
      '心愿单：需求成员列改职业图标+职业色 tag，专精列补专精图标；装备分配「分配给」列同款成员职业 tag（「未认领」小字保持在 tag 外）',
      '成员管理：专精列改职业色 tag（主/副专精同行排列不折行），操作列图标与认领区压缩进同一行不换行，出勤率列对齐修正',
      '三处职业色 tag 共用同一套渲染组件，色值统一取官方职业色'
    ]
  },
  {
    id: 'v3.2.0-task22-wp3-fix2',
    version: 'v3.2.0',
    date: '2026-08-05',
    type: 'fix',
    typeLabel: '修复BUG',
    title: '改名后公会内名字快照不同步',
    summary: '用户中心改名后，公会成员列表、认领审核区块、「认领人：XXX」标签里他人看到的仍是旧名字。',
    details: [
      '改名保存成功后，本人所有公会的名字快照即时同步为新名，他人视角立刻显示新名',
      '服务端同步加护栏：任何人只能改自己的快照字段，代他人改、夹带其他字段一律拒绝'
    ]
  },
  {
    id: 'v3.2.0-task22-wp3-fix1',
    version: 'v3.2.0',
    date: '2026-08-05',
    type: 'fix',
    typeLabel: '修复BUG',
    title: '部署后用户端跑到旧版脚本',
    summary: '页面引用的 js/css 无版本标识，CDN 与浏览器双重缓存会导致界面是新的、交互是旧的。',
    details: [
      'index.html 全部本地 js/css 引用加版本查询串，发版递增即破缓存',
      '版本号统一写在 index.html 顶部注释，递增纪律已写入开发规范'
    ]
  },
  {
    id: 'v3.2.0-task22-wp3-improve',
    version: 'v3.2.0',
    date: '2026-08-05',
    type: 'improve',
    typeLabel: '功能优化',
    title: '公会设置：保存栏吸附底部 + 认领方式说明分段',
    summary: '公会设置弹窗底部新增常驻保存栏，滚动到任何位置都能保存；认领方式三档说明改为一行一个模式。',
    details: [
      '底部保存栏左侧在有改动时提示「有未保存的修改」，右侧保存按钮与原按钮同逻辑',
      '认领方式说明四行分排：自由认领 / 认领需审核 / 仅管理者分配 / 切换不影响已存在的认领'
    ]
  },
  {
    id: 'v3.2.0-task22-wp2-feature',
    version: 'v3.2.0',
    date: '2026-08-05',
    type: 'feature',
    typeLabel: '新增功能',
    title: '职业/专精/职责官方图标换装（REQ-069）',
    summary: '全站职业、专精、职责徽标从 CSS 色块换装为魔兽官方图标（56 枚），图标+文字同行显示。',
    details: [
      '素材：13 职业 + 40 专精 + 3 职责官方 PNG，集中映射 js/iconMap.js 全站唯一取图处',
      '成员管理列表职业列改为「图标+文字」职业色描边 chip，主专精带专精图标，职责图标同步换装',
      '成员编辑弹窗职责选择、考勤名单、用户中心「我的认领」同步换装',
      '缺图自动回退文字徽标不裂图；旧色块样式保留为回退'
    ]
  },
  {
    id: 'v3.2.0-task22-wp1-improve',
    version: 'v3.2.0',
    date: '2026-08-05',
    type: 'improve',
    typeLabel: '功能优化',
    title: '成员管理列表对齐收口（REQ-068）',
    summary: '成员/装备/心愿/统计同款表格行内垂直居中统一，徽标不再折行撑歪行高。',
    details: [
      '全表单元格垂直居中；表格内徽标统一 20px 高、不换行，与同行文字基线对齐（修复状态「正式」、职业「恶魔猎手」徽标折行）',
      '操作列图标组统一尺寸间距并整组居中，认领区（待认领/认领人）与图标组对齐',
      '成员表加入日期列不再折行；长角色名/多副专精/多职责极端行行内容保持居中',
      '已离队视图、装备分配、心愿单列表同标准修复'
    ]
  },
  {
    id: 'v3.2.0-task21-wp2-feature',
    version: 'v3.2.0',
    date: '2026-08-05',
    type: 'feature',
    typeLabel: '新增功能',
    title: '认领治理三档公会开关（REQ-067）',
    summary: '公会可自选认领方式：自由认领 / 认领需审核 / 仅管理者分配，仅会长可改。',
    details: [
      '自由认领（默认）：维持现状，成员自助认领先到先得，存量公会不受影响',
      '认领需审核：成员提交认领申请后显示「认领审核中」，管理者在成员管理顶部审核区块批准或拒绝，审批结果通知申请人；批准瞬间若角色已被抢领会明确报错不覆盖',
      '仅管理者分配：成员无自助认领入口（hover 可见归属说明），由管理者在编辑成员时统一指定',
      '服务端代理同步升级：审核/分配模式下 viewer 直写认领一律拦截；认领申请仅放行本人、未认领成员、审核模式公会，同一角色仅允许一条待审申请',
      '需先执行数据库增量迁移（sql/15）后生效'
    ]
  },
  {
    id: 'v3.2.0-task21-wp1-fix',
    version: 'v3.2.0',
    date: '2026-08-05',
    type: 'fix',
    typeLabel: '修复BUG',
    title: '账号显示名两处不一致（BUG-052）',
    summary: '用户中心改的显示名与右上角显示的不是同一个字段，改名后右上角不生效。',
    details: [
      '统一为唯一真源：账号显示名只存 auth user_metadata.display_name，用户中心保存直接写它',
      '改名后右上角立即显示新名字，不用重新登录；刷新、换设备登录后依旧一致',
      '旧的 user_profiles.display_name 字段不再写入，仅作老数据回退展示'
    ]
  },
  {
    id: 'v3.2.0-task21-wp1-improve',
    version: 'v3.2.0',
    date: '2026-08-05',
    type: 'improve',
    typeLabel: '功能优化',
    title: '认领相关说明文案补齐',
    summary: '公会设置「认领人标签」开关补用途说明；成员编辑弹窗的认领人指派入口补提示，不再难找。',
    details: [
      '开关下方新增灰色小字：控制心愿单与装备分配列表是否显示每个角色背后的认领人，关闭后仅管理者在成员管理中可见认领状态',
      '成员编辑弹窗「认领人」分组新增说明：管理者可在此直接为成员指定、调整或解除认领人'
    ]
  },
  {
    id: 'v3.2.0-task21-wp1-feature',
    version: 'v3.2.0',
    date: '2026-08-05',
    type: 'feature',
    typeLabel: '新增功能',
    title: '认领二次确认 + 「待认领」明示（REQ-066）',
    summary: '认领不再一键即中：先弹确认框讲清用途再生效；未认领的行显示明确的「待认领」标签。',
    details: [
      '确认弹窗说明认领含义：绑定账号先到先得、数据聚合到「我的认领」、管理可调整、领错可自行解除',
      '未认领的成员行从单个金锁图标改为灰字描边的「待认领」可点击标签，点击即弹确认框',
      '已认领行显示不变：他人认领显示「认领人：XXX」（受公会开关控制），本人认领保留解除入口'
    ]
  },
  {
    id: 'v3.2.0-task16-refactor',
    version: 'v3.2.0',
    date: '2026-08-02',
    type: 'refactor',
    typeLabel: '模块调整',
    title: 'Supabase SDK 改为本地内嵌',
    summary: '前端 Supabase JS SDK 由海外 CDN 引用改为随站点本地加载，首开不再依赖外部 CDN 可用性。',
    details: [
      'index.html 仅改 script 引用一行，SDK 文件（supabase-js@2 官方版）存放于 assets/vendor/ 随站点分发',
      '业务逻辑零改动，登录/读写行为与之前完全一致'
    ]
  },
  {
    id: 'v3.2.0-task15-refactor',
    version: 'v3.2.0',
    date: '2026-08-02',
    type: 'refactor',
    typeLabel: '模块调整',
    title: '数据库迁移至国内自托管（REQ-035）',
    summary: '数据库由海外 Supabase 云整体迁移至国内自托管服务器，国内读写不再跨太平洋，写入超时根治。',
    details: [
      '数据一行不丢：切换前最终导出，public + auth 全部 42 张表逐表对账全等（成员/考勤/心愿/装备/主数据全量）',
      '老用户登录态保留：复用原 JWT 密钥，全员免重新登录',
      '国内实测热请求 0.10~0.14 秒，告别跨太平洋 524 超时',
      '业务代码零改动，功能与权限行为与迁移前完全一致'
    ]
  },
  {
    id: 'v3.2.0-task14-patch4-feature',
    version: 'v3.2.0',
    date: '2026-07-29',
    type: 'feature',
    typeLabel: '新增功能',
    title: '装备库选择自动带出赛季',
    summary: '装备分配从装备库选择装备后，按来源链路自动回填「赛季」字段。',
    details: [
      '确认选择后按 掉落→BOSS→团本→所属赛季 链路推导赛季名（如 12.1 团本 → S2），自动填入分配行「赛季」',
      '装备无来源或链路任一环节缺数据时赛季留空，不报错、不阻断填充',
      '内置库回退路径（回滚开关）同样按团本名反查赛季处理'
    ]
  },
  {
    id: 'v3.2.0-task14-patch4-refactor',
    version: 'v3.2.0',
    date: '2026-07-29',
    type: 'refactor',
    typeLabel: '模块调整',
    title: '活动「团队标签」并入「团号」',
    summary: '创建/编辑活动面板的旧「团队标签」（蓝色徽章）与新「团号」（黄色徽章）去重，只保留团号。',
    details: [
      '数据迁移：旧团队标签有值且团号为空的记录，旧值迁入团号（增量 SQL sql/13，待运营执行）',
      '面板只保留「团号」一个字段；旧蓝色团队标签徽章下线，团号黄色徽章规则不变（纯数字→「N 团」、文字→「团号：X」、空不显）',
      '时间冲突检测分组键同步切换为团号：同团号同日时段交叉仍黄色警告，不同团号互不干扰',
      '数据库旧列 team_tag 随 sql/13 一并删除（已评估无其他引用方）'
    ]
  },
  {
    id: 'v3.2.0-task14-patch3-feature',
    version: 'v3.2.0',
    date: '2026-07-29',
    type: 'feature',
    typeLabel: '新增功能',
    title: '活动「团号」徽章',
    summary: '活动新增团号字段，考勤卡片直接显示「N 团 / 团号：X」徽章。',
    details: [
      '创建/编辑活动面板新增「团号」输入框（可空），填纯数字显示「N 团」、填文字显示「团号：X」、留空不显示',
      '活动卡片徽章区布局重做：文字徽章不再被裁剪，与手动标记徽章/WCL 复盘按钮排列协调',
      '旧活动记录无团号字段照常渲染，无需删改历史数据（增量 SQL 执行后生效）'
    ]
  },
  {
    id: 'v3.2.0-task14-patch3-improve',
    version: 'v3.2.0',
    date: '2026-07-29',
    type: 'improve',
    typeLabel: '功能优化',
    title: '套装名物化与效果独立填写',
    summary: 'S1/S2 套装名真实写入全部专精行，2件/4件效果不再绑定套装名。',
    details: [
      '套装名物化：S1/S2 已录套装名真实写入该职业全部专精行（共 77 行），不再依赖占位联动显示',
      'S2 十三职业官方套装名全量入库（翡翠督军的统御 / 祝圣烈焰之耀 / 潜伏蝰蛇的伏击 等）',
      '解除绑定：套装名为空时 2 件/4 件效果也可独立填写保存'
    ]
  },
  {
    id: 'v3.2.0-task14-patch3-fix',
    version: 'v3.2.0',
    date: '2026-07-29',
    type: 'fix',
    typeLabel: '修复BUG',
    title: '装备库确认链路、专精表对齐与下拉合并',
    summary: '修复装备库「确认选择」无反应（BUG-051），特效重复前缀、专精表列对齐、「其他」下拉合并。',
    details: [
      '修复装备库选择面板可选中但「确认选择」无反应（BUG-051）：主数据装备 UUID 未加引号导致选中失效',
      '修复装备卡片特效显示「装备：装备：」重复前缀：录入文本已含前缀时显示层不再重复添加',
      '修复数据中心专精区块 13 个职业表格列宽不一：四列固定宽度，全职业左对齐同一位置',
      '掉落池部位/类型下拉删除单列「其他」，统一保留「其他（手动输入）」，历史已存"其他"值照常显示编辑',
      '修复日期输入框 Ctrl+A 全选时原生 yyyy/mm/dd 白色高亮透出：拦截全选快捷键，空值框也只显示中文占位',
      '清除掉落池测试垃圾数据 3 行，9 张主数据表全量复查'
    ]
  },
  {
    id: 'v3.2.0-task13-patch',
    version: 'v3.2.0',
    date: '2026-07-28',
    type: 'feature',
    typeLabel: '新增功能',
    title: '品牌焕新「魔兽管家」与界面组件升级',
    summary: '全站启用新品牌「魔兽管家 WoW Butler」，团本自定义下拉、头像菜单、职业图标、身份徽章全面上线。',
    details: [
      'V2.2 主数据层：团本/BOSS/职业/专精/赛季/大米/掉落池/套装 9 张字典表入库，游戏更新不再发版',
      '新增「数据中心」维护页（仅产品超管可见）：九区块维护 + 职业专精字典一键导入 + 掉落批量录入',
      '套装按 赛季×职业×专精 展开维护（12.1 套装按专精区分），掉落池支持特效与主/副属性标签',
      '考勤编辑弹窗新增实时统计行：已登记人数与出席/替补/请假/缺席/迟到即时汇总',
      '全站品牌焕新「魔兽管家 WoW Butler」：侧边栏盾标、登录页大标、页签标题与 favicon 全量替换',
      '团本名称升级为自定义下拉面板：暗色浮层、输入过滤、最近使用置顶、其他手输兜底、键盘可用，输入框右侧新增 ✕ 一键清空重选',
      '职业与职责本地图标 16 枚（单色职业色），成员列表、考勤名单、导入预览同步启用',
      '身份徽章重设计：盾形底+图标+文字（会长金/编辑蓝/浏览灰），公会栏、成员列表、头像菜单旁统一'
    ]
  },
  {
    id: 'v3.2.0-task13-fix',
    version: 'v3.2.0',
    date: '2026-07-28',
    type: 'fix',
    typeLabel: '修复BUG',
    title: '界面组件与窄屏修复',
    summary: '原生控件深色渲染、活动卡片布局、手动标记浮层、窄屏表格横滚。',
    details: [
      '修复深色主题下日期/时间选择器、下拉箭头等原生控件图标看不清',
      '修复活动卡片居中大空白：信息组左对齐、出勤数据靠右',
      '修复手动标记明细展示：改为预览页内嵌折叠区，就地展开完整列表（替代悬浮浮层）',
      '修复装备分配等宽表窄屏看不到右侧列：纳入横向滚动体系、表头吸顶、首列钉住',
      '修复统计报表缺席榜被挤成贴边竖条、出勤率图表成员名重叠（旋转 45°+省略号）',
      '修复退出公会/退出登录后登录按钮卡"登录中..."：按钮状态机闭环，失败复位+错误提示',
      '修复切换公会弹窗内退出登录偶发不跳转登录页：任何入口退出统一清会话、弹窗全出栈、直达登录页',
      '修复字典导入器读外部文件失败：改读内置快照一键入库，连点不重复',
      '修复数据中心九区块保存按钮点击无反应（按钮事件复位缺陷），九区块全链路实测通过',
      '修复专精职责/图标导入缺失与错配：导入以快照为准强制覆盖，图标缺省回填职业图标',
      '修复职责下拉"空值"假象：26px 下拉文本被裁剪，13 职业职责全部正常显示',
      '修复日期输入 focus 态透出英文格式、考勤筛选行日期与复选框重叠',
      '日期范围筛选框改为仅"自定义"时显示',
      '装备库选择列表只列主数据团本装备，旧英文装备历史引用保底显示',
      '活动卡片"手动标记"改为文字标签，大秘境"新本"否项红色语义化',
      '日期输入全站中文化：年月日中文显示，保留原生选择器'
    ]
  },
  {
    id: 'v3.2.0-task13-improve',
    version: 'v3.2.0',
    date: '2026-07-28',
    type: 'improve',
    typeLabel: '功能优化',
    title: '交互感知与中小分辨率适配',
    summary: '角色变更全程有感知、冲突直显、手动标记明细、离队分组、1366×768 适配。',
    details: [
      '调整成员角色全程有感知：变更中禁用防重、成功 toast、失败就地提示并回滚选择',
      '时间冲突的活动卡片直接显示冲突小字，不再依赖悬浮',
      'WCL 同步预览"N 条已手动标记"可展开逐行明细（成员：状态）',
      '开启「显示已离队」时离队成员集中底部分组展示',
      '登录/注册按钮文本居中（默认态与"登录中.../注册中..."忙碌态一致）',
      '1366×768 中小分辨率适配：间距收紧、弹窗限宽、昵称省略、侧边栏可折叠'
    ]
  },
  {
    id: 'v3.2.0-task13-refactor',
    version: 'v3.2.0',
    date: '2026-07-28',
    type: 'refactor',
    typeLabel: '模块调整',
    title: '导航重构与组件规范统一',
    summary: '头像菜单导航、按钮/标签/表格规范统一、更新日志四维门禁。',
    details: [
      '右上角改为头像菜单：用户中心 / 切换公会 / 退出登录收进头像下拉，功能不变',
      '按钮四级规范（主/次幽灵/危险/文字）全站收口',
      '标签体系统一尺寸与语义色板（金管理/红危险/灰中性/黄警告/蓝信息/绿成功）',
      '表格五表统一：文本左/数字右/状态居中 + 斑马纹 + 悬停高亮 + 吸顶表头',
      '更新日志四维分类确立为发布门禁（开发规范第五章）'
    ]
  },
  {
    id: 'v3.2.0-task11',
    version: 'v3.2.0',
    date: '2026-07-27',
    type: 'feature',
    typeLabel: '新增功能',
    title: 'WCL 战斗日志深度集成',
    summary: '从 WCL 链接导入名单、一键同步考勤，参战快照永久留存。',
    details: [
      '从 WCL 链接导入成员名单（智能导入新标签页，自动识别职业与服务器）',
      '已挂 WCL 链接的活动可一键同步考勤：全勤/部分参战/未匹配三区预览，不覆盖手动标记，重复同步幂等',
      '同步成功后参战名单快照存入活动，免费日志过期后仍可查'
    ]
  },
  {
    id: 'v3.2.0-task12',
    version: 'v3.2.0',
    date: '2026-07-27',
    type: 'feature',
    typeLabel: '新增功能',
    title: '考勤批量操作、筛选与活动状态',
    summary: '考勤筛选、批量标记/删除、活动取消恢复、软删除，考勤管理全面提效。',
    details: [
      '考勤列表筛选：按成员、状态、时间范围（含本赛季）过滤，实时显示出勤率小计',
      '考勤详情勾选多人后批量标记出席/缺席/替补/请假',
      '活动列表与成员管理支持勾选后批量删除（二次确认、逐条列明）',
      '活动可取消/恢复：取消后灰显且不计入出勤率，恢复即重新计入',
      '成员删除改为软删除：标记「离队」不丢历史记录；同名再添加可一键恢复',
      '活动团队标签同日时间交叉时黄色高亮预警；团本名称下拉记住最近使用'
    ]
  },
  {
    id: 'v3.2.0-task12-fix',
    version: 'v3.2.0',
    date: '2026-07-27',
    type: 'fix',
    typeLabel: '修复BUG',
    title: '考勤与导入稳定性修复',
    summary: '视图偏好串号、假成功、弹窗遮挡、加载不全、导入撞唯一约束等一批稳定性修复。',
    details: [
      '修复考勤视图偏好串号：按账号+公会记住列表/日历选择，换身份不再错乱',
      '修复智能导入确认按钮可重复点击导致重复导入',
      '修复 WCL 同步预览「添加为成员」被弹窗层叠遮挡无响应',
      '修复批量删除活动/成员偶发"假成功"（提示成功但列表不刷新），并修复偶发刷新后数据加载不全（失败时页面明确提示）',
      '修复智能导入撞同名报"云端同步出错"：识别唯一约束冲突给出具体中文原因，单行失败不再拖死整批',
      '修复离队成员操作列残留无效删除按钮（改为恢复按钮）；聚合确认后预览行状态即时更新；状态列文字不再竖排换行',
      '防御性加固：考勤整表保存时名单外的既有考勤行按原状态保留'
    ]
  },
  {
    id: 'v3.2.0-task12-improve',
    version: 'v3.2.0',
    date: '2026-07-27',
    type: 'improve',
    typeLabel: '功能优化',
    title: '考勤感知与提示优化',
    summary: 'WCL 同步全程提示、红区成员一键添加、未标记成员常驻提醒。',
    details: [
      'WCL 同步写入期间提示"请勿关闭页面"，成功后常驻提醒手动标记日志外成员',
      'WCL 同步预览红色未匹配角色可一键添加为成员，添加后自动纳入考勤写入',
      '已结束活动的考勤可随时补录修改，报表即时重算'
    ]
  },
  {
    id: 'v3.2.0-task12-refactor',
    version: 'v3.2.0',
    date: '2026-07-27',
    type: 'refactor',
    typeLabel: '模块调整',
    title: '出勤率统计口径调整',
    summary: '已取消活动不再计入任何人的出勤率，数据保留可恢复。',
    details: [
      '出勤率统计全站过滤已取消活动（数据保留，仅统计口径调整）',
      '成员"删除"语义统一为软删除（标记离队），历史考勤/装备记录全保留'
    ]
  },
  {
    id: 'v3.2.0',
    version: 'v3.2.0',
    date: '2026-07-26',
    type: 'feature',
    typeLabel: '重大更新',
    title: '安全鉴权、权限体系与体验优化',
    summary: '服务端公会级写入鉴权上线，浏览权限只读模式，装备心愿单双向联动，全站出勤率口径统一；下线飞书同步与本地模式。',
    details: [
      '—— 新增功能 ——',
      '服务端公会级写入鉴权（会长/编辑/浏览三级权限，26 项自动化验证）',
      '浏览权限只读模式；会长可提升成员为编辑',
      '非会长成员退出公会（二次确认+通知管理者）',
      '装备分配 ↔ 心愿单双向联动（自动创建/标记已获取）',
      '同服务器角色名唯一性拦截',
      '活动可挂载 WCL 战斗日志链接，成员一键直达复盘',
      '—— 修复bug ——',
      '修复注册/创建公会/加入公会无反应（准入链路三处失效）',
      '修复 Top5 出勤率统计口径错误（全站统一算法源）',
      '修复退出公会报错、认证提示英文、昵称保存不生效',
      '修复活动时间不显示、角色重复保存',
      '—— 功能优化 ——',
      '删除活动响应提速（写链路减半）',
      '旧活动时间统一回填 20:00–23:00',
      '成员表新增职责列，考勤默认列表视图，活动时长实时显示',
      '—— 模块调整 ——',
      '下线飞书同步模块、下线本地模式',
      '版本标识简化为纯版本号'
    ]
  },
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
    type: 'fix',
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
    type: 'fix',
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
    type: 'fix',
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
    type: 'fix',
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
    type: 'fix',
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
      '副属性自动勾选对应标签（统一官方用字爆击）',
      '填充后自动触发心愿单匹配提示'
    ]
  },
  {
    id: 'v2.10.1',
    version: 'v2.10.1',
    date: '2026-07-07',
    type: 'improve',
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
      '侧边栏宽度从240px收窄至200px，标题区升级品牌展示，增加阴影层次感',
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
  // DEC-004：侧边栏版本号来自单一常量 APP_VERSION
  const verEl = document.getElementById('appVersion');
  if (verEl) verEl.textContent = APP_VERSION;

  // 设置今日日期显示（REQ-106，任务书 #34 WP2：精确到秒、每秒走动；页面隐藏时跳过 DOM 写入，可见即恢复准确值）
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const p2 = n => String(n).padStart(2, '0');
  const renderTopbarTime = () => {
    const todayEl = document.getElementById('todayStr');
    if (!todayEl) return;
    const now = new Date();
    todayEl.textContent =
      `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} 周${weekdays[now.getDay()]} ${p2(now.getHours())}:${p2(now.getMinutes())}:${p2(now.getSeconds())}`;
  };
  renderTopbarTime();
  setInterval(() => {
    if (document.visibilityState === 'hidden') return; // 隐藏页签不写入，回来自动恢复准确值
    renderTopbarTime();
  }, 1000); // SPA 单定时器，随 topbar 生命周期，登出/切页无泄漏面

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
          const lastGuildId = window.CloudSync.getLastGuildId ? window.CloudSync.getLastGuildId() : null; // BUG-078：用户维度键
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
  document.getElementById('itemDbWeaponFilter').value = ''; // 任务书 #31：武器独立下拉
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

// 副属性颜色映射（官方用字「爆击」唯一口径，任务书 #23-补丁3-附）
const secondaryStatColorMap = {
  '爆击': 'stat-crit',
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

// REQ-057（方案 B，运营拍板）：装备库选择列表数据源正式切换为 boss_loot 主数据。
// 103 件内置英文装备全部移出选择列表；历史分配/心愿引用保底显示不删除。
// 回退方案：MD_PICKER_MASTER_ONLY 改 false 即恢复内置库路径（当前前端保留该开关便于回滚）。
const MD_PICKER_MASTER_ONLY = true;
// 主数据掉落 → picker 条目结构（与既有填充链路 lootFillFromItemDb/wishlistFillFromItemDb 兼容）
function getMasterLootItems() {
  const items = [];
  MasterData.getRaids().forEach(raid => {
    MasterData.getBosses(raid.id).forEach(boss => {
      MasterData.getLoot(boss.id).forEach(l => {
        items.push({
          id: l.id, name: l.item_name,
          raid: raid.name, raidName: raid.name, raidId: raid.id,
          boss: boss.name, bossId: boss.id, bossIndex: `${boss.boss_order}号`,
          armorType: l.item_type || '', slot: l.slot || '',
          icon: '📦', quality: 'epic', itemLevel: '',
          stats: { primary: (l.primary_stats || []).join('/'), secondary: l.secondary_stats || [], primaryDetail: null, secondaryDetail: null },
          equipEffect: l.effect || ''
        });
      });
    });
  });
  return items;
}

// 更新首领掉落下拉选项（REQ-057B：只列主数据中有掉落的 BOSS）
function updateItemDbBossFilter() {
  const raidVal = document.getElementById('itemDbRaidFilter').value;
  const bossSelect = document.getElementById('itemDbBossFilter');
  bossSelect.innerHTML = '<option value="">全部首领</option>';
  if (!raidVal) { bossSelect.disabled = true; return; }
  const raid = MasterData.getRaidByName(raidVal);
  const bosses = raid ? MasterData.getBosses(raid.id).filter(b => MasterData.getLoot(b.id).length) : [];
  if (!bosses.length) { bossSelect.disabled = true; return; }
  bossSelect.disabled = false;
  bosses.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.name;
    opt.textContent = `${b.boss_order}号 ${b.name}`;
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
  const weaponFilter = document.getElementById('itemDbWeaponFilter').value; // 任务书 #31
  const armorFilter = document.getElementById('itemDbArmorFilter').value;
  const statFilter = document.getElementById('itemDbStatFilter').value;

  // REQ-057（方案 B）：装备库只显示 boss_loot 主数据装备；
  // 回退开关关闭时（false）走旧逻辑：只显示所属团本存在于 game_raids 的内置装备
  const baseAll = MD_PICKER_MASTER_ONLY
    ? getMasterLootItems()
    : itemDatabase.filter(item => new Set(getGameRaidNames()).has(item.raidName));
  // 任务书 #31 修正项①（REQ-097，D1 裁定）：恒定排除杂项（slot='杂项'）与套装兑换物，不做切换入口；
  // 词表单一真源 = js/lootTaxonomy.js（PICKER_EXCLUDED_SLOTS）
  const base = baseAll.filter(item => !window.LootTaxonomy.isPickerExcludedSlot(item.slot));
  itemDbPickerItems = base; // selectDbItem 查找池

  // 左侧团本筛选同步只列有掉落的主数据团本（每次渲染重建，保留当前选择）
  const raidSelect = document.getElementById('itemDbRaidFilter');
  if (raidSelect) {
    const cur = raidSelect.value;
    const keys = [...new Set(base.map(i => i.raid))];
    raidSelect.innerHTML = '<option value="">全部团本</option>' +
      keys.map(k => `<option value="${k}" ${k === cur ? 'selected' : ''}>${k}</option>`).join('');
  }

  let filtered = base.filter(item => {
    if (search && !item.name.toLowerCase().includes(search) && !item.boss.toLowerCase().includes(search)) return false;
    if (raidFilter && item.raid !== raidFilter) return false;
    if (bossFilter && item.boss !== bossFilter) return false;
    if (slotFilter && item.slot !== slotFilter) return false;
    // 任务书 #31：武器 4 项判定走词表（单手/双手=item_type 白名单、远程=弓弩枪、副手=slot'副手物品'）
    if (weaponFilter && !window.LootTaxonomy.matchWeapon(weaponFilter, item.slot, item.armorType)) return false;
    if (armorFilter && item.armorType !== armorFilter) return false;
    if (statFilter && !item.stats.secondary.includes(statFilter)) return false;
    return true;
  });
  
  document.getElementById('itemDbCount').textContent = `共 ${filtered.length} 件装备`;
  
  const listEl = document.getElementById('itemDbList');
  if (base.length === 0) {
    listEl.innerHTML = '<div class="item-db-empty">数据中心尚无掉落数据，请先在「数据中心 → 掉落池」录入</div>';
    return;
  }
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
      <div class="item-card ${isSelected ? 'selected' : ''}" onclick="selectDbItem('${item.id}')">
        <div class="item-card-icon">${item.icon}</div>
        <div class="item-card-info">
          <div class="item-card-name ${qualityClass}">${item.name}</div>
          <div class="item-card-meta">${item.armorType} · ${item.slot} · 装等${item.itemLevel}</div>
          <div class="item-card-stats">
            <div><span class="stat-label">主属性：</span>${primaryStatHtml}</div>
            <div><span class="stat-label">副属性：</span>${secondaryStatHtml}</div>
            ${item.equipEffect ? `<div class="loot-effect-green" style="margin-top:4px;">装备：${item.equipEffect.replace(/^装备[:：]\s*/, '').substring(0, 80)}${item.equipEffect.replace(/^装备[:：]\s*/, '').length > 80 ? '...' : ''}</div>` : ''}
          </div>
        </div>
        <div class="item-card-source">${sourceText}</div>
      </div>
    `;
  }).join('');
}

// 选择装备
let itemDbPickerItems = []; // 当前 picker 数据源（主数据 boss_loot 或内置库）
function selectDbItem(itemId) {
  // BUG-051：boss_loot 主键为 UUID 字符串，内置库为数字——统一按字符串比较，回退路径也兼容
  selectedDbItem = itemDbPickerItems.find(i => String(i.id) === String(itemId)) || itemDatabase.find(i => String(i.id) === String(itemId));
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

// REQ-063（任务书 #14-补丁4）：按来源链路 掉落(boss_loot)→BOSS(game_bosses)→团本(game_raids)→赛季(game_seasons)
// 推导装备所属赛季名。主数据路径用 item.raidId 直查；内置库回退路径用团本中文名反查。
// 装备无来源或链路任一环缺数据时返回 ''（留空），不报错。
function resolveItemDbSeasonName(item, raidName) {
  try {
    if (typeof MasterData === 'undefined' || !MasterData.getRaids) return '';
    let raid = null;
    if (item && item.raidId) {
      raid = MasterData.getRaids().find(r => r.id === item.raidId) || null;
    }
    if (!raid && raidName && typeof MasterData.getRaidByName === 'function') {
      raid = MasterData.getRaidByName(raidName);
    }
    if (!raid || !raid.season_id) return '';
    const season = (MasterData.getSeasons() || []).find(s => s.id === raid.season_id);
    return season ? (season.name || '') : '';
  } catch (e) {
    console.warn('[REQ-063] 赛季推导失败，按留空处理:', e);
    return '';
  }
}

// BUG-013（任务书 #24 WP1）：按 REQ-063 同一解析链路 掉落(boss_loot)→BOSS(game_bosses) 推导掉落 BOSS 名。
// 主数据路径用 item.bossId 直查 MasterData.getBosses(raidId)；无 bossId（内置库/历史回退路径）用 item.boss 兜底；
// 链路缺数据时返回 ''（留空），不报错。
function resolveItemDbBossName(item) {
  try {
    if (item && item.bossId && typeof MasterData !== 'undefined' && MasterData.getBosses) {
      const bosses = MasterData.getBosses(item.raidId || '') || [];
      const boss = bosses.find(b => b.id === item.bossId);
      if (boss) return boss.name || '';
    }
    return (item && item.boss) || '';
  } catch (e) {
    console.warn('[BUG-013] BOSS 推导失败，按留空处理:', e);
    return '';
  }
}

// BUG-057（任务书 #27-补丁）：picker 回填「大类/部位」的统一解析——以库内 slot（部位）为主键、
// item_type 作武器/副手的部位细分，联动口径沿用 REQ-060 部位↔类型映射，并兼容插件采集词汇
// （单手/双手/远程/副手物品/腕部，2026-08-10 库内实测分布）。库内缺值或非装备词汇（杂项/套装兑换物等）
// 时对应字段返回 ''，调用方保持表单现状不改动（留空不报错、不阻断手改）。
// 旧实现只看 item_type 且部位用文本模糊匹配：item_type 为「其它」等噪声值时大类落默认「武器」、
// 部位落首项「单手锤」（实测样本：饰品 艾林先知的凝视 slot=饰品 item_type=其它）。
function resolvePickerCategorySlot(item) {
  const slot = ((item && item.slot) || '').trim();
  const type = ((item && item.armorType) || '').trim(); // 主数据路径 armorType = 库内 item_type
  // 部位 → 大类（REQ-060 口径：防具九部位 / 颈部手指=首饰 / 饰品 / 武器与副手=武器）
  // 任务书 #31（REQ-097，D3）：词表来源切换为 js/lootTaxonomy.js slotCategoryOf（单一真源派生，判定语义不变；
  // 原内联 slotCategoryMap 已移除，防第三份映射，词汇改动只改 lootTaxonomy.js）
  // 库内词汇 → 表单部位词汇（lootSlotMap）差异项归一
  const formSlotMap = { '手腕': '腕部', '项链': '颈部', '戒指': '手指', '披风': '背部', '长柄武器': '长柄', '枪': '枪械', '副手': '副手物品' };
  const norm = v => formSlotMap[v] || v;
  let category = window.LootTaxonomy.slotCategoryOf(slot);
  let formSlot = '';
  if (category === '武器') {
    // 武器/副手：部位取 item_type 细分（盾牌/副手物品同在表单「武器」大类下）；item_type 不可用时取 slot 本身
    const t = norm(type);
    if ((lootSlotMap['武器'] || []).includes(t)) formSlot = t;
    else if ((lootSlotMap['武器'] || []).includes(norm(slot))) formSlot = norm(slot);
  } else if (category) {
    const s = norm(slot);
    if ((lootSlotMap[category] || []).includes(s)) formSlot = s;
  }
  if (!category && type) {
    // 部位缺失/非装备词汇：回退 item_type 推大类（部位能定则定，否则留空）
    if (['板甲', '锁甲', '皮甲', '布甲', '披风'].includes(type)) category = '防具';
    else if (type === '饰品') { category = '饰品'; formSlot = '饰品'; }
    else if (['项链', '戒指'].includes(type)) { category = '首饰'; formSlot = norm(type); }
    else if ((lootSlotMap['武器'] || []).includes(norm(type))) { category = '武器'; formSlot = norm(type); }
  }
  return { category, slot: formSlot };
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
    // BUG-013（任务书 #24 WP1）：掉落BOSS 按 REQ-063 同链路精确回填（取代旧 setTimeout+文本模糊匹配）；
    // lootUpdateBossOptions(selectedBoss) 精确值选中，缺 BOSS 数据时留空不报错
    lootUpdateBossOptions(resolveItemDbBossName(item));
  }
  
  // 装备大类和部位（BUG-057：按库内 slot/item_type 回填，REQ-060 联动口径统一解析；
  // 解析不出的字段保持表单现状，不阻断手改；部位精确选中取代旧 setTimeout+文本模糊匹配，无时序窗口）
  const pickerCS = resolvePickerCategorySlot(item);
  const categorySelect = document.getElementById('lootCategory');
  if (categorySelect && pickerCS.category) {
    categorySelect.value = pickerCS.category;
    lootUpdateSlotOptions(pickerCS.slot);
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
      // 统一用词：旧字形 →「爆击」（存量错字行归一展示，任务书 #23-补丁3-附；字面量用转义防 grep 误命中）
      const normalizedStat = stat === '暴\u51fb' ? '爆击' : stat;
      if (['爆击', '急速', '精通', '全能'].includes(normalizedStat)) {
        lootSelectedSecondaryStats.push(normalizedStat);
      }
    });
    document.querySelectorAll('#lootSecondaryStats .secondary-stat-tag').forEach(tag => {
      tag.classList.toggle('active', lootSelectedSecondaryStats.includes(tag.dataset.stat));
    });
  }
  
  // 特殊效果
  document.getElementById('lootSpecialEffect').value = item.equipEffect || '';
  
  // REQ-063（任务书 #14-补丁4）：按来源链路自动回填「赛季」；无来源/链路缺数据时留空不报错
  const lootSeasonInput = document.getElementById('lootSeason');
  if (lootSeasonInput) lootSeasonInput.value = resolveItemDbSeasonName(item, raidName);
  
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
      // BUG-013（任务书 #24 WP1）：掉落BOSS 按 REQ-063 同链路精确回填（取代旧 setTimeout+文本模糊匹配）；
      // 无匹配选项/缺 BOSS 数据时留空不报错
      const bossName = resolveItemDbBossName(selectedDbItem);
      const bossSelect = document.getElementById('wishlistBoss');
      const bossText = document.getElementById('wishlistBossText');
      if (bossSelect && bossSelect.style.display !== 'none') {
        bossSelect.value = bossName;
      } else if (bossText && bossText.style.display !== 'none') {
        bossText.value = bossName;
      }
    }
  }
  
  // 设置部位和类型（BUG-057：与装备分配面板同一解析 resolvePickerCategorySlot，两面板同标准；
  // 解析不出的字段保持表单现状，不阻断手改；部位精确选中取代旧 setTimeout+文本模糊匹配）
  const pickerCSW = resolvePickerCategorySlot(selectedDbItem);
  const categorySelect = document.getElementById('wishlistCategory');
  if (categorySelect && pickerCSW.category) {
    categorySelect.value = pickerCSW.category;
    wishlistUpdateSlotOptions(pickerCSW.slot);
  }
}


// ==================== 任务书 #14：数据中心（V2.2 主数据维护页，仅超管） ====================
// 权限：tab 隐藏 + switchPage 守卫 + server.js 代理超管校验（最后防线）。
// 写路径：MasterData.mdInsert/mdUpdate/mdDelete（server.js 代理）→ refresh 缓存 → 重渲。
let mdCurrentTab = 'patches';
let mdLootNav = { raidId: '', bossId: '' }; // 掉落池两级导航状态
let mdTierSeasonId = ''; // 套装区当前赛季

modalDirtyChecks.mdEditorModal = () => isModalFormDirty('mdEditorModal');

function mdSwitchTab(tab) {
  mdCurrentTab = tab;
  document.querySelectorAll('#mdTabs .view-tab').forEach(t => t.classList.toggle('active', t.dataset.mdtab === tab));
  renderDatacenter();
}

async function renderDatacenter() {
  if (!window.MasterData) return;
  if (!MasterData.isLoaded()) await MasterData.init();
  const panel = document.getElementById('mdPanel');
  if (!panel) return;
  const renderers = {
    patches: mdRenderPatches, seasons: mdRenderSeasons, raids: mdRenderRaids,
    bosses: mdRenderBosses, loot: mdRenderLoot, dungeonloot: mdRenderDungeonLoot, tiersets: mdRenderTierSets,
    dungeons: mdRenderDungeons, classes: mdRenderClasses, specs: mdRenderSpecs
  };
  (renderers[mdCurrentTab] || mdRenderPatches)(panel);
}

// ---------- 通用行编辑器 ----------
// fields: [{ key, label, type: 'text'|'number'|'date'|'select', options?, placeholder, required, default }]
let mdEditorCtx = null;
function mdOpenEditor(title, fields, row, onSave) {
  mdEditorCtx = { fields, row: row || {}, onSave };
  document.getElementById('mdEditorTitle').textContent = title;
  // 复位保存按钮（批量录入模式会改写 onclick/文案）。
  // BUG-047 根因：此前用 saveBtn.onclick = null 复位——IDL 赋值会连带移除
  // 内容属性 onclick="mdEditorSave()" 编译出的处理器，按钮从此点击无效（静默无反应）。
  // 正确做法：直接赋函数引用（覆盖批量模式的属性赋值；属性处理器优先于内容属性）。
  const saveBtn = document.getElementById('mdEditorSaveBtn');
  saveBtn.onclick = mdEditorSave;
  saveBtn.disabled = false;
  saveBtn.textContent = '保存';
  document.getElementById('mdEditorBody').innerHTML = fields.map(f => {
    const val = (row && row[f.key] !== undefined && row[f.key] !== null) ? row[f.key] : (f.default !== undefined ? f.default : '');
    let control = '';
    if (f.type === 'select') {
      // 任务书 #40（REQ-114）原值兜底：存量行原值不在选项表时作为额外选项插入并选中
      // （显示原值、不强制改写、不报错）；选项对象/原始值两形态兼容
      const baseOpts = f.options || [];
      const hasVal = baseOpts.some(o => String(typeof o === 'object' ? o.value : o) === String(val));
      const effOpts = (val !== '' && val !== null && val !== undefined && !hasVal) ? [...baseOpts, val] : baseOpts;
      const opts = effOpts.map(o => {
        const v = typeof o === 'object' ? o.value : o;
        const l = typeof o === 'object' ? o.label : o;
        return `<option value="${v}" ${String(v) === String(val) ? 'selected' : ''}>${l}</option>`;
      }).join('');
      control = `<select class="form-select" id="mdField_${f.key}"${f.onchange ? ` onchange="${f.onchange}"` : ''}>${opts}</select>`;
    } else if (f.type === 'textarea') {
      control = `<textarea class="form-textarea" id="mdField_${f.key}" style="height:80px" placeholder="${f.placeholder || ''}">${String(val).replace(/</g, '&lt;')}</textarea>`;
    } else if (f.type === 'tags') {
      // REQ-054：标签多选（点击选中/再点取消），选中集以 JSON 存隐藏 input
      const selected = Array.isArray(val) ? val : (val ? [val] : []);
      control = `<div class="md-tags" id="mdFieldTags_${f.key}">${(f.options || []).map(o =>
        `<span class="tag tag-grey md-tag${selected.includes(o) ? ' md-tag-on' : ''}" onclick="mdTagToggle(this,'${f.key}','${o}')">${o}</span>`).join('')}</div>
        <input type="hidden" id="mdField_${f.key}" value='${JSON.stringify(selected)}'>`;
    } else if (f.type === 'selectCustom') {
      // REQ-054：下拉 + 手动录入兜底（选"其他（手动输入）"时出现文本框）
      const inList = (f.options || []).includes(val);
      const selVal = inList || !val ? val : '__custom__';
      const opts = (f.options || []).map(o => `<option value="${o}" ${String(o) === String(selVal) ? 'selected' : ''}>${o}</option>`).join('') +
        `<option value="__custom__" ${selVal === '__custom__' ? 'selected' : ''}>其他（手动输入）</option>`;
      control = `<select class="form-select" id="mdField_${f.key}" onchange="mdSelectCustomToggle('${f.key}');${f.onchange || ''}">${opts}</select>
        <input type="text" class="form-input" id="mdField_${f.key}_custom" style="margin-top:6px;${selVal === '__custom__' ? '' : 'display:none'}" value="${selVal === '__custom__' ? String(val).replace(/"/g, '&quot;') : ''}" placeholder="手动输入${f.label}">`;
    } else {
      control = `<input type="${f.type || 'text'}" class="form-input" id="mdField_${f.key}" value="${String(val).replace(/"/g, '&quot;')}" placeholder="${f.placeholder || ''}">`;
    }
    return `<div class="form-group"><label class="form-label">${f.label}${f.required ? ' *' : ''}</label>${control}</div>`;
  }).join('');
  // REQ-052：动态渲染的日期字段同样包裹中文遮罩
  mdEditorCtx.fields.filter(f => f.type === 'date').forEach(f => zhWrapDateInput(document.getElementById(`mdField_${f.key}`)));
  openModal('mdEditorModal');
}

// REQ-054：标签多选切换 / 下拉手输兜底切换
function mdTagToggle(el, key, opt) {
  const hidden = document.getElementById(`mdField_${key}`);
  let arr;
  try { arr = JSON.parse(hidden.value); } catch { arr = []; }
  if (arr.includes(opt)) {
    arr = arr.filter(x => x !== opt);
    el.classList.remove('md-tag-on');
  } else {
    arr.push(opt);
    el.classList.add('md-tag-on');
  }
  hidden.value = JSON.stringify(arr);
}
function mdSelectCustomToggle(key) {
  const sel = document.getElementById(`mdField_${key}`);
  const custom = document.getElementById(`mdField_${key}_custom`);
  if (custom) custom.style.display = sel.value === '__custom__' ? '' : 'none';
}

async function mdEditorSave() {
  const ctx = mdEditorCtx;
  if (!ctx) return;
  const out = { ...ctx.row };
  for (const f of ctx.fields) {
    const el = document.getElementById(`mdField_${f.key}`);
    if (!el) continue;
    let v = el.value;
    if (f.type === 'number') v = v === '' ? null : parseInt(v, 10);
    if (f.type === 'tags') { try { v = JSON.parse(v); } catch { v = []; } }
    if (f.type === 'selectCustom' && v === '__custom__') {
      v = (document.getElementById(`mdField_${f.key}_custom`) || { value: '' }).value.trim();
    }
    if (f.required && (v === '' || v === null)) { showToast(`请填写${f.label}`, 'error'); return; }
    out[f.key] = v === '' ? null : v;
  }
  const btn = document.getElementById('mdEditorSaveBtn');
  btn.disabled = true; btn.dataset.originalText = btn.textContent; btn.textContent = '保存中...';
  try {
    await ctx.onSave(out);
    mdEditorCtx = null;
    closeModal('mdEditorModal');
  } catch (e) {
    console.error('数据中心保存失败:', e);
    showToast('保存失败：' + (e.message || '未知错误'), 'error');
  } finally {
    btn.disabled = false; btn.textContent = btn.dataset.originalText || '保存';
  }
}

// 通用删除（二次确认 + 级联提示文本）
async function mdDeleteRow(table, id, label, cascadeNote) {
  const msg = `确定删除「${label}」吗？${cascadeNote ? '\n' + cascadeNote : ''}`;
  if (!confirm(msg)) return;
  try {
    await MasterData.mdDelete(table, `id=eq.${id}`);
    await MasterData.refresh(table);
    renderDatacenter();
    showToast('已删除', 'success');
  } catch (e) {
    showToast('删除失败：' + (e.message || '未知错误'), 'error');
  }
}

// 表格骨架（遵循 REQ-026/030 组件规范）；tableClass 用于需要固定列宽的区块（如专精表）
function mdTable(headers, rowsHtml, tableClass) {
  return `<div class="table-container"><table class="data-table${tableClass ? ' ' + tableClass : ''}"><thead><tr>${headers}</tr></thead><tbody>${rowsHtml || `<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:20px">暂无数据</td></tr>`}</tbody></table></div>`;
}
const mdActionBtns = (editFn, delFn) => `<td class="center"><div class="action-btns"><button class="icon-btn" onclick="${editFn}" title="编辑">✏️</button><button class="icon-btn danger" onclick="${delFn}" title="删除">🗑</button></div></td>`;

// ---------- 1. 版本 ----------
function mdRenderPatches(panel) {
  const rows = MasterData.getPatches();
  panel.innerHTML = `
    <div style="margin-bottom:12px"><button class="btn btn-primary btn-sm" onclick="mdEditPatch()">+ 新增版本</button></div>
    ${mdTable('<th>版本号</th><th>版本名</th><th>上线日</th><th class="center">操作</th>',
      rows.map(p => `<tr>
        <td style="font-weight:600">${p.version}</td>
        <td>${p.name || '-'}</td>
        <td>${p.release_date || '-'}</td>
        ${mdActionBtns(`mdEditPatch('${p.id}')`, `mdDeleteRow('game_patches','${p.id}','${p.version}','赛季将保留但失去版本关联')`)}
      </tr>`).join(''))}`;
}
function mdEditPatch(id) {
  const row = id ? MasterData.getPatches().find(p => p.id === id) : null;
  mdOpenEditor(id ? '编辑版本' : '新增版本', [
    { key: 'version', label: '版本号', required: true, placeholder: '如 12.1' },
    { key: 'name', label: '版本名', placeholder: '可空' },
    { key: 'release_date', label: '上线日', type: 'date' }
  ], row, async (out) => {
    if (id) await MasterData.mdUpdate('game_patches', { version: out.version, name: out.name, release_date: out.release_date }, `id=eq.${id}`);
    else await MasterData.mdInsert('game_patches', { version: out.version, name: out.name, release_date: out.release_date });
    await MasterData.refresh('game_patches');
    renderDatacenter();
    showToast('已保存', 'success');
  });
}

// ---------- 2. 赛季 ----------
function mdRenderSeasons(panel) {
  const rows = MasterData.getSeasons();
  const patches = MasterData.getPatches();
  const patchName = (pid) => (patches.find(p => p.id === pid) || {}).version || '-';
  panel.innerHTML = `
    <div style="margin-bottom:12px"><button class="btn btn-primary btn-sm" onclick="mdEditSeason()">+ 新增赛季</button></div>
    ${mdTable('<th>赛季</th><th>归属版本</th><th>开始</th><th>结束</th><th class="center">当前赛季</th><th class="center">操作</th>',
      rows.map(s => `<tr>
        <td style="font-weight:600">${s.name}</td>
        <td>${patchName(s.patch_id)}</td>
        <td>${s.start_date || '-'}</td>
        <td>${s.end_date || '进行中'}</td>
        <td class="center">${s.is_current ? '<span class="tag tag-green">当前</span>' : `<button class="btn btn-ghost btn-sm" onclick="mdSetCurrentSeason('${s.id}','${s.name}')">设为当前</button>`}</td>
        ${mdActionBtns(`mdEditSeason('${s.id}')`, `mdDeleteRow('game_seasons','${s.id}','${s.name}','其下团本/大米/套装将失去赛季关联')`)}
      </tr>`).join(''))}`;
}
function mdEditSeason(id) {
  const row = id ? MasterData.getSeasons().find(s => s.id === id) : null;
  const patchOpts = [{ value: '', label: '（无）' }, ...MasterData.getPatches().map(p => ({ value: p.id, label: p.version }))];
  mdOpenEditor(id ? '编辑赛季' : '新增赛季', [
    { key: 'name', label: '赛季名', required: true, placeholder: '如 S2' },
    { key: 'patch_id', label: '归属版本', type: 'select', options: patchOpts },
    { key: 'start_date', label: '开始日期', type: 'date', required: true },
    { key: 'end_date', label: '结束日期', type: 'date' }
  ], row, async (out) => {
    if (id) await MasterData.mdUpdate('game_seasons', { name: out.name, patch_id: out.patch_id, start_date: out.start_date, end_date: out.end_date }, `id=eq.${id}`);
    else await MasterData.mdInsert('game_seasons', { name: out.name, patch_id: out.patch_id, start_date: out.start_date, end_date: out.end_date });
    await MasterData.refresh('game_seasons');
    renderDatacenter();
    showToast('已保存', 'success');
  });
}
// 设为当前赛季：二次确认 → 旧 false → 新 true（DB 部分唯一索引兜底）
async function mdSetCurrentSeason(id, name) {
  const cur = MasterData.getCurrentSeason();
  if (!confirm(`确定把「${name}」设为当前赛季吗？${cur ? `\n将把「${cur.name}」设为非当前。` : ''}\n全站赛季口径（统计/掉落池/大米/套装）刷新后切换。`)) return;
  try {
    if (cur) await MasterData.mdUpdate('game_seasons', { is_current: false }, `id=eq.${cur.id}`);
    await MasterData.mdUpdate('game_seasons', { is_current: true }, `id=eq.${id}`);
    await MasterData.refresh('game_seasons');
    renderDatacenter();
    showToast(`「${name}」已设为当前赛季`, 'success');
  } catch (e) {
    showToast('设置失败：' + (e.message || '未知错误'), 'error');
  }
}

// ---------- 3. 团本 ----------
function mdRenderRaids(panel) {
  const rows = MasterData.getRaids();
  const seasons = MasterData.getSeasons();
  const seasonName = (sid) => (seasons.find(s => s.id === sid) || {}).name || '-';
  const typeLabel = { raid: '固定团本', lair: '巢穴弹性', world: '世界BOSS' };
  panel.innerHTML = `
    <div style="margin-bottom:12px"><button class="btn btn-primary btn-sm" onclick="mdEditRaid()">+ 新增团本</button></div>
    ${mdTable('<th>名称</th><th>赛季</th><th>类型</th><th class="num">人数</th><th>最高难度</th><th>开放日</th><th class="num">排序</th><th class="center">操作</th>',
      rows.map(r => `<tr>
        <td style="font-weight:600">${r.name}</td>
        <td>${seasonName(r.season_id)}</td>
        <td><span class="tag ${r.type === 'lair' ? 'tag-blue' : 'tag-gold'}">${typeLabel[r.type] || r.type}</span></td>
        <td class="num">${r.min_players === r.max_players ? r.max_players : `${r.min_players}-${r.max_players}`}</td>
        <td>${r.max_difficulty || '-'}</td>
        <td>${r.open_date || '-'}</td>
        <td class="num">${r.sort_order ?? 0}</td>
        ${mdActionBtns(`mdEditRaid('${r.id}')`, `mdDeleteRaid('${r.id}','${r.name}')`)}
      </tr>`).join(''))}`;
}
function mdEditRaid(id) {
  const row = id ? MasterData.getRaids().find(r => r.id === id) : null;
  const seasonOpts = [{ value: '', label: '（无）' }, ...MasterData.getSeasons().map(s => ({ value: s.id, label: s.name }))];
  mdOpenEditor(id ? '编辑团本' : '新增团本', [
    { key: 'name', label: '名称', required: true, placeholder: '如 烈毒之渊' },
    { key: 'season_id', label: '归属赛季', type: 'select', options: seasonOpts },
    { key: 'type', label: '类型', type: 'select', options: [{ value: 'raid', label: '固定团本（20 人）' }, { value: 'lair', label: '巢穴弹性（15-25 人）' }, { value: 'world', label: '世界BOSS（非副本，公示页剔除）' }], default: row ? row.type : 'raid' },
    { key: 'min_players', label: '人数下限', type: 'number', default: row ? row.min_players : 20, required: true },
    { key: 'max_players', label: '人数上限', type: 'number', default: row ? row.max_players : 20, required: true },
    { key: 'max_difficulty', label: '最高难度', placeholder: '如 史诗' },
    { key: 'open_date', label: '开放日期', type: 'date' },
    { key: 'sort_order', label: '排序', type: 'number', default: row ? row.sort_order : 0 }
  ], row, async (out) => {
    // 巢穴规则：lair 必须 15-25；任何类型 min <= max。
    // 校验失败必须 throw（mdEditorSave 只 catch 不关弹窗）——BUG-047 实测抓获：
    // 仅 toast+return 会被当作保存成功，弹窗照关、数据未入库（"假失败"）。
    if (out.type === 'lair' && (out.min_players !== 15 || out.max_players !== 25)) {
      throw new Error('巢穴弹性类型人数必须为 15-25');
    }
    if (out.min_players === null || out.max_players === null || out.min_players > out.max_players) {
      throw new Error('人数下限必须小于等于上限');
    }
    const payload = { name: out.name, season_id: out.season_id, type: out.type, min_players: out.min_players, max_players: out.max_players, max_difficulty: out.max_difficulty, open_date: out.open_date, sort_order: out.sort_order };
    if (id) await MasterData.mdUpdate('game_raids', payload, `id=eq.${id}`);
    else await MasterData.mdInsert('game_raids', payload);
    await MasterData.refresh('game_raids');
    renderDatacenter();
    showToast('已保存', 'success');
  });
}
// 团本删除前级联提示（任务书 5.4）
async function mdDeleteRaid(id, name) {
  const bosses = MasterData.getBosses(id);
  const lootCount = bosses.reduce((sum, b) => sum + MasterData.getLoot(b.id).length, 0);
  await mdDeleteRow('game_raids', id, name, (bosses.length || lootCount) ? `将同时删除 ${bosses.length} 个 BOSS、${lootCount} 条掉落记录。` : '');
}

// ---------- 4. BOSS ----------
function mdFindBoss(id) {
  for (const r of MasterData.getRaids()) {
    const f = MasterData.getBosses(r.id).find(b => b.id === id);
    if (f) return f;
  }
  // 任务书 #23 WP1：副本归属 BOSS 同表，查找时一并覆盖
  for (const d of MasterData.getDungeons()) {
    const f = MasterData.getDungeonBosses(d.id).find(b => b.id === id);
    if (f) return f;
  }
  return null;
}
function mdRenderBosses(panel) {
  const raids = MasterData.getRaids();
  const raidSections = raids.map(raid => {
    const bosses = MasterData.getBosses(raid.id);
    return `<div style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-weight:600;color:var(--gold)">${raid.name}</span>
        <button class="btn btn-ghost btn-sm" onclick="mdEditBoss(null,'${raid.id}')">+ 新增 BOSS</button>
      </div>
      ${mdTable('<th class="num" style="width:60px">序号</th><th>BOSS 名</th><th class="center" style="width:100px">操作</th>',
        bosses.map(b => `<tr>
          <td class="num">${b.boss_order}</td>
          <td style="font-weight:500">${b.name}</td>
          ${mdActionBtns(`mdEditBoss('${b.id}')`, `mdDeleteRow('game_bosses','${b.id}','${b.name}','将同时删除其 ${MasterData.getLoot(b.id).length} 条掉落记录')`)}
        </tr>`).join(''))}
    </div>`;
  }).join('') || '<div style="color:var(--text-muted)">请先在「团本」区新增团本</div>';
  // 任务书 #23 WP1：BOSS 区块支持挂副本（dungeon_id，与 raid_id 二选一，DB CHECK 约束）
  const dungeons = MasterData.getDungeons();
  const dungeonSections = dungeons.length ? `
    <div style="margin:20px 0 10px;padding-top:12px;border-top:1px solid var(--border-color);font-weight:600;color:var(--text-secondary)">大秘境副本 BOSS（用于大秘境掉落按 BOSS 归属）</div>
    ${dungeons.map(d => {
      const bosses = MasterData.getDungeonBosses(d.id);
      return `<div style="margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="font-weight:600;color:var(--info)">${d.name}</span>
          <button class="btn btn-ghost btn-sm" onclick="mdEditDungeonBoss(null,'${d.id}')">+ 新增 BOSS</button>
        </div>
        ${mdTable('<th class="num" style="width:60px">序号</th><th>BOSS 名</th><th class="center" style="width:100px">操作</th>',
          bosses.map(b => `<tr>
            <td class="num">${b.boss_order}</td>
            <td style="font-weight:500">${b.name}</td>
            ${mdActionBtns(`mdEditDungeonBoss('${b.id}')`, `mdDeleteRow('game_bosses','${b.id}','${b.name}','将同时删除其大秘境掉落归属（掉落行本身保留并落回整体池）')`)}
          </tr>`).join(''))}
      </div>`;
    }).join('')}` : '';
  panel.innerHTML = raidSections + dungeonSections;
}
// 任务书 #23 WP1：副本 BOSS 编辑（dungeon_id 归属；boss_order 按副本内递增）
function mdEditDungeonBoss(id, dungeonId) {
  const boss = id ? mdFindBoss(id) : null;
  const did = boss ? boss.dungeon_id : dungeonId;
  if (!did) { showToast('缺少目标副本', 'error'); return; }
  const nextOrder = boss ? boss.boss_order : (MasterData.getDungeonBosses(did).reduce((m, b) => Math.max(m, b.boss_order || 0), 0) + 1);
  mdOpenEditor(boss ? '编辑副本 BOSS' : '新增副本 BOSS', [
    { key: 'name', label: 'BOSS 名', required: true },
    { key: 'boss_order', label: '序号（第几号）', type: 'number', default: nextOrder, required: true }
  ], boss, async (out) => {
    if (boss) await MasterData.mdUpdate('game_bosses', { name: out.name, boss_order: out.boss_order }, `id=eq.${boss.id}`);
    else await MasterData.mdInsert('game_bosses', { dungeon_id: did, name: out.name, boss_order: out.boss_order });
    await MasterData.refresh('game_bosses');
    renderDatacenter();
    showToast('已保存', 'success');
  });
}
function mdEditBoss(id, raidId) {
  const boss = id ? mdFindBoss(id) : null;
  const rid = boss ? boss.raid_id : raidId;
  if (!rid) { showToast('缺少目标团本', 'error'); return; }
  const nextOrder = boss ? boss.boss_order : (MasterData.getBosses(rid).reduce((m, b) => Math.max(m, b.boss_order || 0), 0) + 1);
  mdOpenEditor(boss ? '编辑 BOSS' : '新增 BOSS', [
    { key: 'name', label: 'BOSS 名', required: true },
    { key: 'boss_order', label: '序号（第几号）', type: 'number', default: nextOrder, required: true }
  ], boss, async (out) => {
    if (boss) await MasterData.mdUpdate('game_bosses', { name: out.name, boss_order: out.boss_order }, `id=eq.${boss.id}`);
    else await MasterData.mdInsert('game_bosses', { raid_id: rid, name: out.name, boss_order: out.boss_order });
    await MasterData.refresh('game_bosses');
    renderDatacenter();
    showToast('已保存', 'success');
  });
}

// ---------- 5. 掉落池（两级导航 + 批量录入） ----------
// REQ-054：部位/类型下拉+手输兜底，特效多行文本，主/副属性标签多选
// REQ-060：部位↔类型联动（映射表任务书给定，照此实现）；类型按上表细分单手/双手
// 任务书 #40（REQ-114，2026-08-12）：slot/item_type 改纯 select 词表下拉——选项唯一真源 =
// js/lootTaxonomy.js（DC_SLOT_OPTIONS 19 项 / DC_ITEM_TYPE_OPTIONS 33 项，库内全量现存值覆盖），
// selectCustom 手输兜底退役（MD_LOOT_SLOTS/MD_LOOT_TYPES 旧内联词表删除，禁第三份词表）；
// 原值兜底由 mdOpenEditor select 分支通用承担（词表外旧值作额外选项插入并选中，不强制改写）。
const MD_ARMOR_TYPES = ['板甲', '锁甲', '皮甲', '布甲'];
const MD_SLOT_TYPE_MAP = {
  '头部': MD_ARMOR_TYPES, '肩部': MD_ARMOR_TYPES, '胸部': MD_ARMOR_TYPES, '手腕': MD_ARMOR_TYPES,
  '腕部': MD_ARMOR_TYPES, // 任务书 #40：词表新词（REQ-097「腕部」）同映射；旧词「手腕」保留兼容批量录入旧数据
  '手部': MD_ARMOR_TYPES, '腰部': MD_ARMOR_TYPES, '腿部': MD_ARMOR_TYPES, '脚部': MD_ARMOR_TYPES,
  '背部': ['披风'],
  '颈部': ['项链'],
  '手指': ['戒指'],
  '饰品': ['饰品'],
  '武器': ['单手剑', '双手剑', '单手斧', '双手斧', '单手锤', '双手锤', '匕首', '拳套', '长柄武器', '法杖', '弓', '枪', '弩', '魔杖', '战刃'],
  '副手': ['盾牌', '副手物品']
};
// 部位变化 → 类型下拉只保留合法项（映射表外部位给词表全量）
// 任务书 #40：纯 select 化。init=true（打开表单初始化）原值兜底——当前值不在候选清单时保留为额外选项
// 并选中（编辑存量行旧值不强制改写）；用户主动改部位（init 缺省）不合法已选清空回落首项（REQ-060 语义不变）
function mdLootSlotChanged(init) {
  const slotEl = document.getElementById('mdField_slot');
  const typeEl = document.getElementById('mdField_item_type');
  if (!slotEl || !typeEl) return;
  const legal = MD_SLOT_TYPE_MAP[slotEl.value];
  const base = legal ? [...legal] : [...window.LootTaxonomy.DC_ITEM_TYPE_OPTIONS];
  const current = typeEl.value;
  const options = (init && current && !base.includes(current)) ? [...base, current] : base;
  typeEl.innerHTML = options.map(o => `<option value="${o}">${o}</option>`).join('');
  typeEl.value = (current && options.includes(current)) ? current : options[0];
}
const MD_PRIMARY_STATS = ['力量', '敏捷', '智力'];
const MD_SECONDARY_STATS = ['爆击', '急速', '精通', '全能']; // 官方用字（任务书 #23-补丁3-附），写库枚举与游戏口径一致
function mdRenderLoot(panel) {
  const raids = MasterData.getRaids();
  if (!mdLootNav.raidId && raids.length) mdLootNav.raidId = raids[0].id;
  const raid = raids.find(r => r.id === mdLootNav.raidId);
  const bosses = raid ? MasterData.getBosses(raid.id) : [];
  if (raid && !bosses.find(b => b.id === mdLootNav.bossId)) mdLootNav.bossId = bosses.length ? bosses[0].id : '';
  const boss = bosses.find(b => b.id === mdLootNav.bossId);
  const loot = boss ? MasterData.getLoot(boss.id) : [];
  panel.innerHTML = `
    <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
      <select class="form-select" style="width:200px" onchange="mdLootNav.raidId=this.value;mdLootNav.bossId='';renderDatacenter()">
        ${raids.map(r => `<option value="${r.id}" ${r.id === mdLootNav.raidId ? 'selected' : ''}>${r.name}</option>`).join('')}
      </select>
      <select class="form-select" style="width:200px" onchange="mdLootNav.bossId=this.value;renderDatacenter()">
        ${bosses.map(b => `<option value="${b.id}" ${b.id === mdLootNav.bossId ? 'selected' : ''}>${b.boss_order}号 ${b.name}</option>`).join('')}
      </select>
      ${boss ? `<button class="btn btn-primary btn-sm" onclick="mdEditLootItem(null)">+ 新增掉落</button>
      <button class="btn btn-sm" onclick="mdOpenLootBatch()">📋 批量录入</button>` : ''}
    </div>
    ${boss ? mdTable('<th>装备名</th><th>部位</th><th>类型</th><th>主属性</th><th>副属性</th><th>特效</th><th>毒咒</th><th>图标ID</th><th class="center">操作</th>',
      loot.map(l => `<tr>
        <td style="font-weight:500">${l.item_name}</td>
        <td>${l.slot || '-'}</td>
        <td>${l.item_type || '-'}</td>
        <td>${(l.primary_stats || []).join('、') || '-'}</td>
        <td>${(l.secondary_stats || []).join('、') || '-'}</td>
        <td style="font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(l.effect || '').replace(/"/g, '&quot;')}">${l.effect ? `<span class="loot-effect-green">${l.effect}</span>` : '-'}</td>
        <td>${l.venomcurse || '-'}</td>
        <td>${l.icon_id != null ? l.icon_id : '-'}</td>
        ${mdActionBtns(`mdEditLootItem('${l.id}')`, `mdDeleteRow('boss_loot','${l.id}','${l.item_name}','')`)}
      </tr>`).join('')) : '<div style="color:var(--text-muted)">该团本暂无 BOSS，请先到「BOSS」区新增</div>'}`;
}
function mdEditLootItem(id) {
  const row = id ? MasterData.getLoot(mdLootNav.bossId).find(l => l.id === id) : null;
  mdOpenEditor(id ? '编辑掉落' : '新增掉落', [
    { key: 'item_name', label: '装备名', required: true },
    // 任务书 #40（REQ-114）：纯 select 词表下拉，选项唯一真源 = LootTaxonomy（禁内联第三份词表）
    { key: 'slot', label: '部位', type: 'select', options: window.LootTaxonomy.DC_SLOT_OPTIONS, onchange: 'mdLootSlotChanged()' },
    { key: 'item_type', label: '类型', type: 'select', options: window.LootTaxonomy.DC_ITEM_TYPE_OPTIONS },
    { key: 'primary_stats', label: '主属性（可多选）', type: 'tags', options: MD_PRIMARY_STATS },
    { key: 'secondary_stats', label: '副属性（可多选）', type: 'tags', options: MD_SECONDARY_STATS },
    { key: 'effect', label: '特效', type: 'textarea', placeholder: '装备：……（可空，多行）' },
    { key: 'venomcurse', label: '毒咒', type: 'select', options: [{ value: '', label: '无' }, { value: window.LootTaxonomy.VENOMCURSE_LABEL, label: window.LootTaxonomy.VENOMCURSE_LABEL }] },
    // REQ-092（任务书 #46 WP3）：图标ID（可空，空串由 mdEditorSave 统一转 NULL）；素材入库走 scripts/import-item-icons.js
    { key: 'icon_id', label: '图标ID', type: 'number' }
  ], row, async (out) => {
    // REQ-060：非法组合保存前弹提示确认（兜底优先，不硬拦；取消则中止保持弹窗）
    if (out.slot && out.item_type && MD_SLOT_TYPE_MAP[out.slot] && !MD_SLOT_TYPE_MAP[out.slot].includes(out.item_type)) {
      if (!confirm(`部位「${out.slot}」与类型「${out.item_type}」不是常见组合，仍要保存吗？`)) {
        throw new Error('已取消保存');
      }
    }
    // REQ-110：venomcurse 预设下拉（无/毒咒，禁自由输入），空串由 mdEditorSave 统一转 NULL
    const payload = { item_name: out.item_name, slot: out.slot, item_type: out.item_type, effect: out.effect, primary_stats: out.primary_stats, secondary_stats: out.secondary_stats, venomcurse: out.venomcurse };
    // REQ-092（任务书 #46）：icon_id 仅非空时携带——sql/29 迁移执行前（列不存在）保存链路保持可用（PGRST204 防护）；
    // 迁移后正常写入；「清空既有图标ID」需迁移执行后处理（登记遗留）
    if (out.icon_id !== null && out.icon_id !== undefined && out.icon_id !== '') payload.icon_id = out.icon_id;
    if (id) await MasterData.mdUpdate('boss_loot', payload, `id=eq.${id}`);
    else await MasterData.mdInsert('boss_loot', { boss_id: mdLootNav.bossId, ...payload });
    await MasterData.refresh('boss_loot');
    renderDatacenter();
    showToast('已保存', 'success');
  });
  mdLootSlotChanged(!!(row && row.item_type)); // 初始化：编辑行原值兜底（旧值保留为额外选项并选中）；新增行不保留浏览器默认选中，按部位收拢
}
// 批量录入模式：多行文本「装备名,部位,类型」→ 解析预览 → 确认入库
let mdLootBatchRows = null;
function mdOpenLootBatch() {
  mdEditorCtx = { fields: [], row: {}, onSave: async () => {} };
  document.getElementById('mdEditorTitle').textContent = '批量录入掉落（每行：装备名,部位,类型,主属性,副属性,特效,图标ID）';
  document.getElementById('mdEditorBody').innerHTML = `
    <div class="form-group">
      <label class="form-label">掉落清单（REQ-054 扩展格式：后四列可空，主/副属性多值用「、」分隔；REQ-092 第 7 列图标ID 纯数字可空）</label>
      <textarea class="form-textarea" id="mdField__batch" style="height:160px" placeholder="烈毒巨剑,武器,剑,力量,爆击、急速,装备：攻击附带剧毒,20451&#10;毒牙项坠,颈部,饰品,智力,,"></textarea>
    </div>
    <div id="mdLootBatchPreview"></div>`;
  const btn = document.getElementById('mdEditorSaveBtn');
  btn.textContent = '解析预览';
  btn.onclick = mdLootBatchParse;
  openModal('mdEditorModal');
}
function mdLootBatchParse() {
  const text = document.getElementById('mdField__batch').value;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const rows = [];
  const bad = [];
  lines.forEach((l, i) => {
    const parts = l.split(/[,，]/).map(s => s.trim());
    if (!parts[0]) { bad.push(`${i + 1}（无装备名）`); return; }
    // REQ-054 扩展行格式：装备名,部位,类型,主属性,副属性,特效（后三列可空，属性多值「、」分隔）
    // REQ-060：部位↔类型合法性按行校验，坏行报行号+原因
    if (parts[1] && parts[2] && MD_SLOT_TYPE_MAP[parts[1]] && !MD_SLOT_TYPE_MAP[parts[1]].includes(parts[2])) {
      bad.push(`${i + 1}（部位「${parts[1]}」与类型「${parts[2]}」不匹配）`);
      return;
    }
    // REQ-092（任务书 #46 WP3）：第 7 列图标ID（可空；非空必须纯数字，否则报行号跳过）
    if (parts[6] && !/^\d+$/.test(parts[6])) {
      bad.push(`${i + 1}（图标ID「${parts[6]}」非纯数字）`);
      return;
    }
    const row = {
      item_name: parts[0],
      slot: parts[1] || '',
      item_type: parts[2] || '',
      primary_stats: (parts[3] || '').split('、').map(s => s.trim()).filter(Boolean),
      secondary_stats: (parts[4] || '').split('、').map(s => s.trim()).filter(Boolean),
      effect: parts[5] || ''
    };
    if (parts[6]) row.icon_id = Number(parts[6]); // REQ-092：仅提供时携带（sql/29 迁移窗口 PGRST204 防护）
    rows.push(row);
  });
  if (!rows.length) { showToast('没有可解析的有效行', 'error'); return; }
  mdLootBatchRows = rows;
  document.getElementById('mdLootBatchPreview').innerHTML =
    `<div style="margin-top:12px;max-height:200px;overflow-y:auto">${mdTable('<th>装备名</th><th>部位</th><th>类型</th><th>主属性</th><th>副属性</th><th>特效</th><th>图标ID</th>',
      rows.map(r => `<tr><td>${r.item_name}</td><td>${r.slot || '-'}</td><td>${r.item_type || '-'}</td><td>${r.primary_stats.join('、') || '-'}</td><td>${r.secondary_stats.join('、') || '-'}</td><td style="font-size:12px;color:var(--text-muted)">${r.effect || '-'}</td><td>${r.icon_id != null ? r.icon_id : '-'}</td></tr>`).join(''))}</div>
    ${bad.length ? `<div style="color:var(--warning);font-size:12px;margin-top:6px">第 ${bad.join('、')} 行无法识别，已跳过</div>` : ''}`;
  const btn = document.getElementById('mdEditorSaveBtn');
  btn.textContent = `确认入库（${rows.length} 条）`;
  btn.onclick = mdLootBatchConfirm;
}
async function mdLootBatchConfirm() {
  if (!mdLootBatchRows || !mdLootBatchRows.length) return;
  const count = mdLootBatchRows.length;
  const btn = document.getElementById('mdEditorSaveBtn');
  btn.disabled = true; btn.textContent = '入库中...';
  try {
    // 规范 1.2.2 批处理例外：一次数组 POST 批量插入，完成后统一 refresh 一次
    await MasterData.mdInsert('boss_loot', mdLootBatchRows.map(r => ({ ...r, boss_id: mdLootNav.bossId })));
    await MasterData.refresh('boss_loot');
    mdLootBatchRows = null;
    closeModal('mdEditorModal');
    renderDatacenter();
    showToast(`已批量入库 ${count} 条掉落`, 'success');
  } catch (e) {
    showToast('批量入库失败：' + (e.message || '未知错误'), 'error');
  } finally {
    btn.disabled = false;
  }
}

// ---------- 5b. 大秘境掉落（任务书 #23 WP1：副本 → BOSS 分组 CRUD，BOSS 可空 = 整体池） ----------
let mdDungeonLootNav = { dungeonId: '', bossId: '' }; // bossId='' 整体池，'__all__' 全部
function mdRenderDungeonLoot(panel) {
  const dungeons = MasterData.getDungeons();
  if (!dungeons.length) { panel.innerHTML = '<div style="color:var(--text-muted)">请先在「大秘境」区新增副本</div>'; return; }
  if (!mdDungeonLootNav.dungeonId || !dungeons.find(d => d.id === mdDungeonLootNav.dungeonId)) mdDungeonLootNav.dungeonId = dungeons[0].id;
  const dungeon = dungeons.find(d => d.id === mdDungeonLootNav.dungeonId);
  const bosses = MasterData.getDungeonBosses(dungeon.id);
  const navBoss = mdDungeonLootNav.bossId;
  const loot = navBoss === '__all__'
    ? MasterData.getDungeonLoot(dungeon.id)
    : MasterData.getDungeonLoot(dungeon.id, navBoss === '' ? null : navBoss);
  const bossName = id => id ? ((bosses.find(b => b.id === id) || {}).name || '（BOSS 已删除）') : '整体池';
  panel.innerHTML = `
    <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
      <select class="form-select" style="width:200px" onchange="mdDungeonLootNav.dungeonId=this.value;mdDungeonLootNav.bossId='';renderDatacenter()">
        ${dungeons.map(d => `<option value="${d.id}" ${d.id === dungeon.id ? 'selected' : ''}>${d.name}</option>`).join('')}
      </select>
      <select class="form-select" style="width:200px" onchange="mdDungeonLootNav.bossId=this.value;renderDatacenter()">
        <option value="" ${navBoss === '' ? 'selected' : ''}>整体池（无 BOSS 归属）</option>
        ${bosses.map(b => `<option value="${b.id}" ${b.id === navBoss ? 'selected' : ''}>${b.boss_order}号 ${b.name}</option>`).join('')}
        <option value="__all__" ${navBoss === '__all__' ? 'selected' : ''}>全部（含整体池）</option>
      </select>
      ${navBoss !== '__all__' ? `<button class="btn btn-primary btn-sm" onclick="mdEditDungeonLootItem(null)">+ 新增掉落</button>` : ''}
      <button class="btn btn-sm" onclick="mdOpenDungeonLootBatch()">📋 批量录入</button>
    </div>
    ${mdTable('<th>装备名</th><th>BOSS 归属</th><th>部位</th><th>类型</th><th>主属性</th><th>副属性</th><th>特效</th><th>毒咒</th><th>图标ID</th><th class="center">操作</th>',
      loot.map(l => `<tr>
        <td style="font-weight:500">${l.item_name}</td>
        <td>${bossName(l.boss_id)}</td>
        <td>${l.slot || '-'}</td>
        <td>${l.item_type || '-'}</td>
        <td>${(l.primary_stats || []).join('、') || '-'}</td>
        <td>${(l.secondary_stats || []).join('、') || '-'}</td>
        <td style="font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(l.effect || '').replace(/"/g, '&quot;')}">${l.effect ? `<span class="loot-effect-green">${l.effect}</span>` : '-'}</td>
        <td>${l.venomcurse || '-'}</td>
        <td>${l.icon_id != null ? l.icon_id : '-'}</td>
        ${mdActionBtns(`mdEditDungeonLootItem('${l.id}')`, `mdDeleteRow('dungeon_loot','${l.id}','${l.item_name}','')`)}
      </tr>`).join(''))}`;
}
function mdEditDungeonLootItem(id) {
  const row = id ? MasterData.getDungeonLoot(mdDungeonLootNav.dungeonId).find(l => l.id === id) : null;
  mdOpenEditor(id ? '编辑大秘境掉落' : '新增大秘境掉落', [
    { key: 'item_name', label: '装备名', required: true },
    // 任务书 #40（REQ-114）：纯 select 词表下拉，与团本掉落表单同词表（LootTaxonomy 单一真源）
    { key: 'slot', label: '部位', type: 'select', options: window.LootTaxonomy.DC_SLOT_OPTIONS, onchange: 'mdLootSlotChanged()' },
    { key: 'item_type', label: '类型', type: 'select', options: window.LootTaxonomy.DC_ITEM_TYPE_OPTIONS },
    { key: 'primary_stats', label: '主属性（可多选）', type: 'tags', options: MD_PRIMARY_STATS },
    { key: 'secondary_stats', label: '副属性（可多选）', type: 'tags', options: MD_SECONDARY_STATS },
    { key: 'effect', label: '特效', type: 'textarea', placeholder: '装备：……（可空，多行）' },
    { key: 'venomcurse', label: '毒咒', type: 'select', options: [{ value: '', label: '无' }, { value: window.LootTaxonomy.VENOMCURSE_LABEL, label: window.LootTaxonomy.VENOMCURSE_LABEL }] },
    // REQ-092（任务书 #46 WP3）：图标ID（可空，空串由 mdEditorSave 统一转 NULL）；素材入库走 scripts/import-item-icons.js
    { key: 'icon_id', label: '图标ID', type: 'number' }
  ], row, async (out) => {
    if (out.slot && out.item_type && MD_SLOT_TYPE_MAP[out.slot] && !MD_SLOT_TYPE_MAP[out.slot].includes(out.item_type)) {
      if (!confirm(`部位「${out.slot}」与类型「${out.item_type}」不是常见组合，仍要保存吗？`)) {
        throw new Error('已取消保存');
      }
    }
    // REQ-110：venomcurse 预设下拉（无/毒咒，禁自由输入），空串由 mdEditorSave 统一转 NULL
    const payload = { item_name: out.item_name, slot: out.slot, item_type: out.item_type, effect: out.effect, primary_stats: out.primary_stats, secondary_stats: out.secondary_stats, venomcurse: out.venomcurse };
    // REQ-092（任务书 #46）：icon_id 仅非空时携带（sql/29 迁移窗口 PGRST204 防护，同 boss_loot 口径）
    if (out.icon_id !== null && out.icon_id !== undefined && out.icon_id !== '') payload.icon_id = out.icon_id;
    if (id) await MasterData.mdUpdate('dungeon_loot', payload, `id=eq.${id}`);
    else await MasterData.mdInsert('dungeon_loot', {
      dungeon_id: mdDungeonLootNav.dungeonId,
      boss_id: mdDungeonLootNav.bossId === '' ? null : mdDungeonLootNav.bossId,
      ...payload
    });
    await MasterData.refresh('dungeon_loot');
    renderDatacenter();
    showToast('已保存', 'success');
  });
  mdLootSlotChanged(!!(row && row.item_type)); // 初始化：编辑行原值兜底（旧值保留为额外选项并选中）；新增行不保留浏览器默认选中，按部位收拢
}
// 批量录入（任务书 #23 WP1：首两列副本名/BOSS 名，BOSS 可留空 = 整体池；其余列格式与校验同 boss_loot）
let mdDungeonLootBatchRows = null;
function mdOpenDungeonLootBatch() {
  mdEditorCtx = { fields: [], row: {}, onSave: async () => {} };
  document.getElementById('mdEditorTitle').textContent = '批量录入大秘境掉落（每行：副本名,BOSS名,装备名,部位,类型,主属性,副属性,特效）';
  document.getElementById('mdEditorBody').innerHTML = `
    <div class="form-group">
      <label class="form-label">掉落清单（BOSS 名可留空 = 整体池；后三列可空，主/副属性多值用「、」分隔）</label>
      <textarea class="form-textarea" id="mdField__batch" style="height:160px" placeholder="毒牙祭坛,毒牙之王,烈毒巨剑,武器,单手剑,力量,爆击、急速,装备：攻击附带剧毒&#10;毒牙祭坛,,毒牙项坠,颈部,项链,智力,,"></textarea>
    </div>
    <div id="mdLootBatchPreview"></div>`;
  const btn = document.getElementById('mdEditorSaveBtn');
  btn.textContent = '解析预览';
  btn.onclick = mdDungeonLootBatchParse;
  openModal('mdEditorModal');
}
function mdDungeonLootBatchParse() {
  const text = document.getElementById('mdField__batch').value;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const dungeons = MasterData.getDungeons();
  const rows = [];
  const bad = [];
  lines.forEach((l, i) => {
    const parts = l.split(/[,，]/).map(s => s.trim());
    const dungeon = dungeons.find(d => d.name === parts[0]);
    if (!dungeon) { bad.push(`${i + 1}（副本「${parts[0] || '空'}」不存在）`); return; }
    if (!parts[2]) { bad.push(`${i + 1}（无装备名）`); return; }
    let bossId = null;
    if (parts[1]) {
      const boss = MasterData.getDungeonBosses(dungeon.id).find(b => b.name === parts[1]);
      if (!boss) { bad.push(`${i + 1}（副本「${parts[0]}」下无 BOSS「${parts[1]}」）`); return; }
      bossId = boss.id;
    }
    if (parts[3] && parts[4] && MD_SLOT_TYPE_MAP[parts[3]] && !MD_SLOT_TYPE_MAP[parts[3]].includes(parts[4])) {
      bad.push(`${i + 1}（部位「${parts[3]}」与类型「${parts[4]}」不匹配）`);
      return;
    }
    rows.push({
      dungeon_id: dungeon.id,
      boss_id: bossId,
      item_name: parts[2],
      slot: parts[3] || '',
      item_type: parts[4] || '',
      primary_stats: (parts[5] || '').split('、').map(s => s.trim()).filter(Boolean),
      secondary_stats: (parts[6] || '').split('、').map(s => s.trim()).filter(Boolean),
      effect: parts[7] || ''
    });
  });
  if (!rows.length) { showToast('没有可解析的有效行', 'error'); return; }
  mdDungeonLootBatchRows = rows;
  const dungeonName = id => (dungeons.find(d => d.id === id) || {}).name || id;
  document.getElementById('mdLootBatchPreview').innerHTML =
    `<div style="margin-top:12px;max-height:200px;overflow-y:auto">${mdTable('<th>副本</th><th>BOSS 归属</th><th>装备名</th><th>部位</th><th>类型</th><th>主属性</th><th>副属性</th>',
      rows.map(r => `<tr><td>${dungeonName(r.dungeon_id)}</td><td>${r.boss_id ? 'BOSS' : '整体池'}</td><td>${r.item_name}</td><td>${r.slot || '-'}</td><td>${r.item_type || '-'}</td><td>${r.primary_stats.join('、') || '-'}</td><td>${r.secondary_stats.join('、') || '-'}</td></tr>`).join(''))}</div>
    ${bad.length ? `<div style="color:var(--warning);font-size:12px;margin-top:6px">第 ${bad.join('、')} 行无法识别，已跳过</div>` : ''}`;
  const btn = document.getElementById('mdEditorSaveBtn');
  btn.textContent = `确认入库（${rows.length} 条）`;
  btn.onclick = mdDungeonLootBatchConfirm;
}
async function mdDungeonLootBatchConfirm() {
  if (!mdDungeonLootBatchRows || !mdDungeonLootBatchRows.length) return;
  const count = mdDungeonLootBatchRows.length;
  const btn = document.getElementById('mdEditorSaveBtn');
  btn.disabled = true; btn.textContent = '入库中...';
  try {
    // 规范 1.2.2 批处理例外：一次数组 POST 批量插入，完成后统一 refresh 一次
    await MasterData.mdInsert('dungeon_loot', mdDungeonLootBatchRows);
    await MasterData.refresh('dungeon_loot');
    mdDungeonLootBatchRows = null;
    closeModal('mdEditorModal');
    renderDatacenter();
    showToast(`已批量入库 ${count} 条大秘境掉落`, 'success');
  } catch (e) {
    showToast('批量入库失败：' + (e.message || '未知错误'), 'error');
  } finally {
    btn.disabled = false;
  }
}

// ---------- 6. 套装（REQ-053：赛季 × 职业 × 专精 分行，12.1 套装按专精区分） ----------
function mdRenderTierSets(panel) {
  const seasons = MasterData.getSeasons();
  if (!mdTierSeasonId) {
    const cur = MasterData.getCurrentSeason();
    mdTierSeasonId = cur ? cur.id : (seasons.length ? seasons[seasons.length - 1].id : '');
  }
  const classes = MasterData.getClasses();
  const sets = MasterData.getTierSets(mdTierSeasonId);
  panel.innerHTML = `
    <div style="margin-bottom:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <label style="font-size:13px;color:var(--text-secondary)">赛季</label>
      <select class="form-select" style="width:160px" onchange="mdTierSeasonId=this.value;renderDatacenter()">
        ${seasons.map(s => `<option value="${s.id}" ${s.id === mdTierSeasonId ? 'selected' : ''}>${s.name}${s.is_current ? '（当前）' : ''}</option>`).join('')}
      </select>
      <span style="font-size:12px;color:var(--text-muted)">按 职业 → 专精 分行；套装名为职业级概念，改一行可同步同职业其他专精行</span>
    </div>
    ${mdTierSeasonId ? mdTable('<th>职业 · 专精</th><th>套装名</th><th>2 件效果</th><th>4 件效果</th>',
      classes.map(c => {
        const specs = MasterData.getSpecs(c.id);
        return specs.map(s => {
          const t = sets.find(x => x.class_id === c.id && x.spec_id === s.id);
          // 同职业其他专精行的套装名作为占位提示（联动填充语义）
          const sibling = sets.find(x => x.class_id === c.id && x.spec_id !== s.id && x.set_name);
          return `<tr>
            <td style="font-weight:500;white-space:nowrap"><span style="color:${c.color || 'inherit'}">${c.name_zh}</span><span style="color:var(--text-muted);font-size:12px"> · ${s.name_zh}</span></td>
            <td><input class="form-input md-tier-setname" style="height:28px" value="${(t && t.set_name || '').replace(/"/g, '&quot;')}" placeholder="${(sibling ? '如：' + sibling.set_name : '套装名').replace(/"/g, '&quot;')}"
              onchange="mdTierSetSave('${c.id}','${s.id}','${c.name_zh}·${s.name_zh}', this.value, '${t ? t.id : ''}', 'set_name')"></td>
            <td><input class="form-input" style="height:28px" value="${(t && t.bonus_2 || '').replace(/"/g, '&quot;')}" placeholder="可空"
              onchange="mdTierSetSave('${c.id}','${s.id}','${c.name_zh}·${s.name_zh}', this.value, '${t ? t.id : ''}', 'bonus_2')"></td>
            <td><input class="form-input" style="height:28px" value="${(t && t.bonus_4 || '').replace(/"/g, '&quot;')}" placeholder="可空"
              onchange="mdTierSetSave('${c.id}','${s.id}','${c.name_zh}·${s.name_zh}', this.value, '${t ? t.id : ''}', 'bonus_4')"></td>
          </tr>`;
        }).join('');
      }).join('')) : '<div style="color:var(--text-muted)">请先在「赛季」区新增赛季</div>'}`;
}
// 套装格子保存：行不存在时任一字段均可建行（任务书 #14-补丁3：效果不再绑定套装名，可独立填写保存）；
// 套装名改动后提示同步同职业其他专精行
async function mdTierSetSave(classId, specId, label, value, rowId, field) {
  if (!mdTierSeasonId) return;
  try {
    if (rowId) {
      await MasterData.mdUpdate('tier_sets', { [field]: value }, `id=eq.${rowId}`);
    } else {
      // set_name 列 NOT NULL：效果先行建行时套装名以空串占位，后续可补
      await MasterData.mdInsert('tier_sets', { season_id: mdTierSeasonId, class_id: classId, spec_id: specId, set_name: field === 'set_name' ? value.trim() : '', [field]: field === 'set_name' ? value.trim() : value });
    }
    await MasterData.refresh('tier_sets');
    // REQ-053：套装名职业级联动——改一行后提示同步同职业其他专精行
    if (field === 'set_name' && value.trim()) {
      const className = label.split('·')[0];
      const siblings = MasterData.getTierSets(mdTierSeasonId).filter(t => t.class_id === classId && t.spec_id !== specId && t.set_name !== value.trim());
      if (siblings.length && confirm(`是否把套装名「${value.trim()}」同步到 ${className} 的其他专精行（${siblings.length} 行）？`)) {
        for (const s of siblings) {
          await MasterData.mdUpdate('tier_sets', { set_name: value.trim() }, `id=eq.${s.id}`);
        }
        await MasterData.refresh('tier_sets');
      }
    }
    renderDatacenter();
    showToast(`${label} 套装已保存`, 'success');
  } catch (e) {
    showToast('保存失败：' + (e.message || '未知错误'), 'error');
  }
}

// ---------- 7. 大秘境 ----------
function mdRenderDungeons(panel) {
  const seasons = MasterData.getSeasons();
  const groups = seasons.map(s => {
    const dgs = MasterData.getDungeons(s.id);
    if (!dgs.length) return '';
    return `<div style="margin-bottom:16px">
      <div style="font-weight:600;color:var(--gold);margin-bottom:8px">${s.name}${s.is_current ? ' <span class="tag tag-green">当前</span>' : ''}</div>
      ${mdTable('<th>名称</th><th class="center">新本</th><th class="num">排序</th><th class="center">操作</th>',
        dgs.map(d => `<tr>
          <td style="font-weight:500">${d.name}</td>
          <td class="center">${d.is_new ? '<span class="tag tag-blue">新</span>' : '<span class="tag tag-red">否</span>'}</td>
          <td class="num">${d.sort_order ?? 0}</td>
          ${mdActionBtns(`mdEditDungeon('${d.id}')`, `mdDeleteRow('game_dungeons','${d.id}','${d.name}','')`)}
        </tr>`).join(''))}
    </div>`;
  }).join('');
  panel.innerHTML = `
    <div style="margin-bottom:12px"><button class="btn btn-primary btn-sm" onclick="mdEditDungeon()">+ 新增大秘境</button></div>
    ${groups || '<div style="color:var(--text-muted)">请先在「赛季」区新增赛季，再录大秘境</div>'}`;
}
function mdEditDungeon(id) {
  const seasons = MasterData.getSeasons();
  let row = null;
  if (id) seasons.forEach(s => { const f = MasterData.getDungeons(s.id).find(d => d.id === id); if (f) row = f; });
  mdOpenEditor(id ? '编辑大秘境' : '新增大秘境', [
    { key: 'season_id', label: '归属赛季', type: 'select', options: seasons.map(s => ({ value: s.id, label: s.name })), required: true, default: row ? row.season_id : ((MasterData.getCurrentSeason() || {}).id || '') },
    { key: 'name', label: '名称', required: true, placeholder: '如 毒牙祭坛' },
    { key: 'is_new', label: '本赛季新本', type: 'select', options: [{ value: 'false', label: '否' }, { value: 'true', label: '是' }], default: row && row.is_new ? 'true' : 'false' },
    { key: 'sort_order', label: '排序', type: 'number', default: row ? row.sort_order : 0 }
  ], row, async (out) => {
    const payload = { season_id: out.season_id, name: out.name, is_new: out.is_new === 'true', sort_order: out.sort_order };
    if (id) await MasterData.mdUpdate('game_dungeons', payload, `id=eq.${id}`);
    else await MasterData.mdInsert('game_dungeons', payload);
    await MasterData.refresh('game_dungeons');
    renderDatacenter();
    showToast('已保存', 'success');
  });
}

// ---------- 8. 职业（只读为主，icon/color 可改） ----------
function mdRenderClasses(panel) {
  const rows = MasterData.getClasses();
  panel.innerHTML = mdTable('<th class="num">ID</th><th>职业</th><th>英文</th><th>色值</th><th>图标路径</th>',
    rows.map(c => `<tr>
      <td class="num">${c.class_key}</td>
      <td style="font-weight:600;color:${c.color || 'inherit'}">${c.name_zh}</td>
      <td style="color:var(--text-muted)">${c.name_en}</td>
      <td><input class="form-input" style="height:32px;padding:2px 8px;width:90px;font-size:12px" value="${c.color || ''}" onchange="mdClassFieldSave('${c.id}','color',this.value)"></td>
      <td><input class="form-input" style="height:32px;padding:2px 8px;font-size:12px" value="${c.icon || ''}" onchange="mdClassFieldSave('${c.id}','icon',this.value)"></td>
    </tr>`).join(''));
}
async function mdClassFieldSave(id, field, value) {
  try {
    await MasterData.mdUpdate('game_classes', { [field]: value }, `id=eq.${id}`);
    await MasterData.refresh('game_classes');
    showToast('已保存', 'success');
  } catch (e) {
    showToast('保存失败：' + (e.message || '未知错误'), 'error');
  }
}

// ---------- 9. 专精（按职业分组，只读为主 + icon/role 可改） ----------
function mdRenderSpecs(panel) {
  const classes = MasterData.getClasses();
  const html = classes.map(c => {
    const specs = MasterData.getSpecs(c.id);
    if (!specs.length) return '';
    return `<div style="margin-bottom:16px">
      <div style="font-weight:600;margin-bottom:8px;color:${c.color || 'var(--gold)'}">${c.name_zh}</div>
      ${mdTable('<th class="num">ID</th><th>专精</th><th>职责</th><th>图标路径</th>',
        specs.map(s => `<tr>
          <td class="num">${s.spec_key}</td>
          <td style="font-weight:500">${s.name_zh}</td>
          <td><select class="form-select" style="height:32px;padding:2px 8px;width:110px;font-size:12px" onchange="mdSpecFieldSave('${s.id}','role',this.value)">
            ${['TANK', 'HEALER', 'DAMAGE'].map(r => `<option value="${r}" ${s.role === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select></td>
          <td><input class="form-input" style="height:32px;padding:2px 8px;font-size:12px" value="${s.icon || ''}" onchange="mdSpecFieldSave('${s.id}','icon',this.value)"></td>
        </tr>`).join(''), 'md-specs-table')}
    </div>`;
  }).join('');
  panel.innerHTML = html || '<div style="color:var(--text-muted)">尚无专精数据，请先运行「导入职业/专精字典」</div>';
}
async function mdSpecFieldSave(id, field, value) {
  try {
    await MasterData.mdUpdate('game_specs', { [field]: value }, `id=eq.${id}`);
    await MasterData.refresh('game_specs');
    showToast('已保存', 'success');
  } catch (e) {
    showToast('保存失败：' + (e.message || '未知错误'), 'error');
  }
}

// ---------- 字典导入器（一次性工具，长期保留；幂等 upsert） ----------
// BUG-046：数据源从「读取项目内 字典数据.json」改为内置快照 masterDataSnapshot.js
// ——快照自带 13 职业/40 专精全量（verify 6b 实证），导入器不再依赖任何外部文件；
// 版本更新时更新快照即可跟着一键入库。upsert 幂等逻辑不变。
let mdImporting = false;
async function mdImportDict() {
  if (mdImporting) return;
  const btn = document.getElementById('mdImportBtn');
  mdImporting = true;
  btn.disabled = true; btn.dataset.originalText = btn.textContent; btn.textContent = '导入中...';
  try {
    const dict = window.MASTER_DATA_SNAPSHOT;
    if (!dict || !Array.isArray(dict.classes) || !dict.classes.length) {
      throw new Error('内置快照数据缺失（masterDataSnapshot.js 未加载）');
    }
    // 1) 职业 upsert（class_key 冲突更新）
    const classRows = dict.classes.map(c => ({
      class_key: c.class_key, name_zh: c.name_zh, name_en: c.name_en, color: c.color, icon: c.icon
    }));
    const upsertedClasses = await MasterData.mdUpsert('game_classes', classRows, 'class_key');
    await MasterData.refresh('game_classes');
    // 2) 专精 upsert（class_id + spec_key 冲突更新）
    // BUG-048：role 以快照为准（merge 会覆盖库内错值）；icon 缺省回填职业图标
    // （快照专精无独立 icon 时不得入库空串，验收要求 icon 非空率 100%）
    const dbClasses = MasterData.getClasses();
    const specRows = (dict.specs || []).map(s => {
      const cls = dbClasses.find(c => c.class_key === s.class_key);
      return cls ? { class_id: cls.id, spec_key: s.spec_key, name_zh: s.name_zh, name_en: s.name_en || '', role: s.role, icon: s.icon || cls.icon || '' } : null;
    }).filter(Boolean);    const upsertedSpecs = await MasterData.mdUpsert('game_specs', specRows, 'class_id,spec_key');
    await MasterData.refresh('game_specs');
    renderDatacenter();
    showToast(`职业 ${(upsertedClasses || []).length} 行、专精 ${(upsertedSpecs || []).length} 行 upsert 完成`, 'success');
  } catch (e) {
    console.error('字典导入失败:', e);
    showToast('字典导入失败：' + (e.message || '未知错误'), 'error');
  } finally {
    mdImporting = false;
    btn.disabled = false; btn.textContent = btn.dataset.originalText || '📥 导入职业/专精字典';
  }
}

// ==================== REQ-052：日期输入中文化（原生 date input + 中文遮罩） ====================
// 背景：原生 <input type="date"> 的占位/显示格式由浏览器区域设置决定，英文 Chrome 显示
// mm/dd/yyyy 类英文占位符，无法改文案。方案（报告取舍说明）：保留原生输入与选择器行为，
// 输入文本透明化 + 覆盖中文格式文本（YYYY年M月D日），零交互差异、零依赖。
function zhWrapDateInput(input) {
  if (!input || input.dataset.zhWrapped) return;
  input.dataset.zhWrapped = '1';
  const wrap = document.createElement('span');
  wrap.className = 'date-zh-wrap';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  const text = document.createElement('span');
  text.className = 'date-zh-text date-zh-empty';
  wrap.appendChild(text);
  const render = () => {
    const v = input.value;
    if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const [y, m, d] = v.split('-').map(Number);
      text.textContent = `${y}年${m}月${d}日`;
      text.classList.remove('date-zh-empty');
    } else {
      text.textContent = '年 / 月 / 日';
      text.classList.add('date-zh-empty');
    }
  };
  input.addEventListener('input', render);
  input.addEventListener('change', render);
  // 任务书 #14-补丁3 第五项：Ctrl+A 全选时 Chrome 对原生 date 分段用「高亮底色+强制白字」自绘
  // （非 ::selection，CSS 管不到），空值时白色 yyyy/mm/dd 字母透出盖过中文遮罩。
  // date 输入为分段编辑，全选无实际编辑意义——拦截 Ctrl/Cmd+A，杜绝原生选中态自绘。
  input.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) e.preventDefault();
  });
  // REQ-061/BUG-050 衍生：程序切换 input 显隐时（如自定义日期范围），遮罩同步显隐
  const syncVisibility = () => { wrap.style.display = input.style.display === 'none' ? 'none' : ''; };
  new MutationObserver(syncVisibility).observe(input, { attributes: true, attributeFilter: ['style'] });
  syncVisibility();
  // 覆盖 value 属性赋值（程序写入 .value 时同步刷新遮罩）
  const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  Object.defineProperty(input, 'value', {
    get: desc.get,
    set: (v) => { desc.set.call(input, v); render(); },
    configurable: true
  });
  render();
}

// 全站静态日期输入统一包裹（脚本位于 body 末尾，DOM 已就绪）
document.querySelectorAll('input[type="date"]').forEach(zhWrapDateInput);

// 任务书 #42：导航拖拽排序初始化（脚本位于 body 末尾，DOM 已就绪）+ 日历密度默认紧凑先刷
initNavDragSort();
paintCalendarDensity(getCalendarDensity());

// ==================== 任务书 #41（REQ-112）：问题反馈悬浮卡交互 ====================
// 桌面显隐纯 CSS（.fb-entry:hover）；此处只补移动端降级与群号复制：
// 移动端（hover 不可用：粗指针或 ≤768px）点击按钮切换 .open，点卡片外/ESC 关闭。
(function initFeedbackEntry() {
  const entry = document.getElementById('feedbackEntry');
  if (!entry) return;
  const btn = document.getElementById('feedbackBtn');
  const coarse = () => (window.matchMedia && window.matchMedia('(hover: none)').matches) || window.innerWidth <= 768;
  btn.addEventListener('click', (e) => {
    if (!coarse()) return; // 桌面走 CSS hover，点击不干预（防与 hover 态打架）
    e.stopPropagation();
    const open = entry.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.addEventListener('click', (e) => {
    if (entry.classList.contains('open') && !entry.contains(e.target)) {
      entry.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && entry.classList.contains('open')) {
      entry.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
  // 群号点按复制（非强制增强；剪贴板不可用回退 toast 展示）
  const qq = document.getElementById('feedbackQqCopy');
  if (qq) qq.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText('1104273954');
      showToast('群号已复制：1104273954', 'success');
    } catch {
      showToast('群号：1104273954', 'info');
    }
  });
})();
