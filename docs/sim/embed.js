import { mountSim } from './index.js';
// Host page for the iOS app. ?drive=freeDecay (default) | forced | base | sweep picks the rig; the native side then
// feeds calculator inputs through simSetParams ({ fd, zeta, fn } for freeDecay, { fn, zeta, f } for forced and base,
// { fn, zeta, fr, f1, f2 } for sweep). The values below only fill the first frames before the native ones arrive.
const query = new URLSearchParams(location.search), drive = query.get('drive') || 'freeDecay';
const DEFAULTS = { freeDecay: { fd: 9.98749218, zeta: .05 }, forced: { fn: 10, zeta: .05, f: 10 }, base: { fn: 10, zeta: .05, f: 20 },
  sweep: { fn: 10, zeta: .05, fr: 9.975, f1: 9.461, f2: 10.464 } };
let sim, pending = DEFAULTS[drive] ?? null, queuedRelease, active = true;
const send = (message) => window.webkit?.messageHandlers?.sim?.postMessage(message);
window.simSetParams = p => { pending = p; sim?.update(p); };
window.simSetActive = value => { active = !!value; sim?.setActive(active); };
window.simRelease = f => { if (sim) sim.release(f); else queuedRelease = f; };
try {
  sim = await mountSim(document.querySelector('#rig'), { kind: query.get('kind') || 'sdofRig', drive, params: pending,
    reducedMotion: query.has('reduceMotion') || matchMedia('(prefers-reduced-motion: reduce)').matches,
    onReady: evidence => send({ ready: evidence.renderer === 'webgl', ...evidence }), onPeak: peak => send({ peak }) });
  sim.update(pending); sim.setActive(active); if (queuedRelease !== undefined) sim.release(queuedRelease);
  window.simSnapshot = () => sim.snapshot();
  window.addEventListener('pagehide', () => sim.dispose(), { once: true });
} catch (error) {
  document.querySelector('#rig').textContent = 'The interactive view could not load. The chart below is still available.';
  send({ ready: false, renderer: 'unavailable' });
}
