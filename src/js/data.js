/* =====================================================================
   ASTRAVITA.data — crew-member data operations (sessions, baseline,
   alerts, countermeasure status) and ASTRAVITA.export (CSV / JSON).
   ===================================================================== */
ASTRAVITA.data = (() => {
  const U = ASTRAVITA.util, A = ASTRAVITA.auth, AN = ASTRAVITA.analysis, E = ASTRAVITA.engine, LK = ASTRAVITA.links, {fin, rnd} = U;
  const v = () => { const c = A.current(); if (!c || c.user.role !== 'patient') throw new Error('Not available for this account.'); return c.vault; };
  const sessions = () => [...(v().sessions || [])].sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
  const latest = () => sessions()[0] || null;
  const byId = id => (v().sessions || []).find(s => s.id === id) || null;
  const baseline = (beforeIso) => AN.personalBaseline(v().sessions, v().baseline, beforeIso);

  function alertsFor(session) {
    const out = [], r = session.result; if (!r) return out;
    const mk = (severity, title, detail, kind) => ({id: U.uid(), at: session.end || session.start, session_id: session.id, severity, title, detail, kind, simulated: !!session.simulated});
    if (r.safety) out.push(mk('bad', 'Support requested in questionnaire', 'The crew member answered "yes" to the safety question. The support protocol was shown. Please check in personally and calmly.', 'safety'));
    for (const f of r.findings || []) if (f.band === 'strong' || f.band === 'notable') out.push(mk(f.band === 'strong' ? 'bad' : 'warn', f.name, `Score ${f.score}/100 · confidence ${f.confidence_label} · ${f.based_on}.`, f.id));
    return out;
  }

  /* build, evaluate and persist a finished monitoring session */
  async function saveSession({rec, source, questionnaire = null, simulated = false}) {
    const c = A.current(), vault = v();
    const rows = rec.samples;
    const f = AN.features(rows, rec.events, {start: rec.startedAt, end: rec.endedAt});
    const base = baseline(rec.startedAt);
    const result = E.evaluate({f, q: questionnaire, base});
    const s = {id: rec.meta.session_id, subject_id: c.user.pseudo_id, start: rec.startedAt, end: rec.endedAt, duration_s: f.duration_s, source, simulated,
      features: f, minutes: AN.minutes(rows, rec.startedAt), questionnaire, result, quality_pct: f.quality_pct,
      baseline_used: base ? {kind: base.kind, hr_bpm: base.hr_bpm, rmssd_ms: base.rmssd_ms, rr_rpm: base.rr_rpm, blink_rate_min: base.blink_rate_min, perclos_pct: base.perclos_pct, facial_tension: base.facial_tension, head_stability_pct: base.head_stability_pct, microexpr_min: base.microexpr_min, wellbeing_index: base.wellbeing_index, stress_index: base.stress_index} : null,
      micro_events: rec.events.filter(e => e.type === 'micro').slice(-300).map(e => ({t: e.timestamp, au: e.data?.au, type: e.data?.type, duration_ms: e.data?.duration_ms, intensity: e.data?.intensity})),
      counts: {micro: rec.events.filter(e => e.type === 'micro').length, yawns: rows.length ? Math.max(...rows.map(r => r.yawn_count || 0)) : 0, long_closures: rec.events.filter(e => e.type === 'closure').length},
      summary: result.summary, app_version: ASTRAVITA.version};
    vault.sessions = [...(vault.sessions || []), s];
    vault.alerts = [...(vault.alerts || []), ...alertsFor(s)].slice(-300);
    await A.saveSamples(s.id, rows);
    await A.saveVault();
    try { await LK.publishShare(); } catch (e) { console.warn('[ASTRAVITA] share update failed', e); }
    return s;
  }
  async function reevaluate(sessionId, questionnaire) {
    const vault = v(), s = byId(sessionId); if (!s) throw new Error('Session not found.');
    s.questionnaire = questionnaire;
    s.result = E.evaluate({f: s.features, q: questionnaire, base: baseline(s.start)});
    s.summary = s.result.summary;
    vault.alerts = [...(vault.alerts || []).filter(a => a.session_id !== s.id), ...alertsFor(s)].slice(-300);
    await A.saveVault(); try { await LK.publishShare(); } catch { /* not linked */ }
    return s;
  }
  async function deleteSession(id) {
    const vault = v(); vault.sessions = (vault.sessions || []).filter(s => s.id !== id);
    vault.alerts = (vault.alerts || []).filter(a => a.session_id !== id);
    await A.deleteSamples(id); await A.saveVault(); try { await LK.publishShare(); } catch { /* not linked */ }
  }
  async function setCalibration(b) { const vault = v(); vault.baseline = {...b, history: [...(vault.baseline?.history || []), {at: b.calibrated_at, hr_bpm: b.hr_bpm, rmssd_ms: b.rmssd_ms}].slice(-30)}; await A.saveVault(); try { await LK.publishShare(); } catch { /* not linked */ } }
  async function setConsent() { v().consent = {at: new Date().toISOString(), version: 1}; await A.saveVault(); }
  async function setCmStatus(cmId, status) { const vault = v(); vault.cm_status = {...(vault.cm_status || {}), [cmId]: {status, at: new Date().toISOString()}}; await A.saveVault(); try { await LK.publishShare(); } catch { /* not linked */ } }
  const totals = () => { const s = sessions(); return {count: s.length, seconds: s.reduce((a, x) => a + (x.duration_s || 0), 0)}; };
  return {sessions, latest, byId, baseline, saveSession, reevaluate, deleteSession, setCalibration, setConsent, setCmStatus, totals, alertsFor};
})();

ASTRAVITA.export = (() => {
  const U = ASTRAVITA.util;
  // strings that a spreadsheet would read as a formula (= + - @, tab, CR) get a leading apostrophe
  const cell = v => { if (v == null) return ''; let s = String(v); if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\r\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = (rows, cols) => [cols.join(','), ...rows.map(r => cols.map(k => cell(r[k])).join(','))].join('\n');
  const SESSION_COLS = ['session_id', 'subject_id', 'start', 'end', 'duration_s', 'source', 'simulated', 'quality_pct', 'status', 'top_finding', 'top_score', 'confidence', 'hr_bpm', 'rmssd_ms', 'rr_rpm', 'blink_rate_min', 'perclos_pct', 'yawn_per_10min', 'facial_tension', 'head_stability_pct', 'microexpr_min', 'affect_variability', 'stress_index', 'fatigue_level', 'wellbeing_index', 'signal_quality', 'summary'];
  function sessionRows(list, subjectId) {
    return list.map(s => ({session_id: s.id, subject_id: s.subject_id || subjectId, start: s.start, end: s.end, duration_s: s.duration_s, source: s.source, simulated: s.simulated ? 1 : 0, quality_pct: s.quality_pct,
      status: s.result?.status, top_finding: s.result?.findings?.[0]?.id || '', top_score: s.result?.findings?.[0]?.score ?? '', confidence: s.result?.findings?.[0]?.confidence_label || '', ...Object.fromEntries(SESSION_COLS.filter(k => k in (s.features || {})).map(k => [k, s.features[k]])), summary: s.summary}));
  }
  const MINUTE_COLS = ['session_id', 'subject_id', 'minute', ...ASTRAVITA.analysis.MINUTE_KEYS];
  const minuteRows = (list, subjectId) => list.flatMap(s => (s.minutes || []).map(m => ({session_id: s.id, subject_id: s.subject_id || subjectId, ...m})));
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return {csv, sessionRows, minuteRows, SESSION_COLS, MINUTE_COLS, stamp};
})();
