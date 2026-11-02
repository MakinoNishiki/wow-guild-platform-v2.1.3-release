"""Read-only production checks for REQ-176 frontend/assets and 27 source rows."""
import argparse
import hashlib
import json
import re
import subprocess
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
BASE='https://wow.ddctl.com'


def get(url,headers=()):
    cmd=['curl.exe','--fail','--silent','--show-error','--location','--max-time','20','--header','Cache-Control: no-cache']
    for h in headers:cmd+=['--header',h]
    p=subprocess.run(cmd+[url],capture_output=True)
    if p.returncode:raise RuntimeError(p.stderr.decode('utf-8',errors='replace')[:250])
    return p.stdout


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--expect-pending',action='store_true')
    ap.add_argument('--output',default='docs/evidence/req176-20261103/online-verification.json')
    args=ap.parse_args()
    read=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8'))
    partial=read('data/task083/partial-sources-6.json')['partial_sources']
    rooms=read('data/task083/room-sources-21.json')['ready']
    old=read('data/task083/source-followup-19.json')['ready']
    icons=read('data/task083/room-previews-manifest.json')['files']
    html=get(BASE+'/index.html?verify=req176-20261103').decode('utf-8-sig')
    versions=sorted(set(re.findall(r'\?v=([\w.]+)',html)))
    script_matches={}
    for file in ['js/decorData.js','js/decorDict.js']:
        remote=get(BASE+'/'+file+'?v=20261103.108&verify=req176').decode('utf-8-sig')
        script_matches[file]=remote==(ROOT/file).read_text(encoding='utf-8-sig')
    def check_icon(row):
        data=get(BASE+'/'+row['src'])
        return {'record_id':row['record_id'],'sha_matches':hashlib.sha256(data).hexdigest()==row['sha256']}
    image_results=list(ThreadPoolExecutor(6).map(check_icon,icons))
    cfg=json.loads(get(BASE+'/api/supabase-config'))
    url=(cfg.get('url') or cfg.get('supabaseUrl') or '').rstrip('/')
    anon=cfg.get('anonKey') or cfg.get('supabaseAnonKey')
    headers=['apikey: '+anon,'Authorization: Bearer '+anon]
    params={'select':'record_id,item_id,name,entry_type,sources,source_text,run_id',
            'record_id':'in.('+','.join(str(r['record_id']) for r in partial+rooms+old)+')','order':'record_id'}
    live=json.loads(get(url+'/rest/v1/decor_catalog?'+urllib.parse.urlencode(params),headers))
    byid={r['record_id']:r for r in live}
    def check(row):
        actual=byid.get(row['record_id'],{})
        return {'record_id':row['record_id'],
                'identity_raw_run_match':all(actual.get(k)==row[k] for k in ['item_id','source_text','run_id']),
                'sources_match':actual.get('sources')==row['sources'],'empty':not actual.get('sources')}
    targets=[check(r) for r in partial+rooms]
    previous=[check(r) for r in old]
    result={'read_only':True,'versions':versions,'scripts_match_local':script_matches,'images':image_results,
            'target_checks':targets,'previous_19_checks':previous,'rows':live}
    output=ROOT/args.output;output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    summary={'versions':versions,'scripts_match_local':all(script_matches.values()),
             'images_ok':sum(r['sha_matches'] for r in image_results),'target_count':len(targets),
             'target_identity_ok':sum(r['identity_raw_run_match'] for r in targets),
             'target_sources_match':sum(r['sources_match'] for r in targets),'target_empty':sum(r['empty'] for r in targets),
             'previous_19_match':sum(r['sources_match'] for r in previous)}
    print(json.dumps(summary))
    assert versions==['20261103.108'] and all(script_matches.values()),'Frontend not ready'
    assert all(r['sha_matches'] for r in image_results),'Missing/stale room images'
    assert all(r['identity_raw_run_match'] for r in targets),'Target identity/raw/run conflict'
    assert all(r['identity_raw_run_match'] and r['sources_match'] for r in previous),'Previous 19-row patch changed'
    if not args.expect_pending:assert all(r['sources_match'] for r in targets),'New 27-row patch not active'
    print('PASS frontend/assets/preflight' if args.expect_pending else 'PASS production 27-row sources and frontend/assets')


if __name__=='__main__':main()
