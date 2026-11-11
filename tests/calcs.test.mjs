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

test('freeDecay matches the scipy expm state-transition table (mm, mm/s)', () => {
  const refs = JSON.parse(readFileSync(new URL('./refs/motion_freedecay.json', import.meta.url)));
  assert.equal(refs.length, 30);
  const close = (got, want, what) => assert.ok(Math.abs(got - want) <= 1e-6 * Math.max(1, Math.abs(want)), `${what}: got ${got}, want ${want}`);
  for (const q of refs) {
    const got = C.freeDecay(q.t_s, q.x0_m * 1000, q.v0_mps * 1000, q.fn_hz, q.zeta);
    const tag = `fn ${q.fn_hz} ζ ${q.zeta} t ${q.t_s}`;
    close(got.x, q.x_m * 1000, `x ${tag}`);
    close(got.v, q.v_mps * 1000, `v ${tag}`);
  }
});

test('freeDecay at ζ = 1 and ζ = 2 matches an RK4 integration of the equation of motion', () => {
  // Independent of the closed form: integrate ẍ = −2ζωn·ẋ − ωn²·x with classical RK4, h = 2 µs·(2 Hz/fn).
  const rk4 = (tEnd, x0, v0, fn, zeta) => {
    const wn = 2 * Math.PI * fn, f = (x, v) => -2 * zeta * wn * v - wn * wn * x;
    const n = Math.round(tEnd * fn * 250000), h = tEnd / n;
    let x = x0, v = v0;
    for (let i = 0; i < n; i++) {
      const k1x = v, k1v = f(x, v);
      const k2x = v + h / 2 * k1v, k2v = f(x + h / 2 * k1x, v + h / 2 * k1v);
      const k3x = v + h / 2 * k2v, k3v = f(x + h / 2 * k2x, v + h / 2 * k2v);
      const k4x = v + h * k3v, k4v = f(x + h * k3x, v + h * k3v);
      x += h / 6 * (k1x + 2 * k2x + 2 * k3x + k4x); v += h / 6 * (k1v + 2 * k2v + 2 * k3v + k4v);
    }
    return { x, v };
  };
  for (const zeta of [1, 2]) for (const [x0, v0] of [[10, 0], [-4, 300]]) for (const tEnd of [0.05, 0.2, 0.6]) {
    const fn = 2, got = C.freeDecay(tEnd, x0, v0, fn, zeta), ref = rk4(tEnd, x0, v0, fn, zeta);
    for (const k of ['x', 'v']) assert.ok(Math.abs(got[k] - ref[k]) <= 1e-6 * Math.abs(ref[k]), `ζ ${zeta} x0 ${x0} v0 ${v0} t ${tEnd} ${k}: got ${got[k]}, RK4 ${ref[k]}`);
  }
});

test('freeDecay: branches meet at ζ = 1, peaks land on the log-decrement ratio, bad input throws', () => {
  // continuity across the branch switch (each side is a different formula)
  const lo = C.freeDecay(0.3, 10, -50, 2, 1 - 1e-9), mid = C.freeDecay(0.3, 10, -50, 2, 1), hi = C.freeDecay(0.3, 10, -50, 2, 1 + 1e-9);
  for (const k of ['x', 'v']) { near(lo[k], mid[k], 1e-6); near(hi[k], mid[k], 1e-6); }
  // heavy damping, long time: finite and decayed (cosh/sinh form would give ∞·0)
  const far = C.freeDecay(500, 1, 0, 50, 5);
  assert.ok(Number.isFinite(far.x) && Number.isFinite(far.v) && Math.abs(far.x) < 1e-6, JSON.stringify(far));
  // released from rest, the positive peak N damped cycles later is xN/x1 of the scipy ring-down refs
  for (const q of JSON.parse(readFileSync(new URL('./refs/logdec.json', import.meta.url)))) {
    const r = C.freeDecay(q.N / q.fd_hz, 1, 0, q.fn_hz, q.zeta);
    near(r.x, q.xN_mm / q.x1_mm);
    assert.ok(Math.abs(r.v) <= 1e-6 * 2 * Math.PI * q.fn_hz, `peak velocity ${r.v}`);
  }
  assert.deepEqual(C.freeDecay(0, 3, -7, 10, 0.05), { x: 3, v: -7 });
  for (const bad of [[0, 0.05], [-1, 0.05], [10, -0.1], [NaN, 0.05], [10, NaN], [Infinity, 0.05]]) assert.throws(() => C.freeDecay(0.1, 1, 0, ...bad), JSON.stringify(bad));
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

// ---------- Driven rig: closed-form responses from rest (drive the forced and base scenes) ----------
const motion = JSON.parse(readFileSync(new URL('./refs/motion_forced.json', import.meta.url)));
const within = (got, want, tol, what) => assert.ok(Math.abs(got - want) <= tol, `${what}: got ${got}, want ${want}`);
// Steady-state amplitude and phase of a response component, fitted over one late forcing cycle.
function steadyFit(sample, fn, zeta, f) {
  const slow = 2 * Math.PI * fn * (zeta < 1 ? zeta : 1 / (zeta + Math.sqrt(zeta * zeta - 1)));  // slowest transient decay rate
  const t0 = Math.ceil(40 / slow * f) / f, n = 400; let s = 0, c = 0;                           // transient < e^-40
  for (let i = 0; i < n; i++) { const t = t0 + i / (n * f), v = sample(t); s += v * Math.sin(2 * Math.PI * f * t); c += v * Math.cos(2 * Math.PI * f * t); }
  return { amp: 2 * Math.hypot(s, c) / n, lag_deg: Math.atan2(-c, s) * 180 / Math.PI };      // v = amp·sin(ωt − lag)
}

test('forcedResponse matches every row of the scipy lsim table (normalized by x_static)', () => {
  let rows = 0;
  for (const c of motion) for (const row of c.rows) { within(C.forcedResponse(row.t, c.fn_hz, c.zeta, c.f_hz).x, row.force_x, 1e-5, `fn ${c.fn_hz} ζ ${c.zeta} f ${c.f_hz} t ${row.t}`); rows++; }
  assert.equal(rows, 125);
});

test('forcedResponse: rest start in every damping branch, velocity is the derivative, branches meet at ζ = 1', () => {
  for (const z of [0, 0.05, 1 - 1e-9, 1, 1 + 1e-9, 2, 20]) for (const f of [0.3, 3, 9]) {   // f = fn at ζ = 0 has no steady state (throws, below)
    const o = C.forcedResponse(0, 2, z, f); within(o.x, 0, 1e-12, 'x(0)'); within(o.v, 0, 1e-9, 'v(0)');
  }
  for (const z of [0.05, 1, 3]) for (const t of [0.13, 0.9, 4]) {
    const h = 1e-6, num = (C.forcedResponse(t + h, 2, z, 3).x - C.forcedResponse(t - h, 2, z, 3).x) / (2 * h);
    within(C.forcedResponse(t, 2, z, 3).v, num, 1e-6 * Math.max(1, Math.abs(num)), `v at ζ ${z} t ${t}`);
  }
  for (const t of [0.05, 0.4, 2]) within(C.forcedResponse(t, 2, 1 - 1e-9, 3).x, C.forcedResponse(t, 2, 1 + 1e-9, 3).x, 1e-7, 'ζ → 1');
  // ζ = 1 and ζ = 2 against an RK4 integration of ẍ + 2ζωn·ẋ + ωn²·x = ωn²·sin(ωt)
  for (const z of [1, 2]) {
    const fn = 2, f = 3, wn = 2 * Math.PI * fn, w = 2 * Math.PI * f, acc = (t, x, v) => wn * wn * Math.sin(w * t) - 2 * z * wn * v - wn * wn * x;
    let x = 0, v = 0, t = 0; const dt = 1e-4;
    for (let i = 0; i < 10000; i++) {
      const k1x = v, k1v = acc(t, x, v), k2x = v + dt / 2 * k1v, k2v = acc(t + dt / 2, x + dt / 2 * k1x, v + dt / 2 * k1v);
      const k3x = v + dt / 2 * k2v, k3v = acc(t + dt / 2, x + dt / 2 * k2x, v + dt / 2 * k2v), k4x = v + dt * k3v, k4v = acc(t + dt, x + dt * k3x, v + dt * k3v);
      x += dt / 6 * (k1x + 2 * k2x + 2 * k3x + k4x); v += dt / 6 * (k1v + 2 * k2v + 2 * k3v + k4v); t += dt;
    }
    within(C.forcedResponse(1, fn, z, f).x, x, 1e-8, `RK4 ζ ${z}`);
  }
  for (const args of [[-1, 2, .1, 3], [1, 0, .1, 3], [1, 2, -0.1, 3], [1, 2, .1, 0], [NaN, 2, .1, 3], [1, 2, 0, 2]]) assert.throws(() => C.forcedResponse(...args));
});

test('forced drive limits: 1/(2ζ) at resonance, static follow at low r, 1/r² and 180° at high r', () => {
  for (const zeta of [0.01, 0.02, 0.05]) {            // r = 1: amplitude 1/(2ζ), lag 90°
    const fit = steadyFit(t => C.forcedResponse(t, 2, zeta, 2).x, 2, zeta, 2);
    within(fit.amp, 1 / (2 * zeta), 1e-6 / zeta, `resonant amplitude ζ ${zeta}`); within(fit.lag_deg, 90, 1e-6, 'resonant lag');
  }
  // Resonant build-up hand check: x ≈ −(1/2ζ)(1 − e^(−ζωn·t))·cos(ωn·t) for small ζ; peaks sit on whole cycles.
  { const zeta = 0.02, fn = 2, t = 10 / fn; within(Math.abs(C.forcedResponse(t, fn, zeta, fn).x), (1 - Math.exp(-zeta * 2 * Math.PI * fn * t)) / (2 * zeta), 0.02 / (2 * zeta), 'build-up envelope'); }
  for (const t of [3.1, 7.77, 12.4]) within(C.forcedResponse(200 + t, 50, 0.3, 0.05).x, Math.sin(2 * Math.PI * 0.05 * (200 + t)), 2e-3, 'static follow x → sin ωt'); // r = 0.001
  { const fit = steadyFit(t => C.forcedResponse(t, 50, 0.3, 0.05).x, 50, 0.3, 0.05); within(fit.amp, 1, 1e-5, 'DAF → 1'); within(fit.lag_deg, 0, 0.05, 'lag → 0'); }
  for (const r of [10, 30]) {                           // amplitude ≈ 1/r² (exactly 1/(r² − 1) at ζ → 0), lag → 180°
    const fit = steadyFit(t => C.forcedResponse(t, 1, 0.05, r).x, 1, 0.05, r);
    within(fit.amp * r * r, 1, 2 / (r * r), `1/r² at r ${r}`); assert.ok(fit.lag_deg > 179 && fit.lag_deg <= 180, `lag ${fit.lag_deg}`);
  }
});

test('forcedDAF vs scipy reference table', () => {
  const refs = JSON.parse(readFileSync(new URL('./refs/forced_daf.json', import.meta.url)));
  const tol = (got, want, rel, what) => assert.ok(Math.abs(got - want) <= rel * Math.max(1, Math.abs(want)), `${what}: got ${got}, want ${want}`);
  assert.equal(refs.length, 8);
  for (const c of refs) {
    const o = C.forcedDAF({ fn: c.fn_hz, zeta: c.zeta, f: c.f_hz, F0: c.F0_N, k: c.k_N_per_mm * 1e3 });
    tol(o.r, c.r, 1e-6, 'r'); tol(o.x_static * 1e3, c.x_static_mm, 1e-6, 'x_static'); tol(o.DAF, c.DAF, 1e-6, 'DAF');
    tol(o.X * 1e3, c.X_mm, 1e-6, 'X'); tol(o.phase_lag_deg, c.phase_lag_deg, 1e-6, 'phase');
    near(o.peak_DAF, c.peak_DAF, 1e-4);                              // reference peak comes from a frequency grid
    if (c.zeta >= Math.SQRT1_2) { assert.equal(o.resonant, false); within(o.r_peak, 0, 1e-2, 'r_peak (grid starts at 0.001)'); assert.equal(o.peak_DAF, 1); }
    else { assert.equal(o.resonant, true); near(o.r_peak, c.r_peak, 1e-4); }
  }
});

test('forcedDAF hand checks: r = 1 gives 1/(2ζ) at 90°, static and high-r limits, steady state of forcedResponse', () => {
  const at = (zeta, r) => C.forcedDAF({ fn: 10, zeta, f: 10 * r, F0: 100, k: 1e4 });
  for (const zeta of [0.01, 0.05, 0.3, 0.9]) { near(at(zeta, 1).DAF, 1 / (2 * zeta), 1e-12); near(at(zeta, 1).phase_lag_deg, 90, 1e-12); }
  near(at(0.05, 1).x_static, 0.01, 1e-12); near(at(0.05, 1).X, 0.1, 1e-12);        // 100 N on 10 N/mm = 10 mm; ×10 = 100 mm
  near(at(0.05, 1e-4).DAF, 1, 1e-7); within(at(0.05, 1e-4).phase_lag_deg, 0, 1e-3, 'static lag');
  near(at(0.05, 100).DAF, 1e-4, 2e-4); assert.ok(at(0.05, 100).phase_lag_deg > 179.9 && at(0.05, 100).phase_lag_deg <= 180);
  assert.equal(at(0.8, 1).r_peak, 0); assert.equal(at(0.8, 1).peak_DAF, 1);
  for (const [zeta, r] of [[0.05, 0.5], [0.05, 1], [0.1, 2], [0.5, 1.4142], [1.5, 0.8]]) {   // DAF and φ are what the drive settles to
    const fit = steadyFit(t => C.forcedResponse(t, 3, zeta, 3 * r).x, 3, zeta, 3 * r), o = C.forcedDAF({ fn: 3, zeta, f: 3 * r, F0: 1, k: 1 });
    near(fit.amp, o.DAF, 1e-9); within(fit.lag_deg, o.phase_lag_deg, 1e-7, 'steady lag');
  }
  for (const bad of [{ fn: 0 }, { zeta: 0 }, { f: -1 }, { F0: -1 }, { k: 0 }, { k: NaN }]) assert.throws(() => C.forcedDAF({ fn: 10, zeta: 0.05, f: 10, F0: 1, k: 1, ...bad }));
});

test('baseResponse matches every row of the scipy lsim table (base y, absolute x, relative z; normalized by Y)', () => {
  let rows = 0;
  for (const c of motion) for (const row of c.rows) {
    const o = C.baseResponse(row.t, c.fn_hz, c.zeta, c.f_hz), at = `fn ${c.fn_hz} ζ ${c.zeta} f ${c.f_hz} t ${row.t}`;
    within(o.y, row.base_y, 1e-5, `y ${at}`); within(o.x, row.base_x, 1e-5, `x ${at}`); within(o.z, row.base_rel, 1e-5, `z ${at}`); rows++;
  }
  assert.equal(rows, 125);
});

test('baseResponse initial conditions: mass at rest, base at y = 0 moving at ω; x = y + z; RK4 at ζ = 1 and 2', () => {
  for (const z of [0, 0.05, 1 - 1e-9, 1, 1 + 1e-9, 2, 20]) for (const f of [0.3, 3, 9]) {
    const fn = 2, wn = 2 * Math.PI * fn, w = 2 * Math.PI * f, h = 1e-7;
    const a = C.baseResponse(0, fn, z, f), b = C.baseResponse(h, fn, z, f), c = C.baseResponse(2 * h, fn, z, f);
    assert.deepEqual([a.y, a.x, a.z], [0, 0, 0]);
    within(b.y / h, w, 1e-6 * w, 'ẏ(0) = ω');
    // Mass starts with zero velocity and the damper's kick: x ≈ ½·ẍ(0)·t², ẍ(0) = 2ζωn·ω.
    within(b.x, 0.5 * 2 * z * wn * w * h * h, 1e-9 + 1e-3 * z * wn * w * h * h, `ẋ(0) = 0 at ζ ${z}`);
    within((c.x - 2 * b.x + a.x) / (h * h), 2 * z * wn * w, 1e-2 * Math.max(1, z * wn * w), `ẍ(0) at ζ ${z}`);
  }
  for (const t of [0.07, 0.5, 3.3]) { const o = C.baseResponse(t, 2, 0.1, 5); within(o.x - o.y, o.z, 1e-15, 'z = x − y'); }
  // Absolute equation of motion ẍ + 2ζωn·ẋ + ωn²·x = 2ζωn·ẏ + ωn²·y, integrated from x = ẋ = 0.
  for (const z of [0.05, 1, 2]) {
    const fn = 2, f = 3, wn = 2 * Math.PI * fn, w = 2 * Math.PI * f;
    const acc = (t, x, v) => 2 * z * wn * w * Math.cos(w * t) + wn * wn * Math.sin(w * t) - 2 * z * wn * v - wn * wn * x;
    let x = 0, v = 0, t = 0; const dt = 1e-4;
    for (let i = 0; i < 10000; i++) {
      const k1x = v, k1v = acc(t, x, v), k2x = v + dt / 2 * k1v, k2v = acc(t + dt / 2, x + dt / 2 * k1x, v + dt / 2 * k1v);
      const k3x = v + dt / 2 * k2v, k3v = acc(t + dt / 2, x + dt / 2 * k2x, v + dt / 2 * k2v), k4x = v + dt * k3v, k4v = acc(t + dt, x + dt * k3x, v + dt * k3v);
      x += dt / 6 * (k1x + 2 * k2x + 2 * k3x + k4x); v += dt / 6 * (k1v + 2 * k2v + 2 * k3v + k4v); t += dt;
    }
    within(C.baseResponse(1, fn, z, f).x, x, 1e-8, `RK4 ζ ${z}`);
  }
  for (const args of [[-1, 2, .1, 3], [1, 0, .1, 3], [1, 2, -0.1, 3], [1, 2, .1, 0], [NaN, 2, .1, 3], [1, 2, 0, 2]]) assert.throws(() => C.baseResponse(...args));
});

test('base drive limits: x → y at low r, TR = 1 at r = √2 for any ζ, small TR at high r, steady state = transmissibility()', () => {
  for (const t of [3.1, 7.77, 12.4]) { const o = C.baseResponse(200 + t, 50, 0.3, 0.05); within(o.x, o.y, 1e-5, 'rigid follow x → y'); within(o.z, 0, 1e-5, 'no stretch'); } // r = 0.001
  for (const zeta of [0.01, 0.1, 0.5, 1, 3]) {          // crossover: mass and base amplitudes equal
    const fit = steadyFit(t => C.baseResponse(t, 2, zeta, 2 * Math.SQRT2).x, 2, zeta, 2 * Math.SQRT2);
    within(fit.amp, 1, 1e-9, `TR at √2, ζ ${zeta}`);
  }
  for (const r of [10, 30]) {                           // isolation: TR ≈ √(1 + (2ζr)²)/r², well below 1
    const fit = steadyFit(t => C.baseResponse(t, 1, 0.05, r).x, 1, 0.05, r);
    within(fit.amp, Math.hypot(1, 0.1 * r) / (r * r), 2 / r ** 4 * Math.hypot(1, 0.1 * r), `TR at r ${r}`); assert.ok(fit.amp < 0.02);
  }
  { const fit = steadyFit(t => C.baseResponse(t, 2, 0.05, 2).x, 2, 0.05, 2); within(fit.amp, Math.hypot(1, 0.1) / 0.1, 1e-8, 'TR at r = 1 is √(1 + 4ζ²)/(2ζ)'); }
  for (const [zeta, r] of [[0.05, 0.5], [0.05, 1], [0.1, 2], [0.5, 1.2], [1.5, 0.8]]) {
    const o = C.transmissibility({ fn: 3, zeta, f: 3 * r, baseG: 1 });
    const abs = steadyFit(t => C.baseResponse(t, 3, zeta, 3 * r).x, 3, zeta, 3 * r), rel = steadyFit(t => C.baseResponse(t, 3, zeta, 3 * r).z, 3, zeta, 3 * r);
    near(abs.amp, o.TR, 1e-9); within(-abs.lag_deg, o.phase_deg, 1e-7, 'phase');             // phase_deg is negative for lag
    near(rel.amp, r * r / Math.hypot(1 - r * r, 2 * zeta * r), 1e-9);                          // |z|/Y = r²·D
  }
});
