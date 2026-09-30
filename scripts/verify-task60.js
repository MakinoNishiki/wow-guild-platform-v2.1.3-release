// 任务书 #60 WP1 验证：新 IA 路由 PV 口径对齐（REQ-141）
// A1 sql/36 锚点：p_page 校验行恰一条且为新 regex（index:[a-z-]+），无旧 regex 校验行残留；
// A2 函数体一字不动：sql/36 的 analytics_overview 与 sql/34 逐字比对（仅 p_page 校验行 regex 差异）；
// A3 app.js 页筛 18 项：4 旧项保留 + 14 个单页签选项（value/label 逐对断言）；
// A4 ANX_TAB_LABEL：12 旧键原样保留 + home/team-guide/decor-plan/community 四新键；
// A5 版本串三壳实查：index.html .83×15 且 .82 零残留；decor.html(×5)/data.html(×8) 本批未触碰维持 .82；
// A6 冻结项：git diff 仅 index.html + js/app.js（track.js/server.js 零触碰）；
// A7 node --check js/app.js；A8 server-security 回归。
// 用法: node scripts/verify-task60.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const VER = '20260923.84'; // 任务书 #62：三壳同 .84（main.css 共享 + dataPublic.js 变更，两壳随批递增）
const VER_OLD = '20260923.83';

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' —— ' + detail : ''}`); }
}
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const countStr = (s, sub) => s.split(sub).length - 1;

console.log('== A. 静态锚点 ==');

// ---------- A1/A2 sql/36 ----------
const sql36 = read('sql/36_task060_analytics_page_re.sql');
const sql34 = read('sql/34_task055_analytics_overview.sql');
const NEW_RE = "p_page !~ '^(all|index|decor|data|index:[a-z-]+)$'";
const OLD_RE = "p_page !~ '^(all|index|decor|data|index:[a-z]+)$'";
check('A1a sql/36 新 regex 校验行恰一条', countStr(sql36, NEW_RE) === 1, `命中=${countStr(sql36, NEW_RE)}`);
check('A1b sql/36 无旧 regex 校验行（注释回滚说明不算）', !sql36.split('\n').some(l => l.includes(OLD_RE) && !l.trim().startsWith('--')), '');
check('A1c sql/36 幂等/权限/NOTIFY 锚点', sql36.includes('create or replace function public.analytics_overview')
  && sql36.includes('revoke all on function public.analytics_overview')
  && sql36.includes('grant execute on function public.analytics_overview')
  && sql36.includes("NOTIFY pgrst, 'reload schema';"), '');

function extractOverview(sql) {
  const start = sql.indexOf('create or replace function public.analytics_overview');
  const end = sql.indexOf('\n$$;', start);
  return sql.slice(start, end + 4).replace(/\r/g, '');
}
const body34 = extractOverview(sql34).replace(OLD_RE, () => NEW_RE);
const body36 = extractOverview(sql36);
check('A2 analytics_overview 函数体与 sql/34 一字不动（仅 regex 差异）', body34 === body36,
  body34 === body36 ? '' : '函数体存在 regex 以外差异');

// ---------- A3 页筛 18 项 ----------
const app = read('js/app.js');
const PAGE_OPTS = [
  ['all', '全部'], ['index', '主站'], ['decor', '家宅公示'], ['data', '掉落公示'],
  ['index:home', '主站·首页'], ['index:team-guide', '主站·团队引导'], ['index:members', '主站·成员管理'],
  ['index:attendance', '主站·考勤记录'], ['index:loot', '主站·装备分配'], ['index:wishlist', '主站·心愿单'],
  ['index:reports', '主站·统计报表'], ['index:data', '主站·数据管理'], ['index:changelog', '主站·更新日志'],
  ['index:datacenter', '主站·数据中心'], ['index:lootdrop', '主站·副本掉落'], ['index:decor', '主站·家宅图鉴'],
  ['index:decor-plan', '主站·方案单'], ['index:community', '主站·家宅社区']
];
const missing = PAGE_OPTS.filter(([v, l]) => !app.includes(`['${v}', '${l}']`));
check(`A3 页筛下拉 18 项（4 旧 + 14 新）逐对在场`, missing.length === 0, missing.map(m => m[0]).join(','));

// ---------- A4 ANX_TAB_LABEL ----------
const OLD_KEYS = { dashboard: '仪表盘', members: '成员管理', attendance: '考勤记录', loot: '装备分配',
  wishlist: '心愿单', reports: '统计报表', data: '数据管理', changelog: '更新日志',
  lootdrop: '副本掉落', decor: '家宅图鉴', datacenter: '数据中心', login: '登录墙' };
const NEW_KEYS = { home: '首页', "'team-guide'": '团队引导', "'decor-plan'": '方案单', community: '家宅社区' };
const missOld = Object.entries(OLD_KEYS).filter(([k, l]) => !app.includes(`${k}: '${l}'`));
const missNew = Object.entries(NEW_KEYS).filter(([k, l]) => !app.includes(`${k}: '${l}'`));
check('A4a ANX_TAB_LABEL 12 旧键原样保留', missOld.length === 0, missOld.map(m => m[0]).join(','));
check('A4b ANX_TAB_LABEL 补 home/team-guide/decor-plan/community 四键', missNew.length === 0, missNew.map(m => m[0]).join(','));

// ---------- A5 版本串三壳实查 ----------
const idx = read('index.html'), dec = read('decor.html'), dat = read('data.html');
check(`A5a index.html 版本串 ${VER} ×15 且旧串零残留`, countStr(idx, VER) === 15 && countStr(idx, VER_OLD) === 0,
  `.83=${countStr(idx, VER)} .82=${countStr(idx, VER_OLD)}`);
check(`A5b decor.html 版本串 ${VER} ×5（#62 起三壳同串）且旧串零残留`, countStr(dec, VER) === 5 && countStr(dec, VER_OLD) === 0,
  `.84=${countStr(dec, VER)} .83=${countStr(dec, VER_OLD)}`);
check(`A5c data.html 版本串 ${VER} ×8（#62 起三壳同串）且旧串零残留`, countStr(dat, VER) === 8 && countStr(dat, VER_OLD) === 0,
  `.84=${countStr(dat, VER)} .83=${countStr(dat, VER_OLD)}`);

// ---------- A6 冻结项 ----------
// 任务书 #61-WP1 连带适配：原白名单正钉（diff 恰为 #60 三文件）在送审制/后续批下恒红，改反钉——
// 本批冻结项 track.js/server.js 不在 diff（守卫目的不变：采集层与服务端零触碰）
const diff = spawnSync('git', ['-c', 'core.quotepath=false', 'diff', '--name-only'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean).sort();
check('A6 冻结项反钉：track.js / server.js 零触碰（不在 git diff）',
  !diff.includes('js/track.js') && !diff.includes('server.js'), diff.join(','));

// ---------- A7 node --check ----------
const nc = spawnSync('node', ['--check', 'js/app.js'], { cwd: ROOT, encoding: 'utf8' });
check('A7 node --check js/app.js', nc.status === 0, (nc.stderr || '').trim());

// ---------- A8 server-security 回归 ----------
const st = spawnSync('node', ['--test', 'test/server-security.test.js'], { cwd: ROOT, encoding: 'utf8' });
check('A8 server-security 回归', st.status === 0, (st.stdout + st.stderr).split('\n').filter(l => /fail|pass/i.test(l)).slice(-3).join(' | '));

console.log(`\n结果：${pass} 过 / ${fail} 挂`);
process.exit(fail ? 1 : 0);
