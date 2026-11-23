const test = require('node:test');
const assert = require('node:assert/strict');
const { createBattleEvidenceReader, isMissingWclReport } = require('../lib/guildBattleEvidence.cjs');

const scope = {
  guildId: '11111111-1111-4111-8111-111111111111',
  activityId: '22222222-2222-4222-8222-222222222222',
};
const code = 'TestReport12345678';
const zone = { id: 10, name: '梦境裂隙' };
const start = Date.parse('2026-06-10T15:59:00Z'); // UTC+8 day boundary
function fight(id, props = {}) {
  return { id, encounterID: 15, name: '首领甲', gameZone: zone,
    kill: true, difficulty: 3, startTime: id * 60000, endTime: (id + 1) * 60000, ...props };
}
function fixture({ activity, report, raids, upstream } = {}) {
  const stored = { id: scope.activityId, guild_id: scope.guildId, status: 'normal', team_label: ' 2 ',
    raid: zone.name, wcl_report_code: null, wcl_url: `https://cn.warcraftlogs.com/reports/${code}#fight=last`, ...activity };
  const source = { code, visibility: 'public', revision: 0, region: { slug: 'cn' },
    startTime: start, endTime: start + 1800000, zone: { id: 46, name: 'VS / DR / MQD' },
    fights: [fight(1)], ...report };
  const rows = raids || [{ id: 'raid-a', name: zone.name, type: 'raid', game_seasons: { id: 'season-a', name: 'S1' },
    game_bosses: [{ id: 'boss-b', name: '首领乙', boss_order: 2 }, { id: 'boss-a', name: '首领甲', boss_order: 1 }] }];
  const requests = [];
  const read = createBattleEvidenceReader({
    get: async path => {
      const url = new URL(path, 'http://fixture');
      requests.push(url.pathname);
      if (url.pathname === '/rest/v1/activities') {
        assert.equal(url.searchParams.get('guild_id'), 'eq.' + scope.guildId);
        assert.equal(url.searchParams.get('id'), 'eq.' + scope.activityId);
        return { status: 200, body: [stored] };
      }
      assert.equal(url.pathname, '/rest/v1/game_raids');
      assert.equal(url.searchParams.get('name'), 'eq.' + zone.name);
      return { status: 200, body: rows };
    },
    query: async (query, vars) => {
      requests.push('WCL');
      assert.deepEqual(vars, { code });
      assert.match(query, /gameZone \{ id name \}/);
      assert.match(query, /visibility/);
      assert.doesNotMatch(query, /actor|friendlyPlayers|owner|title/);
      if (upstream) return upstream();
      return { reportData: { report: source } };
    },
  });
  return { read: () => read(scope), stored, source, rows, requests };
}

test('legacy URL, source time, master data and supported kill difficulties', async () => {
  const { read } = fixture({ report: { fights: [
    fight(8, { kill: false }), fight(7, { difficulty: 1 }), fight(6, { encounterID: 0 }),
    fight(5, { difficulty: 16 }), fight(4, { difficulty: 2 }), fight(3, { difficulty: 5 }),
    fight(2, { difficulty: 4 }), fight(1),
  ] } });
  const snapshot = await read();
  assert.equal(snapshot.region, 'CN');
  assert.equal(snapshot.teamLabel, '2');
  assert.equal(snapshot.uploadedAt, null);
  assert.equal(snapshot.seasonId, 'season-a');
  assert.deepEqual(snapshot.bosses.map(b => b.id), ['boss-a', 'boss-b']);
  assert.deepEqual(snapshot.kills.map(k => k.difficulty), ['normal', 'heroic', 'mythic', 'normal']);
  const first = snapshot.kills[0];
  assert.deepEqual(first, { fightId: 1, encounterId: 15, bossId: 'boss-a', bossName: '首领甲',
    difficulty: 'normal', killedAt: '2026-06-10T16:01:00.000Z', sourceUrl: `https://www.warcraftlogs.com/reports/${code}#fight=1` });
});

test('saved report-only activities and each fresh WCL revision', async () => {
  const { read, source } = fixture({ activity: { wcl_report_code: code, wcl_url: null, team_label: null } });
  assert.equal((await read()).teamLabel, '');
  source.fights = [fight(12)];
  source.revision++;
  const next = await read();
  assert.equal(next.revision, 1);
  assert.deepEqual(next.kills.map(k => k.fightId), [12]);
  source.visibility = 'unlisted';
  await assert.rejects(read, { statusCode: 422 });
});

test('cancelled, foreign and conflicting activity sources stop before WCL', async () => {
  for (const [activity, statusCode] of [[{ status: 'cancelled' }, 409], [{ guild_id: 'other' }, 404],
    [{ id: 'other' }, 404], [{ wcl_url: null }, 409], [{ wcl_report_code: 'OtherReport12345' }, 409],
    [{ wcl_url: 'https://example.org/reports/' + code }, 409]]) {
    const { read, requests } = fixture({ activity });
    await assert.rejects(read, { statusCode });
    assert.deepEqual(requests, ['/rest/v1/activities']);
  }
});

test('public visibility, region, identity and valid absolute times are required', async () => {
  for (const report of [{ visibility: 'unlisted' }, { visibility: 'private' }, { visibility: null },
    { region: null }, { code: 'OtherReport12345' }, { startTime: 1700000000 }, { revision: null },
    { fights: [fight(1, { endTime: 2500000 })] }, { fights: [fight(1, { startTime: -1 })] },
    { fights: [fight(1, { id: null })] }, { fights: [fight(1), fight(1)] },
    { fights: [fight(1, { kill: false }), fight(2, { difficulty: 1 }), fight(3, { encounterID: 0 })] }]) {
    await assert.rejects(fixture({ report }).read, { statusCode: 422 });
  }
});

test('mixed reports use the saved specific raid, other raids never add kills', async () => {
  const report = { fights: [fight(1), fight(2, { gameZone: { id: 42, name: '虚影尖塔' } })] };
  const snap = await fixture({ report }).read();
  assert.deepEqual(snap.kills.map(k => k.fightId), [1]);
  assert.equal(snap.excludedOtherRaidKills, 1);
  for (const raid of ['', '虚影尖塔·梦境裂隙·进军奎尔丹纳斯', '不存在']) {
    await assert.rejects(fixture({ activity: { raid }, report }).read, { statusCode: 422 });
  }
  const sameZone = await fixture({ activity: { raid: 'VS / DR / MQD' } }).read();
  assert.equal(sameZone.raidName, zone.name);
  await assert.rejects(fixture({ activity: { raid: '虚影尖塔' } }).read, { statusCode: 422 });
  await assert.rejects(fixture({ report: { fights: [fight(1, { gameZone: null })] } }).read, { statusCode: 422 });
});

test('no publication on missing, ambiguous or unrecognized master data', async () => {
  for (const edit of [rows => rows.pop(), rows => rows.push(rows[0]), rows => { rows[0].game_seasons = null; },
    rows => { rows[0].type = 'world'; }, rows => { rows[0].game_bosses[1].name = '未核实'; },
    rows => { rows[0].game_bosses.push(rows[0].game_bosses[1]); }]) {
    const { read, rows } = fixture();
    edit(rows);
    await assert.rejects(read, { statusCode: 422 });
  }
});

test('only an explicit WCL report-level absence is a definitive missing report', () => {
  const missing = { message: 'This report does not exist.', path: ['reportData', 'report'] };
  const payload = { data: { reportData: { report: null } }, errors: [missing] };
  assert.equal(isMissingWclReport(200, payload), true);
  for (const body of [{}, { data: payload.data }, { ...payload, errors: [] },
    { ...payload, errors: [{ ...missing, path: ['reportData'] }] },
    { ...payload, errors: [missing, { message: 'Server unavailable' }] },
    { ...payload, errors: [{ ...missing, message: 'Internal server error' }] }]) {
    assert.equal(isMissingWclReport(200, body), false);
  }
  assert.equal(isMissingWclReport(503, payload), false);
});

test('only confirmed loss of this precise public report or qualifying kills suspends publication', async () => {
  const otherRaidKill = fight(2, { gameZone: { id: 8, name: '其他副本' } });
  for (const args of [{ report: { visibility: 'private' } }, { report: { visibility: 'unlisted' } },
    { upstream: () => { throw Object.assign(Error('missing'), { wclReportMissing: true }); } },
    { report: { fights: [] } }, { report: { fights: [fight(1, { kill: false }), fight(2, { difficulty: 1 })] } },
    { report: { fights: [fight(1, { kill: false }), otherRaidKill] } }]) {
    await assert.rejects(fixture(args).read, { evidenceInvalid: true, reportCode: code, statusCode: 422 });
  }
  for (const args of [{ report: { code: 'other', visibility: 'private' } }, { report: { visibility: null } },
    { upstream: () => ({ reportData: { report: null } }) }, { upstream: () => ({}) },
    { upstream: () => { throw Object.assign(Error('rate limited'), { wclStatus: 429 }); } },
    { upstream: () => { throw Object.assign(Error('timeout'), { wclStatus: 504 }); } },
    { report: { fights: [null] } }, { report: { fights: [fight(1, { kill: null })] } },
    { report: { fights: [fight(1, { difficulty: null })] } }, { report: { fights: [fight(1, { difficulty: 99 })] } },
    { raids: [] }]) {
    await assert.rejects(fixture(args).read, err => err.evidenceInvalid !== true && err.reportCode === undefined);
  }
});
