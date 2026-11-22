(() => {
  'use strict';

  const minute = 60_000;
  const day = 24 * 60 * minute;
  const home = document.querySelector('#page-home .home-token');
  const menu = document.getElementById('tokenMenu');
  if (!home || !menu) return;
  const summary = menu.querySelector('summary');
  const menuPrice = document.getElementById('tokenMenuPrice');
  // Both views use the same card markup. Give the second copy its own accessible heading and IDs.
  const detail = home.cloneNode(true);
  detail.querySelectorAll('[id]').forEach(node => { node.id = node.id.replace('homeToken', 'topToken'); });
  detail.setAttribute('aria-labelledby', 'topTokenTitle');
  detail.querySelector('.home-token-trend').replaceWith(document.getElementById('tokenTrendTemplate').content.cloneNode(true));
  menu.querySelector('.token-menu-body').append(detail);
  const views = ['homeToken', 'topToken'].map(prefix => {
    const field = name => document.getElementById(prefix + name);
    return { price: field('Price'), unit: field('Unit'), status: field('Status'), range: field('Range'), chart: field('Chart'), note: field('TrendNote') };
  });
  const formatGold = new Intl.NumberFormat('zh-CN');
  const formatReadTime = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  let started = false;
  let timer;
  let loading = false;
  let lastQuote;
  const updateDetailedTrend = window.mountWowTokenTrend(detail.querySelector('.token-trend'), formatGold, formatReadTime);
  updateDetailedTrend([], Date.now());

  function drawTrend(samples, { range, chart, note }) {
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
    const amount = usable ? formatGold.format(quote.gold) : '—';
    menuPrice.textContent = usable ? (stale ? '上次 ' : '') + amount + ' 金' : '暂无报价';
    const message = usable
      ? (stale ? '更新暂缓，上次读取 ' : '本站读取 ') + formatReadTime.format(quote.readAt) + '（北京时间）'
      : '暂时无法取得报价，稍后自动重试';
    for (const view of views) {
      view.price.textContent = amount;
      view.unit.hidden = !usable;
      view.status.dataset.stale = String(stale);
      view.status.textContent = message;
    }
    const history = usable ? quote.samples : [];
    drawTrend(history, views[0]);
    updateDetailedTrend(history, usable && !stale ? quote.readAt : Date.now());
  }

  async function refresh() {
    if (loading || document.hidden || !menu.getClientRects().length) return;
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
    if (!started || document.hidden) return;
    void refresh();
    timer = setInterval(refresh, minute);
  }

  document.addEventListener('visibilitychange', schedule);
  document.addEventListener('click', event => {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });
  menu.addEventListener('focusout', event => {
    if (event.relatedTarget && !menu.contains(event.relatedTarget)) menu.open = false;
  });
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) {
      event.stopPropagation();
      menu.open = false;
      summary.focus();
    }
  });
  window.WowToken = {
    pageChanged() {
      menu.open = false;
      if (started) return;
      started = true;
      schedule();
    }
  };
})();
