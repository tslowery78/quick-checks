# Browser smoke test: every tool renders in US and SI with no console errors and finite results.
# Run: python3 -m http.server 8765 -d docs &  then  python3 tests/smoke.py
import re, sys
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:8765/'
TOOLS = ['beam', 'section', 'sdof', 'miles', 'psd', 'margin', 'bolt', 'shaft', 'transmissibility', 'forced_daf', 'logdec', 'halfpower', 'dlf_pulse', 'units']
fails = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 390, 'height': 844})
    errs = []
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    pg.on('pageerror', lambda e: errs.append(str(e)))
    for sysname in ['us', 'si']:
        pg.goto(BASE); pg.evaluate(f"localStorage.setItem('unitSystem','{sysname}')")
        for t in TOOLS:
            pg.goto(f'{BASE}#/{t}'); pg.reload(); pg.wait_for_timeout(150)
            modes = pg.locator('.modes button').count() or 1
            for i in range(modes):
                if pg.locator('.modes button').count(): pg.locator('.modes button').nth(i).click()
                visible = pg.locator('fieldset:first-of-type .row:visible').count()
                declared = pg.evaluate("document.querySelectorAll('fieldset:first-of-type .row:not([hidden])').length")
                if t != 'units' and visible != declared: fails.append((sysname, t, i, 'hidden rows visible', visible, declared))
                outs = [o.inner_text() for o in pg.locator('.out:not([hidden]) output, output.big').all()]
                err = pg.locator('.error').inner_text() if pg.locator('.error').count() else ''
                if err or not outs or any('—' in o for o in outs):
                    fails.append((sysname, t, i, err, outs))
            if sysname == 'us': pg.screenshot(path=f'screenshots/{t}-us.png', full_page=True)
    # Demo canvas drawn (non-blank) and redraws on input change
    pg.goto(BASE + '#/transmissibility'); pg.reload(); pg.wait_for_timeout(200)
    NB = "(() => { const c = document.querySelector('canvas.demo'); if (!c || !c.width) return -1; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; })()"
    sig = "(() => { const c = document.querySelector('canvas.demo'); return c.toDataURL().length; })()"
    n0 = pg.evaluate(NB); s0 = pg.evaluate(sig)
    if n0 < 1000: fails.append(('transmissibility canvas blank', n0))
    pg.locator('.row:has-text("Damping") input').fill('0.3'); pg.wait_for_timeout(100)
    if pg.evaluate(sig) == s0: fails.append(('transmissibility demo did not redraw',))
    pg.screenshot(path='screenshots/transmissibility-us.png', full_page=True)
    pg.goto(BASE + '#/logdec'); pg.reload(); pg.wait_for_timeout(200)
    n0 = pg.evaluate(NB); s0 = pg.evaluate(sig)
    if n0 < 1000: fails.append(('logdec canvas blank', n0))
    pg.locator('.row:has-text("Peak N cycles later") input').fill('0.2'); pg.wait_for_timeout(100)
    if pg.evaluate(sig) == s0: fails.append(('logdec demo did not redraw',))
    # refs/logdec.json case 2 by share link: page must show zeta 0.05, fn 10 Hz, Q 10, delta 0.3146
    pg.goto(BASE + '#/logdec?fd=9.98749218~Hz&x1=10~mm&xN=2.07471041~mm&N=5'); pg.reload(); pg.wait_for_timeout(200)
    shown = [o.inner_text() for o in pg.locator('.out output').all()]
    if shown != ['0.05', '0.3146', '10', '10', '0.1252', '2.204', '0.2206']: fails.append(('logdec ref case shown', shown))
    pg.screenshot(path='screenshots/logdec-us.png', full_page=True)
    pg.goto(BASE + '#/halfpower'); pg.reload(); pg.wait_for_timeout(200)
    n0 = pg.evaluate(NB); s0 = pg.evaluate(sig)
    if n0 < 1000: fails.append(('halfpower canvas blank', n0))
    pg.locator('.row:has-text("Upper half-power") input').fill('11'); pg.wait_for_timeout(100)
    if pg.evaluate(sig) == s0: fails.append(('halfpower demo did not redraw',))
    # refs/halfpower.json case 1 by share link
    pg.goto(BASE + '#/halfpower?fr=9.97496867~Hz&f1=9.461105~Hz&f2=10.4636271~Hz'); pg.reload(); pg.wait_for_timeout(200)
    shown = [o.inner_text() for o in pg.locator('.out output').all()]
    if shown != ['0.05025', '9.95', '1.003', '0.05', '0.5038', '10', '10.01']: fails.append(('halfpower ref case shown', shown))
    pg.screenshot(path='screenshots/halfpower-us.png', full_page=True)
    pg.goto(BASE + '#/forced_daf'); pg.reload(); pg.wait_for_timeout(200)
    n0 = pg.evaluate(NB); s0 = pg.evaluate(sig)
    if n0 < 1000: fails.append(('forced_daf canvas blank', n0))
    pg.locator('.row:has-text("Forcing frequency") input').fill('14'); pg.wait_for_timeout(100)
    if pg.evaluate(sig) == s0: fails.append(('forced_daf demo did not redraw',))
    # refs/forced_daf.json case 1 by share link: r 0.5, DAF 1.3304, lag 3.814°, 10 mm static, 13.304 mm dynamic (4 significant figures, trailing zeros dropped), peak 10.01 at r 0.9975
    pg.goto(BASE + '#/forced_daf?fn=10~Hz&zeta=0.05&f=5~Hz&F0=100~N&k=10~N%2Fmm'); pg.reload(); pg.wait_for_timeout(200)
    shown = [o.inner_text() for o in pg.locator('.out output').all()]
    if shown != ['0.5', '1.33', '3.814', '10', '13.3', '10.01', '0.9975']: fails.append(('forced_daf ref case shown', shown))
    # ζ ≥ 1/√2 (refs case 8): no resonant peak, peak DAF 1 at r = 0, and the note says so
    pg.goto(BASE + '#/forced_daf?fn=20~Hz&zeta=0.8&f=20~Hz&F0=10~N&k=1~N%2Fmm'); pg.reload(); pg.wait_for_timeout(200)
    shown = [o.inner_text() for o in pg.locator('.out output').all()]
    if shown != ['1', '0.625', '90', '10', '6.25', '1', '0'] or 'no resonant peak' not in pg.locator('main').inner_text(): fails.append(('forced_daf no-peak case shown', shown))
    pg.screenshot(path='screenshots/forced_daf-us.png', full_page=True)
    pg.goto(BASE + '#/dlf_pulse'); pg.reload(); pg.wait_for_timeout(200)
    n0 = pg.evaluate(NB); s0 = pg.evaluate(sig)
    if n0 < 1000: fails.append(('dlf_pulse canvas blank', n0))
    pg.locator('.row:has-text("Damping ratio") input').fill('0.2'); pg.wait_for_timeout(100)
    if pg.evaluate(sig) == s0: fails.append(('dlf_pulse demo did not redraw',))
    s0 = pg.evaluate(sig); pg.locator('.modes button', has_text='Half-sine').click(); pg.wait_for_timeout(100)
    if pg.evaluate(sig) == s0: fails.append(('dlf_pulse demo did not redraw for another pulse shape',))
    # refs/dlf_pulse.json rows by share link (fn 10 Hz → T 0.1 s; 100 N on 10 N/mm → 10 mm static). Outputs: T s, td/T, DLF, x_static mm, x_max mm, t_peak s, F_eq N.
    # half-sine, td/T 1, ζ 0.05: DLF 1.62006, t_peak/T 0.67020, primary
    pg.goto(BASE + '#/dlf_pulse?m=halfsine&td=0.1~s&fn=10~Hz&zeta=0.05&F0=100~N&k=10~N%2Fmm'); pg.reload(); pg.wait_for_timeout(200)
    shown = [o.inner_text() for o in pg.locator('.out output').all()]
    if shown != ['0.1', '1', '1.62', '10', '16.2', '0.06702', '162'] or 'Primary peak' not in pg.locator('main').inner_text(): fails.append(('dlf_pulse half-sine ref case shown', shown))
    # ramp, td/T 0.8, ζ 0.05: DLF 1.20298, t_peak/T 0.93557, residual
    pg.goto(BASE + '#/dlf_pulse?m=ramp&td=0.08~s&fn=10~Hz&zeta=0.05&F0=100~N&k=10~N%2Fmm'); pg.reload(); pg.wait_for_timeout(200)
    shown = [o.inner_text() for o in pg.locator('.out output').all()]
    if shown != ['0.1', '0.8', '1.203', '10', '12.03', '0.09356', '120.3'] or 'Residual peak' not in pg.locator('main').inner_text(): fails.append(('dlf_pulse ramp ref case shown', shown))
    # rectangular, td/T 0.8, ζ 0.05: DLF 1.85447, t_peak/T 0.50063, primary
    pg.goto(BASE + '#/dlf_pulse?m=rect&td=0.08~s&fn=10~Hz&zeta=0.05&F0=100~N&k=10~N%2Fmm'); pg.reload(); pg.wait_for_timeout(200)
    shown = [o.inner_text() for o in pg.locator('.out output').all()]
    if shown != ['0.1', '0.8', '1.854', '10', '18.54', '0.05006', '185.4'] or 'Primary peak' not in pg.locator('main').inner_text(): fails.append(('dlf_pulse rect ref case shown', shown))
    # hand check: undamped half-sine with td = T → DLF = √3 = 1.732, at t = 2T/3
    pg.goto(BASE + '#/dlf_pulse?m=halfsine&td=0.1~s&fn=10~Hz&zeta=0&F0=100~N&k=10~N%2Fmm'); pg.reload(); pg.wait_for_timeout(200)
    shown = [o.inner_text() for o in pg.locator('.out output').all()]
    if shown != ['0.1', '1', '1.732', '10', '17.32', '0.06667', '173.2']: fails.append(('dlf_pulse half-sine sqrt(3) shown', shown))
    # US row: 25 lbf on 50 lbf/in → 0.5 in static; rectangular DLF 2 → 1 in, 50 lbf
    pg.goto(BASE); pg.evaluate("localStorage.setItem('unitSystem','us')"); pg.goto(BASE + '#/dlf_pulse'); pg.reload(); pg.wait_for_timeout(200)
    shown = [o.inner_text() for o in pg.locator('.out output').all()]
    if shown != ['0.1', '0.8', '2', '0.5', '1', '0.05', '50']: fails.append(('dlf_pulse US defaults shown', shown))
    pg.screenshot(path='screenshots/dlf_pulse-us.png', full_page=True)
    pg.goto(BASE); pg.evaluate("localStorage.setItem('unitSystem','si')")
    # Known values
    pg.goto(BASE); pg.evaluate("localStorage.setItem('unitSystem','us')")
    pg.goto(BASE + '#/psd'); pg.reload(); pg.wait_for_timeout(150)
    grms = pg.locator('.out output').first.inner_text()
    if grms != '14.14': fails.append(('psd default', grms))
    pg.goto(BASE + '#/beam?m=ssUDL&L=120~in&w=100~lbf%2Fin&E=29000~ksi&I=100~in%E2%81%B4&c=5~in'); pg.reload(); pg.wait_for_timeout(150)
    d = pg.locator('.out output').first.inner_text()
    if d != '0.09310': 
        if d != '0.0931': fails.append(('beam link', d))
    # unit change keeps the physical value
    pg.locator('.row:has-text("Span") select').select_option('ft')
    if pg.locator('.row:has-text("Span") input').input_value() != '10': fails.append(('unit switch', pg.locator('.row:has-text("Span") input').input_value()))
    if pg.locator('.out output').first.inner_text() != d: fails.append(('unit switch changed result',))
    pg.goto(BASE); pg.screenshot(path='screenshots/home-us.png', full_page=True)
    b.close()
    from sim_smoke import run_sim_checks
    run_sim_checks(p)
    from sim_driven_smoke import run_driven_checks
    run_driven_checks(p, 'forced_daf', 'forced')
    from sim_invalid_smoke import run_invalid_checks
    run_invalid_checks(p)
    run_driven_checks(p, 'transmissibility', 'base')
    from sim_scene_smoke import run_scene_checks
    run_scene_checks(p, 'halfpower', 'sweep')
    from sim_pulse_smoke import run_pulse_checks
    run_pulse_checks(p)
print('console errors:', errs)
print('failures:', fails)
sys.exit(1 if errs or fails else 0)
