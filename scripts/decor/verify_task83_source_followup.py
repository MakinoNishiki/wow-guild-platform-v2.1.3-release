"""28条边界/上下文回归：零网络，不执行SQL。"""
import json
from pathlib import Path
from build_task83_source_followup import READY_IDS, PENDING_IDS, parse_followup
from parse_source import parse_source_text

root = Path(__file__).resolve().parents[2]
report = json.loads((root / 'data/task083/source-followup-19.json').read_text(encoding='utf-8'))
rows = {r['record_id']: r for r in report['ready']}
assert set(rows) == READY_IDS and {r['record_id'] for r in report['pending']} == PENDING_IDS
for rid, row in rows.items():
    parsed, errors = parse_followup(row['source_text'])
    assert not errors and parsed == row['sources'], rid
    assert parse_source_text(row['source_text'])[1], '19条旧文法均应拒绝'
weekly = {10368, 9290, 5796, 2587, 1730, 1154}
for rid in weekly:
    assert rows[rid]['sources'] == [{'type': 'quest', 'quest': '精选之礼',
        'zones': ['创始者之角、烈风海岸'], 'source_label': '周常任务',
        'context': [{'label': '物品', 'value': '奥术秘藏光球'}]}]
for rid in (2434, 2432, 2431, 2324):
    assert rows[rid]['sources'] == [{'type': 'event', 'event': '日常任务',
        'zones': ['麦卡贡'], 'source_label': '活动',
        'context': [{'label': '物品', 'value': '自动拼装式家具包'}]}]
assert rows[1261]['sources'][0]['context'] == [{'label': '工作', 'value': '法定休假'}]
for rid, item, price in [(11455, '伪造的迦拉克隆幽暗之心', [{'currency_id': 2815, 'amount': 15000}]),
                         (1674, '货真价实、如假包换的龙母的徽记', [{'gold': 250}])]:
    sources = rows[rid]['sources']
    assert [s['type'] for s in sources] == ['achievement', 'vendor']
    assert sources[0]['context'] == [{'label': '物品', 'value': item}]
    assert sources[1]['price'] == price
for rid in (15747, 15583, 764):
    assert [s['type'] for s in rows[rid]['sources']] == ['event', 'treasure']
for rid in (8238, 8176, 925):
    assert rows[rid]['sources'][0]['source_label'] == '要塞任务'
for row in report['pending']:
    assert parse_followup(row['source_text'])[1], row['record_id']
for text in ['|cFFFFD200工作：|r无归属', '|cFFFFD200活动：|r测试|n|cFFFFD200新未知键：|r不得吞掉',
             '|cFFFFD200商人：|r某人|n|cFFFFD200价格：|r123未知价格']:
    assert parse_followup(text)[1], text
print('PASS: 19完整获取上下文与类型/价格，9条仍拒绝，未知键/无归属/价格残差拦截')
