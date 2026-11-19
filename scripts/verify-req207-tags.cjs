'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');

// Called by the disposable real web/DB harness with signed-in author and visitor pages.
module.exports = async function verifyTags({ author, guest, db, sessions, api, base, pass, output }) {
  const home = base + '/#/house/community';
  const title = '机械港口的夜色';
  const preset = ['机械', '海盗', '自然', '浪漫', '魔法', '可爱'];
  const custom = ['空中战舰', '甲板', '船长室'];
  const session = sessions[0];
  const tagLabels = card => card.locator('.hb-work-tags li').allTextContents();
  await author.goto(home);
  await author.locator('#hbCreate').click();
  const modal = author.locator('#housingBuildEditor');
  await modal.locator('#hbTitle').fill(title);
  await modal.locator('#hbPresetGroups summary', { hasText: '装修风格' }).click();
  for (const name of preset) await modal.getByRole('button', { name, exact: true }).click();
  await modal.getByRole('button', { name: '高雅', exact: true }).click();
  assert.match(await modal.locator('#hbTagMessage').innerText(), /6 个/);
  assert.equal(await modal.locator('[aria-pressed=true]').count(), 6);
  for (const name of [...custom, '超额']) {
    await modal.locator('#hbCustomInput').fill(name);
    await modal.locator('#hbCustomInput').press('Enter');
  }
  assert.match(await modal.locator('#hbTagMessage').innerText(), /3 个/);
  await modal.locator('#hbCustomInput').fill('');
  if (output) {
    await modal.locator('#hbTags').scrollIntoViewIfNeeded();
    await modal.locator('#hbTags').screenshot({ path: path.join(output, 'work-tags-editor.png') });
  }
  await modal.locator('#hbDraft').click();
  await modal.waitFor({ state: 'hidden' });
  const mine = author.locator('.hb-work').filter({ has: author.getByRole('heading', { name: title, exact: true }) });
  await mine.waitFor();
  assert.deepEqual(await tagLabels(mine), [...preset, ...custom]);
  const draft = (await api('mine?v=2', session)).data.rows.find(row => row.title === title);
  assert.deepEqual(draft.custom_tags, custom);
  assert.deepEqual(draft.preset_tags, preset);
  assert.equal((await api('gallery?v=2&id=' + draft.id)).status, 404);
  pass('预设 6 个和自定义 3 个可同时保存为私有草稿，超额分别提示，访客看不到草稿');

  await author.reload();
  await mine.getByRole('button', { name: '编辑作品' }).click();
  assert.equal(await modal.locator('#hbPresetCount').innerText(), '6 / 6');
  await modal.getByRole('button', { name: '移除标签 甲板' }).click();
  const cancel = author.waitForEvent('dialog').then(dialog => dialog.dismiss());
  await modal.getByRole('button', { name: '关闭', exact: true }).click();
  await cancel;
  assert.ok(await modal.isVisible());
  await modal.locator('#hbCustomInput').fill('港湾');
  await modal.locator('#hbPublish').click(); // uncommitted custom text is included in this save
  await modal.waitFor({ state: 'hidden' });
  const current = (await api('gallery?v=2&id=' + draft.id)).data.rows[0];
  const updated = [custom[0], custom[2], '港湾'];
  assert.deepEqual(current.custom_tags, updated);
  await guest.goto(home);
  await guest.reload();
  const link = guest.getByRole('link', { name: title, exact: true });
  await link.waitFor();
  assert.deepEqual(await tagLabels(guest.locator('.hb-work').filter({ has: link })), [...preset, ...updated]);
  await link.click();
  await guest.locator('.hb-detail .hb-work-tags').waitFor();
  assert.deepEqual(await tagLabels(guest.locator('.hb-detail')), [...preset, ...updated]);
  if (output) await guest.locator('.hb-detail .hb-work-tags').screenshot({ path: path.join(output, 'work-tags-guest.png') });
  await guest.reload();
  await guest.locator('.hb-detail .hb-work-tags').waitFor();
  assert.deepEqual(await tagLabels(guest.locator('.hb-detail')), [...preset, ...updated]);
  pass('作者重开草稿、仅修改标签后关闭有提示；公开列表与详情均能刷新回读九个标签');

  const read = async () => (await api('mine?v=2&id=' + draft.id, session)).data.rows[0];
  const row = await read();
  const payload = { id: row.id, title: row.title, description: row.description, revision: row.revision,
    blueprint_code: null, code_public: false, allow_copy: false, published: true, screenshots: [] };
  for (const invalid of [
    { preset_tags: [...preset, '高雅'], custom_tags: updated },
    { preset_tags: preset, custom_tags: [...updated, '第四个'] },
    { preset_tags: ['随意伪造的预设'], custom_tags: [] },
  ]) {
    assert.equal((await api('save-v2', session, { ...payload, ...invalid })).status, 400);
  }
  const change = { ...payload, preset_tags: ['机械'], custom_tags: [] };
  const first = await api('save-v2', session, change);
  assert.equal(first.data.revision, row.revision + 1);
  assert.deepEqual((await api('save-v2', session, change)).data, first.data);
  assert.equal((await api('save-v2', session, { ...change, preset_tags: ['可爱'] })).status, 409);
  const legacy = await api('save-v2', session, { ...payload, revision: first.data.revision, description: '兼容旧版修改' });
  assert.equal(legacy.status, 200);
  assert.deepEqual((await read()).preset_tags, ['机械']);
  assert.equal((await api('save-v2', session, { ...payload, revision: legacy.data.revision, preset_tags: [], custom_tags: [] })).status, 200);
  const cleared = await db.query('select preset_tags,custom_tags from housing_builds where id=$1', [row.id]);
  assert.deepEqual(cleared.rows, [{ preset_tags: [], custom_tags: [] }]);
  pass('服务器拒绝标签超限和未知预设；仅修改标签递增一次版本，重试幂等，冲突有提示；旧版写入保留标签，可清空两类');
};
