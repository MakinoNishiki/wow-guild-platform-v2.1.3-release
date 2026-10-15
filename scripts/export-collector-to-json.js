// scripts/export-collector-to-json.js — WoWButlerCollector SavedVariables → JSON 转换器（任务书 #75 子任务 A2）
// 复用 REQ-121 工作流：插件记录进 SavedVariables（/reload 或退出登录落盘 Lua 表）→ 本脚本转 JSON。
// 输入：WTF\Account\<账号>\SavedVariables\WoWButlerCollector.lua（省略时自动扫描游戏目录取最新一份）
// 输出：export/wowbutler_collector_YYYYMMDD_HHmmss.json（数组，字段与插件记录一致 + slotCN 中文部位）
// 零第三方依赖，Node 18+ 直跑。Lua 解析器与 scripts/validate-export.js 同一实现口径（WoW 序列化子集）。
// 用法: node scripts/export-collector-to-json.js [WoWButlerCollector.lua 路径] [--wow-dir <_retail_ 目录>]
'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULT_WOW_DIR = 'C:/Azeroth/World of Warcraft/_retail_';

// ---------- 极简 Lua SavedVariables 解析（与 validate-export.js 同口径，WoW 序列化形态子集） ----------
function tokenize(src) {
  const toks = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\f' || c === '\v') { i++; continue; }
    if (c === '-' && src[i + 1] === '-') {
      if (src[i + 2] === '[' && src[i + 3] === '[') { const e = src.indexOf(']]', i + 4); i = e < 0 ? n : e + 2; }
      else { while (i < n && src[i] !== '\n') i++; }
      continue;
    }
    if (c === '"') {
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

const asArr = t => Array.isArray(t) ? t : (t && typeof t === 'object' ? Array.from({ length: t.__len || 0 }, (_, i) => t[i + 1]) : []);

// ---------- INVTYPE → 中文部位（与 js/lootTaxonomy.js 词表口径对齐；武器/副手类归并） ----------
const INVTYPE_ZH = {
  INVTYPE_HEAD: '头部', INVTYPE_SHOULDER: '肩部', INVTYPE_CHEST: '胸部', INVTYPE_ROBE: '胸部',
  INVTYPE_WRIST: '腕部', INVTYPE_HAND: '手部', INVTYPE_WAIST: '腰部', INVTYPE_LEGS: '腿部',
  INVTYPE_FEET: '脚部', INVTYPE_CLOAK: '背部', INVTYPE_NECK: '颈部', INVTYPE_FINGER: '手指',
  INVTYPE_TRINKET: '饰品',
  INVTYPE_WEAPON: '武器', INVTYPE_2HWEAPON: '武器', INVTYPE_WEAPONMAINHAND: '武器',
  INVTYPE_WEAPONOFFHAND: '武器', INVTYPE_RANGED: '武器', INVTYPE_RANGEDRIGHT: '武器',
  INVTYPE_SHIELD: '副手', INVTYPE_HOLDABLE: '副手',
};

// ---------- 定位最新 SavedVariables ----------
function locateLuaFile(argPath, wowDir) {
  if (argPath) {
    if (!fs.existsSync(argPath)) throw new Error(`文件不存在：${argPath}`);
    return argPath;
  }
  const svRoot = path.join(wowDir, 'WTF', 'Account');
  if (!fs.existsSync(svRoot)) throw new Error(`未找到 WTF/Account 目录：${svRoot}（可用 --wow-dir 指定 _retail_ 目录）`);
  let best = null;
  for (const acc of fs.readdirSync(svRoot)) {
    const f = path.join(svRoot, acc, 'SavedVariables', 'WoWButlerCollector.lua');
    if (fs.existsSync(f)) {
      const mtime = fs.statSync(f).mtimeMs;
      if (!best || mtime > best.mtime) best = { file: f, mtime };
    }
  }
  if (!best) throw new Error('未找到 WoWButlerCollector.lua（请先在游戏内 /reload 落盘）');
  return best.file;
}

// ---------- 主流程 ----------
function main() {
  const args = process.argv.slice(2);
  let argPath = null, wowDir = process.env.WOW_RETAIL_DIR || DEFAULT_WOW_DIR;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--wow-dir') { wowDir = args[++i]; }
    else argPath = args[i];
  }
  const file = locateLuaFile(argPath, wowDir);
  console.log(`输入：${file}`);

  const env = parseLua(fs.readFileSync(file, 'utf8'));
  const raw = env.WoWButlerCollectorDB;
  const rows = asArr(raw);
  if (!rows.length) { console.error('❌ SavedVariables 为空（WoWButlerCollectorDB 无记录）'); process.exit(1); }

  const out = [];
  const warn = [];
  rows.forEach((r, idx) => {
    const item = {
      itemName: typeof r.itemName === 'string' ? r.itemName : '',
      itemID: typeof r.itemID === 'number' ? r.itemID : null,
      iconID: typeof r.iconID === 'number' ? r.iconID : null,
      quality: typeof r.quality === 'number' ? r.quality : null,
      ilvl: typeof r.ilvl === 'number' ? r.ilvl : null,
      slot: typeof r.slot === 'string' ? r.slot : '',
      slotCN: INVTYPE_ZH[r.slot] || r.slot || '',
      itemType: typeof r.itemType === 'string' ? r.itemType : '',
      bossName: typeof r.bossName === 'string' ? r.bossName : '',
      instanceName: typeof r.instanceName === 'string' ? r.instanceName : '',
      difficulty: typeof r.difficulty === 'string' ? r.difficulty : '',
      difficultyID: typeof r.difficultyID === 'number' ? r.difficultyID : null,
      timestamp: typeof r.timestamp === 'number' ? r.timestamp : null,
      timestampISO: typeof r.timestamp === 'number' ? new Date(r.timestamp * 1000).toISOString() : null,
      playerName: typeof r.playerName === 'string' ? r.playerName : '',
    };
    if (!item.itemName || item.itemID == null) warn.push(`第 ${idx + 1} 条缺 itemName/itemID`);
    out.push(item);
  });

  const dir = path.join(ROOT_EXPORT);
  fs.mkdirSync(dir, { recursive: true });
  const ts = new Date();
  const pad = n => String(n).padStart(2, '0');
  const outFile = path.join(dir, `wowbutler_collector_${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.json`);
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));

  // 摘要（先查证再断言：覆盖率实测打印）
  const byInst = {};
  let iconOk = 0, qDist = {};
  for (const r of out) {
    byInst[r.instanceName || '(野外/未知)'] = (byInst[r.instanceName || '(野外/未知)'] || 0) + 1;
    if (r.iconID != null) iconOk++;
    qDist[r.quality] = (qDist[r.quality] || 0) + 1;
  }
  console.log(`输出：${outFile}`);
  console.log(`记录数：${out.length}；iconID 覆盖 ${iconOk}/${out.length}；品质分布 ${JSON.stringify(qDist)}`);
  console.log('副本分布：');
  for (const [k, v] of Object.entries(byInst).sort((a, b) => b[1] - a[1])) console.log(`  ${v} × ${k}`);
  if (warn.length) { console.log('⚠️ 缺损告警：'); warn.slice(0, 10).forEach(w => console.log('  ' + w)); }
  console.log('✅ 转换完成');
}
const ROOT_EXPORT = path.join(__dirname, '..', 'export');

main();
