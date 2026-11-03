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

  // ---- REQ-148（任务书 #64）：职业→护甲类型 与 套装兑换物族→护甲 ----
  // 职业→护甲 = REQ-091 运营补定口径「护甲类型与职业一一对应」（板=战骑DK／锁=猎萨唤／皮=德贼僧DH／布=法术牧）。
  // 键名以 game_classes.name_zh 库内现值为准：盗贼（非「潜行者」）、萨满（非「萨满祭司」）——REQ-091 文档措辞
  // 为旧称，键名错配会导致对应职业套装卡不渲染「共X件」（任务书 #64 B1 实测抓获）。
  // 12.0 起套装兑换物（代币）按护甲分组（官方代币分组机制），S2 毒渊族名实证：
  // 毒织=布甲 / 毒咒=皮甲 / 毒锻=锁甲 / 毒铸=板甲。族名随赛季更换，新赛季按当季代币名更新 ARMOR_TOKEN_FAMILY；
  // 词表未覆盖的赛季/职业自然降级（套装卡不渲染「共X件」标识），不得编造映射。
  // 消费：公示页套装一览「共X件」展开明细（js/dataPublic.js）；REQ-091 职业筛选落地时同源复用，禁第三份映射。
  const CLASS_ARMOR = {
    '战士': '板甲', '圣骑士': '板甲', '死亡骑士': '板甲',
    '猎人': '锁甲', '萨满': '锁甲', '唤魔师': '锁甲',
    '盗贼': '皮甲', '武僧': '皮甲', '德鲁伊': '皮甲', '恶魔猎手': '皮甲',
    '牧师': '布甲', '法师': '布甲', '术士': '布甲'
  };
  const ARMOR_TOKEN_FAMILY = { '布甲': '毒织', '皮甲': '毒咒', '锁甲': '毒锻', '板甲': '毒铸' };

  const TIER_TOKEN_SLOTS = [['套装头盔', '头部'], ['套装护肩', '肩部'], ['套装胸甲', '胸部'], ['套装护手', '手部'], ['套装护腿', '腿部']];
  function tierTokenMatch(row) {
    if (row.slot !== '套装兑换物') return null;
    const armor = Object.keys(ARMOR_TOKEN_FAMILY).find(key => (row.item_name || '').startsWith(ARMOR_TOKEN_FAMILY[key]));
    const slot = TIER_TOKEN_SLOTS.find(([word]) => (row.effect || '').includes(word))?.[1];
    return armor && slot ? { armor, slot } : null;
  }
  function redeemableTierPieces(pieces, token, seasonId) {
    if (!token) return [];
    return [...new Map(pieces
      .filter(piece => piece.season_id === seasonId && piece.slot === token.slot &&
        piece.armor_type === token.armor && piece.official_item_id)
      .map(piece => [piece.official_item_id, piece])).values()];
  }
  // Client 12.1.5.70688: ItemModifiedAppearance (modifier 0) -> ItemAppearance.DefaultIconFileDataID.
  const TIER_PIECE_METADATA = Object.freeze({
    271454: [7515799, 1, 74, 49, 32], 271455: [7515798, 1, 74, 40, 49], 271456: [7515797, 1, 74, 32, 36],
    271457: [7515796, 1, 74, 32, 36], 271459: [7515795, 1, 74, 49, 32], 271463: [7730305, 2, 74, 32, 49],
    271464: [7730304, 2, 74, 36, 32], 271465: [7730303, 2, 74, 32, 49], 271466: [7730302, 2, 74, 49, 32],
    271468: [7730301, 2, 74, 49, 36], 271472: [7739391, 6, 74, 40, 36], 271473: [7739390, 6, 74, 49, 32],
    271474: [7739389, 6, 74, 32, 49], 271475: [7739388, 6, 74, 49, 32], 271477: [7739387, 6, 74, 49, 32],
    271481: [7705650, 7, 73, 49, 32], 271482: [7705648, 7, 73, 40, 36], 271483: [7705647, 7, 73, 36, 32],
    271484: [7705646, 7, 73, 49, 32], 271486: [7705649, 7, 73, 32, 36], 271490: [7554481, 3, 73, 36, 32],
    271491: [7557370, 3, 73, 49, 36], 271492: [7554479, 3, 73, 36, 49], 271493: [7554478, 3, 73, 36, 40],
    271495: [7554477, 3, 73, 49, 36], 271499: [7789851, 13, 73, 32, 40], 271500: [7789850, 13, 73, 32, 36],
    271501: [7789849, 13, 73, 36, 40], 271502: [7789857, 13, 73, 36, 49], 271504: [7789856, 13, 73, 32, 49],
    271508: [7678402, 4, 73, 40, 36], 271509: [7678401, 4, 73, 36, 32], 271510: [7678400, 4, 73, 49, 32],
    271511: [7678399, 4, 73, 32, 49], 271513: [7678398, 4, 73, 36, 40], 271517: [7487944, 10, 73, 36, 49],
    271518: [7487943, 10, 73, 32, 40], 271519: [7487942, 10, 73, 49, 32], 271520: [7487941, 10, 73, 36, 40],
    271522: [7487940, 10, 73, 49, 36], 271526: [7579167, 11, 73, 32, 49], 271527: [7579165, 11, 73, 36, 32],
    271528: [7579164, 11, 73, 36, 40], 271529: [7579163, 11, 73, 40, 49], 271531: [7579166, 11, 73, 32, 36],
    271535: [7679657, 12, 73, 40, 32], 271536: [7679656, 12, 73, 49, 32], 271537: [7679655, 12, 73, 32, 49],
    271538: [7679654, 12, 73, 32, 49], 271540: [7679653, 12, 73, 36, 40], 271544: [7520907, 9, 5, 40, 36],
    271545: [7520905, 9, 5, 36, 49], 271546: [7520904, 9, 5, 49, 40], 271547: [7520895, 9, 5, 36, 32],
    271549: [7520906, 9, 5, 36, 49], 271553: [7667312, 5, 5, 32, 36], 271554: [7667310, 5, 5, 36, 40],
    271555: [7667309, 5, 5, 32, 49], 271556: [7667308, 5, 5, 49, 32], 271558: [7667311, 5, 5, 49, 32],
    271562: [7807660, 8, 5, 32, 36], 271563: [7807657, 8, 5, 40, 32], 271564: [7807656, 8, 5, 36, 49],
    271565: [7807654, 8, 5, 49, 36], 271567: [7807659, 8, 5, 32, 36]
  });
  const TIER_CLASSES_BY_ID = ['', '战士', '圣骑士', '猎人', '潜行者', '牧师', '死亡骑士', '萨满祭司', '法师', '术士', '武僧', '德鲁伊', '恶魔猎手', '唤魔师'];
  const TIER_STAT_NAMES = { 5: '智力', 32: '爆击', 36: '急速', 40: '全能', 49: '精通', 73: '敏捷／智力', 74: '力量／智力' };
  function tierPiecePresentation(itemId) {
    const row = TIER_PIECE_METADATA[itemId];
    if (!row) return null;
    const [iconId, classId, primary, ...secondary] = row;
    return { iconId, className: TIER_CLASSES_BY_ID[classId], primary: TIER_STAT_NAMES[primary],
      secondary: secondary.map(id => TIER_STAT_NAMES[id]) };
  }
  function itemQualityAttr(quality, name) {
    const value = quality ?? window.ItemQualityByName?.get(name);
    return /^(?:[0-7])$/.test(String(value)) ? ` data-item-quality="${value}"` : '';
  }
  function lootIconUrl(iconId, iconName) {
    const id = String(iconId ?? '');
    const asset = /^[1-9][0-9]*$/.test(id) ? id : /^[a-z0-9_]+$/i.test(iconName || '') ? iconName : '';
    return asset ? 'https://render.worldofwarcraft.com/icons/56/' + asset + '.jpg' : '';
  }

  return {
    SLOT_OPTIONS, WEAPON_GROUPS, WEAPON_MAIN_HAND, ARMOR_TYPES,
    PICKER_EXCLUDED_SLOTS, isMiscSlot, isPickerExcludedSlot,
    slotCategoryOf, matchWeapon, matchArmor, matchSlot,
    DC_EXTRA_SLOTS, MISC_ITEM_TYPES, DC_SLOT_OPTIONS, DC_ITEM_TYPE_OPTIONS, // 任务书 #40：数据中心表单下拉词表
    VENOMCURSE_LABEL, // 任务书 #43
    lootIconUrl, itemQualityAttr, tierPiecePresentation, tierTokenMatch, redeemableTierPieces,
    CLASS_ARMOR, ARMOR_TOKEN_FAMILY // 任务书 #64（REQ-148）
  };
})();
