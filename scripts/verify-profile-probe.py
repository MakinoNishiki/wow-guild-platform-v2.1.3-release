"""Read-only probe regression in a mocked Lua 5.1 runtime; not real game acceptance."""
from pathlib import Path
from lupa.lua51 import LuaRuntime

ROOT = Path(__file__).resolve().parents[1]
lua = LuaRuntime(unpack_returned_tuples=True)
lua.execute(r'''
timers={}; messages={}; SlashCmdList={}; now=1000; combat=false; equipmentID=123
DEFAULT_CHAT_FRAME={AddMessage=function(_,s) table.insert(messages,s) end}
C_Timer={After=function(_,fn) table.insert(timers,fn) end}
function flush() local q=timers; timers={}; for _,fn in ipairs(q) do fn() end end
function CreateFrame() frame={RegisterEvent=function() end,SetScript=function(_,_,fn) event=fn end}; return frame end
function time() return now end
function InCombatLockdown() return combat end
function GetBuildInfo() return '12.1.5','70783','date',120105 end
function GetLocale() return 'zhCN' end
function UnitName() return 'TestPlayer' end
function GetRealmName() return 'TestRealm' end
function GetCurrentRegion() return 5 end
function UnitClass() return 'Warrior','WARRIOR',1 end
function UnitRace() return 'Human','Human',1 end
function UnitSex() return 2 end
function UnitLevel() return 90 end
function GetSpecialization() return 1 end
function GetSpecializationInfo() return 71,'Arms' end
function GetAverageItemLevel() return 350,344 end
function GetInventoryItemID(_,slot) if slot==1 then return equipmentID end end
function GetInventoryItemLink(_,slot) if slot==1 then return 'item:'..equipmentID end end
C_Item={GetDetailedItemLevelInfo=function() return 344,219,219 end,GetItemInfo=function() return 'TestItem' end}
C_PlayerInfo={GetPlayerMythicPlusRatingSummary=function() return {currentSeasonScore=2000,runs={{challengeModeID=1,bestRunLevel=10,finishedSuccess=true}}} end}
C_MythicPlus={GetCurrentSeason=function() return 20 end,RequestMapInfo=function() end}
function RequestRaidInfo() event() end
function GetNumSavedInstances() return 1 end
function GetSavedInstanceInfo() return 'TestRaid',42,500,16,true,false,0,true,20,'Mythic',8,7 end
function GetSavedInstanceEncounterInfo(_,i) return 'Boss'..i,1,i<=7 end
C_HousingCatalog={CreateCatalogSearcher=function() return {
 SetSearchText=function() end,RunSearch=function() end,
 GetCatalogSearchResults=function() return {{recordID=1,entryType=1},{recordID=1,entryType=1},{recordID=2,entryType=1}} end
} end,GetCatalogEntryInfo=function(e) return {name='Decor'..e.recordID,totalNumStored=0,totalNumPlaced=2,remainingRedeemable=1} end}
''')
lua.execute((ROOT / 'addon/WoWButlerProfileProbe/core.lua').read_text(encoding='utf-8'))
lua.execute(r'''
assert(WoWButlerProfileProbeDB==nil) -- never collect merely by loading
combat=true; SlashCmdList.WBPROFILEPROBE(); assert(#timers==0)
combat=false; SlashCmdList.WBPROFILEPROBE(); SlashCmdList.WBPROFILEPROBE(); assert(#timers==1)
assert(WoWButlerProfileProbeDB==nil) -- not falsely persisted while pending
flush(); local a=WoWButlerProfileProbeDB.latest
assert(a.identity.name=='TestPlayer' and a.identity.region==5)
assert(#a.equipment==19 and a.equipment[1].actualItemLevel==344)
assert(a.equipment[2].state=='empty_or_unavailable')
assert(a.mythicPlus.currentSeasonScore==2000 and #a.mythicPlus.runs==1)
assert(a.raidLockouts.serverUpdateReceived and a.raidLockouts.rows[1].killed==7)
assert(#a.raidLockouts.rows[1].bosses==8)
assert(#a.housing.entries==2 and a.housing.entries[1].totalNumStored==0)
assert(a.searcher==nil)
equipmentID=456; now=2000; C_PlayerInfo=nil; C_HousingCatalog=nil
GetCurrentRegion=nil; C_Item.GetDetailedItemLevelInfo=function() error('not loaded') end
SlashCmdList.WBPROFILEPROBE(); flush(); local b=WoWButlerProfileProbeDB.latest
assert(WoWButlerProfileProbeDB.previous==a and a.equipment[1].itemID==123)
assert(b.equipment[1].itemID==456 and b.equipment[1].actualItemLevel==nil)
assert(b.equipment[1].state=='pending_item_data')
assert(b.identity.region==nil and b.mythicPlus.currentSeasonScore==nil)
assert(b.housing.state=='unknown' and b.diagnostics.GetCurrentRegion=='unavailable')
-- A protected value must never escape into SavedVariables or be compared/formatted.
secret={}; function issecretvalue(v) return v==secret end
function UnitName() return secret end
SlashCmdList.WBPROFILEPROBE(); flush(); assert(WoWButlerProfileProbeDB.latest.identity.name==nil)
assert(WoWButlerProfileProbeDB.previous==b)
''')
print('PASS: manual trigger, combat guard, concurrency, actual ilvl, weekly scope, housing dedup, missing APIs, failed reads, bounded snapshots, secret-value omission (mock APIs only).')
