// ==================== 装备分类词表（单一真源，任务书 #31 / REQ-097，2026-08-11） ====================
// 四处消费（禁第三份映射，改词汇只改本文件）：
//   ① 公示页三级分类 chips（js/dataPublic.js CAT_CHIPS / isMisc）
//   ② 装备库 picker 三下拉过滤（js/app.js renderItemDbList，心愿单/装备分配两面板同治）
//   ③ BUG-057 picker 回填大类推导（js/app.js resolvePickerCategorySlot 由 slotCategoryOf 派生）
//   ④ 数据中心掉落双表单 slot/item_type 下拉（js/app.js mdEditLootItem/mdEditDungeonLootItem，任务书 #40 / REQ-114）
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

  // ---- 任务书 #40（REQ-114）：数据中心编辑表单下拉词表（库内全量现存值覆盖） ----
  // §1 盘点（2026-08-12，boss_loot 190 行 + dungeon_loot 221 行 distinct，对照表见 docs/TASK-040-修改报告.md）：
  // slot 词表外现存值 = 旧武器位词汇（单手/双手/远程/副手/副手物品）+ 杂项族（杂项/套装兑换物）；
  // 数据中心是全量管理入口——杂项/兑换物行也要能编辑，选项必须覆盖库内全部现存值。
  const DC_EXTRA_SLOTS = ['单手', '双手', '远程', '副手', '副手物品', '杂项', '套装兑换物'];
  // item_type 杂项族现存值（武器 15 型+盾牌 / 护甲 4 项之外）：其它/装饰/装饰品/垃圾/图样类专业/坐骑/饰品/戒指/套装兑换物
  const MISC_ITEM_TYPES = ['其它', '装饰', '装饰品', '垃圾', '锻造', '附魔', '制皮', '裁缝', '珠宝加工', '坐骑', '套装兑换物', '饰品', '戒指'];
  // 数据中心 slot 下拉全量 = 12 部位 + 库内其它现存值
  const DC_SLOT_OPTIONS = [...SLOT_OPTIONS, ...DC_EXTRA_SLOTS];
  // 数据中心 item_type 下拉全量 = 武器组 15 型（WEAPON_GROUPS 展开，魔杖归单手/法杖归双手/远程弓弩枪械）+ 盾牌 + 护甲 4 项 + 杂项族
  const DC_ITEM_TYPE_OPTIONS = [
    ...WEAPON_GROUPS.flatMap(g => g.types || []),
    '盾牌',
    ...ARMOR_TYPES.filter(t => t !== '盾牌'),
    ...MISC_ITEM_TYPES,
  ];

  // ---- match 函数（原始字段入参，双壳/两侧数据结构自适应：公示页 l.slot/l.item_type、picker item.slot/item.armorType） ----
  function matchWeapon(key, slot, itemType) {
    if (key === WEAPON_MAIN_HAND.key) return WEAPON_MAIN_HAND.match(slot, itemType);
    const g = WEAPON_GROUPS.find(x => x.key === key);
    if (!g) return false;
    return g.types ? g.types.includes(itemType) : slot === g.slot;
  }
  const matchArmor = (key, itemType) => ARMOR_TYPES.includes(key) && itemType === key;
  const matchSlot = (key, slot) => SLOT_OPTIONS.includes(key) && slot === key;

  // ---- 任务书 #43（REQ-098 增补 / REQ-110 定案②）：毒咒标签口径常量 ----
  // 消费：公示页毒咒筛选组 chips（js/dataPublic.js）+ 数据中心录入下拉（js/app.js #37 表单）——同源禁分叉
  const VENOMCURSE_LABEL = '毒咒';

  return {
    SLOT_OPTIONS, WEAPON_GROUPS, WEAPON_MAIN_HAND, ARMOR_TYPES,
    PICKER_EXCLUDED_SLOTS, isMiscSlot, isPickerExcludedSlot,
    slotCategoryOf, matchWeapon, matchArmor, matchSlot,
    DC_EXTRA_SLOTS, MISC_ITEM_TYPES, DC_SLOT_OPTIONS, DC_ITEM_TYPE_OPTIONS, // 任务书 #40：数据中心表单下拉词表
    VENOMCURSE_LABEL // 任务书 #43
  };
})();
