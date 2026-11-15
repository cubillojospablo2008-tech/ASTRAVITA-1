"""QA: keyboard, skip link, dialogs, route hardening, demo-account isolation via URL."""
import asyncio, time
from playwright.async_api import async_playwright
URL = 'file://' + __import__('os').path.abspath('ASTRAVITA.html') + ''
SH = '/home/claude/work/shots/'
CREW_PW = 'Demo-Crew-2026!'
res, errs = [], []
def check(n, ok, info=''):
    res.append(ok); print(('PASS ' if ok else 'FAIL ') + n + (' :: ' + str(info) if info else ''), flush=True)

async def signin(page, email, pw):
    await page.goto(URL + '#/auth'); await page.wait_for_selector('[data-use]:not([disabled])', timeout=120000)
    await page.click('#tab-signin'); await page.fill('#si-email', email); await page.fill('#si-pw', pw); await page.click('#si-btn')
    await page.wait_for_url(lambda u: '#/auth' not in u, timeout=30000); await page.wait_for_timeout(800)
async def signout(page):
    await page.click('.user-pill'); await page.click('[data-act="signout"]'); await page.wait_for_timeout(500)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900})
        await ctx.route(lambda u: not u.startswith(('file:', 'data:', 'blob:')), lambda r: r.abort())
        page = await ctx.new_page()
        page.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type == 'error' and 'net::' not in m.text else None)
        page.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        await page.goto(URL + '#/auth'); await page.wait_for_selector('[data-use]:not([disabled])', timeout=120000)
        # keyboard through auth page
        await page.evaluate("document.activeElement.blur()")
        seq = []
        for _ in range(14):
            await page.keyboard.press('Tab')
            seq.append(await page.evaluate("(e => (e.id || e.className || e.tagName).toString().slice(0,24) + (getComputedStyle(e).outlineStyle !== 'none' || getComputedStyle(e).boxShadow !== 'none' ? '*' : ''))(document.activeElement)"))
        print('auth tab order:', seq)
        check('auth: tab reaches email, password, sign in', any(s.startswith('si-email') for s in seq) and any(s.startswith('si-pw') for s in seq) and any(s.startswith('si-btn') for s in seq))
        check('auth: focused elements have visible focus style', all(s.endswith('*') for s in seq), [s for s in seq if not s.endswith('*')])
        # tabs with arrow keys
        await page.focus('#tab-signin'); await page.keyboard.press('ArrowRight'); await page.wait_for_timeout(150)
        check('auth: arrow key switches tab', await page.evaluate("document.activeElement.id") == 'tab-create' and await page.is_visible('#panel-create'))
        # skip link on auth page
        await page.focus('.skip-link'); await page.keyboard.press('Enter'); await page.wait_for_timeout(500)
        check('skip link keeps route (auth)', page.url.endswith('#/auth') and await page.evaluate("document.activeElement.id") == 'view', page.url)
        # demo crew: get another member's session id
        await signin(page, 'kenji.watanabe@demo.astravita', CREW_PW)
        await page.goto(URL + '#/patient/results'); await page.wait_for_selector('#r-pick'); kid = await page.eval_on_selector('#r-pick', 'e => e.value')
        await signout(page)
        await signin(page, 'elena.vance@demo.astravita', CREW_PW)
        await page.goto(URL + '#/patient/results/' + kid); await page.wait_for_timeout(1500)
        t = await page.inner_text('#view')
        check('Elena cannot open Kenji session via URL', 'Session not found' in t and 'Kenji' not in t, t[:160])
        # skip link on dashboard
        await page.goto(URL + '#/patient/dashboard'); await page.wait_for_timeout(1200)
        await page.focus('.skip-link'); await page.keyboard.press('Enter'); await page.wait_for_timeout(500)
        check('skip link keeps route (dashboard)', page.url.endswith('#/patient/dashboard') and await page.evaluate("document.activeElement.id") == 'view', page.url)
        # tab through dashboard
        seq = []
        for _ in range(25):
            await page.keyboard.press('Tab'); seq.append(await page.evaluate("(e => e.tagName + (getComputedStyle(e).outlineStyle !== 'none' || getComputedStyle(e).boxShadow !== 'none' ? '*' : ''))(document.activeElement)"))
        check('dashboard: tab moves through controls with focus ring (BODY = wrap to browser UI)', seq.count('BODY') <= 1 and all(s.endswith('*') for s in seq if s != 'BODY'), seq)
        # prototype keys in route
        for h in ['#/constructor', '#/toString', '#/patient/constructor', '#/__proto__']:
            await page.goto(URL + h); await page.wait_for_timeout(900)
            check(f'route {h} falls back', await page.locator('#view h1').count() > 0, page.url)
        # user menu via keyboard
        await page.goto(URL + '#/patient/dashboard'); await page.wait_for_timeout(1000)
        await page.focus('.user-pill'); await page.keyboard.press('Enter'); await page.wait_for_timeout(300)
        check('user menu opens with keyboard', await page.evaluate("document.getElementById('user-menu').matches(':popover-open')"))
        await page.keyboard.press('Escape'); await page.wait_for_timeout(200)
        check('user menu closes with Escape', not await page.evaluate("document.getElementById('user-menu').matches(':popover-open')"))
        # questionnaire dialog via dashboard check-in: focus stays, escape closes
        await page.click('#d-checkin'); await page.wait_for_selector('#qq-form')
        inside = []
        for _ in range(8):
            await page.keyboard.press('Tab'); inside.append(await page.evaluate("!!document.activeElement.closest('dialog[open]') || document.activeElement === document.body"))
        check('questionnaire dialog traps focus (page inert)', all(inside), inside)
        await page.keyboard.press('Escape'); await page.wait_for_timeout(300)
        check('questionnaire closes with Escape', await page.locator('dialog[open]').count() == 0)
        # short-session confirm: Escape keeps recording
        await page.goto(URL + '#/patient/monitor'); await page.wait_for_selector('[data-src="demo"]'); await page.click('[data-src="demo"]')
        await page.wait_for_selector('#pc-go:not([disabled])', timeout=20000); await page.click('#pc-go'); await page.wait_for_timeout(4000)
        await page.click('#m-end'); await page.wait_for_selector('dialog[open]')
        await page.screenshot(path=SH + 'qa_short_confirm.png')
        await page.keyboard.press('Escape'); await page.wait_for_timeout(1500)
        check('short session: Escape keeps recording', await page.is_visible('#m-end') and await page.inner_text('#m-timer') != '00:00', await page.inner_text('#m-timer'))
        await page.click('#m-end'); await page.wait_for_selector('dialog[open]'); await page.click('dialog[open] button[value=ok]'); await page.wait_for_timeout(800)
        check('short session: explicit discard works', not await page.is_visible('#m-end') and 'discarded' in await page.inner_text('#m-msg'))
        # doctor: demo console, private notes
        await signout(page)
        await signin(page, 'maya.thornton@demo.astravita', 'Demo-Surgeon-2026!')
        t0 = time.time(); await page.goto(URL + '#/doctor/alerts'); await page.goto(URL + '#/doctor/console'); await page.wait_for_selector('.tcard', timeout=30000)
        print('console load s', round(time.time() - t0, 2))
        check('demo doctor triage lists crew', await page.locator('.tcard').count() >= 4, await page.locator('.tcard').count())
        await b.close()
    print('\n'.join(sorted(set(errs))[:20]) or 'no console errors')
    print(f'{sum(res)}/{len(res)} passed')
asyncio.run(main())
