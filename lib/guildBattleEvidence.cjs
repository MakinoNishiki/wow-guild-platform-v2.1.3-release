'use strict';

// Localize the actual in-game zone and encounter names to match the Chinese
// master data. A WCL ranking zone may group several separate in-game raids.
const BATTLE_QUERY = `query($code: String!) {
  reportData { report(code: $code) {
    code visibility revision region { slug } zone { id name } startTime endTime
    fights { id encounterID name kill difficulty startTime endTime gameZone { id name } }
  } }
}`;

const difficulties = new Map([[2, 'normal'], [3, 'normal'], [4, 'heroic'], [5, 'mythic']]);
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const codePattern = /^[A-Za-z0-9]{10,20}$/;
const combinedRaidNames = ['虚影尖塔', '梦境裂隙', '进军奎尔丹纳斯'];
const combinedZoneLabels = ['VS / DR / MQD', combinedRaidNames.join('·')];

function error(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function invalidEvidence(reportCode, message) {
  return Object.assign(error(422, message), { evidenceInvalid: true, reportCode });
}

// WCL returns a report-specific GraphQL error with HTTP 200 for a missing
// report. A bare null, schema error, expired credential or timeout is inconclusive.
function isMissingWclReport(status, payload) {
  return status === 200 && payload?.data?.reportData?.report === null &&
    Array.isArray(payload.errors) && payload.errors.length > 0 &&
    payload.errors.every(err => err?.message === 'This report does not exist.' &&
      Array.isArray(err.path) && err.path.length === 2 && err.path[0] === 'reportData' && err.path[1] === 'report');
}

function savedReportCode(activity) {
  const savedCode = (activity.wcl_report_code || '').trim();
  let linkedCode = '';
  if (activity.wcl_url?.trim()) {
    try {
      const link = new URL(activity.wcl_url);
      if (/^https?:$/.test(link.protocol) && /(^|\.)warcraftlogs\.com$/i.test(link.hostname)) {
        linkedCode = link.pathname.match(/^\/reports\/([A-Za-z0-9]{10,20})\/?$/)?.[1] || '';
      }
    } catch { /* The activity editor can repair an old malformed link. */ }
    if (!linkedCode) throw error(409, '请在活动中保存有效的 WCL 报告链接。');
  }
  if (savedCode && (!codePattern.test(savedCode) || (linkedCode && savedCode !== linkedCode))) {
    throw error(409, '活动的 WCL 报告代码与链接不一致，请在活动中重新核对。');
  }
  if (!savedCode && !linkedCode) throw error(409, '请先为这场活动保存 WCL 报告。');
  return savedCode || linkedCode;
}

function chooseRaid(activity, fights, reportZone) {
  const zones = new Map();
  for (const fight of fights) {
    const zone = fight.gameZone;
    if (!Number.isInteger(zone?.id) || zone.id <= 0 || !zone.name?.trim() ||
        (zones.has(zone.name) && zones.get(zone.name) !== zone.id)) {
      throw error(422, 'WCL 战斗缺少可区分的副本资料，无法核对战报。');
    }
    zones.set(zone.name, zone.id);
  }
  const saved = (activity.raid || '').trim();
  if (zones.has(saved)) return saved;
  const [single] = zones.keys();
  if (zones.size === 1 && (!saved || (reportZone?.id === 46 &&
      combinedZoneLabels.includes(saved) && combinedRaidNames.includes(single)))) return single;
  if (zones.size > 1) throw error(422, '这份报告包含多个副本，请在活动中指定要发布的具体团本。');
  throw error(422, '活动团本与 WCL 战斗所在副本不同，请核对活动中的团本。');
}

async function getRows(get, path) {
  const { status, body } = await get(path);
  if (status !== 200 || !Array.isArray(body)) throw error(502, '活动或团本资料读取失败，请稍后再试。');
  return body;
}

function absoluteTime(ms) {
  // Reports use Unix milliseconds; a seconds value would otherwise look like 1970.
  if (!Number.isSafeInteger(ms) || ms < 946684800000 || ms > 8640000000000000) {
    throw error(422, 'WCL 报告时间无效，无法核对击杀时刻。');
  }
  return new Date(ms).toISOString();
}

function buildKills(fights, report, bosses) {
  const seenFightIds = new Set();
  const kills = fights.map(fight => {
    const boss = bosses.find(row => row.name === fight.name);
    if (!boss) throw error(422, '该副本有击杀首领尚未匹配站内首领资料，请先核对主数据。');
    if (!Number.isSafeInteger(fight.id) || fight.id <= 0 || seenFightIds.has(fight.id) ||
        !Number.isSafeInteger(fight.encounterID) || fight.encounterID <= 0) {
      throw error(422, 'WCL 战斗编号缺失或重复，无法核对战报。');
    }
    seenFightIds.add(fight.id);
    if (!Number.isSafeInteger(fight.startTime) || !Number.isSafeInteger(fight.endTime) ||
        fight.startTime < 0 || fight.endTime < fight.startTime || report.startTime + fight.endTime > report.endTime) {
      throw error(422, 'WCL 击杀时间超出报告范围，无法核对战报。');
    }
    return {
      fightId: fight.id, encounterId: fight.encounterID, bossId: boss.id, bossName: boss.name,
      difficulty: difficulties.get(fight.difficulty), killedAt: absoluteTime(report.startTime + fight.endTime),
      sourceUrl: `https://www.warcraftlogs.com/reports/${report.code}#fight=${fight.id}`,
    };
  });
  return kills.sort((a, b) => a.killedAt.localeCompare(b.killedAt) || a.fightId - b.fightId);
}

// Call only after manager authorization. Both preview and save read fresh
// evidence. The original activity fields are for the DB compare-and-save.
function createBattleEvidenceReader({ get, query }) {
  return async function readBattleEvidence({ guildId, activityId }) {
    if (!uuid.test(guildId) || !uuid.test(activityId)) throw error(400, '请选择有效的公会和活动。');
    const [activity] = await getRows(get, `/rest/v1/activities?guild_id=eq.${guildId}&id=eq.${activityId}` +
      '&select=id,guild_id,status,team_label,raid,wcl_report_code,wcl_url&limit=1');
    if (!activity || activity.guild_id !== guildId || activity.id !== activityId) {
      throw error(404, '当前公会没有这场活动。');
    }
    if (activity.status !== 'normal') throw error(409, '只有正常举行的活动可以生成战报。');
    const code = savedReportCode(activity);
    let data;
    try {
      data = await query(BATTLE_QUERY, { code });
    } catch (err) {
      if (err.wclReportMissing === true) throw invalidEvidence(code, 'WCL 已确认该报告不存在。');
      if (err.wclStatus) throw error(err.wclStatus, err.message);
      throw err;
    }
    const report = data?.reportData?.report;
    if (report?.code === code && ['private', 'unlisted'].includes(report.visibility)) {
      throw invalidEvidence(code, 'WCL 已将这份报告标为私有或未列出，无法公开分享。');
    }
    if (report?.visibility !== 'public') throw error(422, '只有 WCL 明确公开且可读取的报告可以生成战报。');
    const region = String(report.region?.slug || '').toUpperCase();
    if (report.code !== code || !/^[A-Z]{2,4}$/.test(region) ||
        !Number.isInteger(report.revision) || report.revision < 0 || !Array.isArray(report.fights)) {
      throw error(422, 'WCL 报告缺少来源、区域或修订资料，无法核对战报。');
    }
    const reportStartAt = absoluteTime(report.startTime);
    const reportEndAt = absoluteTime(report.endTime);
    if (report.endTime < report.startTime) throw error(422, 'WCL 报告时间无效。');
    if (report.fights.some(f => !Number.isInteger(f?.encounterID) || f.encounterID < 0 ||
        (f.encounterID > 0 && (!Number.isInteger(f.difficulty) || typeof f.kill !== 'boolean')))) {
      throw error(422, 'WCL 战斗资料尚不完整，请稍后重新核对。');
    }
    // Unknown numeric difficulty codes are excluded from previews, but cannot
    // establish that all qualifying kills disappeared in a new WCL revision.
    const absence = message => report.fights.some(f =>
      f.encounterID > 0 && f.difficulty !== 1 && !difficulties.has(f.difficulty))
      ? error(422, message) : invalidEvidence(code, message);
    const attempts = report.fights.filter(f => f?.encounterID > 0 && difficulties.has(f.difficulty));
    const victories = attempts.filter(f => f.kill === true);
    if (!victories.length) throw absence('报告中没有普通、英雄或史诗难度的首领击杀。');
    const raidName = chooseRaid(activity, attempts, report.zone);
    const selected = victories.filter(f => f.gameZone.name === raidName);
    if (!selected.length) throw absence('活动指定的团本没有普通、英雄或史诗难度的首领击杀。');
    const raids = await getRows(get, `/rest/v1/game_raids?name=eq.${encodeURIComponent(raidName)}&type=in.(raid,lair)` +
      '&select=id,name,type,game_seasons(id,name),game_bosses(id,name,boss_order)&limit=2');
    const [raid] = raids;
    if (raids.length !== 1 || raid.name !== raidName || !['raid', 'lair'].includes(raid.type) ||
        !raid.id || !raid.game_seasons?.id || !raid.game_seasons.name) {
      throw error(422, '无法唯一匹配该团本及所属赛季，请先核对站内团本资料。');
    }
    const roster = raid.game_bosses;
    if (!Array.isArray(roster) || !roster.length || roster.some(b => !b.id || !b.name) ||
        new Set(roster.map(b => b.name)).size !== roster.length) {
      throw error(422, '该团本的首领清单缺失或不明确，请核对主数据。');
    }
    const bosses = roster.slice().sort((a, b) => a.boss_order - b.boss_order || a.id.localeCompare(b.id))
      .map(({ id, name }) => ({ id, name }));
    const { wcl_report_code, wcl_url, team_label, raid: savedRaid, status } = activity;
    return {
      guildId, activityId, teamLabel: (team_label || '').trim(), region, reportCode: code,
      visibility: report.visibility, revision: report.revision, reportStartAt, reportEndAt,
      uploadedAt: null, verifiedAt: new Date().toISOString(),
      seasonId: raid.game_seasons.id, seasonName: raid.game_seasons.name, raidId: raid.id, raidName,
      bosses, kills: buildKills(selected, report, bosses), excludedOtherRaidKills: victories.length - selected.length,
      activitySource: { wcl_report_code, wcl_url, team_label, raid: savedRaid, status },
    };
  };
}

module.exports = { createBattleEvidenceReader, isMissingWclReport };
