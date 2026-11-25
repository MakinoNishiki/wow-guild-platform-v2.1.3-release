'use strict';

// REQ-213：公开国服榜单，只读。仅向固定官方来源发送已验证的查询项。
const SOURCE = 'https://webapi.blizzard.cn/wow-armory-server/api/';
const MINUTE = 60_000;
const ROUTES = new Map([
  ['realms', { path: 'realms', keys: [], ttl: 60 * MINUTE }],
  ['params', { path: 'params', keys: [], ttl: 60 * MINUTE }],
  ['dungeons', { path: 'mythic_leaderboard', keys: ['slug'], ttl: 5 * MINUTE }],
  ['runs', { path: 'mythic_leaderboard_list', keys: ['slug', 'leaderboard_id'], ttl: 5 * MINUTE }],
  ['pvp', { path: 'pvp_rank', keys: ['pvp_rank', 'class_id', 'specialization_id', 'faction'], ttl: 5 * MINUTE }]
]);

function problem(status, message) {
  return Object.assign(new Error(message), { status });
}

function upstreamQuery(kind, route, query) {
  const invalid = () => problem(400, '排行榜查询条件无效');
  const checked = new URLSearchParams();
  for (const [key, value] of query) {
    if (!route.keys.includes(key) || checked.has(key)) throw invalid();
    checked.set(key, value);
  }
  if (route.keys.includes('slug') && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(checked.get('slug') || '')) throw invalid();
  if (kind === 'runs' && !/^[1-9]\d{0,4}$/.test(checked.get('leaderboard_id') || '')) throw invalid();
  if (kind === 'pvp') {
    const bracket = checked.get('pvp_rank') || '';
    if (!/^[1-5]$/.test(bracket)) throw invalid();
    if (bracket === '4' || bracket === '5') {
      if (!/^(?:[1-9]|1[0-3])$/.test(checked.get('class_id') || '') ||
          !/^[1-9]\d{0,3}$/.test(checked.get('specialization_id') || '')) throw invalid();
    } else if (checked.has('class_id') || checked.has('specialization_id')) throw invalid();
    if (checked.has('faction') && (!['3', '5'].includes(bracket) ||
        !['alliance', 'horde'].includes(checked.get('faction')))) throw invalid();
  }
  checked.sort();
  return checked.toString();
}

const invalidData = () => problem(502, '国服官网返回的排行榜数据格式有变，请稍后重试');

function fields(row, keys) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw invalidData();
  const result = {};
  for (const key of keys) {
    const value = row[key];
    if (value === undefined) continue;
    if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) throw invalidData();
    result[key] = value;
  }
  return result;
}

function list(rows, project) {
  if (!Array.isArray(rows)) throw invalidData();
  return rows.map(project);
}

const realm = row => fields(row, ['name', 'slug']);

function runGroup(row) {
  const group = fields(row, ['ranking', 'keystone_level', 'duration', 'completed_timestamp']);
  group.members = list(row.members, member => {
    const profile = fields(member.profile, ['name']);
    if (member.profile.realm) profile.realm = realm(member.profile.realm);
    const specialization = fields(member.specialization || {}, ['id']);
    return { profile, specialization };
  });
  return group;
}

function project(kind, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw invalidData();
  switch (kind) {
    case 'realms':
      return { realms: list(data.realms, realm) };
    case 'params':
      return {
        class: list(data.class, row => {
          const entry = fields(row, ['id', 'name', 'en_name']);
          if (/^#[a-f0-9]{6}$/i.test(row.color)) entry.color = row.color;
          return entry;
        }),
        specializations: list(data.specializations, row => fields(row, ['id', 'class_id', 'name', 'en_name', 'role_type']))
      };
    case 'dungeons':
      return { current_leaderboards: list(data.current_leaderboards, row => fields(row, ['id', 'name'])) };
    case 'runs': {
      if (typeof data.in_season !== 'boolean') throw invalidData();
      const result = fields(data, ['in_season', 'period_start_timestamp', 'period_end_timestamp']);
      result.keystone_affixes = list(data.keystone_affixes ?? [], row => ({
        keystone_affix: fields(row.keystone_affix, ['id', 'name', 'desc'])
      }));
      result.leading_groups = list(data.in_season ? data.leading_groups : data.leading_groups ?? [], runGroup);
      return result;
    }
    case 'pvp': {
      const result = fields(data, ['total', 'show_count', 'season']);
      result.list = list(data.list, row => {
        const player = fields(row, ['name', 'class_id', 'faction', 'won', 'lost', 'played', 'rank', 'rating']);
        if (row.realm) player.realm = realm(row.realm);
        return player;
      });
      return result;
    }
  }
}

async function loadOfficial(kind, url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 429) throw problem(503, '国服官网请求繁忙，请稍后重试');
    throw problem(502, '暂时无法读取国服官网排行榜，请稍后重试');
  }
  const result = await response.json();
  if (result?.code !== 0) throw problem(502, '国服官网未能提供该榜单，请稍后重试');
  return project(kind, result.data);
}

const cache = new Map();
const pending = new Map();
let readWindowStart = 0;
let readsInWindow = 0;

async function read(kind, route, query) {
  const url = new URL(route.path, SOURCE);
  url.search = upstreamQuery(kind, route, query);
  const key = url.href;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.readAt < route.ttl) return cached;
  if (pending.has(key)) return pending.get(key);
  if (now - readWindowStart >= MINUTE) {
    readWindowStart = now;
    readsInWindow = 0;
  }
  // 只计真实回源。重复点击、并发打开同榜和命中缓存均不占回源配额。
  if (pending.size >= 12 || readsInWindow >= 90) throw problem(429, '排行榜查询较多，请稍后重试');
  readsInWindow++;
  const request = loadOfficial(kind, url).then(data => {
    const value = { data, readAt: Date.now() };
    cache.delete(key);
    if (cache.size >= 128) cache.delete(cache.keys().next().value);
    cache.set(key, value);
    return value;
  }).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

async function handleCnLeaderboards(req, res, corsHeaders, kind) {
  const headers = { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  try {
    const route = ROUTES.get(kind);
    if (!route) throw problem(404, '没有这个排行榜接口');
    if (req.method !== 'GET') {
      headers.Allow = 'GET';
      throw problem(405, '排行榜仅支持读取');
    }
    const query = new URL(req.url, 'http://localhost').searchParams;
    const result = await read(kind, route, query);
    res.writeHead(200, headers);
    res.end(JSON.stringify(result));
  } catch (err) {
    const timeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    const status = err.status || (timeout ? 504 : 502);
    const message = err.status ? err.message : timeout ? '读取国服官网排行榜超时，请重试' : '暂时无法读取国服官网排行榜，请稍后重试';
    res.writeHead(status, headers);
    res.end(JSON.stringify({ message }));
  }
}

module.exports = { handleCnLeaderboards };
