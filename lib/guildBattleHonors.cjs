'use strict';

// 国服 12.1.5.70961 Achievement，game_seasons UUID 与站内主数据快照一致。
// 多首领成就可登记在完成最后一个条件的那一把，管理者另查完整成就凭据。
const seasonId = '370c4590-5fa0-47ba-a97a-d8a4436cbeea';
const ranks = {normal:1, heroic:2, mythic:3};
const abyss = ['盘魂者内克扎莉','陵寝哨兵','迷失的探险者','万毒邪祟者瓦什尼克','斯索拉克','双子毒牙','盘卷祭坛','乌拉特克'];
const entries = [];
function add(raid, bosses, difficulty, scope, id, name) {
  entries.push({raid, bosses, difficulty, id, name, scope, hall:id === 63652});
}
function venom(bosses, difficulty, scope, id, name) {
  add('烈毒之渊', bosses, difficulty, scope, id, name);
}
const mythicIds = [63523,63524,63525,63526,63527,63528,63529,63476];
const challengeIds = [63418,63250,63645,63397,63391,63656,63669,63609];
const challenges = ['井底之蛙观小天','毒液静滞是闹着玩的吗？','纯属误伤','让你久等了吧？','大费周章','尝尝软泥的滋味','背发凉，心慌慌','保全蛇卵'];
abyss.forEach((boss,i) => {
  venom([boss], 'mythic', 'player', mythicIds[i], i === 7 ? '史诗：乌拉特克' : boss + '（史诗难度）');
  venom([boss], 'normal', 'player', challengeIds[i], challenges[i]);
});
venom([abyss[7]], 'heroic', 'player', 63650, '引领潮流：乌拉特克');
venom([abyss[7]], 'mythic', 'player', 63651, '千钧一发：乌拉特克');
venom([abyss[7]], 'mythic', 'guild', 63652, '名人堂：乌拉特克');
venom([abyss[7]], 'mythic', 'guild', 63648, '史诗：乌拉特克（公会版）');
venom(abyss, 'normal', 'player', 63521, '烈毒之渊');
venom(abyss, 'heroic', 'player', 63520, '烈毒之渊（英雄难度）');
venom(abyss, 'mythic', 'player', 63522, '烈毒之渊（史诗难度）');
venom(abyss, 'normal', 'guild', 63646, '烈毒之渊（公会版）');
venom(abyss, 'heroic', 'guild', 63647, '英雄：烈毒之渊（公会版）');
venom([abyss[0],abyss[1],abyss[3]], 'normal', 'player', 63530, '烈毒之渊：乌拉特克的精华');
venom([abyss[2],abyss[4],abyss[5]], 'normal', 'player', 63531, '烈毒之渊：乌拉特克的狂兽');
venom([abyss[6],abyss[7]], 'normal', 'player', 63532, '烈毒之渊：乌拉特克');

function singleBoss(raid, boss, ids) {
  for (const [i,difficulty] of Object.keys(ranks).entries()) {
    add(raid,[boss],difficulty,'player',ids[i],boss + ['', '（英雄难度）','（史诗难度）'][i]);
    add(raid,[boss],difficulty,'guild',ids[i+3],['','英雄：','史诗：'][i] + boss + '（公会版）');
  }
}
singleBoss('潮缚石窟','尼姆瑞莎·唤波者',[63683,63681,63682,63686,63687,63688]);
singleBoss('基希克斯破封','基希克斯',[63692,63693,63694,64167,64168,64169]);

function achievementOptions(snapshot, kill) {
  if (snapshot.region !== 'CN' || snapshot.seasonId !== seasonId) return [];
  const day = beijingDay(kill.killedAt);
  const opens = snapshot.raidName === '基希克斯破封' ? '2026-10-15' : '2026-08-20';
  if (day < opens) return [];
  // 世界名人堂已满，10 月 12 日公告明确各地区下次周重置封榜。
  // 国服 10 月 15 日当天仍须凭官方记录核对具体时刻。国服活动榜有独立规则。
  const inHallWindow = day <= '2026-10-15';
  return entries.filter(entry => entry.raid === snapshot.raidName && entry.bosses.includes(kill.bossName) &&
    (!entry.hall || inHallWindow) &&
    (![63650,63651].includes(entry.id) || !snapshot.seasonEndDate || day <= snapshot.seasonEndDate) &&
    ranks[kill.difficulty] >= ranks[entry.difficulty]).map(({id,name,scope,hall}) => ({id,name,scope,hall}));
}
function beijingDay(at) {
  const ms = new Date(at).getTime();
  return Number.isFinite(ms) ? new Date(ms + 8*3600*1000).toISOString().slice(0,10) : '';
}
module.exports = {achievementOptions, beijingDay};
