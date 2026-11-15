/* =====================================================================
   ASTRAVITA.demo — deterministic demonstration data (fixed seed).
   1 flight surgeon + 6 fictional crew members with 8 weeks of history.
   Everything created here is labelled SIMULATED DATA and is only visible
   inside the demonstration accounts.
   ===================================================================== */
ASTRAVITA.demo = (() => {
  const U = ASTRAVITA.util, S = ASTRAVITA.store, A = ASTRAVITA.auth, AN = ASTRAVITA.analysis, E = ASTRAVITA.engine, LK = ASTRAVITA.links, {clamp, rnd} = U;
  const VERSION = 4;
  const DOCTOR = {email: 'maya.thornton@demo.astravita', password: 'Demo-Surgeon-2026!', name: 'Dr. Maya Thornton', title: 'Flight surgeon', role: 'doctor'};
  const MISSION = 'ARES-7 isolation analog (simulated)';
  const CREW = [
    {email: 'elena.vance@demo.astravita', name: 'Elena Vance', title: 'Commander', profile: 'stable', blurb: 'Stable pattern'},
    {email: 'marcus.chen@demo.astravita', name: 'Marcus Chen', title: 'Pilot', profile: 'stress', blurb: 'Rising stress'},
    {email: 'tarek.almansoor@demo.astravita', name: 'Tarek Al-Mansoor', title: 'Mission specialist', profile: 'fatigue', blurb: 'Chronic fatigue'},
    {email: 'sarah.jenkins@demo.astravita', name: 'Sarah Jenkins', title: 'Systems engineer', profile: 'recovery', blurb: 'Recovering'},
    {email: 'kenji.watanabe@demo.astravita', name: 'Kenji Watanabe', title: 'Flight engineer', profile: 'isolation', blurb: 'Progressive isolation'},
    {email: 'amara.okafor@demo.astravita', name: 'Amara Okafor', title: 'Science officer', profile: 'lowsignal', blurb: 'Low signal quality'}
  ];
  const CREW_PASSWORD = 'Demo-Crew-2026!';
  const accounts = () => [{...DOCTOR}, ...CREW.map(c => ({...c, password: CREW_PASSWORD, role: 'patient'}))];

  /* ---------- profile generators: p = progress through the 8 weeks (0..1) ---------- */
  const lerp = (a, b, x) => a + (b - a) * clamp(x, 0, 1);
  function emotions(e) { const t = Object.values(e).reduce((a, b) => a + b, 0) || 1; return Object.fromEntries(Object.entries(e).map(([k, v]) => ['emotion_' + k + '_pct', rnd(v * 100 / t, 1)])); }
  function profile(kind, p, R) {
    const n = (s) => (R() - 0.5) * 2 * s;
    let f = {hr_bpm: 64 + n(2.5), rmssd_ms: 48 + n(5), rr_rpm: 14 + n(1), blink_rate_min: 16 + n(2), perclos_pct: 5 + n(1.2), yawn_per_10min: R() < 0.2 ? 1 : 0, facial_tension: 18 + n(4), head_stability_pct: 88 + n(4), microexpr_min: 2 + n(1), affect_variability: 46 + n(6), quality: 90 + n(5), hour: 8 + Math.floor(R() * 3)};
    let emo = {neutral: 66, happy: 16, sad: 5, angry: 4, fear: 3, surprise: 4, disgust: 2};
    let q = {q_mood_low: 0, q_anhedonia: 0, q_nervous: 0, q_worry: 0, q_sleep_quality: R() < 0.7 ? 0 : 1, q_sleep_hours: rnd(7.2 + n(0.6), 1), q_sleepiness: 3 + Math.round(R() * 2), q_lonely: 0, q_workload: 1, q_irritability: 0, q_conflict: 0, q_headache: 0, q_congestion: R() < 0.3 ? 1 : 0, q_low_energy: 0, q_cold_intolerance: 0, q_appetite_change: 0, q_concentration: 0, q_med_change: 0, q_homesick: 0, q_boredom: 1, q_mission_phase: 1 + Math.min(3, Math.floor(p * 4)), q_safety: 0};
    if (kind === 'stress') {
      const x = clamp((p - 0.35) / 0.65, 0, 1);
      Object.assign(f, {hr_bpm: lerp(66, 86, x) + n(2.5), rmssd_ms: lerp(46, 26, x) + n(4), rr_rpm: lerp(14, 18.5, x) + n(1), facial_tension: lerp(18, 48, x) + n(4), microexpr_min: lerp(2, 6.5, x) + n(1), blink_rate_min: lerp(16, 24, x) + n(2), hour: 13 + Math.floor(R() * 6)});
      emo = {neutral: lerp(66, 48, x), happy: lerp(16, 6, x), sad: 5, angry: lerp(4, 16, x), fear: lerp(3, 12, x), surprise: 4, disgust: lerp(2, 5, x)};
      Object.assign(q, {q_nervous: Math.round(lerp(0, 2.4, x)), q_worry: Math.round(lerp(0, 2.2, x)), q_sleep_quality: Math.round(lerp(0, 2, x)), q_workload: Math.round(lerp(1, 3, x)), q_irritability: Math.round(lerp(0, 2, x)), q_conflict: Math.round(lerp(0, 1.6, x)), q_concentration: Math.round(lerp(0, 1.6, x)), q_headache: x > 0.6 ? 1 : 0});
    } else if (kind === 'fatigue') {
      const x = clamp(p / 0.8, 0, 1);
      Object.assign(f, {hr_bpm: 62 + n(2), perclos_pct: lerp(7, 19, x) + n(1.5), blink_rate_min: lerp(15, 10, x) + n(2), yawn_per_10min: Math.round(lerp(0.5, 3.4, x) + n(0.6)), head_stability_pct: lerp(86, 66, x) + n(4), facial_tension: 15 + n(3), affect_variability: lerp(44, 30, x) + n(5), hour: 21 + Math.floor(R() * 3)});
      emo = {neutral: lerp(66, 76, x), happy: lerp(16, 8, x), sad: lerp(5, 9, x), angry: 3, fear: 2, surprise: 2, disgust: 1};
      Object.assign(q, {q_sleep_quality: Math.round(lerp(1, 3, x)), q_sleep_hours: rnd(lerp(6.8, 5.1, x) + n(0.4), 1), q_sleepiness: Math.round(lerp(5, 8, x)), q_low_energy: Math.round(lerp(0, 2.4, x)), q_concentration: Math.round(lerp(0, 2.2, x)), q_workload: 2});
    } else if (kind === 'recovery') {
      const x = clamp((p - 0.4) / 0.5, 0, 1);   // stressed and low early, improving later
      Object.assign(f, {hr_bpm: lerp(80, 65, x) + n(2.5), rmssd_ms: lerp(28, 47, x) + n(4), rr_rpm: lerp(17.5, 14, x) + n(1), facial_tension: lerp(42, 19, x) + n(4), microexpr_min: lerp(5.5, 2, x) + n(1), affect_variability: lerp(30, 46, x) + n(5), hour: 9 + Math.floor(R() * 8)});
      emo = {neutral: lerp(58, 64, x), happy: lerp(6, 19, x), sad: lerp(14, 5, x), angry: lerp(9, 4, x), fear: lerp(8, 3, x), surprise: 3, disgust: 2};
      Object.assign(q, {q_mood_low: Math.round(lerp(2, 0, x)), q_anhedonia: Math.round(lerp(2, 0, x)), q_nervous: Math.round(lerp(2, 0, x)), q_worry: Math.round(lerp(2, 0, x)), q_sleep_quality: Math.round(lerp(2, 0, x)), q_sleep_hours: rnd(lerp(5.8, 7.3, x) + n(0.4), 1), q_low_energy: Math.round(lerp(2, 0, x)), q_homesick: Math.round(lerp(2, 1, x))});
    } else if (kind === 'isolation') {
      const x = clamp((p - 0.2) / 0.8, 0, 1);
      Object.assign(f, {hr_bpm: 66 + n(2.5), rmssd_ms: lerp(45, 36, x) + n(4), affect_variability: lerp(44, 16, x) + n(4), microexpr_min: lerp(2, 0.8, x) + n(0.4), facial_tension: 20 + n(4), hour: lerp(9, 15, x) + Math.floor(R() * 4)});
      emo = {neutral: lerp(64, 84, x), happy: lerp(17, 3, x), sad: lerp(5, 9, x), angry: 3, fear: 2, surprise: lerp(5, 1, x), disgust: 1};
      Object.assign(q, {q_lonely: Math.round(lerp(0, 3, x)), q_homesick: Math.round(lerp(0, 2.6, x)), q_anhedonia: Math.round(lerp(0, 2.2, x)), q_mood_low: Math.round(lerp(0, 2, x)), q_boredom: Math.round(lerp(1, 3, x)), q_irritability: Math.round(lerp(0, 1.4, x)), q_conflict: Math.round(lerp(0, 1.3, x)), q_low_energy: Math.round(lerp(0, 1.6, x)), q_mission_phase: Math.min(4, 1 + Math.floor(p * 4))});
    } else if (kind === 'lowsignal') {
      Object.assign(f, {quality: 30 + n(10), hour: 18 + Math.floor(R() * 4)});
      Object.assign(q, {q_sleep_quality: 1, q_workload: 2});
    }
    f.quality = clamp(f.quality, 5, 99);
    const em = emotions(emo);
    const stress = clamp((f.hr_bpm - 64 - 5) / 25 * 30 + (35 - f.rmssd_ms) / 25 * 20 + (f.facial_tension - 25) / 45 * 25 + Math.max(0, (f.rr_rpm - 18) / 8 * 15) + f.microexpr_min / 6 * 6, 0, 100);
    const fat = clamp((f.perclos_pct - 6) / 14 * 40 + Math.max(0, (10 - f.blink_rate_min) / 8 * 15) + f.yawn_per_10min * 5 + (88 - f.head_stability_pct) / 4, 0, 100);
    const neg = (em.emotion_sad_pct + em.emotion_angry_pct + em.emotion_fear_pct + em.emotion_disgust_pct) - em.emotion_happy_pct;
    return {f, em, q, stress, fat, neg};
  }

  function buildSession(kind, start, durMin, R, subjectId, withQ) {
    const P = profile(kind, start.p, R), f = P.f;
    const n = s => (R() - 0.5) * 2 * s;
    const lowSig = kind === 'lowsignal';
    const minutes = [];
    for (let m = 0; m < durMin; m++) {
      const drift = (m / Math.max(1, durMin - 1) - 0.5);
      const hr = lowSig && R() < 0.65 ? null : rnd(f.hr_bpm + n(2) + drift * 2, 1);
      minutes.push({minute: m, hr_bpm: hr, rr_rpm: lowSig && R() < 0.5 ? null : rnd(f.rr_rpm + n(0.8), 1), rmssd_ms: hr == null ? null : rnd(f.rmssd_ms + n(4), 1), blink_rate_min: rnd(f.blink_rate_min + n(2), 1), perclos_pct: rnd(clamp(f.perclos_pct + n(1.5) + drift * 2, 0, 100), 1),
        facial_tension: rnd(clamp(f.facial_tension + n(4), 0, 100), 1), head_stability_pct: rnd(clamp(f.head_stability_pct + n(3), 0, 100), 1), microexpr_min: rnd(Math.max(0, f.microexpr_min + n(1)), 1),
        stress_index: rnd(clamp(P.stress + n(5), 0, 100), 1), fatigue_level: clamp(1 + Math.floor((P.fat + n(6)) / 20), 1, 5), wellbeing_index: rnd(clamp(100 - 0.5 * P.fat - 0.4 * P.stress - 0.4 * Math.max(0, P.neg) - Math.max(0, 40 - f.affect_variability) * 0.6 + n(4), 0, 100), 1), signal_quality: rnd(clamp(f.quality + n(6), 0, 100), 0),
        ...Object.fromEntries(Object.entries(P.em).map(([k, v]) => [k, rnd(clamp(v + n(2.5), 0, 100), 1)]))});
    }
    const col = k => minutes.map(x => x[k]).filter(U.fin);
    const feat = {};
    for (const k of AN.FEATURE_KEYS) { const c = col(k); feat[k] = c.length ? rnd(U.mean(c), 1) : null; }
    Object.assign(feat, {yawn_per_10min: rnd(Math.max(0, f.yawn_per_10min), 2), affect_variability: rnd(clamp(f.affect_variability, 0, 100), 1), local_hour: start.d.getHours(), long_closures: f.perclos_pct > 15 ? Math.round(R() * 3) : 0, microexpr_events: Math.round(f.microexpr_min * durMin), duration_s: durMin * 60 + Math.round(R() * 50), quality_pct: lowSig ? Math.round(30 + R() * 15) : Math.round(88 + R() * 10)});
    const end = new Date(start.d.getTime() + feat.duration_s * 1000);
    return {id: U.uid(), subject_id: subjectId, start: start.d.toISOString(), end: end.toISOString(), duration_s: feat.duration_s, source: 'demo', simulated: true, features: feat, minutes, questionnaire: withQ ? P.q : null, quality_pct: feat.quality_pct,
      micro_events: [], counts: {micro: feat.microexpr_events, yawns: Math.round(feat.yawn_per_10min * durMin / 10), long_closures: feat.long_closures}, app_version: ASTRAVITA.version};
  }

  function history(kind, subjectId, seed) {
    const R = U.prng(seed), out = [], now = new Date(), w0 = U.addDays(U.startOfWeek(now), -7 * 7);
    for (let w = 0; w < 8; w++) {
      const days = [0, 1, 2, 3, 4, 5, 6].filter(() => R() < 0.7);
      for (const d of days) {
        const P0 = profile(kind, 0, R);
        const day = U.addDays(w0, w * 7 + d); const hour = clamp(Math.round(P0.f.hour), 0, 23);
        day.setHours(hour, Math.floor(R() * 60), 0, 0);
        if (day > new Date(now.getTime() - 20 * 60000)) continue;
        const p = (day - w0) / (now - w0);
        out.push(buildSession(kind, {d: day, p}, 6 + Math.floor(R() * 8), R, subjectId, R() < 0.55 || out.length % 3 === 0 || p > 0.93));
      }
    }
    out.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    // calibration baseline from the first week, then engine results with a rolling personal baseline
    const first = out.slice(0, 3), m = k => rnd(U.mean(first.map(s => s.features[k]).filter(U.fin)), 1);
    const calibration = {calibrated_at: first[0]?.start, source: 'demo', hr_bpm: m('hr_bpm'), rmssd_ms: m('rmssd_ms'), rr_rpm: m('rr_rpm'), blink_rate_min: m('blink_rate_min'), perclos_pct: m('perclos_pct'), facial_tension: m('facial_tension'), head_stability_pct: m('head_stability_pct'), emo_base: null, au_base: null};
    for (const s of out) {
      const base = AN.personalBaseline(out.filter(x => Date.parse(x.start) < Date.parse(s.start)), calibration, s.start);
      s.result = E.evaluate({f: s.features, q: s.questionnaire, base});
      s.summary = s.result.summary;
      s.baseline_used = base ? {kind: base.kind, hr_bpm: base.hr_bpm, rmssd_ms: base.rmssd_ms, rr_rpm: base.rr_rpm, blink_rate_min: base.blink_rate_min, perclos_pct: base.perclos_pct, facial_tension: base.facial_tension, head_stability_pct: base.head_stability_pct, microexpr_min: base.microexpr_min, wellbeing_index: base.wellbeing_index, stress_index: base.stress_index} : null;
    }
    return {sessions: out, calibration};
  }

  const NOTES = {
    stress: [{text: 'Your heart rate and facial tension have been trending up over the last two weeks, mostly in afternoon sessions. Let us talk at the next private medical conference. Try the slow-breathing exercise before the evening EVA review.', days: 3}, {text: 'Thanks for completing the questionnaire. Workload is noted; I asked the mission planner to look at your schedule.', days: 1}],
    fatigue: [{text: 'Your sessions late in the evening show more eye closure and yawning. Please keep a consistent sleep window this week and avoid caffeine after 14:00 station time.', days: 4}],
    recovery: [{text: 'Good progress over the last three weeks. Keep the morning light routine and the weekly family call.', days: 2}],
    isolation: [{text: 'I would like to schedule an extra private family conference this week. Would Thursday work for you?', days: 2}],
    lowsignal: [{text: 'Most of your recent sessions had low signal quality. Try facing the cabin light and keeping your head still during the first two minutes.', days: 5}],
    stable: [{text: 'All indicators are steady. Nothing to change; keep your current routine.', days: 6}]
  };
  const PRIVATE = {stress: 'Watch for sleep impact; consider BHP consult if questionnaire GAD-2 stays >= 3 next week.', isolation: 'Third-quarter timing. Coordinate with BHP team; low expressivity trend over 5 weeks.', fatigue: 'Check schedule shifts with ops before suggesting nap protocol.'};
  const CMS = {stress: ['cm_paced_breathing_6', 'cm_workload_rebalance'], fatigue: ['cm_sleep_schedule_anchor', 'cm_caffeine_timing'], isolation: ['cm_family_conference', 'cm_crew_social_meal'], recovery: ['cm_bright_light_morning'], lowsignal: [], stable: []};

  async function writeVault(ctx) { await S.kv.set('vault:' + ctx.user.user_id, await S.encryptJSON(ctx.vaultKey, ctx.vault)); }

  async function seeded() { const m = await S.kv.get('demo-meta'); return !!m && m.version === VERSION; }
  async function clear() {
    const reg = await S.registry(), L = await S.links();
    const ids = Object.values(reg.users).filter(u => u.demo).map(u => u.user_id);
    for (const l of Object.values(L.links)) if (ids.includes(l.patient_id) || ids.includes(l.doctor_id) || l.demo) { await S.kv.del('share:' + l.link_id); await S.kv.del('care:' + l.link_id); delete L.links[l.link_id]; }
    await S.saveLinks(L);
    for (const id of ids) { await S.kv.del('vault:' + id); for (const k of await S.kv.keys('samples:' + id + ':')) await S.kv.del(k); delete reg.users[id]; }
    await S.saveRegistry(reg); await S.kv.del('demo-meta');
  }
  async function seed(progress = () => {}) {
    await clear();
    progress(0.05, 'Creating the flight surgeon account');
    const doc = await A.register({...DOCTOR, mission: MISSION, demo: true});
    const crewCtx = [];
    for (let i = 0; i < CREW.length; i++) {
      progress(0.1 + i * 0.12, `Creating ${CREW[i].name}`);
      const c = await A.register({email: CREW[i].email, password: CREW_PASSWORD, name: CREW[i].name, title: CREW[i].title, mission: MISSION, role: 'patient', demo: true});
      const hist = history(CREW[i].profile, c.entry.pseudo_id, 1000 + i * 7919);
      c.vault.sessions = hist.sessions; c.vault.baseline = hist.calibration; c.vault.consent = {at: hist.sessions[0]?.start, version: 1};
      c.vault.alerts = hist.sessions.flatMap(s => ASTRAVITA.data.alertsFor(s)).slice(-300);
      await writeVault(c); crewCtx.push({c, def: CREW[i]});
    }
    progress(0.85, 'Linking crew members and writing notes');
    const L = await S.links();
    for (const {c, def} of crewCtx) {
      const link = {link_id: U.uid(), doctor_id: doc.user_id, patient_id: c.user_id, doctor_name: DOCTOR.name, doctor_title: DOCTOR.title, doctor_pseudo: doc.entry.pseudo_id, status: 'accepted', created_at: U.addDays(new Date(), -56).toISOString(), updated_at: U.addDays(new Date(), -55).toISOString(), demo: true};
      L.links[link.link_id] = link; await S.saveLinks(L);
      await LK.publishShareAs(c, link);
      const notes = (NOTES[def.profile] || []).map(n => ({id: U.uid(), text: n.text, created_at: U.addDays(new Date(), -n.days).toISOString(), updated_at: null, author: DOCTOR.name}));
      const cms = (CMS[def.profile] || []).map((id, k) => ({id: U.uid(), cm_id: id, assigned_at: U.addDays(new Date(), -2 - k).toISOString(), note: '', author: DOCTOR.name}));
      const reviews = {}; c.vault.alerts.slice(0, -2).forEach(a => { reviews[a.id] = {status: 'reviewed', at: a.at, note: ''}; });
      await LK.writeCareAs(doc, link, {notes, countermeasures: cms, alert_reviews: reviews});
      if (PRIVATE[def.profile]) doc.vault.private_notes[c.user_id] = [{id: U.uid(), text: PRIVATE[def.profile], created_at: U.addDays(new Date(), -1).toISOString(), private: true}];
    }
    await writeVault(doc);
    await S.kv.set('demo-meta', {version: VERSION, seeded_at: new Date().toISOString()});
    progress(1, 'Demo data ready');
  }
  return {accounts, seed, seeded, clear, VERSION, MISSION, CREW, DOCTOR, CREW_PASSWORD, profile, history};
})();
