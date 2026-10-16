// 任务书 #75 Day1 验证：WoWButlerCollector 插件 + sql/42 loot_drops + 代理白名单
// #75-补丁1 改版：插件 /wbc export 剪贴板 JSON 直出（插件内零依赖编码器）+ 团本过滤 + 难度中文；
//   转换脚本 scripts/export-collector-to-json.js 废弃删除（原 A4/B 组随之撤除），
//   INVTYPE→中文部位映射由前端 app.js 导入解析器承接（B 组改为前端锚点）。
// 申报：本机无 Lua VM/游戏客户端，插件语法用 tools/luacheck（luaparse）静态校验，
//       事件行为/弹窗交互真机验证属运营侧（REQ-121 工作流），本脚本只锁文件结构/口径锚点。
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
check('A3f 斜杠命令 /wbc（export 弹窗直出 + clear StaticPopup 二次确认）',
  /SLASH_WBC1 = "\/wbc"/.test(core) && /showExportFrame\(JSONEncode\(WoWButlerCollectorDB\)\)/.test(core) &&
  /StaticPopup_Show\("WBC_CLEAR_CONFIRM"\)/.test(core) && /wipe\(WoWButlerCollectorDB\)/.test(core), '');

// A4 #75-补丁1 锚点
check('A4a 插件内零依赖 JSON 编码器（字符串转义 + 数字直出 + nil 字段跳过兜底）',
  /local function JSONEncode\(tbl\)/.test(core) && /gsub\("\\\\", "\\\\\\\\"\)/.test(core) &&
  /if val then/.test(core), '');
check('A4b 团本过滤：instanceType ~= "raid" 即弃（party=大秘境/地下城、none=世界BOSS/野外全排除）',
  /instanceType ~= "raid" then return/.test(core), '');
check('A4c 难度中文名：GetDifficultyInfo 优先 + GetInstanceInfo 难度名回退 + 「未知」兜底',
  /GetDifficultyInfo\(difficultyID\)\) or difficultyName or "未知"/.test(core) &&
  /difficulty = difficulty,/.test(core), '');
check('A4d 导出弹窗：BasicFrameTemplateWithInset + 多行 EditBox + 先聚焦再高亮 + ESC 关闭 + 框架复用',
  /BasicFrameTemplateWithInset/.test(core) && /SetMultiLine\(true\)/.test(core) &&
  /SetFocus\(\)\s*\n\s*frame\.editBox:HighlightText\(\)/.test(core) &&
  /OnEscapePressed/.test(core) && /_G\.WoWButlerExportFrame/.test(core), '');
// A4e 转换脚本删除核验：文件不在场 + 运行时代码零引用；
// app.js 允许唯一 1 处提及=更新日志删除公告条目（用户可见的废弃说明，属正当留痕）
const appRefHits = (read('js/app.js').match(/export-collector-to-json/g) || []).length;
check('A4e 转换脚本已删除 + 运行时代码零引用（app.js 仅更新日志公告 1 处；docs/backup 历史存档除外）',
  !fs.existsSync(path.join(ROOT, 'scripts/export-collector-to-json.js')) &&
  !/export-collector-to-json/.test(core) &&
  !/export-collector-to-json/.test(read('addon/WoWButlerCollector/locales/zhCN.lua')) &&
  appRefHits === 1 &&
  !/export-collector-to-json/.test(read('index.html')), `app.js 命中=${appRefHits}`);

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
  .concat(['server.js']);
let allOk = true, bad = '';
for (const f of jsFiles) {
  const r = spawnSync(process.execPath, ['--check', f], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) { allOk = false; bad = f; }
}
check('A7 node --check 全量通过（js/ + server.js）', allOk, bad);

// A8 台账 + AGENTS.md 登记
check('A8 台账 REQ-163 + AGENTS.md 工作流节登记',
  /\| REQ-163 \|/.test(read('docs/问题与需求清单.md')) && /WoWButlerCollector/.test(read('AGENTS.md')), '');

// ==================== B. 前端导入解析器锚点（#75-补丁1：承接转换脚本职责） ====================
console.log('== B. 前端导入解析器（slotCN 承接） ==');
const app = read('js/app.js');
check('B1 INVTYPE→中文部位映射入 app.js（词表与原转换脚本同口径）',
  /const LOOT_DROP_INVTYPE_ZH = \{/.test(app) && /INVTYPE_HEAD: '头部'/.test(app) &&
  /INVTYPE_ROBE: '胸部'/.test(app) && /INVTYPE_HOLDABLE: '副手'/.test(app), '');
check('B2 解析器 slot_cn 回退链：slotCN 优先 → INVTYPE 映射 → 空串',
  /slot_cn: \(typeof r\.slotCN === 'string' && r\.slotCN\) \? r\.slotCN : \(LOOT_DROP_INVTYPE_ZH\[r\.slot\] \|\| ''\)/.test(app), '');
const idx = read('index.html');
check('B3 导入弹窗：/wbc export 粘贴主通道提示 + 拖放降备选',
  /\/wbc export<\/code>，复制弹窗中的 JSON 内容，粘贴到下方/.test(idx) &&
  /备选通道：拖放 JSON 文件到此/.test(idx), '');

const fails = results.filter(r => !r.ok);
console.log(`\n===== 结果：${results.length - fails.length}/${results.length} 通过 =====`);
process.exit(fails.length ? 1 : 0);
