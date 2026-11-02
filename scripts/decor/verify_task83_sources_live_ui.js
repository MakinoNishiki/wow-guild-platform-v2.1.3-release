// 独立无登录浏览器，只检查已授权更新后的公开家宅页面；不执行业务写操作。
const {chromium} = require('../../node_modules/playwright');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const out = path.resolve(__dirname,'../../docs/evidence/task083-followup-20261103');
let browser;
(async()=>{
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1920,height:1080}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://wow.ddctl.com/index.html#/house/decor',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForSelector('#dhSearch',{timeout:30000});
  const results=[];
  for(const test of [
    {id:15747,name:'宇宙虚空营火',filter:'宝藏',text:['斯托玛兰突袭战','胜利的斯托玛兰巅峰之箱','虚影风暴']},
    {id:15747,name:'宇宙虚空营火',filter:'事件',text:['斯托玛兰突袭战']},
    {id:1674,name:'龙母的徽记',filter:'成就',text:['上痛！上诅咒！上钉刺！','相关商人','埃克斯勒','250 金']},
    {id:1261,name:'非常可靠的安德麦路灯',filter:'事件',text:['货运与接收','法定休假','安德麦']}
  ]){
    await page.locator('#dhSrcChips button').first().click();
    await page.locator('#dhSearch').fill(test.name);
    await page.locator('#dhSrcChips button').filter({hasText:new RegExp('^'+test.filter)}).click();
    const card=page.locator(`.dh-card[data-rid="${test.id}"]`);
    await card.click();
    await page.waitForFunction(()=>{const e=document.querySelector('.dh-modal-overlay.show');return e&&getComputedStyle(e).opacity==='1';});
    const text=await page.locator('.dh-src-list').innerText();
    for(const value of test.text) assert(text.includes(value),`missing ${value}`);
    await page.screenshot({path:path.join(out,`live-${test.id}-${test.filter}.png`)});
    results.push({...test,actual:text});
    await page.keyboard.press('Escape');await page.waitForSelector('.dh-modal-overlay',{state:'detached'});
  }
  await page.locator('#dhSrcChips button').first().click();
  await page.locator('#dhSearch').fill('龙母的徽记');
  await page.locator('#dhSrcChips button').filter({hasText:/^商人/}).click();
  assert.equal(await page.locator('.dh-card[data-rid="1674"]').count(),0);
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'live-ui-verification.json'),JSON.stringify({url:page.url(),results,dragonMotherExcludedFromVendor:true,errors},null,2));
  console.log('PASS live UI: 营火宝藏/事件、龙母成就及商人排除、路灯事件与详情说明；0 pageerror');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();});
