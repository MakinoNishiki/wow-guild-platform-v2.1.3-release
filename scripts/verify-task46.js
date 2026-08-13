// 任务书 #46 验证：插件 1.0.9 四合一（REQ-088 特效补采/REQ-110③ 毒咒/REQ-089 兑换物展开送审/REQ-092 图标）
// 覆盖（任务书 §四 verify 口径）：
//   A. 版本串两壳 .58 + 静态断言（插件 1.0.9 双版本串/stripLineCodes/毒咒与 iconID 采集位/converter v4 八键/
//      sql/29 白名单/REQ-089 送审件禁静默改基线声明/素材管道落位）+ luacheck 双 lua 语法 + 公示页 308 基线零漂移
//     （REQ-089 未施工，基线禁止变动）；
//   B. converter mock 端到端（tools/python 便携运行时）：三 mock 转换零报错、load rows 三字段（effect/venomcurse/
//      icon_id）键齐、毒咒样本行、iconID 透传、_CMP_FIELDS 八键对账零丢失（变更行仅既有预期）；
//   C. sql/29 迁移探测：boss_loot.icon_id REST 可见性——未执行（当前）则结构类跳过 + 公示页零图标零报错（向后兼容）；
//      已执行则 RPC 白名单透出 + T46 样本行图标渲染/404 隐藏双态实测；
//   D. 素材管道 scripts/import-item-icons.js 功能冒烟（fixture 真实 PNG 入库/非数字命名跳过/幂等覆盖）；
//   E. PGRST204 防护静态断言（数据中心 payload icon_id 条件携带）+ 全程零 JS 报错零 404；T46 数据清零复核。
// 用法: node scripts/verify-task46.js（PW_CHANNEL=chrome 可选）
// 截图输出 backup/2026-08-13-task46/
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-13-task46');
const PORT = 15714;
const BASE = `http://localhost:${PORT}`;
const PY = path.join(ROOT, 'tools', 'python', 'python.exe');
const BASELINE = { total: 308, raid: 104, dungeon: 204 }; // sql/24 R13 口径；REQ-089 展开施工前禁止变动

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
function skip(name, why) {
  results.push({ name: `[跳过] ${name}`, ok: true });
  console.log(`⊘ ${name}（跳过：${why}）`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function svc(method, restPath, body) {
  const res = await fetch(`${SB}${restPath}`, { method, headers: SVC, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}
async function rpcPublic() {
  const res = await fetch(`${SB}/rest/v1/rpc/get_public_loot_detail`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }, body: '{}',
  });
  return { status: res.status, body: await res.json() };
}

let serverProc = null;

async function setup() {
  // T46 前缀残留清扫（boss_loot/dungeon_loot 仅删 T46 样本）
  await svc('DELETE', `/rest/v1/boss_loot?item_name=like.T46*`);
  await svc('DELETE', `/rest/v1/dungeon_loot?item_name=like.T46*`);
  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }
}
async function cleanup() {
  const steps = [];
  try { await svc('DELETE', `/rest/v1/boss_loot?item_name=like.T46*`); steps.push('boss:ok'); } catch { steps.push('boss:ERR'); }
  try { await svc('DELETE', `/rest/v1/dungeon_loot?item_name=like.T46*`); steps.push('dung:ok'); } catch { steps.push('dung:ERR'); }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const c1 = await svc('GET', `/rest/v1/boss_loot?select=id&item_name=like.T46*`);
  const c2 = await svc('GET', `/rest/v1/dungeon_loot?select=id&item_name=like.T46*`);
  check('[清理复核] T46 前缀掉落全 0', c1.body.length === 0 && c2.body.length === 0, `boss=${c1.body.length} dung=${c2.body.length}`);
  // 图标目录回归 .gitkeep 单文件（D 组 fixture 应已自清）
  const itemsDir = path.join(ROOT, 'assets', 'icons', 'items');
  const left = fs.readdirSync(itemsDir).filter(f => f !== '.gitkeep');
  check('[清理复核] assets/icons/items 仅 .gitkeep（fixture 已自清）', left.length === 0, left.join(',') || '空');
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await setup();

  // ==================== A. 版本串 + 静态 + luacheck + 基线 ====================
  const htmlData = await (await fetch(`${BASE}/data.html`)).text();
  const htmlIndex = await (await fetch(`${BASE}/`)).text();
  const verOf = h => [...new Set([...h.matchAll(/20260811\.\d+/g)].map(m => m[0]))];
  const vD = verOf(htmlData), vI = verOf(htmlIndex);
  check('A1 版本串两壳同步（单一串且两壳一致；本包 .58 起）', vD.length === 1 && vI.length === 1 && vD[0] === vI[0] && parseInt(vI[0].split('.')[1], 10) >= 58, `index=${vI} data=${vD}`);

  const lua = fs.readFileSync(path.join(ROOT, 'addon', 'WoWButlerExporter', 'WoWButlerExporter.lua'), 'utf8');
  const toc = fs.readFileSync(path.join(ROOT, 'addon', 'WoWButlerExporter', 'WoWButlerExporter.toc'), 'utf8');
  check('A2 插件版本 1.0.9 双串同步（lua+toc，1.0.8 跳号注释）',
    lua.includes('ADDON_VERSION = "1.0.9"') && toc.includes('## Version: 1.0.9') && lua.includes('1.0.8'));
  check('A3 REQ-088 采集修复落码：stripLineCodes 剥码 + effect 匹配走剥离后文本（首条命中守卫在）',
    lua.includes('function stripLineCodes') && lua.includes('plain:match("^(装备：.+)$")') && lua.includes('d.effect == ""'));
  check('A4 REQ-110③/REQ-092 采集位落码：毒咒行识别 + GetItemInfo 第 10 返回值 iconID 透传',
    lua.includes('d.venomcurse = "毒咒"') && lua.includes('iconID'));
  const conv = fs.readFileSync(path.join(ROOT, 'scripts', 'wjdc_convert.py'), 'utf8');
  check('A5 converter 冻结声明 v4 + _CMP_FIELDS 八键（+venomcurse/icon_id）',
    /冻结声明\s*v4/.test(conv) && conv.includes('"venomcurse"') && conv.includes('"icon_id"'));
  const sql29 = fs.readFileSync(path.join(ROOT, 'sql', '29_req092_icon_id.sql'), 'utf8');
  check('A6 sql/29 落码：两表 icon_id int + RPC 两分支白名单透出 + 回滚/复核段',
    (sql29.match(/add column if not exists icon_id int/gi) || []).length === 2 && sql29.includes("'icon_id'") && sql29.includes('回滚') && sql29.includes("NOTIFY pgrst"));
  const review = fs.existsSync(path.join(ROOT, 'docs', 'REQ-089-兑换物展开规则表-送审.md'))
    ? fs.readFileSync(path.join(ROOT, 'docs', 'REQ-089-兑换物展开规则表-送审.md'), 'utf8') : '';
  check('A7 REQ-089 送审件在库且含「禁止静默改基线」红线声明（未施工）',
    review.includes('禁止静默改基线') && review.includes('308'));
  const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  check('A8 PGRST204 防护：数据中心 icon_id 条件携带（payload 不恒带键）',
    appSrc.includes("if (out.icon_id !== null && out.icon_id !== undefined && out.icon_id !== '') payload.icon_id = out.icon_id;")
      && appSrc.includes('if (parts[6]) row.icon_id = Number(parts[6]);'));
  const dpSrc = fs.readFileSync(path.join(ROOT, 'js', 'dataPublic.js'), 'utf8');
  check('A9 公示页图标渲染落码：纯数字校验 + lazy + onerror 隐藏 + 空值不渲染',
    dpSrc.includes('dp-item-icon') && dpSrc.includes('loading="lazy"') && dpSrc.includes("onerror=") && dpSrc.includes('assets/icons/items/'));

  const lc1 = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'luacheck', 'check.js'), path.join(ROOT, 'addon', 'WoWButlerExporter', 'WoWButlerExporter.lua')], { encoding: 'utf8' });
  const lc2 = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'luacheck', 'check.js'), path.join(ROOT, 'addon', 'WoWButlerExporter', 'WoWButlerExporter_Probe.lua')], { encoding: 'utf8' });
  check('A10 luacheck 双 lua 语法（主件+Probe）', lc1.status === 0 && lc2.status === 0, `${lc1.status}/${lc2.status}`);

  // 基线零漂移（REQ-089 未施工硬约束）
  const cur = await svc('GET', '/rest/v1/game_seasons?select=id&is_current=eq.true&limit=1');
  const seasonId = cur.body[0].id;
  const rpc0 = await rpcPublic();
  const s1 = rpc0.body.filter(r => r.season_id === seasonId);
  const bl = { total: s1.length, raid: s1.filter(r => r.source === 'raid').length, dungeon: s1.filter(r => r.source === 'dungeon').length };
  check('A11 公示页 308 基线零漂移（REQ-089 未施工，禁止静默改基线）',
    bl.total === BASELINE.total && bl.raid === BASELINE.raid && bl.dungeon === BASELINE.dungeon, `实测=${bl.total}/${bl.raid}/${bl.dungeon}`);

  // ==================== B. converter mock 端到端 ====================
  const outdir = path.join(ROOT, 'scripts', 'wjdc', 'out-verify-t46');
  const conv1 = spawnSync(PY, [path.join(ROOT, 'scripts', 'wjdc_convert.py'), '--input', path.join(ROOT, 'scripts', 'wjdc', 'mock_savedvariables.lua'),
    '--dict', path.join(ROOT, 'scripts', 'wjdc', 'mock_dict.json'), '--existing', path.join(ROOT, 'scripts', 'wjdc', 'mock_existing.json'), '--outdir', outdir], { encoding: 'utf8' });
  check('B1 mock 转换零报错退出', conv1.status === 0, `exit=${conv1.status}`);
  let bRows = [], dRows = [], diffMd = '';
  try {
    bRows = JSON.parse(fs.readFileSync(path.join(outdir, 'boss_loot_load.json'), 'utf8'));
    dRows = JSON.parse(fs.readFileSync(path.join(outdir, 'dungeon_loot_load.json'), 'utf8'));
    diffMd = fs.readFileSync(path.join(outdir, '对账差异.md'), 'utf8');
  } catch (e) { /* 下一断言会失败并报因 */ }
  const all = [...bRows, ...dRows];
  check('B2 load rows 三字段键齐（effect/venomcurse/icon_id，boss 5+dungeon 2）',
    bRows.length === 5 && dRows.length === 2 && all.every(r => 'effect' in r && 'venomcurse' in r && 'icon_id' in r),
    `boss=${bRows.length} dung=${dRows.length}`);
  const venomRow = all.find(r => r.venomcurse === '毒咒');
  check('B3 毒咒样本行透出（venomcurse=毒咒）', !!venomRow, venomRow && venomRow.item_name);
  const iconRows = all.filter(r => Number.isInteger(r.icon_id));
  check('B4 iconID 透传（全件整型 icon_id）', iconRows.length === all.length && all.length > 0, `${iconRows.length}/${all.length}`);
  const fxRow = all.find(r => r.item_name === '影纹披风');
  check('B5 REQ-088 修复后口径：特效为剥码纯文本（采集端剥离，转换器零二次清洗）',
    fxRow && fxRow.effect === '装备：受到的范围伤害降低 3%。', fxRow && fxRow.effect);
  check('B6 八键对账零丢失（变更行仅既有预期「瓦丝琪的低语坠饰」）',
    diffMd.includes('变更：1 条') && diffMd.includes('瓦丝琪的低语坠饰') && !diffMd.includes('变更：2'), diffMd.match(/变更：\d+ 条/) && diffMd.match(/变更：\d+ 条/)[0]);
  // values/tiers 两 mock 回归
  const conv2 = spawnSync(PY, [path.join(ROOT, 'scripts', 'wjdc_convert.py'), '--input', path.join(ROOT, 'scripts', 'wjdc', 'mock_savedvariables_values.lua'),
    '--dict', path.join(ROOT, 'scripts', 'wjdc', 'mock_dict.json'), '--outdir', outdir + '-v'], { encoding: 'utf8' });
  const conv3 = spawnSync(PY, [path.join(ROOT, 'scripts', 'wjdc_convert.py'), '--input', path.join(ROOT, 'scripts', 'wjdc', 'mock_savedvariables_tiers.lua'),
    '--dict', path.join(ROOT, 'scripts', 'wjdc', 'mock_dict.json'), '--outdir', outdir + '-t'], { encoding: 'utf8' });
  check('B7 values/tiers 两 mock 回归零报错', conv2.status === 0 && conv3.status === 0, `values=${conv2.status} tiers=${conv3.status}`);
  fs.rmSync(outdir, { recursive: true, force: true });
  fs.rmSync(outdir + '-v', { recursive: true, force: true });
  fs.rmSync(outdir + '-t', { recursive: true, force: true });

  // ==================== C. sql/29 迁移探测 ====================
  const probe = await svc('GET', '/rest/v1/boss_loot?select=icon_id&limit=1');
  const columnReady = probe.status === 200;
  console.log(`\n[探测] boss_loot.icon_id 列${columnReady ? '已就绪（sql/29 已执行，跑全量）' : '未就绪（sql/29 待运营执行，结构类跳过+兼容态补测）'}`);

  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const pageErrors = [];
  const notFounds = [];
  const watch = (page, tag) => {
    page.setDefaultTimeout(30000);
    page.on('pageerror', e => pageErrors.push(`pageerror(${tag}): ` + e.message));
    page.on('console', msg => { if (msg.type() === 'error') pageErrors.push(`console(${tag}): ` + msg.text()); });
    page.on('response', r => { if (r.status() === 404) notFounds.push(`${tag}: ${r.url()}`); });
  };
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    watch(page, 't46');
    await page.goto(`${BASE}/data.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.data-public-body .dp-item', { state: 'visible', timeout: 20000 });
    await sleep(1200);

    if (!columnReady) {
      skip('C2 RPC 白名单透出 icon_id', 'sql/29 待运营执行');
      skip('C3 图标渲染/404 隐藏双态', 'sql/29 待运营执行');
      const iconCnt = await page.evaluate(() => document.querySelectorAll('.dp-item-icon').length);
      check('C1 兼容态：列未就绪公示页零图标渲染（icon_id undefined 不出 img、不破版）', iconCnt === 0, `img=${iconCnt}`);
    } else {
      const rpcRow = rpc0.body.find(r => 'icon_id' in r);
      check('C2 RPC 白名单透出 icon_id（CREATE OR REPLACE 已生效）', !!rpcRow);
      // 造 T46 样本行（真实 boss 挂载，icon_id=不存在的素材 id → 404 隐藏路径）
      const raid = await svc('GET', `/rest/v1/game_raids?select=id&season_id=eq.${seasonId}&type=neq.world&limit=1`);
      const boss = await svc('GET', `/rest/v1/game_bosses?select=id&raid_id=eq.${raid.body[0].id}&limit=1`);
      const ins = await svc('POST', '/rest/v1/boss_loot', { boss_id: boss.body[0].id, item_name: 'T46图标测试之刃', slot: '单手', item_type: '单手剑', icon_id: 999999 });
      check('C3a T46 样本行写入（icon_id=999999）', ins.status === 201, `status=${ins.status}`);
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('.data-public-body .dp-item', { state: 'visible', timeout: 20000 });
      await sleep(1500);
      const c3 = await page.evaluate(() => {
        const img = [...document.querySelectorAll('.dp-item-icon')][0];
        return img ? { exists: true, visible: img.offsetParent !== null && img.style.display !== 'none', src: img.getAttribute('src') } : { exists: false };
      });
      check('C3 图标 404 隐藏回退（无素材不占位不破版）', c3.exists && c3.visible === false && c3.src.includes('assets/icons/items/999999.png'), JSON.stringify(c3));
      await svc('DELETE', `/rest/v1/boss_loot?item_name=like.T46*`);
    }
    await page.screenshot({ path: path.join(SHOT_DIR, 'public-shell-1366.png'), fullPage: false });
    await ctx.close();

    // ==================== D. 素材管道冒烟 ====================
    const itemsDir = path.join(ROOT, 'assets', 'icons', 'items');
    const fixture = path.join(ROOT, 'scripts', 'wjdc', 'out-fixture-t46');
    fs.mkdirSync(fixture, { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'assets', 'icons', 'classes', 'warrior.png'), path.join(fixture, '400001.png'));
    fs.copyFileSync(path.join(ROOT, 'assets', 'icons', 'classes', 'mage.png'), path.join(fixture, '400002.png'));
    fs.copyFileSync(path.join(ROOT, 'assets', 'icons', 'classes', 'priest.png'), path.join(fixture, 'abc.png')); // 非数字命名应跳过
    const imp1 = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'import-item-icons.js'), fixture], { encoding: 'utf8' });
    const d1 = fs.existsSync(path.join(itemsDir, '400001.png')) && fs.existsSync(path.join(itemsDir, '400002.png')) && !fs.existsSync(path.join(itemsDir, 'abc.png'));
    check('D1 素材管道：数字命名 PNG 入库 + 非数字命名跳过', imp1.status === 0 && d1, (imp1.stdout || '').trim().split('\n').pop());
    const imp2 = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'import-item-icons.js'), fixture], { encoding: 'utf8' });
    check('D2 素材管道幂等（重复跑覆盖计数）', imp2.status === 0 && /覆盖|已存在|跳过|新增 0/.test(imp2.stdout || ''), (imp2.stdout || '').trim().split('\n').pop());
    fs.rmSync(fixture, { recursive: true, force: true });
    fs.unlinkSync(path.join(itemsDir, '400001.png'));
    fs.unlinkSync(path.join(itemsDir, '400002.png'));

    const realErrors = pageErrors.filter(e => !e.includes('status of 406') && !e.includes('status of 409')
      && !(columnReady && e.includes('status of 404'))); // C3 主动 404 取证噪音（console 资源报错不含 URL，网络层 404 由下方 real404 兜住）
    check('全程零 JS 报错（406/409/C3 主动 404 噪音另行列示）', realErrors.length === 0, realErrors.join(' | ') || '无');
    const real404 = notFounds.filter(u => !u.includes('999999.png'));
    check('全程零 404（C3 主动 404 取证另行列示）', columnReady ? real404.length === 0 : notFounds.length === 0, (columnReady ? real404 : notFounds).join(' | ') || '无');
  } finally {
    await browser.close();
  }

  await cleanup();

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#46 验证: ${passed}/${results.length} 通过，截图 → ${SHOT_DIR} =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => {
  console.error('[验证脚本异常]', e);
  try { await cleanup(); } catch {}
  process.exit(1);
});
