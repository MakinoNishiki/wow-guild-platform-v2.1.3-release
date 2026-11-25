'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require('playwright');
const base = process.env.WB_REVIEW_URL || 'http://127.0.0.1:56180';
const delayMs = 500;
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));

async function check(browser, baselineFile) {
  const page = await browser.newPage();
  const requests = [];
  let clockOffset=0, rejectRuns=false, corrected=false;
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    const now=Date.now.bind(Date);
    Date.now=()=>now()+(window.testOffset || 0);
  });
  if (baselineFile) await page.route('**/js/cnLeaderboards.js?*',route=>route.fulfill({
    contentType:'text/javascript',body:fs.readFileSync(baselineFile,'utf8')
  }));
  await page.route('**/api/cn-leaderboards/**',async route=>{
    const url=new URL(route.request().url()), kind=url.pathname.split('/').pop();
    const query=url.searchParams;
    requests.push(kind);
    await delay(delayMs+(kind==='pvp' && query.get('pvp_rank')==='1'?350:0));
    if (kind==='runs' && rejectRuns) return route.fulfill({status:503,body:'unavailable'});
    const slug=query.get('slug'), dungeon=query.get('leaderboard_id');
    const data={
      params:{class:[],specializations:[]},
      realms:{realms:[{slug:'abbendis',name:'阿比迪斯'},{slug:'anzu',name:'安苏'}]},
      dungeons:{current_leaderboards:[{id:corrected && slug==='anzu'?250:249,name:'测试地下城'}]},
      runs:{in_season:true,leading_groups:[{ranking:1,keystone_level:20,duration:5000,members:[{profile:{name:slug+'-'+dungeon}}]}]},
      pvp:{season:'测试赛季',list:[{rank:1,name:'赛制'+query.get('pvp_rank')}]}
    }[kind];
    await route.fulfill({json:{data,readAt:Date.now()+clockOffset}});
  });
  const navigate=hash=>page.evaluate(hash=>{location.hash=hash;},hash);
  async function leave() {
    await navigate('#/home');
    await page.locator('#page-rankings').waitFor({state:'hidden'});
  }
  const measuredOpen=()=>page.evaluate(()=>new Promise((resolve,reject)=>{
    const start=performance.now();
    location.hash='#/rankings';
    function frame(){
      if(document.querySelector('#page-rankings.active #rbScroll:not([hidden]) #rbRows tr')) return resolve(Math.round(performance.now()-start));
      if(performance.now()-start>15000) return reject(Error('榜单未显示'));
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }));
  try {
    await page.goto(base+'/index.html#/home');
    const firstMs=await measuredOpen();
    assert.deepEqual([...requests].sort(),['dungeons','params','realms','runs']);
    await leave();
    requests.length=0;
    const revisitMs=await measuredOpen();
    const metrics={firstMs,revisitMs,revisitRequests:requests.length};
    if (baselineFile) return metrics;
    assert.equal(metrics.revisitRequests,0);
    const team=page.locator('#rbRows').getByText('abbendis-249',{exact:true});
    await team.waitFor();
    const oldStamp=await page.locator('#rbStamp').innerText();
    await leave();
    clockOffset=6*60000;
    await page.evaluate(offset=>{window.testOffset=offset;},clockOffset);
    rejectRuns=true;
    await navigate('#/rankings');
    await page.getByText('正在更新成绩…',{exact:true}).waitFor();
    assert.equal(await team.isVisible(),true);
    await page.getByText('本次更新失败，当前显示上次读取的成绩。',{exact:true}).waitFor();
    assert.equal(await page.locator('#rbStamp').innerText(),oldStamp);
    rejectRuns=false;
    await page.locator('#rbRetry').click();
    await page.waitForFunction(stamp=>document.querySelector('#rbStamp').textContent!==stamp,oldStamp);
    assert.equal(await team.isVisible(),true);
    corrected=true;
    await page.selectOption('#rb-realm','anzu');
    await page.locator('#rbRows').getByText('anzu-250',{exact:true}).waitFor();
    assert.equal(await page.locator('#rb-dungeon').inputValue(),'250');
    await Promise.all([page.waitForRequest(r=>r.url().includes('pvp_rank=1')),navigate('#/rankings/pvp/2v2')]);
    await navigate('#/rankings/pvp/3v3');
    await page.locator('#rbRows').getByText('赛制2',{exact:true}).waitFor();
    await delay(500);
    assert.equal(await page.locator('#rbRows').getByText('赛制2',{exact:true}).isVisible(),true);
    await navigate('#/rankings');
    await page.locator('#rbRows').getByText('anzu-250',{exact:true}).waitFor();
    await leave();
    clockOffset+=31*60000;
    await page.evaluate(offset=>{window.testOffset=offset;},clockOffset);
    rejectRuns=true;
    await navigate('#/rankings');
    await page.locator('#rbRetry:visible').waitFor();
    assert.equal(await page.locator('#rbScroll').isVisible(),false);
    assert.deepEqual(errors,[]);
    return metrics;
  } finally {await page.close();}
}

(async()=>{
  const browser=await chromium.launch({channel:'chrome'});
  try {
    const result={browser:browser.version(),delayMs};
    if (process.env.WB_BASELINE_SCRIPT) result.before=await check(browser,process.env.WB_BASELINE_SCRIPT);
    result.after=await check(browser);
    if (result.before) assert.ok(result.after.firstMs<result.before.firstMs*0.65,'并行首开应快于四轮串行');
    console.log(JSON.stringify(result,null,2));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
