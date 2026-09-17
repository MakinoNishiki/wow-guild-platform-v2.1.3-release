// 任务书 #51（REQ-137 一期）：家宅图鉴词表单一真源（双壳共用，须在 js/decorData.js 之前加载）。
// ③④⑤ 顾问终审通过（2026-09-18，送审件 docs/TASK-051-WP1-侦察送审.md）后落常量；
// 禁第三份映射——价格渲染/分类筛选/详情展示一律从本文件取词。
// 出处：货币/物品 = wago.tools DB2 CurrencyTypes zhCN 官方客户端字符串 + wowhead 中文官方页；
// 分类 = wowhead 中/英装饰图鉴导航 + wowdb Housing Hub 锚点逐件实证 × 库内交叉分布对号（送审件 §④）。
(function () {
  'use strict';

  // ---- ③ 货币中文名（price {amount,currency_id} 渲染用，25 个全值域覆盖） ----
  const CURRENCY_NAMES = {
    823: '埃匹希斯水晶',
    824: '要塞物资',
    1155: '远古魔力',
    1220: '职业大厅资源',
    1508: '黯淡的阿古尼特水晶',
    1560: '战争物资',
    1710: '海员达布隆币',
    1767: '冥殇',
    1792: '荣誉点数',
    1803: '尼奥罗萨的回响',
    1813: '贮藏心能',
    2003: '巨龙群岛补给',
    2118: '元素涌流',
    2657: '迷之碎片',
    2803: '晦幽铸币',
    2815: '共鸣水晶',
    3056: '刻基',
    3316: '虚光灰岩',
    3363: '社区礼券',
    3373: '钓客珍珠',
    3377: '纯粹丰饶',
    3379: '满溢的奥能',
    3392: '痛苦残渣',
    3405: '战地奖赏',
    3448: '腐蚀之币',
  };

  // ---- ③ 物品中文名（price {amount,item_id} 渲染用，11 个全值域覆盖） ----
  const ITEM_NAMES = {
    37829: '美酒节奖币',
    113681: '钢铁部落碎片',
    137642: '荣耀印记',
    166846: '备用零件',
    166970: '能量电池',
    168327: '连锁点火线圈',
    168832: '电流振荡器',
    169610: 'S.P.A.R.E.零件箱',
    207026: '梦涌凝珠',
    225557: '酷热燧烬花粉',
    227673: '“金”鱼',
  };

  // ---- 裸贴图价（price {amount,texture}）→ 货币名 ----
  // 查证（2026-09-18，顾问对证点）：Ability_TitanKeeper_CorruptionDot 的 fileID=897133，
  // 即货币 3568「封存腐化」（Contained Corruption，12.1 乌拉特克之咒，wago.tools DB2 CurrencyTypes
  // zhCN + wowhead icon=897133 实证）；**不是** 3448 腐蚀之币（icon 8032876，另一货币）。
  // 实态 20 件全为商人「受诅信物」以 100 × 封存腐化 出售（源文本裸贴图无 |H 超链接所致）。
  const TEXTURE_CURRENCY_NAMES = {
    Ability_TitanKeeper_CorruptionDot: '封存腐化',
  };

  // ---- ④ 主分类名（category_ids；7 为弃用 ID 库内零出现，不做占位映射） ----
  const CATEGORY_NAMES = {
    1: '家具',
    2: '构造',
    3: '点缀',
    4: '照明',
    5: '功能',
    6: '自然',
    8: '杂项',
    9: '房间',
  };
  // 筛选栏「分类」维度展示顺序（运营终审：主类维度上筛选栏，子类仅详情展示）
  const CATEGORY_FILTER_ORDER = [1, 2, 3, 4, 5, 6, 8, 9];

  // ---- ④ 子分类名（subcategory_ids，仅详情弹窗展示） ----
  // 34/35 为单子类「（全部）」，按终审直接显示父类名（杂项/房间）。
  const SUBCATEGORY_NAMES = {
    1: '座椅', 2: '床铺', 3: '门', 4: '建筑', 5: '桌台', 6: '储物', 7: '其他家具',
    8: '窗户', 9: '大型构造', 10: '其他构造',
    11: '观赏', 12: '壁挂', 13: '食物和饮料', 14: '地板', 15: '其他点缀',
    16: '大型灯具', 17: '墙壁灯具', 18: '吊灯', 19: '小型灯具', 21: '其他照明',
    22: '效能', 25: '大型植物', 26: '小型植物', 27: '灌木', 28: '地被植物', 29: '其他自然',
    34: '杂项', 35: '房间',
    51: '其他功能', 52: '藤蔓与悬挂植物', 53: '宠物床',
  };

  // ---- ⑤ 可放宠物（方案 A 终审通过）：官方子分类「宠物床」id，数据驱动零清单常量 ----
  const PET_SUBCATEGORY_ID = 53;

  // ---- 尺寸名（size 列实态 = 尺寸 tag id；39 件房间 size=0 显示「—」） ----
  const SIZE_NAMES = { 65: '微小', 66: '小号', 67: '中号', 68: '大号', 69: '超大' };

  // ---- 品质名（着色走 CSS .dh-q0~q5；值域实测 0-4，5 定义保留无害） ----
  const QUALITY_NAMES = { 0: '粗糙', 1: '普通', 2: '优秀', 3: '精良', 4: '史诗', 5: '传说' };

  // ---- 来源类型筛选签（十类 = 九类 sources type + 「无来源」（sources 空数组）） ----
  const SOURCE_TYPES = [
    { key: 'vendor', label: '商人' },
    { key: 'quest', label: '任务' },
    { key: 'drop', label: '掉落' },
    { key: 'achievement', label: '成就' },
    { key: 'profession', label: '制造' },
    { key: 'shop', label: '商城' },
    { key: 'treasure', label: '宝藏' },
    { key: 'event', label: '事件' },
    { key: 'festival_note', label: '节日' },
    { key: 'none', label: '无来源' },
  ];

  // ---- 资料片筛选（tags 组：tag id → 中文名原生在 tags 值里，此处仅定顺序与 id 集） ----
  const EXPANSION_TAGS = [
    { id: 99, label: '经典旧世' },
    { id: 100, label: '燃烧的远征' },
    { id: 101, label: '巫妖王之怒' },
    { id: 102, label: '大地的裂变' },
    { id: 103, label: '熊猫人之谜' },
    { id: 104, label: '德拉诺之王' },
    { id: 105, label: '军团再临' },
    { id: 106, label: '争霸艾泽拉斯' },
    { id: 107, label: '暗影国度' },
    { id: 108, label: '巨龙时代' },
    { id: 109, label: '地心之战' },
    { id: 110, label: '至暗之夜' },
  ];

  // ---- 容量档（placement_cost 分档；房间类高价值 12/16/18/20/100 落 5+ 档） ----
  const COST_TIERS = [
    { key: '1-2', label: '容量 1-2', match: c => c >= 1 && c <= 2 },
    { key: '3-4', label: '容量 3-4', match: c => c >= 3 && c <= 4 },
    { key: '5+', label: '容量 5+', match: c => c >= 5 },
  ];

  // ---- 摆放环境 ----
  const ENV_OPTIONS = [
    { key: 'indoor', label: '室内', match: r => r.indoors === true },
    { key: 'outdoor', label: '室外', match: r => r.outdoors === true },
    { key: 'both', label: '均可', match: r => r.indoors === true && r.outdoors === true },
  ];

  window.DecorDict = {
    CURRENCY_NAMES, ITEM_NAMES, TEXTURE_CURRENCY_NAMES,
    CATEGORY_NAMES, CATEGORY_FILTER_ORDER, SUBCATEGORY_NAMES,
    PET_SUBCATEGORY_ID, SIZE_NAMES, QUALITY_NAMES,
    SOURCE_TYPES, EXPANSION_TAGS, COST_TIERS, ENV_OPTIONS,
    PAGE_SIZE: 60, // ⑥ 定案：每页 60 件 + img lazy
  };
})();
