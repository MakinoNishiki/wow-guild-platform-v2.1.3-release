'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const base = process.argv.slice(2).find(arg => !arg.startsWith('--')) || pathToFileURL(path.join(__dirname,'index.html')).href;
const saveScreenshots = !process.argv.includes('--skip-shots');
const pieces = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];
const override = (page, action, role) => page.locator('[data-permission="'+action+'"][data-for="'+role+'"]');

async function verifyBadge(container, piece) {
  const icon = container.locator('svg').first();
  assert.equal(await icon.locator('use').getAttribute('href'), '#chess-'+piece);
  const appearsBeforeName = await container.evaluate(element => {
    const node = element.querySelector('svg');
    const box = node.getBoundingClientRect();
    const texts = document.createTreeWalker(element,NodeFilter.SHOW_TEXT);
    let name;
    while (name = texts.nextNode()) {
      if (name.textContent.trim() && !name.parentElement.closest('svg')) break;
    }
    if (!name) return false;
    const range = new Range();
    range.selectNodeContents(name);
    const ink = node.getBBox();
    return box.width === 20 && box.height === 20 && ink.width > 0 && ink.height > 0
      && box.right <= range.getBoundingClientRect().left + 1;
  });
  assert.ok(appearsBeforeName, '棋子必须画在身份名称左侧，实际尺寸 20 × 20');
}

async function captureIdentityColumn(page) {
  const top = await page.locator('.roster thead th').nth(2).boundingBox();
  const last = await page.locator('#memberRows tr:last-child td').nth(1).boundingBox();
  const scrollY = await page.evaluate(() => window.scrollY);
  await page.screenshot({path:path.join(__dirname,'role-badges-20px.png'),fullPage:true,clip:{
    x:top.x, y:top.y + scrollY, width:top.width, height:last.y + last.height - top.y
  }});
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
    assert.equal(await page.locator('[data-scheme]').count(),0);
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
    assert.equal(await rows.count(),6);
    assert.match(await rows.nth(1).innerText(),/副团长/);
    assert.match(await rows.nth(1).innerText(),/管理者/);
    assert.equal(await rows.nth(4).locator('.badge').count(),0);
    assert.equal(await rows.nth(3).locator('.badge').innerText(),await rows.nth(2).locator('.badge').innerText());
    for (const [key,piece] of Object.entries({owner:'king',editor:'knight',viewer:'pawn'})) {
      await verifyBadge(page.locator('.roster-badge.'+key).first(),piece);
    }
    if (width===1366) await screenshot('members-chess-1366.png');
    await click('[data-view=permissions]');
    await click('#createRole');
    for (const invalid of ['   ','副团长','甲'.repeat(17)]) {
      await page.fill('#newName',invalid);
      await click('#createForm button[type=submit]');
      assert.equal(await page.locator('#createDialog').isVisible(),true);
      assert.ok(await page.locator('#createError').innerText());
      assert.equal(await page.locator('[data-role^=custom-]').count(),0);
    }
    const newPieces = page.locator('#createForm input[type=radio]');
    assert.deepEqual(await newPieces.evaluateAll(nodes => nodes.map(node => node.value)), pieces);
    assert.equal(await page.locator('#createForm input[type=radio]:checked').inputValue(),'rook');
    for (const piece of pieces) {
      await page.locator('#createForm label').filter({has:page.locator('input[value="'+piece+'"]')}).click();
      assert.equal(await page.locator('#createForm input[type=radio]:checked').inputValue(),piece);
    }
    await page.locator('#createForm label').filter({has:page.locator('input[value="rook"]')}).click();
    await page.fill('#newName','考勤员');
    assert.equal(await page.locator('#createError').innerText(),'');
    if (saveScreenshots && width===1366) await page.locator('#createDialog').screenshot({path:path.join(__dirname,'chess-picker-1366.png')});
    page.once('dialog',dialog=>dialog.dismiss());
    await page.locator('#newName').press('Escape');
    assert.equal(await page.locator('#createDialog').isVisible(),true);
    await click('#createForm button[type=submit]');
    assert.equal(await page.locator('[data-role=custom-1]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('button[role=switch][aria-checked=true]').count(),0);
    assert.equal(await page.locator('[data-permission=membership],[data-permission=configure]').count(),0);
    assert.match(await page.locator('#rows tr.action').filter({hasText:'分配成员的公会角色'}).innerText(),/无权限/);
    assert.match(await page.locator('#rows tr.action').filter({hasText:'查看内部招募卡与联系方式'}).innerText(),/随会籍/);
    await click('[data-category=roster]');
    await override(page,'attendance','custom-1').click();
    assert.equal(await checked('find-wcl','custom-1'),'false');
    await page.locator('#allowed').check();
    assert.equal(await page.locator('[data-permission]').count(),1);
    if (width===1366) await screenshot('attendance-role-1366.png');
    await click('#rename');
    await page.locator('#nameFields input[name=editor]').fill('公会编辑');
    await click('#nameForm button[type=submit]');
    await click('#assignRole');
    assert.equal(await page.locator('#assignTarget option[value=owner], #assignAccount option[value=keeper]').count(),0);
    assert.equal(await page.locator('#assignAccount').inputValue(),'hiker');
    assert.match(await page.locator('#assignInfo').innerText(),/山脊、晨露/);
    await click('#assignForm button[type=submit]');
    await page.locator('#membersPanel').waitFor();
    await page.reload();
    assert.equal(await page.locator('#memberRows .roster-badge.custom').count(),2);
    for (const index of [2,3]) {
      const badge = rows.nth(index).locator('.roster-badge');
      assert.equal(await badge.innerText(),'考勤员');
      await verifyBadge(badge,'rook');
    }
    assert.equal(await rows.nth(0).locator('[data-account]').count(),0);
    assert.equal(await rows.nth(4).locator('.badge,[data-account]').count(),0);
    if (width===1366) await screenshot('members-attendance-1366.png');
    if (saveScreenshots && width===1366) await captureIdentityColumn(page);
    await click('[data-view=permissions]');
    await click('[data-role=custom-1]');
    await click('[data-category=roster]');
    assert.equal(await checked('attendance','custom-1'),'true');
    await click('#rename');
    await page.locator('#nameForm label').filter({has:page.locator('input[type=radio][value="queen"]')}).click();
    await click('#nameForm button[type=submit]');
    await page.reload();
    await click('[data-view=members]');
    await page.locator('#membersPanel').waitFor();
    await verifyBadge(rows.nth(2).locator('.roster-badge'),'queen');
    await verifyBadge(rows.nth(3).locator('.roster-badge'),'queen');
    await click('[data-view=permissions]');
    await verifyBadge(page.locator('[data-role=custom-1]'),'queen');
    await click('[data-role=custom-1]');
    await click('[data-category=roster]');
    assert.equal(await checked('attendance','custom-1'),'true');
    for (const actor of ['editor','viewer','custom-1']) {
      await page.selectOption('#actor',actor);
      assert.equal(await page.locator('#createRole').isVisible(),false);
      assert.equal(await page.locator('#assignRole').isVisible(),false);
      assert.equal(await page.locator('#rename').isDisabled(),true);
      assert.equal(await page.locator('#restore').isDisabled(),true);
      assert.equal(await page.locator('button[role=switch]:enabled').count(),0);
      await click('[data-role='+actor+']');
      assert.ok(await page.locator('button[role=switch]:disabled').count());
      await click('[data-role=all]');
      await click('[data-view=members]');
      await page.locator('#membersPanel').waitFor();
      assert.equal(await page.locator('[data-account]').count(),0);
      await click('[data-view=permissions]');
    }
    await page.selectOption('#actor','owner');
    await click('[data-category=key]');
    await click('#restore');
    await click('#restoreDialog [data-close]');
    assert.equal(await checked('video','viewer'),'true');
    await click('#restore');
    await click('#restoreConfirm');
    assert.equal(await checked('video','viewer'),'false');
    assert.equal(await checked('wcl','owner'),'true');
    assert.equal(await page.locator('[data-role=editor]').innerText(),'公会编辑');
    await page.reload();
    assert.equal(await page.locator('[data-role^=custom-]').count(),0);
    await click('[data-view=members]');
    await page.locator('#membersPanel').waitFor();
    assert.equal(await rows.nth(2).locator('.roster-badge').innerText(),'团员');
    await click('[data-view=permissions]');
    assert.equal(await checked('video','viewer'),'false');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
    assert.ok(await page.evaluate(()=>Array.from(document.images).every(img=>img.complete && img.naturalWidth>0)));
    assert.deepEqual(errors,[]);
    await page.evaluate(()=>localStorage.setItem('wb.guild-permissions.review.v2',JSON.stringify({
      names:{owner:'老会长',editor:'老编辑',viewer:'老团员','custom-8':'老后勤'},
      overrides:{'video/viewer':true,'attendance/custom-8':true},assignments:{hiker:'custom-8'},scheme:'ranks'
    })));
    await page.reload();
    assert.equal(await page.locator('[data-role=editor]').innerText(),'老编辑');
    assert.equal(await checked('video','viewer'),'true');
    await click('[data-view=members]');
    await page.locator('#membersPanel').waitFor();
    await verifyBadge(rows.nth(0).locator('.roster-badge'),'king');
    await verifyBadge(rows.nth(5).locator('.roster-badge'),'pawn');
    assert.equal(await rows.nth(5).locator('.roster-badge').innerText(),'老团员');
    for (const index of [2,3]) {
      const oldCustom = rows.nth(index).locator('.roster-badge');
      await verifyBadge(oldCustom,'rook');
      assert.equal(await oldCustom.innerText(),'老后勤');
    }
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
