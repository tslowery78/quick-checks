# Browser smoke test: every tool renders in US and SI with no console errors and finite results.
# Run: python3 -m http.server 8765 -d docs &  then  python3 tests/smoke.py
import re, sys
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:8765/'
TOOLS = ['beam', 'section', 'sdof', 'miles', 'psd', 'margin', 'bolt', 'shaft', 'transmissibility', 'units']
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
print('console errors:', errs)
print('failures:', fails)
sys.exit(1 if errs or fails else 0)
