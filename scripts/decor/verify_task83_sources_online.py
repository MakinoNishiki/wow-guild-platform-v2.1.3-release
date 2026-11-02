"""只读核对线上19条来源及部署版本；不读取本地.env，不执行SQL、不写库。"""
import hashlib
import json
import re
import subprocess
import urllib.parse
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = 'https://wow.ddctl.com'


def get(url, headers=()):
    command = ['curl.exe', '--fail', '--silent', '--show-error', '--location',
               '--max-time', '20', '--header', 'Cache-Control: no-cache']
    for header in headers:
        command += ['--header', header]
    result = subprocess.run(command + [url], capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr.decode('utf-8', errors='replace')[:250])
    return result.stdout.decode('utf-8-sig')


def main():
    expected = json.loads((ROOT / 'data/task083/source-followup-19.json').read_text(encoding='utf-8'))['ready']
    html = get(BASE + '/index.html?readonly_source_check=20261103')
    javascript = get(BASE + '/js/decorData.js?readonly_source_check=20261103')
    cfg = json.loads(get(BASE + '/api/supabase-config'))
    url = (cfg.get('url') or cfg.get('supabaseUrl') or '').rstrip('/')
    # 使用网站公开anon配置，只在进程内使用；不输出/落盘key，不接触用户会话。
    anon = cfg.get('anonKey') or cfg.get('supabaseAnonKey')
    headers = ['apikey: ' + anon, 'Authorization: Bearer ' + anon]

    def catalog(params):
        return json.loads(get(url + '/rest/v1/decor_catalog?' + urllib.parse.urlencode(params), headers))

    rows = catalog({'select': 'record_id,item_id,name,sources,source_text,run_id',
                    'record_id': 'in.(' + ','.join(str(r['record_id']) for r in expected) + ')',
                    'order': 'record_id'})
    byid = {r['record_id']: r for r in rows}
    checks = []
    for e in expected:
        r = byid.get(e['record_id'], {})
        checks.append({'record_id': e['record_id'],
            'identity_raw_run_match': all(r.get(k) == e[k] for k in ('item_id', 'source_text', 'run_id')),
            'sources_match': r.get('sources') == e['sources'],
            'empty_sources': not r.get('sources')})
    types = Counter()
    total, empty = 0, 0
    offset = 0
    while True:
        page = catalog({'select': 'record_id,sources', 'order': 'record_id', 'offset': offset, 'limit': 1000})
        for r in page:
            total += 1
            sources = r.get('sources') or []
            empty += not sources
            types.update({s['type'] for s in sources})
        if len(page) < 1000:
            break
        offset += len(page)
    versions = sorted(set(re.findall(r'\?v=([\w.]+)', html)))
    result = {'read_only': True, 'frontend_versions': versions,
              'frontend_context_support': 'function sourceBaseText(s)' in javascript and 's.context' in javascript,
              'frontend_matches_local': hashlib.sha256(javascript.encode()).hexdigest() == hashlib.sha256(
                  (ROOT / 'js/decorData.js').read_text(encoding='utf-8-sig').encode()).hexdigest(),
              'catalog_total': total, 'empty_sources': empty, 'source_type_counts': dict(types),
              'target_checks': checks, 'rows': rows}
    target = ROOT / 'docs/evidence/task083-followup-20261103/online-diagnosis.json'
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in result.items() if k not in ('rows', 'target_checks')}, ensure_ascii=True))
    print(json.dumps({'targets': len(checks), 'identity_raw_run_match': sum(c['identity_raw_run_match'] for c in checks),
                      'empty_targets': sum(c['empty_sources'] for c in checks),
                      'sources_match': sum(c['sources_match'] for c in checks)}))
    if not all(c['identity_raw_run_match'] and c['sources_match'] for c in checks):
        print('RED: online source data does not match the 19-row followup; no production writes performed')
        raise SystemExit(1)
    print('PASS: online 19-row source followup matches')


if __name__ == '__main__':
    main()
