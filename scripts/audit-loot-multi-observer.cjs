// Read-only characterization of the current importer. Expected gaps are NOT fix tests.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
// Preserve the pre-fix reproduction; never mistake expected old gaps for current tests.
const { execFileSync } = require('node:child_process');
const ref = '5fe21f1';
const read = file => execFileSync('git', ['show', ref + ':' + file], {cwd:root,encoding:'utf8'});
const app = read('js/app.js');
const sql = read('sql/42_task075_loot_drops.sql');
const core = read('addon/WoWButlerCollector/core.lua');
const start = app.indexOf('function lootDropDupKey(');
const end = app.indexOf('function lootDropImportRenderPreview(', start);
assert(start >= 0 && end > start, 'importer source boundaries');
const ctx = { appData: { lootDrops: [] }, lootDropImportRows: [], raw: '',
  document: { getElementById: () => ({ value: ctx.raw }) },
  showToast: message => { throw new Error(message); }, lootDropImportRenderPreview() {} };
vm.createContext(ctx);
vm.runInContext(app.slice(start, end), ctx);
const sample = { playerName: '测试角色', itemName: '测试装备', itemID: 268236,
  timestamp: 1794576338, difficultyID: 16, instanceName: '测试团本', ilvl: 318,
  itemLink: '|Hitem:268236:0:0:0:0:0:0:0:90:0:0:0:1:12345|h[测试装备]|h' };
function parse(rows, existing = []) {
  ctx.raw = JSON.stringify(rows); ctx.appData.lootDrops = existing;
  ctx.lootDropImportParse(); return ctx.lootDropImportRows;
}
const results = [];
function check(name, fn, finding) { fn(); results.push({ name, finding }); }
const stored = { player_name: sample.playerName, official_item_id: sample.itemID,
  timestamp: new Date(sample.timestamp * 1000).toISOString() };
check('exact-repeat', () => assert.equal(parse([sample], [stored])[0].dup, true), '同秒旧记录可在当前缓存中识别');
check('one-second-offset', () => assert.equal(parse([{ ...sample, timestamp: sample.timestamp + 1 }], [stored])[0].dup, false), '相差一秒未识别为重复');
check('duplicate-in-one-batch', () => assert.equal(parse([sample, sample]).filter(r => r.checked).length, 2), '同批相同行均被选中');
check('different-difficulty', () => assert.equal(parse([{ ...sample, difficultyID: 15 }], [stored])[0].dup, true), '去重键未区分难度');
check('different-variant', () => assert.equal(parse([{ ...sample, itemLink: sample.itemLink.replace('12345', '67890') }], [stored])[0].dup, true), '去重键未区分物品变体');
check('lost-link', () => assert.equal('itemLink' in parse([sample])[0], false), '入库映射未保留完整链接');
check('shared-db-unique-key', () => assert.match(sql, /ON loot_drops\(guild_id, player_name, official_item_id, timestamp\) NULLS NOT DISTINCT/), '数据库精确唯一键不含上传者：同秒可拦，时间不同不拦；仅核DDL，未执行数据库');
check('realm-stripping', () => assert(core.includes(':gsub("%-[^%-]*$", "")')), '插件代码剥服务器后缀；仅源码核查');
console.log(JSON.stringify({ kind: 'pre-fix-characterization', ref, simulated: true,
  productionAccess: false, fixed: false, checks: results.length, results }, null, 2));
