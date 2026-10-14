// 任务书 #72-补丁验证：团本速览看板首领中文映射 + 难度列（降级态）+ 版本串 .93
// A 静态锚点：WCL_BOSS_NAMES 20 项 eval 逐键值核对（含单引号/逗号键）、getBossName 回退、
//    WCL_DIFFICULTY 映射、看板渲染挂钩（中文名+难度列条件渲染）、版本串三壳 .93、changelog/台账、node --check。
// B 浏览器实测（自起 server :15671，真实 WCL 链路）：
//    B1 真实公开报告（RXYfr6gtCMbhFdc7，VS/DR/MQD）挂测试公会活动 → 活动详情看板渲染：
//       首领名全中文（字典内英文原名绝迹）、难度列降级不渲染（server.js 未下发 difficulty，表头仍 4 列）；
//    B2 getBossName 兜底（未收录回退英文）+ getDifficultyText 五档+未知；
//    B3 全程零 TypeError / console 零报错。
// C 清零：测试活动/公会/账号删除复核。
// 用法: node scripts/verify-task72-patch.js
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 15671;
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = 't72p-exp@example.com';
const PWD = 'T72p-Exp-2026!';
const GUILD_NAME = 'T72P测试会';
const REPORT_CODE = 'RXYfr6gtCMbhFdc7'; // 运营公会真实公开报告（VS/DR/MQD），侦察实测在场
const VER = '20261014.93';

const EXPECTED = {
  'Imperator Averzian': '元首阿福扎恩',
  'Vorasius': '弗拉希乌斯',
  'Fallen-King Salhadaar': '陨落之王萨哈达尔',
  'Vaelgor & Ezzorak': '威厄高尔和艾佐拉克',
  'Lightblinded Vanguard': '光盲先锋军',
  'Crown of the Cosmos': '宇宙之冕',
  'Chimaerus, the Undreamt God': '奇美鲁斯，未梦之神',
  'Belo\'ren, Child of Al\'ar': '贝洛朗，奥的子嗣',
  'Midnight Falls': '至暗之夜降临',
  'Rotmire': '腐沼',
  'Nek\'zali the Soulcoiler': '盘魂者内克扎莉',
  'Entombed Sentinels': '陵寝哨兵',
  'Vashnik the Malignant': '万毒邪祟者瓦什尼克',
  'The Lost Explorers': '迷失的探险者',
  'Sszorak': '斯索拉克',
  'The Twin Fangs': '双子毒牙',
  'The Coiled Altar': '盘卷祭坛',
  'Ula\'tek': '乌拉特克',
  'Nymrissa Wavecaller': '尼姆瑞莎·唤波者',
  'Kith\'ix': '基希克斯',
};

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const SVC = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `（${detail}）` : ''}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

async function svcRest(method, restPath, body) {
  const res = await fetch(`${SB}${restPath}`, {
    method, headers: { ...SVC, Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

// WCL 直连（侦察/基准用）
async function wclToken() {
  const t = await fetch('https://www.warcraftlogs.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${encodeURIComponent(env.WCL_CLIENT_ID)}&client_secret=${encodeURIComponent(env.WCL_CLIENT_SECRET)}`,
  });
  return (await t.json()).access_token;
}
async function wclGql(token, query, variables) {
  const r = await fetch('https://www.warcraftlogs.com/api/v2/client', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  return r.json();
}

let serverProc = null;
async function startServer() {
  serverProc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DEPLOY_RUN_PORT: String(PORT) },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) return; } catch { /* 未起 */ }
    await sleep(200);
  }
  throw new Error('server.js 启动超时');
}

// ==================== A 静态锚点 ====================
function staticAsserts() {
  console.log('== A. 静态锚点 ==');
  const app = read('js/app.js');

  check('A1a WCL_BOSS_NAMES 常量 + getBossName 回退函数在场',
    /const WCL_BOSS_NAMES = \{/.test(app) &&
    /function getBossName\(enName\) \{\s*return WCL_BOSS_NAMES\[enName\] \|\| enName;/.test(app), '');
  const block = app.match(/const WCL_BOSS_NAMES = \{[\s\S]*?\n\};/);
  let mapOk = false, mapDetail = '';
  if (block) {
    const MAP = eval('(' + block[0].replace(/^const WCL_BOSS_NAMES = /, '').replace(/;$/, '') + ')');
    const keys = Object.keys(MAP);
    const missing = Object.keys(EXPECTED).filter(k => !(k in MAP));
    const wrong = Object.keys(EXPECTED).filter(k => MAP[k] !== EXPECTED[k]).map(k => `${k}=${MAP[k]}`);
    const extra = keys.filter(k => !(k in EXPECTED));
    mapOk = keys.length === 20 && missing.length === 0 && wrong.length === 0 && extra.length === 0;
    mapDetail = `n=${keys.length}${missing.length ? ' 缺=' + missing.join('|') : ''}${wrong.length ? ' 错=' + wrong.join('|') : ''}${extra.length ? ' 多=' + extra.join('|') : ''}`;
  }
  check('A1b 字典恰 20 项、键值与实测证据链逐一相等（含特殊字符键精确匹配）', !!block && mapOk, mapDetail);
  check('A1c 通知示例错值「缚魂者奈克扎里」未入典（官方译名=盘魂者内克扎莉，EJ 实证）',
    !app.includes('缚魂者奈克扎里') && app.includes("'Nek\\'zali the Soulcoiler': '盘魂者内克扎莉'"), '');

  check('A2 WCL_DIFFICULTY 映射 + getDifficultyText 未知兜底',
    /const WCL_DIFFICULTY = \{ 1: '随机', 2: '普通', 3: '普通', 4: '英雄', 5: '史诗' \}/.test(app) &&
    /return WCL_DIFFICULTY\[difficultyId\] \|\| '未知';/.test(app), '');

  check('A3a 看板首领名走 getBossName 映射',
    /<td>\$\{wcl70Esc\(getBossName\(b\.name\)\)\}<\/td>/.test(app), '');
  check('A3b 难度列数据在场才渲染（hasDifficulty 门）+ 聚合键含难度（混难度报告不合并）',
    /const hasDifficulty = \(data\.fights \|\| \[\]\)\.some\(f => typeof f\.difficulty === 'number'\);/.test(app) &&
    /`\$\{f\.name\}\|\$\{f\.difficulty \|\| 0\}`/.test(app) &&
    /\$\{hasDifficulty \? `<td>\$\{getDifficultyText\(b\.difficulty\)\}<\/td>` : ''\}/.test(app) &&
    /\$\{hasDifficulty \? '<th style="padding:4px">难度<\/th>' : ''\}/.test(app), '');
  check('A3c server.js 零改动（红线）：WCL_REPORT_FIGHTS_QUERY 未加 difficulty（难度列待裁定激活）',
    /fights \{ encounterID name kill fightPercentage startTime endTime \}/.test(read('server.js')), '');

  const cnt = (f, s) => (read(f).match(new RegExp(s.replace(/\./g, '\\.'), 'g')) || []).length;
  check('A4a 版本串 ' + VER + ' 三壳递增（index 15 / data 8 / decor 5）',
    cnt('index.html', VER) === 15 && cnt('data.html', VER) === 8 && cnt('decor.html', VER) === 5,
    `index=${cnt('index.html', VER)} data=${cnt('data.html', VER)} decor=${cnt('decor.html', VER)}`);
  check('A4b 旧串 20261014.92 三壳零残留',
    cnt('index.html', '20261014.92') === 0 && cnt('data.html', '20261014.92') === 0 && cnt('decor.html', '20261014.92') === 0, '');

  check('A5 changelog 补录（v3.2.0-task72-patch-boss-zh）+ 台账 REQ-161 登记',
    app.includes("id: 'v3.2.0-task72-patch-boss-zh'") && /\| REQ-161 \|/.test(read('docs/问题与需求清单.md')), '');

  const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f).concat(['server.js']);
  let allOk = true, bad = '';
  for (const f of jsFiles) {
    const r = spawnSync(process.execPath, ['--check', f], { cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) { allOk = false; bad = f; }
  }
  check('A6 node --check 全量通过（js/ 全部 + server.js）', allOk, bad);
}

// ==================== B 浏览器实测 ====================
let testUid = null, guildId = null, activityId = null;

async function ensureTestUser() {
  const list = await svcRest('GET', '/auth/v1/admin/users?page=1&per_page=500');
  const users = (list.body && (list.body.users || list.body)) || [];
  const hit = Array.isArray(users) ? users.find(u => (u.email || '').toLowerCase() === EMAIL) : null;
  if (hit) return hit.id;
  const c = await svcRest('POST', '/auth/v1/admin/users', { email: EMAIL, password: PWD, email_confirm: true, user_metadata: { display_name: 't72p-exp' } });
  return c.body && c.body.id;
}

async function liveAsserts() {
  console.log('== B. 浏览器实测 ==');
  // B-前置①：WCL 直连拉该报告真实首领名单（期望基准）
  const token = await wclToken();
  const rep = await wclGql(token, 'query($c:String!){ reportData { report(code:$c) { fights { encounterID name kill } } } }', { c: REPORT_CODE });
  const bossEn = [...new Set((rep.data.reportData.report.fights || []).filter(f => f.encounterID > 0).map(f => f.name))];
  const mapped = bossEn.filter(n => EXPECTED[n]);
  check('B-前置① WCL 实测报告首领名单 ' + bossEn.length + ' 个，字典覆盖 ' + mapped.length + ' 个',
    bossEn.length > 0 && mapped.length === bossEn.length, bossEn.join(' | ').slice(0, 300));

  testUid = await ensureTestUser();
  if (!testUid) { check('B-前置② 测试账号就位', false); return; }
  const oldG = await svcRest('GET', `/rest/v1/guilds?name=eq.${encodeURIComponent(GUILD_NAME)}&select=id`);
  for (const g of (Array.isArray(oldG.body) ? oldG.body : [])) {
    await svcRest('DELETE', `/rest/v1/activities?guild_id=eq.${g.id}`);
    await svcRest('DELETE', `/rest/v1/guild_members?guild_id=eq.${g.id}`);
    await svcRest('DELETE', `/rest/v1/guilds?id=eq.${g.id}`);
  }
  const g = await svcRest('POST', '/rest/v1/guilds', { name: GUILD_NAME, owner_id: testUid, invite_code: 'T72PEXP1', server_name: '测试', server_region: '一区' });
  guildId = g.body && g.body[0] && g.body[0].id;
  await svcRest('POST', '/rest/v1/guild_members', [{ guild_id: guildId, user_id: testUid, role: 'owner', display_name: 't72p-exp' }]);
  const day = new Date().toISOString().slice(0, 10);
  const act = await svcRest('POST', '/rest/v1/activities', {
    guild_id: guildId, name: 'T72P看板测试', activity_date: day, raid: 'VS / DR / MQD',
    wcl_url: `https://www.warcraftlogs.com/reports/${REPORT_CODE}`, wcl_report_code: REPORT_CODE, status: 'normal',
  });
  activityId = act.body && act.body[0] && act.body[0].id;
  check('B-前置② 测试公会+挂真实报告的活动就位', !!guildId && !!activityId, `activity=${activityId}`);

  await startServer();
  console.log('--- 服务器已起（端口 ' + PORT + '） ---');

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const pg = await ctx.newPage();
  const errs = [], typeErrors = [], whitelist = [];
  pg.on('pageerror', e => {
    errs.push('pageerror: ' + e.message);
    if (e instanceof TypeError || /TypeError/.test(String(e && e.name))) typeErrors.push(`${e.message}\n${e.stack || ''}`);
  });
  pg.on('console', m => {
    if (m.type() !== 'error') return;
    errs.push('console: ' + m.text());
    if (/TypeError/.test(m.text())) typeErrors.push('console: ' + m.text());
  });
  pg.on('response', r => {
    if (r.status() >= 400) {
      const u = r.url();
      if (/assets\/icons\/items\//.test(u)) { whitelist.push(u); return; }
      if (r.status() === 409 && /user_profiles/.test(u)) { whitelist.push(u); return; }
      if (r.status() === 404 && /tier_set_pieces/.test(u)) { whitelist.push(u); return; }
      errs.push(`http${r.status()} ${r.request().method()} ${u}`);
    }
  });

  await pg.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await pg.waitForSelector('#iaLoginBtn', { state: 'visible', timeout: 15000 });
  await pg.click('#iaLoginBtn');
  await pg.fill('#authEmail', EMAIL);
  await pg.fill('#authPassword', PWD);
  await pg.click('#authLoginBtn');
  await pg.waitForURL('**/index.html#/home', { timeout: 30000 });
  check('B-前置③ 登录成功落 #/home', true, '');

  // B1 打开活动详情 → 看板渲染（真实 WCL 链路：server.js → WCL API → 前端聚合渲染）
  await pg.goto(`${BASE}/index.html#/team/attendance`, { waitUntil: 'load' });
  await pg.waitForFunction(() => window.appData && (appData.activities || []).length > 0, { timeout: 30000 });
  await pg.evaluate(id => openAttendanceDetail(id), activityId);
  await pg.waitForFunction(() => {
    const b = document.getElementById('wclRaidBoard');
    return b && b.style.display !== 'none' && b.querySelector('table tbody tr');
  }, { timeout: 30000 });
  const b1 = await pg.evaluate(() => {
    const b = document.getElementById('wclRaidBoard');
    return {
      headers: [...b.querySelectorAll('thead th')].map(h => h.textContent.trim()),
      bossCells: [...b.querySelectorAll('tbody tr')].map(tr => tr.querySelector('td').textContent.trim()),
      text: b.textContent,
    };
  });
  check('B1a 看板渲染成功（真实 WCL 报告 ' + REPORT_CODE + '）', b1.bossCells.length > 0, `行数=${b1.bossCells.length}`);
  const cnShown = b1.bossCells.filter(n => Object.values(EXPECTED).includes(n));
  const enLeak = b1.bossCells.filter(n => n in EXPECTED);
  check('B1b 首领名全中文：字典内英文原名零残留',
    cnShown.length === b1.bossCells.length && enLeak.length === 0 && cnShown.length === bossEn.length,
    `中文行=${cnShown.length}/${b1.bossCells.length} 英文残留=${enLeak.join('|') || '无'} 样本=${b1.bossCells.slice(0, 3).join('/')}`);
  check('B1c 难度列降级：server.js 未下发 difficulty → 表头维持 4 列（首领/击杀/尝试/最佳进度）零回归',
    b1.headers.join('/') === '首领/击杀/尝试/最佳进度', b1.headers.join('/'));

  // B2 映射函数单元态（页面上下文直调）
  const b2 = await pg.evaluate(() => ({
    fallback: getBossName('Some Unknown Boss'),
    mapped: getBossName("Nek'zali the Soulcoiler"),
    d1: getDifficultyText(1), d3: getDifficultyText(3), d4: getDifficultyText(4), d5: getDifficultyText(5),
    dUnknown: getDifficultyText(9), dNull: getDifficultyText(null),
  }));
  check('B2 getBossName 兜底回退英文 + getDifficultyText 五档+未知',
    b2.fallback === 'Some Unknown Boss' && b2.mapped === '盘魂者内克扎莉' &&
    b2.d1 === '随机' && b2.d3 === '普通' && b2.d4 === '英雄' && b2.d5 === '史诗' &&
    b2.dUnknown === '未知' && b2.dNull === '未知', JSON.stringify(b2));

  // B3 全程 console 零报错
  check('B3a 全程零 TypeError', typeErrors.length === 0, typeErrors.slice(0, 2).join(' | ').slice(0, 300));
  let budget = whitelist.length;
  const real = errs.filter(e => {
    if (budget > 0 && e.startsWith('console: Failed to load resource: the server responded with a status of 4')) { budget--; return false; }
    return true;
  });
  check('B3b 全程 console 零报错（白名单：图标素材 404/409 设计内/tier_set_pieces 404）',
    real.length === 0, real.slice(0, 3).join(' | ').slice(0, 300));

  await browser.close();
}

// ==================== C 清零 ====================
async function cleanup() {
  console.log('== C. 清零 ==');
  if (guildId) {
    await svcRest('DELETE', `/rest/v1/activities?guild_id=eq.${guildId}`);
    await svcRest('DELETE', `/rest/v1/guild_members?guild_id=eq.${guildId}`);
    await svcRest('DELETE', `/rest/v1/guilds?id=eq.${guildId}`);
  }
  if (testUid) await svcRest('DELETE', `/auth/v1/admin/users/${testUid}`);
  const a = guildId ? await svcRest('GET', `/rest/v1/activities?guild_id=eq.${guildId}&select=id`) : { body: [] };
  const g = await svcRest('GET', `/rest/v1/guilds?name=eq.${encodeURIComponent(GUILD_NAME)}&select=id`);
  const u = await svcRest('GET', '/auth/v1/admin/users?page=1&per_page=500');
  const users = Array.isArray((u.body && (u.body.users || u.body)) || []) ? (u.body.users || u.body) : [];
  check('C1 测试活动/公会/账号清零复核',
    (!Array.isArray(a.body) || a.body.length === 0) &&
    (!Array.isArray(g.body) || g.body.length === 0) &&
    !users.some(x => (x.email || '').toLowerCase() === EMAIL),
    `activities=${Array.isArray(a.body) ? a.body.length : '?'} guilds=${Array.isArray(g.body) ? g.body.length : '?'}`);
}

(async () => {
  staticAsserts();
  try {
    await liveAsserts();
  } catch (e) {
    check('B 浏览器实测执行', false, e.message);
  } finally {
    if (serverProc) serverProc.kill();
    await cleanup();
  }
  const fails = results.filter(r => !r.ok);
  console.log(`\n===== 结果：${results.length - fails.length}/${results.length} 通过 =====`);
  process.exit(fails.length ? 1 : 0);
})();
