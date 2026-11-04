// REQ-180: real Chrome UI, isolated in-memory DB/WCL fixtures; no credentials or production writes.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const out = 'docs/evidence/req180-20261104';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = [], checks = [];
  page.on('pageerror', e => errors.push(e.message));
  // All remote traffic blocked. The review server only serves files and public config.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    return route.continue();
  });
  try {
    await page.goto('http://127.0.0.1:18777/#/home');
    await page.waitForFunction(() => typeof openAttendanceDetail === 'function');
    await page.getByRole('button', { name: '验收：考勤流程', exact: true }).click();

    const check = (label, result) => { assert.ok(result, label); checks.push(label); };
    const appSource = fs.readFileSync('js/app.js', 'utf8');
    const serverSource = fs.readFileSync('server.js', 'utf8');
    check('后台自动建活动调度与写入端点已退役', !/wclAutoCreateSweep|startWclAutoCreateSweep|set-auto-create/.test(serverSource));
    // HEAD 已有 17 处（旧 #47 脚本的 16 是历史基线）；本批没有新增底层写点。
    check('写入门禁与本批 HEAD 基线一致 17/1/0', (appSource.match(/window\.CloudSync\.saveCloudData\(/g) || []).length - 1 === 17 && (appSource.match(/fetch\('\/api\/db/g) || []).length === 1 && (appSource.match(/[^.]db(?:Insert|Update|Delete)\(/g) || []).length === 0);
    check('资源版本全部一致', [...fs.readFileSync('index.html','utf8').matchAll(/(?:src|href)="(?:js|css)\/[^"?]+\?v=([^"]+)"/g)].every(m => m[1] === '20261105.127'));
    const screenshot = async name => {
      await page.evaluate(async () => {
        document.getElementById('toastContainer').replaceChildren();
        await Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
      });
      await page.screenshot({ path: out + '/' + name + '.png', fullPage: true });
    };
    await page.evaluate(() => showImportMembersModal());
    check('成员导入默认 WCL，宏教程已移除', await page.locator('#importWclStep').isVisible() && await page.locator('#importPasteStep').isHidden() && await page.locator('#importMacroTeam').count() === 0);
    await screenshot('member-import-wcl');
    await page.locator('#importWclUrl').fill('https://www.warcraftlogs.com/reports/Fixture123');
    await page.locator('#importWclParseBtn').click();
    await page.waitForSelector('#importPreviewStep', { state: 'visible' });
    check('WCL 名单读取后只预览不自动导入', await page.evaluate(() => importPreviewRows.length === 4 && fixture.writes.length === 0));
    await page.locator('#importTabPaste').click();
    await page.locator('#importMembersText').fill('小明,战士');
    await page.locator('#importParseBtn').click();
    check('简洁备用名单仍可解析', await page.evaluate(() => importPreviewRows[0].name === '小明' && importPreviewRows[0].cls === '战士'));
    await page.evaluate(() => closeModal('importMembersModal'));
    await page.evaluate(() => openAttendanceDetail('a1'));
    const footerBefore = await page.locator('#attendanceDetailModal .modal-footer').boundingBox();
    await page.locator('#attendanceWclActions summary').click();
    const footerAfter = await page.locator('#attendanceDetailModal .modal-footer').boundingBox();
    check('日志展开不撑高操作栏且箭头状态明确', Math.abs(footerAfter.height - footerBefore.height) < 2 && await page.evaluate(() => getComputedStyle(document.querySelector('.wcl-actions-caret')).transform !== 'none'));
    await page.keyboard.press('Escape');
    check('Escape 先收日志面板不关活动', await page.evaluate(() => !document.getElementById('attendanceWclActions').open && document.getElementById('attendanceDetailModal').classList.contains('show')));
    await page.locator('#attendanceWclActions summary').click();
    await screenshot('log-actions');
    await page.locator('#attendanceWclEditBtn').click();
    await page.locator('#activityWclUrl').fill('https://www.warcraftlogs.com/reports/OldReport123');
    await page.evaluate(() => { fixture.failSave = true; });
    await page.locator('#activitySaveBtn').click();
    check('补链失败保留表单且不写入', await page.evaluate(() => document.getElementById('activityModal').classList.contains('show') && fixture.writes.length === 0));
    await page.evaluate(() => { fixture.failSave = false; });
    await page.locator('#activitySaveBtn').click();
    await page.waitForFunction(() => !document.getElementById('activityModal').classList.contains('show'));
    check('补链成功且元数据写入不携带考勤', await page.evaluate(() => fixture.activities[0].wcl_report_code === 'OldReport123' && !('attendees' in fixture.writes[0].payload)));
    await page.locator('#attendanceWclActions summary').click();
    await screenshot('log-actions-linked');
    await page.locator('#attendanceWclSyncBtn').click();
    await page.waitForSelector('#wclSyncModal.show');
    check('跨服同名不自动写入、迟到保留', await page.evaluate(() => wclSyncRows.find(r => r.name === '乙').zone === 'unmatched' && wclSyncMeta.preservedList[0].status === '迟到'));
    await page.evaluate(() => { fixture.failAttendance = true; });
    await page.locator('#wclSyncConfirmBtn').click();
    check('考勤写失败不关预览不增加记录', await page.evaluate(() => document.getElementById('wclSyncModal').classList.contains('show') && fixture.activities[0].attendees.length === 2));
    await page.evaluate(() => { fixture.failAttendance = false; });
    await page.locator('#wclSyncConfirmBtn').click();
    await page.waitForFunction(() => !document.getElementById('wclSyncModal').classList.contains('show'));
    check('确认同步仅新增丙、迟到和跨服缺席不变', await page.evaluate(() => fixture.activities[0].attendees.map(a => a.status).join() === '迟到,缺席,出席' && fixture.activities[0].wcl_snapshot.players.length === 4));
    await page.evaluate(() => syncAttendanceFromWcl());
    check('重复同步不产生可写重复行', await page.evaluate(() => wclSyncRows.every(r => r.zone === 'unmatched')));
    await page.evaluate(() => { closeModal('wclSyncModal'); fixture.summary.players = [fixture.summary.players[0]]; });
    await page.locator('#attendanceWclActions summary').click();
    await page.locator('#attendanceWclEditBtn').click();
    await page.locator('#activityWclUrl').fill('https://www.warcraftlogs.com/reports/NewReport123');
    await page.locator('#activitySaveBtn').click();
    await page.waitForSelector('#wclSyncModal.show');
    check('更换预览明确显示减少名单、无提前写链接', await page.evaluate(() => wclSyncMeta.left.some(p => p.name === '丙') && fixture.activities[0].wcl_report_code === 'OldReport123'));
    await screenshot('replacement-preview');
    await page.evaluate(() => { fixture.failSave = true; });
    await page.locator('#wclSyncConfirmBtn').click();
    check('更换保存失败保留预览与旧链接', await page.evaluate(() => document.getElementById('wclSyncModal').classList.contains('show') && fixture.activities[0].wcl_report_code === 'OldReport123'));
    check('更换保存失败后重试按钮含义不变', await page.locator('#wclSyncConfirmBtn').innerText() === '确认更换并保留已有考勤');
    await page.evaluate(() => { fixture.failSave = false; });
    await page.locator('#wclSyncConfirmBtn').click();
    await page.waitForFunction(() => !document.getElementById('wclSyncModal').classList.contains('show'));
    check('更换重试成功、保留全部旧状态及原快照', await page.evaluate(() => fixture.activities[0].wcl_report_code === 'NewReport123' && fixture.activities[0].attendees.map(a => a.status).join() === '迟到,缺席,出席' && fixture.activities[0].wcl_snapshot.history[0].report_code === 'OldReport123'));
    await page.evaluate(() => { closeModal('attendanceDetailModal'); fixture.reports[0].code = 'Candidate123'; });
    await page.evaluate(() => wclSyncReports());
    await page.evaluate(() => {
      fixture.reportRequests = 0;
      const fetchFixture = window.fetch;
      window.fetch = async (...args) => { if (String(args[0]).startsWith('/api/wcl/reports?')) fixture.reportRequests++; return fetchFixture(...args); };
    });
    await page.locator('#wclReportsSyncBtn').click();
    await page.locator('#wclReportsSyncBtn').click();
    await page.waitForFunction(() => !wclReportsBusy);
    check('重复查找实际发起两次请求并提示无新增', await page.evaluate(() => fixture.reportRequests === 2 && document.getElementById('wclSyncStatusLine').textContent.includes('没有新增报告，仍有 1 份待确认')));
    await page.locator('.wcl-report-candidate button').filter({ hasText: '核对参战名单' }).click();
    await page.waitForFunction(() => document.querySelector('.wcl-report-check').textContent.includes('名单匹配'));
    check('报告核对显示事实且不自动建活动', await page.evaluate(() => document.querySelector('.wcl-report-check').textContent.includes('不代表这一定') && fixture.activities.length === 1));
    await screenshot('report-review');
    await page.evaluate(() => { fixture.failSummary = true; wclReportChecks.clear(); });
    await page.locator('.wcl-report-candidate button').filter({ hasText: '核对参战名单' }).click();
    await page.waitForFunction(() => document.querySelector('.wcl-report-check').textContent.includes('核对失败'));
    check('报告读取失败可重试', await page.locator('.wcl-report-candidate button').filter({ hasText: '核对参战名单' }).isEnabled());
    await page.evaluate(() => {
      fixture.activities.push({ ...structuredClone(fixture.activities[0]), id: 'a2', wcl_report_code: '', wcl_url: '', wcl_snapshot: null });
      appData.activities = structuredClone(fixture.activities);
    });
    await page.locator('.wcl-report-candidate button').filter({ hasText: '关联已有活动' }).click();
    await page.locator('.wcl-report-candidate select').selectOption('a2');
    check('候选关联复用编辑弹窗且只预填', await page.evaluate(() => editingActivityId === 'a2' && document.getElementById('activityWclUrl').value.endsWith('Candidate123') && !fixture.activities[1].wcl_report_code));
    await page.locator('#activitySaveBtn').click();
    await page.waitForFunction(() => !document.getElementById('activityModal').classList.contains('show'));
    check('关联保存后候选即时消失', await page.locator('#wclNewReportsBanner').isHidden());
    await page.evaluate(() => { fixture.guild = { id: 'other' }; renderAttendance(); });
    check('切公会隐藏旧候选', await page.locator('#wclNewReportsBanner').isHidden());
    await page.evaluate(() => { fixture.guild = { id: 'fixture-guild' }; fixture.canEdit = false; document.body.classList.add('viewer-mode'); openAttendanceDetail('a1'); });
    await page.locator('#attendanceWclActions summary').click();
    check('viewer 保留复盘、隐藏编辑同步', await page.locator('#attendanceWclBtn').isVisible() && await page.locator('#attendanceWclEditBtn').isHidden() && await page.locator('#attendanceWclSyncBtn').isHidden());
    await page.evaluate(() => { fixture.canEdit = true; document.body.classList.remove('viewer-mode'); fixture.activities[0].status = 'cancelled'; appData.activities = structuredClone(fixture.activities); openAttendanceDetail('a1'); });
    check('已取消活动无同步和编辑入口', await page.locator('#attendanceWclEditBtn').isHidden() && await page.locator('#attendanceWclSyncBtn').isHidden());
    await page.evaluate(() => { fixture.activities[0].status = 'normal'; appData.activities = structuredClone(fixture.activities); openAttendanceDetail('a1'); });
    await page.locator('.attend-status-select[data-member="m1"]').selectOption('请假');
    await page.evaluate(() => syncAttendanceFromWcl());
    check('未保存人工修改时阻止同步覆盖', await page.locator('#wclSyncModal').isHidden());
    check('零首领报告禁用确认', await page.evaluate(() => {
      buildWclSyncPreview(appData.activities[0], 'Empty', { players: [], bossFightTotal: 0 });
      return document.getElementById('wclSyncConfirmBtn').disabled;
    }));
    await page.evaluate(() => closeModal('attendanceDetailModal'));
    await page.locator('#page-attendance .team-flow-guide summary').click();
    check('指引可展开并使用原模块链接', await page.locator('#page-attendance .team-flow-guide a[href="#/team/members"]').isVisible());
    check('退役旧导入入口与弹窗', await page.locator('#wclImportModal').count() === 0);
    for (const width of [1366, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      check('指引与页面无横向溢出 ' + width, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await screenshot('attendance-guide');
    check('页面无未捕获异常', errors.length === 0);
    fs.writeFileSync(out + '/verification.json', JSON.stringify({ environment: 'Chrome, isolated DB/WCL fixtures; not production', checks, errors }, null, 2));
    console.log(JSON.stringify({ passed: checks.length, errors }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
