// Read the active CN install with the same offline reader as the model evidence scan.
// Produces embedded, self-contained static glTF using the client's mesh, UVs and BLPs.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { openLocal } = require('./scan_model_effects.cjs');
const root = path.resolve(__dirname, '../..');
const src = path.join(__dirname, 'out/wow.export-main/src/js');
const directory = path.join(root, 'assets/decor-models/catalog');
const rows = require('../../data/task083/catalog-current-2335.json').filter(row => row.entry_type === 1);
const scratch = path.join(__dirname, 'out/catalog-export');
const pad = length => (4 - length % 4) % 4;

async function readTexture(source, id, cache) {
  const file = path.join(cache, id + '.webp');
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const BLP = require(path.join(src, 'casc/blp.js'));
  const image = new BLP(await source.getFile(id, false, true, false));
  const mip = Math.min(image.mapCount - 1, Math.max(0, Math.ceil(Math.log2(Math.max(image.width, image.height) / 512))));
  const pixels = image.toUInt8Array(mip);
  const encoded = spawnSync('ffmpeg', ['-loglevel', 'error', '-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size',
    image.scaledWidth + 'x' + image.scaledHeight, '-i', 'pipe:0', '-frames:v', '1', '-c:v', 'libwebp', '-quality', '82',
    '-compression_level', '2', '-f', 'webp', 'pipe:1'], { input: pixels, maxBuffer: 32 << 20, windowsHide: true });
  if (encoded.status !== 0 || !encoded.stdout?.length) throw new Error('texture ' + id + ': ' + (encoded.error || encoded.stderr));
  fs.writeFileSync(file, encoded.stdout);
  return encoded.stdout;
}

async function readGeometry(source, asset, isStructure) {
  const data = await source.getFile(asset, false, true, false);
  if (isStructure) {
    const WMO = require(path.join(src, '3D/loaders/WMOLoader.js'));
    const model = new WMO(data, asset, true);
    await model.load();
    const groups = [];
    for (let i = 0; i < model.groupCount; i++) {
      const group = await model.getGroup(i);
      if (!group.renderBatches?.length) continue;
      const parts = [];
      for (const batch of group.renderBatches) {
        const material = model.materials[(batch.flags & 2) ? batch.possibleBox2[2] : batch.materialID];
        const id = material?.shader === 23 ? material.texture2 : material?.texture1;
        if (id && batch.numFaces) parts.push({ id, blend: material.blendMode, indices: group.indices.slice(batch.firstFace, batch.firstFace + batch.numFaces) });
      }
      if (parts.length) groups.push({ vertices: group.vertices, normals: group.normals, uv: group.uvs[0], parts });
    }
    return groups;
  }
  const Loader = require(path.join(src, '3D/loaders/M2Loader.js'));
  const model = new Loader(data);
  await model.load();
  const skin = await model.getSkin(0);
  const parts = [];
  for (const [i, section] of skin.subMeshes.entries()) {
    if (!section.triangleCount) continue;
    for (const unit of skin.textureUnits.filter(unit => unit.skinSectionIndex === i)) {
      const id = model.textures[model.textureCombos[unit.textureComboIndex]]?.fileDataID;
      if (!id) continue;
      const indices = skin.triangles.slice(section.triangleStart, section.triangleStart + section.triangleCount).map(n => skin.indices[n]);
      if (indices.length !== section.triangleCount) throw new Error('invalid triangle count');
      parts.push({ id, blend: model.materials[unit.materialIndex]?.blendingMode, indices });
      break;
    }
  }
  return [{ vertices: model.vertices, normals: model.normals, uv: model.uv, parts }];
}

async function exportModel(source, asset, isStructure, cache) {
  const groups = await readGeometry(source, asset, isStructure);
  const doc = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [] }], materials: [], textures: [], images: [], accessors: [], bufferViews: [], buffers: [],
    extensionsUsed: ['EXT_texture_webp'], extensionsRequired: ['EXT_texture_webp'] };
  const chunks = [];
  let offset = 0;
  function view(bytes, target) {
    const index = doc.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target }) - 1;
    const padding = pad(bytes.length);
    chunks.push(bytes, Buffer.alloc(padding));
    offset += bytes.length + padding;
    return index;
  }
  function accessor(data, type, width, bounds) {
    const isIndex = type === 'SCALAR';
    const array = isIndex ? Uint16Array.from(data) : Float32Array.from(data);
    const acc = { bufferView: view(Buffer.from(array.buffer), isIndex ? 34963 : 34962), componentType: isIndex ? 5123 : 5126,
      count: array.length / width, type };
    if (bounds) {
      acc.min = [Infinity, Infinity, Infinity]; acc.max = [-Infinity, -Infinity, -Infinity];
      for (let n = 0; n < array.length; n++) {
        const axis = n % 3;
        if (!Number.isFinite(array[n])) throw new Error('invalid position');
        acc.min[axis] = Math.min(acc.min[axis], array[n]); acc.max[axis] = Math.max(acc.max[axis], array[n]);
      }
    }
    return doc.accessors.push(acc) - 1;
  }
  const textureMap = new Map();
  for (const group of groups) {
    const uv = group.uv.map((n, i) => i % 2 ? 1 - n : n);
    const attributes = { POSITION: accessor(group.vertices, 'VEC3', 3, true), NORMAL: accessor(group.normals, 'VEC3', 3),
      TEXCOORD_0: accessor(uv, 'VEC2', 2) };
    for (const { id, blend, indices } of group.parts) {
      if (!textureMap.has(id)) {
        const bufferView = view(await readTexture(source, id, cache));
        const image = doc.images.push({ bufferView, mimeType: 'image/webp' }) - 1;
        textureMap.set(id, doc.textures.push({ extensions: { EXT_texture_webp: { source: image } } }) - 1);
      }
      const material = doc.materials.push({ doubleSided: true, alphaMode: blend > 1 ? 'BLEND' : blend === 1 ? 'MASK' : 'OPAQUE',
        pbrMetallicRoughness: { baseColorTexture: { index: textureMap.get(id) }, metallicFactor: 0, roughnessFactor: 1 } }) - 1;
      if (indices.some(n => !Number.isInteger(n) || n >= group.vertices.length / 3)) throw new Error('invalid triangle');
      doc.meshes[0].primitives.push({ attributes, indices: accessor(indices, 'SCALAR', 1), material });
    }
  }
  if (!doc.meshes[0].primitives.length) throw new Error('no textured geometry');
  doc.buffers.push({ byteLength: offset });
  const json = Buffer.from(JSON.stringify(doc)), jsonLength = json.length + pad(json.length);
  const header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
  header.write('glTF'); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + jsonLength + offset, 8);
  header.writeUInt32LE(jsonLength, 12); header.write('JSON', 16); binHeader.writeUInt32LE(offset); binHeader.write('BIN\0', 4);
  return Buffer.concat([header, json, Buffer.alloc(pad(json.length), 32), binHeader, ...chunks]);
}

async function main() {
  fs.mkdirSync(directory, { recursive: true }); fs.mkdirSync(scratch, { recursive: true });
  const source = await openLocal();
  if (source.build.Version !== '12.1.5.70961') throw new Error('Recheck catalog and structure identities for build ' + source.build.Version);
  const cache = path.join(scratch, source.build.Version);
  fs.mkdirSync(cache, { recursive: true });
  const structural = require('./structural-models.json');
  const targets = new Map();
  for (const row of rows) {
    if (fs.existsSync(path.join(root, 'assets/decor-models/task084', row.record_id + '.glb'))) continue;
    const model = structural[row.record_id] || { asset: row.asset_id };
    if (!model.asset) throw new Error('Missing file ID for ' + row.record_id);
    targets.set(model.asset, model);
  }
  const errors = [];
  let count = 0;
  for (const [key, model] of targets) {
    if (process.argv.includes('--structures') && model.modelType !== 2) continue;
    const file = path.join(directory, key + '.glb');
    if (!fs.existsSync(file) || process.argv.includes('--rebuild')) {
      try {
        const bytes = await exportModel(source, model.asset, model.modelType === 2, cache);
        fs.writeFileSync(file + '.tmp', bytes); fs.renameSync(file + '.tmp', file);
      } catch (error) {
        errors.push({ key, error: error.message });
        if (errors.length <= 5) console.error(key, error.stack);
      }
    }
    if (++count % 100 === 0) console.log(count, 'of', targets.size, 'errors', errors.length);
  }
  fs.writeFileSync(path.join(scratch, process.argv.includes('--structures') ? 'structure-errors.json' : 'errors.json'), JSON.stringify(errors, null, 2));
  if (errors.length) process.exitCode = 1;
}
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
