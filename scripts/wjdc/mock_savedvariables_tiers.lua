WJDCDump = {
	["meta"] = {
		["addon"] = "1.0.9",
		["client"] = "12.0.7",
		["build"] = "68974",
		["interface"] = 120000,
		["time"] = "2026-08-13 21:00:00",
		["type"] = "all",
	},
	["raids"] = {
		{
			["instance"] = "虚影尖塔",
			["bosses"] = {
				{
					["boss"] = "织影者瓦丝琪",
					["loot"] = {
						{
							-- 1.0.7 四档齐全行：lfr/normal/heroic/mythic 四键，值随档递增
							["id"] = 240001,
							["name"] = "织影者头冠",
							["slot"] = "头部",
							["type"] = "布甲",
							["ilvl"] = 250,
							["iconID"] = 463518,
							["primary"] = { "智力" },
							["secondary"] = { "爆击", "急速" },
							["primary_values"] = { ["智力"] = 512 },
							["secondary_values"] = { ["爆击"] = 300, ["急速"] = 100 },
							["primary_tiers"] = {
								["lfr"] = { ["智力"] = 480 },
								["normal"] = { ["智力"] = 512 },
								["heroic"] = { ["智力"] = 544 },
								["mythic"] = { ["智力"] = 576 },
							},
							["secondary_tiers"] = {
								["lfr"] = { ["爆击"] = 280, ["急速"] = 90 },
								["normal"] = { ["爆击"] = 300, ["急速"] = 100 },
								["heroic"] = { ["爆击"] = 320, ["急速"] = 110 },
								["mythic"] = { ["爆击"] = 340, ["急速"] = 120 },
							},
							["effect"] = "装备：你的暗影法术有几率召唤一只织影蛛为你作战。",
						},
						{
							-- 缺档形态：无随机档（不出 lfr 键），只记存在的三档
							["id"] = 240003,
							["name"] = "残响重锤",
							["slot"] = "双手",
							["type"] = "双手锤",
							["ilvl"] = 250,
							["iconID"] = 236317,
							["primary"] = { "力量" },
							["secondary"] = { "精通" },
							["primary_values"] = { ["力量"] = 1234 },
							["secondary_values"] = { ["精通"] = 288 },
							["primary_tiers"] = {
								["normal"] = { ["力量"] = 1234 },
								["heroic"] = { ["力量"] = 1300 },
								["mythic"] = { ["力量"] = 1366 },
							},
							["secondary_tiers"] = {
								["normal"] = { ["精通"] = 288 },
								["heroic"] = { ["精通"] = 305 },
								["mythic"] = { ["精通"] = 322 },
							},
							["effect"] = "使用：敲响残响，震慑周围敌人。（2 分钟冷却）",
						},
						{
							-- 无 tiers 形态（切档 API 不可用回退单档采集/旧格式）：tiers 缺字段 → 转换后留 null 不报错
							["id"] = 240004,
							["name"] = "影纹披风",
							["slot"] = "背部",
							["type"] = "布甲",
							["ilvl"] = 250,
							["iconID"] = 133751,
							["primary"] = { "智力" },
							["secondary"] = { "精通" },
							["primary_values"] = { },
							["secondary_values"] = { },
							["effect"] = "装备：受到的范围伤害降低 3%。",
						},
					},
				},
			},
		},
	},
	["dungeons"] = {
		{
			["instance"] = "梦境裂隙",
			["bosses"] = {
				{
					["boss"] = "裂隙守望者",
					["loot"] = {
						{
							-- 大秘境口径：无四难度，tiers 恒不出现；values 保留为唯一数值口径
							["id"] = 250001,
							["name"] = "守望者指环",
							["slot"] = "手指",
							["type"] = "戒指",
							["ilvl"] = 246,
							["iconID"] = 237274,
							["primary"] = { },
							["secondary"] = { "急速", "全能" },
							["primary_values"] = { },
							["secondary_values"] = { ["急速"] = 176, ["全能"] = 176 },
							["effect"] = "装备：站立不动时每秒恢复 1% 生命值。",
						},
					},
				},
			},
		},
	},
}
