import json, re, urllib.parse, sys
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:8090/'
res=[]
def check(n,c,d=''):
    res.append((n,bool(c))); print(('PASS ' if c else 'FAIL ')+n+((' — '+str(d)) if d and not c else ''))
calls=[]
def mock(route):
    q=urllib.parse.parse_qs(urllib.parse.urlparse(route.request.url).query)
    t=q['q'][0]; sl=q['sl'][0]
    calls.append((sl,t))
    route.fulfill(status=200,content_type='application/json',body=json.dumps([[['['+sl+'] '+t,t]],None,sl]))
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    c=b.new_context(viewport={'width':393,'height':880},device_scale_factor=2)
    c.route(re.compile('googleapis|mymemory'),mock)
    p=c.new_page(); errs=[]
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(URL); p.wait_for_selector('text=Translate')
    # target French so neither half of the mixed text is already the target
    p.get_by_role('button',name=re.compile('^To:')).click(); p.wait_for_timeout(300)
    p.get_by_placeholder('Search languages').fill('french'); p.get_by_text('French',exact=True).last.click(); p.wait_for_timeout(600)
    mixed = ("Buongiorno, le scrivo per l'appartamento in via Roma. "
             "I am an international student at the university here. "
             "Vorrei sapere se è ancora libero e quanto costa al mese.")
    calls.clear()
    p.get_by_placeholder('Type or tap the mic and speak').fill(mixed)
    p.wait_for_timeout(2500)
    body=p.inner_text('body')
    low = body.lower()  # the label is uppercased by CSS
    check('both languages are reported', 'italian + english' in low or 'english + italian' in low, body[:200])
    langs=sorted({c[0] for c in calls})
    check('each block is sent with its own source language', langs==['en','it'], langs)
    check('three blocks, not one request', len(calls)==3, len(calls))
    check('the translation keeps all three blocks', body.count('[it]')==2 and body.count('[en]')==1,
          (body.count('[it]'), body.count('[en]')))
    p.screenshot(path='/tmp/shots/27-mixed-languages.png')

    # single-language text must still cost exactly one request
    calls.clear()
    p.get_by_placeholder('Type or tap the mic and speak').fill('Buongiorno, come sta oggi?')
    p.wait_for_timeout(2000)
    check('plain text is still a single request', len(calls)==1, len(calls))

    # captions: more than one expected language
    p.get_by_role('tab',name='Captions').click(); p.wait_for_timeout(500)
    check('listening-for row is shown', 'Listening for:' in p.inner_text('body'))
    p.get_by_role('button',name=re.compile('Detect language')).last.click(); p.wait_for_timeout(400)
    p.get_by_placeholder('Search languages').fill('english'); p.get_by_text('English',exact=True).last.click(); p.wait_for_timeout(600)
    body=p.inner_text('body')
    check('a second language can be added', 'A phone hears one language at a time' in body, body[:160])
    check('both appear as chips', p.get_by_role('button',name='Listen in English').count()==1)
    p.screenshot(path='/tmp/shots/28-captions-languages.png')
    check('no errors', len(errs)==0, errs[:3])
    b.close()
bad=[r for r in res if not r[1]]
print(f"{len(res)-len(bad)}/{len(res)} passed")
sys.exit(1 if bad else 0)
