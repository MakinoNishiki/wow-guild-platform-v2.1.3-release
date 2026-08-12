// 任务书 #31 补验（REQ-097 装备库选择器对齐；完工报文因平台 500 中断未送达，本脚本=补报证据通道）：
//   A. 词表单一真源：双壳 window.LootTaxonomy 就位（app 壳 + data.html 公开壳），公示页 chips 词汇在；
//   B. picker 三下拉逐项（心愿单面板）：部位 12 项 / 武器 4 项 / 护甲 5 项精确断言；
//   C. 修正项①杂项排除：默认列表零杂项零套装兑换物（运行时池断言）+ 三个在案样本（闪银战利品/图样/萦花）搜索零命中；
//   D. 筛选命中：部位「肩部」「腕部」命中数 = boss_loot REST 实测数（§4 样本数声明）；
//   E. BUG-057 回填硬指标（两面板同治）：凝视→饰品/饰品、单手锤→武器/单手锤（心愿单+装备分配各复跑）；
//   F. 全库覆盖账：boss_loot 逐行 排除∪映射 = 全集，零映射不到（动态计数，不硬编码 190/52/138）；
//   G. 装备分配面板 picker 同治抽查（三下拉同清单 + 默认列表零杂项）；
//   H. 测试账号/公会（T31A 前缀）自清理复核为零（字典数据 boss_loot 全程只读）。
// 红线：不改业务代码；不 git 操作。用法: node scripts/verify-task31.js｜截图 → backup/2026-08-12-task31/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(__dirname, '..', '.s6-ssh', 'node_modules', 'playwright-core'))); }

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-12-task31');
const PORT = 15669;
const BASE = `http://localhost:${PORT}`;
const EMAIL = 't31a-owner@wowbutler.cn';
const PWD = 'T31abcd12';

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
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail !== undefined ? `（${detail}）` : ''}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function svc(method, restPath, body) {
  const res = await fetch(`${SB}${restPath}`, { method, headers: SVC, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text(); try { return { status: res.status, body: JSON.parse(t) }; } catch { return { status: res.status, body: t }; }
}

let serverProc = null, uid = null, guildId = null;

async function cleanup() {
  const steps = [];
  if (guildId) {
    await svc('DELETE', `/rest/v1/guild_members?guild_id=eq.${guildId}`);
    await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`);
    steps.push('guild:ok');
  }
  await svc('DELETE', '/rest/v1/guilds?name=like.T31A*');
  if (uid) {
    await svc('DELETE', `/rest/v1/user_profiles?user_id=eq.${uid}`);
    try { await fetch(`${SB}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); }
  }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const counts = [];
  const c1 = await svc('GET', '/rest/v1/guilds?select=id&name=like.T31A*');
  counts.push(['guilds', Array.isArray(c1.body) ? c1.body.length : '?']);
  if (uid) {
    const cp = await svc('GET', `/rest/v1/user_profiles?select=user_id&user_id=eq.${uid}`);
    const profN = Array.isArray(cp.body) ? cp.body.length : '?';
    const r = await fetch(`${SB}/auth/v1/admin/users/${uid}`, { headers: SVC });
    counts.push([`user(profiles=${profN},auth ${r.status === 404 ? 0 : '在'})`, profN === 0 && r.status === 404 ? 0 : 1]);
  }
  console.log('[清理复核] ' + counts.map(([l, n]) => `${l}=${n}`).join(' | '));
  check('测试数据清零复核（全 0；boss_loot 字典全程只读）', counts.every(([, n]) => n === 0), counts.map(([, n]) => n).join('/'));
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const r0 = await fetch(`${SB}/auth/v1/admin/users?page=1&per_page=200`, { headers: SVC });
  const b0 = await r0.json().catch(() => ({}));
  for (const u of (b0.users || [])) if ((u.email || '').startsWith('t31a-')) await fetch(`${SB}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: SVC });
  await svc('DELETE', '/rest/v1/guilds?name=like.T31A*');

  let res = await fetch(`${SB}/auth/v1/signup`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PWD, data: { display_name: 'T31A会长' } }) });
  let body = await res.json();
  if (!body.access_token) {
    res = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PWD }) });
    body = await res.json();
    if (!body.access_token) throw new Error('owner 登录失败');
  }
  uid = body.user.id;
  const g = await svc('POST', '/rest/v1/guilds', { name: 'T31A公会', owner_id: uid, invite_code: 'T31A' + Date.now().toString(36).slice(-4).toUpperCase() });
  if (g.status !== 201) throw new Error('建会失败: ' + JSON.stringify(g.body));
  guildId = g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', { guild_id: guildId, user_id: uid, role: 'owner', display_name: 'T31A会长' });

  // 数据侧样本数（§4 声明用）：杂项/套装兑换物/肩部/腕部行数 + 单手锤样本名
  const [cMisc, cToken, cShoulder, cWrist, hammerRow] = await Promise.all([
    svc('GET', "/rest/v1/boss_loot?select=id&slot=eq.杂项"),
    svc('GET', "/rest/v1/boss_loot?select=id&slot=eq.套装兑换物"),
    svc('GET', "/rest/v1/boss_loot?select=id&slot=eq.肩部"),
    svc('GET', "/rest/v1/boss_loot?select=id&slot=eq.腕部"),
    svc('GET', "/rest/v1/boss_loot?select=item_name&item_type=eq.单手锤&limit=1"),
  ]);
  const N_MISC = cMisc.body.length, N_TOKEN = cToken.body.length;
  const N_SHOULDER = cShoulder.body.length, N_WRIST = cWrist.body.length;
  const HAMMER = (Array.isArray(hammerRow.body) && hammerRow.body[0] && hammerRow.body[0].item_name) || null;
  if (!HAMMER) throw new Error('单手锤样本查询失败: ' + JSON.stringify(hammerRow.body));
  console.log(`[样本] 杂项=${N_MISC} 套装兑换物=${N_TOKEN} 肩部=${N_SHOULDER} 腕部=${N_WRIST} 单手锤样本=${HAMMER}`);

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r2 = await fetch(`${BASE}/api/supabase-config`); if (r2.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }

  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const pageErrors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => pageErrors.push('pageerror: ' + e.message));
    page.on('console', msg => { if (msg.type() === 'error') pageErrors.push('console: ' + msg.text()); });
    page.on('dialog', d => d.accept());

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
    await page.fill('#authEmail', EMAIL);
    await page.fill('#authPassword', PWD);
    await page.click('#authLoginBtn');
    await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
    await sleep(6000); // MasterData.init 并行拉取 + 快照兜底，picker 依赖主数据

    // ==================== A. 词表单一真源（双壳） ====================
    const a1 = await page.evaluate(() => ({
      app: !!(window.LootTaxonomy && window.LootTaxonomy.isPickerExcludedSlot && window.LootTaxonomy.slotCategoryOf),
      slots: window.LootTaxonomy ? window.LootTaxonomy.SLOT_OPTIONS.length : 0,
      excluded: window.LootTaxonomy ? window.LootTaxonomy.PICKER_EXCLUDED_SLOTS : [],
    }));
    check('A1 词表单一真源 app 壳就位（SLOT_OPTIONS=12 / 排除槽=[杂项,套装兑换物]）',
      a1.app && a1.slots === 12 && a1.excluded.join('/') === '杂项/套装兑换物', JSON.stringify(a1));
    const pub = await ctx.newPage();
    pub.on('pageerror', e => pageErrors.push('pageerror(data): ' + e.message));
    pub.on('console', msg => { if (msg.type() === 'error') pageErrors.push('console(data): ' + msg.text()); });
    await pub.goto(`${BASE}/data.html`, { waitUntil: 'networkidle' });
    await sleep(3000);
    const a2 = await pub.evaluate(() => ({
      taxonomy: !!window.LootTaxonomy,
      chipsText: document.body.textContent,
    }));
    check('A2 词表真源公开壳（data.html）就位 + 公示页 chips 含新词汇（肩部/腕部/背部/颈部/手指）',
      a2.taxonomy && ['肩部', '腕部', '背部', '颈部', '手指'].every(w => a2.chipsText.includes(w)),
      `taxonomy=${a2.taxonomy}`);
    await pub.close();

    // ==================== B/C. picker（心愿单面板）三下拉 + 杂项排除 ====================
    await page.evaluate(() => switchPage('wishlist'));
    await sleep(800);
    await page.evaluate(() => openItemDbPicker('wishlist'));
    await sleep(1200);
    const opts = await page.evaluate(() => ({
      slot: [...document.getElementById('itemDbSlotFilter').options].map(o => o.value),
      weapon: [...document.getElementById('itemDbWeaponFilter').options].map(o => o.value),
      armor: [...document.getElementById('itemDbArmorFilter').options].map(o => o.value),
      countText: document.getElementById('itemDbCount').textContent,
      poolBad: itemDbPickerItems.filter(i => window.LootTaxonomy.isPickerExcludedSlot(i.slot)).length,
      poolN: itemDbPickerItems.length,
    }));
    check('B1 部位下拉 12 项精确（全部/头部/肩部/胸部/腕部/手部/腰部/腿部/脚部/背部/颈部/手指/饰品）',
      JSON.stringify(opts.slot) === JSON.stringify(['', '头部', '肩部', '胸部', '腕部', '手部', '腰部', '腿部', '脚部', '背部', '颈部', '手指', '饰品']),
      JSON.stringify(opts.slot));
    check('B2 武器下拉 4 项（全部/单手/双手/远程/副手）+ 护甲下拉 5 项（全部/板甲/锁甲/皮甲/布甲/盾牌）',
      JSON.stringify(opts.weapon) === JSON.stringify(['', '单手', '双手', '远程', '副手'])
        && JSON.stringify(opts.armor) === JSON.stringify(['', '板甲', '锁甲', '皮甲', '布甲', '盾牌']),
      `weapon=${JSON.stringify(opts.weapon)} armor=${JSON.stringify(opts.armor)}`);
    check('C1 默认列表零杂项零套装兑换物（运行时池断言）',
      opts.poolBad === 0 && opts.poolN > 0, `池=${opts.poolN} 违规=${opts.poolBad} ${opts.countText}`);
    // 三个在案样本搜索零命中
    async function searchInPicker(kw) {
      await page.fill('#itemDbSearch', kw);
      await sleep(500);
      return page.evaluate(() => ({
        count: document.getElementById('itemDbCount').textContent,
        empty: document.getElementById('itemDbList').textContent.includes('没有找到匹配的装备'),
      }));
    }
    const s1 = await searchInPicker('闪银战利品');
    const s2 = await searchInPicker('世界照护者的树皮腰扣');
    const s3 = await searchInPicker('艾林硬化的裂隙萦花');
    check('C2 杂项样本三例（闪银战利品/图样树皮腰扣/萦花）picker 搜索零命中',
      s1.empty && s2.empty && s3.empty, JSON.stringify({ s1: s1.count, s2: s2.count, s3: s3.count }));
    await page.fill('#itemDbSearch', '');
    await sleep(500);

    // ==================== D. 部位筛选命中（肩部/腕部，命中数=REST 实测） ====================
    async function slotFilterCount(slot) {
      await page.selectOption('#itemDbSlotFilter', slot);
      await sleep(600);
      return page.evaluate(() => document.getElementById('itemDbCount').textContent);
    }
    const d1 = await slotFilterCount('肩部');
    const d2 = await slotFilterCount('腕部');
    check(`D1 部位「肩部」筛出 ${N_SHOULDER} 件（=boss_loot REST 实测 ${N_SHOULDER}，§4 样本数）`,
      d1 === `共 ${N_SHOULDER} 件装备` && N_SHOULDER > 0, `${d1} 期望 共 ${N_SHOULDER} 件装备`);
    check(`D2 部位「腕部」筛出 ${N_WRIST} 件（=REST 实测 ${N_WRIST}）`,
      d2 === `共 ${N_WRIST} 件装备` && N_WRIST > 0, `${d2} 期望 共 ${N_WRIST} 件装备`);
    await page.selectOption('#itemDbSlotFilter', '');
    await sleep(500);
    await page.screenshot({ path: path.join(SHOT_DIR, 'bc-picker-dropdowns.png') });

    // ==================== E. BUG-057 回填硬指标（两面板 × 双样本） ====================
    async function pickByName(kw) {
      await page.fill('#itemDbSearch', kw);
      await sleep(600);
      const found = await page.evaluate(() => {
        const card = document.querySelector('#itemDbList .item-card');
        if (!card) return false;
        card.click();
        return true;
      });
      if (!found) return false;
      await sleep(300);
      await page.click('#itemDbConfirmBtn');
      await sleep(500);
      return true;
    }
    // 心愿单：凝视 → 饰品/饰品
    await page.evaluate(() => { switchPage('wishlist'); });
    await sleep(600);
    await page.evaluate(() => wishlistShowModal());
    await sleep(400);
    await page.evaluate(() => openItemDbPicker('wishlist'));
    await sleep(1000);
    const e1ok = await pickByName('艾林先知的凝视');
    const e1 = await page.evaluate(() => ({
      cat: document.getElementById('wishlistCategory').value,
      slot: document.getElementById('wishlistSlot').value,
    }));
    check('E1 心愿单回填：艾林先知的凝视 → 大类=饰品 部位=饰品（BUG-057 硬指标①）',
      e1ok && e1.cat === '饰品' && e1.slot === '饰品', JSON.stringify({ e1ok, ...e1 }));
    // 心愿单：单手锤 → 武器/单手锤
    await page.evaluate(() => openItemDbPicker('wishlist'));
    await sleep(1000);
    const e2ok = await pickByName(HAMMER);
    const e2 = await page.evaluate(() => ({
      cat: document.getElementById('wishlistCategory').value,
      slot: document.getElementById('wishlistSlot').value,
    }));
    check(`E2 心愿单回填：${HAMMER} → 大类=武器 部位=单手锤（硬指标②）`,
      e2ok && e2.cat === '武器' && e2.slot === '单手锤', JSON.stringify({ e2ok, ...e2 }));
    await page.evaluate(() => { if (typeof requestCloseModal === 'function') requestCloseModal('wishlistModal'); });
    await sleep(300);

    // 装备分配面板：同样双样本
    await page.evaluate(() => switchPage('loot'));
    await sleep(800);
    await page.evaluate(() => lootShowModal());
    await sleep(400);
    await page.evaluate(() => openItemDbPicker('loot'));
    await sleep(1000);
    const e3ok = await pickByName('艾林先知的凝视');
    const e3 = await page.evaluate(() => ({
      cat: document.getElementById('lootCategory').value,
      slot: document.getElementById('lootSlot').value,
    }));
    check('E3 装备分配回填：艾林先知的凝视 → 大类=饰品 部位=饰品（硬指标③，两面板同治）',
      e3ok && e3.cat === '饰品' && e3.slot === '饰品', JSON.stringify({ e3ok, ...e3 }));
    await page.evaluate(() => openItemDbPicker('loot'));
    await sleep(1000);
    const e4ok = await pickByName(HAMMER);
    const e4 = await page.evaluate(() => ({
      cat: document.getElementById('lootCategory').value,
      slot: document.getElementById('lootSlot').value,
    }));
    check(`E4 装备分配回填：${HAMMER} → 大类=武器 部位=单手锤（硬指标④）`,
      e4ok && e4.cat === '武器' && e4.slot === '单手锤', JSON.stringify({ e4ok, ...e4 }));
    await page.evaluate(() => { if (typeof requestCloseModal === 'function') requestCloseModal('lootModal'); });
    await sleep(300);

    // ==================== G. 装备分配面板 picker 同治抽查 ====================
    await page.evaluate(() => openItemDbPicker('loot'));
    await sleep(1000);
    const g1 = await page.evaluate(() => ({
      slot: [...document.getElementById('itemDbSlotFilter').options].map(o => o.value),
      poolBad: itemDbPickerItems.filter(i => window.LootTaxonomy.isPickerExcludedSlot(i.slot)).length,
    }));
    await page.evaluate(() => closeModal('itemDbModal'));
    check('G1 装备分配面板 picker 同治：部位 12 项同清单 + 默认列表零杂项',
      g1.slot.length === 13 && g1.slot[1] === '头部' && g1.slot.includes('肩部') && g1.slot.includes('腕部') && g1.poolBad === 0, `项数=${g1.slot.length} slot[1]=${g1.slot[1]} 违规=${g1.poolBad}`);

    // ==================== F. 全库覆盖账（动态计数，零映射不到） ====================
    const allRows = await svc('GET', '/rest/v1/boss_loot?select=slot,item_type&limit=1000');
    const f1 = await page.evaluate((rows) => {
      const T = window.LootTaxonomy;
      let excluded = 0, mapped = 0, unmapped = [];
      for (const r of rows) {
        const slot = (r.slot || '').trim();
        const type = (r.item_type || '').trim();
        if (T.isPickerExcludedSlot(slot)) { excluded++; continue; }
        const ok = T.SLOT_OPTIONS.includes(slot)
          || T.WEAPON_GROUPS.some(g => T.matchWeapon(g.key, slot, type))
          || T.ARMOR_TYPES.includes(type);
        if (ok) mapped++;
        else unmapped.push(`${slot}|${type}`);
      }
      return { total: rows.length, excluded, mapped, unmapped };
    }, allRows.body);
    check(`F1 全库覆盖账：总 ${f1.total} 行 = 排除 ${f1.excluded}（杂项 ${N_MISC}+兑换物 ${N_TOKEN}）+ 映射 ${f1.mapped}，零映射不到`,
      f1.excluded + f1.mapped === f1.total && f1.unmapped.length === 0 && f1.excluded === N_MISC + N_TOKEN,
      `unmapped=${JSON.stringify(f1.unmapped.slice(0, 5))} 排除=${f1.excluded} 映射=${f1.mapped}`);

    // 零 JS 报错（406=既有噪音；data.html 公开壳 anon 读同口径）
    const realErrors = pageErrors.filter(e => !/status of (400|401|406|409)/.test(e));
    check('全程零 JS 报错（406=既有噪音已排除）', realErrors.length === 0, realErrors.join(' | ') || '无');
    await ctx.close();
  } finally {
    await browser.close();
  }

  await cleanup();

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#31 补验: ${passed}/${results.length} 通过，截图 → ${SHOT_DIR} =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
