// 一次性工具（任务书 #22-补丁）：从运营提供的官方源图 UI-LFG-ICON-ROLES.PNG 重裁职责图标
// 纯 Node 内置 zlib 实现 PNG 解码/编码（8-bit RGBA 非隔行），零依赖。
// 用法: node scripts/crop-role-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SRC = path.join(__dirname, '..', 'assets', 'icons', 'roles', 'UI-LFG-ICON-ROLES.PNG');
const OUT_DIR = path.join(__dirname, '..', 'assets', 'icons', 'roles');

// ---------- CRC32 ----------
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------- PNG 解码（8-bit RGBA 非隔行） ----------
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not png');
  let off = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) throw new Error(`unsupported: depth=${bitDepth} type=${colorType} interlace=${interlace}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4, stride = width * bpp;
  const px = Buffer.alloc(width * height * bpp);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = px.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v = (v + a) & 0xff;
      else if (f === 2) v = (v + b) & 0xff;
      else if (f === 3) v = (v + ((a + b) >> 1)) & 0xff;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      } else if (f !== 0) throw new Error('bad filter ' + f);
      out[x] = v;
    }
    prev = out;
  }
  return { width, height, px };
}

// ---------- PNG 编码（filter 0） ----------
function encodePng(width, height, px) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function crop(img, cx, cy, cw, ch) {
  const out = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    img.px.copy(out, y * cw * 4, ((cy + y) * img.width + cx) * 4, ((cy + y) * img.width + cx + cw) * 4);
  }
  return out;
}

// ---------- 主流程 ----------
const img = decodePng(fs.readFileSync(SRC));
console.log(`源图 ${img.width}x${img.height}`);
// 源图为 64×64 单元格网格（256/64=4 列），图标格：盾=(0,1) 十字=(1,0) 剑=(1,1)
const CELL = 64;
const jobs = [
  { name: 'tank', cx: 0, cy: 64 },    // 蓝盾（坦克）：第 2 行第 1 列
  { name: 'healer', cx: 64, cy: 0 },  // 绿十字（治疗）：第 1 行第 2 列
  { name: 'dps', cx: 64, cy: 64 },    // 红剑（输出）：第 2 行第 2 列
];
for (const j of jobs) {
  const px = crop(img, j.cx, j.cy, CELL, CELL);
  const out = encodePng(CELL, CELL, px);
  const file = path.join(OUT_DIR, `${j.name}.png`);
  fs.writeFileSync(file, out);
  console.log(`${j.name}.png  <-  crop(${j.cx},${j.cy},${CELL},${CELL})  ${out.length} bytes`);
}
console.log('完成（请用 ReadMediaFile 目检三枚图标后再提交）');
