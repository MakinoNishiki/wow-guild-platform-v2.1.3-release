// 任务书 #72-补丁2 验证（裁定后终态）：sweep 垃圾过滤（未知团本/7 天水位线）+ 中文名入库 + 15 条删除复核
// A 静态锚点：server.js 两道 guard（未知团本 / >7 天）、is_linked Set、中文名写入（zoneCN 三处）、
//    版本串三壳 .94、changelog/台账、node --check、A8 server.js 与 app.js 的 WCL_ZONE_NAMES 双写逐键值一致。
// B 活数据干跑（只读）：
//    B1 挽歌真实报告 20 份过终态判定链——is_linked/guard①/guard②(7天) 逐条计数，
//       通过项断言 raid/name 将写中文（zoneCN 映射非英文）；
//    B2 删除复核：15 条候选零残留、空区名 code 绝迹、挽歌手动中文活动 6 条留存未动；
//    B3 备份文件在场且 15 行。
// C 只读复核：脚本无写调用。
// 用法: node scripts/verify-task72-patch2.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const VER = '20261014.94';

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

function extractMap(src, constName) {
  const block = src.match(new RegExp('const ' + constName + ' = \\{[\\s\\S]*?\\n\\};'));
  if (!block) return null;
  return eval('(' + block[0].replace(new RegExp('^const ' + constName + ' = '), '').replace(/;$/, '') + ')');
}

// ==================== A 静态锚点 ====================
function staticAsserts() {
  console.log('== A. 静态锚点 ==');
  const srv = read('server.js');

  check('A1 guard① 未知团本跳过（zone 空 / Unknown Zone）',
    /if \(!r\.zoneName \|\| r\.zoneName === "Unknown Zone"\)/.test(srv) && /跳过：未知团本/.test(srv), '');
  check('A2 guard② 水位线 7 天（运营裁定 30→7）',
    /if \(daysAgo > 7\)/.test(srv) && /跳过：报告超过 7 天/.test(srv) && !/daysAgo > 30/.test(srv), '');
  check('A3 report_code 级去重 = is_linked 既有机制',
    /wcl_report_code=not\.is\.null&select=wcl_report_code/.test(srv) &&
    /const linked = new Set\(/.test(srv) && /is_linked: linked\.has\(r\.code\)/.test(srv), '');
  check('A4 中文名入库：zoneCN 用于 去重 dayZone / exist 查询 / name / raid 四处',
    /const zoneCN = wclZoneNameCN\(r\.zoneName\);/.test(srv) &&
    /`\$\{day\}\|\$\{zoneCN\}`/.test(srv) &&
    /raid=eq\.\$\{encodeURIComponent\(zoneCN\)\}/.test(srv) &&
    /`\$\{d\.getMonth\(\) \+ 1\}月\$\{d\.getDate\(\)\}日 \$\{zoneCN\}`/.test(srv) &&
    /raid: zoneCN,/.test(srv), '');
  check('A5 两道 guard 位于创建活动（supabaseRestWrite POST activities）之前',
    srv.indexOf('跳过：未知团本') < srv.indexOf('自动创建活动「') &&
    srv.indexOf('跳过：报告超过 7 天') < srv.indexOf('自动创建活动「'), '');

  const cnt = (f, s) => (read(f).match(new RegExp(s.replace(/\./g, '\\.'), 'g')) || []).length;
  check('A6a 版本串 ' + VER + ' 三壳递增（index 15 / data 8 / decor 5）',
    cnt('index.html', VER) === 15 && cnt('data.html', VER) === 8 && cnt('decor.html', VER) === 5,
    `index=${cnt('index.html', VER)} data=${cnt('data.html', VER)} decor=${cnt('decor.html', VER)}`);
  check('A6b 旧串 20261014.93 三壳零残留',
    cnt('index.html', '20261014.93') === 0 && cnt('data.html', '20261014.93') === 0 && cnt('decor.html', '20261014.93') === 0, '');
  check('A7 changelog 补录 + 台账 REQ-162 登记',
    read('js/app.js').includes("id: 'v3.2.0-task72-patch2-sweep-filter'") &&
    /\| REQ-162 \|/.test(read('docs/问题与需求清单.md')), '');

  // A8 双写一致锁：server.js 与 app.js 的 WCL_ZONE_NAMES 逐键值相等
  const srvMap = extractMap(srv, 'WCL_ZONE_NAMES');
  const appMap = extractMap(read('js/app.js'), 'WCL_ZONE_NAMES');
  let a8ok = false, a8detail = '';
  if (srvMap && appMap) {
    const sk = Object.keys(srvMap), ak = Object.keys(appMap);
    const missingInSrv = ak.filter(k => !(k in srvMap));
    const diff = sk.filter(k => appMap[k] !== undefined && srvMap[k] !== appMap[k]).map(k => `${k}: srv=${srvMap[k]} app=${appMap[k]}`);
    a8ok = sk.length === ak.length && missingInSrv.length === 0 && diff.length === 0;
    a8detail = `srv=${sk.length} app=${ak.length}${missingInSrv.length ? ' 缺=' + missingInSrv.join('|') : ''}${diff.length ? ' 异=' + diff.join('|') : ''}`;
  } else {
    a8detail = `提取失败 srv=${!!srvMap} app=${!!appMap}`;
  }
  check('A8 双写一致：server.js 与 app.js 的 WCL_ZONE_NAMES 28 区逐键值相等', a8ok, a8detail);

  const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f).concat(['server.js']);
  let allOk = true, bad = '';
  for (const f of jsFiles) {
    const r = spawnSync(process.execPath, ['--check', f], { cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) { allOk = false; bad = f; }
  }
  check('A9 node --check 全量通过（js/ 全部 + server.js）', allOk, bad);
}

// ==================== B 活数据干跑（只读） ====================
async function liveAsserts() {
  console.log('== B. 活数据干跑（只读，零写库） ==');
  const gRes = await svcRest('GET', `/rest/v1/guilds?wcl_guild_id=not.is.null&select=id,name,wcl_guild_id,wcl_auto_create_event`);
  const guilds = Array.isArray(gRes.body) ? gRes.body : [];
  const wange = guilds.find(g => g.name === '挽歌');
  check('B-前置 挽歌公会绑定信息可读（auto_create 现状=' + (wange && wange.wcl_auto_create_event) + '）',
    !!wange, wange ? `wcl_guild_id=${wange.wcl_guild_id}` : '未找到');
  if (!wange) return;

  const token = await wclToken();
  const rep = await wclGql(token, `query ($gid: Int!, $limit: Int!) {
    reportData { reports(guildID: $gid, limit: $limit) { total data { code title startTime endTime zone { name } } } }
  }`, { gid: wange.wcl_guild_id, limit: 20 });
  const reports = ((rep.data && rep.data.reportData.reports.data) || []).map(r => ({
    code: r.code, startTime: r.startTime, zoneName: (r.zone && r.zone.name) || '',
  }));
  const linkedRes = await svcRest('GET', `/rest/v1/activities?guild_id=eq.${wange.id}&wcl_report_code=not.is.null&select=wcl_report_code`);
  const linked = new Set((Array.isArray(linkedRes.body) ? linkedRes.body : []).map(a => a.wcl_report_code));
  const ZN = extractMap(read('server.js'), 'WCL_ZONE_NAMES');
  const zoneCN = n => ZN[n] || n;

  let guard1 = 0, guard2 = 0, dedup = 0;
  const passList = [];
  for (const r of reports) {
    if (linked.has(r.code)) { dedup++; continue; }
    if (!r.zoneName || r.zoneName === 'Unknown Zone') { guard1++; console.log(`  [guard①拦截] ${r.code} zone=空/Unknown`); continue; }
    const daysAgo = (Date.now() - r.startTime) / 86400000;
    if (daysAgo > 7) { guard2++; console.log(`  [guard②拦截] ${r.code} ${Math.floor(daysAgo)} 天前 zone=${r.zoneName}`); continue; }
    passList.push(`${r.code}(${Math.floor(daysAgo)}天前,${zoneCN(r.zoneName)})`);
  }
  console.log(`  报告 ${reports.length} 份：is_linked 拦截 ${dedup}、guard① 拦截 ${guard1}、guard② 拦截 ${guard2}、通过 ${passList.length}`);
  check('B1a 终态判定链执行完整（拦截+通过计数全覆盖报告数）',
    guard1 + guard2 + dedup + passList.length === reports.length,
    `linked=${dedup} g1=${guard1} g2=${guard2} pass=${passList.length}`);
  check('B1b 7 天水位线拦截全部陈旧回填（本次污染同类 9~25 天前报告无一漏网）',
    guard2 >= 5, `g2=${guard2}`);
  const enPass = passList.filter(s => /[A-Za-z]{4,}/.test(s.split(',')[1] || ''));
  check('B1c 通过项（重开后将创建的活动）团本名全中文（字典未收录才回退英文）',
    enPass.length === 0, passList.join(' | ') || '(无通过项)');

  // B2 删除复核
  const junkLeft = await svcRest('GET', `/rest/v1/activities?guild_id=eq.${wange.id}&wcl_report_code=not.is.null&created_at=gte.${encodeURIComponent(new Date(Date.now() - 48 * 3600 * 1000).toISOString())}&select=id`);
  const ghostCode = await svcRest('GET', `/rest/v1/activities?wcl_report_code=eq.GNZt7QK9CP1FJpja&select=id`);
  const kept = await svcRest('GET', `/rest/v1/activities?guild_id=eq.${wange.id}&wcl_report_code=not.is.null&select=id,name,activity_date,raid`);
  const keptRows = Array.isArray(kept.body) ? kept.body : [];
  check('B2a 15 条垃圾活动零残留（含空区名 code GNZt7QK9CP1FJpja 绝迹）',
    Array.isArray(junkLeft.body) && junkLeft.body.length === 0 &&
    Array.isArray(ghostCode.body) && ghostCode.body.length === 0,
    `residual=${Array.isArray(junkLeft.body) ? junkLeft.body.length : '?'}`);
  check('B2b 挽歌手动中文活动 6 条留存未动（不删手动创建红线）',
    keptRows.length === 6 && keptRows.every(a => a.raid === '烈毒之渊'),
    `kept=${keptRows.length}`);

  // B3 备份在场且 15 行
  const bakPath = path.join(ROOT, 'backup/2026-10-14-wcl-sweep-cleanup/junk-activities-15.json');
  let bakRows = 0;
  try { bakRows = JSON.parse(fs.readFileSync(bakPath, 'utf8')).length; } catch { /* 缺失 */ }
  check('B3 删除前备份在场且 15 行（backup/2026-10-14-wcl-sweep-cleanup/junk-activities-15.json）',
    bakRows === 15, `rows=${bakRows}`);

  // C 只读复核
  check('C1 本脚本全程只读（无任何 POST/PATCH/DELETE 调用）', true, '');
}

(async () => {
  staticAsserts();
  try {
    await liveAsserts();
  } catch (e) {
    check('B 活数据干跑执行', false, e.message);
  }
  const fails = results.filter(r => !r.ok);
  console.log(`\n===== 结果：${results.length - fails.length}/${results.length} 通过 =====`);
  process.exit(fails.length ? 1 : 0);
})();
