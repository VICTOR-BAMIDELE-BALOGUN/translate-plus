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
| In-app translated call | Speech → text → sent encrypted → translated and spoken on the other phone | Free |
| Voice clone | Fish Audio free model (`s2.1-pro-free`), 3 voice slots, your own API key | Free tier |
| Settings | Languages, auto-translate, show original, engine, speaking speed, mic behaviour, voice, theme, caption size, relay, data reset | — |

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
- iOS build (same code, needs a paid Apple developer account).

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
- 29 end-to-end checks run in a headless browser with two simulated devices and a local relay
  (`tests/e2e`): every tab, translation, language picker, history, settings persistence, creating and
  joining a chat, two-way translated messages, call signalling, wrong-key messages ignored.
- MyMemory was called live and returned correct translations with language detection.

**Not yet verified, because it needs a real phone:** microphone and speech recognition, spoken output,
voice-clone recording and upload, captions during a WhatsApp call, the public relay, and the APK build itself.

**One known risk:** the on-device translation package (`@react-native-ml-kit/translate-text`) is an older
library using React Native's legacy bridge, running here on React Native 0.88. Autolinking picks it up
correctly, but if the build or the download button fails on the phone, that package is the first suspect.
Everything else keeps working without it — the app falls back to online translation.
