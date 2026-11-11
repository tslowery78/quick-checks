// Pure calculation and unit functions. No DOM here, so tests/calcs.test.mjs can run them in Node.
// Every function takes and returns SI values (m, N, Pa, kg, s); the UI converts at the edges.

export const G0 = 9.80665; // standard gravity, m/s^2

// Factor to SI for each unit. si/us name the default unit for each unit system.
export const UNITS = {
  length:    { si: 'mm', us: 'in', u: { m: 1, cm: 1e-2, mm: 1e-3, in: 0.0254, ft: 0.3048 } },
  area:      { si: 'mm²', us: 'in²', u: { 'm²': 1, 'cm²': 1e-4, 'mm²': 1e-6, 'in²': 0.0254 ** 2, 'ft²': 0.3048 ** 2 } },
  modulus3:  { si: 'mm³', us: 'in³', u: { 'm³': 1, 'cm³': 1e-6, 'mm³': 1e-9, 'in³': 0.0254 ** 3 } },
  inertia:   { si: 'mm⁴', us: 'in⁴', u: { 'm⁴': 1, 'cm⁴': 1e-8, 'mm⁴': 1e-12, 'in⁴': 0.0254 ** 4 } },
  force:     { si: 'N', us: 'lbf', u: { N: 1, kN: 1e3, lbf: 4.4482216152605, kip: 4448.2216152605 } },
  lineLoad:  { si: 'N/mm', us: 'lbf/in', u: { 'N/m': 1, 'N/mm': 1e3, 'kN/m': 1e3, 'lbf/in': 4.4482216152605 / 0.0254, 'lbf/ft': 4.4482216152605 / 0.3048 } },
  stress:    { si: 'MPa', us: 'ksi', u: { Pa: 1, kPa: 1e3, MPa: 1e6, GPa: 1e9, psi: 6894.757293168, ksi: 6894757.293168, Msi: 6894757293.168 } },
  moment:    { si: 'N·m', us: 'lbf·in', u: { 'N·m': 1, 'N·mm': 1e-3, 'kN·m': 1e3, 'lbf·in': 0.1129848290276167, 'lbf·ft': 1.3558179483314004 } },
  mass:      { si: 'kg', us: 'lbm', u: { kg: 1, g: 1e-3, lbm: 0.45359237, slug: 14.593902937206364 } },
  stiffness: { si: 'N/mm', us: 'lbf/in', u: { 'N/m': 1, 'N/mm': 1e3, 'kN/mm': 1e6, 'lbf/in': 4.4482216152605 / 0.0254 } },
  accel:     { si: 'g', us: 'g', u: { g: G0, 'm/s²': 1, 'in/s²': 0.0254, 'ft/s²': 0.3048 } },
  frequency: { si: 'Hz', us: 'Hz', u: { Hz: 1, 'rad/s': 1 / (2 * Math.PI), rpm: 1 / 60 } },
  time:      { si: 's', us: 's', u: { s: 1, ms: 1e-3 } },
  angle:     { si: 'deg', us: 'deg', u: { rad: 1, deg: Math.PI / 180 } },
  density:   { si: 'kg/m³', us: 'lbm/in³', u: { 'kg/m³': 1, 'g/cm³': 1e3, 'lbm/in³': 0.45359237 / 0.0254 ** 3, 'lbm/ft³': 0.45359237 / 0.3048 ** 3 } },
  power:     { si: 'kW', us: 'hp', u: { W: 1, kW: 1e3, hp: 745.6998715822702 } },
  none:      { si: '', us: '', u: { '': 1 } },
};

export const toSI = (v, dim, unit) => v * UNITS[dim].u[unit];
export const fromSI = (v, dim, unit) => v / UNITS[dim].u[unit];
export const convert = (v, dim, from, to) => fromSI(toSI(v, dim, from), dim, to);

// ---------- Section properties (x = strong/horizontal axis through centroid) ----------
export function sectionRect(b, h) {
  const A = b * h, Ix = b * h ** 3 / 12, Iy = h * b ** 3 / 12;
  const a = Math.max(b, h), c = Math.min(b, h);
  // Roark torsion constant for a solid rectangle, J = a c^3 [1/3 - 0.21 (c/a)(1 - c^4/(12 a^4))]
  const J = a * c ** 3 * (1 / 3 - 0.21 * (c / a) * (1 - c ** 4 / (12 * a ** 4)));
  return withDerived({ A, Ix, Iy, J, cx: h / 2, cy: b / 2 });
}

export function sectionHollowRect(B, H, t) {
  if (2 * t >= Math.min(B, H)) throw new Error('Wall thickness must be less than half the smaller outside dimension.');
  const b = B - 2 * t, h = H - 2 * t;
  const A = B * H - b * h, Ix = (B * H ** 3 - b * h ** 3) / 12, Iy = (H * B ** 3 - h * b ** 3) / 12;
  // Thin-wall closed section (Bredt): J = 4 Am^2 t / perimeter, on the wall midline
  const Am = (B - t) * (H - t), p = 2 * ((B - t) + (H - t));
  const J = 4 * Am ** 2 * t / p;
  return withDerived({ A, Ix, Iy, J, cx: H / 2, cy: B / 2 });
}

export function sectionCircle(d) {
  const A = Math.PI * d ** 2 / 4, I = Math.PI * d ** 4 / 64;
  return withDerived({ A, Ix: I, Iy: I, J: 2 * I, cx: d / 2, cy: d / 2 });
}

export function sectionTube(D, t) {
  if (2 * t >= D) throw new Error('Wall thickness must be less than the radius.');
  const d = D - 2 * t;
  const A = Math.PI * (D ** 2 - d ** 2) / 4, I = Math.PI * (D ** 4 - d ** 4) / 64;
  return withDerived({ A, Ix: I, Iy: I, J: 2 * I, cx: D / 2, cy: D / 2 });
}

// Doubly symmetric I-beam: flange width b, total depth h, flange thickness tf, web thickness tw.
export function sectionIBeam(b, h, tf, tw) {
  if (2 * tf >= h) throw new Error('Flanges overlap: 2·tf must be less than h.');
  if (tw >= b) throw new Error('Web thickness must be less than flange width.');
  const hw = h - 2 * tf;
  const A = 2 * b * tf + hw * tw;
  const Ix = (b * h ** 3 - (b - tw) * hw ** 3) / 12;
  const Iy = (2 * tf * b ** 3 + hw * tw ** 3) / 12;
  const J = (2 * b * tf ** 3 + (h - tf) * tw ** 3) / 3; // open thin-wall sum of b t^3 / 3
  return withDerived({ A, Ix, Iy, J, cx: h / 2, cy: b / 2 });
}

function withDerived(s) {
  return { ...s, Sx: s.Ix / s.cx, Sy: s.Iy / s.cy, rx: Math.sqrt(s.Ix / s.A), ry: Math.sqrt(s.Iy / s.A) };
}

// ---------- Beams (Euler-Bernoulli, linear elastic, small deflection, prismatic) ----------
// Returns max deflection, max slope, max moment, max shear, and max bending stress (needs c).
export const BEAM_CASES = {
  cantPoint: (L, q, E, I) => ({ delta: q * L ** 3 / (3 * E * I), theta: q * L ** 2 / (2 * E * I), M: q * L, V: q }),
  cantUDL:   (L, q, E, I) => ({ delta: q * L ** 4 / (8 * E * I), theta: q * L ** 3 / (6 * E * I), M: q * L ** 2 / 2, V: q * L }),
  ssPoint:   (L, q, E, I) => ({ delta: q * L ** 3 / (48 * E * I), theta: q * L ** 2 / (16 * E * I), M: q * L / 4, V: q / 2 }),
  ssUDL:     (L, q, E, I) => ({ delta: 5 * q * L ** 4 / (384 * E * I), theta: q * L ** 3 / (24 * E * I), M: q * L ** 2 / 8, V: q * L / 2 }),
  fixedPoint:(L, q, E, I) => ({ delta: q * L ** 3 / (192 * E * I), theta: q * L ** 2 / (64 * E * I), M: q * L / 8, V: q / 2 }),
  fixedUDL:  (L, q, E, I) => ({ delta: q * L ** 4 / (384 * E * I), theta: q * L ** 3 / (72 * Math.sqrt(3) * E * I), M: q * L ** 2 / 12, V: q * L / 2 }),
};

export function beam(caseKey, L, q, E, I, c) {
  const r = BEAM_CASES[caseKey](L, q, E, I);
  return { ...r, sigma: r.M * c / I };
}

// ---------- Single degree of freedom ----------
export const fnFromKM = (k, m) => Math.sqrt(k / m) / (2 * Math.PI);
export const fnFromStaticDeflection = (dst) => Math.sqrt(G0 / dst) / (2 * Math.PI);

// Massless-beam cantilever with tip mass; beam mass added with the Rayleigh factor 33/140.
export function cantileverTipMass(L, E, I, mTip, mBeam = 0) {
  const k = 3 * E * I / L ** 3;
  const mEff = mTip + (33 / 140) * mBeam;
  return { k, mEff, fn: fnFromKM(k, mEff) };
}

// ---------- Random vibration ----------
// Miles' equation: SDOF response to flat base-input ASD (g^2/Hz) at fn. Returns response in g.
export function miles(fn, Q, asd) {
  const grms = Math.sqrt((Math.PI / 2) * fn * Q * asd);
  return { grms, g3sigma: 3 * grms };
}

// Overall Grms of a breakpoint ASD profile, straight lines on log-log axes between points.
export function psdGrms(points) {
  if (points.length < 2) throw new Error('Enter at least two breakpoints.');
  const segs = [];
  let area = 0;
  for (let i = 1; i < points.length; i++) {
    const [f1, a1] = points[i - 1], [f2, a2] = points[i];
    if (!(f2 > f1)) throw new Error(`Frequencies must increase (row ${i + 1}).`);
    if (!(a1 > 0 && a2 > 0)) throw new Error('ASD values must be positive.');
    const n = Math.log(a2 / a1) / Math.log(f2 / f1); // log-log slope
    const segArea = Math.abs(n + 1) < 1e-9
      ? a1 * f1 * Math.log(f2 / f1)
      : a1 * f1 / (n + 1) * ((f2 / f1) ** (n + 1) - 1);
    area += segArea;
    segs.push({ f1, f2, dBperOct: 10 * Math.log10(2) * n, area: segArea });
  }
  return { area, grms: Math.sqrt(area), segs };
}

export function parsePoints(text) {
  return text.split(/\n|;/).map(s => s.trim()).filter(Boolean).map((line, i) => {
    const nums = line.split(/[\s,\t]+/).filter(Boolean).map(Number);
    if (nums.length !== 2 || nums.some(x => !Number.isFinite(x))) throw new Error(`Row ${i + 1}: need "frequency ASD".`);
    return nums;
  });
}

// ---------- Fasteners: short-form torque-preload relation T = K D F ----------
export const torqueFromPreload = (K, D, F) => K * D * F;
export const preloadFromTorque = (K, D, T) => T / (K * D);

// ---------- Margins of safety (aerospace convention) ----------
export function margins(applied, FSy, FSu, Fty, Ftu) {
  return { MSy: Fty / (FSy * applied) - 1, MSu: Ftu / (FSu * applied) - 1 };
}

// ---------- Shaft power / torsion ----------
export function shaft(P, f, D, d = 0) {
  const omega = 2 * Math.PI * f; // f in rev/s (Hz)
  const T = P / omega;
  const J = Math.PI * (D ** 4 - d ** 4) / 32;
  return { T, J, tau: T * (D / 2) / J };
}

// ---------- Structural dynamics: base-excitation transmissibility (SDOF) ----------
// Inputs SI/Hz; base acceleration in Earth g. TR = |abs accel / base accel|.
export function transmissibility({ fn, zeta, f, baseG }) {
  if (!(fn > 0) || !(f > 0) || !(zeta > 0) || !(baseG >= 0)) throw new Error('Need fn > 0, f > 0, ζ > 0, base accel ≥ 0.');
  const r = f / fn, c = 2 * zeta * r, d = 1 - r * r;
  const TR = Math.sqrt((1 + c * c) / (d * d + c * c));
  // H = (1 + j2ζr)/(1 - r² + j2ζr); atan2 keeps the denominator angle valid above r = 1.
  const phase_deg = (Math.atan2(c, 1) - Math.atan2(c, d)) * 180 / Math.PI;
  const r2pk = 2 / (Math.sqrt(1 + 8 * zeta * zeta) + 1); // rationalized: no cancellation at small zeta
  const peak_TR = Math.sqrt((1 + 4 * zeta * zeta * r2pk) / ((1 - r2pk) ** 2 + 4 * zeta * zeta * r2pk));
  const wn = 2 * Math.PI * fn; // |z| = A_base / (wn² |1 - r² + j2ζr|)
  const rel_disp_mm = baseG * G0 / (wn * wn) / Math.sqrt(d * d + c * c) * 1000;
  return { r, TR, phase_deg, resp_g: TR * baseG, rel_disp_mm, peak_TR };
}

// ---------- Structural dynamics: damped free vibration, log decrement (SDOF ring-down) ----------
// Two positive peaks N cycles apart (any one length unit) and the ringing frequency fd (Hz).
export function logDecrement({ fd, x1, xN, N }) {
  if (!(fd > 0) || !(x1 > 0) || !(xN > 0) || !(xN < x1) || !Number.isInteger(N) || N < 1)
    throw new Error('Need fd > 0, first peak > later peak > 0, and N a whole number of cycles ≥ 1.');
  const delta = Math.log(x1 / xN) / N;
  const u = (delta / (2 * Math.PI)) ** 2;           // (δ/2π)²
  const zeta = delta / Math.sqrt(4 * Math.PI ** 2 + delta * delta);
  const s = Math.sqrt(1 + u);                       // = 1/√(1−ζ²)
  const n_half = Math.LN2 / delta;
  return { delta, zeta, fn: fd * s, Q: 1 / (2 * zeta), zeta_approx: delta / (2 * Math.PI),
    approx_err_pct: u / (s + 1) * 100,              // (δ/2π)/ζ − 1 = √(1+u) − 1, cancellation-free
    n_half, t_half: n_half / fd };
}

// Release from rest, normalized: x/x1 after c damped cycles = e^(−δc)[cos 2πc + (δ/2π) sin 2πc].
export const ringdown = (delta, c) => Math.exp(-delta * c) * (Math.cos(2 * Math.PI * c) + delta / (2 * Math.PI) * Math.sin(2 * Math.PI * c));

// Free response of ẍ + 2ζωn·ẋ + ωn²·x = 0 at time t (s) from x(0) = x0, ẋ(0) = v0; fn in Hz.
// x comes back in x0's length unit and v in that unit per second. Drives the animated SDOF rig.
// Closed form for ζ < 1, ζ = 1 and ζ > 1 (t ≥ 0); the ζ ≥ 1 branch is written on the slow root
// so it neither overflows at large t nor cancels near ζ = 1.
export function freeDecay(t, x0, v0, fn, zeta) {
  if (!(fn > 0) || !(zeta >= 0) || !Number.isFinite(fn) || !Number.isFinite(zeta)) throw new Error('Need fn > 0 and ζ ≥ 0.');
  if (![t, x0, v0].every(Number.isFinite) || t < 0) throw new Error('Need finite initial conditions and t ≥ 0.');
  const wn = 2 * Math.PI * fn, a = zeta * wn;
  let c, s;                                         // x = x0·c + (v0 + a·x0)·s, decay already folded in
  if (zeta < 1) {
    const wd = wn * Math.sqrt(1 - zeta * zeta), e = Math.exp(-a * t);
    c = e * Math.cos(wd * t); s = e * Math.sin(wd * t) / wd;
  } else {
    const q = Math.sqrt(zeta * zeta - 1), b = wn * q;           // roots −a ± b
    const e1 = Math.exp(-wn * t / (zeta + q));                  // slow root −a + b = −ωn/(ζ + √(ζ²−1))
    c = e1 * (1 + Math.exp(-2 * b * t)) / 2;                    // e^(−at)·cosh(bt)
    s = b > 0 ? e1 * -Math.expm1(-2 * b * t) / (2 * b) : e1 * t; // e^(−at)·sinh(bt)/b → t·e^(−ωn·t) at ζ = 1
  }
  return { x: x0 * c + (v0 + a * x0) * s, v: v0 * c - (a * v0 + wn * wn * x0) * s };
}

// ---------- Structural dynamics: force-driven SDOF, dynamic amplification and phase ----------
// m·ẍ + c·ẋ + k·x = F0·sin(ωt). SI in: fn, f in Hz, F0 in N, k in N/m. x_static = F0/k and X come back in m.
// DAF = X/x_static = 1/√((1 − r²)² + (2ζr)²); the displacement lags the force by φ = atan2(2ζr, 1 − r²), 0..180°.
// The displacement peak sits at r = √(1 − 2ζ²) and is 1/(2ζ√(1 − ζ²)); for ζ ≥ 1/√2 the curve only falls from
// its static value, so the largest DAF is 1 at r = 0 (no resonant peak).
export function forcedDAF({ fn, zeta, f, F0, k }) {
  if (!(fn > 0) || !(f > 0) || !(zeta > 0) || !(F0 >= 0) || !(k > 0) || ![fn, zeta, f, F0, k].every(Number.isFinite))
    throw new Error('Need fn > 0, f > 0, ζ > 0, F0 ≥ 0, k > 0.');
  const r = f / fn, c = 2 * zeta * r, d = 1 - r * r;
  const DAF = 1 / Math.hypot(d, c), x_static = F0 / k;
  const resonant = zeta < Math.SQRT1_2;
  return { r, x_static, DAF, X: DAF * x_static, phase_lag_deg: Math.atan2(c, d) * 180 / Math.PI,
    resonant, r_peak: resonant ? Math.sqrt(1 - 2 * zeta * zeta) : 0,
    peak_DAF: resonant ? 1 / (2 * zeta * Math.sqrt(1 - zeta * zeta)) : 1 };
}

// ---------- ShakeLab scene drives: SDOF from rest under a sine force or a sine base motion ----------
// Pure closed forms played by docs/sim. Hz in, normalized motion out; t in seconds of physical time.
function driveTerms(t, fn, zeta, f) {
  if (!(fn > 0) || !(f > 0) || !(zeta >= 0) || ![t, fn, zeta, f].every(Number.isFinite) || t < 0)
    throw new Error('Need fn > 0, f > 0, ζ ≥ 0 and t ≥ 0.');
  const r = f / fn, c = 2 * zeta * r, d = 1 - r * r, den = d * d + c * c;
  if (!(den > 0)) throw new Error('Undamped resonance (ζ = 0, f = fn) has no steady state.');
  const w = 2 * Math.PI * f;
  return { r, c, d, D2: 1 / den, w, sin: Math.sin(w * t), cos: Math.cos(w * t) };
}

// Force-driven rig from rest. ẍ + 2ζωn·ẋ + ωn²·x = ωn²·sin(ωt), x(0) = ẋ(0) = 0, so x is in units of
// x_static = F0/k and v in x_static per second. Closed form = steady state + free transient:
//   x_ss = D²[(1 − r²)·sin ωt − 2ζr·cos ωt],  D² = 1/((1 − r²)² + (2ζr)²)   (= DAF·sin(ωt − φ))
//   x = x_ss(t) + freeDecay(t, −x_ss(0), −ẋ_ss(0)),  which covers ζ < 1, ζ = 1 and ζ > 1.
export function forcedResponse(t, fn, zeta, f) {
  const { c, d, D2, w, sin, cos } = driveTerms(t, fn, zeta, f);
  const h = freeDecay(t, c * D2, -w * d * D2, fn, zeta);
  return { x: D2 * (d * sin - c * cos) + h.x, v: w * D2 * (d * cos + c * sin) + h.v };
}

// Base-driven rig in the ground frame, in units of the base amplitude Y: base y = sin(ωt), mass absolute x,
// spring stretch z = x − y. Initial conditions (they match scipy lsim of X/Y = (2ζωn·s + ωn²)/(s² + 2ζωn·s + ωn²)
// from zero state): the mass starts at rest, x(0) = 0 and ẋ(0) = 0, while the base starts at y(0) = 0 already
// moving at ẏ(0) = ω. So z(0) = 0, ż(0) = −ω, and the damper gives the mass ẍ(0) = 2ζωn·ω.
// Relative motion obeys z̈ + 2ζωn·ż + ωn²·z = −ÿ = ω²·sin(ωt):
//   z_ss = r²D²[(1 − r²)·sin ωt − 2ζr·cos ωt],  z = z_ss(t) + freeDecay(t, −z_ss(0), −ω − ż_ss(0)),  x = y + z.
export function baseResponse(t, fn, zeta, f) {
  const { r, c, d, D2, w, sin, cos } = driveTerms(t, fn, zeta, f);
  const g = r * r * D2;
  const h = freeDecay(t, g * c, -w - w * g * d, fn, zeta);
  const z = g * (d * sin - c * cos) + h.x;
  return { y: sin, x: sin + z, z };
}

// ---------- Structural dynamics: half-power bandwidth damping (SDOF FRF peak) ----------
// Peak frequency fr and the half-power frequencies f1 < fr < f2 (|H| = peak/√2), all Hz.
// Exact ζ, fn assume an SDOF displacement (receptance) FRF: r² = 1 − 2ζ² ± 2ζ√(1 − ζ²) at f1, f2.
export function halfPower({ fr, f1, f2 }) {
  if (!(f1 > 0) || !(fr > f1) || !(f2 > fr) || !Number.isFinite(f2))
    throw new Error('Need 0 < f1 < fr < f2 (half-power frequencies either side of the peak).');
  const df = f2 - f1, zeta_hp = df / (2 * fr);
  const rho = (f2 - f1) * (f2 + f1) / (f1 * f1 + f2 * f2);  // (f2² − f1²)/(f1² + f2²) = 2ζ√(1−ζ²)/(1−2ζ²)
  const q = Math.sqrt(1 + rho * rho);
  const z2 = rho * rho / (2 * q * (q + 1));                 // (1 − 1/q)/2 without cancellation
  const zeta = Math.sqrt(z2);
  return { df, Q: fr / df, zeta_hp, zeta, fn: Math.sqrt((f1 * f1 + f2 * f2) / (2 * (1 - 2 * z2))),
    approx_err_pct: (zeta_hp / zeta - 1) * 100, peak_gain: 1 / (2 * zeta * Math.sqrt(1 - z2)) };
}

// SDOF receptance gain k|X/F| at frequency f (Hz).
export const receptanceGain = (fn, zeta, f) => { const r = f / fn; return 1 / Math.sqrt((1 - r * r) ** 2 + (2 * zeta * r) ** 2); };
