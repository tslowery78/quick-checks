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
5. Smoke: add the id to `TOOLS` in `tests/smoke.py` (and a canvas non-blank check like the transmissibility one).
6. Run `npm test` and the smoke test, then check a 390 px wide screenshot.
