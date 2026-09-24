// 任务书 #59 WP2 观察项修复回归：#iaGuideCreateBtn 补 btn-ghost 类（REQ-138 次级权重）
// 游客态 + 登录无公会态两张引导卡截图 + computedStyle 断言；临时用户验完即删
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const SHOT = path.join(ROOT, 'backup', '2026-09-24-task59-wp1');
const BASE = 'http://127.0.0.1:18659';
const PWD = 'Wp2fx-2026!';
const EMAIL = 'wp2fx-noguild@example.com';

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const SVC = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function ensureUser() {
  const su = await fetch(`${SB}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PWD, data: { display_name: 'wp2fx' } }),
  });
  const sb = await su.json();
  if (sb.access_token) return sb.user.id;
  const li = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PWD }),
  });
  const lb = await li.json();
  if (!lb.access_token) throw new Error('临时用户会话获取失败');
  return lb.user.id;
}

(async () => {
  const uid = await ensureUser();
  const browser = await chromium.launch();
  const results = [];
  const check = (n, ok, d) => { results.push(ok); console.log(`${ok ? '✓' : '✗'} ${n}${d ? ' —— ' + d : ''}`); };

  const probe = async page => page.evaluate(() => {
    const el = document.getElementById('iaGuideCreateBtn');
    const cs = getComputedStyle(el);
    return {
      cls: el.className, bg: cs.backgroundColor, bgImage: cs.backgroundImage,
      borderColor: cs.borderColor, color: cs.color, disabled: el.disabled,
      joinGradient: getComputedStyle(document.getElementById('iaGuideJoinBtn')).backgroundImage.includes('gradient'),
    };
  });

  // 游客态
  const ctx1 = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const p1 = await ctx1.newPage();
  await p1.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p1.waitForFunction(() => location.hash === '#/home', null, { timeout: 10000 });
  await p1.click('button[data-ia-tab="team"]');
  await p1.waitForSelector('#page-team-guide.active', { timeout: 10000 });
  const g1 = await probe(p1);
  console.log('  [游客态] ' + JSON.stringify(g1));
  check('游客态: 创建钮 btn-ghost 在场且禁用', g1.cls.includes('btn-ghost') && g1.disabled, g1.cls);
  check('游客态: background transparent', g1.bg === 'rgba(0, 0, 0, 0)' || g1.bg === 'transparent', `bg=${g1.bg} bgImage=${g1.bgImage}`);
  check('游客态: 主卡加入钮仍金渐变（对照）', g1.joinGradient);
  await p1.screenshot({ path: path.join(SHOT, 'wp2-fix-ghost-1.png') });

  // 登录无公会态
  const ctx2 = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const p2 = await ctx2.newPage();
  await p2.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p2.waitForSelector('#iaLoginBtn', { state: 'visible', timeout: 15000 });
  await p2.click('#iaLoginBtn');
  await p2.fill('#authEmail', EMAIL);
  await p2.fill('#authPassword', PWD);
  await p2.click('#authLoginBtn');
  await p2.waitForFunction(() => getComputedStyle(document.getElementById('authOverlay')).display === 'none', null, { timeout: 30000 });
  await sleep(800);
  await p2.click('button[data-ia-tab="team"]');
  await p2.waitForSelector('#page-team-guide.active', { timeout: 10000 });
  const g2 = await probe(p2);
  console.log('  [无公会态] ' + JSON.stringify(g2));
  check('无公会态: 创建钮 btn-ghost 且可用', g2.cls.includes('btn-ghost') && !g2.disabled, g2.cls);
  check('无公会态: background transparent', g2.bg === 'rgba(0, 0, 0, 0)' || g2.bg === 'transparent', `bg=${g2.bg}`);
  check('无公会态: 主卡加入钮仍金渐变（对照）', g2.joinGradient);
  await p2.screenshot({ path: path.join(SHOT, 'wp2-fix-ghost-2.png') });

  await browser.close();
  // 清理临时用户
  const d = await fetch(`${SB}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: SVC });
  console.log(`清理临时用户 ${EMAIL}: status=${d.status}`);
  const chk = await fetch(`${SB}/auth/v1/admin/users/${uid}`, { headers: SVC });
  console.log(`复核用户已删: 查询 status=${chk.status}（404=已删）`);

  const failed = results.filter(r => !r).length;
  console.log(`\n===== ghost 修复回归: ${results.length - failed}/${results.length} 通过 =====`);
  process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error('异常:', e); process.exitCode = 2; });
