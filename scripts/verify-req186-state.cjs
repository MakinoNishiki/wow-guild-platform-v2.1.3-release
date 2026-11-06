const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('js/app.js','utf8');
(async()=>{
 let uid='u1',resolve;const panel={innerHTML:'',textContent:'',appendChild(){}};const messages=[];
 const ctx={CloudSync:{getCachedUser:()=>({id:uid}),wclAccount:()=>new Promise(r=>resolve=r)},document:{getElementById:()=>panel,createElement:()=>({})},classIconHtml:()=>'',showToast:(...x)=>messages.push(x)};
 vm.createContext(ctx);vm.runInContext(src.slice(src.indexOf('function wclEscapeHtml(value)'),src.indexOf('async function loadWclAccount()')),ctx);vm.runInContext(src.slice(src.indexOf('let personalCharacterEpoch=0;'),src.indexOf('// 打开添加角色模态框')),ctx);
 const old=ctx.loadUserCharacters();uid='u2';resolve({characters:[{id:'x',character_name:'Private',server_name:'CN'}]});await old;assert.equal(panel.innerHTML,'');
 ctx.CloudSync.wclAccount=async action=>{if(action==='display')throw new Error('save failed');return{characters:[],displayCharacterId:null}};
 await ctx.savePersonalDisplay('x');assert.equal(messages[0][1],'error');assert.ok(!messages.some(x=>x[1]==='success'));assert.ok(panel.innerHTML.includes('不展示任何角色'));
 ctx.CloudSync.wclAccount=async()=>({characters:[{id:'x',character_name:'<secret>',server_name:'CN',source:'wcl',wcl_verification:'revoked'}],displayCharacterId:null});await ctx.loadUserCharacters();assert.ok(panel.innerHTML.includes('&lt;secret&gt;'));assert.ok(panel.innerHTML.includes('WCL 已解绑'));
 console.log('REQ186 state PASS: stale user isolation, failed display reload without false success, escaping and revoked state');
})().catch(e=>{console.error(e);process.exitCode=1});
