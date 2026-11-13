# Translate+

A personal live-interpreter app for Android (Expo / React Native), combining the main ideas of
Intent (translated chat, voice clone, live captions, face-to-face) and AI Call (translated calls).
Everything it depends on is free and needs no server of your own.

## What is in version 1

| Feature | How it works | Cost |
|---|---|---|
| Text translation, 60 languages, auto-detect | Google public endpoint, MyMemory as automatic fallback | Free, no key |
| Voice input | Android speech recognition (optionally on-device) | Free |
| Face to Face | Split screen, top half rotated for the other person | Free |
| Live Captions | Rolling bilingual subtitles; partial sentences are translated while still being spoken | Free |
| Captions on WhatsApp / other app calls | Call on speaker + Translate+ listening; reply bar speaks your answer in their language | Free |
| Chats | Auto-translated messages, show original, tap to listen, dictation | Free public relay |
| In-app translated call | Speech → text → sent encrypted → translated and spoken on the other phone | Free |
| Voice clone | Fish Audio free model (`s2.1-pro-free`), 3 voice slots, your own API key | Free tier |
| Settings | Languages, auto-translate, show original, engine, speaking speed, mic behaviour, voice, theme, caption size, relay, data reset | — |

Chats and calls are end-to-end encrypted (NaCl secretbox). The invite code is the key: the relay
only sees an unreadable topic name and ciphertext. Anyone holding the code can read the chat.

## Not in version 1

- Calls to real phone numbers (always paid, via a carrier such as Twilio) and the AI calling agent.
- Listening inside a WhatsApp call without speaker. Android does not allow this for normal apps.
- Photo/screenshot translation, AI writing suggestions, call links for people without the app.
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
Type-checked, unit-tested and bundled for Android. It has **not yet been run on a physical phone**;
microphone, speech and audio behaviour must be confirmed on the device.
