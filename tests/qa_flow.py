"""QA end-to-end: real accounts, isolation, linking, session flow, exports, revoke, tamper."""
import asyncio, json, re, sys, time
from playwright.async_api import async_playwright
URL = 'file://' + __import__('os').path.abspath('ASTRAVITA.html') + ''
SH = '/home/claude/work/shots/'
STAMP = str(int(time.time()))[-5:]
PW = 'Qa-Tester-2026!'
A_EMAIL, B_EMAIL, D_EMAIL = f'alice{STAMP}@qa.test', f'bob{STAMP}@qa.test', f'drq{STAMP}@qa.test'
results = []
def check(name, ok, info=''):
    results.append((name, bool(ok), info)); print(('PASS ' if ok else 'FAIL ') + name + (' :: ' + str(info) if info else ''), flush=True)

errs = []
def wire(page, tag):
    page.on('console', lambda m: errs.append(f'[{tag}] {m.type}: {m.text}') if m.type == 'error' and 'ERR_FAILED' not in m.text and 'net::' not in m.text else None)
    page.on('pageerror', lambda e: errs.append(f'[{tag}] PAGEERROR: {e}'))

async def signout(page):
    await page.click('.user-pill'); await page.click('[data-act="signout"]'); await page.wait_for_timeout(400)

async def signin(page, email, pw, expect='h1'):
    await page.goto(URL + '#/auth'); await page.wait_for_selector('#f-signin')
    await page.click('#tab-signin')
    await page.fill('#si-email', email); await page.fill('#si-pw', pw); await page.click('#si-btn')
    for _ in range(150):
        if '#/auth' not in page.url or (await page.inner_text('#si-err')).strip(): break
        await page.wait_for_timeout(200)
    await page.wait_for_timeout(700)

async def create(page, role, name, email):
    await page.goto(URL + '#/auth?tab=create'); await page.wait_for_selector('#f-create')
    await page.click('#tab-create')
    await page.check(f'input[name=role][value={role}]')
    await page.fill('#cr-name', name); await page.fill('#cr-email', email)
    await page.type('#cr-pw', 'abc'); s1 = await page.inner_text('#cr-strength-txt')
    await page.fill('#cr-pw', ''); await page.type('#cr-pw', PW); s2 = await page.inner_text('#cr-strength-txt')
    # submit without terms -> error
    await page.click('#cr-btn'); e1 = await page.inner_text('#cr-err')
    await page.check('input[name=terms]'); await page.click('#cr-btn')
    await page.wait_for_url(lambda u: '#/auth' not in u, timeout=30000); await page.wait_for_timeout(800)
    return s1, s2, e1

async def run_demo_session(page, safety=False, answer=True, wait=66):
    await page.goto(URL + '#/patient/monitor'); await page.wait_for_selector('[data-src="demo"]')
    await page.click('[data-src="demo"]')
    if await page.locator('dialog[open] button[value="yes"]').count():
        await page.click('dialog[open] button[value="yes"]')
    await page.wait_for_selector('#pc-go:not([disabled])', timeout=20000); await page.wait_for_timeout(1500)
    await page.click('#pc-go')
    return time.time()

async def finish_session(page, safety=False, answer=True):
    await page.click('#m-end')
    await page.wait_for_selector('#qq-form', timeout=15000)
    if answer:
        for q, v in [('q_mood_low', 2), ('q_anhedonia', 1), ('q_nervous', 2), ('q_worry', 1), ('q_sleep_quality', 2)]:
            await page.check(f'#qq-form input[name={q}][value="{v}"]')
        await page.fill('#qq-q_sleep_hours', '5.5')
        await page.check(f'#qq-form input[name=q_safety][value="{1 if safety else 0}"]')
        await page.click('#qq-save')
    else:
        await page.click('#qq-form .dlg-foot button[value=skip]')

async def main():
    t0 = time.time()
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'])
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
        await ctx.route(lambda u: not u.startswith(('file:', 'data:', 'blob:')), lambda r: r.abort())
        p1 = await ctx.new_page(); wire(p1, 'p1')
        p2 = await ctx.new_page(); wire(p2, 'p2')
        await p1.goto(URL + '#/auth'); await p1.wait_for_selector('[data-use]:not([disabled])', timeout=120000)
        print('seeded', round(time.time() - t0), flush=True)
        # ---------- 1. accounts ----------
        s1, s2, e1 = await create(p1, 'doctor', 'Dr. Quinn Tester', D_EMAIL)
        check('strength meter weak->strong', 'Strength: ' in s1 and s1 != s2, f'{s1} / {s2}')
        check('terms checkbox required', 'confirm' in e1.lower(), e1)
        check('doctor lands on console', '#/doctor/console' in p1.url, p1.url)
        await p1.wait_for_timeout(500)
        txt = await p1.inner_text('#view')
        check('new doctor empty triage', 'No linked crew members yet' in txt and 'Simulated' not in txt)
        check('no demo banner for real doctor', await p1.locator('.banner').count() == 0)
        await signout(p1)
        await create(p1, 'patient', 'Alice Quality', A_EMAIL)
        txt = await p1.inner_text('#view')
        check('patient A empty dashboard', 'No sessions yet' in txt and 'Elena' not in txt and 'Simulated' not in txt, txt[:120])
        await p1.screenshot(path=SH + 'qa_newA_dash.png', full_page=True)
        await p1.goto(URL + '#/patient/care'); await p1.wait_for_selector('.code-box'); codeA = (await p1.inner_text('.code-box')).strip()
        await p1.goto(URL + '#/patient/history'); await p1.wait_for_timeout(500)
        check('patient A empty history', 'No sessions yet' in await p1.inner_text('#view'))
        await create(p2, 'patient', 'Bob Quality', B_EMAIL)
        await p2.goto(URL + '#/patient/care'); await p2.wait_for_selector('.code-box'); codeB = (await p2.inner_text('.code-box')).strip()
        check('link codes 8 chars & distinct', len(codeA) == 8 and len(codeB) == 8 and codeA != codeB, f'{codeA} {codeB}')
        # ---------- start both demo sessions in parallel ----------
        tA = await run_demo_session(p1); tB = await run_demo_session(p2)
        # meanwhile on a third page: doctor linking + demo/real cross checks
        p3 = await ctx.new_page(); wire(p3, 'p3')
        reg = await p3.evaluate("""() => new Promise(res => { const r = indexedDB.open('astravita'); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('astravita:registry'); g.onsuccess = () => res(g.result); }; })""") if False else None
        await p3.goto(URL + '#/auth'); await p3.wait_for_selector('#f-signin')
        reg = await p3.evaluate("""() => new Promise(res => { const r = indexedDB.open('astravita'); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('astravita:registry'); g.onsuccess = () => res(g.result); }; })""")
        demo_code = next(u['link_code'] for u in reg['users'].values() if u['demo'] and u['role'] == 'patient')
        await signin(p3, D_EMAIL, PW)
        await p3.goto(URL + '#/doctor/add'); await p3.wait_for_selector('#da-code')
        await p3.fill('#da-code', demo_code); await p3.click('#da-form button[type=submit]'); await p3.wait_for_timeout(600)
        check('real doctor cannot add demo patient', 'No crew member' in await p3.inner_text('#da-err'), await p3.inner_text('#da-err'))
        await p3.fill('#da-code', codeA.lower()); await p3.click('#da-form button[type=submit]'); await p3.wait_for_timeout(1000)
        check('real doctor requests A', 'Pending requests' in await p3.inner_text('#view') and 'waiting for the crew member' in await p3.inner_text('#view'))
        await p3.fill('#da-code', codeA); await p3.click('#da-form button[type=submit]'); await p3.wait_for_timeout(600)
        check('duplicate request blocked', 'already pending' in await p3.inner_text('#da-err'))
        await signout(p3)
        await signin(p3, 'maya.thornton@demo.astravita', 'Demo-Surgeon-2026!')
        await p3.goto(URL + '#/doctor/add'); await p3.wait_for_selector('#da-code')
        await p3.fill('#da-code', codeB); await p3.click('#da-form button[type=submit]'); await p3.wait_for_timeout(600)
        check('demo doctor cannot add real patient', 'No crew member' in await p3.inner_text('#da-err'), await p3.inner_text('#da-err'))
        await signout(p3)
        # ---------- wait for sessions (calibration 30 s + 66 s live) ----------
        while time.time() - tA < 30 + 70:
            await asyncio.sleep(2)
        tm = await p1.inner_text('#m-timer'); print('A timer', tm, flush=True)
        await p1.screenshot(path=SH + 'qa_monitor_live.png', full_page=True)
        await finish_session(p1, safety=True)
        sup = await p1.wait_for_selector('dialog[open] #sp-title', timeout=20000)
        check('safety -> calm support dialog', sup is not None and 'not have to go through this alone' in await sup.inner_text())
        await p1.screenshot(path=SH + 'qa_support.png')
        # focus trap + escape
        foc = []
        for _ in range(6):
            await p1.keyboard.press('Tab'); foc.append(await p1.evaluate("!!document.activeElement.closest('dialog[open]') || document.activeElement === document.body"))
        check('support dialog traps focus', all(foc), foc)
        await p1.keyboard.press('Escape'); await p1.wait_for_timeout(400)
        check('support dialog closes with Escape', await p1.locator('dialog[open]').count() == 0)
        await p1.wait_for_selector('h1:has-text("Session results")', timeout=20000); await p1.wait_for_timeout(1200)
        sidA = p1.url.split('/results/')[1]
        v = await p1.inner_text('#view')
        check('results: findings or no-findings', ('No significant findings' in v) or (await p1.locator('.finding').count() > 0))
        check('results: not a clinical diagnosis notice', 'not a clinical diagnosis' in v)
        check('results: safety notice', 'You do not have to handle this alone' in v)
        check('results: per-minute charts', await p1.locator('#r-session svg, #r-session canvas').count() >= 3, await p1.locator('#r-session svg, #r-session canvas').count())
        check('results: weekly summary', 'Previous week' in v and await p1.locator('#r-week svg, #r-week canvas').count() >= 2)
        await p1.screenshot(path=SH + 'qa_results.png', full_page=True)
        # B: finish without questionnaire
        await finish_session(p2, answer=False)
        await p2.wait_for_selector('h1:has-text("Session results")', timeout=20000); sidB = p2.url.split('/results/')[1]
        # ---------- history ----------
        await p1.goto(URL + '#/patient/history'); await p1.wait_for_timeout(800); h = await p1.inner_text('#view')
        check('history shows 1 session, duration & total', re.search(r'1\s+sessions? · total time monitored', h) is not None and re.search(r'\d+ min \d+ s', h) is not None, h[:300])
        # ---------- exports ----------
        for btn, kind in [('#h-sess', 'csv'), ('#h-min', 'csv'), ('#h-json', 'json')]:
            async with p1.expect_download() as di: await p1.click(btn)
            d = await di.value; path = await d.path(); data = open(path, encoding='utf-8-sig').read()
            if kind == 'csv':
                hdr = data.splitlines()[0]
                check(f'export {btn} csv english header', re.fullmatch(r'[a-z0-9_,]+', hdr) is not None and 'session_id' in hdr and len(data.splitlines()) >= 2, hdr[:120])
            else:
                j = json.loads(data); check('export json valid & own data only', j['subject_id'] and len(j['sessions']) == 1 and j['sessions'][0]['id'] == sidA, d.suggested_filename)
        await p1.goto(URL + '#/patient/results/' + sidA); await p1.wait_for_selector('#r-csv')
        async with p1.expect_download() as di: await p1.click('#r-csv')
        d = await di.value; hdr = open(await d.path(), encoding='utf-8-sig').read().splitlines()[0]
        check('results CSV english header', re.fullmatch(r'[a-z0-9_,]+', hdr) is not None, hdr[:100])
        # ---------- 2. isolation ----------
        print('A ids', await p1.evaluate("ASTRAVITA.data.sessions().map(s => s.id)"), 'B ids', await p2.evaluate("ASTRAVITA.data.sessions().map(s => s.id)"), 'sidA', sidA, 'sidB', sidB, flush=True)
        await p1.goto(URL + '#/patient/results/' + sidB); await p1.wait_for_timeout(2500)
        await p1.screenshot(path=SH + 'qa_isolation_url.png')
        tv = await p1.inner_text('#view'); check('A cannot open B session via URL', 'Session not found' in tv, sidB + ' | ' + p1.url + ' | ' + tv[:200])
        await p1.goto(URL + '#/doctor/console'); await p1.wait_for_timeout(800)
        check('patient redirected from doctor route', '#/patient/dashboard' in p1.url, p1.url)
        await p1.goto(URL + '#/doctor/patient/whatever'); await p1.wait_for_timeout(800)
        check('patient redirected from doctor record route', '#/patient/dashboard' in p1.url, p1.url)
        # same-browser sign-in A after B
        await signout(p2); await signin(p2, A_EMAIL, PW)
        await p2.goto(URL + '#/patient/history'); await p2.wait_for_timeout(800); h2 = await p2.inner_text('#view')
        check('A after B in same tab sees only own data', sidB not in await p2.content() and 'Bob' not in h2 and re.search(r'\b1\s+sessions?', h2) is not None)
        await signout(p2)
        # ---------- 3. linking ----------
        await p1.goto(URL + '#/patient/care'); await p1.wait_for_timeout(800)
        check('A sees link request', await p1.locator('[data-accept]').count() == 1)
        await p1.click('[data-accept]'); await p1.wait_for_timeout(1500)
        check('A linked', 'linked' in (await p1.inner_text('#view')).lower() and await p1.locator('#c-revoke').count()==1)
        await signin(p2, D_EMAIL, PW); await p2.wait_for_selector('h1:has-text("Crew triage")'); await p2.wait_for_timeout(1000)
        tri = await p2.inner_text('#view')
        check('doctor sees A in triage', 'Alice Quality' in tri and 'Bob' not in tri)
        await p2.screenshot(path=SH + 'qa_doc_console.png', full_page=True)
        await p2.goto(URL + '#/doctor/alerts'); await p2.wait_for_timeout(1200)
        check('doctor sees safety alert', 'Support requested' in await p2.inner_text('#view'))
        await p2.goto(URL + '#/doctor/console'); await p2.wait_for_timeout(800)
        await p2.click('.tcard >> text=Open record'); await p2.wait_for_selector('#pr-note', timeout=20000); await p2.wait_for_timeout(800)
        recurl = p2.url
        rec = await p2.inner_text('#view')
        check('doctor record shows A session', '1 sessions' in rec or '1 session' in rec, rec[:200])
        async with p2.expect_download() as di: await p2.click('#pr-csv')
        d = await di.value; hdr = open(await d.path(), encoding='utf-8-sig').read().splitlines()[0]
        check('doctor CSV english header', re.fullmatch(r'[a-z0-9_,]+', hdr) is not None, hdr[:80])
        await p2.fill('#pr-note-t', 'SHARED-NOTE-QA hydrate and rest'); await p2.click('#pr-note button[type=submit]'); await p2.wait_for_timeout(1500)
        await p2.fill('#pr-note-t', 'PRIVATE-NOTE-QA consider follow-up'); await p2.check('#pr-note-priv'); await p2.click('#pr-note button[type=submit]'); await p2.wait_for_timeout(1500)
        cm_val = await p2.eval_on_selector('#pr-cm-id', 'e => e.value')
        await p2.click('#pr-cm button[type=submit]'); await p2.wait_for_timeout(1500)
        await p2.screenshot(path=SH + 'qa_doc_record.png', full_page=True)
        await p1.goto(URL + '#/patient/dashboard'); await p1.wait_for_timeout(300)
        await p1.goto(URL + '#/patient/care'); await p1.wait_for_timeout(1200); care = await p1.inner_text('#view')
        check('A sees shared note only', 'SHARED-NOTE-QA' in care and 'PRIVATE-NOTE-QA' not in care and 'PRIVATE-NOTE-QA' not in await p1.content())
        check('A sees countermeasure', await p1.locator('[data-cm]').count() >= 1)
        await p1.screenshot(path=SH + 'qa_care.png', full_page=True)
        done = p1.locator('[data-cm][data-st="done"]')
        if await done.count():
            await done.first.click(); await p1.wait_for_timeout(1200)
        await p2.goto(URL + '#/doctor/console'); await p2.wait_for_timeout(300); await p2.goto(recurl); await p2.wait_for_selector('#pr-note'); await p2.wait_for_timeout(800)
        check('doctor sees countermeasure done', 'Done' in await p2.inner_text('#pr-cm >> xpath=..') or 'done' in (await p2.inner_text('#view')).lower())
        # revoke
        await p1.goto(URL + '#/patient/care'); await p1.wait_for_selector('#c-revoke'); await p1.click('#c-revoke')
        await p1.click('dialog[open] button[value=ok]'); await p1.wait_for_timeout(1500)
        await p2.goto(URL + '#/doctor/alerts'); await p2.wait_for_timeout(300); await p2.goto(URL + '#/doctor/console'); await p2.wait_for_timeout(1500)
        check('after revoke doctor triage empty', 'Alice' not in await p2.inner_text('#view'))
        await p2.goto(recurl); await p2.wait_for_timeout(1500)
        check('after revoke record URL blocked', 'Access not authorized' in await p2.inner_text('#view'))
        await signout(p2)
        # ---------- tamper ----------
        await p2.evaluate("""() => new Promise(res => { const r = indexedDB.open('astravita'); r.onsuccess = () => { const s = r.result.transaction('kv', 'readwrite').objectStore('kv'); const g = s.get('astravita:registry'); g.onsuccess = () => { const reg = g.result; for (const u of Object.values(reg.users)) if (u.pseudo_id && u.role === 'patient' && !u.demo && u.link_code === '%s') u.role = 'doctor'; s.put(reg, 'astravita:registry').onsuccess = () => res(true); }; }; })""" % codeB)
        await signin(p2, B_EMAIL, PW); await p2.wait_for_timeout(500)
        err = await p2.inner_text('#si-err') if '#/auth' in p2.url else ''
        check('tampered role blocked', '#/auth' in p2.url and 'integrity' in err.lower(), p2.url + ' ' + err)
        # ---------- skip link / keyboard ----------
        await p1.goto(URL + '#/patient/dashboard'); await p1.wait_for_timeout(800)
        await p1.focus('.skip-link'); sk = await p1.evaluate("document.activeElement.className")
        await p1.keyboard.press('Enter'); await p1.wait_for_timeout(800)
        check('skip link first & keeps route', 'skip-link' in sk and '#/patient/dashboard' in p1.url and await p1.evaluate("document.activeElement.id") == 'view', f'{sk} {p1.url} {await p1.evaluate("document.activeElement.id")}')
        print('elapsed', round(time.time() - t0))
        await b.close()
    print('\n'.join(sorted(set(errs))[:30]) or 'no console errors')
    print(f"{sum(r[1] for r in results)}/{len(results)} passed")

try:
    asyncio.run(main())
finally:
    print('\n'.join(sorted(set(errs))[:30]) or 'no console errors')
    print(f"{sum(r[1] for r in results)}/{len(results)} passed")
