'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {progress,wcl,honorsIn} = require('../js/guildBattlePublic.js');
function entry(id, teamLabel, boss, day, extra = {}) {
  const {region='CN',difficulty='mythic',raidId='r1',seasonId='s1'} = extra;
  return { id, snapshot:{region, teamLabel, seasonId, raidId, bosses:[{id:'A'},{id:'B'}],
    kills:[{bossId:boss,difficulty,killedAt:'2026-11-'+day+'T08:00:00Z'}]} };
}
test('重复日志和每周重复击杀只收录最早一次，补传后重算全通时间',()=>{
  const data=[entry('1','2','A',20),entry('2','2','B',21),entry('3','2','B',18),entry('4','2','A',20)];
  const [group]=progress(data,{});
  assert.equal(group.bosses.size,2);
  assert.ok(group.complete);
  assert.deepEqual(group.milestones.map(e=>e.kill.bossId),['B','A']);
  assert.equal(group.milestones.at(-1).kill.killedAt,'2026-11-20T08:00:00Z');
});
test('团号、赛季、副本、地区、难度分别汇总，团号未注明时每场独立',()=>{
  const base=entry('0','1','A',20);
  const cases=[entry('1','2','B',21),entry('2','1','B',21,{seasonId:'s2'}),entry('3','1','B',21,{raidId:'r2'}),entry('4','1','B',21,{region:'US'}),entry('5','1','B',21,{difficulty:'heroic'})];
  for(const r of cases) assert.deepEqual(progress([base,r],{}).map(g=>g.complete),[false,false]);
  assert.equal(progress([entry('a','','A',20),entry('b','','B',21)],{}).length,2);
  assert.equal(progress([base,...cases],{team:'1 团',season:'s1',difficulty:'heroic'}).length,1);
});
test('两次核对的首领清单不一致时不宣称全通',()=>{
  const a=entry('a','1','A',20), b=entry('b','1','B',21);
  b.snapshot.bosses.push({id:'C'});
  const [g]=progress([a,b],{});
  assert.ok(g.catalogChanged);
  assert.equal(g.complete,false);
});
test('战斗链接仅使用已核对报告编号和战斗编号',()=>{
  assert.match(wcl({reportCode:'TestBattleLog012'},{fightId:2}),/#fight=2$/);
  assert.equal(wcl({reportCode:'https://example.com/'},{fightId:2}),null);
});

test('复杀新获得者纳入荣誉，已有人物按角色和服务器去重，公会与角色分别统计',()=>{
  const first=entry('first','1','A',11), later=entry('later','2','A',18);
  const earned=subject => ({id:63651,scope:'player',subject});
  first.snapshot.kills[0].honors=[earned('团员-罗宁')];
  later.snapshot.kills[0].honors=[earned('团员 - 罗宁'),earned('团员-白银之手'),{id:63648,scope:'guild',subject:'公会-罗宁'}];
  const [player,guild]=honorsIn([later,first],{});
  assert.equal(player.recipients.size,2);
  assert.equal(player.recipients.get('团员-罗宁').report.id,'first');
  assert.equal(guild.recipients.size,1);
  assert.equal(honorsIn([first,later],{team:'1 团'})[0].recipients.size,1);
  assert.deepEqual(honorsIn([first,later],{difficulty:'heroic'}),[]);
});
