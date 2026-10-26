/* Dispatcher sign-in (email + password) with its own on-screen keyboard, because the phone keyboard
   does not open reliably in the installed app. Used by stand.html (via taxi-editor.js) and history.html.

   const auth = await setupAuth(app, { autoPrompt: true });
   auth.enabled         false until a real API key is in taxi-config.js (then nothing changes)
   auth.user()          the signed-in user or null
   auth.label()         short name for history entries (the part of the email before the @)
   auth.requireSignIn() resolves once someone is signed in (shows the sign-in box if needed)
   auth.signOut()
   auth.onChange(fn)    called with the user (or null) whenever sign-in state changes            */
import { FIREBASE_CONFIG } from './taxi-config.js';

const AUTH_URL = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
export const AUTH_CONFIGURED = !String(FIREBASE_CONFIG.apiKey || '').startsWith('PASTE');

const CSS = `
#auth-modal{display:none;position:fixed;inset:0;z-index:400;background:rgba(10,5,30,.92);align-items:flex-start;justify-content:center;overflow-y:auto;-webkit-user-select:none;user-select:none}
#auth-modal.visible{display:flex}
.auth-card{background:#1e1248;border:1.5px solid rgba(128,216,255,.45);border-radius:16px;padding:16px 12px;width:min(98%,400px);margin:max(10px,env(safe-area-inset-top)) auto 10px;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.6);color:#fff;font-family:'Segoe UI',system-ui,sans-serif}
.auth-title{font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#80d8ff;margin-bottom:10px}
.auth-field{display:flex;align-items:center;gap:8px;min-height:46px;margin-bottom:8px;padding:0 12px;border-radius:10px;border:1.5px solid rgba(128,216,255,.25);background:rgba(255,255,255,.06);text-align:left;cursor:pointer}
.auth-field.active{border-color:#80d8ff;background:rgba(128,216,255,.12)}
.auth-field .lbl{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;opacity:.55;min-width:62px}
.auth-field .val{flex:1;font-size:17px;font-weight:600;word-break:break-all;min-height:22px}
.auth-field .val.empty{opacity:.3;font-weight:400}
.auth-show{font-size:11px;font-weight:700;color:#80d8ff;padding:6px 8px;border-radius:8px;border:1px solid rgba(128,216,255,.3)}
.auth-msg{min-height:18px;font-size:13px;color:#ff8080;margin:2px 0 8px}
.auth-keys{display:flex;flex-direction:column;gap:5px}
.auth-row{display:flex;gap:4px;justify-content:center}
.auth-k{flex:1 1 0;max-width:36px;height:42px;border-radius:7px;background:rgba(128,216,255,.12);border:1.5px solid rgba(128,216,255,.22);color:#fff;font-size:17px;font-weight:700;display:flex;align-items:center;justify-content:center;cursor:pointer}
.auth-k:active{background:rgba(128,216,255,.35)}
.auth-k.wide{max-width:60px;flex:1.5 1 0;font-size:13px;color:#80d8ff}
.auth-k.space{max-width:none;flex:5 1 0;font-size:13px;color:#80d8ff}
.auth-k.on{background:#80d8ff;color:#1e1248}
.auth-go{margin-top:12px;width:100%;padding:13px;border-radius:10px;border:none;background:#80d8ff;color:#1e1248;font-size:15px;font-weight:800;cursor:pointer}
.auth-go:disabled{opacity:.5}
`;
const LAYERS = {
  abc: [['1','2','3','4','5','6','7','8','9','0'],['q','w','e','r','t','y','u','i','o','p'],['a','s','d','f','g','h','j','k','l'],
        ['shift','z','x','c','v','b','n','m','back'],['sym','@','space','.','-','_']],
  sym: [['1','2','3','4','5','6','7','8','9','0'],['@','#','$','%','&','*','(',')','+','='],['!','?','/',':',';',"'",'"','~','^'],
        ['_','-','.',',','[',']','{','}','back'],['abc','<','>','space','\\','|','`']]
};
const LABEL = { shift:'⇧', back:'⌫', space:'space', sym:'?123', abc:'ABC' };

function errorText(e) {
  const c = (e && e.code) || '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-email|missing-password|missing-email/.test(c)) return 'Wrong email or password.';
  if (/too-many-requests/.test(c)) return 'Too many tries. Wait a few minutes and try again.';
  if (/network/.test(c)) return 'No connection. Check your signal and try again.';
  if (/invalid-api-key|api-key/.test(c)) return 'Setup problem: check the API key in taxi-config.js.';
  if (/operation-not-allowed/.test(c)) return 'Email/password sign-in is not enabled in Firebase.';
  return 'Sign-in failed' + (c ? ` (${c})` : '') + '.';
}

function buildUi(onSubmit) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const modal = document.createElement('div'); modal.id = 'auth-modal';
  modal.innerHTML = `<div class="auth-card">
    <div class="auth-title">Dispatcher sign in</div>
    <div class="auth-field active" data-f="email"><span class="lbl">Email</span><span class="val empty">tap, then type</span></div>
    <div class="auth-field" data-f="pw"><span class="lbl">Password</span><span class="val empty">tap, then type</span><span class="auth-show">Show</span></div>
    <div class="auth-msg" id="auth-msg"></div>
    <div class="auth-keys" id="auth-keys"></div>
    <button class="auth-go" id="auth-go">Sign in</button></div>`;
  document.body.appendChild(modal);
  const vals = { email: localStorage.getItem('taxi-auth-email') || '', pw: '' };
  let active = vals.email ? 'pw' : 'email', layer = 'abc', shift = false, showPw = false, busy = false;
  const fields = { email: modal.querySelector('[data-f=email]'), pw: modal.querySelector('[data-f=pw]') };
  const msg = modal.querySelector('#auth-msg'), go = modal.querySelector('#auth-go'), keysEl = modal.querySelector('#auth-keys');

  function draw() {
    for (const f of ['email', 'pw']) {
      const v = fields[f].querySelector('.val'), t = f === 'pw' && !showPw ? '•'.repeat(vals.pw.length) : vals[f];
      v.textContent = t || 'tap, then type'; v.classList.toggle('empty', !t);
      fields[f].classList.toggle('active', active === f);
    }
    fields.pw.querySelector('.auth-show').textContent = showPw ? 'Hide' : 'Show';
    keysEl.innerHTML = '';
    LAYERS[layer].forEach(row => {
      const r = document.createElement('div'); r.className = 'auth-row';
      row.forEach(k => {
        const b = document.createElement('div'); b.dataset.k = k;
        b.className = 'auth-k' + (['shift','back','sym','abc'].includes(k) ? ' wide' : k === 'space' ? ' space' : '') + (k === 'shift' && shift ? ' on' : '');
        b.textContent = LABEL[k] || (shift && /^[a-z]$/.test(k) ? k.toUpperCase() : k);
        // pointerdown, not click: the page's double-tap-zoom guard can swallow a click that follows a recent tap
        b.addEventListener('pointerdown', e => { e.preventDefault(); press(k); });
        r.appendChild(b);
      });
      keysEl.appendChild(r);
    });
  }
  function press(k) {
    if (busy) return;
    msg.textContent = '';
    if (k === 'shift') { shift = !shift; draw(); return; }
    if (k === 'sym' || k === 'abc') { layer = k; shift = false; draw(); return; }
    if (k === 'back') vals[active] = vals[active].slice(0, -1);
    else if (vals[active].length < 80) {
      vals[active] += k === 'space' ? ' ' : (shift && /^[a-z]$/.test(k) ? k.toUpperCase() : k);
      shift = false;
    }
    draw();
  }
  async function submit() {
    if (busy) return;
    if (!vals.email.trim() || !vals.pw) { msg.textContent = 'Enter your email and password.'; return; }
    busy = true; go.disabled = true; go.textContent = 'Signing in…'; msg.textContent = '';
    try { await onSubmit(vals.email.trim(), vals.pw); localStorage.setItem('taxi-auth-email', vals.email.trim()); vals.pw = ''; showPw = false; }
    catch (e) { msg.textContent = errorText(e); vals.pw = ''; active = 'pw'; }
    busy = false; go.disabled = false; go.textContent = 'Sign in'; draw();
  }
  for (const f of ['email', 'pw']) fields[f].addEventListener('pointerdown', e => {
    e.preventDefault();
    if (e.target.closest('.auth-show')) { showPw = !showPw; } else { active = f; }
    draw();
  });
  go.addEventListener('pointerdown', e => { e.preventDefault(); submit(); });
  document.addEventListener('keydown', e => {            // physical keyboard (desktop)
    if (!modal.classList.contains('visible') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter') { if (active === 'email') { active = 'pw'; draw(); } else submit(); }
    else if (e.key === 'Tab') { active = active === 'email' ? 'pw' : 'email'; draw(); }
    else if (e.key === 'Backspace') press('back');
    else if (e.key.length === 1) { if (busy) return; msg.textContent = ''; if (vals[active].length < 80) vals[active] += e.key; draw(); }
    else return;
    e.preventDefault();
  });
  draw();
  return { show() { modal.classList.add('visible'); draw(); }, hide() { modal.classList.remove('visible'); }, isOpen: () => modal.classList.contains('visible') };
}

export async function setupAuth(app, { autoPrompt = false } = {}) {
  if (!AUTH_CONFIGURED) {
    const none = { enabled: false, user: () => null, label: () => '', requireSignIn: async () => null, signOut: async () => {}, onChange() {} };
    return none;
  }
  const m = await import(AUTH_URL);
  const auth = m.getAuth(app);
  let current = null, wanted = autoPrompt;
  const listeners = [], waiting = [];
  const ui = buildUi((email, pw) => m.signInWithEmailAndPassword(auth, email, pw));
  await new Promise(res => {
    let first = true;
    m.onAuthStateChanged(auth, u => {
      current = u;
      if (u) { ui.hide(); waiting.splice(0).forEach(r => r(u)); } else if (wanted) ui.show();
      listeners.forEach(f => f(u));
      if (first) { first = false; res(); }
    });
  });
  return {
    enabled: true,
    user: () => current,
    label: () => current ? (current.displayName || String(current.email || 'user').split('@')[0]) : '',
    requireSignIn: () => current ? Promise.resolve(current) : new Promise(r => { wanted = true; waiting.push(r); ui.show(); }),
    signOut: () => m.signOut(auth),
    onChange: f => listeners.push(f)
  };
}
