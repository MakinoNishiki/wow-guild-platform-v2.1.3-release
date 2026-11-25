'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const createHandler = require('../lib/guildRoleRoutes.cjs');
const {authorizeProxyRequest} = require('../server.js');

const guildId = randomUUID(), userId = randomUUID(), membershipId = randomUUID();
const key = 'custom-'+randomUUID();
const permissions = Object.fromEntries(['edit-card','wcl','video','publish','withdraw','submit','review','allocate',
  'settings','remove','claim-mode','claim','assign-claim','attendance','find-wcl','wishlist','stats'].map(name=>[name,name==='attendance']));
const sample = {action:'save',guildId,key,name:'排班官',piece:'rook',permissions,expectedRevision:0};
function setup() {
  const state = {response:{status:200,body:{ok:true}},calls:[],changes:0};
  const route = createHandler({
    auth:async token => token==='valid' ? {id:userId} : null,
    body:async req => JSON.stringify(req.data),
    write:async (...args) => {state.calls.push(args); return state.response;},
    onChange:() => {state.changes++;}
  });
  async function call(method,data,token='valid') {
    const path = '/api/guild-roles', result = {};
    await route({url:path+'?guildId='+guildId,method,headers:{authorization:'Bearer '+token},data},{
      writeHead:(status,headers) => Object.assign(result,{status,headers}), end:raw => {result.data=JSON.parse(raw);}
    },{},path);
    assert.match(result.headers['Cache-Control'],/no-store/);
    return result;
  }
  return {state,call};
}

test('会籍身份读取采用当前登录身份并处理失效会话、缺席会籍及不完整回读', async () => {
  const {state,call}=setup();
  assert.equal((await call('GET',null,'expired')).status,401);
  assert.equal(state.calls.length,0);
  state.response={status:403,body:{code:'42501'}};
  assert.equal((await call('GET')).status,403);
  state.response={status:200,body:{roles:[],assignments:[]}};
  assert.equal((await call('GET')).status,503);
  state.response.body.ownRole='viewer';
  assert.deepEqual((await call('GET')).data,state.response.body);
  assert.deepEqual(state.calls.at(-1),['POST','/rest/v1/rpc/req191_read_roles',{p_guild:guildId,p_user:userId}]);
});

test('角色保存带修订号，角色分配比对旧身份，冲突或失败不确认成功', async () => {
  const {state,call}=setup();
  assert.equal((await call('POST',sample)).status,200);
  assert.deepEqual(state.calls[0],['POST','/rest/v1/rpc/req191_save_role',{p_guild:guildId,p_user:userId,
    p_key:key,p_name:'排班官',p_piece:'rook',p_permissions:permissions,p_revision:0}]);
  const assign={guildId,action:'assign',membershipId,key,expectedRole:'viewer'};
  assert.equal((await call('POST',assign)).status,200);
  assert.deepEqual(state.calls[1],['POST','/rest/v1/rpc/req191_assign_role',{p_guild:guildId,p_user:userId,
    p_key:key,p_expected:'viewer',p_membership:membershipId}]);
  for(const [code,status] of [['PT409',409],['40001',409],['23505',409],['42501',403],['22023',400]]) {
    state.response={status:400,body:{code}};
    assert.equal((await call('POST',sample)).status,status);
  }
  assert.equal(state.changes,2);
  assert.equal((await call('POST',{...assign,expectedRole:''})).status,400);
  assert.equal((await call('POST',{...sample,permissions:{attendance:'on'}})).status,400);
});

test('原会籍写入口只保留显示名修改，业务记录必须使用自己的公会范围', async () => {
  const user={id:userId};
  for (const row of [{role:'editor'},{custom_role_key:key}]) {
    const result=await authorizeProxyRequest(user,'guild_members','PATCH','?id=eq.'+membershipId,JSON.stringify(row));
    assert.equal(result.status,403);
  }
  const result=await authorizeProxyRequest(user,'activities','PATCH','?status=eq.normal',JSON.stringify({guild_id:guildId}));
  assert.equal(result.status,400);
});
