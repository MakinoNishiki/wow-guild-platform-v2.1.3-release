-- sql/38: S2 数据补录 (12.15 补丁) + world_boss_loot 表新建
-- Generated: 2026-10-13 00:36
-- Source: WoWButlerExporter.lua (run_id 20261010-191303, plugin 1.0.19)

-- === 前置说明 ===
-- 1. 本批录入 62 件新掉落 (boss_loot 4 + dungeon_loot 58)
-- 2. 导出 ilvl/values 为模板基底值，非最终掉落值；数值准确性待后续订正
--    参考: data-line-ops.md §3 数值口径铁律
-- 3. world_boss_loot 表为周四巢穴更新预留，本次不插入数据
-- 4. 8 件世界BOSS掉落 (至暗之夜/鲁阿夏尔) 待 world_boss_loot 表启用后补录
-- 5. boss_loot 4 件均为装饰/宠物/外观，ilvl 强制 NULL (与现有装饰项一致)

-- === Rollback ===
-- DELETE FROM boss_loot WHERE official_item_id IN (279112, 280305, 279115, 281227);
-- DELETE FROM dungeon_loot WHERE created_at > '2026-10-13' AND official_item_id IN (273793,273780,273785,273775,273777,273796,273795,251143,251146,251147,251144,251145,251148,250248,251123,271680,251126,251127,251124,251125,250243,251181,251180,251182,251183,251179,251178,250242,251152,251153,251149,251150,251151,251154,250246,251162,251163,251164,251161,251160,251165,250247,251168,251169,251170,251167,251166,251171,250244,251173,251174,251176,251177,251172,251175,250245);
-- DROP TABLE IF EXISTS world_boss_loot;

-- === 1. 新建 world_boss_loot 表 (为周四巢穴/世界BOSS预留) ===
CREATE TABLE IF NOT EXISTS world_boss_loot (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    boss_id UUID REFERENCES game_bosses(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    slot TEXT,
    item_type TEXT,
    official_item_id INTEGER NOT NULL,
    note TEXT,
    effect TEXT,
    primary_stats TEXT[],
    secondary_stats TEXT[],
    primary_values JSONB,
    secondary_values JSONB,
    primary_tiers JSONB,
    secondary_tiers JSONB,
    venomcurse TEXT,
    icon_id INTEGER,
    ilvl INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE world_boss_loot IS '世界BOSS掉落表 (12.15 巢穴/世界BOSS预留)';

-- === 2. boss_loot 插入 (4 件: 潮缚石窟 1 + 烈毒之渊 3) ===
-- 注: 以下 4 件均为装饰/宠物/外观类，ilvl 强制置 NULL (与现有装饰项保持一致)

INSERT INTO boss_loot (boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('420d1f87-5d5e-4fc0-9978-61f5de3e2ef1', '成簇的海星', NULL, '装饰', 279112, NULL, NULL, NULL, NULL, '使用： 将此装饰添加到你的住宅收纳箱中。', NULL, 8033308, NULL);

INSERT INTO boss_loot (boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('d7e60596-dd21-4e86-a735-5a3b13fe029c', '盘魂残骸', NULL, '宠物小伙伴', 280305, NULL, NULL, NULL, NULL, '使用： 教你学会召唤和解散这个伙伴。', NULL, 7558868, NULL);

INSERT INTO boss_loot (boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('d7e60596-dd21-4e86-a735-5a3b13fe029c', '盘魂者的仪式蜡烛', NULL, '装饰', 279115, NULL, NULL, NULL, NULL, '使用： 将此装饰添加到你的住宅收纳箱中。', NULL, 8030633, NULL);

INSERT INTO boss_loot (boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('d7e60596-dd21-4e86-a735-5a3b13fe029c', '盘魂者的鲁希卡面具', '头部', '装饰品', 281227, NULL, NULL, NULL, NULL, '使用：将此外观添加到你的战团收藏中。', NULL, 7558105, NULL);

-- === 3. dungeon_loot 插入 (58 件: 8 个大秘境副本) ===
-- 注: ilvl/values 为导出模板基底值，非最终掉落值，待周四后按 data-line-ops.md §3 订正

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('cd8ed84e-637b-403e-a2f6-360eafc00cdf', '7b759e8a-cb90-4015-a850-a8e7f2e074f4', '多头蛇刺双刃', '单手', '战刃', 273793, '{"敏捷","智力"}', '{"全能","精通"}', '{"智力": 24, "敏捷": 5}'::jsonb, '{"精通": 5, "全能": 4}'::jsonb, NULL, NULL, 7672957, 48);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('cd8ed84e-637b-403e-a2f6-360eafc00cdf', '7b759e8a-cb90-4015-a850-a8e7f2e074f4', '毒液蚀刻新月刃', '单手', '单手斧', 273780, '{"智力"}', '{"爆击","精通"}', '{"智力": 29}'::jsonb, '{"爆击": 5, "精通": 5}'::jsonb, NULL, NULL, 7674304, 48);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('cd8ed84e-637b-403e-a2f6-360eafc00cdf', '7b759e8a-cb90-4015-a850-a8e7f2e074f4', '始源仪式法袍', '胸部', '布甲', 273785, '{"智力"}', '{"急速","精通"}', '{"智力": 10}'::jsonb, '{"急速": 10, "精通": 9}'::jsonb, NULL, NULL, 7874492, 48);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('cd8ed84e-637b-403e-a2f6-360eafc00cdf', '7b759e8a-cb90-4015-a850-a8e7f2e074f4', '多头蛇鳞护腕', '腕部', '锁甲', 273775, '{"敏捷","智力"}', '{"全能","精通"}', '{"敏捷": 5}'::jsonb, '{"精通": 6, "全能": 5}'::jsonb, NULL, NULL, 7871827, 48);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('cd8ed84e-637b-403e-a2f6-360eafc00cdf', '7b759e8a-cb90-4015-a850-a8e7f2e074f4', '防毒踏靴', '脚部', '板甲', 273777, '{"智力","力量"}', '{"急速","全能"}', '{"智力": 7}'::jsonb, '{"急速": 8, "全能": 7}'::jsonb, NULL, NULL, 7876612, 48);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('cd8ed84e-637b-403e-a2f6-360eafc00cdf', '7b759e8a-cb90-4015-a850-a8e7f2e074f4', '一瓶肮脏的烈性毒液', '饰品', '其它', 273796, '{"敏捷","智力","力量"}', NULL, '{"敏捷": 61}'::jsonb, NULL, '使用： 只需小口啜饮这瓶毒液，就能使你的一项随机次要属性提升801，持续15秒。但代价是，随后你的另一项随机次要属性将降低114，同样持续15秒。 （2分钟冷却）', NULL, 7956740, 219);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('cd8ed84e-637b-403e-a2f6-360eafc00cdf', '7b759e8a-cb90-4015-a850-a8e7f2e074f4', '盘卷牙石', '饰品', '其它', 273795, '{"力量"}', NULL, '{"力量": 61}'::jsonb, NULL, '使用： 以你的目标为核心，连续释放出3次涂毒撕咬，总计造成161,467点自然伤害，该伤害将由附近的敌人共同分摊。每额外击中一个敌人，伤害提高30%，最多150%。\r\n （1分钟冷却）', NULL, 7956734, 219);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('8552c60a-e7d6-44ad-a6a9-d1de4d7998bb', '59794ca9-56cd-4947-a27b-db7f1744bf30', '严酷收割手套', '单手', '拳套', 251143, '{"敏捷"}', '{"急速","全能"}', '{"敏捷": 4}'::jsonb, '{"急速": 4, "全能": 3}'::jsonb, NULL, NULL, 7065188, 28);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('8552c60a-e7d6-44ad-a6a9-d1de4d7998bb', '59794ca9-56cd-4947-a27b-db7f1744bf30', '拾荒者护肩', '肩部', '皮甲', 251146, '{"敏捷","智力"}', '{"爆击","全能"}', '{"敏捷": 5}'::jsonb, '{"爆击": 4, "全能": 6}'::jsonb, NULL, NULL, 7232475, 28);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('8552c60a-e7d6-44ad-a6a9-d1de4d7998bb', '59794ca9-56cd-4947-a27b-db7f1744bf30', '囤积丰收裹布', '胸部', '布甲', 251147, '{"智力"}', '{"全能","精通"}', '{"智力": 7}'::jsonb, '{"精通": 9, "全能": 6}'::jsonb, NULL, NULL, 7252745, 28);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('8552c60a-e7d6-44ad-a6a9-d1de4d7998bb', '59794ca9-56cd-4947-a27b-db7f1744bf30', '秋日恩赐腰带', '腰部', '板甲', 251144, '{"智力","力量"}', '{"全能","精通"}', '{"智力": 5}'::jsonb, '{"精通": 6, "全能": 4}'::jsonb, NULL, NULL, 7135731, 28);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('8552c60a-e7d6-44ad-a6a9-d1de4d7998bb', '59794ca9-56cd-4947-a27b-db7f1744bf30', '遗忘部族的护足', '脚部', '锁甲', 251145, '{"敏捷","智力"}', '{"急速","全能"}', '{"敏捷": 5}'::jsonb, '{"急速": 6, "全能": 4}'::jsonb, NULL, NULL, 7259231, 28);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('8552c60a-e7d6-44ad-a6a9-d1de4d7998bb', '59794ca9-56cd-4947-a27b-db7f1744bf30', '窃来的珍贵指环', '手指', '其它', 251148, NULL, '{"爆击","全能"}', NULL, '{"全能": 12, "爆击": 8}'::jsonb, NULL, NULL, 7636660, 28);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('8552c60a-e7d6-44ad-a6a9-d1de4d7998bb', '59794ca9-56cd-4947-a27b-db7f1744bf30', '真菌药剂', '饰品', '其它', 250248, '{"智力"}', NULL, '{"智力": 7}'::jsonb, NULL, '装备： 你获得纳洛拉克的生长恩赐。你的治疗法术和技能有一定几率立即为目标恢复60,315点生命值，并在其附近生成一朵持续10秒的发光蘑菇。\r\n\r\n如果有盟友踩中并吸收蘑菇，将额外恢复34,465点生命值。', NULL, 1029746, 28);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('59b1538b-b10e-49be-bd97-d764887dc6e0', '6981717b-9513-4007-bcc8-80e40cf9bd2e', '咬咬的训练棒', '双手', '法杖', 251123, '{"智力"}', '{"爆击","急速"}', '{"智力": 31}'::jsonb, '{"急速": 6, "爆击": 9}'::jsonb, NULL, NULL, 7287363, 28);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('59b1538b-b10e-49be-bd97-d764887dc6e0', '6981717b-9513-4007-bcc8-80e40cf9bd2e', '罪炽连发枪', '远程', '枪械', 271680, '{"敏捷"}', '{"爆击","全能"}', '{"敏捷": 23}'::jsonb, '{"爆击": 30, "全能": 16}'::jsonb, NULL, NULL, 5342966, 108);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('59b1538b-b10e-49be-bd97-d764887dc6e0', '6981717b-9513-4007-bcc8-80e40cf9bd2e', '诱引巨盔', '头部', '板甲', 251126, '{"智力","力量"}', '{"爆击","精通"}', '{"智力": 7}'::jsonb, '{"爆击": 5, "精通": 9}'::jsonb, NULL, NULL, 7135737, 28);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('59b1538b-b10e-49be-bd97-d764887dc6e0', '6981717b-9513-4007-bcc8-80e40cf9bd2e', '啃咬之护臂', '腕部', '布甲', 251127, '{"智力"}', '{"爆击","急速"}', '{"智力": 4}'::jsonb, '{"急速": 5, "爆击": 3}'::jsonb, NULL, NULL, 7252743, 28);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('59b1538b-b10e-49be-bd97-d764887dc6e0', '6981717b-9513-4007-bcc8-80e40cf9bd2e', '狂热防御护手', '手部', '皮甲', 251124, '{"敏捷","智力"}', '{"爆击","急速"}', '{"敏捷": 5}'::jsonb, '{"急速": 4, "爆击": 7}'::jsonb, NULL, NULL, 7232472, 28);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('59b1538b-b10e-49be-bd97-d764887dc6e0', '6981717b-9513-4007-bcc8-80e40cf9bd2e', '邪能浸透之靴', '脚部', '锁甲', 251125, '{"敏捷","智力"}', '{"爆击","全能"}', '{"敏捷": 5}'::jsonb, '{"爆击": 4, "全能": 7}'::jsonb, NULL, NULL, 7259231, 28);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('59b1538b-b10e-49be-bd97-d764887dc6e0', '6981717b-9513-4007-bcc8-80e40cf9bd2e', '魔力之心的联结烈焰', '饰品', '其它', 250243, '{"敏捷","力量"}', NULL, '{"敏捷": 7}'::jsonb, NULL, '使用： 形成邪能护盾，持续10秒，吸收接下来受到伤害的30%，最高196,649点。护盾存在期间，被吸收伤害的一部分将储存为不稳定的邪能。\r\n\r\n护盾效果结束或破碎时，能量会产生爆发并对附近敌人造成火焰伤害，由这些敌人均摊。 （1分钟 30秒冷却）', NULL, 841218, 28);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('382ea60c-0354-405d-bb2a-c7699f68f815', 'c65d393d-1dba-41eb-86b2-adf11a28c9a8', '剪枝长矛', '双手', '长柄武器', 251181, '{"力量"}', '{"急速","全能"}', '{"力量": 7}'::jsonb, '{"急速": 8, "全能": 6}'::jsonb, NULL, NULL, 7117445, 28);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('382ea60c-0354-405d-bb2a-c7699f68f815', 'c65d393d-1dba-41eb-86b2-adf11a28c9a8', '荆棘之刃', '单手', '匕首', 251180, '{"敏捷"}', '{"急速","精通"}', '{"敏捷": 4}'::jsonb, '{"急速": 3, "精通": 4}'::jsonb, NULL, NULL, 7012521, 28);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('382ea60c-0354-405d-bb2a-c7699f68f815', 'c65d393d-1dba-41eb-86b2-adf11a28c9a8', '铁根肩甲', '肩部', '锁甲', 251184, '{"敏捷","智力"}', '{"急速","全能"}', '{"敏捷": 5}'::jsonb, '{"急速": 7, "全能": 4}'::jsonb, NULL, NULL, 7259238, 28);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('382ea60c-0354-405d-bb2a-c7699f68f815', 'c65d393d-1dba-41eb-86b2-adf11a28c9a8', '护根者束腕', '腕部', '皮甲', 251183, '{"敏捷","智力"}', '{"爆击","精通"}', '{"敏捷": 4}'::jsonb, '{"爆击": 5, "精通": 3}'::jsonb, NULL, NULL, 7232469, 28);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('382ea60c-0354-405d-bb2a-c7699f68f815', 'c65d393d-1dba-41eb-86b2-adf11a28c9a8', '光绽围腰', '腰部', '布甲', 251185, '{"智力"}', '{"急速","精通"}', '{"智力": 5}'::jsonb, '{"急速": 4, "精通": 6}'::jsonb, NULL, NULL, 7252741, 28);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('382ea60c-0354-405d-bb2a-c7699f68f815', 'c65d393d-1dba-41eb-86b2-adf11a28c9a8', '磐石马裤', '腿部', '板甲', 251182, '{"智力","力量"}', '{"爆击","全能"}', '{"智力": 7}'::jsonb, '{"爆击": 9, "全能": 6}'::jsonb, NULL, NULL, 7135738, 28);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('382ea60c-0354-405d-bb2a-c7699f68f815', 'c65d393d-1dba-41eb-86b2-adf11a28c9a8', '光耀希望之种', '饰品', '其它', 250254, '{"智力"}', NULL, '{"智力": 7}'::jsonb, NULL, '使用： 用光明之花环绕你的友方目标，在12秒内为其恢复157,209点生命值。\r\n\r\n如果目标生命值低于50%，光明之花会在绚烂光芒中完全绽放，立即为其恢复176,883点生命值。 （1分钟冷却）', NULL, 7578262, 28);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('c2870219-2c78-4a54-a8fb-62fe7bc23ea2', '8b3be6aa-c10d-48e0-8da7-46476b904d1b', '塔兹拉尔寰宇之锋', '单手', '单手剑', 251218, '{"力量"}', '{"急速","精通"}', '{"力量": 4}'::jsonb, '{"急速": 4, "精通": 3}'::jsonb, NULL, NULL, 6994479, 28);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('c2870219-2c78-4a54-a8fb-62fe7bc23ea2', '8b3be6aa-c10d-48e0-8da7-46476b904d1b', '虚痕王冠', '头部', '锁甲', 251220, '{"敏捷","智力"}', '{"急速","精通"}', '{"敏捷": 7}'::jsonb, '{"急速": 9, "精通": 5}'::jsonb, NULL, NULL, 7259236, 28);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('c2870219-2c78-4a54-a8fb-62fe7bc23ea2', '8b3be6aa-c10d-48e0-8da7-46476b904d1b', '无光肩甲', '肩部', '皮甲', 251223, '{"敏捷","智力"}', '{"爆击","急速"}', '{"敏捷": 5}'::jsonb, '{"急速": 4, "爆击": 7}'::jsonb, NULL, NULL, 7232475, 28);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('c2870219-2c78-4a54-a8fb-62fe7bc23ea2', '8b3be6aa-c10d-48e0-8da7-46476b904d1b', '凄惶手铠', '手部', '板甲', 251221, '{"智力","力量"}', '{"全能","精通"}', '{"智力": 5}'::jsonb, '{"精通": 4, "全能": 6}'::jsonb, NULL, NULL, 7135736, 28);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('c2870219-2c78-4a54-a8fb-62fe7bc23ea2', '8b3be6aa-c10d-48e0-8da7-46476b904d1b', '虚灵冥界腰带', '腰部', '布甲', 251222, '{"智力"}', '{"爆击","急速"}', '{"智力": 5}'::jsonb, '{"急速": 7, "爆击": 4}'::jsonb, NULL, NULL, 7252741, 28);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('c2870219-2c78-4a54-a8fb-62fe7bc23ea2', '8b3be6aa-c10d-48e0-8da7-46476b904d1b', '裂隙践踏靴', '脚部', '布甲', 251219, '{"智力"}', '{"爆击","急速"}', '{"智力": 5}'::jsonb, '{"急速": 6, "爆击": 4}'::jsonb, NULL, NULL, 7252742, 28);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('c2870219-2c78-4a54-a8fb-62fe7bc23ea2', '8b3be6aa-c10d-48e0-8da7-46476b904d1b', '虚空处刑指令', '饰品', '其它', 250225, '{"敏捷"}', NULL, '{"敏捷": 7}'::jsonb, NULL, '使用： 标记处刑目标，使你的急速提高286，持续20秒。当目标被标记时，虚空驱使你消灭目标，每次对其攻击都会额外获得20爆击，最高可获得307爆击。 （2分钟冷却）', NULL, 2178828, 28);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('e3bd8f1f-7611-40d0-a3cb-4b0e0ea6ee9c', '4f46a5fe-caec-46ae-8f08-0945d702b835', '金色风蛇之牙', '单手', '匕首', 159137, '{"智力"}', '{"急速","全能"}', '{"智力": 17}'::jsonb, '{"急速": 3, "全能": 3}'::jsonb, NULL, NULL, 1851453, 19);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('e3bd8f1f-7611-40d0-a3cb-4b0e0ea6ee9c', '4f46a5fe-caec-46ae-8f08-0945d702b835', '鸟类守护者手套', '手部', '板甲', 159413, '{"智力","力量"}', '{"爆击","精通"}', '{"智力": 4}'::jsonb, '{"爆击": 3, "精通": 6}'::jsonb, NULL, NULL, 2019431, 19);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('e3bd8f1f-7611-40d0-a3cb-4b0e0ea6ee9c', '4f46a5fe-caec-46ae-8f08-0945d702b835', '圣金古墓腰带', '腰部', '锁甲', 159369, '{"敏捷","智力"}', '{"急速","全能"}', '{"敏捷": 4}'::jsonb, '{"急速": 4, "全能": 5}'::jsonb, NULL, NULL, 2054853, 19);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('e3bd8f1f-7611-40d0-a3cb-4b0e0ea6ee9c', '4f46a5fe-caec-46ae-8f08-0945d702b835', '神圣大厅马裤', '腿部', '皮甲', 159313, '{"敏捷","智力"}', '{"急速","全能"}', '{"敏捷": 6}'::jsonb, '{"急速": 5, "全能": 7}'::jsonb, NULL, NULL, 1892759, 19);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('e3bd8f1f-7611-40d0-a3cb-4b0e0ea6ee9c', '4f46a5fe-caec-46ae-8f08-0945d702b835', '绒线护腿', '腿部', '布甲', 159234, '{"智力"}', '{"爆击","精通"}', '{"智力": 6}'::jsonb, '{"爆击": 7, "精通": 5}'::jsonb, NULL, NULL, 1875084, 19);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('e3bd8f1f-7611-40d0-a3cb-4b0e0ea6ee9c', '4f46a5fe-caec-46ae-8f08-0945d702b835', '金泥践踏者', '脚部', '板甲', 159412, '{"智力","力量"}', '{"爆击","全能"}', '{"智力": 4}'::jsonb, '{"爆击": 4, "全能": 5}'::jsonb, NULL, NULL, 2001429, 19);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('e3bd8f1f-7611-40d0-a3cb-4b0e0ea6ee9c', '4f46a5fe-caec-46ae-8f08-0945d702b835', '金羽长靴', '脚部', '皮甲', 159304, '{"敏捷","智力"}', '{"全能","精通"}', '{"敏捷": 4}'::jsonb, '{"精通": 4, "全能": 5}'::jsonb, NULL, NULL, 1892754, 19);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('e3bd8f1f-7611-40d0-a3cb-4b0e0ea6ee9c', '4f46a5fe-caec-46ae-8f08-0945d702b835', '金辉飞羽', '饰品', '其它', 159617, '{"敏捷"}', NULL, '{"敏捷": 6}'::jsonb, NULL, '使用： 你的动作闪烁着金色的羽毛，使你的全能提高572，持续20秒。 （2分钟冷却）', NULL, 2103819, 19);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('679d557e-07f8-47ee-ad2c-10ee45494751', 'e13bc107-0c24-4283-89e2-09863f22dffc', '寒妆的注能法杖', '双手', '法杖', 193761, '{"智力"}', '{"爆击","精通"}', '{"智力": 48}'::jsonb, '{"爆击": 13, "精通": 8}'::jsonb, NULL, NULL, 4420063, 53);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('679d557e-07f8-47ee-ad2c-10ee45494751', 'e13bc107-0c24-4283-89e2-09863f22dffc', '征服者的寒冰之握', '手部', '皮甲', 193758, '{"敏捷","智力"}', '{"爆击","全能"}', '{"敏捷": 8}'::jsonb, '{"爆击": 9, "全能": 7}'::jsonb, NULL, NULL, 4095089, 53);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('679d557e-07f8-47ee-ad2c-10ee45494751', 'e13bc107-0c24-4283-89e2-09863f22dffc', '护卵者的护腿', '腿部', '锁甲', 193759, '{"敏捷","智力"}', '{"急速","全能"}', '{"敏捷": 11}'::jsonb, '{"急速": 8, "全能": 13}'::jsonb, NULL, NULL, 4326061, 53);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('679d557e-07f8-47ee-ad2c-10ee45494751', 'e13bc107-0c24-4283-89e2-09863f22dffc', '鳞卫的坚贞重靴', '脚部', '板甲', 193728, '{"智力","力量"}', '{"全能","精通"}', '{"智力": 8}'::jsonb, '{"精通": 6, "全能": 10}'::jsonb, NULL, NULL, 4633272, 53);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('679d557e-07f8-47ee-ad2c-10ee45494751', 'e13bc107-0c24-4283-89e2-09863f22dffc', '红玉雏龙蛋壳', '饰品', '其它', 193757, '{"敏捷","智力","力量"}', NULL, '{"敏捷": 10}'::jsonb, NULL, '装备： 你的法术和技能有一定几率召唤一只红玉雏龙，它会尝试帮助你并协助你战斗。\r\n\r\n', NULL, 4509422, 53);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('cb60903d-0f61-467b-948c-affa720baea3', 'dc1c1a2a-c1b3-474f-a38d-28bb525b5bed', '连击大戟', '双手', '长柄武器', 158370, '{"敏捷"}', '{"爆击","急速"}', '{"敏捷": 6}'::jsonb, '{"急速": 7, "爆击": 5}'::jsonb, NULL, NULL, 1661206, 19);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('cb60903d-0f61-467b-948c-affa720baea3', 'dc1c1a2a-c1b3-474f-a38d-28bb525b5bed', '闪电曲蛇法杖', '双手', '法杖', 159636, '{"智力"}', '{"急速","精通"}', '{"智力": 26}'::jsonb, '{"急速": 7, "精通": 5}'::jsonb, NULL, NULL, 1881363, 19);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('cb60903d-0f61-467b-948c-affa720baea3', 'dc1c1a2a-c1b3-474f-a38d-28bb525b5bed', '电弧琉璃护腕', '腕部', '锁甲', 159380, '{"敏捷","智力"}', '{"爆击","急速"}', '{"敏捷": 3}'::jsonb, '{"急速": 3, "爆击": 4}'::jsonb, NULL, NULL, 2054951, 19);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('cb60903d-0f61-467b-948c-affa720baea3', 'dc1c1a2a-c1b3-474f-a38d-28bb525b5bed', '蜿蜒洪流裹腕', '腕部', '布甲', 159263, '{"智力"}', '{"爆击","全能"}', '{"智力": 3}'::jsonb, '{"爆击": 4, "全能": 3}'::jsonb, NULL, NULL, 1875080, 19);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('cb60903d-0f61-467b-948c-affa720baea3', 'dc1c1a2a-c1b3-474f-a38d-28bb525b5bed', '裂尖臂甲', '腕部', '板甲', 159425, '{"智力","力量"}', '{"急速","全能"}', '{"智力": 3}'::jsonb, '{"急速": 3, "全能": 4}'::jsonb, NULL, NULL, 2001432, 19);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('cb60903d-0f61-467b-948c-affa720baea3', 'dc1c1a2a-c1b3-474f-a38d-28bb525b5bed', '旋风苦修者腰带', '腰部', '皮甲', 159317, '{"敏捷","智力"}', '{"急速","精通"}', '{"敏捷": 4}'::jsonb, '{"急速": 3, "精通": 5}'::jsonb, NULL, NULL, 1892753, 19);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('cb60903d-0f61-467b-948c-affa720baea3', 'dc1c1a2a-c1b3-474f-a38d-28bb525b5bed', '充能二元腿铠', '腿部', '板甲', 159435, '{"智力","力量"}', '{"爆击","全能"}', '{"智力": 6}'::jsonb, '{"爆击": 4, "全能": 7}'::jsonb, NULL, NULL, 2019433, 19);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('cb60903d-0f61-467b-948c-affa720baea3', 'dc1c1a2a-c1b3-474f-a38d-28bb525b5bed', '御风蝰蛇护腿', '腿部', '皮甲', 159329, '{"敏捷","智力"}', '{"全能","精通"}', '{"敏捷": 6}'::jsonb, '{"精通": 6, "全能": 5}'::jsonb, NULL, NULL, 1892759, 19);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('cb60903d-0f61-467b-948c-affa720baea3', 'dc1c1a2a-c1b3-474f-a38d-28bb525b5bed', '卷沙软鞋', '脚部', '布甲', 159259, '{"智力"}', '{"爆击","急速"}', '{"智力": 4}'::jsonb, '{"急速": 3, "爆击": 5}'::jsonb, NULL, NULL, 1875079, 19);

INSERT INTO dungeon_loot (dungeon_id, boss_id, item_name, slot, item_type, official_item_id, primary_stats, secondary_stats, primary_values, secondary_values, effect, venomcurse, icon_id, ilvl)
VALUES ('cb60903d-0f61-467b-948c-affa720baea3', 'dc1c1a2a-c1b3-474f-a38d-28bb525b5bed', '闪光能量战靴', '脚部', '锁甲', 159388, '{"敏捷","智力"}', '{"爆击","精通"}', '{"敏捷": 4}'::jsonb, '{"爆击": 4, "精通": 5}'::jsonb, NULL, NULL, 2054950, 19);

-- === 4. 刷新 schema 缓存 ===
NOTIFY pgrst, 'reload schema';
