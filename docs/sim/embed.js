import { mountSim } from './index.js';
// Host page for the iOS app. ?drive=freeDecay (default) | forced | base picks the rig; the native side then
// feeds calculator inputs through simSetParams ({ fd, zeta, fn } for freeDecay, { fn, zeta, f } otherwise).
const query = new URLSearchParams(location.search), drive = query.get('drive') || 'freeDecay';
let sim, pending = drive === 'freeDecay' ? { fd: 9.98749218, zeta: .05 } : { fn: 10, zeta: .05, f: drive === 'base' ? 20 : 10 }, queuedRelease, active = true;
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
