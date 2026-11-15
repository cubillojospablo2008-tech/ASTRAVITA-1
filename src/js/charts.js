/* =====================================================================
   ASTRAVITA.charts — dependency-free, accessible SVG charts (works offline).
   Every chart has role="img", a text summary, keyboard/pointer tooltips and
   an alternative data table. Missing readings leave gaps (never interpolated).
   ===================================================================== */
ASTRAVITA.charts = (() => {
  const U = ASTRAVITA.util, {fin, esc} = U;
  const PALETTE = {primary: '#147D52', tele: '#3478A8', vision: '#39A9DB', gold: '#C6A15B', warn: '#B7791F', bad: '#C34A4A', forest: '#102C28', slate: '#566476', violet: '#6B5CA5'};
  const niceRange = (lo, hi) => {
    if (!fin(lo) || !fin(hi)) return [0, 1];
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
    const span = hi - lo, step = 10 ** Math.floor(Math.log10(span / 4)), m = [1, 2, 2.5, 5, 10].find(x => span / (x * step) <= 5) * step;
    return [Math.floor(lo / m) * m, Math.ceil(hi / m) * m, m];
  };

  function table(labels, series, caption) {
    return `<details class="alt-table"><summary>Show data table</summary><div class="table-wrap"><table class="data"><caption class="sr-only">${esc(caption)}</caption><thead><tr><th scope="col">Point</th>${series.map(s => `<th scope="col">${esc(s.name)}${s.unit ? ' (' + esc(s.unit) + ')' : ''}</th>`).join('')}</tr></thead><tbody>${labels.map((l, i) => `<tr><th scope="row">${esc(l)}</th>${series.map(s => `<td class="num">${fin(s.data[i]) ? U.fmt(s.data[i], s.dec ?? 1) : '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
  }
  function legend(series) { return `<div class="legend" aria-hidden="true">${series.map(s => `<span style="color:${s.color}"><i class="${s.dash ? 'dash' : ''}" style="background:${s.color}"></i><span style="color:var(--muted)">${esc(s.name)}</span></span>`).join('')}</div>`; }

  /* line / bar chart. opts: {labels, series:[{name, data, color, unit, dec, dash, axis:'y'|'y2', type:'line'|'bar'}],
     y:{min,max,label}, y2:{min,max,label}, bands:[{from,to,color,label}], title, summary, height} */
  const decOf = step => step >= 1 ? 0 : Math.min(3, (String(+step.toFixed(4)).split('.')[1] || '').length);
  // re-render when the container width changes so text and markers are never stretched
  const observed = new Set();
  const ro = 'ResizeObserver' in window ? new ResizeObserver(entries => { for (const e of entries) { const c = e.target, w = Math.round(e.contentRect.width); if (c.__chart && Math.abs(w - c.__chart.w) > 24) { c.__chart.w = w; render(c, c.__chart.opts); } } }) : null;
  function render(container, opts) {
    if (ro) { for (const c of observed) if (!c.isConnected) { ro.unobserve(c); observed.delete(c); } if (!observed.has(container)) { ro.observe(container); observed.add(container); } }
    container.__chart = {opts, w: Math.round(container.clientWidth || 640)};
    const {labels = [], series = [], title = 'Chart', summary = ''} = opts;
    const has = series.some(s => s.data.some(fin));
    if (!has) { container.innerHTML = `<div class="chart ${opts.size || ''}"><div class="chart-empty">${esc(opts.empty || 'No data yet for this chart.')}</div></div>`; return; }
    const W = Math.max(280, Math.round(container.clientWidth || 640)), H = opts.size === 'short' ? 180 : opts.size === 'tall' ? 300 : 240, L = 44, R = series.some(s => s.axis === 'y2') ? 44 : 14, T = 12, Bm = 28;
    const pw = W - L - R, ph = H - T - Bm;
    const rangeFor = axis => {
      const vals = series.filter(s => (s.axis || 'y') === axis).flatMap(s => s.data.filter(fin));
      const cfg = opts[axis] || {}; const lo = fin(cfg.min) ? cfg.min : Math.min(...vals, ...(cfg.include || [])), hi = fin(cfg.max) ? cfg.max : Math.max(...vals, ...(cfg.include || []));
      const [a, b, step] = niceRange(lo, hi); return {lo: fin(cfg.min) ? cfg.min : a, hi: fin(cfg.max) ? cfg.max : b, step: step || (b - a) / 4};
    };
    const ry = rangeFor('y'), ry2 = series.some(s => s.axis === 'y2') ? rangeFor('y2') : null;
    const n = labels.length, bars = series.filter(s => s.type === 'bar');
    const X = i => L + (n <= 1 ? pw / 2 : bars.length ? (i + 0.5) / n * pw : i / (n - 1) * pw);
    const Yof = (v, r) => T + ph * (1 - (v - r.lo) / ((r.hi - r.lo) || 1));
    let g = '';
    for (const b of opts.bands || []) { const y1 = Yof(Math.min(b.to, ry.hi), ry), y0 = Yof(Math.max(b.from, ry.lo), ry); g += `<rect x="${L}" y="${y1}" width="${pw}" height="${Math.max(0, y0 - y1)}" fill="${b.color}" opacity=".12"/>`; if (b.label) g += `<text x="${L + pw - 4}" y="${y1 + 12}" text-anchor="end" font-size="10" fill="#566476">${esc(b.label)}</text>`; }
    const ticks = []; for (let v = ry.lo; v <= ry.hi + 1e-9; v += ry.step) ticks.push(v);
    for (const v of ticks) { const y = Yof(v, ry); g += `<line x1="${L}" x2="${L + pw}" y1="${y}" y2="${y}" stroke="#E0E9E5"/><text x="${L - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="#566476" font-family="JetBrains Mono, monospace">${U.fmt(v, decOf(ry.step))}</text>`; }
    if (ry2) { for (let v = ry2.lo; v <= ry2.hi + 1e-9; v += ry2.step) g += `<text x="${L + pw + 6}" y="${Yof(v, ry2) + 3}" font-size="10" fill="#566476" font-family="JetBrains Mono, monospace">${U.fmt(v, decOf(ry2.step))}</text>`; }
    const every = Math.max(1, Math.ceil(n / (opts.maxTicks || 8)));
    labels.forEach((l, i) => { if (i % every === 0 || i === n - 1) g += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#566476">${esc(l)}</text>`; });
    if (opts.y?.label) g += `<text x="4" y="${T + 2}" font-size="10" fill="#566476" dominant-baseline="hanging">${esc(opts.y.label)}</text>`;
    // bars
    const bw = n ? Math.max(2, pw / n / (bars.length + 1)) : 0;
    bars.forEach((s, j) => { const r = s.axis === 'y2' ? ry2 : ry; s.data.forEach((v, i) => { if (!fin(v)) return; const y = Yof(v, r), y0 = Yof(Math.max(r.lo, 0), r); g += `<rect x="${X(i) - bw * bars.length / 2 + j * bw}" y="${Math.min(y, y0)}" width="${bw - 1}" height="${Math.abs(y0 - y)}" rx="2" fill="${s.color}" opacity=".85"/>`; }); });
    // lines with gaps
    for (const s of series.filter(s => s.type !== 'bar')) {
      const r = s.axis === 'y2' ? ry2 : ry; let d = '', pen = false;
      s.data.forEach((v, i) => { if (!fin(v)) { pen = false; return; } d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Yof(v, r).toFixed(1)}`; pen = true; });
      g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" ${s.dash ? 'stroke-dasharray="5 4"' : ''}/>`;
      if (n <= 31) s.data.forEach((v, i) => { if (fin(v)) g += `<circle cx="${X(i)}" cy="${Yof(v, r)}" r="2.6" fill="#fff" stroke="${s.color}" stroke-width="1.6"/>`; });
    }
    const id = 'ch' + Math.random().toString(36).slice(2, 8);
    container.innerHTML = `<figure style="margin:0"><div class="chart ${opts.size || ''}" tabindex="0" role="img" aria-label="${esc(title)}" aria-describedby="${id}-d">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" width="100%" height="100%">${g}<line class="cursor" x1="0" x2="0" y1="${T}" y2="${T + ph}" stroke="#102C28" stroke-dasharray="3 3" opacity="0"/></svg><div class="tip" hidden></div></div>
      ${legend(series)}<p id="${id}-d" class="sr-only">${esc(summary)}</p>${table(labels, series, title)}</figure>`;
    const box = container.querySelector('.chart'), svg = box.querySelector('svg'), tip = box.querySelector('.tip'), cur = svg.querySelector('.cursor');
    let idx = -1;
    const show = i => {
      if (i < 0 || i >= n) return; idx = i;
      const xs = X(i) / W * box.clientWidth;
      cur.setAttribute('x1', X(i)); cur.setAttribute('x2', X(i)); cur.setAttribute('opacity', '.5');
      tip.hidden = false; tip.style.left = Math.min(Math.max(xs, 70), box.clientWidth - 70) + 'px'; tip.style.top = '12px';
      tip.innerHTML = `<div>${esc(labels[i])}</div>` + series.map(s => `<div>${esc(s.name)}: <b>${fin(s.data[i]) ? U.fmt(s.data[i], s.dec ?? 1) : 'no reading'}</b> ${esc(s.unit || '')}</div>`).join('');
    };
    const hide = () => { tip.hidden = true; cur.setAttribute('opacity', '0'); };
    box.addEventListener('pointermove', e => { const r = box.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W; let best = 0, bd = 1e9; for (let i = 0; i < n; i++) { const d = Math.abs(X(i) - x); if (d < bd) { bd = d; best = i; } } show(best); });
    box.addEventListener('pointerleave', hide); box.addEventListener('blur', hide);
    box.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { show(Math.min(n - 1, idx + 1)); e.preventDefault(); } else if (e.key === 'ArrowLeft') { show(Math.max(0, idx - 1)); e.preventDefault(); } else if (e.key === 'Escape') hide(); });
    box.addEventListener('focus', () => show(idx < 0 ? n - 1 : idx));
  }

  /* horizontal contribution bars (EBM-style explanation) */
  function contributions(rows, max) {
    const m = max || Math.max(1, ...rows.map(r => Math.abs(r.points)));
    return `<div class="contrib" role="list">${rows.map(r => `<div class="c-row" role="listitem"><span title="${esc(r.detail)}">${esc(r.label)}</span><div class="c-bar" aria-hidden="true"><i class="${r.points < 0 ? 'neg' : ''}" style="width:${Math.min(100, Math.abs(r.points) / m * 100)}%"></i></div><b>${r.points > 0 ? '+' : ''}${U.fmt(r.points, 1)}</b></div>`).join('')}</div>`;
  }

  /* live canvas waveform */
  function wave(cv, data, color, opts = {}) {
    const r = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
    if (cv.width !== Math.round(w * r)) { cv.width = Math.round(w * r); cv.height = Math.round(h * r); }
    const c = cv.getContext('2d'); c.setTransform(r, 0, 0, r, 0, 0); c.clearRect(0, 0, w, h);
    c.strokeStyle = 'rgba(52,120,168,.15)'; c.lineWidth = 1;
    for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(0, h * i / 4); c.lineTo(w, h * i / 4); c.stroke(); }
    const d = (data || []).filter(fin);
    if (d.length < 2) { c.fillStyle = '#566476'; c.font = '12px Inter, system-ui, sans-serif'; c.fillText(opts.empty || 'Acquiring signal…', 12, h / 2 + 4); return; }
    let lo = Math.min(...d), hi = Math.max(...d); if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
    c.strokeStyle = color; c.lineWidth = 2; c.lineJoin = 'round'; c.beginPath();
    d.forEach((v, i) => { const x = i / (d.length - 1) * (w - 4) + 2, y = h - 6 - (v - lo) / (hi - lo) * (h - 12); i ? c.lineTo(x, y) : c.moveTo(x, y); });
    c.stroke();
    c.strokeStyle = '#102C28'; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(w - 3, 4); c.lineTo(w - 3, h - 4); c.stroke(); c.setLineDash([]);
  }
  function spark(cv, data, color) {
    const r = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
    if (cv.width !== Math.round(w * r)) { cv.width = Math.round(w * r); cv.height = Math.round(h * r); }
    const c = cv.getContext('2d'); c.setTransform(r, 0, 0, r, 0, 0); c.clearRect(0, 0, w, h);
    const d = data.filter(fin); if (d.length < 2) { c.strokeStyle = '#E0E9E5'; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke(); c.setLineDash([]); return; }
    let lo = Math.min(...d), hi = Math.max(...d); if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
    c.strokeStyle = color; c.lineWidth = 1.75; c.beginPath(); let first = true;
    data.forEach((v, i) => { if (!fin(v)) { first = true; return; } const x = i / (data.length - 1) * (w - 2) + 1, y = h - 2 - (v - lo) / (hi - lo) * (h - 4); first ? c.moveTo(x, y) : c.lineTo(x, y); first = false; });
    c.stroke();
  }
  return {render, contributions, wave, spark, PALETTE, table};
})();
