/* Stand-in for the Firebase library when the app runs against its own server (see SERVER-README.md).
   It offers the same functions the pages already call (ref, onValue, set, push, update, remove, serverTimestamp,
   goOffline/goOnline, and the sign-in functions), so the pages don't need to know which backend they are using.
   Live updates arrive over Server-Sent Events; writes are sent in order, and applied on screen immediately. */
const clientId = Math.random().toString(36).slice(2) + Date.now().toString(36);
const TOKEN_KEY = 'taxi-token', USER_KEY = 'taxi-token-user';

/* ── data cache + subscribers ── */
let cache = {}, connected = false, offset = 0, wantOnline = true, es = null, firstInit = true;
const subs = new Map();                      // path -> Set of { cb, err }
const snap = v => ({ val: () => (v === undefined ? null : JSON.parse(JSON.stringify(v))) });
const current = p => p === '.info/connected' ? connected : p === '.info/serverTimeOffset' ? offset : cache[p];
function notify(p) { (subs.get(p) || []).forEach(s => { try { s.cb(snap(current(p))); } catch (e) { console.error(e); } }); }
function apply(p, v) { if (v === null || v === undefined) delete cache[p]; else cache[p] = v; }

function openStream() {
  if (es || !wantOnline) return;
  es = new EventSource('/api/stream');
  es.addEventListener('init', e => {
    const m = JSON.parse(e.data), old = cache;
    cache = m.data || {};
    offset = m.now - Date.now();
    connected = true;
    for (const p of subs.keys()) {
      if (p.startsWith('.info/')) continue;
      if (firstInit || JSON.stringify(old[p]) !== JSON.stringify(cache[p])) notify(p);
    }
    firstInit = false;
    notify('.info/serverTimeOffset'); notify('.info/connected');
  });
  es.addEventListener('change', e => {
    const m = JSON.parse(e.data);
    if (m.by === clientId) return;           // our own change: already on screen
    m.changes.forEach(c => { apply(c.path, c.value); notify(c.path); });
  });
  es.onerror = () => {
    if (connected) { connected = false; notify('.info/connected'); subs.forEach(set => set.forEach(s => s.err && s.err(new Error('offline')))); }
    // the browser reconnects by itself
  };
}
function closeStream() { if (es) { es.close(); es = null; } if (connected) { connected = false; notify('.info/connected'); } }

/* ── Firebase-shaped API ── */
export const initializeApp = () => ({});
export const getDatabase = () => ({});
export const ref = (db, p) => p || '';
export const serverTimestamp = () => ({ '.sv': 'timestamp' });
export function onValue(p, cb, err) {
  if (!subs.has(p)) subs.set(p, new Set());
  const s = { cb, err }; subs.get(p).add(s);
  openStream();
  if (p === '.info/connected' || p === '.info/serverTimeOffset') setTimeout(() => cb(snap(current(p))), 0);
  else if (!firstInit) setTimeout(() => cb(snap(current(p))), 0);   // already have data
  return () => subs.get(p).delete(s);
}
export const goOffline = () => { wantOnline = false; closeStream(); };
export const goOnline = () => { wantOnline = true; openStream(); };

/* writes go out one at a time, in order */
let chain = Promise.resolve();
function post(ops) {
  const run = async () => {
    let r;
    try {
      r = await fetch('/api/write', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader() }, body: JSON.stringify({ clientId, ops }) });
    } catch (e) { const x = new Error('network error'); x.code = 'NETWORK'; throw x; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 401) signedOut();
      const x = new Error(j.code || ('http ' + r.status));
      x.code = r.status === 401 ? 'PERMISSION_DENIED' : (j.code || 'ERROR');
      throw x;
    }
    (j.results || []).forEach(res => { if (!res.path.includes('/')) { apply(res.path, res.value); notify(res.path); } });
    return j.results || [];
  };
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  p.catch(() => { closeStream(); openStream(); });    // a write failed: reload the true state from the server
  return p;
}
const stamp = v => (v && v['.sv'] === 'timestamp') ? Date.now() + offset : v;
function optimistic(path, value) { apply(path, stamp(value)); notify(path); }
export const set = (p, v) => { optimistic(p, v); return post([{ op: 'set', path: p, value: v }]).then(() => {}); };
export const remove = p => set(p, null);
export const update = (p, obj) => {
  const ops = Object.entries(obj).map(([k, v]) => ({ op: 'set', path: k, value: v === undefined ? null : v }));
  ops.forEach(o => optimistic(o.path, o.value));
  return post(ops).then(() => {});
};
export const push = (p, v) => post([{ op: 'push', path: p, value: v }]).then(r => ({ key: (r[0] && r[0].path.split('/')[1]) || null }));

/* ── sign-in (same shape as Firebase Auth) ── */
const authListeners = new Set();
let authUser, authReady = false;
const authHeader = () => { const t = localStorage.getItem(TOKEN_KEY); return t ? { Authorization: 'Bearer ' + t } : {}; };
const userObj = name => name ? { uid: name, email: name, displayName: null } : null;
function setUser(u) { authUser = u; authListeners.forEach(f => f(u)); }
function signedOut() { try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch (e) {} if (authUser) setUser(null); }
export const getAuth = () => ({});
export function onAuthStateChanged(a, cb) {
  authListeners.add(cb);
  if (authReady) setTimeout(() => cb(authUser || null), 0);
  else if (authUser === undefined && !onAuthStateChanged.checking) {
    onAuthStateChanged.checking = true;
    (async () => {
      const t = localStorage.getItem(TOKEN_KEY);
      let u = null;
      if (t) {
        try {
          const r = await fetch('/api/me', { headers: authHeader() });
          if (r.ok) { u = userObj((await r.json()).user); localStorage.setItem(USER_KEY, u.uid); }
          else signedOut();
        } catch (e) { u = userObj(localStorage.getItem(USER_KEY)); }   // no signal at launch: stay signed in, writes will fail until back online
      }
      authReady = true; setUser(u);
    })();
  }
  return () => authListeners.delete(cb);
}
export async function signInWithEmailAndPassword(a, user, password) {
  let r;
  try { r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user, password }) }); }
  catch (e) { const x = new Error('network'); x.code = 'auth/network-request-failed'; throw x; }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const x = new Error(j.code || 'login failed'); x.code = j.code || 'auth/invalid-credential'; throw x; }
  localStorage.setItem(TOKEN_KEY, j.token); localStorage.setItem(USER_KEY, j.user);
  setUser(userObj(j.user));
  return { user: authUser };
}
export async function signOut() {
  try { await fetch('/api/logout', { method: 'POST', headers: authHeader() }); } catch (e) {}
  signedOut(); setUser(null);
}
