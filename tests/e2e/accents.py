import re, sys
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:8090/'
res=[]
def check(n,c,d=''):
    res.append((n,bool(c))); print(('PASS ' if c else 'FAIL ')+n+((' — '+str(d)) if d and not c else ''))
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    c=b.new_context(viewport={'width':393,'height':950},device_scale_factor=2)
    p=c.new_page(); errs=[]
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(URL); p.wait_for_selector('text=Translate')
    p.get_by_role('tab',name='Settings').click(); p.wait_for_timeout(900)
    body=p.inner_text('body')
    check('accent section is there', 'accent' in body.lower())  # labels are uppercased by CSS
    check('the Nigerian option is offered for English', p.get_by_role('button',name=re.compile('English, Nigeria')).count()==1)
    check('the honest limit is stated', 'no model for Italian as spoken by a Nigerian' in body)
    check('tones are explained', 'tone carries meaning' in body)
    p.get_by_role('button',name=re.compile('English, Nigeria')).click(); p.wait_for_timeout(600)
    p.get_by_text('Accent').first.scroll_into_view_if_needed(); p.wait_for_timeout(300)
    p.screenshot(path='/tmp/shots/29-accents.png')
    p.reload(); p.wait_for_selector('text=Translate'); p.get_by_role('tab',name='Settings').click(); p.wait_for_timeout(900)
    saved = p.evaluate("JSON.parse(localStorage.getItem('translateplus.state.v1') || '{}').settings?.accents || {}")
    check('the choice survives a restart', saved.get('en') == 'en-NG', saved)
    check('no errors', len(errs)==0, errs[:3])
    b.close()
bad=[r for r in res if not r[1]]
print(f"{len(res)-len(bad)}/{len(res)} passed")
sys.exit(1 if bad else 0)
