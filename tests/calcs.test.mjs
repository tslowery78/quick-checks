// Reference values were computed independently (Python/NumPy, textbook formulas, or published
// profile Grms values), not by calling calcs.js. Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as C from '../docs/calcs.js';

const near = (got, want, rel = 1e-6) =>
  assert.ok(Math.abs(got - want) <= rel * Math.abs(want), `got ${got}, want ${want}`);

test('unit conversions', () => {
  near(C.convert(1, 'force', 'lbf', 'N'), 4.4482216152605);
  near(C.convert(1, 'stress', 'ksi', 'MPa'), 6.894757293168);
  near(C.convert(1, 'inertia', 'in⁴', 'mm⁴'), 416231.426);
  near(C.convert(1, 'accel', 'g', 'in/s²'), 386.0885827);
  near(C.convert(1750, 'frequency', 'rpm', 'Hz'), 29.1666667);
  near(C.convert(1, 'density', 'lbm/in³', 'kg/m³'), 27679.9047, 1e-8);
});

test('section properties', () => {
  const ib = C.sectionIBeam(100, 200, 10, 6);
  near(ib.Ix, 20982666.666666664);
  near(ib.Iy, 1669906.6666666667);
  near(ib.Sx, 20982666.666666664 / 100);
  near(C.sectionTube(50, 5).Ix, 181132.4514335365);
  near(C.sectionRect(2, 1).J, 0.458, 2e-3); // Roark table, a/b = 2: beta = 0.229
  near(C.sectionCircle(1).J, Math.PI / 32);
  assert.throws(() => C.sectionTube(10, 5));
});

test('beam cases', () => {
  near(C.beam('cantPoint', 1, 1000, 200e9, 1e-6, 0.05).delta, 0.0016666666666666668);
  // US units: simply supported UDL, L 120 in, w 100 lbf/in, E 29e6 psi, I 100 in^4 -> 0.0931 in
  const L = C.toSI(120, 'length', 'in'), w = C.toSI(100, 'lineLoad', 'lbf/in');
  const E = C.toSI(29e6, 'stress', 'psi'), I = C.toSI(100, 'inertia', 'in⁴');
  near(C.fromSI(C.beam('ssUDL', L, w, E, I, 0).delta, 'length', 'in'), 0.09310344827586207);
  near(C.beam('ssPoint', 2, 100, 1, 1, 0).M, 50);
  near(C.beam('fixedUDL', 2, 100, 1, 1, 0).M, 100 * 4 / 12);
  // Fixed-fixed max slopes: PL^2/64EI at L/4; wL^3/(72 sqrt3 EI) at x = L(1/2 - 1/(2 sqrt3))
  near(C.beam('fixedPoint', 2, 100, 1, 1, 0).theta, 100 * 4 / 64);
  near(C.beam('fixedUDL', 1, 1, 1, 1, 0).theta, 0.008018753738744803);
});

test('SDOF', () => {
  near(C.fnFromStaticDeflection(0.0254), 3.1272572722612297);
  const r = C.cantileverTipMass(0.5, 70e9, 0.01 ** 4 / 12, 0.5, 0.135);
  near(r.k, 1400);
  near(r.fn, 8.16584690345849);
});

test('random vibration', () => {
  near(C.miles(100, 10, 0.04).grms, 7.926654595212022);
  // GEVS-SE qualification profile, published as 14.1 Grms
  const gevs = C.psdGrms([[20, 0.026], [50, 0.16], [800, 0.16], [2000, 0.026]]);
  near(gevs.grms, 14.13561371985407, 1e-5); // NumPy log-log fine-grid integration
  assert.equal(Math.round(gevs.segs[0].dBperOct), 6);
  // NAVMAT P-9492 screening profile, published as 6.06 Grms
  near(C.psdGrms([[20, 0.01], [80, 0.04], [350, 0.04], [2000, 0.007]]).grms, 6.058182093036933, 1e-5);
  assert.deepEqual(C.parsePoints('20 0.01\n80, 0.04'), [[20, 0.01], [80, 0.04]]);
  assert.throws(() => C.psdGrms([[20, 0.01], [10, 0.02]]));
});

test('fasteners, margins, shaft', () => {
  near(C.torqueFromPreload(0.2, 0.25, 2000), 100);
  near(C.preloadFromTorque(0.2, 0.25, 100), 2000);
  const ms = C.margins(30, 1.25, 1.4, 62, 68);
  near(ms.MSy, 0.6533333333333333);
  near(ms.MSu, 0.6190476190476191);
  // 10 hp at 1750 rpm, 1 in solid shaft
  const s = C.shaft(C.toSI(10, 'power', 'hp'), C.toSI(1750, 'frequency', 'rpm'), 0.0254);
  near(C.fromSI(s.T, 'moment', 'lbf·in'), 360.1448997965175);
  near(C.fromSI(s.tau, 'stress', 'psi'), 1834.202913022531);
});

test('transmissibility vs scipy reference table', () => {
  const refs = JSON.parse(readFileSync(new URL('./refs/transmissibility.json', import.meta.url)));
  assert.ok(refs.length >= 5);
  for (const q of refs) {
    const got = C.transmissibility({ fn: q.fn_hz, zeta: q.zeta, f: q.f_hz, baseG: q.base_g });
    for (const k of ['r', 'TR', 'resp_g', 'rel_disp_mm', 'peak_TR']) near(got[k], q[k]);
    assert.ok(Math.abs(got.phase_deg - q.phase_deg) <= 1e-6, `phase got ${got.phase_deg}, want ${q.phase_deg}`);
  }
  assert.throws(() => C.transmissibility({ fn: 10, zeta: 0, f: 5, baseG: 1 }));
});

test("transmissibility peak at tiny zeta has no cancellation", async () => {
  const { transmissibility } = await import("../docs/calcs.js");
  const t = transmissibility({ fn: 10, zeta: 1e-6, f: 10, baseG: 1 });
  if (Math.abs(t.peak_TR - 5e5) / 5e5 > 1e-6) throw new Error("peak_TR " + t.peak_TR);
});

test('logDecrement recovers true zeta and fn from scipy ring-down peaks', () => {
  const refs = JSON.parse(readFileSync(new URL('./refs/logdec.json', import.meta.url)));
  assert.ok(refs.length >= 5);
  for (const q of refs) {
    const got = C.logDecrement({ fd: q.fd_hz, x1: q.x1_mm, xN: q.xN_mm, N: q.N });
    for (const [k, rk] of [['delta', 'delta'], ['zeta', 'zeta'], ['fn', 'fn_hz'], ['Q', 'Q'], ['zeta_approx', 'zeta_approx'], ['n_half', 'n_half'], ['t_half', 't_half_s']]) near(got[k], q[rk]);
    assert.ok(Math.abs(got.approx_err_pct - q.approx_err_pct) <= 1e-6 * Math.max(1, Math.abs(q.approx_err_pct)), `err% ${got.approx_err_pct} vs ${q.approx_err_pct}`);
    near(C.ringdown(got.delta, q.N), q.xN_mm / q.x1_mm);   // demo curve passes through the measured later peak
  }
  for (const bad of [{ fd: 0, x1: 1, xN: 0.5, N: 1 }, { fd: 10, x1: 1, xN: 1, N: 1 }, { fd: 10, x1: 1, xN: 2, N: 1 },
    { fd: 10, x1: 1, xN: 0, N: 1 }, { fd: 10, x1: 1, xN: 0.5, N: 0 }, { fd: 10, x1: 1, xN: 0.5, N: 2.5 }])
    assert.throws(() => C.logDecrement(bad), JSON.stringify(bad));
  // tiny damping: approximation error must not cancel to 0 or go negative
  const t = C.logDecrement({ fd: 100, x1: 1, xN: Math.exp(-2 * Math.PI * 1e-7), N: 1 });
  assert.ok(t.approx_err_pct > 0 && Math.abs(t.zeta - 1e-7) / 1e-7 < 1e-6, JSON.stringify(t));
});

test('halfPower recovers true zeta and fn from scipy-measured FRF peak and -3 dB points', () => {
  const refs = JSON.parse(readFileSync(new URL('./refs/halfpower.json', import.meta.url)));
  assert.ok(refs.length >= 5);
  for (const q of refs) {
    const got = C.halfPower({ fr: q.fr_hz, f1: q.f1_hz, f2: q.f2_hz });
    for (const [k, rk] of [['df', 'df_hz'], ['Q', 'Q'], ['zeta_hp', 'zeta_hp'], ['zeta', 'zeta'], ['fn', 'fn_hz'], ['approx_err_pct', 'approx_err_pct'], ['peak_gain', 'peak_gain']]) near(got[k], q[rk]);
    near(C.receptanceGain(got.fn, got.zeta, q.f1_hz) * Math.SQRT2, q.peak_gain);  // demo curve crosses peak/√2 at f1
  }
  for (const bad of [{ fr: 10, f1: 0, f2: 11 }, { fr: 10, f1: 10, f2: 11 }, { fr: 10, f1: 9, f2: 10 }, { fr: 10, f1: 11, f2: 12 }, { fr: 10, f1: 9, f2: Infinity }])
    assert.throws(() => C.halfPower(bad), JSON.stringify(bad));
  const t = C.halfPower({ fr: 100, f1: 100 * (1 - 1e-7), f2: 100 * (1 + 1e-7) });  // tiny damping: no cancellation
  assert.ok(Math.abs(t.zeta - 1e-7) / 1e-7 < 1e-6, JSON.stringify(t));
});
