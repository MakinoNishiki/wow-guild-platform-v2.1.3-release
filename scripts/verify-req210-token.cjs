// Start the real site on a temporary loopback port. No account, writes or live analytics.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { chromium } = require('playwright');
process.env.DEPLOY_RUN_PORT = '0';
process.env.DEPLOY_RUN_HOST = '127.0.0.1';
const { startServer } = require('../server.js');
const output = path.join(__dirname, '../docs/evidence/req210-20261122');

async function verify() {
  const server = startServer();
  let browser;
  try {
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port;
    fs.mkdirSync(output, { recursive: true });
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 850 } });
    await page.route('**/api/track', route => route.fulfill({ status: 204 }));
    const liveResponse = page.waitForResponse(r => r.url() === base + '/api/wow-token/cn');
    await page.goto(base + '/#/home', { waitUntil: 'domcontentloaded' });
    const response = await liveResponse;
    assert.equal(response.status(), 200);
    const live = await response.json();
    const formatted = n => new Intl.NumberFormat('zh-CN').format(n);
    const waitPrice = value => page.waitForFunction(v => document.querySelector('#homeTokenPrice').textContent === v, value);
    await waitPrice(formatted(live.gold));
    const card = page.locator('.home-token');
    assert.equal(await card.locator('img').evaluate(img => img.complete && img.naturalWidth > 0 && img.clientWidth === 20 && img.clientHeight === 20), true);
    assert.match(await card.locator('[role=status]').innerText(), /本站读取.+北京时间/);
    assert.equal(await card.getByRole('link').getAttribute('href'), 'https://wowdata.top/wowtoken_retail');
    await card.getByRole('link').focus();
    assert.equal(await card.getByRole('link').evaluate(a => a === document.activeElement), true);
    await card.getByRole('link').blur();
    for (const width of [1366, 1920]) {
      await page.setViewportSize({ width, height: width === 1366 ? 850 : 1080 });
      const box = await card.boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= width);
      await page.screenshot({ path: path.join(output, 'home-' + width + '.png') });
    }
    await card.screenshot({ path: path.join(output, 'quote.png') });

    await page.clock.install();
    let gold = 101234;
    let failing = false;
    let requests = 0;
    await page.route('**/api/wow-token/cn', route => {
      requests++;
      const at = Date.now();
      return route.fulfill({ status: failing ? 503 : 200, json: failing ? {} : {
        gold, readAt: at, stale: false, samples: [{ at: at - 300000, gold: 101000 }, { at, gold }]
      } });
    });
    const go = name => page.locator('[data-ia-tab="' + name + '"]').click();
    await go('changelog');
    await page.clock.fastForward(65_000);
    assert.equal(requests, 0);
    await go('home');
    await waitPrice(formatted(gold));
    assert.ok(await page.locator('#homeTokenChart').isVisible());
    assert.match(await page.locator('#homeTokenChart').getAttribute('aria-label'), /101,000/);
    await card.screenshot({ path: path.join(output, 'sampled-trend-fixture.png') });
    gold++;
    await page.clock.fastForward(60_000);
    await waitPrice(formatted(gold));
    failing = true;
    await page.clock.fastForward(60_000);
    await page.locator('#homeTokenStatus[data-stale=true]').waitFor();
    assert.equal(await page.locator('#homeTokenPrice').innerText(), formatted(gold));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText('暂时无法取得报价，稍后自动重试').waitFor();
    assert.equal(await page.locator('#homeTokenUnit').isVisible(), false);
    failing = false;
    await page.clock.fastForward(60_000);
    await waitPrice(formatted(gold));
    assert.equal((await fetch(base + '/api/wow-token/cn', { method: 'DELETE' })).status, 405);
    const result = { liveGold: live.gold, readAt: new Date(live.readAt).toISOString(), source: 'https://wowdata.top/wowtoken_retail',
      liveChecks: ['guest homepage', 'source attribution', '20px local icon', '1366/1920 layout'],
      simulatedChecks: ['route exit/re-entry', 'automatic refresh', 'trend', 'last known price', 'cold failure', 'recovery'] };
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result));
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1; });
