"""Run the installed addon's event path with synthetic merchant responses."""
from pathlib import Path

from lupa.lua51 import LuaRuntime

root = Path(__file__).resolve().parents[2]
lua = LuaRuntime()
lua.execute("""
SlashCmdList, messages, timers, rows = {}, {}, {}, {}
DEFAULT_CHAT_FRAME = {AddMessage = function(_, msg) table.insert(messages, msg) end}
function CreateFrame()
    return {RegisterEvent = function() end, SetScript = function(_, _, fn) dispatch = fn end}
end
C_Timer = {After = function(_, fn) table.insert(timers, fn) end}
function tick() table.remove(timers, 1)() end
function flush() while #timers > 0 do tick() end end
function event(name) dispatch(nil, name) end
function UnitGUID() return "Creature-0-1-2-3-" .. npc .. "-abcdef" end
function UnitName() return "Test merchant " .. npc end
function GetLocale() return "zhCN" end
function GetCurrentRegion() return 5 end
function GetBuildInfo() return "12.1.5", "70961", "", 120105 end
function GetTime() return 0 end
time = function() return 42 end
date = function() return "fixture" end
function GetMerchantNumItems() return #rows end
function GetMerchantItemID(i) return rows[i].id end
C_MerchantFrame = {GetItemInfo = function(i) return rows[i].info end}
function GetMerchantItemCostInfo(i) return #rows[i].cost end
function GetMerchantItemCostItem(i,j) return unpack(rows[i].cost[j]) end
function row(id, amount)
    return {id = id, info = {price = 0, name = "Test plan", stackCount = 1, hasExtendedCost = true},
            cost = {{1, amount, "|Hcurrency:3363|h[voucher]|h", "voucher"}}}
end
WoWButlerDecorDB = {totalCount = 2335}
""")
lua.execute((root / "addon/WoWButlerDecor/WoWButlerDecor.lua").read_text(encoding="utf-8-sig"))
lua.execute("""
npc, rows = 12345, {row(272997, 63)}
event("MERCHANT_SHOW"); flush()
assert(not WoWButlerDecorDB.roomVendors and #messages == 0)
event("MERCHANT_CLOSED")
npc, rows = 255104, {row(272997, 63), row(123, 200), row(274667, 71)}
rows[3].cost = {}
event("MERCHANT_SHOW"); tick()
local vendors = WoWButlerDecorDB.roomVendors
local merchant = vendors[npc]
assert(WoWButlerDecorDB.totalCount == 2335 and merchant.region == 5 and merchant.build == "70961")
local offer = merchant.offers[272997]
assert(offer.at == 42 and offer.stackCount == 1 and offer.copper == 0)
assert(offer.costs[1].id == 3363 and offer.costs[1].kind == "currency" and offer.costs[1].amount == 63)
assert(not merchant.offers[123] and not merchant.offers[274667])
rows[3] = row(274667, 71); flush()
assert(merchant.offers[274667].costs[1].amount == 71)
rows = {row(272997, 67)}
event("MERCHANT_UPDATE"); flush()
assert(merchant.offers[272997].costs[1].amount == 67 and merchant.offers[274667])
rows = {row(274674, 81)}; event("MERCHANT_UPDATE"); event("MERCHANT_CLOSED"); flush()
assert(not merchant.offers[274674])
npc = 257295
rows[1].info.price = 120
rows[1].cost[2] = {1, 2, "|Hitem:333|h[wood]|h"}
event("MERCHANT_SHOW"); flush()
assert(vendors[npc].offers[274674].costs[2].id == 333 and vendors[npc].offers[274674].copper == 120)
assert(vendors[255104].offers[272997] and not vendors[npc].offers[272997])
event("MERCHANT_CLOSED"); SlashCmdList.WBD("scan")
assert(WoWButlerDecorDB.roomVendors == vendors)
""")
print("OK: merchant capture, delayed data, mixed costs, filters, stored catalogue and closed shops")
