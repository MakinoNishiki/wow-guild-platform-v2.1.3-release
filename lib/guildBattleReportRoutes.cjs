'use strict';
const { createHash } = require('node:crypto');
const {applyAnnotations,restoreAnnotations,editorOptions} = require('./guildBattleAnnotations.cjs');

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const publicFields = 'id,guild_id,guild_name,snapshot,message,published_at';
const editorFields = publicFields + ',activity_id,version,status,evidence_status';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function fail(statusCode, message) {
  throw Object.assign(new Error(message), { statusCode });
}

// 同一白名单用于预览、落库与公开响应。上游新增字段（尤其是角色/账号资料）不自动公开。
function publicSnapshot(source) {
  const { teamLabel, region, reportCode, reportStartAt, reportEndAt, verifiedAt,
    seasonId, seasonName, raidId, raidName } = source;
  return { teamLabel, region, reportCode, reportStartAt, reportEndAt, verifiedAt,
    seasonId, seasonName, seasonEndDate:source.seasonEndDate || null, raidId, raidName, sourceRevision:source.sourceRevision ?? source.revision ?? null,
    uploadedAt:source.uploadedAt ?? null,
    excludedOtherRaidKills:source.excludedOtherRaidKills ?? 0,
    bosses: source.bosses.map(({id, name}) => ({id, name})),
    kills: source.kills.map(({fightId, encounterId, bossId, bossName, difficulty, killedAt, sourceUrl}) =>
      ({fightId, encounterId, bossId, bossName, difficulty, killedAt, sourceUrl})) };
}

function reportDto(row, editor) {
  const snapshot = publicSnapshot(row.snapshot);
  restoreAnnotations(snapshot, row.snapshot);
  const report = { id:row.id, guildId:row.guild_id, guildName:row.guild_name,
    snapshot:editor ? editorOptions(snapshot) : snapshot, message:row.message, publishedAt:row.published_at };
  if (editor) Object.assign(report, {activityId:row.activity_id, version:row.version,
    status:row.status, evidenceStatus:row.evidence_status});
  return report;
}

function pageNumber(raw, fallback, min, max) {
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n < min || n > max) fail(400, '分页参数无效');
  return n;
}

module.exports = ({auth, get, write, body, readBattleEvidence}) => {
  async function rows(path) {
    const result = await get('/rest/v1/' + path);
    if (result.status !== 200 || !Array.isArray(result.body)) fail(503, '战报服务暂不可用，请稍后重试');
    return result.body;
  }
  async function current(guildId, activityId) {
    const result = await rows('guild_battle_report_read?select=' + editorFields +
      '&guild_id=eq.' + guildId + '&activity_id=eq.' + activityId + '&limit=1');
    return result[0] ? reportDto(result[0], true) : null;
  }
  async function saveReport(args) {
    const result = await write('POST','/rest/v1/rpc/req190_save_report',args);
    if (result.status === 200 && Number.isInteger(result.body)) return result.body;
    const code = result.body?.code;
    if (['42501','P0001','22023'].includes(code))
      fail(({42501:403,P0001:409,'22023':400})[code], result.body.message);
    fail(503, '战报保存结果未确认，请重新打开核对后重试');
  }
  async function preview(guildId, activityId, userId) {
    // Capture the published revision before issuing the WCL request. Its eventual result
    // can pause this publication only, even if another manager republishes in the meantime.
    const previous = await current(guildId,activityId);
    const live = previous?.status === 'published';
    const invalidate = async code => {
      if (!live || !code || previous.snapshot.reportCode !== code) return 0;
      return saveReport({p_guild:guildId,p_activity:activityId,p_user:userId,p_version:previous.version,
        p_action:'invalidate',p_source:{reportId:previous.id,reportCode:code},p_snapshot:null,p_message:'',
        p_request:digest([guildId,activityId,userId,previous.version,'invalidate',code])});
    };
    let evidence;
    try { evidence = await readBattleEvidence({guildId, activityId}); }
    catch (err) {
      if (err.evidenceInvalid === true) err.invalidatedVersion = await invalidate(err.reportCode);
      throw err;
    }
    if (evidence.guildId !== guildId || evidence.activityId !== activityId || evidence.visibility !== 'public')
      fail(409, '无法核对该活动的公开日志，请重新预览');
    const snapshot = publicSnapshot(evidence);
    if (!snapshot.kills.length) fail(409, '日志中尚无可发布的普通、英雄或史诗击杀');
    const {verifiedAt, ...content} = snapshot;
    const activitySource = evidence.activitySource;
    const previewToken = digest([guildId,activityId,activitySource,content]);
    let invalidatedVersion = 0;
    if (live && previous.snapshot.reportCode === snapshot.reportCode) {
      const byFight = new Map(snapshot.kills.map(kill => [kill.fightId,kill]));
      const oldKillChanged = previous.snapshot.kills.some(old => {
        const latest = byFight.get(old.fightId);
        return !latest || latest.encounterId !== old.encounterId || latest.killedAt !== old.killedAt ||
          latest.difficulty !== old.difficulty;
      });
      if (oldKillChanged) invalidatedVersion = await invalidate(snapshot.reportCode);
    }
    return { snapshot, previousSnapshot:previous?.snapshot, previewToken, activitySource, invalidatedVersion };
  }
  async function publicRead(req) {
    const q = new URL(req.url, 'http://localhost').searchParams;
    const guildId = q.get('guildId');
    const id = q.get('id');
    if ((guildId === null) === (id === null) || !uuid.test(id ?? guildId)) fail(400, '请指定一篇战报或一个公会');
    const query = 'guild_battle_report_read?select=' + publicFields + '&status=eq.published&evidence_status=eq.verified';
    if (id) {
      const result = await rows(query + '&id=eq.' + id + '&limit=1');
      if (!result[0]) fail(404, '这篇战报尚未公开或已撤回');
      return {report:reportDto(result[0], false)};
    }
    const offset = pageNumber(q.get('offset'), 0, 0, 2147483647);
    const limit = pageNumber(q.get('limit'), 50, 1, 100);
    const result = await rows(query + '&guild_id=eq.' + guildId + '&order=published_at.desc,id.asc' +
      '&offset=' + offset + '&limit=' + (limit + 1));
    return { reports:result.slice(0, limit).map(row => reportDto(row, false)), hasMore:result.length > limit };
  }
  async function manage(req, action) {
    const token = /^Bearer (\S+)$/i.exec(req.headers.authorization || '')?.[1];
    const user = token && await auth(token);
    if (!user || !uuid.test(user.id)) fail(401, '请先登录');
    let request;
    const raw = await body(req);
    try { request = JSON.parse(raw); } catch { fail(400, '请求内容无效'); }
    if (!request || !uuid.test(request.guildId) || !uuid.test(request.activityId)) fail(400, '公会或活动编号无效');
    const {guildId, activityId} = request;
    const membership = await rows('guild_members?select=role&guild_id=eq.' + guildId + '&user_id=eq.' + user.id + '&limit=1');
    if (!['owner','editor'].includes(membership[0]?.role)) fail(403, '仅本公会管理者可编辑战报');
    if (action === 'current') return {report:await current(guildId, activityId)};
    if (action === 'preview') {
      const {snapshot, previousSnapshot, previewToken, invalidatedVersion} = await preview(guildId, activityId,user.id);
      restoreAnnotations(snapshot,previousSnapshot);
      return {snapshot:editorOptions(snapshot), previewToken, ...(invalidatedVersion && {invalidatedVersion})};
    }
    const {expectedVersion, action:operation} = request;
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || expectedVersion >= 2147483647 ||
        !['draft','publish','withdraw'].includes(operation)) fail(400, '战报操作或版本无效');
    const allowed = ['guildId','activityId','expectedVersion','action'];
    let snapshot = null, activitySource = null, message = '', previewToken = null;
    if (operation !== 'withdraw') {
      allowed.push('message', 'previewToken', 'annotations');
      message = request.message ?? '';
      if (typeof message !== 'string' || message.length > 500 || message.includes('\u0000')) fail(400, '团长寄语最多 500 字');
      if (typeof request.previewToken !== 'string' || !/^[a-f0-9]{64}$/.test(request.previewToken)) fail(400, '请先预览再保存');
    }
    if (Object.keys(request).some(key => !allowed.includes(key))) fail(400, '请求包含不支持的战报字段');
    if (operation !== 'withdraw') {
      const checked = await preview(guildId, activityId,user.id);
      if (checked.invalidatedVersion) throw Object.assign(new Error('原公开击杀已失效，展示已暂停，请重新核对。'),
        {statusCode:409,invalidatedVersion:checked.invalidatedVersion});
      ({snapshot, activitySource, previewToken} = checked);
      if (request.previewToken !== previewToken) fail(409, '预览后的活动或击杀记录已变化，请重新预览');
      // 老版本页面只编辑寄语时，仍保留同一战斗的资料。新页面显式提交空数组表示清除。
      if (request.annotations === undefined) restoreAnnotations(snapshot,checked.previousSnapshot);
      else applyAnnotations(snapshot,request.annotations);
    }
    const savedVersion = await saveReport({
      p_guild:guildId,p_activity:activityId,p_user:user.id,p_version:expectedVersion,p_action:operation,
      p_source:activitySource,p_snapshot:snapshot,p_message:message,
      p_request:digest([guildId,activityId,user.id,expectedVersion,operation,previewToken,message,
        snapshot?.kills.map(({fightId,videos,honors}) => [fightId,videos,honors])])
    });
    const report = await current(guildId, activityId);
    if (!report || report.version !== savedVersion) fail(409, '战报已变化，请重新打开核对最新状态');
    return {report};
  }
  return async (req,res,cors,path) => {
    if (!path.startsWith('/api/guild-reports/')) return false;
    const action = path.slice('/api/guild-reports/'.length);
    const send = (status, data) => {
      res.writeHead(status, {...cors, 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      res.end(JSON.stringify(data));
    };
    try {
      if (!['public','preview','current','save'].includes(action)) fail(404, '战报接口不存在');
      if (req.method !== (action === 'public' ? 'GET' : 'POST')) fail(405, '请求方式无效');
      send(200, action === 'public' ? await publicRead(req) : await manage(req,action));
    } catch (err) {
      send(err.statusCode || 500, {message:err.statusCode ? err.message : '战报服务暂不可用，请稍后重试',
        ...(err.invalidatedVersion && {invalidatedVersion:err.invalidatedVersion})});
    }
    return true;
  };
};
