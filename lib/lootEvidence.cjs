'use strict';
const crypto=require('node:crypto');
const fail=m=>{throw Object.assign(new Error(m),{statusCode:400});};
exports.normalize=function(row){
  if(!row||typeof row!=='object'||Array.isArray(row))fail('观察证据格式无效');
  const r={};
  const text=(k,max,required=false)=>{const v=row[k]??'';if(typeof v!=='string'||v.length>max||/[\x00-\x1f]/.test(v)||required&&!v.trim())fail('观察字段无效：'+k);r[k]=v.trim();};
  const number=(k,min,max,required=false)=>{const v=row[k];if(v==null&&!required)return;if(!Number.isSafeInteger(v)||v<min||v>max)fail('观察数值无效：'+k);r[k]=v;};
  for(const k of ['collectorSourceID','sourceEventID','observationKey','kind','itemName','instanceName'])text(k,160,true);
  for(const k of ['bossName','fromName','fromServer','toName','toServer','winnerName','winnerServer'])text(k,160);
  text('itemLink',2048,true);text('bindingStatus',30,true);text('outcome',30);text('captureVersion',30);
  number('itemID',1,2147483647,true);number('difficultyID',1,1000,true);number('quantity',1,100,true);number('sequence',1,Number.MAX_SAFE_INTEGER,true);
  const now=Math.floor(Date.now()/1000)+86400;
  number('timestamp',946684800,now,true);number('encounterID',1,2147483647,row.kind==='drop');number('encounterAt',946684800,now,row.kind==='drop');
  if(!['drop','trade'].includes(r.kind)||!['ordinary','account','unknown'].includes(r.bindingStatus)||![3,4,9,14,5,6,15,16].includes(r.difficultyID))fail('观察类型、绑定或难度不支持');
  if(!r.itemLink.startsWith('|Hitem:'+r.itemID+':')||!r.itemLink.endsWith('|h'))fail('观察物品链接无效');
  if(r.kind==='trade'&&(!['success','cancelled','unknown'].includes(r.outcome)||!r.fromName||!r.toName))fail('交易结果或双方信息不完整');
  return {collector_source_id:r.collectorSourceID,source_event_id:r.sourceEventID,kind:r.kind,payload:r,content_hash:crypto.createHash('sha256').update(JSON.stringify(r)).digest('hex')};
};
