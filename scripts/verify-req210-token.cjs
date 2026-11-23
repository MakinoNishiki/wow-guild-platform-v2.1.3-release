// Start the real site on a temporary loopback port. No account, writes or live analytics.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { chromium } = require('playwright');
process.env.DEPLOY_RUN_PORT = '0';
process.env.DEPLOY_RUN_HOST = '127.0.0.1';
const { startServer } = require('../server.js');
const output = process.env.WB_VERIFY_OUTPUT || path.join(__dirname, '../docs/evidence/req210-20261123');

async function verify() {
  const server = startServer();
  let browser;
  try {
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port;
    fs.mkdirSync(output, { recursive: true });
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 850 } });
    await page.clock.install();
    await page.route('**/api/track', route => route.fulfill({ status: 204 }));
    const liveResponse = page.waitForResponse(r => r.url() === base + '/api/wow-token/cn');
    await page.goto(base + '/#/house/decor', { waitUntil: 'domcontentloaded' });
    const response = await liveResponse;
    assert.equal(response.status(), 200);
    const live = await response.json();
    const formatted = n => new Intl.NumberFormat('zh-CN').format(n);
    const waitPrice = value => page.waitForFunction(v => document.querySelector('#homeTokenPrice').textContent === v, value);
    await waitPrice(formatted(live.gold));
    const go = name => page.locator('[data-ia-tab="' + name + '"]').click();
    const menu = page.locator('#tokenMenu');
    const summary = menu.locator(':scope > summary');
    const card = menu.locator('.home-token');
    assert.equal(await menu.evaluate(el => el.parentElement.classList.contains('ia-top-right') && el.previousElementSibling.id === 'feedbackEntry'), true);
    assert.equal(await page.locator('#tokenMenuPrice').innerText(), formatted(live.gold) + ' 金');
    await summary.press('Enter');
    await card.waitFor();
    await card.getByText('区间统计',{exact:true}).click();
    assert.equal(await card.locator('[data-value=change]').innerText(), '—');
    assert.match(await card.locator('[data-value=coverage]').innerText(), /已采 1 次/);
    assert.equal(await card.locator('img').evaluate(img => img.complete && img.naturalWidth > 0 && img.clientWidth === 20 && img.clientHeight === 20), true);
    assert.match(await card.locator('[role=status]').innerText(), /本站读取.+北京时间/);
    assert.equal(await card.getByRole('link').getAttribute('href'), 'https://wowdata.top/wowtoken_retail');
    await card.getByRole('link').focus();
    assert.equal(await card.getByRole('link').evaluate(a => a === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(await card.isVisible(), false);
    assert.ok(await summary.evaluate(el => el === document.activeElement));
    await page.mouse.move(10, 120);
    await summary.click();
    for (const width of [1366, 1920]) {
      await page.setViewportSize({ width, height: width === 1366 ? 850 : 1080 });
      const box = await card.boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= width);
      assert.ok(await card.getByRole('link').evaluate(link => {
        const r = link.getBoundingClientRect();
        return link.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      }));
      await page.screenshot({ path: path.join(output, 'header-' + width + '.png') });
    }
    await page.locator('#pageTitle').click();
    assert.equal(await card.isVisible(), false);
    assert.equal(new URL(page.url()).hash, '#/house/decor');
    let gold = 101234;
    let failing = false;
    let requests = 0;
    await page.route('**/api/wow-token/cn', route => {
      requests++;
      const at = Date.now();
      return route.fulfill({ status: failing ? 503 : 200, json: failing ? {} : {
        gold, readAt: at, stale: false, samples: [
          [480,97000],[360,99000],[180,103000],[120,98000],[60,100000],[55,100050],
          [50,100120],[45,100070],[40,100200],[35,100400],[30,100350],[25,100690],
          [20,100760],[15,100720],[10,100810],[5,101000],[0,gold]
        ].map(([minutes, value]) => ({ at: at - minutes * 60000, gold: value }))
      } });
    });
    await go('house');
    await summary.click();
    assert.ok(await card.isVisible());
    await go('team');
    assert.equal(await card.isVisible(), false);
    await summary.click();
    assert.ok(await card.isVisible());
    assert.equal(requests, 0);
    await page.clock.fastForward(65_000);
    await waitPrice(formatted(gold));
    assert.equal(requests, 1);
    assert.equal(await page.locator('#topTokenPrice').innerText(), formatted(gold));
    const chart = page.locator('#topTokenChart');
    const field = key => card.locator('[data-value="' + key + '"]').innerText();
    assert.ok(await chart.isVisible());
    assert.equal(await card.locator('[aria-pressed=true]').innerText(), '6 小时');
    assert.equal(await field('change'), '+2,234 金');
    assert.equal(await field('percent'), '+2.26%');
    assert.equal(await field('low'), '98,000');
    assert.equal(await field('high'), '103,000');
    assert.ok(await chart.locator('.token-line').evaluate(path => path.getAttribute('d').split('M').length > 2));
    const businessRoute = page.url();
    await card.getByRole('button', { name: '24 小时' }).click();
    assert.equal(await field('change'), '+4,234 金');
    await chart.focus();
    await chart.press('Home');
    assert.match(await field('reading'), /97,000 金币/);
    await chart.press('ArrowRight');
    assert.match(await field('reading'), /99,000 金币/);
    const plotBox = await chart.boundingBox();
    await page.mouse.move(plotBox.x + plotBox.width * 0.4, plotBox.y + plotBox.height / 2);
    assert.match(await field('reading'), /未采到报价/);
    await card.getByRole('button', { name: '1 小时', exact: true }).click();
    assert.equal(await field('percent'), '+1.23%');
    assert.equal(await field('low'), '100,000');
    assert.equal(await field('high'), '101,234');
    assert.match(await field('coverage'), /已采 13 次 \/ 预计 13 次/);
    await chart.focus();
    await chart.press('ArrowLeft');
    assert.match(await field('reading'), /101,000 金币/);
    assert.equal(page.url(), businessRoute);
    assert.equal(requests, 1);
    await go('house');
    await summary.click();
    await chart.focus();
    await chart.press('End');
    await page.screenshot({ path: path.join(output, 'trend-1h-fixture.png') });
    await card.screenshot({ path: path.join(output, 'trend-panel-fixture.png') });
    await go('home');
    assert.ok(await page.locator('#homeTokenChart').isVisible());
    assert.match(await page.locator('#homeTokenChart').getAttribute('aria-label'), /97,000/);
    gold++;
    await page.clock.fastForward(60_000);
    await waitPrice(formatted(gold));
    failing = true;
    await page.clock.fastForward(60_000);
    await page.locator('#homeTokenStatus[data-stale=true]').waitFor();
    assert.match(await page.locator('#tokenMenuPrice').innerText(), /^上次 /);
    assert.equal(await page.locator('#homeTokenPrice').innerText(), formatted(gold));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#page-home').getByText('暂时无法取得报价，稍后自动重试').waitFor();
    assert.equal(await page.locator('#tokenMenuPrice').innerText(), '暂无报价');
    assert.equal(await page.locator('#homeTokenUnit').isVisible(), false);
    await summary.click();
    await card.getByText('区间统计',{exact:true}).click();
    assert.equal(await field('reading'), '所选时段暂无报价');
    assert.equal(await field('low'), '—');
    await summary.click();
    failing = false;
    await page.clock.fastForward(60_000);
    await waitPrice(formatted(gold));
    const previousRequests = requests;
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.fastForward(120_000);
    assert.equal(requests, previousRequests);
    const visibleResponse = page.waitForResponse(r => r.url() === base + '/api/wow-token/cn');
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await visibleResponse;
    assert.equal(requests, previousRequests + 1);
    assert.equal((await fetch(base + '/api/wow-token/cn', { method: 'DELETE' })).status, 405);
    const result = { liveGold: live.gold, readAt: new Date(live.readAt).toISOString(), source: 'https://wowdata.top/wowtoken_retail',
      liveChecks: ['guest deep link', 'source attribution', '20px local icon', '1366/1920 header', 'keyboard dismissal', 'outside dismissal'],
      simulatedChecks: ['house/team/home navigation', 'single shared poll', '1/6/24h change and extremes', 'pointer in sampling gap', 'accessible keyboard quotation', 'time range without navigation or new request', 'last known price', 'cold failure', 'recovery', 'hidden tab pause/resume'] };
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result));
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1; });
