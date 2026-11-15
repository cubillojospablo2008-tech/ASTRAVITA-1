/* =====================================================================
   ASTRAVITA views — cover, sign in / create account, session lock,
   knowledge base browser
   ===================================================================== */
(() => {
  const U = ASTRAVITA.util, {esc, $, $$} = U, {icon} = ASTRAVITA.icons, UI = ASTRAVITA.ui, A = ASTRAVITA.auth, N = ASTRAVITA.notify, D = ASTRAVITA.demo;

  /* ---------- generic face visor (original SVG, no photos of real people) ---------- */
  function visorSVG() {
    const pts = [];
    for (let i = 0; i < 64; i++) { const a = i * 2.39996, r = 92 * Math.sqrt((i + 0.5) / 64); const x = 160 + Math.cos(a) * r * 0.78, y = 158 + Math.sin(a) * r; pts.push(`<circle class="scan-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i % 7 === 0 ? 2.6 : 1.7}" opacity="${(0.45 + (i % 5) * 0.1).toFixed(2)}"/>`); }
    return `<svg viewBox="0 0 320 320" role="img" aria-label="Illustration of a generic face inside a scanning visor">
      <defs><radialGradient id="vbg" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="#F4F8F6"/><stop offset=".7" stop-color="#DCE8E3"/><stop offset="1" stop-color="#102C28"/></radialGradient>
      <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E9DCCF"/><stop offset="1" stop-color="#D2BFAE"/></linearGradient>
      <linearGradient id="scanG" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#39A9DB" stop-opacity="0"/><stop offset=".5" stop-color="#39A9DB" stop-opacity=".55"/><stop offset="1" stop-color="#39A9DB" stop-opacity="0"/></linearGradient>
      <clipPath id="vc"><circle cx="160" cy="160" r="156"/></clipPath></defs>
      <g clip-path="url(#vc)"><rect width="320" height="320" fill="url(#vbg)"/>
        <path d="M70 330c6-58 44-84 90-84s84 26 90 84z" fill="#2F4F48"/>
        <rect x="140" y="214" width="40" height="40" rx="12" fill="#D2BFAE"/>
        <ellipse cx="160" cy="150" rx="70" ry="90" fill="url(#skin)"/>
        <path d="M90 128c4-56 34-80 70-80s66 24 70 80c-10-26-34-40-70-40s-60 14-70 40z" fill="#3B2F2A"/>
        <g fill="none" stroke="#4A3B33" stroke-width="3" stroke-linecap="round"><path d="M118 126q14-8 28 0"/><path d="M174 126q14-8 28 0"/></g>
        <ellipse cx="132" cy="144" rx="10" ry="5.5" fill="#fff"/><ellipse cx="188" cy="144" rx="10" ry="5.5" fill="#fff"/>
        <circle cx="132" cy="144" r="4" fill="#2C3E50"/><circle cx="188" cy="144" r="4" fill="#2C3E50"/>
        <path d="M160 150v26l-8 6h16" fill="none" stroke="#B59C8A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M140 200q20 12 40 0" fill="none" stroke="#9C5E55" stroke-width="3.5" stroke-linecap="round"/>
        <g>${pts.join('')}</g>
        <g fill="none" stroke="#39A9DB" stroke-width="1.2" opacity=".8"><ellipse cx="160" cy="150" rx="74" ry="94" stroke-dasharray="3 4"/><path d="M118 144h28M174 144h28M160 150v30M140 200h40"/></g>
        <rect class="scan-line" x="40" y="150" width="240" height="26" fill="url(#scanG)"/>
        <g font-family="JetBrains Mono, monospace" font-size="9" fill="#fff"><rect x="96" y="40" width="70" height="16" rx="4" fill="rgba(16,44,40,.75)"/><text x="102" y="51">478 PTS</text><rect x="180" y="40" width="58" height="16" rx="4" fill="rgba(16,44,40,.75)"/><text x="186" y="51">LOCAL</text>
        <rect x="104" y="270" width="112" height="16" rx="4" fill="rgba(20,125,82,.85)"/><text x="112" y="281">SCAN · ON-DEVICE</text></g>
      </g><circle cx="160" cy="160" r="156" fill="none" stroke="#C9D8D1" stroke-width="2"/></svg>`;
  }

  UI.views.cover = (root) => {
    document.title = 'ASTRAVITA — Behavioral health for long-duration missions';
    document.documentElement.style.setProperty('--banner-h', '0px');
    root.innerHTML = `<div class="cover">
      <header class="cover-top"><div class="inner"><a class="brand" href="#/cover" aria-label="ASTRAVITA"><img src="${UI.LOGO()}" alt="" width="125" height="40" style="height:40px"><span class="wm"><b>ASTRAVITA</b><span>Behavioral health telemetry</span></span></a>
        <a class="btn" href="#/auth">${icon('user')}Sign in</a></div></header>
      <main class="cover-main" id="view" tabindex="-1">
        <section aria-labelledby="hero-title">
          <div class="cover-kicker"><span class="tagbox"><img src="${UI.LOGO()}" alt="" width="56" height="18"><b class="small" style="letter-spacing:.06em">ASTRAVITA</b></span><span class="sep" aria-hidden="true"></span><span class="eyebrow">Crew behavioral health · isolated &amp; confined missions</span></div>
          <h1 class="hero" id="hero-title">Exploration.<em>Protected.</em></h1>
          <p class="tracked">Early signals · calm guidance · private by design</p>
          <p class="hero-lead">ASTRAVITA helps crew members on long missions notice early signs of stress, low mood, fatigue, poor sleep and isolation. It reads facial expressions and optical vital signs on this device, compares them with your own baseline and a curated knowledge base, and suggests practical countermeasures and when to talk to your flight surgeon.</p>
          <div class="row"><a class="btn primary lg" href="#/auth">Enter ASTRAVITA ${icon('arrow')}</a><span class="chip ok">${icon('lock')}Video never leaves this device</span></div>
          <div class="facts">
            <div><h3><span class="dot ok"></span>Early signals</h3><p>Heart rate, breathing, blinks, PERCLOS, facial tension, expressions and micro-expressions, compared with your personal baseline.</p></div>
            <div><h3><span class="dot tele"></span>Calm guidance</h3><p>Explainable orientation with probable causes, countermeasures and clear escalation criteria. Never a diagnosis.</p></div>
          </div>
        </section>
        <section class="visor-card" aria-label="Face scanning preview">
          <div class="vtop"><span>Facial scan · preview</span><span>On-device</span></div>
          <div class="visor">${visorSVG()}</div>
          <div class="biocard"><div><b>Crew biometrics · point scan</b><p class="small muted">Face mesh · rPPG · expressions · fatigue cues</p></div><span class="chip ok"><span class="dot live"></span>Ready</span></div>
        </section>
      </main>
      <footer class="cover-foot"><div class="inner"><span><span class="dot ok" style="display:inline-block;margin-right:6px"></span>System ready · local processing</span><span>ASTRAVITA © 2026 · Exploratory orientation, not a clinical diagnosis</span></div></footer>
    </div>`;
  };

  /* ---------- auth ---------- */
  const strengthTxt = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];
  UI.views.auth = async (root, r) => {
    document.title = 'Sign in — ASTRAVITA';
    const tab = r.query.get('tab') === 'create' ? 'create' : 'signin';
    root.innerHTML = `
      <header class="app-header"><div class="inner"><a class="brand" href="#/cover" aria-label="ASTRAVITA home"><img src="${UI.LOGO()}" alt="" width="100" height="32"><span class="wm"><b>ASTRAVITA</b><span>Behavioral health telemetry</span></span></a><div class="header-spacer"></div><a class="btn ghost sm" href="#/cover">${icon('back')}Back</a></div></header>
      <main class="auth-wrap" id="view" tabindex="-1"><div class="auth-col">
        <span class="chip ok">${icon('shield')}Private, on-device behavioral health monitoring</span>
        <div class="auth-card">
          <div class="ac-body">
            <div class="ac-head"><div class="brand"><img src="${UI.LOGO()}" alt="" width="100" height="32"><span class="wm"><b>ASTRAVITA</b><span>Crew &amp; flight surgeon access</span></span></div>
              <div class="seg" role="tablist" aria-label="Access mode"><button role="tab" id="tab-signin" aria-controls="panel-signin" aria-selected="${tab === 'signin'}" type="button">Sign in</button><button role="tab" id="tab-create" aria-controls="panel-create" aria-selected="${tab === 'create'}" type="button">Create account</button></div></div>
            <section id="panel-signin" role="tabpanel" aria-labelledby="tab-signin" ${tab === 'signin' ? '' : 'hidden'}>
              <h1 style="font-size:24px">Welcome back</h1><p class="muted" style="margin:4px 0 16px">Sign in to see your monitoring, results and notes from your care team.</p>
              <form id="f-signin" class="stack" novalidate>
                <div class="field"><label for="si-email">Email address</label><div class="input-wrap">${icon('mail')}<input class="input" id="si-email" name="email" type="email" autocomplete="username" required spellcheck="false" inputmode="email"></div></div>
                <div class="field"><label for="si-pw">Password</label><div class="input-wrap">${icon('lock')}<input class="input" id="si-pw" name="password" type="password" autocomplete="current-password" required><button class="icon-btn ghost reveal" type="button" data-reveal="si-pw" aria-label="Show password" aria-pressed="false" style="border:0;background:transparent">${icon('eye')}</button></div></div>
                <p class="err small" id="si-err" role="alert" style="color:var(--bad-ink)"></p>
                <button class="btn primary lg block" type="submit" id="si-btn">Sign in ${icon('arrow')}</button>
                <p class="small muted">Forgot your password? Your data is encrypted with it, so it cannot be recovered. Create a new account, or ask your flight surgeon to re-link you.</p>
              </form>
            </section>
            <section id="panel-create" role="tabpanel" aria-labelledby="tab-create" ${tab === 'create' ? '' : 'hidden'}>
              <h1 style="font-size:24px">Create your account</h1><p class="muted" style="margin:4px 0 16px">Choose your role. It cannot be changed later; to use a different role, sign out and create another account.</p>
              <form id="f-create" class="stack" novalidate>
                <fieldset style="border:0;padding:0;margin:0"><legend class="label" style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--slate)">I am a</legend>
                  <div class="role-cards">
                    <label class="role-card"><input type="radio" name="role" value="patient" required><b>${icon('user')}Patient (crew member)</b><span>Monitor yourself, see your results and your flight surgeon's notes.</span></label>
                    <label class="role-card"><input type="radio" name="role" value="doctor"><b>${icon('steth')}Doctor (flight surgeon)</b><span>Supervise crew members who authorize you, write notes and assign countermeasures.</span></label>
                  </div></fieldset>
                <div class="field"><label for="cr-name">Full name</label><div class="input-wrap">${icon('badge')}<input class="input" id="cr-name" name="name" autocomplete="name" required maxlength="80"></div></div>
                <div class="grid g-2"><div class="field"><label for="cr-title">Role on the mission <span class="muted">(optional)</span></label><input class="input" id="cr-title" name="title" maxlength="60" placeholder="e.g. Flight engineer"></div>
                  <div class="field"><label for="cr-mission">Mission <span class="muted">(optional)</span></label><input class="input" id="cr-mission" name="mission" maxlength="60" placeholder="e.g. Lunar Gateway expedition"></div></div>
                <div class="field"><label for="cr-email">Email address</label><div class="input-wrap">${icon('mail')}<input class="input" id="cr-email" name="email" type="email" autocomplete="email" required spellcheck="false" inputmode="email"></div></div>
                <div class="field"><div class="row between"><label for="cr-pw">Password</label><span class="small muted" id="cr-strength-txt">Strength: —</span></div>
                  <div class="input-wrap">${icon('lock')}<input class="input" id="cr-pw" name="password" type="password" autocomplete="new-password" required minlength="8" aria-describedby="cr-reqs"><button class="icon-btn reveal" type="button" data-reveal="cr-pw" aria-label="Show password" aria-pressed="false" style="border:0;background:transparent">${icon('eye')}</button></div>
                  <div class="strength" id="cr-strength" data-n="0" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
                  <ul class="reqs" id="cr-reqs" aria-label="Password requirements"><li data-r="len">${icon('check', 's16')}8+ characters</li><li data-r="upper">${icon('check', 's16')}One uppercase letter</li><li data-r="symbol">${icon('check', 's16')}One symbol</li></ul></div>
                <label class="check"><input type="checkbox" name="terms" required><span>I understand that ASTRAVITA is an exploratory tool that does not diagnose, that my data is stored encrypted on this device, and that I can delete it at any time.</span></label>
                <p class="err small" id="cr-err" role="alert" style="color:var(--bad-ink)"></p>
                <button class="btn primary lg block" type="submit" id="cr-btn">Create account ${icon('arrow')}</button>
              </form>
            </section>
          </div>
          <div class="ac-foot"><span class="row" style="gap:8px">${icon('shield', 's16')}<span>Passwords are never stored. They derive your encryption key on this device (PBKDF2, 600,000 iterations).</span></span></div>
        </div>
        <details class="demo-accounts card tight" id="demo-box" open>
          <summary>${icon('flask')}Demo accounts <span class="chip sim">Simulated data</span></summary>
          <p class="small muted">Fictional crew of a simulated isolation analog with 8 weeks of history. New real accounts start empty and never see this data.</p>
          <div id="demo-status" class="loading-block" hidden><span class="spinner" aria-hidden="true"></span><span id="demo-status-txt">Preparing demo accounts…</span></div>
          <div class="demo-list" id="demo-list"></div>
          <div class="row" style="margin-top:12px"><button class="btn sm" type="button" id="demo-reset">${icon('refresh')}Reset demo data</button></div>
        </details>
        <div class="trust"><span>${icon('lock', 's16')}Encrypted on this device</span><span>${icon('eye-off', 's16')}Video never leaves this device</span><span>${icon('info', 's16')}Not a clinical diagnosis</span></div>
      </div></main>`;

    // tabs
    const tabs = $$('[role="tab"]', root);
    const select = id => { tabs.forEach(t => { const on = t.id === id; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; $('#' + t.getAttribute('aria-controls'), root).hidden = !on; }); };
    tabs.forEach(t => { t.tabIndex = t.getAttribute('aria-selected') === 'true' ? 0 : -1; t.addEventListener('click', () => select(t.id)); t.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const o = tabs[(tabs.indexOf(t) + 1) % 2]; select(o.id); o.focus(); } }); });
    // reveal
    $$('[data-reveal]', root).forEach(b => b.addEventListener('click', () => { const inp = $('#' + b.dataset.reveal, root), show = inp.type === 'password'; inp.type = show ? 'text' : 'password'; b.setAttribute('aria-pressed', show); b.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); b.innerHTML = icon(show ? 'eye-off' : 'eye'); }));
    // strength meter
    const pw = $('#cr-pw', root);
    pw.addEventListener('input', () => { const c = A.passwordChecks(pw.value), n = A.strength(pw.value); $('#cr-strength', root).dataset.n = n; $('#cr-strength-txt', root).textContent = 'Strength: ' + (pw.value ? strengthTxt[n] : '—'); $$('#cr-reqs li', root).forEach(li => li.dataset.ok = !!c[li.dataset.r]); });
    const after = () => { const a = sessionStorage.getItem('astravita:after-login'); sessionStorage.removeItem('astravita:after-login'); const c = A.current(); return a && a.startsWith('#/' + c.user.role + '/') ? a : UI.home(); };
    $('#f-signin', root).addEventListener('submit', async e => {
      e.preventDefault(); const f = e.target, err = $('#si-err', root), btn = $('#si-btn', root);
      err.textContent = '';
      if (!f.email.value.trim() || !f.password.value) { err.textContent = 'Enter your email and password.'; return; }
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Checking…';
      try { await A.signIn(f.email.value, f.password.value); N.toast('Signed in. Welcome back.', 'ok'); UI.go(after()); }
      catch (x) { err.textContent = x.message; btn.disabled = false; btn.innerHTML = `Sign in ${icon('arrow')}`; f.password.select(); }
    });
    $('#f-create', root).addEventListener('submit', async e => {
      e.preventDefault(); const f = e.target, err = $('#cr-err', root), btn = $('#cr-btn', root);
      err.textContent = '';
      const role = f.role.value, c = A.passwordChecks(f.password.value);
      if (!role) return err.textContent = 'Choose whether you are a crew member or a flight surgeon.';
      if (!f.name.value.trim()) return err.textContent = 'Enter your name.';
      if (!f.email.checkValidity()) return err.textContent = 'Enter a valid email address.';
      if (!c.len || !c.upper || !c.symbol) return err.textContent = 'Your password needs 8+ characters, an uppercase letter and a symbol.';
      if (!f.terms.checked) return err.textContent = 'Please confirm that you understand how ASTRAVITA works.';
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Creating your encrypted account…';
      try {
        await A.register({email: f.email.value, password: f.password.value, name: f.name.value, role, title: f.title.value, mission: f.mission.value});
        await A.signIn(f.email.value, f.password.value);
        N.toast('Account created. Your data is encrypted on this device.', 'ok', 6000); UI.go(UI.home());
      } catch (x) { err.textContent = x.message; btn.disabled = false; btn.innerHTML = `Create account ${icon('arrow')}`; }
    });

    // demo accounts
    const list = $('#demo-list', root);
    const paint = (ready) => {
      list.innerHTML = D.accounts().map(a => `<div class="demo-item"><span class="avatar" aria-hidden="true">${esc(U.initials(a.name))}</span><div class="meta"><b>${esc(a.name)} · ${a.role === 'doctor' ? 'Flight surgeon' : esc(a.title)}</b>${a.blurb ? esc(a.blurb) + ' · ' : ''}<code>${esc(a.email)}</code> · <code>${esc(a.password)}</code></div><button class="btn sm" type="button" data-use="${esc(a.email)}" ${ready ? '' : 'disabled'}>Use</button></div>`).join('');
      $$('[data-use]', list).forEach(b => b.addEventListener('click', () => { const a = D.accounts().find(x => x.email === b.dataset.use); select('tab-signin'); const f = $('#f-signin', root); f.email.value = a.email; f.password.value = a.password; f.requestSubmit(); }));
    };
    const st = $('#demo-status', root), stt = $('#demo-status-txt', root);
    const ensure = async (force) => {
      paint(false); st.hidden = false; $('#demo-reset', root).disabled = true;
      try {
        if (force || !(await D.seeded())) await D.seed((p, msg) => { stt.textContent = `${msg}… ${Math.round(p * 100)}%`; });
        st.hidden = true; paint(true); if (force) N.toast('Demo data was reset to its original state.', 'ok');
      } catch (x) { console.error(x); stt.textContent = 'Demo accounts could not be prepared: ' + x.message; }
      finally { $('#demo-reset', root).disabled = false; }
    };
    $('#demo-reset', root).addEventListener('click', async () => { if (await N.confirm({title: 'Reset demo data?', body: 'All changes made inside the demo accounts (sessions, notes, links) will be replaced by the original simulated data. Real accounts are not affected.', ok: 'Reset demo data'})) ensure(true); });
    ensure(false);
  };

  /* ---------- lock screen (page reload with a live session) ---------- */
  UI.views.lock = (root) => {
    const s = A.pendingSession();
    document.title = 'Unlock — ASTRAVITA';
    root.innerHTML = `<header class="app-header"><div class="inner"><a class="brand" href="#/cover"><img src="${UI.LOGO()}" alt="" width="100" height="32"><span class="wm"><b>ASTRAVITA</b></span></a></div></header>
      <main class="auth-wrap" id="view" tabindex="-1"><div class="auth-col"><div class="auth-card"><div class="ac-body">
        <span class="avatar lg" aria-hidden="true">${esc(U.initials(s?.name))}</span>
        <h1 style="font-size:22px">Unlock your session</h1>
        <p class="muted">For your privacy, encryption keys are kept only in memory. Enter your password to continue as <b>${esc(s?.name || '')}</b>.</p>
        <form id="f-unlock" class="stack"><input type="text" name="username" autocomplete="username" hidden value=""><div class="field"><label for="un-pw">Password</label><input class="input" id="un-pw" type="password" autocomplete="current-password" required></div>
          <p class="small" id="un-err" role="alert" style="color:var(--bad-ink)"></p>
          <div class="row"><button class="btn primary" type="submit" id="un-btn">Unlock</button><button class="btn" type="button" id="un-out">Sign out</button></div></form>
      </div></div></div></main>`;
    $('#un-pw', root).focus();
    $('#f-unlock', root).addEventListener('submit', async e => {
      e.preventDefault(); const b = $('#un-btn', root); b.disabled = true;
      try { await A.unlock($('#un-pw', root).value); UI.render(); } catch (x) { $('#un-err', root).textContent = x.message; b.disabled = false; }
    });
    $('#un-out', root).addEventListener('click', () => { A.signOut(); UI.go('#/cover'); });
  };

  /* ---------- knowledge base ---------- */
  UI.views.knowledge = (root, r) => {
    document.title = 'Knowledge base — ASTRAVITA';
    const kb = ASTRAVITA.kb.get(), q = (r.query.get('q') || '').toLowerCase();
    const src = list => `<ul class="src-list">${(list || []).map(s => `<li>${esc(s.title)}${s.year ? ' (' + esc(s.year) + ')' : ''}${s.url && /^https?:/.test(s.url) ? ` — <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">source</a>` : s.url ? ` — <span class="mono">${esc(s.url.replace('local:', 'local file: '))}</span>` : ''}</li>`).join('')}</ul>`;
    const cond = c => `<details class="kb-entry" id="kb-${esc(c.id)}"><summary><span>${esc(c.name)}</span><span class="chip">${esc(c.category.replace('_', ' '))}</span></summary><div>
      <p>${esc(c.summary)}</p><p><b>Orientation:</b> ${esc(c.orientative_interpretation)}</p>
      <p><b>Why it matters in isolation:</b> ${esc(c.isolation_relevance)}</p>
      <div><b>Probable causes</b><ul>${(c.probable_causes || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div><b>Indicator rules (weights)</b><div class="table-wrap"><table class="data"><thead><tr><th>Indicator</th><th>Rule</th><th>Weight</th><th>Note</th></tr></thead><tbody>${c.indicator_rules.map(x => `<tr><td>${esc(ASTRAVITA.engine.label(x.indicator))}</td><td class="mono">${esc(x.op)} ${esc(x.threshold)}${x.ref === 'baseline_pct' ? ' % vs baseline' : ''}</td><td class="num">${esc(x.weight)}</td><td class="small">${esc(x.note || '')}</td></tr>`).join('')}</tbody></table></div></div>
      <p><b>Camera limits:</b> ${esc(c.camera_limits)}</p>
      <p><b>When to escalate:</b> ${esc(c.escalation_criteria)}</p>
      ${c.red_flags?.length ? `<div><b>Red flags</b><ul>${c.red_flags.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      ${c.gate ? `<p class="small muted">${esc(c.gate.note)}</p>` : ''}
      <div><b>Sources</b>${src(c.sources)}</div></div></details>`;
    const cm = c => `<details class="kb-entry" id="kb-${esc(c.id)}"><summary><span>${esc(c.title)}</span><span class="chip ${c.evidence_level === 'high' ? 'ok' : c.evidence_level === 'moderate' ? 'tele' : ''}">${esc(c.category)} · ${esc(c.evidence_level)}</span></summary><div><ol>${c.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol><p class="small muted">Duration: ${esc(c.duration)}</p><div><b>Sources</b>${src(c.sources)}</div></div></details>`;
    const match = (o) => !q || JSON.stringify(o).toLowerCase().includes(q);
    const conds = kb.conditions.filter(match), cms = kb.countermeasures.filter(match);
    const ranges = Object.entries(kb.reference_ranges || {});
    root.innerHTML = UI.shell(`
      <div class="page-head"><div><span class="eyebrow">Reference</span><h1>Knowledge base</h1><p class="lead">The preloaded library that the local engine uses: ${kb.conditions.length} orientation patterns, ${kb.countermeasures.length} countermeasures and reference ranges, each with its sources. Nothing here is a diagnosis.</p></div></div>
      <form class="row" role="search" id="kb-search"><label class="sr-only" for="kb-q">Search the knowledge base</label><input class="input" id="kb-q" type="search" value="${esc(q)}" placeholder="Search patterns, countermeasures, sources…" style="max-width:420px"><button class="btn" type="submit">Search</button></form>
      <section class="card"><div class="card-head"><h2>Orientation patterns <span class="chip">${conds.length}</span></h2></div><div class="stack">${conds.map(cond).join('') || UI.empty('book', 'No matches', 'Try another word.')}</div></section>
      <section class="card lazy"><div class="card-head"><h2>Countermeasures <span class="chip">${cms.length}</span></h2></div><div class="stack">${cms.map(cm).join('') || UI.empty('book', 'No matches', 'Try another word.')}</div></section>
      <section class="card lazy"><div class="card-head"><h2>Reference ranges</h2><p>Population ranges are context only; ASTRAVITA compares mainly with your own baseline.</p></div>
        <div class="table-wrap"><table class="data"><thead><tr><th>Indicator</th><th>Low</th><th>High</th><th>Unit</th><th>Notes</th></tr></thead><tbody>${ranges.map(([k, v]) => `<tr><td>${esc(ASTRAVITA.engine.LABELS[k]?.[0] || k.replace(/_/g, ' '))}</td><td class="num">${esc(v.low ?? '—')}</td><td class="num">${esc(v.high ?? '—')}</td><td>${esc(v.unit || '')}</td><td class="small">${esc(v.notes || '')}${src(v.sources)}</td></tr>`).join('')}</tbody></table></div></section>
      <section class="card lazy"><div class="card-head"><h2>Questionnaire sources</h2></div>${src(kb.questionnaire.sources)}</section>`);
    $('#kb-search', root).addEventListener('submit', e => { e.preventDefault(); UI.go('#/knowledge?q=' + encodeURIComponent($('#kb-q', root).value.trim())); });
    if (r.query.get('open')) { const el = document.getElementById('kb-' + r.query.get('open')); if (el) { el.open = true; setTimeout(() => el.scrollIntoView({block: 'start'}), 50); } }
  };
})();
