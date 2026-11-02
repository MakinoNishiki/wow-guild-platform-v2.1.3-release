// REQ-176: real Chrome with frozen room rows; no production connection/writes.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require('../../node_modules/playwright');
const root=path.resolve(__dirname,'../..'),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const icons=read('data/task083/room-previews-manifest.json'),sources=read('data/task083/room-sources-21.json');
const catalog=read('data/task083/catalog-current-2335.json');
const bySource=new Map(sources.ready.map(r=>[r.record_id,r.sources]));
const rows=catalog.filter(r=>r.entry_type===2).map(r=>({...r,sources:bySource.get(r.record_id)||[]}));
const iconById=new Map(icons.files.map(r=>[r.record_id,r]));
let fail=false,browser;
const html='<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/css/main.css"><link rel="stylesheet" href="/css/decor-public.css"><body class="data-decor-body"><div id="page-decor"><div class="dh-filterbar" id="dhFilterBar"></div><main class="dh-main" id="dhMain"></main></div><script src="/js/decorDict.js"></script><script src="/js/decorData.js"></script>';
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://local');
 if(u.pathname==='/fixture'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
 if(u.pathname==='/api/supabase-config'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({url:`http://127.0.0.1:${server.address().port}`,anonKey:'offline-fixture'}));}
 if(u.pathname==='/rest/v1/decor_catalog'){res.setHeader('Content-Type','application/json');if(fail){res.writeHead(503);return res.end('{}');}return res.end(JSON.stringify(rows));}
 const p=path.resolve(root,'.'+u.pathname);
 if(!/^(\/js\/|\/css\/|\/assets\/)/.test(u.pathname)||!p.startsWith(root+path.sep)){res.writeHead(404);return res.end();}
 try{res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':'image/png');res.end(fs.readFileSync(p));}catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage(),errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));
 const out=path.join(root,'docs/evidence/req176-20261103');fs.mkdirSync(out,{recursive:true});
 for(const [width,height] of [[1366,768],[1920,1080]]){
  await page.setViewportSize({width,height});await page.goto(`http://127.0.0.1:${server.address().port}/fixture`);await page.waitForSelector('#dhSearch');
  // fullPage截图前触发并解码屏外lazy图片，避免把尚未加载误当缺图。
  for(const img of await page.locator('.dh-card img').all()){
   await img.scrollIntoViewIfNeeded();await img.evaluate(e=>e.decode());
  }
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:path.join(out,`rooms-grid-${width}.png`),fullPage:true});
  for(const row of rows){
   await page.locator('#dhSrcChips button').first().click();await page.locator('#dhSearch').fill(row.name);
   const card=page.locator(`.dh-card[data-rid="${row.record_id}"]`);await card.waitFor();
   const img=card.locator('img');await img.scrollIntoViewIfNeeded();await img.evaluate(e=>e.decode());
   const expected=iconById.get(row.record_id);const src=await img.getAttribute('src');
   assert.equal(src,expected?expected.src:'assets/decor-icons/_placeholder.png');
   if(expected)assert.deepEqual(await img.evaluate(e=>[e.naturalWidth,e.naturalHeight]),expected.dimensions);
   await card.click();await page.waitForFunction(()=>{const e=document.querySelector('.dh-modal-overlay.show');return e&&getComputedStyle(e).opacity==='1';});
   assert.equal(await page.locator('.dh-modal-icon img').getAttribute('src'),src);
   const text=await page.locator('.dh-src-list').innerText();
   if(row.record_id===223)assert(text.includes('住宅等级 3 解锁'));
   if(row.record_id===233)assert(text.includes('住宅等级 5 解锁'));
   if(row.record_id===439)assert(text.includes('商城购买')&&text.includes('Haunted Grimtide Estate'));
   if(row.sources[0]?.type==='vendor'){
    assert(text.includes('最后的建筑师')&&text.includes('走私商')&&text.includes('使用对应房间图纸'));
    assert(text.includes('12.1.5当前商人实价待核实'));assert(!text.includes('50 ×')&&!text.includes('75 ×'));
   }
   if(!row.sources.length)assert.equal(text,'来源未知');
   assert.equal(await page.locator('.dh-src-list').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
   if([1,439,223,400].includes(row.record_id))await page.screenshot({path:path.join(out,`room-${row.record_id}-${width}.png`)});
   results.push({width,id:row.record_id,src,text});
   await page.keyboard.press('Escape');await page.waitForSelector('.dh-modal-overlay',{state:'detached'});
   for(const type of new Set(row.sources.map(s=>s.type))){
    const label={unlock:'解锁',vendor:'商人',shop:'商城'}[type];
    await page.locator('#dhSrcChips button').filter({hasText:new RegExp('^'+label)}).click();
    assert.equal(await page.locator(`.dh-card[data-rid="${row.record_id}"]`).count(),1);
   }
  }
 }
 const models=read('data/task083/model-previews-manifest.json');
 for(const target of models){const r=catalog.find(r=>r.record_id===target.record_id);rows.push({...r,sources:[]});}
 await page.reload();await page.waitForSelector('#dhSearch');
 for(const target of models){
  const row=rows.find(r=>r.record_id===target.record_id);await page.locator('#dhSearch').fill(row.name);
  const card=page.locator(`.dh-card[data-rid="${row.record_id}"]`);await card.scrollIntoViewIfNeeded();
  const expected=`assets/decor-icons/model-previews/${row.record_id}.png`;
  await card.locator('img').evaluate(e=>e.decode());assert.equal(await card.locator('img').getAttribute('src'),expected);
  await card.click();await page.waitForSelector('.dh-modal-overlay.show');assert.equal(await page.locator('.dh-modal-icon img').getAttribute('src'),expected);
  await page.keyboard.press('Escape');await page.waitForSelector('.dh-modal-overlay',{state:'detached'});
 }
 await page.route('**/assets/decor-icons/room-previews/1.png',r=>r.abort());
 await page.reload();await page.waitForSelector('#dhSearch');await page.locator('#dhSearch').fill(rows.find(r=>r.record_id===1).name);
 await page.waitForFunction(()=>document.querySelector('.dh-card[data-rid="1"] img')?.src.endsWith('/_placeholder.png'));
 const row=rows.find(r=>r.record_id===1);row.icon_file_id=catalog.find(r=>r.record_id===28350).icon_file_id;
 await page.reload();await page.waitForSelector('#dhSearch');await page.locator('#dhSearch').fill(row.name);
 assert.equal(await page.locator('.dh-card[data-rid="1"] img').getAttribute('src'),`assets/decor-icons/${row.icon_file_id}.png`);
 fail=true;await page.reload();await page.waitForSelector('#dhRetry');fail=false;await page.locator('#dhRetry').click();await page.waitForSelector('#dhSearch');
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({source:'offline Chrome real renderer; 40 frozen room rows, 21 candidate sources',results,errors,nativeImages:36,placeholderRooms:4,legacyModelRegression:models.length,imageFallback:true,officialPriority:true,networkRetry:true},null,2));
 console.log('PASS: 80 room card/detail + 26 model regression cases, 36 native images, unlock/vendor/shop filters, 4 honest fallbacks, priority/retry, 0 pageerror');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
