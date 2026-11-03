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
  const QUALITY_NAMES = { 0: '粗糙', 1: '普通', 2: '优秀', 3: '精良', 4: '史诗', 5: '传说', 6: '神器', 7: '传家宝' };

  // ---- 来源类型筛选签（十一类 = 十类 sources type + 「无来源」（sources 空数组）） ----
  const SOURCE_TYPES = [
    { key: 'vendor', label: '商人' },
    { key: 'quest', label: '任务' },
    { key: 'drop', label: '掉落' },
    { key: 'achievement', label: '成就' },
    { key: 'profession', label: '制造' },
    { key: 'shop', label: '商城' },
    { key: 'treasure', label: '宝藏' },
    { key: 'event', label: '事件' },
    { key: 'unlock', label: '解锁' },
    { key: 'festival_note', label: '节日' },
    { key: 'none', label: '无来源' },
  ];

  // ---- 主题风格（BUG-108 勘定裁定 2026-10-01：tags 99–110 = 暴雪官方 Housing 目录 dataTagsByID 原样入库，
  //      语义为主题风格出处而非「加入版本」，数据面维持原值零改动；前端组名随任务书 #64 改「主题风格」+说明文案，
  //      任务书 #68 起组名再改「资料片分类」（与新增「种族」筛选上下位区分，纯文案）。
  //      tag id → 中文名原生在 tags 值里，此处仅定顺序与 id 集；常量名维持 EXPANSION_TAGS 零逻辑改动） ----
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

  // ---- 种族（任务书 #68：单选筛选维度；tag id → 中文名原生在 tags 值里，此处仅定顺序与 id 集） ----
  // 口径裁定：83「精灵」作上位标签保留（与 84-87 并存）；80「暴风城」剔除（严格种族定义不含主城/势力地名）；
  // 484「龙希尔」=可玩种族归种族；147「邪能」/150「机械」不归种族（后续如需可扩展风格维度）。
  const RACE_TAGS = [
    { id: 74,  label: '矮人' },
    { id: 75,  label: '蛮锤矮人' },
    { id: 76,  label: '铜须矮人' },
    { id: 77,  label: '黑铁矮人' },
    { id: 78,  label: '土灵' },
    { id: 79,  label: '人类' },
    { id: 81,  label: '库尔提拉斯人' },
    { id: 82,  label: '吉尔尼斯人' },
    { id: 83,  label: '精灵' },
    { id: 84,  label: '血精灵' },
    { id: 85,  label: '暗夜精灵' },
    { id: 86,  label: '虚空精灵' },
    { id: 87,  label: '夜之子' },
    { id: 88,  label: '牛头人' },
    { id: 89,  label: '德莱尼' },
    { id: 90,  label: '兽人' },
    { id: 91,  label: '地精' },
    { id: 92,  label: '狐人' },
    { id: 93,  label: '巨魔' },
    { id: 95,  label: '赞达拉巨魔' },
    { id: 96,  label: '亡灵' },
    { id: 97,  label: '侏儒' },
    { id: 98,  label: '熊猫人' },
    { id: 157, label: '维库人' },
    { id: 452, label: '哈籁尼尔' },
    { id: 484, label: '龙希尔' },
    { id: 505, label: '鱼人' },
    { id: 620, label: '机械侏儒' },
    { id: 631, label: '玛格汉兽人' },
    { id: 639, label: '阿曼尼巨魔' },
  ];

  // ---- 容量档（placement_cost 分档；房间类高价值 12/16/18/20/100 落 5+ 档） ----
  const COST_TIERS = [
    { key: '1-2', label: '容量 1-2', match: c => c >= 1 && c <= 2 },
    { key: '3-4', label: '容量 3-4', match: c => c >= 3 && c <= 4 },
    { key: '5+', label: '容量 5+', match: c => c >= 5 },
  ];

  // ---- 摆放环境（任务书 #51-补丁 第四节：四档砍三档） ----
  // 数据依据（顾问 RPC 直连实测 2026-09-18，直接采信）：indoors=true=2062（全量，「室内」档=全部无筛选价值，砍）；
  // outdoors=true=2020、双可=2020（「均可」与「室外」恒等，砍）；仅室内=42（39 房间+9144/10952/14583）；仅室外=0。
  const ENV_OPTIONS = [
    { key: 'outdoor', label: '可放室外', match: r => r.outdoors === true },
    { key: 'indoor_only', label: '仅室内', match: r => r.indoors === true && r.outdoors !== true },
  ];

  // #84：静态模型缩略图；新官方目录图优先，原物品图ID只作回退识别。
  // REQ-176: current client HouseRoom -> UI atlas crops; no guessed room images.
  const ROOM_ICON_OVERRIDES = {
  "439": "assets/decor-icons/room-previews/439.png",
  "7": "assets/decor-icons/room-previews/7.png",
  "1": "assets/decor-icons/room-previews/1.png",
  "11": "assets/decor-icons/room-previews/11.png",
  "12": "assets/decor-icons/room-previews/12.png",
  "3": "assets/decor-icons/room-previews/3.png",
  "2": "assets/decor-icons/room-previews/2.png",
  "14": "assets/decor-icons/room-previews/14.png",
  "9": "assets/decor-icons/room-previews/9.png",
  "15": "assets/decor-icons/room-previews/15.png",
  "8": "assets/decor-icons/room-previews/8.png",
  "6": "assets/decor-icons/room-previews/6.png",
  "13": "assets/decor-icons/room-previews/13.png",
  "50": "assets/decor-icons/room-previews/50.png",
  "10": "assets/decor-icons/room-previews/10.png",
  "48": "assets/decor-icons/room-previews/48.png",
  "223": "assets/decor-icons/room-previews/223.png",
  "233": "assets/decor-icons/room-previews/233.png",
  "400": "assets/decor-icons/room-previews/400.png",
  "401": "assets/decor-icons/room-previews/401.png",
  "294": "assets/decor-icons/room-previews/294.png",
  "151": "assets/decor-icons/room-previews/151.png",
  "292": "assets/decor-icons/room-previews/292.png",
  "132": "assets/decor-icons/room-previews/132.png",
  "281": "assets/decor-icons/room-previews/281.png",
  "277": "assets/decor-icons/room-previews/277.png",
  "273": "assets/decor-icons/room-previews/273.png",
  "282": "assets/decor-icons/room-previews/282.png",
  "286": "assets/decor-icons/room-previews/286.png",
  "307": "assets/decor-icons/room-previews/307.png",
  "283": "assets/decor-icons/room-previews/283.png",
  "285": "assets/decor-icons/room-previews/285.png",
  "290": "assets/decor-icons/room-previews/290.png",
  "289": "assets/decor-icons/room-previews/289.png",
  "288": "assets/decor-icons/room-previews/288.png",
  "287": "assets/decor-icons/room-previews/287.png"
};

  const MODEL_ICON_OVERRIDES = {
    "28559": { "src": "assets/decor-icons/model-previews/28559.png", "fallbackIconId": 8179967 },
  "27684": {
    "src": "assets/decor-icons/model-previews/27684.png",
    "fallbackIconId": 8168809
  },
  "27220": {
    "src": "assets/decor-icons/model-previews/27220.png",
    "fallbackIconId": 8140918
  },
  "26881": {
    "src": "assets/decor-icons/model-previews/26881.png",
    "fallbackIconId": 8033383
  },
  "28432": {
    "src": "assets/decor-icons/model-previews/28432.png",
    "fallbackIconId": 8179416
  },
  "28557": {
    "src": "assets/decor-icons/model-previews/28557.png",
    "fallbackIconId": 8179729
  },
  "28435": {
    "src": "assets/decor-icons/model-previews/28435.png",
    "fallbackIconId": 8179426
  },
  "28469": {
    "src": "assets/decor-icons/model-previews/28469.png",
    "fallbackIconId": 8148342
  },
  "28470": {
    "src": "assets/decor-icons/model-previews/28470.png",
    "fallbackIconId": 8174647
  },
  "28471": {
    "src": "assets/decor-icons/model-previews/28471.png",
    "fallbackIconId": 8174582
  },
  "28495": {
    "src": "assets/decor-icons/model-previews/28495.png",
    "fallbackIconId": 8148340
  },
  "28319": {
    "src": "assets/decor-icons/model-previews/28319.png",
    "fallbackIconId": 8179514
  },
  "28475": {
    "src": "assets/decor-icons/model-previews/28475.png",
    "fallbackIconId": 8174603
  },
  "28569": {
    "src": "assets/decor-icons/model-previews/28569.png",
    "fallbackIconId": 8179947
  },
  "28482": {
    "src": "assets/decor-icons/model-previews/28482.png",
    "fallbackIconId": 8174631
  },
  "28354": {
    "src": "assets/decor-icons/model-previews/28354.png",
    "fallbackIconId": 8179939
  },
  "28324": {
    "src": "assets/decor-icons/model-previews/28324.png",
    "fallbackIconId": 8179520
  },
  "28326": {
    "src": "assets/decor-icons/model-previews/28326.png",
    "fallbackIconId": 8179860
  },
  "28327": {
    "src": "assets/decor-icons/model-previews/28327.png",
    "fallbackIconId": 8179880
  },
  "28512": {
    "src": "assets/decor-icons/model-previews/28512.png",
    "fallbackIconId": 8148014
  },
  "28556": {
    "src": "assets/decor-icons/model-previews/28556.png",
    "fallbackIconId": 8179725
  },
  "28547": {
    "src": "assets/decor-icons/model-previews/28547.png",
    "fallbackIconId": 8179717
  },
  "28510": {
    "src": "assets/decor-icons/model-previews/28510.png",
    "fallbackIconId": 8148038
  },
  "25325": {
    "src": "assets/decor-icons/model-previews/25325.png",
    "fallbackIconId": 7949065
  },
  "28540": {
    "src": "assets/decor-icons/model-previews/28540.png",
    "fallbackIconId": 8180011
  },
  "28336": {
    "src": "assets/decor-icons/model-previews/28336.png",
    "fallbackIconId": 8179868
  }
};

  window.DecorDict = {
    MODEL_ICON_OVERRIDES, ROOM_ICON_OVERRIDES,
    CURRENCY_NAMES, ITEM_NAMES, TEXTURE_CURRENCY_NAMES,
    CATEGORY_NAMES, CATEGORY_FILTER_ORDER, SUBCATEGORY_NAMES,
    PET_SUBCATEGORY_ID, SIZE_NAMES, QUALITY_NAMES,
    SOURCE_TYPES, EXPANSION_TAGS, RACE_TAGS, COST_TIERS, ENV_OPTIONS,
    PAGE_SIZE: 60, // ⑥ 定案：每页 60 件 + img lazy
  };
})();
