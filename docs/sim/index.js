import { freeDecay } from '../calcs.js';
import { webglOK, timeScale, timeLabel } from './support.js';

export async function mountSim(container, { kind, drive, params, reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches, onReady = () => {}, onPeak = () => {} }) {
  if (kind !== 'sdofRig' || drive !== 'freeDecay') throw new Error('Unknown simulation');
  container.innerHTML = `<div class="sim-heading"><span>ShakeLab <small>DISPLACEMENT NOT TO SCALE</small></span><span class="sim-mode">Loading rig…</span></div><div class="sim-stage"><canvas class="sim" aria-label="Spring and mass. Drag the teal block to release; drag empty space to orbit." role="img"></canvas><div class="sim-hud"></div></div><p class="sim-hint">Drag the block · orbit the space · pinch to zoom</p><button type="button" id="sim-release">↧ Bounce it</button>`;
  const canvas = container.querySelector('canvas'), hud = container.querySelector('.sim-hud');
  const mode = container.querySelector('.sim-mode'), button = container.querySelector('button');
  const stage = container.querySelector('.sim-stage');
  let rig, ctx, disposed = false, visible = true, hostActive = true, raf = 0, previous = null, age = 0, time = 0, x0 = 0, x = 0, dragging = false, peaks = 0, flash = 0, frames = 0, ready = false, valid = true;
  let p, scale, width = 1, height = 1, canvas2d;
  function release(fraction = .3) {
    if (disposed) return;
    dragging = false;
    if (!valid || !Number.isFinite(fraction)) return;
    x0 = Math.max(-.4, Math.min(.4, fraction)) * 1.65; x = x0; time = 0; peaks = 0; flash = 0; dragging = false; onPeak(0); schedule();
  }
  function update(next) {
    const wasValid = valid;
    valid = !!next && Number.isFinite(next.fd) && next.fd > 0 && Number.isFinite(next.zeta) && next.zeta >= 0 && next.zeta < 1;
    button.disabled = !valid;
    if (!valid) {
      dragging = false; x0 = x = time = peaks = flash = 0;
      hud.textContent = 'Enter valid calculator inputs'; schedule(); return;
    }
    const changed = p && (p.fd !== next.fd || p.zeta !== next.zeta);
    p = { ...next, fn: next.fn ?? next.fd / Math.sqrt(1 - next.zeta ** 2) };
    scale = timeScale(p.fd); if (changed || !wasValid) release(.3); schedule();
  }
  function fallback(reason) {
    rig?.dispose(); rig = null;
    canvas.hidden = true;
    if (!canvas2d) { canvas2d = document.createElement('canvas'); canvas2d.className = 'sim-fallback'; canvas2d.setAttribute('aria-label', '2D spring and mass free decay'); stage.prepend(canvas2d); ctx = canvas2d.getContext('2d'); }
    mode.textContent = '2D view';
    container.querySelector('.sim-hint').textContent = `${reason}. Use Bounce it for the 2D motion.`;
    container.dataset.renderer = '2d'; ready = false; resize();
    onReady({ renderer: '2d', reason }); schedule();
  }
  function draw2D() {
    const d = Math.min(devicePixelRatio || 1, 2); ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.fillStyle = '#101e2a'; ctx.fillRect(0, 0, width, height);
    const cx = width / 2, y = height * .62 + x * height * .19, top = 34;
    ctx.strokeStyle = '#b9cfdd'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, top);
    for (let i = 0; i <= 72; i++) ctx.lineTo(cx + Math.sin(i / 72 * Math.PI * 18) * 19, top + (y - 28 - top) * i / 72);
    ctx.stroke(); ctx.fillStyle = '#10b9ac'; ctx.fillRect(cx - 46, y - 28, 92, 52);
    ctx.fillStyle = '#526b7b'; ctx.fillRect(cx - 90, top - 8, 180, 8); ctx.fillRect(cx - 90, height - 28, 180, 8);
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
    if (valid && !dragging) {
      time += dt / scale; x = freeDecay(time, x0, 0, p.fn, p.zeta).x;
      // Positive displacement peaks only, excluding the initial condition at t=0.
      const count = x0 > 0 ? Math.floor(time * p.fd + 1e-9) : x0 < 0 ? Math.max(0, Math.floor(time * p.fd + .5 + 1e-9)) : 0;
      if (count > peaks) { peaks = count; flash = 1; onPeak(peaks); }
    }
    flash = Math.max(0, flash - dt * 3);
    if (valid) hud.textContent = `${timeLabel(scale)}  ·  peaks ${peaks}  ·  ζ ${p.zeta.toFixed(4)}`;
    try {
      if (rig) {
        rig.draw(x, age, flash);
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
  const api = {
    update, release,
    setActive(active) { hostActive = !!active; if (hostActive) schedule(); else pause(); },
    snapshot: () => ({ renderer: container.dataset.renderer, disposed, frames, active: !!raf, visible, hostActive, time, x, x0, peaks, params: p, scale, dragging, ...rig?.snapshot() }),
    dispose() { if (disposed) return; disposed = true; pause(); observer.disconnect(); ro.disconnect(); document.removeEventListener('visibilitychange', visibility); button.removeEventListener('click', bounce); rig?.dispose(); rig = null; container.replaceChildren(); delete container.__sim; }
  };
  container.__sim = api; update(params);
  try {
    if (!webglOK()) fallback('3D is unavailable on this device');
    else {
      const { createRig } = await import('./rig.js');
      if (!container.isConnected) { api.dispose(); return api; }
      rig = createRig(canvas, { reducedMotion, onFailure: fallback,
        onPull(f) { if (disposed || !valid) return; dragging = true; x = x0 = f * 1.65; time = 0; peaks = 0; }, onRelease: () => release(x / 1.65) });
      resize(); schedule();
    }
  } catch (error) { fallback('3D could not start'); }
  return api;
}
