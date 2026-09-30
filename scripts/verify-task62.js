// 任务书 #62 验证：反馈快赢批（BUG-109/106/107、REQ-147/150/151，纯前端）
// A1 §1 首页回退：首页 tab 在场且位于 team 前 / ia-brand onclick / iaSwitchTab home 分支 / iaPaintRoute effTab；
// A2 §2 团本筛选：lootRaidFilter 无硬编码团本 option + lootRender 动态构建（主数据 + 记录内自定义名）；
// A3 §3 考勤统计：renderActivityList attActive 剔除已删除行 + 缺席榜 filter !deleted；
// A4 §4 成员筛选：lootMemberFilter/lootMemberSearch DOM + character_id 精确 + assignedTo 模糊叠加；
// A5 §5 图标：getItemIconId/itemIconImgHtml 锚点 + loot/wishlist 行调用 + .loot-item-icon CSS + #46 卡片既存校验；
// A6 §6 分组：flatGroupHtml 在场 + flat 分支调用 + 旧平铺句不在 flat 分支；
// A7 版本串三壳 .84（15/5/8）+ 旧串零残留；A8 node --check + server-security；A9 冻结反钉。
// 用法: node scripts/verify-task62.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const VER = '20260923.84';
const VER_OLD1 = '20260923.83';
const VER_OLD2 = '20260923.82';

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' —— ' + detail : ''}`); }
}
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const countStr = (s, sub) => s.split(sub).length - 1;

console.log('== A. 静态锚点 ==');
const index = read('index.html');
const app = read('js/app.js');
const dp = read('js/dataPublic.js');
const css = read('css/main.css');

// ---------- A1 §1 BUG-109 ----------
const homeTabIdx = index.indexOf('data-ia-tab="home"');
const teamTabIdx = index.indexOf('data-ia-tab="team"');
check('A1a 一级导航「首页」tab 在场且位于「团队管理」左侧', homeTabIdx > -1 && teamTabIdx > -1 && homeTabIdx < teamTabIdx, '');
check('A1b ia-brand 整体可点（onclick iaSwitchTab(\'home\')）', /<div class="ia-brand" onclick="iaSwitchTab\('home'\)"/.test(index), '');
check('A1c iaSwitchTab 补 home 分支 → iaSetHash(\'#/home\')（埋点行不变单次）',
  /if \(tab === 'home'\) \{\s*iaSetHash\('#\/home'\)/.test(app) &&
  countStr(app, "WBTrack.event('tab_click', { level: 1, key: tab })") === 1, '');
check('A1d iaPaintRoute 首页门户态高亮首页 tab（effTab，无公会 tab=null 逻辑不动）',
  /const effTab = page === 'home' \? 'home' : tab;/.test(app) && /t\.dataset\.iaTab === effTab/.test(app), '');
check('A1e ia-brand hover/pointer CSS（取既有金色变量）',
  /.ia-brand { cursor: pointer; }/.test(css) && /.ia-brand:hover .ia-brand-name { color: var\(--gold-light\); }/.test(css), '');

// ---------- A2 §2 BUG-106 ----------
const raidFilterBlock = index.slice(index.indexOf('id="lootRaidFilter"') - 200, index.indexOf('id="lootRaidFilter"') + 400);
check('A2a lootRaidFilter 无硬编码团本 option（旧静态三项清零）',
  !/进军奎尔丹纳斯<\/option>/.test(raidFilterBlock) && !/梦境裂隙<\/option>/.test(raidFilterBlock), '');
check('A2b lootRender 动态构建团本选项（getGameRaidNames 主数据 + 记录内自定义名 extras + 保留当前选择）',
  /const names = getGameRaidNames\(\);/.test(app) &&
  /extras = \[\.\.\.new Set\(\(appData\.loots \|\| \[\]\)\.map\(l => l\.raid\)/.test(app) &&
  /raidSel\.value = curRaid;/.test(app), '');

// ---------- A3 §3 BUG-107 ----------
check('A3a 活动列表统计剔除已删除考勤行（attActive：id 命中成员表才计入）',
  /const attActive = a\.attendees\.filter\(att => att\.member_id && appData\.members\.some\(m => m\.id === att\.member_id\)\);/.test(app) &&
  /const absent = attActive\.filter\(att => att\.status === '缺席'\)\.length;/.test(app) &&
  /const present = attActive\.filter\(att => att\.status === '出席'/.test(app), '');
check('A3b 缺席榜+主排名表同口径剔除已删除（BUG-107 补丁终审裁定：getAttendanceRankings 不再聚合伪行）',
  /const absentRank = \[\.\.\.rankings\]\.sort\(\(a, b\) => b\.absent - a\.absent\)/.test(app) &&
  /getAttendanceRankings\(getFilteredActivities\(\)\)/.test(app) &&
  !/includeDeleted/.test(app) && !/getDeletedMemberStats/.test(app), '');
check('A3c 考勤明细已删除行灰显保留不篡改（member_name 快照 + tag-grey 已删除）',
  /member-departed" style="font-weight:500">\$\{a\.member_name\}<\/span> <span class="tag tag-grey">已删除/.test(app), '');

// ---------- A4 §4 REQ-147 ----------
check('A4a 工具区成员筛选下拉 + 成员搜索框 DOM 在场',
  /id="lootMemberFilter" onchange="lootRender\(\)"/.test(index) && /id="lootMemberSearch" oninput="lootRender\(\)"/.test(index), '');
check('A4b 成员筛选 id 精确叠加 + 分配人名字快照模糊搜索',
  /loots = loots\.filter\(l => l\.character_id === memberFilter\);/.test(app) &&
  /loots = loots\.filter\(l => \(l\.assignedTo \|\| ''\)\.toLowerCase\(\)\.includes\(memberKw\)\);/.test(app), '');
check('A4c 成员下拉动态构建（按名排序 + memberDisplayName 消歧 + value=id + 保留选择）',
  /memberSel\.innerHTML = '<option value="">全部成员<\/option>' \+\s*sorted\.map\(m => `<option value="\$\{m\.id\}">\$\{memberDisplayName\(m\)\}<\/option>`\)/.test(app) &&
  /memberSel\.value = curMember;/.test(app), '');

// ---------- A5 §5 REQ-150 ----------
check('A5a getItemIconId 索引（复合优先 + 唯一同名回退 + 同名多图标弃用）+ itemIconImgHtml（#46 同口径）',
  /function getItemIconId\(name, raid, boss\)/.test(app) &&
  /itemIconIdxCache\.full\.set\(`\$\{l\.item_name\}\|\$\{r\.name\}\|\$\{b\.name\}`, id\);/.test(app) &&
  /onerror="this\.style\.display='none'"/.test(app) && /loading="lazy"/.test(app), '');
check('A5b 装备分配列表装备名前置图标调用', /class="loot-name">\$\{itemIconImgHtml\(loot\.name, loot\.raid, loot\.boss\)\}/.test(app), '');
check('A5c 心愿单列表装备名前置图标调用', /class="wishlist-item-name">\$\{itemIconImgHtml\(w\.itemName, w\.raid, w\.boss\)\}/.test(app), '');
check('A5d .loot-item-icon CSS 注册 + 掉落卡片 #46 图标既存无缺口',
  /.loot-item-icon { width: 20px; height: 20px;/.test(css) &&
  /class="dp-item-icon" src="assets\/icons\/items\/\$\{iconId\}\.png"/.test(dp), '');

// ---------- A6 §6 REQ-151 ----------
check('A6a flatGroupHtml 在场（团本→BOSS / 大米→BOSS+整体池 两级分组，复用 bossBlockHtml 折叠同源）',
  /function flatGroupHtml\(\)/.test(dp) &&
  (dp.slice(dp.indexOf('function flatGroupHtml')).match(/bossBlockHtml\(/g) || []).length >= 3, '');
const flatBranch = dp.slice(dp.indexOf('if (flat) {'), dp.indexOf('} else {', dp.indexOf('if (flat) {')));
check('A6b flat 分支改调 flatGroupHtml（旧平铺网格句不在 flat 分支）',
  /flatGroupHtml\(\)/.test(flatBranch) && !/items\.map\(itemCard\)\.join\(''\)/.test(flatBranch), '');

// ---------- A7 版本串 ----------
const dec = read('decor.html'), dat = read('data.html');
check(`A7a 三壳版本串 ${VER}（index×15/decor×5/data×8）`,
  countStr(index, VER) === 15 && countStr(dec, VER) === 5 && countStr(dat, VER) === 8,
  `实际=${countStr(index, VER)}/${countStr(dec, VER)}/${countStr(dat, VER)}`);
check(`A7b 旧串零残留（.83/.82 三壳全零）`,
  [index, dec, dat].every(s => countStr(s, VER_OLD1) === 0 && countStr(s, VER_OLD2) === 0), '');

// ---------- A8 node --check + server-security ----------
for (const f of ['js/app.js', 'js/dataPublic.js']) {
  const r = spawnSync('node', ['--check', f], { cwd: ROOT, encoding: 'utf8' });
  check('A8 node --check ' + f, r.status === 0, (r.stderr || '').trim().split('\n')[0]);
}
const st = spawnSync('node', ['--test', 'test/server-security.test.js'], { cwd: ROOT, encoding: 'utf8' });
check('A8b server-security 回归', st.status === 0, '');

// ---------- A9 冻结反钉 + DB 零变更 ----------
const diff = spawnSync('git', ['-c', 'core.quotepath=false', 'status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean).map(l => l.slice(3).replace(/"/g, ''));
const frozen = ['js/track.js', 'server.js', 'sql/'];
check('A9 冻结项零触碰（track.js/server.js/sql 不在变更集；本批零 DB 迁移）',
  diff.every(f => !frozen.some(z => f === z || f.startsWith(z))), diff.join(','));
check('A9b PV 五层链路零改动（derivePage/双 RE/analytics 函数不在变更集）',
  diff.every(f => !['js/track.js', 'server.js'].includes(f)) &&
  !diff.some(f => f.startsWith('sql/')), '');

console.log(`\n结果：${pass} 过 / ${fail} 挂`);
process.exit(fail ? 1 : 0);
