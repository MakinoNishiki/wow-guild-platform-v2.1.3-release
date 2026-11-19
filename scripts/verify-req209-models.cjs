// Isolated real Chrome + actual catalog/component/model assets. No DB writes.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'docs/evidence/req209-models-20261119');
const ids = fs.readdirSync(path.join(root, 'assets/decor-models/task084')).filter(f => f.endsWith('.glb')).map(f => Number(f.split('.')[0]));
const source = JSON.parse(fs.readFileSync(path.join(root, 'data/task083/catalog-current-2335.json'), 'utf8'));
const rows = source.filter(r => ids.includes(r.record_id));
rows.push({ record_id: 999999, name: '缺模型与长名称回退测试家具（仅隔离测试）', entry_type: 1, tags: [], quality: 3 });
const requests = [], errors = [], checks = [];
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>家具图鉴 3D 隔离验证</title><link rel="stylesheet" href="/css/main.css"><link rel="stylesheet" href="/css/decor-public.css"><link rel="stylesheet" href="/css/decor-model.css"><body><main style="padding:24px;max-width:1600px;margin:auto"><h1>家宅图鉴 · 3D 验证</h1><div id="catalog"><div id="dhFilterBar"></div><div id="dhMain"></div></div><div id="plan"></div></main><script src="/js/decorDict.js"></script><script src="/js/decorModelManifest.js"></script><script src="/js/decorModelPreview.js?v=209"></script><script src="/js/decorData.js"></script><script>DecorCatalog.mount(document.getElementById('catalog'));DecorCatalog.mountPlanPage(document.getElementById('plan'));</script>`;
const server = http.createServer((req, res) => {
  requests.push(req.url);
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html;charset=utf-8'); return res.end(html); }
  if (req.url === '/api/supabase-config') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ url: `http://127.0.0.1:${server.address().port}`, anonKey: 'fixture' })); }
  if (req.url.startsWith('/rest/v1/decor_catalog?')) { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(rows)); }
  const name = decodeURIComponent(req.url.split('?')[0]), file = path.resolve(root, '.' + name);
  if (!/^\/(js|css|assets)\//.test(name) || !file.startsWith(root + path.sep)) { res.writeHead(404); return res.end(); }
  try { res.setHeader('Content-Type', { '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.glb': 'model/gltf-binary' }[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file)); }
  catch { res.writeHead(404); res.end(); }
});
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const base = `http://127.0.0.1:${server.address().port}`;
    await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    const open = async id => { await page.locator(`.dh-card[data-rid="${id}"]`).click(); await page.locator('.dh-model-preview').waitFor(); };
    const close = async () => { await page.locator('.dh-modal-close').click(); await page.locator('.dh-modal-overlay').waitFor({ state: 'detached' }); assert.equal(await page.locator('canvas').count(), 0); };
    const load = async () => { await page.locator('[data-view="model"]').click(); await page.locator('.dh-model-preview[data-state="ready"]').waitFor({ timeout: 30000 }); };
    await open(27684);
    assert.equal(requests.filter(x => /three-r180|\.glb|decorModelViewer/.test(x)).length, 0);
    checks.push('图鉴与图片详情默认不请求 3D 运行库和 GLB');
    await load();
    const canvas = page.locator('.dh-model-canvas canvas');
    const before = sha(await canvas.screenshot());
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width * .4, box.y + box.height * .5);
    await page.mouse.down(); await page.mouse.move(box.x + box.width * .75, box.y + box.height * .65, { steps: 12 }); await page.mouse.up();
    assert.notEqual(sha(await canvas.screenshot()), before);
    const dragged = sha(await canvas.screenshot());
    await page.mouse.wheel(0, -250); await page.waitForTimeout(150);
    assert.notEqual(sha(await canvas.screenshot()), dragged);
    await page.locator('[data-action="reset"]').click(); assert.equal(sha(await canvas.screenshot()), before);
    await canvas.focus(); const focused = sha(await canvas.screenshot());
    await page.keyboard.press('ArrowLeft'); assert.notEqual(sha(await canvas.screenshot()), focused);
    await page.keyboard.press('Home'); await page.locator('[data-action="reset"]').focus(); assert.equal(sha(await canvas.screenshot()), before);
    await page.screenshot({ path: path.join(output, 'table-1366.png') });
    checks.push('真实家具详情：鼠标拖动、滚轮缩放、复位、键盘旋转与复位均产生可核像素变化/还原');
    await page.locator('[data-view="image"]').click(); assert.equal(await page.locator('canvas').count(), 0);
    assert.equal(await page.locator('.dh-model-poster').isVisible(), true);
    await load(); await close(); checks.push('切回图片释放 canvas；再次进入 3D、关闭详情均完成清理');
    const modelResults = [];
    for (const id of ids) {
      await open(id); await load();
      const front = await canvas.screenshot();
      for (let i = 0; i < 9; i++) await page.locator('[data-action="right"]').click();
      const back = await canvas.screenshot();
      assert.notEqual(sha(front), sha(back));
      fs.writeFileSync(path.join(output, `model-${id}-front.png`), front);
      fs.writeFileSync(path.join(output, `model-${id}-back.png`), back);
      modelResults.push({ id, name: source.find(r => r.record_id === id).name, front: sha(front), back: sha(back) });
      await close();
    }
    checks.push('26 个实际 GLB 全部装载并旋转至背面；前后角度像素不同，逐件关闭零残留 canvas');
    await open(28556); await load(); await page.setViewportSize({ width: 1920, height: 1080 });
    await page.screenshot({ path: path.join(output, 'plant-1920.png') }); await close();
    await open(999999); assert.equal(await page.locator('[data-view="model"]').isDisabled(), true);
    assert.match(await page.locator('.dh-model-status').innerText(), /暂未提供/);
    assert.equal(await page.locator('.dh-model-poster').evaluate(img => img.complete && img.naturalWidth > 0), true);
    await page.screenshot({ path: path.join(output, 'missing-model.png') }); await close(); checks.push('缺模型/缺图片和长名称保留图片占位及来源、加单，不提供虚假 3D 入口');
    await page.route('**/27684.glb', route => route.abort());
    await open(27684); await page.locator('[data-view="model"]').click(); await page.locator('.dh-model-preview[data-state="error"]').waitFor();
    assert.equal(await page.locator('.dh-model-poster').isVisible(), true);
    await page.screenshot({ path: path.join(output, 'failure.png') });
    await page.unroute('**/27684.glb'); await page.locator('.dh-model-retry').click(); await page.locator('.dh-model-preview[data-state="ready"]').waitFor();
    checks.push('模型请求失败保留图片，重新加载成功');
    await canvas.evaluate(el => el.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
    await page.locator('.dh-model-preview[data-state="error"]').waitFor();
    assert.equal(await page.locator('canvas').count(), 0);
    await page.locator('.dh-model-retry').click(); await page.locator('.dh-model-preview[data-state="ready"]').waitFor();
    checks.push('真实 WebGL 上下文丢失后销毁并回退图片，重试恢复');
    await close();
    let releaseRequest;
    await page.route('**/27684.glb', async route => { await new Promise(resolve => releaseRequest = resolve); await route.continue().catch(() => {}); });
    await open(27684); await page.locator('[data-view="model"]').click();
    await page.waitForFunction(() => document.querySelector('.dh-model-preview')?.dataset.state === 'loading');
    await page.screenshot({ path: path.join(output, 'loading.png') }); await close(); releaseRequest?.();
    await page.unroute('**/27684.glb'); await open(27220); await load();
    assert.equal(await page.locator('canvas').count(), 1); await close(); checks.push('加载未完成关闭后，切换另一家具不会出现旧模型/多 canvas');
    // A fresh page verifies module download failure rather than the GLB failure above.
    await page.reload(); await page.route('**/decorModelViewer.js*', route => route.abort());
    await open(27684); await page.locator('[data-view="model"]').click(); await page.locator('.dh-model-preview[data-state="error"]').waitFor();
    await page.unroute('**/decorModelViewer.js*'); await page.locator('.dh-model-retry').click(); await page.locator('.dh-model-preview[data-state="ready"]').waitFor();
    checks.push('运行库请求失败后重试恢复，不受浏览器失败模块缓存阻断'); await close();
    assert.deepEqual(errors, []);
    await page.setViewportSize({ width: 1600, height: 1400 });
    await page.setContent('<html lang="zh-CN"><meta charset="utf-8"><body style="margin:12px;background:#10151b;color:#e0e5eb;font:13px sans-serif;display:grid;grid-template-columns:repeat(4,1fr);gap:8px">' + modelResults.map(row => '<figure style="margin:0;border:1px solid #3a4046;padding:6px"><figcaption>' + row.id + ' · ' + row.name + '</figcaption><div style="display:flex">' + ['front','back'].map(side => '<img style="width:50%;height:180px;object-fit:contain" src="data:image/png;base64,' + fs.readFileSync(path.join(output, `model-${row.id}-${side}.png`)).toString('base64') + '">').join('') + '</div></figure>').join('') + '</body></html>');
    await page.screenshot({ path: path.join(output, 'models-contact.png'), fullPage: true });
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({ browser: await browser.version(), rendering: 'Chrome headless / SwiftShader，非普通显卡性能基准', checks, models: modelResults, errors, requests: requests.filter(r => /three-r180|\.glb|decorModelViewer/.test(r)) }, null, 2));
    console.log(JSON.stringify({ checks, models: modelResults.length, errors }, null, 2));
  } finally { await browser?.close(); server.closeAllConnections(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
