// Reading text out of a photo in the browser, with Tesseract loaded from a CDN on
// first use. Keeping it out of the bundle means the app stays small for everyone
// who never opens the Image tab.
import { t } from '../i18n/t';

// two sources, because one of them is blocked on some networks
const CDNS = [
  'https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/tesseract.min.js',
  'https://unpkg.com/tesseract.js@7/dist/tesseract.min.js',
];

// Tesseract's own language codes, for the languages we offer.
const TESS: Record<string, string> = {
  af: 'afr', sq: 'sqi', am: 'amh', ar: 'ara', bn: 'ben', bg: 'bul', ca: 'cat',
  'zh-CN': 'chi_sim', 'zh-TW': 'chi_tra', hr: 'hrv', cs: 'ces', da: 'dan', nl: 'nld',
  en: 'eng', et: 'est', tl: 'tgl', fi: 'fin', fr: 'fra', de: 'deu', el: 'ell',
  gu: 'guj', iw: 'heb', hi: 'hin', hu: 'hun', id: 'ind', it: 'ita', ja: 'jpn',
  km: 'khm', ko: 'kor', lv: 'lav', lt: 'lit', ms: 'msa', mr: 'mar', my: 'mya',
  ne: 'nep', no: 'nor', fa: 'fas', pl: 'pol', pt: 'por', pa: 'pan', ro: 'ron',
  ru: 'rus', sr: 'srp', si: 'sin', sk: 'slk', sl: 'slv', es: 'spa', sw: 'swa',
  sv: 'swe', ta: 'tam', te: 'tel', th: 'tha', tr: 'tur', uk: 'ukr', ur: 'urd',
  vi: 'vie', yo: 'yor',
};

export const ocrNeedsDownload = true;

export function ocrSupported(code: string): boolean {
  return !!TESS[code];
}

export function ocrNote(code: string): string | null {
  return ocrSupported(code) ? null : 'Text in this language cannot be read from a photo.';
}

let loading: Promise<any> | null = null;

function loadScript(src: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      const lib = (globalThis as any).Tesseract;
      if (lib) resolve(lib);
      else reject(new Error('loaded but empty'));
    };
    script.onerror = () => reject(new Error('could not load ' + src));
    document.head.appendChild(script);
  });
}

function loadTesseract(): Promise<any> {
  const existing = (globalThis as any).Tesseract;
  if (existing) return Promise.resolve(existing);
  if (loading) return loading;
  loading = (async () => {
    for (const src of CDNS) {
      try {
        return await loadScript(src);
      } catch {
        // try the next source
      }
    }
    loading = null;
    throw new Error(
      t('Could not download the photo reader. It needs the internet the first time; after that it is kept on the device.')
    );
  })();
  return loading;
}

export async function readTextFromImage(
  uri: string,
  lang: string,
  onProgress?: (fraction: number) => void
): Promise<string> {
  const code = TESS[lang];
  if (!code) throw new Error(ocrNote(lang) as string);
  const Tesseract = await loadTesseract();
  const result = await Tesseract.recognize(uri, code, {
    logger: (m: any) => {
      if (onProgress && typeof m?.progress === 'number') onProgress(m.progress);
    },
  });
  return (result?.data?.text ?? '').trim();
}
