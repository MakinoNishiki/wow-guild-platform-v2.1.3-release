"""Actual Lua 5.1 runtime, mocked game APIs. Does NOT claim live CN validation."""
from pathlib import Path
import importlib.util
import json
import os
spec = importlib.util.spec_from_file_location('collector_base', Path(__file__).with_name('verify-collector-runtime.py'))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
EVIDENCE = (base.ROOT / 'addon/WoWButlerCollector/evidence.lua').read_text(encoding='utf-8')
def runtime():
    lua = base.runtime()
    lua.execute('''
coreHandler=handler
now=1800000000
function UnitFullName(unit) if unit=='NPC' then return 'Recipient','OtherRealm' else return 'Player','Realm' end end
function GetRealmName() return 'Realm' end
function GetCurrentRegion() return 5 end
local item='|Hitem:123:0|h[Test Item]|h'
history={{lootListID=1,itemHyperlink=item},{lootListID=2,itemHyperlink=item},{lootListID=3,itemHyperlink=item},{lootListID=4,itemHyperlink=item}}
C_LootHistory={GetSortedDropsForEncounter=function()return history end}
ERR_TRADE_COMPLETE='Trade complete.'
function GetTradePlayerItemLink(slot) if slot==1 then return item end end
function GetTradeTargetItemLink() end
function GetTradePlayerItemInfo(slot) if slot==1 then return 'Test Item',1,1,4 end end
function GetTradeTargetItemInfo() end
''')
    lua.execute(EVIDENCE)
    lua.execute('''
evidenceHandler=handler;handler=coreHandler
function fire(ev,...) coreHandler(nil,ev,...);evidenceHandler(nil,ev,...) end
function kill(id) fire('ENCOUNTER_END',id or 1,'Test Boss',16,20,1) end
function trades() local t={} for _,r in ipairs(WoWButlerCollectorSettings.evidence) do if r.kind=='trade' then table.insert(t,r) end end return t end
''')
    return lua
cases = {
 'restored settings own both pickup and evidence sequence': """
WoWButlerCollectorSettings={collectorSourceID='persisted-source',eventSequence=20,enabled=true}
kill();loot(1)
local rows=WoWButlerCollectorDB;local evidence=WBC_Collector.ExportPayload(rows).evidence
assert(#rows==1 and #evidence==4)
for _,e in ipairs(evidence) do assert(e.collectorSourceID==rows[1].collectorSourceID and e.sequence>20) end
assert(rows[1].sourceEventID=='25' and #WoWButlerCollectorSettings.evidence==4)
WBC_Collector.SetEnabled(false);kill(2);assert(#WoWButlerCollectorSettings.evidence==4)
""",
 'observed list remains separate from actual pickups': "kill();assert(#WoWButlerCollectorSettings.evidence==4 and #WoWButlerCollectorDB==0);loot(1);assert(#WoWButlerCollectorDB==1);assert(#WBC_Collector.ExportPayload(WoWButlerCollectorDB).evidence==4)",
 'same observation refresh does not multiply counts': "kill();fire('LOOT_HISTORY_UPDATE_DROP',1,1);assert(#WoWButlerCollectorSettings.evidence==4)",
 'delayed pickup beyond old 180s retains unique original encounter': "kill();now=now+1800;loot(1);local r=WoWButlerCollectorDB[1];assert(r.encounterID==1 and r.bossSource=='observed_history' and r.encounterAt==1800000000)",
 'ambiguous observed bosses never fall back to most recent boss': "kill(1);now=now+600;kill(2);loot();assert(WoWButlerCollectorDB[1].encounterID==nil)",
 'missing history keeps unknown context': "C_LootHistory=nil;kill();now=now+1800;loot();assert(WoWButlerCollectorDB[1].encounterID==nil)",
 'LFR history excluded': "difficultyID=17;kill();assert(#WoWButlerCollectorSettings.evidence==0)",
 'warbound observation marked excluded, pickup not recorded': "C_Item.IsItemBindToAccount=function()return true end;kill();assert(WoWButlerCollectorSettings.evidence[1].bindingStatus=='account');loot();assert(#WoWButlerCollectorDB==0)",
 'successful local trade requires both acceptance and completion message': "kill();loot();fire('TRADE_SHOW');fire('TRADE_ACCEPT_UPDATE',1,1);fire('TRADE_CLOSED');fire('UI_INFO_MESSAGE',1,ERR_TRADE_COMPLETE);assert(#trades()==1 and trades()[1].outcome=='success' and trades()[1].toName=='Recipient');flush();assert(#trades()==1)",
 'closing without success becomes unknown, never assigned': "kill();loot();fire('TRADE_SHOW');fire('TRADE_ACCEPT_UPDATE',1,1);fire('TRADE_CLOSED');flush();assert(#trades()==1 and trades()[1].outcome=='unknown')",
 'cancel records cancellation': "kill();loot();fire('TRADE_SHOW');fire('TRADE_REQUEST_CANCEL');fire('TRADE_CLOSED');flush();assert(#trades()==1 and trades()[1].outcome=='cancelled')",
 'success message without acceptance is not proof': "kill();loot();fire('TRADE_SHOW');fire('UI_INFO_MESSAGE',1,ERR_TRADE_COMPLETE);fire('TRADE_CLOSED');flush();assert(trades()[1].outcome=='unknown')",
 'unrelated item never collected': "fire('TRADE_SHOW');fire('TRADE_ACCEPT_UPDATE',1,1);fire('UI_INFO_MESSAGE',1,ERR_TRADE_COMPLETE);assert(#trades()==0)",
 'pause disables evidence too': "WBC_Collector.SetEnabled(false);kill();fire('TRADE_SHOW');assert(#WoWButlerCollectorSettings.evidence==0)",
 'clear removes evidence and pending history timers': "kill();WBC_Collector.RequestClear();StaticPopupDialogs.WBC_CLEAR_CONFIRM.OnAccept();flush();assert(#WoWButlerCollectorSettings.evidence==0)",
}
results=[]
for name,script in cases.items():
    runtime().execute(script)
    results.append({'name':name,'ok':True})
out=Path(os.environ.get('WB_VERIFY_OUTPUT',base.ROOT/'docs/evidence/req199-20261117'))
out.mkdir(parents=True,exist_ok=True)
(out/'collector-runtime.json').write_text(json.dumps({'environment':'Lua 5.1 with mocked game APIs, not live CN','checks':results},ensure_ascii=False,indent=2),encoding='utf-8')
# Exercise the actual nested JSON encoder and settings controls, not a replacement serializer.
spec2=importlib.util.spec_from_file_location('panel_base',Path(__file__).with_name('verify-collector-panel.py'))
panel=importlib.util.module_from_spec(spec2);spec2.loader.exec_module(panel)
lua=panel.runtime()
lua.execute('savedCore=handler')
lua.execute(EVIDENCE)
lua.execute("""
handler=savedCore
WoWButlerCollectorSettings.evidence={{kind='drop',collectorSourceID='test',sourceEventID='e1',observationKey='d1',sequence=1,itemLink='|Hitem:123:0|h[Test Item]|h',itemID=123,itemName='Test Item',quantity=1,bindingStatus='ordinary'}}
WBC_Collector.RefreshUI()
assert(WoWButlerCollectorExportButton.enabled)
WBC_Collector.Export()
""")
export=lua.eval('WoWButlerExportFrame.editBox.text')
value=json.loads(export)
assert value['schemaVersion']==2 and value['rows']==[] and value['evidence'][0]['itemLink'].startswith('|Hitem:123:')
assert '|' not in export
results.append({'name':'evidence-only export through actual panel and nested JSON encoder','ok':True})
(out/'collector-runtime.json').write_text(json.dumps({'environment':'Lua 5.1 mocked game APIs; actual panel and JSON encoder, not live CN','checks':results},ensure_ascii=False,indent=2),encoding='utf-8')
print('PASS',len(results),'evidence runtime cases')
