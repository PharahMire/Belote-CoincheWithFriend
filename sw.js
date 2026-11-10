const CACHE_NAME = 'belote-coinche-pwa-v3';
const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.tailwindcss.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of APP_SHELL_ASSETS) {
        try {
          await cache.add(url);
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

// Network-First pour index.html afin d'avoir toujours la dernière version quand on est en ligne,
// et fallback immédiat sur le cache quand on est hors-ligne (Mode Avion / Bateau).
self.addEventListener('fetch', (event) => {
  const reqUrl = event.request.url;

  if (
    event.request.method !== 'GET' ||
    reqUrl.includes('/rest/v1/') ||
    reqUrl.includes('/auth/v1/')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request, { cache: 'no-cache' })
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const cloned = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, cloned);
          });
        }
        return networkResponse;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => cached || caches.match('./index.html'))
      )
  );
});
