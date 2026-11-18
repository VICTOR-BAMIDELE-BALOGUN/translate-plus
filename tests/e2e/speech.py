import json, re, urllib.parse, sys
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:8090/'
res=[]
def check(n,c,d=''):
    res.append((n,bool(c))); print(('PASS ' if c else 'FAIL ')+n+((' — '+str(d)) if d and not c else ''))

STUB = """
window.__speech = { instance: null, starts: 0 };
class FakeRecognition {
  constructor(){ this._l = {}; window.__speech.instance = this; }
  addEventListener(t,f){ (this._l[t] = this._l[t] || []).push(f); }
  removeEventListener(t,f){ this._l[t] = (this._l[t]||[]).filter(x=>x!==f); }
  _emit(t,ev){ (this._l[t]||[]).slice().forEach(f=>f(Object.assign({type:t,timeStamp:0},ev))); }
  start(){ window.__speech.starts++; this._emit('start',{}); }
  stop(){ this._emit('end',{}); }
  abort(){ this._emit('end',{}); }
}
window.webkitSpeechRecognition = FakeRecognition;
window.__say = function(text, isFinal){
  var i = window.__speech.instance; if(!i) return false;
  var r = [{transcript:text, confidence:0.9}]; r.isFinal = !!isFinal;
  i._emit('result', { resultIndex: 0, results: [r] });
  return true;
};
"""
def mock(route):
    q=urllib.parse.parse_qs(urllib.parse.urlparse(route.request.url).query)
    route.fulfill(status=200,content_type='application/json',
                  body=json.dumps([[['['+q['tl'][0]+'] '+q['q'][0], q['q'][0]]],None,'en']))

with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    c=b.new_context(viewport={'width':393,'height':851})
    c.add_init_script(STUB)
    c.route(re.compile('googleapis|mymemory'),mock)
    p=c.new_page(); errs=[]
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(URL); p.wait_for_selector('text=Translate')
    p.get_by_role('tab',name='Face').click()
    p.get_by_role('button',name=re.compile('^Speak ')).last.click()
    p.wait_for_timeout(400)
    check('microphone started', p.evaluate("window.__speech.starts") >= 1)

    # sentence one
    p.evaluate("window.__say('Good evening', false)"); p.wait_for_timeout(700)
    p.evaluate("window.__say('Good evening, is the flat still free?', true)")
    p.wait_for_selector('text=[it] Good evening, is the flat still free?', timeout=6000)
    check('first sentence is translated and shown', True)

    # sentence two must NOT erase sentence one
    p.evaluate("window.__say('I can come', false)"); p.wait_for_timeout(700)
    p.evaluate("window.__say('I can come tomorrow at five.', true)")
    p.wait_for_selector('text=[it] I can come tomorrow at five.', timeout=6000)
    check('previous sentence is still on screen', p.locator('text=[it] Good evening, is the flat still free?').count() >= 1)

    # a partial arriving just before a final must not overwrite the final
    p.evaluate("window.__say('Thank', false)")
    p.evaluate("window.__say('Thank you very much.', true)")
    p.wait_for_timeout(2500)
    shown = p.inner_text('body')
    check('stale partial does not replace the finished sentence',
          '[it] Thank you very much.' in shown and '[it] Thank' not in shown.replace('[it] Thank you very much.',''))
    check('all three sentences remain', shown.count('[it]') >= 3, shown.count('[it]'))
    p.screenshot(path='/tmp/shots/15-face-to-face-history.png')
    check('no page errors', len(errs)==0, errs[:3])
    b.close()
bad=[r for r in res if not r[1]]
print(f"{len(res)-len(bad)}/{len(res)} passed")
sys.exit(1 if bad else 0)
