"""Regression checks for invalid input during drag and invalid initial navigation."""
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8765/'


def run_invalid_checks(p):
    failures = []
    for case in ['invalid_drag_recovery', 'invalid_initial_webgl', 'invalid_initial_2d']:
        browser = p.chromium.launch(args=['--disable-webgl', '--disable-3d-apis'] if case.endswith('_2d') else [])
        page = browser.new_page(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        snapshot = lambda: page.evaluate("document.querySelector('.sim-panel').__sim.snapshot()")
        try:
            page.goto(BASE + ('#/logdec' if case == 'invalid_drag_recovery' else '#/logdec?x1=1&xN=2'))
            page.locator('.sim-panel').scroll_into_view_if_needed()
            page.wait_for_function("!!document.querySelector('.sim-panel')?.__sim")
            if case == 'invalid_drag_recovery':
                page.wait_for_function("document.querySelector('.sim-panel').dataset.renderer === 'webgl'")
                field = page.locator('.row:has-text("First peak") input')
                original = field.input_value()
                field.fill('')
                page.locator('.sim-panel').scroll_into_view_if_needed()
                page.wait_for_timeout(100)
                point = snapshot()['massScreen']
                page.mouse.move(point['x'], point['y']); page.mouse.down()
                page.mouse.move(point['x'], point['y'] + 65, steps=5); page.mouse.up()
                field.fill(original)
                page.locator('.sim-panel').scroll_into_view_if_needed()
                page.wait_for_timeout(100)
                state = snapshot()
                assert not state['dragging'], f'drag remains latched after restoring input: {state}'
                t0 = state['time']
                page.wait_for_timeout(200)
                assert snapshot()['time'] > t0, 'physical clock is frozen after restoring same input'
                # A valid pointer release must still drive actual decay after the interrupted state.
                page.evaluate("document.querySelector('.sim-panel').__sim.release(0)")
                page.wait_for_timeout(80)
                point = snapshot()['massScreen']
                page.mouse.move(point['x'], point['y']); page.mouse.down()
                page.mouse.move(point['x'], point['y'] + 60, steps=6); page.mouse.up()
                x0 = snapshot()['x0']; assert abs(x0) > .05
                page.wait_for_timeout(200)
                assert abs(snapshot()['x'] - x0) > .01
            else:
                page.wait_for_timeout(600)
                state = snapshot()
                assert state['frames'] > 0, f'no rendered frames for invalid initial input: {state}'
                expected = '2d' if case.endswith('_2d') else 'webgl'
                assert state['renderer'] == expected, (state, page.locator('.sim-mode').inner_text())
                if expected == 'webgl': assert state['pixelRange'] >= 12
                else:
                    assert page.evaluate("document.querySelector('canvas.sim-fallback').getContext('2d').getImageData(0,0,40,40).data.some(v => v > 0)")
                assert page.locator('#sim-release').is_disabled()
                assert page.locator('.sim-hud').inner_text() == 'Enter valid calculator inputs'
                page.locator('.row:has-text("First peak") input').fill('10')
                page.locator('.sim-panel').scroll_into_view_if_needed()
                page.locator('#sim-release').click()
                page.wait_for_function("document.querySelector('.sim-panel').__sim.snapshot().peaks >= 1")
            assert not errors, errors
            print('PASS', case, flush=True)
        except Exception as e:
            failures.append((case, str(e)))
            print('FAIL', case, str(e), flush=True)
        finally:
            browser.close()
    assert not failures, failures


if __name__ == '__main__':
    with sync_playwright() as p:
        run_invalid_checks(p)
