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
const output = path.join(root, 'docs/evidence/req203-photos-20261119');
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
    const legacyIds = [randomUUID(), randomUUID()];
    for (const [index, id] of legacyIds.entries()) {
      await db.query("select save_housing_build($1,$2,0,'旧作品','','ABCDEF',$3,true)", [sessions[0].user.id, id, !!index]);
    }
    const photosMigration = fs.readFileSync(path.join(root, 'sql/50_req203_housing_screenshots.sql'), 'utf8');
    await db.query(photosMigration);
    await db.query(photosMigration);
    for (const [index, id] of legacyIds.entries()) {
      const { rows: [previous] } = await db.query('select allow_copy,code_public from housing_builds where id=$1', [id]);
      assert.deepEqual(previous, { allow_copy: !!index, code_public: !!index });
    }
    await db.query('delete from housing_builds where id=any($1::uuid[])', [legacyIds]);
    pass('重复运行新迁移，旧公开可复制及旧隐藏设置均得到保留');
    for (const role of ['anon', 'authenticated']) {
      const { rows: [acl] } = await db.query("select has_table_privilege($1,'housing_builds','select') as private, has_table_privilege($1,'housing_build_gallery','select') as gallery, has_function_privilege($1,'save_housing_build(uuid,uuid,integer,text,text,text,boolean,boolean)','execute') as write", [role]);
      assert.deepEqual(acl, { private: false, gallery: true, write: false });
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
    await author.getByText('已选 2 / 4 张').waitFor();
    await author.getByRole('button', { name: '设为封面' }).click();
    await author.locator('#hbPhotos').setInputFiles([wide, wide, wide]);
    await author.getByText(/请减少所选图片/).waitFor();
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
    assert.equal(gallery.data.rows[0].blueprint_code, null);
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
    assert.equal(await guest.getByRole('textbox', { name: '公开蓝图码' }).inputValue(), code);
    assert.equal(await guest.getByRole('button', { name: '复制蓝图码' }).count(), 0);
    assert.equal((await api('gallery?id=' + mine.id)).data.rows[0].blueprint_code, null);
    await guest.waitForFunction(() => document.querySelector('.hb-stage img')?.naturalWidth === 720);
    await guest.getByRole('button', { name: '查看第 2 张截图' }).click();
    await guest.waitForFunction(() => document.querySelector('.hb-stage img')?.naturalWidth === 1920);
    const photoResponse = await fetch(photoURL(draft.image_ids[0]));
    assert.equal(photoResponse.headers.get('content-type').split(';')[0], 'image/jpeg');
    assert.ok(photoResponse.headers.get('cache-control').includes('no-store'));
    await guest.screenshot({ path: path.join(output, 'visible-detail-1366.png') });
    pass('原码公开且关闭一键复制时，详情显示原码，旧入口不提供复制，可切换查看完整横竖图');
    await results.getByText('编辑作品').click();
    await author.locator('#hbAllowCopy').check();
    await author.locator('#hbPublish').click();
    await author.locator('#housingBuildEditor').waitFor({ state: 'hidden' });
    assert.equal((await api('save', sessions[0], { ...payload, title: '过期修改' })).status, 409);
    await guest.reload();
    await guest.getByRole('button', { name: '复制蓝图码' }).click();
    assert.equal(await guest.evaluate(() => navigator.clipboard.readText()), code);
    await guest.getByText('返回公开作品').click();
    await guest.getByRole('link', { name: title, exact: true }).waitFor();
    await guest.reload();
    await guest.getByRole('link', { name: title, exact: true }).waitFor();
    await guest.waitForFunction(() => document.querySelector('.hb-cover img')?.naturalWidth === 720);
    await guest.locator('.hb-cover img').evaluate(img => img.decode());
    await guest.screenshot({ path: path.join(output, 'web-gallery-1366.png') });
    assert.ok(await guest.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await guest.getByRole('link', { name: title, exact: true }).click();
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
    assert.equal(imageOnly.blueprint_code, null);
    assert.deepEqual(imageOnly.image_ids, draft.image_ids.slice(1));
    assert.equal(await photoStatus(draft.image_ids[0]), 404);
    assert.equal(await photoStatus(draft.image_ids[1]), 200);
    pass('装修图可独立于蓝图发布，单独改图有离开保护，移除后的旧图地址已失效');
    pass('加载、读取失败、重试和空态可区分，长标题和说明在 1366 宽度正常显示');
    await other.locator('#hbCreate').click();
    await other.locator('#hbTitle').fill('窗边的花房');
    await other.locator('#hbPhotos').setInputFiles([wide, tall, wide, tall]);
    await other.getByText('已选 4 / 4 张').waitFor();
    await other.locator('#hbPublish').click();
    const secondWork = other.locator('.hb-work').filter({ hasText: '窗边的花房' });
    await secondWork.getByText('查看公开作品').waitFor();
    const secondLink = await secondWork.getByText('查看公开作品').getAttribute('href');
    await guest.goto(base + '/' + secondLink);
    await guest.getByRole('button', { name: '查看第 4 张截图' }).click();
    await guest.waitForFunction(() => document.querySelector('.hb-stage img')?.naturalHeight === 1080);
    await guest.getByText('作者仅展示作品').waitFor();
    assert.equal(await guest.getByRole('textbox', { name: '公开蓝图码' }).count(), 0);
    assert.equal(await guest.getByRole('button', { name: '复制蓝图码' }).count(), 0);
    pass('另一位无公会作者从空白表单一次上传四张截图，留空蓝图并直接发布，游客可浏览第四张');
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
