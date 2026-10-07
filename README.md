# Engineering Quick Checks

Static calculator site (no build step, no server code, no tracking). Live: https://tslowery78.github.io/quick-checks/ . Open `docs/` with any static host.

- `docs/calcs.js`: pure SI math and unit tables. `docs/tools.js`: one spec per calculator.
  `docs/app.js`: renders any spec (inputs with unit pickers, results, formula, shareable link, calc sheet).
- Add a tool: write the function in calcs.js, a spec in tools.js, and a reference-value test.
- Tests: `npm test` (math vs. independently computed values) and
  `python3 -m http.server 8765 -d docs & python3 tests/smoke.py` (every tool and mode, US and SI, in Chromium).
- Local preview: `python3 -m http.server 8765 -d docs`, then open http://localhost:8765/.
