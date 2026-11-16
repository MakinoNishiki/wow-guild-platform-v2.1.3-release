module.exports=async(page,records,check,out)=>{
 // Display stress fixtures only; never persist synthetic variants to a business record.
 await page.evaluate(id=>{
  window.__densityOriginal=appData.loots;
  const base=appData.loots.find(l=>l.id===id);
  appData.loots=[8,1,100].map((roll,i)=>({...base,id:'density-'+i,name:i===2?'深渊末日猎犬的追击护手与长名称边界验证':base.name,
   primaryStat:['力量 / 敏捷 / 智力','敏捷','智力'][i],secondaryStats:['暴击','精通','急速','全能'],
   distribution_method:'roll_rule',player_action:'need',roll_value:roll,boss:'盘魂者内克扎莉',assignedTo:'测试离队成员',date:'2026-11-16'}));
  lootRender();
 },records[0].id);
 const rows=page.locator('#lootTableBody tr');
 for(const width of [1366,1920]){
  await page.setViewportSize({width,height:width===1366?768:1080});
  const sizes=await page.locator('#lootViewAssign .table-container').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}));
  if(width===1920)check('1920全部15列表头及操作一屏容纳',sizes.scroll<=sizes.client+1);
  for(let i=0;i<3;i++){
   const roll=rows.nth(i).locator('td').nth(12);
   check(width+'点数'+[8,1,100][i]+'不折行',await roll.evaluate(e=>{const r=document.createRange();r.selectNodeContents(e);return r.getClientRects().length===1&&getComputedStyle(e).whiteSpace==='nowrap';}));
  }
  const actions=rows.first().locator('td').last();
  check(width+'编辑删除完整可见',await actions.evaluate(e=>{const c=e.closest('.table-container').getBoundingClientRect();return [...e.querySelectorAll('button')].every(b=>{const r=b.getBoundingClientRect();return r.left>=c.left&&r.right<=c.right;});}));
  await page.screenshot({path:out+'/density-'+width+'.png',animations:'disabled'});
 }
 const colors=await rows.first().evaluate(e=>({primary:[...e.querySelectorAll('.loot-primary-stats .dp-tag')].map(t=>getComputedStyle(t).color),secondary:[...e.querySelectorAll('.loot-stat-tag')].map(t=>({color:getComputedStyle(t).color,bg:getComputedStyle(t).backgroundColor}))}));
 check('力量敏捷智力复用图鉴红绿蓝',JSON.stringify(colors.primary)===JSON.stringify(['rgb(255, 107, 107)','rgb(64, 192, 87)','rgb(77, 171, 247)']));
 check('四种副属性统一亮绿及背景',colors.secondary.length===4&&colors.secondary.every(s=>s.color==='rgb(30, 255, 0)'&&s.bg==='rgba(30, 255, 0, 0.12)'));
 check('长名称仍可通过title读取完整',await rows.nth(2).locator('.loot-detail-name').getAttribute('title')==='深渊末日猎犬的追击护手与长名称边界验证');
 await page.setViewportSize({width:1366,height:768});
 await page.locator('#lootViewAssign .table-container').evaluate(e=>e.scrollLeft=e.scrollWidth);
 check('窄桌面横滚后操作保持可见',await rows.first().locator('td').last().evaluate(e=>{const r=e.getBoundingClientRect();return r.right<=innerWidth&&r.left>0;}));
 await page.evaluate(()=>{appData.loots=window.__densityOriginal;delete window.__densityOriginal;lootRender();document.querySelector('#lootViewAssign .table-container').scrollLeft=0;});
 const realRow=page.locator('[data-loot-detail="'+records[0].id+'"]').locator('xpath=ancestor::tr');
 await realRow.getByTitle('编辑',{exact:true}).click();await page.locator('#lootModal').waitFor({state:'visible'});
 check('固定操作列编辑点击打开正确记录',(await page.locator('#lootModalTitle').innerText())==='编辑装备');
 await page.locator('#lootModal').getByRole('button',{name:'取消',exact:true}).click();await page.locator('#lootModal').waitFor({state:'hidden'});
};
