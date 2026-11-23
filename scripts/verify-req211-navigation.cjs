// Exercise the shipped HTML and assets offline, with deterministic quote and personal records.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs/evidence/req211-20261124');
const base = 'http://localhost:19112';
const mime = {'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.html':'text/html','.png':'image/png'};
const checks = [];
function pass(label) { checks.push(label); console.log('PASS', label); }
async function run() {
  fs.mkdirSync(output,{recursive:true});
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1366,height:768}});
    page.setDefaultTimeout(5500);
    const errors = [];
    page.on('pageerror',error => errors.push(error.message));
    await page.route('**/*',route => {
      const {origin,pathname} = new URL(route.request().url());
      if (origin !== base) return route.abort();
      if (pathname === '/api/supabase-config') return route.fulfill({json:{url:base+'/fixture',anonKey:'fixture'}});
      if (pathname === '/api/wow-token/cn') {
        const now = Date.now();
        return route.fulfill({json:{gold:100500,readAt:now,samples:[{at:now-300000,gold:100000},{at:now,gold:100500}]}});
      }
      if (pathname.startsWith('/fixture/') || pathname.startsWith('/api/')) return route.fulfill({json:[]});
      const file = path.resolve(root,'.'+(pathname === '/' ? '/index.html' : decodeURIComponent(pathname)));
      if (!file.startsWith(root+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({status:404});
      return route.fulfill({path:file,contentType:mime[path.extname(file)]});
    });
    const tab = key => page.locator('[data-ia-tab="'+key+'"]');
    const opacity = el => Number(getComputedStyle(el,'::after').opacity);
    const settled = (key, value) => page.waitForFunction(([key,value]) => Number(getComputedStyle(document.querySelector('[data-ia-tab="'+key+'"]'),'::after').opacity) === value,[key,value]);
    await page.goto(base+'/#/home');
    await page.locator('#page-home.active').waitFor();
    await settled('home',1);
    const personal = tab('personal');
    const bounds = await personal.boundingBox();
    await personal.evaluate(el => {
      window.motionFrames = [];
      const start = performance.now();
      function frame() {
        window.motionFrames.push([el.matches(':hover'),Number(getComputedStyle(el,'::after').opacity)]);
        if (performance.now()-start < 5000) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    await personal.hover();
    await settled('personal',1);
    assert.equal(await tab('home').evaluate(opacity),1);
    assert.equal(await personal.evaluate(el => getComputedStyle(el).borderBottomColor),'rgba(0, 0, 0, 0)');
    await page.mouse.move(12,110);
    await settled('personal',0);
    const frames = await page.evaluate(() => window.motionFrames);
    assert.ok(frames.some(([hover,n])=>hover && n>0 && n<1));
    assert.ok(frames.some(([hover,n])=>!hover && n>0 && n<1));
    assert.deepEqual(await personal.boundingBox(),bounds);
    pass('首页持续选中，个人档案金线进出均经过中间亮度，标签尺寸与位置不变');
    for (const key of ['team','personal','house','lootdrop']) await tab(key).hover();
    await page.mouse.move(20,130);
    for (const key of ['team','personal','house','lootdrop']) await settled(key,0);
    await tab('home').focus();
    await page.keyboard.press('Tab');
    await settled('team',1);
    await page.keyboard.press('Tab');
    await settled('personal',1);
    await page.keyboard.press('Enter');
    await page.locator('#wsPersonalGuest').waitFor();
    assert.equal(await page.locator('#wsPersonalData').isVisible(),false);
    pass('快速掠过无残线，键盘焦点有金线，访客可打开个人档案登录入口');
    await page.emulateMedia({reducedMotion:'reduce'});
    await tab('changelog').hover();
    assert.equal(await tab('changelog').evaluate(el=>getComputedStyle(el,'::after').transitionDuration),'0s');
    await tab('changelog').click();
    await page.locator('#appVersion').waitFor();
    await page.emulateMedia({reducedMotion:'no-preference'});
    pass('减少动态效果时立即切换，更新日志显示版本');
    const quote = page.locator('#tokenMenu > summary');
    await quote.hover();
    await page.locator('#topTokenChart').waitFor();
    await page.locator('#tokenMenu').getByRole('button',{name:'24 小时'}).click();
    await page.getByText('区间统计',{exact:true}).click();
    await page.locator('#tokenMenu [data-value=high]').waitFor();
    await page.mouse.move(20,200);
    await page.waitForFunction(()=>!document.getElementById('tokenMenu').open);
    await quote.press('Enter');
    await page.locator('#topTokenChart').waitFor();
    await page.keyboard.press('Escape');
    assert.ok(await quote.evaluate(el=>el===document.activeElement));
    await page.locator('#feedbackBtn').press('Enter');
    await page.locator('#feedbackQqCopy').waitFor();
    await page.keyboard.press('Escape');
    pass('时光徽章悬浮查看走势、切时段、展开统计、移出收回；问题反馈与徽章均可用键盘开启及收回');
    await page.evaluate(()=>{
      const me={id:'fixture-player',email:'player@example.invalid',user_metadata:{display_name:'霜林'}};
      const characters=[];
      Object.assign(CloudSync,{
        getCachedUser:()=>me,getCurrentUser:async()=>me,getUserProfile:async()=>({}),
        getPlayerId:()=>'霜林#12345',ensureTagNum:async()=>{},getNotifications:async()=>[],getUnreadNotificationCount:async()=>0,
        getUserCharacters:async()=>characters,saveUserCharacter:async c=>characters.push({...c,id:'fixture-character'}),
        wclAccount:async action=> action==='characters'?{characters}:{configured:false}
      });
      iaSyncTopRight();
    });
    await personal.click();
    await page.getByRole('button',{name:'查看我的角色'}).click();
    await page.locator('#page-characters #tab-characters').waitFor();
    await page.locator('#tab-characters [onclick="openAddCharacterModal()"]').click();
    await page.locator('#charName').fill('银松');
    await page.locator('#charServer').fill('罗宁');
    await page.locator('[onclick="saveCharacter()"]').click();
    await page.locator('#characterList').getByText('银松',{exact:true}).waitFor();
    await page.locator('#userMenuTrigger').click();
    assert.equal(await page.locator('#accountEmailHint').innerText(),'p•••@example.invalid');
    await page.getByRole('button',{name:'账号设置',exact:true}).click();
    await page.locator('#ucEmail').waitFor();
    await page.locator('#userCenterModal .modal-close').click();
    assert.equal(await page.locator('#characterList').evaluate(el=>el.closest('.page')?.id ||
      [el.closest('.modal-overlay')?.id,location.hash,document.querySelector('.page.active')?.id].join(' ')), 'page-characters', errors.join('; '));
    await page.locator('#page-characters #characterList').getByText('银松',{exact:true}).waitFor();
    await page.locator('[data-ia-key="claims"]').click();
    await page.locator('#page-claims #myClaimsList').getByText(/暂无认领/).waitFor();
    await personal.click();
    await page.locator('#wsCharacterPreview').getByText(/银松/).waitFor();
    pass('无公会测试账号从档案添加角色并回读，进入认领、切换账号面板后返回原角色页');
    for (const width of [1366,1920]) {
      await page.setViewportSize({width,height:width===1366?768:1080});
      await tab('home').click();
      await personal.hover();
      await settled('personal',1);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:path.join(output,'navigation-'+width+'.png')});
    }
    await page.goto(base+'/design-plans/guild-personal-navigation/index.html#home');
    const prototypeTab=page.locator('.global a').filter({hasText:'个人档案'});
    await prototypeTab.hover();
    assert.equal(await prototypeTab.evaluate(el=>getComputedStyle(el,'::after').transitionDuration),'0.16s');
    assert.deepEqual(errors,[]);
    pass('1366 与 1920 像素桌面截图通过，原型与站点共用过渡样式');
    fs.writeFileSync(path.join(output,'navigation.json'),JSON.stringify({browser:browser.version(),checks},null,2)+'\n');
  } finally {await browser.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
