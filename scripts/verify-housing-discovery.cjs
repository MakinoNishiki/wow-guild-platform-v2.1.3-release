const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const path = require('node:path');

module.exports = async ({author,guest,db,sessions,api,base,pass,output}) => {
  const a=randomUUID(), b=randomUUID(), old=randomUUID();
  for (const [id,title] of [[a,'远洋舰桥'],[b,'船长室'],[old,'旧码头']]) {
    const result=await api('save-v2',sessions[0],{id,title,description:'',blueprint_code:null,
      code_public:false,allow_copy:false,published:true,screenshots:[],revision:0,
      preset_tags:['海盗'],custom_tags:id===a?['远洋舰船']:[]});
    assert.equal(result.status,200,JSON.stringify(result.data));
  }
  await db.query("insert into housing_build_reactions(work_id,user_id,kind,created_at) values($1,$4,'favorite',now()),($1,$5,'like',now()),($2,$4,'like',now()),($3,$4,'favorite',now()-interval '8 days')",[a,b,old,sessions[0].user.id,sessions[1].user.id]);
  await guest.goto(base+'/#/house/community');
  await guest.locator('#hbBrowseMode').selectOption('hot');
  await guest.locator('#hbBrowseTag').fill('海盗');
  await guest.locator('#hbBrowseTag').press('Enter');
  const grid = guest.locator('#hbResults');
  await grid.getByText('第 1 名 · 近七日 2 次互动').waitFor();
  assert.deepEqual(await grid.locator('h3').allTextContents(),['远洋舰桥','船长室']);
  await grid.locator('a',{hasText:'远洋舰桥'}).click();
  await grid.getByRole('heading',{name:'远洋舰桥'}).waitFor();
  await guest.locator('#hbBack').click();
  await grid.getByText('第 1 名 · 近七日 2 次互动').waitFor();
  await guest.locator('#hbBrowseTag').fill('远洋舰船');
  await guest.locator('#hbBrowseTag').press('Enter');
  await guest.waitForFunction(()=>document.querySelectorAll('#hbResults h3').length===1);
  assert.equal(await grid.locator('h3').innerText(),'远洋舰桥');
  await guest.locator('#hbClearFilters').click();
  await grid.getByRole('heading',{name:'旧码头'}).waitFor();
  pass('预设风格与作者自定义标签均可找到作品；近七日榜实际排序，八天前互动退出榜单，详情返回保留筛选');
  await author.goto(base+'/#/house/community');
  await author.locator('#hbBrowseMode').selectOption('favorites');
  await author.locator('#hbBrowseTag').fill('海盗');
  await author.locator('#hbBrowseTag').press('Enter');
  await author.waitForFunction(()=>document.querySelectorAll('#hbResults h3').length===2);
  assert.deepEqual((await author.locator('#hbResults h3').allTextContents()).sort(),['旧码头','远洋舰桥'].sort());
  assert.equal((await api('discover?mode=favorites&actor='+sessions[0].user.id,null)).status,401);
  await db.query('update housing_builds set published=false where id=$1',[a]);
  const discover=await api('discover?mode=hot&tag='+encodeURIComponent('海盗'),null);
  assert.deepEqual(discover.data.rows.map(r=>r.id),[b]);
  assert.ok(!('blueprint_code' in discover.data.rows[0]));
  await author.locator('#hbBrowseMode').selectOption('hot');
  await author.locator('#hbResults').getByText('第 1 名 · 近七日 1 次互动').waitFor();
  await author.locator('#page-community > .card').screenshot({path:path.join(output,'discovery.png')});
  pass('我的作品收藏仅本人可查；撤回立即退出热门与公开列表，列表数据不含蓝图原码');
};
