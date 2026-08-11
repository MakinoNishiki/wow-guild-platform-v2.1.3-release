// ==================== 装备分类词表（单一真源，任务书 #31 / REQ-097，2026-08-11） ====================
// 三处消费（禁第三份映射，改词汇只改本文件）：
//   ① 公示页三级分类 chips（js/dataPublic.js CAT_CHIPS / isMisc）
//   ② 装备库 picker 三下拉过滤（js/app.js renderItemDbList，心愿单/装备分配两面板同治）
//   ③ BUG-057 picker 回填大类推导（js/app.js resolvePickerCategorySlot 由 slotCategoryOf 派生）
// 判定口径与公示页终版一致（任务书 #28 WP6，2026-08-09 运营定）：
//   部位 = slot 等值；武器 = item_type 白名单（魔杖归单手、法杖归双手、远程=弓弩枪）；
//   副手 = slot'副手物品'（真副手饰物，slot='副手' 全为盾牌归护甲，零重叠）；盾牌归护甲；
//   杂项唯一口径 = slot='杂项'（任务书 #28 WP2；D1 裁定：picker 另恒定排除 slot='套装兑换物'）。
window.LootTaxonomy = (function () {
  // 部位 12 项（slot 等值，顺序与公示页 chips 一致）
  const SLOT_OPTIONS = ['头部', '肩部', '胸部', '腕部', '手部', '腰部', '腿部', '脚部', '背部', '颈部', '手指', '饰品'];

  // 武器组（item_type 白名单；「副手」例外走 slot 判定）
  const WEAPON_GROUPS = [
    { key: '单手', types: ['单手剑', '单手锤', '单手斧', '匕首', '拳套', '战刃', '魔杖'] }, // 魔杖按单手归口（法系魔杖+副手物品组合等效法杖）
    { key: '双手', types: ['双手剑', '双手锤', '双手斧', '长柄武器', '法杖'] }, // 法杖归双手；远程不并入双手
    { key: '远程', types: ['弓', '弩', '枪械'] }, // 服务远敏平砍职业；禁止 slot='远程' 一刀切（含魔杖，已归单手）
    { key: '副手', slot: '副手物品' }
  ];
  // 主手：全库 0 命中——定义保留（公示页 chip 数据驱动，当季无数据不渲染、有数据自动出现；picker 不列）
  const WEAPON_MAIN_HAND = { key: '主手', match: (slot, itemType) => slot === '主手' || itemType === '主手' };

  // 护甲类型 5 项（item_type 等值）
  const ARMOR_TYPES = ['板甲', '锁甲', '皮甲', '布甲', '盾牌'];

  // picker 恒定排除（任务书 #31 修正项① + D1 裁定，不做切换入口——picker 的目的就是选装备）：
  // 杂项 51 行（装饰/垃圾/图样等）+ 套装兑换物 1 行（REQ-089 落地后衍生套装装备是正常装备行，自然出现，无需兑换物本体占列表）
  const PICKER_EXCLUDED_SLOTS = ['杂项', '套装兑换物'];
  const isMiscSlot = slot => slot === '杂项';
  const isPickerExcludedSlot = slot => PICKER_EXCLUDED_SLOTS.includes(slot);

  // ---- BUG-057 回填派生：库内 slot → 表单大类（武器/防具/首饰/饰品，表单词汇不动） ----
  const ARMOR_SLOT_9 = SLOT_OPTIONS.slice(0, 9); // 头部…背部（防具九部位）
  const SLOT_ALIASES = { '手腕': '腕部' }; // 插件采集旧词归一（与 resolvePickerCategorySlot formSlotMap 同口径）
  const WEAPON_SLOT_WORDS = ['武器', '副手', '单手', '双手', '远程', '副手物品'];
  function slotCategoryOf(rawSlot) {
    const slot = SLOT_ALIASES[(rawSlot || '').trim()] || (rawSlot || '').trim();
    if (WEAPON_SLOT_WORDS.includes(slot)) return '武器';
    if (ARMOR_SLOT_9.includes(slot)) return '防具';
    if (slot === '颈部' || slot === '手指') return '首饰';
    if (slot === '饰品') return '饰品';
    return '';
  }

  // ---- match 函数（原始字段入参，双壳/两侧数据结构自适应：公示页 l.slot/l.item_type、picker item.slot/item.armorType） ----
  function matchWeapon(key, slot, itemType) {
    if (key === WEAPON_MAIN_HAND.key) return WEAPON_MAIN_HAND.match(slot, itemType);
    const g = WEAPON_GROUPS.find(x => x.key === key);
    if (!g) return false;
    return g.types ? g.types.includes(itemType) : slot === g.slot;
  }
  const matchArmor = (key, itemType) => ARMOR_TYPES.includes(key) && itemType === key;
  const matchSlot = (key, slot) => SLOT_OPTIONS.includes(key) && slot === key;

  return {
    SLOT_OPTIONS, WEAPON_GROUPS, WEAPON_MAIN_HAND, ARMOR_TYPES,
    PICKER_EXCLUDED_SLOTS, isMiscSlot, isPickerExcludedSlot,
    slotCategoryOf, matchWeapon, matchArmor, matchSlot
  };
})();
