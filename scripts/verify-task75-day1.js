// 任务书 #75 Day1 验证：WoWButlerCollector 插件 + 导出转换脚本 + sql/42 loot_drops + 代理白名单
// A 静态锚点 + B 转换脚本合成样本端到端（Lua SavedVariables → JSON 字段断言）。
// 申报：本机无 Lua VM/游戏客户端，插件语法/事件行为真机验证属运营侧（REQ-121 工作流），
//       本脚本只锁文件结构/口径锚点与转换链路。
// 用法: node scripts/verify-task75-day1.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `（${detail}）` : ''}`);
}
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

console.log('== A. 静态锚点 ==');

// A1 插件文件结构与 toc
const tocOk = (() => {
  try {
    const toc = read('addon/WoWButlerCollector/WoWButlerCollector.toc');
    return /## Interface: 120105/.test(toc) && /## SavedVariables: WoWButlerCollectorDB/.test(toc) &&
      toc.indexOf('locales\\zhCN.lua') < toc.indexOf('core.lua') && toc.indexOf('locales\\zhCN.lua') >= 0;
  } catch { return false; }
})();
check('A1 toc 三件套：Interface 120105 + SavedVariables 声明 + locales 先于 core 加载', tocOk, '');
check('A2 插件三文件在场（toc/core.lua/locales/zhCN.lua）',
  fs.existsSync(path.join(ROOT, 'addon/WoWButlerCollector/core.lua')) &&
  fs.existsSync(path.join(ROOT, 'addon/WoWButlerCollector/locales/zhCN.lua')), '');

// A3 core.lua 机制锚点
const core = read('addon/WoWButlerCollector/core.lua');
check('A3a 事件监听：CHAT_MSG_LOOT + ENCOUNTER_END + PLAYER_LOGIN 三注册',
  /RegisterEvent\("CHAT_MSG_LOOT"\)/.test(core) && /RegisterEvent\("ENCOUNTER_END"\)/.test(core) &&
  /RegisterEvent\("PLAYER_LOGIN"\)/.test(core), '');
check('A3b locale-safe 聊天解析：用客户端全局串 LOOT_ITEM_SELF/LOOT_ITEM（不硬编码中文句式）',
  /LOOT_ITEM_SELF/.test(core) && /LOOT_ITEM_MULTIPLE/.test(core) && /fmtToPattern/.test(core), '');
check('A3c 过滤：品质 ≥4 + classID 数字排除表（0/5/7/12，客户端语言无关）',
  /quality < 4 then return/.test(core) && /EXCLUDE_CLASS = \{ \[0\] = true, \[5\] = true, \[7\] = true, \[12\] = true \}/.test(core), '');
check('A3d iconID 数字口径（GetItemInfo 第 10 返回值，与 Exporter REQ-092 同口径；无字符串 icon_name 伪字段）',
  /iconID = iconID/.test(core) && !/iconName/.test(core), '');
check('A3e 首领归属 180s 窗 + 容量护栏 2000 + 去重防抖 2s',
  /BOSS_WINDOW_SEC = 180/.test(core) && /MAX_ENTRIES = 2000/.test(core) &&
  /lastLoot\.itemID == itemID and lastLoot\.looter == looter/.test(core), '');
check('A3f 斜杠命令 /wbc（count/export 提示/clear 二次确认）',
  /SLASH_WBC1 = "\/wbc"/.test(core) && /clear confirm/.test(core) && /wipe\(WoWButlerCollectorDB\)/.test(core), '');

// A4 转换脚本锚点
const conv = read('scripts/export-collector-to-json.js');
check('A4a 转换脚本：Lua 解析器 + INVTYPE 中文映射 + export/ 输出',
  /function tokenize\(src\)/.test(conv) && /function parseLua\(src\)/.test(conv) &&
  /INVTYPE_HEAD: '头部'/.test(conv) && /wowbutler_collector_/.test(conv), '');
check('A4b .gitignore 已收 /export/（转换产物不入库）', /^\/?export\//m.test(read('.gitignore')), '');

// A5 sql/42 锚点
const sql = read('sql/42_task075_loot_drops.sql');
check('A5a loot_drops 建表（guild_id 外键级联 + 拾取字段族）',
  /CREATE TABLE IF NOT EXISTS loot_drops/.test(sql) &&
  /REFERENCES guilds\(id\) ON DELETE CASCADE/.test(sql) &&
  /player_name TEXT NOT NULL/.test(sql) && /official_item_id BIGINT/.test(sql) && /icon_id INTEGER/.test(sql), '');
check('A5b RLS 公会成员可读（is_guild_member）+ 幂等唯一索引 NULLS NOT DISTINCT + NOTIFY pgrst',
  /is_guild_member\(guild_id\)/.test(sql) &&
  /uq_loot_drops_event[\s\S]*NULLS NOT DISTINCT/.test(sql) && /NOTIFY pgrst/.test(sql), '');

// A6 server.js 代理白名单两处
const srv = read('server.js');
check('A6 代理白名单 loot_drops 双落点（行归属联查 + 业务表分支）',
  (srv.match(/"loot_drops"/g) || []).length === 2, `命中=${(srv.match(/"loot_drops"/g) || []).length}`);

// A7 node --check 全量
const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f)
  .concat(['server.js', 'scripts/export-collector-to-json.js']);
let allOk = true, bad = '';
for (const f of jsFiles) {
  const r = spawnSync(process.execPath, ['--check', f], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) { allOk = false; bad = f; }
}
check('A7 node --check 全量通过（js/ + server.js + 转换脚本）', allOk, bad);

// A8 台账 + AGENTS.md 登记
check('A8 台账 REQ-163 + AGENTS.md 工作流节登记',
  /\| REQ-163 \|/.test(read('docs/问题与需求清单.md')) && /WoWButlerCollector/.test(read('AGENTS.md')), '');

// ==================== B 转换脚本端到端（合成样本） ====================
console.log('== B. 转换脚本合成样本端到端 ==');
const sample = path.join(ROOT, 'backup/_pytmp/WoWButlerCollector-sample.lua');
const run = spawnSync(process.execPath, ['scripts/export-collector-to-json.js', sample], { cwd: ROOT, encoding: 'utf8' });
check('B1 转换脚本跑通（合成 WoW 序列化样本，退出码 0）', run.status === 0, (run.stderr || '').slice(0, 200));

if (run.status === 0) {
  const exportDir = path.join(ROOT, 'export');
  const files = fs.readdirSync(exportDir).filter(f => f.startsWith('wowbutler_collector_')).sort();
  const data = JSON.parse(fs.readFileSync(path.join(exportDir, files[files.length - 1]), 'utf8'));
  check('B2 JSON 结构：2 条记录 + 字段族完整（itemID/iconID/slotCN/timestampISO/playerName）',
    data.length === 2 && data[0].itemID === 271876 && data[0].iconID === 237510 &&
    data[0].slotCN === '胸部' && /^\d{4}-\d{2}-\d{2}T/.test(data[0].timestampISO) && data[0].playerName === '战子',
    `rows=${data.length} slotCN=${data[0].slotCN}/${data[1].slotCN}`);
  check('B3 缺字段容差：第二条无 iconID/bossName → null/空串不报错 + 覆盖统计打印',
    data[1].iconID === null && data[1].bossName === '' && /iconID 覆盖 1\/2/.test(run.stdout), '');
  // 清理产物（验证用输出不留存）
  for (const f of files) fs.unlinkSync(path.join(exportDir, f));
  fs.rmdirSync(exportDir);
}

const fails = results.filter(r => !r.ok);
console.log(`\n===== 结果：${results.length - fails.length}/${results.length} 通过 =====`);
process.exit(fails.length ? 1 : 0);
