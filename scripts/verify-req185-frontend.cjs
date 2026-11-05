const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('js/app.js','utf8');
const start=source.indexOf('function wclEscapeHtml(value)'),end=source.indexOf('function renderWclCandidates()',start);
(async()=>{
 let uid='u1',gid='g1',resolve;
 const panel={textContent:'',innerHTML:''};
 const ctx={wclAccountBusy:false,wclAccountEpoch:0,wclClaimPreview:null,wclResultCode:null,
 document:{getElementById:()=>panel},CloudSync:{getCachedUser:()=>({id:uid}),getCurrentGuild:()=>({id:gid}),wclAccount:()=>new Promise(r=>resolve=r)},renderWclCandidates:()=>{}};
 vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
 const pending=ctx.loadWclAccount();uid='u2';resolve({link:{wcl_user_name:'old-private-account'},configured:true});await pending;
 assert.equal(panel.innerHTML,'','late account data must not render after user switch');
 uid='u1';const pendingGuild=ctx.loadWclAccount();gid='g2';resolve({link:{wcl_user_name:'old-account'},configured:true});await pendingGuild;
 assert.equal(panel.innerHTML,'','late guild response must not render');
 const one=ctx.loadWclAccount();const oldResolve=resolve;const two=ctx.loadWclAccount();const newResolve=resolve;
 newResolve({link:null,configured:true});await two;const latest=panel.innerHTML;oldResolve({link:{wcl_user_name:'stale'},configured:true});await one;
 assert.equal(panel.innerHTML,latest,'older request must not overwrite newer render');
 assert.equal(ctx.wclEscapeHtml('<script>'), '&lt;script&gt;');
 ctx.wclResultCode='opaque';ctx.CloudSync.wclAccount=async action=>action==='status'?{link:null,configured:true}:{name:'<Account>',characterCount:2};
 await ctx.loadWclAccount();assert.ok(panel.innerHTML.includes('确认关联并查看角色'));assert.ok(panel.innerHTML.includes('&lt;Account&gt;'));
 console.log('REQ185 frontend PASS: user switch, guild switch, out-of-order loading');
})().catch(e=>{console.error(e);process.exitCode=1});
