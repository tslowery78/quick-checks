// Calculator definitions. Adding a tool = one entry here plus tests in tests/calcs.test.mjs.
// Input defaults are [US value, SI value] in that system's default unit for the dimension.
// compute() receives SI values and returns SI values keyed by output key.
import * as C from './calcs.js';

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
];
