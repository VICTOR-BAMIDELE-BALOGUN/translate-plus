import json, re, sys, urllib.parse
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:8090/'
results = []
def check(name, cond, detail=''):
    results.append((name, bool(cond), detail))
    print(('PASS ' if cond else 'FAIL ') + name + (' — ' + str(detail) if detail and not cond else ''))

def mock(route):
    u = urllib.parse.urlparse(route.request.url); q = urllib.parse.parse_qs(u.query)
    if 'googleapis' in u.netloc:
        text = q['q'][0]; tl = q['tl'][0]; sl = q['sl'][0]
        route.fulfill(status=200, content_type='application/json',
                      body=json.dumps([[[f'[{tl}] {text}', text]], None, 'it' if sl == 'auto' else sl]))
    else:
        route.fulfill(status=200, content_type='application/json',
                      body=json.dumps({'responseStatus': 200, 'responseData': {'translatedText': '[mm] ' + q['q'][0]}}))

def new_page(browser, errors):
    ctx = browser.new_context(viewport={'width': 393, 'height': 851}, device_scale_factor=2)
    ctx.route(re.compile(r'translate\.googleapis\.com|mymemory'), mock)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.goto(URL); page.wait_for_selector('text=Translate', timeout=15000)
    return page

def tab(page, label): page.get_by_role('tab', name=label).click()

def set_relay(page):
    tab(page, 'Settings')
    box = page.locator('input[value*="broker.emqx.io"]')
    box.fill('ws://127.0.0.1:18883/mqtt')
    page.get_by_role('button', name='Save').last.click()

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    errA, errB = [], []
    a = new_page(browser, errA)

    # 1 shell
    for t in ['Translate', 'Face to Face', 'Captions', 'Chats', 'Settings']:
        check(f'tab present: {t}', a.get_by_role('tab', name=t).count() == 1)

    # 2 translate
    a.get_by_placeholder('Type or tap the mic and speak').fill('Ciao, come stai?')
    a.wait_for_selector('text=[it] Ciao, come stai?', timeout=5000)
    check('text translates into target language', True)
    check('auto-detect label shown', a.locator('text=Detected: Italian').count() == 1)
    # language picker with search
    a.get_by_role('button', name=re.compile('^To:')).click()
    a.get_by_placeholder('Search languages').fill('yor')
    a.get_by_text('Yoruba', exact=True).click()
    a.wait_for_selector('text=[yo] Ciao, come stai?', timeout=5000)
    check('language picker + search changes target', True)
    a.get_by_role('button', name='Listen').click()
    a.wait_for_timeout(300)
    a.get_by_role('button', name='Clear').click()
    check('history saved after use', a.locator('text=Recent').count() == 1 and a.locator('text=[yo] Ciao, come stai?').count() >= 1)
    a.screenshot(path='1-translate.png')

    # 3 face to face
    tab(a, 'Face to Face')
    check('face to face shows both sides', a.get_by_role('button', name=re.compile('^Speak ')).count() == 2)
    a.screenshot(path='2-face.png')

    # 4 captions + reply
    tab(a, 'Captions')
    a.get_by_placeholder(re.compile('^Reply in')).fill('Where is the station?')
    a.get_by_role('button', name='Say').click()
    a.wait_for_selector('text=[yo] Where is the station?', timeout=5000)
    check('captions reply is translated and shown', True)
    a.get_by_role('button', name='Use on calls').click()
    check('call help opens', a.locator('text=Captions on WhatsApp and other app calls').count() == 1)
    a.get_by_role('button', name='Got it').click()
    a.get_by_role('button', name='Start captions').click(); a.wait_for_timeout(600)
    a.screenshot(path='3-captions.png')
    check('mic start does not crash (desktop browser has no phone mic service)', a.get_by_role('tab', name='Captions').count() == 1)

    # 5 settings + persistence
    tab(a, 'Settings')
    a.get_by_placeholder('Your name in chats').fill('Victor')
    a.get_by_role('button', name='+').first.click()
    check('speed stepper works', a.locator('text=1.1×').count() == 1)
    a.get_by_role('button', name='Light').click()
    a.get_by_role('button', name='My cloned voice').click()
    check('clone voice guarded until a voice exists', a.locator('text=Create a cloned voice below first.').count() == 1)
    set_relay(a)
    a.wait_for_timeout(600)
    a.screenshot(path='4-settings.png', full_page=False)
    a.reload(); a.wait_for_selector('text=Translate')
    tab(a, 'Settings')
    check('settings persist after restart', a.locator('input[value="Victor"]').count() == 1 and a.locator('text=1.1×').count() == 1
          and a.locator('input[value="ws://127.0.0.1:18883/mqtt"]').count() == 1)

    # 6 chat between two devices
    b = new_page(browser, errB)
    tab(b, 'Settings'); b.get_by_placeholder('Your name in chats').fill('Marco')
    set_relay(b)
    tab(a, 'Chats')
    a.get_by_placeholder('Name (e.g. Landlord, Mum)').fill('Marco')
    a.get_by_role('button', name='Create and share invite code').click()
    a.wait_for_selector('text=Invite code:')
    code = re.search(r'[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}', a.locator('text=Invite code:').first.inner_text()).group(0)
    check('room created with invite code', bool(code), code)
    a.wait_for_selector('text=Connected · waiting for the other person', timeout=8000)
    check('device A connects to relay', True)

    tab(b, 'Chats')
    b.get_by_placeholder('XXXX-XXXX-XXXX-XXXX').fill('abc')
    b.get_by_role('button', name='Join').click()
    check('short code rejected', b.locator('text=That code looks too short').count() == 1)
    b.get_by_placeholder('XXXX-XXXX-XXXX-XXXX').fill(code.lower())
    b.get_by_role('button', name='Join').click()
    a.wait_for_selector('text=Marco online', timeout=8000)
    b.wait_for_selector('text=Victor online', timeout=8000)
    check('both devices see each other online', True)

    a.get_by_placeholder('Message in your language').fill('Hello Marco, is the flat still free?')
    a.get_by_role('button', name='Send').click()
    b.wait_for_selector('text=[en] Hello Marco, is the flat still free?', timeout=8000)
    check('B receives A message, auto-translated', True)
    check('B sees original under translation', b.get_by_text('Hello Marco, is the flat still free?', exact=True).count() == 1)
    b.get_by_placeholder('Message in your language').fill('Sì, è ancora libero 👍')
    b.get_by_role('button', name='Send').click()
    a.wait_for_selector('text=[en] Sì, è ancora libero 👍', timeout=8000)
    check('A receives B reply (accents + emoji intact)', True)

    # 7 call signalling
    a.get_by_role('button', name='Call', exact=True).click(); a.wait_for_timeout(800)
    in_call = a.locator('text=Translated call is on').count() == 1
    mic_err = a.locator('text=Microphone permission is needed').count() == 1
    check('call never stays "on" when the microphone is refused', not (in_call and mic_err), 'in_call=%s mic_err=%s' % (in_call, mic_err))
    b.wait_for_timeout(500)
    check('other device is not left showing "in call"', b.locator('text=in call').count() == 0)
    a.screenshot(path='5-chat-a.png'); b.screenshot(path='6-chat-b.png')

    import subprocess
    subprocess.run(['node', '/tmp/mq/inject.mjs', code], check=True, capture_output=True)
    b.wait_for_selector('text=[en] Pronto, chi parla?', timeout=8000)
    check('spoken call phrase from another phone arrives translated', b.locator('text=Giulia · call').count() == 1)
    check('message encrypted with a different code is ignored', b.locator('text=wrong key').count() == 0)

    # 8 offline handling
    a.get_by_role('button', name='‹ Back').click()
    check('chat list shows last message', a.locator('text=[en] Pronto, chi parla?').count() == 1)
    a.reload(); a.wait_for_selector('text=Translate'); tab(a, 'Chats')
    check('chats persist after restart', a.get_by_text('Marco', exact=True).count() >= 1)

    print('--- console errors A:', errA[:8]); print('--- console errors B:', errB[:8])
    browser.close()

fails = [r for r in results if not r[1]]
print(f'\n{len(results) - len(fails)}/{len(results)} passed')
sys.exit(1 if fails else 0)
