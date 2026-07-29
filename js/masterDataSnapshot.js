// 任务书 #14：主数据加载失败时的内置快照（兜底，系统任何页面不得白屏）
// 由代码常量固化（classSpecMap / raidBossMap / 职业色 / specRoleMap）。
// 主数据表上线并录入数据后，本快照仅在离线/超时等加载失败场景生效。
window.MASTER_DATA_SNAPSHOT = {
  patches: [],
  seasons: [],
  raids: [
    { id: 'snap-raid-1', name: '尼鲁巴尔王宫', type: 'raid', min_players: 20, max_players: 20, sort_order: 1 },
    { id: 'snap-raid-2', name: '虚影尖塔', type: 'raid', min_players: 20, max_players: 20, sort_order: 2 },
    { id: 'snap-raid-3', name: '梦境裂隙', type: 'raid', min_players: 20, max_players: 20, sort_order: 3 },
    { id: 'snap-raid-4', name: '进军奎尔丹纳斯', type: 'raid', min_players: 20, max_players: 20, sort_order: 4 },
    { id: 'snap-raid-5', name: '孢陨幽境', type: 'raid', min_players: 20, max_players: 20, sort_order: 5 }
  ],
  bosses: [
    { id: 'snap-b1', raid_id: 'snap-raid-2', name: '元首阿福扎恩', boss_order: 1 },
    { id: 'snap-b2', raid_id: 'snap-raid-2', name: '弗拉希乌斯', boss_order: 2 },
    { id: 'snap-b3', raid_id: 'snap-raid-2', name: '陨落之王萨哈达尔', boss_order: 3 },
    { id: 'snap-b4', raid_id: 'snap-raid-2', name: '威厄高尔和艾佐拉克', boss_order: 4 },
    { id: 'snap-b5', raid_id: 'snap-raid-2', name: '光盲先锋', boss_order: 5 },
    { id: 'snap-b6', raid_id: 'snap-raid-2', name: '宇宙之冕', boss_order: 6 },
    { id: 'snap-b7', raid_id: 'snap-raid-3', name: '奇美鲁斯（未梦之神）', boss_order: 1 },
    { id: 'snap-b8', raid_id: 'snap-raid-4', name: '贝洛朗（奥的子嗣）', boss_order: 1 },
    { id: 'snap-b9', raid_id: 'snap-raid-4', name: '至暗之夜降临', boss_order: 2 },
    { id: 'snap-b10', raid_id: 'snap-raid-5', name: '腐沼', boss_order: 1 }
  ],
  classes: [
    { id: 'snap-c1', class_key: 1, name_zh: '战士', name_en: 'warrior', color: '#C79C6E', icon: 'assets/icons/warrior.svg' },
    { id: 'snap-c2', class_key: 2, name_zh: '盗贼', name_en: 'rogue', color: '#FFF569', icon: 'assets/icons/rogue.svg' },
    { id: 'snap-c3', class_key: 3, name_zh: '圣骑士', name_en: 'paladin', color: '#F58CBA', icon: 'assets/icons/paladin.svg' },
    { id: 'snap-c4', class_key: 4, name_zh: '法师', name_en: 'mage', color: '#69CCF0', icon: 'assets/icons/mage.svg' },
    { id: 'snap-c5', class_key: 5, name_zh: '术士', name_en: 'warlock', color: '#9482C9', icon: 'assets/icons/warlock.svg' },
    { id: 'snap-c6', class_key: 6, name_zh: '猎人', name_en: 'hunter', color: '#ABD473', icon: 'assets/icons/hunter.svg' },
    { id: 'snap-c7', class_key: 7, name_zh: '恶魔猎手', name_en: 'dh', color: '#A330C9', icon: 'assets/icons/dh.svg' },
    { id: 'snap-c8', class_key: 8, name_zh: '死亡骑士', name_en: 'dk', color: '#C41F3B', icon: 'assets/icons/dk.svg' },
    { id: 'snap-c9', class_key: 9, name_zh: '萨满', name_en: 'shaman', color: '#0070DD', icon: 'assets/icons/shaman.svg' },
    { id: 'snap-c10', class_key: 10, name_zh: '德鲁伊', name_en: 'druid', color: '#FF7D0A', icon: 'assets/icons/druid.svg' },
    { id: 'snap-c11', class_key: 11, name_zh: '唤魔师', name_en: 'evoker', color: '#33937F', icon: 'assets/icons/evoker.svg' },
    { id: 'snap-c12', class_key: 12, name_zh: '武僧', name_en: 'monk', color: '#00FF96', icon: 'assets/icons/monk.svg' },
    { id: 'snap-c13', class_key: 13, name_zh: '牧师', name_en: 'priest', color: '#FFFFFF', icon: 'assets/icons/priest.svg' }
  ],
  specs: [
    { class_key: 1, spec_key: 1, name_zh: '防护', role: 'TANK' }, { class_key: 1, spec_key: 2, name_zh: '武器', role: 'DAMAGE' }, { class_key: 1, spec_key: 3, name_zh: '狂怒', role: 'DAMAGE' },
    { class_key: 2, spec_key: 1, name_zh: '刺杀', role: 'DAMAGE' }, { class_key: 2, spec_key: 2, name_zh: '狂徒', role: 'DAMAGE' }, { class_key: 2, spec_key: 3, name_zh: '敏锐', role: 'DAMAGE' },
    { class_key: 3, spec_key: 1, name_zh: '防护', role: 'TANK' }, { class_key: 3, spec_key: 2, name_zh: '神圣', role: 'HEALER' }, { class_key: 3, spec_key: 3, name_zh: '惩戒', role: 'DAMAGE' },
    { class_key: 4, spec_key: 1, name_zh: '冰霜', role: 'DAMAGE' }, { class_key: 4, spec_key: 2, name_zh: '火焰', role: 'DAMAGE' }, { class_key: 4, spec_key: 3, name_zh: '奥术', role: 'DAMAGE' },
    { class_key: 5, spec_key: 1, name_zh: '恶魔学识', role: 'DAMAGE' }, { class_key: 5, spec_key: 2, name_zh: '毁灭', role: 'DAMAGE' }, { class_key: 5, spec_key: 3, name_zh: '痛苦', role: 'DAMAGE' },
    { class_key: 6, spec_key: 1, name_zh: '野兽控制', role: 'DAMAGE' }, { class_key: 6, spec_key: 2, name_zh: '射击', role: 'DAMAGE' }, { class_key: 6, spec_key: 3, name_zh: '生存', role: 'DAMAGE' },
    { class_key: 7, spec_key: 1, name_zh: '复仇', role: 'TANK' }, { class_key: 7, spec_key: 2, name_zh: '浩劫', role: 'DAMAGE' }, { class_key: 7, spec_key: 3, name_zh: '噬灭', role: 'DAMAGE' },
    { class_key: 8, spec_key: 1, name_zh: '鲜血', role: 'TANK' }, { class_key: 8, spec_key: 2, name_zh: '冰霜', role: 'DAMAGE' }, { class_key: 8, spec_key: 3, name_zh: '邪恶', role: 'DAMAGE' },
    { class_key: 9, spec_key: 1, name_zh: '恢复', role: 'HEALER' }, { class_key: 9, spec_key: 2, name_zh: '增强', role: 'DAMAGE' }, { class_key: 9, spec_key: 3, name_zh: '元素', role: 'DAMAGE' },
    { class_key: 10, spec_key: 1, name_zh: '守护', role: 'TANK' }, { class_key: 10, spec_key: 2, name_zh: '野性', role: 'DAMAGE' }, { class_key: 10, spec_key: 3, name_zh: '平衡', role: 'DAMAGE' }, { class_key: 10, spec_key: 4, name_zh: '恢复', role: 'HEALER' },
    { class_key: 11, spec_key: 1, name_zh: '湮灭', role: 'DAMAGE' }, { class_key: 11, spec_key: 2, name_zh: '恩护', role: 'HEALER' }, { class_key: 11, spec_key: 3, name_zh: '增辉', role: 'DAMAGE' },
    { class_key: 12, spec_key: 1, name_zh: '酒仙', role: 'TANK' }, { class_key: 12, spec_key: 2, name_zh: '踏风', role: 'DAMAGE' }, { class_key: 12, spec_key: 3, name_zh: '织雾', role: 'HEALER' },
    { class_key: 13, spec_key: 1, name_zh: '戒律', role: 'HEALER' }, { class_key: 13, spec_key: 2, name_zh: '神圣', role: 'HEALER' }, { class_key: 13, spec_key: 3, name_zh: '暗影', role: 'DAMAGE' }
  ],
  dungeons: [],
  loot: [],
  tierSets: []
};
