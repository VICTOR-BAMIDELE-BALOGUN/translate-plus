# Translate+

A personal live-interpreter app for Android (Expo / React Native), combining the main ideas of
Intent (translated chat, voice clone, live captions, face-to-face) and AI Call (translated calls).
Everything it depends on is free and needs no server of your own.

## What is in version 1

| Feature | How it works | Cost |
|---|---|---|
| Text translation, 60 languages, auto-detect | Google public endpoint, MyMemory as automatic fallback | Free, no key |
| Offline translation, 49 languages | Google ML Kit on-device models, downloaded per language (~30 MB) | Free, no key, no internet |
| Voice input | Android speech recognition (optionally on-device) | Free |
| Face to Face | Split screen, top half rotated for the other person | Free |
| Live Captions | Rolling bilingual subtitles; partial sentences are translated while still being spoken | Free |
| Captions on WhatsApp / other app calls | Call on speaker + Translate+ listening; reply bar speaks your answer in their language | Free |
| Chats | Auto-translated messages, show original, tap to listen, dictation | Free public relay |
| **Call links** | Share a link; the other person joins from their browser with nothing installed | Free (GitHub Pages) |
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

What differs from the installed Android app: speech recognition uses the browser's engine, which
works in Chrome and Safari but not Firefox; offline translation models are not available; and the
Android-specific microphone behaviour does not apply.

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
- Photo/screenshot translation and AI writing suggestions.
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

**Not yet verified, because it needs a real phone:** microphone and speech recognition, spoken output,
voice-clone recording and upload, captions during a WhatsApp call, the public relay, and the APK build itself.

**One known risk:** the on-device translation package (`@react-native-ml-kit/translate-text`) is an older
library using React Native's legacy bridge, running here on React Native 0.88. Autolinking picks it up
correctly, but if the build or the download button fails on the phone, that package is the first suspect.
Everything else keeps working without it — the app falls back to online translation.
