/* =====================================================================
   ASTRAVITA.auth — accounts, roles, sessions and encrypted vaults
   ASTRAVITA.links — consent-based doctor/patient linking and shared channels
   ===================================================================== */
ASTRAVITA.auth = (() => {
  const S = ASTRAVITA.store, {uid} = ASTRAVITA.util;
  const SESSION_KEY = 'astravita:session';
  const IDLE_MS = 30 * 60 * 1000;
  let cur = null;   // {user (registry entry), vaultKey, privKey, vault}
  const listeners = new Set();
  const emit = () => listeners.forEach(f => { try { f(cur); } catch (e) { console.error(e); } });

  const emailHash = email => S.sha256B64('astravita|' + String(email).trim().toLowerCase());
  const pseudoId = prefix => prefix + '-' + S.randB64(6).replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toLowerCase().padEnd(8, '0');

  function passwordChecks(pw) {
    pw = String(pw || '');
    return {len: pw.length >= 8, upper: /[A-Z]/.test(pw), lower: /[a-z]/.test(pw), symbol: /[^A-Za-z0-9\s]/.test(pw)};
  }
  function strength(pw) { const c = passwordChecks(pw); const base = [c.len, c.upper, c.lower, c.symbol].filter(Boolean).length; return pw && pw.length >= 14 && base === 4 ? 4 : Math.min(base, 3) || (pw ? 1 : 0); }

  async function register({email, password, name, role, title = '', mission = '', demo = false}) {
    if (!['patient', 'doctor'].includes(role)) throw new Error('Choose a role.');
    name = String(name ?? '').trim().slice(0, 120); title = String(title ?? '').trim().slice(0, 120); mission = String(mission ?? '').trim().slice(0, 160);
    if (!name) throw new Error('Enter your name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())) throw new Error('Enter a valid email address.');
    const c = passwordChecks(password);
    if (!c.len || !c.upper || !c.symbol) throw new Error('Password must have 8+ characters, an uppercase letter and a symbol.');
    const reg = await S.registry(), eh = await emailHash(email);
    if (Object.values(reg.users).some(u => u.email_hash === eh)) throw new Error('An account with this email already exists. Sign in instead.');
    const salt = S.randB64(16);
    const {verifier, vaultKey} = await S.deriveFromPassword(password, salt);
    const kp = await S.genKeyPair();
    const user_id = uid();
    const entry = {
      user_id, email_hash: eh, role, demo: !!demo, salt, iter: S.ITER, verifier,
      pub_jwk: kp.publicJwk, wrapped_priv: await S.encryptJSON(vaultKey, kp.privateJwk),
      pseudo_id: role === 'patient' ? pseudoId('subj') : pseudoId('doc'),
      link_code: role === 'patient' ? S.newLinkCode() : null,
      created_at: new Date().toISOString()
    };
    const vault = {schema: 'astravita.vault.v1', profile: {display_name: name, title, mission, role, email: String(email).trim().toLowerCase()}, created_at: entry.created_at};
    if (role === 'patient') Object.assign(vault, {sessions: [], baseline: null, consent: null, received_notes_seen: [], cm_status: {}, alerts: []});
    else Object.assign(vault, {private_notes: {}, alert_reviews: {}});
    reg.users[user_id] = entry;
    await S.kv.set('vault:' + user_id, await S.encryptJSON(vaultKey, vault));
    await S.saveRegistry(reg);
    return {user: entry, user_id, vaultKey, vault, entry, privKey: await S.importPriv(kp.privateJwk)};
  }

  async function open(entry, password) {
    const {verifier, vaultKey} = await S.deriveFromPassword(password, entry.salt, entry.iter);
    if (!S.safeEq(verifier, entry.verifier)) return null;
    let vault, privKey;
    try {
      vault = await S.decryptJSON(vaultKey, await S.kv.get('vault:' + entry.user_id));
      if (vault) privKey = await S.importPriv(await S.decryptJSON(vaultKey, entry.wrapped_priv));
    } catch (x) { const e = new Error('Your encrypted data could not be opened. It may have been modified outside ASTRAVITA.'); e.code = 'integrity'; throw e; }
    if (!vault) throw new Error('Your encrypted data could not be opened.');
    // integrity check: role stored in the encrypted vault must match the registry
    if (vault.profile?.role !== entry.role) { const e = new Error('Account integrity check failed (role mismatch). Access was blocked.'); e.code = 'integrity'; throw e; }
    return {user: entry, vaultKey, privKey, vault};
  }

  async function signIn(email, password) {
    const reg = await S.registry(), eh = await emailHash(email);
    const entry = Object.values(reg.users).find(u => u.email_hash === eh);
    if (!entry) { await S.deriveFromPassword(password || 'x', S.randB64(16)); throw new Error('Email or password is incorrect.'); }   // equalize timing
    const c = await open(entry, password);
    if (!c) throw new Error('Email or password is incorrect.');
    cur = c; touch(); emit(); return cur;
  }
  async function unlock(password) {
    const s = pendingSession(); if (!s) throw new Error('Your session has expired. Please sign in again.');
    const reg = await S.registry(), entry = reg.users[s.user_id];
    if (!entry) { signOut(); throw new Error('This account no longer exists.'); }
    const c = await open(entry, password);
    if (!c) throw new Error('Password is incorrect.');
    cur = c; touch(); emit(); return cur;
  }
  function touch() { if (cur) sessionStorage.setItem(SESSION_KEY, JSON.stringify({user_id: cur.user.user_id, role: cur.user.role, name: cur.vault.profile.display_name, expires: Date.now() + IDLE_MS})); }
  function pendingSession() {
    try { const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); if (s && s.expires > Date.now()) return s; } catch { /* ignore */ }
    sessionStorage.removeItem(SESSION_KEY); return null;
  }
  function signOut() { cur = null; sessionStorage.removeItem(SESSION_KEY); emit(); }
  function current() { return cur; }
  function expired() { return !!cur && !pendingSession(); }

  async function saveVault() {
    if (!cur) throw new Error('Not signed in.');
    await S.kv.set('vault:' + cur.user.user_id, await S.encryptJSON(cur.vaultKey, cur.vault));
    touch();
  }
  async function saveSamples(sessionId, rows) { if (!cur) return; await S.kv.set(`samples:${cur.user.user_id}:${sessionId}`, await S.encryptJSON(cur.vaultKey, rows)); }
  async function loadSamples(sessionId) { if (!cur) return null; return S.decryptJSON(cur.vaultKey, await S.kv.get(`samples:${cur.user.user_id}:${sessionId}`)); }
  async function deleteSamples(sessionId) { if (cur) await S.kv.del(`samples:${cur.user.user_id}:${sessionId}`); }
  // re-read the registry entry (e.g. new link code) but never let it change role or demo status mid-session
  async function refreshEntry() {
    if (!cur) return; const reg = await S.registry(), e = reg.users[cur.user.user_id];
    if (e && e.role === cur.user.role && !!e.demo === !!cur.user.demo) cur.user = e;
  }
  async function regenerateLinkCode() {
    if (!cur || cur.user.role !== 'patient') return null;
    const reg = await S.registry(); const e = reg.users[cur.user.user_id];
    e.link_code = S.newLinkCode(); await S.saveRegistry(reg); cur.user = e; return e.link_code;
  }
  async function deleteAccount() {
    if (!cur) return;
    const id = cur.user.user_id, reg = await S.registry();
    const L = await S.links();
    for (const l of Object.values(L.links)) if (l.patient_id === id || l.doctor_id === id) { await S.kv.del('share:' + l.link_id); await S.kv.del('care:' + l.link_id); delete L.links[l.link_id]; }
    await S.saveLinks(L);
    for (const k of await S.kv.keys('samples:' + id + ':')) await S.kv.del(k);
    await S.kv.del('vault:' + id); delete reg.users[id]; await S.saveRegistry(reg);
    signOut();
  }
  return {register, signIn, unlock, signOut, current, expired, pendingSession, touch, saveVault, saveSamples, loadSamples, deleteSamples, refreshEntry, regenerateLinkCode, deleteAccount, passwordChecks, strength, open, onChange: f => listeners.add(f)};
})();

ASTRAVITA.links = (() => {
  const S = ASTRAVITA.store, A = ASTRAVITA.auth, {uid} = ASTRAVITA.util;
  const keyCache = new Map();
  const me = () => { const c = A.current(); if (!c) throw new Error('Not signed in.'); return c; };
  async function channelKeyFor(c, link) {
    const ck = c.user.user_id + '|' + link.link_id;
    if (keyCache.has(ck)) return keyCache.get(ck);
    const reg = await S.registry();
    const peerId = c.user.role === 'doctor' ? link.patient_id : link.doctor_id;
    const peer = reg.users[peerId]; if (!peer) throw new Error('The linked account no longer exists.');
    const k = await S.linkKey(c.privKey, peer.pub_jwk, link.link_id); keyCache.set(ck, k); return k;
  }
  const channelKey = link => channelKeyFor(me(), link);
  // ---- doctor side ----
  async function request(code) {
    const c = me(); if (c.user.role !== 'doctor') throw new Error('Only flight surgeons can add patients.');
    const nc = S.normCode(code); if (nc.length !== 8) throw new Error('Linking codes have 8 characters.');
    const reg = await S.registry();
    const patient = Object.values(reg.users).find(u => u.role === 'patient' && u.link_code === nc);
    if (!patient || patient.demo !== c.user.demo) throw new Error('No crew member uses this code. Check it with the crew member.');
    const L = await S.links();
    const existing = Object.values(L.links).find(l => l.patient_id === patient.user_id && l.doctor_id === c.user.user_id && ['pending', 'accepted'].includes(l.status));
    if (existing) throw new Error(existing.status === 'pending' ? 'A request to this crew member is already pending.' : 'This crew member is already linked to you.');
    const link = {link_id: uid(), doctor_id: c.user.user_id, patient_id: patient.user_id, doctor_name: c.vault.profile.display_name, doctor_title: c.vault.profile.title || 'Flight surgeon', doctor_pseudo: c.user.pseudo_id, status: 'pending', created_at: new Date().toISOString(), demo: !!c.user.demo};
    L.links[link.link_id] = link; await S.saveLinks(L); return link;
  }
  async function forDoctor() {
    const c = me(); if (c.user.role !== 'doctor') return [];
    const L = await S.links();
    return Object.values(L.links).filter(l => l.doctor_id === c.user.user_id);
  }
  async function cancelRequest(linkId) {
    const c = me(); const L = await S.links(); const l = L.links[linkId];
    if (!l || l.doctor_id !== c.user.user_id || l.status !== 'pending') return;
    l.status = 'cancelled'; l.updated_at = new Date().toISOString(); await S.saveLinks(L);
  }
  // ---- patient side ----
  async function forPatient() {
    const c = me(); if (c.user.role !== 'patient') return [];
    const L = await S.links();
    return Object.values(L.links).filter(l => l.patient_id === c.user.user_id);
  }
  async function activeForPatient() { return (await forPatient()).find(l => l.status === 'accepted') || null; }
  async function respond(linkId, accept) {
    const c = me(); if (c.user.role !== 'patient') throw new Error('Only crew members can answer link requests.');
    const L = await S.links(); const l = L.links[linkId];
    if (!l || l.patient_id !== c.user.user_id || l.status !== 'pending') throw new Error('This request is no longer available.');
    if (accept && !!l.demo !== !!c.user.demo) throw new Error('Demonstration and real accounts cannot be linked.');
    if (accept) {
      const active = Object.values(L.links).find(x => x.patient_id === c.user.user_id && x.status === 'accepted');
      if (active) throw new Error(`You are already linked to ${active.doctor_name}. Revoke that link first.`);
    }
    l.status = accept ? 'accepted' : 'declined'; l.updated_at = new Date().toISOString();
    await S.saveLinks(L);
    if (accept) await publishShare();
    return l;
  }
  async function revoke(linkId) {
    const c = me(); const L = await S.links(); const l = L.links[linkId];
    if (!l || l.patient_id !== c.user.user_id || l.status !== 'accepted') throw new Error('Nothing to revoke.');
    l.status = 'revoked'; l.updated_at = new Date().toISOString(); await S.saveLinks(L);
    await S.kv.del('share:' + linkId);   // the doctor can no longer read anything
  }
  // shared snapshot written by the patient (no 1 Hz samples, no account data)
  function snapshotOf(c) {
    const v = c.vault;
    return {schema: 'astravita.share.v1', updated_at: new Date().toISOString(), profile: {display_name: v.profile.display_name, title: v.profile.title, mission: v.profile.mission, subject_id: c.user.pseudo_id}, baseline: v.baseline, sessions: (v.sessions || []).map(s => ({...s, samples: undefined})), cm_status: v.cm_status || {}, alerts: v.alerts || [], demo: !!c.user.demo};
  }
  async function publishShareAs(c, link) { await S.kv.set('share:' + link.link_id, await S.encryptJSON(await channelKeyFor(c, link), snapshotOf(c))); }
  async function publishShare() {
    const c = me(); if (c.user.role !== 'patient') return;
    const l = await activeForPatient(); if (!l) return;
    await publishShareAs(c, l);
  }
  async function writeCareAs(c, link, care) { care.updated_at = new Date().toISOString(); await S.kv.set('care:' + link.link_id, await S.encryptJSON(await channelKeyFor(c, link), care)); }
  async function readShare(link) {
    const c = me();
    if (c.user.role !== 'doctor' || link.doctor_id !== c.user.user_id) throw new Error('Access denied.');
    const L = await S.links(); const fresh = L.links[link.link_id];
    if (!fresh || fresh.status !== 'accepted' || fresh.doctor_id !== c.user.user_id) throw new Error('This crew member has not authorized access.');
    const blob = await S.kv.get('share:' + link.link_id); if (!blob) return null;
    return S.decryptJSON(await channelKey(fresh), blob);
  }
  // care channel written by the doctor: shared notes, countermeasures, alert reviews
  async function readCare(link) {
    const c = me();
    const L = await S.links(); const fresh = L.links[link?.link_id];
    // authorize against the stored record, not the caller-supplied object
    if (!fresh || !(fresh.doctor_id === c.user.user_id || fresh.patient_id === c.user.user_id)) throw new Error('Access denied.');
    if (fresh.status !== 'accepted') return {notes: [], countermeasures: [], alert_reviews: {}};
    const blob = await S.kv.get('care:' + link.link_id);
    const d = blob ? await S.decryptJSON(await channelKey(fresh), blob) : null;
    return d || {notes: [], countermeasures: [], alert_reviews: {}};
  }
  async function writeCare(link, care) {
    const c = me(); if (c.user.role !== 'doctor' || link.doctor_id !== c.user.user_id) throw new Error('Access denied.');
    const L = await S.links(); const fresh = L.links[link.link_id];
    if (!fresh || fresh.status !== 'accepted' || fresh.doctor_id !== c.user.user_id) throw new Error('This crew member has not authorized access.');
    await writeCareAs(c, fresh, care);
  }
  const clearCache = () => keyCache.clear();
  A.onChange(clearCache);
  return {request, forDoctor, cancelRequest, forPatient, activeForPatient, respond, revoke, publishShare, publishShareAs, readShare, readCare, writeCare, writeCareAs, channelKey};
})();
