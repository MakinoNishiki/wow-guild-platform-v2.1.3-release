// REQ-023 验证：从 js/app.js 真实源码提取 classMap / wowClassEnToCn / parseMemberRosterLine，构造数据实测解析器
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

const start = src.indexOf('const classMap = {');
const fnStart = src.indexOf('function parseMemberRosterLine');
const dupFnStart = src.indexOf('function isDupMemberName');
if (start === -1 || fnStart === -1 || dupFnStart === -1) {
  console.error('FAIL: 未能在 app.js 中定位 classMap / parseMemberRosterLine / isDupMemberName');
  process.exit(1);
}
const rest = src.slice(dupFnStart);
const endMatch = rest.match(/\n\}\n/); // isDupMemberName 收尾的列 0 右括号
if (!endMatch) {
  console.error('FAIL: 未能定位 isDupMemberName 函数结尾');
  process.exit(1);
}
const code = src.slice(start, dupFnStart + endMatch.index + 3);
const { classMap, wowClassEnToCn, parseMemberRosterLine, isDupMemberName } =
  new Function(code + '\nreturn { classMap, wowClassEnToCn, parseMemberRosterLine, isDupMemberName };')();

console.log('== 职业映射表（英文类名 → 中文职业）==');
Object.entries(wowClassEnToCn).forEach(([en, cn]) => console.log(`  ${en} -> ${cn}`));
console.log(`共 ${Object.keys(wowClassEnToCn).length} 个英文类名，classMap 共 ${Object.keys(classMap).length} 个中文职业\n`);

const cases = [
  // [输入, 期望结果(null 表示无法识别), 说明]
  ['战神阿瑞斯-死亡之翼,WARRIOR', { name: '战神阿瑞斯', cls: '战士' }, '宏格式：名字-服务器,英文类名'],
  ['烈焰法师,MAGE', { name: '烈焰法师', cls: '法师' }, '名字,英文类名'],
  ['小红帽,warrior', { name: '小红帽', cls: '战士' }, '英文类名小写'],
  ['泰兰德-语风,PRIEST', { name: '泰兰德', cls: '牧师' }, '宏格式：名字本身含-'],
  ['圣光骑士,圣骑士', { name: '圣光骑士', cls: '圣骑士' }, '名字,中文职业'],
  ['咕咕，德鲁伊', { name: '咕咕', cls: '德鲁伊' }, '中文逗号'],
  ['暗影盗贼-盗贼', { name: '暗影盗贼', cls: '盗贼' }, '名字-职业'],
  ['萌萌哒 牧师', { name: '萌萌哒', cls: '牧师' }, '名字 职业（半角空格）'],
  ['萌萌哒　牧师', { name: '萌萌哒', cls: '牧师' }, '名字 职业（全角空格）'],
  ['兽王猎人', { name: '兽王猎人', cls: '' }, '纯名字'],
  ['阿布-死亡之翼', { name: '阿布-死亡之翼', cls: '' }, '名字-服务器（无逗号，整行保留）'],
  ['  空格名字  ', { name: '空格名字', cls: '' }, '前后空格纯名字'],
  ['坏行,XYZ', null, '逗号但职业不识别'],
  [',WARRIOR', null, '名字为空'],
  ['', null, '空行'],
  ['   ', null, '纯空白行'],
  // 任务书 #9：时间戳清洗
  ['[12:34] 小明-金色平原,WARRIOR', { name: '小明', cls: '战士' }, '时间戳[时分]+宏格式'],
  ['[12:34:56]烈焰法师,MAGE', { name: '烈焰法师', cls: '法师' }, '时间戳[时分秒]无空格+宏格式'],
  ['12:34 萌萌哒 牧师', { name: '萌萌哒', cls: '牧师' }, '无括号时间戳+名字 职业'],
  ['12:34:56 兽王猎人', { name: '兽王猎人', cls: '' }, '无括号带秒时间戳+纯名字'],
  ['[09:05] 暗影盗贼-盗贼', { name: '暗影盗贼', cls: '盗贼' }, '时间戳+名字-职业'],
  ['[8:03] 咕咕，德鲁伊', { name: '咕咕', cls: '德鲁伊' }, '单位数小时时间戳+中文逗号'],
  ['12:34', null, '纯时间戳行']
];

let pass = 0, fail = 0;
console.log('== 解析用例 ==');
for (const [input, expected, desc] of cases) {
  const got = parseMemberRosterLine(input);
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  PASS  ${desc}  [${JSON.stringify(input)}] -> ${JSON.stringify(got)}`); }
  else { fail++; console.log(`  FAIL  ${desc}  [${JSON.stringify(input)}] -> ${JSON.stringify(got)}，期望 ${JSON.stringify(expected)}`); }
}

// 任务书 #9：查重双形态（名字 / 名字-服务器）
const dupCases = [
  // [粘贴名, 库中已存名单, 期望是否重复, 说明]
  ['小明', ['小明'], true, '同名'],
  ['小明-金色平原', ['小明'], true, '粘贴带服务器，库中纯名字'],
  ['小明', ['小明-金色平原'], true, '粘贴纯名字，库中带服务器'],
  ['小明-金色平原', ['小明-金色平原'], true, '双形态全同'],
  ['小明同学', ['小明'], false, '名字前缀相似但非服务器后缀'],
  ['小明', ['小明同学'], false, '库中名字前缀相似'],
  ['阿布', ['小明', '阿布-死亡之翼'], true, '名单中任一匹配即重复'],
  ['莉莉', ['小明', '阿布-死亡之翼'], false, '无匹配']
];

console.log('\n== 查重用例 ==');
for (const [pasted, existing, expected, desc] of dupCases) {
  const got = isDupMemberName(pasted, existing);
  const ok = got === expected;
  if (ok) { pass++; console.log(`  PASS  ${desc}  "${pasted}" vs ${JSON.stringify(existing)} -> ${got}`); }
  else { fail++; console.log(`  FAIL  ${desc}  "${pasted}" vs ${JSON.stringify(existing)} -> ${got}，期望 ${expected}`); }
}
console.log(`\n结果：${pass} 通过，${fail} 失败`);

// ============ BUG-037（任务书 #12 补丁4）回归：唯一约束冲突三组场景 ============
// 提取带 server 维度查重与离队恢复判定函数（依赖 appData，注入 mock）
const dup2Start = src.indexOf('function isDupMemberNameWithServer');
const departedStart = src.indexOf('function findDepartedByNameWithServer');
if (dup2Start === -1 || departedStart === -1) {
  console.error('FAIL: 未能在 app.js 中定位 isDupMemberNameWithServer / findDepartedByNameWithServer');
  process.exit(1);
}
const rest2 = src.slice(dup2Start);
const end2 = rest2.indexOf('\n}\n', rest2.indexOf('function findDepartedByNameWithServer'));
if (end2 === -1) {
  console.error('FAIL: 未能定位 findDepartedByNameWithServer 函数结尾');
  process.exit(1);
}
const code2 = rest2.slice(0, end2 + 3);
const mockAppData = {
  members: [
    { name: '小明', status: '离队' },            // 软删除离队
    { name: '阿强-死亡之翼', status: 'inactive' }, // 历史英文离队状态
    { name: '莉莉', status: '正式' },            // 活跃
    { name: '  空格名  ', status: '离队' },       // 名字带首尾空格
  ]
};
const { isDupMemberNameWithServer, findDepartedByName, findDepartedByNameWithServer } =
  new Function('appData', code2 + '\nreturn { isDupMemberNameWithServer, findDepartedByName, findDepartedByNameWithServer };')(mockAppData);

let pass2 = 0, fail2 = 0;
function checkFn(desc, actual, expected) {
  const ok = !!actual === !!expected && (typeof expected !== 'object' ? actual === expected : true);
  if (ok) { pass2++; console.log(`  PASS  ${desc}`); }
  else { fail2++; console.log(`  FAIL  ${desc}（实际 ${JSON.stringify(actual && actual.name !== undefined ? actual.name : actual)}，期望 ${JSON.stringify(expected && expected.name !== undefined ? expected.name : expected)}）`); }
}

console.log('\n== BUG-037 场景一：离队同名 → 导入走恢复链路（判定命中）==');
checkFn('离队同名命中（status=离队）', (findDepartedByName('小明') || {}).name, '小明');
checkFn('历史英文离队状态兼容（status=inactive）', (findDepartedByName('阿强') || {}).name, '阿强-死亡之翼');
checkFn('名字带空格 trim 对齐', (findDepartedByName('空格名') || {}).name, '  空格名  ');

console.log('\n== BUG-037 场景二：活跃同名 → 判重跳过（不撞索引、不走恢复）==');
checkFn('活跃同名查重命中', isDupMemberName('莉莉', ['莉莉']), true);
checkFn('活跃同名不走恢复（findDeparted 不命中）', findDepartedByName('莉莉'), null);

console.log('\n== BUG-037 场景三：跨服同名 → 允许（REQ-002 仅同服唯一）==');
checkFn('跨服同名不判重', isDupMemberNameWithServer('小明', '金色平原', ['小明-死亡之翼']), false);
checkFn('同服同名判重', isDupMemberNameWithServer('小明', '死亡之翼', ['小明-死亡之翼']), true);
checkFn('跨服撞离队不拦（可新建/恢复按同服口径）', findDepartedByNameWithServer('阿强', '金色平原'), null);
checkFn('同服撞离队走恢复', (findDepartedByNameWithServer('阿强', '死亡之翼') || {}).name, '阿强-死亡之翼');

console.log(`\nBUG-037 回归：${pass2} 通过，${fail2} 失败`);
process.exit((fail + fail2) ? 1 : 0);
