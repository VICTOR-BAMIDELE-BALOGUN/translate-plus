// The note that goes out with a call link. This is the first thing a stranger reads,
// so the main languages are written out properly rather than machine-translated, in
// both a polite and a familiar form. Anything else falls back to translating the
// English, which the caller does.

export const ENGLISH_INVITE =
  'Hello. We speak different languages, so I am sending you this link so that we can write to each other: each of us writes in our own language and it is translated automatically. There is nothing to install — it opens in your browser.';

export const ENGLISH_INVITE_CASUAL =
  'Hi! We speak different languages, so here is a link we can use to talk: we each write in our own language and it gets translated automatically. Nothing to install, it just opens in your browser.';

type Pair = { formal: string; informal: string };

const WRITTEN: Record<string, Pair> = {
  en: { formal: ENGLISH_INVITE, informal: ENGLISH_INVITE_CASUAL },
  it: {
    formal:
      'Buongiorno, parliamo lingue diverse, quindi le propongo questo link per scriverci: ognuno scrive nella propria lingua e la traduzione è automatica. Non serve installare nulla, si apre nel browser. Grazie.',
    informal:
      'Ciao! Parliamo lingue diverse, quindi ti mando questo link per scriverci: ognuno scrive nella propria lingua e la traduzione è automatica. Non serve installare niente, si apre nel browser.',
  },
  fr: {
    formal:
      'Bonjour, nous ne parlons pas la même langue, je vous propose donc ce lien pour échanger : chacun écrit dans sa langue et la traduction est automatique. Rien à installer, cela s’ouvre dans votre navigateur. Merci.',
    informal:
      'Salut ! On ne parle pas la même langue, alors voici un lien pour discuter : chacun écrit dans sa langue et la traduction est automatique. Rien à installer, ça s’ouvre dans ton navigateur.',
  },
  es: {
    formal:
      'Buenos días: como hablamos idiomas distintos, le propongo este enlace para escribirnos. Cada uno escribe en su propio idioma y la traducción es automática. No hay que instalar nada, se abre en su navegador. Gracias.',
    informal:
      '¡Hola! Como hablamos idiomas distintos, aquí tienes un enlace para escribirnos. Cada uno escribe en su idioma y se traduce automáticamente. No hay que instalar nada, se abre en tu navegador.',
  },
  de: {
    formal:
      'Guten Tag, da wir verschiedene Sprachen sprechen, schicke ich Ihnen diesen Link, damit wir schreiben können: Jeder schreibt in seiner eigenen Sprache, die Übersetzung läuft automatisch. Es muss nichts installiert werden, der Link öffnet sich im Browser. Vielen Dank.',
    informal:
      'Hallo! Wir sprechen verschiedene Sprachen – hier ist ein Link zum Schreiben: Jeder schreibt in seiner eigenen Sprache und es wird automatisch übersetzt. Du musst nichts installieren, der Link öffnet sich im Browser.',
  },
  pt: {
    formal:
      'Bom dia. Como falamos línguas diferentes, envio-lhe este link para conversarmos: cada um escreve na sua própria língua e a tradução é automática. Não é preciso instalar nada, abre no navegador. Obrigado.',
    informal:
      'Olá! Como falamos línguas diferentes, aqui está um link para conversarmos: cada um escreve na sua língua e é traduzido automaticamente. Não precisas de instalar nada, abre no navegador.',
  },
  nl: {
    formal:
      'Goedendag, wij spreken verschillende talen, daarom stuur ik u deze link zodat we elkaar kunnen schrijven: ieder schrijft in zijn eigen taal en de vertaling gaat automatisch. U hoeft niets te installeren, de link opent in uw browser. Hartelijk dank.',
    informal:
      'Hoi! We spreken verschillende talen, dus hier is een link om te schrijven: ieder schrijft in zijn eigen taal en het wordt automatisch vertaald. Je hoeft niets te installeren, de link opent in je browser.',
  },
};

/** The written message for a language, or null when there is none and it must be translated. */
export function writtenInvite(lang: string, formal: boolean): string | null {
  const pair = WRITTEN[lang] ?? WRITTEN[lang.split('-')[0]];
  if (!pair) return null;
  return formal ? pair.formal : pair.informal;
}

export function hasWrittenInvite(lang: string): boolean {
  return writtenInvite(lang, true) !== null;
}

/** Message and link together, ready to send. */
export function withLink(message: string, link: string): string {
  return `${message.trim()}\n\n${link}`;
}
