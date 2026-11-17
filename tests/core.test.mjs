import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveRoom, seal, open, toBase64, fromBase64, utf8Encode, utf8Decode, generateCode, isValidCode, formatCode, normalizeCode, buildInviteLink, parseInvite } from '../src/services/codec.ts';
import { translate, parseGoogle, parseMyMemory, clearTranslateCache, chooseRoute, splitForLength } from '../src/services/translate.ts';

test('utf8 and base64 round-trip, including emoji and non-Latin text', () => {
  for (const s of ['hello', 'Ciao, come stai? È tutto a posto', 'Ẹ káàárọ̀', '你好 🌍👋🏾', '']) {
    assert.equal(utf8Decode(utf8Encode(s)), s);
    assert.deepEqual([...utf8Encode(s)], [...new TextEncoder().encode(s)]);
  }
  for (let n = 0; n < 40; n++) {
    const b = new Uint8Array(n).map((_, i) => (i * 37 + n) % 256);
    assert.equal(toBase64(b), Buffer.from(b).toString('base64'));
    assert.deepEqual([...fromBase64(toBase64(b))], [...b]);
  }
});

test('room encryption: same code opens, different code cannot', () => {
  const code = generateCode();
  assert.ok(isValidCode(code));
  assert.match(code, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
  const a = deriveRoom(code);
  const b = deriveRoom(code.toLowerCase().replace(/-/g, ' '));
  assert.equal(a.topic, b.topic);
  const msg = { id: '1', text: 'Buongiorno 👋', kind: 'chat' };
  const sealed = seal(msg, a.key);
  assert.ok(!sealed.includes('Buongiorno'));
  assert.deepEqual(open(sealed, b.key), msg);
  assert.equal(open(sealed, deriveRoom(generateCode()).key), null);
  assert.equal(open('not-base64!!', a.key), null);
  assert.notEqual(seal(msg, a.key), sealed); // fresh nonce each time
  assert.ok(!a.topic.includes(normalizeCode(code)));
  assert.equal(formatCode('abcd1234efgh5678'), 'ABCD-1234-EFGH-5678');
  assert.equal(isValidCode('abc'), false);
});

test('parsers', () => {
  assert.deepEqual(parseGoogle([[['Hello ', 'Ciao ', null], ['world', 'mondo', null]], null, 'it']), { text: 'Hello world', detected: 'it', provider: 'google' });
  assert.throws(() => parseGoogle({}));
  assert.equal(parseMyMemory({ responseStatus: 200, responseData: { translatedText: 'Hi' } }).text, 'Hi');
  assert.throws(() => parseMyMemory({ responseStatus: 403, responseDetails: 'LIMIT', responseData: { translatedText: '' } }), /LIMIT/);
});

test('translate: caches, falls back to second provider, reports total failure', async () => {
  const calls = [];
  const ok = (body) => ({ ok: true, status: 200, json: async () => body });
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('googleapis')) return ok([[['Hello', 'Ciao']], null, 'it']);
    return ok({ responseStatus: 200, responseData: { translatedText: 'Hello (mm)' } });
  };
  clearTranslateCache();
  assert.equal((await translate('Ciao', 'auto', 'en')).text, 'Hello');
  assert.equal((await translate(' Ciao ', 'auto', 'en')).text, 'Hello');
  assert.equal(calls.length, 1, 'second call served from cache');
  assert.ok(calls[0].includes('sl=auto') && calls[0].includes('tl=en') && calls[0].includes('q=Ciao'));
  assert.equal((await translate('', 'auto', 'en')).text, '');
  assert.equal((await translate('same', 'en', 'en')).text, 'same');

  globalThis.fetch = async (url) => {
    if (String(url).includes('googleapis')) return { ok: false, status: 429, json: async () => ({}) };
    return ok({ responseStatus: 200, responseData: { translatedText: 'Hello (mm)' } });
  };
  clearTranslateCache();
  const fb = await translate('Ciao', 'it', 'en');
  assert.equal(fb.provider, 'mymemory');

  globalThis.fetch = async () => { throw new Error('offline'); };
  clearTranslateCache();
  await assert.rejects(() => translate('Ciao', 'it', 'en'), /Translation unavailable/);
});

test('offline/online routing', () => {
  const sup = (c) => ['en', 'it', 'fr'].includes(c);
  const have = ['en', 'it'];

  // online mode never uses the on-device model, even when it is ready
  assert.equal(chooseRoute('online', 'it', 'en', sup, have).use, 'online');

  // offline first: uses the model when both languages are downloaded
  assert.equal(chooseRoute('offlineFirst', 'it', 'en', sup, have).use, 'offline');
  // ...and goes online when one is missing, unsupported, or auto-detect
  assert.equal(chooseRoute('offlineFirst', 'fr', 'en', sup, have).use, 'online');
  assert.equal(chooseRoute('offlineFirst', 'yo', 'en', sup, have).use, 'online');
  assert.equal(chooseRoute('offlineFirst', 'auto', 'en', sup, have).use, 'online');

  // offline only: refuses rather than silently using the network, and says why
  assert.equal(chooseRoute('offlineOnly', 'it', 'en', sup, have).use, 'offline');
  const missing = chooseRoute('offlineOnly', 'fr', 'en', sup, have);
  assert.equal(missing.use, 'error');
  assert.match(missing.reason, /not downloaded/);
  const auto = chooseRoute('offlineOnly', 'auto', 'en', sup, have);
  assert.equal(auto.use, 'error');
  assert.match(auto.reason, /auto-detect/);

  // a phone with no models at all still works online
  assert.equal(chooseRoute('offlineFirst', 'it', 'en', sup, []).use, 'online');
});

test('call links carry the room code in the fragment and survive a round trip', () => {
  const code = generateCode();
  const link = buildInviteLink('https://victor.github.io/translate-plus/', code, 'Victor Balogun', 'it');

  // the code is after the # so the hosting server never receives it
  assert.ok(link.includes('#'));
  assert.ok(!link.slice(0, link.indexOf('#')).includes(code.replace(/-/g, '')));
  assert.ok(!link.includes('?'));
  assert.equal(link.split('#')[0], 'https://victor.github.io/translate-plus/');

  const back = parseInvite(link);
  assert.equal(back.code, code);
  assert.equal(back.name, 'Victor Balogun');
  assert.equal(back.lang, 'it');

  // a bare fragment works too, which is what the browser hands us
  assert.deepEqual(parseInvite('#' + link.split('#')[1]), back);

  // trailing slashes, existing fragments and query strings are cleaned off the base
  assert.equal(buildInviteLink('https://x.dev///', code, '', '').split('#')[0], 'https://x.dev/');
  assert.equal(buildInviteLink('https://x.dev/#old', code, '', 'en').split('#')[0], 'https://x.dev/');

  // junk links are rejected rather than opening an unusable room
  assert.equal(parseInvite('https://x.dev/'), null);
  assert.equal(parseInvite('#j=ABC'), null);
  assert.equal(parseInvite(''), null);

  // a link with no name still opens
  const bare = parseInvite(buildInviteLink('https://x.dev', code, '', ''));
  assert.equal(bare.name, 'Someone');
  assert.equal(bare.lang, 'en');
});

test('long text is split, never silently truncated', () => {
  assert.deepEqual(splitForLength('short', 450), ['short']);
  assert.deepEqual(splitForLength('   ', 450), []);

  const sentences = ('Questa e una frase di prova. ').repeat(60).trim(); // ~1700 chars
  const parts = splitForLength(sentences, 450);
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(p.length <= 450, `part too long: ${p.length}`);
  // every word survives the split
  assert.equal(parts.join(' ').replace(/\s+/g, ' '), sentences.replace(/\s+/g, ' '));
  // it prefers to break at sentence ends
  assert.ok(parts[0].endsWith('.'));

  // text with no spaces at all still splits rather than being cut
  const solid = 'a'.repeat(1000);
  const hard = splitForLength(solid, 450);
  assert.equal(hard.join('').length, 1000);
  for (const p of hard) assert.ok(p.length <= 450);
});
