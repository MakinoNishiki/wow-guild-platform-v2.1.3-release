'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { inspectM2 } = require('./decor/scan_model_effects.cjs');
const root = path.resolve(__dirname, '..');
const reportPath = path.join(root, 'docs/evidence/req209-effects-20261119/scan.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const context = { window: {}, Set, Object };
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/decorEffectIds.js'), 'utf8'), context);
const good = report.rows.find(r => r.status === 'emitter_present' && r.particles.count > 0);
const fileFor = r => path.join(root, 'scripts/decor/out/req209-effect-models', r.client_build + '-' + r.asset_id + '.bin');
const positive = fs.readFileSync(fileFor(good));
const baseline = inspectM2(positive);
const passed = [];
function check(name, fn) { fn(); passed.push(name); }
check('All 2271 unique CN model files reparse with identical hashes, counts and classification', () => {
  const seen = new Set();
  for (const row of report.rows) {
    if (!row.sha256 || seen.has(row.asset_id)) continue;
    seen.add(row.asset_id);
    const actual = inspectM2(fs.readFileSync(fileFor(row)));
    assert.equal(actual.sha256, row.sha256);
    assert.equal(actual.status, row.status);
    assert.deepEqual(actual.particles, row.particles);
    assert.deepEqual(actual.ribbons, row.ribbons);
  }
  assert.equal(seen.size, report.summary.unique_assets);
});
check('Published positive Set exactly matches emitter evidence; unknowns are excluded', () => {
  assert.deepEqual([...context.window.DecorEffectIds].sort((a, b) => a - b), report.rows.filter(r => r.status === 'emitter_present').map(r => r.record_id).sort((a, b) => a - b));
  for (const row of report.rows.filter(r => r.status === 'unknown' || r.status === 'not_decor')) {
    assert.equal(context.window.DecorEffectIds.has(row.record_id), false);
    assert.equal(context.window.DecorEffectCheckedIds.has(row.record_id), false);
  }
});
check('All existing 26 previews covered; static GLBs are not used to classify emitters', () => {
  const models = { window: {}, Object };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/decorModelManifest.js'), 'utf8'), models);
  for (const key of Object.keys(models.window.DecorModelManifest)) assert(context.window.DecorEffectCheckedIds.has(Number(key)));
  assert(context.window.DecorEffectIds.has(26881));
});
check('Flat MD20 parses with payload-relative pointers', () => {
  assert.equal(inspectM2(positive.subarray(baseline.md20_base, baseline.md20_base + baseline.md20_bytes)).particles.count, baseline.particles.count);
});
const corrupt = (fn, pattern) => { const copy = Buffer.from(positive); fn(copy, baseline.md20_base); assert.throws(() => inspectM2(copy), pattern); };
check('Truncated outer chunk is rejected', () => assert.throws(() => inspectM2(positive.subarray(0, positive.length - 1)), /chunk/));
check('Invalid inner magic is rejected', () => corrupt((b, base) => b.write('FAIL', base, 'ascii'), /MD20/));
check('Unsupported model version stays unknown instead of guessing offsets', () => corrupt((b, base) => b.writeUInt32LE(256, base + 4), /unsupported_M2_version/));
check('Nonzero particle count with zero pointer is rejected', () => corrupt((b, base) => b.writeUInt32LE(0, base + 300), /array_out_of_bounds/));
check('Particle array extending beyond its own MD21 payload is rejected', () => corrupt((b, base) => b.writeUInt32LE(1000000, base + 296), /array_out_of_bounds/));
check('Nonfinite emitter position is rejected', () => corrupt((b, base) => b.writeFloatLE(NaN, base + baseline.particles.offset + 8), /nonfinite/));
check('Unsupported emitter type is rejected', () => corrupt((b, base) => b.writeUInt8(255, base + baseline.particles.offset + 41), /unsupported_emitter_type/));
check('Three raw ribbon arrays have valid records and texture/material index references', () => {
  const rows = report.rows.filter(r => r.ribbons?.count > 0);
  assert.equal(rows.length, 3);
  for (const r of rows) assert.equal(inspectM2(fs.readFileSync(fileFor(r))).ribbon_entries.length, r.ribbons.count);
});
const result = { checked_at: new Date().toISOString(), passed: passed.length, checks: passed, summary: report.summary, note: 'Binary/evidence verification only; this does not claim in-game effects or browser rendering of particles.' };
fs.writeFileSync(path.join(root, 'docs/evidence/req209-effects-20261119/verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
