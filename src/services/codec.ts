// End-to-end encryption for rooms. The room code is the shared secret:
// the key and the public topic name are both derived from it, so the relay server
// only ever sees an opaque topic and ciphertext.
import nacl from 'tweetnacl';

export function utf8Encode(str: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const d = str.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
}

export function utf8Decode(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; ) {
    const c = b[i++];
    let cp: number;
    if (c < 0x80) cp = c;
    else if (c < 0xe0) cp = ((c & 31) << 6) | (b[i++] & 63);
    else if (c < 0xf0) cp = ((c & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
    else cp = ((c & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
    if (cp > 0xffff) {
      cp -= 0x10000;
      s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else s += String.fromCharCode(cp);
  }
  return s;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    s += i + 1 < b.length ? B64[(n >> 6) & 63] : '=';
    s += i + 2 < b.length ? B64[n & 63] : '=';
  }
  return s;
}

export function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) |
      ((i + 2 < clean.length ? B64.indexOf(clean[i + 2]) : 0) << 6) | (i + 3 < clean.length ? B64.indexOf(clean[i + 3]) : 0);
    out[o++] = (n >> 16) & 255;
    if (i + 2 < clean.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < clean.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function formatCode(code: string): string {
  return normalizeCode(code).replace(/(.{4})(?=.)/g, '$1-');
}

// 16 characters from a 32-symbol alphabet = 80 bits of entropy
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generateCode(): string {
  const bytes = nacl.randomBytes(16);
  let s = '';
  for (let i = 0; i < 16; i++) s += ALPHABET[bytes[i] % 32];
  return formatCode(s);
}

export function isValidCode(code: string): boolean {
  return normalizeCode(code).length >= 12;
}

export type RoomKeys = { key: Uint8Array; topic: string };

export function deriveRoom(code: string): RoomKeys {
  const n = normalizeCode(code);
  const key = nacl.hash(utf8Encode('translateplus-key:' + n)).subarray(0, 32);
  const t = nacl.hash(utf8Encode('translateplus-topic:' + n)).subarray(0, 16);
  let hex = '';
  for (let i = 0; i < t.length; i++) hex += (t[i] + 256).toString(16).slice(1);
  return { key, topic: 'tplus/v1/' + hex };
}

export function seal(obj: unknown, key: Uint8Array): string {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const box = nacl.secretbox(utf8Encode(JSON.stringify(obj)), nonce, key);
  const full = new Uint8Array(nonce.length + box.length);
  full.set(nonce);
  full.set(box, nonce.length);
  return toBase64(full);
}

export function open<T = any>(payload: string, key: Uint8Array): T | null {
  try {
    const full = fromBase64(payload);
    if (full.length <= nacl.secretbox.nonceLength) return null;
    const nonce = full.subarray(0, nacl.secretbox.nonceLength);
    const plain = nacl.secretbox.open(full.subarray(nacl.secretbox.nonceLength), nonce, key);
    if (!plain) return null;
    return JSON.parse(utf8Decode(plain)) as T;
  } catch {
    return null;
  }
}
