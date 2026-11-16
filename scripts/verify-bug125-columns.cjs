module.exports=async(page,sample,records,check,out)=>{
 const row=page.locator('[data-loot-detail="'+records[0].id+'"]').locator('xpath=ancestor::tr');
 const primary=row.locator('td').nth(7),secondary=row.locator('td').nth(8);
 await page.waitForFunction(()=>MasterData.isLoaded());
 await page.waitForFunction(id=>document.querySelector('[data-loot-detail="'+id+'"]')?.closest('tr').children[7].textContent.trim()!=='—',records[0].id);
 const primaryText=await primary.innerText();
 check('无需悬浮列表已显示图鉴主属性',sample.row.primary_stats.length>0&&sample.row.primary_stats.every(s=>primaryText.includes(s)));
 check('列表副属性与图鉴名称一致',JSON.stringify(await secondary.locator('.loot-stat-tag').allTextContents())===JSON.stringify(sample.row.secondary_stats));
 check('追溯显示原始拾取人及服务器',(await row.locator('.loot-pickup-person').innerText())==='拾取人：原始拾取人 · 罗宁');
 check('名称下不再重复团本和日期',!(await row.locator('td').first().innerText()).includes(sample.raid)&&!(await row.locator('td').first().innerText()).includes('2026-11'));
 for(const width of [1366,1920]){
  await page.setViewportSize({width,height:width===1366?768:1080});await row.scrollIntoViewIfNeeded();
  const layout=await row.locator('.loot-detail-trigger').evaluate(e=>{const i=e.querySelector('img').getBoundingClientRect(),n=e.querySelector('.loot-detail-name').getBoundingClientRect();return {w:i.width,h:i.height,font:parseFloat(getComputedStyle(e).fontSize),sameLine:Math.abs((i.y+i.height/2)-(n.y+n.height/2))<2&&n.x>=i.right};});
  check(width+'图标32像素名称14像素且同一行',layout.w===32&&layout.h===32&&layout.font===14&&layout.sameLine);
  await page.screenshot({path:out+'/columns-'+width+'.png',animations:'disabled'});
 }
 check('手动记录不伪造拾取人',await page.locator('[data-loot-detail="'+records[1].id+'"]').locator('xpath=ancestor::tr').locator('.loot-pickup-person').count()===0);
 check('历史来源缺拾取人明确显示未记录',(await page.locator('[data-loot-detail="'+records[2].id+'"]').locator('xpath=ancestor::tr').locator('.loot-pickup-person').innerText())==='拾取人：未记录');
 const unknown=page.locator('[data-loot-detail="'+records[2].id+'"]').locator('xpath=ancestor::tr');check('未知ID不按同名补属性',(await unknown.locator('td').nth(7).innerText())==='—'&&(await unknown.locator('td').nth(8).innerText())==='—');
 const cases=await page.evaluate(record=>{
  const read=LootDetails.attributeReader(),item=appData.loots.find(l=>l.id===record.id);
  return {saved:read({...item,primaryStat:'敏捷',secondaryStats:['全能']}),partial:read({...item,primaryStat:'敏捷',secondaryStats:[]}),empty:read({name:'未知',primaryStat:' ',secondaryStats:[]})};
 },records[0]);
 check('已有人工属性不覆盖',cases.saved.primary==='敏捷'&&JSON.stringify(cases.saved.secondary)==='["全能"]');
 check('按字段补缺不覆盖另一列',cases.partial.primary==='敏捷'&&JSON.stringify(cases.partial.secondary)===JSON.stringify(sample.row.secondary_stats));
 check('无资料返回空项不猜测',!cases.empty.primary&&cases.empty.secondary.length===0);
 await page.evaluate(()=>{window.__loadedOriginal=MasterData.isLoaded;window.__initOriginal=MasterData.init;MasterData.isLoaded=()=>false;MasterData.init=()=>new Promise(r=>window.__finishStatLoad=()=>{MasterData.isLoaded=window.__loadedOriginal;MasterData.init=window.__initOriginal;r();});renderCurrentPage();});
 check('字典加载中不伪造属性',(await primary.innerText())==='—');await page.evaluate(()=>window.__finishStatLoad());await page.waitForFunction(()=>document.querySelector('#lootTableBody td:nth-child(8)')?.textContent.trim()!=='—');check('字典加载完成自动补齐无需悬浮',(await primary.innerText()).includes(sample.row.primary_stats[0]));
};
