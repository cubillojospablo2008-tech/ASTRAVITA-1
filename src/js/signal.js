/* =====================================================================
   ASTRAVITA.signal — rPPG and respiration DSP (ported from pyVHR, c3:
   pyVHR/BVP/methods.py -> cpu_POS, cpu_CHROM, cpu_GREEN). Runs in a Web
   Worker when available; the same factory runs on the main thread as fallback.
   Experimental: optical estimates, not a medical device.
   ===================================================================== */
function astravitaSignalFactory() {
  const fin = v => typeof v === 'number' && Number.isFinite(v);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const mean = a => { let s = 0, n = 0; for (const x of a) if (fin(x)) { s += x; n++; } return n ? s / n : NaN; };
  const std = a => { const m = mean(a); let s = 0, n = 0; for (const x of a) if (fin(x)) { s += (x - m) ** 2; n++; } return Math.sqrt(n ? s / n : 0) || 1e-9; };
  const median = a => { const s = a.filter(fin).sort((x, y) => x - y); if (!s.length) return NaN; const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
  function resample(ts, vs, fs, dur) {
    const out = []; if (ts.length < 2) return out;
    const end = ts[ts.length - 1], start = Math.max(ts[0], end - dur * 1000);
    let j = 0;
    for (let t = start; t <= end; t += 1000 / fs) {
      while (j < ts.length - 2 && ts[j + 1] < t) j++;
      const a = ts[j], b = ts[j + 1], f = b > a ? clamp((t - a) / (b - a), 0, 1) : 0;
      out.push(vs[j] + (vs[j + 1] - vs[j]) * f);
    }
    return out;
  }
  function detrend(x) {
    const n = x.length; if (!n) return x;
    const mx = (n - 1) / 2, my = mean(x); let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (i - mx) * (x[i] - my); den += (i - mx) ** 2; }
    const k = num / (den || 1); return x.map((v, i) => v - my - k * (i - mx));
  }
  // zero-phase band-pass (cascaded biquad, forward + backward)
  function bandpass(x, fs, lo, hi) {
    const f0 = Math.sqrt(lo * hi), Q = f0 / (hi - lo), w = 2 * Math.PI * f0 / fs, al = Math.sin(w) / (2 * Q), a0 = 1 + al;
    const b0 = al / a0, b2 = -al / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - al) / a0;
    const run = v => { let x1 = 0, x2 = 0, y1 = 0, y2 = 0; return v.map(s => { const y = b0 * s + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = s; y2 = y1; y1 = y; return y; }); };
    const y = run(run(x).reverse()).reverse();
    return run(run(y).reverse()).reverse();
  }
  function spectrum(x, fs, fmin, fmax, step) {
    const out = [];
    for (let f = fmin; f <= fmax + 1e-9; f += step) {
      let re = 0, im = 0; const w = 2 * Math.PI * f / fs;
      for (let i = 0; i < x.length; i++) { re += x[i] * Math.cos(w * i); im -= x[i] * Math.sin(w * i); }
      out.push([f, re * re + im * im]);
    }
    return out;
  }
  // POS — Wang et al. 2016: 1.6 s sliding window, overlap-add
  function pos(R, G, B, fs) {
    const N = R.length, l = Math.round(1.6 * fs), H = new Array(N).fill(0); if (N < l) return H;
    for (let n = l; n <= N; n++) {
      const m = n - l; let mr = 0, mg = 0, mb = 0;
      for (let i = m; i < n; i++) { mr += R[i]; mg += G[i]; mb += B[i]; }
      mr = mr / l || 1; mg = mg / l || 1; mb = mb / l || 1;
      const s1 = new Array(l), s2 = new Array(l);
      for (let i = 0; i < l; i++) { const cr = R[m + i] / mr, cg = G[m + i] / mg, cb = B[m + i] / mb; s1[i] = cg - cb; s2[i] = cg + cb - 2 * cr; }
      const a = std(s1) / std(s2); let hm = 0; const h = new Array(l);
      for (let i = 0; i < l; i++) { h[i] = s1[i] + a * s2[i]; hm += h[i]; }
      hm /= l; for (let i = 0; i < l; i++) H[m + i] += h[i] - hm;
    }
    return H;
  }
  // CHROM — de Haan & Jeanne 2013: 50 % overlapping Hann windows
  function chrom(R, G, B, fs) {
    const N = R.length, l = Math.round(1.6 * fs), H = new Array(N).fill(0); if (N < l) return H;
    const hop = Math.max(1, l >> 1);
    for (let m = 0; m + l <= N; m += hop) {
      let mr = 0, mg = 0, mb = 0;
      for (let i = m; i < m + l; i++) { mr += R[i]; mg += G[i]; mb += B[i]; }
      mr = mr / l || 1; mg = mg / l || 1; mb = mb / l || 1;
      const X = new Array(l), Y = new Array(l);
      for (let i = 0; i < l; i++) { const rn = R[m + i] / mr, gn = G[m + i] / mg, bn = B[m + i] / mb; X[i] = 3 * rn - 2 * gn; Y[i] = 1.5 * rn + gn - 1.5 * bn; }
      const a = std(X) / std(Y); const s = X.map((x, i) => x - a * Y[i]); const sm = mean(s);
      for (let i = 0; i < l; i++) H[m + i] += (s[i] - sm) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (l - 1)));
    }
    return H;
  }
  // GREEN — Verkruysse et al. 2008
  const green = (R, G) => { const m = mean(G) || 1; return G.map(g => -(g / m - 1)); };
  const methods = {POS: pos, CHROM: chrom, GREEN: (R, G) => green(R, G)};
  // heart rate by spectral peak (0.7-3.5 Hz) + SNR (de Haan 2013 definition)
  function hrFromSignal(sig, fs) {
    const h = bandpass(detrend(sig), fs, 0.5, 5);
    const sp = spectrum(h, fs, 0.7, 3.5, 1 / 60);
    let k = 0; for (let i = 1; i < sp.length; i++) if (sp[i][1] > sp[k][1]) k = i;
    let f = sp[k][0];
    if (k > 0 && k < sp.length - 1) { const a = sp[k - 1][1], b = sp[k][1], c = sp[k + 1][1], d = a - 2 * b + c; if (d) f += clamp(0.5 * (a - c) / d, -0.5, 0.5) / 60; }
    let pin = 0, pout = 0;
    for (const [x, p] of sp) { if (Math.abs(x - f) < 0.1 || Math.abs(x - 2 * f) < 0.1) pin += p; else pout += p; }
    return {h, bpm: f * 60, snr: 10 * Math.log10((pin || 1e-12) / (pout || 1e-12))};
  }
  // RMSSD from peak-to-peak intervals of a narrow-band BVP (experimental)
  function rmssdFrom(h, fs, hr) {
    const md = Math.round(0.6 * 60 / hr * fs), pk = [];
    for (let i = 1; i < h.length - 1; i++) {
      if (h[i] > 0 && h[i] >= h[i - 1] && h[i] > h[i + 1]) {
        if (pk.length && i - pk[pk.length - 1] < md) { if (h[i] > h[pk[pk.length - 1]]) pk[pk.length - 1] = i; }
        else pk.push(i);
      }
    }
    const p2 = pk.map(i => { const a = h[i - 1], b = h[i], c = h[i + 1], d = a - 2 * b + c; return i + (d ? clamp(0.5 * (a - c) / d, -0.5, 0.5) : 0); });
    let ibi = []; for (let i = 1; i < p2.length; i++) ibi.push((p2[i] - p2[i - 1]) * 1000 / fs);
    const mi = median(ibi); ibi = ibi.filter(x => x > 0.75 * mi && x < 1.25 * mi);
    if (ibi.length < 8) return null;
    let s = 0; for (let i = 1; i < ibi.length; i++) s += (ibi[i] - ibi[i - 1]) ** 2;
    return Math.sqrt(s / (ibi.length - 1));
  }
  /* One analysis step: returns heart rate, SNR, pulse trace, RMSSD and respiration rate.
     msg = {t[], r[], g[], b[], ht[], hy[], alg: 'auto'|'POS'|'CHROM'|'GREEN', hrHist[]} */
  function analyze(msg) {
    const fs = 30, out = {hr: null, snr: null, alg: null, pulse: [], rmssd: null, rr: null, resp: []};
    const {t, r, g, b, ht, hy} = msg;
    const span = t.length ? (t[t.length - 1] - t[0]) / 1000 : 0;
    if (span > 8) {
      const R = resample(t, r, fs, 10), G = resample(t, g, fs, 10), Bl = resample(t, b, fs, 10);
      const names = methods[msg.alg] ? [msg.alg] : ['POS', 'CHROM'];   // 'auto' or unknown -> best of POS/CHROM
      let best = null;
      for (const n of names) { const e = hrFromSignal(methods[n](R, G, Bl, fs), fs); if (!best || e.snr > best.snr) best = {...e, name: n}; }
      out.alg = best.name; out.snr = best.snr; out.hr = best.bpm; out.pulse = best.h.slice(-240);
      if (span > 16 && best.snr > 0) {
        const R2 = resample(t, r, fs, 20), G2 = resample(t, g, fs, 20), B2 = resample(t, b, fs, 20);
        const f0 = best.bpm / 60, h20 = bandpass(detrend(methods[best.name](R2, G2, B2, fs)), fs, Math.max(0.6, f0 - 0.45), f0 + 0.45);
        const v = rmssdFrom(h20.slice(45, -45), fs, best.bpm); if (fin(v) && v < 250) out.rmssd = v;
      }
    }
    // respiration: vertical head motion + slow modulation of the green channel (0.1-0.6 Hz)
    const hspan = ht && ht.length ? (ht[ht.length - 1] - ht[0]) / 1000 : 0;
    let comb = null;
    if (hspan > 15) {
      const yf = bandpass(detrend(resample(ht, hy, 10, 30)), 10, 0.1, 0.6); out.resp = yf.slice(-200);
      const s1 = spectrum(yf, 10, 0.1, 0.6, 1 / 240), n1 = Math.max(...s1.map(x => x[1])) || 1;
      comb = s1.map(x => [x[0], x[1] / n1]);
    }
    if (span > 15) {
      const gf = bandpass(detrend(resample(t, g, 10, 30)), 10, 0.1, 0.6);
      if (!comb) out.resp = gf.slice(-200);
      const s2 = spectrum(gf, 10, 0.1, 0.6, 1 / 240), n2 = Math.max(...s2.map(x => x[1])) || 1;
      comb = comb ? comb.map((x, i) => [x[0], x[1] + 0.5 * s2[i][1] / n2]) : s2.map(x => [x[0], x[1] / n2]);
    }
    if (comb) out.rr = comb.reduce((a, c) => c[1] > a[1] ? c : a)[0] * 60;
    return out;
  }
  return {analyze, resample, detrend, bandpass, spectrum, pos, chrom, green, hrFromSignal, rmssdFrom, mean, std, median};
}

ASTRAVITA.signal = (() => {
  const local = astravitaSignalFactory();
  let worker = null, busy = false, pending = null, cb = null;
  function ensureWorker() {
    if (worker !== null) return worker;
    try {
      const src = `${astravitaSignalFactory.toString()}\nconst S = astravitaSignalFactory();\nself.onmessage = e => { try { self.postMessage({ok: true, out: S.analyze(e.data)}); } catch (err) { self.postMessage({ok: false, error: String(err)}); } };`;
      const url = URL.createObjectURL(new Blob([src], {type: 'text/javascript'}));
      worker = new Worker(url); URL.revokeObjectURL(url);
      worker.onmessage = e => { busy = false; if (e.data.ok && cb) cb(e.data.out); else if (!e.data.ok) console.warn('[ASTRAVITA] signal analysis failed', e.data.error); if (pending) { const p = pending; pending = null; post(p); } };
      worker.onerror = e => { console.warn('[ASTRAVITA] signal worker failed, using main thread', e.message); worker.terminate(); worker = false; busy = false; pending = null; };
    } catch (e) { console.warn('[ASTRAVITA] Web Worker unavailable, using main thread', e); worker = false; }
    return worker;
  }
  function post(msg) { busy = true; worker.postMessage(msg); }
  // request an analysis; results arrive asynchronously through onResult
  function request(msg) {
    const w = ensureWorker();
    if (w) { if (busy) pending = msg; else post(msg); return; }
    const out = local.analyze(msg); if (cb) cb(out);
  }
  function onResult(f) { cb = f; }
  function terminate() { if (worker) worker.terminate(); worker = null; busy = false; pending = null; }
  return {request, onResult, terminate, local};
})();
