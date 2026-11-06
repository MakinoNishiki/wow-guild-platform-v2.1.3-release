const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const source = fs.readFileSync('js/decorData.js', 'utf8');
const part = source.slice(source.indexOf('  const PLAN_DRAFT_KEY'), source.indexOf('  // 任务书 #58-补丁：加单入口'));
function fixture() {
  let uid = 'a';
  const pending = [];
  const context = {
    window: {
      CloudSync: { getCachedUser: () => uid ? { id: uid } : null },
      DecorCatalog: { planBridge: {
        isLoggedIn: () => !!uid,
        listPlans: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
        currentPlanId: () => uid,
      } },
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    state: { rows: [{ record_id: 1 }] },
    planRender() {}, planToast() {},
  };
  vm.createContext(context);
  vm.runInContext(part + ';globalThis.inspect=()=>plan;', context);
  return { context, pending, user: value => { uid = value; } };
}
async function main() {
  const failures = [];
  async function check(name, test) {
    try { await test(); console.log('PASS', name); }
    catch (error) { failures.push(name + ': ' + error.message); }
  }
  await check('logout while loading resets guest state', async () => {
    const f = fixture();
    const loading = f.context.planInit();
    f.user(null);
    await f.context.planInit();
    assert.equal(f.context.inspect().loading, false);
    f.pending[0].resolve([]);
    await loading;
    assert.equal(f.context.inspect().loading, false);
  });
  await check('obsolete failure cannot override newer success', async () => {
    const f = fixture();
    const old = f.context.planInit();
    const latest = f.context.planInit();
    f.pending[1].resolve([{ id: 'a', name: 'Latest', items: [] }]);
    await latest;
    f.pending[0].reject(Error('obsolete timeout'));
    await old;
    assert.equal(f.context.inspect().loadFailed, false);
    assert.equal(f.context.inspect().notice, '');
    assert.equal(f.context.inspect().cloudName, 'Latest');
  });
  if (failures.length) throw Error(failures.join('\n'));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
