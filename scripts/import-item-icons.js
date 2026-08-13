#!/usr/bin/env node
/**
 * REQ-069 / REQ-092（任务书 #46 WP3）：装备图标素材入库管道（零依赖 Node，直接跑）
 *
 * 口径约定：
 * - 真实图源 = 游戏客户端导出，属运营素材供给；本批只交付管道 + 目录约定。
 *   首库约 300 枚，待运营供源图后跑本脚本入库；产物 PNG 不占版本串（APP_VERSION 不动）。
 * - 目录约定：assets/icons/items/{icon_id}.png，文件名 = 纯数字 iconID（与 boss_loot/dungeon_loot.icon_id 对应）；
 *   公示页渲染层 js/dataPublic.js 按规则路径直拼，不走 IconMap 映射表（与职业图标体系隔离）。
 * - 数据侧 icon_id 录入：数据中心掉落表单 / 批量录入第 7 列（js/app.js mdEditLootItem/mdEditDungeonLootItem/mdLootBatchParse）。
 *
 * 用法：node scripts/import-item-icons.js <源目录>
 * 行为：
 * - 扫描源目录（不递归）中的 *.png；文件名必须纯数字（iconID.png），否则跳过；
 * - 校验 PNG 魔数 + IHDR 尺寸；边长 < 36px 仅警告不拦截；
 * - 复制入 assets/icons/items/（不存在则创建）；同名覆盖（幂等，计数提示）；
 * - 结束打印：入库 N 枚（新增 X / 覆盖 Y）/ 跳过 M 个（非数字命名/非 PNG/坏文件）+ 目录总存量。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC_DIR = process.argv[2];
const DEST_DIR = path.join(__dirname, '..', 'assets', 'icons', 'items');
const MIN_EDGE = 36;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

if (!SRC_DIR) {
  console.error('用法：node scripts/import-item-icons.js <源目录>');
  process.exit(1);
}
if (!fs.existsSync(SRC_DIR) || !fs.statSync(SRC_DIR).isDirectory()) {
  console.error(`源目录不存在或不是目录：${SRC_DIR}`);
  process.exit(1);
}

// 读取 PNG 尺寸（IHDR：8 字节魔数 + 4 字节长度 + "IHDR" + 宽高各 4 字节大端）；非法返回 null
function pngSize(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(24);
    if (fs.readSync(fd, head, 0, 24, 0) < 24) return null;
    if (!head.subarray(0, 8).equals(PNG_MAGIC)) return null;
    if (head.toString('ascii', 12, 16) !== 'IHDR') return null;
    return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

fs.mkdirSync(DEST_DIR, { recursive: true });

const entries = fs.readdirSync(SRC_DIR).filter(f => f.toLowerCase().endsWith('.png'));
let added = 0, overwritten = 0, skipped = 0, warned = 0;
const skipReasons = [];

for (const name of entries) {
  const base = name.slice(0, -4); // 去掉 .png
  const src = path.join(SRC_DIR, name);
  if (!fs.statSync(src).isFile()) { skipped++; skipReasons.push(`${name}（非文件）`); continue; }
  if (!/^\d+$/.test(base)) { skipped++; skipReasons.push(`${name}（文件名非纯数字 iconID）`); continue; }
  const size = pngSize(src);
  if (!size) { skipped++; skipReasons.push(`${name}（非合法 PNG 或头损坏）`); continue; }
  if (size.width < MIN_EDGE || size.height < MIN_EDGE) {
    warned++;
    console.warn(`警告：${name} 尺寸 ${size.width}x${size.height} 小于 ${MIN_EDGE}px（仍入库，前端显示约 22px 可能发虚）`);
  }
  const dest = path.join(DEST_DIR, `${base}.png`);
  const existed = fs.existsSync(dest);
  fs.copyFileSync(src, dest);
  if (existed) overwritten++; else added++;
}

const total = fs.readdirSync(DEST_DIR).filter(f => /^\d+\.png$/.test(f)).length;
console.log(`入库 ${added + overwritten} 枚（新增 ${added} / 覆盖 ${overwritten}），跳过 ${skipped} 个${warned ? `，尺寸警告 ${warned} 枚` : ''}；目录总存量 ${total} 枚 → ${path.relative(process.cwd(), DEST_DIR)}`);
if (skipReasons.length) console.log('跳过明细：' + skipReasons.join('；'));
