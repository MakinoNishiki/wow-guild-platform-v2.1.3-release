"""REQ-176: build evidence-backed room sources offline; do not execute SQL."""
import json
from pathlib import Path
from build_task83_sources import literal

ROOT=Path(__file__).resolve().parents[2]
ARTICLE='https://worldofwarcraft.blizzard.com/en-gb/news/24295382'
HOTFIX='https://worldofwarcraft.blizzard.com/en-us/news/24287397/hotfixes-july-7-2026'
SHOP='https://worldofwarcraft.blizzard.com/en-us/news/24303011'
PRICED50={287,288,289,290,132,151,294,283,285,286,307,277,281,282}
UNPRICED={292,273}
BARNS={400,401}


def main():
    rooms=json.loads((ROOT/'data/task083/room-client-atlas-evidence.json').read_text(encoding='utf-8'))['rows']
    raw={r['record_id']:r for r in json.loads((ROOT/'data/task083/catalog-current-2335.json').read_text(encoding='utf-8'))}
    ready=[]
    for r in rooms:
        rid=r['record_id'];sources=[];evidence=[]
        if rid in PRICED50 | UNPRICED | BARNS:
            # 公告是12.1发布时列价，未实读12.1.5国服商人，不写作当前正式价格。
            published_price=None if rid in UNPRICED else 75 if rid in BARNS else 50
            sources=[{'type':'vendor','vendor':'最后的建筑师／住宅区走私商',
                'zones':['创始者之角、烈风海岸'],'price':None,'reputation':None,
                'context':[{'label':'购买说明','value':'本阵营房型向最后的建筑师购买；跨阵营房型向住宅区走私商购买'},
                           {'label':'解锁方式','value':'购买并使用对应房间图纸后学习'},
                           {'label':'售价','value':'12.1.5当前商人实价待核实'}]}]
            if not r['client_room']['ItemID']:
                raise ValueError('No corresponding room plans item')
            evidence=[{'url':ARTICLE,'basis':'official release article; four rooms per faction theme; published prices are historical reference only',
                       'published_20260810_price':published_price,'currency_id':3363,'current_price_verified':False},
                      {'basis':'12.1.5.70688 HouseRoom.ItemID','item_id':r['client_room']['ItemID']}]
        elif rid in (223,233):
            level=3 if rid==223 else 5
            sources=[{'type':'unlock','unlock':f'住宅等级 {level} 解锁',
                      'context':[{'label':'说明','value':'提升住宅等级后获得对应房间'}]}]
            evidence=[{'url':HOTFIX,'section':'2026-07-07 Housing','house_level':level}]
        elif rid==439:
            sources=[{'type':'shop','tag':'商城','context':[{'label':'礼包','value':'Haunted Grimtide Estate'},
                      {'label':'包含内容','value':'魂萦幽潮门厅（Spirited Grimtide Foyer）'}]}]
            evidence=[{'url':SHOP,'basis':'official bundle announcement 2026-10-27'},
                      {'basis':'12.1.5.70688 HouseRoom.ItemID','item_id':r['client_room']['ItemID']}]
        if sources:
            original=raw[rid]
            if original['entry_type']!=2 or original['source_text']!='' or original['run_id']!='20261102-224408':
                raise ValueError('Frozen room scan changed')
            ready.append({k:original[k] for k in ('record_id','item_id','name','source_text','run_id')}
                         |{'sources':sources,'evidence':evidence})
    if len(ready)!=21:raise ValueError('Wrong room source count')
    manifest={'executed':False,'ready':ready,'pending':[r['record_id'] for r in rooms if r['record_id'] not in {x['record_id'] for x in ready}],
              'price_pending':sorted(PRICED50 | UNPRICED | BARNS)}
    (ROOT/'data/task083/room-sources-21.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    template=(ROOT/'sql/task083_sources_followup_19.sql').read_text(encoding='utf-8')
    start=template.index('BEGIN;');insert=template.index('INSERT INTO task083_followup VALUES\n');tail=template.index('\nSELECT to_jsonb(d) AS backup_before')
    values=['('+','.join([str(r['record_id']),'NULL',literal(r['run_id']),literal(r['source_text']),literal(json.dumps(r['sources'],ensure_ascii=False))+'::jsonb'])+')' for r in sorted(ready,key=lambda r:r['record_id'])]
    sql='-- REQ-176: 21 evidence-backed room sources; not executed. Deploy unlock renderer first.\n'
    sql+=template[start:insert]+'INSERT INTO task083_followup VALUES\n'+',\n'.join(values)+';'+template[tail:]
    sql=sql.replace('task083_followup','req176_rooms21').replace(') <> 19 OR EXISTS(',') <> 21 OR EXISTS(')
    sql=sql.replace('WHERE d.record_id IS NULL OR d.item_id','WHERE d.record_id IS NULL OR d.entry_type IS DISTINCT FROM 2 OR d.item_id')
    (ROOT/'sql/req176_room_sources_21.sql').write_text(sql,encoding='utf-8')
    print(json.dumps({'room_sources':len(ready),'pending':len(manifest['pending']),'price_pending':len(manifest['price_pending']),'executed':False}))


if __name__=='__main__':main()
