// Real Chrome, actual components; public row replay + synthetic edges, no DB or credentials.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs/evidence/bug127-20261118');
const scroll = JSON.parse(fs.readFileSync(path.join(output, 'catalog-row-126.json'), 'utf8'));
const vendor = { type: 'vendor', vendor: '测试商人', zones: ['测试地区'], price: [{ gold: 12 }], reputation: '声望尊敬', context: [{ label: '前置', value: '完成测试任务' }] };
const rows = [
  scroll,
  { record_id: 20101, name: '多途径灯具', sources: [
    vendor, JSON.parse(JSON.stringify(vendor)),
    { ...vendor, vendor: '另一商人' },
    { ...vendor, zones: ['另一个地区'] },
    { ...vendor, price: [{ gold: 13 }] },
    { ...vendor, price: [{ currency_id: 824, amount: 12 }] },
    { ...vendor, reputation: '声望崇敬' },
    { ...vendor, context: [{ label: '前置', value: '完成另一任务' }] },
    { type: 'achievement', achievement: '测试成就' }
  ] },
  { record_id: 20102, name: '原文货币家具', sources: [], source_text: '|cffffffff商人：测试乙|r|n价格：|r350|Hcurrency:824|h|n地区：测试地点|n商人：测试丙|n价格：|r350|Hcurrency:824|h|n地区：测试地点' },
  { record_id: 20103, name: '未知来源家具', sources: [] },
  { record_id: 20104, name: '文字 <img src=x onerror=alert(1)> 家具', sources: [{ type: 'quest', quest: '<script>example</script>' }, vendor] }
].map(r => ({ entry_type: 1, quality: 3, category_ids: [], subcategory_ids: [], tags: [], placement_cost: 2, icon_file_id: null, ...r }));
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="stylesheet" href="/css/main.css"><link rel="stylesheet" href="/css/decor-public.css"></head><body><div id="catalog"><div id="dhFilterBar"></div><div id="dhMain"></div></div><main id="plan" style="margin:24px"></main><script src="/js/decorDict.js"></script><script src="/js/decorData.js"></script><script>DecorCatalog.mount(document.getElementById('catalog'));DecorCatalog.mountPlanPage(document.getElementById('plan'));</script></body></html>`;
const requests = [];
const server = http.createServer((req, res) => {
  requests.push({ method: req.method, url: req.url });
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html;charset=utf-8'); return res.end(html); }
  if (req.url === '/api/supabase-config') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ url: `http://127.0.0.1:${server.address().port}`, anonKey: 'fixture' })); }
  if (req.url.startsWith('/rest/v1/decor_catalog?')) { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(rows)); }
  const name = decodeURIComponent(req.url.split('?')[0]);
  const file = path.resolve(root, '.' + name);
  if (!/^\/(js|css|assets)\//.test(name) || !file.startsWith(root + path.sep)) { res.writeHead(404); return res.end(); }
  try {
    const mime = { '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch { res.writeHead(404); res.end(); }
});
(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser, page;
  const checks = [], errors = [];
  const passed = label => { checks.push(label); console.log('PASS ' + label); };
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const base = `http://127.0.0.1:${server.address().port}`;
    await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.locator('[data-add="20101"]').first().waitFor();
    for (const row of rows) await page.locator(`[data-add="${row.record_id}"]`).first().click();
    await page.locator('#plan tr[data-rid="20101"] [data-step="1"]').click();
    assert.equal(await page.locator('#dhPpTotal').innerText(), '6');
    // Inspect existing detail first: same source wording should be retained after the shared helper extraction.
    await page.locator('.dh-card[data-rid="20102"]').click();
    const detail = await page.locator('.dh-modal-overlay').innerText();
    assert.match(detail, /350 × 要塞物资/);
    await page.locator('.dh-modal-close').click();
    await page.locator('.dh-modal-overlay').waitFor({ state: 'detached' });
    passed('图鉴加单、数量与原文货币详情回归');
    await page.locator('.dh-card[data-rid="126"]').click();
    const scrollDetail = await page.locator('.dh-modal-overlay .dh-src-item').allTextContents();
    await page.locator('.dh-modal-close').click();
    await page.locator('.dh-modal-overlay').waitFor({ state: 'detached' });
    const draftBefore = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
    await page.locator('#dhPpExport').click();
    const text = page.locator('#dhPlanExportText');
    const choice = page.locator('#dhExpIncludeSources');
    assert.equal(await choice.isChecked(), true);
    const full = await text.inputValue();
    assert.match(full, /家宅获取清单/);
    assert.match(full, /多途径灯具 ×2/);
    assert.match(full, /商人：测试商人（测试地区） · 12 金 · 声望尊敬 · 前置：完成测试任务/);
    assert.match(full, /成就：测试成就/);
    assert.match(full, /350 × 要塞物资/);
    assert.match(full, /价格：350 × 要塞物资\n  · 地区：测试地点/);
    assert.match(full, /来源未知/);
    assert.match(full, /合计 6 件 · 容量 11/);
    assert.ok(!full.includes('|H') && !full.includes('|cffffffff'));
    passed('默认获取清单完整保留多来源、区域、条件、币种、缺来源与数量');
    const scrollLine = '商人：克劳勒中士（坠落之月） · 100 × 要塞物资 + 50 金';
    const scrollCount = full.split(scrollLine).length - 1;
    if (scrollCount !== 1) fs.writeFileSync(path.join(output, 'reproduction.json'), JSON.stringify({ expectedCount: 1, exportCount: scrollCount, detailCount: scrollDetail.length, rawSourceCount: scroll.sources.length }, null, 2));
    assert.equal(scrollCount, 1, 'BUG-127: scroll source should appear once');
    assert.deepEqual(scrollDetail, [scrollLine]);
    assert.equal(scroll.sources.length, 2);
    passed('真实卷轴来源详情/导出仅一次，原始两条数据保留');
    const lampBlock = full.split('多途径灯具 ×2')[1].split('原文货币家具')[0];
    const lampSources = lampBlock.split('\n').filter(line => line.startsWith('  · '));
    assert.equal(lampSources.length, 8);
    assert.equal(new Set(lampSources).size, 8);
    for (const expected of ['另一商人', '另一个地区', '13 金', '12 × 要塞物资', '声望崇敬', '完成另一任务', '成就：测试成就']) assert.ok(lampBlock.includes(expected), expected);
    assert.equal(full.split('商人：测试商人（测试地区） · 12 金 · 声望尊敬 · 前置：完成测试任务').length - 1, 2);
    passed('不同商人/地点/价格/币种/条件途径及跨家具相同来源均保留');
    assert.equal(full.split('价格：350 × 要塞物资\n  · 地区：测试地点').length - 1, 2);
    passed('原文不同商人的重复价格与地区不误删');
    for (const width of [1366, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: path.join(output, `default-${width}.png`), animations: 'disabled' });
    }
    assert.match(full, /<script>example<\/script>/);
    assert.equal(await page.locator('#dhExpPaneText script').count(), 0);
    passed('来源和名称作为文本显示，不执行HTML');
    await choice.uncheck();
    const simple = await text.inputValue();
    assert.match(simple, /家宅方案单/);
    assert.ok(!simple.includes('商人：') && !simple.includes('来源未知'));
    assert.match(simple, /合计 6 件 · 容量 11/);
    passed('取消来源切回简洁清单且数量容量不变');
    await text.fill(simple + '\n手动备注');
    page.once('dialog', d => d.dismiss());
    await choice.click();
    assert.equal(await choice.isChecked(), false);
    assert.equal(await text.inputValue(), simple + '\n手动备注');
    passed('手动修改后取消切换，原文字和选项均保留');
    page.once('dialog', d => d.accept());
    await choice.check();
    assert.equal(await text.inputValue(), full);
    passed('确认切换才重新生成获取清单');
    await page.locator('#dhPlanCopyBtn').click();
    assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'), full);
    passed('实际点击复制并回读Chrome剪贴板，内容一致');
    await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async () => { throw new Error('permission denied'); } }));
    await page.locator('#dhPlanCopyBtn').click();
    assert.equal(await text.evaluate(el => el.selectionEnd - el.selectionStart), full.length);
    assert.match(await page.locator('#dhPlanToast').innerText(), /Ctrl\+C/);
    passed('复制权限拒绝后全选文本并给出手动复制提示');
    await text.fill(full + '\n临时备注');
    await page.locator('#dhExpTabImage').click();
    await page.locator('#dhExpCanvas').waitFor({ state: 'visible' });
    await page.locator('#dhExpTabText').click();
    assert.equal(await text.inputValue(), full + '\n临时备注');
    passed('图片标签可切换，返回文字仍保留手改内容');
    page.once('dialog', d => d.dismiss());
    await page.locator('.dh-plan-export .dh-modal-close').click();
    assert.equal(await text.isVisible(), true);
    passed('有手改内容时取消关闭保持弹窗');
    for (const width of [1366, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      for (const locator of [choice, text, page.locator('#dhPlanCopyBtn')]) {
        const box = await locator.boundingBox();
        assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= 900);
      }
      await page.screenshot({ path: path.join(output, `export-${width}.png`), animations: 'disabled' });
      passed(`${width}宽度选项、文本与复制按钮完整可见`);
    }
    page.once('dialog', d => d.accept());
    await page.locator('.dh-plan-export .dh-modal-close').click();
    await page.locator('.dh-plan-export-overlay').waitFor({ state: 'detached' });
    // Drawer is the second real entry into the same exporter.
    await page.locator('#dhPlanToggle').click();
    await page.locator('#dhPlanExport').click();
    assert.equal(await choice.isChecked(), true);
    assert.equal(await text.inputValue(), full);
    passed('图鉴抽屉导出共用同一清单，重新打开复位临时编辑');
    assert.equal(await page.evaluate(() => JSON.stringify(Object.entries(localStorage))), draftBefore);
    assert.ok(requests.every(r => r.method === 'GET'));
    assert.deepEqual(errors, []);
    passed('导出不改草稿、不发业务写请求、无页面异常');
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({ environment: 'Real Chrome; actual decor components; public row 126 replay + synthetic catalog; no DB, login or production verification', checks, pageErrors: errors }, null, 2));
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(output, 'failure.png') });
    throw error;
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
