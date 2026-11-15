"""Exercise actual Lua export, then model display-link stripping during copy.
Not a real WoW clipboard test. Website normalizer is invoked on decoded output.
"""
import importlib.util,json,re,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('panel',ROOT/'scripts/verify-collector-panel.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
lua=p.runtime();lua.execute('loot()')
row=lua.globals().WoWButlerCollectorDB[1]
row.captureVersion='1.0.4'
row.timestamp=1794746504
row.encounterAt=1794746500
row.itemName='娴嬭瘯"鍚嶇О\\鏂囧瓧'
row.itemLink='|Hitem:'+str(int(row.itemID))+':0:0:0:0:0:0:0:90:0:0:0:1:12345|h['+row.itemName+']|h'
original=row.itemLink
lua.execute('click(WoWButlerCollectorExportButton)')
raw=lua.globals().WoWButlerExportFrame.editBox.text
copied=re.sub(r'\|H[^|]+\|h(.*?)\|h',r'\1',raw)
decoded=json.loads(copied)
assert decoded[0]['itemLink']==original,'WoW hyperlink rendering loses item payload during copy'
assert '|Hitem:' not in raw,'Export must not contain interpretable markup'
assert decoded[0]['itemName']==row.itemName
assert row.itemLink==original,'Stored source must remain unchanged'
result=subprocess.run(['node','-e',"const n=require('./lib/lootObservationRoutes.cjs').normalize;let s='';process.stdin.on('data',b=>s+=b).on('end',()=>{n(JSON.parse(s)[0]);console.log('website accepts restored exact link')})"],input=copied,text=True,cwd=ROOT,capture_output=True)
assert result.returncode==0,result.stderr
print('PASS: actual Lua export -> modeled copy -> JSON roundtrip -> real website normalizer; old 1.0.4 row preserved')
