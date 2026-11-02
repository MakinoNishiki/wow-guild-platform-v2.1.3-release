"""#83 离线生成来源候选与条件 SQL；零网络、零凭据。复用 #50 解析器。

用法：python scripts/decor/build_task83_sources.py
任何解析异常均整行留待裁定，不发布不完整来源。不会改原始目录 JSON。
"""
import json
from collections import Counter
from pathlib import Path
from parse_source import parse_source_text

ROOT = Path(__file__).resolve().parents[2]
HOLIDAY_IDS = {26015, 26020, 26012, 26011, 26010, 26887, 26881, 26050,
              26018, 26016, 26884, 26889, 26888, 26882, 26883, 26054,
              26880, 26886, 26885, 26009, 26017, 26019, 26053, 26052, 26051}
# 已审 2026-10-26 Wowhead 12.1.5 清单的 record ID；不按名称模糊推断节日。


def normalize(e):
    if e['type'] == 'vendor':
        return dict(type='vendor', vendor=e['vendor'], zones=e.get('zones', []),
                    price=e.get('price'), reputation=e.get('reputation'))
    if e['type'] in ('quest', 'drop', 'treasure'):
        k = e['type']
        return dict(type=k, **{k: e[k]}, zones=e.get('zones', []))
    return e


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def main():
    data = json.loads((ROOT / 'data/decor-catalog-12.1.5-new-items.json').read_text(encoding='utf-8'))
    ids = [r['record_id'] for r in data]
    if len(ids) != 251 or len(set(ids)) != 251 or not HOLIDAY_IDS <= set(ids):
        raise ValueError('目标集与 #76/#83 已核实基线不一致，停止生成')
    ready, pending, audit = [], [], []
    for row in sorted(data, key=lambda r: r['record_id']):
        elements, anomalies = parse_source_text(row['source_text'])
        sources = [normalize(e) for e in elements]
        if not sources:
            anomalies.append('无可解析来源')
        if row['record_id'] in HOLIDAY_IDS and not any(e['type'] == 'festival_note' for e in sources):
            # 仅表示已核实的节日归属，不声称全年均不可购买，不更改官方 tags。
            sources.append(dict(type='festival_note', note='万圣节装饰'))
        result = dict(record_id=row['record_id'], item_id=row['item_id'], name=row['name'],
                      source_text=row['source_text'], sources=sources, anomalies=anomalies)
        (pending if anomalies else ready).append(result)
        if row['record_id'] in HOLIDAY_IDS:
            audit.append(dict(record_id=row['record_id'], item_id=row['item_id'], name=row['name'],
                              status='本地已存在', types=sorted({e['type'] for e in sources}),
                              tag117=(row.get('tags') or {}).get('117')))
    audit.append(dict(record_id=26013, item_id=282287, name='Scarecrow Pepe',
                      status='本地缺失，待客户端扫描；未生成 INSERT'))
    out = ROOT / 'data/task083'
    out.mkdir(exist_ok=True)
    for name, value in [('sources-ready.json', ready), ('sources-pending.json', pending), ('halloween-audit.json', audit)]:
        (out / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    values = []
    for row in ready:
        values.append('(' + ','.join([str(row['record_id']), str(row['item_id']), literal(row['source_text']),
                                     literal(json.dumps(row['sources'], ensure_ascii=False)) + '::jsonb']) + ')')
    sql = """-- #83 来源结构化草案：仅限本文件候选集；未执行。运营先备份目标行。
-- 不插入 Scarecrow Pepe，不改 tags/source_text/icon_file_id，不触及旧目录。
-- 任意异常会使事务失败并回滚；执行工具应设置遇错停止，禁止绕过 DO 检查。
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL standard_conforming_strings = on;
LOCK TABLE public.decor_catalog IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE task083_expected(record_id integer PRIMARY KEY, item_id integer,
  source_text text NOT NULL, sources jsonb NOT NULL) ON COMMIT DROP;
INSERT INTO task083_expected VALUES
""" + ',\n'.join(values) + ";\n"
    sql += """-- 更新前明细；须保存此结果作为操作留证。
SELECT e.record_id, d.name, d.sources AS before_sources, e.sources AS expected_sources
FROM task083_expected e LEFT JOIN public.decor_catalog d USING(record_id) ORDER BY e.record_id;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM task083_expected e LEFT JOIN public.decor_catalog d USING(record_id)
   WHERE d.record_id IS NULL OR d.item_id IS DISTINCT FROM e.item_id
      OR d.source_text IS DISTINCT FROM e.source_text
      OR NOT (d.sources IS NULL OR d.sources = '[]'::jsonb OR d.sources = e.sources)) THEN
   RAISE EXCEPTION 'task083: 缺行、条目身份/来源原文变化或 sources 冲突，整批停止';
 END IF;
END $$;
UPDATE public.decor_catalog d SET sources=e.sources FROM task083_expected e
WHERE d.record_id=e.record_id AND (d.sources IS NULL OR d.sources='[]'::jsonb);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM task083_expected e LEFT JOIN public.decor_catalog d USING(record_id)
   WHERE d.sources IS DISTINCT FROM e.sources) THEN
   RAISE EXCEPTION 'task083: 写后逐行复核失败，整批回滚';
 END IF;
END $$;
SELECT e.record_id, d.name, d.sources, d.sources=e.sources AS verified
FROM task083_expected e JOIN public.decor_catalog d USING(record_id) ORDER BY e.record_id;
COMMIT;
-- 需回滚时：使用运营执行前保存的目标行备份还原 sources，不要全表清空。
"""
    (ROOT / 'sql/task083_decor_sources.sql').write_text(sql, encoding='utf-8')
    print(json.dumps(dict(total=len(data), ready=len(ready), pending=len(pending),
                          holiday_existing=len(audit)-1, holiday_missing=1,
                          types=dict(Counter(e['type'] for r in ready for e in r['sources']))), ensure_ascii=False))


if __name__ == '__main__':
    main()
