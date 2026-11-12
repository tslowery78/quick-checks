// Calculator definitions. Adding a tool = one entry here plus tests in tests/calcs.test.mjs.
// Input defaults are [US value, SI value] in that system's default unit for the dimension.
// compute() receives SI values and returns SI values keyed by output key.
import * as C from './calcs.js';
import { drawPlot, logspace } from './plot.js';

const E_DEF = [10.0e3, 71.0e3]; // aluminum, ksi / MPa

export const TOOLS = [
  {
    id: 'beam', title: 'Beam deflection & stress', group: 'Structures',
    blurb: 'Six classic prismatic-beam cases: max deflection, slope, moment, shear, bending stress.',
    modes: [
      ['cantPoint', 'Cantilever, tip load'], ['cantUDL', 'Cantilever, uniform load'],
      ['ssPoint', 'Simply supported, center load'], ['ssUDL', 'Simply supported, uniform load'],
      ['fixedPoint', 'Fixed-fixed, center load'], ['fixedUDL', 'Fixed-fixed, uniform load'],
    ],
    inputs: [
      { key: 'L', label: 'Span L', dim: 'length', def: [20, 500] },
      { key: 'P', label: 'Point load P', dim: 'force', def: [100, 500], modes: ['cantPoint', 'ssPoint', 'fixedPoint'] },
      { key: 'w', label: 'Uniform load w', dim: 'lineLoad', def: [5, 1], modes: ['cantUDL', 'ssUDL', 'fixedUDL'] },
      { key: 'E', label: 'Young’s modulus E', dim: 'stress', def: E_DEF },
      { key: 'I', label: 'Area moment I', dim: 'inertia', def: [0.1, 40000] },
      { key: 'c', label: 'Outer-fiber distance c', dim: 'length', def: [0.5, 12.5] },
    ],
    outputs: [
      { key: 'delta', label: 'Max deflection', dim: 'length' },
      { key: 'theta', label: 'Max slope', dim: 'angle' },
      { key: 'M', label: 'Max moment', dim: 'moment' },
      { key: 'V', label: 'Max shear', dim: 'force' },
      { key: 'sigma', label: 'Max bending stress', dim: 'stress' },
    ],
    compute: (v, mode) => C.beam(mode, v.L, mode.endsWith('UDL') ? v.w : v.P, v.E, v.I, v.c),
    formula: 'Cantilever: δ = PL³/3EI, wL⁴/8EI. Simply supported: PL³/48EI, 5wL⁴/384EI. Fixed-fixed: PL³/192EI, wL⁴/384EI. σ = Mc/I.',
    assumptions: ['Euler-Bernoulli: linear elastic, small deflection, plane sections, no shear deformation (short deep beams deflect more).',
      'Prismatic beam, load in a principal plane, no buckling or lateral-torsional check.',
      'Fixed-fixed moment is the larger of end and center moments (end moment).'],
    refs: 'Roark’s Formulas for Stress and Strain, Table 8.1.',
  },
  {
    id: 'section', title: 'Section properties', group: 'Structures',
    blurb: 'Area, I, section modulus, radius of gyration, torsion constant for common shapes.',
    modes: [['rect', 'Solid rectangle'], ['hrect', 'Rectangular tube'], ['circle', 'Solid circle'], ['tube', 'Round tube'], ['ibeam', 'I-beam (symmetric)']],
    inputs: [
      { key: 'b', label: 'Width b', dim: 'length', def: [1, 25], modes: ['rect', 'ibeam'] },
      { key: 'h', label: 'Height h', dim: 'length', def: [2, 50], modes: ['rect', 'ibeam'] },
      { key: 'B', label: 'Outside width B', dim: 'length', def: [2, 50], modes: ['hrect'] },
      { key: 'H', label: 'Outside height H', dim: 'length', def: [3, 75], modes: ['hrect'] },
      { key: 'D', label: 'Outside diameter D', dim: 'length', def: [1, 25], modes: ['circle', 'tube'] },
      { key: 't', label: 'Wall thickness t', dim: 'length', def: [0.125, 3], modes: ['hrect', 'tube'] },
      { key: 'tf', label: 'Flange thickness tf', dim: 'length', def: [0.25, 6], modes: ['ibeam'] },
      { key: 'tw', label: 'Web thickness tw', dim: 'length', def: [0.19, 5], modes: ['ibeam'] },
    ],
    outputs: [
      { key: 'A', label: 'Area A', dim: 'area' },
      { key: 'Ix', label: 'Ix (about horizontal axis)', dim: 'inertia' },
      { key: 'Iy', label: 'Iy (about vertical axis)', dim: 'inertia' },
      { key: 'Sx', label: 'Section modulus Sx', dim: 'modulus3' },
      { key: 'Sy', label: 'Section modulus Sy', dim: 'modulus3' },
      { key: 'rx', label: 'Radius of gyration rx', dim: 'length' },
      { key: 'ry', label: 'Radius of gyration ry', dim: 'length' },
      { key: 'J', label: 'Torsion constant J', dim: 'inertia' },
    ],
    compute: (v, mode) => ({
      rect: () => C.sectionRect(v.b, v.h), hrect: () => C.sectionHollowRect(v.B, v.H, v.t),
      circle: () => C.sectionCircle(v.D), tube: () => C.sectionTube(v.D, v.t),
      ibeam: () => C.sectionIBeam(v.b, v.h, v.tf, v.tw),
    })[mode](),
    formula: 'I = ∫y²dA about the centroid; S = I/c; r = √(I/A).',
    assumptions: ['Sharp corners: no fillets or corner radii (real tubes and rolled shapes differ by a few percent).',
      'J: exact for circles; Roark series for solid rectangles; thin-wall Bredt for rectangular tubes; Σbt³/3 for I-beams.'],
    refs: 'Roark Table A.1 and Table 10.1.',
  },
  {
    id: 'sdof', title: 'Natural frequency (SDOF)', group: 'Dynamics',
    blurb: 'Spring-mass frequency from k and m, from static sag, or for a cantilever with a tip mass.',
    modes: [['km', 'Stiffness and mass'], ['sag', 'Static deflection under 1 g'], ['cant', 'Cantilever with tip mass']],
    inputs: [
      { key: 'k', label: 'Stiffness k', dim: 'stiffness', def: [1000, 200], modes: ['km'] },
      { key: 'm', label: 'Mass m', dim: 'mass', def: [10, 5], modes: ['km'] },
      { key: 'dst', label: 'Static deflection', dim: 'length', def: [0.01, 0.25], modes: ['sag'] },
      { key: 'L', label: 'Length L', dim: 'length', def: [10, 250], modes: ['cant'] },
      { key: 'E', label: 'Young’s modulus E', dim: 'stress', def: E_DEF, modes: ['cant'] },
      { key: 'I', label: 'Area moment I', dim: 'inertia', def: [0.01, 4000], modes: ['cant'] },
      { key: 'mt', label: 'Tip mass', dim: 'mass', def: [2, 1], modes: ['cant'] },
      { key: 'mb', label: 'Beam mass (0 to ignore)', dim: 'mass', def: [0.5, 0.25], modes: ['cant'] },
    ],
    outputs: [
      { key: 'fn', label: 'Natural frequency fn', dim: 'frequency' },
      { key: 'T', label: 'Period', dim: 'time' },
      { key: 'k', label: 'Stiffness used', dim: 'stiffness' },
    ],
    compute: (v, mode) => {
      let fn, k;
      if (mode === 'km') { fn = C.fnFromKM(v.k, v.m); k = v.k; }
      else if (mode === 'sag') { fn = C.fnFromStaticDeflection(v.dst); k = NaN; }
      else { const r = C.cantileverTipMass(v.L, v.E, v.I, v.mt, v.mb); fn = r.fn; k = r.k; }
      return { fn, T: 1 / fn, k };
    },
    formula: 'fn = (1/2π)√(k/m). From sag: fn = (1/2π)√(g/δst) ≈ 3.13/√δst[in] Hz. Cantilever: k = 3EI/L³, m = m_tip + (33/140)m_beam.',
    assumptions: ['Linear, undamped single degree of freedom.',
      'Cantilever: Rayleigh estimate with the static deflection shape; within ~1.5% of exact for any tip/beam mass ratio.'],
    refs: 'Blevins, Formulas for Natural Frequency and Mode Shape, Table 8-8.',
  },
  {
    id: 'miles', title: 'Miles’ equation', group: 'Dynamics',
    blurb: 'SDOF response to random base input: Grms and 3σ load factor, optional equivalent force.',
    inputs: [
      { key: 'fn', label: 'Natural frequency fn', dim: 'frequency', def: [100, 100] },
      { key: 'Q', label: 'Amplification Q', dim: 'none', def: [10, 10] },
      { key: 'asd', label: 'Input ASD at fn (g²/Hz)', dim: 'none', def: [0.04, 0.04] },
      { key: 'm', label: 'Mass (0 to skip force)', dim: 'mass', def: [0, 0] },
    ],
    outputs: [
      { key: 'grms', label: 'Response Grms', dim: 'accel' },
      { key: 'g3', label: '3σ load factor', dim: 'accel' },
      { key: 'F3', label: '3σ equivalent force m·3σ', dim: 'force' },
    ],
    compute: (v) => { const r = C.miles(v.fn, v.Q, v.asd); return { grms: r.grms * C.G0, g3: r.g3sigma * C.G0, F3: v.m * r.g3sigma * C.G0 }; },
    formula: 'Grms = √(π/2 · fn · Q · ASD(fn)). Q = 1/2ζ.',
    assumptions: ['SDOF with light damping, base-driven; input ASD roughly flat across the half-power band around fn.',
      'Q = 10 is a common default for bolted metallic structure; measured Q varies with level and joint type.',
      '3σ is a peak convention; Gaussian response exceeds it about 0.27% of the time.'],
    refs: 'Miles (1954); NASA-HDBK-7005.',
  },
  {
    id: 'psd', title: 'Random vibration Grms (PSD)', group: 'Dynamics',
    blurb: 'Overall Grms of a breakpoint ASD profile, with dB/octave slope of each segment.',
    inputs: [
      { key: 'pts', label: 'Breakpoints: frequency (Hz)  ASD (g²/Hz), one per line', type: 'text',
        def: ['20 0.026\n50 0.16\n800 0.16\n2000 0.026', '20 0.026\n50 0.16\n800 0.16\n2000 0.026'] },
    ],
    outputs: [
      { key: 'grms', label: 'Overall Grms', dim: 'accel' },
      { key: 'area', label: 'Area under ASD (g²)', dim: 'none' },
    ],
    compute: (v) => {
      const r = C.psdGrms(C.parsePoints(v.pts));
      const table = r.segs.map(s => [`${s.f1}–${s.f2} Hz`, `${s.dBperOct >= 0 ? '+' : ''}${s.dBperOct.toFixed(2)} dB/oct`, `${s.area.toPrecision(4)} g²`]);
      return { grms: r.grms * C.G0, area: r.area, _table: { head: ['Segment', 'Slope', 'Area'], rows: table } };
    },
    formula: 'Each segment is a straight line on log-log axes, ASD = A₁(f/f₁)ⁿ; area = A₁f₁/(n+1)·[(f₂/f₁)ⁿ⁺¹ − 1]; Grms = √Σarea.',
    assumptions: ['Default profile is GEVS-SE qualification (14.1 Grms).'],
    refs: 'GSFC-STD-7000 (GEVS) Table 2.4-3.',
  },
  {
    id: 'margin', title: 'Margin of safety', group: 'Structures',
    blurb: 'Yield and ultimate margins from applied limit stress, factors of safety, and allowables.',
    inputs: [
      { key: 's', label: 'Applied limit stress', dim: 'stress', def: [30, 200] },
      { key: 'FSy', label: 'Yield factor of safety', dim: 'none', def: [1.25, 1.25] },
      { key: 'FSu', label: 'Ultimate factor of safety', dim: 'none', def: [1.4, 1.4] },
      { key: 'Fty', label: 'Yield allowable Fty', dim: 'stress', def: [35, 241] },
      { key: 'Ftu', label: 'Ultimate allowable Ftu', dim: 'stress', def: [42, 290] },
    ],
    outputs: [
      { key: 'MSy', label: 'MS yield', dim: 'none', margin: true },
      { key: 'MSu', label: 'MS ultimate', dim: 'none', margin: true },
    ],
    compute: (v) => C.margins(v.s, v.FSy, v.FSu, v.Fty, v.Ftu),
    formula: 'MS = allowable / (FS · applied) − 1. Positive margin passes.',
    assumptions: ['Factors of safety depend on the program and verification approach; take them from the governing standard (e.g. NASA-STD-5001, current revision).',
      'Default allowables are 6061-T6 typical values; use design-basis (A/B-basis) allowables for real work.'],
    refs: 'NASA-STD-5001; MMPDS for allowables.',
  },
  {
    id: 'bolt', title: 'Bolt torque ↔ preload', group: 'Mechanical',
    blurb: 'Short-form torque-tension relation with a nut factor.',
    modes: [['T', 'Torque from preload'], ['F', 'Preload from torque']],
    inputs: [
      { key: 'K', label: 'Nut factor K', dim: 'none', def: [0.2, 0.2] },
      { key: 'D', label: 'Nominal diameter D', dim: 'length', def: [0.25, 6] },
      { key: 'F', label: 'Preload F', dim: 'force', def: [2000, 9000], modes: ['T'] },
      { key: 'T', label: 'Torque T', dim: 'moment', def: [100, 10], modes: ['F'] },
    ],
    outputs: [
      { key: 'T', label: 'Torque', dim: 'moment' },
      { key: 'F', label: 'Preload', dim: 'force' },
    ],
    compute: (v, mode) => mode === 'T'
      ? { T: C.torqueFromPreload(v.K, v.D, v.F), F: v.F }
      : { T: v.T, F: C.preloadFromTorque(v.K, v.D, v.T) },
    formula: 'T = K · D · F.',
    assumptions: ['K ≈ 0.2 dry steel, ≈ 0.15 lubricated, lower with anti-seize; the true value scatters about ±25%, so preload from torque is only good to about ±25-35%.',
      'Check the bolt stress at max preload separately.'],
    refs: 'Shigley’s Mechanical Engineering Design, Ch. 8; NASA-STD-5020.',
  },
  {
    id: 'shaft', title: 'Shaft power & torsion', group: 'Mechanical',
    blurb: 'Torque from power and speed, then torsional shear in a solid or hollow shaft.',
    inputs: [
      { key: 'P', label: 'Power', dim: 'power', def: [10, 7.5] },
      { key: 'n', label: 'Speed', dim: 'frequency', unit: 'rpm', def: [1750, 1450] },
      { key: 'D', label: 'Outside diameter D', dim: 'length', def: [1, 25] },
      { key: 'd', label: 'Inside diameter (0 = solid)', dim: 'length', def: [0, 0] },
    ],
    outputs: [
      { key: 'T', label: 'Torque', dim: 'moment' },
      { key: 'tau', label: 'Max torsional shear', dim: 'stress' },
      { key: 'J', label: 'Polar moment J', dim: 'inertia' },
    ],
    compute: (v) => { if (v.d >= v.D) throw new Error('Inside diameter must be less than outside.'); return C.shaft(v.P, v.n, v.D, v.d); },
    formula: 'T = P/ω, ω = 2πn; τ = T(D/2)/J, J = π(D⁴ − d⁴)/32.',
    assumptions: ['Steady torque only: no bending, keyway stress concentration, or fatigue.'],
    refs: 'Shigley Ch. 3.',
  },
  {
    id: 'transmissibility', sim: { kind: 'sdofRig', drive: 'base' }, title: 'Base-excitation transmissibility', group: 'Structural Dynamics',
    blurb: 'SDOF on a shaking base: absolute-acceleration gain, phase, response in g, and relative displacement.',
    inputs: [
      { key: 'fn', label: 'Natural frequency fn', dim: 'frequency', unit: 'Hz', def: [10, 10] },
      { key: 'zeta', label: 'Damping ratio ζ', dim: 'none', def: [0.05, 0.05] },
      { key: 'f', label: 'Forcing frequency f', dim: 'frequency', unit: 'Hz', def: [20, 20] },
      { key: 'baseG', label: 'Base acceleration', dim: 'accel', unit: 'g', def: [1, 1] },
    ],
    outputs: [
      { key: 'r', label: 'Frequency ratio r = f/fn', dim: 'none' },
      { key: 'TR', label: 'Transmissibility TR', dim: 'none' },
      { key: 'phase_deg', label: 'Phase (deg, negative = lag)', dim: 'none' },
      { key: 'resp_g', label: 'Response accel (abs)', dim: 'accel' },
      { key: 'rel_disp', label: 'Relative displacement', dim: 'length' },
      { key: 'peak_TR', label: 'Peak TR (at resonance)', dim: 'none' },
    ],
    compute: (v) => { const t = C.transmissibility({ fn: v.fn, zeta: v.zeta, f: v.f, baseG: v.baseG / C.G0 }); return { ...t, resp_g: t.resp_g * C.G0, rel_disp: t.rel_disp_mm / 1000 }; },
    demo: (v, canvas) => {
      const rs = logspace(0.1, 10, 160), at = (zeta, r) => C.transmissibility({ fn: 1, zeta, f: r, baseG: 1 }).TR;
      const faint = [0.01, 0.05, 0.2, 0.5].map(z => ({ faint: true, label: `ζ=${z}`, pts: rs.map(r => [r, at(z, r)]) }));
      drawPlot(canvas, {
        xlog: true, ylog: true, xmin: 0.1, xmax: 10, ymin: 0.01, ymax: 100,
        xlabel: 'Frequency ratio r = f/fn', ylabel: 'Transmissibility TR',
        curves: [...faint, { pts: rs.map(r => [r, at(v.zeta, r)]) }],
        vline: { x: Math.SQRT2, label: '√2' },
        point: { x: v.f / v.fn, y: at(v.zeta, v.f / v.fn) },
      });
    },
    formula: 'r = f/fn;  TR = √[(1 + (2ζr)²) / ((1 − r²)² + (2ζr)²)];  phase = atan2(2ζr, 1) − atan2(2ζr, 1 − r²);  response = TR · base g;  relative displacement = base accel / (ωn² · √((1 − r²)² + (2ζr)²)), ωn = 2π·fn;  peak at r² = (√(1+8ζ²) − 1)/(4ζ²).  Symbols: fn natural frequency (Hz), ζ damping ratio, f forcing frequency (Hz), r frequency ratio, TR absolute-accel/base-accel gain.',
    explain: ['Isolation only starts above r = √2: below that, the mount amplifies the base motion (TR > 1).',
      'More damping lowers the resonant peak but raises TR above √2, so it hurts isolation. Pick ζ for the trade you need.',
      'Relative displacement is what loads the spring (stroke, rattle space); it peaks near r = 1 and approaches the base displacement at high r.'],
    assumptions: ['Single degree of freedom, linear, viscous damping, steady sinusoidal base acceleration.',
      'TR is absolute acceleration over base acceleration; relative displacement is mass motion relative to the base.',
      'Phase is response lag relative to base acceleration; peak TR is the closed-form peak of the TR curve (slightly above r = 1 for ζ > 0).'],
    refs: 'Rao, Mechanical Vibrations, base excitation; Harris & Piersol, Shock and Vibration Handbook, Ch. 3.',
  },
  {
    id: 'forced_daf', sim: { kind: 'sdofRig', drive: 'forced' }, title: 'Force-driven SDOF: dynamic amplification and phase', group: 'Structural Dynamics',
    blurb: 'A sinusoidal force on a spring-mass-damper: how much the motion exceeds the static deflection (DAF) and how far it lags the force.',
    inputs: [
      { key: 'fn', label: 'Natural frequency fn', dim: 'frequency', unit: 'Hz', def: [10, 10] },
      { key: 'zeta', label: 'Damping ratio ζ', dim: 'none', def: [0.05, 0.05] },
      { key: 'f', label: 'Forcing frequency f', dim: 'frequency', unit: 'Hz', def: [10, 10] },
      { key: 'F0', label: 'Force amplitude F₀', dim: 'force', def: [25, 100] },
      { key: 'k', label: 'Stiffness k', dim: 'stiffness', def: [50, 10] },
    ],
    outputs: [
      { key: 'r', label: 'Frequency ratio r = f/fn', dim: 'none' },
      { key: 'DAF', label: 'Dynamic amplification DAF', dim: 'none' },
      { key: 'phase_lag_deg', label: 'Phase lag φ (deg, x behind F)', dim: 'none' },
      { key: 'x_static', label: 'Static deflection F₀/k', dim: 'length' },
      { key: 'X', label: 'Dynamic amplitude X', dim: 'length' },
      { key: 'peak_DAF', label: 'Peak DAF', dim: 'none' },
      { key: 'r_peak', label: 'r at peak DAF', dim: 'none' },
    ],
    compute: (v) => {
      const t = C.forcedDAF({ fn: v.fn, zeta: v.zeta, f: v.f, F0: v.F0, k: v.k });
      return { ...t, _table: t.resonant ? undefined : { head: ['Note'], rows: [['ζ ≥ 1/√2: no resonant peak. DAF only falls from 1 at r = 0.']] } };
    },
    demo: (v, canvas) => {
      const rs = logspace(0.1, 10, 240), at = (zeta, r) => C.forcedDAF({ fn: 1, zeta, f: r, F0: 1, k: 1 });
      const grid = (z) => { const q = at(z, 1); return q.resonant ? [...rs, q.r_peak].sort((a, b) => a - b) : rs; };   // include the exact peak: narrow peaks fall between grid points
      const faint = [0.01, 0.05, 0.2, 0.5].map(z => ({ faint: true, pts: grid(z).map(r => [r, at(z, r).DAF]) }));  // they merge at both ends: no end labels
      const r = v.f / v.fn, here = at(v.zeta, r);
      drawPlot(canvas, {
        band: [0, 0.6], xlog: true, ylog: true, xmin: 0.1, xmax: 10, ymin: 0.01, ymax: 100,
        xlabel: '', ylabel: 'DAF = X / x_static',
        curves: [...faint, { pts: grid(v.zeta).map(q => [q, at(v.zeta, q).DAF]) }],
        vline: { x: 1, label: 'r = 1' }, point: { x: r, y: here.DAF },
      });
      drawPlot(canvas, {
        band: [0.6, 1], keep: true, xlog: true, xmin: 0.1, xmax: 10, ymin: 0, ymax: 180, yticks: [0, 90, 180],
        xlabel: 'Frequency ratio r = f/fn', ylabel: 'Lag φ (deg)',
        curves: [{ guide: true, label: '90°', pts: [[0.1, 90], [10, 90]] }, { pts: rs.map(q => [q, at(v.zeta, q).phase_lag_deg]) }],
        vline: { x: 1 }, point: { x: r, y: here.phase_lag_deg },
      });
    },
    formula: 'r = f/fn;  x_static = F₀/k;  DAF = X/x_static = 1/√[(1 − r²)² + (2ζr)²];  X = DAF · x_static;  φ = atan2(2ζr, 1 − r²), 0 to 180°, displacement behind force;  peak DAF = 1/(2ζ√(1 − ζ²)) at r = √(1 − 2ζ²) when ζ < 1/√2, otherwise no resonant peak (largest DAF is 1 at r = 0).  Symbols: fn natural frequency (Hz), ζ damping ratio, f forcing frequency (Hz), F₀ force amplitude, k stiffness, X steady displacement amplitude.',
    explain: ['Push slowly (r well below 1) and the mass just follows the force: DAF ≈ 1, lag ≈ 0. The spring carries the load.',
      'Push at the natural frequency and only the damper resists: DAF ≈ 1/(2ζ), and the motion trails the force by exactly 90°.',
      'Push fast (r well above 1) and the mass cannot keep up: DAF ≈ 1/r², motion nearly opposite the force (lag → 180°).',
      'In the 3D rig the build-up from rest takes about 1/(2πζ) cycles (envelope 1 − e^(−ζωn·t)) to reach ~63% at resonance: light damping means a big DAF but a slow build.'],
    assumptions: ['Single degree of freedom, linear spring, viscous damping, steady sinusoidal force of constant amplitude on the mass.',
      'DAF, X and φ are steady state. The 3D rig starts from rest, so it also shows the start-up transient at the damped natural frequency.',
      'Displacement resonance (peak of X) sits slightly below r = 1; φ is exactly 90° at r = 1 for any ζ.',
      'Plot: your ζ in bold over faint curves for ζ = 0.01, 0.05, 0.2 and 0.5; the lower panel is the lag φ.'],
    refs: 'Rao, Mechanical Vibrations, harmonically excited vibration; Thomson & Dahleh, Theory of Vibration with Applications, Ch. 3.',
  },
  {
    id: 'logdec', sim: { kind: 'sdofRig', drive: 'freeDecay' }, title: 'Log decrement (free-decay damping)', group: 'Structural Dynamics',
    blurb: 'Damping ratio from a ring-down: two peaks N cycles apart give δ, ζ, fn and Q.',
    inputs: [
      { key: 'fd', label: 'Ringing frequency fd (measured)', dim: 'frequency', unit: 'Hz', def: [10, 10] },
      { key: 'x1', label: 'First peak x₁', dim: 'length', def: [0.4, 10] },
      { key: 'xN', label: 'Peak N cycles later', dim: 'length', def: [0.083, 2.075] },
      { key: 'N', label: 'Cycles between peaks N', dim: 'none', def: [5, 5] },
    ],
    outputs: [
      { key: 'zeta', label: 'Damping ratio ζ', dim: 'none' },
      { key: 'delta', label: 'Log decrement δ', dim: 'none' },
      { key: 'fn', label: 'Undamped natural frequency fn', dim: 'frequency' },
      { key: 'Q', label: 'Q = 1/(2ζ)', dim: 'none' },
      { key: 'approx_err_pct', label: 'Error of ζ ≈ δ/2π (%)', dim: 'none' },
      { key: 'n_half', label: 'Cycles to halve amplitude', dim: 'none' },
      { key: 't_half', label: 'Time to halve amplitude', dim: 'time' },
    ],
    compute: (v) => C.logDecrement({ fd: v.fd, x1: v.x1, xN: v.xN, N: v.N }),
    demo: (v, canvas) => {
      const t = C.logDecrement({ fd: v.fd, x1: v.x1, xN: v.xN, N: v.N }), cmax = v.N + 1.5;
      const cs = Array.from({ length: 1200 }, (_, i) => i * cmax / 1199);
      const env = (sgn) => ({ faint: true, pts: cs.map(c => [c, sgn * Math.exp(-t.delta * c)]) });
      drawPlot(canvas, {
        xmin: 0, xmax: cmax, ymin: -1, ymax: 1,
        xlabel: 'Cycles of ringing (t · fd)', ylabel: 'x / x₁',
        curves: [env(1), env(-1), { pts: cs.map(c => [c, C.ringdown(t.delta, c)]) }],
        vline: { x: v.N, label: `N = ${v.N}` },
        point: { x: v.N, y: v.xN / v.x1 },
      });
    },
    formula: 'δ = (1/N)·ln(x₁/x₁₊N);  ζ = δ/√(4π² + δ²);  fn = fd/√(1 − ζ²);  Q = 1/(2ζ);  cycles to halve = ln 2/δ.  Symbols: x₁ a positive peak, x₁₊N the positive peak N cycles later, δ log decrement, ζ damping ratio, fd measured ringing (damped) frequency, fn undamped natural frequency.',
    explain: ['Each cycle the peaks shrink by the same factor e^−δ, so the log of the peak ratio per cycle gives δ, and δ ≈ 2πζ for light damping.',
      'Measuring over many cycles (larger N) averages out noise on any single peak; the δ/2π shortcut is within 1% up to ζ ≈ 0.14.',
      'If δ changes with amplitude along the decay, the damping is not viscous (friction or joints); report ζ at the amplitude you care about.'],
    assumptions: ['Single mode, linear, viscous damping, free decay (no forcing during the ring-down).',
      'Peaks are positive displacement (or acceleration) peaks of the same sign; the ratio is unit-free, so the unit only needs to match.',
      'The plot shows release from rest normalized to x₁, in cycles of the ringing frequency.'],
    refs: 'Rao, Mechanical Vibrations, logarithmic decrement; Thomson & Dahleh, Theory of Vibration, Ch. 2.',
  },
  {
    id: 'halfpower', title: 'Half-power bandwidth (Q from an FRF peak)', group: 'Structural Dynamics',
    blurb: 'Damping from a measured resonance: peak frequency and the two −3 dB points give Q, ζ and fn.',
    inputs: [
      { key: 'fr', label: 'Peak frequency fr', dim: 'frequency', unit: 'Hz', def: [9.975, 9.975] },
      { key: 'f1', label: 'Lower half-power f₁', dim: 'frequency', unit: 'Hz', def: [9.461, 9.461] },
      { key: 'f2', label: 'Upper half-power f₂', dim: 'frequency', unit: 'Hz', def: [10.464, 10.464] },
    ],
    outputs: [
      { key: 'zeta_hp', label: 'Damping ζ ≈ Δf/(2fr)', dim: 'none' },
      { key: 'Q', label: 'Q = fr/Δf', dim: 'none' },
      { key: 'df', label: 'Bandwidth Δf = f₂ − f₁', dim: 'frequency' },
      { key: 'zeta', label: 'Exact SDOF ζ (from f₁, f₂)', dim: 'none' },
      { key: 'approx_err_pct', label: 'Error of Δf/(2fr) (%)', dim: 'none' },
      { key: 'fn', label: 'Undamped natural frequency fn', dim: 'frequency' },
      { key: 'peak_gain', label: 'Peak gain k|X/F| = 1/(2ζ√(1−ζ²))', dim: 'none' },
    ],
    compute: (v) => C.halfPower({ fr: v.fr, f1: v.f1, f2: v.f2 }),
    sim: { kind: 'sdofRig', drive: 'sweep' },
    demo: (v, canvas) => {
      const t = C.halfPower({ fr: v.fr, f1: v.f1, f2: v.f2 }), hp = t.peak_gain / Math.SQRT2;
      const lo = Math.max(0, v.fr - 2.5 * t.df), hi = v.fr + 2.5 * t.df, ymax = t.peak_gain * 1.15;
      const fs = Array.from({ length: 800 }, (_, i) => lo + (hi - lo) * i / 799);
      const vert = (x) => ({ guide: true, pts: [[x, 0], [x, hp]] });
      drawPlot(canvas, {
        xmin: lo, xmax: hi, ymin: 0, ymax,
        xlabel: 'Frequency f (Hz)', ylabel: 'Gain k|X/F|',
        curves: [{ guide: true, label: 'peak/√2', pts: [[lo, hp], [hi, hp]] }, vert(v.f1), vert(v.f2),
          { pts: fs.map(f => [f, C.receptanceGain(t.fn, t.zeta, f)]) }],
        vline: { x: v.fr, label: 'fr' },
        point: { x: v.fr, y: C.receptanceGain(t.fn, t.zeta, v.fr) },
      });
    },
    formula: 'Δf = f₂ − f₁;  Q = fr/Δf;  ζ ≈ Δf/(2fr) = 1/(2Q).  Exact SDOF receptance: ρ = (f₂² − f₁²)/(f₁² + f₂²), ζ² = (1 − 1/√(1+ρ²))/2, fn² = (f₁² + f₂²)/(2(1 − 2ζ²)).  Symbols: fr frequency of the FRF peak, f₁ and f₂ the frequencies where the FRF magnitude is peak/√2 (−3 dB, half the power), ζ damping ratio, fn undamped natural frequency, Q quality factor.',
    explain: ['A lightly damped resonance is a narrow spike; its width at peak/√2 is 2ζ times its frequency, so Δf/(2fr) reads ζ straight off the FRF.',
      'The shortcut overestimates ζ as damping grows: about 0.5% high at ζ = 0.05, 9% at 0.2. The exact line fixes it for a clean SDOF peak.',
      'Need a fine frequency step: if only 2-3 points span Δf, the bandwidth (and ζ) is set by the resolution, not the structure.'],
    assumptions: ['One well-separated mode, linear, viscous damping; read f₁, f₂ on the FRF magnitude (not dB of power) at peak/√2.',
      'Exact ζ and fn assume a displacement (receptance) FRF; for a mobility (velocity) FRF Δf/(2fn) is already exact.',
      'The plot is the SDOF receptance rebuilt from the exact ζ and fn, centred on fr.',
      'The scene is a quasi-steady sweep: each frequency is shown at its steady-state amplitude and phase, divided by the peak. A real sweep this fast would lag and smear the peak.'],
    refs: 'Ewins, Modal Testing, half-power point method; Rao, Mechanical Vibrations, quality factor and bandwidth.',
  },
  {
    id: 'dlf_pulse', sim: { kind: 'sdofRig', drive: 'pulse' }, title: 'Pulse load: dynamic load factor (DLF)', group: 'Structural Dynamics',
    blurb: 'Dynamic load factor for rectangular, half-sine and ramp pulses: how far one hit drives a spring-mass past its static deflection.',
    modes: [['rect', 'Rectangular'], ['halfsine', 'Half-sine'], ['ramp', 'Ramp (held)']],
    inputs: [
      { key: 'td', label: 'Pulse duration t_d (ramp: rise time)', dim: 'time', def: [0.08, 0.08] },
      { key: 'fn', label: 'Natural frequency fn', dim: 'frequency', unit: 'Hz', def: [10, 10] },
      { key: 'zeta', label: 'Damping ratio ζ', dim: 'none', def: [0, 0] },
      { key: 'F0', label: 'Peak force F₀', dim: 'force', def: [25, 100] },
      { key: 'k', label: 'Stiffness k', dim: 'stiffness', def: [50, 10] },
    ],
    outputs: [
      { key: 'T', label: 'Natural period T = 1/fn', dim: 'time' },
      { key: 'td_over_T', label: 'Duration ratio t_d/T', dim: 'none' },
      { key: 'DLF', label: 'Dynamic load factor DLF', dim: 'none' },
      { key: 'x_static', label: 'Static deflection F₀/k', dim: 'length' },
      { key: 'x_max', label: 'Peak deflection DLF · x_static', dim: 'length' },
      { key: 't_peak', label: 'Time of the peak t_peak', dim: 'time' },
      { key: 'F_eq', label: 'Equivalent static force DLF · F₀', dim: 'force' },
    ],
    compute: (v, mode) => {
      const t = C.dlfPulse({ kind: mode, td: v.td, fn: v.fn, zeta: v.zeta, F0: v.F0, k: v.k });
      const when = mode === 'ramp' ? 'Residual peak: the largest deflection comes after the rise ends, on the first overshoot about the held load.'
        : t.primary ? 'Primary peak: the largest deflection happens while the pulse is still on.'
        : 'Residual peak: the largest deflection comes after the pulse has ended, in free vibration.';
      return { ...t, kind: mode, _table: { head: ['Peak'], rows: [[when]] } };
    },
    demo: (v, canvas, mode) => {
      const ratio = v.td * v.fn, here = C.pulsePeak(mode, ratio, v.zeta);
      canvas.style.height = '400px';        // two stacked panels, each with its own x axis
      // Shock spectrum for this pulse shape and ζ. The window follows an operating point outside 0.05..10.
      const top = mode === 'halfsine' ? C.PULSE_MAX_RATIO : 1e6;
      const xmin = Math.min(0.05, 10 ** Math.floor(Math.log10(ratio))), xmax = Math.min(top, Math.max(10, 10 ** Math.ceil(Math.log10(ratio))));
      const key = [mode, v.zeta, xmin, xmax].join();
      if (spectrum.key !== key) {
        const grid = logspace(xmin, xmax, 200), at = (z) => grid.map(q => [q, C.pulsePeak(mode, q, z).DLF]);
        spectrum = { key, bold: at(v.zeta), undamped: v.zeta > 0 ? at(0) : null };
      }
      const bold = [...spectrum.bold, [ratio, here.DLF]].sort((a, b) => a[0] - b[0]);   // include the operating point itself
      drawPlot(canvas, {
        band: [0, 0.54], xlog: true, xmin, xmax, ymin: 0, ymax: 2.2, yticks: [0, 0.5, 1, 1.5, 2],
        xlabel: 'Duration ratio t_d / T', ylabel: 'DLF = x_max / x_static',
        curves: [{ guide: true, label: 'static', pts: [[xmin, 1], [xmax, 1]] }, ...(spectrum.undamped ? [{ faint: true, label: 'ζ = 0', pts: spectrum.undamped }] : []), { pts: bold }],
        point: { x: ratio, y: here.DLF },
      });
      // Time history at the operating point: force (dashed) and response, both normalized.
      const span = Math.max(3, Math.ceil(ratio + 2)), n = Math.min(4000, Math.max(600, span * 40));
      const ts = Array.from({ length: n + 1 }, (_, i) => span * i / n), xs = ts.map(t => C.pulseResponse(t, mode, ratio, v.zeta).x);
      const force = mode === 'rect' ? [[0, 0], [0, 1], [ratio, 1], [ratio, 0], [span, 0]] : mode === 'ramp' ? [[0, 0], [ratio, 1], [span, 1]]
        : ts.map(t => [t, t < ratio ? Math.sin(Math.PI * t / ratio) : 0]);
      const lo = Math.min(0, ...xs), ymin = lo < 0 ? Math.floor(lo * 2 - 1e-9) / 2 : 0, ymax = Math.max(1.5, Math.ceil(here.DLF * 2 + 0.2) / 2);
      drawPlot(canvas, {
        band: [0.54, 1], keep: true, xmin: 0, xmax: span, ymin, ymax,
        xlabel: 'Time t / T', ylabel: 'x / x_static',
        curves: [{ guide: true, label: 'F / F₀', pts: force }, { pts: ts.map((t, i) => [t, xs[i]]) }],
        vline: { x: ratio, label: 't_d' }, point: { x: here.t_peak_over_T, y: here.DLF },
      });
    },
    formula: 'T = 1/fn;  x_static = F₀/k;  x(t) = exact Duhamel solution from rest for the chosen pulse;  DLF = max over t ≥ 0 of x(t)/x_static;  x_max = DLF · x_static;  F_eq = DLF · F₀.  Undamped checks: rectangular DLF = 2·sin(π·t_d/T) for t_d/T < 0.5, else 2;  ramp DLF = 1 + |sin(π·t_d/T)|/(π·t_d/T);  half-sine at t_d/T = 1: DLF = √3;  very short pulses: DLF → 2π·t_d/T (rectangular), 4·t_d/T (half-sine), 2 (ramp, a sudden step).  Symbols: t_d pulse duration (ramp: rise time, then held at F₀), fn natural frequency (Hz), T natural period, ζ damping ratio, F₀ peak force, k stiffness.',
    explain: ['A sudden load can deflect a structure up to twice as far as the same load applied slowly: the mass overshoots. DLF is that ratio.',
      'Short hit (t_d well under T/2): the structure only feels the impulse (area under the force), so DLF is small and the peak comes after the hit, in free vibration (residual).',
      'Long hit (t_d above about T/2): the peak comes while the load is still on (primary). A rectangular pulse reaches the full 2; a half-sine tops out near 1.77 around t_d/T = 0.8 and settles toward 1.',
      'Ramp: rising over a whole number of periods cancels the overshoot (DLF = 1 undamped); a rise much shorter than T acts like a sudden step (DLF → 2).',
      'In the 3D rig the amber arrow is F(t), the outline is the static deflection and the yellow line latches at the peak: its height over the outline height is the DLF.'],
    assumptions: ['Single degree of freedom, linear spring, viscous damping, underdamped (0 ≤ ζ < 1), at rest when the pulse starts.',
      'DLF is on displacement (equally on spring force). The peak is searched over all time: during the pulse and in the free vibration after it.',
      'Ramp: the load rises linearly over t_d and then stays at F₀, so its peak is always after the rise ("residual").',
      'Half-sine: t_d/T up to 2000; beyond that the load is quasi-static (DLF within 0.03% of 1).',
      'Upper plot: DLF against t_d/T for this pulse shape at your ζ (faint: ζ = 0). Lower plot: F(t) dashed and x(t) at your inputs, the dot marks the peak.'],
    refs: 'Biggs, Introduction to Structural Dynamics, maximum response charts for pulse loads; Chopra, Dynamics of Structures, response to pulse excitations; Harris & Piersol, Shock and Vibration Handbook, transient response to step and pulse functions.',
  },
];
let spectrum = {};   // dlf_pulse demo: last DLF-vs-t_d/T curves, reused while only the operating point moves
