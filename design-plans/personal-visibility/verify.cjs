'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');

const url = process.argv[2] || pathToFileURL(path.join(__dirname, 'index.html')).href;
const capture = process.argv.includes('--capture');

async function verifyBundle(page, width) {
  const find = selector => page.locator(selector);
  const go = async key => {
    await find('.profile-sections a[href="#'+key+'"]').click();
    await find('#'+key+'Page').waitFor();
  };
  const button = name => page.getByRole('button',{name,exact:true});
  const confirm = async () => {
    await find('#confirmAction').click();
    await find('#confirmation').waitFor({state:'hidden'});
  };
  const photo = async name => {
    if (capture && width === 1366) await page.screenshot({path:path.join(__dirname,name+'-1366.png')});
  };
  await go('overview');
  assert.match(await find('#overviewDisplay').innerText(), /林间月/);
  assert.equal(await find('#ownedRoster .record').count(),2);
  await go('assets');
  await find('.ledger summary').nth(0).click();
  await find('.ledger summary').nth(1).click();
  assert.match(await find('#assetRecords').innerText(),/主手双手剑[\s\S]*最终分配给白砾/);
  await photo('assets');
  await find('#personalPlans a').first().click();
  await find('#planPage').waitFor();
  await button('调整用量').click();
  const quantity = page.getByRole('spinbutton',{name:'卷起来的卷轴的计划用量'});
  await quantity.fill('0');
  assert.ok(await button('保存用量').isDisabled());
  await quantity.fill('8');
  await button('取消').click();
  assert.match(await find('#planTotal').innerText(),/共 3 件/);
  await button('调整用量').click();
  await quantity.fill('5');
  await button('保存用量').click();
  await page.reload();
  assert.match(await find('#planTotal').innerText(),/共 6 件/);
  await find('#planSelect').selectOption('hearth');
  assert.match(await find('#planTotal').innerText(),/共 3 件/);
  await page.getByRole('link',{name:'返回我的资产',exact:false}).click();
  assert.match(await find('#personalPlans a').first().innerText(),/共 6 件/);

  await go('guilds');
  await button('解除认领').click();
  await confirm();
  await go('assets');
  assert.doesNotMatch(await find('#assetRecords').innerText(),/板甲护腕|主手双手剑/);
  await go('guilds');
  await button('认领白砾').click();
  await confirm();
  await find('#joinBox summary').click();
  await find('#inviteCode').fill('INVALID');
  await button('加入公会').click();
  assert.match(await find('#inviteError').innerText(),/邀请码无效/);
  await button('填入北辰示例码 NORTH128').click();
  await button('加入公会').click();
  await button('申请认领林间月').click();
  assert.match(await find('#activeClaim').innerText(),/待审核/);
  await photo('guilds');
  await go('assets');
  assert.match(await find('#assetRecords').innerText(),/北辰公会[\s\S]*待审核/);
  assert.doesNotMatch(await find('#assetRecords').innerText(),/白砾|板甲护腕/);
  await go('privacy');
  await find('[data-view="guild"]').click();
  assert.match(await find('#previewBody').innerText(),/北辰公会[\s\S]*未认领/);
  await go('guilds');
  await button('撤回申请').click();
  await button('切换至暮星').click();
  await go('assets');
  assert.match(await find('#assetRecords').innerText(),/暮星公会 · 白砾/);
  await go('guilds');
  await button('退出公会').click();
  await confirm();
  assert.match(await find('#activeClaim').innerText(),/北辰公会/);
  await button('退出公会').click();
  await confirm();
  await go('assets');
  assert.match(await find('#assetRecords').innerText(),/尚未加入公会/);
  assert.match(await find('#personalPlans a').first().innerText(),/共 6 件/);
  await go('overview');
  assert.match(await find('#overviewGuild').innerText(),/尚未加入/);
  assert.match(await find('#overviewDisplay').innerText(),/林间月/);
  await page.reload();
  assert.equal(await find('#ownedRoster .record').count(),2);
  await go('guilds');
  await find('#joinBox summary').click();
  await button('填入暮星示例码 DUSK1128').click();
  await button('加入公会').click();
  assert.match(await find('#activeClaim').innerText(),/白砾[\s\S]*你已认领/);
  await find('#reset').click();
  await go('assets');
  assert.match(await find('#personalPlans a').first().innerText(),/共 3 件/);
  for (const section of ['assets','guilds','overview','privacy']) {
    await go(section);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  }
}

async function verify(browser, width, height) {
  const context = await browser.newContext({viewport: {width, height}, reducedMotion: 'reduce'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => errors.push(request.url()));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(response.status() + ' ' + response.url());
  });
  const find = selector => page.locator(selector);
  const click = selector => find(selector).click();
  const preview = find('#previewBody');
  const select = key => click('[data-character="' + key + '"]');
  const view = key => click('[data-view="' + key + '"]');
  const assertVisitor = async (name, meta) => {
    const lines = (await preview.innerText()).split('\n').filter(Boolean);
    assert.deepEqual(lines, [name, meta], '访客名片只能包含该角色的四项公开资料');
  };
  const confirm = async id => {
    await click(id);
    await click('#confirmAction');
    await find('#confirmation').waitFor({state:'hidden'});
  };
  try {
    await page.goto(url);
    await find('[data-character="druid"]').waitFor();
    assert.match(await preview.innerText(), /尚未对外展示角色/);
    assert.ok(await find('#withdraw').isDisabled());
    await select('druid');
    await assertVisitor('林间月', '国服 · 白银之手 · 德鲁伊');
    assert.match(await find('#claimState').innerText(), /已认领战士「白砾」/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, '页面宽度应适合视口');
    if (capture && width === 1366) await page.screenshot({path: path.join(__dirname, 'visitor-1366.png')});
    await view('guild');
    assert.match(await preview.innerText(), /白砾[\s\S]*认领人：微澜/);
    assert.doesNotMatch(await preview.innerText(), /林间月/);
    await select('warrior');
    assert.equal(await find('[data-view="guild"]').getAttribute('aria-pressed'), 'true');
    await view('visitor');
    await assertVisitor('白砾', '国服 · 金色平原 · 战士');
    await page.reload();
    await find('.record.public').waitFor();
    await assertVisitor('白砾', '国服 · 金色平原 · 战士');
    await view('self');
    assert.match(await preview.innerText(), /林间月[\s\S]*WCL 已验证[\s\S]*白砾[\s\S]*手动添加/);
    await click('#withdraw');
    await view('visitor');
    assert.match(await preview.innerText(), /尚未对外展示角色/);
    assert.match(await find('#claimState').innerText(), /已认领战士/);
    await select('druid');
    await click('#unclaim');
    await page.keyboard.press('Escape');
    await find('#confirmation').waitFor({state:'hidden'});
    assert.match(await find('#claimState').innerText(), /已认领战士/);
    await confirm('#unclaim');
    await page.waitForFunction(() => document.getElementById('unclaim').disabled);
    await assertVisitor('林间月', '国服 · 白银之手 · 德鲁伊');
    assert.match(await find('#membership').innerText(), /团员/);
    await view('guild');
    assert.match(await preview.innerText(), /白砾[\s\S]*未认领/);
    await click('#reset');
    await select('druid');
    await click('#leave');
    await click('#confirmation [value="cancel"]');
    await find('#confirmation').waitFor({state:'hidden'});
    assert.match(await find('#membership').innerText(), /团员/);
    await confirm('#leave');
    await page.waitForFunction(() => document.getElementById('leave').disabled);
    await page.reload();
    await find('.record.public').waitFor();
    await assertVisitor('林间月', '国服 · 白银之手 · 德鲁伊');
    await view('self');
    assert.equal(await preview.locator('.record').count(), 2);
    assert.match(await find('#viewHint').innerText(), /已无法进入/);
    await view('guild');
    assert.match(await preview.innerText(), /白砾[\s\S]*已退会用户/);
    assert.ok(await find('#unclaim').isDisabled());
    await click('#reset');
    assert.match(await preview.innerText(), /尚未对外展示角色/);
    assert.ok(await find('#unclaim').isEnabled());
    await find('[data-character="druid"]').focus();
    await page.keyboard.press('Enter');
    await assertVisitor('林间月', '国服 · 白银之手 · 德鲁伊');
    await verifyBundle(page,width);
    await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
    assert.deepEqual(errors, []);
    console.log(width + ' × ' + height + ' · 三视角、方案修改与回读、两会切换、认领与申请、退最后公会及保留个人资产通过');
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({channel:'chrome'});
  try {
    for (const [width, height] of [[1366,768], [1920,1080], [390,844]]) {
      await verify(browser, width, height);
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
