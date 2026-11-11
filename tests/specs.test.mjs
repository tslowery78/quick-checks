// Spec layer: app.js hands compute() SI values (accel in m/s²) and expects SI back.
// Catches unit slips between the UI and the toolbox functions, against the scipy refs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOOLS } from '../docs/tools.js';
import { G0 } from '../docs/calcs.js';

const close = (a, b, rel = 1e-6) => assert.ok(Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)), `${a} vs ${b}`);

test('transmissibility spec: SI in, SI out, matches scipy refs', () => {
  const spec = TOOLS.find(t => t.id === 'transmissibility');
  const refs = JSON.parse(readFileSync(new URL('./refs/transmissibility.json', import.meta.url)));
  for (const c of refs) {
    const o = spec.compute({ fn: c.fn_hz, zeta: c.zeta, f: c.f_hz, baseG: c.base_g * G0 });
    close(o.TR, c.TR);
    close(o.resp_g, c.resp_g * G0);           // m/s²
    close(o.rel_disp, c.rel_disp_mm / 1000);  // m
  }
  assert.deepEqual(spec.sim, { kind: 'sdofRig', drive: 'base' });   // scene: base plate and mass in the ground frame
});

test('logdec spec: SI in (m), SI out, matches scipy refs', () => {
  const spec = TOOLS.find(t => t.id === 'logdec');
  const refs = JSON.parse(readFileSync(new URL('./refs/logdec.json', import.meta.url)));
  for (const c of refs) {
    const o = spec.compute({ fd: c.fd_hz, x1: c.x1_mm / 1000, xN: c.xN_mm / 1000, N: c.N });
    close(o.zeta, c.zeta); close(o.fn, c.fn_hz); close(o.delta, c.delta); close(o.Q, c.Q);
    close(o.n_half, c.n_half); close(o.t_half, c.t_half_s);   // s
  }
});

test('halfpower spec: SI in (Hz), SI out, matches scipy refs', () => {
  const spec = TOOLS.find(t => t.id === 'halfpower');
  const refs = JSON.parse(readFileSync(new URL('./refs/halfpower.json', import.meta.url)));
  for (const c of refs) {
    const o = spec.compute({ fr: c.fr_hz, f1: c.f1_hz, f2: c.f2_hz });
    close(o.zeta, c.zeta); close(o.fn, c.fn_hz); close(o.Q, c.Q); close(o.zeta_hp, c.zeta_hp); close(o.df, c.df_hz);
  }
});
