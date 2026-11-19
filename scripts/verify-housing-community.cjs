'use strict';
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
module.exports = async ({ author, guest, other, admin, db, sessions, api, base, pass, output }) => {
  async function call(action, user, data) {
    const response = await fetch(base + '/api/housing-community/' + action, {
      method: data ? 'POST' : 'GET', headers: { ...(user ? { Authorization: 'Bearer ' + user.access_token } : {}), ...(data ? { 'Content-Type': 'application/json' } : {}) },
      body: data ? JSON.stringify(data) : undefined
    });
    return { status: response.status, data: await response.json() };
  }
  const id = randomUUID(), imageId = randomUUID();
  const image = await author.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'); x.fillStyle = '#b19156'; x.fillRect(0,0,32,32); return c.toDataURL('image/jpeg').split(',')[1]; });
  const work = { id, revision: 0, title: '社区验收：林中书房', description: '测试互动与举报', blueprint_code: 'AgHCommunityTest1234', code_public: true, allow_copy: true, published: true,
    screenshots: [{ id: imageId, data: image }] };
  assert.equal((await api('save-v2', sessions[0], work)).status, 200);
  const route = base + '/#/house/community/' + id;
  await Promise.all([author.goto(route), guest.goto(route), other.goto(route), admin.goto(route)]);
  const root = page => page.locator('.hc-community');
  try { await root(guest).getByText('0 条留言', { exact: true }).waitFor(); }
  catch { throw new Error('社区初始界面: ' + await guest.locator('#hbResults').innerText() + '; API: ' + JSON.stringify(await call('thread?id=' + id))); }
  await root(guest).getByRole('button', { name: '点赞 · 0', exact: true }).click();
  assert.ok(await guest.locator('#authOverlay').isVisible()); await guest.reload();
  assert.equal((await call('react', null, { work_id: id, kind: 'like', active: true })).status, 401);
  assert.equal((await call('admin-reports', sessions[0])).status, 403);
  pass('访客可读作品互动，点赞要求登录；普通用户不能读取后台举报');

  const likeButton = root(other).getByRole('button', { name: '点赞 · 0', exact: true });
  await likeButton.waitFor();
  const [likedResponse] = await Promise.all([
    other.waitForResponse(r => r.url().includes('/housing-community/react')),
    likeButton.click()
  ]);
  assert.equal(likedResponse.status(), 200, JSON.stringify(await likedResponse.json()));
  await root(other).getByRole('button', { name: '已点赞 · 1', exact: true }).waitFor();
  await root(other).getByRole('button', { name: '收藏作品 · 0', exact: true }).click();
  await root(other).getByRole('button', { name: '已收藏作品 · 1', exact: true }).waitFor();
  assert.equal((await call('react', sessions[1], { work_id: id, kind: 'like', active: true })).status, 200);
  assert.equal((await db.query('select count(*)::int n from housing_build_reactions where work_id=$1', [id])).rows[0].n, 2);
  await other.reload(); await root(other).getByRole('button', { name: '已点赞 · 1', exact: true }).waitFor();
  assert.deepEqual((await call('favorites', sessions[1])).data.rows, [{ work_id: id }]);
  assert.deepEqual((await call('favorites', sessions[0])).data.rows, []);
  await root(other).getByRole('button', { name: '已点赞 · 1', exact: true }).click();
  await root(other).getByRole('button', { name: '点赞 · 0', exact: true }).waitFor();
  pass('真实按钮点赞/取消、收藏持久化及幂等，收藏只归本人');

  const input = root(other).locator('textarea[name="comment"]');
  await input.fill('出售冰毒'); await root(other).getByRole('button', { name: '发表留言', exact: true }).click();
  await root(other).getByText(/留言包含不允许发布的内容/).waitFor(); assert.equal(await input.inputValue(), '出售冰毒');
  const text = '<img src=x onerror="window.__communityXss=1"> 木纹搭配很舒服';
  await input.fill(text);
  await other.route('**/api/housing-community/thread?*', route => route.fulfill({ status: 503, json: { message: '验收回读失败' } }), { times: 1 });
  await root(other).getByRole('button', { name: '发表留言', exact: true }).click();
  await root(other).getByText('验收回读失败', { exact: true }).waitFor();
  assert.equal(await input.inputValue(), text);
  await root(other).getByRole('button', { name: '发表留言', exact: true }).click();
  await root(other).getByText('留言已发表', { exact: true }).waitFor();
  assert.equal((await db.query('select count(*)::int n from housing_build_comments where work_id=$1', [id])).rows[0].n, 1);
  const commentId = (await db.query('select id from housing_build_comments where work_id=$1', [id])).rows[0].id;
  assert.equal(await root(other).locator('.hc-comment img').count(), 0);
  assert.equal(await other.evaluate(() => window.__communityXss), undefined);
  assert.equal((await call('remove-comment', sessions[0], { id: commentId, work_id: id })).status, 409);
  await guest.reload(); await root(guest).getByText(text, { exact: true }).waitFor();
  await root(other).locator('textarea[name="comment"]').focus();
  await root(other).screenshot({ path: path.join(output, 'community-thread-1366.png') });
  pass('基础词库服务器阻止提交；留言纯文本；写后回读失败保留输入，重试不重复；仅本人可删除');

  await author.reload();
  const reported = root(author).locator('[data-comment-id="' + commentId + '"]');
  await reported.getByRole('button', { name: '举报留言', exact: true }).click();
  await reported.locator('select[name="reason"]').selectOption('abuse');
  await reported.locator('textarea[name="details"]').fill('请核对这条留言');
  await reported.getByRole('button', { name: '提交举报', exact: true }).click();
  await reported.getByText('举报已收到，可在用户中心查看回执。').waitFor();
  const reportId = (await db.query('select id from housing_community_reports where work_id=$1 and comment_id=$2', [id, commentId])).rows[0].id;
  assert.equal((await call('report', sessions[0], { id: randomUUID(), work_id: id, comment_id: commentId, reason: 'abuse', details: '再次提交' })).data.id, reportId);
  assert.equal((await call('notifications', sessions[1])).data.rows.length, 0);
  await author.locator('#iaUserCenterBtn').click();
  await author.locator('[data-tab="notifications"]').click();
  try { await author.locator('#notificationList').getByText(/举报已收到/).waitFor(); }
  catch (error) { throw new Error('通知UI: ' + await author.locator('#notificationList').innerText() + '; 回读: ' + JSON.stringify(await author.evaluate(() => CloudSync.getNotifications()))); }
  await author.locator('#userCenterModal .modal-close').click();
  pass('举报按钮提交原因与说明、重复待处理举报去重，回执在举报人用户中心可见');

  await admin.locator('#page-community [data-hc-admin]').click();
  let report = admin.locator('[data-report-id="' + reportId + '"]');
  await report.locator('select[name="decision"]').selectOption('hide_comment');
  await report.locator('textarea[name="note"]').fill('确认留言不符合友善交流要求，予以隐藏。');
  await report.getByRole('button', { name: '确认处理' }).click();
  await admin.locator('#hcAdminBody').getByText('没有符合条件的举报', { exact: true }).waitFor();
  await guest.reload(); await root(guest).getByText('0 条留言', { exact: true }).waitFor();
  assert.equal((await db.query('select status from housing_build_comments where id=$1', [commentId])).rows[0].status, 'hidden');
  const notices = (await call('notifications', sessions[0])).data;
  assert.equal(notices.unread, 2);
  assert.equal((await call('notifications', sessions[1])).data.rows.length, 1);
  const receiptId = notices.rows[0].id;
  await call('read', sessions[1], { id: receiptId });
  assert.equal((await db.query('select is_read from housing_community_notifications where id=$1', [receiptId])).rows[0].is_read, false);
  await author.locator('#iaUserCenterBtn').click(); await author.locator('[data-tab="notifications"]').click();
  await author.locator('#notificationList').getByText(/举报处理结果/).waitFor();
  await author.getByRole('button', { name: '全部已读', exact: true }).click();
  await author.waitForFunction(() => !document.querySelector('#notificationList .unread'));
  assert.equal((await call('notifications', sessions[0])).data.unread, 0);
  await author.screenshot({ path: path.join(output, 'community-receipt-1920.png') });
  await author.locator('#userCenterModal .modal-close').click();
  pass('平台管理员实际隐藏留言，聚合计数即时减少，双方收到回执；他人不能标记回执已读');

  await admin.locator('[name="report-status"]').selectOption('resolved');
  report = admin.locator('[data-report-id="' + reportId + '"]');
  await report.locator('textarea[name="note"]').fill('复核后恢复展示'); await report.getByRole('button', { name: '确认处理' }).click();
  await admin.waitForFunction(() => document.querySelector('[data-report-id] summary')?.textContent.includes('2'));
  await admin.screenshot({ path: path.join(output, 'community-admin-1366.png') });
  await guest.reload(); await root(guest).getByText('1 条留言', { exact: true }).waitFor();
  await admin.locator('#housingCommunityAdmin').getByRole('button', { name: '关闭', exact: true }).click();
  await other.reload(); other.once('dialog', dialog => dialog.accept());
  await root(other).getByRole('button', { name: '删除留言', exact: true }).click();
  await root(other).getByText('0 条留言', { exact: true }).waitFor();
  pass('管理员恢复留言保留历史；作者实际删除后不可见且不计入热度');

  await author.reload(); await root(author).getByRole('button', { name: '举报作品', exact: true }).click();
  await root(author).locator('.hc-report-form [name="reason"]').selectOption('copyright');
  await root(author).locator('.hc-report-form [name="details"]').fill('核对作品来源');
  await root(author).getByRole('button', { name: '提交举报', exact: true }).click();
  await root(author).getByText('举报已收到，可在用户中心查看回执。').waitFor();
  const workReport = (await db.query('select id from housing_community_reports where work_id=$1 and comment_id is null', [id])).rows[0].id;
  await admin.locator('#page-community [data-hc-admin]').click();
  const workReportUi = admin.locator('[data-report-id="' + workReport + '"]');
  await workReportUi.locator('[name="decision"]').selectOption('hide_work');
  await workReportUi.locator('[name="note"]').fill('暂时下架核对来源'); await workReportUi.getByRole('button', { name: '确认处理' }).click();
  await admin.locator('#hcAdminBody').getByText('没有符合条件的举报', { exact: true }).waitFor();
  assert.equal((await api('gallery?id=' + id + '&v=2')).status, 404);
  assert.equal((await api('copy-code', null, { id })).status, 404);
  assert.equal((await fetch(base + '/api/housing-builds/photo?id=' + imageId)).status, 404);
  assert.equal((await call('thread?id=' + id)).status, 404);
  assert.equal((await call('react', sessions[1], { work_id: id, kind: 'like', active: true })).status, 409);
  assert.equal((await call('summary')).data.rows.some(row => row.work_id === id), false);
  assert.equal((await call('favorites', sessions[1])).data.rows.some(row => row.work_id === id), false);
  const mine = (await api('mine?id=' + id + '&v=2', sessions[0])).data.rows[0];
  const resave = { ...work, revision: mine.revision, screenshots: [{ id: imageId }] };
  assert.equal((await api('save-v2', sessions[0], resave)).status, 409);
  assert.equal((await api('save-v2', sessions[0], { ...resave, published: false })).status, 200);
  await assert.rejects(db.query('update housing_builds set published=true where id=$1', [id]), /housing_builds_moderation_guard/);
  pass('作品下架同时收回公开详情、图片、蓝图、互动、收藏和热度；旧新保存及数据库约束均不能重新公开，作者可留草稿');

  await admin.locator('[name="report-status"]').selectOption('resolved');
  const restoreWork = admin.locator('[data-report-id="' + workReport + '"]');
  await restoreWork.locator('[name="note"]').fill('来源复核完成，解除下架限制');
  await restoreWork.getByRole('button', { name: '确认处理' }).click();
  await admin.waitForFunction(id => document.querySelector('[data-report-id="'+id+'"] summary')?.textContent.includes('2'), workReport);
  const restored = (await api('mine?id=' + id + '&v=2', sessions[0])).data.rows[0];
  assert.equal(restored.published, false);
  assert.equal((await api('save-v2', sessions[0], { ...resave, revision: restored.revision })).status, 200);
  const dismissedId = randomUUID();
  assert.equal((await call('report', sessions[1], { id: dismissedId, work_id: id, reason: 'other', details: '请再次核对' })).status, 200);
  await admin.locator('[name="report-status"]').selectOption('pending');
  const dismiss = admin.locator('[data-report-id="' + dismissedId + '"]');
  await dismiss.locator('[name="note"]').fill('核对后未发现违规');
  await dismiss.getByRole('button', { name: '确认处理' }).click();
  await admin.locator('#hcAdminBody').getByText('没有符合条件的举报', { exact: true }).waitFor();
  assert.equal((await db.query('select status from housing_community_reports where id=$1', [dismissedId])).rows[0].status, 'rejected');
  assert.equal((await api('gallery?id=' + id + '&v=2')).status, 200);
  pass('管理员解除下架后作品保持草稿，由作者重新发布；驳回举报保留作品并给出结果回执');

  for (const role of ['anon', 'authenticated']) {
    for (const table of ['housing_build_reactions', 'housing_build_comments', 'housing_community_reports', 'housing_community_notifications']) {
      const acl = await db.query('select has_table_privilege($1,$2,\'SELECT,INSERT,UPDATE,DELETE\') allowed', [role, table]); assert.equal(acl.rows[0].allowed, false);
    }
    const rpc = await db.query('select has_function_privilege($1,\'housing_community_action(uuid,text,jsonb)\',\'EXECUTE\') allowed', [role]); assert.equal(rpc.rows[0].allowed, false);
  }
  await assert.rejects(db.query("select housing_community_action($1,'moderate',$2)", [sessions[0].user.id, { id: workReport, decision: 'restore_work', note: '越权尝试' }]), /仅平台管理员/);
  pass('社区表与RPC拒绝游客/普通账号直连；数据库再次核验管理员身份');
  await admin.locator('#housingCommunityAdmin').getByRole('button', { name: '关闭', exact: true }).click();
  await db.query('delete from housing_builds where id=$1', [id]);
};
