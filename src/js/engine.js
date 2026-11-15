/* =====================================================================
   ASTRAVITA.analysis — session features, per-minute aggregates, personal
   baseline (7-day rolling mean) and weekly aggregates.
   ASTRAVITA.kb — preloaded knowledge base (JSON in #astravita-kb).
   ASTRAVITA.engine — local, explainable comparison engine (no AI, no API):
   normalize -> weighted rules -> 0-100 score per condition -> confidence ->
   rank -> countermeasures + escalation -> per-indicator contributions.
   ===================================================================== */
ASTRAVITA.analysis = (() => {
  const U = ASTRAVITA.util, {fin, mean, std, rnd, clamp} = U;
  const MINUTE_KEYS = ['hr_bpm', 'rr_rpm', 'rmssd_ms', 'blink_rate_min', 'perclos_pct', 'facial_tension', 'head_stability_pct', 'microexpr_min', 'stress_index', 'fatigue_level', 'wellbeing_index', 'signal_quality',
    'emotion_neutral_pct', 'emotion_happy_pct', 'emotion_sad_pct', 'emotion_angry_pct', 'emotion_fear_pct', 'emotion_surprise_pct', 'emotion_disgust_pct'];
  const FEATURE_KEYS = ['hr_bpm', 'rmssd_ms', 'rr_rpm', 'blink_rate_min', 'perclos_pct', 'facial_tension', 'head_stability_pct', 'microexpr_min',
    'emotion_neutral_pct', 'emotion_happy_pct', 'emotion_sad_pct', 'emotion_angry_pct', 'emotion_fear_pct', 'emotion_surprise_pct', 'emotion_disgust_pct', 'stress_index', 'fatigue_level', 'wellbeing_index', 'signal_quality'];
  const col = (rows, k) => rows.map(r => r[k]).filter(fin);

  function minutes(rows, startIso) {
    const t0 = Date.parse(startIso || rows[0]?.timestamp || 0), out = [];
    for (const r of rows) {
      const m = Math.max(0, Math.floor((Date.parse(r.timestamp) - t0) / 60000));
      (out[m] ||= {minute: m, n: 0, acc: {}}).n++;
      for (const k of MINUTE_KEYS) if (fin(r[k])) { const a = out[m].acc[k] ||= [0, 0]; a[0] += r[k]; a[1]++; }
    }
    return out.filter(Boolean).map(x => ({minute: x.minute, ...Object.fromEntries(MINUTE_KEYS.map(k => [k, x.acc[k] ? rnd(x.acc[k][0] / x.acc[k][1], 1) : null]))}));
  }
  function features(rows, events = [], {start, end} = {}) {
    const dur = Math.max(1, (Date.parse(end || rows[rows.length - 1]?.timestamp || Date.now()) - Date.parse(start || rows[0]?.timestamp || Date.now())) / 1000);
    const f = {};
    for (const k of FEATURE_KEYS) { const v = col(rows, k); f[k] = v.length ? rnd(mean(v), 1) : null; }
    const yawns = rows.reduce((m, r) => fin(r.yawn_count) && r.yawn_count > m ? r.yawn_count : m, 0);   // no spread: safe for very long sessions
    f.yawn_per_10min = rnd(yawns / dur * 600, 2);
    const emoVar = ['happy', 'sad', 'angry', 'fear', 'surprise', 'disgust'].map(k => col(rows, `emotion_${k}_pct`)).filter(a => a.length > 5).map(a => std(a));
    f.affect_variability = emoVar.length ? rnd(clamp(mean(emoVar) * 6, 0, 100), 1) : null;
    f.local_hour = new Date(start || rows[0]?.timestamp || Date.now()).getHours();
    f.long_closures = events.filter(e => e.type === 'closure').length;
    f.microexpr_events = events.filter(e => e.type === 'micro').length;
    f.duration_s = Math.round(dur);
    f.quality_pct = rows.length ? rnd(100 * rows.filter(r => fin(r.hr_bpm)).length / rows.length, 0) : 0;
    return f;
  }
  // personal reference: rolling mean of recent good-quality sessions WITHOUT notable findings
  // (7 days; widened up to 28 days if needed, >= 3 sessions), else the calibration baseline.
  // Excluding flagged sessions keeps a slow drift from silently becoming the new "normal".
  function personalBaseline(sessions, calibration, beforeIso) {
    const end = beforeIso ? Date.parse(beforeIso) : Date.now();
    const ok = s => s.features && Date.parse(s.start) < end && (s.features.quality_pct ?? 0) >= 50 && (!s.result || s.result.status === 'nominal');
    for (const days of [7, 14, 28]) {
      const recent = (sessions || []).filter(s => ok(s) && Date.parse(s.start) >= end - days * 86400000);
      if (recent.length >= 3) {
        const b = {kind: 'rolling_' + days + 'd', n_sessions: recent.length};
        for (const k of [...FEATURE_KEYS, 'yawn_per_10min', 'affect_variability']) { const v = recent.map(s => s.features[k]).filter(fin); b[k] = v.length ? rnd(mean(v), 1) : null; }
        return b;
      }
    }
    if (calibration) return {kind: 'calibration', n_sessions: 0, ...calibration};
    return null;
  }
  // per-day aggregates for a week (Monday to Sunday, local time)
  function weekModel(sessions, offset = 0) {
    const ws = U.addDays(U.startOfWeek(new Date()), -7 * offset), days = [];
    for (let i = 0; i < 7; i++) {
      const d = U.addDays(ws, i), key = U.dayKey(d);
      const list = (sessions || []).filter(s => U.dayKey(s.start) === key && s.features);
      const m = k => { const v = list.map(s => s.features[k]).filter(fin); return v.length ? rnd(mean(v), 1) : null; };
      days.push({date: d.toISOString(), key, label: U.dateLong(d), sessions: list.length, minutes: rnd(list.reduce((a, s) => a + (s.duration_s || 0), 0) / 60, 1),
        wellbeing_index: m('wellbeing_index'), stress_index: m('stress_index'), fatigue_level: m('fatigue_level'), hr_bpm: m('hr_bpm'), rr_rpm: m('rr_rpm'), perclos_pct: m('perclos_pct'), rmssd_ms: m('rmssd_ms'), facial_tension: m('facial_tension')});
    }
    return {start: ws.toISOString(), end: U.addDays(ws, 7).toISOString(), days};
  }
  function weekKpis(W, P) {
    const avg = (M, k) => { const v = M.days.map(d => d[k]).filter(fin); return v.length ? mean(v) : null; };
    const sum = (M, k) => M.days.reduce((a, d) => a + (d[k] || 0), 0);
    const k = (key, label, unit, better) => ({key, label, unit, better, v: avg(W, key), p: avg(P, key)});
    return [k('wellbeing_index', 'Wellbeing index', '/100', 'up'), k('stress_index', 'Stress index', '/100', 'down'), k('fatigue_level', 'Fatigue level', '/5', 'down'), k('hr_bpm', 'Heart rate', 'bpm', 'flat'),
      {key: 'minutes', label: 'Time monitored', unit: 'min', better: 'up', v: sum(W, 'minutes'), p: sum(P, 'minutes')}, {key: 'sessions', label: 'Sessions', unit: '', better: 'up', v: sum(W, 'sessions'), p: sum(P, 'sessions')}];
  }
  return {minutes, features, personalBaseline, weekModel, weekKpis, MINUTE_KEYS, FEATURE_KEYS};
})();

ASTRAVITA.kb = (() => {
  let data = null;
  function load() {
    if (data) return data;
    const el = document.getElementById('astravita-kb');
    try { data = JSON.parse(el.textContent); } catch (e) { console.error('[ASTRAVITA] knowledge base failed to load', e); data = {conditions: [], countermeasures: [], reference_ranges: {}, questionnaire: {items: []}}; }
    data.cmIndex = Object.fromEntries((data.countermeasures || []).map(c => [c.id, c]));
    data.condIndex = Object.fromEntries((data.conditions || []).map(c => [c.id, c]));
    return data;
  }
  return {load, get: () => load(), condition: id => load().condIndex[id], countermeasure: id => load().cmIndex[id]};
})();

ASTRAVITA.engine = (() => {
  const U = ASTRAVITA.util, {fin, clamp, rnd} = U;
  const VERSION = 'astravita.engine.v1';
  const LABELS = {
    hr_bpm: ['Heart rate', 'bpm'], rmssd_ms: ['HRV (RMSSD)', 'ms'], rr_rpm: ['Breathing rate', '/min'], blink_rate_min: ['Blink rate', '/min'], perclos_pct: ['PERCLOS', '%'], yawn_per_10min: ['Yawns', 'per 10 min'],
    facial_tension: ['Facial tension', '/100'], head_stability_pct: ['Head stability', '%'], microexpr_min: ['Micro-expressions', '/min'], affect_variability: ['Expressivity', '/100'],
    emotion_neutral_pct: ['Neutral expression', '%'], emotion_happy_pct: ['Joy expression', '%'], emotion_sad_pct: ['Sadness expression', '%'], emotion_angry_pct: ['Anger expression', '%'], emotion_fear_pct: ['Fear expression', '%'], emotion_surprise_pct: ['Surprise expression', '%'], emotion_disgust_pct: ['Disgust expression', '%'],
    stress_index: ['Stress index', '/100'], fatigue_level: ['Fatigue level', '/5'], wellbeing_index: ['Wellbeing index', '/100'], local_hour: ['Session hour', 'h'], signal_quality: ['Signal quality', '/100']
  };
  const label = ind => {
    if (LABELS[ind]) return LABELS[ind][0];
    const q = (ASTRAVITA.kb.get().questionnaire?.items || []).find(i => i.id === ind);
    return q ? (q.short || q.text) : ind;
  };
  const unit = ind => LABELS[ind]?.[1] || '';
  const isQ = ind => ind.startsWith('q_');
  // minimum denominators for % change, so a near-zero baseline (e.g. stress 1/100) cannot produce absurd percentages
  const FLOOR = {stress_index: 10, wellbeing_index: 10, fatigue_level: 1, perclos_pct: 3, microexpr_min: 1, yawn_per_10min: 1, facial_tension: 10, affect_variability: 10, rmssd_ms: 10, blink_rate_min: 5};
  const OPS = {'>': (v, t) => v > t, '>=': (v, t) => v >= t, '<': (v, t) => v < t, '<=': (v, t) => v <= t};

  function activation(rule, v) {
    const t = Number(rule.threshold); if (!fin(v) || !fin(t)) return null;
    if (isQ(rule.indicator)) return OPS[rule.op]?.(v, t) ? 1 : 0;
    const margin = rule.ref === 'baseline_pct' ? 5 : Math.max(Math.abs(t) * 0.1, 0.5);
    const up = rule.op === '>' || rule.op === '>=';
    if (OPS[rule.op]?.(v, t)) return 1;
    const dist = up ? t - v : v - t;   // how far from triggering
    return dist < margin ? clamp(1 - dist / margin, 0, 1) * 0.5 : 0;
  }
  function value(rule, f, q, base) {
    const ind = rule.indicator;
    if (isQ(ind)) { const v = q?.[ind]; return {v: fin(v) ? v : null, raw: v}; }
    const raw = f?.[ind];
    if (!fin(raw)) return {v: null, raw: null};
    if (rule.ref === 'baseline_pct') { const b = base?.[ind]; if (!fin(b)) return {v: null, raw, noBase: true}; return {v: (raw - b) / Math.max(Math.abs(b), FLOOR[ind] ?? (ind.startsWith('emotion_') ? 5 : 1e-6)) * 100, raw, base: b}; }
    return {v: raw, raw};
  }
  function describe(rule, val) {
    const u = unit(rule.indicator);
    if (isQ(rule.indicator)) return `answer ${val.raw ?? '—'} (trigger ${rule.op} ${rule.threshold})`;
    if (rule.ref === 'baseline_pct') return fin(val.v) ? `${U.fmt(val.raw, 1)} ${u} (${U.sgn(val.v, 0)} % vs baseline; trigger ${rule.op} ${rule.threshold} %)` : val.noBase ? 'no personal baseline yet' : 'not measured';
    return fin(val.v) ? `${U.fmt(val.raw, 1)} ${u} (trigger ${rule.op} ${rule.threshold} ${u})` : 'not measured';
  }

  /* evaluate one session. f = session features, q = questionnaire answers (or null),
     base = personal baseline (or null). Returns a result object stored in the history. */
  function evaluate({f, q, base, kb = ASTRAVITA.kb.get()}) {
    const insufficient = !f || (f.duration_s ?? 0) < 60 || (f.quality_pct ?? 0) < 50 || (f.signal_quality ?? 0) < 40;
    const qAnswered = !!q && Object.keys(q).some(k => k !== 'q_safety' && fin(q[k]));
    const safety = !!q && q.q_safety === 1;
    const findings = [];
    for (const c of kb.conditions || []) {
      const rules = c.indicator_rules || [];
      const posW = rules.reduce((s, r) => s + Math.max(0, Number(r.weight) || 0), 0) || 1;
      let pts = 0, evalW = 0, camPts = 0, camW = 0, qPts = 0, qW = 0;
      const contributions = [], missing = [], inactive = [];
      for (const r of rules) {
        const w = Number(r.weight) || 0, cam = !isQ(r.indicator);
        if (cam && insufficient) { missing.push({indicator: r.indicator, label: label(r.indicator), reason: 'insufficient signal quality'}); continue; }
        const val = value(r, f, q, base);
        const a = activation(r, val.v);
        if (a == null) { missing.push({indicator: r.indicator, label: label(r.indicator), reason: isQ(r.indicator) ? 'question not answered' : val.noBase ? 'no personal baseline yet' : 'not measured'}); continue; }
        const p = w * a; pts += p; if (w > 0) evalW += w;
        if (cam) { camPts += Math.max(0, p); camW += Math.max(0, w); } else { qPts += Math.max(0, p); qW += Math.max(0, w); }
        const row = {indicator: r.indicator, label: label(r.indicator), points: rnd(p, 1), weight: w, detail: describe(r, val), note: r.note || '', active: a > 0};
        if (Math.abs(p) > 0.05) contributions.push(row); else if (w > 0) inactive.push(row);
      }
      let score = rnd(clamp(pts / posW * 100 * (c.weight_factor ?? 1), 0, 100), 0), gated = false;
      // non-specific patterns (e.g. nutritional, endocrine) need at least one more specific sign
      if (c.gate?.any?.length && !contributions.some(r => r.active && c.gate.any.includes(r.indicator))) { if (score > c.gate.cap) { score = c.gate.cap; gated = true; } }
      const coverage = evalW / posW;
      let agreement = 0.6;
      if (camW > 0 && qW > 0) agreement = 1 - Math.abs(camPts / camW - qPts / qW);
      const qual = insufficient ? 0.2 : clamp((f.signal_quality ?? 0) / 100, 0, 1);
      const durF = clamp((f?.duration_s ?? 0) / 300, 0, 1);
      const conf = 0.35 * qual + 0.2 * durF + 0.25 * coverage + 0.2 * agreement;
      const band = score >= 70 ? 'strong' : score >= 50 ? 'notable' : score >= 40 ? 'watch' : null;
      contributions.sort((a, b) => b.points - a.points);
      inactive.sort((a, b) => b.weight - a.weight);
      findings.push({id: c.id, name: c.name, category: c.category, score, band, coverage: rnd(coverage * 100, 0), confidence: rnd(conf * 100, 0), confidence_label: conf >= 0.7 ? 'high' : conf >= 0.45 ? 'medium' : 'low',
        gated, based_on: camPts > 0 && qPts > 0 ? 'camera + questionnaire' : qPts > 0 ? 'questionnaire only' : 'camera only',
        contributions, missing, counterfactual: inactive.slice(0, 3).map(r => ({label: r.label, weight: r.weight, detail: r.detail}))});
    }
    findings.sort((a, b) => b.score - a.score || b.confidence - a.confidence);
    const shown = findings.filter(x => x.band);
    const status = safety || shown.some(x => x.band === 'strong') ? 'alert' : shown.length ? 'watch' : 'nominal';
    let summary;
    // the safety answer always leads the summary, so status "alert" never sits next to "no findings"
    if (!shown.length && safety) summary = 'Support was requested in the check-in.' + (insufficient ? ' Camera signal quality was too low for a camera-based orientation.' : ' No other notable pattern was found in this session.');
    else if (insufficient && !shown.length) summary = 'Insufficient signal quality for a camera-based orientation. Try again with steady lighting, facing the camera, for at least 2 minutes.';
    else if (!shown.length) summary = 'No significant findings. Your indicators stayed close to your usual pattern.';
    else summary = `Pattern consistent with ${shown[0].name.replace(/^Pattern consistent with\s*/i, '').replace(/^(a|an)\s+/i, '')}` + (shown.length > 1 ? `, plus ${U.plural(Math.min(shown.length, 5) - 1, 'other pattern')} worth watching.` : '.');
    return {engine_version: VERSION, computed_at: new Date().toISOString(), insufficient, questionnaire_used: qAnswered, safety, status, summary, baseline_kind: base?.kind || null,
      findings: shown.slice(0, 5), more_patterns: Math.max(0, shown.length - 5), all_scores: findings.map(x => ({id: x.id, score: x.score}))};
  }
  return {evaluate, label, unit, VERSION, LABELS};
})();
