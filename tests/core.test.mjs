import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveRoom, seal, open, toBase64, fromBase64, utf8Encode, utf8Decode, generateCode, isValidCode, formatCode, normalizeCode } from '../src/services/codec.ts';
import { translate, parseGoogle, parseMyMemory, clearTranslateCache } from '../src/services/translate.ts';

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
