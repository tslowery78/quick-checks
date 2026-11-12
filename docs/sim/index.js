import { freeDecay, forcedResponse, baseResponse, sweepState } from '../calcs.js';
import { webglOK, timeScale, timeLabel, peakTravel } from './support.js';

// One spring-mass rig, four drives:
//   freeDecay  params { fd, zeta, fn }   pull the mass and let go (displacement in scene units, not to scale)
//   forced     params { fn, zeta, f }    F(t) = F0·sin(ωt) on the mass, from rest; motion in units of x_static
//   base       params { fn, zeta, f }    base y(t) = Y·sin(ωt), from rest; absolute motion in units of Y
//   sweep      params { fn, zeta, fr, f1, f2 }   sine force swept 0.5·fn → 1.5·fn in LOOP seconds of playback, shown
//              QUASI-STEADY (each frequency at its steady state, calcs.js sweepState); motion in units of the peak
//              amplitude. A strip under the scene traces amplitude against frequency with fr, f1, f2 and the band.
// Driven rigs draw upward-positive, ground-frame motion times one labeled visual scale (`unit`, scene units
// per normalized unit) chosen so the largest excursion from rest stays inside the frame.
const COPY = {
  freeDecay: { tag: 'DISPLACEMENT NOT TO SCALE', button: '↧ Bounce it', again: 'Bounce it', flat: '2D spring and mass free decay',
    aria: 'Spring and mass. Drag the teal block to release; drag empty space to orbit.', hint: 'Drag the block · orbit the space · pinch to zoom' },
  forced: { tag: '×1/x_static · VISUAL SCALE', button: '⇅ Shake it', again: 'Shake it', flat: '2D spring and mass driven by a sinusoidal force',
    aria: 'Spring and mass driven by a sinusoidal force, shown as an amber arrow on the teal block. Drag to orbit.', hint: 'Amber arrow = force F(t) · white lines = ± x_static · drag to orbit' },
  sweep: { tag: 'AMPLITUDE ×1/PEAK · VISUAL SCALE', button: '⟳ Sweep it', again: 'Sweep it', flat: '2D spring and mass swept through resonance by a sinusoidal force',
    aria: 'Spring and mass driven by a sinusoidal force whose frequency sweeps slowly through resonance. The teal block glows inside the half-power band. Drag to orbit.', hint: 'Amber arrow = force F(t) · white lines = ± peak/√2 · block glows from f₁ to f₂' },
  base: { tag: 'MOTION ×1/Y · VISUAL SCALE', button: '⇅ Shake it', again: 'Shake it', flat: '2D spring and mass on a shaking base',
    aria: 'Spring and mass hanging from an amber frame that shakes up and down on a fixed pedestal. Drag to orbit.', hint: 'Amber frame = base y(t) · teal block = mass x(t) · white rail = fixed ground' },
};
const TRAVEL = .6, BASE_TRAVEL = .34;   // scene units available to the spring stretch and to the base plate
const LOOP = 12, SWEEP_TO = 1.5;        // sweep: seconds of playback per pass, and the top of the sweep in units of fn
const fix = (v) => v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v >= .1 ? v.toFixed(2) : v.toPrecision(2);

export async function mountSim(container, { kind, drive, params, reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches, onReady = () => {}, onPeak = () => {} }) {
  if (kind !== 'sdofRig' || !COPY[drive]) throw new Error('Unknown simulation');
  const copy = COPY[drive], driven = drive !== 'freeDecay', strip = drive === 'sweep';   // strip: wide 2D trace under the scene instead of the corner gauge
  container.innerHTML = `<div class="sim-heading"><span>ShakeLab <small>${copy.tag}</small></span><span class="sim-mode">Loading rig…</span></div><div class="sim-stage"><canvas class="sim" aria-label="${copy.aria}" role="img"></canvas>${driven && !strip ? '<canvas class="sim-gauge" aria-hidden="true"></canvas>' : ''}<div class="sim-hud${driven ? ' dense' : ''}"></div></div>${strip ? '<canvas class="sim-trace" aria-hidden="true"></canvas>' : ''}<p class="sim-hint">${copy.hint}</p><button type="button" id="sim-release">${copy.button}</button>`;
  const canvas = container.querySelector('canvas'), hud = container.querySelector('.sim-hud');
  const mode = container.querySelector('.sim-mode'), button = container.querySelector('button');
  const stage = container.querySelector('.sim-stage'), gauge = container.querySelector('.sim-gauge'), trace = container.querySelector('.sim-trace');
  let rig, ctx, disposed = false, visible = true, hostActive = true, raf = 0, previous = null, age = 0, time = 0, x0 = 0, x = 0, dragging = false, peaks = 0, flash = 0, frames = 0, ready = false, valid = true;
  let p, scale, width = 1, height = 1, canvas2d;
  // Driven rigs: y base, force −1..1, steady-state gain and phase, visual unit, and whether the shaker runs.
  let y = 0, force = 0, gain = 1, phase = 0, unit = TRAVEL, running = !reducedMotion, seen = 0;   // seen: largest |x| since restart (gauge scale)
  // sweep: last sweepState, its options { duration (physical s), from, to }, the amplitude curve for the trace, and the mass glow 0..1.
  let sw = null, span = null, curve = [], lit = 0;
  const reference = () => drive === 'sweep' ? unit * Math.SQRT1_2 : unit;   // where the white lines sit: ± peak/√2, or ± x_static
  function release(fraction = .3) {
    if (disposed) return;
    dragging = false;
    if (!valid || !Number.isFinite(fraction)) return;
    if (driven) { running = true; x = y = force = time = peaks = seen = lit = 0; onPeak(0); schedule(); return; }
    x0 = Math.max(-.4, Math.min(.4, fraction)) * 1.65; x = x0; time = 0; peaks = 0; flash = 0; dragging = false; onPeak(0); schedule();
  }
  function steady(next) {
    if (drive === 'sweep') {            // amplitude 1 at the peak fills the travel; the sweep starts lower when f1 sits below 0.5·fn
      span = { duration: LOOP / scale, from: Math.min(.5, .8 * next.f1 / next.fn), to: SWEEP_TO };
      curve = Array.from({ length: 161 }, (_, i) => sweepState(span.duration * Math.min(i / 160, 1 - 1e-12), next.fn, next.zeta, span).amp);
      sw = sweepState(0, next.fn, next.zeta, span); gain = sw.amp; phase = sw.phaseDeg; unit = TRAVEL;
      rig?.setReference(reference()); return;
    }
    const r = next.f / next.fn, c = 2 * next.zeta * r, d = 1 - r * r, D = 1 / Math.hypot(d, c);
    if (drive === 'forced') {           // DAF and lag of displacement behind force
      gain = D; phase = Math.atan2(c, d) * 180 / Math.PI;
      unit = TRAVEL / Math.max(1, peakTravel(t => forcedResponse(t, next.fn, next.zeta, next.f).x, next.fn, next.zeta, next.f, D));
    } else {                            // TR = |x|/|y| and phase of mass relative to base (negative = lag)
      gain = Math.hypot(1, c) * D; phase = (Math.atan2(c, 1) - Math.atan2(c, d)) * 180 / Math.PI;
      unit = Math.min(BASE_TRAVEL, TRAVEL / peakTravel(t => baseResponse(t, next.fn, next.zeta, next.f).z, next.fn, next.zeta, next.f, r * r * D));
    }
    rig?.setReference(unit);
  }
  function update(next) {
    const wasValid = valid, ok = (v) => Number.isFinite(v) && v > 0;
    valid = !!next && (drive === 'sweep' ? ok(next.fn) && ok(next.zeta) && next.zeta < Math.SQRT1_2 && ok(next.fr) && ok(next.f1) && ok(next.f2) && next.f1 < next.f2
      : driven ? ok(next.fn) && ok(next.f) && ok(next.zeta)
      : Number.isFinite(next.fd) && next.fd > 0 && Number.isFinite(next.zeta) && next.zeta >= 0 && next.zeta < 1);
    button.disabled = !valid;
    if (!valid) {
      dragging = false; x0 = x = y = force = time = peaks = flash = seen = lit = 0; sw = null;
      hud.textContent = 'Enter valid calculator inputs'; schedule(); return;
    }
    if (driven) {
      const changed = !p || Object.keys(next).some(k => p[k] !== next[k]);
      p = { ...next }; scale = timeScale(drive === 'sweep' ? SWEEP_TO * p.fn : p.f);   // sweep: its fastest forcing plays at ≤ 1.5 Hz
      if (changed || !sw && drive === 'sweep') steady(p);
      if (changed || !wasValid) { x = y = force = time = peaks = seen = lit = 0; if (!reducedMotion) running = true; if (frames) onPeak(0); }  // new inputs restart from rest
      schedule(); return;
    }
    const changed = p && (p.fd !== next.fd || p.zeta !== next.zeta);
    p = { ...next, fn: next.fn ?? next.fd / Math.sqrt(1 - next.zeta ** 2) };
    scale = timeScale(p.fd); if (changed || !wasValid) release(.3); schedule();
  }
  function fallback(reason) {
    rig?.dispose(); rig = null;
    canvas.hidden = true;
    if (!canvas2d) { canvas2d = document.createElement('canvas'); canvas2d.className = 'sim-fallback'; canvas2d.setAttribute('aria-label', copy.flat); stage.prepend(canvas2d); ctx = canvas2d.getContext('2d'); }
    mode.textContent = '2D view';
    container.querySelector('.sim-hint').textContent = `${reason}. Use ${copy.again} for the 2D motion.`;
    container.dataset.renderer = '2d'; ready = false; resize();
    onReady({ renderer: '2d', reason }); schedule();
  }
  // Scene-unit pose, positive down: mass and base in the ground frame.
  const pose = () => driven ? { mass: -unit * x, base: -unit * y } : { mass: x, base: 0 };
  function draw2D() {
    const d = Math.min(devicePixelRatio || 1, 2); ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.fillStyle = '#101e2a'; ctx.fillRect(0, 0, width, height);
    const px = height * .19, at = pose(), inset = drive === 'base' ? 16 : 0, shift = at.base * px;
    const cx = width / 2, rest = height * .62, yy = rest + at.mass * px, top = 34 + inset + shift, ground = height - 28 - (strip ? 44 : driven ? 30 : 0), foot = ground + shift;   // driven: clear the two- or three-line HUD
    if (driven) { ctx.strokeStyle = '#b8fff5'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.strokeRect(cx - 46, rest - 28, 92, 52); ctx.setLineDash([]); }
    ctx.strokeStyle = '#b9cfdd'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, top);
    for (let i = 0; i <= 72; i++) ctx.lineTo(cx + Math.sin(i / 72 * Math.PI * 18) * 19, top + (yy - 28 - top) * i / 72);
    ctx.stroke(); ctx.fillStyle = lit > .5 ? '#5ff5e6' : '#10b9ac'; ctx.fillRect(cx - 46, yy - 28, 92, 52);
    ctx.fillStyle = drive === 'base' ? '#e58a1f' : '#526b7b'; ctx.fillRect(cx - 90, top - 8, 180, 8); ctx.fillRect(cx - 90, foot, 180, 8);
    if (drive === 'base') {             // frame posts move with the base; the white rail is the fixed ground
      ctx.fillRect(cx - 90, top, 5, foot - top); ctx.fillRect(cx + 85, top, 5, foot - top);
      ctx.fillStyle = '#f2f8ff'; ctx.fillRect(cx - 120, ground - 1, 240, 2);
    }
    if (drive === 'forced' || drive === 'sweep') {
      ctx.fillStyle = '#f2f8ff'; for (const s of [-1, 1]) ctx.fillRect(cx - 60, rest - 2 + s * reference() * px - 1, 120, 2);
      const tip = yy - 2 - force * .8 * px, dir = Math.sign(force) || 1;
      ctx.strokeStyle = ctx.fillStyle = '#ffb347'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx, yy - 2); ctx.lineTo(cx, tip + dir * Math.min(10, Math.abs(tip - yy + 2))); ctx.stroke();
      if (Math.abs(force) > .02) { ctx.beginPath(); ctx.moveTo(cx, tip); ctx.lineTo(cx - 9, tip + dir * 13); ctx.lineTo(cx + 9, tip + dir * 13); ctx.fill(); }
    }
  }
  // Small 2D readout over the scene. forced: phasor dial (vertical projection = live value; x trails F by φ).
  // base: steady-state amplitude tracks for base (1) and mass (TR) with live dots at y(t) and x(t).
  function drawGauge() {
    const d = Math.min(devicePixelRatio || 1, 2), w = 104, h = 104, g = gauge.getContext('2d');
    if (gauge.width !== w * d) { gauge.width = w * d; gauge.height = h * d; }
    g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(8,20,29,.72)'; g.beginPath(); g.roundRect(0, 0, w, h, 10); g.fill();
    g.font = '10px ui-monospace,monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineCap = 'round';
    if (drive === 'forced') {
      const cx = w / 2, cy = 46, R = 32, a = 2 * Math.PI * p.f * time, lag = phase * Math.PI / 180;
      g.strokeStyle = '#3d5868'; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.stroke();
      g.strokeStyle = 'rgba(242,248,255,.55)'; g.beginPath(); g.arc(cx, cy, 13, -a, -(a - lag)); g.stroke();
      for (const [angle, color, name] of [[a, '#ffb347', 'F'], [a - lag, '#2fe0d0', 'x']]) {
        const ex = cx + R * Math.cos(angle), ey = cy - R * Math.sin(angle);
        g.strokeStyle = g.fillStyle = color; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(ex, ey); g.stroke();
        g.beginPath(); g.arc(ex, ey, 3.5, 0, 2 * Math.PI); g.fill();
        g.fillText(name, cx + (R - 11) * Math.cos(angle + .45), cy - (R - 11) * Math.sin(angle + .45));
      }
      g.fillStyle = '#d9e9f1'; g.fillText(`x lags F ${phase.toFixed(0)}°`, cx, 93);
    } else {
      seen = Math.max(seen, Math.abs(x));   // start-up overshoot can exceed the steady gain: grow the scale, never clip
      const cy = 44, H = 30, top = Math.max(1, gain, seen);
      g.strokeStyle = 'rgba(242,248,255,.6)'; g.lineWidth = 1; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(8, cy); g.lineTo(w - 8, cy); g.stroke(); g.setLineDash([]);
      for (const [cx, color, amp, value, name] of [[30, '#e58a1f', 1, y, 'base'], [74, '#2fe0d0', gain, x, 'mass']]) {
        const half = Math.max(1.5, H * amp / top), dot = cy - Math.max(-H - 6, Math.min(H + 6, H * value / top));
        g.strokeStyle = color; g.globalAlpha = .45; g.lineWidth = 12; g.beginPath(); g.moveTo(cx, cy - half); g.lineTo(cx, cy + half); g.stroke(); g.globalAlpha = 1;
        g.fillStyle = '#f2f8ff'; g.beginPath(); g.arc(cx, dot, 4, 0, 2 * Math.PI); g.fill();
        g.fillStyle = color; g.fillText(name, cx, 86); g.fillStyle = '#d9e9f1'; g.fillText(`×${fix(amp)}`, cx, 97);
      }
    }
  }
  // Strip under the scene. sweep: normalized amplitude against forcing frequency. Faint = the whole steady-state curve,
  // bright = the part swept so far, dot = now. Verticals at f1, fr, f2; shaded = half-power band (brighter while inside).
  function drawTrace() {
    const d = Math.min(devicePixelRatio || 1, 2), w = Math.max(1, trace.clientWidth), h = Math.max(1, trace.clientHeight), g = trace.getContext('2d');
    if (trace.width !== Math.round(w * d) || trace.height !== Math.round(h * d)) { trace.width = Math.round(w * d); trace.height = Math.round(h * d); }
    g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
    g.fillStyle = '#0b1721'; g.fillRect(0, 0, w, h);
    g.font = '10px ui-monospace,monospace'; g.textBaseline = 'middle'; g.lineCap = 'round'; g.lineJoin = 'round';
    const L = 34, R = w - 14, T0 = 16, B = h - 20, X = (r) => L + (R - L) * (Math.max(span.from, Math.min(span.to, r)) - span.from) / (span.to - span.from), Y = (a) => B - (B - T0) * a;
    const r1 = p.f1 / p.fn, r2 = p.f2 / p.fn, rr = p.fr / p.fn, n = curve.length - 1, half = Y(Math.SQRT1_2);
    g.fillStyle = sw.inBand ? 'rgba(47,224,208,.45)' : 'rgba(47,224,208,.16)'; g.fillRect(X(r1), T0, X(r2) - X(r1), B - T0);
    g.strokeStyle = '#3d5868'; g.lineWidth = 1; g.beginPath(); g.moveTo(L, T0); g.lineTo(L, B); g.lineTo(R, B); g.stroke();
    g.strokeStyle = 'rgba(242,248,255,.6)'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(L, half); g.lineTo(R, half); g.stroke(); g.setLineDash([]);
    g.strokeStyle = '#f2f8ff'; for (const r of [r1, r2]) { g.beginPath(); g.moveTo(X(r), half); g.lineTo(X(r), B + 3); g.stroke(); }
    g.strokeStyle = '#ffb347'; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(X(rr), T0 - 3); g.lineTo(X(rr), B + 3); g.stroke(); g.setLineDash([]);
    const path = (upto) => { g.beginPath(); for (let i = 0; i <= upto; i++) g[i ? 'lineTo' : 'moveTo'](L + (R - L) * i / n, Y(curve[i])); };
    g.strokeStyle = 'rgba(185,207,221,.35)'; g.lineWidth = 1.5; path(n); g.stroke();
    const now = L + (R - L) * sw.u, done = Math.floor(sw.u * n);
    g.strokeStyle = '#2fe0d0'; g.lineWidth = 2.5; path(done); g.lineTo(now, Y(sw.amp)); g.stroke();
    g.fillStyle = sw.inBand ? '#ffffff' : '#2fe0d0'; g.beginPath(); g.arc(now, Y(sw.amp), 4, 0, 2 * Math.PI); g.fill();
    g.fillStyle = '#9eb8c5'; g.textAlign = 'right'; g.fillText('1', L - 5, Y(1)); g.fillText('1/√2', L - 5, half); g.fillText('0', L - 5, B);
    g.fillStyle = '#ffb347'; g.textAlign = 'center'; g.fillText('fr', X(rr), 7);
    g.fillStyle = '#f2f8ff'; g.textAlign = 'right'; g.fillText('f₁', X(r1) - 3, B + 10); g.textAlign = 'left'; g.fillText('f₂', X(r2) + 3, B + 10);
    g.fillStyle = '#9eb8c5'; g.textAlign = 'right'; g.fillText(`${fix(span.to * p.fn)} Hz`, R + 10, B + 10);
    if (X(r1) - L > 70) { g.textAlign = 'left'; g.fillText(`${fix(span.from * p.fn)} Hz`, L, B + 10); }
    g.textAlign = 'left'; g.fillText('amplitude/peak vs f', L + 6, T0 + 2);
  }
  function resize() {
    width = Math.max(1, stage.clientWidth); height = Math.max(1, stage.clientHeight);
    rig?.resize(width, height);
    if (canvas2d) { const d = Math.min(devicePixelRatio || 1, 2); canvas2d.width = width * d; canvas2d.height = height * d; }
    schedule();
  }
  function schedule() { if (!disposed && visible && hostActive && !document.hidden && !raf && (rig || ctx)) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    if (disposed || !visible || !hostActive || document.hidden) { previous = null; return; }
    const dt = previous === null ? 0 : Math.min((now - previous) / 1000, .1); previous = now; age += dt;
    if (valid && driven) {
      if (running) time += dt / scale;
      let count;                                             // completed forcing cycles since the start (sweep: of this pass)
      if (drive === 'sweep') {
        // One pass, then: Reduce Motion holds the finished trace at rest until asked again; otherwise the loop restarts from rest.
        if (time >= span.duration) { if (reducedMotion) { time = span.duration; running = false; } else time %= span.duration; }
        sw = sweepState(Math.min(time, span.duration * (1 - 1e-12)), p.fn, p.zeta, span);
        ({ x, force } = sw); gain = sw.amp; phase = sw.phaseDeg; count = Math.floor(sw.theta / (2 * Math.PI) + 1e-9);
        lit += ((sw.inBand ? 1 : 0) - lit) * Math.min(1, dt * 10);
      } else {
        if (drive === 'forced') { x = forcedResponse(time, p.fn, p.zeta, p.f).x; force = Math.sin(2 * Math.PI * p.f * time); }
        else ({ x, y } = baseResponse(time, p.fn, p.zeta, p.f));
        count = Math.floor(time * p.f + 1e-9);
      }
      if (drive === 'sweep' ? count !== peaks : count > peaks) { peaks = count; onPeak(peaks); }
    } else if (valid && !dragging) {
      time += dt / scale; x = freeDecay(time, x0, 0, p.fn, p.zeta).x;
      // Positive displacement peaks only, excluding the initial condition at t=0.
      const count = x0 > 0 ? Math.floor(time * p.fd + 1e-9) : x0 < 0 ? Math.max(0, Math.floor(time * p.fd + .5 + 1e-9)) : 0;
      if (count > peaks) { peaks = count; flash = 1; onPeak(peaks); }
    }
    flash = Math.max(0, flash - dt * 3);
    if (valid && drive === 'sweep') hud.textContent = `f ${fix(sw.f)} Hz · r ${sw.r.toFixed(3)} · amplitude ${sw.amp.toFixed(2)} (×1/peak)\nζ ${p.zeta.toFixed(4)} · Q ${fix(p.fr / (p.f2 - p.f1))} · ${timeLabel(scale)}${sw.inBand ? ' · IN BAND' : ''}\nquasi-steady sweep: each frequency shown at steady state`;
    else if (valid && drive === 'forced') hud.textContent = `r ${fix(p.f / p.fn)} · DAF ${fix(gain)} · lag φ ${phase.toFixed(1)}° · ${timeLabel(scale)}\ndisplacement normalized (×1/x_static, visual scale)`;
    else if (valid && driven) hud.textContent = `r ${fix(p.f / p.fn)} · TR ${fix(gain)} · phase ${phase.toFixed(1)}° · ${timeLabel(scale)}\nmotion normalized (×1/Y), visual scale`;
    else if (valid) hud.textContent = `${timeLabel(scale)}  ·  peaks ${peaks}  ·  ζ ${p.zeta.toFixed(4)}`;
    if (gauge) { gauge.hidden = !valid; if (valid) drawGauge(); }
    if (trace) { trace.hidden = !valid; if (valid) drawTrace(); }
    try {
      if (rig) {
        const at = pose(); rig.draw(at.mass, age, flash, at.base, force, lit);
        if (!ready) { ready = true; mode.textContent = '3D rig'; container.dataset.renderer = 'webgl'; onReady({ renderer: 'webgl', ...rig.snapshot() }); }
      } else if (ctx) draw2D();
    } catch (error) { fallback('3D rendering unavailable'); }
    frames++; schedule();
  }
  function pause() { cancelAnimationFrame(raf); raf = 0; previous = null; }
  const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (visible) schedule(); else pause(); });
  observer.observe(container);
  const ro = new ResizeObserver(resize); ro.observe(stage);
  const visibility = () => document.hidden ? pause() : schedule(); document.addEventListener('visibilitychange', visibility);
  const bounce = () => release(.3); button.addEventListener('click', bounce);
  // Read-only state for tests and hosts. massY/baseY are the drawn displacements from rest in scene units,
  // positive up, ground frame (read back from the meshes in 3D); x, y, force are the physics values.
  const snapshot = () => ({ renderer: container.dataset.renderer, drive, disposed, frames, active: !!raf, visible, hostActive, time, x, x0, peaks, params: p, scale, dragging,
    y, force, gain, phase, unit, running, massY: -pose().mass, baseY: -pose().base, inBand: !!sw?.inBand, lit, sweep: sw, span, ...rig?.snapshot() });
  const state = () => snapshot();
  const api = {
    update, release, snapshot,
    setActive(active) { hostActive = !!active; if (hostActive) schedule(); else pause(); },
    dispose() { if (disposed) return; disposed = true; pause(); observer.disconnect(); ro.disconnect(); document.removeEventListener('visibilitychange', visibility); button.removeEventListener('click', bounce); rig?.dispose(); rig = null; container.replaceChildren(); delete container.__sim; if (window.__simState === state) delete window.__simState; }
  };
  container.__sim = api; window.__simState = state; update(params);
  try {
    if (!webglOK()) fallback('3D is unavailable on this device');
    else {
      const { createRig } = await import('./rig.js');
      if (!container.isConnected) { api.dispose(); return api; }
      rig = createRig(canvas, { drive, reducedMotion, onFailure: fallback,
        onPull(f) { if (disposed || !valid || driven) return; dragging = true; x = x0 = f * 1.65; time = 0; peaks = 0; }, onRelease: () => { if (!driven) release(x / 1.65); } });
      rig.setReference(reference()); resize(); schedule();
    }
  } catch (error) { fallback('3D could not start'); }
  return api;
}
