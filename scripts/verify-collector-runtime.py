"""Run the actual Collector in Lua 5.1; mocked game APIs, never live game data.
Requires the existing local test dependency lupa. Run: python scripts/verify-collector-runtime.py
"""
import json
from pathlib import Path
from lupa.lua51 import LuaRuntime

ROOT = Path(__file__).resolve().parents[1]
CORE = (ROOT / 'addon/WoWButlerCollector/core.lua').read_text(encoding='utf-8-sig')
STUB = r'''
now=1000; kind='raid'; inst='Test Raid'; difficultyID=16; ready=true; quality=4; itemClass=4
messages={}; timers={}; SlashCmdList={}; StaticPopupDialogs={}
LOOT_ITEM_SELF='You receive loot: %s.'
LOOT_ITEM_SELF_MULTIPLE='You receive loot: %sx%d.'
LOOT_ITEM='%s receives loot: %s.'
LOOT_ITEM_MULTIPLE='%s receives loot: %sx%d.'
function print(s) table.insert(messages,s) end
function time() return now end
function UnitName() return 'Player' end
function IsInRaid() return true end
function UnitExists() return true end
function UnitIsDeadOrGhost() return true end
function GetInstanceInfo() return inst,kind,difficultyID,'Localized difficulty name' end
function GetDifficultyInfo() return 'Mythic' end
C_Timer={After=function(_,fn) table.insert(timers,fn) end}
function flush() local q=timers; timers={}; for _,fn in ipairs(q) do fn() end end
function info() if not ready then return nil end
 return 'Test Item',nil,quality,100,nil,'Armor',nil,nil,'INVTYPE_HEAD',123,nil,itemClass end
C_Item={GetItemInfo=info,GetDetailedItemLevelInfo=function() return 200 end,
 IsItemBindToAccount=function() return false end, IsItemBindToAccountUntilEquip=function() return false end,
 RequestLoadItemDataByID=function() end}
function CreateFrame()
 local f={RegisterEvent=function() end,SetScript=function(_,_,fn) handler=fn end}
 return f
end
function wipe(t) for k in pairs(t) do t[k]=nil end end
function StaticPopup_Show() end
function loot() handler(nil,'CHAT_MSG_LOOT','You receive loot: |cffa335ee|Hitem:123:0|h[Test Item]|h|r.') end
function boss() handler(nil,'ENCOUNTER_END',1,'Test Boss',16,20,1) end
'''

def runtime(legacy=False):
    lua = LuaRuntime(unpack_returned_tuples=True)
    lua.execute(STUB)
    if legacy:
        lua.execute('GetItemInfo=info; GetDetailedItemLevelInfo=C_Item.GetDetailedItemLevelInfo; C_Item=nil')
    lua.execute(CORE)
    lua.execute("handler(nil,'PLAYER_LOGIN')")
    return lua

def check(script, legacy=False):
    runtime(legacy).execute(script)

cases = {
    'normal heroic mythic remain distinct even for same item at same time': lambda: check("for i,id in ipairs({14,15,16}) do difficultyID=id; loot(); local r=WoWButlerCollectorDB[i]; assert(r.difficultyID==id); assert(r.difficulty==({'普通','英雄','史诗'})[i]) end; assert(#WoWButlerCollectorDB==3)"),
    'legacy normal and heroic map by ID without locale dependence': lambda: check("for i,id in ipairs({3,4,9,5,6}) do difficultyID=id; loot(); assert(WoWButlerCollectorDB[i].difficulty==(i<=3 and '普通' or '英雄')) end"),
    'both LFR IDs ignore self and others without item calls or counters': lambda: check("C_Item.GetItemInfo=function() error('must not query item') end; for _,id in ipairs({7,17}) do difficultyID=id; loot(); handler(nil,'CHAT_MSG_LOOT','Other receives loot: |cffa335ee|Hitem:123:0|h[Test Item]|h|r.'); assert(WBC_Collector.GetState().isLfr) end; local s=WBC_Collector.GetState(); assert(s.count==0 and s.pending==0 and s.failed==0 and #timers==0)"),
    'special unknown and missing difficulties do not fall back to name': lambda: check("for _,id in ipairs({0,33,220,233,250,999}) do difficultyID=id; loot() end; difficultyID=nil; loot(); assert(#WoWButlerCollectorDB==0 and WBC_Collector.GetState().pending==0)"),
    'ignored LFR cannot debounce a subsequent normal loot': lambda: check("difficultyID=17; loot(); difficultyID=14; loot(); assert(#WoWButlerCollectorDB==1 and WoWButlerCollectorDB[1].difficulty=='普通')"),
    'pending normal preserves original difficulty after entering LFR': lambda: check("difficultyID=14; ready=false; loot(); difficultyID=17; ready=true; flush(); local r=WoWButlerCollectorDB[1]; assert(#WoWButlerCollectorDB==1 and r.difficultyID==14 and r.difficulty=='普通'); loot(); assert(#WoWButlerCollectorDB==1)"),
    'other player raid loot records difficulty': lambda: check("difficultyID=15; handler(nil,'CHAT_MSG_LOOT','Other-Realm receives loot: |cffa335ee|Hitem:123:0|h[Test Item]|h|r.'); assert(WoWButlerCollectorDB[1].playerName=='Other' and WoWButlerCollectorDB[1].difficulty=='英雄')"),
    'modern API records actual linked item level': lambda: check('boss(); loot(); assert(#WoWButlerCollectorDB==1); assert(WoWButlerCollectorDB[1].ilvl==200)'),
    'legacy item API without binding proof retains review only': lambda: check('boss(); loot(); for i=1,11 do flush() end; assert(#WoWButlerCollectorDB==1 and WBC_Collector.GetState().exportable==0)', True),
    'cold cache retries with original context': lambda: check("ready=false; boss(); loot(); assert(#WoWButlerCollectorDB==0); now=1020; kind='none'; inst='Outside'; ready=true; flush(); assert(#WoWButlerCollectorDB==1); local r=WoWButlerCollectorDB[1]; assert(r.timestamp==1000 and r.instanceName=='Test Raid' and r.bossName=='Test Boss')"),
    'cold cache timeout is visible and bounded': lambda: check('ready=false; loot(); for i=1,20 do flush() end; assert(#timers==0); assert(#WoWButlerCollectorDB==0); assert(#messages>1)'),
    'no item API warns without crashing': lambda: check('C_Item=nil; loot(); assert(#WoWButlerCollectorDB==0); assert(#messages>1)'),
    'outside raid and uncommon items excluded': lambda: check("kind='party'; loot(); assert(#WoWButlerCollectorDB==0); now=1010; kind='raid'; quality=3; loot(); assert(#WoWButlerCollectorDB==0)"),
    'dead target is not a boss evidence': lambda: check('loot(); assert(#WoWButlerCollectorDB==1); assert(WoWButlerCollectorDB[1].bossName==nil)'),
    'zone change clears boss context': lambda: check("boss(); handler(nil,'ZONE_CHANGED_NEW_AREA'); loot(); assert(WoWButlerCollectorDB[1].bossName==nil)"),
    'duplicate loot callback suppressed': lambda: check('boss(); loot(); loot(); assert(#WoWButlerCollectorDB==1)'),
    'cold duplicate suppressed': lambda: check('ready=false; loot(); loot(); ready=true; flush(); assert(#WoWButlerCollectorDB==1)'),
    'clear cancels pending retry': lambda: check("ready=false; loot(); SlashCmdList.WBC('clear'); StaticPopupDialogs.WBC_CLEAR_CONFIRM.OnAccept(); ready=true; flush(); assert(#WoWButlerCollectorDB==0); loot(); assert(#WoWButlerCollectorDB==1)"),
    'export waits for pending item data': lambda: check("ready=false; loot(); SlashCmdList.WBC('export'); assert(#messages>1 and #WoWButlerCollectorDB==0)"),
    'expired boss window is empty': lambda: check('boss(); now=1181; loot(); assert(WoWButlerCollectorDB[1].bossName==nil)'),
    'consumables excluded': lambda: check('itemClass=0; loot(); assert(#WoWButlerCollectorDB==0)'),
    'saved historical rows retained': lambda: check("WoWButlerCollectorDB[1]={itemName='History'}; loot(); assert(#WoWButlerCollectorDB==2 and WoWButlerCollectorDB[1].itemName=='History')"),
}
if __name__ == '__main__':
    results=[]
    for name, fn in cases.items():
        try:
            fn()
            results.append({'name':name,'ok':True})
        except Exception as e:
            results.append({'name':name,'ok':False,'error':str(e)})
    print(json.dumps(results,ensure_ascii=False,indent=2))
    raise SystemExit(0 if all(r['ok'] for r in results) else 1)
