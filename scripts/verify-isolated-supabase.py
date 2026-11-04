#!/usr/bin/env python3
"""Infrastructure smoke test; hard-pinned to the isolated test stack.

Creates and removes two synthetic accounts and one guild in TEST ONLY.
Never prints credentials, tokens, or API response bodies.
"""
import json
from pathlib import Path
import secrets
import subprocess
import time
import urllib.error
import urllib.request

ROOT = Path('/opt/wowbutler-test')
BASE = 'http://127.0.0.1:18000'
checks = []


def check(name, result):
    checks.append({'name': name, 'passed': bool(result)})
    if not result:
        raise RuntimeError(name)


def docker(*args):
    return subprocess.check_output(['docker', *args])


def sql(container, query):
    return docker('exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-c', query).decode().strip()


def main():
    env = dict(line.split('=', 1) for line in (ROOT / '.env').read_text().splitlines() if '=' in line)
    check('Explicit isolated target', env.get('ENVIRONMENT') == 'isolated-test' and env.get('SUPABASE_URL') == BASE)
    names = ['wowbutler-test-' + name + '-1' for name in ['db', 'auth', 'rest', 'gateway']]
    containers = json.loads(docker('inspect', *names))
    check('All test containers running', all(d['State']['Running'] for d in containers))
    check('All containers belong to test project', all(d['Config']['Labels']['com.docker.compose.project'] == 'wowbutler-test' for d in containers))
    check('No production network attached', all(all(n.startswith('wowbutler-test_') for n in d['NetworkSettings']['Networks']) for d in containers))
    check('No production data mounts', all(all(m['Source'].startswith(('/opt/wowbutler-test/', '/var/lib/docker/volumes/wowbutler-test_')) for m in d['Mounts']) for d in containers))
    check('Resource limits and manual start', all(0 < d['HostConfig']['Memory'] <= 512 * 1024**2 and d['HostConfig']['RestartPolicy']['Name'] == 'no' for d in containers))
    ports = [binding for d in containers for bindings in d['NetworkSettings']['Ports'].values() if bindings for binding in bindings]
    check('Only loopback API published', ports == [{'HostIp': '127.0.0.1', 'HostPort': '18000'}])

    def api(path, method='GET', body=None, token=None, service=False):
        key = env['SUPABASE_SERVICE_ROLE_KEY' if service else 'SUPABASE_ANON_KEY']
        headers = {'apikey': key, 'Authorization': 'Bearer ' + (token or key), 'Content-Type': 'application/json', 'Prefer': 'return=representation'}
        request = urllib.request.Request(BASE + path, method=method, headers=headers,
            data=None if body is None else json.dumps(body).encode())
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                text = response.read()
                return response.status, json.loads(text) if text else None
        except urllib.error.HTTPError as error:
            # Do not expose body, which may contain account/session information.
            return error.code, None

    check('Auth health', api('/auth/v1/health')[0] == 200)
    code, classes = api('/rest/v1/game_classes?select=id')
    check('Public game dictionary', code == 200 and len(classes) == 13)
    check('No copied users or business data', sql(names[0], 'SELECT (SELECT count(*) FROM auth.users)+(SELECT count(*) FROM guilds)+(SELECT count(*) FROM activities)+(SELECT count(*) FROM raid_members)+(SELECT count(*) FROM loot_records);') == '0')
    shape = "SELECT (SELECT count(*) FROM pg_tables WHERE schemaname='public')||','||(SELECT count(*) FROM pg_policies WHERE schemaname='public')||','||(SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace);"
    check('Public tables, RLS policy and constraint counts match production', sql(names[0], shape) == sql('supabase-db', shape))
    users, guild = [], None
    try:
        sessions = []
        for label in ['owner', 'outsider']:
            status, session = api('/auth/v1/signup', 'POST', {
                'email': f'wb-infra-{label}-{secrets.token_hex(4)}@example.com',
                'password': secrets.token_urlsafe(28), 'data': {'display_name': '隔离测试' + label}})
            check(label + ' real signup', status == 200 and bool(session.get('access_token')))
            users.append(session['user']['id'])
            sessions.append(session['access_token'])
        status, rows = api('/rest/v1/guilds', 'POST', {'name': '隔离测试公会',
            'owner_id': users[0], 'invite_code': secrets.token_hex(4).upper()}, service=True)
        check('Test guild create', status == 201 and len(rows) == 1)
        guild = rows[0]['id']
        status, membership = api('/rest/v1/guild_members?guild_id=eq.' + guild + '&user_id=eq.' + users[0], service=True)
        check('Membership query', status == 200)
        if not membership:
            check('Create owner membership', api('/rest/v1/guild_members', 'POST', {'guild_id': guild, 'user_id': users[0], 'role': 'owner'}, service=True)[0] == 201)
        path = '/rest/v1/guilds?id=eq.' + guild
        status, rows = api(path, token=sessions[0])
        check('Owner can read own guild', status == 200 and len(rows) == 1)
        status, rows = api(path, token=sessions[1])
        check('Outsider cannot read guild', status == 200 and rows == [])
        status, rows = api(path, 'PATCH', {'name': '不允许的修改'}, token=sessions[1])
        check('Outsider cannot update guild', status in [401, 403] or (status == 200 and rows == []))
        check('Service update', api(path, 'PATCH', {'name': '隔离测试已更新'}, service=True)[0] == 200)
        status, rows = api(path, token=sessions[0])
        check('Independent read after update', status == 200 and rows[0]['name'] == '隔离测试已更新')
    finally:
        if guild:
            check('Delete synthetic guild', api('/rest/v1/guilds?id=eq.' + guild, 'DELETE', service=True)[0] in [200, 204])
        for uid in users:
            check('Delete synthetic account', api('/auth/v1/admin/users/' + uid, 'DELETE', service=True)[0] in [200, 204])
    check('Test data cleanup', sql(names[0], 'SELECT (SELECT count(*) FROM auth.users)+(SELECT count(*) FROM guilds)+(SELECT count(*) FROM activities)+(SELECT count(*) FROM raid_members)+(SELECT count(*) FROM loot_records);') == '0')
    baseline = json.loads((ROOT / 'production-before.json').read_text())
    live = json.loads(docker('inspect', *[d['name'] for d in baseline]))
    check('Production containers not recreated or restarted', all(a['id'] == b['Id'] and a['startedAt'] == b['State']['StartedAt'] and b['State']['Running'] for a, b in zip(baseline, live)))
    stats = docker('stats', '--no-stream', '--format', '{{.Name}}|{{.MemUsage}}', *names).decode().strip()
    report = {'checkedAtUtc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'checks': checks,
        'stats': stats, 'memory': subprocess.check_output(['free', '-m']).decode(),
        'limits': '1088 MiB total, swap disabled per container; restart=no',
        'scope': 'Infrastructure API/RLS smoke only; not REQ-180 browser end-to-end acceptance'}
    (ROOT / 'verification.json').write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'passed': False, 'checks': checks, 'failureType': type(error).__name__}, ensure_ascii=False))
        raise SystemExit(1)
