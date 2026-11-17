import json, re, urllib.parse, sys
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:8090/'
res=[]
def check(n,c,d=''):
    res.append((n,bool(c))); print(('PASS ' if c else 'FAIL ')+n+((' — '+str(d)) if d and not c else ''))
# a stand-in engine that behaves like the real ones: informal unless the English is polite
def mock(route):
    q=urllib.parse.parse_qs(urllib.parse.urlparse(route.request.url).query)
    t=q['q'][0]
    out = 'Potrebbe dirmi se è libero?' if 'could you kindly' in t.lower() else 'Puoi dirmi se è libero?'
    route.fulfill(status=200,content_type='application/json',body=json.dumps([[[out,t]],None,'en']))
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    c=b.new_context(viewport={'width':393,'height':851}); c.route(re.compile('googleapis|mymemory'),mock)
    p=c.new_page(); errs=[]
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(URL); p.wait_for_selector('text=Translate')
    p.get_by_role('button',name=re.compile('^To:')).click(); p.wait_for_timeout(300)
    p.get_by_placeholder('Search languages').fill('italian'); p.get_by_text('Italian',exact=True).last.click(); p.wait_for_timeout(600)
    check('formality control appears for Italian', p.get_by_role('button',name='Formal', exact=True).count()==1)

    p.get_by_placeholder('Type or tap the mic and speak').fill('Can you tell me if it is free?')
    p.wait_for_timeout(1500)
    check('auto leaves the engine to pick', 'Puoi dirmi' in p.inner_text('body'))
    check('and says it came out informal', re.search(r'informal', p.inner_text('body'), re.I) is not None)

    p.get_by_role('button',name='Formal', exact=True).click(); p.wait_for_timeout(1800)
    body=p.inner_text('body')
    check('formal steers the engine to Lei', 'Potrebbe dirmi' in body, body[:160])
    check('and reports it as formal', re.search(r'ITALIAN · formal', body, re.I) is not None)
    p.screenshot(path='/tmp/shots/22-formal.png')

    p.get_by_role('button',name='Informal').click(); p.wait_for_timeout(1800)
    check('informal goes back to tu', 'Puoi dirmi' in p.inner_text('body'))

    # English target: nothing to choose, so the control is hidden
    p.get_by_role('button',name=re.compile('^To:')).click(); p.wait_for_timeout(300)
    p.get_by_placeholder('Search languages').fill('english'); p.get_by_text('English',exact=True).last.click(); p.wait_for_timeout(700)
    check('control hidden where the language has no formal form', p.get_by_role('button',name='Formal', exact=True).count()==0)
    check('no errors', len(errs)==0, errs[:3])
    b.close()
bad=[r for r in res if not r[1]]
print(f"{len(res)-len(bad)}/{len(res)} passed")
sys.exit(1 if bad else 0)
