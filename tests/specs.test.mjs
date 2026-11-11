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

test('forced_daf spec: SI in (N, N/m), SI out (m), matches scipy refs; scene hook and no-peak note', () => {
  const spec = TOOLS.find(t => t.id === 'forced_daf');
  assert.deepEqual(spec.sim, { kind: 'sdofRig', drive: 'forced' });
  const refs = JSON.parse(readFileSync(new URL('./refs/forced_daf.json', import.meta.url)));
  for (const c of refs) {
    const o = spec.compute({ fn: c.fn_hz, zeta: c.zeta, f: c.f_hz, F0: c.F0_N, k: c.k_N_per_mm * 1000 });   // N/mm → N/m
    close(o.r, c.r); close(o.DAF, c.DAF); close(o.phase_lag_deg, c.phase_lag_deg);
    close(o.x_static, c.x_static_mm / 1000); close(o.X, c.X_mm / 1000);                                      // m
    close(o.peak_DAF, c.peak_DAF, 1e-4);                                                                     // reference peak is from a grid
    if (c.zeta < Math.SQRT1_2) { close(o.r_peak, c.r_peak, 1e-4); assert.equal(o._table, undefined); }
    else { assert.ok(Math.abs(o.r_peak) <= 1e-2); assert.equal(o.peak_DAF, 1); assert.match(JSON.stringify(o._table), /no resonant peak/); }
  }
  // Every declared output is produced, and the inputs are the five the calculator asks for.
  const o = spec.compute({ fn: 10, zeta: 0.05, f: 10, F0: 100, k: 1e4 });
  for (const out of spec.outputs) assert.ok(Number.isFinite(o[out.key]), out.key);
  assert.deepEqual(spec.inputs.map(i => i.key), ['fn', 'zeta', 'f', 'F0', 'k']);
  close(o.DAF, 10); close(o.X, 0.1); close(o.phase_lag_deg, 90);       // hand: 1/(2·0.05) = 10; 100 N / 10 kN/m = 10 mm → 100 mm
});
