// REQ-023 验证：从 js/app.js 真实源码提取 classMap / wowClassEnToCn / parseMemberRosterLine，构造数据实测解析器
// REQ-095（任务书 #45）同步改写：查重/撞离队判定四函数（isDupMemberName(WithServer)/findDepartedByName(WithServer)，
// 「名字-服务器」前缀形态口径）已废止，统一为 matchMemberByNameServer/findDepartedByNameServer（成员对象 +
// (name,server) 键：单候选宽松命中、多候选须精确相等）；解析器宏格式与「名字-服务器」形态拆出 server。
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

const start = src.indexOf('const classMap = {');
const fnStart = src.indexOf('function parseMemberRosterLine');
const helperStart = src.indexOf('function isDepartedStatus');
if (start === -1 || fnStart === -1 || helperStart === -1) {
  console.error('FAIL: 未能在 app.js 中定位 classMap / parseMemberRosterLine / isDepartedStatus');
  process.exit(1);
}
// helper 区段（isDepartedStatus → memberDisplayName 结尾），供第二段注入 appData 执行
const restH = src.slice(helperStart);
const endH = restH.indexOf('\n}\n', restH.indexOf('function memberDisplayName'));
if (endH === -1) {
  console.error('FAIL: 未能定位 memberDisplayName 函数结尾');
  process.exit(1);
}
const helperCode = restH.slice(0, endH + 3);

// 第一段：解析器（classMap → parseMemberRosterLine 收尾）
const rest = src.slice(fnStart);
const endMatch = rest.match(/\n\}\n/);
if (!endMatch) {
  console.error('FAIL: 未能定位 parseMemberRosterLine 函数结尾');
  process.exit(1);
}
const code = src.slice(start, fnStart) + rest.slice(0, endMatch.index + 3);
const { classMap, wowClassEnToCn, parseMemberRosterLine } =
  new Function(code + '\nreturn { classMap, wowClassEnToCn, parseMemberRosterLine };')();

console.log('== 职业映射表（英文类名 → 中文职业）==');
Object.entries(wowClassEnToCn).forEach(([en, cn]) => console.log(`  ${en} -> ${cn}`));
console.log(`共 ${Object.keys(wowClassEnToCn).length} 个英文类名，classMap 共 ${Object.keys(classMap).length} 个中文职业\n`);

const cases = [
  // [输入, 期望结果(null 表示无法识别), 说明]
  ['战神阿瑞斯-死亡之翼,WARRIOR', { name: '战神阿瑞斯', cls: '战士', server: '死亡之翼' }, '宏格式：名字-服务器拆出 server（REQ-095）'],
  ['烈焰法师,MAGE', { name: '烈焰法师', cls: '法师', server: '' }, '名字,英文类名'],
  ['小红帽,warrior', { name: '小红帽', cls: '战士', server: '' }, '英文类名小写'],
  ['泰兰德-语风,PRIEST', { name: '泰兰德', cls: '牧师', server: '语风' }, '宏格式：名字含-按最后一段拆服务器'],
  ['圣光骑士,圣骑士', { name: '圣光骑士', cls: '圣骑士' }, '名字,中文职业'],
  ['咕咕，德鲁伊', { name: '咕咕', cls: '德鲁伊' }, '中文逗号'],
  ['暗影盗贼-盗贼', { name: '暗影盗贼', cls: '盗贼' }, '名字-职业'],
  ['萌萌哒 牧师', { name: '萌萌哒', cls: '牧师' }, '名字 职业（半角空格）'],
  ['萌萌哒　牧师', { name: '萌萌哒', cls: '牧师' }, '名字 职业（全角空格）'],
  ['兽王猎人', { name: '兽王猎人', cls: '' }, '纯名字'],
  ['阿布-死亡之翼', { name: '阿布', cls: '', server: '死亡之翼' }, '名字-服务器无职业：拆 name+server（REQ-095 新口径）'],
  ['-白银之手', { name: '-白银之手', cls: '' }, '名字段为空：整行按纯名字保留（旧行为保留）'],
  ['  空格名字  ', { name: '空格名字', cls: '' }, '前后空格纯名字'],
  ['坏行,XYZ', null, '逗号但职业不识别'],
  [',WARRIOR', null, '名字为空'],
  ['', null, '空行'],
  ['   ', null, '纯空白行'],
  // 任务书 #9：时间戳清洗
  ['[12:34] 小明-金色平原,WARRIOR', { name: '小明', cls: '战士', server: '金色平原' }, '时间戳[时分]+宏格式（拆 server）'],
  ['[12:34:56]烈焰法师,MAGE', { name: '烈焰法师', cls: '法师', server: '' }, '时间戳[时分秒]无空格+宏格式'],
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

// ============ REQ-095 统一匹配口径：matchMemberByNameServer / findDepartedByNameServer ============
// helper 区段依赖 appData 全局（memberDisplayName/findDepartedByNameServer 读它），注入 mock
const mockAppData = {
  members: [
    { id: 'm1', name: '小明', server: '', status: '离队' },              // 软删除离队
    { id: 'm2', name: '阿强', server: '死亡之翼', status: 'inactive' },  // 历史英文离队状态
    { id: 'm3', name: '莉莉', server: '', status: '正式' },              // 活跃
    { id: 'm4', name: '  空格名  ', server: '', status: '离队' },        // 名字带首尾空格
    { id: 'm5', name: '双双', server: '金色平原', status: '离队' },      // 同名离队 A
    { id: 'm6', name: '双双', server: '白银之手', status: '离队' },      // 同名离队 B（多候选须精确）
    { id: 'm7', name: '洛洛', server: '金色平原', status: '正式' },      // 同名活跃 A
    { id: 'm8', name: '洛洛', server: '白银之手', status: '正式' },      // 同名活跃 B
  ]
};
const { isDepartedStatus, matchMemberByNameServer, findDepartedByNameServer, memberDisplayName } =
  new Function('appData', helperCode + '\nreturn { isDepartedStatus, matchMemberByNameServer, findDepartedByNameServer, memberDisplayName };')(mockAppData);

let pass2 = 0, fail2 = 0;
function checkFn(desc, actual, expected) {
  const ok = !!actual === !!expected && (typeof expected !== 'object' ? actual === expected : true);
  if (ok) { pass2++; console.log(`  PASS  ${desc}`); }
  else { fail2++; console.log(`  FAIL  ${desc}（实际 ${JSON.stringify(actual && actual.name !== undefined ? actual.name : actual)}，期望 ${JSON.stringify(expected && expected.name !== undefined ? expected.name : expected)}）`); }
}
const active = mockAppData.members.filter(m => !isDepartedStatus(m.status));

console.log('\n== REQ-095 场景一：撞离队恢复判定（候选=离队成员）==');
checkFn('离队同名单候选命中（status=离队）', (findDepartedByNameServer('小明', '') || {}).id, 'm1');
checkFn('历史英文离队状态兼容（status=inactive）', (findDepartedByNameServer('阿强', '死亡之翼') || {}).id, 'm2');
checkFn('名字带空格 trim 对齐', (findDepartedByNameServer('空格名', '') || {}).id, 'm4');
checkFn('离队同名多候选：server 精确命中', (findDepartedByNameServer('双双', '白银之手') || {}).id, 'm6');
checkFn('离队同名多候选：server 不匹配=不命中（走添加为成员流）', findDepartedByNameServer('双双', '罗宁'), null);
checkFn('活跃成员不进离队候选（findDeparted 不命中）', findDepartedByNameServer('莉莉', ''), null);

console.log('\n== REQ-095 场景二：活跃查重/对照匹配（导入 dup、WCL 对照同口径）==');
checkFn('活跃同名单候选命中', (matchMemberByNameServer(active, '莉莉', '') || {}).id, 'm3');
checkFn('单候选宽松：导入带 server 也命中（存量成员 server 空兼容）', (matchMemberByNameServer(active, '莉莉', '金色平原') || {}).id, 'm3');
checkFn('同名并存：server 精确命中正确的人', (matchMemberByNameServer(active, '洛洛', '白银之手') || {}).id, 'm8');
checkFn('同名并存：server 空=不匹配（不猜）', matchMemberByNameServer(active, '洛洛', ''), null);
checkFn('同名并存：第三服务器=不匹配', matchMemberByNameServer(active, '洛洛', '罗宁'), null);
checkFn('查无此人', matchMemberByNameServer(active, '不存在', ''), null);

console.log('\n== REQ-095 场景三：同名消歧显示 memberDisplayName ==');
checkFn('同名并存+有 server → 名字（服务器）', memberDisplayName(mockAppData.members.find(m => m.id === 'm7')), '洛洛（金色平原）');
checkFn('无同名并存 → 裸名（即便有 server 也无歧义）', memberDisplayName({ id: 'x', name: '独行', server: '罗宁', status: '正式' }), '独行');
checkFn('同名并存但 server 空 → 裸名（server 空则裸名口径）', memberDisplayName({ id: 'm3x', name: '莉莉', server: '', status: '正式' }), '莉莉');

console.log(`\n解析用例：${pass} 通过，${fail} 失败；REQ-095 口径：${pass2} 通过，${fail2} 失败`);
process.exit((fail + fail2) ? 1 : 0);
