// Exercise the existing real DB/Chrome allocation suite with the user-reported display cases.
module.exports=async config=>{
  await require('./verify-req193-real.cjs')({...config,verifyLootDisplay:true});
  await require('./verify-req195-ui-cleanup.cjs')(config);
};
