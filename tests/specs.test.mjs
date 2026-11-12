// Spec layer: app.js hands compute() SI values (accel in m/s²) and expects SI back.
// Catches unit slips between the UI and the toolbox functions, against the scipy refs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOOLS } from '../docs/tools.js';
import { G0, sweepState } from '../docs/calcs.js';
import { simParamsFor } from '../docs/sim/support.js';

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

test('halfpower spec: sweep scene hook; the scene band built from the spec result lands on the entered f1, f2', () => {
  const spec = TOOLS.find(t => t.id === 'halfpower');
  assert.deepEqual(spec.sim, { kind: 'sdofRig', drive: 'sweep' });
  const refs = JSON.parse(readFileSync(new URL('./refs/halfpower.json', import.meta.url)));
  for (const c of refs) {
    const si = { fr: c.fr_hz, f1: c.f1_hz, f2: c.f2_hz }, p = simParamsFor('sweep', si, spec.compute(si));
    assert.deepEqual(Object.keys(p), ['fn', 'zeta', 'fr', 'f1', 'f2']);
    close(p.fn, c.fn_hz); close(p.zeta, c.zeta); assert.equal(p.f1, c.f1_hz); assert.equal(p.f2, c.f2_hz); assert.equal(p.fr, c.fr_hz);
    // Steady-state amplitude/peak at the entered frequencies: 1/√2 at f1 and f2, 1 at fr (sweep time t that puts f there).
    const span = { from: Math.min(.5, .8 * p.f1 / p.fn), to: 1.5 }, at = (f) => sweepState(12 * (f / p.fn - span.from) / (span.to - span.from), p.fn, p.zeta, span);
    close(at(p.f1).amp, Math.SQRT1_2); close(at(p.f2).amp, Math.SQRT1_2); close(at(p.fr).amp, 1);
    close(at(p.f1).f, p.f1); assert.ok(at((p.f1 + p.f2) / 2).inBand && !at(p.f1 * .98).inBand && !at(p.f2 * 1.02).inBand);
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

test('dlf_pulse spec: SI in (s, Hz, N, N/m), SI out (s, m, N), matches scipy refs; scene hook, peak note, scene parameters', () => {
  const spec = TOOLS.find(t => t.id === 'dlf_pulse');
  assert.deepEqual(spec.sim, { kind: 'sdofRig', drive: 'pulse' });
  assert.deepEqual(spec.modes.map(m => m[0]), ['rect', 'halfsine', 'ramp']);
  assert.deepEqual(spec.inputs.map(i => i.key), ['td', 'fn', 'zeta', 'F0', 'k']);
  assert.deepEqual(spec.outputs.map(o => o.key), ['T', 'td_over_T', 'DLF', 'x_static', 'x_max', 't_peak', 'F_eq']);
  const refs = JSON.parse(readFileSync(new URL('./refs/dlf_pulse.json', import.meta.url)));
  // The refs are normalized (td/T, x/x_static). Dimensional case: fn 12.5 Hz (T 0.08 s), 80 N on 4 N/mm → 20 mm static.
  const fn = 12.5, F0 = 80, kNmm = 4;
  for (const c of refs.dlf) {
    const si = { td: c.td_over_T / fn, fn, zeta: c.zeta, F0, k: kNmm * 1000 }, o = spec.compute(si, c.kind);   // N/mm → N/m
    close(o.T, .08); close(o.td_over_T, c.td_over_T); close(o.DLF, c.DLF);
    close(o.x_static, .02); close(o.x_max, c.DLF * .02); close(o.F_eq, c.DLF * 80);                              // m, m, N
    if (c.zeta > 0) { assert.ok(Math.abs(o.t_peak - c.t_peak_over_T * .08) <= 1e-4 * .08, `${o.t_peak} ${JSON.stringify(c)}`); assert.equal(o.phase, c.phase); }
    for (const out of spec.outputs) assert.ok(Number.isFinite(o[out.key]), out.key);
    // The note under the results names the same phase as the result.
    assert.deepEqual(o._table.head, ['Peak']); assert.equal(o._table.rows.length, 1);
    assert.match(o._table.rows[0][0], o.primary ? /^Primary peak: / : /^Residual peak: /);
    assert.equal(o.primary, o.t_peak < si.td);
    // The scene gets numbers only: pulse shape as its index, td/T, ζ, fn.
    const p = simParamsFor('pulse', si, o);
    assert.deepEqual(p, { pulse: ['rect', 'halfsine', 'ramp'].indexOf(c.kind), tdOverT: o.td_over_T, zeta: c.zeta, fn });
    for (const v of Object.values(p)) assert.equal(typeof v, 'number');
  }
  // Page defaults (SI row): rectangular, td 0.08 s, fn 10 Hz, ζ 0, 100 N, 10 N/mm → DLF 2, 10 mm static, 20 mm peak at T/2 = 0.05 s, 200 N.
  const d = Object.fromEntries(spec.inputs.map(i => [i.key, i.def[1]]));
  assert.deepEqual(d, { td: .08, fn: 10, zeta: 0, F0: 100, k: 10 });
  const o = spec.compute({ ...d, k: d.k * 1000 }, 'rect');
  close(o.T, .1); close(o.td_over_T, .8); close(o.DLF, 2); close(o.x_static, .01); close(o.x_max, .02); close(o.t_peak, .05); close(o.F_eq, 200);
  // Invalid inputs throw (the page shows the message and keeps the scene paused); an unknown mode is not silently a rectangle.
  for (const bad of [{ td: 0 }, { fn: 0 }, { zeta: 1 }, { zeta: -.1 }, { F0: -1 }, { k: 0 }, { td: NaN }])
    assert.throws(() => spec.compute({ td: .08, fn: 10, zeta: 0, F0: 100, k: 1e4, ...bad }, 'rect'), JSON.stringify(bad));
  assert.throws(() => spec.compute({ td: .08, fn: 10, zeta: 0, F0: 100, k: 1e4 }, 'triangle'));
});
