/* REQ-199: pure evidence interpretation shared by browser and server. No inferred ownership. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LootEvidence=api;})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const link=v=>String(v||'').match(/\|Hitem:[^|]+\|h.*?\|h/)?.[0]||'';
  const key=e=>JSON.stringify([e.collectorSourceID,e.encounterID,e.encounterAt,e.instanceName,e.difficultyID]);
  function latest(events){
    const map=new Map();
    for(const e of events||[]){const k=JSON.stringify([e.collectorSourceID,e.observationKey]),old=map.get(k);if(!old||e.sequence>old.sequence)map.set(k,e);}
    return [...map.values()];
  }
  function completeness(rows,events){
    const groups=new Map();
    for(const e of latest(events).filter(e=>e.kind==='drop')){
      const k=key(e);if(!groups.has(k))groups.set(k,{boss:e.bossName,instance:e.instanceName,difficultyID:e.difficultyID,at:e.encounterAt,observed:0,matched:0,unknown:0,excluded:0,missing:[],items:[]});
      groups.get(k).items.push(e);
    }
    for(const [k,g] of groups){
      const picked=new Map();
      const quantity=v=>Number.isSafeInteger(v)&&v>0&&v<=100?v:0;
      for(const r of rows.filter(r=>key(r)===k)){const l=link(r.itemLink);if(l&&r.bindingStatus==='ordinary')picked.set(l,(picked.get(l)||0)+(quantity(r.quantity??1)));}
      for(const e of g.items){
        const count=quantity(e.quantity);
        if(!count){g.unknown++;continue;}
        if(e.bindingStatus==='account'){g.excluded+=count;continue;}
        if(e.bindingStatus!=='ordinary'||!link(e.itemLink)){g.unknown+=count;continue;}
        g.observed+=count;const l=link(e.itemLink),n=Math.min(picked.get(l)||0,count);g.matched+=n;picked.set(l,(picked.get(l)||0)-n);
        if(n<count)g.missing.push({name:e.itemName,quantity:count-n});
      }
      delete g.items;g.unmatched=g.observed-g.matched;
    }
    return [...groups.values()];
  }
  function tradesFor(drop,events){
    // Exact variant and bounded time/instance. Still candidates, never proof of a unique physical item.
    const ts=Date.parse(drop.timestamp)/1000;
    return latest(events).filter(e=>e.kind==='trade'&&link(e.itemLink)===link(drop.item_link)&&e.instanceName===drop.instance_name&&e.difficultyID===drop.difficulty_id&&e.timestamp>=ts&&e.timestamp-ts<=86400).sort((a,b)=>a.timestamp-b.timestamp);
  }
  return {link,latest,completeness,tradesFor};
});
