/* =====================================================================
   ASTRAVITA.render — shared result, chart, history, questionnaire and
   support-protocol components (used by crew member and flight surgeon views)
   ===================================================================== */
ASTRAVITA.render = (() => {
  const U = ASTRAVITA.util, {esc, fin, $, $$} = U, {icon} = ASTRAVITA.icons, UI = ASTRAVITA.ui, KB = ASTRAVITA.kb, CH = ASTRAVITA.charts, AN = ASTRAVITA.analysis, P = CH.PALETTE;
  const SRC_LABEL = {camera: 'Camera', file: 'Video file', demo: 'Demo script'};
  const srcChip = s => s.simulated ? `<span class="chip sim">${icon('flask')}Simulated data</span>` : `<span class="chip tele">${icon(s.source === 'file' ? 'video' : 'camera')}${esc(SRC_LABEL[s.source] || s.source)}</span>`;
  const statusOf = s => !s?.result ? 'none' : s.result.insufficient && !s.result.findings.length ? 'insufficient' : s.result.status;

  function sources(list) { return `<ul class="src-list">${(list || []).slice(0, 6).map(s => `<li>${esc(s.title)}${s.year ? ' (' + esc(s.year) + ')' : ''}${s.url && /^https?:/.test(s.url) ? ` — <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">link</a>` : s.url ? ' — local file' : ''}</li>`).join('')}</ul>`; }
  function cmCard(id, {extra = '', open = false, actions = ''} = {}) {
    const c = KB.countermeasure(id); if (!c) return '';
    return `<details class="cm" ${open ? 'open' : ''}><summary><span class="row" style="gap:8px">${icon(c.category === 'breathing' ? 'wind' : c.category === 'sleep' ? 'moon' : c.category === 'light' ? 'sun' : c.category === 'social' ? 'users' : c.category === 'exercise' ? 'activity' : c.category === 'medical' ? 'steth' : c.category === 'nutrition' ? 'pill' : 'check')}${esc(c.title)}</span><span class="chip">${esc(c.category)}</span></summary>
      ${extra}<ol>${c.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol><p class="small muted" style="margin-top:8px">${esc(c.duration)} · evidence: ${esc(c.evidence_level)}</p>${actions}
      <details style="margin-top:6px"><summary class="small">Sources</summary>${sources(c.sources)}</details></details>`;
  }

  /* ---------- result panel ---------- */
  function resultPanel(s, {audience = 'patient'} = {}) {
    const r = s.result; if (!r) return UI.empty('info', 'No orientation yet', 'This session has no result.');
    const findings = r.findings || [];
    const head = r.safety ? `<div class="notice bad" role="alert">${icon('heart')}<div><strong>${audience === 'patient' ? 'You do not have to handle this alone.' : 'The crew member asked for support.'}</strong> ${audience === 'patient' ? 'Your answer suggests you may be going through something very hard. Please contact your flight surgeon or the behavioral health team now.' : 'They answered yes to the safety question. Please check in personally and calmly as soon as possible.'} ${audience === 'patient' ? '<button class="link-btn" type="button" data-act="support">See support options</button>' : ''}</div></div>` : '';
    const ins = r.insufficient ? `<div class="notice warn">${icon('alert')}<div><strong>Insufficient signal quality.</strong> Camera-based indicators were not used for this orientation (signal quality ${U.fmt(s.features?.signal_quality, 0)}/100, valid pulse in ${U.fmt(s.quality_pct, 0)} % of the session). ${findings.length ? 'The patterns below are based on the questionnaire only.' : ''} Try again facing a steady light, keeping still, for at least 2 minutes.</div></div>` : '';
    const none = !findings.length ? `<div class="notice ok">${icon('check')}<div><strong>${r.insufficient ? 'No orientation could be made from the camera.' : 'No significant findings.'}</strong> ${r.insufficient ? '' : 'Your indicators stayed close to your usual pattern. Keep your routine and check in again tomorrow.'}${!r.questionnaire_used ? ' Answering the short questionnaire makes the orientation more precise.' : ''}</div></div>` : '';
    const items = findings.map((f, i) => {
      const c = KB.condition(f.id) || {};
      const cms = (c.countermeasure_ids || []).slice(0, 4);
      return `<article class="finding" data-band="${f.band}" aria-labelledby="f-${esc(f.id)}">
        <div class="f-head"><div><h3 id="f-${esc(f.id)}">${esc(f.name)}</h3><p class="small muted" style="margin-top:4px">${esc(c.category?.replace('_', ' ') || '')} · based on ${esc(f.based_on)}${f.gated ? ' · non-specific' : ''}</p></div>
          <div class="row" style="gap:6px">${UI.bandChip(f.band)}${UI.confChip(f.confidence_label, f.confidence)}<span class="score" aria-label="Score ${f.score} out of 100">${f.score}<span class="small muted">/100</span></span></div></div>
        <p>${esc(c.orientative_interpretation || c.summary || '')}</p>
        <details ${i === 0 ? 'open' : ''}><summary>Why this was shown (indicator contributions)</summary>
          ${f.contributions.length ? CH.contributions(f.contributions) : '<p class="small muted">No indicator contributed.</p>'}
          <div class="table-wrap" style="margin-top:8px"><table class="data"><thead><tr><th>Indicator</th><th>Observed</th><th class="num">Points</th></tr></thead><tbody>${f.contributions.map(x => `<tr><td>${esc(x.label)}</td><td class="small">${esc(x.detail)}</td><td class="num">${U.fmt(x.points, 1)}</td></tr>`).join('')}</tbody></table></div>
          ${f.counterfactual?.length ? `<p class="small" style="margin-top:8px"><b>What would change this result:</b> ${f.counterfactual.map(x => `${esc(x.label)} (up to ${x.weight} points; now ${esc(x.detail)})`).join('; ')}.</p>` : ''}
          ${f.missing?.length ? `<p class="small muted"><b>Not available:</b> ${[...new Set(f.missing.map(m => m.label + ' — ' + m.reason))].slice(0, 6).map(esc).join('; ')}.</p>` : ''}
          <p class="small muted"><b>Camera limits:</b> ${esc(c.camera_limits || '')}</p></details>
        <div class="grid g-2"><div><b class="small">Probable causes</b><ul class="small" style="margin:6px 0 0;padding-left:18px">${(c.probable_causes || []).slice(0, 5).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
          <div class="notice ${f.band === 'strong' ? 'warn' : 'tele'}" style="align-self:start">${icon('steth')}<div><b>When to talk to your flight surgeon:</b> ${esc(c.escalation_criteria || 'If this continues or worries you.')}</div></div></div>
        ${cms.length ? `<div><b class="small">Suggested countermeasures</b><div class="cm-list" style="margin-top:8px">${cms.map((id, k) => cmCard(id, {open: i === 0 && k === 0})).join('')}</div></div>` : ''}
        <details><summary>Sources</summary>${sources(c.sources)}</details>
      </article>`;
    }).join('');
    return `<div class="stack">${head}${ins}${none}${items}${UI.disclaimer()}</div>`;
  }

  /* ---------- metrics vs baseline ---------- */
  function vsBaseline(s) {
    const f = s.features || {}, b = s.baseline_used || {};
    const tiles = [['hr_bpm', 'Heart rate', 'bpm', 0], ['rr_rpm', 'Breathing rate', '/min', 1], ['rmssd_ms', 'HRV (RMSSD)', 'ms', 0], ['perclos_pct', 'PERCLOS', '%', 1], ['blink_rate_min', 'Blink rate', '/min', 0], ['facial_tension', 'Facial tension', '/100', 0], ['head_stability_pct', 'Head stability', '%', 0], ['wellbeing_index', 'Wellbeing index', '/100', 0]];
    return `<div class="grid g-4">${tiles.map(([k, l, u, d]) => {
      const v = f[k], bv = b[k], dlt = fin(v) && fin(bv) && bv ? (v - bv) / Math.abs(bv) * 100 : null;
      return `<div class="kpi"><span class="eyebrow">${esc(l)}</span><span class="kv">${fin(v) ? U.fmt(v, d) : '—'} <span class="small muted">${u}</span></span><span class="kd ${!fin(dlt) ? 'flat' : Math.abs(dlt) < 5 ? 'flat' : dlt > 0 ? 'up' : 'down'}">${fin(dlt) ? `${U.sgn(dlt, 0)} % vs baseline (${U.fmt(bv, d)})` : 'no baseline yet'}</span></div>`;
    }).join('')}</div>`;
  }

  /* ---------- in-session evolution (minute by minute) ---------- */
  function sessionCharts(el, s) {
    const m = s.minutes || [], labels = m.map(x => `min ${x.minute + 1}`);
    const get = k => m.map(x => x[k]);
    el.innerHTML = `<div class="grid g-2"><div data-c="1"></div><div data-c="2"></div><div data-c="3"></div><div data-c="4"></div></div>`;
    const sum = (k, u) => { const v = get(k).filter(fin); return v.length ? `${ASTRAVITA.engine.label(k)} from ${U.fmt(Math.min(...v), 0)} to ${U.fmt(Math.max(...v), 0)} ${u}` : ''; };
    CH.render($('[data-c="1"]', el), {title: 'Heart and breathing rate by minute', summary: [sum('hr_bpm', 'bpm'), sum('rr_rpm', 'per minute')].filter(Boolean).join('; '), labels, series: [{name: 'Heart rate', unit: 'bpm', data: get('hr_bpm'), color: P.tele, dec: 0}, {name: 'Breathing rate', unit: '/min', data: get('rr_rpm'), color: P.primary, axis: 'y2', dash: true}], y: {label: 'bpm'}, empty: 'No valid pulse readings in this session.'});
    CH.render($('[data-c="2"]', el), {title: 'Stress, wellbeing and fatigue by minute', summary: [sum('stress_index', ''), sum('wellbeing_index', '')].join('; '), labels, series: [{name: 'Wellbeing index', data: get('wellbeing_index'), color: P.primary, dec: 0}, {name: 'Stress index', data: get('stress_index'), color: P.warn, dec: 0}, {name: 'Fatigue x20', data: get('fatigue_level').map(v => fin(v) ? v * 20 : null), color: P.violet, dash: true, dec: 0}], y: {min: 0, max: 100, label: '0-100'}});
    CH.render($('[data-c="3"]', el), {title: 'Eye closure and facial tension by minute', summary: [sum('perclos_pct', '%'), sum('facial_tension', '')].join('; '), labels, series: [{name: 'PERCLOS', unit: '%', data: get('perclos_pct'), color: P.violet, dec: 1}, {name: 'Facial tension', unit: '/100', data: get('facial_tension'), color: P.gold, axis: 'y2', dec: 0}], y: {min: 0, label: '%'}});
    CH.render($('[data-c="4"]', el), {title: 'Facial expressions by minute', summary: 'Share of each expression per minute', labels, series: [['neutral', P.slate], ['happy', P.primary], ['sad', P.tele], ['angry', P.bad], ['fear', P.violet], ['surprise', P.gold], ['disgust', P.warn]].map(([k, c]) => ({name: ASTRAVITA.live.EMO_LABEL[k], unit: '%', data: get('emotion_' + k + '_pct'), color: c, dec: 0, dash: k === 'neutral'})), y: {min: 0, max: 100, label: '%'}});
  }

  /* ---------- weekly summary ---------- */
  function weekly(el, sessions, {offset = 0, onOffset} = {}) {
    const W = AN.weekModel(sessions, offset), Pw = AN.weekModel(sessions, offset + 1), K = AN.weekKpis(W, Pw);
    const labels = W.days.map(d => U.dateLong(d.date));
    const delta = k => { if (!fin(k.v)) return '<span class="kd flat">no data</span>'; if (!fin(k.p)) return '<span class="kd flat">no previous week</span>'; const d = k.v - k.p, good = k.better === 'up' ? d > 0 : k.better === 'down' ? d < 0 : null; return `<span class="kd ${Math.abs(d) < 0.05 * (Math.abs(k.p) || 1) ? 'flat' : good ? 'down' : good === false ? 'up' : 'flat'}">${U.sgn(d, k.key === 'fatigue_level' ? 1 : 0)} vs previous week</span>`; };
    // 8-week accumulation
    const weeks = []; for (let i = 7; i >= 0; i--) { const M = AN.weekModel(sessions, offset + i); const v = M.days.map(d => d.wellbeing_index).filter(fin); weeks.push({label: U.dateShort(M.start), minutes: M.days.reduce((a, d) => a + d.minutes, 0), wb: v.length ? U.mean(v) : null}); }
    el.innerHTML = `<div class="row between" style="margin-bottom:12px"><b>${esc(U.dateShort(W.start))} – ${esc(U.dateShort(U.addDays(W.end, -1)))}</b><div class="row"><button class="btn sm" type="button" data-w="+1">${icon('back', 's16')}Previous week</button><button class="btn sm" type="button" data-w="-1" ${offset === 0 ? 'disabled' : ''}>Next week${icon('arrow', 's16')}</button></div></div>
      <div class="grid g-3" style="margin-bottom:16px">${K.map(k => `<div class="kpi"><span class="eyebrow">${esc(k.label)}</span><span class="kv">${fin(k.v) ? U.fmt(k.v, k.key === 'fatigue_level' ? 1 : 0) : '—'} <span class="small muted">${esc(k.unit)}</span></span>${delta(k)}</div>`).join('')}</div>
      <div class="grid g-2"><div data-c="w1"></div><div data-c="w2"></div><div data-c="w3"></div><div data-c="w4"></div></div>`;
    CH.render($('[data-c="w1"]', el), {title: 'Daily indices this week', summary: 'Daily average wellbeing, stress and fatigue', labels, series: [{name: 'Wellbeing', data: W.days.map(d => d.wellbeing_index), color: P.primary, dec: 0}, {name: 'Stress', data: W.days.map(d => d.stress_index), color: P.warn, dec: 0}, {name: 'Fatigue x20', data: W.days.map(d => fin(d.fatigue_level) ? d.fatigue_level * 20 : null), color: P.violet, dash: true, dec: 0}], y: {min: 0, max: 100}, empty: 'No sessions this week.'});
    CH.render($('[data-c="w2"]', el), {title: 'Daily vital signs this week', summary: 'Daily average heart rate, breathing rate and PERCLOS', labels, series: [{name: 'Heart rate', unit: 'bpm', data: W.days.map(d => d.hr_bpm), color: P.tele, dec: 0}, {name: 'Breathing rate', unit: '/min', data: W.days.map(d => d.rr_rpm), color: P.primary, dec: 1, axis: 'y2'}, {name: 'PERCLOS', unit: '%', data: W.days.map(d => d.perclos_pct), color: P.violet, dec: 1, axis: 'y2', dash: true}], empty: 'No vital-sign readings this week.'});
    CH.render($('[data-c="w3"]', el), {title: 'Minutes monitored per day', summary: `Total ${U.fmt(W.days.reduce((a, d) => a + d.minutes, 0), 0)} minutes this week`, labels, series: [{name: 'Minutes monitored', unit: 'min', data: W.days.map(d => d.minutes || null), color: P.primary, type: 'bar', dec: 0}], y: {min: 0}, empty: 'No sessions this week.'});
    CH.render($('[data-c="w4"]', el), {title: 'Last 8 weeks', summary: 'Minutes monitored and average wellbeing per week', labels: weeks.map(w => w.label), series: [{name: 'Minutes', unit: 'min', data: weeks.map(w => w.minutes || null), color: P.tele, type: 'bar', dec: 0}, {name: 'Avg wellbeing', unit: '/100', data: weeks.map(w => w.wb), color: P.primary, axis: 'y2', dec: 0}], y: {min: 0}, y2: {min: 0, max: 100}});
    $$('[data-w]', el).forEach(b => b.addEventListener('click', () => onOffset?.(Math.max(0, offset + Number(b.dataset.w)))));
  }

  /* ---------- history table ---------- */
  function historyTable(list, {link}) {
    if (!list.length) return UI.empty('clock', 'No sessions yet', 'Sessions appear here after you finish a monitoring session.');
    const total = list.reduce((a, s) => a + (s.duration_s || 0), 0);
    return `<p class="small muted" style="margin-bottom:8px"><b>${list.length}</b> ${list.length === 1 ? 'session' : 'sessions'} · total time monitored <b class="mono">${U.duration(total)}</b></p>
      <div class="table-wrap"><table class="data"><thead><tr><th scope="col">Date</th><th scope="col">Duration</th><th scope="col">Source</th><th scope="col">Quality</th><th scope="col">Status</th><th scope="col">Summary</th><th scope="col"><span class="sr-only">Open</span></th></tr></thead><tbody>
      ${list.map(s => `<tr><td>${esc(U.dateTime(s.start))}</td><td class="num">${esc(U.duration(s.duration_s))}</td><td>${srcChip(s)}</td><td class="num">${U.fmt(s.quality_pct, 0)} %</td><td>${UI.statusChip(statusOf(s))}</td><td class="small">${esc(s.summary || '')}</td><td><a class="btn sm" href="${link(s)}" aria-label="Open session from ${esc(U.dateTime(s.start))}">Open</a></td></tr>`).join('')}
      </tbody></table></div>`;
  }

  /* ---------- questionnaire dialog ---------- */
  function questionnaire(prev = null) {
    const Q = KB.get().questionnaire, core = ['q_mood_low', 'q_anhedonia', 'q_nervous', 'q_worry', 'q_sleep_quality', 'q_sleep_hours', 'q_sleepiness', 'q_lonely', 'q_workload'];
    const item = it => {
      const name = it.id, val = prev?.[name];
      if (it.type === 'number') return `<div class="field"><label for="qq-${name}">${esc(it.text)}</label><input class="input" id="qq-${name}" name="${name}" type="number" inputmode="decimal" min="${it.min ?? 0}" max="${it.max ?? 24}" step="0.5" value="${fin(val) ? val : ''}" style="max-width:160px"></div>`;
      return `<fieldset class="field" style="border:0;padding:0;margin:0"><legend class="label" style="font-size:13px;font-weight:600;color:var(--slate);margin-bottom:6px">${esc(it.text)}</legend><div class="row" style="gap:6px">${(it.options || []).map(o => `<label class="chip" style="cursor:pointer;min-height:44px;text-transform:none;letter-spacing:0;font-weight:600;font-size:12px"><input type="radio" name="${name}" value="${o.value}" ${val === o.value ? 'checked' : ''} style="accent-color:var(--primary)"> ${esc(o.label)}</label>`).join('')}</div></fieldset>`;
    };
    return new Promise(res => {
      const d = document.createElement('dialog'); d.className = 'wide'; d.setAttribute('aria-labelledby', 'qq-title');
      const items = Q.items.filter(i => core.includes(i.id)), more = Q.items.filter(i => !core.includes(i.id));
      d.innerHTML = `<form method="dialog" id="qq-form"><div class="dlg-head"><div><h2 id="qq-title">Short check-in (optional)</h2><p class="small muted">${esc(Q.instructions || '')}</p></div><button class="icon-btn" value="skip" aria-label="Close without answering">${icon('x')}</button></div>
        <div class="dlg-body">${items.map(item).join('')}
          <details><summary class="link-btn" style="min-height:44px;display:flex;align-items:center">More questions (sleep, body, social, mission)</summary><div class="stack" style="margin-top:12px">${more.map(item).join('')}</div></details>
          <div class="notice tele">${icon('heart')}<div>${item(Q.safety_item)}<p class="small muted" style="margin-top:6px">If you answer yes, ASTRAVITA shows support options right away and, if you are linked to a flight surgeon, flags your session so they can check in with you.</p></div></div>
        </div>
        <div class="dlg-foot"><button class="btn" value="skip">Skip questionnaire</button><button class="btn primary" value="save" id="qq-save">Save answers</button></div></form>`;
      document.body.append(d);
      d.addEventListener('close', () => {
        if (d.returnValue !== 'save') { res(null); d.remove(); return; }
        const fd = new FormData($('#qq-form', d)), ans = {};
        for (const it of [...Q.items, Q.safety_item]) { const v = fd.get(it.id); if (v !== null && v !== '') { const n = Number(v); if (fin(n)) ans[it.id] = n; } }
        res(Object.keys(ans).length ? ans : null); d.remove();
      }, {once: true});
      d.showModal();
    });
  }

  /* ---------- support protocol (calm, never alarmist) ---------- */
  function support({doctor} = {}) {
    const d = document.createElement('dialog'); d.setAttribute('aria-labelledby', 'sp-title'); d.setAttribute('role', 'alertdialog');
    d.innerHTML = `<form method="dialog"><div class="dlg-head"><h2 id="sp-title">${icon('heart')} You do not have to go through this alone</h2></div>
      <div class="dlg-body">
        <p>Thank you for answering honestly. What you are feeling matters, and support is available right now.</p>
        <ol style="display:grid;gap:10px;padding-left:20px;margin:0">
          <li><b>Contact your flight surgeon or the behavioral health team now.</b> ${doctor ? `Your linked flight surgeon is <b>${esc(doctor)}</b>; your session has been flagged so they can check in with you.` : 'Use your mission’s private medical conference channel.'}</li>
          <li><b>Tell a crew member you trust</b> that you would like some company right now.</li>
          <li><b>If you are on Earth and in immediate danger,</b> call your local emergency number (911 in the United States and Costa Rica, 112 in the European Union). In the United States you can also call or text <b>988</b> (Suicide &amp; Crisis Lifeline). Elsewhere, find a local helpline at <a href="https://findahelpline.com" target="_blank" rel="noopener noreferrer">findahelpline.com</a>.</li>
        </ol>
        <p class="small muted">ASTRAVITA does not diagnose. This message appears whenever the safety question is answered with yes.</p>
      </div>
      <div class="dlg-foot"><button class="btn primary" value="ok">I understand</button></div></form>`;
    document.body.append(d); d.addEventListener('close', () => d.remove(), {once: true}); d.showModal();
  }

  /* ---------- printable report ---------- */
  function report(s, profile) {
    const f = s.features || {}, r = s.result || {};
    const rows = [['Heart rate', f.hr_bpm, 'bpm'], ['HRV (RMSSD)', f.rmssd_ms, 'ms'], ['Breathing rate', f.rr_rpm, '/min'], ['Blink rate', f.blink_rate_min, '/min'], ['PERCLOS', f.perclos_pct, '%'], ['Yawns', f.yawn_per_10min, 'per 10 min'], ['Facial tension', f.facial_tension, '/100'], ['Head stability', f.head_stability_pct, '%'], ['Micro-expressions', f.microexpr_min, '/min'], ['Wellbeing index', f.wellbeing_index, '/100'], ['Stress index', f.stress_index, '/100'], ['Signal quality', f.signal_quality, '/100']];
    return `<h1>ASTRAVITA — session report</h1><p>${esc(profile?.display_name || '')} (${esc(s.subject_id || '')}) · ${esc(U.dateTime(s.start))} · ${esc(U.duration(s.duration_s))} · ${s.simulated ? 'SIMULATED DATA' : esc(SRC_LABEL[s.source] || '')}</p>
      <p><b>Exploratory orientation, not a clinical diagnosis.</b></p><h2>Summary</h2><p>${esc(r.summary || '')}</p>
      <h2>Indicators</h2><table><tr><th>Indicator</th><th>Value</th></tr>${rows.map(([l, v, u]) => `<tr><td>${l}</td><td>${fin(v) ? U.fmt(v, 1) + ' ' + u : '—'}</td></tr>`).join('')}</table>
      <h2>Findings</h2>${(r.findings || []).length ? `<table><tr><th>Pattern</th><th>Score</th><th>Confidence</th><th>Based on</th></tr>${r.findings.map(x => `<tr><td>${esc(x.name)}</td><td>${x.score}/100</td><td>${esc(x.confidence_label)}</td><td>${esc(x.based_on)}</td></tr>`).join('')}</table>` : '<p>No significant findings.</p>'}`;
  }
  return {resultPanel, vsBaseline, sessionCharts, weekly, historyTable, questionnaire, support, cmCard, sources, srcChip, statusOf, report, SRC_LABEL};
})();
