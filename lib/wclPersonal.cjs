'use strict';
// WCL's own class IDs, not Blizzard IDs (REQ184/182 API evidence).
const WCL_CLASS={1:'死亡骑士',2:'德鲁伊',3:'猎人',4:'法师',5:'武僧',6:'圣骑士',7:'牧师',8:'盗贼',9:'萨满',10:'术士',11:'战士',12:'恶魔猎手',13:'唤魔师'};
module.exports=function({get,write}) {
 const enc=encodeURIComponent;
 const list=uid=>get('user_characters?user_id=eq.'+enc(uid)+'&select=*');
 return {list,
  async sync(uid,characters) {
   const old=await list(uid),now=new Date().toISOString(),seen=new Set();
   for(const c of characters) {
    if(c.claimed!==true||!Number.isSafeInteger(c.id)||!Number.isSafeInteger(c.canonicalID)||!c.name||!c.server?.name||c.server?.region?.slug!=='CN')continue;
    if(seen.has(c.canonicalID))continue;seen.add(c.canonicalID);
    const exact=old.filter(r=>r.character_name===c.name&&r.server_name===c.server.name&&r.server_region==='CN');
    const byId=old.find(r=>String(r.wcl_canonical_id)===String(c.canonicalID));
    if(byId&&exact.some(r=>r.id!==byId.id))throw Error('角色改名或转服与现有记录冲突，请核对');
    const row=byId||exact[0];
    const fields={character_name:c.name,server_name:c.server.name,server_region:'CN',source:'wcl',wcl_character_id:c.id,wcl_canonical_id:c.canonicalID,wcl_verified_at:now,wcl_verification:'verified'};
    if(WCL_CLASS[c.classID])fields.class=WCL_CLASS[c.classID];
    await write(row?'PATCH':'POST','user_characters'+(row?'?id=eq.'+enc(row.id)+'&user_id=eq.'+enc(uid):''),row?fields:{...fields,user_id:uid});
   }
   for(const r of old)if(r.source==='wcl'&&!seen.has(Number(r.wcl_canonical_id)))await write('PATCH','user_characters?id=eq.'+enc(r.id)+'&user_id=eq.'+enc(uid),{wcl_verification:'review'});
   return list(uid);
  },
  async revoke(uid){await write('PATCH','user_characters?user_id=eq.'+enc(uid)+'&source=eq.wcl',{wcl_verification:'revoked',wcl_verified_at:null});},
  async display(uid,id){const rows=await list(uid);if(id&&!rows.some(r=>r.id===id))throw Error('只能展示自己的角色');await write('POST','rpc/set_personal_display',{p_user:uid,p_character:id||null});},
  async publicCharacter(uid){const rows=await get('user_characters?user_id=eq.'+enc(uid)+'&is_displayed=eq.true&select=character_name,server_name,server_region,class&limit=1');return rows[0]||null;}
 };
};
