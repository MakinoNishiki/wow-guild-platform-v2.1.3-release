// Production public page only. Fresh browser, no login state or business writes.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('../../node_modules/playwright');
const root=path.resolve(__dirname,'../..'),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const targets=read('data/task083/partial-sources-6.json').partial_sources.concat(read('data/task083/room-sources-21.json').ready);
const icons=read('data/task083/room-previews-manifest.json').files;
const out=path.join(root,'docs/evidence/req176-20261103');
let browser;
(async()=>{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[],results=[],imageResults=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://wow.ddctl.com/index.html#/house/decor',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForSelector('#dhSearch',{timeout:30000});
 for(const icon of icons){
  await page.locator('#dhSearch').fill(icon.name);
  const image=page.locator(`.dh-card[data-rid="${icon.record_id}"] img`);
  await image.scrollIntoViewIfNeeded();await image.evaluate(e=>e.decode());assert.equal(await image.getAttribute('src'),icon.src);
  assert.deepEqual(await image.evaluate(e=>[e.naturalWidth,e.naturalHeight]),icon.dimensions);
  imageResults.push(icon.record_id);
 }
 for(const row of targets){
  await page.locator('#dhSrcChips button').first().click();await page.locator('#dhSearch').fill(row.name);
  for(const type of new Set(row.sources.map(s=>s.type))){
   const label={drop:'掉落',treasure:'宝藏',vendor:'商人',unlock:'解锁',shop:'商城'}[type];
   await page.locator('#dhSrcChips button').filter({hasText:new RegExp('^'+label)}).click();
   assert.equal(await page.locator(`.dh-card[data-rid="${row.record_id}"]`).count(),1);
  }
  await page.locator(`.dh-card[data-rid="${row.record_id}"]`).click();
  await page.waitForFunction(()=>{const e=document.querySelector('.dh-modal-overlay.show');return e&&getComputedStyle(e).opacity==='1';});
  const text=await page.locator('.dh-src-list').innerText();
  for(const s of row.sources){
   if(s.type==='unlock')assert(text.includes(s.unlock));
   if(s.type==='vendor')assert(text.includes(s.vendor)&&text.includes('12.1.5当前商人实价待核实'));
   if(s.type==='shop')assert(text.includes('商城购买'));
   for(const c of s.context||[])assert(text.includes(c.label+'：'+c.value));
  }
  assert(!/\|c[0-9a-f]{8}/i.test(text));
  if([223,233,439,400,25129].includes(row.record_id))await page.screenshot({path:path.join(out,`live-${row.record_id}.png`)});
  results.push({record_id:row.record_id,text});
  await page.keyboard.press('Escape');await page.waitForSelector('.dh-modal-overlay',{state:'detached'});
 }
 await page.locator('#dhResetFilters').click();
 await page.locator('#dhFeatChips button').filter({hasText:/房间\/户型/}).click();
 for(const img of await page.locator('.dh-card img').all()){await img.scrollIntoViewIfNeeded();await img.evaluate(e=>e.decode());}
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(out,'live-room-grid.png'),fullPage:true});
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'live-verification.json'),JSON.stringify({url:page.url(),image_count:imageResults.length,image_ids:imageResults,source_count:results.length,results,errors},null,2));
 console.log('PASS live: 36 room PNGs decoded, 27 source/filter/detail cases, room grid, 0 pageerror');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();});
