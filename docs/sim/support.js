// Small pure helpers for the animated scenes. No three.js import here, so app.js can ask
// "is WebGL there?" before loading the renderer, and tests/sim.test.mjs can run in Node.

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

const sig2 = (x) => String(Number(x.toPrecision(2)));
export const timeLabel = (s) => s > 1.005 ? `slow-mo ×${sig2(s)}` : s < 0.995 ? `fast ×${sig2(1 / s)}` : 'real time ×1';
