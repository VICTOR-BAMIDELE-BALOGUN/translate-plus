import json, re, urllib.parse, sys
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:8090/'
res=[]
def check(n,c,d=''):
    res.append((n,bool(c))); print(('PASS ' if c else 'FAIL ')+n+((' — '+str(d)) if d and not c else ''))
def mock(route):
    q=urllib.parse.parse_qs(urllib.parse.urlparse(route.request.url).query)
    route.fulfill(status=200,content_type='application/json',body=json.dumps([[['[tradotto] '+q['q'][0],q['q'][0]]],None,'en']))
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    c=b.new_context(viewport={'width':393,'height':851},device_scale_factor=2,permissions=['clipboard-read','clipboard-write'])
    c.route(re.compile('googleapis|mymemory'),mock)
    p=c.new_page(); errs=[]
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(URL); p.wait_for_selector('text=Translate')
    # the other person speaks Italian
    p.get_by_role('tab',name='Settings').click()
    p.get_by_role('button',name=re.compile('^Translate to')).click(); p.wait_for_timeout(300)
    p.get_by_placeholder('Search languages').fill('italian'); p.get_by_text('Italian',exact=True).last.click(); p.wait_for_timeout(600)
    p.get_by_role('tab',name='Chats').click()
    p.get_by_placeholder('Name (e.g. Landlord, Mum)').fill('Signora Rossi')
    p.get_by_role('button',name='Create and share invite code').click()
    p.wait_for_selector('text=Invite Signora Rossi', timeout=8000)
    check('invite sheet opens', True)
    note=p.locator('textarea').first.input_value()
    check('note is in Italian, written not translated', note.startswith('Buongiorno') and 'tradotto' not in note, note[:120])
    check('polite by default', p.get_by_role('button',name='Polite').count()==1)
    check('link is shown with the note', '#j=' in p.inner_text('body'))
    p.screenshot(path='/tmp/shots/23-invite-italian.png')
    p.get_by_role('button',name='Friendly').click(); p.wait_for_timeout(500)
    check('friendly version is different Italian', p.locator('textarea').first.input_value().startswith('Ciao!'))
    p.get_by_role('button',name='Copy').click(); p.wait_for_timeout(500)
    clip=p.evaluate("navigator.clipboard.readText()")
    check('copied text has the note and the link', 'Ciao!' in clip and '#j=' in clip, clip[:120])
    p.get_by_role('button',name='Close').click(); p.wait_for_timeout(600)
    check('closing opens the conversation', p.locator('text=Invite code:').count()==1)
    check('no errors', len(errs)==0, errs[:3])
    b.close()
bad=[r for r in res if not r[1]]
print(f"{len(res)-len(bad)}/{len(res)} passed")
sys.exit(1 if bad else 0)
