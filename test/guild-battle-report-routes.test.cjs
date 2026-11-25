'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const createRoutes = require('../lib/guildBattleReportRoutes.cjs');
const guildId = randomUUID(), activityId = randomUUID(), reportId = randomUUID(), userId = randomUUID();
const scope = {guildId,activityId};
const actionPath = '/api/guild-reports/';

function setup() {
  const state = { role:'editor', visibility:'public', revision:1, readCount:0, args:[], rows:[], queries:[] };
  const evidence = {...scope,teamLabel:'1',region:'CN',reportCode:'test',reportStartAt:1,reportEndAt:2,
    seasonId:'season',seasonName:'赛季',raidId:'raid',raidName:'团队副本',player:'私有角色',
    bosses:[{id:1,name:'首领',loot:'私有分配'}],
    kills:[{fightId:1,encounterId:8,bossId:1,bossName:'首领',difficulty:'heroic',killedAt:2,
      sourceUrl:'https://www.warcraftlogs.com/reports/test#fight=1',attendees:['出席名单']}],
    activitySource:{wcl_url:'原始链接',wcl_report_code:'test',team_label:'1',raid:'团队副本',status:'normal'}};
  const handler = createRoutes({
    can:async (_guild,_user,key) => state.grants ? state.grants.includes(key) : ['owner','editor'].includes(state.role),
    auth:async token => token==='session' && {id:userId}, body:async req => JSON.stringify(req.data),
    get:async path => {
      state.queries.push(path);
      if (path.startsWith('/rest/v1/guild_members?')) return {status:200,body:state.role?[{role:state.role}]:[]};
      return {status:200,body:state.rows};
    },
    readBattleEvidence:async () => {
      if (state.readError) throw state.readError;
      return {...evidence,revision:state.revision,visibility:state.visibility,verifiedAt:++state.readCount};
    },
    write:async (method,path,args) => {
      assert.equal(method,'POST');
      assert.equal(path,'/rest/v1/rpc/req190_save_report');
      state.args.push(args);
      if (args.p_action==='invalidate') {
        const previous=state.rows[0];
        if (previous.version!==args.p_version || previous.evidence_status==='changed') return {status:200,body:0};
        previous.evidence_status='changed';
        return {status:200,body:++previous.version};
      }
      const published = args.p_action==='publish';
      const version = args.p_version+1;
      state.rows=[{id:reportId,guild_id:guildId,activity_id:activityId,guild_name:'甲',version,
        status:published?'published':'draft',snapshot:args.p_snapshot || evidence,message:args.p_message,
        evidence_status:'verified',published_at:published?3:null,history:'内部历史'}];
      return {status:200,body:version};
    }
  });
  async function call(action,data=scope,{method='POST',token='session',query=''}={}) {
    const req = {method,url:actionPath+action+query,headers:token?{authorization:'Bearer '+token}:{},data};
    const result = {};
    const res = {writeHead:(status,headers) => Object.assign(result,{status,headers}),end:raw => {result.data=JSON.parse(raw);}};
    assert.equal(await handler(req,res,{},actionPath+action),true);
    assert.equal(result.headers['Cache-Control'],'no-store');
    return result;
  }
  return {state,call,evidence};
}

function s2Fixture() {
  const fixture = setup(), {evidence,call} = fixture;
  Object.assign(evidence,{raidName:'烈毒之渊',seasonId:'370c4590-5fa0-47ba-a97a-d8a4436cbeea',reportCode:'TestBattleLog012'});
  Object.assign(evidence.kills[0],{bossName:'乌拉特克',difficulty:'mythic',killedAt:'2026-09-07T16:15:00.000Z'});
  const {fightId,encounterId,difficulty,killedAt} = evidence.kills[0];
  const row = {reportCode:evidence.reportCode,fightId,encounterId,difficulty,killedAt,
    videos:[{label:'法师视角',url:'https://www.bilibili.com/video/BV1ab411c7de/?p=2'}],
    honors:[{id:63651,subject:'测试角色-罗宁',earnedOn:'2026-09-08',proofUrl:'https://evidence.example.org/game/123'}]};
  async function save(annotations,expectedVersion=0) {
    const {data:{previewToken}} = await call('preview');
    return call('save',{...scope,action:'publish',previewToken,expectedVersion,annotations});
  }
  return {...fixture,row,save};
}

test('录像编辑、发布和撤回可分开授权，团员按当前开关操作', async () => {
  const {state,save,row,call}=s2Fixture();
  state.role='viewer';
  state.grants=['publish'];
  assert.equal((await save([row])).status,403);
  assert.equal((await save([])).status,200);
  state.grants=['video'];
  assert.equal((await save([row],1)).status,403);
  const {data:{previewToken}}=await call('preview');
  const draft={...scope,action:'draft',expectedVersion:1,previewToken,annotations:[{...row,honors:[]}]};
  state.rows[0].status='draft';
  assert.equal((await call('save',{...draft,message:'寄语'})).status,403);
  assert.equal((await call('save',draft)).status,200);
  state.grants=['withdraw'];
  assert.equal((await call('save',{...scope,expectedVersion:2,action:'withdraw'})).status,200);
  assert.equal((await call('save',draft)).status,403);
});

test('管理者登记的视角和已核对成就按战斗保存，访客看不到编辑候选，旧页面可安全更新寄语', async () => {
  const {call,state,row,save} = s2Fixture();
  const {data:before} = await call('preview');
  assert.ok(before.snapshot.kills[0].achievementOptions.some(h => h.id===63651));
  assert.equal(before.snapshot.kills[0].honors,undefined);
  assert.equal((await save([row])).status,200);
  const read = () => call('public',null,{method:'GET',token:null,query:'?id='+reportId});
  const [kill] = (await read()).data.report.snapshot.kills;
  assert.deepEqual(kill.videos,row.videos);
  assert.equal(kill.honors[0].name,'千钧一发：乌拉特克');
  assert.equal(kill.honors[0].scope,'player');
  assert.equal(kill.achievementOptions,undefined);
  assert.equal((await save(undefined,1)).status,200);
  assert.deepEqual((await read()).data.report.snapshot.kills[0],kill);
  assert.equal((await save([],2)).status,200);
  assert.equal((await read()).data.report.snapshot.kills[0].videos,undefined);
  state.role='viewer';
  assert.equal((await call('save',{...scope,action:'publish',annotations:[row]})).status,403);
});

test('不同战斗、不同成就条件、非官方名人堂材料和不完整的视角均不能写入', async () => {
  const {evidence,row,save,state,call} = s2Fixture();
  for (const change of [
    r=>{r.fightId++;},r=>{r.reportCode='WrongCode123';},r=>{r.encounterId++;},
    r=>{r.honors[0].earnedOn='2026-09-07';},r=>{r.honors[0].id=63682;},
    r=>{r.honors[0].subject='无区服';},r=>{r.honors[0].id=63652;},
    r=>{r.honors[0].proofUrl='javascript:alert(1)';},r=>{r.videos[0].url='https://www.example.org/video/BV1ab411c7de';},
    r=>{r.videos=[...r.videos,...r.videos];},r=>{r.honors=[...r.honors,...r.honors];},
  ]) {
    const copy=structuredClone(row);
    change(copy);
    assert.equal((await save([copy])).status,400);
  }
  assert.equal(state.args.length,0);
  const options = async () => (await call('preview')).data.snapshot.kills[0].achievementOptions.map(x=>x.id);
  assert.ok((await options()).includes(63652));
  const hall=structuredClone(row); Object.assign(hall.honors[0],{id:63652,subject:'测试公会-罗宁',
    proofUrl:'https://worldofwarcraft.blizzard.com/en-us/worldsoul/us/leaderboards/hall-of-fame/mythic-raid/the-venomous-abyss'});
  assert.equal((await save([hall])).status,200);
  evidence.kills[0].killedAt='2026-11-22T16:15:00.000Z';
  const changed = (await call('preview')).data;
  assert.equal(changed.snapshot.kills[0].videos,undefined);
  assert.ok(!changed.snapshot.kills[0].achievementOptions.some(h=>h.id===63652));
  evidence.kills[0].difficulty='heroic';
  assert.ok((await options()).includes(63650));
  assert.ok(!(await options()).includes(63651));
  evidence.seasonEndDate='2026-10-31';
  assert.ok(!(await options()).includes(63650));
  evidence.seasonId='other';
  assert.deepEqual(await options(),[]);
});
test('草稿预览零写入，发布重新取证并只传限定字段，读取最新数据库结果', async () => {
  const {state,call} = setup();
  const initial = await call('preview');
  assert.equal(initial.status,200);
  assert.equal(state.args.length,0);
  assert.equal(state.readCount,1);
  const text = JSON.stringify(initial.data);
  for (const secret of ['私有角色','私有分配','出席名单','activitySource','原始链接']) assert.ok(!text.includes(secret));
  const saved = await call('save',{...scope,action:'publish',expectedVersion:0,previewToken:initial.data.previewToken,message:'寄语'});
  assert.equal(saved.status,200);
  assert.equal(saved.data.report.status,'published');
  assert.equal(state.args[0].p_snapshot.verifiedAt,2);
  assert.equal(state.args[0].p_user,userId);
  assert.equal(state.args[0].p_source.wcl_url,'原始链接');
  assert.ok(!JSON.stringify(state.args[0].p_snapshot).includes('原始链接'));
  const readback = state.queries.at(-1);
  assert.ok(readback.includes('guild_id=eq.'+guildId) && readback.includes('activity_id=eq.'+activityId));
});
test('保存拒绝过时预览、私有日志、客户端附加快照和无权限账户', async () => {
  const {state,call} = setup();
  const {data:{previewToken}} = await call('preview');
  const save = {...scope,action:'draft',expectedVersion:0,previewToken,message:''};
  state.revision++;
  assert.equal((await call('save',save)).status,409);
  state.visibility='private';
  assert.equal((await call('save',save)).status,409);
  assert.equal((await call('save',{...save,snapshot:{}})).status,400);
  assert.equal((await call('save',{...save,message:'字'.repeat(501)})).status,400);
  const reads = state.readCount;
  state.role='viewer';
  assert.equal((await call('preview')).status,403);
  assert.equal((await call('save',save)).status,403);
  state.role=null;
  assert.equal((await call('current')).status,403);
  assert.equal((await call('current',scope,{token:null})).status,401);
  assert.equal(state.readCount,reads);
  assert.equal(state.args.length,0);
});
test('撤回不依赖有效 WCL，读写都锁定当前公会与活动', async () => {
  const {state,call} = setup();
  state.visibility='private';
  const result=await call('save',{...scope,expectedVersion:1,action:'withdraw'});
  assert.equal(result.status,200);
  assert.equal(result.data.report.status,'draft');
  assert.equal(state.readCount,0);
  const args=state.args[0];
  assert.deepEqual([args.p_guild,args.p_activity,args.p_user,args.p_snapshot],[guildId,activityId,userId,null]);
});
test('既有公开证据只有在确证失效时暂停，网络失败保留原发布快照', async () => {
  const {state,call,evidence}=setup();
  const published={id:reportId,activity_id:activityId,guild_id:guildId,version:3,status:'published',
    evidence_status:'verified',snapshot:structuredClone(evidence)};
  state.rows=[published];
  state.readError=Object.assign(new Error('网络超时'),{statusCode:504});
  assert.equal((await call('preview')).status,504);
  assert.equal(state.args.length,0);
  state.readError=Object.assign(new Error('WCL 已私有'),{statusCode:422,evidenceInvalid:true,reportCode:evidence.reportCode});
  const result=await call('preview');
  assert.equal(result.status,422);
  assert.equal(result.data.invalidatedVersion,4);
  assert.equal(published.evidence_status,'changed');
  assert.equal(state.args[0].p_version,3);
  // 原快照依然能撤回与核对，未经用户再次发布不会自动恢复。
  state.readError=null;
  await call('preview');
  assert.equal(published.evidence_status,'changed');
  assert.equal(state.args.length,1);
});
test('仅新增击杀不影响旧发布；旧战斗被订正时暂停并返回新预览', async () => {
  const {state,call,evidence}=setup();
  const published={id:reportId,activity_id:activityId,guild_id:guildId,version:7,status:'published',
    evidence_status:'verified',snapshot:structuredClone(evidence)};
  state.rows=[published];
  evidence.kills.push({...evidence.kills[0],fightId:2});
  assert.equal((await call('preview')).status,200);
  assert.equal(state.args.length,0);
  evidence.kills[0].difficulty='normal';
  const result=await call('preview');
  assert.equal(result.status,200);
  assert.equal(result.data.snapshot.kills[0].difficulty,'normal');
  assert.equal(result.data.invalidatedVersion,8);
  assert.equal(published.snapshot.kills[0].difficulty,'heroic');
});
test('匿名公开端点分页及单篇查询均限定已发布和有效状态，输出剔除内部字段', async () => {
  const {state,call,evidence} = setup();
  const base={id:reportId,guild_id:guildId,guild_name:'甲',activity_id:activityId,version:7,
    snapshot:evidence,message:'公开寄语',published_at:3,last_actor:userId};
  state.rows=[base,base];
  const publicCall = query => call('public',null,{method:'GET',token:null,query});
  const result=await publicCall('?guildId='+guildId+'&offset=2&limit=1');
  assert.equal(result.data.reports.length,1);
  assert.equal(result.data.hasMore,true);
  assert.deepEqual(Object.keys(result.data.reports[0]),['id','guildId','guildName','snapshot','message','publishedAt']);
  const query=state.queries[0];
  for (const filter of ['guild_id=eq.'+guildId,'status=eq.published','evidence_status=eq.verified','offset=2','limit=2'])
    assert.ok(query.includes(filter));
  const single=await publicCall('?id='+reportId);
  assert.equal(single.data.report.id,reportId);
  assert.ok(!JSON.stringify(single.data).includes(activityId));
  state.rows=[];
  assert.equal((await publicCall('?id='+reportId)).status,404);
  assert.ok(state.queries.at(-1).includes('id=eq.'+reportId));
  assert.equal((await publicCall('?guildId='+guildId+'&id='+reportId)).status,400);
  assert.equal((await publicCall('?guildId='+guildId+'&limit=101')).status,400);
});
