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
const output = path.join(root, 'docs/evidence/req203-20261118');
const host = '127.0.0.1';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function port() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(0, host, resolve));
  const number = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return number;
}
async function main() {
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
  const sessions = ['木匠甲', '木匠乙'].map((name, index) => {
    const id = randomUUID();
    const user = { id, aud: 'authenticated', role: 'authenticated', email: 'fixture' + index + '@example.invalid',
      user_metadata: { display_name: name }, app_metadata: {}, created_at: new Date().toISOString() };
    return { user, access_token: signer({ sub: id, role: 'authenticated', aud: 'authenticated' }),
      refresh_token: randomUUID(), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600 };
  });
  let db, dbStarted, rest, gateway, app, browser;
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
    await db.query('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key, raw_user_meta_data jsonb)');
    for (const { user } of sessions) await db.query('insert into auth.users values ($1,$2)', [user.id, user.user_metadata]);
    const migration = fs.readFileSync(path.join(root, 'sql/49_req203_housing_builds.sql'), 'utf8');
    await db.query(migration);
    await db.query(migration);
    for (const role of ['anon', 'authenticated']) {
      const { rows: [acl] } = await db.query("select has_table_privilege($1,'housing_builds','select') as private, has_table_privilege($1,'housing_build_gallery','select') as gallery, has_function_privilege($1,'save_housing_build(uuid,uuid,integer,text,text,text,boolean,boolean)','execute') as write", [role]);
      assert.deepEqual(acl, { private: false, gallery: true, write: false });
    }
    pass('迁移重复执行成功，访客与普通账号只能直接读取公开视图');
    const restPort = await port();
    rest = spawn(restExe, [], { windowsHide: true, stdio: 'ignore', env: { ...process.env, Path: pgBin + path.delimiter + process.env.Path,
      PGRST_DB_URI: uri, PGRST_DB_SCHEMAS: 'public', PGRST_DB_ANON_ROLE: 'anon', PGRST_SERVER_HOST: host,
      PGRST_SERVER_PORT: String(restPort), PGRST_JWT_SECRET: signing } });
    const restBase = 'http://' + host + ':' + restPort;
    let ready = false;
    for (let i = 0; i < 100 && !ready; i++) {
      ready = await fetch(restBase + '/housing_build_gallery?limit=1').then(r => r.ok, () => false);
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
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,HEAD,OPTIONS');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      if (req.url === '/auth/v1/user') {
        const entry = sessions.find(s => req.headers.authorization === 'Bearer ' + s.access_token);
        res.writeHead(entry ? 200 : 401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(entry?.user || { message: '无测试会话' }));
      }
      if (!req.url.startsWith('/rest/v1/')) { res.writeHead(404); return res.end(); }
      if (req.url.startsWith('/rest/v1/decor_catalog?')) {
        const fixture = JSON.parse(fs.readFileSync(path.join(root, 'docs/evidence/bug127-20261118/catalog-row-126.json'), 'utf8'));
        res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify([{ entry_type: 1,
          category_ids: [], subcategory_ids: [], tags: [], placement_cost: 1, ...fixture }]));
      }
      // Unrelated legacy modules see an empty guild and empty notifications.
      if (!/^\/rest\/v1\/(?:housing_build|rpc\/save_housing_build)/.test(req.url)) {
        res.setHeader('Content-Type', 'application/json'); return res.end('[]');
      }
      const upstream = http.request({ hostname: host, port: restPort, path: req.url.slice(8), method: req.method, headers: req.headers }, incoming => {
        res.writeHead(incoming.statusCode, incoming.headers); incoming.pipe(res);
      });
      upstream.on('error', () => { res.writeHead(502); res.end(); });
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
    for (const file of ['server.js', 'index.html', 'decor.html', 'data.html']) fs.copyFileSync(path.join(root, file), path.join(temp, file));
    for (const dir of ['assets', 'css', 'js', 'lib']) {
      fs.symlinkSync(path.join(root, dir), path.join(temp, dir), 'junction'); links.push(path.join(temp, dir));
    }
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
      await page.goto(base + '/#/house/community');
      await page.locator('#hbResults').getByText('暂无公开作品。').waitFor();
      return page;
    }
    const author = await open(sessions[0], 1920);
    const other = await open(sessions[1], 1366);
    const guest = await open(null, 1366);
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
    await guest.locator('#hbCreate').click();
    assert.ok(await guest.locator('#authOverlay').isVisible());
    await guest.reload();
    await author.locator('#hbCreate').click();
    await titleInput.fill(title);
    await author.locator('#hbDescription').fill('一间能看海的书房');
    await author.locator('#hbCode').fill('invalid whitespace');
    await author.locator('#hbDraft').click();
    await author.getByText('请填写作品名，并粘贴游戏复制的完整蓝图码。').waitFor();
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
    assert.equal((await api('gallery')).data.rows.length, 0);
    await other.locator('#hbMine').click();
    await other.locator('#hbResults').getByText('还没有自己的作品。').waitFor();
    assert.equal((await api('mine')).status, 401);
    pass('无公会作者保存私有草稿并刷新，其他账号及访客看不到，游客创作要求登录');
    pass('无效输入及写后回读失败保留表单，再次保存仍只有一份草稿');
    await results.getByText('编辑作品').click();
    await author.locator('#hbPublish').click();
    await results.getByText('查看公开作品').waitFor();
    const mine = (await api('mine', sessions[0])).data.rows[0];
    const link = base + '/' + await results.getByText('查看公开作品').getAttribute('href');
    const gallery = await api('gallery?id=' + mine.id);
    assert.equal(gallery.data.rows[0].blueprint_code, null);
    assert.equal(gallery.data.rows[0].author_name, '木匠甲');
    assert.ok(!JSON.stringify(gallery).includes(code));
    await guest.goto(link);
    await guest.getByText('作者仅展示作品').waitFor();
    assert.equal(await guest.locator('#hbResults').getByRole('button', { name: '复制蓝图码', exact: true }).count(), 0);
    const payload = { id: mine.id, title, revision: mine.revision, description: mine.description, blueprint_code: code, code_public: false, published: true };
    assert.equal((await api('save', sessions[1], payload)).status, 409);
    assert.equal((await api('mine?id=' + mine.id, sessions[1])).status, 404);
    assert.equal((await api('save', sessions[0], payload)).data.revision, mine.revision);
    pass('仅展示作品可直达，公开响应已移除蓝图码，作者重复提交幂等，其他账号无法编辑');
    await results.getByText('编辑作品').click();
    await author.locator('#hbCodePublic').check();
    await author.locator('#hbDescription').fill('改造后的海岸书房');
    await author.locator('#hbPublish').click();
    await results.getByText('改造后的海岸书房').waitFor();
    assert.equal((await api('save', sessions[0], { ...payload, title: '过期修改' })).status, 409);
    await guest.reload();
    await guest.getByRole('button', { name: '复制蓝图码' }).click();
    assert.equal(await guest.evaluate(() => navigator.clipboard.readText()), code);
    await guest.getByText('返回公开作品').click();
    await guest.getByRole('link', { name: title }).waitFor();
    await guest.reload();
    await guest.getByRole('link', { name: title }).waitFor();
    await guest.screenshot({ path: path.join(output, 'web-gallery-1366.png') });
    assert.ok(await guest.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await guest.getByRole('link', { name: title }).click();
    await guest.getByRole('heading', { name: title }).waitFor();
    pass('作者开放蓝图并更新说明，访客从公开列表进详情、复制成功，旧版修改不覆盖新数据');
    await results.getByText('编辑作品').click();
    await author.locator('#hbCodePublic').uncheck();
    await author.locator('#hbPublish').click();
    await author.locator('#housingBuildEditor').waitFor({ state: 'hidden' });
    await guest.reload();
    await guest.getByText('作者仅展示作品').waitFor();
    assert.equal((await api('gallery?id=' + mine.id)).data.rows[0].blueprint_code, null);
    pass('已公开的作品可单独收回蓝图码，原链接仍可查看作品介绍');
    await results.getByText('编辑作品').click();
    author.once('dialog', dialog => dialog.dismiss());
    await author.locator('#hbDraft').click();
    assert.ok(await titleInput.isVisible());
    author.once('dialog', dialog => dialog.accept());
    await author.locator('#hbDraft').click();
    await results.getByText(/私有草稿/).waitFor();
    await guest.reload();
    await guest.getByText('作品不存在或已撤回').waitFor();
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
    await titleInput.fill(longTitle);
    await author.locator('#hbDescription').fill('家具摆放与采光'.repeat(130));
    await author.locator('#hbPublish').click();
    await author.locator('#hbGallery').click();
    await author.getByRole('link', { name: longTitle }).waitFor();
    await author.setViewportSize({ width: 1366, height: 768 });
    assert.ok(await author.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    pass('加载、读取失败、重试和空态可区分，长标题和说明在 1366 宽度正常显示');
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
  }
}
main().then(() => process.exit(0), e => { console.error(e.message); process.exit(1); });
