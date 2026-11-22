'use strict';

const SOURCE_URL = 'https://wowdata.top/wowtoken_retail';
const MINUTE = 60_000;
const SAMPLE_INTERVAL = 5 * MINUTE;
const DAY = 24 * 60 * MINUTE;

// The same public page also contains Taiwan, US and Classic prices.
function readRetailChina(html) {
  const groups = html.split(/<div\s+class=["']?tokenprices-(retail|classic)["']?\s*>/i);
  const start = groups.indexOf('retail');
  if (start < 0) throw new Error('Missing retail market');
  const regionPrice = /<div\s+class=["']?tokenprices-region["']?\s*>\s*cn\s*<\/div>\s*<div\s+class=["']?tokenprices-price["']?\s*>\s*<a\s+href=["']?\/wowtoken_retail["']?\s*>\s*([1-9]\d{0,2}(?:,\d{3})+|[1-9]\d*)\s*<\/a>/gi;
  const matches = [...groups[start + 1].matchAll(regionPrice)];
  if (matches.length !== 1) throw new Error('Missing or ambiguous CN price');
  const gold = Number(matches[0][1].replaceAll(',', ''));
  if (!Number.isSafeInteger(gold)) throw new Error('Invalid gold amount');
  return gold;
}

async function fetchGold() {
  const response = await fetch(SOURCE_URL, {
    signal: AbortSignal.timeout(6000),
    redirect: 'error',
    headers: { Accept: 'text/html' }
  });
  if (!response.ok) throw new Error('Quotation source unavailable');
  return readRetailChina(await response.text());
}

function createTokenMarket({ load = fetchGold, now = Date.now } = {}) {
  let samples = [];
  let nextCheck = 0;
  let lastCheckFailed = false;
  let pending;

  async function refresh() {
    try {
      const gold = await load();
      const at = now();
      samples = samples.filter(sample => sample.at >= at - DAY);
      samples.push({ at, gold });
      nextCheck = at + SAMPLE_INTERVAL;
      lastCheckFailed = false;
    } catch {
      nextCheck = now() + MINUTE;
      lastCheckFailed = true;
    }
  }

  async function read() {
    if (now() >= nextCheck) {
      if (!pending) pending = refresh().finally(() => { pending = null; });
      await pending;
    }
    const latest = samples.at(-1);
    if (!latest || now() - latest.at >= DAY) return null;
    return { gold: latest.gold, readAt: latest.at, stale: lastCheckFailed,
      samples: samples.filter(sample => sample.at >= now() - DAY) };
  }

  return { read };
}

module.exports = { createTokenMarket, readRetailChina, SAMPLE_INTERVAL, MINUTE, DAY };
