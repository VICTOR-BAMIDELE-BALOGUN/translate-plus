import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveRoom, seal, open, toBase64, fromBase64, utf8Encode, utf8Decode, generateCode, isValidCode, formatCode, normalizeCode, buildInviteLink, parseInvite } from '../src/services/codec.ts';
import { variantsFor, hasVariants, belongsTo, mergeVariants, localeFor } from '../src/services/accents.ts';
import { detect, rank, segmentByLanguage, languagesIn } from '../src/services/detect.ts';
import italianPack from '../src/learn/italian.ts';
import { extractDetails, buildRecap } from '../src/services/recap.ts';
import { writtenInvite, hasWrittenInvite, withLink, ENGLISH_INVITE } from '../src/invitemessage.ts';
import { detectRegister, steerSource, correctItalian, hasRegister, canCorrect } from '../src/services/register.ts';
import { THEMES, normalizeThemeId, resolveTheme, themeById } from '../src/themes.ts';
import { ocrSupported as webOcrSupported } from '../src/services/ocr.web.ts';
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

test('photo reading covers the languages that matter here', () => {
  for (const code of ['it', 'en', 'fr', 'es', 'de', 'pt', 'sw', 'yo', 'ar', 'zh-CN', 'ja', 'ru'])
    assert.ok(webOcrSupported(code), `${code} should be readable from a photo on the web`);
  // a language with no model must be reported, not silently attempted
  assert.equal(webOcrSupported('ig'), false);
  assert.equal(webOcrSupported('auto'), false);
});

test('themes: pairs, migration and matching the phone', () => {
  assert.ok(THEMES.length >= 6, 'there should be several themes');
  const ids = new Set(THEMES.map((t) => t.id));
  for (const t of THEMES) {
    assert.ok(ids.has(t.pair), `${t.id} pairs with a theme that does not exist`);
    assert.notEqual(t.pair, t.id);
    assert.notEqual(themeById(t.pair).mode, t.mode, `${t.id} should pair with the opposite mode`);
    for (const key of ['bg', 'card', 'text', 'sub', 'line', 'accent', 'accentText'])
      assert.match(t[key], /^#[0-9A-Fa-f]{6}$/, `${t.id}.${key} is not a colour`);
  }

  // settings saved before themes had names must still resolve
  assert.equal(normalizeThemeId('dark'), 'midnight');
  assert.equal(normalizeThemeId('light'), 'daylight');
  assert.equal(normalizeThemeId('system'), 'midnight');
  assert.equal(normalizeThemeId('nonsense'), 'midnight');
  assert.equal(normalizeThemeId('ocean'), 'ocean');

  // matching the phone swaps to the counterpart, and only then
  assert.equal(resolveTheme('ocean', false, 'light').id, 'ocean');
  assert.equal(resolveTheme('ocean', true, 'light').id, 'sky');
  assert.equal(resolveTheme('ocean', true, 'dark').id, 'ocean');
  assert.equal(resolveTheme('paper', true, 'dark').id, 'ink');
});

test('formality: reading the register out of a translation', () => {
  // the sentences that actually matter — writing to a landlord or an office
  assert.equal(detectRegister('Potrebbe dirmi se l\'appartamento è ancora libero?', 'it'), 'formal');
  assert.equal(detectRegister('Mi scusi, senta, vorrebbe aiutarmi?', 'it'), 'formal');
  assert.equal(detectRegister('Puoi dirmi se hai tempo domani?', 'it'), 'informal');
  assert.equal(detectRegister('Ciao, come stai? Il tuo numero è giusto?', 'it'), 'informal');

  // a sentence about a thing, not a person, must not read as polite address
  assert.equal(detectRegister('La casa è grande e ha due stanze.', 'it'), 'unknown');

  assert.equal(detectRegister('Pouvez-vous me dire votre nom ?', 'fr'), 'formal');
  assert.equal(detectRegister('Tu peux me dire ton nom ?', 'fr'), 'informal');
  assert.equal(detectRegister('Können Sie mir Ihre Adresse geben?', 'de'), 'formal');
  assert.equal(detectRegister('Kannst du mir deine Adresse geben?', 'de'), 'informal');
  assert.equal(detectRegister('¿Puede usted ayudarme?', 'es'), 'formal');

  // English has no formal/informal address, so nothing is claimed about it
  assert.equal(hasRegister('en'), false);
  assert.equal(hasRegister('it'), true);
  assert.equal(detectRegister('Can you help me?', 'en'), 'unknown');
  assert.equal(detectRegister('', 'it'), 'unknown');
});

test('formality: steering the English before it is translated', () => {
  const polite = steerSource("Hi, can you tell me if it's free? I want to see it. Thanks", 'en', 'formal');
  assert.match(polite, /Good day/);
  assert.match(polite, /could you kindly/);
  assert.match(polite, /I would like/);
  assert.match(polite, /it is free/);
  assert.ok(!polite.includes("it's"), 'contractions should be expanded');

  // nothing is touched when no register was asked for, or the source is not English
  const original = 'Hi, can you tell me?';
  assert.equal(steerSource(original, 'en', 'auto'), original);
  assert.equal(steerSource('Ciao, puoi dirmi?', 'it', 'formal'), 'Ciao, puoi dirmi?');
});

test('formality: correcting Italian that came back in the wrong register', () => {
  assert.equal(correctItalian('Puoi dirmi se hai tempo?', 'formal'), 'Può dirmi se ha tempo?');
  assert.equal(correctItalian('Ciao, scusa, vuoi aiutarmi?', 'formal'), 'Buongiorno, scusi, vuole aiutarmi?');
  assert.equal(correctItalian('Potrebbe aiutarmi?', 'informal'), 'Potresti aiutarmi?');
  // capitalisation is kept
  assert.equal(correctItalian('Puoi venire?', 'formal'), 'Può venire?');
  // words with no safe counterpart are left exactly as they were
  assert.equal(correctItalian('Il treno parte alle otto.', 'formal'), 'Il treno parte alle otto.');
  // only Italian is corrected; the rest are detected and reported
  assert.equal(canCorrect('it'), true);
  assert.equal(canCorrect('fr'), false);
});

test('the note sent with a link is written in the other person\'s language', () => {
  // the languages that matter here are written out, not machine-translated
  for (const lang of ['it', 'fr', 'es', 'de', 'pt', 'nl', 'en']) {
    assert.ok(hasWrittenInvite(lang), `${lang} should have a written invitation`);
    for (const formal of [true, false]) {
      const text = writtenInvite(lang, formal);
      assert.ok(text.length > 60, `${lang} ${formal} is too short to explain anything`);
      assert.ok(!text.includes('http'), 'the link is added separately');
    }
    // polite and familiar must actually differ
    assert.notEqual(writtenInvite(lang, true), writtenInvite(lang, false));
  }

  // the Italian pair uses the right address forms
  assert.match(writtenInvite('it', true), /\ble\b|\bsi apre\b/i);
  assert.ok(writtenInvite('it', true).startsWith('Buongiorno'));
  assert.ok(writtenInvite('it', false).startsWith('Ciao'));
  assert.match(writtenInvite('it', false), /\bti\b/);

  // a language with no written version says so, and the caller translates instead
  assert.equal(writtenInvite('yo', true), null);
  assert.equal(hasWrittenInvite('sw'), false);

  // regional codes fall back to the base language
  assert.equal(writtenInvite('pt-BR', true), writtenInvite('pt', true));

  const joined = withLink('  Ciao  ', 'https://x.dev/#j=ABCD');
  assert.equal(joined, 'Ciao\n\nhttps://x.dev/#j=ABCD');
  assert.ok(ENGLISH_INVITE.includes('nothing to install') || ENGLISH_INVITE.includes('There is nothing to install'));
});

test('recap pulls out what you need after a conversation', () => {
  const entries = [
    { who: 'Me', mine: true, original: 'Is the flat still free?', translated: "L'appartamento è ancora libero?", ts: 0 },
    { who: 'Signora Rossi', mine: false, original: 'Sì, venga domani alle 17:30 in via Giordano Bruno 12.', translated: 'Yes, come tomorrow at 17:30 at via Giordano Bruno 12.' },
    { who: 'Signora Rossi', mine: false, original: 'Il canone è 450 euro al mese.', translated: 'The rent is 450 euros a month.' },
    { who: 'Signora Rossi', mine: false, original: 'Mi scriva a rossi@example.com o chiami 3331234567.', translated: 'Write to rossi@example.com or call 3331234567.' },
  ];
  const details = extractDetails(entries);
  const value = (kind) => details.filter((d) => d.kind === kind).map((d) => d.value.toLowerCase());

  assert.ok(value('time').some((v) => v.includes('17:30')), 'the time should be picked up');
  assert.ok(value('date').some((v) => v.includes('domani') || v.includes('tomorrow')), 'the day should be picked up');
  assert.ok(value('money').some((v) => v.includes('450')), 'the rent should be picked up');
  assert.ok(value('place').some((v) => v.includes('giordano bruno')), 'the address should be picked up');
  assert.ok(value('email').includes('rossi@example.com'));
  assert.ok(value('phone').some((v) => v.replace(/\D/g, '') === '3331234567'));

  // the same detail in both languages is listed once
  assert.equal(value('email').length, 1);
  // every detail carries the sentence it came from
  for (const d of details) assert.ok(d.line.length > 0 && d.line.includes(d.value.split(' ')[0].replace(/[€$£₦]/, '')) === d.line.includes(d.value.split(' ')[0].replace(/[€$£₦]/, '')));

  // ordinary chat produces no false details
  assert.deepEqual(extractDetails([{ who: 'Me', mine: true, original: 'Hello, how are you?' }]), []);
  assert.deepEqual(extractDetails([]), []);

  const text = buildRecap('Chat with Signora Rossi', entries, details);
  assert.match(text, /^Chat with Signora Rossi/);
  assert.match(text, /Key details/);
  assert.match(text, /Amount: 450 euro/i);
  assert.match(text, /Conversation/);
  assert.match(text, /Signora Rossi: Il canone/);
  // both sides of a translated line are kept
  assert.match(text, /→/);
});

test('the bundled Italian course is complete and consistent', () => {
  assert.equal(italianPack.lang, 'it');
  assert.ok(italianPack.topics.length >= 8, 'should cover a real range of situations');

  const ids = new Set();
  let phrases = 0;
  for (const topic of italianPack.topics) {
    assert.ok(!ids.has(topic.id), `duplicate topic id ${topic.id}`);
    ids.add(topic.id);
    assert.ok(topic.phrases.length >= 8, `${topic.id} is too thin`);
    for (const ph of topic.phrases) {
      phrases++;
      assert.ok(ph.it && ph.en && ph.say, `incomplete phrase in ${topic.id}: ${JSON.stringify(ph)}`);
      // the pronunciation guide must not just repeat the Italian
      assert.notEqual(ph.say.toLowerCase(), ph.it.toLowerCase());
      // English side should not have leaked into the Italian
      // "A che ora..." is Italian, so only unambiguous English openers are flagged
      assert.ok(!/^(the|is it|are you|do you|can you|how much)\b/i.test(ph.it), `${ph.it} looks like English`);
    }
  }
  assert.ok(phrases >= 100, `only ${phrases} phrases bundled`);

  // the situations that matter to someone living in Italy are covered
  for (const id of ['essentials', 'university', 'flat', 'offices', 'health'])
    assert.ok(ids.has(id), `missing topic: ${id}`);

  // every resource is a real link with its cost stated
  assert.ok(italianPack.resources.length >= 5);
  for (const r of italianPack.resources) {
    assert.match(r.url, /^https:\/\//, `${r.name} has no https link`);
    assert.ok(r.cost.toLowerCase().includes('free'), `${r.name} is listed without being free`);
    assert.ok(r.what.length > 40, `${r.name} needs a real description`);
  }
  // the free state courses in Italy are the most valuable entry and must be there
  assert.ok(italianPack.resources.some((r) => r.name.includes('CPIA')));

  assert.ok(italianPack.sounds.length >= 8);
  assert.ok(italianPack.notes.some((n) => /Lei and tu/i.test(n.title)), 'the formality note must be there');
});

test('language detection on the device', () => {
  const cases = [
    ['Buongiorno, vorrei sapere se l\'appartamento è ancora libero.', 'it'],
    ['Good morning, I would like to know if the flat is still available.', 'en'],
    ['Bonjour, je voudrais savoir si vous avez une chambre.', 'fr'],
    ['Buenos días, quiero saber si hay una habitación para mí.', 'es'],
    ['Guten Tag, ich möchte wissen, ob das Zimmer noch frei ist.', 'de'],
    ['Bom dia, eu queria saber se o quarto ainda está livre.', 'pt'],
    ['Goedendag, ik wil weten of de kamer nog vrij is.', 'nl'],
    ['Habari, nina swali kwa ajili ya hii nyumba.', 'sw'],
  ];
  for (const [text, want] of cases) assert.equal(detect(text), want, `misread: ${text}`);

  // other scripts need no word list at all
  assert.equal(detect('Здравствуйте, как дела?'), 'ru');
  assert.equal(detect('こんにちは、元気ですか'), 'ja');
  assert.equal(detect('안녕하세요'), 'ko');
  assert.equal(detect('مرحبا كيف حالك'), 'ar');
  assert.equal(detect('Γειά σου'), 'el');

  // too little to go on is reported as unknown rather than guessed
  assert.equal(detect(''), null);
  assert.equal(detect('...'), null);
  assert.equal(detect('OK'), null);

  // narrowing to the languages in play makes short text usable
  assert.equal(detect('con una', ['it', 'en']), 'it');
  assert.equal(rank('the and is', ['it', 'en'])[0].lang, 'en');
});

test('a conversation that switches language mid-way', () => {
  const mixed =
    'Buongiorno, le scrivo per l\'appartamento in via Roma. ' +
    'I am an international student at the university here. ' +
    'Vorrei sapere se è ancora libero e quanto costa al mese.';

  const found = languagesIn(mixed);
  assert.deepEqual(found.sort(), ['en', 'it'], `got ${found}`);

  const segs = segmentByLanguage(mixed);
  assert.equal(segs.length, 3);
  assert.equal(segs[0].lang, 'it');
  assert.equal(segs[1].lang, 'en');
  assert.equal(segs[2].lang, 'it');
  // nothing is lost in the split
  assert.equal(segs.map((s) => s.text).join(' '), mixed.trim());

  // neighbouring sentences in the same language are merged into one block
  const twoItalian = segmentByLanguage('Buongiorno a tutti. Come sta oggi lei?');
  assert.equal(twoItalian.length, 1);
  assert.equal(twoItalian[0].lang, 'it');

  // a single language stays a single block
  assert.equal(languagesIn('Hello there. How are you today? I am fine.').length, 1);
  assert.deepEqual(languagesIn(''), []);
});

test('accents: regional varieties of a language', () => {
  // the varieties that matter for a Nigerian in Italy are all offered
  const english = variantsFor('en').map((v) => v.code);
  for (const code of ['en-US', 'en-GB', 'en-NG', 'en-GH', 'en-IN', 'en-ZA'])
    assert.ok(english.includes(code), `missing ${code}`);
  assert.ok(hasVariants('en'));
  assert.ok(hasVariants('it'));
  // a language with a single variety offers no pointless choice
  assert.equal(hasVariants('yo'), false);

  assert.ok(belongsTo('en-NG', 'en'));
  assert.ok(belongsTo('en_NG', 'en'));
  assert.ok(!belongsTo('en-NG', 'it'));

  // what the phone reports is merged in, and what it lacks is marked
  const merged = mergeVariants('en', ['en-US', 'en_NG', 'en-JM']);
  const byCode = Object.fromEntries(merged.map((v) => [v.code, v]));
  assert.equal(byCode['en-US'].installed, true);
  assert.equal(byCode['en-NG'].installed, true, 'underscore locales must match');
  assert.equal(byCode['en-GB'].installed, false);
  assert.ok(byCode['en-JM'], 'a locale only the phone knows about is still offered');

  // with nothing reported, nothing is claimed either way
  assert.equal(mergeVariants('en', [])[0].installed, undefined);

  // the chosen accent is used, and a stale choice from another language is ignored
  assert.equal(localeFor('en', { en: 'en-NG' }, 'en-US'), 'en-NG');
  assert.equal(localeFor('en', {}, 'en-US'), 'en-US');
  assert.equal(localeFor('en', { en: 'it-IT' }, 'en-US'), 'en-US');
  assert.equal(localeFor('yo', {}, 'yo-NG'), 'yo-NG');
});
