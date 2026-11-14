// Numbers for the stand's info tiles, worked out from the history log. Pure functions (no DOM) so they can be tested.
const MAX_WAIT = 6 * 3600 * 1000;   // an add-to-load gap longer than this is treated as a stale entry, not a wait
const LOAD_WINDOW = 3 * 3600 * 1000, MAX_GAPS = 8;   // load-rate estimate: look at the last 3 hours, at most 8 gaps

// Walks the history log and returns every 'loaded' entry, with the wait since that taxi was last added.
// An undone load is kept in the list but marked live:false.  Fillers are never logged, so only real taxi numbers are counted.
function scanLoads(entries) {
  const ev = entries.filter(e => e && typeof e.ts === 'number' && e.value !== 'Filler').sort((a, b) => a.ts - b.ts);
  const loads = [];
  const added = new Map();     // taxi number -> time it was last added
  for (const e of ev) {
    const v = e.value;
    if (e.action === 'added') added.set(v, e.ts);
    else if (e.action === 'loaded') {
      const a = added.get(v);
      loads.push({ ts: e.ts, value: v, wait: (a != null && e.ts > a && e.ts - a < MAX_WAIT) ? e.ts - a : null, live: true });
      added.delete(v);
    }
    else if (e.action === 'removed' || e.action === 'req1011') added.delete(v);
    else if (e.action === 'undo') {                      // value is the undone action, e.g. "loaded 42"
      const m = /^(\w+) (.+)$/.exec(String(v));
      if (!m) continue;
      if (m[1] === 'loaded') { for (let i = loads.length - 1; i >= 0; i--) if (loads[i].live && loads[i].value === m[2]) { loads[i].live = false; break; } }
      else if (m[1] === 'added') added.delete(m[2]);
    }
  }
  return loads;
}

// entries: history entries {action, value, ts}.  now / dayStart: ms timestamps.
export function computeStats(entries, now, dayStart) {
  const live = scanLoads(entries).filter(l => l.live);
  const today = live.filter(l => l.ts >= dayStart);
  const waits = today.map(l => l.wait).filter(w => w != null);
  return {
    hour: live.filter(l => l.ts > now - 3600 * 1000).length,
    today: today.length,
    avgWait: waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : null,
  };
}

// How often the stand is loading taxis right now: average gap between the most recent loads (last 3 hours, up to 8 gaps).
// Needs at least 3 loads, otherwise null (not enough to estimate from).
export function loadInterval(entries, now) {
  const times = scanLoads(entries).filter(l => l.live && l.ts > now - LOAD_WINDOW && l.ts <= now).map(l => l.ts).sort((a, b) => a - b).slice(-(MAX_GAPS + 1));
  if (times.length < 3) return null;
  return (times[times.length - 1] - times[0]) / (times.length - 1);
}

// Where is this taxi, and how long until it reaches Holding (queue positions 5-8, i.e. indexes 4-7)?
// Every load moves the queue up one place, so the estimate is: places to go x average time between loads.
// Returns { state, pos, ms }: state is 'nonumber' | 'notin' | 'stand' | 'holding' | 'unknown' (no rate yet) | 'eta'.
export function etaToHolding(queue, myNumber, intervalMs) {
  if (!myNumber) return { state: 'nonumber', pos: null, ms: null };
  const idx = queue.findIndex(v => Number(v) === Number(myNumber));
  if (idx < 0) return { state: 'notin', pos: null, ms: null };
  const pos = idx + 1;
  if (idx <= 3) return { state: 'stand', pos, ms: null };
  if (idx <= 7) return { state: 'holding', pos, ms: null };
  if (intervalMs == null) return { state: 'unknown', pos, ms: null };
  return { state: 'eta', pos, ms: (idx - 7) * intervalMs };
}

export function fmtWait(ms) {
  if (ms == null) return '–';
  const m = Math.max(1, Math.round(ms / 60000));
  return m < 60 ? '~' + m + ' min' : '~' + Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
}
