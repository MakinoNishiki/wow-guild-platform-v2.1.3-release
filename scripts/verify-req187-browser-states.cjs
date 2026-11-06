const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const output = 'docs/evidence/req187-20261107';
const html = '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/css/main.css"><link rel="stylesheet" href="/css/decor-public.css"></head><body><div id="catalog"><div id="dhFilterBar"></div><div id="dhMain"></div></div><main id="plan" style="margin:24px"></main><script src="/js/decorDict.js"></script><script src="/js/decorData.js"></script></body></html>';
const server = http.createServer((req, res) => {
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html;charset=utf-8'); return res.end(html); }
  if (req.url === '/api/supabase-config') return res.end(JSON.stringify({ url: 'http://127.0.0.1:' + server.address().port, anonKey: 'fixture' }));
  if (req.url.startsWith('/rest/v1/decor_catalog?')) return res.end(JSON.stringify([{ record_id: 1, name: '状态测试家具', entry_type: 1, tags: {}, sources: [], category_ids: [], subcategory_ids: [], placement_cost: 1 }]));
  const name = decodeURIComponent(req.url.split('?')[0]);
  const file = path.resolve('.' + name);
  if (!/^\/(js|css|assets)\//.test(name) || !file.startsWith(process.cwd() + path.sep)) { res.writeHead(404); return res.end(); }
  try { res.end(fs.readFileSync(file)); } catch { res.writeHead(404); res.end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  const checks = [];
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.evaluate(() => {
      window.testUid = 'a'; window.requests = [];
      window.CloudSync = { getCachedUser: () => testUid ? { id: testUid } : null };
      DecorCatalog.planBridge = {
        isLoggedIn: () => !!testUid,
        listPlans: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
        currentPlanId: () => testUid,
      };
      DecorCatalog.mount(document.getElementById('catalog'));
      DecorCatalog.mountPlanPage(document.getElementById('plan'));
    });
    await page.waitForFunction(() => requests.length === 1);
    assert.equal(await page.locator('#dhPpCreate').isDisabled(), true);
    checks.push('加载时新建和保存禁用');
    assert.equal(await page.locator('#dhPlanSave').isDisabled(), true);
    await page.evaluate(() => { testUid = null; DecorCatalog.syncPersonalContext(); });
    await page.waitForFunction(() => !document.getElementById('dhPlanSave').disabled);
    assert.equal(await page.locator('#plan').getByText('正在读取个人方案…').count(), 0);
    await page.evaluate(() => requests[0].resolve([{ id: 'a', name: '不应出现', items: [] }]));
    assert.equal((await page.locator('#plan').innerText()).includes('不应出现'), false);
    checks.push('读取中登出清除加载状态且旧结果不回填');
    await page.evaluate(() => { testUid = 'a'; DecorCatalog.syncPersonalContext(); });
    await page.waitForFunction(() => requests.length === 2);
    await page.evaluate(() => requests[1].resolve([{ id: 'a', name: '保留方案', items: [{ record_id: 1, qty: 2 }] }]));
    await page.waitForFunction(() => document.getElementById('dhPpTotal').textContent === '2');
    await page.evaluate(() => DecorCatalog.activatePlanPage());
    await page.waitForFunction(() => requests.length === 3);
    await page.evaluate(() => requests[2].reject(Error('模拟网络中断')));
    await page.locator('#dhPpRetryPersonal').waitFor();
    assert.equal(await page.locator('#dhPpTotal').innerText(), '2');
    assert.equal(await page.locator('#dhPpCreate').isDisabled(), true);
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: output + '/plan-load-error.png', fullPage: true });
    checks.push('读取失败保留原两件家具并提供重试');
    await page.locator('#dhPpRetryPersonal').click();
    await page.waitForFunction(() => requests.length === 4);
    await page.evaluate(() => requests[3].resolve([{ id: 'a', name: '保留方案', items: [{ record_id: 1, qty: 2 }] }]));
    await page.waitForFunction(() => !document.getElementById('dhPpCreate').disabled);
    assert.equal(await page.locator('#dhPpRetryPersonal').count(), 0);
    checks.push('点击重新加载成功后恢复操作');
    await page.evaluate(() => { DecorCatalog.activatePlanPage(); DecorCatalog.activatePlanPage(); });
    await page.waitForFunction(() => requests.length === 6);
    await page.evaluate(() => requests[5].resolve([{ id: 'a', name: '最新方案', items: [] }]));
    await page.waitForFunction(() => !document.getElementById('dhPpCreate').disabled);
    await page.evaluate(() => requests[4].reject(Error('过期失败')));
    assert.equal(await page.locator('#dhPpRetryPersonal').count(), 0);
    assert.equal(await page.locator('#dhPpCreate').isDisabled(), false);
    checks.push('旧失败不覆盖较新成功结果');
    assert.deepEqual(errors, []);
    fs.writeFileSync(output + '/browser-states.json', JSON.stringify({ environment: 'real Chrome; full decorData.js and real DOM; synthetic account and network bridge; no database writes', checks, pageErrors: errors }, null, 2));
    console.log('PASS ' + checks.join('\nPASS '));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
