// Product saveActivity -> cloudCrud with an isolated persistence/transport fault.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage();
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  try {
    await page.goto('http://127.0.0.1:18777/#/home');
    await page.getByRole('button',{name:'验收：考勤流程',exact:true}).click();
    await page.evaluate(()=>{
      CloudSync.saveCloudData=async(type,op,payload)=>{
        payload.id=payload.id||'created-response-lost';
        fixture.activities.push(structuredClone(payload));
        throw Object.assign(Error('数据库操作失败 (522)'),{status:522});
      };
      showActivityModal();
    });
    await page.locator('#activityRaidName').fill('响应丢失复现');
    await page.locator('#activityWclUrl').fill('https://www.warcraftlogs.com/reports/ResponseLost123');
    await page.locator('#activitySaveBtn').click();
    await page.waitForFunction(()=>!activitySaving);
    assert.equal(await page.evaluate(()=>fixture.activities.filter(a=>a.wcl_report_code==='ResponseLost123').length),1);
    assert.equal(await page.locator('#activityModal').isVisible(),false,'已保存却仍显示失败并停留创建表单');
    assert.match(await page.locator('#toastContainer').innerText(),/已核实/);
    console.log('PASS 已写入但响应522：核实数据库结果，不重复创建');
  } finally {await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
