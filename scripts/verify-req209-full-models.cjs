'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const catalog = require('../data/task083/catalog-current-2335.json');
const evidence = process.env.WB_VERIFY_OUTPUT || path.join(root, 'docs/evidence/req209-full-models');
const fixtures = { likes: 0, favorites: 1, views: 2 };
const mimes = { '.html': 'text/html;charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
  if (url.pathname === '/api/supabase-config') return json({ url: 'http://127.0.0.1:' + server.address().port, anonKey: 'fixture' });
  if (url.pathname === '/rest/v1/decor_catalog') {
    const offset = Number(url.searchParams.get('offset'));
    return json(catalog.slice(offset, offset + 1000));
  }
  if (url.pathname.startsWith('/api/decor-engagement/')) return json({ rows: [{record_id:80,...fixtures}], liked_ids: [], ...fixtures });
  if (url.pathname === '/audit') { res.setHeader('Content-Type', 'text/html'); return res.end('<script src="/js/decorModelManifest.js"></script><main style="width:128px;height:128px"></main>'); }
  const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (!/^(index\.html$|(js|css|assets)\/)/.test(name)) { res.writeHead(404); return res.end(); }
  const file = path.resolve(root, name);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', mimes[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

async function renderBatch(page, ids) {
  return page.evaluate(async ids => {
    const { createViewer } = await import('/js/decorModelViewer.js');
    const samples = [];
    for (const id of ids) {
      const metadata = window.DecorModelManifest[id];
      let viewer;
      try {
        const file = metadata.blendModes ? 'task084/' + id : 'catalog/' + metadata.assetId;
        const host = document.querySelector('main');
        viewer = await createViewer({ host, metadata, recordId: id, url: '/assets/decor-models/' + file + '.glb',
          signal: new AbortController().signal, onError: message => { throw new Error(message); } });
        const canvas = host.querySelector('canvas'), gl = canvas.getContext('webgl2');
        viewer.reset();
        const data = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
        let visible = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 8) visible++;
        if (!visible) throw new Error('blank render');
        samples.push({ id, visible });
      } catch (e) { samples.push({ id, error: e.message }); }
      finally { viewer?.destroy(); }
    }
    return samples;
  }, ids);
}

async function checkUi(context, base) {
  const checks = [];
  for (const width of [1366, 1920]) {
    const page = await context.newPage();
    await page.setViewportSize({ width, height: width === 1366 ? 768 : 1080 });
    await page.goto(base + '/#/house/decor');
    for (const id of [80, 523]) {
      const row = catalog.find(row => row.entry_type === 1 && row.record_id === id);
      await page.locator('#dhSearch').fill(row.name);
      await page.waitForFunction(() => document.querySelectorAll('#page-decor .dh-card').length === 1);
      const card = page.locator('.dh-card[data-rid="' + id + '"]');
      await card.waitFor();
      const eye = card.locator('svg.dh-eye');
      await eye.waitFor();
      assert.equal(await eye.evaluate(el => getComputedStyle(el).transform), 'none');
      assert.ok(await eye.evaluate(el => {
        const shape = el.querySelector('use');
        const bounds = shape.getBBox();
        const centerY = node => { const r = node.getBoundingClientRect(); return r.top + r.height / 2; };
        return shape.getAttribute('href').endsWith('#metric-views') && bounds.width > bounds.height &&
          Math.abs(bounds.x + bounds.width / 2 - 12) < .01 && Math.abs(bounds.y + bounds.height / 2 - 12) < .01 &&
          Math.abs(centerY(el) - centerY(el.parentElement.querySelector('[data-count=views]'))) <= 1;
      }));
      if (id === 80) await card.screenshot({ path: path.join(evidence, 'card-' + width + '.png') });
      await card.click();
      await page.locator('.dh-model-preview [data-view=model]').click();
      await page.locator('.dh-model-preview[data-state=ready]').waitFor();
      const canvas = page.locator('.dh-model-canvas canvas');
      const before = await canvas.screenshot();
      const box = await canvas.boundingBox();
      await page.mouse.move(box.x + box.width * .43, box.y + box.height * .48);
      await page.mouse.down(); await page.mouse.move(box.x + box.width * .68, box.y + box.height * .55, { steps: 8 }); await page.mouse.up();
      assert.notDeepEqual(await canvas.screenshot(), before);
      await page.locator('.dh-model-preview [data-action=reset]').click();
      assert.deepEqual(await canvas.screenshot(), before);
      await page.locator('.dh-model-preview').screenshot({ path: path.join(evidence, id + '-' + width + '.png') });
      await page.locator('.dh-model-preview [data-view=image]').click();
      assert.equal(await canvas.count(), 0);
      await page.locator('.dh-modal-close').click();
      checks.push({ width, id, dragAndReset: true, eye: 'horizontal' });
    }
    await page.close();
  }
  return checks;
}

async function main() {
  fs.mkdirSync(evidence, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const context = await browser.newContext();
    const base = 'http://127.0.0.1:' + server.address().port;
    await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const ids = catalog.filter(r => r.entry_type === 1).map(r => r.record_id);
    if (!process.argv.includes('--ui')) {
      const page = await context.newPage();
      await page.goto(base + '/audit');
      const results = [];
      for (let i = 0; i < ids.length; i += 25) {
        results.push(...await renderBatch(page, ids.slice(i, i + 25)));
        if (i % 200 === 0) console.log('Rendered', results.length, 'failures', results.filter(r => r.error).length);
      }
      fs.writeFileSync(path.join(evidence, 'renders.json'), JSON.stringify({ browser: browser.version(), total: ids.length, results }) + '\n');
      assert.deepEqual(results.filter(r => r.error), []);
      await page.close();
    }
    if (!process.argv.includes('--renders')) {
      const checks = await checkUi(context, base);
      fs.writeFileSync(path.join(evidence, 'interaction.json'), JSON.stringify({browser:browser.version(),checks}, null, 2) + '\n');
    }
  } finally { await browser?.close(); server.closeAllConnections(); server.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
