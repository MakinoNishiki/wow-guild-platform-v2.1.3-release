// TASK-016 S4 真浏览器主链路实测：隧道入口 → 注册 → 登录 → 建公会（走 /api/db 写代理）→ 网络请求审计（禁 supabase.co）
const { chromium } = require('playwright-core');

const BASE = 'https://127.0.0.1:18080';
const TS = Date.now().toString(36);
const EMAIL = `ksmoke${TS}@163.com`;
const PASS = 'Ksmoke123456';
const GUILD = `冒烟公会${TS}`;

(async () => {
  const bad = [];
  const seen = new Set();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  page.on('request', r => {
    const u = r.url();
    if (/supabase\.co/.test(u)) bad.push('SUPABASE_CO: ' + u);
    seen.add(new URL(u).host);
  });
  page.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) bad.push(`HTTP_${r.status()}: ${r.url()}`); });
  page.on('pageerror', e => bad.push('JS_ERROR: ' + e.message));

  const out = [];
  const step = (name, ok, extra='') => { out.push(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); if (!ok) process.exitCode = 1; };

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#authLoginForm', { timeout: 15000 });
  step('首页打开+登录表单渲染', true);

  // 注册
  await page.click('text=立即注册');
  await page.fill('#regDisplayName', 'K冒烟');
  await page.fill('#regEmail', EMAIL);
  await page.fill('#regPassword', PASS);
  await page.click('#authRegisterBtn');
  await page.waitForSelector('#authGuildForm', { timeout: 20000 }).catch(() => {});
  const guildFormVisible = await page.isVisible('#authGuildForm');
  step('注册→进入建公会页（免邮件确认）', guildFormVisible, guildFormVisible ? '' : await page.textContent('#authError').catch(()=>''));

  // 建公会（写链路：/api/db 代理 → 自托管库）
  if (guildFormVisible) {
    await page.fill('#newGuildName', GUILD);
    await page.click('text=创建公会');
    await page.waitForSelector('#sidebar', { state: 'visible', timeout: 30000 }).catch(() => {});
    const inApp = await page.isVisible('#sidebar');
    step('创建公会→进入主应用（写代理全链）', inApp, inApp ? '' : await page.textContent('#authError').catch(()=>''));
  }

  // 登出再登录（验证登录主链路）
  if (process.exitCode !== 1) {
    await page.evaluate(() => { try { localStorage.clear(); } catch(e){} });
    await page.goto(BASE + '/?relogin=1', { waitUntil: 'domcontentloaded' });
    // 直接调 SDK 登出再登录 UI
    await page.evaluate(async () => { try { await window.supabase?.createClient('https://x','x')?.auth.signOut(); } catch(e){} });
    await page.waitForSelector('#authLoginForm', { timeout: 15000 });
    await page.fill('#authEmail', EMAIL);
    await page.fill('#authPassword', PASS);
    await page.click('#authLoginBtn');
    await page.waitForSelector('#sidebar', { state: 'visible', timeout: 30000 }).catch(() => {});
    step('老账号登录→进入主应用', await page.isVisible('#sidebar'));
  }

  console.log(out.join('\n'));
  console.log('--- 请求来源主机 ---');
  console.log([...seen].join('\n'));
  console.log('--- 异常（空=全绿）---');
  console.log(bad.length ? bad.join('\n') : '(无)');
  await browser.close();
  console.log('SMOKE_EMAIL=' + EMAIL);
  console.log('SMOKE_GUILD=' + GUILD);
})();
