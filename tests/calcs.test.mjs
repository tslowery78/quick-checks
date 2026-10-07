// Reference values were computed independently (Python/NumPy, textbook formulas, or published
// profile Grms values), not by calling calcs.js. Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
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
