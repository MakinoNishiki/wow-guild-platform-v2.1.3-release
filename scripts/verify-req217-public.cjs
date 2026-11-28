const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const pages = require('../js/publicSearchPages.js');
const origin = process.env.WB_REVIEW_URL || 'http://127.0.0.1:56817';
const publicOrigin = 'https://wow.ddctl.com';
const headings = {home:'魔兽管家', decor:'魔兽世界家宅家具图鉴', rankings:'国服排行榜', fonts:'国服字体管理器'};

async function verifyHeading(page, title) {
  await page.getByRole('heading', {level:1, name:title, exact:true}).waitFor();
  assert.equal(await page.locator('h1').count(), 1, title + ' 的源码与当前视图应共用一个主标题');
  assert.deepEqual(await page.locator('img:not([alt])').evaluateAll(images => images.map(img => img.src)), []);
}

async function verify() {
  const sitemap = await fetch(origin + '/sitemap.xml');
  assert.equal(sitemap.status, 200);
  const urls = Array.from((await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g), match => match[1]);
  assert.deepEqual(urls, Object.values(pages).map(page => publicOrigin + page.path));
  assert.match(await (await fetch(origin + '/robots.txt')).text(), /Sitemap: https:\/\/wow\.ddctl\.com\/sitemap\.xml/);
  const redirect = await fetch(origin + '/font-manager?from=test', {redirect:'manual'});
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), '/font-manager/?from=test');
  const browser = await chromium.launch({channel:'chrome'});
  try {
    const staticPage = await browser.newPage({javaScriptEnabled:false});
    for (const [key, info] of Object.entries(pages)) {
      const response = await staticPage.goto(origin + info.path);
      assert.equal(response.status(), 200);
      assert.equal(await staticPage.title(), info.title);
      assert.equal(await staticPage.locator('meta[name="description"]').getAttribute('content'), info.description);
      assert.equal(await staticPage.locator('link[rel="canonical"]').getAttribute('href'), publicOrigin + info.path);
      const mainTitle = key === 'fonts' ? 'h1' : '#page-' + key + '.page.active h1';
      assert.ok(await staticPage.locator(mainTitle).isVisible(), key);
      await verifyHeading(staticPage, headings[key]);
    }
    const page = await browser.newPage();
    // Chrome 不向自动化工具暴露 Blob beacon 的消息体，在浏览器中读取隔离测试事件。
    await page.addInitScript(() => {
      window.testVisits = [];
      navigator.sendBeacon = (url, blob) => {
        if (url === '/api/track') window.testVisits.push(blob.text().then(JSON.parse));
        return true;
      };
    });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin);
    await verifyHeading(page, headings.home);
    for (const name of ['家宅图鉴','副本掉落','家宅分享']) {
      const card = page.locator('#page-home').getByRole('link', {name:new RegExp(name)});
      assert.ok(await card.isVisible(), name);
      assert.equal(await card.getByRole('img').count(), 0);
    }
    assert.equal(await page.locator('#page-home img:visible,#iaTopbar img[alt=""]:visible').count(), 0);
    await page.locator('#feedbackBtn').click();
    await page.getByRole('img', {name:'魔兽管家用户群 QQ 群二维码'}).waitFor();
    await page.locator('#feedbackBtn').click();
    await page.locator('[data-ia-tab="lootdrop"]').click();
    await verifyHeading(page, '副本掉落');
    await page.locator('[data-ia-tab="personal"]').click();
    await verifyHeading(page, '个人档案');
    await page.goto(origin + '/#/house/decor');
    await page.waitForURL(origin + pages.decor.path);
    await verifyHeading(page, headings.decor);
    await page.locator('[data-ia-tab="rankings"]').click();
    await page.waitForURL(origin + pages.rankings.path);
    await verifyHeading(page, headings.rankings);
    await page.locator('#rbPvp').click();
    await page.waitForURL(/#\/rankings\/pvp\/2v2$/);
    await verifyHeading(page, headings.rankings);
    await page.goBack();
    await page.waitForURL(origin + pages.rankings.path);
    await page.goBack();
    await page.waitForURL(origin + pages.decor.path);
    assert.ok(await page.locator('#page-decor.page.active').isVisible());
    await verifyHeading(page, headings.decor);
    await page.goForward();
    await page.waitForURL(origin + pages.rankings.path);
    assert.ok(await page.locator('#page-rankings.page.active').isVisible());
    await verifyHeading(page, headings.rankings);
    await page.locator('.ia-tabs a[href="/font-manager/"]').click();
    await page.locator('#pickFonts').waitFor({state:'visible'});
    await verifyHeading(page, headings.fonts);
    await page.waitForFunction(() => window.testVisits.length > 0);
    const fontVisits = await page.evaluate(async () => (await Promise.all(window.testVisits)).map(e => [e.page, e.event]));
    assert.deepEqual(fontVisits, [['index:font-manager', 'page_view']]);
    await page.getByRole('link', {name:'更新日志'}).click();
    await page.locator('#page-changelog.page.active').waitFor();
    await verifyHeading(page, '更新日志');
    const cards = page.locator('#changelogTimeline .changelog-item');
    assert.equal(await page.locator('#appVersion').textContent(), await cards.first().locator('.changelog-version').textContent());
    assert.equal(await page.locator('#latestChangeDate').getAttribute('datetime'), await cards.first().locator('.changelog-date').textContent());
    assert.ok(await cards.filter({hasText:'从顶部导航打开国服字体管理器'}).count());
    assert.ok(await cards.filter({hasText:'为不同游戏版本分别选字体'}).count());
    await page.locator('.ia-tabs a[href="/font-manager/"]').click();
    await page.getByRole('link',{name:'返回魔兽管家首页'}).click();
    await page.locator('#page-home.page.active').waitFor();
    await verifyHeading(page, headings.home);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
  console.log('PASS: sitemap, unique visible headings, image alternatives, feedback QR, no-script pages, route switches, history and font navigation');
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
