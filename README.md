# Engineering Quick Checks

Static calculator site (no build step, no server code, no tracking). Live: https://tslowery78.github.io/quick-checks/ . Open `docs/` with any static host.

- `docs/calcs.js`: pure SI math and unit tables. `docs/tools.js`: one spec per calculator.
  `docs/app.js`: renders any spec (inputs with unit pickers, results, formula, shareable link, calc sheet).
- Add a tool: write the function in calcs.js, a spec in tools.js, and a reference-value test.
- Tests: `npm test` (math vs. independently computed values) and
  `python3 -m http.server 8765 -d docs & python3 tests/smoke.py` (every tool and mode, US and SI, in Chromium).
- Local preview: `python3 -m http.server 8765 -d docs`, then open http://localhost:8765/.

## Add a Structural Dynamics concept

One concept per day (group "Structural Dynamics"; shared with the iOS app, see the design doc).

1. Function: add a pure SI function to `docs/calcs.js` and export it (object in, object out; accelerations in Earth g, g0 = 9.80665).
2. Spec: add an entry to `docs/tools.js` with `group: 'Structural Dynamics'`, inputs, outputs, `compute`, `formula` (symbols defined), `explain` (2-3 plain lines), assumptions, refs. Optional `demo: (si, canvas) => ...` redraws live on every input change; use `drawPlot` and `logspace` from `docs/plot.js` (log or linear axes, faint context curves, `vline`, one `point` for the operating point).
3. Refs test: write independent reference values (numpy/scipy, not calcs.js) to JSON, copy to `tests/refs/<id>.json`, and add a test in `tests/calcs.test.mjs` checking every field to rel 1e-6.
4. Spec test: in `tests/specs.test.mjs`, call the spec's `compute` with SI inputs (accel in m/s², not g) and check SI outputs against the same refs. `compute` gets m/s²; convert to g before calling a g-based function.
5. Smoke: add the id to `TOOLS` in `tests/smoke.py` (and a canvas non-blank check like the transmissibility one). If the spec has a driven `sim`, add a `run_driven_checks(p, '<id>', '<drive>')` line (`run_scene_checks` for a scene with a trace strip).
6. Run `npm test` and the smoke test, then check a 390 px wide screenshot.

## ShakeLab interactive free decay

The Structural Dynamics section is branded ShakeLab; the site remains Engineering Quick Checks.
Log decrement is the first scene. Drag the teal mass, release it, orbit empty space, or use
**Bounce it**. Displacement is schematic relative to the spring's equilibrium length (static
sag omitted); frequency and damping come from the current calculator results. Release velocity
is zero. Playback uses wall time / physical time = fd / clamp(fd, 0.4, 1.5), labeled in the HUD.
The peak count excludes the initial condition and counts subsequent positive displacement peaks.

`docs/sim/index.js` owns the drive, clock, visibility and fallback. `rig.js` owns three.js geometry,
lighting and pointer interaction. `mountSim(container, {kind:'sdofRig', drive:'freeDecay', params})`
is asynchronous and returns `update`, `release`, `dispose`, `setActive` (native host visibility)
and a read-only `snapshot` used by interaction tests. `params` is `{fd,zeta,fn}` from the calculator;
`null` disables release while inputs are invalid. `fn` is derived from fd and zeta when omitted.
Reduced Motion skips the fly-in; motion remains available through an intentional bounce.
The existing 2D plot always remains. WebGL absence, initialization/render failure or context loss
shows a labeled animated 2D fallback with the same drive. There is no CDN dependency.

Verification (from this repository; keep Python/browser caches in the task folder):

```sh
python3 -m venv .venv
.venv/bin/pip install scipy pillow playwright
PLAYWRIGHT_BROWSERS_PATH="$PWD/build/browsers" .venv/bin/python -m playwright install chromium
npm test
.venv/bin/python tests/verify_physics.py
python3 -m http.server 8765 -d docs
# In another shell:
PLAYWRIGHT_BROWSERS_PATH="$PWD/build/browsers" .venv/bin/python tests/smoke.py
```

`verify_physics.py` independently recomputes all 30 supplied reference rows and compares 405
additional cases with SciPy matrix exponentials, including critical/overdamped limits and initial
conditions. `smoke.py` includes all calculator checks plus `sim_smoke.py` interaction, disposal,
visibility and fallback checks. These are functional checks, not a frame-rate benchmark.
The app copies this scene with its `tools/sync_sim.sh`; edit the web source, then sync.

## ShakeLab driven rigs

The same `sdofRig` takes two more drives. A spec opts in with `sim: { kind: 'sdofRig', drive }`;
`params` is `{fn, zeta, f}` from the current inputs. Both start from rest and play the closed form
in `docs/calcs.js` (steady state plus the start-up transient, all damping branches), so resonance
builds up over several cycles instead of appearing at full size.

- `drive: 'forced'` (`forcedResponse`): the mass is pushed by F(t) = F0 sin ωt, drawn as an amber
  arrow on the mass. Displacement is x/x_static. White lines mark ± x_static. The dial shows the
  force and displacement phasors and the lag.
- `drive: 'base'` (`baseResponse`): absolute motion in the ground frame. The amber frame is the
  base, y = Y sin ωt; the teal block is the mass x; the spring stretch is z = x − y. Motion is
  divided by Y. A white rail and a wire outline stay fixed to ground. Initial conditions: mass at
  rest (x = 0, ẋ = 0) while the base passes y = 0 at speed ωY, so z(0) = 0 and ż(0) = −ωY.
  The two bars compare base and mass amplitude (TR).

Drawing scale is separate from physics: each rig picks one scene scale from the largest from-rest
excursion (`peakTravel` in `docs/sim/support.js`) and labels the motion as normalized. Playback
speed follows the forcing frequency with the same 0.4 to 1.5 Hz rule, labeled in the HUD.
With Reduce Motion the rig waits for **Shake it**; otherwise it starts when it scrolls into view.
At high r with light damping the start-up ringing at fn (about 1/r) outlasts and outweighs the
steady 1/r² motion for roughly 1/(ζωn) seconds; that is the physics, not a display artifact.
`window.__simState()` returns the read-only snapshot of the mounted scene, with `massY` and `baseY`
read from the drawn meshes (scene units from rest, up positive). `tests/sim_driven_smoke.py` uses
them, with the camera held still, to prove that the mass and the base move.

## ShakeLab sweep through resonance (half-power bandwidth)

`drive: 'sweep'` (`sweepState` in `docs/calcs.js`) is the half-power scene. `params` is
`{fn, zeta, fr, f1, f2}`: fn and the exact ζ from the calculator result, fr, f1, f2 as entered
(`simParamsFor` in `docs/sim/support.js` does the calculator → scene mapping for every drive).

- The force arrow sweeps linearly from 0.5·fn to 1.5·fn in 12 s of playback (lower start if f1 is
  below 0.5·fn). It is a QUASI-STEADY sweep: at each instant the mass is drawn with the steady-state
  amplitude and phase lag of the current frequency, x = (DAF/peak DAF)·sin(θ − φ), θ = 2π∫f dt.
  The HUD says so. A real sweep this fast would lag and smear the peak; the scene does not model that.
- Amplitude is divided by the peak, so 1 = peak. White lines mark ± peak/√2. The block glows and the
  HUD shows IN BAND exactly while amplitude ≥ peak/√2, which is f1..f2.
- The strip under the rig is the live amplitude-vs-frequency trace: faint = whole curve, bright =
  swept so far, verticals at f1, fr, f2, band shaded.
- Playback: the top of the sweep (1.5·fn) plays at 1.5 Hz, so slow-mo × = fn for fn ≥ 0.27 Hz.
- Each pass starts and ends at rest (6% smoothstep fade at both ends, so there is no jump at the
  wrap). It loops; with Reduce Motion it runs one pass per **Sweep it** and stops.

`tests/sim_scene_smoke.py` checks it in the browser (mass mesh position with a still camera, glow
and band edges, closed form at the scene clock, restart, invalid inputs, disposal, 2D fallback).
