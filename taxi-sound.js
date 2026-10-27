/* Small sounds made in the browser (no audio files):
   tick()      a soft key click for the on-screen keypads
   alertBeep() three beeps (plus a buzz where supported) for 10-11 requests
   Browsers only allow sound after the person has touched the page once, so the audio is "unlocked" on the first tap.
   On iPhone the ring/silent switch mutes these. A web page cannot trigger the phone's own keyboard click,
   so tick() is a similar-sounding click made here instead. */
let ctx = null;
function audio() {
  try {
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch (e) { return null; }
}
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => audio(), { once: true, capture: true }));

function blip(c, t, freq, endFreq, dur, vol, type = 'sine') {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (endFreq !== freq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
export function tick() {
  const c = audio(); if (!c) return;
  blip(c, c.currentTime, 1500, 700, 0.035, 0.18, 'triangle');
}
export function alertBeep() {
  const c = audio();
  if (c) { const t = c.currentTime; [0, 0.28, 0.56].forEach((d, i) => blip(c, t + d, i === 1 ? 1175 : 880, i === 1 ? 1175 : 880, 0.2, 0.35, 'square')); }
  try { navigator.vibrate && navigator.vibrate([200, 100, 200, 100, 200]); } catch (e) {}
}
