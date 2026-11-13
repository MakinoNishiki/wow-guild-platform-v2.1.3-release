"""BUG-117/118: real Collector Lua with synthetic item-link/API fixtures, not live evidence."""
import importlib.util
import json
from pathlib import Path
spec = importlib.util.spec_from_file_location('base', Path(__file__).with_name('verify-collector-runtime.py'))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

CASES = {
 'named color preserves full link and actual level': "C_Item.GetDetailedItemLevelInfo=function(link) assert(string.find(link,'123:0:0:0:90:16',1,true)); return 318 end; handler(nil,'CHAT_MSG_LOOT','You receive loot: |cnIQ4:|Hitem:123:0:0:0:90:16|h[Test Item]|h|r.'); assert(WoWButlerCollectorDB[1].ilvl==318); assert(WoWButlerCollectorDB[1].itemLink)",
 'warbound until equipped excluded': "C_Item.IsItemBindToAccountUntilEquip=function() return true end; loot(); assert(#WoWButlerCollectorDB==0)",
 'account bound excluded': "C_Item.IsItemBindToAccount=function() return true end; loot(); assert(#WoWButlerCollectorDB==0)",
 'tooltip actual level wins over base API value': "C_Item.GetDetailedItemLevelInfo=function() return 219 end; C_TooltipInfo={GetHyperlink=function() return {lines={{type=31,leftText='物品等级 318'}}} end}; loot(); assert(WoWButlerCollectorDB[1].ilvl==318)",
 'no actual level must not export base level': "C_Item.GetDetailedItemLevelInfo=function() return nil end; loot(); for i=1,11 do flush() end; assert(WoWButlerCollectorDB[1].ilvl==nil); assert(WBC_Collector.GetState().exportable==0)",
 'API exceptions retain review record without crashing': "C_Item.GetDetailedItemLevelInfo=function() error('unavailable') end; loot(); for i=1,11 do flush() end; assert(WoWButlerCollectorDB[1].reviewReason); assert(WBC_Collector.GetState().pending==0)",
 'unknown binding held for review': "C_Item.IsItemBindToAccount=nil; C_Item.IsItemBindToAccountUntilEquip=nil; loot(); for i=1,11 do flush() end; assert(WBC_Collector.GetState().exportable==0 and #WoWButlerCollectorDB==1)",
 'tooltip warbound excludes even when API says false': "C_TooltipInfo={GetHyperlink=function() return {lines={{type=20,leftText='装备前战团绑定'},{type=31,leftText='物品等级 305'}}} end}; loot(); assert(#WoWButlerCollectorDB==0)",
 'same ID ordinary drop retained while warbound variant excluded': "C_Item.IsItemBindToAccountUntilEquip=function(link) return string.find(link,':999',1,true)~=nil end; handler(nil,'CHAT_MSG_LOOT','Other receives loot: |cnIQ4:|Hitem:123:999|h[Test Item]|h|r.'); loot(); assert(#WoWButlerCollectorDB==1 and WoWButlerCollectorDB[1].playerName=='Player')",
 'cold tooltip retries then reads actual level': "C_Item.GetDetailedItemLevelInfo=function() return nil end; C_TooltipInfo={GetHyperlink=function() if not detailReady then return nil end; return {lines={{type=31,leftText='Item Level 318'}}} end}; loot(); assert(WBC_Collector.GetState().pending==1); detailReady=true; flush(); assert(WoWButlerCollectorDB[1].ilvl==318 and WBC_Collector.GetState().pending==0)",
}
if __name__ == '__main__':
 results=[]
 for name,case in CASES.items():
  try: base.check(case); results.append({'name':name,'ok':True})
  except Exception as e: results.append({'name':name,'ok':False,'error':str(e)})
 print(json.dumps(results,ensure_ascii=False,indent=2))
 raise SystemExit(0 if all(x['ok'] for x in results) else 1)
