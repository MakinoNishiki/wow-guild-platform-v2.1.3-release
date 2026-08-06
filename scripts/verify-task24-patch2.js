// 任务书 #24-补丁2 验证脚本：①专精标准下拉 ②插件导出 character.json 导入角色档案
// 用法：node scripts/verify-task24-patch2.js
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(__dirname, '..', '.s6-ssh', 'node_modules', 'playwright-core'))); }

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-06-task24-patch2');
const PORT = 15655;
const BASE = `http://localhost:${PORT}`;
const PWD = 'T24q-2026!';
const EMAIL = 't24q-verify@wowbutler.cn';

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

  // #26-WP2 样例：优先用转换器真实产物 scripts/wjdc/out/character.json；缺失时用同口径内容生成
  let samplePath = path.join(ROOT, 'scripts', 'wjdc', 'out', 'character.json');
  if (!fs.existsSync(samplePath)) {
    samplePath = path.join(SHOT_DIR, 'character.json');
    fs.writeFileSync(samplePath, JSON.stringify({
      character_name: '测试角色甲', server_name: '死亡之翼', server_region: 'CN',
      faction: '部落', race: '血精灵', class: '法师', spec: '奥术',
      level: 80, item_level: 248, guild_name: '星辰', armory_url: ''
    }, null, 2), 'utf8');
  }
  const badPath = path.join(SHOT_DIR, 'bad.json');
  fs.writeFileSync(badPath, '这不是 JSON 文件{{{', 'utf8');
  const badSpecPath = path.join(SHOT_DIR, 'bad-spec.json');
  fs.writeFileSync(badSpecPath, JSON.stringify({
    character_name: '测试角色乙', server_name: '白银之手', server_region: 'CN',
    faction: '联盟', race: '人类', class: '法师', spec: '不存在的专精',
    level: 70, item_level: 200, guild_name: '', armory_url: ''
  }), 'utf8');

  let res = await fetch(`${SB}/auth/v1/signup`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PWD, data: { display_name: 'T24Q验证' } }) });
  let body = await res.json();
  if (!body.access_token) {
    res = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PWD }) });
    body = await res.json();
  }
  owner = { uid: body.user.id };
  const g = await svc('POST', '/rest/v1/guilds', { name: 'T24Q验证会', owner_id: owner.uid, invite_code: 'T24Q' + Date.now().toString(36).slice(-4).toUpperCase() });
  guildId = g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', { guild_id: guildId, user_id: owner.uid, role: 'owner', display_name: 'T24Q验证' });

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
  async function lastToast() {
    return page.evaluate(() => {
      const ts = [...document.querySelectorAll('#toastContainer .toast')];
      return ts.length ? { text: ts[ts.length - 1].textContent, cls: ts[ts.length - 1].className } : null;
    });
  }
  async function formState() {
    return page.evaluate(() => ({
      armory: document.getElementById('charArmoryUrl').value,
      name: document.getElementById('charName').value,
      server: document.getElementById('charServer').value,
      region: document.getElementById('charRegion').value,
      faction: document.getElementById('charFaction').value,
      cls: document.getElementById('charClass').value,
      spec: document.getElementById('charSpec').value,
      level: document.getElementById('charLevel').value,
      ilvl: document.getElementById('charItemLevel').value,
      race: document.getElementById('charRace').value,
      guild: document.getElementById('charGuild').value,
    }));
  }
  async function specOptions() {
    return page.evaluate(() => [...document.querySelectorAll('#charSpec option')].map(o => o.value));
  }

  // ================= 修正项①：专精标准下拉 =================
  console.log('—— 修正项①：专精标准下拉 ——');
  await openAddModal();
  const init = await page.evaluate(() => {
    const el = document.getElementById('charSpec');
    return { tag: el.tagName, disabled: el.disabled, cls: el.className, opts: [...el.options].map(o => o.textContent) };
  });
  assert(init.tag === 'SELECT', '专精控件为 <select>（非 text+datalist）', init.tag);
  assert(init.disabled === true && init.opts[0] === '请先选择职业', '未选职业：禁用 + 占位「请先选择职业」', JSON.stringify(init));
  assert(init.cls.includes('uc-select'), '样式类 uc-select（与职业/区域下拉一致）', init.cls);
  const datalistGone = await page.evaluate(() => !document.getElementById('charSpecOptions'));
  assert(datalistGone, '原生 datalist 已移除');

  for (const cls of ['战士', '武僧', '唤魔师']) {
    await page.selectOption('#charClass', cls);
    await sleep(300);
    const opts = (await specOptions()).filter(v => v !== '');
    const expect = await page.evaluate(c => getGameSpecs(c), cls);
    assert(JSON.stringify(opts) === JSON.stringify(expect) && opts.length > 0,
      `${cls}：下拉 = getGameSpecs 全量专精（${opts.length} 项）`, JSON.stringify(opts));
  }
  // 换职业清空
  await page.selectOption('#charClass', '战士');
  await sleep(300);
  const firstSpec = await page.evaluate(() => getGameSpecs('战士')[0]);
  await page.selectOption('#charSpec', firstSpec);
  await page.selectOption('#charClass', '武僧');
  await sleep(300);
  const afterSwitch = await page.evaluate(() => ({
    v: document.getElementById('charSpec').value,
    placeholder: document.querySelector('#charSpec option').textContent,
  }));
  assert(afterSwitch.v === '', `换职业清空旧专精（原「${firstSpec}」）`, JSON.stringify(afterSwitch));
  await page.screenshot({ path: path.join(SHOT_DIR, '01-spec-select-1366x768.png') });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await sleep(400);
  await page.selectOption('#charClass', '唤魔师');
  await sleep(300);
  await page.screenshot({ path: path.join(SHOT_DIR, '02-spec-select-1920x1080.png') });
  const optsEvoker = (await specOptions()).filter(v => v !== '');
  const expectEvoker = await page.evaluate(() => getGameSpecs('唤魔师'));
  assert(JSON.stringify(optsEvoker) === JSON.stringify(expectEvoker), '1920×1080 档：唤魔师专精下拉全量', JSON.stringify(optsEvoker));
  await page.evaluate(() => closeModal('addCharacterModal'));
  await sleep(300);
  await page.setViewportSize({ width: 1366, height: 768 });
  await sleep(300);

  // ================= 修正项②：character.json 导入 =================
  console.log('—— 修正项②：插件导出文件导入 ——');
  await openAddModal();
  // 先填一个英雄榜链接，验证导入后 armory_url 恒空被清空
  await page.fill('#charArmoryUrl', 'https://wow.blizzard.cn/character/#/the-golden-plains/旧链接角色');
  await page.dispatchEvent('#charArmoryUrl', 'input');
  await sleep(300);
  await page.setInputFiles('#charImportFile', samplePath);
  await sleep(600);
  let st = await formState();
  assert(st.name === '测试角色甲' && st.server === '死亡之翼' && st.region === 'CN', '导入：名称/服务器/区域', JSON.stringify(st));
  assert(st.faction === 'Horde' && st.race === '血精灵' && st.guild === '星辰', '导入：阵营(部落→Horde)/种族/公会', JSON.stringify(st));
  assert(st.cls === '法师' && st.spec === '奥术', '导入：职业+专精带入并与下拉联动一致', JSON.stringify(st));
  assert(st.level === '80' && st.ilvl === '248', '导入：等级/装等', JSON.stringify(st));
  assert(st.armory === '', '导入：armory_url 恒空（旧链接被清空）', st.armory);
  let toast = await lastToast();
  assert(toast && toast.text === '已导入：测试角色甲 · 死亡之翼', '导入成功 toast「已导入：角色名 · 服务器」', JSON.stringify(toast));
  await page.screenshot({ path: path.join(SHOT_DIR, '03-import-filled.png') });

  // 保存链路不回归：导入数据可保存入库
  await page.evaluate(() => saveCharacter());
  await sleep(1200);
  const saved = await svc('GET', `/rest/v1/user_characters?user_id=eq.${owner.uid}&select=id,character_name,server_name,class,spec,faction,race,level,item_level,guild_name,armory_url`);
  assert(saved.status === 200 && saved.body.length === 1 && saved.body[0].spec === '奥术' && saved.body[0].faction === 'Horde' && saved.body[0].item_level === 248,
    '保存链路：导入数据入库（职业/专精/阵营/装等）', JSON.stringify(saved.body));

  // 同服查重不回归：再导入同一档案保存被拦截
  await openAddModal();
  await page.setInputFiles('#charImportFile', samplePath);
  await sleep(600);
  await page.evaluate(() => saveCharacter());
  await sleep(800);
  toast = await lastToast();
  assert(toast && toast.text.includes('已存在同名角色'), '保存查重不回归：同服同名拦截 toast', JSON.stringify(toast));
  const dupChk = await svc('GET', `/rest/v1/user_characters?user_id=eq.${owner.uid}&select=id`);
  assert(dupChk.body.length === 1, '查重拦截后仍只有 1 行（未重复入库）');
  await page.screenshot({ path: path.join(SHOT_DIR, '04-import-dup-blocked.png') });
  await page.evaluate(() => closeModal('addCharacterModal'));
  await sleep(300);

  // 错误文件提示不阻断
  await openAddModal();
  await page.setInputFiles('#charImportFile', badPath);
  await sleep(500);
  toast = await lastToast();
  assert(toast && toast.text.includes('不是有效的 JSON'), '错误文件：中文提示（非有效 JSON）', JSON.stringify(toast));
  st = await formState();
  assert(st.name === '' && st.server === '', '错误文件：表单未被污染，可继续手动填写', JSON.stringify(st));
  await page.screenshot({ path: path.join(SHOT_DIR, '05-import-bad-file.png') });

  // 非法专精：清空 + 提示
  await page.setInputFiles('#charImportFile', badSpecPath);
  await sleep(600);
  st = await formState();
  toast = await lastToast();
  assert(st.cls === '法师' && st.spec === '', '非法专精：职业带入、专精清空', JSON.stringify(st));
  assert(toast && toast.text.includes('不在「法师」专精列表中'), '非法专精：提示已清空请手选', JSON.stringify(toast));
  await page.screenshot({ path: path.join(SHOT_DIR, '06-import-bad-spec.png') });

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
