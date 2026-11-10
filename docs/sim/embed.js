import { mountSim } from './index.js';
let sim, pending = { fd: 9.98749218, zeta: .05 }, queuedRelease, active = true;
const send = (message) => window.webkit?.messageHandlers?.sim?.postMessage(message);
window.simSetParams = p => { pending = p; sim?.update(p); };
window.simSetActive = value => { active = !!value; sim?.setActive(active); };
window.simRelease = f => { if (sim) sim.release(f); else queuedRelease = f; };
try {
  sim = await mountSim(document.querySelector('#rig'), { kind: 'sdofRig', drive: 'freeDecay', params: pending,
    reducedMotion: new URLSearchParams(location.search).has('reduceMotion') || matchMedia('(prefers-reduced-motion: reduce)').matches,
    onReady: evidence => send({ ready: evidence.renderer === 'webgl', ...evidence }), onPeak: peak => send({ peak }) });
  sim.update(pending); sim.setActive(active); if (queuedRelease !== undefined) sim.release(queuedRelease);
  window.simSnapshot = () => sim.snapshot();
  window.addEventListener('pagehide', () => sim.dispose(), { once: true });
} catch (error) {
  document.querySelector('#rig').textContent = 'The interactive view could not load. The ring-down chart below is still available.';
  send({ ready: false, renderer: 'unavailable' });
}
