"""#83 补丁2：离线生成19条来源补丁，不重写已执行SQL，不连接数据库。"""
import copy
import json
from pathlib import Path

from parse_source import TYPE_KEYS, clean_value, parse_source_text, tokenize
from build_task83_sources import literal, normalize

ROOT = Path(__file__).resolve().parents[2]
READY_IDS = {8238, 8176, 925, 15747, 15583, 764, 10368, 9290, 5796,
             2587, 1730, 1154, 2434, 2432, 2431, 2324, 11455, 1674, 1261}
PENDING_IDS = {28632, 25129, 15748, 15491, 15161, 8992, 1433, 25546, 2523}
ALIASES = {'要塞任务': '任务', '周常任务': '任务', '活动': '事件'}
CONTEXT_KEYS = {'物品', '工作'}


def parse_followup(text):
    """复用既有价格/地区解析，只扩充已核实标签与非类型上下文。

    物品/工作跟随原令牌位置所属的元素，绝不推导掉落或兑换关系。
    补丁生成还受 record_id 白名单与原文一致性约束。
    """
    tokens = tokenize(text)
    converted = ''.join('|cFFFFD200' + ALIASES.get(k, k) + '：|r' + v
                        for k, v in tokens if k not in CONTEXT_KEYS)
    parsed, anomalies = parse_source_text(converted)
    elements = [normalize(e) for e in parsed]
    index = -1
    for key, value in tokens:
        if ALIASES.get(key, key) in TYPE_KEYS:
            index += 1
            if key in ALIASES:
                elements[index]['source_label'] = key
        elif key in CONTEXT_KEYS:
            if index < 0 or not clean_value(value):
                anomalies.append('获取上下文无归属或为空: ' + key)
            else:
                elements[index].setdefault('context', []).append(
                    {'label': key, 'value': clean_value(value)})
    if not elements:
        anomalies.append('无可解析来源')
    return elements, anomalies


def main():
    directory = ROOT / 'data/task083'
    rows = json.loads((directory / 'catalog-current-2335.json').read_text(encoding='utf-8'))
    audit = json.loads((directory / 'catalog-refresh-audit.json').read_text(encoding='utf-8'))
    byid = {r['record_id']: r for r in rows}
    pending = {r['record_id']: r for r in audit['source_pending']}
    if len(byid) != 2335 or set(pending) != READY_IDS | PENDING_IDS:
        raise ValueError('冻结28条审计基线变化；停止生成')
    ready = []
    for rid in sorted(READY_IDS):
        r = byid[rid]
        if (r['source_text'] != pending[rid]['source_text']
                or r['run_id'] != '20261102-224408' or r['client_version'] != '12.1.5'):
            raise ValueError('来源或扫描版本变化；需重新核实')
        sources, anomalies = parse_followup(r['source_text'])
        if anomalies:
            raise ValueError(f'{rid}: {anomalies}')
        ready.append({k: r[k] for k in ('record_id', 'item_id', 'name', 'run_id', 'source_text')}
                     | {'sources': sources})
    report = {'basis': '12.1.5/build70688/run20261102-224408', 'executed': False,
              'ready': ready, 'pending': [pending[i] for i in sorted(PENDING_IDS)]}
    (directory / 'source-followup-19.json').write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    values = []
    for r in ready:
        values.append('(' + ','.join([str(r['record_id']), str(r['item_id']),
            literal(r['run_id']), literal(r['source_text']),
            literal(json.dumps(r['sources'], ensure_ascii=False)) + '::jsonb']) + ')')
    sql = """-- #83 补丁2：19条来源分类，未执行；9条待核不触碰。
-- 先发布支持 source_label/context 的前端，再执行本补丁。
-- 仅更新 sources，不改原文/价格/tags/其他游戏字段；不叠加旧全目录SQL。
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL standard_conforming_strings=on;
LOCK TABLE public.decor_catalog IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE task083_followup(record_id integer PRIMARY KEY, item_id integer,
 run_id text NOT NULL, source_text text NOT NULL, sources jsonb NOT NULL) ON COMMIT DROP;
INSERT INTO task083_followup VALUES
""" + ',\n'.join(values) + """;
SELECT to_jsonb(d) AS backup_before FROM public.decor_catalog d
JOIN task083_followup e USING(record_id) ORDER BY d.record_id;
DO $$ BEGIN
 IF (SELECT count(*) FROM task083_followup) <> 19 OR EXISTS(
   SELECT 1 FROM task083_followup e LEFT JOIN public.decor_catalog d USING(record_id)
   WHERE d.record_id IS NULL OR d.item_id IS DISTINCT FROM e.item_id
   OR d.run_id IS DISTINCT FROM e.run_id OR d.source_text IS DISTINCT FROM e.source_text
   OR NOT(d.sources IS NULL OR d.sources='[]'::jsonb OR d.sources=e.sources)) THEN
   RAISE EXCEPTION 'followup: missing row, identity/run/raw mismatch or curated source conflict';
 END IF;
END $$;
UPDATE public.decor_catalog d SET sources=e.sources FROM task083_followup e
WHERE d.record_id=e.record_id AND d.sources IS DISTINCT FROM e.sources;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM task083_followup e LEFT JOIN public.decor_catalog d USING(record_id)
   WHERE d.sources IS DISTINCT FROM e.sources) THEN
   RAISE EXCEPTION 'followup: post-write mismatch; rollback';
 END IF;
END $$;
SELECT d.record_id,d.name,d.sources FROM public.decor_catalog d
JOIN task083_followup e USING(record_id) ORDER BY d.record_id;
COMMIT;
-- 回滚：按执行前 backup_before 的 record_id 有条件恢复 sources；禁止全表清空。
"""
    (ROOT / 'sql/task083_sources_followup_19.sql').write_text(sql, encoding='utf-8')

    # 独立本地夹具；不改原始扫描、生产备份、已执行SQL或28条审计。
    fixture = copy.deepcopy(rows)
    expected = {r['record_id']: r['sources'] for r in ready}
    baseline = {r['record_id']: r for r in json.loads(
        (directory / 'catalog-baseline-2313.json').read_text(encoding='utf-8'))}
    for r in fixture:
        old = baseline.get(r['record_id'], {})
        elements, anomalies = parse_source_text(r['source_text'])
        r['sources'] = (old['sources'] if old.get('source_text') == r['source_text'] and old.get('sources')
                        else [] if anomalies else [normalize(e) for e in elements])
        if r['record_id'] in PENDING_IDS:
            r['sources'] = []
        if r['record_id'] in expected:
            r['sources'] = expected[r['record_id']]
    out = ROOT / 'scripts/decor/out/task083-followup-fixture.json'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(fixture, ensure_ascii=False), encoding='utf-8')
    print(json.dumps({'ready': len(ready), 'pending': len(PENDING_IDS), 'executed': False}))


if __name__ == '__main__':
    main()
