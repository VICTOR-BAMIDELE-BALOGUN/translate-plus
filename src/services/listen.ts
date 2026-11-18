// Speech recognition hook: continuous listening with automatic restart, live partial
// results, and a half-duplex pause while the app itself is speaking (prevents echo loops).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { getSettings } from '../store';
import { speechLocaleFor } from '../languages';
import { isSpeaking, onSpeakingChange } from './tts';

type Options = {
  onPartial?: (text: string) => void;
  onFinal: (text: string) => void;
};

const BENIGN = new Set(['no-speech', 'aborted', 'speech-timeout']);

// WebKit's continuous mode is unreliable: it locks the microphone up, especially
// after the app has played audio. Every iOS browser is WebKit, so this covers all
// of them. We ask for one utterance at a time and restart ourselves instead — the
// module builds a fresh recogniser on each start, which is the documented workaround.
const isWebKit =
  Platform.OS === 'web' &&
  typeof navigator !== 'undefined' &&
  /iPad|iPhone|iPod/.test(navigator.userAgent || '');

export function useListener(options: Options) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const want = useRef(false);
  const lang = useRef('en');
  const opts = useRef(options);
  opts.current = options;
  const failures = useRef(0);
  const running = useRef(false);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const begin = useCallback(() => {
    if (!want.current || running.current) return;
    if (getSettings().pauseMicWhileSpeaking && isSpeaking()) return;
    try {
      running.current = true;
      ExpoSpeechRecognitionModule.start({
        lang: speechLocaleFor(lang.current, getSettings().accents),
        interimResults: true,
        continuous: !isWebKit,
        addsPunctuation: true,
        maxAlternatives: 1,
        requiresOnDeviceRecognition: getSettings().onDeviceRecognition,
        // Android finalises after a silence and then stops; anything said during the
        // restart is lost. Waiting longer before finalising keeps sentences whole.
        androidIntentOptions: {
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: getSettings().sentencePause,
          EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: getSettings().sentencePause,
          EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 1000,
        },
      });
    } catch (e) {
      running.current = false;
      setError(e instanceof Error ? e.message : 'Could not start the microphone');
    }
  }, []);

  const scheduleRestart = useCallback(
    (delay: number) => {
      if (restartTimer.current) clearTimeout(restartTimer.current);
      restartTimer.current = setTimeout(begin, delay);
    },
    [begin]
  );

  useEffect(() => {
    const subs = [
      ExpoSpeechRecognitionModule.addListener('result', (event) => {
        const text = event.results?.[0]?.transcript ?? '';
        if (!text) return;
        failures.current = 0;
        if (event.isFinal) opts.current.onFinal(text);
        else opts.current.onPartial?.(text);
      }),
      ExpoSpeechRecognitionModule.addListener('end', () => {
        running.current = false;
        if (want.current) scheduleRestart(0);
      }),
      ExpoSpeechRecognitionModule.addListener('error', (event) => {
        running.current = false;
        if (BENIGN.has(event.error)) return; // 'end' follows and restarts
        failures.current++;
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'language-not-supported' || failures.current >= 4) {
          want.current = false;
          setListening(false);
          setError(
            event.error === 'not-allowed'
              ? 'Microphone permission is needed. Allow it in Android settings.'
              : event.error === 'language-not-supported'
              ? 'This language is not supported by speech recognition on this phone.'
              : event.message || `Speech recognition stopped (${event.error}).`
          );
        }
      }),
    ];
    const offSpeak = onSpeakingChange((speaking) => {
      if (!want.current || !getSettings().pauseMicWhileSpeaking) return;
      if (speaking) {
        try {
          ExpoSpeechRecognitionModule.abort();
        } catch {}
      } else scheduleRestart(60);
    });
    return () => {
      subs.forEach((s) => s.remove());
      offSpeak();
      want.current = false;
      if (restartTimer.current) clearTimeout(restartTimer.current);
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {}
    };
  }, [scheduleRestart]);

  const start = useCallback(
    async (language: string) => {
      setError(null);
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        setError('Speech recognition is not available. Install or enable the Google app.');
        return false;
      }
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        setError('Microphone permission is needed. Allow it in Android settings.');
        return false;
      }
      const switching = want.current && lang.current !== language;
      lang.current = language;
      want.current = true;
      failures.current = 0;
      setListening(true);
      if (switching && running.current) {
        try {
          ExpoSpeechRecognitionModule.abort(); // 'end' restarts with the new language
        } catch {}
      } else begin();
      return true;
    },
    [begin]
  );

  const stop = useCallback(() => {
    want.current = false;
    setListening(false);
    if (restartTimer.current) clearTimeout(restartTimer.current);
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {}
  }, []);

  return { listening, error, start, stop, currentLang: () => lang.current };
}
