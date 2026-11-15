/* =====================================================================
   ASTRAVITA — boot
   ===================================================================== */
(() => {
  const UI = ASTRAVITA.ui, A = ASTRAVITA.auth, N = ASTRAVITA.notify;
  ASTRAVITA.kb.load();
  addEventListener('hashchange', () => UI.render());
  // the skip link must move focus without touching the hash router (href="#view" would change the route)
  document.querySelector('.skip-link')?.addEventListener('click', e => { e.preventDefault(); const v = document.getElementById('view'); if (v) { v.focus(); v.scrollIntoView({block: 'start'}); } });
  // keep the session alive while the user is active
  let last = 0; const act = () => { const now = Date.now(); if (now - last > 30000 && A.current() && !A.expired()) { last = now; A.touch(); } };
  ['pointerdown', 'keydown'].forEach(t => addEventListener(t, act, {passive: true}));
  setInterval(() => { if (A.current() && A.expired()) UI.render(); }, 60000);
  addEventListener('unhandledrejection', e => { console.error('[ASTRAVITA]', e.reason); const m = e.reason?.code === 'quota' ? e.reason.message : 'Something went wrong. Your data is safe; please try again.'; N.toast(m, 'bad', 7000); });
  if (!('crypto' in window) || !crypto.subtle) {
    document.getElementById('app').innerHTML = '<main style="padding:40px;max-width:640px;margin:auto"><h1>ASTRAVITA needs a secure context</h1><p>Web Crypto is not available. Open the page from a local file, over https, or from http://localhost in a current version of Chrome, Edge, Firefox or Safari.</p></main>';
    return;
  }
  UI.render();
})();
