// 任务书 #29 WP1 验证（REQ-094 A 组：注册密码强度 / 用户中心修改密码 / 玩家ID BattleTag 风格）：
//   A. 注册密码强度（真浏览器注册页 UI，getComputedStyle 生效值断言：颜色对照 CSS 变量解析 RGB、宽度按比例实测）；
//   B. 修改密码主链路（UI 注册 T29A 账号 → 建会 → 用户中心修改密码 6 子场景 + 旧/新密码登录）；
//      REQ-096（2026-08-11 验收修复小包，口径变更推翻任务书 #29 WP1「会话保持」裁定）：
//      B5 原「会话保持」断言反转为「强制登出回登录页」断言，属裁定驱动合法更新；
//   C. 玩家ID（tag_num 列存在才跑——sql/25 未执行时整组 SKIP 并显著标注，脚本两次运行均可通过）；
//   D. 测试数据（T29A 前缀：auth 用户×2 / user_profiles / 公会 / guild_members）自清理并复核为零。
// 红线：不执行 sql/25（不 ALTER 生产库）；不改业务代码；不 git 操作。
// 用法: node scripts/verify-task29-wp1.js（PW_CHANNEL=chrome 可选）｜ 截图 → backup/2026-08-10-task29-wp1/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(__dirname, '..', '.s6-ssh', 'node_modules', 'playwright-core'))); }

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-10-task29-wp1');
const PORT = 15661;
const BASE = `http://localhost:${PORT}`;
const EMAIL = 't29a-main@wowbutler.cn';
const EMAIL2 = 't29a-occ@wowbutler.cn';
const PWD = 'T29abcd12';
const NEW_PWD = 'NewT29pass34';
const NICK = 'T29A昵称';

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const ANON = env.SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const SVC = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

const results = [];
const skips = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail !== undefined ? `（${detail}）` : ''}`);
}
function skip(name, reason) {
  skips.push(name);
  console.log(`⊘ SKIP ${name} —— ${reason}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function svc(method, restPath, body) {
  const res = await fetch(`${SB}${restPath}`, { method, headers: SVC, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text(); try { return { status: res.status, body: JSON.parse(t) }; } catch { return { status: res.status, body: t }; }
}
async function adminDeleteUser(uid) {
  try { await fetch(`${SB}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: SVC }); return true; } catch { return false; }
}
async function adminUserGone(uid) {
  const r = await fetch(`${SB}/auth/v1/admin/users/${uid}`, { headers: SVC });
  return r.status === 404;
}

let serverProc = null, uid1 = null, uid2 = null, tagNumMigrated = false, guildId = null;

// 预清理：上轮残留的 T29A 用户（admin 列表按邮箱前缀过滤）与公会
async function preClean() {
  const r = await fetch(`${SB}/auth/v1/admin/users?page=1&per_page=200`, { headers: SVC });
  const body = await r.json().catch(() => ({}));
  for (const u of (body.users || [])) {
    if ((u.email || '').startsWith('t29a-')) await adminDeleteUser(u.id);
  }
  await svc('DELETE', '/rest/v1/guilds?name=like.T29A*');
}

async function setup() {
  await preClean();
  // 探测 user_profiles.tag_num 是否已迁移（sql/25 待运营执行；缺列 PostgREST 报 42703）——只探测，绝不 ALTER
  const probe = await svc('GET', '/rest/v1/user_profiles?select=tag_num&limit=1');
  tagNumMigrated = !(probe.status === 400 && probe.body && probe.body.code === '42703');
  console.log(`[探测] user_profiles.tag_num 列${tagNumMigrated ? '已迁移（C 组全跑）' : '未迁移（sql/25 待运营执行，C 组整组 SKIP）'}`);

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r2 = await fetch(`${BASE}/api/supabase-config`); if (r2.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }
}

async function cleanup() {
  const steps = [];
  if (guildId) {
    try { await svc('DELETE', `/rest/v1/guild_members?guild_id=eq.${guildId}`); steps.push('guild_members:ok'); } catch { steps.push('guild_members:ERR'); }
  }
  try { await svc('DELETE', '/rest/v1/guilds?name=like.T29A*'); steps.push('guilds:ok'); } catch { steps.push('guilds:ERR'); }
  for (const uid of [uid1, uid2].filter(Boolean)) {
    try { await svc('DELETE', `/rest/v1/user_profiles?user_id=eq.${uid}`); steps.push('profiles:ok'); } catch { steps.push('profiles:ERR'); }
    steps.push(`user:${(await adminDeleteUser(uid)) ? 'deleted' : 'ERR'}`);
  }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));

  // 复核为零
  const counts = [];
  const c1 = await svc('GET', '/rest/v1/guilds?select=id&name=like.T29A*');
  counts.push(['guilds', Array.isArray(c1.body) ? c1.body.length : '?']);
  const c2 = guildId ? await svc('GET', `/rest/v1/guild_members?select=id&guild_id=eq.${guildId}`) : { body: [] };
  counts.push(['guild_members', Array.isArray(c2.body) ? c2.body.length : '?']);
  for (const [label, uid] of [['user1', uid1], ['user2', uid2]]) {
    if (!uid) { counts.push([label, 0]); continue; }
    const cp = await svc('GET', `/rest/v1/user_profiles?select=user_id&user_id=eq.${uid}`);
    const profN = Array.isArray(cp.body) ? cp.body.length : '?';
    const gone = await adminUserGone(uid);
    counts.push([`${label}(profiles=${profN},auth ${gone ? 0 : '在'})`, profN === 0 && gone ? 0 : 1]);
  }
  console.log('[清理复核] ' + counts.map(([l, n]) => `${l}=${n}`).join(' | '));
  check('测试数据清零复核（全 0）', counts.every(([, n]) => n === 0), counts.map(([, n]) => n).join('/'));
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await setup();

  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const pageErrors = [];
  let confirmCount = 0;
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => pageErrors.push('pageerror: ' + e.message));
    page.on('console', msg => { if (msg.type() === 'error') pageErrors.push('console: ' + msg.text()); });
    page.on('dialog', d => { if (d.type() === 'confirm') confirmCount++; d.accept(); });

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });

    // CSS 变量 → 解析后 RGB（颜色对照基准）
    const COLORS = await page.evaluate(() => {
      const out = {};
      for (const v of ['--danger', '--warning', '--success']) {
        const d = document.createElement('div');
        d.style.backgroundColor = `var(${v})`;
        document.body.appendChild(d);
        out[v] = getComputedStyle(d).backgroundColor;
        d.remove();
      }
      return out;
    });

    // ==================== A. 注册密码强度（注册页 UI，生效值断言） ====================
    await page.evaluate(() => showRegisterForm());
    await sleep(400);
    const regState = () => page.evaluate(() => {
      const box = document.getElementById('regPwStrength');
      const fill = document.getElementById('regPwStrengthFill');
      const track = fill.parentElement;
      return {
        visible: getComputedStyle(box).display !== 'none',
        bg: getComputedStyle(fill).backgroundColor,
        ratio: track.getBoundingClientRect().width ? fill.getBoundingClientRect().width / track.getBoundingClientRect().width : 0,
        text: document.getElementById('regPwStrengthText').textContent,
        disabled: document.getElementById('authRegisterBtn').disabled,
      };
    });
    const ratioOk = (r, target) => Math.abs(r - target) < 0.04;

    // A1 黑名单弱密码（实测：passwordRuleError 先查格式再查黑名单——12345678 纯数字先中「字母和数字」规则，
    // 黑名单分支用含字母数字的 abc12345 验证；纯数字黑名单条目不可达一事上报主代理裁定，业务代码不动）
    await page.fill('#regPassword', '12345678');
    await sleep(300);
    let s = await regState();
    check('A1 弱密码 12345678：强度条可见+danger 色+33%+按钮禁用（文案中格式规则）',
      s.visible && s.bg === COLORS['--danger'] && ratioOk(s.ratio, 0.33) && s.disabled === true && s.text.includes('字母和数字'),
      `bg=${s.bg}（期望 ${COLORS['--danger']}）ratio=${s.ratio.toFixed(2)} disabled=${s.disabled} text=${s.text}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'reg-weak.png') });
    await page.fill('#regPassword', 'abc12345');
    await sleep(300);
    s = await regState();
    check('A1b 黑名单 abc12345（含字母数字）：弱+danger+禁用+文案含「过于常见」',
      s.visible && s.bg === COLORS['--danger'] && s.disabled === true && s.text.includes('过于常见'), `text=${s.text}`);

    // A2 纯字母
    await page.fill('#regPassword', 'abcdefgh');
    await sleep(300);
    s = await regState();
    check('A2 纯字母 abcdefgh：弱+danger+禁用+文案含「字母和数字」',
      s.visible && s.bg === COLORS['--danger'] && s.disabled === true && s.text.includes('字母和数字'), `text=${s.text}`);

    // A3 7 位
    await page.fill('#regPassword', 'abc1234');
    await sleep(300);
    s = await regState();
    check('A3 7 位 abc1234：弱+danger+禁用+文案含「至少 8 位」',
      s.visible && s.bg === COLORS['--danger'] && s.disabled === true && s.text.includes('至少 8 位'), `text=${s.text}`);

    // A4 合规 9 位（无混合无符号）→ 中
    await page.fill('#regPassword', 'T29abcdef');
    await sleep(300);
    s = await regState();
    check('A4 合规 T29abcdef：warning 色+66%+按钮启用',
      s.visible && s.bg === COLORS['--warning'] && ratioOk(s.ratio, 0.66) && s.disabled === false,
      `bg=${s.bg}（期望 ${COLORS['--warning']}）ratio=${s.ratio.toFixed(2)} disabled=${s.disabled}`);

    // A5 10 位大小写混合+符号 → 强
    await page.fill('#regPassword', 'T29abcde1!');
    await sleep(300);
    s = await regState();
    check('A5 强密码 T29abcde1!：success 色+100%+按钮启用',
      s.visible && s.bg === COLORS['--success'] && ratioOk(s.ratio, 1) && s.disabled === false,
      `bg=${s.bg}（期望 ${COLORS['--success']}）ratio=${s.ratio.toFixed(2)}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'reg-strong.png') });

    // A6 清空密码 → 强度条隐藏 + 按钮恢复可用（空密码保留点击报错路径）
    await page.fill('#regPassword', '');
    await sleep(300);
    s = await regState();
    check('A6 清空密码：强度条隐藏 + 按钮恢复可用', !s.visible && s.disabled === false, `visible=${s.visible} disabled=${s.disabled}`);

    // A7 门禁与 authSetBusy 交互：弱密码态按钮被禁（点击不触发）→ 改合规 → 启用
    await page.fill('#regPassword', '12345678');
    await sleep(300);
    const s7a = await regState();
    await page.fill('#regPassword', PWD);
    await sleep(300);
    const s7b = await regState();
    check('A7 门禁交互：弱密码禁用 → 改合规后启用', s7a.disabled === true && s7b.disabled === false, `弱=${s7a.disabled} 合规=${s7b.disabled}`);

    // ==================== B. 修改密码（真浏览器主链路） ====================
    // UI 注册 + 建会进应用
    await page.fill('#regDisplayName', NICK);
    await page.fill('#regEmail', EMAIL);
    await page.fill('#regPassword', PWD);
    await page.click('#authRegisterBtn');
    await page.waitForSelector('#authGuildForm', { state: 'visible', timeout: 20000 });
    await page.fill('#newGuildName', 'T29A公会');
    await page.click('button[onclick="handleCreateGuild()"]');
    await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
    await sleep(2500);
    uid1 = await page.evaluate(() => window.CloudSync.getCachedUser().id);
    const g = await svc('GET', '/rest/v1/guilds?select=id&name=eq.T29A公会');
    guildId = Array.isArray(g.body) && g.body[0] ? g.body[0].id : null;
    check('B0 UI 注册+创建公会进应用（主链路）', !!uid1 && !!guildId, `uid=${uid1} guild=${guildId}`);

    // 用户中心 → 修改密码 tab
    await page.evaluate(async () => { await openUserCenter(); switchUserTab('password'); });
    await sleep(800);
    const hintText = () => page.evaluate(() => document.getElementById('ucPwHint').textContent);
    async function fillPwForm(cur, nw, cf) {
      await page.fill('#ucPwCurrent', cur);
      await page.fill('#ucPwNew', nw);
      await page.fill('#ucPwConfirm', cf);
      await sleep(300);
    }

    // B1 当前密码错
    await fillPwForm('WrongPass1', 'T29newab1', 'T29newab1');
    await page.click('#ucPwSubmitBtn');
    await page.waitForFunction(() => document.getElementById('ucPwHint').textContent.includes('当前密码'), undefined, { timeout: 15000 });
    const b1ModalOpen = await page.evaluate(() => document.getElementById('userCenterModal').classList.contains('show'));
    check('B1 当前密码错 → 就地提示「当前密码错误」不跳转', (await hintText()) === '当前密码错误' && b1ModalOpen, `hint=${await hintText()}`);

    // B2 两次不一致
    await fillPwForm(PWD, 'T29newab1', 'T29newab2');
    await page.click('#ucPwSubmitBtn');
    await sleep(500);
    check('B2 两次不一致 → 「两次输入的新密码不一致」', (await hintText()) === '两次输入的新密码不一致', `hint=${await hintText()}`);

    // B3 新=旧
    await fillPwForm(PWD, PWD, PWD);
    await page.click('#ucPwSubmitBtn');
    await sleep(500);
    check('B3 新=旧 → 「不能与当前密码相同」', (await hintText()) === '新密码不能与当前密码相同', `hint=${await hintText()}`);

    // B4 弱新密码 → 提交禁用 + 强度条 danger computed 色
    await fillPwForm(PWD, '12345678', '12345678');
    const b4 = await page.evaluate(() => ({
      disabled: document.getElementById('ucPwSubmitBtn').disabled,
      bg: getComputedStyle(document.getElementById('ucPwStrengthFill')).backgroundColor,
      text: document.getElementById('ucPwStrengthText').textContent,
    }));
    check('B4 弱新密码 12345678 → 提交禁用+强度条 danger 色', b4.disabled === true && b4.bg === COLORS['--danger'],
      `disabled=${b4.disabled} bg=${b4.bg} text=${b4.text}`);

    // B5 合规成功 → toast「密码已修改，请重新登录」+ 三字段清空 + 强制登出回登录页
    // （REQ-096 口径变更，2026-08-11 验收修复小包：推翻任务书 #29 WP1「会话保持」裁定，
    //   原「会话保持」断言按新口径反转为强制登出断言，属裁定驱动合法更新）
    let b5ok = false;
    await fillPwForm(PWD, NEW_PWD, NEW_PWD);
    await page.click('#ucPwSubmitBtn');
    try {
      await page.waitForFunction(() => [...document.querySelectorAll('#toastContainer .toast')].some(t => t.textContent.includes('密码已修改，请重新登录')), undefined, { timeout: 20000 });
      b5ok = true;
    } catch (e) {
      const diag = await page.evaluate(() => ({
        hint: document.getElementById('ucPwHint').textContent,
        btnDisabled: document.getElementById('ucPwSubmitBtn').disabled,
        toasts: [...document.querySelectorAll('#toastContainer .toast')].map(t => t.textContent),
      }));
      console.log('  [B5 阻塞] ' + JSON.stringify(diag));
    }
    if (b5ok) {
      const b5 = await page.evaluate(() => ({
        cur: document.getElementById('ucPwCurrent').value,
        nw: document.getElementById('ucPwNew').value,
        cf: document.getElementById('ucPwConfirm').value,
      }));
      check('B5 修改成功 → toast「密码已修改，请重新登录」+ 三字段清空', b5.cur === '' && b5.nw === '' && b5.cf === '', JSON.stringify(b5));
      // REQ-096：旧会话即刻失效——等强制登出落地（toast 出现≠signOut 完成，先等终态再断言）
      await page.waitForFunction(() => {
        const ov = getComputedStyle(document.getElementById('authOverlay')).display !== 'none';
        const loginVisible = document.getElementById('authLoginForm').style.display !== 'none';
        const notice = document.getElementById('authError').textContent.includes('密码已修改，请重新登录');
        return ov && loginVisible && notice;
      }, undefined, { timeout: 10000 });
      const b5b = await page.evaluate(async () => ({
        token: !!(await window.CloudSync.getAccessToken()),
        modalClosed: !document.getElementById('userCenterModal').classList.contains('show'),
      }));
      check('B5 REQ-096 强制登出（回登录页+登录页提示+token 清空+弹窗已关）',
        !b5b.token && b5b.modalClosed, JSON.stringify(b5b));
      await page.screenshot({ path: path.join(SHOT_DIR, 'uc-changepw-relogin.png') });
    } else {
      check('B5 修改成功 → toast「密码已修改，请重新登录」+ 三字段清空', false,
        '改密主链路阻塞（见上方 [B5 阻塞] 诊断）');
      check('B5 REQ-096 强制登出（回登录页+登录页提示+token 清空+弹窗已关）', false, '依赖 B5，同阻塞');
    }

    // B6 旧密码登录失败 → 新密码登录成功（REQ-096：B5 已强制登出并落在登录表单，无需手动 logout）
    if (b5ok) {
      await page.waitForSelector('#authEmail', { state: 'visible', timeout: 15000 });
      await page.fill('#authEmail', EMAIL);
      await page.fill('#authPassword', PWD); // 旧密码
      await page.click('#authLoginBtn');
      await page.waitForFunction(() => document.getElementById('authError').textContent.trim().length > 0, undefined, { timeout: 15000 });
      const oldErr = await page.evaluate(() => document.getElementById('authError').textContent.trim());
      check('B6 旧密码登录失败（有错误提示）', oldErr.length > 0 && !oldErr.includes('密码已修改'), `authError=${oldErr}`);
      await page.fill('#authEmail', EMAIL);
      await page.fill('#authPassword', NEW_PWD); // 新密码
      await page.click('#authLoginBtn');
      await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
      await sleep(2500);
      check('B6 新密码登录成功（进应用）', true, 'dashboard 可见');
    } else {
      check('B6 旧密码登录失败（有错误提示）', false, '依赖 B5，同阻塞');
      check('B6 新密码登录成功（进应用）', false, '依赖 B5，同阻塞');
    }

    // ==================== C. 玩家ID（tag_num 列存在才跑） ====================
    if (!tagNumMigrated) {
      const reason = 'tag_num 列未迁移（sql/25 待运营执行）';
      console.log(`\n⊘⊘⊘ SKIP：${reason} —— C 组玩家ID 断言整组跳过，迁移执行后复跑本脚本兜底 ⊘⊘⊘`);
      ['C1 tag_num 分配', 'C2 玩家ID卡', 'C3 复制', 'C4 头像菜单头', 'C5 改名跟随', 'C6 碰撞重试', 'C7 防误关'].forEach(n => skip(n, reason));
    } else {
      // C1 注册后轮询 tag_num（ensureTagNum 登录 fire-and-forget，至多 10s）
      let tag = null;
      for (let i = 0; i < 20; i++) {
        const r = await svc('GET', `/rest/v1/user_profiles?select=tag_num&user_id=eq.${uid1}`);
        tag = Array.isArray(r.body) && r.body[0] ? r.body[0].tag_num : null;
        if (tag) break;
        await sleep(500);
      }
      check('C1 注册后 tag_num 已分配且 10000-99999', Number.isInteger(tag) && tag >= 10000 && tag <= 99999, `tag=${tag}`);

      // C2 用户中心顶部卡片
      await page.evaluate(async () => { await openUserCenter(); });
      await sleep(800);
      const cardText = await page.evaluate(() => document.getElementById('ucPlayerIdText').textContent);
      check('C2 玩家ID卡文本 === 昵称#tag', cardText === `${NICK}#${tag}`, `card=${cardText}`);

      // C3 复制按钮 → toast 含「已复制」（clipboard 失败走回退，断言 toast）
      await page.click('.uc-playerid-copy');
      await page.waitForFunction(() => [...document.querySelectorAll('#toastContainer .toast')].some(t => t.textContent.includes('已复制')), undefined, { timeout: 8000 });
      check('C3 复制玩家ID → toast 含「已复制」', true, `toast 已复制 ${NICK}#${tag}`);

      // C4 头像菜单：展开前后 trigger 高度不变 + 头部 昵称/玩家ID（先关用户中心弹窗，避免遮罩拦截点击）
      await page.evaluate(() => closeModal('userCenterModal'));
      await sleep(400);
      const h0 = await page.evaluate(() => document.getElementById('userMenuTrigger').offsetHeight);
      await page.click('#userMenuTrigger');
      await sleep(400);
      const menu = await page.evaluate(() => ({
        h: document.getElementById('userMenuTrigger').offsetHeight,
        ddVisible: document.getElementById('userMenuDropdown').style.display === 'block',
        headVisible: getComputedStyle(document.getElementById('userMenuHead')).display !== 'none',
        name: document.getElementById('userMenuHeadName').textContent,
        pid: document.getElementById('userMenuHeadId').textContent,
      }));
      check('C4 头像菜单头：昵称+玩家ID 正确且 trigger 高度展开前后不变',
        menu.ddVisible && menu.headVisible && menu.name === NICK && menu.pid === `${NICK}#${tag}` && menu.h === h0,
        `name=${menu.name} pid=${menu.pid} h=${h0}→${menu.h}`);
      await page.screenshot({ path: path.join(SHOT_DIR, 'avatar-menu.png') });
      await page.evaluate(() => userMenuClose());

      // C5 改名：数字段不变、名字部分跟随——卡片 + 菜单头 + topbar 昵称
      // （BUG-072，2026-08-11 验收修复小包：保存链路内即时刷新全部显示点，不再需手动 loadUserProfile/重进用户中心）
      await page.evaluate(async () => { await openUserCenter(); switchUserTab('profile'); });
      await sleep(600);
      await page.fill('#ucDisplayName', 'T29新名');
      await page.click('button[onclick="saveUserProfile()"]');
      await sleep(2000); // alert 由 dialog 监听自动 accept；BUG-072 修复后保存即刷卡片/菜单头/topbar
      const c5 = await page.evaluate(() => ({
        card: document.getElementById('ucPlayerIdText').textContent,
        menuPid: document.getElementById('userMenuHeadId').textContent,
        menuName: document.getElementById('userMenuHeadName').textContent,
        topbar: document.getElementById('userNickname').textContent,
        input: document.getElementById('ucDisplayName').value,
      }));
      check('C5 改名「T29新名」：卡片/菜单头/topbar/输入框即时跟随（BUG-072）、数字段不变',
        c5.card === `T29新名#${tag}` && c5.menuPid === `T29新名#${tag}` && c5.menuName === 'T29新名' && c5.topbar === 'T29新名' && c5.input === 'T29新名', JSON.stringify(c5));
      await page.evaluate(() => { snapshotModalForm('userCenterModal'); closeModal('userCenterModal'); });
      await sleep(300);

      // C6 碰撞重试：占位账号占用 55555 → 本账号 tag 置空 → stub Math.random 首中占用号 → 重试成功
      let res2 = await fetch(`${SB}/auth/v1/signup`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL2, password: PWD, data: { display_name: 'T29A占位' } }) });
      let body2 = await res2.json();
      if (!body2.access_token) {
        res2 = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL2, password: PWD }) });
        body2 = await res2.json();
      }
      uid2 = body2.user.id;
      const occupied = tag === 55555 ? 55556 : 55555;
      const occ = await svc('POST', '/rest/v1/user_profiles', { user_id: uid2, display_name: 'T29A占位', tag_num: occupied });
      if (occ.status !== 201) throw new Error('占位 tag 写入失败: ' + JSON.stringify(occ.body));
      await svc('PATCH', `/rest/v1/user_profiles?user_id=eq.${uid1}`, { tag_num: null });
      const newTag = await page.evaluate(async (occTag) => {
        const orig = Math.random;
        let first = true;
        Math.random = () => { if (first) { first = false; return (occTag - 10000) / 90000; } return orig(); };
        try { return await window.CloudSync.ensureTagNum(); }
        finally { Math.random = orig; } // stub 即时恢复
      }, occupied);
      const rr = await svc('GET', `/rest/v1/user_profiles?select=tag_num&user_id=eq.${uid1}`);
      const dbTag = Array.isArray(rr.body) && rr.body[0] ? rr.body[0].tag_num : null;
      check('C6 碰撞重试：首候选撞占用号（23505）→ 重试分配 ≠占用号 且在范围并落库',
        Number.isInteger(newTag) && newTag !== occupied && newTag >= 10000 && newTag <= 99999 && dbTag === newTag,
        `占用=${occupied} 新=${newTag} 库=${dbTag}`);
      tag = newTag;

      // C7 防误关：未改动直接关 → 无 confirm；改显示名一字再遮罩关 → confirm 出现（接受）
      const confirmBefore = confirmCount;
      await page.evaluate(async () => { await openUserCenter(); });
      await sleep(600);
      await page.click('#userCenterModal', { position: { x: 8, y: 8 } });
      await sleep(500);
      const closedClean = await page.evaluate(() => !document.getElementById('userCenterModal').classList.contains('show'));
      check('C7 防误关：未改动遮罩关闭 → 无 confirm 弹窗且已关闭', closedClean && confirmCount === confirmBefore, `closed=${closedClean} confirm=${confirmCount - confirmBefore}`);
      await page.evaluate(async () => { await openUserCenter(); });
      await sleep(600);
      await page.fill('#ucDisplayName', 'T29新名X');
      await page.click('#userCenterModal', { position: { x: 8, y: 8 } });
      await sleep(500);
      const closedDirty = await page.evaluate(() => !document.getElementById('userCenterModal').classList.contains('show'));
      check('C7 防误关：改动后遮罩关闭 → confirm 出现（接受后关闭）', closedDirty && confirmCount === confirmBefore + 1, `closed=${closedDirty} confirm=${confirmCount - confirmBefore}`);
    }

    // 400/401=错误凭证探测噪音、406=既有噪音、409=C6 碰撞重试故意制造的 tag_num 唯一冲突（23505 重试路径的必然产物）；
    // 「校验当前密码失败」=cloud.js config ReferenceError 业务 bug（已修复，保留过滤防回潮，B5 会单列 FAIL）
    const realErrors = pageErrors.filter(e => !/status of (400|401|406|409)/.test(e) && !e.includes('校验当前密码失败'));
    check('全程零 JS 报错（400/401=错误凭证探测、406=既有噪音、409=C6 故意碰撞重试，均已排除）', realErrors.length === 0, realErrors.join(' | ') || '无');
    await ctx.close();
  } finally {
    await browser.close();
  }

  await cleanup();

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#29 WP1 验证: ${passed}/${results.length} 通过，SKIP ${skips.length} 项，截图 → ${SHOT_DIR} =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
