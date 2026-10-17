// 任务书 #77 验证：Exporter 12.1.5 GetItemInfo 兼容性适配（1.0.28）
// 静态断言（本机无游戏客户端/Lua VM，真机测试属运营侧 REQ-121 流程）：
// ①适配函数结构与优先级 ②4 处调用全替换、无残留裸调用（适配函数自身回退分支除外）
// ③版本号双处 bump ④其他 API 逻辑零改动（diff 行数受控）
// 用法: node scripts/verify-task77.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'addon/WoWButlerExporter/WoWButlerExporter.lua');
const src = fs.readFileSync(FILE, 'utf8');
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `（${detail}）` : ''}`);
}

// ① 适配函数
check('① safeGetItemInfo 在场且优先 C_Item.GetItemInfo、回退 GetItemInfo、双无返回 nil',
  /local function safeGetItemInfo\(itemID\)\s*\n\s*if C_Item and type\(C_Item\.GetItemInfo\) == "function" then\s*\n\s*return C_Item\.GetItemInfo\(itemID\)\s*\n\s*elseif type\(GetItemInfo\) == "function" then\s*\n\s*return GetItemInfo\(itemID\)\s*\n\s*end\s*\n\s*return nil\s*\nend/.test(src), '');
check('①b 适配函数位于 ADDON_VERSION 之后（头部插入，历史注释未动）',
  src.indexOf('local ADDON_VERSION') < src.indexOf('local function safeGetItemInfo') &&
  src.indexOf('local function safeGetItemInfo') < src.indexOf('local function msg'), '');

// ② 4 处替换 + 零残留
const safeCalls = (src.match(/safeGetItemInfo\(itemID\)/g) || []).length;
check('② safeGetItemInfo 调用 = 5（4 处替换 + 适配函数定义名 1）', safeCalls === 5, `命中=${safeCalls}`);
// 裸调用扫描：先剔除适配函数定义体，再用负向后行断言排除 safeGetItemInfo 前缀与 C_Item. 前缀
const stripped = src.replace(/local function safeGetItemInfo\(itemID\)[\s\S]*?\r?\nend\r?\n/, '');
const bare = (stripped.match(/(?<![\w.])GetItemInfo\(itemID\)/g) || []).length;
check('②b 4 处裸 GetItemInfo(itemID) 全部清零（仅剩适配函数回退分支）', bare === 0, `残留=${bare}`);
check('②c 四个目标行均已就位（parseItemDetail/isItemDataReady/getItemBasics×2）',
  /local _, link = safeGetItemInfo\(itemID\)/.test(src) &&
  /return safeGetItemInfo\(itemID\) ~= nil/.test(src) &&
  (src.match(/name, _, _, ilvl, _, _, subType, _, equipLoc, iconID = safeGetItemInfo\(itemID\)/g) || []).length === 2, '');

// ③ 版本号
check('③ ADDON_VERSION = 1.0.28', /local ADDON_VERSION = "1\.0\.28"/.test(src), '');
check('③b .toc Version = 1.0.28', /## Version: 1\.0\.28/.test(fs.readFileSync(path.join(ROOT, 'addon/WoWButlerExporter/WoWButlerExporter.toc'), 'utf8')), '');

// ④ 其他逻辑零改动（与 git 基线 diff 仅 6 个 hunks 内、行数增量 = 适配函数 10 行 + 版本 0）
const diff = spawnSync('git', ['diff', '--numstat', '--', 'addon/WoWButlerExporter/WoWButlerExporter.lua'], { cwd: ROOT, encoding: 'utf8' });
const m = diff.stdout.trim().match(/^(\d+)\t(\d+)\t/);
check('④ diff 受控（新增 16 行 = 适配块 11（注释 2+代码 8+空行 1）+ 版本 1 + 调用 4；删除 5 行）',
  m && Number(m[1]) === 16 && Number(m[2]) === 5, diff.stdout.trim().split('\n')[0]);

const fails = results.filter(r => !r.ok);
console.log(`\n===== 结果：${results.length - fails.length}/${results.length} 通过 =====`);
process.exit(fails.length ? 1 : 0);
