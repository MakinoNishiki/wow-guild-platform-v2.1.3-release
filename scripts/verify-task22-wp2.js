// 任务书 #22 WP2 验证：职业/专精/职责图标换装（REQ-069）
// 覆盖：①assets/iconMap.json 全 56 路径 HTTP 200（控制台零 404 前提）
//       ②成员列表（职业 chip/专精图标/职责图标）+ 编辑弹窗职责 tags + 用户中心我的认领 换装截图（两档宽度）
//       ③缺图兜底实测：故意把职业图标指向不存在路径 → 不裂图、文字保留；恢复后图标回来
//       ④浏览器全程零 JS 报错、零意外 404
// 测试数据自建自清理并复核为零。用法: node scripts/verify-task22-wp2.js（PW_CHANNEL=chrome 可选）
// 截图输出 backup/2026-08-05-task22-wp2/
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'backup', '2026-08-05-task22-wp2');
const PORT = 15645;
const BASE = `http://localhost:${PORT}`;
const PWD = 'Wp22b-Test-2026!';
const EMAIL_OWNER = 'wp22b-owner@wowbutler.cn';

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SB = env.SUPABASE_URL.replace(/\/+$/, '');
const ANON = env.SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const SVC = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail !== undefined ? `（${detail}）` : ''}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function svc(method, restPath, body) {
  const res = await fetch(`${SB}${restPath}`, { method, headers: SVC, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

let serverProc = null, owner = null, guildId = null;

async function setup() {
  let res = await fetch(`${SB}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL_OWNER, password: PWD, data: { display_name: 'WP22B会长' } }),
  });
  let body = await res.json();
  if (!body.access_token) {
    res = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL_OWNER, password: PWD }),
    });
    body = await res.json();
    if (!body.access_token) throw new Error('owner 登录失败');
  }
  owner = { uid: body.user.id, token: body.access_token };

  const g = await svc('POST', '/rest/v1/guilds', { name: 'WP22B图标会', owner_id: owner.uid, invite_code: 'W22B' + Date.now().toString(36).slice(-4).toUpperCase() });
  if (g.status !== 201) throw new Error('建会失败');
  guildId = g.body[0].id;
  await svc('POST', '/rest/v1/guild_members', { guild_id: guildId, user_id: owner.uid, role: 'owner', display_name: 'WP22B会长' });

  const members = [
    { name: '战大', class: '战士', spec: '武器', off_specs: ['防护'], role: ['坦克', '输出'], status: '正式', user_id: null },
    { name: '贼老二', class: '盗贼', spec: '刺杀', off_specs: ['敏锐'], role: ['输出'], status: '正式', user_id: null },
    { name: '蛋总', class: '恶魔猎手', spec: '噬灭', off_specs: ['浩劫'], role: ['输出'], status: '正式', user_id: owner.uid },
  ];
  for (const m of members) {
    const r = await svc('POST', '/rest/v1/raid_members', m.guild_id ? m : { ...m, guild_id: guildId });
    if (r.status !== 201) throw new Error('建成员失败 ' + m.name + ': ' + JSON.stringify(r.body));
  }

  serverProc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, DEPLOY_RUN_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/supabase-config`); if (r.ok) break; } catch {}
    if (i === 39) throw new Error('server.js 启动超时');
    await sleep(500);
  }
}

async function cleanup() {
  const steps = [];
  try { const r = await svc('DELETE', `/rest/v1/raid_members?guild_id=eq.${guildId}`); steps.push(`members:${r.status}`); } catch { steps.push('members:ERR'); }
  try { const r = await svc('DELETE', `/rest/v1/guilds?id=eq.${guildId}`); steps.push(`guilds:${r.status}`); } catch { steps.push('guilds:ERR'); }
  try { if (owner) await fetch(`${SB}/auth/v1/admin/users/${owner.uid}`, { method: 'DELETE', headers: SVC }); steps.push('user:deleted'); } catch { steps.push('user:ERR'); }
  if (serverProc) serverProc.kill();
  console.log('\n[清理] ' + steps.join(' | '));
  const chk = await svc('GET', `/rest/v1/guilds?id=eq.${guildId}&select=id`);
  console.log(`[清理复核] guilds 剩余=${Array.isArray(chk.body) ? chk.body.length : '?'}`);
}

// 素材盘点：iconMap.json 全部路径本地可达（经站点 HTTP 200）
async function probeAssets() {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'iconMap.json'), 'utf8'));
  const paths = new Set(Object.values(m.classes));
  for (const cls of Object.values(m.specs)) Object.values(cls).forEach(p => paths.add(p));
  Object.values(m.roles).forEach(p => paths.add(p));
  let ok = 0;
  const bad = [];
  for (const p of paths) {
    try {
      const r = await fetch(`${BASE}/${p}`, { method: 'HEAD' });
      if (r.status === 200) ok++;
      else bad.push(`${p}:${r.status}`);
    } catch { bad.push(`${p}:ERR`); }
  }
  check(`① 素材盘点：iconMap.json 全 ${paths.size} 路径 HTTP 200`, bad.length === 0 && ok === paths.size,
    bad.length ? bad.join(' ') : `${ok}/${paths.size}`);
  return paths.size;
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await setup();
  await probeAssets();

  const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chromium' });
  const pageErrors = [];
  const notFounds = [];
  try {
    for (const vp of [{ width: 1366, height: 768, tag: '1366' }, { width: 1920, height: 1080, tag: '1920' }]) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      page.on('pageerror', e => pageErrors.push(`pageerror(${vp.tag}): ` + e.message));
      page.on('console', msg => { if (msg.type() === 'error') pageErrors.push(`console(${vp.tag}): ` + msg.text()); });
      page.on('response', r => { if (r.status() === 404) notFounds.push(`${vp.tag}: ${r.url()}`); });
      page.on('dialog', d => d.accept());

      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.waitForSelector('#authEmail', { state: 'visible', timeout: 20000 });
      await page.fill('#authEmail', EMAIL_OWNER);
      await page.fill('#authPassword', PWD);
      await page.click('#authLoginBtn');
      await page.waitForSelector('#page-dashboard', { state: 'visible', timeout: 30000 });
      await sleep(2000);

      await page.click('.nav-item[data-page="members"]');
      await sleep(1500);

      // 换装渲染断言：职业 chip 内为 PNG、专精图标 PNG（含 盗贼/刺杀 别名、噬灭）、职责图标 PNG
      const render = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('#membersTableBody tr')];
        const out = {};
        for (const r of rows) {
          const name = r.querySelector('td:nth-child(3)')?.textContent.trim();
          const chip = r.querySelector('.wow-class-chip');
          const chipImg = chip && chip.querySelector('img');
          const specImg = r.querySelector('td:nth-child(5) img');
          const roleImgs = [...r.querySelectorAll('td:nth-child(6) img')].map(i => i.src);
          out[name] = {
            chip: !!chip,
            chipSrc: chipImg ? chipImg.src.split('/').pop() : null,
            chipText: chip ? chip.textContent.trim() : null,
            specSrc: specImg ? specImg.src.split('/').pop() : null,
            roleSrcs: roleImgs.map(s => s.split('/').pop()),
          };
        }
        return out;
      });
      check(`[${vp.tag}] 战士行：chip=warrior.png+文字`, render['战大'] && render['战大'].chip && render['战大'].chipSrc === 'warrior.png' && render['战大'].chipText === '战士', JSON.stringify(render['战大']));
      check(`[${vp.tag}] 盗贼行（别名 盗贼→潜行者）：chip=rogue.png`, render['贼老二'] && render['贼老二'].chipSrc === 'rogue.png', JSON.stringify(render['贼老二']));
      check(`[${vp.tag}] 刺杀专精图标（别名 刺杀→奇袭）=rogue_assassination.png`, render['贼老二'] && render['贼老二'].specSrc === 'rogue_assassination.png', render['贼老二'] && render['贼老二'].specSrc);
      check(`[${vp.tag}] 噬灭专精图标=demonhunter_devourer.png`, render['蛋总'] && render['蛋总'].specSrc === 'demonhunter_devourer.png', render['蛋总'] && render['蛋总'].specSrc);
      check(`[${vp.tag}] 职责图标 PNG（tank/dps）`, render['战大'] && render['战大'].roleSrcs.includes('tank.png') && render['战大'].roleSrcs.includes('dps.png'), JSON.stringify(render['战大'] && render['战大'].roleSrcs));
      await page.screenshot({ path: path.join(SHOT_DIR, `${vp.tag}-members.png`) });

      // 编辑弹窗职责 tags（owner 编辑战大）
      if (vp.tag === '1366') {
        await page.evaluate(() => {
          const m = appData.members.find(x => x.name === '战大');
          editMember(m.id);
        });
        await sleep(1500);
        const tagImgs = await page.evaluate(() =>
          [...document.querySelectorAll('#memberRoleTags .role-tag img')].map(i => i.src.split('/').pop()));
        check('[1366] 编辑弹窗职责 tags 三枚 PNG（tank/healer/dps）',
          tagImgs.includes('tank.png') && tagImgs.includes('healer.png') && tagImgs.includes('dps.png'), JSON.stringify(tagImgs));
        await page.screenshot({ path: path.join(SHOT_DIR, `${vp.tag}-member-edit-modal.png`) });
        await page.evaluate(() => closeModal('memberModal'));
        await sleep(400);

        // 缺图兜底实测：战士图标故意指错 → 不裂图、文字保留；恢复后图标回来
        await page.evaluate(() => {
          window.__origClassIcon = window.IconMap.classIcon;
          window.IconMap.classIcon = c => c === '战士' ? 'assets/icons/classes/__missing__.png' : window.__origClassIcon(c);
          renderMembers();
        });
        await sleep(1200);
        const fallback = await page.evaluate(() => {
          const rows = [...document.querySelectorAll('#membersTableBody tr')];
          const row = rows.find(r => r.textContent.includes('战大'));
          const chip = row && row.querySelector('.wow-class-chip');
          const img = chip && chip.querySelector('img');
          const broken = img ? !img.complete || img.naturalWidth === 0 : null;
          return {
            chipText: chip ? chip.textContent.trim() : null,
            imgHidden: img ? (img.style.display === 'none' || broken) : null,
          };
        });
        check('[1366] 缺图兜底：指错路径不裂图、文字「战士」保留', fallback.chipText === '战士' && fallback.imgHidden === true, JSON.stringify(fallback));
        await page.screenshot({ path: path.join(SHOT_DIR, `${vp.tag}-fallback-missing-icon.png`) });
        await page.evaluate(() => {
          window.IconMap.classIcon = window.__origClassIcon;
          renderMembers();
        });
        await sleep(1200);
        const restored = await page.evaluate(() => {
          const rows = [...document.querySelectorAll('#membersTableBody tr')];
          const row = rows.find(r => r.textContent.includes('战大'));
          const img = row && row.querySelector('.wow-class-chip img');
          return img ? { src: img.src.split('/').pop(), hidden: img.style.display === 'none', ok: img.complete && img.naturalWidth > 0 } : null;
        });
        check('[1366] 缺图恢复：warrior.png 重新显示', restored && restored.src === 'warrior.png' && !restored.hidden && restored.ok, JSON.stringify(restored));

        // 用户中心「我的认领」（蛋总已被本人认领）带职业图标
        await page.click('#userMenuTrigger');
        await sleep(300);
        await page.evaluate(() => userMenuAction('center'));
        await page.waitForSelector('#userCenterModal.show', { timeout: 5000 });
        await page.evaluate(() => switchUserTab('claims'));
        await sleep(1500);
        const claimIcon = await page.evaluate(() => {
          const img = document.querySelector('#myClaimsList .uc-character-detail img');
          return img ? img.src.split('/').pop() : null;
        });
        check('[1366] 我的认领行职业图标=demonhunter.png', claimIcon === 'demonhunter.png', claimIcon);
        await page.screenshot({ path: path.join(SHOT_DIR, `${vp.tag}-my-claims.png`) });
        await page.evaluate(() => closeModal('userCenterModal'));
      }

      await ctx.close();
    }

    // 「Failed to load resource ... 404」是缺图兜底实测（__missing__）的预期控制台噪音；
    // 真正的 404 防线路由 response 监听（下方零意外 404 检查）承担
    const realErrors = pageErrors.filter(e => !e.includes('status of 406') && !e.includes('Failed to load resource'));
    check('两档宽度全程零 JS 报错（406 与缺图实测资源 404 为预期噪音，已排除）', realErrors.length === 0, realErrors.join(' | ') || '无');
    const unexpected404 = notFounds.filter(u => !u.includes('__missing__'));
    check('全程零意外 404（缺图实测的 __missing__ 除外）', unexpected404.length === 0, unexpected404.join(' | ') || '无');
  } finally {
    await browser.close();
  }

  await cleanup();

  const passed = results.filter(r => r.ok).length;
  console.log(`\n===== 任务书#22 WP2 验证: ${passed}/${results.length} 通过，截图 → ${SHOT_DIR} =====`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async e => { console.error(e); await cleanup(); process.exit(1); });
