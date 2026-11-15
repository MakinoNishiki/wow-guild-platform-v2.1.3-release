// Controlled transport promises drive the actual cloud.js functions in a VM.
// This is a concurrency regression, not a browser or database integration test.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const original=fs.readFileSync('js/cloud.js','utf8');
const checks=[];
function harness(source=original){
 const pending=[],released=[];let hold=null;
 const fixture=(table,guild)=>table==='guilds'?{id:guild}:table==='guild_members'?{role:'owner'}:table==='raid_members'?[{id:guild+'-role',name:guild,class:'战士',person_id:guild+'-person',status:'正式'}]:table==='guild_people'?[{id:guild+'-person',name:guild,status:'active'}]:table==='activities'?[{id:guild+'-activity',attendance_mode:'person',status:'normal'}]:table==='guild_person_attendance'?[{activity_id:guild+'-activity',person_id:guild+'-person',status:'出席'}]:[];
 const client={from(table){let guild='A';const q={select(){return q},eq(key,v){if(['guild_id','id'].includes(key))guild=v;return q},in(){return q},order(){return q},range(){return q},maybeSingle(){return q},then(resolve,reject){const result={data:fixture(table,guild),error:null};if(hold===table){pending.push({table,guild,release:()=>{released.push(table);resolve(result)}});}else resolve(result)}};return q}};
 const window={appData:{},iaOnSignedOut(){}};
 const context=vm.createContext({window,formatDate:()=> '2026-11-16',console:{log(){},debug(){},warn(){},error(){}},document:{body:{classList:{remove(){}}}},localStorage:{removeItem(){},setItem(){},getItem(){return null}},performance,URL,setTimeout,clearTimeout});
 const extra=`window.__test={reloadMembers,reloadActivities,selectGuild,onUserSignedOut,clearPeopleContext,set:(u,g)=>{currentUser=u?{id:u}:null;currentGuild=g?{id:g}:null;},client:c=>supabaseClient=c,state:()=>({user:currentUser,guild:currentGuild}),noopLoad:()=>{loadCloudData=async()=>{};updateGuildUI=()=>{};}};`;
 vm.runInContext(source.replace(/\}\)\(\);\s*$/,extra+'})();'),context);window.__test.client(client);window.__test.noopLoad();window.__test.set('user','A');
 return {window,t:window.__test,hold:t=>hold=t,pending,async reach(){for(let i=0;i<20&&!pending.length;i++)await new Promise(r=>setImmediate(r));assert(pending.length,'read must actually pause');},release(){hold=null;pending.splice(0).forEach(p=>p.release());}};
}
async function staleRead(kind,table,transition,source){
 const h=harness(source);h.hold(table);const task=h.t[kind]('A').catch(e=>e.message);await h.reach();
 // A member read must not leak halfway through while its people query is pending.
 if(kind==='reloadMembers'&&table==='guild_people')assert.equal(h.window.appData.members,undefined,'members and people commit atomically');
 if(transition==='guild'){h.t.clearPeopleContext();h.t.set('user','B');}
 else {h.t.set(null,null);h.t.onUserSignedOut();if(transition==='same-user')h.t.set('user','A');}
 const marker={id:'current-context'};h.window.appData.members=[marker];h.window.appData.people=[marker];h.window.appData.activities=[marker];
 h.release();await task;
 assert.equal(h.window.appData.members[0],marker);assert.equal(h.window.appData.people[0],marker);assert.equal(h.window.appData.activities[0],marker);
}
async function staleSelection(source){
 const h=harness(source);h.hold('guilds');const task=h.t.selectGuild('A');await h.reach();
 h.t.set(null,null);h.t.onUserSignedOut();h.t.set('user',null);h.release();await task;
 assert.equal(h.t.state().guild,null,'old selectGuild must not restore a guild after same-account relogin');
}
(async()=>{
 const scenarios=[['reloadMembers','raid_members','guild'],['reloadMembers','guild_people','guild'],['reloadMembers','guild_people','logout'],['reloadMembers','guild_people','same-user'],['reloadActivities','guild_person_attendance','guild'],['reloadActivities','guild_person_attendance','logout'],['reloadActivities','guild_person_attendance','same-user']];
 for(const args of scenarios){await staleRead(...args);checks.push(args.join(' / '));}
 await staleSelection(original);checks.push('same-account relogin invalidates old selectGuild');
 // Mutation proof: removing the new protections must turn this test red.
 let caught=false;try{await staleRead('reloadActivities','guild_person_attendance','guild',original.replace("if(currentGuild?.id!==guildId||currentUser?.id!==readUserId||readEpoch!==peopleContextEpoch)throw new Error('账号或公会已切换，请重新读取');",'').replace("if(currentGuild?.id!==guildId||currentUser?.id!==readUserId||readEpoch!==peopleContextEpoch)throw new Error('账号或公会已切换，请重新读取');",''));}catch{caught=true;}assert(caught);checks.push('mutation: removed read guards is detected');
 caught=false;try{await staleSelection(original.replace('    guildSelectionSequence++;',''));}catch{caught=true;}assert(caught);checks.push('mutation: removed logout selection invalidation is detected');
 const out='docs/evidence/req195-20261116/context-verification.json';fs.mkdirSync('docs/evidence/req195-20261116',{recursive:true});fs.writeFileSync(out,JSON.stringify({kind:'VM actual cloud.js with controlled transport',checks},null,2));console.log('PASS '+checks.length+' context race checks');
})().catch(e=>{console.error(e);process.exitCode=1});
