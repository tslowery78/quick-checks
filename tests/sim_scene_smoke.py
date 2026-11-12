"""Checks for the sdofRig scenes that have a trace strip under the rig (halfpower 'sweep'), also called by smoke.py.

The pass criterion for motion is the mass MESH position in the ground frame (window.__simState().massY, read from the
three.js object), with the camera held still by Reduce Motion. Camera movement alone cannot satisfy it.
Run alone (from tests/): python3 sim_scene_smoke.py halfpower sweep
"""
import math, re, sys
BASE = 'http://localhost:8765/'
VIEW = {'width': 390, 'height': 844}
HUD = {'sweep': ['f ', ' Hz', 'r ', 'amplitude ', '(×1/peak)', 'ζ ', 'Q ', 'slow-mo ×', 'quasi-steady sweep: each frequency shown at steady state']}
BUTTON = {'sweep': 'Sweep it'}
CLOSED = {  # the pure drive from calcs.js evaluated at the scene's own clock
    'sweep': "import('./calcs.js').then(m => { const s = window.__simState(); const o = m.sweepState(s.time, s.params.fn, s.params.zeta, s.span); return [s.x - o.x, s.massY - s.unit * s.x, s.force - o.force, s.gain - o.amp]; })",
}
# Pixels of the trace strip that are not its background colour.
TRACE = "(() => { const c = document.querySelector('canvas.sim-trace'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 11) + Math.abs(d[i + 1] - 23) + Math.abs(d[i + 2] - 33) > 40) n++; return n; })()"
BRIGHT = "(() => { const c = document.querySelector('canvas.sim-trace'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 90 && d[i + 1] > 200 && d[i + 2] > 180) n++; return n; })()"


def run_scene_checks(p, route, drive, shot=None):
    errors = []
    b = p.chromium.launch()
    pg = b.new_page(viewport=VIEW, reduced_motion='reduce')
    pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    pg.on('pageerror', lambda e: errors.append(str(e)))
    state = lambda: pg.evaluate('window.__simState()')
    field = lambda label: pg.locator(f'.row:has-text("{label}") input')
    hud = lambda: pg.locator('.sim-hud').inner_text()

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
    for text in HUD[drive]: assert text in hud(), (text, hud())
    assert pg.locator('#sim-release').inner_text().strip().endswith(BUTTON[drive]), pg.locator('#sim-release').inner_text()
    assert pg.locator('canvas.sim-trace').is_visible() and pg.locator('canvas.sim-gauge').count() == 0
    assert pg.evaluate(TRACE) > 400, 'trace strip is blank'
    assert pg.locator('canvas.sim-trace').bounding_box()['width'] <= VIEW['width'], 'trace strip wider than the phone'

    if drive == 'sweep':
        # Time-scale rule: the fastest forcing of the sweep (1.5·fn) plays at 1.5 Hz, and one pass takes 12 s of playback.
        q = s['params']
        assert abs(s['scale'] - q['fn']) < 1e-9 and abs(s['span']['duration'] * s['scale'] - 12) < 1e-9, s
        assert f"slow-mo ×{float(f'{s['scale']:.2g}'):g}" in hud(), hud()
        # The HUD numbers are the calculator's numbers: outputs are [ζ≈, Q, Δf, exact ζ, err %, fn, peak gain].
        outs = [o.inner_text() for o in pg.locator('.out:not([hidden]) output').all()]
        assert abs(q['zeta'] - float(outs[3])) < 6e-5 * 10 and abs(q['fn'] - float(outs[5])) < 6e-3, (q, outs)
        assert f"ζ {q['zeta']:.4f}" in hud(), hud()
        assert abs(float(re.search(r'Q ([\d.]+)', hud()).group(1)) / float(outs[1]) - 1) < 6e-3, (hud(), outs)
        # Hand check on the defaults (fr 9.975, f1 9.461, f2 10.46 Hz): ζ ≈ Δf/(2 fr) = 0.999/19.95 = 0.050, Q ≈ 10.
        assert abs(q['zeta'] - .05) < 1e-3 and abs(q['fr'] / (q['f2'] - q['f1']) - 10) < .1, q

    # Press the release button: the mass mesh itself must move while the camera does not.
    camera = state()['camera']; faint = pg.evaluate(BRIGHT)
    pg.locator('#sim-release').click()
    span, seen = travel('massY', 2400, 40)
    assert state()['running'] and state()['time'] > 0
    assert span > .02, f'mass did not move after release: {seen}'
    assert state()['camera'] == camera, 'camera moved; mass motion must be judged with a still camera'
    arrows = travel('arrow')[1]
    assert min(arrows) < 0 < max(arrows), f'force arrow did not reverse: {arrows}'
    assert pg.evaluate(BRIGHT) > faint + 30, 'trace did not grow as the sweep ran'
    # What is drawn is the tested closed form at the scene clock, at the labeled visual scale.
    for _ in range(5):
        diff = pg.evaluate(CLOSED[drive]); assert all(abs(d) < 1e-9 for d in diff), diff
        pg.wait_for_timeout(60)

    if drive == 'sweep':
        # Follow one whole pass. Inside f1..f2 the mass must reach past the white ± peak/√2 lines and glow; well below the band
        # it must stay small and dark. Reduce Motion: the pass ends at rest and does not loop.
        low, band, lit, dark, tags, edges = [], [], [], [], set(), []
        was = False
        pg.locator('#sim-release').click()                     # from the start of the pass, r = 0.5
        for _ in range(600):
            s = state(); sw = s['sweep']
            if not s['running']: break
            (band if s['inBand'] else low if sw['r'] < .8 else []).append(abs(s['massY']))
            (lit if s['inBand'] else dark if sw['r'] < .8 else []).append(s['glow'])
            if s['inBand']: tags.add('IN BAND' in hud())
            if s['inBand'] != was: edges.append(sw['f']); was = s['inBand']
            if s['inBand'] and len(band) == 12: pg.screenshot(path=f'screenshots/{route}-sim-band.png')
            pg.wait_for_timeout(40)
        s = state(); q = s['params']
        assert band and low and len(edges) == 2, (len(band), len(low), edges)
        assert max(band) > s['unit'] * Math_SQRT1_2 and max(band) <= s['unit'] + 1e-9, f'mass did not pass the half-power lines in band: {max(band)}'
        # Away from the peak: r < 0.8 → amplitude/peak < 2ζ/(1 − 0.64) = 0.28 for ζ = 0.05.
        assert max(low) < .3 * s['unit'], f'mass too large below the band: {max(low)}'
        assert max(lit) > .8 and max(dark) < .05, (max(lit), max(dark))
        assert True in tags, 'HUD never said IN BAND'
        # The band switched on and off at the entered f1 and f2 (within the frequency swept between polls, allowing 0.35 s
        # of playback per poll; the exact edges are in tests/calcs.test.mjs).
        step = (s['span']['to'] - s['span']['from']) * q['fn'] * .35 / 12
        assert q['f1'] - 1e-9 <= edges[0] < q['f1'] + step and q['f2'] - 1e-9 <= edges[1] < q['f2'] + step, (edges, q, step)
        assert not s['running'] and abs(s['time'] - s['span']['duration']) < 1e-12 and abs(s['massY']) < 1e-6, s
        pg.wait_for_timeout(200); assert state()['time'] == s['time'] and 'IN BAND' not in hud()
        pg.locator('#sim-release').click(); pg.wait_for_function('window.__simState().running && window.__simState().time > .01')
        assert state()['time'] < s['span']['duration'] / 2

    # Changed calculator inputs reach the scene and restart it from rest.
    pg.locator('.sim-panel').scroll_into_view_if_needed(); pg.locator('#sim-release').click(); pg.wait_for_function('window.__simState().time > .05')
    if drive == 'sweep':
        before = state()['params']
        field('Upper half-power').fill('11')
        s = state(); assert s['params']['f2'] == 11 and s['params']['zeta'] > before['zeta'] and s['time'] < .05 and abs(s['x']) < .05, s
        # Invalid inputs (f2 below the peak) pause the physics but keep the scene drawn.
        field('Upper half-power').fill('9')
    assert pg.locator('#sim-release').is_disabled()
    assert hud() == 'Enter valid calculator inputs'
    pg.locator('.sim-panel').scroll_into_view_if_needed()
    frozen = state(); pg.wait_for_function('n => window.__simState().frames > n + 3', arg=frozen['frames'])
    s = state(); assert s['time'] == 0 and abs(s['massY']) < 1e-12 and abs(s['baseY']) < 1e-12 and s['pixelRange'] >= 12, s
    assert pg.locator('canvas.sim').is_visible() and not pg.locator('canvas.sim-trace').is_visible()
    assert s['glow'] == 0 and not s['inBand'], s
    if drive == 'sweep': field('Upper half-power').fill('10.464')
    assert not pg.locator('#sim-release').is_disabled()
    pg.locator('canvas.sim-trace').wait_for(state='visible', timeout=2000)   # redrawn on the next frame
    pg.locator('.sim-panel').scroll_into_view_if_needed(); pg.locator('#sim-release').click()
    assert travel('massY', 2400, 40)[0] > .02, 'mass did not move after restoring valid input'

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

    # Without Reduce Motion the rig starts on its own once it is on screen, and a finished pass starts again from rest.
    b = p.chromium.launch(); pg = b.new_page(viewport=VIEW, reduced_motion='no-preference')
    pg.on('console', lambda m: m.type == 'error' and errors.append(m.text)); pg.on('pageerror', lambda e: errors.append(str(e)))
    open_sim(); assert state()['running']
    assert travel('massY', 2400, 40)[0] > .02, 'mass did not start on its own'
    if drive == 'sweep':
        pg.wait_for_function('window.__simState().sweep.u > .9', timeout=20000)
        pg.wait_for_function('window.__simState().sweep.u < .05', timeout=5000)
        s = state(); assert s['running'] and s['time'] < .05 * s['span']['duration'], s
        # Rest-to-rest wrap: 5% into the pass the fade is still below 1, so the mass is inside its slow-sweep amplitude.
        assert abs(s['massY']) <= s['unit'] * s['sweep']['amp'] + 1e-9, s
    assert not errors, errors
    b.close()

    # No WebGL: labeled 2D rig animates the same motion, the trace strip and the 2D demo chart are still drawn.
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
    for text in HUD[drive]: assert text in hud()
    assert pg.locator('canvas.sim-trace').is_visible() and pg.evaluate(TRACE) > 400, 'trace strip blank without WebGL'
    pg.locator('#sim-release').click(); pg.wait_for_timeout(100)
    a = pg.locator('canvas.sim-fallback').screenshot()
    assert travel('massY', 2400, 40)[0] > .02, '2D mass state did not move'
    assert pg.locator('canvas.sim-fallback').screenshot() != a, '2D rig pixels did not change'
    pg.screenshot(path=f'screenshots/{route}-no-webgl.png')
    assert not errors, errors
    b.close()
    print(f'PASS {route} ({drive}): WebGL pixels, Reduce Motion rest, trace strip drawn and growing, mass mesh moves with still camera, arrow reverses, closed-form match'
          + ', HUD = calculator, time scale, in-band glow at f1..f2 and past the peak/√2 lines, single pass under Reduce Motion' * (drive == 'sweep')
          + ', input restart, invalid pause, offscreen pause, 5 route disposals, auto-start and loop, no-WebGL 2D + trace + demo', flush=True)


Math_SQRT1_2 = math.sqrt(.5)

if __name__ == '__main__':
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p: run_scene_checks(p, sys.argv[1], sys.argv[2], *sys.argv[3:])
