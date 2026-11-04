#!/usr/bin/env python3
"""Run as root on the approved host. Never prints or accepts production secrets.

Creates an on-demand, loopback-only test stack. Existing production containers
are only inspected / schema-dumped. Refuses to overwrite an existing test setup.
"""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import time

ROOT = Path('/opt/wowbutler-test')
PROJECT = 'wowbutler-test'


def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, **kwargs).stdout


def compose(*args):
    return run(['docker', 'compose', '-p', PROJECT, '-f', str(ROOT / 'compose.json'), *args])


def token(secret, role):
    def enc(value):
        return base64.urlsafe_b64encode(json.dumps(value, separators=(',', ':')).encode()).rstrip(b'=')
    body = enc({'alg': 'HS256', 'typ': 'JWT'}) + b'.' + enc({
        'iss': 'wowbutler-test', 'role': role, 'iat': int(time.time()),
        'exp': int(time.time()) + 365 * 86400,
    })
    return (body + b'.' + base64.urlsafe_b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).rstrip(b'=')).decode()


def write(name, value, mode=0o600):
    path = ROOT / name
    path.write_text(value)
    path.chmod(mode)


def main():
    if os.geteuid() != 0:
        raise RuntimeError('Run as root')
    if ROOT.exists():
        raise RuntimeError('Test directory already exists; inspect it instead of overwriting')
    listeners = run(['ss', '-lnt']).decode()
    if ':18000 ' in listeners:
        raise RuntimeError('Test API port is occupied')
    available = int(next(x.split()[1] for x in Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:')))
    if available < 1500 * 1024 or shutil.disk_usage('/opt').free < 10 * 1024**3:
        raise RuntimeError('Insufficient memory or disk headroom')
    source_names = ['supabase-db', 'supabase-auth', 'supabase-rest', 'supabase-kong']
    before = json.loads(run(['docker', 'inspect', *source_names]))
    images = {d['Name'].lstrip('/'): d['Config']['Image'] for d in before}
    ROOT.mkdir(mode=0o700)
    (ROOT / 'init').mkdir(mode=0o700)
    for name in ['roles.sql', 'jwt.sql']:
        shutil.copyfile('/opt/supabase/volumes/db/' + name, ROOT / 'init' / name)
    roles = ROOT / 'init' / 'roles.sql'
    # Minimal stack does not install webhooks / supabase_functions_admin.
    roles.write_text(roles.read_text().replace("ALTER USER supabase_functions_admin WITH PASSWORD :'pgpass';", ''))
    password, jwt = secrets.token_hex(32), secrets.token_hex(32)
    anon, service = token(jwt, 'anon'), token(jwt, 'service_role')
    write('.env', '\n'.join([
        'ENVIRONMENT=isolated-test', 'SUPABASE_URL=http://127.0.0.1:18000',
        'POSTGRES_PASSWORD=' + password, 'JWT_SECRET=' + jwt,
        'SUPABASE_ANON_KEY=' + anon, 'SUPABASE_SERVICE_ROLE_KEY=' + service, '',
    ]))
    common = {'restart': 'no', 'networks': ['isolated'], 'logging': {
        'driver': 'json-file', 'options': {'max-size': '5m', 'max-file': '2'}},
        'pids_limit': 128}
    def svc(image, memory, cpu, **config):
        return dict(common, image=image, mem_limit=memory, memswap_limit=memory, cpus=cpu, **config)
    services = {
        'db': svc(images['supabase-db'], '512m', 1.0,
            environment={'POSTGRES_PASSWORD': password, 'PGPASSWORD': password,
                'POSTGRES_DB': 'postgres', 'JWT_SECRET': jwt, 'JWT_EXP': '3600'},
            volumes=['db-data:/var/lib/postgresql/data', 'db-config:/etc/postgresql-custom',
                './init/roles.sql:/docker-entrypoint-initdb.d/init-scripts/99-roles.sql:ro',
                './init/jwt.sql:/docker-entrypoint-initdb.d/init-scripts/99-jwt.sql:ro'],
            command=['postgres', '-c', 'config_file=/etc/postgresql/postgresql.conf',
                '-c', 'shared_buffers=64MB', '-c', 'max_connections=40',
                '-c', 'work_mem=2MB', '-c', 'maintenance_work_mem=32MB',
                '-c', 'log_min_messages=fatal'],
            healthcheck={'test': ['CMD-SHELL', 'pg_isready -U postgres -d postgres'],
                'interval': '5s', 'timeout': '3s', 'retries': 30}),
        'auth': svc(images['supabase-auth'], '128m', 0.35,
            depends_on={'db': {'condition': 'service_healthy'}},
            environment={'GOTRUE_API_HOST': '0.0.0.0', 'GOTRUE_API_PORT': '9999',
                'API_EXTERNAL_URL': 'http://127.0.0.1:18000',
                'GOTRUE_SITE_URL': 'http://127.0.0.1:18778',
                'GOTRUE_URI_ALLOW_LIST': 'http://127.0.0.1:18778/**',
                'GOTRUE_DB_DRIVER': 'postgres',
                'GOTRUE_DB_DATABASE_URL': f'postgres://supabase_auth_admin:{password}@db:5432/postgres',
                'GOTRUE_JWT_SECRET': jwt, 'GOTRUE_JWT_EXP': '3600',
                'GOTRUE_JWT_AUD': 'authenticated', 'GOTRUE_JWT_DEFAULT_GROUP_NAME': 'authenticated',
                'GOTRUE_JWT_ADMIN_ROLES': 'service_role', 'GOTRUE_DISABLE_SIGNUP': 'false',
                'GOTRUE_EXTERNAL_EMAIL_ENABLED': 'true', 'GOTRUE_EXTERNAL_PHONE_ENABLED': 'false',
                'GOTRUE_MAILER_AUTOCONFIRM': 'true', 'GOTRUE_SMS_AUTOCONFIRM': 'false'}),
        'rest': svc(images['supabase-rest'], '192m', 0.35,
            depends_on={'db': {'condition': 'service_healthy'}},
            environment={'PGRST_DB_URI': f'postgres://authenticator:{password}@db:5432/postgres',
                'PGRST_DB_SCHEMAS': 'public', 'PGRST_DB_ANON_ROLE': 'anon',
                'PGRST_JWT_SECRET': jwt, 'PGRST_DB_POOL': '5', 'PGRST_DB_MAX_ROWS': '1000',
                'PGRST_DB_EXTRA_SEARCH_PATH': 'public,extensions',
                'PGRST_APP_SETTINGS_JWT_SECRET': jwt, 'PGRST_APP_SETTINGS_JWT_EXP': '3600'}),
        'gateway': svc(images['supabase-kong'], '256m', 0.35,
            depends_on=['auth', 'rest'], ports=['127.0.0.1:18000:8000'],
            volumes=['./kong.json:/home/kong/kong.json:ro'],
            environment={'KONG_DATABASE': 'off', 'KONG_DECLARATIVE_CONFIG': '/home/kong/kong.json',
                'KONG_PLUGINS': 'cors,key-auth,acl', 'KONG_NGINX_WORKER_PROCESSES': '1',
                'KONG_PROXY_LISTEN': '0.0.0.0:8000', 'KONG_ADMIN_LISTEN': 'off',
                'KONG_PROXY_ACCESS_LOG': 'off', 'KONG_DNS_ORDER': 'LAST,A,CNAME',
                'KONG_NGINX_PROXY_PROXY_BUFFER_SIZE': '160k',
                'KONG_NGINX_PROXY_PROXY_BUFFERS': '64 160k'}),
    }
    kong = {'_format_version': '2.1', 'consumers': [
        {'username': 'anon', 'keyauth_credentials': [{'key': anon}]},
        {'username': 'service_role', 'keyauth_credentials': [{'key': service}]}],
        'services': []}
    for name, route, target in [('auth', '/auth/v1/', 'http://auth:9999/'),
                                 ('rest', '/rest/v1/', 'http://rest:3000/')]:
        kong['services'].append({'name': name, 'url': target,
            'routes': [{'name': name, 'paths': [route], 'strip_path': True}],
            'plugins': [{'name': 'cors'}, {'name': 'key-auth', 'config': {'hide_credentials': False}}]})
    write('kong.json', json.dumps(kong, indent=2), 0o644)
    # Docker does not publish host ports for internal-only networks. Only the
    # gateway joins ingress; DB/Auth/REST remain on the private internal bridge.
    services['gateway']['networks'] = ['isolated', 'ingress']
    write('compose.json', json.dumps({'services': services,
        'networks': {'isolated': {'internal': True}, 'ingress': {}},
        'volumes': {'db-data': {}, 'db-config': {}}}, indent=2))
    write('production-before.json', json.dumps([
        {'name': d['Name'], 'id': d['Id'], 'startedAt': d['State']['StartedAt']} for d in before], indent=2))
    # Schema only: no real users, sessions, guilds, or business records are copied.
    schema = run(['docker', 'exec', 'supabase-db', 'pg_dump', '-U', 'postgres', '-d', 'postgres',
                  '--schema-only', '--format=custom', '--schema=public', '--schema=auth', '--lock-wait-timeout=5s'])
    (ROOT / 'schema.dump').write_bytes(schema)
    (ROOT / 'schema.dump').chmod(0o600)
    compose('up', '-d', 'db')
    for _ in range(60):
        state = json.loads(run(['docker', 'inspect', 'wowbutler-test-db-1']))[0]['State']
        if state.get('Health', {}).get('Status') == 'healthy':
            break
        if state['Status'] == 'exited':
            raise RuntimeError('Test database initialization failed; inspect sanitized logs')
        time.sleep(2)
    else:
        raise RuntimeError('Test database health timeout')
    target = json.loads(run(['docker', 'inspect', 'wowbutler-test-db-1']))[0]
    assert target['Config']['Labels']['com.docker.compose.project'] == PROJECT
    # Only this newly created test DB may be initialized. Production is never a
    # write target. Extension schemas stay separate from the imported schemas.
    init = '''
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS vault;
CREATE EXTENSION IF NOT EXISTS pgjwt WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='supabase_functions_admin') THEN
    CREATE ROLE supabase_functions_admin NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='supabase_privileged_role') THEN
    CREATE ROLE supabase_privileged_role NOLOGIN;
  END IF;
END $$;
DROP SCHEMA public CASCADE;
DROP SCHEMA auth CASCADE;
'''
    run(['docker', 'exec', '-i', 'wowbutler-test-db-1', 'psql', '-U', 'postgres', '-d', 'postgres',
         '-v', 'ON_ERROR_STOP=1'], input=init.encode())
    restore = ['docker', 'exec', '-i', 'wowbutler-test-db-1', 'pg_restore', '-U', 'postgres',
               '-d', 'postgres', '--single-transaction', '--exit-on-error']
    run(restore, input=schema)
    write('schema-imported', 'schema only; no production data copied\n')
    tables = ['auth.schema_migrations'] + ['public.' + name for name in [
        'game_patches', 'game_seasons', 'game_raids', 'game_bosses', 'game_classes',
        'game_specs', 'game_dungeons', 'boss_loot', 'dungeon_loot', 'tier_sets', 'tier_set_pieces']]
    dump = ['docker', 'exec', 'supabase-db', 'pg_dump', '-U', 'postgres', '-d', 'postgres',
            '--data-only', '--format=custom', '--lock-wait-timeout=5s']
    for table in tables:
        dump += ['--table', table]
    run(restore, input=run(dump))
    write('seed-imported', '\n'.join(tables) + '\n')
    compose('up', '-d')
    print('Isolated test stack created. Run verify-isolated-supabase.py before use.')


if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError as exc:
        # Container/config errors may include environment values: no raw stderr.
        print('Command failed, exit code:', exc.returncode, '(inspect sanitized diagnostics)')
        raise SystemExit(1)
