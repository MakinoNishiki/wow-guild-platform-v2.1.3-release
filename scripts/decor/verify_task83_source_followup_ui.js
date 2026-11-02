// 真实Chrome离线夹具；共享产品脚本，只读请求，不启动生产服务或加载凭据。
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert/strict');
const { chromium } = require('../../node_modules/playwright');
const root = path.resolve(__dirname, '../..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const report = read('data/task083/source-followup-19.json');
const rows = read('scripts/decor/out/task083-followup-fixture.json');
const longText = '完整获取条件'.repeat(100);
for (const [rid, name, sources] of [
  [900001, '测试转义长文本', [{type:'event', event:'测试活动', zones:['测试地区'], source_label:'活动',
    context:[{label:'物品', value:'<img src=x onerror="window.__unsafe=1"> & '+longText}]}]],
  [900002, '测试空来源', []],
  [900003, '测试旧版来源', [{type:'quest', quest:'旧版任务', zones:['旧版地区']}]]
]) rows.push({...rows[0], record_id:rid, name, source_text:'', sources});
const expectations = {
  764:['剧场巡演','业余演员的宝箱、杰出演员的宝箱','多恩岛'],
  925:['要塞任务：突袭沙塔斯港口','塔拉多'],
  1154:['周常任务：精选之礼','物品：奥术秘藏光球','创始者之角、烈风海岸'],
  1261:['活动：货运与接收','工作：法定休假','安德麦'],
  1674:['上痛！上诅咒！上钉刺！（25人）','巫妖王团队','货真价实、如假包换的龙母的徽记','埃克斯勒','尘泥沼泽','250 金'],
  8176:['要塞任务：突击索克雷萨高地','影月谷'],
  8238:['要塞任务：突袭沙塔斯市中心','塔拉多'],
  11455:['地心寻魂','特色更新','伪造的迦拉克隆幽暗之心','斯塔克斯·紧身','安德麦','15000'],
  15583:['斯托玛兰突袭战','胜利的斯托玛兰巅峰之箱','虚影风暴'],
  15747:['斯托玛兰突袭战','胜利的斯托玛兰巅峰之箱','虚影风暴']
};
for (const rid of [10368,9290,5796,2587,1730]) expectations[rid] = expectations[1154];
for (const rid of [2434,2432,2431,2324]) expectations[rid] = ['活动：日常任务','物品：自动拼装式家具包','麦卡贡'];
const html = shell => `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/css/main.css"><link rel="stylesheet" href="/css/decor-public.css"><body class="${shell ? '' : 'data-decor-body'}"><div id="page-decor"><div class="dh-filterbar" id="dhFilterBar"></div><main class="dh-main" id="dhMain"></main></div><script src="/js/decorDict.js"></script><script src="/js/decorData.js"></script>${shell ? '<script>DecorCatalog.mount(document.getElementById("page-decor"))</script>' : ''}`;
let fail = false;
const server = http.createServer((req,res) => {
  const url = new URL(req.url,'http://local');
  if (url.pathname === '/fixture') {res.setHeader('Content-Type','text/html; charset=utf-8'); return res.end(html(url.searchParams.has('shell')));}
  res.setHeader('Content-Type','application/json');
  if (url.pathname === '/api/supabase-config') return res.end(JSON.stringify({url:`http://127.0.0.1:${server.address().port}`,anonKey:'offline-fixture'}));
  if (url.pathname === '/rest/v1/decor_catalog') {
    if (fail) {res.writeHead(503); return res.end('{}');}
    const n = Number(url.searchParams.get('offset') || 0); return res.end(JSON.stringify(rows.slice(n,n+1000)));
  }
  const file = path.resolve(root,'.'+url.pathname);
  if (!/^(\/js\/|\/css\/|\/assets\/)/.test(url.pathname) || !file.startsWith(root+path.sep)) {res.writeHead(404); return res.end();}
  try {res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'image/png'); res.end(fs.readFileSync(file));}
  catch {res.writeHead(404);res.end();}
});
let browser;
(async () => {
  await new Promise(r => server.listen(0,'127.0.0.1',r));
  browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true});
  const page = await browser.newPage();
  const errors = [], cases = [];
  page.on('pageerror', e => errors.push(e.message));
  const base = `http://127.0.0.1:${server.address().port}`;
  await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  const output = path.join(root,'docs/evidence/task083-followup-20261103'); fs.mkdirSync(output,{recursive:true});
  for (const [width,height,shell] of [[1366,768,false],[1920,1080,true]]) {
    await page.setViewportSize({width,height});
    await page.goto(base+'/fixture'+(shell?'?shell=1':''));
    await page.waitForSelector('#dhSearch');
    async function open(rid) {
      await page.locator('#dhSrcChips button').first().click();
      const row = rows.find(r=>r.record_id===rid);
      await page.locator('#dhSearch').fill(row.name);
      await page.locator(`.dh-card[data-rid="${rid}"]`).click();
      await page.waitForSelector('.dh-modal-overlay.show');
      await page.waitForFunction(() => {
        const el = document.querySelector('.dh-modal-overlay.show');
        return el && getComputedStyle(el).opacity === '1';
      });
      return page.locator('.dh-src-list');
    }
    async function close() {await page.keyboard.press('Escape'); await page.waitForSelector('.dh-modal-overlay',{state:'detached'});}
    for (const r of report.ready) {
      const source = await open(r.record_id); const text = await source.innerText();
      for (const expected of expectations[r.record_id]) assert(text.includes(expected),`${r.record_id}: missing ${expected}`);
      assert(!/\|[crnHT]/.test(text),text);
      const overflow = await source.evaluate(e=>e.scrollWidth>e.clientWidth+1); assert(!overflow);
      if ([1154,1261,1674].includes(r.record_id)) await page.screenshot({path:path.join(output,`${r.record_id}-${width}.png`)});
      cases.push({width,shell,record_id:r.record_id,text}); await close();
      // 当前搜索名下逐个点击每种分类，验证同一家具能从各来源筛出。
      for (const type of new Set(r.sources.map(s=>s.type))) {
        const labels={quest:'任务',event:'事件',treasure:'宝藏',achievement:'成就',vendor:'商人'};
        await page.locator('#dhSrcChips button').filter({hasText:new RegExp('^'+labels[type])}).click();
        assert.equal(await page.locator(`.dh-card[data-rid="${r.record_id}"]`).count(),1);
      }
      if (r.record_id === 1674) {
        await page.locator('#dhSrcChips button').filter({hasText:/^商人/}).click();
        assert.equal(await page.locator('.dh-card[data-rid="1674"]').count(),0,
          '龙母家具应归成就，相关商人只保留说明');
      }
    }
    await page.locator('#dhSrcChips button').first().click();
    for (const r of report.pending) {
      await page.locator('#dhSearch').fill(r.name);
      await page.locator('#dhSrcChips button').filter({hasText:/^无来源/}).click();
      assert.equal(await page.locator(`.dh-card[data-rid="${r.record_id}"]`).count(),1);
    }
    let source = await open(900001);
    assert((await source.innerText()).includes(longText)); assert.equal(await source.locator('img').count(),0);
    assert.equal(await page.evaluate(()=>window.__unsafe),undefined);
    assert.equal(await source.evaluate(e=>e.scrollWidth>e.clientWidth+1),false); await close();
    source=await open(900002); assert.equal(await source.innerText(),'来源未知'); await close();
    source=await open(900003); assert.equal(await source.innerText(),'任务：旧版任务（旧版地区）'); await close();
    await page.locator('#dhSearch').fill('完全不存在的测试条目'); assert.equal(await page.locator('.dh-card').count(),0);
  }
  fail=true; await page.reload(); await page.waitForSelector('#dhRetry');
  assert((await page.locator('.dh-error').innerText()).length>0);
  fail=false; await page.locator('#dhRetry').click(); await page.waitForSelector('#dhSearch');
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify({source:'offline Chrome fixture; real product renderer; no production DB',cases,remaining:9,errors,sourceFilters:true,empty:true,longText:true,escaping:true,legacy:true,networkRetry:true},null,2));
  console.log('PASS 38详情用例、来源筛选、9待核保留、长文本转义、旧格式、空态、网络失败重试；双挂载；0 pageerror');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
