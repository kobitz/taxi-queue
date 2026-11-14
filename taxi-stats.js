// Numbers for the stand's info tiles, worked out from the history log. Pure functions (no DOM) so they can be tested.
const MAX_WAIT = 6 * 3600 * 1000;   // an add-to-load gap longer than this is treated as a stale entry, not a wait

// entries: history entries {action, value, ts}.  now / dayStart: ms timestamps.
// Fillers are never logged, so only real taxi numbers are counted.
export function computeStats(entries, now, dayStart) {
  const ev = entries.filter(e => e && typeof e.ts === 'number' && e.value !== 'Filler').sort((a, b) => a.ts - b.ts);
  const loads = [];            // every 'loaded' entry, with the wait since that taxi was last added
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
  const live = loads.filter(l => l.live);
  const today = live.filter(l => l.ts >= dayStart);
  const waits = today.map(l => l.wait).filter(w => w != null);
  return {
    hour: live.filter(l => l.ts > now - 3600 * 1000).length,
    today: today.length,
    avgWait: waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : null,
  };
}

export function fmtWait(ms) {
  if (ms == null) return '–';
  const m = Math.max(1, Math.round(ms / 60000));
  return m < 60 ? '~' + m + ' min' : '~' + Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
}
