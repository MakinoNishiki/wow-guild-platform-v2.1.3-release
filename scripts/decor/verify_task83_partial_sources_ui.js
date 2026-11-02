// 只读离线Chrome：六件已知途径可筛选，未核采集说明始终可见。
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require('../../node_modules/playwright');
const root=path.resolve(__dirname,'../..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const report=read('data/task083/partial-sources-6.json');
const raw=read('data/task083/catalog-current-2335.json');
const wanted=new Map(report.partial_sources.map(r=>[r.record_id,r]));
const rows=raw.filter(r=>wanted.has(r.record_id)||report.still_unclassified.includes(r.record_id))
  .map(r=>({...r,sources:wanted.get(r.record_id)?.sources||[]}));
const html='<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/css/main.css"><link rel="stylesheet" href="/css/decor-public.css"><body class="data-decor-body"><div id="page-decor"><div class="dh-filterbar" id="dhFilterBar"></div><main class="dh-main" id="dhMain"></main></div><script src="/js/decorDict.js"></script><script src="/js/decorData.js"></script>';
const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://local');
  if(u.pathname==='/fixture'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
  if(u.pathname==='/api/supabase-config'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({url:`http://127.0.0.1:${server.address().port}`,anonKey:'offline-fixture'}));}
  if(u.pathname==='/rest/v1/decor_catalog'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(rows));}
  const p=path.resolve(root,'.'+u.pathname);
  if(!/^(\/js\/|\/css\/|\/assets\/)/.test(u.pathname)||!p.startsWith(root+path.sep)){res.writeHead(404);return res.end();}
  try{res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':'image/png');res.end(fs.readFileSync(p));}catch{res.writeHead(404);res.end();}
});
let browser;
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page=await browser.newPage(),errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));
  const out=path.join(root,'docs/evidence/task083-partial6-20261103');fs.mkdirSync(out,{recursive:true});
  for(const [width,height] of [[1366,768],[1920,1080]]){
    await page.setViewportSize({width,height});await page.goto(`http://127.0.0.1:${server.address().port}/fixture`);await page.waitForSelector('#dhSearch');
    for(const r of report.partial_sources){
      await page.locator('#dhSearch').fill(r.name);
      for(const label of ['掉落','宝藏']){
        await page.locator('#dhSrcChips button').filter({hasText:new RegExp('^'+label)}).click();
        assert.equal(await page.locator(`.dh-card[data-rid="${r.record_id}"]`).count(),1);
      }
      await page.locator(`.dh-card[data-rid="${r.record_id}"]`).click();
      await page.waitForFunction(()=>{const e=document.querySelector('.dh-modal-overlay.show');return e&&getComputedStyle(e).opacity==='1';});
      const text=await page.locator('.dh-src-list').innerText();
      for(const x of ['掉落：世界生物','宝藏：世界古代储物箱掉落','待核实来源：采集：世界错放的宝藏节点'])assert(text.includes(x),text);
      assert(!text.includes('|cff'));assert(!text.includes('制造：'));
      if(r.record_id===25129)await page.screenshot({path:path.join(out,`partial-${width}.png`)});
      results.push({width,id:r.record_id,text});
      await page.keyboard.press('Escape');await page.waitForSelector('.dh-modal-overlay',{state:'detached'});
      await page.locator('#dhSrcChips button').filter({hasText:/^无来源/}).click();assert.equal(await page.locator(`.dh-card[data-rid="${r.record_id}"]`).count(),0);
      await page.locator('#dhSrcChips button').filter({hasText:/^制造/}).click();assert.equal(await page.locator(`.dh-card[data-rid="${r.record_id}"]`).count(),0);
    }
    for(const id of report.still_unclassified){
      await page.locator('#dhSearch').fill(raw.find(r=>r.record_id===id).name);
      await page.locator('#dhSrcChips button').filter({hasText:/^无来源/}).click();assert.equal(await page.locator(`.dh-card[data-rid="${id}"]`).count(),1);
    }
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({source:'offline Chrome with real decor renderer; no DB',results,errors,stillUnclassified:report.still_unclassified},null,2));
  console.log('PASS 12详情与掉落/宝藏筛选；采集原文带待核标记、非制造；3条未分类保留；0 pageerror');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
