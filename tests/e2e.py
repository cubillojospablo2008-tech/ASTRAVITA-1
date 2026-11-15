import asyncio, sys
from playwright.async_api import async_playwright
URL = 'file://' + __import__('os').path.abspath('ASTRAVITA.html') + ''
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        ctx = await b.new_context(viewport={'width':1440,'height':900})
        page = await ctx.new_page()
        errs = []
        page.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error','warning') and 'ERR_FAILED' not in m.text else None)
        page.on('pageerror', lambda e: errs.append('PAGEERROR: '+str(e)))
        await page.route(lambda u: not u.startswith(('file:','data:','blob:')), lambda r: r.abort())
        await page.goto(URL+'#/auth')
        await page.wait_for_selector('[data-use]:not([disabled])', timeout=120000)
        await page.click('[data-use="elena.vance@demo.astravita"]')
        await page.wait_for_selector('h1:has-text("Hello")', timeout=30000)
        await page.goto(URL+'#/patient/monitor'); await page.wait_for_timeout(600)
        await page.click('[data-src="demo"]'); await page.wait_for_timeout(2500)
        await page.screenshot(path='shots/m_precheck.png')
        await page.click('#pc-go')  # baseline exists -> live
        await page.wait_for_timeout(20000)
        await page.screenshot(path='shots/m_live.png', full_page=True)
        await page.wait_for_timeout(48000)
        await page.click('#m-end')
        await page.wait_for_selector('#qq-form', timeout=10000)
        await page.screenshot(path='shots/m_q.png')
        await page.click('#qq-save')
        await page.wait_for_selector('h1:has-text("Session results")', timeout=20000); await page.wait_for_timeout(1000)
        await page.screenshot(path='shots/m_results.png', full_page=True)
        print('result headline:', await page.inner_text('h1'))
        # doctor
        await page.click('.user-pill'); await page.click('[data-act="signout"]'); await page.wait_for_timeout(500)
        await page.goto(URL+'#/auth'); await page.wait_for_selector('[data-use]:not([disabled])', timeout=60000)
        await page.click('[data-use="maya.thornton@demo.astravita"]')
        await page.wait_for_selector('h1:has-text("Crew triage")', timeout=30000); await page.wait_for_timeout(800)
        await page.screenshot(path='shots/d_console.png', full_page=True)
        await page.click('.tcard >> nth=0 >> text=Open record'); await page.wait_for_selector('#pr-note', timeout=20000); await page.wait_for_timeout(800)
        await page.screenshot(path='shots/d_record.png', full_page=True)
        await page.goto(URL+'#/doctor/alerts'); await page.wait_for_timeout(1500)
        await page.screenshot(path='shots/d_alerts.png')
        # role guard
        await page.goto(URL+'#/patient/dashboard'); await page.wait_for_timeout(800)
        print('guard ->', page.url.split('#')[1])
        print('\n'.join(errs[:30]) or 'no console errors')
        await b.close()
asyncio.run(main())
