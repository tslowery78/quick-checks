// Small pure helpers for the animated scenes. No three.js import here, so app.js can ask
// "is WebGL there?" before loading the renderer, and tests/sim.test.mjs can run in Node.

import { PULSES } from '../calcs.js';

let webgl = null;
// WebGL2 available? (three.js needs it.) Probed once; the probe context is released straight away.
export function webglOK() {
  if (webgl !== null) return webgl;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    webgl = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { webgl = false; }
  return webgl;
}

// Playback factor s = wall time / physical time: the scene runs s times slower than reality
// so the visible ringing stays between 0.4 and 1.5 Hz. s > 1 is slow motion, s < 1 is sped up.
export const timeScale = (f) => f / Math.min(Math.max(f, 0.4), 1.5);

// Calculator → scene parameters, per drive. si: the SI inputs as entered, res: the calculator result.
//   freeDecay rings at the measured fd with the computed ζ and fn; forced and base take fn, ζ and forcing f as entered;
//   sweep takes the computed fn and exact ζ (so the drawn band edges land on the entered f1, f2) plus fr, f1, f2 for the markers;
//   pulse takes the pulse shape as its index in calcs.js PULSES (numbers only: the iOS host sends [String: Double]), td/T, ζ and fn.
export function simParamsFor(drive, si, res) {
  if (drive === 'freeDecay') return { fd: si.fd, zeta: res.zeta, fn: res.fn };
  if (drive === 'pulse') return { pulse: PULSES.indexOf(res.kind), tdOverT: res.td_over_T, zeta: si.zeta, fn: si.fn };
  if (drive === 'sweep') return { fn: res.fn, zeta: res.zeta, fr: si.fr, f1: si.f1, f2: si.f2 };
  return { fn: si.fn, zeta: si.zeta, f: si.f };
}

const sig2 = (x) => String(Number(x.toPrecision(2)));
export const timeLabel = (s) => s > 1.005 ? `slow-mo ×${sig2(s)}` : s < 0.995 ? `fast ×${sig2(1 / s)}` : 'real time ×1';

// Largest |sample(t)| a driven rig reaches after starting from rest, used only to pick the labeled visual
// scale so the mass stays inside the frame. Samples the closed form until the transient has decayed
// (e^-6) plus two forcing cycles; `steady` is the steady-state amplitude and is the floor. With very
// light damping the window is capped at 250 cycles; if that is shorter than one beat between f and fn
// the worst alignment of transient and steady state may not have been seen, so the result is doubled.
export function peakTravel(sample, fn, zeta, f, steady = 0) {
  const fast = Math.max(fn, f), decay = 6 / (2 * Math.PI * fn * Math.max(zeta, 1e-9)), cap = 250 / fast;
  const span = Math.min(decay, cap) + 2 / f, n = Math.min(6000, Math.ceil(span * fast * 16));
  let peak = steady;
  for (let i = 1; i <= n; i++) peak = Math.max(peak, Math.abs(sample(span * i / n)));
  return decay <= cap || Math.abs(f - fn) * cap >= 1 ? peak : 2 * peak;
}
