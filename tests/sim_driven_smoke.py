"""Driven-rig checks (force-driven and base-driven sdofRig), also called by the full smoke.py suite.

The pass criterion for motion is the mass MESH position in the ground frame (window.__simState().massY, read from the
three.js object), with the camera held still by Reduce Motion. Camera movement alone cannot satisfy it.
Run alone: python3 sim_driven_smoke.py forced_daf forced   (or: transmissibility base)
"""
import math, sys
BASE = 'http://localhost:8765/'
VIEW = {'width': 390, 'height': 844}
HUD = {'forced': ['r ', 'DAF ', 'lag φ ', 'slow-mo ×', 'displacement normalized (×1/x_static, visual scale)'],
       'base': ['r ', 'TR ', 'phase ', 'slow-mo ×', 'motion normalized (×1/Y)']}
CLOSED = {  # the pure drive from calcs.js evaluated at the scene's own clock
    'forced': "import('./calcs.js').then(m => { const s = window.__simState(); const o = m.forcedResponse(s.time, s.params.fn, s.params.zeta, s.params.f); return [s.x - o.x, s.massY - s.unit * s.x, 0, 0]; })",
    'base': "import('./calcs.js').then(m => { const s = window.__simState(); const o = m.baseResponse(s.time, s.params.fn, s.params.zeta, s.params.f); return [s.x - o.x, s.massY - s.unit * s.x, s.y - o.y, s.baseY - s.unit * s.y]; })",
}


def run_driven_checks(p, route, drive, shot=None):
    errors = []
    b = p.chromium.launch()
    pg = b.new_page(viewport=VIEW, reduced_motion='reduce')
    pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    pg.on('pageerror', lambda e: errors.append(str(e)))
    state = lambda: pg.evaluate('window.__simState()')
    field = lambda label: pg.locator(f'.row:has-text("{label}") input')

    def open_sim(query=''):
        pg.goto(f'{BASE}#/{route}{query}'); pg.reload()
        pg.wait_for_selector('.sim-panel'); pg.locator('.sim-panel').scroll_into_view_if_needed()
        pg.wait_for_function("document.querySelector('.sim-panel')?.dataset.renderer === 'webgl'")
        pg.wait_for_function('window.__simState().frames > 2')

    def travel(key, ms=900, n=18):
        seen = []
        for _ in range(n): seen.append(state()[key]); pg.wait_for_timeout(ms // n)
        return max(seen) - min(seen), seen

    pg.goto(BASE); pg.evaluate("localStorage.setItem('unitSystem','si')")
    open_sim()
    s = state()
    assert s['drive'] == drive and s['renderer'] == 'webgl', s
    assert s['pixelRange'] >= 12, 'canvas.sim is blank'
    assert s['vertices'] <= 3000, s['vertices']
    assert pg.evaluate("(() => { const c = document.querySelector('canvas.sim'); return c.width > 0 && c.height > 0; })()")
    # Reduce Motion: nothing moves until the person asks for it.
    assert not s['running'] and s['time'] == 0 and abs(s['massY']) < 1e-12 and abs(s['baseY']) < 1e-12, s
    pg.wait_for_timeout(250); assert state()['time'] == 0 and abs(state()['massY']) < 1e-12
    for text in HUD[drive]: assert text in pg.locator('.sim-hud').inner_text(), (text, pg.locator('.sim-hud').inner_text())
    assert pg.locator('#sim-release').inner_text().strip().endswith('Shake it'), pg.locator('#sim-release').inner_text()
    assert pg.locator('canvas.sim-gauge').is_visible()

    # Press the release button: the mass mesh itself must move while the camera does not.
    camera = state()['camera']
    pg.locator('#sim-release').click()
    span, seen = travel('massY')
    assert state()['running'] and state()['time'] > 0
    assert span > .02, f'mass did not move after release: {seen}'
    assert state()['camera'] == camera, 'camera moved; mass motion must be judged with a still camera'
    if drive == 'base':
        base_span, base_seen = travel('baseY')
        assert base_span > .02, f'base plate did not move: {base_seen}'
        assert any(abs(a - b) > 1e-3 for a, b in zip(seen, base_seen)), 'mass and base moved as one body'
    else:
        arrows = travel('arrow')[1]
        assert min(arrows) < 0 < max(arrows), f'force arrow did not reverse: {arrows}'
    # What is drawn is the tested closed form at the scene clock, at the labeled visual scale.
    for _ in range(5):
        diff = pg.evaluate(CLOSED[drive]); assert all(abs(d) < 1e-9 for d in diff), diff
        pg.wait_for_timeout(60)

    # The HUD numbers are the calculator's numbers.
    outs = [o.inner_text() for o in pg.locator('.out:not([hidden]) output').all()]
    s = state(); hud = pg.locator('.sim-hud').inner_text()
    if drive == 'forced':
        # defaults: fn = f = 10 Hz, ζ = 0.05 → r = 1, DAF = 1/(2ζ) = 10, lag 90°
        assert outs[:3] == ['1', '10', '90'], outs
        assert abs(s['gain'] - 10) < 1e-9 and abs(s['phase'] - 90) < 1e-9, s
        assert 'DAF 10' in hud and 'lag φ 90' in hud, hud
        # r = 1 builds up from rest: each cycle's peak is larger than the last for the first few cycles.
        pg.locator('#sim-release').click()
        pg.wait_for_function('window.__simState().peaks >= 4', timeout=15000)
        # Hand: at whole cycles |x| ≈ (1/2ζ)(1 − e^(−2πζn)) = 2.70, 4.67, 6.10, 7.15 for n = 1..4.
        peaks = pg.evaluate("import('./calcs.js').then(m => [1, 2, 3, 4].map(n => Math.abs(m.forcedResponse(n / 10, 10, .05, 10).x)))")
        assert all(abs(got - 10 * (1 - math.exp(-.1 * math.pi * n))) < .02 for n, got in zip([1, 2, 3, 4], peaks)), peaks
        assert peaks[0] < peaks[1] < peaks[2] < peaks[3] < 10, peaks
        # The drawn mass reaches further in its 4th cycle than it could in its 1st (travel > 2 × 2.70 × unit).
        assert travel('massY', 700, 28)[0] > 2 * 2.8 * state()['unit'], 'no visible build-up at resonance'
        # r ≫ 1: the mass barely moves and opposes the arrow. ζ = 0.5 so the start-up ringing at fn (amplitude ≈ 1/r, ten times
        # the steady 1/r²) is gone within the test: e^(−ζωn·t) = e^(−π·2) = 0.002 at t = 2 s. Lag = atan2(10, −99) = 174.2°.
        open_sim('?fn=1~Hz&zeta=0.5&f=10~Hz&F0=100~N&k=10~N%2Fmm')
        s = state(); assert abs(s['gain'] - 1 / math.hypot(99, 10)) < 1e-9 and s['phase'] > 174, s
        pg.locator('#sim-release').click(); pg.wait_for_function('window.__simState().time > 2', timeout=40000)
        opposed = 0
        for _ in range(20):
            s = state(); opposed += s['x'] * s['force'] < 0; pg.wait_for_timeout(45)
        assert opposed >= 15, f'mass not out of phase with the force at r = 10: {opposed}/20'
        open_sim()
    else:
        # defaults: fn = 10 Hz, f = 20 Hz, ζ = 0.05 → r = 2 > √2: isolation, TR = √(1 + 0.2²)/√(3² + 0.2²) = 0.3392
        tr = math.hypot(1, .2) / math.hypot(3, .2)
        assert abs(s['gain'] - tr) < 1e-9 and s['gain'] < 1, s
        assert outs[0] == '2' and outs[1] == f'{tr:.4f}', outs
        assert 'TR 0.34' in hud, hud
        # r = 0.5 < √2: the mass moves more than the base, and the change restarts the rig from rest.
        field('Forcing frequency').fill('5')
        s = state(); assert s['params']['f'] == 5 and s['time'] < .1, s
        assert abs(s['gain'] - math.hypot(1, .05) / math.hypot(.75, .05)) < 1e-9 and s['gain'] > 1, s
        # r = √2: equal amplitudes for any damping.
        field('Forcing frequency').fill(str(10 * math.sqrt(2)))
        assert abs(state()['gain'] - 1) < 1e-9
        field('Damping').fill('0.4'); assert abs(state()['gain'] - 1) < 1e-9
        field('Damping').fill('0.05'); field('Forcing frequency').fill('20')

    # Changed calculator inputs reach the scene and restart it from rest.
    pg.locator('.sim-panel').scroll_into_view_if_needed(); pg.locator('#sim-release').click(); pg.wait_for_function('window.__simState().time > .05')
    field('Natural frequency').fill('8')
    s = state(); assert s['params']['fn'] == 8 and s['time'] < .05 and abs(s['x']) < .2, s
    # Invalid inputs pause the physics but keep the scene drawn.
    field('Natural frequency').fill('-1')
    assert pg.locator('#sim-release').is_disabled()
    assert pg.locator('.sim-hud').inner_text() == 'Enter valid calculator inputs'
    pg.locator('.sim-panel').scroll_into_view_if_needed()
    frozen = state(); pg.wait_for_function('n => window.__simState().frames > n + 3', arg=frozen['frames'])
    s = state(); assert s['time'] == 0 and abs(s['massY']) < 1e-12 and abs(s['baseY']) < 1e-12 and s['pixelRange'] >= 12, s
    field('Natural frequency').fill('10')
    assert not pg.locator('#sim-release').is_disabled()
    pg.locator('.sim-panel').scroll_into_view_if_needed(); pg.locator('#sim-release').click()
    assert travel('massY')[0] > .02, 'mass did not move after restoring valid input'

    # Offscreen pauses frames and the physical clock.
    pg.evaluate('window.scrollTo(0,0)'); pg.wait_for_timeout(150)
    paused = state(); assert not paused['visible'] and not paused['active'], paused
    pg.wait_for_timeout(200); assert state()['frames'] == paused['frames'] and state()['time'] == paused['time']
    pg.locator('.sim-panel').scroll_into_view_if_needed()
    pg.wait_for_function('n => window.__simState().frames > n', arg=paused['frames'])

    # Five away/back navigations: each old scene is disposed and stops, the hook follows the live scene, no console errors.
    pg.evaluate('window.oldSims=[]')
    for _ in range(5):
        pg.evaluate("oldSims.push(document.querySelector('.sim-panel').__sim); location.hash='#/beam'")
        pg.wait_for_function("!document.querySelector('.sim-panel')")
        assert pg.evaluate('oldSims.every(s => s.snapshot().disposed && !s.snapshot().active)')
        assert pg.evaluate("typeof window.__simState") == 'undefined'
        pg.evaluate(f"location.hash='#/{route}'")
        pg.wait_for_selector('.sim-panel'); pg.locator('.sim-panel').scroll_into_view_if_needed()
        pg.wait_for_function("document.querySelector('.sim-panel')?.dataset.renderer === 'webgl'")
        pg.locator('#sim-release').click(); pg.wait_for_function('window.__simState().time > .02')
    counts = pg.evaluate('oldSims.map(s => s.snapshot().frames)'); pg.wait_for_timeout(300)
    assert pg.evaluate('oldSims.map(s => s.snapshot().frames)') == counts
    assert not errors, errors

    # Screenshot ~1.5 s after release, from rest.
    open_sim(); pg.locator('#sim-release').click(); pg.wait_for_timeout(1500)
    pg.screenshot(path=f'screenshots/{route}-sim.png')
    if shot: pg.screenshot(path=shot)
    assert not errors, errors
    b.close()

    # Without Reduce Motion the rig starts shaking on its own once it is on screen.
    b = p.chromium.launch(); pg = b.new_page(viewport=VIEW, reduced_motion='no-preference')
    pg.on('console', lambda m: m.type == 'error' and errors.append(m.text)); pg.on('pageerror', lambda e: errors.append(str(e)))
    open_sim(); assert state()['running']
    assert travel('massY')[0] > .02, 'mass did not start on its own'
    assert not errors, errors
    b.close()

    # No WebGL: labeled 2D rig animates the same motion and the 2D demo chart is still drawn.
    b = p.chromium.launch(args=['--disable-webgl', '--disable-3d-apis'])
    pg = b.new_page(viewport=VIEW, reduced_motion='reduce')
    pg.on('console', lambda m: m.type == 'error' and errors.append(m.text)); pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(f'{BASE}#/{route}'); pg.wait_for_selector('.sim-panel'); pg.locator('.sim-panel').scroll_into_view_if_needed()
    pg.wait_for_function("document.querySelector('.sim-panel').dataset.renderer === '2d'")
    assert '3D is unavailable' in pg.locator('.sim-hint').inner_text()
    pg.wait_for_timeout(100)
    drawn = pg.evaluate("(() => { const c = document.querySelector('canvas.demo'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; })()")
    assert drawn > 1000, f'2D demo chart blank without WebGL: {drawn}'
    assert pg.locator('canvas.demo').is_visible()
    for text in HUD[drive]: assert text in pg.locator('.sim-hud').inner_text()
    pg.locator('#sim-release').click(); pg.wait_for_timeout(100)
    a = pg.locator('canvas.sim-fallback').screenshot()
    assert travel('massY', 400, 8)[0] > .02, '2D mass state did not move'
    if drive == 'base': assert travel('baseY', 400, 8)[0] > .02, '2D base state did not move'
    assert pg.locator('canvas.sim-fallback').screenshot() != a, '2D rig pixels did not change'
    pg.screenshot(path=f'screenshots/{route}-no-webgl.png')
    assert not errors, errors
    b.close()
    print(f'PASS {route} ({drive}): WebGL pixels, Reduce Motion rest, mass mesh moves with still camera'
          + (', base mesh moves, TR above/at/below √2' if drive == 'base' else ', arrow reverses, resonance build-up, r = 10 opposition')
          + ', closed-form match, HUD = calculator, input restart, invalid pause, offscreen pause, 5 route disposals, auto-start, no-WebGL 2D + demo', flush=True)


if __name__ == '__main__':
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p: run_driven_checks(p, sys.argv[1], sys.argv[2], *sys.argv[3:])
