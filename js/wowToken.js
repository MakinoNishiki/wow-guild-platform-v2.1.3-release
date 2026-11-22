(() => {
  'use strict';

  const minute = 60_000;
  const day = 24 * 60 * minute;
  const panel = document.querySelector('.home-token');
  if (!panel) return;
  const element = id => panel.querySelector('#homeToken' + id);
  const price = element('Price');
  const unit = element('Unit');
  const status = element('Status');
  const range = element('Range');
  const chart = element('Chart');
  const note = element('TrendNote');
  const formatGold = new Intl.NumberFormat('zh-CN');
  const formatReadTime = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  let active = false;
  let timer;
  let loading = false;
  let lastQuote;

  function drawTrend(samples) {
    chart.toggleAttribute('hidden', samples.length < 2);
    note.hidden = samples.length > 1;
    range.textContent = '';
    if (samples.length < 2) {
      note.textContent = samples.length ? '已记录首个报价，等待下次采样' : '等待报价';
      return;
    }
    const first = samples[0];
    const last = samples[samples.length - 1];
    const low = Math.min(...samples.map(sample => sample.gold));
    const high = Math.max(...samples.map(sample => sample.gold));
    const commands = samples.map((sample, index) => {
      const x = 2 + 176 * (sample.at - first.at) / (last.at - first.at);
      const y = high === low ? 19 : 35 - 32 * (sample.gold - low) / (high - low);
      // A break in successful readings should leave a gap in the line.
      const newSegment = !index || sample.at - samples[index - 1].at > 10 * minute;
      return (newSegment ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + (newSegment ? 'h0.1' : '');
    });
    chart.querySelector('path').setAttribute('d', commands.join(' '));
    range.textContent = formatReadTime.format(first.at) + ' – ' + formatReadTime.format(last.at);
    chart.setAttribute('aria-label', '本站采样走势，最低 ' + formatGold.format(low) + ' 金币，最高 ' + formatGold.format(high) + ' 金币');
  }

  function render(quote, failed) {
    const usable = quote && Date.now() - quote.readAt < day;
    const stale = !usable || quote.stale || failed;
    price.textContent = usable ? formatGold.format(quote.gold) : '—';
    unit.hidden = !usable;
    status.dataset.stale = String(stale);
    status.textContent = usable
      ? (stale ? '更新暂缓，上次读取 ' : '本站读取 ') + formatReadTime.format(quote.readAt) + '（北京时间）'
      : '暂时无法取得报价，稍后自动重试';
    drawTrend(usable ? quote.samples : []);
  }

  async function refresh() {
    if (loading || !active || document.hidden) return;
    loading = true;
    try {
      const response = await fetch('/api/wow-token/cn', { cache: 'no-store', signal: AbortSignal.timeout(12_000) });
      if (!response.ok) throw new Error('Quote unavailable');
      const quote = await response.json();
      if (!Number.isSafeInteger(quote.gold) || quote.gold <= 0 || !Number.isFinite(quote.readAt) || !Array.isArray(quote.samples)) {
        throw new Error('Invalid quote');
      }
      lastQuote = quote;
      render(quote, false);
    } catch {
      render(lastQuote, true);
    } finally {
      loading = false;
    }
  }

  function schedule() {
    clearInterval(timer);
    if (!active || document.hidden) return;
    void refresh();
    timer = setInterval(refresh, minute);
  }

  document.addEventListener('visibilitychange', schedule);
  window.WowToken = {
    setActive(value) {
      if (active === value) return;
      active = value;
      schedule();
    }
  };
})();
