// Disposable Windows integration run. Set WB_PG_BIN, WB_POSTGREST and make pg available via NODE_PATH.
// Production server + Chrome + PostgreSQL/PostgREST. Only the auth.users directory and sign-in session are fixtures.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const tls = require('node:tls');
const { spawn, execFileSync } = require('node:child_process');
const { randomUUID, randomBytes, createHmac } = require('node:crypto');
const { Client } = require('pg');
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const recruitment = process.argv.includes('--guild-recruitment') && require('./verify-req212-recruitment.cjs');
const guildRoles = process.argv.includes('--guild-roles') && require('./verify-guild-roles-real.cjs');
const output = process.env.WB_VERIFY_OUTPUT || path.join(root, 'docs/evidence', guildRoles ? 'req191-guild-roles-20261125' : recruitment ? 'req212-recruitment-20261125' : process.argv.includes('--guild-battles') ? 'req190-20261123' : 'req203-cover-20261119');
const host = '127.0.0.1';
const checkDecor = process.argv.includes('--decor-engagement');
const lootReadback = process.argv.includes('--loot-readback') && require('./verify-loot-import-readback.cjs');
const battleReports = (guildRoles || recruitment || process.argv.includes('--guild-battles')) && require('./verify-req190-battles.cjs');
const suite = process.argv.find(arg => arg.startsWith('--suite='))?.slice(8);
const withCatalog = checkDecor || !!suite;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function port() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(0, host, resolve));
  const number = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return number;
}
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const pgBin = process.env.WB_PG_BIN;
  const restExe = process.env.WB_POSTGREST;
  assert.ok(pgBin && restExe, '请指定本地 PostgreSQL、PostgREST 路径');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-req203-'));
  const dbDir = path.join(temp, 'pg');
  const passFile = path.join(temp, 'pw');
  const run = (name, args) => execFileSync(path.join(pgBin, name + '.exe'), args, { stdio: 'ignore', windowsHide: true });
  const signing = randomBytes(32).toString('hex');
  const password = randomBytes(24).toString('hex');
  const signer = claims => {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const head = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ exp: Math.floor(Date.now() / 1000) + 3600, ...claims });
    return head + '.' + createHmac('sha256', signing).update(head).digest('base64url');
  };
  const sessions = ['木匠甲', '木匠乙', '社区管理员'].map((name, index) => {
    const id = randomUUID();
    const user = { id, aud: 'authenticated', role: 'authenticated', email: 'fixture' + index + '@example.invalid',
      user_metadata: { display_name: name }, app_metadata:index === 2 ? {role:'superadmin'} : {}, created_at: new Date().toISOString() };
    return { user, access_token: signer({ sub: id, role: 'authenticated', aud: 'authenticated' }),
      refresh_token: randomUUID(), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600 };
  });
  let db, dbStarted, rest, gateway, app, browser, verifiedRoles = false;
  const links = [];
  const checks = [];
  const pass = name => { checks.push(name); console.log('PASS', name); };
  try {
    const dbPort = await port();
    fs.writeFileSync(passFile, password);
    run('initdb', ['-D', dbDir, '-U', 'postgres', '-A', 'scram-sha-256', '--pwfile', passFile, '--no-locale', '--encoding=UTF8']);
    fs.unlinkSync(passFile);
    run('pg_ctl', ['-D', dbDir, '-l', path.join(temp, 'pg.log'), '-o', '-h ' + host + ' -p ' + dbPort, '-w', 'start']);
    dbStarted = true;
    const uri = 'postgres://postgres:' + password + '@' + host + ':' + dbPort + '/postgres';
    db = new Client({ connectionString: uri });
    await db.connect();
    await db.query('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key, raw_user_meta_data jsonb,raw_app_meta_data jsonb)');
    for (const { user } of sessions) await db.query('insert into auth.users values ($1,$2,$3)', [user.id, user.user_metadata,user.app_metadata]);
    await db.query("create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$");
    if (lootReadback) await lootReadback.setup(db, sessions[0].user.id);
    if (battleReports) await battleReports.setup(db, sessions);
    if (recruitment) await recruitment.setup(db, sessions);
    else if (battleReports) await db.query(fs.readFileSync(path.join(root,'sql','59_req212_guild_recruitment.sql'),'utf8'));
    if (battleReports) await require('./verify-guild-roles-real.cjs').setupSchema(db);
    if (guildRoles) await guildRoles.setup(db, sessions);
    {
      const records = JSON.parse(fs.readFileSync(path.join(root,'data/task083/catalog-current-2335.json'),'utf8'));
      await db.query('create table decor_catalog (record_id integer primary key,entry_type integer,name text)');
      await db.query('insert into decor_catalog select * from unnest($1::integer[],$2::integer[],$3::text[])',[records.map(r=>r.record_id),records.map(r=>r.entry_type),records.map(r=>r.name)]);
      await db.query(fs.readFileSync(path.join(root,'sql/35_task058_decor_plans.sql'),'utf8'));
      await db.query('grant usage on schema auth to service_role,authenticated; grant select on decor_catalog to service_role,anon,authenticated; grant select,insert,update,delete on decor_plans,decor_plan_items to service_role,authenticated');

      const migration = fs.readFileSync(path.join(root, 'sql/52_req209_decor_engagement.sql'), 'utf8');
      await db.query(migration);
      await db.query(migration);
    }
    const migration = fs.readFileSync(path.join(root, 'sql/49_req203_housing_builds.sql'), 'utf8');
    await db.query(migration);
    await db.query(migration);
    const legacyIds = [randomUUID(), randomUUID()];
    for (const [index, id] of legacyIds.entries()) {
      await db.query("select save_housing_build($1,$2,0,'旧作品','','ABCDEF',$3,true)", [sessions[0].user.id, id, !!index]);
    }
    const photosMigration = fs.readFileSync(path.join(root, 'sql/50_req203_housing_screenshots.sql'), 'utf8');
    await db.query(photosMigration);
    await db.query(photosMigration);
    const eightPhotoMigration = fs.readFileSync(path.join(root, 'sql/51_req203_eight_screenshots.sql'), 'utf8');
    await db.query(eightPhotoMigration);
    await db.query(eightPhotoMigration);
    const numbered = ['53_req207','54_req203','55_req207','56_req203','57_req209'];
    for (const prefix of numbered) {
      const migrationFile = fs.readdirSync(path.join(root,'sql')).find(name => name.startsWith(prefix));
      assert.ok(migrationFile,'缺少迁移 ' + prefix);
      const script = fs.readFileSync(path.join(root,'sql',migrationFile),'utf8');
      await db.query(script);
      await db.query(script);
    }
    for (const [index, id] of legacyIds.entries()) {
      const { rows: [previous] } = await db.query('select allow_copy,code_public from housing_builds where id=$1', [id]);
      assert.deepEqual(previous, { allow_copy: !!index, code_public: !!index });
    }
    await db.query('delete from housing_builds where id=any($1::uuid[])', [legacyIds]);
    pass('重复运行新迁移，旧公开可复制及旧隐藏设置均得到保留');
    for (const role of ['anon', 'authenticated']) {
      const { rows: [acl] } = await db.query("select has_table_privilege($1,'housing_builds','select') as private, has_column_privilege($1,'housing_build_gallery','title','select') as gallery, has_column_privilege($1,'housing_build_gallery','visible_code','select') as raw, has_column_privilege($1,'housing_build_gallery','blueprint_code','select') as old_raw, has_function_privilege($1,'save_housing_build(uuid,uuid,integer,text,text,text,boolean,boolean)','execute') as write", [role]);
      assert.deepEqual(acl, { private: false, gallery: true, raw: false, old_raw: false, write: false });
      const media = await db.query("select has_table_privilege($1,'housing_build_images','select') as readable", [role]);
      assert.equal(media.rows[0].readable, false);
    }
    pass('迁移重复执行成功，访客与普通账号只能直接读取公开视图');
    const restPort = await port();
    rest = spawn(restExe, [], { windowsHide: true, stdio: 'ignore', env: { ...process.env, Path: pgBin + path.delimiter + process.env.Path,
      PGRST_DB_URI: uri, PGRST_DB_SCHEMAS: 'public', PGRST_DB_ANON_ROLE: 'anon', PGRST_SERVER_HOST: host,
      PGRST_SERVER_PORT: String(restPort), PGRST_JWT_SECRET: signing } });
    const restBase = 'http://' + host + ':' + restPort;
    let ready = false;
    for (let i = 0; i < 100 && !ready; i++) {
      ready = await fetch(restBase + '/housing_build_gallery?select=id&limit=1').then(r => r.ok, () => false);
      if (!ready) await delay(100);
    }
    assert.ok(ready, '隔离 PostgREST 未就绪');
    const tlsCredential = JSON.parse(execFileSync('pwsh', ['-NoProfile', '-Command', [
      '$rsa=[Security.Cryptography.RSA]::Create(2048)',
      "$req=[Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=localhost',$rsa,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)",
      '$san=[Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()',
      "$san.AddIpAddress([Net.IPAddress]::Parse('127.0.0.1')); $req.CertificateExtensions.Add($san.Build())",
      '$cert=$req.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-2),[DateTimeOffset]::UtcNow.AddHours(1))',
      '@{cert=$cert.ExportCertificatePem();key=$rsa.ExportPkcs8PrivateKeyPem()} | ConvertTo-Json -Compress'
    ].join('\n')], { encoding: 'utf8', windowsHide: true }));
    tls.setDefaultCACertificates([...tls.getCACertificates('default'), tlsCredential.cert]);
    const appPort = await port();
    const base = 'http://' + host + ':' + appPort;
    gateway = https.createServer(tlsCredential, (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', base);
      res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,HEAD,OPTIONS');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      if (req.url === '/auth/v1/user') {
        const entry = sessions.find(s => req.headers.authorization === 'Bearer ' + s.access_token);
        res.writeHead(entry ? 200 : 401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(entry?.user || { message: '无测试会话' }));
      }
      if (!req.url.startsWith('/rest/v1/')) { res.writeHead(404); return res.end(); }
      if (req.url.startsWith('/rest/v1/decor_catalog?')) {
        if (withCatalog) {
          const records = JSON.parse(fs.readFileSync(path.join(root,'data/task083/catalog-current-2335.json'),'utf8'));
          const at = Number(new URL(req.url,'https://localhost').searchParams.get('offset') || 0);
          res.setHeader('Content-Type','application/json');
          return res.end(JSON.stringify(records.slice(at, at + 1000)));
        }
        const fixture = JSON.parse(fs.readFileSync(path.join(root, 'docs/evidence/bug127-20261118/catalog-row-126.json'), 'utf8'));
        res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify([{ entry_type: 1,
          category_ids: [], subcategory_ids: [], tags: [], placement_cost: 1, ...fixture }]));
      }
      // Unrelated legacy modules see an empty guild and empty notifications.
      if (!/^\/rest\/v1\/(?:housing_|rpc\/(?:save_housing|discover_housing|[a-z_]*housing_[a-z_]*))/.test(req.url) &&
          !(battleReports && (battleReports.allows(req.url) || req.url === '/rest/v1/rpc/req212_read_card' || /^\/rest\/v1\/rpc\/req191_/.test(req.url))) &&
          !(guildRoles && /^\/rest\/v1\/raid_members\?/.test(req.url)) &&
          !(recruitment && recruitment.allows(req.url)) &&
          !(lootReadback && /^\/rest\/v1\/(?:guild_members|guilds|loot_drops|rpc\/req19[19]_submit_loot)(?:\?|$)/.test(req.url)) &&
          !(withCatalog && /^\/rest\/v1\/(?:decor_item_|decor_plan|rpc\/(?:record_decor|set_decor|favorite_decor))/.test(req.url))) {
        res.setHeader('Content-Type', 'application/json'); return res.end('[]');
      }
      // The local TLS gateway and PostgREST have independent connection lifetimes.
      const { host: incomingHost, connection: incomingConnection, ...forwardHeaders } = req.headers;
      const upstream = http.request({ hostname: host, port: restPort, path: req.url.slice(8), method: req.method,
        agent: false, headers: forwardHeaders }, incoming => {
        res.writeHead(incoming.statusCode, incoming.headers);
        if (guildRoles && req.url === '/rest/v1/rpc/req191_read_roles' && incoming.statusCode === 200) {
          guildRoles.sendFragmentedRoles(incoming, res);
        } else {
          incoming.pipe(res);
        }
      });
      upstream.on('error', error => {
        console.error('隔离数据库连接失败', error.code, req.url.split('?')[0]);
        res.writeHead(502); res.end();
      });
      req.pipe(upstream);
    });
    await new Promise(resolve => gateway.listen(0, host, resolve));
    const gatewayBase = 'https://' + host + ':' + gateway.address().port;
    for (const [key, value] of Object.entries({ SUPABASE_URL: gatewayBase, SUPABASE_ANON_KEY: signer({ role: 'anon' }),
      SUPABASE_SERVICE_ROLE_KEY: signer({ role: 'service_role' }) })) {
      process.env[key] = value; process.env['COZE_' + key] = value;
    }
    process.env.DEPLOY_RUN_PORT = String(appPort);
    process.env.DEPLOY_RUN_HOST = host;
    process.env.CORS_ALLOWED_ORIGINS = base;
    // Run the actual entry point from a clean directory, independently of the developer's .env.
    for (const file of ['server.js', 'index.html', 'decor.html', 'data.html', ...(battleReports ? ['guild-report.html', 'guild-recruitment.html'] : [])]) fs.copyFileSync(path.join(root, file), path.join(temp, file));
    for (const dir of ['assets', 'css', 'js', 'lib']) {
      fs.symlinkSync(path.join(root, dir), path.join(temp, dir), 'junction'); links.push(path.join(temp, dir));
    }
    if (battleReports) battleReports.installWclFixture();
    app = require(path.join(temp, 'server.js')).startServer();
    await new Promise(resolve => app.listening ? resolve() : app.once('listening', resolve));
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const errors = [];
    async function open(session, width) {
      const context = await browser.newContext({ viewport: { width, height: width === 1366 ? 768 : 1080 },
        ignoreHTTPSErrors: true, permissions: ['clipboard-read', 'clipboard-write'] });
      await context.route('**/*', route => [base, gatewayBase].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort());
      if (session) await context.addInitScript(data => localStorage.setItem('wow_raid_supabase', JSON.stringify(data)), session);
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(e.message));
      page.setDefaultTimeout(9000);
      if (recruitment || guildRoles) {
        await page.goto(base + '/#/team/guild-settings');
      } else {
        await page.goto(base + '/#/house/community');
        await page.locator('#hbResults').getByText('暂无公开作品。').waitFor();
      }
      return page;
    }
    const author = await open(sessions[0], 1920);
    if (recruitment || guildRoles) {
      const precedingChecks = checks.length;
      await (guildRoles || recruitment).verify({author, guest:await open(null,1366), viewer:await open(sessions[1],1366), open, db, sessions, base, output, pass});
      assert.deepEqual(errors, []);
      fs.writeFileSync(path.join(output,'verification.json'), JSON.stringify({browser:browser.version(), database:'本地一次性 PostgreSQL / PostgREST', authentication:'模拟账号、认证服务与登录会话', checks:checks.slice(precedingChecks)},null,2)+'\n');
      verifiedRoles = !!guildRoles;
      return;
    }
    if (battleReports) {
      const precedingChecks = checks.length;
      await battleReports.verify({author, guest:await open(null,1366), viewer:await open(sessions[1],1366), db, base, output, pass});
      assert.deepEqual(errors, []);
      fs.writeFileSync(path.join(output,'verification.json'), JSON.stringify({browser:browser.version(), database:'一次性本地 PostgreSQL / PostgREST', fixtures:'测试账号与 WCL 报告', checks:checks.slice(precedingChecks)},null,2)+'\n');
      return;
    }
    if (lootReadback) {
      await lootReadback.verify(author, db, base, pass);
      assert.deepEqual(errors, []);
      fs.writeFileSync(path.join(output, 'loot-readback.json'), JSON.stringify({browser:browser.version(), checks}, null, 2));
      return;
    }
    const other = await open(sessions[1], 1366);
    const guest = await open(null, 1366);
    if (checkDecor) {
      await require('./verify-req209-engagement.cjs')({ db, author, guest, other, base, output });
      assert.deepEqual(errors, []);
      return;
    }
    let visitorCopyRequests = 0;
    guest.on('request', req => { if (req.url().includes('/housing-builds/copy-code')) visitorCopyRequests++; });
    const results = author.locator('#hbResults');
    const title = '海岸书房';
    const code = 'AgHTestLayoutExample1234';
    const titleInput = author.locator('#hbTitle');
    const site = base + '/api/housing-builds/';
    async function api(action, session, data) {
      const headers = session ? { Authorization: 'Bearer ' + session.access_token } : {};
      if (data) headers['Content-Type'] = 'application/json';
      const response = await fetch(site + action, { headers, method: data ? 'POST' : 'GET', body: data ? JSON.stringify(data) : undefined });
      return { status: response.status, data: await response.json() };
    }
    if (suite) {
      const admin = await open(sessions[2],1366);
      const params = {db,author,guest,other,admin,sessions,api,base,pass,output};
      const tests = {catalog:'verify-housing-card-actions',tags:'verify-req207-tags',
        supplies:'verify-housing-supplies',community:'verify-housing-community',discovery:'verify-housing-discovery'};
      for (const [key,file] of Object.entries(tests)) if (suite === 'all' || suite === key) {
        await require('./' + file + '.cjs')(params);
      }
      assert.ok(suite === 'all' || Object.hasOwn(tests,suite));
      assert.deepEqual(errors,[]);
      fs.writeFileSync(path.join(output,suite + '-verification.json'),JSON.stringify({browser:browser.version(),checks},null,2));
      return;
    }
    await guest.locator('#hbCreate').click();
    assert.ok(await guest.locator('#authOverlay').isVisible());
    await guest.reload();
    await author.locator('#hbCreate').click();
    await titleInput.fill(title);
    await author.locator('#hbDescription').fill('一间能看海的书房');
    assert.equal(await author.locator('#hbAllowCopy').isDisabled(), true);
    async function fixturePhoto(name, width, height, color) {
      const data = await author.evaluate(({ name, width, height, color }) => {
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, color); gradient.addColorStop(1, '#19313e');
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = 'white'; ctx.font = '36px sans-serif';
        ctx.fillText(name, 40, height / 2);
        return canvas.toDataURL('image/png').split(',')[1];
      }, { name, width, height, color });
      return { name: name + '.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') };
    }
    const wide = await fixturePhoto('横向截图测试', 1920, 1080, '#805a32');
    const tall = await fixturePhoto('纵向截图测试', 720, 1080, '#325c75');
    await author.locator('#hbPhotos').setInputFiles([wide, tall]);
    await author.getByText(/2\s*\/\s*8 张/).waitFor();
    await author.getByRole('button', { name: '设为封面' }).click();
    await author.locator('#hbPhotos').setInputFiles(Array(7).fill(wide));
    assert.match(await author.locator('#hbFormError').innerText(), /8 张/);
    await author.locator('#hbPhotos').setInputFiles({ name: 'blank.png', mimeType: 'image/png', buffer: Buffer.from('invalid') });
    await author.getByText(/无法读取这张图片/).waitFor();
    await author.locator('#hbCode').fill('invalid whitespace');
    await author.locator('#hbDraft').click();
    await author.getByText(/蓝图码格式有误/).waitFor();
    await author.locator('#hbCode').fill(code);
    author.once('dialog', dialog => dialog.dismiss());
    await author.keyboard.press('Escape');
    assert.equal(await titleInput.inputValue(), title);
    await author.screenshot({ path: path.join(output, 'web-editor-1920.png') });
    const mineRead = '**/api/housing-builds/mine?id=*';
    await author.route(mineRead, route => route.fulfill({ status: 503, json: { message: '回读暂时失败' } }), { times: 1 });
    await author.locator('#hbDraft').click();
    await author.locator('#hbFormError').getByText('回读暂时失败').waitFor();
    assert.equal(await author.locator('#hbCode').inputValue(), code);
    await author.locator('#hbDraft').click();
    await results.getByText(/私有草稿/).waitFor();
    await author.reload();
    await results.getByText(/私有草稿/).waitFor();
    await author.waitForFunction(() => document.querySelector('.hb-cover img')?.naturalHeight > 0);
    const draft = (await api('mine?v=2', sessions[0])).data.rows[0];
    assert.equal(draft.image_ids.length, 2);
    const photoURL = id => site + 'photo?id=' + id;
    const photoStatus = async (id, session) => (await fetch(site + (session ? 'my-photo' : 'photo') + '?id=' + id, {
      headers: session ? { Authorization: 'Bearer ' + session.access_token } : {} })).status;
    assert.equal(await photoStatus(draft.image_ids[0]), 404);
    assert.equal(await photoStatus(draft.image_ids[0], sessions[1]), 404);
    assert.equal(await photoStatus(draft.image_ids[0], sessions[0]), 200);
    pass('上传横竖图并设封面，重开后草稿图片仅作者可看，超量与损坏图片均保留已选内容');
    assert.equal((await api('gallery')).data.rows.length, 0);
    await other.locator('#hbMine').click();
    await other.locator('#hbResults').getByText('还没有自己的作品。').waitFor();
    assert.equal((await api('mine')).status, 401);
    pass('无公会作者保存私有草稿并刷新，其他账号及访客看不到，游客创作要求登录');
    pass('无效输入及写后回读失败保留表单，再次保存仍只有一份草稿');
    await results.getByText('编辑作品').click();
    await author.locator('#hbPublish').click();
    await results.getByText('查看公开作品').waitFor();
    const mine = (await api('mine?v=2', sessions[0])).data.rows[0];
    const link = base + '/' + await results.getByText('查看公开作品').getAttribute('href');
    const gallery = await api('gallery?id=' + mine.id);
    assert.equal(Object.hasOwn(gallery.data.rows[0], 'blueprint_code'), false);
    assert.equal(gallery.data.rows[0].author_name, '木匠甲');
    assert.ok(!JSON.stringify(gallery).includes(code));
    await guest.goto(link);
    await guest.getByText('作者仅展示作品').waitFor();
    assert.equal(await guest.locator('#hbResults').getByRole('button', { name: '复制蓝图码', exact: true }).count(), 0);
    const payload = { id: mine.id, title, revision: mine.revision, description: mine.description, blueprint_code: code, code_public: false, allow_copy: false,
      screenshots: mine.image_ids.map(id => ({ id })), published: true };
    assert.equal((await api('save', sessions[1], payload)).status, 409);
    assert.equal((await api('mine?id=' + mine.id, sessions[1])).status, 404);
    assert.equal((await api('save', sessions[0], payload)).data.revision, mine.revision);
    pass('仅展示作品可直达，公开响应已移除蓝图码，作者重复提交幂等，其他账号无法编辑');
    await results.getByText('编辑作品').click();
    await author.locator('#hbCodePublic').check();
    assert.equal(await author.locator('#hbAllowCopy').isChecked(), false);
    await author.locator('#hbDescription').fill('改造后的海岸书房');
    await author.locator('#hbPublish').click();
    await results.getByText('改造后的海岸书房').waitFor();
    await guest.reload();
    await guest.getByText('作者未开放蓝图复制').waitFor();
    assert.equal(await guest.getByRole('textbox', { name: '公开蓝图码' }).count(), 0);
    assert.equal(await guest.getByRole('button', { name: '复制蓝图码' }).count(), 0);
    assert.equal((await api('copy-code', null, { id: mine.id })).status, 404);
    await guest.waitForFunction(() => document.querySelector('.hb-stage img')?.naturalWidth === 720);
    await guest.getByRole('button', { name: '查看第 2 张截图' }).click();
    await guest.waitForFunction(() => document.querySelector('.hb-stage img')?.naturalWidth === 1920);
    const photoResponse = await fetch(photoURL(draft.image_ids[0]));
    assert.equal(photoResponse.headers.get('content-type').split(';')[0], 'image/jpeg');
    assert.ok(photoResponse.headers.get('cache-control').includes('no-store'));
    await guest.screenshot({ path: path.join(output, 'visible-detail-1366.png') });
    pass('作者只分享作品、关闭复制时，详情无原码与复制按钮；取码请求被拒，横竖图仍可切换');
    await results.getByText('编辑作品').click();
    await author.locator('#hbAllowCopy').check();
    await author.locator('#hbPublish').click();
    await author.locator('#housingBuildEditor').waitFor({ state: 'hidden' });
    assert.equal((await api('save', sessions[0], { ...payload, title: '过期修改' })).status, 409);
    await guest.reload();
    await guest.getByRole('button', { name: '复制蓝图码' }).waitFor();
    assert.equal(visitorCopyRequests, 0);
    for (const path of ['gallery', 'gallery?v=2', 'gallery?id=' + mine.id, 'gallery?v=2&id=' + mine.id]) {
      assert.ok(!JSON.stringify((await api(path)).data).includes(code));
    }
    assert.ok(!(await guest.locator('#hbResults').innerHTML()).includes(code));
    await guest.getByRole('button', { name: '复制蓝图码' }).click();
    await guest.waitForFunction(async expected => (await navigator.clipboard.readText()) === expected, code);
    assert.equal(visitorCopyRequests, 1);
    const back = guest.getByRole('button', { name: '返回公开作品' });
    const isBeforeTitle = await back.evaluate(btn => !!(btn.compareDocumentPosition(document.querySelector('.hb-detail h2')) & Node.DOCUMENT_POSITION_FOLLOWING));
    assert.ok(isBeforeTitle);
    await back.click();
    await guest.getByRole('link', { name: title, exact: true }).waitFor();
    assert.equal(await guest.getByRole('button', { name: '复制蓝图码' }).count(), 0);
    await guest.reload();
    await guest.getByRole('link', { name: title, exact: true }).waitFor();
    await guest.waitForFunction(() => document.querySelector('.hb-cover img')?.naturalWidth === 720);
    await guest.locator('.hb-cover img').evaluate(img => img.decode());
    await guest.screenshot({ path: path.join(output, 'web-gallery-1366.png') });
    const card = guest.locator('.hb-work').filter({ has: guest.getByRole('link', { name: title, exact: true }) });
    const album = card.locator('.hb-card-album');
    const dots = album.locator('.hb-card-dots button');
    const currentPhoto = () => dots.evaluateAll(buttons => buttons.findIndex(b => b.getAttribute('aria-current') === 'true') + 1);
    assert.equal(await dots.count(), 2);
    await album.getByRole('button', { name: '下一张截图' }).click();
    assert.equal(await currentPhoto(), 2);
    const box = await album.boundingBox();
    const py = box.y + box.height * 0.55;
    // Rightward drag returns to the cover. Pointer release must not also advance once as a click.
    await guest.mouse.move(box.x + box.width * 0.25, py);
    await guest.mouse.down();
    await guest.mouse.move(box.x + box.width * 0.75, py, { steps: 10 });
    await guest.mouse.up();
    assert.equal(await currentPhoto(), 1);
    await dots.nth(1).press('Enter');
    assert.equal(await currentPhoto(), 2);
    assert.ok(guest.url().endsWith('#/house/community'));
    await guest.reload();
    await dots.first().waitFor();
    assert.equal(await currentPhoto(), 1);
    pass('卡片箭头、键盘选点与横拖切图均留在列表，刷新后复位到作者封面');
    assert.ok(await guest.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await album.locator('a').click();
    await guest.getByRole('heading', { name: title }).waitFor();
    pass('作者开放蓝图并更新说明，访客从公开列表进详情、复制成功，旧版修改不覆盖新数据');
    await results.getByText('编辑作品').click();
    await author.locator('#hbCodePublic').uncheck();
    await author.locator('#hbPublish').click();
    await author.locator('#housingBuildEditor').waitFor({ state: 'hidden' });
    await guest.getByRole('button', { name: '复制蓝图码' }).click();
    await guest.getByText(/复制失败/).waitFor();
    assert.ok(!(await guest.locator('#hbResults').innerHTML()).includes(code));
    await guest.reload();
    await guest.getByText('作者仅展示作品').waitFor();
    assert.equal((await api('copy-code', null, { id: mine.id })).status, 404);
    pass('访客只在详情主动点击后取码；列表、详情与复制失败状态均无明码，作者撤销授权后旧详情按钮也无法取码');
    await results.getByText('编辑作品').click();
    author.once('dialog', dialog => dialog.dismiss());
    await author.locator('#hbDraft').click();
    assert.ok(await titleInput.isVisible());
    author.once('dialog', dialog => dialog.accept());
    await author.locator('#hbDraft').click();
    await results.getByText(/私有草稿/).waitFor();
    await guest.reload();
    await guest.getByText('作品不存在或已撤回').waitFor();
    assert.ok(await guest.getByRole('button', { name: '返回公开作品' }).isVisible());
    for (const id of draft.image_ids) assert.equal(await photoStatus(id), 404);
    assert.equal((await api('gallery')).data.rows.length, 0);
    assert.equal((await api('mine', sessions[0])).data.rows.length, 1);
    assert.ok(!await author.evaluate(key => JSON.stringify(Object.entries(localStorage)).includes(key), code));
    pass('撤回前可取消，确认后旧链接与公开列表均收回，作者只保留一份草稿');
    let releaseRead, startRead;
    const release = new Promise(resolve => { releaseRead = resolve; });
    const started = new Promise(resolve => { startRead = resolve; });
    await other.route('**/api/housing-builds/gallery?*', async route => {
      startRead(); await release;
      await route.fulfill({ status: 503, json: { message: '作品暂时无法读取，请重试' } });
    }, { times: 1 });
    await other.locator('#hbGallery').click();
    await started;
    await other.getByText('正在读取作品…').waitFor();
    releaseRead();
    await other.locator('#hbResults').getByRole('button', { name: '重试' }).click();
    await other.getByText('暂无公开作品。').waitFor();
    const longTitle = '沿海小屋'.repeat(20);
    await results.getByText('编辑作品').click();
    await author.getByRole('button', { name: '移除第 1 张截图' }).click();
    author.once('dialog', dialog => dialog.dismiss());
    await author.keyboard.press('Escape');
    assert.ok(await titleInput.isVisible());
    await author.locator('#hbCode').fill('');
    await titleInput.fill(longTitle);
    await author.locator('#hbDescription').fill('家具摆放与采光'.repeat(130));
    await author.locator('#hbPublish').click();
    await author.locator('#hbGallery').click();
    await author.getByRole('link', { name: longTitle, exact: true }).waitFor();
    await author.setViewportSize({ width: 1366, height: 768 });
    assert.ok(await author.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    const imageOnly = (await api('gallery?v=2&id=' + mine.id)).data.rows[0];
    assert.equal(Object.hasOwn(imageOnly, 'blueprint_code'), false);
    assert.deepEqual(imageOnly.image_ids, draft.image_ids.slice(1));
    assert.equal(await photoStatus(draft.image_ids[0]), 404);
    assert.equal(await photoStatus(draft.image_ids[1]), 200);
    pass('装修图可独立于蓝图发布，单独改图有离开保护，移除后的旧图地址已失效');
    pass('加载、读取失败、重试和空态可区分，长标题和说明在 1366 宽度正常显示');
    await other.locator('#hbCreate').click();
    await other.locator('#hbTitle').fill('窗边的花房');
    // Add a valid PNG text chunk to exercise the exact original-file limit before compression.
    function pngAtSize(png, bytes) {
      const text = Buffer.alloc(bytes - png.length - 12, 97);
      Buffer.from('Comment\0').copy(text);
      const chunk = Buffer.alloc(12 + text.length);
      chunk.writeUInt32BE(text.length);
      chunk.write('tEXt', 4);
      text.copy(chunk, 8);
      chunk.writeUInt32BE(require('node:zlib').crc32(chunk.subarray(4, -4)), chunk.length - 4);
      return Buffer.concat([png.subarray(0, -12), chunk, png.subarray(-12)]);
    }
    const maxPng = path.join(temp, '20MiB.png');
    const overPng = path.join(temp, 'over-20MiB.png');
    fs.writeFileSync(maxPng, pngAtSize(tall.buffer, 20 * 1024 * 1024));
    fs.writeFileSync(overPng, pngAtSize(tall.buffer, 20 * 1024 * 1024 + 1));
    await other.locator('#hbPhotos').setInputFiles(overPng);
    await other.locator('#hbFormError').getByText(/20 MB/).waitFor();
    assert.equal(await other.locator('.hb-tile').count(), 0);
    await other.locator('#hbPhotos').setInputFiles(maxPng);
    await other.getByText(/1\s*\/\s*8 张/).waitFor();
    // A detailed JPEG needs enough bytes to exercise the new save limit on a normal eight-image upload.
    const detailedJpeg = await other.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 640; canvas.height = 560;
      const ctx = canvas.getContext('2d');
      const raster = ctx.createImageData(canvas.width, canvas.height);
      let seed = 73;
      for (let i = 0; i < raster.data.length; i += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        raster.data[i] = seed >>> 24;
        raster.data[i + 1] = seed >>> 16 & 255;
        raster.data[i + 2] = seed >>> 8 & 255;
        raster.data[i + 3] = 255;
      }
      ctx.putImageData(raster, 0, 0);
      return canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
    });
    const detailed = { name: 'dense.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(detailedJpeg, 'base64') };
    await other.locator('#hbPhotos').setInputFiles(Array(7).fill(detailed));
    await other.getByText(/8\s*\/\s*8 张/).waitFor();
    const saveRequest = other.waitForRequest(req => req.url().includes('/housing-builds/save-v2'));
    await other.locator('#hbPublish').click();
    const uploadBytes = (await saveRequest).postDataBuffer().length;
    assert.ok(uploadBytes > 1024 * 1024 && uploadBytes <= 2 * 1024 * 1024, '八图上传应覆盖超过 1 MiB 的实际请求，收到 ' + uploadBytes);
    const secondWork = other.locator('.hb-work').filter({ hasText: '窗边的花房' });
    await secondWork.getByText('查看公开作品').waitFor();
    const secondLink = await secondWork.getByText('查看公开作品').getAttribute('href');
    await guest.goto(base + '/' + secondLink);
    await guest.getByRole('button', { name: '查看第 8 张截图' }).click();
    await guest.waitForFunction(() => document.querySelector('.hb-stage img')?.naturalHeight === 560);
    await guest.getByText('作者仅展示作品').waitFor();
    assert.equal(await guest.getByRole('textbox', { name: '公开蓝图码' }).count(), 0);
    assert.equal(await guest.getByRole('button', { name: '复制蓝图码' }).count(), 0);
    pass('20 MB 的有效 PNG 可上传，超出 1 字节被拒；八张一次保存，访客能看第八张。保存请求为 ' + uploadBytes + ' 字节');
    const secondId = secondLink.split('/').pop();
    const readSecond = async () => (await api('mine?v=2&id=' + secondId, sessions[1])).data.rows[0];
    const original = await readSecond();
    assert.equal(original.image_ids.length, 8);
    const overflowPayload = { ...original, screenshots: [...original.image_ids, randomUUID()].map(id => ({id})) };
    assert.equal((await api('save-v2', sessions[1], overflowPayload)).status, 400);
    await assert.rejects(db.query('select save_housing_build_v2($1,$2,$3,$4,$5,null,false,false,true,$6::jsonb)',
      [sessions[1].user.id, secondId, original.revision, original.title, original.description, JSON.stringify(overflowPayload.screenshots)]), /八张/);
    await secondWork.getByRole('button', { name: '编辑作品' }).click();
    async function replaceAt(index, file) {
      const replace = other.getByRole('button', { name: '更换第 ' + index + ' 张截图', exact: true });
      const choosing = other.waitForEvent('filechooser');
      await replace.focus();
      await replace.press('Enter');
      const dialog = await choosing;
      assert.equal(dialog.isMultiple(), false);
      await dialog.setFiles(file);
    }
    const beforeReplace = other.locator('#hbPreview .hb-tile img').first();
    await other.waitForFunction(() => document.querySelector('#hbPreview .hb-tile img')?.naturalWidth === 720);
    const firstImage = await beforeReplace.getAttribute('src');
    await replaceAt(1, []);
    assert.equal(await beforeReplace.getAttribute('src'), firstImage);
    await replaceAt(1, overPng);
    await other.locator('#hbFormError').getByText(/20 MB/).waitFor();
    await other.waitForFunction(() => document.querySelector('#hbPreview .hb-tile img')?.naturalWidth === 720);
    await replaceAt(1, wide);
    await other.locator('#hbPhotoStatus').getByText(/第 1 张截图已更换/).waitFor();
    await replaceAt(8, maxPng);
    await other.locator('#hbPhotoStatus').getByText(/第 8 张截图已更换/).waitFor();
    assert.equal(await other.locator('#hbPreview .hb-tile').count(), 8);
    await other.screenshot({ path: path.join(output, 'replace-eight-1366.png') });
    await other.locator('#hbPublish').click();
    await other.locator('#housingBuildEditor').waitFor({ state: 'hidden' });
    const changed = await readSecond();
    assert.notEqual(original.image_ids[0], changed.image_ids[0]);
    assert.notEqual(original.image_ids[7], changed.image_ids[7]);
    assert.deepEqual(changed.image_ids.slice(1,7), original.image_ids.slice(1,7));
    assert.equal(await photoStatus(original.image_ids[0]), 404);
    await guest.reload();
    await guest.waitForFunction(() => document.querySelector('.hb-stage img')?.naturalWidth === 1920);
    await guest.getByRole('button', { name: '查看第 8 张截图' }).click();
    await guest.waitForFunction(() => document.querySelector('.hb-stage img')?.naturalWidth === 720);
    pass('满八张时键盘打开单图更换；取消和超限保留原图，更换封面及第八张有待保存反馈。回读确认中间六个位置完全一致');
    await guest.goto(base + '/#/house/decor');
    await guest.locator('[data-add="126"]').first().click();
    await guest.locator('[data-ia-key="decor-plan"]:visible').first().click();
    await guest.locator('#dhPpExport').click();
    const list = await guest.locator('#dhPlanExportText').inputValue();
    assert.ok(list.includes('卷起来的卷轴') && !list.includes(code));
    assert.equal(await guest.locator('#dhPpShare').count(), 0);
    pass('个人方案单仍能从图鉴加入家具并导出采购清单');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'web-verification.json'), JSON.stringify({ database: '本机一次性 PostgreSQL + PostgREST', auth: '两个无公会测试会话，认证资料模拟', browser: await browser.version(), checks }, null, 2) + '\n');
  } finally {
    if (browser) await browser.close();
    if (app) await new Promise(resolve => app.close(resolve));
    if (gateway) await new Promise(resolve => gateway.close(resolve));
    if (rest && rest.exitCode === null && !rest.killed) { const stopped = new Promise(resolve => rest.once('exit', resolve)); rest.kill(); await stopped; }
    if (db) await db.end();
    if (dbStarted) run('pg_ctl', ['-D', dbDir, '-m', 'fast', '-w', 'stop']);
    for (const entry of links) fs.rmdirSync(entry);
    if (fs.realpathSync(path.dirname(temp)) === fs.realpathSync(os.tmpdir()) && path.basename(temp).startsWith('wb-req203-')) {
      fs.rmSync(temp, { recursive: true, force: true });
    }
    if (verifiedRoles) {
      assert.equal(fs.existsSync(temp), false, '本轮隔离数据库目录已移除');
      assert.ok(rest.exitCode !== null || rest.signalCode, '本轮 PostgREST 已退出');
      const file = path.join(output, 'verification.json');
      const report = JSON.parse(fs.readFileSync(file, 'utf8'));
      report.cleanup = 'Chrome、测试服务、PostgREST 及 PostgreSQL 已停止，本轮临时目录和全部测试会籍已移除';
      fs.writeFileSync(file, JSON.stringify(report, null, 2)+'\n');
    }
  }
}
main().then(() => process.exit(0), e => { console.error(e.message); process.exit(1); });
