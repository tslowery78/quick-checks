import test from 'node:test';
import assert from 'node:assert/strict';
import { timeScale, timeLabel } from '../docs/sim/support.js';
import { freeDecay } from '../docs/calcs.js';
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
