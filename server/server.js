/* Taxi queue — local server. No packages to install: just Node.js 18 or newer.
   Run:  node server.js     (or double-click start.bat on Windows)

   It does everything Firebase does for the app:
   - serves the pages (so phones open  https://your-address/  and everything works)
   - keeps the queue / history / highest number in data/data.json (plus daily backups)
   - pushes live changes to every open page (Server-Sent Events)
   - dispatcher login (accounts in data/users.json, passwords hashed)
   Rules match database.rules.json: anyone can read; only signed-in dispatchers can change the queue,
   highest number or history; anyone can send a 10-11 request. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '8787', 10);
const HOST = process.env.HOST || '127.0.0.1';   // only this PC; Tailscale Funnel / a tunnel reaches it from here. Use HOST=0.0.0.0 to allow the local network too.
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const SESSION_DAYS = 30, KEEP_BACKUPS = 14, HISTORY_MAX = 5000;
fs.mkdirSync(BACKUP_DIR, { recursive: true });

/* ── log: printed in the console window and shown on the control page ── */
const logLines = [], logClients = new Set();
function log(msg) {
  const line = { t: Date.now(), msg: String(msg) };
  logLines.push(line); if (logLines.length > 300) logLines.shift();
  console.log(new Date(line.t).toLocaleTimeString() + '  ' + line.msg);
  for (const c of logClients) c.write(`event: log\ndata: ${JSON.stringify(line)}\n\n`);
}

/* ── small JSON file helpers (atomic writes) ── */
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; } }
function writeJsonNow(file, obj) { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(obj)); fs.renameSync(tmp, file); }
const timers = {};
function writeJsonSoon(file, obj) { clearTimeout(timers[file]); timers[file] = setTimeout(() => { try { writeJsonNow(file, obj); } catch (e) { log('SAVE FAILED: ' + e.message); } }, 200); }

/* ── state ── */
let data = readJson(DATA_FILE, {});             // { queue:[], maxNum, updatedAt, history:{id:{...}}, request1011 }
let sessions = readJson(SESSIONS_FILE, {});     // token -> { user, exp }
const saveData = () => writeJsonSoon(DATA_FILE, data);
const saveSessions = () => writeJsonSoon(SESSIONS_FILE, sessions);
const loadUsers = () => readJson(USERS_FILE, {});   // name -> { salt, hash }   (re-read so adding a dispatcher needs no restart)
const saveUsers = u => writeJsonNow(USERS_FILE, u);

/* ── backups: one a day automatically (last 14 kept), plus on demand ── */
function makeBackup(label) {
  try {
    writeJsonNow(DATA_FILE, data);
    const f = path.join(BACKUP_DIR, `data-${label}.json`);
    fs.copyFileSync(DATA_FILE, f);
    fs.readdirSync(BACKUP_DIR).filter(n => /^data-.*\.json$/.test(n)).sort().slice(0, -KEEP_BACKUPS).forEach(n => fs.unlinkSync(path.join(BACKUP_DIR, n)));
    return true;
  } catch (e) { log('BACKUP FAILED: ' + e.message); return false; }
}
function dailyBackup() {
  const day = new Date().toISOString().slice(0, 10);
  if (!fs.existsSync(path.join(BACKUP_DIR, `data-${day}.json`)) && fs.existsSync(DATA_FILE)) makeBackup(day);
}
dailyBackup(); setInterval(dailyBackup, 6 * 3600 * 1000);

/* ── validation (same rules as database.rules.json) ── */
const isInt = (v, lo, hi) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const isStr = (v, max) => typeof v === 'string' && v.length <= max;
function validQueue(q) { return q === null || (Array.isArray(q) && q.length <= 400 && q.every(v => isInt(v, 1, 999) || v === 'dummy')); }
function validHistory(h) {
  return h && typeof h === 'object' && !Array.isArray(h) && isStr(h.action, 20) && isStr(h.value, 60) && isStr(h.device, 100) &&
    typeof h.ts === 'number' && Object.keys(h).every(k => ['action', 'value', 'device', 'ts'].includes(k));
}
function validReq(r) { return r === null || (r && typeof r === 'object' && isInt(r.number, 1, 999) && typeof r.ts === 'number' && Object.keys(r).every(k => k === 'number' || k === 'ts')); }
const resolveSv = v => (v && typeof v === 'object' && v['.sv'] === 'timestamp') ? Date.now() : v;

/* ── live updates ── */
const clients = new Set();
let nextId = 1;
function broadcast(changes, by) {
  const msg = `event: change\ndata: ${JSON.stringify({ changes, by })}\n\n`;
  for (const c of clients) c.res.write(msg);
}
function setPath(p, value) {          // p is a top-level key
  if (value === null || value === undefined) delete data[p]; else data[p] = value;
}

/* ── login ── */
function hashPw(pw, salt) { return crypto.scryptSync(pw, salt, 64).toString('hex'); }
const failures = new Map();            // key -> { n, until }
function tooMany(key, limit) { const f = failures.get(key); return !!f && f.n >= limit && Date.now() < f.until; }
function noteFail(key) { const f = failures.get(key); const now = Date.now(); const g = (f && now < f.until) ? f : { n: 0, until: 0 }; g.n++; if (g.n === 1) g.until = now + 15 * 60 * 1000; failures.set(key, g); }
/* The address the proxy reports is not fully trustworthy, so limits exist per (address+name), per name, and per address. */
const lockedOut = (ip, name) => tooMany(ip + '|' + name, 6) || tooMany('user|' + name, 30) || tooMany('ip|' + ip, 40);
function sessionUser(req) {
  const m = /^Bearer ([a-f0-9]{64})$/.exec(req.headers['authorization'] || '');
  const s = m && sessions[m[1]];
  if (!s) return null;
  if (s.exp < Date.now()) { delete sessions[m[1]]; saveSessions(); return null; }
  return loadUsers()[s.user] ? s.user : null;     // account removed => session dead
}

/* ── request helpers ── */
function send(res, code, obj) { const b = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(b); }
function body(req) {
  return new Promise((ok, no) => {
    let s = ''; req.on('data', d => { s += d; if (s.length > 100000) { no(new Error('too big')); req.destroy(); } });
    req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { no(e); } });
  });
}
const reqLimit = new Map();            // 10-11 spam guard: ip -> timestamps
function reqAllowed(ip) { const now = Date.now(), a = (reqLimit.get(ip) || []).filter(t => now - t < 60000); a.push(now); reqLimit.set(ip, a); return a.length <= 30; }
const ipOf = req => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

/* ── API ── */
async function api(req, res, url) {
  const route = url.pathname;

  if (route === '/api/stream' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    const c = { id: nextId++, res };
    clients.add(c);
    res.write(`event: init\ndata: ${JSON.stringify({ data, now: Date.now(), id: c.id })}\n\n`);
    const ka = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ka); clients.delete(c); });
    return;
  }

  if (route === '/api/login' && req.method === 'POST') {
    const b = await body(req), name = String(b.user || '').trim().toLowerCase(), key = ipOf(req) + '|' + name;
    if (lockedOut(ipOf(req), name)) return send(res, 429, { code: 'auth/too-many-requests' });
    const u = loadUsers()[name];
    const ok = u && crypto.timingSafeEqual(Buffer.from(hashPw(String(b.password || ''), u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
    if (!ok) { log(`Login FAILED for "${name}" from ${ipOf(req)}`); noteFail(key); noteFail('user|' + name); noteFail('ip|' + ipOf(req)); return send(res, 401, { code: 'auth/invalid-credential' }); }
    failures.delete(key);
    const token = crypto.randomBytes(32).toString('hex');
    sessions[token] = { user: name, exp: Date.now() + SESSION_DAYS * 86400000 };
    saveSessions(); log(`${name} signed in`);
    return send(res, 200, { token, user: name });
  }
  if (route === '/api/me' && req.method === 'GET') {
    const u = sessionUser(req);
    return u ? send(res, 200, { user: u }) : send(res, 401, { code: 'auth/invalid-credential' });
  }
  if (route === '/api/logout' && req.method === 'POST') {
    const m = /^Bearer ([a-f0-9]{64})$/.exec(req.headers['authorization'] || '');
    if (m && sessions[m[1]]) { log(`${sessions[m[1]].user} signed out`); delete sessions[m[1]]; saveSessions(); }
    return send(res, 200, {});
  }

  /* writes: { clientId, ops:[{op:'set'|'push', path, value}] }  — all-or-nothing */
  if (route === '/api/write' && req.method === 'POST') {
    const b = await body(req), user = sessionUser(req), ops = Array.isArray(b.ops) ? b.ops : [];
    if (!ops.length || ops.length > 5) return send(res, 400, { code: 'bad-request' });
    const draft = {}, results = [];
    for (const o of ops) {
      const p = o.path;
      if (o.op === 'set' && p === 'request1011') {                       // drivers: public
        if (!validReq(o.value)) return send(res, 400, { code: 'invalid-data' });
        if (o.value !== null && !reqAllowed(ipOf(req))) return send(res, 429, { code: 'too-many-requests' });
        draft.request1011 = o.value;
        continue;
      }
      if (!user) return send(res, 401, { code: 'permission-denied' });   // everything else: dispatchers only
      if (o.op === 'set' && p === 'queue') { if (!validQueue(o.value)) return send(res, 400, { code: 'invalid-data' }); draft.queue = o.value; }
      else if (o.op === 'set' && p === 'maxNum') { if (!isInt(o.value, 140, 999)) return send(res, 400, { code: 'invalid-data' }); draft.maxNum = o.value; }
      else if (o.op === 'set' && p === 'updatedAt') { const v = resolveSv(o.value); if (typeof v !== 'number') return send(res, 400, { code: 'invalid-data' }); draft.updatedAt = v; results.push({ path: 'updatedAt', value: v }); }
      else if (o.op === 'set' && p === 'history') { if (o.value !== null) return send(res, 400, { code: 'invalid-data' }); draft.history = null; }
      else if (o.op === 'push' && p === 'history') {
        if (!validHistory(o.value)) return send(res, 400, { code: 'invalid-data' });
        draft.__push = draft.__push || []; draft.__push.push(o.value);
      } else return send(res, 400, { code: 'bad-path' });
    }
    const changes = [];
    for (const k of Object.keys(draft)) {
      if (k === '__push') continue;
      setPath(k, draft[k]); changes.push({ path: k, value: draft[k] === undefined ? null : draft[k] });
    }
    if (draft.__push) {
      data.history = data.history || {};
      for (const h of draft.__push) {
        const id = Date.now().toString(36).padStart(9, '0') + crypto.randomBytes(3).toString('hex');
        data.history[id] = h; results.push({ path: 'history/' + id, value: h });
      }
      const keys = Object.keys(data.history);
      if (keys.length > HISTORY_MAX) keys.sort().slice(0, keys.length - HISTORY_MAX).forEach(k => delete data.history[k]);
      changes.push({ path: 'history', value: data.history });
    }
    saveData();
    broadcast(changes, b.clientId);
    if (draft.request1011) log(`10-11 request from #${draft.request1011.number}`);
    if ('queue' in draft) log(`${user} saved the queue (${draft.queue ? draft.queue.length : 0} in queue)`);
    if (draft.maxNum) log(`${user} set the highest taxi number to ${draft.maxNum}`);
    if (draft.history === null) log(`${user} cleared the history`);
    return send(res, 200, { results });
  }
  send(res, 404, { code: 'not-found' });
}

/* ── static files ── */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const CONFIG_FOR_LOCAL = `/* generated by the local server */
export const BACKEND = 'local';
export const SDK = { app: './taxi-local.js?v=1', db: './taxi-local.js?v=1', auth: './taxi-local.js?v=1' };
export const FIREBASE_CONFIG = { apiKey: 'local', authDomain: '', databaseURL: '', projectId: 'local' };
`;
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  if (rel === '/taxi-config.js') { res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-cache' }); return res.end(CONFIG_FOR_LOCAL); }
  const file = path.resolve(ROOT, '.' + rel);
  const relToRoot = path.relative(ROOT, file);
  const ext = path.extname(file).toLowerCase();
  const blocked = relToRoot.startsWith('..') || path.isAbsolute(relToRoot) || relToRoot.split(path.sep).some(s => s.startsWith('.')) ||
    relToRoot.split(path.sep)[0] === 'server' || !TYPES[ext];
  if (blocked) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[ext], 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    serveStatic(req, res, url);
  } catch (e) {
    if (!res.headersSent) send(res, 400, { code: 'bad-request' });
  }
});
server.listen(PORT, HOST, () => {
  log(`Taxi queue server running at http://localhost:${PORT}  (listening on ${HOST})`);
  const users = Object.keys(loadUsers());
  log(users.length ? `Dispatcher accounts: ${users.join(', ')}` : 'No dispatcher accounts yet. Open the control page and add one.');
});

/* ═══ CONTROL PAGE (this PC only, on its own port) ═══
   Tailscale forwards the main port to the internet, so the control page lives on a different port that is never
   forwarded, and it also refuses requests that don't look like they come from this browser on this PC. */
const ADMIN_PORT = parseInt(process.env.ADMIN_PORT || '8788', 10);
const ADMIN_HTML = path.join(__dirname, 'admin.html');
const LOCAL_HOST = /^(localhost|127\.0\.0\.1)(:\d+)?$/i, LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
function adminOk(req, needHeader) {
  if (!LOCAL_HOST.test(req.headers.host || '')) return false;                       // blocks DNS-rebinding tricks
  if (req.headers.origin && !LOCAL_ORIGIN.test(req.headers.origin)) return false;   // blocks other websites posting here
  if (needHeader && req.headers['x-admin'] !== '1') return false;                   // a custom header can't be sent cross-site without permission
  return true;
}
let urlCache = { t: 0, urls: [] };
function publicUrls() {
  return new Promise(res => {
    if (Date.now() - urlCache.t < 30000) return res(urlCache.urls);
    require('child_process').execFile('tailscale', ['funnel', 'status'], { timeout: 4000, windowsHide: true }, (err, out, errOut) => {
      const text = String(out || '') + String(errOut || '');
      const urls = [...new Set((text.match(/https:\/\/[a-z0-9.-]+\.ts\.net/gi) || []).map(u => u.toLowerCase()))];
      urlCache = { t: Date.now(), urls }; res(urls);
    });
  });
}
function adminState() {
  const users = loadUsers(), now = Date.now();
  const active = {}; Object.values(sessions).forEach(x => { if (x.exp > now) active[x.user] = (active[x.user] || 0) + 1; });
  let backups = [];
  try { backups = fs.readdirSync(BACKUP_DIR).filter(n => /^data-.*\.json$/.test(n)).sort().reverse().map(n => ({ name: n, kb: Math.max(1, Math.round(fs.statSync(path.join(BACKUP_DIR, n)).size / 1024)) })); } catch (e) {}
  return {
    port: PORT, uptime: Math.round(process.uptime()), viewers: clients.size,
    queue: Array.isArray(data.queue) ? data.queue.length : 0, updatedAt: data.updatedAt || null,
    history: data.history ? Object.keys(data.history).length : 0,
    users: Object.keys(users).sort().map(n => ({ name: n, signedIn: active[n] || 0 })), backups
  };
}
const adminServer = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'), route = url.pathname;
    if (!adminOk(req, req.method !== 'GET')) { res.writeHead(403); return res.end('Forbidden'); }
    if (route === '/' && req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(fs.readFileSync(ADMIN_HTML)); }
    if (route === '/api/state') { const st = adminState(); st.urls = await publicUrls(); return send(res, 200, st); }
    if (route === '/api/log') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'Connection': 'keep-alive' });
      res.write(`event: backlog\ndata: ${JSON.stringify(logLines)}\n\n`);
      logClients.add(res); const ka = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => { clearInterval(ka); logClients.delete(res); });
      return;
    }
    if (route === '/api/users' && req.method === 'POST') {
      const b = await body(req), name = String(b.name || '').trim().toLowerCase(), users = loadUsers();
      if (!/^[a-z0-9._-]{2,30}$/.test(name)) return send(res, 400, { error: 'Names are 2-30 letters, numbers, dot, dash or underscore.' });
      if (b.op === 'remove') {
        if (!users[name]) return send(res, 404, { error: 'No such dispatcher.' });
        delete users[name]; saveUsers(users);
        for (const t of Object.keys(sessions)) if (sessions[t].user === name) delete sessions[t];
        saveSessions(); log(`Dispatcher "${name}" removed (signed out everywhere)`);
        return send(res, 200, {});
      }
      if (b.op === 'add' || b.op === 'passwd') {
        const pw = String(b.password || '');
        if (pw.length < 8 || pw.length > 100) return send(res, 400, { error: 'Password must be at least 8 characters.' });
        if (b.op === 'add' && users[name]) return send(res, 409, { error: `"${name}" already exists.` });
        if (b.op === 'passwd' && !users[name]) return send(res, 404, { error: 'No such dispatcher.' });
        const salt = crypto.randomBytes(16).toString('hex');
        users[name] = { salt, hash: hashPw(pw, salt) }; saveUsers(users);
        if (b.op === 'passwd') { for (const t of Object.keys(sessions)) if (sessions[t].user === name) delete sessions[t]; saveSessions(); }
        log(b.op === 'add' ? `Dispatcher "${name}" created` : `Password changed for "${name}" (signed out everywhere)`);
        return send(res, 200, {});
      }
      return send(res, 400, { error: 'Bad request.' });
    }
    if (route === '/api/action' && req.method === 'POST') {
      const b = await body(req);
      if (b.action === 'backup') { const ok = makeBackup(new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')); log(ok ? 'Backup saved' : 'Backup failed'); return send(res, ok ? 200 : 500, {}); }
      if (b.action === 'clear-queue') { setPath('queue', null); data.updatedAt = Date.now(); saveData(); broadcast([{ path: 'queue', value: null }, { path: 'updatedAt', value: data.updatedAt }], 'admin'); log('Queue cleared from the control page'); return send(res, 200, {}); }
      if (b.action === 'clear-history') { setPath('history', null); saveData(); broadcast([{ path: 'history', value: null }], 'admin'); log('History cleared from the control page'); return send(res, 200, {}); }
      if (b.action === 'open-data') { try { require('child_process').spawn('explorer', [DATA_DIR], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref(); } catch (e) {} return send(res, 200, {}); }
      return send(res, 400, { error: 'Unknown action.' });
    }
    send(res, 404, { error: 'not found' });
  } catch (e) { if (!res.headersSent) send(res, 400, { error: 'Bad request.' }); }
});
if (ADMIN_PORT > 0) {
  adminServer.on('error', e => log(`Control page could not start on port ${ADMIN_PORT}: ${e.message}`));
  adminServer.listen(ADMIN_PORT, '127.0.0.1', () => {
    log(`Control page: http://localhost:${ADMIN_PORT}   (this PC only)`);
    if (process.env.OPEN_ADMIN === '1') {
      try { require('child_process').spawn('cmd', ['/c', 'start', '', `http://localhost:${ADMIN_PORT}`], { detached: true, stdio: 'ignore', windowsHide: true }).on('error', () => {}).unref(); } catch (e) {}
    }
  });
}

function shutdown() { for (const f of Object.keys(timers)) clearTimeout(timers[f]); try { writeJsonNow(DATA_FILE, data); writeJsonNow(SESSIONS_FILE, sessions); } catch (e) {} process.exit(0); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
