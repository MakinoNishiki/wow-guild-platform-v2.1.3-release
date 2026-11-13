"""REQ191 actual Lua 5.1 with synthetic game API; does not touch installed addon or SavedVariables."""
import importlib.util
import json
from pathlib import Path
spec = importlib.util.spec_from_file_location('base', Path(__file__).with_name('verify-collector-runtime.py'))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
cases = {
    'stable source and monotonic events across clear': "loot(1); local a=WoWButlerCollectorDB[1]; local source=a.collectorSourceID; local event=a.sourceEventID; SlashCmdList.WBC('clear'); StaticPopupDialogs.WBC_CLEAR_CONFIRM.OnAccept(); loot(2); local b=WoWButlerCollectorDB[1]; assert(source==b.collectorSourceID and event~=b.sourceEventID)",
    'two real chat lines within same second survive': "loot(1); loot(2); assert(#WoWButlerCollectorDB==2)",
    'no line identity does not guess duplicate': "loot(); loot(); assert(#WoWButlerCollectorDB==2)",
    'repeated native line identity suppressed': "loot(1); loot(1); assert(#WoWButlerCollectorDB==1)",
    'explicit cross realm preserved': "handler(nil,'CHAT_MSG_LOOT','Other-OtherRealm receives loot: |Hitem:123:0|h[Test Item]|h.'); local r=WoWButlerCollectorDB[1]; assert(r.playerName=='Other' and r.playerServer=='OtherRealm')",
    'unknown other realm remains missing': "handler(nil,'CHAT_MSG_LOOT','Other receives loot: |Hitem:123:0|h[Test Item]|h.'); assert(WoWButlerCollectorDB[1].playerServer==nil)",
    'own realm and region captured': "GetRealmName=function() return 'Realm' end; GetCurrentRegion=function() return 5 end; loot(); assert(WoWButlerCollectorDB[1].playerServer=='Realm' and WoWButlerCollectorDB[1].playerRegion=='5')",
    'multiple count retained': "handler(nil,'CHAT_MSG_LOOT','You receive loot: |Hitem:123:0|h[Test Item]|hx2.'); assert(WoWButlerCollectorDB[1].quantity==2)",
    'encounter context frozen before async completion': "boss(); ready=false; loot(); handler(nil,'ENCOUNTER_START'); ready=true; flush(); assert(WoWButlerCollectorDB[1].encounterID==1 and WoWButlerCollectorDB[1].encounterAt==1000)",
    'source persists on Lua reload': "loot(1); savedSource=WoWButlerCollectorSettings.collectorSourceID; savedEvent=WoWButlerCollectorDB[1].sourceEventID",
}
results=[]
for name,case in cases.items():
    try:
        lua=base.runtime();lua.execute(case)
        if name=='source persists on Lua reload':
            lua.execute(base.CORE);lua.execute("handler(nil,'PLAYER_LOGIN'); loot(2); assert(WoWButlerCollectorDB[2].collectorSourceID==savedSource and WoWButlerCollectorDB[2].sourceEventID~=savedEvent)")
        results.append({'name':name,'ok':True})
    except Exception as exc: results.append({'name':name,'ok':False,'error':str(exc)})
print(json.dumps({'environment':'Lua 5.1, mocked APIs, not live game','results':results},ensure_ascii=False,indent=2))
raise SystemExit(0 if all(r['ok'] for r in results) else 1)
