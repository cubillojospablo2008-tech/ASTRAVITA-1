/* =====================================================================
   ASTRAVITA.store — client-side persistence layer.
   IndexedDB key/value store (prefix "astravita:") + Web Crypto:
   - PBKDF2-SHA-256 (600,000 iterations, per-user salt) -> login verifier + vault key
   - AES-GCM 256 for every per-user vault and per-session sample blob
   - ECDH P-256 + HKDF -> one shared key per accepted doctor-patient link
   This layer is isolated so it can be replaced by calls to a .NET API later.
   ===================================================================== */
ASTRAVITA.store = (() => {
  const {b64} = ASTRAVITA.util;
  const PREFIX = 'astravita:';
  const ITER = 600000;
  const enc = new TextEncoder(), dec = new TextDecoder();

  /* ---------- IndexedDB key/value with localStorage fallback ---------- */
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      if (!('indexedDB' in window)) return rej(new Error('no-idb'));
      const r = indexedDB.open('astravita', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error('blocked'));
    }).catch(e => { console.warn('[ASTRAVITA] IndexedDB unavailable, using localStorage', e); return null; });
    return dbp;
  }
  const tx = async (mode, fn) => {
    const d = await db();
    if (!d) return fn(null);
    return new Promise((res, rej) => {
      const t = d.transaction('kv', mode), s = t.objectStore('kv'); let out, failed = null;
      // errors inside fn must reject the call (and abort a write), not resolve with undefined
      let p; try { p = Promise.resolve(fn(s)); } catch (e) { p = Promise.reject(e); }
      p.then(v => { out = v; }, e => { failed = e; try { t.abort(); } catch { /* already finished */ } });
      t.oncomplete = () => failed ? rej(failed) : res(out); t.onerror = () => rej(failed || t.error); t.onabort = () => rej(failed || t.error || new Error('aborted'));
    });
  };
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const kv = {
    async get(k) {
      return tx('readonly', s => s ? req(s.get(PREFIX + k)) : JSON.parse(localStorage.getItem(PREFIX + k) || 'null'));
    },
    async set(k, v) {
      try { return await tx('readwrite', s => { if (s) s.put(v, PREFIX + k); else localStorage.setItem(PREFIX + k, JSON.stringify(v)); }); }
      catch (e) { if (e && (e.name === 'QuotaExceededError' || /quota/i.test(e.message))) { const err = new Error('Local storage is full. Export your data and delete old sessions.'); err.code = 'quota'; throw err; } throw e; }
    },
    async del(k) { return tx('readwrite', s => { if (s) s.delete(PREFIX + k); else localStorage.removeItem(PREFIX + k); }); },
    async keys(prefix = '') {
      return tx('readonly', async s => {
        if (!s) return Object.keys(localStorage).filter(k => k.startsWith(PREFIX + prefix)).map(k => k.slice(PREFIX.length));
        const all = await req(s.getAllKeys());
        return all.filter(k => String(k).startsWith(PREFIX + prefix)).map(k => String(k).slice(PREFIX.length));
      });
    }
  };

  /* ---------- crypto ---------- */
  const C = crypto.subtle;
  const randB64 = n => b64.enc(crypto.getRandomValues(new Uint8Array(n)));
  async function sha256B64(text) { return b64.enc(await C.digest('SHA-256', enc.encode(text))); }
  async function deriveFromPassword(password, saltB64, iterations = ITER) {
    const base = await C.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await C.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt: b64.dec(saltB64), iterations}, base, 512));
    const verifier = b64.enc(await C.digest('SHA-256', bits.slice(0, 32)));
    const vaultKey = await C.importKey('raw', bits.slice(32, 64), {name: 'AES-GCM'}, false, ['encrypt', 'decrypt']);
    bits.fill(0);
    return {verifier, vaultKey};
  }
  async function encryptJSON(key, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await C.encrypt({name: 'AES-GCM', iv}, key, enc.encode(JSON.stringify(obj)));
    return {v: 1, iv: b64.enc(iv), ct: b64.enc(ct)};
  }
  async function decryptJSON(key, blob) {
    if (!blob || !blob.iv) return null;
    const pt = await C.decrypt({name: 'AES-GCM', iv: b64.dec(blob.iv)}, key, b64.dec(blob.ct));
    return JSON.parse(dec.decode(pt));
  }
  async function genKeyPair() {
    const kp = await C.generateKey({name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveBits']);
    return {publicJwk: await C.exportKey('jwk', kp.publicKey), privateJwk: await C.exportKey('jwk', kp.privateKey)};
  }
  const importPriv = jwk => C.importKey('jwk', jwk, {name: 'ECDH', namedCurve: 'P-256'}, false, ['deriveBits']);
  const importPub = jwk => C.importKey('jwk', jwk, {name: 'ECDH', namedCurve: 'P-256'}, false, []);
  async function linkKey(privKey, peerPubJwk, linkId) {
    const bits = await C.deriveBits({name: 'ECDH', public: await importPub(peerPubJwk)}, privKey, 256);
    const hk = await C.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
    return C.deriveKey({name: 'HKDF', hash: 'SHA-256', salt: enc.encode('astravita:' + linkId), info: enc.encode('astravita link channel v1')}, hk, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
  }
  const safeEq = (a, b) => { if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };

  /* ---------- registry & links (metadata only, no health data) ---------- */
  async function registry() { return (await kv.get('registry')) || {users: {}}; }
  async function saveRegistry(r) { await kv.set('registry', r); }
  async function links() { return (await kv.get('links')) || {links: {}}; }
  async function saveLinks(l) { await kv.set('links', l); }

  /* ---------- link code ---------- */
  const CODE_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function newLinkCode() { const r = crypto.getRandomValues(new Uint8Array(8)); return [...r].map(x => CODE_ALPHA[x % CODE_ALPHA.length]).join(''); }
  const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  return {kv, ITER, randB64, sha256B64, deriveFromPassword, encryptJSON, decryptJSON, genKeyPair, importPriv, linkKey, safeEq, registry, saveRegistry, links, saveLinks, newLinkCode, normCode};
})();
