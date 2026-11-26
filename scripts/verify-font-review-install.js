// Chrome uses its own isolated file system. Run with an existing TTF/OTF path.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {chromium} = require('playwright');
const folder = path.resolve(__dirname, '../font-manager');
const url = 'http://127.0.0.1:57983/font-manager/index.html';

async function run() {
  const source = process.argv[2] || path.join(process.env.WINDIR || 'C:/Windows', 'Fonts', 'arial.ttf');
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-font-review-'));
  const sample = path.join(fixture, '试装' + path.extname(source));
  fs.copyFileSync(source, sample);
  const expected = crypto.createHash('sha256').update(fs.readFileSync(sample)).digest('hex');
  const browser = await chromium.launch({channel:'chrome'});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('http://127.0.0.1:57983/**', route => {
      const asset = path.join(folder, path.basename(new URL(route.request().url()).pathname));
      return fs.existsSync(asset) ? route.fulfill({path:asset}) : route.fulfill({status:404, body:''});
    });
    await page.addInitScript(() => {
      window.showDirectoryPicker = () => navigator.storage.getDirectory();
      window.retailFixture = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('_retail_', {create:true});
      window.filesFixture = async () => (await window.retailFixture()).getDirectoryHandle('Fonts', {create:true});
      window.writeFixture = async (name, bytes) => {
        const handle = await (await window.filesFixture()).getFileHandle(name, {create:true});
        const writer = await handle.createWritable(); await writer.write(bytes); await writer.close();
      };
    });
    await page.goto(url);
    await page.evaluate(async () => {
      await writeFixture('ARKai_T.TTF', 'original-file');
      await writeFixture('untouched.ttf', 'keep');
    });
    const apply = page.locator('#applyFont'), remove = page.locator('#deleteFont'), confirm = page.locator('#confirmInstall');
    const current = page.locator('#currentSlots');
    const chat = current.locator('[data-slot="ARKai_T.TTF"]');
    const status = page.locator('#installStatus');
    const waitFor = text => page.waitForFunction(t => document.getElementById('installStatus').textContent.includes(t), text);
    const readText = name => page.evaluate(async n => (await (await (await filesFixture()).getFileHandle(n)).getFile()).text(), name);
    const exists = name => page.evaluate(async n => {
      try { await (await filesFixture()).getFileHandle(n); return true; }
      catch (e) { if (e.name === 'NotFoundError') return false; throw e; }
    }, name);
    const digest = name => page.evaluate(async n => {
      const file = await (await (await filesFixture()).getFileHandle(n)).getFile();
      const bytes = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');
    }, name);
    async function importLocal() {
      const picker = page.waitForEvent('filechooser');
      await page.locator('#pickFonts').click(); await (await picker).setFiles(fixture);
      await page.waitForSelector('.framed canvas');
    }
    async function act(button, done) {
      await button.click(); await confirm.click(); await waitFor(done);
    }
    assert.equal(await remove.isDisabled(), true);
    assert.equal(await current.getByText('待读取',{exact:true}).count(), 5);
    await importLocal();
    await apply.click(); await page.locator('#cancelInstall').click();
    assert.equal(await current.getByText('游戏默认',{exact:true}).count(),4);
    assert.match(await chat.innerText(),/无法识别/);
    assert.equal(await readText('ARKai_T.TTF'), 'original-file');
    assert.equal(await exists('ARKai_C.TTF'), false);
    await act(apply, '已应用「试装」');
    assert.equal(await chat.locator('.current-sample').count(),1);
    assert.ok((await chat.locator('dd').first().innerText()).length>0);
    assert.equal(await digest('ARKai_T.TTF'), expected);
    await act(apply, '已应用「试装」');
    await page.locator('#installSlot').selectOption('ARKai_C.TTF');
    await act(apply, '已应用「试装」');
    assert.equal(await digest('ARKai_C.TTF'), expected);
    await page.locator('#forgetFont').click();
    assert.equal(await digest('ARKai_C.TTF'), expected);
    await page.reload(); await waitFor('管家上次应用');
    await chat.locator('.current-sample').waitFor();
    await remove.click(); await page.locator('#cancelInstall').click();
    assert.equal(await digest('ARKai_T.TTF'), expected);
    await act(remove, '已删除已应用字体');
    assert.equal(await readText('ARKai_T.TTF'), 'original-file');
    assert.match(await chat.innerText(),/无法识别/);
    assert.equal(await remove.isDisabled(), true);
    await page.locator('#installSlot').selectOption('ARKai_C.TTF');
    await waitFor('管家上次应用');
    await page.evaluate(() => writeFixture('ARKai_C.TTF', 'external-change'));
    await act(remove, '已在其他地方改动');
    assert.equal(await readText('ARKai_C.TTF'), 'external-change');
    const picker = page.waitForEvent('filechooser'); await page.locator('#pickFonts').click();
    await (await picker).setFiles(fixture); await page.waitForSelector('.framed canvas');
    await page.evaluate(() => writeFixture('ARKai_C.TTF', selected.file));
    await act(remove, '已删除已应用字体');
    assert.equal(await exists('ARKai_C.TTF'), false);
    assert.match(await current.locator('[data-slot="ARKai_C.TTF"]').innerText(),/游戏默认/);
    assert.equal(await readText('untouched.ttf'), 'keep');
    await page.locator('[data-type="简中"]').click();
    await page.route('https://raw.githubusercontent.com/**', r => r.fulfill({body:'different file', headers:{'Access-Control-Allow-Origin':'*'}}));
    await act(apply, '文件与本页预览');
    assert.equal(await page.locator('#sourceFallback').isVisible(), true);
    assert.equal(await exists('ARKai_C.TTF'), false);
    await page.evaluate(() => { FileSystemHandle.prototype.requestPermission = async () => 'denied'; });
    await act(apply, '未获得写入权限'); assert.equal(await exists('ARKai_C.TTF'), false);
    await page.addInitScript(()=>{FileSystemHandle.prototype.queryPermission=async()=>'prompt';});
    await page.reload(); await page.locator('#resumeGame').waitFor();
    assert.equal(await current.getByText('待授权读取',{exact:true}).count(),5);
    await page.locator('#forgetGame').click();await page.waitForFunction(async()=>!(await currentFonts.storeTarget('get')));
    await page.reload();assert.equal(await current.getByText('待读取',{exact:true}).count(),5);
    assert.deepEqual(errors, []);
    assert.ok(await status.isVisible());
    console.log('PASS: cancel, apply, readback, repeat, two slots, remove local list, reload, restore, external change, delete new file, wrong source, permission denied.');
  } finally {
    await browser.close();
    fs.unlinkSync(sample); fs.rmdirSync(fixture);
  }
}
run().catch(e => { console.error(e); process.exitCode = 1; });
