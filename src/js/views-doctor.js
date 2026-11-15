/* =====================================================================
   ASTRAVITA views — flight surgeon (doctor): crew triage, alert inbox,
   add crew member, crew member record (notes, countermeasures, exports)
   ===================================================================== */
(() => {
  const U = ASTRAVITA.util, {esc, fin, $, $$} = U, {icon} = ASTRAVITA.icons, UI = ASTRAVITA.ui, A = ASTRAVITA.auth, N = ASTRAVITA.notify;
  const R = ASTRAVITA.render, CH = ASTRAVITA.charts, LK = ASTRAVITA.links, X = ASTRAVITA.export, KB = ASTRAVITA.kb, P = CH.PALETTE;
  const me = () => A.current();

  async function cohort() {
    const links = await LK.forDoctor();
    const active = links.filter(l => l.status === 'accepted'), pending = links.filter(l => l.status === 'pending');
    // decrypt every linked crew member's share and care channel in parallel
    const crew = (await Promise.all(active.map(async l => {
      try {
        const [share, care] = await Promise.all([LK.readShare(l), LK.readCare(l)]); if (!share) return null;
        const sessions = [...(share.sessions || [])].sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
        const last = sessions[0] || null;
        const alerts = (share.alerts || []).map(a => ({...a, review: care.alert_reviews?.[a.id] || null}));
        const open = alerts.filter(a => !a.review);
        const status = !last ? 'none' : open.some(a => a.severity === 'bad') || last.result?.status === 'alert' ? 'alert' : open.length || last.result?.status === 'watch' ? 'watch' : last.result?.insufficient ? 'lowsig' : 'nominal';
        return {link: l, share, care, sessions, last, alerts, open, status};
      } catch (e) { console.warn('[ASTRAVITA] share unreadable', e); return null; }
    }))).filter(Boolean);
    const order = {alert: 0, watch: 1, lowsig: 2, nominal: 3, none: 4};
    crew.sort((a, b) => order[a.status] - order[b.status] || a.share.profile.display_name.localeCompare(b.share.profile.display_name));
    UI.setBadge('alerts', crew.reduce((n, c) => n + c.open.length, 0));
    return {links, crew, pending};
  }
  const tStatus = {alert: 'Alert', watch: 'Observation', lowsig: 'Low signal', nominal: 'Nominal', none: 'No data'};

  /* =============================== CONSOLE =============================== */
  UI.views['doctor/console'] = async (root) => {
    document.title = 'Crew triage — ASTRAVITA';
    root.innerHTML = UI.shell('<div class="loading-block"><span class="spinner"></span>Decrypting shared crew data…</div>');
    const c = me(), {crew, pending} = await cohort();
    const nOpen = crew.reduce((n, x) => n + x.open.length, 0);
    const card = x => {
      const p = x.share.profile, f = x.last?.features || {};
      return `<article class="tcard" data-s="${x.status}"><div class="row between"><div class="row"><span class="avatar" aria-hidden="true">${esc(U.initials(p.display_name))}</span><div><b>${esc(p.display_name)}</b><p class="small muted">${esc(p.title || 'Crew member')} · ${esc(p.subject_id)}</p></div></div><span class="chip ${x.status === 'alert' ? 'bad' : x.status === 'watch' || x.status === 'lowsig' ? 'warn' : x.status === 'nominal' ? 'ok' : ''}">${tStatus[x.status]}</span></div>
        <div class="tc-vitals"><div><b>${fin(f.hr_bpm) ? U.fmt(f.hr_bpm, 0) : '—'}</b><span>HR bpm</span></div><div><b>${fin(f.rr_rpm) ? U.fmt(f.rr_rpm, 0) : '—'}</b><span>RR /min</span></div><div><b>${fin(f.wellbeing_index) ? U.fmt(f.wellbeing_index, 0) : '—'}</b><span>Wellbeing</span></div></div>
        <p class="small">${x.last ? esc(x.last.summary) : 'No sessions shared yet.'}</p>
        <div class="row between small"><span class="muted">${x.last ? 'Last session ' + esc(U.ago(x.last.start)) : ''}${x.share.demo ? ' · <span class="chip sim">Simulated</span>' : ''}</span><span>${x.open.length ? `<b style="color:var(--bad-ink)">${x.open.length} open alert${x.open.length > 1 ? 's' : ''}</b>` : '0 alerts'}</span></div>
        <a class="btn sm" href="#/doctor/patient/${esc(x.link.link_id)}">Open record ${icon('arrow', 's16')}</a></article>`;
    };
    root.innerHTML = UI.shell(`
      <div class="page-head"><div><span class="eyebrow">Flight medical supervision console</span><h1>Crew triage</h1><p class="lead">${esc(c.vault.profile.display_name)} · ${crew.length} linked crew member${crew.length === 1 ? '' : 's'}${pending.length ? ` · ${pending.length} pending request${pending.length === 1 ? '' : 's'}` : ''}. Only crew members who accepted your request appear here.</p></div>
        <div class="actions"><a class="btn" href="#/doctor/alerts">${icon('bell')}Alerts${nOpen ? ` <span class="chip bad">${nOpen}</span>` : ''}</a><button class="btn" type="button" id="dc-csv" ${crew.length ? '' : 'disabled'}>${icon('download')}Export cohort CSV</button><a class="btn primary" href="#/doctor/add">${icon('plus')}Add crew member</a></div></div>
      <div class="notice warn">${icon('info')}<div><strong>Decision support only.</strong> Orientations are produced by preloaded rules for research purposes. Every countermeasure needs your clinical judgement.</div></div>
      ${crew.length ? `<section aria-labelledby="h-tri"><h2 id="h-tri" class="sr-only">Crew members by status</h2><div class="triage">${crew.map(card).join('')}</div></section>` : UI.empty('users', 'No linked crew members yet', 'Ask a crew member for their 8-character linking code and add them. They must accept your request before you see any data.', '<a class="btn primary sm" href="#/doctor/add">Add crew member</a>')}
      ${crew.length ? `<section class="card"><div class="card-head"><div><h2>${icon('trend')}Cohort wellbeing, last 8 weeks</h2><p>Weekly average wellbeing index per crew member.</p></div></div><div id="dc-cohort"></div></section>` : ''}`);
    if (crew.length) {
      const weeks = []; for (let i = 7; i >= 0; i--) weeks.push(U.addDays(U.startOfWeek(new Date()), -7 * i));
      const colors = [P.primary, P.tele, P.warn, P.violet, P.bad, P.gold, P.slate, P.forest];
      CH.render($('#dc-cohort', root), {title: 'Cohort wellbeing by week', summary: 'Weekly mean wellbeing index for each linked crew member', labels: weeks.map(w => U.dateShort(w)), y: {min: 0, max: 100},
        series: crew.slice(0, 8).map((x, i) => ({name: x.share.profile.display_name, color: colors[i], dec: 0, data: weeks.map(w => { const e = U.addDays(w, 7), v = x.sessions.filter(s => Date.parse(s.start) >= w && Date.parse(s.start) < e).map(s => s.features?.wellbeing_index).filter(fin); return v.length ? U.mean(v) : null; })}))});
      $('#dc-csv', root).addEventListener('click', () => { const rows = crew.flatMap(x => X.sessionRows(x.sessions, x.share.profile.subject_id)); UI.download(`astravita-cohort-sessions-${X.stamp()}.csv`, X.csv(rows, X.SESSION_COLS)); });
    }
  };

  /* =============================== ALERTS =============================== */
  UI.views['doctor/alerts'] = async (root, r) => {
    document.title = 'Alert inbox — ASTRAVITA';
    root.innerHTML = UI.shell('<div class="loading-block"><span class="spinner"></span>Loading alerts…</div>');
    const {crew} = await cohort();
    const filter = r.query.get('f') || 'open';
    const all = crew.flatMap(x => x.alerts.map(a => ({...a, x}))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    const list = filter === 'open' ? all.filter(a => !a.review) : all;
    root.innerHTML = UI.shell(`
      <div class="page-head"><div><span class="eyebrow">Clinical events</span><h1>Alert inbox</h1><p class="lead">Events generated by the local engine when a pattern scores 50 or more, or when a crew member asks for support. Review, validate and add notes.</p></div>
        <div class="seg" role="group" aria-label="Filter"><a href="#/doctor/alerts?f=open" aria-pressed="${filter === 'open'}">Open (${all.filter(a => !a.review).length})</a><a href="#/doctor/alerts?f=all" aria-pressed="${filter === 'all'}">All (${all.length})</a></div></div>
      ${list.length ? `<div class="stack">${list.slice(0, 80).map(a => `<article class="alert-item" data-sev="${a.severity}" data-status="${a.review?.status || 'open'}"><div class="row between"><div class="row">${icon(a.kind === 'safety' ? 'heart' : 'alert')}<b>${esc(a.title)}</b></div><span class="chip ${a.review ? 'ok' : a.severity === 'bad' ? 'bad' : 'warn'}">${a.review ? esc(a.review.status) : a.severity === 'bad' ? 'Needs review' : 'Pending'}</span></div>
        <p class="small"><b>${esc(a.x.share.profile.display_name)}</b> (${esc(a.x.share.profile.subject_id)}) · ${esc(U.dateTime(a.at))} · ${esc(a.detail)} ${a.simulated ? '<span class="chip sim">Simulated</span>' : ''}</p>
        ${a.review?.note ? `<p class="small muted">Note: ${esc(a.review.note)}</p>` : ''}
        <div class="row"><a class="btn sm" href="#/doctor/patient/${esc(a.x.link.link_id)}?s=${esc(a.session_id)}">Open session</a>${a.review ? '' : `<button class="btn sm" data-rev="${esc(a.id)}" data-l="${esc(a.x.link.link_id)}" data-st="reviewed">Mark reviewed</button><button class="btn primary sm" data-rev="${esc(a.id)}" data-l="${esc(a.x.link.link_id)}" data-st="validated">${icon('check', 's16')}Validate &amp; note</button>`}</div></article>`).join('')}</div>` : UI.empty('bell', filter === 'open' ? 'No open alerts' : 'No alerts yet', 'Alerts from linked crew members appear here.')}`);
    $$('[data-rev]', root).forEach(b => b.addEventListener('click', async () => {
      const x = crew.find(c => c.link.link_id === b.dataset.l); let note = '';
      if (b.dataset.st === 'validated') { note = await promptText('Validation note', 'Optional note for this event (only you see it).'); if (note === null) return; }
      x.care.alert_reviews = {...(x.care.alert_reviews || {}), [b.dataset.rev]: {status: b.dataset.st, at: new Date().toISOString(), note}};
      await LK.writeCare(x.link, x.care); N.toast('Alert updated.', 'ok'); UI.render();
    }));
  };
  function promptText(title, label, value = '') {
    return new Promise(res => {
      const d = document.createElement('dialog'); d.setAttribute('aria-labelledby', 'pt-t');
      d.innerHTML = `<form method="dialog"><div class="dlg-head"><h2 id="pt-t">${esc(title)}</h2></div><div class="dlg-body"><div class="field"><label for="pt-i">${esc(label)}</label><textarea class="input" id="pt-i" maxlength="2000">${esc(value)}</textarea></div></div><div class="dlg-foot"><button class="btn" value="cancel">Cancel</button><button class="btn primary" value="ok">Save</button></div></form>`;
      document.body.append(d); d.addEventListener('close', () => { res(d.returnValue === 'ok' ? $('#pt-i', d).value.trim() : null); d.remove(); }, {once: true}); d.showModal();
    });
  }

  /* =============================== ADD CREW MEMBER =============================== */
  UI.views['doctor/add'] = async (root) => {
    document.title = 'Add crew member — ASTRAVITA';
    const links = await LK.forDoctor(), pending = links.filter(l => l.status === 'pending'), past = links.filter(l => ['declined', 'revoked', 'cancelled'].includes(l.status));
    root.innerHTML = UI.shell(`
      <div class="page-head"><div><span class="eyebrow">Consent-based linking</span><h1>Add crew member</h1><p class="lead">Enter the crew member’s 8-character linking code. They receive your request and must accept it before you can see any of their data. They can revoke access at any time.</p></div></div>
      <section class="card" style="max-width:640px"><form id="da-form" class="stack" novalidate><div class="field"><label for="da-code">Linking code</label><input class="input mono" id="da-code" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="11" placeholder="e.g. 7KQ2MZPA" style="letter-spacing:.2em;font-size:18px;max-width:280px" required><span class="hint">Letters and numbers; dashes and spaces are ignored.</span></div>
        <p class="small" id="da-err" role="alert" style="color:var(--bad-ink)"></p><div><button class="btn primary" type="submit">${icon('link')}Send request</button></div></form></section>
      <section class="card"><div class="card-head"><h2>Pending requests</h2></div>${pending.length ? `<div class="stack">${pending.map(l => `<div class="row between note"><span>Request sent ${esc(U.ago(l.created_at))} · waiting for the crew member to accept</span><button class="btn sm" data-cancel="${esc(l.link_id)}">Cancel request</button></div>`).join('')}</div>` : UI.empty('link', 'No pending requests', 'Requests waiting for a crew member’s answer appear here.')}</section>
      ${past.length ? `<section class="card"><div class="card-head"><h2>History</h2></div><ul class="small">${past.map(l => `<li>${esc(l.status)} · ${esc(U.dateShort(l.updated_at || l.created_at))}</li>`).join('')}</ul></section>` : ''}`);
    $('#da-form', root).addEventListener('submit', async e => { e.preventDefault(); const err = $('#da-err', root); err.textContent = ''; try { await LK.request(e.target.code.value); N.toast('Request sent. The crew member must accept it in their Care team page.', 'ok', 7000); UI.render(); } catch (x) { err.textContent = x.message; } });
    $$('[data-cancel]', root).forEach(b => b.addEventListener('click', async () => { await LK.cancelRequest(b.dataset.cancel); N.toast('Request cancelled.', 'ok'); UI.render(); }));
  };

  /* =============================== CREW MEMBER RECORD =============================== */
  UI.views['doctor/patient'] = async (root, r) => {
    const linkId = r.parts[2];
    root.innerHTML = UI.shell('<div class="loading-block"><span class="spinner"></span>Decrypting record…</div>');
    const links = await LK.forDoctor(), link = links.find(l => l.link_id === linkId);
    if (!link || link.status !== 'accepted') { root.innerHTML = UI.shell(`${UI.empty('lock', 'Access not authorized', 'This crew member has not authorized you, or revoked access. Only linked crew members can be opened.', '<a class="btn sm" href="#/doctor/console">Back to triage</a>')}`); return; }
    let share, care;
    try { share = await LK.readShare(link); care = await LK.readCare(link); } catch (e) { root.innerHTML = UI.shell(UI.empty('lock', 'Access denied', e.message)); return; }
    if (!share) { root.innerHTML = UI.shell(UI.empty('clock', 'No data shared yet', 'The crew member accepted your request but has not shared any session yet.')); return; }
    const c = me(), p = share.profile, sessions = [...(share.sessions || [])].sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
    document.title = `${p.display_name} — ASTRAVITA`;
    const sel = sessions.find(s => s.id === r.query.get('s')) || sessions[0];
    const priv = c.vault.private_notes?.[link.patient_id] || [];
    const alerts = (share.alerts || []).map(a => ({...a, review: care.alert_reviews?.[a.id] || null})).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    const allNotes = [...care.notes.map(n => ({...n, private: false})), ...priv.map(n => ({...n, private: true}))].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const cmLib = KB.get().countermeasures;
    const tot = sessions.reduce((a, s) => a + (s.duration_s || 0), 0);
    root.innerHTML = UI.shell(`
      <div class="page-head"><div><a class="link-btn small" href="#/doctor/console">${icon('back', 's16')} Crew triage</a><span class="eyebrow" style="display:block;margin-top:6px">${esc(p.title || 'Crew member')} · ${esc(p.subject_id)} · ${esc(p.mission || '')}</span><h1>${esc(p.display_name)}</h1>
        <p class="lead">${esc(U.plural(sessions.length, 'session'))} · ${esc(U.duration(tot))} monitored · shared ${esc(U.ago(share.updated_at))}${share.demo ? ' · <span class="chip sim">Simulated data</span>' : ''}</p></div>
        <div class="actions"><button class="btn" type="button" id="pr-csv">${icon('download')}Sessions CSV</button><button class="btn" type="button" id="pr-min">${icon('download')}Minutes CSV</button><button class="btn" type="button" id="pr-print">${icon('printer')}Print record</button></div></div>
      ${sel ? `<section aria-labelledby="h-cur"><div class="page-head" style="margin-bottom:12px"><div><h2 id="h-cur">Indicators · ${esc(U.dateTime(sel.start))}</h2><p class="lead small">${esc(U.duration(sel.duration_s))} · quality ${U.fmt(sel.quality_pct, 0)} % · ${esc(R.SRC_LABEL[sel.source] || '')}</p></div><div class="actions"><label class="sr-only" for="pr-pick">Choose a session</label><select class="input" id="pr-pick" style="max-width:280px">${sessions.slice(0, 80).map(s => `<option value="${esc(s.id)}" ${s.id === sel.id ? 'selected' : ''}>${esc(U.dateTime(s.start))} · ${esc(s.result?.status || '')}</option>`).join('')}</select></div></div>${R.vsBaseline(sel)}</section>
      <section class="card"><div class="card-head"><div><h2>${icon('info')}Latest orientation</h2><p>${esc(sel.summary || '')}</p></div>${UI.statusChip(R.statusOf(sel))}</div>
        ${sel.questionnaire ? `<p class="small muted" style="margin-bottom:12px">Check-in: PHQ-2 ${(sel.questionnaire.q_mood_low ?? 0) + (sel.questionnaire.q_anhedonia ?? 0)}/6 · GAD-2 ${(sel.questionnaire.q_nervous ?? 0) + (sel.questionnaire.q_worry ?? 0)}/6 · sleep ${fin(sel.questionnaire.q_sleep_hours) ? U.fmt(sel.questionnaire.q_sleep_hours, 1) + ' h' : '—'} · KSS ${sel.questionnaire.q_sleepiness ?? '—'}</p>` : '<p class="small muted" style="margin-bottom:12px">No check-in answers for this session.</p>'}
        ${R.resultPanel(sel, {audience: 'doctor'})}</section>
      <section class="card"><div class="card-head"><h2>${icon('trend')}Evolution within the session</h2></div><div id="pr-session"></div></section>` : UI.empty('clock', 'No sessions yet', 'Sessions appear here once the crew member records them.')}
      <section class="card"><div class="card-head"><h2>${icon('grid')}Weekly summary</h2></div><div id="pr-week"></div></section>
      <div class="grid g-12">
        <section class="card span-7"><div class="card-head"><div><h2>${icon('note')}Notes</h2><p>Shared notes are visible to ${esc(p.display_name)}. Private notes are drafts only you can see.</p></div></div>
          <form id="pr-note" class="stack"><label class="sr-only" for="pr-note-t">New note</label><textarea class="input" id="pr-note-t" maxlength="2000" placeholder="Write a note for this crew member…" required></textarea>
            <div class="row between"><label class="check"><input type="checkbox" id="pr-note-priv"><span>Private note (only visible to me)</span></label><button class="btn primary" type="submit">${icon('plus')}Add note</button></div></form>
          <div class="stack" style="margin-top:14px">${allNotes.length ? allNotes.map(n => `<article class="note" data-private="${n.private}"><div class="n-meta">${n.private ? `<span class="chip">${icon('lock', 's16')}Private</span>` : `<span class="chip ok">${icon('users', 's16')}Shared</span>`}<span>${esc(U.dateTime(n.created_at))}${n.updated_at ? ' · edited' : ''}</span></div><p class="n-text">${esc(n.text)}</p><div class="row"><button class="btn sm" data-edit="${esc(n.id)}" data-priv="${n.private}">${icon('edit', 's16')}Edit</button><button class="btn sm" data-del="${esc(n.id)}" data-priv="${n.private}">${icon('trash', 's16')}Delete</button></div></article>`).join('') : UI.empty('note', 'No notes yet', 'Your notes for this crew member appear here.')}</div></section>
        <section class="card span-5"><div class="card-head"><div><h2>${icon('pill')}Countermeasure prescription</h2><p>Assigned countermeasures appear in the crew member’s Care team page.</p></div></div>
          <form id="pr-cm" class="stack"><div class="field"><label for="pr-cm-id">Countermeasure</label><select class="input" id="pr-cm-id">${['breathing', 'sleep', 'light', 'cognitive', 'social', 'schedule', 'exercise', 'nutrition', 'environment', 'medical'].map(cat => `<optgroup label="${esc(cat)}">${cmLib.filter(x => x.category === cat).map(x => `<option value="${esc(x.id)}">${esc(x.title)}</option>`).join('')}</optgroup>`).join('')}</select></div>
            <div class="field"><label for="pr-cm-note">Instruction (optional)</label><input class="input" id="pr-cm-note" maxlength="200" placeholder="e.g. Before the evening review, 10 min"></div><div><button class="btn primary" type="submit">${icon('plus')}Assign</button></div></form>
          <div class="stack" style="margin-top:14px">${care.countermeasures.length ? care.countermeasures.map(x => `<div class="note"><div class="row between"><b>${esc(KB.countermeasure(x.cm_id)?.title || x.cm_id)}</b><span class="chip ${share.cm_status?.[x.cm_id]?.status === 'done' ? 'ok' : share.cm_status?.[x.cm_id]?.status === 'started' ? 'tele' : ''}">${esc(share.cm_status?.[x.cm_id]?.status === 'done' ? 'Done' : share.cm_status?.[x.cm_id]?.status === 'started' ? 'In progress' : 'Not started')}</span></div><p class="small muted">Assigned ${esc(U.dateShort(x.assigned_at))}${x.note ? ' · ' + esc(x.note) : ''}</p><div><button class="btn sm" data-uncm="${esc(x.id)}">${icon('x', 's16')}Remove</button></div></div>`).join('') : UI.empty('pill', 'Nothing assigned yet', 'Pick a countermeasure from the library.')}</div>
          <div class="notice warn" style="margin-top:12px">${icon('info')}<div class="small">Suggestions come from rules for research use. Validate every prescription clinically.</div></div></section>
      </div>
      <section class="card"><div class="card-head"><h2>${icon('bell')}Alerts</h2><a class="btn sm" href="#/doctor/alerts">Open inbox</a></div>
        ${alerts.length ? `<div class="stack">${alerts.slice(0, 12).map(a => `<div class="alert-item" data-sev="${a.severity}" data-status="${a.review?.status || 'open'}"><div class="row between"><b>${esc(a.title)}</b><span class="chip ${a.review ? 'ok' : a.severity === 'bad' ? 'bad' : 'warn'}">${a.review ? esc(a.review.status) : 'Open'}</span></div><p class="small muted">${esc(U.dateTime(a.at))} · ${esc(a.detail)}</p></div>`).join('')}</div>` : UI.empty('bell', 'No alerts', 'No events for this crew member.')}</section>
      <section class="card"><div class="card-head"><h2>${icon('clock')}Session history</h2></div>${R.historyTable(sessions, {link: s => `#/doctor/patient/${link.link_id}?s=${s.id}`})}</section>`);
    $('#pr-pick', root)?.addEventListener('change', e => UI.go(`#/doctor/patient/${link.link_id}?s=${e.target.value}`));
    if (sel) R.sessionCharts($('#pr-session', root), sel);
    let off = 0; const wk = () => R.weekly($('#pr-week', root), sessions, {offset: off, onOffset: o => { off = o; wk(); }}); wk();
    const saveCare = async () => { await LK.writeCare(link, care); };
    const savePriv = async list => { c.vault.private_notes = {...(c.vault.private_notes || {}), [link.patient_id]: list}; await A.saveVault(); };
    $('#pr-note', root).addEventListener('submit', async e => {
      e.preventDefault(); const t = $('#pr-note-t', root).value.trim(); if (!t) return N.toast('Write the note first.', 'warn');
      const n = {id: U.uid(), text: t, created_at: new Date().toISOString(), updated_at: null, author: c.vault.profile.display_name};
      if ($('#pr-note-priv', root).checked) await savePriv([...priv, {...n, private: true}]); else { care.notes = [...care.notes, n]; await saveCare(); }
      N.toast($('#pr-note-priv', root).checked ? 'Private note saved.' : `Note shared with ${p.display_name}.`, 'ok'); UI.render();
    });
    $$('[data-edit]', root).forEach(b => b.addEventListener('click', async () => {
      const isPriv = b.dataset.priv === 'true', list = isPriv ? priv : care.notes, n = list.find(x => x.id === b.dataset.edit); if (!n) return;
      const t = await promptText('Edit note', isPriv ? 'Private note' : `Shared with ${p.display_name}`, n.text); if (t === null || !t) return;
      n.text = t; n.updated_at = new Date().toISOString(); if (isPriv) await savePriv(list); else await saveCare(); N.toast('Note updated.', 'ok'); UI.render();
    }));
    $$('[data-del]', root).forEach(b => b.addEventListener('click', async () => {
      if (!(await N.confirm({title: 'Delete this note?', body: 'It will be removed permanently' + (b.dataset.priv === 'true' ? '.' : ` and disappear from ${p.display_name}'s account.`), ok: 'Delete', danger: true}))) return;
      if (b.dataset.priv === 'true') await savePriv(priv.filter(x => x.id !== b.dataset.del)); else { care.notes = care.notes.filter(x => x.id !== b.dataset.del); await saveCare(); }
      N.toast('Note deleted.', 'ok'); UI.render();
    }));
    $('#pr-cm', root).addEventListener('submit', async e => { e.preventDefault(); const id = $('#pr-cm-id', root).value; if (care.countermeasures.some(x => x.cm_id === id)) return N.toast('That countermeasure is already assigned.', 'warn'); care.countermeasures = [...care.countermeasures, {id: U.uid(), cm_id: id, assigned_at: new Date().toISOString(), note: $('#pr-cm-note', root).value.trim(), author: c.vault.profile.display_name}]; await saveCare(); N.toast('Countermeasure assigned.', 'ok'); UI.render(); });
    $$('[data-uncm]', root).forEach(b => b.addEventListener('click', async () => { care.countermeasures = care.countermeasures.filter(x => x.id !== b.dataset.uncm); await saveCare(); N.toast('Countermeasure removed.', 'ok'); UI.render(); }));
    $('#pr-csv', root).addEventListener('click', () => UI.download(`astravita-sessions-${p.subject_id}-${X.stamp()}.csv`, X.csv(X.sessionRows(sessions, p.subject_id), X.SESSION_COLS)));
    $('#pr-min', root).addEventListener('click', () => UI.download(`astravita-minutes-${p.subject_id}-${X.stamp()}.csv`, X.csv(X.minuteRows(sessions, p.subject_id), X.MINUTE_COLS)));
    $('#pr-print', root).addEventListener('click', () => UI.print(`${sel ? R.report(sel, p) : ''}<h2>Session history</h2><table><tr><th>Date</th><th>Duration</th><th>Status</th><th>Summary</th></tr>${sessions.slice(0, 60).map(s => `<tr><td>${esc(U.dateTime(s.start))}</td><td>${esc(U.duration(s.duration_s))}</td><td>${esc(s.result?.status || '')}</td><td>${esc(s.summary || '')}</td></tr>`).join('')}</table><h2>Shared notes</h2>${care.notes.map(n => `<p>${esc(U.dateTime(n.created_at))}: ${esc(n.text)}</p>`).join('') || '<p>None</p>'}`, `ASTRAVITA record ${p.subject_id}`));
  };
})();
