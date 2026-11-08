// Spec layer: app.js hands compute() SI values (accel in m/s²) and expects SI back.
// Catches unit slips between the UI and the toolbox functions, against the scipy refs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOOLS } from '../docs/tools.js';
import { G0 } from '../docs/calcs.js';

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
});
