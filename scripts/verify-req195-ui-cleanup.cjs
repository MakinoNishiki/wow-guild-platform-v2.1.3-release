const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async config=>{
 assert.equal(config.ENVIRONMENT,'isolated-test');assert.equal(config.SUPABASE_URL,'http://127.0.0.1:18000');
 const headers={apikey:config.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+config.SUPABASE_SERVICE_ROLE_KEY};
 const get=async path=>{const response=await fetch(config.SUPABASE_URL+path,{headers});assert(response.ok,'Cleanup verification read failed');return response.json();};
 const guilds=await get('/rest/v1/guilds?name=eq.'+encodeURIComponent('团员界面隔离验证')+'&select=id');
 let remainingUsers=0;for(let page=1;;page++){const result=await get('/auth/v1/admin/users?page='+page+'&per_page=100');const users=result.users||[];remainingUsers+=users.filter(u=>/^req195ui-/.test(u.email||'')).length;if(users.length<100)break;}
 assert.equal(guilds.length,0);assert.equal(remainingUsers,0);
 fs.mkdirSync('docs/evidence/req195-20261116',{recursive:true});fs.writeFileSync('docs/evidence/req195-20261116/ui-cleanup.json',JSON.stringify({environment:'isolated-test',verifiedAt:new Date().toISOString(),remainingSyntheticGuilds:guilds.length,remainingSyntheticUsers:remainingUsers},null,2));
 console.log('PASS REQ195 UI synthetic guild/user cleanup verified');
};
