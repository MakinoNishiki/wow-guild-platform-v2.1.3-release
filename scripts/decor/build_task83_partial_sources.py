"""#83补丁3：六件阿曼尼家具已知来源，采集机制保留待核。离线，不写生产。"""
import json
import re
from pathlib import Path
from parse_source import tokenize, clean_value, parse_source_text
from build_task83_sources import normalize, literal

ROOT = Path(__file__).resolve().parents[2]
IDS = {25129, 15748, 15491, 15161, 8992, 1433}


def partial_sources(text):
    tokens = tokenize(text)
    if [k for k, _ in tokens] != ['掉落', '宝藏', '采集']:
        raise ValueError('来源标签/顺序变化；需重新核实')
    values = [re.sub(r'\|c[0-9a-fA-F]{8}|\|r', '', clean_value(v)) for _, v in tokens]
    if values != ['世界生物', '世界古代储物箱掉落', '世界错放的宝藏节点']:
        raise ValueError('已核实来源内容变化；需重新核实')
    known = ''.join('|cFFFFD200' + key + '：|r' + value
                    for (key, _), value in zip(tokens[:2], values[:2]))
    elements, errors = parse_source_text(known)
    if errors:
        raise ValueError(errors)
    sources = [normalize(e) for e in elements]
    sources[-1]['context'] = [{'label': '待核实来源', 'value': '采集：' + values[2]}]
    return sources


def main():
    rows = json.loads((ROOT/'data/task083/catalog-current-2335.json').read_text(encoding='utf-8'))
    ready = []
    for r in sorted(rows, key=lambda r:r['record_id']):
        if r['record_id'] not in IDS:
            continue
        if r['client_version'] != '12.1.5' or r['run_id'] != '20261102-224408':
            raise ValueError('扫描批次变化')
        ready.append({k:r[k] for k in ('record_id','item_id','name','source_text','run_id')}
                     | {'sources':partial_sources(r['source_text']), 'status':'partial',
                        'unresolved':'采集：世界错放的宝藏节点'})
    if {r['record_id'] for r in ready} != IDS or len(ready) != 6:
        raise ValueError('目标集合不符')
    report = {'executed':False,'partial_sources':ready,'mechanism_pending':sorted(IDS),
              'still_unclassified':[28632,25546,2523]}
    (ROOT/'data/task083/partial-sources-6.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    # 复用已审事务模板，独立文件与临时表；绝不重写补丁2或全目录执行文件。
    template = (ROOT/'sql/task083_sources_followup_19.sql').read_text(encoding='utf-8')
    start = template.index('BEGIN;')
    insert = template.index('INSERT INTO task083_followup VALUES\n')
    tail = template.index('\nSELECT to_jsonb(d) AS backup_before')
    header = template[start:insert] + 'INSERT INTO task083_followup VALUES\n'
    values = ['(' + ','.join([str(r['record_id']),str(r['item_id']),literal(r['run_id']),
                literal(r['source_text']),literal(json.dumps(r['sources'],ensure_ascii=False))+'::jsonb']) + ')'
              for r in ready]
    sql = ('-- #83补丁3：6件家具已知掉落/宝藏；采集原文作为待核说明；未执行。\n'
           '-- 只改sources，复用已上线context展示；不重跑补丁2或全目录SQL。\n'
           + header + ',\n'.join(values) + ';' + template[tail:])
    sql = sql.replace('task083_followup','task083_partial6').replace(') <> 19 OR EXISTS(',') <> 6 OR EXISTS(')
    (ROOT/'sql/task083_sources_partial_6.sql').write_text(sql,encoding='utf-8')
    print(json.dumps({'partial':len(ready),'mechanism_pending':6,'still_unclassified':3,'executed':False}))


if __name__ == '__main__':
    main()
