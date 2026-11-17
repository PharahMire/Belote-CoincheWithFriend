const CACHE_NAME = 'belote-coinche-pwa-v14';
const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of APP_SHELL_ASSETS) {
        try {
          const res = await fetch(url, { cache: 'no-cache' });
          if (res && res.ok) {
            await cache.put(url, res);
          }
        } catch (_err) {}
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((oldKey) => caches.delete(oldKey))
      )
    )
  );
  self.clients.claim();
});

// Network-First avec timeout court (3.5s) et fallback garanti sur le cache local (Mode Avion / Bateau).
// Tout le CSS (Tailwind compilé) et le JS sont désormais intégrés directement dans index.html.
self.addEventListener('fetch', (event) => {
  const reqUrl = event.request.url;

  if (
    event.request.method !== 'GET' ||
    reqUrl.includes('/rest/v1/') ||
    reqUrl.includes('/auth/v1/')
  ) {
    return;
  }

  const isNavigation =
    event.request.mode === 'navigate' ||
    event.request.destination === 'document';

  event.respondWith(
    (async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const networkResponse = await fetch(event.request, {
          cache: 'no-cache',
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (networkResponse && networkResponse.status === 200) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, networkResponse.clone());
          if (isNavigation) {
            await cache.put('./index.html', networkResponse.clone());
            await cache.put('./', networkResponse.clone());
          }
        }
        return networkResponse;
      } catch (_err) {
        const cachedExact = await caches.match(event.request, { ignoreSearch: true });
        if (cachedExact) return cachedExact;

        if (isNavigation) {
          const cachedIndex =
            (await caches.match('./index.html', { ignoreSearch: true })) ||
            (await caches.match('./', { ignoreSearch: true }));
          if (cachedIndex) return cachedIndex;
        }

        return new Response('Hors ligne', { status: 503, statusText: 'Offline' });
      }
    })()
  );
});
