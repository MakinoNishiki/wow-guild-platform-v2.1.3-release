// 任务书 #22 WP2：职业/专精/职责图标集中映射（全站唯一取图处，REQ-069）
// 映射关系照抄 assets/iconMap.json（运营定稿，禁止改名）；本文件由该 JSON 生成，改动请先改 JSON 重新生成。
// 色值 = 13 职业官方色；App/DB 历史命名别名：盗贼→潜行者、刺杀→奇袭（仅追加别名，不改名）。
window.IconMap = (() => {
  const CLASS_COLORS = {
  "战士": "#C79C6E",
  "圣骑士": "#F58CBA",
  "猎人": "#ABD473",
  "潜行者": "#FFF569",
  "牧师": "#FFFFFF",
  "死亡骑士": "#C41F3B",
  "萨满": "#0070DE",
  "法师": "#69CCF0",
  "术士": "#9482C9",
  "武僧": "#00FF96",
  "德鲁伊": "#FF7D0A",
  "恶魔猎手": "#A330C9",
  "唤魔师": "#33937F"
};
  const CLASS_ICONS = {
  "战士": "assets/icons/classes/warrior.png",
  "圣骑士": "assets/icons/classes/paladin.png",
  "猎人": "assets/icons/classes/hunter.png",
  "潜行者": "assets/icons/classes/rogue.png",
  "牧师": "assets/icons/classes/priest.png",
  "死亡骑士": "assets/icons/classes/deathknight.png",
  "萨满": "assets/icons/classes/shaman.png",
  "法师": "assets/icons/classes/mage.png",
  "术士": "assets/icons/classes/warlock.png",
  "武僧": "assets/icons/classes/monk.png",
  "德鲁伊": "assets/icons/classes/druid.png",
  "恶魔猎手": "assets/icons/classes/demonhunter.png",
  "唤魔师": "assets/icons/classes/evoker.png"
};
  const SPEC_ICONS = {
  "战士": {
    "武器": "assets/icons/specs/warrior_arms.png",
    "狂怒": "assets/icons/specs/warrior_fury.png",
    "防护": "assets/icons/specs/warrior_protection.png"
  },
  "圣骑士": {
    "神圣": "assets/icons/specs/paladin_holy.png",
    "防护": "assets/icons/specs/paladin_protection.png",
    "惩戒": "assets/icons/specs/paladin_retribution.png"
  },
  "猎人": {
    "野兽控制": "assets/icons/specs/hunter_beastmastery.png",
    "射击": "assets/icons/specs/hunter_marksmanship.png",
    "生存": "assets/icons/specs/hunter_survival.png"
  },
  "潜行者": {
    "奇袭": "assets/icons/specs/rogue_assassination.png",
    "狂徒": "assets/icons/specs/rogue_outlaw.png",
    "敏锐": "assets/icons/specs/rogue_subtlety.png"
  },
  "牧师": {
    "戒律": "assets/icons/specs/priest_discipline.png",
    "神圣": "assets/icons/specs/priest_holy.png",
    "暗影": "assets/icons/specs/priest_shadow.png"
  },
  "死亡骑士": {
    "鲜血": "assets/icons/specs/deathknight_blood.png",
    "冰霜": "assets/icons/specs/deathknight_frost.png",
    "邪恶": "assets/icons/specs/deathknight_unholy.png"
  },
  "萨满": {
    "元素": "assets/icons/specs/shaman_elemental.png",
    "增强": "assets/icons/specs/shaman_enhancement.png",
    "恢复": "assets/icons/specs/shaman_restoration.png"
  },
  "法师": {
    "奥术": "assets/icons/specs/mage_arcane.png",
    "火焰": "assets/icons/specs/mage_fire.png",
    "冰霜": "assets/icons/specs/mage_frost.png"
  },
  "术士": {
    "痛苦": "assets/icons/specs/warlock_affliction.png",
    "恶魔学识": "assets/icons/specs/warlock_demonology.png",
    "毁灭": "assets/icons/specs/warlock_destruction.png"
  },
  "武僧": {
    "酒仙": "assets/icons/specs/monk_brewmaster.png",
    "织雾": "assets/icons/specs/monk_mistweaver.png",
    "踏风": "assets/icons/specs/monk_windwalker.png"
  },
  "德鲁伊": {
    "平衡": "assets/icons/specs/druid_balance.png",
    "野性": "assets/icons/specs/druid_feral.png",
    "守护": "assets/icons/specs/druid_guardian.png",
    "恢复": "assets/icons/specs/druid_restoration.png"
  },
  "恶魔猎手": {
    "浩劫": "assets/icons/specs/demonhunter_havoc.png",
    "复仇": "assets/icons/specs/demonhunter_vengeance.png",
    "噬灭": "assets/icons/specs/demonhunter_devourer.png"
  },
  "唤魔师": {
    "湮灭": "assets/icons/specs/evoker_devastation.png",
    "恩护": "assets/icons/specs/evoker_preservation.png",
    "增辉": "assets/icons/specs/evoker_augmentation.png"
  }
};
  const ROLE_ICONS = {
  "坦克": "assets/icons/roles/tank.png",
  "治疗": "assets/icons/roles/healer.png",
  "输出": "assets/icons/roles/dps.png"
};
  // 历史命名别名（DB 与全站代码用 盗贼/刺杀；素材映射用官方名 潜行者/奇袭）
  const CLASS_ALIAS = { '盗贼': '潜行者' };
  const SPEC_ALIAS = { '潜行者': { '刺杀': '奇袭' } };

  const canonClass = c => CLASS_ICONS[c] ? c : (CLASS_ALIAS[c] || c);

  // 中文职业名 → 图标路径（无图返回 null，调用方回退文字徽标，不得裂图）
  function classIcon(cnClass) {
    return CLASS_ICONS[cnClass] || CLASS_ICONS[CLASS_ALIAS[cnClass]] || null;
  }
  // 中文职业+专精名 → 图标路径
  function specIcon(cnClass, cnSpec) {
    const cls = canonClass(cnClass);
    const group = SPEC_ICONS[cls];
    if (!group || !cnSpec) return null;
    const spec = group[cnSpec] ? cnSpec : ((SPEC_ALIAS[cls] && SPEC_ALIAS[cls][cnSpec]) || cnSpec);
    return group[spec] || null;
  }
  // 中文职责名 → 图标路径
  function roleIcon(cnRole) {
    return ROLE_ICONS[cnRole] || null;
  }
  // 中文职业名 → 官方色值（图标底色/描边点缀用）
  function classColor(cnClass) {
    return CLASS_COLORS[cnClass] || CLASS_COLORS[CLASS_ALIAS[cnClass]] || null;
  }

  return { classIcon, specIcon, roleIcon, classColor, CLASS_COLORS };
})();
