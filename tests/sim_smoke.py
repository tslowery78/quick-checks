"""Interaction/lifecycle checks, also called by the full smoke.py suite."""
from pathlib import Path
from io import BytesIO
from PIL import Image, ImageChops
BASE='http://localhost:8765/'

def run_sim_checks(p):
    errors=[]
    b=p.chromium.launch()
    pg=b.new_page(viewport={'width':390,'height':844}, reduced_motion='reduce')
    pg.on('console', lambda m: m.type=='error' and errors.append(m.text))
    pg.on('pageerror', lambda e: errors.append(str(e)))
    def snap(): return pg.evaluate("document.querySelector('.sim-panel').__sim.snapshot()")
    def open_sim():
        pg.goto(BASE+'#/logdec')
        pg.locator('.sim-panel').scroll_into_view_if_needed()
        pg.wait_for_function("document.querySelector('.sim-panel')?.dataset.renderer === 'webgl'")
        pg.wait_for_timeout(150)
    pg.goto(BASE); pg.evaluate("localStorage.setItem('unitSystem','si')"); pg.reload()
    open_sim()
    assert snap()['pixelRange']>=12
    assert snap()['vertices']<=3000
    pg.locator('#sim-release').click()
    first=Image.open(BytesIO(pg.locator('canvas.sim').screenshot())).convert('RGB')
    pg.wait_for_timeout(300)
    second=Image.open(BytesIO(pg.locator('canvas.sim').screenshot())).convert('RGB')
    # Exclude the HUD; only scene pixels establish movement.
    box=(0,0,first.width,first.height-40)
    assert ImageChops.difference(first.crop(box),second.crop(box)).getbbox(), '3D pixels did not change after bounce'
    assert snap()['x0']==.3*1.65
    pg.wait_for_timeout(800)
    assert snap()['peaks']>=1
    # Reach the mass through real raycast hit testing and drag well beyond its limit.
    pg.evaluate("document.querySelector('.sim-panel').__sim.release(0)")
    pg.wait_for_timeout(100)
    state=snap(); mass=state['massScreen']
    pg.mouse.move(mass['x'],mass['y']); pg.mouse.down()
    assert snap()['dragging'], 'mass raycast did not begin drag'
    pg.mouse.move(mass['x'],mass['y']+230,steps=12)
    assert abs(snap()['x']-.4*1.65)<1e-10, 'pull clamp'
    pg.mouse.up()
    assert not snap()['dragging']
    assert abs(snap()['x0']-.4*1.65)<1e-10
    # Orbit from empty space; camera state must change.
    canvas=pg.locator('canvas.sim').bounding_box(); before=snap()['camera']
    pg.mouse.move(canvas['x']+20,canvas['y']+80); pg.mouse.down()
    pg.mouse.move(canvas['x']+140,canvas['y']+110,steps=10); pg.mouse.up(); pg.wait_for_timeout(200)
    assert snap()['camera']!=before, 'orbit did not change camera'
    # Native/web inputs feed both fn and zeta, and restart decay.
    pg.locator('.row:has-text("Peak N cycles later") input').fill('0.2')
    changed=snap(); assert changed['params']['zeta']>.05 and changed['time']<.1
    pg.locator('.row:has-text("Ringing frequency") input').fill('2')
    assert snap()['params']['fd']==2
    pg.locator('.row:has-text("Ringing frequency") input').fill('-1')
    assert pg.locator('#sim-release').is_disabled()
    pg.locator('.row:has-text("Ringing frequency") input').fill('10')
    assert not pg.locator('#sim-release').is_disabled()
    # Offscreen pauses RAF and physical time, then resumes without a hidden-time jump.
    pg.locator('.sim-panel').scroll_into_view_if_needed(); pg.wait_for_timeout(100)
    pg.evaluate('window.scrollTo(0,0)'); pg.wait_for_timeout(150)
    paused=snap(); assert not paused['visible'] and not paused['active']
    pg.wait_for_timeout(200); assert snap()['frames']==paused['frames']
    pg.locator('.sim-panel').scroll_into_view_if_needed(); pg.wait_for_timeout(100)
    pg.wait_for_function("n => document.querySelector('.sim-panel').__sim.snapshot().frames > n", arg=paused['frames'])
    # Native host visibility/background gate pauses the same shared clock.
    pg.evaluate("document.querySelector('.sim-panel').__sim.setActive(false)")
    gated=snap(); pg.wait_for_timeout(200)
    assert snap()['frames']==gated['frames'] and not snap()['active']
    pg.evaluate("document.querySelector('.sim-panel').__sim.setActive(true)")
    pg.wait_for_function("n => document.querySelector('.sim-panel').__sim.snapshot().frames > n", arg=gated['frames'])
    # Retain disposed APIs to prove their loops stop after every route transition.
    pg.evaluate('window.oldSims=[]')
    for _ in range(5):
        pg.evaluate("oldSims.push(document.querySelector('.sim-panel').__sim); location.hash='#/beam'")
        pg.wait_for_function("!document.querySelector('.sim-panel')")
        assert pg.evaluate('oldSims.every(s=>s.snapshot().disposed && !s.snapshot().active)')
        pg.evaluate("location.hash='#/logdec'")
        pg.wait_for_selector('.sim-panel'); pg.locator('.sim-panel').scroll_into_view_if_needed()
        pg.wait_for_function("document.querySelector('.sim-panel')?.dataset.renderer === 'webgl'")
    counts=pg.evaluate('oldSims.map(s=>s.snapshot().frames)'); pg.wait_for_timeout(300)
    assert pg.evaluate('oldSims.map(s=>s.snapshot().frames)')==counts
    # Capture a normal opening pose after the fly-in; explicit camera motion test in new context.
    pg.locator('#sim-release').click(); pg.wait_for_timeout(1000)
    pg.locator('.sim-panel').scroll_into_view_if_needed()
    pg.screenshot(path='screenshots/logdec-sim.png')
    flight=b.new_page(viewport={'width':390,'height':844},reduced_motion='no-preference')
    flight.goto(BASE+'sim/embed.html?embed=1')
    flight.wait_for_function("document.querySelector('#rig').dataset.renderer==='webgl'")
    getcam="document.querySelector('#rig').__sim.snapshot().camera"
    c0=flight.evaluate(getcam); flight.wait_for_timeout(400); c1=flight.evaluate(getcam)
    assert c0!=c1, 'fly-in did not move camera'
    flight.locator('canvas.sim').click(position={'x':15,'y':70}); flight.wait_for_timeout(250)
    c2=flight.evaluate(getcam); flight.wait_for_timeout(300); assert flight.evaluate(getcam)==c2, 'pointer did not stop fly-in'
    # Real context loss must replace 3D with an animated, labeled 2D view.
    pg.evaluate("document.querySelector('canvas.sim').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()")
    pg.wait_for_function("document.querySelector('.sim-panel').dataset.renderer==='2d'")
    assert pg.locator('.sim-hint').inner_text().startswith('Graphics connection interrupted')
    pg.locator('#sim-release').click(); pg.wait_for_timeout(100)
    a=pg.locator('canvas.sim-fallback').screenshot(); pg.wait_for_timeout(300)
    assert pg.locator('canvas.sim-fallback').screenshot()!=a
    # Exercise the draw-exception catch separately from the context-lost event.
    pg.reload(); pg.locator('.sim-panel').scroll_into_view_if_needed()
    pg.wait_for_function("document.querySelector('.sim-panel').dataset.renderer==='webgl'")
    pg.evaluate("() => { document.querySelector('canvas.sim').getContext('webgl2').drawElements = () => { throw new Error('Injected draw failure'); }; }")
    pg.wait_for_function("document.querySelector('.sim-panel').dataset.renderer==='2d'")
    assert '3D rendering unavailable' in pg.locator('.sim-hint').inner_text()
    b.close()
    assert not errors,errors
    b=p.chromium.launch(args=['--disable-webgl','--disable-3d-apis'])
    pg=b.new_page(viewport={'width':390,'height':844})
    fallback_errors=[]
    pg.on('console', lambda m: m.type=='error' and fallback_errors.append(m.text))
    pg.on('pageerror', lambda e: fallback_errors.append(str(e)))
    pg.goto(BASE+'#/logdec'); pg.locator('.sim-panel').scroll_into_view_if_needed()
    pg.wait_for_function("document.querySelector('.sim-panel').dataset.renderer==='2d'")
    assert '3D is unavailable' in pg.locator('.sim-hint').inner_text()
    pg.wait_for_timeout(100)
    assert pg.evaluate("document.querySelector('canvas.demo').getContext('2d').getImageData(0,0,50,50).data.some(x=>x>0)")
    pg.locator('#sim-release').click(); pg.wait_for_timeout(100)
    a=pg.locator('canvas.sim-fallback').screenshot(); pg.wait_for_timeout(300)
    assert pg.locator('canvas.sim-fallback').screenshot()!=a
    pg.screenshot(path='screenshots/logdec-no-webgl.png')
    assert not fallback_errors,fallback_errors
    b.close()
    # A module-load failure must also leave a useful visible fallback.
    b=p.chromium.launch(); pg=b.new_page()
    pg.route('**/sim/rig.js', lambda route: route.fulfill(status=200,content_type='text/javascript',body="throw new Error('Injected renderer initialization failure')"))
    pg.goto(BASE+'#/logdec'); pg.locator('.sim-panel').scroll_into_view_if_needed()
    pg.wait_for_function("document.querySelector('.sim-panel').dataset.renderer==='2d'")
    assert '3D could not start' in pg.locator('.sim-hint').inner_text()
    assert pg.locator('canvas.demo').is_visible()
    b.close()
    print('PASS: WebGL pixels, bounce, peak, drag/clamp, orbit, input update/invalid, offscreen/native-host pause/resume, 5 route disposals, fly-in/interrupt, context-loss 2D, no-WebGL 2D, initialization/draw failure fallback')

if __name__=='__main__':
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p: run_sim_checks(p)
