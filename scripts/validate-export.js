// scripts/validate-export.js — WoWButlerExporter 导出文件本地校验（任务书 #26 管道配套）
// 判据口径：addon/WoWButlerExporter/运营测试步骤卡.md（V14-V17 + V3/V6 终审权威版）
// 用法：node scripts/validate-export.js [导出文件路径] [--wow-dir <_retail_ 目录>]
//   省略路径时自动扫描游戏目录 WTF/Account/*/SavedVariables/WoWButlerExporter.lua，取最新一份。
// 零第三方依赖，Node 18+ 直跑。退出码：任一文件侧判据 ❌ → 1，否则 0。
// 判定图例：✅ 文件侧通过 / ❌ 文件侧判负 / ⚠️ 文件侧无法判定或存疑（需聊天框截图或人工佐证）
'use strict';
const fs = require('fs');
const path = require('path');

// ---------- 常量（判据口径，赛季更替时随步骤卡更新） ----------
const DEFAULT_WOW_DIR = 'C:/Azeroth/World of Warcraft/_retail_';
// V15：三团本实例基线（名称匹配=前缀包含；件数±容差，烈毒之渊为步骤卡明示 ±4）
const EXPECT_RAIDS = [
  { match: '至暗之夜', expect: 8, tol: 2 },
  { match: '潮缚', expect: 13, tol: 2 },   // DB 全名 潮缚石窟（巢穴）
  { match: '烈毒之渊', expect: 114, tol: 4 },
];
const RAID_TOTAL = { expect: 135, tol: 10 };   // V1：团本合计 135±
const DUNGEON_TOTAL = { expect: 225, tol: 10 }; // V14：大米 8 本合计 225±
const EXPECT_DUNGEON_COUNT = 8;                 // BUG-095 期望实例集常量（与插件 EXPECTED_INSTANCE_COUNT 同步）
const EXPECT_RAID_COUNT = 3;
// S2 大米 8 本期望名单（2026-08-14 顾问侧按 DB game_dungeons 新赛季集登记；名单不符只 ⚠️ 不 ❌，硬闸=本数+合计）
const EXPECT_DUNGEON_NAMES = ['毒牙祭坛', '虚空之痕竞技场', '纳洛拉克的洞穴', '密谋小径', '夺目谷', '诸王之眠', '塞塔里斯神庙', '红玉新生法池'];
// V16 冒烟门槛（1.0.20 加严）：鲁阿夏尔 8/8 全带档 + 拉维 7/7 全带档
const SMOKE_GATES = [
  { instance: '至暗之夜', boss: '鲁阿夏尔', items: 8 },
  { instance: '毒牙祭坛', boss: '拉维', items: 7 },
];
// V3/V17：报障样本与 flavor 排除样本
const VENOM_SAMPLE_ID = 271876; // 觉醒恐牙胸甲
const VENOM_SAMPLE_EFFECT = '装备：你的法术和技能有几率使你的爆击提高377，但会使你的其他次要属性降低62，持续12秒。';
const FLAVOR_SAMPLE_ID = 270165; // flavor 句「"毒咒如影随形。"」不得误判毒咒
const VENOM_TARGET_COUNT = 8;   // V3 复验口径「毒咒八件全中」（名单在顾问侧，件数对账）
const MPLUS_TRINKET_TARGET = 24; // V6：M+ 饰品 effect 非空 24/24
const BOSS_ITEM_SANITY_MAX = 40; // BUG-096 sanity 守卫（与插件 BOSS_ITEM_SANITY_MAX 同步）

// ---------- 极简 Lua SavedVariables 解析（零依赖，仅覆盖 WoW 序列化形态） ----------
function tokenize(src) {
  const toks = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\f' || c === '\v') { i++; continue; }
    if (c === '-' && src[i + 1] === '-') { // 注释
      if (src[i + 2] === '[' && src[i + 3] === '[') { const e = src.indexOf(']]', i + 4); i = e < 0 ? n : e + 2; }
      else { while (i < n && src[i] !== '\n') i++; }
      continue;
    }
    if (c === '"') { // 字符串（WoW 序列化只用双引号；\ddd 数字转义如 \124=|）
      let j = i + 1, out = '';
      while (j < n && src[j] !== '"') {
        if (src[j] === '\\') {
          const nx = src[j + 1];
          if (nx >= '0' && nx <= '9') {
            let k = j + 1, num = '';
            while (k < n && src[k] >= '0' && src[k] <= '9' && num.length < 3) { num += src[k]; k++; }
            out += String.fromCharCode(parseInt(num, 10)); j = k;
          } else {
            const map = { n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"', "'": "'", a: '\x07', b: '\b', f: '\f', v: '\v', '0': '\0' };
            out += map[nx] !== undefined ? map[nx] : nx; j += 2;
          }
        } else { out += src[j]; j++; }
      }
      toks.push({ t: 'str', v: out }); i = j + 1; continue;
    }
    if (c === '[' && src[i + 1] === '[') { const e = src.indexOf(']]', i + 2); toks.push({ t: 'str', v: e < 0 ? src.slice(i + 2) : src.slice(i + 2, e) }); i = e < 0 ? n : e + 2; continue; }
    if ((c >= '0' && c <= '9') || (c === '-' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
      let j = i; if (src[j] === '-') j++;
      while (j < n && /[0-9.eE+-]/.test(src[j]) && (j === i || /[0-9.eE]/.test(src[j]) || ((src[j] === '+' || src[j] === '-') && /[eE]/.test(src[j - 1])))) j++;
      toks.push({ t: 'num', v: parseFloat(src.slice(i, j)) }); i = j; continue;
    }
    if (/[A-Za-z_]/.test(c)) { let j = i; while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++; toks.push({ t: 'ident', v: src.slice(i, j) }); i = j; continue; }
    if ('{}[]=,;'.includes(c)) { toks.push({ t: 'sym', v: c }); i++; continue; }
    throw new Error(`词法错误 @${i}: 无法识别字符 ${JSON.stringify(c)}`);
  }
  return toks;
}

function parseLua(src) {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const eat = () => toks[p++];
  function expectSym(s) { const tk = eat(); if (!tk || tk.t !== 'sym' || tk.v !== s) throw new Error(`语法错误 @${p}: 期望 ${s}，实得 ${tk ? tk.v : 'EOF'}`); }
  function parseValue() {
    const tk = peek();
    if (!tk) throw new Error('语法错误：意外 EOF');
    if (tk.t === 'str' || tk.t === 'num') return eat().v;
    if (tk.t === 'ident') { eat(); if (tk.v === 'true') return true; if (tk.v === 'false') return false; if (tk.v === 'nil') return null; throw new Error(`语法错误 @${p}: 未知标识符 ${tk.v}`); }
    if (tk.t === 'sym' && tk.v === '{') return parseTable();
    throw new Error(`语法错误 @${p}: 意外记号 ${tk.v}`);
  }
  function parseTable() {
    expectSym('{');
    const arr = []; let hash = null;
    while (peek() && !(peek().t === 'sym' && peek().v === '}')) {
      const tk = peek();
      if (tk.t === 'sym' && tk.v === '[') {
        eat(); const key = parseValue(); expectSym(']'); expectSym('='); const val = parseValue();
        (hash = hash || {})[key] = val;
      } else if (tk.t === 'ident' && toks[p + 1] && toks[p + 1].t === 'sym' && toks[p + 1].v === '=') {
        eat(); expectSym('='); const val = parseValue();
        (hash = hash || {})[tk.v] = val;
      } else {
        arr.push(parseValue());
      }
      if (peek() && peek().t === 'sym' && (peek().v === ',' || peek().v === ';')) eat();
    }
    expectSym('}');
    if (hash) { arr.forEach((v, idx) => { hash[idx + 1] = v; }); hash.__len = arr.length; return hash; }
    return arr;
  }
  const env = {};
  while (p < toks.length) {
    const tk = eat();
    if (tk.t !== 'ident') throw new Error(`语法错误 @${p}: 顶层期望变量名，实得 ${tk.v}`);
    expectSym('=');
    env[tk.v] = parseValue();
  }
  return env;
}

// ---------- 结构访问辅助 ----------
const asArr = t => Array.isArray(t) ? t : (t && typeof t === 'object' ? Array.from({ length: t.__len || 0 }, (_, i) => t[i + 1]) : []);
const tget = (t, k) => (t && typeof t === 'object' && !Array.isArray(t)) ? t[k] : undefined;
const hashKeys = t => (t && typeof t === 'object' && !Array.isArray(t)) ? Object.keys(t).filter(k => k !== '__len') : [];
const isNonEmptyStr = v => typeof v === 'string' && v.trim() !== '';
const isVenom = v => typeof v === 'string' && /^毒咒\s*$/.test(v);
const hasTiers = it => hashKeys(tget(it, 'primary_tiers')).length > 0 || hashKeys(tget(it, 'secondary_tiers')).length > 0;

function iterInstances(dump) {
  const out = [];
  for (const [seg, key] of [['团本', 'raids'], ['大秘境', 'dungeons']]) {
    for (const inst of asArr(tget(dump, key))) {
      const bosses = asArr(tget(inst, 'bosses')).map(b => ({ name: tget(b, 'boss'), loot: asArr(tget(b, 'loot')), failed: asArr(tget(b, 'failed')) }));
      out.push({ seg, name: tget(inst, 'instance'), bosses, items: bosses.reduce((s, b) => s + b.loot.length, 0) });
    }
  }
  return out;
}
function allItems(dump) {
  const rows = [];
  for (const inst of iterInstances(dump)) for (const b of inst.bosses) for (const it of b.loot) rows.push({ seg: inst.seg, instance: inst.name, boss: b.name, item: it });
  return rows;
}

// ---------- 主流程 ----------
function main() {
  const args = process.argv.slice(2);
  let fileArg = null, wowDir = process.env.WOW_RETAIL_DIR || DEFAULT_WOW_DIR;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--wow-dir') { wowDir = args[++i]; }
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log('用法：node scripts/validate-export.js [导出文件路径] [--wow-dir <_retail_ 目录>]\n省略路径时自动扫描游戏目录 WTF/Account/*/SavedVariables/ 取最新 WoWButlerExporter.lua。');
      process.exit(0);
    } else fileArg = args[i];
  }

  // 定位导出文件
  let file = fileArg;
  if (!file) {
    const accRoot = path.join(wowDir, 'WTF', 'Account');
    let best = null;
    let accs = [];
    try { accs = fs.readdirSync(accRoot, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); }
    catch { console.error(`❌ 找不到游戏目录：${accRoot}（可用 --wow-dir 或 WOW_RETAIL_DIR 指定）`); process.exit(2); }
    for (const acc of accs) {
      const f = path.join(accRoot, acc, 'SavedVariables', 'WoWButlerExporter.lua');
      try { const st = fs.statSync(f); if (!best || st.mtimeMs > best.mtime) best = { f, mtime: st.mtimeMs, acc }; } catch { /* 无此文件 */ }
    }
    if (!best) { console.error(`❌ 各账号 SavedVariables 下均无 WoWButlerExporter.lua（扫描：${accs.join(', ') || '空'}）`); process.exit(2); }
    file = best.f;
    console.log(`[自动定位] 账号 ${best.acc}（${accs.length} 个账号中取最新）`);
  }
  const src = fs.readFileSync(file, 'utf8');
  const env = parseLua(src);
  const dump = env.WJDCDump;
  if (!dump) { console.error('❌ 文件内无 WJDCDump 顶级表——不是有效的导出文件'); process.exit(2); }
  const meta = tget(dump, 'meta') || {};
  const lastCounts = env.WJDCLastCounts || null;

  console.log('========================================');
  console.log(' WoWButlerExporter 导出文件校验');
  console.log('========================================');
  console.log(`文件：${file}`);
  console.log(`meta：addon=${meta.addon || '?'} run_id=${meta.run_id || '?'} time=${meta.time || '?'} type=${meta.type || '?'} client=${meta.client || '?'} build=${meta.build || '?'}`);
  console.log(`通道：tier_channel=${meta.tier_channel || '?'} dungeon_tier_channel=${meta.dungeon_tier_channel || '?'}`);
  const flags = [];
  if (meta.partial) flags.push('partial=true（断链跑产物，BUG-088 口径：不可作验收全量）');
  if (meta.smoke) flags.push('smoke=true（冒烟产物：只判 V16 冒烟门槛，不判全量判据）');
  if (meta.abnormal) flags.push('abnormal=true（BUG-095 质量门命中：本跑 LastCounts 应未覆写）');
  if (flags.length) console.log(`标记：${flags.join('；')}`);

  const results = []; // {id, status, title, details[]}
  const R = (id, status, title, details) => results.push({ id, status, title, details: details || [] });

  // ---- 版本三方对照（验收门禁①的机械化） ----
  const readTocVer = p => { try { const m = fs.readFileSync(p, 'utf8').match(/^## Version:\s*(\S+)/m); return m && m[1]; } catch { return null; } };
  const repoVer = readTocVer(path.join(__dirname, '..', 'addon', 'WoWButlerExporter', 'WoWButlerExporter.toc'));
  const gameTocPath = path.join(wowDir, 'Interface', 'AddOns', 'WoWButlerExporter', 'WoWButlerExporter.toc');
  const gameVer = readTocVer(gameTocPath);
  {
    const d = [`仓库 toc=${repoVer || '?'} / 游戏目录 toc=${gameVer || '(未安装或不可读)'} / 本文件 meta.addon=${meta.addon || '?'}`];
    let st = '✅';
    if (repoVer && gameVer && repoVer !== gameVer) { st = '❌'; d.push(`游戏目录插件版本落后/超前于仓库——按门禁①喊停：先把仓库 addon/WoWButlerExporter 整目录复制到 ${path.join(wowDir, 'Interface', 'AddOns')} 并 /reload`); }
    else if (gameVer == null) { st = '❌'; d.push('游戏目录未检测到插件 toc——按门禁①喊停：先安装插件'); }
    if (meta.addon && repoVer && meta.addon !== repoVer) { st = '❌'; d.push(`本导出由插件 ${meta.addon} 产生，非当前仓库版 ${repoVer}——本文件不能作为新版判据的验收产物`); }
    R('VER', st, '版本三方对照（仓库 toc / 游戏目录 toc / 导出 meta.addon）', d);
  }

  // ---- 角色档案导出短路（me 段与掉落段并存的混合文件不短路） ----
  const hasLootSections = asArr(tget(dump, 'raids')).length > 0 || asArr(tget(dump, 'dungeons')).length > 0;
  if (meta.type === 'me' || (tget(dump, 'me') && !hasLootSections)) {
    console.log('\n本文件为 /wjdc me 角色档案导出，掉落判据不适用。');
    process.exit(0);
  }

  const instances = iterInstances(dump);
  const items = allItems(dump);
  const raidInsts = instances.filter(x => x.seg === '团本');
  const dungInsts = instances.filter(x => x.seg === '大秘境');
  const raidTotal = raidInsts.reduce((s, x) => s + x.items, 0);
  const dungTotal = dungInsts.reduce((s, x) => s + x.items, 0);
  const skipped = asArr(tget(dump, 'skipped_instances'));

  if (meta.smoke) {
    // ================= 冒烟产物：V16 门槛 =================
    for (const g of SMOKE_GATES) {
      const inst = instances.find(x => String(x.name || '').includes(g.instance));
      const boss = inst && inst.bosses.find(b => String(b.name || '').includes(g.boss));
      if (!boss) { R('V16', '❌', `冒烟门槛：${g.instance}/${g.boss} 在文件中找不到`, []); continue; }
      const tiered = boss.loot.filter(hasTiers).length;
      const names = boss.loot.map(it => `${tget(it, 'id')} ${tget(it, 'name')}`).join('；');
      const st = (boss.loot.length === g.items && tiered === g.items) ? '✅' : '❌';
      R('V16', st, `冒烟门槛：${g.boss} ${boss.loot.length}/${g.items} 件、带档 ${tiered}/${g.items}`, [`物品清单（归属人工核对）：${names || '（空）'}`]);
    }
    R('V16', '⚠️', '冒烟门槛：快照 slot=15 为聊天框判据，文件侧不可判', ['需冒烟跑聊天框「难度档快照」行截图佐证']);
  } else {
    // ================= 全量产物：V14-V17 + V3/V6 =================
    // ---- V14（BUG-094）：大米 8 本全出件、合计 225± ----
    {
      const zeroD = dungInsts.filter(x => x.items === 0).map(x => x.name);
      const d1 = [`在场 ${dungInsts.length}/${EXPECT_DUNGEON_COUNT} 本，合计 ${dungTotal} 件（判据 ${DUNGEON_TOTAL.expect}±${DUNGEON_TOTAL.tol}）`];
      let st = '✅';
      if (dungInsts.length !== EXPECT_DUNGEON_COUNT) { st = '❌'; d1.push(`本数不符：期望 ${EXPECT_DUNGEON_COUNT} 本，实到 ${dungInsts.length} 本`); }
      if (zeroD.length) { st = '❌'; d1.push(`零件副本：${zeroD.join('、')}`); }
      if (Math.abs(dungTotal - DUNGEON_TOTAL.expect) > DUNGEON_TOTAL.tol) { st = '❌'; d1.push(`合计 ${dungTotal} 超出 ${DUNGEON_TOTAL.expect - DUNGEON_TOTAL.tol}~${DUNGEON_TOTAL.expect + DUNGEON_TOTAL.tol} 带域`); }
      const missing = EXPECT_DUNGEON_NAMES.filter(n => !dungInsts.some(x => String(x.name || '').includes(n)));
      const extra = dungInsts.filter(x => !EXPECT_DUNGEON_NAMES.some(n => String(x.name || '').includes(n))).map(x => x.name);
      if (missing.length || extra.length) { if (st === '✅') st = '⚠️'; d1.push(`期望名单偏差（S2 登记名单，仅提示）：缺 ${missing.join('、') || '无'}；多出 ${extra.join('、') || '无'}`); }
      R('V14', st, 'BUG-094：大米 8 本全出件、合计 225±', d1);
      R('V14', '⚠️', 'BUG-094：钉档失败红字绝迹 / 旧本「改钉」快照注记为聊天框判据', ['文件侧旁证：dungeon_tier_channel=' + (meta.dungeon_tier_channel || '?') + '；大米带档件数 ' + items.filter(r => r.seg === '大秘境' && hasTiers(r.item)).length + '/' + dungTotal + '——需聊天框截图终判']);
    }
    // ---- V15（BUG-094/095）：三团本在场 + skipped_instances 留痕 ----
    {
      for (const e of EXPECT_RAIDS) {
        const inst = raidInsts.find(x => String(x.name || '').includes(e.match));
        if (!inst) { R('V15', '❌', `三团本在场：${e.match}（${e.expect}±${e.tol}）`, ['实例缺席—— BUG-094 失踪特征现形']); continue; }
        const ok = Math.abs(inst.items - e.expect) <= e.tol;
        R('V15', ok ? '✅' : '❌', `三团本在场：${inst.name} ${inst.items} 件（判据 ${e.expect}±${e.tol}）`, ok ? [] : [`件数越界：${inst.items} 不在 ${e.expect - e.tol}~${e.expect + e.tol}`]);
      }
      if (skipped.length === 0) {
        R('V15', '✅', 'skipped_instances 留痕：文件无 skipped_instances（真空才出现，符合预期）', []);
      } else {
        R('V15', '⚠️', `skipped_instances 留痕：${skipped.length} 条——需逐条对聊天框红字佐证「真空才跳过」`, skipped.map(s => JSON.stringify(s)));
      }
      if (meta.abnormal) R('V15', '❌', 'BUG-095 质量门：meta.abnormal=true（异常跑）', ['按门径 WJDCLastCounts 应原样保留——请核对上次计数未被本跑覆写']);
      else R('V15', '⚠️', 'BUG-095 残缺跑门径（LastCounts 拒覆写）只能异常跑被动验证', ['本跑无 abnormal 标记，属正常跑；095 门以代码面走查通过为准']);
    }
    // ---- V16（BUG-096）：A/B 一致性代理 + sanity 守卫 ----
    {
      if (lastCounts) {
        const diffs = [];
        for (const inst of instances) {
          const prev = lastCounts[`${inst.seg}/${inst.name}`];
          if (typeof prev === 'number' && prev !== inst.items) diffs.push(`${inst.seg}/${inst.name} 上次 ${prev} → 本次 ${inst.items}`);
        }
        if (diffs.length === 0) R('V16', '✅', 'A/B 连跑件数一致性（代理判据：本次 vs WJDCLastCounts 全等）', ['注意：LastCounts 为上一完整跑基线，全等=跨跑稳定；严格 A/B 同会话连跑仍以两跑聊天框/两文件并比为准']);
        else R('V16', '⚠️', `A/B 连跑件数一致性（代理）：${diffs.length} 处与上次计数不一致`, diffs.concat(['若两次为同会话 A/B 连跑产物则判 ❌；若 LastCounts 是更早跑基线需结合聊天框「计数对比」黄字定夺']));
      } else {
        R('V16', '⚠️', 'A/B 连跑件数一致性：文件无 WJDCLastCounts 基线，无法代理比对', ['首跑或基线被质量门拒写——以两跑文件并比/聊天框为准']);
      }
      const over = [];
      for (const inst of instances) for (const b of inst.bosses) if (b.loot.length > BOSS_ITEM_SANITY_MAX) over.push(`${inst.name}/${b.name} ${b.loot.length} 件`);
      R('V16', over.length ? '❌' : '✅', `单 BOSS 件数 sanity 守卫（>${BOSS_ITEM_SANITY_MAX} 即异常）`, over.length ? over : ['全 BOSS 件数 ≤' + BOSS_ITEM_SANITY_MAX + '，守卫零触发']);
      if (meta.abnormal) R('V16', '❌', 'meta.abnormal 标记', ['sanity/完整性五源之一已触发，见 V15 明细']);
      R('V16', '⚠️', '冒烟门槛（slot=15 + 鲁阿夏尔 8/8 + 拉维 7/7）需冒烟产物判定', ['本文件为全量导出；冒烟结论见冒烟跑文件另跑本脚本，或直接对全量对账表核查两 BOSS 行']);
    }
    // ---- V17 / V3：毒咒样本 ----
    {
      const sample = items.filter(r => Number(tget(r.item, 'id')) === VENOM_SAMPLE_ID);
      if (!sample.length) {
        R('V17', '❌', `V17/V3：${VENOM_SAMPLE_ID}（觉醒恐牙胸甲）不在导出文件中`, ['样本件缺席，先查所属 BOSS/实例是否在场']);
        R('V3', '❌', `V3：${VENOM_SAMPLE_ID} effect 逐字判据`, ['样本件缺席，无法判定']);
      } else {
        const it = sample[0].item;
        const ven = tget(it, 'venomcurse');
        R('V17', isVenom(ven) ? '✅' : '❌', `V17：271876 venomcurse=毒咒 持续命中（${sample[0].instance}/${sample[0].boss}）`, [`实采 venomcurse=${JSON.stringify(ven ?? null)}`]);
        const eff = tget(it, 'effect');
        R('V3', eff === VENOM_SAMPLE_EFFECT ? '✅' : '❌', 'V3：271876 effect 逐字命中（史诗档文本）', [eff === VENOM_SAMPLE_EFFECT ? '逐字一致' : `实采 effect=${JSON.stringify(eff ?? null)}`, `期望=${VENOM_SAMPLE_EFFECT}`].filter(Boolean));
      }
      const venomRows = items.filter(r => isVenom(tget(r.item, 'venomcurse')));
      const vList = venomRows.map(r => `${tget(r.item, 'id')} ${tget(r.item, 'name')}（${r.instance}/${r.boss}）`);
      R('V3', venomRows.length === VENOM_TARGET_COUNT ? '✅' : '⚠️', `V3：毒咒八件全中——文件侧命中 ${venomRows.length}/${VENOM_TARGET_COUNT} 件`, vList.length ? vList.concat(venomRows.length === VENOM_TARGET_COUNT ? [] : ['件数与「八件」口径不符——对照顾问侧八件名单逐件销账']) : ['零命中——E2 毒咒残差特征现形（1.0.16 前病害）']);
      const fl = items.filter(r => Number(tget(r.item, 'id')) === FLAVOR_SAMPLE_ID);
      if (!fl.length) R('V3', '⚠️', 'V3：270165 flavor 不误判', ['270165 不在导出文件中，无法判定（若该件本就不掉可忽略）']);
      else R('V3', isVenom(tget(fl[0].item, 'venomcurse')) ? '❌' : '✅', 'V3：270165 flavor 句「"毒咒如影随形。"」不误判', [`实采 venomcurse=${JSON.stringify(tget(fl[0].item, 'venomcurse') ?? null)}（应为空）`]);
    }
    // ---- V6：M+ 饰品 effect 24/24 ----
    {
      const tr = items.filter(r => r.seg === '大秘境' && tget(r.item, 'slot') === '饰品');
      const ok = tr.filter(r => isNonEmptyStr(tget(r.item, 'effect')));
      const bad = tr.filter(r => !isNonEmptyStr(tget(r.item, 'effect'))).map(r => `${tget(r.item, 'id')} ${tget(r.item, 'name')}（${r.instance}）`);
      let st = '✅';
      if (ok.length !== MPLUS_TRINKET_TARGET || tr.length !== MPLUS_TRINKET_TARGET) st = '❌';
      R('V6', st, `M+ 饰品 effect 非空 ${ok.length}/${tr.length}（判据 ${MPLUS_TRINKET_TARGET}/${MPLUS_TRINKET_TARGET}）`,
        (tr.length !== MPLUS_TRINKET_TARGET ? [`饰品总数 ${tr.length} ≠ ${MPLUS_TRINKET_TARGET}——先确认大米段完整性（V14）再判 V6`] : [])
          .concat(bad.length ? ['effect 空件：' + bad.join('；')] : (tr.length ? ['全件 effect 非空'] : [])));
    }
  }

  // ---------- 件数对账表 ----------
  console.log('\n---------------- 件数对账表 ----------------');
  const pad = (s, w) => { s = String(s); let w2 = 0; for (const ch of s) w2 += ch.charCodeAt(0) > 255 ? 2 : 1; return s + ' '.repeat(Math.max(0, w - w2)); };
  console.log(pad('段', 8) + pad('实例', 18) + pad('BOSS', 6) + pad('本次', 6) + pad('上次', 6) + pad('Δ', 6) + pad('期望', 12) + '判定');
  for (const inst of instances) {
    const prev = lastCounts ? lastCounts[`${inst.seg}/${inst.name}`] : undefined;
    const e = inst.seg === '团本' ? EXPECT_RAIDS.find(x => String(inst.name || '').includes(x.match)) : null;
    const expStr = e ? `${e.expect}±${e.tol}` : '—';
    let judge = '—';
    if (e) judge = Math.abs(inst.items - e.expect) <= e.tol ? '✅' : '❌';
    else if (typeof prev === 'number') judge = prev === inst.items ? '✅' : '⚠️';
    if (inst.items === 0) judge = '❌';
    console.log(pad(inst.seg, 8) + pad(inst.name, 18) + pad(inst.bosses.length, 6) + pad(inst.items, 6) + pad(typeof prev === 'number' ? prev : '—', 6) + pad(typeof prev === 'number' ? (inst.items - prev >= 0 ? '+' : '') + (inst.items - prev) : '—', 6) + pad(expStr, 12) + judge);
  }
  console.log(pad('团本合计', 26) + pad('', 6) + pad(raidTotal, 6) + pad('', 6) + pad('', 6) + pad(`${RAID_TOTAL.expect}±${RAID_TOTAL.tol}`, 12) + (Math.abs(raidTotal - RAID_TOTAL.expect) <= RAID_TOTAL.tol ? '✅' : '❌'));
  console.log(pad('大米合计', 26) + pad('', 6) + pad(dungTotal, 6) + pad('', 6) + pad('', 6) + pad(`${DUNGEON_TOTAL.expect}±${DUNGEON_TOTAL.tol}`, 12) + (Math.abs(dungTotal - DUNGEON_TOTAL.expect) <= DUNGEON_TOTAL.tol ? '✅' : '❌'));
  // 异常明细：0 件 BOSS / failed 列表
  const zeroBoss = [], failedRows = [];
  for (const inst of instances) for (const b of inst.bosses) {
    if (b.loot.length === 0) zeroBoss.push(`${inst.seg}/${inst.name}/${b.name}`);
    for (const f of b.failed) failedRows.push(`${inst.name}/${b.name}: ${JSON.stringify(f)}`);
  }
  if (zeroBoss.length) console.log(`\n零件 BOSS（${zeroBoss.length}）：${zeroBoss.join('；')}`);
  if (failedRows.length) console.log(`failed 段（${failedRows.length} 条，按步骤卡第 9 步须与聊天框红字同时出现）：\n  ${failedRows.join('\n  ')}`);

  // ---------- 预判清单输出 ----------
  console.log('\n---------------- V14-V17 + V3/V6 预判清单 ----------------');
  for (const r of results) {
    console.log(`${r.status} ${r.id}  ${r.title}`);
    for (const d of r.details) console.log(`     ${d}`);
  }
  const nG = results.filter(r => r.status === '✅').length;
  const nW = results.filter(r => r.status === '⚠️').length;
  const nB = results.filter(r => r.status === '❌').length;
  console.log(`\n汇总：✅${nG} ⚠️${nW} ❌${nB}`);
  if (nB > 0) {
    const acc = file.includes('SavedVariables') ? file.split(/[\\/]/).slice(-3, -2)[0] : '<账号>';
    console.log(`报错栈取证：${path.join(wowDir, 'WTF', 'Account', acc, 'SavedVariables', '!BugGrabber.lua')}（BugSack 数据文件）`);
  }
  console.log('说明：⚠️ 项为文件侧无法终判项（聊天框红字/快照行/截图证据），不阻塞退出码；❌ 项为文件侧硬判负。');
  process.exit(nB > 0 ? 1 : 0);
}

main();
