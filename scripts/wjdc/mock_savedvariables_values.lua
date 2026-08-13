WJDCDump = {
	["meta"] = {
		["addon"] = "1.0.9",
		["client"] = "12.0.0",
		["build"] = "62001",
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
							-- 新格式标准行：主/副属性数值齐全（GetItemStats 通道形态）
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
							["effect"] = "装备：你的暗影法术有几率召唤一只织影蛛为你作战。",
						},
						{
							-- 新格式但本行无数值（玩具/饰品类形态）：数值字段空表 → 转换后留空不报错
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
						{
							-- tooltip 回退通道形态：数值来自 "+1,234 力量" 行解析（千分位已剥离）
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
							["effect"] = "使用：敲响残响，震慑周围敌人。（2 分钟冷却）",
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
							-- 毒咒行（1.0.9，REQ-110③）：与数值字段并存的组合形态
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
							["venomcurse"] = "毒咒",
						},
					},
				},
			},
		},
	},
}
