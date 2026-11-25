'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {chromium} = require('playwright');
const root = process.env.WB_REVIEW_URL || 'http://127.0.0.1:56180';
const evidence = path.resolve(__dirname,'../docs/evidence/req213-leaderboards');
const rankRow = '#rbRows tr';
async function verify(browser,width,height) {
  const page=await browser.newPage({viewport:{width,height}});
  page.setDefaultTimeout(20000);
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  const enter=async route=>{ await page.goto(root+'/index.html'+route); };
  const ready=async()=>{ await page.locator('#rbScroll:visible').waitFor(); };
  const sub=async key=>{ await page.locator('#rbModes a[href$="/'+key+'"]').click(); await ready(); };
  const select=async(id,val)=>{ await page.selectOption('#rb-'+id,val); await ready(); };
  try {
    await enter('#/team');
    await page.locator('.ia-tab[data-ia-tab=rankings]').click();
    await ready();
    assert.match(await page.locator('#rbTitle').innerText(),/诸王之眠.*阿比迪斯/);
    assert.ok(await page.locator(rankRow).count()>1);
    assert.ok(await page.locator('.rb-player').count()>=5);
    assert.equal(await page.locator('[data-ia-tab=rankings]').getAttribute('aria-current'),'true');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.join(evidence,'pve-'+width+'.png')});
    const initial=await page.locator(rankRow).first().innerText();
    await page.locator('#rbNext').click();
    assert.notEqual(await page.locator(rankRow).first().innerText(),initial);
    await page.locator('#rbPrev').click();
    assert.equal(await page.locator(rankRow).first().innerText(),initial);
    await select('dungeon','250');
    assert.match(await page.locator('#rbTitle').innerText(),/塞塔里斯/);
    await select('realm','anzu');
    assert.match(await page.locator('#rbTitle').innerText(),/安苏/);
    await page.locator('#rbPvp').click(); await ready();
    assert.ok((await page.locator('#rbHeaders').innerText()).includes('败场'));
    await sub('3v3');
    await sub('battlegrounds');
    await select('faction','alliance');
    assert.equal(await page.locator(rankRow+' td:nth-child(5)').first().innerText(),'联盟');
    await sub('shuffle');
    assert.ok((await page.locator('#rbHeaders').innerText()).includes('比赛场次'));
    assert.match(await page.locator('#rbOfficial').getAttribute('href'),/shuffle\/deathknight\/blood\//);
    await select('classId','8');
    await select('specId','63');
    assert.equal(await page.locator(rankRow+' td:nth-child(4)').first().innerText(),'法师');
    await sub('blitz'); await select('faction','horde');
    const factionCells=await page.locator(rankRow+' td:nth-child(5)').allInnerTexts();
    assert.ok(factionCells.length && factionCells.every(v=>v==='部落'));
    assert.match(await page.locator('#rbOfficial').getAttribute('href'),/blitz\/mage\/fire\/\?faction=horde/);
    await page.screenshot({path:path.join(evidence,'pvp-'+width+'.png')});
    await page.reload(); await ready();
    assert.equal(await page.locator('#rbModes [aria-current]').innerText(),'战场闪电战');
    const pvpPattern='**/api/cn-leaderboards/pvp?**';
    await page.route(pvpPattern,route=>route.fulfill({status:503,body:'upstream unavailable'}));
    await page.locator('#rbModes a[href$="/3v3"]').click();
    await page.locator('#rbRetry:visible').waitFor();
    assert.equal(await page.locator('#rbScroll').isVisible(),false);
    await page.unroute(pvpPattern);
    await page.locator('#rbRetry').click(); await ready();
    await page.route(pvpPattern,route=>route.fulfill({json:{data:{list:[],season:'测试赛季'},readAt:Date.now()}}));
    await page.locator('#rbModes a[href$="/2v2"]').click();
    await page.getByText('此条件下暂无官方排名。',{exact:true}).waitFor();
    assert.equal(await page.locator('#rbRetry').isVisible(),false);
    await page.unroute(pvpPattern);
    await page.goBack(); await ready();
    assert.equal(await page.locator('#rbModes [aria-current]').innerText(),'3v3竞技场');
    assert.deepEqual(errors,[]);
    console.log('PASS',browser.version(),width,height,'navigation, live boards, filters, paging, history, error/retry, empty');
  } finally { await page.close(); }
}
(async()=>{
  fs.mkdirSync(evidence,{recursive:true});
  const browser=await chromium.launch({channel:'chrome'});
  try {for(const size of [[1366,768],[1920,1080]]) await verify(browser,...size);}
  finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
