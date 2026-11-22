const test = require('node:test');
const assert = require('node:assert/strict');
const { readRetailChina, createTokenMarket, SAMPLE_INTERVAL, MINUTE, DAY } = require('../lib/wowToken.cjs');

function row(region, link, price) {
  return '<div class=tokenprices-region>' + region + '</div><div class=tokenprices-price><a href=' + link + '>' + price + '</a></div>';
}
const cn = row('cn', '/wowtoken_retail', '690,922');
const tw = row('tw', '/wowtoken_retail_tw', '888,001');
const retail = '<div class="tokenprices-retail">';
const classic = '<div class=tokenprices-classic>';

test('only accept an unambiguous CN retail price inside its market', () => {
  assert.equal(readRetailChina(classic + cn + retail + tw + cn), 690922);
  for (const page of [classic + cn, retail + tw + classic + cn, retail + cn + cn,
    retail + row('cn', '/wowtoken_retail_tw', '888'), retail + cn.replace('690,922', '1,22'),
    retail + cn.replace('690,922', '0'), retail + cn.replace('690,922', '99999999999999999')]) {
    assert.throws(() => readRetailChina(page));
  }
});

test('visitors share a refresh and prices are sampled only once per interval', async () => {
  let time = DAY, calls = 0;
  const market = createTokenMarket({ now: () => time, load: async () => 100 + ++calls });
  const [first, second] = await Promise.all([market.read(), market.read()]);
  assert.deepEqual(first, second);
  time += SAMPLE_INTERVAL - 1;
  assert.deepEqual(await market.read(), first);
  time++;
  const next = await market.read();
  assert.equal(calls, 2);
  assert.deepEqual(next.samples.map(v => v.gold), [101, 102]);
  assert.equal(next.stale, false);
});

test('a failure keeps the last successful timestamp, expires it, and recovers', async () => {
  let time = DAY, offline = true, calls = 0;
  const market = createTokenMarket({ now: () => time, load: async () => {
    calls++;
    if (offline) throw new Error('offline');
    return 100;
  } });
  assert.equal(await market.read(), null);
  assert.equal(await market.read(), null);
  assert.equal(calls, 1);
  offline = false; time += MINUTE;
  const first = await market.read();
  offline = true; time += SAMPLE_INTERVAL;
  const stale = await market.read();
  assert.deepEqual(stale, { ...first, stale: true });
  time = first.readAt + DAY;
  assert.equal(await market.read(), null);
  time += MINUTE; offline = false;
  const recovered = await market.read();
  assert.equal(recovered.stale, false);
  assert.deepEqual(recovered.samples, [{ at: time, gold: 100 }]);
});
