"""Checks for the dlf_pulse scene (sdofRig drive 'pulse'), also called by smoke.py.

The pass criterion for motion is the mass MESH position in the ground frame (window.__simState().massY, read from the
three.js object), with the camera held still by Reduce Motion. Camera movement alone cannot satisfy it.
Run alone (from tests/): python3 sim_pulse_smoke.py [screenshot path]
"""
import math, sys
BASE = 'http://localhost:8765/'
ROUTE = 'dlf_pulse'
VIEW = {'width': 390, 'height': 844}
LEAD = .4                 # seconds of playback at rest between the button and the hit (docs/sim/index.js)
ARROW = .8                # scene units of arrow per unit F/F0 (docs/sim/rig.js)
# One snapshot per animation frame for `ms` milliseconds, taken inside the page so no frame is skipped by test round trips.
# Each snapshot is taken in an animation-frame callback registered after the scene's own, so the meshes it reads were posed
# by that same frame (state variables reset at once on a button press; meshes follow on the next drawn frame).
SAMPLE = """(ms) => new Promise(done => { const out = [], t0 = performance.now(); const tick = () => { const s = window.__simState();
  out.push({ time: s.time, t: s.pulse ? s.pulse.t : -1, x: s.x, force: s.force, arrow: s.arrow, massY: s.massY, unit: s.unit, max: s.pulse ? s.pulse.max : 0,
    at: s.pulse ? s.pulse.at : 0, latched: !!(s.pulse && s.pulse.latched), tag: s.pulse ? s.pulse.tag : '', peakY: s.peakY, ghostY: s.ghostY, running: s.running, camera: s.camera.join() });
  performance.now() - t0 < ms ? requestAnimationFrame(tick) : done(out); }; requestAnimationFrame(tick); })"""
# The pure drive from calcs.js evaluated at the scene's own clock: [x, mesh position at the labeled scale, force, arrow length].
CLOSED = "import('./calcs.js').then(m => { const s = window.__simState(); const o = m.pulseResponse(s.pulse.t, s.pulse.kind, s.params.tdOverT, s.params.zeta); return [s.x - o.x, s.massY - s.unit * s.x, s.force - o.F, s.time < 0 ? 0 : s.pulse.t - s.time * s.params.fn]; })"
PEAK = "([kind, q, z]) => import('./calcs.js').then(m => m.pulsePeak(kind, q, z))"
# Gauge pixels that are not transparent / not the panel background.
GAUGE = "(() => { const c = document.querySelector('canvas.sim-gauge'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] && d[i] + d[i + 1] + d[i + 2] > 330) n++; return n; })()"
DEMO = "(() => { const c = document.querySelector('canvas.demo'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; })()"


def run_pulse_checks(p, shot=None):
    errors = []
    b = p.chromium.launch()
    pg = b.new_page(viewport=VIEW, reduced_motion='reduce')
    pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    pg.on('pageerror', lambda e: errors.append(str(e)))
    state = lambda: pg.evaluate('window.__simState()')
    field = lambda label: pg.locator(f'.row:has-text("{label}") input')
    hud = lambda: pg.locator('.sim-hud').inner_text()
    outs = lambda: [o.inner_text() for o in pg.locator('.out:not([hidden]) output').all()]
    sample = lambda ms: pg.evaluate(SAMPLE, ms)
    show = lambda: pg.locator('.sim-panel').scroll_into_view_if_needed()
    # The HUD of a valid scene is rewritten on the next drawn frame, so wait for it instead of reading it at once.
    hud_shows = lambda text: pg.wait_for_function("t => document.querySelector('.sim-hud').innerText.includes(t)", arg=text, timeout=3000)

    def open_sim(query=''):
        pg.goto(f'{BASE}#/{ROUTE}{query}'); pg.reload()
        pg.wait_for_selector('.sim-panel'); show()
        pg.wait_for_function("document.querySelector('.sim-panel')?.dataset.renderer === 'webgl'")
        pg.wait_for_function('window.__simState().frames > 2')

    def at_rest(s, why):
        # Before the hit: the clock sits at the start of the lead-in, nothing is displaced, no peak line.
        assert abs(s['time'] + LEAD / s['scale']) < 1e-12 and s['x'] == 0 and s['force'] == 0, (why, s)
        assert abs(s['massY']) < 1e-12 and abs(s['baseY']) < 1e-12 and s['peakY'] == 0, (why, s)
        assert s['pulse']['max'] == 0 and not s['pulse']['latched'] and s['pulse']['tag'] == 'at rest', (why, s)

    def hit(ms):
        """Press the button and follow the scene frame by frame. Returns (samples, state after)."""
        show(); pg.locator('#sim-release').click()
        rows = sample(ms); return rows, state()

    def check_run(rows, s, kind, why):
        """One replay from rest against the exact result for the scene's own parameters."""
        q = s['params']; peak = pg.evaluate(PEAK, [kind, q['tdOverT'], q['zeta']]); unit = s['unit']
        assert len(rows) >= 12, (why, len(rows))
        lead = [r for r in rows if r['time'] < 0]; live = [r for r in rows if r['time'] >= 0]
        assert lead and live, (why, len(lead), len(live))
        # Replays from rest: during the lead-in nothing moves and no force is drawn.
        assert all(r['x'] == 0 and r['force'] == 0 and abs(r['massY']) < 1e-12 and abs(r['arrow']) < 2e-4 and r['peakY'] == 0 for r in lead), (why, lead[:3])
        # Mass mesh = the labeled scale times the normalized response, in every frame; camera still.
        assert all(abs(r['massY'] - unit * r['x']) < 1e-9 for r in rows), why
        assert len({r['camera'] for r in rows}) == 1, f'{why}: camera moved; mass motion must be judged with a still camera'
        span = max(r['massY'] for r in rows) - min(r['massY'] for r in rows)
        assert span > .02, f'{why}: mass did not move after the button: {span}'
        # Force arrow: its length follows F(t).
        assert all(abs(r['arrow'] - ARROW * r['force']) < 2e-4 for r in rows), (why, [(r['arrow'], r['force']) for r in rows[:5]])
        assert max(r['force'] for r in live) > .9 and all(-1e-12 <= r['force'] <= 1 + 1e-12 for r in rows), why
        td = q['tdOverT']; on = [r for r in live if 0 < r['t'] < td]; after = [r for r in live if r['t'] >= td]
        assert on and after, (why, len(on), len(after))
        if kind == 'rect': assert all(r['force'] == 1 for r in on) and all(r['force'] == 0 for r in after), why
        if kind == 'halfsine':
            assert all(abs(r['force'] - math.sin(math.pi * r['t'] / td)) < 1e-9 for r in on) and all(r['force'] == 0 for r in after), why
            assert len({round(r['arrow'], 2) for r in on}) >= 3, f'{why}: arrow length did not swell and shrink'
        if kind == 'ramp': assert all(abs(r['force'] - r['t'] / td) < 1e-9 for r in on) and all(r['force'] == 1 for r in after), why
        # Ghost marker: the static deflection, x = 1 normalized, fixed.
        assert all(abs(r['ghostY'] - unit) < 1e-9 for r in rows), (why, rows[0]['ghostY'], unit)
        # Peak marker: follows the largest x so far, then latches on the exact peak and stays there while the mass moves on.
        best = 0
        for r in live:
            if r['latched']: break
            best = max(best, r['x'])
            assert abs(r['max'] - best) < 1e-12 and abs(r['peakY'] - (unit * best if unit * best > 1e-4 else 0)) < 1e-9, (why, r, best)
        held = [r for r in live if r['latched']]
        assert held, f'{why}: the peak never latched'
        assert all(r['t'] >= peak['t_peak_over_T'] for r in held) and all(not r['latched'] for r in live if r['t'] < peak['t_peak_over_T']), why
        assert all(r['max'] == peak['DLF'] and abs(r['at'] - peak['t_peak_over_T']) < 1e-12 and abs(r['peakY'] - unit * peak['DLF']) < 1e-9 for r in held), (why, held[0], peak)
        assert all(r['massY'] <= unit * peak['DLF'] + 1e-9 for r in rows), f'{why}: mass passed the exact peak'
        # The mass itself gets to the peak, as closely as the frame spacing allows: a frame lands within half the largest
        # frame step g (in periods) of the peak time, and |x''| ≤ (2π)²·(DLF + 1), so x there is within ½·(2π)²·(DLF + 1)·(g/2)².
        # Headless software GL can drop to ~10 frames/s (g = 0.15 T, the scene's 0.1 s step clamp); at 60 frames/s the slack is 0.01.
        g = max(b['t'] - a['t'] for a, b in zip(live, live[1:]))
        assert g <= .15 + 1e-9, f'{why}: frame step {g} T is above the 0.1 s clamp at 1.5 Hz playback'
        slack = .02 + .5 * (2 * math.pi) ** 2 * (peak['DLF'] + 1) * (g / 2) ** 2
        assert max(r['x'] for r in live) > peak['DLF'] - slack, f"{why}: mass never came near the peak: {max(r['x'] for r in live)} vs {peak['DLF']} (frame step {g} T)"
        assert min(r['massY'] for r in held[len(held) // 2:]) < unit * peak['DLF'] - .02, f'{why}: the mass did not leave the latched peak line'
        tag = 'primary' if peak['t_peak_over_T'] < td else 'residual'
        assert peak['phase'] == tag and all(r['tag'] == tag for r in held), (why, tag, held[0]['tag'])
        assert s['pulse']['latched']; hud_shows(f"DLF live max {peak['DLF']:.2f} · {tag} · peak latched")
        # The rig fits: labeled scale keeps the peak inside the travel (0.6 scene units).
        assert unit * max(1, peak['DLF']) <= .6 + 1e-9, (why, unit, peak)
        return peak

    pg.goto(BASE); pg.evaluate("localStorage.setItem('unitSystem','si')")
    open_sim()
    s = state()
    assert s['drive'] == 'pulse' and s['renderer'] == 'webgl', s
    assert s['pixelRange'] >= 12, 'canvas.sim is blank'
    assert s['vertices'] <= 3000, s['vertices']
    assert pg.evaluate("(() => { const c = document.querySelector('canvas.sim'); return c.width > 0 && c.height > 0; })()")
    # Reduce Motion: nothing moves until the person asks for it.
    assert not s['running']; at_rest(s, 'first load')
    pg.wait_for_timeout(250); assert state()['time'] == s['time'] and abs(state()['massY']) < 1e-12
    # Page defaults (SI): rectangular, td 0.08 s, fn 10 Hz, ζ 0 → td/T 0.8. Time-scale rule: fn plays at 1.5 Hz → slow-mo ×6.7.
    q = s['params']
    assert q == {'pulse': 0, 'tdOverT': q['tdOverT'], 'zeta': 0, 'fn': 10} and abs(q['tdOverT'] - .8) < 1e-12, q
    assert abs(s['scale'] - 10 / 1.5) < 1e-9, s['scale']
    for text in ['rectangular pulse', 'td/T 0.80', 'slow-mo ×6.7', 'DLF live max 0.00', 'at rest', 'displacement normalized (×1/x_static)']: assert text in hud(), (text, hud())
    assert 'latched' not in hud()
    assert pg.locator('#sim-release').inner_text().strip().endswith('Hit it'), pg.locator('#sim-release').inner_text()
    assert pg.locator('canvas.sim-gauge').is_visible() and pg.evaluate(GAUGE) > 150, 'gauge is blank'
    assert not pg.locator('canvas.sim-trace').is_visible()
    # Calculator on the page, SI: [T s, td/T, DLF, x_static mm, x_max mm, t_peak s, F_eq N]. Hand: 100 N / 10 N/mm = 10 mm, DLF 2 → 20 mm, 200 N, at T/2.
    assert outs() == ['0.1', '0.8', '2', '10', '20', '0.05', '200'], outs()
    assert 'Primary peak' in pg.locator('main').inner_text()
    # Static deflection outline sits at x = 1 on the labeled scale; DLF 2 uses the whole travel.
    assert abs(s['unit'] - .3) < 1e-9 and abs(s['ghostY'] - s['unit']) < 1e-9, s

    # Hit it: the mass mesh itself must move while the camera does not, and everything drawn is the tested closed form.
    rows, s = hit(2600)
    assert s['running'] and s['time'] > 0
    peak = check_run(rows, s, 'rect', 'rect default')
    assert abs(peak['DLF'] - 2) < 1e-12 and abs(peak['t_peak_over_T'] - .5) < 1e-12 and float(outs()[2]) == 2
    for _ in range(5):
        diff = pg.evaluate(CLOSED); assert all(abs(d) < 1e-9 for d in diff), diff
        pg.wait_for_timeout(60)
    # Playback clock: 0.6 s of wall time is 0.6 s of playback, i.e. 0.6/6.67 s of physical time (not 0.6 s). Loose bounds:
    # a renderer slower than 10 frames/s loses time to the scene's 0.1 s frame-step clamp, and the two reads are not instant.
    a = state(); pg.wait_for_timeout(600); z = state()
    assert .2 < (z['time'] - a['time']) * z['scale'] < .9, (a['time'], z['time'], z['scale'])
    # A second press replays from rest: clock back in the lead-in, peak line cleared.
    pg.locator('#sim-release').click(); s = state()
    assert s['running'] and s['time'] < 0 and s['x'] == 0 and (s['pulse'] is None or s['pulse']['max'] == 0), s
    lead = [r for r in sample(250) if r['time'] < 0]
    assert lead and all(abs(r['massY']) < 1e-12 and r['peakY'] == 0 and r['max'] == 0 for r in lead), lead[:3]
    pg.wait_for_function('window.__simState().time > 0')

    # Half-sine (mode button): restarts from rest, DLF below 2, primary peak for td/T 0.8.
    pg.locator('.modes button', has_text='Half-sine').click(); show()
    s = state(); assert s['params']['pulse'] == 1 and s['time'] <= 0 and s['x'] == 0, s
    hud_shows('half-sine pulse')
    rows, s = hit(2600); peak = check_run(rows, s, 'halfsine', 'half-sine td/T 0.8')
    assert abs(peak['DLF'] - float(outs()[2])) < 6e-4 * peak['DLF'] and 1.7 < peak['DLF'] < 1.78, (peak, outs())
    # Half-sine with td = T: DLF = √3 = 1.732 on the page and in the scene.
    field('Pulse duration').fill('0.1'); show()
    assert outs()[1:3] == ['1', '1.732'], outs()
    rows, s = hit(2800); peak = check_run(rows, s, 'halfsine', 'half-sine td = T')
    assert abs(peak['DLF'] - math.sqrt(3)) < 1e-12
    field('Pulse duration').fill('0.08')
    # Ramp held at F0: the peak comes after the rise (residual), DLF = 1 + sin(0.8π)/(0.8π) = 1.2339, and the mass then
    # rings about the static deflection, never returning to rest (ζ = 0).
    pg.locator('.modes button', has_text='Ramp').click(); show()
    assert state()['params']['pulse'] == 2; hud_shows('ramp (held) pulse')
    rows, s = hit(3000); peak = check_run(rows, s, 'ramp', 'ramp td/T 0.8')
    hand = 1 + math.sin(.8 * math.pi) / (.8 * math.pi)
    assert abs(peak['DLF'] - hand) < 1e-12 and outs()[2] == f'{hand:.4g}' and peak['phase'] == 'residual', (peak, outs())
    assert 'Residual peak' in pg.locator('main').inner_text()
    late = [r['x'] for r in rows if r['t'] > 1.3]
    assert late and min(late) > 2 - hand - 1e-9 and max(late) <= hand + 1e-9, (min(late), max(late))
    # Short rectangular pulse with damping: residual peak, DLF well below 2 (impulse-like), and the ring-down decays.
    pg.locator('.modes button', has_text='Rectangular').click()
    field('Pulse duration').fill('0.02'); field('Damping ratio').fill('0.1'); show()
    rows, s = hit(3200); peak = check_run(rows, s, 'rect', 'rect td/T 0.2 ζ 0.1')
    assert peak['phase'] == 'residual' and abs(peak['DLF'] - float(outs()[2])) < 6e-4 and peak['DLF'] < 2 * math.sin(.2 * math.pi), (peak, outs())
    assert 'Residual peak' in pg.locator('main').inner_text()

    # Changed calculator inputs reach the scene and restart it from rest (still running: the hit replays after the lead-in).
    pg.wait_for_function('window.__simState().time > .02')
    field('Pulse duration').fill('0.12')
    s = state(); assert abs(s['params']['tdOverT'] - 1.2) < 1e-12 and s['time'] < .02 and abs(s['x']) < .05 and s['running'], s
    assert s['pulse'] is None or (s['pulse']['max'] < .05 and not s['pulse']['latched']), s
    hud_shows('td/T 1.20')
    # Invalid inputs (ζ = 1 is not underdamped) pause the physics but keep the scene drawn.
    field('Damping ratio').fill('1')
    assert pg.locator('#sim-release').is_disabled()
    assert hud() == 'Enter valid calculator inputs'
    assert pg.locator('.error').inner_text().strip(), 'the page must say what is wrong'
    show()
    frozen = state(); pg.wait_for_function('n => window.__simState().frames > n + 3', arg=frozen['frames'])
    s = state(); assert s['time'] == 0 and abs(s['massY']) < 1e-12 and abs(s['baseY']) < 1e-12 and s['pixelRange'] >= 12 and s['peakY'] == 0, s
    assert pg.locator('canvas.sim').is_visible() and not pg.locator('canvas.sim-gauge').is_visible()
    pg.locator('#sim-release').click(force=True); pg.wait_for_timeout(150)
    assert state()['time'] == 0 and abs(state()['massY']) < 1e-12, 'a disabled button must not start the hit'
    field('Damping ratio').fill('0.1')
    assert not pg.locator('#sim-release').is_disabled()
    pg.locator('canvas.sim-gauge').wait_for(state='visible', timeout=2000)   # redrawn on the next frame
    rows, s = hit(3200); check_run(rows, s, 'rect', 'after restoring valid input')
    # A half-sine longer than the supported td/T (2000 periods) is refused: error on the page, scene paused, never a made-up DLF.
    pg.locator('.modes button', has_text='Half-sine').click(); field('Pulse duration').fill('201')
    assert 'not supported' in pg.locator('.error').inner_text() and pg.locator('#sim-release').is_disabled() and hud() == 'Enter valid calculator inputs', hud()
    field('Pulse duration').fill('0.08'); pg.locator('.modes button', has_text='Rectangular').click(); field('Damping ratio').fill('0')
    assert not pg.locator('#sim-release').is_disabled() and outs() == ['0.1', '0.8', '2', '10', '20', '0.05', '200'], outs()
    show(); pg.locator('#sim-release').click(); pg.wait_for_function('window.__simState().time > .02')

    # Offscreen pauses frames and the physical clock.
    pg.evaluate('window.scrollTo(0,0)'); pg.wait_for_timeout(150)
    paused = state(); assert not paused['visible'] and not paused['active'], paused
    pg.wait_for_timeout(200); assert state()['frames'] == paused['frames'] and state()['time'] == paused['time']
    show()
    pg.wait_for_function('n => window.__simState().frames > n', arg=paused['frames'])

    # Five away/back navigations: each old scene is disposed and stops, the hook follows the live scene, no console errors.
    pg.evaluate('window.oldSims=[]')
    for _ in range(5):
        pg.evaluate("oldSims.push(document.querySelector('.sim-panel').__sim); location.hash='#/beam'")
        pg.wait_for_function("!document.querySelector('.sim-panel')")
        assert pg.evaluate('oldSims.every(s => s.snapshot().disposed && !s.snapshot().active)')
        assert pg.evaluate("typeof window.__simState") == 'undefined'
        pg.evaluate(f"location.hash='#/{ROUTE}'")
        pg.wait_for_selector('.sim-panel'); show()
        pg.wait_for_function("document.querySelector('.sim-panel')?.dataset.renderer === 'webgl'")
        pg.locator('#sim-release').click(); pg.wait_for_function('window.__simState().time > .02')
        assert abs(state()['massY']) > 1e-6, 'mass still at rest after the hit on a returning scene'
    counts = pg.evaluate('oldSims.map(s => s.snapshot().frames)'); pg.wait_for_timeout(300)
    assert pg.evaluate('oldSims.map(s => s.snapshot().frames)') == counts
    assert not errors, errors

    # Invalid inputs on arrival (share link with ζ = 1): scene drawn, paused, button disabled; fixing the input enables it.
    open_sim('?td=0.08~s&fn=10~Hz&zeta=1&F0=100~N&k=10~N%2Fmm')
    s = state(); assert s['pixelRange'] >= 12 and s['time'] == 0 and not s['running'] and pg.locator('#sim-release').is_disabled() and hud() == 'Enter valid calculator inputs', (s, hud())
    field('Damping ratio').fill('0.05'); assert not pg.locator('#sim-release').is_disabled()
    rows, s = hit(2600); check_run(rows, s, 'rect', 'after an invalid arrival')

    # Screenshot ~1.5 s after release, from rest, page defaults.
    open_sim('?td=0.08~s&fn=10~Hz&zeta=0&F0=100~N&k=10~N%2Fmm'); pg.locator('#sim-release').click(); pg.wait_for_timeout(1500)
    pg.screenshot(path=f'screenshots/{ROUTE}-sim.png')
    if shot: pg.screenshot(path=shot)
    hud_shows('DLF live max 2.00 · primary · peak latched'); s = state(); assert s['pulse']['latched'] and s['pulse']['max'] == 2, s['pulse']
    assert not errors, errors
    b.close()

    # Without Reduce Motion the hit plays on its own once the rig is on screen. It is one hit, not a loop: the clock keeps running.
    b = p.chromium.launch(); pg = b.new_page(viewport=VIEW, reduced_motion='no-preference')
    pg.on('console', lambda m: m.type == 'error' and errors.append(m.text)); pg.on('pageerror', lambda e: errors.append(str(e)))
    open_sim(); assert state()['running']
    pg.wait_for_function('window.__simState().pulse && window.__simState().pulse.latched', timeout=8000)
    s = state(); assert s['pulse']['max'] == 2 and abs(s['peakY'] - 2 * s['unit']) < 1e-9, s
    seen = []
    for _ in range(30): seen.append(state()['massY']); pg.wait_for_timeout(50)
    assert max(seen) - min(seen) > .02, f'mass did not start on its own: {seen}'
    t0 = state()['time']; pg.wait_for_timeout(1200); assert state()['time'] > t0 and state()['pulse']['latched'], 'the hit restarted on its own'
    assert not errors, errors
    b.close()

    # No WebGL: labeled 2D rig animates the same motion, the gauge and the 2D demo chart are still drawn.
    b = p.chromium.launch(args=['--disable-webgl', '--disable-3d-apis'])
    pg = b.new_page(viewport=VIEW, reduced_motion='reduce')
    pg.on('console', lambda m: m.type == 'error' and errors.append(m.text)); pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(f'{BASE}#/{ROUTE}'); pg.wait_for_selector('.sim-panel'); show()
    pg.wait_for_function("document.querySelector('.sim-panel').dataset.renderer === '2d'")
    assert '3D is unavailable' in pg.locator('.sim-hint').inner_text()
    pg.wait_for_timeout(100)
    drawn = pg.evaluate(DEMO)
    assert drawn > 1000, f'2D demo chart blank without WebGL: {drawn}'
    assert pg.locator('canvas.demo').is_visible()
    for text in ['rectangular pulse', 'td/T 0.80', 'slow-mo ×6.7', 'DLF live max 0.00', 'at rest', 'displacement normalized (×1/x_static)']: assert text in hud(), (text, hud())
    assert pg.locator('canvas.sim-gauge').is_visible() and pg.evaluate(GAUGE) > 150, 'gauge blank without WebGL'
    s = state(); assert not s['running'] and s['x'] == 0 and abs(s['massY']) < 1e-12, s
    pg.locator('#sim-release').click(); pg.wait_for_timeout(100)
    a = pg.locator('canvas.sim-fallback').screenshot()
    seen = []
    for _ in range(40): seen.append(state()['massY']); pg.wait_for_timeout(60)
    assert max(seen) - min(seen) > .02, f'2D mass state did not move: {seen}'
    assert pg.locator('canvas.sim-fallback').screenshot() != a, '2D rig pixels did not change'
    diff = pg.evaluate(CLOSED); assert all(abs(d) < 1e-9 for d in diff), diff
    hud_shows('DLF live max 2.00 · primary · peak latched'); s = state(); assert s['pulse']['latched'] and s['pulse']['max'] == 2, s['pulse']
    pg.screenshot(path=f'screenshots/{ROUTE}-no-webgl.png')
    assert not errors, errors
    b.close()
    print(f'PASS {ROUTE} (pulse): WebGL pixels, Reduce Motion rest, HUD + gauge, mass mesh moves with still camera, lead-in at rest, arrow length = F(t) for all three shapes, '
          'closed-form match every frame, static-deflection outline at x = 1, peak line follows then latches on the exact DLF, primary/residual tag, HUD DLF = calculator, '
          'time scale, input restart, invalid pause (ζ = 1, td/T > 2000, invalid arrival), offscreen pause, 5 route disposals, auto-start once, no-WebGL 2D + gauge + demo', flush=True)


if __name__ == '__main__':
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p: run_pulse_checks(p, *sys.argv[1:])
