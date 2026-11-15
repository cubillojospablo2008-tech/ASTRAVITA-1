/* =====================================================================
   ASTRAVITA views — crew member (patient): dashboard, monitoring center,
   results & guidance, history, care team & notes, settings
   ===================================================================== */
(() => {
  const U = ASTRAVITA.util, {esc, fin, $, $$} = U, {icon} = ASTRAVITA.icons, UI = ASTRAVITA.ui, A = ASTRAVITA.auth, N = ASTRAVITA.notify;
  const DT = ASTRAVITA.data, R = ASTRAVITA.render, CH = ASTRAVITA.charts, LK = ASTRAVITA.links, LV = ASTRAVITA.live, X = ASTRAVITA.export, KB = ASTRAVITA.kb, P = CH.PALETTE;
  const me = () => A.current();
  const first = n => String(n || '').split(/\s+/)[0];

  async function careInfo() {
    const links = await LK.forPatient();
    const active = links.find(l => l.status === 'accepted') || null, pending = links.filter(l => l.status === 'pending');
    let care = {notes: [], countermeasures: [], alert_reviews: {}};
    if (active) { try { care = await LK.readCare(active); } catch (e) { console.warn(e); } }
    const seen = new Set(me().vault.received_notes_seen || []);
    UI.setBadge('care', care.notes.filter(n => !seen.has(n.id)).length + pending.length);
    return {links, active, pending, care, seen};
  }
  const linkRequests = pending => pending.map(l => `<div class="notice tele" data-link="${esc(l.link_id)}">${icon('link')}<div style="flex:1"><strong>${esc(l.doctor_name)}</strong> (${esc(l.doctor_title || 'Flight surgeon')}) asks to follow your monitoring. If you accept, they will see your sessions, results and alerts, and can write notes for you. You can revoke access at any time.
      <div class="row" style="margin-top:8px"><button class="btn primary sm" data-accept="${esc(l.link_id)}">${icon('check', 's16')}Accept</button><button class="btn sm" data-decline="${esc(l.link_id)}">Decline</button></div></div></div>`).join('');
  function bindRequests(root, rerender) {
    $$('[data-accept]', root).forEach(b => b.addEventListener('click', async () => { try { await LK.respond(b.dataset.accept, true); N.toast('Access granted. Your flight surgeon can now see your monitoring.', 'ok'); rerender(); } catch (e) { N.toast(e.message, 'warn', 7000); } }));
    $$('[data-decline]', root).forEach(b => b.addEventListener('click', async () => { try { await LK.respond(b.dataset.decline, false); N.toast('Request declined.', 'info'); rerender(); } catch (e) { N.toast(e.message, 'warn'); } }));
  }

  /* =============================== DASHBOARD =============================== */
  UI.views['patient/dashboard'] = async (root) => {
    document.title = 'Dashboard — ASTRAVITA';
    const c = me(), v = c.vault, list = DT.sessions(), last = list[0], tot = DT.totals();
    const ci = await careInfo();
    const recent = list.filter(s => Date.now() - Date.parse(s.start) < 7 * 86400000);
    const avg = k => { const x = recent.map(s => s.features?.[k]).filter(fin); return x.length ? U.mean(x) : null; };
    const readiness = avg('wellbeing_index'), stab = avg('head_stability_pct'), qual = avg('signal_quality');
    const restQ = last?.questionnaire?.q_sleep_hours;
    const lastQ = list.find(s => s.questionnaire);
    const phq = lastQ ? (lastQ.questionnaire.q_mood_low ?? 0) + (lastQ.questionnaire.q_anhedonia ?? 0) : null, gad = lastQ ? (lastQ.questionnaire.q_nervous ?? 0) + (lastQ.questionnaire.q_worry ?? 0) : null;
    const alerts = (v.alerts || []).slice(-4).reverse();
    const next = !v.baseline ? {t: 'Calibrate your baseline', d: 'A 30-second resting calibration makes every comparison personal.', href: '#/patient/monitor'} : !last || Date.now() - Date.parse(last.start) > 20 * 3600000 ? {t: 'Daily session due', d: 'A short 3 to 5 minute session keeps your trend up to date.', href: '#/patient/monitor'} : {t: 'You are up to date', d: 'Your next session is due tomorrow.', href: '#/patient/results'};
    const ring = fin(readiness) ? Math.round(readiness) : null;
    root.innerHTML = UI.shell(`
      <div class="page-head"><div><span class="eyebrow">${esc(v.profile.mission || 'Crew member')} · ${esc(c.user.pseudo_id)}</span><h1>Hello, ${esc(first(v.profile.display_name))}</h1>
        <p class="lead">${last ? `Last session ${esc(U.ago(last.start))} · ${esc(last.summary || '')}` : 'Welcome to ASTRAVITA. Start with a short monitoring session; it calibrates your personal baseline first.'}</p></div>
        <div class="actions"><a class="btn primary" href="#/patient/monitor">${icon('play')}Start monitoring</a>${last ? `<button class="btn" type="button" id="d-checkin">${icon('clipboard')}Wellbeing check-in</button>` : ''}</div></div>
      ${linkRequests(ci.pending)}
      ${last?.result?.safety ? `<div class="notice bad">${icon('heart')}<div><strong>Support is available.</strong> In your last check-in you told us things are very hard right now. <button class="link-btn" type="button" data-act="support">See support options</button></div></div>` : ''}
      <div class="grid g-12">
        <section class="card span-5" aria-labelledby="h-ready"><div class="card-head"><div><span class="eyebrow">Experimental index</span><h2 id="h-ready">Operational wellbeing</h2><p>7-day average of the camera-based wellbeing index (0-100). Your check-in answers are shown separately below.</p></div><span class="chip warn">Experimental</span></div>
          <div class="row" style="gap:24px;align-items:center"><div class="ring" style="--p:${ring ?? 0};--c:${ring == null ? 'var(--line)' : ring >= 70 ? 'var(--primary)' : ring >= 50 ? 'var(--warn)' : 'var(--bad)'}" role="img" aria-label="Wellbeing index ${ring ?? 'not available'} out of 100"><div><div class="rv">${ring ?? '—'}</div><div class="rs">/ 100</div></div></div>
            <div class="grid" style="grid-template-columns:repeat(3,1fr);flex:1;min-width:200px;gap:8px">
              <div class="kpi" style="padding:10px"><span class="kv" style="font-size:18px">${fin(stab) ? U.fmt(stab, 0) + '%' : '—'}</span><span class="small muted">Stability</span></div>
              <div class="kpi" style="padding:10px"><span class="kv" style="font-size:18px">${fin(restQ) ? U.fmt(restQ, 1) + ' h' : '—'}</span><span class="small muted">Sleep</span></div>
              <div class="kpi" style="padding:10px"><span class="kv" style="font-size:18px">${fin(qual) ? U.fmt(qual, 0) + '%' : '—'}</span><span class="small muted">Signal</span></div></div></div>
          <p class="small muted" style="margin-top:14px">${icon('info', 's16')} This index does not determine fitness for duty and does not replace your flight surgeon’s assessment.</p></section>
        <section class="card span-7" aria-labelledby="h-sum"><div class="card-head"><h2 id="h-sum">${icon('activity')}Health summary</h2>${last ? UI.statusChip(R.statusOf(last)) : ''}</div>
          <div class="grid g-3" style="margin-bottom:16px">
            <div class="kpi" style="background:var(--tele-bg)"><span class="eyebrow">Last capture</span><span class="kv" style="font-size:16px">${last ? esc(U.ago(last.start)) : 'None yet'}</span><span class="small muted">${last ? esc(U.duration(last.duration_s)) + ' · ' + esc(R.SRC_LABEL[last.source]) : ''}</span></div>
            <div class="kpi" style="background:var(--tele-bg)"><span class="eyebrow">Data quality</span><span class="kv" style="font-size:16px">${last ? U.fmt(last.quality_pct, 0) + ' %' : '—'}</span><span class="small muted">valid pulse time</span></div>
            <a class="kpi" href="${next.href}" style="background:var(--tele-bg);text-decoration:none;color:inherit"><span class="eyebrow">Next action</span><span class="kv" style="font-size:15px">${esc(next.t)}</span><span class="small muted">${esc(next.d)}</span></a></div>
          <div id="d-trend"></div></section>
      </div>
      <section aria-labelledby="h-evo"><div class="page-head" style="margin-bottom:12px"><div><h2 id="h-evo">Latest session vs your baseline</h2><p class="lead small">Optical estimates compared with your personal baseline (${last?.baseline_used?.kind?.startsWith('rolling') ? last.baseline_used.kind.replace(/rolling_(\d+)d/, '$1-day rolling average of sessions without findings') : last?.baseline_used ? 'calibration' : 'not available yet'}).</p></div>${last ? `<a class="btn sm" href="#/patient/results/${esc(last.id)}">Open results ${icon('arrow', 's16')}</a>` : ''}</div>
        ${last ? R.vsBaseline(last) : UI.empty('activity', 'No sessions yet', 'Your vital-sign tiles appear after your first session.', '<a class="btn primary sm" href="#/patient/monitor">Start monitoring</a>')}</section>
      <div class="grid g-12">
        <section class="card span-6" aria-labelledby="h-self"><div class="card-head"><h2 id="h-self">${icon('clipboard')}Self-reported wellbeing</h2><span class="chip">Subjective</span></div>
          ${lastQ ? `<div class="grid g-3"><div class="kpi"><span class="eyebrow">Mood (PHQ-2)</span><span class="kv">${phq}/6</span><span class="small muted">${phq >= 3 ? 'Worth discussing' : 'Within usual range'}</span></div><div class="kpi"><span class="eyebrow">Anxiety (GAD-2)</span><span class="kv">${gad}/6</span><span class="small muted">${gad >= 3 ? 'Worth discussing' : 'Within usual range'}</span></div><div class="kpi"><span class="eyebrow">Sleep</span><span class="kv">${fin(lastQ.questionnaire.q_sleep_hours) ? U.fmt(lastQ.questionnaire.q_sleep_hours, 1) + ' h' : '—'}</span><span class="small muted">last 24 h</span></div></div>
            <p class="small muted" style="margin-top:10px">Last check-in ${esc(U.ago(lastQ.start))}. PHQ-2 and GAD-2 totals of 3 or more are the usual cut-points for a follow-up conversation (Kroenke et al.).</p>` : UI.empty('clipboard', 'No check-in yet', 'The optional questionnaire at the end of a session improves the orientation.')}</section>
        <section class="card span-6" aria-labelledby="h-care"><div class="card-head"><h2 id="h-care">${icon('steth')}From your care team</h2><a class="btn sm" href="#/patient/care">Open</a></div>
          ${ci.active ? (ci.care.notes.length ? ci.care.notes.slice(-2).reverse().map(n => `<div class="note" style="margin-bottom:8px"><div class="n-meta">${icon('note', 's16')}<b>${esc(ci.active.doctor_name)}</b> · ${esc(U.ago(n.updated_at || n.created_at))} ${ci.seen.has(n.id) ? '' : '<span class="chip ok">New</span>'}</div><p class="n-text">${esc(n.text)}</p></div>`).join('') : `<p class="muted">Linked with <b>${esc(ci.active.doctor_name)}</b>. No notes yet.</p>`)
            + (ci.care.countermeasures.length ? `<p class="small" style="margin-top:8px"><b>Assigned countermeasures:</b> ${ci.care.countermeasures.map(x => esc(KB.countermeasure(x.cm_id)?.title || x.cm_id)).join(' · ')}</p>` : '')
            : UI.empty('link', 'No flight surgeon linked', 'Share your linking code with your flight surgeon so they can follow your monitoring.', '<a class="btn sm" href="#/patient/care">Show my code</a>')}</section>
      </div>
      <section class="card" aria-labelledby="h-week"><div class="card-head"><h2 id="h-week">${icon('trend')}Weekly summary</h2><p>Daily averages, compared with the previous week.</p></div><div id="d-week"></div></section>
      <section class="card" aria-labelledby="h-tasks"><div class="card-head"><h2 id="h-tasks">${icon('bell')}Tasks &amp; alerts</h2><span class="small muted">${U.plural(tot.count, 'session')} · ${esc(U.duration(tot.seconds))} monitored</span></div>
        <div class="grid g-2">
          <div class="notice ${v.baseline ? 'ok' : 'warn'}">${icon('target')}<div><strong>${v.baseline ? 'Baseline calibrated' : 'Baseline calibration needed'}</strong><p class="small">${v.baseline ? `Calibrated ${esc(U.ago(v.baseline.calibrated_at))}. Recalibrate weekly or after a schedule change.` : 'Calibrate once with a calm, neutral face for 30 seconds.'}</p><a class="link-btn small" href="#/patient/monitor?calibrate=1">${v.baseline ? 'Recalibrate' : 'Calibrate now'}</a></div></div>
          ${alerts.length ? alerts.map(a => `<div class="notice ${a.severity === 'bad' ? 'bad' : 'warn'}">${icon('alert')}<div><strong>${esc(a.title)}</strong><p class="small">${esc(U.dateTime(a.at))} · ${esc(a.detail)}</p><a class="link-btn small" href="#/patient/results/${esc(a.session_id)}">Open session</a></div></div>`).join('') : `<div class="notice ok">${icon('check')}<div><strong>No alerts</strong><p class="small">Nothing needs your attention right now.</p></div></div>`}
        </div></section>`);
    bindRequests(root, () => UI.render());
    $('[data-act="support"]', root)?.addEventListener('click', () => R.support({doctor: ci.active?.doctor_name}));
    $('#d-checkin', root)?.addEventListener('click', async () => {
      const ans = await R.questionnaire(last.questionnaire); if (!ans) return;
      await DT.reevaluate(last.id, ans); if (ans.q_safety === 1) R.support({doctor: ci.active?.doctor_name});
      N.toast('Check-in saved. Your latest orientation was updated.', 'ok'); UI.render();
    });
    const days = []; for (let i = 13; i >= 0; i--) { const d = U.addDays(U.startOfDay(new Date()), -i), k = U.dayKey(d), ss = list.filter(s => U.dayKey(s.start) === k), m = key => { const x = ss.map(s => s.features?.[key]).filter(fin); return x.length ? U.mean(x) : null; }; days.push({l: U.dateShort(d), wb: m('wellbeing_index'), st: m('stress_index')}); }
    CH.render($('#d-trend', root), {title: 'Wellbeing and stress, last 14 days', summary: 'Daily averages of the wellbeing and stress indices', labels: days.map(d => d.l), series: [{name: 'Wellbeing', data: days.map(d => d.wb), color: P.primary, dec: 0}, {name: 'Stress', data: days.map(d => d.st), color: P.warn, dec: 0}], y: {min: 0, max: 100}, size: 'short', empty: 'Your 14-day trend appears after a few sessions.'});
    let off = 0; const wk = () => R.weekly($('#d-week', root), list, {offset: off, onOffset: o => { off = o; wk(); }}); wk();
  };

  /* =============================== MONITORING CENTER =============================== */
  UI.views['patient/monitor'] = async (root, r) => {
    document.title = 'Monitoring center — ASTRAVITA';
    const c = me(), v = c.vault;
    const ci = await careInfo();
    const STEPS = ['Consent', 'Pre-check', 'Baseline', 'Live session', 'Check-in', 'Results'];
    const METRICS = [
      {k: 'hr', label: 'Heart rate (rPPG)', unit: 'bpm', dec: 0, st: x => x < 45 || x > 120 ? 'bad' : x < 50 || x > 100 ? 'warn' : 'ok', note: 'Resting adult range 60-100 bpm (AHA)'},
      {k: 'rmssd', label: 'HRV (RMSSD)', unit: 'ms', dec: 0, st: x => x < 15 ? 'warn' : 'ok', note: 'Experimental optical estimate'},
      {k: 'rr', label: 'Breathing rate', unit: '/min', dec: 0, st: x => x < 8 || x > 26 ? 'bad' : x < 12 || x > 20 ? 'warn' : 'ok', note: 'Typical adult rest 12-18 /min'},
      {k: 'blink', label: 'Blink rate', unit: '/min', dec: 0, st: x => x < 5 || x > 35 ? 'warn' : 'ok', note: 'Typical 12-22 /min at rest'},
      {k: 'perclos', label: 'PERCLOS (P80)', unit: '%', dec: 1, st: x => x >= 20 ? 'bad' : x >= 12 ? 'warn' : 'ok', note: 'Share of the last minute with eyes ≥ 80 % closed'},
      {k: 'yawns', label: 'Yawns', unit: 'session', dec: 0, st: x => x >= 3 ? 'warn' : 'ok', note: 'Sustained mouth opening (MAR > 0.7)'},
      {k: 'tension', label: 'Facial tension', unit: '/100', dec: 0, st: x => x >= 60 ? 'bad' : x >= 40 ? 'warn' : 'ok', note: 'Brow, eyelid and lip press'},
      {k: 'stab', label: 'Head stability', unit: '%', dec: 0, st: x => x < 45 ? 'bad' : x < 70 ? 'warn' : 'ok', note: 'Head sway over the last 5 s'},
      {k: 'microRate', label: 'Micro-expressions', unit: '/min', dec: 0, st: () => 'ok', note: 'Brief 40-500 ms facial movements'},
      {k: 'quality', label: 'Signal quality', unit: '/100', dec: 0, st: x => x < 40 ? 'bad' : x < 60 ? 'warn' : 'ok', note: 'Pulse SNR, tracking and lighting'}];
    root.innerHTML = UI.shell(`
      <div class="page-head"><div><span class="eyebrow">Biometric monitoring center</span><h1>Monitoring session</h1><p class="lead">Face the camera in steady light. Everything is processed on this device; video is never recorded or sent anywhere.</p></div>
        <div class="actions"><span class="timer" id="m-timer" aria-live="off">00:00</span><button class="btn danger" type="button" id="m-end" hidden>${icon('stop')}End session</button></div></div>
      <ol class="steps" id="m-steps" aria-label="Session steps">${STEPS.map((s, i) => `<li data-i="${i}">${i + 1}. ${s}</li>`).join('')}</ol>
      <div class="notice tele" id="m-msg" role="status" aria-live="polite">${icon('info')}<div id="m-msg-t">Choose a source to begin: your camera, a recorded video, or the 150-second demo script.</div></div>
      <div class="grid g-12">
        <section class="span-7 stack" aria-label="Video and face mesh">
          <div class="stage-wrap mirror" id="m-stage">
            <video id="m-video" playsinline muted aria-label="Live camera preview (processed locally)"></video>
            <canvas class="ov" id="m-ov" aria-hidden="true"></canvas>
            <div class="idle" id="m-idle"><div>${icon('scan', 's28')}<h2 style="color:#fff;margin-top:8px">Ready when you are</h2><p>Sit comfortably, about an arm’s length from the camera, with your face evenly lit.</p>
              <div class="row" style="justify-content:center;margin-top:16px"><button class="btn primary" type="button" data-src="camera">${icon('camera')}Use camera</button><button class="btn" type="button" data-src="file">${icon('video')}Video file</button><button class="btn" type="button" data-src="demo">${icon('flask')}Demo script</button></div>
              <input type="file" id="m-file" accept="video/*" hidden></div></div>
            <div class="hud top" aria-hidden="true"><span class="glass" id="m-sim" hidden style="color:var(--warn-ink);background:rgba(255,245,227,.92)">SIMULATED DATA</span><span class="glass" id="h-face">Face: —</span><span class="glass" id="h-light">Lighting: —</span><span class="glass" id="h-head">Head: —</span><span class="glass" id="h-model">Model: idle</span></div>
            <div class="hud bottom"><span class="glass"><button class="btn sm ghost" type="button" id="t-mesh" aria-pressed="true">${icon('scan', 's16')}Mesh</button><button class="btn sm ghost" type="button" id="t-roi" aria-pressed="false">${icon('target', 's16')}Pulse ROIs</button></span><span class="glass" id="h-snr">SNR: —</span></div>
          </div>
          <div class="card tight" id="m-phase"></div>
          <div class="notice ok">${icon('shield')}<div><strong>Local processing active.</strong> Frames are analysed in memory inside this browser tab. No image or video is stored or transmitted.</div></div>
        </section>
        <section class="span-5 stack" aria-label="Waveforms">
          <div class="card tight"><div class="card-head" style="margin-bottom:8px"><h3>${icon('heart')}Pulse wave (rPPG, last 8 s)</h3><span class="row" style="gap:6px"><span class="chip tele" id="w-alg">POS · 0.7-3.5 Hz</span><b class="mono" id="w-hr">— bpm</b></span></div><canvas class="wave" id="w-pulse" aria-label="Pulse waveform" role="img"></canvas></div>
          <div class="card tight"><div class="card-head" style="margin-bottom:8px"><h3>${icon('wind')}Breathing (estimated, 20 s)</h3><b class="mono" id="w-rr">— /min</b></div><canvas class="wave" id="w-resp" aria-label="Breathing waveform" role="img"></canvas></div>
          <div class="notice tele small">${icon('flask')}<div>Optical estimates (rPPG with POS, CHROM or GREEN; experimental). They are not an ECG.</div></div>
          <div class="card tight"><div class="card-head" style="margin-bottom:8px"><h3>${icon('smile')}Expressions (%)</h3><span class="chip" id="e-dom">—</span></div><div class="emo-list" id="e-list"></div></div>
        </section>
      </div>
      <section aria-labelledby="h-metrics"><h2 id="h-metrics" class="sr-only">Live indicators</h2><div class="grid g-4" id="m-tiles">${METRICS.map(m => UI.metricTile({key: m.k, label: m.label, unit: m.unit, note: m.note})).join('')}</div></section>
      <div class="grid g-12">
        <section class="card span-6"><div class="card-head"><h3>${icon('gauge')}Live indices (explainable)</h3><span class="chip warn">Experimental</span></div><div id="m-idx"></div></section>
        <section class="card span-6"><div class="card-head"><h3>${icon('scan')}Action units &amp; micro-expressions</h3><span class="chip" id="mx-count">0 / min</span></div><div id="m-aus" class="stack" style="gap:6px"></div>
          <h4 class="eyebrow" style="margin:14px 0 6px">Event log</h4><ul class="console" id="m-log" aria-live="off"></ul></section>
      </div>`);
    const els = {video: $('#m-video', root), overlay: $('#m-ov', root)};
    let step = -1, phase = 'idle', session = null, source = null, ending = false, lastTickUI = 0;
    const setStep = i => { step = i; $$('#m-steps li', root).forEach(li => { const k = Number(li.dataset.i); li.toggleAttribute('aria-current', k === i); if (k === i) li.setAttribute('aria-current', 'step'); li.dataset.done = k < i; }); };
    const msg = (t, sev = 'tele') => { const m = $('#m-msg', root); m.className = 'notice ' + sev; $('#m-msg-t', root).textContent = t; };
    const phaseBox = $('#m-phase', root);
    const logEl = $('#m-log', root);
    const log = (ev) => { const li = document.createElement('li'); li.innerHTML = `<span class="t">${esc(U.timeStr(ev.timestamp))}</span><span class="k">[${esc(ev.type.toUpperCase())}]</span><span>${esc(ev.detail)}</span><span class="d">${ev.data?.duration_ms ? ev.data.duration_ms + ' ms' : ''}</span>`; logEl.prepend(li); while (logEl.children.length > 40) logEl.lastElementChild.remove(); };
    $('#e-list', root).innerHTML = LV.EMOTIONS.map(k => `<div class="emo"><span>${esc(LV.EMO_LABEL[k])}</span><div class="bar ${k === 'neutral' ? 'tele' : k === 'happy' ? '' : k === 'sad' ? 'vision' : 'warn'}" role="meter" aria-label="${esc(LV.EMO_LABEL[k])}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i data-e="${k}"></i></div><b data-ev="${k}">0%</b></div>`).join('');
    $('#m-aus', root).innerHTML = LV.AUS.map(a => `<div class="emo" style="grid-template-columns:70px 1fr 40px"><code class="small">${esc(a.code)}</code><div class="bar vision" title="${esc(a.name)}"><i data-au="${a.id}"></i></div><b data-auv="${a.id}">0%</b></div>`).join('');
    const sparks = {};

    LV.attach(els, {
      onModel: (s, d) => { $('#h-model', root).textContent = s === 'ready' ? `Model: ready (${d})` : s === 'loading' ? 'Model: loading…' : 'Model: unavailable'; if (s === 'error') msg('The face model could not be loaded (offline?). Pulse is measured on a fixed forehead region; blinks, PERCLOS and expressions need the model. The demo script works offline.', 'warn'); },
      onTick: snap => { if (performance.now() - lastTickUI < 240) return; lastTickUI = performance.now(); paint(snap); },
      onEvent: ev => { log(ev); if (ev.type === 'closure') N.toast('Long eye closure detected. If you feel drowsy, consider a short break.', 'warn', 4000); },
      onError: t => msg(t, 'bad'),
      onEnded: () => { if (phase === 'live') finish(); else { msg('The video ended before the session started.', 'warn'); resetIdle(); } },
      onCalibration: p => { const b = $('#cal-bar', root); if (b) { b.style.width = Math.round(p * 100) + '%'; b.parentElement.setAttribute('aria-valuenow', Math.round(p * 100)); } }
    });
    LV.setOption('mesh', true); LV.setOption('rois', false);
    $('#t-mesh', root).addEventListener('click', e => { const b = e.currentTarget, on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); LV.setOption('mesh', on); });
    $('#t-roi', root).addEventListener('click', e => { const b = e.currentTarget, on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); LV.setOption('rois', on); });

    function paint(s) {
      const o = s.O, pc = s.precheck;
      for (const m of METRICS) {
        const el = $(`[data-k="${m.k}"]`, root), val = o[m.k];
        el.querySelector('[data-v]').textContent = fin(val) ? U.fmt(val, m.dec) : '—';
        el.dataset.s = fin(val) ? m.st(val) : '';
        if (m.k === 'hr') el.querySelector('[data-note]').textContent = fin(val) && fin(v.baseline?.hr_bpm) ? `${U.sgn(val - v.baseline.hr_bpm, 0)} bpm vs baseline` : fin(o.hrRaw) && !fin(val) ? 'Stabilizing signal…' : m.note;
      }
      $('#w-hr', root).textContent = fin(o.hr) ? `${U.fmt(o.hr, 0)} bpm` : '— bpm';
      $('#w-rr', root).textContent = fin(o.rr) ? `${U.fmt(o.rr, 0)} /min` : '— /min';
      $('#w-alg', root).textContent = `${o.alg || 'POS'} · 0.7-3.5 Hz`;
      CH.wave($('#w-pulse', root), s.pulse.slice(-240), P.primary, {empty: s.running ? 'Acquiring pulse (about 10 s)…' : 'No signal'});
      CH.wave($('#w-resp', root), s.resp, P.tele, {empty: s.running ? 'Acquiring breathing (about 15 s)…' : 'No signal'});
      $('#h-face', root).textContent = `Face: ${s.mode === 'demo' ? 'synthetic' : o.face ? 'tracked' : 'not found'} (${U.fmt(o.track, 0)} %)`;
      $('#h-light', root).textContent = `Lighting: ${pc.light === 'ok' ? 'adequate' : pc.light === 'warn' ? 'check' : 'too dark'}`;
      $('#h-head', root).textContent = `Head: ${fin(o.angStd) ? '±' + U.fmt(o.angStd, 1) + '°' : '—'}`;
      $('#h-snr', root).textContent = `SNR: ${fin(o.snr) ? U.sgn(o.snr, 1) + ' dB' : '—'} · ${o.fps} FPS`;
      let dom = 'neutral'; for (const k of LV.EMOTIONS) { const p = Math.round(s.EMO[k]); const i = $(`[data-e="${k}"]`, root); i.style.width = p + '%'; i.parentElement.setAttribute('aria-valuenow', p); $(`[data-ev="${k}"]`, root).textContent = p + '%'; if (s.EMO[k] > s.EMO[dom]) dom = k; }
      $('#e-dom', root).textContent = 'Dominant: ' + LV.EMO_LABEL[dom];
      for (const a of s.aus) { const p = Math.round(a.v * 100); $(`[data-au="${a.id}"]`, root).style.width = p + '%'; $(`[data-auv="${a.id}"]`, root).textContent = p + '%'; }
      $('#mx-count', root).textContent = `${o.microRate} / min`;
      const ix = s.IDX;
      $('#m-idx', root).innerHTML = ix.ready ? `<div class="grid g-3" style="margin-bottom:12px"><div class="kpi"><span class="eyebrow">Wellbeing</span><span class="kv">${U.fmt(ix.W, 0)}</span></div><div class="kpi"><span class="eyebrow">Stress</span><span class="kv">${U.fmt(ix.S, 0)}</span></div><div class="kpi"><span class="eyebrow">Fatigue level</span><span class="kv">${ix.level}/5</span></div></div>
        <p class="small muted" style="margin-bottom:6px">Stress index terms</p>${CH.contributions(ix.ts.map(t => ({label: t.name + ' (' + t.val + ')', points: t.pts, detail: t.val})), 30)}<p class="small muted" style="margin:10px 0 6px">Fatigue index terms</p>${CH.contributions(ix.tf.map(t => ({label: t.name + ' (' + t.val + ')', points: t.pts, detail: t.val})), 40)}` : '<p class="muted small">Indices appear once the pulse or face signals are stable.</p>';
      if (phase === 'precheck') paintPrecheck(pc);
      if (phase === 'live') { const t = Math.floor(s.elapsed); $('#m-timer', root).textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; const pr = $('#live-prog', root); if (pr) pr.style.width = Math.min(100, s.elapsed / 120 * 100) + '%'; const dp = LV.demoPhase(); if (dp) $('#live-demo', root).textContent = `Demo phase: ${dp}`; }
    }
    const LIGHT_TXT = {cam: ['Camera', {ok: 'Frames flowing', warn: 'Low frame rate', bad: 'No frames'}], light: ['Lighting', {ok: 'Even light', warn: 'Check light', bad: 'Too dark'}], frame: ['Framing', {ok: 'Face centered', warn: 'Adjust position', bad: 'Face not found'}], sig: ['Signal', {ok: 'Pulse locked', warn: 'Acquiring…', bad: 'Weak signal'}]};
    function paintPrecheck(pc) {
      for (const k in LIGHT_TXT) { const el = $(`[data-l="${k}"]`, root); if (!el) continue; el.dataset.s = pc[k]; el.querySelector('span').textContent = LIGHT_TXT[k][1][pc[k]]; }
      const ok = pc.cam !== 'bad' && pc.frame !== 'bad' && pc.light !== 'bad';
      const btn = $('#pc-go', root); if (btn) { btn.disabled = !ok && source !== 'file'; }
    }
    function resetIdle() { phase = 'idle'; setStep(v.consent ? 1 : 0); $('#m-idle', root).hidden = false; $('#m-sim', root).hidden = true; $('#m-end', root).hidden = true; phaseBox.innerHTML = '<p class="muted small">Choose a source above to start.</p>'; $('#m-timer', root).textContent = '00:00'; }
    async function consent() {
      if (v.consent) return true;
      setStep(0);
      return new Promise(res => {
        const d = document.createElement('dialog'); d.setAttribute('aria-labelledby', 'cs-title');
        d.innerHTML = `<form method="dialog"><div class="dlg-head"><h2 id="cs-title">Before we use the camera</h2></div><div class="dlg-body">
          <p><b>What ASTRAVITA measures:</b> facial landmarks, expressions and micro-expressions, eye closure and blinks, yawns, head movement, and optical estimates of pulse, heart-rate variability and breathing.</p>
          <p><b>Where it happens:</b> only inside this browser tab. Video is never recorded, uploaded or shared. Only the numbers (one row per second) are saved, encrypted, in your account.</p>
          <p><b>What you get:</b> an exploratory orientation, <b>not a clinical diagnosis</b>. If you link a flight surgeon, they can see your session summaries and results.</p>
          <p class="small muted">You can stop at any time and delete your sessions in History.</p></div>
          <div class="dlg-foot"><button class="btn" value="no">Not now</button><button class="btn primary" value="yes">I agree, continue</button></div></form>`;
        document.body.append(d); d.addEventListener('close', async () => { const ok = d.returnValue === 'yes'; d.remove(); if (ok) await DT.setConsent(); res(ok); }, {once: true}); d.showModal();
      });
    }
    async function startSource(kind) {
      if (!(await consent())) { msg('Monitoring needs your consent to use the camera. You can still explore your history and results.', 'warn'); return; }
      source = kind;
      try {
        if (kind === 'camera') { msg('Requesting camera permission…'); await LV.startCamera(); }
        else if (kind === 'file') { const f = await pickFile(); if (!f) return; await LV.startFile(f); }
        else LV.startDemo();
      } catch (e) { msg(e.message, 'bad'); resetIdle(); return; }
      $('#m-idle', root).hidden = true; $('#m-sim', root).hidden = kind !== 'demo'; if (kind === 'demo') $('#h-model', root).textContent = 'Model: synthetic face';
      $('#m-stage', root).classList.toggle('mirror', kind === 'camera');
      LV.setBaseline(v.baseline);
      precheck();
    }
    const pickFile = () => new Promise(res => { const inp = $('#m-file', root); inp.value = ''; inp.onchange = () => res(inp.files[0] || null); inp.click(); });
    function precheck() {
      phase = 'precheck'; setStep(1);
      msg(source === 'demo' ? 'Demo script running with synthetic signals that go through the same pipeline. Continue when ready.' : 'Checking camera, lighting, framing and signal. Keep still and face the camera.');
      const hasBase = !!v.baseline, forceCal = r.query.get('calibrate') === '1';
      phaseBox.innerHTML = `<div class="card-head" style="margin-bottom:10px"><h3>Pre-check</h3><span class="small muted">Green is ideal; amber is usable.</span></div>
        <div class="precheck">${Object.entries(LIGHT_TXT).map(([k, [l]]) => `<div class="light" data-l="${k}" data-s=""><i class="tl" aria-hidden="true"></i><div><b>${l}</b><span>…</span></div></div>`).join('')}</div>
        <label class="check" style="margin-top:12px"><input type="checkbox" id="pc-cal" ${!hasBase || forceCal ? 'checked' : ''} ${hasBase ? '' : 'disabled'}><span>${hasBase ? 'Recalibrate my baseline first (30 s)' : 'A 30-second baseline calibration runs first (required once)'}</span></label>
        <div class="row" style="margin-top:12px"><button class="btn primary" id="pc-go" type="button">Continue ${icon('arrow', 's16')}</button><button class="btn" id="pc-cancel" type="button">Cancel</button></div>`;
      $('#pc-go', root).addEventListener('click', () => { const cal = $('#pc-cal', root).checked || !hasBase; cal ? calibrate() : live(); });
      $('#pc-cancel', root).addEventListener('click', () => { LV.stop(true); resetIdle(); msg('Session cancelled. Nothing was saved.'); });
    }
    async function calibrate() {
      phase = 'calibration'; setStep(2);
      msg(source === 'demo' ? 'Calibrating a synthetic baseline (demo).' : 'Calibrating your baseline: relax your face, look at the camera and breathe normally for 30 seconds.');
      phaseBox.innerHTML = `<div class="card-head" style="margin-bottom:10px"><h3>${icon('target')}Baseline calibration</h3><span class="small muted">30 s</span></div><div class="progress" role="progressbar" aria-label="Calibration progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="cal-bar"></i></div><div class="row" style="margin-top:12px"><button class="btn sm" id="cal-cancel" type="button">Cancel calibration</button></div>`;
      $('#cal-cancel', root).addEventListener('click', () => LV.cancelCalibration());
      try {
        const b = await LV.startCalibration(LV.T.CAL_SECONDS);
        if (source !== 'demo' || !v.baseline) await DT.setCalibration(b);
        N.toast(source === 'demo' ? 'Synthetic baseline ready.' : 'Baseline calibrated and saved.', 'ok'); live();
      } catch (e) {
        if (e.code === 'cancel') { if (v.baseline) live(); else { LV.stop(true); resetIdle(); msg('Calibration cancelled. A baseline is needed once before the first session.', 'warn'); } }
        else { msg(e.message, 'warn'); precheck(); }
      }
    }
    function live() {
      phase = 'live'; setStep(3);
      session = {session_id: U.uid(), subject_id: c.user.pseudo_id};
      LV.startRecording(session);
      $('#m-end', root).hidden = false;
      msg(source === 'demo' ? 'Recording the demo script (nominal, stress, fatigue, recovery). End the session whenever you like; 2 minutes or more works best.' : 'Recording. Relax and go about a calm activity. End the session whenever you like; 3 to 5 minutes works best.', 'ok');
      phaseBox.innerHTML = `<div class="card-head" style="margin-bottom:10px"><h3>${icon('activity')}Live session</h3><span class="chip ok"><span class="dot live"></span>Recording numbers only</span></div><div class="progress" aria-hidden="true"><i id="live-prog"></i></div><p class="small muted" style="margin-top:6px">Recommended minimum: 2 minutes. <span id="live-demo"></span></p>`;
      addEventListener('beforeunload', guard);
    }
    const guard = e => { if (phase === 'live') { e.preventDefault(); e.returnValue = ''; } };
    async function finish(auto = false) {
      if (ending || phase !== 'live') return; ending = true;
      const snap = LV.snapshot();
      if (snap.elapsed < 60 && !auto) {
        // Escape or "Keep recording" keeps the session running; discarding needs the explicit button
        const discard = await N.confirm({title: 'This session is very short', body: 'Sessions under 1 minute cannot give a reliable orientation. Keep recording, or discard this session?', ok: 'Discard session', cancel: 'Keep recording', danger: true});
        ending = false; if (!discard || phase !== 'live') return;
        LV.stopRecording(); LV.stop(true); removeEventListener('beforeunload', guard); resetIdle(); msg('Short session discarded. Nothing was saved.'); return;
      }
      const rec = LV.stopRecording(); LV.stop(true); removeEventListener('beforeunload', guard);
      phase = 'checkin'; setStep(4); $('#m-end', root).hidden = true;
      msg('Session finished. Answer the short check-in (optional) to improve the orientation.', 'ok');
      const ans = auto ? null : await R.questionnaire(null);
      setStep(5); msg('Comparing with your baseline and the knowledge base…');
      try {
        const s = await DT.saveSession({rec, source, questionnaire: ans, simulated: source === 'demo'});
        if (s.result?.safety) R.support({doctor: ci.active?.doctor_name});
        N.toast('Session saved and analysed.', 'ok'); phase = 'done';
        if (!auto) UI.go('#/patient/results/' + s.id);
      } catch (e) { console.error(e); msg('The session could not be saved: ' + e.message, 'bad'); ending = false; }
    }
    $('#m-end', root).addEventListener('click', () => finish());
    $$('[data-src]', root).forEach(b => b.addEventListener('click', () => startSource(b.dataset.src)));
    resetIdle();
    if (!ci.active && !v.sessions?.length) msg('Tip: link your flight surgeon in Care team so they can follow your sessions. Choose a source to begin.');
    return () => {
      removeEventListener('beforeunload', guard);
      if (phase === 'live') { const s = LV.snapshot(); if (s.elapsed >= 60) { finish(true); N.toast('Your session was saved because you left the monitoring center.', 'info', 6000); return; } N.toast('The short session was discarded because you left the monitoring center.', 'info'); }
      LV.cancelCalibration(); LV.stopRecording(); LV.stop(true);
    };
  };

  /* =============================== RESULTS =============================== */
  UI.views['patient/results'] = async (root, r) => {
    document.title = 'Results & guidance — ASTRAVITA';
    const list = DT.sessions(), id = r.parts[2], s = id ? DT.byId(id) : list[0];
    const ci = await careInfo();
    if (!s) { root.innerHTML = UI.shell(`<div class="page-head"><div><h1>Results &amp; guidance</h1></div></div>${UI.empty('trend', id ? 'Session not found' : 'No results yet', id ? 'This session does not exist in your account.' : 'Finish a monitoring session to see your orientation here.', '<a class="btn primary sm" href="#/patient/monitor">Start monitoring</a>')}`); return; }
    const st = R.statusOf(s);
    const headline = s.result?.findings?.length ? s.result.findings[0].name.replace(/^Pattern consistent with\s*/i, '').replace(/^./, ch => ch.toUpperCase()) : s.result?.insufficient ? 'Low signal quality' : 'Stable pattern';
    root.innerHTML = UI.shell(`
      <div class="page-head"><div><span class="eyebrow">Clinical review module · ${esc(U.dateTime(s.start))} · ${esc(s.subject_id)}</span><h1>Session results: <span style="color:var(--primary)">${esc(headline)}</span></h1>
        <p class="lead">${esc(s.result?.summary || '')}</p><div class="row" style="margin-top:10px">${UI.statusChip(st)}${R.srcChip(s)}<span class="chip">${icon('clock', 's16')}${esc(U.duration(s.duration_s))}</span><span class="chip">${icon('activity', 's16')}Quality ${U.fmt(s.quality_pct, 0)} %</span>${s.result?.baseline_kind ? `<span class="chip ok">Baseline: ${s.result.baseline_kind.startsWith('rolling') ? s.result.baseline_kind.replace(/rolling_(\d+)d/, '$1-day rolling') : 'calibration'}</span>` : ''}</div></div>
        <div class="actions"><label class="sr-only" for="r-pick">Choose a session</label><select class="input" id="r-pick" style="max-width:100%;width:auto">${list.slice(0, 60).map(x => `<option value="${esc(x.id)}" ${x.id === s.id ? 'selected' : ''}>${esc(U.dateTime(x.start))} · ${esc(U.duration(x.duration_s))}</option>`).join('')}</select></div></div>
      <section class="card" aria-labelledby="h-break"><div class="card-head"><div><h2 id="h-break">${icon('info')}Orientation breakdown</h2><p>Ranked by relevance, with confidence, probable causes, countermeasures and when to escalate.</p></div><span class="chip ok">Local engine · no AI service</span></div>
        <div class="grid g-3" style="margin-bottom:16px">
          <div class="card tight tele"><h3 class="small eyebrow">What was measured</h3><p class="small">${esc(U.duration(s.duration_s))} of ${esc(R.SRC_LABEL[s.source])} analysis: ${s.minutes?.length || 0} minutes of pulse, breathing, eye, head and expression readings${s.questionnaire ? ', plus your check-in answers' : ''}.</p></div>
          <div class="card tight tint"><h3 class="small eyebrow">What was observed</h3><p class="small">${esc(s.result?.summary || '')}</p></div>
          <div class="card tight"><h3 class="small eyebrow">What is missing</h3><p class="small">${s.questionnaire ? 'Nothing essential.' : 'No check-in answers: psychological patterns rely mostly on them.'} Blood pressure, SpO2, sleep tracking and lab values are not measured by the camera.</p>${s.questionnaire ? '' : '<button class="btn sm" type="button" id="r-checkin" style="margin-top:8px">Add check-in</button>'}</div></div>
        ${R.resultPanel(s)}</section>
      <section aria-labelledby="h-vs"><h2 id="h-vs" style="margin-bottom:12px">Session metrics vs personal baseline</h2>${R.vsBaseline(s)}</section>
      <section class="card" aria-labelledby="h-evo"><div class="card-head"><div><h2 id="h-evo">${icon('trend')}Evolution within the session</h2><p>Minute-by-minute changes. Gaps mean no valid reading in that minute.</p></div></div><div id="r-session"></div></section>
      <section class="card" aria-labelledby="h-wk"><div class="card-head"><div><h2 id="h-wk">${icon('grid')}Weekly summary</h2><p>Daily averages and comparison with the previous week.</p></div></div><div id="r-week"></div></section>
      <div class="row"><button class="btn" type="button" id="r-csv">${icon('download')}Export CSV</button><button class="btn" type="button" id="r-print">${icon('printer')}Print report</button>${s.questionnaire ? `<button class="btn" type="button" id="r-checkin2">${icon('clipboard')}Edit check-in</button>` : ''}<a class="btn primary" href="#/patient/monitor">${icon('play')}New session</a></div>`);
    $('#r-pick', root).addEventListener('change', e => UI.go('#/patient/results/' + e.target.value));
    $('[data-act="support"]', root)?.addEventListener('click', () => R.support({doctor: ci.active?.doctor_name}));
    R.sessionCharts($('#r-session', root), s);
    let off = 0; const wk = () => R.weekly($('#r-week', root), list, {offset: off, onOffset: o => { off = o; wk(); }}); wk();
    const checkin = async () => { const ans = await R.questionnaire(s.questionnaire); if (!ans) return; const ns = await DT.reevaluate(s.id, ans); if (ns.result.safety) R.support({doctor: ci.active?.doctor_name}); N.toast('Orientation updated with your answers.', 'ok'); UI.render(); };
    $('#r-checkin', root)?.addEventListener('click', checkin); $('#r-checkin2', root)?.addEventListener('click', checkin);
    $('#r-csv', root).addEventListener('click', async () => {
      const rows = await A.loadSamples(s.id);
      if (rows?.length) UI.download(`astravita-samples-${s.subject_id}-${X.stamp()}.csv`, X.csv(rows, LV.SAMPLE_COLS));
      else UI.download(`astravita-minutes-${s.subject_id}-${X.stamp()}.csv`, X.csv(X.minuteRows([s], s.subject_id), X.MINUTE_COLS));
    });
    $('#r-print', root).addEventListener('click', () => UI.print(R.report(s, me().vault.profile), 'ASTRAVITA report'));
  };

  /* =============================== HISTORY =============================== */
  UI.views['patient/history'] = async (root) => {
    document.title = 'History — ASTRAVITA';
    const list = DT.sessions(), c = me();
    root.innerHTML = UI.shell(`
      <div class="page-head"><div><span class="eyebrow">History &amp; logbook</span><h1>All sessions</h1><p class="lead">Every session with its date, duration, quality and summary. Exports include only your own data.</p></div>
        <div class="actions"><button class="btn" type="button" id="h-sess">${icon('download')}Sessions CSV</button><button class="btn" type="button" id="h-min">${icon('download')}Minutes CSV</button><button class="btn" type="button" id="h-json">${icon('download')}Full JSON</button></div></div>
      <section class="card">${R.historyTable(list, {link: s => '#/patient/results/' + s.id})}</section>
      ${list.length ? `<section class="card"><div class="card-head"><h2>${icon('trash')}Delete a session</h2></div><div class="row"><label class="sr-only" for="h-del-pick">Session to delete</label><select class="input" id="h-del-pick" style="max-width:320px">${list.map(s => `<option value="${esc(s.id)}">${esc(U.dateTime(s.start))} · ${esc(U.duration(s.duration_s))}</option>`).join('')}</select><button class="btn danger" type="button" id="h-del">Delete</button></div></section>` : ''}`);
    const sid = c.user.pseudo_id;
    $('#h-sess', root).addEventListener('click', () => UI.download(`astravita-sessions-${sid}-${X.stamp()}.csv`, X.csv(X.sessionRows(list, sid), X.SESSION_COLS)));
    $('#h-min', root).addEventListener('click', () => UI.download(`astravita-minutes-${sid}-${X.stamp()}.csv`, X.csv(X.minuteRows(list, sid), X.MINUTE_COLS)));
    $('#h-json', root).addEventListener('click', async () => {
      const samples = {}; for (const s of list.slice(0, 50)) { const rows = await A.loadSamples(s.id); if (rows) samples[s.id] = rows; }
      UI.download(`astravita-export-${sid}-${X.stamp()}.json`, JSON.stringify({schema: 'astravita.export.v1', exported_at: new Date().toISOString(), subject_id: sid, profile: c.vault.profile, baseline: c.vault.baseline, sessions: list, samples_1hz: samples, sample_columns: LV.SAMPLE_COLS}, null, 1), 'application/json');
    });
    $('#h-del', root)?.addEventListener('click', async () => { const id = $('#h-del-pick', root).value; if (!(await N.confirm({title: 'Delete this session?', body: 'The session, its samples and its alerts will be permanently deleted from this device and from your flight surgeon’s view.', ok: 'Delete', danger: true}))) return; await DT.deleteSession(id); N.toast('Session deleted.', 'ok'); UI.render(); });
  };

  /* =============================== CARE TEAM =============================== */
  UI.views['patient/care'] = async (root) => {
    document.title = 'Care team — ASTRAVITA';
    const c = me(); await A.refreshEntry();
    const ci = await careInfo();
    const cmStatus = c.vault.cm_status || {};
    root.innerHTML = UI.shell(`
      <div class="page-head"><div><span class="eyebrow">Care team &amp; notes</span><h1>Your flight surgeon</h1><p class="lead">You decide who can see your monitoring. A flight surgeon only sees your data after you accept their request, and loses access as soon as you revoke it.</p></div></div>
      ${linkRequests(ci.pending)}
      <div class="grid g-12">
        <section class="card span-5"><div class="card-head"><h2>${icon('key')}Your linking code</h2></div>
          <p class="small muted" style="margin-bottom:12px">Give this code to your flight surgeon. They enter it in “Add crew member”, and you accept or decline the request here.</p>
          <div class="code-box" aria-label="Linking code ${esc(c.user.link_code.split('').join(' '))}">${esc(c.user.link_code)}</div>
          <div class="row" style="margin-top:12px"><button class="btn sm" type="button" id="c-copy">${icon('clipboard', 's16')}Copy</button><button class="btn sm" type="button" id="c-regen">${icon('refresh', 's16')}New code</button></div></section>
        <section class="card span-7"><div class="card-head"><h2>${icon('steth')}Access</h2>${ci.active ? '<span class="chip ok">Linked</span>' : '<span class="chip">Not linked</span>'}</div>
          ${ci.active ? `<div class="row between"><div class="row"><span class="avatar lg" aria-hidden="true">${esc(U.initials(ci.active.doctor_name))}</span><div><b>${esc(ci.active.doctor_name)}</b><p class="small muted">${esc(ci.active.doctor_title || 'Flight surgeon')} · ${esc(ci.active.doctor_pseudo || '')} · since ${esc(U.dateShort(ci.active.updated_at || ci.active.created_at))}</p></div></div><button class="btn danger sm" type="button" id="c-revoke">Revoke access</button></div>
            <p class="small muted" style="margin-top:12px">They can see: session summaries, results, charts, alerts and your check-in answers. They cannot see: video (never recorded), your password, other crew members.</p>`
          : UI.empty('link', 'No flight surgeon linked', 'Share your code to start.')}
          ${ci.links.filter(l => ['revoked', 'declined'].includes(l.status)).length ? `<details style="margin-top:12px"><summary class="small">Past requests</summary><ul class="small">${ci.links.filter(l => ['revoked', 'declined', 'cancelled'].includes(l.status)).map(l => `<li>${esc(l.doctor_name)} — ${esc(l.status)} ${esc(U.dateShort(l.updated_at || l.created_at))}</li>`).join('')}</ul></details>` : ''}</section>
      </div>
      <section class="card"><div class="card-head"><h2>${icon('note')}Notes from your flight surgeon</h2><span class="chip">Read only</span></div>
        ${ci.active && ci.care.notes.length ? `<div class="stack">${[...ci.care.notes].reverse().map(n => `<article class="note"><div class="n-meta"><b>${esc(ci.active.doctor_name)}</b> · ${esc(U.dateTime(n.created_at))}${n.updated_at ? ' · edited ' + esc(U.ago(n.updated_at)) : ''} ${ci.seen.has(n.id) ? '' : '<span class="chip ok">New</span>'}</div><p class="n-text">${esc(n.text)}</p></article>`).join('')}</div>` : UI.empty('note', 'No notes yet', 'Notes your flight surgeon writes for you will appear here.')}</section>
      <section class="card"><div class="card-head"><h2>${icon('pill')}Assigned countermeasures</h2></div>
        ${ci.active && ci.care.countermeasures.length ? `<div class="cm-list">${ci.care.countermeasures.map(x => R.cmCard(x.cm_id, {open: cmStatus[x.cm_id]?.status !== 'done', extra: `<p class="small muted">Assigned ${esc(U.dateShort(x.assigned_at))}${x.note ? ' · ' + esc(x.note) : ''}</p>`, actions: `<div class="row" style="margin-top:8px"><span class="chip ${cmStatus[x.cm_id]?.status === 'done' ? 'ok' : cmStatus[x.cm_id]?.status === 'started' ? 'tele' : ''}">${esc(cmStatus[x.cm_id]?.status === 'done' ? 'Done' : cmStatus[x.cm_id]?.status === 'started' ? 'In progress' : 'Not started')}</span><button class="btn sm" type="button" data-cm="${esc(x.cm_id)}" data-st="started">In progress</button><button class="btn sm" type="button" data-cm="${esc(x.cm_id)}" data-st="done">Mark done</button></div>`})).join('')}</div>` : UI.empty('pill', 'Nothing assigned', 'Countermeasures your flight surgeon assigns appear here. The results page also suggests some for each finding.')}</section>`);
    bindRequests(root, () => UI.render());
    if (ci.active && ci.care.notes.some(n => !ci.seen.has(n.id))) { c.vault.received_notes_seen = [...new Set([...(c.vault.received_notes_seen || []), ...ci.care.notes.map(n => n.id)])]; A.saveVault().then(() => UI.setBadge('care', ci.pending.length)); }
    $('#c-copy', root).addEventListener('click', async () => { try { await navigator.clipboard.writeText(c.user.link_code); N.toast('Code copied.', 'ok'); } catch { N.toast('Copy is not available here. Select the code manually.', 'warn'); } });
    $('#c-regen', root).addEventListener('click', async () => { if (!(await N.confirm({title: 'Create a new code?', body: 'The old code will stop working for new requests. Existing links are not affected.', ok: 'Create new code'}))) return; await A.regenerateLinkCode(); UI.render(); });
    $('#c-revoke', root)?.addEventListener('click', async () => { if (!(await N.confirm({title: `Revoke access for ${ci.active.doctor_name}?`, body: 'They will immediately stop seeing your sessions, results and alerts. You can link again later with a new request.', ok: 'Revoke access', danger: true}))) return; await LK.revoke(ci.active.link_id); N.toast('Access revoked.', 'ok'); UI.render(); });
    $$('[data-cm]', root).forEach(b => b.addEventListener('click', async () => { await DT.setCmStatus(b.dataset.cm, b.dataset.st); N.toast('Status updated.', 'ok'); UI.render(); }));
  };

  /* =============================== SETTINGS =============================== */
  const settingsView = async (root) => {
    document.title = 'Settings — ASTRAVITA';
    const c = me(), p = c.vault.profile, isP = c.user.role === 'patient', b = c.vault.baseline;
    root.innerHTML = UI.shell(`
      <div class="page-head"><div><span class="eyebrow">Settings &amp; privacy</span><h1>Your account</h1></div></div>
      <div class="grid g-12">
        <section class="card span-6"><div class="card-head"><h2>${icon('user')}Profile</h2></div>
          <form id="s-prof" class="stack"><div class="field"><label for="s-name">Full name</label><input class="input" id="s-name" name="name" value="${esc(p.display_name)}" required maxlength="80" autocomplete="name"></div>
            <div class="field"><label for="s-title">Role on the mission</label><input class="input" id="s-title" name="title" value="${esc(p.title || '')}" maxlength="60"></div>
            <div class="field"><label for="s-mission">Mission</label><input class="input" id="s-mission" name="mission" value="${esc(p.mission || '')}" maxlength="60"></div>
            <p class="small muted">Account role: <b>${isP ? 'Patient (crew member)' : 'Doctor (flight surgeon)'}</b> · pseudonymous ID <span class="mono">${esc(c.user.pseudo_id)}</span>. The role cannot be changed.</p>
            <div><button class="btn primary" type="submit">Save profile</button></div></form></section>
        <section class="card span-6"><div class="card-head"><h2>${icon('shield')}Privacy</h2></div>
          <ul class="small" style="display:grid;gap:8px;padding-left:18px;margin:0">
            <li>Video is processed in memory and never stored or transmitted.</li>
            <li>Your data is encrypted on this device with AES-GCM, using a key derived from your password (PBKDF2-SHA-256, 600,000 iterations). Your password is never stored.</li>
            <li>${isP ? 'A flight surgeon can only read your data after you accept their request, through a channel encrypted with a key shared only between your two accounts (ECDH). Revoking deletes that shared copy.' : 'You only see crew members who accepted your request. Their data reaches you through an end-to-end encrypted channel that they can revoke.'}</li>
            <li>This is a client-side prototype: anyone with access to this browser profile can delete (but not read) the stored data. Production use needs a secure backend.</li></ul></section>
        ${isP ? `<section class="card span-6"><div class="card-head"><h2>${icon('target')}Baseline</h2></div>${b ? `<p class="small">Calibrated ${esc(U.dateTime(b.calibrated_at))}: heart rate ${U.fmt(b.hr_bpm, 0)} bpm, blink rate ${U.fmt(b.blink_rate_min, 0)} /min, facial tension ${U.fmt(b.facial_tension, 0)}/100. After 3 good sessions without findings in the last 7 to 28 days, ASTRAVITA uses their rolling average instead.</p>` : '<p class="small muted">Not calibrated yet.</p>'}<a class="btn sm" style="margin-top:12px" href="#/patient/monitor?calibrate=1">${icon('target', 's16')}Recalibrate</a></section>` : ''}
        <section class="card span-6"><div class="card-head"><h2>${icon('trash')}Delete account</h2></div><p class="small muted">Permanently deletes your account, all sessions and notes on this device, and every link with ${isP ? 'your flight surgeon' : 'crew members'}. This cannot be undone.</p><button class="btn danger" type="button" id="s-del" style="margin-top:12px">Delete my account</button></section>
      </div>`);
    $('#s-prof', root).addEventListener('submit', async e => { e.preventDefault(); const f = e.target; if (!f.name.value.trim()) return N.toast('Enter your name.', 'warn'); Object.assign(p, {display_name: f.name.value.trim(), title: f.title.value.trim(), mission: f.mission.value.trim()}); await A.saveVault(); if (isP) { try { await LK.publishShare(); } catch { /* not linked */ } } N.toast('Profile saved.', 'ok'); UI.render(); });
    $('#s-del', root).addEventListener('click', async () => { if (!(await N.confirm({title: 'Delete your account permanently?', body: 'All your data on this device will be erased. This cannot be undone.', ok: 'Delete account', danger: true}))) return; await A.deleteAccount(); N.toast('Your account was deleted.', 'ok'); UI.go('#/cover'); });
  };
  UI.views['patient/settings'] = settingsView;
  UI.views['doctor/settings'] = settingsView;
})();
