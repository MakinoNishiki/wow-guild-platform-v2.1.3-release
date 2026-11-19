// Run via scripts/verify-req203-web.cjs --decor-engagement to reuse its disposable database and authenticated browsers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
module.exports = async ({ db, author, guest, other, base, output }) => {
  const checks = [];
  let counts;
  async function detail(page) {
    if (page.url() === base + '/#/house/decor') await page.reload();
    else await page.goto(base + '/#/house/decor');
    await page.locator('#dhSearch').fill('卷起来的卷轴');
    await page.locator('.dh-card[data-rid="126"]').click();
    await page.locator('.dh-engagement button[aria-pressed]').waitFor();
    return page.locator('.dh-engagement');
  }
  async function totals() {
    return (await db.query('select likes::integer,views::integer from decor_item_totals where record_id=126')).rows[0];
  }
  for (const role of ['anon','authenticated']) {
    const { rows } = await db.query("select has_table_privilege($1,'decor_item_likes','select') or has_table_privilege($1,'decor_item_views','select') or has_function_privilege($1,'record_decor_item_view(integer,text)','execute') as readable", [role]);
    assert.equal(rows[0].readable,false);
  }
  checks.push('账号和游客只能通过网站读取汇总数字，数据库行及写函数未向其开放');
  let strip = await detail(guest);
  assert.deepEqual(await totals(), { likes:0, views:1 });
  await detail(guest);
  assert.deepEqual(await totals(), { likes:0, views:1 });
  await db.query("update decor_item_views set last_counted_at=now()-interval '30 minutes 1 second'");
  await detail(guest);
  assert.deepEqual(await totals(), { likes:0, views:2 });
  checks.push('同一访客打开、刷新、超过30分钟后再打开，浏览数分别为1、1、2');
  await strip.getByRole('button').click();
  await guest.locator('#authOverlay').waitFor();
  strip = await detail(author);
  assert.deepEqual(await totals(), { likes:0, views:3 });
  await strip.getByRole('button').click();
  await strip.locator('button[aria-pressed=true]').waitFor();
  assert.deepEqual(await totals(), { likes:1, views:3 });
  strip = await detail(author);
  assert.equal(await strip.locator('button').getAttribute('aria-pressed'),'true');
  assert.deepEqual(await totals(), { likes:1, views:3 });
  const otherStrip = await detail(other);
  assert.equal(await otherStrip.locator('button').getAttribute('aria-pressed'),'false');
  await strip.getByRole('button').click();
  await strip.locator('button[aria-pressed=false]').waitFor();
  assert.deepEqual(await totals(), { likes:0, views:4 });
  checks.push('游客点赞打开登录，登录账号可点赞、刷新保留状态、撤销；另一个账号看到总量和自己的状态');
  const repeats = await Promise.all(Array.from({length:5}, () =>
    guest.request.post(base + '/api/decor-engagement/view', {data:{id:2105}})));
  assert.ok(repeats.every(response => response.status() === 200));
  counts = (await db.query('select sum(total)::int as n from decor_item_views where record_id=2105')).rows[0].n;
  assert.equal(counts,1);
  const data = await (await fetch(base + '/api/decor-engagement/summary')).json();
  assert.equal(data.rows.find(row => row.record_id===126).views,4);
  assert.deepEqual(Object.keys(data.rows[0]).sort(),['favorites','likes','record_id','views']);
  checks.push('重复浏览写入合并；公开列表每项只含家具编号、点赞数、收藏人数和浏览数');
  await author.locator('.dh-modal-close').click();
  await author.locator('#dhSearch').fill('');
  await author.locator('#dhSort').selectOption('views');
  assert.equal(await author.locator('.dh-card').first().getAttribute('data-rid'),'126');
  await author.locator('#dhSearch').fill('银月城大型平台');
  await author.locator('.dh-card[data-rid="2105"]').click();
  const details = author.locator('.dh-modal-overlay.show');
  assert.match(await details.innerText(), /11\.2\.7/);
  assert.match(await details.innerText(), /64632/);
  await details.locator('.dh-copy-game-preview').click();
  assert.match(await author.evaluate(()=>navigator.clipboard.readText()), /PreviewHousingItem\(246250\)/);
  await author.locator('.dh-modal-close').click();
  await author.locator('#dhResetFilters').click();
  await author.locator('.dh-advanced summary').click();
  const ability = author.locator('#dhAbilityChips');
  await ability.getByRole('button',{name:/^可烹饪/}).click();
  assert.equal(await author.locator('.dh-card').count(),2);
  assert.ok(await author.locator('.dh-card[data-rid="9472"]').count());
  await ability.getByRole('button',{name:/^全部/}).click();
  await ability.getByRole('button',{name:/^可互动/}).click();
  assert.equal(await author.locator('.dh-card').count(),2);
  await ability.getByRole('button',{name:/^全部/}).click();
  await ability.getByRole('button',{name:/^有特效/}).click();
  assert.match(await author.locator('#dhCount').innerText(),/513/);
  await ability.getByRole('button',{name:/^全部/}).click();
  await author.locator('#dhFeatChips').getByRole('button',{name:/^可看 3D/}).click();
  assert.equal(await author.locator('.dh-card').count(),26);
  checks.push('实际目录按功能检索命中 2 件烹饪、2 件互动、513 件含特效；可看 3D 命中 26 件');
  await author.locator('.dh-card[data-rid="27684"]').click();
  await details.locator('[data-view="model"]').click();
  await details.locator('.dh-model-preview[data-state="ready"] canvas').waitFor();
  await details.locator('[data-action="right"]').click();
  await details.locator('[data-action="reset"]').click();
  await details.locator('.dh-modal').evaluate(dialog => { dialog.scrollTop = 0; });
  await author.screenshot({path:path.join(output,'integrated-model-1920.png')});
  checks.push('真实2,335条目录联验：隔离浏览量排序、银月城大型平台版本/构建及剪贴板、堕罪堡餐桌的3D旋转与复位');
  fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'engagement-check.json'),JSON.stringify({database:'PostgreSQL/PostgREST 隔离库',browser:author.context().browser().version(),checks},null,2));
  console.log('PASS', checks.join(' / '));
};
