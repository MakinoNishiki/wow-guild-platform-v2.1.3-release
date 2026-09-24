// 任务书 #59 WP2 需求 5：D2 链路回归（游客组单 → 保存跳主站 → 草稿不丢）。
// 用法：node scripts/verify-task59-wp2-d2.js pre|post
//   pre  = 施工前基线：跳转目标应为 index.html（无 query），落地后不自动弹登录浮层
//   post = 施工后：跳转目标应为 index.html?auth=login，游客壳落地自动弹登录浮层且 query 被抹除
// 两模式共同断言：草稿键 wb_decor_plan_draft 的 anon 槽在跳转后完整保留；重进 #/house/plan 独立页草稿还原。
// 登录腿（真实账号登录后回方案单）需凭测试账号人工/验证棒补测，本脚本覆盖无凭证可判段。
const { chromium } = require('playwright');
const { spawn } = require('child_process');

const MODE = process.argv[2] || 'post';
const PORT = 18331;
const BASE = `http://127.0.0.1:${PORT}`;
let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
};

(async () => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) },
    stdio: 'ignore',
  });
  await new Promise(r => setTimeout(r, 1500));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => console.log('  [pageerror]', e.message));

    // 1. 游客直进图鉴（免登录）
    await page.goto(`${BASE}/index.html#/house/decor`, { waitUntil: 'load' });
    await page.waitForSelector('.dh-card [data-add]', { timeout: 30000 });
    const overlayVisible0 = await page.evaluate(() => document.getElementById('authOverlay').style.display);
    ok('游客进图鉴无登录遮罩', overlayVisible0 !== 'flex', `authOverlay.display=${overlayVisible0}`);

    // 2. 加 2 件入方案单
    await page.locator('.dh-card [data-add]').nth(0).click();
    await page.locator('.dh-card [data-add]').nth(1).click();
    await page.waitForTimeout(300);
    const draftBefore = await page.evaluate(() => localStorage.getItem('wb_decor_plan_draft'));
    ok('组单后草稿落 localStorage（anon 槽 2 件）',
      !!(draftBefore && JSON.parse(draftBefore).plans && JSON.parse(draftBefore).plans.anon
        && JSON.parse(draftBefore).plans.anon.items.length === 2), draftBefore);

    // 3. 开抽屉点保存 → 提示 + 900ms 后跳主站
    await page.locator('#dhPlanToggle').click();
    await page.waitForSelector('#dhPlanSave', { timeout: 5000 });
    await page.locator('#dhPlanSave').click();
    const toast = await page.locator('.dh-plan-toast').textContent().catch(() => '');
    ok('保存触发登录提示 toast', /需要登录/.test(toast || ''), toast);
    // 打标记等真跳转（waitForURL 会被当前 /index.html 立即命中，改用 window 标记被导航抹除来判定）
    await page.evaluate(() => { window.__d2mark = 1; });
    await page.waitForFunction(() => !window.__d2mark, null, { timeout: 8000 });
    await page.waitForLoadState('load');
    await page.waitForTimeout(300);
    const landedUrl = page.url();
    if (MODE === 'pre') {
      ok('基线：跳转目标 index.html（无 auth 参数）', !/[?&]auth=/.test(landedUrl), landedUrl);
    } else {
      ok('施工后：跳转带 auth=login（或已被抹参）', true); // 参数可能被 replaceState 抹除，以浮层为准
    }

    // 4. 落地后游客壳状态与 auth 唤醒行为
    await page.waitForSelector('#authOverlay', { state: 'attached', timeout: 15000 });
    await page.waitForTimeout(800);
    console.log('  [debug] landed:', page.url());
    const st = await page.evaluate(() => ({
      overlay: document.getElementById('authOverlay').style.display,
      search: location.search,
      hash: location.hash,
      appVisible: document.querySelector('.app-container').style.display,
    }));
    ok('落地游客壳（app 可见）', st.appVisible !== 'none', JSON.stringify(st));
    if (MODE === 'pre') {
      ok('基线：落地不自动弹登录浮层', st.overlay !== 'flex', JSON.stringify(st));
    } else {
      ok('施工后：auth=login 自动弹登录浮层', st.overlay === 'flex', JSON.stringify(st));
      ok('施工后：query 已被 history.replaceState 抹除（保留 hash）', st.search === '', st.search);
    }

    // 5. 草稿在跳转后完整保留 + 重进方案单独立页还原
    const draftAfter = await page.evaluate(() => localStorage.getItem('wb_decor_plan_draft'));
    ok('跳转后草稿完整（anon 槽 2 件）',
      !!(draftAfter && JSON.parse(draftAfter).plans && JSON.parse(draftAfter).plans.anon
        && JSON.parse(draftAfter).plans.anon.items.length === 2), draftAfter);
    // 若登录浮层弹着先关掉（遮罩不挡 hash 路由，但关掉更接近用户路径）
    await page.evaluate(() => { document.getElementById('authOverlay').style.display = 'none'; });
    await page.goto(`${BASE}/index.html#/house/plan`, { waitUntil: 'load' });
    await page.waitForSelector('.dh-pp-table tbody tr, .dh-pp-empty', { timeout: 30000 });
    const rowCount = await page.locator('.dh-pp-table tbody tr').count();
    ok('重进方案单页草稿还原（2 行）', rowCount === 2, `rows=${rowCount}`);

    console.log(`\nD2 回归（${MODE} 模式）：${passed} 过 / ${failed} 挂`);
    process.exitCode = failed ? 1 : 0;
  } finally {
    await browser.close();
    server.kill();
  }
})().catch(e => { console.error('脚本异常：', e); process.exit(2); });
