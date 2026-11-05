// Test harness only: replace WCL transport, retain real Supabase transport.
const https=require('node:https');
const {EventEmitter}=require('node:events');
const fixture={identity:{id:185001,name:'隔离WCL账号',characters:[]}};
fixture.install=()=>{
 const original=https.request;
 https.request=function(options,callback){
  if(options.hostname!=='www.warcraftlogs.com')return original.apply(this,arguments);
  const req=new EventEmitter();req.write=()=>{};req.setTimeout=()=>req;req.destroy=e=>req.emit('error',e);
  req.end=()=>queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=200;req.emit('response',res);callback(res);
   res.emit('data',JSON.stringify(options.path==='/oauth/token'?{access_token:'isolated-fixture'}:{data:{userData:{currentUser:fixture.identity}}}));res.emit('end');req.emit('close');});
  return req;
 };return()=>{https.request=original;};
};
module.exports=fixture;
