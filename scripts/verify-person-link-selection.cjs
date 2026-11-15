// BUG-124: exercise the shipped save handler; persistence is a controlled seam here.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('js/personAttendance.js','utf8');
const handler=source.slice(source.indexOf('async function personLinkSave()'),source.indexOf('async function personEnsure()'));
(async()=>{
 for(const mode of ['success','failure','unconfirmed','cancel']){
  const selected=new Set(['a','b']),error={textContent:''},button={disabled:false};
  const ctx={personLinkBusy:false,CloudSync:{canEdit:()=>true},document:{querySelectorAll:q=>q.includes(':checked')?[{value:'a'},{value:'b'}]:[],getElementById:id=>id==='personLinkError'?error:id==='personLinkSave'?button:{value:id==='personLinkName'?'团员':''}},confirm:()=>mode!=='cancel',personLinkAttempt:'',personLinkRequestId:'id',crypto:{randomUUID:()=> 'id'},cloudCrud:async()=>{if(mode==='failure')throw Error('网络失败')},cloudCrudSentinelCheck:()=>mode!=='unconfirmed',renderMembers:()=>{},memberClearSelection:()=>selected.clear(),personLinkForm:()=>'',closeModal:()=>{},showToast:()=>{}};
  vm.createContext(ctx);vm.runInContext(handler,ctx);await ctx.personLinkSave();
  assert.equal(selected.size,mode==='success'?0:2,mode+': selection must clear only after confirmed save');
  assert.equal(button.disabled,false);console.log('PASS '+mode);
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});
