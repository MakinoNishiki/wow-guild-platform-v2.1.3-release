// Detailed view of the same successful readings used by the homepage.
window.mountWowTokenTrend = function (panel, formatGold, formatTime) {
  'use strict';
  const hour = 3_600_000;
  const expectedStep = 300_000;
  const left = 61, right = 391, top = 12, bottom = 116;
  const chart = panel.querySelector('svg');
  const fields = Object.fromEntries(Array.from(panel.querySelectorAll('[data-value]'), el => [el.dataset.value, el]));
  const periods = panel.querySelectorAll('[data-hours]');
  const clock = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  let hours = 6, samples = [], end = Date.now(), rows = [], selectedAt = null;
  let yMin = 0, yMax = 1, marker;
  const start = () => end - hours * hour;
  const x = at => left + (right - left) * (at - start()) / (hours * hour);
  const y = gold => bottom - (bottom - top) * (gold - yMin) / (yMax - yMin);

  function svgNode(tag, attrs, parent = chart) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    parent.append(node);
    return node;
  }
  function readPoint(at, row) {
    marker.replaceChildren();
    selectedAt = row ? row.at : null;
    if (at == null) {
      fields.reading.textContent = '所选时段暂无报价';
      return;
    }
    const pos = x(at);
    svgNode('line', { x1: pos, x2: pos, y1: top, y2: bottom, class: 'token-guide' }, marker);
    if (row) svgNode('circle', { cx: pos, cy: y(row.gold), r: 3.6, class: 'token-selected' }, marker);
    fields.reading.textContent = formatTime.format(at) + ' · ' + (row ? formatGold.format(row.gold) + ' 金币' : '未采到报价');
    if (row) {
      chart.setAttribute('aria-valuenow', rows.indexOf(row) + 1);
      chart.setAttribute('aria-valuetext', fields.reading.textContent);
    }
  }
  function draw() {
    if (selectedAt === rows.at(-1)?.at) selectedAt = null;
    rows = samples.filter(row => row.at >= start() && row.at <= end);
    const first = rows[0], last = rows.at(-1);
    const lowest = rows.reduce((min, row) => row.gold < min.gold ? row : min, first);
    const highest = rows.reduce((max, row) => row.gold > max.gold ? row : max, first);
    for (const [name, row] of [['low', lowest], ['high', highest]]) {
      fields[name].textContent = row ? formatGold.format(row.gold) : '—';
      fields[name + 'Time'].textContent = row ? formatTime.format(row.at) : '';
    }
    const delta = rows.length > 1 ? last.gold - first.gold : null;
    const sign = delta > 0 ? '+' : '';
    fields.change.textContent = delta === null ? '—' : sign + formatGold.format(delta) + ' 金';
    fields.percent.textContent = delta === null ? '' : sign + (100 * delta / first.gold).toFixed(2) + '%';
    const expected = Math.floor(hours * hour / expectedStep) + 1;
    const incomplete = first && (first.at - start() > expectedStep || end - last.at > expectedStep ||
      rows.some((row, i) => i && row.at - rows[i - 1].at > expectedStep * 1.5));
    fields.coverage.textContent = '约每 5 分钟采样 · 已采 ' + rows.length + ' 次 / 预计 ' + expected + ' 次' +
      (incomplete ? ' · 空白处缺采样' : '');
    fields.change.previousElementSibling.textContent = first && !incomplete ? '区间涨跌' : '已采时段涨跌';
    chart.replaceChildren();
    chart.setAttribute('role', rows.length ? 'slider' : 'img');
    chart.setAttribute('aria-label', '近 ' + hours + ' 小时时光徽章报价' + (rows.length ? '，左右键逐点查看' : '，暂无采样'));
    chart.setAttribute('tabindex', rows.length ? '0' : '-1');
    for (const name of ['aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext']) chart.removeAttribute(name);
    if (rows.length) {
      chart.setAttribute('aria-valuemin', '1');
      chart.setAttribute('aria-valuemax', rows.length);
      chart.setAttribute('aria-valuenow', rows.length);
      chart.setAttribute('aria-valuetext', formatTime.format(last.at) + ' · ' + formatGold.format(last.gold) + ' 金币');
      const rawStep = Math.max(1, (highest.gold - lowest.gold) / 3);
      const scale = 10 ** Math.floor(Math.log10(rawStep));
      const step = [1, 2, 5, 10].find(n => n * scale >= rawStep) * scale;
      yMin = Math.floor(lowest.gold / step) * step;
      yMax = Math.ceil(highest.gold / step) * step;
      if (yMin === yMax) { yMin = Math.max(0, yMin - step); yMax += step; }
      for (let price = yMin; price <= yMax; price += step) {
        const pos = y(price);
        svgNode('line', { x1: left, x2: right, y1: pos, y2: pos, class: 'token-grid' });
        svgNode('text', { x: left - 6, y: pos + 3, 'text-anchor': 'end' }).textContent = formatGold.format(price);
      }
      let path = '';
      rows.forEach((row, i) => {
        const separated = !i || row.at - rows[i - 1].at > expectedStep * 1.5;
        path += (separated ? 'M' : 'L') + x(row.at) + ' ' + y(row.gold);
        if (separated || i === rows.length - 1) svgNode('circle', { cx: x(row.at), cy: y(row.gold), r: 2, class: 'token-dot' });
      });
      svgNode('path', { d: path, class: 'token-line' });
    }
    for (const fraction of [0, 0.5, 1]) {
      const at = start() + hours * hour * fraction;
      svgNode('text', { x: x(at), y: 138, 'text-anchor': ['start', 'middle', 'end'][fraction * 2] }).textContent =
        hours === 24 ? formatTime.format(at) : clock.format(at);
    }
    marker = svgNode('g', {});
    const active = rows.find(row => row.at === selectedAt) || last;
    readPoint(active?.at, active);
  }
  periods.forEach(button => button.addEventListener('click', () => {
    hours = Number(button.dataset.hours);
    periods.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    selectedAt = null;
    draw();
  }));
  chart.addEventListener('pointermove', event => {
    if (!rows.length) return;
    const rect = chart.getBoundingClientRect();
    const pos = (event.clientX - rect.left) / rect.width * 400;
    if (pos < left || pos > right) { readPoint(rows.at(-1).at, rows.at(-1)); return; }
    const at = start() + (pos - left) / (right - left) * hours * hour;
    const nearest = rows.reduce((best, row) => Math.abs(row.at - at) < Math.abs(best.at - at) ? row : best);
    if (Math.abs(at - nearest.at) <= expectedStep / 2) readPoint(nearest.at, nearest);
    else readPoint(at, null);
  });
  chart.addEventListener('pointerleave', () => {
    const row = (document.activeElement === chart && rows.find(item => item.at === selectedAt)) || rows.at(-1);
    readPoint(row?.at, row);
  });
  chart.addEventListener('focus', () => { const row = rows.at(-1); readPoint(row?.at, row); });
  chart.addEventListener('blur', () => { const row = rows.at(-1); readPoint(row?.at, row); });
  chart.addEventListener('keydown', event => {
    if (!rows.length) return;
    const current = rows.findIndex(row => row.at === selectedAt);
    let index = current < 0 ? rows.length - 1 : current;
    switch (event.key) {
      case 'ArrowRight': case 'ArrowUp': index = Math.min(rows.length - 1, index + 1); break;
      case 'ArrowLeft': case 'ArrowDown': index = Math.max(0, index - 1); break;
      case 'Home': index = 0; break;
      case 'End': index = rows.length - 1; break;
      default: return;
    }
    event.preventDefault();
    readPoint(rows[index].at, rows[index]);
  });
  return function update(history, windowEnd) {
    samples = history;
    end = windowEnd;
    draw();
  };
};
