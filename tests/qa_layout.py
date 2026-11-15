"""QA layout: 375 / 768 / 1440 px, key screens, horizontal overflow and off-screen elements."""
import asyncio
from playwright.async_api import async_playwright
URL = 'file://' + __import__('os').path.abspath('ASTRAVITA.html') + ''
SH = '/home/claude/work/shots/'
OFF = """() => { const W = innerWidth, out = [];
  for (const e of document.querySelectorAll('#app *')) {
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if (e.closest('.table-wrap, .menu, [popover], .chart, .toasts, .steps, svg')) continue;
    const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.position === 'fixed') continue;
    if (r.right > W + 1 || r.left < -1) out.push((e.id || e.className || e.tagName).toString().slice(0, 40) + ' [' + Math.round(r.left) + ',' + Math.round(r.right) + ']');
  } return out.slice(0, 8); }"""
errs, fails = [], []
async def shot(page, name, w):
    await page.wait_for_timeout(900)
    ov = await page.evaluate("document.documentElement.scrollWidth - innerWidth")
    off = await page.evaluate(OFF)
    await page.screenshot(path=f'{SH}qa_{name}_{w}.png', full_page=(w != 1440 or name in ('record',)))
    ok = ov <= 1 and not off
    if not ok: fails.append((name, w, ov, off))
    print(('PASS' if ok else 'FAIL'), name, w, 'overflow', ov, off, flush=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        for w, h in [(375, 812), (768, 1024), (1440, 900)]:
            ctx = await b.new_context(viewport={'width': w, 'height': h}); page = await ctx.new_page()
            await ctx.route(lambda u: not u.startswith(('file:', 'data:', 'blob:')), lambda r: r.abort())
            page.on('pageerror', lambda e: errs.append(str(e)))
            page.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'net::' not in m.text else None)
            await page.goto(URL + '#/auth'); await page.wait_for_selector('[data-use]:not([disabled])', timeout=120000)
            await shot(page, 'auth', w)
            await page.click('[data-use="marcus.chen@demo.astravita"]'); await page.wait_for_url(lambda u: '#/auth' not in u)
            await page.wait_for_selector('h1:has-text("Hello")'); await page.wait_for_timeout(800)
            await shot(page, 'dash', w)
            await page.goto(URL + '#/patient/monitor'); await page.wait_for_selector('[data-src="demo"]'); await page.click('[data-src="demo"]')
            await page.wait_for_selector('#pc-go:not([disabled])', timeout=20000); await page.click('#pc-go'); await page.wait_for_timeout(5000)
            await shot(page, 'monitor', w)
            await page.goto(URL + '#/patient/results'); await page.wait_for_selector('#r-pick')
            await shot(page, 'results', w)
            await page.goto(URL + '#/patient/care'); await page.wait_for_timeout(500); await shot(page, 'care', w)
            await page.goto(URL + '#/patient/history'); await page.wait_for_timeout(500); await shot(page, 'history', w)
            await page.click('.user-pill'); await page.click('[data-act="signout"]'); await page.wait_for_timeout(500)
            await page.goto(URL + '#/auth'); await page.wait_for_selector('[data-use]:not([disabled])')
            await page.click('[data-use="maya.thornton@demo.astravita"]'); await page.wait_for_selector('.tcard', timeout=30000)
            await shot(page, 'console', w)
            await page.click('.tcard >> nth=0 >> text=Open record'); await page.wait_for_selector('#pr-note', timeout=20000)
            await shot(page, 'record', w)
            await page.goto(URL + '#/doctor/alerts'); await page.wait_for_timeout(800); await shot(page, 'alerts', w)
            await ctx.close()
        await b.close()
    print('errors:', sorted(set(errs))[:10] or 'none')
    print('FAILS', fails)
asyncio.run(main())
