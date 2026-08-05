// 任务书 #24-补丁 验证脚本：添加角色体验修正（①英雄榜解析 ②弹窗不透明 ③联动/清空/toast）
// 用法：node scripts/verify-task24-patch.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(__dirname, '..', '.s6-ssh', 'node_modules', 'playwright-core'))); }

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-05-task24-patch');
const PORT = 15654;
const BASE = `http://localhost:${PORT}`;
const PWD = 'T24p-2026!';
const EMAIL = 't24p-verify@wowbutler.cn';

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const ANON = env.SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const SVC = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function svc(method, restPath, body) {
  const res = await fetch(`${SB}${restPath}`, { method, headers: SVC, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text(); try { return { status: res.status, body: JSON.parse(t) }; } catch { return { status: res.status, body: t }; }
}

let serverProc = null, owner = null, guildId = null;
let pass = 0, fail = 0;
const fails = [];
function assert(cond, label, detail) {
  if (cond) { pass++; console.log(`  ✔ ${label}`); }
  else { fail++; fails.push(label); console.log(`  ✘ ${label}${detail ? ' — ' + detail : ''}`); }
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  let res = await fetch(`${SB}/auth/v1/signup`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PWD, data: { display_name: 'T24P验证' } }) });
  let body = await res.json();
  if (!body.access_token) {
    res = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PWD }) });
    body = await res.json();
  }
  owner = { uid: body.user.id };
  const g = await svc('POST', '/rest/v1/guilds', { name: 'T24P验证会', owner_id: owner.uid, invite_code: 'T24P' + Date.now().toString(36).slice(-4).toUpperCase() });
  guildId = g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', { guild_id: guildId, user_id: owner.uid, role: 'owner', display_name: 'T24P验证' });

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {} await sleep(500); }

  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const dialogs = [];
  page.on('dialog', async d => { dialogs.push(d.message); await d.dismiss(); });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#authEmail', { timeout: 20000 });
  await page.fill('#authEmail', EMAIL);
  await page.fill('#authPassword', PWD);
  await page.click('#authLoginBtn');
  await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
  await sleep(2500);

  async function openAddModal() {
    await page.evaluate(() => { openUserCenter(); });
    await sleep(500);
    await page.evaluate(() => { switchUserTab('characters'); });
    await sleep(500);
    await page.evaluate(() => { openAddCharacterModal(); });
    await sleep(400);
  }
  async function pasteUrl(url) {
    await page.fill('#charArmoryUrl', url);
    await page.dispatchEvent('#charArmoryUrl', 'input');
    await sleep(350);
  }
  async function fieldState() {
    return page.evaluate(() => ({
      name: document.getElementById('charName').value,
      server: document.getElementById('charServer').value,
      region: document.getElementById('charRegion').value,
    }));
  }
  async function lastToast() {
    return page.evaluate(() => {
      const ts = [...document.querySelectorAll('#toastContainer .toast')];
      return ts.length ? { text: ts[ts.length - 1].textContent, cls: ts[ts.length - 1].className } : null;
    });
  }

  // ================= 修正项① =================
  console.log('—— 修正项①：英雄榜链接解析 ——');
  await openAddModal();

  // 防回归断言：弹窗打开后函数可调
  const guard = await page.evaluate(() => {
    try { const t = typeof parseArmoryUrlInput; parseArmoryUrlInput(); return { t, ok: true }; }
    catch (e) { return { t: typeof parseArmoryUrlInput, ok: false, err: e.message }; }
  });
  assert(guard.t === 'function' && guard.ok, '防回归：弹窗打开后 parseArmoryUrlInput 可调', JSON.stringify(guard));

  // 格式1：hash 形式 + slug 映射
  await pasteUrl('https://wow.blizzard.cn/character/#/the-golden-plains/小时候挺聪明');
  let st = await fieldState();
  let toast = await lastToast();
  assert(st.name === '小时候挺聪明' && st.server === '金色平原' && st.region === 'CN',
    '格式1 hash：角色名+slug映射金色平原+region CN', JSON.stringify(st));
  assert(toast && toast.text.includes('已解析：小时候挺聪明 · 金色平原'), '格式1 toast「已解析」', JSON.stringify(toast));
  const flashOn = await page.evaluate(() => document.getElementById('charName').classList.contains('uc-flash'));
  assert(flashOn, '格式1 解析成功字段短暂高亮（uc-flash）');

  // 格式2：character-profile/服务器/角色名
  await pasteUrl('https://wow.blizzard.cn/character-profile/silver-hand/测试角色甲');
  st = await fieldState();
  assert(st.name === '测试角色甲' && st.server === '白银之手', '格式2 profile：slug映射白银之手', JSON.stringify(st));

  // 格式3：character-profile/cn/服务器/角色名
  await pasteUrl('https://wow.blizzard.cn/character-profile/cn/deathwing/测试角色乙');
  st = await fieldState();
  assert(st.name === '测试角色乙' && st.server === '死亡之翼' && st.region === 'CN', '格式3 带cn段：slug映射死亡之翼', JSON.stringify(st));

  // 未识别 URL
  await pasteUrl('https://example.com/some/unknown/page');
  toast = await lastToast();
  assert(toast && toast.text === '未识别链接格式，请手动输入', '未识别链接 toast 提示', JSON.stringify(toast));

  // 未知 slug：保留原值 + 提示可手改
  await pasteUrl('https://wow.blizzard.cn/character/#/some-unknown-realm/测试角色丙');
  st = await fieldState();
  toast = await lastToast();
  assert(st.server === 'some-unknown-realm', '未知 slug 保留原值', JSON.stringify(st));
  assert(toast && toast.text.includes('已解析') && toast.text.includes('未收录') && toast.text.includes('手动核对'), '未知 slug toast 提示可手改', JSON.stringify(toast));

  await page.screenshot({ path: path.join(SHOT_DIR, '01-parse-toast.png') });
  await page.evaluate(() => closeModal('addCharacterModal'));
  await sleep(300);

  // ================= 修正项② =================
  console.log('—— 修正项②：弹窗不透明 ——');
  await openAddModal();
  const opaque = await page.evaluate(() => {
    const mc = document.querySelector('#addCharacterModal .modal-content');
    const cs = getComputedStyle(mc);
    return { bg: cs.backgroundColor, border: cs.borderTopWidth, radius: cs.borderTopLeftRadius, maxW: cs.maxWidth };
  });
  assert(opaque.bg !== 'rgba(0, 0, 0, 0)' && opaque.bg !== 'transparent', 'addCharacterModal 背景不透明', opaque.bg);
  assert(parseFloat(opaque.border) >= 1, 'addCharacterModal 有描边', opaque.border);
  await page.screenshot({ path: path.join(SHOT_DIR, '02-modal-opaque-1366x768.png') });

  // 用户中心主弹窗族排查：依然不透明且 max-width 700 未被 .modal-content 560 覆盖
  const ucOpaque = await page.evaluate(() => {
    const mc = document.querySelector('#userCenterModal .modal-content');
    const cs = getComputedStyle(mc);
    return { bg: cs.backgroundColor, maxW: cs.maxWidth };
  });
  assert(ucOpaque.bg !== 'rgba(0, 0, 0, 0)' && ucOpaque.maxW === '700px', 'userCenterModal 不受影响（不透明+700px）', JSON.stringify(ucOpaque));
  console.log('  [弹窗族排查] index.html 共 2 处 .modal-content：userCenterModal（正常）/ addCharacterModal（已修）');
  await page.evaluate(() => closeModal('addCharacterModal'));
  await sleep(300);

  // 1920×1080 档
  await page.setViewportSize({ width: 1920, height: 1080 });
  await sleep(400);
  await openAddModal();
  await page.screenshot({ path: path.join(SHOT_DIR, '03-modal-opaque-1920x1080.png') });
  const opaque2 = await page.evaluate(() => getComputedStyle(document.querySelector('#addCharacterModal .modal-content')).backgroundColor);
  assert(opaque2 !== 'rgba(0, 0, 0, 0)', '1920×1080 背景不透明', opaque2);

  // ================= 修正项③ =================
  console.log('—— 修正项③：联动/清空/toast ——');
  // 职业→专精联动
  await page.selectOption('#charClass', '战士');
  await sleep(300);
  const specOptsWarrior = await page.evaluate(() => [...document.querySelectorAll('#charSpecOptions option')].map(o => o.value));
  const expectWarrior = await page.evaluate(() => getGameSpecs('战士'));
  assert(JSON.stringify(specOptsWarrior) === JSON.stringify(expectWarrior) && specOptsWarrior.length > 0,
    '联动：战士→专精候选 = getGameSpecs(战士)', JSON.stringify(specOptsWarrior));

  await page.fill('#charSpec', specOptsWarrior[0] || '防护');
  await page.selectOption('#charClass', '法师');
  await sleep(300);
  const specOptsMage = await page.evaluate(() => [...document.querySelectorAll('#charSpecOptions option')].map(o => o.value));
  const expectMage = await page.evaluate(() => getGameSpecs('法师'));
  const specAfterSwitch = await page.evaluate(() => document.getElementById('charSpec').value);
  assert(JSON.stringify(specOptsMage) === JSON.stringify(expectMage) && specOptsMage.length > 0,
    '联动：法师→专精候选 = getGameSpecs(法师)', JSON.stringify(specOptsMage));
  assert(specAfterSwitch === '', '联动：换职业后旧专精自动清空', specAfterSwitch);
  await page.screenshot({ path: path.join(SHOT_DIR, '04-spec-linkage.png') });

  // 清空按钮
  await pasteUrl('https://wow.blizzard.cn/character/#/the-golden-plains/小时候挺聪明');
  const clearVisible = await page.evaluate(() => document.getElementById('charArmoryUrlClear').style.display !== 'none');
  assert(clearVisible, '清空钮：有内容时显示');
  await page.click('#charArmoryUrlClear');
  await sleep(200);
  const afterClear = await page.evaluate(() => ({
    v: document.getElementById('charArmoryUrl').value,
    d: document.getElementById('charArmoryUrlClear').style.display,
  }));
  assert(afterClear.v === '' && afterClear.d === 'none', '清空钮：点击后清空并隐藏', JSON.stringify(afterClear));
  await page.screenshot({ path: path.join(SHOT_DIR, '05-armory-clear.png') });

  // 保存校验 toast（字段为空）
  await page.evaluate(() => { document.getElementById('charName').value = ''; document.getElementById('charServer').value = ''; });
  await page.evaluate(() => saveCharacter());
  await sleep(400);
  toast = await lastToast();
  assert(toast && toast.text === '请填写角色名称和服务器', '校验 toast：必填提示', JSON.stringify(toast));
  assert(dialogs.length === 0, '校验不再使用原生 alert', dialogs.join(';'));
  await page.screenshot({ path: path.join(SHOT_DIR, '06-save-validation-toast.png') });

  // 完整保存链路 + 查重 toast
  await pasteUrl('https://wow.blizzard.cn/character/#/the-golden-plains/小时候挺聪明');
  await page.selectOption('#charClass', '武僧');
  await sleep(300);
  await page.fill('#charSpec', '织雾');
  await page.evaluate(() => saveCharacter());
  await sleep(1200);
  const savedRow = await svc('GET', `/rest/v1/user_characters?user_id=eq.${owner.uid}&select=id,character_name,server_name,spec`);
  assert(savedRow.status === 200 && savedRow.body.length === 1 && savedRow.body[0].server_name === '金色平原' && savedRow.body[0].spec === '织雾',
    '保存链路：slug 中文名+联动专精入库', JSON.stringify(savedRow.body));
  await page.evaluate(() => switchUserTab('characters'));
  await sleep(600);
  await page.screenshot({ path: path.join(SHOT_DIR, '07-character-saved.png') });

  await openAddModal();
  await pasteUrl('https://wow.blizzard.cn/character-profile/silver-hand/测试角色甲');
  await page.evaluate(() => { document.getElementById('charServer').value = '金色平原'; document.getElementById('charName').value = '小时候挺聪明'; });
  await page.evaluate(() => saveCharacter());
  await sleep(600);
  toast = await lastToast();
  assert(toast && toast.text.includes('已存在同名角色'), '查重 toast：同服同名拦截', JSON.stringify(toast));
  assert(dialogs.length === 0, '查重不再使用原生 alert', dialogs.join(';'));

  await browser.close();

  // ================= 清理 + 复核 =================
  console.log('—— 测试数据清零 ——');
  await svc('DELETE', `/rest/v1/user_characters?user_id=eq.${owner.uid}`);
  await svc('DELETE', `/rest/v1/guild_members?guild_id=eq.${guildId}`);
  await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`);
  await fetch(`${SB}/auth/v1/admin/users/${owner.uid}`, { method: 'DELETE', headers: SVC });
  const chk1 = await svc('GET', `/rest/v1/user_characters?user_id=eq.${owner.uid}&select=id`);
  const chk2 = await svc('GET', `/rest/v1/guilds?id=eq.${guildId}&select=id`);
  const chk3 = await svc('GET', `/rest/v1/guild_members?guild_id=eq.${guildId}&select=id`);
  assert(chk1.body.length === 0 && chk2.body.length === 0 && chk3.body.length === 0, '测试数据清零复核（user_characters/guilds/guild_members 均为 0）');

  if (serverProc) serverProc.kill();
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  if (fail) { console.log('失败项：\n - ' + fails.join('\n - ')); process.exit(1); }
})().catch(async e => {
  console.error(e);
  try { if (owner) { await svc('DELETE', `/rest/v1/user_characters?user_id=eq.${owner.uid}`); await svc('DELETE', `/rest/v1/guild_members?guild_id=eq.${guildId}`); await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`); await fetch(`${SB}/auth/v1/admin/users/${owner.uid}`, { method: 'DELETE', headers: SVC }); } } catch {}
  if (serverProc) serverProc.kill();
  process.exit(1);
});
