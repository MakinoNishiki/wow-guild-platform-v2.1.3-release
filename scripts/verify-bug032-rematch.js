// BUG-032 验证：从 js/app.js 真实源码提取「导入成功后对 _pendingAdd 行重跑对照匹配」代码块，
// 构造 wclSyncRows/appData 桩数据实测分区迁移。用法: node scripts/verify-bug032-rematch.js
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

const startMarker = 'const activeMembers = appData.members.filter';
const endMarker = "      if (wclSyncMeta) {\n        renderWclSyncPreview();\n        openModal('wclSyncModal');\n      }";
const start = src.indexOf(startMarker);
const end = src.indexOf(endMarker);
if (start === -1 || end === -1) {
  console.error('FAIL: 未能在 app.js 中定位 BUG-032 重匹配代码块');
  process.exit(1);
}
const block = src.slice(start, end + endMarker.length);

// 桩：每次用例重建
function runCase(name, { rows, members, bossFightTotal, expect }) {
  const appData = { members };
  const wclSyncRows = rows;
  const wclSyncMeta = { bossFightTotal };
  let rendered = false, reopened = false;
  const renderWclSyncPreview = () => { rendered = true; };
  const openModal = () => { reopened = true; };
  new Function('appData', 'wclSyncRows', 'wclSyncMeta', 'renderWclSyncPreview', 'openModal', block)(
    appData, wclSyncRows, wclSyncMeta, renderWclSyncPreview, openModal);
  const problems = [];
  for (const [i, exp] of Object.entries(expect)) {
    const r = wclSyncRows[+i];
    for (const [k, v] of Object.entries(exp)) {
      if (r[k] !== v) problems.push(`行${i}.${k}: 期望 ${JSON.stringify(v)}, 实际 ${JSON.stringify(r[k])}`);
    }
  }
  if (!rendered || !reopened) problems.push(`预览未原地刷新/重开 (rendered=${rendered}, reopened=${reopened})`);
  const ok = problems.length === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  problems.forEach(p => console.log(`      ${p}`));
  return ok;
}

let pass = 0, fail = 0;
const t = (...a) => { runCase(...a) ? pass++ : fail++; };

// 1. 添加 1 个全勤红区角色 → 移入①自动出席
t('全勤角色移入①自动出席分区', {
  rows: [
    { name: '战神', cls: '战士', bossFights: 5, memberId: null, zone: 'unmatched', status: '出席', ignored: false, _pendingAdd: true },
  ],
  members: [{ id: 'm1', name: '战神', status: '正式' }],
  bossFightTotal: 5,
  expect: { 0: { zone: 'full', memberId: 'm1', status: '出席', added: false, _pendingAdd: false } },
});

// 2. 部分参战 → 移入②部分参战
t('部分参战角色移入②分区', {
  rows: [
    { name: '法爷', cls: '法师', bossFights: 3, memberId: null, zone: 'unmatched', status: '出席', ignored: false, _pendingAdd: true },
  ],
  members: [{ id: 'm2', name: '法爷', status: '正式' }],
  bossFightTotal: 5,
  expect: { 0: { zone: 'partial', memberId: 'm2' } },
});

// 3. 连续添加 3 个（累计两轮 _pendingAdd），忽略行不动
t('连续添加多个+忽略行不受影响', {
  rows: [
    { name: '甲', cls: '战士', bossFights: 5, memberId: 'mA', zone: 'full', status: '出席', ignored: false }, // 之前已进①
    { name: '乙', cls: '法师', bossFights: 5, memberId: null, zone: 'unmatched', status: '出席', ignored: false, _pendingAdd: true },
    { name: '丙', cls: '牧师', bossFights: 2, memberId: null, zone: 'unmatched', status: '出席', ignored: false, _pendingAdd: true },
    { name: '丁', cls: '盗贼', bossFights: 4, memberId: null, zone: 'unmatched', status: '出席', ignored: true }, // 忽略行
  ],
  members: [
    { id: 'mA', name: '甲', status: '正式' },
    { id: 'mB', name: '乙', status: '正式' },
    { id: 'mC', name: '丙', status: '正式' },
  ],
  bossFightTotal: 5,
  expect: {
    0: { zone: 'full', memberId: 'mA' },
    1: { zone: 'full', memberId: 'mB' },
    2: { zone: 'partial', memberId: 'mC' },
    3: { zone: 'unmatched', memberId: null, ignored: true },
  },
});

// 4. 兜底：reload 后仍匹配不到（异常）→ 维持「已添加」灰显，滞留③
t('匹配不到走「已添加」兜底', {
  rows: [
    { name: '幽灵', cls: '术士', bossFights: 5, memberId: null, zone: 'unmatched', status: '出席', ignored: false, _pendingAdd: true },
  ],
  members: [],
  bossFightTotal: 5,
  expect: { 0: { zone: 'unmatched', memberId: null, added: true, _pendingAdd: false } },
});

// 5. 已离队同名成员不参与匹配（软删除口径）
t('已离队同名不匹配（走兜底）', {
  rows: [
    { name: '旧人', cls: '猎人', bossFights: 5, memberId: null, zone: 'unmatched', status: '出席', ignored: false, _pendingAdd: true },
  ],
  members: [{ id: 'm9', name: '旧人', status: '离队' }],
  bossFightTotal: 5,
  expect: { 0: { zone: 'unmatched', memberId: null, added: true } },
});

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
