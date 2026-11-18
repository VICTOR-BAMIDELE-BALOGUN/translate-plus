import re, sys
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:8090/'
res=[]
def check(n,c,d=''):
    res.append((n,bool(c))); print(('PASS ' if c else 'FAIL ')+n+((' — '+str(d)) if d and not c else ''))
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    c=b.new_context(viewport={'width':393,'height':900},device_scale_factor=2,permissions=['clipboard-read','clipboard-write'])
    p=c.new_page(); errs=[]
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(URL); p.wait_for_selector('text=Translate')
    p.get_by_role('tab',name='Learn').click(); p.wait_for_timeout(600)
    check('learn tab opens with Italian', 'Learn Italian' in p.inner_text('body'))
    check('topics are listed', p.get_by_text('Renting a flat').count()==1 and p.get_by_text('University').count()>=1)
    p.get_by_text('Renting a flat').click(); p.wait_for_timeout(400)
    check('opening a topic shows its phrases', "L'appartamento è ancora libero?" in p.inner_text('body'))
    p.screenshot(path='/tmp/shots/25-learn-phrases.png')
    # search works across both languages
    p.get_by_placeholder('Search the phrasebook').fill('pharmacy'); p.wait_for_timeout(500)
    check('search finds by English', 'farmacia' in p.inner_text('body').lower())
    p.get_by_placeholder('Search the phrasebook').fill('scusi'); p.wait_for_timeout(500)
    check('search finds by Italian', 'Excuse me' in p.inner_text('body'))
    p.get_by_placeholder('Search the phrasebook').fill(''); p.wait_for_timeout(400)
    # practice mode hides the Italian
    p.get_by_role('button',name='Practice').click(); p.wait_for_timeout(400)
    p.get_by_text('The first twenty').click(); p.wait_for_timeout(400)
    check('practice mode covers the Italian', 'Tap to show' in p.inner_text('body') and 'Buongiorno' not in p.inner_text('body'))
    p.get_by_text('Tap to show').first.click(); p.wait_for_timeout(300)
    check('tapping reveals one phrase', 'Buongiorno' in p.inner_text('body'))
    # sounds, notes and resources
    p.get_by_role('button',name='Sounds').click(); p.wait_for_timeout(400)
    check('pronunciation section', 'gn' in p.inner_text('body') and 'canyon' in p.inner_text('body'))
    p.get_by_role('button',name='Notes').click(); p.wait_for_timeout(400)
    check('notes include the Lei/tu warning', 'Lei and tu' in p.inner_text('body'))
    p.get_by_role('button',name='Free courses').click(); p.wait_for_timeout(400)
    body=p.inner_text('body')
    check('free courses listed, CPIA included', 'CPIA' in body and 'Language Transfer' in body)
    check('every one is marked free', body.count('FREE')>=5, body.count('FREE'))
    p.screenshot(path='/tmp/shots/26-learn-resources.png')
    check('no errors', len(errs)==0, errs[:3])
    b.close()
bad=[r for r in res if not r[1]]
print(f"{len(res)-len(bad)}/{len(res)} passed")
sys.exit(1 if bad else 0)
