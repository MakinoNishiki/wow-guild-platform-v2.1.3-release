"""Build the 12.1.5 full-catalog refresh draft offline; never connect to a database.

The user authorized latest-client game fields on 2026-11-02. Preserve curated
sources when raw text is unchanged and keep existing icon fallback IDs on nil.
"""
import json
from collections import Counter
from pathlib import Path
from build_task83_sources import normalize, HOLIDAY_IDS, literal
from parse_source import parse_source_text

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'data/task083'
FIELDS = ['entry_type', 'item_id', 'name', 'asset_id', 'model_scene_id', 'quality',
          'size', 'placement_cost', 'category_ids', 'subcategory_ids', 'source_text',
          'tags', 'indoors', 'outdoors', 'can_customize', 'first_acquisition_bonus',
          'client_version', 'run_id']


def main():
    old = json.loads((OUT / 'catalog-baseline-2313.json').read_text(encoding='utf-8'))
    rows = json.loads((OUT / 'catalog-current-2335.json').read_text(encoding='utf-8'))
    by_old = {r['record_id']: r for r in old}
    ids = {r['record_id'] for r in rows}
    if len(rows) != 2335 or len(ids) != len(rows) or not set(by_old) <= ids:
        raise ValueError('Unexpected record count, duplicate ID or missing old record')
    if any(r['run_id'] != '20261102-224408' or r['client_version'] != '12.1.5'
           or not r['name'] or r['entry_type'] not in (1, 2) for r in rows):
        raise ValueError('Invalid run, client or required fields')
    changes, pending = [], []
    for r in rows:
        parsed, anomalies = parse_source_text(r.get('source_text') or '')
        sources = [normalize(e) for e in parsed]
        if r['record_id'] in HOLIDAY_IDS and not any(e['type'] == 'festival_note' for e in sources):
            sources.append({'type': 'festival_note', 'note': '万圣节装饰'})
        r['sources'] = [] if anomalies else sources
        r['_sources_valid'] = not anomalies
        if anomalies:
            pending.append({'record_id': r['record_id'], 'name': r['name'],
                            'source_text': r['source_text'], 'anomalies': anomalies})
        previous = by_old.get(r['record_id'])
        if previous:
            delta = {k: {'before': previous.get(k), 'after': r.get(k)}
                     for k in FIELDS + ['icon_file_id'] if k not in ('run_id', 'client_version')
                     and previous.get(k) != r.get(k)}
            if delta:
                changes.append({'record_id': r['record_id'], 'name': r['name'], 'changes': delta})
    report = {'run_id': '20261102-224408', 'build': '70688', 'total': len(rows),
              'baseline': len(by_old), 'changed': changes,
              'field_counts': dict(Counter(k for c in changes for k in c['changes'])),
              'new': [r for r in rows if r['record_id'] not in by_old],
              'source_pending': pending, 'missing': sorted(set(by_old) - ids)}
    (OUT / 'catalog-refresh-audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    fixture = ROOT / 'scripts/decor/out/task083-ui-candidate.json'
    fixture.parent.mkdir(parents=True, exist_ok=True)
    fixture.write_text(json.dumps(rows, ensure_ascii=False), encoding='utf-8')
    # jsonb_populate_record uses the SQL directory's actual table types, including sources.
    sql = """-- #83 全目录12.1.5/build70688更新草案，替代旧233条来源草案，禁止叠加执行。
-- 用户2026-11-02确认所有游戏字段以本次客户端为准。未执行；执行前保存全目录备份。
-- 不删除未枚举行；来源不完整时保留完整原文；NULL图标保留网站已补图标。
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL standard_conforming_strings=on;
LOCK TABLE public.decor_catalog IN SHARE ROW EXCLUSIVE MODE;
SELECT to_jsonb(d) AS backup_before FROM public.decor_catalog d ORDER BY record_id;
CREATE TEMP TABLE task083_current ON COMMIT DROP AS
SELECT (jsonb_populate_record(NULL::public.decor_catalog,payload)).*,
       (payload->>'_sources_valid')::boolean AS sources_valid
FROM jsonb_array_elements(""" + literal(json.dumps(rows, ensure_ascii=False, separators=(',', ':'))) + """::jsonb) AS input(payload);
ALTER TABLE task083_current ADD PRIMARY KEY(record_id);
DO $$ BEGIN
 IF (SELECT count(*) FROM task083_current) <> 2335 THEN RAISE EXCEPTION 'wrong target count'; END IF;
 IF EXISTS(SELECT 1 FROM public.decor_catalog d JOIN task083_current e USING(record_id)
    WHERE d.item_id IS DISTINCT FROM e.item_id OR d.entry_type IS DISTINCT FROM e.entry_type
       OR d.run_id > '20261102-224408') THEN
   RAISE EXCEPTION 'item identity changed or newer client run exists; abort';
 END IF;
END $$;
-- Freeze the desired derived sources against the locked current DB before update.
CREATE TEMP TABLE task083_sources ON COMMIT DROP AS
SELECT e.record_id,
 CASE WHEN d.record_id IS NULL OR d.source_text IS DISTINCT FROM e.source_text
      THEN e.sources
      WHEN (d.sources IS NULL OR d.sources='[]'::jsonb) AND e.sources_valid THEN e.sources
      ELSE d.sources END AS sources,
 COALESCE(e.icon_file_id,d.icon_file_id) AS icon_file_id
FROM task083_current e LEFT JOIN public.decor_catalog d USING(record_id);
"""
    assignments = ',\n '.join(f'{k}=e.{k}' for k in FIELDS)
    sql += 'UPDATE public.decor_catalog d SET ' + assignments + ''',
 icon_file_id=s.icon_file_id, sources=s.sources
FROM task083_current e JOIN task083_sources s USING(record_id)
WHERE d.record_id=e.record_id;
'''
    columns = ['record_id'] + FIELDS + ['icon_file_id', 'sources']
    select = ['e.record_id'] + ['e.' + k for k in FIELDS] + ['s.icon_file_id', 's.sources']
    sql += 'INSERT INTO public.decor_catalog (' + ','.join(columns) + ')\nSELECT ' + ','.join(select) + '''
FROM task083_current e JOIN task083_sources s USING(record_id)
WHERE NOT EXISTS(SELECT 1 FROM public.decor_catalog d WHERE d.record_id=e.record_id);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM task083_current e LEFT JOIN public.decor_catalog d USING(record_id)
 JOIN task083_sources s USING(record_id) WHERE d.record_id IS NULL OR
 ''' + ' OR '.join(f'd.{k} IS DISTINCT FROM e.{k}' for k in FIELDS) + '''
 OR d.icon_file_id IS DISTINCT FROM s.icon_file_id OR d.sources IS DISTINCT FROM s.sources)
 THEN RAISE EXCEPTION 'post-write row verification failed'; END IF;
END $$;
SELECT count(*) AS verified_target_rows FROM public.decor_catalog d JOIN task083_current e USING(record_id);
COMMIT;
-- Rollback: restore only target IDs from backup_before; newly inserted IDs require separate reviewed deletion.
'''
    (ROOT / 'sql/task083_decor_refresh_1215.sql').write_text(sql, encoding='utf-8')
    print(json.dumps({'total': len(rows), 'changed': len(changes), 'new': len(report['new']),
                      'source_pending': len(pending), 'fields': report['field_counts']}))


if __name__ == '__main__':
    main()
