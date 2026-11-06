const assert=require('node:assert/strict');
const create=require('../lib/wclPersonal.cjs');
(async()=>{
 let rows=[];
 const personal=create({get:async()=>structuredClone(rows),write:async(method,path,body)=>{if(method==='POST')rows.push({id:String(rows.length+1),...body,is_displayed:false});else {const id=new URL('http://local/'+path).searchParams.get('id')?.slice(3);for(const row of rows)if(!id||row.id===id)Object.assign(row,body);}return rows;}});
 const c={id:1,canonicalID:1,name:'合成角色',claimed:true,server:{name:'罗宁',region:{slug:'CN'}}};
 await personal.sync('u',[c]);assert.equal(rows.length,1);assert.equal(rows[0].wcl_verification,'verified');assert.equal(rows[0].is_displayed,false);
 await personal.sync('u',[c]);assert.equal(rows.length,1);
 await personal.sync('u',[]);assert.equal(rows[0].wcl_verification,'review');
 await personal.sync('u',[c]);assert.equal(rows[0].wcl_verification,'verified');
 await personal.revoke('u');assert.equal(rows[0].wcl_verification,'revoked');assert.equal(rows.length,1);
 await assert.rejects(()=>personal.display('u','foreign'));
 console.log('REQ186 core PASS: private persistence, repeat sync, missing review, reverify, unlink preservation, display ownership');
})().catch(e=>{console.error(e);process.exitCode=1;});
