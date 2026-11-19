// REQ-209: read-only CN CASC inspection; never starts the game, fetches assets,
// changes layouts, exports additional GLB models, or writes the database.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(__dirname, 'out/wow.export-main/src/js');
const OUT = path.join(__dirname, 'out/req209-effect-models');
const EVIDENCE = path.join(ROOT, 'docs/evidence/req209-effects-20261119');
const CATALOG = path.join(ROOT, 'data/task083/catalog-current-2335.json');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const arg = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;

// MD21 offsets are relative to the enclosed MD20 payload, not the outer file.
// Header cross-check: wow.export M2Loader + WoWFormatLib M2Reader.
// Modern record layouts: WhiteoutLib M2_FILE_FORMAT_SPECIFICATION §§6,11.
function inspectM2(buffer) {
  let data, base = 0;
  const chunks = [];
  if (buffer.subarray(0, 4).toString('ascii') === 'MD20') data = buffer;
  else {
    for (let pos = 0; pos < buffer.length;) {
      if (pos + 8 > buffer.length) throw new Error('truncated_chunk_header');
      const tag = buffer.subarray(pos, pos + 4).toString('ascii');
      const length = buffer.readUInt32LE(pos + 4);
      if (pos + 8 + length > buffer.length) throw new Error('chunk_out_of_bounds:' + tag);
      chunks.push({ tag, offset: pos + 8, bytes: length });
      if (tag === 'MD21') {
        if (data) throw new Error('duplicate_MD21');
        base = pos + 8;
        data = buffer.subarray(base, base + length);
      }
      pos += 8 + length;
    }
  }
  if (!data || data.length < 304 || data.subarray(0, 4).toString('ascii') !== 'MD20') throw new Error('missing_MD20_payload');
  const version = data.readUInt32LE(4);
  if (![272, 273, 274].includes(version)) throw new Error('unsupported_M2_version:' + version);
  const flags = data.readUInt32LE(16);
  const array = (at, stride, label) => {
    const count = data.readUInt32LE(at), offset = data.readUInt32LE(at + 4);
    if (count > 1000000 || (count && (offset < 304 || offset + count * stride > data.length))) throw new Error('array_out_of_bounds:' + label);
    return { count, offset, stride };
  };
  const modelName = array(8, 1, 'name');
  const bones = array(44, 88, 'bones');
  const textures = array(80, 16, 'textures');
  const materials = array(112, 4, 'materials');
  const ribbons = array(288, 176, 'ribbon_emitters');
  const particles = array(296, 492, 'particle_emitters');
  const position = at => {
    const values = [0, 4, 8].map(i => data.readFloatLE(at + i));
    if (!values.every(Number.isFinite)) throw new Error('nonfinite_emitter_position');
    return values;
  };
  const particleEntries = [];
  for (let i = 0; i < particles.count; i++) {
    const p = particles.offset + i * particles.stride;
    array(p + 24, 1, 'particle_geometry_filename');
    array(p + 32, 1, 'particle_recursion_filename');
    const emitterType = data.readUInt8(p + 41);
    if (emitterType < 1 || emitterType > 4) throw new Error('unsupported_emitter_type:' + emitterType);
    particleEntries.push({ id: data.readUInt32LE(p), flags: data.readUInt32LE(p + 4), position: position(p + 8), bone: data.readUInt16LE(p + 20), texture: data.readUInt16LE(p + 22), emitter_type: emitterType });
  }
  const ribbonEntries = [];
  for (let i = 0; i < ribbons.count; i++) {
    const p = ribbons.offset + i * ribbons.stride;
    const textureIndices = array(p + 20, 2, 'ribbon_texture_indices');
    const materialIndices = array(p + 28, 2, 'ribbon_material_indices');
    for (const [entry, max, label] of [[textureIndices, textures.count, 'texture'], [materialIndices, materials.count, 'material']]) {
      for (let j = 0; j < entry.count; j++) if (data.readUInt16LE(entry.offset + j * 2) >= max) throw new Error('ribbon_' + label + '_index_out_of_bounds');
    }
    ribbonEntries.push({ id: data.readUInt32LE(p), bone: data.readUInt32LE(p + 4), position: position(p + 8), texture_indices: textureIndices, material_indices: materialIndices });
  }
  return { status: particles.count || ribbons.count ? 'emitter_present' : 'no_embedded_emitters', bytes: buffer.length, sha256: sha(buffer), container: base ? 'MD21' : 'MD20', md20_base: base, md20_bytes: data.length, version, flags, model_name: data.subarray(modelName.offset, modelName.offset + modelName.count).toString('utf8').replace(/\0+$/, ''), bones: bones.count, textures: textures.count, ribbons, particles, particle_entries: particleEntries, ribbon_entries: ribbonEntries, chunks };
}

async function openLocal() {
  const stub = (relative, exports) => { const filename = path.join(SRC, relative); require.cache[filename] = { id: filename, filename, loaded: true, exports, paths: [], children: [] }; };
  global.nw = { __dirname: SRC, App: { dataPath: OUT, manifest: { version: '0.2.14-headless' } } };
  global.BUILD_RELEASE = true;
  const core = { events: new EventEmitter(), view: { config: { cacheExpiry: 0 }, cacheSize: 0, casc: null, $watch: (name, cb, options) => { if (options?.immediate) cb(0x40); } }, progressLoadingScreen: async s => console.log('[stage]', s), showLoadingScreen() {}, hideLoadingScreen() {}, setToast() {}, create_busy_lock: () => ({}) };
  stub('core.js', core);
  stub('casc/listfile.js', { getByID() {}, getByFilename() {}, getByIDOrUnknown: (id, ext) => id + ext, formatUnknownFile: (id, ext) => id + ext });
  stub('mmap.js', { create_virtual_file() { throw new Error('mmap_not_available'); }, release_virtual_files() {} });
  const Cache = class { async init() {} async getFile() { return null; } async storeFile() {} };
  stub('casc/build-cache.js', Cache);
  const keys = new Map(fs.readFileSync(path.join(__dirname, 'out/room-data/public-tact-keys.txt'), 'utf8').split(/\r?\n/).map(s => s.trim().split(/\s+/)).filter(a => a.length === 2 && /^[0-9a-f]{16}$/i.test(a[0]) && /^[0-9a-f]{32}$/i.test(a[1])).map(([k, v]) => [k.toLowerCase(), v.toLowerCase()]));
  stub('casc/tact-keys.js', { getKey: k => keys.get(k.toLowerCase()), load: async () => {} });
  const Local = require(path.join(SRC, 'casc/casc-source-local.js'));
  const source = new Local(arg('--game-dir', 'C:/Azeroth/World of Warcraft'));
  await source.init();
  source.build = source.builds.find(b => b.Product === 'wow' && b.Branch === 'cn' && b.Active === '1');
  if (!source.build) throw new Error('active_CN_retail_build_missing');
  source.cache = new Cache();
  source.initializeRemoteCASC = async () => { throw new Error('remote_fallback_disabled'); };
  await source.loadConfigs(); await source.loadIndexes(); await source.loadEncoding(); await source.loadRoot();
  core.view.casc = source;
  return source;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(EVIDENCE, { recursive: true });
  const catalogBytes = fs.readFileSync(CATALOG), catalog = JSON.parse(catalogBytes);
  const prior = JSON.parse(fs.readFileSync(path.join(__dirname, 'out/task084-probe-result.json'), 'utf8'));
  const priorByAsset = new Map(prior.results.map(r => [r.asset, r]));
  let source = null, initError = null;
  try { if (!process.argv.includes('--historical-only')) source = await openLocal(); } catch (e) { initError = e.message; console.log('[CASC unavailable]', initError); }
  const results = new Map();
  const assets = [...new Set(catalog.filter(r => r.entry_type === 1 && r.asset_id > 0).map(r => r.asset_id))];
  for (const asset of assets) {
    let buffer, origin, build;
    let currentError = null;
    try {
      if (!source) throw new Error(initError || 'historical_only');
      const cache = path.join(OUT, source.build.Version + '-' + asset + '.bin');
      if (fs.existsSync(cache)) { buffer = fs.readFileSync(cache); origin = 'current_local_cache'; }
      else { const raw = await source.getFile(asset, false, true, false); raw.processAllBlocks(); buffer = raw.raw; fs.writeFileSync(cache, buffer); origin = 'current_local_CASC'; }
      build = source.build.Version;
    } catch (e) {
      currentError = e.message;
      const old = priorByAsset.get(asset);
      const oldPath = old && path.join(__dirname, 'out/task084-' + old.record_id + '.bin');
      if (oldPath && fs.existsSync(oldPath)) { buffer = fs.readFileSync(oldPath); origin = 'TASK084_historical_bin'; build = prior.build.Version; }
    }
    let result = { asset_id: asset, status: 'unknown', reason: currentError };
    if (buffer) {
      try { result = { asset_id: asset, origin, client_build: build, current_read_error: currentError, ...inspectM2(buffer) }; }
      catch (e) { result = { asset_id: asset, origin, client_build: build, status: 'unknown', reason: e.message, bytes: buffer.length, sha256: sha(buffer) }; }
    }
    results.set(asset, result);
    if (results.size % 100 === 0) console.log('[scanned]', results.size, '/', assets.length);
  }
  const rows = catalog.map(r => ({ record_id: r.record_id, entry_type: r.entry_type, name: r.name, asset_id: r.asset_id || null, ...(r.entry_type !== 1 ? { status: 'not_decor' } : !r.asset_id ? { status: 'unknown', reason: 'missing_asset_id' } : results.get(r.asset_id)) }));
  const count = status => rows.filter(r => r.status === status).length;
  const positives = rows.filter(r => r.status === 'emitter_present').map(r => r.record_id).sort((a, b) => a - b);
  const checked = rows.filter(r => ['emitter_present', 'no_embedded_emitters'].includes(r.status)).map(r => r.record_id).sort((a, b) => a - b);
  const summary = { catalog: catalog.length, decor: catalog.filter(r => r.entry_type === 1).length, unique_assets: assets.length, verified_decor: checked.length, emitter_present: positives.length, no_embedded_emitters: count('no_embedded_emitters'), unknown: count('unknown'), not_decor: count('not_decor'), particle_decor: rows.filter(r => r.particles?.count > 0).length, ribbon_decor: rows.filter(r => r.ribbons?.count > 0).length, current_build_rows: rows.filter(r => r.client_build === source?.build.Version).length, historical_rows: rows.filter(r => r.origin === 'TASK084_historical_bin').length };
  const report = { generated_at: new Date().toISOString(), meaning: 'Positive IDs have validated embedded M2 particle/ribbon emitter records. Zero emitters is NOT proof of no other visual effect or no in-game capability. Unknowns remain unknown.', catalog_path: path.relative(ROOT, CATALOG).replaceAll('\\', '/'), catalog_sha256: sha(catalogBytes), source_build: source ? { region: source.build.Branch, version: source.build.Version, build_key: source.build.BuildKey } : null, source_init_error: initError, summary, rows };
  fs.writeFileSync(path.join(EVIDENCE, 'scan.json'), JSON.stringify(report, null, 2) + '\n');
  const js = '// REQ-209 generated by scripts/decor/scan_model_effects.cjs; do not infer absence from a Set miss.\n// Provenance: docs/evidence/req209-effects-20261119/scan.json. No geometry or game credentials.\n// Meaning: validated embedded M2 particle/ribbon emitter definitions; not a game-play observation.\nwindow.DecorEffectIds = new Set(' + JSON.stringify(positives) + ');\n// A checked non-positive only means these two embedded emitter arrays are empty.\nwindow.DecorEffectCheckedIds = new Set(' + JSON.stringify(checked) + ');\nwindow.DecorEffectScan = Object.freeze(' + JSON.stringify({ source: 'CN local M2 emitter arrays', build: report.source_build?.version || prior.build.Version, catalogSha256: report.catalog_sha256, ...summary }) + ');\n';
  fs.writeFileSync(path.join(ROOT, 'js/decorEffectIds.js'), js);
  console.log(JSON.stringify(summary));
}

module.exports = { inspectM2, openLocal };
if (require.main === module) main().catch(e => { console.error(e.stack); process.exitCode = 1; });
