#!/usr/bin/env node
/**
 * recon-task51.js — 任务书 #51 WP1 侦察脚本（只读，anon 公开读通道，零写入）
 *
 * 侦察项：
 *   ① 图标：库内 icon_file_id 实态 vs assets/decor-icons/ 磁盘实态双向对账
 *   ④ category_ids / subcategory_ids 值域普查（分类名可得性判断素材）
 *   ⑤ 宠物窝候选：can_customize=true 全量 + 名称/tags 关键词（宠物/笼/窝/食盆/水盆/食水/兽栏）圈选
 *   杂项：entry_type 分布、sources 十类分布、price 键形分布、tags 键域/资料片值域、
 *         quality/size/placement_cost 值域、基准六件（28350/27973/27043/675/25546/8176）全字段
 *
 * 防坑实证：PostgREST 单请求 1000 行上限——本脚本按 1000/页循环拉满，打印每页行数。
 *
 * 用法：node scripts/recon-task51.js   （自动读项目根 .env，不打印任何密钥）
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ---- .env 手写解析（与 server.js 同口径） ----
function loadEnv() {
  const p = path.join(ROOT, '.env');
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}
const env = loadEnv();
const BASE = (env.COZE_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/+$/, '');
const ANON = env.COZE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '';
if (!BASE || !ANON) { console.error('缺 SUPABASE_URL / ANON_KEY'); process.exit(1); }

const SELECT = 'record_id,entry_type,item_id,name,icon_file_id,quality,size,placement_cost,category_ids,subcategory_ids,source_text,tags,indoors,outdoors,can_customize,sources';

async function fetchAll() {
  const rows = [];
  let offset = 0;
  for (;;) {
    const url = `${BASE}/rest/v1/decor_catalog?select=${SELECT}&order=record_id.asc&offset=${offset}&limit=1000`;
    const res = await fetch(url, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
    if (!res.ok) { console.error('REST 失败', res.status, await res.text()); process.exit(1); }
    const batch = await res.json();
    console.log(`[分页] offset=${offset} 返回 ${batch.length} 行`);
    rows.push(...batch);
    if (batch.length < 1000) break;
    offset += 1000;
  }
  return rows;
}

(async () => {
  const rows = await fetchAll();
  console.log(`\n[总量] ${rows.length} 行`);

  // ---- entry_type 分布 ----
  const byType = {};
  for (const r of rows) byType[r.entry_type] = (byType[r.entry_type] || 0) + 1;
  console.log('[entry_type]', JSON.stringify(byType));

  // ---- ① 图标对账 ----
  const withIcon = rows.filter(r => r.icon_file_id != null);
  const noIcon = rows.filter(r => r.icon_file_id == null);
  console.log(`\n[①图标] 库内 icon_file_id 非空 ${withIcon.length} / 空 ${noIcon.length}`);
  const dbIds = new Set(withIcon.map(r => String(r.icon_file_id)));
  const disk = fs.readdirSync(path.join(ROOT, 'assets/decor-icons')).filter(f => f.endsWith('.png'));
  const diskIds = new Set(disk.filter(f => f !== '_placeholder.png').map(f => f.replace(/\.png$/, '')));
  const nonNumeric = [...diskIds].filter(f => !/^\d+$/.test(f));
  console.log(`[①图标] 磁盘 PNG ${disk.length}（含 _placeholder.png），非数字命名 ${nonNumeric.length} 个${nonNumeric.length ? ': ' + nonNumeric.join(',') : ''}`);
  const missingOnDisk = [...dbIds].filter(id => !diskIds.has(id));
  const orphanOnDisk = [...diskIds].filter(id => !dbIds.has(id));
  console.log(`[①图标] 库有盘无 ${missingOnDisk.length}${missingOnDisk.length ? ': ' + missingOnDisk.slice(0, 20).join(',') + (missingOnDisk.length > 20 ? '…' : '') : ''}`);
  console.log(`[①图标] 盘有库无 ${orphanOnDisk.length}${orphanOnDisk.length ? ': ' + orphanOnDisk.slice(0, 20).join(',') + (orphanOnDisk.length > 20 ? '…' : '') : ''}`);
  console.log('[①图标] icon_file_id 为空的 record_id:', noIcon.map(r => r.record_id).join(','));

  // ---- ④ 分类值域 ----
  const catCount = {}, subCount = {};
  let catNull = 0, subNull = 0;
  for (const r of rows) {
    const c = Array.isArray(r.category_ids) ? r.category_ids : [];
    const s = Array.isArray(r.subcategory_ids) ? r.subcategory_ids : [];
    if (!c.length) catNull++;
    if (!s.length) subNull++;
    for (const x of c) catCount[x] = (catCount[x] || 0) + 1;
    for (const x of s) subCount[x] = (subCount[x] || 0) + 1;
  }
  console.log(`\n[④分类] category_ids 空 ${catNull} 行；distinct ${Object.keys(catCount).length} 个:`);
  console.log(JSON.stringify(catCount));
  console.log(`[④分类] subcategory_ids 空 ${subNull} 行；distinct ${Object.keys(subCount).length} 个:`);
  console.log(JSON.stringify(subCount));
  // 每类取 2 个样本名辅助人工判断类别语义
  const catSample = {};
  for (const r of rows) for (const x of (Array.isArray(r.category_ids) ? r.category_ids : [])) {
    (catSample[x] = catSample[x] || []).length < 3 && catSample[x].push(r.name);
  }
  console.log('[④分类] 各类样本名:', JSON.stringify(catSample, null, 1));

  // ---- ⑤ 宠物窝候选 ----
  const cust = rows.filter(r => r.can_customize === true);
  console.log(`\n[⑤窝类] can_customize=true 共 ${cust.length} 件`);
  const KW = /宠物|笼|窝|食盆|水盆|食水|兽栏|喂食|宠物屋|小窝/;
  const hits = rows.filter(r => {
    const tagVals = r.tags && typeof r.tags === 'object' ? Object.values(r.tags).join(' ') : '';
    return KW.test(r.name) || KW.test(tagVals);
  });
  console.log(`[⑤窝类] 名称/tags 关键词命中 ${hits.length} 件（含非 can_customize）:`);
  for (const r of hits) {
    console.log(`  ${r.record_id}\t${r.name}\tcan_customize=${r.can_customize}\ttags=${JSON.stringify(r.tags)}`);
  }
  const custHits = hits.filter(r => r.can_customize === true);
  console.log(`[⑤窝类] 交集（can_customize=true 且关键词命中）${custHits.length} 件: ${custHits.map(r => r.record_id + ' ' + r.name).join(' | ') || '（无）'}`);
  // can_customize=true 全量清单（供顾问圈定）
  console.log('[⑤窝类] can_customize=true 全量清单:');
  for (const r of cust) console.log(`  ${r.record_id}\t${r.name}\tentry_type=${r.entry_type}\ttags=${JSON.stringify(r.tags)}`);

  // ---- sources 十类分布 + price 键形 ----
  const typeCount = {}, priceShape = {};
  let srcNull = 0, srcEmpty = 0;
  for (const r of rows) {
    if (r.sources == null) { srcNull++; continue; }
    if (Array.isArray(r.sources) && r.sources.length === 0) { srcEmpty++; continue; }
    for (const s of (r.sources || [])) {
      typeCount[s.type] = (typeCount[s.type] || 0) + 1;
      if (Array.isArray(s.price)) for (const p of s.price) {
        const shape = Object.keys(p).sort().join('+');
        priceShape[shape] = (priceShape[shape] || 0) + 1;
      }
    }
  }
  console.log(`\n[sources] null ${srcNull} / 空数组 ${srcEmpty} / 非空 ${rows.length - srcNull - srcEmpty}`);
  console.log('[sources] 类型分布:', JSON.stringify(typeCount));
  console.log('[sources] price 键形分布:', JSON.stringify(priceShape));

  // currency_id / item_id / texture 值域复核
  const curSet = new Set(), itemSet = new Set(), texSet = new Set();
  for (const r of rows) for (const s of (r.sources || [])) if (Array.isArray(s.price)) for (const p of s.price) {
    if (p.currency_id != null) curSet.add(p.currency_id);
    if (p.item_id != null) itemSet.add(p.item_id);
    if (p.texture != null) texSet.add(p.texture + '(amount=' + p.amount + ')');
  }
  console.log('[值域] currency_id:', [...curSet].sort((a, b) => a - b).join(','));
  console.log('[值域] item_id:', [...itemSet].sort((a, b) => a - b).join(','));
  console.log('[值域] texture:', [...texSet].join(','));

  // ---- tags 键域与值域 ----
  const tagKeys = {}, tagVals = {};
  let tagsNull = 0;
  for (const r of rows) {
    if (!r.tags || typeof r.tags !== 'object') { tagsNull++; continue; }
    for (const [k, v] of Object.entries(r.tags)) {
      tagKeys[k] = (tagKeys[k] || 0) + 1;
      (tagVals[k] = tagVals[k] || new Set()).add(v);
    }
  }
  console.log(`\n[tags] 空 ${tagsNull} 行；键域:`, JSON.stringify(tagKeys));
  for (const k of Object.keys(tagVals)) {
    console.log(`[tags] ${k} 值域(${tagVals[k].size}): ${[...tagVals[k]].join(' | ')}`);
  }

  // ---- quality / size / placement_cost 值域 ----
  const q = {}, sz = {}, pc = {};
  for (const r of rows) {
    q[r.quality] = (q[r.quality] || 0) + 1;
    sz[r.size] = (sz[r.size] || 0) + 1;
    pc[r.placement_cost] = (pc[r.placement_cost] || 0) + 1;
  }
  console.log('\n[quality]', JSON.stringify(q));
  console.log('[size]', JSON.stringify(sz));
  console.log('[placement_cost]', JSON.stringify(pc));

  // ---- 基准六件全字段 ----
  const WANT = [28350, 27973, 27043, 675, 25546, 8176];
  console.log('\n[基准六件]');
  for (const id of WANT) {
    const r = rows.find(x => x.record_id === id);
    console.log(r ? JSON.stringify(r, null, 1) : `  ${id} 未找到!`);
  }
})().catch(e => { console.error(e); process.exit(1); });
