// scripts/validate-export.js — WoWButlerExporter 导出文件本地校验（任务书 #26 管道配套 / REQ-121）
// 判据口径：addon/WoWButlerExporter/运营测试步骤卡.md（V1-V17 文件侧可判项，终审权威版）
// 用法：node scripts/validate-export.js [跑A文件 跑B文件] [--wow-dir <_retail_ 目录>]
//   省略路径时自动扫描游戏目录 WTF/Account/*/SavedVariables/WoWButlerExporter.lua，取最新一份。
//   给两个文件时按同会话连跑 跑A/跑B 处理：V1 逐实例件数比对，其余判据跑在跑B（后跑文件）上。
// 零第三方依赖，Node 18+ 直跑。退出码：任一文件侧判据 ❌ → 1，否则 0。
// 判定图例：✅ 文件侧通过 / ❌ 文件侧判负 / ⚠️ 文件侧无法判定或存疑（需聊天框截图或人工佐证）
'use strict';
const fs = require('fs');
const path = require('path');

// ---------- 常量（判据口径，赛季更替时随步骤卡更新） ----------
const DEFAULT_WOW_DIR = 'C:/Azeroth/World of Warcraft/_retail_';
// V15：三团本实例基线（名称匹配=前缀包含；件数±容差，烈毒之渊为步骤卡明示 ±4）
// 至暗之夜 1.0.22 起改 32±4：DB boss_loot 已录 4 首领各 8 件（合计 32）——12.1 EJ 四首领
// 在册且各有掉落表，097 修复后应出件；旧 8±2 系「12.0 仅 1 encounter」时代口径（待运营裁定）
const EXPECT_RAIDS = [
  { match: '至暗之夜', expect: 32, tol: 4 },
  { match: '潮缚', expect: 13, tol: 2 },   // DB 全名 潮缚石窟（巢穴）
  { match: '烈毒之渊', expect: 114, tol: 4 },
];
const RAID_TOTAL = { expect: 159, tol: 10 };   // V1：团本合计 159±（至暗 32 口径随上，待运营裁定）
const DUNGEON_TOTAL = { expect: 225, tol: 10 }; // V14：大米 8 本合计 225±
const EXPECT_DUNGEON_COUNT = 8;                 // BUG-095 期望实例集常量（与插件 EXPECTED_INSTANCE_COUNT 同步）
const EXPECT_RAID_COUNT = 3;
// S2 大米 8 本期望名单（2026-08-14 顾问侧按 DB game_dungeons 新赛季集登记；名单不符只 ⚠️ 不 ❌，硬闸=本数+合计）
const EXPECT_DUNGEON_NAMES = ['毒牙祭坛', '虚空之痕竞技场', '纳洛拉克的洞穴', '密谋小径', '夺目谷', '诸王之眠', '塞塔里斯神庙', '红玉新生法池'];
// V16 冒烟门槛（1.0.22 堵 097 门洞）：烈毒之渊全 8 BOSS 合计 114±4（2 号位起枚举路径进网）+
// 毒牙祭坛前 2 BOSS（拉维 7/7 全带档+扭缠盘蛇>0）；
// 至暗之夜=无难度维世界首领类目，不进冒烟网，留全量验（见 V15）
const SMOKE_RAID = { instance: '烈毒之渊', bosses: 8, items: 114, tol: 4 };
const SMOKE_GATES = [
  { instance: '毒牙祭坛', boss: '拉维', items: 7, tol: 0 },
  { instance: '毒牙祭坛', boss: '扭缠盘蛇', items: 1, tol: 0, minOnly: true },  // 2 号位路径在网即达标，件数阈值首跑后校准
];
// V15（1.0.21 终案）：至暗之夜=无难度维（世界首领整合类目）——4 首领、tiers 仅 normal 单档
const NO_DIFF_INSTANCE = { match: '至暗之夜', bosses: 4 };
// V3/V17：毒咒逐件名单（2026-08-14 运营终裁提供，REQ-121 升级逐件核对）
const VENOM_EQUIP_IDS = [268215, 268202, 268207, 271874, 271875, 268265, 271876, 271878]; // 装备八件：venomcurse 应=毒咒
const VENOM_TOKEN_IDS = [270911, 270919, 270915, 270927, 270923]; // 兑换物五件（毒咒族）：venomcurse 应空，不误标
const VENOM_SAMPLE_ID = 271876; // 觉醒恐牙胸甲（V3/V17 逐字判据件，在八件名单内）
const VENOM_SAMPLE_EFFECT = '装备：你的法术和技能有几率使你的爆击提高377，但会使你的其他次要属性降低62，持续12秒。';
const FLAVOR_SAMPLE_ID = 270165; // flavor 句「"毒咒如影随形。"」不得误判毒咒
// V2：大米 28 件缺席 + 4 件新增 ID 清单（docs/插件1.0.12-修法送审件.md 附录，2026-08-14 抄录入库；
// 文件侧只供在场/缺席状态，「错档/去重/真缺数据」去向定性属顾问侧）
const V2_ABSENT = [[159644, '盖蒂伊库，死界之伤'], [273777, '防毒踏靴'], [160216, '碎玉弯刀'], [273649, '达萨的束风纹章'], [273795, '盘卷牙石'], [239045, '晋升仪式披肩'], [159667, '临终仪式器皿'], [273785, '始源仪式法袍'], [159409, '防腐平稳护腕'], [239050, '迅猛龙之王头盔'], [159312, '干燥工的庇护手套'], [239051, '一统肩甲'], [159412, '金泥践踏者'], [159243, '睿智巫毒便鞋'], [159234, '绒线护腿'], [159418, '致命净化束腰'], [159300, '库拉的屠宰裹腕'], [159618, '姆沁巴的仪式绷带'], [239047, '第一帝国头饰'], [273793, '多头蛇刺双刃'], [159137, '金色风蛇之牙'], [159645, '恳求碎颅者'], [273780, '毒液蚀刻新月刃'], [159413, '鸟类守护者手套'], [159313, '神圣大厅马裤'], [159301, '原始恐龙统领的腰带'], [239048, '圣洁爱慕外衣'], [159304, '金羽长靴']];
const V2_NEW = [[159921, '迅猛龙枯骨'], [160832, '完好的眼镜蛇蛋'], [268728, '迅叶龙药膏'], [276804, '扭缠群嗣']];
const PSEUDO_INSTANCE = '史诗钥石地下城'; // V7：伪实例绝迹（BUG-087）
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
  const posArgs = [];
  let wowDir = process.env.WOW_RETAIL_DIR || DEFAULT_WOW_DIR;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--wow-dir') { wowDir = args[++i]; }
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log('用法：node scripts/validate-export.js [跑A文件 跑B文件] [--wow-dir <_retail_ 目录>]\n省略路径时自动扫描游戏目录 WTF/Account/*/SavedVariables/ 取最新 WoWButlerExporter.lua。\n给两个文件时按同会话连跑处理：V1 逐实例件数比对，其余判据跑在跑B 上。');
      process.exit(0);
    } else posArgs.push(args[i]);
  }
  if (posArgs.length > 2) { console.error('❌ 至多两个文件参数（跑A 跑B）'); process.exit(2); }
  const fileA = posArgs.length === 2 ? posArgs[0] : null;

  // 定位导出文件（主判文件=跑B/单文件/自动最新）
  let file = posArgs.length === 2 ? posArgs[1] : posArgs[0];
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

  // ---- ilvl_tiers 非空率报告（1.0.27，REQ-116 副轨）——报告型：不升硬闸、不影响退出码 ----
  // 逐实例统计带 ilvl_tiers 非空的件数/总件数；旧版导出（无 ilvl_tiers 键）两态兼容：
  // 全文件无键 → 打印「未采集（旧版导出）」提示，不判 ❌
  {
    console.log('\n---------------- ilvl_tiers 非空率（1.0.27 报告型，不影响退出码） ----------------');
    let anyKey = false;
    for (const inst of instances) {
      let tot = 0, hit = 0;
      for (const b of inst.bosses) for (const it of b.loot) {
        tot++;
        if (tget(it, 'ilvl_tiers') !== undefined) anyKey = true;
        if (hashKeys(tget(it, 'ilvl_tiers')).length > 0) hit++;
      }
      console.log(`  ${inst.seg}/${inst.name}：ilvl_tiers 非空 ${hit}/${tot} 件`);
    }
    if (!anyKey) console.log('  未采集（旧版导出）——文件无 ilvl_tiers 键，不判定');
  }

  // ---- V13（BUG-088）：断链留痕——中断跑 meta.partial 在场 / 完整跑无 partial 键 ----
  if (meta.partial) R('V13', '✅', '断链零留存：meta.partial 在场（中断跑产物留痕正确）', [`已扫实例 ${instances.length} 个已按段落表；注意：断链产物不可作验收全量`]);
  else R('V13', '✅', '断链零留存：完整跑无 partial 键', meta.smoke ? ['冒烟产物，partial 口径同适用'] : []);

  // ---- V7（BUG-087）：伪实例「史诗钥石地下城」绝迹 ----
  {
    const pseudo = instances.filter(x => String(x.name || '').includes(PSEUDO_INSTANCE));
    R('V7', pseudo.length ? '❌' : '✅', `伪实例「${PSEUDO_INSTANCE}」绝迹`, pseudo.length ? [`命中 ${pseudo.length} 个：${pseudo.map(x => `${x.seg}/${x.name}`).join('、')}——伪实例过滤失效`] : ['导出文件两段均无伪实例']);
  }

  // ---- V1：同会话双跑一致性（双文件比对；跑A vs 跑B 同实例件数全等） ----
  if (!meta.smoke) {
    if (!fileA) {
      R('V1', '⚠️', '双跑一致性：未提供跑A 文件，文件侧无法比对', ['用法：node scripts/validate-export.js 跑A.lua 跑B.lua（V16 行有 LastCounts 代理比对可参考）']);
    } else {
      const dumpA = parseLua(fs.readFileSync(fileA, 'utf8')).WJDCDump;
      if (!dumpA) R('V1', '❌', '双跑一致性：跑A 文件无 WJDCDump', [fileA]);
      else if (tget(tget(dumpA, 'meta') || {}, 'smoke')) R('V1', '⚠️', '双跑一致性：跑A 为冒烟产物，不可与全量比对', []);
      else {
        const instA = iterInstances(dumpA);
        const mapA = {}, mapB = {};
        instA.forEach(x => { mapA[`${x.seg}/${x.name}`] = x.items; });
        instances.forEach(x => { mapB[`${x.seg}/${x.name}`] = x.items; });
        const diffs = [];
        for (const k of new Set([...Object.keys(mapA), ...Object.keys(mapB)])) {
          const a = mapA[k], b = mapB[k];
          if (a !== b) diffs.push(`${k} 跑A=${a === undefined ? '缺席' : a} → 跑B=${b === undefined ? '缺席' : b}`);
        }
        const sumA = { r: instA.filter(x => x.seg === '团本').reduce((s, x) => s + x.items, 0), d: instA.filter(x => x.seg === '大秘境').reduce((s, x) => s + x.items, 0) };
        const head = `跑A（${fileA}）：团本 ${sumA.r} / 大米 ${sumA.d}；跑B（本文件）：团本 ${raidTotal} / 大米 ${dungTotal}`;
        R('V1', diffs.length ? '❌' : '✅', `双跑一致性：同实例件数${diffs.length ? `有 ${diffs.length} 处差异` : '全等'}（跑A vs 跑B）`, [head].concat(diffs));
      }
    }
  }

  if (meta.smoke) {
    // ================= 冒烟产物：V16 门槛（1.0.22 堵 097 门洞） =================
    {
      const inst = instances.find(x => String(x.name || '').includes(SMOKE_RAID.instance));
      if (!inst) { R('V16', '❌', `冒烟门槛：${SMOKE_RAID.instance} 在文件中找不到`, []); }
      else {
        const det = [];
        let st = '✅';
        if (inst.bosses.length !== SMOKE_RAID.bosses) { st = '❌'; det.push(`BOSS 数 ${inst.bosses.length} ≠ ${SMOKE_RAID.bosses}`); }
        if (Math.abs(inst.items - SMOKE_RAID.items) > SMOKE_RAID.tol) { st = '❌'; det.push(`合计 ${inst.items} 不在 ${SMOKE_RAID.items - SMOKE_RAID.tol}~${SMOKE_RAID.items + SMOKE_RAID.tol} 带域`); }
        const zero = inst.bosses.filter(b => b.loot.length === 0).map(b => b.name);
        if (zero.length) { st = '❌'; det.push(`零件 BOSS（097 特征）：${zero.join('、')}`); }
        const tiered = inst.bosses.reduce((s, b) => s + b.loot.filter(hasTiers).length, 0);
        det.push(`带档 ${tiered}/${inst.items}（档值抽验，归属人工核对）`);
        R('V16', st, `冒烟门槛：${SMOKE_RAID.instance} 全 ${SMOKE_RAID.bosses} BOSS 合计 ${inst.items}/${SMOKE_RAID.items}±${SMOKE_RAID.tol} 件`, det);
      }
    }
    for (const g of SMOKE_GATES) {
      const inst = instances.find(x => String(x.name || '').includes(g.instance));
      const boss = inst && inst.bosses.find(b => String(b.name || '').includes(g.boss));
      if (!boss) { R('V16', '❌', `冒烟门槛：${g.instance}/${g.boss} 在文件中找不到`, []); continue; }
      const tiered = boss.loot.filter(hasTiers).length;
      const names = boss.loot.map(it => `${tget(it, 'id')} ${tget(it, 'name')}`).join('；');
      if (g.minOnly) {
        const st = boss.loot.length >= g.items ? '✅' : '❌';
        R('V16', st, `冒烟门槛：${g.boss} ${boss.loot.length} 件（≥${g.items} 即达标，2 号位路径在网）、带档 ${tiered}/${boss.loot.length}`, [`物品清单（归属人工核对）：${names || '（空）'}`]);
      } else {
        const countOK = Math.abs(boss.loot.length - g.items) <= (g.tol || 0);
        const st = (countOK && tiered === boss.loot.length) ? '✅' : '❌';
        R('V16', st, `冒烟门槛：${g.boss} ${boss.loot.length}/${g.items}${g.tol ? '±' + g.tol : ''} 件、带档 ${tiered}/${boss.loot.length}`, [`物品清单（归属人工核对）：${names || '（空）'}`]);
      }
    }
    // ---- V3（1.0.23，BUG-099）：毒咒八件全中=冒烟硬项（八件均在冒烟范围·烈毒之渊）；免疫侧在场件零误标 ----
    {
      const byId = id => items.filter(r => Number(tget(r.item, 'id')) === id);
      const det = []; let hit = 0, bad = 0;
      for (const id of VENOM_EQUIP_IDS) {
        const rows = byId(id);
        if (!rows.length) { bad++; det.push(`${id}：缺席（冒烟范围内未采到——先查 V16 件数门槛）`); continue; }
        const v = tget(rows[0].item, 'venomcurse');
        if (isVenom(v)) { hit++; det.push(`${id} ${tget(rows[0].item, 'name')}（${rows[0].instance}/${rows[0].boss}）：命中 ✅`); }
        else { bad++; det.push(`${id} ${tget(rows[0].item, 'name')}（${rows[0].instance}/${rows[0].boss}）：未中标，实采=${JSON.stringify(v ?? null)} ❌`); }
      }
      R('V3', bad ? '❌' : '✅', `毒咒装备八件全中（冒烟硬项）——命中 ${hit}/8`, det.concat(bad ? ['未中标=BUG-099 残差现形：对聊天框「毒咒疑似行」转义 dump（\\n/| 逐字节显形）定字节形态'] : []));
      const badImm = [];
      for (const id of [...VENOM_TOKEN_IDS, FLAVOR_SAMPLE_ID]) {
        const rows = byId(id);
        if (rows.length && isVenom(tget(rows[0].item, 'venomcurse'))) badImm.push(`${id} ${tget(rows[0].item, 'name')}`);
      }
      R('V3', badImm.length ? '❌' : '✅', '免疫侧（兑换物五件+flavor 270165）不误标', badImm.length ? [`误标：${badImm.join('；')}`] : ['在场件零误标（缺席件不判）']);
    }
    R('V16', '⚠️', '冒烟门槛：快照 slot=15 为聊天框判据，文件侧不可判', ['需冒烟跑聊天框「难度档快照」行截图佐证']);
  } else {
    // ================= 全量产物：V1-V17 文件侧可判项 =================
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
      // 1.0.22（BUG-097）：零件 BOSS 硬闸——任何 0 件 BOSS=097 特征（1 号位出件、2 号起全 0），硬判负
      {
        const zb = [];
        for (const x of instances) for (const b of x.bosses) if (b.loot.length === 0) zb.push(`${x.seg}/${x.name}/${b.name}`);
        R('V15', zb.length ? '❌' : '✅', 'BUG-097：零件 BOSS 绝迹（多 BOSS 实例 2 号位起枚举路径）',
          zb.length ? [`命中 ${zb.length} 个（097 特征现形）：${zb.slice(0, 8).join('；')}${zb.length > 8 ? ' …' : ''}`] : ['两段全 BOSS 均出件']);
      }
      // 1.0.21 终案：至暗之夜=无难度维（世界首领整合类目）——4 首领 + tiers 仅 normal 单档
      {
        const inst = raidInsts.find(x => String(x.name || '').includes(NO_DIFF_INSTANCE.match));
        if (inst) {
          const det = [];
          let st = '✅';
          if (inst.bosses.length !== NO_DIFF_INSTANCE.bosses) { st = '❌'; det.push(`首领数 ${inst.bosses.length} ≠ ${NO_DIFF_INSTANCE.bosses}`); }
          const badKeys = {}, noTier = [];
          for (const b of inst.bosses) for (const it of b.loot) {
            const keys = [...hashKeys(tget(it, 'primary_tiers')), ...hashKeys(tget(it, 'secondary_tiers'))];
            if (!keys.length) { noTier.push(`${tget(it, 'id')} ${tget(it, 'name')}`); continue; }
            for (const k of keys) if (k !== 'normal') (badKeys[k] = badKeys[k] || []).push(`${tget(it, 'id')} ${tget(it, 'name')}（${b.name}）`);
          }
          const badNames = Object.keys(badKeys);
          if (badNames.length) { st = '❌'; det.push(`出现 normal 以外档键 ${badNames.join('/')}——094 四档污染特征现形：`); for (const k of badNames) det.push(`  ${k}: ${badKeys[k].slice(0, 5).join('；')}${badKeys[k].length > 5 ? ' …' : ''}`); }
          if (noTier.length) det.push(`无 tiers 件 ${noTier.length}（无数值品类天然不产档，仅提示）：${noTier.slice(0, 5).join('；')}${noTier.length > 5 ? ' …' : ''}`);
          det.push('快照「无难度维（世界首领类）」注记为聊天框判据，需截图佐证');
          R('V15', st, `至暗之夜终案形态：${NO_DIFF_INSTANCE.bosses} 首领 + tiers 仅 normal 单档`, det);
        }
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
      R('V16', '⚠️', '冒烟门槛（slot=15 + 烈毒之渊全 8 BOSS 114±4 + 拉维 7/7 + 扭缠盘蛇>0）需冒烟产物判定', ['本文件为全量导出；冒烟结论见冒烟跑文件另跑本脚本，或直接对全量对账表核查对应行']);
    }
    // ---- V17 / V3：毒咒逐件核对（2026-08-14 运营终裁名单） ----
    {
      const byId = id => items.filter(r => Number(tget(r.item, 'id')) === id);
      const sample = byId(VENOM_SAMPLE_ID);
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
      // 装备八件：逐件应中
      {
        const det = []; let hit = 0, miss = 0, absent = 0;
        for (const id of VENOM_EQUIP_IDS) {
          const rows = byId(id);
          if (!rows.length) { absent++; det.push(`${id}：缺席（不在导出文件）`); continue; }
          const v = tget(rows[0].item, 'venomcurse');
          if (isVenom(v)) { hit++; det.push(`${id} ${tget(rows[0].item, 'name')}（${rows[0].instance}/${rows[0].boss}）：命中 ✅`); }
          else { miss++; det.push(`${id} ${tget(rows[0].item, 'name')}（${rows[0].instance}/${rows[0].boss}）：未采到，实采=${JSON.stringify(v ?? null)} ❌`); }
        }
        R('V3', (miss === 0 && absent === 0) ? '✅' : '❌', `V3：毒咒装备八件逐件核对——命中 ${hit}/8（未采到 ${miss}、缺席 ${absent}）`, det.concat((miss || absent) ? ['未采到=E2 毒咒残差现形；缺席=完整性问题先查 V14/V15'] : []));
      }
      // 兑换物五件 + flavor 干扰件：逐件应空不误标
      {
        const det = []; let clean = 0, dirty = 0, absent = 0;
        for (const id of [...VENOM_TOKEN_IDS, FLAVOR_SAMPLE_ID]) {
          const rows = byId(id);
          if (!rows.length) { absent++; det.push(`${id}：缺席（不在导出文件，无法判定）`); continue; }
          const v = tget(rows[0].item, 'venomcurse');
          if (isVenom(v)) { dirty++; det.push(`${id} ${tget(rows[0].item, 'name')}：误标毒咒 ❌`); }
          else { clean++; det.push(`${id} ${tget(rows[0].item, 'name')}：空值正确 ✅`); }
        }
        R('V3', dirty ? '❌' : (absent ? '⚠️' : '✅'), `V3：兑换物五件+flavor 干扰件（270165）不误标——干净 ${clean}/6（误标 ${dirty}、缺席 ${absent}）`, det);
      }
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
    // ---- V2：大米 28 件缺席 + 4 件新增 ID 销账（文件侧只供在场状态，去向定性属顾问侧） ----
    {
      const byId = id => items.filter(r => Number(tget(r.item, 'id')) === id);
      const line = ([id, name]) => {
        const rows = byId(id);
        return rows.length ? `${id} ${name}：在场（${rows[0].instance}/${rows[0].boss}）` : `${id} ${name}：缺席`;
      };
      const absentDet = V2_ABSENT.map(line);
      const newDet = V2_NEW.map(line);
      const absentPresent = V2_ABSENT.filter(([id]) => byId(id).length).length;
      const newPresent = V2_NEW.filter(([id]) => byId(id).length).length;
      R('V2', '⚠️', `大米 28 件缺席销账：本次在场 ${absentPresent}/28、缺席 ${28 - absentPresent}/28（清单=1.0.12 送审件附录）`,
        ['「错档/去重/真缺数据」逐件去向定性属顾问侧职责，以下为文件侧在场状态：'].concat(absentDet));
      R('V2', '⚠️', `大米 4 件新增销账：本次在场 ${newPresent}/4`, newDet);
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
  console.log('\n---------------- V 表预判清单（文件侧可判项，按编号排序） ----------------');
  const ORDER = { VER: 0, V1: 1, V2: 2, V3: 3, V6: 6, V7: 7, V13: 13, V14: 14, V15: 15, V16: 16, V17: 17 };
  const sorted = results.slice().sort((a, b) => (ORDER[a.id] ?? 99) - (ORDER[b.id] ?? 99));
  for (const r of sorted) {
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
