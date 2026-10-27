/* Shared editor for stand.html (Firebase, shared queue) and personal.html (this browser only).
   The page sets window.TAXI_MODE before loading this file. */
import { tick, alertBeep } from './taxi-sound.js?v=1';

const PERSONAL = window.TAXI_MODE === 'personal';
const STORAGE_KEY = 'taxi-queue-personal';

/* ── FIREBASE (stand only; personal never touches the network) ── */
let fb = {}, db = null, queueRef = null, historyRef = null, maxRef = null, request1011Ref = null;
let auth = { enabled: false, user: () => null, label: () => '', requireSignIn: async () => null, signOut: async () => {}, onChange() {} };
if (!PERSONAL) {
  const [{ initializeApp }, dbm, { FIREBASE_CONFIG }, { setupAuth }] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js'),
    import('./taxi-config.js'),
    import('./taxi-auth.js?v=4'),
  ]);
  fb = dbm;
  const app = initializeApp(FIREBASE_CONFIG);
  db             = fb.getDatabase(app);
  queueRef       = fb.ref(db, 'queue');
  historyRef     = fb.ref(db, 'history');
  maxRef         = fb.ref(db, 'maxNum');
  request1011Ref = fb.ref(db, 'request1011');
  auth = await setupAuth(app, { autoPrompt: true });   // dispatcher sign-in (does nothing until taxi-config.js has a real key)
}

const syncEl = document.getElementById('sync-status');
let signOutArmed = false;
syncEl.addEventListener('pointerdown', e => {
  if (PERSONAL || !auth.enabled) return;
  e.preventDefault();
  if (!auth.user()) { auth.requireSignIn(); return; }
  if (!signOutArmed) { signOutArmed = true; syncEl.textContent = 'SIGN OUT?'; setTimeout(() => { signOutArmed = false; setSync('ok'); }, 3000); return; }
  signOutArmed = false; auth.signOut();
});
if (!PERSONAL) { auth.onChange(() => setSync('ok')); setSync('ok'); }
function setSync(state) {
  if (!PERSONAL && auth.enabled && !auth.user()) { syncEl.className = 'error'; syncEl.textContent = 'SIGN IN'; return; }
  syncEl.className = state;
  syncEl.textContent = state === 'ok' ? (PERSONAL ? 'SAVED' : 'LIVE') : state === 'saving' ? 'SAVING…' : (PERSONAL ? 'ERROR' : 'OFFLINE');
}


/* ── DEVICE NAME ── */
function getOSType() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua))    return 'iPhone';
  if (/iPad/.test(ua))      return 'iPad';
  if (/Android/.test(ua))   return 'Android';
  if (/Windows/.test(ua))   return 'Windows';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Linux/.test(ua))     return 'Linux';
  return 'Unknown';
}

function getFullDeviceLabel() {
  return `${auth.label() || 'Unknown'} — ${getOSType()}`;
}

/* ── LOG CHANGE ── */
function logChange(action, value) {
  if (PERSONAL || value === 'Filler') return;
  fb.push(historyRef, {
    action,
    value: String(value),
    device: getFullDeviceLabel(),
    ts: Date.now()
  }).catch(onWriteError);
}
function onWriteError(e) {
  setSync('error');
  if (auth.enabled && e && /permission/i.test(e.code + ' ' + e.message)) auth.requireSignIn();
}

/* Debounce saves so rapid drags don't spam Firebase */
let saveTimer = null;
function saveToFirebase() {
  setSync('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (PERSONAL) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(queue)); setSync('ok'); } catch (e) { setSync('error'); }
      return;
    }
    // one atomic write: the queue plus a server-side 'last updated' time that the live view shows
    fb.update(fb.ref(db), { queue: queue.length ? queue : null, updatedAt: fb.serverTimestamp() })
      .then(() => setSync('ok'))
      .catch(onWriteError);
  }, 300);
}

/* ── DYNAMIC TILE SIZING ── */
let COLS = parseInt(localStorage.getItem('taxi-cols') || '10');

function calcTileSize() {
  const pad = 10*2;
  const labelW = 30;
  const gaps = (COLS-1)*4;
  const size = Math.floor((document.documentElement.clientWidth - pad - labelW - gaps) / COLS);
  document.documentElement.style.setProperty('--tile', size + 'px');
}
calcTileSize();
// iOS reports the old width at the moment of rotation, so re-measure again shortly after
function relayout() { calcTileSize(); render(); }
function relayoutSoon() { relayout(); setTimeout(relayout, 120); setTimeout(relayout, 450); }
window.addEventListener('resize', relayoutSoon);
window.addEventListener('orientationchange', relayoutSoon);
if (window.visualViewport) window.visualViewport.addEventListener('resize', relayoutSoon);

const zoomBtn = document.getElementById('zoom-btn');
// Sync button label to saved state on load
zoomBtn.textContent = COLS === 5 ? 'Smaller Tiles' : 'Bigger Tiles';
zoomBtn.classList.toggle('active', COLS === 5);

zoomBtn.addEventListener('click', () => {
  COLS = COLS === 10 ? 5 : 10;
  localStorage.setItem('taxi-cols', COLS);
  zoomBtn.textContent = COLS === 5 ? 'Smaller Tiles' : 'Bigger Tiles';
  zoomBtn.classList.toggle('active', COLS === 5);
  calcTileSize();
  render();
});

/* ── STATE ── */
let MAX_NUM = parseInt(localStorage.getItem('taxi-max-num') || '140');
let queue = [];
let pool  = new Set();
for (let i = 1; i <= MAX_NUM; i++) pool.add(i);
let loadedPrimed = false;
let clearGuardUntil = 0; // blocks taps on 'Clear all?' until the finger that armed it has been released
let clearState = 0; // 0=normal, 1=clear-armed, 2=confirm

/* Rebuild pool from queue */
function rebuildPool(q) {
  pool = new Set();
  for (let i = 1; i <= MAX_NUM; i++) pool.add(i);
  for (const v of q) if (typeof v === 'number') pool.delete(v);
}

if (!PERSONAL) {
  /* ── LISTEN for remote changes ── */
  fb.onValue(queueRef, snapshot => {
    const data = snapshot.val();
    queue = Array.isArray(data) ? data : (data ? Object.values(data) : []);
    rebuildPool(queue);
    render();
  });

  fb.onValue(maxRef, snapshot => {
    const val = snapshot.val();
    if (val && typeof val === 'number' && val !== MAX_NUM) {
      MAX_NUM = val;
      localStorage.setItem('taxi-max-num', MAX_NUM);
      rebuildPool(queue);
      render();
    }
  });

  fb.onValue(request1011Ref, snapshot => {
    const req = snapshot.val();
    if (!req || !req.number) return;
    showReq1011(req.number);
  });
} else {
  /* personal: load this browser's saved queue (older saves used 'filler' for fillers) */
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) queue = JSON.parse(raw).map(v => v === 'filler' ? 'dummy' : v);
  } catch (e) { queue = []; }
  rebuildPool(queue);
}

/* ── MY NUMBER (personal mode highlights your own tile) ── */
let myNumber = PERSONAL ? (parseInt(localStorage.getItem('taxi-my-number') || '0') || null) : null;
if (PERSONAL) {
  /* ── TAXI NUMBER BOX (in-page dial pad; window.prompt blocks first paint and has no keypad in installed iPhone apps) ── */
  const numModal = document.getElementById('num-modal');
  const numDisplay = document.getElementById('num-display');
  const numErr   = document.getElementById('num-err');
  let numValue = '';
  function numRender() { numDisplay.innerHTML = numValue + '<span class="caret"></span>'; }
  function showNumberModal() {
    numValue = ''; numErr.textContent = ''; numRender();
    numModal.classList.add('visible');
  }
  function ensureMyNumber() { if (!myNumber) showNumberModal(); }
  function saveMyNumber() {
    const num = parseInt(numValue, 10);
    if (isNaN(num) || num < 1 || num > MAX_NUM) { numValue = ''; numRender(); numErr.textContent = `Enter a number from 1 to ${MAX_NUM}.`; return; }
    myNumber = num;
    localStorage.setItem('taxi-my-number', num);
    numModal.classList.remove('visible');
    render();
  }
  function numPress(k) {
    numErr.textContent = '';
    if (k === '⌫') numValue = numValue.slice(0, -1);
    else if (k === 'Save') { saveMyNumber(); return; }
    else if (numValue.length < 3) numValue += k;
    numRender();
  }
  // pointerdown, not click: the page's double-tap-zoom guard can swallow a click that follows a recent tap
  ['1','2','3','4','5','6','7','8','9','⌫','0','Save'].forEach(k => {
    const b = document.createElement('div');
    b.className = 'num-key' + (k === '⌫' ? ' fn' : k === 'Save' ? ' fn go' : '');
    b.textContent = k;
    b.addEventListener('pointerdown', e => { e.preventDefault(); tick(); numPress(k); });
    document.getElementById('num-keys').appendChild(b);
  });
  document.getElementById('num-skip').addEventListener('pointerdown', e => { e.preventDefault(); numModal.classList.remove('visible'); });
  // physical keyboard (desktop)
  document.addEventListener('keydown', e => {
    if (!numModal.classList.contains('visible') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[0-9]$/.test(e.key)) numPress(e.key);
    else if (e.key === 'Backspace') numPress('⌫');
    else if (e.key === 'Enter') numPress('Save');
    else return;
    e.preventDefault();
  });

  setTimeout(ensureMyNumber, 0); // after first paint
}

/* ── DOM ── */
const qGrid      = document.getElementById('queue-grid');
const qGrpHdrs   = document.getElementById('group-headers');
const qColHdrs   = document.getElementById('col-headers');
const qRowLabels = document.getElementById('row-labels');
const pGrid      = document.getElementById('pool-grid');
const ghostEl    = document.getElementById('ghost');

/* ── RENDER ── */
function render() { renderQueue(); renderPool(); }

function renderQueue() {
  const qLen = queue.length;
  const slotsPer = COLS - 1; const rows = (qLen + 1) <= slotsPer ? 1 : 1 + Math.ceil((qLen + 1 - slotsPer) / COLS);
  const prevRowCount = qGrid.querySelectorAll('.qrow').length;
  qGrid.innerHTML = '';

  const tileSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tile'));
  const gap = 4;

  /* Group headers */
  qGrpHdrs.innerHTML = '';
  const spacer = document.createElement('div');
  spacer.className = 'grp-spacer';
  spacer.style.width = tileSize + 'px';
  qGrpHdrs.appendChild(spacer);
  const standLbl = document.createElement('div');
  standLbl.className = 'grp-label grp-stand';
  standLbl.style.width = (4*tileSize + 3*gap) + 'px';
  standLbl.textContent = 'Stand';
  qGrpHdrs.appendChild(standLbl);
  const gs = document.createElement('div');
  gs.style.width = gap + 'px';
  qGrpHdrs.appendChild(gs);
  const holdLbl = document.createElement('div');
  holdLbl.className = 'grp-label grp-holding';
  holdLbl.style.width = (4*tileSize + 3*gap) + 'px';
  holdLbl.textContent = 'Holding';
  qGrpHdrs.appendChild(holdLbl);

  /* Col headers */
  qColHdrs.innerHTML = '';
  qColHdrs.appendChild(Object.assign(document.createElement('div'), {className:'col-header'}));
  for (let c = 1; c < COLS; c++) {
    const ch = document.createElement('div');
    ch.className = 'col-header'; ch.textContent = c;
    qColHdrs.appendChild(ch);
  }

  /* Row labels */
  qRowLabels.innerHTML = '';
  qRowLabels.style.display = 'flex';
  for (let row = 0; row < rows; row++) {
    const rl = document.createElement('div');
    rl.className = 'row-label';
    rl.textContent = row === 0 ? '0' : row * COLS;
    qRowLabels.appendChild(rl);
  }

  /* Tiles */
  for (let row = 0; row < rows; row++) {
    const rowEl = document.createElement('div');
    rowEl.className = 'qrow';
    if (row >= prevRowCount) rowEl.classList.add('new-row');

    for (let col = 0; col < COLS; col++) {
      const tile = document.createElement('div');
      tile.className = 'tile';

      if (row === 0 && col === 0) {
        tile.classList.add('q-zero');
        tile.style.textAlign = 'center';
        tile.style.lineHeight = '1.2';
        tile.style.padding = '4px';
        if (clearState === 1) {
          tile.textContent = 'Clear all?';
          tile.style.fontSize = 'calc(var(--tile) * 0.17)';
          tile.classList.add('clear-armed');
        } else if (clearState === 2) {
          tile.textContent = 'Are you sure?';
          tile.style.fontSize = 'calc(var(--tile) * 0.15)';
          tile.classList.add('clear-confirm');
        } else if (loadedPrimed && queue.length > 0) {
          tile.textContent = 'Loaded';
          tile.style.fontSize = 'calc(var(--tile) * 0.20)';
          tile.classList.add('primed');
        } else {
          tile.textContent = 'Loading';
          tile.style.fontSize = 'calc(var(--tile) * 0.20)';
        }
        tile.dataset.role = 'zero';

        let zeroHold = null;
        const fireHold = () => { zeroHold = null; clearSelected(); clearState = 1; clearGuardUntil = Infinity; render(); };
        const releaseGuard = () => { lastTouchTime = Date.now(); if (clearGuardUntil === Infinity) clearGuardUntil = Date.now() + 600; };
        tile.addEventListener('touchstart', () => {
          lastTouchTime = Date.now();
          zeroHold = setTimeout(fireHold, HOLD_MS);
        }, { passive: true });
        tile.addEventListener('touchmove', () => {
          if (zeroHold) { clearTimeout(zeroHold); zeroHold = null; }
        }, { passive: true });
        tile.addEventListener('touchcancel', releaseGuard);
        tile.addEventListener('touchend', e => {
          e.preventDefault();
          releaseGuard();
          if (zeroHold) { clearTimeout(zeroHold); zeroHold = null; handleTap(tile); }
        });
        tile.addEventListener('mousedown', e => {
          if (e.button !== 0 || Date.now() - lastTouchTime < 500) return;
          e.preventDefault();
          zeroHold = setTimeout(fireHold, HOLD_MS);
          const onMove = () => { if (zeroHold) { clearTimeout(zeroHold); zeroHold = null; } };
          const onUp = () => {
            releaseGuard();
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (zeroHold) { clearTimeout(zeroHold); zeroHold = null; handleTap(tile); }
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
      } else {
        const qIdx = row === 0 ? (col-1) : ((COLS-1) + (row-1)*COLS + col);
        if (qIdx < queue.length) {
          const val = queue[qIdx];
          const isDummy = (val === 'dummy');
          if (isDummy) {
            tile.textContent = 'Filler';
            tile.style.cssText = 'background:rgba(180,180,180,.15);border:1.5px solid rgba(255,255,255,.18);color:rgba(255,255,255,.5);font-size:calc(var(--tile)*0.16);';
          } else {
            tile.textContent = val;
            tile.classList.add(qIdx < 4 ? 'q-stand' : qIdx < 8 ? 'q-hold' : 'q-overflow');
            if (PERSONAL && val === myNumber) tile.classList.add('my-tile');
          }
          tile.dataset.role = 'queue';
          tile.dataset.qidx = qIdx;
          tile.dataset.val  = val;
          if (qIdx === selectedQIdx) tile.classList.add('selected');
          if (qIdx === replaceIdx) tile.classList.add('replace-target');
          if (loadedPrimed && qIdx === 0) tile.classList.add('load-target');
          if (qIdx === 9 || qIdx === 14 || qIdx === 19) tile.classList.add('landmark');
          attachDrag(tile, 'queue', qIdx, val);
        } else {
          tile.dataset.role = 'empty';
          tile.dataset.qidx = qIdx;
          if (qIdx === queue.length) {
            // The next available slot — show as + button
            tile.classList.add('q-add');
            tile.textContent = '+';
            tile.addEventListener('click', () => openDialpad());
            tile.addEventListener('touchend', e => { e.preventDefault(); openDialpad(); }, { passive:false });
          } else {
            tile.classList.add('q-empty');
            if (qIdx > queue.length) tile.classList.add('hidden-slot');
          }
        }
      }
      rowEl.appendChild(tile);
    }
    qGrid.appendChild(rowEl);
  }
}

function renderPool() {
  pGrid.innerHTML = '';
  pGrid.style.gridTemplateColumns = `repeat(${COLS}, var(--tile))`;
  // Dummy-front tile — always first, inserts at front of queue
  const dummyFront = document.createElement('div');
  dummyFront.className = 'tile';
  dummyFront.innerHTML = 'Filler<br>In-Front';
  dummyFront.style.cssText = 'background:rgba(180,180,180,.15);border:1.5px solid rgba(255,255,255,.18);color:rgba(255,255,255,.5);font-size:calc(var(--tile)*0.13);text-align:center;line-height:1.2;';
  dummyFront.dataset.role = 'dummy-front-src';
  dummyFront.dataset.val  = 'dummy';
  attachDrag(dummyFront, 'dummy-front-src', null, 'dummy');
  pGrid.appendChild(dummyFront);

  // Dummy tile — always second, inserts at end of queue
  const dummy = document.createElement('div');
  dummy.className = 'tile';
  dummy.textContent = 'Filler';
  dummy.style.cssText = 'background:rgba(180,180,180,.15);border:1.5px solid rgba(255,255,255,.18);color:rgba(255,255,255,.5);font-size:calc(var(--tile)*0.16);';
  dummy.dataset.role = 'dummy-src';
  dummy.dataset.val  = 'dummy';
  attachDrag(dummy, 'dummy-src', null, 'dummy');
  pGrid.appendChild(dummy);

  [...pool].sort((a,b)=>a-b).forEach(num => {
    const tile = document.createElement('div');
    tile.className = 'tile pool';
    tile.textContent = num;
    if (PERSONAL && num === myNumber) tile.classList.add('my-tile');
    tile.dataset.role = 'pool';
    tile.dataset.val  = num;
    attachDrag(tile, 'pool', null, num);
    pGrid.appendChild(tile);
  });

  const maxTile = document.createElement('div');
  maxTile.className = 'tile';
  maxTile.style.cssText = 'background:rgba(128,216,255,.06);border:1.5px dashed rgba(128,216,255,.2);color:rgba(128,216,255,.4);font-size:calc(var(--tile)*0.13);text-align:center;line-height:1.2;padding:4px;cursor:pointer;';
  maxTile.textContent = 'adjust highest taxi number';
  maxTile.addEventListener('click', () => openMaxDialpad());
  maxTile.addEventListener('touchend', e => { e.preventDefault(); openMaxDialpad(); }, { passive: false });
  pGrid.appendChild(maxTile);
}

/* ── 10-11 REQUEST MODAL ── */
let alertTimer = null;
function showReq1011(num) {
  const modal  = document.getElementById('req1011-modal');
  const msgEl  = document.getElementById('req1011-msg');
  const okBtn  = document.getElementById('req1011-ok');
  const undoBtn = document.getElementById('req1011-undo');
  msgEl.textContent = `#${num} has requested a 10-11`;
  modal.classList.add('visible');
  // sound + buzz now, and again every 5 s until the dispatcher answers
  clearInterval(alertTimer); alertBeep(); alertTimer = setInterval(alertBeep, 5000);

  const cleanup = () => {
    clearInterval(alertTimer);
    modal.classList.remove('visible');
    fb.set(request1011Ref, null);
    okBtn.onclick = null;
    undoBtn.onclick = null;
  };

  okBtn.onclick = () => {
    const idx = queue.indexOf(num);
    if (idx !== -1) mutate(() => { queue.splice(idx, 1); pool.add(num); }, 'req1011', num);
    cleanup();
  };
  undoBtn.onclick = cleanup;
}

/* ── STATE MUTATORS (all call saveToFirebase) ── */
function mutate(fn, action, value) {
  cancelReplace();
  pushUndo(action ? action + (value !== undefined ? ' ' + value : '') : 'change');
  fn();
  rebuildPool(queue);
  if (action && value !== undefined) logChange(action, value);
  saveToFirebase();
  render();
}

/* ── UNDO ── */
const undoBtn = document.getElementById('undo-btn');
const undoStack = [];
function syncUndoBtn() { undoBtn.disabled = !undoStack.length; }
function pushUndo(label) {
  undoStack.push({ q: queue.slice(), label });
  if (undoStack.length > 30) undoStack.shift();
  syncUndoBtn();
}
function doUndo() {
  const u = undoStack.pop(); if (!u) return;
  cancelReplace(); clearSelected();
  queue = u.q; rebuildPool(queue);
  logChange('undo', u.label);
  saveToFirebase(); syncUndoBtn(); render();
}
undoBtn.addEventListener('pointerdown', e => { e.preventDefault(); doUndo(); });

/* ── DRAG & DROP ── */
const HOLD_MS = 350;
const MOVE_PX = 10;

const dnd = {
  active: false,
  srcEl: null, val: null, source: null, srcIdx: null,
  ox: 0, oy: 0,
  startX: 0, startY: 0,
  holdTimer: null,
  canceled: false,
};

let lastTouchTime = 0; // track last touch to block synthetic mouse events on mobile

function attachDrag(el, source, idx, val) {
  // ── MOUSE (desktop) ──
  el.addEventListener('dragstart', e => e.preventDefault());
  el.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    // Block synthetic mouse events fired by browser after touch (iOS/Android)
    if (Date.now() - lastTouchTime < 500) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    Object.assign(dnd, { srcEl:el, val, source, srcIdx:idx, canceled:false,
      ox:e.clientX-r.left, oy:e.clientY-r.top,
      startX:e.clientX, startY:e.clientY, active:false });
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);
  });

  // ── TOUCH (mobile) — passive so scroll is never blocked ──
  el.addEventListener('touchstart', e => {
    lastTouchTime = Date.now(); // mark that a real touch happened
    const t = e.touches[0];
    const r = el.getBoundingClientRect();
    Object.assign(dnd, { srcEl:el, val, source, srcIdx:idx, canceled:false,
      ox:t.clientX-r.left, oy:t.clientY-r.top,
      startX:t.clientX, startY:t.clientY, active:false });

    // Hold timer — fires after HOLD_MS if finger hasn't moved much
    dnd.holdTimer = setTimeout(() => {
      if (!dnd.canceled) activateDrag(dnd.startX, dnd.startY);
    }, HOLD_MS);

    el.addEventListener('touchmove',   onTouchMove,   { passive:false });
    document.addEventListener('touchend',    onTouchEnd,    { once:true });
    document.addEventListener('touchcancel', onTouchCancel, { once:true });
  }, { passive:true });
}

// ── Activate drag (show ghost etc) ──
function activateDrag(cx, cy) {
  if (dnd.canceled) return;
  if (dnd.source === 'zero') { dnd.canceled = true; return; }
  clearSelected();
  dnd.active = true;
  const el = dnd.srcEl;
  const bg  = getComputedStyle(el).backgroundColor;
  const col = getComputedStyle(el).color;
  ghostEl.style.cssText = `background:${bg};color:${col};display:flex;`;
  ghostEl.textContent = (dnd.val === 'dummy') ? 'Filler' : dnd.val;
  moveGhost(cx, cy);
  el.classList.add('dragging');
}

// ── MOUSE handlers ──
function onMouseMove(e) {
  if (!dnd.active) {
    const dx = e.clientX - dnd.startX, dy = e.clientY - dnd.startY;
    if (Math.sqrt(dx*dx+dy*dy) > MOVE_PX) activateDrag(e.clientX, e.clientY);
    else return;
  }
  moveGhost(e.clientX, e.clientY);
  updatePreview(e.clientX, e.clientY);
}

function onMouseUp(e) {
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup',   onMouseUp);
  if (!dnd.active) {
    const el = dnd.srcEl;
    resetDnd();
    handleTap(el);
    return;
  }
  ghostEl.style.display = 'none';
  const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.tile');
  const el = dnd.srcEl;
  // doDrop reads dnd state — call BEFORE resetDnd
  doDrop(target);
  finishDrag(el);
  resetDnd();
}

// ── TOUCH handlers ──
function onTouchMove(e) {
  const t = e.touches[0];
  const dx = t.clientX - dnd.startX, dy = t.clientY - dnd.startY;
  if (!dnd.active) {
    // Finger moved before hold fired — cancel drag, allow scroll
    if (Math.sqrt(dx*dx+dy*dy) > MOVE_PX) {
      clearTimeout(dnd.holdTimer);
      dnd.canceled = true;
      cancelTouchDrag();
    }
    // Don't preventDefault — let scroll happen freely
    return;
  }
  // Drag is active — prevent scroll so ghost can move
  e.preventDefault();
  moveGhost(t.clientX, t.clientY);
  updatePreview(t.clientX, t.clientY);
}

function onTouchEnd(e) {
  clearTimeout(dnd.holdTimer);
  dnd.srcEl?.removeEventListener('touchmove', onTouchMove);
  document.removeEventListener('touchcancel', onTouchCancel);
  if (!dnd.active) {
    const el = dnd.srcEl;
    const wasCanceled = dnd.canceled;
    resetDnd();
    if (!wasCanceled) handleTap(el);
    return;
  }
  const t = e.changedTouches[0];
  const cx = t.clientX, cy = t.clientY;
  // Hide ghost so elementFromPoint sees the tile underneath
  ghostEl.style.display = 'none';
  // Also temporarily hide the dragging tile so we see what's behind it
  dnd.srcEl?.style.setProperty('visibility','hidden');
  const target = document.elementFromPoint(cx, cy)?.closest('.tile');
  dnd.srcEl?.style.removeProperty('visibility');
  const el = dnd.srcEl;
  doDrop(target);
  finishDrag(el);
  resetDnd();
}

function onTouchCancel() {
  clearTimeout(dnd.holdTimer);
  cancelTouchDrag();
}

function cancelTouchDrag() {
  dnd.srcEl?.removeEventListener('touchmove',   onTouchMove);
  document.removeEventListener('touchend',    onTouchEnd);
  document.removeEventListener('touchcancel', onTouchCancel);
  finishDrag(dnd.srcEl);
  resetDnd();
}

function resetDnd() {
  dnd.active=false; dnd.srcEl=null; dnd.val=null; dnd.source=null;
  dnd.srcIdx=null; dnd.holdTimer=null; dnd.canceled=false;
}

function finishDrag(el) {
  clearPreview();
  ghostEl.style.display = 'none';
  clearDropHL();
  qGrid.querySelectorAll('.tile[data-qidx]').forEach(t => t.style.marginLeft = '');
  el?.classList.remove('dragging', 'drag-ready');
}


/* ── DIAL PAD (on-page) ── */
const tabNQ = document.getElementById('tab-nq'), tabPad = document.getElementById('tab-pad');
const padPanel = document.getElementById('pad-panel'), padDisplay = document.getElementById('pad-display');
let padValue = '', padMode = 'add', replaceIdx = -1;
const padKeyEls = {};
function cancelReplace() {
  if (replaceIdx >= 0) { replaceIdx = -1; document.querySelectorAll('.tile.replace-target').forEach(t => t.classList.remove('replace-target')); }
  if (padMode === 'replace') { padMode = 'add'; padValue = ''; padRender(); }
}
function showTab(which) {
  const pad = which === 'pad';
  tabPad.classList.toggle('active', pad); tabNQ.classList.toggle('active', !pad);
  padPanel.style.display = pad ? 'block' : 'none';
  pGrid.style.display = pad ? 'none' : '';
  if (!pad) { document.body.style.minHeight = ''; cancelReplace(); }
}
function escapeHtml(t) { return String(t).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function padRender(err) {
  const rep = padMode === 'replace';
  if (padKeyEls['Add']) {
    padKeyEls['Add'].textContent = rep ? 'Replace' : 'Add';
    ['Filler In-Front','Filler','Add In-Front'].forEach(k => padKeyEls[k].classList.toggle('dim', rep));
  }
  padDisplay.classList.toggle('err', !!err);
  if (err) { padDisplay.textContent = err; return; }
  padDisplay.innerHTML = escapeHtml(padValue) + '<span class="caret"></span>' + (padMode === 'max' ? '<small>HIGHEST #</small>' : rep ? '<small>REPLACE FILLER</small>' : '');
}
function openDialpad() { cancelReplace(); padMode = 'add'; padValue = ''; padRender(); showTab('pad'); padPanel.scrollIntoView({block:'nearest', behavior:'smooth'}); }
function openMaxDialpad() { cancelReplace(); padMode = 'max'; padValue = ''; padRender(); showTab('pad'); padPanel.scrollIntoView({block:'nearest', behavior:'smooth'}); }
function padSubmit(front) {
  const raw = padValue; if (!raw) return;
  const num = parseInt(raw, 10);
  if (padMode === 'max') {
    if (isNaN(num) || num < (PERSONAL ? 1 : 140)) { padValue = ''; padRender(PERSONAL ? `${num} is not valid.` : `${num} is too low — minimum is 140.`); return; }
    padValue = ''; padMode = 'add';
    MAX_NUM = num; localStorage.setItem('taxi-max-num', MAX_NUM); if (!PERSONAL) fb.set(maxRef, MAX_NUM); rebuildPool(queue);
    padRender(); render(); return;
  }
  if (isNaN(num) || num < 1 || num > MAX_NUM) { padValue = ''; padRender(`${raw} is not valid (1–${MAX_NUM}).`); return; }
  if (!pool.has(num)) { padValue = ''; padRender(`Taxi ${num} is already in the queue.`); return; }
  if (padMode === 'replace') {
    const i = replaceIdx;
    if (queue[i] !== 'dummy') { cancelReplace(); padRender('That filler moved — tap it again.'); return; }
    padValue = ''; replaceIdx = -1; padMode = 'add'; clearSelected();
    mutate(() => { pool.delete(num); queue[i] = num; }, 'added', num);
    padRender(); return;
  }
  padValue = '';
  mutate(() => { pool.delete(num); front ? queue.unshift(num) : queue.push(num); }, 'added', num);
  padRender();
}
// If a key press adds a queue row, the pad shifts down — scroll by the same amount so it stays under the finger
function padKeep(fn) { keepPlace(padPanel, fn); }
function keepPlace(el, fn) {
  const before = el.getBoundingClientRect().top;
  fn();
  const d = el.getBoundingClientRect().top - before;
  if (d > 0) {
    // Page may be too short to scroll that far yet — add blank space at the bottom so it can
    const need = window.scrollY + d + window.innerHeight;
    if (document.documentElement.scrollHeight < need) document.body.style.minHeight = need + 'px';
    window.scrollBy(0, d);
  }
}
function padPress(k) {
  if (padMode === 'replace' && (k === 'Filler' || k === 'Filler In-Front' || k === 'Add In-Front')) return;
  if (k === '⌫') padValue = padValue.slice(0, -1);
    else if (k === 'Add') { padSubmit(false); return; }
    else if (k === 'Add In-Front') { padSubmit(true); return; }
    else if (k === 'Filler' || k === 'Filler In-Front') { const front = k !== 'Filler'; mutate(() => { front ? queue.unshift('dummy') : queue.push('dummy'); }, 'added', 'Filler'); return; }
    else if (padValue.length < 3) padValue += k;
    padRender();
}
['1','2','3','4','5','6','7','8','9','⌫','0','Add','Filler In-Front','Filler','Add In-Front'].forEach(k => {
  const b = document.createElement('div');
  b.className = 'pad-key' + (k === '⌫' ? ' fn' : k === 'Add' || k === 'Add In-Front' ? ' fn go' : k.startsWith('Filler') ? ' fn filler' : '');
  b.textContent = k; padKeyEls[k] = b;
  // pointerdown fires instantly for touch + mouse, so rapid taps are never swallowed by the double-tap guard
  b.addEventListener('pointerdown', e => { e.preventDefault(); tick(); padKeep(() => padPress(k)); });
  document.getElementById('pad-keys').appendChild(b);
});
padRender();   // show the blinking cursor before anything is typed
// Physical keyboard: digits, Backspace, Enter = Add (Replace), Shift+Enter = Add In-Front
document.addEventListener('keydown', e => {
  if (document.querySelector('#auth-modal.visible, #num-modal.visible') || padPanel.style.display !== 'block' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest && e.target.closest('input, textarea')) return;
  let k = null;
  if (/^[0-9]$/.test(e.key)) k = e.key;
  else if (e.key === 'Backspace') k = '⌫';
  else if (e.key === 'Enter') k = e.shiftKey ? 'Add In-Front' : 'Add';
  if (!k) return;
  e.preventDefault();
  padKeep(() => padPress(k));
});
tabNQ.addEventListener('click', () => showTab('nq'));
tabPad.addEventListener('click', () => { if (padMode === 'add') padRender(); showTab('pad'); });

/* ── SELECTED TILE (double-tap to remove) ── */
let selectedQIdx = -1; // track by queue index, not element ref (DOM rebuilds on render)

function clearSelected() {
  selectedQIdx = -1;
  loadedPrimed = false;
  clearState = 0;
  clearGuardUntil = 0;
  qGrid.querySelectorAll('.tile.selected').forEach(t => t.classList.remove('selected'));
  qGrid.querySelectorAll('.tile.load-target').forEach(t => t.classList.remove('load-target'));
  const zeroTile = document.querySelector('.tile[data-role="zero"]');
  if (zeroTile) { zeroTile.classList.remove('primed', 'clear-armed', 'clear-confirm'); zeroTile.textContent = 'Loading'; }
}

// Clear selection when tapping outside a queue or loaded tile
document.addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch') return;
  if (!e.target.closest('.tile[data-role="queue"]') && !e.target.closest('.tile[data-role="zero"]')) clearSelected();
});
// Clear selection when tapping a blank area on mobile
document.addEventListener('touchend', e => {
  if (!e.target.closest('.tile[data-role="queue"]') && !e.target.closest('.tile[data-role="zero"]')) {
    setTimeout(clearSelected, 0); // defer so tile's own onTouchEnd runs first
  }
}, { passive:true });

function handleTap(el) {
  if (!el) return;
  const role=el.dataset.role, rawVal=el.dataset.val;
  const val = rawVal === 'dummy' ? 'dummy' : parseInt(rawVal);
  if (role==='zero') {
    if (clearState === 1) {
      if (Date.now() < clearGuardUntil) return; // still the same press that armed it
      clearSelected();
      pushUndo('clear all');
      queue.length = 0;
      rebuildPool(queue);
      saveToFirebase();
      render();
    } else if (loadedPrimed) {
      clearSelected();
      if (queue.length > 0) {
        const v = queue[0];
        if (v === 'dummy') mutate(() => { queue.splice(0, 1); }, 'loaded', 'Filler');
        else mutate(() => { queue.splice(0, 1); pool.add(v); }, 'loaded', v);
      }
    } else {
      if (queue.length === 0) return;
      clearSelected();
      loadedPrimed = true;
      render();
    }
  } else if (role==='dummy-src') {
    keepPlace(pGrid, () => mutate(() => { queue.push('dummy'); }, 'added', 'Filler'));
  } else if (role==='dummy-front-src') {
    keepPlace(pGrid, () => mutate(() => { queue.unshift('dummy'); }, 'added', 'Filler'));
  } else if (role==='pool') {
    keepPlace(pGrid, () => mutate(() => { pool.delete(val); queue.push(val); }, 'added', val));
  } else if (role==='queue') {
    const idx=parseInt(el.dataset.qidx);
    if (selectedQIdx === idx) {
      // Second tap — remove
      clearSelected();
      if (val === 'dummy') {
        mutate(() => { queue.splice(idx,1); }, 'removed', 'Filler');
      } else {
        mutate(() => { queue.splice(idx,1); pool.add(val); }, 'removed', val);
      }
    } else {
      // First tap — highlight
      clearSelected();
      selectedQIdx = idx;
      el.classList.add('selected');
      if (el.dataset.val === 'dummy' || el.dataset.val === 'filler') {
        // Filler: open the dial pad to replace it with a number
        cancelReplace();
        replaceIdx = idx; padMode = 'replace'; padValue = '';
        el.classList.add('replace-target');
        padRender(); showTab('pad'); padPanel.scrollIntoView({block:'nearest', behavior:'smooth'});
      } else cancelReplace();
    }
  }
}

function moveGhost(x,y) { ghostEl.style.left=(x-dnd.ox)+'px'; ghostEl.style.top=(y-dnd.oy)+'px'; }

function doDrop(target) {
  if (dnd.source === 'zero') return;
  const val=dnd.val, src=dnd.source, si=dnd.srcIdx;
  const isDummy = (val === 'dummy');

  // Use previewIdx as the canonical insertion point when set —
  // this covers the full gap zone (original tile position + shifted position)
  const ins = previewIdx >= 0 ? previewIdx : null;

  const role = target?.dataset.role;
  const ti   = parseInt(target?.dataset.qidx);

  // ── Pool / filler-src → queue ──
  if (src==='dummy-src' || src==='dummy-front-src' || src==='pool') {
    const isF = src==='dummy-src' || src==='dummy-front-src';
    const v   = isF ? 'dummy' : val;

    if (ins !== null) {
      // Dropped in the gap preview zone
      mutate(()=>{ if(!isF) pool.delete(val); queue.splice(ins,0,v); },
             'added', isF?'Filler':val);
      return;
    }
    if (role==='queue'||role==='empty') {
      const idx = isNaN(ti)||ti>queue.length ? queue.length : ti;
      mutate(()=>{ if(!isF) pool.delete(val); queue.splice(idx,0,v); },
             'added', isF?'Filler':val);
      return;
    }
    if (target?.closest('#queue-wrapper')) {
      const insertIdx = src==='dummy-front-src' ? 0 : queue.length;
      mutate(()=>{ if(!isF) pool.delete(val); queue.splice(insertIdx,0,v); },
             'added', isF?'Filler':val);
      return;
    }
    // Dropped back in pool area — do nothing (tap handles removal)
    return;
  }

  // ── Queue tile → zero/load slot ──
  if (src==='queue' && role==='zero') {
    if (isDummy) mutate(()=>{ queue.splice(si,1); }, 'loaded', 'Filler');
    else         mutate(()=>{ queue.splice(si,1); pool.add(val); }, 'loaded', val);
    return;
  }

  // ── Queue tile → reorder ──
  if (src==='queue') {
    // Use previewIdx if set, otherwise fall back to target tile index
    const dest = ins !== null ? ins : (!isNaN(ti) ? ti : null);
    if (dest !== null && dest !== si) {
      mutate(()=>{ queue.splice(si,1); queue.splice(dest>si?dest-1:dest,0,val); }, 'moved', val);
      return;
    }
    // Dropped back on pool → remove
    if (role==='pool'||role==='dummy-src'||role==='dummy-front-src') {
      if (isDummy) mutate(()=>{ queue.splice(si,1); }, 'removed', 'Filler');
      else         mutate(()=>{ queue.splice(si,1); pool.add(val); }, 'removed', val);
      return;
    }
  }
}

function clearDropHL() { document.querySelectorAll('.drop-ok').forEach(e=>e.classList.remove('drop-ok')); }

/* ── INSERT PREVIEW ── */
let previewIdx = -1; // queue index where gap is shown (-1 = none)

function updatePreview(cx, cy) {
  if (!['queue','pool','dummy-src','dummy-front-src'].includes(dnd.source)) { clearPreview(); return; }

  // Sample multiple points around the cursor to pierce through the ghost/gap
  ghostEl.style.display = 'none';
  const offsets = [[0,0],[0,-22],[0,22],[-22,0],[22,0]];
  let el = null;
  for (const [dx,dy] of offsets) {
    const hit = document.elementFromPoint(cx+dx, cy+dy)?.closest(
      '.tile[data-role="queue"],.tile[data-role="empty"]'
    );
    if (hit && hit !== dnd.srcEl) { el = hit; break; }
  }
  ghostEl.style.display = 'flex';

  // If over zero/load slot, clear
  if (el && el.dataset.role === 'zero') { clearPreview(); return; }

  if (el) {
    const ti = parseInt(el.dataset.qidx);
    if (!isNaN(ti) && ti !== previewIdx) {
      previewIdx = ti;
      applyPreview();
    }
    // same tile — hold steady
  }
  // No tile found = hovering the gap we created — hold steady, no update
}

function clearPreview() {
  if (previewIdx === -1) return;
  previewIdx = -1;
  applyPreview();
}

function applyPreview() {
  // All queue tiles: shift right if at/after previewIdx, to show a gap
  const tiles = qGrid.querySelectorAll('.tile[data-qidx]');
  tiles.forEach(t => {
    const qi = parseInt(t.dataset.qidx);
    const isSrc = (dnd.source === 'queue' && qi === dnd.srcIdx);
    if (previewIdx >= 0 && qi === previewIdx && !isSrc) {
      t.style.marginLeft = 'calc(var(--tile) + var(--gap) * 2)';
    } else {
      t.style.marginLeft = '';
    }
  });
}

/* ── DISABLE ZOOM ── */
// Block pinch-zoom
document.addEventListener('touchmove', e => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

// Block double-tap zoom
let lastTap = 0;
document.addEventListener('touchend', e => {
  const now = Date.now();
  if (now - lastTap < 300 && !(e.target.closest && e.target.closest('input'))) e.preventDefault();
  lastTap = now;
}, { passive: false });

/* ── KEEP THE SCREEN AWAKE (stand only; best effort, not every phone supports it) ── */
if (!PERSONAL && 'wakeLock' in navigator) {
  let lock = null;
  const keepAwake = async () => {
    if (lock || document.hidden) return;
    try { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } catch (e) { lock = null; }
  };
  keepAwake();
  document.addEventListener('visibilitychange', keepAwake);
  document.addEventListener('pointerdown', keepAwake);   // some phones only allow it after a touch
}

if (PERSONAL) render();   // stand renders when Firebase answers

// Open on the Dial Pad tab
showTab('pad');
