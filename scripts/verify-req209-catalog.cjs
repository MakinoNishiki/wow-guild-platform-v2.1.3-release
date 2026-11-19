// Actual Chrome + catalog components; synthetic edge fixtures, no database, game, or external requests.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs/evidence/req209-20261119');
const rows = [
  { record_id: 1001, item_id: 240001, name: 'A 红色椅子', category_ids: [1], tags: {79:'人类',99:'经典旧世',501:'红色',601:'休闲',701:'联盟'}, sources: [{type:'vendor',vendor:'测试商人'}] },
  { record_id: 1002, name: 'B 蓝色桌子', category_ids: [1], tags: {90:'兽人',110:'至暗之夜',502:'蓝色',602:'自然',702:'部落'}, sources: [{type:'quest',quest:'测试任务'}] },
  { record_id: 1003, item_id: '1);print("injected")', name: 'C 红色烹饪台', category_ids: [5], tags: {79:'人类',110:'至暗之夜',501:'红色',602:'自然',701:'联盟'}, sources: [{type:'vendor',vendor:'测试商人'},{type:'quest',quest:'测试任务'}] },
  { record_id: 1004, name: 'D 魔法主题装饰', category_ids: [3], tags: {90:'兽人',603:'魔法'}, sources: [] },
  { record_id: 1005, name: 'E 宠物床', category_ids: [5], subcategory_ids: [53], tags: {}, sources: [] },
  { record_id: 1006, name: 'F <img src=x onerror=alert(1)> 家具', category_ids: [1], tags: {}, sources: [] },
  { record_id: 1, entry_type: 2, name: 'G 房间', sources: [] }
].map(row => ({ entry_type:1, quality:3, placement_cost:2, indoors:true, outdoors:false, icon_file_id:null, category_ids:[], subcategory_ids:[], tags:{}, ...row }));
const facts = {1001:{patch:'12.0.0',build:100},1002:{patch:'12.1.0',build:200,abilities:['interactive']},1003:{patch:'12.1.0',build:300,abilities:['cooking','effect']},1:{patch:'99.0.0',build:99999,abilities:['cooking']}};
const counts = {1001:{likes:1,views:90},1002:{likes:5,views:20},1003:{likes:3,views:50},1004:{likes:0,views:0},1005:{likes:0,views:0},1:{likes:0,views:0}};
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="stylesheet" href="/css/main.css"><link rel="stylesheet" href="/css/decor-public.css"></head><body><main id="catalog" style="margin:24px"><div id="dhFilterBar"></div><div id="dhMain"></div></main><script>window.fixtureFacts=${JSON.stringify(facts)};window.fixtureCounts=${JSON.stringify(counts)};window.DecorFacts={get:id=>fixtureFacts[id]||{}};window.DecorEngagement={counts:id=>fixtureCounts[id]||null,load:async()=>true,mount:()=>({destroy(){}})};</script><script src="/js/decorDict.js"></script><script src="/js/decorData.js"></script><script>DecorCatalog.mount(document.getElementById('catalog'));</script></body></html>`;
const requests = [];
const server = http.createServer((req,res) => {
  requests.push({method:req.method,url:req.url});
  if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(html);}
  if(req.url==='/api/supabase-config'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({url:`http://127.0.0.1:${server.address().port}`,anonKey:'fixture'}));}
  if(req.url.startsWith('/rest/v1/decor_catalog?')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(rows));}
  const name=decodeURIComponent(req.url.split('?')[0]);
  const file=path.resolve(root,'.'+name);
  if(!/^\/(js|css|assets)\//.test(name)||!file.startsWith(root+path.sep)){res.writeHead(404);return res.end();}
  try {res.setHeader('Content-Type', {'.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
});
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser,page;const checks=[],errors=[];
  const pass=label=>{checks.push(label);console.log('PASS '+label);};
  try{
    browser=await chromium.launch({channel:'chrome',headless:true});
    const context=await browser.newContext({viewport:{width:1366,height:900},permissions:['clipboard-read','clipboard-write']});
    const base=`http://127.0.0.1:${server.address().port}`;
    await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
    page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);await page.locator('#dhSort').waitFor();
    const ids=()=>page.locator('.dh-card').evaluateAll(cards=>cards.map(card=>Number(card.dataset.rid)));
    const select=async(group,label)=>page.locator('#'+group).getByRole('button',{name:new RegExp('^'+label+'(?:\\d+)?$')}).click();
    const reset=()=>page.locator('#dhResetFilters').click();
    const close=async()=>{await page.locator('.dh-modal-close').click();await page.locator('.dh-modal-overlay').waitFor({state:'detached'});};
    assert.deepEqual(await ids(),[1001,1002,1003,1004,1005,1006,1]);pass('默认装饰在前、房型在后');
    await select('dhSrcChips','商人');await select('dhSrcChips','任务');assert.deepEqual(await ids(),[1001,1002,1003]);
    await page.locator('.dh-advanced summary').click();
    await select('dhRaceChips','人类');await select('dhRaceChips','兽人');assert.deepEqual(await ids(),[1001,1002,1003]);
    await select('dhColorChips','红色');assert.deepEqual(await ids(),[1001,1003]);
    await select('dhStyleChips','自然');assert.deepEqual(await ids(),[1003]);
    assert.equal(await page.locator('#dhColorChips .on').getAttribute('aria-pressed'),'true');
    pass('来源/种族组内OR，颜色/风格跨组AND，选中态可访问');
    await select('dhColorChips','蓝色');assert.deepEqual(await ids(),[1002,1003]);
    await select('dhFactionChips','联盟');assert.deepEqual(await ids(),[1003]);
    await select('dhFactionChips','部落');assert.deepEqual(await ids(),[1002,1003]);
    await select('dhRaceChips','人类');assert.deepEqual(await ids(),[1002]);pass('多选再次点击撤销与阵营组合');
    await reset();assert.equal((await ids()).length,7);
    await select('dhAbilityChips','可烹饪');assert.deepEqual(await ids(),[1003]);
    await select('dhAbilityChips','可互动');assert.deepEqual(await ids(),[1002,1003]);
    await select('dhAbilityChips','全部');await select('dhAbilityChips','有特效');assert.deepEqual(await ids(),[1003]);
    pass('功能只读可核验证据，魔法主题不能冒充特效');
    await reset();await select('dhFeatChips','可放宠物');await select('dhFeatChips','房间/户型');assert.deepEqual(await ids(),[1005,1]);pass('既有特性同组OR');
    await reset();await page.selectOption('#dhSort','name-desc');assert.deepEqual(await ids(),[1,1006,1005,1004,1003,1002,1001]);
    await page.selectOption('#dhSort','name-asc');assert.deepEqual(await ids(),[1001,1002,1003,1004,1005,1006,1]);pass('名称双向排序');
    await page.selectOption('#dhSort','introduced-new');assert.deepEqual((await ids()).slice(0,3),[1003,1002,1001]);
    await page.selectOption('#dhSort','introduced-old');assert.deepEqual((await ids()).slice(0,3),[1001,1002,1003]);pass('实际版本/构建双向排序，未知不反转到顶部');
    await page.selectOption('#dhSort','likes');assert.deepEqual((await ids()).slice(0,3),[1002,1003,1001]);assert.equal((await ids()).at(-1),1006);
    await page.selectOption('#dhSort','views');assert.deepEqual((await ids()).slice(0,3),[1001,1003,1002]);
    await page.evaluate(()=>{fixtureCounts[1004]={likes:10,views:200};window.dispatchEvent(new Event('decor-engagement-change'));});assert.equal((await ids())[0],1004);
    pass('站内赞/浏览排序、零计数与不可用区分、变更事件刷新');
    await reset();await page.locator('#dhSearch').fill('红色');assert.deepEqual(await ids(),[1001,1003]);await select('dhAbilityChips','可互动');assert.equal((await ids()).length,0);await page.locator('#dhEmptyReset').click();assert.equal((await ids()).length,7);pass('搜索叠加筛选、无结果重置恢复');
    await page.locator('.dh-card[data-rid="1001"]').click();assert.match(await page.locator('.dh-meta-rows').innerText(),/加入版本：12\.0\.0/);assert.match(await page.locator('.dh-meta-rows').innerText(),/构建号：100/);
    await page.locator('.dh-copy-game-preview').click();const itemCommand=await page.evaluate(()=>navigator.clipboard.readText());assert.match(itemCommand,/h\.PreviewHousingItem\(240001\)/);assert.ok(!itemCommand.includes('红色'));assert.ok(Buffer.byteLength(itemCommand,'utf8')<255);await close();
    await page.locator('.dh-card[data-rid="1002"]').click();await page.locator('.dh-copy-game-preview').click();const decorCommand=await page.evaluate(()=>navigator.clipboard.readText());assert.match(decorCommand,/h\.PreviewHousingDecorID\(1002\)/);assert.match(await page.locator('.dh-meta-rows').innerText(),/可互动/);await close();
    await page.locator('.dh-card[data-rid="1003"]').click();await page.locator('.dh-copy-game-preview').click();assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/PreviewHousingDecorID\(1003\)/);assert.ok(!(await page.evaluate(()=>navigator.clipboard.readText())).includes('injected'));await close();
    pass('实际点击复制itemID与无itemID预览命令，非法ID不进入命令，低于255字节');
    await page.locator('.dh-card[data-rid="1004"]').click();assert.match(await page.locator('.dh-meta-rows').innerText(),/尚待核实[\s\S]*尚未收录/);
    await page.evaluate(()=>Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async()=>{throw new Error('denied');}}));
    await page.locator('.dh-copy-game-preview').click();assert.equal(await page.locator('.dh-game-preview-command').isVisible(),true);assert.match(await page.locator('.dh-game-preview-note').innerText(),/Ctrl\+C/);await close();
    await page.locator('.dh-card[data-rid="1"]').click();assert.equal(await page.locator('.dh-copy-game-preview').count(),0);assert.match(await page.locator('.dh-game-preview').innerText(),/房间\/户型暂不/);assert.match(await page.locator('.dh-meta-rows').innerText(),/尚待核实[\s\S]*尚未收录/);assert.doesNotMatch(await page.locator('.dh-meta-rows').innerText(),/99\.0\.0|99999|可烹饪/);await close();
    pass('版本与构建号同时显示，房型编号碰撞不串用家具事实，复制拒绝可手动复制');
    await page.locator('.dh-card[data-rid="1006"]').click();assert.equal(await page.locator('.dh-modal-title img').count(),0);await close();
    await page.evaluate(()=>{delete window.DecorFacts;delete window.DecorEngagement;});await page.selectOption('#dhSort','introduced-new');assert.equal((await ids()).length,7);await page.selectOption('#dhSort','likes');assert.equal((await ids()).length,7);pass('名称转义，元数据/互动模块缺失不白屏');
    await page.evaluate(()=>{window.DecorFacts={get:id=>fixtureFacts[id]||{}};window.DecorEngagement={counts:id=>fixtureCounts[id]||null,load:async()=>true,mount:()=>({destroy(){}})};});
    for(const width of [1366,1920]){await page.setViewportSize({width,height:900});await reset();await page.screenshot({path:path.join(output,`catalog-filters-${width}.png`),fullPage:true});await page.locator('.dh-card[data-rid="1001"]').click();await page.waitForFunction(()=>{const modal=document.querySelector('.dh-modal-overlay.show');return modal&&Number(getComputedStyle(modal).opacity)===1;});await page.screenshot({path:path.join(output,`catalog-detail-${width}.png`)});await close();}
    assert.deepEqual(errors,[]);assert.ok(requests.every(request=>request.method==='GET'));assert.ok(requests.some(request=>request.url.includes('item_id')));pass('双宽截图、零JS错误、仅只读请求且目录读取item_id');
    fs.writeFileSync(path.join(output,'catalog-verification.json'),JSON.stringify({ok:true,fixture:'synthetic edges, actual Chrome/components; game execution not tested',checks,errors,commands:{itemCommand,decorCommand},requests},null,2));
    console.log(`${checks.length} checks passed`);
  }catch(error){if(page)await page.screenshot({path:path.join(output,'catalog-failure.png'),fullPage:true}).catch(()=>{});throw error;}
  finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
