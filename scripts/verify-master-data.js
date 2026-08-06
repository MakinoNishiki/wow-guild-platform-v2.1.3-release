// 任务书 #14 验证：V2.2 主数据层（9 表结构 / 唯一索引 / RLS / 字典完整性 / 幂等）
// 用法: node scripts/verify-master-data.js
// 前置：sql/10_master_data.sql 已在 Supabase SQL Editor 执行（未执行时结构类断言自动跳过并提示）。
// 覆盖任务书第十节 8 项；既有 verify-authz.js 另行保持全绿。
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TEST_PORT = 15608;
const PWD = 'Md-Test-2026!';

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const ANON = env.SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const SVC = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

const TABLES = ['game_patches', 'game_seasons', 'game_raids', 'game_bosses', 'boss_loot', 'tier_sets', 'game_dungeons', 'game_classes', 'game_specs'];
const results = [];
let skipped = 0;
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail !== undefined ? `（${detail}）` : ''}`);
}
function skip(name, reason) {
  skipped++;
  console.log(`- ${name}: 跳过（${reason}）`);
}

async function svcRest(method, restPath, body, headers) {
  const res = await fetch(`${SB}${restPath}`, {
    method, headers: { ...SVC, ...(headers || {}) }, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

async function signUpOrIn(email, displayName) {
  const su = await fetch(`${SB}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PWD, data: { display_name: displayName } }),
  });
  const sb = await su.json();
  if (sb.access_token) return { token: sb.access_token, uid: sb.user.id };
  const li = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PWD }),
  });
  const lb = await li.json();
  if (!lb.access_token) throw new Error(`无法获取会话: ${JSON.stringify(lb)}`);
  return { token: lb.access_token, uid: lb.user.id };
}

async function setSuperadmin(uid) {
  // service_role 管理 API 写 app_metadata（生产环境运营账号由运营在 Dashboard 手动设置）
  const res = await fetch(`${SB}/auth/v1/admin/users/${uid}`, {
    method: 'PUT', headers: SVC, body: JSON.stringify({ app_metadata: { role: 'superadmin' } }),
  });
  return res.status;
}

async function userRest(token, method, restPath, body) {
  const res = await fetch(`${SB}${restPath}`, {
    method,
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

async function proxy(token, method, table, body, query) {
  const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/db/rest/v1/${table}${query || ''}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

(async () => {
  console.log('===== 任务书 #14 主数据层验证 =====\n');

  // 1. 9 表存在性（逐表 select 探测；未执行 sql/10 时整批跳过）
  const probe = await svcRest('GET', '/rest/v1/game_raids?select=id&limit=1');
  const migrated = probe.status !== 400 && probe.status !== 404;
  if (!migrated) {
    console.log('⚠ 主数据表不存在（sql/10 未执行）。结构/RLS/数据类断言跳过，请先在 Supabase SQL Editor 执行 sql/10_master_data.sql 后重跑。\n');
    skip('1. 9 张主数据表结构断言', 'sql/10 未执行，待运营执行后重跑');
  } else {
    check('1. 9 张主数据表可探测（sql/10 已执行）', true);
  }

  let admin = null, viewer = null, guildId = null;
  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DEPLOY_RUN_PORT: String(TEST_PORT) },
    stdio: 'ignore',
  });
  await new Promise(r => setTimeout(r, 1000));

  try {
    console.log('\n===== 准备测试账号 =====');
    admin = await signUpOrIn('md-admin@example.com', 'md-admin');
    viewer = await signUpOrIn('md-viewer@example.com', 'md-viewer');
    const g = await svcRest('POST', '/rest/v1/guilds', { name: 'MD验证公会', owner_id: admin.uid, invite_code: 'MDTEST01', server_name: '测试', server_region: '一区' });
    guildId = g.body[0].id;
    await svcRest('POST', '/rest/v1/guild_members', [{ guild_id: guildId, user_id: admin.uid, role: 'owner', display_name: 'md-admin' }]);
    // 注意：signUp 拿到的 token 不含 superadmin claim，设置后需重新登录取新 token
    check('设置 admin 为 superadmin（service_role）', (await setSuperadmin(admin.uid)) === 200);
    const relogin = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'md-admin@example.com', password: PWD }),
    });
    admin.token = (await relogin.json()).access_token;

    if (migrated) {
      // 2. is_current 部分唯一索引：第二个 true 被拒（先清存量当前标记，防环境状态干扰）
      await svcRest('PATCH', '/rest/v1/game_seasons?is_current=eq.true', { is_current: false });
      const s1 = await svcRest('POST', '/rest/v1/game_seasons', { name: 'MD-S1', start_date: '2026-01-01', is_current: true });
      check('2a. 插入第一个 is_current=true', s1.status === 201, s1.status);
      const s2 = await svcRest('POST', '/rest/v1/game_seasons', { name: 'MD-S2', start_date: '2026-08-13', is_current: true });
      check('2b. 第二个 is_current=true 被唯一索引拒绝', s2.status === 409, `${s2.status} ${(s2.body && s2.body.code) || ''}`);
      await svcRest('DELETE', `/rest/v1/game_seasons?name=eq.MD-S1`);

      // 3. RLS：普通账号直连 select 放行、写全拒；代理写非超管 403、超管放行
      const rd = await userRest(viewer.token, 'GET', '/rest/v1/game_raids?select=id&limit=1');
      check('3a. 普通账号 select 放行', rd.status === 200, rd.status);
      const wr = await userRest(viewer.token, 'POST', '/rest/v1/game_raids', { name: '越权团本', type: 'raid' });
      check('3b. 普通账号直连 insert 被 RLS 拒', wr.status === 401 || wr.status === 403, wr.status);
      check('3c. 普通账号代理写主数据 → 403', (await proxy(viewer.token, 'POST', 'game_raids', { name: '越权团本2', type: 'raid' })).status === 403);
      check('3d. 超管代理写主数据 → 201', (await proxy(admin.token, 'POST', 'game_raids', { name: 'MD验证团本', type: 'lair', min_players: 15, max_players: 25 })).status === 201);
      check('3e. 无 JWT 代理写主数据 → 401', (await proxy(null, 'POST', 'game_raids', { name: 'x', type: 'raid' })).status === 401);

      // 4. 字典完整性：内置快照 upsert（service_role 模拟导入器）→ 13 职业 / 40 专精 / role 三值
      // BUG-046：导入器数据源已改为 masterDataSnapshot.js，验证脚本同口径
      const snapSrc2 = fs.readFileSync(path.join(ROOT, 'js', 'masterDataSnapshot.js'), 'utf8');
      const dict = new Function('window', snapSrc2.replace(/\r\n/g, '\n') + '\nreturn window.MASTER_DATA_SNAPSHOT;')({});
      const up1 = await svcRest('POST', '/rest/v1/game_classes?on_conflict=class_key', dict.classes.map(c => ({ class_key: c.class_key, name_zh: c.name_zh, name_en: c.name_en, color: c.color, icon: c.icon })), { 'Prefer': 'return=representation,resolution=merge-duplicates' });
      check('4a. 职业 upsert → 200/201（on_conflict=class_key）', up1.status === 200 || up1.status === 201, up1.status);
      const dbClasses = (await svcRest('GET', '/rest/v1/game_classes?select=id,class_key,icon')).body;
      const specRows = dict.specs.map(s => {
        const cls = dbClasses.find(c => c.class_key === s.class_key);
        // BUG-048：icon 缺省回填职业图标（与前端导入器同口径）
        return { class_id: cls.id, spec_key: s.spec_key, name_zh: s.name_zh, name_en: s.name_en || '', role: s.role, icon: s.icon || cls.icon || '' };
      });
      const up2 = await svcRest('POST', '/rest/v1/game_specs?on_conflict=class_id,spec_key', specRows, { 'Prefer': 'return=representation,resolution=merge-duplicates' });
      check('4b. 专精 upsert → 200/201（on_conflict=class_id,spec_key）', up2.status === 200 || up2.status === 201, up2.status);
      const classCount = (await svcRest('GET', '/rest/v1/game_classes?select=id')).body.length;
      const specCount = (await svcRest('GET', '/rest/v1/game_specs?select=id')).body.length;
      check('4c. game_classes = 13 行', classCount === 13, classCount);
      check('4d. game_specs = 40 行', specCount === 40, specCount);
      const roles = new Set((await svcRest('GET', '/rest/v1/game_specs?select=role')).body.map(r => r.role));
      check('4e. role 枚举仅 TANK/HEALER/DAMAGE', ['TANK', 'HEALER', 'DAMAGE'].every(r => roles.has(r)) && roles.size <= 3, [...roles].join(','));
      // BUG-048：字段完整性断言（此前只断言行数，漏了 role/icon 错配与空值）
      const allSpecs = (await svcRest('GET', '/rest/v1/game_specs?select=name_zh,role,icon,class_id')).body;
      const roleRate = allSpecs.filter(s => !!s.role).length / allSpecs.length;
      const iconRate = allSpecs.filter(s => !!s.icon).length / allSpecs.length;
      check('4f. 导入后 role 非空率 = 100%', roleRate === 1, `${(roleRate * 100).toFixed(0)}%`);
      check('4g. 导入后 icon 非空率 = 100%（缺省回填职业图标）', iconRate === 1, `${(iconRate * 100).toFixed(0)}%`);
      const warriorCls = (await svcRest('GET', `/rest/v1/game_classes?name_zh=eq.战士&select=id`)).body[0];
      const protSpec = allSpecs.find(s => s.class_id === (warriorCls && warriorCls.id) && s.name_zh === '防护');
      check('4h. 职责映射正确（战士防护=TANK）', protSpec && protSpec.role === 'TANK', protSpec && protSpec.role);
      // BUG-048 重开整改：全量 40 行职责映射断言（与内置快照 specRoleMap 口径逐行比对）
      const snapshotRoles = {};
      dict.specs.forEach(s => { snapshotRoles[s.class_key + ':' + s.spec_key] = s.role; });
      const specKeyById = {};
      (await svcRest('GET', '/rest/v1/game_classes?select=id,class_key')).body.forEach(c => { specKeyById[c.id] = c.class_key; });
      const mismatches = [];
      const allSpecsFull = (await svcRest('GET', '/rest/v1/game_specs?select=class_id,spec_key,name_zh,role&order=class_id,spec_key')).body;
      allSpecsFull.forEach(s => {
        const want = snapshotRoles[specKeyById[s.class_id] + ':' + s.spec_key];
        if (!want || s.role !== want) mismatches.push(`${s.name_zh}: 库=${s.role} 应=${want}`);
      });
      check('4i. 全量 40 行职责映射与快照一致（含法/术/猎全系 DAMAGE）', mismatches.length === 0 && allSpecsFull.length === 40,
        mismatches.length ? mismatches.slice(0, 3).join('；') : '40/40');

      // 5. 巢穴边界（数据层）：lair 15-25 已写入；类型约束 raid/lair 之外被拒
      const lair = (await svcRest('GET', '/rest/v1/game_raids?name=eq.MD验证团本&select=type,min_players,max_players')).body[0];
      check('5a. lair 团本 15-25 已落库', lair && lair.type === 'lair' && lair.min_players === 15 && lair.max_players === 25, lair && `${lair.type} ${lair.min_players}-${lair.max_players}`);
      const badType = await svcRest('POST', '/rest/v1/game_raids', { name: '非法类型团本', type: 'dungeon' });
      check('5b. 非法 type（dungeon）被 CHECK 约束拒', badType.status === 400 || badType.status === 409, badType.status);

      // 7. 幂等：重复 upsert 行数不翻倍
      const up3 = await svcRest('POST', '/rest/v1/game_classes?on_conflict=class_key', dict.classes.map(c => ({ class_key: c.class_key, name_zh: c.name_zh, name_en: c.name_en, color: c.color, icon: c.icon })), { 'Prefer': 'return=representation,resolution=merge-duplicates' });
      const classCount2 = (await svcRest('GET', '/rest/v1/game_classes?select=id')).body.length;
      check('7. 字典重复 upsert → 200/201 且行数不翻倍', (up3.status === 200 || up3.status === 201) && classCount2 === 13, `${up3.status}/${classCount2}`);

      // 8. 九区块 CRUD 冒烟（BUG-047 整改要求）：超管代理逐表 insert → select → delete
      // 版本/赛季/团本/BOSS/掉落池/套装/大米/职业/专精 全链路
      const smoke = async (label, table, row, selectQuery) => {
        const ins = await proxy(admin.token, 'POST', table, row);
        const sel = await svcRest('GET', `/rest/v1/${table}?${selectQuery}&select=id&limit=1`);
        const found = Array.isArray(sel.body) && sel.body.length > 0;
        const del = await proxy(admin.token, 'DELETE', table, null, `?${selectQuery}`);
        const sel2 = await svcRest('GET', `/rest/v1/${table}?${selectQuery}&select=id&limit=1`);
        const gone = Array.isArray(sel2.body) && sel2.body.length === 0;
        check(`8. CRUD 冒烟 ${label}（${table}）`, ins.status === 201 && found && del.status === 200 && gone,
          `ins=${ins.status} found=${found} del=${del.status} gone=${gone}`);
      };
      await smoke('版本', 'game_patches', { version: '99.0', name: '冒烟' }, 'version=eq.99.0');
      await smoke('赛季', 'game_seasons', { name: 'MD冒烟季', start_date: '2026-01-01' }, 'name=eq.MD冒烟季');
      const raidIns = await proxy(admin.token, 'POST', 'game_raids', { name: 'MD冒烟团本', type: 'raid', min_players: 20, max_players: 20 });
      const raidRow = Array.isArray(raidIns.body) && raidIns.body[0];
      check('8. CRUD 冒烟 团本（game_raids）', raidIns.status === 201 && !!raidRow, raidIns.status);
      if (raidRow) {
        await smoke('BOSS', 'game_bosses', { raid_id: raidRow.id, name: '冒烟BOSS', boss_order: 1 }, `name=eq.冒烟BOSS&raid_id=eq.${raidRow.id}`);
        // 掉落池冒烟：另建一个 BOSS 供挂载（上面的 BOSS 冒烟已自删）
        const boss2 = await proxy(admin.token, 'POST', 'game_bosses', { raid_id: raidRow.id, name: '冒烟BOSS2', boss_order: 2 });
        const boss2Row = Array.isArray(boss2.body) && boss2.body[0];
        if (boss2Row) {
          const lootIns = await proxy(admin.token, 'POST', 'boss_loot', { boss_id: boss2Row.id, item_name: '冒烟巨剑', slot: '武器' });
          const lootFound = (await svcRest('GET', `/rest/v1/boss_loot?item_name=eq.冒烟巨剑&select=id&limit=1`)).body.length > 0;
          check('8. CRUD 冒烟 掉落池（boss_loot）', lootIns.status === 201 && lootFound, `${lootIns.status}/${lootFound}`);
        }
        // 套装/大秘境冒烟：另建一个赛季供挂载（上面的赛季冒烟已自删）
        const season2 = await proxy(admin.token, 'POST', 'game_seasons', { name: 'MD冒烟挂载季', start_date: '2026-01-01' });
        const season2Row = Array.isArray(season2.body) && season2.body[0];
        const classRow = (await svcRest('GET', `/rest/v1/game_classes?class_key=eq.1&select=id&limit=1`)).body[0];
        if (season2Row && classRow) {
          const tsIns = await proxy(admin.token, 'POST', 'tier_sets', { season_id: season2Row.id, class_id: classRow.id, set_name: '冒烟套装' });
          const tsFound = (await svcRest('GET', `/rest/v1/tier_sets?set_name=eq.冒烟套装&select=id&limit=1`)).body.length > 0;
          check('8. CRUD 冒烟 套装（tier_sets）', tsIns.status === 201 && tsFound, `${tsIns.status}/${tsFound}`);
          const dgIns = await proxy(admin.token, 'POST', 'game_dungeons', { season_id: season2Row.id, name: '冒烟秘境' });
          const dgFound = (await svcRest('GET', `/rest/v1/game_dungeons?name=eq.冒烟秘境&select=id&limit=1`)).body.length > 0;
          check('8. CRUD 冒烟 大秘境（game_dungeons）', dgIns.status === 201 && dgFound, `${dgIns.status}/${dgFound}`);
        }
        await smoke('职业', 'game_classes', { class_key: 99, name_zh: '冒烟职业', name_en: 'smoke' }, 'class_key=eq.99');
        const clsRow = (await svcRest('GET', `/rest/v1/game_classes?class_key=eq.1&select=id&limit=1`)).body[0];
        if (clsRow) {
          const spIns = await proxy(admin.token, 'POST', 'game_specs', { class_id: clsRow.id, spec_key: 99, name_zh: '冒烟专精', name_en: '', role: 'DAMAGE' });
          const spDel = await proxy(admin.token, 'DELETE', 'game_specs', null, `?spec_key=eq.99&class_id=eq.${clsRow.id}`);
          check('8. CRUD 冒烟 专精（game_specs）', spIns.status === 201 && spDel.status === 200, `${spIns.status}/${spDel.status}`);
        }
        await proxy(admin.token, 'DELETE', 'game_raids', null, `?id=eq.${raidRow.id}`);
      }

      // 清理主数据测试行
      await svcRest('DELETE', `/rest/v1/game_raids?name=eq.MD验证团本`);
      await svcRest('DELETE', `/rest/v1/game_seasons?name=eq.MD-S2`);
      await svcRest('DELETE', `/rest/v1/game_seasons?name=eq.MD冒烟挂载季`);

      // 9. sql/11 断言（REQ-053/054）：tier_sets.spec_id + boss_loot 新三列（未执行 sql/11 自动跳过）
      const p11 = await svcRest('GET', '/rest/v1/boss_loot?select=effect,primary_stats,secondary_stats&limit=1');
      const p11b = await svcRest('GET', '/rest/v1/tier_sets?select=spec_id&limit=1');
      if (p11.status === 400 || p11b.status === 400) {
        skip('9. sql/11 结构断言（spec_id + boss_loot 三列）', 'sql/11 未执行，待运营执行后重跑');
      } else {
        const classRow11 = (await svcRest('GET', `/rest/v1/game_classes?class_key=eq.1&select=id&limit=1`)).body[0];
        const specRow11 = (await svcRest('GET', `/rest/v1/game_specs?class_id=eq.${classRow11.id}&spec_key=eq.1&select=id&limit=1`)).body[0];
        const season11 = await proxy(admin.token, 'POST', 'game_seasons', { name: 'MD-sql11季', start_date: '2026-01-01' });
        const season11Row = Array.isArray(season11.body) && season11.body[0];
        if (season11Row && specRow11) {
          // REQ-053：spec_id 写入 + (season,class,spec) 唯一约束
          const ts1 = await proxy(admin.token, 'POST', 'tier_sets', { season_id: season11Row.id, class_id: classRow11.id, spec_id: specRow11.id, set_name: 'sql11套装A' });
          const ts2 = await proxy(admin.token, 'POST', 'tier_sets', { season_id: season11Row.id, class_id: classRow11.id, spec_id: specRow11.id, set_name: 'sql11套装B' });
          check('9a. tier_sets.spec_id 可写 + (season,class,spec) 唯一约束拒重', ts1.status === 201 && (ts2.status === 400 || ts2.status === 409), `${ts1.status}/${ts2.status}`);
          // REQ-054：boss_loot 三列写入
          const raid11 = await proxy(admin.token, 'POST', 'game_raids', { name: 'MD-sql11团本', type: 'raid' });
          const raid11Row = Array.isArray(raid11.body) && raid11.body[0];
          if (raid11Row) {
            const boss11 = await proxy(admin.token, 'POST', 'game_bosses', { raid_id: raid11Row.id, name: 'sql11BOSS', boss_order: 1 });
            const boss11Row = Array.isArray(boss11.body) && boss11.body[0];
            if (boss11Row) {
              const loot11 = await proxy(admin.token, 'POST', 'boss_loot', { boss_id: boss11Row.id, item_name: 'sql11装备', effect: '装备：测试特效', primary_stats: ['力量'], secondary_stats: ['爆击', '急速'] });
              const lootRow = Array.isArray(loot11.body) && loot11.body[0];
              check('9b. boss_loot effect/primary_stats/secondary_stats 可写读',
                loot11.status === 201 && lootRow && lootRow.effect === '装备：测试特效' && Array.isArray(lootRow.primary_stats) && lootRow.secondary_stats.length === 2,
                loot11.status);
            }
            await proxy(admin.token, 'DELETE', 'game_raids', null, `?id=eq.${raid11Row.id}`);
          }
          await svcRest('DELETE', `/rest/v1/tier_sets?season_id=eq.${season11Row.id}`);
          await svcRest('DELETE', `/rest/v1/game_seasons?id=eq.${season11Row.id}`);
        }
      }
    } else {
      ['2. is_current 部分唯一索引', '3. RLS/代理超管读写', '4. 字典完整性', '5. 巢穴边界', '7. 幂等'].forEach(n => skip(n, 'sql/10 未执行'));
    }

    // 6. 兜底快照：MasterData 前端文件存在且快照自洽（结构断言；白屏回归在浏览器验收）
    const snapSrc = fs.readFileSync(path.join(ROOT, 'js', 'masterDataSnapshot.js'), 'utf8');
    const snap = new Function('window', snapSrc.replace(/\r\n/g, '\n') + '\nreturn window.MASTER_DATA_SNAPSHOT;')({});
    check('6a. 内置快照可解析', !!snap && Array.isArray(snap.classes), snap && `classes=${snap.classes.length}`);
    check('6b. 快照含 13 职业 40 专精 5 团本', snap.classes.length === 13 && snap.specs.length === 40 && snap.raids.length === 5,
      `${snap.classes.length}/${snap.specs.length}/${snap.raids.length}`);

    // 10. 任务书 #23 WP1：dungeon_loot 结构 + game_bosses 副本归属 + 匿名读开放
    const dl = await svcRest('GET', '/rest/v1/dungeon_loot?select=id&limit=1');
    check('10a. dungeon_loot 表可达（sql/16）', dl.status === 200 && Array.isArray(dl.body), `HTTP ${dl.status}`);
    const gb = await svcRest('GET', '/rest/v1/game_bosses?select=id,dungeon_id&limit=1');
    check('10b. game_bosses 带 dungeon_id 列', gb.status === 200 && Array.isArray(gb.body) && gb.body.length > 0 && 'dungeon_id' in gb.body[0], `HTTP ${gb.status}`);
    const anonH = { apikey: ANON, Authorization: `Bearer ${ANON}` };
    const anonDl = await fetch(`${SB}/rest/v1/dungeon_loot?select=id&limit=1`, { headers: anonH });
    check('10c. 匿名读 dungeon_loot → 200', anonDl.status === 200, `HTTP ${anonDl.status}`);
    const anonGuilds = await fetch(`${SB}/rest/v1/guilds?select=*&limit=1`, { headers: anonH });
    const anonGuildsBody = await anonGuilds.json().catch(() => null);
    check('10d. 匿名读业务表 guilds → 403/空集（边界抽测）', anonGuilds.status !== 200 || (Array.isArray(anonGuildsBody) && anonGuildsBody.length === 0), `HTTP ${anonGuilds.status}`);
  } finally {
    srv.kill();
    console.log('\n===== 清理测试数据 =====');
    if (guildId) await svcRest('DELETE', `/rest/v1/guilds?id=eq.${guildId}`);
    for (const u of [admin, viewer]) {
      if (u) await svcRest('DELETE', `/auth/v1/admin/users/${u.uid}`);
    }
    console.log('测试用户与公会已删除');
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n===== 主数据验证: ${results.length - failed.length}/${results.length} 通过${skipped ? `（跳过 ${skipped} 组）` : ''} =====`);
  if (failed.length) process.exit(1);
})().catch(e => { console.error('验证异常:', e.message); process.exit(1); });
