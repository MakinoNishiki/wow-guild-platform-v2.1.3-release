'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const base = process.argv.slice(2).find(arg => !arg.startsWith('--')) || pathToFileURL(path.join(__dirname,'index.html')).href;
const saveScreenshots = !process.argv.includes('--skip-shots');
const override = (page, action, role) => page.locator('[data-permission="'+action+'"][data-for="'+role+'"]');

async function captureBadgeComparison(page) {
  await page.locator('[data-view=members]').click();
  await page.locator('#membersPanel').waitFor();
  const variants = [];
  for (const scheme of ['heraldry','ranks']) {
    const choice = page.locator('[data-scheme='+scheme+']');
    await choice.click();
    const badges = await page.locator('#memberRows tr:nth-child(-n+3) .roster-badge').evaluateAll(nodes=>nodes.map(node=>node.outerHTML));
    variants.push({label:await choice.innerText(),badges});
  }
  // Put the actual member-list badges side by side at their native CSS size.
  await page.evaluate(variants=>{
    const figure = document.createElement('figure');
    figure.id = 'comparison';
    figure.style.cssText = 'position:fixed;top:0;left:0;z-index:5;margin:0;padding:16px 20px;width:412px;background:#161b22;display:grid;grid-template-columns:1fr 1.2fr 1.2fr;align-items:center;gap:12px;color:#cbd2d8;font-size:14px;border:1px solid #414851';
    for (const title of ['基础角色',...variants.map(scheme=>scheme.label)]) {
      const header = document.createElement('strong');
      header.style.color = '#efd198';
      header.textContent = title;
      figure.append(header);
    }
    ['创建者','管理者','普通用户'].forEach((tier,index)=>{
      const label = document.createElement('span');
      label.textContent = tier;
      figure.append(label);
      for (const variant of variants) {
        const cell = document.createElement('div');
        cell.innerHTML = variant.badges[index];
        figure.append(cell);
      }
    });
    document.body.append(figure);
  },variants);
  await page.locator('#comparison').screenshot({path:path.join(__dirname,'role-badges-20px.png')});
}

async function run(browser, width, height) {
  const context = await browser.newContext({viewport:{width,height}, reducedMotion:'reduce'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('response',response=>{ if (response.status() >= 400) errors.push(response.url()); });
  page.on('requestfailed',request=>errors.push(request.url()));
  const checked = async (action, role) => override(page,action,role).getAttribute('aria-checked');
  const click = async attr => page.locator(attr).click();
  const screenshot = async name => { if (saveScreenshots) await page.screenshot({path:path.join(__dirname,name)}); };
  try {
    await page.goto(base);
    await page.locator('[data-permission]').first().waitFor();
    assert.equal(await checked('edit-card','editor'),'true');
    assert.equal(await checked('wcl','editor'),'false');
    assert.equal(await checked('wcl','owner'),'true');
    assert.equal(await checked('edit-card','viewer'),'false');
    assert.equal(await page.locator('[data-category=all] small').innerText(),'21');
    assert.equal(await page.locator('[data-permission=contact]').count(),0);
    await screenshot('overview-'+width+'.png');
    await click('[data-action=wcl]');
    assert.equal(await page.locator('#note-wcl').isVisible(),true);
    await page.locator('[data-action=wcl]').press('Enter');
    assert.equal(await page.locator('#note-wcl').isVisible(),false);
    await override(page,'video','viewer').press('Space');
    assert.equal(await checked('video','viewer'),'true');
    assert.equal(await checked('publish','viewer'),'false');
    await override(page,'wcl','owner').click();
    assert.equal(await checked('wcl','owner'),'false');
    assert.equal(await checked('wcl','editor'),'false');
    await click('[data-category=roster]');
    assert.equal(await checked('find-wcl','editor'),'true');
    await click('[data-category=loot]');
    await click('[data-role=viewer]');
    await page.locator('#allowed').check();
    assert.equal(await page.locator('[data-permission]').count(),1);
    await override(page,'submit','viewer').click();
    assert.equal(await page.locator('#empty').isVisible(),true);
    await page.locator('#allowed').uncheck();
    assert.equal(await checked('submit','viewer'),'false');
    if (width === 1366) await screenshot('member-loot-1366.png');
    await click('[data-role=editor]');
    await click('[data-category=battle]');
    if (width === 1920) await screenshot('editor-battles-1920.png');
    await click('#rename');
    const input = page.locator('#nameFields input[name=editor]');
    await input.fill('团员');
    await page.locator('#nameForm button[type=submit]').click();
    assert.equal(await page.locator('#nameDialog').isVisible(),true);
    assert.match(await page.locator('#nameError').innerText(),/不同/);
    await input.fill('  ');
    await page.locator('#nameForm button[type=submit]').click();
    assert.equal(await page.locator('#nameDialog').isVisible(),true);
    await input.fill('甲'.repeat(17));
    await page.locator('#nameForm button[type=submit]').click();
    assert.equal(await page.locator('#nameDialog').isVisible(),true);
    await input.fill('副团长');
    await page.locator('#nameForm button[type=submit]').click();
    assert.equal(await page.locator('#nameDialog').isVisible(),false);
    assert.equal(await page.locator('[data-role=editor]').innerText(),'副团长');
    assert.match(await page.locator('#head').innerText(),/副团长/);
    await page.reload();
    assert.equal(await checked('video','viewer'),'true');
    assert.equal(await page.locator('[data-role=editor]').innerText(),'副团长');
    await click('[data-view=members]');
    const rows = page.locator('#memberRows tr');
    await page.locator('#membersPanel').waitFor();
    assert.equal(new URL(page.url()).hash,'#members');
    await page.reload();
    await page.locator('#membersPanel').waitFor();
    assert.equal(await rows.count(),5);
    assert.match(await rows.nth(1).innerText(),/副团长/);
    assert.match(await rows.nth(1).innerText(),/管理者/);
    assert.equal(await rows.nth(4).locator('.badge').count(),0);
    assert.equal(await rows.nth(3).locator('.badge').innerText(),await rows.nth(2).locator('.badge').innerText());
    for (const scheme of ['heraldry','ranks']) {
      await click('[data-scheme='+scheme+']');
      for (const key of ['owner','editor','viewer']) {
        const glyph = page.locator('.roster-badge.'+key+' svg').first();
        assert.equal(await glyph.locator('use').getAttribute('href'),'#'+scheme+'-'+key);
        assert.ok(await glyph.evaluate(node=>node.getBoundingClientRect().width === 20 &&
          node.getBBox().width > 0 && node.getBBox().height > 0));
      }
      await page.locator('#memberTitle').click();
      if (saveScreenshots && width === 1366) await page.waitForFunction(()=>!document.getElementById('feedback').textContent);
      if (width===1366) await screenshot('members-'+scheme+'-1366.png');
    }
    await click('[data-view=permissions]');
    for (const actor of ['editor','viewer']) {
      await page.selectOption('#actor',actor);
      assert.equal(await page.locator('#rename').isDisabled(),true);
      assert.equal(await page.locator('#restore').isDisabled(),true);
      assert.equal(await page.locator('button[role=switch]:enabled').count(),0);
      await click('[data-role='+actor+']');
      assert.ok(await page.locator('button[role=switch]:disabled').count());
      await click('[data-role=all]');
    }
    await page.selectOption('#actor','owner');
    await click('#restore');
    await click('#restoreDialog [data-close]');
    assert.equal(await checked('video','viewer'),'true');
    await click('#restore');
    await click('#restoreConfirm');
    assert.equal(await checked('video','viewer'),'false');
    assert.equal(await checked('wcl','owner'),'true');
    assert.equal(await page.locator('[data-role=editor]').innerText(),'公会编辑');
    await page.reload();
    assert.equal(await checked('video','viewer'),'false');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
    assert.ok(await page.evaluate(()=>Array.from(document.images).every(img=>img.complete && img.naturalWidth>0)));
    assert.deepEqual(errors,[]);
    if (saveScreenshots && width===1366) await captureBadgeComparison(page);
  } finally { await context.close(); }
}

(async()=>{
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    for (const size of [[1366,768],[1920,1080]]) {
      await run(browser,...size);
      console.log('Chrome '+browser.version()+' · '+size.join(' × ')+' · passed');
    }
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
