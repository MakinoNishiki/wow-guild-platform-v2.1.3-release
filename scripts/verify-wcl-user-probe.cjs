const assert = require('node:assert/strict');
const {createServer,PORT} = require('./wcl-user-probe.cjs');
(async()=>{
 let calls=0;
 const server=createServer({WCL_CLIENT_ID:'test',WCL_CLIENT_SECRET:'test'},async()=>{
   calls++; return {ok:true,json:async()=>calls===1?{access_token:'test-private-token'}:{data:{userData:{currentUser:{id:1,name:'Test'}}}}};
 });
 await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
 const base=`http://127.0.0.1:${PORT}`;
 try {
  const landing=await fetch(base);assert.equal(landing.status,200);
  assert.equal(landing.headers.get('referrer-policy'),'same-origin');
  assert.equal((await fetch(base+'/start',{method:'POST'})).status,403);
  assert.equal((await fetch(base+'/callback?state=invalid&code=x')).status,403);
  const start=await fetch(base+'/start',{method:'POST',headers:{Origin:base},redirect:'manual'});
  assert.equal(start.status,303);
  const target=new URL(start.headers.get('location'));assert.equal(target.searchParams.get('scope'),'view-user-profile');
  const cookie=start.headers.get('set-cookie').split(';')[0];
  const callback=base+'/callback?'+new URLSearchParams({state:target.searchParams.get('state'),code:'test'});
  assert.equal((await fetch(callback)).status,403);assert.equal(calls,0);
  const result=await fetch(callback,{headers:{Cookie:cookie}});const body=await result.text();
  assert.equal(result.status,200);assert.ok(body.includes('Test'));assert.ok(!body.includes('test-private-token'));assert.equal(calls,2);
  assert.equal((await fetch(callback,{headers:{Cookie:cookie}})).status,403);
  console.log('PASS: landing, origin, state, scope, browser cookie, read-only exchange, token exclusion, replay rejection');
 } finally { await new Promise(r=>server.close(r)); }
})().catch(()=>{console.error('Probe verification failed');process.exitCode=1;});
