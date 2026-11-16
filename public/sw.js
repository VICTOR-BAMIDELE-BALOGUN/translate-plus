// Keeps the app shell available offline. The first page load happens before this worker
// takes control, so on activation it reads index.html and caches the bundle it names.
const CACHE = 'translate-plus-v2';

async function precacheShell() {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch('./', { cache: 'reload' });
    if (!res.ok) return;
    await cache.put('./', res.clone());
    const html = await res.text();
    const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((u) => u && !/^(https?:)?\/\//.test(u) && !u.startsWith('data:'));
    await Promise.all(urls.map((u) => cache.add(u).catch(() => {})));
  } catch {
    // offline at activation: the fetch handler fills the cache on the next online visit
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './manifest.json']).catch(() => {})));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
      await precacheShell();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never cache translation or relay traffic

  // a page load falls back to the cached shell, so a call link still opens with no signal
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          event.waitUntil(caches.open(CACHE).then((c) => c.put('./', copy)));
          return res;
        })
        .catch(async () => (await caches.match('./')) || (await caches.match(req)) || Response.error())
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          event.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
        }
        return res;
      })
      .catch(async () => (await caches.match(req)) || Response.error())
  );
});
