'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');

async function verify() {
  const browser = await chromium.launch({channel:'chrome'});
  const snapshotDir = process.env.WB_VERIFY_OUTPUT;
  try {
    const page = await browser.newPage({viewport:{width:1366,height:900},reducedMotion:'reduce'});
    const errors = [];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('requestfailed',request=>errors.push(request.url()));
    const url = pathToFileURL(path.resolve(__dirname,'../design-plans/req212-guild-profile/index.html')).href;
    const at = id=>page.locator('#'+id);
    const select = (id,value)=>at(id).selectOption(value);
    const name = value=>page.getByLabel(value,{exact:true});
    const changeView = async read=>{
      await at(read?'publicView':'editView').click();
      await at(read?'reader':'editor').waitFor({state:'visible'});
    };
    async function layout(width) {
      await page.setViewportSize({width,height:900});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),'page overflows at '+width);
      const panels = page.locator('#sheet .panel:visible');
      for (const panel of await panels.all()) {
        assert.ok(await panel.evaluate(node=>node.scrollWidth <= node.clientWidth+1),'panel overflows at '+width);
      }
      if (width>=750 && await at('reader').isVisible()) {
        const a = await at('readNeeds').boundingBox(), b = await at('readSchedule').boundingBox();
        assert.ok(b.x>=a.x+a.width,'recruiting and schedule should sit side by side');
      }
    }
    async function capture(file) {
      if (!snapshotDir) return;
      fs.mkdirSync(snapshotDir,{recursive:true});
      await page.mouse.move(1,1);
      await page.screenshot({path:path.join(snapshotDir,file),fullPage:true});
    }
    await page.goto(url);
    // Check the visible artwork in both the open menu and the collapsed control.
    async function chooseSpec(row,cls,spec) {
      await row.locator('[data-field=class]').selectOption(cls);
      await row.locator('[data-field=spec]').selectOption(spec);
    }
    const rows = page.locator('.picker-row');
    const firstRole = rows.first().locator('[data-field=role]');
    const firstClass = rows.first().locator('[data-field=class]');
    await firstClass.click();
    assert.equal(await firstClass.evaluate(node=>node.matches(':open')),true);
    const paladinOption = firstClass.getByRole('option',{name:'圣骑士',exact:true});
    assert.equal(await paladinOption.locator('img').isVisible(),true);
    await paladinOption.click();
    assert.match(await firstClass.locator('selectedcontent img').getAttribute('src'),/classes\/paladin\.png$/);
    await changeView(true);
    assert.match(await at('readNeeds').innerText(),/圣骑士 · 专精待确认/);
    assert.match(await at('readNeeds').locator('.recruit-portrait').getAttribute('src'),/classes\/paladin\.png$/);
    await changeView(false);
    await chooseSpec(rows.first(),'圣骑士','神圣');
    await firstRole.click();
    const colors = await firstRole.locator('option:not([value=""]) .choice-visual').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).color));
    assert.equal(new Set(colors).size,3);
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'添加招募需求'}).click();
    await chooseSpec(rows.nth(1),'圣骑士','防护');
    await page.getByRole('button',{name:'添加招募需求'}).click();
    await chooseSpec(rows.nth(2),'唤魔师','增辉');
    const tool = at('tool');
    await tool.click();
    assert.equal(await tool.evaluate(node=>node.matches(':open')),true);
    const productOptions = tool.locator('option:not([value="其他"])');
    assert.equal(await productOptions.locator('img').count(),7);
    await productOptions.locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
    const qq = tool.getByRole('option',{name:'QQ',exact:true});
    assert.equal(await qq.locator('img').getAttribute('src'),'voice-brands/qq.png');
    assert.equal(await tool.getByRole('option',{name:'QQ 频道',exact:true}).locator('img').getAttribute('src'),'voice-brands/qq-channel.png');
    if (snapshotDir) {
      fs.mkdirSync(snapshotDir,{recursive:true});
      await page.screenshot({path:path.join(snapshotDir,'voice-menu.png')});
    }
    await qq.click();
    assert.equal(await tool.inputValue(),'QQ');
    assert.equal(await tool.locator('selectedcontent').innerText(),'QQ');
    const logo = await tool.locator('selectedcontent img').getAttribute('src');
    assert.match(await at('progressSeason').locator('option:checked').innerText(),/12\.1.*S2/);
    assert.match(await at('progressSeason').locator('[value=S1]').innerText(),/12\.0.*S1/);
    assert.match(await at('progressSeason').locator('option:disabled').innerText(),/12\.2.*待收录/);
    await page.getByRole('checkbox',{name:'盘魂者内克扎莉'}).check();
    await changeView(true);
    const portraits = await at('readNeeds').locator('.recruit-portrait').evaluateAll(imgs=>imgs.map(img=>img.getAttribute('src').split('/').at(-1)));
    assert.deepEqual(portraits,['paladin_holy.png','paladin_protection.png','evoker_augmentation.png']);
    assert.equal(await at('readContact').locator('.choice-visual img').getAttribute('src'),logo);
    assert.equal(await at('readContact').locator('.voice-value .choice-visual').innerText(),'QQ');
    assert.match(await at('readProgress').innerText(),/12\.1 · S2 · 烈毒之渊/);
    await layout(755);
    await capture('recruit-art-755.png');
    await page.goto(url);
    await page.reload();
    await layout(1366);
    assert.equal(await at('progressSeason').inputValue(),'S2');
    assert.equal(await at('progressRaid').inputValue(),'烈毒之渊');
    assert.equal(await page.locator('.boss-choice').count(),8);
    assert.match(await page.locator('.progress-tally').innerText(),/尚未填写/);
    await page.getByRole('button',{name:'确认零击杀'}).click();
    await changeView(true);
    assert.match(await at('readProgress').innerText(),/0 \/ 8/);
    await changeView(false);
    await page.getByRole('button',{name:'清除此项进度'}).click();
    await changeView(true);
    assert.equal(await at('readProgressPanel').isVisible(),false);
    await changeView(false);
    await page.getByRole('checkbox',{name:'盘魂者内克扎莉'}).check();
    await select('progressDifficulty','英雄');
    assert.match(await page.locator('.progress-tally').innerText(),/尚未填写/);
    await select('progressSeason','S1');
    assert.ok(!(await at('progressRaid').innerText()).includes('烈毒之渊'));
    await select('progressSeason','S2');
    await select('progressRaid','潮缚石窟');
    assert.equal(await page.locator('.boss-choice').count(),1);
    await select('progressRaid','烈毒之渊');
    await select('progressDifficulty','史诗');
    assert.match(await page.locator('.progress-tally').innerText(),/1 \/ 8/);

    const first = page.locator('.picker-row').first();
    assert.equal(await first.locator('[data-field=role] option:checked').innerText(),'自动 · 输出');
    await page.getByRole('button',{name:'添加招募需求'}).click();
    const second = page.locator('.picker-row').nth(1);
    await second.locator('[data-field=role]').selectOption('治疗');
    const classes = await second.locator('[data-field=class]').innerText();
    assert.ok(classes.includes('武僧') && !classes.includes('猎人'));
    await second.locator('[data-field=class]').selectOption('武僧');
    assert.ok(!(await second.locator('[data-field=spec]').innerText()).includes('踏风'));
    await second.locator('[data-field=spec]').selectOption('织雾');
    await second.locator('[data-field=priority]').selectOption('中');

    await name('周五结束').fill('00:30');
    await name('QQ').check();
    await name('QQ 号').fill('私下联络的示例');
    await name('微信').check();
    await name('微信号').fill('演示联络人');
    await name('在招募卡公开微信').check();
    await select('tool','其他');
    await at('toolText').fill('示例语音');
    await changeView(true);
    assert.match(await at('readContact').innerText(),/示例语音/);
    assert.equal(await at('readContact').locator('.voice-value img').count(),0);
    await changeView(false);
    await select('voice','否');
    assert.equal(await at('tool').isVisible(),false);
    await name('安装 DBM').check();
    await page.locator('#ruleChoices').getByText('其他约定').click();
    await at('rules').fill('开荒前一起复盘战术。');
    await select('loot','自定义');
    await at('lootNote').fill('按本团约定分配。');
    const intro = page.getByRole('textbox',{name:'公会介绍',exact:true});
    await intro.fill('我们的开荒团');
    await intro.press('Control+a');
    await name('段落样式').selectOption('h3');
    await intro.press('End');
    await intro.press('Enter');
    await name('段落样式').selectOption('p');
    await page.keyboard.insertText('欢迎一起研究战术、长期出勤的伙伴。');
    await changeView(true);
    const card = await at('sheet').innerText();
    for (const value of ['德鲁伊 · 平衡','武僧 · 织雾','次日00:30','史诗 1 / 8','开荒前一起复盘战术','按本团约定分配','无需语音','演示联络人']) assert.ok(card.includes(value),value);
    assert.ok(!card.includes('私下联络的示例') && !card.includes('示例语音'));
    assert.equal(await at('readIntro').locator('h3').innerText(),'我们的开荒团');
    assert.match(await at('readIntro').innerText(),/欢迎一起研究战术/);
    await layout(1366);
    await capture('recruit-card-1366.png');
    await layout(755);
    await capture('recruit-card-755.png');
    await layout(390);
    await changeView(false);
    await layout(755);
    await capture('fields-editor-755.png');

    await select('edition','怀旧服');
    await select('branch','经典怀旧服');
    assert.ok((await at('progressPicker').innerText()).includes('尚未收录'));
    assert.equal(await at('progressSeason').count(),0);
    await select('mode','大秘境');
    await select('score','2500–3000');
    await changeView(true);
    assert.match(await at('guildMeta').innerText(),/经典怀旧服/);
    assert.match(await at('readNeeds').innerText(),/2500–3000/);
    assert.ok(!(await at('readNeeds').innerText()).includes('织雾'));
    await changeView(false);
    await select('edition','正式服');
    await select('mode','PvP');
    await select('bracket','3v3');
    await changeView(true);
    assert.match(await at('readNeeds').innerText(),/3v3/);
    assert.ok(!(await at('readNeeds').innerText()).includes('2500–3000'));
    await changeView(false);
    await select('mode','团队副本');
    assert.equal(await page.locator('.picker-row').count(),2);
    await page.getByRole('button',{name:'移除需求'}).last().click();
    assert.equal(await page.locator('.picker-row').count(),1);
    await page.goto(url+'#preview');
    await page.reload();
    assert.equal(await at('reader').isVisible(),true);
    assert.equal(await at('readProgressPanel').isVisible(),false);
    assert.ok(!(await at('sheet').innerText()).includes('演示联络人'));
    assert.deepEqual(errors,[]);
    console.log('PASS 语音标志、职业色与专精图、职责色、补丁与赛季、招募缺口联动、排班与联系方式、富文本预览、团本进度和三档宽度排版');
  } finally { await browser.close(); }
}
verify().catch(error=>{ console.error(error); process.exitCode=1; });
