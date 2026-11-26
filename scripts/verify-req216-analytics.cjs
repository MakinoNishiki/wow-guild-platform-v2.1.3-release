// WB_PG_BIN and NODE_PATH point to the local PostgreSQL tools and pg, respectively.
// Runs against a newly created database. --samples regenerates the offline review data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { Client } = require('pg');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const review = path.join(root, 'design-plans/req216-analytics');
const first = '2026-11-17T00:00:00+08:00';
const last = '2026-11-28T00:00:00+08:00';

async function run() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-analytics216-'));
  const dataDir = path.join(dir, 'data');
  const pwFile = path.join(dir, 'pw');
  const password = randomUUID();
  const bin = process.env.WB_PG_BIN;
  const pgTool = (name, args) => execFileSync(path.join(bin, name + (process.platform === 'win32' ? '.exe' : '')), args, {windowsHide:true, stdio:'ignore'});
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  let started = false, db, browser;
  try {
    fs.writeFileSync(pwFile, password);
    pgTool('initdb', ['-D', dataDir, '-U', 'postgres', '-A', 'scram-sha-256', '--pwfile', pwFile, '--no-locale', '--encoding=UTF8']);
    fs.unlinkSync(pwFile);
    pgTool('pg_ctl', ['-D',dataDir,'-l',path.join(dir,'server.log'),'-o','-h 127.0.0.1 -p '+port,'-w','start']);
    started = true;
    db = new Client({host:'127.0.0.1',port,user:'postgres',database:'postgres',password});
    await db.connect();
    await db.query('create role anon; create role authenticated; create role service_role;');
    const migration = read('sql/61_req216_analytics_sources.sql');
    for (const file of ['33_task054_analytics_events.sql','36_task060_analytics_page_re.sql','48_bug115_analytics_counts.sql']) await db.query(read('sql/'+file));
    const summary = async (start, end, grain, page='all') =>
      (await db.query('select public.analytics_overview($1,$2,$3,$4) as data',[start,end,grain,page])).rows[0].data;
    await db.query("insert into analytics_events(ts,event,page,vid,ref_dom) values "+
      "('2026-11-25 23:59+08','page_view','index:decor','a','ngabbs.com'),"+
      "('2026-11-26 00:00+08','page_view','index:decor','a','ngabbs.com'),"+
      "('2026-11-26 00:03+08','page_view','index:decor','a','ngabbs.com'),"+
      "('2026-11-26 13:20+08','page_view','index:home','b','ngabbs.com'),"+
      "('2026-11-27 12:00+08','page_view','index:home','b',null),"+
      "('2026-11-27 12:30+08','tab_click','index:decor','a','ngabbs.com'),"+
      "('2026-11-27 12:31+08','decor_plan_add','index:decor','a','ngabbs.com'),"+
      "('2026-11-27 12:32+08','decor_plan_create','index:decor-plan','a',null),"+
      "('2026-11-27 12:33+08','decor_plan_save','index:decor-plan','a',null),"+
      "('2026-11-27 12:34+08','user_register','index:login','a',null),"+
      "('2026-11-28 00:00+08','page_view','index:home','c','excluded.example')");
    const previous = await summary(first,last,'day');
    await db.query(migration);
    await db.query(migration);
    const samples = {};
    for (const grain of ['hour','day','week','month']) {
      const s = await summary(grain === 'hour' ? '2026-11-26 00:00+08' : first,
        grain === 'hour' ? '2026-11-27 00:00+08' : last, grain);
      samples[grain] = {buckets:s.series.map(x=>x.bucket),refs:s.refs,events:s.events};
    }
    const daily = await summary(first,last,'day');
    assert.deepEqual({...daily,refs:daily.refs.map(({periods,...rest})=>rest)},previous);
    assert.equal(daily.refs[0].uv,2);
    assert.deepEqual(daily.refs[0].periods.map(p=>[p.bucket,p.pv,p.uv]),[
      ['2026-11-25T00:00:00+08:00',1,1],['2026-11-26T00:00:00+08:00',3,2]]);
    assert.equal(daily.refs[1].ref_dom,'直接访问');
    assert.equal(samples.hour.refs[0].periods[0].pv,2);
    assert.equal(samples.hour.refs[0].periods[0].uv,1);
    assert.equal(samples.week.refs[0].periods[0].bucket,'2026-11-23T00:00:00+08:00');
    assert.equal(samples.month.refs[0].periods[0].bucket,'2026-11-01T00:00:00+08:00');
    assert.equal((await summary(first,last,'day','index:decor')).refs[0].pv,3);
    assert.deepEqual((await summary(first,last,'day','index:loot')).refs,[]);
    const acl = await db.query("select has_function_privilege('authenticated','analytics_overview(timestamptz,timestamptz,text,text)','execute') as member,has_function_privilege('anon','analytics_overview(timestamptz,timestamptz,text,text)','execute') as guest");
    assert.deepEqual(acl.rows[0],{member:false,guest:false});
    await db.query('begin');
    await db.query("insert into analytics_events(ts,event,page,uid,vid,ref_dom) select $1,'page_view','index:home',$2::uuid,n::text,'repeat.example' from generate_series(1,3) n",[first,randomUUID()]);
    await db.query("insert into analytics_events(ts,event,page,vid,ref_dom) select $1,'page_view','index:home',n::text,'sample-'||n||'.example' from generate_series(1,12) n",[first]);
    const ranked = (await summary(first,last,'day')).refs;
    assert.equal(ranked.length,10);
    assert.equal(ranked.find(r=>r.ref_dom==='repeat.example').periods[0].uv,1);
    assert.ok(ranked.every(ref=>ref.pv===ref.periods.reduce((n,p)=>n+p.pv,0)));
    await db.query('rollback');
    const sampleJS = 'const analyticsSamples = '+JSON.stringify(samples,null,2)+';\n';
    if (process.argv.includes('--samples')) fs.writeFileSync(path.join(review,'sample.js'), sampleJS);
    else assert.equal(read('design-plans/req216-analytics/sample.js').replace(/\r\n/g,'\n'), sampleJS);
    console.log('PostgreSQL: upgrade, repeat, original totals, deduplication, Beijing buckets, page filter and ACL passed');
    browser = await chromium.launch({channel:'chrome',headless:true});
    await checkBrowser(browser, summary);
    const preview = await browser.newPage({viewport:{width:1440,height:900}});
    await preview.goto(pathToFileURL(path.join(review,'index.html')).href);
    await preview.getByText('按时间查看',{exact:true}).click();
    await preview.getByLabel('访问来源',{exact:true}).selectOption({label:'ngabbs.com'});
    assert.equal(await preview.locator('.anx-source-rows tbody tr').count(),8);
    if (process.argv.includes('--samples')) await preview.locator('main').screenshot({path:path.join(review,'after.png')});
    await preview.close();
  } finally {
    if (browser) await browser.close();
    if (db) await db.end();
    if (started) pgTool('pg_ctl',['-D',dataDir,'-m','fast','-w','stop']);
    fs.rmSync(dir,{recursive:true,force:true});
  }
}

async function checkBrowser(browser, summary) {
  const page = await browser.newPage({locale:'zh-CN',timezoneId:'America/New_York',viewport:{width:1440,height:900}});
  const requests = [];
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://analytics.test') return route.abort();
    if (url.pathname === '/api/analytics/summary') {
      const q = route.request().postDataJSON();
      requests.push(q);
      return route.fulfill({json:await summary(q.start,q.end,q.grain,q.page)});
    }
    if (url.pathname.startsWith('/api/')) return route.fulfill({json:{}});
    const resource = url.pathname.slice(1) || 'index.html';
    const file = path.resolve(root, resource);
    if (file.startsWith(root+path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) return route.fulfill({path:file});
    return route.fulfill({status:404,body:''});
  });
  await page.goto('http://analytics.test/');
  // Exercise the real data-center tab and action handlers with a local administrator fixture.
  await page.evaluate(() => {
    window.CloudSync.getAccessToken = async ()=>'isolated-test-session';
    window.CloudSync.getCachedUser = ()=>({id:'reviewer',app_metadata:{role:'superadmin'}});
    window.CloudSync.getCurrentGuild = ()=>({id:'review-guild', name:'统计测试公会'});
    window.CloudSync.getCurrentMembership = ()=>({user_id:'reviewer',guild_id:'review-guild',role:'owner'});
    window.MasterData.isSuperadmin = ()=>true;
    window.MasterData.isLoaded = ()=>true;
    iaEnterShell();
    location.hash = '#/team/datacenter';
    iaApplyRoute();
  });
  await page.locator('[data-mdtab="analytics"]').click({timeout:5000});
  await page.waitForFunction(()=>!anxState.loading && anxState.inited);
  await page.getByRole('button',{name:'自定义',exact:true}).click();
  await page.locator('#anxStart').fill('2026-11-17');
  await page.locator('#anxEnd').fill('2026-11-27');
  const query = async () => {
    await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/analytics/summary')),page.locator('#anxQueryBtn').click()]);
    await page.waitForFunction(()=>!anxState.loading);
  };
  await query();
  assert.equal(requests.at(-1).start,'2026-11-16T16:00:00.000Z');
  assert.equal(requests.at(-1).end,'2026-11-27T16:00:00.000Z');
  assert.equal(await page.locator('#anxBody [title="page_view"]').textContent(),'浏览页面');
  assert.equal(await page.locator('#anxBody [title="tab_click"]').textContent(),'点击导航页签');
  await page.getByText('按时间查看',{exact:true}).click();
  const rows = page.locator('.anx-source-rows tbody tr');
  assert.deepEqual(await rows.nth(0).locator('td').allTextContents(),['2026-11-27','0','0']);
  assert.deepEqual(await rows.nth(1).locator('td').allTextContents(),['2026-11-26','3','2']);
  const count = requests.length;
  await page.getByRole('button',{name:'较早'}).click();
  assert.equal(await rows.count(),3);
  await page.getByLabel('访问来源',{exact:true}).selectOption({label:'直接访问'});
  assert.deepEqual(await rows.nth(0).locator('td').allTextContents(),['2026-11-27','1','1']);
  assert.equal(requests.length,count);
  for (const grain of ['week','month','hour']) {
    await page.locator('#anxGrain').selectOption(grain);
    await query();
    assert.equal(await page.getByLabel('访问来源',{exact:true}).inputValue(),'1');
    assert.equal(await rows.nth(0).locator('td').first().textContent(),{week:'2026-11-23',month:'2026-11',hour:'2026-11-27 23:00'}[grain]);
  }
  const whitelist = read('server.js').match(/const TRACK_EVENTS = (\[[\s\S]*?\]);/)[1];
  const labels = await page.evaluate(()=>ANX_EVENT_LABEL);
  assert.deepEqual(Object.keys(labels).sort(),JSON.parse(whitelist).sort());
  assert.ok(Object.values(labels).every(l=>/[\u4e00-\u9fff]/.test(l)));
  await page.locator('#anxPage').selectOption('index:decor-plan');
  await query();
  assert.equal(await page.locator('#anxBody [title="decor_plan_save"]').textContent(),'保存方案单');
  assert.equal(await page.locator('.anx-source-history').count(),0);
  const oldResponse = await summary(first,last,'day');
  oldResponse.refs.forEach(ref=>delete ref.periods);
  await page.route('**/api/analytics/summary',route=>route.fulfill({json:oldResponse}));
  await query();
  assert.equal(await page.getByText('来源分时明细暂未就绪。').count(),1);
  assert.deepEqual(errors,[]);
  await page.close();
  console.log('Chrome: data center, 15 Chinese labels, Beijing custom range, source selection, zero rows, paging and four grains passed');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
