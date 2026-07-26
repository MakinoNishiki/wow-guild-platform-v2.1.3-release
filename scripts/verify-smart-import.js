// REQ-023 验证：从 js/app.js 真实源码提取 classMap / wowClassEnToCn / parseMemberRosterLine，构造数据实测解析器
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

const start = src.indexOf('const classMap = {');
const fnStart = src.indexOf('function parseMemberRosterLine');
if (start === -1 || fnStart === -1) {
  console.error('FAIL: 未能在 app.js 中定位 classMap 或 parseMemberRosterLine');
  process.exit(1);
}
const rest = src.slice(fnStart);
const endMatch = rest.match(/\n\}\n/); // 函数收尾的列 0 右括号
if (!endMatch) {
  console.error('FAIL: 未能定位 parseMemberRosterLine 函数结尾');
  process.exit(1);
}
const code = src.slice(start, fnStart + endMatch.index + 3);
const { classMap, wowClassEnToCn, parseMemberRosterLine } =
  new Function(code + '\nreturn { classMap, wowClassEnToCn, parseMemberRosterLine };')();

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
  ['   ', null, '纯空白行']
];

let pass = 0, fail = 0;
console.log('== 解析用例 ==');
for (const [input, expected, desc] of cases) {
  const got = parseMemberRosterLine(input);
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  PASS  ${desc}  [${JSON.stringify(input)}] -> ${JSON.stringify(got)}`); }
  else { fail++; console.log(`  FAIL  ${desc}  [${JSON.stringify(input)}] -> ${JSON.stringify(got)}，期望 ${JSON.stringify(expected)}`); }
}
console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
