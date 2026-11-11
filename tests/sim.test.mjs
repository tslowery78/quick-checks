import test from 'node:test';
import assert from 'node:assert/strict';
import { timeScale, timeLabel, peakTravel } from '../docs/sim/support.js';
import { freeDecay, forcedResponse, baseResponse } from '../docs/calcs.js';
test('playback frequency stays within 0.4–1.5 Hz; labels distinguish speedup', () => {
  for (const f of [.01,.2,.4,1,1.5,10,1000]) assert.equal(f / timeScale(f), Math.min(1.5, Math.max(.4, f)));
  assert.equal(timeLabel(1), 'real time ×1'); assert.equal(timeLabel(10), 'slow-mo ×10'); assert.equal(timeLabel(.25), 'fast ×4');
});
test('initial conditions in every damping branch; undamped energy hand check', () => {
  for (const z of [0,.05,1-1e-9,1,1+1e-9,2,20]) assert.deepEqual(freeDecay(0,-4,300,2,z), {x:-4,v:300});
  const w = 2*Math.PI*2, energy = 300**2 + w*w*16;
  for (const t of [.1,.3,1,10]) { const {x,v} = freeDecay(t,-4,300,2,0); assert.ok(Math.abs((v*v+w*w*x*x)/energy-1)<1e-12); }
  for (const args of [[-1,1,0,2,.1],[NaN,1,0,2,.1],[1,Infinity,0,2,.1],[1,1,NaN,2,.1]]) assert.throws(()=>freeDecay(...args));
});
test('peakTravel bounds the from-rest motion the driven rigs must fit on screen', () => {
  const forced = (fn, zeta, f, steady) => peakTravel(t => forcedResponse(t, fn, zeta, f).x, fn, zeta, f, steady);
  const stretch = (fn, zeta, f, steady) => peakTravel(t => baseResponse(t, fn, zeta, f).z, fn, zeta, f, steady);
  // Resonance, ζ = 0.05: builds to the steady amplitude 1/(2ζ) = 10 and never overshoots it.
  const res = forced(10, .05, 10, 10); assert.ok(res >= 10 && res < 10.2, `resonance ${res}`);
  // Static follow: ≈ 1 (plus a little start-up ripple). Never below the steady amplitude handed in.
  const slow = forced(10, .05, .1, 1); assert.ok(slow >= 1 && slow < 1.1, `static ${slow}`);
  // High r, light damping: the start-up transient r/(r² − 1) rides on the steady 1/(r² − 1), so the bound is 1/(r − 1) = 0.111,
  // ten times the steady amplitude. The transient must be the one that sets scale.
  const fast = forced(1, .01, 10, 1 / 99); assert.ok(fast > .1 && fast <= 1 / 9, `high r ${fast}`);
  // Base drive at r = 2, ζ = 0.05: steady stretch r²·D = 1.33; the from-rest start overshoots it, bounded by twice.
  const z = stretch(10, .05, 20, 4 / Math.hypot(3, .2)); assert.ok(z >= 1.33 && z < 2.7, `stretch ${z}`);
  // Dense brute force over the same build-up. 16 samples per fast period can miss a crest by at most 1 − cos(π/16) = 1.9 %.
  let brute = 0; for (let i = 0; i <= 40000; i++) brute = Math.max(brute, Math.abs(baseResponse(i * 2e-4, 10, .05, 20).z));
  assert.ok(z >= brute * Math.cos(Math.PI / 16) && z <= brute + 1e-12, `stretch ${z} vs brute ${brute}`);
  for (const zeta of [.001, .3, 1, 4]) for (const f of [.02, 1, 3, 500]) assert.ok(Number.isFinite(forced(1, zeta, f, 0)) && Number.isFinite(stretch(1, zeta, f, 0)));
});
