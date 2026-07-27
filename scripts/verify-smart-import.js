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
process.exit(fail ? 1 : 0);
