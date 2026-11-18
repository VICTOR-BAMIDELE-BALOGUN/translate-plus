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
    for t in ['Translate', 'Face', 'Captions', 'Photo', 'Learn', 'Chats', 'Settings']:
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
    a.get_by_text(re.compile(r'^Recent \(')).click()
    check('history saved after use', a.locator('text=[yo] Ciao, come stai?').count() >= 1)
    a.get_by_text(re.compile(r'^Recent \(')).click()

    # both panes scroll on their own, and the layout can be switched
    long_text = 'Buongiorno. ' * 60
    a.get_by_placeholder('Type or tap the mic and speak').fill(long_text)
    a.wait_for_timeout(1200)
    scrolls = a.evaluate('''() => {
      const els = [...document.querySelectorAll('div,textarea')];
      return els.filter(e => e.scrollHeight > e.clientHeight + 20 && e.clientHeight > 40).length;
    }''')
    check('long text produces scrollable panes', scrolls >= 1, scrolls)
    check('layout switch is on the translate tab', a.get_by_role('button', name='Side by side').count() == 1)
    a.get_by_role('button', name='Side by side').click()
    a.wait_for_timeout(400)
    check('narrow phone explains why it stays stacked', a.locator('text=Not enough width').count() == 1)
    a.set_viewport_size({'width': 900, 'height': 700})
    a.wait_for_timeout(500)
    check('wide screen puts the panes side by side', a.locator('text=Not enough width').count() == 0)
    a.get_by_role('button', name='Stacked').click()
    a.set_viewport_size({'width': 393, 'height': 851})
    a.get_by_placeholder('Type or tap the mic and speak').fill('')
    a.wait_for_timeout(300)
    a.screenshot(path='1-translate.png')

    # 3 face to face
    tab(a, 'Face')
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
    a.get_by_role('button', name='Ocean theme').click()
    a.wait_for_timeout(400)
    check('theme choices are listed', a.get_by_role('button', name=re.compile(' theme$')).count() >= 6)
    bg = a.evaluate("getComputedStyle(document.body).backgroundColor")
    check('picking a theme repaints the app', bg not in ('rgba(0, 0, 0, 0)', 'rgb(14, 21, 19)'), bg)
    a.get_by_role('button', name='My cloned voice').click()
    check('clone voice guarded until a voice exists', a.locator('text=Create a cloned voice below first.').count() == 1)
    # offline translation card
    check('offline mode chips present', a.get_by_role('button', name='Offline first').count() == 1 and a.get_by_role('button', name='Offline only').count() == 1)
    a.get_by_role('button', name='Offline only').click()
    tab(a, 'Translate')
    a.get_by_placeholder('Type or tap the mic and speak').fill('Ciao')
    a.wait_for_timeout(1200)
    check('offline-only refuses auto-detect with a clear message', a.locator('text=Offline mode needs a specific language').count() == 1)
    tab(a, 'Settings')
    a.get_by_role('button', name='Offline first').click()
    tab(a, 'Translate')
    a.get_by_placeholder('Type or tap the mic and speak').fill('Buongiorno amico')
    a.wait_for_selector('text=[yo] Buongiorno amico', timeout=6000)
    check('offline-first falls back to online when no model is downloaded', True)
    tab(a, 'Settings')
    set_relay(a)
    a.wait_for_timeout(600)
    a.screenshot(path='4-settings.png', full_page=False)
    a.reload(); a.wait_for_selector('text=Translate')
    tab(a, 'Settings')
    check('chosen theme survives a restart', a.evaluate("getComputedStyle(document.body).backgroundColor") == bg, bg)
    check('settings persist after restart', a.locator('input[value="Victor"]').count() == 1 and a.locator('text=1.1×').count() == 1
          and a.locator('input[value="ws://127.0.0.1:18883/mqtt"]').count() == 1)

    # 6 chat between two devices
    b = new_page(browser, errB)
    tab(b, 'Settings'); b.get_by_placeholder('Your name in chats').fill('Marco')
    set_relay(b)
    tab(a, 'Chats')
    a.get_by_placeholder('Name (e.g. Landlord, Mum)').fill('Marco')
    a.get_by_role('button', name='Create and share invite code').click()
    a.wait_for_selector('text=Invite Marco', timeout=10000)
    note = a.locator('textarea').first
    note.wait_for()
    a.wait_for_timeout(1500)
    check('creating a chat offers a note in the other language', len(note.input_value()) > 40, note.input_value()[:60])
    check('a machine-translated note is marked as such', a.get_by_text('machine-translated').count() == 1)
    a.get_by_role('button', name='Close').click()
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

    # 7b a guest joining by shared link, in a browser, with nothing installed
    g = browser.new_context(viewport={'width': 393, 'height': 851})
    g.route(re.compile(r'translate\.googleapis\.com|mymemory'), mock)
    gp = g.new_page()
    gerr = []
    gp.on('pageerror', lambda e: gerr.append(str(e)))
    gp.goto(URL); gp.wait_for_selector('text=Translate')
    set_relay(gp)  # same origin, so the guest keeps this when the link opens
    gp.wait_for_timeout(700)  # the store writes on a short debounce
    gp.goto(URL + '#j=' + code.replace('-', '') + '&n=Victor&l=it')
    gp.reload()  # a hash-only change does not reload a single-page app
    gp.wait_for_selector('text=Victor wants to talk with you', timeout=10000)
    check('shared link opens a join page naming the inviter', True)
    check('link pre-selects the language it was sent with', gp.get_by_role('button', name=re.compile('Italian')).count() >= 1)
    gp.get_by_role('button', name=re.compile('^Join in')).click()
    gp.wait_for_selector('text=Connected', timeout=10000)
    check('guest joins the encrypted room from the link', True)

    a.get_by_placeholder('Message in your language').fill('Good evening, are you still free tomorrow?')
    a.get_by_role('button', name='Send').click()
    gp.wait_for_selector('text=[it] Good evening, are you still free tomorrow?', timeout=10000)
    check('guest sees the host message in their own language', True)

    gp.get_by_placeholder(re.compile('^Type in')).fill('Certo, a che ora?')
    gp.get_by_role('button', name='Send').click()
    a.wait_for_selector('text=[en] Certo, a che ora?', timeout=10000)
    check('host receives the guest reply, translated back', True)
    gp.screenshot(path='guest.png')
    check('guest page threw no errors', len(gerr) == 0, gerr[:3])

    # a link with a damaged code must not open a room
    bad = browser.new_context(viewport={'width': 393, 'height': 851})
    bp = bad.new_page()
    bp.goto(URL + '#j=ABC'); bp.wait_for_selector('text=Translate', timeout=10000)
    check('a broken link falls back to the normal app', bp.get_by_role('tab', name='Chats').count() == 1)
    bad.close()

    # 8 offline handling
    a.get_by_role('button', name='‹ Back').click()
    check('chat list shows last message', a.locator('text=[en] Certo, a che ora?').count() >= 1)
    a.reload(); a.wait_for_selector('text=Translate'); tab(a, 'Chats')
    check('chats persist after restart', a.get_by_text('Marco', exact=True).count() >= 1)

    # 8b photo translation and the voice-clone key, both web-specific
    tab(a, 'Photo')
    check('photo tab opens', a.locator('text=Photograph a sign').count() == 1)
    check('photo tab offers camera and gallery', a.get_by_role('button', name='Take a photo').count() == 1 and a.get_by_role('button', name='Choose a photo').count() == 1)
    tab(a, 'Settings')
    a.get_by_placeholder(re.compile('Paste')).fill('fish-test-key-123')
    a.get_by_role('button', name='Save').first.click()
    a.wait_for_timeout(600)
    check('Fish Audio key can be saved in the browser', a.locator('text=Fish Audio API key · saved').count() == 1)
    a.reload(); a.wait_for_selector('text=Translate'); tab(a, 'Settings')
    check('saved key survives a restart', a.locator('text=Fish Audio API key · saved').count() == 1)

    # 9 installable web app
    w = browser.new_context(viewport={'width': 393, 'height': 851})
    wp = w.new_page()
    werr = []
    wp.on('pageerror', lambda e: werr.append(str(e)))
    wp.goto(URL); wp.wait_for_selector('text=Translate'); wp.wait_for_timeout(2500)
    sw = wp.evaluate("async () => { const r = await navigator.serviceWorker.getRegistration(); return r && r.active ? 'active' : 'no'; }")
    check('service worker installs', sw == 'active', sw)
    mf = wp.evaluate("async () => { const r = await fetch('./manifest.json'); const j = await r.json(); return [j.display, j.icons.filter(i => i.purpose === 'maskable').length]; }")
    check('manifest is installable (standalone + maskable icon)', mf[0] == 'standalone' and mf[1] >= 1, mf)
    # the web build knows its own address, so call links need no configuration there
    wp.get_by_role('tab', name='Settings').click()
    check('call links work with no setup on the web', wp.locator('text=Links look like').count() == 1)
    w.set_offline(True)
    wp.reload()
    opened = True
    try:
        wp.wait_for_selector('text=Translate', timeout=8000)
    except Exception:
        opened = False
    check('installed app opens with no connection', opened)
    w.set_offline(False)
    check('web app threw no errors', len(werr) == 0, werr[:3])
    w.close()

    print('--- console errors A:', errA[:8]); print('--- console errors B:', errB[:8])
    browser.close()

fails = [r for r in results if not r[1]]
print(f'\n{len(results) - len(fails)}/{len(results)} passed')
sys.exit(1 if fails else 0)
