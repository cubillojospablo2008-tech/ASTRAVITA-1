/* =====================================================================
   ASTRAVITA.ui — app shell, hash router with role guards, shared components
   ===================================================================== */
ASTRAVITA.ui = (() => {
  const U = ASTRAVITA.util, {esc, $} = U, {icon} = ASTRAVITA.icons, A = ASTRAVITA.auth, N = ASTRAVITA.notify;
  const LOGO = () => document.getElementById('logo-src').getAttribute('src');
  const views = {};
  let renderToken = 0, cleanup = null;

  const NAV = {
    patient: [
      {group: 'Monitoring'},
      {href: '#/patient/dashboard', label: 'Dashboard', icon: 'grid', short: 'Home'},
      {href: '#/patient/monitor', label: 'Monitoring center', icon: 'activity', short: 'Monitor'},
      {href: '#/patient/results', label: 'Results & guidance', icon: 'trend', short: 'Results'},
      {href: '#/patient/history', label: 'History & logbook', icon: 'clock', short: 'History'},
      {group: 'Care'},
      {href: '#/patient/care', label: 'Care team & notes', icon: 'steth', short: 'Care', badge: 'care'},
      {href: '#/knowledge', label: 'Knowledge base', icon: 'book', short: 'Library', hideMobile: true},
      {href: '#/patient/settings', label: 'Settings & privacy', icon: 'sliders', short: 'Settings', hideMobile: true}
    ],
    doctor: [
      {group: 'Supervision'},
      {href: '#/doctor/console', label: 'Crew triage', icon: 'users', short: 'Crew'},
      {href: '#/doctor/alerts', label: 'Alert inbox', icon: 'bell', short: 'Alerts', badge: 'alerts'},
      {href: '#/doctor/add', label: 'Add crew member', icon: 'link', short: 'Add'},
      {group: 'Reference'},
      {href: '#/knowledge', label: 'Knowledge base', icon: 'book', short: 'Library'},
      {href: '#/doctor/settings', label: 'Settings & privacy', icon: 'sliders', short: 'Settings', hideMobile: true}
    ]
  };
  const badges = {care: 0, alerts: 0};
  function setBadge(k, n) { badges[k] = n; document.querySelectorAll(`[data-badge="${k}"]`).forEach(b => { b.textContent = n; b.hidden = !n; b.setAttribute('aria-label', `${n} new`); }); }

  /* ---------- shell ---------- */
  function shell(inner, {nav = true} = {}) {
    const c = A.current(), role = c?.user.role, demo = !!c?.user.demo;
    const p = c?.vault.profile;
    document.documentElement.style.setProperty('--banner-h', demo ? '33px' : '0px');
    const items = role ? NAV[role] : [];
    const here = location.hash.split('?')[0];
    const isCur = h => here === h || (h !== '#/knowledge' && here.startsWith(h + '/')) || (h === '#/doctor/console' && here.startsWith('#/doctor/patient/'));
    const side = items.map(i => i.group ? `<div class="group">${esc(i.group)}</div>` : `<a class="navlink" href="${i.href}" ${isCur(i.href) ? 'aria-current="page"' : ''}>${icon(i.icon)}<span>${esc(i.label)}</span>${i.badge ? `<span class="badge-n" data-badge="${i.badge}" ${badges[i.badge] ? '' : 'hidden'}>${badges[i.badge]}</span>` : ''}</a>`).join('');
    const bottom = items.filter(i => !i.group && !i.hideMobile).map(i => `<a href="${i.href}" ${isCur(i.href) ? 'aria-current="page"' : ''}>${icon(i.icon)}<span>${esc(i.short)}</span>${i.badge ? `<span class="badge-n" data-badge="${i.badge}" ${badges[i.badge] ? '' : 'hidden'}>${badges[i.badge]}</span>` : ''}</a>`).join('');
    return `
      ${demo ? '<div class="banner" role="note"><span class="dot"></span>Simulated data — demonstration account<span class="hide-sm">&nbsp;| Exploratory orientation, not a clinical diagnosis</span></div>' : ''}
      <header class="app-header"><div class="inner">
        <a class="brand" href="${role ? '#/' + role + (role === 'doctor' ? '/console' : '/dashboard') : '#/cover'}" aria-label="ASTRAVITA home"><img src="${LOGO()}" alt="" width="100" height="32"><span class="wm"><b>ASTRAVITA</b><span>Behavioral health telemetry</span></span></a>
        ${role ? `<span class="role-tag hide-sm">${role === 'doctor' ? 'Flight surgeon console' : 'Crew member'}</span>` : ''}
        <div class="header-spacer"></div>
        ${c ? `<button class="user-pill" type="button" popovertarget="user-menu" aria-label="Account menu for ${esc(p.display_name)}"><span class="who"><b>${esc(p.display_name)}</b><span>${esc(p.title || (role === 'doctor' ? 'Flight surgeon' : 'Crew member'))} · ${esc(c.user.pseudo_id)}</span></span><span class="avatar" aria-hidden="true">${esc(U.initials(p.display_name))}</span></button>
        <nav id="user-menu" class="menu" popover aria-label="Account">
          <a href="#/${role}/settings">${icon('sliders')}Settings & privacy</a>
          <a href="#/knowledge">${icon('book')}Knowledge base</a>
          <button type="button" data-act="signout">${icon('logout')}Sign out</button>
        </nav>` : ''}
      </div></header>
      <div class="shell ${nav && role ? '' : 'no-nav'}">
        ${nav && role ? `<nav class="sidenav" aria-label="Main">${side}<div class="status-box"><div class="row between"><span class="eyebrow">Privacy</span><span class="chip ok">${icon('lock', 's16')}Encrypted</span></div><p class="small muted" style="margin-top:6px">Video never leaves this device. Your data is encrypted with a key derived from your password.</p></div></nav>` : ''}
        <main class="main" id="view" tabindex="-1">${inner}</main>
      </div>
      ${nav && role ? `<nav class="bottomnav" aria-label="Main (compact)">${bottom}</nav>` : ''}
      <footer class="app-footer"><div class="inner"><span>${icon('info', 's16')} ASTRAVITA provides an exploratory orientation, <b>not a clinical diagnosis</b>. Optical rPPG, HRV and expression estimates are experimental.</span><span class="mono">ASTRAVITA v${ASTRAVITA.version} · local engine · no data sent to servers</span></div></footer>`;
  }
  function positionMenu() {
    const btn = document.querySelector('.user-pill'), m = document.getElementById('user-menu');
    if (!btn || !m) return;
    m.addEventListener('toggle', e => { if (e.newState === 'open') { const r = btn.getBoundingClientRect(); m.style.top = (r.bottom + 6) + 'px'; m.style.left = Math.max(8, r.right - 240) + 'px'; m.style.width = '240px'; } });
  }

  /* ---------- router ---------- */
  function parse() {
    const raw = location.hash.replace(/^#/, '') || '/cover';
    const [path, qs] = raw.split('?');
    const parts = path.split('/').filter(Boolean);
    return {path: '/' + parts.join('/'), parts, query: new URLSearchParams(qs || '')};
  }
  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
  function home() { const c = A.current(); return c ? (c.user.role === 'doctor' ? '#/doctor/console' : '#/patient/dashboard') : '#/cover'; }

  async function render() {
    const token = ++renderToken;
    if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
    const r = parse(), c = A.current(), root = document.getElementById('app');
    // session expiry
    if (c && A.expired()) { A.signOut(); N.toast('Your session expired after 30 minutes of inactivity. Please sign in again.', 'warn', 7000); return go('#/auth'); }
    if (!c && A.pendingSession() && r.parts[0] !== 'cover') return views.lock(root, r);
    const area = r.parts[0];
    if (['patient', 'doctor'].includes(area)) {
      if (!c) { sessionStorage.setItem('astravita:after-login', location.hash); return go('#/auth'); }
      if (c.user.role !== area) { N.toast(area === 'doctor' ? 'That area is only available to flight surgeons.' : 'That area is only available to crew members.', 'warn'); return go(home()); }
    }
    if (area === 'knowledge' && !c) return go('#/auth');
    if ((area === 'auth' || area === 'cover') && c) return go(home());
    const key = area === 'patient' || area === 'doctor' ? `${area}/${r.parts[1] || ''}` : area;
    const own = k => Object.hasOwn(views, k) ? views[k] : null;
    const view = own(key) || (area === 'patient' ? views['patient/dashboard'] : area === 'doctor' ? views['doctor/console'] : null);
    if (!view) return go(home());
    const swap = async () => {
      if (token !== renderToken) return;
      const res = await view(root, r);
      if (token !== renderToken) { if (typeof res === 'function') res(); return; }
      cleanup = typeof res === 'function' ? res : null;
      positionMenu();
      root.querySelector('[data-act="signout"]')?.addEventListener('click', signOut);
      const f = document.getElementById('view'); if (f && document.activeElement === document.body) f.focus({preventScroll: true});
      A.touch();
    };
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // no transition while a modal dialog is open: the transition snapshot would cover it (e.g. the support dialog)
    if (document.startViewTransition && !reduce && root.dataset.ready && !document.querySelector('dialog[open]')) {
      // a skipped or timed-out transition is harmless: swallow its promise rejections
      const vt = document.startViewTransition(swap);
      vt.ready.catch(() => {}); vt.finished.catch(() => {});
      try { await vt.updateCallbackDone; } catch (e) { console.error('[ASTRAVITA] view failed', e); }
    }
    else await swap();
    root.dataset.ready = '1';
    window.scrollTo({top: 0});
  }
  async function signOut() {
    if (ASTRAVITA.live.running) { const ok = await N.confirm({title: 'End the monitoring session?', body: 'Signing out stops the camera. Unsaved session data will be lost.', ok: 'Sign out'}); if (!ok) return; ASTRAVITA.live.stop(true); }
    A.signOut(); N.toast('You have signed out. Your data stays encrypted on this device.', 'ok'); go('#/cover');
  }

  /* ---------- shared components ---------- */
  const STATUS = {nominal: ['ok', 'Nominal', 'check'], watch: ['warn', 'Observation', 'eye'], alert: ['bad', 'Alert', 'alert'], none: ['', 'No data', 'info'], insufficient: ['warn', 'Low signal', 'info']};
  const statusChip = s => { const [cls, txt, ic] = STATUS[s] || STATUS.none; return `<span class="chip ${cls}">${icon(ic)}${txt}</span>`; };
  const bandChip = b => b === 'strong' ? `<span class="chip bad">${icon('alert')}Strong pattern</span>` : b === 'notable' ? `<span class="chip warn">${icon('eye')}Notable</span>` : `<span class="chip tele">${icon('info')}Worth watching</span>`;
  const confChip = (label, v) => `<span class="chip ${label === 'high' ? 'ok' : label === 'medium' ? 'tele' : ''}">Confidence: ${esc(label)} (${v}%)</span>`;
  const empty = (ic, title, text, action = '') => `<div class="empty">${icon(ic)}<b>${esc(title)}</b><p class="small">${esc(text)}</p>${action}</div>`;
  const disclaimer = () => `<div class="notice tele" role="note">${icon('shield')}<div><strong>Exploratory orientation, not a clinical diagnosis.</strong> ASTRAVITA compares camera-based estimates and your answers with a preloaded knowledge base. It can miss things and can be wrong. Discuss anything that worries you with your flight surgeon.</div></div>`;
  function metricTile({key, label, value, unit, note = '', state = '', dec = 0, chip = ''}) {
    return `<article class="metric" data-k="${key}" data-s="${state}"><div class="m-top"><span class="m-lbl">${esc(label)}</span>${chip}</div><div class="m-val"><span class="v" data-v>${U.fin(value) ? U.fmt(value, dec) : '—'}</span><span class="u">${esc(unit)}</span></div><p class="m-note" data-note>${esc(note)}</p></article>`;
  }
  function download(name, text, type = 'text/csv;charset=utf-8') {
    const blob = new Blob([type.startsWith('text/csv') ? '﻿' + text : text], {type});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function print(html, title) {
    const p = document.getElementById('print-area'); p.innerHTML = html;
    const t = document.title; document.title = title;
    const clear = () => { p.innerHTML = ''; document.title = t; removeEventListener('afterprint', clear); };
    addEventListener('afterprint', clear); window.print();
  }
  return {views, shell, render, go, home, parse, statusChip, bandChip, confChip, empty, disclaimer, metricTile, download, print, setBadge, signOut, LOGO};
})();
