# Translate+

A personal live-interpreter app for Android (Expo / React Native), combining the main ideas of
Intent (translated chat, voice clone, live captions, face-to-face) and AI Call (translated calls).
Everything it depends on is free and needs no server of your own.

## What is in version 1

| Feature | How it works | Cost |
|---|---|---|
| Translate tab | Two panes that scroll on their own, stacked or side by side | Free |
| Learn | Preloaded Italian phrasebook, pronunciation, notes and free course links — all offline | Free |
| Recaps | Key details and the transcript after a conversation | Free |
| Invitation note | Call links go out with a message in the other person's language | Free |
| Formality | Choose "Lei" or "tu"; the app steers it, reads it back and labels the result | Free |
| Themes | Eight themes in four light/dark pairs, optionally following the phone | Free |
| Text translation, 60 languages, auto-detect | Google public endpoint, MyMemory as automatic fallback | Free, no key |
| Offline translation, 49 languages | Google ML Kit on-device models, downloaded per language (~30 MB) | Free, no key, no internet |
| Voice input | Android speech recognition (optionally on-device) | Free |
| Face to Face | Split screen, top half rotated for the other person | Free |
| Live Captions | Rolling bilingual subtitles; partial sentences are translated while still being spoken | Free |
| Captions on WhatsApp / other app calls | Call on speaker + Translate+ listening; reply bar speaks your answer in their language | Free |
| Chats | Auto-translated messages, show original, tap to listen, dictation | Free public relay |
| **Call links** | Share a link; the other person joins from their browser with nothing installed | Free (GitHub Pages) |
| **Photo translation** | Read text in a photo or screenshot and translate it; the text stays editable | Free, no key |
| **Installable web app** | Add to the home screen on Android or iPhone, no app store, opens offline | Free |
| In-app translated call | Speech → text → sent encrypted → translated and spoken on the other phone | Free |
| Voice clone | Fish Audio free model (`s2.1-pro-free`), 3 voice slots, your own API key | Free tier |
| Settings | Languages, auto-translate, show original, engine, speaking speed, mic behaviour, voice, theme, caption size, relay, data reset | — |

## Install it from the web — no Play Store, no App Store

The web build is a progressive web app, so both of you can install it straight from the browser.

**Publish it once (free).** Either:

- Push this repo to GitHub, then Settings → Pages → Source: GitHub Actions. The `deploy-web.yml`
  workflow builds and publishes it at `https://<your-user>.github.io/<repo>/`.
- Or run `npm run build:web` and upload the resulting `dist/` folder to any static host.

The build uses relative paths, so the same `dist/` folder works at a domain root or in a subfolder
with no rebuild. `tests/check-web-build.mjs` runs as part of it and fails the build if the result
would not be installable.

**Android.** Open that address in Chrome. The app shows an Install button, or use Chrome's menu →
"Add to Home screen". It then opens full screen with its own icon.

**iPhone and iPad.** Open the address in Safari, tap Share, then "Add to Home Screen". Safari has no
install prompt, so the app shows those steps instead.

Once installed it opens with no connection, because a service worker keeps the app itself on the
device. Translating still needs the internet in the web version — the on-device models below are
part of the Android app only.

### iPhone and iPad: what to expect

Speech recognition does work in an installed web app on iOS, but WebKit's *continuous* mode locks
the microphone up, particularly after the app has played audio — which is exactly what a translator
does. Translate+ therefore asks for one utterance at a time on iOS and restarts the recogniser
itself, building a fresh one each time, which is the documented workaround.

Two things remain outside the app's control on iOS:

- **iOS 26 broke audio playback in installed web apps** after the app is closed and reopened; the
  same page works in a Safari tab. Spoken translations may go silent until the app is force-quit and
  reopened. This is an open WebKit regression, not something the app can fix.
- **Safari keeps separate storage** for a page in a tab and the same page installed to the Home
  Screen, so settings saved in one do not appear in the other, and Safari may clear an unused
  web app's data after a few weeks.

Installing on iOS is also manual — Share → Add to Home Screen — with no install prompt.

What differs from the installed Android app: speech recognition uses the browser's engine, which
works in Chrome and Safari but not Firefox; offline translation models are not available; and the
Android-specific microphone behaviour does not apply.

## Learn (preloaded)

A Learn tab with Italian course material built into the app — no connection needed, nothing to
download. 131 phrases across 10 situations chosen for living in Italy rather than visiting:
the first twenty words, university, renting a flat, offices and paperwork, shops, bars and
restaurants, doctor and pharmacy, getting around, work, and numbers and time. Each phrase has the
Italian, the English, a pronunciation respelling, and a LEI marker where the polite form is the one
to use. Tap to hear it, hold to copy, and Practice covers the Italian so you can test yourself.

Two more sections are bundled: how Italian spelling maps to sound (the twelve rules that let you
read any word aloud), and short notes on the things that trip English speakers up — Lei versus tu,
which greeting at which hour, gendered nouns, and false friends.

The **Free courses** section links out to resources checked for cost:

| | |
|---|---|
| CPIA | Free state courses in Italy, beginner to B1, with the certificate that counts for a long-stay permit. One per province, Ancona included |
| Language Transfer | 45 audio lessons, about six hours, donation-funded |
| Coffee Break Italian | Podcast free in three levels of 40 lessons |
| RAI Play | Italian television and news, free |
| Duolingo, Anki, Tandem | Free tiers |

Adding another language means writing one pack in `src/learn/` and listing it; the screen and the
tests pick it up automatically.

## Recaps

Face to Face, Captions and each conversation have a **Recap** button once there is something to
recap. It is not a written summary — there is no language model here and inventing prose about a
conversation with a landlord would be worse than useless. What it does instead is pull out the
things you actually need afterwards and show each one with the sentence it came from:

| | Examples |
|---|---|
| Day | tomorrow, domani, 18/11, venerdì |
| Time | 17:30, alle 17 |
| Amount | €450, 450 euro |
| Place | via Giordano Bruno 12 |
| Phone, Email | 333 123 4567, rossi@example.com |

Both languages are searched, since a time or a price often survives translation unchanged while the
sentence around it does not, and the same detail found twice is listed once. Copy or share puts the
details and the whole transcript into your notes.

## The invitation that goes with a link

A call link now travels with a note written in the other person's language, so the first thing a
stranger reads makes sense to them. Italian, French, Spanish, German, Portuguese, Dutch and English
are written out by hand in both a polite and a familiar form — a first impression is the wrong place
for machine translation. Any other language falls back to translating the English, and says so.
The sheet shows the note and the link before anything is sent, and both are editable.

## Formality — "Lei" or "tu"

Free translation engines choose between formal and informal address more or less at random, so a
message to a landlord can come back sounding like one to a friend. The Translate tab shows an
**Auto / Formal / Informal** control whenever the target language makes that distinction (Italian,
French, German, Spanish, Portuguese, Dutch, Polish, Russian, Turkish), and Settings holds the default.

Three things happen, in order of how reliable they are:

1. **Steering.** When you write in English, the English is rewritten before translating — "can you"
   becomes "could you kindly", contractions are expanded, "thanks" becomes "thank you". The engine
   then carries that register into the translation. This risks nothing grammatically, because the
   engine still writes the target language itself.
2. **Reading it back.** The result is checked for markers that cannot mean anything else — `potrebbe`,
   `scusi`, `vorrebbe` against `puoi`, `hai`, `tuo`. Ambiguous words like `è` and `ha` are ignored on
   purpose, since they describe things as often as they address people. The label above the
   translation says which register actually came out.
3. **Correcting, Italian only.** If it still came out wrong, a table of unambiguous verb forms fixes
   it (`puoi`→`può`, `scusa`→`scusi`, `vuoi`→`vuole`) and the label says "(adjusted)". Clitics like
   `ti` are deliberately left alone, because the right replacement depends on the case and a wrong
   guess produces broken Italian.

**This is a nudge, not a guarantee.** Doing it properly needs a model that understands the sentence,
which no free keyless service offers. What the app can promise is that it tells you what it produced,
so you can check before sending something that matters.

## Themes

Settings → Appearance has eight themes in four light/dark pairs:

| Dark | Light | Character |
|---|---|---|
| Midnight | Daylight | the default, green accent |
| Ocean | Sky | deep blue, cyan accent |
| Dusk | Sand | warm plum and terracotta |
| Ink | Paper | highest contrast, for bright sunlight |

"Match the phone's light and dark setting" swaps to the counterpart of whichever theme you picked,
so choosing Ocean gives you Sky when the phone turns light rather than something unrelated. On the
web the page background and the browser's theme colour follow the theme too, so an installed app
has no mismatched edges.

## Translate tab layout

The source and the translation each sit in their own pane with their own scroll, so a long letter
can be read on one side while the other stays put. The switch above them, also in
Settings → Display, chooses **Stacked** (one above the other) or **Side by side**. Side by side
needs about 520px of width, so on an upright phone it stays stacked and says why; turn the phone
sideways, or use a laptop, and it splits into two columns.

## Photo translation

The Photo tab reads text out of a picture — a sign, a menu, a letter, a screenshot — and translates
it. What it found is shown in an editable box, so a misread word can be corrected before translating.

- **Android app:** Google ML Kit reads the photo on the device, with no internet. It handles Latin,
  Chinese, Japanese, Korean and Devanagari scripts; Arabic, Hebrew, Thai, Greek and Cyrillic are not
  available there.
- **Web:** Tesseract, fetched from a CDN the first time and then kept by the browser. It covers more
  alphabets, including Arabic, Greek, Cyrillic, Thai and Yoruba, but the first photo needs internet
  and takes longer while the reader and the language data download.

## Call links

Invite shares a link instead of a code once you set a web address in Settings → Call links.
The other person opens it in their browser, picks their language and joins — no app, no account.
They speak or type in their language, you speak or type in yours, and each side translates what it
receives.

The room code is also the encryption key, so it is carried in the URL **fragment** (after `#`),
which browsers never send to the server hosting the page. Whoever holds the link can read the
conversation, so send it privately.

To publish the page free of charge, push this repo to GitHub, enable Settings → Pages → Source:
GitHub Actions, and the included `deploy-web.yml` workflow puts it at
`https://<your-user>.github.io/<repo>/`. Put that address into Settings → Call links.

Speech in the guest's browser uses the Web Speech API: it works in Chrome and Safari, and Firefox
has no speech recognition, so guests there type instead. Reading and typing work everywhere.

## Offline mode

Settings has three translation modes:

- **Online only** — always uses the internet services.
- **Offline first** (default) — uses a downloaded on-device model when both languages are ready, otherwise goes online.
- **Offline only** — never touches the network, and says so plainly when a language is missing.

### If words get cut off

Android's recogniser finalises a sentence after a silence and then stops; whatever is said while it
restarts is lost. Settings → Speech → "Pause before translating" controls how long a silence has to
be before the sentence counts as finished: **Quick** (0.8s) translates sooner but can cut you off
mid-sentence, **Normal** (1.5s, the default) suits most speech, **Patient** (2.5s) waits through
longer pauses. Face to Face and Captions also translate half-finished sentences as you speak, so the
text keeps moving even while the recogniser is still listening.

Face to Face keeps the last six finished sentences on each half, newest largest, so a sentence is
never wiped out by the next one before it has been read. `tests/e2e/speech.py` drives a stubbed
recogniser to prove it: partials, finals, and a partial arriving late must not overwrite a finished
sentence.

Combined with the "On-device speech recognition" toggle and the phone's built-in voices, the whole
speaker-phone pipeline — hearing, translating, speaking — runs with no internet at all. It is also
faster, since nothing waits on a network round trip.

Auto-detect always needs the internet, because the on-device models require an explicit source language.
Yoruba, Igbo, Hausa, Amharic, Zulu, Somali, Serbian, Punjabi, Nepali, Sinhala, Khmer and Burmese have
no on-device model and always go online.

Chats and calls are end-to-end encrypted (NaCl secretbox). The invite code is the key: the relay
only sees an unreadable topic name and ciphertext. Anyone holding the code can read the chat.

## Not in version 1

- Calls to real phone numbers (always paid, via a carrier such as Twilio) and the AI calling agent.
  This needs a paid Twilio account, a server you host, and a paid server-side speech service; none of
  those accounts exist yet, so no code for it is included.
- Listening inside a WhatsApp call without speaker. Android does not allow this for normal apps.
- AI writing suggestions.
- A native iOS build (needs a paid Apple developer account). The installable web app covers iPhones instead.

## Get the APK (free)

**Option A — GitHub Actions (no tools needed on your computer)**
1. Create a free GitHub repository and upload this folder (or `git push`).
2. Open the repo's **Actions** tab → *Build Android APK* → **Run workflow**.
3. When it finishes, download `translate-plus-apk` from the run's Artifacts and install it on the phone.

**Option B — Expo EAS free tier**
```
npm install
npx eas-cli login
npx eas-cli build -p android --profile preview
```

**Option C — your own computer with Android Studio**
```
npm install
npx expo run:android --variant release
```

The app uses native speech modules, so it does not run inside Expo Go.

## Set up voice cloning
1. Create a free account at fish.audio and make an API key.
2. In the app: Settings → Voice → paste the key → Save.
3. Record the sample text (10+ seconds, quiet room) → Create cloned voice.

## Development
```
npm run typecheck   # TypeScript
npm test            # encryption, translation parsing, fallback and cache
```

## Status of testing
- Type-checked; unit tests for encryption, translation parsing, fallback and cache.
- Bundled for Android, and the native Android project generates cleanly.
- 44 end-to-end checks run in a headless browser with two simulated devices and a local relay
  (`tests/e2e`): every tab, translation, language picker, history, settings persistence, creating and
  joining a chat, two-way translated messages, call signalling, wrong-key messages ignored, a guest
  joining by shared link and talking in both directions, offline-mode routing, and the installable
  web app (service worker, manifest, opening with the network switched off).
- MyMemory was called live and returned correct translations with language detection.

**Photo reading** was verified for real against a generated Italian sign (`Vietato fumare / Uscita di
sicurezza`), which Tesseract read exactly. What is not verified here is the browser fetching the
reader from its CDN, because this build environment blocks it.

**Not yet verified, because it needs a real phone:** microphone and speech recognition, spoken output,
voice-clone recording and upload, captions during a WhatsApp call, the public relay, and the APK build itself.

**One known risk:** the on-device translation package (`@react-native-ml-kit/translate-text`) is an older
library using React Native's legacy bridge, running here on React Native 0.88. Autolinking picks it up
correctly, but if the build or the download button fails on the phone, that package is the first suspect.
Everything else keeps working without it — the app falls back to online translation.
