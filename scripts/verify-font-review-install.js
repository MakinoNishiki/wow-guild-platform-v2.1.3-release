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
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await context.route('http://127.0.0.1:57983/**', route => {
      const asset = path.join(folder, path.basename(new URL(route.request().url()).pathname));
      return fs.existsSync(asset) ? route.fulfill({path:asset}) : route.fulfill({status:404, body:''});
    });
    await page.addInitScript(() => {
      window.pickerCalls = 0;
      window.showDirectoryPicker = async () => {
        ++window.pickerCalls;
        return (await navigator.storage.getDirectory()).getDirectoryHandle('World of Warcraft',{create:true});
      };
      window.gameRoot = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('World of Warcraft',{create:true});
      window.retailFixture = async () => (await gameRoot()).getDirectoryHandle('_retail_', {create:true});
      window.filesFixture = async () => (await window.retailFixture()).getDirectoryHandle('Fonts', {create:true});
      window.writeFixture = async (name, bytes) => {
        const handle = await (await window.filesFixture()).getFileHandle(name, {create:true});
        const writer = await handle.createWritable(); await writer.write(bytes); await writer.close();
      };
    });
    await page.goto(url);
    await page.evaluate(async () => {
      const root=await gameRoot();
      for(const name of ['_forever_','_classic_','_classic_era_','_classic_titan_'])await root.getDirectoryHandle(name,{create:true});
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
    await page.locator('[data-edition="_forever_"]:enabled').waitFor();
    assert.equal(await page.locator('#editionInfo [data-needs-root]').count(),5);
    assert.equal(await current.getByText('待读取',{exact:true}).count(), 5);
    await importLocal();
    await apply.click(); await page.locator('#cancelInstall').click();
    const editions=await page.locator('#editionInfo').innerText();
    for(const label of ['正式服','无限服','怀旧服','经典旧世','泰坦重铸'])assert.ok(editions.includes(label));
    const versionButton = version => page.locator('#editionInfo [data-edition="'+version+'"]');
    async function selectVersion(version) {
      await versionButton(version).click();
      await page.locator('#editionInfo [data-edition="'+version+'"][aria-pressed=true]:enabled').waitFor();
      assert.ok((await page.locator('#dirStatus').innerText()).includes(version));
    }
    const refreshFill=await page.locator('#rescanGame').evaluate(b=>getComputedStyle(b).backgroundColor);
    assert.notEqual(refreshFill,await page.locator('#pickGame').evaluate(b=>getComputedStyle(b).backgroundColor));
    await page.locator('#rescanGame').click();
    for (const version of ['_forever_','_classic_','_classic_era_','_classic_titan_']) {
      await selectVersion(version);
      assert.equal(await current.getByText('游戏默认',{exact:true}).count(),5);
      await apply.click();
      assert.ok((await page.locator('#actionTarget').innerText()).includes(version+'/Fonts/ARKai_T.TTF'));
      await confirm.click(); await waitFor('已应用「试装」');
      assert.equal(await page.evaluate(async key=>{
        const dir=await (await (await gameRoot()).getDirectoryHandle(key)).getDirectoryHandle('Fonts');
        const file=await (await dir.getFileHandle('ARKai_T.TTF')).getFile();
        const bytes=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
        return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
      },version),expected);
      assert.equal(await readText('ARKai_T.TTF'),'original-file');
    }
    assert.equal(await page.evaluate(()=>pickerCalls),1);
    await page.reload();
    await waitFor('管家上次应用');
    assert.equal(await versionButton('_classic_titan_').getAttribute('aria-pressed'),'true');
    for (const version of ['_classic_era_','_classic_','_forever_','_classic_titan_']) {
      await selectVersion(version);
      assert.equal(await remove.isEnabled(),true);
      if (process.env.WB_FONT_EDITION_SCREENSHOT && version==='_forever_') {
        await page.locator('.current-panel').screenshot({path:process.env.WB_FONT_EDITION_SCREENSHOT});
      }
      await act(remove,'已删除已应用字体');
      assert.equal(await current.getByText('游戏默认',{exact:true}).count(),5);
    }
    assert.equal(await page.evaluate(()=>pickerCalls),0);
    await selectVersion('_retail_');
    await importLocal();
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
    // Old records retained the child, even when the picker had listed its siblings.
    await page.evaluate(async()=>{
      await currentFonts.storeTarget('put',{handle:await retailFixture(),direct:false,
        path:'World of Warcraft/_retail_/Fonts',editions:['_retail_','_classic_','_forever_']});
    });
    await page.reload(); await page.locator('#rescanGame:enabled').waitFor();
    assert.equal(await page.locator('#editionInfo [data-needs-root]').count(),4);
    assert.equal(await versionButton('_retail_').getAttribute('aria-pressed'),'true');
    await page.evaluate(()=>{
      window.openRootForTest=window.showDirectoryPicker;
      window.showDirectoryPicker=()=>Promise.reject(new DOMException('取消','AbortError'));
    });
    await versionButton('_forever_').click();
    await page.getByText(/已取消切换/).waitFor();
    await page.evaluate(()=>{window.showDirectoryPicker=retailFixture;});
    await versionButton('_forever_').click();
    await page.getByText(/选中的是子目录/).waitFor();
    assert.equal(await versionButton('_retail_').getAttribute('aria-pressed'),'true');
    await page.evaluate(()=>{window.showDirectoryPicker=window.openRootForTest;});
    await selectVersion('_forever_');
    assert.equal(await page.locator('#editionInfo [data-needs-root]').count(),0);
    assert.equal(await page.evaluate(()=>pickerCalls),1);
    // An installation without retail, and an individually chosen child, both work.
    await page.evaluate(async()=>{
      const root=await (await navigator.storage.getDirectory()).getDirectoryHandle('怀旧专用',{create:true});
      await root.getDirectoryHandle('_classic_',{create:true});
      window.showDirectoryPicker=async()=>root;
    });
    await page.locator('#pickGame').click();
    await page.waitForFunction(()=>document.querySelector('#dirStatus').textContent.includes('怀旧专用/_classic_/Fonts'));
    assert.equal(await page.locator('#editionInfo button').count(),1);
    await page.locator('#rescanGame:enabled').waitFor();
    await page.evaluate(async()=>{
      const root=(await currentFonts.storeTarget('get')).rootHandle;
      await root.getDirectoryHandle('_ptr_',{create:true});
      await root.removeEntry('_classic_');
    });
    await page.reload();
    await page.getByText(/无法打开 .*怀旧专用/).waitFor();
    assert.equal(await page.locator('#deleteFont').isEnabled(),false);
    await page.evaluate(()=>{window.showDirectoryPicker=async()=>(await navigator.storage.getDirectory()).getDirectoryHandle('怀旧专用');});
    await page.locator('#pickGame').click();
    await page.waitForFunction(()=>document.getElementById('dirStatus').textContent.includes('仅检测到测试服'));
    assert.equal(await page.locator('#editionInfo [data-needs-root]').count(),5);
    await versionButton('_forever_').click();
    await page.getByText(/所选目录中未找到无限服/).waitFor();
    assert.equal(await page.locator('#editionInfo [aria-pressed=true]').count(),0);
    await page.evaluate(()=>{window.showDirectoryPicker=async()=>(await gameRoot()).getDirectoryHandle('_forever_');});
    await page.locator('#pickGame').click();
    await page.locator('[data-edition="_forever_"][aria-pressed=true]:enabled').waitFor();
    assert.equal(await page.locator('#editionInfo [data-needs-root]').count(),4);
    await page.evaluate(()=>{window.showDirectoryPicker=gameRoot;});
    await page.locator('#pickGame').click();
    await selectVersion('_retail_');
    await page.close();
    // Same browser profile and stored directory. The permission prompt is controlled in this test.
    await context.addInitScript(()=>{
      window.readGrant='prompt';
      window.allowRead=false;
      window.pickerCalls=0;
      window.showDirectoryPicker=()=>{++window.pickerCalls;throw new Error('Unexpected folder picker');};
      FileSystemHandle.prototype.queryPermission=async()=>window.readGrant;
      FileSystemHandle.prototype.requestPermission=async({mode})=>{
        if(mode!=='read') throw new Error('Unexpected write permission request');
        return window.readGrant=window.allowRead?'granted':'denied';
      };
    });
    const reopened = await context.newPage();
    reopened.on('pageerror',e=>errors.push(e.message));
    await reopened.goto(url);
    const resume = reopened.getByRole('button',{name:'继续使用此目录'});
    await resume.waitFor();
    assert.equal(await resume.evaluate(b=>getComputedStyle(b).backgroundColor),refreshFill);
    await resume.click();
    await reopened.getByText(/浏览器尚未允许读取/).waitFor();
    assert.equal(await reopened.locator('#currentSlots').isVisible(),false);
    await reopened.evaluate(()=>{window.allowRead=true;});
    await resume.click();
    await reopened.locator('#currentSlots [data-slot="ARIALN.TTF"]').getByText('游戏默认').waitFor();
    assert.equal(await reopened.evaluate(()=>pickerCalls),0);
    await reopened.getByRole('button',{name:'怀旧服',exact:true}).click();
    await reopened.waitForFunction(()=>document.querySelector('[data-edition="_classic_"][aria-pressed=true]:enabled'));
    assert.equal(await reopened.evaluate(()=>pickerCalls),0);
    await reopened.reload();
    await resume.waitFor();
    await reopened.evaluate(()=>{window.allowRead=true;});
    await reopened.locator('#applyFont').click();
    await reopened.locator('#installConfirm[open]').waitFor();
    assert.equal(await reopened.evaluate(()=>pickerCalls),0);
    await reopened.locator('#cancelInstall').click();
    await reopened.locator('#forgetGame').click();
    await reopened.waitForFunction(async()=>!(await currentFonts.storeTarget('get')));
    await reopened.reload();
    await reopened.locator('#pickGame:enabled').waitFor();
    assert.equal(await resume.isVisible(),false);
    assert.deepEqual(errors, []);
    console.log('PASS: five editions, scoped files and restores, persisted switch without picker, legacy and non-retail directories, approval, two slots, source and file checks.');
  } finally {
    await browser.close();
    fs.unlinkSync(sample); fs.rmdirSync(fixture);
  }
}
run().catch(e => { console.error(e); process.exitCode = 1; });
