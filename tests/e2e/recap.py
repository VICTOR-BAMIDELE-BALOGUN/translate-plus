import json, re, urllib.parse, sys
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:8090/'
res=[]
def check(n,c,d=''):
    res.append((n,bool(c))); print(('PASS ' if c else 'FAIL ')+n+((' — '+str(d)) if d and not c else ''))
IT={'Is the flat still free?':"L'appartamento è ancora libero?",
    'Can I come and see it?':'Posso venire a vederlo?'}
EN={'Sì, venga domani alle 17:30 in via Giordano Bruno 12. Il canone è 450 euro.':'Yes, come tomorrow at 17:30 at via Giordano Bruno 12. The rent is 450 euros.'}
def mock(route):
    q=urllib.parse.parse_qs(urllib.parse.urlparse(route.request.url).query)
    t=q['q'][0]
    route.fulfill(status=200,content_type='application/json',body=json.dumps([[[IT.get(t) or EN.get(t) or t,t]],None,'it']))
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    c=b.new_context(viewport={'width':393,'height':851},device_scale_factor=2,permissions=['clipboard-read','clipboard-write'])
    c.route(re.compile('googleapis|mymemory'),mock)
    p=c.new_page(); errs=[]
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(URL); p.wait_for_selector('text=Translate')
    p.get_by_role('tab',name='Captions').click(); p.wait_for_timeout(400)
    check('no recap offered before anything is said', p.get_by_role('button',name='Recap').count()==0)
    for t in ['Is the flat still free?','Can I come and see it?']:
        p.get_by_placeholder(re.compile('^Reply in')).fill(t)
        p.get_by_role('button',name='Say').click(); p.wait_for_timeout(900)
    check('recap appears once there is something to recap', p.get_by_role('button',name='Recap').count()==1)
    p.get_by_role('button',name='Recap').click(); p.wait_for_selector('text=Key details', timeout=8000)
    check('recap sheet opens with the transcript', 'Captions session' in p.inner_text('body'))
    body=p.inner_text('body')
    check('transcript holds both lines', "L'appartamento" in body and 'Posso venire' in body, body[:200])
    p.screenshot(path='/tmp/shots/24-recap.png')
    p.get_by_role('button',name='Copy').click(); p.wait_for_timeout(400)
    clip=p.evaluate("navigator.clipboard.readText()")
    check('copied recap has a transcript', 'Conversation' in clip and 'Posso venire' in clip, clip[:120])
    check('no errors', len(errs)==0, errs[:3])
    b.close()
bad=[r for r in res if not r[1]]
print(f"{len(res)-len(bad)}/{len(res)} passed")
sys.exit(1 if bad else 0)
