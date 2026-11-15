// Node harness: loads core/engine/demo-profile code with DOM stubs and runs engine test cases
const fs = require('fs'), vm = require('vm');
const kbText = fs.readFileSync('src/kb.json', 'utf8');
const ctx = {console, Math, Date, JSON, Intl, Object, Array, Number, String, Set, Map, Promise, URLSearchParams, setTimeout,
  window: {}, document: {getElementById: id => id === 'astravita-kb' ? {textContent: kbText} : null, createElement: () => ({getContext: () => ({})})},
  crypto: {randomUUID: () => Math.random().toString(36).slice(2), getRandomValues: a => a}, btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary')};
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['core.js', 'engine.js']) vm.runInContext(fs.readFileSync('src/js/' + f, 'utf8'), ctx, {filename: f});
const {ASTRAVITA} = ctx; const E = ASTRAVITA.engine;
const base = {kind: 'rolling_7d', hr_bpm: 64, rmssd_ms: 48, rr_rpm: 14, blink_rate_min: 16, perclos_pct: 5, facial_tension: 18, head_stability_pct: 88, microexpr_min: 2, stress_index: 18, fatigue_level: 1.4, wellbeing_index: 82, affect_variability: 45, yawn_per_10min: 0.2,
  emotion_neutral_pct: 66, emotion_happy_pct: 16, emotion_sad_pct: 5, emotion_angry_pct: 4, emotion_fear_pct: 3, emotion_surprise_pct: 4, emotion_disgust_pct: 2, signal_quality: 90};
const healthyF = {...base, local_hour: 9, duration_s: 600, quality_pct: 95, signal_quality: 90};
const healthyQ = {q_mood_low: 0, q_anhedonia: 0, q_nervous: 0, q_worry: 0, q_sleep_quality: 0, q_sleep_hours: 7.5, q_sleepiness: 3, q_lonely: 0, q_workload: 1, q_irritability: 0, q_conflict: 0, q_headache: 0, q_congestion: 0, q_low_energy: 0, q_cold_intolerance: 0, q_appetite_change: 0, q_concentration: 0, q_med_change: 0, q_homesick: 0, q_boredom: 1, q_mission_phase: 1, q_safety: 0};
const cases = {
  healthy_noQ: {f: healthyF, q: null},
  healthy_Q: {f: healthyF, q: healthyQ},
  fatigue: {f: {...healthyF, perclos_pct: 19, blink_rate_min: 9, yawn_per_10min: 3.5, head_stability_pct: 64, fatigue_level: 3.6, wellbeing_index: 55, local_hour: 23}, q: {...healthyQ, q_sleepiness: 8, q_sleep_hours: 5, q_sleep_quality: 3, q_low_energy: 2, q_concentration: 2}},
  fatigue_camera_only: {f: {...healthyF, perclos_pct: 19, blink_rate_min: 9, yawn_per_10min: 3.5, head_stability_pct: 64, fatigue_level: 3.6, wellbeing_index: 55, local_hour: 23}, q: null},
  stress: {f: {...healthyF, hr_bpm: 86, rmssd_ms: 26, rr_rpm: 18.5, facial_tension: 48, microexpr_min: 6.5, stress_index: 58, emotion_angry_pct: 16, emotion_fear_pct: 12, emotion_neutral_pct: 48, emotion_happy_pct: 6}, q: {...healthyQ, q_nervous: 2, q_worry: 2, q_workload: 3, q_irritability: 2, q_sleep_quality: 2}},
  isolation: {f: {...healthyF, affect_variability: 16, emotion_neutral_pct: 84, emotion_happy_pct: 3, emotion_sad_pct: 9, microexpr_min: 0.8, rmssd_ms: 36}, q: {...healthyQ, q_lonely: 3, q_homesick: 3, q_anhedonia: 2, q_mood_low: 2, q_boredom: 3, q_mission_phase: 3}},
  lowsignal: {f: {...healthyF, quality_pct: 30, signal_quality: 30, hr_bpm: 95, perclos_pct: 25}, q: null},
  safety: {f: healthyF, q: {...healthyQ, q_safety: 1}}
};
for (const [name, c] of Object.entries(cases)) {
  const r = E.evaluate({f: c.f, q: c.q, base});
  const top = r.all_scores.slice(0, 4).map(x => x.id + ':' + x.score).join(' ');
  console.log(name.padEnd(20), r.status.padEnd(8), r.insufficient ? 'INSUFF' : '      ', r.findings.map(f => f.id + '(' + f.score + ',' + f.confidence_label + ')').join(' ') || '-', '| top:', top);
}
