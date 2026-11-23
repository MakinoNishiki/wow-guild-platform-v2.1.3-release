'use strict';
const {achievementOptions, beijingDay} = require('./guildBattleHonors.cjs');

function invalid(message) {
  throw Object.assign(new Error(message), {statusCode:400});
}
function stringValue(value, max, message) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f]/u.test(value)) invalid(message);
  return value.trim();
}
function httpsLink(value) {
  const raw = stringValue(value, 2048, '请填写有效的 HTTPS 公开链接（最多 2048 字符）。');
  let link;
  try { link = new URL(raw); } catch { invalid('链接格式无效。'); }
  if (link.protocol !== 'https:' || link.username || link.password || link.port || !link.hostname.includes('.')) {
    invalid('请填写可公开访问的 HTTPS 链接。');
  }
  return link;
}
function video(input) {
  const label = stringValue(input?.label,40,'请填写视角名称（最多 40 字）。');
  const link = httpsLink(input.url);
  const main = ['www.bilibili.com','m.bilibili.com','bilibili.com'].includes(link.hostname) &&
    /^\/video\/(?:BV[0-9a-zA-Z]{10}|av\d+)\/?$/i.test(link.pathname);
  const short = link.hostname === 'b23.tv' && /^\/[a-zA-Z0-9]+\/?$/.test(link.pathname);
  if (!main && !short) invalid('录像请使用 B 站视频地址或 b23.tv 分享短链。');
  return {label,url:link.href};
}
function honor(input, options, day) {
  const option = options.find(item => item.id === input?.id);
  if (!option) invalid('这项成就与所选赛季、团本、首领或难度不符。');
  const subject = stringValue(input.subject,100,'请填写获得成就的角色或公会及服务器（最多 100 字）。');
  if (!/^\S(?:.*\S)?\s*[-－]\s*\S(?:.*\S)?$/u.test(subject)) invalid('获得者请按“名称-服务器”填写。');
  if (input.earnedOn !== day) invalid('取得日期须是这把击杀的北京时间日期，请核对游戏内记录。');
  const link = httpsLink(input.proofUrl);
  if (option.hall && !(link.hostname === 'worldofwarcraft.blizzard.com' &&
      (/\/leaderboards\/hall-of-fame\/mythic-raid\/the-venomous-abyss\/?$/i.test(link.pathname) ||
       /\/armory\/guild\/[^/]+\/[^/]+\/achievements\/(?:guild-)?feats-of-strength\/?$/i.test(link.pathname)))) {
    invalid('名人堂请使用暴雪官网烈毒之渊世界榜或对应公会的光辉事迹页，并核对公会及服务器。');
  }
  return {...option,subject,earnedOn:day,proofUrl:link.href};
}
function unique(items, key, message) {
  if (new Set(items.map(key)).size !== items.length) invalid(message);
}
function identity(snapshot, kill) {
  return JSON.stringify([snapshot.reportCode,kill.fightId,kill.encounterId,kill.difficulty,kill.killedAt]);
}
function applyAnnotations(snapshot, rows) {
  if (!Array.isArray(rows) || rows.length > snapshot.kills.length) invalid('录像与成就清单无效，请重新核对日志。');
  const kills = new Map(snapshot.kills.map(kill => [identity(snapshot,kill),kill]));
  unique(rows, row => row?.fightId, '同一把战斗只能填写一组资料。');
  for (const row of rows) {
    const kill = row && kills.get(identity(row,row));
    if (!kill) invalid('录像或成就所对应的战斗已变化，请重新核对。');
    if (!Array.isArray(row.videos) || row.videos.length > 8 ||
        !Array.isArray(row.honors) || row.honors.length > 80) invalid('每把最多 8 个录像视角和 80 条成就记录。');
    const videos = row.videos.map(video);
    const options = achievementOptions(snapshot,kill);
    const honors = row.honors.map(entry => honor(entry, options, beijingDay(kill.killedAt)));
    unique(videos, entry => entry.url, '同一把战斗重复填写了相同的录像链接。');
    unique(honors, entry => JSON.stringify([entry.id,entry.subject.normalize('NFKC').toLowerCase().replace(/\s*-\s*/g,'-')]), '同一获得者在这把战斗中重复登记了相同成就。');
    if (videos.length) kill.videos = videos;
    if (honors.length) kill.honors = honors;
  }
}
// Stored annotations came from the validated write path. Select public fields explicitly.
function restoreAnnotations(snapshot, previous) {
  if (!previous || previous.reportCode !== snapshot.reportCode || previous.teamLabel !== snapshot.teamLabel ||
      previous.raidId !== snapshot.raidId || previous.seasonId !== snapshot.seasonId || previous.region !== snapshot.region) return;
  const byFight = new Map(previous.kills.map(kill => [identity(previous,kill),kill]));
  for (const kill of snapshot.kills) {
    const old = byFight.get(identity(snapshot,kill));
    if (!old || old.bossId !== kill.bossId) continue;
    if (Array.isArray(old.videos) && old.videos.length) kill.videos = old.videos.map(({label,url}) => ({label,url}));
    if (Array.isArray(old.honors) && old.honors.length) kill.honors = old.honors.map(({id,name,scope,hall,subject,earnedOn,proofUrl}) =>
      ({id,name,scope,hall,subject,earnedOn,proofUrl}));
  }
}
function editorOptions(snapshot) {
  return {...snapshot,kills:snapshot.kills.map(kill => ({...kill,achievementOptions:achievementOptions(snapshot,kill)}))};
}
module.exports = {applyAnnotations, restoreAnnotations, editorOptions};
