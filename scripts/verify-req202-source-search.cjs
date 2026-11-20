// Invoked by verify-req201-export.cjs --source-search against the same catalog and plan.
const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async function verifySourceSearch(page, requests, output, pass) {
  const search = page.getByRole('textbox', { name: '搜索家具名称或获取来源' });
  const cards = page.locator('#dhMain .dh-card');
  const catalogRequests = () => requests.filter(r => r.url.startsWith('/rest/v1/decor_catalog?')).length;
  const before = catalogRequests();
  for (const [query, record, label] of [
    ['卷轴', 126, '卷轴'], ['  另一商人 ', 20101, '另一商人'], ['另一个地区', 20101, '另一个地区'],
    ['完成另一任务', 20101, '完成另一任务'], ['测试成就', 20101, '测试成就'],
    ['要塞物资', 20102, '要塞物资'], ['测试丙', 20102, '测试丙'], ['<SCRIPT>', 20104, '<script>']
  ]) {
    await search.fill(query);
    const hit = cards.locator('mark').filter({hasText: label});
    assert.ok(await hit.count() > 0, query);
    assert.ok((await page.locator('.dh-card[data-rid="' + record + '"] mark').allTextContents()).includes(label));
    assert.equal(await cards.locator('script').count(), 0);
  }
  pass('家具名、多途径商人/地区、前置、成就、原文与币种、英文大小写和特殊字符按可见文字匹配');
  for (const term of ['|Hcurrency:824', '来源未知', '.*', '不存在的商人']) {
    await search.fill(term);
    assert.equal(await cards.count(), 0, term);
    assert.match(await page.locator('#dhCount').innerText(), /命中 0 件/);
  }
  await page.locator('#dhEmptyReset').click();
  await search.fill('另一商人');
  assert.equal(await cards.count(), 1);
  const source = cards.locator('.dh-src');
  assert.match(await source.getAttribute('title'), /另一商人.*测试地区.*12 金.*声望尊敬/);
  await cards.first().click();
  const routes = await page.locator('.dh-modal-overlay .dh-src-item').allTextContents();
  assert.ok(routes.some(line => line.startsWith('商人：另一商人')) && routes.includes('成就：测试成就'));
  await page.locator('.dh-modal-close').click();
  await page.locator('#dhSrcChips button').filter({hasText:'宝藏'}).click();
  assert.equal(await cards.count(), 0);
  await page.locator('#dhSrcChips button').filter({hasText:'全部'}).click();
  assert.equal(await cards.count(), 1);
  pass('空态重置、筛选交集、完整命中来源与点击详情查看其他途径');
  for (const width of [1366,1920]) {
    await page.setViewportSize({width, height:900});
    await page.screenshot({path:path.join(output, 'source-search-' + width + '.png')});
  }
  await search.press('Escape');
  assert.equal(await search.inputValue(), '');
  assert.ok(await search.evaluate(el => el === document.activeElement));
  await search.fill('另一商人');
  await page.locator('#dhSearchClear').click();
  assert.equal(await cards.count(), 5);
  assert.equal(await cards.locator('mark').count(), 0);
  assert.equal(catalogRequests(), before);
  pass('清除和 Esc 恢复原列表与焦点，切换关键词没有重新请求目录');
};
